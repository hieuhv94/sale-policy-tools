/**
 * Công tắc tính năng — thứ đã viết xong nhưng CHƯA MỞ cho người dùng (`0239`).
 *
 * `yeuCauCapNhat`: báo hồ sơ CSBH lệch khi giá sản phẩm hoặc quy định chiết
 * khấu đổi — box *Yêu cầu cập nhật* trên Tổng quan, khối cảnh báo lệch trên
 * trang hồ sơ, nút *Tự động cập nhật*, và câu hậu quả nhắc tới box ấy ở hộp sửa
 * sản phẩm / khách hàng. Khách hàng chốt 24/10: để sang phiên bản sau.
 *
 * Ở GÓI NÀY vì đây là chỗ DUY NHẤT cả `policy` lẫn `apps/web` cùng đọc (`0193`):
 * hai bản công tắc là hai bản sẽ lệch, và lệch theo chiều nào cũng hỏng — máy
 * chủ tắt mà giao diện bật là một nút bấm vào ra 404; ngược lại là máy chủ vẫn
 * trả dữ liệu cho một màn hình không bày nó.
 *
 * CHỈ CHẶN ĐƯỜNG RA, không chặn đường làm dữ liệu: consumer vẫn ghi
 * `pol.policy_impact` khi danh mục đổi, nên ngày bật lên thì box có ngay dữ liệu
 * đúng, không phải đợi lượt đổi danh mục kế tiếp.
 *
 * BẬT Ở PHIÊN BẢN SAU: đổi `TINH_NANG_MAC_DINH`, cùng lượt ấy đổi ca ghim mặc
 * định ở `tests/http/tinh-nang.test.ts` và câu ở HDSD.
 *
 * `TINH_NANG` là bản ĐỔI ĐƯỢC chỉ để bộ kiểm bật lên (`tests/bat-tinh-nang.ts`)
 * — các ca của tính năng vẫn chạy nguyên vẹn. Mã sản phẩm không ghi vào nó.
 */
export const TINH_NANG_MAC_DINH = Object.freeze({
  yeuCauCapNhat: false,
});

export type TenTinhNang = keyof typeof TINH_NANG_MAC_DINH;

export const TINH_NANG: Record<TenTinhNang, boolean> = { ...TINH_NANG_MAC_DINH };

/** Đọc lúc GỌI, không chụp lúc nạp mô-đun — bộ kiểm đổi công tắc giữa các ca. */
export const batTinhNang = (ten: TenTinhNang): boolean => TINH_NANG[ten];
