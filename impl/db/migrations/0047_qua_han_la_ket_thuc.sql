-- =============================================================================
-- 0047 — Quá hạn duyệt trở thành trạng thái KẾT THÚC, tự xoá sau 3 ngày.
--
-- ĐẢO NGƯỢC một quyết định cũ. YCNV mục 4 và tiêu chí NTF-11 chốt rằng hồ sơ quá
-- hạn "vẫn đi tiếp đúng nhánh cũ": nhãn quá hạn là lớp phủ, `pending_step` giữ
-- bước đang chờ, và người phụ trách xử lý muộn thì hồ sơ chạy tiếp bình thường.
-- Khách hàng đổi ý ngày 18/08: quá hạn là **chết**, không ai thao tác được nữa,
-- và sau 3 ngày hệ thống tự chuyển sang *Đã xoá*.
--
-- `pending_step` VẪN GIỮ, dù nó không còn dùng để định tuyến. Nó là câu trả lời
-- cho "hồ sơ chết ở bước nào" — thứ duy nhất nói được ai đã để nó chết, và là
-- thông tin phải có trong thư báo lẫn trong nhật ký.
--
-- Cột mới `overdue_at` là mốc đếm 3 ngày. Suy từ `pol.policy_event` cũng ra
-- (hàng `SLA_OVERDUE` gần nhất) nhưng đó là một phép quét nhật ký cho mỗi hồ sơ
-- ở mỗi vòng quét, 5 phút một lần.
-- =============================================================================

ALTER TABLE pol.policy ADD COLUMN IF NOT EXISTS overdue_at timestamptz;

COMMENT ON COLUMN pol.policy.overdue_at IS
  'Lúc hồ sơ bị đánh dấu Quá hạn duyệt. Mốc đếm 3 ngày trước khi tự chuyển Đã xoá (0047).';

-- Hồ sơ đang quá hạn từ trước migration này vẫn đếm được: nhật ký còn nguyên.
-- Không có hàng SLA_OVERDUE nào (dữ liệu dựng tay, seed) thì lấy `now()` — đếm
-- 3 ngày kể từ lúc triển khai, chứ không xoá ngay ở vòng quét đầu tiên.
UPDATE pol.policy p
   SET overdue_at = coalesce(
         (SELECT max(e.at) FROM pol.policy_event e
           WHERE e.policy_id = p.id AND e.action = 'SLA_OVERDUE'),
         now())
 WHERE p.status = 'QUA_HAN_DUYET' AND p.overdue_at IS NULL;

-- Vòng quét hỏi đúng một câu: "hồ sơ quá hạn nào đã đủ 3 ngày". Chỉ mục phủ
-- riêng nhóm ấy — nó luôn nhỏ, còn bảng thì lớn dần mãi.
CREATE INDEX IF NOT EXISTS ix_policy_qua_han_cho_xoa
  ON pol.policy (overdue_at)
  WHERE status = 'QUA_HAN_DUYET';
