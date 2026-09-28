-- `0226` — MÃ KHÁCH HÀNG SỬA ĐƯỢC, và chỉ TDV phụ trách sửa.
--
-- Khách hàng chốt 28/09: *"cho phép sửa đổi mã khách hàng"*; hỏi lại thì
-- *"chỉ TDV phụ trách mới sửa được"* (Quản trị hệ thống cũng KHÔNG) và *"mã cũ
-- dùng lại được"*.
--
-- GỠ TRIGGER CỦA `0006` (CUST-15). Lý do nó đứng đó, nguyên văn: *"sửa được
-- mã là mọi hồ sơ CSBH cũ trỏ vào một khách hàng khác trong im lặng"*. Tiền đề
-- ấy KHÔNG đúng với lược đồ: `pol.policy`, `cus.customer_document`,
-- `cus.customer_address` đều nối bằng `customer_id` (uuid, khoá ngoại), không
-- nối bằng mã — đổi mã không làm dòng nào trỏ sang khách khác. Còn tờ giấy đã
-- ký thì mang ảnh chụp `kh_ma_snap` lúc gửi duyệt (`0101`), nên nó giữ mã cũ,
-- đúng như văn bản đã ký phải giữ.
--
-- Giữ nguyên `uq_customer_code_norm` (so sau `upper(btrim())`): mã cũ được
-- giải phóng ngay khi đổi, nên không cần bảng lưu mã đã dùng. Luật ai được
-- sửa nằm ở `customers.service.ts` (`assertChinhTdv`), không ở CSDL.
DROP TRIGGER IF EXISTS trg_customer_code_immutable ON cus.customer;
DROP FUNCTION IF EXISTS cus.forbid_code_change();
