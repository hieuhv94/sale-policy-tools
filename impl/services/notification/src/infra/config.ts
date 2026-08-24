/**
 * Cấu hình thư của `notification` — nội dung thật nằm ở `@csbh/http-kit`.
 *
 * Chuyển sang đó ở P14a vì `identity` cũng gửi thư và cần ĐÚNG bộ biến môi
 * trường cùng ĐÚNG hai chốt an toàn. Giữ tệp này làm lớp chuyển tiếp để mọi
 * import sẵn có không phải đổi, và để chỗ đọc mã còn thấy đường đi.
 */
export {
  assertSafeMailConfig,
  chuanHoaMienThu,
  isExternalRelay,
  isFakeRelay,
  loadMailConfig,
  thuocMienThu,
  tuyChonSmtp,
  UnsafeMailConfigError,
  type MailConfig,
  type MailEnv,
} from '@csbh/http-kit';
