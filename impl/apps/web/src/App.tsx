import { Fragment, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhien } from './lib/auth.js';
import { khop, useDuong } from './lib/router.js';
import { can, xem } from './lib/can.js';
import { BoCuc } from './components/BoCuc.js';
import { DangTai, Trong } from './components/Chung.js';
import { DangNhap } from './pages/DangNhap.js';
import { DoiMatKhau } from './pages/DoiMatKhau.js';
import { DatLaiMatKhau, KichHoat } from './pages/DatMatKhau.js';
import { DangNhapGoogle } from './pages/DangNhapGoogle.js';
import { QuenMatKhau } from './pages/QuenMatKhau.js';
import { NguoiDung } from './pages/NguoiDung.js';
import { ThongBao } from './pages/ThongBao.js';
import { ThongTin } from './pages/ThongTin.js';
import { VanBanMau } from './pages/MauHopDong.js';
import { LapHoSo } from './pages/LapHoSo.js';
import { TongQuan } from './pages/TongQuan.js';
import { DanhSachHoSo } from './pages/DanhSachHoSo.js';
import { ChiTietHoSo } from './pages/ChiTietHoSo.js';
import { NhatKyHoSo } from './pages/NhatKyHoSo.js';
import { ChiTietKhachHang, DanhSachKhachHang } from './pages/KhachHang.js';
import { ThongKe } from './pages/ThongKe.js';
import { NhatKy } from './pages/NhatKy.js';
import { VanHanh } from './pages/VanHanh.js';
/*
  Trang Hướng dẫn tải THEO NHU CẦU (`0273`): nội dung chữ của sáu vai trò nặng cỡ
  chục KB nén, mà người dùng chỉ mở nó thỉnh thoảng — để vào gói chính là đẩy gói
  tải ngay vượt trần `FE-38` vì một trang ít ai mở. `lazy` tách nó thành chunk riêng.
*/
const HuongDan = lazy(() => import('./pages/HuongDan.js').then((m) => ({ default: m.HuongDan })));
import { TrangChietKhau, TrangSanPham } from './pages/DanhMuc.js';

export function App() {
  const { nguoiDung, hetHan, dangTai } = usePhien();
  const { duong, di } = useDuong();

  /*
    NGƯỜI KHÁC vừa vào bằng lớp phủ hết phiên (`0242`): về Tổng quan. Đường dẫn
    đang đứng là màn hình của người trước — một hồ sơ trong phạm vi của họ, không
    phải của người này. Màn hình tự dỡ nhờ `key` bên dưới; ở đây chỉ lo đường dẫn.
  */
  const nguoiTruoc = useRef<string | null>(null);
  useEffect(() => {
    const id = nguoiDung?.id ?? null;
    if (id && nguoiTruoc.current && nguoiTruoc.current !== id) di('/');
    nguoiTruoc.current = id;
  }, [nguoiDung?.id, di]);

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
    Bốn màn hình công khai phải đứng TRƯỚC lớp kiểm phiên.

    Người nhận thư mời chưa có mật khẩu dùng được, và người quên mật khẩu thì
    theo định nghĩa là không đăng nhập được; đặt chúng xuống dưới
    `if (!nguoiDung)` là chúng không bao giờ chạy, và liên kết trong thư dẫn
    thẳng vào màn hình đăng nhập mà không nói vì sao.
  */
  if (duong === '/kich-hoat') return <KichHoat />;
  if (duong === '/dat-lai-mat-khau') return <DatLaiMatKhau />;
  if (duong === '/quen-mat-khau') return <QuenMatKhau />;
  // Lượt quay về từ Google (`0241`) — chưa có phiên, nên cũng đứng trước lớp kiểm.
  if (duong === '/dang-nhap/google') return <DangNhapGoogle />;

  if (!nguoiDung) return <DangNhap />;

  return (
    <>
      {/*
        `key` là id người dùng: người khác đăng nhập vào lớp phủ thì CẢ màn hình
        của người trước bị dỡ, kể cả bản nhập dở trong state React (`0242`).
        Cùng người thì `key` không đổi và mọi thứ còn nguyên (FE-33).

        Màn hình đổi mật khẩu bắt buộc nằm TRONG nhánh này, không trả về sớm như
        trước: hết phiên ở đó cũng phải có lớp phủ.
      */}
      <Fragment key={nguoiDung.id}>
        {nguoiDung.mustChangePassword ? (
          <DoiMatKhau />
        ) : (
          <BoCuc>{noiDung(duong, nguoiDung.role)}</BoCuc>
        )}
      </Fragment>
      {hetHan && <LopPhuHetPhien />}
    </>
  );
}

/**
 * Lớp phủ đăng nhập lại khi hết phiên (`0242`, chốt 04/11 — *"vẫn hiện phần
 * đăng nhập nhưng không bao giờ show nội dung đằng sau khi hết hạn phiên"*, rồi
 * *"ở bất kỳ cửa sổ nào"*).
 *
 * Hai vế, và không vế nào thay được vế kia:
 *   - GIỮ màn hình cũ trong cây React (FE-33): dỡ đi là mất bản nhập dở;
 *   - KHÔNG LỘ gì: phiên đã chết thì dữ liệu trên màn hình là của một người chưa
 *     được xác nhận lại — máy để quên ở quầy là ai đi ngang cũng đọc được.
 *
 * Dựng RA NGOÀI cây ứng dụng, thẳng vào `body`, rồi khoá MỌI anh em của nó:
 * `inert` (bàn phím, chuột) + `aria-hidden` (trình đọc màn hình) + ẩn. Phải là
 * mọi anh em chứ không riêng màn hình chính, vì hộp lỗi và thông báo nổi của
 * `BaoLoiProvider` nằm NGOÀI `App` — bản đầu của `0242` chỉ giấu màn hình chính
 * và chúng vẫn nổi lên trên được (`z-index` 60–100 > 50 của lớp phủ cũ).
 *
 * Ẩn bằng HAI lớp: NỀN ĐẶC + `z-index` cao nhất của `.lop-phu-het-phien` là
 * lớp chính; `visibility: hidden` trên anh em là lớp hai. `visibility` một mình
 * không đủ — con nào tự khai `visibility: visible` thì hiện ra dù cha ẩn (có
 * thật: ô giá cũ của `.dau-doi`). `display: none` thì không dùng: trang cuộn về
 * đầu, mất chỗ đang đứng.
 */
