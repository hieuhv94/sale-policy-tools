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
import { Fragment, useEffect, useState } from 'react';
import { ngay, tien, tyLe } from '../lib/format.js';
import { COT_TRUOC, COT_SAU, NHAN_TRANG_THAI, nhanCpbh } from '../lib/bang-cot.js';

/*
 * SÁU TRƯỜNG NHẬN `null` TỪ `0187`.
 *
 * Bảng thôi là kết quả của một biểu mẫu đã điền xong; nó là **mặt bàn đang
 * soạn**, và một dòng vừa chèn chưa có sản phẩm, chưa có giá, nên chưa có gì để
 * chụp từ danh mục. Khai chúng nullable là bắt mọi chỗ đọc phải nói ra mình định
 * làm gì với ô trống — `tien(null)` và `tyLe(null)` đã trả chuỗi rỗng từ trước,
 * nên phần lớn chỗ dùng không đổi một chữ; chỗ nào đổi thì `tsc` chỉ ra.
 */
export type DongSanPham = {
  id: string;
  /** Cần cho việc SỬA dòng: máy chủ nhận diện dòng theo sản phẩm, không theo id. */
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  companyPrice: string | null;
  wholesalePrice: string | null;
  /** Các khoản chi phí bán hàng, số lượng tuỳ dòng. */
  cpbh: string[];
  cpbhTotal: string | null;
  netPrice: string | null;
  discountRate: string | null;
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
  trangThai?: 'BO_SUNG' | 'CHINH_SUA' | 'DANG_AP_DUNG' | 'DA_XOA' | null | undefined;
  /** Tỷ lệ CK ở bản trước — CHỈ dòng *Chỉnh sửa* mới có (`0180`). */
  discountRateTruoc?: string | null | undefined;
};

/**
 * Lớp CSS của nhãn trạng thái — dùng lại bốn khoá nhãn có sẵn (`0123`, `0187`).
 *
 * `0187` — khách hàng chốt 08/09: ***Đang áp dụng* XANH**, ***Đã xoá* XÁM**.
 *
 * `0180` đặt ngược lại, với lập luận *"Bổ sung và Chỉnh sửa là hai thứ người
 * duyệt phải NHÌN vào; Đang áp dụng là phần không đổi nên lùi lại phía sau"*.
 * Khách hàng đảo trục ấy: màu nói **tình trạng của mặt hàng**, không nói *"chỗ
 * nào đáng soi"* — xanh là đang bán bình thường, xám là sắp không còn. Cùng
 * quy ước với nhãn trạng thái SẢN PHẨM trong danh mục (`0123`), nên hai bảng
 * thôi nói hai thứ tiếng.
 *
 * BỐN TRẠNG THÁI, BỐN MÀU. *Đang áp dụng* lấy xanh thì *Bổ sung* phải rời khỏi
 * xanh, nếu không hai trạng thái khác hẳn nhau trông giống hệt nhau — khách
 * hàng không nêu màu cho nó, và đây là chỗ duy nhất còn tự do. Chọn `nhan-cho`
 * (chàm): nó là khoá nhãn thứ tư đã có sẵn trong `app.css`, và nó KHÔNG phải
 * một màu cảnh báo — *Bổ sung* không phải một điều đáng lo, nó chỉ là điều mới.
 * *Chỉnh sửa* giữ hổ phách.
 */
export const lopTrangThai = (t: string): string =>
  t === 'BO_SUNG'
    ? 'nhan nhan-cho'
    : t === 'CHINH_SUA'
      ? 'nhan nhan-canh-bao'
      : t === 'DA_XOA'
        ? 'nhan nhan-thuong'
        : 'nhan nhan-tot';

/**
 * Dòng TDV đã rút khỏi phiên bản này (`0186`).
 *
 * XUẤT RA vì ba chỗ hỏi cùng câu này — lớp làm mờ của hàng, dải nút, và ca kiểm
 * — và một phép so chuỗi lặp ba lần là ba chỗ sẽ lệch ngày trạng thái đổi tên.
 */
