-- =============================================================================
-- 0025_bo_nguong_mac_dinh — bỏ hẳn khái niệm "ngưỡng chiết khấu mặc định".
--
-- Ba cột `default_rate2_type1/2/3` trên sản phẩm là một NGUỒN NGƯỠNG THỨ HAI,
-- song song với bảng Chiết khấu quy định. Mà chính `0005` đã chốt bảng quy định
-- là "NGUỒN DUY NHẤT kiểm vượt ngưỡng" (muc 6.3). Hai nguồn cho cùng một con số
-- là hai chỗ phải giữ đồng bộ, và cái thứ hai này còn vô hình: nó không có màn
-- hình nhập, chỉ vào hệ thống qua nhập Excel và qua script, rồi âm thầm thắng
-- ở những sản phẩm chưa có quy định nào.
--
-- Hệ quả: sản phẩm không có quy định nào phủ giờ rơi thẳng sang `KHONG_CO` thay
-- vì rơi về mặc định. Đó KHÔNG phải mất mát — `0023` đã mở đường cho tình huống
-- ấy: hồ sơ vẫn lập được, dòng tô vàng, chỉ là không có ngưỡng để đối chiếu.
-- Muốn có ngưỡng thì khai một quy định, ở đúng chỗ dành cho việc đó.
--
-- XOÁ CỘT chứ không để lại. Cùng lý do đã ghi ở `0020`: một cột không ai đọc là
-- một cột người đọc mã phải dừng lại để hỏi "cái này còn dùng không".
--
-- GIỮ nhãn `PRODUCT_DEFAULT` trong ràng buộc `nguon_nguong_hop_le`. Những dòng
-- hồ sơ đã lập theo nguồn ấy vẫn còn, và con số ngưỡng của chúng vẫn đúng tại
-- thời điểm chúng được lập. Đổi nhãn cũ là viết lại lịch sử; cấm nhãn cũ là làm
-- hỏng chính những dòng ấy.
-- =============================================================================

ALTER TABLE cat.product
  DROP COLUMN IF EXISTS default_rate2_type1,
  DROP COLUMN IF EXISTS default_rate2_type2,
  DROP COLUMN IF EXISTS default_rate2_type3;

COMMENT ON TABLE cat.discount_rule IS
  'Nguồn DUY NHẤT của ngưỡng chiết khấu. Không còn ngưỡng mặc định trên sản phẩm (0025).';
