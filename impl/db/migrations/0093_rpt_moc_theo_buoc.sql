-- =============================================================================
-- 0093 — Ba mốc theo bước vào read-model, cho trang *Thống kê*.
--
-- Trang *Thống kê* đếm HOẠT ĐỘNG theo kỳ, và một hoạt động chỉ đếm được khi có
-- mốc thời gian neo nó vào một kỳ. Tới `0092`, `rpt.policy_row` có bảy mốc —
-- lập, gửi duyệt, TBP ký, có hiệu lực, trả lại, từ chối, hết hiệu lực — nên ba
-- vai trò GIỮA luồng không có con số nào nói về việc của chính họ:
--
--   * Kế toán tiếp nhận lần 1 (B6) — không mốc nào.
--   * Sale Admin bàn giao bản cứng (B9) — không mốc nào.
--   * Xuất hợp đồng (B7) — không mốc nào.
--
-- Thiếu chúng thì trang Thống kê của Kế toán và Sale Admin chỉ còn cách bày ra
-- những con số của NGƯỜI KHÁC trong cùng phạm vi: "hồ sơ có hiệu lực trong kỳ"
-- đúng về mặt dữ liệu, nhưng nó đo bước cuối chứ không đo bước họ làm.
--
-- Cả ba đã nằm sẵn ở `pol.policy` từ `0001` và đã được `internal.controller.ts`
-- trả về từ P7b — read-model chỉ chưa chép. Nên đây là một migration THÊM CỘT
-- kèm một lượt chép, không phải một thay đổi nghiệp vụ.
--
-- KHÔNG thêm `kt_l2_received_at`: `approved_at` của read-model chính là
-- `effective_from`, và hồ sơ có hiệu lực đúng lúc kế toán tiếp nhận lần 2. Hai
-- cột cho một mốc là hai cột sẽ có ngày lệch nhau.
-- =============================================================================

ALTER TABLE rpt.policy_row
  ADD COLUMN IF NOT EXISTS kt_l1_received_at  timestamptz,
  ADD COLUMN IF NOT EXISTS sa_handover_at     timestamptz,
  ADD COLUMN IF NOT EXISTS contract_issued_at timestamptz;

COMMENT ON COLUMN rpt.policy_row.kt_l1_received_at IS
  'B6 — kế toán tiếp nhận bản mềm. Neo của chỉ số "tiếp nhận L1" theo kỳ (0093).';
COMMENT ON COLUMN rpt.policy_row.sa_handover_at IS
  'B9 — Sale Admin bàn giao bản cứng. Neo của chỉ số "bàn giao" theo kỳ (0093).';
COMMENT ON COLUMN rpt.policy_row.contract_issued_at IS
  'B7 — lần xuất hợp đồng gần nhất. Dấu vết DUY NHẤT của việc xuất hợp đồng (muc 8.3).';

-- KHÔNG thêm chỉ mục nào cho ba cột này.
--
-- Mọi truy vấn của trang Thống kê đều bắt đầu bằng mệnh đề phạm vi — dẫn đường
-- là `ix_rpt_scope` và ba chỉ mục người của `0031` — rồi gom nhóm trên tập đã
-- hẹp. Một chỉ mục cho cột chỉ dùng để `date_trunc` thì không lối đi nào chọn
-- tới, mà vẫn phải ghi lại ở MỌI lượt đồng bộ.

-- --- Chép cho dữ liệu đã có --------------------------------------------------
--
-- Cùng lý do với `0045`: hồ sơ đã bàn giao xong từ tuần trước thì có khi cả
-- tháng không đổi gì nữa, nên không sự kiện nào kéo nó qua `SyncService`. Chờ
-- lượt đồng bộ sau là để trang Thống kê trống đúng ở phần lịch sử — thứ mà cả
-- trang sinh ra để nói.
UPDATE rpt.policy_row r
   SET kt_l1_received_at  = p.kt_l1_received_at,
       sa_handover_at     = p.sa_handover_at,
       contract_issued_at = p.contract_issued_at
  FROM pol.policy p
 WHERE r.policy_id = p.id
   AND (p.kt_l1_received_at IS NOT NULL
     OR p.sa_handover_at IS NOT NULL
     OR p.contract_issued_at IS NOT NULL);
