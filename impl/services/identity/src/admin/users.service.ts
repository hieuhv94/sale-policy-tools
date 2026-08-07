/**
 * Tạo và quản lý tài khoản — YCNV muc 2.8. Chỉ vai trò QUAN_TRI gọi được;
 * hệ thống KHÔNG có màn hình đăng ký công khai.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword, newSecretToken } from '@csbh/identity-core';
import { Db } from '../infra/db.js';
import { CONFIG } from '../infra/config.js';
import { Mailer } from '../infra/mailer.js';
import { AccountCache } from '../infra/account-cache.js';

export const ROLE_VALUES = [
  'TDV',
  'TBP',
  'KE_TOAN',
  'SALE_ADMIN',
  'BAN_LANH_DAO',
  'QUAN_TRI',
] as const;
export type RoleValue = (typeof ROLE_VALUES)[number];

export type CreateUserInput = {
  email: string;
  username: string;
  fullName: string;
  role: RoleValue;
  defaultPassword: string;
  departmentCode?: string | undefined;
  parentUsername?: string | undefined;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly mailer: Mailer,
    private readonly accounts: AccountCache,
  ) {}

  async create(input: CreateUserInput, createdBy: string) {
    // Mật khẩu mặc định vẫn phải đủ dài — nó là mật khẩu dùng được thật, chỉ là
    // dùng được đúng một lần để vào đổi mật khẩu.
    if (input.defaultPassword.length < 8) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'defaultPassword',
        message: 'Mật khẩu mặc định phải có tối thiểu 8 ký tự',
      });
    }

    const dup = await this.db.one<{ id: string }>(
      `SELECT id FROM idn.app_user WHERE lower(email) = lower($1) OR lower(username) = lower($2)`,
      [input.email, input.username],
    );
    // Chặn TRƯỚC khi gửi thư: tạo hỏng mà thư đã bay đi thì người nhận có một
    // liên kết không kích hoạt được cái gì (ONB-03).
    if (dup) throw new ConflictException({ code: 'EMAIL_DUPLICATE' });

    let departmentId: string | null = null;
    if (input.departmentCode) {
      const d = await this.db.one<{ id: string }>(
        `SELECT id FROM idn.department WHERE code = $1`,
        [input.departmentCode],
      );
      if (!d) throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND' });
      departmentId = d.id;
    }

    let parentId: string | null = null;
    if (input.parentUsername) {
      const p = await this.db.one<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE lower(username) = lower($1)`,
        [input.parentUsername],
      );
      if (!p) throw new NotFoundException({ code: 'PARENT_NOT_FOUND' });
      parentId = p.id;
    }

    const hash = await hashPassword(input.defaultPassword);
    const token = newSecretToken();

    const created = await this.db.tx(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO idn.app_user
           (username, email, full_name, role, department_id, password_hash,
            must_change_password, created_by)
         VALUES ($1,$2,$3,$4::idn.user_role,$5,$6,true,$7)
         RETURNING id`,
        [
          input.username,
          input.email,
          input.fullName,
          input.role,
          departmentId,
          hash,
          createdBy,
        ],
      );
      const id = r.rows[0]!.id;
      await c.query(`INSERT INTO idn.user_node (user_id, parent_id) VALUES ($1,$2)`, [
        id,
        parentId,
      ]);
      await c.query(
        `INSERT INTO idn.activation_token (user_id, token_hash, expires_at, created_by)
         VALUES ($1,$2, now() + ($3 || ' hours')::interval, $4)`,
        [id, token.hash, String(CONFIG.activationTtlHours), createdBy],
      );
      return id;
    });

    await this.mailer.sendInvite(input.email, input.fullName, this.activationUrl(token.raw));

    return {
      id: created,
      username: input.username,
      email: input.email,
      role: input.role,
      status: 'CHO_KICH_HOAT',
    };
  }

  /** Gửi lại lời mời. Liên kết cũ chết ngay — chỉ liên kết mới nhất dùng được (ONB-10). */
  async resendInvite(userId: string, createdBy: string) {
    const u = await this.db.one<{ email: string; full_name: string; activated_at: Date | null }>(
      `SELECT email, full_name, activated_at FROM idn.app_user WHERE id = $1`,
      [userId],
    );
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    if (u.activated_at) throw new ConflictException({ code: 'ALREADY_ACTIVATED' });

    const token = newSecretToken();
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE idn.activation_token SET revoked_at = now()
          WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [userId],
      );
      await c.query(
        `INSERT INTO idn.activation_token (user_id, token_hash, expires_at, created_by)
         VALUES ($1,$2, now() + ($3 || ' hours')::interval, $4)`,
        [userId, token.hash, String(CONFIG.activationTtlHours), createdBy],
      );
    });
    await this.mailer.sendInvite(u.email, u.full_name, this.activationUrl(token.raw));
    return { ok: true };
  }

  async setActive(userId: string, isActive: boolean) {
    const r = await this.db.q(
      `UPDATE idn.app_user SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [userId, isActive],
    );
    if (r.length === 0) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    // Xoá cache ngay để không phải chờ hết TTL — 60 giây chỉ là trần cho thay
    // đổi đi vòng ngoài API (AUTH-07).
    await this.accounts.invalidate(userId);
    return { ok: true, isActive };
  }

  async list() {
    return this.db.q(
      `SELECT id, username, email, full_name AS "fullName", role::text AS role,
              is_active AS "isActive", must_change_password AS "mustChangePassword",
              activated_at AS "activatedAt", email_verified_at AS "emailVerifiedAt"
         FROM idn.app_user ORDER BY username`,
    );
  }

  private activationUrl = (raw: string) =>
    `${CONFIG.webBaseUrl}/kich-hoat?token=${encodeURIComponent(raw)}`;
}
