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
 * Danh mục tra cứu không có thẻ riêng — nó là khối trong màn hình Chiết khấu, vì
 * kênh phân phối là một chiều của chính quy định chiết khấu.
 *
 * "Người ký" đã gỡ khỏi giao diện: yêu cầu nghiệp vụ cho nó chưa rõ. API bên
 * `catalog` vẫn còn và vẫn có test — gỡ màn hình không phải là xoá nghiệp vụ.
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

/**
 * Bỏ dấu tiếng Việt để tìm kiếm.
 *
 * Người dùng gõ "sua" phải ra "Sữa" — gõ đủ dấu trên bàn phím điện thoại giữa
 * lúc đang ngồi với khách hàng là thứ không ai làm. `NFD` tách dấu thành ký tự
 * riêng rồi xoá dải dấu đi; `đ` không có dạng tách nên phải thay tay.
 */
export const khongDau = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/**
 * Lọc sản phẩm theo từ khoá — khớp cả TÊN và MÃ.
 *
 * Khớp cả mã vì người dùng đọc mã từ hoá đơn giấy nhiều hơn là nhớ tên đầy đủ,
 * và một ô tìm kiếm chỉ ăn tên thì họ gõ mã vào rồi tưởng sản phẩm không tồn tại.
 */
export const locSanPham = <T extends { code: string; name: string }>(
  ds: T[],
  tuKhoa: string,
): T[] => {
  const k = khongDau(tuKhoa.trim());
  if (k === '') return ds;
  return ds.filter((s) => khongDau(s.name).includes(k) || khongDau(s.code).includes(k));
};

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

/** Ba loại danh mục tra cứu — cố định, khớp `LOOKUP_KINDS` phía máy chủ. */
export const LOAI_TRA_CUU = ['province', 'hospital', 'channel'] as const;
export type LoaiTraCuu = (typeof LOAI_TRA_CUU)[number];

export const NHAN_TRA_CUU: Record<LoaiTraCuu, string> = {
  province: 'Tỉnh / Thành phố',
  hospital: 'Bệnh viện',
  channel: 'Kênh bán',
};

/** Ba loại khách hàng (CUST-06). Ngưỡng chiết khấu khai theo từng loại. */
export const LOAI_KHACH_HANG = [1, 2, 3] as const;

export type SanPham = {
  id: string;
  code: string;
  name: string;
  groupCode: string;
  status: TrangThaiSanPham;
  defaultRate2Type1: number | null;
  defaultRate2Type2: number | null;
  defaultRate2Type3: number | null;
};

export type NhomSanPham = { id: string; code: string; name: string };

export type DongGia = { priceType: LoaiGia; amount: string; effectiveFrom: string };

export type QuyDinhChietKhau = {
  id: string;
  productGroupCode: string | null;
  customerType: number | null;
  channelCode: string | null;
  effectiveFrom: string;
  thresholdRate2: number;
  specificity: number;
};

export type MucTraCuu = { code: string; name: string };


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

/** Câu mô tả phạm vi áp dụng của một quy định — bốn ô rời rạc đọc rất khó. */
export function phamViChietKhau(q: QuyDinhChietKhau): string {
  const phan: string[] = [];
  phan.push(q.productGroupCode ? `nhóm ${q.productGroupCode}` : 'mọi nhóm sản phẩm');
  phan.push(q.customerType === null ? 'mọi loại khách' : `khách loại ${q.customerType}`);
  if (q.channelCode) phan.push(`kênh ${q.channelCode}`);
  return phan.join(' · ');
}
