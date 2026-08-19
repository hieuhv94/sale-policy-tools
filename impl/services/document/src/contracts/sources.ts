/**
 * Tập trường nguồn mà Sale Admin được phép ánh xạ tới, và cách định dạng chúng.
 *
 * Danh sách ĐÓNG, khai ở một chỗ, và dùng cho cả hai việc: kiểm lúc lưu ánh xạ
 * (DOC-29) và trộn lúc xuất. Một danh sách dùng cho cả hai là cách duy nhất bảo
 * đảm "lưu được thì xuất được" — hai danh sách sẽ lệch nhau vào ngày thêm trường
 * mới, và lệch theo hướng tệ nhất: ánh xạ lưu thành công rồi xuất mới báo lỗi.
 *
 * Định dạng tiền, ngày và phần trăm áp TẠI ĐÂY, không ở tầng nào khác (Hình 4).
 * Riêng phần trăm phải khớp từng ký tự với con số trên hồ sơ CSBH — cùng phép
 * làm tròn hai chữ số đã chốt ở muc 7 (DOC-31).
 */
import type { CustomerFull, PolicyFull, PolicyLine } from '../infra/clients.js';
import { COMPANY, dmy, money, pct, STATUS_LABEL } from '../render/sheet.js';

export type Format = 'text' | 'money_vnd' | 'date_dmy' | 'percent_2';
export const FORMATS: Format[] = ['text', 'money_vnd', 'date_dmy', 'percent_2'];

/** Tiền tố của nhóm trường theo dòng sản phẩm — dòng bảng mang nó sẽ được nhân bản. */
export const LINE_PREFIX = 'policy.lines[].';

type Ctx = {
  policy: PolicyFull;
  customer: CustomerFull;
  people: Record<string, string>;
};

/** Trường đơn: một hồ sơ ra một giá trị. */
const SCALAR: Record<string, (c: Ctx) => string | null> = {
  'customer.code': (c) => c.customer.code,
  'customer.name': (c) => c.customer.name,
  'customer.id_number': (c) => c.customer.idNumber,
  'customer.registered_address': (c) => c.customer.registeredAddress,
  'customer.delivery_address': (c) => c.customer.deliveryAddress ?? c.customer.registeredAddress,
  'customer.owner_name': (c) => c.customer.ownerName,
  'customer.owner_title': (c) => c.customer.ownerTitle,
  'customer.debt': (c) => c.customer.debt,

  'policy.code': (c) => c.policy.code,
  'policy.version_no': (c) => String(c.policy.version_no),
  'policy.applied_date': (c) => c.policy.applied_date ?? c.policy.effective_from,
  'policy.effective_from': (c) => c.policy.effective_from,
  'policy.tbp_signed_at': (c) => c.policy.tbp_signed_at,
  'policy.kt_l1_received_at': (c) => c.policy.kt_l1_received_at,
  'policy.kt_l2_received_at': (c) => c.policy.kt_l2_received_at,
  /*
   * Ba trường thêm ở `0055` cho MẪU HỒ SƠ CSBH — muc 11.1 liệt kê chúng trong
   * 13 mục bắt buộc của bản A4, mà mẫu hợp đồng trước nay không cần.
   *
   * `policy.status` trả về NHÃN tiếng Việt, không phải mã enum: bản A4 là văn
   * bản đưa cho người ký đọc, và "CHO_TBP_DUYET" không phải tiếng Việt.
   */
  'policy.status': (c) => STATUS_LABEL[c.policy.status] ?? c.policy.status,
  'policy.attachments': (c) =>
    c.policy.attachments.length === 0
      ? 'Không có file đính kèm'
      : c.policy.attachments.map((a) => `${a.file_name} (${a.kind})`).join('; '),

  'company.name': () => COMPANY.name,
  'company.address': () => COMPANY.address,
  'company.tax_code': () => COMPANY.taxCode,

  'person.tdv': (c) => c.people['TDV'] ?? null,
  'person.tbp': (c) => c.people['TBP'] ?? null,
  'person.ke_toan': (c) => c.people['KE_TOAN'] ?? null,
  'person.sale_admin': (c) => c.people['SALE_ADMIN'] ?? null,

  today: () => new Date().toISOString(),
};

/** Trường theo dòng sản phẩm: một hồ sơ ra N giá trị. */
const LINE: Record<string, (l: PolicyLine, i: number) => string | null> = {
  index: (_l, i) => String(i + 1),
  product_code: (l) => l.product_code_snap,
  product_name: (l) => l.product_name_snap,
  company_price: (l) => l.company_price,
  wholesale_price: (l) => l.wholesale_price,
  cpbh_total: (l) => l.cpbh_total,
  net_price: (l) => l.net_price,
  discount_rate: (l) => l.discount_rate,
  threshold: (l) => l.threshold_snap,
};

export const KNOWN_SOURCES: string[] = [
  ...Object.keys(SCALAR),
  ...Object.keys(LINE).map((k) => `${LINE_PREFIX}${k}`),
];

/**
 * MƯỜI BA MỤC BẮT BUỘC của bản CSBH A4 (muc 11.1), dịch sang trường nguồn.
 *
 * Muc 6.4 từng để ngỏ đúng câu hỏi này: *"nếu mẫu do người dùng soạn, hệ thống
 * không còn bảo đảm được 13 mục kia có mặt"*. Đây là câu trả lời — kiểm ở LÚC
 * PHÁT HÀNH, không ở lúc xem.
 *
 * Kiểm lúc phát hành chứ không lúc xem vì hai lý do:
 *   - Người sửa được là Quản trị, và họ đang đứng ở màn hình mẫu. Báo lúc kế
 *     toán mở bản A4 là báo cho người không sửa được gì.
 *   - Một mẫu thiếu mục chỉ hỏng khi có người xem, mà lúc đó thì đã muộn: bản
 *     thiếu công nợ đã in ra và đã đưa đi ký.
 *
 * `policy.lines_table` gánh hai mục — *tên sản phẩm* và *CPBH* — vì cả hai nằm
 * trong bảng do hệ thống dựng, không phải ô trống rời.
 */
export const NGUON_BAT_BUOC_HO_SO: string[] = [
  'company.name',
  'customer.code',
  'customer.name',
  'customer.debt',
  'policy.code',
  'policy.applied_date',
  'policy.status',
  'policy.attachments',
  'person.tdv',
  'person.tbp',
  'person.ke_toan',
  'policy.tbp_signed_at',
  'policy.kt_l2_received_at',
];

export const isKnownSource = (s: string): boolean => KNOWN_SOURCES.includes(s);
export const isLineSource = (s: string): boolean => s.startsWith(LINE_PREFIX);

export function applyFormat(raw: string | null, format: string | null): string {
  if (raw === null || raw === '') return '';
  switch (format) {
    case 'money_vnd':
      return money(raw);
    case 'date_dmy':
      return dmy(raw);
    case 'percent_2':
      return pct(raw);
    default:
      return raw;
  }
}

export const scalarValue = (source: string, ctx: Ctx): string | null =>
  SCALAR[source] ? (SCALAR[source] as (c: Ctx) => string | null)(ctx) : null;

export const lineValue = (source: string, line: PolicyLine, i: number): string | null => {
  const fn = LINE[source.slice(LINE_PREFIX.length)];
  return fn ? fn(line, i) : null;
};
