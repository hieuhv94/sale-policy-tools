/**
 * Bảng tra và kiểu dữ liệu của màn hình Danh mục.
 *
 * BA thẻ, và ba thôi. Trước P20 có năm — "Nhóm sản phẩm" và "Danh mục tra cứu"
 * đứng riêng, cộng thêm "Người ký". Năm thẻ cho một màn hình mà bốn trong năm
 * chỉ Quản trị vào được là bắt mọi người khác bấm qua mấy màn hình trống mới
 * hiểu ra không có gì cho mình.
 *
 * Hai thẻ cũ KHÔNG mất chức năng, chúng thành khối bên trong:
 *   * Nhóm sản phẩm → trong thẻ Sản phẩm, vì nhóm là trường bắt buộc của sản
 *     phẩm; tạo sản phẩm mà chưa có nhóm là đứng luôn ở ô đầu tiên.
 *   * Danh mục tra cứu → trong thẻ Quy định chiết khấu, vì kênh phân phối là
 *     một chiều của chính quy định chiết khấu. Tỉnh và bệnh viện đi nhờ cùng
 *     khối đó — chúng là dữ liệu tra cứu dùng chung, không thuộc riêng thẻ nào.
 *
 * "Người ký" đã gỡ khỏi giao diện: yêu cầu nghiệp vụ cho nó chưa rõ. API bên
 * `catalog` vẫn còn và vẫn có test — gỡ màn hình không phải là xoá nghiệp vụ.
 */

export type MucDanhMuc = 'san-pham' | 'chiet-khau' | 'giay-to-mau';

export const MUC_DANH_MUC: { khoa: MucDanhMuc; nhan: string }[] = [
  { khoa: 'san-pham', nhan: 'Sản phẩm' },
  { khoa: 'chiet-khau', nhan: 'Quy định chiết khấu' },
  { khoa: 'giay-to-mau', nhan: 'Giấy tờ mẫu' },
];

/** Thẻ nào các vai trò KHÔNG quản trị nhìn thấy. */
export const THE_CHUNG: MucDanhMuc[] = ['san-pham', 'chiet-khau'];

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
  effectiveTo: string | null;
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
export const phanTramTuNguong = (n: number): string => (n / 100).toFixed(2);

export const nguongTuPhanTram = (s: string): number => Math.round(Number(s) * 100);

/** Câu mô tả phạm vi áp dụng của một quy định — bốn ô rời rạc đọc rất khó. */
export function phamViChietKhau(q: QuyDinhChietKhau): string {
  const phan: string[] = [];
  phan.push(q.productGroupCode ? `nhóm ${q.productGroupCode}` : 'mọi nhóm sản phẩm');
  phan.push(q.customerType === null ? 'mọi loại khách' : `khách loại ${q.customerType}`);
  if (q.channelCode) phan.push(`kênh ${q.channelCode}`);
  return phan.join(' · ');
}
