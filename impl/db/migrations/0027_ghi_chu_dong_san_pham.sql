-- =============================================================================
-- 0027_ghi_chu_dong_san_pham — mỗi dòng sản phẩm trong hồ sơ có một ô ghi chú.
--
-- Cột text tự do, không cấu trúc, không ai đọc bằng máy. Đó chính là công dụng:
-- mọi hồ sơ đều có vài chuyện chỉ đúng cho một dòng — "giá theo thoả thuận
-- tháng 8", "khách yêu cầu đóng thùng 12" — và chỗ duy nhất để ghi chúng hiện
-- nay là không có chỗ nào. Không có ô ghi chú thì người lập nhét vào tên sản
-- phẩm hoặc gọi điện nói miệng, và bản CSBH ký tên không mang thông tin ấy.
--
-- KHÔNG đóng băng, KHÔNG snapshot: đây là chữ người dùng gõ vào chính dòng này,
-- không phải bản sao của dữ liệu ở nơi khác. Mọi cột `*_snap` cạnh nó đều là ảnh
-- chụp của danh mục, cột này thì không có bản gốc nào để chụp.
--
-- Ghi chú THEO PHIÊN BẢN, và nó đi theo dòng khi hồ sơ lên phiên bản mới — cùng
-- luật với `wholesale_price` và các khoản CPBH: phiên bản mới chứa lại toàn bộ
-- sản phẩm cũ, nên nó phải chứa lại cả ghi chú của từng dòng.
-- =============================================================================

ALTER TABLE pol.policy_line ADD COLUMN IF NOT EXISTS note text;

-- Chuỗi rỗng và NULL cùng nghĩa "không ghi chú", mà hai cách viết cùng một nghĩa
-- là hai cách để một bộ lọc sót. Chặn chuỗi rỗng ở CSDL, để tầng ứng dụng không
-- phải nhớ chuẩn hoá — nó đã quên một lần ở `delivery_address`.
ALTER TABLE pol.policy_line DROP CONSTRAINT IF EXISTS ghi_chu_khong_rong;
ALTER TABLE pol.policy_line
  ADD CONSTRAINT ghi_chu_khong_rong CHECK (note IS NULL OR btrim(note) <> '');

COMMENT ON COLUMN pol.policy_line.note IS
  'Ghi chú tự do của người lập cho riêng dòng này. NULL = không có (0027).';
