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
} from '../../lib/danh-muc.js';
import {
  BaoLoi,
  ChuThichBatBuoc,
  DaiThe,
  DangTai,
  HopThoai,
  HopThoaiXacNhan,
  ThanhHoanTac,
  Trong,
  Truong,
} from '../Chung.js';
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

// --- Người ký: ĐÃ GỠ ---------------------------------------------------------
//
// Màn hình quản lý người ký gỡ khỏi giao diện ở P20 vì yêu cầu nghiệp vụ cho nó
// chưa rõ: không có mô tả nào nói người ký dùng ở đâu trong luồng, ai gán, và
// đổi người giữ chức thì hồ sơ đã ký chịu ảnh hưởng gì.
//
// API `/catalog/signers` bên máy chủ VẪN CÒN và vẫn có test. Gỡ màn hình không
// phải là xoá nghiệp vụ — nó là ngừng bày ra một màn hình mà người dùng điền
// vào cũng không biết để làm gì. Muốn dựng lại thì mã cũ nằm trong lịch sử git.
