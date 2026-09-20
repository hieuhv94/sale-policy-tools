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
import { Fragment, useState } from 'react';
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
  trangThai?: 'BO_SUNG' | 'CHINH_SUA' | 'DANG_AP_DUNG' | 'DA_XOA' | null | undefined;
  /** Tỷ lệ CK ở bản trước — CHỈ dòng *Chỉnh sửa* mới có (`0180`). */
  discountRateTruoc?: string | null | undefined;
  /**
   * Dòng này TRƯỚC KHI bị sửa — CHỈ dòng *Chỉnh sửa* (`0213`, thay `0204`).
   *
   * MÁY CHỦ quyết định có trả hay không, cùng ba vế gác với `discountRateTruoc`
   * (`SQL_BAN_TRUOC_TRA_VE`). Giao diện KHÔNG suy từ `trangThai === 'CHINH_SUA'`:
   * làm thế là dựng lại phép so ở chỗ thứ hai, và hai chỗ sẽ có ngày nói khác
   * nhau về cùng một dòng.
   *
   * `null` với mọi dòng khác. Máy chủ cũ hơn giao diện thì trường vắng mặt —
   * `banTruocCua()` đọc bằng phép kiểm HÌNH DẠNG chứ không tin khai báo kiểu,
   * đúng bẫy `0198` (`layJson<T>` là một LỜI HỨA, không phải phép kiểm).
   */
  banTruoc?: BanTruocDong | null | undefined;
};

/** Khoá của những ô bảng chi tiết bày ra, đúng thứ tự đọc (`0213`). */
export const O_BAN_TRUOC = [
  'ngayApDung',
  'companyPrice',
  'wholesalePrice',
  'cpbh',
  'cpbhTotal',
  'netPrice',
  'discountRate',
  'threshold',
  'note',
] as const;

export type OBanTruoc = (typeof O_BAN_TRUOC)[number];

/**
 * Dòng ở bản trước, kèm danh sách ô đã đổi (`0213`).
 *
 * `doi` đến TỪ MÁY CHỦ chứ không do giao diện so hai bên: phép so chạy trên kiểu
 * dữ liệu thật của Postgres (`IS DISTINCT FROM` trên `numeric`, `date`, `text[]`),
 * nên `615000` và `615000.00` là MỘT. So bằng chuỗi ở trình duyệt thì hai giá
 * trị ấy khác nhau, và ô bôi vàng nói dối ở đúng chỗ không ai kiểm lại được.
 */
export type BanTruocDong = {
  [K in OBanTruoc]?: string | string[] | null;
} & { doi?: string[] | null };

/**
 * Bản trước của một dòng, đọc AN TOÀN từ thân phản hồi (`0213`).
 *
 * Kiểm HÌNH DẠNG chứ không tin khai báo kiểu: `banTruoc` đến từ thân phản hồi,
 * và một khai báo TypeScript là LỜI HỨA chứ không phải phép kiểm (bẫy `0198`).
 * Máy chủ cũ hơn giao diện thì trường vắng mặt, và lúc ấy một lượt đọc `.doi`
 * ném ngay trong lượt dựng bảng — React tháo cả cây và trang hồ sơ trắng, vì
 * một thứ chỉ là phần trang trí của một ô.
 */
export const banTruocCua = (d: DongSanPham): BanTruocDong | null =>
  d.banTruoc !== null && typeof d.banTruoc === 'object' && !Array.isArray(d.banTruoc)
    ? d.banTruoc
    : null;

/** Những ô máy chủ báo là ĐÃ ĐỔI — rỗng nếu thân phản hồi không mang danh sách. */
export const oDaDoi = (b: BanTruocDong): string[] => (Array.isArray(b.doi) ? b.doi : []);

