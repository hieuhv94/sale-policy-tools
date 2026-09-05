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
   * Mã quy định chiết khấu đã cho ra ngưỡng của dòng này (`0023`).
   *
   * Đứng NGAY SAU Tỷ lệ CK vì nó trả lời chính câu hỏi mà con số ấy gợi ra —
   * "ngưỡng đem so là ngưỡng nào, ai khai". Dán mã này vào ô tìm kiếm ở màn hình
   * Chiết khấu là ra đúng dòng quy định.
   *
   * CHỈ CÓ TRÊN MÀN HÌNH: bản in không có cột này, và đó là chủ ý — nó là đường
   * tra ngược của người duyệt, không phải thông tin của tờ giấy đem ký.
   *
   * Ô TRỐNG khi không có: dòng rơi về mặc định của sản phẩm, hoặc không có ngưỡng
   * nào. Ba dấu chấm hay chữ "không có" ở đây chỉ làm bảng ồn thêm — con số Tỷ lệ
   * CK ngay bên trái đã đổi màu và mang dấu `?` nói đúng điều đó rồi.
   */
  { khoa: 'ruleCode', nhan: 'QĐCK' },
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
