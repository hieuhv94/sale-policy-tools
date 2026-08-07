-- =============================================================================
-- 0013_sla — Hạn xử lý 14 ngày, nhắc trước một ngày, và quá hạn (YCNV muc 9.1).
--
-- SỬA LẠI MỘT QUYẾT ĐỊNH SAI CỦA CHÍNH MIGRATION 0010.
--
-- 0010 dựng `ntf.reminder` với lý lẽ "để sla-worker ở chặng sau không phải kèm
-- migration riêng". Lý lẽ đó bỏ qua ranh giới sở hữu dữ liệu ở AD-02:
-- `sla-worker` chạy dưới role `csbh_pol` (nó đọc pol.policy để biết hồ sơ nào
-- quá hạn), mà `csbh_pol` KHÔNG có quyền ghi vào schema ntf. Bảng đó nằm ở chỗ
-- không ai ghi vào được. Chuyển sang `pol.sla_reminder` và bỏ bảng cũ đi — nó
-- chưa từng có một dòng nào.
--
-- Bài học đáng giữ: "để sẵn cho chặng sau" là lúc dễ đặt bảng nhầm schema nhất,
-- vì lúc đó chưa có mã nào chạm vào nó để mà lộ ra.
-- =============================================================================

DROP TABLE IF EXISTS ntf.reminder;

-- Số ngày SLA cấu hình được (muc 2.7). ĐÚNG MỘT DÒNG, cưỡng chế bằng khoá chính
-- hằng số: bảng cấu hình có hai dòng là bảng cấu hình không ai biết dòng nào thật.
CREATE TABLE IF NOT EXISTS pol.sla_config (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  days       int NOT NULL CHECK (days BETWEEN 1 AND 365),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO pol.sla_config (id, days) VALUES (true, 14) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE pol.sla_config IS
  'SLA tính cả cuối tuần — không có lịch làm việc, không trừ ngày lễ (muc 9.1)';

-- Chống gửi nhắc trùng. Khoá chính (hồ sơ, loại, ngày) là thứ làm cho vòng quét
-- idempotent: cron chạy 5 phút một lần nên trong ngày thứ 13 nó gặp cùng một hồ
-- sơ tới 288 lần, và sla-worker restart giữa chừng cũng không gửi lại (NTF-09,
-- NTF-14). Chặn ở tầng CSDL chứ không ở bộ nhớ tiến trình — bộ nhớ mất khi restart.
CREATE TABLE IF NOT EXISTS pol.sla_reminder (
  policy_id uuid NOT NULL REFERENCES pol.policy(id) ON DELETE CASCADE,
  kind      text NOT NULL,
  for_date  date NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_id, kind, for_date)
);

-- Thời điểm hồ sơ BẮT ĐẦU chờ ở bước hiện tại.
--
-- Không suy ra được từ `sla_due_at` khi số ngày SLA đổi giữa chừng: hạn mới phải
-- tính từ lúc bắt đầu chờ cộng N ngày, chứ không phải hạn cũ cộng thêm chênh
-- lệch — hai cách cho ra kết quả khác nhau nếu SLA đổi hai lần (NTF-12).
ALTER TABLE pol.policy ADD COLUMN IF NOT EXISTS sla_started_at timestamptz;

-- Hồ sơ đang chờ sẵn có (dựng trước migration này) thì lấy mốc gần đúng: hạn
-- hiện tại trừ đi số ngày đang cấu hình.
UPDATE pol.policy
   SET sla_started_at = sla_due_at - ((SELECT days FROM pol.sla_config) || ' days')::interval
 WHERE sla_due_at IS NOT NULL AND sla_started_at IS NULL;

-- --- Dọn dữ liệu hết vòng đời ------------------------------------------------
--
-- `sys.run_retention()` xoá ở idn, cat, cus và pol. Không role service nào có
-- quyền trên cả bốn schema đó — đúng như AD-02 muốn — nên hàm phải chạy dưới
-- quyền CHỦ SỞ HỮU của nó. Thiếu bước này thì "sla-worker gọi mỗi ngày" ở bản
-- thiết kế là câu không thực hiện được: lời gọi trả về lỗi 42501 ngay dòng đầu.
--
-- `search_path` cố định là bắt buộc với mọi hàm SECURITY DEFINER: không có nó,
-- người gọi đặt `search_path` riêng có thể trỏ tên bảng sang bảng của họ và hàm
-- sẽ xoá nhầm dưới quyền superuser.
ALTER FUNCTION sys.run_retention(int, int) SECURITY DEFINER;
ALTER FUNCTION sys.run_retention(int, int) SET search_path = pg_catalog, sys, idn, cat, cus, pol, aud;

REVOKE EXECUTE ON FUNCTION sys.run_retention(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sys.run_retention(int, int) TO csbh_pol;
