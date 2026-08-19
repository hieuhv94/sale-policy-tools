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
export const TIEN_TO_DONG = 'san_pham.';

export type MauHopDong = {
  id: string;
  name: string;
  fileId: string;
  isActive: boolean;
  isDefault: boolean;
  publishedAt: string | null;
  updatedAt: string;
  /** `0055` — HOP_DONG của Sale Admin, HO_SO của Quản trị hệ thống. */
  kind?: LoaiMau;
  /** Chỉ mẫu hồ sơ: khổ giấy của chính file .docx. */
  paperSize?: KhoGiay | null;
};

export type LoaiMau = 'HOP_DONG' | 'HO_SO';
export type KhoGiay = 'a4p' | 'a4l';

export const KHO_GIAY: KhoGiay[] = ['a4p', 'a4l'];
export const NHAN_KHO: Record<KhoGiay, string> = { a4p: 'A4 dọc', a4l: 'A4 ngang' };

/**
 * Cấu hình riêng của từng loại mẫu (`0055`).
 *
 * Hai màn hình dùng CHUNG một thành phần: cơ chế trùng khít — tải .docx lên, đọc
 * ô trống, ánh xạ, ban hành — chỉ khác chủ sở hữu, đường API và cách nói. Chép
 * thành hai màn hình 560 dòng là hai chỗ phải sửa mỗi lần đổi cơ chế.
 */
export const CAU_HINH_MAU: Record<
  LoaiMau,
  {
    duong: string;
    tieuDe: string;
    moTa: string;
    /**
     * Bảng sản phẩm do HỆ THỐNG dựng — chỉ đúng với mẫu hồ sơ (`0055`).
     *
     * Tới `0057` cờ này tên là `theoKhoGiay` và gánh hai việc chẳng liên quan
     * nhau: "mỗi khổ giấy một mẫu" và "bảng do hệ thống dựng, có 13 mục bắt
     * buộc". Việc thứ nhất mất hẳn ở `0058` — người xem chọn mẫu chứ không chọn
     * khổ — nên cái tên cũ giờ chỉ còn tả sai việc thứ hai.
     */
    bangDoHeThongDung: boolean;
    nhanTaiLen: string;
  }
> = {
  HOP_DONG: {
    duong: '/contract-templates',
    tieuDe: 'Mẫu hợp đồng',
    moTa: 'Mẫu Word có ô trống, được trộn dữ liệu hồ sơ vào lúc Kế toán xuất hợp đồng.',
    bangDoHeThongDung: false,
    nhanTaiLen: 'Tải mẫu hợp đồng',
  },
  HO_SO: {
    duong: '/policy-templates',
    tieuDe: 'Giấy tờ mẫu',
    moTa: 'Mẫu Word dựng bản CSBH A4. Người xem chọn mẫu nào lúc xem bản mềm.',
    bangDoHeThongDung: true,
    nhanTaiLen: 'Tải mẫu hồ sơ CSBH',
  },
};

