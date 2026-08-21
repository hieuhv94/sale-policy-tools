import { usePhien } from './lib/auth.js';
import { khop, useDuong } from './lib/router.js';
import { can, xem } from './lib/can.js';
import { BoCuc } from './components/BoCuc.js';
import { DangTai, Trong } from './components/Chung.js';
import { DangNhap } from './pages/DangNhap.js';
import { DoiMatKhau } from './pages/DoiMatKhau.js';
import { DatLaiMatKhau, KichHoat } from './pages/DatMatKhau.js';
import { QuenMatKhau } from './pages/QuenMatKhau.js';
import { NguoiDung } from './pages/NguoiDung.js';
import { ThongTin } from './pages/ThongTin.js';
import { VanBanMau } from './pages/MauHopDong.js';
import { LapHoSo } from './pages/LapHoSo.js';
import { TongQuan } from './pages/TongQuan.js';
import { DanhSachHoSo } from './pages/DanhSachHoSo.js';
import { ChiTietHoSo } from './pages/ChiTietHoSo.js';
import { NhatKyHoSo } from './pages/NhatKyHoSo.js';
import { ChiTietKhachHang, DanhSachKhachHang } from './pages/KhachHang.js';
import { BaoCao } from './pages/BaoCao.js';
import { NhatKy } from './pages/NhatKy.js';
import { TrangChietKhau, TrangSanPham } from './pages/DanhMuc.js';

export function App() {
  const { nguoiDung, hetHan, dangTai } = usePhien();
  const { duong } = useDuong();

  /*
    Chưa xác thực xong thì KHÔNG dựng gì của ứng dụng (`0076`).

    Một dòng "Đang kiểm tra phiên…" chứ không phải màn hình trắng: từ `0076`
    bước này là một lượt gọi mạng thật, nên trên đường truyền chậm nó kéo dài
    tới vài giây — và vài giây trắng trơn đọc ra là phần mềm hỏng.
  */
  if (dangTai) {
    return (
      <div className="trang-dang-tai">
        <DangTai nhan="Đang kiểm tra phiên đăng nhập…" />
      </div>
    );
  }

  /*
    Ba màn hình công khai phải đứng TRƯỚC lớp kiểm phiên.

    Người nhận thư mời chưa có mật khẩu dùng được, và người quên mật khẩu thì
    theo định nghĩa là không đăng nhập được; đặt chúng xuống dưới
    `if (!nguoiDung)` là chúng không bao giờ chạy, và liên kết trong thư dẫn
    thẳng vào màn hình đăng nhập mà không nói vì sao.
  */
  if (duong === '/kich-hoat') return <KichHoat />;
  if (duong === '/dat-lai-mat-khau') return <DatLaiMatKhau />;
  if (duong === '/quen-mat-khau') return <QuenMatKhau />;

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

  // ĐỨNG TRƯỚC `/ho-so/:id` vì cùng lý do với `/ho-so/moi`: bắt theo thứ tự,
  // và `khop` so số đoạn nên hai mẫu này không đụng nhau — nhưng đặt sau thì
  // người sửa sau dễ chèn nhầm một mẫu hai đoạn vào giữa.
  const nk = khop('/ho-so/:id/nhat-ky', duong);
  if (nk) return <NhatKyHoSo id={nk['id']!} />;

  const hs = khop('/ho-so/:id', duong);
  if (hs) return <ChiTietHoSo id={hs['id']!} />;

  if (duong === '/khach-hang') return <DanhSachKhachHang />;
  const kh = khop('/khach-hang/:id', duong);
  if (kh) return <ChiTietKhachHang id={kh['id']!} />;

  // Không nằm trong `DIEU_HUONG`: đây là màn hình của CHÍNH mình, mọi vai trò
  // đều vào được, và chỗ tìm nó tự nhiên là thẻ tên ở thanh trên cùng chứ không
  // phải một mục menu thứ chín.
  if (duong === '/thong-tin') return <ThongTin />;

  if (duong === '/bao-cao') return <BaoCao />;

  // "Danh mục" tách làm ba mục menu ở P22. Giữ đường cũ trỏ về Sản phẩm: liên
  // kết đã lưu trong trình duyệt và trong tài liệu chạy demo vẫn còn dùng nó.
  if (duong === '/danh-muc' || duong === '/san-pham') return <TrangSanPham />;
  if (duong === '/chiet-khau') return <TrangChietKhau />;
  /*
    Hai đường CŨ trỏ về cùng một trang (`0060`).

    `/giay-to-mau` và `/mau-hop-dong` đã gộp thành `/van-ban-mau` với hai thẻ.
    Giữ hai đường cũ sống vì chúng nằm trong tài liệu hướng dẫn và trong kịch
    bản chạy demo — chết một địa chỉ đang được viết ra giấy thì người đọc tài
    liệu gặp "Không có màn hình nào ở địa chỉ này" và không đoán được đi đâu.
  */
  if (duong === '/van-ban-mau' || duong === '/giay-to-mau' || duong === '/mau-hop-dong') {
    return xem(vaiTro, 'vanBanMau') ? <VanBanMau /> : <KhongCoQuyen />;
  }

  if (duong === '/nguoi-dung') {
    return xem(vaiTro, 'nguoiDung') ? <NguoiDung /> : <KhongCoQuyen />;
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
