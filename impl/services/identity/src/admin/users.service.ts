/**
 * Tạo và quản lý tài khoản — YCNV muc 2.8. Chỉ vai trò QUAN_TRI gọi được;
 * hệ thống KHÔNG có màn hình đăng ký công khai.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword, newSecretToken } from '@csbh/identity-core';
import { paged, type Page } from '@csbh/http-kit';
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

export type UpdateUserInput = {
  fullName?: string | undefined;
  /** Chuỗi rỗng = gỡ khỏi bộ phận. `undefined` = không đụng tới. */
  departmentCode?: string | undefined;
  /** Chuỗi rỗng = gỡ cấp trên. `undefined` = không đụng tới. */
  parentUsername?: string | undefined;
};

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

  /**
   * Sửa tài khoản đã tạo. CỐ Ý không cho đổi `role`.
   *
   * Đổi vai trò làm lệch cây phân quyền và làm hồ sơ đang dở mắc kẹt giữa luồng:
   * một hồ sơ đang chờ `CHO_TBP_DUYET` mà người duyệt vừa thành Kế toán thì
   * không ai còn hành động nào để đi tiếp, và máy trạng thái không có đường lùi.
   * Muốn đổi thì vô hiệu hoá tài khoản cũ và tạo tài khoản mới.
   */
  async update(userId: string, input: UpdateUserInput) {
    const cur = await this.db.one<{ id: string }>(`SELECT id FROM idn.app_user WHERE id = $1`, [
      userId,
    ]);
    if (!cur) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    // `undefined` = không đụng tới; chuỗi rỗng = gỡ liên kết. Gộp hai thứ đó làm
    // một thì không bao giờ gỡ được cấp trên của một người đã gán nhầm.
    let departmentId: string | null | undefined;
    if (input.departmentCode !== undefined) {
      if (input.departmentCode === '') departmentId = null;
      else {
        const d = await this.db.one<{ id: string }>(
          `SELECT id FROM idn.department WHERE code = $1`,
          [input.departmentCode],
        );
        if (!d) throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND' });
        departmentId = d.id;
      }
    }

    let parentId: string | null | undefined;
    if (input.parentUsername !== undefined) {
      if (input.parentUsername === '') parentId = null;
      else {
        const p = await this.db.one<{ id: string }>(
          `SELECT id FROM idn.app_user WHERE lower(username) = lower($1)`,
          [input.parentUsername],
        );
        if (!p) throw new NotFoundException({ code: 'PARENT_NOT_FOUND' });
        if (p.id === userId) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            field: 'parentUsername',
            message: 'Không đặt được chính mình làm cấp trên',
          });
        }
        parentId = p.id;
      }
    }

    await this.db.tx(async (c) => {
      if (input.fullName !== undefined || departmentId !== undefined) {
        await c.query(
          `UPDATE idn.app_user
              SET full_name = coalesce($2, full_name),
                  department_id = CASE WHEN $4 THEN $3 ELSE department_id END,
                  updated_at = now()
            WHERE id = $1`,
          [userId, input.fullName ?? null, departmentId ?? null, departmentId !== undefined],
        );
      }
      if (parentId !== undefined) {
        // `user_node` có một dòng cho MỌI người dùng (create() luôn chèn), nên
        // đây là UPDATE chứ không phải upsert — nhưng vẫn phòng dòng thiếu.
        await c.query(
          `INSERT INTO idn.user_node (user_id, parent_id) VALUES ($1,$2)
           ON CONFLICT (user_id) DO UPDATE SET parent_id = EXCLUDED.parent_id`,
          [userId, parentId],
        );
      }
    });

    // Phạm vi dữ liệu suy ra từ cây tổ chức, mà cây vừa đổi — cache tài khoản
    // phải bỏ ngay, không chờ hết TTL 60 giây.
    await this.accounts.invalidate(userId);
    return { ok: true };
  }

  /**
   * Danh sách TDV mà người gọi được phép giao khách hàng cho.
   *
   * Sale Admin cần nó để đổi TDV phụ trách (`doiTdvPhuTrach`), mà họ KHÔNG có
   * quyền trên nhóm route quản trị người dùng. Nguồn thay thế duy nhất trước đây
   * là `byHandler` của báo cáo tiến độ — nhưng nó chỉ liệt kê TDV **đã có hồ sơ**,
   * nên một TDV mới tuyển không bao giờ xuất hiện và không ai giao khách được
   * cho họ.
   *
   * Phạm vi suy từ cây tổ chức, không cấu hình tay: Sale Admin thấy TDV thuộc
   * nhánh của mình. `QUAN_TRI` có phạm vi RỖNG theo thiết kế
   * (`0003_identity.sql:104`) nên phải xử lý riêng — họ quản trị tài khoản nên
   * thấy toàn bộ.
   */
  async assignableTdv(me: { id: string; role: string }) {
    if (me.role === 'QUAN_TRI') {
      return this.db.q(
        `SELECT id, username, full_name AS "fullName" FROM idn.app_user
          WHERE role = 'TDV' AND is_active ORDER BY full_name`,
      );
    }
    return this.db.q(
      `SELECT u.id, u.username, u.full_name AS "fullName"
         FROM idn.app_user u
        WHERE u.role = 'TDV' AND u.is_active
          AND u.id IN (SELECT user_id FROM idn.scope_user_ids($1))
        ORDER BY u.full_name`,
      [me.id],
    );
  }

  /**
   * `departmentCode` và `parentUsername` phải có ở đây, không chỉ ở lúc tạo:
   * biểu mẫu sửa mở ra là phải thấy giá trị đang có. Thiếu hai cột này thì màn
   * hình quản trị hiện ô trống và người dùng tưởng chưa gán gì.
   */
  async list(page: Page) {
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT u.id, u.username, u.email, u.full_name AS "fullName", u.role::text AS role,
              u.is_active AS "isActive", u.must_change_password AS "mustChangePassword",
              u.activated_at AS "activatedAt", u.email_verified_at AS "emailVerifiedAt",
              d.code AS "departmentCode", d.name AS "departmentName",
              p.username AS "parentUsername",
              count(*) OVER() AS total_count
         FROM idn.app_user u
         LEFT JOIN idn.department d ON d.id = u.department_id
         LEFT JOIN idn.user_node n ON n.user_id = u.id
         LEFT JOIN idn.app_user p ON p.id = n.parent_id
        ORDER BY u.username
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset],
    );
    return paged(rows, page);
  }

  private activationUrl = (raw: string) =>
    `${CONFIG.webBaseUrl}/kich-hoat?token=${encodeURIComponent(raw)}`;
}
