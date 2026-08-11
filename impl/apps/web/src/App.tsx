import { usePhien } from './lib/auth.js';
import { khop, useDuong } from './lib/router.js';
import { xem } from './lib/can.js';
import { BoCuc } from './components/BoCuc.js';
import { Trong } from './components/Chung.js';
import { DangNhap } from './pages/DangNhap.js';
import { DoiMatKhau } from './pages/DoiMatKhau.js';
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

function noiDung(duong: string, vaiTro: string) {
  if (duong === '/') return <TongQuan />;
  if (duong === '/ho-so') return <DanhSachHoSo />;

  const hs = khop('/ho-so/:id', duong);
  if (hs) return <ChiTietHoSo id={hs['id']!} />;

  if (duong === '/khach-hang') return <DanhSachKhachHang />;
  const kh = khop('/khach-hang/:id', duong);
  if (kh) return <ChiTietKhachHang id={kh['id']!} />;

  if (duong === '/bao-cao') return <BaoCao />;
  if (duong === '/danh-muc') return <DanhMuc />;

  // Chặn ở cả tầng định tuyến, không chỉ ẩn mục menu: gõ thẳng địa chỉ vào thanh
  // duyệt là đường đi vòng hiển nhiên nhất qua một menu bị ẩn.
  if (duong === '/nhat-ky') {
    return xem(vaiTro, 'nhatKy') ? <NhatKy /> : <KhongCoQuyen />;
  }

  return (
    <Trong
      tieuDe="Không có màn hình nào ở địa chỉ này"
      moTa="Kiểm tra lại đường dẫn, hoặc dùng thanh điều hướng ở trên."
    />
  );
}

function KhongCoQuyen() {
  return (
    <Trong
      tieuDe="Bạn không có quyền xem mục này"
      moTa="Nếu bạn cho rằng đây là nhầm lẫn, liên hệ Quản trị hệ thống."
    />
  );
}
