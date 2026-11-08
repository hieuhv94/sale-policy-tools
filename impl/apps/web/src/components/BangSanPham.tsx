/**
 * Bảng dòng sản phẩm — màn hình khó nhất của cả ứng dụng.
 *
 * Hơn mười cột phải đọc được trên màn hình rộng 360px. Ba yêu cầu, ba cách bố
 * trí khác nhau, và điều quan trọng là chúng KHÔNG phải ba mức độ của cùng một
 * thứ:
 *
 *   - **≥640px (`FE-04`, `FE-05`)** — bảng, cuộn ngang TRONG KHUNG RIÊNG khi
 *     không đủ chỗ; cột Tên sản phẩm đứng ĐẦU và GHIM bên trái (`0267`). Không
 *     có cột ghim thì cuộn sang phải là mất dấu đang đọc dòng nào — với bảng tiền
 *     thì đó là đọc nhầm số của sản phẩm khác. Mã sản phẩm nằm dưới tên, ghi chú
 *     là biểu tượng cạnh tên — hai cột ấy chỉ còn ở bản in và ở bố cục thẻ.
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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BieuTuongBut, BieuTuongGhiChu, BieuTuongThung } from './BieuTuong.js';
import { ngay, tien, tyLe } from '../lib/format.js';
import { COT_TRUOC, COT_SAU, NHAN_TRANG_THAI, nhanCpbh } from '../lib/bang-cot.js';
import {
  banTruocCua,
  chieuDoi,
  docOBanTruoc,
  nhanOBanTruoc,
  oDaDoi,
  type BanTruocDong,
  type Chieu,
  type OBanTruoc,
  type OSo,
} from '../lib/ban-truoc.js';

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
  /**
   * Nội dung từng khoản (`0268`), song song với `cpbh`; rỗng = không có. Máy chủ cũ
   * hơn giao diện thì vắng mặt — mọi chỗ đọc dùng `?.[i]`.
   */
  cpbhNoiDung?: string[] | undefined;
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
   * `0215` giữ nguyên hợp đồng này và đổi chỗ bày: giá trị cũ thôi nằm trong một
   * hàng mở ra, nó nằm trong câu hiện khi rê chuột vào dấu tam giác cạnh giá trị
   * mới trên chính hàng này.
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

/*
 * Ô "bản trước", `chieuDoi` và bạn bè dời sang `lib/ban-truoc.ts` ở `0215` —
 * xem lý do ở đầu tệp ấy. Tóm tắt: `O_BAN_TRUOC` phải khớp từng khoá với
 * `TRUONG_BAY_BAN_TRUOC` bên `policy`, và ca kiểm đối chiếu sống ở `tests/http/`
 * nơi `jsx` không bật (cùng đường `0172` đã đi với `bang-cot.ts`).
 *
 * XUẤT LẠI TỪ ĐÂY vì hai tệp kiểm và `ChiTietHoSo` vẫn gọi chúng qua tên cũ, và
 * vì chỗ đọc tự nhiên của một người đang sửa bảng này vẫn là ở đây.
 */
export {
  O_BAN_TRUOC,
  banTruocCua,
  oDaDoi,
  nhanOBanTruoc,
  docOBanTruoc,
  chieuDoi,
  type OBanTruoc,
  type OSo,
  type BanTruocDong,
  type Chieu,
} from '../lib/ban-truoc.js';

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
 * Nhãn trạng thái — một con chip chữ, KHÔNG phải nút (`0215`).
 *
 * `0204` biến nó thành nút để mở ra bảng *bản trước*; `0215` bỏ bảng ấy, nên nút
 * cũng đi theo. Không để lại một nút mở một thứ không còn tồn tại, và cũng không
 * giữ nút cho "một việc nào đó sau này": một nút bấm không làm gì là lời mời bấm
 * rồi tự hỏi mình vừa làm sai ở đâu.
 *
 * Chữ lấy đúng `NHAN_TRANG_THAI` — bảng chữ dùng chung với bản in.
 */
function NhanTrangThai({ d }: { d: DongSanPham }) {
  if (!d.trangThai) return null;
  return (
    <span className={lopTrangThai(d.trangThai)}>
      {NHAN_TRANG_THAI[d.trangThai] ?? d.trangThai}
    </span>
  );
}

