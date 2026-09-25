-- `0220` — MỖI KHÁCH HÀNG CHỈ CÓ MỘT HỒ SƠ ĐANG XỬ LÝ.
--
-- Khách hàng chốt 25/09: *"mỗi khách hàng chỉ được có một CSBH tại một thời
-- điểm, không tính đến các CSBH đang có hiệu lực, đã xoá, hết hiệu lực"*. Hỏi
-- lại về `QUA_HAN_DUYET` (không nằm trong câu): KHÔNG tính — nó là trạng thái
-- kết thúc, không ai thao tác được, và tính nó là khoá khách ấy tới 3 ngày.
--
-- Tập được tính là SÁU trạng thái, đúng bằng `CHUA_DUYET_XONG` ở
-- `policies.service.ts`. Vị từ của chỉ mục phải liệt kê chúng thành chữ, nên
-- có một ca kiểm đọc `pg_indexes` rồi đối chiếu với hằng ấy — hai bản của cùng
-- một tập là hai bản sẽ trôi khỏi nhau ở lượt thêm trạng thái kế tiếp.
--
-- THAY `uq_policy_nhap_moi_khach` (`0197`), không đứng cạnh nó. Chỉ mục mới phủ
-- trọn chỉ mục cũ (`NHAP` là một trong sáu), nên giữ cả hai là hai tên ràng buộc
-- cho cùng một lượt vi phạm — và khối `catch` ở `create` đối chiếu TÊN ràng
-- buộc, nên bản nào nổ trước sẽ quyết định câu lỗi.
--
-- Vì sao phải có ở CSDL: xem `0118` — bấm đúp là hai request song song, và chỉ
-- ràng buộc của CSDL đóng được khe giữa lượt `SELECT` và lượt `INSERT`. Ở đây
-- còn thêm một đường thứ hai qua khe ấy: KHÔNG có đường nào đưa một hồ sơ TỪ
-- ngoài tập VÀO tập (mọi hồ sơ vào tập bằng `INSERT` ở trạng thái `NHAP`), nên
-- chỉ mục chỉ có thể nổ ở `create` — đúng chỗ đã có xử lý.

-- DỪNG chứ không tự dọn, in MÃ VÀ TÊN KHÁCH HÀNG kèm trạng thái từng hồ sơ
-- (khuôn `0118`). Hệ thống không chọn hộ được hồ sơ nào đáng giữ: hai hồ sơ đang
-- chờ duyệt của cùng một khách có thể cùng đã qua chữ ký thật.
DO $$
DECLARE ds text;
BEGIN
  SELECT string_agg(t.kh || ': ' || t.ma, E'\n  ' ORDER BY t.kh)
    INTO ds
    FROM (SELECT coalesce(k.code, p.customer_id::text) || ' — ' ||
                 coalesce(k.name, '(không tra được tên)') AS kh,
                 string_agg(p.code || ' (' || p.status::text || ')', ', ' ORDER BY p.created_at) AS ma
            FROM pol.policy p
            LEFT JOIN cus.customer k ON k.id = p.customer_id
           WHERE p.status::text IN ('NHAP', 'YEU_CAU_CHINH_SUA', 'CHO_TBP_DUYET',
                                    'CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2')
           GROUP BY k.code, k.name, p.customer_id HAVING count(*) > 1) t;
  IF ds IS NOT NULL THEN
    RAISE EXCEPTION E'Còn khách hàng có NHIỀU HƠN MỘT hồ sơ CSBH chưa duyệt xong, không tạo được ràng buộc duy nhất.\n'
      'Mỗi khách chỉ giữ lại đúng một hồ sơ: trình dược viên xoá bản Nháp/bản bị trả về thừa, '
      'hoặc duyệt xong một bản, rồi chạy lại:\n  %', ds;
  END IF;
END $$;

DROP INDEX IF EXISTS pol.uq_policy_nhap_moi_khach;

CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_dang_do_moi_khach
  ON pol.policy (customer_id)
  WHERE status IN ('NHAP', 'YEU_CAU_CHINH_SUA', 'CHO_TBP_DUYET',
                   'CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2');
