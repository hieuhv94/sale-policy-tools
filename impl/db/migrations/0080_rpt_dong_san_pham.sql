-- `0080` — read-model lưu TỪNG DÒNG SẢN PHẨM, không chỉ số tổng.
--
-- File Excel xuất ra phải có **mỗi sản phẩm một dòng riêng**. Tới `0078` nó chỉ
-- có một cột ghép tên các mặt hàng vào một ô — biết hồ sơ gồm những gì, nhưng
-- không lọc được, không cộng được, không dựng được pivot.
--
-- VÌ SAO LÀ BẢNG CON, KHÔNG PHẢI THÊM MẢNG SONG SONG.
--
-- `rpt.policy_row` đã có `product_codes[]` và `product_names[]` khớp chỉ số với
-- nhau. Thêm `product_net_prices[]`, `product_discounts[]`… là đường ngắn hơn,
-- và là đường đã có một vết xe: `product_group_codes[]` nằm ngay cạnh hai mảng
-- kia nhưng nó đã KHỬ TRÙNG, nên nó KHÔNG khớp chỉ số — một hồ sơ 5 dòng thuộc
-- 2 nhóm có mảng dài 2. Ai đọc lướt sẽ tưởng ba mảng đi cùng nhau và ghép nhầm
-- nhóm cho sản phẩm. Bảng con thì không có chỗ cho hiểu nhầm ấy.
--
-- Bảng này CHỈ ĐỂ ĐỌC theo hồ sơ, và luôn bị xoá sạch rồi ghi lại cả cụm mỗi
-- lần đồng bộ — nên khoá chính là (policy_id, seq) chứ không cần uuid riêng.
--
-- `ON DELETE CASCADE` để dọn theo hồ sơ: read-model không có nghiệp vụ xoá
-- riêng lẻ, và một dòng sản phẩm mồ côi thì không ai phát hiện ra.

CREATE TABLE IF NOT EXISTS rpt.policy_line (
  policy_id     uuid NOT NULL REFERENCES rpt.policy_row(policy_id) ON DELETE CASCADE,
  -- Thứ tự dòng NHƯ NGUỒN trả về (đã sắp theo mã sản phẩm). Giữ thứ tự để hai
  -- lần xuất cùng một bộ lọc cho ra hai file giống hệt nhau — không có nó thì
  -- Postgres được phép trả về theo thứ tự bất kỳ và người dùng không so được
  -- hai file với nhau.
  seq           int  NOT NULL,

  product_code  text NOT NULL,
  product_name  text NOT NULL,
  -- Nhóm của CHÍNH sản phẩm này, không phải tập nhóm của cả hồ sơ.
  group_code    text,

  -- Bốn con số của một dòng CSBH. Lưu `bigint` như nguồn: tiền của hệ này là số
  -- nguyên đồng, và `numeric` ở đây chỉ tổ thêm một lần ép kiểu.
  company_price bigint,
  wholesale_price bigint,
  cpbh_total    bigint,
  net_price     bigint,

  -- Tỷ lệ chiết khấu và ngưỡng áp cho dòng, chép nguyên từ hồ sơ đã đóng băng.
  discount_rate numeric(5,2),
  threshold     numeric(5,2),
  over_threshold boolean,

  PRIMARY KEY (policy_id, seq)
);

-- Truy vấn duy nhất chạm bảng này là "lấy mọi dòng của tập hồ sơ đã lọc", nên
-- khoá chính (policy_id, seq) đã phục vụ đủ. Không thêm chỉ mục nào khác: mỗi
-- chỉ mục thừa là một lần ghi thêm ở MỌI lượt đồng bộ, mà đồng bộ chạy liên tục
-- còn xuất file thì thỉnh thoảng.

GRANT SELECT, INSERT, UPDATE, DELETE ON rpt.policy_line TO csbh_rpt;
