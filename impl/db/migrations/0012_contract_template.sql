-- =============================================================================
-- 0012_contract_template — Mẫu hợp đồng và bảng ánh xạ trường (YCNV muc 8.2).
--
-- ĐỌC KỸ THỨ KHÔNG CÓ Ở ĐÂY: không có bảng `doc.contract`.
--
-- Xuất hợp đồng là một PHÉP BIẾN ĐỔI trả PDF về thẳng người bấm, không phải một
-- bản ghi (muc 8.3). Không mã hợp đồng, không trạng thái, không bản scan, không
-- phiên bản, không ảnh chụp dữ liệu tại thời điểm xuất. Dấu vết duy nhất là hai
-- cột `contract_issued_at/by` trên chính hồ sơ, cộng một dòng nhật ký cho mỗi
-- lần bấm. Test DOC-28 quét lược đồ và bảng định tuyến để giữ điều đó đúng mãi.
--
-- Hai hệ quả đã chấp nhận và cần nói rõ với người dùng: xuất hai lần cách nhau
-- một khoảng thời gian CÓ THỂ ra nội dung khác nhau nếu dữ liệu nguồn đã đổi
-- (DOC-27 khẳng định đúng điều này thay vì chống lại nó); và hệ thống KHÔNG trả
-- lời được "hợp đồng nào đã ký, hợp đồng nào chưa".
-- =============================================================================

CREATE TABLE IF NOT EXISTS doc.contract_template (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,

  -- File .docx gốc trên MinIO. Bản cũ GIỮ LẠI để quay lui được khi mẫu mới sai.
  file_id      uuid NOT NULL REFERENCES doc.stored_file(id),

  is_active    boolean NOT NULL DEFAULT false,
  is_default   boolean NOT NULL DEFAULT false,

  published_at timestamptz,
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ĐÚNG MỘT mẫu đang dùng tại một thời điểm (muc 8.2). Cưỡng chế ở tầng CSDL chứ
-- không ở tầng ứng dụng: hai lần bấm phát hành gần như đồng thời thì kiểm bằng
-- SELECT rồi UPDATE sẽ cho qua cả hai, và hệ thống có hai mẫu cùng "đang dùng"
-- mà không ai biết mẫu nào thật sự được lấy.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_template_active
  ON doc.contract_template ((true)) WHERE is_active;

-- BẢNG ÁNH XẠ: ô trống trên mẫu ↔ trường dữ liệu. Do SALE ADMIN cấu hình, không
-- phải lập trình viên hard-code (Hình 4).
CREATE TABLE IF NOT EXISTS doc.contract_template_field (
  template_id uuid NOT NULL REFERENCES doc.contract_template(id) ON DELETE CASCADE,

  -- Đúng chuỗi như trong file .docx, kể cả hai cặp ngoặc: '{{customer.name}}'.
  placeholder text NOT NULL,

  -- Tên trường nguồn, kiểm ngay lúc LƯU ánh xạ chứ không đợi tới lúc xuất mới
  -- báo lỗi — Sale Admin phải biết mình gõ sai ngay tại màn hình đang gõ (DOC-29).
  source      text NOT NULL,

  required    boolean NOT NULL DEFAULT false,
  format      text,

  PRIMARY KEY (template_id, placeholder)
);
