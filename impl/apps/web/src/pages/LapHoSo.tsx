/**
 * Lập hồ sơ CSBH mới (TDV) — bước chọn khách hàng và cách lập.
 *
 * Dòng sản phẩm KHÔNG nhập ở đây. Hồ sơ tạo ra ở trạng thái Nháp rồi thêm từng
 * dòng trên màn hình chi tiết, vì mọi con số dẫn xuất — giá thu về, tỷ lệ chiết
 * khấu, cờ vượt ngưỡng — do MÁY CHỦ tính và trả về sau mỗi lần thêm. Nhập cả
 * hồ sơ 20 dòng rồi mới thấy kết quả là bắt người dùng làm việc mù; mà tính lại
 * ở giao diện thì phải chép công thức sang đây, và `bundle.test.ts` chốt phụ
 * thuộc của web đúng `react` + `react-dom` nên không import được
 * `@csbh/domain-policy`. Chép tay một công thức có luật làm tròn là cách chắc
 * chắn để hai bên lệch nhau vào ngày ai đó sửa một bên.
 *
 * Khách hàng đã có CSBH đang hiệu lực thì phải chọn **Bổ sung** hay **Chỉnh
 * sửa** ngay tại đây. Máy chủ cũng hỏi câu đó (`SUPPLEMENT_REQUIRED` /
 * `AMEND_REQUIRED`), nhưng nó suy ra câu hỏi từ danh sách dòng gửi lên — mà lúc
 * này hồ sơ chưa có dòng nào, nên câu nó chọn sẽ luôn là "chỉnh sửa" và đọc ra
 * sai. Hỏi thẳng người dùng thì đúng cả hai tình huống.
 */
import { useEffect, useState } from 'react';
import { dang, layJson } from '../lib/api.js';
import { useDuong } from '../lib/router.js';
import { ngay } from '../lib/format.js';
import { thieuTruong } from '../lib/bat-buoc.js';
import { BaoLoi, ChuThichBatBuoc, DangTai, OTimKiem, Trong, Truong } from '../components/Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { la404 } from '../lib/loi.js';

type KhachHang = { id: string; code: string; name: string };
type HoSoHienHanh = { id: string; code: string; appliedDate: string | null };