/**
 * TÊN Ô trong bảng chi tiết = TIÊU ĐỀ CỘT của chính bảng sản phẩm (`0204`).
 *
 * Không phải một danh sách nhãn thứ hai gõ tay: người dùng bấm vào nhãn *Chỉnh
 * sửa* rồi đọc một dòng tên trường, và mắt họ đang ở ngay cạnh hàng tiêu đề của
 * bảng. Hai chữ khác nhau cho cùng một ô — *"Giá bán Công ty"* ở trên và *"Giá
 * CT"* ở dưới — bắt người đọc tự ghép, đúng thứ `0172` đã đi sửa một lượt cho
 * hai bảng.
 *
 * Hai khoá lệch tên và cả hai đều có lý do: ô `cpbh` bày CẢ MẢNG còn cột bày
 * tổng của nó tên `cpbhTotal`; ô `threshold` là con số cột `ruleCode` bày ra từ
 * `0180` (mã quy định lui vào `title`).
 */
const COT_CUA_O: Record<OBanTruoc, string> = {
  ngayApDung: 'ngayApDung',
  companyPrice: 'companyPrice',
  wholesalePrice: 'wholesalePrice',
  cpbh: 'cpbhTotal',
  cpbhTotal: 'cpbhTotal',
  netPrice: 'netPrice',
  discountRate: 'discountRate',
  threshold: 'ruleCode',
  note: 'note',
};

export const nhanOBanTruoc = (o: OBanTruoc): string =>
  [...COT_TRUOC, ...COT_SAU].find((c) => c.khoa === COT_CUA_O[o])?.nhan ?? o;

/**
 * Đọc một giá trị của bảng chi tiết ra chữ.
 *
 * Máy chủ giữ nguyên văn con số nó đã đem so; cách đọc là việc của màn hình —
 * cùng phân công với `Lech.doc()` (`0050`).
 *
 * CPBH nối bằng dấu cộng chứ không cộng lại thành một số: hai mảng khác nhau vẫn
 * có thể cùng tổng (`[5000]` → `[3000, 2000]`), và khi ấy một ô *"CPBH 5.000"*
 * giấu mất đúng thứ vừa đổi.
 *
 * `—` cho giá trị trống, KHÔNG bỏ trống ô: một ô rỗng thì người đọc không phân
 * biệt được *"ghi chú vừa bị xoá"* với *"chỗ này chưa dựng xong"*.
 */
export const docOBanTruoc = (o: OBanTruoc, v: string | string[] | null | undefined): string => {
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.map((x) => tien(x)).join(' + ');
  if (v === null || v === undefined || v === '') return '—';
  if (o === 'ngayApDung') return ngay(v);
  if (o === 'note') return v;
  if (o === 'discountRate' || o === 'threshold') return tyLe(v);
  return tien(v);
};

/**
 * Dòng TDV đã rút khỏi phiên bản này (`0186`).
 *
 * XUẤT RA vì ba chỗ hỏi cùng câu này — lớp làm mờ của hàng, dải nút, và ca kiểm
 * — và một phép so chuỗi lặp ba lần là ba chỗ sẽ lệch ngày trạng thái đổi tên.
 */
export const daXoa = (d: DongSanPham): boolean => d.trangThai === 'DA_XOA';

