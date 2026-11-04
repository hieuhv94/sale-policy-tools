/**
 * `0241` — đăng nhập bằng tài khoản Google.
 *
 * Phần gọi ra Google (`GoogleClient`) bị thay bằng bản giả; MỌI phép kiểm (state,
 * cookie, nonce, hạn, `email_verified`, miền, ghép tài khoản, mã một lần) chạy
 * thật trên Postgres và Redis thật. Bản giả chỉ đúng chừng nào nó nói đúng hợp
 * đồng của bản thật — nên khối cuối chạy CHÍNH `GoogleClient` vào một máy HTTP
 * giả cục bộ và đòi nó gửi đúng tham số, đọc đúng phản hồi.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  CAU_HINH_GOOGLE,
  createTestAppWith,
  duongNoiBo,
  GoogleClient,
  kiemClaim,
  maCuaSo,
  type CauHinhGoogle,
} from '@csbh/identity/testing';
import {
  accessTokenFor,
  activationTokenFrom,
  cleanupTestUsers,
  http,
  login,
  mailpitFind,
  TEST_PREFIX,
  withAdminDb,
  boot,
} from './app.js';

const SEED_PW = 'Test@1234';
const MIEN = 'csbh.test';
const WEB = 'http://web.test';

const CFG: CauHinhGoogle = {
  bat: true,
  clientId: 'cid-0241.apps.googleusercontent.com',
  clientSecret: 'bi-mat-0241',
  hostedDomain: MIEN,
  authUrl: 'https://accounts.google.test/o/oauth2/v2/auth',
  tokenUrl: 'http://127.0.0.1:9/khong-dung',
  redirectUri: `${WEB}/api/auth/google/callback`,
  webBaseUrl: WEB,
};

type Claim = Record<string, unknown>;
/** Claim bản giả sẽ trả ở lượt `doiMa` kế tiếp — mỗi ca tự đặt. */
let claimKeTiep: ((nonce: string) => Claim) | Error = new Error('chưa đặt');
let nonceDaThay = '';
const goiDoiMa: { code: string; verifier: string }[] = [];
const gia = {
  async doiMa(code: string, verifier: string) {
    goiDoiMa.push({ code, verifier });
    if (claimKeTiep instanceof Error) throw claimKeTiep;
    return claimKeTiep(nonceDaThay);
  },
} satisfies Pick<GoogleClient, 'doiMa'>;

const claimHopLe =
  (email: string, them: Claim = {}) =>
  (nonce: string): Claim => ({
    iss: 'https://accounts.google.com',
    aud: CFG.clientId,
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce,
    email,
    email_verified: true,
    hd: MIEN,
    ...them,
  });

let app: INestApplication;
let tat: INestApplication;
let adminToken = '';
let n = 0;

/** Tài khoản mới tạo — CHƯA kích hoạt. */
async function taoNguoi(): Promise<{ id: string; username: string; email: string }> {
  const username = `${TEST_PREFIX}_gg${++n}`;
  const email = `${username}@${MIEN}`;
  const r = await (await http(app))
    .post('/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username, email, fullName: 'Nguoi dang nhap Google', role: 'TBP' })
    .expect(201);
  return { id: r.body.id as string, username, email };
}

async function nguoiDaKichHoat(matKhau: string) {
  const u = await taoNguoi();
  const token = activationTokenFrom((await mailpitFind(u.email))!.text);
  await (await http(app)).post('/auth/activate').send({ token, newPassword: matKhau }).expect(200);
  return u;
}

/** Lượt `start`: trả state · nonce · cookie đọc từ chính phản hồi. */
async function batDau(next = '/') {
  const r = await (await http(app)).get('/auth/google/start').query({ next });
  expect(r.status).toBe(302);
  const u = new URL(r.headers['location'] as string);
  const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('csbh_g_state='));
  nonceDaThay = u.searchParams.get('nonce') ?? '';
  return { url: u, state: u.searchParams.get('state')!, cookie: cookie ?? '', raw: r };
}

