/** Danh mục sản phẩm — chỉ đọc ở đây; nhập liệu thuộc Quản trị hệ thống. */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { BaoLoi, DangTai, Trong } from '../components/Chung.js';

type SanPham = { id: string; code: string; name: string; groupCode: string; status: string };

export function DanhMuc() {
  const [ds, datDs] = useState<SanPham[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  useEffect(() => {
    const huy = new AbortController();
    layJson<{ items: SanPham[] }>('/catalog/products?limit=200', huy.signal)
      .then((r) => datDs(r.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  if (loi !== null) return <BaoLoi loi={loi} />;
  if (!ds) return <DangTai />;
  if (ds.length === 0) return <Trong tieuDe="Danh mục chưa có sản phẩm nào" />;

  return (
    <section className="trang">
      <h1>Danh mục sản phẩm</h1>
      <div className="khung-cuon" role="region" aria-label="Danh mục sản phẩm" tabIndex={0}>
        <table className="bang">
          <thead>
            <tr>
              <th>Mã vật tư</th>
              <th>Tên sản phẩm</th>
              <th>Nhóm</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((s) => (
              <tr key={s.id}>
                <td className="ma-phu">{s.code}</td>
                <td>{s.name}</td>
                <td>{s.groupCode}</td>
                <td>{s.status === 'DANG_AP_DUNG' ? 'Đang áp dụng' : 'Đã vô hiệu hoá'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
