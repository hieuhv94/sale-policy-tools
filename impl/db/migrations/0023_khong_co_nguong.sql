-- =============================================================================
-- 0023_khong_co_nguong — sản phẩm không có ngưỡng nào vẫn đưa vào hồ sơ được.
--
-- Trước 0023, tra ngưỡng mà không có cả quy định lẫn mặc định của sản phẩm thì
-- máy chủ ném `THRESHOLD_NOT_CONFIGURED`, tức là CHẶN LUÔN việc thêm dòng.
--
-- Cái chặn ấy sai về nghiệp vụ. Ngưỡng chỉ để CẢNH BÁO — vượt ngưỡng còn không
-- chặn gửi duyệt (muc 6.3). Không có ngưỡng thì chỉ có nghĩa là không đối chiếu
-- được, chứ hồ sơ vẫn đủ mọi con số của nó: giá bán Công ty, giá bán buôn, các
-- khoản chi phí, giá thu về, tỷ lệ chiết khấu.
--
-- Nó còn đẩy người lập vào ngõ cụt: TDV không có quyền khai quy định chiết khấu
-- lẫn ngưỡng mặc định của sản phẩm, nên việc duy nhất họ làm được là dừng lại
-- chờ Quản trị.
--
-- Nguồn ngưỡng giờ có BA giá trị. `threshold_snap` để NULL khi `KHONG_CO`; cột
-- sinh `over_threshold` đã tính sẵn `threshold_snap IS NOT NULL` từ 0001 nên
-- dòng không ngưỡng không bao giờ bị đánh dấu vượt ngưỡng.
--
-- Vì sao 'KHONG_CO' chứ không để `threshold_source` NULL: NULL đã có nghĩa sẵn
-- là "dòng lập trước 0022, không rõ nguồn". Gộp hai thứ đó lại thì không phân
-- biệt được "đã tra và biết chắc là không có" với "chưa từng tra".
-- =============================================================================

ALTER TABLE pol.policy_line
  DROP CONSTRAINT IF EXISTS nguon_nguong_hop_le;

ALTER TABLE pol.policy_line
  ADD CONSTRAINT nguon_nguong_hop_le CHECK (
    (threshold_source = 'RULE'            AND rule_id_snap IS NOT NULL) OR
    (threshold_source = 'PRODUCT_DEFAULT' AND rule_id_snap IS NULL)     OR
    (threshold_source = 'KHONG_CO'        AND rule_id_snap IS NULL)     OR
    (threshold_source IS NULL             AND rule_id_snap IS NULL)
  );

COMMENT ON COLUMN pol.policy_line.threshold_source IS
  'RULE | PRODUCT_DEFAULT | KHONG_CO. NULL là dòng lập trước 0022, không rõ nguồn (0023).';
COMMENT ON COLUMN pol.policy_line.threshold_snap IS
  'Ngưỡng đã chụp lúc lập. NULL khi threshold_source = KHONG_CO (0023).';
