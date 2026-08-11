/**
 * Thẻ Quy định chiết khấu — ngưỡng cảnh báo khi lập hồ sơ.
 *
 * Bốn ô lọc (nhóm · loại khách · kênh · thời gian) đều bỏ trống được, và bỏ
 * trống nghĩa là "mọi". Nhiều dòng cùng khớp một tình huống là chuyện BÌNH
 * THƯỜNG chứ không phải lỗi cấu hình: dòng cụ thể hơn thắng, `specificity` là
 * con số máy chủ tính để xếp thứ tự đó. Màn hình hiện nó ra thay vì giấu, vì
 * "vì sao hồ sơ này lấy ngưỡng 25% chứ không phải 30%" là câu hỏi sẽ được hỏi.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, layJson, va, xoa } from '../../lib/api.js';
import { ngay } from '../../lib/format.js';
import {
  LOAI_KHACH_HANG,
  nguongTuPhanTram,
  phamViChietKhau,
  phanTramTuNguong,
  type MucTraCuu,
  type NhomSanPham,
  type QuyDinhChietKhau,
} from '../../lib/danh-muc.js';
import { BaoLoi, DangTai, HopThoai, Trong, Truong } from '../Chung.js';

export function TheChietKhau({ nhom, chiXem = false }: { nhom: NhomSanPham[]; chiXem?: boolean }) {
  const [ds, datDs] = useState<QuyDinhChietKhau[] | null>(null);
  const [kenh, datKenh] = useState<MucTraCuu[]>([]);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [moTao, datMoTao] = useState(false);
  const [sua, datSua] = useState<QuyDinhChietKhau | null>(null);
  const [dangXoa, datDangXoa] = useState<string | null>(null);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  const go = async (q: QuyDinhChietKhau) => {
    datLoi(null);
    datDangXoa(q.id);
    try {
      await xoa(`/catalog/discount-rules/${q.id}`);
      taiLai();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangXoa(null);
    }
  };

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    Promise.all([
      layJson<{ items: QuyDinhChietKhau[] }>('/catalog/discount-rules?limit=200', huy.signal),
      layJson<MucTraCuu[]>('/catalog/lookups/channel', huy.signal),
    ])
      .then(([q, k]) => {
        datDs(q.items);
        datKenh(k);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan]);

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <>
      {!chiXem && (
        <div className="nhom-nut">
          <button type="button" className="nut nut-chinh" onClick={() => datMoTao(true)}>
            Thêm quy định
          </button>
        </div>
      )}

      <p className="ghi-chu">
        Ngưỡng chỉ để <strong>cảnh báo</strong>. Hồ sơ vượt ngưỡng vẫn gửi duyệt được — nó chỉ được
        đánh dấu để người duyệt nhìn thấy.
      </p>

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {ds.length === 0 ? (
        <Trong
          tieuDe="Chưa có quy định chiết khấu nào"
          moTa="Chưa có quy định thì không dòng sản phẩm nào bị đánh dấu vượt ngưỡng."
        />
      ) : (
        <div className="khung-cuon" role="region" aria-label="Quy định chiết khấu" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Áp dụng cho</th>
                <th>Ngưỡng</th>
                <th>Hiệu lực</th>
                <th>Độ cụ thể</th>
                {!chiXem && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {ds.map((q) => (
                <tr key={q.id}>
                  <td>{phamViChietKhau(q)}</td>
                  <td className="so">{phanTramTuNguong(q.thresholdRate2)}%</td>
                  <td>
                    {ngay(q.effectiveFrom)}
                    {q.effectiveTo ? ` – ${ngay(q.effectiveTo)}` : ' – không thời hạn'}
                  </td>
                  <td className="so">{q.specificity}</td>
                  {!chiXem && (
                    <td>
                      <div className="nhom-nut nhom-nut-gon">
                        <button type="button" className="nut nut-nhe" onClick={() => datSua(q)}>
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="nut nut-canh-bao"
                          disabled={dangXoa === q.id}
                          onClick={() => go(q)}
                        >
                          Xoá
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {moTao && (
        <HopThoaiTaoQuyDinh
          nhom={nhom}
          kenh={kenh}
          dong={() => datMoTao(false)}
          xong={() => {
            datMoTao(false);
            taiLai();
          }}
        />
      )}

      {sua && (
        <HopThoaiSuaQuyDinh
          q={sua}
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
 * Sửa chỉ hai ô: ngưỡng và ngày kết thúc.
 *
 * Ba khoá khớp (nhóm · loại khách · kênh) hiện ra dạng CHỮ, không dạng ô nhập —
 * đổi chúng là đổi `specificity`, tức đổi thứ tự ưu tiên khi nhiều dòng cùng
 * khớp (`CAT-11`). Máy chủ cũng không nhận. Khai nhầm phạm vi thì xoá rồi khai
 * lại.
 */
