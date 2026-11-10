-- `0280` — MỘT quy định chiết khấu áp cho NHIỀU loại khách hàng (khách hàng chốt 12/11/2026:
-- *"một quy định mang tập loại khách"*, hướng đổi mô hình chứ không tạo nhiều dòng).
--
-- Trước đây `customer_type smallint` chứa đúng MỘT số 1–3 hoặc NULL, nên "loại 1 và loại 3" không
-- có chỗ để viết. Giờ là `customer_types smallint[]`: NULL = MỌI loại, còn lại là tập con thật sự
-- của {1,2,3}. Một dòng, một mã quy định, một ngưỡng — đúng một tờ giấy khách hàng ký.
--
-- BA LUẬT, mỗi luật một ràng buộc:
--   1. Mảng chỉ chứa 1, 2, 3, không NULL, không rỗng, xếp tăng dần, không lặp.
--   2. **Cả ba loại KHÔNG được viết thành {1,2,3}** — đó chính là "mọi loại" (NULL). Hệ thống chỉ
--      có ba loại, nên hai cách viết là một câu; để cả hai tồn tại thì hai dòng cùng nói "mọi loại"
--      sẽ không còn trùng nhau trong mắt chỉ mục và điểm cụ thể (specificity) cho chúng hai bậc.
--   3. Hai quy định cùng nhóm, cùng ngày hiệu lực KHÔNG được giao nhau ở bất kỳ loại nào — vì khi
--      cùng khớp một khách hàng, hai dòng ấy cùng điểm cụ thể và không phân xử được. Đây chính là
--      `uq_rule_pham_vi` của `0026` ("hoà điểm ⇒ trùng phạm vi") nâng từ một số lên một tập.
--
-- LUẬT 3 viết bằng BỐN chỉ mục duy nhất từng phần, không bằng ràng buộc loại trừ (`EXCLUDE`): ràng
-- buộc loại trừ trên mảng đòi `intarray` + `btree_gist`, tức hai phần mở rộng phải có mặt ở mọi
-- máy chủ. Chỉ có ba loại khách (CHECK của `0005`), nên mỗi loại một chỉ mục: hai dòng cùng chứa
-- loại 3 trong cùng nhóm + ngày sẽ cùng vào chỉ mục `l3` và vỡ ở đó. Thêm loại thứ tư về sau là
-- thêm một chỉ mục — cùng lúc với CHECK ở trên, và có ca kiểm ghim con số ba.
--
-- Chạy lại được: mỗi bước kiểm sự có mặt trước khi đổi.

-- --- 1. Cột mới, chép dữ liệu cũ ------------------------------------------------------------
ALTER TABLE cat.discount_rule ADD COLUMN IF NOT EXISTS customer_types smallint[];

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'cat' AND table_name = 'discount_rule' AND column_name = 'customer_type') THEN
    UPDATE cat.discount_rule
       SET customer_types = CASE WHEN customer_type IS NULL THEN NULL ELSE ARRAY[customer_type] END;
  END IF;
END $$;

-- --- 2. Gỡ mọi thứ còn đọc cột cũ, rồi gỡ chính nó -------------------------------------------
DROP INDEX IF EXISTS cat.uq_rule_pham_vi;
DROP INDEX IF EXISTS cat.ix_rule_match;
-- `specificity` là cột SINH SẴN đọc `customer_type` nên phải bỏ nó trước (cùng lối `0026`).
ALTER TABLE cat.discount_rule DROP COLUMN IF EXISTS specificity;
ALTER TABLE cat.discount_rule DROP COLUMN IF EXISTS customer_type;

-- --- 3. Ràng buộc -----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE cat.discount_rule ADD CONSTRAINT rule_loai_khach_hop_le CHECK (
    customer_types IS NULL OR (
      cardinality(customer_types) BETWEEN 1 AND 2
      AND customer_types <@ ARRAY[1, 2, 3]::smallint[]
      AND array_position(customer_types, NULL) IS NULL
      -- Xếp tăng dần và không lặp: {1,1} và {1} là một tập, {3,1} và {1,3} cũng vậy, mà so sánh
      -- bằng `=` trên mảng thì khác nhau. (CHECK không cho truy vấn con, nên viết thẳng hai
      -- phần tử — mảng chỉ dài tối đa hai.)
      AND (cardinality(customer_types) = 1 OR customer_types[1] < customer_types[2])
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON CONSTRAINT rule_loai_khach_hop_le ON cat.discount_rule IS
  'NULL = mọi loại. Còn lại là 1 hoặc 2 loại trong {1,2,3}, xếp tăng dần. Đủ ba loại phải viết là NULL (0280).';

-- --- 4. Điểm cụ thể và chỉ mục -----------------------------------------------------------------
ALTER TABLE cat.discount_rule ADD COLUMN specificity int GENERATED ALWAYS AS (
  (CASE WHEN product_group_id IS NOT NULL THEN 2 ELSE 0 END) +
  (CASE WHEN customer_types   IS NOT NULL THEN 1 ELSE 0 END)
) STORED;

-- "Mọi loại": chỉ một dòng cho mỗi (nhóm, ngày) — như `uq_rule_pham_vi` cũ với customer_type NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_pham_vi_moi
  ON cat.discount_rule (product_group_id, effective_from) NULLS NOT DISTINCT
  WHERE customer_types IS NULL;
-- Mỗi loại khách một chỉ mục: hai dòng cùng chứa loại ấy, cùng nhóm, cùng ngày thì vỡ.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_pham_vi_l1
  ON cat.discount_rule (product_group_id, effective_from) NULLS NOT DISTINCT
  WHERE customer_types @> ARRAY[1]::smallint[];
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_pham_vi_l2
  ON cat.discount_rule (product_group_id, effective_from) NULLS NOT DISTINCT
  WHERE customer_types @> ARRAY[2]::smallint[];
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_pham_vi_l3
  ON cat.discount_rule (product_group_id, effective_from) NULLS NOT DISTINCT
  WHERE customer_types @> ARRAY[3]::smallint[];

CREATE INDEX IF NOT EXISTS ix_rule_match ON cat.discount_rule (product_group_id);

COMMENT ON COLUMN cat.discount_rule.customer_types IS
  'Tập loại khách hàng quy định này áp cho. NULL = mọi loại (0280, thay customer_type).';
COMMENT ON TABLE cat.discount_rule IS
  'Nguồn DUY NHẤT của ngưỡng chiết khấu, khớp theo nhóm sản phẩm × TẬP loại khách hàng (0026, 0280).';
