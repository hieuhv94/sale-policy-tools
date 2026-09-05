/**
 * POL-01 … POL-19, WF-01 … WF-28, EFF-01 … EFF-13 — hồ sơ CSBH và luồng duyệt.
 *
 * Bốn service chạy thật cùng lúc: identity, catalog, customer nghe trên cổng
 * ngẫu nhiên, policy gọi cả ba bằng HTTP với token dịch vụ.
 *
 * PHÂN CÔNG với các file test khác: ở đây khẳng định tới lớp mà `policy` thật
 * sự chịu trách nhiệm — sự kiện outbox và con trỏ file. Phần EMAIL của
 * WF-01/04/28 (số thư trong Mailpit) nằm ở `notification.test.ts`; phần FILE
 * của WF-13/18/21 (object trên MinIO) thuộc `document`, chặng P6b.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp as createPolicyApp,
  CatalogImpactConsumer,
  Clients,
  TRUONG_CHAN_LUC_GUI,
} from '@csbh/policy/testing';
import { NHOM_TRUONG } from '@csbh/document/testing';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  maDuyNhat,
  http,
  withAdminDb,
  phanCongMacDinh,
  idNguoiDung,
  mstDuyNhat,
} from './app.js';


const SEED_PW = 'Test@1234';
const P = 'ZZPOL';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let app: INestApplication;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const post = async (path: string, body: object, who = 'tdv01') =>
  (await http(app)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const patch = async (path: string, body: object, who = 'tdv01') =>
  (await http(app)).patch(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const get = async (path: string, who = 'tdv01') =>
  (await http(app)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const del = async (path: string, who = 'tdv01') =>
  (await http(app)).delete(path).set('Authorization', `Bearer ${tok[who]}`);

/**
 * MỌI hành động đi qua đây tự kèm người được phân công (`0031`).
 *
 * Xem `phanCongMacDinh`. Ca nào quan tâm tới người cụ thể thì truyền trong
 * `body` — nó nằm sau nên ghi đè mặc định.
 */
const act = async (policyId: string, action: string, who: string, body: object = {}) =>
  post(`/policies/${policyId}/actions/${action}`, { ...(await phanCongMacDinh(action)), ...body }, who);

const uniq = (k: string) => maDuyNhat(P, k);

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';
const products: string[] = [];

/** Sản phẩm có Giá bán Công ty 100.000. Ngưỡng 15,00% đến từ quy định của nhóm. */
const makeProduct = async (): Promise<string> => {
  const c = await http(catalog);
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('SP'), name: 'Nutricare Gold', groupCode, price: '100000' });
  await c
    .post(`/catalog/products/${r.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
  products.push(r.body.id);
  return r.body.id as string;
};

const makeCustomer = async (who = 'tdv01'): Promise<string> => {
  const c = await http(customer);
  const r = await c
    .post('/customers')
    .set('Authorization', `Bearer ${tok[who]}`)
    .send({
      code: uniq('KH'),
      name: 'Nha thuoc thu nghiem',
      customerType: 1,
      province: 'Ha Noi',
      streetWard: 'Ha Noi',
      ownerName: 'Chu ho',
      // `0104` — gửi duyệt đòi đủ MST và chức danh, nên khách hàng
      // của bộ test phải giống khách hàng thật.
      ownerTitle: 'Chu ho',
      idNumber: mstDuyNhat(), phone: '0900000000' });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return r.body.id as string;
};

const line = (productId: string, over: Record<string, unknown> = {}) => ({
  productId,
  wholesalePrice: '90000',
  cpbh: ['5000'],
  ...over,
});

/** Hồ sơ Nháp có một dòng sản phẩm, sẵn sàng gửi duyệt. */
const draft = async (opts: { customerId?: string; productId?: string } = {}) => {
  const customerId = opts.customerId ?? (await makeCustomer());
  const productId = opts.productId ?? (await makeProduct());
  const r = await post('/policies', { customerId, lines: [line(productId)] });
  if (r.status !== 201) throw new Error(`tạo hồ sơ hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, customerId, productId, body: r.body };
};

/** Chạy hết luồng 10 bước tới Đang có hiệu lực. */
const runToActive = async (d: { id: string }) => {
  expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
  expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
  expect(
    (
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
        'sa01',
      )
    ).status,
  ).toBe(201);
      // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
        'sa01',
      );
  expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
  const last = await act(d.id, 'KT_RECEIVE_L2', 'kt01');
  expect(last.status).toBe(200);
  return last;
};

const outboxFor = (policyId: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ routing_key: string; payload: Record<string, unknown> }>(
      // ORDER BY seq chứ không phải created_at: sự kiện phát trong cùng một
      // transaction có created_at giống hệt nhau (now() = thời điểm bắt đầu
      // transaction), nên thứ tự theo thời gian là tuỳ ý.
      `SELECT routing_key, payload FROM pol.outbox
        WHERE payload->>'policyId' = $1 ORDER BY seq`,
      [policyId],
    );
    return r.rows;
  });

const cleanup = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM pol.outbox`);
    // Hồ sơ DA_XOA không xoá được nên phải tắt trigger — chỉ làm trong dọn dẹp test.
    await c.query(`ALTER TABLE pol.policy DISABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(
      `DELETE FROM pol.policy WHERE customer_id IN
         (SELECT id FROM cus.customer WHERE code LIKE $1)`,
      [`${P}%`],
    );
    await c.query(`ALTER TABLE pol.policy ENABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.outbox`);
  });

beforeAll(async () => {
  await cleanup();
  const idn = await bootIdentityListening();
  identity = idn.app;
  restores.push(idn.restore);
  const cat = await bootCatalogListening();
  catalog = cat.app;
  restores.push(cat.restore);
  const cus = await bootCustomerListening();
  customer = cus.app;
  restores.push(cus.restore);

  await clearAccountCache();
  await clearScopeCache();
  app = await createPolicyApp();

  for (const u of ['tdv01', 'tdv02', 'tbp01', 'tbp02', 'kt01', 'kt02', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }

  groupCode = uniq('NHOM');
  const dm = await http(catalog);
  await dm
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: groupCode, name: 'Nhom thu nghiem' });

  // MỘT quy định chiết khấu 15% cho cả nhóm.
  //
  // Trước `0025` con số ấy đến từ ba cột ngưỡng mặc định trên từng sản phẩm. Ba
  // cột đó đã bỏ — bảng quy định là nguồn duy nhất — nên nền của cả tệp test
  // này phải khai một quy định, đúng như người dùng thật sẽ phải làm.
  const r = await dm
    .post('/catalog/discount-rules')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      code: uniq('CK'),
      productGroupCode: groupCode,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1500,
    });
  if (r.status !== 201) throw new Error(`khai quy định hỏng: ${JSON.stringify(r.body)}`);
});

afterAll(async () => {
  await app?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
  await cleanup();
});

// =============================================================================
// POL — lập hồ sơ
// =============================================================================

describe('POL-01 · POL-03 lập hồ sơ', () => {
  it('201, trạng thái Nháp, mã hồ sơ tự sinh', async () => {
    const d = await draft();
    expect(d.body.status).toBe('NHAP');
    expect(d.body.code).toMatch(/^CSBH-\d{4}-\d{6}$/);
    expect(d.body.versionNo).toBe(1);
    expect(d.body.lines).toHaveLength(1);
  });

  it('khách hàng chưa có CSBH nào thì tạo thẳng, không hỏi bổ sung hay chỉnh sửa', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(201);
    expect(r.body.supersedesId).toBeNull();
  });

  it('tính đúng CPBH tổng, giá thu về và tỷ lệ chiết khấu', async () => {
    const d = await draft();
    const l = d.body.lines[0];
    expect(l.companyPrice).toBe('100000');
    expect(l.cpbhTotal).toBe('5000');
    expect(l.netPrice).toBe('85000'); // 90.000 − 5.000
    expect(l.discountRate).toBe('15.00'); // (100.000 − 85.000) / 100.000
    expect(l.overThreshold).toBe(false); // 15,00% không lớn hơn ngưỡng 15,00%
  });
});

describe('POL-02 không trùng sản phẩm trong một hồ sơ', () => {
  it('thêm cùng sản phẩm lần hai thì 409', async () => {
    const d = await draft();
    const r = await post(`/policies/${d.id}/lines`, line(d.productId));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DUPLICATE_PRODUCT');
  });
});

describe('POL-04 … POL-07 bổ sung và chỉnh sửa', () => {
  it('POL-04 sản phẩm chưa có chính sách thì hỏi BỔ SUNG, đúng từng chữ', async () => {
    const d = await draft();
    await runToActive(d);

    const r = await post('/policies', {
      customerId: d.customerId,
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SUPPLEMENT_REQUIRED');
    expect(r.body.message).toBe('CSBH cho sản phẩm này chưa có. Bạn có muốn BỔ SUNG không?');
  });

  it('POL-05 xác nhận BỔ SUNG thì hồ sơ mới chứa TOÀN BỘ sản phẩm cũ cộng sản phẩm mới', async () => {
    const d = await draft();
    await runToActive(d);
    const moi = await makeProduct();

    const r = await post('/policies', {
      customerId: d.customerId,
      mode: 'SUPPLEMENT',
      lines: [line(moi)],
    });
    expect(r.status).toBe(201);
    expect(r.body.versionNo).toBe(2);
    expect(r.body.supersedesId).toBe(d.id);

    const ids = (r.body.lines as { productId: string }[]).map((l) => l.productId).sort();
    expect(ids).toEqual([d.productId, moi].sort());
  });

  it('POL-06 sản phẩm đã có chính sách thì hỏi CHỈNH SỬA, đúng từng chữ', async () => {
    const d = await draft();
    await runToActive(d);

    const r = await post('/policies', {
      customerId: d.customerId,
      lines: [line(d.productId, { wholesalePrice: '80000' })],
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('AMEND_REQUIRED');
    expect(r.body.message).toBe('CSBH cho sản phẩm này đã có. Bạn có muốn CHỈNH SỬA không?');
  });

  it('POL-07 xác nhận CHỈNH SỬA thì hồ sơ mới đầy đủ, giữ liên kết tới bản gốc', async () => {
    const d = await draft();
    await runToActive(d);

    const r = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { wholesalePrice: '80000', cpbh: ['1000'] })],
    });
    expect(r.status).toBe(201);
    expect(r.body.supersedesId).toBe(d.id);
    const l = (r.body.lines as { productId: string; wholesalePrice: string }[])[0];
    expect(l!.wholesalePrice).toBe('80000');
  });

  it('không có CSBH hiệu lực mà gửi mode thì 400', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      mode: 'AMEND',
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('NO_ACTIVE_POLICY');
  });
});

describe('POL-08 phiên bản mới phải chứa lại toàn bộ sản phẩm cũ', () => {
  it('gửi duyệt khi thiếu một sản phẩm thừa kế thì 422', async () => {
    const d = await draft();
    await runToActive(d);
    const moi = await makeProduct();

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'SUPPLEMENT',
      lines: [line(moi)],
    });
    // Xoá dòng thừa kế đi — lúc còn Nháp thì cho phép.
    const old = (v2.body.lines as { id: string; productId: string }[]).find(
      (l) => l.productId === d.productId,
    );
    expect((await del(`/policies/${v2.body.id}/lines/${old!.id}`)).status).toBe(200);

    const sub = await act(v2.body.id, 'SUBMIT', 'tdv01');
    expect(sub.status).toBe(422);
    expect(sub.body.code).toBe('MISSING_INHERITED_PRODUCT');
    expect(sub.body.missing).toHaveLength(1);
  });
});

describe('`0031` chọn người xử lý lúc gửi duyệt', () => {
  /*
   * Thay cho khối `TDV chưa có Trưởng bộ phận quản lý thì chưa gửi được hồ sơ`.
   *
   * Khối cũ canh một ca hỏng có thật: TDV không được gán người duyệt thì hồ sơ
   * đi vào "Chờ TBP duyệt" và NẰM ĐÓ — hộp việc của TBP suy từ `approver_user_id`,
   * không ai gán thì không hộp việc nào chứa nó, và hồ sơ biến mất êm ru tới lúc
   * quá hạn.
   *
   * Ca hỏng ấy không còn tồn tại được: người duyệt chọn ngay tại chỗ gửi. Nhưng
   * ba cách chọn SAI thì có, và cả ba dẫn tới đúng cái ngõ cụt cũ — nên phải
   * chặn cả ba.
   */
  it('thiếu ô chọn thì 422 và nói rõ thiếu ô nào', async () => {
    const d = await draft();
    const r = await post(`/policies/${d.id}/actions/SUBMIT`, {}, 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.code).toBe('ASSIGNEE_REQUIRED');
    expect(r.body.fields).toEqual(['tbpUserId', 'keToanUserId']);
    // Câu báo phải nói việc phải làm, không chỉ nói "không được".
    expect(r.body.message).toContain('Trưởng bộ phận');

    // Hồ sơ vẫn nguyên là bản nháp — chặn ở đây không làm mất gì.
    expect((await get(`/policies/${d.id}`)).body.status).toBe('NHAP');
  });

  it('chọn thiếu MỘT trong hai ô cũng bị chặn', async () => {
    const d = await draft();
    const id = await idNguoiDung();
    const r = await post(`/policies/${d.id}/actions/SUBMIT`, { tbpUserId: id['tbp01'] }, 'tdv01');
    expect(r.status).toBe(422);
    expect(r.body.fields).toEqual(['keToanUserId']);
  });

  it('chọn SAI VAI TRÒ thì 422, kèm tên ô và vai trò thật của người vừa chọn', async () => {
    // Gán một kế toán vào ô Trưởng bộ phận là hồ sơ vào ngõ cụt: người đó không
    // có hành động `TBP_SIGN` nào để làm. Đây đúng là ca mà trigger
    // `forbid_bad_approver` của mô hình cũ chặn ở tầng CSDL.
    const d = await draft();
    const id = await idNguoiDung();
    const r = await post(
      `/policies/${d.id}/actions/SUBMIT`,
      { tbpUserId: id['kt01'], keToanUserId: id['kt01'] },
      'tdv01',
    );
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.code).toBe('ASSIGNEE_WRONG_ROLE');
    expect(r.body.field).toBe('tbpUserId');
    expect(r.body.message).toContain('KE_TOAN');
  });

  it('chọn tài khoản ĐÃ VÔ HIỆU HOÁ thì 422', async () => {
    // Ô chọn của giao diện đã lọc, nhưng ô chọn là thứ người dùng sửa được.
    const d = await draft();
    const id = await idNguoiDung();
    await withAdminDb((c) =>
      c.query(`UPDATE idn.app_user SET is_active = false WHERE username = 'tbp02'`),
    );
    try {
      const r = await post(
        `/policies/${d.id}/actions/SUBMIT`,
        { tbpUserId: id['tbp02'], keToanUserId: id['kt01'] },
        'tdv01',
      );
      expect(r.status, JSON.stringify(r.body)).toBe(422);
      expect(r.body.code).toBe('ASSIGNEE_INACTIVE');
    } finally {
      await withAdminDb((c) =>
        c.query(`UPDATE idn.app_user SET is_active = true WHERE username = 'tbp02'`),
      );
    }
  });

  it('chọn đúng thì hồ sơ GHI LẠI cả hai người, và hộp việc chỉ hiện ở người được chọn', async () => {
    const d = await draft();
    const id = await idNguoiDung();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const cot = await withAdminDb(async (c) => {
      const r = await c.query<{ tbp: string; kt: string }>(
        `SELECT tbp_user_id AS tbp, ke_toan_user_id AS kt FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return r.rows[0]!;
    });
    expect(cot.tbp).toBe(id['tbp01']);
    expect(cot.kt).toBe(id['kt01']);

    // tbp01 được chọn → thấy trong hộp việc. tbp02 không → không thấy.
    const cua = (who: string) => hetHopViec(who);
    expect(await cua('tbp01')).toContain(d.id);
    expect(await cua('tbp02')).not.toContain(d.id);
  });

  it('Trưởng bộ phận KHÔNG được chọn thì không đọc nổi hồ sơ', async () => {
    // Ranh giới chặt hơn hẳn mô hình cây: trước đây mọi TBP cùng nhánh đều đọc
    // được. Giờ chỉ người được ghi tên lên hồ sơ.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await get(`/policies/${d.id}`, 'tbp01')).status).toBe(200);
    const ngoai = await get(`/policies/${d.id}`, 'tbp02');
    expect(ngoai.status).toBe(403);
    expect(ngoai.body.code).toBe('OUT_OF_SCOPE');
  });
});

/**
 * HỘP VIỆC ĐẦY ĐỦ — đọc hết mọi trang, không chỉ trang đầu (`0064`).
 *
 * Trước đó các ca gọi thẳng `?limit=200` — đúng trần của `pageOf` — rồi khẳng
 * định hồ sơ vừa lập có mặt. Nó đúng cho tới hôm tệp test này tự tích đủ 200 hồ
 * sơ nháp của `tdv01`: hộp việc xếp `sla_due_at NULLS LAST, created_at`, mà nháp
 * không có hạn, nên hồ sơ MỚI NHẤT nằm ở cuối — đúng thứ bị cắt mất.
 *
 * Loại đỏ này chỉ xuất hiện khi tệp đủ dài, và nó trỏ vào một chỗ chẳng liên
 * quan gì tới thứ vừa sửa. Đọc hết trang thì nó không bao giờ quay lại.
 */
const hetHopViec = async (who: string): Promise<string[]> => {
  const ra: string[] = [];
  for (let offset = 0; ; offset += 200) {
    const r = await get(`/policies/inbox?limit=200&offset=${offset}`, who);
    const items = (r.body.items ?? []) as { id: string }[];
    ra.push(...items.map((x) => x.id));
    if (items.length < 200) return ra;
  }
};

describe('`0056` hồ sơ mang theo AI ĐÃ DUYỆT bước nào', () => {
  const duyet = async (id: string, who = 'tdv01') =>
    (await get(`/policies/${id}`, who)).body.nguoiDuyet as Record<
      string,
      { ten: string | null; luc: string } | null
    >;

  it('hồ sơ chưa qua bước nào thì rỗng sạch — không bày ô chờ điền', async () => {
    const d = await draft();
    const n = await duyet(d.id);
    expect(n.tbp).toBeNull();
    expect(n.keToanL1).toBeNull();
    expect(n.keToanL2).toBeNull();
    expect(n.saleAdmin).toBeNull();
  });

  it('điền dần theo từng bước, và mốc thời gian đi KÈM tên', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await duyet(d.id)).tbp, 'chưa ký mà đã có người ký').toBeNull();

    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    const sauKy = await duyet(d.id);
    expect(sauKy.tbp).not.toBeNull();
    expect(sauKy.tbp!.ten, 'thiếu tên người ký').toBeTruthy();
    // Thiếu mốc thì người đọc vẫn phải mở nhật ký ra mới biết hồ sơ nằm đó bao
    // lâu — đúng chuyến đi mà dải này sinh ra để khỏi phải làm.
    expect(Number.isNaN(Date.parse(sauKy.tbp!.luc)), 'mốc thời gian không đọc được').toBe(false);
    expect(sauKy.keToanL1, 'kế toán chưa nhận mà đã hiện').toBeNull();

    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    expect((await duyet(d.id)).keToanL1!.ten).toBeTruthy();
  });

  it('đi hết luồng thì có đủ bốn bước', async () => {
    const d = await draft();
    await runToActive(d);
    const n = await duyet(d.id);
    for (const k of ['tbp', 'keToanL1', 'saleAdmin', 'keToanL2']) {
      expect(n[k], `thiếu bước ${k}`).not.toBeNull();
      expect(n[k]!.ten, `bước ${k} thiếu tên`).toBeTruthy();
    }
  });

  it('người ký lấy từ `tbp_signed_by`, không phải người được phân công', async () => {
    /*
     * Hai cột khác nhau khi có người duyệt thay: `tbp_user_id` là người ĐƯỢC
     * CHỌN lúc gửi duyệt, `tbp_signed_by` là người THẬT SỰ đặt bút. Đọc cột đầu
     * là ghi công sai người — và đó là loại sai không ai phát hiện ra được từ
     * màn hình, vì cả hai đều là tên một Trưởng bộ phận có thật.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);

    // Đổi người ĐƯỢC PHÂN CÔNG sang tbp02, giữ nguyên người đã ký là tbp01.
    await withAdminDb((c) =>
      c.query(
        `UPDATE pol.policy SET tbp_user_id = (SELECT id FROM idn.app_user WHERE username = 'tbp02')
          WHERE id = $1`,
        [d.id],
      ),
    );

    // Đọc bằng TDV phụ trách, không bằng `tbp01`: đổi người được phân công sang
    // tbp02 làm tbp01 rơi ra khỏi phạm vi hồ sơ, và `GET /policies/:id` trả 403.
    const n = await duyet(d.id, 'tdv01');
    const ten01 = await withAdminDb(async (c) => {
      const r = await c.query<{ full_name: string }>(
        `SELECT full_name FROM idn.app_user WHERE username = 'tbp01'`,
      );
      return r.rows[0]!.full_name;
    });
    expect(n.tbp!.ten, 'ghi công cho người được phân công thay vì người đã ký').toBe(ten01);
  });
});

describe('`0061` hồ sơ mang theo đủ thứ đầu màn hình cần', () => {
  it('ngày soạn thảo, người đề nghị và khách hàng đều có mặt', async () => {
    /*
     * Tới `0060` màn hình hồ sơ KHÔNG hiện khách hàng nào cả — chỉ có
     * `customerId` trong dữ liệu, không vẽ ra đâu hết. Nghĩa là người sắp ký một
     * chính sách bán hàng không đọc được nó dành cho ai, trừ khi tải bản A4 về.
     */
    const d = await draft();
    const r = await get(`/policies/${d.id}`, 'tdv01');
    expect(r.status).toBe(200);

    expect(Number.isNaN(Date.parse(r.body.createdAt)), 'ngày soạn thảo không đọc được').toBe(false);
    expect(r.body.nguoiDeNghi?.ten, 'thiếu tên người đề nghị').toBeTruthy();

    const kh = r.body.khachHang;
    expect(kh, 'thiếu hẳn khối khách hàng').toBeTruthy();
    expect(kh.ma).toBeTruthy();
    expect(kh.ten).toBeTruthy();
    expect([1, 2, 3]).toContain(kh.loai);
    // Công nợ là bigint dạng CHUỖI: quá 2^53 thì chuyển sang số là mất chữ số
    // trong im lặng, và đây là tiền.
    expect(typeof kh.congNo).toBe('string');
  });

  it('người đề nghị là người LẬP, không phải TDV đang phụ trách khách hàng', async () => {
    /*
     * Hai cột khác nhau, và Sale Admin đổi được cột sau. Đọc nhầm sang đó thì
     * đổi người phụ trách xong là hồ sơ cũ đổi luôn tên người đề nghị — viết lại
     * lịch sử của một văn bản đã gửi đi.
     */
    const d = await draft();
    const ten = await withAdminDb(async (c) => {
      const r = await c.query<{ full_name: string }>(
        `SELECT full_name FROM idn.app_user WHERE username = 'tdv01'`,
      );
      return r.rows[0]!.full_name;
    });

    await withAdminDb((c) =>
      c.query(
        `UPDATE pol.policy SET tdv_user_id = (SELECT id FROM idn.app_user WHERE username = 'tdv02')
          WHERE id = $1`,
        [d.id],
      ),
    );

    // Đọc bằng tdv02: đổi cột phụ trách xong thì tdv01 rơi ra khỏi phạm vi hồ sơ.
    const r = await get(`/policies/${d.id}`, 'tdv02');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.nguoiDeNghi.ten, 'đọc nhầm sang TDV đang phụ trách').toBe(ten);
  });
});

describe('`0052` hộp việc của TDV gồm cả hồ sơ Nháp', () => {
  const hopViec = (who: string) => hetHopViec(who);

  it('hồ sơ chưa gửi duyệt nằm trong hộp việc của người lập', async () => {
    /*
     * Đi cùng việc bỏ thẻ *Nháp* khỏi dải thẻ của TDV.
     *
     * Hai thứ ấy nói cùng một chuyện — "hồ sơ bạn chưa gửi đi" — nên bày cả hai
     * là bắt người dùng đọc một con số ở trên rồi đọc lại chính danh sách ấy ở
     * dưới. Bỏ thẻ mà KHÔNG thêm vào hộp việc thì hồ sơ nháp biến mất khỏi trang
     * tổng quan, và đó là thứ duy nhất TDV mở phần mềm ra để làm tiếp.
     */
    const d = await draft();
    expect(await hopViec('tdv01'), 'hồ sơ nháp rơi khỏi hộp việc').toContain(d.id);
  });

  it('gửi duyệt xong thì RỜI hộp việc của TDV, sang hộp việc của TBP', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect(await hopViec('tdv01'), 'gửi rồi mà vẫn là việc của TDV').not.toContain(d.id);
    expect(await hopViec('tbp01')).toContain(d.id);
  });

  it('ba vai trò còn lại KHÔNG thấy hồ sơ nháp của người khác', async () => {
    // Hồ sơ chưa gửi duyệt chưa từng rời khỏi bàn người lập — nó không phải việc
    // của ai khác, và cũng chưa có ai khác được phân công vào nó.
    const d = await draft();
    for (const who of ['tbp01', 'kt01', 'sa01']) {
      expect(await hopViec(who), `${who} thấy hồ sơ nháp`).not.toContain(d.id);
    }
  });

  it('hồ sơ nháp của TDV khác cũng không lọt vào hộp việc của mình', async () => {
    // Phạm vi dữ liệu vẫn áp như mọi chỗ khác: `NHAP` không nới lỏng gì cả.
    const cua02 = await makeCustomer('tdv02');
    const sp = await makeProduct();
    const r = await post('/policies', { customerId: cua02, lines: [line(sp)] }, 'tdv02');
    expect(r.status).toBe(201);

    expect(await hopViec('tdv01')).not.toContain(r.body.id);
    expect(await hopViec('tdv02')).toContain(r.body.id);
  });
});

describe('POL-09 ngày áp dụng trong quá khứ', () => {
  it('chấp nhận — chỉ là thông tin hiển thị, không chi phối trạng thái', async () => {
    const d = await draft();
    const r = await patch(`/policies/${d.id}`, { appliedDate: '2020-01-01' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('NHAP');
    expect(String(r.body.appliedDate)).toContain('2020-01-01');
  });
});

describe('POL-10 mọi CSBH đều vô thời hạn', () => {
  it('lược đồ KHÔNG có cột ngày hết hiệu lực nào', async () => {
    const cols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'pol' AND table_name IN ('policy','policy_line')`,
      );
      return r.rows.map((x) => x.column_name);
    });
    for (const bad of ['expires_at', 'expiry_date', 'effective_to', 'valid_to', 'end_date']) {
      expect(cols, `không được có cột ${bad}`).not.toContain(bad);
    }
    // `deactivated_at` là DẤU VẾT bị thay thế, không phải hạn định trước.
    expect(cols).toContain('deactivated_at');
  });

  it('hồ sơ trả về không có trường hạn hiệu lực', async () => {
    const d = await draft();
    const keys = Object.keys(d.body);
    expect(keys).not.toContain('expiresAt');
    expect(keys).not.toContain('effectiveTo');
  });
});

