/**
 * DOC-10 … DOC-16, DOC-21 … DOC-35 — mẫu hợp đồng và xuất hợp đồng.
 *
 * `.docx` thật, LibreOffice thật trong Gotenberg, PDF sinh ra được đọc lại bằng
 * `pdfjs-dist`. Cả hai đầu của phép biến đổi đều là file thật, nên bước dễ hỏng
 * nhất — ô trống bị Word cắt rời thành nhiều đoạn XML — không cách nào lọt qua.
 *
 * DOC-16 KHÔNG có ở đây, và đó là một quyết định chứ không phải bỏ sót. Xem
 * describe cuối file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp as createDocumentApp,
  TemplatesService,
  makeDocx,
  para,
  table,
  tableRow,
  placeholdersOf,
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
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZHD';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let doc: INestApplication;
let templates: TemplatesService;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const uniq = (k: string) => maDuyNhat(P, k);

const dget = async (path: string, who: string) =>
  (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const dpost = async (path: string, who: string, body: object = {}) =>
  (await http(doc)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const dput = async (path: string, who: string, body: object) =>
  (await http(doc)).put(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const ppost = async (path: string, body: object, who: string) =>
  (await http(policy)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const act = (id: string, action: string, who: string, body: object = {}) =>
  ppost(`/policies/${id}/actions/${action}`, body, who);

const pdfOf = async (path: string, who: string) =>
  (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`).responseType('blob');

/**
 * Bỏ HẾT khoảng trắng để so.
 *
 * LibreOffice ngắt dòng trong ô bảng hẹp, nên `ZZHD-SP-16-21919` ra khỏi trình
 * trích chữ thành `ZZHD- SP-16- 21919`. Đó là chuyện trình bày, không phải dữ
 * liệu thiếu — câu hỏi cần trả lời là "mã này có trong văn bản không".
 */
const packed = (s: string): string => s.replace(/\s+/g, '');

async function pdfText(pdf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const d = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  let out = '';
  for (let i = 1; i <= d.numPages; i++) {
    const c = await (await d.getPage(i)).getTextContent();
    out += c.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  await d.destroy();
  return out.replace(/\s+/g, ' ');
}

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';
const CUSTOMER_NAME = 'Nhà thuốc Minh Châu — Quận Đống Đa';
const ADDRESS_1 = 'Số 8 Tôn Thất Thuyết, Hà Nội';
const ADDRESS_2 = 'Số 145 Nguyễn Trãi, Thanh Xuân, Hà Nội';

const makeProduct = async (i = 0): Promise<string> => {
  const c = await http(catalog);
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      code: uniq('SP'),
      name: `Nutricare Gold ${i}`,
      groupCode,
      defaultRate2Type1: 1500,
      defaultRate2Type2: 1500,
      defaultRate2Type3: 1500,
    });
  // Kiểm NGAY tại đây. Không kiểm thì một lời gọi hỏng đi tiếp với `id`
  // undefined và nổ ba mươi dòng sau ở chỗ lập hồ sơ, với thông báo
  // "productId: phải là chuỗi" — chẳng liên quan gì tới nguyên nhân.
  if (r.status !== 201) throw new Error(`tạo sản phẩm hỏng: ${JSON.stringify(r.body)}`);
  await c
    .post(`/catalog/products/${r.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
  return r.body.id as string;
};

const makeCustomer = async (over: Record<string, unknown> = {}) => {
  const code = uniq('KH');
  const r = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      code,
      name: CUSTOMER_NAME,
      customerType: 1,
      registeredAddress: ADDRESS_1,
      ownerName: 'Trần Thị Mỹ Hạnh',
      debt: '4500000',
      ...over,
    });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, code };
};

const line = (productId: string) => ({ productId, wholesalePrice: '90000', cpbh1: '3000' });

async function draft(lineCount = 1, customerId?: string) {
  const cus = customerId ? { id: customerId, code: '' } : await makeCustomer();
  const lines = [];
  for (let i = 0; i < lineCount; i++) lines.push(line(await makeProduct(i)));
  const r = await ppost(
    '/policies',
    { customerId: cus.id, lines, ...(customerId ? { mode: 'AMEND' } : {}) },
    'tdv01',
  );
  if (r.status !== 201) throw new Error(`lập hồ sơ hỏng: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, customerId: cus.id, code: cus.code };
}

