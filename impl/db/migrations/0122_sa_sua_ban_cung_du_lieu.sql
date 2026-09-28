-- `0225` — TRẠNG THÁI MỚI *SA sửa bản cứng*, phần 2/2 (giá trị enum ở `0121`).
--
-- ---------------------------------------------------------------------------
-- VÌ SAO MỐC `reprint_requested_at` GỠ HẲN
-- ---------------------------------------------------------------------------
--
-- `0045` đặt mốc ấy để trả lời *"hồ sơ ở Sale Admin là làm bản cứng lần đầu hay
-- làm LẠI"*, và ghi rõ vì sao không dùng trạng thái: trạng thái nói hồ sơ ĐANG Ở
-- ĐÂU, còn khác biệt ở đây là nó TỚI ĐÓ BẰNG ĐƯỜNG NÀO. Khách hàng giờ muốn đúng
-- khác biệt ấy hiện ở MỌI nơi nhãn trạng thái hiện — danh sách, trang hồ sơ, thư
-- báo, bộ lọc — mà những nơi ấy chỉ đọc trạng thái. Nên trạng thái gánh nó, và
-- để mốc sống song song là hai câu trả lời cho một câu hỏi (`0085`).
--
-- MỐC CŨ CÒN MỘT LỖ, đóng theo: bất biến của `0045` là *"mốc chỉ tồn tại trong
-- lúc hồ sơ ở Sale Admin — đặt khi vào bằng B10C, xoá khi ra bằng B9"*, và chú
-- thích tại chỗ viết *"không có hành động nào khác đi ra khỏi SA_DANG_XU_LY"*.
-- `0185` thêm *Hoàn duyệt* từ đúng trạng thái ấy mà không dọn mốc — nên hồ sơ bị
-- hoàn duyệt giữa lúc sửa bản cứng, gửi lại, đi tới B8 lần sau, vẫn đếm vào thẻ
-- *Lỗi bản cứng*. Một trạng thái thì không có gì để quên dọn.

-- --- 1. Dời hồ sơ đang sửa bản cứng sang trạng thái mới ---------------------
--
-- CHẠY LẠI ĐƯỢC: chỉ dời khi cột còn. Tệp này có thể gặp một CSDL mà bước 3 đã
-- chạy (lượt thử tay trên CSDL demo khi soạn `0225` không ghi vào
-- `sys.schema_migration`), và khi ấy câu `UPDATE` trần dừng cả `migrate` với
-- *"column does not exist"*. `EXECUTE` vì một câu viết thẳng sẽ bị Postgres
-- phân tích — và báo lỗi cột — ngay cả khi nhánh `IF` không chạy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'pol' AND table_name = 'policy'
                AND column_name = 'reprint_requested_at') THEN
    EXECUTE $q$UPDATE pol.policy SET status = 'SA_SUA_BAN_CUNG'
                WHERE status = 'SA_DANG_XU_LY' AND reprint_requested_at IS NOT NULL$q$;
  END IF;
END $$;

-- Nhật ký kể theo trạng thái MỚI: lượt `KT_REQUEST_REPRINT` nào cũng đưa hồ sơ
-- tới `SA_SUA_BAN_CUNG`, và lượt kế tiếp của cùng hồ sơ đi ra từ đó. Giữ tên cũ
-- thì dòng thời gian của một hồ sơ nói nó rời khỏi một trạng thái nó chưa từng
-- tới (cùng lối `0110` viết lại nhật ký khi bỏ `TU_CHOI`).
UPDATE pol.policy_event SET to_status = 'SA_SUA_BAN_CUNG'
 WHERE action = 'KT_REQUEST_REPRINT' AND to_status = 'SA_DANG_XU_LY';

UPDATE pol.policy_event e
   SET from_status = 'SA_SUA_BAN_CUNG'
  FROM (SELECT id, lag(action) OVER (PARTITION BY policy_id ORDER BY seq) AS truoc
          FROM pol.policy_event) t
 WHERE t.id = e.id AND t.truoc = 'KT_REQUEST_REPRINT' AND e.from_status = 'SA_DANG_XU_LY';

-- --- 2. Mỗi khách một hồ sơ đang xử lý — tập ấy thêm một trạng thái ----------
--
-- Vị từ gõ lại tập `CHUA_DUYET_XONG` của `policies.service.ts` thành chữ; có ca
-- kiểm đối chiếu hai bên qua `pg_indexes`. Dựng lại, không `ALTER`: Postgres
-- không sửa được vị từ của một chỉ mục phần.
DROP INDEX IF EXISTS pol.uq_policy_dang_do_moi_khach;
CREATE UNIQUE INDEX uq_policy_dang_do_moi_khach
    ON pol.policy (customer_id)
 WHERE status IN ('NHAP', 'YEU_CAU_CHINH_SUA', 'CHO_TBP_DUYET', 'CHO_KT_L1',
                  'SA_DANG_XU_LY', 'SA_SUA_BAN_CUNG', 'CHO_KT_L2');

-- --- 3. Gỡ mốc cũ ở cả nguồn lẫn read-model ---------------------------------
DROP INDEX IF EXISTS rpt.ix_rpt_policy_row_reprint;
ALTER TABLE rpt.policy_row DROP COLUMN IF EXISTS reprint_requested_at;
ALTER TABLE pol.policy     DROP COLUMN IF EXISTS reprint_requested_at;
