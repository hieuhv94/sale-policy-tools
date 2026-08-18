-- =============================================================================
-- 0045 — Tách "Trình ký" khỏi "Lỗi bản cứng" trên bàn của Sale Admin.
--
-- Hai việc này KHÁC HẲN nhau nhưng cùng mang một trạng thái `SA_DANG_XU_LY`:
--
--   * B8  — kế toán vừa tiếp nhận bản mềm. Sale Admin in, trình BLĐ ký, scan.
--   * B10C — kế toán tiếp nhận lần 2 rồi bắt in lại. Bản scan cũ ĐÃ BỊ XOÁ khỏi
--     hệ thống (xem workflow.service.ts), nên Sale Admin phải làm lại từ đầu
--     một việc tưởng đã xong.
--
-- Trạng thái không phân biệt được vì nó ghi hồ sơ ĐANG Ở ĐÂU, còn khác biệt ở
-- đây là hồ sơ TỚI ĐÓ BẰNG ĐƯỜNG NÀO. Suy từ nhật ký thì được — sự kiện
-- KT_REQUEST_REPRINT gần nhất có sau sự kiện SA_HANDOVER gần nhất hay không —
-- nhưng đó là một phép quét `pol.policy_event` cho MỖI hồ sơ ở mỗi lần đếm thẻ.
-- Một cột mốc thời gian rẻ hơn nhiều và đọc thẳng ra được.
--
-- Cột đặt ở `pol.policy` (nguồn) và chép sang `rpt.policy_row` (read-model):
-- SyncService dựng lại toàn bộ dòng read-model từ nguồn, nên cột chỉ có ở một
-- bên là cột luôn rỗng ở bên kia.
-- =============================================================================

ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS reprint_requested_at timestamptz;

COMMENT ON COLUMN pol.policy.reprint_requested_at IS
  'Lúc kế toán yêu cầu in lại bản cứng (B10C). Xoá khi Sale Admin bàn giao lại.';

ALTER TABLE rpt.policy_row
  ADD COLUMN IF NOT EXISTS reprint_requested_at timestamptz;

-- Đếm thẻ "Lỗi bản cứng" lọc trên đúng một bước, nên chỉ mục chỉ cần phủ những
-- hồ sơ CÓ mốc này — số ấy luôn nhỏ, còn bảng thì lớn dần mãi.
CREATE INDEX IF NOT EXISTS ix_rpt_policy_row_reprint
  ON rpt.policy_row (reprint_requested_at)
  WHERE reprint_requested_at IS NOT NULL;

-- --- Nạp lại cho dữ liệu đã có -----------------------------------------------
--
-- Hồ sơ đang nằm ở Sale Admin từ trước migration này vẫn phân biệt được, vì
-- nhật ký còn nguyên. Điều kiện đọc là: lần đòi in lại GẦN NHẤT xảy ra SAU lần
-- bàn giao gần nhất — nếu không có mốc so sánh đó thì một hồ sơ đã in lại, đã
-- bàn giao, rồi quay lại B8 vì lý do khác sẽ bị gắn nhầm nhãn đỏ.
WITH moc AS (
  SELECT p.id,
         max(e.at) FILTER (WHERE e.action = 'KT_REQUEST_REPRINT') AS doi_in_lai,
         max(e.at) FILTER (WHERE e.action = 'SA_HANDOVER')        AS ban_giao
    FROM pol.policy p
    JOIN pol.policy_event e ON e.policy_id = p.id
   WHERE p.status::text = 'SA_DANG_XU_LY'
      OR (p.status::text = 'QUA_HAN_DUYET' AND p.pending_step::text = 'B8_SA_XU_LY')
   GROUP BY p.id
)
UPDATE pol.policy p
   SET reprint_requested_at = moc.doi_in_lai
  FROM moc
 WHERE p.id = moc.id
   AND moc.doi_in_lai IS NOT NULL
   AND (moc.ban_giao IS NULL OR moc.doi_in_lai > moc.ban_giao);

-- Chép sang read-model ngay, đừng chờ hồ sơ đổi lần sau mới đồng bộ: hồ sơ đang
-- kẹt ở bước in lại thì có khi cả tuần không đổi gì, mà thẻ trên trang tổng quan
-- thì đọc từ đây. Cùng cách `0031` xử lý bốn cột người.
UPDATE rpt.policy_row r
   SET reprint_requested_at = p.reprint_requested_at
  FROM pol.policy p
 WHERE r.policy_id = p.id
   AND p.reprint_requested_at IS NOT NULL;
