/** Toàn bộ hằng số cấu hình của identity, gom một chỗ để test đọc được đúng giá trị đang chạy. */
export const CONFIG = {
  issuer: 'csbh-identity',

  /** Audience tách đôi: token của người dùng KHÔNG gọi được API nội bộ và ngược lại (AUTH-21). */
  audUser: 'csbh-app',
  audInternal: 'csbh-internal',

  accessTtlSec: 15 * 60,
  refreshTtlSec: 8 * 60 * 60,

  /** Cache trạng thái tài khoản. Vô hiệu hoá tài khoản có xoá cache ngay, nên
   *  60 giây là ĐỘ TRỄ TỐI ĐA cho thay đổi đi vòng ngoài API (AUTH-07). */
  accountCacheTtlSec: Number(process.env.ACCOUNT_CACHE_TTL_SEC ?? 60),

  maxFailedAttempts: 5,
  lockMinutes: 15,
  activationTtlHours: 72,

  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:8080',
  mailFrom: process.env.MAIL_FROM ?? 'csbh-noreply@nutricare.test',
  smtpHost: process.env.SMTP_HOST ?? 'mailpit',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),

  appVersion: process.env.APP_VERSION ?? '0.0.0-dev',
} as const;

export type AppConfig = typeof CONFIG;
