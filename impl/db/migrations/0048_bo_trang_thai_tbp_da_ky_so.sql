-- =============================================================================
-- 0048 — Gỡ hẳn `TBP_DA_KY_SO` khỏi enum `pol.policy_status`.
--
-- Đợt `0064` (P74) đã gỡ trạng thái này khỏi máy trạng thái: `TBP_SIGN` giờ đi
-- thẳng `CHO_TBP_DUYET -> CHO_KT_L1` trong một nước. Lý do gỡ nằm ở thư: đó là
-- HAI lần chuyển bước, tức hai sự kiện, và Kế toán có tên trong danh sách nhận
-- của cả hai — mỗi lần Trưởng bộ phận ký, kế toán nhận hai lá thư trong cùng
-- một giây.
--
-- Lúc ấy tôi để giá trị enum ở lại, vì Postgres không xoá được một giá trị khỏi
-- enum và `pol.policy_event` có thể còn dòng lịch sử ghi nó. Khách hàng chốt
-- ngày 19/08: **xoá luôn**, làm lại CSDL sạch. Phần mềm chưa chạy thật, dữ liệu
-- duy nhất đang có là của `make demo-mau` — cái giá của việc giữ lại một giá trị
-- không ai dùng nữa cao hơn cái giá của việc dựng lại dữ liệu mẫu.
--
-- CÁCH LÀM: không có `ALTER TYPE ... DROP VALUE` trong Postgres, nên phải đổi
-- tên kiểu cũ, dựng kiểu mới, chuyển từng cột sang, rồi bỏ kiểu cũ. Cả file chạy
-- trong MỘT transaction (xem `scripts/migrate.sh`), nên hỏng giữa chừng thì
-- không để lại lược đồ nửa vời.
--
-- Dữ liệu cũ mang giá trị này được ánh xạ sang `CHO_KT_L1` — đúng chỗ nó sẽ
-- dừng lại nếu bước tự động chạy xong. Ánh xạ nằm trong mệnh đề `USING` của
-- `ALTER COLUMN TYPE` chứ không phải một câu `UPDATE`: `ALTER` viết lại bảng mà
-- KHÔNG kích hoạt trigger dòng, nên không phải tắt bất kỳ chốt bảo vệ nào.
-- =============================================================================

-- 1. Ba chỉ mục có `status` trong định nghĩa phải bỏ trước.
--
--    `ALTER COLUMN TYPE` tự dựng lại chỉ mục, NHƯNG vị từ của hai chỉ mục riêng
--    phần mang hằng số thuộc kiểu CŨ (`status = 'DANG_CO_HIEU_LUC'`). Sau bước
--    đổi tên, hằng số ấy thuộc `policy_status_cu` còn cột thuộc kiểu mới, và
--    Postgres dừng với "operator does not exist". Bỏ rồi dựng lại là đường
--    thẳng; giữ lại rồi chữa là đi vòng.
DROP INDEX IF EXISTS pol.uq_policy_active_per_customer;
DROP INDEX IF EXISTS pol.ix_policy_qua_han_cho_xoa;
DROP INDEX IF EXISTS pol.ix_policy_customer_status;

-- 2. Giá trị mặc định cũng mang kiểu cũ — gỡ ra, đặt lại ở bước 5.
ALTER TABLE pol.policy ALTER COLUMN status DROP DEFAULT;

-- 3. Kiểu cũ ra rìa, kiểu mới vào chỗ nó. Mười một giá trị: mục 4 của YCNV,
--    cộng `DA_XOA` (`0035`), trừ `TBP_DA_KY_SO`.
ALTER TYPE pol.policy_status RENAME TO policy_status_cu;

CREATE TYPE pol.policy_status AS ENUM (
  'NHAP', 'CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY',
  'CHO_KT_L2', 'DANG_CO_HIEU_LUC', 'HET_HIEU_LUC', 'YEU_CAU_CHINH_SUA',
  'TU_CHOI', 'QUA_HAN_DUYET', 'DA_XOA');

-- 4. Ba cột dùng kiểu này. `from_status` cho phép NULL — dòng đầu tiên của một
--    hồ sơ đi ra từ hư không — nên `CASE` phải để NULL đi qua nguyên vẹn.
ALTER TABLE pol.policy
  ALTER COLUMN status TYPE pol.policy_status
  USING (CASE WHEN status::text = 'TBP_DA_KY_SO' THEN 'CHO_KT_L1' ELSE status::text END)
        ::pol.policy_status;

ALTER TABLE pol.policy_event
  ALTER COLUMN from_status TYPE pol.policy_status
  USING (CASE
           WHEN from_status IS NULL THEN NULL
           WHEN from_status::text = 'TBP_DA_KY_SO' THEN 'CHO_KT_L1'
           ELSE from_status::text
         END)::pol.policy_status;

ALTER TABLE pol.policy_event
  ALTER COLUMN to_status TYPE pol.policy_status
  USING (CASE WHEN to_status::text = 'TBP_DA_KY_SO' THEN 'CHO_KT_L1' ELSE to_status::text END)
        ::pol.policy_status;

-- 5. Trả lại mặc định và ba chỉ mục, y nguyên định nghĩa cũ.
ALTER TABLE pol.policy ALTER COLUMN status SET DEFAULT 'NHAP';

CREATE UNIQUE INDEX uq_policy_active_per_customer
  ON pol.policy (customer_id) WHERE status = 'DANG_CO_HIEU_LUC';

CREATE INDEX ix_policy_qua_han_cho_xoa
  ON pol.policy (overdue_at)
  WHERE status = 'QUA_HAN_DUYET';

CREATE INDEX ix_policy_customer_status ON pol.policy (customer_id, status);

DROP TYPE pol.policy_status_cu;

-- 6. Read-model giữ `status` dạng `text`, không phải enum — nó nhận giá trị qua
--    hàng đợi và không được phép chết vì một giá trị lạ. Dọn nốt để bộ lọc và
--    ô đếm không còn nhóm nào mang nhãn đã bỏ.
--
--    `rpt.policy_row` vẫn dựng lại được toàn bộ từ nguồn bằng `SyncService`, nên
--    dòng này chỉ là để không phải chờ tới lần dựng lại kế tiếp.
UPDATE rpt.policy_row SET status = 'CHO_KT_L1' WHERE status = 'TBP_DA_KY_SO';

COMMENT ON TYPE pol.policy_status IS
  'Mười một trạng thái hồ sơ CSBH (YCNV mục 4 + DA_XOA ở 0035). TBP_DA_KY_SO bỏ ở 0048.';
