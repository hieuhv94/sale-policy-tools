/**
 * SÁU MƯƠI BA TỈNH, THÀNH PHỐ (`0205`, khách hàng chốt 19/09).
 *
 * Tới `0204` ô *Tỉnh/Thành phố* là chữ tự do (`str(1, 200)`), và cái giá đo được
 * ngay trong bộ nạp demo: cùng một thành phố nằm trong CSDL dưới ba lối viết
 * (`Hà Nội` · `TP Hồ Chí Minh` · `Thành phố Hà Nội`). Không phép so nào, không
 * bộ lọc nào, không báo cáo nào gom chúng lại được — và chuỗi ấy còn đi thẳng ra
 * dòng địa chỉ trên bản CSBH hai bên ký.
 *
 * ---------------------------------------------------------------------------
 * BA QUYẾT ĐỊNH CỦA KHÁCH HÀNG, VÀ CÁI GIÁ CỦA TỪNG CÁI
 * ---------------------------------------------------------------------------
 *
 * **DANH SÁCH CŨ — 63 đơn vị, không phải 34.** Phần mềm ghi địa chỉ *theo giấy
 * đăng ký kinh doanh*, và tờ giấy trong tay khách hàng hôm nay vẫn mang tên cũ.
 * Nên đây là một bảng từ vựng đọc theo GIẤY TỜ, không phải theo địa giới hành
 * chính đang hiệu lực; ngày nào khách hàng đổi giấy thì đây là chỗ sửa, và lượt
 * sửa ấy là một quyết định nghiệp vụ chứ không phải một lượt cập nhật dữ liệu.
 *
 * **TÊN NGẮN, không tiền tố.** `Hà Nội`, không phải `Thành phố Hà Nội`; `Bắc
 * Ninh`, không phải `Tỉnh Bắc Ninh`. Lý do nằm ở chỗ chuỗi này đi tới: trigger
 * `tr_dung_dia_chi_dang_ky` nối `street_ward || ', ' || province` rồi `0182` in
 * nó ra giấy — *"Số 8 Tôn Thất Thuyết, Cầu Giấy, Hà Nội"* đọc như một địa chỉ,
 * còn bản có tiền tố đọc như một biểu mẫu khai. Đổi lối viết về sau là đổi câu
 * chữ trên giấy tờ đã ký, nên nó phải chốt một lần, ở đây.
 *
 * **MÁY CHỦ CHỐT, không chỉ ô chọn.** Một ô chọn là một chốt chặn của TRÌNH
 * DUYỆT; `POST /customers` vẫn là một đường HTTP, và bộ nạp demo lẫn bộ kiểm đều
 * đi thẳng vào nó. Giới hạn ở đúng một nửa là dựng lại y nguyên chuyện `0160`
 * ghi cho nút *Bàn giao* — chỉ khác chiều: ở đó chốt chặn có sẵn mà nút chưa
 * xám, ở đây nút sẽ xám mà chốt chặn chưa có.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHÔNG CÓ MIGRATION, VÀ KHÔNG CÓ `CHECK` Ở CSDL
 * ---------------------------------------------------------------------------
 *
 * Cột `province` vẫn là `text` trơn. `0114` đã viết ra lý do cho vế *bắt buộc*
 * và nó đúng y nguyên cho vế *chọn trong danh sách*: tầng ứng dụng là chỗ DUY
 * NHẤT trả được câu lỗi tiếng Việt nói rõ phải làm gì với ô nào. Một `CHECK` 63
 * vế ở CSDL thì mỗi lượt sửa danh sách thành một migration, và câu lỗi nó ném ra
 * là một tên ràng buộc.
 *
 * Không có lượt quy đổi dữ liệu cũ: khách hàng chốt dựng hệ thống từ dữ liệu
 * sạch (`make demo-mau` nạp lại). Hệ nào đã có dữ liệu thật thì giá trị cũ không
 * tự hỏng — nó nằm nguyên trong CSDL và hiện ra được ở ô chọn — nhưng **lượt
 * SỬA tiếp theo của chính khách hàng ấy sẽ bị chặn tới khi người dùng chọn lại
 * một tỉnh trong danh sách**, vì biểu mẫu gửi `province` ở mọi lượt. Đó là hành
 * vi cố ý: một câu lỗi đọc được thì hơn một lượt lặng lẽ đổi địa chỉ pháp nhân.
 *
 * **Ảnh chụp `kh_tinh_thanh_snap` của hồ sơ đã gửi KHÔNG đụng tới** (`0177`) —
 * nó giữ câu chữ lúc gửi, và viết lại nó là sửa một tờ giấy đã ký.
 *
 * Giao diện có bản sao riêng (`apps/web/src/lib/danh-muc.ts`) vì nó phải VẼ ô
 * chọn; có ca kiểm đối chiếu hai bảng, cùng lối với `DIEU_KHOAN_NO` của `0138`.
 */

