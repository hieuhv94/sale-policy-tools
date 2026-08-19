-- 0049 — Tìm kiếm và lọc PHÍA MÁY CHỦ cho danh mục và người dùng (N-05).
--
-- Ba màn hình — Sản phẩm, Chiết khấu, Người dùng — đang tải 200 dòng đầu rồi lọc
-- ngay trên trình duyệt. Muc 11.3 nói ngược lại: "ô tìm kiếm tìm trên TOÀN BỘ dữ
-- liệu, rồi mới cắt trang".
--
-- Vượt 200 dòng thì gõ tên một sản phẩm CÓ THẬT vẫn ra "không tìm thấy", và
-- không có gì báo cho người dùng biết họ chỉ đang tìm trong một phần. Đúng loại
-- hỏng mà muc 11.3 sinh ra để dẹp: danh sách bị cắt trong im lặng, và người dùng
-- luôn tin mình đang nhìn toàn bộ.
--
-- Chiết khấu KHÔNG có gì ở đây: khách hàng chốt màn hình đó bỏ hẳn ô tìm chữ,
-- thay bằng hai ô chọn nhóm sản phẩm và loại khách. Cả hai đều là cột sẵn có,
-- lọc bằng phép so bằng — không cần chuẩn hoá gì.

-- --------------------------------------------------------------------------
-- Bỏ dấu tiếng Việt, ở phía SQL
-- --------------------------------------------------------------------------
--
-- VÌ SAO KHÔNG DÙNG EXTENSION `unaccent`. Cùng lý do đã ghi ở
-- services/reporting/src/reports/normalize.ts, và lý do thứ hai mới là lý do
-- quyết định:
--
--   1. Bảng quy tắc mặc định của nó không phủ hết tiếng Việt.
--   2. Nó KHÔNG bỏ được dấu của chữ **đ**. "đ" không phải "d" cộng một dấu phụ —
--      nó là ký tự Unicode độc lập U+0111, `normalize(..., NFD)` không tách ra
--      được. Người gõ "Da Nang" sẽ không tìm ra "Đà Nẵng", và lỗi này IM LẶNG:
--      mọi chuỗi khác vẫn tìm được nên không ai nghi ngờ gì.
--
-- Nên thay `đ`/`Đ` bằng tay TRƯỚC, rồi mới phân rã NFD và xoá dải dấu phụ.
--
-- `U&'[\0300-\036F]'` là dải dấu phụ tổ hợp — huyền, sắc, hỏi, ngã, nặng, mũ,
-- móc, trăng. Viết bằng escape Unicode chứ KHÔNG dán ký tự thật vào file: dấu
-- phụ tổ hợp không có hình riêng, dán vào đây thì chuỗi trông như hai dấu ngoặc
-- vuông rỗng và không ai sửa nổi.
--
-- Đặt ở `sys` chứ không nhân đôi sang `cat` và `idn`: phép chuẩn hoá này đã có
-- một bản sao ở TypeScript rồi (`norm()`), và bản sao thứ ba là bản sao chắc
-- chắn sẽ trôi. Có một ca kiểm thử so hai bên trên cùng một bộ chuỗi.
--
-- HAI BƯỚC CUỐI — gộp khoảng trắng và cắt lề — KHÔNG phải chuyện gọn gàng.
--
-- `norm()` bên TypeScript làm cả hai. Bản đầu của hàm này thì không, và ca kiểm
-- thử đối chiếu bắt được ngay. Hậu quả nếu lọt: một sản phẩm tên "Nutricare␣␣
-- Metabolic" (lỡ gõ hai dấu cách) lưu cột chuẩn hoá có hai dấu cách, còn người
-- dùng gõ một dấu cách thì mẫu tìm có một — KHÔNG KHỚP, và không gì báo lỗi.
-- Người dùng kết luận sản phẩm không tồn tại.
--
-- Thứ tự phải khớp từng bước với `norm()`: thay đ → phân rã NFD → xoá dấu phụ →
-- hạ chữ thường → gộp khoảng trắng → cắt lề.
CREATE OR REPLACE FUNCTION sys.khong_dau(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT btrim(
           regexp_replace(
             lower(
               regexp_replace(
                 normalize(replace(replace(t, 'đ', 'd'), 'Đ', 'd'), NFD),
                 U&'[\0300-\036F]', '', 'g')),
             '\s+', ' ', 'g'));
$$;

-- Cột sinh được tính bằng quyền của NGƯỜI GHI, nên hai role ghi vào hai bảng
-- dưới đây phải gọi được hàm. Thiếu grant thì mọi lệnh thêm sản phẩm đều hỏng.
--
-- GRANT USAGE ON SCHEMA đứng riêng và không được quên: migration 0014 tồn tại
-- chỉ vì 0013 cấp EXECUTE mà quên USAGE, và triệu chứng là "permission denied
-- for schema sys" ở một chỗ chẳng liên quan gì tới schema sys.
GRANT USAGE ON SCHEMA sys TO csbh_cat, csbh_idn;
GRANT EXECUTE ON FUNCTION sys.khong_dau(text) TO csbh_cat, csbh_idn;

-- --------------------------------------------------------------------------
-- Sản phẩm — tìm theo TÊN
-- --------------------------------------------------------------------------
--
-- Chỉ tên, không mã: khách hàng chốt như vậy ngày 19/08, và nhãn ô tìm nói đúng
-- điều đó ("Tìm theo tên sản phẩm") thay vì để người dùng đoán.
--
-- CỘT SINH chứ không index biểu thức. Index biểu thức thì câu lệnh phải nhắc lại
-- nguyên văn biểu thức ấy, và lệch một ký tự là Postgres bỏ index, quay về quét
-- toàn bảng — không báo lỗi, chỉ chậm dần. Repo đã dính đúng bẫy này một lần
-- (xem chú thích ở customers.service.ts). Cột sinh thì câu lệnh chỉ nhắc tên cột.
--
-- LƯU Ý CHO LẦN SAU: sửa `sys.khong_dau` KHÔNG tự tính lại các giá trị đã lưu
-- trong cột sinh. Đổi hàm là phải kèm một migration bỏ rồi dựng lại cột.
--
-- DROP rồi ADD, không phải `ADD COLUMN IF NOT EXISTS` đơn thuần: cột sinh đã lưu
-- KHÔNG tự tính lại khi hàm đổi, nên nếu một lượt chạy trước đã dựng cột bằng
-- một phiên bản hàm cũ thì giá trị cũ nằm lại vĩnh viễn. Dựng lại là cách duy
-- nhất bảo đảm nội dung cột luôn khớp hàm hiện hành.
ALTER TABLE cat.product DROP COLUMN IF EXISTS name_norm;
ALTER TABLE cat.product
  ADD COLUMN name_norm text
  GENERATED ALWAYS AS (sys.khong_dau(name)) STORED;

-- GIN trigram: index này phục vụ `LIKE '%...%'` — khớp CHUỖI CON, không phải chỉ
-- khớp đầu chuỗi. B-tree không làm được điều đó, mà "có chứa" mới là cách người
-- dùng gõ: nhớ "gold" chứ không nhớ "Nutricare Gold 900g".
CREATE INDEX IF NOT EXISTS ix_product_name_norm
  ON cat.product USING gin (name_norm gin_trgm_ops);

-- Ô chọn NHÓM SẢN PHẨM đi kèm ô tìm không cần index mới: `ix_product_group`
-- (`0005`) đã phủ đúng cột đó.

-- --------------------------------------------------------------------------
-- Người dùng — tìm theo HỌ TÊN
-- --------------------------------------------------------------------------
--
-- Màn hình Người dùng trước nay KHÔNG CÓ ô tìm nào — nó tải 200 dòng rồi phân
-- trang tại chỗ. Nên đây vừa là vá nợ vừa là thêm chức năng.
--
-- Chỉ họ tên, không tên tài khoản và không email: khách hàng chốt như vậy. Người
-- quản trị đi tìm "chị Hạnh kế toán", không đi tìm "kt01".
ALTER TABLE idn.app_user DROP COLUMN IF EXISTS full_name_norm;
ALTER TABLE idn.app_user
  ADD COLUMN full_name_norm text
  GENERATED ALWAYS AS (sys.khong_dau(full_name)) STORED;

CREATE INDEX IF NOT EXISTS ix_app_user_full_name_norm
  ON idn.app_user USING gin (full_name_norm gin_trgm_ops);

-- --------------------------------------------------------------------------
-- Chiết khấu — hai ô chọn, không ô chữ
-- --------------------------------------------------------------------------
--
-- KHÔNG có gì phải thêm. Lọc theo `product_group_id` và `customer_type` là phép
-- so bằng trên hai cột sẵn có, và `ix_rule_match` đã dựng đúng trên CẶP ấy —
-- nó vốn có ba cột ở `0005`, cột `channel_code` rụng đi cùng chiều kênh bán ở
-- `0026`. Thêm một index nữa là trả phí ghi cho một thứ đã có.
--
-- Lưu ý cho người viết test ở đây: `uq_rule_pham_vi` là UNIQUE với
-- `NULLS NOT DISTINCT`, nên mỗi ngày hiệu lực chỉ tồn tại được ĐÚNG MỘT quy
-- định "mọi nhóm · mọi loại".
--
-- Ghi ra đây thay vì im lặng: người đọc migration này sẽ đi tìm phần Chiết khấu
-- và cần biết là không thiếu, chứ không phải bị quên.
