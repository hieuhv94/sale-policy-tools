/**
 * Biểu mẫu tạo người dùng cần trường gì, theo vai trò đang chọn.
 *
 * Khai thành BẢNG TRA chứ không rải `if (vaiTro === …)` trong JSX, vì hai lý do
 * độc lập nhau: `quyen.test.ts` cấm so sánh vai trò bằng chuỗi viết thẳng ngoài
 * `can.ts`, và một bảng đọc được hết trong mười giây thì không có vai trò nào
 * lặng lẽ thiếu trường. P10 đã lập tiền lệ này với `THE_TRANG_THAI`.
 *
 * Đặt ở tệp riêng, KHÔNG nhét vào `can.ts`: đó là bảng phân quyền và `FE-23`
 * quét chính nó — trộn chuyện bố cục biểu mẫu vào là mời người sau sửa quyền
 * lúc đang sửa giao diện.
 */
import type { VaiTro } from './can.js';

export type TruongThem =
  /** Ô chọn Trưởng bộ phận duyệt hồ sơ của TDV này; lưu thành `approverUsername`. */
  | 'tbp-quan-ly'
  /** Ô chọn cấp trên trong cây dữ liệu Sale Admin → kế toán → TDV. */
  | 'cap-tren';

export const TRUONG_THEM: Record<VaiTro, TruongThem[]> = {
  TDV: ['tbp-quan-ly', 'cap-tren'],
  // Trưởng bộ phận đứng ngoài cây dữ liệu: TDV trỏ ngược lên họ, không ngược lại.
  TBP: [],
  KE_TOAN: ['cap-tren'],
  // Sale Admin là gốc của cây dữ liệu, Ban lãnh đạo và Quản trị đứng ngoài cây.
  SALE_ADMIN: [],
  BAN_LANH_DAO: [],
  QUAN_TRI: [],
};

/**
 * Cấp trên của một vai trò PHẢI là vai trò nào — `idn.scope_user_ids` suy phạm
 * vi dữ liệu từ đúng chuỗi này (`0003_identity.sql`). Gán một TDV làm cấp trên
 * của TDV khác thì cây vẫn dựng được nhưng phạm vi đọc ra sai, và không có lỗi
 * nào báo.
 */
export const VAI_TRO_CAP_TREN: Record<VaiTro, VaiTro | null> = {
  TDV: 'KE_TOAN',
  KE_TOAN: 'SALE_ADMIN',
  TBP: null,
  SALE_ADMIN: null,
  BAN_LANH_DAO: null,
  QUAN_TRI: null,
};

/**
 * Nhãn của ô chọn cấp trên, THEO VAI TRÒ đang tạo.
 *
 * Không gọi là "Cấp trên" nữa: kế toán không phải cấp trên của trình dược viên
 * theo nghĩa tổ chức, và gọi vậy trên màn hình là nói sai về công ty. Quan hệ
 * này chỉ là phạm vi dữ liệu — ai nhìn thấy hồ sơ của ai (`idn.scope_user_ids`).
 *
 * Vai trò không có cấp trên thì không có ô này, nên nhãn để chuỗi rỗng.
 */
export const NHAN_CAP_TREN: Record<VaiTro, string> = {
  TDV: 'Kế toán quản lý',
  KE_TOAN: 'Sale Admin quản lý',
  TBP: '',
  SALE_ADMIN: '',
  BAN_LANH_DAO: '',
  QUAN_TRI: '',
};

export const NHAN_VAI_TRO: Record<VaiTro, string> = {
  TDV: 'Trình dược viên',
  TBP: 'Trưởng bộ phận',
  KE_TOAN: 'Kế toán',
  SALE_ADMIN: 'Sale Admin',
  BAN_LANH_DAO: 'Ban lãnh đạo',
  QUAN_TRI: 'Quản trị hệ thống',
};

export type NguoiDungDto = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: VaiTro;
  isActive: boolean;
  activatedAt: string | null;
  approverUsername: string | null;
  approverName: string | null;
  parentUsername: string | null;
};

/**
 * Vai trò nào cần Trưởng bộ phận quản lý thì mới làm được việc của mình.
 *
 * Bảng chứ không `role === 'TDV'`: `quyen.test.ts` cấm so sánh vai trò bằng
 * chuỗi viết thẳng ngoài `can.ts`, và một chỗ sót kiểu đó thì không test nào bắt.
 */
export const CAN_TBP: Record<VaiTro, boolean> = {
  TDV: true,
  TBP: false,
  KE_TOAN: false,
  SALE_ADMIN: false,
  BAN_LANH_DAO: false,
  QUAN_TRI: false,
};

/**
 * Tài khoản này đang kẹt vì thiếu Trưởng bộ phận quản lý.
 *
 * Không phải lỗi dữ liệu — gán sau là hợp lệ — nhưng chừng nào còn thiếu thì
 * TDV đó gửi hồ sơ sẽ bị máy chủ chặn với `NO_APPROVER`, nên danh sách phải
 * chỉ ra được ngay chứ không để người quản trị đọc dấu gạch ngang rồi đoán.
 */
export const thieuTbp = (u: NguoiDungDto): boolean =>
  CAN_TBP[u.role] && u.approverUsername === null;

/** Ba trạng thái tài khoản, theo thứ tự người quản trị cần xử lý. */
export function trangThaiTaiKhoan(u: NguoiDungDto): string {
  if (!u.isActive) return 'Đã vô hiệu hoá';
  if (u.activatedAt === null) return 'Chờ kích hoạt';
  return 'Đang hoạt động';
}

/**
 * Trường nào BẮT BUỘC khi tạo tài khoản vai trò này.
 *
 * Hiện KHÔNG vai trò nào có trường cây bắt buộc, và bảng vẫn giữ lại vì đây là
 * chỗ khai điều đó — xoá bảng đi thì lần sau ai muốn bắt buộc một ô sẽ rải
 * `required` vào JSX.
 *
 * Trưởng bộ phận quản lý ĐÃ TỪNG bắt buộc với TDV và đã bỏ theo yêu cầu: gán
 * sau cũng được, qua hộp thoại Sửa. Cái giá phải biết là hồ sơ do một TDV chưa
 * gán Trưởng bộ phận gửi đi sẽ nằm ở "Chờ TBP duyệt" mà KHÔNG vào hộp việc của
 * ai — hộp việc của TBP suy từ `approver_user_id`. Nên giao diện phải nói rõ
 * chỗ nào chưa gán thay vì chặn (xem ghi chú dưới ô chọn và cột trong bảng).
 */
export const TRUONG_BAT_BUOC: Record<VaiTro, TruongThem[]> = {
  TDV: [],
  TBP: [],
  KE_TOAN: [],
  SALE_ADMIN: [],
  BAN_LANH_DAO: [],
  QUAN_TRI: [],
};
