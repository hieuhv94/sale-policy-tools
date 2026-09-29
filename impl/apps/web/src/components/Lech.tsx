/**
 * Chênh lệch giữa hồ sơ đã đóng băng và danh mục hôm nay — phần VẼ dùng chung.
 *
 * Tách khỏi `khoi/YeuCauCapNhat.tsx` ở `0050`, khi màn hình chi tiết hồ sơ cũng
 * phải hiện đúng thứ này. Hai bản sao của cùng một cách đọc số là hai bản sẽ có
 * ngày nói hai chuyện khác nhau về cùng một dòng dữ liệu — mà đây lại đúng là
 * loại thông tin người ta đọc rồi đặt bút ký.
 */
import { tien } from '../lib/format.js';

export type LechMuc = {
  /** `PRODUCT` là loại thứ ba từ `0036`: sản phẩm vô hiệu hoá hoặc đã xoá. */
  kind: 'PRICE' | 'RULE' | 'PRODUCT';
  productCode: string;
  snapValue: string;
  newValue: string | null;
};

/**
 * Nhãn, lớp CSS và cách đọc giá trị — MỘT bảng cho cả ba loại.
 *
 * Trước `0036` ba thứ này là ba phép `l.kind === 'PRICE' ? … : …` nằm rải trong
 * JSX, và thêm loại thứ ba vào một biểu thức nhị phân là cách chắc chắn để có
 * một chỗ quên: `PRODUCT` sẽ lặng lẽ hiện ra dưới nhãn "Ngưỡng".
 */
export const LOAI: Record<LechMuc['kind'], { nhan: string; lop: string }> = {
  PRICE: { nhan: 'Giá', lop: 'gia' },
  /*
   * "QĐ chiết khấu", KHÔNG phải "Ngưỡng" (`0054`).
   *
   * Thứ đã đổi là **quy định** chiết khấu; ngưỡng chỉ là con số nó sinh ra. Gọi
   * theo con số thì người đọc đi tìm một trường tên "ngưỡng" để sửa, mà cái sửa
   * được nằm ở màn hình *Danh mục ▸ Quy định chiết khấu*.
   *
   * Viết tắt "QĐ" cho vừa một hàng: dạng đầy đủ đẩy cột đầu rộng gấp đôi cột giá
   * trị. Bảng dòng sản phẩm đã dùng "QĐCK" cho cùng khái niệm này.
   */
  RULE: { nhan: 'QĐ chiết khấu', lop: 'nguong' },
  PRODUCT: { nhan: 'Sản phẩm', lop: 'san-pham' },
};

/**
 * Thứ tự đọc: nặng nhất trước.
 *
 * Cùng thứ tự với thư báo (`catalog-impact.consumer.ts`) — một hồ sơ vừa mất
 * sản phẩm vừa lệch giá thì thứ đáng nói trước là mất sản phẩm, ở mọi chỗ.
 */
export const THU_TU: LechMuc['kind'][] = ['PRODUCT', 'PRICE', 'RULE'];

/** Các loại lệch CÓ MẶT trong một danh sách, đã khử trùng và xếp theo mức nặng. */
export const loaiCoTrong = (lech: LechMuc[]): LechMuc['kind'][] =>
  THU_TU.filter((k) => lech.some((l) => l.kind === k));

/**
 * Giá là số nguyên đồng, ngưỡng là phần trăm — hai cách đọc khác nhau trên cùng
 * một cột `text` của CSDL. Ép kiểu ở đây chứ không ở máy chủ: máy chủ giữ nguyên
 * văn con số nó đã so, còn cách đọc là việc của màn hình.
 */
export const doc = (l: LechMuc, v: string | null): string => {
  // `null` mang HAI nghĩa khác nhau tuỳ loại, và câu chữ phải nói đúng nghĩa:
  // ở `RULE` là không quy định nào phủ nữa, ở `PRODUCT` là sản phẩm đã bị xoá
  // khỏi danh mục. Dùng chung một câu cho cả hai là nói một chuyện không xảy ra.
  if (v === null) {
    return l.kind === 'PRODUCT' ? 'đã xoá khỏi danh mục' : 'không còn quy định nào';
  }
  if (v === '—') return '—';
  // Trạng thái sản phẩm về tới đây đã là chữ ("Đang áp dụng" / "Đã vô hiệu
  // hoá"), không phải số — không ép kiểu tiền hay phần trăm lên nó.
  if (l.kind === 'PRODUCT') return v;
  if (l.kind === 'PRICE') return `${tien(v)} đ`;
  /*
   * `0238` — RULE mang `<ngưỡng>|<mã>` khi MÃ quy định đổi (máy chủ:
   * `giaTriQuyDinh` ở `policies/lech.ts`). Tách ở `|` ĐẦU TIÊN; mã tự nó có thể
   * chứa gì cũng được, còn ngưỡng thì không bao giờ chứa `|`. Không có `|` là dạng
   * số trần của `0029` — lệch chỉ ở ngưỡng.
   */
  const i = v.indexOf('|');
  if (i < 0) return phanTram(v);
  const nguong = v.slice(0, i);
  const ma = v.slice(i + 1);
  if (nguong === '—') return 'không có quy định nào';
  return `${phanTram(nguong)} (${ma})`;
};

const phanTram = (v: string) => `${v.replace('.', ',')}%`;

/** Nhãn loại, gọn trong một hàng — dùng cho dòng gấp lại ở box Yêu cầu cập nhật. */
export function TomTatLech({ lech }: { lech: LechMuc[] }) {
  return (
    <span className="lech-tom-tat">
      {loaiCoTrong(lech).map((k) => (
        <span key={k} className={`nhan-lech ${LOAI[k].lop}`}>
          {LOAI[k].nhan}
        </span>
      ))}
    </span>
  );
}

/**
 * Danh sách đầy đủ: lệch cái gì, sản phẩm nào, **từ đâu sang đâu**.
 *
 * "Hồ sơ này bị ảnh hưởng" mà không kèm con số thì người đọc phải mở hồ sơ ra,
 * mở danh mục ra, rồi tự so — đúng cái việc phần này sinh ra để khỏi phải làm.
 *
 * BẢNG chứ không phải danh sách (`0054`). Bản trước xếp bốn mẩu trên một dòng
 * chảy, nên mã sản phẩm và con số bắt đầu ở một cột khác nhau trên mỗi dòng —
 * đọc ba dòng thì mắt phải dò lại từ đầu ba lần, mà đây đúng là chỗ người ta cần
 * so con số theo cột. Dùng lại lớp `bang` và `khung-cuon` của các bảng khác
 * trong sản phẩm: cuộn ngang được trên điện thoại, và đọc quen một bảng là quen
 * mọi bảng.
 */
export function DanhSachLech({ lech }: { lech: LechMuc[] }) {
  return (
    <div className="khung-cuon" role="region" aria-label="Chênh lệch so với danh mục" tabIndex={0}>
      <table className="bang bang-lech">
        <thead>
          <tr>
            <th>Lệch ở</th>
            <th>Sản phẩm</th>
            <th>Trên hồ sơ</th>
            <th>Đã cập nhật</th>
          </tr>
        </thead>
        <tbody>
          {lech.map((l, i) => (
            <tr key={i}>
              <td>
                <span className={`nhan-lech ${LOAI[l.kind].lop}`}>{LOAI[l.kind].nhan}</span>
              </td>
              <td className="ma-phu">{l.productCode}</td>
              <td className="so">{doc(l, l.snapValue)}</td>
              <td className="so">{doc(l, l.newValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