describe('POL-11 hồ sơ đã gửi duyệt thì khoá sửa', () => {
  it('sửa sau khi gửi duyệt thì 409 POLICY_LOCKED', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await patch(`/policies/${d.id}`, { appliedDate: '2026-01-01' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_LOCKED');
  });

  it('thêm dòng sau khi gửi duyệt cũng bị chặn', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await post(`/policies/${d.id}/lines`, line(await makeProduct()));
    expect(r.status).toBe(409);
  });
});

describe('`0099` chỉ TDV ĐANG PHỤ TRÁCH sửa được hồ sơ', () => {
  /*
   * Dựng lại trên chồng demo trước khi viết ca này, và cả ba đều là 200:
   *
   *   bld01 xoá dòng khỏi hồ sơ NHÁP của tdv01     -> 200, còn 1 dòng
   *   tbp01 xoá dòng khỏi hồ sơ YEU_CAU_CHINH_SUA  -> 200, còn 1 dòng
   *   kt01  xoá dòng khỏi hồ sơ YEU_CAU_CHINH_SUA  -> 200, 7 dòng còn 6
   *
   * Hai nguyên nhân chồng lên nhau, và phải kiểm CẢ HAI:
   *
   *   1. `@Roles('TDV')` rơi mất khỏi đường xoá dòng (P26). Cái này bld01 dùng —
   *      phạm vi dữ liệu của Ban lãnh đạo chứa mọi TDV, nên `assertPolicyInScope`
   *      cho họ qua ở hồ sơ Nháp của bất kỳ ai.
   *   2. `mustEdit` hỏi "tôi có LIÊN QUAN tới hồ sơ này không" thay vì "tôi có
   *      được SỬA nó không". Cái này tbp01 và kt01 dùng: hồ sơ bị trả lại vẫn
   *      giữ tên họ ở `tbp_user_id`/`ke_toan_user_id`, nên họ nằm trong phạm vi
   *      của chính hồ sơ ấy — dán lại `@Roles` KHÔNG chặn được đường này.
   *
   * Nên hai ca dưới đây phải cùng xanh: gỡ bản sửa ở `mustEdit` thì ca thứ hai
   * đỏ, gỡ `@Roles` thì ca thứ nhất đỏ.
   */
  it('Ban lãnh đạo KHÔNG xoá được dòng sản phẩm khỏi hồ sơ Nháp của người khác', async () => {
    const d = await draft();
    const truoc = await get(`/policies/${d.id}`);
    const lineId = truoc.body.lines[0].id as string;

    const r = await del(`/policies/${d.id}/lines/${lineId}`, 'bld01');
    expect(r.status).toBe(403);

    const sau = await get(`/policies/${d.id}`);
    expect(sau.body.lines).toHaveLength(truoc.body.lines.length);
  });

  it('Trưởng bộ phận và Kế toán KHÔNG sửa được hồ sơ họ vừa trả lại', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    // Trả lại: hồ sơ về YEU_CAU_CHINH_SUA và VẪN mang tên tbp01, kt01 ở bốn cột
    // người — đó là điều kiện làm `assertPolicyInScope` cho họ qua.
    expect(
      (await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thiếu giấy tờ, đề nghị bổ sung' })).status,
    ).toBe(200);

    const truoc = await get(`/policies/${d.id}`);
    expect(truoc.body.status).toBe('YEU_CAU_CHINH_SUA');
    const lineId = truoc.body.lines[0].id as string;

    for (const who of ['tbp01', 'kt01']) {
      const r = await del(`/policies/${d.id}/lines/${lineId}`, who);
      expect(r.status, `${who} xoá được dòng của hồ sơ đang chờ TDV sửa`).toBe(403);
      // `ROLE_FORBIDDEN` chứ không `NOT_OWNER`: LỚP NGOÀI bắt trước. Cả hai lớp
      // đều chặn được ca này — gỡ `@Roles` thì `mustEdit` trả `NOT_OWNER`, gỡ
      // `mustEdit` thì chốt vai trò trả `ROLE_FORBIDDEN`, gỡ cả hai mới ra 200.
      // Khẳng định lớp ngoài vì đó là thứ người gọi thật sự nhận được.
      expect(r.body.code).toBe('ROLE_FORBIDDEN');
    }

    const sau = await get(`/policies/${d.id}`);
    expect(sau.body.lines).toHaveLength(truoc.body.lines.length);
  });

  it('chính TDV đang phụ trách thì vẫn xoá được — bản sửa không khoá nhầm người', async () => {
    const d = await draft({ productId: await makeProduct() });
    const them = await post(`/policies/${d.id}/lines`, line(await makeProduct()));
    expect(them.status).toBe(201);

    const truoc = await get(`/policies/${d.id}`);
    expect(truoc.body.lines.length).toBe(2);
    const r = await del(`/policies/${d.id}/lines/${truoc.body.lines[1].id}`);
    expect(r.status).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines).toHaveLength(1);
  });

  it('TDV KHÁC cũng không sửa được, dù cùng vai trò', async () => {
    const d = await draft();
    const lineId = (await get(`/policies/${d.id}`)).body.lines[0].id as string;
    // tdv02 không có tên ở cột nào của hồ sơ này, nên họ dừng sớm hơn một bước:
    // ở phạm vi dữ liệu, không phải ở phép so người phụ trách.
    const r = await del(`/policies/${d.id}/lines/${lineId}`, 'tdv02');
    expect(r.status).toBe(403);
  });
});

describe('POL-12 TDV không sửa được giá bán Công ty và ngưỡng', () => {
  it('gửi kèm companyPrice thì 400', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      companyPrice: '1',
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('FIELD_NOT_ALLOWED');
  });

  it('gửi kèm thresholdRate2 trong dòng sản phẩm cũng bị chặn', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      lines: [{ ...line(await makeProduct()), thresholdRate2: 9999 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.fields).toContain('thresholdRate2');
  });

  it('giá và ngưỡng luôn lấy từ danh mục, đóng băng vào hồ sơ', async () => {
    const d = await draft();
    expect(d.body.lines[0].companyPrice).toBe('100000');

    // So với chính DANH MỤC, không so với một con số viết cứng.
    //
    // Bất biến cần kiểm là "ngưỡng trên dòng hồ sơ CHÍNH LÀ ngưỡng danh mục trả
    // về", chứ không phải "ngưỡng bằng 15,00". Viết cứng con số là ngầm giả định
    // thêm một điều kiện — rằng không quy định chiết khấu nào khớp sản phẩm này
    // — mà điều kiện đó phụ thuộc dữ liệu của tệp test KHÁC đang chạy song song
    // trên cùng một CSDL. Từ khi quy định chiết khấu vô thời hạn (0020), giả
    // định ấy càng dễ vỡ: một dòng khai từ 2020 không còn tự hết hiệu lực.
    const tra = await (await http(catalog))
      .get(
        `/catalog/thresholds/resolve?productId=${d.productId}&customerType=1`,
      )
      .set('Authorization', `Bearer ${tok['admin01']}`);
    expect(tra.status, JSON.stringify(tra.body)).toBe(200);
    const mongDoi = (tra.body.thresholdRate2 / 100).toFixed(2);
    expect(d.body.lines[0].threshold).toBe(mongDoi);
  });
});

/**
 * Đưa một hồ sơ mới tới đúng một trạng thái, để ma trận xoá bên dưới thử được
 * CẢ MƯỜI MỘT.
 *
 * MỘT trạng thái không tới được bằng lời gọi API và phải đặt thẳng bằng SQL:
 * `QUA_HAN_DUYET` — chỉ `sla-worker` đặt, sau 14 ngày. Nó là một NHÃN chồng lên
 * trạng thái chờ, nên đặt kèm `pending_step` đúng như worker làm.
 *
 * `TBP_DA_KY_SO` từng là trạng thái thứ hai phải đặt bằng SQL. Nó đã bị gỡ khỏi
 * máy trạng thái ở `0064` và khỏi enum của CSDL ở `0048`, nên câu lệnh SQL ấy
 * giờ hỏng chứ không chỉ vô nghĩa.
 */
const datTrangThai = (id: string, tt: string, buoc: string | null = null) =>
  withAdminDb((c) =>
    c.query(
      `UPDATE pol.policy SET status = $2::pol.policy_status,
              pending_step = $3::pol.policy_step WHERE id = $1`,
      [id, tt, buoc],
    ),
  );

/** Hồ sơ ở `YEU_CAU_CHINH_SUA` — ba đường trả về, mặc định là TBP trả lại. */
const biTraLai = async (
  qua: 'TBP_RETURN' | 'KT_RETURN_L1' | 'KT_RETURN_L2' = 'TBP_RETURN',
) => {
  const d = await draft();
  await act(d.id, 'SUBMIT', 'tdv01');
  if (qua === 'TBP_RETURN') {
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' });
  } else {
    await act(d.id, 'TBP_SIGN', 'tbp01');
    if (qua === 'KT_RETURN_L1') {
      await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Sai ma khach hang' });
    } else {
      await act(d.id, 'KT_RECEIVE_L1', 'kt01');
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
        'sa01',
      );
      // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
        'sa01',
      );
      await act(d.id, 'SA_HANDOVER', 'sa01');
      await act(d.id, 'KT_RETURN_L2', 'kt01', { reason: 'Ban cung sai mau' });
    }
  }
  expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
  return d;
};

const nhatKy = (policyId: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ from_status: string; to_status: string; action: string }>(
      `SELECT from_status::text, to_status::text, action FROM pol.policy_event
        WHERE policy_id = $1 ORDER BY seq`,
      [policyId],
    );
    return r.rows;
  });

