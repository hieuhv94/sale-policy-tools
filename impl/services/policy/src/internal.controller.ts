/**
 * API nội bộ của policy. `document` cần biết hồ sơ thuộc TDV nào để kiểm phạm
 * vi, và cần toàn bộ nội dung hồ sơ để dựng bản CSBH A4 và trộn hợp đồng.
 *
 * Trả về DỮ LIỆU THÔ, không định dạng: tiền vẫn là số nguyên đồng, tỷ lệ vẫn là
 * numeric. Định dạng theo bảng ánh xạ là việc của `document` (muc 8.2), và làm
 * sẵn ở đây thì hai service cùng định dạng tiền theo hai kiểu.
 */
import { Controller, Get, NotFoundException, Param, Post, Body } from '@nestjs/common';
import { ServiceOnly, str, validate } from '@csbh/http-kit';
import { Db } from './infra/db.js';

@ServiceOnly()
@Controller('internal/policies')
export class PolicyInternalController {
  constructor(private readonly db: Db) {}

  @Get(':id')
  async byId(@Param('id') id: string) {
    const p = await this.db.one<Record<string, unknown>>(
      // Nhóm cột thứ hai (từ `pending_step` trở đi) thêm ở P7b cho read-model
      // báo cáo: nó dựng lại toàn bộ dòng từ đây chứ không đọc schema pol.
      `SELECT id, code, customer_id, version_no, status::text AS status, applied_date,
              effective_from, tdv_user_id, created_at, submitted_at, tbp_signed_at,
              tbp_signed_by, kt_l1_received_at, sa_handover_at, kt_l2_received_at,
              contract_issued_at, contract_issued_by, last_reason, row_version,
              pending_step::text AS pending_step, source::text AS source,
              created_by, returned_at, rejected_at, deactivated_at,
              sla_due_at, sla_started_at
         FROM pol.policy WHERE id = $1`,
      [id],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });

    const lines = await this.db.q<Record<string, unknown>>(
      `SELECT product_id, product_code_snap, product_name_snap,
              company_price_snap::text AS company_price, wholesale_price::text AS wholesale_price,
              cpbh::text[] AS cpbh,
              cpbh_total::text AS cpbh_total, net_price::text AS net_price,
              discount_rate::text AS discount_rate, threshold_snap::text AS threshold_snap,
              over_threshold
         FROM pol.policy_line WHERE policy_id = $1 ORDER BY product_code_snap`,
      [id],
    );

    const attachments = await this.db.q<Record<string, unknown>>(
      `SELECT id, kind::text AS kind, file_name, object_key, size_bytes::text AS size_bytes
         FROM pol.policy_attachment WHERE policy_id = $1 ORDER BY uploaded_at`,
      [id],
    );

    return { ...p, lines, attachments };
  }

  /**
   * Ghi lại lần xuất hợp đồng gần nhất. `document` gọi sau khi đã sinh xong PDF.
   *
   * Hai cột này là DẤU VẾT duy nhất của việc xuất hợp đồng — không có bảng hợp
   * đồng nào cả (muc 8.3). Cột nằm ở pol chứ không ở doc vì chúng thuộc về hồ
   * sơ: mở hồ sơ ra là thấy ngay "đã xuất hợp đồng lúc nào, ai xuất".
   */
  @Post(':id/contract-issued')
  async contractIssued(@Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, { actorId: str(36, 36) });
    const r = await this.db.q<{ id: string }>(
      `UPDATE pol.policy SET contract_issued_at = now(), contract_issued_by = $2
        WHERE id = $1 RETURNING id`,
      [id, b.actorId],
    );
    if (r.length === 0) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    return { ok: true };
  }
}
