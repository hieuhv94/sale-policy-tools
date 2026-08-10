/**
 * Ba báo cáo và việc xuất Excel chạy nền.
 *
 * Xuất file KHÔNG chặn màn hình: bấm xong nhận mã việc, rồi hỏi lại trạng thái
 * cho tới khi có liên kết tải (`RPT-08`).
 */
import { useEffect, useState } from 'react';
import { dang, layJson, GOC_API } from '../lib/api.js';
import { nhanTrangThai } from '../lib/format.js';
import { BaoLoi, DangTai } from '../components/Chung.js';

type TienDo = {
  total: number;
  byStatus: Record<string, number>;
  byPendingStep: Record<string, number>;
  byHandler: { userId: string; name: string | null; count: number }[];
};
type TyLeTraLai = { submitted: number; returned: number; rejected: number; rate: number };
type Sla = { waiting: number; overdue: number; dueToday: number; excludedLegacy: number };
type ViecXuat = { jobId: string; status: string; rowCount: number | null; downloadUrl: string | null };

export function BaoCao() {
  const [tienDo, datTienDo] = useState<TienDo | null>(null);
  const [traLai, datTraLai] = useState<TyLeTraLai | null>(null);
  const [sla, datSla] = useState<Sla | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [viec, datViec] = useState<ViecXuat | null>(null);

  useEffect(() => {
    const huy = new AbortController();
    Promise.all([
      layJson<TienDo>('/reports/progress', huy.signal),
      layJson<TyLeTraLai>('/reports/return-rate', huy.signal),
      layJson<Sla>('/reports/sla', huy.signal),
    ])
      .then(([a, b, c]) => {
        datTienDo(a);
        datTraLai(b);
        datSla(c);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  // Hỏi lại trạng thái việc xuất cho tới khi xong.
  useEffect(() => {
    if (!viec || viec.status === 'XONG' || viec.status === 'LOI') return;
    const h = setTimeout(() => {
      void layJson<ViecXuat>(`/reports/exports/${viec.jobId}`)
        .then(datViec)
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(h);
  }, [viec]);

  const xuat = async () => {
    datLoi(null);
    try {
      datViec(await dang<ViecXuat>('/reports/exports', {}));
    } catch (e) {
      datLoi(e);
    }
  };

  if (loi !== null && tienDo === null) return <BaoLoi loi={loi} />;
  if (!tienDo || !traLai || !sla) return <DangTai />;

  // Sắp giảm dần: trạng thái đông hồ sơ nhất là thứ người đọc muốn thấy trước,
  // và thứ tự cố định theo tên trạng thái thì cột nào cũng phải dò bằng mắt.
  const theoTrangThai = Object.entries(tienDo.byStatus).sort((a, b) => b[1] - a[1]);
  const donhat = Math.max(1, ...theoTrangThai.map(([, v]) => v));

  return (
    <section className="trang">
      <h1>Báo cáo</h1>
      <p className="mo-ta-trang">
        {tienDo.total} hồ sơ trong phạm vi dữ liệu của bạn, tính tại thời điểm mở màn hình.
      </p>

      {/*
        Bốn con số đặt lên đầu là bốn câu hỏi người quản lý mở màn hình này để
        hỏi. Chúng nằm trên MỘT hàng, không phải rải trong ba danh sách phía
        dưới — muốn biết "có gì đang cháy không" mà phải cuộn ba lần thì lần sau
        họ thôi không mở nữa.
      */}
      <div className="luoi-chi-so">
        <ChiSo nhan="Tổng hồ sơ" giaTri={tienDo.total} phu="trong phạm vi của bạn" />
        <ChiSo nhan="Đang chờ xử lý" giaTri={sla.waiting} phu="ở mọi bước duyệt" kieu="cho" />
        <ChiSo
          nhan="Quá hạn"
          giaTri={sla.overdue}
          phu="quá 14 ngày ở một bước"
          kieu={sla.overdue > 0 ? 'loi' : 'tot'}
        />
        <ChiSo
          nhan="Tỷ lệ trả lại"
          giaTri={`${String(traLai.rate).replace('.', ',')}%`}
          phu={`${traLai.returned} trên ${traLai.submitted} hồ sơ đã gửi duyệt`}
          kieu={traLai.rate > 0 ? 'canh-bao' : 'tot'}
        />
      </div>

      <h2>Tiến độ theo trạng thái</h2>
      <div className="the">
        {theoTrangThai.length === 0 ? (
          <p className="trong-mo-ta">Chưa có hồ sơ nào.</p>
        ) : (
          <ul className="danh-sach-thanh">
            {theoTrangThai.map(([k, v]) => (
              <li key={k}>
                <span className="thanh-nhan">{nhanTrangThai(k)}</span>
                {/*
                  Thanh dài ngắn là thứ TRANG TRÍ cho con số bên cạnh, nên nó
                  `aria-hidden`. Trình đọc màn hình nghe "Nháp, 12" là đủ; đọc
                  thêm "thanh tiến trình 40%" chỉ làm dài ra mà không thêm nghĩa.
                */}
                <span className="thanh" aria-hidden="true">
                  <span className="thanh-day" style={{ width: `${(v / donhat) * 100}%` }} />
                </span>
                <strong className="so">{v}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2>Hạn xử lý (SLA)</h2>
      <div className="the">
        <ul className="danh-sach-so">
          <li><span>Đang chờ</span><strong className="so">{sla.waiting}</strong></li>
          <li><span>Quá hạn</span><strong className="so">{sla.overdue}</strong></li>
          <li><span>Đến hạn hôm nay</span><strong className="so">{sla.dueToday}</strong></li>
        </ul>
        {sla.excludedLegacy > 0 && (
          <p className="ghi-chu">
            Đã loại {sla.excludedLegacy} hồ sơ nhập từ dữ liệu cũ khỏi thống kê SLA — chúng không đi
            qua luồng duyệt nên không có mốc bắt đầu chờ.
          </p>
        )}
      </div>

      <h2>Xuất Excel</h2>
      <div className="the">
        <p className="trong-mo-ta">
          File dựng ở máy chủ và tải về khi xong, nên đóng màn hình này giữa chừng cũng không hỏng.
        </p>
        {loi !== null && <BaoLoi loi={loi} />}
        {!viec && (
          <button type="button" className="nut nut-chinh" onClick={xuat}>
            Xuất danh sách hồ sơ
          </button>
        )}
        {viec && viec.status !== 'XONG' && viec.status !== 'LOI' && (
          <p role="status" aria-live="polite">Đang dựng file…</p>
        )}
        {viec?.status === 'LOI' && <p className="bao-loi" role="alert">Xuất file hỏng. Thử lại.</p>}
        {viec?.status === 'XONG' && viec.downloadUrl && (
          <p>
            <a className="nut nut-chinh" href={`${GOC_API}${viec.downloadUrl}`}>
              Tải file ({viec.rowCount} dòng)
            </a>
          </p>
        )}
      </div>
    </section>
  );
}

/** Một ô số liệu ở hàng đầu. `kieu` chỉ đổi màu vạch bên trái và màu con số. */
function ChiSo({
  nhan,
  giaTri,
  phu,
  kieu = 'thuong',
}: {
  nhan: string;
  giaTri: number | string;
  phu: string;
  kieu?: 'thuong' | 'tot' | 'cho' | 'canh-bao' | 'loi';
}) {
  return (
    <article className={`chi-so chi-so-${kieu}`}>
      <span className="chi-so-nhan">{nhan}</span>
      <strong className="chi-so-gia-tri so">{giaTri}</strong>
      <span className="chi-so-phu">{phu}</span>
    </article>
  );
}
