-- =============================================================================
-- 0015_audit — Chống ghi trùng nhật ký, và `occurred_at` mang đúng nghĩa.
--
-- Hàng đợi giao ÍT NHẤT MỘT LẦN, nên cùng một sự kiện tới hai lần là chuyện
-- thường. Nhật ký ghi trùng không chỉ xấu: báo cáo hoạt động người dùng (AUD-09)
-- đếm theo dòng, nên một sự kiện ghi hai lần là một con số sai gửi lên lãnh đạo.
--
-- HAI THỨ PHẢI ĐI CÙNG NHAU, và đây là chỗ dễ làm sai nhất:
--
-- Bảng đã phân vùng theo `occurred_at`, mà index duy nhất trên bảng phân vùng
-- BẮT BUỘC phải chứa khoá phân vùng. Nên khoá chống trùng là
-- `(occurred_at, event_id)` chứ không phải `(event_id)` — và nó chỉ chặn được
-- trùng khi `occurred_at` GIỐNG NHAU giữa hai lần giao.
--
-- Vì vậy `occurred_at` phải là **thời điểm sự kiện xảy ra trong nghiệp vụ**, lấy
-- từ payload, chứ không phải thời điểm audit-service ghi dòng. Lấy `now()` lúc
-- ghi thì hai lần giao ra hai giá trị khác nhau, rơi vào hai vùng khác nhau, và
-- khoá duy nhất không chặn được gì. Đó cũng là nghĩa đúng của cột: nhật ký nói
-- "việc này xảy ra lúc nào", không nói "tôi ghi nó lúc nào".
-- =============================================================================

ALTER TABLE aud.audit_log ADD COLUMN IF NOT EXISTS event_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_event
  ON aud.audit_log (occurred_at, event_id) WHERE event_id IS NOT NULL;

COMMENT ON COLUMN aud.audit_log.event_id IS
  'id bản ghi outbox bên service phát — chốt chống ghi trùng khi hàng đợi giao lại';

-- Tra nhật ký theo người dùng cho báo cáo hoạt động (AUD-09).
CREATE INDEX IF NOT EXISTS ix_audit_actor ON aud.audit_log (actor_id, occurred_at);

-- Dựng lại toàn bộ chuỗi gateway → service → consumer trong MỘT truy vấn (INT-11).
CREATE INDEX IF NOT EXISTS ix_audit_trace ON aud.audit_log (trace_id)
  WHERE trace_id IS NOT NULL;
