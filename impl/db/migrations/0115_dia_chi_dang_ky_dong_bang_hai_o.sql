-- `0177` — ĐỊA CHỈ ĐĂNG KÝ ĐÓNG BĂNG THÀNH HAI Ô.
--
-- Khách hàng chốt 06/09, về khối *Khách hàng* trên trang hồ sơ CSBH: bỏ mục
-- *Tên*, thay bằng *tên người đại diện* và *tên hộ kinh doanh/tên công ty*,
-- thêm *Số nhà, phường xã, tỉnh thành phố* và *Địa chỉ giao hàng (thêm đủ nếu
-- có nhiều)*; loại và công nợ giữ nguyên.
--
-- Bốn trong năm trường ấy đã có ảnh chụp từ `0101` — `kh_nguoi_dai_dien_snap`,
-- `kh_ten_snap`, `kh_noi_nhan_hang_snap`, `kh_cong_no_snap`. Migration này chỉ
-- bù đúng phần còn thiếu: HAI Ô của địa chỉ đăng ký.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO `kh_dia_chi_dang_ky_snap` KHÔNG TRẢ LỜI ĐƯỢC
-- ---------------------------------------------------------------------------
--
-- `0175` tách địa chỉ đăng ký thành hai cột nguồn `cus.customer.street_ward` và
-- `cus.customer.province`, và biến `registered_address` thành cột **DẪN XUẤT**
-- do trigger `tr_dung_dia_chi_dang_ky` dựng: `street_ward || ', ' || province`.
--
-- `0101` đóng băng cột dẫn xuất ấy vào `kh_dia_chi_dang_ky_snap` — và từ `0175`
-- thì **đóng băng dẫn xuất mà không đóng băng nguồn** là một khoảng hở: màn hình
-- muốn hai ô, mà thứ đã đóng băng chỉ còn một chuỗi.
--
-- Tách ngược chuỗi ấy ở dấu phẩy cuối cùng thì CHẠY ĐƯỢC hôm nay — tên tỉnh
-- thành không chứa dấu phẩy — nhưng nó dựng một phép suy ngược lên hình dạng
-- của một cột dẫn xuất, và ngày ai đó đổi dấu ngăn trong trigger thì nó hỏng
-- **ngầm**: hai ô vẫn đầy chữ, chỉ là cắt sai chỗ, và không có gì đỏ.
--
-- Nên: đóng băng THÊM hai ô, cạnh cột gộp. Cột gộp GIỮ NGUYÊN — tầng văn bản in
-- thẳng chuỗi ấy ra giấy (`khachHangCua` trong `document`), và không có lý do
-- nào bắt tờ giấy đổi theo một thay đổi của màn hình.
--
-- ---------------------------------------------------------------------------
-- KHÔNG BACKFILL, VÀ ĐÓ LÀ MỘT LỰA CHỌN
-- ---------------------------------------------------------------------------
--
-- Hồ sơ đã gửi duyệt trước hôm nay có `kh_dia_chi_dang_ky_snap` mà hai cột này
-- NULL. Điền chúng đòi đọc `cus.customer` — schema của service khác — và giá trị
-- đọc được là địa chỉ HÔM NAY, không phải địa chỉ lúc hồ sơ được gửi. Điền như
-- thế là viết lại một ảnh chụp, đúng thứ mà cả `0101` sinh ra để chống.
--
-- Nên NULL ở đây mang đúng nghĩa *"lượt gửi ấy chưa chụp hai ô"*, và màn hình
-- rơi về bày MỘT ô *Địa chỉ đăng ký* với chuỗi đã đóng băng — thứ thật sự đã
-- được đóng băng, không hơn. Hình dạng ấy tự hết: `0101` chụp lại toàn bộ khối
-- khách hàng ở MỖI lượt gửi, nên hồ sơ còn đi trong luồng có hai ô ngay lượt gửi
-- lại tiếp theo. Chỉ hồ sơ đã có hiệu lực giữ hình dạng cũ mãi — và đó đúng là
-- điều nên xảy ra với một hồ sơ đã ký.
ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS kh_so_nha_snap    text,
  ADD COLUMN IF NOT EXISTS kh_tinh_thanh_snap text;

COMMENT ON COLUMN pol.policy.kh_so_nha_snap IS
  'Số nhà, phường xã theo ĐKKD, chụp lúc gửi duyệt (0177). NULL = hồ sơ gửi '
  'trước 0177; khi ấy đọc kh_dia_chi_dang_ky_snap. Nguồn: cus.customer.street_ward.';
COMMENT ON COLUMN pol.policy.kh_tinh_thanh_snap IS
  'Tỉnh/Thành phố theo ĐKKD, chụp lúc gửi duyệt (0177). NULL = hồ sơ gửi trước '
  '0177; khi ấy đọc kh_dia_chi_dang_ky_snap. Nguồn: cus.customer.province.';