function HopThoaiSuaQuyDinh({
  q,
  dong,
  xong,
}: {
  q: QuyDinhChietKhau;
  dong: () => void;
  xong: () => void;
}) {
  const [nguong, datNguong] = useState(phanTramTuNguong(q.thresholdRate2));
  const [denNgay, datDenNgay] = useState(q.effectiveTo ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const n = Number(nguong);
  const hopLe = nguong !== '' && Number.isFinite(n) && n >= 0 && n <= 100;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      // `effectiveTo` gửi chuỗi RỖNG để gỡ ngày kết thúc — máy chủ phân biệt
      // "không đụng tới" (thiếu trường) với "gỡ" (rỗng).
      await va(`/catalog/discount-rules/${q.id}`, {
        thresholdRate2: nguongTuPhanTram(nguong),
        effectiveTo: denNgay,
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Sửa quy định chiết khấu" dong={dong}>
      <form onSubmit={gui}>
        <p className="ghi-chu">
          Áp dụng cho <strong>{phamViChietKhau(q)}</strong>, hiệu lực từ {ngay(q.effectiveFrom)}.
          Ba ô phạm vi không sửa được — đổi chúng là đổi thứ tự ưu tiên của cả bảng. Khai nhầm phạm
          vi thì xoá dòng này rồi khai lại.
        </p>

        <Truong
          id="ck-sua-nguong"
          nhan="Ngưỡng chiết khấu (%)"
          bắtBuộc
          loi={nguong !== '' && !hopLe ? 'Nhập một số từ 0 đến 100.' : undefined}
        >
          {(p) => (
            <input
              {...p}
              className="o-nhap o-nhap-hep so"
              inputMode="decimal"
              value={nguong}
              onChange={(e) => datNguong(e.target.value)}
            />
          )}
        </Truong>
        <Truong id="ck-sua-den" nhan="Hiệu lực đến">
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={denNgay} onChange={(e) => datDenNgay(e.target.value)} />
          )}
        </Truong>
        <p className="ghi-chu">
          Để trống là không thời hạn. Sửa <strong>không</strong> làm đổi hồ sơ đã lập — mỗi dòng hồ
          sơ giữ ngưỡng đã chụp lúc lập.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !hopLe}>
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

function HopThoaiTaoQuyDinh({
  nhom,
  kenh,
  dong,
  xong,
}: {
  nhom: NhomSanPham[];
  kenh: MucTraCuu[];
  dong: () => void;
  xong: () => void;
}) {
  const [maNhom, datMaNhom] = useState('');
  const [loaiKhach, datLoaiKhach] = useState('');
  const [maKenh, datMaKenh] = useState('');
  const [tuNgay, datTuNgay] = useState(() => new Date().toISOString().slice(0, 10));
  const [denNgay, datDenNgay] = useState('');
  const [nguong, datNguong] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const n = Number(nguong);
  const hopLe = nguong !== '' && Number.isFinite(n) && n >= 0 && n <= 100;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/catalog/discount-rules', {
        ...(maNhom ? { productGroupCode: maNhom } : {}),
        ...(loaiKhach ? { customerType: Number(loaiKhach) } : {}),
        ...(maKenh ? { channelCode: maKenh } : {}),
        effectiveFrom: tuNgay,
        ...(denNgay ? { effectiveTo: denNgay } : {}),
        thresholdRate2: nguongTuPhanTram(nguong),
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm quy định chiết khấu" dong={dong}>
      <form onSubmit={gui}>
        <p className="ghi-chu">
          Bỏ trống một ô nghĩa là <strong>áp dụng cho mọi giá trị</strong> của ô đó. Càng điền nhiều
          ô thì quy định càng cụ thể, và quy định cụ thể hơn thắng khi nhiều dòng cùng khớp.
        </p>

        <Truong id="ck-nhom" nhan="Nhóm sản phẩm">
          {(p) => (
            <select {...p} className="o-nhap" value={maNhom} onChange={(e) => datMaNhom(e.target.value)}>
              <option value="">— Mọi nhóm —</option>
              {nhom.map((x) => (
                <option key={x.id} value={x.code}>
                  {x.name} ({x.code})
                </option>
              ))}
            </select>
          )}
        </Truong>

        <Truong id="ck-loai" nhan="Loại khách hàng">
          {(p) => (
            <select {...p} className="o-nhap" value={loaiKhach} onChange={(e) => datLoaiKhach(e.target.value)}>
              <option value="">— Mọi loại —</option>
              {LOAI_KHACH_HANG.map((l) => (
                <option key={l} value={l}>
                  Loại {l}
                </option>
              ))}
            </select>
          )}
        </Truong>

        <Truong id="ck-kenh" nhan="Kênh bán">
          {(p) => (
            <select {...p} className="o-nhap" value={maKenh} onChange={(e) => datMaKenh(e.target.value)}>
              <option value="">— Mọi kênh —</option>
              {kenh.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.name} ({k.code})
                </option>
              ))}
            </select>
          )}
        </Truong>

        <Truong
          id="ck-nguong"
          nhan="Ngưỡng chiết khấu (%)"
          bắtBuộc
          loi={nguong !== '' && !hopLe ? 'Nhập một số từ 0 đến 100.' : undefined}
        >
          {(p) => (
            <input
              {...p}
              className="o-nhap o-nhap-hep so"
              inputMode="decimal"
              value={nguong}
              onChange={(e) => datNguong(e.target.value)}
            />
          )}
        </Truong>

        <Truong id="ck-tu" nhan="Hiệu lực từ" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={tuNgay} onChange={(e) => datTuNgay(e.target.value)} />
          )}
        </Truong>
        <Truong id="ck-den" nhan="Hiệu lực đến">
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={denNgay} onChange={(e) => datDenNgay(e.target.value)} />
          )}
        </Truong>
        <p className="ghi-chu">Bỏ trống ô "đến" nghĩa là quy định không có thời hạn kết thúc.</p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !hopLe}>
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
