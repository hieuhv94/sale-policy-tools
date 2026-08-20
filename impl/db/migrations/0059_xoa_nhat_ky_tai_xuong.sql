-- 0059 — Xoá hẳn những dòng lịch sử TẢI BẢN MỀM và TẢI HỢP ĐỒNG.
--
-- Khách hàng bỏ yêu cầu ghi lịch sử cho hai loại văn bản này ngày 20/08 (xem
-- `daSinhVanBan` ở `policy/internal.controller.ts`). Mã đã ngừng ghi; migration
-- này dọn những dòng ĐÃ ghi.
--
-- VÌ SAO XOÁ CHỨ KHÔNG ĐỂ LẠI. Bản trước tôi chọn để lại, với lý do "nhật ký
-- chỉ ghi thêm, và những lượt tải ấy có thật". Lý do đó đúng cho một hệ thống
-- ĐANG CHẠY THẬT — nhưng phần mềm này chưa bàn giao, và mọi dòng như thế đều
-- sinh ra từ bộ nạp demo hoặc từ chính các lượt chạy kiểm thử. Giữ lại nghĩa là
-- màn hình *Lịch sử* của bản demo bày ra một loại dòng mà phần mềm không còn
-- sinh nữa, và người xem demo không có cách nào biết đó là dấu vết của một yêu
-- cầu đã bỏ.
--
-- Ràng buộc "chỉ ghi thêm" của AUD-03/04 nằm ở `aud.audit_log`, không nằm ở
-- bảng này — nên câu lệnh dưới chạy được, và nó KHÔNG phá lời hứa nào: nhật ký
-- kiểm toán toàn hệ thống vẫn nguyên vẹn.
DELETE FROM pol.policy_event WHERE action IN ('TAI_HO_SO', 'TAI_HOP_DONG');

/*
 * `seq` sau khi xoá sẽ THỦNG LỖ, và để nguyên là đúng.
 *
 * `seq` là số thứ tự để SẮP XẾP và để chống chen ngang (`UNIQUE (policy_id,
 * seq)`), không phải một phép đếm mà ai đó đọc ra. Màn hình sắp theo nó rồi
 * hiển thị thời điểm, không hiển thị con số.
 *
 * Đánh số lại thì phải UPDATE mọi dòng của mọi hồ sơ — nhiều rủi ro hơn hẳn cái
 * nó chữa, và `coalesce(max(seq),0)+1` vẫn cấp đúng số tiếp theo dù có lỗ.
 */

-- Nhãn của hai hành động này cũng đã gỡ khỏi giao diện (`apps/web/src/lib/format.ts`).
-- Còn sót một dòng nào mang chúng thì màn hình sẽ in ra chính mã hành động —
-- xấu, nhưng không sai. Câu DELETE trên là thứ giữ cho chuyện đó không xảy ra.
