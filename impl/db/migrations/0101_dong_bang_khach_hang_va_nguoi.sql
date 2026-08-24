-- =============================================================================
-- 0101 — Đóng băng THÔNG TIN KHÁCH HÀNG và HAI CÁI TÊN vào hồ sơ.
--
-- Chốt ngày 24/08 sau lượt rà `0099`. Trước tệp này, bản mềm CSBH đọc TÁM
-- trường của khách hàng và BỐN tên người **sống** từ service khác ở mỗi lượt
-- dựng. Hệ quả đo được: sửa công nợ hay địa chỉ của một khách hàng hôm nay thì
-- bản CSBH đã ký từ tuần trước đổi nội dung theo — lặng lẽ, và ngược thời gian.
-- Con số trên tờ giấy khách đã ký không còn là con số phần mềm in ra lần sau.
--
-- --- VẠCH ĐÓNG BĂNG LÀ *GỬI DUYỆT*, KHÔNG PHẢI *KÝ SỐ* ------------------------
--
-- Giá, ngưỡng (`0022`) và mẫu bản mềm (`0098`) đều đóng ở đúng vạch ấy. Thêm một
-- vạch thứ hai là hồ sơ có hai câu trả lời cho *"lúc nào thì nó ngừng động
-- đậy"* — và khe giữa hai vạch có thật: khách đổi địa chỉ sau khi TDV gửi mà
-- trước khi TBP ký thì Trưởng bộ phận duyệt một bản khác bản người lập gửi đi.
--
-- Ngoại lệ đúng một cột: `tbp_ky_ten_snap` chụp lúc KÝ, vì nó mô tả chính cái
-- sự kiện ấy — lúc gửi duyệt chưa ai ký cả.
--
-- --- VÌ SAO TÁM CỘT RỜI, KHÔNG PHẢI MỘT JSONB --------------------------------
--
-- Cùng nếp với `pol.policy_line` (`company_price_snap`, `threshold_snap`,
-- `product_code_snap`). Nhưng lý do thật nằm ở chỗ khác: thêm một trường khách
-- hàng vào bản mềm về sau thì với cột rời, người sửa **buộc phải viết một
-- migration** — tức là buộc phải trả lời câu hỏi *"trường này đóng băng hay đọc
-- sống?"*. Với một jsonb thì trường mới lặng lẽ rơi vào nhánh đọc sống, và
-- không có gì trên đường đi hỏi câu ấy. Đó đúng là cách `0098` để lọt một nửa
-- văn bản không được đóng băng.
--
-- --- HAI CÁI TÊN, VÀ VÌ SAO KHÔNG PHẢI BỐN -----------------------------------
--
-- `sources.ts` phơi ra bốn tên người, nhưng chỉ hai cái cần đóng băng:
--
--   * `nguoi_de_nghi_snap`  — người ĐỀ NGHỊ. Một sự việc đã xảy ra.
--   * `tbp_ky_ten_snap`     — người ĐÃ KÝ, tên viết thế nào lúc ấy.
--
-- `sale_admin` bị loại vì `sale_admin_user_id` mới được ghi ở `KT_RECEIVE_L1`,
-- tức là SAU khi TBP ký — lúc gửi duyệt cột ấy còn rỗng, đóng băng nó là đóng
-- băng một chuỗi rỗng. Nó thuộc cùng nhóm với `ngay_kt_nhan_l2`: nội dung ĐẾN
-- SAU chữ ký, và bản mềm vốn được đặc tả là còn phải kể tiếp (`ho_so.trang_thai`
-- và `ho_so.ngay_kt_nhan_l2` đều nằm trong `NGUON_BAT_BUOC_HO_SO`).
--
-- `ke_toan` đọc sống, có chủ ý: câu nó trả lời là *"ai đang giữ hồ sơ"*, không
-- phải *"ai đã từng"*. Bàn giao đổi `ke_toan_user_id` sang người kế nhiệm để
-- người ấy nhận được thư; in ra tên một tài khoản đã vô hiệu hoá thì tờ giấy chỉ
-- vào chỗ không ai ngồi.
--
-- `nguoi_de_nghi_snap` thì NGƯỢC LẠI, và đây là chỗ trái trực giác nhất của tệp
-- này: sau một lượt bàn giao, màn hình chỉ TDV kế nhiệm còn tờ giấy vẫn ghi
-- người đề nghị ban đầu. Hai chỗ nói hai điều khác nhau vì chúng trả lời hai câu
-- hỏi khác nhau — *ai chịu trách nhiệm bây giờ* và *ai đã đề nghị việc này*.
-- Luật `0035` ("người phụ trách HIỆN TẠI, không phải người đã lập") vẫn nguyên
-- vẹn: nó nói về quyền thao tác, không nói về nội dung văn bản.
--
-- --- TRẢ LẠI THÌ CHỮ KÝ MẤT HIỆU LỰC -----------------------------------------
--
-- Hồ sơ quay về *Yêu cầu chỉnh sửa* thì `tbp_signed_at`, `tbp_signed_by` và
-- `tbp_ky_ten_snap` bị xoá cùng lúc. Ba cột, một sự thật: **không có chữ ký nào
-- đang có hiệu lực trên hồ sơ này**.
--
-- Việc ấy chữa luôn một lỗ hổng `P0` mở từ P5: WF-20 đòi hồ sơ bị trả về phải đi
-- lại TOÀN BỘ vòng duyệt *kể cả bước ký số*, nhưng `tbp_signed_at` không bao giờ
-- được xoá, nên chốt chặn `ALREADY_SIGNED` (WF-05) chặn luôn lượt ký thứ hai. Đo
-- được: hồ sơ bị Kế toán trả về sau khi TBP đã ký, gửi lại xong thì `TBP_SIGN`
-- trả **409** — hồ sơ nằm lại `CHO_TBP_DUYET` vĩnh viễn, rồi SLA cho nó quá hạn
-- sau 14 ngày và xoá sau 3 ngày nữa. Ca kiểm WF-20 cũ dừng đúng một bước trước
-- chỗ ấy: nó chứng minh không nhảy cóc được, không chứng minh đi tiếp được.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 1. TÁM TRƯỜNG KHÁCH HÀNG — đúng khối "Khách hàng TRONG hồ sơ" của sources.ts
-- --------------------------------------------------------------------------
--
-- Không khoá ngoại, không ràng buộc NOT NULL: NULL mang nghĩa riêng và là nghĩa
-- quan trọng — *hồ sơ chưa gửi duyệt, hoặc lập trước `0101`*. Cả hai trường hợp
-- đều đọc sống, và `khachHangCua` bên `document` là chỗ DUY NHẤT quyết định
-- điều đó.
ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS kh_ma_snap                 text,
  ADD COLUMN IF NOT EXISTS kh_ten_snap                text,
  ADD COLUMN IF NOT EXISTS kh_ma_so_thue_snap         text,
  ADD COLUMN IF NOT EXISTS kh_dia_chi_dang_ky_snap    text,
  ADD COLUMN IF NOT EXISTS kh_noi_nhan_hang_snap      text,
  ADD COLUMN IF NOT EXISTS kh_nguoi_dai_dien_snap     text,
  ADD COLUMN IF NOT EXISTS kh_chuc_danh_dai_dien_snap text,
  -- `bigint` đúng kiểu của `cus.customer.debt`. API vẫn trả CHUỖI (`0061`) —
  -- bigint không đi qua JSON an toàn, và tiền thì không được phép mất chữ số.
  ADD COLUMN IF NOT EXISTS kh_cong_no_snap            bigint;

