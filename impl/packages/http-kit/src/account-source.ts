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
  /**
   * Họ tên và tên đăng nhập, để NHẬT KÝ ghi được "ai" (`0090`).
   *
   * Đi kèm ở đây chứ không đặt thêm một claim vào JWT: bản ghi này đã được mọi
   * service tra trên MỖI request và đã có cache dùng chung 60 giây, nên hai
   * trường này tới nơi mà không tốn thêm lời gọi nào. Nhét vào token thì tên
   * đóng băng tới lần đăng nhập sau, còn ở đây thì chậm nhất 60 giây là đúng.
   *
   * Không bắt buộc: bản ghi cũ còn trong cache Redis lúc triển khai chưa có hai
   * trường này, và một nhật ký thiếu tên vẫn tốt hơn một request bị từ chối.
   */
  name?: string | undefined;
  username?: string | undefined;
};

export interface AccountSource {
  get(userId: string): Promise<AccountState | undefined>;
}

/** Token tiêm phụ thuộc — mỗi service tự bind vào bản cài đặt phù hợp. */
export const ACCOUNT_SOURCE = Symbol.for('csbh.AccountSource');

export const accountCacheKey = (userId: string): string => `idn:acct:${userId}`;
