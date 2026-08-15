-- =============================================================================
-- 0024_ma_quy_dinh_do_nguoi_dung_dat — mã quy định chiết khấu do người dùng đặt.
--
-- `0023` đưa mã quy định ra tới giao diện: cột *Id* trên bảng quy định, cột
-- *QĐCK* trên bảng dòng sản phẩm, và ô tìm kiếm khớp mã. Lúc đó mã là
-- `gen_random_uuid()` — 36 ký tự không ai đọc được, không ai nhớ được, và không
-- ai nói qua điện thoại được. Một mã đi ra tới mặt người dùng thì phải do người
-- dùng đặt.
--
-- Cùng lối nghĩ với `cat.province` (CAT-16): "Khoá chính là MÃ, không phải id
-- sinh tự động". Ở đây còn mạnh hơn, vì mã này được CHÉP ra khỏi hệ thống — từ
-- bảng dòng sản phẩm sang ô tìm kiếm, và sang cả giấy tờ nếu ai đó in ra.
--
-- Nạp lại dữ liệu cũ: mã sinh từ tám ký tự đầu của uuid cũ. Xấu, nhưng KHÔNG
-- MẤT liên kết — hồ sơ đã lập vẫn trỏ đúng quy định của nó, và Quản trị đổi tên
-- được sau bằng cách xoá rồi khai lại.
--
-- `pol.policy_line.rule_id_snap` đổi tên thành `rule_code_snap` chứ không giữ
-- tên cũ: kiểu đã đổi từ uuid sang text, và một cột tên `..._id` chứa mã người
-- dùng gõ là cái bẫy cho người đọc mã sau này.
-- =============================================================================

-- --- Mã cho các quy định đang có ---------------------------------------------
ALTER TABLE cat.discount_rule ADD COLUMN IF NOT EXISTS code text;

UPDATE cat.discount_rule
   SET code = 'QDCK-' || upper(substr(replace(id::text, '-', ''), 1, 8))
 WHERE code IS NULL;

-- --- Ảnh chụp bên hồ sơ đi theo ----------------------------------------------
--
-- `coalesce` với nhánh dựng mã từ chính uuid cũ: quy định có thể ĐÃ BỊ XOÁ, mà
-- dòng hồ sơ thì vẫn phải nhớ nó đã dùng dòng nào. Bỏ nhánh ấy thì những dòng
-- đó nhận NULL và vi phạm `nguon_nguong_hop_le` ngay giữa migration.
ALTER TABLE pol.policy_line ADD COLUMN IF NOT EXISTS rule_code_snap text;

UPDATE pol.policy_line l
   SET rule_code_snap = coalesce(
         (SELECT r.code FROM cat.discount_rule r WHERE r.id = l.rule_id_snap),
         'QDCK-' || upper(substr(replace(l.rule_id_snap::text, '-', ''), 1, 8)))
 WHERE l.rule_id_snap IS NOT NULL AND l.rule_code_snap IS NULL;

ALTER TABLE pol.policy_line DROP CONSTRAINT IF EXISTS nguon_nguong_hop_le;
ALTER TABLE pol.policy_line DROP COLUMN IF EXISTS rule_id_snap;

ALTER TABLE pol.policy_line
  ADD CONSTRAINT nguon_nguong_hop_le CHECK (
    (threshold_source = 'RULE'            AND rule_code_snap IS NOT NULL) OR
    (threshold_source = 'PRODUCT_DEFAULT' AND rule_code_snap IS NULL)     OR
    (threshold_source = 'KHONG_CO'        AND rule_code_snap IS NULL)     OR
    (threshold_source IS NULL             AND rule_code_snap IS NULL)
  );

COMMENT ON COLUMN pol.policy_line.rule_code_snap IS
  'Mã quy định chiết khấu đã cho ra threshold_snap. NULL khi không quy định nào khớp (0024).';

-- --- `code` thành khoá chính --------------------------------------------------
--
-- Xoá cột `id` kéo theo cả khoá chính cũ, nên không cần DROP CONSTRAINT riêng.
ALTER TABLE cat.discount_rule ALTER COLUMN code SET NOT NULL;
ALTER TABLE cat.discount_rule DROP COLUMN IF EXISTS id;
ALTER TABLE cat.discount_rule ADD PRIMARY KEY (code);

-- Chuẩn hoá như mã vật tư (CAT-02): 'ck-01', 'CK-01 ' và 'CK-01' là MỘT mã.
-- Khoá chính thường đã chặn trùng y nguyên; chỉ mục này chặn nốt phần còn lại,
-- vì hai mã chỉ khác hoa thường là hai mã người dùng đọc ra giống hệt nhau.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_code_norm
  ON cat.discount_rule (upper(btrim(code)));

-- Mã rỗng hoặc toàn khoảng trắng lọt qua `NOT NULL`. Một dòng mã rỗng trong
-- bảng quy định là một dòng không tìm được và không chép được.
ALTER TABLE cat.discount_rule
  DROP CONSTRAINT IF EXISTS rule_code_khong_rong;
ALTER TABLE cat.discount_rule
  ADD CONSTRAINT rule_code_khong_rong CHECK (btrim(code) <> '');

COMMENT ON COLUMN cat.discount_rule.code IS
  'Mã do Quản trị đặt, khoá chính. Hiện ở cột Id và cột QĐCK của hồ sơ (0024).';
