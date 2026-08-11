/**
 * Kiểu dữ liệu và bảng tra của màn hình Danh mục.
 *
 * Năm thẻ, và thứ tự trong `MUC_DANH_MUC` là thứ tự PHỤ THUỘC chứ không phải
 * thứ tự quan trọng: phải có nhóm sản phẩm mới tạo được sản phẩm, phải có sản
 * phẩm mới đặt được giá, và quy định chiết khấu tham chiếu tới nhóm. Người
 * quản trị mở màn hình lần đầu không biết điều đó, nên các thẻ xếp theo đúng
 * trình tự họ cần làm.
 */

export type MucDanhMuc = 'san-pham' | 'nhom' | 'chiet-khau' | 'tra-cuu' | 'nguoi-ky';

export const MUC_DANH_MUC: { khoa: MucDanhMuc; nhan: string }[] = [
  { khoa: 'nhom', nhan: 'Nhóm sản phẩm' },
  { khoa: 'san-pham', nhan: 'Sản phẩm' },
  { khoa: 'chiet-khau', nhan: 'Quy định chiết khấu' },
  { khoa: 'tra-cuu', nhan: 'Danh mục tra cứu' },
  { khoa: 'nguoi-ky', nhan: 'Người ký' },
];

/** Đúng hai loại giá. Giá bán lẻ niêm yết CHÍNH LÀ Giá bán Công ty (CAT-03). */
export const LOAI_GIA = ['GIA_BAN_CONG_TY', 'GIA_BAN_BUON'] as const;
export type LoaiGia = (typeof LOAI_GIA)[number];

export const NHAN_LOAI_GIA: Record<LoaiGia, string> = {
  GIA_BAN_CONG_TY: 'Giá bán Công ty',
  GIA_BAN_BUON: 'Giá bán buôn',
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

export type NguoiKy = {
  id: string;
  fullName: string;
  title: string;
  unit: string;
  signScope: string;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
};

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