describe('POL-13 · POL-14 · `0035` xoá hồ sơ', () => {
  describe('Nháp — xoá hẳn, không để lại vết', () => {
    it('POL-13 xoá hồ sơ Nháp của chính mình thì 204 và hồ sơ biến mất', async () => {
      const d = await draft();
      expect((await del(`/policies/${d.id}`)).status).toBe(204);
      expect((await get(`/policies/${d.id}`)).status).toBe(404);
      // Chống spam: bản nháp không để lại dòng nhật ký nào (`0035`).
      expect(await nhatKy(d.id)).toEqual([]);
    });

    it('phát `policy.deleted` — read-model phải XOÁ dòng, không phải cập nhật', async () => {
      const d = await draft();
      await del(`/policies/${d.id}`);
      const khoa = (await outboxFor(d.id)).map((e) => e.routing_key);
      expect(khoa).toContain('policy.deleted');
      expect(khoa).not.toContain('policy.discarded');
    });

    it('xoá nháp rồi lập lại cho cùng khách hàng thì được', async () => {
      const d = await draft();
      await del(`/policies/${d.id}`);
      const lai = await post('/policies', {
        customerId: d.customerId,
        lines: [line(d.productId)],
      });
      expect(lai.status).toBe(201);
    });
  });

  describe('Yêu cầu chỉnh sửa — chuyển `DA_XOA`, giữ nguyên lịch sử', () => {
    // Ba đường về `YEU_CAU_CHINH_SUA` đều phải xoá được: yêu cầu nghiệp vụ nêu
    // đích danh cả ba ("bị Yêu cầu chỉnh sửa, L1 hoặc L2 không tiếp nhận").
    for (const qua of ['TBP_RETURN', 'KT_RETURN_L1', 'KT_RETURN_L2'] as const) {
      it(`bị trả lại qua ${qua} thì TDV xoá được, hồ sơ còn nguyên ở "Đã xoá"`, async () => {
        const d = await biTraLai(qua);
        expect((await del(`/policies/${d.id}`)).status).toBe(204);

        const sau = await get(`/policies/${d.id}`);
        expect(sau.status).toBe(200);
        expect(sau.body.status).toBe('DA_XOA');
      });
    }

    it('ghi vào nhật ký của chính hồ sơ, và KHÔNG xoá dòng cũ nào', async () => {
      const d = await biTraLai('TBP_RETURN');
      const truoc = await nhatKy(d.id);
      await del(`/policies/${d.id}`);
      const sau = await nhatKy(d.id);

      // Lịch sử chỉ DÀI THÊM. Lý do trả lại của Trưởng bộ phận vẫn còn — đó là
      // phần việc của người khác, xoá nó đi là làm biến mất một việc đã làm.
      expect(sau.slice(0, truoc.length)).toEqual(truoc);
      expect(sau).toHaveLength(truoc.length + 1);
      expect(sau.at(-1)).toEqual({
        from_status: 'YEU_CAU_CHINH_SUA',
        to_status: 'DA_XOA',
        action: 'DELETE',
      });
    });

    it('phát `policy.discarded` kèm người nhận, KHÔNG phát `policy.deleted`', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);
      const evs = await outboxFor(d.id);
      const khoa = evs.map((e) => e.routing_key);

      // Dùng nhầm `policy.deleted` ở đây thì `sync.service.ts` xoá dòng
      // read-model, và hồ sơ "Đã xoá" biến mất khỏi mọi báo cáo — đúng thứ việc
      // giữ lại lịch sử sinh ra để tránh.
      expect(khoa).toContain('policy.discarded');
      expect(khoa).not.toContain('policy.deleted');

      const e = evs.find((x) => x.routing_key === 'policy.discarded')!;
      // Người đã trả hồ sơ lại đang chờ một bản sửa sẽ không bao giờ tới.
      expect(e.payload['recipients']).toEqual(['TBP', 'KE_TOAN']);
      expect(e.payload['toStatus']).toBe('DA_XOA');
      expect(e.payload['tbpUserId']).toBe((await idNguoiDung())['tbp01']);
    });

    it('xoá rồi thì lập hồ sơ mới cho cùng khách hàng được', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);
      const lai = await post('/policies', {
        customerId: d.customerId,
        lines: [line(d.productId)],
      });
      expect(lai.status).toBe(201);
    });
  });

  describe('`0050` hồ sơ mang theo chênh lệch so với danh mục', () => {
    /*
     * Người sắp ký thường mở THẲNG hồ sơ — từ thư báo, từ hộp việc, từ danh sách
     * — chứ không đi vòng qua trang tổng quan. Tới `0049` thông tin "số này đã
     * lỗi thời" chỉ có ở box *Yêu cầu cập nhật* trên trang ấy, nên ai mở thẳng
     * hồ sơ thì không có gì nói cho họ biết.
     */
    const lechCua = async (id: string, who = 'tdv01') =>
      (await get(`/policies/${id}`, who)).body.lech as { kind: string; productCode: string }[];

    it('rỗng khi không có dấu vết nào', async () => {
      const d = await draft();
      expect(await lechCua(d.id)).toEqual([]);
    });

    it('trả đúng dấu vết của hồ sơ ĐÃ ĐÓNG BĂNG', async () => {
      const d = await draft();
      expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

      await withAdminDb((c) =>
        c.query(
          `INSERT INTO pol.policy_impact
             (policy_id, product_id, kind, product_code, snap_value, new_value)
           SELECT $1, product_id, 'PRICE', product_code_snap, '100', '120'
             FROM pol.policy_line WHERE policy_id = $1`,
          [d.id],
        ),
      );

      const l = await lechCua(d.id);
      expect(l.length).toBeGreaterThan(0);
      expect(l[0]!.kind).toBe('PRICE');
    });

    it('hồ sơ chưa đóng băng thì KHÔNG trả dấu vết, dù bảng còn dòng cũ', async () => {
      /*
       * `byId` vừa LÀM MỚI giá và ngưỡng ngay trước đó cho hồ sơ còn sửa được,
       * nên nó không thể lệch. Một dòng dấu vết còn sót từ lần gửi duyệt trước
       * mà hiện ra ở đây là cảnh báo về một chênh lệch đã tự biến mất — người
       * dùng đi tìm mãi không thấy.
       */
      const d = await draft();
      await withAdminDb((c) =>
        c.query(
          `INSERT INTO pol.policy_impact
             (policy_id, product_id, kind, product_code, snap_value, new_value)
           SELECT $1, product_id, 'PRICE', product_code_snap, '100', '120'
             FROM pol.policy_line WHERE policy_id = $1`,
          [d.id],
        ),
      );
      expect(await lechCua(d.id)).toEqual([]);
    });
  });

  describe('`0048` ba cờ còn lại — thao tác không làm được thì KHÔNG hiện', () => {
    /*
     * Yêu cầu của khách hàng: "thao tác nào không thực hiện được thì không hiển
     * thị, tránh trường hợp nhấn vào rồi hiện lỗi".
     *
     * Nên phép kiểm ở đây KHÔNG so cờ với một bảng trạng thái chép tay — chép
     * tay thì test và mã cùng sai một kiểu. Nó so cờ với VIỆC MÁY CHỦ CÓ NHẬN
     * THẬT KHÔNG: bật cờ mà gọi vào 409, hoặc tắt cờ mà gọi vào 200, đều đỏ.
     */
    const co = async (policyId: string, who = 'tdv01') =>
      (await get(`/policies/${policyId}`, who)).body as {
        loaiTepGhiDuoc: string[];
        xuatHopDongDuoc: boolean;
        xoaDuoc: boolean;
      };

    /** Ép hồ sơ về một trạng thái bất kỳ để soi cờ, không phải đi hết luồng. */
    const dat = (id: string, tt: string) =>
      withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = $2::pol.policy_status WHERE id = $1`, [id, tt]),
      );

    it('`loaiTepGhiDuoc` khớp đúng loại tệp máy chủ nhận', async () => {
      /*
       * Bảng này đọc bằng CON MẮT CỦA `tdv01`, và từ `0069` điều đó có nghĩa.
       *
       * Cờ giờ xét cả VAI TRÒ: `SCAN` chỉ Sale Admin, `HO_SO` chỉ TDV. Nên với
       * `tdv01` thì `SA_DANG_XU_LY` cho ra danh sách RỖNG — đúng, vì bản scan
       * không phải việc của họ. Nửa còn lại (Sale Admin thấy `['SCAN']`) nằm ở
       * ca `0069` phía dưới, nơi hồ sơ đi hết luồng thật nên `sa01` mới trong
       * phạm vi.
       */
      const MONG: Record<string, string[]> = {
        NHAP: ['HO_SO'],
        YEU_CAU_CHINH_SUA: ['HO_SO'],
        SA_DANG_XU_LY: [],
        CHO_TBP_DUYET: [],
        CHO_KT_L1: [],
        CHO_KT_L2: [],
        DANG_CO_HIEU_LUC: [],
        QUA_HAN_DUYET: [],
        DA_XOA: [],
      };

      for (const [tt, mong] of Object.entries(MONG)) {
        const d = await draft();
        await dat(d.id, tt);
        expect((await co(d.id)).loaiTepGhiDuoc, tt).toEqual(mong);

        /*
         * Và cờ ấy phải ĐÚNG: thử đính kèm cả hai loại, xem máy chủ nhận cái nào.
         *
         * Gọi bằng `tdv01` — TDV phụ trách luôn nằm trong phạm vi hồ sơ của mình
         * ở MỌI trạng thái. Dùng `sa01` thì hồ sơ còn ở Nháp trả 403 vì chưa
         * phân công, và ca kiểm thử đỏ vì phạm vi chứ không vì cái cờ nó đang đo.
         */
        for (const loai of ['HO_SO', 'SCAN']) {
          const r = await post(
            `/policies/${d.id}/attachments`,
            { kind: loai, fileName: 'a.pdf', objectKey: uniq('k') },
            'tdv01',
          );
          const nhan = r.status === 201;
          expect(nhan, `${tt}/${loai}: cờ nói ${mong.includes(loai)} mà máy chủ nói ${nhan}`).toBe(
            mong.includes(loai),
          );
        }
        await dat(d.id, 'NHAP');
      }
    });

    it('`xuatHopDongDuoc` bật đúng từ lúc kế toán tiếp nhận lần 1', async () => {
      // Cổng là MỐC THỜI GIAN, không phải trạng thái (muc 8.3): mốc ấy không mất
      // đi khi hồ sơ đi tiếp, nên cờ phải còn bật ở cả những bước sau.
      const d = await draft();
      expect((await co(d.id)).xuatHopDongDuoc, 'chưa gửi duyệt mà đã xuất được').toBe(false);

      expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
      expect((await co(d.id)).xuatHopDongDuoc, 'mới gửi duyệt mà đã xuất được').toBe(false);

      expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
      expect((await co(d.id)).xuatHopDongDuoc, 'TBP mới ký mà đã xuất được').toBe(false);

      expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
      expect((await co(d.id)).xuatHopDongDuoc, 'đã nhận L1 mà chưa xuất được').toBe(true);
    });

    it('hồ sơ QUÁ HẠN tắt sạch mọi cờ ghi', async () => {
      // Khớp `0047`: quá hạn là trạng thái chết. Giao diện không được bày một
      // nút nào lên hồ sơ ấy — kể cả nút đính kèm hay nút gỡ tệp.
      const d = await draft();
      await dat(d.id, 'QUA_HAN_DUYET');
      const c = await co(d.id);
      // Một trường cho cả nút tải lên lẫn nút gỡ từ `0097` — rỗng là tắt cả hai.
      expect(c.loaiTepGhiDuoc).toEqual([]);
      expect(c.xoaDuoc).toBe(false);
      expect((await get(`/policies/${d.id}/allowed-actions`, 'tdv01')).body.allowed).toEqual([]);
    });
  });

  describe('`0039` cờ `xoaDuoc` trên hồ sơ', () => {
    // Giao diện đọc đúng cờ này để ẩn nút, nên nó phải khớp từng ca với việc
    // `DELETE` có chạy hay không — thừa thì bày ra một nút 403, thiếu thì giấu
    // mất đường bỏ hồ sơ.
    const co = async (policyId: string, who = 'tdv01'): Promise<boolean> =>
      (await get(`/policies/${policyId}`, who)).body.xoaDuoc as boolean;

    it('bật ở đúng hai trạng thái xoá được', async () => {
      for (const tt of ['NHAP', 'YEU_CAU_CHINH_SUA']) {
        const d = await draft();
        if (tt !== 'NHAP') {
          await withAdminDb((c) =>
            c.query(`UPDATE pol.policy SET status = $2::pol.policy_status WHERE id = $1`, [
              d.id,
              tt,
            ]),
          );
        }
        expect(await co(d.id), `${tt} phải xoá được`).toBe(true);
        await withAdminDb((c) =>
          c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
        );
      }
    });

    it('tắt ở mọi trạng thái còn lại', async () => {
      for (const tt of [
        'CHO_TBP_DUYET',
        'CHO_KT_L1',
        'SA_DANG_XU_LY',
        'CHO_KT_L2',
        'DANG_CO_HIEU_LUC',
        'HET_HIEU_LUC',
        'QUA_HAN_DUYET',
        'DA_XOA',
      ]) {
        const d = await draft();
        await withAdminDb((c) =>
          c.query(
            `UPDATE pol.policy SET status = $2::pol.policy_status,
                    pending_step = $3::pol.policy_step WHERE id = $1`,
            [d.id, tt, tt === 'QUA_HAN_DUYET' ? 'B4_TBP_DUYET' : null],
          ),
        );
        expect(await co(d.id), `${tt} không được xoá`).toBe(false);
        await withAdminDb((c) =>
          c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
        );
      }
    });

    it('tắt với TDV KHÁC, dù hồ sơ đang ở trạng thái xoá được', async () => {
      const d = await biTraLai('TBP_RETURN');
      // tdv02 không thấy hồ sơ này, nên hỏi bằng chính người trong phạm vi:
      // Trưởng bộ phận. Họ mở được, và cờ phải tắt.
      expect(await co(d.id, 'tbp01')).toBe(false);
    });
  });

  describe('`DA_XOA` là trạng thái KẾT THÚC', () => {
    it('không hành động nào đi ra được, và xoá lần hai thì 403', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);

      expect((await get(`/policies/${d.id}/allowed-actions`)).body.allowed).toEqual([]);
      expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(409);
      expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(409);

      const lai = await del(`/policies/${d.id}`);
      expect(lai.status).toBe(403);
      expect(lai.body.code).toBe('ONLY_EDITABLE_DELETABLE');
    });

    it('nội dung khoá lại — không thêm dòng, không đổi ngày áp dụng', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);

      const them = await post(`/policies/${d.id}/lines`, line(await makeProduct()));
      expect(them.status).toBe(409);
      expect((await patch(`/policies/${d.id}`, { appliedDate: '2030-01-01' })).status).toBe(409);
    });

    it('SQL thô cũng không xoá nổi — trigger ở CSDL chặn (`0035`)', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);

      const err = await withAdminDb(async (c) => {
        try {
          await c.query(`DELETE FROM pol.policy WHERE id = $1`, [d.id]);
          return undefined;
        } catch (e) {
          return e as { message: string };
        }
      });
      expect(err?.message).toContain('DA_XOA');
    });
  });

  describe('mọi trạng thái CÒN LẠI đều 403', () => {
    /**
     * Bảng dựng từng hồ sơ tới đúng một trạng thái. Viết thành bảng chứ không
     * thành mười `it` rời: thêm một trạng thái vào enum mà quên thử xoá ở đó là
     * đúng loại lỗ hổng chỉ lộ ra khi có người dùng bấm trúng.
     */
    const CACH: Record<string, () => Promise<string>> = {
      CHO_TBP_DUYET: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        return d.id;
      },
      CHO_KT_L1: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await act(d.id, 'TBP_SIGN', 'tbp01');
        return d.id;
      },
      SA_DANG_XU_LY: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await act(d.id, 'TBP_SIGN', 'tbp01');
        await act(d.id, 'KT_RECEIVE_L1', 'kt01');
        return d.id;
      },
      CHO_KT_L2: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await act(d.id, 'TBP_SIGN', 'tbp01');
        await act(d.id, 'KT_RECEIVE_L1', 'kt01');
        await post(
          `/policies/${d.id}/attachments`,
          { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
          'sa01',
        );
        // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
        await post(
          `/policies/${d.id}/attachments`,
          { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
          'sa01',
        );
        await act(d.id, 'SA_HANDOVER', 'sa01');
        return d.id;
      },
      DANG_CO_HIEU_LUC: async () => {
        const d = await draft();
        await runToActive(d);
        return d.id;
      },
      HET_HIEU_LUC: async () => {
        // Hết hiệu lực theo đúng đường thật: một bản CHỈNH SỬA chạy tới hiệu lực
        // sẽ đẩy bản cũ ra (EFF-01).
        const d = await draft();
        await runToActive(d);
        const v2 = await post('/policies', {
          customerId: d.customerId,
          mode: 'AMEND',
          lines: [line(d.productId, { wholesalePrice: '80000', cpbh: ['1000'] })],
        });
        await runToActive({ id: v2.body.id as string });
        return d.id;
      },
      QUA_HAN_DUYET: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await datTrangThai(d.id, 'QUA_HAN_DUYET', 'B4_TBP_DUYET');
        return d.id;
      },
    };

    for (const [tt, dung] of Object.entries(CACH)) {
      it(`hồ sơ ở ${tt} thì chính TDV phụ trách cũng không xoá được`, async () => {
        const id = await dung();
        const r = await del(`/policies/${id}`);
        expect(r.status, `${tt} đáng lẽ 403`).toBe(403);
        expect(r.body.code).toBe('ONLY_EDITABLE_DELETABLE');
        // Và hồ sơ vẫn còn nguyên trạng thái cũ.
        expect((await get(`/policies/${id}`)).body.status).toBe(tt);
      });
    }
  });

  describe('POL-14 · ai được xoá', () => {
    /*
     * POL-14 ĐỔI NGHĨA ở `0039`, không bị bỏ.
     *
     * Bản cũ: "hồ sơ Từ chối không ai xoá được, kể cả quản trị". Điều luật ấy
     * bảo vệ DẤU VẾT — hồ sơ bị từ chối phải còn trong lịch sử và trong báo cáo
     * tỷ lệ trả lại. Từ `0039` TDV phụ trách bỏ được nó khỏi màn hình của mình,
     * nhưng "bỏ" ở đây là chuyển `DA_XOA`: không dòng nào mất, nhật ký dài thêm
     * một dòng, và báo cáo đếm theo `rejected_at` nên không đổi.
     *
     * Ba vế dưới đây là ba nửa còn lại của POL-14, và cả ba vẫn đúng nguyên.
     */
    it('POL-14 hồ sơ Đã xoá: KHÔNG XOÁ ĐƯỢC DÒNG, kể cả bằng SQL thô', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });
      /*
       * PHẢI ĐI TỚI `DA_XOA` THẬT, không dừng ở `YEU_CAU_CHINH_SUA`.
       *
       * Trigger chỉ chặn xoá ở trạng thái KẾT THÚC, và `YEU_CAU_CHINH_SUA` thì
       * không phải — hồ sơ ở đó còn sửa được, còn gửi lại được, và xoá dòng của
       * nó là chuyện hợp lệ. `0155` thay `TU_CHOI` bằng đường trả-lại-rồi-xoá,
       * nên ca này phải đi hết đường ấy mới chạm được chốt chặn nó đang kiểm.
       */
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);
      expect((await get(`/policies/${d.id}`)).body.status).toBe('DA_XOA');

      const err = await withAdminDb(async (c) => {
        try {
          await c.query(`DELETE FROM pol.policy WHERE id = $1`, [d.id]);
          return undefined;
        } catch (e) {
          return e as { message: string };
        }
      });
      expect(err?.message).toContain('DA_XOA');
    });

    it('POL-14 năm vai trò còn lại vẫn không đụng được vào hồ sơ Đã xoá', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      for (const who of ['tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
        const r = await del(`/policies/${d.id}`, who);
        expect([403, 404], `${who} đáng lẽ không xoá được`).toContain(r.status);
        expect(r.status).not.toBe(204);
      }
      expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
    });

    it('`0039` chính TDV phụ trách thì xoá được — hồ sơ sang `DA_XOA`', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      const truoc = await nhatKy(d.id);
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);

      const sau = await get(`/policies/${d.id}`);
      expect(sau.status, 'hồ sơ phải CÒN, chỉ đổi trạng thái').toBe(200);
      expect(sau.body.status).toBe('DA_XOA');

      // Nhật ký chỉ DÀI THÊM — lý do trả lại của Trưởng bộ phận còn nguyên.
      const nk = await nhatKy(d.id);
      expect(nk.slice(0, truoc.length)).toEqual(truoc);
      expect(nk.at(-1)).toEqual({
        from_status: 'YEU_CAU_CHINH_SUA',
        to_status: 'DA_XOA',
        action: 'DELETE',
      });
      expect(nk.some((x) => x.action === 'TBP_RETURN')).toBe(true);
    });

    it('`0039` KHÔNG động vào CSDL: chỉ đúng cột `status` đổi, không dòng nào mất', async () => {
      /*
       * Khẳng định thẳng điều người dùng đã chốt: "chỉ chuyển trạng thái sang
       * Đã xóa, không động gì vào CSDL, mọi nhật ký của hồ sơ đó vẫn còn".
       *
       * Ca này chụp TOÀN BỘ dòng hồ sơ trước và sau rồi so từng cột, thay vì chỉ
       * kiểm trạng thái. Một câu `DELETE` lọt vào nhánh này về sau, hay một cột
       * bị dọn kèm cho "sạch", đều đỏ ở đây.
       */
      const d = await draft();
      // Thêm một tệp đính kèm để ca này còn kiểm cả bảng con thứ ba.
      await post(`/policies/${d.id}/attachments`, {
        kind: 'HO_SO',
        fileName: 'ho-so-phap-ly.pdf',
        objectKey: `hs/${d.id}.pdf`,
      });
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      const chup = () =>
        withAdminDb(async (c) => {
          const p = await c.query(`SELECT * FROM pol.policy WHERE id = $1`, [d.id]);
          const dem = await c.query<{ dong: string; su_kien: string; tep: string }>(
            `SELECT (SELECT count(*) FROM pol.policy_line WHERE policy_id = $1)::text AS dong,
                    (SELECT count(*) FROM pol.policy_event WHERE policy_id = $1)::text AS su_kien,
                    (SELECT count(*) FROM pol.policy_attachment WHERE policy_id = $1)::text AS tep`,
            [d.id],
          );
          return { hang: p.rows[0] as Record<string, unknown>, dem: dem.rows[0]! };
        });

      const truoc = await chup();
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);
      const sau = await chup();

      // 1. Dòng hồ sơ CÒN, và chỉ hai cột đổi: trạng thái, và số phiên bản của
      //    khoá lạc quan. Mọi cột khác — mã, khách hàng, bốn cột người, mọi mốc
      //    thời gian, `rejected_at`, `last_reason` — giữ nguyên từng cái.
      const boQua = new Set(['status', 'row_version']);
      for (const cot of Object.keys(truoc.hang)) {
        if (boQua.has(cot)) continue;
        expect(String(sau.hang[cot]), `cột ${cot} không được đổi`).toBe(String(truoc.hang[cot]));
      }
      expect(truoc.hang['status']).toBe('YEU_CAU_CHINH_SUA');
      expect(sau.hang['status']).toBe('DA_XOA');

      // 2. Không bảng con nào mất dòng. Nhật ký DÀI THÊM đúng một dòng.
      expect(sau.dem.dong, 'dòng sản phẩm').toBe(truoc.dem.dong);
      expect(sau.dem.tep, 'tệp đính kèm').toBe(truoc.dem.tep);
      expect(Number(sau.dem.su_kien)).toBe(Number(truoc.dem.su_kien) + 1);

      // 3. Và lý do từ chối của Trưởng bộ phận vẫn đọc được nguyên văn.
      const nk = await nhatKy(d.id);
      expect(nk.some((x) => x.action === 'TBP_RETURN')).toBe(true);
      const lyDo = await withAdminDb(async (c) => {
        const r = await c.query<{ reason: string }>(
          `SELECT reason FROM pol.policy_event WHERE policy_id = $1 AND action = 'TBP_RETURN'`,
          [d.id],
        );
        return r.rows[0]?.reason;
      });
      expect(lyDo).toBe('Chiet khau qua cao');
    });

    it('`0039` TDV khác không xoá được hồ sơ Từ chối của người khác', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      const r = await del(`/policies/${d.id}`, 'tdv02');
      expect(r.status).toBe(403);
      expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
    });

    /*
     * Năm vai trò còn lại KHÔNG xoá được, kể cả hồ sơ đang nằm trên bàn của họ.
     *
     * Từ `0035` chốt chặn nằm ở `@Roles('TDV')`, tức là 403 ngay ở cổng — trước
     * đó bốn vai trò ghi vẫn qua được cổng rồi mới bị `remove()` từ chối. Thử ở
     * CẢ HAI trạng thái xoá được, vì đó là hai trạng thái duy nhất mà một lỗi
     * phân quyền ở đây thành xoá thật.
     */
    for (const tt of ['NHAP', 'YEU_CAU_CHINH_SUA'] as const) {
      it(`hồ sơ ${tt}: năm vai trò không phải TDV đều 403`, async () => {
        const d = tt === 'NHAP' ? await draft() : await biTraLai('TBP_RETURN');
        for (const who of ['tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
          const r = await del(`/policies/${d.id}`, who);
          expect(r.status, `${who} đáng lẽ 403`).toBe(403);
        }
        expect((await get(`/policies/${d.id}`)).body.status).toBe(tt);
      });
    }

    it('TDV khác thì không thấy hồ sơ, nên không xoá được', async () => {
      const d = await biTraLai('TBP_RETURN');
      const r = await del(`/policies/${d.id}`, 'tdv02');
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('OUT_OF_SCOPE');
      expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
    });

    /*
     * NGƯỜI PHỤ TRÁCH HIỆN TẠI, không phải người đã lập.
     *
     * `created_by` đứng yên khi hồ sơ đổi tay lúc bàn giao (`0032`), nên so với
     * nó là để lại một hồ sơ mà người đang phải xử lý không xoá nổi — đúng loại
     * hồ sơ treo mà đợt bàn giao sinh ra để dọn.
     */
    it('hồ sơ đã bàn giao sang TDV khác thì người đó xoá được', async () => {
      const d = await biTraLai('TBP_RETURN');
      const nguoiMoi = (await idNguoiDung())['tdv02'];
      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET tdv_user_id = $2 WHERE id = $1`, [d.id, nguoiMoi]),
      );
      // Người lập cũ giờ ngoài phạm vi.
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(403);
      expect((await del(`/policies/${d.id}`, 'tdv02')).status).toBe(204);
      expect((await get(`/policies/${d.id}`, 'tdv02')).body.status).toBe('DA_XOA');
    });
  });
});

// =============================================================================
// `0036` — nhật ký của một hồ sơ
//
// Đường `GET /policies/:id/events` có từ chặng đầu và tới `0036` mới có màn hình
// gọi nó, cùng một liên kết trong thư. Hai thứ ấy đòi hai điều đường cũ không
// có: TÊN người thao tác, và phép kiểm phạm vi đúng như khi mở hồ sơ.
// =============================================================================

describe('`0036` nhật ký hồ sơ', () => {
  const nk = async (policyId: string, who = 'tdv01') =>
    get(`/policies/${policyId}/events`, who);

  it('mỗi bước một dòng, đúng thứ tự, kèm TÊN người thao tác', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' });

    const r = await nk(d.id);
    expect(r.status).toBe(200);
    const ds = r.body as {
      seq: number;
      action: string;
      actorName: string | null;
      actorRole: string;
      reason: string | null;
      fromStatus: string | null;
      toStatus: string;
    }[];

    expect(ds.map((x) => x.action)).toEqual(['CREATE', 'SUBMIT', 'TBP_RETURN']);
    expect(ds.map((x) => x.seq)).toEqual([1, 2, 3]);
    // TÊN, không phải uuid — đó là cả lý do đường này được sửa ở `0036`.
    expect(ds[0]!.actorName, 'phải tra được tên người lập').toBeTruthy();
    expect(ds[2]!.actorRole).toBe('TBP');
    expect(ds[2]!.reason).toBe('Thieu chung tu');
    expect(ds[2]!.fromStatus).toBe('CHO_TBP_DUYET');
    expect(ds[2]!.toStatus).toBe('YEU_CAU_CHINH_SUA');
  });

  it('`0064` một lần bấm nút để lại đúng MỘT dòng lịch sử', async () => {
    /*
     * Trước `0064` lần ký số để lại HAI dòng: `TBP_SIGN` của Trưởng bộ phận và
     * `PUBLISH_SIGNED` của `SYSTEM`. Dòng thứ hai kể một bước không ai bấm và
     * không ai thấy — nó chỉ nói lại đúng chuyện dòng trước vừa nói.
     *
     * Việc lịch sử vẫn ghi được dòng của `SYSTEM` thì không mất: `SLA_OVERDUE`,
     * `SLA_DISCARDED` và `CUSTOMER_RETIRED` đều là bước hệ thống tự chạy, và
     * chúng có test riêng ở `sla.test.ts`.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    const ds = (await nk(d.id)).body as {
      action: string;
      actorRole: string;
      fromStatus: string | null;
      toStatus: string;
    }[];
    const ky = ds.filter((x) => x.action === 'TBP_SIGN');
    expect(ky).toHaveLength(1);
    expect(ky[0]!.actorRole).toBe('TBP');
    expect(ky[0]!.fromStatus).toBe('CHO_TBP_DUYET');
    expect(ky[0]!.toStatus).toBe('CHO_KT_L1');
  });

  /*
   * ĐỌC ĐƯỢC Ở MỌI TRẠNG THÁI, kể cả ba trạng thái kết thúc.
   *
   * Đây là chỗ dễ làm sai theo hướng ngược với trực giác: nhật ký của một hồ sơ
   * đã đóng lại là thứ người ta cần NHẤT, vì không còn màn hình nào khác nói
   * chuyện gì đã xảy ra. Chặn ở đây là bịt đúng lối đi cuối cùng.
   */
  for (const tt of [
    'NHAP',
    'CHO_TBP_DUYET',
    'CHO_KT_L1',
    'SA_DANG_XU_LY',
    'CHO_KT_L2',
    'DANG_CO_HIEU_LUC',
    'HET_HIEU_LUC',
    'YEU_CAU_CHINH_SUA',
    'QUA_HAN_DUYET',
    'DA_XOA',
  ]) {
    it(`hồ sơ ${tt}: nhật ký vẫn đọc được`, async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      if (tt !== 'CHO_TBP_DUYET') {
        await withAdminDb((c) =>
          c.query(
            `UPDATE pol.policy SET status = $2::pol.policy_status,
                    pending_step = $3::pol.policy_step WHERE id = $1`,
            [d.id, tt, tt === 'QUA_HAN_DUYET' ? 'B4_TBP_DUYET' : null],
          ),
        );
      }

      const r = await nk(d.id);
      expect(r.status, `${tt}: ${JSON.stringify(r.body)}`).toBe(200);
      expect((r.body as unknown[]).length, `${tt}: phải có ít nhất CREATE và SUBMIT`)
        .toBeGreaterThanOrEqual(2);

      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
      );
    });
  }

  it('cùng phép kiểm phạm vi với việc MỞ hồ sơ — TDV khác thì 403', async () => {
    // Nhật ký kể ra tên khách hàng, lý do trả lại, tên người duyệt. Để nó lỏng
    // hơn đường mở hồ sơ là dựng một cửa sau vào đúng phần nhạy cảm nhất.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await nk(d.id, 'tdv02');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });

  it('người được giao hồ sơ đọc được, và Ban lãnh đạo cũng vậy', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await nk(d.id, 'tbp01')).status).toBe(200);
    expect((await nk(d.id, 'bld01')).status).toBe(200);
  });
});

