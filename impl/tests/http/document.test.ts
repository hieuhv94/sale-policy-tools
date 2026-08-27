/**
 * DOC-01 … DOC-09, DOC-17 … DOC-20 và CUST-11/CUST-12 — file, ký số, bản A4.
 *
 * Không có bản giả nào ở đây: MinIO thật, Gotenberg thật (Chromium thật), và PDF
 * sinh ra được ĐỌC LẠI bằng `pdfjs-dist` để đối chiếu chữ, bằng `pdf-lib` để đo
 * khổ giấy. Khẳng định "PDF đúng khổ A4" mà không mở file ra đo thì chỉ là
 * khẳng định rằng lời gọi đã trả về 200.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import {
  bangSanPhamXml,
  createTestApp as createDocumentApp,
  makeDocx,
  NGUON_BAT_BUOC_HO_SO,
  O_BANG_SAN_PHAM,
  para,
  Storage,
  SYSTEM_USER_ID,
  TemplatesService,
} from '@csbh/document/testing';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  bootPolicyListening,
  clearAccountCache,
  clearScopeCache,
  maDuyNhat,
  http,
  withAdminDb,
  phanCongMacDinh,
} from './app.js';

/**
 * Bộ đếm MST — MỖI khách hàng một mã số thuế riêng (`0104`).
 *
 * Dùng chung một số cho cả tệp thì `POST /customers` tra trùng MST trả về
 * danh sách lớn dần theo số khách hàng đã tạo — O(n²), và những ca chạy sau
 * cùng bắt đầu chạm ngưỡng quá giờ.
 */
let nMst = 0;

const SEED_PW = 'Test@1234';
const P = 'ZZDOC';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let doc: INestApplication;
let storage: Storage;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const uniq = (k: string) => maDuyNhat(P, k);

