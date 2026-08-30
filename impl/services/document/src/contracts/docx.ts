/**
 * Đọc và trộn file `.docx` — không dùng thư viện mẫu nào.
 *
 * `.docx` là một file zip chứa `word/document.xml`. Việc cần làm chỉ có ba:
 * liệt kê ô trống, thay giá trị vào, và nhân bản dòng bảng cho danh sách sản
 * phẩm. Thư viện trộn mẫu (docxtemplater và tương tự) làm được nhiều hơn thế
 * nhiều lần, đổi lại là một cú pháp mẫu riêng mà Sale Admin phải học và một
 * phụ thuộc lớn phải theo dõi vá lỗi.
 *
 * CÁI KHÓ THẬT SỰ, và là lý do đoạn mã này dài hơn vẻ ngoài của nó:
 *
 * Word cắt một đoạn văn thành nhiều `<w:r>` bất cứ lúc nào nó muốn — sửa một
 * chữ, bật kiểm tra chính tả, đổi phông giữa chừng. Nên `{{customer.name}}` gõ
 * liền mạch trên màn hình rất thường nằm rải trong XML thành `{{cus`, `tomer.`,
 * `name}}`. Tìm chuỗi trên từng `<w:t>` sẽ không thấy gì cả, và đó là kiểu hỏng
 * im lặng: file vẫn sinh ra, chỉ là ô trống không được điền.
 *
 * Cách xử lý: gộp toàn bộ `<w:t>` trong CÙNG một `<w:p>` lại rồi mới tìm và
 * thay. Cái giá là định dạng KHÁC NHAU giữa các đoạn chữ trong cùng một đoạn
 * văn bị san phẳng theo đoạn chữ đầu tiên. Chấp nhận được với mẫu hợp đồng:
 * định dạng ở đó theo đoạn văn, không theo từng chữ.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

const DOCUMENT_XML = 'word/document.xml';

export class NotADocxError extends Error {}

/** Chuỗi ô trống hợp lệ: `{{ten.truong}}`, chỉ chữ thường, số, dấu chấm và gạch dưới. */
/**
 * Ô trống trong mẫu. Nhận CẢ CHỮ HOA từ `0056`.
 *
 * Bản trước chỉ nhận `[a-z0-9_.[\]]`, và khoá `{{ho_so.chu_ky_so_TBP}}` — do
 * khách hàng đặt tên, viết hoa ba chữ cái của một chức danh — lọt qua không
 * khớp. Hỏng IM LẶNG theo đúng kiểu tệ nhất: `placeholdersOf` không thấy nó nên
 * bảng ánh xạ không có dòng ấy, và bản in ra mang nguyên chuỗi `{{...}}`.
 */
export const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_.[\]]+)\s*\}\}/g;

const unzip = (buf: Buffer): Record<string, Uint8Array> => {
  let files;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch {
    throw new NotADocxError('File không mở được như một file .docx (zip hỏng)');
  }
  if (!files[DOCUMENT_XML]) {
    throw new NotADocxError(`File .docx thiếu ${DOCUMENT_XML} — không phải tài liệu Word`);
  }
  return files;
};

export const documentXml = (buf: Buffer): string => strFromU8(unzip(buf)[DOCUMENT_XML]!);

const rezip = (buf: Buffer, xml: string): Buffer => {
  const files = unzip(buf);
  files[DOCUMENT_XML] = strToU8(xml);
  return Buffer.from(zipSync(files));
};

