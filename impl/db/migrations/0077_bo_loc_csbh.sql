-- `0077` — bộ lọc CSBH nhận nhiều giá trị mỗi tiêu chí.
--
-- Chỉ MỘT việc ở tầng CSDL: chỉ mục cho phép so mã khách hàng.
--
-- Điều kiện lọc mã khách hàng viết là `upper(btrim(customer_code)) = …` từ ngày
-- đầu, để khớp đúng cách `cus.customer` chống trùng mã. Nhưng chỉ mục đang có là
--
--     ix_rpt_customer ON rpt.policy_row (customer_code)
--
-- và Postgres KHÔNG dùng được nó cho một biểu thức bọc hàm quanh cột. Nghĩa là
-- mọi lượt lọc theo mã khách hàng đều quét toàn bảng, suốt từ `0016` tới giờ —
-- không ai thấy vì hai mươi nghìn dòng quét vẫn trả về trong vài chục mili giây.
--
-- `0077` làm chuyện ấy nặng thêm: một bộ lọc giờ mang tới 50 mã một lúc. Nên vá
-- luôn ở đây, dù đây là lỗ có sẵn chứ không phải chi phí của đợt này.
--
-- KHÔNG bỏ `ix_rpt_customer`: nó vẫn phục vụ mọi truy vấn so mã thẳng, và một
-- chỉ mục thừa trên bảng đọc rẻ hơn nhiều so với một lần đoán sai.
--
-- Không cần chỉ mục nào cho *Tên sản phẩm*: từ `0077` tiêu chí ấy khớp bằng `&&`
-- trên `product_names_norm`, và `ix_rpt_pnames` (GIN) đã phục vụ đúng phép ấy.

CREATE INDEX IF NOT EXISTS ix_rpt_customer_norm
  ON rpt.policy_row (upper(btrim(customer_code)));
