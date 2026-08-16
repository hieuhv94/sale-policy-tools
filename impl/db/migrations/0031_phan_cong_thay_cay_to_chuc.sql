-- =============================================================================
-- 0031_phan_cong_thay_cay_to_chuc — bỏ quan hệ quản lý giữa người dùng.
--
-- KHÔNG CÓ 0030, cùng lý do như 0028 (xem đầu `0029`): `0030` là nhãn của đợt
-- phân trang, chỉ đụng giao diện, không có dòng DDL nào.
--
-- --- Đổi cái gì --------------------------------------------------------------
--
-- Tới trước tệp này, "ai xử lý hồ sơ của ai" là một thuộc tính của NGƯỜI DÙNG:
-- `app_user.approver_user_id` trỏ tới Trưởng bộ phận, `user_node.parent_id` dựng
-- cây Sale Admin → Kế toán → TDV. Từ tệp này, nó là thuộc tính của HỒ SƠ: TDV
-- chọn TBP và Kế toán lúc gửi duyệt, Kế toán chọn Sale Admin lúc tiếp nhận L1.
--
-- Cây tổ chức đang gánh BỐN việc, và cả bốn phải có chỗ dựa mới cùng lúc — gỡ
-- cây trước rồi mới dựng cái thay thế là để hở phân quyền giữa hai migration:
--
--   1. `idn.scope_user_ids`  — ai thấy hồ sơ nào, khách hàng nào, báo cáo nào
--   2. `idn.notify_targets`  — thư của một hồ sơ gửi cho ai
--   3. chốt chặn lúc gửi duyệt — "TDV này chưa có người duyệt"
--   4. bộ lọc danh sách TDV mà Sale Admin giao khách được
--
-- --- Phạm vi dữ liệu: từ CÂY sang PHÂN CÔNG ----------------------------------
--
-- `scope_user_ids` co lại còn ba nhánh và không còn đệ quy: Ban lãnh đạo thấy
-- mọi người, Quản trị thấy rỗng, còn lại thấy CHÍNH MÌNH. Phần "còn thấy ai
-- nữa" chuyển sang phía hồ sơ: `pol.policy` mang bốn cột người, và một hồ sơ
-- thuộc phạm vi của tôi khi tên tôi nằm ở MỘT TRONG BỐN cột ấy.
--
-- Vì sao không giữ `scope_user_ids` trả về "những TDV tôi được giao": vì phân
-- công nằm trên từng hồ sơ chứ không trên từng người. Cùng một TDV có hồ sơ này
-- gửi cho tôi và hồ sơ kia gửi cho Trưởng bộ phận khác — không có tập "TDV của
-- tôi" nào để trả về nữa.
--
-- --- Cái KHÔNG đổi -----------------------------------------------------------
--
-- Một CSBH còn hiệu lực mỗi khách hàng, chuỗi phiên bản `supersedes_id`, và
-- `uq_policy_active_per_customer` giữ nguyên. Đợt này không đụng tới vòng đời
-- hiệu lực.
-- =============================================================================

-- --- 1. Bốn cột người trên hồ sơ ---------------------------------------------
--
-- KHÔNG có khoá ngoại sang `idn.app_user`, đúng theo nếp của `tdv_user_id`
-- (`0007`): mỗi service sở hữu schema của mình và không ai được khoá cứng vào
-- bảng của service khác. Ràng buộc vai trò kiểm ở tầng service lúc chọn.
--
-- Cho phép NULL vì chúng được điền dần theo luồng: `tbp_user_id` và
-- `ke_toan_user_id` có mặt lúc gửi duyệt, `sale_admin_user_id` lúc tiếp nhận
-- L1. Hồ sơ Nháp chưa có cột nào, và đó là trạng thái đúng — chưa ai được giao.
ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS tbp_user_id        uuid,
  ADD COLUMN IF NOT EXISTS ke_toan_user_id    uuid,
  ADD COLUMN IF NOT EXISTS sale_admin_user_id uuid;

