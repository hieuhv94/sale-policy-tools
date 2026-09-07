-- `0180` — NGÀY ÁP DỤNG CHUYỂN TỪ HỒ SƠ XUỐNG TỪNG DÒNG SẢN PHẨM.
--
-- Khách hàng chốt 07/09: *"Bỏ phần ngày áp dụng cho CSBH, thay vào đó gán ngày
-- áp dụng vào cho từng sản phẩm cụ thể"*.
--
-- Một hồ sơ CSBH giờ không có MỘT ngày áp dụng nữa: mỗi mặt hàng có ngày của
-- riêng nó, và một hồ sơ hoàn toàn có thể gồm ba dòng áp dụng từ 01/09 cộng một
-- dòng mới áp dụng từ 01/10.
--
-- ---------------------------------------------------------------------------
-- CỘT CŨ GỠ HẲN, KHÔNG GIỮ LẠI LÀM DẪN XUẤT
-- ---------------------------------------------------------------------------
--
-- Đã cân nhắc giữ `pol.policy.applied_date` như một cột DẪN XUẤT bằng ngày sớm
-- nhất của các dòng — nó sẽ giữ cho tờ giấy, phép chặn gửi duyệt và bộ lọc báo
-- cáo không phải đụng tới. Khách hàng chọn **gỡ hẳn**, và lựa chọn ấy đúng ở
-- một điểm mà phương án kia không có: một hồ sơ bốn dòng bốn ngày thì "ngày áp
-- dụng của hồ sơ" là một câu **không có câu trả lời đúng**, và in ngày sớm nhất
-- ra tờ giấy đem ký là nói một điều sai về ba dòng còn lại.
--
-- Nên ô *Thời gian áp dụng* rời khỏi hai mẫu hồ sơ mặc định, và ngày đi vào
-- **bảng sản phẩm** — cột đầu tiên, ngay bên trái *Mã sản phẩm*.
--
-- HAI CHỖ CÒN CẦN MỘT NGÀY DUY NHẤT, và cả hai đều ở NGOÀI hồ sơ:
--
--   * `rpt.policy_row.applied_date` — bộ lọc *"CSBH áp dụng từ … đến …"* của
--     màn hình Thống kê. Từ lượt này nó mang **ngày sớm nhất của các dòng**;
--     `pol` dựng con số ấy ở `internal.controller` chứ không lưu thành cột, để
--     không có bản sao thứ hai phải giữ đồng bộ.
--   * `ho_so.ngay_ap_dung` của văn bản mẫu — GỠ khỏi bảng nguồn. Mẫu cũ đang
--     dùng ô ấy KHÔNG hỏng: nguồn lạ trả `null` và ô in ra rỗng. Xem
--     `docs/04-TRIEN-KHAI.md`.
--
-- ---------------------------------------------------------------------------
-- BACKFILL: NGÀY CỦA HỒ SƠ TRỞ THÀNH NGÀY CỦA MỌI DÒNG
-- ---------------------------------------------------------------------------
--
-- Đây là phép chuyển ĐÚNG chứ không phải một giá trị cho có: trước lượt này,
-- ngày áp dụng của hồ sơ ĐÃ LÀ ngày áp dụng của từng dòng — nó quyết định bảng
-- giá và ngưỡng chiết khấu được chụp cho mọi dòng (`0029`). Chép xuống là viết
-- ra thứ vốn đã đúng, không phải đoán.
--
-- Hồ sơ cũ có `applied_date` NULL (lập qua API trước `0104`) thì lấy ngày soạn
-- thảo — cùng quy ước với `ho_so.ngay_ap_dung` cũ, vốn rơi về `effective_from`.

ALTER TABLE pol.policy_line
  ADD COLUMN IF NOT EXISTS ngay_ap_dung date;

-- CHẠY LẠI ĐƯỢC, và điều đó không phải thừa: phần dưới `DROP COLUMN` mất cột
-- nguồn, nên một lượt chạy lại nửa chừng (hỏng ở giữa, hoặc ai đó xoá dòng ghi
-- nhận trong `sys.schema_migration`) sẽ chết ở đúng câu này. Nhánh `ELSE` lấy
-- ngày soạn thảo — cùng giá trị mà nhánh trên rơi về khi `applied_date` NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'pol' AND table_name = 'policy' AND column_name = 'applied_date'
  ) THEN
    UPDATE pol.policy_line l
       SET ngay_ap_dung = coalesce(p.applied_date, p.created_at::date)
      FROM pol.policy p
     WHERE p.id = l.policy_id AND l.ngay_ap_dung IS NULL;
  ELSE
    UPDATE pol.policy_line l
       SET ngay_ap_dung = p.created_at::date
      FROM pol.policy p
     WHERE p.id = l.policy_id AND l.ngay_ap_dung IS NULL;
  END IF;
