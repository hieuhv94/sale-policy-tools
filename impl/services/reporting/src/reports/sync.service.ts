/**
 * Dựng lại một dòng read-model từ nguồn.
 *
 * Sự kiện ở đây chỉ đóng vai trò TÍN HIỆU "hồ sơ X vừa đổi", không phải dữ liệu.
 * Hệ quả kéo theo là toàn bộ tính đúng đắn của read-model:
 *
 *   - **Giao lại không hại gì.** Outbox bảo đảm "ít nhất một lần"; đồng bộ hai
 *     lần cùng một hồ sơ cho ra đúng một dòng với đúng nội dung, vì mỗi lần đều
 *     ghi lại TOÀN BỘ dòng chứ không cộng dồn.
 *   - **Sai thứ tự không hại gì.** Sự kiện "đã ký" tới sau sự kiện "chờ kế toán"
 *     vẫn cho kết quả đúng, vì cả hai đều đọc trạng thái hiện tại.
 *
 * Đổi lại phải chấp nhận: một hồ sơ đổi bốn lần trong một giây thì bị đọc lại
 * bốn lần. Ở quy mô 50 người dùng, chi phí đó rẻ hơn nhiều so với việc phải giữ
 * đúng thứ tự và tính lũy kế.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../infra/db.js';
import { Clients, type CustomerSrc, type PolicySrc } from '../infra/clients.js';
import { norm, normAll } from './normalize.js';

export type SyncOutcome = 'synced' | 'deleted' | 'gone' | 'stale' | 'ignored';

@Injectable()
export class SyncService {
  private readonly log = new Logger(SyncService.name);

  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
  ) {}

  /** Vào từ hàng đợi. Trả về kết quả để consumer ghi log, không để điều khiển luồng. */
  async handle(e: { routingKey: string; payload: Record<string, unknown> }): Promise<SyncOutcome> {
    const p = e.payload;
    if (e.routingKey === 'policy.deleted') {
      const id = str(p['policyId']) ?? str(p['id']);
      if (!id) return 'ignored';
      await this.db.q(`DELETE FROM rpt.policy_row WHERE policy_id = $1`, [id]);
      return 'deleted';
    }

    if (e.routingKey.startsWith('customer.')) {
      const customerId = str(p['customerId']) ?? str(p['id']);
      if (!customerId) return 'ignored';
      return this.refreshCustomer(customerId);
    }

    const policyId = str(p['policyId']) ?? str(p['id']);
    if (!policyId) return 'ignored';
    return this.refreshPolicy(policyId);
  }

  /**
   * Đồng bộ một hồ sơ. Gọi được từ ngoài (test và lệnh nạp lại), không chỉ từ
   * hàng đợi.
   */
  async refreshPolicy(policyId: string): Promise<SyncOutcome> {
    const src = await this.clients.policy(policyId);
    if (!src) {
      // Hồ sơ đã bị xoá mà sự kiện `policy.deleted` chưa tới hoặc đã mất. Dọn
      // luôn ở đây: read-model giữ lại một hồ sơ không còn tồn tại thì báo cáo
      // đếm thừa, và không có sự kiện nào về sau để sửa.
      await this.db.q(`DELETE FROM rpt.policy_row WHERE policy_id = $1`, [policyId]);
      return 'gone';
    }

    const customer = await this.clients.customer(src.customer_id);
    if (!customer) {
      this.log.warn(`hồ sơ ${policyId} trỏ tới khách hàng ${src.customer_id} không còn`);
      return 'ignored';
    }
    return this.write(src, customer);
  }

  /**
   * Khách hàng đổi thì MỌI hồ sơ của khách đó phải đồng bộ lại — đổi địa chỉ
   * hoặc đổi TDV phụ trách làm sai cả tiêu chí lọc lẫn phạm vi dữ liệu.
   *
   * Đọc danh sách hồ sơ từ chính read-model chứ không hỏi policy: bảng này đã
   * có sẵn ánh xạ khách hàng → hồ sơ, và đây là một trong số ít chỗ read-model
   * tự trả lời được cho chính nó.
   */
  async refreshCustomer(customerId: string): Promise<SyncOutcome> {
    const rows = await this.db.q<{ policy_id: string }>(
      `SELECT policy_id FROM rpt.policy_row WHERE customer_id = $1`,
      [customerId],
    );
    for (const r of rows) await this.refreshPolicy(r.policy_id);
    return rows.length > 0 ? 'synced' : 'ignored';
  }

  private async write(src: PolicySrc, cus: CustomerSrc): Promise<SyncOutcome> {
    const lines = src.lines ?? [];
    const productIds = lines.map((l) => l.product_id);
    const groups = await this.clients.productGroups(productIds);
    const names = await this.clients.userNames([src.created_by ?? '', src.tdv_user_id ?? '']);

    const productNames = lines.map((l) => l.product_name_snap);
    const groupCodes = [...new Set(productIds.map((id) => groups[id]).filter(Boolean))] as string[];
    const totalNet = lines.reduce((a, l) => a + BigInt(l.net_price), 0n);
    // Hồ sơ chưa có dòng nào thì chiết khấu cao nhất là KHÔNG XÁC ĐỊNH, không
    // phải 0 — cột này lọt vào báo cáo và 0% đọc ra là "bán đúng giá niêm yết".
    const maxDiscount =
      lines.length === 0
        ? null
        : lines.reduce((a, l) => Math.max(a, Number(l.discount_rate)), 0).toFixed(2);

    // Phạm vi dữ liệu bám theo TDV phụ trách KHÁCH HÀNG, không theo cột
    // `tdv_user_id` chép sẵn trên hồ sơ: chuyển khách hàng sang TDV khác phải
    // đổi luôn ai nhìn thấy hồ sơ cũ của khách đó.
    const tdv = cus.tdvUserId || src.tdv_user_id || '';

    const r = await this.db.q<{ policy_id: string }>(
      `INSERT INTO rpt.policy_row (
         policy_id, code, version_no, status, pending_step, source,
         applied_date, approved_at, tbp_signed_at, created_at, submitted_at,
         returned_at, rejected_at, deactivated_at, sla_due_at, sla_started_at,
         customer_id, customer_code, customer_name, customer_name_norm,
         registered_address, address_norm, tax_id,
         requester_id, requester_name, tdv_user_id, tdv_name,
         tbp_user_id, ke_toan_user_id, sale_admin_user_id,
         product_codes, product_names, product_names_norm, product_group_codes,
         line_count, total_net, max_discount, src_row_version, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
               $31,$32,$33,$34,$35,$36,$37,$38, now())
       ON CONFLICT (policy_id) DO UPDATE SET
         code = EXCLUDED.code, version_no = EXCLUDED.version_no,
         status = EXCLUDED.status, pending_step = EXCLUDED.pending_step,
         source = EXCLUDED.source, applied_date = EXCLUDED.applied_date,
         approved_at = EXCLUDED.approved_at, tbp_signed_at = EXCLUDED.tbp_signed_at,
         created_at = EXCLUDED.created_at, submitted_at = EXCLUDED.submitted_at,
         returned_at = EXCLUDED.returned_at, rejected_at = EXCLUDED.rejected_at,
         deactivated_at = EXCLUDED.deactivated_at, sla_due_at = EXCLUDED.sla_due_at,
         sla_started_at = EXCLUDED.sla_started_at,
         customer_id = EXCLUDED.customer_id, customer_code = EXCLUDED.customer_code,
         customer_name = EXCLUDED.customer_name,
         customer_name_norm = EXCLUDED.customer_name_norm,
         registered_address = EXCLUDED.registered_address,
         address_norm = EXCLUDED.address_norm, tax_id = EXCLUDED.tax_id,
         requester_id = EXCLUDED.requester_id, requester_name = EXCLUDED.requester_name,
         tdv_user_id = EXCLUDED.tdv_user_id, tdv_name = EXCLUDED.tdv_name,
         tbp_user_id = EXCLUDED.tbp_user_id,
         ke_toan_user_id = EXCLUDED.ke_toan_user_id,
         sale_admin_user_id = EXCLUDED.sale_admin_user_id,
         product_codes = EXCLUDED.product_codes, product_names = EXCLUDED.product_names,
         product_names_norm = EXCLUDED.product_names_norm,
         product_group_codes = EXCLUDED.product_group_codes,
         line_count = EXCLUDED.line_count, total_net = EXCLUDED.total_net,
         max_discount = EXCLUDED.max_discount,
         src_row_version = EXCLUDED.src_row_version, synced_at = now()
       -- Bỏ qua bản GHI ĐÈ BẰNG DỮ LIỆU CŨ. Sự kiện giao lại lần hai đọc nguồn
       -- ở một thời điểm sớm hơn lần đồng bộ đang có thì row_version của nó nhỏ
       -- hơn, và ghi đè sẽ làm hồ sơ "lùi trạng thái" trong báo cáo.
       WHERE policy_row.src_row_version <= EXCLUDED.src_row_version
       RETURNING policy_id`,
      [
        src.id,
        src.code,
        src.version_no,
        src.status,
        src.pending_step,
        src.source ?? 'NORMAL',
        src.applied_date,
        src.effective_from,
        src.tbp_signed_at,
        src.created_at,
        src.submitted_at,
        src.returned_at,
        src.rejected_at,
        src.deactivated_at,
        src.sla_due_at,
        src.sla_started_at,
        cus.id,
        cus.code,
        cus.name,
        norm(cus.name),
        cus.registeredAddress,
        norm(cus.registeredAddress),
        cus.idNumber,
        src.created_by,
        names[src.created_by ?? ''] ?? null,
        tdv,
        names[tdv] ?? null,
        // Ba người được phân công (`0031`). Chép NGUYÊN từ hồ sơ, không suy lại:
        // báo cáo phải lọc được đúng như màn hình hồ sơ lọc, và hai phép suy
        // song song là hai phép sẽ có ngày lệch nhau.
        src.tbp_user_id ?? null,
        src.ke_toan_user_id ?? null,
        src.sale_admin_user_id ?? null,
        lines.map((l) => l.product_code_snap),
        productNames,
        normAll(productNames),
        groupCodes,
        lines.length,
        totalNet.toString(),
        maxDiscount,
        src.row_version,
      ],
    );
    return r.length > 0 ? 'synced' : 'stale';
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
