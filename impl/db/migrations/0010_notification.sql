-- =============================================================================
-- 0010_notification — Thông báo email theo bảng bước (YCNV muc 3, 9.1).
--
-- Hai bảng và một hàm. Hàm nằm ở schema idn chứ không phải ntf, và đó là chủ ý:
-- "ai nhận thư của bước này" suy ra từ CÂY TỔ CHỨC, mà cây tổ chức chỉ identity
-- sở hữu. Đặt phép suy diễn đó ở ntf là dựng nguồn sự thật thứ hai về quan hệ
-- cấp trên — cùng loại sai lầm mà idn.scope_user_ids đã tránh ở 0003.
-- =============================================================================

-- Một dòng cho MỖI sự kiện đã gửi thư. `event_id` là id của bản ghi outbox bên
-- service phát, và UNIQUE ở đây là chốt chống gửi trùng CUỐI CÙNG: hàng đợi
-- giao ít nhất một lần, nên cùng một sự kiện tới hai lần là chuyện bình thường
-- chứ không phải sự cố. Chặn ở tầng CSDL thì hai tiến trình notification chạy
-- song song cũng không lách được, khác hẳn với kiểm bằng SELECT rồi INSERT (NTF-06).
CREATE TABLE IF NOT EXISTS ntf.sent_mail (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL UNIQUE,
  routing_key  text NOT NULL,
  policy_id    uuid,
  customer_id  uuid,
  -- Khoá gộp luồng: mọi thư của cùng một khách hàng dùng chung một gốc
  -- References nên trình khách xếp chúng vào một luồng (NTF-04).
  thread_key   text,
  message_id   text NOT NULL,
  to_addresses text[] NOT NULL,
  subject      text NOT NULL,
  attempts     int  NOT NULL DEFAULT 1,
  sent_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sent_mail_policy ON ntf.sent_mail(policy_id);
CREATE INDEX IF NOT EXISTS ix_sent_mail_sent_at ON ntf.sent_mail(sent_at);

-- Thư đã thử đủ số lần mà vẫn hỏng. Giữ nguyên payload để gửi lại được sau khi
-- SMTP hồi phục — mất thư vì máy chủ thư hỏng vài phút là không chấp nhận được (NTF-05).
CREATE TABLE IF NOT EXISTS ntf.dead_letter (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL,
  routing_key text NOT NULL,
  payload     jsonb NOT NULL,
  attempts    int  NOT NULL,
  last_error  text,
  failed_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_dead_letter_open
  ON ntf.dead_letter(failed_at) WHERE resolved_at IS NULL;

-- Nhắc SLA. Khoá chính (hồ sơ, loại nhắc, ngày) là thứ làm cho vòng quét
-- idempotent: cron chạy 5 phút một lần, và sla-worker restart giữa chừng cũng
-- không gửi lại thư đã gửi trong ngày (NTF-09, NTF-14). Bảng dựng từ đây để
-- sla-worker ở chặng sau không phải kèm migration riêng.
CREATE TABLE IF NOT EXISTS ntf.reminder (
  policy_id uuid NOT NULL,
  kind      text NOT NULL,
  for_date  date NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_id, kind, for_date)
);

-- --- Ai nhận thư của một hồ sơ ----------------------------------------------
--
-- Vào bằng TDV lập hồ sơ, ra bằng đủ bốn vai trò có mặt trong bảng bước muc 3:
--   TDV        chính người lập
--   TBP        người duyệt của BỘ PHẬN người lập — cấu hình theo bộ phận, không
--              gán cứng cá nhân, nên đổi người giữ chức không phải sửa hồ sơ nào
--   KE_TOAN    cấp trên gần nhất có vai trò kế toán, leo ngược cây
--   SALE_ADMIN cấp trên gần nhất có vai trò Sale Admin
--
-- "Gần nhất" chứ không phải "tất cả": một hồ sơ có đúng một kế toán phụ trách.
-- Lấy hết tổ tiên cùng vai trò là gửi thư cho những người không liên quan.
CREATE OR REPLACE FUNCTION idn.notify_targets(p_tdv uuid)
RETURNS TABLE (target_user_id uuid, target_role text, target_email text, target_name text)
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE up AS (
    SELECT n.user_id AS uid, n.parent_id, 0 AS depth
      FROM idn.user_node n WHERE n.user_id = p_tdv
    UNION ALL
    SELECT n.user_id, n.parent_id, up.depth + 1
      FROM idn.user_node n JOIN up ON n.user_id = up.parent_id
     WHERE up.depth < 50
  ),
  ancestor AS (
    SELECT u.id, u.role::text AS r, u.email, u.full_name, up.depth
      FROM up JOIN idn.app_user u ON u.id = up.uid
     WHERE up.depth > 0 AND u.is_active
  ),
  nearest AS (
    SELECT DISTINCT ON (a.r) a.id, a.r, a.email, a.full_name
      FROM ancestor a WHERE a.r IN ('KE_TOAN', 'SALE_ADMIN')
     ORDER BY a.r, a.depth
  ),
  own AS (
    SELECT u.id, u.role::text, u.email, u.full_name
      FROM idn.app_user u WHERE u.id = p_tdv AND u.is_active
  ),
  approver AS (
    SELECT u.id, u.role::text, u.email, u.full_name
      FROM idn.app_user t
      JOIN idn.department_approver da ON da.department_id = t.department_id
      JOIN idn.app_user u ON u.id = da.user_id
     WHERE t.id = p_tdv AND u.is_active
  )
  SELECT * FROM own
  UNION SELECT * FROM approver
  UNION SELECT * FROM nearest;
END $$ LANGUAGE plpgsql STABLE;
