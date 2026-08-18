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
import { contains, norm } from './normalize.js';

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
};

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
 * Bước đang chờ THẬT SỰ của một hồ sơ, quá hạn hay không.
 *
 * `pending_step` chỉ có giá trị khi hồ sơ đã quá hạn — nó sinh ra để hồ sơ quá
 * hạn còn biết đường đi tiếp đúng nhánh cũ (muc 4). Hồ sơ chờ bình thường thì
 * bước suy từ trạng thái. Lọc chỉ theo `status` là bỏ sót đúng những hồ sơ trễ
 * nhất, vì `QUA_HAN_DUYET` ĐÈ LÊN trạng thái cũ chứ không đứng cạnh nó.
 */
export const BUOC_DANG_CHO = `coalesce(pending_step, ${STEP_FROM_STATUS})`;

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
 * Tiêu chí CHỈ ĐẾN TỪ LIÊN KẾT, không có ô nào trong biểu mẫu lọc (`0045`).
 *
 * Để RIÊNG khỏi `FILTER_KEYS` chứ không nối vào cuối, vì màn hình dựng biểu mẫu
 * từ danh sách kia (`GET /reports/filter-keys`): nối vào là mọc thêm hai ô nhập
 * mà người dùng không gõ nổi — "bước đang chờ" là mã viết hoa, còn "reprint"
 * nhận 0 hoặc 1. Chúng chỉ sinh ra khi bấm một thẻ trên trang tổng quan, và bộ
 * lọc vẫn phải hiểu để danh sách mở ra khớp con số vừa bấm.
 */
export const KHOA_TU_LIEN_KET = ['pendingStep', 'reprint'] as const;

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
  for (const k of [...FILTER_KEYS, ...KHOA_TU_LIEN_KET]) {
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

  return { where: cond.join(' AND '), params };
}

/** Đếm số tiêu chí đang áp — dùng cho phần đầu báo cáo và cho log. */
export const activeCount = (f: Filter): number => Object.values(f).filter(Boolean).length;

/** Chuẩn hoá cùng cách với dữ liệu, để test và màn hình gọi lại được. */
export const normalizeTerm = norm;

const bad = (field: string, why: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', field, message: `${field}: ${why}` });
