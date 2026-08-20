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
  placeholdersOf,
  documentXml,
  KNOWN_SOURCES,
  NGUON_BAT_BUOC_HO_SO,
  table,
  tableRow,
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
/**
 * MỌI hành động đi qua đây tự kèm người được phân công (`0031`).
 *
 * Xem `phanCongMacDinh`. Ca nào quan tâm tới người cụ thể thì truyền trong
 * `body` — nó nằm sau nên ghi đè mặc định.
 */
const act = async (id: string, action: string, who: string, body: object = {}) =>
  ppost(`/policies/${id}/actions/${action}`, { ...(await phanCongMacDinh(action)), ...body }, who);

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

const line = (productId: string) => ({ productId, wholesalePrice: '90000', cpbh: ['3000'] });

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
      para('{{cong_ty.ten}} — {{cong_ty.dia_chi}}'),
      para('HỢP ĐỒNG với {{ho_so.ten_khach_hang}} (mã {{ho_so.ma_khach_hang}})'),
      para('Địa chỉ: {{ho_so.dia_chi_dang_ky}}'),
      para('Đại diện: {{ho_so.nguoi_dai_dien}} — {{ho_so.chuc_danh_dai_dien}}'),
      para('Công nợ: {{ho_so.cong_no}}'),
      para('Hồ sơ {{ho_so.ma_ho_so}}, áp dụng {{ho_so.ngay_ap_dung}}'),
      para('Người lập: {{ho_so.nguoi_de_nghi}}'),
      para('Ngày ký: {{ngay_in}}'),
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
    expect(r.body.placeholders).toContain('{{ho_so.ten_khach_hang}}');
    expect(r.body.knownSources.length).toBeGreaterThan(10);
  }, 60_000);

  it('ô trống bị Word cắt rời thành nhiều đoạn XML vẫn nhận ra được', async () => {
    // Word cắt một đoạn văn thành nhiều <w:r> bất cứ lúc nào nó muốn. Đây là
    // kiểu hỏng IM LẶNG: file vẫn sinh ra, chỉ là ô trống không được điền.
    const split =
      '<w:p><w:r><w:t>Kính gửi {{ho_so.</w:t></w:r>' +
      '<w:r><w:t>ten_khach</w:t></w:r>' +
      '<w:r><w:t>_hang}}, xin chào</w:t></w:r></w:p>';
    expect(placeholdersOf(makeDocx(split))).toEqual(['{{ho_so.ten_khach_hang}}']);
  });
});

describe('DOC-33 file mẫu hỏng hoặc không phải .docx', () => {
  it('400 và mẫu đang dùng KHÔNG bị ảnh hưởng', async () => {
    const activeBefore = await templates.chon('HOP_DONG');

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

    const activeAfter = await templates.chon('HOP_DONG');
    expect(activeAfter?.template.id).toBe(activeBefore?.template.id);
  }, 60_000);
});

