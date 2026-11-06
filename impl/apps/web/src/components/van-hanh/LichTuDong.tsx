/**
 * Thẻ Lịch tự động (`0255`): mọi việc định kỳ một chỗ, sửa lịch bằng CHÍNH khối lịch của thẻ
 * Sao lưu / Tệp log (`KhoiLich` — một bộ luật kiểm cho cả ba chỗ), và lịch sử các lượt chạy.
 *
 * Không có dòng chú thích kiểu *"dòng đỏ khi quá một chu kỳ…"* (chốt 05/11) — nhãn kết quả
 * tự nói lên.
 */
import { useState } from 'react';
import { ngayGio } from '../../lib/format.js';
import { GIU_TOI_DA, NHAN_VIEC, moTaLich, type DongLich, type LanChay, type Viec } from '../../lib/van-hanh.js';
import { BaoLoi, DangTai, HopThoai, Trong } from '../Chung.js';
import { HopDauRa, KhoiLich, NhanKetQua, useTaiVH } from './DungChung.js';

type DongLanChay = LanChay & { id: string; viec: Viec };

/** Hai việc chạy theo nhịp cố định của máy chủ — không có gì để cấu hình. */
const CO_DINH = [
  { ten: 'Thu log nền tảng', lich: '5 phút một lần' },
  { ten: 'Đo ổ đĩa', lich: 'mỗi giờ' },
];

export function TheLichTuDong() {
  const lich = useTaiVH<DongLich[]>('/van-hanh/lich');
  const ls = useTaiVH<DongLanChay[]>('/van-hanh/lan-chay?so=30');
  const [sua, datSua] = useState<DongLich | null>(null);
  const [dauRa, datDauRa] = useState<DongLanChay | null>(null);

  return (
    <>
      <section className="khoi">
        <h2>Việc định kỳ</h2>
        {lich.loi !== null && lich.du === null ? (
          <BaoLoi loi={lich.loi} thuLai={lich.taiLai} />
        ) : !lich.du ? (
          <DangTai />
        ) : (
          <div className="khung-cuon" role="region" aria-label="Việc định kỳ" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Việc</th>
                  <th>Chạy lúc</th>
                  <th className="so">Giữ tối đa</th>
                  <th>Lần chạy cuối</th>
                  <th>Kết quả</th>
                  <th>
                    <span className="chi-doc-man-hinh">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lich.du.map((d) => {
                  const g = GIU_TOI_DA[d.viec];
                  return (
                    <tr key={d.viec}>
                      <td>{NHAN_VIEC[d.viec]}</td>
                      <td>
                        {moTaLich(d)}
                        <div className="ghi-chu">lần tới {ngayGio(d.lanToi)}</div>
                      </td>
                      <td className="so">{g && d.giuToiDa !== null ? `${d.giuToiDa} ${g.donVi}` : '—'}</td>
                      <td>{d.lanGanNhat ? ngayGio(d.lanGanNhat.batDau) : '—'}</td>
                      <td>
                        <NhanKetQua kq={d.lanGanNhat?.ketQua} />
                      </td>
                      <td>
                        <button type="button" className="nut nut-nhe" onClick={() => datSua(d)}>
                          Sửa
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {CO_DINH.map((c) => (
                  <tr key={c.ten}>
                    <td>{c.ten}</td>
                    <td>{c.lich}</td>
                    <td className="so">—</td>
                    <td>—</td>
                    <td>
                      <span className="nhan nhan-thuong">cố định</span>
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="khoi">
        <h2>Lịch sử các lượt chạy</h2>
        {ls.loi !== null && ls.du === null ? (
          <BaoLoi loi={ls.loi} thuLai={ls.taiLai} />
        ) : !ls.du ? (
          <DangTai />
        ) : ls.du.length === 0 ? (
          <Trong tieuDe="Chưa có lượt chạy nào" />
        ) : (
          <div className="khung-cuon" role="region" aria-label="Lịch sử các lượt chạy" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Lúc</th>
                  <th>Việc</th>
                  <th>Cách chạy</th>
                  <th>Kết quả</th>
                  <th>
                    <span className="chi-doc-man-hinh">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ls.du.map((l) => (
                  <tr key={l.id}>
                    <td>{ngayGio(l.batDau)}</td>
                    <td>{NHAN_VIEC[l.viec] ?? l.viec}</td>
                    <td>{l.tuDong ? 'Theo lịch' : 'Chạy tay'}</td>
                    <td>
                      <NhanKetQua kq={l.ketQua} />
                    </td>
                    <td>
                      {l.chiTiet && (
                        <button type="button" className="nut nut-nhe" onClick={() => datDauRa(l)}>
                          Xem chi tiết
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sua && (
        <HopThoai tieuDe={NHAN_VIEC[sua.viec]} dong={() => datSua(null)}>
          <KhoiLich
            dong={sua}
            trongHop
            daLuu={() => {
              lich.taiLai();
            }}
          />
          <div className="nhom-nut">
            <button type="button" className="nut nut-nhe" onClick={() => datSua(null)}>
              Đóng
            </button>
          </div>
        </HopThoai>
      )}
      {dauRa && (
        <HopDauRa
          tieuDe={`${NHAN_VIEC[dauRa.viec] ?? dauRa.viec} — ${ngayGio(dauRa.batDau)}`}
          noiDung={dauRa.chiTiet}
          dong={() => datDauRa(null)}
        />
      )}
    </>
  );
}
