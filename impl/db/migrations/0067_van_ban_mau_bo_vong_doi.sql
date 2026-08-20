-- 0067 — Văn bản mẫu: bỏ vòng đời ban hành, chọn cột bảng theo từng mẫu.
--
-- Khách hàng chốt lại toàn bộ cách nhập mẫu ngày 20/08. Bốn thay đổi ở tầng dữ
-- liệu, và cả bốn đều là BỎ BỚT — cái duy nhất thêm vào là tập cột của bảng.
--
--   1. Không còn "đang dùng" và "nháp": mẫu nào trong danh sách cũng dùng được.
--   2. Không còn sửa mẫu: muốn đổi thì xoá đi và thêm mẫu mới.
--   3. Không còn định dạng và cờ bắt buộc do người dùng chọn cho từng ô trống.
--   4. Không còn khoá `cong_ty.` và `san_pham.`.

-- --------------------------------------------------------------------------
-- 1. MỌI MẪU ĐỀU DÙNG ĐƯỢC — bỏ `is_active` và `published_at`
-- --------------------------------------------------------------------------
--
-- Vòng đời cũ có ba trạng thái: nháp (vừa tải lên, chưa ánh xạ xong) → đang
-- dùng (đã ban hành) → đã ngừng. Ba trạng thái ấy sinh ra khi mỗi khổ giấy chỉ
-- được có MỘT mẫu đang dùng, tức là ban hành mẫu này nghĩa là hạ mẫu kia.
--
-- `0058` bỏ luật một-mẫu-một-khổ: người xem chọn thẳng mẫu trong danh sách. Từ
-- đó "ban hành" chỉ còn nghĩa là *đưa vào danh sách chọn* — mà một mẫu đã tải
-- lên và đã ánh xạ xong thì còn lý do gì để nằm ngoài danh sách? Trạng thái
-- "nháp" vì thế là một phòng chờ không dẫn tới đâu, và "đã ngừng" là một cách
-- xoá nửa vời.
--
-- Từ `0067`: lưu được là dùng được. Không lưu được thì không có dòng nào cả —
-- phép kiểm chuyển hết về lúc LƯU, nơi người soạn đang đứng và sửa được ngay.
ALTER TABLE doc.contract_template
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS published_at;

-- Index cũ lọc theo `is_active` nên nó đi cùng. Đường nóng mới là "mọi mẫu của
-- một loại, mới nhất trước" — chính là thứ ô chọn cần.
DROP INDEX IF EXISTS doc.ix_template_kind;
CREATE INDEX IF NOT EXISTS ix_template_kind
  ON doc.contract_template (kind, updated_at DESC);

-- --------------------------------------------------------------------------
-- 2. TẬP CỘT CỦA BẢNG SẢN PHẨM, lưu theo TỪNG MẪU
-- --------------------------------------------------------------------------
--
-- Ô trống `{{bang_san_pham}}` được thay bằng cả một bảng do hệ thống dựng, vì
-- số cột CPBH đổi theo từng hồ sơ (muc 7.1). Tới `0066` tập cột là CỐ ĐỊNH
-- trong mã: mười cột, ai cũng như ai.
--
-- Chốt 20/08 (phương án A): mỗi mẫu tự khai muốn hiện cột nào. Đây là chỗ đúng
-- để đặt nó — từ `0058` người xem CHỌN MẪU, tức là chọn bản trình bày, và tập
-- cột là một thuộc tính của bản trình bày ấy. Quản trị soạn được "bản đầy đủ cho
-- nội bộ" và "bản gọn đưa khách hàng" mà không cần ai lập trình.
--
-- NULL = tập cột mặc định (đủ mười cột). Giữ NULL có nghĩa thay vì điền sẵn một
-- mảng: mẫu cũ không khai gì thì hành xử y như trước, và không có lượt cập nhật
-- hàng loạt nào phải viết đúng.
ALTER TABLE doc.contract_template
  ADD COLUMN IF NOT EXISTS cot_bang jsonb;

COMMENT ON COLUMN doc.contract_template.cot_bang IS
  'Tập cột của bảng sản phẩm cho riêng mẫu này (`0067`), dạng mảng khoá cột. '
  'NULL = tập mặc định. Khoá `cpbh` là MỘT lựa chọn nở ra thành CPBH1…CPBHn';

-- --------------------------------------------------------------------------
-- 3. ÁNH XẠ CHỈ CÒN "Ô TRỐNG NÀO → TRƯỜNG NÀO"
-- --------------------------------------------------------------------------
--
-- Hai cột này để người soạn mẫu tự chọn cho từng ô trống, và cả hai đều là câu
-- hỏi sai:
--
--   `format`   — "công nợ hiển thị kiểu tiền hay kiểu chữ?" chỉ có một câu trả
--                lời đúng, và nó đi theo TRƯỜNG chứ không theo mẫu. Hỏi người
--                dùng là mời họ trả lời sai ở đúng một trong hai mươi ô.
--   `required` — đánh dấu một ô là bắt buộc chỉ đổi thời điểm báo lỗi: xuất
--                được hay không. Mà 13 mục bắt buộc của muc 11.1 đã kiểm ở tầng
--                khác rồi, nên cột này chỉ tạo ra một cách tự chặn chính mình.
--
-- Định dạng từ `0067` nằm trong `sources.ts`, gắn cứng vào từng trường nguồn.
ALTER TABLE doc.contract_template_field
  DROP COLUMN IF EXISTS format,
  DROP COLUMN IF EXISTS required;

-- --------------------------------------------------------------------------
-- 4. XOÁ DÒNG ÁNH XẠ CỦA HAI NHÓM KHOÁ ĐÃ BỎ
-- --------------------------------------------------------------------------
--
-- `cong_ty.` — tên, địa chỉ và mã số thuế của Công ty là CỐ ĐỊNH, giống nhau ở
-- mọi hồ sơ. Người soạn mẫu gõ thẳng vào file Word là xong; một ô trống cho một
-- giá trị không bao giờ đổi chỉ thêm một bước có thể sai.
--
-- `san_pham.` — nhóm khoá theo dòng, dùng cho bảng VẼ TAY trong mẫu hợp đồng.
-- Từ `0067` mẫu hợp đồng cũng dùng `{{bang_san_pham}}` như mẫu hồ sơ, nên cơ
-- chế nhân bản dòng bảng không còn ai dùng. Một cơ chế không ai dùng mà vẫn
-- chạy là một cơ chế sẽ hỏng lặng lẽ.
DELETE FROM doc.contract_template_field
 WHERE source LIKE 'cong_ty.%' OR source LIKE 'san_pham.%';

-- Mẫu MẶC ĐỊNH do hệ thống seed thì xoá hẳn để dựng lại: thân mẫu của chúng có
-- cả `{{cong_ty.ten}}` lẫn bảng vẽ tay, mà cả hai đều vừa bị bỏ. `ensureDefault`
-- dựng lại ở lần khởi động ngay sau đó, bằng thân mẫu mới.
DELETE FROM doc.contract_template_field f
 USING doc.contract_template t
 WHERE f.template_id = t.id AND t.is_default;
DELETE FROM doc.contract_template WHERE is_default;
