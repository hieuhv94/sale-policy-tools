-- `0262` — thông báo bình luận trên chuông (yêu cầu 6, `agents/comment_system_requirements.md`).
--
-- Hai cột, chỉ dòng thông báo BÌNH LUẬN mới có giá trị:
--
--   * `binh_luan_id` — để giao diện đánh dấu đã đọc THEO BÌNH LUẬN khi bình luận ấy hiện trên
--     màn hình người nhận (chốt 06/11): giao diện biết id bình luận, không biết id thông báo.
--   * `trich_doan` — dòng thứ ba của mockup (*"Anh xem lại giá…"*). Tách khỏi `mo_ta` vì đường
--     đọc phải GIẤU RIÊNG nó khi người nhận đã mất phạm vi hồ sơ, cùng với `mo_ta` (mã hồ sơ ·
--     tên khách) — xem `notify.controller.ts`. Gộp vào `mo_ta` thì không giấu được một nửa.
--
-- Không `CHECK` nào nối hai cột với `action`: thông báo cũ để NULL là đúng, và một ràng buộc
-- ràng hai cột với một chuỗi `action` là một bản chép thứ hai của bảng hành động.

ALTER TABLE ntf.thong_bao ADD COLUMN IF NOT EXISTS binh_luan_id uuid;
ALTER TABLE ntf.thong_bao ADD COLUMN IF NOT EXISTS trich_doan text;

-- Đường "đã thấy bình luận X" tra theo (người, bình luận) trên dòng CHƯA đọc.
CREATE INDEX IF NOT EXISTS ix_thong_bao_binh_luan
  ON ntf.thong_bao (user_id, binh_luan_id) WHERE binh_luan_id IS NOT NULL AND da_doc_luc IS NULL;
