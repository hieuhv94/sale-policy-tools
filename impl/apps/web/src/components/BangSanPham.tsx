/**
 * Bảng dòng sản phẩm — màn hình khó nhất của cả ứng dụng.
 *
 * Hơn mười cột phải đọc được trên màn hình rộng 360px. Ba yêu cầu, ba cách bố
 * trí khác nhau, và điều quan trọng là chúng KHÔNG phải ba mức độ của cùng một
 * thứ:
 *
 *   - **≥1024px (`FE-05`)** — đủ mọi cột, không cắt chữ.
 *   - **640–1023px (`FE-04`)** — cuộn ngang TRONG KHUNG RIÊNG, cột Tên sản phẩm
 *     khoá cố định bên trái. Không có cột khoá thì cuộn sang phải là mất dấu
 *     đang đọc dòng nào — với bảng tiền thì đó là đọc nhầm số của sản phẩm khác.
 *   - **<640px (`FE-03`)** — mỗi dòng thành một THẺ. **Không cột nào biến mất.**
 *     Các ô CPBH gấp vào một dòng tổng, bấm mới mở.
 *
 * Điều dễ làm sai nhất ở đây là "ẩn bớt cột cho vừa màn hình". Các ô CPBH là
 * thứ quyết định giá thu về, và giá thu về quyết định tỷ lệ chiết khấu — ẩn đi
 * là làm người duyệt ký vào một con số họ không kiểm được.
 *
 * SỐ CỘT CPBH KHÔNG CỐ ĐỊNH (0021). Mỗi dòng có số khoản riêng; bảng lấy số cột
 * của dòng nhiều khoản nhất, dòng ít hơn để ô TRỐNG. Không điền số 0 thay: số 0
 * là một con số có nghĩa ("khoản này bằng không"), ô trống nói đúng điều cần nói
 * là dòng ấy không có khoản thứ mấy đó.
 *
 * Cả ba cách bố trí dùng CÙNG MỘT cây DOM, chỉ khác CSS. Dựng ba cây theo
 * `window.innerWidth` thì xoay ngang điện thoại giữa lúc đang gõ sẽ tháo và dựng
 * lại ô nhập — mất nội dung và mất tiêu điểm (`FE-06`).
 */
import { useState } from 'react';
import { ngay, tien, tyLe } from '../lib/format.js';
import { COT_TRUOC, COT_SAU, NHAN_TRANG_THAI, nhanCpbh } from '../lib/bang-cot.js';

export type DongSanPham = {
  id: string;
  /** Cần cho việc SỬA dòng: máy chủ nhận diện dòng theo sản phẩm, không theo id. */
  productId: string;
  productCode: string;
  productName: string;
  companyPrice: string;
  wholesalePrice: string;
  /** Các khoản chi phí bán hàng, số lượng tuỳ dòng. */
  cpbh: string[];
  cpbhTotal: string;
  netPrice: string;
  discountRate: string;
  threshold: string | null;
  overThreshold: boolean;
  /**
   * Ngưỡng của dòng này từ đâu ra (`0022`, `0023`).
   *
   * `KHONG_CO` nghĩa là **không có quy định chiết khấu nào phủ** sản phẩm này
   * với loại khách hàng của khách hàng — không phải lỗi, nhưng là thứ người
   * duyệt cần biết: dòng ấy không có ngưỡng nào để đối chiếu.
   *
   * `PRODUCT_DEFAULT` chỉ còn là nhãn LỊCH SỬ. Ngưỡng mặc định trên sản phẩm đã
   * bỏ ở `0025`, nên không dòng nào mang nhãn này nữa; những dòng cũ vẫn giữ nó
   * và vẫn phải hiện đúng.
   *
   * `null` là dòng lập trước 0022, không rõ nguồn — KHÔNG tô cảnh báo.
   */
  thresholdSource?: 'RULE' | 'PRODUCT_DEFAULT' | 'KHONG_CO' | null | undefined;
  /** Mã quy định đã cho ra ngưỡng. `null` khi không quy định nào khớp (`0024`). */
  ruleCode?: string | null | undefined;
  /** Ghi chú tự do của người lập cho riêng dòng này (`0027`). */
  note?: string | null | undefined;
  /** NGÀY ÁP DỤNG của riêng dòng này (`0180`) — cột đầu tiên của bảng. */
  ngayApDung?: string | null | undefined;
  /**
   * *Bổ sung* · *Chỉnh sửa* · *Đang áp dụng* so với CSBH bị thay thế (`0180`).
   *
   * MÁY CHỦ tính, giao diện chỉ vẽ: phép so nằm ở `SQL_TRANG_THAI_DONG` bên
   * `policy`, nơi có cả hai bản để đối chiếu. Suy lại ở đây thì phải kéo cả dòng
   * của bản trước về trình duyệt.
   */
  trangThai?: 'BO_SUNG' | 'CHINH_SUA' | 'DANG_AP_DUNG' | null | undefined;
  /** Tỷ lệ CK ở bản trước — CHỈ dòng *Chỉnh sửa* mới có (`0180`). */
  discountRateTruoc?: string | null | undefined;
};

