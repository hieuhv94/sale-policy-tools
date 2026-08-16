-- =============================================================================
-- 0037_thu_de_biet — MỘT sự kiện, HAI lá thư.
--
-- --- Vì sao hai lá ------------------------------------------------------------
--
-- Từ `0036`, mỗi lần hồ sơ đổi trạng thái có hai nhóm người nhận:
--
--   * Người PHẢI XỬ LÝ bước tiếp theo — liên kết mở thẳng hồ sơ để bấm nút.
--   * Người ĐÃ TỪNG thao tác lên hồ sơ nhưng giờ không có việc gì — liên kết
--     trỏ vào NHẬT KÝ, nơi trả lời đúng câu họ đang hỏi.
--
-- Một lá thư chỉ mang được một liên kết, nên phải là hai lá.
--
-- --- Vì sao đụng tới lược đồ ---------------------------------------------------
--
-- `ntf.sent_mail.event_id` là chỗ GIỮ CHỖ chống gửi trùng (NTF-06): hàng đợi
-- giao ít nhất một lần, nên cùng một sự kiện tới hai lần là chuyện thường, và
-- ràng buộc `UNIQUE` trên cột này là thứ chặn lá thư thứ hai.
--
-- Với hai lá thư cho một sự kiện thì một cột không đủ. Bản đầu tôi thử nhét hậu
-- tố vào chính `event_id` (`<uuid>:theo-doi`) — cột kiểu `uuid` từ chối, và nó
-- từ chối ở đúng chỗ tệ nhất: lỗi ném ra SAU khi lá thư chính đã gửi xong, nên
-- nhánh dọn dẹp xoá chỗ đã giữ của lá thư ấy rồi đẩy cả sự kiện vào bảng thư
-- hỏng. Gửi lại từ đó là gửi trùng lá thư chính.
--
-- Nên: khoá chống trùng thành CẶP `(event_id, kind)`. `kind` nói lá thư này là
-- lá nào, và `event_id` vẫn là uuid đúng kiểu — không phải một chuỗi tự chế mà
-- mọi truy vấn về sau phải nhớ cách tháo ra.
-- =============================================================================

ALTER TABLE ntf.sent_mail
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'CHINH'
    CHECK (kind IN ('CHINH', 'THEO_DOI'));

COMMENT ON COLUMN ntf.sent_mail.kind IS
  'CHINH: thư cho người phải xử lý. THEO_DOI: thư "để biết" cho người đã tác động (0037).';

-- Đổi khoá chống trùng từ MỘT cột sang CẶP.
--
-- Ràng buộc cũ do `UNIQUE` inline ở `0010` sinh ra nên mang tên mặc định của
-- Postgres. Bỏ nó đi mà không có ràng buộc thay thế, dù chỉ trong một câu lệnh,
-- là mở đúng cái khe mà `0010` dựng ra để bịt — nhưng cả tệp chạy trong MỘT
-- transaction (xem `scripts/migrate.sh`), nên không có khoảnh khắc nào bảng này
-- sống mà thiếu ràng buộc.
ALTER TABLE ntf.sent_mail DROP CONSTRAINT IF EXISTS sent_mail_event_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sent_mail_event_kind
  ON ntf.sent_mail (event_id, kind);
