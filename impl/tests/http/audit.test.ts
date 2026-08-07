/**
 * AUD-01 … AUD-11 — nhật ký chỉ ghi thêm.
 *
 * `AUD-03` và `AUD-04` (chặn UPDATE/DELETE ở tầng CSDL) đã có từ P1 ở
 * `tests/db/roles.test.ts` và `tests/db/constraints.test.ts`. Ở đây là phần còn
 * lại: ghi được gì, ghi đủ không, và mất vết ở đâu không.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createPolicyApp, PolicyOutbox } from '@csbh/policy/testing';
import { CustomerOutbox } from '@csbh/customer/testing';
import { createTestApp as createAuditApp, AuditService } from '@csbh/audit/testing';
import { Bus, BUS } from '@csbh/bus';
import { TRACE_HEADER } from '@csbh/http-kit';
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
const P = 'ZZAUD';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let audit: INestApplication;
let outbox: PolicyOutbox;
let cusOutbox: CustomerOutbox;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

let n = 0;
const uniq = (k: string) => `${P}-${k}-${++n}-${Date.now() % 100000}`;

const ppost = async (path: string, body: object, who: string, trace?: string) => {
  const r = (await http(policy)).post(path).set('Authorization', `Bearer ${tok[who]}`);
  if (trace) r.set(TRACE_HEADER, trace);
  return r.send(body);
};
const aget = async (path: string, who: string) =>
  (await http(audit)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const act = (id: string, action: string, who: string, body: object = {}, trace?: string) =>
  ppost(`/policies/${id}/actions/${action}`, body, who, trace);

/** Đợi tới khi nhật ký có đủ số dòng cho một hồ sơ. */
async function waitEntries(entityId: string, want: number, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  let rows: { action: string; trace_id: string | null; actor_ip: string | null }[] = [];
  while (Date.now() < until) {
    rows = await withAdminDb(async (c) => {
      const r = await c.query<{ action: string; trace_id: string | null; actor_ip: string | null }>(
        `SELECT action, trace_id, host(actor_ip) AS actor_ip FROM aud.audit_log
          WHERE entity_id = $1 ORDER BY occurred_at, id`,
        [entityId],
      );
      return r.rows;
    });
    if (rows.length >= want) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`chỉ có ${rows.length}/${want} dòng nhật ký cho ${entityId}`);
}

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';

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
  return r.body.id as string;
};

const makeCustomer = async () => {
  const r = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      code: uniq('KH'),
      name: 'Nhà thuốc Minh Châu',
      customerType: 1,
      registeredAddress: 'Số 8 Tôn Thất Thuyết, Hà Nội',
      ownerName: 'Trần Thị Mỹ Hạnh',
    });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return r.body.id as string;
};