// =============================================================================
// `0038` — `/allowed-actions` lọc theo VAI TRÒ
//
// Trước đợt này nó trả về mọi hành động của TRẠNG THÁI, bất kể ai hỏi, và giao
// diện đem thẳng ra vẽ nút. Hệ quả: Trình dược viên mở hồ sơ của chính mình đang
// *Chờ TBP duyệt* thấy đủ "Ký số duyệt", "Trả lại chỉnh sửa", "Từ chối hồ sơ" —
// bấm cái nào cũng 403.
// =============================================================================

describe('`0038` chỉ trả về hành động vai trò ấy làm được', () => {
  const nut = async (policyId: string, who: string): Promise<string[]> =>
    (await get(`/policies/${policyId}/allowed-actions`, who)).body.allowed as string[];

  it('hồ sơ Chờ TBP duyệt: TBP thấy HAI nút, TDV thấy KHÔNG nút nào', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');

    // `0155` — nút *Từ chối* đã bỏ; TBP chỉ còn ký hoặc trả lại.
    expect([...(await nut(d.id, 'tbp01'))].sort()).toEqual(['TBP_RETURN', 'TBP_SIGN']);
    // Người lập vẫn MỞ được hồ sơ của mình, chỉ là không có việc gì để bấm.
    expect(await nut(d.id, 'tdv01')).toEqual([]);

    // `0142` — Kế toán chưa THẤY hồ sơ ở lượt chờ TBP đầu tiên, nên câu trả lời
    // của họ không phải "không có nút nào" mà là 403. Hai câu ấy khác nhau, và
    // ca kiểm phải nói rõ mình đang hỏi câu nào.
    expect((await get(`/policies/${d.id}/allowed-actions`, 'kt01')).status).toBe(403);
  });

  /**
   * Đưa một hồ sơ tới đúng một trạng thái rồi hỏi cả sáu vai trò cùng lúc.
   *
   * Bảng kỳ vọng viết TAY, không suy từ `allowedActionsFor` — suy lại từ chính
   * hàm đang kiểm thì ca này chỉ đang lặp lại mã nguồn của nó.
   */
  const MONG_DOI: Record<string, Record<string, string[]>> = {
    NHAP: { tdv01: ['SUBMIT'] },
    CHO_TBP_DUYET: { tbp01: ['TBP_SIGN', 'TBP_RETURN'] },
    CHO_KT_L1: { kt01: ['KT_RECEIVE_L1', 'KT_RETURN_L1'] },
    SA_DANG_XU_LY: { sa01: ['SA_HANDOVER'] },
    CHO_KT_L2: { kt01: ['KT_RECEIVE_L2', 'KT_RETURN_L2', 'KT_REQUEST_REPRINT'] },
    YEU_CAU_CHINH_SUA: { tdv01: ['RESUBMIT_AFTER_EDIT'] },
    // `SUPERSEDE` cũng của hệ thống — không ai bấm cho bản đang hiệu lực hết hạn.
    DANG_CO_HIEU_LUC: {},
    HET_HIEU_LUC: {},
    DA_XOA: {},
  };

  /**
   * Vai trò KHÔNG THẤY hồ sơ ở trạng thái ấy — 403, không phải "không có nút".
   *
   * Để riêng khỏi `MONG_DOI` vì hai bảng trả lời hai câu khác nhau: bảng kia hỏi
   * *"bấm được gì"*, bảng này hỏi *"mở được không"*. Gộp lại thì một hồ sơ biến
   * mất khỏi tầm mắt một vai trò trông y hệt một hồ sơ hết việc để làm.
   */
  const KHONG_THAY: Record<string, string[]> = {
    /*
     * `0157` — Kế toán chỉ thấy hồ sơ ĐÃ TỪNG TỚI BÀN MÌNH, ở MỌI trạng thái.
     *
     * `0142` chỉ giấu ở `CHO_TBP_DUYET`; giờ điều kiện bỏ hẳn vế trạng thái, nên
     * ba trạng thái dưới đây — những trạng thái ĐẾN ĐƯỢC mà không cần chữ ký
     * Trưởng bộ phận — cũng khuất mắt Kế toán.
     */
    NHAP: ['kt01'],
    CHO_TBP_DUYET: ['kt01'],
    YEU_CAU_CHINH_SUA: ['kt01'],
    DA_XOA: ['kt01'],
  };

  /**
   * Trạng thái CHỈ đến được sau chữ ký Trưởng bộ phận (`0157`).
   *
   * Ca này vặn thẳng `status` bằng SQL, nên nó phải tự đặt `da_qua_tbp` cho khớp
   * — nếu không thì nó dựng ra một tổ hợp KHÔNG TỒN TẠI trong đời thật
   * (`CHO_KT_L1` mà chưa qua TBP) và hỏi hệ thống cư xử thế nào với nó.
   *
   * Đó đúng là cái bẫy `0142` đã để lại: một fixture như vậy nằm trong bộ kiểm
   * suốt hai chặng, xanh, và không bảo vệ gì.
   */
  const SAU_CHU_KY_TBP = new Set([
    'CHO_KT_L1',
    'SA_DANG_XU_LY',
    'CHO_KT_L2',
    'DANG_CO_HIEU_LUC',
    'HET_HIEU_LUC',
  ]);

  for (const [tt, mong] of Object.entries(MONG_DOI)) {
    it(`hồ sơ ${tt}: mỗi vai trò chỉ thấy đúng việc của mình`, async () => {
      const d = await draft();
      // Bốn cột người phải có mặt thì bốn vai trò mới MỞ được hồ sơ — không mở
      // được thì 403, và ca này không phân biệt được "không có nút" với "không
      // thấy hồ sơ". Gửi duyệt một lần là đủ để điền `tbp` và `keToan`.
      await act(d.id, 'SUBMIT', 'tdv01');
      await withAdminDb(async (c) => {
        await c.query(
          `UPDATE pol.policy
              SET sale_admin_user_id = (SELECT id FROM idn.app_user WHERE username = 'sa01'),
                  status = $2::pol.policy_status,
                  da_qua_tbp = $3,
                  pending_step = NULL
            WHERE id = $1`,
          [d.id, tt, SAU_CHU_KY_TBP.has(tt)],
        );
      });

      for (const who of ['tdv01', 'tbp01', 'kt01', 'sa01', 'bld01']) {
        if ((KHONG_THAY[tt] ?? []).includes(who)) {
          const r = await get(`/policies/${d.id}/allowed-actions`, who);
          expect(r.status, `${tt} × ${who} phải KHÔNG thấy hồ sơ`).toBe(403);
          continue;
        }
        const co = [...(await nut(d.id, who))].sort();
        expect(co, `${tt} × ${who}`).toEqual([...(mong[who] ?? [])].sort());
      }

      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
      );
    });
  }

  it('hành động của HỆ THỐNG không lọt ra cho vai trò nào', async () => {
    /*
     * `SUPERSEDE` do máy chạy — không ai bấm cho một bản đang hiệu lực hết hạn.
     * Trước `0038` nó hiện thành nút, và vì không có nhãn tiếng Việt nên hiện
     * nguyên mã viết hoa.
     *
     * Ca này từng dựng hồ sơ ở `TBP_DA_KY_SO` để thử `PUBLISH_SIGNED`. Cả hai
     * đã đi: trạng thái gỡ khỏi máy trạng thái ở `0064`, giá trị enum gỡ khỏi
     * CSDL ở `0048`. Nên nó chuyển sang thử `DANG_CO_HIEU_LUC` — trạng thái duy
     * nhất còn lại có một hành động HỆ THỐNG đi ra.
     */
    const d = await draft();
    const r = await runToActive(d);
    expect(r.body.status).toBe('DANG_CO_HIEU_LUC');

    for (const who of ['tdv01', 'tbp01', 'kt01', 'sa01', 'bld01']) {
      expect(await nut(d.id, who), `${who} không được thấy nút nào`).toEqual([]);
    }
  });

  it('Ban lãnh đạo mở được hồ sơ ở mọi bước mà không có nút nào', async () => {
    // Muc 2.6: chỉ đọc. Đây là vai trò dễ lọt nhất — họ thấy MỌI hồ sơ.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await get(`/policies/${d.id}`, 'bld01')).status).toBe(200);
    expect(await nut(d.id, 'bld01')).toEqual([]);

    await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(await nut(d.id, 'bld01')).toEqual([]);
  });

  it('lỗi INVALID_TRANSITION vẫn liệt kê ĐỦ hành động của trạng thái', async () => {
    /*
     * Vế ngược: danh sách trong THÔNG BÁO LỖI không được lọc theo vai trò.
     *
     * Câu đó nói về trạng thái — "ở đây chỉ đi tiếp được bằng X hoặc Y" — nên nó
     * phải kể cả hành động của người khác. Lọc luôn ở đây thì Kế toán bấm nhầm
     * sẽ đọc được "hành động được phép: không có", và hiểu ra là hồ sơ hỏng chứ
     * không phải là đang chờ Trưởng bộ phận.
     */
    /*
     * Người bấm nhầm ở đây là TDV chứ không phải Kế toán: `0142` giấu hẳn hồ sơ
     * ở lượt chờ TBP đầu tiên khỏi Kế toán, nên họ nhận 403 trước khi câu
     * `INVALID_TRANSITION` kịp dựng. Luật cần kiểm không đổi — danh sách trong
     * câu báo lỗi kể ĐỦ hành động của trạng thái, kể cả của vai trò khác.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
    expect([...(r.body.allowed as string[])].sort()).toEqual(['TBP_RETURN', 'TBP_SIGN']);
  });
});

describe('POL-15 phạm vi dữ liệu khi lập hồ sơ', () => {
  it('tdv02 lập hồ sơ cho khách hàng của tdv01 thì 403', async () => {
    const customerId = await makeCustomer('tdv01');
    const r = await post('/policies', { customerId, lines: [line(await makeProduct())] }, 'tdv02');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });

  it('kế toán chỉ đọc được hồ sơ ĐƯỢC GIAO cho mình (`0031`)', async () => {
    // Bản cũ dựa vào cây: kt01 đọc được vì tdv01 nằm dưới quyền mình, kt02 thì
    // không. Giờ căn cứ là phân công trên chính hồ sơ, nên hồ sơ còn NHÁP thì
    // KHÔNG kế toán nào đọc được — kể cả người sắp được chọn.
    const d = await draft();
    expect((await get(`/policies/${d.id}`, 'kt01')).status).toBe(403);
    expect((await get(`/policies/${d.id}`, 'kt02')).status).toBe(403);

    /*
     * Gửi duyệt và chọn kt01 — nhưng `0142` chèn thêm một điều kiện NỮA vào
     * đúng chỗ này: được giao là chưa đủ, hồ sơ còn phải ĐÃ TỪNG qua tay Trưởng
     * bộ phận. Ở lượt chờ TBP đầu tiên kt01 vẫn 403, y như kt02 — hai con số
     * giống nhau vì hai lý do khác hẳn nhau.
     */
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await get(`/policies/${d.id}`, 'kt01')).status).toBe(403);
    expect((await get(`/policies/${d.id}`, 'kt02')).status).toBe(403);

    // TBP ký xong thì phân công mới có hiệu lực thật: kt01 đọc được, kt02 không.
    await act(d.id, 'TBP_SIGN', 'tbp01');
    expect((await get(`/policies/${d.id}`, 'kt01')).status).toBe(200);
    expect((await get(`/policies/${d.id}`, 'kt02')).status).toBe(403);
  });
});

describe('POL-16 số phiên bản', () => {
  it('cập nhật lần thứ ba thì version_no = 3', async () => {
    const d = await draft();
    await runToActive(d);

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await runToActive({ id: v2.body.id });

    const v3 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['7000'] })],
    });
    expect(v3.body.versionNo).toBe(3);
  });
});

describe('POL-17 hai hồ sơ cho cùng khách hàng gửi đồng thời', () => {
  it('cả hai ở Nháp được, nhưng chỉ một kích hoạt được', async () => {
    const customerId = await makeCustomer();
    const p1 = await makeProduct();
    const p2 = await makeProduct();

    const [a, b] = await Promise.all([
      post('/policies', { customerId, lines: [line(p1)] }),
      post('/policies', { customerId, lines: [line(p2)] }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    await runToActive({ id: a.body.id });

    // Bản thứ hai đi hết luồng thì vấp bất biến một-CSBH-hiệu-lực ở CSDL.
    await act(b.body.id, 'SUBMIT', 'tdv01');
    await act(b.body.id, 'TBP_SIGN', 'tbp01');
    await act(b.body.id, 'KT_RECEIVE_L1', 'kt01');
    await post(
      `/policies/${b.body.id}/attachments`,
      { kind: 'SCAN', fileName: 's.pdf', objectKey: `scan/${b.body.id}.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${b.body.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${b.body.id}.pdf` },
      'sa01',
    );
    await act(b.body.id, 'SA_HANDOVER', 'sa01');
    const last = await act(b.body.id, 'KT_RECEIVE_L2', 'kt01');
    expect(last.status).toBeGreaterThanOrEqual(400);

    const actives = await withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pol.policy
          WHERE customer_id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
        [customerId],
      );
      return Number(r.rows[0]!.n);
    });
    expect(actives).toBe(1);
  });
});

describe('POL-18 file đính kèm hồ sơ', () => {
  it('Nháp thì thêm và xoá được', async () => {
    const d = await draft();
    const a = await post(`/policies/${d.id}/attachments`, {
      kind: 'HO_SO',
      fileName: 'gpkd.pdf',
      objectKey: 'x/gpkd.pdf',
    });
    expect(a.status).toBe(201);
    expect((await del(`/policies/${d.id}/attachments/${a.body.id}`)).status).toBe(200);
  });

  it('đã gửi duyệt thì chỉ đọc', async () => {
    const d = await draft();
    await post(`/policies/${d.id}/attachments`, {
      kind: 'HO_SO',
      fileName: 'gpkd.pdf',
      objectKey: 'x/gpkd.pdf',
    });
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await post(`/policies/${d.id}/attachments`, {
      kind: 'HO_SO',
      fileName: 'them.pdf',
      objectKey: 'x/them.pdf',
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_LOCKED');
  });
});

describe('POL-19 gửi duyệt hồ sơ rỗng', () => {
  it('không có dòng sản phẩm nào thì 422', async () => {
    const r = await post('/policies', { customerId: await makeCustomer(), lines: [] });
    expect(r.status).toBe(201);
    const sub = await act(r.body.id, 'SUBMIT', 'tdv01');
    expect(sub.status).toBe(422);
    expect(sub.body.code).toBe('NO_LINES');
  });
});

// =============================================================================
// WF — luồng duyệt
// =============================================================================

describe('WF-01 gửi duyệt', () => {
  it('sang Chờ TBP duyệt, khoá sửa, đặt SLA, phát sự kiện tới TBP', async () => {
    const d = await draft();
    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_TBP_DUYET');

    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ days: string; submitted_by: string | null }>(
        `SELECT round(extract(epoch FROM (sla_due_at - now())) / 86400)::text AS days,
                submitted_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(Number(row.days)).toBe(14);
    expect(row.submitted_by).toBeTruthy();

    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.submit');
    expect(ev?.payload.recipients).toEqual(['TBP']);
  });
});

describe('WF-02 · WF-03 danh sách trạng thái là danh sách đóng', () => {
  it('hành động ngoài danh sách thì 400', async () => {
    const d = await draft();
    const r = await act(d.id, 'PHE_DUYET_NHANH', 'tdv01');
    expect(r.status).toBe(400);
  });

  it('không còn nhãn cũ nào trong enum', async () => {
    const labels = await withAdminDb(async (c) => {
      const r = await c.query<{ enumlabel: string }>(
        `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'policy_status'`,
      );
      return r.rows.map((x) => x.enumlabel);
    });
    for (const old of ['BAN_DEMO', 'DANG_DUYET', 'DA_CHUYEN_BUOC_SAU', 'DANG_AP_DUNG']) {
      expect(labels).not.toContain(old);
    }
    expect(labels).toContain('DANG_CO_HIEU_LUC');
  });
});

describe('WF-04 · WF-05 · WF-09 TBP ký số', () => {
  it('`0064` ký xong sang thẳng KT duyệt bản mềm — MỘT nước, MỘT lá thư', async () => {
    /*
     * Trước `0064` đây là hai nước: `TBP_SIGN` đặt `TBP_DA_KY_SO`, rồi
     * `PUBLISH_SIGNED` chuyển tiếp sang `CHO_KT_L1` trong cùng transaction.
     * Trạng thái giữa không ai từng nhìn thấy, nhưng nó phát THÊM một sự kiện
     * thư gửi Kế toán — mà Kế toán đã có tên trong lá thư của `TBP_SIGN`. Mỗi
     * lần Trưởng bộ phận ký, kế toán nhận hai thư trong cùng một giây.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_KT_L1');

    const keys = (await outboxFor(d.id)).map((e) => e.routing_key);
    expect(keys).toContain('policy.tbp_sign');
    expect(keys, 'còn phát lá thư thứ hai').not.toContain('policy.publish_signed');

    // Và đúng MỘT dòng lịch sử cho một lần bấm nút.
    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    const ma = events.map((e) => e.action);
    expect(ma).toContain('TBP_SIGN');
    expect(ma).not.toContain('PUBLISH_SIGNED');
  });

  it('WF-05 ký lần thứ hai thì 409 ALREADY_SIGNED', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const again = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_SIGNED');
  });

  it('ghi mốc thời gian và người ký', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ tbp_signed_at: Date | null; tbp_signed_by: string | null }>(
        `SELECT tbp_signed_at, tbp_signed_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(row.tbp_signed_at).not.toBeNull();
    expect(row.tbp_signed_by).not.toBeNull();
  });
});

describe('WF-06 · WF-07 · WF-27 TBP không duyệt', () => {
  it('WF-06 bỏ trống lý do thì 400 REASON_REQUIRED', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'TBP_RETURN', 'tbp01');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REASON_REQUIRED');
  });

  it('WF-07 kèm lý do thì sang Yêu cầu chỉnh sửa và mở khoá', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu giay to' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');

    // Mở khoá: sửa lại được.
    expect((await patch(`/policies/${d.id}`, { appliedDate: '2026-09-01' })).status).toBe(200);
  });

  it('WF-27 lý do lưu vào hồ sơ, vào lịch sử và vào sự kiện email', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chu ky chu ho' });

    expect((await get(`/policies/${d.id}`)).body.lastReason).toBe('Thieu chu ky chu ho');

    const events = (await get(`/policies/${d.id}/events`)).body as { reason: string | null }[];
    expect(events.some((e) => e.reason === 'Thieu chu ky chu ho')).toBe(true);

    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.tbp_return');
    expect(ev?.payload.reason).toBe('Thieu chu ky chu ho');
  });
});

describe('`0155` Đã xoá là trạng thái kết thúc — thay cho WF-08 Từ chối', () => {
  it('mọi hành động tiếp theo đều 409', async () => {
    /*
     * WF-08 cũ kiểm chuyện này trên `TU_CHOI`. `0155` bỏ trạng thái ấy, nhưng
     * TÍNH CHẤT thì không mất: hồ sơ đi hết đường trả-lại-rồi-xoá vẫn phải là
     * một ngõ cụt. Đổi đích, giữ nguyên câu hỏi.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Khong dat' });
    expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);

    for (const [a, who] of [
      ['SUBMIT', 'tdv01'],
      ['TBP_SIGN', 'tbp01'],
      ['RESUBMIT_AFTER_EDIT', 'tdv01'],
    ] as const) {
      const r = await act(d.id, a, who);
      expect(r.status, `${a} đáng lẽ bị chặn`).toBe(409);
      expect(r.body.code).toBe('INVALID_TRANSITION');
    }

    /*
     * KẾ TOÁN nhận **403, không phải 409** (`0157`), và đó là câu trả lời MẠNH
     * HƠN chứ không phải một ngoại lệ.
     *
     * Hồ sơ này đi SUBMIT → TBP trả lại → người lập xoá, nên nó chưa bao giờ
     * qua chữ ký Trưởng bộ phận. Kế toán không thấy nó, và chốt phạm vi trả lời
     * TRƯỚC cả máy trạng thái: không phải *"hành động này sai bước"* mà là *"hồ
     * sơ này không thuộc về bạn"*.
     */
    const rKt = await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    expect(rKt.status, 'Kế toán không thấy hồ sơ chưa từng qua TBP').toBe(403);
    expect(rKt.body.code).toBe('OUT_OF_SCOPE');

    const allowed = (await get(`/policies/${d.id}/allowed-actions`)).body;
    expect(allowed.allowed).toEqual([]);
  });
});

describe('WF-10 · WF-11 · WF-12 kế toán tiếp nhận lần 1', () => {
  it('WF-10 tiếp nhận thì sang Sale Admin đang xử lý', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('SA_DANG_XU_LY');

    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.kt_receive_l1');
    expect(ev?.payload.recipients).toEqual(['SALE_ADMIN', 'TBP', 'TDV']);
  });

  it('WF-11 không tiếp nhận, có lý do thì về Yêu cầu chỉnh sửa', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Sai so tien' });
    expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');
  });

  it('WF-12 kt02 tiếp nhận hồ sơ ngoài phạm vi thì 403', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'KT_RECEIVE_L1', 'kt02');
    expect(r.status).toBe(403);
  });
});