COMMENT ON COLUMN pol.policy.tbp_user_id IS
  'Trưởng bộ phận do TDV chọn lúc gửi duyệt (0031). NULL khi hồ sơ còn Nháp.';
COMMENT ON COLUMN pol.policy.ke_toan_user_id IS
  'Kế toán do TDV chọn lúc gửi duyệt. Nhận CẢ L1 VÀ L2 — một vai trò, một người, hai màn hình.';
COMMENT ON COLUMN pol.policy.sale_admin_user_id IS
  'Sale Admin do Kế toán chọn lúc tiếp nhận L1. NULL trước bước đó.';

-- Ba chỉ mục riêng, không phải một chỉ mục ghép: câu lọc phạm vi là bốn vế `OR`
-- trên bốn cột khác nhau, và Postgres chỉ dùng được chỉ mục ghép khi vế đầu của
-- nó có mặt trong điều kiện.
CREATE INDEX IF NOT EXISTS ix_policy_tbp ON pol.policy(tbp_user_id);
CREATE INDEX IF NOT EXISTS ix_policy_ke_toan ON pol.policy(ke_toan_user_id);
CREATE INDEX IF NOT EXISTS ix_policy_sale_admin ON pol.policy(sale_admin_user_id);

-- --- 2. Chuyển dữ liệu đang có ------------------------------------------------
--
-- Hồ sơ đã gửi duyệt trước tệp này KHÔNG có ai được chọn, vì lúc ấy chưa có chỗ
-- để chọn. Suy ngược từ cây tổ chức đang còn sống — đây là lần cuối cùng cây ấy
-- được dùng, và phải chạy TRƯỚC khi gỡ nó.
--
-- Bỏ qua hồ sơ Nháp: chúng chưa gửi duyệt nên chưa cần ai, và người lập sẽ chọn
-- lúc bấm gửi. Điền sẵn cho chúng là bịa ra một quyết định người dùng chưa đưa.
UPDATE pol.policy p
   SET tbp_user_id = u.approver_user_id
  FROM idn.app_user u
 WHERE u.id = p.tdv_user_id
   AND p.tbp_user_id IS NULL
   AND p.status NOT IN ('NHAP', 'YEU_CAU_CHINH_SUA')
   AND u.approver_user_id IS NOT NULL;

-- Kế toán và Sale Admin: tổ tiên GẦN NHẤT theo vai trò, đúng phép mà
-- `notify_targets` đang dùng để chọn người nhận thư.
WITH RECURSIVE up AS (
  SELECT n.user_id AS goc, n.user_id AS uid, n.parent_id, 0 AS depth
    FROM idn.user_node n
  UNION ALL
  SELECT up.goc, n.user_id, n.parent_id, up.depth + 1
    FROM idn.user_node n JOIN up ON n.user_id = up.parent_id
   WHERE up.depth < 50
),
gan_nhat AS (
  SELECT DISTINCT ON (up.goc, u.role) up.goc, u.role::text AS vai_tro, u.id
    FROM up JOIN idn.app_user u ON u.id = up.uid
   WHERE up.depth > 0 AND u.is_active AND u.role IN ('KE_TOAN', 'SALE_ADMIN')
   ORDER BY up.goc, u.role, up.depth
)
UPDATE pol.policy p
   SET ke_toan_user_id = COALESCE(
         p.ke_toan_user_id,
         (SELECT g.id FROM gan_nhat g WHERE g.goc = p.tdv_user_id AND g.vai_tro = 'KE_TOAN')),
       sale_admin_user_id = CASE
         WHEN p.status IN ('SA_DANG_XU_LY', 'CHO_KT_L2', 'DANG_CO_HIEU_LUC', 'QUA_HAN_DUYET')
           THEN COALESCE(
             p.sale_admin_user_id,
             (SELECT g.id FROM gan_nhat g WHERE g.goc = p.tdv_user_id AND g.vai_tro = 'SALE_ADMIN'))
         ELSE p.sale_admin_user_id
       END
 WHERE p.status NOT IN ('NHAP', 'YEU_CAU_CHINH_SUA');

