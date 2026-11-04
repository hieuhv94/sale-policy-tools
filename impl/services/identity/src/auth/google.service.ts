/**
 * Đăng nhập bằng tài khoản Google (`0241`, chốt 04/11).
 *
 * Luồng Authorization Code + PKCE chạy Ở MÁY CHỦ, không dùng thư viện JS của
 * Google: CSP của Caddy là `script-src 'self'`, và trình duyệt chỉ cần ĐIỀU
 * HƯỚNG sang `accounts.google.com` — điều hướng cấp trên cùng không chịu CSP.
 *
 *   start    -> sinh state · nonce · verifier, giữ ở Redis, buộc state vào
 *               trình duyệt bằng cookie, 302 sang Google (`prompt=select_account`
 *               là hộp "chọn tài khoản" người dùng thấy)
 *   callback -> đối chiếu cookie, đổi mã lấy id_token, kiểm claim, ghép tài
 *               khoản, sinh MÃ MỘT LẦN, 302 về `/dang-nhap/google#ma=…`
 *   exchange -> trình duyệt nộp mã một lần, nhận đúng phản hồi của `/auth/login`
 *
 * TOKEN KHÔNG BAO GIỜ NẰM TRÊN URL. Mã một lần sống 60 giây, dùng được một lần,
 * và đi trong FRAGMENT nên không vào log máy chủ lẫn header Referer.
 *
 * Ba luật nghiệp vụ, chốt khi hỏi:
 *  - Chỉ GHÉP với tài khoản đã có, theo email. Không có đăng ký công khai (`0004`).
 *  - Mọi nhánh hỏng trả MỘT mã cho người dùng (`GOOGLE_LOGIN_FAILED`), nhật ký
 *    ghi lý do thật — cùng lối đăng nhập mật khẩu (AUTH-02, `0091`).
 *  - Tài khoản chưa kích hoạt đăng nhập Google được và COI NHƯ KÍCH HOẠT: Google
 *    vừa chứng minh hộp thư ấy có thật, đúng thứ liên kết trong thư mời chứng minh.
 */
import { Inject, Injectable, Logger, NotFoundException, UnauthorizedException, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomBytes } from 'node:crypto';
import { REDIS_URL } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { SuKienIdn, suKienTaiKhoan } from '../infra/outbox.js';
import { AccountCache } from '../infra/account-cache.js';
import { AuthService } from './auth.service.js';
import { CAU_HINH_GOOGLE, type CauHinhGoogle } from './google.config.js';
import { GoogleClient, type ClaimGoogle } from './google.client.js';

export const COOKIE_STATE = 'csbh_g_state';
/** Mã nhận diện cửa sổ bật lên (`0242`) — xem `maCuaSo`. */
export const COOKIE_CUA_SO = 'csbh_g_cua_so';
export const STATE_TTL_SEC = 600;
export const MA_TTL_SEC = 60;
const KHOA_STATE = (s: string) => `idn:google:state:${s}`;
const KHOA_MA = (m: string) => `idn:google:ma:${m}`;

/** Hai issuer Google công bố cho cùng một hệ — đúng theo tài liệu OIDC của họ. */
const ISSUER = new Set(['https://accounts.google.com', 'accounts.google.com']);

type State = { verifier: string; nonce: string; next: string };

/**
 * Mã nhận diện của một lượt đăng nhập trong CỬA SỔ BẬT LÊN (`0242`).
 *
 * Lớp phủ hết phiên không được rời trang (rời là mất bản nhập dở, FE-33), nên nó
 * mở Google trong một cửa sổ con. Cửa sổ con quay về thì trao mã một lần cho
 * trang mẹ qua `BroadcastChannel` — kênh ấy MỌI tab cùng nguồn đều nghe được, nên
 * trang mẹ tự sinh một mã nhận diện và chỉ nhận tin mang đúng mã của mình.
 *
 * Chỉ nhận chuỗi an toàn cho URL: nó được dội lại nguyên văn vào fragment.
 * Sai hình dạng là coi như KHÔNG phải cửa sổ bật lên — đi đường thường.
 */
