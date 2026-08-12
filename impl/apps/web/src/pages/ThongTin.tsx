/**
 * Thông tin của tôi — người dùng tự sửa, không phải nhờ Quản trị hệ thống.
 *
 * Sửa được ĐÚNG họ tên. Ba thứ còn lại của một tài khoản đều cố ý khoá, và màn
 * hình nói thẳng vì sao thay vì hiện ô xám không giải thích — người dùng không
 * đọc được lý do sẽ đi mở phiếu hỗ trợ hỏi đúng câu đó.
 */
import { useState } from 'react';
import { va } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
// Bảng nhãn của `format.ts` nhận khoá `string`; `nguoi-dung.ts` đòi đúng kiểu
// `VaiTro`, mà vai trò trong phiên đăng nhập chỉ là `string`.
import { NHAN_VAI_TRO } from '../lib/format.js';
import { BaoLoi, HopThoaiXacNhan, Truong } from '../components/Chung.js';

export function ThongTin() {
  const { nguoiDung, capNhatNguoiDung } = usePhien();
  const [ten, datTen] = useState(nguoiDung?.fullName ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const [xong, datXong] = useState(false);
  const [hoi, datHoi] = useState(false);

  if (!nguoiDung) return null;

  const daDoi = ten.trim() !== nguoiDung.fullName && ten.trim().length >= 2;

  const gui = async () => {
    datLoi(null);
    datXong(false);
    datDangGui(true);
    try {
      const moi = await va<{ fullName: string }>('/auth/me', { fullName: ten.trim() });
      // Cập nhật luôn phiên đang giữ: tên hiện ở thanh trên cùng, không cập nhật
      // thì người dùng lưu xong vẫn nhìn thấy tên cũ và tưởng là chưa lưu được.
      capNhatNguoiDung({ fullName: moi.fullName });
      datXong(true);
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <section className="trang trang-hep">
      <h1>Thông tin của tôi</h1>

      <form
        className="the"
        onSubmit={(e) => {
          e.preventDefault();
          datHoi(true);
        }}
      >
        <Truong id="tt-ten" nhan="Họ và tên" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="name"
              value={ten}
              onChange={(e) => {
                datTen(e.target.value);
                datXong(false);
              }}
            />
          )}
        </Truong>

        <Truong id="tt-tk" nhan="Tên tài khoản">
          {(p) => <input {...p} className="o-nhap" value={nguoiDung.username} readOnly disabled />}
        </Truong>
        <Truong id="tt-mail" nhan="Email">
          {(p) => <input {...p} className="o-nhap" value={nguoiDung.email} readOnly disabled />}
        </Truong>
        <Truong id="tt-vai" nhan="Vai trò">
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={NHAN_VAI_TRO[nguoiDung.role] ?? nguoiDung.role}
              readOnly
              disabled
            />
          )}
        </Truong>

        <p className="ghi-chu">
          <strong>Tên tài khoản, email và vai trò do Quản trị hệ thống đổi.</strong> Email là đường
          nhận liên kết đặt lại mật khẩu — tự đổi được nghĩa là ai mượn được máy bạn lúc đang đăng
          nhập cũng chuyển được đường khôi phục sang hộp thư của họ. Tên tài khoản thì đi vào nhật ký
          kiểm toán, phải đối chiếu được với hồ sơ giấy.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        {xong && (
          <p className="ghi-chu" role="status">
            Đã lưu.
          </p>
        )}

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !daDoi}>
            {dangGui ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>

      {hoi && (
        <HopThoaiXacNhan
          tieuDe="Đổi họ và tên"
          hauQua={
            <p>
              Từ <strong>{nguoiDung.fullName}</strong> sang <strong>{ten.trim()}</strong>. Tên này
              hiện trên hồ sơ bạn lập, trong thư hệ thống gửi cho người khác, và trong{' '}
              <strong>nhật ký kiểm toán</strong> — nơi nó phải khớp với chữ ký trên bản giấy.
            </p>
          }
          nhanNut="Đổi tên"
          nguyHiem={false}
          dangChay={dangGui}
          dong={() => datHoi(false)}
          xacNhan={() => void gui().then(() => datHoi(false))}
        />
      )}
    </section>
  );
}
