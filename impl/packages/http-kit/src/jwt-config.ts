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

  /**
   * Hạn của refresh token — TRẦN CỦA THỜI GIAN KHÔNG DÙNG, không phải trần của
   * một phiên (`0042`).
   *
   * Refresh token XOAY VÒNG: mỗi lần làm mới, token cũ bị đánh dấu đã dùng và
   * một token mới ra đời với hạn tính lại từ đầu. Nên con số này trả lời đúng
   * một câu — "nghỉ bao lâu thì phải đăng nhập lại" — chứ không phải "được làm
   * việc liên tục bao lâu". Người dùng mở phần mềm mỗi tuần thì không bao giờ
   * gặp lại màn hình đăng nhập.
   *
   * Trước `0042` là 8 giờ, chọn theo ca làm việc. Đổi vì yêu cầu: không phải
   * đăng nhập lại chừng nào KHÔNG CÓ GÌ THAY ĐỔI. Bốn thứ vẫn cắt phiên ngay
   * lập tức, và đó là toàn bộ nghĩa của "có gì thay đổi":
   *
   *   1. Đổi mật khẩu — `revokeAllSessions`, thu hồi mọi refresh token.
   *   2. Vô hiệu hoá tài khoản — mỗi lần làm mới đọc `is_active` tươi từ CSDL.
   *   3. Đăng xuất — thu hồi cả họ token, không riêng cái đang cầm.
   *   4. Dùng lại một token đã xoay vòng — dấu hiệu bị đánh cắp, thu hồi cả họ.
   *
   * Đọc được từ môi trường: máy dùng chung ở quầy nên đặt ngắn, còn máy cá nhân
   * thì để mặc định. Đổi số này KHÔNG cần triển khai lại mã.
   */
  refreshTtlSec: Number(process.env.REFRESH_TTL_SEC ?? 30 * 24 * 60 * 60),

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
