/**
 * Bộ kiểm chạy với MỌI tính năng đang bật (`0239`).
 *
 * Tính năng chưa mở cho người dùng vẫn là mã đang sống — các ca của nó phải tiếp
 * tục canh nó, nếu không thì ngày bật lên là ngày bật một thứ đã trôi mà không ai
 * thấy. Ca nào kiểm trạng thái TẮT thì tự tắt rồi trả lại (`tests/http/tinh-nang.test.ts`).
 *
 * `setupFiles` chạy lại ở MỖI tệp kiểm, trong cùng đồ thị mô-đun với tệp ấy, nên
 * service dựng trong tiến trình và giao diện đọc đúng đối tượng vừa đổi.
 */
import { TINH_NANG, type TenTinhNang } from '@csbh/domain-policy';

for (const ten of Object.keys(TINH_NANG) as TenTinhNang[]) TINH_NANG[ten] = true;
