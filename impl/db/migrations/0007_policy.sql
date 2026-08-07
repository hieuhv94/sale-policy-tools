-- =============================================================================
-- 0007_policy — Phần còn thiếu của lược đồ hồ sơ: lý do trả lại, file đính kèm,
-- lịch sử chuyển bước, outbox (YCNV muc 3, 4, 5, 10).
--
-- Bảng pol.policy và pol.policy_line đã dựng ở 0001 cùng ba bất biến của chúng.
-- =============================================================================

ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS rejected_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by    uuid,
  -- Lý do của lần trả lại / từ chối GẦN NHẤT, để hiển thị ngay trên hồ sơ.
  -- Lịch sử đầy đủ nằm ở pol.policy_event (WF-27).
  ADD COLUMN IF NOT EXISTS last_reason    text,
  ADD COLUMN IF NOT EXISTS tdv_user_id    uuid;

COMMENT ON COLUMN pol.policy.tdv_user_id IS
  'TDV lập hồ sơ — dùng lọc theo phạm vi dữ liệu, không phải join sang cus';

-- KHÔNG có cột ngày hết hiệu lực ở bất kỳ đâu: mọi CSBH đều vô thời hạn, chỉ
-- hết hiệu lực khi CSBH mới của cùng khách hàng được duyệt (POL-10, muc 5.2).
-- `deactivated_at` là DẤU VẾT thời điểm bị thay thế, không phải hạn định trước.

DO $$ BEGIN
  CREATE TYPE pol.attachment_kind AS ENUM ('HO_SO', 'SCAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Siêu dữ liệu file. File thật do service `document` giữ trên MinIO; ở đây chỉ
-- giữ con trỏ, vì "hồ sơ đã có bản scan chưa" là LUẬT NGHIỆP VỤ của policy
-- (không có scan thì không bàn giao được — WF-14).
CREATE TABLE IF NOT EXISTS pol.policy_attachment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   uuid NOT NULL REFERENCES pol.policy(id) ON DELETE CASCADE,
  kind        pol.attachment_kind NOT NULL,
  file_name   text NOT NULL,
  object_key  text NOT NULL,
  size_bytes  bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_attachment_policy ON pol.policy_attachment(policy_id, kind);

-- Lịch sử chuyển bước. Mỗi lần trả lại đều phải nhập lý do, và lý do đó hiện
-- trong email lẫn trong lịch sử phiên bản (WF-27).
CREATE TABLE IF NOT EXISTS pol.policy_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   uuid NOT NULL REFERENCES pol.policy(id) ON DELETE CASCADE,
  seq         int  NOT NULL,
  from_status pol.policy_status,
  to_status   pol.policy_status NOT NULL,
  action      text NOT NULL,
  actor_id    uuid,
  actor_role  text,
  reason      text,
  at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, seq)
);

CREATE TABLE IF NOT EXISTS pol.outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_key  text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_pol_outbox_pending
  ON pol.outbox(created_at) WHERE published_at IS NULL;

-- Sinh mã hồ sơ. Dãy số dùng chung, không đánh theo khách hàng: mã chỉ cần duy
-- nhất và đọc được, còn thứ tự phiên bản đã có version_no giữ.
CREATE SEQUENCE IF NOT EXISTS pol.policy_code_seq;

CREATE OR REPLACE FUNCTION pol.next_policy_code() RETURNS text AS $$
  SELECT 'CSBH-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('pol.policy_code_seq')::text, 6, '0');
$$ LANGUAGE sql;

-- Tra nhanh CSBH hiện hành của một khách hàng (EFF-08).
CREATE INDEX IF NOT EXISTS ix_policy_customer_status ON pol.policy(customer_id, status);
CREATE INDEX IF NOT EXISTS ix_policy_tdv ON pol.policy(tdv_user_id);