/**
 * Lớp CSS của nhãn trạng thái — dùng lại ba khoá nhãn có sẵn (`0123`).
 *
 * *Bổ sung* và *Chỉnh sửa* là hai thứ người duyệt phải NHÌN vào; *Đang áp dụng*
 * là phần không đổi, nên nó lấy nhãn xám và lùi lại phía sau. Không đặt màu
 * riêng: bảng này đã có hai màu cảnh báo ở cột Tỷ lệ CK, và màu thứ ba cạnh
 * chúng sẽ tranh chỗ với đúng thứ cần nhìn nhất.
 */
export const lopTrangThai = (t: string): string =>
  t === 'BO_SUNG' ? 'nhan nhan-tot' : t === 'CHINH_SUA' ? 'nhan nhan-canh-bao' : 'nhan nhan-thuong';


/** Dòng KHÔNG có quy định chiết khấu nào phủ — dù có rơi về mặc định hay không. */
export const thieuQuyDinh = (d: DongSanPham): boolean =>
  d.thresholdSource === 'PRODUCT_DEFAULT' || d.thresholdSource === 'KHONG_CO';

/**
 * Lớp CSS của ô TỶ LỆ CK — không phải của cả dòng (`0027`).
 *
 * Trước đây cả dòng đổi nền. Đọc được, nhưng sai chỗ: nền phủ lên cả Giá bán
 * Công ty lẫn các khoản CPBH, những con số hoàn toàn bình thường, trong khi thứ
 * duy nhất đáng ngờ là **tỷ lệ chiết khấu**. Nền đỏ cả dòng còn làm mọi ô trên
 * dòng khó đọc hơn đúng lúc người duyệt cần đọc chúng kỹ nhất.
 *
 * Hai cảnh báo cùng đúng trên một dòng thì VƯỢT NGƯỠNG thắng về màu — nó là thứ
 * người duyệt phải xử lý. Cảnh báo kia không mất: dấu `?` cạnh con số nói ĐỦ CẢ
 * HAI lý do, và trình đọc màn hình cũng đọc đủ cả hai.
 */
export const lopTyLe = (d: DongSanPham): string =>
  ['ty-le', d.overThreshold ? 'vuot' : thieuQuyDinh(d) ? 'thieu' : '']
    .filter(Boolean)
    .join(' ');

/**
 * Câu giải thích hiện khi rê chuột vào dấu `?` (`0027`).
 *
 * Một câu ĐỦ NGHĨA chứ không phải một nhãn: người đọc nó đang hỏi "vì sao con số
 * này có màu", nên câu trả lời phải nói cả nguyên nhân lẫn hệ quả. Trả `undefined`
 * khi dòng bình thường — không có gì để hỏi thì không bày dấu hỏi.
 */
export const lyDoTyLe = (d: DongSanPham): string | undefined => {
  const phan: string[] = [];
  if (d.overThreshold) {
    phan.push(
      `Vượt ngưỡng: tỷ lệ chiết khấu ${tyLe(d.discountRate)} cao hơn ngưỡng ` +
        `${tyLe(d.threshold)} của quy định đang áp dụng. Hồ sơ vẫn gửi duyệt được.`,
    );
  }
  if (thieuQuyDinh(d)) {
    phan.push(
      d.thresholdSource === 'KHONG_CO'
        ? 'Không tìm thấy quy định chiết khấu nào áp dụng cho sản phẩm này với loại ' +
          'khách hàng của khách hàng này, nên dòng không có ngưỡng nào để đối chiếu.'
        : 'Không tìm thấy quy định chiết khấu nào áp dụng, ngưỡng lấy từ mặc định ' +
          'cũ khai trong danh mục sản phẩm.',
    );
  }
  return phan.length === 0 ? undefined : phan.join(' ');
};

