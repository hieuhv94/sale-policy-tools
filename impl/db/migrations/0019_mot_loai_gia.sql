-- =============================================================================
-- 0019_mot_loai_gia — danh mục sản phẩm chỉ còn Giá bán Công ty.
--
-- `GIA_BAN_BUON` rút khỏi danh mục. Không phải vì nó thừa mà vì nó thuộc chỗ
-- khác: giá bán buôn do NGƯỜI ĐỀ NGHỊ nhập trên từng dòng sản phẩm của từng hồ
-- sơ (muc 6.1), khác nhau theo khách hàng và theo lần lập. Một con số cấp danh
-- mục không tả được thứ đó, và thực tế không service nào đọc nó — `catalog`
-- chỉ tra `GIA_BAN_CONG_TY` khi đóng băng giá cho hồ sơ.
--
-- BA quyết định ở đây, mỗi cái tránh một kiểu hỏng riêng:
--
--   1. KHÔNG xoá giá trị khỏi enum `cat.price_type`. Postgres không xoá được
--      một nhãn enum tại chỗ — phải dựng type mới, đổi cột, đổi mọi thứ phụ
--      thuộc. Đổi lại được gì? Không gì cả: chốt chặn thật nằm ở CHECK dưới đây.
--
--   2. KHÔNG xoá dòng lịch sử đã lỡ ghi. Lịch sử giá là bản ghi của một việc đã
--      xảy ra; xoá nó là sửa lại quá khứ để hiện tại trông gọn hơn. Hồ sơ cũ có
--      thể đã tham chiếu tới thời điểm đó.
--
--   3. CHECK để `NOT VALID`. Nó chặn MỌI dòng mới nhưng không quét lại dòng cũ,
--      nên di trú chạy được trên một CSDL đang có dữ liệu `GIA_BAN_BUON` mà
--      không phải chọn giữa "hỏng" và "xoá dữ liệu người ta".
-- =============================================================================

ALTER TABLE cat.product_price
  DROP CONSTRAINT IF EXISTS chi_gia_ban_cong_ty;

ALTER TABLE cat.product_price
  ADD CONSTRAINT chi_gia_ban_cong_ty
  CHECK (price_type = 'GIA_BAN_CONG_TY') NOT VALID;

COMMENT ON CONSTRAINT chi_gia_ban_cong_ty ON cat.product_price IS
  'Danh mục chỉ giữ Giá bán Công ty. Giá bán buôn nhập trên dòng hồ sơ (muc 6.1).';

COMMENT ON TYPE cat.price_type IS
  'GIA_BAN_BUON đã rút khỏi danh mục từ 0019 — giữ nhãn để đọc lại lịch sử cũ.';
