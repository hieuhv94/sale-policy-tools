/**
 * Tra cứu khách hàng. Ban lãnh đạo tìm và xem CSBH đang áp dụng trong không quá
 * ba lần chạm (`FE-12`): gõ tìm → chạm khách hàng → thấy ngay CSBH hiện hành.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngay, tien } from '../lib/format.js';
import { Lien } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan, OTimKiem, Trong } from '../components/Chung.js';

type KhachHangDto = {
  id: string;
  code: string;
  name: string;
  registeredAddress: string;
  idNumber: string | null;
  ownerName: string;
  debt: string;
};

export function DanhSachKhachHang() {
  const [tim, datTim] = useState('');
  const [ds, datDs] = useState<KhachHangDto[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    const q = tim ? `?q=${encodeURIComponent(tim)}&limit=50` : '?limit=50';
    layJson<{ items: KhachHangDto[] }>(`/customers${q}`, huy.signal)
      .then((r) => datDs(r.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [tim]);

  return (
    <section className="trang">
      <h1>Khách hàng</h1>
      <OTimKiem
        id="tim-khach-hang"
        nhan="Tìm theo tên, địa chỉ hoặc mã số thuế"
        giaTri={tim}
        doi={datTim}
      />

      {loi !== null && <BaoLoi loi={loi} />}
      {ds === null && loi === null && <DangTai />}
      {ds?.length === 0 && (
        <Trong tieuDe="Không tìm thấy khách hàng nào" moTa="Thử bớt từ khoá hoặc gõ mã số thuế." />
      )}

      {ds && ds.length > 0 && (
        <ul className="danh-sach-the">
          {ds.map((k) => (
            <li key={k.id}>
              <Lien den={`/khach-hang/${k.id}`} className="the-lien">
                <span className="ma-phu">{k.code}</span>
                <strong>{k.name}</strong>
                <span className="phu">{k.registeredAddress}</span>
              </Lien>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type HoSoHienHanh = {
  id: string;
  code: string;
  status: string;
  appliedDate: string | null;
  lines: { id: string; productName: string; netPrice: string; discountRate: string }[];
};

export function ChiTietKhachHang({ id }: { id: string }) {
  const [kh, datKh] = useState<KhachHangDto | null>(null);
  const [hoSo, datHoSo] = useState<HoSoHienHanh | null | 'khong-co'>(null);
  const [loi, datLoi] = useState<unknown>(null);

  useEffect(() => {
    const huy = new AbortController();
    layJson<KhachHangDto>(`/customers/${id}`, huy.signal)
      .then(datKh)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    layJson<HoSoHienHanh>(`/policies/current?customerId=${encodeURIComponent(id)}`, huy.signal)
      .then(datHoSo)
      // 404 nghĩa là khách chưa có CSBH nào — trạng thái bình thường, không phải lỗi.
      .catch(() => datHoSo('khong-co'));
    return () => huy.abort();
  }, [id]);

  if (loi !== null) return <BaoLoi loi={loi} />;
  if (!kh) return <DangTai />;

  return (
    <section className="trang">
      <h1>{kh.name}</h1>
      <p className="mo-ta-trang">Mã khách hàng {kh.code}</p>

      <dl className="the-so">
        <div>
          <dt>Địa chỉ đăng ký</dt>
          <dd>{kh.registeredAddress}</dd>
        </div>
        <div>
          <dt>Mã số thuế / CCCD</dt>
          <dd>{kh.idNumber ?? '—'}</dd>
        </div>
        <div>
          <dt>Người đại diện</dt>
          <dd>{kh.ownerName}</dd>
        </div>
        <div>
          <dt>Công nợ</dt>
          <dd className="so">{tien(kh.debt)}</dd>
        </div>
      </dl>

      <h2>CSBH đang áp dụng</h2>
      {hoSo === null && <DangTai />}
      {hoSo === 'khong-co' && (
        <Trong
          tieuDe="Khách hàng chưa có CSBH nào đang hiệu lực"
          moTa="Trình dược viên phụ trách lập hồ sơ mới từ mục Hồ sơ CSBH."
        />
      )}
      {hoSo !== null && hoSo !== 'khong-co' && (
        <div className="the">
          <div className="dau-trang">
            <Lien den={`/ho-so/${hoSo.id}`}>
              <strong>{hoSo.code}</strong>
            </Lien>
            <Nhan trangThai={hoSo.status} />
          </div>
          <p className="phu">Ngày áp dụng {ngay(hoSo.appliedDate)}</p>
          <p className="phu">{hoSo.lines.length} dòng sản phẩm</p>
        </div>
      )}
    </section>
  );
}
