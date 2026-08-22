/**
 * Thẻ "Hệ thống" của màn hình Quản trị: hạn xử lý và thư hỏng.
 *
 * Hai việc không liên quan gì nhau về nghiệp vụ, nhưng cùng một tính chất: chỉ
 * Quản trị hệ thống làm được, không thuộc luồng duyệt, và trước P11b **không có
 * màn hình nào**. Trang tổng quan đã hiện con số thư hỏng từ P10 mà bấm vào
 * không đi đâu — đây là chỗ nó dẫn tới.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, dat, layJson } from '../../lib/api.js';
import { ngayGio } from '../../lib/format.js';
import { BaoLoi, DangTai, HopThoaiXacNhan, Trong, Truong } from '../Chung.js';
import { PhanTrang } from '../PhanTrang.js';
import { useTrangMay } from '../../lib/phan-trang.js';
import { useBaoLoi } from '../../lib/bao-loi.js';

type CauHinhSla = {
  days: number;
  updatedAt: string | null;
  countsWeekends: boolean;
  remindDaysBefore: number;
};

type ThuHong = {
  id: string;
  eventId: string;
  routingKey: string;
  attempts: number;
  lastError: string | null;
  failedAt: string;
  resolvedAt: string | null;
};

export function TheHeThong() {
  return (
    <>
      <CauHinhHanXuLy />
      <ThuHongChuaXuLy />
    </>
  );
}

// --- Hạn xử lý ---------------------------------------------------------------

function CauHinhHanXuLy() {
  const { bao } = useBaoLoi();
  const [ch, datCh] = useState<CauHinhSla | null>(null);
  const [so, datSo] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const [daLuu, datDaLuu] = useState(false);
  const [hoi, datHoi] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<CauHinhSla>('/sla/config', huy.signal)
      .then((r) => {
        datCh(r);
        datSo(String(r.days));
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  const gui = async () => {
    datLoi(null);
    datDaLuu(false);
    datDangGui(true);
    try {
      const r = await dat<CauHinhSla>('/sla/config', { days: Number(so) });
      datCh(r);
      datDaLuu(true);
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  if (loi !== null && ch === null) return <BaoLoi loi={loi} />;
  if (!ch) return <DangTai />;

  const n = Number(so);
  const hopLe = Number.isInteger(n) && n >= 1 && n <= 365;

  return (
    <section className="khoi">
      <h2>Hạn xử lý (SLA)</h2>
      <p className="ghi-chu">
        Số ngày tối đa cho mỗi bước chờ. Tính <strong>cả thứ bảy và chủ nhật</strong>, không trừ ngày
        lễ. Trước hạn {ch.remindDaysBefore} ngày hệ thống gửi thư nhắc.
      </p>

      {/*
        Cảnh báo TRƯỚC khi bấm, không phải sau. Đổi số ngày TÍNH LẠI hạn cho mọi
        hồ sơ đang chờ — một hồ sơ đang đúng hạn có thể thành quá hạn ngay lập
        tức, và người quản trị cần biết điều đó trước khi bấm chứ không phải khi
        điện thoại reo.
      */}
      <p className="giai-thich">
        Đổi số này <strong>tính lại hạn cho mọi hồ sơ đang chờ</strong>, kể cả hồ sơ đã nộp từ
        trước. Rút ngắn hạn có thể làm một số hồ sơ chuyển sang <em>Quá hạn duyệt</em> ngay.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          datHoi(true);
        }}
        className="hang-nhap"
      >
        <Truong id="sla-ngay" nhan="Số ngày" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap o-nhap-hep"
              inputMode="numeric"
              value={so}
              onChange={(e) => {
                datSo(e.target.value);
                datDaLuu(false);
              }}
            />
          )}
        </Truong>
        <button type="submit" className="nut nut-chinh" disabled={dangGui || !hopLe}>
          {dangGui ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>

      {loi !== null && <BaoLoi loi={loi} />}
      {daLuu && (
        <p className="ghi-chu" role="status">
          Đã lưu. Hạn của các hồ sơ đang chờ đã được tính lại.
        </p>
      )}
      {ch.updatedAt && <p className="ghi-chu">Sửa lần cuối {ngayGio(ch.updatedAt)}.</p>}

      {hoi && (
        <HopThoaiXacNhan
          tieuDe="Đổi hạn xử lý"
          hauQua={
            <>
              <p>
                Từ <strong>{ch.days} ngày</strong> sang <strong>{n} ngày</strong>, áp cho{' '}
                <strong>mọi bước chờ của mọi hồ sơ</strong>, kể cả hồ sơ đã nộp từ trước.
              </p>
              {n < ch.days && (
                <p>
                  Rút ngắn hạn: một số hồ sơ đang đúng hạn có thể chuyển sang <em>Quá hạn duyệt</em>{' '}
                  ngay sau khi bấm.
                </p>
              )}
            </>
          }
          nhanNut="Đổi hạn"
          nguyHiem={n < ch.days}
          dangChay={dangGui}
          dong={() => datHoi(false)}
          xacNhan={() => void gui().then(() => datHoi(false))}
        />
      )}
    </section>
  );
}

