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
import { Db } from '../infra/db.js';
import { CONFIG } from '../infra/config.js';
import { getKeyPair } from '@csbh/http-kit';
import { AccountCache } from '../infra/account-cache.js';
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
    return {
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
        WHERE t.token_hash = $1`,
      [hashSecretToken(raw)],
    );
    if (!row) throw new BadRequestException({ code: 'TOKEN_INVALID' });
    if (row.revoked_at) throw new BadRequestException({ code: 'TOKEN_REVOKED' });
    if (row.used_at) throw new BadRequestException({ code: 'TOKEN_USED' });
    if (row.expires_at.getTime() <= Date.now()) {
      throw new BadRequestException({ code: 'TOKEN_EXPIRED' });
    }

    const problems = checkNewPassword(newPassword);
    // Mật khẩu mới trùng mật khẩu mặc định thì cả bước kích hoạt vô nghĩa (ONB-11).
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
      await c.query(
        `UPDATE idn.activation_token SET revoked_at = now()
          WHERE user_id = $1 AND id <> $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [row.user_id, row.id],
      );
    });
    await this.applyNewPassword(row.user_id, newPassword, { verifyEmail: true });
    return { ok: true, emailVerified: true };
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