/** Lượt `callback` với cookie khớp state; trả địa chỉ chuyển hướng. */
async function goiVe(p: { state: string; cookieState?: string | null; code?: string; error?: string }) {
  const q: Record<string, string> = { state: p.state };
  if (p.code !== undefined) q['code'] = p.code;
  else if (!p.error) q['code'] = 'ma-uy-quyen';
  if (p.error) q['error'] = p.error;
  let req = (await http(app)).get('/auth/google/callback').query(q);
  const ck = p.cookieState === undefined ? p.state : p.cookieState;
  if (ck !== null) req = req.set('Cookie', `csbh_g_state=${ck}`);
  const r = await req;
  expect(r.status).toBe(302);
  return new URL(r.headers['location'] as string);
}

const loiCua = (u: URL) => u.searchParams.get('loi');
const maCua = (u: URL) => new URLSearchParams(u.hash.slice(1)).get('ma');

/** Trọn một lượt thành công tới tận mã một lần. */
async function luotTron(email: string, next = '/') {
  claimKeTiep = claimHopLe(email);
  const s = await batDau(next);
  return goiVe({ state: s.state });
}

const suKienTu = (moc: Date, action: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM idn.outbox
        WHERE payload->>'action' = $1 AND created_at >= $2 ORDER BY seq DESC LIMIT 1`,
      [action, moc],
    );
    return r.rows[0]?.payload;
  });

beforeAll(async () => {
  await cleanupTestUsers();
  app = await createTestAppWith([
    { provide: CAU_HINH_GOOGLE, useValue: CFG },
    { provide: GoogleClient, useValue: gia },
  ]);
  // App KHÔNG bật Google — đúng cấu hình mặc định của bộ kiểm.
  tat = await boot();
  adminToken = await accessTokenFor(app, 'admin01', SEED_PW);
});

afterAll(async () => {
  await app?.close();
  await tat?.close();
  await cleanupTestUsers();
});

beforeEach(() => {
  goiDoiMa.length = 0;
});

describe('`0241` bật/tắt', () => {
  it('`phuong-thuc` nói thật tính năng đang bật hay tắt', async () => {
    expect((await (await http(app)).get('/auth/phuong-thuc').expect(200)).body).toEqual({ google: true });
    expect((await (await http(tat)).get('/auth/phuong-thuc').expect(200)).body).toEqual({ google: false });
  });

  it('tắt thì `start` và `callback` đưa về màn hình đăng nhập kèm GOOGLE_LOGIN_DISABLED, exchange 404', async () => {
    for (const d of ['/auth/google/start', '/auth/google/callback?code=x&state=y']) {
      const r = await (await http(tat)).get(d);
      expect(r.status).toBe(302);
      expect(r.headers['location']).toMatch(/\?loi=GOOGLE_LOGIN_DISABLED$/);
    }
    const r = await (await http(tat)).post('/auth/google/exchange').send({ ma: 'x' });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('GOOGLE_LOGIN_DISABLED');
  });

  it('khai client id mà thiếu secret thì KHÔNG khởi động', async () => {
    const { docCauHinhGoogle } = await import('@csbh/identity/testing');
    expect(() => docCauHinhGoogle({ GOOGLE_CLIENT_ID: 'x' })).toThrow(/thiếu secret/);
    // Tắt mà khai sẵn đường dẫn tệp (như `env.mau`) thì không được đi đọc tệp.
    expect(docCauHinhGoogle({ GOOGLE_CLIENT_SECRET_FILE: '/khong/co/tep/nay' }).bat).toBe(false);
  });
});

describe('`0241` start', () => {
  it('302 sang Google với hộp chọn tài khoản, PKCE S256, miền Workspace và cookie state', async () => {
    const { url, state, cookie } = await batDau('/ho-so/abc');
    expect(`${url.origin}${url.pathname}`).toBe(CFG.authUrl);
    const q = url.searchParams;
    expect(q.get('client_id')).toBe(CFG.clientId);
    expect(q.get('redirect_uri')).toBe(CFG.redirectUri);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('prompt')).toBe('select_account');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('hd')).toBe(MIEN);
    expect(q.get('nonce')).toBeTruthy();
    expect(state.length).toBeGreaterThanOrEqual(43);
    expect(cookie).toContain(`csbh_g_state=${state}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/google/);
  });

  it('`next` chỉ nhận đường nội bộ — không có chuyển hướng mở', () => {
    expect(duongNoiBo('/ho-so/1')).toBe('/ho-so/1');
    for (const x of ['//evil.test', 'https://evil.test', '/\\evil.test', 'ho-so', undefined, 5, '/a\nb']) {
      expect(duongNoiBo(x), String(x)).toBe('/');
    }
  });
});

