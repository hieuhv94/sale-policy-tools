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
const textOf = (xml: string): string =>
  [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? '').join('');

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
const rows = (xml: string): string[] => xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];

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
  /** Giá trị cho ô trống đơn: khoá là `{{customer.name}}`. */
  values: Record<string, string>;
  /**
   * Giá trị theo DÒNG SẢN PHẨM. Mỗi phần tử là một bản đồ ô trống → giá trị.
   * Dòng bảng nào chứa ô trống thuộc nhóm này sẽ được NHÂN BẢN cho mỗi dòng (DOC-32).
   */
  lines: Record<string, string>[];
  /** Tập ô trống thuộc nhóm dòng sản phẩm, để nhận ra dòng bảng cần nhân bản. */
  linePlaceholders: Set<string>;
  /**
   * XML của CẢ MỘT BẢNG do hệ thống dựng, thay cho ô trống `{{policy.lines_table}}`
   * (`0055`).
   *
   * Vì sao bảng sản phẩm của bản CSBH KHÔNG vẽ được trong Word như bảng của hợp
   * đồng: muc 7.1 đòi số cột CPBH bằng dòng nhiều khoản nhất, mà mỗi dòng nhận
   * tới 50 khoản. Một bảng vẽ sẵn có số cột CỐ ĐỊNH, nên nó chỉ đúng cho những
   * hồ sơ tình cờ có đúng số khoản ấy.
   *
   * Nên người soạn mẫu đặt MỘT ô trống, và hệ thống trả về cả cái bảng. Ranh
   * giới rơi đúng chỗ: người soạn nắm phần chữ và bố cục, hệ thống giữ bảo đảm
   * về bảng số — thứ mà người ký đặt bút xuống dưới.
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

  // BƯỚC 1 — nhân bản dòng bảng sản phẩm TRƯỚC.
  //
  // Phải trước bước điền: sau khi điền thì ô trống không còn để mà nhận ra dòng
  // nào là dòng mẫu.
  for (const row of rows(xml)) {
    const text = textOf(row);
    const isLineRow = [...text.matchAll(PLACEHOLDER_RE)].some((m) =>
      input.linePlaceholders.has(`{{${m[1]}}}`),
    );
    if (!isLineRow) continue;

    const built = input.lines
      .map((lineValues) => paragraphs(row).reduce((acc, p) => acc.replace(p, fill(p, lineValues)), row))
      .join('');
    // Không có dòng sản phẩm nào thì bỏ hẳn dòng mẫu, không để lại một hàng đầy
    // `{{...}}` trong hợp đồng đưa cho khách hàng.
    xml = xml.replace(row, built);
  }

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
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Mau hop dong CSBH</dc:title><dc:creator>CSBH</dc:creator>
<cp:lastModifiedBy>CSBH</cp:lastModifiedBy></cp:coreProperties>`;

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>CSBH</Application></Properties>`;

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export const para = (text: string): string =>
  `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

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
const cell = (text: string, phanTram?: number): string => {
  const w =
    phanTram === undefined
      ? '<w:tcW w:w="0" w:type="auto"/>'
      : `<w:tcW w:w="${Math.round(phanTram)}" w:type="pct"/>`;
  return `<w:tc><w:tcPr>${w}</w:tcPr>${para(text)}</w:tc>`;
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
export const tableRow = (cells: string[], tieuDe = false, trongSo?: number[]): string => {
  const pr = tieuDe
    ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>'
    : '<w:trPr><w:cantSplit/></w:trPr>';
  const tong = trongSo?.reduce((a, b) => a + b, 0);
  const o = cells.map((c, i) =>
    trongSo === undefined || tong === undefined || tong === 0
      ? cell(c)
      : cell(c, (5000 * (trongSo[i] ?? 1)) / tong),
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
export const table = (rowsXml: string[], coDinh = false): string => {
  const cols = (rowsXml[0]?.match(/<w:tc[ >]/g) ?? []).length || 1;
  // `tblGrid` chỉ là GỢI Ý khi bảng ở chế độ tự co; chia đều bề rộng chữ cho số
  // cột để LibreOffice có điểm khởi đầu hợp lý thay vì dồn hết vào cột đầu.
  const rong = Math.max(360, Math.floor(RONG_CHU / cols));
  const grid = `<w:tblGrid>${`<w:gridCol w:w="${rong}"/>`.repeat(cols)}</w:tblGrid>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblLayout w:type="${coDinh ? 'fixed' : 'autofit'}"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:left w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:bottom w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:right w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:insideH w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders>` +
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
      [DOCUMENT_XML]: strToU8(xml),
    }),
  );
}
