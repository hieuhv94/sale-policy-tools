/**
 * Danh mục — mọi vai trò ĐỌC, chỉ Quản trị hệ thống GHI.
 *
 * Trước P11b trang này là một bảng bốn cột chỉ đọc, và chú thích cũ ghi "nhập
 * liệu thuộc Quản trị hệ thống" — nhưng Quản trị cũng không có màn hình nào để
 * nhập. Toàn bộ phần ghi nằm sau `can(vaiTro,'quanTriDanhMuc')`.
 *
 * Vai trò không quản trị thấy ĐÚNG hai thẻ có nghĩa với họ: sản phẩm và ngưỡng
 * chiết khấu — hai thứ cần tra khi lập và khi duyệt hồ sơ. Bày cả năm thẻ rồi ẩn
 * hết nút bên trong là bắt họ bấm qua ba màn hình trống mới hiểu ra là không có
 * gì cho mình.
 */
import { useCallback, useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { can } from '../lib/can.js';
import {
  MUC_DANH_MUC,
  NHAN_TRANG_THAI_SAN_PHAM,
  type MucDanhMuc,
  type NhomSanPham,
  type SanPham,
} from '../lib/danh-muc.js';
import { BaoLoi, DaiThe, DangTai, Trong } from '../components/Chung.js';
import { TheSanPham } from '../components/danh-muc/SanPham.js';
import { TheNhom } from '../components/danh-muc/Nhom.js';
import { TheChietKhau } from '../components/danh-muc/ChietKhau.js';
import { TheNguoiKy, TheTraCuu } from '../components/danh-muc/TraCuu.js';

const THE_CHI_XEM: MucDanhMuc[] = ['san-pham', 'chiet-khau'];

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

  const muc = quanTri ? MUC_DANH_MUC : MUC_DANH_MUC.filter((m) => THE_CHI_XEM.includes(m.khoa));

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

      {the === 'san-pham' && (quanTri && nhom ? <TheSanPham nhom={nhom} /> : <BangSanPhamChiXem />)}
      {the === 'chiet-khau' && <TheChietKhau nhom={nhom ?? []} chiXem={!quanTri} />}
      {quanTri && the === 'nhom' && nhom && <TheNhom nhom={nhom} taiLai={taiLaiNhom} />}
      {quanTri && the === 'tra-cuu' && <TheTraCuu />}
      {quanTri && the === 'nguoi-ky' && <TheNguoiKy />}
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
              <td>{NHAN_TRANG_THAI_SAN_PHAM[s.status] ?? s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
