/** Nhật ký — chỉ Ban lãnh đạo và Quản trị đọc được (muc 10). */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { BaoLoi, DangTai, Trong } from '../components/Chung.js';

type Dong = {
  id: string;
  occurredAt: string;
  actorRole: string | null;
  actorIp: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  traceId: string | null;
};

export function NhatKy() {
  const [ds, datDs] = useState<Dong[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  useEffect(() => {
    const huy = new AbortController();
    layJson<{ items: Dong[] }>('/audit/entries?limit=100', huy.signal)
      .then((r) => datDs(r.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  if (loi !== null) return <BaoLoi loi={loi} />;
  if (!ds) return <DangTai />;
  if (ds.length === 0) return <Trong tieuDe="Nhật ký chưa có dòng nào" />;

  return (
    <section className="trang">
      <h1>Nhật ký</h1>
      <div className="khung-cuon" role="region" aria-label="Nhật ký" tabIndex={0}>
        <table className="bang">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Vai trò</th>
              <th>Địa chỉ IP</th>
              <th>Mã tra cứu</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((d) => (
              <tr key={d.id}>
                <td>{ngayGio(d.occurredAt)}</td>
                <td>{d.action}</td>
                <td>{d.entity}</td>
                <td>{d.actorRole ?? '—'}</td>
                <td>{d.actorIp ?? '—'}</td>
                <td className="ma-phu">{d.traceId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
