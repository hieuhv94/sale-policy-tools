-- `0263` — tệp đính kèm của bình luận (yêu cầu 7).
--
-- Byte nằm ở `document` (`doc.stored_file`, mục đích `BINH_LUAN`, chủ là HỒ SƠ). Bảng này là
-- CON TRỎ phía `policy`: bình luận nào mang tệp nào — cùng ranh giới với `pol.policy_attachment`.
-- Tên, loại, cỡ chép sang lúc gắn để đọc danh sách bình luận không phải hỏi `document` từng lượt.
--
-- `file_id` UNIQUE: một tệp chỉ gắn MỘT bình luận, một lần. Gỡ khi sửa thì `go_luc` có giá trị
-- (giữ dòng làm vết; lượt dọn xoá byte). Bình luận xoá thì dòng giữ nguyên — lượt dọn đọc
-- `xoa_luc` của bình luận để biết byte phải đi.
CREATE TABLE IF NOT EXISTS pol.binh_luan_tep (
  binh_luan_id uuid NOT NULL REFERENCES pol.binh_luan(id) ON DELETE CASCADE,
  file_id      uuid NOT NULL UNIQUE,
  ten          text NOT NULL,
  loai         text NOT NULL,
  co           bigint NOT NULL,
  gan_luc      timestamptz NOT NULL DEFAULT now(),
  -- Thứ tự tệp như người gửi xếp. `gan_luc` không làm được: mọi tệp của một lượt gửi
  -- ghi trong CÙNG transaction nên cùng một `now()`, và xếp theo `file_id` là xếp ngẫu nhiên.
  stt          bigserial NOT NULL,
  go_luc       timestamptz
);
CREATE INDEX IF NOT EXISTS ix_binh_luan_tep ON pol.binh_luan_tep (binh_luan_id) WHERE go_luc IS NULL;
