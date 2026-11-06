/**
 * Thẻ Tệp log (`0255`): xem log HÔM NAY (đang ghi, chưa nén) của một thành phần, tra một
 * mã ở mọi thành phần, và quản lý tệp nén hằng ngày (tải · xoá · lịch và số tệp giữ lại).
 *
 * Đây là công cụ TRA CỨU của Quản trị, cùng loại với màn hình *Nhật ký* — nên nó được
 * phép bày mã tra cứu (`loi.test.tsx` miễn đúng hai tệp này, `0244`). Bấm một mã là mở
 * Nhật ký lọc đúng mã ấy.
 */
import { useState } from 'react';
import { layJson, taiVe, xoa } from '../../lib/api.js';
import { useBaoLoi } from '../../lib/bao-loi.js';
import { Lien } from '../../lib/router.js';
import {
  THANH_PHAN,
  coTep,
  docDongLog,
  laMaTraCuu,
  ngayCuaTepLog,
  type DongLich,
} from '../../lib/van-hanh.js';
import { BaoLoi, DangTai, HopThoaiXacNhan, Trong, Truong } from '../Chung.js';
import { KhoiLich, useTaiVH } from './DungChung.js';

type DsLog = {
  dangGhi: { ten: string; service: string; ngay: string; co: number }[];
  daNen: { ten: string; ngay: string; co: number }[];
  giuToiDa: number;
  tongCo: number;
};

const TAT_CA = '__moi__';

