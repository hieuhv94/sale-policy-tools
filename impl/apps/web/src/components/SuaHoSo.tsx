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
import { dang, layJson, LoiApi, va, xoa } from '../lib/api.js';
import { BaoLoi, ChuThichBatBuoc, HopThoai, ONhapTien, Truong } from './Chung.js';
import { thieuTruong } from '../lib/bat-buoc.js';
import type { DongSanPham } from './BangSanPham.js';

export { suaDuoc } from '../lib/sua-ho-so.js';

type SanPham = { id: string; code: string; name: string };

type XemTruocNguong = {
  productCode: string;
  threshold: string;
  thresholdSource: 'RULE' | 'PRODUCT_DEFAULT';
};

/**
 * Hỏi trước xem ngưỡng chiết khấu của sản phẩm này từ đâu ra, rồi cảnh báo NGAY
 * nếu nó rơi về mặc định của sản phẩm.
 *
 * Vì sao hỏi trước khi lưu chứ không báo sau: ngưỡng ĐÓNG BĂNG vào dòng hồ sơ
 * lúc lưu. Biết sau thì phải xoá dòng, đi nhờ Quản trị khai quy định, rồi nhập
 * lại từ đầu. Biết trước thì người lập chọn được — vẫn lập với ngưỡng mặc định,
 * hay dừng lại hỏi trước.
 *
 * Lỗi mạng ở đây KHÔNG hiện gì. Đây là thông tin thêm, không phải điều kiện để
 * lưu; một khối đỏ "không tra được ngưỡng" cạnh biểu mẫu đang gõ dở chỉ làm
 * người dùng tưởng mình vừa làm hỏng thứ gì. Máy chủ vẫn tra lại lúc lưu và vẫn
 * từ chối nếu sản phẩm không có ngưỡng nào.
 */
function useXemTruocNguong(hoSoId: string, productId: string) {
  const [xem, datXem] = useState<XemTruocNguong | null>(null);
  const [khongCoNguong, datKhongCoNguong] = useState(false);

  useEffect(() => {
    datXem(null);
    datKhongCoNguong(false);
    if (productId === '') return undefined;
    const huy = new AbortController();
    layJson<XemTruocNguong>(
      `/policies/${hoSoId}/threshold-preview?productId=${encodeURIComponent(productId)}`,
      huy.signal,
    )
      .then(datXem)
      .catch((e: unknown) => {
        if (huy.signal.aborted) return;
        // Sản phẩm không có ngưỡng nào — cả quy định lẫn mặc định đều trống. Lưu
        // chắc chắn hỏng, nên chỗ này thì phải nói.
        if (e instanceof LoiApi && e.code === 'THRESHOLD_NOT_CONFIGURED') datKhongCoNguong(true);
      });
    return () => huy.abort();
  }, [hoSoId, productId]);

  return { xem, khongCoNguong };
}

/**
 * Thêm MỘT dòng sản phẩm, hoặc SỬA một dòng đã có.
 *
 * Cùng một biểu mẫu, HAI đường máy chủ: `POST .../lines` để thêm, `PATCH
 * .../lines/:lineId` để sửa. Không gộp làm một vì trùng sản phẩm lúc THÊM là một
 * nhầm lẫn — người dùng tưởng mình đang thêm mặt hàng mới — và `POL-02` chặn nó
 * có chủ ý. Cho `POST` ghi đè là đánh mất một cái chặn đúng.
 *
 * Khi sửa thì Ô CHỌN SẢN PHẨM KHOÁ LẠI. Đổi sản phẩm không phải là sửa dòng này
 * mà là thêm một dòng khác — và dòng cũ vẫn nằm nguyên đó, nên người dùng tưởng
 * mình vừa đổi một dòng trong khi hồ sơ có thêm một sản phẩm.
 */
