/**
 * Trang đầu tiên sau khi đăng nhập. Nội dung KHÁC NHAU theo vai trò.
 *
 * Trước đây trang này là hộp việc và chỉ có hộp việc — nên Ban lãnh đạo và Quản
 * trị hệ thống, hai vai trò mà `/policies/inbox` trả rỗng theo thiết kế
 * (`policies.service.ts`, bảng `waitingFor`), đăng nhập vào một trang TRẮNG
 * không lời giải thích.
 *
 * Màn hình này không tự quyết gì: nó đọc `THE_THEO_VAI_TRO` và `KHOI_THEO_VAI_TRO`
 * ở `lib/tong-quan.ts` rồi dựng theo. Thêm một vai trò là thêm một dòng vào hai
 * bảng đó, không phải sửa ở đây.
 */
import { usePhien } from '../lib/auth.js';
import { useBaoCao } from '../lib/bao-cao.js';
import {
  KHOI_THEO_VAI_TRO,
  LY_DO_KHONG_CO_VIEC,
  MOI_TRANG_TONG_QUAN,
  THE_THEO_VAI_TRO,
  type TenKhoi,
} from '../lib/tong-quan.js';
import type { VaiTro } from '../lib/can.js';
import { BaoLoi, DangTai } from '../components/Chung.js';
import { Khoi, ViSaoKhongCoViec } from '../components/khoi/Khung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { useTrangMay } from '../lib/phan-trang.js';
import { DanhSachViec, type MucViec } from '../components/khoi/HopViec.js';
import { YeuCauCapNhat } from '../components/khoi/YeuCauCapNhat.js';
import { DaiTheTrangThai, SucKhoeLuong, TheoBuoc, TheoTdv } from '../components/khoi/SoLieu.js';
import {
  CanhBaoMauHopDong,
  CanhBaoThuHong,
  HoatDongHomNay,
  NhatKyGon,
  OHeThong,
} from '../components/khoi/HeThong.js';

/** Khối nào cần tới ba báo cáo tổng hợp. */
const CAN_BAO_CAO: TenKhoi[] = ['suc-khoe-luong', 'theo-buoc', 'theo-tdv'];
/** Khối nào cần hộp việc. */
const CAN_HOP_VIEC: TenKhoi[] = ['hop-viec'];

export function TongQuan() {
  const { nguoiDung } = usePhien();
  const vaiTro = (nguoiDung?.role ?? '') as VaiTro;

  const the = THE_THEO_VAI_TRO[vaiTro] ?? [];
  const khoi = KHOI_THEO_VAI_TRO[vaiTro] ?? [];

  // Chỉ gọi endpoint mà bộ khối của vai trò này thật sự dùng. Quản trị hệ thống
  // có phạm vi dữ liệu rỗng, nên gọi `/reports/*` cho họ là ba lượt mạng để
  // nhận về ba số 0.
  const canBaoCao = the.length > 0 || khoi.some((k) => CAN_BAO_CAO.includes(k));
  const { bo, loi: loiBaoCao, luc } = useBaoCao(canBaoCao);

  const canViec = khoi.some((k) => CAN_HOP_VIEC.includes(k));
  const {
    muc: viec,
    tong: tongViec,
    loi: loiViec,
    trang: trangViec,
    soTrang: soTrangViec,
    doiTrang: doiTrangViec,
  } = useTrangMay<MucViec>(canViec ? '/policies/inbox' : null, MOI_TRANG_TONG_QUAN);

  const veKhoi = (ten: TenKhoi) => {
    switch (ten) {
      // Dựng RIÊNG ở trên, trước dải thẻ — xem chỗ gọi.
      case 'vi-sao-khong-co-viec':
        return null;

      case 'canh-bao-mau-hop-dong':
        return <CanhBaoMauHopDong key={ten} />;

      case 'canh-bao-thu-hong':
        return <CanhBaoThuHong key={ten} />;

      case 'yeu-cau-cap-nhat':
        return <YeuCauCapNhat key={ten} />;

      case 'hop-viec':
        return (
          <Khoi
            key={ten}
            tieuDe="Việc của tôi"
            loi={loiViec}
            dangTai={viec === null && loiViec === null}
          >
            <DanhSachViec
              muc={viec ?? []}
              trongTieuDe="Không có hồ sơ nào đang chờ bạn"
              trongMoTa="Hồ sơ sẽ hiện ở đây khi tới bước bạn phụ trách."
            />
            <PhanTrang
              trang={trangViec}
              soTrang={soTrangViec}
              tong={tongViec}
              doiTrang={doiTrangViec}
              nhan="hồ sơ"
            />
          </Khoi>
        );

      case 'suc-khoe-luong':
        return (
          <Khoi key={ten} tieuDe="Sức khoẻ luồng duyệt">
            {bo && <SucKhoeLuong bo={bo} />}
          </Khoi>
        );

      case 'theo-buoc':
        return (
          <Khoi key={ten} tieuDe="Đang tắc ở bước nào">
            {bo && <TheoBuoc bo={bo} />}
          </Khoi>
        );

      case 'theo-tdv':
        return (
          <Khoi key={ten} tieuDe="Theo trình dược viên">
            {bo && <TheoTdv bo={bo} />}
          </Khoi>
        );

      case 'o-he-thong':
        return <OHeThong key={ten} />;

      case 'hoat-dong-hom-nay':
        return <HoatDongHomNay key={ten} />;

      case 'nhat-ky-gon':
        return <NhatKyGon key={ten} />;
    }
  };

  return (
    <section className="trang">
      <h1>Tổng quan</h1>
      <p className="mo-ta-trang">
        Xin chào {nguoiDung?.fullName}.
        {luc !== null && ` Số liệu tính lúc ${gio(luc)}.`}
      </p>

      {/*
        Câu giải thích đứng TRƯỚC mọi con số, không đi theo thứ tự trong bảng
        khối. Đọc "đây là bản tổng hợp, chỉ để xem" rồi mới nhìn số thì hiểu ngay
        mình đang xem gì; đọc sau mười một con số thì đã muộn.
      */}
      {khoi.includes('vi-sao-khong-co-viec') && (
        <ViSaoKhongCoViec ly_do={LY_DO_KHONG_CO_VIEC[vaiTro] ?? ''} />
      )}

      {/*
        Dải thẻ. Chỉ phần việc của chính vai trò này, cộng một thẻ gộp cho phần
        còn lại đang chạy trong luồng — xem `THE_THEO_VAI_TRO`. Quản trị hệ thống
        không có thẻ nào vì phạm vi dữ liệu của họ rỗng, nên mọi con số sẽ là 0
        và đọc ra nghĩa hoàn toàn sai.
      */}
      {the.length > 0 && loiBaoCao !== null && <BaoLoi loi={loiBaoCao} />}
      {the.length > 0 && bo === null && loiBaoCao === null && <DangTai />}
      {the.length > 0 && bo !== null && <DaiTheTrangThai danhSach={the} bo={bo} />}

      {khoi.map(veKhoi)}
    </section>
  );
}

const gio = (d: Date): string =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