/**
 * Lớp CSS của nhãn trạng thái — dùng lại bốn khoá nhãn có sẵn (`0123`, `0188`).
 *
 * `0188` — khách hàng chốt 08/09: ***Đang áp dụng* XANH**, ***Đã xoá* XÁM**.
 *
 * `0180` đặt ngược lại, và lập luận của nó vẫn đọc được ở đây vì nó KHÔNG sai:
 * *"Bổ sung và Chỉnh sửa là hai thứ người duyệt phải NHÌN vào; Đang áp dụng là
 * phần không đổi nên lùi lại phía sau"*. Màu ở đó trả lời câu *"chỗ nào đáng
 * soi"*.
 *
 * Khách hàng đảo TRỤC ấy: màu nói **tình trạng của mặt hàng** — xanh là đang bán
 * bình thường, xám là sắp không còn. Đó cũng là quy ước mà nhãn trạng thái SẢN
 * PHẨM trong danh mục đã dùng từ `0123` (xanh = *Đang áp dụng*, đỏ = *Đã vô hiệu
 * hoá*), nên hai bảng thôi nói hai thứ tiếng về cùng một chữ.
 *
 * BỐN TRẠNG THÁI, BỐN MÀU — và vế này là HỆ QUẢ, khách hàng không nêu. *Đang áp
 * dụng* lấy xanh thì *Bổ sung* buộc phải rời khỏi xanh, nếu không hai trạng thái
 * khác hẳn nhau trông giống hệt nhau. Nó là chỗ duy nhất còn tự do, và chọn
 * `nhan-cho` (chàm) vì đó là khoá nhãn thứ tư đã có sẵn trong `app.css` và vì nó
 * KHÔNG phải một màu cảnh báo — *Bổ sung* không đáng lo, nó chỉ là điều mới.
 * *Chỉnh sửa* giữ hổ phách.
 *
 * `0180` lo rằng thêm màu sẽ tranh chỗ với hai màu cảnh báo ở cột Tỷ lệ CK. Nỗi
 * lo ấy có thật và không mất; cái đổi là ai được ưu tiên: khách hàng chọn cho
 * cột trạng thái nói đủ bốn trạng thái, và hai màu kia vẫn giữ nguyên chỗ của
 * chúng ở một cột khác.
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
 * Nhãn trạng thái — và là NÚT khi dòng có bản trước để mở ra (`0204`, `0213`).
 *
 * Khách hàng chốt 12/09: nhãn **không mang thêm chữ nào**, chỉ thêm thao tác bấm.
 * Nên chữ giữ nguyên đúng `NHAN_TRANG_THAI` (cũng là bảng chữ dùng chung với bản
 * in), và thứ thêm vào là mũi tên — một dấu hiệu bấm được, không phải một mẩu
 * tin. Thiếu nó thì không ai biết nhãn ấy bấm được, và cả tính năng thành vô
 * hình.
 *
 * Dòng KHÔNG có bản trước thì nhãn là một `<span>` như cũ, không phải một nút bị
 * vô hiệu hoá: một nút bấm không làm gì là lời mời bấm rồi tự hỏi mình vừa làm
 * sai ở đâu.
 *
 * Câu cho trình đọc màn hình là BẮT BUỘC, không phải phần thêm: tên khả truy cập
 * của nút mà chỉ có chữ *Chỉnh sửa* thì người dùng bàn phím nghe được một nhãn
 * trạng thái và không biết bấm vào sẽ ra gì. `0213` đổi câu ấy theo nội dung mới
 * — bảng giờ bày cả dòng ở bản trước, không chỉ những chỗ đã đổi.
 */
function NhanTrangThai({ d, mo, bat }: { d: DongSanPham; mo: boolean; bat: () => void }) {
  if (!d.trangThai) return null;
  const nhan = (
    <span className={lopTrangThai(d.trangThai)}>
      {NHAN_TRANG_THAI[d.trangThai] ?? d.trangThai}
    </span>
  );
  if (banTruocCua(d) === null) return nhan;
  return (
    <button type="button" className="nhan-mo" aria-expanded={mo} onClick={bat}>
      {nhan}
      <span className="chi-doc-man-hinh"> — xem thông tin ở phiên bản trước</span>
      <span className="mui-ten" aria-hidden="true">
        {mo ? '▲' : '▼'}
      </span>
    </button>
  );
}

/**
 * HÀNG *bản trước*, khớp TỪNG CỘT với hàng ngay trên nó (`0214`, chốt 20/09).
 *
 * `0213` bày bản trước thành một bảng dọc *nhãn — giá trị*. Khách hàng xem xong
 * bảo *"hiển thị theo hàng ngang, đúng theo từng cột như dòng ở trên"* — và họ
 * đúng ở một điểm bảng dọc không làm được: **so hai con số cùng cột thì mắt chỉ
 * cần đi thẳng xuống**, còn bảng dọc bắt người đọc tìm lại tên trường rồi mới
 * bắc ngang sang hàng trên.
 *
 * VÌ SAO PHẢI KỂ ĐỦ MỌI Ô, kể cả ô để trống: hàng này là một `<tr>` thật trong
 * cùng một `<table>`, nên số ô của nó phải bằng số cột — thiếu một ô là mọi ô
 * sau đó lệch sang trái một cột, và người đọc so nhầm hai con số nằm cạnh nhau.
 * Thứ tự dưới đây chép đúng thứ tự hàng chính; hai chỗ phải sửa cùng nhau, và
 * `tests/web/bang-san-pham.test.tsx` canh chuyện đó bằng cách đếm ô.
 *
 * BA Ô CỐ Ý ĐỂ TRỐNG:
 *
 *   * *Tên sản phẩm* — cùng một mặt hàng, lặp lại tên là một dòng nhiễu;
 *   * *Tỷ lệ CK cũ* — bản trước không có "bản trước của chính nó" trong khung
 *     nhìn này, và điền gì vào đó cũng là bịa;
 *   * *Trạng thái* — nhãn của hàng này là chữ *Bản trước* ở ô mã, không phải một
 *     trạng thái của máy trạng thái.
 *
 * TỶ LỆ CK vẽ TRƠN, không mượn `OTyLe`: màu đỏ vượt ngưỡng và dấu `?` của `0027`
 * nói *"dòng này cần bạn xử lý"* — một câu về HIỆN TẠI. Tô nó trên một con số
 * lịch sử là gọi người duyệt đi xử lý một việc đã xong.
 */