/** Hình của ba chiều. `khac` KHÔNG phải tam giác — xem `chieuDoi`. */
const HINH_CHIEU: Record<Chieu, string> = { tang: '▲', giam: '▼', khac: '●' };

/** Câu đọc thành lời của ba chiều, cho trình đọc màn hình và cho `aria-label`. */
const LOI_CHIEU: Record<Chieu, string> = {
  tang: ' — giá trị mới cao hơn',
  giam: ' — giá trị mới thấp hơn',
  khac: '',
};

/**
 * DẤU TAM GIÁC cạnh một giá trị đã đổi (`0215`, khách hàng chốt 21/09).
 *
 * *"Giá trị của cột nào bị thay đổi thì đặt bên cạnh giá trị đó dấu tam giác màu
 * xanh hướng lên nếu giá trị đó mới lớn hơn giá trị cũ, màu đỏ hướng xuống nếu
 * giá trị mới bé hơn. Khi người dùng di chuột vào vị trí dấu tam giác, sẽ hiện ra
 * giá trị trong phiên bản trước"*.
 *
 * ---------------------------------------------------------------------------
 * `<button>` CHỨ KHÔNG `<span title>`, và đó là chỗ tốn công nhất
 * ---------------------------------------------------------------------------
 *
 * Yêu cầu viết *"di chuột"*, nhưng một nửa người duyệt mở hồ sơ trên điện thoại
 * trước khi ký, và `title` **chỉ hiện khi có CHUỘT** — trên cảm ứng và với người
 * dùng bàn phím nó là một dấu hiệu không bao giờ trả lời được. Đúng lý lẽ `0027`
 * đã dùng cho dấu `?` ngay trong những ô này, nên hai dấu cạnh nhau cũng dùng
 * chung một cách mở.
 *
 * Nên giá trị cũ tới được người đọc bằng **ba đường**, và mỗi đường là một cơ chế
 * riêng: `:hover` (chuột) · `:focus` (Tab, và cú chạm trên phần lớn trình duyệt
 * cảm ứng) · một lượt BẤM đổi trạng thái `mo`. Đường thứ ba không thừa: nó là
 * đường duy nhất không phụ thuộc vào việc trình duyệt cảm ứng có trao tiêu điểm
 * cho `<button>` hay không, và nó cũng là đường DUY NHẤT một ca kiểm chạm tới
 * được — `:hover` trong jsdom không đo được bằng gì cả.
 *
 * `aria-label` mang CẢ CÂU (tên cột · giá trị cũ · chiều), nên trình đọc màn hình
 * không cần tới ô chữ lẫn màu sắc; ô chữ vì thế `aria-hidden`, nếu không nó đọc
 * con số ấy lần thứ hai.
 *
 * FE-28 — *"không bao giờ chỉ dùng màu"* — giữ bằng HÌNH: ▲ và ▼ là hai hình
 * khác nhau trước khi là hai màu, nên người không phân biệt được xanh với đỏ vẫn
 * đọc được chiều.
 */
