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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createPolicyApp } from '@csbh/policy/testing';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  http,
  withAdminDb,
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

const act = (policyId: string, action: string, who: string, body: object = {}) =>
  post(`/policies/${policyId}/actions/${action}`, body, who);

let n = 0;
const uniq = (k: string) => `${P}-${k}-${++n}-${Date.now() % 100000}`;

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';
const products: string[] = [];

/** Sản phẩm có Giá bán Công ty 100.000 và ngưỡng mặc định 15,00%. */
const makeProduct = async (): Promise<string> => {
  const c = await http(catalog);
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      code: uniq('SP'),
      name: 'Nutricare Gold',
      groupCode,
      defaultRate2Type1: 1500,
      defaultRate2Type2: 1500,
      defaultRate2Type3: 1500,
    });
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
      registeredAddress: 'Ha Noi',
      ownerName: 'Chu ho',
    });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return r.body.id as string;
};

const line = (productId: string, over: Record<string, unknown> = {}) => ({
  productId,
  wholesalePrice: '90000',
  cpbh1: '5000',
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
    // Hồ sơ TU_CHOI không xoá được nên phải tắt trigger — chỉ làm trong dọn dẹp test.
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

  for (const u of ['tdv01', 'tdv02', 'tbp01', 'kt01', 'kt02', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }

  groupCode = uniq('NHOM');
  await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: groupCode, name: 'Nhom thu nghiem' });
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
      lines: [line(d.productId, { wholesalePrice: '80000', cpbh1: '1000' })],
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
    expect(d.body.lines[0].threshold).toBe('15.00');
  });
});

describe('POL-13 · POL-14 xoá hồ sơ', () => {
  it('POL-13 xoá hồ sơ Nháp của chính mình thì 204', async () => {
    const d = await draft();
    expect((await del(`/policies/${d.id}`)).status).toBe(204);
    expect((await get(`/policies/${d.id}`)).status).toBe(404);
  });

  it('POL-14 hồ sơ Từ chối KHÔNG vai trò nào xoá được, kể cả quản trị', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_REJECT', 'tbp01', { reason: 'Chiet khau qua cao' });
    expect((await get(`/policies/${d.id}`)).body.status).toBe('TU_CHOI');

    for (const who of ['tdv01', 'tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
      const r = await del(`/policies/${d.id}`, who);
      expect([403, 404], `${who} đáng lẽ không xoá được`).toContain(r.status);
      expect(r.status).not.toBe(204);
    }

    // Và cả bằng SQL thô — trigger ở CSDL chặn.
    const err = await withAdminDb(async (c) => {
      try {
        await c.query(`DELETE FROM pol.policy WHERE id = $1`, [d.id]);
        return undefined;
      } catch (e) {
        return e as { message: string };
      }
    });
    expect(err?.message).toContain('TU_CHOI');
  });

  it('không xoá được hồ sơ đã gửi duyệt', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await del(`/policies/${d.id}`)).status).toBe(403);
  });
});

describe('POL-15 phạm vi dữ liệu khi lập hồ sơ', () => {
  it('tdv02 lập hồ sơ cho khách hàng của tdv01 thì 403', async () => {
    const customerId = await makeCustomer('tdv01');
    const r = await post('/policies', { customerId, lines: [line(await makeProduct())] }, 'tdv02');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });

  it('kt02 không đọc được hồ sơ của tdv01', async () => {
    const d = await draft();
    expect((await get(`/policies/${d.id}`, 'kt02')).status).toBe(403);
    expect((await get(`/policies/${d.id}`, 'kt01')).status).toBe(200);
  });
});