const dget = async (path: string, who: string) =>
  (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const dpost = async (path: string, who: string) =>
  (await http(doc)).post(path).set('Authorization', `Bearer ${tok[who]}`);
const ppost = async (path: string, body: object, who: string) =>
  (await http(policy)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const pget = async (path: string, who: string) =>
  (await http(policy)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const pdel = async (path: string, who: string) =>
  (await http(policy)).delete(path).set('Authorization', `Bearer ${tok[who]}`);
const ddel = async (path: string, who: string) =>
  (await http(doc)).delete(path).set('Authorization', `Bearer ${tok[who]}`);
/**
 * MỌI hành động đi qua đây tự kèm người được phân công (`0031`).
 *
 * Xem `phanCongMacDinh`. Ca nào quan tâm tới người cụ thể thì truyền trong
 * `body` — nó nằm sau nên ghi đè mặc định.
 */
const act = async (id: string, action: string, who: string, body: object = {}) =>
  ppost(`/policies/${id}/actions/${action}`, { ...(await phanCongMacDinh(action)), ...body }, who);

// --- Đọc PDF -----------------------------------------------------------------

/** Khổ giấy tính bằng điểm (pt). A4 = 210×297mm = 595,28 × 841,89 pt. */
async function pageSizes(pdf: Buffer): Promise<{ w: number; h: number }[]> {
  const d = await PDFDocument.load(new Uint8Array(pdf));
  return d.getPages().map((p) => ({
    w: Math.round(p.getWidth()),
    h: Math.round(p.getHeight()),
  }));
}

/**
 * Trích toàn bộ chữ trong PDF.
 *
 * `pdfjs-dist` đọc bảng ToUnicode mà Chromium nhúng vào font con, nên chữ tiếng
 * Việt có dấu ra đúng — đó là thứ chứng minh được `DOC-02` và phần tiếng Việt
 * của `DOC-34`, còn đếm số trang thì không.
 */
async function pdfText(pdf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const d = await task.promise;
  let out = '';
  for (let i = 1; i <= d.numPages; i++) {
    const page = await d.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  await d.destroy();
  // Chromium tách chữ theo từng đoạn hiển thị, nên khoảng trắng trong PDF không
  // giống trong HTML. Gộp lại trước khi so.
  return out.replace(/\s+/g, ' ');
}

/**
 * Bỏ HẾT khoảng trắng trước khi so chuỗi trong PDF.
 *
 * Chromium ngắt dòng bên trong ô hẹp, và `pdfjs` còn tách thêm một lần nữa theo
 * vị trí đặt chữ — nên một mã dài như `ZZDOC-KH-9-6ff1a4cd` trích ra thành
 * `ZZDOC-KH-9-6 ff 1a4cd`. Đó là bố cục đúng chứ không phải mất dữ liệu.
 *
 * Chỗ tách nằm ở đâu phụ thuộc vào chính các ký tự trong mã, mà mã thì mang hậu
 * tố ngẫu nhiên của mỗi lượt chạy. Nên phép so chính xác ở đây KHÔNG sai hẳn —
 * nó đỏ theo xác suất, mỗi vài chục lượt một lần, và người đọc sẽ đi tìm lỗi
 * trong bộ sinh PDF.
 */
const lien = (x: string): string => x.replace(/\s+/g, '');

/** Một dòng sản phẩm tối thiểu — chỉ dùng cho ca soi XML của bảng (`0055`). */
const DONG_MAU = {
  product_code_snap: 'SP-01',
  product_name_snap: 'San pham',
  company_price: '100000',
  wholesale_price: '90000',
  net_price: '87000',
  discount_rate: '13.00',
  threshold_snap: '15.00',
  note: null,
  cpbh: [] as string[],
};

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';
const CUSTOMER_NAME = 'Nhà thuốc Minh Châu — Quận Đống Đa';

const makeProduct = async (i = 0): Promise<string> => {
  const c = await http(catalog);
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      code: uniq('SP'),
      name: `Nutricare Gold ${i} — sữa dinh dưỡng`,
      groupCode, price: '100000' });
  await c
    .post(`/catalog/products/${r.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
  return r.body.id as string;
};

const makeCustomer = async (): Promise<{ id: string; code: string }> => {
  const code = uniq('KH');
  const r = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      code,
      name: CUSTOMER_NAME,
      customerType: 1,
      registeredAddress: 'Số 8 Tôn Thất Thuyết, Hà Nội',
      ownerName: 'Trần Thị Mỹ Hạnh',
      // `0104` — gửi duyệt đòi đủ MST và chức danh, nên khách hàng
      // của bộ test phải giống khách hàng thật.
      idNumber: String(5100555555 + ++nMst),
      ownerTitle: 'Chủ nhà thuốc',
      debt: '4500000', phone: '0900000000' });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, code };
};

const line = (productId: string, over: Record<string, unknown> = {}) => ({
  productId,
  wholesalePrice: '90000',
  cpbh: ['3000'],
  ...over,
});

async function draft(lineCount = 1): Promise<{ id: string; customerId: string; code: string }> {
  const cus = await makeCustomer();
  const lines = [];
  for (let i = 0; i < lineCount; i++) lines.push(line(await makeProduct(i)));
  const r = await ppost('/policies', { customerId: cus.id, lines }, 'tdv01');
  if (r.status !== 201) throw new Error(`lập hồ sơ hỏng: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, customerId: cus.id, code: cus.code };
}

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('x'.repeat(400)), Buffer.from('\n%%EOF\n')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);

const upload = async (
  who: string,
  q: Record<string, string>,
  body: Buffer,
  fileName = 'ho-so.pdf',
) => {
  const qs = new URLSearchParams(q).toString();
  return (await http(doc))
    .post(`/files?${qs}`)
    .set('Authorization', `Bearer ${tok[who]}`)
    .attach('file', body, { filename: fileName, contentType: 'application/pdf' });
};

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();
  for (const u of ['tdv01', 'tdv03', 'tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }

  const c = await bootCatalogListening();
  catalog = c.app;
  restores.push(c.restore);
  const cu = await bootCustomerListening();
  customer = cu.app;
  restores.push(cu.restore);
  const po = await bootPolicyListening();
  policy = po.app;
  restores.push(po.restore);

  doc = await createDocumentApp();
  storage = doc.get(Storage);

  /*
   * `document` NGHE THẬT, và trỏ `DOCUMENT_URL` vào nó (`0148`).
   *
   * Chiều gọi ngược với `bootPolicyListening` ở trên: từ `0148`, `policy` hỏi
   * `document` nhân bản giấy tờ khi lập phiên bản CSBH mới. Cùng một instance
   * `doc` đã dựng — supertest chạy được với app đang nghe, nên không cần bản
   * thứ hai, và một bản thứ hai sẽ có kho MinIO riêng của nó.
   */
  await doc.listen(0, '127.0.0.1');
  const cong = (doc.getHttpServer() as { address(): { port: number } }).address().port;
  const truocDocUrl = process.env.DOCUMENT_URL;
  process.env.DOCUMENT_URL = `http://127.0.0.1:${cong}`;
  restores.push(() => {
    if (truocDocUrl === undefined) delete process.env.DOCUMENT_URL;
    else process.env.DOCUMENT_URL = truocDocUrl;
  });

  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom DOC' });
  groupCode = g.body.code as string;
}, 120_000);

afterAll(async () => {
  await doc?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
});

// =============================================================================
// DOC-01 · DOC-02 · DOC-03 — bản CSBH A4
// =============================================================================

/**
 * Định danh mẫu hồ sơ mặc định khổ DỌC (`0058`).
 *
 * Ca nào khẳng định về NỘI DUNG bản mềm đều phải gọi kèm mẫu, không dựa vào mẫu
 * mở sẵn: "mẫu mở sẵn" là mẫu ban hành gần nhất, và bảng mẫu dùng chung cho mọi
 * tệp kiểm thử. Một ca ở `contract.test.ts` ban hành mẫu riêng của nó là mọi
 * khẳng định về nội dung ở đây đổi nghĩa — và đã đổi thật một lần.
 */
const mauDoc = async (): Promise<string> => {
  const r = await (await http(doc))
    .get('/policy-templates/available')
    .set('Authorization', `Bearer ${tok['tdv01']}`);
  const m = (r.body as { id: string; ten: string; khoGiay: string }[]).find(
    (x) => x.khoGiay === 'a4p' && x.ten.includes('mặc định'),
  );
  expect(m, 'thiếu mẫu hồ sơ mặc định khổ dọc').toBeDefined();
  return m!.id;
};

describe('DOC-01 sinh PDF khổ A4 dọc và ngang', () => {
  /*
   * `0058` — khổ giấy đi theo MẪU ĐƯỢC CHỌN, không còn là tham số của lời gọi.
   *
   * Ca này vì thế mạnh hơn bản cũ chứ không yếu đi: bản cũ chứng minh máy chủ
   * hiểu `?size=a4l`, bản này chứng minh **khổ giấy trong file .docx của mẫu đi
   * hết đường tới trang PDF** — qua bảng mẫu, qua Gotenberg, ra đúng số đo.
   */
  it('đúng khổ theo mẫu được chọn, không co méo ở cả hai hướng', async () => {
    const d = await draft(3);

    const ds = await (await http(doc))
      .get('/policy-templates/available')
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(ds.status, 'người xem bản mềm phải đọc được danh sách mẫu').toBe(200);
    const mau = ds.body as { id: string; ten: string; khoGiay: string }[];

    const doc_ = mau.find((m) => m.khoGiay === 'a4p');
    const ngang = mau.find((m) => m.khoGiay === 'a4l');
    expect(doc_, 'thiếu mẫu mặc định khổ dọc').toBeDefined();
    expect(ngang, 'thiếu mẫu mặc định khổ ngang').toBeDefined();

    const p = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=${doc_!.id}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    expect(p.status).toBe(200);
    expect(p.headers['content-type']).toBe('application/pdf');
    for (const s of await pageSizes(p.body as Buffer)) {
      expect(s.w).toBe(595);
      expect(s.h).toBe(842);
    }

    const l = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=${ngang!.id}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    for (const s of await pageSizes(l.body as Buffer)) {
      expect(s.w).toBe(842);
      expect(s.h).toBe(595);
    }
  }, 60_000);

  it('`0098` hồ sơ NHÁP: không chọn mẫu thì TỪ CHỐI, không rơi về mẫu mặc định', async () => {
    /*
     * ĐẢO NGƯỢC ca cũ, và đảo có chủ ý.
     *
     * Bản trước khẳng định đường "không tham số" phải ra một bản đọc được, vì
     * hộp xác nhận ký số dựng bản xem trước mà không có ô chọn nào. Từ `0098`
     * hộp ấy không cần đoán nữa: hồ sơ đã gửi duyệt thì mẫu nằm sẵn trên chính
     * hồ sơ, và bản xem trước lúc GỬI thì mang `mauId` người gửi vừa chọn.
     *
     * Nên mẫu mặc định ngầm mất chỗ đứng cuối cùng của nó. Với hồ sơ còn Nháp —
     * chưa gắn mẫu nào — câu trả lời đúng là hỏi lại, không phải đưa ra một bản
     * trình bày mà người xem không chọn: hai mẫu có hai tập cột khác nhau, nên
     * "một bản đọc được" chưa chắc là bản họ định đọc.
     */
    const d = await draft(1);
    const r = await (await http(doc))
      .get(`/policies/${d.id}/render`)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('TEMPLATE_REQUIRED');
  }, 60_000);

  it('`0098` thứ tự ô chọn vẫn ổn định: mẫu mặc định khổ DỌC đứng trước khổ ngang', async () => {
    /*
     * Phần CÒN GIÁ TRỊ của ca cũ, tách ra đứng riêng.
     *
     * Hai mẫu mặc định seed trong cùng một giao dịch nên `updated_at` bằng nhau;
     * không có phép phá hoà theo `paper_size` thì thứ tự rơi xuống `id` — uuid
     * ngẫu nhiên — và mẫu đứng đầu ô chọn là dọc hay ngang tuỳ từng lần cài đặt.
     * Nó thôi quyết định bản xem trước, nhưng vẫn quyết định thứ người dùng thấy
     * đầu tiên trong ô chọn.
     */
    const macDinh = (
      await (await http(doc))
        .get('/policy-templates/available')
        .set('Authorization', `Bearer ${tok['tdv01']}`)
    ).body as { ten: string; khoGiay: string }[];
    const chiMacDinh = macDinh.filter((m) => m.ten.includes('mặc định'));
    expect(chiMacDinh[0]!.khoGiay, 'mẫu mặc định khổ dọc phải đứng trước khổ ngang').toBe('a4p');
  }, 60_000);

  it('`0098` mẫu ĐÃ VÔ HIỆU thì từ chối, không âm thầm rơi về mẫu khác', async () => {
    /*
     * Tình huống có thật: người dùng mở hộp chọn, đi pha cà phê, trong lúc ấy
     * Quản trị xoá mẫu kia. Dựng bằng mẫu khác thì họ nhận về một văn bản không
     * phải thứ họ vừa chọn, và không có gì trên màn hình nói ra điều đó.
     *
     * `0058` dùng *ngừng dùng* cho tình huống này, `0067` đổi sang XOÁ, và
     * `0098` quay về vô hiệu hoá — câu trả lời của máy chủ giữ nguyên qua cả ba
     * đời: 404 nói rõ hãy chọn lại.
     *
     * Vô hiệu một mẫu do CHÍNH ca này thêm vào, không mượn mẫu mặc định: mượn rồi
     * trả lại là đổi thứ tự danh sách, và mẫu mở sẵn của mọi ca phía sau đổi
     * theo. Đúng cái bẫy đã làm DOC-20 đỏ với "expected 842 to be 595".
     */
    const d = await draft(1);
    const than = makeDocx(
      [...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)), para(O_BANG_SAN_PHAM)].join(''),
    );
    const up = await (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', 'Mẫu sắp bị xoá')
      .field('mapping', JSON.stringify(NGUON_BAT_BUOC_HO_SO.map((n) => ({ placeholder: `{{${n}}}`, source: n }))))
      .attach('file', than, {
        filename: 'sap-xoa.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    await (await http(doc))
      .post(`/policy-templates/${up.body.id}/vo-hieu`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ confirm: 'Mẫu sắp bị xoá' });

    const r = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=${up.body.id}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('TEMPLATE_NOT_USABLE');
  }, 60_000);

  it('`mauId` không phải định danh hợp lệ thì 400, không phải 500', async () => {
    const d = await draft(1);
    const r = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=khong-phai-uuid`)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(r.status).toBe(400);
  }, 30_000);
});

describe('DOC-02 PDF là VĂN BẢN, không phải ảnh chụp màn hình', () => {
  it('`0055` mọi giá trị của hồ sơ có trong PDF, và không có mảnh giao diện nào', async () => {
    const d = await draft(2);

    const pdf = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=${await mauDoc()}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    const text = await pdfText(pdf.body as Buffer);

    /*
     * `0055` — không còn bản HTML để đối chiếu.
     *
     * Ca này từng so chữ trong PDF với chuỗi HTML mà PDF được dựng từ đó. Từ
     * `0055` bản mềm sinh từ MẪU .docx của Quản trị, và `format=html` đã gỡ:
     * chỉ còn MỘT đường dựng, nên không có hai bản để mà lệch. Điều cần khẳng
     * định giờ là nội dung có mặt, và PDF không lẫn mảnh giao diện nào.
     */
    expect(lien(text)).toContain(lien(d.code));
    expect(lien(text)).toContain(lien(CUSTOMER_NAME));
    // Không phân biệt hoa thường: mẫu mặc định viết hoa cả dòng tiêu đề, còn
    // Quản trị sửa mẫu thì viết theo ý họ.
    expect(text.toLowerCase()).toContain('chính sách bán hàng');

    // Bố cục văn bản riêng: không có phần điều hướng nào của ứng dụng.
    //
    // Danh sách này chỉ gồm thứ thuộc về GIAO DIỆN. "Gửi duyệt" từng nằm ở đây
    // và làm test đỏ oan — nó là nhãn của một mốc thời gian trên chính bản CSBH,
    // không phải cái nút.
    for (const junk of ['Đăng xuất', 'Trang chủ', 'Bộ lọc', '<nav', '<button', 'onclick']) {
      expect(text, `PDF không được chứa "${junk}"`).not.toContain(junk);
    }
    // Và KHÔNG còn ô trống nào chưa điền: một bản CSBH mang chuỗi `{{...}}` đi
    // ký là hỏng nặng hơn thiếu một mục.
    expect(text).not.toContain('{{');
  }, 60_000);
});

describe('DOC-03 bản CSBH xem có đủ 13 mục tối thiểu', () => {
  it('đủ cả 13, đọc thẳng từ chữ trong PDF', async () => {
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    const pdf = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=${await mauDoc()}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    const t = await pdfText(pdf.body as Buffer);

    const required = [
      'CÔNG TY CỔ PHẦN DINH DƯỠNG NUTRICARE', //   1. thông tin công ty
      'Người đề nghị', //                      2. người đề nghị
      'Thời gian áp dụng', //                  3. thời gian áp dụng
      'Công nợ', //                            4. công nợ
      d.code, //                               5. mã khách hàng
      CUSTOMER_NAME, //                        6. tên khách hàng
      'Nutricare Gold', //                     7. tên sản phẩm
      'CPBH1', //                              8. chi phí bán hàng
      'Trạng thái', //                         9. trạng thái
      'File đính kèm', //                     10. file đính kèm
      'Trưởng bộ phận', //                    11. TBP
      'Kế toán', //                           12. kế toán
      'Thời gian duyệt', //                   13. thời gian duyệt
    ];
    const phang = lien(t);
    for (const r of required) expect(phang, `thiếu mục "${r}"`).toContain(lien(r));
  }, 60_000);
});

describe('DOC-19 hồ sơ nhiều dòng sản phẩm', () => {
  it('ngắt trang đúng, dòng tiêu đề lặp lại, không mất dòng cuối', async () => {
    // 60 dòng thay vì 200: mỗi dòng cần một sản phẩm riêng trong danh mục, và
    // 200 lượt tạo sản phẩm làm test chạy vài phút mà không chứng minh thêm gì —
    // điều cần chứng minh là CÓ ngắt trang và không mất dòng, và 60 dòng đã tràn
    // sang trang thứ hai.
    const d = await draft(60);
    const pdf = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=${await mauDoc()}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');

    const sizes = await pageSizes(pdf.body as Buffer);
    expect(sizes.length).toBeGreaterThan(1);

    const t = await pdfText(pdf.body as Buffer);
    /*
     * Dòng tiêu đề lặp lại ở mỗi trang CÓ BẢNG — `w:tblHeader` trong Word, chỗ
     * trước `0055` là `thead { display: table-header-group }` trong CSS.
     *
     * KHÔNG so bằng số trang nữa: mẫu có phần chữ đứng SAU bảng (thời gian
     * duyệt, chỗ ký, file đính kèm), nên trang cuối có thể không còn hàng bảng
     * nào. Điều cần chứng minh là tiêu đề lặp lại, không phải lặp đúng mấy lần.
     */
    const headers = t.split('Giá công ty').length - 1;
    expect(headers, 'tiêu đề bảng phải lặp lại qua các trang').toBeGreaterThan(1);
    expect(headers).toBeLessThanOrEqual(sizes.length);
    // Dòng cuối cùng phải còn: số thứ tự 60 xuất hiện.
    expect(t).toContain(' 60 ');
  }, 180_000);
});

describe('DOC-20 nhiều yêu cầu render cùng lúc', () => {
  it('năm lượt song song đều ra PDF hợp lệ', async () => {
    const d = await draft(2);
    const agent = await http(doc);
    const mau = await mauDoc();
    const runs = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent
          .get(`/policies/${d.id}/render?mauId=${mau}`)
          .set('Authorization', `Bearer ${tok['tdv01']}`)
          .responseType('blob'),
      ),
    );
    for (const r of runs) {
      expect(r.status).toBe(200);
      expect((await pageSizes(r.body as Buffer))[0]!.w).toBe(595);
    }
  }, 120_000);
});

// =============================================================================
// `0103` DOC-07 — ký nội bộ, và BẢN LƯU đã gỡ
// =============================================================================

describe('`0103` bản lưu ký số đã gỡ', () => {
  /*
   * DOC-04 và DOC-05 NGHỈ ở `0103`. Cả hai kiểm bản lưu ký số — bản chưa ký và
   * bản đã ký là hai object khác nhau trên MinIO, nối qua `signed_from_id`. Khách
   * hàng chốt 24/08 là không cần bản lưu ấy: từ `0101` hồ sơ đã giữ ảnh chụp
   * khách hàng, người đề nghị và tên TBP đã ký, nên câu hỏi hai ca kia sinh ra để
   * trả lời nay trả lời được bằng chính hồ sơ.
   *
   * Ca dưới đây thay chỗ chúng, và nó kiểm chuyện NGƯỢC LẠI: đường ấy không còn.
   * Có ca này thì một lượt khôi phục nhầm — dán lại phương thức, hay bật lại
   * đường trong gateway — không đi qua được im lặng.
   */
  it('POST /policies/:id/sign-file không còn là một đường của máy chủ', async () => {
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    // 404 chứ không phải 403: đường không tồn tại, chứ không phải TBP hết quyền.
    const r = await dpost(`/policies/${d.id}/sign-file`, 'tbp01');
    expect(r.status, JSON.stringify(r.body)).toBe(404);
  }, 60_000);

  it('bước KÝ trong luồng duyệt thì KHÔNG bỏ — chỉ bản lưu bỏ', async () => {
    /*
     * Ranh giới dễ trượt nhất của `0103`. "Bỏ bản lưu ký số" mà đọc thành "bỏ ký
     * số" là bỏ luôn một bước của luồng mười bước.
     */
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    const pdf = await (await http(doc))
      .get(`/policies/${d.id}/render`)
      .set('Authorization', `Bearer ${tok['tbp01']}`)
      .responseType('blob');
    expect(pdf.status).toBe(200);
    // Khối chữ ký vẫn in ra bản mềm qua `{{ho_so.chu_ky_so_TBP}}`.
    expect(lien(await pdfText(pdf.body as Buffer))).toContain(lien('TBP đã ký số'));
  }, 90_000);

  it('DOC-07 cơ chế ký không gọi HSM, CA hay dịch vụ chứng thư số nào', async () => {
    /*
     * Nửa còn lại của DOC-07. Nửa kia — "chữ ký chỉ gồm ba trường" — đi cùng bản
     * lưu; lời hứa "ký điện tử NỘI BỘ, không phải chứng thư số pháp lý" thì vẫn
     * đứng, và đây là chỗ duy nhất canh nó.
     */
    const pkg = await import('../../services/document/package.json', {
      with: { type: 'json' },
    }).then((m) => m.default as { dependencies: Record<string, string> });

    const forbidden = /hsm|pkcs11|node-signpdf|@signpdf|x509|certificate-authority|acme/i;
    for (const dep of Object.keys(pkg.dependencies)) {
      expect(dep, `phụ thuộc ${dep} gợi ý chứng thư số pháp lý`).not.toMatch(forbidden);
    }
  });
});

// =============================================================================
// DOC-06 — toàn vẹn file
// =============================================================================

describe('DOC-06 file trên kho bị sửa ngoài đường ứng dụng', () => {
  it('phát hiện lệch SHA-256 và từ chối trả nội dung', async () => {
    const d = await draft(1);
    const up = await upload(
      'tdv01',
      { ownerKind: 'POLICY', ownerId: d.id, purpose: 'HO_SO' },
      PDF,
      'ho-so-goc.pdf',
    );
    expect(up.status).toBe(201);

    expect((await dget(`/files/${up.body.id}/verify`, 'tdv01')).body.ok).toBe(true);

    // Sửa object thẳng trên MinIO — đúng kịch bản người có khoá quản trị kho.
    await storage.put(up.body.objectKey, Buffer.from('%PDF-1.4\nDA BI SUA\n%%EOF\n'), 'application/pdf');

    const verify = await dget(`/files/${up.body.id}/verify`, 'tdv01');
    expect(verify.body.ok).toBe(false);
    expect(verify.body.actual).not.toBe(verify.body.expected);

    const link = await dget(`/files/${up.body.id}/link`, 'tdv01');
    const dl = await (await http(doc))
      .get(link.body.url)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(dl.status).toBe(409);
    expect(dl.body.code).toBe('FILE_INTEGRITY_FAILED');
  }, 60_000);
});

// =============================================================================
// DOC-08 · DOC-09 — liên kết có hạn, gắn với người dùng
// =============================================================================

describe('DOC-08 · DOC-09 liên kết xem file', () => {
  it('liên kết hạn 5 phút, mở được bởi chính người xin nó', async () => {
    const d = await draft(1);
    const up = await upload('tdv01', { ownerKind: 'POLICY', ownerId: d.id, purpose: 'HO_SO' }, PDF);

    const link = await dget(`/files/${up.body.id}/link`, 'tdv01');
    expect(link.body.expiresInSec).toBe(300);
    // Không phải URL của MinIO: không có tên máy chủ kho lưu trữ trong đó.
    expect(link.body.url).toMatch(/^\/files\/[0-9a-f-]{36}\/content\?t=/);
    expect(link.body.url).not.toContain('minio');

    const ok = await (await http(doc))
      .get(link.body.url)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(ok.status).toBe(200);
  }, 60_000);

  it('DOC-09 người khác dùng ĐÚNG liên kết đó — 403', async () => {
    const d = await draft(1);
    const up = await upload('tdv01', { ownerKind: 'POLICY', ownerId: d.id, purpose: 'HO_SO' }, PDF);
    const link = (await dget(`/files/${up.body.id}/link`, 'tdv01')).body.url as string;

    // tdv03 thuộc nhánh khác trong cây tổ chức. Liên kết hợp lệ, còn hạn, nhưng
    // cấp cho tdv01 — chuyển tiếp liên kết không chuyển tiếp quyền xem.
    const other = await (await http(doc)).get(link).set('Authorization', `Bearer ${tok['tdv03']}`);
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('LINK_NOT_YOURS');

    // Và ngay cả khi tdv03 tự xin liên kết thì cũng không xin được: kiểm phạm vi
    // đứng trước, liên kết không bao giờ thay thế nó.
    const own = await dget(`/files/${up.body.id}/link`, 'tdv03');
    expect(own.status).toBe(403);
    expect(own.body.code).toBe('OUT_OF_SCOPE');
  }, 60_000);

  it('không có token thì không tải được, kể cả khi đã đăng nhập đúng người', async () => {
    const d = await draft(1);
    const up = await upload('tdv01', { ownerKind: 'POLICY', ownerId: d.id, purpose: 'HO_SO' }, PDF);
    const bare = await dget(`/files/${up.body.id}/content`, 'tdv01');
    expect(bare.status).toBe(400);
    expect(bare.body.code).toBe('LINK_TOKEN_MISSING');
  }, 60_000);
});

// =============================================================================
// DOC-18 — tên file tiếng Việt
// =============================================================================

describe('DOC-18 tên file tiếng Việt đầy đủ dấu', () => {
  it('lưu và tải về đúng tên, chuẩn hoá NFC nhất quán', async () => {
    const d = await draft(1);
    const nfc = 'Giấy phép đủ điều kiện kinh doanh dược.pdf'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd); // hai chuỗi khác nhau trên dây

    const qs = new URLSearchParams({
      ownerKind: 'POLICY',
      ownerId: d.id,
      purpose: 'HO_SO',
      fileName: nfd, // client gửi bản NFD, kiểu macOS
    }).toString();
    const up = await (await http(doc))
      .post(`/files?${qs}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });

    expect(up.status).toBe(201);
    expect(up.body.fileName).toBe(nfc);

    // Khoá lưu trữ KHÔNG mang tên tiếng Việt — chỉ chữ thường, số và dấu gạch.
    expect(up.body.objectKey).toMatch(/^[a-z0-9/_-]+$/);

    const link = await dget(`/files/${up.body.id}/link`, 'tdv01');
    const dl = await (await http(doc))
      .get(link.body.url)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(dl.status).toBe(200);
    // RFC 5987: tên có dấu đi ở filename*, không nhét vào filename.
    const cd = String(dl.headers['content-disposition'] ?? '');
    expect(cd).toContain(`filename*=UTF-8''`);
    expect(decodeURIComponent(cd.split("''")[1] ?? '')).toBe(nfc);
  }, 60_000);
});

