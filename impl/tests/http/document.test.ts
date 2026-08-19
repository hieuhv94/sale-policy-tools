/**
 * DOC-01 … DOC-09, DOC-17 … DOC-20 và CUST-11/CUST-12 — file, ký số, bản A4.
 *
 * Không có bản giả nào ở đây: MinIO thật, Gotenberg thật (Chromium thật), và PDF
 * sinh ra được ĐỌC LẠI bằng `pdfjs-dist` để đối chiếu chữ, bằng `pdf-lib` để đo
 * khổ giấy. Khẳng định "PDF đúng khổ A4" mà không mở file ra đo thì chỉ là
 * khẳng định rằng lời gọi đã trả về 200.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { createTestApp as createDocumentApp, Storage } from '@csbh/document/testing';
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
      groupCode,
    });
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
      ownerTitle: 'Chủ nhà thuốc',
      debt: '4500000',
    });
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

describe('DOC-01 sinh PDF khổ A4 dọc và ngang', () => {
  it('đúng khổ, không co méo ở cả hai hướng', async () => {
    const d = await draft(3);

    const p = await (await http(doc))
      .get(`/policies/${d.id}/render?size=a4p`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    expect(p.status).toBe(200);
    expect(p.headers['content-type']).toBe('application/pdf');
    for (const s of await pageSizes(p.body as Buffer)) {
      expect(s.w).toBe(595);
      expect(s.h).toBe(842);
    }

    const l = await (await http(doc))
      .get(`/policies/${d.id}/render?size=a4l`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    for (const s of await pageSizes(l.body as Buffer)) {
      expect(s.w).toBe(842);
      expect(s.h).toBe(595);
    }
  }, 60_000);
});

describe('DOC-02 PDF khớp bản đang xem', () => {
  it('chữ trong PDF khớp bản HTML, và PDF không có menu hay nút thao tác', async () => {
    const d = await draft(2);

    const html = (
      await (await http(doc))
        .get(`/policies/${d.id}/render?format=html`)
        .set('Authorization', `Bearer ${tok['tdv01']}`)
    ).text;

    const pdf = await (await http(doc))
      .get(`/policies/${d.id}/render?size=a4p`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    const text = await pdfText(pdf.body as Buffer);

    // Cùng một nguồn HTML nên mọi giá trị trên màn hình phải có mặt trong PDF.
    // So sau khi bỏ hết khoảng trắng — lý do ở `lien`.
    expect(html).toContain(d.code);
    expect(lien(text)).toContain(lien(d.code));
    expect(lien(text)).toContain(lien(CUSTOMER_NAME));
    expect(text).toContain('Chính sách bán hàng');

    // Bố cục văn bản riêng: không có phần điều hướng nào của ứng dụng.
    //
    // Danh sách này chỉ gồm thứ thuộc về GIAO DIỆN. "Gửi duyệt" từng nằm ở đây
    // và làm test đỏ oan — nó là nhãn của một mốc thời gian trên chính bản CSBH,
    // không phải cái nút.
    for (const junk of ['Đăng xuất', 'Trang chủ', 'Bộ lọc', '<nav', '<button', 'onclick']) {
      expect(text, `PDF không được chứa "${junk}"`).not.toContain(junk);
      expect(html, `bản xem không được chứa "${junk}"`).not.toContain(junk);
    }
  }, 60_000);
});

describe('DOC-03 bản CSBH xem có đủ 13 mục tối thiểu', () => {
  it('đủ cả 13, đọc thẳng từ chữ trong PDF', async () => {
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    const pdf = await (await http(doc))
      .get(`/policies/${d.id}/render?size=a4l`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');
    const t = await pdfText(pdf.body as Buffer);

    const required = [
      'CÔNG TY TNHH DƯỢC PHẨM NUTRICARE', //   1. thông tin công ty
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
      .get(`/policies/${d.id}/render?size=a4l`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .responseType('blob');

    const sizes = await pageSizes(pdf.body as Buffer);
    expect(sizes.length).toBeGreaterThan(1);

    const t = await pdfText(pdf.body as Buffer);
    // Dòng tiêu đề lặp ở mỗi trang — `thead { display: table-header-group }`.
    const headers = t.split('Giá bán Công ty').length - 1;
    expect(headers).toBe(sizes.length);
    // Dòng cuối cùng phải còn: số thứ tự 60 xuất hiện.
    expect(t).toContain(' 60 ');
  }, 180_000);
});

describe('DOC-20 nhiều yêu cầu render cùng lúc', () => {
  it('năm lượt song song đều ra PDF hợp lệ', async () => {
    const d = await draft(2);
    const agent = await http(doc);
    const runs = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent
          .get(`/policies/${d.id}/render?size=a4p`)
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
// DOC-04 · DOC-05 · DOC-07 — ký số nội bộ
// =============================================================================

describe('DOC-04 · DOC-05 · DOC-07 ký số', () => {
  it('bản ký hiện chữ ký, họ tên, vai trò và dấu thời gian', async () => {
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    const r = await dpost(`/policies/${d.id}/sign-file`, 'tbp01');
    expect(r.status).toBe(201);

    const link = await dget(`/files/${r.body.signedFileId}/link`, 'tbp01');
    const signed = await (await http(doc))
      .get(link.body.url)
      .set('Authorization', `Bearer ${tok['tbp01']}`)
      .responseType('blob');
    const t = await pdfText(signed.body as Buffer);

    expect(t).toContain('ĐÃ KÝ SỐ');
    expect(t).toContain('Truong bo phan 01');
    expect(t).toContain('Trưởng bộ phận');
    expect(t).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  }, 90_000);

  it('DOC-05 bản nháp và bản đã ký là HAI object khác nhau trên MinIO', async () => {
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await dpost(`/policies/${d.id}/sign-file`, 'tbp01');

    const draftMeta = (await dget(`/files/${r.body.draftFileId}`, 'tbp01')).body;
    const signedMeta = (await dget(`/files/${r.body.signedFileId}`, 'tbp01')).body;

    expect(draftMeta.objectKey).not.toBe(signedMeta.objectKey);
    expect(draftMeta.sha256).not.toBe(signedMeta.sha256);
    expect(signedMeta.signedFromId).toBe(draftMeta.id);

    // Cả hai object CÙNG tồn tại: bản nháp không bị ghi đè.
    expect(await storage.exists(draftMeta.objectKey)).toBe(true);
    expect(await storage.exists(signedMeta.objectKey)).toBe(true);
  }, 90_000);

  it('DOC-07 cơ chế ký không gọi HSM, CA hay dịch vụ chứng thư số nào', async () => {
    const pkg = await import('../../services/document/package.json', {
      with: { type: 'json' },
    }).then((m) => m.default as { dependencies: Record<string, string> });

    const forbidden = /hsm|pkcs11|node-signpdf|@signpdf|x509|certificate-authority|acme/i;
    for (const dep of Object.keys(pkg.dependencies)) {
      expect(dep, `phụ thuộc ${dep} gợi ý chứng thư số pháp lý`).not.toMatch(forbidden);
    }

    // Chữ ký chỉ gồm ba trường, không có chứng thư, không có chuỗi tin cậy.
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await dpost(`/policies/${d.id}/sign-file`, 'tbp01');
    expect(Object.keys(r.body.signature as object).sort()).toEqual([
      'signedAt',
      'signerName',
      'signerRole',
    ]);
  }, 90_000);

  it('vai trò khác TBP không ký được', async () => {
    const d = await draft(1);
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    expect((await dpost(`/policies/${d.id}/sign-file`, 'kt01')).status).toBe(403);
    expect((await dpost(`/policies/${d.id}/sign-file`, 'tdv01')).status).toBe(403);
  }, 60_000);
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

    const html = (
      await (await http(doc))
        .get(`/policies/${r.body.id}/render?format=html`)
        .set('Authorization', `Bearer ${tok['tdv01']}`)
    ).text;

    expect(html).toContain('<th>Ghi chú</th>');
    expect(html).toContain('Khách yêu cầu đóng thùng 12');
  }, 60_000);

  it('dòng không có ghi chú vẫn đủ số cột — ô rỗng chứ không thiếu ô', async () => {
    // Bảng in ra giấy phải có số ô đều nhau ở mọi dòng; thiếu một ô là mọi cột
    // bên phải nó trượt sang trái và người ký đối chiếu nhầm cột.
    const d = await draft(1);
    const html = (
      await (await http(doc))
        .get(`/policies/${d.id}/render?format=html`)
        .set('Authorization', `Bearer ${tok['tdv01']}`)
    ).text;

    const bang = html.slice(html.indexOf('<table class="lines">'));
    const soCotTieuDe = (bang.slice(0, bang.indexOf('</thead>')).match(/<th>/g) ?? []).length;
    const hang = bang.slice(bang.indexOf('<tbody>'), bang.indexOf('</tbody>'));
    const soO = (hang.match(/<td/g) ?? []).length;
    expect(soO).toBe(soCotTieuDe);
  }, 60_000);
});

// =============================================================================
// `0053` — N-01: ai đã TẢI bản scan
// =============================================================================

describe('`0053` N-01 lịch sử ghi lại người tải tệp của hồ sơ', () => {
  const lichSu = (id: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ action: string; actor_role: string; from_status: string | null }>(
        `SELECT action, actor_role, from_status::text AS from_status
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