function HangBanTruoc({
  b,
  soCpbh,
  coThaoTac,
}: {
  b: BanTruocDong;
  soCpbh: number;
  coThaoTac: boolean;
}) {
  const doi = oDaDoi(b);
  /** Một ô mang giá trị của bản trước, bôi vàng khi máy chủ báo ô ấy đã đổi. */
  const o = (khoa: OBanTruoc, lop = 'so') => (
    <td className={lop} {...(doi.includes(khoa) ? { 'data-doi': '1' } : {})}>
      {docOBanTruoc(khoa, b[khoa])}
    </td>
  );
  return (
    <tr className="hang-ban-truoc">
      {o('ngayApDung', 'ngay-ap-dung')}
      <th scope="row" className="cot-khoa nhan-ban-truoc">
        Bản trước
      </th>
      <td />
      {o('companyPrice')}
      {o('wholesalePrice')}
      {o('cpbhTotal')}
      {Array.from({ length: soCpbh }, (_, k) => {
        const ds = Array.isArray(b.cpbh) ? b.cpbh : [];
        return (
          <td key={k} className="so" {...(doi.includes('cpbh') ? { 'data-doi': '1' } : {})}>
            {ds[k] === undefined ? '' : tien(ds[k])}
          </td>
        );
      })}
      {o('netPrice')}
      {o('discountRate')}
      <td />
      {o('threshold')}
      <td />
      {o('note', 'ghi-chu-dong')}
      {coThaoTac && <td />}
    </tr>
  );
}

/**
 * Bảng *"trước khi sửa, dòng này trông thế nào"* (`0213`).
 *
 * BÀY CẢ TÁM Ô, kể cả ô không đổi — đó là khác biệt với `0204`, vốn chỉ liệt kê
 * trường đã đổi. Câu hỏi đổi từ *"đổi những gì"* sang *"trước đó thế nào"*, và
 * câu sau chỉ đọc được khi có đủ ngữ cảnh: một mình dòng *"Giá bán buôn
 * 520.000"* không nói được tỷ lệ chiết khấu khi ấy là bao nhiêu.
 *
 * Ô ĐÃ ĐỔI bôi vàng, và danh sách ấy đến TỪ MÁY CHỦ (`oDaDoi`) chứ không do đây
 * so hai bên — xem `BanTruocDong`.
 */
