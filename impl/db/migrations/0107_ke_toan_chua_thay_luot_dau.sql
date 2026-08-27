-- `0142` — KẾ TOÁN CHƯA THẤY HỒ SƠ Ở LƯỢT CHỜ TBP ĐẦU TIÊN.
--
-- Khách hàng chốt 27/08: *"Kế toán không nhìn thấy được các hồ sơ đang trong
-- trạng thái chờ TBP duyệt lần đầu tiên, nếu hồ sơ bị trả lại từ các bước sau
-- thì vẫn thấy"*.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO KHÔNG SUY ĐƯỢC TỪ THỨ ĐÃ CÓ
-- ---------------------------------------------------------------------------
--
-- Câu hỏi cần trả lời là *"hồ sơ này đã từng đi qua Trưởng bộ phận chưa"*. Bốn
-- ứng viên có sẵn, và không cái nào trả lời được:
--
--   `tbp_signed_at`      BỊ XOÁ mỗi lần hồ sơ quay về `YEU_CAU_CHINH_SUA`
--                        (`0101`) — và đó là đúng, nó trả lời một câu KHÁC:
--                        *"có chữ ký nào đang có hiệu lực không"*.
--   `kt_l1_received_at`  vẫn NULL khi Kế toán trả lại ở bước L1 — mà đó chính
--                        là một trong những ca phải thấy.
--   `so_lan_tbp_tra_lai` đếm lượt TBP trả về, không đếm lượt TBP KÝ.
--   `returned_at`        không nói ai trả.
--
-- Nên thêm một cột, và điều đáng ghi nhất về nó là: **`da_qua_tbp` KHÔNG BAO GIỜ
-- bị xoá.** Nó khác `tbp_signed_at` ở đúng chỗ ấy, và hai cột cạnh nhau trả lời
-- hai câu hỏi ngược nhau về thời gian:
--
--   `tbp_signed_at`  — BÂY GIỜ có chữ ký không?   (xoá khi trả về)
--   `da_qua_tbp`     — ĐÃ TỪNG ký chưa?           (không bao giờ xoá)
--
-- Ai đó "dọn dẹp" bằng cách xoá nó cùng chỗ với ba cột chữ ký sẽ làm Kế toán mất
-- lại quyền đọc những hồ sơ họ đã trả về — lặng lẽ, và không ca kiểm nào của
-- lượt trả về đỏ lên.
--
-- ---------------------------------------------------------------------------
-- HAI BẢNG, VÌ PHẠM VI ĐƯỢC HỎI Ở HAI CHỖ
-- ---------------------------------------------------------------------------
--
-- `pol.policy`     — màn hình *Hồ sơ CSBH* và lượt mở một hồ sơ.
-- `rpt.policy_row` — màn hình *Tổng quan* và *Thống kê*, đọc từ bản sao đọc.
--
-- `filter.ts` bên `reporting` chép lại mệnh đề phạm vi của `policy` và có sẵn
-- một chú thích: *"hai chỗ phải trả lời giống hệt nhau, nếu không thì một hồ sơ
-- mở được ở màn hình Hồ sơ mà biến mất khỏi Báo cáo"*. Thêm luật này vào một bên
-- là dựng ra đúng cái lệch ấy, chỉ theo chiều ngược: một hồ sơ đếm được ở Tổng
-- quan mà mở ra thì 403.

ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS da_qua_tbp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pol.policy.da_qua_tbp IS
  'Hồ sơ ĐÃ TỪNG được TBP ký (0142). KHÔNG BAO GIỜ xoá — khác tbp_signed_at, '
  'cột kia bị xoá mỗi lượt trả về. Kế toán chỉ thấy hồ sơ ở CHO_TBP_DUYET khi '
  'cột này đã true.';

-- Dữ liệu cũ: đọc từ nhật ký, nguồn duy nhất còn giữ được sự thật ấy sau khi
-- `tbp_signed_at` đã bị xoá ở những hồ sơ từng bị trả về.
UPDATE pol.policy p
   SET da_qua_tbp = true
 WHERE EXISTS (SELECT 1 FROM pol.policy_event e
                WHERE e.policy_id = p.id AND e.action = 'TBP_SIGN');

ALTER TABLE rpt.policy_row
  ADD COLUMN IF NOT EXISTS da_qua_tbp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN rpt.policy_row.da_qua_tbp IS
  'Bản sao của pol.policy.da_qua_tbp (0142) — phạm vi của Kế toán phải giống '
  'nhau ở màn hình Hồ sơ và ở Tổng quan/Thống kê.';

-- `rpt.policy_row` là bản sao đọc, dựng lại được từ nguồn — nhưng dựng lại cả
-- bảng là một lượt đồng bộ dài, nên chép thẳng cột vừa tính ở trên.
UPDATE rpt.policy_row r
   SET da_qua_tbp = p.da_qua_tbp
  FROM pol.policy p
 WHERE p.id = r.policy_id;
