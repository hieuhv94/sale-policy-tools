-- `0126` — LỊCH SỬ GIÁ GIỮ ĐỦ MỌI LẦN SỬA, kể cả nhiều lần trong cùng một ngày.
--
-- Tới `0125` bảng này có `UNIQUE (product_id, price_type, effective_from)`, và
-- hai đường ghi giá đều dùng `ON CONFLICT … DO UPDATE`. Nghĩa là sửa giá lần thứ
-- hai trong ngày ĐÈ lên lần thứ nhất: con số cũ biến mất, và không ai biết trong
-- ngày ấy đã có mấy lần đổi.
--
-- Khách hàng chốt 26/08: lịch sử phải giữ đủ.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO PHẢI THÊM MỘT CỘT, KHÔNG CHỈ GỠ RÀNG BUỘC
-- ---------------------------------------------------------------------------
--
-- Gỡ ràng buộc thì hai dòng cùng ngày cùng tồn tại, và câu hỏi "giá hiện hành là
-- bao nhiêu" mất câu trả lời: mọi chỗ chọn giá đều làm
--
--     ORDER BY effective_from DESC LIMIT 1
--
-- và hai dòng bằng nhau ở khoá ấy thì Postgres trả về dòng nào cũng đúng luật.
-- Giá bán Công ty đổi theo thứ tự đọc đĩa — ở màn hình, ở lúc đóng băng vào hồ
-- sơ, ở bản dựng văn bản.
--
-- Hai ứng viên làm khoá phân xử, và cả hai đều KHÔNG dùng được:
--
--   `id`         `uuid DEFAULT gen_random_uuid()` — ngẫu nhiên, không tăng dần.
--   `created_at` `now()` là giờ MỞ TRANSACTION, nên hai dòng ghi trong cùng một
--                transaction mang y hệt một giá trị. Hôm nay chưa có đường nào
--                ghi hai dòng giá cho cùng một sản phẩm trong một transaction,
--                nhưng đó là một tính chất của mã hiện tại, không phải một bảo
--                đảm của lược đồ.
--
-- Nên thêm `stt` — một dãy số tăng dần, tăng theo từng dòng chứ không theo từng
-- transaction. Nó là khoá phân xử duy nhất chịu được mọi cách ghi.
--
-- Dữ liệu cũ: mỗi (sản phẩm, loại giá, ngày) có đúng một dòng — ràng buộc cũ bảo
-- đảm điều đó — nên không có hoà nào để mà phân xử sai, và `stt` gán theo thứ tự
-- vật lý là an toàn.

ALTER TABLE cat.product_price
  DROP CONSTRAINT IF EXISTS product_price_product_id_price_type_effective_from_key;

ALTER TABLE cat.product_price
  ADD COLUMN IF NOT EXISTS stt bigserial;

-- Chỉ mục tra giá đi theo ĐÚNG thứ tự mà mọi truy vấn chọn giá dùng. Thiếu `stt`
-- ở đây thì Postgres vẫn trả đúng kết quả, nhưng phải sắp lại từng lượt.
DROP INDEX IF EXISTS cat.ix_price_lookup;
CREATE INDEX IF NOT EXISTS ix_price_lookup
  ON cat.product_price(product_id, price_type, effective_from DESC, stt DESC);
