/**
 * RPT-01 … RPT-14 — bộ lọc 14 tiêu chí, ba báo cáo, xuất Excel.
 *
 * Read-model dựng từ sự kiện thật: hồ sơ được lập qua API policy, sự kiện đi qua
 * outbox lên RabbitMQ, consumer của reporting đọc lại nguồn rồi ghi dòng phẳng.
 * Không có bước nào bị giả lập, nên test bắt được cả lỗi khai báo hàng đợi lẫn
 * lỗi phạm vi dữ liệu — hai chỗ hỏng trong im lặng.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PolicyOutbox } from '@csbh/policy/testing';
import { CustomerOutbox } from '@csbh/customer/testing';
import {
  createTestApp as createReportingApp,
  COLUMNS,
  FILTER_KEYS,
  norm,
  SyncService,
} from '@csbh/reporting/testing';
import { Bus, BUS } from '@csbh/bus';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  bootPolicyListening,
  clearAccountCache,
  clearSavedFilters,
  clearScopeCache,
  http,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZRPT';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let reporting: INestApplication;
let outbox: PolicyOutbox;
let cusOutbox: CustomerOutbox;
let sync: SyncService;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
const userId: Record<string, string> = {};

let n = 0;
const uniq = (k: string) => `${P}-${k}-${++n}-${Date.now() % 100000}`;

const ppost = async (path: string, body: object, who: string) =>
  (await http(policy)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const act = (id: string, action: string, who: string, body: object = {}) =>
  ppost(`/policies/${id}/actions/${action}`, body, who);

const rget = async (path: string, who = 'tdv01') =>
  (await http(reporting)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const rpost = async (path: string, body: object, who = 'tdv01') =>
  (await http(reporting)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const rput = async (path: string, body: object, who = 'tdv01') =>
  (await http(reporting)).put(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

/** Bơm outbox rồi chờ read-model có đủ những hồ sơ đã nêu. */
async function flushSync(policyIds: string[], timeoutMs = 20_000): Promise<void> {
  await outbox.pumpOnce();
  await cusOutbox.pumpOnce();
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = await withAdminDb(async (c) => {
      const r = await c.query<{ policy_id: string }>(
        `SELECT policy_id FROM rpt.policy_row WHERE policy_id = ANY($1::uuid[])`,
        [policyIds],
      );
      return r.rows;
    });
    if (rows.length >= policyIds.length) return;
    if (Date.now() >= until) {
      throw new Error(`read-model mới có ${rows.length}/${policyIds.length} hồ sơ`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Đọc thẳng một dòng read-model — dùng để so với nguồn. */
const rptRow = (id: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<Record<string, unknown>>(
      `SELECT * FROM rpt.policy_row WHERE policy_id = $1`,
      [id],
    );
    return r.rows[0];
  });

// --- Dữ liệu nền -------------------------------------------------------------

let groupA = '';
let groupB = '';
/** `!` vì bốn mã danh mục dưới đây luôn được dựng xong trong `beforeAll`. */
const province = (k: 'HN' | 'DN'): string => provinces[k]!;
const provinces: Record<string, string> = {};
let hospitalCode = '';
let channelCode = '';

const cpost = async (path: string, body: object, who = 'admin01') =>
  (await http(catalog)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

async function makeProduct(name: string, groupCode: string): Promise<string> {
  const r = await cpost('/catalog/products', {
    code: uniq('SP'),
    name,
    groupCode,
    defaultRate2Type1: 3000,
    defaultRate2Type2: 3000,
    defaultRate2Type3: 3000,
  });
  if (r.status !== 201) throw new Error(`tạo sản phẩm hỏng: ${JSON.stringify(r.body)}`);
  await cpost(`/catalog/products/${r.body.id}/prices`, {
    priceType: 'GIA_BAN_CONG_TY',
    amount: '100000',
    effectiveFrom: '2020-01-01',
  });
  return r.body.id as string;
}

type CustomerOpts = {
  name?: string;
  address?: string;
  taxId?: string;
  provinceCode?: string;
  hospitalCode?: string;
  channelCode?: string;
  who?: string;
};

async function makeCustomer(o: CustomerOpts = {}): Promise<{ id: string; code: string }> {
  const code = uniq('KH');
  const r = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok[o.who ?? 'tdv01']}`)
    .send({
      code,
      name: o.name ?? 'Nhà thuốc Minh Châu',
      customerType: 1,
      registeredAddress: o.address ?? 'Số 8 Tôn Thất Thuyết, Hà Nội',
      ownerName: 'Trần Thị Mỹ Hạnh',
      ...(o.taxId ? { idNumber: o.taxId } : {}),
      ...(o.provinceCode ? { provinceCode: o.provinceCode } : {}),
      ...(o.hospitalCode ? { hospitalCode: o.hospitalCode } : {}),
      ...(o.channelCode ? { channelCode: o.channelCode } : {}),
    });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, code };
}

type PolicyOpts = CustomerOpts & {
  productName?: string;
  groupCode?: string;
  appliedDate?: string;
};

/** Hồ sơ ở trạng thái Nháp, đã có mặt trong read-model. */
async function draft(o: PolicyOpts = {}): Promise<{ id: string; customerCode: string }> {
  const cus = await makeCustomer(o);
  const productId = await makeProduct(o.productName ?? 'Nutricare Gold', o.groupCode ?? groupA);
  const r = await ppost(
    '/policies',
    {
      customerId: cus.id,
      ...(o.appliedDate ? { appliedDate: o.appliedDate } : {}),
      lines: [{ productId, wholesalePrice: '90000', cpbh1: '3000' }],
    },
    o.who ?? 'tdv01',
  );
  if (r.status !== 201) throw new Error(`lập hồ sơ hỏng: ${JSON.stringify(r.body)}`);
  await flushSync([r.body.id]);
  return { id: r.body.id as string, customerCode: cus.code };
}

/** Hồ sơ đã đi hết 10 bước — đang có hiệu lực, có `approved_at`. */
async function activated(o: PolicyOpts = {}): Promise<string> {
  const d = await draft(o);
  const who = o.who ?? 'tdv01';
  expect((await act(d.id, 'SUBMIT', who)).status).toBe(200);
  expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
  expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
  // Bản scan phải có TRƯỚC khi bàn giao, không phải sau: không có scan thì
  // SA_HANDOVER trả 409 SCAN_REQUIRED (WF-14).
  expect(
    (
      await ppost(
        `/policies/${d.id}/attachments`,
        { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: uniq('scan') },
        'sa01',
      )
    ).status,
  ).toBe(201);
  expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
  expect((await act(d.id, 'KT_RECEIVE_L2', 'kt01')).status).toBe(200);
  await flushSync([d.id]);
  return d.id;
}

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();
  for (const u of ['tdv01', 'tdv02', 'tdv03', 'tbp01', 'kt01', 'kt02', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }
  await withAdminDb(async (c) => {
    const r = await c.query<{ id: string; username: string }>(
      `SELECT id, username FROM idn.app_user WHERE username = ANY($1::text[])`,
      [['tdv01', 'tdv02', 'tdv03', 'kt01', 'sa01']],
    );
    for (const u of r.rows) userId[u.username] = u.id;
  });

  const c = await bootCatalogListening();
  catalog = c.app;
  restores.push(c.restore);
  const cu = await bootCustomerListening();
  customer = cu.app;
  restores.push(cu.restore);

  // policy phải NGHE THẬT: consumer của reporting đọc lại nguồn qua
  // `/internal/policies/:id`, nên không có `POLICY_URL` thì mọi lần đồng bộ đều
  // hỏng và read-model rỗng — đúng cách hỏng mà file test này phải bắt được.
  const po = await bootPolicyListening();
  policy = po.app;
  restores.push(po.restore);
  outbox = policy.get(PolicyOutbox);
  cusOutbox = customer.get(CustomerOutbox);

  // Bắt đầu từ hàng đợi RỖNG. Các file test khác đã phát hàng trăm sự kiện mà
  // queue của reporting vừa được khai báo lần đầu ở lượt chạy này; tiêu thụ hết
  // chỗ tồn đọng đó làm mọi phép đếm dưới đây lẫn dữ liệu của người khác.
  const purge = new Bus();
  await purge.declareConsumer(
    BUS.queues.reporting,
    BUS.queues.reportingDlq,
    BUS.bindings.reporting,
  );
  const ch = await purge.channel();
  await ch.purgeQueue(BUS.queues.reporting);
  await purge.close();
  await withAdminDb(async (db) => {
    await db.query(`UPDATE pol.outbox SET published_at = now() WHERE published_at IS NULL`);
    await db.query(`UPDATE cus.outbox SET published_at = now() WHERE published_at IS NULL`);
    await db.query(`DELETE FROM rpt.policy_row`);
    await db.query(`DELETE FROM rpt.export_job`);
  });

  reporting = await createReportingApp();
  sync = reporting.get(SyncService);

  const ga = await cpost('/catalog/product-groups', { code: uniq('NHOM'), name: 'Sua bot' });
  groupA = ga.body.code as string;
  const gb = await cpost('/catalog/product-groups', { code: uniq('NHOM'), name: 'Dinh duong' });
  groupB = gb.body.code as string;

  for (const [key, name] of [
    ['HN', 'Hà Nội'],
    ['DN', 'Đà Nẵng'],
  ] as const) {
    const code = uniq(key);
    await cpost(`/catalog/lookups/province`, { code, name });
    provinces[key] = code;
  }
  hospitalCode = uniq('BV');
  await cpost(`/catalog/lookups/hospital`, { code: hospitalCode, name: 'Bệnh viện Bạch Mai' });
  channelCode = uniq('KENH');
  await cpost(`/catalog/lookups/channel`, { code: channelCode, name: 'Nhà thuốc' });
}, 180_000);

afterAll(async () => {
  await reporting?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
});

beforeEach(async () => {
  await clearSavedFilters();
});

// =============================================================================
// RPT-14 — read-model bám kịp nguồn, và màn hình quan trọng KHÔNG đọc từ nó
// =============================================================================

describe('RPT-14 read-model trễ hơn nguồn nhưng hội tụ', () => {
  it('chênh lệch hội tụ trong vòng 5 giây', async () => {
    const d = await draft();
    const before = await rptRow(d.id);
    expect(before?.['status']).toBe('NHAP');

    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    const t0 = Date.now();
    await outbox.pumpOnce();

    let row = await rptRow(d.id);
    while (row?.['status'] !== 'CHO_TBP_DUYET' && Date.now() - t0 < 5_000) {
      await new Promise((r) => setTimeout(r, 50));
      row = await rptRow(d.id);
    }
    expect(row?.['status']).toBe('CHO_TBP_DUYET');
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it('danh sách chờ xử lý đọc từ NGUỒN: đúng ngay cả khi read-model chưa kịp cập nhật', async () => {
    const d = await draft();
    // Gửi duyệt nhưng KHÔNG bơm outbox — read-model chưa hề biết chuyện này.
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const stale = await rptRow(d.id);
    expect(stale?.['status']).toBe('NHAP');

    // Trang chủ của Trưởng bộ phận vẫn thấy hồ sơ ngay lập tức, vì nó đọc
    // pol.policy chứ không đọc rpt.policy_row.
    const inbox = await (await http(policy))
      .get('/policies/inbox?limit=200')
      .set('Authorization', `Bearer ${tok['tbp01']}`);
    expect(inbox.status).toBe(200);
    expect(inbox.body.items.some((x: { id: string }) => x.id === d.id)).toBe(true);

    await flushSync([d.id]);
  });

  it('reporting KHÔNG có route nào phục vụ danh sách chờ xử lý', () => {
    const server = reporting.getHttpServer() as {
      _events: { request: { _router?: { stack: { route?: { path: string } }[] } } };
    };
    const paths = (server._events.request._router?.stack ?? [])
      .map((l) => l.route?.path)
      .filter(Boolean) as string[];
    expect(paths.length).toBeGreaterThan(0);
    // Đỏ ngay nếu ai thêm một màn hình "việc của tôi" vào read-model — nó sẽ trễ
    // vài giây so với nguồn và người dùng bỏ sót việc mà không biết.
    expect(paths.filter((p) => /inbox|cho-xu-ly|pending/i.test(p))).toEqual([]);
  });
});

// =============================================================================
// RPT-01 — mười bốn tiêu chí, mỗi tiêu chí một test
// =============================================================================

describe('RPT-01 từng tiêu chí trong 14 tiêu chí ở muc 9.2', () => {
  it('có đúng 14 tiêu chí, khai báo ở một chỗ', async () => {
    const r = await rget('/reports/filter-keys');
    expect(r.status).toBe(200);
    expect(r.body.criteria).toBe(14);
    // 16 tham số cho 14 tiêu chí: hai tiêu chí thời gian mỗi cái có hai đầu.
    expect(r.body.keys).toHaveLength(16);
    expect(FILTER_KEYS).toHaveLength(16);
  });

  it('1. thời gian áp dụng — bao gồm cả hai ngày biên', async () => {
    const a = await draft({ appliedDate: '2026-03-10' });
    const b = await draft({ appliedDate: '2026-06-20' });
    const r = await rget('/reports/policies?appliedFrom=2026-03-10&appliedTo=2026-03-10&limit=200');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  it('2. thời gian duyệt — đầu trên tính hết ngày, không cắt lúc 00:00', async () => {
    const id = await activated();

    // Ngày lấy theo ICT, KHÔNG theo UTC. `toISOString()` trả ngày UTC, và trong
    // bảy tiếng mỗi đêm (17:00–24:00 UTC) hai ngày đó lệch nhau một đơn vị —
    // đúng bẫy OPS-09. Bộ lọc so `approved_at >= $::date` với `::date` được
    // Postgres diễn giải theo múi giờ phiên, tức là ICT, nên test phải hỏi
    // chính CSDL thay vì tự tính bằng đồng hồ của Node.
    const day = await withAdminDb(async (c) => {
      const r = await c.query<{ d: string }>(
        `SELECT to_char(approved_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS d
           FROM rpt.policy_row WHERE policy_id = $1`,
        [id],
      );
      return r.rows[0]!.d;
    });

    const r = await rget(`/reports/policies?approvedFrom=${day}&approvedTo=${day}&limit=200`);
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    // Hồ sơ duyệt lúc 14 giờ vẫn nằm trong khoảng "từ ngày X đến ngày X".
    expect(ids).toContain(id);
  });

  it('3. mã khách hàng — khớp chính xác, không phân biệt hoa thường', async () => {
    const d = await draft();
    const r = await rget(
      `/reports/policies?customerCode=${encodeURIComponent(d.customerCode.toLowerCase())}&limit=200`,
    );
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });

  it('4. tên khách hàng — có chứa, bỏ dấu', async () => {
    const d = await draft({ name: 'Nhà thuốc Đông Á' });
    const r = await rget('/reports/policies?customerName=dong%20a&limit=200');
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });

  it('5. địa chỉ đăng ký — chỉ "có chứa", không phân biệt dấu (RPT-05)', async () => {
    const d = await draft({ address: 'Số 12 Nguyễn Văn Linh, Quận Hải Châu, Đà Nẵng' });

    // "da nang" không dấu phải tìm ra "Đà Nẵng" — chữ đ là chỗ dễ hỏng nhất và
    // hỏng trong im lặng, vì mọi tỉnh thành khác vẫn tìm được.
    for (const term of ['da nang', 'ĐÀ NẴNG', 'nguyen van linh', 'Hải Châu']) {
      const r = await rget(`/reports/policies?address=${encodeURIComponent(term)}&limit=200`);
      const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
      expect(ids, `từ khoá "${term}"`).toContain(d.id);
    }

    // Khớp giữa chuỗi, không chỉ từ đầu.
    const mid = await rget('/reports/policies?address=van%20linh&limit=200');
    expect(mid.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });

  it('6. mã số thuế', async () => {
    const tax = `0${Date.now() % 1_000_000_000}`;
    const d = await draft({ taxId: tax });
    const r = await rget(`/reports/policies?taxId=${tax}&limit=200`);
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toEqual([d.id]);
  });

  it('7. tên sản phẩm — khớp nếu bất kỳ dòng nào của hồ sơ chứa từ khoá', async () => {
    const d = await draft({ productName: 'Nutricare Metaligold Đặc Biệt' });
    const r = await rget('/reports/policies?productName=metaligold&limit=200');
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });

  it('8. người đề nghị', async () => {
    const d = await draft({ who: 'tdv02' });
    const r = await rget(`/reports/policies?requesterId=${userId['tdv02']}&limit=200`, 'kt01');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(d.id);
    expect(r.body.items.every((x: { requesterId: string }) => x.requesterId === userId['tdv02'])).toBe(
      true,
    );
  });

  it('9. trạng thái — nhận nhiều giá trị cách nhau bằng dấu phẩy', async () => {
    const nhap = await draft();
    const cho = await draft();
    expect((await act(cho.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([cho.id]);

    const one = await rget('/reports/policies?status=CHO_TBP_DUYET&limit=200');
    expect(one.body.items.map((x: { policyId: string }) => x.policyId)).not.toContain(nhap.id);

    const two = await rget('/reports/policies?status=NHAP,CHO_TBP_DUYET&limit=200');
    const ids = two.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(nhap.id);
    expect(ids).toContain(cho.id);
  });

  it('10. TDV phụ trách', async () => {
    const mine = await draft({ who: 'tdv01' });
    const other = await draft({ who: 'tdv02' });
    const r = await rget(`/reports/policies?tdvUserId=${userId['tdv01']}&limit=200`, 'kt01');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(other.id);
  });

  it('11. tỉnh/thành', async () => {
    const hn = await draft({ provinceCode: province('HN') });
    const dn = await draft({ provinceCode: province('DN') });
    const r = await rget(`/reports/policies?provinceCode=${province('HN')}&limit=200`);
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(hn.id);
    expect(ids).not.toContain(dn.id);
  });

  it('12. bệnh viện hoặc điểm bán', async () => {
    const d = await draft({ hospitalCode });
    const r = await rget(`/reports/policies?hospitalCode=${hospitalCode}&limit=200`);
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });

  it('13. kênh', async () => {
    const d = await draft({ channelCode });
    const r = await rget(`/reports/policies?channelCode=${channelCode}&limit=200`);
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });

  it('14. nhóm sản phẩm', async () => {
    const a = await draft({ groupCode: groupA });
    const b = await draft({ groupCode: groupB });
    const r = await rget(`/reports/policies?productGroupCode=${groupB}&limit=200`);
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(a.id);
  });
});

// =============================================================================
// RPT-02, RPT-03 — kết hợp và xoá bộ lọc
// =============================================================================

describe('RPT-02 kết hợp 5 điều kiện cùng lúc', () => {
  it('trả đúng giao của các điều kiện', async () => {
    const hit = await draft({
      name: 'Công ty Dược Hoàng Long',
      address: '55 Lê Duẩn, Hải Phòng',
      provinceCode: province('HN'),
      channelCode,
      groupCode: groupB,
      productName: 'Nutricare Bone',
      appliedDate: '2026-05-05',
    });
    // Khác đúng MỘT điều kiện (tỉnh) — phải bị loại.
    const miss = await draft({
      name: 'Công ty Dược Hoàng Long',
      address: '55 Lê Duẩn, Hải Phòng',
      provinceCode: province('DN'),
      channelCode,
      groupCode: groupB,
      productName: 'Nutricare Bone',
      appliedDate: '2026-05-05',
    });

    const qs = [
      `customerName=${encodeURIComponent('hoang long')}`,
      `address=${encodeURIComponent('le duan')}`,
      `provinceCode=${province('HN')}`,
      `channelCode=${channelCode}`,
      `productGroupCode=${groupB}`,
      'limit=200',
    ].join('&');
    const r = await rget(`/reports/policies?${qs}`);
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(hit.id);
    expect(ids).not.toContain(miss.id);
    expect(r.body.appliedCriteria).toBe(5);
  });
});

describe('RPT-03 xoá bộ lọc', () => {
  it('trả lại danh sách đầy đủ TRONG PHẠM VI, không phải toàn hệ thống', async () => {
    const mine = await draft({ who: 'tdv01' });
    const others = await draft({ who: 'tdv03' });

    await rput('/reports/filters/ho-so', { status: 'TU_CHOI' });
    const cleared = await rpost('/reports/filters/ho-so/clear', {});
    expect(cleared.status).toBe(200);
    expect(cleared.body.appliedCriteria).toBe(0);

    const r = await rget('/reports/policies?limit=200');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(mine.id);
    // tdv01 không thấy hồ sơ của tdv03 — hai người thuộc hai nhánh kế toán khác nhau.
    expect(ids).not.toContain(others.id);
  });

  it('chuỗi rỗng không bị hiểu là điều kiện lọc', async () => {
    const d = await draft();
    // Màn hình gửi `status=` ngay sau khi người dùng bấm Xóa bộ lọc.
    const r = await rget('/reports/policies?status=&customerName=&limit=200');
    expect(r.status).toBe(200);
    expect(r.body.appliedCriteria).toBe(0);
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });
});

describe('RPT-04 giữ điều kiện lọc trong phiên làm việc', () => {
  it('đặt bộ lọc, chuyển màn hình rồi quay lại thì điều kiện còn nguyên', async () => {
    const saved = await rput('/reports/filters/ho-so', {
      status: 'NHAP',
      provinceCode: province('HN'),
      customerName: 'Minh Châu',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.appliedCriteria).toBe(3);

    // "Chuyển màn hình" — đọc một endpoint khác ở giữa.
    await rget('/reports/progress');

    const back = await rget('/reports/filters/ho-so');
    expect(back.body.filter).toEqual({
      status: 'NHAP',
      provinceCode: province('HN'),
      customerName: 'Minh Châu',
    });
  });

  it('bộ lọc của mỗi người và mỗi màn hình tách nhau', async () => {
    await rput('/reports/filters/ho-so', { status: 'NHAP' }, 'tdv01');
    await rput('/reports/filters/bao-cao', { status: 'TU_CHOI' }, 'tdv01');
    await rput('/reports/filters/ho-so', { status: 'CHO_KT_L1' }, 'kt01');

    expect((await rget('/reports/filters/ho-so', 'tdv01')).body.filter.status).toBe('NHAP');
    expect((await rget('/reports/filters/bao-cao', 'tdv01')).body.filter.status).toBe('TU_CHOI');
    expect((await rget('/reports/filters/ho-so', 'kt01')).body.filter.status).toBe('CHO_KT_L1');
  });

  it('tên màn hình lạ bị từ chối chứ không sinh khoá Redis tuỳ ý', async () => {
    const r = await rget('/reports/filters/../../etc');
    expect([400, 404]).toContain(r.status);
  });
});

// =============================================================================
// RPT-06 — lọc theo mã, đổi tên danh mục không ảnh hưởng
// =============================================================================

describe('RPT-06 đổi tên tỉnh/thành', () => {
  it('bộ lọc cũ vẫn đúng vì lọc theo MÃ chứ không theo tên', async () => {
    const d = await draft({ provinceCode: province('DN') });
    const before = await rget(`/reports/policies?provinceCode=${province('DN')}&limit=200`);
    expect(before.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);

    // Đổi tên tỉnh trong danh mục — mã giữ nguyên (CAT-16).
    const renamed = await cpost(`/catalog/lookups/province`, {
      code: province('DN'),
      name: 'Thành phố Đà Nẵng (hợp nhất)',
    });
    expect(renamed.status).toBeLessThan(300);

    const after = await rget(`/reports/policies?provinceCode=${province('DN')}&limit=200`);
    expect(after.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
    // Và read-model không hề phải đồng bộ lại: nó giữ mã, không giữ tên.
    const row = await rptRow(d.id);
    expect(row?.['province_code']).toBe(province('DN'));
  });
});

// =============================================================================
// RPT-09 — phạm vi áp TRƯỚC bộ lọc
// =============================================================================

describe('RPT-09 tdv01 dùng bộ lọc rộng nhất có thể', () => {
  it('vẫn chỉ thấy hồ sơ trong phạm vi của mình', async () => {
    const mine = await draft({ who: 'tdv01' });
    const theirs = await draft({ who: 'tdv03' });

    const r = await rget('/reports/policies?limit=200');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  it('gõ thẳng id của TDV ngoài phạm vi thì kết quả RỖNG, không phải mở rộng', async () => {
    const theirs = await draft({ who: 'tdv03' });
    const r = await rget(`/reports/policies?tdvUserId=${userId['tdv03']}&limit=200`, 'tdv01');
    expect(r.status).toBe(200);
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).not.toContain(theirs.id);
    expect(r.body.items).toEqual([]);
  });

  it('báo cáo tổng hợp cũng áp phạm vi, không chỉ danh sách', async () => {
    await draft({ who: 'tdv03' });
    const mineTotal = (await rget('/reports/policies/count', 'tdv01')).body.total;
    const saTotal = (await rget('/reports/policies/count', 'sa01')).body.total;
    const progress = (await rget('/reports/progress', 'tdv01')).body;

    // Sale Admin đứng trên cả cây nên thấy nhiều hơn hoặc bằng.
    expect(saTotal).toBeGreaterThan(mineTotal);
    expect(progress.total).toBe(mineTotal);
  });
});

// =============================================================================
// RPT-10, RPT-11, RPT-12 — ba báo cáo
// =============================================================================

describe('RPT-10 báo cáo tiến độ', () => {
  it('khớp với số đếm truy vấn trực tiếp trên bảng hồ sơ', async () => {
    const a = await draft();
    const b = await draft();
    expect((await act(b.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([a.id, b.id]);

    const rep = (await rget('/reports/progress', 'sa01')).body;

    // Đối chiếu với NGUỒN, không với chính read-model: mục đích của RPT-10 là
    // phát hiện lúc hai bên lệch nhau.
    const src = await withAdminDb(async (c) => {
      const r = await c.query<{ status: string; n: string }>(
        `SELECT p.status::text, count(*)::text AS n
           FROM pol.policy p
          WHERE p.id IN (SELECT policy_id FROM rpt.policy_row)
          GROUP BY p.status`,
      );
      return Object.fromEntries(r.rows.map((x) => [x.status, Number(x.n)]));
    });

    for (const [status, count] of Object.entries(src)) {
      expect(rep.byStatus[status] ?? 0, `trạng thái ${status}`).toBe(count);
    }
    expect(rep.byPendingStep['B4_TBP_DUYET']).toBeGreaterThanOrEqual(1);
    expect(rep.byHandler.some((h: { userId: string }) => h.userId === userId['tdv01'])).toBe(true);
  });
});

describe('RPT-11 báo cáo tỷ lệ hồ sơ bị trả lại', () => {
  it('tính CẢ hồ sơ ở trạng thái Từ chối', async () => {
    const returned = await draft();
    expect((await act(returned.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(returned.id, 'TBP_RETURN', 'tbp01', { reason: 'Thiếu hồ sơ pháp lý' })).status).toBe(200);

    const rejected = await draft();
    expect((await act(rejected.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(rejected.id, 'TBP_REJECT', 'tbp01', { reason: 'Chiết khấu vượt trần' })).status).toBe(200);

    const clean = await draft();
    expect((await act(clean.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([returned.id, rejected.id, clean.id]);

    const r = (await rget('/reports/return-rate', 'sa01')).body;
    expect(r.returned).toBeGreaterThanOrEqual(1);
    expect(r.rejected).toBeGreaterThanOrEqual(1);
    // Hồ sơ Từ chối nằm trong tử số — bỏ nó ra là giấu đúng những hồ sơ hỏng nặng nhất.
    expect(r.returnedOrRejected).toBeGreaterThanOrEqual(r.rejected);
    expect(r.rate).toBeGreaterThan(0);

    const rowRejected = await rptRow(rejected.id);
    expect(rowRejected?.['status']).toBe('TU_CHOI');
  });
});

describe('RPT-12 báo cáo SLA khi dữ liệu có bản ghi LEGACY', () => {
  it('loại trừ nhóm LEGACY khỏi thống kê', async () => {
    const normal = await draft();
    expect((await act(normal.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([normal.id]);

    const legacy = await draft();
    expect((await act(legacy.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([legacy.id]);
    // Đánh dấu là dữ liệu CSBH cũ nhập từ Excel rồi đồng bộ lại.
    await withAdminDb(async (c) => {
      await c.query(`UPDATE pol.policy SET source = 'LEGACY' WHERE id = $1`, [legacy.id]);
    });
    expect(await sync.refreshPolicy(legacy.id)).toBe('synced');
    expect((await rptRow(legacy.id))?.['source']).toBe('LEGACY');

    const r = (await rget('/reports/sla', 'sa01')).body;
    expect(r.excludedLegacy).toBeGreaterThanOrEqual(1);

    // Chứng minh trực tiếp: đếm số hồ sơ đang chờ trong read-model, trừ LEGACY.
    const counted = await withAdminDb(async (c) => {
      const q = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM rpt.policy_row
          WHERE sla_due_at IS NOT NULL AND source <> 'LEGACY'`,
      );
      return Number(q.rows[0]!.n);
    });
    expect(r.waiting).toBe(counted);
  });
});

