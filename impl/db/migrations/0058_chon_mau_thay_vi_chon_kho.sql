-- 0058 — Người xem CHỌN MẪU, không chọn khổ giấy nữa.
--
-- `0050` dựng lược đồ quanh một câu hỏi: *"bản A4 này in khổ dọc hay khổ ngang"*.
-- Người dùng chọn khổ, hệ thống tra mẫu đúng khổ ấy, nên "mẫu phù hợp" nghĩa là
-- mẫu đúng khổ — và mỗi khổ chỉ được có MỘT mẫu đang dùng.
--
-- Khách hàng chốt ngày 20/08: bỏ hẳn câu hỏi ấy. Người xem chọn thẳng **mẫu nào
-- trong danh sách mẫu đang dùng**, và khổ giấy là chuyện của chính file .docx.
--
-- Đổi ấy kéo theo hai thứ ở tầng CSDL, cả hai đều là GỠ BỎ chứ không thêm.

-- --------------------------------------------------------------------------
-- 1. NHIỀU MẪU CÙNG ĐANG DÙNG — đó mới là cái danh sách để chọn
-- --------------------------------------------------------------------------
--
-- Hai index của `0050` giữ đúng một mẫu đang dùng cho mỗi (loại × khổ). Luật ấy
-- đúng khi hệ thống tự tra mẫu: hai mẫu cùng đang dùng thì `LIMIT 1` chọn bừa
-- một cái, và người dùng không có cách nào biết mình vừa in bằng mẫu nào.
--
-- Giờ chính người dùng chọn, nên nhiều mẫu cùng dùng được KHÔNG còn là mập mờ —
-- nó là cái danh sách. Giữ index lại thì *Ban hành* mẫu thứ hai sẽ lặng lẽ hạ
-- mẫu thứ nhất, và Quản trị không bao giờ có nổi hai mẫu để chọn.
--
-- Ý nghĩa của hai nút cũng đổi theo, và đây là chỗ đáng ghi lại:
--   *Ban hành*  : trước là "đặt làm mẫu DUY NHẤT" → nay là "đưa vào danh sách chọn"
--   *Ngừng dùng*: trước là "bỏ trống chỗ ấy"     → nay là "rút khỏi danh sách chọn"
DROP INDEX IF EXISTS doc.uq_template_active_hop_dong;
DROP INDEX IF EXISTS doc.uq_template_active_ho_so;

-- `ix_template_kind (kind, paper_size) WHERE is_active` GIỮ NGUYÊN. Nó không
-- ràng buộc gì, và giờ nó phục vụ đúng đường nóng mới: liệt kê mẫu đang dùng của
-- một loại để dựng ô chọn.

-- --------------------------------------------------------------------------
-- 2. KHỔ GIẤY: ĐỌC TỪ FILE, không hỏi người tải lên
-- --------------------------------------------------------------------------
--
-- `0050` bắt mẫu hồ sơ khai khổ giấy và cấm mẫu hợp đồng khai. Ràng buộc ấy có
-- lý khi khổ giấy là KHOÁ TRA CỨU — một dòng `HO_SO` thiếu khổ là một mẫu vô
-- hình. Nay nó không tra cứu gì nữa; nó chỉ còn là cái nhãn nhỏ cạnh tên mẫu để
-- người chọn biết mình sắp in ra tờ nằm ngang hay tờ đứng.
--
-- Một ô nhập tay mà không còn hậu quả gì là một ô sẽ nói dối: Quản trị tải file
-- ngang lên rồi chọn nhầm "A4 dọc", và không có gì trên đời phát hiện ra. Nên từ
-- `0058` phần mềm **đọc khổ giấy từ chính `w:orient` trong file** lúc tải lên,
-- cho CẢ HAI loại mẫu — và ràng buộc "hợp đồng phải NULL" thành sai.
ALTER TABLE doc.contract_template
  DROP CONSTRAINT IF EXISTS ck_template_paper_size;

-- Cột vẫn để NULL được: những mẫu hợp đồng tải lên TRƯỚC `0058` không có giá trị
-- nào đúng để điền, và không đọc lại được từ đây — file nằm trên kho đối tượng,
-- SQL không với tới. NULL nghĩa là "chưa biết", và ô chọn bỏ trống cái nhãn ấy
-- thay vì đoán. Mẫu tải lên từ nay trở đi luôn có giá trị đọc từ file.
COMMENT ON COLUMN doc.contract_template.paper_size IS
  'Khổ giấy ĐỌC TỪ w:orient của chính file .docx lúc tải lên (`0058`), cho cả hai '
  'loại mẫu. Chỉ là nhãn hiển thị — không còn là khoá tra mẫu. NULL = mẫu cũ '
  'trước `0058`, chưa biết khổ';

-- --------------------------------------------------------------------------
-- 3. HAI MẪU MẶC ĐỊNH PHẢI HOÀ NHAU, để "mẫu mở sẵn" là một câu trả lời xác định
-- --------------------------------------------------------------------------
--
-- Từ `0058`, thứ tự danh sách quyết định mẫu nào mở sẵn khi không ai chọn — bản
-- xem trước trong hộp ký số chẳng hạn. Thứ tự ấy là:
--
--     is_default ASC, published_at DESC NULLS LAST, paper_size, id
--
-- Hai mẫu mặc định A4 dọc và A4 ngang do hệ thống tự seed lúc khởi động. Bản
-- trước seed chúng trong HAI giao dịch riêng, nên `published_at` chênh nhau vài
-- mili giây — và cái seed sau, khổ NGANG, luôn thắng. Nghĩa là mọi cài đặt đã
-- chạy trước `0058` sẽ mở sẵn bản nằm ngang, không vì ai quyết định thế cả.
--
-- Gán cho chúng CÙNG một mốc thì thứ tự rơi xuống `paper_size`, và thứ tự khai
-- enum cho A4 dọc đứng trước. Bản cài mới không cần câu lệnh này — `ensureDefault`
-- từ `0058` seed cả hai trong một giao dịch, nên chúng đã bằng nhau sẵn.
--
-- Chỉ đụng vào MẪU MẶC ĐỊNH: mẫu do người dùng ban hành mang mốc thời gian thật
-- của một hành động thật, và "mẫu mới ban hành đứng đầu" là luật cố ý.
UPDATE doc.contract_template t
   SET published_at = m.som_nhat
  FROM (
    SELECT min(published_at) AS som_nhat
      FROM doc.contract_template
     WHERE is_default AND kind = 'HO_SO' AND published_at IS NOT NULL
  ) AS m
 WHERE t.is_default AND t.kind = 'HO_SO' AND t.published_at IS NOT NULL
   AND m.som_nhat IS NOT NULL;
