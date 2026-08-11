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

/** Ba trạng thái tài khoản, theo thứ tự người quản trị cần xử lý. */
export function trangThaiTaiKhoan(u: NguoiDungDto): string {
  if (!u.isActive) return 'Đã vô hiệu hoá';
  if (u.activatedAt === null) return 'Chờ kích hoạt';
  return 'Đang hoạt động';
}

/**
 * Trường nào BẮT BUỘC khi tạo tài khoản vai trò này.
 *
 * Đọc từ đúng thứ máy chủ chặn (`users.service.ts`): TDV không có Trưởng bộ phận
 * quản lý là tài khoản chết — hồ sơ họ gửi không tới ai. Cấp trên thì không bắt
 * buộc: một TDV chưa gán kế toán vẫn gửi được hồ sơ, chỉ là kế toán không thấy
 * trong danh sách của mình.
 */
export const TRUONG_BAT_BUOC: Record<VaiTro, TruongThem[]> = {
  TDV: ['tbp-quan-ly'],
  TBP: [],
  KE_TOAN: [],
  SALE_ADMIN: [],
  BAN_LANH_DAO: [],
  QUAN_TRI: [],
};