describe('`0241` callback — đường hỏng', () => {
  it('thiếu cookie · cookie lệch · state lạ → GOOGLE_STATE_INVALID, KHÔNG gọi Google', async () => {
    claimKeTiep = claimHopLe('khong-ai@csbh.test');
    const a = await batDau();
    expect(loiCua(await goiVe({ state: a.state, cookieState: null }))).toBe('GOOGLE_STATE_INVALID');
    const b = await batDau();
    expect(loiCua(await goiVe({ state: b.state, cookieState: 'khac' }))).toBe('GOOGLE_STATE_INVALID');
    expect(loiCua(await goiVe({ state: 'khong-co-that' }))).toBe('GOOGLE_STATE_INVALID');
    expect(goiDoiMa).toHaveLength(0);
  });

  it('state dùng MỘT lần — kể cả khi lượt đầu thành công', async () => {
    const u = await nguoiDaKichHoat('GoogleMot@2026xyz');
    claimKeTiep = claimHopLe(u.email);
    const s = await batDau();
    expect(maCua(await goiVe({ state: s.state }))).toBeTruthy();
    expect(loiCua(await goiVe({ state: s.state }))).toBe('GOOGLE_STATE_INVALID');
  });

  it('người dùng huỷ ở Google → GOOGLE_LOGIN_CANCELLED', async () => {
    const s = await batDau();
    expect(loiCua(await goiVe({ state: s.state, error: 'access_denied' }))).toBe('GOOGLE_LOGIN_CANCELLED');
  });

  it('PKCE: verifier gửi sang Google là cái sinh ra challenge ở lượt start', async () => {
    const { createHash } = await import('node:crypto');
    const u = await nguoiDaKichHoat('GooglePkce@2026xyz');
    claimKeTiep = claimHopLe(u.email);
    const s = await batDau();
    await goiVe({ state: s.state, code: 'ma-cua-google' });
    expect(goiDoiMa).toHaveLength(1);
    expect(goiDoiMa[0]!.code).toBe('ma-cua-google');
    expect(createHash('sha256').update(goiDoiMa[0]!.verifier).digest('base64url')).toBe(
      s.url.searchParams.get('code_challenge'),
    );
  });

  /*
   * Mọi nhánh hỏng của TÀI KHOẢN trả về CÙNG một mã (AUTH-02), nhưng nhật ký ghi
   * lý do thật — bảng này canh cả hai vế.
   */
  const CA_HONG: [string, (email: string, id: string) => Promise<Claim | ((n: string) => Claim)>, RegExp][] = [
    ['nonce không khớp', async (e) => () => ({ ...claimHopLe(e)('x'), nonce: 'nonce-khac' }), /nonce/],
    ['email chưa xác minh', async (e) => claimHopLe(e, { email_verified: false }), /chưa được Google xác minh/],
    ['email_verified là CHUỖI', async (e) => claimHopLe(e, { email_verified: 'true' }), /chưa được Google xác minh/],
    ['ngoài miền Workspace', async (e) => claimHopLe(e, { hd: 'gmail.com' }), /không thuộc miền/],
    ['không có hd', async (e) => claimHopLe(e, { hd: undefined }), /không thuộc miền/],
    ['token cấp cho phần mềm khác', async (e) => claimHopLe(e, { aud: 'khac.apps' }), /không cấp cho/],
    ['issuer lạ', async (e) => claimHopLe(e, { iss: 'https://evil.test' }), /issuer/],
    ['token hết hạn', async (e) => claimHopLe(e, { exp: Math.floor(Date.now() / 1000) - 5 }), /hết hạn/],
    ['email lạ', async () => claimHopLe(`khong-ai-${Date.now()}@${MIEN}`), /không có tài khoản/],
    [
      'tài khoản vô hiệu hoá',
      async (e, id) => {
        await withAdminDb((c) => c.query(`UPDATE idn.app_user SET is_active = false WHERE id = $1`, [id]));
        return claimHopLe(e);
      },
      /vô hiệu hoá/,
    ],
    [
      'tài khoản đang khoá tạm',
      async (e, id) => {
        await withAdminDb((c) =>
          c.query(`UPDATE idn.app_user SET locked_until = now() + interval '10 minutes' WHERE id = $1`, [id]),
        );
        return claimHopLe(e);
      },
      /khoá tạm/,
    ],
  ];

  for (const [ten, dung, lyDo] of CA_HONG) {
    it(`${ten} → GOOGLE_LOGIN_FAILED, nhật ký ghi lý do thật`, async () => {
      const u = await nguoiDaKichHoat('GoogleHong@2026xyz');
      const c = await dung(u.email, u.id);
      claimKeTiep = typeof c === 'function' ? c : () => c;
      const moc = new Date();
      const s = await batDau();
      const ve = await goiVe({ state: s.state });
      expect(loiCua(ve)).toBe('GOOGLE_LOGIN_FAILED');
      expect(maCua(ve)).toBeNull();
      const e = await suKienTu(moc, 'LOGIN_FAILED');
      expect(e, 'không có LOGIN_FAILED').toBeTruthy();
      expect(String(e!['reason'])).toMatch(lyDo);
    });
  }

  it('Google trả lỗi ở lượt đổi mã → GOOGLE_LOGIN_FAILED', async () => {
    claimKeTiep = new Error('google 500');
    const s = await batDau();
    expect(loiCua(await goiVe({ state: s.state }))).toBe('GOOGLE_LOGIN_FAILED');
  });
});

