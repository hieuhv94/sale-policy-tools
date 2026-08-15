import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  checkNewPassword,
  describePasswordProblems,
  hashPassword,
  hashSecretToken,
  signJwt,
  verifyPassword,
} from '@csbh/identity-core';
import { newSecretToken } from '@csbh/identity-core';
import { Db } from '../infra/db.js';
import { Mailer } from '../infra/mailer.js';
import { CONFIG } from '../infra/config.js';
import { getKeyPair } from '@csbh/http-kit';
import { AccountCache } from '../infra/account-cache.js';
import { VAI_TRO_CAP_TREN, type RoleValue } from '../admin/users.service.js';
import { randomBytes } from 'node:crypto';

type UserRow = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  password_hash: string;
  is_active: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  must_change_password: boolean;
  activated_at: Date | null;
  email_verified_at: Date | null;
  password_changed_at: Date;
};

export type TokenPair = { accessToken: string; refreshToken: string };

/**
 * Băm giả để so sánh khi tài khoản không tồn tại. Không có nó thì đăng nhập vào
 * tài khoản không tồn tại trả lời nhanh hơn hẳn tài khoản có thật, và thời gian
 * phản hồi trở thành cách dò xem địa chỉ email nào đang có trong hệ thống (AUTH-02).
 */
const DUMMY_HASH =
  'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' +
  Buffer.alloc(64, 7).toString('base64');

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly db: Db,
    private readonly accounts: AccountCache,
    private readonly mailer: Mailer,
  ) {}

  // --- Đăng nhập ------------------------------------------------------------

  async login(login: string, password: string) {
    const user = await this.db.one<UserRow>(
      `SELECT * FROM idn.app_user WHERE lower(username) = lower($1) OR lower(email) = lower($1)`,
      [login],
    );

    // Mọi nhánh hỏng đều trả về CÙNG một lỗi: sai mật khẩu, tài khoản không tồn
    // tại, tài khoản bị khoá, tài khoản bị vô hiệu hoá. Phân biệt ra là xác nhận
    // giúp người dò rằng địa chỉ đó có thật (AUTH-02).
    const deny = () => new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });

    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      throw deny();
    }
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      this.log.warn(`đăng nhập vào tài khoản đang bị khoá: ${user.id}`);
      throw deny();
    }
    if (!user.is_active) throw deny();

    if (!(await verifyPassword(password, user.password_hash))) {
      await this.registerFailure(user);
      throw deny();
    }

    await this.db.q(
      `UPDATE idn.app_user SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id],
    );
    await this.accounts.invalidate(user.id);

    const tokens = await this.issue(user);
    return {
      ...tokens,
      mustChangePassword: user.must_change_password,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    };
  }

  private async registerFailure(user: UserRow): Promise<void> {
    const next = user.failed_attempts + 1;
    const lock = next >= CONFIG.maxFailedAttempts;
    await this.db.q(
      `UPDATE idn.app_user
          SET failed_attempts = $2,
              locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END
        WHERE id = $1`,
      [user.id, lock ? 0 : next, lock, String(CONFIG.lockMinutes)],
    );
    if (lock) this.log.warn(`khoá tài khoản ${user.id} sau ${CONFIG.maxFailedAttempts} lần sai`);
  }

  // --- Phát hành và xoay vòng token ----------------------------------------

  private async issue(user: UserRow, familyId?: string): Promise<TokenPair> {
    const accessToken = signJwt(
      {
        sub: user.id,
        role: user.role,
        pat: user.password_changed_at.getTime(),
      },
      getKeyPair().privateKey,
      { issuer: CONFIG.issuer, audience: CONFIG.audUser, expiresInSec: CONFIG.accessTtlSec },
    );

    const raw = randomBytes(32).toString('base64url');
    const family = familyId ?? randomBytes(16).toString('hex');
    await this.db.q(
      `INSERT INTO idn.refresh_token (user_id, family_id, token_hash, expires_at)
       VALUES ($1, $2::uuid, $3, now() + ($4 || ' seconds')::interval)`,
      [user.id, toUuid(family), hashSecretToken(raw), String(CONFIG.refreshTtlSec)],
    );
    return { accessToken, refreshToken: `${family}.${raw}` };
  }

  async refresh(presented: string): Promise<TokenPair> {
    const dot = presented.indexOf('.');
    if (dot < 0) throw new UnauthorizedException({ code: 'REFRESH_INVALID' });
    const raw = presented.slice(dot + 1);

    // Kết quả đi RA khỏi transaction rồi mới ném lỗi.
    //
    // Ném từ bên trong `db.tx` sẽ kích hoạt ROLLBACK, và nhánh phát hiện dùng
    // lại token thì vừa phải GHI (thu hồi cả họ) vừa phải BÁO LỖI. Ném thẳng ở
    // trong khiến việc thu hồi bị hoàn tác trong im lặng: người gọi vẫn nhận 401
    // nên nhìn ngoài tưởng đã chặn, thực tế mọi token của họ đó vẫn sống.
    const outcome = await this.db.tx<
      { ok: true; tokens: TokenPair } | { ok: false; code: string }
    >(async (c) => {
      const found = await c.query<{
        id: string;
        user_id: string;
        family_id: string;
        used_at: Date | null;
        revoked_at: Date | null;
        expires_at: Date;
      }>(`SELECT * FROM idn.refresh_token WHERE token_hash = $1 FOR UPDATE`, [
        hashSecretToken(raw),
      ]);
      const row = found.rows[0];
      if (!row) return { ok: false, code: 'REFRESH_INVALID' };

      // DÙNG LẠI token đã xoay vòng: hoặc token bị đánh cắp và kẻ trộm dùng
      // trước, hoặc chính chủ dùng sau. Không phân biệt được ai là ai, nên thu
      // hồi CẢ HỌ token — cả hai bên phải đăng nhập lại (AUTH-04).
      if (row.used_at || row.revoked_at) {
        await c.query(
          `UPDATE idn.refresh_token SET revoked_at = now()
            WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id],
        );
        this.log.warn(`dùng lại refresh token — thu hồi họ ${row.family_id} của ${row.user_id}`);
        return { ok: false, code: 'REFRESH_REUSED' };
      }
      if (row.expires_at.getTime() <= Date.now()) {
        return { ok: false, code: 'REFRESH_EXPIRED' };
      }

      const users = await c.query<UserRow>(`SELECT * FROM idn.app_user WHERE id = $1`, [
        row.user_id,
      ]);
      const user = users.rows[0];
      if (!user || !user.is_active) return { ok: false, code: 'ACCOUNT_DISABLED' };

      await c.query(`UPDATE idn.refresh_token SET used_at = now() WHERE id = $1`, [row.id]);

      const nextRaw = randomBytes(32).toString('base64url');
      await c.query(
        `INSERT INTO idn.refresh_token (user_id, family_id, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
        [user.id, row.family_id, hashSecretToken(nextRaw), String(CONFIG.refreshTtlSec)],
      );

      const accessToken = signJwt(
        {
          sub: user.id,
          role: user.role,
          pat: user.password_changed_at.getTime(),
        },
        getKeyPair().privateKey,
        { issuer: CONFIG.issuer, audience: CONFIG.audUser, expiresInSec: CONFIG.accessTtlSec },
      );
      return {
        ok: true,
        tokens: { accessToken, refreshToken: `${fromUuid(row.family_id)}.${nextRaw}` },
      };
    });

    if (!outcome.ok) throw new UnauthorizedException({ code: outcome.code });
    return outcome.tokens;
  }

  async logout(presented: string): Promise<void> {
    const dot = presented.indexOf('.');
    const raw = dot < 0 ? presented : presented.slice(dot + 1);
    // Thu hồi cả họ chứ không riêng token đang cầm, nếu không thì token kế tiếp
    // đã xoay vòng ra vẫn dùng được sau khi bấm đăng xuất (AUTH-06).
    await this.db.q(
      `UPDATE idn.refresh_token SET revoked_at = now()
        WHERE family_id = (SELECT family_id FROM idn.refresh_token WHERE token_hash = $1)
          AND revoked_at IS NULL`,
      [hashSecretToken(raw)],
    );
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.db.q(
      `UPDATE idn.refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  // --- Đổi mật khẩu và kích hoạt -------------------------------------------

  async me(userId: string) {
    const u = await this.db.one<UserRow>(`SELECT * FROM idn.app_user WHERE id = $1`, [userId]);
    if (!u) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED' });
    // Hai liên kết cây đọc kèm luôn: màn hình "Thông tin của tôi" cần biết mình
    // đang thuộc ai, và tách ra thành một lời gọi thứ hai chỉ để lấy hai chuỗi
    // thì màn hình phải xử lý trạng thái tải của hai nguồn thay vì một.
    const lk = await this.db.one<{ approver: string | null; parent: string | null }>(
      `SELECT a.username AS approver, p.username AS parent
         FROM idn.app_user u
         LEFT JOIN idn.app_user a ON a.id = u.approver_user_id
         LEFT JOIN idn.user_node n ON n.user_id = u.id
         LEFT JOIN idn.app_user p ON p.id = n.parent_id
        WHERE u.id = $1`,
      [userId],
    );
    return {
      approverUsername: lk?.approver ?? null,
      parentUsername: lk?.parent ?? null,
      id: u.id,
      username: u.username,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      mustChangePassword: u.must_change_password,
      activatedAt: u.activated_at,
      emailVerifiedAt: u.email_verified_at,
    };
  }

  /**
   * Danh sách người có thể làm quản lý của CHÍNH người gọi.
   *
   * Đường riêng chứ không dùng `/admin/users`: đường kia là của Quản trị hệ
   * thống và trả về email của mọi tài khoản. Một TDV cần chọn Trưởng bộ phận thì
   * chỉ cần tên và tài khoản — không có lý do gì để họ cầm danh bạ email của cả
   * công ty.
   *
   * Trả về theo TỪNG LOẠI liên kết, vì TDV có hai loại còn kế toán có một.
   */
  async managers(userId: string) {
    const u = await this.db.one<UserRow>(`SELECT * FROM idn.app_user WHERE id = $1`, [userId]);
    if (!u) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED' });
    const role = u.role as RoleValue;

    const theoVaiTro = async (r: RoleValue | null) =>
      r === null
        ? []
        : this.db.q<{ username: string; fullName: string }>(
            `SELECT username, full_name AS "fullName" FROM idn.app_user
              WHERE role = $1::idn.user_role AND is_active AND id <> $2
              ORDER BY full_name`,
            [r, userId],
          );

    // `coApprover`/`coCapTren` KHÁC với "danh sách rỗng": rỗng có thể là vai trò
    // này không có ô đó, mà cũng có thể là chưa ai giữ chức. Giao diện cần phân
    // biệt — trường hợp sau phải hiện ô kèm lời giải thích, không được giấu ô đi.
    const vaiTroCha = VAI_TRO_CAP_TREN[role];
    return {
      role,
      // Chỉ TDV mới có Trưởng bộ phận quản lý — cùng luật với `resolveApprover`.
      coApprover: role === 'TDV',
      coCapTren: vaiTroCha !== null,
      approvers: role === 'TDV' ? await theoVaiTro('TBP') : [],
      parents: await theoVaiTro(vaiTroCha),
    };
  }

  /**
   * Người dùng tự đổi người quản lý của mình.
   *
   * Đây là một quyết định nghiệp vụ chứ không phải tiện ích giao diện, và hệ quả
   * phải nói thẳng: cây tổ chức quyết định hồ sơ chạy tới ai duyệt và ai nhìn
   * thấy dữ liệu của ai. Người dùng tự đổi được nghĩa là **hồ sơ đang chờ duyệt
   * chuyển sang hộp việc của người mới ngay lập tức** — định tuyến suy ra từ
   * `approver_user_id` chứ không lưu vào hồ sơ.
   *
   * Chỉ TDV và Kế toán dùng được. Vai trò khác gọi vào thì 400 chứ không im lặng
   * bỏ qua: im lặng thì giao diện của một vai trò khác có thể bày ra ô chọn mà
   * bấm Lưu không đổi gì, và không ai hiểu vì sao.
   */
  async updateManagers(
    userId: string,
    input: { approverUsername?: string | undefined; parentUsername?: string | undefined },
  ) {
    const u = await this.db.one<UserRow>(`SELECT * FROM idn.app_user WHERE id = $1`, [userId]);
    if (!u) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED' });
    const role = u.role as RoleValue;

    const tra = async (username: string, canRole: RoleValue, field: string) => {
      const r = await this.db.one<{ id: string; role: string }>(
        `SELECT id, role::text AS role FROM idn.app_user
          WHERE lower(username) = lower($1) AND is_active`,
        [username],
      );
      if (!r || r.role !== canRole) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          field,
          message: `Người quản lý phải là tài khoản ${canRole} đang hoạt động`,
        });
      }
      if (r.id === userId) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          field,
          message: 'Không đặt được chính mình làm người quản lý',
        });
      }
      return r.id;
    };

    if (input.approverUsername !== undefined) {
      if (role !== 'TDV') {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          field: 'approverUsername',
          message: 'Chỉ Trình dược viên mới có Trưởng bộ phận quản lý',
        });
      }
      const id = input.approverUsername === '' ? null : await tra(input.approverUsername, 'TBP', 'approverUsername');
      await this.db.q(`UPDATE idn.app_user SET approver_user_id = $2, updated_at = now() WHERE id = $1`, [userId, id]);
    }

    if (input.parentUsername !== undefined) {
      const canRole = VAI_TRO_CAP_TREN[role];
      if (canRole === null) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          field: 'parentUsername',
          message: 'Vai trò này không có người quản lý trong cây dữ liệu',
        });
      }
      const id = input.parentUsername === '' ? null : await tra(input.parentUsername, canRole, 'parentUsername');
      await this.db.q(
        `INSERT INTO idn.user_node (user_id, parent_id) VALUES ($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET parent_id = EXCLUDED.parent_id`,
        [userId, id],
      );
    }

    // Phạm vi dữ liệu vừa đổi — bỏ cache ngay, đừng để 60 giây TTL quyết định
    // lúc nào hồ sơ mới xuất hiện đúng chỗ.
    await this.accounts.invalidate(userId);
  }

  /**
   * Người dùng tự sửa thông tin của mình.
   *
   * Sửa được ĐÚNG họ tên, và đó không phải vì làm tắt: tài khoản chỉ có username,
   * email, họ tên và vai trò. Ba thứ còn lại đều không được tự đổi —
   *
   *   * **username** là định danh trong nhật ký kiểm toán. Nhật ký lưu `user_id`
   *     nên đổi tên không làm mất vết, nhưng mọi màn hình tra cứu đều hiện tên
   *     tài khoản, và một cái tên đổi được thì "ai làm việc này" mất tính đối
   *     chứng khi cần đối chiếu với biên bản giấy.
   *   * **email** là đường nhận liên kết đặt lại mật khẩu. Tự đổi được nghĩa là
   *     bất kỳ ai chiếm được phiên đăng nhập cũng chuyển được đường khôi phục
   *     sang hộp thư của mình, và chủ tài khoản mất quyền vĩnh viễn. Đổi email
   *     phải đi qua Quản trị hệ thống.
   *   * **vai trò** đổi được từ đây là tự nâng quyền — không cần bàn thêm.
   *
   * Trả về nguyên `me()` để màn hình không phải gọi lại một vòng nữa.
   */
  async updateProfile(userId: string, fullName: string) {
    const r = await this.db.q(
      `UPDATE idn.app_user SET full_name = $2, updated_at = now()
        WHERE id = $1 AND is_active RETURNING id`,
      [userId, fullName.trim()],
    );
    // Tài khoản vừa bị vô hiệu hoá giữa chừng: không có dòng nào đổi. Trả 401
    // như mọi đường khác trong tệp này thay vì "ok" cho một lần ghi không xảy ra.
    if (r.length === 0) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED' });
    return this.me(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const u = await this.db.one<UserRow>(`SELECT * FROM idn.app_user WHERE id = $1`, [userId]);
    if (!u) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED' });
    if (!(await verifyPassword(currentPassword, u.password_hash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    const problems = checkNewPassword(newPassword, { currentPlain: currentPassword });
    if (problems.length > 0) {
      throw new BadRequestException({
        code: 'PASSWORD_WEAK',
        problems,
        message: describePasswordProblems(problems),
      });
    }
    // Đổi mật khẩu qua đường này KÍCH HOẠT tài khoản nhưng KHÔNG đánh dấu email
    // đã xác nhận — người dùng chưa chứng minh hộp thư là có thật (ONB-14).
    await this.applyNewPassword(userId, newPassword, { verifyEmail: false });
    return { ok: true, emailVerified: false };
  }

  async activate(rawToken: string, newPassword: string) {
    await this.dungToken(rawToken, 'ACTIVATE', newPassword);
    return { ok: true, emailVerified: true };
  }

  // --- Quên mật khẩu --------------------------------------------------------

  /**
   * Phát hành liên kết đặt lại mật khẩu. CÔNG KHAI, nên có ba ràng buộc.
   *
   * 1. **Luôn trả về cùng một câu trả lời.** Báo "không tìm thấy tài khoản" là
   *    biến đường này thành máy dò xem tên tài khoản hay địa chỉ email nào có
   *    thật trong hệ thống — cùng lý do với `INVALID_CREDENTIALS` ở đăng nhập
   *    (AUTH-02).
   * 2. **Chặn gửi dồn.** Đã có liên kết còn hạn và chưa dùng thì không phát
   *    hành thêm. Thiếu chốt này thì bất kỳ ai cũng bơm được thư vào hộp thư
   *    của người khác, và giữa đống thư đó là một liên kết thật.
   * 3. **Chỉ thu hồi token CÙNG LOẠI.** Đụng vào token của thư mời thì người
   *    ngoài chỉ cần gọi lặp lại là vô hiệu hoá được mọi lời mời vừa gửi đi.
   */
  async forgotPassword(login: string) {
    const u = await this.db.one<{
      id: string;
      email: string;
      full_name: string;
      is_active: boolean;
    }>(
      `SELECT id, email, full_name, is_active FROM idn.app_user
        WHERE lower(username) = lower($1) OR lower(email) = lower($1)`,
      [login],
    );

    // Tài khoản bị vô hiệu hoá cũng không nhận thư: gửi đi là mời người ta đặt
    // mật khẩu cho một tài khoản không đăng nhập được.
    if (u && u.is_active && !(await this.vuaGuiLienKetDatLai(u.id))) {
      const token = newSecretToken();
      await this.db.tx(async (c) => {
        await c.query(
          `UPDATE idn.activation_token SET revoked_at = now()
            WHERE user_id = $1 AND purpose = 'RESET'
              AND used_at IS NULL AND revoked_at IS NULL`,
          [u.id],
        );
        await c.query(
          `INSERT INTO idn.activation_token (user_id, token_hash, expires_at, purpose)
           VALUES ($1,$2, now() + ($3 || ' hours')::interval, 'RESET')`,
          [u.id, token.hash, String(CONFIG.resetTtlHours)],
        );
      });
      // Nuốt lỗi gửi thư, và đây KHÔNG phải sự lười biếng.
      //
      // Ném ra thì tài khoản có thật + SMTP hỏng trả 500, còn tài khoản không
      // tồn tại vẫn trả 200 — và chênh lệch đó chính là thứ cả đường này dựng ra
      // để không có. Người dò chỉ cần làm SMTP nghẽn một nhịp là đọc được danh
      // sách tài khoản của công ty.
      try {
        await this.mailer.sendPasswordReset(
          u.email,
          u.full_name,
          `${CONFIG.webBaseUrl}/dat-lai-mat-khau?token=${encodeURIComponent(token.raw)}`,
        );
        this.log.log(`đã gửi liên kết đặt lại mật khẩu cho ${u.id}`);
      } catch (e) {
        this.log.error(`không gửi được liên kết đặt lại cho ${u.id}: ${String(e)}`);
      }
    }

    return { ok: true };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    await this.dungToken(rawToken, 'RESET', newPassword);
    return { ok: true };
  }

  private async vuaGuiLienKetDatLai(userId: string): Promise<boolean> {
    const gan = await this.db.one<{ id: string }>(
      `SELECT id FROM idn.activation_token
        WHERE user_id = $1 AND purpose = 'RESET'
          AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
          AND created_at > now() - ($2 || ' minutes')::interval`,
      [userId, String(CONFIG.resetThrottleMinutes)],
    );
    // `db.one()` trả `undefined` khi không có dòng, KHÔNG phải `null`
    // (`http-kit/src/db.ts:28`). So với `null` thì phép so luôn đúng, mọi lượt
    // đều bị coi là gửi dồn, và tính năng chết trong im lặng — không lỗi nào,
    // chỉ là không thư nào tới.
    return gan !== undefined;
  }

  // --- Dùng một token đặt mật khẩu -----------------------------------------

  /**
   * Kiểm token, đặt mật khẩu mới, đánh dấu đã dùng. Chung cho cả hai loại.
   *
   * `purpose` nằm trong ĐIỀU KIỆN TÌM chứ không kiểm sau khi tìm thấy: token sai
   * loại phải không phân biệt được với token không tồn tại. Trả `TOKEN_INVALID`
   * cho cái này và một mã khác cho cái kia là nói cho người thử biết họ đang
   * cầm một token thật, chỉ nộp nhầm cửa.
   */
  private async dungToken(rawToken: string, purpose: 'ACTIVATE' | 'RESET', newPassword: string) {
    // Token trong liên kết có thể mang tiền tố; phần sau dấu chấm mới là bí mật.
    const dot = rawToken.indexOf('.');
    const raw = dot < 0 ? rawToken : rawToken.slice(dot + 1);

    const row = await this.db.one<{
      id: string;
      user_id: string;
      used_at: Date | null;
      revoked_at: Date | null;
      expires_at: Date;
      password_hash: string;
    }>(
      `SELECT t.id, t.user_id, t.used_at, t.revoked_at, t.expires_at, u.password_hash
         FROM idn.activation_token t JOIN idn.app_user u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.purpose = $2`,
      [hashSecretToken(raw), purpose],
    );
    if (!row) throw new BadRequestException({ code: 'TOKEN_INVALID' });
    if (row.revoked_at) throw new BadRequestException({ code: 'TOKEN_REVOKED' });
    if (row.used_at) throw new BadRequestException({ code: 'TOKEN_USED' });
    if (row.expires_at.getTime() <= Date.now()) {
      throw new BadRequestException({ code: 'TOKEN_EXPIRED' });
    }

    const problems = checkNewPassword(newPassword);
    // Đặt lại đúng bằng mật khẩu đang dùng thì cả thao tác vô nghĩa (ONB-11).
    // Với tài khoản mới, `password_hash` là băm của một chuỗi ngẫu nhiên nên
    // nhánh này không bao giờ chạm tới — đúng như mong đợi.
    if (await verifyPassword(newPassword, row.password_hash)) problems.push('SAME_AS_CURRENT');
    if (problems.length > 0) {
      throw new BadRequestException({
        code: 'PASSWORD_WEAK',
        problems,
        message: describePasswordProblems(problems),
      });
    }

    await this.db.tx(async (c) => {
      await c.query(`UPDATE idn.activation_token SET used_at = now() WHERE id = $1`, [row.id]);
      // Thu hồi MỌI token đang treo của người này, cả hai loại: mật khẩu vừa
      // đổi thì mọi liên kết cũ đều là đường vào không còn ai kiểm soát.
      await c.query(
        `UPDATE idn.activation_token SET revoked_at = now()
          WHERE user_id = $1 AND id <> $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [row.user_id, row.id],
      );
    });
    // Đi qua được liên kết trong thư là chứng minh đọc được hộp thư đó — đúng
    // thứ `email_verified_at` ghi nhận (0004), không phụ thuộc loại token.
    await this.applyNewPassword(row.user_id, newPassword, { verifyEmail: true });
  }

  private async applyNewPassword(
    userId: string,
    newPassword: string,
    opt: { verifyEmail: boolean },
  ): Promise<void> {
    const hash = await hashPassword(newPassword);
    await this.db.q(
      `UPDATE idn.app_user
          SET password_hash = $2,
              must_change_password = false,
              password_changed_at = now(),
              activated_at = coalesce(activated_at, now()),
              email_verified_at = CASE WHEN $3 THEN coalesce(email_verified_at, now())
                                       ELSE email_verified_at END,
              failed_attempts = 0,
              locked_until = NULL,
              updated_at = now()
        WHERE id = $1`,
      [userId, hash, opt.verifyEmail],
    );
    // Đổi mật khẩu là đăng xuất mọi nơi. Nếu mật khẩu bị lộ thì đổi mật khẩu
    // phải cắt được phiên của kẻ đang dùng, không chỉ tạo thêm phiên mới (ONB-13).
    await this.revokeAllSessions(userId);
    await this.accounts.invalidate(userId);
  }
}

/** family_id trong CSDL là uuid; sinh ra 16 byte hex thì phải đưa về đúng dạng. */
const toUuid = (hex32: string): string =>
  `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;

const fromUuid = (u: string): string => u.replace(/-/g, '');