END $$;

ALTER TABLE pol.policy_line
  ALTER COLUMN ngay_ap_dung SET NOT NULL;

-- KHÔNG có DEFAULT: ngày áp dụng là một quyết định của người lập, không phải
-- một giá trị mà CSDL điền hộ. Mặc định *hôm nay* đặt ở MÁY CHỦ (`0104` —
-- `policies.service.ts`), nơi biết "hôm nay" là hôm nay theo giờ Việt Nam chứ
-- không theo giờ của tiến trình Postgres.
COMMENT ON COLUMN pol.policy_line.ngay_ap_dung IS
  'Ngày dòng sản phẩm này bắt đầu áp dụng. Quyết định bảng giá và ngưỡng chiết '
  'khấu được chụp cho chính dòng ấy (0180, thay cho pol.policy.applied_date).';

ALTER TABLE pol.policy DROP COLUMN IF EXISTS applied_date;

-- Bộ lọc *"áp dụng từ … đến …"* giờ quét cột này thay vì `pol.policy.applied_date`.
-- Hai hồ sơ 30 dòng là 60 dòng phải đọc để trả lời một câu hỏi về khoảng ngày.
CREATE INDEX IF NOT EXISTS ix_policy_line_ngay_ap_dung
  ON pol.policy_line (ngay_ap_dung);

-- ---------------------------------------------------------------------------
-- BA MẪU MẶC ĐỊNH PHẢI ĐƯỢC NẠP LẠI
-- ---------------------------------------------------------------------------
--
-- Nội dung ba tệp `.docx` đi cùng phần mềm vừa đổi: ô *Thời gian áp dụng* rời
-- khỏi đầu trang, và tập cột của bảng sản phẩm có thêm *Ngày áp dụng*.
--
-- Bộ nạp (`bootstrap-mau.ts`) là **idempotent theo `(kind, name)` tính cả dòng
-- đã vô hiệu hoá** (`0165`) — nó cố ý KHÔNG mọc lại mẫu người ta đã tắt. Nên
-- trên một hệ đang chạy, ba dòng cũ sẽ ở lại nguyên trạng và tệp mới không bao
-- giờ được nạp: bản mềm in ra vẫn mang ô *Thời gian áp dụng* rỗng (nguồn đã gỡ)
-- và bảng vẫn thiếu cột ngày.
--
-- Xoá ba dòng ấy ở đây là cách duy nhất bảo bộ nạp làm lại việc của nó. KHÔNG
-- phải một ngoại lệ của luật *"mẫu chỉ vô hiệu hoá, không xoá"* (`0163`): luật
-- ấy nói về mẫu NGƯỜI DÙNG soạn, còn ba dòng này là bản sao của ba tệp trong mã
-- nguồn, và chúng được thay bằng ba dòng CÙNG TÊN, CÙNG LOẠI ngay ở lượt khởi
-- động kế tiếp.
--
-- An toàn với hồ sơ đã ký: từ `0163` hồ sơ KHÔNG còn đóng băng id của mẫu, và
-- từ `0167` bản mềm đã lưu là **byte PDF** trên kho — không dòng nào trỏ tới
-- bảng này. Mẫu do người dùng tự tải lên KHÔNG bị chạm (`updated_by` khác).
--
-- Cái để lại: ba object `.docx` mồ côi trên MinIO cho mỗi lượt nâng cấp. Chúng
-- vô hình với mọi đường đọc (đều đi qua `owner_id`) và tốn vài chục KB — cùng
-- đánh đổi mà `0165` đã ghi.
DELETE FROM doc.contract_template
 WHERE name IN (
   'Hồ sơ mẫu đầy đủ (bản mặc định)',
   'Hồ sơ mẫu rút gọn (bản mặc định)',
   'Hợp đồng (bản mặc định)'
 );
