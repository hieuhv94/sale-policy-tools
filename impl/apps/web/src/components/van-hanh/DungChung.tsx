/**
 * Phần dùng chung của trang Vận hành (`0255`): móc tải dữ liệu, khối sửa lịch tự động, nhãn
 * kết quả, hộp xem đầu ra.
 *
 * KHỐI LỊCH LÀ MỘT COMPONENT cho cả ba chỗ đặt nó — thẻ Sao lưu, thẻ Tệp log, và hộp *Sửa*
 * của thẻ Lịch tự động (chốt 05/11: lịch và số bản giữ phải NHÌN THẤY ngay ở thẻ của việc
 * ấy). Ba chỗ cùng sửa MỘT dòng `ops.cau_hinh_viec`, nên ba bản biểu mẫu sẽ là ba bộ luật
 * kiểm có thể lệch nhau.
 */
import { useCallback, useEffect, useState } from 'react';
import { dat, layJson } from '../../lib/api.js';
import { useBaoLoi } from '../../lib/bao-loi.js';
import { ngayGio } from '../../lib/format.js';
import {
  CHI_HANG_NGAY,
  GIU_TOI_DA,
  NHAN_KET_QUA,
  TAN_SUAT,
  THU,
  kiemLich,
  moTaLich,
  thanLich,
  type BieuMauLich,
  type DongLich,
} from '../../lib/van-hanh.js';
import { HopThoai, Truong } from '../Chung.js';

