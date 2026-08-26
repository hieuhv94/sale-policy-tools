-- `0128` — SỐ ĐIỆN THOẠI của khách hàng, và một trường ánh xạ mới cho văn bản mẫu.
--
-- HAI cột, không phải một, và cột thứ hai mới là chỗ đáng đọc.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO PHẢI CÓ CỘT SNAPSHOT
-- ---------------------------------------------------------------------------
--
-- `0101` đóng băng tám trường khách hàng vào hồ sơ lúc gửi duyệt, và ghi rõ lý
-- do chọn CỘT RỜI thay vì một cột `jsonb`:
--
--     "để thêm một trường về sau BUỘC phải viết migration, tức buộc phải trả lời
--      'đóng băng hay đọc sống?'"
--
-- Đây đúng là lần đầu tiên câu hỏi ấy được hỏi. Câu trả lời: ĐÓNG BĂNG.
--
-- Số điện thoại đi vào bản CSBH in ra. Đọc sống nghĩa là khách hàng đổi số sau
-- khi hồ sơ đã duyệt thì tờ CSBH đã ký lặng lẽ mang một con số khác — cùng lớp
-- lỗi mà `0101` dựng ra để chặn, và nó không có dấu hiệu nào trên màn hình.
--
-- Ngược lại, *Kế toán* và *Sale Admin* KHÔNG đóng băng (`0101`) vì câu chúng trả
-- lời là "ai đang giữ hồ sơ" — một câu hỏi về hiện tại. Số điện thoại thì trả
-- lời "hợp đồng này ký với ai, liên hệ số nào", một câu hỏi về thời điểm ký.
--
-- ---------------------------------------------------------------------------
-- NULL ĐƯỢC, và lượt gửi duyệt chặn
-- ---------------------------------------------------------------------------
--
-- Cột để `NULL` vì khách hàng đã có trong CSDL chưa ai khai số. Nhưng nó nằm
-- trong bảng ánh xạ văn bản mẫu, nên theo phân loại của `0104` nó thuộc nhóm
-- `chan-moi`: rỗng thì bản CSBH in ra một ô trắng, mà TDV sửa được — nên chặn ở
-- lượt gửi duyệt, cùng chỗ với mã số thuế và chức danh người đại diện.
--
-- Hệ quả vận hành, nói ra để đừng bất ngờ: **khách hàng cũ chưa có số điện thoại
-- thì hồ sơ mới của họ không gửi duyệt được** cho tới khi ai đó bổ sung. Câu báo
-- lỗi chỉ thẳng sang hồ sơ khách hàng.

ALTER TABLE cus.customer
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN cus.customer.phone IS
  'Số điện thoại liên hệ. NULL được — khách hàng lập trước 0128 chưa ai khai.';

ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS kh_dien_thoai_snap text;

COMMENT ON COLUMN pol.policy.kh_dien_thoai_snap IS
  'Ảnh chụp số điện thoại khách hàng lúc gửi duyệt (0128). Xem 0101 về lý do '
  'dùng cột rời thay vì jsonb.';