function LopPhuHetPhien() {
  const [goc] = useState(() => {
    const d = document.createElement('div');
    d.className = 'goc-lop-phu-het-phien';
    return d;
  });
  useLayoutEffect(() => {
    document.body.appendChild(goc);
    const daKhoa: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === goc) continue;
      // Đã bị ai khác khoá thì để nguyên — gỡ lúc đóng là mở nhầm thứ không phải của mình.
      if (el.hasAttribute('inert') || el.getAttribute('aria-hidden') === 'true') continue;
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
      el.classList.add('an-khi-het-phien');
      daKhoa.push(el);
    }
    return () => {
      for (const el of daKhoa) {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
        el.classList.remove('an-khi-het-phien');
      }
      goc.remove();
    };
  }, [goc]);
  return createPortal(
    <div className="lop-phu lop-phu-het-phien" role="dialog" aria-modal="true" aria-label="Đăng nhập lại">
      <DangNhap lopPhu />
    </div>,
    goc,
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

  /*
    BỐN đường `/ho-so*` chặn ở tầng định tuyến (`0133`), không chỉ ẩn mục menu.

    Gõ thẳng địa chỉ vào thanh duyệt là đường đi vòng hiển nhiên nhất qua một
    menu bị ẩn — cùng lý do `/nhat-ky` đã chặn ở đây từ `0086`. Và cả bốn chứ
    không riêng `/ho-so`: liên kết tới một hồ sơ cụ thể còn nằm trong thư báo,
    trong dòng thông báo ở chuông, và trong dấu trang của người dùng.

    Không chặn thì Quản trị vẫn mở được màn hình, và nó bày một khối lỗi đỏ
    `OUT_OF_SCOPE` — đúng thứ việc gỡ mục menu sinh ra để bỏ đi.
  */
  const laDuongHoSo = duong === '/ho-so' || duong.startsWith('/ho-so/');
  if (laDuongHoSo && !xem(vaiTro, 'hoSo')) return <KhongCoQuyen />;

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
  /*
    `key` THEO ID HỒ SƠ (`0201`) — đi từ hồ sơ này sang hồ sơ khác là DỰNG LẠI
    trang, không phải đổi một prop.

    Hai hồ sơ khác nhau vẫn là CÙNG một địa chỉ `/ho-so/:id` với bộ định tuyến,
    nên không có `key` thì React giữ nguyên component và giữ nguyên cả chục ô
    state của nó — hộp thoại đang mở, danh sách *chưa cập nhật được* và *đã rút*
    của lượt bấm vừa rồi, dòng đang chờ xác nhận xoá. Chúng thuộc về MỘT hồ sơ,
    và trang đích bày lại chúng như thể là của mình.

    Lộ ra ở nút *Mở bản Nháp đang có*: bấm xong sang đúng bản Nháp, nhưng hộp
    thoại nằm lại đè lên. Đó là triệu chứng được báo; `key` đóng cả lớp, còn
    chính hộp thoại vẫn tự đóng lấy (xem `ChiTietHoSo`) vì đó là hợp đồng riêng
    của nó.
  */
  if (hs) return <ChiTietHoSo key={hs['id']!} id={hs['id']!} />;

  if (duong === '/khach-hang') return <DanhSachKhachHang />;
  const kh = khop('/khach-hang/:id', duong);
  if (kh) return <ChiTietKhachHang id={kh['id']!} />;

  // Không nằm trong `DIEU_HUONG`: đây là màn hình của CHÍNH mình, mọi vai trò
  // đều vào được, và chỗ tìm nó tự nhiên là thẻ tên ở thanh trên cùng chứ không
  // phải một mục menu thứ chín.
  if (duong === '/thong-tin') return <ThongTin />;

  // Cũng không nằm trong `DIEU_HUONG`, cùng lý do với `/thong-tin`: màn hình của
  // chính mình, và chỗ tìm nó là cái chuông ở thanh trên cùng (`0096`).
  if (duong === '/thong-bao') return <ThongBao />;

  /*
    Đường CŨ `/bao-cao` vẫn sống (`0093`).

    Trang *Báo cáo* đổi tên thành *Thống kê* và đổi hẳn nội dung, nhưng địa chỉ
    cũ nằm trong tài liệu hướng dẫn, trong kịch bản chạy demo, và trong dấu trang
    của người đã dùng — cùng cách `/danh-muc` và `/giay-to-mau` được giữ lại.
  */
  if (duong === '/thong-ke' || duong === '/bao-cao') return <ThongKe />;

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

  if (duong === '/van-hanh') {
    return xem(vaiTro, 'vanHanh') ? <VanHanh /> : <KhongCoQuyen />;
  }

  if (duong === '/huong-dan') {
    return xem(vaiTro, 'huongDan') ? (
      <Suspense fallback={<DangTai />}>
        <HuongDan />
      </Suspense>
    ) : (
      <KhongCoQuyen />
    );
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
