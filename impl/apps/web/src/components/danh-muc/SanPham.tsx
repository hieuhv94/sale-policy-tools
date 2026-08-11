/**
 * Thẻ Sản phẩm: tạo, sửa, đặt giá, nhập từ Excel.
 *
 * Giá là phần dễ làm sai nhất ở đây. Giá KHÔNG phải một ô trên sản phẩm — nó là
 * một chuỗi dòng có ngày hiệu lực, và giá hiện hành là dòng mới nhất có ngày
 * KHÔNG ở tương lai (`CAT-05`). Nên màn hình không có ô "sửa giá"; nó có nút
 * "Đặt giá mới", và bảng lịch sử để thấy giá nào áp dụng từ bao giờ.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, guiTep, layJson, va } from '../../lib/api.js';
import { ngay, tien } from '../../lib/format.js';
import {
  LOAI_GIA,
  NHAN_LOAI_GIA,
  NHAN_TRANG_THAI_SAN_PHAM,
  TRANG_THAI_SAN_PHAM,
  type DongGia,
  type NhomSanPham,
  type SanPham,
  type TrangThaiSanPham,
} from '../../lib/danh-muc.js';
import { BaoLoi, ChuThichBatBuoc, DangTai, HopThoai, ONhapTien, Trong, Truong } from '../Chung.js';
import { thieuTruong } from '../../lib/bat-buoc.js';

export function TheSanPham({ nhom }: { nhom: NhomSanPham[] }) {
  const [ds, datDs] = useState<SanPham[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [mo, datMo] = useState<
    { kieu: 'tao' } | { kieu: 'sua'; sp: SanPham } | { kieu: 'gia'; sp: SanPham } | { kieu: 'excel' } | null
  >(null);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<{ items: SanPham[] }>('/catalog/products?limit=200', huy.signal)
      .then((r) => datDs(r.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan]);

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  const dong = () => datMo(null);
  const xong = () => {
    datMo(null);
    taiLai();
  };

  return (
    <>
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-chinh"
          disabled={nhom.length === 0}
          onClick={() => datMo({ kieu: 'tao' })}
        >
          Thêm sản phẩm
        </button>
        <button type="button" className="nut nut-nhe" onClick={() => datMo({ kieu: 'excel' })}>
          Nhập từ Excel
        </button>
      </div>

      {nhom.length === 0 && (
        <p className="giai-thich">
          Chưa có nhóm sản phẩm nào. Mỗi sản phẩm phải thuộc một nhóm — tạo nhóm ở thẻ{' '}
          <strong>Nhóm sản phẩm</strong> trước.
        </p>
      )}

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {ds.length === 0 ? (
        <Trong tieuDe="Danh mục chưa có sản phẩm nào" />
      ) : (
        <div className="khung-cuon" role="region" aria-label="Danh mục sản phẩm" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Mã vật tư</th>
                <th>Tên sản phẩm</th>
                <th>Nhóm</th>
                <th>Ngưỡng CK mặc định (loại 1 · 2 · 3)</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((s) => (
                <tr key={s.id}>
                  <td className="ma-phu">{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.groupCode}</td>
                  <td className="so">{nguongMacDinh(s)}</td>
                  <td>{NHAN_TRANG_THAI_SAN_PHAM[s.status] ?? s.status}</td>
                  <td>
                    <div className="nhom-nut nhom-nut-gon">
                      <button type="button" className="nut nut-nhe" onClick={() => datMo({ kieu: 'sua', sp: s })}>
                        Sửa
                      </button>
                      <button type="button" className="nut nut-nhe" onClick={() => datMo({ kieu: 'gia', sp: s })}>
                        Giá
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mo?.kieu === 'tao' && <HopThoaiTao nhom={nhom} dong={dong} xong={xong} />}
      {mo?.kieu === 'sua' && <HopThoaiSua sp={mo.sp} dong={dong} xong={xong} />}
      {mo?.kieu === 'gia' && <HopThoaiGia sp={mo.sp} dong={dong} />}
      {mo?.kieu === 'excel' && <HopThoaiExcel dong={dong} xong={xong} />}
    </>
  );
}

/** Ba ngưỡng mặc định trên một dòng — bày ba cột riêng thì bảng tràn ngang. */
const nguongMacDinh = (s: SanPham): string =>
  [s.defaultRate2Type1, s.defaultRate2Type2, s.defaultRate2Type3]
    .map((n) => (n === null ? '—' : `${(n / 100).toFixed(2)}%`))
    .join(' · ');

