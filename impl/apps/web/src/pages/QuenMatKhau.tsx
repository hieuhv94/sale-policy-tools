/**
 * Quên mật khẩu — yêu cầu gửi liên kết đặt lại.
 *
 * Màn hình này KHÔNG BAO GIỜ nói tài khoản có tồn tại hay không, kể cả khi biết
 * thừa: gửi xong là hiện đúng một câu, giống hệt nhau cho mọi trường hợp. Máy
 * chủ cũng trả về đúng một câu trả lời (`auth.controller.ts`) — hai bên phải
 * cùng im, vì chỉ cần một bên nói ra là đường này thành máy dò xem tên tài khoản
 * hay địa chỉ email nào có thật trong hệ thống.
 */
import { useState } from 'react';
import { dang } from '../lib/api.js';
import { useDuong } from '../lib/router.js';
import { BaoLoi, Truong } from '../components/Chung.js';

export function QuenMatKhau() {
  const { di } = useDuong();
  const [login, datLogin] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const [daGui, datDaGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/auth/forgot-password', { login: login.trim() });
      datDaGui(true);
    } catch (err) {
      // Chỉ lỗi mạng mới tới được đây — máy chủ trả 200 cho mọi trường hợp
      // nghiệp vụ. Vẫn hiện ra, vì "đã gửi" trong khi thật ra chưa gửi được gì
      // là câu trả lời tệ nhất có thể.
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  if (daGui) {
    return (
      <div className="dang-nhap">
        <div className="the-dang-nhap">
          <h1>Đã gửi, nếu tài khoản tồn tại</h1>
          <p className="ghi-chu">
            Nếu <strong>{login.trim()}</strong> là một tài khoản đang hoạt động, một thư kèm liên
            kết đặt lại mật khẩu vừa được gửi tới địa chỉ email của tài khoản đó. Liên kết dùng
            được một lần và hết hạn sau <strong>2 giờ</strong>.
          </p>
          <p className="ghi-chu">
            Không thấy thư thì kiểm tra hộp thư rác, hoặc liên hệ Quản trị hệ thống — có thể địa chỉ
            email khai trong hệ thống không phải hộp thư bạn đang mở.
          </p>
          <button type="button" className="nut nut-chinh nut-rong" onClick={() => di('/')}>
            Về màn hình đăng nhập
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dang-nhap">
      <form className="the-dang-nhap" onSubmit={gui}>
        <h1>Quên mật khẩu</h1>
        <p className="ghi-chu">
          Nhập tên tài khoản hoặc địa chỉ email. Chúng tôi gửi liên kết đặt lại tới email của tài
          khoản đó.
        </p>

        <Truong id="qmk-login" nhan="Tên tài khoản hoặc email" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" autoComplete="username" value={login}
              onChange={(e) => datLogin(e.target.value)} />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}

        <button
          type="submit"
          className="nut nut-chinh nut-rong"
          disabled={dangGui || login.trim() === ''}
        >
          {dangGui ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}
        </button>
        <button type="button" className="nut nut-nhe nut-rong" onClick={() => di('/')}>
          Quay lại đăng nhập
        </button>
      </form>
    </div>
  );
}
