-- =============================================================================
-- 0035_tdv_xoa_ho_so — trạng thái thứ 12: `DA_XOA`.
--
-- --- Vấn đề ------------------------------------------------------------------
--
-- Tới trước tệp này, TDV chỉ xoá được hồ sơ ở `NHAP`. Hồ sơ bị trả lại — Trưởng
-- bộ phận yêu cầu chỉnh sửa, hoặc Kế toán không tiếp nhận ở L1 hay L2 — đều rơi
-- về `YEU_CAU_CHINH_SUA`, và ở đó người lập chỉ có đúng một đường đi tiếp: sửa
-- rồi gửi lại. Không có đường bỏ.
--
-- Hệ quả là những hồ sơ KHÔNG BAO GIỜ được gửi lại (khách đổi ý, lập nhầm khách,
-- đã có bản khác thay thế) nằm mãi trong hộp việc của chính người lập, và trong
-- ô "Yêu cầu chỉnh sửa" của mọi báo cáo tỷ lệ trả lại.
--
-- --- Hai kết cục, chia theo "đã từng vào luồng chưa" --------------------------
--
--   * `NHAP` → XOÁ HẲN dòng, không để lại vết. Hồ sơ chưa gửi duyệt thì chưa ai
--     ngoài người lập nhìn thấy nó; giữ lại một dòng "đã xoá" cho mỗi lần lập
--     nhầm là biến nhật ký thành bãi rác, và người lập sẽ ngại lập nháp. Đây là
--     hành vi CŨ, giữ nguyên.
--   * `YEU_CAU_CHINH_SUA` → `DA_XOA`, và ghi vào `pol.policy_event` đúng như
--     `TU_CHOI`. Hồ sơ này ĐÃ đi qua tay người khác: có người đã đọc nó, đã trả
--     nó lại kèm lý do. Xoá sạch dấu vết là làm biến mất cả việc của họ.
--
-- Cùng một nút trên màn hình, cùng một lời gọi `DELETE /policies/:id` — người
-- dùng không chọn giữa hai kết cục, hệ thống chọn theo trạng thái. Cùng nếp với
-- `0034` (xoá khách hàng).
--
-- --- Vì sao KHÔNG có luật nào trong máy trạng thái ----------------------------
--
-- `DA_XOA` là trạng thái, không phải một bước duyệt. Thêm nó vào `RULES` của
-- `@csbh/domain-policy` sẽ làm `allowedActions('YEU_CAU_CHINH_SUA')` mọc thêm
-- một hành động, và giao diện bày nó ra giữa dải nút *Thao tác* — cạnh "Gửi lại
-- duyệt" — trong khi xoá là thứ phải đứng riêng, cách xa, và phải gõ lại mã hồ
-- sơ mới chạy. Đường xoá vẫn là `DELETE /policies/:id`, một đường duy nhất.
-- =============================================================================

-- --- 1. Giá trị thứ 12 của enum ----------------------------------------------
--
-- `ADD VALUE` chạy được trong transaction từ PG 12, nhưng giá trị mới KHÔNG dùng
-- được trong chính transaction đó. Cả tệp này chạy dưới `--single-transaction`
-- (xem `scripts/migrate.sh`), nên bên dưới không có câu nào so sánh với
-- `'DA_XOA'` ở dạng enum — hàm trigger so bằng `::text` chính vì lẽ đó.
ALTER TYPE pol.policy_status ADD VALUE IF NOT EXISTS 'DA_XOA';

-- --- 2. Bất biến 3 mở rộng: hai trạng thái kết thúc, không phải một -----------
--
-- Hồ sơ `DA_XOA` giữ nguyên lịch sử của nó, nên xoá hẳn dòng là xoá luôn phần
-- nhật ký mà cả tệp này sinh ra để giữ (`policy_event` có `ON DELETE CASCADE`).
-- Đường API đã không cho — `remove()` chỉ nhận hai trạng thái sửa được — còn đây
-- là chốt cuối, đúng chỗ với ba bất biến kia: ở CSDL.
--
-- TÊN GIỮ NGUYÊN `forbid_delete_rejected` / `trg_forbid_delete_rejected` dù giờ
-- nó chặn hai trạng thái. Đổi tên là sửa `seed-demo.ts`, bốn tệp test và một
-- phép khẳng định đọc thẳng `pg_trigger.tgname` — đổi lấy đúng một từ trong tên.
CREATE OR REPLACE FUNCTION pol.forbid_delete_rejected() RETURNS trigger AS $$
BEGIN
  IF OLD.status::text IN ('TU_CHOI', 'DA_XOA') THEN
    RAISE EXCEPTION 'Ho so o trang thai % khong the xoa (YCNV muc 4)', OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION pol.forbid_delete_rejected() IS
  'Chặn xoá hồ sơ ở hai trạng thái kết thúc: TU_CHOI (muc 4) và DA_XOA (0035).';