export function maCuaSo(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** Kết quả của một lượt callback — controller dựng 302 từ đây, không tự suy. */
export type KetQuaCallback = { ok: true; ma: string; next: string } | { ok: false; code: string };

/**
 * Chỉ nhận đường dẫn NỘI BỘ. `//evil.example` bắt đầu bằng `/` mà trình duyệt
 * đọc ra là một máy chủ khác — đó là một lỗ chuyển hướng mở.
 */
export function duongNoiBo(next: unknown): string {
  if (typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (/[\u0000-\u001f]/.test(next)) return '/';
  return next.slice(0, 500);
}

/**
 * Kiểm claim của id_token — hàm THUẦN, mọi nhánh trả lý do bằng chữ cho nhật ký.
 * Qua thì trả `{ email }`; hỏng thì trả `{ lyDo }`.
 */
export function kiemClaim(
  c: ClaimGoogle,
  k: { clientId: string; nonce: string; hostedDomain: string | null; nowSec: number },
): { email: string } | { lyDo: string } {
  if (typeof c.iss !== 'string' || !ISSUER.has(c.iss)) return { lyDo: 'Google: issuer lạ' };
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(k.clientId)) return { lyDo: 'Google: token không cấp cho phần mềm này' };
  if (typeof c.exp !== 'number' || c.exp <= k.nowSec) return { lyDo: 'Google: token đã hết hạn' };
  if (c.nonce !== k.nonce) return { lyDo: 'Google: nonce không khớp' };
  if (typeof c.email !== 'string' || c.email === '') return { lyDo: 'Google: không có email' };
  // `email_verified` phải là `true` THẬT — Google từng trả chuỗi "true" ở API cũ,
  // nhưng id_token của endpoint v2 trả boolean; chuỗi nghĩa là ai đó đang dựng tay.
  if (c.email_verified !== true) return { lyDo: 'Google: email chưa được Google xác minh' };
  if (k.hostedDomain) {
    if (typeof c.hd !== 'string' || c.hd.toLowerCase() !== k.hostedDomain) {
      return { lyDo: `Google: tài khoản không thuộc miền ${k.hostedDomain}` };
    }
  }
  return { email: c.email };
}

type UserRow = {
  id: string;
  username: string;
  is_active: boolean;
  locked_until: Date | null;
  activated_at: Date | null;
};

@Injectable()
export class GoogleService implements OnModuleDestroy {
  private readonly log = new Logger(GoogleService.name);
  private readonly redis = new Redis(REDIS_URL);

  constructor(
    @Inject(CAU_HINH_GOOGLE) private readonly cfg: CauHinhGoogle,
    private readonly google: GoogleClient,
    private readonly db: Db,
    private readonly auth: AuthService,
    private readonly accounts: AccountCache,
    private readonly suKien: SuKienIdn,
  ) {}

  get bat(): boolean {
    return this.cfg.bat;
  }

  get webBaseUrl(): string {
    return this.cfg.webBaseUrl;
  }

  /** Cookie mang `Secure` khi phần mềm chạy trên https. */
  get cookieSecure(): boolean {
    return this.cfg.webBaseUrl.startsWith('https://');
  }

  private batBuoc(): void {
    if (!this.cfg.bat) throw new NotFoundException({ code: 'GOOGLE_LOGIN_DISABLED' });
  }

  async batDau(next: unknown): Promise<{ state: string; url: string }> {
    this.batBuoc();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const v: State = { verifier, nonce, next: duongNoiBo(next) };
    await this.redis.set(KHOA_STATE(state), JSON.stringify(v), 'EX', STATE_TTL_SEC);

    const q = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      // Hộp chọn tài khoản LUÔN hiện, kể cả khi trình duyệt chỉ đăng nhập một
      // tài khoản Google: máy dùng chung là chuyện thường ở văn phòng, và vào
      // nhầm tài khoản người khác mà không được hỏi là lỗi khó thấy nhất.
      prompt: 'select_account',
    });
    // `hd` chỉ là GỢI Ý cho hộp chọn của Google; phép CHẶN thật nằm ở `kiemClaim`.
    if (this.cfg.hostedDomain) q.set('hd', this.cfg.hostedDomain);
    return { state, url: `${this.cfg.authUrl}?${q.toString()}` };
  }

  async goiVe(p: {
    code: string | undefined;
    state: string | undefined;
    error: string | undefined;
    cookieState: string | undefined;
  }): Promise<KetQuaCallback> {
    this.batBuoc();
    // State dùng MỘT lần, kể cả khi lượt này hỏng — không có lượt thử lại nào
    // trên cùng một state.
    const raw = p.state ? await this.redis.getdel(KHOA_STATE(p.state)) : null;
    // Người dùng bấm *Huỷ* ở hộp chọn của Google — không phải lỗi, chỉ là đổi ý.
    if (p.error === 'access_denied') return { ok: false, code: 'GOOGLE_LOGIN_CANCELLED' };
    if (p.error) return { ok: false, code: 'GOOGLE_LOGIN_FAILED' };
    /*
     * Cookie phải khớp state. Thiếu bước này là login-CSRF: kẻ xấu tự đăng nhập
     * Google bằng tài khoản CỦA HỌ, rồi lừa nạn nhân mở liên kết callback — nạn
     * nhân vào phần mềm dưới danh tính của kẻ xấu và nhập dữ liệu cho họ xem.
     */
    if (!raw || !p.state || !p.cookieState || p.cookieState !== p.state || !p.code) {
      return { ok: false, code: 'GOOGLE_STATE_INVALID' };
    }
    const st = JSON.parse(raw) as State;

    let claim: ClaimGoogle;
    try {
      claim = await this.google.doiMa(p.code, st.verifier);
    } catch (e) {
      this.log.warn(`đổi mã Google hỏng: ${(e as Error).message}`);
      return this.hong(null, null, 'Google: không đổi được mã ủy quyền');
    }
    const kq = kiemClaim(claim, {
      clientId: this.cfg.clientId,
      nonce: st.nonce,
      hostedDomain: this.cfg.hostedDomain,
      nowSec: Math.floor(Date.now() / 1000),
    });
    if ('lyDo' in kq) {
      return this.hong(null, typeof claim.email === 'string' ? claim.email : null, kq.lyDo);
    }

    const user = await this.db.one<UserRow>(
      `SELECT id, username, is_active, locked_until, activated_at
         FROM idn.app_user WHERE lower(email) = lower($1)`,
      [kq.email],
    );
    if (!user) return this.hong(null, kq.email, 'Google: không có tài khoản nào mang email này');
    if (!user.is_active) return this.hong(user, kq.email, 'Google: tài khoản đã bị vô hiệu hoá');
    // Khoá tạm áp cho MỌI đường vào, không riêng mật khẩu: Quản trị nhìn thấy
    // một tài khoản "đang khoá" thì nó phải đúng là không vào được.
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      return this.hong(user, kq.email, 'Google: tài khoản đang bị khoá tạm');
    }

    if (!user.activated_at) await this.kichHoat(user.id);

    const ma = randomBytes(32).toString('base64url');
    await this.redis.set(KHOA_MA(ma), user.id, 'EX', MA_TTL_SEC);
    return { ok: true, ma, next: st.next };
  }

  /** Nộp mã một lần, nhận phiên — CÙNG hình dạng với `/auth/login`. */
  async doiMaMotLan(ma: string) {
    this.batBuoc();
    const userId = await this.redis.getdel(KHOA_MA(ma));
    if (!userId) throw new UnauthorizedException({ code: 'GOOGLE_CODE_INVALID' });
    return this.auth.hoanTatDangNhapGoogle(userId);
  }

  /**
   * Coi như kích hoạt. `password_hash` GIỮ NGUYÊN — tài khoản mới vốn mang băm
   * của một chuỗi ngẫu nhiên (`matKhauKhoa`, `users.service`), nên không có mật
   * khẩu mặc định nào phải vô hiệu. Liên kết trong thư mời bị THU HỒI: nó là một
   * đường vào còn nằm trong hộp thư mà chủ tài khoản không còn cần tới. Muốn có
   * mật khẩu về sau thì đi *Quên mật khẩu*.
   */
  private async kichHoat(userId: string): Promise<void> {
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE idn.app_user
            SET activated_at = coalesce(activated_at, now()),
                email_verified_at = coalesce(email_verified_at, now()),
                must_change_password = false,
                updated_at = now()
          WHERE id = $1`,
        [userId],
      );
      await c.query(
        `UPDATE idn.activation_token SET revoked_at = now()
          WHERE user_id = $1 AND purpose = 'ACTIVATE' AND used_at IS NULL AND revoked_at IS NULL`,
        [userId],
      );
    });
    await this.accounts.invalidate(userId);
  }

  private async hong(user: UserRow | null, email: string | null, lyDo: string): Promise<KetQuaCallback> {
    await this.suKien.ngoai(
      'identity.login_failed',
      suKienTaiKhoan({
        action: 'LOGIN_FAILED',
        userId: user?.id ?? null,
        username: user?.username ?? email,
        outcome: 'FAILED',
        reason: lyDo,
      }),
    );
    return { ok: false, code: 'GOOGLE_LOGIN_FAILED' };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
