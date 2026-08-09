/**
 * Ai được thấy gì trên giao diện — khai ở MỘT chỗ.
 *
 * Đây KHÔNG phải lớp bảo mật. Máy chủ kiểm quyền lại từ đầu ở mọi lời gọi, và
 * giấu một nút không ngăn được ai gọi thẳng API. Mục đích ở đây hẹp hơn: đừng
 * bày ra nút mà bấm vào chỉ nhận 403 — người dùng không biết mình sai ở đâu.
 *
 * Rải `if (role === ...)` khắp các màn hình là cách chắc chắn để có ngày một
 * màn hình sót — và `FE-23` với `FE-25` không kiểm tay từng cái mà quét toàn bộ
 * bảng dưới đây, nên bảng này phải là nguồn duy nhất.
 */
export type VaiTro = 'TDV' | 'TBP' | 'KE_TOAN' | 'SALE_ADMIN' | 'BAN_LANH_DAO' | 'QUAN_TRI';

export const VAI_TRO: VaiTro[] = [
  'TDV',
  'TBP',
  'KE_TOAN',
  'SALE_ADMIN',
  'BAN_LANH_DAO',
  'QUAN_TRI',
];

/**
 * Mọi QUYỀN GHI của giao diện. Tên quyền mô tả việc nghiệp vụ, không mô tả nút.
 *
 * `BAN_LANH_DAO` không xuất hiện ở bất kỳ dòng nào — đó là nội dung của muc 2.6
 * và của `FE-23`, và cách viết này khiến việc đó **nhìn thấy được** thay vì phải
 * đi đọc sáu màn hình để suy ra.
 */
export const QUYEN_GHI = {
  lapHoSo: ['TDV'],
  suaHoSo: ['TDV'],
  xoaHoSo: ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'QUAN_TRI'],
  guiDuyet: ['TDV'],
  kySo: ['TBP'],
  traLai: ['TBP', 'KE_TOAN'],
  tuChoi: ['TBP'],
  tiepNhanL1: ['KE_TOAN'],
  banGiao: ['SALE_ADMIN'],
  tiepNhanL2: ['KE_TOAN'],
  yeuCauInLai: ['KE_TOAN'],
  /** Kế toán là người xuất hợp đồng, không phải Trưởng bộ phận (muc 8.3, FE-24). */
  xuatHopDong: ['KE_TOAN', 'SALE_ADMIN'],
  lapKhachHang: ['TDV'],
  suaKhachHang: ['TDV', 'KE_TOAN', 'SALE_ADMIN', 'QUAN_TRI'],
  doiTdvPhuTrach: ['SALE_ADMIN', 'QUAN_TRI'],
  quanTriDanhMuc: ['QUAN_TRI'],
  quanTriMauHopDong: ['SALE_ADMIN'],
  quanTriNguoiDung: ['QUAN_TRI'],
  taiTepDinhKem: ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN'],
} as const satisfies Record<string, readonly VaiTro[]>;

export type Quyen = keyof typeof QUYEN_GHI;

export const can = (vaiTro: string | undefined, quyen: Quyen): boolean =>
  vaiTro !== undefined && (QUYEN_GHI[quyen] as readonly string[]).includes(vaiTro);

/** Quyền ĐỌC. Ban lãnh đạo đọc được gần hết — chỉ không ghi được gì. */
export const QUYEN_XEM = {
  hoSo: VAI_TRO,
  khachHang: VAI_TRO,
  baoCao: VAI_TRO,
  danhMuc: VAI_TRO,
  /** Nhật ký chỉ Ban lãnh đạo và Quản trị đọc; các vai trò trong luồng thì không. */
  nhatKy: ['BAN_LANH_DAO', 'QUAN_TRI'],
  mauHopDong: ['SALE_ADMIN', 'QUAN_TRI'],
  nguoiDung: ['QUAN_TRI'],
} as const satisfies Record<string, readonly VaiTro[]>;

export type MucXem = keyof typeof QUYEN_XEM;

export const xem = (vaiTro: string | undefined, muc: MucXem): boolean =>
  vaiTro !== undefined && (QUYEN_XEM[muc] as readonly string[]).includes(vaiTro);

/** Các mục điều hướng, lọc theo vai trò. */
export type MucDieuHuong = { duong: string; nhan: string; muc: MucXem };

export const DIEU_HUONG: MucDieuHuong[] = [
  { duong: '/', nhan: 'Việc của tôi', muc: 'hoSo' },
  { duong: '/ho-so', nhan: 'Hồ sơ CSBH', muc: 'hoSo' },
  { duong: '/khach-hang', nhan: 'Khách hàng', muc: 'khachHang' },
  { duong: '/bao-cao', nhan: 'Báo cáo', muc: 'baoCao' },
  { duong: '/danh-muc', nhan: 'Danh mục', muc: 'danhMuc' },
  { duong: '/mau-hop-dong', nhan: 'Mẫu hợp đồng', muc: 'mauHopDong' },
  { duong: '/nguoi-dung', nhan: 'Người dùng', muc: 'nguoiDung' },
  { duong: '/nhat-ky', nhan: 'Nhật ký', muc: 'nhatKy' },
];

export const dieuHuongCho = (vaiTro: string | undefined): MucDieuHuong[] =>
  DIEU_HUONG.filter((m) => xem(vaiTro, m.muc));

/**
 * Hành động khả dụng ở một trạng thái, cho một vai trò.
 *
 * Máy trạng thái đầy đủ nằm ở `@csbh/domain-policy` phía máy chủ và API
 * `/policies/:id/allowed-actions` trả về danh sách chính xác. Bảng dưới đây chỉ
 * để **ẩn bớt nút trước khi hỏi máy chủ** — nếu hai bên lệch nhau thì máy chủ
 * thắng, và giao diện luôn hiển thị theo danh sách máy chủ trả về.
 */
export const HANH_DONG_NHAN: Record<string, string> = {
  SUBMIT: 'Gửi duyệt',
  TBP_SIGN: 'Ký số duyệt',
  TBP_RETURN: 'Trả lại chỉnh sửa',
  TBP_REJECT: 'Từ chối hồ sơ',
  KT_RECEIVE_L1: 'Tiếp nhận lần 1',
  KT_RETURN_L1: 'Trả lại (L1)',
  SA_HANDOVER: 'Bàn giao',
  KT_RECEIVE_L2: 'Tiếp nhận lần 2',
  KT_RETURN_L2: 'Trả lại (L2)',
  KT_REQUEST_REPRINT: 'Yêu cầu in lại',
  RESUBMIT_AFTER_EDIT: 'Gửi lại sau chỉnh sửa',
};

/** Hành động BẮT BUỘC nhập lý do (muc 3). */
export const CAN_LY_DO = new Set([
  'TBP_RETURN',
  'TBP_REJECT',
  'KT_RETURN_L1',
  'KT_RETURN_L2',
  'KT_REQUEST_REPRINT',
]);