/** Chữ hiển thị của một đoạn XML, bỏ hết thẻ. */
/**
 * Chữ của một đoạn văn — nối nội dung mọi `<w:t>`, bỏ qua mọi thẻ khác.
 *
 * `(?:\s[^>]*)?` CHỨ KHÔNG `[^>]*`, và đó là cả một lỗi `0165` phải đi vá.
 *
 * `[^>]*` cho `<w:t` nuốt luôn **`<w:tabs>`** và **`<w:tab/>`** — hai thẻ TAB
 * của Word, vì `abs>` và `ab/>` đều khớp. Hậu quả không phải mất một ký tự: bộ
 * quét chạy tiếp tới `</w:t>` THẬT ở cuối run kế tiếp, nên nó trả về **cả khối
 * markup nằm giữa** dưới dạng "chữ" — rồi `setParagraphText` escape khối ấy và
 * in nguyên `&lt;w:rPr&gt;…` ra tờ giấy.
 *
 * Ai cũng dính, không riêng mẫu của phần mềm: **tab stop là cách căn cột thông
 * thường nhất trong Word**, nên bất kỳ mẫu nào Quản trị tự soạn mà có một điểm
 * dừng tab đều in ra XML. Lỗi nằm ở đây từ `0051`, và chỉ lộ ra ở `0165` vì đây
 * là lượt đầu tiên phần mềm tự sinh ra một mẫu có tab.
 *
 * `setParagraphText` ngay dưới VỐN ĐÃ viết đúng — một chỗ đúng, một chỗ sai, và
 * hai chỗ ấy cách nhau mười lăm dòng.
 */
const textOf = (xml: string): string =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? '').join('');

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Thay toàn bộ chữ của một `<w:p>` bằng chuỗi mới: dồn vào `<w:t>` đầu tiên,
 * xoá rỗng các `<w:t>` còn lại. Giữ nguyên mọi thẻ định dạng của đoạn văn.
 *
 * Xuống dòng trong giá trị được đổi thành `<w:br/>` — không có bước này thì ký
 * tự xuống dòng bị Word bỏ qua và địa chỉ nhiều dòng dính thành một hàng dài.
 */
function setParagraphText(paragraph: string, text: string): string {
  let first = true;
  return paragraph.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, () => {
    if (!first) return '<w:t></w:t>';
    first = false;
    // `xml:space="preserve"` bắt buộc: thiếu nó thì Word và LibreOffice cắt
    // khoảng trắng đầu cuối, và "Số 8 Tôn Thất Thuyết" dính vào nhãn đứng trước.
    //
    // Thẻ mở được DỰNG LẠI TỪ ĐẦU chứ không vá vào thẻ cũ. Bản trước nối thêm
    // thuộc tính vào thẻ sẵn có và sinh ra `<w:t xml:space="preserve"
    // xml:space="preserve">` khi thẻ cũ đã có thuộc tính đó — XML thuộc tính
    // trùng là XML không hợp lệ, và LibreOffice trả về đúng một dòng "uno
    // exception" không nói gì thêm. Đọc XML bằng mắt thì thấy ngay; đọc log thì
    // không bao giờ.
    const body = esc(text).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
    return `<w:t xml:space="preserve">${body}</w:t>`;
  });
}

const paragraphs = (xml: string): string[] => xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];

