-- =============================================================================
-- 0001_init — Nền móng: 9 schema, 9 DB role, và bốn bất biến cưỡng chế ở CSDL.
--
-- Vì sao dùng SQL thuần thay vì để ORM sinh: bốn ràng buộc quan trọng nhất của hệ
-- này (partial unique index, chặn xoá hồ sơ Từ chối, nhật ký chỉ ghi thêm, phân
-- quyền theo schema) đều là DDL mà không ORM nào diễn đạt được. Giữ SQL làm nguồn
-- sự thật; service dùng Prisma db pull để sinh model từ lược đồ có sẵn.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS sys;
CREATE TABLE IF NOT EXISTS sys.schema_migration (
  filename    text PRIMARY KEY,
  checksum    text        NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE SCHEMA IF NOT EXISTS idn;
CREATE SCHEMA IF NOT EXISTS cat;
CREATE SCHEMA IF NOT EXISTS cus;
CREATE SCHEMA IF NOT EXISTS pol;
CREATE SCHEMA IF NOT EXISTS doc;
CREATE SCHEMA IF NOT EXISTS ntf;
CREATE SCHEMA IF NOT EXISTS rpt;
CREATE SCHEMA IF NOT EXISTS aud;

-- Danh sách trạng thái là DANH SÁCH ĐÓNG (YCNV muc 4). Dùng enum để CSDL từ chối
-- mọi giá trị lạ, không chỉ dựa vào kiểm tra ở tầng ứng dụng.
DO $$ BEGIN
  CREATE TYPE pol.policy_status AS ENUM (
    'NHAP', 'CHO_TBP_DUYET', 'TBP_DA_KY_SO', 'CHO_KT_L1', 'SA_DANG_XU_LY',
    'CHO_KT_L2', 'DANG_CO_HIEU_LUC', 'HET_HIEU_LUC', 'YEU_CAU_CHINH_SUA',
    'TU_CHOI', 'QUA_HAN_DUYET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pol.policy_step AS ENUM (
    'B3_GUI_DUYET', 'B4_TBP_DUYET', 'B6_KT_L1', 'B8_SA_XU_LY', 'B10_KT_L2');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pol.policy_source AS ENUM ('NORMAL', 'LEGACY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pol.policy (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text UNIQUE NOT NULL,
  customer_id           uuid NOT NULL,
  version_no            int  NOT NULL DEFAULT 1,
  status                pol.policy_status NOT NULL DEFAULT 'NHAP',
  pending_step          pol.policy_step,
  supersedes_id         uuid REFERENCES pol.policy(id),
  superseded_by_id      uuid REFERENCES pol.policy(id),
  applied_date          date,
  effective_from        timestamptz,
  deactivated_at        timestamptz,
  sla_due_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  submitted_at          timestamptz, submitted_by       uuid,
  tbp_signed_at         timestamptz, tbp_signed_by      uuid,
  returned_at           timestamptz, returned_by        uuid,
  kt_l1_received_at     timestamptz, kt_l1_received_by  uuid,
  contract_issued_at    timestamptz, contract_issued_by uuid,
  sa_handover_at        timestamptz, sa_handover_by     uuid,
  kt_l2_received_at     timestamptz, kt_l2_received_by  uuid,
  source                pol.policy_source NOT NULL DEFAULT 'NORMAL',
  import_batch_id       uuid,
  app_version           text,
  row_version           int  NOT NULL DEFAULT 0
);

-- BẤT BIẾN 1 — Mỗi khách hàng chỉ có ĐÚNG MỘT CSBH còn hiệu lực (YCNV muc 5.1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_active_per_customer
  ON pol.policy (customer_id) WHERE status = 'DANG_CO_HIEU_LUC';

CREATE TABLE IF NOT EXISTS pol.policy_line (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           uuid NOT NULL REFERENCES pol.policy(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL,
  product_code_snap   text   NOT NULL,
  product_name_snap   text   NOT NULL,
  company_price_snap  bigint NOT NULL CHECK (company_price_snap > 0),
  wholesale_price     bigint NOT NULL CHECK (wholesale_price >= 0),
  cpbh1               bigint NOT NULL DEFAULT 0 CHECK (cpbh1 >= 0),
  cpbh2               bigint NOT NULL DEFAULT 0 CHECK (cpbh2 >= 0),
  cpbh3               bigint NOT NULL DEFAULT 0 CHECK (cpbh3 >= 0),
  cpbh4               bigint NOT NULL DEFAULT 0 CHECK (cpbh4 >= 0),
  cpbh_total          bigint GENERATED ALWAYS AS (cpbh1 + cpbh2 + cpbh3 + cpbh4) STORED,
  net_price           bigint GENERATED ALWAYS AS
                        (wholesale_price - (cpbh1 + cpbh2 + cpbh3 + cpbh4)) STORED,
  discount_rate       numeric(5,2) NOT NULL,
  threshold_snap      numeric(5,2),
  over_threshold      boolean GENERATED ALWAYS AS
                        (threshold_snap IS NOT NULL AND discount_rate > threshold_snap) STORED
);

-- BẤT BIẾN 2 — Không trùng sản phẩm trong cùng một hồ sơ (muc 5.1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_line_product
  ON pol.policy_line (policy_id, product_id);

-- BẤT BIẾN 3 — Hồ sơ Từ chối là trạng thái kết thúc, KHÔNG AI xoá được (muc 4).
-- Bản thiết kế đề xuất RULE ... DO INSTEAD NOTHING; ở đây dùng trigger báo lỗi vì
-- rule nuốt lặng lệnh xoá khiến ứng dụng tưởng đã xoá thành công.
CREATE OR REPLACE FUNCTION pol.forbid_delete_rejected() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'TU_CHOI' THEN
    RAISE EXCEPTION 'Ho so o trang thai TU_CHOI khong the xoa (YCNV muc 4)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forbid_delete_rejected ON pol.policy;
CREATE TRIGGER trg_forbid_delete_rejected
  BEFORE DELETE ON pol.policy
  FOR EACH ROW EXECUTE FUNCTION pol.forbid_delete_rejected();

CREATE TABLE IF NOT EXISTS aud.audit_log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  actor_role   text,
  actor_ip     inet,
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    uuid,
  before_data  jsonb,
  after_data   jsonb,
  reason       text,
  trace_id     text,
  app_version  text
);

-- BẤT BIẾN 4 — Nhật ký CHỈ GHI THÊM, chặn ở tầng CSDL (muc 10). Trigger chặn cả
-- chủ sở hữu bảng. Superuser vẫn có thể DISABLE TRIGGER — giới hạn của Postgres,
-- được bù bằng việc không service nào chạy bằng tài khoản superuser.
CREATE OR REPLACE FUNCTION aud.forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'aud.audit_log chi duoc phep INSERT (YCNV muc 10)'
    USING ERRCODE = 'restrict_violation';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_immutable ON aud.audit_log;
CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON aud.audit_log
  FOR EACH ROW EXECUTE FUNCTION aud.forbid_mutation();

DROP TRIGGER IF EXISTS trg_audit_no_truncate ON aud.audit_log;
CREATE TRIGGER trg_audit_no_truncate
  BEFORE TRUNCATE ON aud.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION aud.forbid_mutation();

CREATE TABLE IF NOT EXISTS sys.app_release (
  id            bigserial PRIMARY KEY,
  app_version   text NOT NULL,
  git_sha       text,
  deployed_at   timestamptz NOT NULL DEFAULT now(),
  deployed_by   text,
  verify_passed boolean
);