function DauDoi({
  o,
  nhan,
  cu,
  moi,
}: {
  o: OBanTruoc;
  nhan: string;
  cu: string | string[] | null | undefined;
  moi: string | string[] | null | undefined;
}) {
  const [mo, datMo] = useState(false);
  const nut = useRef<HTMLButtonElement>(null);
  const chieu = chieuDoi(o, moi, cu);
  const giaCu = docOBanTruoc(o, cu);

  /*
   * BẤM RA NGOÀI THÌ ĐÓNG (`0216`) — và `onBlur` một mình KHÔNG đủ.
   *
   * `onBlur` lo được chuột và bàn phím, nhưng lượt bấm sinh ra chính là để phục
   * vụ CẢM ỨNG (`0215`), mà trên iOS Safari một cú chạm không phải lúc nào cũng
   * trao tiêu điểm cho `<button>`. Nút không nhận tiêu điểm thì nó cũng không
   * bao giờ mất tiêu điểm, và ô chữ nằm lại vĩnh viễn — đúng ở nền tảng mà
   * đường bấm là đường DUY NHẤT.
   *
   * Nên có lớp thứ hai: một listener `pointerdown` ở cấp tài liệu, **chỉ gắn
   * trong lúc đang mở**. `pointerdown` chứ không `click`: nó nổ trước, nên ô chữ
   * đóng ngay lúc ngón tay chạm xuống chứ không đợi nhấc lên.
   *
   * Phụ thuộc là `[mo]`, KHÔNG phải `[nut.current]`: React so phụ thuộc lúc
   * RENDER còn ref gán lúc COMMIT, nên để ref vào đó là listener không bao giờ
   * được gắn (bẫy `0172`). Ref chỉ được đọc bên trong handler, lúc sự kiện nổ.
   *
   * `contains` để một cú chạm vào CHÍNH cái dấu không đi đường này — `onClick`
   * ngay dưới đã lo việc đóng, và hai chỗ cùng đóng thì lượt chạm thứ hai mở lại
   * đúng cái vừa đóng.
   */
  useEffect(() => {
    if (!mo) return;
    const dong = (e: Event) => {
      if (!nut.current?.contains(e.target as Node)) datMo(false);
    };
    document.addEventListener('pointerdown', dong);
    return () => document.removeEventListener('pointerdown', dong);
  }, [mo]);

  return (
    <button
      ref={nut}
      type="button"
      className={`dau-doi dau-${chieu}${mo ? ' dau-mo' : ''}`}
      aria-label={`${nhan} ở phiên bản trước: ${giaCu}${LOI_CHIEU[chieu]}`}
      onClick={() => datMo((x) => !x)}
      /* Tab đi, hay bấm sang một dấu khác, cũng là "thôi xem ô này" — và vế thứ
         hai là thứ giữ cho KHÔNG BAO GIỜ có hai ô chữ cùng mở. Mỗi dấu giữ
         trạng thái riêng (chúng không loại trừ nhau như `dangMo` của `0204`),
         nên nếu không có dòng này thì bấm năm dấu là năm ô chữ đè lên bảng. */
      onBlur={() => datMo(false)}
    >
      <span aria-hidden="true">{HINH_CHIEU[chieu]}</span>
      <span className="gia-cu" aria-hidden="true">
        {giaCu}
      </span>
    </button>
  );
}

/**
 * Dấu cho một ô MỘT CON SỐ — `null` khi ô ấy không đổi (`0215`).
 *
 * ĐỌC GIÁ TRỊ MỚI TỪ CHÍNH DÒNG (`d[o]`) thay vì nhận qua prop: mọi khoá của
 * `OSo` trùng tên với một trường của `DongSanPham`, nên phép tra này không sai
 * được. Truyền tay thì một chỗ gõ nhầm cho ra một dấu chỉ đúng chiều của ô bên
 * cạnh — dịch được, chạy được, và không có gì đỏ.
 *
 * *"Có đổi hay không"* đọc từ `oDaDoi`, tức TỪ MÁY CHỦ. Giao diện tự so hai bên
 * là bẫy `0213` đã ghi: `615000` và `615000.00` là hai chuỗi khác nhau mà cùng
 * một con số.
 */
function Dau({ d, o }: { d: DongSanPham; o: OSo }) {
  const b = banTruocCua(d);
  if (b === null || !oDaDoi(b).includes(o)) return null;
  return <DauDoi o={o} nhan={nhanOBanTruoc(o)} cu={b[o]} moi={d[o]} />;
}

/**
 * Dấu cho ô KHOẢN CPBH thứ `k` (`0215`).
 *
 * Máy chủ chỉ nói được *"mảng `cpbh` đã đổi"* — nó so cả cột `bigint[]` một lượt.
 * Dải cột trên màn hình thì mỗi khoản một ô, nên phải hỏi tiếp khoản NÀO đổi, và
 * câu hỏi ấy chỉ trả lời được ở đây.
 *
 * PHÉP SO LÀ PHÉP SO CHUỖI THÔ, cố ý: đó đúng là ngữ nghĩa `IS DISTINCT FROM`
 * trên `bigint[]` của máy chủ, áp cho từng phần tử. Dùng `Number()` ở đây là
 * dựng một ngữ nghĩa THỨ HAI, và hai ngữ nghĩa thì có ngày cho hai câu trả lời
 * khác nhau về cùng một dòng (bẫy `0213`). Vế `oDaDoi` vẫn hỏi trước: khoản đổi
 * mà mảng không đổi là chuyện không viết ra được, nhưng thứ tự ấy giữ cho máy
 * chủ là chỗ duy nhất nói *"dòng này đã đổi"*.
 *
 * Khoản CHỈ CÓ ở một trong hai bản vẫn mang dấu — nó đã đổi thật — và `chieuDoi`
 * trả `khac` cho nó: không có gì để mà lớn hơn.
 */
