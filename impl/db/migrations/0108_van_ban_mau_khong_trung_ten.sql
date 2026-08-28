-- `0150` — VĂN BẢN MẪU: CẤM TRÙNG TÊN, VÀ BỎ HẲN KHÁI NIỆM MẪU MẶC ĐỊNH.
--
-- Khách hàng chốt 28/08. Hai thay đổi, và chúng đi cùng nhau vì cùng một lý do:
-- tên mẫu là thứ DUY NHẤT người dùng dựa vào để chọn, nên nó phải phân biệt
-- được — và một mẫu do hệ thống tự dựng ra là một dòng không ai đặt tên.
--
-- ---------------------------------------------------------------------------
-- 1. TÊN KHÔNG ĐƯỢC TRÙNG, KỂ CẢ VỚI MẪU ĐÃ VÔ HIỆU HOÁ
-- ---------------------------------------------------------------------------
--
-- Ô chọn mẫu hiện đúng một cột: cái tên. Hai mẫu trùng tên là hai dòng giống hệt
-- nhau trong ô ấy, và người chọn chọn mù — trong khi hai mẫu có thể khác nhau cả
-- tập cột bảng sản phẩm.
--
-- PHẠM VI: theo từng LOẠI mẫu. Mẫu hồ sơ và mẫu hợp đồng nằm ở hai ô chọn khác
-- nhau, nên trùng tên giữa hai loại không gây nhầm cho ai.
--
-- TÍNH CẢ MẪU ĐÃ VÔ HIỆU, theo đúng yêu cầu. Cái giá phải biết: tên của một mẫu
-- hỏng bị **cháy vĩnh viễn**. Không còn đường sửa mẫu, nên cách duy nhất chữa
-- một mẫu sai là tải bản đã sửa lên rồi vô hiệu hoá bản cũ — mà tên tự nhiên của
-- bản mới chính là tên bản cũ, và luật này từ chối. Quản trị phải tự đặt tên
-- khác. Nới ra thì chỉ cần thêm `WHERE vo_hieu_hoa_luc IS NULL` vào chỉ mục.
--
-- Ở TẦNG CSDL chứ không ở tầng ứng dụng, cùng lý do mà `0012` đã viết cho
-- `uq_contract_template_active`: hai lượt bấm gần như đồng thời thì kiểm bằng
-- SELECT rồi INSERT sẽ cho qua cả hai, và hệ thống có hai mẫu trùng tên mà không
-- ai biết.
--
-- ---------------------------------------------------------------------------
-- 2. BỎ HẲN MẪU MẶC ĐỊNH
-- ---------------------------------------------------------------------------
--
-- `document` tự dựng một mẫu mỗi loại/khổ lúc khởi động khi không còn mẫu nào
-- còn hiệu lực. Hệ quả: vô hiệu hoá mẫu cuối cùng của một khổ thì lần khởi động
-- sau có một mẫu Quản trị không hề tạo bỗng xuất hiện trong danh sách.
--
-- Khách hàng chốt: **hệ thống không bao giờ được tự tạo một bản mặc định**. Không
-- mẫu nào thì không xem trước được, và đó là câu trả lời đúng — thà nói ra rằng
-- chưa có mẫu, còn hơn đưa ra một tờ giấy không ai duyệt nội dung.
--
-- CÁI GIÁ, ghi ra để không ai phải đoán: hệ thống vừa cài xong **không dùng
-- được** cho tới khi có mẫu. `0098` bắt TDV chọn mẫu lúc gửi duyệt, nên không
-- mẫu nào thì hồ sơ không rời được *Nháp*. `./csbh nap-danh-muc` — hoặc một lượt
-- tải mẫu tay — từ đây là BƯỚC CÀI ĐẶT BẮT BUỘC, không còn là đường tắt cho bản
-- chạy thử.
--
-- Mất theo: `vaFileMacDinh` (`0059`), phép tự dựng lại file khi object mất trên
-- kho. Nó CHỈ chữa cho mẫu mặc định — mẫu người dùng tải lên chưa bao giờ được
-- chữa — nên bỏ đi là bỏ một sự bất đối xứng, không phải bỏ một bảo đảm chung.

