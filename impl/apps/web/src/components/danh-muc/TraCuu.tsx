/**
 * Hai thẻ nhỏ: danh mục tra cứu (tỉnh · bệnh viện · kênh) và người ký.
 *
 * Danh mục tra cứu trông vặt vãnh nhưng nó là NGUỒN của ba ô chọn trong biểu
 * mẫu khách hàng và của ô "kênh" trong quy định chiết khấu. Trống ba bảng này
 * thì người lập khách hàng gặp ba ô chọn rỗng và không có gì trên màn hình nói
 * cho họ biết phải nhờ ai.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, layJson, va, xoa } from '../../lib/api.js';
import { ngay } from '../../lib/format.js';
import {
  LOAI_TRA_CUU,
  NHAN_TRA_CUU,
  type LoaiTraCuu,
  type MucTraCuu,
  type NguoiKy,
} from '../../lib/danh-muc.js';
import { BaoLoi, ChuThichBatBuoc, DaiThe, DangTai, HopThoai, Trong, Truong } from '../Chung.js';
import { thieuTruong } from '../../lib/bat-buoc.js';

// --- Danh mục tra cứu --------------------------------------------------------

export function TheTraCuu() {
  const [loai, datLoai] = useState<LoaiTraCuu>('province');
  const [ds, datDs] = useState<MucTraCuu[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [moTao, datMoTao] = useState(false);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    datDs(null);
    layJson<MucTraCuu[]>(`/catalog/lookups/${loai}`, huy.signal)
      .then(datDs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [loai, lan]);

  return (
    <>
      <DaiThe
        nhanVung="Loại danh mục tra cứu"
        dangChon={loai}
        chon={datLoai}
        muc={LOAI_TRA_CUU.map((l) => ({ khoa: l, nhan: NHAN_TRA_CUU[l] }))}
      />

      <div className="nhom-nut">
        <button type="button" className="nut nut-chinh" onClick={() => datMoTao(true)}>
          Thêm mục
        </button>
      </div>

      <p className="ghi-chu">
        Thêm lại một mã đã có sẽ <strong>đổi tên</strong> mã đó, không tạo bản thứ hai.
      </p>

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {!ds ? (
        <DangTai />
      ) : ds.length === 0 ? (
        <Trong
          tieuDe={`Chưa có mục nào trong ${NHAN_TRA_CUU[loai]}`}
          moTa="Danh mục này là nguồn của ô chọn tương ứng trong biểu mẫu khách hàng."
        />
      ) : (
        <div className="khung-cuon" role="region" aria-label={NHAN_TRA_CUU[loai]} tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((m) => (
                <tr key={m.code}>
                  <td className="ma-phu">{m.code}</td>
                  <td>{m.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {moTao && (
        <HopThoaiTraCuu
          loai={loai}
          dong={() => datMoTao(false)}
          xong={() => {
            datMoTao(false);
            taiLai();
          }}
        />
      )}
    </>
  );
}

function HopThoaiTraCuu({
  loai,
  dong,
  xong,
}: {
  loai: LoaiTraCuu;
  dong: () => void;
  xong: () => void;
}) {
  const [ma, datMa] = useState('');
  const [ten, datTen] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang(`/catalog/lookups/${loai}`, { code: ma.trim(), name: ten.trim() });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Thêm vào ${NHAN_TRA_CUU[loai]}`} dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="tc-ma" nhan="Mã" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ma} onChange={(e) => datMa(e.target.value)} />}
        </Truong>
        <Truong id="tc-ten" nhan="Tên" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ten} onChange={(e) => datTen(e.target.value)} />}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || ma.trim() === '' || ten.trim() === ''}>
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

// --- Người ký ----------------------------------------------------------------

export function TheNguoiKy() {
  const [ds, datDs] = useState<NguoiKy[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [moTao, datMoTao] = useState(false);
  const [sua, datSua] = useState<NguoiKy | null>(null);
  const [dangChay, datDangChay] = useState<string | null>(null);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  const chay = async (k: NguoiKy, fn: () => Promise<unknown>) => {
    datLoi(null);
    datDangChay(k.id);
    try {
      await fn();
      taiLai();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangChay(null);
    }
  };

  const doiHieuLuc = (k: NguoiKy) =>
    chay(k, () => va(`/catalog/signers/${k.id}`, { isActive: !k.isActive }));

  const go = (k: NguoiKy) => chay(k, () => xoa(`/catalog/signers/${k.id}`));

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<NguoiKy[]>('/catalog/signers', huy.signal)
      .then(datDs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan]);

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <>
      <div className="nhom-nut">
        <button type="button" className="nut nut-chinh" onClick={() => datMoTao(true)}>
          Thêm người ký
        </button>
      </div>

      <p className="ghi-chu">
        Người ký đứng tên trên hợp đồng xuất ra. Mỗi người có <strong>phạm vi ký</strong> và khoảng
        hiệu lực riêng — ký ngoài phạm vi hoặc ngoài hạn thì hệ thống từ chối.
      </p>

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {ds.length === 0 ? (
        <Trong tieuDe="Chưa khai người ký nào" />
      ) : (
        <div className="khung-cuon" role="region" aria-label="Người ký" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Chức danh</th>
                <th>Đơn vị</th>
                <th>Phạm vi ký</th>
                <th>Hiệu lực</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((k) => (
                <tr key={k.id}>
                  <td>{k.fullName}</td>
                  <td>{k.title}</td>
                  <td>{k.unit}</td>
                  <td className="ma-phu">{k.signScope}</td>
                  <td>
                    {ngay(k.validFrom)}
                    {k.validTo ? ` – ${ngay(k.validTo)}` : ' – không thời hạn'}
                  </td>
                  <td>{k.isActive ? 'Đang hiệu lực' : 'Đã ngừng'}</td>
                  <td>
                    <div className="nhom-nut nhom-nut-gon">
                      <button type="button" className="nut nut-nhe" onClick={() => datSua(k)}>
                        Sửa
                      </button>
                      {/*
                        NGỪNG là thao tác chính, XOÁ là ngoại lệ. Hệ thống không
                        lưu file hợp đồng, nên bản giấy khách hàng đang giữ là dấu
                        vết duy nhất — và nó dẫn chiếu tới một cái tên mà CSDL phải
                        còn giải thích được. Xoá chỉ dành cho dòng vừa khai nhầm.
                      */}
                      <button
                        type="button"
                        className="nut nut-nhe"
                        disabled={dangChay === k.id}
                        onClick={() => doiHieuLuc(k)}
                      >
                        {k.isActive ? 'Ngừng dùng' : 'Dùng lại'}
                      </button>
                      <button
                        type="button"
                        className="nut nut-canh-bao"
                        disabled={dangChay === k.id}
                        onClick={() => go(k)}
                      >
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {moTao && (
        <HopThoaiNguoiKy
          dong={() => datMoTao(false)}
          xong={() => {
            datMoTao(false);
            taiLai();
          }}
        />
      )}

      {sua && (
        <HopThoaiSuaNguoiKy
          k={sua}
          dong={() => datSua(null)}
          xong={() => {
            datSua(null);
            taiLai();
          }}
        />
      )}
    </>
  );
}

