-- =============================================================================
-- 0098 — Mẫu hồ sơ ĐÓNG BĂNG vào hồ sơ; văn bản mẫu chỉ VÔ HIỆU, không xoá.
--
-- Hai yêu cầu chốt ngày 23/08, và chúng KHOÁ LẪN NHAU — bỏ một cái thì cái kia
-- thành lỗi, nên chúng đi cùng một migration:
--
--   1. Mẫu hồ sơ gắn vào hồ sơ tại đúng lúc TDV bấm *Gửi duyệt*. Từ đó chỉ TDV
--      chọn được bản trình bày; mọi vai trò sau trong luồng XEM đúng bản mà
--      người gửi đã chọn, không chọn lại được.
--   2. Không xoá và không sửa một mẫu nữa — chỉ vô hiệu hoá để nó rời khỏi ô
--      chọn.
--
-- Cái thứ hai là HỆ QUẢ BẮT BUỘC của cái thứ nhất: một mẫu đã gắn vào hồ sơ mà
-- xoá được thì bản mềm của hồ sơ ấy hỏng vĩnh viễn, và không ai chữa được — mẫu
-- không dựng lại được, còn hồ sơ thì đã khoá sửa từ lúc gửi duyệt.
--
-- ĐẢO HAI QUYẾT ĐỊNH CŨ, cả hai đều có lý do đứng vững lúc chốt:
--
--   `0058` — "người xem CHỌN MẪU, phải chọn trước khi xem". Đúng chừng nào mẫu
--            chỉ là bản trình bày của người đang đọc. Nhưng bản mềm CSBH là thứ
--            đem đi ký, nên bản trình bày của nó là một phần của cái được duyệt,
--            không phải sở thích của từng người mở ra xem.
--   `0067` — "lưu được là dùng được, muốn đổi thì xoá đi rồi thêm mẫu mới". Lý
--            do của nó — sửa mẫu đang dùng thì bản mềm hôm nay khác hôm qua mà
--            không chỗ nào ghi lại — nay được cột `mau_ho_so_id` trả lời thẳng:
--            hồ sơ nào cũng nói được nó dựng bằng mẫu nào.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 1. HỒ SƠ NHỚ MẪU CỦA CHÍNH NÓ
-- --------------------------------------------------------------------------
--
-- KHÔNG có khoá ngoại, và đó là chủ ý chứ không phải bỏ sót: `doc.contract_template`
-- thuộc schema của service khác, mà role `csbh_pol` không có quyền đọc nó (AD-02).
-- Cùng lối với `customer_id` — tham chiếu logic, xác minh bằng một lời gọi REST
-- lúc ghi, không bằng ràng buộc CSDL.
--
-- Người sửa về sau: thêm `REFERENCES doc.contract_template(id)` vào đây thì
-- migration đỏ ngay ở môi trường thật, vì role chạy migration khác role chạy
-- ứng dụng — và kể cả có chạy được, nó cũng chặn mất việc vô hiệu hoá một mẫu
-- đang được hồ sơ tham chiếu, đúng thứ mục 2 dưới đây sinh ra để cho phép.
ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS mau_ho_so_id uuid;

COMMENT ON COLUMN pol.policy.mau_ho_so_id IS
  'Mẫu hồ sơ CSBH đã đóng băng vào hồ sơ này, ghi lúc gửi duyệt (`0098`). '
  'Tham chiếu LOGIC sang doc.contract_template — không khoá ngoại, xem AD-02. '
  'NULL = hồ sơ lập TRƯỚC `0098`, chưa từng gắn mẫu nào.';

-- KHÔNG backfill, và không phải vì lười.
--
-- Lúc migration này chạy trên một CSDL trắng thì `doc.contract_template` còn
-- RỖNG: mẫu mặc định do `TemplateBootstrap` seed khi service `document` khởi
-- động, tức là sau. Một câu UPDATE ... FROM ở đây sẽ chạy êm và không gán được
-- dòng nào, rồi để lại ấn tượng rằng dữ liệu cũ đã được xử lý.
--
-- Nên NULL giữ nguyên nghĩa riêng của nó — *hồ sơ này chưa từng gắn mẫu* — và
-- màn hình nói thẳng điều đó thay vì bày ra một cái tên mẫu như thể nó đã được
-- chọn. Cùng lối với `threshold_source IS NULL` = "không rõ" ở `0022`.

-- --------------------------------------------------------------------------
-- 2. VÔ HIỆU HOÁ THAY CHO XOÁ
-- --------------------------------------------------------------------------
--
-- `0067` vừa gỡ `is_active` khỏi chính bảng này, nên phải nói rõ đây KHÔNG phải
-- một lượt quay xe.
--
-- Thứ `0067` gỡ là một VÒNG ĐỜI BA TRẠNG THÁI — nháp → đang dùng → đã ngừng —
-- sinh ra hồi mỗi khổ giấy chỉ được có một mẫu đang dùng, tức là ban hành mẫu
-- này nghĩa là hạ mẫu kia. Vòng đời ấy vẫn chết.
--
-- Thứ `0098` thêm là MỘT CỜ, trả lời đúng một câu: *mẫu này còn bày ra cho
-- người ta chọn nữa không*. Nó không đổi cách một mẫu ra đời (vẫn "lưu được là
-- dùng được"), không có trạng thái trung gian nào, và quan trọng nhất: nó KHÔNG
-- chặn đường đọc của hồ sơ đã gắn mẫu ấy. Vô hiệu hoá là rút khỏi ô chọn, không
-- phải rút khỏi những văn bản đã dựng bằng nó.
--
-- Mốc là CỘT RIÊNG kèm người thực hiện, đúng luật "mỗi mốc thời gian là một cột
-- riêng" (YCNV muc 10) — chứ không phải một boolean rồi đi lục nhật ký mới biết
-- ai vô hiệu và lúc nào.
ALTER TABLE doc.contract_template
  ADD COLUMN IF NOT EXISTS vo_hieu_hoa_luc timestamptz,
  ADD COLUMN IF NOT EXISTS vo_hieu_hoa_boi uuid;

COMMENT ON COLUMN doc.contract_template.vo_hieu_hoa_luc IS
  'Lúc mẫu bị rút khỏi ô chọn (`0098`). NULL = còn dùng được. '
  'Mẫu đã vô hiệu VẪN dựng được văn bản cho hồ sơ đã gắn nó — xem `theoId`.';

-- Đường nóng của ô chọn là "mẫu CÒN DÙNG ĐƯỢC của một loại, mới nhất trước".
-- Index partial theo đúng câu ấy; đường đọc theo id đã có khoá chính lo.
DROP INDEX IF EXISTS doc.ix_template_kind;
CREATE INDEX IF NOT EXISTS ix_template_kha_dung
  ON doc.contract_template (kind, updated_at DESC)
  WHERE vo_hieu_hoa_luc IS NULL;
