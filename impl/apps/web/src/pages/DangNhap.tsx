import { useState } from 'react';
import { usePhien } from '../lib/auth.js';
import { useDuong } from '../lib/router.js';
import { duongSauDangNhap } from '../lib/sau-dang-nhap.js';
import { BaoLoi, Truong } from '../components/Chung.js';
import { NutGiaoDien } from '../components/NutGiaoDien.js';
import logo from '../logo.png';

export function DangNhap({ lopPhu = false }: { lopPhu?: boolean }) {
  const { dangNhap } = usePhien();
  const { di } = useDuong();
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
      /*
       * Đăng nhập xong thì VÀO TRANG TỔNG QUAN (`0040`), TRỪ liên kết sâu (`0041`).
       *
       * Trước `0040` không có bước này: màn hình sau khi đăng nhập là bất cứ
       * đường dẫn nào đang nằm trên thanh địa chỉ. Mở app ở `/` thì tình cờ
       * đúng, còn mở lại một tab cũ đang ở `/bao-cao` hay `/nguoi-dung` thì
       * người dùng rơi thẳng vào giữa một màn hình con — và với vai trò không
       * xem được màn hình ấy thì rơi vào "Bạn không có quyền", ngay sau khi đăng
       * nhập thành công.
       *
       * `0041` chừa lại đường trỏ vào một BẢN GHI CỤ THỂ: đó là liên kết trong
       * thư báo, người dùng vừa bấm vì họ cần đúng hồ sơ đó. Xem
       * `duongSauDangNhap`.
       *
       * KHÔNG áp dụng cho lớp phủ phiên hết hạn (`lopPhu`). Ở đó màn hình bên
       * dưới vẫn còn nguyên cùng mọi thứ đang gõ dở (`FE-33`), và điều đúng là
       * trả người dùng về đúng chỗ họ đang làm — đá họ về trang tổng quan là làm
       * mất chính thứ lớp phủ ấy sinh ra để giữ.
       */
      if (!lopPhu) di(duongSauDangNhap(window.location.pathname));
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <div className={lopPhu ? 'dang-nhap trong-lop-phu' : 'dang-nhap'}>
      {/*
        Nút đổi giao diện có mặt NGAY Ở MÀN HÌNH ĐĂNG NHẬP, không đợi vào trong.
        Người dùng đặt máy ở chế độ tối mà mở ra gặp một tấm trắng chói thì ấn
        tượng đầu tiên đã hỏng, và họ chưa có cách nào sửa.

        Bỏ đi khi đang là lớp phủ hết phiên: lúc đó nút của thanh tiêu đề bên
        dưới vẫn còn đó, thêm nút thứ hai chỉ làm rối.
      */}
      {!lopPhu && (
        <div className="goc-tren-phai">
          <NutGiaoDien />
        </div>
      )}

      <form className="the-dang-nhap" onSubmit={gui}>
        <div className="dang-nhap-dau">
          <img src={logo} alt="Nutricare" className="logo-lon" />
          <h1>{lopPhu ? 'Phiên đã hết hạn' : 'Chính sách bán hàng'}</h1>
          {!lopPhu && <p className="dang-nhap-phu">Công ty TNHH Dược phẩm Nutricare</p>}
        </div>
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

        {/*
          Ẩn khi đang là lớp phủ hết phiên: lúc đó người dùng ĐÃ có phiên và chỉ
          cần gõ lại mật khẩu. Đưa họ sang màn hình quên mật khẩu là dỡ mất cái
          màn hình đang giữ nguyên biểu mẫu họ nhập dở (`FE-33`).
        */}
        {!lopPhu && (
          <button type="button" className="lien-phu" onClick={() => di('/quen-mat-khau')}>
            Quên mật khẩu?
          </button>
        )}
      </form>
    </div>
  );
}