function XemLog() {
  const [svc, datSvc] = useState('policy');
  const [muc, datMuc] = useState('canh-bao');
  const [ma, datMa] = useState('');
  const [loiMa, datLoiMa] = useState<string | undefined>();
  const [dong, datDong] = useState<string[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangTai, datDangTai] = useState(false);

  const xem = async () => {
    const m = ma.trim();
    if (m !== '' && !laMaTraCuu(m)) {
      datLoiMa('Mã tra cứu chỉ gồm chữ, số, gạch ngang — từ 4 ký tự.');
      return;
    }
    if (svc === TAT_CA && m === '') {
      datLoiMa('Tra ở mọi thành phần cần một mã tra cứu.');
      return;
    }
    datLoi(null);
    datDangTai(true);
    try {
      const q = new URLSearchParams();
      if (svc !== TAT_CA && muc !== 'tat-ca') q.set('muc', muc);
      if (m) q.set('traceId', m);
      const duong = svc === TAT_CA ? `/van-hanh/logs/tra?${q}` : `/van-hanh/logs/dang-ghi/${svc}?${q}`;
      datDong((await layJson<{ dong: string[] }>(duong)).dong);
    } catch (e) {
      datLoi(e);
    } finally {
      datDangTai(false);
    }
  };

  return (
    <section className="khoi">
      <h2>Hôm nay</h2>
      <form
        className="hang-nhap"
        onSubmit={(e) => {
          e.preventDefault();
          void xem();
        }}
      >
        <Truong id="log-thanh-phan" nhan="Thành phần">
          {(p) => (
            <select {...p} className="o-nhap" value={svc} onChange={(e) => datSvc(e.target.value)}>
              <option value={TAT_CA}>Mọi thành phần (theo mã tra cứu)</option>
              {THANH_PHAN.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </Truong>
        {svc !== TAT_CA && (
          <Truong id="log-muc" nhan="Mức">
            {(p) => (
              <select {...p} className="o-nhap" value={muc} onChange={(e) => datMuc(e.target.value)}>
                <option value="canh-bao">Lỗi và cảnh báo</option>
                <option value="loi">Chỉ lỗi</option>
                <option value="tat-ca">Tất cả</option>
              </select>
            )}
          </Truong>
        )}
        <Truong id="log-ma" nhan="Mã tra cứu" loi={loiMa}>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="off"
              value={ma}
              onChange={(e) => {
                datMa(e.target.value);
                datLoiMa(undefined);
              }}
            />
          )}
        </Truong>
        <button type="submit" className="nut nut-chinh" disabled={dangTai}>
          {dangTai ? 'Đang tải…' : 'Xem'}
        </button>
      </form>

      {loi !== null && <BaoLoi loi={loi} />}
      {dong !== null &&
        (dong.length === 0 ? (
          <p className="ghi-chu">Không có dòng nào khớp.</p>
        ) : (
          <div className="xem-log" role="log" aria-label="Các dòng log">
            {dong.map((d, i) => {
              const l = docDongLog(d);
              return (
                <div key={i} className={`dong-log dong-log-${l.muc}`}>
                  <span className="dong-log-luc">{l.luc ? l.luc.slice(11, 19) : ''}</span>
                  {l.traceId && (
                    <Lien den={`/nhat-ky?traceId=${encodeURIComponent(l.traceId)}`} className="dong-log-ma">
                      {l.traceId}
                    </Lien>
                  )}
                  <span className="dong-log-chu">{l.noiDung}</span>
                </div>
              );
            })}
          </div>
        ))}
    </section>
  );
}

export function TheTepLog() {
  const { bao } = useBaoLoi();
  const ds = useTaiVH<DsLog>('/van-hanh/logs');
  const lich = useTaiVH<DongLich[]>('/van-hanh/lich');
  const [hoi, datHoi] = useState<{ ten: string; co: number } | null>(null);
  const [dangXoa, datDangXoa] = useState(false);
  const [lichMoi, datLichMoi] = useState<DongLich | null>(null);

  const xacNhanXoa = async () => {
    if (!hoi) return;
    datDangXoa(true);
    try {
      await xoa(`/van-hanh/logs/${hoi.ten}`);
      datHoi(null);
      ds.taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangXoa(false);
    }
  };

  const nen = lichMoi ?? lich.du?.find((l) => l.viec === 'NEN_LOG');
  const coDangGhi = ds.du?.dangGhi.reduce((t, x) => t + x.co, 0) ?? 0;

  return (
    <>
      <XemLog />
      <section className="khoi">
        <h2>Tệp đã nén</h2>
        {ds.loi !== null && ds.du === null ? (
          <BaoLoi loi={ds.loi} thuLai={ds.taiLai} />
        ) : !ds.du ? (
          <DangTai />
        ) : (
          <>
            <p className="ghi-chu">
              {ds.du.daNen.length} / {ds.du.giuToiDa} tệp · đang ghi hôm nay {ds.du.dangGhi.length} tệp ({coTep(coDangGhi)}) ·
              tổng {coTep(ds.du.tongCo)}
            </p>
            {nen && <KhoiLich key={nen.viec} dong={nen} daLuu={(m) => { datLichMoi(m); ds.taiLai(); }} />}
            {ds.du.daNen.length === 0 ? (
              <Trong tieuDe="Chưa có tệp nén nào" moTa="Log của mỗi ngày được nén vào đêm hôm sau." />
            ) : (
              <div className="khung-cuon" role="region" aria-label="Tệp log đã nén" tabIndex={0}>
                <table className="bang">
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Tệp</th>
                      <th className="so">Cỡ</th>
                      <th>
                        <span className="chi-doc-man-hinh">Thao tác</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ds.du.daNen.map((t) => (
                      <tr key={t.ten}>
                        <td>{ngayCuaTepLog(t.ten)}</td>
                        <td className="ma-phu">{t.ten}</td>
                        <td className="so">{coTep(t.co)}</td>
                        <td>
                          <div className="nhom-nut nhom-nut-hang">
                            <button
                              type="button"
                              className="nut nut-nhe"
                              onClick={() => void taiVe(`/van-hanh/logs/${t.ten}/tai`, t.ten).catch(bao)}
                            >
                              Tải
                            </button>
                            <button type="button" className="nut nut-nhe" onClick={() => datHoi({ ten: t.ten, co: t.co })}>
                              Xoá
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {hoi && (
        <HopThoaiXacNhan
          tieuDe={`Xoá log ngày ${ngayCuaTepLog(hoi.ten)}?`}
          hauQua={<p>Tệp {hoi.ten} ({coTep(hoi.co)}) sẽ mất hẳn. Việc xoá được ghi vào Nhật ký.</p>}
          nhanNut="Xoá"
          dangChay={dangXoa}
          dong={() => datHoi(null)}
          xacNhan={() => void xacNhanXoa()}
        />
      )}
    </>
  );
}