export function LapHoSo() {
  const { di, truyVan } = useDuong();
  const [tim, datTim] = useState('');
  const [ds, datDs] = useState<KhachHang[] | null>(null);
  const [chon, datChon] = useState<KhachHang | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  /*
   * `?khachHang=<id>` — vào thẳng bước chọn cách lập, bỏ qua bước tìm (`0083`).
   *
   * Nút *Lập hồ sơ CSBH* ở màn hình khách hàng dẫn tới đây. Người dùng vừa đứng
   * ở đúng khách ấy; bắt họ gõ lại tên rồi chọn trong danh sách là ba bước để
   * quay về chỗ cũ, và bước cuối còn có khả năng chọn nhầm một khách trùng tên.
   *
   * Tra hụt thì KHÔNG báo lỗi, chỉ rơi về bước tìm như thường: id trong địa chỉ
   * có thể cũ, có thể sai, có thể của một khách ngoài phạm vi. Một màn hình lỗi
   * ở đây chặn cả việc lập hồ sơ cho khách khác, mà bước tìm vẫn dùng được.
   */
  const tuDuong = truyVan.get('khachHang');
  useEffect(() => {
    if (!tuDuong) return;
    const huy = new AbortController();
    layJson<KhachHang>(`/customers/${encodeURIComponent(tuDuong)}`, huy.signal)
      .then(datChon)
      .catch(() => undefined);
    return () => huy.abort();
  }, [tuDuong]);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    // `forNewPolicy` giấu khách đã ngừng hợp tác (`0034`) — máy chủ cũng chặn,
    // nhưng bày ra một lựa chọn rồi từ chối là bắt người dùng đoán vì sao.
    const q = tim
      ? `?q=${encodeURIComponent(tim)}&limit=20&forNewPolicy=true`
      : '?limit=20&forNewPolicy=true';
    layJson<{ items: KhachHang[] }>(`/customers${q}`, huy.signal)
      .then((r) => datDs(r.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [tim]);

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Lập hồ sơ CSBH</h1>
          <p className="mo-ta-trang">Chọn khách hàng, rồi thêm dòng sản phẩm ở bước sau.</p>
        </div>
      </div>

      {chon ? (
        <ChonCachLap khachHang={chon} doiKhach={() => datChon(null)} xong={(id) => di(`/ho-so/${id}`)} />
      ) : (
        <>
          <OTimKiem id="lhs-tim" giaTri={tim} doi={datTim} nhan="Tìm khách hàng" />
          {loi !== null && <BaoLoi loi={loi} />}
          {!ds ? (
            <DangTai />
          ) : ds.length === 0 ? (
            <Trong
              tieuDe="Không tìm thấy khách hàng nào"
              moTa="Chỉ thấy khách hàng thuộc phạm vi của bạn. Khách chưa có thì lập ở mục Khách hàng."
            />
          ) : (
            <ul className="danh-sach-viec">
              {ds.map((k) => (
                <li key={k.id}>
                  <button type="button" className="viec-lien" onClick={() => datChon(k)}>
                    <span className="ma-phu">{k.code}</span>
                    <span>{k.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ChonCachLap({
  khachHang,
  doiKhach,
  xong,
}: {
  khachHang: KhachHang;
  doiKhach: () => void;
  xong: (id: string) => void;
}) {
  const { bao } = useBaoLoi();
  const [hienHanh, datHienHanh] = useState<HoSoHienHanh | null | 'khong-co'>(null);
  /** Lỗi TRA bản đang hiệu lực — khác hẳn với "khách chưa có bản nào". */
  const [loiTra, datLoiTra] = useState<unknown>(null);
  const [ngayApDung, datNgayApDung] = useState(() => new Date().toISOString().slice(0, 10));
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<HoSoHienHanh>(
      `/policies/current?customerId=${encodeURIComponent(khachHang.id)}`,
      huy.signal,
    )
      .then(datHienHanh)
      .catch((e: unknown) => {
        if (huy.signal.aborted) return;
        // 404 nghĩa là khách chưa có CSBH nào — câu trả lời bình thường. Lỗi
        // khác thì phải nói ra (`0089`): màn hình này quyết định giữa "lập bản
        // đầu tiên" và "lập phiên bản mới", và đoán sai vế là lập nhầm loại.
        if (la404(e)) datHienHanh('khong-co');
        else datLoiTra(e);
      });
    return () => huy.abort();
  }, [khachHang.id]);

  const lap = async (mode?: 'SUPPLEMENT' | 'AMEND') => {
    datLoi(null);
    datDangGui(true);
    try {
      const hs = await dang<{ id: string }>('/policies', {
        customerId: khachHang.id,
        appliedDate: ngayApDung,
        lines: [],
        ...(mode ? { mode } : {}),
      });
      xong(hs.id);
    } catch (e) {
      bao(e);
    } finally {
      datDangGui(false);
    }
  };

  if (loiTra !== null) return <BaoLoi loi={loiTra} />;
  if (hienHanh === null) return <DangTai />;

  // Ô ngày có sẵn giá trị hôm nay nên nhìn như đã điền, mà xoá trắng đi thì
  // `<input type="date">` trả chuỗi rỗng và không có gì trên màn hình đổi khác.
  // Máy chủ nhận hồ sơ không có ngày áp dụng — xem `CHAT_HON` ở `bat-buoc.ts`.
  const thieu = thieuTruong('ho-so', { customerId: khachHang.id, appliedDate: ngayApDung });

  return (
    <>
      <div className="the">
        <p className="phu">Khách hàng</p>
        <p>
          <strong>{khachHang.name}</strong> <span className="ma-phu">{khachHang.code}</span>
        </p>
        <button type="button" className="nut nut-nhe" onClick={doiKhach}>
          Chọn khách khác
        </button>
      </div>

      <ChuThichBatBuoc />
      <Truong id="lhs-ngay" nhan="Ngày áp dụng" bắtBuộc>
        {(p) => (
          <input
            {...p}
            className="o-nhap"
            type="date"
            value={ngayApDung}
            onChange={(e) => datNgayApDung(e.target.value)}
          />
        )}
      </Truong>

      {loi !== null && <BaoLoi loi={loi} />}

      {hienHanh === 'khong-co' ? (
        <>
          <p className="ghi-chu">Khách hàng chưa có CSBH nào — đây sẽ là phiên bản đầu tiên.</p>
          <div className="nhom-nut">
            <button type="button" className="nut nut-chinh" disabled={dangGui || thieu.length > 0} onClick={() => lap()}>
              {dangGui ? 'Đang lập…' : 'Lập hồ sơ'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="giai-thich">
            Khách hàng đang có CSBH <strong>{hienHanh.code}</strong> (áp dụng{' '}
            {ngay(hienHanh.appliedDate)}). Phiên bản mới <strong>chứa lại toàn bộ sản phẩm cũ</strong>{' '}
            — bạn không phải nhập lại. CSBH cũ chỉ hết hiệu lực khi bản mới được duyệt xong.
          </p>
          <p className="tieu-de-phu">Bạn muốn làm gì?</p>
          <div className="nhom-nut">
            <button
              type="button"
              className="nut nut-chinh"
              disabled={dangGui || thieu.length > 0}
              onClick={() => lap('SUPPLEMENT')}
            >
              Bổ sung — thêm sản phẩm chưa có
            </button>
            <button
              type="button"
              className="nut"
              disabled={dangGui || thieu.length > 0}
              onClick={() => lap('AMEND')}
            >
              Chỉnh sửa — đổi sản phẩm đã có
            </button>
          </div>
        </>
      )}
    </>
  );
}
