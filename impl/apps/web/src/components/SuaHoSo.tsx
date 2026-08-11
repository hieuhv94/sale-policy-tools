/**
 * Sửa nội dung hồ sơ: thêm dòng sản phẩm, đổi ngày áp dụng, xoá hồ sơ.
 *
 * Chỉ hiện khi hồ sơ ở trạng thái SỬA ĐƯỢC. Danh sách trạng thái đó do máy chủ
 * giữ (`EDITABLE` ở `policies.service.ts`), nên ở đây suy từ chính câu trả lời
 * của máy chủ thay vì chép lại: hồ sơ nào sửa được thì `allowed-actions` có
 * `SUBMIT` hoặc `RESUBMIT_AFTER_EDIT`. Chép danh sách trạng thái sang giao diện
 * là thêm một bản sao phải giữ đồng bộ với máy trạng thái.
 */
import { useEffect, useState } from 'react';
import { dang, layJson, va, xoa } from '../lib/api.js';
import { BaoLoi, ChuThichBatBuoc, HopThoai, ONhapTien, Truong } from './Chung.js';
import { thieuTruong } from '../lib/bat-buoc.js';

export { suaDuoc } from '../lib/sua-ho-so.js';

type SanPham = { id: string; code: string; name: string };

export function ThemDongSanPham({
  hoSoId,
  dong,
  xong,
}: {
  hoSoId: string;
  dong: () => void;
  xong: () => void;
}) {
  const [ds, datDs] = useState<SanPham[] | null>(null);
  const [sanPham, datSanPham] = useState('');
  const [giaBanBuon, datGiaBanBuon] = useState('');
  const [cpbh, datCpbh] = useState(['', '', '', '']);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    // `forNewPolicy=true` lọc bỏ sản phẩm đã vô hiệu hoá — bày ra rồi để máy chủ
    // từ chối là bắt người dùng đoán vì sao.
    layJson<{ items: SanPham[] }>('/catalog/products?limit=200&forNewPolicy=true', huy.signal)
      .then((r) => datDs(r.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  const doiCpbh = (i: number, v: string) =>
    datCpbh((cu) => cu.map((x, j) => (j === i ? v : x)));

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang(`/policies/${hoSoId}/lines`, {
        productId: sanPham,
        wholesalePrice: giaBanBuon,
        // Ô trống gửi '0' chứ không bỏ trường: bốn ô CPBH cùng quyết định giá
        // thu về, và bỏ một ô đi thì con số dẫn xuất vẫn ra — chỉ là ra sai.
        cpbh1: cpbh[0] || '0',
        cpbh2: cpbh[1] || '0',
        cpbh3: cpbh[2] || '0',
        cpbh4: cpbh[3] || '0',
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm dòng sản phẩm" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="dsp-sp" nhan="Sản phẩm" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={sanPham}
              onChange={(e) => datSanPham(e.target.value)}
            >
              <option value="">— Chọn sản phẩm —</option>
              {(ds ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}
        </Truong>

        <Truong id="dsp-gia" nhan="Giá bán buôn" bắtBuộc>
          {(p) => <ONhapTien {...p} giaTri={giaBanBuon} doi={datGiaBanBuon} />}
        </Truong>

        {[0, 1, 2, 3].map((i) => (
          <Truong key={i} id={`dsp-cpbh${i + 1}`} nhan={`CPBH ${i + 1}`}>
            {(p) => <ONhapTien {...p} giaTri={cpbh[i] ?? ''} doi={(v) => doiCpbh(i, v)} />}
          </Truong>
        ))}

        <p className="ghi-chu">
          <strong>Giá bán Công ty</strong> và <strong>ngưỡng chiết khấu</strong> lấy từ danh mục và
          được đóng băng vào hồ sơ — bạn không nhập. Giá thu về và tỷ lệ chiết khấu hiện ngay sau khi
          thêm.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={dangGui || sanPham === '' || giaBanBuon === ''}
          >
            {dangGui ? 'Đang thêm…' : 'Thêm dòng'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

export function SuaNgayApDung({
  hoSoId,
  ngayHienTai,
  dong,
  xong,
}: {
  hoSoId: string;
  ngayHienTai: string | null;
  dong: () => void;
  xong: () => void;
}) {
  const [ngayMoi, datNgayMoi] = useState(ngayHienTai ?? new Date().toISOString().slice(0, 10));
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await va(`/policies/${hoSoId}`, { appliedDate: ngayMoi });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Sửa ngày áp dụng" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="nad-ngay" nhan="Ngày áp dụng" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="date"
              value={ngayMoi}
              onChange={(e) => datNgayMoi(e.target.value)}
            />
          )}
        </Truong>
        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={dangGui || thieuTruong('ngay-ap-dung', { appliedDate: ngayMoi }).length > 0}
          >
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

/**
 * Xoá hồ sơ. Hỏi lại BẰNG CÁCH BẮT GÕ MÃ HỒ SƠ, không phải một nút "Chắc chưa?".
 *
 * Xoá là thao tác không lùi được và nút của nó nằm ngay cạnh những nút dùng hàng
 * ngày. Một hộp thoại xác nhận thường bị bấm qua theo phản xạ; gõ lại mã thì
 * không thể bấm nhầm.
 */
export function XoaHoSo({
  hoSoId,
  ma,
  dong,
  xong,
}: {
  hoSoId: string;
  ma: string;
  dong: () => void;
  xong: () => void;
}) {
  const [go, datGo] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async () => {
    datLoi(null);
    datDangGui(true);
    try {
      await xoa(`/policies/${hoSoId}`);
      xong();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Xoá hồ sơ ${ma}`} dong={dong}>
      <p className="giai-thich">
        Xoá là <strong>không lùi được</strong>. Hồ sơ và mọi dòng sản phẩm của nó biến mất; nhật ký
        thao tác vẫn còn.
      </p>
      <Truong id="xhs-ma" nhan={`Gõ lại mã hồ sơ để xác nhận: ${ma}`} bắtBuộc>
        {(p) => (
          <input
            {...p}
            className="o-nhap"
            autoComplete="off"
            value={go}
            onChange={(e) => datGo(e.target.value)}
          />
        )}
      </Truong>
      {loi !== null && <BaoLoi loi={loi} />}
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-canh-bao"
          disabled={dangGui || go.trim() !== ma}
          onClick={gui}
        >
          {dangGui ? 'Đang xoá…' : 'Xoá hồ sơ'}
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Huỷ
        </button>
      </div>
    </HopThoai>
  );
}
