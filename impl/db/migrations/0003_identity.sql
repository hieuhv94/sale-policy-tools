-- =============================================================================
-- 0003_identity — Tài khoản, 6 vai trò, và CÂY PHÂN QUYỀN DỮ LIỆU (YCNV muc 2.1).
--
-- Phạm vi hồ sơ mỗi người nhìn thấy SUY RA từ cây tổ chức, không cấu hình tay
-- từng người. Có hai cấu trúc độc lập nhau:
--   1. Chuỗi Sale Admin -> kế toán -> TDV  (bang idn.user_node)
--   2. Nhánh duyệt: bộ phận -> Trưởng bộ phận (bang idn.department_approver)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE idn.user_role AS ENUM (
    'TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO', 'QUAN_TRI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS idn.department (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code  text UNIQUE NOT NULL,
  name  text NOT NULL
);

CREATE TABLE IF NOT EXISTS idn.app_user (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username        text UNIQUE NOT NULL,
  email           text UNIQUE NOT NULL,
  full_name       text NOT NULL,
  role            idn.user_role NOT NULL,
  department_id   uuid REFERENCES idn.department(id),
  password_hash   text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Cây Sale Admin -> kế toán -> TDV. Một dòng cho mỗi người có cấp trên.
CREATE TABLE IF NOT EXISTS idn.user_node (
  user_id   uuid PRIMARY KEY REFERENCES idn.app_user(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES idn.app_user(id),
  CONSTRAINT no_self_parent CHECK (user_id <> parent_id)
);
CREATE INDEX IF NOT EXISTS ix_user_node_parent ON idn.user_node(parent_id);

-- Vai trò Trưởng bộ phận cấu hình THEO BỘ PHẬN, có người duyệt thay (muc 2.3).
-- Không gán cứng một cá nhân: đổi người giữ chức chỉ là đổi dòng ở đây.
CREATE TABLE IF NOT EXISTS idn.department_approver (
  department_id uuid NOT NULL REFERENCES idn.department(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES idn.app_user(id) ON DELETE CASCADE,
  is_primary    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (department_id, user_id)
);

CREATE TABLE IF NOT EXISTS idn.refresh_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES idn.app_user(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,          -- một họ token cho mỗi lần đăng nhập
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,            -- đã xoay vòng
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_refresh_family ON idn.refresh_token(family_id);

-- --- Chặn vòng lặp trong cây tổ chức ----------------------------------------
-- Không có ràng buộc khai báo nào của Postgres diễn đạt được "đồ thị không chu
-- trình", nên phải dùng trigger. Nếu thiếu, truy vấn đệ quy sẽ chạy vô tận.
CREATE OR REPLACE FUNCTION idn.forbid_cycle() RETURNS trigger AS $$
DECLARE cyclic boolean;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  WITH RECURSIVE up AS (
    SELECT NEW.parent_id AS uid, 1 AS depth
    UNION ALL
    SELECT n.parent_id, up.depth + 1 FROM idn.user_node n
      JOIN up ON n.user_id = up.uid
     WHERE n.parent_id IS NOT NULL AND up.depth < 50
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE uid = NEW.user_id) INTO cyclic;
  IF cyclic THEN
    RAISE EXCEPTION 'Cay to chuc khong duoc phep co vong lap'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_node_no_cycle ON idn.user_node;
CREATE TRIGGER trg_user_node_no_cycle
  BEFORE INSERT OR UPDATE ON idn.user_node
  FOR EACH ROW EXECUTE FUNCTION idn.forbid_cycle();

-- --- Giải phạm vi dữ liệu ----------------------------------------------------
-- Trả về tập id người dùng mà người này được xem hồ sơ. MỘT nơi định nghĩa duy
-- nhất "ai thấy được gì" — mọi service đều gọi hàm này, không tự suy diễn.
CREATE OR REPLACE FUNCTION idn.scope_user_ids(p_user_id uuid)
RETURNS TABLE (user_id uuid) AS $$
DECLARE r idn.user_role; dep uuid;
BEGIN
  SELECT u.role, u.department_id INTO r, dep FROM idn.app_user u WHERE u.id = p_user_id;
  IF r IS NULL THEN RETURN; END IF;

  IF r = 'BAN_LANH_DAO' THEN                       -- đọc toàn bộ, không giới hạn nhánh
    RETURN QUERY SELECT u.id FROM idn.app_user u;
  ELSIF r = 'QUAN_TRI' THEN                        -- ngoài luồng duyệt, không có phạm vi hồ sơ
    RETURN;
  ELSIF r = 'TDV' THEN                             -- chỉ hồ sơ của chính mình
    RETURN QUERY SELECT p_user_id;
  ELSIF r = 'TBP' THEN
    -- Các TDV thuộc những bộ phận mà người này là người duyệt (kể cả duyệt thay).
    RETURN QUERY
      SELECT u.id FROM idn.app_user u
       WHERE u.role = 'TDV'
         AND u.department_id IN (
           SELECT da.department_id FROM idn.department_approver da WHERE da.user_id = p_user_id);
  ELSE
    -- KE_TOAN và SALE_ADMIN: chính mình cộng toàn bộ cấp dưới, đệ quy.
    RETURN QUERY
      WITH RECURSIVE sub AS (
        SELECT p_user_id AS uid, 0 AS depth
        UNION ALL
        SELECT n.user_id, sub.depth + 1 FROM idn.user_node n
          JOIN sub ON n.parent_id = sub.uid
         WHERE sub.depth < 50
      )
      SELECT sub.uid FROM sub;
  END IF;
END $$ LANGUAGE plpgsql STABLE;
