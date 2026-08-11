/**
 * Kiểu dữ liệu của mẫu hợp đồng, và bảng định dạng trường.
 *
 * `DINH_DANG` là bản sao của `FORMATS` trong `services/document/src/contracts/
 * sources.ts` — máy chủ không có endpoint nào trả danh sách này ra, chỉ trả
 * `knownSources`. Bản sao là chỗ dễ lệch, nên `mau-hop-dong.test.ts` đọc thẳng
 * tệp nguồn của máy chủ và đối chiếu: thêm một định dạng ở máy chủ mà quên ở đây
 * thì test đỏ, chứ không phải Sale Admin phát hiện ra khi ô chọn thiếu mục.
 */
export const DINH_DANG = ['text', 'money_vnd', 'date_dmy', 'percent_2'] as const;
export type DinhDang = (typeof DINH_DANG)[number];

export const NHAN_DINH_DANG: Record<DinhDang, string> = {
  text: 'Chữ, giữ nguyên',
  money_vnd: 'Tiền (1.234.567)',
  date_dmy: 'Ngày (31/12/2026)',
  percent_2: 'Phần trăm, hai chữ số',
};

/** Tiền tố của nhóm trường theo dòng sản phẩm — dòng bảng mang nó sẽ được nhân bản. */
export const TIEN_TO_DONG = 'policy.lines[].';

export type MauHopDong = {
  id: string;
  name: string;
  fileId: string;
  isActive: boolean;
  isDefault: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export type TruongAnhXa = {
  placeholder: string;
  source: string;
  required: boolean;
  format: string | null;
};

export type ThongTinOTrong = {
  placeholders: string[];
  mapped: TruongAnhXa[];
  unmapped: string[];
  knownSources: string[];
};

/**
 * Nhóm nguồn dữ liệu theo tiền tố để ô chọn không phải một danh sách phẳng vài
 * chục dòng. Tên nhóm suy từ tiền tố chứ không khai tay: thêm nhóm mới ở máy chủ
 * thì ô chọn tự có, không cần sửa gì ở đây.
 */
export function nhomNguon(ds: string[]): { nhan: string; nguon: string[] }[] {
  const nhom = new Map<string, string[]>();
  for (const s of ds) {
    const khoa = s.startsWith(TIEN_TO_DONG) ? 'Dòng sản phẩm' : (s.split('.')[0] ?? 'khác');
    const cu = nhom.get(khoa);
    if (cu) cu.push(s);
    else nhom.set(khoa, [s]);
  }
  return [...nhom].map(([nhan, nguon]) => ({ nhan: NHAN_NHOM[nhan] ?? nhan, nguon }));
}

const NHAN_NHOM: Record<string, string> = {
  customer: 'Khách hàng',
  policy: 'Hồ sơ CSBH',
  company: 'Công ty',
  signer: 'Người ký',
  'Dòng sản phẩm': 'Dòng sản phẩm (nhân bản theo dòng)',
};

/**
 * Mẫu đã ánh xạ hết ô trống thì mới ban hành được — máy chủ chặn
 * (`TEMPLATE_INCOMPLETE`), giao diện nói trước.
 *
 * Nhận danh sách ô trống và tập ô ĐÃ CHỌN NGUỒN trên bảng đang mở, không đọc
 * `unmapped` của lần tải đầu: người dùng vừa điền xong cả bảng thì `unmapped`
 * còn là ảnh chụp lúc mở, và nút Ban hành sẽ vẫn xám.
 */
export const banHanhDuoc = (oTrong: string[], daChon: Set<string>): boolean =>
  oTrong.every((p) => daChon.has(p));
