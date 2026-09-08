/**
 * TÊN CỘT của bảng dòng sản phẩm trên màn hình (`0172`, chốt 01/09).
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO Ở MỘT TỆP RIÊNG, TÁCH KHỎI `BangSanPham.tsx`
 * ---------------------------------------------------------------------------
 *
 * Khách hàng: *"đồng bộ tiêu đề cột trong trang hồ sơ CSBH và trong bản mềm"*.
 * Chốt chặn cho câu ấy là một ca kiểm đối chiếu bảng này với `COT_BANG` của
 * `document` — và ca ấy sống ở `tests/http/`, nơi `tsconfig` KHÔNG bật `jsx`.
 * Nhập một tệp `.tsx` vào đó thì `tsc` đỏ (`TS6142`) dù `vitest` chạy được, tức
 * là hỏng ở lượt typecheck chứ không ở lượt chạy — kiểu hỏng khó chịu nhất.
 *
 * Tên cột vốn là DỮ LIỆU, không phải giao diện. Đưa nó ra khỏi tệp component là
 * trả nó về đúng chỗ, và ca kiểm đối chiếu đọc thẳng được hằng thật thay vì
 * chép lại một bản sao thứ ba.
 */

/**
 * Cột cố định, KHÔNG kể các cột CPBH — số cột CPBH tuỳ dữ liệu.
 *
 * NHÃN Ở ĐÂY PHẢI KHỚP TỪNG CHỮ với `COT_BANG` của `document`. Khách hàng đọc
 * bảng trên màn hình rồi đọc bảng trên tờ giấy vừa in, và bốn cột mang hai tên
 * khác nhau — *Mã SP* / *Mã sản phẩm*, *Giá bán Công ty* / *Giá công ty*,
 * *CPBH tổng* / *CPBH*, *CPBH 1* / *CPBH1* — bắt người đối chiếu phải dịch.
 *
 * Hai bảng KHÔNG gộp được làm một: đây là gói giao diện (`FE-38` chặn 250KB),
 * bên kia là mã của một service. Nên chốt chặn là một CA KIỂM đối chiếu hai
 * bảng — `tests/http/tieu-de-cot.test.ts`.
 */
export const COT_TRUOC = [
  /*
   * NGÀY ÁP DỤNG — cột ĐẦU TIÊN, bên trái *Mã sản phẩm* (`0180`).
   *
   * Khách hàng chốt 07/09 từng chữ: *"cột ngày áp dụng để bên trái mã sản
   * phẩm"*. Từ lượt này ngày áp dụng là thuộc tính của DÒNG chứ không của hồ sơ
   * — ô *Ngày áp dụng* ở khối thông tin đầu trang biến mất cùng lúc — nên nó
   * phải đứng ở chỗ mắt đọc trước khi đọc tới mặt hàng.
   */
  { khoa: 'ngayApDung', nhan: 'Ngày áp dụng' },
  { khoa: 'productCode', nhan: 'Mã sản phẩm' },
  { khoa: 'productName', nhan: 'Tên sản phẩm' },
  { khoa: 'companyPrice', nhan: 'Giá bán Công ty' },
  { khoa: 'wholesalePrice', nhan: 'Giá bán buôn' },
  /*
   * CPBH TỔNG, đứng ngay TRƯỚC các khoản lẻ (`0056`).
   *
   * Con số cộng lại là thứ người đọc cần trước — nó là cái đi vào phép tính giá
   * thu về. Từng khoản lẻ chỉ cần khi thấy tổng lạ và muốn soi. Đặt tổng sau
   * dải CPBH 1…CPBH n thì mắt phải lướt qua cả dải rồi mới tới thứ mình tìm.
   *
   * Bản in A4 xếp đúng thứ tự này — hai bảng phải đọc giống nhau, nếu không thì
   * người đối chiếu màn hình với bản giấy phải dò lại từ đầu.
   *
   * Nhãn *CPBH tổng* → ***CPBH*** ở `0172`: tờ mẫu khách hàng tự gõ viết thế,
   * và cột ấy đứng ngay cạnh *CPBH 1*, *CPBH 2* nên chữ "tổng" không thêm gì.
   */
  { khoa: 'cpbhTotal', nhan: 'CPBH' },
] as const;

