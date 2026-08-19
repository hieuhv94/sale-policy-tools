-- 0050 — Mẫu HỒ SƠ CSBH: bản A4 sinh từ mẫu Quản trị tải lên, không dựng cứng.
--
-- Tới `0049`, bản CSBH A4 do `render/sheet.ts` dựng bố cục ngay trong mã, và màn
-- hình *Giấy tờ mẫu* là một chỗ trống ghi "chưa làm" (muc 6.4). Khách hàng chốt
-- ngày 19/08: làm chức năng ấy, và **báo lỗi khi chưa có mẫu phù hợp**.
--
-- BA QUYẾT ĐỊNH THIẾT KẾ, ghi ở đây vì chúng định hình cả lược đồ:
--
-- 1. DÙNG LẠI `doc.contract_template`, không dựng bảng thứ hai.
--    Mẫu hợp đồng và mẫu hồ sơ khác nhau ở AI QUẢN LÝ và ở chỗ đặt trên màn
--    hình, còn cơ chế thì trùng khít: một file .docx trên kho, một bảng ánh xạ ô
--    trống ↔ trường dữ liệu, một bản đang dùng, các bản cũ giữ lại để quay lui.
--    Hai bảng song sinh là hai chỗ phải sửa mỗi lần đổi cơ chế, và cái thứ hai
--    luôn là cái bị quên.
--
-- 2. MỖI KHỔ GIẤY MỘT MẪU RIÊNG.
--    File .docx tự mang khổ giấy của nó — không có cách nào xoay một mẫu dọc
--    thành ngang lúc trộn. Mà muc 11.1 đòi đủ CẢ HAI khổ, và `0054` cho người
--    dùng chọn khổ ngay trong hộp xem. Nên "mẫu phù hợp" nghĩa là mẫu ĐÚNG KHỔ
--    đang xem — và đó cũng chính là chữ khách hàng dùng khi nêu yêu cầu.
--
-- 3. BẢNG SẢN PHẨM VẪN DO HỆ THỐNG DỰNG.
--    Đây là điểm khó nhất, và bỏ qua nó là làm hỏng một luật đã chốt. Muc 7.1
--    nói số cột CPBH của bảng bằng dòng NHIỀU KHOẢN NHẤT — mà mỗi dòng nhận tới
--    50 khoản. Một bảng vẽ sẵn trong Word có số cột CỐ ĐỊNH, nên mẫu do người
--    dùng soạn không tả được luật ấy.
--    Cách giải: mẫu đặt một ô trống DUY NHẤT `{{policy.lines_table}}`, và hệ
--    thống thay nó bằng cả cái bảng đã dựng đúng số cột. Người soạn mẫu vẫn nắm
--    phần đầu trang, khối công ty, câu chữ và chỗ ký; hệ thống giữ nguyên bảo
--    đảm về bảng số — thứ mà người ký đặt bút xuống dưới.

DO $$ BEGIN
  CREATE TYPE doc.template_kind AS ENUM ('HOP_DONG', 'HO_SO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Khổ giấy CHỈ có nghĩa với mẫu hồ sơ. Mẫu hợp đồng để NULL: hợp đồng in ra ở
-- khổ nào là việc của chính file .docx ấy, phần mềm không hỏi và không chọn.
DO $$ BEGIN
  CREATE TYPE doc.paper_size AS ENUM ('a4p', 'a4l');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE doc.contract_template
  ADD COLUMN IF NOT EXISTS kind doc.template_kind NOT NULL DEFAULT 'HOP_DONG',
  ADD COLUMN IF NOT EXISTS paper_size doc.paper_size;

-- Mẫu hồ sơ BẮT BUỘC có khổ giấy, mẫu hợp đồng bắt buộc KHÔNG có.
--
-- Ràng buộc ở tầng CSDL chứ không chỉ ở tầng ứng dụng: một dòng `HO_SO` thiếu
-- khổ giấy thì không đường nào tìm ra nó, nên nó là một mẫu vô hình — Quản trị
-- thấy nó trong danh sách, phát hành nó, rồi bản A4 vẫn báo "chưa có mẫu".
ALTER TABLE doc.contract_template
  DROP CONSTRAINT IF EXISTS ck_template_paper_size;
ALTER TABLE doc.contract_template
  ADD CONSTRAINT ck_template_paper_size CHECK (
    (kind = 'HO_SO' AND paper_size IS NOT NULL)
    OR (kind = 'HOP_DONG' AND paper_size IS NULL)
  );

/*
 * ĐANG DÙNG: một bản cho mỗi (loại × khổ giấy).
 *
 * Index cũ `uq_contract_template_active ON ((true)) WHERE is_active` cho phép
 * đúng MỘT mẫu đang dùng trong toàn bảng. Giữ nguyên là mẫu hồ sơ khổ dọc đá
 * mẫu hợp đồng ra khỏi trạng thái đang dùng — và triệu chứng sẽ là kế toán mất
 * khả năng xuất hợp đồng ngay khi Quản trị phát hành mẫu hồ sơ đầu tiên.
 *
 * HAI index thay vì một, và không phải vì thích chia nhỏ.
 *
 * Cách gọn hơn là một index trên `(kind, coalesce(paper_size::text, '-'))` — gộp
 * NULL của mẫu hợp đồng thành một khoá so sánh được, vì hai NULL KHÔNG bằng nhau
 * trong index UNIQUE thường và để nguyên là hai mẫu hợp đồng cùng đang dùng.
 * Postgres từ chối: phép ép enum sang text KHÔNG được đánh dấu IMMUTABLE, nên nó
 * không dùng được trong biểu thức index.
 *
 * Tách đôi thì mỗi index nói đúng một luật, và cả hai đều chỉ so cột trần.
 */
DROP INDEX IF EXISTS doc.uq_contract_template_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_active_hop_dong
  ON doc.contract_template (kind) WHERE is_active AND kind = 'HOP_DONG';
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_active_ho_so
  ON doc.contract_template (kind, paper_size) WHERE is_active AND kind = 'HO_SO';

-- Tra mẫu đang dùng theo loại và khổ — đường nóng của mọi lượt xem bản mềm.
CREATE INDEX IF NOT EXISTS ix_template_kind
  ON doc.contract_template (kind, paper_size) WHERE is_active;

COMMENT ON COLUMN doc.contract_template.kind IS
  'HOP_DONG do Sale Admin quản lý (muc 8.2); HO_SO do Quản trị hệ thống (muc 6.4)';
COMMENT ON COLUMN doc.contract_template.paper_size IS
  'Chỉ mẫu HO_SO: khổ giấy của chính file .docx. Mẫu hợp đồng luôn NULL';
