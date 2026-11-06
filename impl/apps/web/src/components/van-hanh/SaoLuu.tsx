/**
 * Thẻ Sao lưu (`0255`): hai khối — cơ sở dữ liệu và kho tệp — mỗi khối có lịch tự động
 * (nhìn thấy và sửa ngay tại đây, chốt 05/11), nút *Sao lưu ngay*, và danh sách bản.
 *
 * Không chữ "dump", không khối *Phục hồi* (chốt 05/11 — Quản trị không có chuyên môn IT;
 * phục hồi là việc ở máy chủ). Bản chụp kho tệp không có nút Tải: mỗi bản là toàn bộ kho.
 *
 * *Sao lưu ngay* đi qua TÁC TỬ trên máy chủ (`0254`): bấm là xếp một việc, rồi trang hỏi lại
 * mỗi 3 giây tới khi việc xong. Tác tử mất liên lạc thì nút xám VÀ có một dòng chữ nói vì
 * sao — `title` một mình không tới được trình đọc màn hình trên nút `disabled` (`0160`).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { dang, layJson, taiVe, xoa } from '../../lib/api.js';
import { useBaoLoi } from '../../lib/bao-loi.js';
import { ngayGio } from '../../lib/format.js';
import { coTep, type DongLich, type ViecTay } from '../../lib/van-hanh.js';
import { BaoLoi, DangTai, HopThoaiXacNhan, Trong } from '../Chung.js';
import { HopDauRa, KhoiLich, NhanKetQua, useTaiVH } from './DungChung.js';

type BanCsdl = { ten: string; luc: string; co: number; coBanSaoNgoai: boolean; moiNhat: boolean };
type BanChup = { moc: string; luc: string; soTep: number; chiemThem: number; coBanSaoNgoai: boolean; moiNhat: boolean };
type DsSaoLuu = { csdl: BanCsdl[]; khoTep: BanChup[] };
type TacTu = { online: boolean; viec: ViecTay[] };

type Loai = 'CSDL' | 'KHO_TEP';
const VIEC_CUA: Record<Loai, 'SAO_LUU_CSDL' | 'SAO_LUU_KHO_TEP'> = { CSDL: 'SAO_LUU_CSDL', KHO_TEP: 'SAO_LUU_KHO_TEP' };

/** Nút *Sao lưu ngay* + dòng trạng thái của việc đang chạy. */
function NutSaoLuuNgay({
  loai,
  nhan,
  tacTu,
  xong,
}: {
  loai: Loai;
  nhan: string;
  tacTu: TacTu | null;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [viec, datViec] = useState<ViecTay | null>(null);
  const [xemDauRa, datXemDauRa] = useState(false);
  const daNoi = useRef(false);

  // Mở trang giữa lúc một việc đang chạy (bấm ở tab khác, hay vừa tải lại) → theo dõi tiếp.
  useEffect(() => {
    if (daNoi.current || !tacTu) return;
    daNoi.current = true;
    const dangDo = tacTu.viec.find((v) => v.loai === VIEC_CUA[loai] && (v.trangThai === 'CHO' || v.trangThai === 'DANG_CHAY'));
    if (dangDo) datViec(dangDo);
  }, [tacTu, loai]);

  const dangDo = viec !== null && (viec.trangThai === 'CHO' || viec.trangThai === 'DANG_CHAY');

  useEffect(() => {
    if (!viec || !dangDo) return;
    const t = setInterval(() => {
      layJson<ViecTay>(`/van-hanh/viec/${viec.id}`)
        .then((v) => {
          datViec(v);
          if (v.trangThai === 'THANH_CONG' || v.trangThai === 'LOI') xong();
        })
        // KHÔNG báo lỗi (`0089`): một lượt hỏi trạng thái hỏng thì nhịp sau (3 giây) hỏi lại;
        // hộp lỗi bật lên mỗi 3 giây khi mạng chập chờn là phiền hơn là có ích.
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [viec, dangDo, xong]);

  const bam = async () => {
    try {
      datViec(await dang<ViecTay>('/van-hanh/sao-luu/chay-ngay', { loai }));
    } catch (e) {
      bao(e);
    }
  };

  const offline = tacTu !== null && !tacTu.online;
  return (
    <div className="nut-sao-luu-ngay">
      <button type="button" className="nut nut-chinh" disabled={offline || dangDo || tacTu === null} onClick={() => void bam()}>
        {dangDo ? 'Đang sao lưu…' : nhan}
      </button>
      {offline && <p className="ghi-chu">Máy chủ chưa sẵn sàng nhận lệnh — sao lưu theo lịch vẫn chạy bình thường.</p>}
      {viec && (
        <p className="ghi-chu" role="status">
          {viec.trangThai === 'CHO' && 'Đã gửi lệnh, máy chủ sắp bắt đầu…'}
          {viec.trangThai === 'DANG_CHAY' && 'Đang sao lưu, có thể mất vài phút…'}
          {viec.trangThai === 'THANH_CONG' && `Sao lưu xong lúc ${ngayGio(viec.ketThuc)}.`}
          {viec.trangThai === 'LOI' && (
            <>
              <span className="nhan nhan-loi">Sao lưu không thành công</span>{' '}
              <button type="button" className="nut nut-nhe" onClick={() => datXemDauRa(true)}>
                Xem chi tiết
              </button>
            </>
          )}
        </p>
      )}
      {xemDauRa && viec && <HopDauRa tieuDe="Chi tiết lượt sao lưu" noiDung={viec.chiTiet} dong={() => datXemDauRa(false)} />}
    </div>
  );
}

type HoiXoa = { loai: Loai; ten: string; nhan: string; coBanSaoNgoai: boolean; co: string };

export function TheSaoLuu() {
  const { bao } = useBaoLoi();
  const ds = useTaiVH<DsSaoLuu>('/van-hanh/sao-luu');
  const lich = useTaiVH<DongLich[]>('/van-hanh/lich');
  const tt = useTaiVH<TacTu>('/van-hanh/tac-tu', 15_000);
  const [hoi, datHoi] = useState<HoiXoa | null>(null);
  const [caNgoai, datCaNgoai] = useState(false);
  const [dangXoa, datDangXoa] = useState(false);
  const [lichMoi, datLichMoi] = useState<Record<string, DongLich>>({});

  const { taiLai: taiDs } = ds;
  const { taiLai: taiLich } = lich;
  const xong = useCallback(() => {
    taiDs();
    taiLich();
  }, [taiDs, taiLich]);

  if (ds.loi !== null && ds.du === null) return <BaoLoi loi={ds.loi} thuLai={ds.taiLai} />;
  if (!ds.du || !lich.du) return lich.loi !== null ? <BaoLoi loi={lich.loi} thuLai={lich.taiLai} /> : <DangTai />;

  const dongLich = (v: string) => lichMoi[v] ?? lich.du!.find((l) => l.viec === v);
  const xacNhanXoa = async () => {
    if (!hoi) return;
    datDangXoa(true);
    try {
      const q = caNgoai ? '?caBanSaoNgoai=1' : '';
      await xoa(hoi.loai === 'CSDL' ? `/van-hanh/sao-luu/csdl/${hoi.ten}${q}` : `/van-hanh/sao-luu/kho-tep/${hoi.ten}${q}`);
      datHoi(null);
      ds.taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangXoa(false);
    }
  };
  const moHoi = (h: HoiXoa) => {
    datCaNgoai(false);
    datHoi(h);
  };

  const khoi = (loai: Loai, tieuDe: string, nhanNut: string, bang: ReactNode) => {
    const d = dongLich(VIEC_CUA[loai]);
    return (
      <section className="khoi">
        <div className="dau-khoi-vh">
          <div>
            <h2>{tieuDe}</h2>
            {d && (
              <p className="ghi-chu">
                Lần gần nhất {d.lanGanNhat ? ngayGio(d.lanGanNhat.batDau) : '—'} <NhanKetQua kq={d.lanGanNhat?.ketQua} />
              </p>
            )}
          </div>
          <NutSaoLuuNgay loai={loai} nhan={nhanNut} tacTu={tt.du} xong={xong} />
        </div>
        {d && <KhoiLich key={d.viec} dong={d} daLuu={(m) => datLichMoi((x) => ({ ...x, [m.viec]: m }))} />}
        {bang}
      </section>
    );
  };

  return (
    <>
      {khoi(
        'CSDL',
        'Cơ sở dữ liệu',
        'Sao lưu ngay',
        ds.du.csdl.length === 0 ? (
          <Trong tieuDe="Chưa có bản sao lưu nào" moTa="Bấm Sao lưu ngay, hoặc đợi lượt theo lịch." />
        ) : (
          <div className="khung-cuon" role="region" aria-label="Bản sao lưu cơ sở dữ liệu" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Bản sao lưu lúc</th>
                  <th className="so">Cỡ</th>
                  <th>Bản sao ngoài</th>
                  <th>
                    <span className="chi-doc-man-hinh">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ds.du.csdl.map((b) => (
                  <tr key={b.ten}>
                    <td>{ngayGio(b.luc)}</td>
                    <td className="so">{coTep(b.co)}</td>
                    <td>{b.coBanSaoNgoai ? <span className="nhan nhan-tot">có</span> : <span className="nhan nhan-thuong">không</span>}</td>
                    <td>
                      <div className="nhom-nut nhom-nut-hang">
                        <button
                          type="button"
                          className="nut nut-nhe"
                          onClick={() => void taiVe(`/van-hanh/sao-luu/csdl/${b.ten}/tai`, `csbh-sao-luu.backup`).catch(bao)}
                        >
                          Tải
                        </button>
                        {b.moiNhat ? (
                          <span className="ghi-chu">mới nhất</span>
                        ) : (
                          <button
                            type="button"
                            className="nut nut-nhe"
                            onClick={() =>
                              moHoi({ loai: 'CSDL', ten: b.ten, nhan: ngayGio(b.luc), coBanSaoNgoai: b.coBanSaoNgoai, co: coTep(b.co) })
                            }
                          >
                            Xoá
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}

      {khoi(
        'KHO_TEP',
        'Kho tệp',
        'Sao lưu kho tệp ngay',
        ds.du.khoTep.length === 0 ? (
          <Trong tieuDe="Chưa có bản chụp kho tệp nào" moTa="Bấm Sao lưu kho tệp ngay, hoặc đợi lượt theo lịch." />
        ) : (
          <div className="khung-cuon" role="region" aria-label="Bản chụp kho tệp" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Bản chụp lúc</th>
                  <th className="so">Số tệp</th>
                  <th className="so">Chiếm thêm</th>
                  <th>Bản sao ngoài</th>
                  <th>
                    <span className="chi-doc-man-hinh">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ds.du.khoTep.map((b) => (
                  <tr key={b.moc}>
                    <td>{ngayGio(b.luc)}</td>
                    <td className="so">{b.soTep.toLocaleString('vi-VN')}</td>
                    <td className="so">{coTep(b.chiemThem)}</td>
                    <td>{b.coBanSaoNgoai ? <span className="nhan nhan-tot">có</span> : <span className="nhan nhan-thuong">không</span>}</td>
                    <td>
                      {b.moiNhat ? (
                        <span className="ghi-chu">mới nhất</span>
                      ) : (
                        <button
                          type="button"
                          className="nut nut-nhe"
                          onClick={() =>
                            moHoi({ loai: 'KHO_TEP', ten: b.moc, nhan: ngayGio(b.luc), coBanSaoNgoai: b.coBanSaoNgoai, co: coTep(b.chiemThem) })
                          }
                        >
                          Xoá
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}

      {hoi && (
        <HopThoaiXacNhan
          tieuDe={hoi.loai === 'CSDL' ? `Xoá bản sao lưu ${hoi.nhan}?` : `Xoá bản chụp kho tệp ${hoi.nhan}?`}
          hauQua={
            <>
              <p>
                {hoi.loai === 'CSDL'
                  ? `Cỡ ${hoi.co}. Sau khi xoá không còn phục hồi được về đúng thời điểm này.`
                  : 'Tệp chỉ còn trong bản chụp này (đã bị xoá khỏi phần mềm trước đó) sẽ mất hẳn khỏi bản sao lưu. Các bản chụp khác không bị ảnh hưởng.'}
              </p>
              {hoi.coBanSaoNgoai && (
                <label className="o-danh-dau">
                  <input type="checkbox" checked={caNgoai} onChange={(e) => datCaNgoai(e.target.checked)} />
                  Xoá cả bản ở bản sao ngoài
                </label>
              )}
            </>
          }
          nhanNut="Xoá"
          dangChay={dangXoa}
          dong={() => datHoi(null)}
          xacNhan={() => void xacNhanXoa()}
        />
      )}
    </>
  );
}
