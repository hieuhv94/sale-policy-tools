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
  /**
   * Xoá hồ sơ — CHỈ TDV (`0035`).
   *
   * Bốn vai trò kia có mặt ở đây từ P11d và chưa bao giờ xoá được gì: máy chủ
   * luôn đòi hồ sơ ở trạng thái của người lập (`Nháp` hoặc `Yêu cầu chỉnh sửa`)
   * VÀ đúng TDV đang phụ trách, nên với họ nút ấy chỉ dẫn tới 403 — đúng thứ
   * bảng này sinh ra để không bày ra.
   *
   * Giống `xoaKhachHang`: đây là điều kiện CẦN. "Đúng người phụ trách" là điều
   * kiện đủ, và chỉ máy chủ biết.
   */
  xoaHoSo: ['TDV'],
  guiDuyet: ['TDV'],
  kySo: ['TBP'],
  /*
   * TÁCH LÀM HAI (`0038`), trước là một khoá `traLai: ['TBP', 'KE_TOAN']`.
   *
   * "Trả lại" là ba hành động của hai người khác nhau: Trưởng bộ phận trả ở
   * bước duyệt, Kế toán trả ở L1 và L2. Gộp một khoá thì bảng này nói Kế toán
   * trả lại được ở bước của Trưởng bộ phận — sai, và đúng kiểu sai làm mọc ra
   * một nút 403. Ca kiểm thử đối chiếu bảng này với máy trạng thái bắt được.
   */
  traLaiTbp: ['TBP'],
  traLaiKt: ['KE_TOAN'],
  tuChoi: ['TBP'],
  tiepNhanL1: ['KE_TOAN'],
  banGiao: ['SALE_ADMIN'],
  tiepNhanL2: ['KE_TOAN'],
  yeuCauInLai: ['KE_TOAN'],
  /** Kế toán là người xuất hợp đồng, không phải Trưởng bộ phận (muc 8.3, FE-24). */
  xuatHopDong: ['KE_TOAN', 'SALE_ADMIN'],
  lapKhachHang: ['TDV'],
  suaKhachHang: ['TDV', 'KE_TOAN', 'SALE_ADMIN', 'QUAN_TRI'],
  /**
   * CHỈ Quản trị hệ thống (`0031`).
   *
   * Sale Admin có quyền này từ P11d, và rà lại thì không yêu cầu nghiệp vụ nào
   * cấp nó — YCNV §6.1 chỉ nói "khách hàng do TDV tạo", §2.5 liệt kê bảy đầu
   * việc của Sale Admin mà không có việc giao khách. Lý do thật của lựa chọn cũ
   * là Sale Admin đứng ở gốc nhánh cây chứa TDV đó, và cây ấy đã bị bỏ.
   */
  doiTdvPhuTrach: ['QUAN_TRI'],
  /**
   * Xoá một khách hàng (`0034`).
   *
   * Tên khoá giữ nguyên `xoaKhachHang` cho khớp với nhãn trên màn hình. Bên
   * trong, "xoá" có hai kết cục — xoá hẳn dòng, hoặc giữ lại và đánh dấu
   * `NGUNG_HOP_TAC` — nhưng đó là chi tiết của hệ thống, không phải hai quyền.
   *
   * CHỈ TDV, và máy chủ còn siết thêm một tầng: đúng TDV phụ trách khách đó
   * (`assertChinhTdv`). Bảng này chỉ nói được vai trò, không nói được "chính
   * người ấy" — nên nó là điều kiện CẦN, không phải điều kiện đủ.
   */
  xoaKhachHang: ['TDV'],
  quanTriDanhMuc: ['QUAN_TRI'],
  /** Cả hai loại văn bản mẫu — hồ sơ CSBH và hợp đồng (`0060`). */
  quanTriVanBanMau: ['QUAN_TRI'],
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
  // "Danh mục" tách làm ba mục menu riêng ở P22. Sản phẩm và Chiết khấu mọi vai
  // trò đọc được — đó là hai thứ phải tra khi lập và khi duyệt hồ sơ.
  sanPham: VAI_TRO,
  chietKhau: VAI_TRO,
  /*
   * Văn bản mẫu CHỈ Quản trị — cả hai loại (`0060`).
   *
   * Tới `0059` là hai mục: `giayToMau` của Quản trị và `mauHopDong` của Sale
   * Admin. Khách hàng gộp chủ sở hữu về một người ngày 20/08, nên hai mục thành
   * hai thẻ trong một trang.
   *
   * Sale Admin KHÔNG còn mục menu nào ở đây, và cũng không mất gì: họ vẫn xuất
   * hợp đồng và vẫn chọn mẫu nào lúc xuất, ngay trên màn hình hồ sơ.
   */
  vanBanMau: ['QUAN_TRI'],
  /** Nhật ký chỉ Ban lãnh đạo và Quản trị đọc; các vai trò trong luồng thì không. */
  nhatKy: ['BAN_LANH_DAO', 'QUAN_TRI'],
  nguoiDung: ['QUAN_TRI'],
} as const satisfies Record<string, readonly VaiTro[]>;

