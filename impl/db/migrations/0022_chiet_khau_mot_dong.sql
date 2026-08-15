-- =============================================================================
-- 0022_chiet_khau_mot_dong — bịt tầng phân xử cuối của `RulesService.resolve`,
-- và ghi lại DÒNG NÀO đã thắng vào từng dòng hồ sơ.
--
-- Nền: nhiều quy định cùng khớp một sản phẩm là chuyện BÌNH THƯỜNG, không phải
-- lỗi cấu hình — dòng chung cho cả nhóm và dòng riêng cho một kênh đều đúng.
-- `resolve` xử bằng ba tầng: `specificity DESC, effective_from DESC, id`.
--
--   * Tầng 1 (`specificity`) không bao giờ hoà giữa hai phạm vi KHÁC nhau: ba
--     trọng số 4/2/1 là nhị phân nên tám tổ hợp cho tám con số phân biệt.
--   * Suy ra, hoà điểm ⇒ hai dòng khai CÙNG một bộ chiều; mà cả hai cùng khớp
--     một truy vấn ⇒ ba giá trị phạm vi giống hệt nhau. Tức là TRÙNG PHẠM VI.
--   * Tầng 2 (`effective_from DESC`) là cơ chế đổi ngưỡng duy nhất còn lại sau
--     0020: khai một dòng mới cùng phạm vi, ngày muộn hơn, dòng cũ tự bị che.
--   * Tầng 3 (`id`) chỉ chạm tới khi trùng phạm vi VÀ trùng ngày hiệu lực. Tất
--     định thì có tất định — gọi lại bao nhiêu lần cũng ra một dòng — nhưng
--     `gen_random_uuid()` không mang ý nghĩa nghiệp vụ nào. Người khai hai dòng
--     15% và 20% không có cách nào biết trước dòng nào ăn, và màn hình danh sách
--     bày cả hai cạnh nhau mà không nói dòng nào đang có hiệu lực.
--
-- Bịt ở chỗ ĐÚNG: không phải sửa `ORDER BY`, mà là không cho tồn tại hai dòng
-- trùng phạm vi ngay từ đầu. Sau chỉ mục dưới đây, tầng 3 không còn với tới
-- được; giữ `ORDER BY … id` trong truy vấn chỉ còn là lưới an toàn phòng khi
-- chỉ mục bị gỡ, chứ không phải một luật nghiệp vụ.
--
-- NULLS NOT DISTINCT là mấu chốt. Mặc định Postgres coi mỗi NULL là một giá trị
-- riêng, nên hai dòng "áp dụng cho mọi nhóm, mọi loại KH, mọi kênh" cùng ngày
-- vẫn lọt qua chỉ mục duy nhất thường — mà đó chính là cặp dễ khai trùng nhất.
-- Cần Postgres 15 trở lên; hệ thống chạy 16 (`deploy/compose.yml`).
-- =============================================================================

-- --- Dọn dữ liệu trùng có sẵn trước khi dựng chỉ mục -------------------------
--
-- GIỮ LẠI ĐÚNG DÒNG ĐANG CÓ HIỆU LỰC. `resolve` sắp `… , id` tăng dần rồi lấy
-- một, nên dòng thắng là dòng `id` NHỎ NHẤT trong nhóm trùng. Xoá các dòng còn
-- lại không đổi kết quả tra cứu của bất kỳ hồ sơ nào: chúng bị che từ lúc được
-- khai và chưa từng được chọn. Hồ sơ đã lập cũng không tính lại — mỗi dòng giữ
-- `threshold_snap` của riêng nó.
DO $$
DECLARE da_xoa int;
BEGIN
  WITH xep AS (
    SELECT id, row_number() OVER (
             PARTITION BY product_group_id, customer_type, channel_code, effective_from
             ORDER BY id
           ) AS hang
      FROM cat.discount_rule
  )
  DELETE FROM cat.discount_rule r USING xep
   WHERE r.id = xep.id AND xep.hang > 1;
  GET DIAGNOSTICS da_xoa = ROW_COUNT;
  IF da_xoa > 0 THEN
    RAISE NOTICE '0022: xoá % quy định chiết khấu trùng phạm vi (giữ dòng đang có hiệu lực)', da_xoa;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_pham_vi
  ON cat.discount_rule (product_group_id, customer_type, channel_code, effective_from)
  NULLS NOT DISTINCT;

COMMENT ON INDEX cat.uq_rule_pham_vi IS
  'Một phạm vi × một ngày hiệu lực = tối đa một quy định. Bịt tầng phân xử theo id (0022).';

-- --- Lưu vết: dòng hồ sơ nhớ nó lấy ngưỡng từ đâu ----------------------------
--
-- Trước 0022, `policy_line` chỉ giữ con số `threshold_snap`. Sáu tháng sau, câu
-- "vì sao hồ sơ này ngưỡng 15% mà hồ sơ kia 20%" chỉ trả lời được bằng cách dựng
-- lại bảng quy định tại thời điểm đó từ nhật ký kiểm toán.
--
-- KHÔNG khoá ngoại sang `cat.discount_rule`. Hai lý do, mỗi lý do đủ để một mình
-- quyết định: (1) `policy` không đọc được schema `cat` (AD-02), khoá ngoại chéo
-- schema là lỗ hổng đúng cái ranh giới ấy; (2) đây là ẢNH CHỤP — quy định bị xoá
-- thì dòng hồ sơ vẫn phải nhớ nó đã dùng dòng nào, mà khoá ngoại thì hoặc chặn
-- xoá hoặc xoá luôn dấu vết. Cả hai đều sai với nghĩa của một ảnh chụp.
--
-- NULL = dòng lập TRƯỚC 0022, không rõ nguồn. Không đoán bừa thành
-- 'PRODUCT_DEFAULT': giao diện tô vàng theo cột này, và tô vàng hàng loạt dòng
-- cũ chỉ vì thiếu dữ liệu là báo động giả.
ALTER TABLE pol.policy_line
  ADD COLUMN IF NOT EXISTS rule_id_snap     uuid,
  ADD COLUMN IF NOT EXISTS threshold_source text;

ALTER TABLE pol.policy_line
  DROP CONSTRAINT IF EXISTS nguon_nguong_hop_le;
ALTER TABLE pol.policy_line
  ADD CONSTRAINT nguon_nguong_hop_le CHECK (
    (threshold_source = 'RULE'            AND rule_id_snap IS NOT NULL) OR
    (threshold_source = 'PRODUCT_DEFAULT' AND rule_id_snap IS NULL)     OR
    (threshold_source IS NULL             AND rule_id_snap IS NULL)
  );

COMMENT ON COLUMN pol.policy_line.rule_id_snap IS
  'Quy định chiết khấu đã cho ra threshold_snap. NULL khi rơi về mặc định sản phẩm (0022).';
COMMENT ON COLUMN pol.policy_line.threshold_source IS
  'RULE | PRODUCT_DEFAULT. NULL là dòng lập trước 0022, không rõ nguồn (0022).';
