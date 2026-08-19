/**
 * Mười một tiêu chí lọc ở muc 9.2, dịch sang SQL.
 *
 * Từng là mười bốn. Tỉnh/thành, bệnh viện và kênh rời khỏi phần mềm ở `0026`
 * cùng ba cột nguồn của chúng bên khách hàng — ba tiêu chí ấy không còn gì để
 * lọc theo.
 *
 * MỘT LUẬT KHÔNG ĐƯỢC PHÉP LÁCH: phạm vi dữ liệu áp TRƯỚC bộ lọc và không tiêu
 * chí nào ghi đè được nó (RPT-09). Vì thế `tdv_user_id` xuất hiện ở HAI chỗ với
 * hai nghĩa khác nhau, và trộn lẫn chúng là lỗ hổng:
 *
 *   - `scopeUserIds` — do identity trả về, người dùng không đụng vào được. Luôn
 *     là điều kiện đầu tiên trong mệnh đề WHERE.
 *   - `tdvUserId` — tiêu chí lọc số 10, do người dùng gõ. Nó chỉ THU HẸP thêm
 *     trong phạm vi đã có; gõ id của người ngoài phạm vi thì kết quả rỗng, chứ
 *     không mở rộng ra được.
 *
 * Cách dựng câu lệnh cũng chọn theo hướng đó: điều kiện phạm vi được nối cứng
 * trong `build()` chứ không nằm trong danh sách tiêu chí, nên không có đường nào
 * để một tiêu chí "quên" nó.
 */
import { BadRequestException } from '@nestjs/common';
import { contains, norm } from '@csbh/http-kit';

export type Filter = {
  appliedFrom?: string | undefined;
  appliedTo?: string | undefined;
  approvedFrom?: string | undefined;
  approvedTo?: string | undefined;
  customerCode?: string | undefined;
  customerName?: string | undefined;
  address?: string | undefined;
  taxId?: string | undefined;
  productName?: string | undefined;
  requesterId?: string | undefined;
  status?: string | undefined;
  tdvUserId?: string | undefined;
  productGroupCode?: string | undefined;
  pendingStep?: string | undefined;
  reprint?: string | undefined;
  han?: string | undefined;
};

/** Hai giá trị của tiêu chí *Hạn xử lý* (`0060`). */
export const HAN_XU_LY = ['SAP_QUA_HAN', 'QUA_HAN'] as const;

/**
 * Bước đang chờ suy từ trạng thái — dạng SQL.
 *
 * Lặp lại `STEP_OF_STATUS` bên `@csbh/domain-policy` vì phép này phải chạy TRONG
 * CSDL: kéo hai mươi nghìn dòng về Node để nhóm lại là chính thứ read-model sinh
 * ra để tránh.
 */
export const STEP_FROM_STATUS = `CASE status
    WHEN 'CHO_TBP_DUYET' THEN 'B4_TBP_DUYET'
    WHEN 'CHO_KT_L1'     THEN 'B6_KT_L1'
    WHEN 'SA_DANG_XU_LY' THEN 'B8_SA_XU_LY'
    WHEN 'CHO_KT_L2'     THEN 'B10_KT_L2'
  END`;

/**
 * Bước mà hồ sơ ĐANG CHỜ — và chỉ hồ sơ còn sống mới có bước (`0047`).
 *
 * Từng là `coalesce(pending_step, …)` để hồ sơ quá hạn vẫn tính vào bước cũ của
 * nó, hồi quá hạn còn là lớp phủ và người phụ trách vẫn duyệt được. Từ `0047`
 * quá hạn là chết, nên nó KHÔNG còn là "đang chờ" ở đâu cả: `STEP_FROM_STATUS`
 * trả `NULL` cho `QUA_HAN_DUYET`, và thế là nó tự rơi ra khỏi mọi phép đếm lẫn
 * mọi bộ lọc theo bước.
 *
 * Giữ tên và giữ MỘT định nghĩa dùng chung là chuyện sống còn ở đây: đếm và lọc
 * phải cho ra cùng một tập, nếu không thẻ ghi 12 mà bấm vào ra 9 dòng.
 */
export const BUOC_DANG_CHO = STEP_FROM_STATUS;

