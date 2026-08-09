/**
 * Đổi mật khẩu bắt buộc lần đầu (ONB-06).
 *
 * Màn hình này KHÔNG có điều hướng: mọi đường khác đều bị máy chủ chặn cho tới
 * khi đổi xong, nên bày ra menu chỉ dẫn người dùng tới một loạt lỗi 403.
 */
import { useState } from 'react';
import { dang } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { BaoLoi, Truong } from '../components/Chung.js';

export function DoiMatKhau() {
  const { capNhatNguoiDung, dangXuat } = usePhien();
  const [cu, datCu] = useState('');
  const [moi, datMoi] = useState('');
  const [lai, datLai] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const khopNhau = moi.length > 0 && moi === lai;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/auth/change-password', { currentPassword: cu, newPassword: moi });
      capNhatNguoiDung({ mustChangePassword: false });
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <div className="dang-nhap">
      <form className="the-dang-nhap" onSubmit={gui}>
        <h1>Đổi mật khẩu</h1>
        <p className="ghi-chu">
          Bạn đang dùng mật khẩu mặc định. Phải đổi trước khi sử dụng hệ thống.
        </p>

        <Truong id="mk-cu" nhan="Mật khẩu hiện tại" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="password" autoComplete="current-password"
              value={cu} onChange={(e) => datCu(e.target.value)} />
          )}
        </Truong>
        <Truong id="mk-moi" nhan="Mật khẩu mới" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="password" autoComplete="new-password"
              value={moi} onChange={(e) => datMoi(e.target.value)} />
          )}
        </Truong>
        <Truong
          id="mk-lai"
          nhan="Nhập lại mật khẩu mới"
          bắtBuộc
          loi={lai.length > 0 && !khopNhau ? 'Hai lần nhập chưa giống nhau.' : undefined}
        >
          {(p) => (
            <input {...p} className="o-nhap" type="password" autoComplete="new-password"
              value={lai} onChange={(e) => datLai(e.target.value)} />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}

        <button type="submit" className="nut nut-chinh nut-rong" disabled={dangGui || !khopNhau}>
          {dangGui ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
        <button type="button" className="nut nut-nhe nut-rong" onClick={dangXuat}>
          Đăng xuất
        </button>
      </form>
    </div>
  );
}