async function draft(): Promise<{ id: string; customerId: string }> {
  const customerId = await makeCustomer();
  const productId = await makeProduct();
  const r = await ppost(
    '/policies',
    { customerId, lines: [{ productId, wholesalePrice: '90000', cpbh1: '3000' }] },
    'tdv01',
  );
  if (r.status !== 201) throw new Error(`lập hồ sơ hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, customerId };
}

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

  policy = await createPolicyApp();
  outbox = policy.get(PolicyOutbox);
  cusOutbox = customer.get(CustomerOutbox);

  const purge = new Bus();
  await purge.declareConsumer(BUS.queues.audit, BUS.queues.auditDlq, BUS.bindings.audit);
  const ch = await purge.channel();
  await ch.purgeQueue(BUS.queues.audit);
  await purge.close();

  await withAdminDb(async (db) => {
    await db.query(`UPDATE pol.outbox SET published_at = now() WHERE published_at IS NULL`);
    await db.query(`UPDATE cus.outbox SET published_at = now() WHERE published_at IS NULL`);
  });

  audit = await createAuditApp();

  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom AUD' });
  groupCode = g.body.code as string;
}, 120_000);

afterAll(async () => {
  await audit?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
});

const flush = async () => {
  await outbox.pumpOnce();
  await cusOutbox.pumpOnce();
};

// =============================================================================
// AUD-01 · AUD-06 — mọi hành động đều sinh bản ghi, và bản ghi đủ trường
// =============================================================================

describe('AUD-01 các loại hành động đều sinh bản ghi nhật ký', () => {
  it('chạy hết luồng duyệt thì mỗi bước có đúng một dòng', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    await ppost(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    await act(d.id, 'SA_HANDOVER', 'sa01');
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Bản cứng mờ' });

    await flush();
    const rows = await waitEntries(d.id, 6);
    const actions = rows.map((r) => r.action);

    for (const a of [
      'SUBMIT',
      'TBP_SIGN',
      'PUBLISH_SIGNED',
      'KT_RECEIVE_L1',
      'SA_HANDOVER',
      'KT_REQUEST_REPRINT',
    ]) {
      expect(actions, `thiếu nhật ký cho ${a}`).toContain(a);
    }
    // AUD-07: bản scan bị huỷ nhưng nhật ký vẫn giữ vết việc huỷ.
    expect(actions).toContain('SCAN_DISCARDED');
  }, 120_000);
});

describe('AUD-06 cấu trúc một bản ghi nhật ký', () => {
  it('có người dùng, IP, thời điểm, mã hồ sơ, hành động và trace-id', async () => {
    const d = await draft();
    const trace = `trace-aud-${Date.now()}`;
    await act(d.id, 'SUBMIT', 'tdv01', {}, trace);
    await flush();
    await waitEntries(d.id, 1);

    const row = await withAdminDb(async (c) => {
      const r = await c.query<Record<string, unknown>>(
        `SELECT occurred_at, actor_id, actor_role, host(actor_ip) AS actor_ip, action,
                entity, entity_id, trace_id, app_version, event_id
           FROM aud.audit_log WHERE entity_id = $1 AND action = 'SUBMIT'`,
        [d.id],
      );
      return r.rows[0]!;
    });

    expect(row['action']).toBe('SUBMIT');
    expect(row['entity']).toBe('policy');
    expect(row['entity_id']).toBe(d.id);
    expect(row['actor_id']).toBeTruthy();
    expect(row['occurred_at']).toBeInstanceOf(Date);
    expect(row['event_id']).toBeTruthy();
    // trace-id nhận TỪ ĐẦU VÀO, không sinh mới — điều kiện để nối lại cả chuỗi.
    expect(row['trace_id']).toBe(trace);
    // IP có mặt: middleware lấy từ tầng HTTP và ngữ cảnh mang nó xuống tận nơi phát.
    expect(String(row['actor_ip'] ?? '')).toMatch(/^[0-9a-f.:]+$/i);
  }, 90_000);

  it('INT-11 tra lại toàn bộ chuỗi bằng MỘT truy vấn theo trace-id', async () => {
    const d = await draft();
    const trace = `trace-chain-${Date.now()}`;
    // Một request → nhiều sự kiện: ký số phát cả TBP_SIGN lẫn PUBLISH_SIGNED.
    await act(d.id, 'SUBMIT', 'tdv01', {}, trace);
    await act(d.id, 'TBP_SIGN', 'tbp01', {}, trace);
    await flush();
    await waitEntries(d.id, 3);

    const chain = await aget(`/audit/entries?traceId=${trace}&limit=50`, 'bld01');
    expect(chain.status).toBe(200);
    const actions = (chain.body.items as { action: string }[]).map((x) => x.action);
    expect(actions).toContain('SUBMIT');
    expect(actions).toContain('TBP_SIGN');
    expect(actions).toContain('PUBLISH_SIGNED');
  }, 90_000);
});

describe('AUD-02 sửa một trường quan trọng', () => {
  it('lưu giá trị TRƯỚC và SAU', async () => {
    const customerId = await makeCustomer();
    const before = 'Số 8 Tôn Thất Thuyết, Hà Nội';
    const after = 'Số 145 Nguyễn Trãi, Thanh Xuân, Hà Nội';

    const upd = await (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['sa01']}`)
      .send({ registeredAddress: after });
    expect(upd.status).toBe(200);

    await flush();
    await waitEntries(customerId, 1);

    const row = await withAdminDb(async (c) => {
      const r = await c.query<{ before_data: Record<string, unknown>; after_data: Record<string, unknown> }>(
        `SELECT before_data, after_data FROM aud.audit_log WHERE entity_id = $1`,
        [customerId],
      );
      return r.rows[0]!;
    });
    expect(row.before_data['registeredAddress']).toBe(before);
    expect(row.after_data['registeredAddress']).toBe(after);
  }, 90_000);
});

