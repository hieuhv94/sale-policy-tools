-- =============================================================================
-- 0018_quen_mat_khau — token đặt lại mật khẩu, dùng chung bảng với token kích hoạt.
--
-- Hai loại token có VÒNG ĐỜI GIỐNG HỆT NHAU: một lần dùng, có hạn, thu hồi được,
-- chỉ lưu bản băm, và đều đi tới hộp thư của chính chủ. Tách bảng thứ hai là
-- chép lại cả bộ máy đó — kèm nguy cơ sửa một bên quên bên kia ở đúng những chỗ
-- không được sai.
--
-- Vẫn phân biệt LOẠI, vì ba thứ khác nhau:
--   * hạn — thư mời 72 giờ (người mới có thể chưa mở hộp thư), đặt lại 2 giờ
--     (người đang ngồi trước máy, và liên kết sống lâu là liên kết nằm lại
--     trong hộp thư của ai đó);
--   * nội dung thư;
--   * không cho dùng chéo — token của thư mời không nộp được vào đường đặt lại
--     và ngược lại.
--
-- Cả hai đều đặt `email_verified_at`: thứ cột đó ghi nhận là "hộp thư này có
-- thật và người dùng đọc được nó" (0004), mà đi qua được liên kết đặt lại thì
-- chứng minh đúng điều ấy chẳng kém gì liên kết kích hoạt.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE idn.token_purpose AS ENUM ('ACTIVATE', 'RESET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mặc định `ACTIVATE`: mọi dòng có sẵn đều là token của thư mời.
ALTER TABLE idn.activation_token
  ADD COLUMN IF NOT EXISTS purpose idn.token_purpose NOT NULL DEFAULT 'ACTIVATE';

-- Tra theo (người dùng, loại) là truy vấn của cả hai đường: phát hành token mới
-- thì phải thu hồi token CÙNG LOẠI đang treo, và không được đụng loại kia.
--
-- Không đụng loại kia là một yêu cầu về AN TOÀN, không phải chuyện gọn gàng:
-- `/auth/forgot-password` công khai và nhận tên tài khoản của bất kỳ ai. Nếu nó
-- thu hồi luôn token kích hoạt đang treo thì người ngoài chỉ cần gọi lặp lại là
-- vô hiệu hoá được mọi thư mời vừa gửi đi.
CREATE INDEX IF NOT EXISTS ix_activation_user_purpose
  ON idn.activation_token(user_id, purpose);

COMMENT ON COLUMN idn.activation_token.purpose IS
  'ACTIVATE = liên kết trong thư mời (72 giờ). RESET = liên kết quên mật khẩu (2 giờ).';
