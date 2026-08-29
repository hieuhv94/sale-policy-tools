-- `0154` — MỘT KHÁCH HÀNG CÓ NHIỀU ĐỊA CHỈ.
--
-- Khách hàng chốt 29/08. Đi CÙNG lượt cấm trùng mã số thuế (`0155`), và thứ tự
-- giữa hai việc là bắt buộc — lý do nằm ngay ở đây.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO HAI VIỆC ẤY LÀ MỘT VIỆC
-- ---------------------------------------------------------------------------
--
-- `0006` cho phép trùng mã số thuế CÓ CHỦ Ý, và chú thích của nó nêu đúng một
-- lý do: *"một chủ hộ mở nhiều điểm bán là chuyện có thật, chặn cứng là chặn
-- nhầm nghiệp vụ"* (CUST-05).
--
-- Nghĩa là tới hôm nay, *"nhiều điểm bán"* được làm bằng cách dựng NHIỀU KHÁCH
-- HÀNG cùng mã số thuế, mỗi bản một địa chỉ. Bảng này lấy đi nhu cầu ấy: một
-- khách, nhiều địa chỉ. Chỉ sau khi có nó thì cấm trùng mã số thuế mới là siết
-- một đường thừa — làm ngược lại là bịt đường đi mà chưa mở đường thay thế.
--
-- ---------------------------------------------------------------------------
-- HAI CỘT CŨ Ở LẠI, VÀ CHÚNG THÀNH CỘT DẪN XUẤT
-- ---------------------------------------------------------------------------
--
-- `registered_address` và `delivery_address` KHÔNG bị gỡ. Từ lượt này chúng là
-- **bản gộp do trigger dựng lại** từ `cus.customer_address`, các địa chỉ ngăn
-- bằng ký tự xuống dòng — không ai được ghi thẳng vào chúng nữa.
--
-- Nghe như vá cái bóng, nhưng ba lý do đều cụ thể:
--
--   1. `ix_customer_search` là chỉ mục GIN trigram trên BIỂU THỨC
--      `(name || ' ' || registered_address || ' ' || coalesce(id_number,''))`.
--      Chỉ mục biểu thức không tham chiếu được sang bảng khác. Bỏ cột là mất
--      chỉ mục tìm kiếm, và câu truy vấn có chú thích cảnh báo sẵn rằng *"lệch
--      một ký tự là Postgres quay về quét toàn bảng"*.
--
--   2. `internal.controller` bên `customer` liệt kê TỪNG CỘT trong `SELECT`, và
--      `policy` với `document` đều đọc qua đó — đúng bẫy `0128` đã ghi. Giữ tên
--      cột nghĩa là ba service ấy không sửa một dòng nào.
--
--   3. Tầng văn bản ĐÃ dựng sẵn cho việc này: `setParagraphText` trong
--      `docx.ts` đổi `\n` thành `<w:br/>`, và chú thích của nó viết đúng chữ
--      *"địa chỉ nhiều dòng dính thành một hàng dài"*. Chuỗi gộp đi thẳng ra
--      giấy thành nhiều dòng mà không ai phải sửa gì.
--
-- Đây là đúng khuôn `0138` đã dùng cho công nợ: **`customer` dựng sẵn CÂU CHỮ**
-- và trả qua trường cũ, nên các service sau chỉ thấy một chuỗi.
--
-- CÁI GIÁ, ghi ra để không ai phải đoán: tên cột không nói lên rằng nó là dẫn
-- xuất. `COMMENT ON COLUMN` bên dưới nói, và có một ca kiểm quét mã nguồn đòi
-- không đường ghi nào ngoài trigger chạm vào hai cột ấy.