// =============================================================================
// AUD-08 — nỗ lực vượt quyền vẫn được ghi
// =============================================================================

describe('AUD-08 thao tác vượt quyền bị từ chối', () => {
  it('nhật ký vẫn ghi lại nỗ lực đó', async () => {
    const d = await draft();
    // tdv03 thuộc nhánh khác trong cây tổ chức — hồ sơ này ngoài phạm vi.
    const denied = await act(d.id, 'SUBMIT', 'tdv03');
    expect(denied.status).toBe(403);

    // Bản ghi outbox đã COMMIT xong trước khi 403 tới tay người gọi — filter chờ
    // câu INSERT chứ không bắn đi rồi quên. Nên bơm một lần là đủ, không phải
    // dò tìm trong một cuộc đua.
    const written = await withAdminDb(async (c) => {
      const r = await c.query(
        `SELECT 1 FROM pol.outbox WHERE routing_key = 'security.denied'
          AND payload->>'id' = $1`,
        [d.id],
      );
      return r.rowCount;
    });
    expect(written).toBe(1);

    await flush();
    const rows = await waitEntries(d.id, 1);
    expect(rows.map((r) => r.action)).toContain('ACCESS_DENIED');

    const row = await withAdminDb(async (c) => {
      const r = await c.query<{ actor_role: string; reason: string; after_data: Record<string, string> }>(
        `SELECT actor_role, reason, after_data FROM aud.audit_log
          WHERE entity_id = $1 AND action = 'ACCESS_DENIED'`,
        [d.id],
      );
      return r.rows[0]!;
    });
    expect(row.actor_role).toBe('TDV');
    expect(row.reason).toBeTruthy();
    expect(row.after_data['method']).toBe('POST');
  }, 90_000);
});

// =============================================================================
// AUD-05 — API nhật ký chỉ đọc
// =============================================================================

describe('AUD-05 audit-service không có đường ghi', () => {
  it('bảng định tuyến không có POST, PUT, PATCH hay DELETE', () => {
    const server = audit.getHttpServer() as {
      _events: { request: { _router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } } };
    };
    const stack = server._events.request._router?.stack ?? [];
    const methods = stack
      .filter((l) => l.route)
      .flatMap((l) => Object.keys(l.route!.methods).filter((m) => l.route!.methods[m]));

    expect(methods.length).toBeGreaterThan(0);
    for (const forbidden of ['post', 'put', 'patch', 'delete']) {
      expect(methods, `audit không được có route ${forbidden.toUpperCase()}`).not.toContain(
        forbidden,
      );
    }
  });

  it('vai trò trong luồng duyệt không đọc được nhật ký', async () => {
    expect((await aget('/audit/entries', 'tdv01')).status).toBe(403);
    expect((await aget('/audit/entries', 'kt01')).status).toBe(403);
    expect((await aget('/audit/entries', 'bld01')).status).toBe(200);
    expect((await aget('/audit/entries', 'admin01')).status).toBe(200);
  }, 60_000);
});

