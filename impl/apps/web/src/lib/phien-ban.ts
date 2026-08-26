/**
 * Số phiên bản nhúng lúc build (muc 11).
 *
 * Khai bằng hằng số toàn cục do Vite thay thế, không dùng `import.meta.env`:
 * các test chạy dưới dự án TypeScript của máy chủ, nơi không có kiểu
 * `vite/client`. Giá trị dự phòng để chạy được cả ngoài Vite.
 *
 * Hằng này dựng từ P7d và **không có ai đọc cho tới `0118`** — chân thanh bên
 * ghi cứng chuỗi "Phiên bản demo", nên nó hiện y như vậy trên chồng production
 * đang chạy thật. VER-05 đòi đúng điều ngược lại: mở màn hình nào cũng đọc được
 * số phiên bản, để người dùng báo lỗi thì kèm luôn bản đang chạy.
 *
 * Vì sao là số NHÚNG LÚC BUILD chứ không phải `x-app-version` của máy chủ: đây
 * là bản mà **trình duyệt đang chạy**. Hai số ấy lệch nhau đúng ở tình huống
 * đáng nói nhất — tab mở từ sáng, máy chủ nâng cấp lúc trưa — và lúc đó số của
 * máy chủ sẽ nói dối về thứ người dùng đang nhìn. So hai số để mời tải lại là
 * VER-07, một việc khác và chưa làm.
 */
declare const __PHIEN_BAN__: string | undefined;

export const PHIEN_BAN: string =
  typeof __PHIEN_BAN__ === 'string' ? __PHIEN_BAN__ : '0.0.0-dev';