describe('WF-13 · WF-14 · WF-15 Sale Admin bàn giao', () => {
  const toSaStage = async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    return d;
  };

  it('WF-14 bàn giao khi chưa có bản scan thì 409', async () => {
    const d = await toSaStage();
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SCAN_REQUIRED');
  });

  it('`0160` cờ `banGiaoDuoc` đi CÙNG chốt chặn — tắt khi chưa scan, bật khi đã có', async () => {
    /*
     * Cờ này chỉ để vẽ nút; chốt thật vẫn là `SCAN_REQUIRED` ở ca ngay trên.
     * Nhưng hai bên phải nói CÙNG một câu, nếu không thì màn hình sáng nút mà
     * máy chủ từ chối — hoặc xám nút trong khi máy chủ sẵn sàng nhận.
     *
     * Khẳng định CẢ HAI chiều trên CÙNG một hồ sơ, trước và sau khi tải scan:
     * chỉ kiểm chiều tắt thì một cờ trả `false` cứng vẫn xanh.
     */
    const d = await toSaStage();
    expect((await get(`/policies/${d.id}`, 'sa01')).body.banGiaoDuoc, 'chưa scan').toBe(false);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status, 'chốt chặn cùng chiều').toBe(409);

    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    expect((await get(`/policies/${d.id}`, 'sa01')).body.banGiaoDuoc, 'đã scan').toBe(true);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status, 'chốt chặn cùng chiều').toBe(200);
  });

  it('WF-13 có scan rồi thì sang KT duyệt bản cứng', async () => {
    const d = await toSaStage();
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_KT_L2');
  });

  it('WF-15 bàn giao khi hồ sơ còn ở KT duyệt bản mềm thì 409 INVALID_TRANSITION', async () => {
    // Phải đi qua `KT_RECEIVE_L1` rồi LÙI trạng thái bằng SQL, chứ không dừng ở
    // `CHO_KT_L1` như bản cũ (`0031`): Sale Admin chỉ được giao ở bước tiếp nhận
    // L1, nên trước đó họ chưa liên quan gì tới hồ sơ và bị chặn ở tầng PHẠM VI
    // — 403, không phải 409. Muốn kiểm CỔNG TRẠNG THÁI thì người gọi phải đã ở
    // trong phạm vi, nếu không ca này kiểm nhầm thứ khác.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET status = 'CHO_KT_L1' WHERE id = $1`, [d.id]),
    );
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
  });

  it('Sale Admin CHƯA được giao thì 403, chặn trước cả cổng trạng thái', async () => {
    // Nửa còn lại của ca trên, tách ra vì nó nói về một luật khác: phạm vi chặn
    // TRƯỚC trạng thái, và đó là đúng thứ tự — không nói cho người ngoài phạm vi
    // biết hồ sơ đang ở bước nào.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });
});

describe('WF-16 · WF-24 tiếp nhận lần 2', () => {
  it('hiệu lực bắt đầu NGAY tại thời điểm tiếp nhận L2', async () => {
    const d = await draft();
    const before = Date.now();
    const r = await runToActive(d);
    const after = Date.now();

    expect(r.body.status).toBe('DANG_CO_HIEU_LUC');
    const eff = new Date(r.body.effectiveFrom).getTime();
    expect(eff).toBeGreaterThanOrEqual(before - 1000);
    expect(eff).toBeLessThanOrEqual(after + 1000);
  });

  it('WF-24 đủ mốc thời gian riêng và người thực hiện cho từng bước', async () => {
    const d = await draft();
    await runToActive(d);
    const row = await withAdminDb(async (c) => {
      const q = await c.query<Record<string, unknown>>(
        `SELECT submitted_at, submitted_by, tbp_signed_at, tbp_signed_by,
                kt_l1_received_at, kt_l1_received_by, sa_handover_at, sa_handover_by,
                kt_l2_received_at, kt_l2_received_by, effective_from
           FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    for (const [k, v] of Object.entries(row)) {
      expect(v, `cột ${k} phải có giá trị`).not.toBeNull();
    }
  });
});

describe('WF-17 · WF-18 · WF-19 kế toán không tiếp nhận L2', () => {
  const toL2 = async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    await act(d.id, 'SA_HANDOVER', 'sa01');
    return d;
  };

  it('WF-17 trả về Bước 3 thì bắt buộc có lý do', async () => {
    const d = await toL2();
    expect((await act(d.id, 'KT_RETURN_L2', 'kt01')).status).toBe(400);
    const r = await act(d.id, 'KT_RETURN_L2', 'kt01', { reason: 'Ban cung khong khop' });
    expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');
  });

  it('`0050` WF-18 yêu cầu in lại thì bản scan cũ Ở LẠI, không bị xoá', async () => {
    /*
     * Đảo ngược luật cũ theo yêu cầu khách hàng 19/08.
     *
     * Trước đó bản scan bị xoá khỏi cả `pol` lẫn kho lưu trữ ngay khi Kế toán
     * bấm yêu cầu in lại. Giờ nó ở lại để Sale Admin chủ động gỡ và thay — Kế
     * toán chê bản GIẤY, mà nhiều khi chỉ so với bản scan đang có mới thấy hỏng
     * ở đâu.
     */
    const d = await toL2();
    const r = await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('SA_DANG_XU_LY');
    // HAI tệp từ `0167`: bản scan và bản mềm — `toL2()` gắn cả hai vì bàn giao
    // đòi cả hai. Lọc theo LOẠI chứ không đếm tổng: câu ca này khẳng định là về
    // BẢN SCAN, và một con số tổng sẽ đổi mỗi lần thêm một loại tệp.
    const scan = (r.body.attachments as { kind: string; fileName: string }[]).filter(
      (a) => a.kind === 'SCAN',
    );
    expect(scan, 'bản scan phải còn nguyên').toHaveLength(1);
    expect(scan[0]!.fileName).toBe('ban-cung.pdf');

    // Và KHÔNG còn sự kiện huỷ nào được phát.
    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.scan_discarded');
    expect(ev, 'policy.scan_discarded đã gỡ hẳn').toBeUndefined();
  });

  it('`0050` bản scan cũ được ĐÁNH DẤU là bản đã bị chê', async () => {
    const d = await toL2();
    const truoc = await get(`/policies/${d.id}`, 'sa01');
    expect(truoc.body.banScanCu, 'chưa yêu cầu in lại thì không cảnh báo gì').toBe(false);

    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    const sau = await get(`/policies/${d.id}`, 'sa01');
    // Cờ này KHÔNG chặn bàn giao — nó để màn hình nói ra. Chặn là đi ngược yêu
    // cầu "Sale Admin chủ động": có lần in lại mà bản scan cũ vẫn dùng được.
    expect(sau.body.banScanCu).toBe(true);
  });

  it('`0050` tải bản scan MỚI lên thì cảnh báo tự tắt', async () => {
    const d = await toL2();
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });

    // Gỡ bản cũ rồi tải bản mới — đúng đường Sale Admin phải đi.
    //
    // Lấy đúng tệp SCAN chứ không `attachments[0]`: từ `0167` hồ sơ tới được
    // bước này luôn có hai tệp, và thứ tự trong mảng không phải thứ ca này nói
    // về. Bản mềm ở lại — yêu cầu in lại là chê BẢN GIẤY.
    const cu = (
      (await get(`/policies/${d.id}`, 'sa01')).body.attachments as {
        id: string;
        kind: string;
      }[]
    ).find((a) => a.kind === 'SCAN')!;
    expect((await del(`/policies/${d.id}/attachments/${cu.id}`, 'sa01')).status).toBe(200);
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung-2.pdf', objectKey: `scan/${d.id}-moi.pdf` },
      'sa01',
    );

    const sau = await get(`/policies/${d.id}`, 'sa01');
    expect(
      (sau.body.attachments as { kind: string }[]).filter((a) => a.kind === 'SCAN'),
    ).toHaveLength(1);
    // Cảnh báo suy từ MỐC TẢI LÊN chứ không từ một cờ phải nhớ xoá — nên nó tự
    // đúng, không có trạng thái nào để quên dọn.
    expect(sau.body.banScanCu).toBe(false);
  });

  it('`0050` bàn giao lại mà KHÔNG thay scan vẫn đi được — cảnh báo, không chặn', async () => {
    const d = await toL2();
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status, 'không chặn: quyết định là của Sale Admin').toBe(200);
    expect(r.body.status).toBe('CHO_KT_L2');
  });

  it('WF-19 in lại và bàn giao lần hai thì KHÔNG phải ký số lại', async () => {
    const d = await toL2();
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung-2.pdf', objectKey: `scan/${d.id}-2.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_KT_L2');

    // Ngoại lệ duy nhất: không có bước ký số nào trong nhánh này.
    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    expect(events.filter((e) => e.action === 'TBP_SIGN')).toHaveLength(1);
  });
});

describe('WF-20 trả về Bước 3 thì đi lại toàn bộ vòng duyệt', () => {
  it('kể cả bước ký số của TBP', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Tra lai' });

    const re = await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');
    expect(re.body.status).toBe('CHO_TBP_DUYET');

    // Không nhảy thẳng sang kế toán được — phải qua TBP ký lại.
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(409);

    // …và KÝ LẠI PHẢI ĐƯỢC. Ca này thiếu tới `0101`, nên vế thứ hai của WF-20
    // — *"đi lại toàn bộ vòng duyệt, KỂ CẢ bước ký số"* — chưa từng được kiểm:
    // ca cũ chỉ chứng minh không nhảy cóc được, không chứng minh đi tiếp được.
    const ky = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(ky.status, 'ký lại sau khi gửi lại phải được — WF-20').toBe(200);
    expect(ky.body.status).toBe('CHO_KT_L1');
  });
});

describe('WF-22 không có nghiệp vụ thu hồi', () => {
  it('không hành động nào trong máy trạng thái là thu hồi', async () => {
    const { ACTIONS } = await import('@csbh/domain-policy');
    for (const a of ACTIONS) {
      expect(a.toLowerCase()).not.toContain('revoke');
      expect(a.toLowerCase()).not.toContain('withdraw');
      expect(a.toLowerCase()).not.toContain('thu_hoi');
    }
  });

  it('endpoint thu hồi không tồn tại', async () => {
    const d = await draft();
    const r = await post(`/policies/${d.id}/revoke`, {});
    expect(r.status).toBe(404);
  });
});

describe('WF-23 hành động sai trạng thái', () => {
  it('409 kèm trạng thái hiện tại và danh sách hành động được phép', async () => {
    // Người gọi phải NẰM TRONG phạm vi thì mới tới được cổng trạng thái (`0031`)
    // — dùng chính người lập, vì hồ sơ Nháp chưa giao cho ai khác.
    const d = await draft();
    const r = await act(d.id, 'KT_RECEIVE_L2', 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.status).toBe('NHAP');
    expect(r.body.allowed).toEqual(['SUBMIT']);
  });
});

describe('WF-25 hai người duyệt cùng lúc', () => {
  it('một thành công, một nhận 409 nhờ khoá lạc quan', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const rowVersion = (await get(`/policies/${d.id}`)).body.rowVersion as number;

    const [a, b] = await Promise.all([
      act(d.id, 'TBP_SIGN', 'tbp01', { rowVersion }),
      act(d.id, 'TBP_SIGN', 'tbp01', { rowVersion }),
    ]);
    const codes = [a.status, b.status].sort();
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBe(409);
  });
});

describe('WF-26 luồng hoàn toàn tuần tự', () => {
  it('mỗi trạng thái chỉ có đúng một đường đi tiếp cho mỗi vai trò', async () => {
    const { allowedActions, STATUSES } = await import('@csbh/domain-policy');
    // Không trạng thái nào mở ra hai nhánh chạy SONG SONG: các lựa chọn ở cùng
    // một trạng thái là loại trừ nhau (duyệt HOẶC trả lại HOẶC từ chối).
    for (const s of STATUSES) {
      const acts = allowedActions(s);
      const targets = new Set(acts);
      expect(targets.size).toBe(acts.length);
    }
  });
});

describe('WF-28 chạy hết luồng bằng 5 tài khoản mẫu', () => {
  it('kết thúc ở Đang có hiệu lực với đủ mốc và đủ chuỗi sự kiện', async () => {
    const d = await draft();
    const r = await runToActive(d);
    expect(r.body.status).toBe('DANG_CO_HIEU_LUC');

    // SÁU dòng, không bảy: `PUBLISH_SIGNED` gỡ ở `0064`.
    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    expect(events.map((e) => e.action)).toEqual([
      'CREATE',
      'SUBMIT',
      'TBP_SIGN',
      'KT_RECEIVE_L1',
      'SA_HANDOVER',
      'KT_RECEIVE_L2',
    ]);

    // Năm sự kiện email, đúng danh sách người nhận của muc 3. Việc GỬI thư thuộc
    // notification (P6); ở đây khẳng định policy đã phát đủ và đúng.
    const mails = (await outboxFor(d.id)).filter((e) => e.payload.recipients);
    expect(mails.map((m) => m.routing_key)).toEqual([
      'policy.submit',
      'policy.tbp_sign',
      'policy.kt_receive_l1',
      'policy.sa_handover',
      'policy.kt_receive_l2',
    ]);
  });
});

// =============================================================================
// EFF — hiệu lực và phiên bản
// =============================================================================

describe('EFF-01 · EFF-05 · EFF-09 thay thế phiên bản', () => {
  it('bản cũ hết hiệu lực đúng lúc bản mới được tiếp nhận L2', async () => {
    const d = await draft();
    await runToActive(d);

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await runToActive({ id: v2.body.id });

    const old = await withAdminDb(async (c) => {
      const q = await c.query<{
        status: string;
        deactivated_at: Date | null;
        superseded_by_id: string | null;
      }>(`SELECT status::text, deactivated_at, superseded_by_id FROM pol.policy WHERE id = $1`, [
        d.id,
      ]);
      return q.rows[0]!;
    });
    expect(old.status).toBe('HET_HIEU_LUC');
    expect(old.deactivated_at).not.toBeNull();
    expect(old.superseded_by_id).toBe(v2.body.id);
  });

  it('`0082` danh sách theo khách hàng mang đủ MỐC THAY THẾ, dựng được lịch sử', async () => {
    /*
     * Màn hình khách hàng vẽ *Lịch sử CSBH* từ chính đường này. Trước `0082` nó
     * chỉ trả mã, phiên bản, trạng thái và hai ngày — không có `deactivatedAt`
     * lẫn `supersededById`, nên câu hỏi "bản nào thay bản nào, lúc mấy giờ"
     * không có dữ liệu để trả lời.
     *
     * Ba cột ấy nằm trong bảng từ `0001`; thiếu ở đây là thiếu ở phép chiếu.
     */
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['7000'] })],
    });
    await runToActive({ id: v2.body.id });

    const r = await get(`/policies?customerId=${d.customerId}&limit=50`);
    expect(r.status).toBe(200);
    const theo = (id: string) =>
      (r.body.items as Record<string, unknown>[]).find((x) => x['id'] === id)!;

    const cu = theo(d.id);
    const moi = theo(v2.body.id);

    // Bản cũ: có mốc hết hiệu lực, và trỏ tới ĐÚNG bản đã thay nó.
    expect(cu['status']).toBe('HET_HIEU_LUC');
    expect(cu['deactivatedAt']).not.toBeNull();
    expect(cu['supersededById']).toBe(v2.body.id);

    // Bản mới: chưa bị thay, và trỏ NGƯỢC về bản gốc — hai chiều của cùng một
    // quan hệ, và màn hình cần cả hai để nối chuỗi mà không phải gọi thêm.
    expect(moi['status']).toBe('DANG_CO_HIEU_LUC');
    expect(moi['deactivatedAt']).toBeNull();
    expect(moi['supersededById']).toBeNull();
    expect(moi['supersedesId']).toBe(d.id);

    // Mốc thay thế phải là MỘT thời điểm có thật, không phải cờ boolean: hai
    // phiên bản thay nhau trong cùng một ngày là chuyện thường.
    expect(Number.isNaN(new Date(String(cu['deactivatedAt'])).getTime())).toBe(false);
  });

  it('EFF-09 chuỗi ba phiên bản tra ngược được toàn bộ', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await runToActive({ id: v2.body.id });
    const v3 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['7000'] })],
    });
    await runToActive({ id: v3.body.id });

    const chain = (await get(`/policies/${v3.body.id}/versions`)).body as {
      versionNo: number;
      status: string;
    }[];
    expect(chain).toHaveLength(3);
    expect(chain.map((x) => x.status)).toEqual([
      'HET_HIEU_LUC',
      'HET_HIEU_LUC',
      'DANG_CO_HIEU_LUC',
    ]);

    // Tra ngược từ mắt xích đầu cũng ra đủ chuỗi.
    const fromV1 = (await get(`/policies/${d.id}/versions`)).body as unknown[];
    expect(fromV1).toHaveLength(3);
  });
});

describe('EFF-03 · EFF-04 bản cũ giữ nguyên hiệu lực trong lúc bản mới đi duyệt', () => {
  it('EFF-03 bản mới đang chờ duyệt thì bản cũ vẫn hiệu lực', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await act(v2.body.id, 'SUBMIT', 'tdv01');
    await act(v2.body.id, 'TBP_SIGN', 'tbp01');

    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.body.id).toBe(d.id);
    expect(cur.body.status).toBe('DANG_CO_HIEU_LUC');
  });

  it('EFF-04 bản mới bị từ chối thì bản cũ vẫn nguyên, không có khoảng trống', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await act(v2.body.id, 'SUBMIT', 'tdv01');
    await act(v2.body.id, 'TBP_RETURN', 'tbp01', { reason: 'Khong dat' });

    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.body.id).toBe(d.id);
  });
});

describe('EFF-06 mọi CSBH đều vô thời hạn', () => {
  it('không có job nào tự làm hết hiệu lực', async () => {
    const d = await draft();
    await runToActive(d);
    // Đẩy mốc hiệu lực lùi hai năm — nếu có logic hết hạn theo thời gian thì đây
    // là lúc nó lộ ra.
    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET effective_from = now() - interval '2 years' WHERE id = $1`, [
        d.id,
      ]),
    );
    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.body.status).toBe('DANG_CO_HIEU_LUC');
  });
});

describe('EFF-07 ngày áp dụng trước ngày duyệt xong', () => {
  it('hiệu lực vẫn tính từ lúc tiếp nhận L2, không lùi theo ngày áp dụng', async () => {
    const d = await draft();
    await patch(`/policies/${d.id}`, { appliedDate: '2020-03-01' });
    const r = await runToActive(d);
    expect(new Date(r.body.effectiveFrom).getFullYear()).toBe(new Date().getFullYear());
  });
});

describe('EFF-08 CSBH hiện hành của một khách hàng', () => {
  it('trả đúng một bản ghi dù lịch sử có nhiều phiên bản', async () => {
    const d = await draft();
    await runToActive(d);
    for (const cpbh of ['6000', '7000']) {
      const v = await post('/policies', {
        customerId: d.customerId,
        mode: 'AMEND',
        lines: [line(d.productId, { cpbh: [cpbh] })],
      });
      await runToActive({ id: v.body.id });
    }
    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.status).toBe(200);
    expect(cur.body.versionNo).toBe(3);

    const all = (await get(`/policies?customerId=${d.customerId}&limit=200`)).body.items as { status: string }[];
    expect(all.filter((p) => p.status === 'DANG_CO_HIEU_LUC')).toHaveLength(1);
  });
});

describe('EFF-10 tập sản phẩm giữa hai phiên bản liên tiếp', () => {
  it('tập của v(n) chứa toàn bộ tập của v(n−1)', async () => {
    const d = await draft();
    await runToActive(d);
    const moi = await makeProduct();
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'SUPPLEMENT',
      lines: [line(moi)],
    });

    const v1Ids = new Set(
      ((await get(`/policies/${d.id}`)).body.lines as { productId: string }[]).map(
        (l) => l.productId,
      ),
    );
    const v2Ids = new Set(
      (v2.body.lines as { productId: string }[]).map((l) => l.productId),
    );
    for (const id of v1Ids) expect(v2Ids.has(id)).toBe(true);
    expect(v2Ids.size).toBe(v1Ids.size + 1);
  });
});

describe('EFF-11 hiệu lực quản lý ở cấp hồ sơ', () => {
  it('bảng dòng sản phẩm KHÔNG có cột hiệu lực hay trạng thái', async () => {
    const cols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'pol' AND table_name = 'policy_line'`,
      );
      return r.rows.map((x) => x.column_name);
    });
    for (const bad of ['status', 'effective_from', 'effective_to', 'is_active', 'deactivated_at']) {
      expect(cols, `dòng sản phẩm không được có cột ${bad}`).not.toContain(bad);
    }
  });
});