function BangBanTruoc({ b }: { b: BanTruocDong }) {
  const doi = oDaDoi(b);
  return (
    <table className="bang-ban-truoc">
      <caption>Thông tin ở phiên bản trước — ô bôi vàng là ô đã đổi</caption>
      <tbody>
        {O_BAN_TRUOC.map((o) => (
          <tr key={o} {...(doi.includes(o) ? { 'data-doi': '1' } : {})}>
            <th scope="row">{nhanOBanTruoc(o)}</th>
            <td className={o === 'note' ? undefined : 'so'}>{docOBanTruoc(o, b[o])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


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
}) {
  // `themLaiDong` tính vào đây (`0186`): một hồ sơ mà mọi dòng đều đã rút thì
  // hai prop kia vẫn được truyền, nhưng nếu ngày nào đó chỉ còn nút Thêm lại thì
  // thiếu vế này là cột thao tác biến mất cùng với lối thoát duy nhất của dòng.
  const coThaoTac =
    xoaDong !== undefined || suaDong !== undefined || themLaiDong !== undefined;

  /*
    Dòng nào đang MỞ bảng chi tiết thay đổi (`0204`).

    Một tập chứ không một id: hai dòng cùng đổi giá là chuyện thường, và người
    duyệt mở cả hai ra để so. Đóng dòng này khi mở dòng kia là bắt họ bấm đi bấm
    lại giữa hai hàng cách nhau nửa màn hình.

    Đặt ở ĐÂY chứ không trong từng hàng: bảng và danh sách thẻ là hai bố cục của
    CÙNG một dữ liệu, chỉ khác bề rộng màn hình — giữ hai tập trạng thái là để
    cửa sổ co lại một chút thì thứ đang mở đóng sập lại.
  */
  const [dangMo, datDangMo] = useState<readonly string[]>([]);
  const batMo = (id: string) =>
    datDangMo((cu) => (cu.includes(id) ? cu.filter((x) => x !== id) : [...cu, id]));
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
              /*
                Dòng đã rút LÀM MỜ chứ không ẩn (`0186`) — cả điểm của việc giữ
                nó lại là người duyệt NHÌN THẤY mặt hàng đang bị lấy đi. Lớp
                nằm trên `<tr>`, không trên từng ô: mờ nửa hàng thì trông như
                một lỗi dựng trang chứ không như một trạng thái.
              */
              <Fragment key={d.id}>
              <tr className={daXoa(d) ? 'dong-da-xoa' : undefined}>
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
                  <NhanTrangThai
                    d={d}
                    mo={dangMo.includes(d.id)}
                    bat={() => batMo(d.id)}
                  />
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
                    <NutDong
                      d={d}
                      hang
                      {...{ xoaDong, suaDong, themLaiDong, dangXoa }}
                    />
                  </td>
                )}
              </tr>
              {/*
                HÀNG CHI TIẾT, chèn NGAY DƯỚI hàng của chính nó (`0204`).

                `colSpan` phải phủ đủ mọi cột, kể cả dải CPBH co giãn theo dữ
                liệu và cột thao tác chỉ có ở vài vai trò — thiếu một cột thì
                hàng chi tiết ngắn hơn bảng và trình duyệt đẻ thêm một ô trống ở
                mép phải, đúng chỗ mắt đang dò theo cột dọc.

                Một hàng riêng chứ không phải một khối nổi: nó phải cuộn ngang
                CÙNG bảng trong khung `.khung-cuon`, và phải nằm đúng giữa hai
                hàng để không ai đọc nhầm nó là chi tiết của dòng kế tiếp.
              */}
              {/*
                HÀNG *bản trước*, chèn NGAY DƯỚI hàng của chính nó (`0204`,
                đổi hình ở `0214`).

                `0213` để nó là một ô `colSpan` phủ cả bảng, bên trong là một
                bảng dọc. `0214` đổi thành một HÀNG THẬT: cùng số ô, cùng thứ tự
                cột, nên hai con số của cùng một cột nằm thẳng dưới nhau.

                Nó vẫn phải cuộn ngang CÙNG bảng trong khung `.khung-cuon`, và
                phải nằm đúng giữa hai hàng để không ai đọc nhầm nó là bản trước
                của dòng kế tiếp.
              */}
              {dangMo.includes(d.id) && banTruocCua(d) !== null && (
                <HangBanTruoc
                  b={banTruocCua(d)!}
                  soCpbh={soCotCpbh(dong)}
                  coThaoTac={coThaoTac}
                />
              )}
              </Fragment>
            ))}
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
                  thoại đây là thứ đọc lướt để biết dòng nào vừa đổi.

                  `0204` — cùng component với vế bảng, nên nhãn bấm được ở CẢ HAI
                  bố cục. Bỏ sót vế này là tính năng biến mất dưới 640px mà không
                  có gì nói ra, và đó đúng là bề rộng người duyệt hay mở hồ sơ
                  trên điện thoại để xem trước khi ký. */}
              <NhanTrangThai d={d} mo={dangMo.includes(d.id)} bat={() => batMo(d.id)} />
            </div>
            {dangMo.includes(d.id) && banTruocCua(d) !== null && (
              <BangBanTruoc b={banTruocCua(d)!} />
            )}
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
