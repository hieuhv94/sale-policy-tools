/**
 * Danh mục — mọi vai trò ĐỌC, chỉ Quản trị hệ thống GHI.
 *
 * Toàn bộ phần ghi nằm sau `can(vaiTro,'quanTriDanhMuc')`.
 *
 * Năm vai trò kia thấy ĐÚNG hai thẻ có nghĩa với họ: Sản phẩm và Quy định chiết
 * khấu — hai thứ cần tra khi lập và khi duyệt hồ sơ. Quản trị thấy thêm thẻ thứ
 * ba là Giấy tờ mẫu.
 *
 * Nhóm sản phẩm và Danh mục tra cứu KHÔNG còn là thẻ riêng; chúng thành khối
 * bên trong hai thẻ đầu — xem lý do ở `lib/danh-muc.ts`.
 */
import { useCallback, useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { can } from '../lib/can.js';
import {
  MUC_DANH_MUC,
  NHAN_TRANG_THAI_SAN_PHAM,
  THE_CHUNG,
  locSanPham,
  type MucDanhMuc,
  type NhomSanPham,
  type SanPham,
} from '../lib/danh-muc.js';
import { BaoLoi, DaiThe, DangTai, OTimKiem, Trong } from '../components/Chung.js';
import { TheSanPham } from '../components/danh-muc/SanPham.js';
import { TheNhom } from '../components/danh-muc/Nhom.js';
import { TheChietKhau } from '../components/danh-muc/ChietKhau.js';
import { TheTraCuu } from '../components/danh-muc/TraCuu.js';
import { TheGiayToMau } from '../components/danh-muc/GiayToMau.js';

export function DanhMuc() {
  const { nguoiDung } = usePhien();
  const quanTri = can(nguoiDung?.role, 'quanTriDanhMuc');

  const [the, datThe] = useState<MucDanhMuc>('san-pham');
  const [nhom, datNhom] = useState<NhomSanPham[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  const taiLaiNhom = useCallback(() => datLan((x) => x + 1), []);

  // Nhóm sản phẩm tải ở CẤP TRANG chứ không trong từng thẻ: ba thẻ cùng cần nó
  // (sản phẩm để chọn nhóm, thẻ Nhóm để hiện bảng, chiết khấu để chọn phạm vi),
  // và tải ba lần thì ba nơi lệch nhau ngay sau khi thêm một nhóm mới.
  useEffect(() => {
    if (!quanTri) return;
    const huy = new AbortController();
    datLoi(null);
    layJson<NhomSanPham[]>('/catalog/product-groups', huy.signal)
      .then(datNhom)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan, quanTri]);

  const muc = quanTri ? MUC_DANH_MUC : MUC_DANH_MUC.filter((m) => THE_CHUNG.includes(m.khoa));

  if (loi !== null && nhom === null && quanTri) return <BaoLoi loi={loi} thuLai={taiLaiNhom} />;
  if (quanTri && !nhom) return <DangTai />;

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Danh mục</h1>
          <p className="mo-ta-trang">
            {quanTri
              ? 'Sản phẩm, giá, ngưỡng chiết khấu và các danh mục dùng chung.'
              : 'Chỉ xem. Việc thêm và sửa thuộc Quản trị hệ thống.'}
          </p>
        </div>
      </div>

      <DaiThe nhanVung="Nhóm danh mục" dangChon={the} chon={datThe} muc={muc} />

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLaiNhom} />}

      {the === 'san-pham' && (
        <>
          {quanTri && nhom ? <TheSanPham nhom={nhom} /> : <BangSanPhamChiXem />}
          {/* Nhóm sản phẩm nằm DƯỚI bảng sản phẩm chứ không trên: việc thường
              ngày là tra sản phẩm, còn thêm nhóm là việc hiếm. */}
          {quanTri && nhom && <TheNhom nhom={nhom} taiLai={taiLaiNhom} />}
        </>
      )}
      {the === 'chiet-khau' && (
        <>
          <TheChietKhau nhom={nhom ?? []} chiXem={!quanTri} />
          {quanTri && <TheTraCuu />}
        </>
      )}
      {quanTri && the === 'giay-to-mau' && <TheGiayToMau />}
    </section>
  );
}

/**
 * Bảng sản phẩm chỉ đọc — giữ NGUYÊN bốn cột của bản trước P11b.
 *
 * Đây là màn hình mà năm vai trò còn lại nhìn thấy, và họ đã quen nó từ bản
 * demo. Đổi hình dáng ở đây là đổi thứ không ai yêu cầu đổi.
 */
function BangSanPhamChiXem() {
  const [ds, datDs] = useState<SanPham[] | null>(null);
  const [tim, datTim] = useState('');
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

  const loc = locSanPham(ds, tim);

  return (
    <>
      <div className="hang-tim">
        <OTimKiem
          id="tim-san-pham"
          nhan="Tìm theo tên hoặc mã sản phẩm"
          giaTri={tim}
          doi={datTim}
        />
        {tim.trim() !== '' && (
          <span className="ghi-chu" role="status">
            {loc.length} sản phẩm khớp
          </span>
        )}
    </div>

      {loc.length === 0 ? (
        <Trong
          tieuDe="Không có sản phẩm nào khớp"
          moTa="Thử bỏ bớt chữ, hoặc gõ mã vật tư thay vì tên."
        />
      ) : (
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
              {loc.map((s) => (
                <tr key={s.id}>
                  <td className="ma-phu">{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.groupCode}</td>
                  <td>{NHAN_TRANG_THAI_SAN_PHAM[s.status] ?? s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
