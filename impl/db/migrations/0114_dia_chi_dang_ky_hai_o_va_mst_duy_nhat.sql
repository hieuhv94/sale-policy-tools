-- `0175` — ĐỊA CHỈ ĐĂNG KÝ THÀNH HAI Ô, CHỈ MỘT; VÀ MÃ SỐ THUẾ DUY NHẤT.
--
-- Khách hàng chốt 05/09, hai câu trong cùng một lượt phản hồi:
--
--   *"Mục lập khách hàng bỏ phần Địa chỉ đăng ký đổi thành Tỉnh/Thành Phố (theo
--   đăng ký kinh doanh) và Số nhà, Phường xã (theo đăng ký kinh doanh), và thông
--   tin này là bắt buộc, chỉ có một"*
--
--   *"Không cho phép 2 khách hàng trùng mã số thuế […] và Mã số thuế là bắt buộc
--   phải có"*
--
-- ---------------------------------------------------------------------------
-- HAI CÂU ẤY LÀ MỘT VIỆC, VÀ `0154` ĐÃ VIẾT RA THỨ TỰ
-- ---------------------------------------------------------------------------
--
-- `0006` cho trùng mã số thuế CÓ CHỦ Ý, với đúng một lý do: *"một chủ hộ mở
-- nhiều điểm bán là chuyện có thật"*. `0154` lấy đi nhu cầu ấy bằng bảng
-- `cus.customer_address` — một khách, nhiều địa chỉ — và chú thích của nó nói
-- thẳng: **chỉ sau khi có nó thì cấm trùng mã số thuế mới là siết một đường
-- thừa**. Lượt này là vế thứ hai của câu ấy, đúng một chặng sau.
--
-- Nhưng nó siết thêm một nấc mà `0154` không lường: **địa chỉ ĐĂNG KÝ giờ chỉ
-- có MỘT**. Nhiều điểm bán vẫn làm được — bằng nhiều địa chỉ GIAO HÀNG, thứ vốn
-- đã là danh sách. Địa chỉ đăng ký thì theo giấy đăng ký kinh doanh, và một pháp
-- nhân chỉ có một tờ giấy ấy; đó cũng chính là thứ mã số thuế định danh, nên hai
-- câu của khách hàng khớp nhau ở đúng chỗ này.
--
-- ---------------------------------------------------------------------------
-- HAI CỘT MỚI, VÀ `registered_address` VẪN LÀ CỘT DẪN XUẤT
-- ---------------------------------------------------------------------------
--
-- Cả ba lý do của `0154` để giữ `registered_address` vẫn nguyên giá trị:
-- chỉ mục GIN trigram dựng trên BIỂU THỨC có cột ấy; `internal.controller` liệt
-- kê từng cột nên `policy` và `document` không phải sửa dòng nào; và tầng văn
-- bản in thẳng chuỗi ấy ra giấy.
--
-- Chỉ đổi NGUỒN của nó: từ `cus.customer_address` sang hai cột mới ngay trên
-- cùng dòng khách hàng. Trigger vì thế cũng đổi chỗ — xem phần 4.

-- --- 1. Hai cột mới ---------------------------------------------------------
--
-- `DEFAULT ''` chứ không `NOT NULL` không mặc định: dòng khách hàng cũ chưa có
-- giá trị nào, và `ALTER … SET NOT NULL` trên một bảng đang có dữ liệu thì phải
-- có mặc định để điền vào. Ràng buộc *"bắt buộc"* thật nằm ở tầng ứng dụng, chỗ
-- duy nhất trả được câu lỗi tiếng Việt nói rõ phải điền ô nào.
ALTER TABLE cus.customer
  ADD COLUMN IF NOT EXISTS province   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS street_ward text NOT NULL DEFAULT '';

COMMENT ON COLUMN cus.customer.province IS
  'Tỉnh/Thành phố theo đăng ký kinh doanh (0175). Nguồn của registered_address.';
COMMENT ON COLUMN cus.customer.street_ward IS
  'Số nhà, phường xã theo đăng ký kinh doanh (0175). Nguồn của registered_address.';