export const COT_SAU = [
  { khoa: 'netPrice', nhan: 'Giá thu về' },
  { khoa: 'discountRate', nhan: 'Tỷ lệ CK' },
  /*
   * `0180` — *Tỷ lệ CK cũ*, NGAY SAU *Tỷ lệ CK*.
   *
   * Chỉ có chữ ở dòng *Chỉnh sửa*; máy chủ quyết định điều đó và trả `null` cho
   * mọi dòng khác (xem `SQL_TRANG_THAI_DONG` bên `policy`). Giao diện KHÔNG suy
   * lại theo trạng thái — hai chỗ cùng trả lời một câu hỏi là hai câu sẽ lệch.
   *
   * Đứng cạnh cột tỷ lệ mới vì nó chỉ có nghĩa khi đọc kèm: hai ô cách nhau một
   * cột là mắt phải nhớ số để so.
   */
  { khoa: 'discountRateTruoc', nhan: 'Tỷ lệ CK cũ' },
  /*
   * Quy định chiết khấu đã cho ra ngưỡng của dòng này (`0023`).
   *
   * Đứng NGAY SAU hai cột tỷ lệ vì nó trả lời chính câu hỏi mà chúng gợi ra —
   * "ngưỡng đem so là ngưỡng nào, ai khai".
   *
   * `0180` — Ô NÀY BÀY RA **NGƯỠNG PHẦN TRĂM**, không phải mã quy định. Khách
   * hàng chốt 07/09: *"nội dung của cột QĐCK hiển thị số phần trăm chứ không
   * hiển thị tên QĐCK, để dấu ? nhỏ bên cạnh để khi người dùng di chuột vào sẽ
   * hiện tên QĐCK"*. Con số mới là thứ đọc được cùng hàng với *Tỷ lệ CK* ngay
   * bên trái — mã quy định thì phải mở màn hình khác mới biết nó nghĩa là bao
   * nhiêu. Mã KHÔNG mất: nó nằm trong câu của dấu `?` cạnh con số, và dán vào ô
   * tìm kiếm ở màn hình Chiết khấu vẫn ra đúng dòng quy định.
   *
   * Khoá vẫn là `ruleCode` chứ không đổi thành `threshold`: cột này trả lời
   * *"quy định chiết khấu nào"*, và cả hai thứ hiện ra đều thuộc về quy định ấy.
   *
   * CHỈ CÓ TRÊN MÀN HÌNH: bản in không có cột này, và đó là chủ ý — nó là đường
   * tra ngược của người duyệt, không phải thông tin của tờ giấy đem ký.
   *
   * Ô TRỐNG khi không có quy định nào: dòng rơi về mặc định của sản phẩm, hoặc
   * không có ngưỡng nào. Ba dấu chấm hay chữ "không có" ở đây chỉ làm bảng ồn
   * thêm — con số Tỷ lệ CK ngay bên trái đã đổi màu và mang dấu `?` nói đúng
   * điều đó rồi.
   */
  { khoa: 'ruleCode', nhan: 'QĐCK' },
  /*
   * `0180` — TRẠNG THÁI của dòng so với CSBH đang có: *Bổ sung* · *Chỉnh sửa* ·
   * *Đang áp dụng*.
   *
   * Đứng SAU các con số và TRƯỚC *Ghi chú*: nó là kết luận về cả dòng, đọc sau
   * khi đã đọc số. Đặt nó lên đầu thì mắt phải mang một cái nhãn đi suốt dải
   * tiền mà chưa biết nhãn ấy nói về cái gì.
   */
  { khoa: 'trangThai', nhan: 'Trạng thái' },
  /*
   * Ghi chú của người lập cho riêng dòng này (`0027`).
   *
   * ĐỨNG CUỐI vì nó là cột chữ duy nhất giữa một bảng số: xen vào giữa thì mọi
   * cột tiền bên phải nó mất thế thẳng hàng, và bảng tiền mà không đọc được
   * theo cột dọc là bảng không kiểm được.
   */
  { khoa: 'note', nhan: 'Ghi chú' },
] as const;

/**
 * Nhãn của khoản CPBH thứ `i` (đếm từ 0) — **CÓ DẤU CÁCH**.
 *
 * Một hàm chứ không phải một chuỗi gõ tay ở mỗi chỗ dùng: tới `0172` chuỗi
 * `CPBH ${i + 1}` nằm ở hai chỗ trong `BangSanPham.tsx` (hàng tiêu đề bảng và
 * danh sách gấp của thẻ trên điện thoại), và bên bản mềm là một chuỗi thứ ba
 * viết DÍNH LIỀN — `CPBH1`. Ba bản sao, hai cách viết; khách hàng nhìn ra.
 */
export const nhanCpbh = (i: number): string => `CPBH ${i + 1}`;

/**
 * Nhãn bốn trạng thái dòng (`0180`, `0186`).
 *
 * PHẢI KHỚP TỪNG CHỮ với `NHAN_TRANG_THAI_DONG` của `document` — cùng lý do đã
 * viết cho tên cột ở đầu tệp này: người đọc bảng trên màn hình rồi đọc bảng
 * trên tờ giấy vừa in, và bốn nhãn này là NỘI DUNG ô chứ không phải tiêu đề. Có ca đối chiếu hai chiều ở `tests/http/tieu-de-cot.test.ts`.
 *
 * `DA_XOA` (`0186`) chỉ hiện trên MÀN HÌNH: bản mềm không nhận dòng đã rút. Nó
 * vẫn có mặt ở cả hai bảng, xem lý do ở `NHAN_TRANG_THAI_DONG` bên `document`.
 */
export const NHAN_TRANG_THAI: Record<string, string> = {
  BO_SUNG: 'Bổ sung',
  CHINH_SUA: 'Chỉnh sửa',
  DANG_AP_DUNG: 'Đang áp dụng',
  DA_XOA: 'Đã xoá',
};
