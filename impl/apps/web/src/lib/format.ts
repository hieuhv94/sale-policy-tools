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

/**
 * HÔM NAY theo giờ Việt Nam, dạng `YYYY-MM-DD` (`0128`).
 *
 * KHÔNG dùng `new Date().toISOString().slice(0, 10)` để so với ngày do máy chủ
 * trả về. `toISOString` cho ra ngày theo UTC, còn `current_date` của Postgres
 * chạy theo múi giờ Việt Nam — nên từ 00:00 tới 07:00 giờ Việt Nam hai bên lệch
 * nhau ĐÚNG MỘT NGÀY.
 *
 * Đo được: ca kiểm `0123` đỏ với `expected '2026-08-27' to be '2026-08-26'`, và
 * nó chỉ đỏ trong bảy giờ mỗi ngày. Cùng phép so ấy chạy ở nhãn *Đang áp dụng*
 * của lịch sử giá, nên trong bảy giờ ấy dòng giá của hôm nay bị dán nhãn *Chưa
 * hiệu lực*.
 */
export function homNayVN(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

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

/**
 * Nhãn tiếng Việt của 11 trạng thái (muc 4, `0035`, `0064`). Danh sách ĐÓNG.
 *
 * `TBP_DA_KY_SO` rời khỏi đây ở `0064`, và giá trị enum trong CSDL cũng đã bị
 * gỡ ở migration `0048` — không dòng dữ liệu nào còn mang nó, kể cả trong lịch
 * sử, nên không cần giữ nhãn để đọc dòng cũ.
 */
export const NHAN_TRANG_THAI: Record<string, string> = {
  NHAP: 'Nháp',
  CHO_TBP_DUYET: 'Chờ TBP duyệt',
  CHO_KT_L1: 'Chờ KT duyệt L1',
  SA_DANG_XU_LY: 'Sale Admin đang xử lý',
  CHO_KT_L2: 'KT duyệt bản cứng',
  DANG_CO_HIEU_LUC: 'Đang có hiệu lực',
  HET_HIEU_LUC: 'Hết hiệu lực',
  YEU_CAU_CHINH_SUA: 'Yêu cầu chỉnh sửa',
  QUA_HAN_DUYET: 'Quá hạn duyệt',
  DA_XOA: 'Đã xoá',
};

export const nhanTrangThai = (s: string): string => NHAN_TRANG_THAI[s] ?? s;

/**
 * Nhóm màu của trạng thái — tên lớp CSS, không phải mã màu (`0064`).
 *
 * Tới `0063` hàm này gom mười hai trạng thái vào NĂM nhóm chung, và bốn bước
 * chờ rơi hết vào một nhóm. Hệ quả trên màn hình: dải thẻ của Ban lãnh đạo có
 * năm ô cùng một màu, nên không ai đọc được hồ sơ đang tắc ở đâu nếu không đọc
 * chữ trên từng ô.
 *
 * Giờ là một BẢNG TRA, mỗi trạng thái một dòng — không còn `if` nào suy màu từ
 * tiền tố `CHO_`. Phép suy ấy chính là thứ đã trói bốn bước chờ vào một màu, và
 * nó cũng sẽ lặng lẽ nuốt bất kỳ trạng thái mới nào bắt đầu bằng `CHO_`.
 *
 * Hai nhóm dùng chung màu, do khách hàng chốt ngày 19/08:
 *   - `QUA_HAN_DUYET` → `hong`. Ngõ cụt do hết hạn, và người dùng đọc nó là một
 *     hồ sơ HỎNG chứ không phải một hồ sơ đã đóng gọn ghẽ.
 *   - `HET_HIEU_LUC` + `DA_XOA` → `ket-thuc`. Đã rời khỏi luồng, không đòi ai gì.
 *
 * `TU_CHOI` từng dùng chung màu `hong` với `QUA_HAN_DUYET`; `0155` bỏ hẳn trạng
 * thái ấy, nên `hong` giờ chỉ còn một dòng.
 */
const NHOM_MAU: Record<string, string> = {
  NHAP: 'nhap',
  CHO_TBP_DUYET: 'tbp',
  CHO_KT_L1: 'kt1',
  SA_DANG_XU_LY: 'sa',
  CHO_KT_L2: 'kt2',
  DANG_CO_HIEU_LUC: 'hieu-luc',
  HET_HIEU_LUC: 'ket-thuc',
  YEU_CAU_CHINH_SUA: 'sua',
  QUA_HAN_DUYET: 'hong',
  DA_XOA: 'ket-thuc',
};

/** Trạng thái lạ vẫn vẽ được — xám trung tính, không phải một ô mất màu. */
export const nhomTrangThai = (s: string): string => NHOM_MAU[s] ?? 'ket-thuc';

/**
 * Nhãn cho MỘT DÒNG NHẬT KÝ, viết ở thì đã xảy ra (`0036`).
 *
 * KHÔNG dùng lại `HANH_DONG_NHAN` ở `can.ts`, và khác biệt là có chủ ý ở hai
 * điểm:
 *
 *   1. Bảng kia là nhãn NÚT — mệnh lệnh, "Ký số duyệt". Đọc một dòng lịch sử
 *      ghi "Ký số duyệt" thì nghe như một việc đang chờ làm.
 *   2. Bảng kia chỉ có những hành động CÓ NÚT. Nhật ký còn chứa những việc
 *      không ai bấm: quá hạn (`SLA_OVERDUE`), bàn giao khi một tài khoản bị vô
 *      hiệu hoá (`HANDOVER`), khách hàng bị xoá (`CUSTOMER_RETIRED`). Thiếu chúng thì
 *      đúng những dòng khó hiểu nhất lại hiện ra dưới dạng mã viết hoa.
 */
export const NHAN_HANH_DONG: Record<string, string> = {
  CREATE: 'Lập hồ sơ',
  SUBMIT: 'Gửi duyệt',
  RESUBMIT_AFTER_EDIT: 'Gửi lại sau chỉnh sửa',
  TBP_SIGN: 'Trưởng bộ phận ký số',
  TBP_RETURN: 'Trưởng bộ phận trả lại để chỉnh sửa',
  // `0185` — nói rõ họ RÚT LẠI CHỮ KÝ, không phải trả lại như ở bước duyệt: hai
  // dòng lịch sử này đọc gần giống nhau mà xảy ra ở hai chỗ khác hẳn.
  TBP_RECALL: 'Trưởng bộ phận hoàn duyệt, rút lại chữ ký',
  /*
   * GIỮ LẠI dù hành động đã bỏ (`0155`).
   *
   * Bảng này dịch mã hành động trong NHẬT KÝ HỒ SƠ, và nhật ký kể chuyện đã xảy
   * ra. Hồ sơ bị từ chối trước 29/08 vẫn còn dòng `TBP_REJECT` của chúng; gỡ
   * nhãn là bày mã trần ra màn hình ở đúng chỗ người ta vào để đọc lịch sử.
   */
  TBP_REJECT: 'Trưởng bộ phận từ chối',
  KT_RECEIVE_L1: 'Kế toán tiếp nhận lần 1',
  KT_RETURN_L1: 'Kế toán không tiếp nhận lần 1',
  SA_HANDOVER: 'Sale Admin bàn giao bản cứng',
  KT_RECEIVE_L2: 'Kế toán tiếp nhận lần 2',
  KT_RETURN_L2: 'Kế toán không tiếp nhận lần 2',
  KT_REQUEST_REPRINT: 'Kế toán yêu cầu in lại bản cứng',
  SLA_OVERDUE: 'Quá hạn xử lý',
  SLA_DISCARDED: 'Hệ thống xoá hồ sơ quá hạn quá 3 ngày',
  HANDOVER: 'Bàn giao do tài khoản bị vô hiệu hoá',
  CUSTOMER_RETIRED: 'Khách hàng bị xoá',
  DELETE: 'Người lập xoá hồ sơ',
  /*
   * Hai dòng TẢI BẢN CỨNG (`0052`, N-01, thu hẹp ở `0059`).
   *
   * Chúng không phải bước duyệt — hồ sơ không đi đâu cả — nhưng chúng thuộc về
   * lịch sử của hồ sơ đúng nghĩa: muc 10 đòi lưu ai đã tải bản scan, và trước
   * `0052` không đường tải nào để lại vết nào.
   *
   * XEM thì KHÔNG ghi. Một dòng cho mỗi lần liếc màn hình sẽ dìm chết những
   * dòng nói về bước duyệt — thứ mà lịch sử sinh ra để kể.
   *
   * `TAI_HO_SO` và `TAI_HOP_DONG` ĐÃ GỠ (`0059`): khách hàng bỏ yêu cầu ghi
   * lịch sử cho bản mềm và hợp đồng, và migration `0059` xoá luôn những dòng đã
   * ghi — không còn dòng nào để mà đặt nhãn.
   */
  TAI_BAN_SCAN: 'Tải bản scan bản cứng',
  TAI_TEP_DINH_KEM: 'Tải tệp đính kèm',
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
