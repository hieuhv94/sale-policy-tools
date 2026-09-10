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
 * Khách hàng đã có CSBH đang hiệu lực thì đây là chỗ xác nhận **lập phiên bản
 * mới** — MỘT nút, không phải hai (`0180`, chốt 07/09).
 *
 * Hai nút cũ — *Bổ sung* và *Chỉnh sửa* — dẫn tới **cùng một việc**: máy chủ
 * chép lại toàn bộ dòng cũ rồi để TDV thêm bớt. Chúng chỉ khác nhau ở chữ trên
 * mặt nút, nên chúng bắt người lập trả lời trước một câu hỏi mà họ chỉ biết câu
 * trả lời sau khi mở hồ sơ ra: *"tôi sắp thêm mặt hàng mới, hay sửa mặt hàng
 * đã có?"* — và rất thường là cả hai.
 *
 * Việc phân loại ấy KHÔNG mất đi, nó chuyển xuống đúng chỗ có dữ liệu để trả
 * lời: mỗi dòng sản phẩm tự mang trạng thái *Bổ sung* · *Chỉnh sửa* · *Đang áp
 * dụng*, tính từ chính bản bị thay thế (`0180`).
 *
 * NGÀY ÁP DỤNG cũng rời khỏi màn hình này cùng lượt — nó là thuộc tính của từng
 * dòng sản phẩm, khai trong hộp thoại *Thêm sản phẩm*.
 */
import { useEffect, useState } from 'react';
import { dang, layJson } from '../lib/api.js';
import { useDuong } from '../lib/router.js';
import { thieuTruong } from '../lib/bat-buoc.js';
import { BaoLoi, DangTai, OTimKiem, Trong } from '../components/Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { la404 } from '../lib/loi.js';

type KhachHang = { id: string; code: string; name: string };
type HoSoHienHanh = { id: string; code: string };

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
          <p className="mo-ta-trang">Chọn khách hàng, rồi thêm sản phẩm ở bước sau.</p>
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
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  /**
   * Bản Nháp khách này đang có (`0197`) — id cùng câu chữ của máy chủ.
   *
   * KHÔNG phải một `loi`: đây không phải sự cố mà là một ngã rẽ, và nó thay hẳn
   * cụm nút chứ không đứng cạnh chúng. Để nó đi đường `bao(e)` như mọi lỗi khác
   * thì người dùng đọc một dải đỏ rồi vẫn nhìn thấy đúng cái nút vừa từ chối họ.
   */
  const [daCoNhap, datDaCoNhap] = useState<{ id: string; loiNhan: string } | null>(null);

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

  const lap = async (mode?: 'NEW_VERSION') => {
    datLoi(null);
    datDangGui(true);
    try {
      const hs = await dang<{ id: string }>('/policies', {
        customerId: khachHang.id,
        lines: [],
        ...(mode ? { mode } : {}),
      });
      xong(hs.id);
    } catch (e) {
      // `0197` — khách đã có bản Nháp thì đổi CÂU HỎI, không bày lỗi. Id lấy từ
      // thân lỗi máy chủ; thiếu nó thì rơi về đường lỗi thường, vì một nút *Mở
      // bản Nháp* không biết mở cái nào thì tệ hơn một dải đỏ.
      const l = e as { code?: string; message?: string; body?: Record<string, unknown> };
      const id = l?.body?.['draftPolicyId'];
      if (l?.code === 'DRAFT_EXISTS' && typeof id === 'string') {
        datDaCoNhap({ id, loiNhan: l.message ?? '' });
      } else bao(e);
    } finally {
      datDangGui(false);
    }
  };

  if (loiTra !== null) return <BaoLoi loi={loiTra} />;
  if (hienHanh === null) return <DangTai />;

  const thieu = thieuTruong('ho-so', { customerId: khachHang.id });

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

      {loi !== null && <BaoLoi loi={loi} />}

      {/*
        `0197` — ĐỔI HẲN cụm nút, không chèn thêm một khối.
        Để nút *Lập hồ sơ* nằm lại bên cạnh là mời người dùng bấm tiếp đúng cái
        nút vừa từ chối họ, và mỗi lượt bấm ấy lại đi hết một vòng mạng để nhận
        lại đúng câu này.
      */}
      {daCoNhap !== null ? (
        <>
          <p className="giai-thich">{daCoNhap.loiNhan}</p>
          <div className="nhom-nut">
            <button type="button" className="nut nut-chinh" onClick={() => xong(daCoNhap.id)}>
              Mở bản Nháp đang có
            </button>
            <button type="button" className="nut nut-nhe" onClick={doiKhach}>
              Chọn khách khác
            </button>
          </div>
        </>
      ) : hienHanh === 'khong-co' ? (
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
            Khách hàng đang có CSBH <strong>{hienHanh.code}</strong>. Phiên bản mới{' '}
            <strong>chứa lại toàn bộ sản phẩm cũ</strong> — bạn không phải nhập lại, và mỗi dòng sẽ
            tự mang trạng thái <strong>Bổ sung</strong>, <strong>Chỉnh sửa</strong> hay{' '}
            <strong>Đang áp dụng</strong> theo đúng thứ bạn thay đổi. CSBH cũ chỉ hết hiệu lực khi
            bản mới được duyệt xong.
          </p>
          <div className="nhom-nut">
            {/* MỘT nút (`0180`). Hai nút cũ dẫn tới cùng một việc — xem chú
                thích đầu tệp. */}
            <button
              type="button"
              className="nut nut-chinh"
              disabled={dangGui || thieu.length > 0}
              onClick={() => lap('NEW_VERSION')}
            >
              {dangGui ? 'Đang lập…' : 'Lập phiên bản mới'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