-- --- 2. Chuyển dữ liệu đang có ----------------------------------------------
--
-- Địa chỉ cũ là MỘT chuỗi tự do; tách nó ra hai ô là đoán. Phép đoán ở đây hẹp
-- và nói ra được: **nếu đoạn cuối (sau dấu phẩy cuối cùng) mở đầu bằng
-- "Thành phố", "Tỉnh" hay "TP"** thì đó là tỉnh/thành, phần còn lại là số nhà và
-- phường xã. Không khớp thì **cả chuỗi vào ô số nhà** và ô tỉnh/thành để trống.
--
-- Để trống chứ không đoán bừa: một ô trống thì người dùng thấy ngay lúc mở bản
-- ghi ra sửa, còn một tỉnh/thành đoán sai thì đi thẳng lên tờ CSBH mà không ai
-- biết. Khách hàng cũ chưa tách được sẽ phải điền lại ở lượt sửa tiếp theo —
-- biểu mẫu khai ô ấy là bắt buộc nên không ai lưu được mà bỏ trống.
--
-- Chỉ lấy địa chỉ DANG_KY có `stt` nhỏ nhất: từ lượt này chỉ còn một địa chỉ
-- đăng ký, và dòng đầu là dòng in ra giấy ở hàng đầu (`0154`).
WITH dc AS (
  SELECT DISTINCT ON (customer_id) customer_id, address
    FROM cus.customer_address
   WHERE kind = 'DANG_KY'
   ORDER BY customer_id, stt, created_at, id
)
UPDATE cus.customer c
   SET province = CASE
         WHEN btrim(split_part(dc.address, ',', array_length(string_to_array(dc.address, ','), 1)))
              ~* '^(Thành phố|Tỉnh|TP\.?|T\.P)\M'
         THEN btrim(split_part(dc.address, ',', array_length(string_to_array(dc.address, ','), 1)))
         ELSE ''
       END,
       street_ward = CASE
         WHEN btrim(split_part(dc.address, ',', array_length(string_to_array(dc.address, ','), 1)))
              ~* '^(Thành phố|Tỉnh|TP\.?|T\.P)\M'
         THEN btrim(regexp_replace(dc.address, ',[^,]*$', ''))
         ELSE btrim(dc.address)
       END
  FROM dc
 WHERE dc.customer_id = c.id
   AND c.street_ward = '';

-- Khách hàng KHÔNG có dòng nào trong bảng địa chỉ (dữ liệu rất cũ, hoặc dòng bị
-- xoá tay): rơi về chính cột gộp. Không có nhánh này thì họ mất địa chỉ hẳn.
UPDATE cus.customer
   SET street_ward = btrim(regexp_replace(split_part(registered_address, E'\n', 1), '\s+', ' ', 'g'))
 WHERE street_ward = '' AND btrim(registered_address) <> '';

-- --- 3. Bảng địa chỉ chỉ còn NƠI NHẬN HÀNG ----------------------------------
--
-- Xoá dòng `DANG_KY` sau khi đã chuyển sang hai cột mới, rồi CẤM chúng quay lại.
--
-- Giữ giá trị `DANG_KY` trong enum `cus.address_kind`: bỏ một giá trị enum là
-- dựng lại cả kiểu cùng mọi cột dùng nó (`0048` đã trả giá ấy), và ở đây không
-- đổi lấy được gì — ràng buộc CHECK nói cùng một điều, ngay tại chỗ đọc được.
DELETE FROM cus.customer_address WHERE kind = 'DANG_KY';

ALTER TABLE cus.customer_address
  DROP CONSTRAINT IF EXISTS chi_noi_nhan_hang;
ALTER TABLE cus.customer_address
  ADD CONSTRAINT chi_noi_nhan_hang CHECK (kind = 'NHAN_HANG');

COMMENT ON TABLE cus.customer_address IS
  'Địa chỉ NHẬN HÀNG của khách hàng, nhiều dòng (0154, thu hẹp 0175). Địa chỉ '
  'ĐĂNG KÝ đã rời sang cus.customer.province/street_ward — chỉ có một.';

-- --- 4. Hai trigger đổi việc ------------------------------------------------
--
-- `tr_gop_dia_chi` thôi đụng tới `registered_address`: nguồn của cột ấy giờ nằm
-- trên chính dòng khách hàng. Để nguyên thì mỗi lượt sửa địa chỉ giao hàng lại
-- ghi đè `registered_address` bằng chuỗi rỗng — bảng địa chỉ không còn dòng
-- `DANG_KY` nào để mà gộp.
CREATE OR REPLACE FUNCTION cus.gop_dia_chi() RETURNS trigger AS $$
DECLARE kh uuid;
BEGIN
  kh := coalesce(NEW.customer_id, OLD.customer_id);
  UPDATE cus.customer c
     SET delivery_address =
           (SELECT string_agg(a.address, E'\n' ORDER BY a.stt, a.created_at, a.id)
              FROM cus.customer_address a
             WHERE a.customer_id = kh AND a.kind = 'NHAN_HANG')
   WHERE c.id = kh;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

