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

  return (
    <section className="trang">
      <h1>Báo cáo</h1>

      <h2>Tiến độ hồ sơ</h2>
      <p className="mo-ta-trang">{tienDo.total} hồ sơ trong phạm vi của bạn</p>
      <ul className="danh-sach-so">
        {Object.entries(tienDo.byStatus).map(([k, v]) => (
          <li key={k}>
            <span>{nhanTrangThai(k)}</span>
            <strong className="so">{v}</strong>
          </li>
        ))}
      </ul>

      <h2>Tỷ lệ hồ sơ bị trả lại</h2>
      <ul className="danh-sach-so">
        <li><span>Đã gửi duyệt</span><strong className="so">{traLai.submitted}</strong></li>
        <li><span>Bị trả lại</span><strong className="so">{traLai.returned}</strong></li>
        <li><span>Bị từ chối</span><strong className="so">{traLai.rejected}</strong></li>
        <li><span>Tỷ lệ</span><strong className="so">{String(traLai.rate).replace('.', ',')}%</strong></li>
      </ul>

      <h2>Hạn xử lý (SLA)</h2>
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

      <h2>Xuất Excel</h2>
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
    </section>
  );
}