/**
 * "Sắp quá hạn" — dưới 24 giờ là tới hạn, và hồ sơ CÒN ĐANG CHỜ.
 *
 * Ba vế, và vế thứ ba mới thêm ở `0059`:
 *
 *   1. `sla_due_at` còn trong vòng 24 giờ tới;
 *   2. chưa mang nhãn `QUA_HAN_DUYET` (`0047`) — hồ sơ đã chết thì `sla_due_at`
 *      vẫn nằm đó, đã trôi qua, nên thiếu vế này là đếm luôn cả nó;
 *   3. **vẫn đang ở một bước chờ**.
 *
 * Vế ba bịt một lỗ đúng cùng kiểu với vế hai, ở một trạng thái khác: hồ sơ hệ
 * thống TỰ XOÁ sau 3 ngày quá hạn (`0047`) chuyển sang `DA_XOA` mà KHÔNG xoá
 * `sla_due_at` — nó thoả cả vế một lẫn vế hai, và lọt vào đây vĩnh viễn. Thẻ
 * *Sắp quá hạn* thì đếm qua `byStepDetail`, vốn đã lọc theo bước, nên thẻ ghi 5
 * còn danh sách mở ra 6 dòng: kiểu lệch người dùng đếm được mà phép kiểm không.
 *
 * Dựng TỪ `BUOC_DANG_CHO` chứ không viết lại điều kiện — một khái niệm, một định
 * nghĩa. Đó cũng là lý do khối này phải nằm SAU nó.
 */
export const SAP_QUA_HAN = `(status <> 'QUA_HAN_DUYET'
    AND ${BUOC_DANG_CHO} IS NOT NULL
    AND sla_due_at IS NOT NULL
    AND sla_due_at <= now() + interval '1 day')`;

/** Tên tham số nhận từ query string, theo đúng thứ tự 11 tiêu chí ở muc 9.2. */
export const FILTER_KEYS = [
  'appliedFrom',
  'appliedTo',
  'approvedFrom',
  'approvedTo',
  'customerCode',
  'customerName',
  'address',
  'taxId',
  'productName',
  'requesterId',
  'status',
  'tdvUserId',
  'productGroupCode',
] as const;

/**
 * Tiêu chí NGOÀI mười một tiêu chí của muc 9.2.
 *
 * Để RIÊNG khỏi `FILTER_KEYS` chứ không nối vào cuối: danh sách kia là bản chép
 * của muc 9.2 và `GET /reports/filter-keys` công bố đúng con số ấy. Trộn vào là
 * làm một tài liệu nghiệp vụ nói sai về chính nó.
 *
 * `pendingStep` và `reprint` chỉ sinh ra khi bấm một thẻ trên trang tổng quan —
 * "bước đang chờ" là mã viết hoa, `reprint` nhận 0 hoặc 1, không phải thứ người
 * ta gõ. `han` thì KHÁC (`0060`): nó có một ô chọn thật trong biểu mẫu lọc, vì
 * "hồ sơ nào sắp hết giờ" là câu người dùng tự hỏi chứ không phải hệ quả của một
 * cú bấm ở màn hình khác.
 */
