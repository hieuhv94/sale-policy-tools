-- =============================================================================
-- 0090 — NHẬT KÝ TRA ĐƯỢC: bốn cột, và một cửa sổ sáu tháng
-- =============================================================================
--
-- Rà nhật ký theo sáu câu hỏi của một cuộc kiểm toán (bản duyệt 22/08) cho ra
-- một kết luận gọn: bảng này ghi đúng, nhưng ĐỌC KHÔNG RA. Bốn cột dưới đây gỡ
-- bốn chỗ mà người mở nhật ký hôm nay phải tự đoán.
--
-- `actor_name` · `actor_username` — AI đã làm việc đó
--
--   Bảng lưu `actor_id` dạng UUID và không lưu tên; màn hình thì chỉ hiện VAI
--   TRÒ. Nên câu hỏi đầu tiên của mọi cuộc kiểm toán — "ai" — là câu duy nhất
--   nhật ký không trả lời được.
--
--   Tra ngược sang bảng tài khoản KHÔNG cứu được, và đây là chỗ dễ nhầm nhất:
--   tài khoản đã vô hiệu hoá bị lọc khỏi các đường tra (chính là cái bẫy `0085`
--   đã gặp với `fromName`), họ tên đổi được, và người dùng bị xoá thì mất hẳn.
--   Ảnh chụp tên TẠI THỜI ĐIỂM xảy ra là cách duy nhất đúng — cũng đúng tinh
--   thần của cả nhật ký: ghi lại sự việc như nó đã là, không như nó trông ra
--   sao hôm nay.
--
-- `outcome` — việc ấy THÀNH hay BẠI
--
--   Tới `0090` mọi dòng đều là việc đã xảy ra, nên không cần cột này. Nhóm sự
--   kiện tài khoản và bảo mật sắp thêm thì có cả việc BỊ TỪ CHỐI — đăng nhập
--   sai, vượt quyền — và một cột thành/bại tách hai loại ấy ra, thay vì bắt
--   người đọc suy từ tên hành động.
--
-- `target_label` — đối tượng ĐỌC ĐƯỢC
--
--   `entity_id` là UUID. Người đọc cần "CSBH-2026-000130" hay "KH-0006 · Nhà
--   thuốc Minh Châu", không phải một chuỗi 36 ký tự phải đi tra ở màn hình khác
--   mới biết nó là cái gì.
--
-- KHÔNG backfill. Dòng cũ để trống bốn cột này, và đó là câu trả lời trung thực
-- duy nhất: dữ liệu ấy chưa từng được ghi, nên bịa ra bằng cách tra bảng tài
-- khoản hôm nay là đưa TÊN HIỆN TẠI vào một sự việc của quá khứ.
--
-- Bảng đã phân vùng theo tháng từ `0008`, nên `ALTER` chạy trên bảng cha và mọi
-- vùng con nhận cột mới cùng lúc.
-- =============================================================================

ALTER TABLE aud.audit_log ADD COLUMN IF NOT EXISTS actor_name     text;
ALTER TABLE aud.audit_log ADD COLUMN IF NOT EXISTS actor_username text;
ALTER TABLE aud.audit_log ADD COLUMN IF NOT EXISTS outcome        text;
ALTER TABLE aud.audit_log ADD COLUMN IF NOT EXISTS target_label   text;

COMMENT ON COLUMN aud.audit_log.actor_name IS
  'Ảnh chụp họ tên lúc xảy ra. Không tra lại từ idn: tài khoản đã khoá bị lọc, tên đổi được.';
COMMENT ON COLUMN aud.audit_log.outcome IS
  'OK | FAILED | NULL. NULL là dòng cũ hoặc hành động không có khái niệm thành/bại.';
COMMENT ON COLUMN aud.audit_log.target_label IS
  'Nhãn người đọc được của đối tượng: mã hồ sơ, mã và tên khách hàng, tên đăng nhập.';

-- Lọc theo HÀNH ĐỘNG là tiêu chí hay dùng thứ hai sau khoảng thời gian ("tháng
-- này có ai đăng nhập hỏng không"). Khoảng thời gian đã được phân vùng lo, nên
-- chỉ cần một chỉ mục cho vế còn lại.
--
-- Đặt trên bảng CHA: Postgres tự tạo chỉ mục tương ứng ở mọi vùng con, kể cả
-- vùng sinh ra sau này — thiếu bước ấy thì tháng sau chỉ mục lặng lẽ biến mất.
CREATE INDEX IF NOT EXISTS ix_audit_action ON aud.audit_log (action, occurred_at DESC);
