/**
 * Nhãn và kiểu dữ liệu cho màn hình Người dùng.
 *
 * TỆP NÀY TỪNG LỚN HƠN NHIỀU. Nó giữ bốn bảng tra dựng ô chọn "Trưởng bộ phận
 * quản lý" và "Cấp trên" theo vai trò đang tạo, cộng một phép kiểm "tài khoản
 * này đang kẹt vì thiếu người duyệt". Cả bốn bảng biến mất ở `0031` cùng với
 * quan hệ quản lý giữa người dùng.
 *
 * Đáng ghi lại: những bảng ấy tồn tại vì biểu mẫu tạo tài khoản phải đổi hình
 * theo vai trò, và mỗi lần đổi hình là một chỗ có thể gán sai. Gán một kế toán
 * vào ô người duyệt là hồ sơ đi vào ngõ cụt — đứng im ở "Chờ TBP duyệt" tới lúc
 * quá hạn, không màn hình nào nói vì sao. Việc chọn người chuyển sang đúng lúc
 * gửi duyệt (`lib/nguoi-xu-ly.ts`) không chỉ gọn hơn: nó đặt quyết định vào chỗ
 * người quyết định đang nhìn thấy hồ sơ, và sai thì thấy ngay.
 */
import type { VaiTro } from './can.js';

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
};

/** Ba trạng thái tài khoản, theo thứ tự người quản trị cần xử lý. */
export function trangThaiTaiKhoan(u: NguoiDungDto): string {
  if (!u.isActive) return 'Đã vô hiệu hoá';
  if (u.activatedAt === null) return 'Chờ kích hoạt';
  return 'Đang hoạt động';
}
