-- =============================================================================
-- 0026_chiet_khau_hai_yeu_to — ngưỡng chiết khấu chỉ còn phụ thuộc HAI yếu tố:
-- NHÓM SẢN PHẨM và LOẠI KHÁCH HÀNG. Kênh bán, tỉnh/thành và bệnh viện rời khỏi
-- phần mềm hoàn toàn.
--
-- Vì sao xoá chứ không để lại cho chắc: ba danh mục ấy chỉ có đúng ba đường đi
-- trong hệ thống, và không đường nào dẫn tới một quyết định.
--
--   * `cat.channel` → chiều thứ ba của quy định chiết khấu. Đây là đường DUY
--     NHẤT trong cả phần mềm mà một trong ba mã đổi được kết quả tính toán, và
--     nghiệp vụ vừa chốt là nó không được đổi.
--   * `cat.province`, `cat.hospital` → ba cột trên `cus.customer`, chép sang
--     `rpt.policy_row`, hiện thành ba tiêu chí lọc và ba cột trong file Excel
--     xuất ra. Toàn bộ vòng đời của chúng là gõ vào rồi đọc lại.
--
-- Giữ lại cột "phòng khi cần" nghe vô hại nhưng không phải: cột còn thì màn hình
-- nhập còn, người dùng còn gõ, và dữ liệu gõ vào ấy sẽ được ai đó tin là có
-- nghĩa. Bỏ thì bỏ hẳn, một lượt, ở mọi tầng.
--
-- MẤT DỮ LIỆU, có chủ ý: ba cột phân loại trên khách hàng và ba danh mục tra cứu
-- biến mất cùng nội dung của chúng. Không có bảng lưu tạm, vì lưu tạm là một
-- cách nói "chưa chắc" trong khi quyết định đã chắc.
-- =============================================================================

-- --- 1. Gộp các quy định chỉ khác nhau ở kênh --------------------------------
--
-- Bỏ một chiều khớp thì hai dòng từng khác nhau (cùng nhóm, cùng loại khách,
-- khác kênh) trở thành cùng một phạm vi — mà `uq_rule_pham_vi` (0022) không cho
-- hai dòng cùng phạm vi tồn tại. Phải gộp TRƯỚC khi dựng lại chỉ mục.
--
-- GIỮ DÒNG KHÔNG KHAI KÊNH. Dòng ấy vốn đã nói "mọi kênh", nên giữ nó là giữ
-- nguyên nghĩa cũ; giữ một dòng khai riêng cho một kênh thì lặng lẽ áp ngưỡng
-- của kênh đó lên mọi kênh còn lại. Trong nhóm không có dòng nào bỏ trống kênh
-- thì đành lấy dòng có mã nhỏ nhất — không có lựa chọn nào đúng hơn ở đó, nên
-- lấy cái TẤT ĐỊNH và nói rõ mình vừa xoá bao nhiêu dòng.
DO $$
DECLARE da_xoa int;
BEGIN
  WITH xep AS (
    SELECT code, row_number() OVER (
             PARTITION BY product_group_id, customer_type, effective_from
             ORDER BY (channel_code IS NOT NULL), code
           ) AS hang
      FROM cat.discount_rule
  )
  DELETE FROM cat.discount_rule r USING xep
   WHERE r.code = xep.code AND xep.hang > 1;
  GET DIAGNOSTICS da_xoa = ROW_COUNT;
  IF da_xoa > 0 THEN
    RAISE NOTICE '0026: gộp % quy định chiết khấu chỉ khác nhau ở kênh (giữ dòng áp cho mọi kênh)', da_xoa;
  END IF;
END $$;

-- --- 2. Bỏ chiều kênh khỏi quy định ------------------------------------------
--
-- `specificity` là cột SINH SẴN đọc `channel_code`, nên phải bỏ nó trước rồi
-- dựng lại — Postgres không cho sửa biểu thức của một generated column tại chỗ.
--
-- Trọng số còn 2/1, vẫn nhị phân: hai chiều cho bốn tổ hợp và bốn con số phân
-- biệt, nên hai phạm vi KHÁC nhau không bao giờ hoà điểm. Lập luận của 0022 —
-- hoà điểm ⇒ trùng phạm vi ⇒ chỉ mục đã chặn từ lúc khai — giữ nguyên hiệu lực.
-- Thứ tự ưu tiên cũng giữ nguyên: nhóm sản phẩm mạnh hơn loại khách hàng, vì
-- ngưỡng gắn với bản chất hàng hoá.
DROP INDEX IF EXISTS cat.uq_rule_pham_vi;
DROP INDEX IF EXISTS cat.ix_rule_match;

ALTER TABLE cat.discount_rule DROP COLUMN IF EXISTS specificity;
ALTER TABLE cat.discount_rule DROP COLUMN IF EXISTS channel_code;

ALTER TABLE cat.discount_rule ADD COLUMN specificity int GENERATED ALWAYS AS (
  (CASE WHEN product_group_id IS NOT NULL THEN 2 ELSE 0 END) +
  (CASE WHEN customer_type    IS NOT NULL THEN 1 ELSE 0 END)
) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_pham_vi
  ON cat.discount_rule (product_group_id, customer_type, effective_from)
  NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS ix_rule_match
  ON cat.discount_rule (product_group_id, customer_type);

COMMENT ON INDEX cat.uq_rule_pham_vi IS
  'Một phạm vi × một ngày hiệu lực = tối đa một quy định. Phạm vi còn hai chiều (0026).';
COMMENT ON TABLE cat.discount_rule IS
  'Nguồn DUY NHẤT của ngưỡng chiết khấu, khớp theo nhóm sản phẩm × loại khách hàng (0026).';

-- --- 3. Ba danh mục tra cứu biến mất -----------------------------------------
--
-- Không có khoá ngoại nào trỏ vào chúng: `cus.customer` giữ mã dạng text và
-- catalog kiểm mã qua API nội bộ (CUST-08), nên xoá bảng không kéo theo gì.
-- Chính API kiểm ấy (`/internal/validate-lookups`) cũng đi cùng chuyến này.
DROP TABLE IF EXISTS cat.province;
DROP TABLE IF EXISTS cat.hospital;
DROP TABLE IF EXISTS cat.channel;

-- --- 4. Ba cột phân loại trên khách hàng --------------------------------------
ALTER TABLE cus.customer
  DROP COLUMN IF EXISTS province_code,
  DROP COLUMN IF EXISTS hospital_code,
  DROP COLUMN IF EXISTS channel_code;

-- --- 5. Read model báo cáo ----------------------------------------------------
--
-- `rpt.policy_row` là bản sao đọc, dựng lại được từ nguồn — xoá cột ở đây không
-- mất gì mà nguồn còn giữ. Bộ lọc đã lưu của người dùng (`rpt.report_filter`)
-- không cần dọn: `cleanFilter` bỏ mọi khoá lạ, nên bộ lọc cũ còn `provinceCode`
-- vẫn chạy, chỉ là tiêu chí ấy không còn tác dụng.
DROP INDEX IF EXISTS rpt.ix_rpt_geo;
ALTER TABLE rpt.policy_row
  DROP COLUMN IF EXISTS province_code,
  DROP COLUMN IF EXISTS hospital_code,
  DROP COLUMN IF EXISTS channel_code;