COMMENT ON COLUMN pol.policy.kh_ten_snap IS
  'Tên khách hàng tại thời điểm GỬI DUYỆT (`0101`). NULL = hồ sơ chưa gửi duyệt '
  'hoặc lập trước `0101`; khi đó bản mềm đọc sống từ cus.customer.';
COMMENT ON COLUMN pol.policy.kh_cong_no_snap IS
  'Công nợ tại thời điểm gửi duyệt (`0101`). Chính là con số in trên bản CSBH — '
  'mẫu seed ghi thẳng "Công nợ tại thời điểm lập".';

-- --------------------------------------------------------------------------
-- 2. HAI CÁI TÊN
-- --------------------------------------------------------------------------
--
-- Lấy từ `AuthUser.name` — ảnh chụp danh tính mà `0090` đã dựng cho nhật ký, và
-- nó là NGƯỜI THỰC HIỆN hành động chứ không phải một lượt tra theo id. Đúng hơn
-- một lượt tra: `SUBMIT` do chính TDV bấm, `TBP_SIGN` do chính Trưởng bộ phận
-- bấm, nên tên ghi xuống là tên của người vừa làm việc ấy.
ALTER TABLE pol.policy
  ADD COLUMN IF NOT EXISTS nguoi_de_nghi_snap text,
  ADD COLUMN IF NOT EXISTS tbp_ky_ten_snap    text;

COMMENT ON COLUMN pol.policy.nguoi_de_nghi_snap IS
  'Họ tên người ĐỀ NGHỊ, chụp lúc gửi duyệt (`0101`). KHÔNG đổi theo bàn giao — '
  'nó trả lời "ai đã đề nghị", không phải "ai đang phụ trách".';
COMMENT ON COLUMN pol.policy.tbp_ky_ten_snap IS
  'Họ tên Trưởng bộ phận ĐÃ KÝ, chụp lúc ký (`0101`). Xoá cùng tbp_signed_at khi '
  'hồ sơ quay về Yêu cầu chỉnh sửa — không chữ ký thì không có tên người ký.';

-- KHÔNG backfill, cùng lý do đã ghi ở `0098` và nay đã có bằng chứng: hồ sơ cũ
-- để NULL và đọc sống, đúng như trước tệp này. Không có gì hỏng thêm, và cũng
-- không giả vờ rằng dữ liệu cũ đã được xử lý.
