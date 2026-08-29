-- `0155` — BỎ HẲN TRẠNG THÁI `TU_CHOI`.
--
-- Khách hàng chốt 29/08: *"Bỏ hoàn toàn trạng thái Từ chối"*, và **bỏ luôn cả
-- nút** — Trưởng bộ phận ở bước *Chờ TBP duyệt* chỉ còn một đường ra là *Trả
-- lại*.
--
-- ---------------------------------------------------------------------------
-- ĐƯỜNG KẾT THÚC MỘT HỒ SƠ KHÔNG MẤT, NÓ ĐỔI TAY
-- ---------------------------------------------------------------------------
--
-- Trước lượt này có hai đường kết thúc một hồ sơ không dùng được:
--
--   TBP bấm *Từ chối*            → TU_CHOI   (TBP quyết định)
--   TBP trả lại, TDV bấm *Xoá*   → DA_XOA    (người lập quyết định)
--
-- Bỏ đường thứ nhất là dồn về đường thứ hai, và nó khớp với luật đã có: `0099`
-- chốt **chỉ TDV xoá được hồ sơ của mình**, còn TBP thì không. Hai đường cùng
-- dẫn tới *"hồ sơ này không đi tiếp"* mà một đường cho người khác quyết định số
-- phận bản nháp của TDV là một sự bất đối xứng — giờ hết.
--
-- CÁI MẤT, ghi ra để không ai phải đi tìm: TBP **không còn tự kết thúc** được
-- một hồ sơ. Họ trả lại, và nếu TDV không đồng ý thì hồ sơ nằm ở *Yêu cầu chỉnh
-- sửa* cho tới khi một trong hai người hành động. Không có SLA nào ở trạng thái
-- ấy (`WAITING` chỉ gồm bốn trạng thái chờ), nên nó nằm được vô thời hạn.
--
-- ---------------------------------------------------------------------------
-- HỒ SƠ ĐANG Ở `TU_CHOI` CHUYỂN SANG `DA_XOA`
-- ---------------------------------------------------------------------------
--
-- Phải chuyển, không phải chọn: Postgres không có `ALTER TYPE ... DROP VALUE`,
-- nên bỏ một giá trị enum là dựng lại cả kiểu — và không dòng nào được còn mang
-- giá trị cũ lúc đổi kiểu.
--
-- `DA_XOA` là đích đúng chứ không phải đích tiện: cả hai đều là *"kết thúc, không
-- ai thao tác được nữa"*, cả hai đều **không xoá được** (`trg_forbid_delete_rejected`
-- chặn cả hai từ `0035`), và nhật ký của hồ sơ vẫn kể đúng chuyện đã xảy ra —
-- dòng `policy_event` mang lý do TBP đã gõ vẫn nằm nguyên đó.
--
-- Trên hệ thật con số này là 0 (hệ chưa nhận dữ liệu). Trên CSDL của bộ kiểm và
-- `make demo-mau` thì có, và cả hai đều dựng lại được từ đầu.

-- --- 1. Chuyển dữ liệu TRƯỚC khi đổi kiểu ------------------------------------
UPDATE pol.policy      SET status      = 'DA_XOA' WHERE status      = 'TU_CHOI';
UPDATE pol.policy_event SET from_status = 'DA_XOA' WHERE from_status = 'TU_CHOI';
UPDATE pol.policy_event SET to_status   = 'DA_XOA' WHERE to_status   = 'TU_CHOI';

-- --- 2. Dựng lại kiểu, thiếu đúng một giá trị --------------------------------
--
-- Từng bước một theo đúng công thức `0048` đã đi. Ba chỉ mục và giá trị mặc định
-- phải gỡ trước: định nghĩa của chúng mang hằng số thuộc kiểu CŨ, và sau bước
-- đổi tên thì hằng ấy thuộc `policy_status_cu` còn cột thuộc kiểu mới — Postgres
-- dừng với "operator does not exist".
DROP INDEX IF EXISTS pol.uq_policy_active_per_customer;
DROP INDEX IF EXISTS pol.ix_policy_qua_han_cho_xoa;
DROP INDEX IF EXISTS pol.ix_policy_customer_status;

ALTER TABLE pol.policy ALTER COLUMN status DROP DEFAULT;

ALTER TYPE pol.policy_status RENAME TO policy_status_cu;

