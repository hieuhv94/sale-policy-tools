-- `0224` — HỒ SƠ TRẢ VỀ TDV THÌ BỎ ĐÓNG BĂNG KHÁCH HÀNG.
--
-- Khách hàng báo 28/09: TBP hoặc Kế toán trả CSBH về thì TDV *"chưa sửa được
-- thông tin chung"*. Thật ra sửa được — ở trang khách hàng — nhưng trang hồ sơ
-- đọc ẢNH CHỤP hễ ảnh chụp có mặt (`0101`), nên sửa xong mở hồ sơ vẫn thấy số
-- cũ, tới lượt gửi lại mới chụp lại.
--
-- Từ `0224` lượt chuyển sang `YEU_CAU_CHINH_SUA` xoá mười một cột `kh_*_snap`
-- (`workflow.service.ts`, `COT_ANH_CHUP_KHACH`) — cùng lối với ba cột chữ ký.
-- Migration này đưa những hồ sơ ĐANG nằm ở trạng thái ấy về cùng hình dạng, để
-- hồ sơ bị trả về trước bản sửa không phải đợi lượt trả về kế tiếp.
--
-- Không mất gì cần giữ: lượt gửi lại chụp lại cả khối từ khách hàng hôm nay, và
-- đó là lượt duy nhất đưa hồ sơ này ra khỏi `YEU_CAU_CHINH_SUA` (ngoài xoá).
-- `nguoi_de_nghi_snap` KHÔNG đụng — nó không phải thông tin khách hàng.
UPDATE pol.policy
   SET kh_ma_snap = NULL, kh_ten_snap = NULL, kh_ma_so_thue_snap = NULL,
       kh_dia_chi_dang_ky_snap = NULL, kh_so_nha_snap = NULL, kh_tinh_thanh_snap = NULL,
       kh_noi_nhan_hang_snap = NULL, kh_nguoi_dai_dien_snap = NULL,
       kh_chuc_danh_dai_dien_snap = NULL, kh_dien_thoai_snap = NULL, kh_cong_no_snap = NULL
 WHERE status = 'YEU_CAU_CHINH_SUA'
   AND kh_ten_snap IS NOT NULL;