/** Đưa hồ sơ tới đúng bước Kế toán đã tiếp nhận lần 1 — cổng mở cho xuất hợp đồng. */
async function toReceivedL1(lineCount = 1) {
  const d = await draft(lineCount);
  await act(d.id, 'SUBMIT', 'tdv01');
  await act(d.id, 'TBP_SIGN', 'tbp01');
  await act(d.id, 'KT_RECEIVE_L1', 'kt01');
  return d;
}

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();
  for (const u of ['tdv01', 'tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
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
  templates = doc.get(TemplatesService);

  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom HD' });
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
// DOC-25 · DOC-29 · DOC-30 · DOC-33 — mẫu và bảng ánh xạ
// =============================================================================

/** Mẫu 12 ô trống, đúng con số ở DOC-25. */
const twelveSlotTemplate = () =>
  makeDocx(
    [
      para('{{company.name}} — {{company.address}}'),
      para('HỢP ĐỒNG với {{customer.name}} (mã {{customer.code}})'),
      para('Địa chỉ: {{customer.registered_address}}'),
      para('Đại diện: {{customer.owner_name}} — {{customer.owner_title}}'),
      para('Công nợ: {{customer.debt}}'),
      para('Hồ sơ {{policy.code}}, áp dụng {{policy.applied_date}}'),
      para('Người lập: {{person.tdv}}'),
      para('Ngày ký: {{today}}'),
    ].join(''),
  );

const uploadTemplate = async (who: string, buf: Buffer, name = 'Mẫu thử') =>
  (await http(doc))
    .post('/contract-templates')
    .set('Authorization', `Bearer ${tok[who]}`)
    .field('name', name)
    .attach('file', buf, {
      filename: 'mau.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

describe('DOC-25 tải lên mẫu .docx và đọc ô trống', () => {
  it('liệt kê đúng 12 ô trống, không bắt Sale Admin gõ tay', async () => {
    const r = await uploadTemplate('sa01', twelveSlotTemplate());
    expect(r.status).toBe(201);
    expect(r.body.placeholders).toHaveLength(12);
    expect(r.body.placeholders).toContain('{{customer.name}}');
    expect(r.body.knownSources.length).toBeGreaterThan(10);
  }, 60_000);

  it('ô trống bị Word cắt rời thành nhiều đoạn XML vẫn nhận ra được', async () => {
    // Word cắt một đoạn văn thành nhiều <w:r> bất cứ lúc nào nó muốn. Đây là
    // kiểu hỏng IM LẶNG: file vẫn sinh ra, chỉ là ô trống không được điền.
    const split =
      '<w:p><w:r><w:t>Kính gửi {{cus</w:t></w:r>' +
      '<w:r><w:t>tomer.</w:t></w:r>' +
      '<w:r><w:t>name}}, xin chào</w:t></w:r></w:p>';
    expect(placeholdersOf(makeDocx(split))).toEqual(['{{customer.name}}']);
  });
});

describe('DOC-33 file mẫu hỏng hoặc không phải .docx', () => {
  it('400 và mẫu đang dùng KHÔNG bị ảnh hưởng', async () => {
    const activeBefore = await templates.active();

    const notZip = await uploadTemplate('sa01', Buffer.from('day khong phai file docx'));
    expect(notZip.status).toBe(400);
    expect(notZip.body.code).toBe('TEMPLATE_NOT_DOCX');

    // Zip HỢP LỆ nhưng không có word/document.xml — mở được như zip, không phải
    // tài liệu Word. Hai đường hỏng khác nhau và phải chặn được cả hai.
    const { zipSync, strToU8 } = await import('fflate');
    const zipNoDoc = Buffer.from(zipSync({ 'ghi-chu.txt': strToU8('khong phai docx') }));
    const corrupt = await uploadTemplate('sa01', zipNoDoc);
    expect(corrupt.status).toBe(400);
    expect(corrupt.body.code).toBe('TEMPLATE_NOT_DOCX');

    const activeAfter = await templates.active();
    expect(activeAfter?.template.id).toBe(activeBefore?.template.id);
  }, 60_000);
});

describe('DOC-29 ánh xạ tới trường nguồn không tồn tại', () => {
  it('400 ngay lúc LƯU ánh xạ, không đợi tới lúc xuất', async () => {
    const t = await uploadTemplate('sa01', twelveSlotTemplate());
    const r = await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [{ placeholder: '{{customer.name}}', source: 'customer.ten_khong_co' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SOURCE_UNKNOWN');
    expect(r.body.knownSources).toContain('customer.name');
  }, 60_000);

  it('ánh xạ tới ô trống không có trong mẫu cũng bị chặn', async () => {
    const t = await uploadTemplate('sa01', twelveSlotTemplate());
    const r = await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [{ placeholder: '{{khong.co.trong.mau}}', source: 'customer.name' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PLACEHOLDER_NOT_IN_TEMPLATE');
  }, 60_000);
});

describe('DOC-30 phát hành mẫu còn ô trống chưa ánh xạ', () => {
  it('chặn và chỉ rõ ô nào chưa ánh xạ', async () => {
    const t = await uploadTemplate('sa01', twelveSlotTemplate());
    await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [{ placeholder: '{{customer.name}}', source: 'customer.name', required: true }],
    });

    const r = await dpost(`/contract-templates/${t.body.id}/publish`, 'sa01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('TEMPLATE_INCOMPLETE');
    expect(r.body.missing).toHaveLength(11);
    expect(r.body.missing).toContain('{{policy.code}}');
  }, 60_000);
});

describe('DOC-26 mẫu hợp đồng thuộc Sale Admin', () => {
  it('Quản trị hệ thống gọi API quản lý mẫu thì 403', async () => {
    expect((await dget('/contract-templates', 'admin01')).status).toBe(403);
    expect((await uploadTemplate('admin01', twelveSlotTemplate())).status).toBe(403);
    expect((await dget('/contract-templates', 'sa01')).status).toBe(200);
  }, 60_000);
});

// =============================================================================
// DOC-10 · DOC-11 · DOC-21 — cổng thời điểm và vai trò
// =============================================================================

describe('DOC-10 · DOC-21 cổng thời điểm giống nhau cho cả hai vai trò', () => {
  it('kế toán xuất khi chưa tiếp nhận L1 thì 409', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await dget(`/policies/${d.id}/contract/preview`, 'kt01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONTRACT_NOT_READY');
  }, 60_000);

  it('DOC-21 Sale Admin cũng 409 — quyền rộng ra nhưng cổng không mở sớm hơn', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await dget(`/policies/${d.id}/contract/preview`, 'sa01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONTRACT_NOT_READY');
  }, 60_000);
});

describe('DOC-11 gọi API xuất hợp đồng bằng cả 6 vai trò', () => {
  it('Kế toán 200 · Sale Admin 200 · bốn vai trò còn lại 403', async () => {
    const d = await toReceivedL1();

    for (const who of ['kt01', 'sa01']) {
      const r = await pdfOf(`/policies/${d.id}/contract.pdf`, who);
      expect(r.status, `${who} phải xuất được`).toBe(200);
      expect(r.headers['content-type']).toBe('application/pdf');
    }
    for (const who of ['tbp01', 'tdv01', 'bld01', 'admin01']) {
      const r = await dget(`/policies/${d.id}/contract.pdf`, who);
      expect(r.status, `${who} không được xuất`).toBe(403);
    }
  }, 120_000);
});

// =============================================================================
// DOC-14 · DOC-13 · DOC-31 · DOC-32 — trộn dữ liệu
// =============================================================================

describe('DOC-14 xem trước hợp đồng', () => {
  it('trộn đúng dữ liệu và KHÔNG tạo bản ghi nào', async () => {
    const d = await toReceivedL1(2);

    const before = await withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM doc.stored_file WHERE purpose <> 'MAU_HD'`,
      );
      return r.rows[0]!.n;
    });

    const r = await dget(`/policies/${d.id}/contract/preview`, 'kt01');
    expect(r.status).toBe(200);
    expect(r.body.values['{{customer.name}}']).toBe(CUSTOMER_NAME);
    expect(r.body.values['{{customer.registered_address}}']).toBe(ADDRESS_1);
    expect(r.body.values['{{policy.code}}']).toMatch(/^CSBH-/);
    expect(r.body.lines).toHaveLength(2);
    expect(r.body.missingRequired).toEqual([]);

    const after = await withAdminDb(async (c) => {
      const q = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM doc.stored_file WHERE purpose <> 'MAU_HD'`,
      );
      return q.rows[0]!.n;
    });
    expect(after).toBe(before);
  }, 90_000);
});

describe('DOC-13 hồ sơ khách hàng thiếu trường bắt buộc', () => {
  it('chặn xuất, liệt kê đúng tên trường thiếu, không sinh file có ô trống', async () => {
    const d = await toReceivedL1();

    // Ánh xạ thêm một trường BẮT BUỘC mà khách hàng này để trống.
    const active = await templates.active();
    const fields = active!.fields.map((f) => ({
      placeholder: f.placeholder,
      source: f.source,
      required: f.required,
      ...(f.format ? { format: f.format } : {}),
    }));
    const withTitle = [
      ...fields,
      { placeholder: '{{customer.owner_title}}', source: 'customer.owner_title', required: true },
    ];

    // Ô trống phải có trong mẫu thì mới ánh xạ được, nên dùng mẫu 12 ô ở trên.
    const t = await uploadTemplate('sa01', twelveSlotTemplate(), 'Mẫu có chức danh');
    const mapping = (t.body.placeholders as string[]).map((p) => ({
      placeholder: p,
      source: p.slice(2, -2),
      required: p === '{{customer.owner_title}}',
      ...(p === '{{customer.debt}}' ? { format: 'money_vnd' } : {}),
      ...(p === '{{policy.applied_date}}' || p === '{{today}}' ? { format: 'date_dmy' } : {}),
    }));
    expect((await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', { mapping })).status).toBe(200);
    expect((await dpost(`/contract-templates/${t.body.id}/publish`, 'sa01')).status).toBe(200);

    try {
      const prev = await dget(`/policies/${d.id}/contract/preview`, 'kt01');
      expect(prev.body.missingRequired).toEqual([
        { placeholder: '{{customer.owner_title}}', source: 'customer.owner_title' },
      ]);

      const exp = await dget(`/policies/${d.id}/contract.pdf`, 'kt01');
      expect(exp.status).toBe(422);
      expect(exp.body.code).toBe('CONTRACT_FIELDS_MISSING');
      expect(exp.body.missing[0].source).toBe('customer.owner_title');
    } finally {
      // Trả mẫu mặc định về vị trí để test sau không phụ thuộc thứ tự.
      await dpost(`/contract-templates/${t.body.id}/deactivate`, 'sa01');
      await dpost(`/contract-templates/${active!.template.id}/publish`, 'sa01');
    }
    expect(withTitle.length).toBeGreaterThan(fields.length);
  }, 120_000);
});

describe('DOC-31 · DOC-32 định dạng và bảng lặp', () => {
  it('tiền có phân nhóm nghìn, ngày dd/mm/yyyy, tỷ lệ khớp số trên hồ sơ CSBH', async () => {
    const d = await toReceivedL1(1);
    const prev = (await dget(`/policies/${d.id}/contract/preview`, 'kt01')).body;

    // Công nợ 4.500.000 — dấu phân nhóm nghìn kiểu Việt Nam.
    expect(prev.values['{{customer.debt}}']).toBe('4.500.000');
    expect(prev.values['{{today}}']).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    // Tỷ lệ chiết khấu phải khớp TỪNG KÝ TỰ với con số trên hồ sơ CSBH: cùng
    // phép làm tròn hai chữ số đã chốt ở muc 7, không tính lại theo cách khác.
    const onPolicy = (
      await (await http(policy)).get(`/policies/${d.id}`).set('Authorization', `Bearer ${tok['tdv01']}`)
    ).body.lines[0].discountRate as string;
    expect(prev.lines[0]['{{line.discount_rate}}']).toBe(`${Number(onPolicy).toFixed(2)}%`);
    expect(prev.lines[0]['{{line.net_price}}']).toBe('87.000');
  }, 90_000);

  it('DOC-32 mẫu có bảng lặp, hồ sơ 40 dòng thì sinh đủ 40 dòng', async () => {
    const d = await toReceivedL1(40);
    const prev = (await dget(`/policies/${d.id}/contract/preview`, 'kt01')).body;
    expect(prev.lines).toHaveLength(40);

    const pdf = await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01');
    expect(pdf.status).toBe(200);
    const text = await pdfText(pdf.body as Buffer);

    // Đủ 40 dòng và không mất dòng cuối: mọi mã sản phẩm đều có mặt.
    const flat = packed(text);
    for (const l of prev.lines as Record<string, string>[]) {
      expect(flat, `thiếu dòng ${l['{{line.product_code}}']}`).toContain(
        packed(l['{{line.product_code}}']!),
      );
    }
    // Và không còn chuỗi {{...}} nào sót lại trong văn bản đưa cho khách hàng.
    expect(text).not.toContain('{{');
  }, 300_000);
});

// =============================================================================
// DOC-34 — chuyển sang PDF qua Gotenberg
// =============================================================================

describe('DOC-34 chuyển hợp đồng đã trộn sang PDF', () => {
  it('đúng khổ, dấu tiếng Việt hiển thị đúng', async () => {
    const d = await toReceivedL1(2);
    const pdf = await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01');
    expect(pdf.status).toBe(200);

    const text = await pdfText(pdf.body as Buffer);
    expect(text).toContain(CUSTOMER_NAME); //          dấu tiếng Việt nguyên vẹn
    expect(text).toContain('Nhà thuốc');
    expect(text).toContain(ADDRESS_1);
    expect(text).toContain('CÔNG TY TNHH DƯỢC PHẨM NUTRICARE');
    expect(text).not.toContain('{{');

    const { PDFDocument } = await import('pdf-lib');
    const parsed = await PDFDocument.load(new Uint8Array(pdf.body as Buffer));
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(Math.round(parsed.getPage(0).getWidth())).toBe(595);
  }, 120_000);

  it('Gotenberg không gọi được thì báo lỗi RÕ, không tạo dấu vết nửa vời', async () => {
    const d = await toReceivedL1();
    const saved = process.env.GOTENBERG_URL;
    process.env.GOTENBERG_URL = 'http://127.0.0.1:1';
    try {
      const r = await dget(`/policies/${d.id}/contract.pdf`, 'kt01');
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('PDF_ENGINE_UNAVAILABLE');
    } finally {
      if (saved === undefined) delete process.env.GOTENBERG_URL;
      else process.env.GOTENBERG_URL = saved;
    }

    // Hồ sơ KHÔNG mang dấu "đã xuất hợp đồng" cho một lần xuất không hề xảy ra.
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ contract_issued_at: Date | null }>(
        `SELECT contract_issued_at FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(row.contract_issued_at).toBeNull();
  }, 90_000);
});

// =============================================================================
// DOC-12 · DOC-22 · DOC-23 · DOC-24 · DOC-27 — hành vi của việc KHÔNG lưu
// =============================================================================

describe('DOC-12 hai hồ sơ của cùng một khách hàng', () => {
  it('PDF chứa đúng dữ liệu của hồ sơ được bấm, không lẫn hồ sơ khác', async () => {
    const a = await toReceivedL1(1);
    const aPrev = (await dget(`/policies/${a.id}/contract/preview`, 'kt01')).body;

    // Đưa A đi hết luồng: bản CHỈNH SỬA chỉ lập được khi khách hàng đã có một
    // CSBH đang hiệu lực để mà chỉnh sửa.
    await ppost(
      `/policies/${a.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${a.id}.pdf` },
      'sa01',
    );
    await act(a.id, 'SA_HANDOVER', 'sa01');
    await act(a.id, 'KT_RECEIVE_L2', 'kt01');

    // Hồ sơ thứ hai của CÙNG khách hàng, sản phẩm khác.
    const b = await draft(1, a.customerId);
    await act(b.id, 'SUBMIT', 'tdv01');
    await act(b.id, 'TBP_SIGN', 'tbp01');
    await act(b.id, 'KT_RECEIVE_L1', 'kt01');
    const bPrev = (await dget(`/policies/${b.id}/contract/preview`, 'kt01')).body;

    expect(aPrev.values['{{policy.code}}']).not.toBe(bPrev.values['{{policy.code}}']);

    const pdf = await pdfOf(`/policies/${b.id}/contract.pdf`, 'kt01');
    const flat = packed(await pdfText(pdf.body as Buffer));

    // Mã hồ sơ là thứ phân biệt hai bản hợp đồng: đúng mã của hồ sơ được bấm,
    // và KHÔNG có mã của hồ sơ kia.
    expect(flat).toContain(packed(bPrev.values['{{policy.code}}']));
    expect(flat).not.toContain(packed(aPrev.values['{{policy.code}}']));

    // Nhưng SẢN PHẨM thì có lẫn, và đó là ĐÚNG. B là bản chỉnh sửa của A, mà
    // "phiên bản mới phải chứa lại toàn bộ sản phẩm cũ" (muc 5.1) — nên sản
    // phẩm của A có mặt trong hợp đồng của B là nghiệp vụ, không phải rò rỉ dữ
    // liệu. Khẳng định ngược lại ở đây sẽ ép hệ thống vi phạm luật đó.
    expect(flat).toContain(packed(bPrev.lines.at(-1)['{{line.product_code}}']));
    expect((bPrev.lines as unknown[]).length).toBe(2);
    expect(flat).toContain(packed(aPrev.lines[0]['{{line.product_code}}']));
  }, 180_000);
});

describe('DOC-22 · DOC-23 hai người cùng bấm xuất', () => {
  it('cả hai đều nhận PDF, nhật ký ghi HAI dòng kèm đúng người và vai trò', async () => {
    const d = await toReceivedL1();
    await withAdminDb(async (c) => {
      await c.query(`DELETE FROM doc.outbox WHERE payload->>'id' = $1`, [d.id]);
    });

    const [kt, sa] = await Promise.all([
      pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01'),
      pdfOf(`/policies/${d.id}/contract.pdf`, 'sa01'),
    ]);
    // Không ghi đè gì nên không có xung đột nào để mà thua.
    expect(kt.status).toBe(200);
    expect(sa.status).toBe(200);

    const events = await withAdminDb(async (c) => {
      const r = await c.query<{ payload: Record<string, string> }>(
        `SELECT payload FROM doc.outbox
          WHERE routing_key = 'document.contract_issued' AND payload->>'id' = $1
          ORDER BY seq`,
        [d.id],
      );
      return r.rows.map((x) => x.payload);
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e['actorRole']).sort()).toEqual(['KE_TOAN', 'SALE_ADMIN']);

    // DOC-23: hai cột trên hồ sơ cập nhật theo lần xuất GẦN NHẤT.
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ contract_issued_at: Date; contract_issued_by: string }>(
        `SELECT contract_issued_at, contract_issued_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(row.contract_issued_at).not.toBeNull();
    const sa01 = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'sa01'`,
      );
      return q.rows[0]!.id;
    });
    const kt01 = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'kt01'`,
      );
      return q.rows[0]!.id;
    });
    expect([sa01, kt01]).toContain(row.contract_issued_by);
  }, 120_000);
});

describe('DOC-27 xuất, đổi địa chỉ khách hàng, xuất lại', () => {
  it('bản thứ hai mang địa chỉ MỚI — đúng theo thiết kế, không phải lỗi', async () => {
    const d = await toReceivedL1();
    const first = await pdfText((await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).body as Buffer);
    expect(first).toContain(ADDRESS_1);

    const upd = await (await http(customer))
      .patch(`/customers/${d.customerId}`)
      .set('Authorization', `Bearer ${tok['sa01']}`)
      .send({ registeredAddress: ADDRESS_2 });
    expect(upd.status).toBe(200);

    const second = await pdfText((await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).body as Buffer);
    expect(second).toContain(ADDRESS_2);
    expect(second).not.toContain(ADDRESS_1);
  }, 150_000);
});

describe('DOC-15 Sale Admin thay mẫu rồi xuất lại', () => {
  it('lần xuất mới dùng MẪU MỚI, không có ràng buộc phiên bản nào', async () => {
    const d = await toReceivedL1();
    const active = await templates.active();
    const firstText = await pdfText(
      (await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).body as Buffer,
    );
    expect(firstText).toContain('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG');

    const MARK = 'PHU LUC HOP DONG PHIEN BAN MOI';
    const t = await uploadTemplate(
      'sa01',
      makeDocx([para(MARK), para('Khách hàng: {{customer.name}}'), para('Hồ sơ {{policy.code}}')].join('')),
      'Mẫu mới',
    );
    await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [
        { placeholder: '{{customer.name}}', source: 'customer.name', required: true },
        { placeholder: '{{policy.code}}', source: 'policy.code', required: true },
      ],
    });
    expect((await dpost(`/contract-templates/${t.body.id}/publish`, 'sa01')).status).toBe(200);

    try {
      const secondText = await pdfText(
        (await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).body as Buffer,
      );
      expect(secondText).toContain(MARK);
      expect(secondText).not.toContain('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG');
    } finally {
      await dpost(`/contract-templates/${active!.template.id}/publish`, 'sa01');
    }
  }, 180_000);
});