-- --- 3. Phạm vi dữ liệu -------------------------------------------------------
--
-- Ba nhánh, không đệ quy, không đọc `user_node` hay `approver_user_id` nữa.
--
-- Giữ NGUYÊN tên và chữ ký hàm: bảy chỗ trong bốn service gọi nó, và đổi tên chỉ
-- để nói "nó không còn là cây" là bắt bảy chỗ ấy sửa theo mà không đổi hành vi
-- nào. Ý nghĩa mới nằm ở chú thích và ở phía hồ sơ.
CREATE OR REPLACE FUNCTION idn.scope_user_ids(p_user_id uuid)
RETURNS TABLE (user_id uuid) AS $$
DECLARE r idn.user_role;
BEGIN
  SELECT u.role INTO r FROM idn.app_user u WHERE u.id = p_user_id;
  IF r IS NULL THEN RETURN; END IF;

  IF r = 'BAN_LANH_DAO' THEN         -- đọc toàn bộ, không giới hạn
    RETURN QUERY SELECT u.id FROM idn.app_user u;
  ELSIF r = 'QUAN_TRI' THEN          -- ngoài luồng duyệt, không có phạm vi hồ sơ
    RETURN;
  ELSE
    -- TDV, TBP, Kế toán, Sale Admin: CHÍNH MÌNH.
    --
    -- Không còn "cấp dưới của tôi" nữa. Việc "hồ sơ này của tôi" do bốn cột
    -- người trên `pol.policy` trả lời, và phía hồ sơ so id của tôi với cả bốn.
    RETURN QUERY SELECT p_user_id;
  END IF;
END $$ LANGUAGE plpgsql STABLE;

-- --- 4. Người nhận thư --------------------------------------------------------
--
-- Chữ ký ĐỔI: nhận đủ bốn người của hồ sơ thay vì suy ngược từ một mình TDV.
-- Người gửi thư là người biết hồ sơ, không phải người biết cây.
--
-- Bản cũ `notify_targets(uuid)` bị xoá hẳn ở cuối tệp. Để lại hai bản chồng tên
-- thì Postgres chọn theo số tham số và một lời gọi thiếu đối số sẽ âm thầm rơi
-- vào bản cũ — im lặng đúng tới ngày cây tổ chức không còn dữ liệu.
CREATE OR REPLACE FUNCTION idn.notify_targets(
  p_tdv uuid, p_tbp uuid, p_ke_toan uuid, p_sale_admin uuid)
RETURNS TABLE (target_user_id uuid, target_role text, target_email text, target_name text)
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.role::text, u.email, u.full_name
    FROM idn.app_user u
   WHERE u.is_active
     AND u.id IN (p_tdv, p_tbp, p_ke_toan, p_sale_admin);
END $$ LANGUAGE plpgsql STABLE;

-- --- 5. Gỡ cây ---------------------------------------------------------------
--
-- Xoá SAU khi cả hai hàm đã thôi đọc chúng và sau khi đã chuyển dữ liệu ở bước
-- 2. Postgres KHÔNG theo dõi phụ thuộc vào bảng nằm trong thân plpgsql, nên thứ
-- tự ở đây do người viết giữ — đảo ngược thì không có gì báo lỗi lúc migrate,
-- chỉ hỏng lúc chạy.
-- Tên trigger là `trg_app_user_approver`, KHÔNG phải `trg_forbid_bad_approver`
-- (`0017` đặt tên trigger khác tên hàm). Gỡ trigger trước rồi mới gỡ hàm: bỏ hàm
-- trước thì Postgres từ chối vì trigger còn phụ thuộc vào nó.
DROP TRIGGER IF EXISTS trg_app_user_approver ON idn.app_user;
DROP FUNCTION IF EXISTS idn.forbid_bad_approver();