function DauKhoan({ d, k }: { d: DongSanPham; k: number }) {
  const b = banTruocCua(d);
  if (b === null || !oDaDoi(b).includes('cpbh')) return null;
  const cu = Array.isArray(b.cpbh) ? b.cpbh[k] : undefined;
  const moi = d.cpbh?.[k];
  if ((cu ?? '') === (moi ?? '')) return null;
  return <DauDoi o="cpbh" nhan={nhanCpbh(k)} cu={cu ?? null} moi={moi ?? null} />;
}

/**
 * DẤU GHI CHÚ cạnh tên sản phẩm (`0267`) — thay cho cột *Ghi chú* của bảng web.
 *
 * Ghi chú hiếm (2/453 dòng trên demo) nhưng có thể dài tới 500 ký tự, nên nó thôi
 * chiếm một cột: dòng nào có ghi chú thì có một biểu tượng ngay cạnh tên, trong
 * cột GHIM — cuộn tới đâu cũng thấy dòng nào có ghi chú.
 *
 * ĐỌC ĐƯỢC BẰNG BA ĐƯỜNG, cùng lý lẽ `DauDoi` (`0215`, `0216`): rê CHUỘT vào thì
 * hiện, BẤM/CHẠM thì bật tắt, và `aria-label` mang nguyên văn cho trình đọc màn
 * hình. Rê chuột chỉ tính con trỏ CHUỘT (`pointerType`): trên cảm ứng một cú chạm
 * cũng bắn `pointerenter`, và để nó mở rồi `click` ngay sau đó đóng lại là nút
 * không bao giờ mở được.
 *
 * Ô mở vì RÊ CHUỘT thì cú bấm GHIM nó lại chứ không đóng (`boi`): với chuột, con
 * trỏ luôn tới dấu trước khi bấm, nên bấm-để-đọc mà lại đóng đúng ô vừa hiện là
 * thứ đầu tiên người dùng chuột gặp. Ô đã ghim thì rời chuột không đóng; bấm lần
 * nữa, bấm ra ngoài, Escape hay cuộn mới đóng.
 *
 * Ô chữ là `position: fixed`, toạ độ tính lúc mở: bảng nằm trong `.khung-cuon`,
 * mà `overflow-x: auto` cắt CẢ HAI chiều — một ghi chú dài ở hàng đầu hay hàng
 * cuối sẽ bị cắt cụt nếu neo tuyệt đối vào ô. `DauDoi` tránh được bằng cách nằm
 * trong dải ngang của hàng vì giá trị cũ chỉ là một con số; một đoạn ghi chú thì
 * không vừa một dải ấy. Cuộn (khung hay trang) là đóng — toạ độ đã lỗi thời.
 */
