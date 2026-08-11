/**
 * Cấu hình riêng của identity. Phần dùng chung với service khác (issuer,
 * audience, hạn token, TTL cache) nằm ở `JWT` trong @csbh/http-kit — khai lại ở
 * đây là cách chắc chắn nhất để hai service không xác minh được token của nhau.
 */
import { JWT } from '@csbh/http-kit';

export const CONFIG = {
  issuer: JWT.issuer,
  audUser: JWT.audUser,
  audInternal: JWT.audInternal,
  accessTtlSec: JWT.accessTtlSec,
  refreshTtlSec: JWT.refreshTtlSec,
  accountCacheTtlSec: JWT.accountCacheTtlSec,

  maxFailedAttempts: 5,
  lockMinutes: 15,
  activationTtlHours: 72,
  // Ngắn hơn hẳn thư mời, và có lý do: người quên mật khẩu đang ngồi trước máy,
  // còn một liên kết sống 72 giờ là một liên kết nằm lại trong hộp thư — chỗ có
  // thể bị đọc trộm muộn hơn nhiều so với lúc nó được gửi.
  resetTtlHours: 2,
  // Chặn gửi dồn: đã có liên kết đặt lại còn hạn và chưa dùng trong khoảng này
  // thì không phát hành thêm. `/auth/forgot-password` CÔNG KHAI và nhận tên tài
  // khoản của bất kỳ ai — thiếu chốt này thì nó là một cái vòi bơm thư.
  resetThrottleMinutes: 2,

  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:8080',
  mailFrom: process.env.MAIL_FROM ?? 'csbh-noreply@nutricare.test',
  smtpHost: process.env.SMTP_HOST ?? 'mailpit',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),

  appVersion: process.env.APP_VERSION ?? '0.0.0-dev',
} as const;

export type AppConfig = typeof CONFIG;
