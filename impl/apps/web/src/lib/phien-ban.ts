/**
 * Số phiên bản nhúng lúc build (muc 11).
 *
 * Khai bằng hằng số toàn cục do Vite thay thế, không dùng `import.meta.env`:
 * các test chạy dưới dự án TypeScript của máy chủ, nơi không có kiểu
 * `vite/client`. Giá trị dự phòng để chạy được cả ngoài Vite.
 */
declare const __PHIEN_BAN__: string | undefined;

export const PHIEN_BAN: string =
  typeof __PHIEN_BAN__ === 'string' ? __PHIEN_BAN__ : '0.0.0-dev';