// =============================================================================
// AUD-09 — báo cáo hoạt động người dùng
// =============================================================================

describe('AUD-09 báo cáo nhật ký người dùng', () => {
  it('đếm đúng số lần theo từng hành động', async () => {
    const tbpId = await withAdminDb(async (c) => {
      const r = await c.query<{ id: string }>(`SELECT id FROM idn.app_user WHERE username='tbp01'`);
      return r.rows[0]!.id;
    });
    const from = new Date().toISOString();

    const a = await draft();
    const b = await draft();
    for (const d of [a, b]) {
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_SIGN', 'tbp01');
    }
    await flush();
    await waitEntries(b.id, 3);

    const rpt = await aget(`/audit/user-activity?actorId=${tbpId}&from=${from}`, 'bld01');
    expect(rpt.status).toBe(200);
    // Hai lần ký số, không hơn không kém — đây chính là con số mà việc ghi trùng
    // sẽ làm sai, và là lý do khoá chống trùng ở migration 0015 tồn tại.
    expect(rpt.body.byAction['TBP_SIGN']).toBe(2);
  }, 120_000);

  it('INT-03 cùng một sự kiện tới ba lần chỉ ghi MỘT dòng', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const ev = await withAdminDb(async (c) => {
      const r = await c.query<{ id: string; routing_key: string; payload: Record<string, unknown> }>(
        `SELECT id, routing_key, payload FROM pol.outbox
          WHERE payload->>'policyId' = $1 ORDER BY seq DESC LIMIT 1`,
        [d.id],
      );
      return r.rows[0]!;
    });

    const svc = audit.get(AuditService);
    const incoming = { eventId: ev.id, routingKey: ev.routing_key, payload: ev.payload };
    const outcomes = [
      await svc.record(incoming),
      await svc.record(incoming),
      await svc.record(incoming),
    ];
    expect(outcomes).toEqual(['written', 'duplicate', 'duplicate']);

    const count = await withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM aud.audit_log WHERE event_id = $1`,
        [ev.id],
      );
      return Number(r.rows[0]!.n);
    });
    expect(count).toBe(1);
  }, 90_000);
});

// =============================================================================
// AUD-10 · AUD-11 — tắt hẳn audit-service
// =============================================================================

describe('AUD-10 · AUD-11 audit-service ngừng chạy', () => {
  it('nghiệp vụ vẫn hoàn tất, sự kiện dồn ở hàng đợi và được ghi bù', async () => {
    await audit.close();

    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    await flush();
    await new Promise((r) => setTimeout(r, 300));

    // AUD-10: mốc thời gian là CỘT RIÊNG trên hồ sơ, không phải suy ra từ nhật
    // ký — nên báo cáo tiến độ và SLA vẫn đúng khi audit chết.
    const row = await withAdminDb(async (c) => {
      const r = await c.query<{
        status: string;
        submitted_at: Date | null;
        tbp_signed_at: Date | null;
        kt_l1_received_at: Date | null;
      }>(
        `SELECT status::text, submitted_at, tbp_signed_at, kt_l1_received_at
           FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return r.rows[0]!;
    });
    expect(row.status).toBe('SA_DANG_XU_LY');
    expect(row.submitted_at).not.toBeNull();
    expect(row.tbp_signed_at).not.toBeNull();
    expect(row.kt_l1_received_at).not.toBeNull();

    // Chưa có dòng nhật ký nào cho hồ sơ này.
    const before = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT 1 FROM aud.audit_log WHERE entity_id = $1`, [d.id]);
      return r.rowCount;
    });
    expect(before).toBe(0);

    // AUD-11: bật lại thì vết được ghi bù, không mất gì.
    audit = await createAuditApp();
    const rows = await waitEntries(d.id, 4);
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['SUBMIT', 'TBP_SIGN', 'PUBLISH_SIGNED', 'KT_RECEIVE_L1']),
    );
  }, 120_000);
});