-- --- 1. Bảng địa chỉ ---------------------------------------------------------
--
-- HAI LOẠI trong MỘT bảng, phân biệt bằng `kind`, chứ không hai bảng. Chúng có
-- cùng hình dạng và cùng vòng đời; tách đôi là chép cùng một trigger hai lần.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'address_kind' AND n.nspname = 'cus') THEN
    CREATE TYPE cus.address_kind AS ENUM ('DANG_KY', 'NHAN_HANG');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cus.customer_address (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES cus.customer(id) ON DELETE CASCADE,
  kind        cus.address_kind NOT NULL,

  /*
   * `500` khớp đúng `str(1, 500)` mà controller đang kiểm, để một chuỗi đi qua
   * được tầng ứng dụng thì cũng đi qua được tầng này.
   *
   * CẤM KÝ TỰ XUỐNG DÒNG, và đây là ràng buộc quan trọng nhất của cả bảng.
   *
   * Hai cột gộp nối các địa chỉ bằng `\n`. Nếu một địa chỉ được phép chứa `\n`
   * thì phép nối ấy KHÔNG TÁCH NGƯỢC RA ĐƯỢC — hai địa chỉ thành ba, im lặng,
   * và chỉ lộ ra trên tờ giấy đã in. Cấm ở đây thì cột gộp là một phép mã hoá
   * không mất mát, nên tầng đọc chỉ cần `split('\n')` là ra đúng mảng gốc: không
   * truy vấn thêm, không N+1 ở màn hình danh sách.
   */
  address     text NOT NULL
              CONSTRAINT dia_chi_mot_dong
              CHECK (btrim(address) <> '' AND length(address) <= 500
                     AND address !~ E'[\\n\\r]'),

  -- THỨ TỰ NGƯỜI DÙNG SẮP, không phải thứ tự chèn. Nó quyết định địa chỉ nào in
  -- ở dòng đầu trên tờ hợp đồng, nên nó là dữ liệu nghiệp vụ chứ không phải
  -- chuyện trình bày. `created_at` không thay được: nhiều dòng chèn trong cùng
  -- một transaction mang y hệt một `now()`.
  stt         int NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_customer_address_stt UNIQUE (customer_id, kind, stt)
);

CREATE INDEX IF NOT EXISTS ix_customer_address_cus
  ON cus.customer_address (customer_id, kind, stt);

COMMENT ON TABLE cus.customer_address IS
  'Địa chỉ của khách hàng, nhiều dòng mỗi loại (0154). Nguồn sự thật; hai cột '
  'registered_address/delivery_address bên cus.customer là bản gộp dẫn xuất.';

-- --- 2. Chuyển dữ liệu đang có ----------------------------------------------
--
-- Mỗi khách hàng hiện có đúng một địa chỉ đăng ký (cột NOT NULL) và tối đa một
-- nơi nhận hàng. Chuyển thẳng, `stt = 1`.
--
-- `delivery_address` rỗng hoặc NULL thì KHÔNG dựng dòng nào: `0006` khai
-- *"để trống nghĩa là trùng địa chỉ đăng ký"*, và dựng một dòng rỗng ở đây là
-- biến một quy ước thành một bản ghi sai.
-- `regexp_replace` gộp mọi khoảng trắng — kể cả xuống dòng — thành một dấu cách:
-- ràng buộc `dia_chi_mot_dong` cấm `\n`, và một địa chỉ cũ có gõ xuống dòng thì
-- lượt nâng cấp phải đi qua được chứ không được dừng lại vì một ký tự trình bày.
INSERT INTO cus.customer_address (customer_id, kind, address, stt)
SELECT id, 'DANG_KY', btrim(regexp_replace(registered_address, '\s+', ' ', 'g')), 1
  FROM cus.customer
 WHERE btrim(registered_address) <> ''
   AND NOT EXISTS (SELECT 1 FROM cus.customer_address a
                    WHERE a.customer_id = cus.customer.id AND a.kind = 'DANG_KY');

INSERT INTO cus.customer_address (customer_id, kind, address, stt)
SELECT id, 'NHAN_HANG', btrim(regexp_replace(delivery_address, '\s+', ' ', 'g')), 1
  FROM cus.customer
 WHERE delivery_address IS NOT NULL
   AND btrim(delivery_address) <> ''
   AND NOT EXISTS (SELECT 1 FROM cus.customer_address a
                    WHERE a.customer_id = cus.customer.id AND a.kind = 'NHAN_HANG');

