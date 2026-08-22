-- =============================================================================
-- 0094 — Chất lượng hồ sơ vào read-model: bị trả lại mấy lần, và sửa mất bao lâu.
--
-- Trang *Thống kê* của Trưởng bộ phận hỏi **hồ sơ của ai làm tôi mất công nhất**
-- (chốt 23/08). Câu ấy cần hai con số mà `rpt.policy_row` không có:
--
--   1. **Bị trả lại mấy lần.** Tới `0093` read-model chỉ có mốc `returned_at` —
--      biết hồ sơ ĐÃ TỪNG bị trả lại, không biết một lần hay bốn lần. Mà một lần
--      với bốn lần là hai câu chuyện khác hẳn: thanh cơ cấu trên màn hình tách
--      *ký thẳng · trả lại 1 lần · trả lại từ 2 lần · từ chối*.
--   2. **Trả lại rồi bao lâu mới quay lại.** Quãng này ăn thẳng vào SLA 14 ngày
--      của chính hồ sơ ấy, và nó là quãng KHÔNG AI ĐỂ Ý: lúc đó hồ sơ nằm ở bàn
--      TDV, không ở bàn người đang chờ ký.
--
-- VÌ SAO LÀ CỘT CHỨ KHÔNG PHẢI ĐẾM LÚC ĐỌC. Cả hai suy được từ `pol.policy_event`
-- — nhưng đó là bảng của service `policy`, và `csbh_rpt` không có quyền đọc nó
-- (AD-02). Đường duy nhất là chép qua sự kiện đồng bộ, đúng cách mọi cột khác của
-- read-model đã đi.
--
-- CHỈ ĐẾM LẦN TRẢ LẠI CỦA TRƯỞNG BỘ PHẬN, không gộp lần trả lại của Kế toán.
-- Màn hình dùng nó là màn hình của Trưởng bộ phận, và câu hỏi là "hồ sơ gửi tới
-- bàn TÔI phải trả lại mấy lần". Gộp thêm lần trả của Kế toán là trộn công của
-- người khác vào một con số mang tên mình — và người đọc không có cách nào biết.
-- =============================================================================

ALTER TABLE rpt.policy_row
  ADD COLUMN IF NOT EXISTS so_lan_tbp_tra_lai int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sua_lai_ngay       numeric(6,2);

COMMENT ON COLUMN rpt.policy_row.so_lan_tbp_tra_lai IS
  'Số lần Trưởng bộ phận trả lại hồ sơ này (hành động TBP_RETURN). 0 = ký thẳng (0094).';
COMMENT ON COLUMN rpt.policy_row.sua_lai_ngay IS
  'Trung bình số ngày từ mỗi lần bị trả lại tới lần gửi lại kế tiếp. NULL khi chưa từng bị trả (0094).';

-- Không thêm chỉ mục: hai cột này chỉ xuất hiện trong phép gom nhóm theo TDV,
-- mà phép ấy luôn bắt đầu bằng mệnh đề phạm vi — `ix_rpt_scope` và ba chỉ mục
-- người của `0031` dẫn đường. Cùng lý do đã ghi ở `0093`.

-- --- Chép cho dữ liệu đã có --------------------------------------------------
--
-- Đọc thẳng `pol.policy_event` MỘT LẦN ở migration (chạy bằng role `postgres`,
-- không phải `csbh_rpt`) thay vì chờ từng hồ sơ đi qua `SyncService`. Hồ sơ đã
-- có hiệu lực từ tháng trước thì không sự kiện nào kéo nó qua đồng bộ nữa, mà
-- chính những hồ sơ ấy mới làm nên phần lịch sử của biểu đồ.
WITH tra_lai AS (
  SELECT policy_id, count(*)::int AS so_lan
    FROM pol.policy_event
   WHERE action = 'TBP_RETURN'
   GROUP BY policy_id
),
-- Ghép mỗi lần TRẢ LẠI với lần GỬI LẠI kế tiếp của cùng hồ sơ. `LATERAL` lấy
-- đúng sự kiện gửi lại gần nhất SAU nó; lần trả lại cuối cùng mà chưa gửi lại
-- thì không ghép được và bị loại khỏi trung bình — đúng nghĩa: nó chưa kết thúc.
cap AS (
  SELECT e.policy_id,
         EXTRACT(EPOCH FROM (g.at - e.at)) / 86400 AS ngay
    FROM pol.policy_event e
    JOIN LATERAL (
      SELECT at FROM pol.policy_event g2
       WHERE g2.policy_id = e.policy_id
         AND g2.action = 'RESUBMIT_AFTER_EDIT'
         AND g2.at > e.at
       ORDER BY g2.at
       LIMIT 1
    ) g ON true
   WHERE e.action = 'TBP_RETURN'
),
sua AS (
  SELECT policy_id, avg(ngay)::numeric(6,2) AS ngay FROM cap GROUP BY policy_id
)
UPDATE rpt.policy_row r
   SET so_lan_tbp_tra_lai = coalesce(t.so_lan, 0),
       sua_lai_ngay       = s.ngay
  FROM tra_lai t
  LEFT JOIN sua s ON s.policy_id = t.policy_id
 WHERE r.policy_id = t.policy_id;