// --- Tạo ---------------------------------------------------------------------

function HopThoaiTao({
  nhom,
  dong,
  xong,
}: {
  nhom: NhomSanPham[];
  dong: () => void;
  xong: () => void;
}) {
  const [ma, datMa] = useState('');
  const [ten, datTen] = useState('');
  const [maNhom, datMaNhom] = useState(nhom[0]?.code ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/catalog/products', { code: ma.trim(), name: ten.trim(), groupCode: maNhom });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm sản phẩm" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="sp-ma" nhan="Mã vật tư" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ma} onChange={(e) => datMa(e.target.value)} />}
        </Truong>
        <Truong id="sp-ten" nhan="Tên sản phẩm" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ten} onChange={(e) => datTen(e.target.value)} />}
        </Truong>
        <Truong id="sp-nhom" nhan="Nhóm" bắtBuộc>
          {(p) => (
            <select {...p} className="o-nhap" value={maNhom} onChange={(e) => datMaNhom(e.target.value)}>
              {nhom.map((n) => (
                <option key={n.id} value={n.code}>
                  {n.name} ({n.code})
                </option>
              ))}
            </select>
          )}
        </Truong>
        <p className="ghi-chu">
          Sản phẩm mới <strong>chưa có giá</strong>. Chưa đặt giá thì chưa lập được hồ sơ CSBH với
          sản phẩm này — đặt giá ngay sau khi tạo.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || ma.trim() === '' || ten.trim() === ''}>
            {dangGui ? 'Đang tạo…' : 'Tạo'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

// --- Sửa ---------------------------------------------------------------------

function HopThoaiSua({ sp, dong, xong }: { sp: SanPham; dong: () => void; xong: () => void }) {
  const [ten, datTen] = useState(sp.name);
  const [trangThai, datTrangThai] = useState<TrangThaiSanPham>(sp.status);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await va(`/catalog/products/${sp.id}`, { name: ten.trim(), status: trangThai });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Sửa ${sp.code}`} dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        {/* Mã vật tư không sửa được — cùng lý do với mã khách hàng: hồ sơ cũ
            đóng băng mã sản phẩm, sửa mã là mọi hồ sơ cũ lặng lẽ trỏ sang thứ khác. */}
        <p className="ghi-chu">
          Mã vật tư <strong>{sp.code}</strong> không sửa được. Hồ sơ CSBH đã lập đóng băng mã này.
        </p>
        <Truong id="sp-sua-ten" nhan="Tên sản phẩm" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ten} onChange={(e) => datTen(e.target.value)} />}
        </Truong>
        <Truong id="sp-sua-tt" nhan="Trạng thái">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={trangThai}
              onChange={(e) => datTrangThai(e.target.value as TrangThaiSanPham)}
            >
              {TRANG_THAI_SAN_PHAM.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_SAN_PHAM[t]}
                </option>
              ))}
            </select>
          )}
        </Truong>
        <p className="ghi-chu">
          Vô hiệu hoá chỉ chặn <strong>hồ sơ lập mới</strong>. Hồ sơ đã lập vẫn giữ nguyên sản phẩm
          và giá đã đóng băng.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || ten.trim() === ''}>
            {dangGui ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

// --- Giá ---------------------------------------------------------------------

function HopThoaiGia({ sp, dong }: { sp: SanPham; dong: () => void }) {
  const [ls, datLs] = useState<DongGia[] | null>(null);
  const [loai, datLoai] = useState<(typeof LOAI_GIA)[number]>('GIA_BAN_CONG_TY');
  const [soTien, datSoTien] = useState('');
  const [tuNgay, datTuNgay] = useState(() => new Date().toISOString().slice(0, 10));
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const [lan, datLan] = useState(0);

  useEffect(() => {
    const huy = new AbortController();
    layJson<DongGia[]>(`/catalog/products/${sp.id}/prices`, huy.signal)
      .then(datLs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [sp.id, lan]);

  const thieu = thieuTruong('gia', { priceType: loai, amount: soTien, effectiveFrom: tuNgay });

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang(`/catalog/products/${sp.id}/prices`, {
        priceType: loai,
        amount: soTien,
        effectiveFrom: tuNgay,
      });
      datSoTien('');
      datLan((x) => x + 1);
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Giá — ${sp.code} ${sp.name}`} dong={dong}>
      <p className="ghi-chu">
        Giá hiện hành là dòng mới nhất có ngày hiệu lực <strong>không ở tương lai</strong>. Đặt giá
        cho ngày mai thì hôm nay vẫn dùng giá cũ.
      </p>

      <form onSubmit={gui}>

        <ChuThichBatBuoc />

        <Truong id="gia-loai" nhan="Loại giá" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={loai}
              onChange={(e) => datLoai(e.target.value as (typeof LOAI_GIA)[number])}
            >
              {LOAI_GIA.map((g) => (
                <option key={g} value={g}>
                  {NHAN_LOAI_GIA[g]}
                </option>
              ))}
            </select>
          )}
        </Truong>
        <Truong id="gia-tien" nhan="Số tiền" bắtBuộc>
          {(p) => <ONhapTien {...p} giaTri={soTien} doi={datSoTien} />}
        </Truong>
        <Truong id="gia-tu" nhan="Áp dụng từ ngày" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={tuNgay} onChange={(e) => datTuNgay(e.target.value)} />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || thieu.length > 0}>
            {dangGui ? 'Đang lưu…' : 'Đặt giá mới'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Đóng
          </button>
        </div>
      </form>

      <h3>Lịch sử giá</h3>
      {!ls ? (
        <DangTai />
      ) : ls.length === 0 ? (
        <p className="trong">Chưa đặt giá nào.</p>
      ) : (
        <table className="bang">
          <thead>
            <tr>
              <th>Loại giá</th>
              <th>Số tiền</th>
              <th>Áp dụng từ</th>
            </tr>
          </thead>
          <tbody>
            {ls.map((d, i) => (
              <tr key={`${d.priceType}-${d.effectiveFrom}-${i}`}>
                <td>{NHAN_LOAI_GIA[d.priceType] ?? d.priceType}</td>
                <td className="so">{tien(d.amount)}</td>
                <td>{ngay(d.effectiveFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </HopThoai>
  );
}

// --- Nhập Excel --------------------------------------------------------------

function HopThoaiExcel({ dong, xong }: { dong: () => void; xong: () => void }) {
  const [tep, datTep] = useState<File | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tep) return;
    datLoi(null);
    datDangGui(true);
    try {
      const form = new FormData();
      form.append('file', tep);
      await guiTep('/catalog/products/import', form);
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Nhập sản phẩm từ Excel" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <p className="ghi-chu">
          File cần các cột: <strong>mã vật tư</strong>, <strong>tên sản phẩm</strong>,{' '}
          <strong>mã nhóm</strong>. Nhóm phải có sẵn trong danh mục.
        </p>
        {/*
          Nói trước hành vi "cả lô một transaction". Người dùng quen với kiểu
          nhập từng dòng, bỏ qua dòng lỗi — ở đây thì ngược lại, và biết trước
          thì họ sửa file rồi nhập lại thay vì đi tìm xem đã ghi được tới đâu.
        */}
        <p className="giai-thich">
          Một dòng lỗi thì <strong>không dòng nào được ghi</strong>. Thông báo lỗi nêu đúng số dòng
          hỏng để bạn sửa file rồi nhập lại.
        </p>

        <Truong id="excel-tep" nhan="Tệp Excel" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => datTep(e.target.files?.[0] ?? null)}
            />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || tep === null}>
            {dangGui ? 'Đang nhập…' : 'Nhập'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}
