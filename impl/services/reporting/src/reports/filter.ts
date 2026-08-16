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
};

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
  for (const k of FILTER_KEYS) {
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
  const cond: string[] = ['tdv_user_id = ANY($1::uuid[])'];
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

  return { where: cond.join(' AND '), params };
}

/** Đếm số tiêu chí đang áp — dùng cho phần đầu báo cáo và cho log. */
export const activeCount = (f: Filter): number => Object.values(f).filter(Boolean).length;

/** Chuẩn hoá cùng cách với dữ liệu, để test và màn hình gọi lại được. */
export const normalizeTerm = norm;

const bad = (field: string, why: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', field, message: `${field}: ${why}` });