/**
 * Sửa người ký. Họ tên và ngày bắt đầu hiệu lực KHÔNG sửa được.
 *
 * Đổi họ tên là biến bản ghi này thành một người khác, trong khi những hợp đồng
 * đã xuất vẫn mang tên cũ — mà hệ thống không lưu file hợp đồng nên không có
 * cách nào đối chiếu lại. Người mới thì khai người mới.
 */
function HopThoaiSuaNguoiKy({
  k,
  dong,
  xong,
}: {
  k: NguoiKy;
  dong: () => void;
  xong: () => void;
}) {
  const [chucDanh, datChucDanh] = useState(k.title);
  const [donVi, datDonVi] = useState(k.unit);
  const [phamVi, datPhamVi] = useState(k.signScope);
  const [denNgay, datDenNgay] = useState(k.validTo ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const duGiaTri = chucDanh.trim() !== '' && donVi.trim() !== '' && phamVi.trim() !== '';

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await va(`/catalog/signers/${k.id}`, {
        title: chucDanh.trim(),
        unit: donVi.trim(),
        signScope: phamVi.trim(),
        validTo: denNgay,
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Sửa ${k.fullName}`} dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <p className="ghi-chu">
          Họ tên và ngày bắt đầu hiệu lực không sửa được — hợp đồng đã xuất mang tên cũ, mà hệ thống
          không lưu file để đối chiếu lại. Người mới thì khai người mới.
        </p>

        <Truong id="nk-sua-chuc" nhan="Chức danh" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={chucDanh} onChange={(e) => datChucDanh(e.target.value)} />}
        </Truong>
        <Truong id="nk-sua-don-vi" nhan="Đơn vị" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={donVi} onChange={(e) => datDonVi(e.target.value)} />}
        </Truong>
        <Truong id="nk-sua-pham-vi" nhan="Phạm vi ký" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={phamVi} onChange={(e) => datPhamVi(e.target.value)} />}
        </Truong>
        <Truong id="nk-sua-den" nhan="Hiệu lực đến">
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={denNgay} onChange={(e) => datDenNgay(e.target.value)} />
          )}
        </Truong>
        <p className="ghi-chu">Để trống là không thời hạn.</p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !duGiaTri}>
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

function HopThoaiNguoiKy({ dong, xong }: { dong: () => void; xong: () => void }) {
  const [hoTen, datHoTen] = useState('');
  const [chucDanh, datChucDanh] = useState('');
  const [donVi, datDonVi] = useState('');
  const [phamVi, datPhamVi] = useState('');
  const [tuNgay, datTuNgay] = useState(() => new Date().toISOString().slice(0, 10));
  const [denNgay, datDenNgay] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const duGiaTri =
    thieuTruong('nguoi-ky', {
      fullName: hoTen,
      title: chucDanh,
      unit: donVi,
      signScope: phamVi,
      validFrom: tuNgay,
    }).length === 0;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/catalog/signers', {
        fullName: hoTen.trim(),
        title: chucDanh.trim(),
        unit: donVi.trim(),
        signScope: phamVi.trim(),
        validFrom: tuNgay,
        ...(denNgay ? { validTo: denNgay } : {}),
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm người ký" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="nk-ten" nhan="Họ tên" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={hoTen} onChange={(e) => datHoTen(e.target.value)} />}
        </Truong>
        <Truong id="nk-chuc" nhan="Chức danh" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={chucDanh} onChange={(e) => datChucDanh(e.target.value)} />}
        </Truong>
        <Truong id="nk-don-vi" nhan="Đơn vị" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={donVi} onChange={(e) => datDonVi(e.target.value)} />}
        </Truong>
        <Truong id="nk-pham-vi" nhan="Phạm vi ký" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={phamVi} onChange={(e) => datPhamVi(e.target.value)} />}
        </Truong>
        <Truong id="nk-tu" nhan="Hiệu lực từ" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={tuNgay} onChange={(e) => datTuNgay(e.target.value)} />
          )}
        </Truong>
        <Truong id="nk-den" nhan="Hiệu lực đến">
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={denNgay} onChange={(e) => datDenNgay(e.target.value)} />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !duGiaTri}>
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