export const KHOA_NGOAI_MUC_92 = ['pendingStep', 'reprint', 'han'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lọc bộ lọc: bỏ khoá lạ, cắt khoảng trắng, bỏ chuỗi rỗng.
 *
 * "Bỏ chuỗi rỗng" không phải chuyện gọn gàng. Màn hình gửi lên `status=` khi
 * người dùng vừa bấm *Xóa bộ lọc*; hiểu nó là "trạng thái bằng chuỗi rỗng" thì
 * kết quả rỗng, và người dùng thấy màn hình trắng ngay sau khi xoá bộ lọc
 * (RPT-03).
 */
export function cleanFilter(q: Record<string, unknown>): Filter {
  const out: Record<string, string> = {};
  for (const k of [...FILTER_KEYS, ...KHOA_NGOAI_MUC_92]) {
    const v = q[k];
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t === '') continue;
    if (t.length > 200) throw bad(k, 'dài quá 200 ký tự');
    out[k] = t;
  }
  for (const k of ['appliedFrom', 'appliedTo', 'approvedFrom', 'approvedTo'] as const) {
    if (out[k] && !DATE.test(out[k]!)) throw bad(k, 'phải có dạng YYYY-MM-DD');
  }
  for (const k of ['requesterId', 'tdvUserId'] as const) {
    if (out[k] && !UUID.test(out[k]!)) throw bad(k, 'phải là uuid');
  }
  // `reprint` KHÔNG được im lặng bỏ qua khi sai. Nó chỉ nhận hai giá trị, và
  // "bỏ qua tiêu chí không hiểu" ở đây nghĩa là mở rộng kết quả ra cả hai nhóm —
  // một tiêu chí hỏng lại trả về NHIỀU hơn là thứ phải báo, không phải thứ nên
  // lặng lẽ chịu đựng.
  if (out['reprint'] && out['reprint'] !== '0' && out['reprint'] !== '1') {
    throw bad('reprint', 'chỉ nhận 0 hoặc 1');
  }
  if (out['han'] && !(HAN_XU_LY as readonly string[]).includes(out['han'])) {
    throw bad('han', `chỉ nhận ${HAN_XU_LY.join(' hoặc ')}`);
  }
  return out as Filter;
}

export type Built = { where: string; params: unknown[] };

/**
 * Dựng mệnh đề WHERE. `params[0]` LUÔN là danh sách phạm vi.
 *
 * Mỗi tiêu chí thêm một tham số đánh số động thay vì cố định `$1..$13`: điều
 * kiện `IS NULL OR` cho mọi tiêu chí đọc gọn hơn nhưng buộc Postgres lập kế
 * hoạch cho một câu lệnh không dùng được chỉ mục nào — với 20 nghìn hồ sơ thì
 * đó là quét toàn bảng ở mọi lần mở màn hình.
 */
