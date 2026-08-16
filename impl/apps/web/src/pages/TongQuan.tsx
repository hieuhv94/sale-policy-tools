/**
 * Trang đầu tiên sau khi đăng nhập. Nội dung KHÁC NHAU theo vai trò.
 *
 * Trước đây trang này là hộp việc và chỉ có hộp việc — nên Ban lãnh đạo và Quản
 * trị hệ thống, hai vai trò mà `/policies/inbox` trả rỗng theo thiết kế
 * (`policies.service.ts`, bảng `waitingFor`), đăng nhập vào một trang TRẮNG
 * không lời giải thích.
 *
 * Màn hình này không tự quyết gì: nó đọc `THE_TRANG_THAI` và `KHOI_THEO_VAI_TRO`
 * ở `lib/tong-quan.ts` rồi dựng theo. Thêm một vai trò là thêm một dòng vào hai
 * bảng đó, không phải sửa ở đây.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { useBaoCao } from '../lib/bao-cao.js';
import {
  CO_THE_DANG_CHO,
  KHOI_THEO_VAI_TRO,
  LY_DO_KHONG_CO_VIEC,
  THE_TRANG_THAI,
  type TenKhoi,
} from '../lib/tong-quan.js';
import type { VaiTro } from '../lib/can.js';
import { BaoLoi, DangTai } from '../components/Chung.js';
import { Khoi, ViSaoKhongCoViec } from '../components/khoi/Khung.js';
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
const CAN_HOP_VIEC: TenKhoi[] = ['hop-viec', 'hop-viec-ke-toan'];

export function TongQuan() {
  const { nguoiDung } = usePhien();
  const vaiTro = (nguoiDung?.role ?? '') as VaiTro;

  const the = THE_TRANG_THAI[vaiTro] ?? [];
  const khoi = KHOI_THEO_VAI_TRO[vaiTro] ?? [];

  // Chỉ gọi endpoint mà bộ khối của vai trò này thật sự dùng. Quản trị hệ thống
  // có phạm vi dữ liệu rỗng, nên gọi `/reports/*` cho họ là ba lượt mạng để
  // nhận về ba số 0.
  const canBaoCao = the.length > 0 || khoi.some((k) => CAN_BAO_CAO.includes(k));
  const { bo, loi: loiBaoCao, luc } = useBaoCao(canBaoCao);

  const canViec = khoi.some((k) => CAN_HOP_VIEC.includes(k));
  const [viec, datViec] = useState<MucViec[] | null>(null);
  const [loiViec, datLoiViec] = useState<unknown>(null);

  useEffect(() => {
    if (!canViec) return;
    const huy = new AbortController();
    layJson<{ items: MucViec[] }>('/policies/inbox?limit=100', huy.signal)
      .then((r) => datViec(r.items))
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoiViec(e);
      });
    return () => huy.abort();
  }, [canViec]);

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
          </Khoi>
        );

      /*
        Kế toán xử lý HAI lần tiếp nhận, và đó là hai việc khác nhau ở hai màn
        hình khác nhau (muc 2.3). Trộn chung một danh sách thì họ phải đọc nhãn
        trạng thái từng dòng mới biết dòng đó thuộc bước nào.
      */
      case 'hop-viec-ke-toan':
        return (
          <Khoi
            key={ten}
            tieuDe="Việc của tôi"
            loi={loiViec}
            dangTai={viec === null && loiViec === null}
          >
            <h3 className="tieu-de-phu">Tiếp nhận lần 1</h3>
            <DanhSachViec
              muc={(viec ?? []).filter((v) => buoc(v) === 'CHO_KT_L1')}
              trongTieuDe="Không có hồ sơ nào chờ tiếp nhận lần 1"
            />
            <h3 className="tieu-de-phu">Tiếp nhận lần 2</h3>
            <DanhSachViec
              muc={(viec ?? []).filter((v) => buoc(v) === 'CHO_KT_L2')}
              trongTieuDe="Không có hồ sơ nào chờ tiếp nhận lần 2"
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
        Dải thẻ trạng thái. Chỉ những trạng thái thuộc phần việc của chính vai
        trò này — xem `THE_TRANG_THAI`. Quản trị hệ thống không có thẻ nào vì
        phạm vi dữ liệu của họ rỗng, nên mọi con số sẽ là 0 và đọc ra nghĩa sai.
      */}
      {the.length > 0 && loiBaoCao !== null && <BaoLoi loi={loiBaoCao} />}
      {the.length > 0 && bo === null && loiBaoCao === null && <DangTai />}
      {the.length > 0 && bo !== null && (
        <DaiTheTrangThai
          danhSach={the}
          bo={bo}
          themTheDangCho={CO_THE_DANG_CHO.includes(vaiTro)}
        />
      )}

      {khoi.map(veKhoi)}
    </section>
  );
}

/**
 * Bước đang chờ của một mục trong hộp việc.
 *
 * Đọc `status` khi hồ sơ chưa quá hạn, và đọc `pendingStep` khi đã quá hạn —
 * lúc đó `status` là `QUA_HAN_DUYET` và bước cũ được giữ riêng để hồ sơ đi tiếp
 * đúng nhánh (muc 4). Chỉ nhìn `status` thì mọi hồ sơ quá hạn của Kế toán rơi ra
 * ngoài cả hai danh sách và biến mất khỏi màn hình.
 */
function buoc(v: MucViec): string {
  if (v.status !== 'QUA_HAN_DUYET') return v.status;
  return v.pendingStep === 'B6_KT_L1' ? 'CHO_KT_L1' : 'CHO_KT_L2';
}

const gio = (d: Date): string =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
