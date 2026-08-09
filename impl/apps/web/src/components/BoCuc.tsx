/**
 * Khung chung sau khi đăng nhập: thanh tiêu đề, điều hướng, vùng nội dung.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePhien } from '../lib/auth.js';
import { dieuHuongCho } from '../lib/can.js';
import { NHAN_VAI_TRO } from '../lib/format.js';
import { Lien, useDuong } from '../lib/router.js';
import logo from '../logo.png';

export function BoCuc({ children }: { children: ReactNode }) {
  const { nguoiDung, dangXuat } = usePhien();
  const { duong } = useDuong();
  const [moMenu, datMoMenu] = useState(false);
  const muc = dieuHuongCho(nguoiDung?.role);

  return (
    <div className="khung-app">
      {/* Bỏ qua điều hướng — bắt buộc cho người dùng bàn phím (FE-35). */}
      <a className="bo-qua" href="#noi-dung-chinh">
        Bỏ qua, tới nội dung chính
      </a>

      <header className="thanh-tieu-de">
        <Lien den="/" className="logo-lien">
          {/*
            Logo nền TRONG SUỐT đặt trên nền xanh thương hiệu (FE-14). File .png
            có kênh alpha; dùng bản có nền trắng thì trên thanh xanh sẽ hiện một
            hộp trắng quanh logo.
          */}
          <img src={logo} alt="Nutricare — về trang chủ" className="logo" />
          {/* Trên điện thoại chỉ giữ biểu tượng, bỏ phần chữ (FE-15). */}
          <span className="ten-thuong-hieu">NUTRICARE</span>
        </Lien>

        <button
          type="button"
          className="nut-menu"
          aria-expanded={moMenu}
          aria-controls="dieu-huong"
          onClick={() => datMoMenu((x) => !x)}
        >
          <span className="chi-doc-man-hinh">Mở điều hướng</span>
          <span aria-hidden="true">☰</span>
        </button>

        <div className="nguoi-dung">
          <span className="ten">{nguoiDung?.fullName}</span>
          <span className="vai-tro">{NHAN_VAI_TRO[nguoiDung?.role ?? ''] ?? nguoiDung?.role}</span>
          <button type="button" className="nut nut-nhe" onClick={dangXuat}>
            Đăng xuất
          </button>
        </div>
      </header>

      <nav id="dieu-huong" className={moMenu ? 'dieu-huong mo' : 'dieu-huong'} aria-label="Chính">
        <ul>
          {muc.map((m) => (
            <li key={m.duong}>
              <Lien
                den={m.duong}
                className={duong === m.duong ? 'muc dang-o' : 'muc'}
              >
                {m.nhan}
              </Lien>
            </li>
          ))}
        </ul>
      </nav>

      {/* `tabIndex={-1}` để chuyển màn hình đưa được tiêu điểm về đây. */}
      <main id="noi-dung-chinh" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
