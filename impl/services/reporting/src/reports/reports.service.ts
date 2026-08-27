/**
 * Danh sách hồ sơ đã lọc và ba báo cáo tổng hợp (muc 9.2).
 *
 * Mọi truy vấn ở đây đều đọc `rpt.policy_row` và đều bắt đầu bằng cùng một
 * mệnh đề phạm vi dựng ở `filter.ts` — kể cả các báo cáo tổng hợp. Báo cáo đếm
 * theo trạng thái mà quên phạm vi thì TDV đọc ra tổng số hồ sơ toàn công ty:
 * không lộ nội dung hồ sơ nào, nhưng vẫn là lộ dữ liệu.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { contains, type AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ScopeClient } from '../infra/scope.client.js';
import { build, BUOC_DANG_CHO, SAP_QUA_HAN, type Filter, type PhamVi } from './filter.js';

/**
 * Khoá thẻ trên trang tổng quan — bốn bước chờ, riêng B8 tách làm hai (`0045`).
 *
 * `SA_DANG_XU_LY` gộp hai việc khác hẳn nhau: in và trình ký lần đầu (B8), hay
 * làm lại bản cứng vì kế toán bắt in lại (B10C). Sale Admin cần hai con số, và
 * chỉ mốc `reprint_requested_at` phân biệt được.
 */
const KHOA_THE = `CASE
    WHEN ${BUOC_DANG_CHO} <> 'B8_SA_XU_LY' THEN ${BUOC_DANG_CHO}
    WHEN reprint_requested_at IS NOT NULL  THEN 'B8_LOI_BAN_CUNG'
    ELSE 'B8_TRINH_KY'
  END`;

export const LIST_LIMIT_MAX = 200;

/**
 * Trần số TDV trả về cho ô chọn (`0077`).
 *
 * Một ô chọn 500 dòng đã là ô không ai cuộn hết — nó có ô tìm ngay trên đầu. Trần
 * ở đây là để một phạm vi bất thường không kéo cả bảng về, không phải để phân
 * trang: quá 500 TDV trong phạm vi một người thì vấn đề nằm ở cây phân quyền.
 */
export const HANDLERS_MAX = 500;

/**
 * Trần số dòng trả về cho một ô chọn có tìm kiếm (`0077`).
 *
 * Nhỏ hơn `HANDLERS_MAX` vì đây là kết quả của một từ khoá, không phải cả danh
 * sách: quá 20 dòng thì người dùng nên gõ thêm chữ chứ không nên cuộn.
 */
export const CHON_MAX = 20;

/**
 * Cột trả về cho màn hình danh sách, và cũng là thứ tự cột của file Excel.
 *
 * Định danh bằng `r.` từ `0080`: việc xuất file nối thêm `rpt.policy_line`, và
 * `policy_id` có mặt ở CẢ HAI bảng. Không định danh thì Postgres từ chối với
 * `column reference "policy_id" is ambiguous` — may là nó từ chối thẳng, chứ
 * một cột trùng tên mà đoán nhầm bảng thì im lặng hơn nhiều.
 */
export const LIST_COLUMNS = `
  r.policy_id AS "policyId", r.code, r.version_no AS "versionNo", r.status,
  r.pending_step AS "pendingStep", r.source,
  r.applied_date AS "appliedDate", r.approved_at AS "approvedAt",
  r.customer_code AS "customerCode", r.customer_name AS "customerName",
  r.registered_address AS "registeredAddress", r.tax_id AS "taxId",
  r.requester_name AS "requesterName", r.tdv_name AS "tdvName",
  r.tdv_user_id AS "tdvUserId", r.requester_id AS "requesterId",
  r.line_count AS "lineCount", r.total_net AS "totalNet",
  r.max_discount AS "maxDiscount", r.product_names AS "productNames",
  r.product_group_codes AS "productGroupCodes",
  r.created_at AS "createdAt", r.synced_at AS "syncedAt",
  -- Cột TÍNH RA, không có trong bảng (0053). Dùng lại đúng biểu thức mà thẻ
  -- "Sắp quá hạn" và tiêu chí "han" đang dùng: ba chỗ hiện cùng một khái niệm
  -- thì phải đọc từ cùng một định nghĩa, nếu không sẽ có ngày một hồ sơ được
  -- đánh dấu ở màn hình này mà không lọt vào bộ lọc kia.
  --
  -- KHÔNG vào file Excel: COLUMNS bên exports/sheet.ts khai riêng theo tên khoá,
  -- nên thêm ở đây không đụng tới bảng tính.
  ${SAP_QUA_HAN} AS "sapQuaHan"`;

/**
 * Cột của MỘT DÒNG SẢN PHẨM — chỉ việc xuất file dùng tới (`0080`).
 *
 * Tất cả đều `NULL` với hồ sơ chưa có dòng nào, vì phép nối là `LEFT JOIN`.
 * Bảng tính để trống mấy ô ấy, và đó là câu trả lời đúng: hồ sơ Nháp chưa nhập
 * sản phẩm thì không có gì để ghi, nhưng bản thân hồ sơ vẫn phải có mặt.
 */
