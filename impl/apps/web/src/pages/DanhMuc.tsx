/**
 * Ba màn hình tách ra từ "Danh mục" cũ: Sản phẩm · Chiết khấu · Giấy tờ mẫu.
 *
 * Trước P22 đây là MỘT mục menu với một dải thẻ bên trong. Dải thẻ ấy là một
 * tầng điều hướng thứ hai nằm bên trong tầng thứ nhất: người dùng bấm "Danh
 * mục" rồi vẫn phải bấm tiếp mới tới thứ mình cần, và thanh bên không cho biết
 * mình đang đứng ở đâu. Ba mục menu ngang hàng thì bấm một lần là tới, và mục
 * đang mở tự sáng lên.
 *
 * Cả ba dùng chung một danh sách nhóm sản phẩm tải ở `useNhom` — sản phẩm cần
 * nó để chọn nhóm, chiết khấu cần nó để chọn phạm vi.
 *
 * Phần GHI nằm sau `can(vaiTro,'quanTriDanhMuc')`; năm vai trò còn lại đọc.
 */
import { useCallback, useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { can } from '../lib/can.js';
import {
  NHAN_TRANG_THAI_SAN_PHAM,
  THE_SAN_PHAM,
  locSanPham,
  type NhomSanPham,
  type SanPham,
  type TheSanPhamKhoa,
} from '../lib/danh-muc.js';
import { BaoLoi, DaiThe, DangTai, OTimKiem, Trong } from '../components/Chung.js';
import { TheSanPham } from '../components/danh-muc/SanPham.js';
import { TheNhom } from '../components/danh-muc/Nhom.js';
import { TheChietKhau } from '../components/danh-muc/ChietKhau.js';
import { TheGiayToMau } from '../components/danh-muc/GiayToMau.js';

/**
 * Danh sách nhóm sản phẩm, tải một lần cho cả màn hình.
 *
 * Chỉ tải khi là Quản trị: vai trò khác không có ô chọn nhóm nào, và gọi một API
 * họ không có quyền chỉ để bỏ kết quả đi là tự tạo ra 403 trong log.
 */
function useNhom(quanTri: boolean) {
  const [nhom, datNhom] = useState<NhomSanPham[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const taiLai = useCallback(() => datLan((x) => x + 1), []);

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

  return { nhom, loi, taiLai };
}

function DauTrang({ tieuDe, moTa }: { tieuDe: string; moTa: string }) {
  return (
    <div className="dau-trang">
      <div>
        <h1>{tieuDe}</h1>
        <p className="mo-ta-trang">{moTa}</p>
      </div>
    </div>
  );
}

// --- Sản phẩm ---------------------------------------------------------------

export function TrangSanPham() {
  const { nguoiDung } = usePhien();
  const quanTri = can(nguoiDung?.role, 'quanTriDanhMuc');
  const { nhom, loi, taiLai } = useNhom(quanTri);
  const [the, datThe] = useState<TheSanPhamKhoa>('san-pham');

  if (loi !== null && nhom === null && quanTri) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (quanTri && !nhom) return <DangTai />;

  return (
    <section className="trang">
      <DauTrang
        tieuDe="Sản phẩm"
        moTa={
          quanTri
            ? 'Danh mục sản phẩm, giá bán Công ty và nhóm sản phẩm.'
            : 'Chỉ xem. Việc thêm và sửa thuộc Quản trị hệ thống.'
        }
      />

      {/* HAI THẺ, và chỉ Quản trị mới thấy chúng. Hai bảng xếp chồng thì bảng
          nhóm nằm dưới một bảng sản phẩm dài, phải cuộn qua hết mới tới — mà nó
          lại là thứ phải làm TRƯỚC khi tạo sản phẩm đầu tiên.

          Vai trò khác không có dải thẻ: họ chỉ đọc bảng sản phẩm, và một dải thẻ
          một mục là một dải thẻ vô nghĩa. */}
      {quanTri && nhom ? (
        <>
          <DaiThe nhanVung="Nhóm nội dung" dangChon={the} chon={datThe} muc={THE_SAN_PHAM} />
          {the === 'san-pham' && <TheSanPham nhom={nhom} />}
          {the === 'nhom' && <TheNhom nhom={nhom} taiLai={taiLai} />}
        </>
      ) : (
        <BangSanPhamChiXem />
      )}
    </section>
  );
}

// --- Chiết khấu -------------------------------------------------------------

export function TrangChietKhau() {
  const { nguoiDung } = usePhien();
  const quanTri = can(nguoiDung?.role, 'quanTriDanhMuc');
  const { nhom, loi, taiLai } = useNhom(quanTri);

  if (loi !== null && nhom === null && quanTri) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (quanTri && !nhom) return <DangTai />;

  return (
    <section className="trang">
      <DauTrang
        tieuDe="Chiết khấu"
        moTa={
          quanTri
            ? 'Ngưỡng chiết khấu quy định theo nhóm sản phẩm và loại khách hàng.'
            : 'Ngưỡng chiết khấu quy định. Chỉ xem.'
        }
      />

      <TheChietKhau nhom={nhom ?? []} chiXem={!quanTri} />
    </section>
  );
}

// --- Giấy tờ mẫu ------------------------------------------------------------

export function TrangGiayToMau() {
  return (
    <section className="trang">
      <DauTrang tieuDe="Giấy tờ mẫu" moTa="Mẫu văn bản dùng để xuất PDF." />
      <TheGiayToMau />
    </section>
  );
}

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