DROP INDEX IF EXISTS idn.ix_app_user_approver;
ALTER TABLE idn.app_user DROP CONSTRAINT IF EXISTS no_self_approver;
ALTER TABLE idn.app_user DROP COLUMN IF EXISTS approver_user_id;

DROP TABLE IF EXISTS idn.user_node;

DROP FUNCTION IF EXISTS idn.notify_targets(uuid);

-- --- 6. Read-model báo cáo ----------------------------------------------------
--
-- `rpt.policy_row` lọc theo phạm vi y như `pol.policy`, nên nó cần đúng bốn cột
-- ấy. Không có cột thì báo cáo của một Trưởng bộ phận rỗng trơn — mà báo cáo
-- rỗng đọc ra là "không có hồ sơ nào", không phải "tôi không tra được".
ALTER TABLE rpt.policy_row
  ADD COLUMN IF NOT EXISTS tbp_user_id        uuid,
  ADD COLUMN IF NOT EXISTS ke_toan_user_id    uuid,
  ADD COLUMN IF NOT EXISTS sale_admin_user_id uuid;

CREATE INDEX IF NOT EXISTS ix_policy_row_tbp ON rpt.policy_row(tbp_user_id);
CREATE INDEX IF NOT EXISTS ix_policy_row_ke_toan ON rpt.policy_row(ke_toan_user_id);
CREATE INDEX IF NOT EXISTS ix_policy_row_sale_admin ON rpt.policy_row(sale_admin_user_id);

UPDATE rpt.policy_row r
   SET tbp_user_id = p.tbp_user_id,
       ke_toan_user_id = p.ke_toan_user_id,
       sale_admin_user_id = p.sale_admin_user_id
  FROM pol.policy p
 WHERE p.id = r.policy_id;

-- --- 7. Ai thấy được khách hàng ----------------------------------------------
--
-- Khách hàng nằm ở schema `cus`, phân công nằm ở `pol` — hai service, và service
-- khách hàng không đọc được bảng của service hồ sơ.
--
-- `policy` ghi vào đây qua `POST /internal/customers/:id/access` ngay sau khi ghi
-- phân công — ĐỒNG BỘ, không qua hàng đợi.
--
-- Từng thử bằng consumer nghe `policy.#`, và bỏ: quyền tới MUỘN là loại lỗi tệ
-- nhất trong một phép kiểm quyền. Người vừa được giao hồ sơ mở màn hình khách
-- hàng ra và nhận 403, vài giây sau lại được — không ai tin một hệ thống hành xử
-- như vậy, và không ai tra ra nguyên nhân.
--
-- Chiều gọi policy → customer ĐÃ TỒN TẠI (policy hỏi mã và tên khách để nhét vào
-- sự kiện), nên đây không thêm điểm hỏng mới nào.
--
-- TDV phụ trách KHÔNG cần dòng nào ở đây: `cus.customer.tdv_user_id` đã nói
-- điều đó, và nó đúng ngay cả với khách chưa có hồ sơ nào.
CREATE TABLE IF NOT EXISTS cus.customer_access (
  customer_id uuid NOT NULL REFERENCES cus.customer(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_customer_access_user ON cus.customer_access(user_id);

COMMENT ON TABLE cus.customer_access IS
  'Ai xem được khách hàng nào, suy từ phân công trên hồ sơ CSBH (0031). '
  'Chỉ ghi THÊM: mất quyền xem một khách đã từng xử lý là mất khả năng tra cứu '
  'lại việc mình đã làm.';

-- Không cần GRANT: `0002` đã đặt ALTER DEFAULT PRIVILEGES cho từng schema, nên
-- bảng mới trong `cus` tự có quyền của `csbh_cus`. Đây cũng là nếp của `0029`.
