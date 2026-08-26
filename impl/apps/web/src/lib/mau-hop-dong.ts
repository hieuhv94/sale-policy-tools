/**
 * Kiểu dữ liệu và nhãn của **văn bản mẫu** — dùng chung cho cả hai loại mẫu.
 */
/*
 * `DINH_DANG`, `NHAN_DINH_DANG` và `TIEN_TO_DONG` ĐÃ GỠ (`0067`).
 *
 * Định dạng không còn là một ô người soạn mẫu chọn: nó gắn cứng vào TRƯỜNG
 * NGUỒN ở `services/document/src/contracts/sources.ts`. Câu hỏi *"công nợ hiển
 * thị kiểu tiền hay kiểu chữ?"* chỉ có một câu trả lời đúng, và hỏi hai mươi
 * lần cho hai mươi ô là mời người dùng trả lời sai ở đúng một trong số đó.
 *
 * `TIEN_TO_DONG` là tiền tố của nhóm khoá theo dòng sản phẩm — cả nhóm ấy đã bỏ
 * cùng cơ chế nhân bản dòng bảng.
 */

export type MauHopDong = {
  id: string;
  name: string;
  fileId: string;
  isDefault: boolean;
  updatedAt: string;
  /** Tập cột bảng sản phẩm của riêng mẫu này (`0067`). NULL = tập mặc định. */
  cotBang?: string[] | null;
  /** `0055` — hai loại mẫu; từ `0060` cả hai đều của Quản trị hệ thống. */
  kind?: LoaiMau;
  /** Chỉ mẫu hồ sơ: khổ giấy của chính file .docx. */
  paperSize?: KhoGiay | null;
  /**
   * Lúc mẫu bị rút khỏi ô chọn (`0098`). `null` = còn dùng được.
   *
   * Mẫu đã vô hiệu VẪN nằm trong bảng của màn hình quản trị — nếu không thì
   * "vô hiệu hoá" chính là "xoá", chỉ khác cái tên, vì không ai bật lại được.
   */
  voHieuHoaLuc?: string | null;
};

export type LoaiMau = 'HOP_DONG' | 'HO_SO';
export type KhoGiay = 'a4p' | 'a4l';

export const KHO_GIAY: KhoGiay[] = ['a4p', 'a4l'];
export const NHAN_KHO: Record<KhoGiay, string> = { a4p: 'A4 dọc', a4l: 'A4 ngang' };

/**
 * Tỷ lệ **rộng / cao** của từng khổ giấy — để khung xem mang đúng hình dáng của
 * tờ giấy sắp in ra (`0073`).
 *
 * Đây là đường đi vòng qua một chỗ ĐO KHÔNG ĐƯỢC. Khung `<iframe>` chứa trình
 * xem PDF của chính trình duyệt, là một tài liệu riêng: JavaScript không hỏi
 * được nó "trang này khổ gì". Nhưng với bản mềm và hợp đồng thì **không cần
 * hỏi** — khổ giấy đã đọc từ file .docx của mẫu lúc lưu (`khoGiayCua`) và đi
 * kèm mỗi mẫu trong danh sách chọn. Con số vốn đã nằm sẵn trong tay giao diện.
 *
 * 210×297 là kích thước A4 theo ISO 216, tính bằng milimét.
 */
export const TY_LE_KHO: Record<KhoGiay, number> = { a4p: 210 / 297, a4l: 297 / 210 };

/**
 * Tỷ lệ dùng khi KHÔNG biết gì về nội dung — bản scan PDF do người dùng tải lên.
 *
 * A4 dọc, vì gần như mọi bản scan giấy tờ đều là A4 dọc. Đoán sai thì trình xem
 * PDF của trình duyệt vẫn có thanh phóng to của riêng nó; đoán đúng phần lớn
 * lượt xem vẫn hơn là bày một khung vuông không giống tờ giấy nào.
 *
 * Muốn chính xác cả với bản scan thì phải đọc `MediaBox` của trang đầu LÚC TẢI
 * LÊN rồi lưu lại — máy chủ đang cầm file trong tay, chỗ ấy làm được. Chưa làm.
 */
export const TY_LE_MAC_DINH = TY_LE_KHO.a4p;

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
     * Có MỤC BẮT BUỘC theo muc 11.1 hay không — chỉ mẫu hồ sơ (`0067`).
     *
     * Cả hai loại mẫu đều dùng `{{bang_san_pham}}` từ `0067`, nên cờ này không
     * còn nói về bảng nữa. Cái còn khác nhau thật là phép kiểm lúc lưu: bản A4
     * phải có đủ mục của muc 11.1, hợp đồng thì không có mục nào bắt buộc.
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
    // `0098` đổi câu này: người xem không còn chọn mẫu nữa. TDV chọn một lần
    // lúc gửi duyệt, rồi mẫu đóng băng vào hồ sơ.
    moTa: 'Mẫu Word dựng bản CSBH A4. Trình dược viên chọn mẫu lúc gửi duyệt, và mẫu ấy gắn với hồ sơ.',
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