/** Tải một đường, tuỳ chọn tự làm mới theo chu kỳ. Lỗi lượt làm mới KHÔNG xoá dữ liệu đang hiện. */
export function useTaiVH<T>(duong: string, chuKyMs?: number) {
  const [du, datDu] = useState<T | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    layJson<T>(duong, huy.signal)
      .then((r) => {
        datDu(r);
        datLoi(null);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [duong, lan]);

  useEffect(() => {
    if (!chuKyMs) return;
    const t = setInterval(taiLai, chuKyMs);
    return () => clearInterval(t);
  }, [chuKyMs, taiLai]);

  return { du, loi, taiLai };
}

export function NhanKetQua({ kq }: { kq: string | null | undefined }) {
  if (!kq) return <span className="nhan nhan-thuong">chưa chạy lần nào</span>;
  const m = NHAN_KET_QUA[kq] ?? { nhan: kq, lop: 'nhan-thuong' };
  return <span className={`nhan ${m.lop}`}>{m.nhan}</span>;
}

/** Đầu ra một lượt chạy — đúng chữ máy chủ ghi lại, cho người vận hành đọc khi có chuyện. */
export function HopDauRa({ tieuDe, noiDung, dong }: { tieuDe: string; noiDung: string | null; dong: () => void }) {
  return (
    <HopThoai tieuDe={tieuDe} dong={dong} co="rong">
      <pre className="dau-ra-van-hanh">{noiDung?.trim() || 'Không có đầu ra.'}</pre>
      <div className="nhom-nut">
        <button type="button" className="nut" onClick={dong}>
          Đóng
        </button>
      </div>
    </HopThoai>
  );
}

const tuDong = (d: DongLich): BieuMauLich => ({
  tanSuat: d.tanSuat,
  gioChay: d.gioChay,
  thuTrongTuan: d.thuTrongTuan === null ? '' : String(d.thuTrongTuan),
  giuToiDa: d.giuToiDa === null ? '' : String(d.giuToiDa),
});

/**
 * Biểu mẫu lịch của MỘT việc.
 *
 * Giảm số bản giữ thì KHÔNG xoá gì lúc Lưu (chốt 05/11): lượt chạy kế tiếp dọn, cũ nhất
 * trước, và chỉ sau khi bản mới đã ghi xong. Câu báo sau khi lưu nói ra điều đó.
 */
export function KhoiLich({
  dong,
  daLuu,
  trongHop = false,
}: {
  dong: DongLich;
  daLuu: (d: DongLich) => void;
  /** Trong hộp thoại thì không có khung viền riêng và không có tiêu đề. */
  trongHop?: boolean;
}) {
  const { bao } = useBaoLoi();
  const [f, datF] = useState<BieuMauLich>(() => tuDong(dong));
  const [loi, datLoi] = useState<Partial<Record<keyof BieuMauLich | 'lich', string>>>({});
  const [dangGui, datDangGui] = useState(false);
  const [thongBao, datThongBao] = useState<string | null>(null);
  const g = GIU_TOI_DA[dong.viec];
  const chiNgay = CHI_HANG_NGAY.includes(dong.viec);
  const id = (o: string) => `lich-${dong.viec}-${o}${trongHop ? '-hop' : ''}`;

  const doi = (o: keyof BieuMauLich, v: string) => {
    datF((x) => ({ ...x, [o]: v }));
    datLoi((x) => {
      const con = { ...x };
      delete con[o];
      delete con.lich;
      return con;
    });
    datThongBao(null);
  };

  const luu = async () => {
    const l = kiemLich(dong.viec, f);
    datLoi(l);
    if (Object.keys(l).length > 0) return;
    datDangGui(true);
    try {
      const moi = await dat<DongLich>(`/van-hanh/lich/${dong.viec}`, thanLich(dong.viec, f));
      const giam = g !== null && moi.giuToiDa !== null && dong.giuToiDa !== null && moi.giuToiDa < dong.giuToiDa;
      datThongBao(
        giam
          ? `Đã lưu. Các ${g!.donVi} thừa sẽ được xoá ở lượt chạy kế tiếp, cũ nhất trước.`
          : 'Đã lưu lịch tự động.',
      );
      datF(tuDong(moi));
      daLuu(moi);
    } catch (e) {
      bao(e, { vaoO: (d) => datLoi((x) => ({ ...x, [d.truong ?? 'lich']: d.cau })) });
    } finally {
      datDangGui(false);
    }
  };

  return (
    <div className={trongHop ? 'khoi-lich trong-hop' : 'khoi-lich'}>
      {!trongHop && (
        <p className="khoi-lich-tieu">
          <strong>Lịch tự động</strong> · {moTaLich(dong)} · lần tới {ngayGio(dong.lanToi)}
        </p>
      )}
      <form
        className="hang-nhap"
        onSubmit={(e) => {
          e.preventDefault();
          void luu();
        }}
      >
        {!chiNgay && (
          <Truong id={id('tan-suat')} nhan="Tần suất" loi={loi.tanSuat}>
            {(p) => (
              <select {...p} className="o-nhap" value={f.tanSuat} onChange={(e) => doi('tanSuat', e.target.value)}>
                {TAN_SUAT.map((t) => (
                  <option key={t.khoa} value={t.khoa}>
                    {t.nhan}
                  </option>
                ))}
              </select>
            )}
          </Truong>
        )}
        {!chiNgay && f.tanSuat === 'HANG_TUAN' && (
          <Truong id={id('thu')} nhan="Thứ" loi={loi.thuTrongTuan}>
            {(p) => (
              <select {...p} className="o-nhap" value={f.thuTrongTuan} onChange={(e) => doi('thuTrongTuan', e.target.value)}>
                <option value="">— chọn —</option>
                {THU.map((t) => (
                  <option key={t.so} value={String(t.so)}>
                    {t.nhan}
                  </option>
                ))}
              </select>
            )}
          </Truong>
        )}
        {/*
          Ô chữ, KHÔNG `type="time"`: Chromium vẽ ô giờ theo ngôn ngữ GIAO DIỆN của trình
          duyệt — máy cài tiếng Anh hiện 01:15 AM, và người nhập 13:00 đọc ra một con số
          khác thứ máy chủ lưu (cùng phép đo `0208` đã làm cho ô ngày).
        */}
        <Truong id={id('gio')} nhan="Chạy lúc (giờ Việt Nam)" loi={loi.gioChay}>
          {(p) => (
            <input
              {...p}
              className="o-nhap o-nhap-hep"
              inputMode="numeric"
              placeholder="01:15"
              value={f.gioChay}
              onChange={(e) => doi('gioChay', e.target.value)}
            />
          )}
        </Truong>
        {g && (
          <Truong id={id('giu')} nhan={`Giữ tối đa (${g.donVi})`} loi={loi.giuToiDa}>
            {(p) => (
              <input
                {...p}
                className="o-nhap o-nhap-hep"
                inputMode="numeric"
                value={f.giuToiDa}
                onChange={(e) => doi('giuToiDa', e.target.value)}
              />
            )}
          </Truong>
        )}
        <button type="submit" className="nut nut-chinh" disabled={dangGui}>
          {dangGui ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>
      {loi.lich && <p className="truong-loi">{loi.lich}</p>}
      {thongBao && (
        <p className="ghi-chu" role="status">
          {thongBao}
        </p>
      )}
    </div>
  );
}
