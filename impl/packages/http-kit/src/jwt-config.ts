/**
 * Hằng số xác thực dùng chung cho MỌI service.
 *
 * Để mỗi service tự khai lại issuer và audience là cách chắc chắn nhất để sinh
 * ra hai service không xác minh được token của nhau, và lỗi đó chỉ lộ ra lúc
 * chạy thật chứ không phải lúc biên dịch.
 */
export const JWT = {
  issuer: 'csbh-identity',

  /** Audience tách đôi: token của người dùng KHÔNG gọi được API nội bộ và ngược lại. */
  audUser: 'csbh-app',
  audInternal: 'csbh-internal',

  accessTtlSec: 15 * 60,
  refreshTtlSec: 8 * 60 * 60,

  /** Độ trễ tối đa để tài khoản bị vô hiệu hoá có hiệu lực trên toàn hệ (AUTH-07). */
  accountCacheTtlSec: Number(process.env.ACCOUNT_CACHE_TTL_SEC ?? 60),

  serviceTokenTtlSec: 300,
} as const;

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://redis:6379';

/**
 * Địa chỉ identity trong mạng nội bộ, để service khác hỏi trạng thái tài khoản.
 *
 * Đọc lúc GỌI chứ không phải lúc nạp module: test dựng identity trên một cổng
 * ngẫu nhiên rồi mới dựng service kia, nên hằng số cố định lúc import sẽ trỏ sai.
 */
export const identityUrl = (): string => process.env.IDENTITY_URL ?? 'http://identity:3001';
