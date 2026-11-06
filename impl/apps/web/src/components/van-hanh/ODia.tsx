/**
 * Thẻ Ổ đĩa (`0255`): hai ổ (dữ liệu · bản sao ngoài) có thanh mức dùng và đường 30 ngày,
 * cỡ theo hạng mục, và MỘT ngưỡng cảnh báo (chốt 05/11).
 */
import { useState } from 'react';
import { dat } from '../../lib/api.js';
import { useBaoLoi } from '../../lib/bao-loi.js';
import { NHAN_HANG_MUC, NHAN_O, NHAN_VUNG, coTep } from '../../lib/van-hanh.js';
import { BaoLoi, DangTai, Truong } from '../Chung.js';
import { useTaiVH } from './DungChung.js';

type O = {
  o: string;
  tong: number;
  dung: number;
  conLai: number;
  phanTram: number;
  vuotNguong: boolean;
  duBaoNgayDay: number | null;
  cungODuLieu?: boolean;
};
type DuLieu = {
  theoO: O[];
  theoHangMuc: { hangMuc: string; co: number }[];
  theoDocker: { ten: string; loai: 'VOLUME' | 'ANH'; co: number; luc: string }[];
  nguong: number;
  guiThu: boolean;
  lichSu: Record<string, { luc: string; dung: number; tong: number }[]>;
};

const phanTram = (v: number) => `${String(v).replace('.', ',')}%`;

/** Đường mức dùng 30 ngày — vẽ tay, vài chục điểm, không đáng một thư viện. */
function Duong({ mau }: { mau: { dung: number; tong: number }[] }) {
  if (mau.length < 2) return <span className="ghi-chu">Chưa đủ số liệu để vẽ.</span>;
  const w = 160;
  const h = 32;
  const ys = mau.map((m) => (m.dung / m.tong) * 100);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const y = (v: number) => (hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4));
  const d = ys.map((v, i) => `${i ? 'L' : 'M'}${((i / (ys.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="duong-o-dia" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Mức dùng từ ${lo.toFixed(1)}% tới ${hi.toFixed(1)}%`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function NguongCanhBao({ nguong, guiThu, daLuu }: { nguong: number; guiThu: boolean; daLuu: () => void }) {
  const { bao } = useBaoLoi();
  const [so, datSo] = useState(String(nguong));
  const [thu, datThu] = useState(guiThu);
  const [loi, datLoi] = useState<string | undefined>();
  const [dangGui, datDangGui] = useState(false);
  const [xong, datXong] = useState(false);

  const luu = async () => {
    const n = Number(so);
    if (!/^\d+$/.test(so.trim()) || n < 1 || n > 99) {
      datLoi('Ngưỡng phải là số nguyên từ 1 đến 99.');
      return;
    }
    datDangGui(true);
    try {
      await dat('/van-hanh/o-dia/nguong', { nguong: n, guiThu: thu });
      datXong(true);
      daLuu();
    } catch (e) {
      bao(e, { vaoO: (d) => datLoi(d.cau) });
    } finally {
      datDangGui(false);
    }
  };

  return (
    <section className="khoi">
      <h2>Ngưỡng cảnh báo</h2>
      <form
        className="hang-nhap"
        onSubmit={(e) => {
          e.preventDefault();
          void luu();
        }}
      >
        <Truong id="nguong-o-dia" nhan="Cảnh báo khi ổ dùng từ" donVi="%" loi={loi}>
          {(p) => (
            <input
              {...p}
              className="o-nhap o-nhap-hep"
              inputMode="numeric"
              value={so}
              onChange={(e) => {
                datSo(e.target.value);
                datLoi(undefined);
                datXong(false);
              }}
            />
          )}
        </Truong>
        <label className="o-danh-dau">
          <input
            type="checkbox"
            checked={thu}
            onChange={(e) => {
              datThu(e.target.checked);
              datXong(false);
            }}
          />
          Gửi thư cho Quản trị khi vượt ngưỡng
        </label>
        <button type="submit" className="nut nut-chinh" disabled={dangGui}>
          {dangGui ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>
      {xong && (
        <p className="ghi-chu" role="status">
          Đã lưu ngưỡng cảnh báo.
        </p>
      )}
    </section>
  );
}

export function TheODia() {
  const { du, loi, taiLai } = useTaiVH<DuLieu>('/van-hanh/o-dia');
  if (loi !== null && du === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!du) return <DangTai />;

  const anh = du.theoDocker.find((d) => d.loai === 'ANH');
  const hangMuc = [
    ...du.theoHangMuc.map((h) => ({ ten: NHAN_HANG_MUC[h.hangMuc] ?? h.hangMuc, co: h.co })),
    ...(anh ? [{ ten: NHAN_VUNG['anh-docker']!, co: anh.co }] : []),
  ];

  return (
    <>
      <section className="khoi">
        <h2>Theo ổ</h2>
        {du.theoO.length === 0 && <p className="ghi-chu">Máy chủ chưa khai thư mục nào để đo.</p>}
        <div className="ds-o-dia">
          {du.theoO.map((o) => (
            <div key={o.o} className="o-dia">
              <div className="o-dia-dau">
                <strong>{NHAN_O[o.o] ?? o.o}</strong>
                <span className="so">
                  {coTep(o.dung)} / {coTep(o.tong)} · còn trống {coTep(o.conLai)}
                </span>
                <strong className="so o-dia-phan-tram">{phanTram(o.phanTram)}</strong>
              </div>
              <div
                className="thanh-o-dia"
                role="meter"
                aria-label={`${NHAN_O[o.o] ?? o.o} đã dùng`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={o.phanTram}
              >
                <i className={o.vuotNguong ? 'vuot' : ''} style={{ width: `${Math.min(100, o.phanTram)}%` }} />
              </div>
              <div className="o-dia-duoi">
                {o.vuotNguong ? (
                  <span className="nhan nhan-canh-bao">
                    Vượt ngưỡng {du.nguong}%
                    {o.duBaoNgayDay !== null ? ` · đầy sau khoảng ${o.duBaoNgayDay} ngày` : ''}
                  </span>
                ) : o.duBaoNgayDay !== null ? (
                  <span className="ghi-chu">Đầy sau khoảng {o.duBaoNgayDay} ngày nếu giữ tốc độ hiện tại.</span>
                ) : null}
                {o.cungODuLieu && (
                  <span className="nhan nhan-loi">Bản sao ngoài nằm CÙNG ổ với dữ liệu — hỏng ổ là mất cả hai.</span>
                )}
                <Duong mau={du.lichSu[o.o] ?? []} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="khoi">
        <h2>Theo hạng mục</h2>
        <div className="khung-cuon" role="region" aria-label="Dung lượng theo hạng mục" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th className="so">Cỡ</th>
              </tr>
            </thead>
            <tbody>
              {hangMuc.map((h) => (
                <tr key={h.ten}>
                  <td>{h.ten}</td>
                  <td className="so">{coTep(h.co)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <NguongCanhBao nguong={du.nguong} guiThu={du.guiThu} daLuu={taiLai} />
    </>
  );
}
