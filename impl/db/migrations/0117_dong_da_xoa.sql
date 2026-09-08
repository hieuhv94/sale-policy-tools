-- 0186 — TRẠNG THÁI DÒNG THỨ TƯ: *Đã xoá*.
--
-- Khách hàng chốt 08/09, đảo hẳn POL-08 (`muc 5.4`): phiên bản mới KHÔNG còn
-- phải chứa lại toàn bộ sản phẩm của bản đang hiệu lực. Rút một mặt hàng khỏi
-- CSBH của một khách trở thành một nghiệp vụ có thật — và vì nó là một nghiệp
-- vụ, nó phải NHÌN THẤY ĐƯỢC trên đường đi duyệt, chứ không phải một dòng biến
-- mất giữa hai phiên bản.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO ĐÂY LÀ MỘT CỘT, TRONG KHI BA TRẠNG THÁI KIA LÀ DẪN XUẤT
-- ---------------------------------------------------------------------------
--
-- `0180` dựng *Bổ sung* · *Chỉnh sửa* · *Đang áp dụng* bằng phép so với bản bị
-- thay thế, và ghi rõ lý do không thêm cột: cả hai vế đã có sẵn trong CSDL, nên
-- một bản sao thứ hai chỉ là thứ phải giữ đồng bộ ở bốn đường ghi.
--
-- *Đã xoá* KHÔNG cùng loại. Nó không phải một phép so — nó là một Ý ĐỊNH mà TDV
-- vừa phát biểu, và không có vế thứ hai nào trong CSDL trả lời được câu *"người
-- lập có chủ động rút mặt hàng này không"*. Một dòng vắng mặt và một dòng bị rút
-- trông giống hệt nhau ở mọi phép so; thứ phân biệt chúng chỉ tồn tại nếu được
-- ghi lại. Nên: một cột.
--
-- ---------------------------------------------------------------------------
-- KHÔNG CÓ BACKFILL, VÀ KHÔNG CÓ GÌ ĐỂ BACKFILL
-- ---------------------------------------------------------------------------
--
-- Tới trước lượt này, rút một mặt hàng là việc KHÔNG LÀM ĐƯỢC — `POL-08` chặn
-- mọi lượt gửi duyệt thiếu dòng thừa kế. Nên không hồ sơ nào đang mang một dòng
-- "đáng lẽ đã xoá": mặc định `false` là đúng cho toàn bộ dữ liệu cũ, không phải
-- một phỏng đoán.
--
-- `uq_policy_line_product` GIỮ NGUYÊN và đó là một quyết định, không phải một
-- chỗ bỏ sót: dòng đã xoá vẫn CHIẾM chỗ sản phẩm của nó trong hồ sơ. Nhờ vậy
-- *thêm lại* là khôi phục đúng dòng cũ với đúng số cũ, chứ không phải chèn một
-- dòng thứ hai cho cùng một mặt hàng — và với mặt hàng đã vô hiệu hoá trong danh
-- mục thì khôi phục là đường DUY NHẤT, vì đường thêm mới chặn ở `PRODUCT_DISABLED`.
ALTER TABLE pol.policy_line
  ADD COLUMN IF NOT EXISTS da_xoa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pol.policy_line.da_xoa IS
  'TDV đã rút mặt hàng này khỏi phiên bản đang soạn (0186). Dòng vẫn nằm lại '
  'bảng, làm mờ, để người duyệt thấy được thứ đang bị rút; xoá hẳn khi hồ sơ '
  'sang DANG_CO_HIEU_LUC.';
