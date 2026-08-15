-- =============================================================================
-- 0021_cpbh_so_luong_tu_do — CPBH không còn cố định bốn khoản.
--
-- Bản gốc khoá cứng bốn cột `cpbh1..cpbh4`. Thực tế mỗi sản phẩm có số khoản chi
-- phí bán hàng khác nhau, và bắt điền đủ bốn ô là bắt gõ số 0 vào những ô không
-- có nghĩa gì — rồi bản in A4 vẫn hiện bốn cột, ba trong đó toàn số 0.
--
-- MẢNG chứ không bảng con. Cân nhắc cả hai:
--
--   * Bảng con `policy_line_cost(line_id, thu_tu, so_tien)` đúng "chuẩn" hơn,
--     nhưng mỗi lần đọc một hồ sơ là thêm một phép nối, và mỗi lần sửa một dòng
--     là xoá-rồi-chèn cả nhóm. Đổi lại được gì? Không gì cả: các khoản CPBH
--     KHÔNG có thuộc tính riêng — không tên, không loại, không ghi chú. Chúng
--     chỉ là một dãy số có thứ tự.
--   * Mảng giữ được đúng ngữ nghĩa đó, đọc một lần cùng dòng, và thứ tự là thứ
--     tự người dùng nhập.
--
-- Cột tự tính `cpbh_total` và `net_price` PHẢI dựng lại: chúng đang sinh từ bốn
-- cột sắp biến mất. Tổng của một mảng cần một hàm, và hàm ấy phải `IMMUTABLE`
-- thì cột sinh mới nhận.
--
-- Nạp lại dữ liệu cũ giữ ĐỦ BỐN phần tử, kể cả số 0. Không cắt bớt đuôi: số 0 mà
-- người dùng đã nhập là một con số họ đã nhập, còn cắt đi là tự ý sửa lại hồ sơ
-- đã lập của người khác.
-- =============================================================================

-- Tổng một mảng CPBH. `coalesce` hai lớp: mảng NULL và mảng rỗng đều cho 0, chứ
-- không cho NULL — `net_price` mà NULL thì mọi phép so sánh sau đó im lặng sai.
CREATE OR REPLACE FUNCTION pol.tong_cpbh(v bigint[]) RETURNS bigint
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT coalesce((SELECT sum(x) FROM unnest(v) AS x), 0)::bigint $$;

-- Có phần tử âm nào không. Viết thành hàm vì CHECK không nhận truy vấn con.
CREATE OR REPLACE FUNCTION pol.cpbh_co_so_am(v bigint[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT EXISTS (SELECT 1 FROM unnest(v) AS x WHERE x < 0) $$;

ALTER TABLE pol.policy_line
  ADD COLUMN IF NOT EXISTS cpbh bigint[] NOT NULL DEFAULT '{}';

-- Nạp lại từ bốn cột cũ, chỉ cho những dòng chưa nạp.
UPDATE pol.policy_line
   SET cpbh = ARRAY[cpbh1, cpbh2, cpbh3, cpbh4]
 WHERE cardinality(cpbh) = 0;

-- Thứ tự BẮT BUỘC: bỏ hai cột sinh trước, vì chúng phụ thuộc cpbh1..4.
ALTER TABLE pol.policy_line DROP COLUMN IF EXISTS cpbh_total;
ALTER TABLE pol.policy_line DROP COLUMN IF EXISTS net_price;

ALTER TABLE pol.policy_line
  DROP COLUMN IF EXISTS cpbh1,
  DROP COLUMN IF EXISTS cpbh2,
  DROP COLUMN IF EXISTS cpbh3,
  DROP COLUMN IF EXISTS cpbh4;

ALTER TABLE pol.policy_line
  ADD COLUMN cpbh_total bigint GENERATED ALWAYS AS (pol.tong_cpbh(cpbh)) STORED,
  ADD COLUMN net_price  bigint GENERATED ALWAYS AS
    (wholesale_price - pol.tong_cpbh(cpbh)) STORED;

ALTER TABLE pol.policy_line
  ADD CONSTRAINT cpbh_khong_am CHECK (NOT pol.cpbh_co_so_am(cpbh));

COMMENT ON COLUMN pol.policy_line.cpbh IS
  'Các khoản chi phí bán hàng, theo thứ tự người dùng nhập. Số lượng tuỳ dòng (0021).';
