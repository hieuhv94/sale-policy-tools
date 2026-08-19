/**
 * Bảng tra và kiểu dữ liệu của ba màn hình tách ra từ "Danh mục" cũ.
 *
 * KHÔNG có bảng MỤC MENU ở đây. Trước P22 màn hình Danh mục có một dải thẻ khai
 * ra ba mục ấy; giờ chúng là ba mục menu ngang hàng nên `DIEU_HUONG` bên
 * `can.ts` là nguồn DUY NHẤT — hai bảng cùng khai một danh sách là hai bảng sẽ
 * lệch nhau.
 *
 * `THE_SAN_PHAM` dưới đây là chuyện khác: một dải thẻ NẰM TRONG một màn hình,
 * không phải một tầng điều hướng. Nó không trùng với `DIEU_HUONG` chỗ nào.
 *
 * Danh mục tra cứu (tỉnh · bệnh viện · kênh) đã biến khỏi phần mềm ở `0026`:
 * ngưỡng chiết khấu chỉ còn khớp theo nhóm sản phẩm × loại khách hàng, và ba mã
 * ấy không còn chỗ nào để đi tới.
 *
 * "Người ký" đã XOÁ HẲN ở `0033` — lược đồ, API, test, và ba ô trộn `signer.*`
 * của mẫu hợp đồng. Nó gỡ khỏi giao diện từ 15/08 vì yêu cầu chưa rõ, và sống
 * tiếp một năm rưỡi ở trạng thái nửa vời: có API mà không có màn hình nào tạo
 * được dữ liệu cho nó. Khách hàng chốt 16/08 là hợp đồng không cần in tên người
 * ký của Công ty.
 */

/**
 * Hai thẻ của màn hình Sản phẩm — CHỈ Quản trị hệ thống thấy.
 *
 * Vai trò khác không có thẻ nào: họ chỉ đọc bảng sản phẩm, và một dải thẻ một
 * mục là một dải thẻ vô nghĩa.
 *
 * Thứ tự là thứ tự PHỤ THUỘC, không phải thứ tự quan trọng: nhóm là trường bắt
 * buộc của sản phẩm, nên người mở màn hình lần đầu mà chưa có nhóm nào sẽ đứng
 * ngay ở ô đầu tiên của biểu mẫu tạo sản phẩm. Nhưng thẻ Sản phẩm vẫn đứng
 * TRƯỚC vì đó là việc hàng ngày, còn thêm nhóm là việc vài lần một năm.
 */
export type TheSanPhamKhoa = 'san-pham' | 'nhom';

export const THE_SAN_PHAM: { khoa: TheSanPhamKhoa; nhan: string }[] = [
  { khoa: 'san-pham', nhan: 'Sản phẩm' },
  { khoa: 'nhom', nhan: 'Nhóm sản phẩm' },
];

/*
 * `khongDau`, `locSanPham` và `locQuyDinh` ĐÃ GỠ ở `0049`.
 *
 * Cả ba lọc trên mảng ĐÃ TẢI VỀ, mà màn hình chỉ tải 200 dòng đầu — nên vượt 200
 * dòng là gõ tên một thứ có thật vẫn ra "không tìm thấy", trái muc 11.3. Việc
 * tìm chuyển hẳn sang máy chủ (`?q=`), và phép bỏ dấu giờ có hai bản: `norm()`
 * ở `@csbh/http-kit` cho từ khoá, `sys.khong_dau()` trong CSDL cho cột chuẩn
 * hoá. Một ca kiểm thử giữ hai bản bằng nhau.
 *
 * Giao diện KHÔNG còn bản thứ ba: một phép chuẩn hoá chạy ở trình duyệt mà lệch
 * với máy chủ chỉ tạo ra kết quả khác nhau ở hai nơi cho cùng một từ khoá.
 */

export const LOAI_GIA = ['GIA_BAN_CONG_TY'] as const;
export type LoaiGia = (typeof LOAI_GIA)[number];

/**
 * Nhãn để HIỂN THỊ, rộng hơn danh sách đặt được.
 *
 * Vẫn biết `GIA_BAN_BUON` vì lịch sử giá có thể còn dòng cũ ghi trước khi loại
 * đó rút khỏi danh mục — bảng lịch sử phải đọc ra chữ, không phải mã enum trần.
 */