describe('DOC-24 hồ sơ bị trả về rồi duyệt lại và xuất tiếp', () => {
  it('lần xuất sau lấy dữ liệu phiên bản mới, không có bản ghi hợp đồng cũ nào', async () => {
    const d = await toReceivedL1();
    await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01');

    // Đường trả về ĐÚNG theo máy trạng thái: sau khi tiếp nhận L1 hồ sơ đã ở
    // bước Sale Admin xử lý, nên `KT_RETURN_L1` không còn hợp lệ. Kịch bản thật
    // của DOC-24 là kế toán từ chối ở LẦN HAI và hồ sơ quay về Bước 3.
    await ppost(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    expect((await act(d.id, 'KT_RETURN_L2', 'kt01', { reason: 'Sai giá bán buôn' })).status).toBe(200);

    const newProduct = await makeProduct(99);
    const add = await ppost(`/policies/${d.id}/lines`, line(newProduct), 'tdv01');
    expect(add.status).toBe(201);

    await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');

    const prev = (await dget(`/policies/${d.id}/contract/preview`, 'kt01')).body;
    expect(prev.lines).toHaveLength(2);

    const flat = packed(
      await pdfText((await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).body as Buffer),
    );
    for (const l of prev.lines as Record<string, string>[]) {
      expect(flat).toContain(packed(l['{{line.product_code}}']!));
    }
  }, 180_000);
});

// =============================================================================
// DOC-35 — chưa có mẫu nào đang dùng
// =============================================================================

describe('DOC-35 Sale Admin vô hiệu hết mẫu', () => {
  it('409 kèm hướng dẫn, không sinh file rỗng', async () => {
    const d = await toReceivedL1();
    const active = await templates.active();
    expect(active, 'phải có mẫu mặc định seed sẵn lúc khởi động').toBeDefined();

    await dpost(`/contract-templates/${active!.template.id}/deactivate`, 'sa01');
    try {
      const r = await dget(`/policies/${d.id}/contract.pdf`, 'kt01');
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('NO_ACTIVE_TEMPLATE');
      expect(r.body.message).toContain('Sale Admin');
    } finally {
      await dpost(`/contract-templates/${active!.template.id}/publish`, 'sa01');
    }
  }, 90_000);
});

// =============================================================================
// DOC-28 — không có dấu vết lưu hợp đồng ở bất cứ đâu
// =============================================================================

describe('DOC-28 quét lược đồ, bảng định tuyến và kho lưu trữ', () => {
  it('không có bảng contract nào ngoài bảng MẪU', async () => {
    const tables = await withAdminDb(async (c) => {
      const r = await c.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'doc'`,
      );
      return r.rows.map((x) => x.table_name);
    });
    expect(tables).not.toContain('contract');
    // Hai bảng có chữ "contract" đều là bảng MẪU, không phải bảng hợp đồng.
    expect(tables.filter((t) => t.includes('contract')).sort()).toEqual([
      'contract_template',
      'contract_template_field',
    ]);
  });

  it('không có endpoint GET /contracts/:id', async () => {
    const server = doc.getHttpServer() as {
      _events: { request: { _router?: { stack: { route?: { path: string } }[] } } };
    };
    const router = server._events.request._router;
    const paths = (router?.stack ?? []).map((l) => l.route?.path).filter(Boolean) as string[];
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => /^\/contracts\//.test(p))).toBe(false);
  });

  it('xuất hợp đồng không sinh thêm file nào trong kho', async () => {
    // Bằng chứng đọc từ `doc.stored_file`, KHÔNG từ việc liệt kê MinIO.
    //
    // Bản trước liệt kê kho theo từng tiền tố mục đích và nó treo: trình phân
    // tích XML trong `minio` ném "Entity expansion limit exceeded" từ bên trong
    // `Transform._flush`, tức là ngoại lệ không ai bắt được, và lượt liệt kê chỉ
    // đứng chờ tới lúc hết giờ. Bốn hướng đã bị loại trừ — xem chú thích ở
    // `Storage.listKeys`. Chưa tìm ra nguyên nhân gốc.
    //
    // Đổi nguồn bằng chứng chứ không nới bất biến: điều cần chứng minh vẫn là
    // "xuất hợp đồng không để lại gì trong kho". `doc.stored_file` trả lời được
    // đúng câu đó vì mọi lượt ghi MinIO của ứng dụng đều kèm một dòng ở đây —
    // test ngay dưới ghim lại chính điều kiện ấy, để phép thay nguồn không âm
    // thầm mất hiệu lực khi ai đó thêm một đường ghi kho thứ ba.
    //
    // So CẢ TẬP DÒNG chứ không so số đếm: một cặp thêm-rồi-xoá giữ nguyên số
    // đếm nhưng vẫn là dấu vết hợp đồng đã từng nằm trong kho.
    const anhChup = () =>
      withAdminDb(async (c) => {
        const r = await c.query<{ k: string }>(
          `SELECT object_key || ' ' || purpose || ' ' || coalesce(deleted_at::text,'-') AS k
             FROM doc.stored_file ORDER BY object_key`,
        );
        return r.rows.map((x) => x.k);
      });

    const d = await toReceivedL1();
    const truoc = await anhChup();
    expect((await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).status).toBe(200);

    // PDF trả thẳng về người bấm và không đi qua kho. Chỉ có thể y nguyên.
    expect(await anhChup()).toEqual(truoc);
  }, 120_000);

  it('mọi đường ghi vào kho đều để lại một dòng `stored_file`', async () => {
    // Điều kiện làm cho test trên có giá trị. Nếu một ngày có mã gọi thẳng
    // `storage.put` mà không ghi CSDL thì phép "soi kho qua CSDL" mù đúng chỗ
    // hợp đồng có thể lọt vào — nên ghim số điểm ghi lại ở đây.
    const src = readFileSync(
      new URL('../../services/document/src/files/files.service.ts', import.meta.url),
      'utf8',
    );
    // Hai điểm ghi: `upload()` (file người dùng tải lên) và `store()` (file do
    // hệ thống sinh). Cả hai đều gọi `insert()` ngay sau đó.
    expect(src.match(/this\.storage\.put\(/g)).toHaveLength(2);

    // Chỉ quét `services/document`: `Storage` là provider của riêng service này,
    // service khác không tiêm được nó.
    const goc = new URL('../../services/document/src/', import.meta.url);
    const khac = readdirSync(goc, { recursive: true })
      .map(String)
      .filter((t) => t.endsWith('.ts') && t !== 'files/files.service.ts')
      .filter((t) => /\.storage\.put\(|\.putObject\(/.test(readFileSync(new URL(t, goc), 'utf8')))
      // `storage.ts` là chính lớp bọc — nó gọi `putObject`, đó là việc của nó.
      .filter((t) => t !== 'infra/storage.ts');
    expect(khac).toEqual([]);
  });

  it('không mục đích lưu trữ nào dành cho hợp đồng', async () => {
    // Hợp đồng không được lưu, nên nó không có chỗ để lưu. Danh sách khai thẳng
    // ra: thêm một giá trị enum mới là test đỏ và người thêm phải nói rõ nó
    // dùng cho việc gì.
    const known = await withAdminDb(async (c) => {
      const r = await c.query<{ v: string }>(
        `SELECT unnest(enum_range(NULL::doc.file_purpose))::text AS v`,
      );
      return r.rows.map((x) => x.v.toLowerCase());
    });
    expect(known.sort()).toEqual(['ban_csbh', 'ban_da_ky', 'ho_so', 'mau_hd', 'phap_ly', 'scan']);
  });
});

// =============================================================================
// DOC-16 — mâu thuẫn trong danh mục test, đã xử lý
// =============================================================================

describe('DOC-16 đã bị DOC-28 thay thế', () => {
  it('không có trạng thái hợp đồng và không có bản scan hợp đồng — CÓ CHỦ Ý', async () => {
    // DOC-16 ghi "Hợp đồng có trạng thái riêng và tải được bản scan". Điều đó
    // MÂU THUẪN TRỰC TIẾP với DOC-28 và muc 8.3, vốn nói không có bảng hợp đồng,
    // không mã, không trạng thái, không bản scan.
    //
    // DOC-16 là mức P1 và có từ trước quyết định "hợp đồng là một phép biến đổi";
    // DOC-28 là P0 và viện dẫn thẳng muc 8.3 của bản hợp nhất. Bản hợp nhất
    // thắng, nên DOC-16 nghỉ. Test này giữ lại quyết định đó ở dạng chạy được,
    // thay vì để nó nằm trong một dòng ghi chú rồi bị làm lại sau sáu tháng.
    //
    // Hệ quả phải nói rõ với người dùng: hệ thống KHÔNG trả lời được câu hỏi
    // "hợp đồng nào đã ký, hợp đồng nào chưa". Muốn theo dõi việc ký hợp đồng
    // thì phải bổ sung lưu trữ, và khi đó nên thêm cả ảnh chụp dữ liệu tại thời
    // điểm xuất chứ không chỉ thêm cột trạng thái.
    const cols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'doc' AND table_name LIKE 'contract%'`,
      );
      return r.rows.map((x) => x.column_name);
    });
    expect(cols).not.toContain('status');
    expect(cols).not.toContain('scan_file_id');
    expect(cols).not.toContain('contract_code');

    // Liên kết ngược về hồ sơ nguồn — phần DUY NHẤT của DOC-16 vẫn còn giá trị —
    // được giữ, nhưng ở trên chính hồ sơ chứ không ở một bản ghi hợp đồng.
    const polCols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'pol' AND table_name = 'policy' AND column_name LIKE 'contract%'`,
      );
      return r.rows.map((x) => x.column_name).sort();
    });
    expect(polCols).toEqual(['contract_issued_at', 'contract_issued_by']);
  });
});
