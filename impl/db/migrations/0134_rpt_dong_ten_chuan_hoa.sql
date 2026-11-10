-- `0283` — tên sản phẩm CỦA TỪNG DÒNG, đã bỏ dấu, trong read-model báo cáo.
--
-- Bộ lọc *Hồ sơ CSBH* chốt cách hiểu "CÙNG MỘT SẢN PHẨM" (khách hàng chốt 12/11/2026): tên, nhóm và
-- khoảng tỷ lệ chiết khấu phải cùng đúng trên MỘT dòng sản phẩm, không phải mỗi tiêu chí đúng ở một dòng
-- khác nhau của cùng hồ sơ. Trước đó tên đọc từ mảng `product_names_norm` của CẢ HỒ SƠ — một mảng không
-- nói được dòng nào mang tên nào — nên cần một cột trên chính dòng.
--
-- CỘT SINH chứ không ghi lúc đồng bộ (cùng lối `0049`): chỉ có MỘT định nghĩa chuẩn hoá (`sys.khong_dau`,
-- đã có ca kiểm so với `norm()` của Node), không có đường ghi nào để quên điền, và dòng cũ được tính ngay
-- lúc thêm cột — không cần chạy lại đồng bộ. Role ghi vào bảng (`csbh_rpt`) phải gọi được hàm, vì cột sinh
-- tính bằng quyền của người ghi.
GRANT USAGE ON SCHEMA sys TO csbh_rpt;
GRANT EXECUTE ON FUNCTION sys.khong_dau(text) TO csbh_rpt;

ALTER TABLE rpt.policy_line
  ADD COLUMN IF NOT EXISTS product_name_norm text
  GENERATED ALWAYS AS (sys.khong_dau(product_name)) STORED;
