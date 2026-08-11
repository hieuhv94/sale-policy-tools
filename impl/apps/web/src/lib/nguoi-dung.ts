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
  /** Ô chọn Trưởng bộ phận; lưu xuống thành `departmentCode` của bộ phận người đó duyệt. */
  | 'tbp-quan-ly'
  /** Ô chọn bộ phận + đánh dấu người duyệt chính. Chỉ TBP có. */
  | 'bo-phan-phu-trach'
  /** Ô chọn cấp trên trong cây dữ liệu Sale Admin → kế toán → TDV. */
  | 'cap-tren';

export const TRUONG_THEM: Record<VaiTro, TruongThem[]> = {
  TDV: ['tbp-quan-ly', 'cap-tren'],
  TBP: ['bo-phan-phu-trach'],
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
  departmentCode: string | null;
  departmentName: string | null;
  parentUsername: string | null;
};

export type BoPhanDto = {
  id: string;
  code: string;
  name: string;
  approvers: { userId: string; username: string; fullName: string; isPrimary: boolean }[];
};

/** Ba trạng thái tài khoản, theo thứ tự người quản trị cần xử lý. */
export function trangThaiTaiKhoan(u: NguoiDungDto): string {
  if (!u.isActive) return 'Đã vô hiệu hoá';
  if (u.activatedAt === null) return 'Chờ kích hoạt';
  return 'Đang hoạt động';
}

/**
 * Bộ phận mà một TBP đang duyệt. Dùng để dịch ô chọn "Trưởng bộ phận quản lý"
 * trên biểu mẫu TDV thành `departmentCode` gửi lên máy chủ.
 *
 * Một TBP có thể duyệt nhiều bộ phận; lấy bộ phận đầu tiên theo thứ tự mã. Đó là
 * lựa chọn có chủ ý chứ không phải bỏ sót: giao diện chỉ cho chọn MỘT bộ phận
 * cho TDV, nên phải quyết định ở đâu đó, và quyết định ở đây thì đọc được.
 */
export const boPhanCuaTbp = (ds: BoPhanDto[], userId: string): BoPhanDto | undefined =>
  ds.find((b) => b.approvers.some((a) => a.userId === userId));

/** Mật khẩu mặc định dùng đúng một lần — tài khoản mới luôn phải đổi khi đăng nhập. */
export function matKhauNgauNhien(): string {
  const chu = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const n = new Uint32Array(12);
  crypto.getRandomValues(n);
  return Array.from(n, (x) => chu[x % chu.length]).join('');
}
