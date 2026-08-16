-- =============================================================================
-- 0034_ngung_hop_tac — khách hàng có trạng thái, và "xoá" gộp vào một nút.
--
-- --- Vấn đề ------------------------------------------------------------------
--
-- Tới trước tệp này, `cus.customer` KHÔNG có cột trạng thái nào. Hệ quả: tình
-- huống "khách hàng này ngừng hợp tác" không có cơ chế nào cả —
--
--   * Xoá thì không được: khoá ngoại từ `pol.policy` chặn ngay khi khách đã có
--     dù một hồ sơ Nháp.
--   * Vô hiệu hoá thì không tồn tại.
--
-- Nên họ nằm mãi trong danh sách, mãi trong ô chọn lúc lập hồ sơ, và CSBH của
-- họ VÔ THỜI HẠN nên vẫn "Đang có hiệu lực" vĩnh viễn.
--
-- --- Một nút, hai kết cục ----------------------------------------------------
--
-- Người dùng chỉ thấy MỘT thao tác: *Ngừng hợp tác*. Điều kiện cũng chỉ có một:
-- **không CSBH nào đang chờ**. Còn kết cục thì hệ thống tự chọn theo việc khách
-- ấy đã có lịch sử hay chưa:
--
--   * **Chưa có hồ sơ nào** → xoá hẳn dòng. Không có gì để giữ lại, và một bản
--     ghi lập nhầm bị "ngừng hợp tác" sẽ nằm lại trong mọi danh sách mãi mãi.
--   * **Đã có hồ sơ** → chuyển `NGUNG_HOP_TAC`, và mọi CSBH đang hiệu lực chuyển
--     `HET_HIEU_LUC`. KHÔNG xoá dòng: hồ sơ trỏ vào khách hàng bằng khoá ngoại,
--     và xoá là mất luôn tên khách trên mọi hồ sơ cũ.
--
-- Gộp được vì hai thao tác cũ trả lời cùng một câu hỏi của người dùng — "cho
-- khách này biến khỏi danh sách làm việc của tôi" — chỉ khác nhau ở chỗ có lịch
-- sử phải giữ hay không. Đó là chi tiết của hệ thống, không phải quyết định của
-- người dùng.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE cus.customer_status AS ENUM ('DANG_HOP_TAC', 'NGUNG_HOP_TAC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE cus.customer
  ADD COLUMN IF NOT EXISTS status cus.customer_status NOT NULL DEFAULT 'DANG_HOP_TAC',
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

COMMENT ON COLUMN cus.customer.status IS
  'Ngừng hợp tác thì khách biến khỏi ô chọn lúc lập hồ sơ, nhưng hồ sơ cũ vẫn tra được (0034).';

-- Chỉ mục một phía: mọi truy vấn đều hỏi "khách nào CÒN hợp tác", không ai hỏi
-- ngược lại. Chỉ mục riêng phần nhỏ hơn hẳn chỉ mục đầy đủ trên một cột mà 99%
-- giá trị giống nhau.
CREATE INDEX IF NOT EXISTS ix_customer_dang_hop_tac
  ON cus.customer(id) WHERE status = 'DANG_HOP_TAC';
