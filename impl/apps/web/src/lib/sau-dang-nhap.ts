/**
 * Đăng nhập xong thì vào màn hình nào (`0041`).
 *
 * Hai tình huống trông giống hệt nhau ở tầng mã — người dùng chưa đăng nhập, và
 * thanh địa chỉ đang trỏ vào một đường không phải `/` — nhưng người dùng muốn
 * hai kết cục ngược nhau:
 *
 *   1. **Tab cũ mở lại.** Đường dẫn là màn hình họ dùng lần trước, thường là một
 *      danh sách hay một màn hình quản trị. Không ai chủ ý muốn quay lại đó, và
 *      với vai trò không xem được màn hình ấy thì họ rơi thẳng vào "Bạn không có
 *      quyền" ngay sau khi đăng nhập thành công.
 *   2. **Liên kết trong thư báo.** Người dùng vừa bấm vào một hồ sơ CỤ THỂ vì họ
 *      cần xem chính hồ sơ đó. Đá họ về trang tổng quan là làm mất đúng thứ họ
 *      vừa bấm, và không có cách nào tìm lại ngoài mở lại hộp thư.
 *
 * Tín hiệu duy nhất phân biệt được hai vế: **đường dẫn có trỏ vào một bản ghi cụ
 * thể không**. Danh sách và màn hình quản trị thì không; `/ho-so/<id>` thì có.
 *
 * Bảng dưới đây vì thế chỉ chứa đường dẫn CÓ THAM SỐ. Thêm một đường không tham
 * số vào đây là mở lại đúng tình huống 1.
 */
import { khop } from './router.js';

/**
 * Đường dẫn giữ nguyên sau khi đăng nhập.
 *
 * Hai dòng đầu là hai liên kết duy nhất xuất hiện trong thư báo (xem
 * `templates.ts`): mở hồ sơ, và xem nhật ký hồ sơ.
 */
export const GIU_DUONG = ['/ho-so/:id', '/ho-so/:id/nhat-ky', '/khach-hang/:id'];

/**
 * `/ho-so/moi` KHỚP mẫu `/ho-so/:id` mà KHÔNG phải một bản ghi.
 *
 * Cùng cái bẫy `App.tsx` đã dính và phải xử bằng thứ tự. Ở đây không có thứ tự
 * nào để dựa vào nên phải loại thẳng — và loại là đúng: đó là biểu mẫu lập hồ sơ
 * mới, mà phiên mất thì nội dung đang gõ cũng mất theo (phiên nằm ở
 * `sessionStorage`). Trả người dùng về một biểu mẫu trống không giúp được gì.
 */
const KHONG_PHAI_BAN_GHI = ['/ho-so/moi'];

export function duongSauDangNhap(duongHienTai: string): string {
  if (KHONG_PHAI_BAN_GHI.includes(duongHienTai)) return '/';
  return GIU_DUONG.some((mau) => khop(mau, duongHienTai) !== null) ? duongHienTai : '/';
}
