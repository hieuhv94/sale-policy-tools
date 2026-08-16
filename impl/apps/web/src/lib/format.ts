/**
 * Định dạng hiển thị. Mọi con số người dùng nhìn thấy đi qua đây.
 *
 * Nguyên tắc bao trùm: **giao diện KHÔNG TÍNH TOÁN**. Nó nhận số từ API và chỉ
 * thêm dấu phân cách. Tính lại ở đây là tạo ra nguồn sự thật thứ hai, và hai
 * nguồn sẽ lệch nhau ở đúng chỗ khó thấy nhất — quy tắc làm tròn (`FE-27`).
 */

/**
 * Tiền: phân nhóm nghìn, KHÔNG phần thập phân (muc 7).
 *
 * Nhận `string` chứ không `number` vì API trả bigint dạng chuỗi: tiền của hệ này
 * vượt 2^53 là mất chữ số trong im lặng. Chuyển sang `Number` chỉ để định dạng
 * thì đã muộn — nên tự chèn dấu chấm trên chuỗi.
 */
export function tien(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v).trim();
  if (!/^-?\d+$/.test(s)) return String(v);
  const am = s.startsWith('-');
  const so = am ? s.slice(1) : s;
  const nhom = so.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return am ? `-${nhom}` : nhom;
}

/**
 * Tỷ lệ chiết khấu: **in nguyên con số API trả về**, chỉ đổi dấu chấm thập phân
 * sang dấu phẩy (FE-27).
 *
 * Không `Number(v).toFixed(2)`: `toFixed` làm tròn theo dấu phẩy động, nên
 * `12.345` ra `12.35` ở chỗ này còn máy chủ đã chốt `12.34`. Con số hiển thị và
 * con số đem so ngưỡng phải là MỘT — đó là cả điểm của việc làm tròn ở máy chủ.
 */
export function tyLe(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return `${String(v).replace('.', ',')}%`;
}

const HAI_SO = (n: number) => String(n).padStart(2, '0');

/** Ngày dd/mm/yyyy theo giờ Việt Nam. */
export function ngay(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '—';
  // `en-CA` cho ra YYYY-MM-DD, dễ tách và không phụ thuộc ngôn ngữ trình duyệt.
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .split('-');
  return `${day}/${m}/${y}`;
}

/** Ngày kèm giờ, dùng ở nhật ký và ở mốc thời gian duyệt. */
export function ngayGio(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '—';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${g('day')}/${g('month')}/${g('year')} ${HAI_SO(Number(g('hour')))}:${g('minute')}`;
}

/** Nhãn tiếng Việt của 12 trạng thái (muc 4, `0035`). Danh sách ĐÓNG. */
export const NHAN_TRANG_THAI: Record<string, string> = {
  NHAP: 'Nháp',
  CHO_TBP_DUYET: 'Chờ TBP duyệt',
  TBP_DA_KY_SO: 'TBP đã ký số',
  CHO_KT_L1: 'Chờ Kế toán L1',
  SA_DANG_XU_LY: 'Sale Admin đang xử lý',
  CHO_KT_L2: 'Chờ Kế toán L2',
  DANG_CO_HIEU_LUC: 'Đang có hiệu lực',
  HET_HIEU_LUC: 'Hết hiệu lực',
  YEU_CAU_CHINH_SUA: 'Yêu cầu chỉnh sửa',
  TU_CHOI: 'Từ chối',
  QUA_HAN_DUYET: 'Quá hạn duyệt',
  DA_XOA: 'Đã xoá',
};

export const nhanTrangThai = (s: string): string => NHAN_TRANG_THAI[s] ?? s;

/** Nhóm màu của trạng thái — dùng cho lớp CSS, không phải mã màu. */
export function nhomTrangThai(s: string): 'tot' | 'cho' | 'loi' | 'canh-bao' | 'thuong' {
  if (s === 'DANG_CO_HIEU_LUC') return 'tot';
  if (s === 'TU_CHOI') return 'loi';
  if (s === 'QUA_HAN_DUYET' || s === 'YEU_CAU_CHINH_SUA') return 'canh-bao';
  if (s.startsWith('CHO_') || s === 'SA_DANG_XU_LY' || s === 'TBP_DA_KY_SO') return 'cho';
  // `DA_XOA` rơi vào nhánh này, KHÔNG vào `loi` cùng `TU_CHOI` (`0035`). Đỏ là
  // màu của thứ hỏng hoặc bị người khác chặn; hồ sơ này do chính người lập bỏ,
  // và tô đỏ một việc họ cố ý làm là bày ra một báo động giả.
  return 'thuong';
}

/**
 * Nhãn cho MỘT DÒNG NHẬT KÝ, viết ở thì đã xảy ra (`0036`).
 *
 * KHÔNG dùng lại `HANH_DONG_NHAN` ở `can.ts`, và khác biệt là có chủ ý ở hai
 * điểm:
 *
 *   1. Bảng kia là nhãn NÚT — mệnh lệnh, "Ký số duyệt". Đọc một dòng lịch sử
 *      ghi "Ký số duyệt" thì nghe như một việc đang chờ làm.
 *   2. Bảng kia chỉ có những hành động CÓ NÚT. Nhật ký còn chứa những việc
 *      không ai bấm: hệ thống tự chuyển bước sau khi ký (`PUBLISH_SIGNED`),
 *      quá hạn (`SLA_OVERDUE`), bàn giao khi một tài khoản bị vô hiệu hoá
 *      (`HANDOVER`), khách hàng bị xoá (`CUSTOMER_RETIRED`). Thiếu chúng thì
 *      đúng những dòng khó hiểu nhất lại hiện ra dưới dạng mã viết hoa.
 */
export const NHAN_HANH_DONG: Record<string, string> = {
  CREATE: 'Lập hồ sơ',
  SUBMIT: 'Gửi duyệt',
  RESUBMIT_AFTER_EDIT: 'Gửi lại sau chỉnh sửa',
  TBP_SIGN: 'Trưởng bộ phận ký số',
  PUBLISH_SIGNED: 'Hệ thống chuyển sang Kế toán',
  TBP_RETURN: 'Trưởng bộ phận trả lại để chỉnh sửa',
  TBP_REJECT: 'Trưởng bộ phận từ chối',
  KT_RECEIVE_L1: 'Kế toán tiếp nhận lần 1',
  KT_RETURN_L1: 'Kế toán không tiếp nhận lần 1',
  SA_HANDOVER: 'Sale Admin bàn giao bản cứng',
  KT_RECEIVE_L2: 'Kế toán tiếp nhận lần 2',
  KT_RETURN_L2: 'Kế toán không tiếp nhận lần 2',
  KT_REQUEST_REPRINT: 'Kế toán yêu cầu in lại bản cứng',
  SLA_OVERDUE: 'Quá hạn xử lý',
  HANDOVER: 'Bàn giao do tài khoản bị vô hiệu hoá',
  CUSTOMER_RETIRED: 'Khách hàng bị xoá',
  DELETE: 'Người lập xoá hồ sơ',
};

export const nhanHanhDong = (a: string): string => NHAN_HANH_DONG[a] ?? a;

export const NHAN_VAI_TRO: Record<string, string> = {
  TDV: 'Trình dược viên',
  TBP: 'Trưởng bộ phận',
  KE_TOAN: 'Kế toán',
  SALE_ADMIN: 'Sale Admin',
  BAN_LANH_DAO: 'Ban lãnh đạo',
  QUAN_TRI: 'Quản trị hệ thống',
};