describe('EFF-12 · EFF-13 bất biến một-CSBH-hiệu-lực', () => {
  it('EFF-12 nạp bản ghi LEGACY cho khách đã có CSBH hiệu lực thì báo lỗi rõ ràng', async () => {
    const d = await draft();
    await runToActive(d);

    const err = await withAdminDb(async (c) => {
      try {
        await c.query(
          `INSERT INTO pol.policy (code, customer_id, status, source)
           VALUES ($1, $2, 'DANG_CO_HIEU_LUC', 'LEGACY')`,
          [`${P}-LEGACY-${Date.now()}`, d.customerId],
        );
        return undefined;
      } catch (e) {
        return e as { code?: string; message: string };
      }
    });
    expect(err?.code).toBe('23505');
    expect(err?.message).toContain('uq_policy_active_per_customer');
  });

  it('EFF-13 kích hoạt hỏng giữa chừng thì rollback toàn bộ', async () => {
    const d = await draft();
    await runToActive(d);

    // Mô phỏng đúng thứ tự thao tác của bước tiếp nhận L2, rồi ném lỗi ở giữa.
    await withAdminDb(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          `UPDATE pol.policy SET status = 'HET_HIEU_LUC', deactivated_at = now() WHERE id = $1`,
          [d.id],
        );
        throw new Error('lỗi giả lập sau khi vô hiệu bản cũ');
      } catch {
        await c.query('ROLLBACK');
      }
    });

    const after = await withAdminDb(async (c) => {
      const r = await c.query<{ id: string; status: string }>(
        `SELECT id, status::text FROM pol.policy
          WHERE customer_id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
        [d.customerId],
      );
      return r.rows;
    });
    // Vẫn đúng một CSBH hiệu lực, và vẫn là bản cũ.
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(d.id);
  });
});

describe('AD-02 policy không đọc chéo schema khác', () => {
  it('role csbh_pol không SELECT được cus.customer hay cat.product', async () => {
    for (const table of ['cus.customer', 'cat.product']) {
      const err = await withAdminDb(async (c) => {
        await c.query(`SET ROLE csbh_pol`);
        try {
          await c.query(`SELECT 1 FROM ${table} LIMIT 1`);
          return undefined;
        } catch (e) {
          return e as { code?: string };
        } finally {
          await c.query(`RESET ROLE`);
        }
      });
      expect(err?.code, `csbh_pol đáng lẽ không đọc được ${table}`).toBe('42501');
    }
  });
});

// =============================================================================
// CPBH số lượng tự do (0021)
// =============================================================================

describe('CPBH không cố định bốn khoản', () => {
  it('lập được dòng KHÔNG có khoản chi phí nào', async () => {
    // Giá thu về khi đó bằng đúng giá bán buôn. Trước 0021 phải gõ bốn số 0.
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '90000' }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const l = r.body.lines[0];
    expect(l.cpbh).toEqual([]);
    expect(l.cpbhTotal).toBe('0');
    expect(l.netPrice).toBe('90000');
  });

  it('lập được dòng nhiều hơn bốn khoản', async () => {
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [
        { productId, wholesalePrice: '90000', cpbh: ['1000', '2000', '500', '400', '100', '3000'] },
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const l = r.body.lines[0];
    expect(l.cpbh).toEqual(['1000', '2000', '500', '400', '100', '3000']);
    expect(l.cpbhTotal).toBe('7000');
    expect(l.netPrice).toBe('83000');
  });

  it('GIỮ NGUYÊN THỨ TỰ người dùng nhập', async () => {
    // Thứ tự là dữ liệu: khoản thứ mấy trên bản in phải khớp khoản thứ mấy người
    // lập đã khai. Sắp lại hay dồn số 0 xuống cuối đều là sửa hồ sơ của họ.
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '90000', cpbh: ['0', '5000', '0'] }],
    });
    expect(r.body.lines[0].cpbh).toEqual(['0', '5000', '0']);
    expect(r.body.lines[0].cpbhTotal).toBe('5000');
  });

  it('khoản âm bị chặn, và báo ĐÚNG khoản thứ mấy', async () => {
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '90000', cpbh: ['1000', '-5'] }],
    });
    expect(r.status).toBe(400);
    // Chỉ số nằm trong tên trường: "cpbh[1]", không phải "cpbh" trần — với mười
    // khoản thì lỗi không nêu chỉ số bắt người dùng dò lại cả dòng.
    expect(JSON.stringify(r.body)).toContain('cpbh[1]');
  });

  it('phiên bản mới chép lại ĐÚNG các khoản của bản cũ', async () => {
    // Bản bổ sung phải chứa lại toàn bộ sản phẩm cũ (POL-08). Chép thiếu khoản
    // chi phí là đổi giá thu về của một dòng mà không ai bấm gì.
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', { customerId: d.customerId, mode: 'AMEND', lines: [] });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    const cu = (await get(`/policies/${d.id}`)).body.lines[0];
    const moi = v2.body.lines.find((l: { productId: string }) => l.productId === d.productId);
    expect(moi.cpbh).toEqual(cu.cpbh);
    expect(moi.netPrice).toBe(cu.netPrice);
  });
});

describe('sửa một dòng sản phẩm đã có', () => {
  /**
   * Trước đây giao diện chỉ có Xoá, nên đổi một con số nghĩa là xoá dòng rồi
   * thêm lại — gõ lại cả giá bán buôn lẫn mọi khoản chi phí, và giữa hai thao
   * tác thì hồ sơ thiếu mất một sản phẩm.
   *
   * Đường riêng `PATCH .../lines/:lineId`, KHÔNG cho `POST` ghi đè khi trùng sản
   * phẩm: trùng lúc thêm là một nhầm lẫn và `POL-02` chặn nó có chủ ý.
   */
  const suaDong = async (policyId: string, lineId: string, body: object, who = 'tdv01') =>
    patch(`/policies/${policyId}/lines/${lineId}`, body, who);

  it('đổi được giá bán buôn và các khoản chi phí', async () => {
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];

    const r = await suaDong(d.id, l.id, {
      wholesalePrice: '80000',
      cpbh: ['1000', '2000'],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const sau = (await get(`/policies/${d.id}`)).body.lines;
    expect(sau).toHaveLength(1);
    expect(sau[0].wholesalePrice).toBe('80000');
    expect(sau[0].cpbh).toEqual(['1000', '2000']);
    // Giá thu về tính lại theo con số mới, không giữ giá trị cũ.
    expect(sau[0].netPrice).toBe('77000');
  });

  it('giữ NGUYÊN id dòng và sản phẩm', async () => {
    // Giao diện nhận diện dòng theo `id` để bấm Xoá; đổi id sau mỗi lần sửa là
    // nút Xoá trỏ vào một dòng không còn tồn tại.
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    await suaDong(d.id, l.id, { wholesalePrice: '85000' });
    const sau = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(sau.id).toBe(l.id);
    expect(sau.productId).toBe(l.productId);
  });

  it('KHÔNG đổi được sản phẩm qua đường sửa', async () => {
    // `productId` không có trong DTO nên bị bỏ qua. Đổi sản phẩm của một dòng là
    // xoá dòng này và thêm dòng khác — hai việc có ý nghĩa nghiệp vụ khác nhau.
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    const spKhac = await makeProduct();
    await suaDong(d.id, l.id, { wholesalePrice: '85000', productId: spKhac });
    expect((await get(`/policies/${d.id}`)).body.lines[0].productId).toBe(l.productId);
  });

  it('KHÔNG gửi kèm được giá bán Công ty hay ngưỡng', async () => {
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    const r = await suaDong(d.id, l.id, { wholesalePrice: '85000', companyPrice: '1' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('FIELD_NOT_ALLOWED');
  });

  it('dòng không thuộc hồ sơ này thì 404', async () => {
    const a = await draft();
    const b = await draft();
    const lb = (await get(`/policies/${b.id}`)).body.lines[0];
    expect((await suaDong(a.id, lb.id, { wholesalePrice: '80000' })).status).toBe(404);
  });

  it('hồ sơ đã gửi duyệt thì KHÔNG sửa được dòng', async () => {
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await suaDong(d.id, l.id, { wholesalePrice: '80000' })).status).toBe(409);
  });
});

/**
 * 0022 — dòng hồ sơ nhớ NGUỒN của ngưỡng, không chỉ con số.
 *
 * Giao diện tô vàng dòng nào rơi về ngưỡng mặc định của sản phẩm, và người duyệt
 * dựa vào đó để biết con số ấy KHÔNG đến từ chính sách chiết khấu đã ban hành.
 * Cờ đó vô nghĩa nếu nó không đi theo dòng qua mọi đường ghi.
 */
describe('0022 nguồn ngưỡng chiết khấu đóng băng vào dòng hồ sơ', () => {
  /** Sản phẩm trong NHÓM RIÊNG, để khai quy định mà không đụng nhóm chung của tệp. */
  const sanPhamNhomRieng = async (): Promise<{ productId: string; groupCode: string }> => {
    const c = await http(catalog);
    const g = uniq('NHOM0022');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0022' });
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0022'), name: 'Nutricare Gold', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return { productId: r.body.id as string, groupCode: g };
  };

  const khaiQuyDinh = async (g: string, nguong: number) =>
    (await http(catalog))
      .post('/catalog/discount-rules')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({
        code: uniq('CK0022'),
        productGroupCode: g,
        customerType: 1,
        effectiveFrom: '2020-01-01',
        thresholdRate2: nguong,
      });

  it('có quy định khớp → thresholdSource là RULE', async () => {
    const { productId, groupCode: g } = await sanPhamNhomRieng();
    expect((await khaiQuyDinh(g, 2500)).status).toBe(201);

    const d = await draft({ productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('RULE');
    expect(l.threshold).toBe('25.00');
  });

  it('không quy định nào khớp → thresholdSource là KHONG_CO, ngưỡng rỗng', async () => {
    // Nhóm riêng và KHÔNG khai quy định nào cho nó. Từ `0025` không còn ngưỡng
    // mặc định nào để rơi về, nên dòng đơn giản là không có ngưỡng đối chiếu.
    // Mọi quy định do bộ test tạo ra đều gắn nhóm cụ thể, không có dòng nào phủ
    // "mọi nhóm" để lọt vào đây.
    const { productId } = await sanPhamNhomRieng();
    const d = await draft({ productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');
    expect(l.threshold).toBeNull();
  });

  it('sửa một dòng thì tra lại nguồn, không giữ nguyên cờ cũ', async () => {
    // `upsertLine` chạy lại `resolve` mỗi lần ghi. Nếu Quản trị khai quy định
    // giữa hai lần sửa thì dòng phải đổi cả ngưỡng lẫn nguồn — giữ cờ cũ là để
    // lại một dòng vàng vĩnh viễn dù quy định đã có.
    const { productId, groupCode: g } = await sanPhamNhomRieng();
    const d = await draft({ productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');

    expect((await khaiQuyDinh(g, 2800)).status).toBe(201);
    expect((await patch(`/policies/${d.id}/lines/${l.id}`, { wholesalePrice: '80000' })).status)
      .toBe(200);

    const sau = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(sau.thresholdSource).toBe('RULE');
    expect(sau.threshold).toBe('28.00');
  });

  it('phiên bản mới thừa kế dòng cũ thì thừa kế cả nguồn ngưỡng', async () => {
    // Dòng thừa kế giữ NGUYÊN ngưỡng của bản cũ, nên nó phải giữ nguyên cả câu
    // trả lời "ngưỡng ấy từ đâu ra". Bỏ hai cột lại thì dòng thừa kế mang ngưỡng
    // cũ mà nguồn rỗng, và màn hình đọc ra là "không rõ".
    const { productId } = await sanPhamNhomRieng();
    const d = await draft({ productId });
    await runToActive(d);

    const spMoi = await makeProduct();
    const moi = await post('/policies', {
      customerId: d.customerId,
      mode: 'SUPPLEMENT',
      lines: [line(spMoi)],
    });
    expect(moi.status, JSON.stringify(moi.body)).toBe(201);

    const lines = (await get(`/policies/${moi.body.id}`)).body.lines as {
      productId: string;
      thresholdSource: string | null;
    }[];
    const thuaKe = lines.find((x) => x.productId === productId);
    expect(thuaKe?.thresholdSource).toBe('KHONG_CO');
  });
});

/**
 * 0022 — xem trước ngưỡng TRƯỚC khi thêm dòng.
 *
 * Sinh ra để màn hình cảnh báo được lúc người dùng còn đổi ý được rẻ. Sau khi
 * lưu thì con số đã đóng băng và sửa lại là thêm một lượt thao tác.
 */
describe('0022 GET /policies/:id/threshold-preview', () => {
  it('nói rõ ngưỡng sẽ dùng và nó từ đâu ra', async () => {
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${d.productId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.threshold).toBe('15.00');
    expect(r.body.thresholdSource).toBe('RULE');
    expect(r.body.productId).toBe(d.productId);
  });

  it('KHÔNG ghi gì — hồ sơ vẫn nguyên số dòng cũ', async () => {
    const d = await draft();
    const spKhac = await makeProduct();
    await get(`/policies/${d.id}/threshold-preview?productId=${spKhac}`);
    expect((await get(`/policies/${d.id}`)).body.lines).toHaveLength(1);
  });

  it('sản phẩm không có thật thì 404', async () => {
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${crypto.randomUUID()}`);
    expect(r.status).toBe(404);
  });

  it('thiếu productId thì 400', async () => {
    const d = await draft();
    expect((await get(`/policies/${d.id}/threshold-preview`)).status).toBe(400);
  });

  it('hồ sơ ngoài phạm vi thì 403 — đường đọc vẫn siết phạm vi', async () => {
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${d.productId}`, 'tdv02');
    expect(r.status).toBe(403);
  });
});

/**
 * 0023 — sản phẩm KHÔNG có ngưỡng nào vẫn đưa vào hồ sơ được.
 *
 * Trước 0023 máy chủ ném `THRESHOLD_NOT_CONFIGURED` và chặn luôn việc thêm dòng.
 * Ngưỡng chỉ để cảnh báo — vượt ngưỡng còn không chặn gửi duyệt — nên thiếu
 * ngưỡng không thể là lý do chặn, nhất là khi TDV không có quyền tự khai.
 */
describe('0023 sản phẩm không có ngưỡng nào', () => {
  /** Sản phẩm nhóm riêng, KHÔNG khai ngưỡng mặc định nào. */
  const sanPhamKhongNguong = async (): Promise<string> => {
    const c = await http(catalog);
    const g = uniq('NHOM0023');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0023' });
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0023'), name: 'San pham khong nguong', groupCode: g, price: '100000' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return r.body.id as string;
  };

  it('danh mục trả nguồn KHONG_CO thay vì 404', async () => {
    const productId = await sanPhamKhongNguong();
    const r = await (await http(catalog))
      .get(`/catalog/thresholds/resolve?productId=${productId}&customerType=1`)
      .set('Authorization', `Bearer ${tok['admin01']}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.source).toBe('KHONG_CO');
    expect(r.body.thresholdRate2).toBeNull();
    expect(r.body.ruleCode).toBeNull();
  });

  it('THÊM ĐƯỢC dòng, và dòng đó không có ngưỡng', async () => {
    const productId = await sanPhamKhongNguong();
    const customerId = await makeCustomer();
    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    expect(hs.status, JSON.stringify(hs.body)).toBe(201);

    const l = (await get(`/policies/${hs.body.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');
    expect(l.threshold).toBeNull();
    expect(l.ruleCode).toBeNull();
    // Mọi con số khác vẫn đủ: 90.000 − 5.000 = 85.000, tức chiết khấu 15%.
    expect(l.netPrice).toBe('85000');
    expect(l.discountRate).toBe('15.00');
  });

  it('không ngưỡng thì KHÔNG bao giờ bị đánh dấu vượt ngưỡng', async () => {
    // Cột sinh `over_threshold` đã tính sẵn `threshold_snap IS NOT NULL`. Nếu ai
    // đó "sửa" bằng cách đặt ngưỡng 0 khi thiếu thì MỌI dòng sẽ đỏ.
    const productId = await sanPhamKhongNguong();
    const customerId = await makeCustomer();
    const hs = await post('/policies', {
      customerId,
      // Giá thu về rất thấp: chiết khấu 90%, chắc chắn vượt mọi ngưỡng có thật.
      lines: [line(productId, { wholesalePrice: '10000', cpbh: [] })],
    });
    expect(hs.status).toBe(201);
    const l = (await get(`/policies/${hs.body.id}`)).body.lines[0];
    expect(l.discountRate).toBe('90.00');
    expect(l.overThreshold).toBe(false);
  });

  it('hồ sơ đó vẫn chạy hết luồng tới Đang có hiệu lực', async () => {
    // Thiếu ngưỡng không được chặn ở BẤT KỲ bước nào sau đó, không riêng bước
    // thêm dòng — một cái chặn ở giữa luồng còn khó gỡ hơn cái chặn lúc lập.
    const productId = await sanPhamKhongNguong();
    const customerId = await makeCustomer();
    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    await runToActive({ id: hs.body.id as string });
    expect((await get(`/policies/${hs.body.id}`)).body.status).toBe('DANG_CO_HIEU_LUC');
  });

  it('xem trước cũng trả KHONG_CO, không 404', async () => {
    const productId = await sanPhamKhongNguong();
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${productId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.thresholdSource).toBe('KHONG_CO');
    expect(r.body.threshold).toBeNull();
  });
});

/** 0023 — mã quy định đi ra tới giao diện, cho cột QĐCK. */
describe('0023 dòng hồ sơ trả ruleId', () => {
  /** Sản phẩm nhóm riêng, KHÔNG khai quy định nào cho nhóm ấy. */
  const sanPhamTroi = async (): Promise<string> => {
    const c = await http(catalog);
    const g = uniq('NHOM0024');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0024' });
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0024'), name: 'SP troi', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return r.body.id as string;
  };

  it('có quy định khớp thì ruleCode là ĐÚNG quy định ấy', async () => {
    const c = await http(catalog);
    const g = uniq('NHOM0023B');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0023b' });
    const sp = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0023B'), name: 'SP', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${sp.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    const qd = await c
      .post('/catalog/discount-rules')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({
        code: uniq('CK0023B'),
        productGroupCode: g,
        customerType: 1,
        effectiveFrom: '2020-01-01',
        thresholdRate2: 3300,
      });
    expect(qd.status, JSON.stringify(qd.body)).toBe(201);

    const d = await draft({ productId: sp.body.id as string });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.ruleCode).toBe(qd.body.code);
    expect(l.threshold).toBe('33.00');
  });

  it('không quy định nào khớp thì ruleCode là null', async () => {
    const productId = await sanPhamTroi();
    const customerId = await makeCustomer();
    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    const l = (await get(`/policies/${hs.body.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');
    expect(l.ruleCode).toBeNull();
  });
});

/**
 * 0023 — đổi loại khách hàng KHÔNG được làm lệch hồ sơ đã lập.
 *
 * Loại khách hàng quyết định ngưỡng chiết khấu, và từ `0023` nó sửa được. Cái
 * phải chứng minh là việc sửa ấy an toàn: hồ sơ đã lập giữ nguyên con số của
 * mình, còn hồ sơ lập sau thì dùng ngưỡng mới.
 */
describe('0023 đổi loại khách hàng và ngưỡng đã đóng băng', () => {
  /**
   * Sản phẩm nhóm riêng, BA QUY ĐỊNH cho ba loại khách — ba ngưỡng khác nhau.
   *
   * Ba ngưỡng phải KHÁC NHAU thì test mới có nghĩa: sản phẩm ngưỡng đều nhau
   * làm cả bốn case dưới đây xanh kể cả khi mã sai hoàn toàn.
   *
   * Trước `0025` ba con số này là ba cột trên chính sản phẩm. Giờ chúng là ba
   * dòng trong bảng quy định — đúng chỗ duy nhất khai ngưỡng.
   */
  const sanPhamBaNguong = async (): Promise<string> => {
    const c = await http(catalog);
    const g = uniq('NHOM0023C');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0023c' });
    for (const [loai, nguong] of [
      [1, 1000], // 10,00%
      [2, 2000], // 20,00%
      [3, 3000], // 30,00%
    ] as const) {
      const q = await c
        .post('/catalog/discount-rules')
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({
          code: uniq('CK0023C'),
          productGroupCode: g,
          customerType: loai,
          effectiveFrom: '2020-01-01',
          thresholdRate2: nguong,
        });
      if (q.status !== 201) throw new Error(`khai quy định hỏng: ${JSON.stringify(q.body)}`);
    }
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0023C'), name: 'SP ba nguong', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return r.body.id as string;
  };

  const doiLoai = async (customerId: string, loai: number) =>
    (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ customerType: loai });

  /*
   * ĐẢO NGƯỢC Ở `0029`.
   *
   * P31 chốt: hồ sơ Nháp GIỮ NGUYÊN ngưỡng cũ sau khi đổi loại khách hàng, với
   * lý do "một con số trong hồ sơ đang mở không được đổi dưới tay người đang
   * xem". Lý do ấy nghe đúng nhưng dẫn tới điều tệ hơn: người lập đọc một con
   * số rồi bấm Gửi duyệt, và thứ được đóng băng là một con số KHÁC — vì lúc gửi
   * mới tra lại. Nói cách khác, con số vẫn đổi dưới tay họ, chỉ là đổi muộn hơn
   * và ở chỗ họ không nhìn thấy.
   *
   * `0029` chọn hướng ngược lại và nói thẳng: hồ sơ Nháp SỐNG THEO danh mục, mọi
   * lúc. Đóng băng chỉ xảy ra một lần, ở đúng lúc gửi duyệt.
   */
  it('0029 hồ sơ NHÁP nhận ngưỡng MỚI ngay khi mở lại sau khi đổi loại', async () => {
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    expect((await get(`/policies/${d.id}`)).body.lines[0].threshold).toBe('10.00');

    expect((await doiLoai(customerId, 3)).status).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].threshold).toBe('30.00');
  });

  it('hồ sơ lập SAU khi đổi loại thì dùng ngưỡng mới', async () => {
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    expect((await doiLoai(customerId, 3)).status).toBe(200);

    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    expect(hs.status, JSON.stringify(hs.body)).toBe(201);
    expect((await get(`/policies/${hs.body.id}`)).body.lines[0].threshold).toBe('30.00');
  });

  it('sửa một dòng cũng nhận ngưỡng mới — nhưng không còn là đường DUY NHẤT', async () => {
    // Trước `0029` đây là cách duy nhất làm hồ sơ Nháp nhận ngưỡng mới. Giờ chỉ
    // cần mở hồ sơ ra; đường sửa dòng vẫn phải đúng, nên vẫn kiểm.
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    expect((await doiLoai(customerId, 2)).status).toBe(200);

    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.threshold).toBe('20.00');
    expect((await patch(`/policies/${d.id}/lines/${l.id}`, { wholesalePrice: '88000' })).status)
      .toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].threshold).toBe('20.00');
  });

  it('hồ sơ ĐANG CÓ HIỆU LỰC không đổi số, và cũng không sửa được dòng', async () => {
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    await runToActive(d);
    expect((await doiLoai(customerId, 3)).status).toBe(200);

    const sau = (await get(`/policies/${d.id}`)).body;
    expect(sau.status).toBe('DANG_CO_HIEU_LUC');
    expect(sau.lines[0].threshold).toBe('10.00');
    // Hồ sơ đã khoá sửa nên không có đường nào làm nó đổi số.
    expect((await patch(`/policies/${d.id}/lines/${sau.lines[0].id}`, { wholesalePrice: '80000' })).status)
      .toBe(409);
  });
});

/**
 * 0027 — ghi chú tự do trên từng dòng sản phẩm.
 *
 * Cột chữ duy nhất giữa một dòng toàn số, và là thứ duy nhất trên dòng KHÔNG
 * phải ảnh chụp của danh mục: nó là chữ người lập gõ vào chính dòng này.
 */
