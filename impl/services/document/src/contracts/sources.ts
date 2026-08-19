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
export const LINE_PREFIX = 'san_pham.';

type Ctx = {
  policy: PolicyFull;
  customer: CustomerFull;
  people: Record<string, string>;
};

/**
 * Trường đơn: một hồ sơ ra một giá trị.
 *
 * KHOÁ VIẾT BẰNG TIẾNG VIỆT từ `0056`. Trước đó là `customer.name`,
 * `policy.applied_date`, `person.tdv` — tên bảng dữ liệu, không phải tên thứ mà
 * người soạn mẫu đang tìm.
 *
 * MỘT NHÓM `ho_so.` cho tất cả, kể cả thông tin khách hàng và người xử lý.
 * Người soạn mẫu nghĩ theo câu hỏi "trong hồ sơ này có gì", không nghĩ theo
 * lược đồ CSDL; tách `khach_hang.` ra riêng là bắt họ học một cách chia mà chỉ
 * hệ thống mới cần.
 *
 * `cong_ty.` đứng riêng vì nó KHÔNG thuộc hồ sơ — nó giống nhau ở mọi hồ sơ.
 */
const SCALAR: Record<string, (c: Ctx) => string | null> = {
  // --- Thông tin chung của hồ sơ ---
  'ho_so.ma_ho_so': (c) => c.policy.code,
  'ho_so.phien_ban': (c) => String(c.policy.version_no),
  'ho_so.trang_thai': (c) => STATUS_LABEL[c.policy.status] ?? c.policy.status,
  'ho_so.ngay_ap_dung': (c) => c.policy.applied_date ?? c.policy.effective_from,
  'ho_so.ngay_hieu_luc': (c) => c.policy.effective_from,
  'ho_so.tep_dinh_kem': (c) =>
    c.policy.attachments.length === 0
      ? 'Không có file đính kèm'
      : c.policy.attachments.map((a) => `${a.file_name} (${a.kind})`).join('; '),

  // --- Khách hàng TRONG hồ sơ ---
  'ho_so.ma_khach_hang': (c) => c.customer.code,
  'ho_so.ten_khach_hang': (c) => c.customer.name,
  'ho_so.ma_so_thue': (c) => c.customer.idNumber,
  'ho_so.dia_chi_dang_ky': (c) => c.customer.registeredAddress,
  'ho_so.noi_nhan_hang': (c) => c.customer.deliveryAddress ?? c.customer.registeredAddress,
  'ho_so.nguoi_dai_dien': (c) => c.customer.ownerName,
  'ho_so.chuc_danh_dai_dien': (c) => c.customer.ownerTitle,
  'ho_so.cong_no': (c) => c.customer.debt,

  // --- Người xử lý hồ sơ ---
  'ho_so.nguoi_de_nghi': (c) => c.people['TDV'] ?? null,
  'ho_so.truong_bo_phan': (c) => c.people['TBP'] ?? null,
  'ho_so.ke_toan': (c) => c.people['KE_TOAN'] ?? null,
  'ho_so.sale_admin': (c) => c.people['SALE_ADMIN'] ?? null,
  'ho_so.ngay_tbp_ky': (c) => c.policy.tbp_signed_at,
  'ho_so.ngay_kt_nhan_l1': (c) => c.policy.kt_l1_received_at,
  'ho_so.ngay_kt_nhan_l2': (c) => c.policy.kt_l2_received_at,

  /**
   * KHỐI CHỮ KÝ SỐ của Trưởng bộ phận (`0056`) — HAI DÒNG.
   *
   * Trả về chuỗi có `\n`, và `setParagraphText` đã đổi nó thành `<w:br/>` từ
   * trước, nên hai dòng ra đúng hai dòng trên giấy.
   *
   * CHƯA KÝ thì trả về RỖNG, không phải "chưa ký". Một khối chữ ký trên văn bản
   * chưa ký là một tuyên bố sai — và bản CSBH ở trạng thái Nháp vẫn xem được,
   * nên tình huống này xảy ra hằng ngày.
   */
  'ho_so.chu_ky_so_TBP': (c) =>
    c.policy.tbp_signed_at === null ? '' : `TBP đã ký số\n${dmy(c.policy.tbp_signed_at)}`,

  // --- Công ty, và ngày in ra giấy ---
  'cong_ty.ten': () => COMPANY.name,
  'cong_ty.dia_chi': () => COMPANY.address,
  'cong_ty.ma_so_thue': () => COMPANY.taxCode,

  ngay_in: () => new Date().toISOString(),
};

/**
 * Trường theo dòng sản phẩm: một hồ sơ ra N giá trị.
 *
 * Chỉ MẪU HỢP ĐỒNG dùng nhóm này — nơi bảng do người soạn vẽ tay với số cột cố
 * định. Mẫu hồ sơ CSBH dùng `{{bang_san_pham}}`, và hệ thống dựng cả bảng với
 * đúng số cột CPBH của từng hồ sơ (muc 7.1).
 */
const LINE: Record<string, (l: PolicyLine, i: number) => string | null> = {
  stt: (_l, i) => String(i + 1),
  ma_san_pham: (l) => l.product_code_snap,
  ten_san_pham: (l) => l.product_name_snap,
  gia_cong_ty: (l) => l.company_price,
  gia_ban_buon: (l) => l.wholesale_price,
  cpbh_tong: (l) => l.cpbh_total,
  gia_thu_ve: (l) => l.net_price,
  ty_le_ck: (l) => l.discount_rate,
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
  'cong_ty.ten',
  'ho_so.ma_khach_hang',
  'ho_so.ten_khach_hang',
  'ho_so.cong_no',
  'ho_so.ma_ho_so',
  'ho_so.ngay_ap_dung',
  'ho_so.trang_thai',
  'ho_so.tep_dinh_kem',
  'ho_so.nguoi_de_nghi',
  'ho_so.truong_bo_phan',
  'ho_so.ke_toan',
  'ho_so.ngay_tbp_ky',
  'ho_so.ngay_kt_nhan_l2',
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
