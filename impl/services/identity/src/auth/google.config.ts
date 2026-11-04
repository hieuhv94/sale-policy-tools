/**
 * Cấu hình đăng nhập bằng Google (`0241`).
 *
 * Một PROVIDER chứ không phải một hằng cấp mô-đun như `CONFIG`: bộ kiểm cần bật
 * tính năng với một client id giả mà không phải đặt biến môi trường cho cả lượt
 * chạy — đặt thế thì mọi tệp kiểm khác cũng thấy tính năng bật.
 *
 * Không khai `GOOGLE_CLIENT_ID` là TẮT: nút trên màn hình đăng nhập biến mất và
 * ba đường `/auth/google/*` trả 404. Khai client id mà thiếu secret thì DỪNG lúc
 * khởi động — cùng lối `assertSafeMailConfig`: một service không chạy thì ai
 * cũng thấy ngay, còn một nút bấm vào lần nào cũng hỏng thì chỉ người dùng thấy.
 */
import { readFileSync } from 'node:fs';
import { CONFIG } from '../infra/config.js';

export type CauHinhGoogle = {
  bat: boolean;
  clientId: string;
  clientSecret: string;
  /** Miền Google Workspace (`hd`). Rỗng là nhận mọi tài khoản Google — vẫn phải trùng email đã cấp. */
  hostedDomain: string | null;
  authUrl: string;
  tokenUrl: string;
  /** Địa chỉ Google gọi về — phải khai ĐÚNG NGUYÊN VĂN ở Google Cloud Console. */
  redirectUri: string;
  /** Trang web nhận kết quả. */
  webBaseUrl: string;
};

export const CAU_HINH_GOOGLE = Symbol('CAU_HINH_GOOGLE');

export function docCauHinhGoogle(env: NodeJS.ProcessEnv = process.env): CauHinhGoogle {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const file = env.GOOGLE_CLIENT_SECRET_FILE?.trim();
  // Chỉ đọc tệp khi tính năng BẬT: `env.mau` khai sẵn đường dẫn tệp bí mật, nên
  // một máy chưa bật Google vẫn mang biến ấy mà không có tệp nào ở đó.
  const clientSecret = !clientId
    ? ''
    : (file ? readFileSync(file, 'utf8') : (env.GOOGLE_CLIENT_SECRET ?? '')).trim();
  if (clientId && !clientSecret) {
    throw new Error(
      'Đã khai GOOGLE_CLIENT_ID nhưng thiếu secret: đặt GOOGLE_CLIENT_SECRET_FILE trỏ tới tệp ' +
        'chứa client secret, hoặc bỏ GOOGLE_CLIENT_ID để tắt đăng nhập bằng Google.',
    );
  }
  const webBaseUrl = (env.WEB_BASE_URL ?? CONFIG.webBaseUrl).replace(/\/+$/, '');
  return {
    bat: clientId !== '',
    clientId,
    clientSecret,
    hostedDomain: env.GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase() || null,
    authUrl: env.GOOGLE_AUTH_URL ?? 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
    // Qua Caddy (`/api` bị cắt) rồi gateway (`/auth` -> identity).
    redirectUri: `${webBaseUrl}/api/auth/google/callback`,
    webBaseUrl,
  };
}
