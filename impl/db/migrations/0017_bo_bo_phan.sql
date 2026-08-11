-- =============================================================================
-- 0017_bo_bo_phan — BỎ HẲN thực thể "bộ phận".
--
-- Trước migration này, một TDV nối với người duyệt của mình qua HAI bước gián
-- tiếp: `app_user.department_id` -> `department_approver.user_id`. Bộ phận là
-- một thực thể riêng phải tạo trước, phải gán người duyệt cho nó, rồi mới gán
-- TDV vào — ba thao tác quản trị cho một quan hệ mà nghiệp vụ chỉ nhìn thấy là
-- "TDV này do Trưởng bộ phận nào duyệt".
--
-- Sau migration này quan hệ đó là MỘT CỘT: `app_user.approver_user_id`.
--
-- Đánh đổi đã biết và đã chấp nhận: mất cơ chế "người duyệt thay" của muc 2.3
-- (`department_approver.is_primary`). Mỗi TDV có đúng một người duyệt; TBP đi
-- vắng thì Quản trị đổi cột này, đúng một dòng cho mỗi TDV bị ảnh hưởng.
--
-- Hai hàm PHẢI sửa cùng lượt, vì cả hai đang đọc bảng sắp bị xoá:
--   idn.scope_user_ids  (0003) — TBP thấy hồ sơ của những TDV nào
--   idn.notify_targets  (0010) — thư của hồ sơ gửi cho TBP nào
-- =============================================================================

ALTER TABLE idn.app_user
  ADD COLUMN IF NOT EXISTS approver_user_id uuid REFERENCES idn.app_user(id);

-- Không tự làm người duyệt của chính mình. Khai báo được thì khai báo — trigger
-- bên dưới chỉ lo phần CHECK không diễn đạt nổi (vai trò nằm ở dòng KHÁC).
DO $$ BEGIN
  ALTER TABLE idn.app_user
    ADD CONSTRAINT no_self_approver CHECK (approver_user_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ix_app_user_approver ON idn.app_user(approver_user_id);

-- --- Chuyển dữ liệu đang có ---------------------------------------------------
-- Bộ phận nào có nhiều người duyệt thì lấy người duyệt CHÍNH; hoà thì lấy theo
-- id cho kết quả tất định (chạy lại migration trên bản sao phải ra cùng dữ liệu).
UPDATE idn.app_user t
   SET approver_user_id = (
     SELECT da.user_id
       FROM idn.department_approver da
      WHERE da.department_id = t.department_id
      ORDER BY da.is_primary DESC, da.user_id
      LIMIT 1)
 WHERE t.role = 'TDV' AND t.department_id IS NOT NULL;

-- --- Giữ cột này luôn trỏ vào một Trưởng bộ phận -----------------------------
--
-- Gán nhầm một TDV hay một kế toán vào đây là hồ sơ đi vào NGÕ CỤT: định tuyến
-- vẫn chạy tới người đó, mà người đó không có hành động `TBP_SIGN` nào để làm.
-- Hồ sơ đứng im tới khi quá hạn và không có gì trong sản phẩm chỉ ra nguyên nhân.
-- Tầng service cũng chặn, nhưng seed và sửa tay bằng SQL thì đi vòng qua service.
CREATE OR REPLACE FUNCTION idn.forbid_bad_approver() RETURNS trigger AS $$
DECLARE r idn.user_role;
BEGIN
  IF NEW.approver_user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.role <> 'TDV' THEN
    RAISE EXCEPTION 'Chi TDV moi co Truong bo phan quan ly'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT u.role INTO r FROM idn.app_user u WHERE u.id = NEW.approver_user_id;
  IF r IS DISTINCT FROM 'TBP' THEN
    RAISE EXCEPTION 'Nguoi duyet phai la tai khoan Truong bo phan'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_user_approver ON idn.app_user;
CREATE TRIGGER trg_app_user_approver
  BEFORE INSERT OR UPDATE OF role, approver_user_id ON idn.app_user
  FOR EACH ROW EXECUTE FUNCTION idn.forbid_bad_approver();

-- --- Giải phạm vi dữ liệu (thay bản ở 0003) ----------------------------------
-- Chỉ nhánh TBP đổi; năm nhánh còn lại chép nguyên để giữ hàm này là MỘT nơi
-- định nghĩa duy nhất "ai thấy được gì".
CREATE OR REPLACE FUNCTION idn.scope_user_ids(p_user_id uuid)
RETURNS TABLE (user_id uuid) AS $$
DECLARE r idn.user_role;
BEGIN
  SELECT u.role INTO r FROM idn.app_user u WHERE u.id = p_user_id;
  IF r IS NULL THEN RETURN; END IF;

  IF r = 'BAN_LANH_DAO' THEN                       -- đọc toàn bộ, không giới hạn nhánh
    RETURN QUERY SELECT u.id FROM idn.app_user u;
  ELSIF r = 'QUAN_TRI' THEN                        -- ngoài luồng duyệt, không có phạm vi hồ sơ
    RETURN;
  ELSIF r = 'TDV' THEN                             -- chỉ hồ sơ của chính mình
    RETURN QUERY SELECT p_user_id;
  ELSIF r = 'TBP' THEN                             -- các TDV nhận mình làm người duyệt
    RETURN QUERY
      SELECT u.id FROM idn.app_user u
       WHERE u.role = 'TDV' AND u.approver_user_id = p_user_id;
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

-- --- Người nhận thư của một hồ sơ (thay bản ở 0010) --------------------------
-- Chỉ CTE `approver` đổi: bỏ hai phép nối qua bộ phận, còn một phép nối thẳng.
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
      JOIN idn.app_user u ON u.id = t.approver_user_id
     WHERE t.id = p_tdv AND u.is_active
  )
  SELECT * FROM own
  UNION SELECT * FROM approver
  UNION SELECT * FROM nearest;
END $$ LANGUAGE plpgsql STABLE;

-- --- Gỡ bỏ ------------------------------------------------------------------
-- Xoá SAU khi cả hai hàm đã thôi đọc chúng. Postgres không theo dõi phụ thuộc
-- vào bảng bên trong thân plpgsql, nên thứ tự ở đây là do người viết giữ, không
-- có gì báo lỗi nếu đảo ngược — chỉ hỏng lúc chạy.
DROP TABLE IF EXISTS idn.department_approver;
ALTER TABLE idn.app_user DROP COLUMN IF EXISTS department_id;
DROP TABLE IF EXISTS idn.department;