export function ThemDongSanPham({
  hoSoId,
  dongCu,
  dong,
  xong,
}: {
  hoSoId: string;
  /** Có nghĩa là SỬA dòng này. Bỏ trống là thêm dòng mới. */
  dongCu?: DongSanPham | undefined;
  dong: () => void;
  xong: () => void;
}) {
  const sua = dongCu !== undefined;
  const [ds, datDs] = useState<SanPham[] | null>(null);
  const [sanPham, datSanPham] = useState(dongCu?.productId ?? '');
  const [giaBanBuon, datGiaBanBuon] = useState(dongCu?.wholesalePrice ?? '');
  // Bắt đầu bằng MỘT ô khi thêm mới. Hồ sơ thường chỉ có một khoản chi phí; bày
  // sẵn bốn ô là bắt gõ số 0 vào ba ô không có nghĩa gì, rồi ba cột số 0 ấy đi
  // thẳng ra bản in. Khi sửa thì nạp đúng các khoản đang có.
  const [cpbh, datCpbh] = useState<string[]>(
    dongCu && dongCu.cpbh.length > 0 ? [...dongCu.cpbh] : [''],
  );
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const { xem, khongCoNguong } = useXemTruocNguong(hoSoId, sanPham);

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

  const themCpbh = () => datCpbh((cu) => [...cu, '']);
  const botCpbh = (i: number) => datCpbh((cu) => cu.filter((_, j) => j !== i));

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      const than = {
        wholesalePrice: giaBanBuon,
        // Ô để trống gửi '0' chứ không bỏ đi: người dùng đã mở ô đó ra thì nó là
        // một khoản họ có ý định khai, chỉ là bằng không. Bỏ đi sẽ làm lệch số
        // thứ tự của các khoản sau nó.
        cpbh: cpbh.map((v) => v || '0'),
      };
      if (sua) await va(`/policies/${hoSoId}/lines/${dongCu.id}`, than);
      else await dang(`/policies/${hoSoId}/lines`, { productId: sanPham, ...than });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai
      tieuDe={sua ? `Sửa dòng ${dongCu.productCode}` : 'Thêm dòng sản phẩm'}
      dong={dong}
    >
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="dsp-sp" nhan="Sản phẩm" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={sanPham}
              disabled={sua}
              onChange={(e) => datSanPham(e.target.value)}
            >
              <option value="">— Chọn sản phẩm —</option>
              {/* Khi sửa, danh mục có thể KHÔNG còn sản phẩm này (đã vô hiệu
                  hoá) — nhưng hồ sơ vẫn giữ nó. Thêm thẳng một mục từ chính dòng
                  đang sửa, nếu không ô chọn sẽ hiện rỗng và người dùng tưởng dữ
                  liệu hỏng. */}
              {sua && !(ds ?? []).some((s) => s.id === dongCu.productId) && (
                <option value={dongCu.productId}>
                  {dongCu.productName} ({dongCu.productCode})
                </option>
              )}
              {(ds ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}
        </Truong>

        {/*
          Cảnh báo NGAY sau ô chọn sản phẩm, không phải dưới đáy biểu mẫu: nó nói
          về sản phẩm vừa chọn, và người dùng sắp cuộn xuống gõ giá. Đặt cuối thì
          họ đọc nó sau khi đã gõ xong — quá muộn để đổi ý một cách rẻ.
        */}
        {khongCoNguong && (
          <div className="bao-loi" role="alert">
            <strong>Sản phẩm này chưa có ngưỡng chiết khấu nào.</strong> Danh mục không có quy định
            nào phủ nó, mà mặc định của chính sản phẩm cũng để trống. Thêm dòng sẽ bị từ chối — báo
            Quản trị hệ thống khai ngưỡng trước.
          </div>
        )}
        {xem?.thresholdSource === 'PRODUCT_DEFAULT' && (
          <div className="hop-canh-bao" role="note">
            <span className="dau-mac-dinh" aria-hidden="true">
              ◆
            </span>{' '}
            <strong>Chưa có quy định chiết khấu cho sản phẩm này.</strong> Không quy định nào phủ nó
            với loại khách hàng và kênh của khách hàng này, nên hồ sơ sẽ dùng{' '}
            <strong>ngưỡng mặc định {xem.threshold}%</strong> khai trong danh mục sản phẩm. Vẫn lập
            hồ sơ được; báo Quản trị hệ thống nếu con số đó không đúng.
          </div>
        )}

        <Truong id="dsp-gia" nhan="Giá bán buôn" donVi="Tiền tệ đơn vị đồng" bắtBuộc>
          {(p) => <ONhapTien {...p} giaTri={giaBanBuon} doi={datGiaBanBuon} />}
        </Truong>

        {/* SỐ KHOẢN CPBH tuỳ dòng, người lập tự thêm bớt. Mỗi sản phẩm có cấu
            trúc chi phí khác nhau; ô cố định bốn là ép mọi sản phẩm vào một
            khuôn không có thật. */}
        {cpbh.map((v, i) => (
          <div className="hang-cpbh" key={i}>
            <Truong id={`dsp-cpbh${i + 1}`} nhan={`CPBH ${i + 1}`} donVi="Tiền tệ đơn vị đồng">
              {(p) => <ONhapTien {...p} giaTri={v} doi={(x) => doiCpbh(i, x)} />}
            </Truong>
            {cpbh.length > 1 && (
              <button
                type="button"
                className="nut nut-nhe"
                aria-label={`Bớt CPBH ${i + 1}`}
                onClick={() => botCpbh(i)}
              >
                Bớt
              </button>
            )}
          </div>
        ))}

        <div className="nhom-nut">
          <button type="button" className="nut nut-nhe" onClick={themCpbh}>
            + Thêm khoản chi phí
          </button>
        </div>

        <p className="ghi-chu">
          <strong>Giá bán Công ty</strong> và <strong>ngưỡng chiết khấu</strong> lấy từ danh mục và
          được đóng băng vào hồ sơ — bạn không nhập. Giá thu về và tỷ lệ chiết khấu hiện ngay sau khi
          lưu.
          {sua && (
            <>
              {' '}
              <strong>Đổi sản phẩm thì xoá dòng này rồi thêm dòng mới</strong> — sản phẩm là thứ
              nhận diện một dòng.
            </>
          )}
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={dangGui || sanPham === '' || giaBanBuon === ''}
          >
            {dangGui ? 'Đang lưu…' : sua ? 'Lưu dòng' : 'Thêm dòng'}
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
