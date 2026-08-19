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

const HinhBaoCao = (
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

/** Hai tờ giấy chồng nhau — mẫu để nhân bản, không phải một văn bản cụ thể. */
const HinhGiayToMau = (
  <Hinh>
    <path d="M8 3h7l3 3v10H8z" />
    <path d="M15 3v3h3M16 16v5H6V8h2" />
  </Hinh>
);

const HinhMauHopDong = (
  <Hinh>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4M9 12h6M9 16h6" />
  </Hinh>
);

const HinhNguoiDung = (
  <Hinh>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1" />
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
    case '/bao-cao':
      return HinhBaoCao;
    case '/danh-muc':
    case '/san-pham':
      return HinhDanhMuc;
    case '/chiet-khau':
      return HinhChietKhau;
    case '/giay-to-mau':
      return HinhGiayToMau;
    case '/mau-hop-dong':
      return HinhMauHopDong;
    case '/nguoi-dung':
      return HinhNguoiDung;
    case '/nhat-ky':
      return HinhNhatKy;
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