export const daXoa = (d: DongSanPham): boolean => d.trangThai === 'DA_XOA';


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
/**
 * Số cột CPBH của bảng = dòng NHIỀU KHOẢN NHẤT.
 *
 * `toiThieu` (`0187`) — lúc SOẠN THẲNG thì luôn ít nhất một cột. Không có nó thì
 * một hồ sơ mà mọi dòng đều chưa có khoản nào dựng ra **không cột CPBH nào**, và
 * ô bắt buộc *CPBH* không có chỗ nào để gõ lẫn chỗ nào để tô đỏ — người lập nhìn
 * thấy câu "còn thiếu CPBH" lúc gửi duyệt mà trên bảng không có ô ấy.
 */
export const soCotCpbh = (dong: readonly DongSanPham[], toiThieu = 0): number =>
  dong.reduce((max, d) => Math.max(max, d.cpbh?.length ?? 0), toiThieu);

/** Nhãn đủ cho mọi cột, dựng theo số cột CPBH thật. Dùng cho test bố cục. */
export const cotCho = (dong: readonly DongSanPham[], toiThieuCpbh = 0) => [
  ...COT_TRUOC,
  ...Array.from({ length: soCotCpbh(dong, toiThieuCpbh) }, (_, i) => ({
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

/** Một mục trong ô chọn sản phẩm của bảng soạn thẳng (`0187`). */
export type SanPhamChon = { id: string; code: string; name: string };

/**
 * BẢNG SOẠN THẲNG (`0187`) — truyền khi TDV đang sửa hồ sơ.
 *
 * Có prop này thì năm ô người dùng nhập biến thành ô nhập ngay trong bảng, và
 * hộp thoại *Thêm sản phẩm* biến mất — đó là cả yêu cầu khách hàng chốt 08/09.
 */
export type SoanDong = {
  sanPham: SanPhamChon[];
  /** Ghi MỘT ô. Khoá vắng mặt là giữ nguyên, `null` là xoá trống — xem `DongPatch`. */
  luuO: (lineId: string, o: Record<string, unknown>) => void;
  /** Chèn một dòng trống vào đúng vị trí này (đếm từ 0). */
  chenDong: (viTri: number) => void;
};

/**
 * BỐN Ô BẮT BUỘC, đúng bốn ô khách hàng kể tên (`0187`).
 *
 * XUẤT RA vì ba chỗ hỏi cùng câu hỏi này — ô nào tô đỏ, câu nhắc trên đầu bảng,
 * và ca kiểm — và vì nó phải khớp từng trường với chốt `LINE_INCOMPLETE` bên máy
 * chủ. Hai bên lệch nhau thì màn hình xanh mà nút Gửi duyệt trả 422, hoặc ngược
 * lại: ô đỏ mà hồ sơ vẫn đi được.
 *
 * `cpbh` tính là trống khi dòng KHÔNG CÓ KHOẢN NÀO — không phải khi một ô CPBH
 * lẻ nào đó rỗng. Số cột CPBH của bảng bằng dòng nhiều khoản nhất, nên dòng ít
 * khoản hơn luôn có mấy ô cuối để trống, và `0055` đã chốt rằng chúng là ô TRỐNG
 * chứ không phải số 0.
 */
export const oThieu = (d: DongSanPham): string[] =>
  [
    d.ngayApDung ? '' : 'ngayApDung',
    d.productId ? '' : 'productId',
    d.wholesalePrice ? '' : 'wholesalePrice',
    (d.cpbh?.length ?? 0) > 0 ? '' : 'cpbh',
  ].filter(Boolean);

/**
 * Ô NHẬP TRONG BẢNG — ghi khi RỜI Ô, không ghi theo từng phím.
 *
 * Gõ tới đâu gửi tới đó là mỗi con số một lượt gọi mạng, và một lượt gõ "90000"
 * thành năm lượt ghi trong đó bốn lượt ghi những con số người dùng chưa có ý
 * định lưu — `9`, `90`, `900`… mỗi lượt kéo theo một vòng sang danh mục để chụp
 * lại giá. Rời ô là ranh giới mà người dùng hiểu sẵn từ mọi bảng tính.
 *
 * Giữ trạng thái CỤC BỘ trong lúc gõ rồi đồng bộ lại khi giá trị từ máy chủ đổi:
 * đọc thẳng prop thì mỗi lượt tải lại hồ sơ sẽ giật con trỏ về cuối ô.
 */
function ONhap({
  giaTri,
  kieu,
  thieu,
  nhan,
  luu,
}: {
  giaTri: string;
  kieu: 'text' | 'date' | 'number';
  thieu?: boolean | undefined;
  nhan: string;
  luu: (v: string) => void;
}) {
  const [v, datV] = useState(giaTri);
  useEffect(() => datV(giaTri), [giaTri]);
  return (
    <input
      className={`o-bang${thieu ? ' o-thieu' : ''}`}
      type={kieu}
      inputMode={kieu === 'number' ? 'numeric' : undefined}
      value={v}
      aria-label={nhan}
      aria-invalid={thieu ? true : undefined}
      onChange={(e) => datV(e.target.value)}
      onBlur={() => {
        if (v !== giaTri) luu(v);
      }}
    />
  );
}

/**
 * Ô CHỌN SẢN PHẨM trong bảng, và luật khoá của nó (`0187`).
 *
 * KHOÁ Ở DÒNG THỪA KẾ (*Đang áp dụng* · *Chỉnh sửa*). Đổi sản phẩm của một dòng
 * đến từ CSBH đang hiệu lực là rút một mặt hàng của khách rồi thay bằng mặt hàng
 * khác **không để lại dấu vết nào** — đúng thứ `0186` dựng cả trạng thái *Đã
 * xoá* để chống. Đường đúng là rút dòng ấy (nó ở lại, làm mờ) rồi chèn dòng mới.
 *
 * Máy chủ chặn lại một lần nữa bằng `INHERITED_PRODUCT_LOCKED`: ô xám là để
 * người dùng khỏi thử, không phải để thay cho chốt chặn.
 */
function OSanPham({
  d,
  soan,
  thieu,
}: {
  d: DongSanPham;
  soan: SoanDong;
  thieu: boolean;
}) {
  const khoa = d.trangThai === 'DANG_AP_DUNG' || d.trangThai === 'CHINH_SUA';
  if (khoa) return <>{d.productName}</>;
  return (
    <select
      className={`o-bang${thieu ? ' o-thieu' : ''}`}
      value={d.productId ?? ''}
      aria-label="Sản phẩm"
      aria-invalid={thieu ? true : undefined}
      onChange={(e) => soan.luuO(d.id, { productId: e.target.value })}
    >
      <option value="">— chọn sản phẩm —</option>
      {soan.sanPham.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code} — {s.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Mảng CPBH sau khi sửa ô thứ `k`.
 *
 * XOÁ TRỐNG Ô CUỐI LÀ BỎ KHOẢN ẤY, không phải "khoản bằng rỗng": mảng này là
 * *các khoản chi phí của dòng*, và số cột của bảng suy từ dòng dài nhất. Nếu ô
 * cuối bị xoá mà mảng vẫn giữ độ dài thì bảng mọc thêm một cột trống vĩnh viễn.
 *
 * Xoá một ô Ở GIỮA thì ngược lại — nó thành `0`, vì bỏ hẳn sẽ dồn mọi khoản phía
 * sau lên một bậc và đổi ý nghĩa của chúng.
 */
export const cpbhMoi = (cu: string[], k: number, v: string): string[] => {
  const ra = Array.from({ length: Math.max(cu.length, k + 1) }, (_, i) => cu[i] ?? '0');
  ra[k] = v.trim();
  while (ra.length > 0 && ra[ra.length - 1] === '') ra.pop();
  return ra.map((x) => x || '0');
};

/**
 * DẤU CỘNG GIỮA HAI DÒNG (`0187`).
 *
 * Khách hàng chốt 08/09: *"nút thêm dòng có thể để dưới dạng dấu cộng ở giữa 2
 * dòng để có thể thêm vào bất kỳ dòng nào"*. Nên đây là một hàng THẬT của bảng
 * chứ không phải một nút trôi nổi — nó phải nằm đúng khe giữa hai dòng, và phải
 * đi theo khi bảng cuộn ngang.
 *
 * Tên có nghĩa cho trình đọc màn hình: mười cái nút cùng mang chữ *"+"* thì
 * người dùng bàn phím nghe được mười lần cùng một từ và không biết mình đang ở
 * khe nào. `aria-label` nói ra vị trí.
 *
 * `soCot` bỏ trống là dựng ngoài bảng (lúc hồ sơ chưa có dòng nào) — một `<tr>`
 * lạc ngoài `<table>` thì trình duyệt gỡ bỏ, và cái nút biến mất cùng nó.
 */
function HangChen({
  viTri,
  chen,
  soCot,
}: {
  viTri: number;
  chen: (v: number) => void;
  soCot?: number | undefined;
}) {
  const nut = (
    <button
      type="button"
      className="nut-chen"
      onClick={() => chen(viTri)}
      aria-label={`Chèn dòng sản phẩm vào vị trí ${viTri + 1}`}
    >
      <span aria-hidden="true">+</span>
    </button>
  );
  if (soCot === undefined) return <div className="hang-chen">{nut}</div>;
  return (
    <tr className="hang-chen">
      <td colSpan={soCot}>{nut}</td>
    </tr>
  );
}

type ThaoTacDong = {
  xoaDong?: ((id: string) => void) | undefined;
  suaDong?: ((d: DongSanPham) => void) | undefined;
  themLaiDong?: ((id: string) => void) | undefined;
  dangXoa?: string | null | undefined;
};

/**
 * Dải nút của MỘT dòng — một bản dựng cho cả bảng lẫn thẻ điện thoại (`0186`).
 *
 * Trước lượt này hai chỗ chép nhau nguyên khối bốn dòng JSX. Chấp nhận được khi
 * dải nút chỉ có hai nút luôn hiện; lượt này nó mọc một nhánh điều kiện — dòng
 * đã rút bày *Thêm lại* thay cho *Sửa* và *Xoá* — và một nhánh điều kiện chép
 * hai chỗ là chỗ mà bản điện thoại sẽ tụt lại, không ai thấy, vì hai bố cục
 * không bao giờ hiện cùng lúc trên một màn hình.
 *
 * `hang` chỉ khác một lớp CSS: trong ô bảng hẹp thì `.nhom-nut-gon` cho hai nút
 * xếp chồng lên nhau, đọc như hai thao tác của hai dòng khác nhau (`0124`).
 *
 * DÒNG ĐÃ RÚT KHÔNG CÒN *Sửa* lẫn *Xoá*: sửa một dòng sắp biến mất là ghi những
 * con số không đi tới đâu, còn *Xoá* thì máy chủ đã trả `LINE_NOT_FOUND` —
 * bày một cái nút chỉ để nhận về lỗi là bày một cái bẫy.
 */
function NutDong({
  d,
  hang,
  xoaDong,
  suaDong,
  themLaiDong,
  dangXoa,
}: { d: DongSanPham; hang?: boolean } & ThaoTacDong) {
  const lop = `nhom-nut nhom-nut-gon${hang ? ' nhom-nut-hang' : ''}`;
  if (daXoa(d)) {
    return (
      <div className={lop}>
        {themLaiDong && (
          <button
            type="button"
            className="nut nut-nhe"
            disabled={dangXoa === d.id}
            onClick={() => themLaiDong(d.id)}
          >
            Thêm lại
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={lop}>
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
  themLaiDong,
  dangXoa,
  soan,
}: {
  dong: DongSanPham[];
  xoaDong?: ((id: string) => void) | undefined;
  /**
   * THÊM LẠI một dòng đã rút (`0186`) — truyền cùng lúc với `xoaDong`, tức chỉ
   * khi hồ sơ đang sửa được, đúng hai trạng thái khách hàng chốt.
   */
  themLaiDong?: ((id: string) => void) | undefined;
  /**
   * Sửa một dòng đã có.
   *
   * Trước đây chỉ có Xoá, nên đổi một con số nghĩa là xoá dòng rồi thêm lại từ
   * đầu — gõ lại cả giá bán buôn lẫn mọi khoản chi phí, và trong khoảng giữa hai
   * thao tác thì hồ sơ thiếu mất một sản phẩm.
   */
  suaDong?: ((d: DongSanPham) => void) | undefined;
  dangXoa?: string | null | undefined;
  /**
   * BẢNG SOẠN THẲNG (`0187`) — có prop này thì năm ô người dùng nhập thành ô
   * nhập ngay trong bảng, và giữa hai dòng mọc ra một dấu cộng.
   */
  soan?: SoanDong | undefined;
}) {
  // `themLaiDong` tính vào đây (`0186`): một hồ sơ mà mọi dòng đều đã rút thì
  // hai prop kia vẫn được truyền, nhưng nếu ngày nào đó chỉ còn nút Thêm lại thì
  // thiếu vế này là cột thao tác biến mất cùng với lối thoát duy nhất của dòng.
  const coThaoTac =
    xoaDong !== undefined || suaDong !== undefined || themLaiDong !== undefined;
  // Hàng dấu cộng trải HẾT bề ngang bảng. Đếm từ chính danh sách cột đang dựng
  // chứ không ghim một con số: `cotCho` nở ra theo số khoản CPBH của hồ sơ, nên
  // một hằng gõ tay ở đây sẽ lệch đúng ở những hồ sơ nhiều khoản nhất.
  // MỘT con số cho cả tiêu đề lẫn ô, nếu không thì hàng lệch cột đúng ở chế độ
  // soạn — và bảng lệch cột là thứ người ký đối chiếu nhầm.
  const soCpbh = soCotCpbh(dong, soan ? 1 : 0);
  const cot = cotCho(dong, soan ? 1 : 0);
  const soCot = cot.length + (coThaoTac ? 1 : 0);
  if (dong.length === 0) {
    return (
      <>
        <p className="trong">
          Hồ sơ chưa có dòng sản phẩm nào. Thêm sản phẩm để tính được tỷ lệ chiết khấu.
        </p>
        {/* Bảng rỗng vẫn phải có ĐÚNG MỘT dấu cộng (`0187`): không có nó thì
            người lập không có đường nào thêm dòng đầu tiên — hộp thoại *Thêm
            sản phẩm* đã bỏ. */}
        {soan && <HangChen viTri={0} chen={soan.chenDong} />}
      </>
    );
  }

  return (
    <>
      {/* ≥640px: bảng thật, cuộn ngang trong khung riêng ở 640–1023px. */}
      <div className="khung-cuon" role="region" aria-label="Bảng sản phẩm" tabIndex={0}>
        <table className="bang-san-pham">
          <thead>
            <tr>
              {cot.map((c) => (
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
            {dong.map((d, i) => {
              // Dòng đã rút KHÔNG soạn được — xem chú thích ở khối ô bên dưới.
              const soanDuoc = soan !== undefined && !daXoa(d);
              const thieu = soanDuoc ? oThieu(d) : [];
              return (
            <Fragment key={d.id}>
              {/* Dấu cộng TRƯỚC mỗi dòng: khe thứ i chèn vào đúng vị trí i. */}
              {soan && <HangChen viTri={i} chen={soan.chenDong} soCot={soCot} />}
              {/*
                Dòng đã rút LÀM MỜ chứ không ẩn (`0186`) — cả điểm của việc giữ
                nó lại là người duyệt NHÌN THẤY mặt hàng đang bị lấy đi. Lớp
                nằm trên `<tr>`, không trên từng ô: mờ nửa hàng thì trông như
                một lỗi dựng trang chứ không như một trạng thái.
              */}
              <tr className={daXoa(d) ? 'dong-da-xoa' : undefined}>
                {/*
                  SOẠN THẲNG (`0187`) — năm ô người dùng nhập thành ô nhập ngay
                  tại chỗ. Dòng ĐÃ RÚT thì không: mọi con số của nó sắp biến mất
                  khỏi hồ sơ, nên sửa chúng là ghi những thứ không đi tới đâu.

                  Ba cột `companyPrice` · `netPrice` · `discountRate` KHÔNG bao
                  giờ thành ô nhập: chúng đến từ danh mục hoặc từ phép tính, và
                  cho gõ vào đó là mời người dùng ghi đè một con số mà cả hệ
                  thống đang dựa vào (`0029`).
                */}
                {soanDuoc ? (
                  <>
                    <td className="ngay-ap-dung">
                      <ONhap
                        giaTri={d.ngayApDung?.slice(0, 10) ?? ''}
                        kieu="date"
                        nhan="Ngày áp dụng"
                        thieu={thieu.includes('ngayApDung')}
                        luu={(v) => soan.luuO(d.id, { ngayApDung: v })}
                      />
                    </td>
                    <td>{d.productCode}</td>
                    <th scope="row" className="cot-khoa">
                      <OSanPham d={d} soan={soan} thieu={thieu.includes('productId')} />
                    </th>
                    <td className="so">{tien(d.companyPrice)}</td>
                    <td className="so">
                      <ONhap
                        giaTri={d.wholesalePrice ?? ''}
                        kieu="number"
                        nhan="Giá bán buôn"
                        thieu={thieu.includes('wholesalePrice')}
                        luu={(v) => soan.luuO(d.id, { wholesalePrice: v })}
                      />
                    </td>
                    <td className="so">{tien(d.cpbhTotal)}</td>
                    {Array.from({ length: soCpbh }, (_, k) => (
                      <td key={k} className="so">
                        <ONhap
                          giaTri={d.cpbh?.[k] ?? ''}
                          kieu="number"
                          nhan={nhanCpbh(k)}
                          // CHỈ Ô ĐẦU tô đỏ khi trống — xem `oThieu`. Ô thứ hai
                          // trở đi của một dòng ít khoản hơn là ô KHÔNG THUỘC
                          // dòng ấy, không phải một ô bỏ quên.
                          thieu={k === 0 && thieu.includes('cpbh')}
                          luu={(v) => soan.luuO(d.id, { cpbh: cpbhMoi(d.cpbh, k, v) })}
                        />
                      </td>
                    ))}
                  </>
                ) : (
                  <>
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
                    {Array.from({ length: soCpbh }, (_, k) => (
                      <td key={k} className="so">
                        {d.cpbh?.[k] === undefined ? '' : tien(d.cpbh[k])}
                      </td>
                    ))}
                  </>
                )}
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
                <td className="ghi-chu-dong">
                  {/* Ghi chú soạn thẳng như bốn ô kia, nhưng KHÔNG bắt buộc:
                      khách hàng kể tên bốn trường, và ghi chú không nằm trong
                      đó — nó vốn là ô tự do (`0027`). */}
                  {soanDuoc ? (
                    <ONhap
                      giaTri={d.note ?? ''}
                      kieu="text"
                      nhan="Ghi chú"
                      luu={(v) => soan.luuO(d.id, { note: v })}
                    />
                  ) : (
                    (d.note ?? '')
                  )}
                </td>
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
                    <NutDong
                      d={d}
                      hang
                      {...{ xoaDong, suaDong, themLaiDong, dangXoa }}
                    />
                  </td>
                )}
              </tr>
            </Fragment>
              );
            })}
            {/* Khe CUỐI BẢNG — nếu không có nó thì mọi dấu cộng đều chèn TRƯỚC
                một dòng đã có, và không có đường nào nối thêm vào cuối. */}
            {soan && <HangChen viTri={dong.length} chen={soan.chenDong} soCot={soCot} />}
          </tbody>
        </table>
      </div>

      {/* <640px: thẻ. Đủ MỌI cột, bốn ô CPBH gấp lại. */}
      <ul className="the-san-pham">
        {dong.map((d) => (
          <li key={d.id} className={daXoa(d) ? 'the dong-da-xoa' : 'the'}>
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
              <NutDong d={d} {...{ xoaDong, suaDong, themLaiDong, dangXoa }} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
