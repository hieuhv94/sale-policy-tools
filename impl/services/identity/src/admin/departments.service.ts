/**
 * Bộ phận và người duyệt của bộ phận — YCNV muc 2.3.
 *
 * Trước P11a, hai bảng `idn.department` và `idn.department_approver` CHỈ được
 * điền bởi `scripts/seed.ts`; không có endpoint nào. Mà chính
 * `department_approver` quyết định hồ sơ của một TDV chạy tới Trưởng bộ phận
 * nào (`0003_identity.sql:113-114`). Hệ quả: một TBP tạo qua giao diện có tài
 * khoản đúng, quyền đúng, mà không nhận được hồ sơ nào — và không có chỗ nào
 * trong sản phẩm nói cho người quản trị biết vì sao.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PG, pgCode } from '@csbh/http-kit';
import { Db } from '../infra/db.js';

export type ApproverRow = {
  userId: string;
  username: string;
  fullName: string;
  isPrimary: boolean;
};

export type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  approvers: ApproverRow[];
};

@Injectable()
export class DepartmentsService {
  constructor(private readonly db: Db) {}

  /**
   * Trả bộ phận KÈM người duyệt trong một lời gọi.
   *
   * Màn hình tạo TDV cần đúng phép nối này: nó bày ra danh sách TBP để chọn, và
   * với mỗi TBP phải biết người đó duyệt bộ phận nào để đặt `department_id` cho
   * TDV. Tách làm hai endpoint thì giao diện phải tự ghép, và chỗ ghép đó là nơi
   * hai bên dễ hiểu khác nhau về "TBP không thuộc bộ phận nào".
   */
  async list(): Promise<DepartmentRow[]> {
    const rows = await this.db.q<{
      id: string;
      code: string;
      name: string;
      approvers: ApproverRow[] | null;
    }>(
      `SELECT d.id, d.code, d.name,
              coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'userId', u.id, 'username', u.username,
                    'fullName', u.full_name, 'isPrimary', da.is_primary)
                  ORDER BY da.is_primary DESC, u.username
                ) FILTER (WHERE u.id IS NOT NULL),
                '[]'::jsonb) AS approvers
         FROM idn.department d
         LEFT JOIN idn.department_approver da ON da.department_id = d.id
         LEFT JOIN idn.app_user u ON u.id = da.user_id
        GROUP BY d.id, d.code, d.name
        ORDER BY d.code`,
    );
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, approvers: r.approvers ?? [] }));
  }

  async create(code: string, name: string): Promise<DepartmentRow> {
    try {
      const r = await this.db.q<{ id: string }>(
        `INSERT INTO idn.department (code, name) VALUES ($1,$2) RETURNING id`,
        [code, name],
      );
      return { id: r[0]!.id, code, name, approvers: [] };
    } catch (e) {
      if (pgCode(e) === PG.uniqueViolation) {
        throw new ConflictException({ code: 'DEPARTMENT_DUPLICATE' });
      }
      throw e;
    }
  }

  /**
   * Gán một người làm người duyệt của bộ phận.
   *
   * CHẶN vai trò khác `TBP` ngay tại đây. Không chặn thì gán nhầm một TDV vào là
   * hồ sơ đi vào ngõ cụt: `scope_user_ids` vẫn định tuyến tới người đó, mà người
   * đó không có hành động `TBP_SIGN` nào để làm — hồ sơ đứng im cho tới khi quá
   * hạn, và không có thông báo nào chỉ ra nguyên nhân.
   */
  async addApprover(departmentId: string, userId: string, isPrimary: boolean) {
    const d = await this.db.one<{ id: string }>(`SELECT id FROM idn.department WHERE id = $1`, [
      departmentId,
    ]);
    if (!d) throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND' });

    const u = await this.db.one<{ role: string }>(
      `SELECT role::text AS role FROM idn.app_user WHERE id = $1`,
      [userId],
    );
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    if (u.role !== 'TBP') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'userId',
        message: 'Chỉ tài khoản Trưởng bộ phận mới làm người duyệt được',
      });
    }

    await this.db.q(
      `INSERT INTO idn.department_approver (department_id, user_id, is_primary)
       VALUES ($1,$2,$3)
       ON CONFLICT (department_id, user_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [departmentId, userId, isPrimary],
    );
    return { ok: true };
  }

  async removeApprover(departmentId: string, userId: string) {
    const r = await this.db.q(
      `DELETE FROM idn.department_approver
        WHERE department_id = $1 AND user_id = $2 RETURNING user_id`,
      [departmentId, userId],
    );
    if (r.length === 0) throw new NotFoundException({ code: 'APPROVER_NOT_FOUND' });
    return { ok: true };
  }
}