export const NHAN_LOAI_GIA: Record<string, string> = {
  GIA_BAN_CONG_TY: 'Giá bán Công ty',
  GIA_BAN_BUON: 'Giá bán buôn (đã rút khỏi danh mục)',
};

export const TRANG_THAI_SAN_PHAM = ['DANG_AP_DUNG', 'DA_VO_HIEU_HOA'] as const;
export type TrangThaiSanPham = (typeof TRANG_THAI_SAN_PHAM)[number];

export const NHAN_TRANG_THAI_SAN_PHAM: Record<TrangThaiSanPham, string> = {
  DANG_AP_DUNG: 'Đang áp dụng',
  DA_VO_HIEU_HOA: 'Đã vô hiệu hoá',
};

/** Ba loại khách hàng (CUST-06). Ngưỡng chiết khấu khai theo từng loại. */
export const LOAI_KHACH_HANG = [1, 2, 3] as const;

/**
 * Nhãn của một loại khách hàng.
 *
 * Một hàm chứ không nội suy thẳng `Loại ${n}` ở bốn màn hình: khi nghiệp vụ đặt
 * tên thật cho ba loại (đại lý cấp 1, nhà thuốc, bệnh viện…) thì chỉ sửa ở đây.
 * Giá trị lạ vẫn hiện ra được — dữ liệu cũ không bao giờ nên hiện thành ô trống.
 */
export const nhanLoaiKhach = (n: number): string => `Loại ${n}`;

export type SanPham = {
  id: string;
  code: string;
  name: string;
  groupCode: string;
  status: TrangThaiSanPham;
};

export type NhomSanPham = { id: string; code: string; name: string };

export type DongGia = { priceType: LoaiGia; amount: string; effectiveFrom: string };

export type QuyDinhChietKhau = {
  /** Mã do Quản trị đặt — khoá chính từ `0024`, hiện ở cột *Id*. */
  code: string;
  /** HAI chiều khớp, không hơn (`0026`). `null` nghĩa là "mọi giá trị". */
  productGroupCode: string | null;
  customerType: number | null;
  effectiveFrom: string;
  thresholdRate2: number;
  specificity: number;
};

/**
 * Ngưỡng lưu dưới dạng PHẦN VẠN (basis point ×100): `int(0, 10_000)` ở máy chủ,
 * tức 10 000 = 100%. Giao diện nhập và hiện bằng phần trăm.
 *
 * Đổi ở đúng một chỗ. Rải phép chia 100 khắp các màn hình là cách chắc chắn để
 * có ngày một chỗ quên, và một ngưỡng sai 100 lần thì không ai đọc ra ngay.
 */
export const phanTramTuNguong = (n: number): string => (n / 100).toFixed(2).replace('.', ',');

/**
 * Đọc một con số người dùng gõ, chấp nhận CẢ dấu phẩy lẫn dấu chấm thập phân.
 *
 * Quy ước tiếng Việt là dấu phẩy (`FE-27`) và ô nhập hiển thị dấu phẩy, nhưng
 * bàn phím số trên laptop chỉ có dấu chấm. Nhận cả hai là nhận đúng những gì
 * người ta thật sự gõ; ép một kiểu là thỉnh thoảng có người nhập xong thấy ô
 * báo "không phải số" mà không hiểu vì sao.
 *
 * Trả `NaN` khi không đọc được — người gọi tự quyết định coi đó là lỗi hay là
 * trạng thái gõ dở.
 */
export const doiSoThapPhan = (s: string): number => {
  const t = s.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

export const nguongTuPhanTram = (s: string): number => Math.round(doiSoThapPhan(s) * 100);

/** Câu mô tả phạm vi áp dụng của một quy định — hai ô rời rạc đọc rất khó. */
export function phamViChietKhau(q: QuyDinhChietKhau): string {
  return [
    q.productGroupCode ? `nhóm ${q.productGroupCode}` : 'mọi nhóm sản phẩm',
    q.customerType === null ? 'mọi loại khách' : `khách loại ${q.customerType}`,
  ].join(' · ');
}

