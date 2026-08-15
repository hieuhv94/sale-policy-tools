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
// Nhãn ô cấp trên tra theo vai trò. KHÔNG so `role === 'TDV'` tại chỗ: `quyen.test.ts`
// cấm so sánh vai trò bằng chuỗi viết thẳng ngoài `can.ts`, và một chỗ sót kiểu
// đó thì không test nào bắt.
import { NHAN_CAP_TREN } from '../lib/nguoi-dung.js';
import type { VaiTro } from '../lib/can.js';
import { BaoLoi, HopThoaiXacNhan, Truong } from '../components/Chung.js';

type NguoiQuanLy = { username: string; fullName: string };
type DsQuanLy = {
  role: string;
  coApprover: boolean;
  coCapTren: boolean;
  approvers: NguoiQuanLy[];
  parents: NguoiQuanLy[];
};
type Toi = { approverUsername: string | null; parentUsername: string | null };

export function ThongTin() {
  const { nguoiDung, capNhatNguoiDung } = usePhien();
  const [ten, datTen] = useState(nguoiDung?.fullName ?? '');
  const [tbp, datTbp] = useState('');
  const [capTren, datCapTren] = useState('');
  /** Giá trị lúc mở màn hình — mốc để biết cái gì đã đổi. */
  const [goc, datGoc] = useState<Toi | null>(null);
  const [chon, datChon] = useState<DsQuanLy | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const [xong, datXong] = useState(false);
  const [hoi, datHoi] = useState(false);

  // Hai liên kết cây KHÔNG có trong phiên đăng nhập — phiên chỉ giữ id, tên,
  // email, vai trò. Đọc `/auth/me` cùng lúc với danh sách người chọn được.
  useEffect(() => {
    const huy = new AbortController();
    Promise.all([
      layJson<Toi>('/auth/me', huy.signal),
      layJson<DsQuanLy>('/auth/managers', huy.signal),
    ])
      .then(([toi, ds]) => {
        datGoc(toi);
        datTbp(toi.approverUsername ?? '');
        datCapTren(toi.parentUsername ?? '');
        datChon(ds);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  if (!nguoiDung) return null;

  const doiTen = ten.trim() !== nguoiDung.fullName && ten.trim().length >= 2;
  const doiTbp = goc !== null && tbp !== (goc.approverUsername ?? '');
  const doiCapTren = goc !== null && capTren !== (goc.parentUsername ?? '');
  const daDoi = (doiTen || doiTbp || doiCapTren) && ten.trim().length >= 2;

  const gui = async () => {
    datLoi(null);
    datXong(false);
    datDangGui(true);
    try {
      // Gửi chuỗi RỖNG khi người dùng chọn "Chưa gán": máy chủ phân biệt "không
      // đụng tới" (thiếu trường) với "gỡ liên kết" (chuỗi rỗng).
      const moi = await va<{ fullName: string }>('/auth/me', {
        fullName: ten.trim(),
        ...(doiTbp ? { approverUsername: tbp } : {}),
        ...(doiCapTren ? { parentUsername: capTren } : {}),
      });
      capNhatNguoiDung({ fullName: moi.fullName });
      datGoc({ approverUsername: tbp || null, parentUsername: capTren || null });
      datXong(true);
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  const oChon = (
    id: string,
    nhan: string,
    giaTri: string,
    dat: (v: string) => void,
    ds: NguoiQuanLy[],
  ) => (
    <>
      <Truong id={id} nhan={nhan}>
        {(p) => (
          <select
            {...p}
            className="o-nhap"
            value={giaTri}
            onChange={(e) => {
              dat(e.target.value);
              datXong(false);
            }}
          >
            <option value="">— Chưa gán —</option>
            {ds.map((x) => (
              <option key={x.username} value={x.username}>
                {x.fullName} ({x.username})
              </option>
            ))}
          </select>
        )}
      </Truong>
      {ds.length === 0 && (
        <p className="ghi-chu">Chưa có tài khoản nào đang hoạt động để chọn.</p>
      )}
    </>
  );

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

        {chon?.coApprover &&
          oChon('tt-tbp', 'Trưởng bộ phận quản lý', tbp, datTbp, chon.approvers)}
        {chon?.coCapTren &&
          oChon(
            'tt-cap-tren',
            NHAN_CAP_TREN[chon.role as VaiTro] || 'Người quản lý',
            capTren,
            datCapTren,
            chon.parents,
          )}

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
          tieuDe="Lưu thông tin của tôi"
          hauQua={
            <>
              {doiTen && (
                <p>
                  Họ tên: từ <strong>{nguoiDung.fullName}</strong> sang{' '}
                  <strong>{ten.trim()}</strong>. Tên này hiện trên hồ sơ bạn lập, trong thư hệ thống
                  gửi cho người khác, và trong <strong>nhật ký kiểm toán</strong> — nơi nó phải khớp
                  với chữ ký trên bản giấy.
                </p>
              )}
              {doiTbp && (
                <p>
                  Trưởng bộ phận quản lý: <strong>{goc?.approverUsername ?? 'chưa gán'}</strong> →{' '}
                  <strong>{tbp || 'chưa gán'}</strong>. Định tuyến suy ra từ liên kết này, nên{' '}
                  <strong>hồ sơ đang chờ duyệt chuyển sang hộp việc của người mới ngay</strong> —
                  người cũ không còn thấy nó nữa. Bỏ trống thì bạn chưa gửi được hồ sơ nào.
                </p>
              )}
              {doiCapTren && (
                <p>
                  Người quản lý: <strong>{goc?.parentUsername ?? 'chưa gán'}</strong> →{' '}
                  <strong>{capTren || 'chưa gán'}</strong>. Người quản lý cũ{' '}
                  <strong>không còn nhìn thấy dữ liệu của bạn</strong>, người mới thì thấy toàn bộ.
                </p>
              )}
            </>
          }
          nhanNut="Lưu"
          nguyHiem={doiTbp || doiCapTren}
          dangChay={dangGui}
          dong={() => datHoi(false)}
          xacNhan={() => void gui().then(() => datHoi(false))}
        />
      )}
    </section>
  );
}
