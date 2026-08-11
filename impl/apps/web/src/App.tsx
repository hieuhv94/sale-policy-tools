import { usePhien } from './lib/auth.js';
import { khop, useDuong } from './lib/router.js';
import { can, xem } from './lib/can.js';
import { BoCuc } from './components/BoCuc.js';
import { Trong } from './components/Chung.js';
import { DangNhap } from './pages/DangNhap.js';
import { DoiMatKhau } from './pages/DoiMatKhau.js';
import { KichHoat } from './pages/KichHoat.js';
import { NguoiDung } from './pages/NguoiDung.js';
import { MauHopDong } from './pages/MauHopDong.js';
import { LapHoSo } from './pages/LapHoSo.js';
import { TongQuan } from './pages/TongQuan.js';
import { DanhSachHoSo } from './pages/DanhSachHoSo.js';
import { ChiTietHoSo } from './pages/ChiTietHoSo.js';
import { ChiTietKhachHang, DanhSachKhachHang } from './pages/KhachHang.js';
import { BaoCao } from './pages/BaoCao.js';
import { NhatKy } from './pages/NhatKy.js';
import { DanhMuc } from './pages/DanhMuc.js';

export function App() {
  const { nguoiDung, hetHan, dangTai } = usePhien();
  const { duong } = useDuong();

  if (dangTai) return null;

  /*
    Kích hoạt tài khoản phải đứng TRƯỚC lớp kiểm phiên.

    Người nhận thư mời chưa có mật khẩu dùng được nên không đăng nhập được; đặt
    `/kich-hoat` xuống dưới `if (!nguoiDung)` là nó không bao giờ chạy, và liên
    kết trong thư dẫn thẳng vào màn hình đăng nhập mà không nói vì sao.
  */
  if (duong === '/kich-hoat') return <KichHoat />;

  if (!nguoiDung) return <DangNhap />;
  if (nguoiDung.mustChangePassword) return <DoiMatKhau />;

  return (
    <>
      <BoCuc>{noiDung(duong, nguoiDung.role)}</BoCuc>
      {/*
        Phiên hết hạn KHÔNG dỡ màn hình bên dưới (FE-33). Lớp phủ đăng nhập lại
        nằm ĐÈ LÊN, nên state React của biểu mẫu đang dở vẫn còn nguyên và không
        phải khôi phục gì sau khi đăng nhập xong.
      */}
      {hetHan && (
        <div className="lop-phu">
          <DangNhap lopPhu />
        </div>
      )}
    </>
  );
}

/**
 * Xuất ra để `dieu-huong.test.tsx` gọi thẳng, không cần dựng cả cây React.
 *
 * Test chỉ cần biết mỗi mục menu trả về MÀN HÌNH NÀO, mà dựng thật thì kéo theo
 * cả `usePhien`, `useDuong` và một loạt lời gọi mạng — nhiều thứ có thể hỏng vì
 * lý do chẳng liên quan gì tới câu hỏi đang kiểm.
 */
export function noiDung(duong: string, vaiTro: string) {
  if (duong === '/') return <TongQuan />;
  if (duong === '/ho-so') return <DanhSachHoSo />;

  // PHẢI đứng trước `khop('/ho-so/:id')` — nếu không thì `moi` bị bắt như một
  // mã hồ sơ và màn hình chi tiết đi tìm một hồ sơ không tồn tại.
  if (duong === '/ho-so/moi') {
    return can(vaiTro, 'lapHoSo') ? <LapHoSo /> : <KhongCoQuyen />;
  }

  const hs = khop('/ho-so/:id', duong);
  if (hs) return <ChiTietHoSo id={hs['id']!} />;

  if (duong === '/khach-hang') return <DanhSachKhachHang />;
  const kh = khop('/khach-hang/:id', duong);
  if (kh) return <ChiTietKhachHang id={kh['id']!} />;

  if (duong === '/bao-cao') return <BaoCao />;
  if (duong === '/danh-muc') return <DanhMuc />;

  if (duong === '/nguoi-dung') {
    return xem(vaiTro, 'nguoiDung') ? <NguoiDung /> : <KhongCoQuyen />;
  }
  if (duong === '/mau-hop-dong') {
    return xem(vaiTro, 'mauHopDong') ? <MauHopDong /> : <KhongCoQuyen />;
  }

  // Chặn ở cả tầng định tuyến, không chỉ ẩn mục menu: gõ thẳng địa chỉ vào thanh
  // duyệt là đường đi vòng hiển nhiên nhất qua một menu bị ẩn.
  if (duong === '/nhat-ky') {
    return xem(vaiTro, 'nhatKy') ? <NhatKy /> : <KhongCoQuyen />;
  }

  return <KhongCoManHinh />;
}

/**
 * Hai khối dưới đây là component CÓ TÊN, không phải JSX viết thẳng tại chỗ.
 *
 * `dieu-huong.test.tsx` so sánh KIỂU của phần tử trả về chứ không so chuỗi tiêu
 * đề — sửa lại câu chữ cho người dùng dễ hiểu hơn thì không được làm đỏ một test
 * chẳng liên quan gì tới câu chữ.
 */
export function KhongCoManHinh() {
  return (
    <Trong
      tieuDe="Không có màn hình nào ở địa chỉ này"
      moTa="Kiểm tra lại đường dẫn, hoặc dùng thanh điều hướng ở trên."
    />
  );
}

export function KhongCoQuyen() {
  return (
    <Trong
      tieuDe="Bạn không có quyền xem mục này"
      moTa="Nếu bạn cho rằng đây là nhầm lẫn, liên hệ Quản trị hệ thống."
    />
  );
}
