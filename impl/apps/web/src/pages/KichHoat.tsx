/**
 * Kích hoạt tài khoản từ liên kết trong thư mời (ONB-04).
 *
 * Đây là màn hình DUY NHẤT ngoài đăng nhập chạy khi CHƯA có phiên — người nhận
 * thư chưa có mật khẩu dùng được nên không thể đăng nhập để tới đây. Vì vậy nó
 * phải được đấu dây TRƯỚC lớp kiểm phiên trong `App.tsx`; đặt trong `noiDung()`
 * là nó không bao giờ chạy.
 *
 * Trước P11a màn hình này không tồn tại: `users.service.ts` vẫn gửi thư trỏ tới
 * `/kich-hoat?token=…`, và người nhận rơi vào "Không có màn hình nào ở địa chỉ
 * này". Tài khoản tạo ra không dùng được, mà phía quản trị không thấy gì bất
 * thường.
 */
import { useState } from 'react';
import { dang } from '../lib/api.js';
import { useDuong } from '../lib/router.js';
import { BaoLoi, Truong } from '../components/Chung.js';

export function KichHoat() {
  const { truyVan, di } = useDuong();
  const token = truyVan.get('token') ?? '';
  const [moi, datMoi] = useState('');
  const [lai, datLai] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const [xong, datXong] = useState(false);

  const khopNhau = moi.length > 0 && moi === lai;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/auth/activate', { token, newPassword: moi });
      datXong(true);
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  // Thiếu token thì nói thẳng nguyên nhân và cách đi tiếp. Bày biểu mẫu ra rồi
  // để người dùng gõ xong mới báo hỏng là lãng phí đúng hai phút của họ.
  if (token === '') {
    return (
      <div className="dang-nhap">
        <div className="the-dang-nhap">
          <h1>Liên kết không hợp lệ</h1>
          <p className="ghi-chu">
            Địa chỉ này thiếu mã kích hoạt. Hãy mở lại đúng liên kết trong thư mời, hoặc đề nghị
            Quản trị hệ thống gửi lại thư.
          </p>
        </div>
      </div>
    );
  }

  if (xong) {
    return (
      <div className="dang-nhap">
        <div className="the-dang-nhap">
          <h1>Đã kích hoạt xong</h1>
          <p className="ghi-chu">Bạn đăng nhập được bằng mật khẩu vừa đặt.</p>
          <button type="button" className="nut nut-chinh nut-rong" onClick={() => di('/')}>
            Tới màn hình đăng nhập
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dang-nhap">
      <form className="the-dang-nhap" onSubmit={gui}>
        <h1>Kích hoạt tài khoản</h1>
        <p className="ghi-chu">Đặt mật khẩu cho lần đăng nhập đầu tiên.</p>

        <Truong id="kh-moi" nhan="Mật khẩu mới" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="password" autoComplete="new-password"
              value={moi} onChange={(e) => datMoi(e.target.value)} />
          )}
        </Truong>
        <Truong
          id="kh-lai"
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
          {dangGui ? 'Đang kích hoạt…' : 'Kích hoạt'}
        </button>
      </form>
    </div>
  );
}