export type MucXem = keyof typeof QUYEN_XEM;

export const xem = (vaiTro: string | undefined, muc: MucXem): boolean =>
  vaiTro !== undefined && (QUYEN_XEM[muc] as readonly string[]).includes(vaiTro);

/** Các mục điều hướng, lọc theo vai trò. */
export type MucDieuHuong = { duong: string; nhan: string; muc: MucXem };

export const DIEU_HUONG: MucDieuHuong[] = [
  { duong: '/', nhan: 'Tổng quan', muc: 'hoSo' },
  { duong: '/ho-so', nhan: 'Hồ sơ CSBH', muc: 'hoSo' },
  { duong: '/khach-hang', nhan: 'Khách hàng', muc: 'khachHang' },
  { duong: '/bao-cao', nhan: 'Báo cáo', muc: 'baoCao' },
  { duong: '/san-pham', nhan: 'Sản phẩm', muc: 'sanPham' },
  { duong: '/chiet-khau', nhan: 'Chiết khấu', muc: 'chietKhau' },
  { duong: '/van-ban-mau', nhan: 'Văn bản mẫu', muc: 'vanBanMau' },
  { duong: '/nguoi-dung', nhan: 'Người dùng', muc: 'nguoiDung' },
  { duong: '/nhat-ky', nhan: 'Nhật ký', muc: 'nhatKy' },
];

export const dieuHuongCho = (vaiTro: string | undefined): MucDieuHuong[] =>
  DIEU_HUONG.filter((m) => xem(vaiTro, m.muc));

/**
 * Mỗi hành động trong luồng đòi QUYỀN nào (`0038`).
 *
 * Bảy trong tám quyền dưới đây đã khai từ P11 mà **chưa chỗ nào gọi** — dải nút
 * *Thao tác* vẽ thẳng danh sách máy chủ trả về, không lọc gì. Bảng này nối chúng
 * lại với nút.
 *
 * Đây là lớp thứ HAI. Chốt thật nằm ở `/policies/:id/allowed-actions`, giờ đã
 * lọc theo vai trò. Giữ thêm lớp này vì `FE-23` quét đúng bảng quyền để khẳng
 * định Ban lãnh đạo không có nút ghi nào — một khẳng định đọc được ngay trong mã
 * thay vì phải dựng máy chủ lên mới biết.
 *
 * `quyen.test.ts` khẳng định bảng này KHỚP đúng máy trạng thái ở mọi cặp
 * (trạng thái × vai trò), nên nó là bản sao ĐƯỢC KIỂM chứ không phải một bảng
 * thứ hai tự do trôi.
 */
export const QUYEN_HANH_DONG: Record<string, Quyen> = {
  SUBMIT: 'guiDuyet',
  RESUBMIT_AFTER_EDIT: 'guiDuyet',
  TBP_SIGN: 'kySo',
  TBP_RETURN: 'traLaiTbp',
  TBP_REJECT: 'tuChoi',
  KT_RECEIVE_L1: 'tiepNhanL1',
  KT_RETURN_L1: 'traLaiKt',
  SA_HANDOVER: 'banGiao',
  KT_RECEIVE_L2: 'tiepNhanL2',
  KT_RETURN_L2: 'traLaiKt',
  KT_REQUEST_REPRINT: 'yeuCauInLai',
};

/**
 * Vai trò này có bấm được hành động ấy không.
 *
 * Hành động KHÔNG có trong bảng là hành động của HỆ THỐNG — chỉ còn `SUPERSEDE`,
 * tự chạy khi một bản mới có hiệu lực. Không ai bấm nó, nên trả `false` cho mọi
 * vai trò. Trước `0038` nó hiện ra thành nút, và vì không có nhãn tiếng Việt nên
 * hiện nguyên mã viết hoa. (`PUBLISH_SIGNED` từng đứng cùng nhóm, gỡ ở `0064`.)
 */
export const canHanhDong = (vaiTro: string | undefined, hanhDong: string): boolean => {
  const q = QUYEN_HANH_DONG[hanhDong];
  return q !== undefined && can(vaiTro, q);
};

/**
 * Nhãn tiếng Việt của nút. KHÔNG phải bảng phân quyền — xem `QUYEN_HANH_DONG`.
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
