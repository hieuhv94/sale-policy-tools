-- `0268` — NỘI DUNG của từng khoản CPBH (khách hàng chốt 08/11/2026): *"thêm cho mỗi CPBH
-- một ô nội dung, để mô tả chi phí này phục vụ cho việc gì, không phải trường bắt buộc"*.
--
-- Mảng SONG SONG với `cpbh`: phần tử thứ i mô tả khoản thứ i. Chuỗi rỗng = khoản ấy không có
-- nội dung. Mảng có thể NGẮN hơn `cpbh` (dòng cũ: rỗng) nhưng không bao giờ DÀI hơn — một nội
-- dung không có khoản nào để mô tả là dữ liệu mồ côi.
--
-- KHÔNG in ra bản mềm, KHÔNG vào phép so *Chỉnh sửa* (chốt khi được hỏi) — cùng lối `note`.
-- Đi theo dòng sang phiên bản mới (lượt chép dòng ở `create`).
ALTER TABLE pol.policy_line
  ADD COLUMN IF NOT EXISTS cpbh_noi_dung text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE pol.policy_line
    ADD CONSTRAINT cpbh_noi_dung_khong_thua CHECK (cardinality(cpbh_noi_dung) <= cardinality(cpbh));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