// --- Thư hỏng ----------------------------------------------------------------

function ThuHongChuaXuLy() {
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [ketQua, datKetQua] = useState<string | null>(null);
  const [hienDaXong, datHienDaXong] = useState(false);
  // Lỗi của thao tác GỬI LẠI, tách khỏi lỗi của lượt tải danh sách: một lần gửi
  // lại hỏng không được xoá mất bảng đang hiện.
  const [loiGui, datLoiGui] = useState<unknown>(null);

  const {
    muc: ds,
    tong,
    loi,
    trang,
    soTrang,
    doiTrang,
    taiLai,
  } = useTrangMay<ThuHong>(hienDaXong ? '/notifications/dead-letters' : '/notifications/dead-letters?open=true');

  const [hoiGui, datHoiGui] = useState<ThuHong | null>(null);

  const guiLai = async (t: ThuHong) => {
    datLoiGui(null);
    datKetQua(null);
    datDangChay(t.id);
    try {
      const r = await dang<{ outcome: string }>(`/notifications/dead-letters/${t.id}/retry`);
      // `duplicate` KHÔNG phải lỗi: sự kiện đã gửi thành công ở một lượt khác.
      // Gộp nó vào "hỏng" là bắt người quản trị đi tìm một vấn đề không tồn tại.
      datKetQua(
        r.outcome === 'sent'
          ? 'Đã gửi lại thành công.'
          : r.outcome === 'duplicate'
            ? 'Thư này đã được gửi thành công trước đó — đánh dấu là đã xử lý.'
            : `Gửi lại chưa thành công (${r.outcome}). Thư vẫn nằm trong danh sách.`,
      );
      taiLai();
    } catch (e) {
      datLoiGui(e);
    } finally {
      datDangChay(null);
    }
  };

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <section className="khoi">
      <h2>Thư hỏng</h2>
      <p className="ghi-chu">
        Thư hệ thống không gửi được sau nhiều lần thử. Gửi lại chạy đúng đường xử lý cũ, kể cả bước
        chống trùng.
      </p>

      <label className="o-danh-dau">
        <input
          type="checkbox"
          checked={hienDaXong}
          onChange={(e) => datHienDaXong(e.target.checked)}
        />
        Hiện cả thư đã xử lý
      </label>

      {loiGui !== null && <BaoLoi loi={loiGui} />}
      {ketQua && (
        <p className="ghi-chu" role="status">
          {ketQua}
        </p>
      )}

      {ds.length === 0 ? (
        <Trong
          tieuDe={hienDaXong ? 'Chưa có thư hỏng nào' : 'Không có thư hỏng nào chưa xử lý'}
          moTa="Mọi thông báo đều đã gửi được."
        />
      ) : (
        <div className="khung-cuon" role="region" aria-label="Danh sách thư hỏng" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Loại sự kiện</th>
                <th>Số lần thử</th>
                <th>Hỏng lúc</th>
                <th>Lỗi gần nhất</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((t) => (
                <tr key={t.id}>
                  <td className="ma-phu">{t.routingKey}</td>
                  <td className="so">{t.attempts}</td>
                  <td>{ngayGio(t.failedAt)}</td>
                  {/* Lỗi gốc hiện NGUYÊN VĂN: người đọc bảng này là người sẽ
                      phải sửa nguyên nhân, và một câu tóm tắt thân thiện thì
                      không giúp được gì cho việc đó. */}
                  <td className="loi-goc">{t.lastError ?? '—'}</td>
                  <td>{t.resolvedAt ? `Đã xử lý ${ngayGio(t.resolvedAt)}` : 'Chưa xử lý'}</td>
                  <td>
                    {t.resolvedAt === null && (
                      <button
                        type="button"
                        className="nut nut-nhe"
                        disabled={dangChay === t.id}
                        onClick={() => datHoiGui(t)}
                      >
                        {dangChay === t.id ? 'Đang gửi…' : 'Gửi lại'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="thư" />

      {hoiGui && (
        <HopThoaiXacNhan
          tieuDe="Gửi lại thư hỏng"
          hauQua={
            <p>
              Thư đi ra <strong>hộp thư thật của người nhận</strong>. Nếu lượt hỏng trước thực ra đã
              gửi được rồi thì họ nhận thư thứ hai giống hệt — hệ thống nhận ra trường hợp đó và báo
              <em> đã gửi trước đó</em>, nhưng chỉ sau khi đã thử.
            </p>
          }
          nhanNut="Gửi lại"
          nguyHiem={false}
          dangChay={dangChay === hoiGui.id}
          dong={() => datHoiGui(null)}
          xacNhan={() => void guiLai(hoiGui).then(() => datHoiGui(null))}
        />
      )}
    </section>
  );
}