/**
 * Thứ tự A–Z **bỏ dấu** — đúng thứ tự mà phím tắt gõ-để-nhảy của `<select>` đi
 * theo, và cũng là thứ tự mắt người quét một danh sách 63 dòng.
 */
export const TINH_THANH = [
  'An Giang',
  'Bà Rịa - Vũng Tàu',
  'Bắc Giang',
  'Bắc Kạn',
  'Bạc Liêu',
  'Bắc Ninh',
  'Bến Tre',
  'Bình Định',
  'Bình Dương',
  'Bình Phước',
  'Bình Thuận',
  'Cà Mau',
  'Cần Thơ',
  'Cao Bằng',
  'Đà Nẵng',
  'Đắk Lắk',
  'Đắk Nông',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Giang',
  'Hà Nam',
  'Hà Nội',
  'Hà Tĩnh',
  'Hải Dương',
  'Hải Phòng',
  'Hậu Giang',
  'Hồ Chí Minh',
  'Hòa Bình',
  'Hưng Yên',
  'Khánh Hòa',
  'Kiên Giang',
  'Kon Tum',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Long An',
  'Nam Định',
  'Nghệ An',
  'Ninh Bình',
  'Ninh Thuận',
  'Phú Thọ',
  'Phú Yên',
  'Quảng Bình',
  'Quảng Nam',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sóc Trăng',
  'Sơn La',
  'Tây Ninh',
  'Thái Bình',
  'Thái Nguyên',
  'Thanh Hóa',
  'Thừa Thiên Huế',
  'Tiền Giang',
  'Trà Vinh',
  'Tuyên Quang',
  'Vĩnh Long',
  'Vĩnh Phúc',
  'Yên Bái',
] as const;

export type TinhThanh = (typeof TINH_THANH)[number];

/**
 * Tra theo dạng ĐÃ CHUẨN HOÁ, dựng một lần lúc nạp mô-đun.
 *
 * Khoá là chuỗi NFC, giá trị là chính chuỗi trong bảng trên — nên hàm dưới trả
 * về được *bản của bảng* chứ không phải bản người dùng gửi lên.
 */
const THEO_NFC = new Map<string, string>(
  TINH_THANH.map((t) => [t.normalize('NFC'), t] as const),
);

/**
 * Chuỗi người dùng gửi lên → tên trong bảng, hoặc `null` nếu không phải một
 * trong 63 tên.
 *
 * **CHUẨN HOÁ Ở ĐƯỜNG VÀO, rồi ghi bản của BẢNG** — cùng lối `chuanHoaMa` của
 * `0198`, và ở đây nó bịt một khe hẹp mà một phép kiểm boolean để hở: tiếng
 * Việt có dấu viết được bằng hai cách Unicode khác nhau (`Hà` là một ký tự dựng
 * sẵn, hoặc `H` + `a` + dấu huyền tổ hợp). Hai chuỗi ấy hiện ra **giống hệt
 * nhau** trên màn hình trong khi `===` nói chúng khác, và bàn phím tiếng Việt,
 * macOS, một lượt chép dán từ PDF đều sinh ra được dạng tổ hợp. Chỉ KIỂM rồi ghi
 * nguyên chuỗi gửi lên là CSDL có hai dòng `Hà Nội` khác byte — đúng cái lộn xộn
 * mà cả chặng này dựng ra để dẹp. Bẫy NFC/NFD là bẫy `0151` đã ghi cho tên tệp
 * rồi ghi lại cho nội dung `.docx`; đây là lần đầu nó tới một ô nhập.
 *
 * KHÔNG bỏ dấu, KHÔNG bỏ qua hoa thường, KHÔNG đoán gần đúng: ô chọn chỉ gửi lên
 * được đúng một trong 63 chuỗi này, nên mọi giá trị khác là dữ liệu tới từ một
 * đường không phải biểu mẫu — và ở đó đoán hộ là ghi vào CSDL một cái tên không
 * ai gõ.
 */
export const chuanTinhThanh = (s: string): string | null =>
  THEO_NFC.get(s.trim().normalize('NFC')) ?? null;
