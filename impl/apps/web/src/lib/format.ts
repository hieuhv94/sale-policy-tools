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

/** Nhãn tiếng Việt của 11 trạng thái (muc 4). Danh sách ĐÓNG. */
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
};

export const nhanTrangThai = (s: string): string => NHAN_TRANG_THAI[s] ?? s;

/** Nhóm màu của trạng thái — dùng cho lớp CSS, không phải mã màu. */
export function nhomTrangThai(s: string): 'tot' | 'cho' | 'loi' | 'canh-bao' | 'thuong' {
  if (s === 'DANG_CO_HIEU_LUC') return 'tot';
  if (s === 'TU_CHOI') return 'loi';
  if (s === 'QUA_HAN_DUYET' || s === 'YEU_CAU_CHINH_SUA') return 'canh-bao';
  if (s.startsWith('CHO_') || s === 'SA_DANG_XU_LY' || s === 'TBP_DA_KY_SO') return 'cho';
  return 'thuong';
}

export const NHAN_VAI_TRO: Record<string, string> = {
  TDV: 'Trình dược viên',
  TBP: 'Trưởng bộ phận',
  KE_TOAN: 'Kế toán',
  SALE_ADMIN: 'Sale Admin',
  BAN_LANH_DAO: 'Ban lãnh đạo',
  QUAN_TRI: 'Quản trị hệ thống',
};
