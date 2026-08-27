/**
 * Thẻ Nhóm sản phẩm.
 *
 * Xoá nhóm bị chặn ở tầng CSDL bằng khoá ngoại khi còn sản phẩm tham chiếu
 * (`CAT-14`) — màn hình không kiểm trước rồi mới gọi, vì giữa hai bước đó một
 * sản phẩm mới có thể chèn vào. Cứ gọi và dịch mã lỗi `GROUP_IN_USE` ra câu
 * người dùng đọc được.
 */
import { useState } from 'react';
import { dang, xoa } from '../../lib/api.js';
import { LoiApi } from '../../lib/api.js';
import type { NhomSanPham } from '../../lib/danh-muc.js';
import { BaoLoi, ChuThichBatBuoc, HopThoai, HopThoaiXacNhan, Trong, Truong } from '../Chung.js';
import { PhanTrang } from '../PhanTrang.js';
import { useTrangTaiCho } from '../../lib/phan-trang.js';
import { useBaoLoi } from '../../lib/bao-loi.js';

export function TheNhom({ nhom, taiLai }: { nhom: NhomSanPham[]; taiLai: () => void }) {
  const [moTao, datMoTao] = useState(false);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangXoa, datDangXoa] = useState<string | null>(null);
  const [hoiXoa, datHoiXoa] = useState<NhomSanPham | null>(null);

  // MÀN HÌNH tự cắt: `nhom` đã tải trọn ở `useNhom` để nuôi các ô chọn của thẻ
  // Sản phẩm và thẻ Chiết khấu. Cắt ở máy chủ là gãy hai ô chọn đó (`0030`).
  const { trang, soTrang, doiTrang, cuaTrang } = useTrangTaiCho(nhom);

  const go = async (n: NhomSanPham) => {
    datLoi(null);
    datDangXoa(n.id);
    try {
      await xoa(`/catalog/product-groups/${n.id}`, { confirm: n.code });
      taiLai();
    } catch (e) {
      // `GROUP_IN_USE` là tình huống bình thường, không phải sự cố — nói rõ phải
      // làm gì tiếp thay vì để người dùng đọc một mã lỗi.
      datLoi(
        e instanceof LoiApi && e.code === 'GROUP_IN_USE'
          ? new LoiApi(
              e.status,
              e.code,
              `Nhóm "${n.name}" đang có sản phẩm. Chuyển các sản phẩm sang nhóm khác trước khi xoá.`,
            )
          : e,
      );
    } finally {
      datDangXoa(null);
    }
  };

  return (
    <>
      <div className="hang-thao-tac">
        <button type="button" className="nut nut-chinh" onClick={() => datMoTao(true)}>
          Thêm nhóm
        </button>
      </div>

      {loi !== null && <BaoLoi loi={loi} />}

      {nhom.length === 0 ? (
        <Trong
          tieuDe="Chưa có nhóm sản phẩm nào"
          moTa="Mỗi sản phẩm phải thuộc một nhóm, và quy định chiết khấu cũng khai theo nhóm. Tạo nhóm trước khi thêm sản phẩm."
        />
      ) : (
        <div className="khung-cuon" role="region" aria-label="Nhóm sản phẩm" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Mã nhóm</th>
                <th>Tên nhóm</th>
                {/* Tiêu đề KHÔNG hiện ra mắt (`0132`), nhưng vẫn phải có: một
                    `<th>` rỗng thì trình đọc màn hình đọc ô nút là "cột trống",
                    và người dùng bàn phím không biết mình vừa Tab vào đâu. */}
                <th>
                  <span className="chi-doc-man-hinh">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cuaTrang.map((n) => (
                <tr key={n.id}>
                  <td className="ma-phu">{n.code}</td>
                  <td>{n.name}</td>
                  <td className="o-thao-tac-re-chuot">
                    <button
                      type="button"
                      className="nut nut-canh-bao"
                      disabled={dangXoa === n.id}
                      onClick={() => datHoiXoa(n)}
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PhanTrang
        trang={trang}
        soTrang={soTrang}
        tong={nhom.length}
        doiTrang={doiTrang}
        nhan="nhóm"
      />

      {hoiXoa && (
        /* `goLai` — gõ lại MÃ nhóm, không phải tên: hai nhóm trùng tên là
           chuyện có thật, còn mã thì duy nhất (`0036`). */
        <HopThoaiXacNhan
          tieuDe={`Xoá nhóm "${hoiXoa.name}"`}
          hauQua={
            <p>
              Nhóm biến mất khỏi mọi ô chọn. Còn sản phẩm nào trỏ vào nhóm này thì máy chủ chặn —
              nhưng nếu nhóm đang rỗng, xoá xong <strong>không lấy lại được</strong> và quy định
              chiết khấu khai theo nhóm này cũng mất chỗ dựa.
            </p>
          }
          nhanNut="Xoá nhóm"
          goLai={hoiXoa.code}
          dangChay={dangXoa === hoiXoa.id}
          dong={() => datHoiXoa(null)}
          xacNhan={() => void go(hoiXoa).then(() => datHoiXoa(null))}
        />
      )}

      {moTao && (
        <HopThoaiTaoNhom
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

function HopThoaiTaoNhom({ dong, xong }: { dong: () => void; xong: () => void }) {
  const { bao } = useBaoLoi();
  const [ma, datMa] = useState('');
  const [ten, datTen] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/catalog/product-groups', { code: ma.trim(), name: ten.trim() });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm nhóm sản phẩm" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="nhom-ma" nhan="Mã nhóm" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ma} onChange={(e) => datMa(e.target.value)} />}
        </Truong>
        <Truong id="nhom-ten" nhan="Tên nhóm" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ten} onChange={(e) => datTen(e.target.value)} />}
        </Truong>

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