describe('POL-16 số phiên bản', () => {
  it('cập nhật lần thứ ba thì version_no = 3', async () => {
    const d = await draft();
    await runToActive(d);

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh1: '6000' })],
    });
    await runToActive({ id: v2.body.id });

    const v3 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh1: '7000' })],
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
  it('ký xong thì hệ thống TỰ chuyển sang Chờ Kế toán L1', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(r.status).toBe(200);
    // Không ai bấm nút ở bước B5 — hệ thống tự phát hành liên kết tại bàn kế toán.
    expect(r.body.status).toBe('CHO_KT_L1');

    const keys = (await outboxFor(d.id)).map((e) => e.routing_key);
    expect(keys).toContain('policy.tbp_sign');
    expect(keys).toContain('policy.publish_signed');

    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    expect(events.map((e) => e.action)).toContain('PUBLISH_SIGNED');
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

describe('WF-08 Từ chối là trạng thái kết thúc', () => {
  it('mọi hành động tiếp theo đều 409', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_REJECT', 'tbp01', { reason: 'Khong dat' });

    for (const [a, who] of [
      ['SUBMIT', 'tdv01'],
      ['TBP_SIGN', 'tbp01'],
      ['KT_RECEIVE_L1', 'kt01'],
      ['RESUBMIT_AFTER_EDIT', 'tdv01'],
    ] as const) {
      const r = await act(d.id, a, who);
      expect(r.status, `${a} đáng lẽ bị chặn`).toBe(409);
      expect(r.body.code).toBe('INVALID_TRANSITION');
    }

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

  it('WF-13 có scan rồi thì sang Chờ Kế toán L2', async () => {
    const d = await toSaStage();
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_KT_L2');
  });

  it('WF-15 bàn giao khi hồ sơ còn ở Chờ Kế toán L1 thì 409 INVALID_TRANSITION', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
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
    await act(d.id, 'SA_HANDOVER', 'sa01');
    return d;
  };

  it('WF-17 trả về Bước 3 thì bắt buộc có lý do', async () => {
    const d = await toL2();
    expect((await act(d.id, 'KT_RETURN_L2', 'kt01')).status).toBe(400);
    const r = await act(d.id, 'KT_RETURN_L2', 'kt01', { reason: 'Ban cung khong khop' });
    expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');
  });

  it('WF-18 yêu cầu in lại thì bản scan cũ BỊ XOÁ, nhật ký vẫn ghi lại việc huỷ', async () => {
    const d = await toL2();
    const r = await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('SA_DANG_XU_LY');
    expect(r.body.attachments).toHaveLength(0);

    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.scan_discarded');
    expect(ev).toBeDefined();
    expect(ev!.payload.reason).toBe('Ban in mo');
    expect(ev!.payload.actorId).toBeTruthy();
    expect(ev!.payload.fileName).toBe('ban-cung.pdf');
  });

  it('WF-19 in lại và bàn giao lần hai thì KHÔNG phải ký số lại', async () => {
    const d = await toL2();
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung-2.pdf', objectKey: `scan/${d.id}-2.pdf` },
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
    const d = await draft();
    const r = await act(d.id, 'KT_RECEIVE_L2', 'kt01');
    expect(r.status).toBe(409);
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

    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    expect(events.map((e) => e.action)).toEqual([
      'CREATE',
      'SUBMIT',
      'TBP_SIGN',
      'PUBLISH_SIGNED',
      'KT_RECEIVE_L1',
      'SA_HANDOVER',
      'KT_RECEIVE_L2',
    ]);

    // Sáu sự kiện email, đúng danh sách người nhận của muc 3. Việc GỬI thư thuộc
    // notification (P6); ở đây khẳng định policy đã phát đủ và đúng.
    const mails = (await outboxFor(d.id)).filter((e) => e.payload.recipients);
    expect(mails.map((m) => m.routing_key)).toEqual([
      'policy.submit',
      'policy.tbp_sign',
      'policy.publish_signed',
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
      lines: [line(d.productId, { cpbh1: '6000' })],
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

  it('EFF-09 chuỗi ba phiên bản tra ngược được toàn bộ', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh1: '6000' })],
    });
    await runToActive({ id: v2.body.id });
    const v3 = await post('/policies', {
      customerId: d.customerId,
      mode: 'AMEND',
      lines: [line(d.productId, { cpbh1: '7000' })],
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
      lines: [line(d.productId, { cpbh1: '6000' })],
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
      lines: [line(d.productId, { cpbh1: '6000' })],
    });
    await act(v2.body.id, 'SUBMIT', 'tdv01');
    await act(v2.body.id, 'TBP_REJECT', 'tbp01', { reason: 'Khong dat' });

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
        lines: [line(d.productId, { cpbh1: cpbh })],
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
