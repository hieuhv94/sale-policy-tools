/**
 * Danh sách hồ sơ đã lọc và ba báo cáo tổng hợp (muc 9.2).
 *
 * Mọi truy vấn ở đây đều đọc `rpt.policy_row` và đều bắt đầu bằng cùng một
 * mệnh đề phạm vi dựng ở `filter.ts` — kể cả các báo cáo tổng hợp. Báo cáo đếm
 * theo trạng thái mà quên phạm vi thì TDV đọc ra tổng số hồ sơ toàn công ty:
 * không lộ nội dung hồ sơ nào, nhưng vẫn là lộ dữ liệu.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ScopeClient } from '../infra/scope.client.js';
import { build, type Filter } from './filter.js';

export const LIST_LIMIT_MAX = 200;

/** Cột trả về cho màn hình danh sách, và cũng là thứ tự cột của file Excel. */
export const LIST_COLUMNS = `
  policy_id AS "policyId", code, version_no AS "versionNo", status,
  pending_step AS "pendingStep", source,
  applied_date AS "appliedDate", approved_at AS "approvedAt",
  customer_code AS "customerCode", customer_name AS "customerName",
  registered_address AS "registeredAddress", tax_id AS "taxId",
  province_code AS "provinceCode", hospital_code AS "hospitalCode",
  channel_code AS "channelCode",
  requester_name AS "requesterName", tdv_name AS "tdvName",
  tdv_user_id AS "tdvUserId", requester_id AS "requesterId",
  line_count AS "lineCount", total_net AS "totalNet",
  max_discount AS "maxDiscount", product_names AS "productNames",
  product_group_codes AS "productGroupCodes",
  created_at AS "createdAt", synced_at AS "syncedAt"`;