function DauGhiChu({ ghiChu }: { ghiChu: string }) {
  const [mo, datMo] = useState<{ boi: 'chuot' | 'bam'; trai: number; tren?: number; duoi?: number } | null>(null);
  const nut = useRef<HTMLButtonElement>(null);

  const moRa = (boi: 'chuot' | 'bam') => {
    const r = nut.current?.getBoundingClientRect();
    if (!r) return;
    const rong = Math.min(352, window.innerWidth - 16);
    const trai = Math.max(8, Math.min(r.left, window.innerWidth - rong - 8));
    // Dưới dấu nếu còn chỗ, không thì lật lên trên.
    datMo(
      window.innerHeight - r.bottom > 200
        ? { boi, trai, tren: r.bottom + 6 }
        : { boi, trai, duoi: window.innerHeight - r.top + 6 },
    );
  };

  useEffect(() => {
    if (!mo) return;
    const dongNgoai = (e: Event) => {
      if (!nut.current?.contains(e.target as Node)) datMo(null);
    };
    const dong = () => datMo(null);
    const phim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') datMo(null);
    };
    document.addEventListener('pointerdown', dongNgoai);
    document.addEventListener('scroll', dong, true);
    window.addEventListener('resize', dong);
    document.addEventListener('keydown', phim);
    return () => {
      document.removeEventListener('pointerdown', dongNgoai);
      document.removeEventListener('scroll', dong, true);
      window.removeEventListener('resize', dong);
      document.removeEventListener('keydown', phim);
    };
  }, [mo]);

  return (
    <button
      ref={nut}
      type="button"
      className={`dau-ghi-chu${mo ? ' dau-mo' : ''}`}
      aria-label={`Ghi chú: ${ghiChu}`}
      aria-expanded={mo !== null}
      onClick={() => (mo?.boi === 'bam' ? datMo(null) : moRa('bam'))}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse' && !mo) moRa('chuot');
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && mo?.boi === 'chuot') datMo(null);
      }}
      onBlur={() => datMo(null)}
    >
      <BieuTuongGhiChu />
      {mo && (
        <span
          className="ghi-chu-noi"
          aria-hidden="true"
          style={{ left: mo.trai, ...(mo.tren !== undefined ? { top: mo.tren } : { bottom: mo.duoi }) }}
        >
          {ghiChu}
        </span>
      )}
    </button>
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

/*
 * `COT_DINH` — lớp của BA CỘT ĐẦU khoá khi cuộn ngang (`0228`) — ĐÃ GỠ ở `0230`.
 *
 * Khách hàng đưa *Tên sản phẩm* lên đầu và chỉ ghim MỘT cột ấy. Một cột ghim
 * thì mép trái luôn là 0, nên không còn phép cộng bề rộng nào phải giữ khớp —
 * và cột tên thôi phải chịu bề rộng cố định 14rem mà `0228` cần cho phép cộng.
 * `0231` bỏ nốt cột ghim ấy: bảng cuộn ngang trọn vẹn, không cột nào đứng yên.
 */

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

/**
 * Dấu `?` cạnh con số của một KHOẢN CPBH có nội dung (`0268`, khách hàng chọn
 * "đặt đúng con số" trong hai phương án). Dựng y hệt dấu `?` của ô Tỷ lệ CK và
 * QĐCK (`0027`): `<button>` mang `title` cho chuột và `aria-label` cho bàn phím và
 * trình đọc màn hình. Khoản không có nội dung thì không có dấu.
 */