// `COT_TRUOC` · `COT_SAU` dời sang `lib/bang-cot.ts` (`0172`) — xem lý do ở đó.
// `NHAN_TRANG_THAI` đi cùng đường ở `0180`, và vì đúng lý do ấy: ca đối chiếu
// hai bảng sống ở `tests/http/`, nơi `tsconfig` không bật `jsx`.
export { COT_TRUOC, COT_SAU, NHAN_TRANG_THAI, nhanCpbh } from '../lib/bang-cot.js';

/**
 * Số cột CPBH của cả bảng = dòng NHIỀU KHOẢN NHẤT.
 *
 * Một bảng phải có số cột đều nhau, nếu không thì không đọc theo hàng dọc được.
 * Cùng luật với bản in A4 (`sheet.ts:soCotCpbh`) — hai chỗ phải ra cùng một con
 * số, nếu không thì bản trên màn hình và bản ký tên khác nhau.
 */
export const soCotCpbh = (dong: readonly DongSanPham[]): number =>
  dong.reduce((max, d) => Math.max(max, d.cpbh?.length ?? 0), 0);

/** Nhãn đủ cho mọi cột, dựng theo số cột CPBH thật. Dùng cho test bố cục. */
export const cotCho = (dong: readonly DongSanPham[]) => [
  ...COT_TRUOC,
  ...Array.from({ length: soCotCpbh(dong) }, (_, i) => ({
    khoa: `cpbh${i + 1}`,
    nhan: nhanCpbh(i),
  })),
  ...COT_SAU,
];

/**
 * Ô Tỷ lệ CK: MÀU và dấu `?`, không có ký hiệu nào khác (`0028`).
 *
 * Bản trước đặt một dấu `!` trước con số và một hình thoi `◆` sau nó. Người dùng
 * yêu cầu bỏ cả hai: hai ký hiệu chen vào giữa một cột số làm con số hết thẳng
 * hàng, và trong một bảng tiền thì thế thẳng hàng của cột số chính là thứ giúp
 * dò nhanh.
 *
 * `FE-28` — "không bao giờ chỉ dùng màu" — VẪN ĐƯỢC GIỮ, chỉ đổi vật mang tin:
 *
 *   - Dấu `?` là ký hiệu nhìn thấy được, hiện đúng ở những dòng có màu và biến
 *     mất ở dòng bình thường. Ai không phân biệt được đỏ với vàng vẫn thấy nó,
 *     và `title` nói rõ đây là màu gì.
 *   - Hai câu `chi-doc-man-hinh` dưới đây không đổi — trình đọc màn hình đọc
 *     nguyên trạng thái của dòng mà không cần tới màu lẫn ký hiệu.
 *
 * Nói cách khác: `!` và `◆` là ký hiệu THỨ HAI cạnh một ký hiệu đã đủ việc.
 */
function OTyLe({ d }: { d: DongSanPham }) {
  const lyDo = lyDoTyLe(d);
  return (
    <span className={lopTyLe(d)}>
      {tyLe(d.discountRate)}
      {d.overThreshold && (
        <span className="chi-doc-man-hinh">
          {' '}
          vượt ngưỡng {tyLe(d.threshold)}
        </span>
      )}
      {/* Cùng một tình huống, HAI câu khác nhau: rơi về mặc định là còn một con
          số để đối chiếu, còn không có ngưỡng nào thì không. Người dùng trình
          đọc màn hình không thấy được sự khác biệt ấy qua màu. */}
      {thieuQuyDinh(d) && (
        <span className="chi-doc-man-hinh">
          {d.thresholdSource === 'KHONG_CO'
            ? ' chưa có quy định chiết khấu nào áp dụng, và sản phẩm cũng không có ngưỡng mặc định'
            : ' ngưỡng mặc định của sản phẩm, chưa có quy định chiết khấu nào áp dụng'}
        </span>
      )}
      {/*
        Dấu `?` — lý do đầy đủ, hiện khi rê chuột (`0027`).

        Là `<button>` chứ không phải `<span title>`: `title` chỉ hiện khi có
        CHUỘT. Trên điện thoại, và với người dùng bàn phím, một `span` mang
        `title` là một dấu hỏi không bao giờ trả lời được. Nút thì nhận được
        tiêu điểm, `aria-label` mang nguyên câu ấy, nên trình đọc màn hình và
        người dùng Tab đều tới được cùng một nội dung.

        Từ `0028` đây là ký hiệu nhìn thấy DUY NHẤT của ô này, nên nó cũng là thứ
        giữ `FE-28` — xem chú thích trên `OTyLe`.

        Không mở hộp thoại: câu trả lời dài hai dòng, và bắt người dùng đóng một
        hộp thoại để quay lại bảng là đắt hơn thứ họ vừa hỏi.
      */}
      {lyDo && (
        <button type="button" className="dau-hoi" title={lyDo} aria-label={lyDo}>
          ?
        </button>
      )}
    </span>
  );
}