describe('DOC-29 ánh xạ tới trường nguồn không tồn tại', () => {
  it('400 ngay lúc LƯU ánh xạ, không đợi tới lúc xuất', async () => {
    const t = await uploadTemplate('sa01', twelveSlotTemplate());
    const r = await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [{ placeholder: '{{ho_so.ten_khach_hang}}', source: 'customer.ten_khong_co' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SOURCE_UNKNOWN');
    expect(r.body.knownSources).toContain('ho_so.ten_khach_hang');
  }, 60_000);

  it('ánh xạ tới ô trống không có trong mẫu cũng bị chặn', async () => {
    const t = await uploadTemplate('sa01', twelveSlotTemplate());
    const r = await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [{ placeholder: '{{khong.co.trong.mau}}', source: 'ho_so.ten_khach_hang' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PLACEHOLDER_NOT_IN_TEMPLATE');
  }, 60_000);
});

describe('DOC-30 phát hành mẫu còn ô trống chưa ánh xạ', () => {
  it('chặn và chỉ rõ ô nào chưa ánh xạ', async () => {
    const t = await uploadTemplate('sa01', twelveSlotTemplate());
    await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [{ placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang', required: true }],
    });

    const r = await dpost(`/contract-templates/${t.body.id}/publish`, 'sa01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('TEMPLATE_INCOMPLETE');
    expect(r.body.missing).toHaveLength(11);
    expect(r.body.missing).toContain('{{ho_so.ma_ho_so}}');
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

  it('DOC-21 Sale Admin CHƯA ĐƯỢC GIAO thì 403, không phải 409 (`0031`)', async () => {
    // Ca này đổi ý nghĩa cùng `0031`, và đổi theo hướng chặt hơn.
    //
    // Trước đây Sale Admin thấy mọi hồ sơ trong nhánh cây của mình, nên câu hỏi
    // duy nhất còn lại là "cổng thời điểm đã mở chưa" — và câu trả lời là 409.
    // Giờ Sale Admin chỉ được giao hồ sơ ở bước `KT_RECEIVE_L1`; ở `CHO_TBP_DUYET`
    // họ chưa liên quan gì tới hồ sơ này, nên chặn ở tầng PHẠM VI trước.
    //
    // 403 trước 409 là đúng thứ tự: không nói cho người ngoài phạm vi biết hồ sơ
    // ấy đang ở bước nào.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await dget(`/policies/${d.id}/contract/preview`, 'sa01');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  }, 60_000);

  it('Sale Admin ĐÃ ĐƯỢC GIAO thì qua phạm vi, và cổng thời điểm vẫn giữ nguyên', async () => {
    // Nửa còn lại của DOC-21: quyền rộng ra không mở cổng sớm hơn. Kiểm bằng
    // chính người đã được giao, để phép kiểm nói về CỔNG chứ không về phạm vi.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    const r = await dget(`/policies/${d.id}/contract/preview`, 'sa01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
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
    expect(r.body.values['{{ho_so.ten_khach_hang}}']).toBe(CUSTOMER_NAME);
    expect(r.body.values['{{ho_so.dia_chi_dang_ky}}']).toBe(ADDRESS_1);
    expect(r.body.values['{{ho_so.ma_ho_so}}']).toMatch(/^CSBH-/);
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
    const active = await templates.chon('HOP_DONG');
    const fields = active!.fields.map((f) => ({
      placeholder: f.placeholder,
      source: f.source,
      required: f.required,
      ...(f.format ? { format: f.format } : {}),
    }));
    const withTitle = [
      ...fields,
      { placeholder: '{{ho_so.chuc_danh_dai_dien}}', source: 'ho_so.chuc_danh_dai_dien', required: true },
    ];

    // Ô trống phải có trong mẫu thì mới ánh xạ được, nên dùng mẫu 12 ô ở trên.
    const t = await uploadTemplate('sa01', twelveSlotTemplate(), 'Mẫu có chức danh');
    const mapping = (t.body.placeholders as string[]).map((p) => ({
      placeholder: p,
      source: p.slice(2, -2),
      required: p === '{{ho_so.chuc_danh_dai_dien}}',
      ...(p === '{{ho_so.cong_no}}' ? { format: 'money_vnd' } : {}),
      ...(p === '{{ho_so.ngay_ap_dung}}' || p === '{{ngay_in}}' ? { format: 'date_dmy' } : {}),
    }));
    expect((await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', { mapping })).status).toBe(200);
    expect((await dpost(`/contract-templates/${t.body.id}/publish`, 'sa01')).status).toBe(200);

    try {
      const prev = await dget(`/policies/${d.id}/contract/preview`, 'kt01');
      expect(prev.body.missingRequired).toEqual([
        { placeholder: '{{ho_so.chuc_danh_dai_dien}}', source: 'ho_so.chuc_danh_dai_dien' },
      ]);

      const exp = await dget(`/policies/${d.id}/contract.pdf`, 'kt01');
      expect(exp.status).toBe(422);
      expect(exp.body.code).toBe('CONTRACT_FIELDS_MISSING');
      expect(exp.body.missing[0].source).toBe('ho_so.chuc_danh_dai_dien');
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
    expect(prev.values['{{ho_so.cong_no}}']).toBe('4.500.000');
    expect(prev.values['{{ngay_in}}']).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    // Tỷ lệ chiết khấu phải khớp TỪNG KÝ TỰ với con số trên hồ sơ CSBH: cùng
    // phép làm tròn hai chữ số đã chốt ở muc 7, không tính lại theo cách khác.
    const onPolicy = (
      await (await http(policy)).get(`/policies/${d.id}`).set('Authorization', `Bearer ${tok['tdv01']}`)
    ).body.lines[0].discountRate as string;
    expect(prev.lines[0]['{{dong.ty_le_ck}}']).toBe(`${Number(onPolicy).toFixed(2)}%`);
    expect(prev.lines[0]['{{dong.gia_thu_ve}}']).toBe('87.000');
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
      expect(flat, `thiếu dòng ${l['{{dong.ma_san_pham}}']}`).toContain(
        packed(l['{{dong.ma_san_pham}}']!),
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

    expect(aPrev.values['{{ho_so.ma_ho_so}}']).not.toBe(bPrev.values['{{ho_so.ma_ho_so}}']);

    const pdf = await pdfOf(`/policies/${b.id}/contract.pdf`, 'kt01');
    const flat = packed(await pdfText(pdf.body as Buffer));

    // Mã hồ sơ là thứ phân biệt hai bản hợp đồng: đúng mã của hồ sơ được bấm,
    // và KHÔNG có mã của hồ sơ kia.
    expect(flat).toContain(packed(bPrev.values['{{ho_so.ma_ho_so}}']));
    expect(flat).not.toContain(packed(aPrev.values['{{ho_so.ma_ho_so}}']));

    // Nhưng SẢN PHẨM thì có lẫn, và đó là ĐÚNG. B là bản chỉnh sửa của A, mà
    // "phiên bản mới phải chứa lại toàn bộ sản phẩm cũ" (muc 5.1) — nên sản
    // phẩm của A có mặt trong hợp đồng của B là nghiệp vụ, không phải rò rỉ dữ
    // liệu. Khẳng định ngược lại ở đây sẽ ép hệ thống vi phạm luật đó.
    expect(flat).toContain(packed(bPrev.lines.at(-1)['{{dong.ma_san_pham}}']));
    expect((bPrev.lines as unknown[]).length).toBe(2);
    expect(flat).toContain(packed(aPrev.lines[0]['{{dong.ma_san_pham}}']));
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
    const active = await templates.chon('HOP_DONG');
    const firstText = await pdfText(
      (await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).body as Buffer,
    );
    expect(firstText).toContain('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG');

    const MARK = 'PHU LUC HOP DONG PHIEN BAN MOI';
    const t = await uploadTemplate(
      'sa01',
      makeDocx([para(MARK), para('Khách hàng: {{ho_so.ten_khach_hang}}'), para('Hồ sơ {{ho_so.ma_ho_so}}')].join('')),
      'Mẫu mới',
    );
    await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [
        { placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang', required: true },
        { placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so', required: true },
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
      /*
        DỌN CẢ HAI ĐẦU (`0058`).

        Tới `0057` chỉ cần phát hành lại mẫu cũ: phát hành là thay thế, nên nó tự
        hạ "Mẫu mới" xuống. Từ `0058` phát hành chỉ THÊM vào danh sách, nên bỏ
        bước gỡ là để lại hai mẫu cùng đang dùng — và DOC-35 phía dưới, vốn vô
        hiệu đúng một mẫu rồi chờ 409, sẽ đỏ vì một lý do chẳng liên quan gì tới
        nó.
      */
      await dpost(`/contract-templates/${t.body.id}/deactivate`, 'sa01');
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
      expect(flat).toContain(packed(l['{{dong.ma_san_pham}}']!));
    }
  }, 180_000);
});

// =============================================================================
// DOC-35 — chưa có mẫu nào đang dùng
// =============================================================================

describe('DOC-35 Sale Admin vô hiệu hết mẫu', () => {
  it('409 kèm hướng dẫn, không sinh file rỗng', async () => {
    const d = await toReceivedL1();
    // HẾT mẫu, không phải một mẫu (`0058`): nhiều mẫu cùng đang dùng được rồi,
    // nên "vô hiệu cái đang dùng" không còn là một câu có nghĩa xác định.
    const dangDung = await templates.khaDung('HOP_DONG');
    expect(dangDung.length, 'phải có mẫu mặc định seed sẵn lúc khởi động').toBeGreaterThan(0);

    for (const m of dangDung) await dpost(`/contract-templates/${m.id}/deactivate`, 'sa01');
    try {
      const r = await dget(`/policies/${d.id}/contract.pdf`, 'kt01');
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('NO_ACTIVE_TEMPLATE');
      expect(r.body.message).toContain('Sale Admin');
    } finally {
      for (const m of dangDung) await dpost(`/contract-templates/${m.id}/publish`, 'sa01');
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

// =============================================================================
// `0059` — N-01 thu hẹp: bản mềm và hợp đồng KHÔNG ghi lịch sử nữa
// =============================================================================

describe('`0059` bản mềm và hợp đồng không để lại dòng lịch sử nào', () => {
  /** Các dòng lịch sử của một hồ sơ, mới nhất sau cùng. */
  const lichSu = (id: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ action: string; actor_role: string; to_status: string; from_status: string | null }>(
        `SELECT action, actor_role, to_status::text AS to_status,
                from_status::text AS from_status
           FROM pol.policy_event WHERE policy_id = $1 ORDER BY seq`,
        [id],
      );
      return r.rows;
    });

  const dem = (rows: { action: string }[], a: string) => rows.filter((r) => r.action === a).length;

  it('TẢI cũng như XEM — không dòng nào, cho cả hai loại văn bản', async () => {
    /*
     * ĐẢO NGƯỢC `0052`, theo yêu cầu 20/08.
     *
     * `0052` ghi mỗi lượt tải một dòng cho cả bốn loại văn bản (N-01). Khách
     * hàng bỏ hai loại đầu — và bỏ bằng chính lý do đã dùng để loại lượt XEM ở
     * `0052`: bản mềm và hợp đồng là thứ người ta mở ra ĐỌC, mỗi hồ sơ vài lần
     * một buổi, nên những dòng ấy chỉ làm dày lịch sử và dìm mất thứ nó sinh ra
     * để kể — ai duyệt, ai trả về, vì sao.
     *
     * Kiểm CẢ BỐN đường trong một ca: tải và xem, bản mềm và hợp đồng. Tách ra
     * bốn ca thì mỗi ca dựng một hồ sơ mới và chạy thêm một lượt Gotenberg cho
     * cùng một khẳng định.
     */
    const d = await toReceivedL1();
    expect((await pdfOf(`/policies/${d.id}/render`, 'kt01')).status).toBe(200);
    expect((await pdfOf(`/policies/${d.id}/render?xem=1`, 'sa01')).status).toBe(200);
    expect((await pdfOf(`/policies/${d.id}/contract.pdf`, 'kt01')).status).toBe(200);
    expect((await pdfOf(`/policies/${d.id}/contract.pdf?xem=1`, 'sa01')).status).toBe(200);

    const rows = await lichSu(d.id);
    expect(dem(rows, 'TAI_HO_SO'), 'bản mềm không được ghi gì').toBe(0);
    expect(dem(rows, 'TAI_HOP_DONG'), 'hợp đồng không được ghi gì').toBe(0);
    // Và không ghi dưới một cái tên nào khác: lịch sử chỉ còn các bước duyệt.
    expect(rows.every((x) => !x.action.startsWith('TAI_'))).toBe(true);
  }, 150_000);

  it('XUẤT hợp đồng VẪN đóng dấu đã xuất — kể cả khi chỉ xem', async () => {
    /*
     * Con dấu KHÔNG đi theo dòng lịch sử, và đây là chỗ dễ gỡ nhầm nhất của lượt
     * này: cả hai từng nằm trong CÙNG một lời gọi sang `policy`.
     *
     * Chúng trả lời hai câu khác nhau. Dòng lịch sử nói *"ai đã lấy file ra"* —
     * câu khách hàng vừa bỏ. Con dấu nói *"hồ sơ này đã có hợp đồng chưa"* —
     * một trạng thái của hồ sơ mà muc 8.3 hỏi, và báo cáo tiến độ đọc.
     */
    const d = await toReceivedL1();
    expect((await pdfOf(`/policies/${d.id}/contract.pdf?xem=1`, 'kt01')).status).toBe(200);

    const p = await withAdminDb(async (c) => {
      const r = await c.query<{ contract_issued_at: Date | null; contract_issued_by: string | null }>(
        `SELECT contract_issued_at, contract_issued_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return r.rows[0]!;
    });
    expect(p.contract_issued_at).not.toBeNull();
    expect(p.contract_issued_by).not.toBeNull();
  }, 90_000);

  it('`0055` `format=html` đã gỡ — đường đó không còn tồn tại', async () => {
    /*
     * Ca này từng khẳng định bản HTML xem trước không ghi dòng tải nào. Từ
     * `0055` bản mềm sinh từ mẫu .docx, không còn bản HTML nào để trả về, và
     * tham số `format` bị loại ở tầng kiểm dữ liệu.
     *
     * Giữ ca lại thay vì xoá: một tham số đã gỡ mà máy chủ vẫn lặng lẽ nhận là
     * một đường cũ còn sống, và không ai biết nó trả về cái gì.
     */
    const d = await toReceivedL1();
    // `validate` bỏ qua khoá lạ chứ không từ chối, nên đường cũ vẫn trả 200 —
    // nhưng trả về PDF như mọi lượt xem khác, không còn HTML nào.
    const r = await pdfOf(`/policies/${d.id}/render?format=html&xem=1`, 'kt01');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(dem(await lichSu(d.id), 'TAI_HO_SO')).toBe(0);
  }, 90_000);

  it('năm lượt dựng bản mềm song song vẫn ra PDF — không còn `seq` để mà đụng', async () => {
    /*
     * Ca này từng là ca bắt được lỗi thật: `seq` cấp bằng
     * `coalesce(max(seq),0)+1` ngay trong câu INSERT chỉ thấy dòng ĐÃ COMMIT,
     * nên năm lượt tải song song đọc ra cùng một số và bốn lượt vỡ ở ràng buộc
     * UNIQUE — 500 cho một thao tác đọc thuần tuý.
     *
     * Bản mềm không ghi dòng nào nữa nên nó không còn chạm tới `seq`. Phép khoá
     * `FOR UPDATE` vẫn nguyên và vẫn được canh — ở `document.test.ts`, trên
     * đường TẢI BẢN SCAN, nơi lịch sử vẫn ghi.
     *
     * Giữ lại nửa còn giá trị: năm lượt dựng PDF song song không lượt nào hỏng.
     */
    const d = await toReceivedL1();
    const runs = await Promise.all(
      [0, 1, 2, 3, 4].map(() => pdfOf(`/policies/${d.id}/render`, 'kt01')),
    );
    for (const r of runs) expect(r.status).toBe(200);
    expect(dem(await lichSu(d.id), 'TAI_HO_SO')).toBe(0);
  }, 120_000);
});

// =============================================================================
// `0055` — Mẫu hồ sơ CSBH của Quản trị hệ thống (muc 6.4)
// =============================================================================

describe('`0055` mẫu hồ sơ CSBH', () => {
  const qget = async (path: string, who: string) =>
    (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`);
  const qpost = async (path: string, who: string, body: object = {}) =>
    (await http(doc)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

  /** Vô hiệu mọi mẫu hồ sơ của một khổ, rồi trả lại hàm khôi phục. */
  /**
   * Vô hiệu MỌI mẫu hồ sơ đang dùng, trả về hàm khôi phục (`0058`).
   *
   * Bản trước nhận một khổ giấy và chỉ vô hiệu mẫu của khổ ấy — đúng khi mẫu
   * được tra theo khổ. Giờ người xem chọn mẫu, nên câu hỏi duy nhất còn nghĩa
   * là "danh sách có rỗng không".
   */
  const voHieuHet = async () => {
    const ds = (await qget('/policy-templates', 'admin01')).body as { id: string; isActive: boolean }[];
    const dang = ds.filter((t) => t.isActive);
    for (const t of dang) await qpost(`/policy-templates/${t.id}/deactivate`, 'admin01');
    return async () => {
      for (const t of dang) await qpost(`/policy-templates/${t.id}/publish`, 'admin01');
      /*
        HOÀ LẠI MỐC BAN HÀNH của hai mẫu mặc định.

        `publish` đặt `published_at = now()`, nên mẫu khôi phục sau cùng sẽ thành
        mẫu MỞ SẴN của mọi lời gọi không kèm `mauId` — kể cả ở tệp kiểm thử khác,
        vì các tệp dùng chung một CSDL. Đã thấy đúng chuyện ấy: DOC-20 đỏ với
        "expected 842 to be 595" sau khi một ca chẳng liên quan mượn tạm mẫu ngang.
      */
      await withAdminDb(async (c) => {
        await c.query(
          `UPDATE doc.contract_template t SET published_at = m.som_nhat
             FROM (SELECT min(published_at) AS som_nhat FROM doc.contract_template
                    WHERE is_default AND kind = 'HO_SO' AND published_at IS NOT NULL) AS m
            WHERE t.is_default AND t.kind = 'HO_SO'`,
        );
      });
    };
  };

  it('hệ thống seed sẵn MỖI KHỔ một mẫu, để chạy được từ phút đầu', async () => {
    const ds = (await qget('/policy-templates', 'admin01')).body as {
      paperSize: string;
      isActive: boolean;
      isDefault: boolean;
    }[];
    /*
      Tìm theo `isDefault`, KHÔNG phải "mẫu đang dùng đầu tiên của khổ này".

      Từ `0058` nhiều mẫu cùng đang dùng được, nên "cái đầu tiên" có thể là mẫu
      do một ca khác ban hành — và ca này sẽ đỏ với thông báo "isDefault phải là
      true", nói về một mẫu chẳng liên quan gì tới điều nó muốn khẳng định. Điều
      cần khẳng định là: hệ thống CÓ seed sẵn một mẫu mặc định cho mỗi khổ, và
      mẫu ấy đang dùng.
    */
    for (const kho of ['a4p', 'a4l']) {
      const t = ds.find((x) => x.paperSize === kho && x.isDefault);
      expect(t, `thiếu mẫu mặc định cho khổ ${kho}`).toBeDefined();
      expect(t!.isActive, `mẫu mặc định khổ ${kho} phải đang dùng`).toBe(true);
    }
  }, 90_000);

  it('chỉ QUẢN TRỊ vào được — Sale Admin và Kế toán đều 403', async () => {
    // Mẫu hồ sơ là cấu hình hệ thống (muc 6.4); mẫu hợp đồng mới là văn bản
    // nghiệp vụ của Sale Admin (muc 8.2). Hai màn hình, hai chủ.
    for (const who of ['sa01', 'kt01', 'tdv01']) {
      expect((await qget('/policy-templates', who)).status, who).toBe(403);
    }
  }, 90_000);

  it('Quản trị KHÔNG đụng được vào mẫu hợp đồng, và ngược lại', async () => {
    expect((await qget('/contract-templates', 'admin01')).status).toBe(403);
    expect((await qget('/policy-templates', 'sa01')).status).toBe(403);
  }, 90_000);

  it('danh sách hai loại mẫu KHÔNG lẫn vào nhau', async () => {
    const hoSo = (await qget('/policy-templates', 'admin01')).body as { kind: string }[];
    const hopDong = (await qget('/contract-templates', 'sa01')).body as { kind: string }[];
    expect(hoSo.every((t) => t.kind === 'HO_SO')).toBe(true);
    expect(hopDong.every((t) => t.kind === 'HOP_DONG')).toBe(true);
  }, 90_000);

  it('CHƯA CÓ MẪU NÀO ĐANG DÙNG thì báo lỗi, và nói ai chữa được', async () => {
    /*
     * Đây là yêu cầu khách hàng nêu đích danh: *"nếu chưa có hồ sơ mẫu do Quản
     * trị hệ thống tải lên hãy báo lỗi"*.
     *
     * `0055` hiểu "phù hợp" là ĐÚNG KHỔ GIẤY, nên ca này từng vô hiệu mẫu khổ
     * dọc rồi khẳng định khổ ngang vẫn chạy. Từ `0058` không còn khái niệm mẫu
     * phù hợp theo khổ — người xem chọn mẫu trong danh sách, và điều kiện hỏng
     * duy nhất là danh sách RỖNG. Còn một mẫu bất kỳ thì vẫn xem được.
     */
    const d = await toReceivedL1();

    // Còn mẫu khác thì KHÔNG hỏng — vô hiệu một mẫu là chuyện thường ngày.
    const ds = (await qget('/policy-templates', 'admin01')).body as { id: string; isActive: boolean }[];
    const mot = ds.find((t) => t.isActive)!;
    await qpost(`/policy-templates/${mot.id}/deactivate`, 'admin01');
    expect((await pdfOf(`/policies/${d.id}/render`, 'kt01')).status).toBe(200);
    await qpost(`/policy-templates/${mot.id}/publish`, 'admin01');

    const khoiPhuc = await voHieuHet();
    try {
      const r = await dget(`/policies/${d.id}/render`, 'kt01');
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('POLICY_TEMPLATE_MISSING');
      expect(r.body.message).toContain('Quản trị hệ thống');
    } finally {
      await khoiPhuc();
    }
  }, 120_000);

  it('phát hành mẫu hồ sơ KHÔNG hạ mẫu hợp đồng đang dùng', async () => {
    /*
     * Index "đang dùng" cũ cho đúng MỘT mẫu trong toàn bảng. Giữ nguyên thì
     * Quản trị phát hành mẫu hồ sơ là kế toán mất khả năng xuất hợp đồng ngay
     * lúc ấy — một hệ quả không có đường nào đoán ra.
     */
    const d = await toReceivedL1();
    const ds = (await qget('/policy-templates', 'admin01')).body as {
      id: string;
      paperSize: string;
      isActive: boolean;
    }[];
    const t = ds.find((x) => x.isActive && x.paperSize === 'a4p')!;
    expect((await qpost(`/policy-templates/${t.id}/publish`, 'admin01')).status).toBe(200);

    expect((await pdfOf(`/policies/${d.id}/contract.pdf?xem=1`, 'kt01')).status).toBe(200);
  }, 120_000);

  it('mẫu THIẾU MỤC BẮT BUỘC thì không phát hành được', async () => {
    /*
     * Muc 6.4 để ngỏ đúng câu hỏi này: *"nếu mẫu do người dùng soạn, hệ thống
     * không còn bảo đảm được 13 mục kia có mặt"*. Phép kiểm lúc phát hành là
     * câu trả lời — báo cho người SỬA ĐƯỢC, ở màn hình họ đang đứng.
     */
    const up = await (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', 'Mau thieu muc')
      .field('paperSize', 'a4p')
      .attach('file', makeDocx(para('{{ho_so.ten_khach_hang}}')), {
        filename: 'thieu.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    await (await http(doc))
      .put(`/policy-templates/${up.body.id}/mapping`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ mapping: [{ placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang' }] });

    const r = await qpost(`/policy-templates/${up.body.id}/publish`, 'admin01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('TEMPLATE_MISSING_REQUIRED');
    // Nói RÕ thiếu gì, không chỉ nói "thiếu": Quản trị phải sửa được ngay.
    expect(r.body.thieuTruong).toContain('ho_so.ma_ho_so');
    expect(r.body.thieuBangSanPham).toBe('{{bang_san_pham}}');
  }, 120_000);

  it('ô bảng sản phẩm KHÔNG cần ánh xạ — nó không trỏ tới trường nào', async () => {
    const r = await qget('/policy-templates', 'admin01');
    const t = (r.body as { id: string; isActive: boolean; paperSize: string }[]).find(
      (x) => x.isActive && x.paperSize === 'a4p',
    )!;
    const ph = (await qget(`/policy-templates/${t.id}/placeholders`, 'admin01')).body as {
      unmapped: string[];
      coBangSanPham: boolean;
    };
    expect(ph.coBangSanPham).toBe(true);
    expect(ph.unmapped, 'mẫu mặc định phải ánh xạ đủ').toEqual([]);
  }, 90_000);

  it('bản mềm dựng từ MẪU: sửa mẫu thì bản mềm đổi theo', async () => {
    const d = await toReceivedL1();
    const CAU = 'Dieu khoan rieng cua Nutricare';
    const up = await (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', 'Mau moi cua quan tri')
      .attach(
        'file',
        makeDocx(
          [
            para('{{cong_ty.ten}}'),
            para('{{ho_so.ma_ho_so}} — {{ho_so.trang_thai}}'),
            para('{{ho_so.ma_khach_hang}} {{ho_so.ten_khach_hang}} {{ho_so.cong_no}}'),
            para('{{ho_so.ngay_ap_dung}} {{ho_so.nguoi_de_nghi}} {{ho_so.truong_bo_phan}} {{ho_so.ke_toan}}'),
            para('{{ho_so.ngay_tbp_ky}} {{ho_so.ngay_kt_nhan_l2}} {{ho_so.tep_dinh_kem}}'),
            para(CAU),
            para('{{bang_san_pham}}'),
          ].join(''),
        ),
        {
          filename: 'moi.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      );
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    await (await http(doc))
      .put(`/policy-templates/${up.body.id}/mapping`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({
        mapping: [
          { placeholder: '{{cong_ty.ten}}', source: 'cong_ty.ten' },
          { placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so' },
          { placeholder: '{{ho_so.trang_thai}}', source: 'ho_so.trang_thai' },
          { placeholder: '{{ho_so.ma_khach_hang}}', source: 'ho_so.ma_khach_hang' },
          { placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang' },
          { placeholder: '{{ho_so.cong_no}}', source: 'ho_so.cong_no', format: 'money_vnd' },
          { placeholder: '{{ho_so.ngay_ap_dung}}', source: 'ho_so.ngay_ap_dung', format: 'date_dmy' },
          { placeholder: '{{ho_so.nguoi_de_nghi}}', source: 'ho_so.nguoi_de_nghi' },
          { placeholder: '{{ho_so.truong_bo_phan}}', source: 'ho_so.truong_bo_phan' },
          { placeholder: '{{ho_so.ke_toan}}', source: 'ho_so.ke_toan' },
          { placeholder: '{{ho_so.ngay_tbp_ky}}', source: 'ho_so.ngay_tbp_ky', format: 'date_dmy' },
          { placeholder: '{{ho_so.ngay_kt_nhan_l2}}', source: 'ho_so.ngay_kt_nhan_l2', format: 'date_dmy' },
          { placeholder: '{{ho_so.tep_dinh_kem}}', source: 'ho_so.tep_dinh_kem' },
        ],
      });
    /*
     * DỌN SẠCH MẪU CỦA CA NÀY — trạng thái mẫu là TOÀN CỤC.
     *
     * Dữ liệu test không dọn giữa các lượt chạy, và từ `0058` phát hành không
     * còn hạ mẫu cũ, nên mẫu của ca này ở lại danh sách vĩnh viễn nếu không gỡ.
     * Nó lại mang mốc ban hành mới nhất, tức là thành mẫu MỞ SẴN cho mọi lời gọi
     * không kèm `mauId` — kể cả ở tệp kiểm thử khác, vì các tệp dùng chung CSDL.
     *
     * Đã dính đúng chuyện ấy hai lần, và lần nào triệu chứng cũng ở nơi khác:
     * "seed sẵn mỗi khổ một mẫu" đỏ ở lượt chạy THỨ HAI, rồi DOC-02/DOC-03 đỏ vì
     * bản mềm mặc định bỗng thiếu tiêu đề.
     */
    expect((await qpost(`/policy-templates/${up.body.id}/publish`, 'admin01')).status).toBe(200);
    try {
      // Gọi bằng ĐÚNG mẫu vừa ban hành (`0058`) — trước đó là `?size=a4p`, và
      // phép thử phụ thuộc vào việc mẫu mới vừa đá mẫu mặc định ra.
      const pdf = await pdfOf(`/policies/${d.id}/render?mauId=${up.body.id}&xem=1`, 'kt01');
      expect(pdf.status).toBe(200);
      const t = await pdfText(pdf.body as Buffer);
      // Câu chỉ có trong mẫu MỚI — chứng minh bản mềm đọc từ mẫu, không dựng cứng.
      expect(t.replace(/\s+/g, '')).toContain(CAU.replace(/\s+/g, ''));
      // Và bảng sản phẩm vẫn do hệ thống dựng, đủ cột.
      expect(t.replace(/\s+/g, '')).toContain('Giácôngty');
    } finally {
      await qpost(`/policy-templates/${up.body.id}/deactivate`, 'admin01');
    }
  }, 180_000);
});

// =============================================================================
// `0057` — bộ mẫu hồ sơ trong `templates/`
// =============================================================================

describe('`0057` bộ file mẫu trong templates/', () => {
  const HO_SO = [
    'mau-ho-so-a4-doc.docx',
    'mau-ho-so-a4-ngang.docx',
    'mau-ho-so-a4-doc-rut-gon.docx',
  ];
  const HOP_DONG = 'mau-hop-dong-a4-doc.docx';
  const BO = [...HO_SO, HOP_DONG];

  it('cả ba file có mặt và là .docx thật', () => {
    /*
     * File .docx là một file zip — bốn byte đầu là `PK\x03\x04`. Kiểm ở đây vì
     * chúng là BINARY trong git: một lượt commit hỏng, hay một trình soạn thảo
     * lỡ mở ra rồi lưu lại dạng text, đều biến chúng thành file mà máy chủ từ
     * chối ở bước tải lên — và triệu chứng chỉ hiện ra lúc ai đó chạy
     * `make demo-mau`.
     */
    for (const f of BO) {
      const buf = readFileSync(`templates/${f}`);
      expect(buf.length, `${f} rỗng`).toBeGreaterThan(500);
      expect([...buf.subarray(0, 4)], `${f} không phải zip`).toEqual([0x50, 0x4b, 0x03, 0x04]);
    }
  });

  it('mẫu HỒ SƠ nào cũng có ô bảng sản phẩm và đọc được ô trống', () => {
    for (const f of HO_SO) {
      const o = placeholdersOf(readFileSync(`templates/${f}`));
      expect(o, `${f} thiếu ô bảng sản phẩm`).toContain('{{bang_san_pham}}');
      // Mọi ô trống phải là một trường máy chủ NHẬN — trừ ô bảng, vốn không trỏ
      // tới trường nào. Một ô lạ trong file mẫu là một mẫu không ban hành được.
      for (const x of o) {
        if (x === '{{bang_san_pham}}') continue;
        expect(KNOWN_SOURCES, `${f} có ô lạ ${x}`).toContain(x.slice(2, -2));
      }
    }
  });

  it('mẫu RÚT GỌN có đủ 13 mục bắt buộc — nếu không thì không ban hành được', () => {
    /*
     * Mẫu rút gọn tồn tại để trả lời câu "ít nhất phải có những gì". Nó mà thiếu
     * một mục thì chính nó là câu trả lời SAI, và người soạn theo nó bị chặn ở
     * bước ban hành.
     */
    const o = new Set(placeholdersOf(readFileSync('templates/mau-ho-so-a4-doc-rut-gon.docx')));
    expect(NGUON_BAT_BUOC_HO_SO.length, 'phải có đúng 13 mục').toBe(13);
    for (const n of NGUON_BAT_BUOC_HO_SO) {
      expect(o.has(`{{${n}}}`), `mẫu rút gọn thiếu {{${n}}}`).toBe(true);
    }
  });

  it('`0058` mẫu HỢP ĐỒNG vẽ bảng bằng tay — KHÔNG có ô bảng hệ thống', () => {
    /*
     * Hai loại mẫu dựng bảng theo hai cách, và lẫn cách là hỏng im lặng:
     *
     *   - Hồ sơ đặt `{{bang_san_pham}}`; số cột CPBH đổi theo từng hồ sơ nên hệ
     *     thống phải dựng cả bảng (muc 7.1).
     *   - Hợp đồng vẽ bảng trong Word, một dòng thân mang khoá `{{san_pham.*}}`,
     *     và hệ thống nhân bản đúng dòng ấy.
     *
     * Đặt `{{san_pham.*}}` vào mẫu hồ sơ thì không gì nhân bản chúng, và bản in
     * ra mang nguyên chuỗi `{{...}}` — không có thông báo lỗi nào.
     */
    const o = placeholdersOf(readFileSync(`templates/${HOP_DONG}`));
    expect(o, 'mẫu hợp đồng KHÔNG dùng ô bảng của hệ thống').not.toContain('{{bang_san_pham}}');
    expect(o.filter((x) => x.startsWith('{{san_pham.')).length, 'thiếu khoá dòng sản phẩm')
      .toBeGreaterThan(0);

    // Và các mẫu hồ sơ thì ngược lại — không mẫu nào được mang khoá theo dòng.
    for (const f of HO_SO) {
      const p = placeholdersOf(readFileSync(`templates/${f}`));
      expect(p.filter((x) => x.startsWith('{{san_pham.')), `${f} lẫn khoá dòng sản phẩm`).toEqual([]);
    }
  });

  it('`0058` mẫu hợp đồng TẢI LÊN ĐƯỢC và ánh xạ trọn vẹn — không còn ô lạ', async () => {
    /*
     * Phép thử cuối cùng của một file mẫu là chính đường người dùng đi: tải lên,
     * đọc ô trống, ánh xạ theo tên ô, phát hành. Một khoá gõ sai trong file chỉ
     * lộ ra ở bước này.
     */
    const up = await uploadTemplate('sa01', readFileSync(`templates/${HOP_DONG}`), 'Mẫu bàn giao');
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    try {
      const o = (up.body.placeholders as string[]).map((x) => ({
        placeholder: x,
        source: x.slice(2, -2),
      }));
      expect((await dput(`/contract-templates/${up.body.id}/mapping`, 'sa01', { mapping: o })).status)
        .toBe(200);
      const pub = await dpost(`/contract-templates/${up.body.id}/publish`, 'sa01');
      expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    } finally {
      await dpost(`/contract-templates/${up.body.id}/deactivate`, 'sa01');
    }
  }, 90_000);

  it('mẫu A4 ngang thật sự khai khổ NGANG trong file', () => {
    // `w:orient` không đủ một mình — LibreOffice vẫn lấy kích thước từ w:w/w:h.
    // Cả hai phải cùng nói một chuyện, nên kiểm cả nhãn lẫn con số.
    const ngang = documentXml(readFileSync('templates/mau-ho-so-a4-ngang.docx'));
    const doc = documentXml(readFileSync('templates/mau-ho-so-a4-doc.docx'));
    expect(ngang).toContain('w:orient="landscape"');
    expect(ngang).toContain('w:w="16838"');
    expect(doc).not.toContain('w:orient="landscape"');
    expect(doc).toContain('w:w="11906"');
  });
});

// =============================================================================
// `0058` — chọn MẪU thay cho chọn khổ giấy
// =============================================================================

describe('`0058` danh sách mẫu đang dùng, cho ô chọn', () => {
  it('mở cho ĐÚNG những vai trò xem được văn bản, không hơn', async () => {
    /*
     * Đây là một đường đọc MỞ RỘNG: `/contract-templates` còn lại chỉ Sale Admin
     * vào được, riêng `available` thì kế toán cũng phải thấy — chính họ bấm xuất
     * hợp đồng nên chính họ chọn mẫu. Thấy danh sách ≠ sửa được mẫu, và ranh
     * giới ấy phải có ca canh giữ chứ không nằm trong đầu người viết.
     */
    expect((await dget('/contract-templates/available', 'kt01')).status).toBe(200);
    expect((await dget('/contract-templates/available', 'sa01')).status).toBe(200);
    for (const u of ['tdv01', 'tbp01', 'bld01', 'admin01']) {
      expect((await dget('/contract-templates/available', u)).status, u).toBe(403);
    }

    // Mẫu HỒ SƠ thì ngược lại: năm vai trò đọc được bản mềm đều thấy, còn Quản
    // trị — người quản lý chính những mẫu ấy — thì không, vì họ không xem hồ sơ.
    for (const u of ['tdv01', 'tbp01', 'kt01', 'sa01', 'bld01']) {
      expect((await dget('/policy-templates/available', u)).status, u).toBe(200);
    }
  }, 60_000);

  it('trả về ĐÚNG ba trường, không rò cột nội bộ nào của mẫu', async () => {
    const r = await dget('/policy-templates/available', 'tdv01');
    expect(r.status).toBe(200);
    expect((r.body as unknown[]).length).toBeGreaterThan(0);
    for (const m of r.body as Record<string, unknown>[]) {
      expect(Object.keys(m).sort()).toEqual(['id', 'khoGiay', 'ten']);
    }
  }, 30_000);

  it('chỉ liệt kê mẫu ĐANG DÙNG — mẫu nháp không lọt vào ô chọn', async () => {
    /*
     * Mẫu nháp là mẫu chưa qua phép kiểm nào: ánh xạ có thể còn thiếu, và 13 mục
     * bắt buộc chưa được đối chiếu. Cho nó vào ô chọn là mời người dùng in ra
     * một bản mang nguyên chuỗi `{{...}}`.
     */
    const t = await uploadTemplate('sa01', makeDocx(para('Mẫu chưa ban hành')), 'Nháp chưa ban hành');
    const ds = await dget('/contract-templates/available', 'sa01');
    expect((ds.body as { id: string }[]).some((m) => m.id === t.body.id)).toBe(false);
  }, 60_000);

  it('BAN HÀNH mẫu thứ hai KHÔNG hạ mẫu thứ nhất — cả hai cùng ở trong ô chọn', async () => {
    /*
     * Đây là điểm đảo chiều của `0058`, và nó phải được canh ở tầng HTTP chứ
     * không chỉ ở tầng CSDL: bỏ hai partial unique index mà quên bỏ câu UPDATE
     * hạ mẫu cũ trong `publish()` thì lược đồ cho phép hai mẫu, còn phần mềm vẫn
     * lặng lẽ gỡ mẫu cũ — và triệu chứng là ô chọn mãi mãi chỉ có một dòng.
     */
    const truoc = (await dget('/contract-templates/available', 'sa01')).body as { id: string }[];
    expect(truoc.length).toBeGreaterThan(0);

    const t = await uploadTemplate('sa01', makeDocx(para('Bản thứ hai — {{ho_so.ma_ho_so}}')), 'Mẫu thứ hai');
    await dput(`/contract-templates/${t.body.id}/mapping`, 'sa01', {
      mapping: [{ placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so' }],
    });
    expect((await dpost(`/contract-templates/${t.body.id}/publish`, 'sa01')).status).toBe(200);

    try {
      const sau = (await dget('/contract-templates/available', 'sa01')).body as { id: string }[];
      for (const m of truoc) {
        expect(sau.some((x) => x.id === m.id), `mẫu ${m.id} bị hạ xuống oan`).toBe(true);
      }
      expect(sau.some((x) => x.id === t.body.id)).toBe(true);
      // Mẫu vừa ban hành đứng ĐẦU: nó là bản mở sẵn cho lần xem sau.
      expect(sau[0]!.id).toBe(t.body.id);
    } finally {
      await dpost(`/contract-templates/${t.body.id}/deactivate`, 'sa01');
    }
  }, 90_000);

  it('khổ giấy ĐỌC TỪ FILE, không phải từ lời khai của người tải lên', async () => {
    // Tải hai file cùng một lượt gọi, cùng một tham số — chỉ khác nội dung .docx.
    // Nhãn khổ giấy phải theo file, vì không còn ô nào để khai.
    const ngang = await uploadTemplate('sa01', makeDocx(para('nằm ngang'), 'a4l'), 'Tự khai gì cũng thế');
    const doc_ = await uploadTemplate('sa01', makeDocx(para('đứng dọc'), 'a4p'), 'Bản dọc');
    expect(ngang.body.paperSize).toBe('a4l');
    expect(doc_.body.paperSize).toBe('a4p');
  }, 60_000);
});
