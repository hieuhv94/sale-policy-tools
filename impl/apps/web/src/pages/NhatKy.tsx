/** Nhật ký — chỉ Ban lãnh đạo và Quản trị đọc được (muc 10). */
import { ngayGio } from '../lib/format.js';
import { BaoLoi, DangTai, Trong } from '../components/Chung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { useTrangMay } from '../lib/phan-trang.js';

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
  // Nhật ký chỉ ghi thêm và không bao giờ xoá, nên nó là danh sách lớn nhanh
  // nhất trong cả hệ thống — chỗ cần máy chủ cắt trang rõ ràng nhất.
  const { muc: ds, tong, loi, trang, soTrang, doiTrang } = useTrangMay<Dong>('/audit/entries');

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
      <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="dòng" />
    </section>
  );
}
