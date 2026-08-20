/**
 * Thông tin của tôi — người dùng tự sửa, không phải nhờ Quản trị hệ thống.
 *
 * Sửa được ĐÚNG họ tên. Ba thứ còn lại của một tài khoản đều cố ý khoá, và màn
 * hình nói thẳng vì sao thay vì hiện ô xám không giải thích — người dùng không
 * đọc được lý do sẽ đi mở phiếu hỗ trợ hỏi đúng câu đó.
 */
import { useEffect, useState } from 'react';
import { layJson, va } from '../lib/api.js';
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

  /*
   * KHÔNG còn ô người quản lý nào ở màn hình này (`0031`).
   *
   * Trước đây người dùng tự đổi Trưởng bộ phận và cấp trên của chính mình, và
   * hệ quả không nhỏ: định tuyến suy ra từ `approver_user_id` chứ không lưu vào
   * hồ sơ, nên đổi một ô ở đây là **chuyển ngay mọi hồ sơ đang chờ duyệt sang
   * hộp việc của người khác**. Giờ hồ sơ ghi thẳng người xử lý lên chính nó, và
   * việc chọn diễn ra lúc gửi duyệt — đổi ý về sau không đụng được vào hồ sơ đã
   * gửi, đúng như mọi thứ khác đã đóng băng.
   */

  if (!nguoiDung) return null;

  const daDoi = ten.trim() !== nguoiDung.fullName && ten.trim().length >= 2;

  const gui = async () => {
    datLoi(null);
    datXong(false);
    datDangGui(true);
    try {
      const moi = await va<{ fullName: string }>('/auth/me', { fullName: ten.trim() });
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
      <div className="dau-trang">
        <h1>Thông tin của tôi</h1>
        {/*
          Nút LƯU ở góc trên bên phải (`0071`), như mọi màn hình khác.

          `form="thong-tin"` thay cho việc nằm trong thẻ `<form>`: nút gửi biểu
          mẫu vẫn gửi đúng biểu mẫu ấy dù đứng ngoài nó, nên phím Enter trong ô
          nhập và cả `onSubmit` đều giữ nguyên đường cũ.
        */}
        <div className="nhom-nut nhom-nut-dau">
          <button
            type="submit"
            form="thong-tin"
            className="nut nut-chinh"
            disabled={dangGui || !daDoi}
          >
            {dangGui ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>

      <form
        id="thong-tin"
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

      </form>

      {hoi && (
        <HopThoaiXacNhan
          tieuDe="Lưu thông tin của tôi"
          hauQua={
            <p>
              Họ tên: từ <strong>{nguoiDung.fullName}</strong> sang <strong>{ten.trim()}</strong>.
              Tên này hiện trên hồ sơ bạn lập, trong thư hệ thống gửi cho người khác, và trong{' '}
              <strong>nhật ký kiểm toán</strong> — nơi nó phải khớp với chữ ký trên bản giấy.
            </p>
          }
          nhanNut="Lưu"
          dangChay={dangGui}
          dong={() => datHoi(false)}
          xacNhan={() => void gui().then(() => datHoi(false))}
        />
      )}
    </section>
  );
}
