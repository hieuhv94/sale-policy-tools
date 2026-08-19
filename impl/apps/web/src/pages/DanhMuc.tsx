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
  type NhomSanPham,
  type SanPham,
  type TheSanPhamKhoa,
} from '../lib/danh-muc.js';
import { BaoLoi, DaiThe, DangTai, OTimKiem, Trong, Truong } from '../components/Chung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { useTrangMay } from '../lib/phan-trang.js';
import { TheSanPham } from '../components/danh-muc/SanPham.js';
import { TheNhom } from '../components/danh-muc/Nhom.js';
import { TheChietKhau } from '../components/danh-muc/ChietKhau.js';
import { TheGiayToMau } from '../components/danh-muc/GiayToMau.js';

/**
 * Danh sách nhóm sản phẩm, tải một lần cho cả màn hình.
 *
 * TẢI CHO MỌI VAI TRÒ từ `0049`. Trước đó chỉ Quản trị tải, vì chỉ họ mới có ô
 * chọn nhóm — trên biểu mẫu tạo sản phẩm. Giờ nhóm sản phẩm còn là nguồn của Ô
 * LỌC đứng cạnh ô tìm, và ô lọc ấy có ở cả bảng chỉ-xem. Đường này không gắn
 * `@Roles` nên mọi vai trò đăng nhập đều đọc được.
 */
function useNhom() {
  const [nhom, datNhom] = useState<NhomSanPham[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<NhomSanPham[]>('/catalog/product-groups', huy.signal)
      .then(datNhom)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan]);

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
  const { nhom, loi, taiLai } = useNhom();
  const [the, datThe] = useState<TheSanPhamKhoa>('san-pham');

  if (loi !== null && nhom === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!nhom) return <DangTai />;

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
        <BangSanPhamChiXem nhom={nhom} />
      )}
    </section>
  );
}

// --- Chiết khấu -------------------------------------------------------------

export function TrangChietKhau() {
  const { nguoiDung } = usePhien();
  const quanTri = can(nguoiDung?.role, 'quanTriDanhMuc');
  /*
   * `useNhom()` KHÔNG còn nhận cờ Quản trị (`0049`), và điều đó sửa luôn một lỗi
   * đã nằm sẵn ở đây: bản cũ gọi `useNhom(quanTri)`, nên với mọi vai trò KHÔNG
   * phải Quản trị thì hook không tải gì, `nhom` mãi là `null`, và dòng ngay dưới
   * trả về vòng quay chờ VĨNH VIỄN. Màn hình Chiết khấu hỏng với năm trên sáu vai
   * trò. Không ca kiểm thử nào bắt được vì phần này chưa từng được vẽ ra thật —
   * đúng loại lỗi mà món nợ "chưa có test trình duyệt" đã hứa sẽ có.
   */
  const { nhom, loi, taiLai } = useNhom();

  if (loi !== null && nhom === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!nhom) return <DangTai />;

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

function BangSanPhamChiXem({ nhom }: { nhom: NhomSanPham[] }) {
  const [tim, datTim] = useState('');
  const [locNhom, datLocNhom] = useState('');

  // Cùng phép sửa như thẻ Sản phẩm của Quản trị (`0049`): máy chủ tìm, máy chủ
  // cắt trang. Bảng này là màn hình Sản phẩm của NĂM vai trò còn lại, nên bỏ sót
  // nó là vá nợ cho một người và để nguyên cho tất cả những người khác.
  const truyVan = new URLSearchParams();
  if (tim.trim() !== '') truyVan.set('q', tim.trim());
  if (locNhom !== '') truyVan.set('groupCode', locNhom);
  const duoi = truyVan.toString();

  const {
    muc: ds,
    tong,
    loi,
    trang,
    soTrang,
    doiTrang,
    taiLai,
  } = useTrangMay<SanPham>(`/catalog/products${duoi ? `?${duoi}` : ''}`);

  const dangLoc = tim.trim() !== '' || locNhom !== '';

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <>
      <div className="hang-tim">
        <OTimKiem id="tim-san-pham" nhan="Tìm theo tên sản phẩm" giaTri={tim} doi={datTim} />
        <Truong id="loc-nhom-sp-xem" nhan="Nhóm sản phẩm">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={locNhom}
              onChange={(e) => datLocNhom(e.target.value)}
            >
              <option value="">— Mọi nhóm —</option>
              {nhom.map((x) => (
                <option key={x.id} value={x.code}>
                  {x.name} ({x.code})
                </option>
              ))}
            </select>
          )}
        </Truong>
        {dangLoc && (
          <span className="ghi-chu" role="status">
            {tong} sản phẩm khớp
          </span>
        )}
      </div>

      {ds.length === 0 ? (
        dangLoc ? (
          <Trong
            tieuDe="Không có sản phẩm nào khớp"
            moTa="Ô tìm chỉ khớp TÊN sản phẩm, không khớp mã vật tư. Thử bỏ bớt chữ, hoặc mở lại nhóm về “Mọi nhóm”."
          />
        ) : (
          <Trong tieuDe="Danh mục chưa có sản phẩm nào" />
        )
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
      )}
      <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="sản phẩm" />
    </>
  );
}