-- --- 3. Trigger dựng lại hai cột gộp ----------------------------------------
--
-- Chạy trên MỌI lượt ghi của bảng địa chỉ, và tính lại CẢ HAI cột cho khách
-- hàng liên quan. Tính lại cả hai chứ không chỉ cột của `kind` vừa đổi: rẻ như
-- nhau (một lượt quét chỉ mục theo `customer_id`), và một hàm chỉ có một nhánh
-- thì không có nhánh nào sai được.
--
-- `NULL` chứ không phải chuỗi rỗng cho `delivery_address`: cột ấy vẫn mang đúng
-- nghĩa cũ — *"để trống nghĩa là trùng địa chỉ đăng ký"* — và một chuỗi rỗng đọc
-- ra khác hẳn NULL ở mọi chỗ dùng `coalesce`.
CREATE OR REPLACE FUNCTION cus.gop_dia_chi() RETURNS trigger AS $$
DECLARE kh uuid;
BEGIN
  kh := coalesce(NEW.customer_id, OLD.customer_id);

  UPDATE cus.customer c
     SET registered_address = coalesce(
           (SELECT string_agg(a.address, E'\n' ORDER BY a.stt, a.created_at, a.id)
              FROM cus.customer_address a
             WHERE a.customer_id = kh AND a.kind = 'DANG_KY'), ''),
         delivery_address =
           (SELECT string_agg(a.address, E'\n' ORDER BY a.stt, a.created_at, a.id)
              FROM cus.customer_address a
             WHERE a.customer_id = kh AND a.kind = 'NHAN_HANG')
   WHERE c.id = kh;

  RETURN NULL;  -- AFTER trigger: giá trị trả về bị bỏ qua.
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_gop_dia_chi ON cus.customer_address;
CREATE TRIGGER tr_gop_dia_chi
  AFTER INSERT OR UPDATE OR DELETE ON cus.customer_address
  FOR EACH ROW EXECUTE FUNCTION cus.gop_dia_chi();

-- MẶC ĐỊNH `''` cho cột dẫn xuất.
--
-- Lượt lập khách hàng ghi dòng `cus.customer` TRƯỚC rồi mới ghi các địa chỉ —
-- phải thế, vì địa chỉ mang khoá ngoại trỏ về khách. Giữa hai câu lệnh ấy cột
-- này chưa có giá trị, mà nó là `NOT NULL` từ `0006` và không có mặc định nào.
-- Không đặt mặc định thì mọi lượt lập khách hàng đều hỏng ngay ở câu đầu.
--
-- Cả hai câu nằm trong CÙNG transaction, nên không lượt đọc nào thấy chuỗi rỗng.
ALTER TABLE cus.customer ALTER COLUMN registered_address SET DEFAULT '';

COMMENT ON COLUMN cus.customer.registered_address IS
  'DẪN XUẤT (0154): bản gộp mọi địa chỉ DANG_KY, ngăn bằng \n, do trigger '
  'tr_gop_dia_chi dựng. KHÔNG ghi thẳng — nguồn là cus.customer_address.';
COMMENT ON COLUMN cus.customer.delivery_address IS
  'DẪN XUẤT (0154): bản gộp mọi địa chỉ NHAN_HANG, ngăn bằng \n. NULL = không '
  'khai nơi nhận riêng, tức trùng địa chỉ đăng ký. KHÔNG ghi thẳng.';

-- --- 4. Dựng lại một lượt cho dữ liệu vừa chuyển ----------------------------
--
-- Bước 2 chèn dòng TRƯỚC khi trigger tồn tại, nên hai cột gộp chưa được tính
-- lại lần nào. Với dữ liệu chuyển sang thì giá trị cũ vốn đã đúng — mỗi khách
-- một địa chỉ — nhưng dựa vào điều đó là dựa vào một sự trùng hợp: chạy lại một
-- lượt để trạng thái sau migration là trạng thái trigger sẽ dựng ra.
UPDATE cus.customer c
   SET registered_address = coalesce(
         (SELECT string_agg(a.address, E'\n' ORDER BY a.stt, a.created_at, a.id)
            FROM cus.customer_address a
           WHERE a.customer_id = c.id AND a.kind = 'DANG_KY'), c.registered_address),
       delivery_address =
         (SELECT string_agg(a.address, E'\n' ORDER BY a.stt, a.created_at, a.id)
            FROM cus.customer_address a
           WHERE a.customer_id = c.id AND a.kind = 'NHAN_HANG');
