/**
 * Nguồn trạng thái tài khoản mà guard tra cứu trên mỗi request.
 *
 * Có hai bản cài đặt vì hai hoàn cảnh khác nhau:
 *   - identity SỞ HỮU lược đồ idn nên đọc thẳng CSDL;
 *   - chín service kia không có quyền trên schema idn (ranh giới AD-02) nên
 *     phải hỏi identity qua API nội bộ.
 *
 * Cả hai dùng CHUNG một khoá Redis. Nhờ vậy identity xoá cache là mọi service
 * thấy ngay, và cam kết "chậm nhất 60 giây" đúng trên toàn hệ chứ không riêng
 * identity.
 */
export type AccountState = {
  id: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  /** epoch MILI giây — giây là quá thô, xem ghi chú ở AuthGuard. */
  passwordChangedAt: number;
};

export interface AccountSource {
  get(userId: string): Promise<AccountState | undefined>;
}

/** Token tiêm phụ thuộc — mỗi service tự bind vào bản cài đặt phù hợp. */
export const ACCOUNT_SOURCE = Symbol.for('csbh.AccountSource');

export const accountCacheKey = (userId: string): string => `idn:acct:${userId}`;