// =============================================================================
// CUST-11 · CUST-12 — hồ sơ pháp lý của khách hàng
// =============================================================================

describe('CUST-11 tải hồ sơ pháp lý của khách hàng', () => {
  it('lưu được và hiện trong danh sách của khách hàng', async () => {
    const cus = await makeCustomer();
    const up = await upload(
      'tdv01',
      { ownerKind: 'CUSTOMER', ownerId: cus.id, purpose: 'PHAP_LY' },
      PDF,
      'giay-phep.pdf',
    );
    expect(up.status).toBe(201);
    expect(await storage.exists(up.body.objectKey)).toBe(true);

    const reg = await (await http(customer))
      .post(`/customers/${cus.id}/documents`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({
        kind: 'GIAY_PHEP_KINH_DOANH',
        fileName: up.body.fileName,
        objectKey: up.body.objectKey,
        sizeBytes: up.body.sizeBytes,
      });
    expect(reg.status).toBe(201);

    const list = await (await http(customer))
      .get(`/customers/${cus.id}/documents`)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].kind).toBe('GIAY_PHEP_KINH_DOANH');
  }, 60_000);
});

describe('CUST-12 file sai định dạng hoặc quá lớn', () => {
  it('400 và KHÔNG để lại object rác trên MinIO', async () => {
    const cus = await makeCustomer();
    const before = (await storage.listKeys(`phap_ly/${cus.id}`)).length;

    // Đổi tên .exe thành .pdf và khai Content-Type là PDF — cả hai đều do phía
    // client đặt. Phép kiểm phải dựa vào SỐ NHẬN DẠNG ĐẦU FILE.
    const fake = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]);
    const bad = await upload(
      'tdv01',
      { ownerKind: 'CUSTOMER', ownerId: cus.id, purpose: 'PHAP_LY' },
      fake,
      'giay-phep.pdf',
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('FILE_TYPE_NOT_ALLOWED');

    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(21 * 1024 * 1024)]);
    const tooBig = await upload(
      'tdv01',
      { ownerKind: 'CUSTOMER', ownerId: cus.id, purpose: 'PHAP_LY' },
      big,
      'to-qua.pdf',
    );
    // 413, không phải 400 như danh mục test ghi: multer chặn ngay trên dòng dữ
    // liệu trước khi 21MB kịp nằm hết trong RAM, và 413 là mã dành riêng cho
    // tình huống này. Phần quan trọng của yêu cầu không đổi — chặn được, và
    // không để lại object rác.
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.code).toBe('FILE_TOO_LARGE');

    expect((await storage.listKeys(`phap_ly/${cus.id}`)).length).toBe(before);
    const rows = await withAdminDb(async (c) =>
      c.query(`SELECT 1 FROM doc.stored_file WHERE owner_id = $1`, [cus.id]),
    );
    expect(rows.rowCount).toBe(0);
  }, 60_000);
});

