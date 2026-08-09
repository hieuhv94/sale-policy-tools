import { useState } from 'react';
import { usePhien } from '../lib/auth.js';
import { BaoLoi, Truong } from '../components/Chung.js';
import logo from '../logo.png';

export function DangNhap({ lopPhu = false }: { lopPhu?: boolean }) {
  const { dangNhap } = usePhien();
  const [login, datLogin] = useState('');
  const [matKhau, datMatKhau] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dangNhap(login.trim(), matKhau);
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <div className={lopPhu ? 'dang-nhap trong-lop-phu' : 'dang-nhap'}>
      <form className="the-dang-nhap" onSubmit={gui}>
        <img src={logo} alt="Nutricare" className="logo-lon" />
        <h1>{lopPhu ? 'Phiên đã hết hạn' : 'Chính sách bán hàng'}</h1>
        {lopPhu && (
          <p className="ghi-chu">
            Đăng nhập lại để tiếp tục. <strong>Nội dung bạn đang nhập vẫn còn nguyên.</strong>
          </p>
        )}

        <Truong id="login" nhan="Tên đăng nhập hoặc email" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="username"
              value={login}
              onChange={(e) => datLogin(e.target.value)}
            />
          )}
        </Truong>

        <Truong id="mat-khau" nhan="Mật khẩu" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="password"
              autoComplete="current-password"
              value={matKhau}
              onChange={(e) => datMatKhau(e.target.value)}
            />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}

        <button type="submit" className="nut nut-chinh nut-rong" disabled={dangGui}>
          {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