export function build(f: Filter, scopeUserIds: string[]): Built {
  const params: unknown[] = [scopeUserIds];
  // Phạm vi: id của tôi ở MỘT TRONG BỐN cột người (`0031`). Cùng phép lọc với
  // `thuocPhamVi` bên policy — hai chỗ phải trả lời giống hệt nhau, nếu không
  // thì một hồ sơ mở được ở màn hình Hồ sơ mà biến mất khỏi Báo cáo.
  const cond: string[] = [
    `(${['tdv_user_id', 'tbp_user_id', 'ke_toan_user_id', 'sale_admin_user_id']
      .map((c) => `${c} = ANY($1::uuid[])`)
      .join(' OR ')})`,
  ];
  const add = (sql: (i: number) => string, value: unknown): void => {
    params.push(value);
    cond.push(sql(params.length));
  };

  // 1. Thời gian áp dụng — hai đầu đều BAO GỒM ngày biên. Người dùng gõ
  //    01/07 → 31/07 thì hồ sơ áp dụng đúng ngày 31/07 phải nằm trong kết quả.
  if (f.appliedFrom) add((i) => `applied_date >= $${i}::date`, f.appliedFrom);
  if (f.appliedTo) add((i) => `applied_date <= $${i}::date`, f.appliedTo);

  // 2. Thời gian duyệt — là timestamptz nên đầu trên phải là "< ngày hôm sau",
  //    không phải "<= ngày đó": `<= '2026-07-31'` cắt mất mọi hồ sơ duyệt trong
  //    ngày 31/07 sau 00:00:00.
  if (f.approvedFrom) add((i) => `approved_at >= $${i}::date`, f.approvedFrom);
  if (f.approvedTo) add((i) => `approved_at < ($${i}::date + 1)`, f.approvedTo);

  // 3. Mã khách hàng — khớp CHÍNH XÁC sau chuẩn hoá hoa thường và khoảng trắng,
  //    giống hệt cách cus.customer chống trùng mã.
  if (f.customerCode) add((i) => `upper(btrim(customer_code)) = upper(btrim($${i}))`, f.customerCode);

  // 4, 5. Tên khách hàng và địa chỉ — "có chứa", bỏ dấu, không phân biệt hoa thường.
  if (f.customerName) add((i) => `customer_name_norm LIKE $${i}`, contains(f.customerName));
  if (f.address) add((i) => `address_norm LIKE $${i}`, contains(f.address));

  // 6. Mã số thuế / CCCD.
  if (f.taxId) add((i) => `btrim(tax_id) = btrim($${i})`, f.taxId);

  // 7. Tên sản phẩm — khớp nếu BẤT KỲ dòng nào của hồ sơ có tên chứa từ khoá.
  if (f.productName) {
    add(
      (i) => `EXISTS (SELECT 1 FROM unnest(product_names_norm) n WHERE n LIKE $${i})`,
      contains(f.productName),
    );
  }

  // 8. Người đề nghị.
  if (f.requesterId) add((i) => `requester_id = $${i}::uuid`, f.requesterId);

  // 9. Trạng thái. Nhận nhiều giá trị cách nhau bằng dấu phẩy — màn hình báo cáo
  //    thường hỏi "đang chờ ai đó xử lý", tức là bốn trạng thái một lúc.
  if (f.status) {
    add((i) => `status = ANY($${i}::text[])`, f.status.split(',').map((s) => s.trim()).filter(Boolean));
  }

  // 10. TDV phụ trách — CHỈ thu hẹp trong phạm vi, xem chú thích đầu file.
  if (f.tdvUserId) add((i) => `tdv_user_id = $${i}::uuid`, f.tdvUserId);

  // 11. Nhóm sản phẩm — `&&` (hai mảng có phần tử chung) dùng được chỉ mục GIN.
  if (f.productGroupCode) add((i) => `product_group_codes && ARRAY[$${i}]::text[]`, f.productGroupCode);

  /*
   * 12. Bước đang chờ (`0045`) — cách DUY NHẤT để một liên kết mở ra đúng tập hồ
   * sơ mà thẻ trên trang tổng quan đã đếm.
   *
   * Không thay được bằng `status`: thẻ "Chờ TBP duyệt" đếm cả hồ sơ quá hạn ở
   * bước ấy, mà chúng mang `status = 'QUA_HAN_DUYET'`. Lọc `status=CHO_TBP_DUYET`
   * cho ra một danh sách NGẮN HƠN con số vừa bấm vào — người dùng đếm được, và
   * đó là kiểu sai không ai báo lỗi giúp.
   */
  if (f.pendingStep) {
    add(
      (i) => `${BUOC_DANG_CHO} = ANY($${i}::text[])`,
      f.pendingStep.split(',').map((s) => s.trim()).filter(Boolean),
    );
  }

  // 13. Lý do hồ sơ nằm ở Sale Admin (`0045`): `1` = đang phải in lại bản cứng,
  //     `0` = trình ký lần đầu. Chỉ có nghĩa khi đi kèm tiêu chí 12.
  if (f.reprint === '1') cond.push('reprint_requested_at IS NOT NULL');
  if (f.reprint === '0') cond.push('reprint_requested_at IS NULL');

  /*
   * 14. Hạn xử lý (`0060`) — một ô chọn gom hai câu hỏi về hạn vào một chỗ.
   *
   * Thay cho `dueSoon=1` của `0047`. Hai tiêu chí cho hai nửa của cùng một câu
   * hỏi là hai chỗ phải nhớ, và người dùng thì hỏi "hồ sơ nào đang có vấn đề về
   * hạn" chứ không hỏi riêng từng nửa.
   *
   * `QUA_HAN` trùng nghĩa với `status=QUA_HAN_DUYET`, và trùng là chấp nhận
   * được: người tìm theo HẠN không nhất thiết nghĩ nó là một trạng thái.
   */
  if (f.han === 'SAP_QUA_HAN') cond.push(SAP_QUA_HAN);
  if (f.han === 'QUA_HAN') cond.push(`status = 'QUA_HAN_DUYET'`);

  return { where: cond.join(' AND '), params };
}

/** Đếm số tiêu chí đang áp — dùng cho phần đầu báo cáo và cho log. */
export const activeCount = (f: Filter): number => Object.values(f).filter(Boolean).length;

/** Chuẩn hoá cùng cách với dữ liệu, để test và màn hình gọi lại được. */
export const normalizeTerm = norm;

const bad = (field: string, why: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', field, message: `${field}: ${why}` });