// =============================================================================
// DOC-17 · WF-13 · WF-18 — bản scan và yêu cầu in lại
// =============================================================================

describe('`0050` DOC-17 · WF-13 · WF-18 bản scan GIỮ LẠI khi yêu cầu in lại', () => {
  it('object CÒN NGUYÊN sau yêu cầu in lại; Sale Admin gỡ thì mới xoá thật', async () => {
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');

    // WF-13: Sale Admin tải bản scan lên kho, rồi ghi con trỏ ở policy.
    const up = await upload(
      'sa01',
      { ownerKind: 'POLICY', ownerId: d.id, purpose: 'SCAN' },
      PNG,
      'ban-cung-da-ky.png',
    );
    expect(up.status).toBe(201);
    expect(up.body.contentType).toBe('image/png');
    expect(await storage.exists(up.body.objectKey)).toBe(true);

    const attach = await ppost(
      `/policies/${d.id}/attachments`,
      {
        kind: 'SCAN',
        fileName: up.body.fileName,
        objectKey: up.body.objectKey,
        sizeBytes: up.body.sizeBytes,
      },
      'sa01',
    );
    expect(attach.status).toBe(201);

    await act(d.id, 'SA_HANDOVER', 'sa01');

    // `0050` WF-18: kế toán yêu cầu in lại, và bản scan Ở LẠI.
    const reprint = await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', {
      reason: 'Bản cứng mờ, không đọc được chữ ký',
    });
    expect(reprint.status).toBe(200);

    /*
     * KHÔNG còn sự kiện huỷ, và object trên kho còn nguyên.
     *
     * Đây là ca đảo ngược hẳn so với bản trước: nó từng khẳng định object đã bị
     * xoá thật khỏi MinIO. Khách hàng chốt giữ lại để Sale Admin chủ động thay —
     * nên khẳng định phải lật, không phải xoá đi.
     */
    const ev = await withAdminDb(async (c) => {
      const r = await c.query(
        `SELECT 1 FROM pol.outbox WHERE routing_key = 'policy.scan_discarded'
          AND payload->>'policyId' = $1`,
        [d.id],
      );
      return r.rowCount;
    });
    expect(ev, 'policy.scan_discarded đã gỡ hẳn khỏi hệ thống').toBe(0);
    expect(await storage.exists(up.body.objectKey)).toBe(true);

    // Và liên kết cũ vẫn mở được — Sale Admin phải xem lại được bản bị chê.
    expect((await dget(`/files/${up.body.id}/link`, 'sa01')).status).toBe(200);

    /*
     * Sale Admin CHỦ ĐỘNG gỡ. Hai bước, và cả hai đều cần: gỡ con trỏ khỏi hồ
     * sơ, rồi xoá file trên kho. Đường thứ hai chỉ mở cho TDV và Sale Admin.
     */
    const dinhKem = (await pget(`/policies/${d.id}`, 'sa01')).body.attachments[0];
    expect((await pdel(`/policies/${d.id}/attachments/${dinhKem.id}`, 'sa01')).status).toBe(200);
    expect((await ddel(`/files/${up.body.id}`, 'sa01')).status).toBe(200);

    expect(await storage.exists(up.body.objectKey)).toBe(false);

    // Vết huỷ còn nguyên — ai huỷ, lúc nào, vì sao.
    const row = await withAdminDb(async (c) => {
      const r = await c.query<{ deleted_at: Date; delete_reason: string }>(
        `SELECT deleted_at, delete_reason FROM doc.stored_file WHERE id = $1`,
        [up.body.id],
      );
      return r.rows[0]!;
    });
    expect(row.deleted_at).not.toBeNull();
    expect(row.delete_reason).toContain('SALE_ADMIN');

    // File đã huỷ thì không mở lại được bằng liên kết cũ.
    const gone = await dget(`/files/${up.body.id}/link`, 'sa01');
    expect(gone.status).toBe(404);
    expect(gone.body.code).toBe('FILE_DISCARDED');
  }, 120_000);
});

