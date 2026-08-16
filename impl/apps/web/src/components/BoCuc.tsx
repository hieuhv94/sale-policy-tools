/**
 * Khung chung sau khi đăng nhập: thanh bên, thanh tiêu đề, vùng nội dung.
 *
 * Điều hướng nằm ở THANH BÊN chứ không ở một hàng tab ngang. Tám mục với nhãn
 * tiếng Việt dài ("Mẫu hợp đồng", "Quy định chiết khấu") xếp ngang thì tràn
 * dòng ngay ở màn hình 1280px, và một hàng tab tràn thành hai dòng trông như lỗi
 * hiển thị. Cột dọc thì thêm mục thứ chín cũng không đổi bố cục.
 *
 * Dưới 1024px thanh bên thành NGĂN KÉO trượt ra, đúng một cây DOM cho cả hai —
 * dựng lại cây theo bề rộng là thứ `FE-06` cấm.
 */
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePhien } from '../lib/auth.js';
import { dieuHuongCho } from '../lib/can.js';
import { NHAN_VAI_TRO } from '../lib/format.js';
import { Lien, useDuong } from '../lib/router.js';
import logo from '../logo.png';
import { BieuTuongDangXuat, BieuTuongDong, BieuTuongMenu, bieuTuongMuc } from './BieuTuong.js';
import { NutGiaoDien } from './NutGiaoDien.js';

/**
 * Chữ cái đầu của tên, tối đa hai chữ.
 *
 * Lấy từ CUỐI tên: người Việt gọi nhau bằng tên, và "Nguyễn Văn Hùng" viết tắt
 * thành "NV" thì không ai nhận ra mình.
 */
function chuDau(ten: string | undefined): string {
  const phan = (ten ?? '').trim().split(/\s+/).filter(Boolean);
  if (phan.length === 0) return '?';
  const cuoi = phan[phan.length - 1]!;
  if (phan.length === 1) return cuoi.slice(0, 2).toUpperCase();
  return (phan[phan.length - 2]![0]! + cuoi[0]!).toUpperCase();
}

export function BoCuc({ children }: { children: ReactNode }) {
  const { nguoiDung, dangXuat } = usePhien();
  const { duong } = useDuong();
  const [moMenu, datMoMenu] = useState(false);
  const muc = dieuHuongCho(nguoiDung?.role);

  // Chuyển màn hình thì đóng ngăn kéo lại. Thiếu chỗ này thì trên điện thoại,
  // bấm một mục xong màn hình mới nằm khuất sau ngăn kéo vẫn đang mở.
  useEffect(() => datMoMenu(false), [duong]);

  return (
    <div className={moMenu ? 'khung-app mo-menu' : 'khung-app'}>
      {/* Bỏ qua điều hướng — bắt buộc cho người dùng bàn phím (FE-35). */}
      <a className="bo-qua" href="#noi-dung-chinh">
        Bỏ qua, tới nội dung chính
      </a>

      <aside className="thanh-ben" id="dieu-huong">
        <div className="thanh-ben-dau">
          <Lien den="/" className="logo-lien">
            {/*
              `logo.png` KHÔNG có kênh trong suốt — chú thích cũ ở đây ghi ngược
              lại và chỉ lộ ra khi thanh bên chuyển sang nền navy. Nó được đặt
              lên một ô trắng có chủ ý; lý do đầy đủ ở `--mau-nen-logo` trong
              tokens.css (FE-14).
            */}
            <img src={logo} alt="Nutricare — về trang chủ" className="logo" />
            <span className="ten-thuong-hieu">
              <strong>NUTRICARE</strong>
              <small>Chính sách bán hàng</small>
            </span>
          </Lien>

          {/* Chỉ hiện khi thanh bên đang là ngăn kéo. */}
          <button type="button" className="nut-bieu-tuong nut-dong-menu" onClick={() => datMoMenu(false)}>
            <span className="chi-doc-man-hinh">Đóng điều hướng</span>
            <BieuTuongDong />
          </button>
        </div>

        <nav className="dieu-huong" aria-label="Chính">
          <ul>
            {muc.map((m) => (
              <li key={m.duong}>
                <Lien
                  den={m.duong}
                  className={duong === m.duong ? 'muc dang-o' : 'muc'}
                  {...(duong === m.duong ? { 'aria-current': 'page' as const } : {})}
                >
                  <span className="muc-hinh">{bieuTuongMuc(m.duong)}</span>
                  <span className="muc-chu">{m.nhan}</span>
                </Lien>
              </li>
            ))}
          </ul>
        </nav>

        <div className="thanh-ben-chan">
          <span className="cham-sang" aria-hidden="true" />
          <span>Phiên bản demo</span>
        </div>
      </aside>

      {/*
        Nền mờ sau ngăn kéo. `aria-hidden` + không nhận tiêu điểm: người dùng bàn
        phím đóng ngăn kéo bằng nút X ở trên, không cần thêm một điểm dừng Tab
        không có nhãn.
      */}
      <div className="man-che" onClick={() => datMoMenu(false)} aria-hidden="true" />

      <div className="cot-chinh">
        <header className="thanh-tieu-de">
          <button
            type="button"
            className="nut-menu"
            aria-expanded={moMenu}
            aria-controls="dieu-huong"
            onClick={() => datMoMenu((x) => !x)}
          >
            <span className="chi-doc-man-hinh">Mở điều hướng</span>
            <BieuTuongMenu />
          </button>

          {/* Nhắc lại tên phần mềm ở đây vì trên điện thoại thanh bên đang khuất. */}
          <span className="tieu-de-gon">Chính sách bán hàng</span>

          <div className="nguoi-dung">
            <NutGiaoDien />

            {/* Thẻ tên là ĐƯỜNG VÀO màn hình thông tin của mình. Chỗ người ta
                bấm khi muốn sửa tên mình là chính chỗ hiện tên mình. */}
            <Lien den="/thong-tin" className="the-nguoi-dung">
              <span className="anh-dai-dien" aria-hidden="true">
                {chuDau(nguoiDung?.fullName)}
              </span>
              <span className="nguoi-dung-chu">
                <span className="ten">{nguoiDung?.fullName}</span>
                <span className="vai-tro">
                  {NHAN_VAI_TRO[nguoiDung?.role ?? ''] ?? nguoiDung?.role}
                </span>
              </span>
            </Lien>

            <button type="button" className="nut nut-nhe nut-thoat" onClick={dangXuat}>
              <BieuTuongDangXuat />
              <span className="thoat-chu">Đăng xuất</span>
            </button>
          </div>
        </header>

        {/* `tabIndex={-1}` để chuyển màn hình đưa được tiêu điểm về đây. */}
        <main id="noi-dung-chinh" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