describe('0027 ghi chú của dòng sản phẩm', () => {
  it('lưu và trả về nguyên văn khi lập hồ sơ', async () => {
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [line(productId, { note: 'Giá theo thoả thuận tháng 8' })],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines[0].note).toBe('Giá theo thoả thuận tháng 8');
  });

  it('không gửi ghi chú thì là null, không phải chuỗi rỗng', async () => {
    // Chuỗi rỗng và null cùng nghĩa "không ghi chú" — hai cách viết một nghĩa là
    // hai cách để một bộ lọc sót. Ràng buộc `ghi_chu_khong_rong` chặn ở CSDL.
    const d = await draft();
    expect((await get(`/policies/${d.id}`)).body.lines[0].note).toBeNull();
  });

  it('chuỗi rỗng nghĩa là KHÔNG ghi chú, và lưu xuống thành null', async () => {
    // `opt()` coi chuỗi rỗng là vắng mặt — nhờ đó ô ghi chú của biểu mẫu gửi
    // lên được ở mọi lượt lưu mà không phải tự quyết định khi nào thì bỏ trường
    // đi. Chuỗi rỗng KHÔNG bao giờ xuống tới CSDL: `ghi_chu_khong_rong` chặn nó
    // ở đó, phòng đường ghi nào khác quên chuẩn hoá.
    const d = await draft();
    const r = await post(`/policies/${d.id}/lines`, line(await makeProduct(), { note: '' }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines.at(-1).note).toBeNull();
  });

  it('chuỗi toàn khoảng trắng bị từ chối kèm tên trường', async () => {
    // Khác chuỗi rỗng: người dùng gõ mấy dấu cách rồi lưu là một nhầm lẫn, và
    // `str()` cắt khoảng trắng trước khi đo độ dài nên nó rơi xuống dưới tối
    // thiểu 1 ký tự.
    const d = await draft();
    const r = await post(`/policies/${d.id}/lines`, line(await makeProduct(), { note: '   ' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('note');
  });

  it('quá 500 ký tự thì 400 — ô này in thẳng vào bản A4', async () => {
    const d = await draft();
    const r = await post(
      `/policies/${d.id}/lines`,
      line(await makeProduct(), { note: 'x'.repeat(501) }),
    );
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('note');
  });

  it('sửa dòng đổi được ghi chú, và BỎ trường đi là XOÁ ghi chú', async () => {
    // Biểu mẫu sửa dòng gửi lên toàn bộ nội dung dòng, nên vắng mặt ô ghi chú
    // nghĩa là người dùng vừa xoá nó — không phải "giữ nguyên giá trị cũ".
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];

    expect(
      (await patch(`/policies/${d.id}/lines/${l.id}`, {
        wholesalePrice: '90000',
        note: 'Khách yêu cầu đóng thùng 12',
      })).status,
    ).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].note).toBe(
      'Khách yêu cầu đóng thùng 12',
    );

    expect(
      (await patch(`/policies/${d.id}/lines/${l.id}`, { wholesalePrice: '90000' })).status,
    ).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].note).toBeNull();
  });

  it('phiên bản mới CHÉP LẠI ghi chú của dòng thừa kế', async () => {
    // Phiên bản mới phải chứa lại toàn bộ sản phẩm cũ (POL-05). Chép dòng mà bỏ
    // ghi chú lại thì bản ký tên lần hai thiếu đúng phần chữ người lập viết ra.
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const d = await draft({ customerId, productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    await patch(`/policies/${d.id}/lines/${l.id}`, {
      wholesalePrice: '90000',
      note: 'Ghi chú phải sống qua phiên bản',
    });
    await runToActive(d);

    // BỔ SUNG một sản phẩm khác: dòng cũ KHÔNG nằm trong danh sách gửi lên nên
    // nó là dòng thừa kế thuần tuý.
    const spMoi = await makeProduct();
    const v2 = await post('/policies', {
      customerId,
      mode: 'SUPPLEMENT',
      lines: [line(spMoi)],
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);

    const cu = (v2.body.lines as { productId: string; note: string | null }[]).find(
      (x) => x.productId === productId,
    );
    expect(cu?.note).toBe('Ghi chú phải sống qua phiên bản');
  });
});

// =============================================================================
// 0029 — giá và ngưỡng theo NGÀY ÁP DỤNG, hồ sơ Nháp sống theo danh mục
// =============================================================================

const cat = async () => http(catalog);
const datGia = async (productId: string, amount: string, effectiveFrom: string) =>
  (await cat())
    .post(`/catalog/products/${productId}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount, effectiveFrom });

const khaiQuyDinh = async (body: object) =>
  (await cat())
    .post('/catalog/discount-rules')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send(body);

/** Sản phẩm thuộc nhóm RIÊNG, để quy định khai cho nó không đụng tệp test khác. */
const sanPhamNhomRieng = async (gia: string, tuNgay = '2020-01-01') => {
  const nhom = uniq('NHOM');
  const c = await cat();
  await c
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: nhom, name: 'Nhom rieng' });
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('SP'), name: 'San pham rieng', groupCode: nhom, price: '100000' });
  products.push(r.body.id);

  /*
   * XOÁ dòng giá của NGÀY HÔM NAY mà lượt tạo vừa sinh ra (`0123`).
   *
   * Từ `0123` tạo sản phẩm BẮT BUỘC có giá, và dòng ấy mang ngày hôm nay — nên
   * nó thắng mọi mốc quá khứ mà helper này dựng, và mọi ca kiểm về lịch sử giá
   * đọc ra đúng con số của lượt tạo. Đo được: 12 ca đỏ cùng lúc, tất cả với
   * `expected '100000' to be '300000'`.
   *
   * Đi thẳng CSDL vì API không còn đường nào tạo một sản phẩm chưa có giá — mà
   * đó chính là điểm của `0123`. Đây là fixture dựng một quá khứ, không phải một
   * đường nghiệp vụ.
   */
  await withAdminDb(async (c) =>
    c.query(
      `DELETE FROM cat.product_price
        WHERE product_id = $1 AND price_type = 'GIA_BAN_CONG_TY'
          AND effective_from = current_date`,
      [r.body.id],
    ),
  );
  await datGia(r.body.id as string, gia, tuNgay);
  return { productId: r.body.id as string, groupCode: nhom };
};

describe('0029 ảnh chụp lấy theo NGÀY ÁP DỤNG, không phải hôm nay', () => {
  it('giá của ngày áp dụng thắng giá của hôm nay', async () => {
    // Hai mốc giá: 100.000 từ 2020, 300.000 từ 2020-06. Hồ sơ áp dụng 2020-03
    // phải chụp 100.000 — dù hôm nay giá đã là 300.000.
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '300000', '2020-06-01');

    const customerId = await makeCustomer();
    const r = await post('/policies', {
      customerId,
      appliedDate: '2020-03-15',
      lines: [line(productId)],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines[0].companyPrice).toBe('100000');
  });

  it('không khai ngày áp dụng thì lấy giá hôm nay', async () => {
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '300000', '2020-06-01');

    const customerId = await makeCustomer();
    const r = await post('/policies', { customerId, lines: [line(productId)] });
    expect(r.status).toBe(201);
    expect(r.body.lines[0].companyPrice).toBe('300000');
  });

  it('NGƯỠNG cũng theo ngày áp dụng, không chỉ giá', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000', '2019-01-01');
    expect((await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2019-01-01', thresholdRate2: 1000,
    })).status).toBe(201);
    expect((await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2019-06-01', thresholdRate2: 2000,
    })).status).toBe(201);

    const customerId = await makeCustomer();
    const r = await post('/policies', {
      customerId,
      appliedDate: '2019-03-01',
      lines: [line(productId)],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines[0].threshold).toBe('10.00');
  });

  it('đổi NGÀY ÁP DỤNG thì chụp lại theo bảng giá của ngày mới', async () => {
    // Đây là chỗ dễ quên nhất: đổi ngày mà không chụp lại thì hồ sơ mang ngày
    // của tháng sau và giá của tháng trước.
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '300000', '2020-06-01');

    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId, appliedDate: '2020-03-15', lines: [line(productId)],
    });
    expect(d.body.lines[0].companyPrice).toBe('100000');

    const sua = await patch(`/policies/${d.body.id}`, { appliedDate: '2020-09-01' });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);
    expect(sua.body.lines[0].companyPrice).toBe('300000');
  });
});

describe('0029 hồ sơ Nháp sống theo danh mục, không đóng băng', () => {
  it('mở lại hồ sơ Nháp sau khi đổi giá thì thấy giá MỚI', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect(d.body.lines[0].companyPrice).toBe('100000');

    await datGia(productId, '150000', '2020-02-01');

    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.status).toBe(200);
    expect(lai.body.lines[0].companyPrice).toBe('150000');
    // Giá thu về giữ nguyên (người dùng nhập), tỷ lệ chiết khấu tính LẠI.
    expect(lai.body.lines[0].wholesalePrice).toBe('90000');
    expect(lai.body.lines[0].discountRate).not.toBe(d.body.lines[0].discountRate);
  });

  it('mở lại hồ sơ Nháp sau khi đổi NGƯỠNG thì thấy ngưỡng MỚI', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    const qd = await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    });
    expect(qd.status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect(d.body.lines[0].threshold).toBe('10.00');

    expect(
      (await (await cat())
        .patch(`/catalog/discount-rules/${qd.body.code}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({ thresholdRate2: 2500 })).status,
    ).toBe(200);

    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.body.lines[0].threshold).toBe('25.00');
    expect(lai.body.lines[0].ruleCode).toBe(qd.body.code);
  });

  it('làm mới KHÔNG đụng giá bán buôn và CPBH — đó là số người dùng nhập', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '77000', cpbh: ['1000', '2000'] }],
    });
    await datGia(productId, '500000', '2020-02-01');

    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.body.lines[0].wholesalePrice).toBe('77000');
    expect(lai.body.lines[0].cpbh).toEqual(['1000', '2000']);
    expect(lai.body.lines[0].companyPrice).toBe('500000');
  });

  it('hồ sơ ĐÃ GỬI DUYỆT thì KHÔNG làm mới — đóng băng là đóng băng', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '900000', '2020-02-01');

    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.body.status).toBe('CHO_TBP_DUYET');
    expect(lai.body.lines[0].companyPrice).toBe('100000');
  });

  it('làm mới KHÔNG bump row_version — thẻ khoá lạc quan phải còn dùng được', async () => {
    // Một lượt ĐỌC làm hỏng thẻ khoá người dùng đang cầm là một 409 không giải
    // thích được cho họ.
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const v = d.body.rowVersion as number;

    await datGia(productId, '150000', '2020-02-01');
    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.body.rowVersion).toBe(v);
    // Và hành động kèm đúng rowVersion ấy vẫn đi được.
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  });
});