/** Mọi ô trống tìm thấy trong mẫu, không trùng lặp, theo thứ tự xuất hiện (DOC-25). */
export function placeholdersOf(buf: Buffer): string[] {
  const xml = documentXml(buf);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paragraphs(xml)) {
    for (const m of textOf(p).matchAll(PLACEHOLDER_RE)) {
      const key = `{{${m[1]}}}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/**
 * Khổ giấy ĐỌC TỪ chính file, không hỏi người tải lên (`0058`).
 *
 * Tới `0057` khổ giấy là một ô người tải mẫu tự khai, vì nó là KHOÁ TRA MẪU:
 * người xem chọn khổ, hệ thống tìm mẫu khai đúng khổ ấy. Từ `0058` người xem
 * chọn thẳng mẫu, nên ô ấy không còn hậu quả gì — và một ô nhập tay không còn
 * hậu quả là một ô sẽ nói dối. Đọc từ file thì nhãn không sai được.
 *
 * `w:orient="landscape"` là dấu hiệu duy nhất cần tìm: khổ dọc là mặc định của
 * OOXML và Word không ghi thuộc tính ấy ra. Nghĩa là "không thấy" = dọc, chứ
 * không phải "không biết" — nên hàm này luôn trả về một trong hai giá trị.
 */
export const khoGiayCua = (buf: Buffer): 'a4p' | 'a4l' =>
  /<w:pgSz[^>]*w:orient="landscape"/.test(documentXml(buf)) ? 'a4l' : 'a4p';

export type MergeInput = {
  /** Giá trị cho ô trống đơn: khoá là `{{ho_so.ten_khach_hang}}`. */
  values: Record<string, string>;
  /**
   * XML của CẢ MỘT BẢNG do hệ thống dựng, thay cho ô trống `{{bang_san_pham}}`
   * (`0055`).
   *
   * Vì sao bảng sản phẩm KHÔNG vẽ được trong Word: muc 7.1 đòi số cột CPBH bằng
   * dòng nhiều khoản nhất, mà mỗi dòng nhận tới 50 khoản. Một bảng vẽ sẵn có số
   * cột CỐ ĐỊNH, nên nó chỉ đúng cho những hồ sơ tình cờ có đúng số khoản ấy.
   *
   * Nên người soạn mẫu đặt MỘT ô trống, và hệ thống trả về cả cái bảng — với
   * đúng tập cột mà chính mẫu ấy khai (`0067`). Ranh giới rơi đúng chỗ: người
   * soạn nắm phần chữ, bố cục và tập cột; hệ thống giữ bảo đảm về bảng số —
   * thứ mà người ký đặt bút xuống dưới.
   */
  banSanPham?: string | undefined;
};

/** Ô trống được thay bằng cả bảng sản phẩm (`0055`). */
export const O_BANG_SAN_PHAM = '{{bang_san_pham}}';

const fill = (paragraph: string, values: Record<string, string>): string => {
  const before = textOf(paragraph);
  const after = before.replace(PLACEHOLDER_RE, (whole, name: string) => values[`{{${name}}}`] ?? whole);
  return after === before ? paragraph : setParagraphText(paragraph, after);
};

export function mergeDocx(buf: Buffer, input: MergeInput): Buffer {
  let xml = documentXml(buf);

  /*
   * BƯỚC 0 — thay ô trống bảng sản phẩm bằng cả một bảng (`0055`).
   *
   * Trước mọi bước khác, vì bảng dựng ra có thể chứa chữ trông giống ô trống
   * (tên sản phẩm do người dùng đặt), và bước điền phía dưới sẽ đụng vào chúng.
   *
   * Thay cả ĐOẠN VĂN chứa ô trống, không chỉ thay chuỗi: một `<w:tbl>` nhét vào
   * giữa một `<w:p>` là XML sai, và LibreOffice trả về tài liệu rỗng chứ không
   * báo lỗi — hỏng im lặng, đúng kiểu tốn nhiều giờ nhất để tìm.
   */
  if (input.banSanPham !== undefined) {
    for (const p of paragraphs(xml)) {
      if (textOf(p).includes(O_BANG_SAN_PHAM)) xml = xml.replace(p, input.banSanPham);
    }
  }

  /*
   * BƯỚC NHÂN BẢN DÒNG BẢNG ĐÃ GỠ (`0067`).
   *
   * Nó tìm dòng `<w:tr>` nào mang khoá thuộc nhóm `san_pham.` rồi nhân bản dòng
   * ấy cho từng sản phẩm — cơ chế của bảng VẼ TAY trong mẫu hợp đồng.
   *
   * Từ `0067` mẫu hợp đồng cũng đặt `{{bang_san_pham}}` và hệ thống dựng cả
   * bảng, nên không còn dòng mẫu nào để nhân bản. Giữ lại một cơ chế không ai
   * dùng nghĩa là giữ một nhánh mã mà không ca kiểm thử nào của người dùng thật
   * đi qua — và nó sẽ hỏng lặng lẽ vào ngày có người vô tình chạm phải.
   */

  // BƯỚC 2 — điền ô trống đơn trên toàn tài liệu.
  for (const p of paragraphs(xml)) xml = xml.replace(p, fill(p, input.values));

  return rezip(buf, xml);
}

// --- Dựng file .docx tối thiểu ------------------------------------------------
//
// Dùng cho mẫu mặc định seed sẵn (DOC-35) và cho test.
//
// "Tối thiểu" ở đây là tối thiểu mà **LibreOffice chấp nhận**, không phải tối
// thiểu mà trình đọc zip chấp nhận. Bản đầu chỉ có ba file — bảng kiểu nội
// dung, quan hệ gốc, thân tài liệu — và `placeholdersOf` đọc được hoàn toàn
// bình thường, nên nó trông như đã xong. Gotenberg thì trả `uno exception` cho
// mọi lần chuyển đổi.
//
// Hai thứ còn thiếu, cả hai đều không ảnh hưởng tới việc đọc XML:
//   1. `word/_rels/document.xml.rels` — kể cả khi rỗng. LibreOffice tra phần
//      quan hệ của tài liệu trước khi mở nó, không có thì bỏ cuộc.
//   2. `<w:tblGrid>` trong mỗi bảng. Word tự suy ra lưới cột nếu thiếu;
//      LibreOffice thì không.

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * PHÔNG CHỮ của mọi tài liệu hệ thống dựng ra — **Times New Roman 11pt**
 * (`0135`, khách hàng chốt 27/08).
 *
 * Đặt ở `docDefaults` chứ KHÔNG gắn vào từng `<w:r>`: một tài liệu có `w:rFonts`
 * trên vài trăm run là một tài liệu mà đổi phông phải sửa vài trăm chỗ, và chỗ
 * bỏ sót thì lệch phông ngay giữa câu. `docDefaults` là chỗ duy nhất Word và
 * LibreOffice đều đọc để biết "phông mặc định của tài liệu này".
 *
 * Tới `0134` gói `.docx` KHÔNG có `word/styles.xml` nào cả. Thiếu nó thì phông
 * do trình xem tự chọn — LibreOffice lấy Liberation Serif, Word lấy Calibri —
 * nên cùng một file in ở hai máy ra hai bản khác nhau. Bản in qua Gotenberg đi
 * đường LibreOffice, còn Quản trị tải file về sửa thì mở bằng Word.
 *
 * BA thuộc tính phông, không phải một: `ascii` cho chữ Latin, `hAnsi` cho phần
 * mở rộng — và **tiếng Việt có dấu rơi vào `hAnsi`**, nên khai thiếu nó là để
 * chữ không dấu một phông còn chữ có dấu một phông khác.
 *
 * `w:sz` tính bằng NỬA điểm: 22 = 11pt. `w:szCs` là cỡ cho chữ "complex script";
 * hai số phải bằng nhau, nếu không vài ký tự đổi cỡ giữa dòng.
 */
const PHONG = 'Times New Roman';

// `W` khai bên dưới, mà `const` ở cấp mô-đun chạy theo THỨ TỰ — dùng `${W}` ở
// đây là một `ReferenceError` lúc nạp mô-đun, không phải lúc gọi hàm.
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="${PHONG}" w:hAnsi="${PHONG}" w:cs="${PHONG}"/>` +
  `<w:sz w:val="22"/><w:szCs w:val="22"/>` +
  `</w:rPr></w:rPrDefault>` +
  // Đoạn văn KHÔNG giãn cách thừa: mặc định của Word là 8pt sau mỗi đoạn, và
  // bản CSBH có hơn hai mươi đoạn ngắn — cộng lại là gần một trang trống.
  `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
  `</w:docDefaults></w:styles>`;

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Mau hop dong CSBH</dc:title><dc:creator>CSBH</dc:creator>
<cp:lastModifiedBy>CSBH</cp:lastModifiedBy></cp:coreProperties>`;

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>CSBH</Application></Properties>`;

const W = W_NS;

export const para = (text: string): string =>
  `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

/**
 * Cách trình bày một ô bảng (`0165`).
 *
 * Bốn thuộc tính, và cả bốn đọc ra được từ hai file khách hàng gõ tay — xem
 * `bang-san-pham.ts` để biết cột nào lấy gì. Tất cả đều TUỲ CHỌN: bảng của mẫu
 * hợp đồng vẫn gọi `cell(text)` như trước và ra đúng kết quả cũ.
 */
export type KieuO = {
  /** Mã màu RRGGBB, không có dấu `#`. Bỏ trống là ô trắng. */
  nen?: string;
  canh?: 'left' | 'center' | 'right';
  dam?: boolean;
};

/**
 * Đoạn văn trong một ô bảng, có căn lề và in đậm (`0165`).
 *
 * Tách khỏi `para` chứ không thêm tham số cho nó: `para` còn phục vụ thân văn
 * bản của `makeDocx`, nơi không có khái niệm ô nào cả.
 */
const paraO = (text: string, k: KieuO): string => {
  const pPr = k.canh === undefined ? '' : `<w:pPr><w:jc w:val="${k.canh}"/></w:pPr>`;
  const rPr = k.dam === true ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
};

/**
 * Ô bảng rộng THEO TỶ LỆ, không theo số twip cố định (`0055`).
 *
 * Bản trước cho mỗi ô 1800 twip. Với bảng bốn cột của mẫu hợp đồng thì vừa; với
 * bảng sản phẩm của bản CSBH — chín cột cố định cộng số cột CPBH của hồ sơ — thì
 * 12 cột × 1800 = 21600 twip, gấp đôi bề rộng chữ của khổ A4 dọc. Cột bên phải
 * chạy ra ngoài mép giấy và biến mất, và cột biến mất đầu tiên là *Ghi chú*.
 *
 * `auto` để LibreOffice tự chia theo bề rộng thật của trang, nên cùng một bảng
 * vừa cả khổ dọc lẫn khổ ngang — điều bắt buộc, vì mẫu hai khổ dùng chung một
 * hàm dựng bảng.
 */
const cell = (text: string, phanTram?: number, kieu: KieuO = {}): string => {
  const w =
    phanTram === undefined
      ? '<w:tcW w:w="0" w:type="auto"/>'
      : `<w:tcW w:w="${Math.round(phanTram)}" w:type="pct"/>`;
  /*
   * THỨ TỰ TRONG `<w:tcPr>` LÀ BẮT BUỘC, không phải sở thích.
   *
   * `CT_TcPr` của OOXML là một `xsd:sequence`: `tcW` → `gridSpan` → … → `shd` →
   * … → `vAlign`. Đặt `shd` trước `tcW` thì Word từ chối mở file — còn
   * LibreOffice vẫn mở bình thường, nên lỗi này không lộ ra ở bản PDF do máy chủ
   * dựng. Cùng đúng cái bẫy `0135` đã ghi cho `styles.xml`.
   */
  const shd = kieu.nen === undefined ? '' : `<w:shd w:val="clear" w:color="auto" w:fill="${kieu.nen}"/>`;
  // Căn giữa theo CHIỀU DỌC ở mọi ô: hàng tiêu đề có ô một dòng và ô hai dòng
  // (`Giá bán buôn` xuống dòng ở cột hẹp), và chữ dính mép trên trông như lỗi in.
  return `<w:tc><w:tcPr>${w}${shd}<w:vAlign w:val="center"/></w:tcPr>${paraO(text, kieu)}</w:tc>`;
};

/**
 * Một hàng bảng. `tieuDe` bật hai thuộc tính mà bản in nhiều trang cần:
 *
 *   - `w:tblHeader` — LẶP LẠI hàng này ở đầu mỗi trang. Đây là bản Word của
 *     `thead { display: table-header-group }`; thiếu nó thì từ trang 2 trở đi
 *     người đọc nhìn một bảng số không có tên cột.
 *   - `w:cantSplit` — không cắt đôi một hàng qua hai trang. Nửa dòng ở cuối
 *     trang này, nửa kia ở đầu trang sau, và người ký đối chiếu nhầm cột.
 */
export const tableRow = (
  cells: string[],
  tieuDe = false,
  trongSo?: number[],
  kieu?: KieuO[],
): string => {
  const pr = tieuDe
    ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>'
    : '<w:trPr><w:cantSplit/></w:trPr>';
  const tong = trongSo?.reduce((a, b) => a + b, 0);
  const o = cells.map((c, i) =>
    trongSo === undefined || tong === undefined || tong === 0
      ? cell(c, undefined, kieu?.[i] ?? {})
      : cell(c, (5000 * (trongSo[i] ?? 1)) / tong, kieu?.[i] ?? {}),
  );
  return `<w:tr>${pr}${o.join('')}</w:tr>`;
};

/** Bề rộng chữ của khổ A4 dọc, tính bằng twip: 11906 trừ hai lề 1134. */
const RONG_CHU = 9638;

/**
 * Bảng chiếm trọn bề rộng chữ.
 *
 * `coDinh` bật bố cục CỐ ĐỊNH: bề rộng cột lấy đúng theo `w:tcW` của từng ô, và
 * chữ dài hơn cột thì XUỐNG DÒNG, ô cao lên. Để `autofit` thì LibreOffice nong
 * cột ra theo nội dung — một ghi chú dài đẩy cả bảng ra ngoài mép giấy, và cột
 * cuối cùng biến mất khỏi bản in mà không báo gì (`0056`).
 *
 * Mẫu hợp đồng vẫn dùng `autofit`: bảng bốn cột chữ ngắn, tự co đọc đẹp hơn.
 */
export const table = (rowsXml: string[], coDinh = false, trongSo?: number[]): string => {
  const cols = (rowsXml[0]?.match(/<w:tc[ >]/g) ?? []).length || 1;
  /*
   * `tblGrid` PHẢI mang đúng tỷ lệ mà `w:tcW` của từng ô đang khai (`0135`).
   *
   * Tới `0134` chỗ này chia ĐỀU bề rộng chữ cho số cột, kèm chú thích nói
   * `tblGrid` "chỉ là gợi ý khi bảng ở chế độ tự co". Câu ấy đúng một nửa: bảng
   * sản phẩm chạy ở chế độ **`fixed`**, và ở đó `tblGrid` không còn là gợi ý —
   * nó là định nghĩa lưới cột, đứng ngang hàng với `w:tcW`.
   *
   * Nên hai chỗ đang trả lời khác nhau về CÙNG một câu hỏi: lưới nói "mười cột
   * bằng nhau", ô nói "tên sản phẩm rộng gấp mười lần STT". Trình xem nghe theo
   * cái nào là chuyện của từng trình xem — và đó chính là thứ không được để tồn
   * tại. Cho lưới mang cùng tỷ lệ thì câu hỏi ấy hết chỗ để trả lời sai.
   *
   * Không đo được bằng ca kiểm: cái sai chỉ hiện ra ở bề rộng cột trong bản PDF
   * do LibreOffice dựng. Cái kiểm được — và ca kiểm canh đúng chỗ đó — là **hai
   * dãy số phải khớp nhau**.
   */
  const ts = trongSo?.length === cols ? trongSo : undefined;
  const tong = ts?.reduce((a, b) => a + b, 0);
  /*
   * KHÔNG có sàn `Math.max(360, …)` ở nhánh có trọng số, và đó là một quyết
   * định đã đo.
   *
   * Bản đầu của `0135` giữ sàn 360 twip cho cả hai nhánh — và ca kiểm đối chiếu
   * đỏ ngay: cột STT nặng 2/80 tức 2,36% bề rộng, nhưng sàn nong nó lên 3,68%.
   * Hai dãy số lại lệch nhau, đúng thứ lượt này sinh ra để bỏ đi.
   *
   * Sàn chỉ ở lại nhánh KHÔNG có trọng số, nơi nó vẫn làm đúng việc cũ: chia đều
   * cho một số cột rất lớn thì mỗi cột có thể ra vài chục twip.
   *
   * Cột quá hẹp giờ chặn ở chỗ đúng hơn — chính bộ `trongSo`, và
   * `RONG_TOI_THIEU_PCT` có một ca kiểm canh.
   */
  const rong = (i: number): number =>
    ts === undefined || tong === undefined || tong === 0
      ? Math.max(360, Math.floor(RONG_CHU / cols))
      : Math.round((RONG_CHU * ts[i]!) / tong);
  const grid = `<w:tblGrid>${ts === undefined ? `<w:gridCol w:w="${rong(0)}"/>`.repeat(cols) : ts.map((_, i) => `<w:gridCol w:w="${rong(i)}"/>`).join('')}</w:tblGrid>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblLayout w:type="${coDinh ? 'fixed' : 'autofit'}"/>` +
    /*
     * LỀ TRONG Ô hẹp lại còn 0,1cm mỗi bên (`0135`).
     *
     * Mặc định của Word là 0,19cm mỗi bên. Nghe nhỏ, nhưng bảng sản phẩm đủ cột
     * có mười một cột — 11 × 0,38cm = **4,2cm lề**, tức một phần tư bề rộng chữ
     * của khổ A4 dọc bị lề ăn mất trước khi chữ nào được vẽ.
     *
     * Đây là chỗ nới ra được nhiều nhất mà không lấy của cột nào: 0,1cm mỗi bên
     * trả lại gần 2cm cho phần chữ. Không hạ về 0 — chữ dính sát đường kẻ đọc
     * mệt, và cột số dính nhau thì mắt không tách được hai con số kề nhau.
     */
    `<w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar>` +
    /*
     * Màu đường kẻ `D3D3D3` — đọc từ hai file khách hàng gõ tay (`0165`).
     *
     * Bản trước dùng `999999`, đậm hơn hẳn. Trên một bảng mười một cột thì đường
     * kẻ đậm át cả con số: cái mắt bắt được trước tiên là cái lưới, không phải
     * dữ liệu. Đây là chỗ khách hàng đã tự chọn khi họ vẽ tờ mẫu, nên lấy đúng
     * con số ấy chứ không đoán một mức xám khác.
     */
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D3D3D3"/>` +
    `<w:left w:val="single" w:sz="4" w:color="D3D3D3"/>` +
    `<w:bottom w:val="single" w:sz="4" w:color="D3D3D3"/>` +
    `<w:right w:val="single" w:sz="4" w:color="D3D3D3"/>` +
    `<w:insideH w:val="single" w:sz="4" w:color="D3D3D3"/>` +
    `<w:insideV w:val="single" w:sz="4" w:color="D3D3D3"/></w:tblBorders>` +
    `</w:tblPr>${grid}${rowsXml.join('')}</w:tbl>`
  );
};

/** `body` là chuỗi XML gồm các `<w:p>` và `<w:tbl>` đã dựng bằng helper ở trên. */
/**
 * Khổ giấy A4 tính bằng twip (1/1440 inch): 210×297mm.
 *
 * `w:orient` KHÔNG đủ một mình — LibreOffice đọc nó nhưng vẫn lấy kích thước từ
 * `w:w`/`w:h`, nên khai `landscape` mà để nguyên hai số là ra một trang dọc có
 * nhãn "ngang". Phải đảo cả hai số.
 */
const A4_W = 11906;
const A4_H = 16838;

export function makeDocx(body: string, kho: 'a4p' | 'a4l' = 'a4p'): Buffer {
  const ngang = kho === 'a4l';
  const pgSz = ngang
    ? `<w:pgSz w:w="${A4_H}" w:h="${A4_W}" w:orient="landscape"/>`
    : `<w:pgSz w:w="${A4_W}" w:h="${A4_H}"/>`;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}<w:sectPr>${pgSz}<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      'docProps/core.xml': strToU8(CORE),
      'docProps/app.xml': strToU8(APP),
      'word/_rels/document.xml.rels': strToU8(DOC_RELS),
      'word/styles.xml': strToU8(STYLES),
      [DOCUMENT_XML]: strToU8(xml),
    }),
  );
}
