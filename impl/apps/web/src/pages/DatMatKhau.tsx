/**
 * Đặt mật khẩu bằng liên kết trong thư — hai đường, MỘT màn hình.
 *
 * Kích hoạt tài khoản và đặt lại mật khẩu khác nhau đúng ở bốn câu chữ và một
 * đường API; phần còn lại — đọc `?token=`, nhập hai lần, so khớp, báo lỗi, xử lý
 * liên kết thiếu mã — giống hệt. Dựng hai màn hình là hai bản sao phải sửa cùng
 * nhau, và chỗ dễ quên nhất chính là nhánh "liên kết hỏng" vì không ai mở nó ra
 * xem hằng ngày.
 *
 * Đây là hai màn hình DUY NHẤT ngoài đăng nhập chạy khi CHƯA có phiên: người
 * nhận thư không có mật khẩu dùng được nên không thể đăng nhập để tới đây. Vì
 * vậy chúng phải được đấu dây TRƯỚC lớp kiểm phiên trong `App.tsx`; đặt trong
 * `noiDung()` là không bao giờ chạy.
 */
import { useState } from 'react';
import { dang } from '../lib/api.js';
import { useDuong } from '../lib/router.js';
import { BaoLoi, Truong } from '../components/Chung.js';

type CheDo = {
  duong: string;
  tieuDe: string;
  moTa: string;
  nhanNut: string;
  dangLam: string;
  tieuDeXong: string;
  moTaThieuMa: string;
};

const KICH_HOAT: CheDo = {
  duong: '/auth/activate',
  tieuDe: 'Kích hoạt tài khoản',
  moTa: 'Đặt mật khẩu cho lần đăng nhập đầu tiên.',
  nhanNut: 'Kích hoạt',
  dangLam: 'Đang kích hoạt…',
  tieuDeXong: 'Đã kích hoạt xong',
  moTaThieuMa:
    'Địa chỉ này thiếu mã kích hoạt. Hãy mở lại đúng liên kết trong thư mời, hoặc đề nghị ' +
    'Quản trị hệ thống gửi lại thư.',
};

const DAT_LAI: CheDo = {
  duong: '/auth/reset-password',
  tieuDe: 'Đặt lại mật khẩu',
  moTa: 'Mật khẩu mới thay hẳn mật khẩu cũ, và mọi phiên đang mở sẽ bị đăng xuất.',
  nhanNut: 'Đặt mật khẩu mới',
  dangLam: 'Đang lưu…',
  tieuDeXong: 'Đã đổi mật khẩu xong',
  moTaThieuMa:
    'Địa chỉ này thiếu mã đặt lại. Hãy mở lại đúng liên kết trong thư, hoặc yêu cầu gửi lại ' +
    'từ màn hình đăng nhập.',
};

export const KichHoat = () => <DatMatKhau che={KICH_HOAT} />;
export const DatLaiMatKhau = () => <DatMatKhau che={DAT_LAI} />;

function DatMatKhau({ che }: { che: CheDo }) {
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
      await dang(che.duong, { token, newPassword: moi });
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
          <p className="ghi-chu">{che.moTaThieuMa}</p>
        </div>
      </div>
    );
  }

  if (xong) {
    return (
      <div className="dang-nhap">
        <div className="the-dang-nhap">
          <h1>{che.tieuDeXong}</h1>
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
        <h1>{che.tieuDe}</h1>
        <p className="ghi-chu">{che.moTa}</p>

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
          {dangGui ? che.dangLam : che.nhanNut}
        </button>
      </form>
    </div>
  );
}