export const LINE_COLUMNS = `
  l.seq AS "lineSeq",
  l.product_code AS "productCode", l.product_name AS "productName",
  l.group_code AS "groupCode",
  l.company_price AS "companyPrice", l.wholesale_price AS "wholesalePrice",
  l.cpbh_total AS "cpbhTotal", l.net_price AS "netPrice",
  l.discount_rate AS "discountRate", l.threshold AS "threshold",
  l.over_threshold AS "overThreshold"`;

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
    const pv = await this.scope.phamViCua(me);
    const { where, params } = build(filter, pv);

    let cursorSql = '';
    if (opts.cursor) {
      const cur = decodeCursor(opts.cursor);
      params.push(cur.createdAt, cur.policyId);
      cursorSql = ` AND (r.created_at, r.policy_id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }

    params.push(opts.limit + 1);
    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT ${LIST_COLUMNS}
         FROM rpt.policy_row r
        WHERE ${where}${cursorSql}
        ORDER BY r.created_at DESC, r.policy_id DESC
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

  /**
   * Danh sách TDV phụ trách để dựng ô chọn của bộ lọc (`0077`).
   *
   * Chỉ những người **có hồ sơ trong phạm vi** người đang hỏi, không phải toàn
   * bộ TDV của công ty. Danh sách đầy đủ thì ngắn hơn nhiều, và quan trọng hơn:
   * chọn ai trong đó cũng chắc chắn ra kết quả. Bày cả những người ngoài phạm vi
   * là mời người dùng chọn một cái tên rồi nhận về danh sách rỗng, mà không có
   * gì nói cho họ biết vì sao — đúng cái bẫy `RPT-09` mở ra.
   *
   * Dùng lại `build({}, pv)` chứ không viết lại mệnh đề phạm vi: ô chọn và
   * danh sách kết quả phải nói về cùng một tập hồ sơ.
   */
  async handlers(me: AuthUser): Promise<{ userId: string; name: string | null }[]> {
    const pv = await this.scope.phamViCua(me);
    const { where, params } = build({}, pv);
    const rows = await this.db.q<{ id: string; name: string | null }>(
      `SELECT tdv_user_id::text AS id, max(tdv_name) AS name
         FROM rpt.policy_row
        WHERE ${where}
        GROUP BY tdv_user_id
        ORDER BY max(tdv_name) NULLS LAST
        LIMIT ${HANDLERS_MAX}`,
      params,
    );
    return rows.map((r) => ({ userId: r.id, name: r.name }));
  }

  /**
   * Danh sách KHÁCH HÀNG để dựng ô chọn *Mã khách hàng* (`0077`).
   *
   * Đọc từ read-model chứ không gọi sang service khách hàng, và đó không phải
   * chuyện tiện tay — `GET /customers?q=` **không tìm được** thứ ô này cần:
   *
   *   - nó khớp `name || địa chỉ || mã số thuế`, **không khớp MÃ** — đúng cái ô
   *     này mang tên;
   *   - nó dùng `ILIKE`, phân biệt dấu: gõ `duoc` không ra "Dược".
   *
   * `rpt.policy_row` có sẵn `customer_name_norm` — đã bỏ dấu, đã có chỉ mục GIN
   * trigram — nên tìm không dấu là miễn phí, và mã nằm ngay cạnh để khớp luôn.
   *
   * Thêm một cái được, cùng lý do với `handlers()`: chỉ khách hàng **có hồ sơ
   * trong phạm vi** mới hiện ra, nên không có lựa chọn nào bấm vào ra rỗng.
   */
  async customers(
    me: AuthUser,
    q: string,
  ): Promise<{ code: string; name: string }[]> {
    const pv = await this.scope.phamViCua(me);
    const { where, params } = build({}, pv);
    const tuKhoa = q.trim();
    if (tuKhoa === '') return [];
    params.push(contains(tuKhoa), `%${tuKhoa.toUpperCase()}%`);
    const i = params.length;
    const rows = await this.db.q<{ code: string; name: string }>(
      `SELECT customer_code AS code, max(customer_name) AS name
         FROM rpt.policy_row
        WHERE ${where}
          AND (customer_name_norm LIKE $${i - 1} OR upper(customer_code) LIKE $${i})
        GROUP BY customer_code
        ORDER BY max(customer_name)
        LIMIT ${CHON_MAX}`,
      params,
    );
    return rows;
  }

  /** Tổng số hồ sơ khớp bộ lọc — hỏi riêng vì màn hình chỉ cần nó khi cần. */
  async count(me: AuthUser, filter: Filter): Promise<number> {
    const pv = await this.scope.phamViCua(me);
    const { where, params } = build(filter, pv);
    const r = await this.db.one<{ n: string }>(
      `SELECT count(*)::text AS n FROM rpt.policy_row WHERE ${where}`,
      params,
    );
    return Number(r?.n ?? 0);
  }

  /** Toàn bộ tập đã lọc, để xuất Excel. Không phân trang — người gọi tự giới hạn. */
  async all(pv: PhamVi, filter: Filter, cap: number): Promise<Record<string, unknown>[]> {
    const { where, params } = build(filter, pv);
    params.push(cap);
    /*
     * MỘT DÒNG CHO MỖI SẢN PHẨM (`0080`), không phải một dòng cho mỗi hồ sơ.
     *
     * `LEFT JOIN` chứ không `JOIN`, và đó là cả một quyết định: hồ sơ **chưa có
     * dòng sản phẩm nào** — hồ sơ Nháp vừa lập — vẫn phải có mặt trong file, với
     * các cột sản phẩm để trống. `JOIN` thường thì chúng biến mất, và một hồ sơ
     * biến mất khỏi báo cáo là kiểu sai không ai đi tìm: người dùng chỉ thấy con
     * số nhỏ hơn mình tưởng, và không có gì nói vì sao.
     *
     * Sắp theo `(created_at, policy_id, seq)`: hai lần xuất cùng một bộ lọc phải
     * cho ra hai file giống hệt nhau, kể cả thứ tự dòng — không thì không ai so
     * được hai file với nhau. `seq` giữ đúng thứ tự sản phẩm như trong hồ sơ.
     */
    return this.db.q<Record<string, unknown>>(
      `SELECT ${LIST_COLUMNS}, ${LINE_COLUMNS}
         FROM rpt.policy_row r
         LEFT JOIN rpt.policy_line l ON l.policy_id = r.policy_id
        WHERE ${where}
        ORDER BY r.created_at DESC, r.policy_id DESC, l.seq
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
    const pv = await this.scope.phamViCua(me);
    const { where, params } = build(filter, pv);

    const byStatus = await this.db.q<{ k: string; n: string }>(
      `SELECT status AS k, count(*)::text AS n FROM rpt.policy_row
        WHERE ${where} GROUP BY status ORDER BY count(*) DESC`,
      params,
    );
    const byStep = await this.db.q<{ k: string; n: string }>(
      `SELECT ${BUOC_DANG_CHO} AS k, count(*)::text AS n
         FROM rpt.policy_row
        WHERE ${where} AND ${BUOC_DANG_CHO} IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC`,
      params,
    );
    /*
     * Cùng phép nhóm, thêm hai thứ trang tổng quan cần mà `byPendingStep` không
     * nói được: B8 tách đôi, và trong mỗi ô có bao nhiêu hồ sơ SẮP quá hạn.
     *
     * LOẠI HẲN hồ sơ đã quá hạn (`0047`) — đổi chiều so với `0045`. Hồi ấy quá
     * hạn chỉ là cái nhãn và người phụ trách vẫn duyệt được, nên đếm nó vào thẻ
     * của bước là đúng. Giờ nó là trạng thái chết: đếm vào thẻ việc là bảo người
     * ta còn 12 việc phải làm trong khi 3 trong số đó không bấm được gì.
     *
     * Chỗ trống nó để lại là `soon` — hồ sơ CÒN KỊP CỨU, dưới 24 giờ. Đó mới là
     * con số đáng đứng cạnh một ô đếm việc.
     */
    const byStepDetail = await this.db.q<{ k: string; n: string; qh: string }>(
      `SELECT ${KHOA_THE} AS k, count(*)::text AS n,
              count(*) FILTER (WHERE ${SAP_QUA_HAN})::text AS qh
         FROM rpt.policy_row
        WHERE ${where} AND ${BUOC_DANG_CHO} IS NOT NULL
        GROUP BY 1`,
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
      byStepDetail: Object.fromEntries(
        byStepDetail.map((r) => [r.k, { total: Number(r.n), soon: Number(r.qh) }]),
      ),
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
    const pv = await this.scope.phamViCua(me);
    const { where, params } = build(filter, pv);
    const r = await this.db.one<{
      submitted: string;
      returned: string;
      rejected: string;
      either: string;
    }>(
      /*
       * Đếm theo MỐC THỜI GIAN, không theo trạng thái hiện tại (`0039`).
       *
       * Từ `0039` người lập xoá được hồ sơ đã bị từ chối, và hồ sơ ấy chuyển
       * `DA_XOA`. Đếm theo `status = 'TU_CHOI'` thì mỗi lần dọn màn hình là một
       * lần tỷ lệ từ chối của chính người đó tụt xuống — một chỉ số tự bào mòn,
       * và bào theo hướng đẹp lên.
       *
       * `rejected_at` và `returned_at` là mốc ĐÃ XẢY RA, không đảo ngược được.
       * Đó cũng đúng tinh thần muc 4: hồ sơ bị từ chối phải còn nguyên trong báo
       * cáo tỷ lệ trả lại, dù nó đã rời khỏi thẻ đếm của người lập.
       */
      `SELECT count(*) FILTER (WHERE submitted_at IS NOT NULL)::text AS submitted,
              count(*) FILTER (WHERE returned_at IS NOT NULL)::text AS returned,
              count(*) FILTER (WHERE rejected_at IS NOT NULL)::text AS rejected,
              count(*) FILTER (WHERE returned_at IS NOT NULL
                                  OR rejected_at IS NOT NULL)::text AS either
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
    const pv = await this.scope.phamViCua(me);
    const { where, params } = build(filter, pv);
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
    const forExcluded = build(filter, pv);
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