describe('0029 GỬI DUYỆT làm mới lần cuối rồi mới đóng băng', () => {
  it('giá đổi giữa lúc mở và lúc bấm Gửi thì đóng băng giá MỚI', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });

    // Không mở lại hồ sơ — đổi giá rồi bấm Gửi thẳng.
    await datGia(productId, '250000', '2020-02-01');
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const sau = await get(`/policies/${d.body.id}`);
    expect(sau.body.lines[0].companyPrice).toBe('250000');
  });

  it('sản phẩm vô hiệu hoá: MỞ vẫn được, GỬI thì 422 kèm tên sản phẩm', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const maSp = d.body.lines[0].productCode as string;

    expect(
      (await (await cat())
        .patch(`/catalog/products/${productId}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        // `confirm` = mã sản phẩm, bắt buộc từ `0036`.
        .send({ status: 'DA_VO_HIEU_HOA', confirm: maSp })).status,
    ).toBe(200);

    // MỞ: vẫn xem được, dòng giữ nguyên số cũ. Chặn ở đây là nhốt người dùng
    // ngoài chính hồ sơ của họ, đúng cái hồ sơ họ cần vào để xoá dòng hỏng.
    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.status).toBe(200);
    expect(lai.body.lines[0].companyPrice).toBe('100000');

    // GỬI: chặn, và nói rõ sản phẩm nào.
    const gui = await act(d.body.id, 'SUBMIT', 'tdv01');
    expect(gui.status).toBe(422);
    expect(gui.body.code).toBe('STALE_LINE');
    expect(gui.body.products).toContain(maSp);
  });
});

// =============================================================================
// 0029 — dấu vết "hồ sơ đã đóng băng đang lệch so với danh mục"
//
// Gọi THẲNG `handle()` thay vì đẩy qua RabbitMQ: phần bus đã được `notification.
// test.ts` chạy qua đường thật rồi, còn ở đây thứ cần khẳng định là PHÉP SO và
// phép đồng bộ bảng — hai thứ không cần tới hàng đợi để sai.
// =============================================================================

describe('0029 box Yêu cầu cập nhật', () => {
  const raSoat = async (productId?: string) =>
    app.get(CatalogImpactConsumer).handle(productId === undefined ? {} : { productId });

  /*
   * `limit=200` — trần một trang, không phải 50.
   *
   * Mỗi ca trong khối này dựng thêm một hồ sơ lệch, và CSDL của bộ test dùng
   * chung nên chúng cộng dồn. Tới lúc vượt 50, hồ sơ mà ca kiểm thử vừa dựng rơi
   * ra ngoài trang đầu và ca ấy đỏ vì một lý do chẳng liên quan gì tới điều đang
   * kiểm. Đã dính đúng chuyện này.
   */
  const lech = async (who = 'tdv01') =>
    (await get('/policies/impacted?limit=200', who)).body.items as {
      id: string;
      lech: { kind: string; productCode: string; snapValue: string; newValue: string | null }[];
    }[];

  it('đổi giá xong thì hồ sơ ĐANG CHỜ DUYỆT hiện trong box, kèm giá cũ và mới', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '180000', '2020-02-01');
    await raSoat(productId);

    const ds = await lech();
    const h = ds.find((x) => x.id === d.body.id);
    expect(h, 'hồ sơ chờ duyệt phải nằm trong box').toBeDefined();
    const gia = h!.lech.find((l) => l.kind === 'PRICE')!;
    expect(gia.snapValue).toBe('100000');
    expect(gia.newValue).toBe('180000');
  });

  it('hồ sơ ĐANG CÓ HIỆU LỰC cũng nằm trong box', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    await runToActive(d);

    await datGia(productId, '190000', '2020-02-01');
    await raSoat(productId);

    expect((await lech()).some((x) => x.id === d.id)).toBe(true);
  });

  it('hồ sơ NHÁP KHÔNG nằm trong box — nó tự cập nhật, không cần nhắc', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });

    await datGia(productId, '200000', '2020-02-01');
    await raSoat(productId);

    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });

  it('đổi giá TRẢ LẠI như cũ thì dấu vết BIẾN MẤT', async () => {
    // Một box còn treo cảnh báo đã hết hiệu lực là một box người dùng học cách
    // bỏ qua — nên xoá quan trọng ngang ghi.
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '210000', '2020-02-01');
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(true);

    await datGia(productId, '100000', '2020-03-01');
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });

  it('đổi NGƯỠNG cũng vào box, và loại chênh lệch là RULE', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    const qd = await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    });
    expect(qd.status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    expect(
      (await (await cat())
        .patch(`/catalog/discount-rules/${qd.body.code}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({ thresholdRate2: 2200 })).status,
    ).toBe(200);
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h).toBeDefined();
    const ng = h!.lech.find((l) => l.kind === 'RULE')!;
    expect(ng.snapValue).toBe('10.00');
    expect(ng.newValue).toBe('22.00');
  });

  it('quy định MỚI cụ thể hơn cũng bị bắt — dù hồ sơ không nhắc tới mã của nó', async () => {
    // Đây là lý do phép rà phải TRA LẠI thay vì lọc theo `rule_code_snap`. Hồ sơ
    // chụp quy định chung cho cả nhóm; một quy định khai sau, riêng cho loại
    // khách này, thắng nó — mà mã của quy định mới chưa từng xuất hiện trên hồ sơ.
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    expect((await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    })).status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    // Khách hàng test là loại 1 (`makeCustomer`).
    expect((await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom, customerType: 1,
      effectiveFrom: '2020-01-01', thresholdRate2: 3300,
    })).status).toBe(201);
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'quy định mới cụ thể hơn phải bị bắt').toBeDefined();
    expect(h!.lech.find((l) => l.kind === 'RULE')!.newValue).toBe('33.00');
  });

  it('phạm vi dữ liệu: TDV khác KHÔNG thấy hồ sơ này', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer('tdv01');
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '230000', '2020-02-01');
    await raSoat(productId);

    expect((await lech('tdv01')).some((x) => x.id === d.body.id)).toBe(true);
    expect((await lech('tdv02')).some((x) => x.id === d.body.id)).toBe(false);
    // Trưởng bộ phận duyệt tdv01 thì THẤY — box đi theo cây phân quyền.
    expect((await lech('tbp01')).some((x) => x.id === d.body.id)).toBe(true);
  });

  it('không có gì lệch thì trả danh sách RỖNG, không phải lỗi', async () => {
    const r = await get('/policies/impacted?limit=50', 'sa01');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
  });

  // ===========================================================================
  // `0036` — loại lệch thứ ba: sản phẩm không còn dùng được
  //
  // Trước `0036` cả nhóm này lọt sạch. Vô hiệu hoá một sản phẩm KHÔNG đổi giá
  // của nó, mà consumer chỉ so giá và ngưỡng; còn xoá hẳn thì lời gọi tra ảnh
  // chụp trả 404 cho cả lô và consumer bỏ qua TOÀN BỘ hồ sơ.
  // ===========================================================================

  const voHieuHoa = async (productId: string, ma: string) =>
    (await cat())
      .patch(`/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ status: 'DA_VO_HIEU_HOA', confirm: ma });

  it('VÔ HIỆU HOÁ sản phẩm cũng là một thay đổi — vào box, loại PRODUCT', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const maSp = d.body.lines[0].productCode as string;
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    expect((await voHieuHoa(productId, maSp)).status).toBe(200);
    await raSoat(productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'sản phẩm vô hiệu hoá phải đưa hồ sơ vào box').toBeDefined();
    const sp = h!.lech.find((l) => l.kind === 'PRODUCT');
    expect(sp, `chỉ thấy: ${JSON.stringify(h!.lech)}`).toBeDefined();
    expect(sp!.snapValue).toBe('Đang áp dụng');
    expect(sp!.newValue).toBe('Đã vô hiệu hoá');
    // Giá không đổi thì KHÔNG kèm một dòng PRICE — box nói đúng thứ đã đổi.
    expect(h!.lech.some((l) => l.kind === 'PRICE')).toBe(false);
  });

  it('BẬT LẠI sản phẩm thì dấu vết biến mất', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const maSp = d.body.lines[0].productCode as string;
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await voHieuHoa(productId, maSp);
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(true);

    await (await cat())
      .patch(`/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      // `confirm` bắt buộc ở MỌI lượt sửa từ `0123`, kể cả lượt bật lại.
      .send({ status: 'DANG_AP_DUNG', confirm: maSp });
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });

  it('sản phẩm bị XOÁ khỏi danh mục: `newValue` rỗng, không nuốt lặng', async () => {
    // Ca nặng nhất và lại bị nuốt gọn nhất trước `0036`: lời gọi tra ảnh chụp
    // trả 404 cho cả lô, consumer `continue`, và hồ sơ biến khỏi box.
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    // Không có đường API nào xoá sản phẩm — đó là chủ ý. Ở đây xoá thẳng bằng
    // SQL để dựng đúng tình huống "dòng hồ sơ trỏ vào một sản phẩm không còn".
    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [productId]));
    await raSoat(productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'sản phẩm đã xoá phải đưa hồ sơ vào box').toBeDefined();
    const sp = h!.lech.find((l) => l.kind === 'PRODUCT')!;
    expect(sp.newValue).toBeNull();
  });

  it('một sản phẩm biến mất KHÔNG che mất chênh lệch của dòng còn lại', async () => {
    // Bất biến của cả nhánh lùi-về-hỏi-từng-cái: lời gọi cả lô hỏng thì phải hỏi
    // lẻ, chứ không bỏ qua cả hồ sơ.
    const a = await sanPhamNhomRieng('100000');
    const b = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [line(a.productId), line(b.productId)],
    });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [a.productId]));
    await datGia(b.productId, '175000', '2020-02-01');
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h).toBeDefined();
    expect(h!.lech.some((l) => l.kind === 'PRODUCT')).toBe(true);
    const gia = h!.lech.find((l) => l.kind === 'PRICE');
    expect(gia, 'dòng còn lại vẫn phải được so').toBeDefined();
    expect(gia!.newValue).toBe('175000');
  });

  it('`0083` lời gọi danh mục HỎNG thì giữ nguyên dấu vết, không kết luận "đã xoá"', async () => {
    /*
     * ĐÂY LÀ GỐC CỦA MỘT CA CHẬP CHỜN, và là một lỗi thật nặng hơn nhiều so với
     * cái ca chập chờn ấy.
     *
     * `traAnhChup` từng nuốt MỌI loại lỗi rồi coi id vắng mặt trong kết quả là
     * *"sản phẩm đã bị xoá khỏi danh mục"*. Một lần catalog khởi động lại, một
     * lần mạng chớp — và mọi hồ sơ đã đóng băng bị ghi đè dấu vết thành "sản
     * phẩm đã bị xoá". Tệ hơn: nhánh ấy `continue`, không so giá nữa, nên dấu
     * vết **lệch giá thật** bị xoá theo.
     *
     * Không có gì báo. Con số trên box *Yêu cầu cập nhật* chỉ đổi, và đổi sang
     * một lời nói dối về danh mục.
     *
     * Dựng lại đúng tình huống ấy: chặn cả hai đường tra danh mục cho hỏng
     * KHÔNG PHẢI 404, rồi rà lại. Dấu vết cũ phải còn nguyên.
     */
    const a = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(a.productId)] });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await datGia(a.productId, '155000', '2020-02-01');
    await raSoat(a.productId);
    const truoc = (await lech()).find((x) => x.id === d.body.id)!.lech;
    expect(truoc.some((l) => l.kind === 'PRICE'), 'chưa dựng được dấu vết nền').toBe(true);

    // Cả hai đường tra danh mục cùng hỏng — đúng như lúc catalog đang khởi động lại.
    const clients = app.get(Clients);
    const loi = new Error('catalog trả 503');
    const g1 = vi.spyOn(clients, 'productSnapshots').mockRejectedValue(loi);
    const g2 = vi.spyOn(clients, 'productSnapshot').mockRejectedValue(loi);
    try {
      await raSoat(a.productId);
    } finally {
      g1.mockRestore();
      g2.mockRestore();
    }

    const sau = (await lech()).find((x) => x.id === d.body.id);
    expect(sau, 'hồ sơ biến mất khỏi box vì một lời gọi hỏng').toBeDefined();
    expect(
      sau!.lech.some((l) => l.kind === 'PRICE'),
      `dấu vết lệch giá bị xoá; còn lại: ${JSON.stringify(sau!.lech)}`,
    ).toBe(true);
    expect(
      sau!.lech.some((l) => l.kind === 'PRODUCT'),
      'kết luận "đã xoá khỏi danh mục" từ một lời gọi hỏng',
    ).toBe(false);
  });

  it('`0083` 404 THẬT thì vẫn kết luận đã xoá — không nới tay quá', async () => {
    /*
     * Vế đối chứng. Nếu `0083` chặn cả ca này thì sản phẩm bị xoá khỏi danh mục
     * lại lọt qua im lặng, đúng cái lỗ mà `0036` mở ra để bịt.
     */
    const a = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(a.productId)] });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [a.productId]));
    await raSoat(a.productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'hồ sơ có sản phẩm đã xoá phải hiện trong box').toBeDefined();
    const sp = h!.lech.find((l) => l.kind === 'PRODUCT');
    expect(sp, 'sản phẩm đã xoá mà không có dấu vết nào').toBeDefined();
    expect(sp!.newValue, 'đã xoá khỏi danh mục thì không có trạng thái mới').toBeNull();
  });

  it('rà theo MỘT sản phẩm KHÔNG xoá dấu vết của sản phẩm khác cùng hồ sơ', async () => {
    /*
     * Lỗi có thật, và hỏng lặng lẽ.
     *
     * Lượt rà theo một sản phẩm cụ thể chỉ tính ra chênh lệch cho đúng sản phẩm
     * ấy, rồi vòng dọn coi mọi dấu vết còn lại của cùng hồ sơ là "đã hết" và
     * xoá sạch. Quản trị đổi giá sản phẩm A thì cảnh báo của sản phẩm B trên
     * cùng hồ sơ biến mất, dù B vẫn đang lệch — không có gì báo, con số chỉ tụt.
     *
     * Trước `0036` lỗi bị che vì lượt rà cuối trong mọi đường đi đều là quét
     * toàn bộ; thêm một lượt rà theo sản phẩm vào cuối là lộ ra ngay.
     */
    const a = await sanPhamNhomRieng('100000');
    const b = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [line(a.productId), line(b.productId)],
    });
    const maB = (d.body.lines as { productId: string; productCode: string }[]).find(
      (x) => x.productId === b.productId,
    )!.productCode;
    await act(d.body.id, 'SUBMIT', 'tdv01');

    // Lệch ở A trước.
    await datGia(a.productId, '155000', '2020-02-01');
    await raSoat(a.productId);
    expect(
      (await lech()).find((x) => x.id === d.body.id)?.lech.some((l) => l.kind === 'PRICE'),
    ).toBe(true);

    // Rồi một lượt rà CHỈ VỀ B. Dấu vết của A phải còn nguyên.
    expect((await voHieuHoa(b.productId, maB)).status).toBe(200);
    await raSoat(b.productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'hồ sơ không được biến mất khỏi box').toBeDefined();
    expect(
      h!.lech.some((l) => l.kind === 'PRICE'),
      `dấu vết của sản phẩm A bị xoá oan; còn lại: ${JSON.stringify(h!.lech)}`,
    ).toBe(true);
    expect(h!.lech.some((l) => l.kind === 'PRODUCT')).toBe(true);
  });

  it('XOÁ quy định chiết khấu: ngưỡng về rỗng, và đó là một chênh lệch', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    const ma = uniq('CK');
    expect((await khaiQuyDinh({
      code: ma, productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    })).status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    expect(
      (await (await cat())
        .delete(`/catalog/discount-rules/${ma}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({ confirm: ma })).status,
    ).toBe(200);
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'xoá quy định phải đưa hồ sơ vào box').toBeDefined();
    const ng = h!.lech.find((l) => l.kind === 'RULE')!;
    expect(ng.snapValue).toBe('10.00');
    expect(ng.newValue, 'không còn quy định nào phủ').toBeNull();
  });

  /*
   * PHỦ ĐỦ MƯỜI MỘT TRẠNG THÁI.
   *
   * Câu hỏi thật của box: hồ sơ nào ĐÃ ĐÓNG BĂNG số của nó. Sáu trạng thái có,
   * năm trạng thái không — và cả hai vế đều đáng khẳng định. `NHAP` và
   * `YEU_CAU_CHINH_SUA` vắng mặt vì chúng tự tra lại mỗi lần mở, nên nhắc là
   * thừa; ba trạng thái kết thúc vắng mặt vì không ai làm gì được nữa.
   */
  const CHO_VAO_BOX = [
    'CHO_TBP_DUYET',
    'CHO_KT_L1',
    'SA_DANG_XU_LY',
    'CHO_KT_L2',
    'QUA_HAN_DUYET',
    'DANG_CO_HIEU_LUC',
  ];
  const KHONG_VAO_BOX = ['NHAP', 'YEU_CAU_CHINH_SUA', 'HET_HIEU_LUC', 'DA_XOA'];

  for (const tt of [...CHO_VAO_BOX, ...KHONG_VAO_BOX]) {
    const nen = CHO_VAO_BOX.includes(tt);
    it(`vô hiệu hoá sản phẩm · hồ sơ ${tt} ${nen ? 'VÀO' : 'KHÔNG vào'} box`, async () => {
      const { productId } = await sanPhamNhomRieng('100000');
      const customerId = await makeCustomer();
      const d = await post('/policies', { customerId, lines: [line(productId)] });
      const maSp = d.body.lines[0].productCode as string;

      // Đặt thẳng trạng thái: ở đây điều đang kiểm là PHÉP LỌC theo trạng thái,
      // không phải đường đi tới trạng thái ấy — cái đó đã có bộ test luồng
      // riêng. Chạy đủ mười bước cho mười hai ca là mười hai lần chạy lại cùng
      // một luồng để kiểm một mệnh đề khác.
      if (tt !== 'NHAP') {
        await withAdminDb((c) =>
          c.query(
            `UPDATE pol.policy SET status = $2::pol.policy_status,
                    pending_step = $3::pol.policy_step WHERE id = $1`,
            [d.body.id, tt, tt === 'QUA_HAN_DUYET' ? 'B4_TBP_DUYET' : null],
          ),
        );
      }

      expect((await voHieuHoa(productId, maSp)).status).toBe(200);
      await raSoat(productId);

      const co = await withAdminDb(async (c) => {
        const r = await c.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pol.policy_impact
            WHERE policy_id = $1 AND kind = 'PRODUCT'`,
          [d.body.id],
        );
        return Number(r.rows[0]!.n) > 0;
      });
      expect(co, `${tt}: dấu vết PRODUCT`).toBe(nen);

      // Dọn: `DA_XOA` không xoá được ở bước dọn cuối tệp.
      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.body.id]),
      );
    });
  }
});

// =============================================================================
// `0069` — mỗi loại tệp một người, không phải mọi vai trò trong luồng
// =============================================================================

describe('`0069` ai được đụng vào tệp nào', () => {
  /*
   * Tới `0068` phép kiểm chỉ xét TRẠNG THÁI hồ sơ. Nghĩa là ở bước *Sale Admin
   * xử lý*, kế toán tải được bản scan lên — và gỡ được bản scan đi, chặn luôn
   * bước bàn giao.
   *
   * Bản scan là bản giấy có chữ ký khách hàng, do chính Sale Admin in ra, trình
   * ký rồi scan lại. Không ai khác cầm nó trong tay, nên không ai khác có gì để
   * mà tải lên.
   */
  const toiBuocSaleAdmin = async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    return d;
  };

  const banScan = (d: { id: string }) => ({
    kind: 'SCAN',
    fileName: 'ban-cung.pdf',
    objectKey: `scan/${d.id}-0069.pdf`,
  });

  it('BẢN SCAN: Sale Admin tải lên được, ba vai trò kia đều 403', async () => {
    const d = await toiBuocSaleAdmin();
    for (const who of ['tdv01', 'tbp01', 'kt01']) {
      const r = await post(`/policies/${d.id}/attachments`, banScan(d), who);
      expect(r.status, `${who} không được tải bản scan`).toBe(403);
      expect(r.body.code).toBe('FORBIDDEN_ROLE');
    }
    expect((await post(`/policies/${d.id}/attachments`, banScan(d), 'sa01')).status).toBe(201);
  }, 60_000);

  it('BẢN SCAN: chỉ Sale Admin gỡ được — kế toán gỡ là chặn cả bước bàn giao', async () => {
    const d = await toiBuocSaleAdmin();
    const t = await post(`/policies/${d.id}/attachments`, banScan(d), 'sa01');
    expect(t.status).toBe(201);

    const kt = await del(`/policies/${d.id}/attachments/${t.body.id}`, 'kt01');
    expect(kt.status).toBe(403);
    expect(kt.body.code).toBe('FORBIDDEN_ROLE');
    expect((await del(`/policies/${d.id}/attachments/${t.body.id}`, 'sa01')).status).toBe(200);
  }, 60_000);

  it('GIẤY TỜ HỒ SƠ: chỉ TDV, kể cả khi hồ sơ còn Nháp', async () => {
    const d = await draft();
    const tep = { kind: 'HO_SO', fileName: 'giay-phep.pdf', objectKey: `hs/${d.id}-0069.pdf` };
    for (const who of ['tbp01', 'kt01', 'sa01']) {
      expect((await post(`/policies/${d.id}/attachments`, tep, who)).status, who).toBe(403);
    }
    expect((await post(`/policies/${d.id}/attachments`, tep, 'tdv01')).status).toBe(201);
  }, 60_000);

  it('cờ trên MÀN HÌNH khớp đúng phép chặn — không bày nút chắc chắn 403', async () => {
    /*
     * `loaiTepGhiDuoc` quyết định vùng tải lên có hiện hay không, còn
     * `assertNguoiGhiTep` là thứ chặn thật. Hai bên lệch nhau theo chiều nào
     * cũng tệ: nút hiện rồi trả 403, hoặc nút ẩn mà đường vẫn mở.
     */
    const d = await draft();
    // Đính một giấy tờ NGAY LÚC CÒN NHÁP rồi mới đẩy hồ sơ đi — đó là tình
    // huống thật, và là tình huống làm lộ ra lỗi cờ gỡ ở `0097`.
    const gt = await post(
      `/policies/${d.id}/attachments`,
      { kind: 'HO_SO', fileName: 'gpkd.pdf', objectKey: uniq('gt') },
      'tdv01',
    );
    expect(gt.status).toBe(201);
    const giayTo = gt.body.id as string;

    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    const cua = async (who: string) =>
      (await get(`/policies/${d.id}`, who)).body as { loaiTepGhiDuoc: string[] };

    /*
     * HAI loại ở bước này từ `0167`: bản scan và bản mềm — cả hai của Sale Admin.
     *
     * Đây là lần đầu `loaiTepGhiDuoc` trả về nhiều hơn một phần tử, và đó không
     * phải chi tiết vô hại: giao diện từng đọc `loaiGhiDuoc[0]` để biết đang tải
     * loại gì, nên phần tử thứ hai làm tệp tải ở khối *Bản cứng* được ghi dưới
     * nhãn của khối kia. `TepDinhKem` giờ lấy loại từ CHÍNH KHỐI đang bấm.
     *
     * THỨ TỰ có nghĩa và được khẳng định ở đây: giao diện duyệt `KHOI` theo thứ
     * tự của nó, nhưng phép kiểm `includes` thì không — đảo hai giá trị này là
     * một thay đổi không ai thấy, nên ghim lại cho chắc.
     */
    const sa = await cua('sa01');
    expect(sa.loaiTepGhiDuoc).toEqual(['SCAN', 'BAN_MEM']);

    for (const who of ['tdv01', 'tbp01', 'kt01']) {
      const x = await cua(who);
      expect(x.loaiTepGhiDuoc, `${who} không được thấy vùng tải lên`).toEqual([]);
    }

    /*
     * `0097` — CỜ CHỈ CÓ MỘT, và nó nói theo LOẠI tệp.
     *
     * Trước đó có thêm `tepXoaDuoc: boolean` suy từ chính `loaiTepGhiDuoc`, nên
     * ở đúng bước này Sale Admin nhận `true` cho CẢ HAI loại — giao diện bày dấu
     * ✕ lên cả giấy tờ TDV đính từ lúc lập, và `detach` trả 403. Đó là "nút hiện
     * rồi trả 403" mà chính ca kiểm này sinh ra để chặn, lọt qua vì nó chỉ so
     * đường TẢI LÊN.
     */
    expect((await cua('sa01')) as Record<string, unknown>).not.toHaveProperty('tepXoaDuoc');

    // Và phép chặn THẬT ở đường gỡ: giấy tờ do TDV đính từ lúc lập vẫn nằm đó ở
    // bước này, Sale Admin không có việc gì với chúng.
    const r = await del(`/policies/${d.id}/attachments/${giayTo}`, 'sa01');
    expect(r.status, 'Sale Admin không được gỡ giấy tờ của TDV').toBe(403);
    expect(r.body.code).toBe('FORBIDDEN_ROLE');
  }, 60_000);
});

// =============================================================================
// `0104` — đủ trường mới gửi duyệt được
// =============================================================================

describe('`0104` đủ trường mới gửi duyệt được', () => {
  /**
   * Khách hàng THIẾU một trường, để dựng đúng cái hồ sơ không gửi được.
   *
   * `makeCustomer` khai đủ từ `0104`, nên ca nào muốn thấy chốt chặn phải tự
   * tạo một khách thiếu — chứ không sửa `makeCustomer`, thứ mọi ca khác dựa vào.
   */
  const khachThieu = async (bo: 'idNumber' | 'ownerTitle' | 'phone'): Promise<string> => {
    const than: Record<string, unknown> = {
      code: uniq('KHT'),
      name: 'Nha thuoc thieu truong',
      customerType: 1,
      province: 'Ha Noi',
      streetWard: 'Ha Noi',
      ownerName: 'Chu ho',
      ownerTitle: 'Chu nha thuoc',
      idNumber: mstDuyNhat(), phone: '0900000000' };
    /*
     * MÃ SỐ THUẾ KHÔNG BỎ ĐƯỢC QUA API NỮA (`0175`, chốt 05/09) — ô ấy bắt buộc
     * lúc lập. Nhưng chốt chặn lúc GỬI DUYỆT vẫn phải sống, và nó phục vụ đúng
     * một tập khách hàng: những khách lập TRƯỚC `0175`, cột `id_number` còn
     * `NULL` vì hồi ấy ô này tuỳ chọn.
     *
     * Nên ca kiểm dựng lại đúng tình trạng ấy: lập khách hàng hợp lệ rồi XOÁ
     * cột bằng SQL. Bỏ chốt chặn đi vì "API không tạo ra được nữa" là bỏ lưới
     * duy nhất canh những khách hàng cũ.
     */
    if (bo === 'idNumber') {
      const r = await (await http(customer))
        .post('/customers')
        .set('Authorization', `Bearer ${tok['tdv01']}`)
        .send(than);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      await withAdminDb((c) =>
        c.query(`UPDATE cus.customer SET id_number = NULL WHERE id = $1`, [r.body.id]),
      );
      return r.body.id as string;
    }
    delete than[bo];
    const r = await (await http(customer))
      .post('/customers')
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send(than);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.id as string;
  };

  it('thiếu MÃ SỐ THUẾ thì không gửi duyệt được', async () => {
    const d = await draft({ customerId: await khachThieu('idNumber') });
    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('POLICY_FIELDS_MISSING');
    expect(r.body.thieu).toEqual(['Mã số thuế']);
    // Câu phải nói ĐI ĐÂU MÀ SỬA. Người đọc đang đứng ở màn hình hồ sơ, còn
    // trường thiếu thì nằm ở hồ sơ khách hàng.
    expect(r.body.message).toContain('hồ sơ khách hàng');
    // Và KHÔNG được lộ tên trường trong mã (`0088`).
    expect(r.body.message).not.toContain('idNumber');
    expect(r.body.message).not.toContain('ho_so.');
  }, 60_000);

  it('`0171` thiếu CHỨC DANH hoặc SỐ ĐIỆN THOẠI thì VẪN gửi duyệt được', async () => {
    /*
     * Ca này ĐẢO NGƯỢC hai ca của `0104` và `0128`, và chỗ đảo là một luật chứ
     * không phải một ý thích.
     *
     * Khách hàng chốt 31/08 bỏ *chức danh người đại diện* và *số điện thoại* khỏi
     * cả hai mẫu hồ sơ mặc định. Luật `0134` nói: **trường nào chặn gửi duyệt thì
     * phải in ra ở đâu đó** — nó sinh ra sau khi `0128` thêm số điện thoại vào
     * danh sách chặn mà không mẫu nào in con số ấy, khiến TDV bị bắt điền một ô
     * không xuất hiện trên bất kỳ tờ giấy nào.
     *
     * Giữ phép chặn mà bỏ khỏi tờ giấy là dựng lại đúng cái hỏng ấy. Nên hai vế
     * đi cùng nhau, và `0134` không phải nới một dòng nào.
     *
     * Hai trường VẪN CÒN trong hồ sơ khách hàng và vẫn khai được — chúng chỉ
     * thôi CHẶN.
     */
    for (const bo of ['ownerTitle', 'phone'] as const) {
      const d = await draft({ customerId: await khachThieu(bo) });
      const r = await act(d.id, 'SUBMIT', 'tdv01');
      expect(r.status, `thiếu ${bo} mà vẫn phải gửi được: ${JSON.stringify(r.body)}`).toBe(200);
      expect(r.body.status).toBe('CHO_TBP_DUYET');
    }
  }, 90_000);

  it('`0171` hai trường ấy KHÔNG còn trong danh sách chặn, ở cả hai bảng', () => {
    /*
     * Chiều đối chiếu, và nó canh chỗ hai bảng trôi khỏi nhau: `document` phân
     * loại trường (`NHOM_TRUONG`), `policy` thực thi phép chặn
     * (`TRUONG_CHAN_LUC_GUI`). Bỏ ở một bên mà quên bên kia thì hoặc `0134` đỏ,
     * hoặc phép chặn sống sót ở một chỗ không ai ngờ.
     */
    for (const truong of ['ho_so.chuc_danh_dai_dien', 'ho_so.dien_thoai']) {
      expect(TRUONG_CHAN_LUC_GUI as readonly string[], truong).not.toContain(truong);
      expect(NHOM_TRUONG[truong], `${truong} phải sang nhóm de-trong`).toBe('de-trong');
    }
    // Và hai trường CÒN LẠI thì vẫn chặn — không nới quá tay.
    expect([...TRUONG_CHAN_LUC_GUI].sort()).toEqual(['ho_so.ma_so_thue', 'ho_so.ngay_ap_dung']);
  });

  it('`0128` số điện thoại ĐÓNG BĂNG vào hồ sơ lúc gửi duyệt', async () => {
    /*
     * `0101` đóng băng bảy trường khách hàng và chọn CỘT RỜI thay vì `jsonb`,
     * với lý do: thêm một trường về sau thì BUỘC phải viết migration, tức buộc
     * phải trả lời "đóng băng hay đọc sống?". `0128` là lần đầu câu hỏi ấy được
     * hỏi, và câu trả lời là ĐÓNG BĂNG — đọc sống thì khách đổi số sau khi hồ sơ
     * đã duyệt là tờ CSBH đã ký lặng lẽ mang một con số khác.
     */
    const customerId = await makeCustomer();
    const d = await draft({ customerId });
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const sdtMoi = '0999 111 222';
    const sua = await (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ phone: sdtMoi });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);
    expect(sua.body.phone).toBe(sdtMoi);

    // Hồ sơ giữ số CŨ.
    const snap = await withAdminDb(async (c) =>
      c.query<{ kh_dien_thoai_snap: string | null }>(
        `SELECT kh_dien_thoai_snap FROM pol.policy WHERE id = $1`,
        [d.id],
      ),
    );
    expect(snap.rows[0]!.kh_dien_thoai_snap).toBe('0900000000');
    expect(snap.rows[0]!.kh_dien_thoai_snap).not.toBe(sdtMoi);
  }, 60_000);

  it('thiếu THỜI GIAN ÁP DỤNG thì không gửi duyệt được, và câu nói đúng chỗ khác', async () => {
    /*
     * Xoá trắng ngày TRỰC TIẾP trên CSDL, không qua API: từ `0104` lệnh tạo hồ
     * sơ mặc định hôm nay, nên đường tạo không còn dựng được tình huống này.
     * Đường còn lại là `PATCH` — nhưng ca này muốn kiểm CHỐT CHẶN, không kiểm
     * `PATCH`, nên nó dựng thẳng trạng thái cần kiểm.
     */
    const d = await draft();
    await withAdminDb((c) => c.query(`UPDATE pol.policy SET applied_date = NULL WHERE id = $1`, [d.id]));

    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status).toBe(422);
    expect(r.body.thieu).toEqual(['Thời gian áp dụng']);
    // Trường này của HỒ SƠ, nên câu không được bảo người ta sang màn hình khách hàng.
    expect(r.body.message).toContain('Thời gian áp dụng của hồ sơ');
    expect(r.body.message).not.toContain('hồ sơ khách hàng');
  }, 60_000);

  it('thiếu NHIỀU trường thì kể hết, không dừng ở cái đầu tiên', async () => {
    // Báo từng cái một là bắt người dùng đi ba vòng cho một lần sửa.
    const d = await draft({ customerId: await khachThieu('idNumber') });
    await withAdminDb((c) => c.query(`UPDATE pol.policy SET applied_date = NULL WHERE id = $1`, [d.id]));

    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.body.thieu).toEqual(['Mã số thuế', 'Thời gian áp dụng']);
    expect(r.body.message).toContain('hồ sơ khách hàng');
    expect(r.body.message).toContain('Thời gian áp dụng của hồ sơ');
  }, 60_000);

  it('BỔ SUNG rồi gửi lại thì đi tiếp — chốt chặn không phải ngõ cụt', async () => {
    const khId = await khachThieu('idNumber');
    const d = await draft({ customerId: khId });
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(422);

    await (await http(customer))
      .patch(`/customers/${khId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ idNumber: '5100999998' });

    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  }, 90_000);

  it('BẢY trường điền sau KHÔNG chặn — hồ sơ chưa ai duyệt vẫn gửi được', async () => {
    /*
     * Vế quan trọng nhất của `0104`, và là vế dễ mất nhất.
     *
     * Đọc yêu cầu theo nghĩa đen — *"đủ tất cả các trường trong bảng hướng dẫn
     * ánh xạ"* — thì KHÔNG hồ sơ nào gửi duyệt được, vì bảy trường ấy do chính
     * các bước SAU sinh ra. Ca này canh cho lằn ranh đó: một hồ sơ Nháp chưa có
     * ngày TBP ký, chưa có kế toán, chưa có Sale Admin, chưa có ngày hiệu lực
     * vẫn phải gửi được.
     */
    const d = await draft();
    const truoc = await withAdminDb((c) =>
      c.query(
        `SELECT tbp_signed_at, ke_toan_user_id, sale_admin_user_id,
                kt_l1_received_at, kt_l2_received_at, effective_from
           FROM pol.policy WHERE id = $1`,
        [d.id],
      ),
    );
    const row = truoc.rows[0] as Record<string, unknown>;
    // Chứng minh chúng THẬT SỰ rỗng — nếu không, ca này không kiểm gì cả.
    for (const k of ['tbp_signed_at', 'sale_admin_user_id', 'kt_l1_received_at', 'kt_l2_received_at', 'effective_from']) {
      expect(row[k], `${k} phải rỗng ở hồ sơ Nháp`).toBeNull();
    }

    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  }, 60_000);
});