/*
 * Chú thích màu — ĐÃ GỠ ở `0028`.
 *
 * Khối `<ul class="chu-thich-mau">` từng nằm dưới bảng, giải nghĩa hai màu và
 * cột QĐCK. Người dùng yêu cầu bỏ: nó chiếm bốn dòng chữ dưới MỌI hồ sơ, kể cả
 * hồ sơ không có dòng nào mang màu, và trên điện thoại thì đẩy nút thao tác
 * xuống dưới màn hình.
 *
 * Lời giải thích không mất theo — nó chuyển vào dấu `?` cạnh chính con số có
 * màu, tức là đúng chỗ người dùng đang nhìn khi họ thắc mắc. Cái mất đi là khả
 * năng đọc trước khi gặp; đổi lại là không phải đọc gì khi không cần.
 */

/**
 * Ô QĐCK — NGƯỠNG phần trăm, cộng dấu `?` mang MÃ quy định (`0180`).
 *
 * Khách hàng chốt 07/09: cột này bày *"số phần trăm chứ không hiển thị tên
 * QĐCK"*, và mã lui vào câu hiện khi rê chuột.
 *
 * Dấu `?` dựng y hệt dấu `?` của ô Tỷ lệ CK — `<button>` chứ không `<span
 * title>`, vì `title` chỉ hiện khi có CHUỘT và trên điện thoại nó là một dấu hỏi
 * không bao giờ trả lời được (`0027`). Bố cục thẻ ở cuối tệp cũng bày cả hai.
 *
 * BA TÌNH HUỐNG, ba kết quả khác nhau — và đó là lý do hàm này không phải một
 * biểu thức một dòng:
 *
 *   - có quy định, có ngưỡng → `12,00%` + dấu `?` mang mã;
 *   - có quy định mà KHÔNG có ngưỡng → không xảy ra (`threshold_source = 'RULE'`
 *     luôn kèm ngưỡng), nhưng nếu dữ liệu cũ rơi vào thì bày mã như trước còn
 *     hơn bày ô trống;
 *   - không quy định nào phủ → Ô TRỐNG, đúng như trước `0180`: ô Tỷ lệ CK bên
 *     trái đã đổi màu và mang dấu `?` nói đúng điều ấy rồi.
 */
export function OQuyDinh({ d }: { d: DongSanPham }) {
  if (!d.ruleCode) return null;
  const cau = `Quy định chiết khấu ${d.ruleCode}`;
  return (
    <>
      {d.threshold === null || d.threshold === undefined ? (
        <span className="ma-quy-dinh">{d.ruleCode}</span>
      ) : (
        tyLe(d.threshold)
      )}
      <button type="button" className="dau-hoi" title={cau} aria-label={cau}>
        ?
      </button>
    </>
  );
}

function CpbhGop({ d }: { d: DongSanPham }) {
  const [mo, datMo] = useState(false);
  const co = d.cpbh ?? [];
  return (
    <div className="cpbh-gop">
      <button
        type="button"
        className="cpbh-nut"
        aria-expanded={mo}
        onClick={() => datMo((x) => !x)}
      >
        <span>CPBH</span>
        <span className="so">{tien(d.cpbhTotal)}</span>
        <span className="mui-ten" aria-hidden="true">
          {mo ? '▲' : '▼'}
        </span>
      </button>
      {mo &&
        (co.length === 0 ? (
          <p className="ghi-chu">Dòng này không có khoản chi phí bán hàng nào.</p>
        ) : (
          <dl className="cpbh-chi-tiet">
            {co.map((v, i) => (
              <div key={i}>
                <dt>{nhanCpbh(i)}</dt>
                <dd className="so">{tien(v)}</dd>
              </div>
            ))}
          </dl>
        ))}
    </div>
  );
}