CREATE TYPE pol.policy_status AS ENUM (
  'NHAP', 'CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY',
  'CHO_KT_L2', 'DANG_CO_HIEU_LUC', 'HET_HIEU_LUC', 'YEU_CAU_CHINH_SUA',
  'QUA_HAN_DUYET', 'DA_XOA');

-- Ba cột dùng kiểu này. `from_status` cho phép NULL — dòng đầu tiên của một hồ
-- sơ đi ra từ hư không — nên phép ép kiểu phải để NULL đi qua nguyên vẹn.
ALTER TABLE pol.policy
  ALTER COLUMN status TYPE pol.policy_status USING status::text::pol.policy_status;

ALTER TABLE pol.policy_event
  ALTER COLUMN from_status TYPE pol.policy_status
  USING (CASE WHEN from_status IS NULL THEN NULL ELSE from_status::text END)
        ::pol.policy_status;

ALTER TABLE pol.policy_event
  ALTER COLUMN to_status TYPE pol.policy_status USING to_status::text::pol.policy_status;

ALTER TABLE pol.policy ALTER COLUMN status SET DEFAULT 'NHAP';

CREATE UNIQUE INDEX uq_policy_active_per_customer
  ON pol.policy (customer_id) WHERE status = 'DANG_CO_HIEU_LUC';

CREATE INDEX ix_policy_qua_han_cho_xoa
  ON pol.policy (overdue_at)
  WHERE status = 'QUA_HAN_DUYET';

CREATE INDEX ix_policy_customer_status ON pol.policy (customer_id, status);

DROP TYPE pol.policy_status_cu;

COMMENT ON TYPE pol.policy_status IS
  'Mười trạng thái hồ sơ CSBH (YCNV mục 4 + DA_XOA ở 0035). TBP_DA_KY_SO bỏ ở '
  '0048; TU_CHOI bỏ ở 0155 — TBP chỉ còn đường Trả lại.';

-- --- 3. Chốt chặn xoá: giờ chỉ còn MỘT trạng thái ---------------------------
--
-- TÊN GIỮ NGUYÊN `forbid_delete_rejected`, và giờ cái tên ấy nói về một thứ
-- không còn tồn tại. `0035` đã cân nhắc đổi tên và không đổi vì nó kéo theo
-- `seed-demo.ts`, bốn tệp kiểm và một phép khẳng định đọc thẳng `pg_trigger.tgname`;
-- lý do ấy vẫn đúng. Chú thích bên dưới là chỗ nói ra sự thật.
CREATE OR REPLACE FUNCTION pol.forbid_delete_rejected() RETURNS trigger AS $$
BEGIN
  IF OLD.status::text = 'DA_XOA' THEN
    RAISE EXCEPTION 'Ho so o trang thai % khong the xoa (0035)', OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION pol.forbid_delete_rejected() IS
  'Chặn xoá hồ sơ ở trạng thái kết thúc DA_XOA (0035). Tên hàm nhắc TU_CHOI — '
  'trạng thái ấy đã bỏ ở 0155; đổi tên đắt hơn giá trị nên giữ nguyên.';

-- --- 4. Read-model ----------------------------------------------------------
--
-- `rpt.policy_row.status` là `text` chứ không phải enum — nó nhận giá trị qua
-- hàng đợi và không được phép chết vì một giá trị lạ. Dọn nốt để bộ lọc và ô đếm
-- không còn nhóm nào mang nhãn đã bỏ.
UPDATE rpt.policy_row SET status = 'DA_XOA' WHERE status = 'TU_CHOI';

-- `rejected_at` GIỮ LẠI, không gỡ.
--
-- Nó là cột MỐC THỜI GIAN của một việc đã xảy ra thật với những hồ sơ vừa
-- chuyển sang `DA_XOA`. Gỡ đi là xoá mất câu trả lời cho *"hồ sơ này kết thúc
-- lúc nào"* của chính chúng, và `policy_event` thì chỉ kể được nếu ai đó đi đọc
-- nhật ký. Không đường ghi nào đặt nó nữa — chốt ấy nằm ở tầng ứng dụng.
COMMENT ON COLUMN pol.policy.rejected_at IS
  'Mốc bị từ chối. TỪ 0155 KHÔNG CÒN ĐƯỜNG GHI NÀO đặt cột này — nó chỉ giữ mốc '
  'của những hồ sơ bị từ chối trước ngày 29/08, nay mang trạng thái DA_XOA.';
