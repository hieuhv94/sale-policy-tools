-- `0197` — MỘT KHÁCH HÀNG CHỈ CÓ MỘT BẢN NHÁP.
--
-- Khách hàng chốt 10/09: *"để tránh spam tạo quá nhiều bản Nháp đối với 1 khách
-- hàng, chỉ cho phép có 1 bản Nháp đối với cùng 1 khách hàng"*. Chọn khách đã có
-- Nháp thì phần mềm nói ra và đưa thẳng vào bản Nháp ấy.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO PHẢI CÓ RÀNG BUỘC Ở CSDL, KHÔNG CHỈ MỘT PHÉP KIỂM Ở SERVICE
-- ---------------------------------------------------------------------------
--
-- Phép kiểm ở `create` là một lượt `SELECT` rồi một lượt `INSERT`, và giữa hai
-- lượt ấy có một khe. Khe này KHÔNG phải chuyện lý thuyết ở đây: kịch bản sinh
-- ra cả yêu cầu này là người dùng bấm nút nhiều lần — bấm đúp *Lập hồ sơ* là hai
-- request song song, cả hai đọc thấy "chưa có Nháp nào", cả hai ghi. Chốt chặn
-- duy nhất đóng được khe ấy là ràng buộc của CSDL.
--
-- CHỈ `NHAP`, không tính `YEU_CAU_CHINH_SUA`. Hai trạng thái ấy cùng nằm trong
-- `SUA_DUOC` nên rất dễ gộp, và gộp là sai: `YEU_CAU_CHINH_SUA` không phải một
-- bản nháp mới lập — nó là một hồ sơ ĐÃ vào luồng duyệt rồi bị trả về, và cấm
-- lập thêm ở đó nghĩa là cấm TDV lập phiên bản mới cho một khách đang có hồ sơ
-- bị trả lại. Đó là một luật khác hẳn, không ai yêu cầu.
--
-- Chỉ mục PHẦN nên hồ sơ rời khỏi `NHAP` là chỗ tự trống ra: gửi duyệt, hay xoá.

-- Nói ra TRƯỚC khi tạo chỉ mục, kèm danh sách (khuôn `0114`). Một lượt
-- `CREATE UNIQUE INDEX` vấp dữ liệu cũ chỉ ném ra tên chỉ mục và một uuid khách
-- hàng — người vận hành đọc nó giữa lúc nâng cấp không biết phải mở hồ sơ nào.
--
-- DỪNG chứ không tự dọn: hệ thống KHÔNG chọn hộ được bản nháp nào đáng giữ. Hai
-- bản nháp của cùng một khách là hai lượt soạn thật của một người thật, và chỉ
-- chính TDV ấy biết bản nào là bản họ đang làm. Xoá bản nháp là quyền của TDV
-- (`0099`), nên đường sửa nằm sẵn trên màn hình chứ không phải trong CSDL.
--
-- In MÃ VÀ TÊN KHÁCH HÀNG, không in `customer_id`. Bản đầu của migration này in
-- uuid — chạy thử ra ba dòng uuid kèm ba mã hồ sơ, và người vận hành cầm nó
-- không tra được khách nào nếu không tự viết một câu SQL nữa. Đúng cái mà cả
-- khối `DO` này sinh ra để tránh.
DO $$
DECLARE ds text;
BEGIN
  SELECT string_agg(t.kh || ': ' || t.ma, E'\n  ' ORDER BY t.kh)
    INTO ds
    FROM (SELECT coalesce(k.code, p.customer_id::text) || ' — ' ||
                 coalesce(k.name, '(không tra được tên)') AS kh,
                 string_agg(p.code, ', ' ORDER BY p.created_at) AS ma
            FROM pol.policy p
            LEFT JOIN cus.customer k ON k.id = p.customer_id
           WHERE p.status = 'NHAP'
           GROUP BY k.code, k.name, p.customer_id HAVING count(*) > 1) t;
  IF ds IS NOT NULL THEN
    RAISE EXCEPTION E'Còn khách hàng có NHIỀU HƠN MỘT bản Nháp, không tạo được ràng buộc duy nhất.\n'
      'Trình dược viên phụ trách phải xoá bớt, giữ lại đúng một bản, rồi chạy lại:\n  %', ds;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_nhap_moi_khach
  ON pol.policy (customer_id) WHERE status = 'NHAP';
