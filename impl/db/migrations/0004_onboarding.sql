-- =============================================================================
-- 0004_onboarding — Vòng đời tài khoản (YCNV muc 2.8, nhom test ONB).
--
-- Không có đăng ký công khai. Quản trị hệ thống tạo tài khoản kèm mật khẩu mặc
-- định, hệ thống gửi email mời, người dùng phải tự đặt lại mật khẩu mới dùng được.
-- =============================================================================

ALTER TABLE idn.app_user
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activated_at         timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by           uuid REFERENCES idn.app_user(id);

-- Mốc đổi mật khẩu đi vào access token. Guard so hai giá trị, nên đổi mật khẩu
-- đá văng luôn cả access token đang cầm chứ không chỉ refresh token — nếu thiếu
-- thì phiên bị chiếm vẫn sống thêm 15 phút sau khi nạn nhân đổi mật khẩu (ONB-13).
COMMENT ON COLUMN idn.app_user.password_changed_at IS 'Đưa vào access token để vô hiệu hoá phiên cũ';

-- Hai cột riêng chứ không gộp một, vì trả lời hai câu hỏi khác nhau:
--   activated_at      -> đã tự đặt mật khẩu chưa (đường nào cũng được)
--   email_verified_at -> đã CHỨNG MINH hộp thư có thật chưa (chỉ liên kết email)
-- Gộp lại thì mất khả năng phát hiện quản trị gõ nhầm địa chỉ email.
COMMENT ON COLUMN idn.app_user.activated_at      IS 'Lúc tự đặt lại mật khẩu lần đầu';
COMMENT ON COLUMN idn.app_user.email_verified_at IS 'Chỉ đặt khi kích hoạt qua liên kết trong email';

-- Email là định danh đăng nhập. UNIQUE sẵn có phân biệt hoa thường, nên
-- 'A@x.test' và 'a@x.test' lọt thành hai tài khoản. Chặn ở tầng CSDL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email_ci ON idn.app_user (lower(email));

CREATE TABLE IF NOT EXISTS idn.activation_token (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES idn.app_user(id) ON DELETE CASCADE,
  -- CHỈ lưu bản băm SHA-256 hex. Đọc trộm được bảng này cũng không kích hoạt
  -- hộ được ai. Ràng buộc độ dài chặn luôn khả năng lỡ tay lưu chuỗi thô.
  token_hash text NOT NULL UNIQUE
             CONSTRAINT token_hash_must_be_sha256_hex
             CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES idn.app_user(id)
);
CREATE INDEX IF NOT EXISTS ix_activation_user ON idn.activation_token(user_id);

-- Mọi tài khoản có sẵn trước bản migration này coi như đã kích hoạt và đã xác
-- nhận email — nếu không thì 10 tài khoản mẫu và mọi test cũ đều đứng.
UPDATE idn.app_user
   SET activated_at      = coalesce(activated_at, created_at),
       email_verified_at = coalesce(email_verified_at, created_at)
 WHERE activated_at IS NULL;