/**
 * 0027 — ghi chú của dòng sản phẩm phải có mặt trên bản A4.
 *
 * Ghi chú chỉ hiện trên màn hình là ghi chú vô dụng: bản A4 mới là thứ người
 * duyệt ký tên vào, và nếu nó thiếu đúng phần chữ người lập viết ra thì người
 * lập sẽ quay về cách cũ — gọi điện nói miệng.
 */
describe('0027 ghi chú dòng sản phẩm trên bản CSBH A4', () => {
  it('cột Ghi chú có trong bản HTML, và nội dung hiện nguyên văn', async () => {
    const cus = await makeCustomer();
    const productId = await makeProduct(90);
    const r = await ppost(
      '/policies',
      { customerId: cus.id, lines: [line(productId, { note: 'Khách yêu cầu đóng thùng 12' })] },
      'tdv01',
    );
    expect(r.status, JSON.stringify(r.body)).toBe(201);

    const pdf = await (await http(doc))
      .get(`/policies/${r.body.id}/render?mauId=${await mauDoc()}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    const t = lien(await pdfText(pdf.body as Buffer));

    expect(t).toContain(lien('Ghi chú'));
    expect(t).toContain(lien('Khách yêu cầu đóng thùng 12'));
  }, 60_000);

  it('`0055` mọi hàng có SỐ Ô BẰNG NHAU, kể cả dòng thiếu khoản CPBH', () => {
    /*
     * Soi thẳng XML của bảng thay vì đi qua PDF: số ô mỗi hàng là thứ PDF không
     * nói ra được — chữ trích từ PDF không phân biệt nổi một ô rỗng với một ô
     * không tồn tại. Mà đây đúng là chỗ hỏng đáng sợ nhất: thiếu một ô thì mọi
     * cột bên phải nó trượt sang trái, và người ký đối chiếu nhầm cột.
     *
     * Dựng dữ liệu lệch hẳn: dòng đầu ba khoản CPBH, dòng sau không khoản nào.
     */
    const xml = bangSanPhamXml({
      lines: [
        { ...DONG_MAU, cpbh: ['1000', '2000', '3000'] },
        { ...DONG_MAU, cpbh: [] },
        { ...DONG_MAU, cpbh: ['500'] },
      ],
    } as never);

    const hang = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [];
    expect(hang.length, 'một hàng tiêu đề cộng ba dòng').toBe(4);
    const soO = hang.map((h) => (h.match(/<w:tc>/g) ?? []).length);
    expect(new Set(soO).size, `số ô lệch nhau: ${JSON.stringify(soO)}`).toBe(1);
    // Số cột CPBH bằng dòng NHIỀU KHOẢN NHẤT (muc 7.1): 9 cột cố định + 3.
    expect(soO[0]).toBe(12);
  });
});

// =============================================================================
// `0053` — N-01: ai đã TẢI bản scan
// =============================================================================

describe('`0053` N-01 lịch sử ghi lại người tải tệp của hồ sơ', () => {
  const lichSu = (id: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ seq: number; action: string; actor_role: string; from_status: string | null }>(
        `SELECT seq, action, actor_role, from_status::text AS from_status
           FROM pol.policy_event WHERE policy_id = $1 ORDER BY seq`,
        [id],
      );
      return r.rows;
    });

  const dem = (rows: { action: string }[], a: string) => rows.filter((r) => r.action === a).length;

  /** Hồ sơ tới `SA_DANG_XU_LY`, đã có một bản scan trên kho và trên hồ sơ. */
  const coBanScan = async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    // Dùng `upload()` như mọi ca khác: nó đặt `contentType` tường minh. Không
    // đặt thì supertest gửi `application/octet-stream` và máy chủ từ chối 400.
    const up = await upload(
      'sa01',
      { ownerKind: 'POLICY', ownerId: d.id, purpose: 'SCAN' },
      PDF,
      'ban-cung.pdf',
    );
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    await ppost(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: up.body.fileName, objectKey: up.body.objectKey },
      'sa01',
    );
    return { d, fileId: up.body.id as string };
  };

  const lienKet = async (fileId: string, who: string) => {
    const r = await dget(`/files/${fileId}/link`, who);
    expect(r.status).toBe(200);
    return r.body.url as string;
  };

  it('tải bản scan ghi một dòng TAI_BAN_SCAN kèm người và vai trò', async () => {
    const { d, fileId } = await coBanScan();
    const url = await lienKet(fileId, 'kt01');
    expect((await dget(url, 'kt01')).status).toBe(200);

    const rows = await lichSu(d.id);
    const dong = rows.filter((x) => x.action === 'TAI_BAN_SCAN');
    expect(dong).toHaveLength(1);
    expect(dong[0]!.actor_role).toBe('KE_TOAN');
    // Không phải bước chuyển — hồ sơ không đi đâu cả.
    expect(dong[0]!.from_status).toBeNull();
  }, 120_000);

  it('XEM (`xem=1`) thì KHÔNG ghi dòng nào', async () => {
    const { d, fileId } = await coBanScan();
    const url = await lienKet(fileId, 'kt01');
    expect((await dget(`${url}&xem=1`, 'kt01')).status).toBe(200);
    expect(dem(await lichSu(d.id), 'TAI_BAN_SCAN')).toBe(0);
  }, 120_000);

  it('mỗi lượt tải một dòng — hai người tải thì hai dòng, đúng vai trò', async () => {
    const { d, fileId } = await coBanScan();
    expect((await dget(await lienKet(fileId, 'kt01'), 'kt01')).status).toBe(200);
    expect((await dget(await lienKet(fileId, 'sa01'), 'sa01')).status).toBe(200);

    const rows = await lichSu(d.id);
    expect(dem(rows, 'TAI_BAN_SCAN')).toBe(2);
    expect(
      rows.filter((x) => x.action === 'TAI_BAN_SCAN').map((x) => x.actor_role).sort(),
    ).toEqual(['KE_TOAN', 'SALE_ADMIN']);
  }, 120_000);

  it('`0059` NĂM lượt tải song song: đủ năm dòng, `seq` liên tiếp', async () => {
    /*
     * Ca này bắt được một lỗi thật, và nó chuyển từ `contract.test.ts` sang đây
     * ở `0059` — đường tải bản mềm không ghi lịch sử nữa nên không còn chạm tới
     * `seq`, còn đường tải bản scan thì vẫn.
     *
     * Lỗi: `seq` cấp bằng `coalesce(max(seq),0)+1` ngay trong câu INSERT nhìn
     * như đã đủ an toàn, nhưng `max(seq)` chỉ thấy dòng ĐÃ COMMIT. Năm lượt
     * song song đọc ra cùng một con số, bốn lượt vỡ ở ràng buộc
     * `UNIQUE (policy_id, seq)`, và người dùng nhận 500 cho một thao tác đọc
     * thuần tuý. `SELECT ... FOR UPDATE` trên dòng hồ sơ xếp chúng thành hàng.
     */
    const { d, fileId } = await coBanScan();
    const url = await lienKet(fileId, 'kt01');
    const runs = await Promise.all([0, 1, 2, 3, 4].map(() => dget(url, 'kt01')));
    for (const r of runs) expect(r.status).toBe(200);

    const seq = await withAdminDb(async (c) => {
      const r = await c.query<{ seq: number }>(
        `SELECT seq FROM pol.policy_event
          WHERE policy_id = $1 AND action = 'TAI_BAN_SCAN' ORDER BY seq`,
        [d.id],
      );
      return r.rows.map((x) => x.seq);
    });
    expect(seq, 'không lượt nào bị nuốt').toHaveLength(5);
    // Liên tiếp: `seq` là số thứ tự của lịch sử, thủng một số là thủng một dòng.
    expect(seq.every((v, i) => i === 0 || v === seq[i - 1]! + 1)).toBe(true);
  }, 150_000);

  it('`0059` dòng tải xuống KHÔNG phá số thứ tự của bước duyệt sau đó', async () => {
    /*
     * `seq` là UNIQUE trên mỗi hồ sơ, và dòng tải xuống chen vào giữa chuỗi ấy.
     * Bước duyệt tiếp theo phải ghi được — tính sai thì nó vỡ ở ràng buộc CSDL
     * chứ không phải ở một khẳng định mềm.
     */
    const { d, fileId } = await coBanScan();
    expect((await dget(await lienKet(fileId, 'kt01'), 'kt01')).status).toBe(200);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);

    const rows = await lichSu(d.id);
    expect(rows.map((x) => x.action)).toContain('SA_HANDOVER');
    expect(new Set(rows.map((x) => x.seq)).size, 'seq không được trùng').toBe(rows.length);
  }, 150_000);

  it('tệp HỒ SƠ đính kèm ghi nhãn khác bản scan', async () => {
    /*
     * Hai nhãn chứ không một: "Tải bản scan bản cứng" và "Tải tệp đính kèm" nói
     * hai chuyện khác nhau về mức nhạy cảm — bản scan là bản mang chữ ký khách
     * hàng, và đó chính là tệp mà câu "ai đã tải nó về" có giá trị nhất.
     */
    const d = await draft();
    const up = await upload(
      'tdv01',
      { ownerKind: 'POLICY', ownerId: d.id, purpose: 'HO_SO' },
      PDF,
      'giay-phep.pdf',
    );
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    const url = await lienKet(up.body.id as string, 'tdv01');
    expect((await dget(url, 'tdv01')).status).toBe(200);

    const rows = await lichSu(d.id);
    expect(dem(rows, 'TAI_TEP_DINH_KEM')).toBe(1);
    expect(dem(rows, 'TAI_BAN_SCAN')).toBe(0);
  }, 120_000);

  it('tệp của KHÁCH HÀNG không ghi vào lịch sử hồ sơ nào', async () => {
    /*
     * Hồ sơ pháp lý thuộc về khách hàng, không thuộc hồ sơ nào — không có màn
     * hình lịch sử để ghi vào. Ca này giữ cho phép lọc theo `owner_kind` không
     * bị nới ra thành "mọi tệp", vốn sẽ đâm vào một `owner_id` không phải id hồ
     * sơ và làm hỏng cả lượt tải.
     */
    const cus = await makeCustomer();
    const up = await upload(
      'tdv01',
      { ownerKind: 'CUSTOMER', ownerId: cus.id, purpose: 'PHAP_LY' },
      PDF,
      'dkkd.pdf',
    );
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    const url = await lienKet(up.body.id as string, 'tdv01');
    // Điều cần chứng minh: tải được BÌNH THƯỜNG, không 500 vì đi tìm một hồ sơ
    // mang id của khách hàng.
    expect((await dget(url, 'tdv01')).status).toBe(200);
  }, 120_000);
});

// =============================================================================
// `0058` — hai danh sách vai trò phải nói cùng một câu
// =============================================================================

describe('`0058` ai xem được bản mềm thì thấy được danh sách mẫu', () => {
  it('READERS của render khớp NGUOI_XEM_HO_SO của danh sách mẫu', () => {
    /*
     * Hai hằng số nằm ở hai mô-đun, và chiều phụ thuộc hiện tại là render →
     * contracts, nên không nhập chung được mà không đảo kiến trúc cho một mảng
     * năm chuỗi. Bản sao thì phải có ca đối chiếu, nếu không nó sẽ lệch — và lệch
     * theo chiều nào cũng hỏng: rộng hơn là một vai trò thấy danh sách mẫu của
     * thứ họ không xem được, hẹp hơn là ô chọn trả 403 ngay khi hộp mở ra.
     */
    const doc_ = (f: string) => readFileSync(`services/document/src/${f}`, 'utf8');
    const lay = (ma: string, ten: string): string[] => {
      const m = ma.match(new RegExp(ten + '\\s*=\\s*\\[([^\\]]*)\\]'));
      expect(m, `không tìm thấy ${ten}`).not.toBeNull();
      return [...m![1]!.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]!).sort();
    };
    expect(lay(doc_('contracts/contracts.controller.ts'), 'NGUOI_XEM_HO_SO')).toEqual(
      lay(doc_('render/render.controller.ts'), 'READERS'),
    );
  });
});

// =============================================================================
// `0059` — CSDL còn dòng mẫu, kho lưu trữ mất object
// =============================================================================

describe('`0059` mẫu mất file trên kho lưu trữ', () => {
  /** Mẫu hồ sơ hợp lệ tối thiểu: đủ 13 mục bắt buộc và có ô bảng sản phẩm. */
  const mauDuMuc = (): Buffer =>
    makeDocx(
      [...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)), para(O_BANG_SAN_PHAM)].join(''),
    );

  /*
   * Tình huống này ĐÃ XẢY RA THẬT trong lúc phát triển, và triệu chứng của nó
   * không chỉ về phía nguyên nhân chút nào: mọi lượt xem bản mềm trả HTTP 500
   * kèm `S3Error: The specified key does not exist`, còn màn hình *Giấy tờ mẫu*
   * vẫn hiển thị mẫu ấy đang dùng bình thường.
   *
   * CSDL và kho đối tượng ghi riêng nên chúng lệch nhau được: phục hồi CSDL từ
   * một bản sao lưu mới hơn MinIO, dựng lại MinIO từ đầu, hoặc xoá nhầm một
   * object. Hai đường xử lý, tuỳ mẫu ai làm ra.
   */
  const doiFile = async (templateId: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ object_key: string; file_id: string }>(
        `SELECT f.object_key, f.id AS file_id FROM doc.contract_template t
           JOIN doc.stored_file f ON f.id = t.file_id WHERE t.id = $1`,
        [templateId],
      );
      return r.rows[0]!;
    });

  it('mẫu MẶC ĐỊNH tự dựng lại file — không cần ai đụng tay', async () => {
    /*
     * Tự chữa được vì mẫu mặc định do CHÍNH hệ thống sinh ra: dựng lại cho ra
     * đúng file cũ, không có gì để mất.
     *
     * Tới `0058` phép chữa này chỉ có cho mẫu HỢP ĐỒNG, nằm lẫn trong
     * `ensureDefaultHopDong` — nên mẫu hồ sơ, thứ mọi vai trò mở hằng ngày, lại
     * là thứ không tự chữa được. Ca này canh đúng chỗ ấy.
     */
    const ds = (await (await http(doc))
      .get('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)).body as {
      id: string;
      isDefault: boolean;
      paperSize: string;
    }[];
    const mau = ds.find((x) => x.isDefault && x.paperSize === 'a4p')!;
    const truoc = await doiFile(mau.id);

    // Xoá object đi, giữ nguyên dòng trong CSDL — đúng hình dạng của sự cố.
    await storage.remove(truoc.object_key);
    expect(await storage.exists(truoc.object_key)).toBe(false);

    // `ensureDefault` chạy lúc service khởi động; gọi thẳng cho nhanh.
    await doc.get(TemplatesService).ensureDefault(SYSTEM_USER_ID);

    const sau = await doiFile(mau.id);
    expect(sau.file_id, 'phải trỏ sang một file MỚI').not.toBe(truoc.file_id);
    expect(await storage.exists(sau.object_key)).toBe(true);

    // Và bản mềm dựng được trở lại — phép thử duy nhất chứng minh nó thật sự chữa.
    const d = await draft(1);
    const r = await (await http(doc))
      .get(`/policies/${d.id}/render?mauId=${mau.id}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    expect(r.status).toBe(200);
  }, 120_000);

  it('mẫu NGƯỜI DÙNG tải lên: 409 nói rõ ai sửa được, KHÔNG phải 500', async () => {
    /*
     * Ranh giới cố ý: mẫu người dùng soạn thì hệ thống KHÔNG dựng lại. Thay thầm
     * nội dung một văn bản nghiệp vụ bằng bố cục mặc định tệ hơn nhiều so với
     * báo lỗi — người ký sẽ đặt bút xuống dưới một thứ không phải thứ họ soạn.
     *
     * Nhưng báo lỗi phải là báo lỗi ĐÚNG: 409 với câu chữ nói ai tải lại được,
     * chứ không phải 500 kèm vết ngăn xếp của thư viện minio.
     */
    const up = await (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', 'Mau se mat file')
      // `0067`: ánh xạ đi CÙNG file trong một lượt lưu — không còn bước ánh xạ
      // riêng, và cũng không còn mẫu nào tồn tại mà chưa ánh xạ xong.
      .field('mapping', JSON.stringify(NGUON_BAT_BUOC_HO_SO.map((n) => ({ placeholder: `{{${n}}}`, source: n }))))
      .attach('file', mauDuMuc(), {
        filename: 'mat-file.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    try {
      await storage.remove((await doiFile(up.body.id)).object_key);

      const d = await draft(1);
      const r = await (await http(doc))
        .get(`/policies/${d.id}/render?mauId=${up.body.id}`)
        .set('Authorization', `Bearer ${tok['tdv01']}`);
      expect(r.status, 'phải là 409 chứ không phải 500').toBe(409);
      expect(r.body.code).toBe('TEMPLATE_FILE_MISSING');
      expect(r.body.message).toContain('Quản trị hệ thống');

      // Và `ensureDefault` KHÔNG được lặng lẽ dựng lại mẫu của người dùng.
      await doc.get(TemplatesService).ensureDefault(SYSTEM_USER_ID);
      expect(await storage.exists((await doiFile(up.body.id)).object_key)).toBe(false);
    } finally {
      // `0098`: không còn đường xoá. Vô hiệu hoá là đủ cho việc dọn dẹp ở đây —
      // mẫu hỏng file rời khỏi ô chọn của mọi ca chạy sau.
      await (await http(doc))
        .post(`/policy-templates/${up.body.id}/vo-hieu`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({ confirm: 'Mau se mat file' });
    }
  }, 120_000);
});

// =============================================================================
// `0148` — GIẤY TỜ ĐI THEO PHIÊN BẢN MỚI, VÀ AI ĐỌC ĐƯỢC TỆP PHÁP LÝ
// =============================================================================

/** Đính một tệp `HO_SO` vào hồ sơ: `document` giữ file, `policy` giữ con trỏ. */
async function dinhGiayTo(policyId: string, ten: string, who = 'tdv01') {
  const up = await upload('tdv01', { ownerKind: 'POLICY', ownerId: policyId, purpose: 'HO_SO' }, PDF, ten);
  expect(up.status, JSON.stringify(up.body)).toBe(201);
  const g = await ppost(
    `/policies/${policyId}/attachments`,
    { kind: 'HO_SO', fileName: ten, objectKey: up.body.objectKey, sizeBytes: up.body.sizeBytes },
    who,
  );
  expect(g.status, JSON.stringify(g.body)).toBe(201);
  return up.body.objectKey as string;
}

/** Đưa một hồ sơ đi hết mười bước, trả lại chính id ấy. */
async function chayHetLuong(id: string): Promise<void> {
  expect((await act(id, 'SUBMIT', 'tdv01')).status).toBe(200);
  expect((await act(id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
  expect((await act(id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
  const scan = await upload('sa01', { ownerKind: 'POLICY', ownerId: id, purpose: 'SCAN' }, PDF, 'ban-cung.pdf');
  expect(scan.status).toBe(201);
  expect(
    (
      await ppost(
        `/policies/${id}/attachments`,
        { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: scan.body.objectKey, sizeBytes: scan.body.sizeBytes },
        'sa01',
      )
    ).status,
  ).toBe(201);
  expect((await act(id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
  expect((await act(id, 'KT_RECEIVE_L2', 'kt01')).status).toBe(200);
}

describe('`0148` phiên bản mới thừa kế GIẤY TỜ, không thừa kế bản cứng', () => {
  it('chép tệp `HO_SO` sang bản mới, và bản mới có tệp RIÊNG chứ không dùng chung', async () => {
    /*
     * Cái hỏng lượt này chữa: bản mới thừa kế đủ mọi dòng sản phẩm — nên nó
     * *trông như* đã thừa kế mọi thứ — mà không mang theo một tờ giấy nào. Người
     * lập đọc màn hình ra "đã đầy đủ", gửi duyệt, và Trưởng bộ phận mở ra không
     * thấy giấy tờ nào. Không cảnh báo, không ai sai.
     *
     * `objectKey` phải KHÁC: hai dòng cùng trỏ một object thì `discard` — vốn
     * XOÁ object khỏi kho chứ không chỉ đánh dấu dòng — biến lượt gỡ giấy tờ ở
     * bản cũ thành lượt xoá tệp của bản mới.
     */
    const d = await draft();
    const khoaCu = await dinhGiayTo(d.id, 'giay-phep-kinh-doanh.pdf');
    await chayHetLuong(d.id);

    const v2 = await ppost(
      '/policies',
      { customerId: d.customerId, mode: 'AMEND', lines: [line(await makeProduct(9))] },
      'tdv01',
    );
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);

    const tep = (await pget(`/policies/${v2.body.id}`, 'tdv01')).body.attachments as {
      kind: string;
      fileName: string;
      objectKey: string;
    }[];
    const giayTo = tep.filter((t) => t.kind === 'HO_SO');
    expect(giayTo, 'bản mới phải thừa kế giấy tờ của bản cũ').toHaveLength(1);
    expect(giayTo[0]!.fileName).toBe('giay-phep-kinh-doanh.pdf');
    expect(giayTo[0]!.objectKey, 'phải là BẢN CHÉP, không dùng chung object').not.toBe(khoaCu);
    expect(await storage.exists(giayTo[0]!.objectKey)).toBe(true);
    expect(await storage.exists(khoaCu), 'tệp của bản cũ vẫn còn nguyên').toBe(true);
  }, 240_000);

  it('KHÔNG chép bản cứng — nó là chữ ký của phiên bản CŨ', async () => {
    /*
     * Chép cả `SCAN` thì `SA_HANDOVER` của bản mới đi qua chốt `SCAN_REQUIRED`
     * (WF-14) bằng tờ giấy đã ký của một bản khác: không ai scan gì cả mà hệ
     * thống tin là đã có bản cứng. Đó là một lỗ hổng, không phải một tiện ích.
     */
    const d = await draft();
    await dinhGiayTo(d.id, 'giay-to.pdf');
    await chayHetLuong(d.id);

    const cu = (await pget(`/policies/${d.id}`, 'tdv01')).body.attachments as { kind: string }[];
    expect(cu.filter((t) => t.kind === 'SCAN'), 'bản cũ phải CÓ bản cứng').toHaveLength(1);

    const v2 = await ppost(
      '/policies',
      { customerId: d.customerId, mode: 'AMEND', lines: [line(await makeProduct(8))] },
      'tdv01',
    );
    const tep = (await pget(`/policies/${v2.body.id}`, 'tdv01')).body.attachments as {
      kind: string;
    }[];
    expect(tep.filter((t) => t.kind === 'SCAN'), 'bản cứng KHÔNG được đi theo').toHaveLength(0);
    expect(tep.filter((t) => t.kind === 'HO_SO')).toHaveLength(1);
  }, 240_000);

  it('Trưởng bộ phận của bản mới TẢI XUỐNG được tệp thừa kế', async () => {
    /*
     * Ca đáng giá nhất, và là lý do lượt chép phải đi qua `document` chứ không
     * chỉ chép con trỏ trong `pol.policy_attachment`.
     *
     * Chép mỗi con trỏ thì dòng tệp vẫn hiện trên màn hình bản mới, nhưng
     * `doc.stored_file.owner_id` còn ghi hồ sơ CŨ — và lượt kiểm quyền lúc tải
     * đọc đúng cột ấy. Kết quả: một dòng bấm vào thì 403, tức đúng cái hỏng
     * đang chữa, chỉ đổi hình dạng.
     */
    const d = await draft();
    await dinhGiayTo(d.id, 'giay-to.pdf');
    await chayHetLuong(d.id);

    const v2 = await ppost(
      '/policies',
      { customerId: d.customerId, mode: 'AMEND', lines: [line(await makeProduct(7))] },
      'tdv01',
    );
    expect((await act(v2.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const tep = (await pget(`/policies/${v2.body.id}`, 'tbp01')).body.attachments as {
      objectKey: string;
    }[];
    expect(tep).toHaveLength(1);

    const ds = await dget(`/files?ownerKind=POLICY&ownerId=${v2.body.id}`, 'tbp01');
    expect(ds.status, JSON.stringify(ds.body)).toBe(200);
    const f = (ds.body as { id: string; objectKey: string }[]).find(
      (x) => x.objectKey === tep[0]!.objectKey,
    );
    expect(f, 'tệp thừa kế phải thuộc về hồ sơ MỚI ở document').toBeDefined();
    expect((await dget(`/files/${f!.id}/link`, 'tbp01')).status).toBe(200);
  }, 240_000);
});

describe('`0148` ai nhìn thấy khách hàng thì đọc được hồ sơ pháp lý', () => {
  /** Khách hàng có một tệp pháp lý, và một hồ sơ đã giao cho tbp01. */
  async function khachCoTepVaHoSo() {
    const d = await draft();
    const up = await upload(
      'tdv01',
      { ownerKind: 'CUSTOMER', ownerId: d.customerId, purpose: 'PHAP_LY' },
      PDF,
      'giay-phep.pdf',
    );
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    // Gửi duyệt là lúc `policy` cấp quyền xem khách hàng cho người được giao
    // (`0031`) — đó chính là đường tbp01 nhìn thấy khách hàng này.
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    return { customerId: d.customerId, fileId: up.body.id as string };
  }

  it('Trưởng bộ phận LIỆT KÊ và TẢI XUỐNG được', async () => {
    /*
     * Trước `0148`, `document` tự khai luật *"khách hàng thì theo TDV phụ
     * trách"* — đúng ở `0031` và sai từ đúng lúc ấy, vì `0031` cũng dựng ra
     * `cus.customer_access`. Hệ quả: Trưởng bộ phận mở được màn hình khách hàng
     * mà nhận 403 ở mọi tệp pháp lý trên chính màn hình ấy.
     */
    const { customerId, fileId } = await khachCoTepVaHoSo();

    const ds = await dget(`/files?ownerKind=CUSTOMER&ownerId=${customerId}`, 'tbp01');
    expect(ds.status, JSON.stringify(ds.body)).toBe(200);
    expect((ds.body as { id: string }[]).map((x) => x.id)).toContain(fileId);

    expect((await dget(`/files/${fileId}`, 'tbp01')).status).toBe(200);
    expect((await dget(`/files/${fileId}/link`, 'tbp01')).status).toBe(200);
  }, 180_000);

  it('nhưng KHÔNG tải lên và KHÔNG xoá được — đọc và ghi là hai câu', async () => {
    const { customerId, fileId } = await khachCoTepVaHoSo();

    const them = await upload(
      'tbp01',
      { ownerKind: 'CUSTOMER', ownerId: customerId, purpose: 'PHAP_LY' },
      PDF,
      'tbp-tu-them.pdf',
    );
    expect(them.status, 'Trưởng bộ phận không được thêm giấy tờ pháp lý').toBe(403);

    const xoa = await ddel(`/files/${fileId}`, 'tbp01');
    // 403 vì vai trò (`@Roles('SALE_ADMIN','TDV')`) — chốt chặn đầu tiên đã đủ,
    // và `assertCanWrite` là lớp thứ hai cho Sale Admin, vai trò CÓ trong danh
    // sách ấy nhưng không phải TDV phụ trách khách này.
    expect(xoa.status).toBe(403);
    const saXoa = await ddel(`/files/${fileId}`, 'sa01');
    expect(saXoa.status, 'Sale Admin cũng không xoá được tệp của khách người khác').toBe(403);

    // Và tệp vẫn còn nguyên sau cả ba lượt thử.
    expect((await dget(`/files/${fileId}`, 'tdv01')).status).toBe(200);
  }, 180_000);

  it('người NGOÀI phạm vi vẫn 403 — luật nới cho người xem, không nới cho tất cả', async () => {
    // tdv03 không phụ trách khách này và chưa từng được giao hồ sơ nào của họ.
    const { customerId, fileId } = await khachCoTepVaHoSo();
    expect((await dget(`/files?ownerKind=CUSTOMER&ownerId=${customerId}`, 'tdv03')).status).toBe(403);
    expect((await dget(`/files/${fileId}/link`, 'tdv03')).status).toBe(403);
  }, 180_000);

  it('Quản trị hệ thống đọc được, dù phạm vi dữ liệu của họ RỖNG', async () => {
    /*
     * Phạm vi của Quản trị là rỗng (`0031`) nên họ không bao giờ khớp một danh
     * sách người — mà họ mở được màn hình khách hàng. Thiếu nhánh riêng cho họ
     * thì tệp pháp lý là thứ duy nhất trên màn hình ấy họ không mở được.
     */
    const { customerId, fileId } = await khachCoTepVaHoSo();
    expect((await dget(`/files?ownerKind=CUSTOMER&ownerId=${customerId}`, 'admin01')).status).toBe(200);
    expect((await dget(`/files/${fileId}/link`, 'admin01')).status).toBe(200);
  }, 180_000);
});