/** Một mẫu ĐANG DÙNG, đúng những gì ô chọn cần (`0058`). */
export type MauChon = {
  id: string;
  ten: string;
  khoGiay: KhoGiay | null;
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
  /** `0055`, chỉ mẫu hồ sơ: trường nguồn bắt buộc còn THIẾU. */
  thieu?: string[];
  /** `0055`, chỉ mẫu hồ sơ: mẫu có ô bảng sản phẩm chưa. */
  coBangSanPham?: boolean;
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

/**
 * Nhãn nhóm cho ô chọn. Khoá là tiền tố của trường nguồn (`0056`).
 *
 * `ho_so` gom TẤT CẢ — thông tin chung, khách hàng, người xử lý. Người soạn mẫu
 * nghĩ theo câu hỏi "trong hồ sơ này có gì", không nghĩ theo lược đồ CSDL.
 */
const NHAN_NHOM: Record<string, string> = {
  ho_so: 'Hồ sơ CSBH',
  cong_ty: 'Công ty',
  ngay_in: 'Khác',
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

/**
 * NHÃN tiếng Việt của từng khoá trộn — nội dung bảng hướng dẫn trên trang thêm
 * mẫu (`0056`).
 *
 * Giữ ở giao diện chứ không lấy từ máy chủ: máy chủ trả về danh sách KHOÁ, còn
 * đây là câu giải thích cho người đọc, và nó thuộc về chỗ có người đọc. Có một
 * ca kiểm thử đối chiếu hai bên — thêm khoá ở máy chủ mà quên nhãn ở đây thì
 * bảng hướng dẫn thiếu một dòng, và người soạn mẫu không biết khoá ấy tồn tại.
 */
export const NHAN_KHOA: Record<string, string> = {
  'ho_so.ma_ho_so': 'Mã hồ sơ CSBH',
  'ho_so.phien_ban': 'Số phiên bản',
  'ho_so.trang_thai': 'Trạng thái hồ sơ',
  'ho_so.ngay_ap_dung': 'Ngày áp dụng',
  'ho_so.ngay_hieu_luc': 'Ngày bắt đầu có hiệu lực',
  'ho_so.tep_dinh_kem': 'Danh sách tệp đính kèm',

  'ho_so.ma_khach_hang': 'Mã khách hàng',
  'ho_so.ten_khach_hang': 'Tên khách hàng',
  'ho_so.ma_so_thue': 'Mã số thuế khách hàng',
  'ho_so.dia_chi_dang_ky': 'Địa chỉ đăng ký',
  'ho_so.noi_nhan_hang': 'Nơi nhận hàng — trống thì lấy địa chỉ đăng ký',
  'ho_so.nguoi_dai_dien': 'Người đại diện',
  'ho_so.chuc_danh_dai_dien': 'Chức danh người đại diện',
  'ho_so.cong_no': 'Công nợ',

  'ho_so.nguoi_de_nghi': 'Người đề nghị — Trình dược viên lập hồ sơ',
  'ho_so.truong_bo_phan': 'Trưởng bộ phận đã ký',
  'ho_so.ke_toan': 'Kế toán tiếp nhận',
  'ho_so.sale_admin': 'Sale Admin xử lý',
  'ho_so.ngay_tbp_ky': 'Ngày Trưởng bộ phận ký',
  'ho_so.ngay_kt_nhan_l1': 'Ngày Kế toán tiếp nhận lần 1',
  'ho_so.ngay_kt_nhan_l2': 'Ngày Kế toán tiếp nhận lần 2',
  'ho_so.chu_ky_so_TBP': 'Khối chữ ký số — “TBP đã ký số” và ngày ký ở dòng dưới',

  'cong_ty.ten': 'Tên Công ty',
  'cong_ty.dia_chi': 'Địa chỉ Công ty',
  'cong_ty.ma_so_thue': 'Mã số thuế Công ty',

  ngay_in: 'Ngày in văn bản — không phải ngày của hồ sơ',

  'san_pham.stt': 'Số thứ tự dòng',
  'san_pham.ma_san_pham': 'Mã sản phẩm',
  'san_pham.ten_san_pham': 'Tên sản phẩm',
  'san_pham.gia_cong_ty': 'Giá công ty',
  'san_pham.gia_ban_buon': 'Giá bán buôn',
  'san_pham.cpbh_tong': 'CPBH tổng',
  'san_pham.gia_thu_ve': 'Giá thu về',
  'san_pham.ty_le_ck': 'Tỷ lệ chiết khấu',
};

/** Ô trống được thay bằng CẢ BẢNG sản phẩm — chỉ mẫu hồ sơ dùng tới. */
export const O_BANG_SAN_PHAM = '{{bang_san_pham}}';

/** Khoá viết thành ô trống để chép vào file Word. */
export const oTrongCua = (khoa: string): string => `{{${khoa}}}`;