/** Một dòng ánh xạ. Hai trường, không hơn (`0067`). */
export type TruongAnhXa = { placeholder: string; source: string };

/** Kết quả đọc ô trống của một file — bước đầu của trang thêm mẫu (`0067`). */
export type ThongTinOTrong = {
  placeholders: string[];
  /** Ánh xạ máy chủ ĐOÁN SẴN theo tên ô trống. Ô nào không đoán được thì vắng. */
  goiY: TruongAnhXa[];
};

/** Một cột của bảng sản phẩm, đọc từ máy chủ (`0067`). */
export type CotBang = { khoa: string; nhan: string; batBuoc?: boolean };

/** Danh mục nguồn và cột, máy chủ trả về ở `GET :loai/sources` (`0067`). */
export type DanhMucNguon = {
  knownSources: string[];
  batBuoc?: string[];
  oBangSanPham?: string;
  cotBang?: CotBang[];
  cotBatBuoc?: string[];
};

/**
 * Nhóm nguồn dữ liệu theo tiền tố để ô chọn không phải một danh sách phẳng vài
 * chục dòng. Tên nhóm suy từ tiền tố chứ không khai tay: thêm nhóm mới ở máy chủ
 * thì ô chọn tự có, không cần sửa gì ở đây.
 */
export function nhomNguon(ds: string[]): { nhan: string; nguon: string[] }[] {
  const nhom = new Map<string, string[]>();
  for (const s of ds) {
    const khoa = s.split('.')[0] ?? 'khác';
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
  ngay_in: 'Khác',
};

/**
 * Mẫu ánh xạ hết ô trống thì mới LƯU được — máy chủ chặn
 * (`TEMPLATE_INCOMPLETE`), giao diện nói trước để nút Lưu xám đi.
 *
 * Ô bảng sản phẩm KHÔNG tính: nó không trỏ tới trường nào, hệ thống thay nó bằng
 * cả một bảng.
 */
export const luuDuoc = (oTrong: string[], daChon: Set<string>): boolean =>
  oTrong.every((p) => p === O_BANG_SAN_PHAM || daChon.has(p));

/**
 * NHÃN tiếng Việt của từng khoá trộn — cột chú thích của bảng hướng dẫn (`0056`).
 *
 * NGẮN GỌN (`0068`): nhãn đứng cạnh chính tên khoá, nên nó chỉ cần nói phần mà
 * tên khoá không nói. Câu dài ở đây làm cột chú thích xuống dòng và hai cột lệch
 * nhau — mà bảng này người ta liếc chứ không đọc.
 *
 * Giữ ở giao diện chứ không lấy từ máy chủ: máy chủ trả về danh sách KHOÁ, còn
 * đây là câu giải thích cho người đọc, và nó thuộc về chỗ có người đọc. Có một
 * ca kiểm thử đối chiếu hai bên — thêm khoá ở máy chủ mà quên nhãn ở đây thì
 * bảng hướng dẫn thiếu một dòng, và người soạn mẫu không biết khoá ấy tồn tại.
 */
export const NHAN_KHOA: Record<string, string> = {
  'ho_so.ma_ho_so': 'Mã hồ sơ',
  'ho_so.phien_ban': 'Phiên bản',
  'ho_so.trang_thai': 'Trạng thái',
  'ho_so.ngay_ap_dung': 'Ngày áp dụng',
  'ho_so.ngay_hieu_luc': 'Ngày hiệu lực',
  'ho_so.tep_dinh_kem': 'Tệp đính kèm',

  'ho_so.ma_khach_hang': 'Mã khách hàng',
  'ho_so.ten_khach_hang': 'Tên khách hàng',
  'ho_so.ma_so_thue': 'Mã số thuế',
  'ho_so.dia_chi_dang_ky': 'Địa chỉ đăng ký',
  'ho_so.noi_nhan_hang': 'Nơi nhận hàng',
  'ho_so.nguoi_dai_dien': 'Người đại diện',
  'ho_so.chuc_danh_dai_dien': 'Chức danh người đại diện',
  'ho_so.dien_thoai': 'Số điện thoại',
  'ho_so.cong_no': 'Công nợ',

  'ho_so.nguoi_de_nghi': 'Người đề nghị',
  'ho_so.truong_bo_phan': 'Trưởng bộ phận',
  'ho_so.ke_toan': 'Kế toán',
  'ho_so.sale_admin': 'Sale Admin',
  'ho_so.ngay_tbp_ky': 'Ngày TBP ký',
  'ho_so.ngay_kt_nhan_l1': 'Ngày KT nhận lần 1',
  'ho_so.ngay_kt_nhan_l2': 'Ngày KT nhận lần 2',
  'ho_so.chu_ky_so_TBP': 'Khối chữ ký số của TBP',

  ngay_in: 'Ngày in văn bản',
};

/** Ô trống được thay bằng CẢ BẢNG sản phẩm — chỉ mẫu hồ sơ dùng tới. */
export const O_BANG_SAN_PHAM = '{{bang_san_pham}}';

/** Khoá viết thành ô trống để chép vào file Word. */
export const oTrongCua = (khoa: string): string => `{{${khoa}}}`;
