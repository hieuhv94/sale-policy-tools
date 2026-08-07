-- =============================================================================
-- 0002_roles — Mỗi service một DB role riêng (quyết định kiến trúc AD-02).
--
-- Ranh giới sở hữu dữ liệu là ranh giới CỨNG: service khác không SELECT chéo được
-- vì không có quyền, nên vi phạm lỗi ngay lúc chạy chứ không lọt qua review.
-- =============================================================================

-- Mặc định Postgres cho PUBLIC quyền kết nối và dùng schema public. Thu hồi hết.
REVOKE ALL ON DATABASE csbh FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

DO $$
DECLARE
  r      record;
  pwd    text := coalesce(current_setting('csbh.role_password', true), 'csbh_dev_pw');
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('csbh_idn','idn'), ('csbh_cat','cat'), ('csbh_cus','cus'),
      ('csbh_pol','pol'), ('csbh_doc','doc'), ('csbh_ntf','ntf'),
      ('csbh_rpt','rpt'), ('csbh_aud','aud'), ('csbh_sys','sys')
    ) AS t(role_name, schema_name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.role_name) THEN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', r.role_name, pwd);
    END IF;

    EXECUTE format('GRANT CONNECT ON DATABASE csbh TO %I', r.role_name);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', r.schema_name, r.role_name);

    -- audit là ngoại lệ: CHỈ ghi thêm và đọc, không sửa không xoá (muc 10).
    IF r.role_name = 'csbh_aud' THEN
      EXECUTE format('GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA %I TO %I',
                     r.schema_name, r.role_name);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA %I FROM %I',
                     r.schema_name, r.role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT ON TABLES TO %I',
                     r.schema_name, r.role_name);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
                     r.schema_name, r.role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
                     r.schema_name, r.role_name);
    END IF;

    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I',
                   r.schema_name, r.role_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I',
                   r.schema_name, r.role_name);
  END LOOP;
END $$;

-- sla-worker dùng chung lược đồ với policy nên dùng lại role csbh_pol.
-- reporting cần ĐỌC read-model của chính nó, dữ liệu tới qua sự kiện chứ không join chéo.