// =============================================================================
// RPT-13 — phân trang ổn định
// =============================================================================

describe('RPT-13 sang trang trong lúc có hồ sơ mới được tạo', () => {
  it('không lặp và không bỏ sót bản ghi', async () => {
    const made: string[] = [];
    for (let i = 0; i < 5; i++) made.push((await draft()).id);

    const page1 = await rget('/reports/policies?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);
    const seen = page1.body.items.map((x: { policyId: string }) => x.policyId) as string[];

    // Hồ sơ mới chèn vào ĐẦU danh sách, đúng lúc người dùng đang xem trang 1.
    // Với OFFSET thì trang 2 sẽ lặp lại dòng cuối của trang 1 và bỏ mất một dòng.
    const intruder = await draft();

    const page2 = await rget(
      `/reports/policies?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
    );
    const p2 = page2.body.items.map((x: { policyId: string }) => x.policyId) as string[];
    const page3 = await rget(
      `/reports/policies?limit=2&cursor=${encodeURIComponent(page2.body.nextCursor)}`,
    );
    const p3 = page3.body.items.map((x: { policyId: string }) => x.policyId) as string[];

    const all = [...seen, ...p2, ...p3];
    expect(new Set(all).size, 'có bản ghi lặp giữa các trang').toBe(all.length);
    // Bốn hồ sơ mới nhất (trong năm hồ sơ vừa tạo) phải xuất hiện đủ trong ba trang.
    for (const id of made.slice(1)) expect(all, `bỏ sót ${id}`).toContain(id);
    // Hồ sơ chen ngang KHÔNG lọt vào các trang sau — con trỏ neo vào dữ liệu.
    expect(all).not.toContain(intruder.id);
  });

  it('con trỏ hỏng bị từ chối với thông báo dùng được', async () => {
    const r = await rget('/reports/policies?cursor=khong-phai-con-tro');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('cursor');
  });
});

// =============================================================================
// RPT-07, RPT-08 — xuất Excel
// =============================================================================

async function waitExport(jobId: string, who = 'tdv01', timeoutMs = 10_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const r = await rget(`/reports/exports/${jobId}`, who);
    if (r.body.status === 'XONG' || r.body.status === 'LOI') return r.body;
    if (Date.now() >= until) throw new Error(`việc xuất ${jobId} chưa xong sau ${timeoutMs}ms`);
    await new Promise((x) => setTimeout(x, 50));
  }
}

const readSheet = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
};

describe('RPT-07 xuất Excel khi đang áp bộ lọc', () => {
  it('file chứa đúng tập đã lọc, đúng thứ tự cột, tiền là SỐ chứ không phải chuỗi', async () => {
    const tax = `0${Date.now() % 1_000_000_000}`;
    const wanted = await draft({ taxId: tax, name: 'Nhà thuốc Thiên Ân' });
    await draft({ name: 'Không nằm trong bộ lọc' });

    const req = await rpost('/reports/exports', { taxId: tax });
    expect(req.status).toBe(202);
    const done = await waitExport(req.body.jobId);
    expect(done.status).toBe('XONG');
    expect(done.rowCount).toBe(1);

    const file = await (await http(reporting))
      .get(`/reports/exports/${req.body.jobId}/file`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);

    const ws = await readSheet(file.body as Buffer);

    // Thứ tự cột là hợp đồng với người dùng: họ dựng công thức tham chiếu cột E.
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(header).toEqual(COLUMNS.map((c) => c.header));

    expect(ws.rowCount).toBe(2);
    const row = ws.getRow(2);
    const codeCol = COLUMNS.findIndex((c) => c.key === 'customerCode') + 1;
    expect(String(row.getCell(codeCol).value)).toBe(wanted.customerCode);

    // Tiền: ô phải là số và có định dạng phân cách nghìn. Ghi "87.000 đ" thì file
    // mở ra vẫn đẹp nhưng không cộng được — đúng thứ người ta xuất Excel để làm.
    const netCol = COLUMNS.findIndex((c) => c.key === 'totalNet') + 1;
    const netCell = row.getCell(netCol);
    expect(typeof netCell.value).toBe('number');
    expect(netCell.value).toBe(87_000);
    expect(ws.getColumn(netCol).numFmt).toBe('#,##0');

    // Ngày: phải là Date, không phải chuỗi — chuỗi thì tháng 12 sắp trước tháng 2.
    const createdCol = COLUMNS.findIndex((c) => c.key === 'createdAt') + 1;
    expect(row.getCell(createdCol).value).toBeInstanceOf(Date);
  });

  it('người khác không tải được file của mình, kể cả cấp trên', async () => {
    const req = await rpost('/reports/exports', {}, 'tdv01');
    await waitExport(req.body.jobId);
    const stolen = await rget(`/reports/exports/${req.body.jobId}`, 'sa01');
    expect(stolen.status).toBe(403);
  });
});

describe('RPT-08 xuất Excel 5.000 dòng', () => {
  it('chạy nền, trả link tải, dưới 10 giây, không chặn request khác', async () => {
    // Nhân bản 5000 dòng thẳng vào read-model. Lập 5000 hồ sơ qua API mất hàng
    // chục phút và không kiểm thêm được gì: thứ đang được kiểm là ĐƯỜNG XUẤT
    // FILE, không phải đường lập hồ sơ.
    const seed = await draft({ name: 'Khách hàng nền tải' });
    await withAdminDb(async (c) => {
      await c.query(
        `INSERT INTO rpt.policy_row (
           policy_id, code, version_no, status, source, created_at,
           customer_id, customer_code, customer_name, customer_name_norm,
           registered_address, address_norm, tdv_user_id, tdv_name,
           product_codes, product_names, product_names_norm, product_group_codes,
           line_count, total_net, max_discount, applied_date, src_row_version)
         SELECT gen_random_uuid(), 'ZZBULK-' || g, 1, 'NHAP', 'NORMAL',
                now() - (g || ' seconds')::interval,
                customer_id, 'ZZBULK-KH-' || g, 'Khách hàng số ' || g,
                'khach hang so ' || g, 'Số ' || g || ' Trần Hưng Đạo',
                'so ' || g || ' tran hung dao', tdv_user_id, tdv_name,
                product_codes, product_names, product_names_norm, product_group_codes,
                1, 87000, 13.00, current_date, 1
           FROM rpt.policy_row, generate_series(1, 5000) g
          WHERE policy_id = $1`,
        [seed.id],
      );
    });

    const t0 = Date.now();
    const req = await rpost('/reports/exports', { customerName: 'khach hang so' });
    const elapsedRequest = Date.now() - t0;
    expect(req.status).toBe(202);
    // Yêu cầu trả về NGAY: việc dựng file chưa hề bắt đầu xong.
    expect(elapsedRequest).toBeLessThan(2_000);

    // Trong lúc file đang dựng, request khác vẫn được phục vụ.
    const during = await rget('/healthz');
    expect(during.status).toBe(200);

    const done = await waitExport(req.body.jobId, 'tdv01', 10_000);
    expect(done.status).toBe('XONG');
    expect(done.rowCount).toBe(5000);
    expect(done.downloadUrl).toBe(`/reports/exports/${req.body.jobId}/file`);
    expect(Date.now() - t0).toBeLessThan(10_000);

    await withAdminDb(async (c) => {
      await c.query(`DELETE FROM rpt.policy_row WHERE code LIKE 'ZZBULK-%'`);
    });
  }, 60_000);
});

// =============================================================================
// Đồng bộ read-model — giao lại, xoá, đổi khách hàng
// =============================================================================

describe('Read-model đồng bộ đúng khi sự kiện giao lại hoặc hồ sơ biến mất', () => {
  it('đồng bộ hai lần cùng một hồ sơ cho ra đúng một dòng (INT-03)', async () => {
    const d = await draft();
    expect(await sync.refreshPolicy(d.id)).toBe('synced');
    expect(await sync.refreshPolicy(d.id)).toBe('synced');
    const rows = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT 1 FROM rpt.policy_row WHERE policy_id = $1`, [d.id]);
      return r.rowCount;
    });
    expect(rows).toBe(1);
  });

  it('xoá hồ sơ Nháp thì dòng read-model biến mất theo', async () => {
    const d = await draft();
    expect(await rptRow(d.id)).toBeDefined();

    const del = await (await http(policy))
      .delete(`/policies/${d.id}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(del.status).toBe(204);

    await outbox.pumpOnce();
    const until = Date.now() + 10_000;
    while ((await rptRow(d.id)) !== undefined && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(await rptRow(d.id)).toBeUndefined();
  });

  it('đổi địa chỉ khách hàng thì mọi hồ sơ của khách đó lọc lại được ngay', async () => {
    const d = await draft({ address: 'Số 1 Bà Triệu, Hà Nội' });
    const row = await rptRow(d.id);
    const customerId = row!['customer_id'] as string;

    const patch = await (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ registeredAddress: 'Số 99 Lý Thường Kiệt, Hải Phòng' });
    expect(patch.status).toBe(200);

    await cusOutbox.pumpOnce();
    const until = Date.now() + 10_000;
    let addr = '';
    while (Date.now() < until) {
      addr = String((await rptRow(d.id))?.['address_norm'] ?? '');
      if (addr.includes('ly thuong kiet')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(addr).toContain('ly thuong kiet');

    const r = await rget('/reports/policies?address=hai%20phong&limit=200');
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);
  });

  it('chuẩn hoá bỏ dấu xử lý đúng chữ đ — chỗ unaccent của Postgres làm sai', () => {
    expect(norm('Đà Nẵng')).toBe('da nang');
    expect(norm('đường Điện Biên Phủ')).toBe('duong dien bien phu');
    expect(norm('  NHÀ   THUỐC  ')).toBe('nha thuoc');
  });
});
