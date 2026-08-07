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
export const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_.[\]]+)\s*\}\}/g;

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
};

const fill = (paragraph: string, values: Record<string, string>): string => {
  const before = textOf(paragraph);
  const after = before.replace(PLACEHOLDER_RE, (whole, name: string) => values[`{{${name}}}`] ?? whole);
  return after === before ? paragraph : setParagraphText(paragraph, after);
};

export function mergeDocx(buf: Buffer, input: MergeInput): Buffer {
  let xml = documentXml(buf);

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

const CELL_WIDTH = 1800;

const cell = (text: string): string =>
  `<w:tc><w:tcPr><w:tcW w:w="${CELL_WIDTH}" w:type="dxa"/></w:tcPr>${para(text)}</w:tc>`;

export const tableRow = (cells: string[]): string => `<w:tr>${cells.map(cell).join('')}</w:tr>`;

export const table = (rowsXml: string[]): string => {
  const cols = (rowsXml[0]?.match(/<w:tc[ >]/g) ?? []).length || 1;
  const grid = `<w:tblGrid>${`<w:gridCol w:w="${CELL_WIDTH}"/>`.repeat(cols)}</w:tblGrid>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>` +
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
export function makeDocx(body: string): Buffer {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
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
