-- =============================================================================
-- 0046 — Thư nhắc "sắp quá hạn" gửi ĐÚNG MỘT LẦN cho mỗi lần chờ.
--
-- Lỗi đang sửa: khoá chống trùng là `(hồ sơ, loại, NGÀY GỬI)`, mà cửa sổ nhắc
-- rộng đúng 24 giờ. Một khoảng 24 giờ luôn vắt qua một ranh giới ngày — trừ
-- đúng trường hợp hạn rơi chính xác vào nửa đêm — nên sang ngày mới là khoá mở
-- lại và người nhận được lá thư thứ hai nói y hệt lá thứ nhất.
--
--   Hạn 15/08 15:00 (giờ VN)
--     14/08 15:05 → nhắc lần 1, khoá theo ngày 14/08 (UTC)
--     15/08 07:05 → nhắc lần 2, khoá theo ngày 15/08 (UTC)   ← thừa
--     15/08 15:05 → chuyển Quá hạn duyệt
--
-- ĐỔI MÚI GIỜ KHÔNG CỨU ĐƯỢC. Ý đầu tiên là lấy ngày theo giờ Việt Nam thay vì
-- UTC, nhưng ranh giới chỉ dời đi chứ không biến mất: cửa sổ vẫn rộng 24 giờ và
-- vẫn cắt qua một nửa đêm nào đó. Bất kỳ khoá nào theo NGÀY đều hỏng như nhau.
--
-- Khoá đúng là MỐC HẠN của chính lần chờ ấy. Nó nhận diện được "lần chờ này",
-- điều mà một ngày lịch không làm được, và nó xử đúng cả ba tình huống:
--
--   * Cửa sổ 24 giờ vắt qua nửa đêm → vẫn một mốc hạn → một thư.
--   * Hồ sơ bị trả lại rồi gửi lại TRONG CÙNG NGÀY → hai mốc hạn khác nhau (khác
--     nhau ở giờ, dù trùng ngày) → lần chờ mới có thư nhắc riêng. Khoá theo ngày
--     hạn cũng hỏng chỗ này: nó sẽ NUỐT MẤT lá thư của lần chờ thứ hai.
--   * Quản trị đổi số ngày SLA, hạn được tính lại → mốc mới → nhắc lại. Đúng: lá
--     thư cũ nói về một cái hạn không còn tồn tại nữa.
-- =============================================================================

ALTER TABLE pol.sla_reminder ADD COLUMN IF NOT EXISTS due_at timestamptz;

-- Hồ sơ còn đang chờ thì lấy đúng hạn hiện tại của nó — nhờ vậy hồ sơ đã được
-- nhắc hôm nay KHÔNG bị nhắc lại sau khi triển khai bản này. Hồ sơ đã đi tiếp
-- thì hàng này chỉ còn là dấu vết, lấy `sent_at` cho có giá trị duy nhất.
UPDATE pol.sla_reminder r
   SET due_at = coalesce(p.sla_due_at, r.sent_at)
  FROM pol.policy p
 WHERE p.id = r.policy_id AND r.due_at IS NULL;

UPDATE pol.sla_reminder SET due_at = sent_at WHERE due_at IS NULL;

-- Dọn đúng những hàng do CHÍNH lỗi này sinh ra: hai lần nhắc cho cùng một mốc
-- hạn, khác nhau mỗi cái ngày. Không dọn thì khoá chính mới không tạo được.
DELETE FROM pol.sla_reminder a
 USING pol.sla_reminder b
 WHERE a.policy_id = b.policy_id
   AND a.kind = b.kind
   AND a.due_at = b.due_at
   AND (a.sent_at, a.for_date) > (b.sent_at, b.for_date);

ALTER TABLE pol.sla_reminder ALTER COLUMN due_at SET NOT NULL;
ALTER TABLE pol.sla_reminder DROP CONSTRAINT IF EXISTS sla_reminder_pkey;
ALTER TABLE pol.sla_reminder ADD PRIMARY KEY (policy_id, kind, due_at);
ALTER TABLE pol.sla_reminder DROP COLUMN IF EXISTS for_date;

COMMENT ON COLUMN pol.sla_reminder.due_at IS
  'Mốc hạn của lần chờ đã nhắc. Khoá chống trùng — xem 0046, KHÔNG đổi về ngày lịch.';
