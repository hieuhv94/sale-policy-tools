/**
 * RPT-01 … RPT-14 — bộ lọc 11 tiêu chí, ba báo cáo, xuất Excel.
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
  KHOA_NHIEU_GIA_TRI,
  norm,
  SO_GIA_TRI_TOI_DA,
  SO_TIEU_CHI,
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
  maDuyNhat,
  http,
  withAdminDb,
  phanCongMacDinh,
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

const uniq = (k: string) => maDuyNhat(P, k);

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

/** Xoá một hồ sơ qua `policy` — cần cho ca kiểm thử `0039` bên dưới. */
const pdel = async (path: string, who = 'tdv01') =>
  (await http(policy)).delete(path).set('Authorization', `Bearer ${tok[who]}`);

const rget = async (path: string, who = 'tdv01') =>
  (await http(reporting)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const rpost = async (path: string, body: object, who = 'tdv01') =>
  (await http(reporting)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const rput = async (path: string, body: object, who = 'tdv01') =>
  (await http(reporting)).put(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

/** Bơm outbox rồi chờ read-model có đủ những hồ sơ đã nêu. */
/**
 * Chờ read-model ĐUỔI KỊP NGUỒN cho những hồ sơ nêu tên.
 *
 * Điều kiện dừng là **trạng thái khớp**, không phải "dòng đã tồn tại". Bản cũ
 * chỉ chờ tồn tại, và điều đó tạo ra một lượt đỏ theo xác suất ở `RPT-10`:
 *
 *   1. `draft()` tạo hồ sơ → chiếu sang read-model với trạng thái `NHAP`.
 *   2. `SUBMIT` đổi nguồn sang `CHO_TBP_DUYET`, sinh sự kiện thứ hai.
 *   3. `flushSync` thấy dòng ĐÃ CÓ (từ bước 1) nên trả về ngay — trong khi
 *      projection vẫn còn ghi `NHAP`.
 *
 * Kết quả là báo cáo đếm thừa đúng một hồ sơ ở `NHAP` và thiếu một ở
 * `CHO_TBP_DUYET`, rồi phép so với nguồn đỏ với thông điệp `expected 29 to be
 * 28` — không nhắc gì tới độ trễ. Đo được một lần trên mỗi vài lượt chạy.
 *
 * `pumpOnce()` gọi TRONG vòng lặp chứ không chỉ một lần trước: sự kiện thứ hai
 * có thể chưa nằm trong outbox lúc bơm lần đầu.
 */
async function flushSync(policyIds: string[], timeoutMs = 20_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    await outbox.pumpOnce();
    await cusOutbox.pumpOnce();

    const lech = await withAdminDb(async (c) => {
      const r = await c.query<{ policy_id: string; nguon: string; chieu: string | null }>(
        `SELECT p.id AS policy_id, p.status::text AS nguon, r.status AS chieu
           FROM pol.policy p
           LEFT JOIN rpt.policy_row r ON r.policy_id = p.id
          WHERE p.id = ANY($1::uuid[])
            AND (r.policy_id IS NULL OR r.status <> p.status::text)`,
        [policyIds],
      );
      return r.rows;
    });
    if (lech.length === 0) return;

    if (Date.now() >= until) {
      const mo = lech
        .map((x) => `${x.policy_id}: nguồn ${x.nguon}, read-model ${x.chieu ?? 'chưa có'}`)
        .join('; ');
      throw new Error(`read-model chưa đuổi kịp nguồn — ${mo}`);
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

const cpost = async (path: string, body: object, who = 'admin01') =>
  (await http(catalog)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

async function makeProduct(name: string, groupCode: string): Promise<string> {
  const r = await cpost('/catalog/products', {
    code: uniq('SP'),
    name,
    groupCode,
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
      lines: [{ productId, wholesalePrice: '90000', cpbh: ['3000'] }],
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
// RPT-01 — chín tiêu chí, mỗi tiêu chí một test
// =============================================================================

describe('RPT-01 từng tiêu chí trong 9 tiêu chí ở muc 9.2', () => {
  it('có đúng 9 tiêu chí, khai báo ở một chỗ', async () => {
    /*
     * `0077` bỏ *địa chỉ đăng ký* và *mã số thuế* — hai ô không ai lọc theo — và
     * gộp *người đề nghị* vào *TDV phụ trách*; đổi lại *hạn xử lý* vào hẳn muc
     * 9.2 thay vì đứng ngoài như từ `0060`.
     */
    const r = await rget('/reports/filter-keys');
    expect(r.status).toBe(200);
    expect(r.body.criteria).toBe(9);
    expect(SO_TIEU_CHI).toBe(9);
    // 11 tham số cho 9 tiêu chí: hai tiêu chí thời gian mỗi cái có hai đầu.
    expect(r.body.keys).toHaveLength(11);
    expect(FILTER_KEYS).toHaveLength(11);
    for (const bo of ['address', 'taxId', 'requesterId']) {
      expect(FILTER_KEYS as readonly string[], `${bo} phải đã bị gỡ`).not.toContain(bo);
    }
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

  it('2b. "duyệt" là B10 CÓ HIỆU LỰC, không phải B4 Trưởng bộ phận ký', async () => {
    // Khách hàng chốt ngày 08/08/2026. Hai bước cách nhau nhiều ngày trong thực
    // tế, và hồ sơ đã ký ở B4 vẫn có thể bị trả lại — lúc đó nó chưa hề "duyệt
    // xong", nên không được lọt vào báo cáo theo thời gian duyệt.
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    await flushSync([d.id]);

    const row = await rptRow(d.id);
    expect(row?.['tbp_signed_at'], 'B4 đã xong nên phải có mốc ký').not.toBeNull();
    expect(row?.['approved_at'], 'chưa qua B10 thì chưa có thời gian duyệt').toBeNull();

    // Khoảng ngày rộng nhất có thể vẫn không kéo được nó vào.
    const r = await rget('/reports/policies?approvedFrom=2000-01-01&approvedTo=2099-12-31&limit=200');
    expect(r.body.items.map((x: { policyId: string }) => x.policyId)).not.toContain(d.id);
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

  it('5. tên sản phẩm — khớp ĐÚNG TÊN, không phải "có chứa" (`0077`)', async () => {
    /*
     * Đổi nghĩa ở `0077`. Ô nhập giờ là ô CHỌN: người dùng gõ để tìm rồi chọn ra
     * từng sản phẩm cụ thể, nên thứ gửi lên là tên đầy đủ chứ không phải mảnh từ
     * khoá. Đổi lại được hai thứ — `&&` dùng được chỉ mục GIN `ix_rpt_pnames`,
     * và chọn ba sản phẩm ra đúng ba sản phẩm ấy chứ không kèm mọi mặt hàng khác
     * có tên chứa cùng một chữ.
     */
    const ten = 'Nutricare Metaligold Đặc Biệt';
    const d = await draft({ productName: ten });

    const dung = await rget(`/reports/policies?productName=${encodeURIComponent(ten)}&limit=200`);
    expect(dung.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);

    // Bỏ dấu và đổi hoa thường vẫn khớp — hai bên cùng đi qua `norm`.
    const khongDau = await rget(
      '/reports/policies?productName=nutricare%20metaligold%20dac%20biet&limit=200',
    );
    expect(khongDau.body.items.map((x: { policyId: string }) => x.policyId)).toContain(d.id);

    // Một MẢNH của tên thì KHÔNG còn khớp — đây chính là chỗ đổi nghĩa.
    const manh = await rget('/reports/policies?productName=metaligold&limit=200');
    expect(manh.body.items.map((x: { policyId: string }) => x.policyId)).not.toContain(d.id);
  });

  it('6. nhóm sản phẩm', async () => {
    const a = await draft({ groupCode: groupA });
    const b = await draft({ groupCode: groupB });
    const r = await rget(`/reports/policies?productGroupCode=${groupB}&limit=200`);
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(a.id);
  });
  it('7. TDV phụ trách', async () => {
    const mine = await draft({ who: 'tdv01' });
    const other = await draft({ who: 'tdv02' });
    // Đọc bằng `bld01` (`0031`): ca này kiểm TIÊU CHÍ LỌC, không kiểm phạm vi.
    // Hồ sơ còn Nháp thì chưa giao cho kế toán nào, nên đọc bằng `kt01` là kiểm
    // nhầm sang phạm vi và che mất thứ đang muốn kiểm.
    const r = await rget(`/reports/policies?tdvUserId=${userId['tdv01']}&limit=200`, 'bld01');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(other.id);
  });

  /*
   * Ba tiêu chí 11 · 12 · 13 cũ — tỉnh/thành, bệnh viện, kênh — đã xoá cùng
   * `0026`. Bộ lọc gửi lên vẫn không gãy (`cleanFilter` bỏ khoá lạ), nhưng
   * không còn cột nào để lọc theo nên không còn gì để kiểm.
   */
  it('8. trạng thái — nhận nhiều giá trị cách nhau bằng dấu phẩy', async () => {
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

});

// =============================================================================
// RPT-02, RPT-03 — kết hợp và xoá bộ lọc
// =============================================================================

describe('RPT-02 kết hợp 5 điều kiện cùng lúc', () => {
  it('trả đúng giao của các điều kiện', async () => {
    const hit = await draft({
      name: 'Công ty Dược Hoàng Long',
      groupCode: groupB,
      productName: 'Nutricare Bone Loang Xuong',
      appliedDate: '2026-05-05',
      who: 'tdv01',
    });
    // Khác đúng MỘT điều kiện (nhóm sản phẩm) — phải bị loại.
    const miss = await draft({
      name: 'Công ty Dược Hoàng Long',
      groupCode: groupA,
      productName: 'Nutricare Bone Loang Xuong',
      appliedDate: '2026-05-05',
      who: 'tdv01',
    });

    const qs = [
      `customerName=${encodeURIComponent('hoang long')}`,
      `productName=${encodeURIComponent('Nutricare Bone Loang Xuong')}`,
      `productGroupCode=${groupB}`,
      `tdvUserId=${userId['tdv01']}`,
      'appliedFrom=2026-05-05',
      'limit=200',
    ].join('&');
    const r = await rget(`/reports/policies?${qs}`, 'bld01');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(hit.id);
    expect(ids).not.toContain(miss.id);
    expect(r.body.appliedCriteria).toBe(5);
  });
});

// =============================================================================
// `0077` — NHIỀU GIÁ TRỊ trên cùng một tiêu chí
// =============================================================================

describe('`0077` mỗi tiêu chí kết hợp được nhiều giá trị', () => {
  /**
   * Tập hồ sơ khớp một chuỗi truy vấn. Trả về `Set` để so bằng phép tập, không
   * so bằng số đếm chép tay — bộ test dùng chung một CSDL với mọi tệp khác, nên
   * một con số cứng ở đây là một ca đỏ ngẫu nhiên chờ ngày xảy ra.
   */
  const tap = async (qs: string, who = 'bld01'): Promise<Set<string>> => {
    const r = await rget(`/reports/policies?${qs}&limit=200`, who);
    expect(r.status, qs).toBe(200);
    return new Set(r.body.items.map((x: { policyId: string }) => x.policyId));
  };

  it('nhiều giá trị cho ra đúng HỢP của từng giá trị đơn lẻ', async () => {
    /*
     * Bất biến của cả tính năng, và nó đúng cho MỌI tiêu chí nhiều giá trị: lọc
     * `a,b` phải bằng lọc `a` cộng lọc `b`. Kiểm bằng phép tập nên nó không phụ
     * thuộc vào dữ liệu các tệp test khác để lại.
     */
    const a = await draft({ who: 'tdv01' });
    const b = await draft({ who: 'tdv02' });

    const rieng = await Promise.all([
      tap(`tdvUserId=${userId['tdv01']}`),
      tap(`tdvUserId=${userId['tdv02']}`),
    ]);
    const chung = await tap(`tdvUserId=${userId['tdv01']},${userId['tdv02']}`);

    expect(chung).toEqual(new Set([...rieng[0]!, ...rieng[1]!]));
    expect(chung.has(a.id)).toBe(true);
    expect(chung.has(b.id)).toBe(true);
  });

  it('mã khách hàng — nhiều mã, không phân biệt hoa thường', async () => {
    const a = await draft();
    const b = await draft();
    const ids = await tap(
      `customerCode=${a.customerCode.toLowerCase()},${b.customerCode.toUpperCase()}`,
    );
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
  });

  it('tên sản phẩm — nhiều sản phẩm', async () => {
    const x = await draft({ productName: 'Nutricare Gold Kim Cuong' });
    const y = await draft({ productName: 'Nutricare Smarta Grow Plus' });
    const ids = await tap(
      'productName=' +
        encodeURIComponent('Nutricare Gold Kim Cuong') +
        ',' +
        encodeURIComponent('Nutricare Smarta Grow Plus'),
    );
    expect(ids.has(x.id)).toBe(true);
    expect(ids.has(y.id)).toBe(true);
  });

  it('nhóm sản phẩm — nhiều nhóm', async () => {
    const a = await draft({ groupCode: groupA });
    const b = await draft({ groupCode: groupB });
    const ids = await tap(`productGroupCode=${groupA},${groupB}`);
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
  });

  it('HAI tiêu chí nhiều giá trị đứng cạnh nhau thì GIAO, không phải hợp', async () => {
    /*
     * Chỗ dễ làm sai nhất của cả đợt. Trong MỘT tiêu chí, nhiều giá trị là
     * "hoặc"; giữa HAI tiêu chí thì vẫn là "và". Dựng nhầm thành "hoặc" ở tầng
     * trên là bộ lọc càng thêm điều kiện càng ra nhiều kết quả — một hành vi
     * không ai nghĩ tới nên cũng không ai đi kiểm.
     */
    const hit = await draft({ who: 'tdv01', groupCode: groupB });
    const lechNhom = await draft({ who: 'tdv01', groupCode: groupA });
    const lechNguoi = await draft({ who: 'tdv02', groupCode: groupB });

    const ids = await tap(
      `tdvUserId=${userId['tdv01']},${userId['tdv03']}&productGroupCode=${groupB}`,
    );
    expect(ids.has(hit.id)).toBe(true);
    expect(ids.has(lechNhom.id), 'khác nhóm mà vẫn lọt — hai tiêu chí đang là HOẶC').toBe(false);
    expect(ids.has(lechNguoi.id), 'khác người mà vẫn lọt').toBe(false);
  });

  it('giá trị TRÙNG bị khử, và `appliedCriteria` không đếm nhầm', async () => {
    // Bộ lọc đến từ liên kết rồi người dùng chọn thêm đúng cái đã có — chip mọc
    // lên hai cái giống hệt nhau nếu không khử.
    const r = await rget(`/reports/policies?status=NHAP,NHAP,NHAP&limit=200`);
    expect(r.status).toBe(200);
    expect(r.body.filter.status).toBe('NHAP');
    expect(r.body.appliedCriteria).toBe(1);
  });

  it('mọi tiêu chí trong `KHOA_NHIEU_GIA_TRI` đều thật sự nhận dấu phẩy', async () => {
    /*
     * Đối chiếu BẢNG với HÀNH VI. `KHOA_NHIEU_GIA_TRI` là một danh sách khai
     * tay; thêm một khoá vào đó mà quên đổi `build()` thì tiêu chí ấy vẫn qua
     * được phép kiểm nhưng dựng SQL như một giá trị đơn — và triệu chứng là kết
     * quả rỗng, thứ không ai báo lỗi giúp.
     */
    for (const k of KHOA_NHIEU_GIA_TRI) {
      const v = k === 'tdvUserId' ? `${userId['tdv01']},${userId['tdv02']}` : 'AAA,BBB';
      const r = await rget(`/reports/policies?${k}=${encodeURIComponent(v)}&limit=5`);
      expect(r.status, `${k} không nhận nhiều giá trị`).toBe(200);
      expect(r.body.filter[k], `${k} bị cắt mất một giá trị`).toBe(v);
    }
  });

  it('quá trần số giá trị thì 400, không âm thầm cắt bớt', async () => {
    // Cắt bớt trong im lặng là trả về một tập HẸP HƠN thứ người dùng hỏi, và
    // không có gì nói cho họ biết. Nói thẳng vẫn hơn.
    const nhieu = Array.from({ length: SO_GIA_TRI_TOI_DA + 1 }, (_, i) => `KH${i}`).join(',');
    const r = await rget(`/reports/policies?customerCode=${nhieu}&limit=5`);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
    expect(r.body.field).toBe('customerCode');
  });

  it('đúng trần thì vẫn qua — trần là 50, không phải 49', async () => {
    const vua = Array.from({ length: SO_GIA_TRI_TOI_DA }, (_, i) => `KH${i}`).join(',');
    expect((await rget(`/reports/policies?customerCode=${vua}&limit=5`)).status).toBe(200);
  });

  it('MỘT phần tử uuid hỏng làm cả tiêu chí bị từ chối', async () => {
    /*
     * Không bỏ qua phần tử hỏng: `= ANY` với một uuid rác thì Postgres ném lỗi
     * kiểu ở tận tầng CSDL, và người dùng nhận về một lỗi 500 không nhắc gì tới
     * cái ô họ vừa sửa.
     */
    const r = await rget(`/reports/policies?tdvUserId=${userId['tdv01']},khong-phai-uuid&limit=5`);
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('tdvUserId');
  });
});

// =============================================================================
// `0077` — nguồn của ô chọn *TDV phụ trách*
// =============================================================================

describe('`0077` GET /reports/handlers', () => {
  it('chỉ trả người CÓ hồ sơ trong phạm vi người gọi', async () => {
    /*
     * Cả điểm của endpoint này. Bày cả những TDV ngoài phạm vi là mời người dùng
     * chọn một cái tên rồi nhận về danh sách rỗng, mà không có gì nói vì sao —
     * đúng cái bẫy `RPT-09` mở ra khi phạm vi áp trước bộ lọc.
     */
    await draft({ who: 'tdv01' });
    await draft({ who: 'tdv03' });

    const r = await rget('/reports/handlers', 'tdv01');
    expect(r.status).toBe(200);
    const ids = r.body.map((x: { userId: string }) => x.userId);
    expect(ids).toContain(userId['tdv01']);
    // tdv03 thuộc nhánh kế toán khác — tdv01 không thấy hồ sơ của họ, nên cũng
    // không được thấy tên họ trong ô chọn.
    expect(ids).not.toContain(userId['tdv03']);
  });

  it('`0077` ô chọn khách hàng tìm được cả MÃ lẫn TÊN KHÔNG DẤU', async () => {
    /*
     * Vì sao ô này không dùng `GET /customers?q=` — đo trên chồng demo mới lộ:
     * đường ấy khớp `tên || địa chỉ || mã số thuế`, **không khớp MÃ** (đúng thứ
     * ô này mang tên), và dùng `ILIKE` nên phân biệt dấu — gõ `duoc` ra rỗng.
     *
     * `rpt.policy_row` có `customer_name_norm` đã bỏ dấu và có chỉ mục GIN, nên
     * cả hai phép tìm đều rẻ.
     */
    const d = await draft({ name: 'Công ty Dược phẩm Hoàng Kim' });

    const theoMa = await rget(`/reports/customers?q=${d.customerCode}`);
    expect(theoMa.status).toBe(200);
    expect(theoMa.body.map((x: { code: string }) => x.code)).toContain(d.customerCode);

    // Không dấu, chữ thường — đúng cách người ta gõ nhanh.
    const theoTen = await rget('/reports/customers?q=duoc%20pham%20hoang%20kim');
    expect(theoTen.body.map((x: { code: string }) => x.code)).toContain(d.customerCode);

    // Từ khoá rỗng KHÔNG trả về cả bảng: ô chọn chờ người dùng gõ đã.
    expect((await rget('/reports/customers?q=')).body).toEqual([]);
  });

  it('`0077` ô chọn khách hàng cũng chỉ trong PHẠM VI', async () => {
    const cuaToi = await draft({ who: 'tdv01', name: 'Nha thuoc Trong Pham Vi' });
    await draft({ who: 'tdv03', name: 'Nha thuoc Ngoai Pham Vi' });
    const r = await rget('/reports/customers?q=nha%20thuoc', 'tdv01');
    const ten = r.body.map((x: { name: string }) => x.name);
    expect(r.body.map((x: { code: string }) => x.code)).toContain(cuaToi.customerCode);
    expect(ten).not.toContain('Nha thuoc Ngoai Pham Vi');
  });

  it('mọi id trả về đều lọc ra ÍT NHẤT một hồ sơ — không có lựa chọn chết', async () => {
    await draft({ who: 'tdv01' });
    const r = await rget('/reports/handlers', 'tdv01');
    expect(r.body.length).toBeGreaterThan(0);
    for (const x of r.body as { userId: string }[]) {
      const ds = await rget(`/reports/policies?tdvUserId=${x.userId}&limit=1`, 'tdv01');
      expect(ds.body.items.length, `${x.userId} là một lựa chọn chết`).toBeGreaterThan(0);
    }
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
      productGroupCode: groupB,
      customerName: 'Minh Châu',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.appliedCriteria).toBe(3);

    // "Chuyển màn hình" — đọc một endpoint khác ở giữa.
    await rget('/reports/progress');

    const back = await rget('/reports/filters/ho-so');
    expect(back.body.filter).toEqual({
      status: 'NHAP',
      productGroupCode: groupB,
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
// RPT-06 — lọc theo MÃ chứ không theo TÊN
//
// Test cũ dựng lên từ danh mục tỉnh/thành: đổi tên tỉnh rồi kiểm bộ lọc cũ vẫn
// ra đúng hồ sơ. Cả danh mục ấy lẫn tiêu chí lọc theo nó đã đi ở `0026`, nên
// không còn cặp mã/tên nào trong read-model để dựng lại phép thử này. Luật
// CAT-16 (khoá chính là MÃ) vẫn còn hiệu lực và vẫn được kiểm — ở `catalog.test`
// cho nhóm sản phẩm và quy định chiết khấu.
// =============================================================================

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
    // `bld01` thay `sa01` (`0031`): Sale Admin không còn "đứng trên cả cây" —
    // họ thấy đúng những hồ sơ được giao. Vai trò duy nhất còn thấy toàn bộ là
    // Ban lãnh đạo, và đó chính là thứ ca này cần để so "rộng hơn".
    const bldTotal = (await rget('/reports/policies/count', 'bld01')).body.total;
    const progress = (await rget('/reports/progress', 'tdv01')).body;

    expect(bldTotal).toBeGreaterThan(mineTotal);
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

    // `bld01`: ca này đối chiếu read-model với NGUỒN trên TOÀN BỘ bảng, nên
    // người đọc phải là vai trò thấy toàn bộ (`0031`).
    const rep = (await rget('/reports/progress', 'bld01')).body;

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

    const r = (await rget('/reports/return-rate', 'bld01')).body;
    expect(r.returned).toBeGreaterThanOrEqual(1);
    expect(r.rejected).toBeGreaterThanOrEqual(1);
    // Hồ sơ Từ chối nằm trong tử số — bỏ nó ra là giấu đúng những hồ sơ hỏng nặng nhất.
    expect(r.returnedOrRejected).toBeGreaterThanOrEqual(r.rejected);
    expect(r.rate).toBeGreaterThan(0);

    const rowRejected = await rptRow(rejected.id);
    expect(rowRejected?.['status']).toBe('TU_CHOI');
  });

  it('`0039` người lập XOÁ hồ sơ bị từ chối thì con số KHÔNG đổi', async () => {
    /*
     * Chỗ dễ hỏng nhất của `0039`, và hỏng theo hướng đẹp lên.
     *
     * Từ `0039` TDV bỏ được hồ sơ đã bị từ chối khỏi thẻ đếm của mình, và hồ sơ
     * chuyển `DA_XOA`. Nếu báo cáo đếm theo `status = 'TU_CHOI'` như trước thì
     * mỗi lần dọn màn hình là một lần tỷ lệ từ chối của chính người đó tụt
     * xuống — một chỉ số tự bào mòn, mà không ai nhìn ra vì nó chỉ nhỏ đi.
     *
     * Nên báo cáo đếm theo `rejected_at`: một mốc ĐÃ XẢY RA, không đảo được.
     */
    const rejected = await draft();
    expect((await act(rejected.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect(
      (await act(rejected.id, 'TBP_REJECT', 'tbp01', { reason: 'Chiết khấu vượt trần' })).status,
    ).toBe(200);
    await flushSync([rejected.id]);

    const truoc = (await rget('/reports/return-rate', 'bld01')).body;

    // Người lập bỏ nó đi.
    expect((await pdel(`/policies/${rejected.id}`, 'tdv01')).status).toBe(204);
    await flushSync([rejected.id]);
    expect((await rptRow(rejected.id))?.['status']).toBe('DA_XOA');

    const sau = (await rget('/reports/return-rate', 'bld01')).body;
    expect(sau.rejected, 'xoá khỏi màn hình không được xoá khỏi báo cáo').toBe(truoc.rejected);
    expect(sau.returnedOrRejected).toBe(truoc.returnedOrRejected);
    expect(sau.rate).toBe(truoc.rate);
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

    const r = (await rget('/reports/sla', 'bld01')).body;
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
    // Lọc theo MÃ KHÁCH HÀNG: `draft()` sinh mã duy nhất cho mỗi hồ sơ, nên nó
    // khoanh đúng một dòng — vai trò mà mã số thuế giữ trước `0077`.
    const wanted = await draft({ name: 'Nhà thuốc Thiên Ân' });
    await draft({ name: 'Không nằm trong bộ lọc' });

    const req = await rpost('/reports/exports', { customerCode: wanted.customerCode });
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

  it('`0077` số dòng trong file KHỚP con số màn hình đang hiện', async () => {
    /*
     * Bất biến đáng giá nhất của `0077`, và là lý do nút xuất chuyển sang màn
     * hình Hồ sơ: người dùng đọc "27 hồ sơ khớp điều kiện", bấm xuất, rồi mở
     * file ra và ĐẾM. Hai con số ấy phải là một.
     *
     * Chúng có thể lệch rất dễ: `count` và việc xuất là hai đường khác nhau, hai
     * lần chốt phạm vi khác nhau, và cùng đọc một bộ lọc do người dùng gửi. Chỉ
     * cần một bên quên `cleanFilter` hoặc hiểu khác một chuỗi nhiều giá trị là
     * lệch — mà không có gì báo, chỉ có một file thiếu vài dòng.
     */
    const a = await draft({ who: 'tdv01', groupCode: groupB });
    const b = await draft({ who: 'tdv01', groupCode: groupB });
    await draft({ who: 'tdv01', groupCode: groupA });

    const loc = { productGroupCode: groupB, customerCode: `${a.customerCode},${b.customerCode}` };
    const qs = new URLSearchParams(loc).toString();

    const dem = await rget(`/reports/policies/count?${qs}`);
    expect(dem.status).toBe(200);
    expect(dem.body.total).toBe(2);

    const req = await rpost('/reports/exports', loc);
    expect(req.status).toBe(202);
    const done = await waitExport(req.body.jobId);
    expect(done.status).toBe('XONG');
    expect(done.rowCount, 'số dòng file khác con số trên màn hình').toBe(dem.body.total);
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

/**
 * `0045` — hai thẻ của Sale Admin, và hồ sơ quá hạn không được biến mất.
 *
 * Cả nhóm này kiểm đúng MỘT tính chất, ở hai chỗ khác nhau của nó: **con số trên
 * thẻ và danh sách mà bấm vào thẻ mở ra phải là cùng một tập hồ sơ**. Lệch nhau
 * thì không có lỗi nào nổi lên — người dùng chỉ thấy một ô ghi 12 mở ra 9 dòng,
 * và tự nghi ngờ mình đếm sai.
 */
describe('`0045` thẻ đếm theo bước, và hai việc của Sale Admin', () => {
  /** Hồ sơ đang nằm trên bàn Sale Admin ở bước B8, chưa ai bắt in lại. */
  async function toiSaleAdmin(): Promise<string> {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    await flushSync([d.id]);
    return d.id;
  }

  /** Đưa hồ sơ tới bàn kế toán lần 2 — cần bản scan mới bàn giao được (WF-14). */
  async function toiKeToanL2(id: string): Promise<void> {
    expect(
      (
        await ppost(
          `/policies/${id}/attachments`,
          { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: uniq('scan') },
          'sa01',
        )
      ).status,
    ).toBe(201);
    expect((await act(id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    await flushSync([id]);
  }

  const moc = (id: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ a: string | null; b: string | null }>(
        `SELECT p.reprint_requested_at AS a, r.reprint_requested_at AS b
           FROM pol.policy p LEFT JOIN rpt.policy_row r ON r.policy_id = p.id
          WHERE p.id = $1`,
        [id],
      );
      return r.rows[0]!;
    });

  it('yêu cầu in lại đặt mốc, bàn giao lại xoá mốc', async () => {
    const id = await toiSaleAdmin();
    expect((await moc(id)).a, 'chưa ai bắt in lại mà đã có mốc').toBeNull();

    await toiKeToanL2(id);
    expect((await act(id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Bản in mờ' })).status).toBe(200);
    await flushSync([id]);

    const sau = await moc(id);
    expect(sau.a, 'nguồn chưa ghi mốc in lại').not.toBeNull();
    expect(sau.b, 'read-model chưa chép mốc sang').not.toBeNull();

    // Bàn giao lại: hồ sơ rời bàn Sale Admin, mốc phải mất theo. Còn lại thì lần
    // sau hồ sơ quay về B8 vì lý do khác vẫn bị gắn nhãn đỏ "Lỗi bản cứng".
    await toiKeToanL2(id);
    expect((await moc(id)).a, 'bàn giao rồi mà mốc còn').toBeNull();
  });

  it('hai nửa của B8 tách ra hai ô đếm riêng', async () => {
    const thuong = await toiSaleAdmin();
    const inLai = await toiSaleAdmin();
    await toiKeToanL2(inLai);
    expect((await act(inLai, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Mất dấu' })).status).toBe(200);
    await flushSync([thuong, inLai]);

    const r = await rget('/reports/progress', 'sa01');
    expect(r.status).toBe(200);
    const o = r.body.byStepDetail as Record<string, { total: number; overdue: number }>;
    expect(o.B8_TRINH_KY?.total ?? 0).toBeGreaterThan(0);
    expect(o.B8_LOI_BAN_CUNG?.total ?? 0).toBeGreaterThan(0);

    // Và cái quan trọng: bấm vào thẻ nào mở ra đúng hồ sơ của thẻ ấy.
    const ma = async (q: string) =>
      (await rget(`/reports/policies?${q}&limit=200`, 'sa01')).body.items.map(
        (x: { policyId: string }) => x.policyId,
      );
    const trinhKy = await ma('pendingStep=B8_SA_XU_LY&reprint=0');
    const loi = await ma('pendingStep=B8_SA_XU_LY&reprint=1');
    expect(trinhKy).toContain(thuong);
    expect(trinhKy).not.toContain(inLai);
    expect(loi).toContain(inLai);
    expect(loi).not.toContain(thuong);
  });

  it('bỏ `reprint` thì lấy trọn cả hai nửa — đúng cho thẻ "Đang chờ"', async () => {
    const thuong = await toiSaleAdmin();
    const inLai = await toiSaleAdmin();
    await toiKeToanL2(inLai);
    expect((await act(inLai, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Nhoè chữ' })).status).toBe(200);
    await flushSync([thuong, inLai]);

    const r = await rget('/reports/policies?pendingStep=B8_SA_XU_LY&limit=200', 'kt01');
    const ids = r.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids).toContain(thuong);
    expect(ids).toContain(inLai);
  });

  it('`reprint` nhận giá trị lạ thì 400, không im lặng bỏ qua', async () => {
    // Bỏ qua một tiêu chí không hiểu ở đây nghĩa là MỞ RỘNG kết quả ra cả hai
    // nhóm — sai theo hướng trả về nhiều hơn, tức là kiểu sai phải báo.
    const r = await rget('/reports/policies?pendingStep=B8_SA_XU_LY&reprint=2', 'sa01');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
    expect(r.body.field).toBe('reprint');
  });

  it('`0053` danh sách hồ sơ mang cờ `sapQuaHan` cho từng dòng', async () => {
    /*
     * Cột *Số dòng* trên màn hình danh sách đổi thành *Hạn xử lý*: số dòng sản
     * phẩm là con số không ai làm gì với nó ở đó, còn "hồ sơ nào sắp hết giờ" thì
     * quyết định thứ tự xử lý.
     *
     * Cờ tính ở MÁY CHỦ bằng đúng biểu thức của thẻ *Sắp quá hạn* và tiêu chí
     * `han=SAP_QUA_HAN`. Ba chỗ cùng một định nghĩa, nên phép kiểm ở đây là: cờ
     * trên dòng và tập bộ lọc trả về phải khớp nhau tuyệt đối.
     */
    const sapChet = await draft();
    expect((await act(sapChet.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    const conLau = await draft();
    expect((await act(conLau.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([sapChet.id, conLau.id]);

    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE pol.policy SET sla_due_at = now() + interval '5 hours' WHERE id = $1`,
        [sapChet.id],
      );
      await c.query(
        `UPDATE pol.policy SET sla_due_at = now() + interval '9 days' WHERE id = $1`,
        [conLau.id],
      );
    });
    await sync.refreshPolicy(sapChet.id);
    await sync.refreshPolicy(conLau.id);

    const ds = (await rget('/reports/policies?limit=200', 'tbp01')).body.items as {
      policyId: string;
      sapQuaHan: boolean;
    }[];
    const co = (id: string) => ds.find((x) => x.policyId === id)!;
    expect(co(sapChet.id).sapQuaHan, 'hồ sơ còn 5 giờ mà không được đánh dấu').toBe(true);
    expect(co(conLau.id).sapQuaHan, 'hồ sơ còn 9 ngày mà bị đánh dấu').toBe(false);

    // Và cờ phải khớp ĐÚNG tập của bộ lọc — hai đường đọc cùng một định nghĩa.
    const loc = new Set(
      (await rget('/reports/policies?han=SAP_QUA_HAN&limit=200', 'tbp01')).body.items.map(
        (x: { policyId: string }) => x.policyId,
      ),
    );
    const theoCo = new Set(ds.filter((x) => x.sapQuaHan).map((x) => x.policyId));
    expect(theoCo).toEqual(loc);
  });

  it('`0053` cờ ấy KHÔNG lọt vào file Excel', async () => {
    // `COLUMNS` bên `exports/sheet.ts` khai riêng theo tên khoá, nên thêm cột vào
    // câu SELECT không đụng tới bảng tính. Khẳng định thẳng để lần sau ai thêm
    // cột cũng phải tự hỏi nó có thuộc về file xuất ra hay không.
    expect(COLUMNS.map((c) => c.key)).not.toContain('sapQuaHan');
  });

  it('`0051` binding của reporting PHỦ được khoá mà sla-worker phát', () => {
    /*
     * Chốt thứ hai, và nó cần thiết vì chốt tích hợp ở dưới CÓ THỂ XANH GIẢ.
     *
     * Binding của RabbitMQ cộng dồn và nằm lại trên broker: hàng đợi đã buộc
     * `sla.#` một lần thì giữ mãi, kể cả khi ai đó lùi dòng khai báo trong mã.
     * Ca dưới sẽ vẫn xanh trên một broker cũ, trong khi môi trường dựng mới lại
     * hỏng — đúng kiểu lỗi chỉ lộ ra lúc triển khai.
     *
     * Phép so ở đây đọc thẳng bảng khai báo, không đụng tới broker.
     */
    const khop = (mau: string, khoa: string): boolean =>
      new RegExp(
        `^${mau.split('.').map((x) => (x === '#' ? '.*' : x === '*' ? '[^.]+' : x)).join('\\.')}$`,
      ).test(khoa);

    for (const khoa of ['sla.overdue', 'sla.reminder', 'policy.sla_discarded']) {
      expect(
        BUS.bindings.reporting.some((m) => khop(m, khoa)),
        `read-model không nghe thấy "${khoa}"`,
      ).toBe(true);
    }
  });

  it('`0051` sự kiện QUÁ HẠN tới được read-model — không cần ai gọi đồng bộ tay', async () => {
    /*
     * Lỗi đã sống lâu, và mọi ca kiểm thử trước đều che mất nó.
     *
     * sla-worker phát `sla.overdue`, nhưng hàng đợi reporting chỉ buộc `policy.#`
     * và `customer.#` — khoá ấy không khớp cái nào. Read-model vì thế không bao
     * giờ biết hồ sơ đã quá hạn. Các ca `0047` gọi `sync.refreshPolicy()` THẲNG
     * nên chúng xanh mà không chứng minh được đường đi qua bus.
     *
     * Ở đây KHÔNG gọi `refreshPolicy`: chỉ ghi nguồn, đẩy sự kiện, rồi chờ.
     * Thiếu binding thì `flushSync` hết giờ — đúng cách nó phải hỏng.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([d.id]);

    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE pol.policy
            SET status = 'QUA_HAN_DUYET', pending_step = 'B4_TBP_DUYET',
                overdue_at = now(), row_version = row_version + 1
          WHERE id = $1`,
        [d.id],
      );
      // Đúng khoá và đúng hình dạng sla-worker phát ra.
      await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
        'sla.overdue',
        JSON.stringify({ policyId: d.id, action: 'SLA_OVERDUE', toStatus: 'QUA_HAN_DUYET' }),
      ]);
    });

    await flushSync([d.id]);

    const row = await rptRow(d.id);
    expect(row?.['status'], 'read-model không nghe thấy sự kiện quá hạn').toBe('QUA_HAN_DUYET');
  });

  it('`0047` hồ sơ QUÁ HẠN rơi khỏi MỌI thẻ đếm việc', async () => {
    /*
     * ĐẢO CHIỀU so với `0045`, và cố ý giữ lại ca này để đọc ra được cả hai lần
     * đổi ý.
     *
     * `0045`: quá hạn chỉ là cái nhãn, người phụ trách vẫn duyệt được, nên thẻ
     * của bước phải đếm nó — bỏ ra là làm hồ sơ trễ nhất biến mất khỏi màn hình
     * của người duy nhất xử lý được chúng.
     *
     * `0047`: quá hạn là chết, không ai thao tác được, 3 ngày sau hệ thống xoá.
     * Giờ đếm nó vào một ô đếm VIỆC là nói dối về lượng việc — bảo người ta còn
     * 12 việc trong khi 3 trong số đó không bấm được gì.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([d.id]);

    const truoc = ((await rget('/reports/progress', 'tbp01')).body.byStepDetail
      ?.B4_TBP_DUYET?.total ?? 0) as number;

    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE pol.policy
            SET status = 'QUA_HAN_DUYET', pending_step = 'B4_TBP_DUYET',
                overdue_at = now(), row_version = row_version + 1
          WHERE id = $1`,
        [d.id],
      );
    });
    await sync.refreshPolicy(d.id);

    const sau = ((await rget('/reports/progress', 'tbp01')).body.byStepDetail
      ?.B4_TBP_DUYET?.total ?? 0) as number;
    expect(sau, 'hồ sơ chết vẫn bị đếm là việc phải làm').toBe(truoc - 1);

    // Và bộ lọc theo bước cũng không thấy nó — đếm và lọc phải cùng một tập.
    const theoBuoc = (await rget('/reports/policies?pendingStep=B4_TBP_DUYET&limit=200', 'tbp01'))
      .body.items.map((x: { policyId: string }) => x.policyId);
    expect(theoBuoc).not.toContain(d.id);

    // Nó vẫn TRA RA ĐƯỢC bằng bộ lọc trạng thái. Đây là chỗ nó rời khỏi luồng
    // việc, không phải chỗ nó biến mất khỏi phần mềm.
    const theoTrangThai = (await rget('/reports/policies?status=QUA_HAN_DUYET&limit=200', 'tbp01'))
      .body.items.map((x: { policyId: string }) => x.policyId);
    expect(theoTrangThai).toContain(d.id);
  });

  it('`0047` thẻ Sắp quá hạn đếm hồ sơ còn dưới 24 giờ, và chỉ hồ sơ còn sống', async () => {
    const sapChet = await draft();
    expect((await act(sapChet.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    const daChet = await draft();
    expect((await act(daChet.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([sapChet.id, daChet.id]);

    /*
     * Đặt thẳng vào CSDL: `SAP_QUA_HAN` so với `now()` của Postgres, nên không
     * có đồng hồ nào tiêm được. Hồ sơ thứ hai đã quá hạn nhưng `sla_due_at` của
     * nó VẪN nằm đó, đã trôi qua — nó là cái bẫy mà vế `status <> 'QUA_HAN_DUYET'`
     * trong `SAP_QUA_HAN` sinh ra để đỡ.
     */
    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE pol.policy SET sla_due_at = now() + interval '6 hours' WHERE id = $1`,
        [sapChet.id],
      );
      await c.query(
        `UPDATE pol.policy
            SET status = 'QUA_HAN_DUYET', pending_step = 'B4_TBP_DUYET',
                sla_due_at = now() - interval '1 hour', overdue_at = now(),
                row_version = row_version + 1
          WHERE id = $1`,
        [daChet.id],
      );
    });
    await sync.refreshPolicy(sapChet.id);
    await sync.refreshPolicy(daChet.id);

    const ds = await rget('/reports/policies?han=SAP_QUA_HAN&limit=200', 'tbp01');
    const ids = ds.body.items.map((x: { policyId: string }) => x.policyId);
    expect(ids, 'hồ sơ sắp quá hạn không vào thẻ').toContain(sapChet.id);
    expect(ids, 'hồ sơ ĐÃ chết lọt vào thẻ Sắp quá hạn').not.toContain(daChet.id);

    // Con số trên thẻ = tổng `soon` của mọi bước, và phải khớp danh sách.
    const o = (await rget('/reports/progress', 'tbp01')).body.byStepDetail as Record<
      string,
      { total: number; soon: number }
    >;
    const tong = Object.values(o).reduce((a, x) => a + x.soon, 0);
    expect(tong).toBe(ids.length);
  });

  it('`0059` hồ sơ hệ thống ĐÃ XOÁ không lọt vào *Sắp quá hạn*', async () => {
    /*
     * `discardOverdue` (`0047`) chuyển hồ sơ quá hạn quá 3 ngày sang `DA_XOA`
     * nhưng KHÔNG xoá `sla_due_at`. Với hai vế cũ — "chưa mang QUA_HAN_DUYET" và
     * "hạn trong vòng 24 giờ" — hồ sơ ấy thoả cả hai và lọt vào thẻ *Sắp quá hạn*
     * VĨNH VIỄN.
     *
     * Mà thẻ thì đếm qua `byStepDetail`, vốn đã lọc theo bước, nên nó KHÔNG đếm
     * hồ sơ ấy: thẻ ghi 5, bấm vào ra 6 dòng. Đúng kiểu lệch người dùng đếm được
     * còn phép kiểm thì không.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await flushSync([d.id]);

    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE pol.policy
            SET status = 'DA_XOA', sla_due_at = now() - interval '5 days',
                row_version = row_version + 1
          WHERE id = $1`,
        [d.id],
      );
    });
    await sync.refreshPolicy(d.id);

    const ids = (await rget('/reports/policies?han=SAP_QUA_HAN&limit=200', 'tbp01')).body.items.map(
      (x: { policyId: string }) => x.policyId,
    );
    expect(ids, 'hồ sơ đã xoá vẫn nằm trong danh sách sắp quá hạn').not.toContain(d.id);

    // Và cờ trên từng dòng cũng phải nói đúng như vậy.
    const dong = (await rget('/reports/policies?status=DA_XOA&limit=200', 'tbp01')).body.items.find(
      (x: { policyId: string }) => x.policyId === d.id,
    );
    expect(dong?.sapQuaHan, 'cờ trên dòng nói ngược với bộ lọc').toBe(false);
  });

  it('`han` nhận giá trị lạ thì 400', async () => {
    const r = await rget('/reports/policies?han=KHONG_CO_GIA_TRI_NAY', 'tbp01');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('han');
  });

  it('con số trên thẻ bằng đúng số dòng danh sách mở ra', async () => {
    // Bất biến của cả đợt, kiểm thẳng: đếm và lọc phải cho ra cùng một tập.
    const id = await toiSaleAdmin();
    await flushSync([id]);

    const o = (await rget('/reports/progress', 'sa01')).body.byStepDetail as Record<
      string,
      { total: number }
    >;
    const dem = o.B8_TRINH_KY?.total ?? 0;
    const ds = await rget('/reports/policies?pendingStep=B8_SA_XU_LY&reprint=0&limit=200', 'sa01');
    expect(ds.body.items.length).toBe(dem);
    expect(dem).toBeGreaterThan(0);
  });
});
