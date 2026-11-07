-- `0263` — mục đích tệp mới `BINH_LUAN` (tệp đính kèm của bình luận trên hồ sơ).
--
-- TỆP RIÊNG chỉ chứa `ADD VALUE` (bài học `0121`/`0122`): giá trị enum vừa thêm không dùng được
-- trong cùng transaction với lệnh thêm nó, và trình chạy migration bọc mỗi tệp một transaction.
ALTER TYPE doc.file_purpose ADD VALUE IF NOT EXISTS 'BINH_LUAN';