export type Cursor = { createdAt: string; policyId: string };

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: Db,
    private readonly scope: ScopeClient,
  ) {}

  /**
   * Phân trang bằng CON TRỎ, không bằng `OFFSET` (RPT-13).
   *
   * Danh sách sắp giảm dần theo thời gian tạo, nên hồ sơ mới chèn vào ĐẦU danh
   * sách. Với `OFFSET 50`, một hồ sơ mới tạo giữa lúc người dùng bấm sang trang
   * 2 đẩy toàn bộ danh sách xuống một dòng: dòng thứ 50 của trang 1 hiện lại ở
   * đầu trang 2, và một dòng khác biến mất khỏi cả hai trang. Không có thông báo
   * lỗi nào — người dùng chỉ thấy một hồ sơ lặp và không biết mình đã bỏ sót gì.
   *
   * Con trỏ `(created_at, policy_id)` neo vào DỮ LIỆU chứ không vào vị trí, nên
   * chèn thêm bao nhiêu dòng ở trên cũng không xê dịch trang sau. `policy_id`
   * là thành phần thứ hai để hai hồ sơ tạo trong cùng một mili-giây vẫn có thứ
   * tự tất định.
   */
  async list(me: AuthUser, filter: Filter, opts: { limit: number; cursor?: string | undefined }) {
    if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > LIST_LIMIT_MAX) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'limit',
        message: `limit phải là số nguyên trong khoảng 1..${LIST_LIMIT_MAX}`,
      });
    }
    const ids = await this.scope.userIdsFor(me);
    const { where, params } = build(filter, ids);

    let cursorSql = '';
    if (opts.cursor) {
      const cur = decodeCursor(opts.cursor);
      params.push(cur.createdAt, cur.policyId);
      cursorSql = ` AND (created_at, policy_id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }

    params.push(opts.limit + 1);
    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT ${LIST_COLUMNS}
         FROM rpt.policy_row
        WHERE ${where}${cursorSql}
        ORDER BY created_at DESC, policy_id DESC
        LIMIT $${params.length}`,
      params,
    );

    // Lấy dư MỘT dòng để biết còn trang sau hay không, thay vì đếm tổng số dòng
    // trong cùng truy vấn: `count(*) OVER()` buộc quét hết tập kết quả, và ở
    // màn hình phân trang bằng con trỏ thì không ai cần con số đó để bấm tiếp.
    const hasMore = rows.length > opts.limit;
    const items = hasMore ? rows.slice(0, opts.limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      limit: opts.limit,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              createdAt: new Date(last['createdAt'] as string).toISOString(),
              policyId: last['policyId'] as string,
            })
          : null,
    };
  }

  /** Tổng số hồ sơ khớp bộ lọc — hỏi riêng vì màn hình chỉ cần nó khi cần. */
  async count(me: AuthUser, filter: Filter): Promise<number> {
    const ids = await this.scope.userIdsFor(me);
    const { where, params } = build(filter, ids);
    const r = await this.db.one<{ n: string }>(
      `SELECT count(*)::text AS n FROM rpt.policy_row WHERE ${where}`,
      params,
    );
    return Number(r?.n ?? 0);
  }

  /** Toàn bộ tập đã lọc, để xuất Excel. Không phân trang — người gọi tự giới hạn. */
  async all(scopeIds: string[], filter: Filter, cap: number): Promise<Record<string, unknown>[]> {
    const { where, params } = build(filter, scopeIds);
    params.push(cap);
    return this.db.q<Record<string, unknown>>(
      `SELECT ${LIST_COLUMNS}
         FROM rpt.policy_row
        WHERE ${where}
        ORDER BY created_at DESC, policy_id DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  /**
   * Báo cáo TIẾN ĐỘ: đếm theo trạng thái, theo bước đang chờ, theo người xử lý
   * (RPT-10).
   *
   * "Bước đang chờ" không đọc thẳng `pending_step`: cột đó chỉ có giá trị khi hồ
   * sơ đã QUÁ HẠN — nó sinh ra để hồ sơ quá hạn còn biết đường đi tiếp đúng
   * nhánh cũ (§4). Hồ sơ đang chờ bình thường thì bước suy ra từ trạng thái.
   */
  async progress(me: AuthUser, filter: Filter) {
    const ids = await this.scope.userIdsFor(me);
    const { where, params } = build(filter, ids);

    const byStatus = await this.db.q<{ k: string; n: string }>(
      `SELECT status AS k, count(*)::text AS n FROM rpt.policy_row
        WHERE ${where} GROUP BY status ORDER BY count(*) DESC`,
      params,
    );
    const byStep = await this.db.q<{ k: string; n: string }>(
      `SELECT coalesce(pending_step, ${STEP_FROM_STATUS}) AS k, count(*)::text AS n
         FROM rpt.policy_row
        WHERE ${where} AND (pending_step IS NOT NULL OR ${STEP_FROM_STATUS} IS NOT NULL)
        GROUP BY 1 ORDER BY count(*) DESC`,
      params,
    );
    const byTdv = await this.db.q<{ k: string; name: string | null; n: string }>(
      `SELECT tdv_user_id::text AS k, max(tdv_name) AS name, count(*)::text AS n
         FROM rpt.policy_row
        WHERE ${where} GROUP BY tdv_user_id ORDER BY count(*) DESC`,
      params,
    );

    return {
      total: byStatus.reduce((a, r) => a + Number(r.n), 0),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.k, Number(r.n)])),
      byPendingStep: Object.fromEntries(byStep.map((r) => [r.k, Number(r.n)])),
      byHandler: byTdv.map((r) => ({ userId: r.k, name: r.name, count: Number(r.n) })),
    };
  }

  /**
   * Báo cáo TỶ LỆ TRẢ LẠI (RPT-11).
   *
   * Hồ sơ *Từ chối* ĐƯỢC TÍNH VÀO. Bỏ nó ra là làm đẹp số liệu bằng cách giấu
   * đúng những hồ sơ hỏng nặng nhất — một hồ sơ bị từ chối hẳn phản ánh vấn đề
   * lớn hơn một hồ sơ bị trả lại rồi sửa xong.
   *
   * Mẫu số là mọi hồ sơ ĐÃ TỪNG GỬI DUYỆT. Hồ sơ còn nằm ở Nháp chưa qua tay ai
   * thì không có cơ hội bị trả lại, đưa vào mẫu số chỉ làm loãng tỷ lệ.
   */
  async returnRate(me: AuthUser, filter: Filter) {
    const ids = await this.scope.userIdsFor(me);
    const { where, params } = build(filter, ids);
    const r = await this.db.one<{
      submitted: string;
      returned: string;
      rejected: string;
      either: string;
    }>(
      `SELECT count(*) FILTER (WHERE submitted_at IS NOT NULL)::text AS submitted,
              count(*) FILTER (WHERE returned_at IS NOT NULL)::text AS returned,
              count(*) FILTER (WHERE status = 'TU_CHOI')::text AS rejected,
              count(*) FILTER (WHERE returned_at IS NOT NULL OR status = 'TU_CHOI')::text AS either
         FROM rpt.policy_row WHERE ${where}`,
      params,
    );
    const submitted = Number(r?.submitted ?? 0);
    const either = Number(r?.either ?? 0);
    return {
      submitted,
      returned: Number(r?.returned ?? 0),
      rejected: Number(r?.rejected ?? 0),
      returnedOrRejected: either,
      // Làm tròn hai chữ số như mọi tỷ lệ khác trong hệ (muc 7).
      rate: submitted === 0 ? 0 : Number(((either / submitted) * 100).toFixed(2)),
    };
  }

  /**
   * Báo cáo SLA (RPT-12) — LOẠI TRỪ nhóm `LEGACY`.
   *
   * Dữ liệu CSBH cũ nhập từ Excel không đi qua luồng duyệt nào, nên nó không có
   * mốc bắt đầu chờ. Để lẫn vào thì mọi con số SLA đều sai theo hướng đẹp lên,
   * và sai càng nhiều khi càng nhập nhiều dữ liệu cũ. Loại ở đây, một chỗ, chứ
   * không trông vào việc người xem nhớ đặt thêm bộ lọc.
   */
  async sla(me: AuthUser, filter: Filter, now = new Date()) {
    const ids = await this.scope.userIdsFor(me);
    const { where, params } = build(filter, ids);
    // Thời điểm so sánh là THAM SỐ, không phải `now()` trong SQL. Cùng lý do với
    // sla-worker: đồng hồ phải tiêm được thì mới kiểm được hành vi ở ngày 13 và
    // ngày 14 mà không phải chờ hai tuần.
    params.push(now.toISOString());
    const at = `$${params.length}::timestamptz`;

    const r = await this.db.one<Record<string, string>>(
      `SELECT count(*)::text AS waiting,
              count(*) FILTER (WHERE status = 'QUA_HAN_DUYET')::text AS overdue,
              count(*) FILTER (WHERE status <> 'QUA_HAN_DUYET'
                                 AND sla_due_at < ${at})::text AS "dueUnflagged",
              count(*) FILTER (WHERE status <> 'QUA_HAN_DUYET'
                                 AND sla_due_at >= ${at}
                                 AND sla_due_at < ${at} + interval '1 day')::text AS "dueToday",
              coalesce(avg(EXTRACT(EPOCH FROM (${at} - sla_started_at)) / 86400)
                       FILTER (WHERE sla_started_at IS NOT NULL), 0)::numeric(10,2)::text
                AS "avgWaitingDays"
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY' AND sla_due_at IS NOT NULL`,
      params,
    );

    // Đếm riêng phần bị loại, dùng lại đúng mệnh đề lọc nhưng KHÔNG có tham số
    // thời điểm — `where` được dựng trước khi tham số đó được thêm vào.
    const forExcluded = build(filter, ids);
    const excluded = await this.db.one<{ n: string }>(
      `SELECT count(*)::text AS n FROM rpt.policy_row
        WHERE ${forExcluded.where} AND source = 'LEGACY' AND sla_due_at IS NOT NULL`,
      forExcluded.params,
    );

    return {
      waiting: Number(r?.['waiting'] ?? 0),
      overdue: Number(r?.['overdue'] ?? 0),
      dueUnflagged: Number(r?.['dueUnflagged'] ?? 0),
      dueToday: Number(r?.['dueToday'] ?? 0),
      avgWaitingDays: Number(r?.['avgWaitingDays'] ?? 0),
      /** Số hồ sơ `LEGACY` đã bị loại — hiện ra để người đọc biết mình không thấy gì. */
      excludedLegacy: Number(excluded?.n ?? 0),
    };
  }
}

