/**
 * Bộ biểu tượng — SVG nội tuyến, vẽ tay, không phông biểu tượng.
 *
 * Mẫu quản trị tham khảo dùng Bootstrap Icons, tức là một phông web ~120KB tải
 * về để dùng đúng mười một hình. Ba lý do không đi theo:
 *
 *   1. Phông biểu tượng là một lượt tải chặn hiển thị; trước khi nó về thì mọi
 *      biểu tượng là ô trống, và trên mạng 4G của trình dược viên ngoài thị
 *      trường thì "trước khi nó về" là vài giây.
 *   2. SVG nội tuyến ăn theo `currentColor`, nên đổi giao diện sáng/tối là
 *      chúng đổi theo, không cần một dòng CSS nào.
 *   3. `FE-38` đặt trần 250KB cho cả gói. Mười một hình vẽ tay tốn khoảng 2KB.
 *
 * Mọi hình đều `aria-hidden`: chúng đi kèm nhãn chữ, và một biểu tượng lặp lại
 * đúng chữ bên cạnh nó chỉ làm trình đọc màn hình đọc hai lần.
 */
import type { ReactNode } from 'react';

function Hinh({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const HinhViec = (
  <Hinh>
    <path d="M4 13h4l1.5 3h5L16 13h4" />
    <path d="M5.5 5h13l1.5 8v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z" />
  </Hinh>
);

const HinhHoSo = (
  <Hinh>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Hinh>
);

const HinhKhachHang = (
  <Hinh>
    <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
    <circle cx="10" cy="8" r="3.2" />
    <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 6" />
  </Hinh>
);

const HinhThongKe = (
  <Hinh>
    <path d="M4 20h16" />
    <path d="M7 20v-6M12 20V6M17 20v-9" />
  </Hinh>
);

const HinhDanhMuc = (
  <Hinh>
    <path d="M12 3 4 7v10l8 4 8-4V7z" />
    <path d="m4 7 8 4 8-4M12 11v10" />
  </Hinh>
);

/** Ba vạch đậm dần — bảng ngưỡng theo mức. */
const HinhChietKhau = (
  <Hinh>
    <path d="M4 18h4V9H4zM10 18h4V5h-4zM16 18h4v-6h-4z" />
  </Hinh>
);

/**
 * Hai tờ giấy chồng nhau — mẫu để nhân bản, không phải một văn bản cụ thể.
 *
 * Dùng cho cả *Văn bản mẫu* (`0060`). Hình riêng của mục *Mẫu hợp đồng* đã gỡ
 * cùng lúc với mục menu ấy — hai loại mẫu giờ là hai thẻ trong một trang, và
 * một trang thì có một biểu tượng.
 */
const HinhGiayToMau = (
  <Hinh>
    <path d="M8 3h7l3 3v10H8z" />
    <path d="M15 3v3h3M16 16v5H6V8h2" />
  </Hinh>
);

const HinhNguoiDung = (
  <Hinh>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1" />
  </Hinh>
);

// Trang Vận hành (`0255`): một chiếc máy chủ hai tầng.
const HinhVanHanh = (
  <Hinh>
    <rect x="4" y="4.5" width="16" height="6" rx="1.5" />
    <rect x="4" y="13.5" width="16" height="6" rx="1.5" />
    <path d="M7.5 7.5h.01M7.5 16.5h.01" />
  </Hinh>
);

// Trang Hướng dẫn (`0273`): một quyển sách mở.
const HinhHuongDan = (
  <Hinh>
    <path d="M12 6.5C10.5 5.3 8 4.8 4.5 5v13c3.5-.2 6 .3 7.5 1.5 1.5-1.2 4-1.7 7.5-1.5V5c-3.5-.2-6 .3-7.5 1.5z" />
    <path d="M12 6.5v13" />
  </Hinh>
);

const HinhNhatKy = (
  <Hinh>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Hinh>
);

/**
 * Biểu tượng của một mục điều hướng, tra theo ĐƯỜNG DẪN.
 *
 * Tra theo đường dẫn chứ không thêm một trường `bieuTuong` vào bảng `DIEU_HUONG`
 * ở `can.ts`: bảng đó là bảng PHÂN QUYỀN, và `FE-23` quét chính nó. Trộn chuyện
 * hình vẽ vào bảng quyền là mời người sau sửa quyền lúc đang sửa giao diện.
 *
 * Đường dẫn lạ trả `null` — thiếu một hình thì mục vẫn hiện đủ chữ.
 */
export function bieuTuongMuc(duong: string): ReactNode {
  switch (duong) {
    case '/':
      return HinhViec;
    case '/ho-so':
      return HinhHoSo;
    case '/khach-hang':
      return HinhKhachHang;
    case '/thong-ke':
    case '/bao-cao':
      return HinhThongKe;
    case '/danh-muc':
    case '/san-pham':
      return HinhDanhMuc;
    case '/chiet-khau':
      return HinhChietKhau;
    // Hai mục menu cũ gộp thành một ở `0060`. Giữ cả ba đường vì hai đường cũ
    // vẫn dẫn tới cùng màn hình — xem `App.tsx`.
    case '/van-ban-mau':
    case '/giay-to-mau':
    case '/mau-hop-dong':
      return HinhGiayToMau;
    case '/nguoi-dung':
      return HinhNguoiDung;
    case '/nhat-ky':
      return HinhNhatKy;
    case '/van-hanh':
      return HinhVanHanh;
    case '/huong-dan':
      return HinhHuongDan;
    default:
      return null;
  }
}

export function BieuTuongMenu() {
  return (
    <Hinh>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Hinh>
  );
}

export function BieuTuongDong() {
  return (
    <Hinh>
      <path d="M6 6l12 12M18 6 6 18" />
    </Hinh>
  );
}

/** Thay cho các ký tự 🗓 ✎ ✓ (`0257`): ký tự hiện theo phông của máy — 🗓 là emoji
    màu trên máy này, ô vuông rỗng trên máy kia — còn SVG đi cùng nét với mọi icon. */
export function BieuTuongLich() {
  return (
    <Hinh>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Hinh>
  );
}

export function BieuTuongBut() {
  return (
    <Hinh>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </Hinh>
  );
}

/** Xoá một dòng (`0267`) — thùng rác, cùng nét với mọi icon. */
export function BieuTuongThung() {
  return (
    <Hinh>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Hinh>
  );
}

/** Dòng có ghi chú (`0267`) — bong bóng chữ cạnh tên sản phẩm. */
export function BieuTuongGhiChu() {
  return (
    <Hinh>
      <path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4 4v-4H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 8.5h8M8 12h5" />
    </Hinh>
  );
}

export function BieuTuongDauTich() {
  return (
    <Hinh>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Hinh>
  );
}

/** Nút thu gọn / mở rộng thanh bên (`0257`): khung có cột trái, mũi tên chỉ hướng SẼ đi. */
export function BieuTuongThanhBen({ gon }: { gon: boolean }) {
  return (
    <Hinh>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={gon ? 'M9 4v16M13 10l2 2-2 2' : 'M9 4v16M16 10l-2 2 2 2'} />
    </Hinh>
  );
}

export function BieuTuongMatTroi() {
  return (
    <Hinh>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </Hinh>
  );
}

export function BieuTuongMatTrang() {
  return (
    <Hinh>
      <path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5z" />
    </Hinh>
  );
}

/** Con mắt của ô mật khẩu (`0222`): bấm vào thì HIỆN mật khẩu. */
export function BieuTuongMat() {
  return (
    <Hinh>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </Hinh>
  );
}

/** Con mắt gạch chéo: mật khẩu đang hiện, bấm vào thì ẨN lại. */
export function BieuTuongMatGach() {
  return (
    <Hinh>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </Hinh>
  );
}

/**
 * Chuông thông báo (`0096`).
 *
 * Hình chuông ĐẶC TẢ, không có chấm đỏ vẽ sẵn trong đường path: con số chưa đọc
 * là một phần tử riêng chồng lên, vì nó đổi theo dữ liệu còn hình thì không.
 */
export function BieuTuongChuong() {
  return (
    <Hinh>
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2.5h15z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Hinh>
  );
}

/** Dùng cho mục *Thông tin tài khoản* trong menu tài khoản (`0062`). */
export function BieuTuongTaiKhoan() {
  return HinhNguoiDung;
}

export function BieuTuongDangXuat() {
  return (
    <Hinh>
      <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
      <path d="M16 8l4 4-4 4M20 12H9" />
    </Hinh>
  );
}