-- Trigger MỚI, trên chính `cus.customer`: dựng `registered_address` từ hai ô.
--
-- `BEFORE` chứ không `AFTER`: nó sửa chính dòng đang ghi, nên gán vào `NEW` là
-- xong — một `AFTER` sẽ phải `UPDATE` lại bảng và tự kích hoạt chính mình.
--
-- Ngăn bằng `', '` — MỘT dòng, vì đây là một địa chỉ chứ không phải một danh
-- sách. Cột gộp của địa chỉ giao hàng vẫn ngăn bằng `\n` như cũ.
CREATE OR REPLACE FUNCTION cus.dung_dia_chi_dang_ky() RETURNS trigger AS $$
BEGIN
  NEW.registered_address :=
    btrim(concat_ws(', ', nullif(btrim(NEW.street_ward), ''), nullif(btrim(NEW.province), '')));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_dung_dia_chi_dang_ky ON cus.customer;
CREATE TRIGGER tr_dung_dia_chi_dang_ky
  BEFORE INSERT OR UPDATE OF province, street_ward ON cus.customer
  FOR EACH ROW EXECUTE FUNCTION cus.dung_dia_chi_dang_ky();

COMMENT ON COLUMN cus.customer.registered_address IS
  'DẪN XUẤT (0154, đổi nguồn ở 0175): street_ward || '', '' || province, do '
  'trigger tr_dung_dia_chi_dang_ky dựng. KHÔNG ghi thẳng.';

-- Dựng lại một lượt cho dữ liệu vừa chuyển: bước 2 ghi hai cột mới bằng `UPDATE`
-- chạy TRƯỚC khi trigger tồn tại, nên `registered_address` còn mang giá trị gộp
-- cũ. Với phần lớn dòng thì hai chuỗi bằng nhau, nhưng dựa vào điều đó là dựa
-- vào một sự trùng hợp.
UPDATE cus.customer
   SET province = province
 WHERE btrim(street_ward) <> '' OR btrim(province) <> '';

-- --- 5. Mã số thuế DUY NHẤT -------------------------------------------------
--
-- Nói ra TRƯỚC khi tạo chỉ mục, và nói bằng tiếng Việt kèm danh sách: một lượt
-- `CREATE UNIQUE INDEX` vấp dữ liệu trùng chỉ ném ra tên chỉ mục và một giá trị,
-- và người vận hành đọc nó giữa lúc nâng cấp sẽ không biết phải sửa những dòng
-- nào.
DO $$
DECLARE ds text;
BEGIN
  SELECT string_agg(t.id_number || ' (' || t.ma || ')', E'\n  ')
    INTO ds
    FROM (SELECT id_number, string_agg(code, ', ' ORDER BY code) AS ma
            FROM cus.customer
           WHERE id_number IS NOT NULL AND status <> 'NGUNG_HOP_TAC'
           GROUP BY id_number HAVING count(*) > 1) t;
  IF ds IS NOT NULL THEN
    RAISE EXCEPTION E'Còn khách hàng TRÙNG mã số thuế, không tạo được ràng buộc duy nhất.\n'
      'Sửa hoặc ngừng hợp tác bớt những khách sau rồi chạy lại:\n  %', ds;
  END IF;
END $$;

-- CHỈ tính khách ĐANG hợp tác. Khách đã ngừng là dữ liệu lịch sử — giữ lại để
-- tra hồ sơ cũ (`0034`) — và giữ chỗ mã số thuế của họ là cấm luôn lượt lập lại
-- một khách hàng vừa nghỉ rồi quay lại.
--
-- Chỉ mục cũ `ix_customer_id_number` (không duy nhất) GỠ: chỉ mục mới phủ đúng
-- những lượt tra ấy, và hai chỉ mục trên cùng một cột là một cái không ai dùng.
DROP INDEX IF EXISTS cus.ix_customer_id_number;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_id_number
  ON cus.customer (id_number)
  WHERE id_number IS NOT NULL AND status <> 'NGUNG_HOP_TAC';

COMMENT ON INDEX cus.uq_customer_id_number IS
  'Mã số thuế duy nhất giữa các khách ĐANG hợp tác (0175). Khách đã ngừng đứng '
  'ngoài: giữ chỗ mã số thuế của họ là cấm lập lại một khách quay lại.';
