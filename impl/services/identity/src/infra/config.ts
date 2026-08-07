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

  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:8080',
  mailFrom: process.env.MAIL_FROM ?? 'csbh-noreply@nutricare.test',
  smtpHost: process.env.SMTP_HOST ?? 'mailpit',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),

  appVersion: process.env.APP_VERSION ?? '0.0.0-dev',
} as const;

export type AppConfig = typeof CONFIG;
