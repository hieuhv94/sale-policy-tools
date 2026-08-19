/**
 * API nội bộ của policy. `document` cần biết hồ sơ thuộc TDV nào để kiểm phạm
 * vi, và cần toàn bộ nội dung hồ sơ để dựng bản CSBH A4 và trộn hợp đồng.
 *
 * Trả về DỮ LIỆU THÔ, không định dạng: tiền vẫn là số nguyên đồng, tỷ lệ vẫn là
 * numeric. Định dạng theo bảng ánh xạ là việc của `document` (muc 8.2), và làm
 * sẵn ở đây thì hai service cùng định dạng tiền theo hai kiểu.
 */
import { Controller, Get, NotFoundException, Param, Post, Body } from '@nestjs/common';
import { oneOf, opt, ServiceOnly, str, validate } from '@csbh/http-kit';
import { Db } from './infra/db.js';

/**
 * Loại văn bản vừa sinh ra → tên hành động trong *Lịch sử* (`0052`, `0053`).
 *
 * BẢNG TRA chứ không phải một chuỗi `?:` nối nhau: bốn loại rồi, và mỗi lần
 * thêm một loại mà quên sửa nhánh cuối thì nó âm thầm rơi vào nhãn của loại
 * khác — một dòng lịch sử SAI còn tệ hơn không có dòng nào.
 */
const HANH_DONG_TAI: Record<string, string> = {
  HO_SO: 'TAI_HO_SO',
  HOP_DONG: 'TAI_HOP_DONG',
  BAN_SCAN: 'TAI_BAN_SCAN',
  TEP_DINH_KEM: 'TAI_TEP_DINH_KEM',
};

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
              effective_from, tdv_user_id,
              tbp_user_id, ke_toan_user_id, sale_admin_user_id,
              created_at, submitted_at, tbp_signed_at,
              tbp_signed_by, kt_l1_received_at, sa_handover_at, kt_l2_received_at,
              contract_issued_at, contract_issued_by, last_reason, row_version,
              pending_step::text AS pending_step, source::text AS source,
              created_by, returned_at, rejected_at, deactivated_at,
              sla_due_at, sla_started_at, reprint_requested_at
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
              over_threshold, note
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
   * `document` báo về: vừa sinh xong một văn bản của hồ sơ này cho ai đó (`0052`).
   *
   * Gộp HAI việc từng nằm hai chỗ, vì chúng luôn xảy ra cùng lúc và cùng lý do:
   *
   *   1. **Đóng dấu lần xuất hợp đồng** — hai cột `contract_issued_*`. Đây là
   *      dấu vết DUY NHẤT của việc xuất hợp đồng: không có bảng hợp đồng nào cả
   *      (muc 8.3). Cột nằm ở `pol` chứ không ở `doc` vì chúng thuộc về hồ sơ —
   *      mở hồ sơ ra là thấy ngay "đã xuất hợp đồng lúc nào, ai xuất".
   *   2. **Ghi một dòng LỊCH SỬ** khi có người TẢI XUỐNG (N-01, muc 10). Trước
   *      `0052` không đường tải nào để lại vết nào cả, nên câu "ai đã tải bản
   *      hợp đồng của khách hàng này" không trả lời được.
   *
   * HAI CỜ TÁCH RỜI, và tách là có chủ ý:
   *
   *   - `ghiLichSu=false` khi người dùng chỉ XEM trong phần mềm. Xem không phải
   *     tải, và một dòng lịch sử cho mỗi lần liếc màn hình thì dìm chết những
   *     dòng nói về bước duyệt — thứ mà lịch sử sinh ra để kể.
   *   - Dấu xuất hợp đồng thì đóng ở CẢ HAI đường. Xem hay tải thì máy chủ đều
   *     đã trộn xong bản hợp đồng đầy đủ và đưa nó tới mắt người ấy; câu hỏi của
   *     muc 8.3 là "hồ sơ này đã có hợp đồng chưa", không phải "ai giữ file".
   */
  @Post(':id/da-sinh-van-ban')
  async daSinhVanBan(@Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      loai: oneOf('HO_SO', 'HOP_DONG', 'BAN_SCAN', 'TEP_DINH_KEM'),
      actorId: str(36, 36),
      actorRole: str(1, 40),
      ghiLichSu: opt(oneOf('co', 'khong')),
    });

    const p = await this.db.one<{ status: string }>(
      `SELECT status::text AS status FROM pol.policy WHERE id = $1`,
      [id],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });

    if (b.loai === 'HOP_DONG') {
      await this.db.q(
        `UPDATE pol.policy SET contract_issued_at = now(), contract_issued_by = $2 WHERE id = $1`,
        [id, b.actorId],
      );
    }

    if (b.ghiLichSu !== 'khong') {
      /*
       * `from_status` NULL, `to_status` = trạng thái ĐANG CÓ.
       *
       * Đây không phải một bước chuyển — hồ sơ không đi đâu cả. Cột `to_status`
       * là NOT NULL nên phải điền gì đó, và điền trạng thái hiện tại là câu đúng
       * duy nhất: dòng lịch sử nói "lúc ấy hồ sơ đang ở đây, và người này lấy
       * văn bản ra". `from_status` để trống thì màn hình không vẽ mũi tên
       * chuyển trạng thái cho dòng này.
       *
       * KHOÁ DÒNG HỒ SƠ TRƯỚC KHI CẤP `seq`, và đây là chỗ bản đầu làm sai.
       *
       * `coalesce(max(seq), 0) + 1` nằm ngay trong câu INSERT nhìn như đã đủ an
       * toàn — nhưng `max(seq)` chỉ thấy dòng ĐÃ COMMIT. Năm lượt tải song song
       * cùng một hồ sơ thì cả năm đọc ra cùng một con số, và bốn lượt vỡ ở ràng
       * buộc `UNIQUE (policy_id, seq)` — người dùng nhận 500 cho một thao tác
       * đọc thuần tuý. Ca `DOC-20` bắt được đúng chuyện này.
       *
       * `FOR UPDATE` xếp chúng thành hàng. Khoá giữ trong đúng một lệnh INSERT
       * nên không cản bước duyệt nào: bước duyệt cũng khoá cùng dòng ấy, và
       * phần chậm của việc tải (Gotenberg dựng PDF) đã xong từ trước khi gọi
       * tới đây.
       *
       * Không dùng vòng thử lại: nó biến một phép xếp hàng tất định thành một
       * phép may rủi, và với năm lượt cùng lúc thì lượt cuối phải thử năm lần.
       */
      await this.db.tx(async (c) => {
        await c.query(`SELECT 1 FROM pol.policy WHERE id = $1 FOR UPDATE`, [id]);
        await c.query(
          `INSERT INTO pol.policy_event
             (policy_id, seq, from_status, to_status, action, actor_id, actor_role)
           VALUES ($1,
                   coalesce((SELECT max(seq) FROM pol.policy_event WHERE policy_id = $1), 0) + 1,
                   NULL, $2::pol.policy_status, $3, $4, $5)`,
          [id, p.status, HANH_DONG_TAI[b.loai], b.actorId, b.actorRole],
        );
      });
    }
    return { ok: true };
  }
}
