-- `0138` — CÔNG NỢ THÔI LÀ MỘT SỐ TIỀN. Nó là một ĐIỀU KHOẢN thanh toán.
--
-- Khách hàng chốt 27/08: ba lựa chọn, và lựa chọn thứ ba cho gõ tự do.
--
--   1. Thanh toán sau khi nhận hàng
--   2. Thanh toán gối đơn, công nợ không quá 90 ngày
--   3. Khác — người dùng tự nhập nội dung
--
-- ---------------------------------------------------------------------------
-- VÌ SAO HAI CỘT, KHÔNG PHẢI MỘT
-- ---------------------------------------------------------------------------
--
-- `debt_term` giữ MÃ của điều khoản, `debt_note` giữ phần gõ tay của lựa chọn
-- *Khác*. Gộp làm một cột chữ thì mất khả năng phân biệt "khách này chọn phương
-- án 2" với "khách này gõ tay đúng câu của phương án 2" — hai chuyện khác nhau
-- ngay khi ai đó muốn đếm xem bao nhiêu khách đang gối đơn.
--
-- `debt_note` chỉ có nghĩa khi `debt_term = 'KHAC'`. Ràng buộc ấy đặt ở service
-- chứ không ở CHECK: câu báo lỗi phải chỉ đúng vào ô nhập nào trên màn hình
-- (`0088`), mà một `CHECK` vi phạm ra `23514` — mã lỗi không nói được ô nào.
--
-- ---------------------------------------------------------------------------
-- CỘT `debt` CŨ BỊ GỠ, VÀ SỐ TIỀN TRONG ĐÓ MẤT THEO
-- ---------------------------------------------------------------------------
--
-- Không có phép chuyển đổi nào đúng: `4.500.000 đồng` không nói được khách ấy
-- thanh toán sau khi nhận hàng hay gối đơn 90 ngày. Giữ lại cột thì nó thành một
-- con số không ai đọc được nữa mà vẫn nằm đó, và người đọc lược đồ sáu tháng sau
-- sẽ tưởng nó còn dùng.
--
-- Mọi khách hàng nhận `SAU_NHAN_HANG` — phương án 1, thận trọng nhất trong ba:
-- nó KHÔNG cho nợ. Đoán sai theo hướng ấy thì Trình dược viên sửa lại; đoán sai
-- theo hướng ngược lại là in ra một tờ CSBH cho nợ 90 ngày mà không ai đồng ý.
--
-- Hệ quả vận hành, nói ra để đừng bất ngờ: **bản chạy thử đã nhập công nợ bằng
-- số phải khai lại điều khoản cho từng khách hàng.**

ALTER TABLE cus.customer
  ADD COLUMN IF NOT EXISTS debt_term text NOT NULL DEFAULT 'SAU_NHAN_HANG',
  ADD COLUMN IF NOT EXISTS debt_note text;

ALTER TABLE cus.customer DROP COLUMN IF EXISTS debt;

COMMENT ON COLUMN cus.customer.debt_term IS
  'Điều khoản thanh toán (0138): SAU_NHAN_HANG | GOI_DON_90 | KHAC. '
  'Câu chữ hiển thị nằm ở services/customer/src/customers/dieu-khoan.ts.';

COMMENT ON COLUMN cus.customer.debt_note IS
  'Nội dung tự nhập, CHỈ có nghĩa khi debt_term = KHAC (0138).';

-- ---------------------------------------------------------------------------
-- ẢNH CHỤP TRÊN HỒ SƠ: đổi kiểu, và đổi cả thứ được chụp
-- ---------------------------------------------------------------------------
--
-- `0101` chụp công nợ vào hồ sơ lúc gửi duyệt, kiểu `bigint`. Giờ nó chụp CÂU
-- CHỮ ĐÃ DỰNG XONG, không phải mã điều khoản — và đó là một quyết định, không
-- phải sự tiện tay:
--
--   Tờ CSBH đã ký phải in đúng câu mà hai bên đọc lúc ký. Chụp MÃ rồi dựng câu
--   lúc in nghĩa là sửa câu chữ của phương án 2 về sau sẽ đổi luôn nội dung của
--   mọi tờ đã ký từ trước — lặng lẽ, và không ai đối chiếu được.
--
-- Đây là chỗ ảnh chụp KHÁC dữ liệu sống một cách có chủ ý, cùng lối với tám cột
-- `kh_*_snap` của `0101`.
--
-- Số cũ chuyển thành chuỗi số (`4500000`). Không dựng câu cho chúng: hồ sơ lập
-- trước lượt này được ký trên một tờ giấy có con số ấy, và viết đè một điều khoản
-- mà lúc ấy chưa ai chọn là nói dối về một văn bản đã ký.

ALTER TABLE pol.policy
  ALTER COLUMN kh_cong_no_snap TYPE text USING kh_cong_no_snap::text;

COMMENT ON COLUMN pol.policy.kh_cong_no_snap IS
  'Ảnh chụp ĐIỀU KHOẢN thanh toán lúc gửi duyệt (0138) — câu chữ đã dựng xong, '
  'không phải mã. Hồ sơ trước 0138 mang chuỗi số của cột debt cũ.';