/**
 * Bước đang chờ suy từ trạng thái. Bảng này lặp lại `STEP_OF_STATUS` bên
 * `@csbh/domain-policy` nhưng ở dạng SQL, vì phép đếm phải chạy trong CSDL —
 * kéo 20 nghìn dòng về Node để nhóm lại là chính thứ read-model sinh ra để tránh.
 */
const STEP_FROM_STATUS = `CASE status
    WHEN 'CHO_TBP_DUYET' THEN 'B4_TBP_DUYET'
    WHEN 'CHO_KT_L1'     THEN 'B6_KT_L1'
    WHEN 'SA_DANG_XU_LY' THEN 'B8_SA_XU_LY'
    WHEN 'CHO_KT_L2'     THEN 'B10_KT_L2'
  END`;

export const encodeCursor = (c: Cursor): string =>
  Buffer.from(`${c.createdAt}|${c.policyId}`, 'utf8').toString('base64url');

export function decodeCursor(s: string): Cursor {
  const [createdAt, policyId] = Buffer.from(s, 'base64url').toString('utf8').split('|');
  if (!createdAt || !policyId || Number.isNaN(Date.parse(createdAt))) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'cursor',
      message: 'cursor không hợp lệ — bỏ tham số này để xem từ đầu',
    });
  }
  return { createdAt, policyId };
}