/**
 * `xoaDong` và `suaDong` chỉ truyền khi hồ sơ đang sửa được. Cột thao tác là cột THÊM VÀO,
 * không thay chỗ cột nào — chú thích đầu tệp cấm ẩn bớt cột, và bốn ô CPBH vẫn
 * là thứ quyết định giá thu về dù màn hình đang ở chế độ sửa.
 */
export function BangSanPham({
  dong,
  xoaDong,
  suaDong,
  dangXoa,
}: {
  dong: DongSanPham[];
  xoaDong?: ((id: string) => void) | undefined;
  /**
   * Sửa một dòng đã có.
   *
   * Trước đây chỉ có Xoá, nên đổi một con số nghĩa là xoá dòng rồi thêm lại từ
   * đầu — gõ lại cả giá bán buôn lẫn mọi khoản chi phí, và trong khoảng giữa hai
   * thao tác thì hồ sơ thiếu mất một sản phẩm.
   */
  suaDong?: ((d: DongSanPham) => void) | undefined;
  dangXoa?: string | null | undefined;
}) {
  const coThaoTac = xoaDong !== undefined || suaDong !== undefined;
  if (dong.length === 0) {
    return (
      <p className="trong">
        Hồ sơ chưa có dòng sản phẩm nào. Thêm sản phẩm để tính được tỷ lệ chiết khấu.
      </p>
    );
  }

  return (
    <>
      {/* ≥640px: bảng thật, cuộn ngang trong khung riêng ở 640–1023px. */}
      <div className="khung-cuon" role="region" aria-label="Bảng sản phẩm" tabIndex={0}>
        <table className="bang-san-pham">
          <thead>
            <tr>
              {cotCho(dong).map((c) => (
                <th key={c.khoa} className={c.khoa === 'productName' ? 'cot-khoa' : undefined}>
                  {c.nhan}
                </th>
              ))}
              {/* Tên cột ẩn khỏi mắt, giữ cho trình đọc màn hình (`0132`). */}
              {coThaoTac && (
                <th>
                  <span className="chi-doc-man-hinh">Thao tác</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {dong.map((d) => (
              <tr key={d.id}>
                <td className="ngay-ap-dung">{ngay(d.ngayApDung)}</td>
                <td>{d.productCode}</td>
                <th scope="row" className="cot-khoa">
                  {d.productName}
                </th>
                <td className="so">{tien(d.companyPrice)}</td>
                <td className="so">{tien(d.wholesalePrice)}</td>
                <td className="so">{tien(d.cpbhTotal)}</td>
                {/* Ô TRỐNG cho dòng ít khoản hơn, không phải số 0 — xem chú
                    thích đầu tệp. */}
                {Array.from({ length: soCotCpbh(dong) }, (_, k) => (
                  <td key={k} className="so">
                    {d.cpbh?.[k] === undefined ? '' : tien(d.cpbh[k])}
                  </td>
                ))}
                <td className="so">{tien(d.netPrice)}</td>
                <td className="so">
                  <OTyLe d={d} />
                </td>
                {/* Ô TRỐNG cho dòng không phải *Chỉnh sửa* — máy chủ đã quyết
                    định điều đó, xem `discountRateTruoc`. */}
                <td className="so">{d.discountRateTruoc ? tyLe(d.discountRateTruoc) : ''}</td>
                {/* `.so` chứ không `.ma-quy-dinh`: ô này giờ mang một con số
                    phần trăm (`0180`), và nó phải thẳng cột với hai cột tỷ lệ
                    bên trái. Kiểu chữ mã chỉ còn dùng cho nhánh lùi bên trong. */}
                <td className="so">
                  <OQuyDinh d={d} />
                </td>
                <td>
                  {d.trangThai && (
                    <span className={lopTrangThai(d.trangThai)}>
                      {NHAN_TRANG_THAI[d.trangThai] ?? d.trangThai}
                    </span>
                  )}
                </td>
                <td className="ghi-chu-dong">{d.note ?? ''}</td>
                {coThaoTac && (
                  /*
                    Rê chuột mới hiện (`0132`) — CHỈ ở vế BẢNG.

                    Danh sách thẻ ở cuối tệp này (bố cục điện thoại) không mang
                    lớp ấy: nút ở đó không nằm trong ô bảng nào nên luật
                    `tr:hover` không với tới, và điện thoại là màn hình cảm ứng —
                    `@media (hover: none)` vốn đã cho hiện luôn.
                  */
                  <td className="o-thao-tac-re-chuot">
                    {/* `nhom-nut-hang` giữ hai nút trên CÙNG MỘT HÀNG (`0124`).
                        `.nhom-nut-gon` cho phép xuống dòng, và trong một ô bảng
                        hẹp thì Sửa với Xoá xếp chồng lên nhau — đọc như hai
                        thao tác thuộc hai dòng khác nhau. */}
                    <div className="nhom-nut nhom-nut-gon nhom-nut-hang">
                      {suaDong && (
                        <button type="button" className="nut nut-nhe" onClick={() => suaDong(d)}>
                          Sửa
                        </button>
                      )}
                      {xoaDong && (
                        <button
                          type="button"
                          className="nut nut-canh-bao"
                          disabled={dangXoa === d.id}
                          onClick={() => xoaDong(d.id)}
                        >
                          Xoá
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* <640px: thẻ. Đủ MỌI cột, bốn ô CPBH gấp lại. */}
      <ul className="the-san-pham">
        {dong.map((d) => (
          <li key={d.id} className="the">
            <div className="the-dau">
              <span className="ma">{d.productCode}</span>
              <h3>{d.productName}</h3>
              {/* Trạng thái ở NGAY ĐẦU THẺ, không lẫn vào dải số: trên điện
                  thoại đây là thứ đọc lướt để biết dòng nào vừa đổi. */}
              {d.trangThai && (
                <span className={lopTrangThai(d.trangThai)}>
                  {NHAN_TRANG_THAI[d.trangThai] ?? d.trangThai}
                </span>
              )}
            </div>
            <dl className="the-so">
              <div>
                <dt>Ngày áp dụng</dt>
                <dd>{ngay(d.ngayApDung)}</dd>
              </div>
              <div>
                <dt>Giá bán Công ty</dt>
                <dd className="so">{tien(d.companyPrice)}</dd>
              </div>
              <div>
                <dt>Giá bán buôn</dt>
                <dd className="so">{tien(d.wholesalePrice)}</dd>
              </div>
              <div>
                <dt>Giá thu về</dt>
                <dd className="so">{tien(d.netPrice)}</dd>
              </div>
              <div>
                <dt>Tỷ lệ CK</dt>
                <dd className="so">
                  <OTyLe d={d} />
                </dd>
              </div>
              {/* Chỉ hiện khi CÓ. Bố trí thẻ dành cho màn hình hẹp nhất; một ô
                  rỗng mang nhãn "QĐCK" ở đó là một dòng chữ không nói gì. */}
              {/* Chỉ hiện khi dòng ĐÃ BỊ SỬA — với dòng khác thì tỷ lệ cũ bằng
                  đúng tỷ lệ mới ngay trên, hoặc không tồn tại. */}
              {d.discountRateTruoc && (
                <div>
                  <dt>Tỷ lệ CK cũ</dt>
                  <dd className="so">{tyLe(d.discountRateTruoc)}</dd>
                </div>
              )}
              {d.ruleCode && (
                <div>
                  <dt>QĐCK</dt>
                  <dd className="so">
                    <OQuyDinh d={d} />
                  </dd>
                </div>
              )}
              {/* Ghi chú chiếm CẢ BỀ NGANG của thẻ (`o-rong`): nó là câu chữ,
                  và một câu nhét vào nửa thẻ thì xuống dòng bốn lần. */}
              {d.note && (
                <div className="o-rong">
                  <dt>Ghi chú</dt>
                  <dd className="ghi-chu-dong">{d.note}</dd>
                </div>
              )}
            </dl>
            <CpbhGop d={d} />
            {coThaoTac && (
              <div className="nhom-nut nhom-nut-gon">
                {suaDong && (
                  <button type="button" className="nut nut-nhe" onClick={() => suaDong(d)}>
                    Sửa
                  </button>
                )}
                {xoaDong && (
                  <button
                    type="button"
                    className="nut nut-canh-bao"
                    disabled={dangXoa === d.id}
                    onClick={() => xoaDong(d.id)}
                  >
                    Xoá
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
