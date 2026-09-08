-- 0187 — SOẠN THẲNG TRÊN DÒNG: dòng chưa đủ trường vẫn lưu được, và TDV quyết thứ tự.
--
-- Khách hàng chốt 08/09: bảng sản phẩm bỏ hộp thoại, TDV sửa thẳng trên dòng
-- (ngày áp dụng · sản phẩm · giá bán buôn · CPBH); ô trống báo đỏ và chặn gửi
-- duyệt; dấu cộng giữa hai dòng chèn thêm dòng vào **bất kỳ chỗ nào**.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO BẢY CỘT PHẢI NHẬN `NULL`
-- ---------------------------------------------------------------------------
--
-- Câu *"ô trống thì báo đỏ và KHÔNG CHO GỬI DUYỆT"* chỉ có nghĩa nếu ô trống
-- **sống được tới lúc bấm Gửi duyệt** — tức là dòng dở phải nằm trong CSDL. Một
-- dòng dở chỉ nằm trên trình duyệt thì tải lại trang là mất, và vế "không cho
-- gửi duyệt" thành câu nói về một thứ máy chủ chưa bao giờ nhìn thấy.
--
-- Đây là lằn ranh của cả chặng: tới `0186`, `pol.policy_line` là **kết quả** của
-- một biểu mẫu đã điền xong; từ `0187` nó là **mặt bàn đang soạn**. Bảy cột dưới
-- đây là bảy cột mà một dòng vừa chèn chưa thể có:
--
--   * `product_id` · `product_code_snap` · `product_name_snap` — chưa chọn hàng.
--   * `company_price_snap` · `discount_rate` — DẪN XUẤT từ sản phẩm; không có
--     sản phẩm thì không có gì để chụp, và điền 0 vào đó là ghi một tỷ lệ chiết
--     khấu sai vào chỗ mà mọi phép tính về sau đọc.
--   * `wholesale_price` — người dùng chưa gõ.
--   * `ngay_ap_dung` — `0180` cho nó mặc định *hôm nay* ở máy chủ, và mặc định
--     ấy GIỮ NGUYÊN cho đường thêm dòng cũ; nhưng ô này giờ **xoá trống được**,
--     nên cột phải diễn đạt được trạng thái rỗng.
--
-- HAI CHECK CŨ KHÔNG PHẢI SỬA: `company_price_snap > 0` và `wholesale_price >= 0`
-- trả `NULL` khi vế trái là `NULL`, và Postgres coi `CHECK` cho ra `NULL` là
-- ĐẠT. Sửa chúng thành `x IS NULL OR x > 0` cho ra đúng cùng một hành vi, chỉ
-- dài hơn — nên để nguyên, và ghi ra đây để người sau khỏi tưởng là chỗ bỏ sót.
--
-- `uq_policy_line_product` GIỮ NGUYÊN và vẫn đúng: btree cho phép NHIỀU `NULL`
-- trùng nhau, nên hai dòng trống cùng tồn tại được, còn hai dòng đã chọn cùng
-- một mặt hàng thì vẫn bị chặn.
ALTER TABLE pol.policy_line
  ALTER COLUMN product_id         DROP NOT NULL,
  ALTER COLUMN product_code_snap  DROP NOT NULL,
  ALTER COLUMN product_name_snap  DROP NOT NULL,
  ALTER COLUMN company_price_snap DROP NOT NULL,
  ALTER COLUMN wholesale_price    DROP NOT NULL,
  ALTER COLUMN discount_rate      DROP NOT NULL,
  ALTER COLUMN ngay_ap_dung       DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- THỨ TỰ DÒNG DO NGƯỜI LẬP QUYẾT
-- ---------------------------------------------------------------------------
--
-- Tới `0186` mọi đường đọc sắp bằng `ORDER BY product_code_snap`. Dấu cộng
-- *"chèn vào giữa hai dòng bất kỳ"* không diễn đạt được trên một thứ tự tính
-- ra từ dữ liệu: chèn xong, dòng mới nhảy về chỗ mã của nó — và với dòng vừa
-- chèn thì mã còn chưa có, nên nó nhảy lên đầu hoặc xuống cuối tuỳ collation.
--
-- `thu_tu` NẠP LẠI theo đúng thứ tự đang hiện — mã sản phẩm — nên mọi hồ sơ đã
-- ký giữ nguyên hình dạng tờ giấy của nó. Đây là điểm quan trọng nhất của lượt
-- nâng cấp: bản CSBH đã in ra và đã ký không được đổi thứ tự dòng.
ALTER TABLE pol.policy_line
  ADD COLUMN IF NOT EXISTS thu_tu integer;

UPDATE pol.policy_line l
   SET thu_tu = x.stt
  FROM (SELECT id,
               row_number() OVER (PARTITION BY policy_id
                                  ORDER BY product_code_snap, id) AS stt
          FROM pol.policy_line) x
 WHERE x.id = l.id AND l.thu_tu IS NULL;

ALTER TABLE pol.policy_line
  ALTER COLUMN thu_tu SET NOT NULL;

-- Không có unique `(policy_id, thu_tu)`, và đó là chủ ý: lượt chèn giữa bảng
-- phải ĐẨY mọi dòng phía sau lên một bậc, và một `UPDATE … SET thu_tu = thu_tu
-- + 1` chạm vào nhiều dòng thì Postgres kiểm ràng buộc sau TỪNG DÒNG chứ không
-- hoãn tới lúc COMMIT — nên nó tự va vào chính nó ở dòng thứ hai. Thứ tự chỉ là
-- chuyện trình bày; hai dòng cùng số thì phân xử bằng `id` để lượt đọc nào cũng
-- cho cùng một dãy.
CREATE INDEX IF NOT EXISTS ix_policy_line_thu_tu
  ON pol.policy_line (policy_id, thu_tu, id);

COMMENT ON COLUMN pol.policy_line.thu_tu IS
  'Thứ tự dòng do người lập quyết (0187). Dấu cộng giữa hai dòng chèn vào đúng '
  'chỗ đó; mọi đường đọc sắp theo (thu_tu, id) chứ không theo mã sản phẩm.';