describe('`0241` thành công', () => {
  it('callback → #ma, exchange → phiên dùng được, cùng hình dạng với /auth/login', async () => {
    const pw = 'GoogleOk@2026xyz';
    const u = await nguoiDaKichHoat(pw);
    const moc = new Date();
    const ve = await luotTron(u.email.toUpperCase(), '/ho-so/abc');
    expect(`${ve.origin}${ve.pathname}`).toBe(`${WEB}/dang-nhap/google`);
    // Mã đi ở FRAGMENT, không ở query.
    expect(ve.search).toBe('');
    expect(new URLSearchParams(ve.hash.slice(1)).get('next')).toBe('/ho-so/abc');

    const r = await (await http(app)).post('/auth/google/exchange').send({ ma: maCua(ve) }).expect(200);
    // Đọc sự kiện TRƯỚC lượt đăng nhập mật khẩu dưới đây — lượt ấy ghi LOGIN_OK của nó.
    const e = await suKienTu(moc, 'LOGIN_OK');
    expect(e!['targetLabel']).toBe(u.username);
    expect(e!['reason']).toBe('Đăng nhập bằng Google');
    const mk = await login(app, u.username, pw);
    expect(Object.keys(r.body).sort()).toEqual(Object.keys(mk.body).sort());
    expect(Object.keys(r.body.user).sort()).toEqual(Object.keys(mk.body.user).sort());
    expect(r.body.user.id).toBe(u.id);
    expect(r.body.mustChangePassword).toBe(false);

    const me = await (await http(app)).get('/auth/me').set('Authorization', `Bearer ${r.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe(u.username);
  });

  it('mã một lần dùng đúng MỘT lần', async () => {
    const u = await nguoiDaKichHoat('GoogleHai@2026xyz');
    const ma = maCua(await luotTron(u.email));
    await (await http(app)).post('/auth/google/exchange').send({ ma }).expect(200);
    const r = await (await http(app)).post('/auth/google/exchange').send({ ma });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('GOOGLE_CODE_INVALID');
  });

  it('bị vô hiệu hoá giữa callback và exchange thì exchange từ chối', async () => {
    const u = await nguoiDaKichHoat('GoogleBa@2026xyz');
    const ma = maCua(await luotTron(u.email));
    await withAdminDb((c) => c.query(`UPDATE idn.app_user SET is_active = false WHERE id = $1`, [u.id]));
    const r = await (await http(app)).post('/auth/google/exchange').send({ ma });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('GOOGLE_CODE_INVALID');
  });

  it('tài khoản CHƯA kích hoạt: vào thẳng, coi như kích hoạt, thư mời bị thu hồi', async () => {
    const u = await taoNguoi();
    const tokenMoi = activationTokenFrom((await mailpitFind(u.email))!.text);
    const ma = maCua(await luotTron(u.email));
    expect(ma).toBeTruthy();
    const r = await (await http(app)).post('/auth/google/exchange').send({ ma }).expect(200);
    // Không bị đẩy sang màn hình buộc đổi mật khẩu — người này không có mật khẩu nào để đổi.
    expect(r.body.mustChangePassword).toBe(false);
    const row = await withAdminDb(async (c) =>
      (
        await c.query<{ a: Date | null; v: Date | null; m: boolean }>(
          `SELECT activated_at a, email_verified_at v, must_change_password m FROM idn.app_user WHERE id = $1`,
          [u.id],
        )
      ).rows[0],
    );
    expect(row!.a).not.toBeNull();
    expect(row!.v).not.toBeNull();
    expect(row!.m).toBe(false);
    const kh = await (await http(app)).post('/auth/activate').send({ token: tokenMoi, newPassword: 'Moi@2026xyzab' });
    expect(kh.status).toBe(400);
    expect(kh.body.code).toBe('TOKEN_REVOKED');
  });
});

describe('`0242` cửa sổ bật lên của lớp phủ hết phiên', () => {
  const ID = 'cuaSo_0242-abcdefgh';
  const cookieCua = (r: { headers: Record<string, unknown> }) =>
    ([] as string[]).concat((r.headers['set-cookie'] as string[]) ?? []).find((c) => c.startsWith('csbh_g_cua_so='));

  it('start nhận `cua_so` đúng hình dạng → cookie riêng; sai hình dạng → coi như lượt thường', async () => {
    const r = await (await http(app)).get('/auth/google/start').query({ cua_so: ID });
    expect(cookieCua(r)).toContain(`csbh_g_cua_so=${ID}`);
    expect(cookieCua(r)).toMatch(/HttpOnly/i);
    for (const xau of ['ngan', 'co dau cach 12345', '<script>alert(1)</script>', 'a'.repeat(65)]) {
      const x = await (await http(app)).get('/auth/google/start').query({ cua_so: xau });
      // Lượt thường XOÁ cookie cửa sổ — không để lượt sau thừa hưởng.
      expect(cookieCua(x), xau).toMatch(/^csbh_g_cua_so=;/);
    }
    expect(maCuaSo(ID)).toBe(ID);
  });

  it('thành công → fragment mang `cua_so`, và cả hai cookie bị xoá', async () => {
    const u = await nguoiDaKichHoat('GoogleCuaSo@2026xyz');
    claimKeTiep = claimHopLe(u.email);
    const s = await batDau();
    const r = await (await http(app))
      .get('/auth/google/callback')
      .query({ state: s.state, code: 'x' })
      .set('Cookie', `csbh_g_state=${s.state}; csbh_g_cua_so=${ID}`);
    const ve = new URL(r.headers['location'] as string);
    const f = new URLSearchParams(ve.hash.slice(1));
    expect(ve.pathname).toBe('/dang-nhap/google');
    expect(f.get('cua_so')).toBe(ID);
    expect(f.get('ma')).toBeTruthy();
    expect(cookieCua(r)).toMatch(/^csbh_g_cua_so=;/);
  });

  it('HỎNG — kể cả state hỏng — vẫn về trang nhận kết quả của cửa sổ con, không dựng cả phần mềm trong đó', async () => {
    const r = await (await http(app))
      .get('/auth/google/callback')
      .query({ state: 'khong-co', code: 'x' })
      .set('Cookie', `csbh_g_cua_so=${ID}`);
    const ve = new URL(r.headers['location'] as string);
    expect(ve.pathname).toBe('/dang-nhap/google');
    expect(Object.fromEntries(new URLSearchParams(ve.hash.slice(1)))).toEqual({ loi: 'GOOGLE_STATE_INVALID', cua_so: ID });
  });

  it('tắt tính năng ở cửa sổ con → lỗi về trang mẹ', async () => {
    const r = await (await http(tat)).get('/auth/google/start').query({ cua_so: ID });
    expect(new URL(r.headers['location'] as string).hash).toBe(`#loi=GOOGLE_LOGIN_DISABLED&cua_so=${ID}`);
  });
});

describe('`0241` kiemClaim — hàm thuần', () => {
  const k = { clientId: 'c', nonce: 'n', hostedDomain: 'x.test', nowSec: 1000 };
  const tot = { iss: 'accounts.google.com', aud: ['c'], exp: 2000, nonce: 'n', email: 'a@x.test', email_verified: true, hd: 'X.TEST' };
  it('nhận cả issuer không https và aud dạng mảng; miền không phân biệt hoa thường', () => {
    expect(kiemClaim(tot, k)).toEqual({ email: 'a@x.test' });
  });
  it('không khai miền thì không đòi hd', () => {
    expect(kiemClaim({ ...tot, hd: undefined }, { ...k, hostedDomain: null })).toEqual({ email: 'a@x.test' });
  });
});

describe('`0241` hợp đồng của GoogleClient thật (đối chiếu cho bản giả)', () => {
  let may: Server;
  let nhan: URLSearchParams | null = null;
  let traVe: { status: number; body: unknown } = { status: 200, body: {} };

  beforeAll(async () => {
    may = createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        nhan = new URLSearchParams(b);
        res.writeHead(traVe.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(traVe.body));
      });
    });
    await new Promise<void>((r) => may.listen(0, '127.0.0.1', r));
  });
  afterAll(() => new Promise<void>((r) => may.close(() => r())));

  const client = () =>
    new GoogleClient({ ...CFG, tokenUrl: `http://127.0.0.1:${(may.address() as AddressInfo).port}/token` });
  const idToken = (p: Claim) =>
    ['{"alg":"RS256"}', JSON.stringify(p), 'chu-ky'].map((x, i) => (i === 2 ? x : Buffer.from(x).toString('base64url'))).join('.');

  it('gửi đúng các tham số của endpoint token và đọc claim từ id_token', async () => {
    const claim = claimHopLe('a@csbh.test')('n-1');
    traVe = { status: 200, body: { access_token: 'at', expires_in: 3599, token_type: 'Bearer', id_token: idToken(claim) } };
    const c = await client().doiMa('ma-1', 'verifier-1');
    expect(c).toEqual(claim);
    expect(Object.fromEntries(nhan!)).toEqual({
      grant_type: 'authorization_code',
      code: 'ma-1',
      code_verifier: 'verifier-1',
      client_id: CFG.clientId,
      client_secret: CFG.clientSecret,
      redirect_uri: CFG.redirectUri,
    });
  });

  it('Google trả lỗi hoặc thiếu id_token thì NÉM, không trả claim rỗng', async () => {
    traVe = { status: 400, body: { error: 'invalid_grant' } };
    await expect(client().doiMa('x', 'y')).rejects.toThrow(/400/);
    traVe = { status: 200, body: { access_token: 'at' } };
    await expect(client().doiMa('x', 'y')).rejects.toThrow(/id_token/);
  });
});
