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
 *
 * ---------------------------------------------------------------------------
 * `0267` (khách hàng chốt 07/11/2026): BỘ CỘT CỦA WEB TÁCH KHỎI BẢN IN
 * ---------------------------------------------------------------------------
 *
 * *"Bảng sản phẩm có quá nhiều cột, người dùng phải lăn chuột ngang liên tục"*.
 * Bảng web giờ có thứ tự RIÊNG: *Tên sản phẩm* (mã sản phẩm là dòng chữ nhỏ
 * ngay dưới tên) đứng đầu và là cột GHIM duy nhất, *Ngày áp dụng* ngay sau và
 * cuộn theo bảng; cột *Mã sản phẩm* và cột *Ghi chú* RỜI khỏi bảng web (ghi chú
 * thành một biểu tượng cạnh tên).
 *
 * BẢN MỀM KHÔNG ĐỔI — chốt cùng lúc, nói thẳng: *"những thay đổi này không ảnh
 * hưởng đến các bảng trong bản mềm, tất cả chỉ là thay đổi hiển thị trên web"*.
 * Nên luật *"màn hình và bản in khớp THỨ TỰ cột không ngoại lệ"* của `0231` chỉ
 * còn áp cho bản in; vế còn nguyên giữa hai bên là TÊN: cột nào có ở cả hai thì
 * mang đúng một tên (`tests/http/tieu-de-cot.test.ts`).
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
   * TÊN SẢN PHẨM — cột ĐẦU và là cột GHIM duy nhất khi cuộn ngang (`0267`).
   *
   * Lịch sử: `0180` đặt *Ngày · Mã · Tên*; `0230` đưa tên lên đầu và ghim; `0231`
   * (khách hàng 29/09, cùng ngày) lùi cả hai vì màn hình phải xếp cột giống hệt
   * bản in. `0267` đưa tên lên đầu lần nữa, và lần này đứng được vì khách hàng
   * TÁCH hai bảng: thứ tự của bản in không còn ràng màn hình.
   *
   * Ô tên mang thêm MÃ SẢN PHẨM ở dòng dưới — cột *Mã sản phẩm* bỏ khỏi web, mã
   * vẫn đọc được ngay cạnh thứ nó định danh.
   */
  { khoa: 'productName', nhan: 'Tên sản phẩm' },
  /*
   * NGÀY ÁP DỤNG — ngay SAU tên, KHÔNG ghim (`0267`). `0180` đặt nó đầu bảng vì
   * ngày là thuộc tính của DÒNG; nó vẫn là cột riêng, chỉ thôi đứng trước tên.
   */
  { khoa: 'ngayApDung', nhan: 'Ngày áp dụng' },
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
   * GHI CHÚ — THÔI LÀ MỘT CỘT của bảng web (`0267`).
   *
   * Cột này (`0027`) đứng cuối, xuống dòng ở 28 ký tự. Đo trên demo: 2 trên 453
   * dòng có ghi chú — một cột gần như luôn trống chiếm chỗ ngang của một bảng
   * vốn đã phải cuộn, và một ghi chú 500 ký tự kéo cả hàng cao mười tám dòng.
   * Khách hàng `0215` cũng đã chốt ghi chú không phải trường để so sánh. Nên ghi
   * chú thành một BIỂU TƯỢNG cạnh tên sản phẩm (cột ghim — cuộn tới đâu cũng
   * thấy dòng nào có ghi chú), rê chuột hoặc chạm để đọc cả đoạn. Bản in và bố
   * cục thẻ trên điện thoại vẫn bày nguyên văn.
   */
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