export function DauNoiDungKhoan({ d, k }: { d: DongSanPham; k: number }) {
  const nd = d.cpbhNoiDung?.[k]?.trim();
  if (!nd) return null;
  const cau = `${nhanCpbh(k)}: ${nd}`;
  return (
    <button type="button" className="dau-hoi dau-noi-dung" title={cau} aria-label={`Nội dung ${cau}`}>
      ?
    </button>
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
      {/* Dấu của TỔNG nằm NGOÀI nút, không lồng vào trong (`0215`): dấu là một
          `<button>`, và một nút trong lòng một nút thì trình duyệt tự gỡ ra —
          bấm vào dấu sẽ gập luôn cả khối CPBH. Đây là chỗ DUY NHẤT của cả bảng
          mà dấu không đứng ngay cạnh con số nó nói về; đổi lại, nó vẫn nằm trong
          cùng khối *CPBH* nên không đọc nhầm sang ô khác được. */}
      <Dau d={d} o="cpbhTotal" />
      {mo &&
        (co.length === 0 ? (
          <p className="ghi-chu">Dòng này không có khoản chi phí bán hàng nào.</p>
        ) : (
          <dl className="cpbh-chi-tiet">
            {co.map((v, i) => (
              <div key={i}>
                <dt>{nhanCpbh(i)}</dt>
                <dd className="so">
                  {tien(v)}
                  <DauKhoan d={d} k={i} />
                  <DauNoiDungKhoan d={d} k={i} />
                </dd>
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
  /*
   * Ở BẢNG: hai nút BIỂU TƯỢNG — bút và thùng rác (`0267`, khách hàng chốt 07/11),
   * cột thao tác hẹp từ 166px xuống ~100px. Tên nút (`aria-label`) GIỮ NGUYÊN chữ
   * *Sửa* / *Xoá*: trình đọc màn hình đọc kèm tiêu đề hàng (`th scope="row"`) nên
   * biết là sửa dòng nào, và `title` cho người dùng chuột đọc được nghĩa khi rê.
   * Ở THẺ (điện thoại) giữ nút CHỮ — thẻ có thừa chỗ, chữ đọc ngay.
   */
  if (hang) {
    return (
      <div className={lop}>
        {suaDong && (
          <button
            type="button"
            className="nut-bieu-tuong nut-bt-dong"
            aria-label="Sửa"
            title="Sửa dòng"
            onClick={() => suaDong(d)}
          >
            <BieuTuongBut />
          </button>
        )}
        {xoaDong && (
          <button
            type="button"
            className="nut-bieu-tuong nut-bt-dong nut-bt-xoa"
            aria-label="Xoá"
            title="Xoá dòng"
            disabled={dangXoa === d.id}
            onClick={() => xoaDong(d.id)}
          >
            <BieuTuongThung />
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
    `dangMo` — tập dòng đang mở bảng *bản trước* — ĐÃ GỠ ở `0215`.

    Nó sống ở đây chứ không trong từng hàng vì bảng và danh sách thẻ là hai bố
    cục của CÙNG một dữ liệu, và hai tập trạng thái thì cửa sổ co lại một chút là
    thứ đang mở đóng sập. Lý lẽ ấy vẫn đúng; thứ mất đi là cái được mở: `0215`
    đưa giá trị cũ ra thẳng hàng, dưới dạng một dấu cạnh giá trị mới, nên không
    còn gì để mà mở. Trạng thái *"đang xem giá trị cũ"* giờ là chuyện của riêng
    từng dấu (`DauDoi`), vì hai dấu trên hai ô khác nhau không loại trừ nhau.
  */
  /*
   * CỘT TÊN VỪA KHÍT, CÓ TRẦN (`0267`).
   *
   * Muốn: tên nào ngắn hơn 18rem thì nằm gọn MỘT dòng; dài hơn mới xuống dòng.
   * CSS thuần không nói được *"rộng bằng nội dung nhưng không quá X"* cho một cột
   * bảng đang bị ép (bảng rộng hơn khung thì trình duyệt co mọi cột về sàn — đo
   * được: cột tên đứng đúng 192px ở cả ba khổ màn hình, tên dài gãy làm hai). Nên
   * đo: tạm cấm xuống dòng (`dang-do-ten`), đọc bề rộng của chính Ô tên (cột tự
   * giãn bằng nội dung dài nhất: tên + biểu tượng, hay dòng mã), rồi đặt
   * `--rong-ten` = min(bề rộng ấy, 18rem chữ + lề trong của ô). Đo lại khi dữ
   * liệu đổi và khi phông tự host nạp xong (đo bằng phông dự phòng là sai số).
   *
   * ĐO CẢ Ô, KHÔNG ĐO CHỮ — bản đầu đo `<span>` tên rồi đặt số ấy làm bề rộng ô,
   * và trên demo thật bốn trong tám tên VẪN xuống dòng: mọi ô là `border-box`, nên
   * bề rộng đặt cho ô đã gồm 24px lề trong mà phép đo chữ không có.
   *
   * jsdom trả bề rộng 0 — không đặt biến, CSS rơi về sàn/trần như cũ.
   */
  const khung = useRef<HTMLDivElement>(null);
  const bang = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const t = bang.current;
    if (!t) return;
    const do_ = () => {
      const o = t.querySelector<HTMLElement>('tbody .cot-khoa');
      if (!o) return;
      t.classList.add('dang-do-ten');
      const dai = o.getBoundingClientRect().width;
      t.classList.remove('dang-do-ten');
      const cs = getComputedStyle(o);
      const le = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const tran = 18 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) + le;
      if (dai > 0) t.style.setProperty('--rong-ten', `${Math.ceil(Math.min(dai, tran))}px`);
    };
    do_();
    let conSong = true;
    void document.fonts?.ready.then(() => {
      if (conSong) do_();
    });
    return () => {
      conSong = false;
    };
  }, [dong]);

  /* Bóng mép phải của cột ghim CHỈ khi bảng đã cuộn: ở trạng thái nghỉ bảng trông
     như mọi bảng khác. Đổi lớp thẳng trên DOM, không qua state — cuộn bắn sự kiện
     ở mỗi khung hình, dựng lại cả bảng mỗi lần là phí. */
  const cuon = () => {
    const k = khung.current;
    if (k) k.classList.toggle('da-cuon', k.scrollLeft > 0);
  };

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
      <div
        ref={khung}
        className="khung-cuon"
        role="region"
        aria-label="Bảng sản phẩm"
        tabIndex={0}
        onScroll={cuon}
      >
        <table ref={bang} className="bang-san-pham">
          <thead>
            <tr>
              {/*
                `0267` — cột tên ĐẦU bảng và GHIM khi cuộn ngang (khách hàng chốt
                07/11; bản in giữ thứ tự cũ). Lịch sử: `0230` ghim, `0231` bỏ
                ghim để khớp bản in, `0233` bỏ màu riêng — vế màu VẪN GIỮ: ô ghim
                chỉ mang nền của chính hàng, cần thiết để chữ cuộn qua không lộ.
                Lớp `cot-khoa` giữ tên: nó là cột KHOÁ theo nghĩa *"cột nói dòng
                này là mặt hàng nào"* (`th scope="row"`).
              */}
              {cotCho(dong).map((c) => (
                <th key={c.khoa} className={c.khoa === 'productName' ? 'cot-khoa' : undefined}>
                  {c.nhan}
                </th>
              ))}
              {/* `0228` — tiêu đề HIỆN: nút luôn hiện thì cột có tên như mọi cột. */}
              {coThaoTac && <th className="o-thao-tac-dong">Thao tác</th>}
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
              <tr key={d.id} className={daXoa(d) ? 'dong-da-xoa' : undefined}>
                {/*
                  DẤU TAM GIÁC cạnh mọi ô đã đổi (`0215`, chốt 21/09).

                  `<Dau>` tự trả `null` ở dòng không có bản trước và ở ô không
                  đổi, nên nó đứng được cạnh mọi giá trị mà không cần một nhánh
                  điều kiện nào ở đây — và đó là chủ ý: một `{dieuKien && …}` gõ
                  lại ở tám ô là tám chỗ để quên một.
                */}
                {/* `0267` — TÊN (kèm biểu tượng ghi chú) và MÃ ở dòng dưới; hai
                    `<span>` là hai thứ phép đo bề rộng cột đọc. */}
                <th scope="row" className="cot-khoa">
                  <span className="ten-dong">
                    {d.productName}
                    {d.note && <DauGhiChu ghiChu={d.note} />}
                  </span>
                  <span className="ma-sp">{d.productCode}</span>
                </th>
                <td className="ngay-ap-dung">
                  {ngay(d.ngayApDung)}
                  <Dau d={d} o="ngayApDung" />
                </td>
                <td className="so">
                  {tien(d.companyPrice)}
                  <Dau d={d} o="companyPrice" />
                </td>
                <td className="so">
                  {tien(d.wholesalePrice)}
                  <Dau d={d} o="wholesalePrice" />
                </td>
                <td className="so">
                  {tien(d.cpbhTotal)}
                  <Dau d={d} o="cpbhTotal" />
                </td>
                {/* Ô TRỐNG cho dòng ít khoản hơn, không phải số 0 — xem chú
                    thích đầu tệp. Dấu thì vẫn có: một khoản vừa được thêm vào
                    là một thay đổi, dù ô bên cạnh nó trống. */}
                {Array.from({ length: soCotCpbh(dong) }, (_, k) => (
                  <td key={k} className="so">
                    {d.cpbh?.[k] === undefined ? '' : tien(d.cpbh[k])}
                    <DauKhoan d={d} k={k} />
                    {d.cpbh?.[k] !== undefined && <DauNoiDungKhoan d={d} k={k} />}
                  </td>
                ))}
                <td className="so">
                  {tien(d.netPrice)}
                  <Dau d={d} o="netPrice" />
                </td>
                <td className="so">
                  <OTyLe d={d} />
                  <Dau d={d} o="discountRate" />
                </td>
                {/* Ô TRỐNG cho dòng không phải *Chỉnh sửa* — máy chủ đã quyết
                    định điều đó, xem `discountRateTruoc`. */}
                <td className="so">{d.discountRateTruoc ? tyLe(d.discountRateTruoc) : ''}</td>
                {/* `.so` chứ không `.ma-quy-dinh`: ô này giờ mang một con số
                    phần trăm (`0180`), và nó phải thẳng cột với hai cột tỷ lệ
                    bên trái. Kiểu chữ mã chỉ còn dùng cho nhánh lùi bên trong. */}
                <td className="so">
                  <OQuyDinh d={d} />
                  <Dau d={d} o="threshold" />
                </td>
                <td>
                  <NhanTrangThai d={d} />
                </td>
                {coThaoTac && (
                  /*
                    LUÔN HIỆN (`0228`, khách hàng 29/09: *"bỏ cơ chế hover"*) —
                    tới `0227` ô này mang `o-thao-tac-re-chuot` của `0132`, lớp
                    VẪN còn ở sáu bảng danh mục/quản trị; khách hàng chỉ bỏ nó
                    ở bảng sản phẩm của hồ sơ.

                    `0230` — ô THÔI GHIM mép phải (khách hàng: *"không cần cố
                    định cột thao tác này"*), nó đứng cuối bảng như mọi cột. Hai
                    nút cỡ thường chứ không cỡ gọn, cách nhau rộng hơn.

                    `nhom-nut-hang` giữ hai nút trên CÙNG MỘT HÀNG (`0124`).
                  */
                  <td className="o-thao-tac-dong">
                    <NutDong
                      d={d}
                      hang
                      {...{ xoaDong, suaDong, themLaiDong, dangXoa }}
                    />
                  </td>
                )}
              </tr>
              /*
                HÀNG *bản trước* (`0204` · `0213` · `0214`) — ĐÃ GỠ ở `0215`.

                Ba chặng liền đi theo hướng "mở ra một hàng nữa", và lượt này
                khách hàng đổi hướng: giá trị cũ về thẳng ô của nó, dưới dạng một
                dấu. Cái mất, đã nêu: đọc cả dòng cũ một lượt thì phải rê qua
                từng dấu. Cái được là bảng không còn cao gấp đôi ở mỗi dòng
                *Chỉnh sửa*, và không còn hai hàng trông giống hai mặt hàng.
              */
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
                  thoại đây là thứ đọc lướt để biết dòng nào vừa đổi. */}
              <NhanTrangThai d={d} />
            </div>
            {/*
              DẤU TAM GIÁC cũng có ở vế THẺ (`0215`) — cùng `<Dau>` với vế bảng.

              `0214` cho hai bố cục hai HÌNH khác nhau, vì hàng *bản trước* cần
              những cột mà thẻ không có. Lượt này chúng về chung một hình được:
              dấu bám vào GIÁ TRỊ, và giá trị thì ở đâu cũng có. Bỏ sót vế này là
              tính năng biến mất dưới 640px mà không có gì nói ra, và đó đúng là
              bề rộng người duyệt hay mở hồ sơ để xem trước khi ký.
            */}
            <dl className="the-so">
              <div>
                <dt>Ngày áp dụng</dt>
                <dd>
                  {ngay(d.ngayApDung)}
                  <Dau d={d} o="ngayApDung" />
                </dd>
              </div>
              <div>
                <dt>Giá bán Công ty</dt>
                <dd className="so">
                  {tien(d.companyPrice)}
                  <Dau d={d} o="companyPrice" />
                </dd>
              </div>
              <div>
                <dt>Giá bán buôn</dt>
                <dd className="so">
                  {tien(d.wholesalePrice)}
                  <Dau d={d} o="wholesalePrice" />
                </dd>
              </div>
              <div>
                <dt>Giá thu về</dt>
                <dd className="so">
                  {tien(d.netPrice)}
                  <Dau d={d} o="netPrice" />
                </dd>
              </div>
              <div>
                <dt>Tỷ lệ CK</dt>
                <dd className="so">
                  <OTyLe d={d} />
                  <Dau d={d} o="discountRate" />
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
                    <Dau d={d} o="threshold" />
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