-- --- 1a. Dọn bản trùng do CHÍNH HỆ THỐNG sinh ra -----------------------------
--
-- Đo được ngay ở lượt chạy đầu: CSDL test có **5 bản** mỗi mẫu mặc định. Nguyên
-- nhân là chính cơ chế đang bị bỏ — `ensureDefault` chỉ hỏi *"còn mẫu nào DÙNG
-- ĐƯỢC không"*, nên mỗi lượt vô hiệu hoá cả bảng rồi khởi động lại là thêm một
-- bản mới mang y nguyên cái tên cũ. Chuyện ấy xảy ra được trên máy khách hàng
-- đúng như trên máy test.
--
-- Đổi tên chứ KHÔNG xoá: mẫu có thể đã đóng băng vào hồ sơ đã ký (`0098`), và
-- xoá là làm hỏng bản mềm của chúng. Giữ bản CŨ NHẤT nguyên tên — nó là bản
-- nhiều hồ sơ trỏ vào nhất — rồi đánh số các bản sau theo `created_at`.
--
-- Chỉ đụng tới dòng `is_default`: đây là dữ liệu hệ thống tự tạo, và `0150` nói
-- rằng nó lẽ ra không nên tồn tại. Mẫu do Quản trị tải lên thì tuyệt đối không
-- tự sửa — xem bước 1b.
WITH danh_so AS (
  SELECT id,
         name || ' (bản ' || row_number() OVER (
           PARTITION BY kind, name ORDER BY created_at, id
         ) || ')' AS ten_moi,
         row_number() OVER (PARTITION BY kind, name ORDER BY created_at, id) AS thu_tu
    FROM doc.contract_template
   WHERE is_default
     AND (kind, name) IN (SELECT kind, name FROM doc.contract_template
                           GROUP BY kind, name HAVING count(*) > 1)
)
UPDATE doc.contract_template t
   SET name = d.ten_moi
  FROM danh_so d
 WHERE t.id = d.id AND d.thu_tu > 1;

-- --- 1b. Chốt chặn: dừng nếu CÒN tên trùng ----------------------------------
--
-- Tới đây chỉ còn trùng giữa những mẫu do người dùng tải lên. DỪNG chứ không tự
-- đổi tên: đổi tên hộ là sửa dữ liệu người dùng mà không ai yêu cầu, và cái tên
-- mới ấy sẽ hiện lên ô chọn của mọi Trình dược viên. Câu lỗi nói ra ĐÚNG những
-- dòng phải xử lý, để người vận hành sửa rồi chạy lại.
DO $$
DECLARE trung text;
BEGIN
  SELECT string_agg(format('%s "%s" (%s bản)', kind, name, n), '; ')
    INTO trung
    FROM (SELECT kind::text AS kind, name, count(*) AS n
            FROM doc.contract_template
           GROUP BY kind, name HAVING count(*) > 1) x;

  IF trung IS NOT NULL THEN
    RAISE EXCEPTION
      'Có văn bản mẫu trùng tên, phải đặt lại tên trước khi nâng cấp: %', trung
      USING HINT = 'Đổi tên qua psql: UPDATE doc.contract_template SET name = ... WHERE id = ...';
  END IF;
END $$;

-- --- 2. Tên là duy nhất trong từng loại -------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_ten
  ON doc.contract_template (kind, name);

COMMENT ON INDEX doc.uq_template_ten IS
  'Tên mẫu duy nhất theo LOẠI, tính cả mẫu đã vô hiệu hoá (0150). Ô chọn mẫu chỉ '
  'hiện cái tên, nên hai mẫu trùng tên là hai dòng không phân biệt được.';

-- --- 3. Bỏ cột mẫu mặc định --------------------------------------------------
--
-- Bỏ CỘT chứ không chỉ thôi ghi vào nó: một cột không ai đặt nữa mà vẫn còn đó
-- là một câu hỏi cho người đọc lược đồ sáu tháng sau, và câu trả lời đúng đã
-- không còn tồn tại trong mã.
ALTER TABLE doc.contract_template DROP COLUMN IF EXISTS is_default;
