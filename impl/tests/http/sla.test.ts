/**
 * NTF-07 … NTF-12, NTF-14, NTF-15 — hạn xử lý, nhắc trước một ngày, quá hạn.
 *
 * Không chờ 14 ngày thật: đồng hồ là một ĐẦU VÀO tiêm được, test đẩy nó tới ngày
 * 13 rồi ngày 14 và gọi thẳng vòng quét. Mọi thứ còn lại đều thật — Postgres
 * thật, Redis thật, RabbitMQ thật, thư đọc lại từ Mailpit.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { createTestApp as createPolicyApp, PolicyOutbox } from '@csbh/policy/testing';
import { createTestApp as createNotificationApp } from '@csbh/notification/testing';
import { createTestWorker, SlaService, Clock } from '@csbh/sla-worker/testing';
import { Bus, BUS } from '@csbh/bus';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  maDuyNhat,
  http,
  mailpitClear,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZSLA';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let ntf: INestApplication;
let worker: TestingModule;
let sla: SlaService;
let clock: Clock;
let outbox: PolicyOutbox;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const uniq = (k: string) => maDuyNhat(P, k);

const ppost = async (path: string, body: object, who: string) =>
  (await http(policy)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const pget = async (path: string, who: string) =>
  (await http(policy)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const pput = async (path: string, body: object, who: string) =>
  (await http(policy)).put(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const act = (id: string, action: string, who: string, body: object = {}) =>
  ppost(`/policies/${id}/actions/${action}`, body, who);

const listMail = async (): Promise<{ ID: string; To: { Address: string }[]; Subject: string }[]> => {
  const r = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  return ((await r.json()) as { messages: { ID: string; To: { Address: string }[]; Subject: string }[] })
    .messages;
};
const fullMail = async (id: string) =>
  (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string; Subject: string };

async function waitMail(want: number, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  let last = await listMail();
  while (Date.now() < until) {
    last = await listMail();
    if (last.length >= want) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`chỉ có ${last.length}/${want} thư sau ${timeoutMs}ms`);
}

const policyRow = (id: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{
      status: string;
      pending_step: string | null;
      sla_due_at: Date | null;
      sla_started_at: Date | null;
    }>(
      `SELECT status::text, pending_step::text, sla_due_at, sla_started_at
         FROM pol.policy WHERE id = $1`,
      [id],
    );
    return r.rows[0]!;
  });

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
    });
  await c
    .post(`/catalog/products/${r.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
  return r.body.id as string;
};

const makeCustomer = async (who = 'tdv01') => {
  const r = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok[who]}`)
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

/** Hồ sơ đã gửi duyệt — đang chờ Trưởng bộ phận, đồng hồ SLA bắt đầu chạy. */
async function submitted(who = 'tdv01'): Promise<string> {
  const customerId = await makeCustomer(who);
  const productId = await makeProduct();
  const r = await ppost(
    '/policies',
    { customerId, lines: [{ productId, wholesalePrice: '90000', cpbh: ['3000'] }] },
    who,
  );
  if (r.status !== 201) throw new Error(`lập hồ sơ hỏng: ${JSON.stringify(r.body)}`);
  expect((await act(r.body.id, 'SUBMIT', who)).status).toBe(200);

  // Đánh dấu thư "gửi duyệt" là đã phát. File test này chỉ quan tâm thư của
  // sla-worker; để nguyên thì mọi phép đếm thư đều cộng thêm một thư của bước
  // gửi duyệt, và thư đó lại tới TRƯỚC nên `flush(1)` bắt nhầm nó.
  await withAdminDb(async (c) => {
    await c.query(`UPDATE pol.outbox SET published_at = now() WHERE published_at IS NULL`);
  });
  return r.body.id as string;
}

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();
  for (const u of ['tdv01', 'tdv03', 'tbp01', 'tbp02', 'kt01', 'sa01', 'admin01', 'bld01']) {
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

  const purge = new Bus();
  await purge.declareConsumer(
    BUS.queues.notification,
    BUS.queues.notificationDlq,
    BUS.bindings.notification,
  );
  const ch = await purge.channel();
  await ch.purgeQueue(BUS.queues.notification);
  await purge.close();

  // Mọi hồ sơ đang chờ của các file test khác đều có hạn 14 ngày và sẽ lọt vào
  // vòng quét ở đây. Đẩy hạn của chúng ra xa để phép đếm chỉ tính hồ sơ của file này.
  await withAdminDb(async (db) => {
    await db.query(`UPDATE pol.outbox SET published_at = now() WHERE published_at IS NULL`);
    await db.query(
      `UPDATE pol.policy SET sla_due_at = now() + interval '3650 days',
                             sla_started_at = now()
        WHERE sla_due_at IS NOT NULL`,
    );
  });

  ntf = await createNotificationApp();
  worker = await createTestWorker();
  sla = worker.get(SlaService);
  clock = worker.get(Clock);

  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom SLA' });
  groupCode = g.body.code as string;
}, 120_000);

afterAll(async () => {
  clock?.reset();
  await worker?.close();
  await ntf?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
  // Trả cấu hình SLA về mặc định để file test khác không phụ thuộc thứ tự chạy.
  await withAdminDb(async (c) => {
    await c.query(`UPDATE pol.sla_config SET days = 14 WHERE id`);
  });
});

/**
 * Đẩy hạn của MỌI hồ sơ đang chờ ra xa trước mỗi test.
 *
 * Vòng quét là toàn cục — nó không biết test nào đang chạy. Hồ sơ do test trước
 * để lại vẫn đang chờ với hạn 14 ngày, nên lượt quét sau khi đẩy đồng hồ 13 ngày
 * sẽ nhắc cả chúng, và mọi phép đếm đều lệch. Đây không phải chuyện riêng của
 * test: nó phản ánh đúng việc worker chạy trên toàn bộ CSDL.
 */
const parkExistingPolicies = () =>
  withAdminDb(async (c) => {
    await c.query(
      `UPDATE pol.policy SET sla_due_at = now() + interval '3650 days', sla_started_at = now()
        WHERE sla_due_at IS NOT NULL`,
    );
  });

beforeEach(async () => {
  clock.reset();
  await parkExistingPolicies();
  await mailpitClear();
});

/** Bơm outbox rồi chờ notification gửi xong. */
const flush = async (want: number) => {
  await outbox.pumpOnce();
  return waitMail(want);
};

// =============================================================================
// SLA đặt hạn: 14 ngày, tính cả cuối tuần
// =============================================================================

describe('NTF-08 SLA tính cả thứ bảy và chủ nhật', () => {
  it('hạn đúng bằng ngày bắt đầu chờ cộng 14 ngày, không trừ ngày nghỉ nào', async () => {
    const id = await submitted();
    const row = await policyRow(id);

    expect(row.status).toBe('CHO_TBP_DUYET');
    expect(row.sla_started_at).not.toBeNull();
    const days =
      (row.sla_due_at!.getTime() - row.sla_started_at!.getTime()) / (24 * 60 * 60 * 1000);
    // Đúng 14,0 — không có lịch làm việc, không có ngày lễ. Nếu về sau ai thêm
    // logic trừ cuối tuần thì con số này sẽ thành 18 hoặc 20 và test đỏ ngay.
    expect(days).toBeCloseTo(14, 5);
  }, 60_000);
});

// =============================================================================
// NTF-09 · NTF-14 — nhắc trước một ngày, đúng MỘT lần
// =============================================================================

describe('NTF-09 đẩy đồng hồ tới ngày thứ 13', () => {
  it('gửi đúng một thư nhắc, cron chạy lại không gửi thêm', async () => {
    const id = await submitted();
    clock.advanceDays(13);

    const first = await sla.scan();
    expect(first.reminded).toBe(1);
    expect(first.overdue).toBe(0);

    // Cron chạy 5 phút một lần: trong ngày thứ 13 nó gặp hồ sơ này 288 lần.
    for (let i = 0; i < 3; i++) expect((await sla.scan()).reminded).toBe(0);

    const mails = await flush(1);
    expect(mails.length).toBe(1);
    const m = await fullMail(mails[0]!.ID);
    expect(m.Subject).toContain('sắp quá hạn');
    // Thư nhắc tới người phải xử lý (TBP) và TDV lập hồ sơ.
    expect(mails[0]!.To.map((t) => t.Address).sort()).toEqual([
      'tbp01@csbh.test',
      'tdv01@csbh.test',
    ]);
    expect(m.Text).toContain('Bước 4');

    const row = await policyRow(id);
    expect(row.status).toBe('CHO_TBP_DUYET'); // nhắc thôi, chưa quá hạn
  }, 90_000);

  it('NTF-14 worker restart giữa chừng cũng không gửi nhắc trùng', async () => {
    const id = await submitted();
    clock.advanceDays(13);
    expect((await sla.scan()).reminded).toBe(1);

    // Dựng một bản worker MỚI — mô phỏng container restart. Bộ nhớ tiến trình
    // mất sạch; chốt chống trùng phải nằm ở CSDL thì mới còn.
    const restarted = await createTestWorker();
    try {
      const sla2 = restarted.get(SlaService);
      restarted.get(Clock).advanceDays(13);
      expect((await sla2.scan()).reminded).toBe(0);
    } finally {
      await restarted.close();
    }

    const rows = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT 1 FROM pol.sla_reminder WHERE policy_id = $1`, [id]);
      return r.rowCount;
    });
    expect(rows).toBe(1);
  }, 90_000);
});

// =============================================================================
// NTF-15 — hai bản worker chạy cùng lúc
// =============================================================================

describe('NTF-15 chạy hai bản sla-worker', () => {
  it('khoá phân tán Redis: chỉ một bản thực thi vòng quét', async () => {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');
    await r.set('csbh:sla:scan', 'ban-khac-dang-giu', 'PX', 30_000);
    try {
      const res = await sla.scan();
      expect(res.skipped).toBe(true);
      expect(res.scanned).toBe(0);
    } finally {
      await r.del('csbh:sla:scan');
      await r.quit();
    }
  }, 60_000);

  it('hai bản quét đồng thời vẫn chỉ ra MỘT thư nhắc', async () => {
    const id = await submitted();
    const second = await createTestWorker();
    try {
      clock.advanceDays(13);
      second.get(Clock).advanceDays(13);

      const [a, b] = await Promise.all([sla.scan(), second.get(SlaService).scan()]);
      // Bản nào thắng không quan trọng; tổng số lần nhắc mới quan trọng.
      expect((a.reminded ?? 0) + (b.reminded ?? 0)).toBe(1);
    } finally {
      await second.close();
    }

    const rows = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT 1 FROM pol.sla_reminder WHERE policy_id = $1`, [id]);
      return r.rowCount;
    });
    expect(rows).toBe(1);
  }, 90_000);
});

// =============================================================================
// NTF-08 · NTF-10 · NTF-11 — quá hạn và đi tiếp đúng nhánh cũ
// =============================================================================

describe('NTF-08 · NTF-10 đẩy đồng hồ tới ngày thứ 14', () => {
  it('chuyển Quá hạn duyệt và LƯU KÈM bước đang chờ', async () => {
    const id = await submitted();
    clock.advanceDays(14);

    const res = await sla.scan();
    expect(res.overdue).toBe(1);

    const row = await policyRow(id);
    expect(row.status).toBe('QUA_HAN_DUYET');
    // Không có cột này thì sau khi quá hạn không ai biết hồ sơ đang chờ ai.
    expect(row.pending_step).toBe('B4_TBP_DUYET');

    const mails = await flush(1);
    const m = await fullMail(mails[0]!.ID);
    expect(m.Subject).toContain('quá hạn');
    expect(mails[0]!.To.map((t) => t.Address).sort()).toEqual([
      'tbp01@csbh.test',
      'tdv01@csbh.test',
    ]);

    // Quét lại không đánh dấu lần hai — hồ sơ đã rời khỏi bốn trạng thái chờ.
    expect((await sla.scan()).overdue).toBe(0);
  }, 90_000);

  it('quá hạn ở bước Kế toán thì lưu đúng bước của kế toán', async () => {
    const id = await submitted();
    await act(id, 'TBP_SIGN', 'tbp01');
    clock.advanceDays(14);

    expect((await sla.scan()).overdue).toBe(1);
    const row = await policyRow(id);
    expect(row.status).toBe('QUA_HAN_DUYET');
    expect(row.pending_step).toBe('B6_KT_L1');

    const mails = await flush(1);
    expect(mails[0]!.To.map((t) => t.Address).sort()).toEqual([
      'kt01@csbh.test',
      'tdv01@csbh.test',
    ]);
  }, 90_000);
});

describe('NTF-11 xử lý sau khi hồ sơ đã quá hạn', () => {
  it('đi tiếp ĐÚNG NHÁNH CŨ dựa vào bước đã lưu, không quay về đầu', async () => {
    const id = await submitted();
    clock.advanceDays(14);
    expect((await sla.scan()).overdue).toBe(1);
    expect((await policyRow(id)).status).toBe('QUA_HAN_DUYET');

    // Trưởng bộ phận ký số như bình thường — hồ sơ vẫn đang ở nhánh của họ.
    const signed = await act(id, 'TBP_SIGN', 'tbp01');
    expect(signed.status).toBe(200);

    const row = await policyRow(id);
    // Sau khi ký, hệ thống tự chuyển sang Chờ Kế toán L1 (WF-09) — đúng bước kế
    // tiếp của nhánh cũ, không phải quay về Nháp.
    expect(row.status).toBe('CHO_KT_L1');
    expect(row.pending_step).toBeNull();
    expect(row.sla_due_at).not.toBeNull(); // đồng hồ SLA chạy lại từ đầu ở bước mới

    const events = (await pget(`/policies/${id}/events`, 'tdv01')).body as { action: string }[];
    expect(events.map((e) => e.action)).toEqual([
      'CREATE',
      'SUBMIT',
      'SLA_OVERDUE',
      'TBP_SIGN',
      'PUBLISH_SIGNED',
    ]);
  }, 90_000);

  it('sai vai trò vẫn bị chặn khi hồ sơ quá hạn — nhãn quá hạn không nới quyền', async () => {
    const id = await submitted();
    clock.advanceDays(14);
    await sla.scan();

    // Kế toán không xử lý được hồ sơ đang chờ Trưởng bộ phận, quá hạn hay không.
    const r = await act(id, 'KT_RECEIVE_L1', 'kt01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
    expect(r.body.status).toBe('CHO_TBP_DUYET'); // báo trạng thái THẬT bên dưới nhãn
  }, 90_000);
});

// =============================================================================
// NTF-07 — trang chủ: việc đang chờ chính tôi
// =============================================================================

describe('NTF-07 trang chủ theo từng vai trò', () => {
  it('mỗi vai trò chỉ thấy hồ sơ đang chờ CHÍNH MÌNH xử lý', async () => {
    const waitingTbp = await submitted();
    const waitingKt = await submitted();
    await act(waitingKt, 'TBP_SIGN', 'tbp01');

    const inbox = async (who: string) =>
      ((await pget('/policies/inbox?limit=200', who)).body.items as { id: string }[]).map(
        (x) => x.id,
      );

    const tbp = await inbox('tbp01');
    expect(tbp).toContain(waitingTbp);
    expect(tbp).not.toContain(waitingKt);

    const kt = await inbox('kt01');
    expect(kt).toContain(waitingKt);
    expect(kt).not.toContain(waitingTbp);

    // TDV chỉ thấy hồ sơ bị trả về cho mình sửa; hai hồ sơ trên đang ở tay người khác.
    const tdv = await inbox('tdv01');
    expect(tdv).not.toContain(waitingTbp);
    expect(tdv).not.toContain(waitingKt);

    // Ban lãnh đạo chỉ đọc, Quản trị nằm ngoài luồng duyệt: không có việc nào.
    expect((await pget('/policies/inbox', 'bld01')).body.items).toEqual([]);
    expect((await pget('/policies/inbox', 'admin01')).body.items).toEqual([]);
  }, 120_000);

  it('hồ sơ quá hạn VẪN hiện, ở đúng ô của người đang phải xử lý', async () => {
    const id = await submitted();
    clock.advanceDays(14);
    await sla.scan();

    const items = (await pget('/policies/inbox?limit=200', 'tbp01')).body.items as {
      id: string;
      overdue: boolean;
      pendingStep: string;
    }[];
    const hit = items.find((x) => x.id === id);
    expect(hit).toBeDefined();
    expect(hit!.overdue).toBe(true);
    expect(hit!.pendingStep).toBe('B4_TBP_DUYET');

    // Và không lọt sang ô của kế toán.
    const kt = (await pget('/policies/inbox?limit=200', 'kt01')).body.items as { id: string }[];
    expect(kt.map((x) => x.id)).not.toContain(id);
  }, 90_000);

  it('không thấy hồ sơ ngoài phạm vi dữ liệu của mình', async () => {
    // tdv03 do tbp02 duyệt. tbp01 không được thấy.
    const id = await submitted('tdv03');
    const tbp1 = (await pget('/policies/inbox?limit=200', 'tbp01')).body.items as { id: string }[];
    expect(tbp1.map((x) => x.id)).not.toContain(id);

    const tbp2 = (await pget('/policies/inbox?limit=200', 'tbp02')).body.items as { id: string }[];
    expect(tbp2.map((x) => x.id)).toContain(id);
  }, 90_000);
});

// =============================================================================
// NTF-12 — đổi cấu hình SLA
// =============================================================================

describe('NTF-12 Quản trị đổi SLA từ 14 ngày sang N ngày', () => {
  it('hồ sơ đang chờ được tính lại hạn theo quy tắc đã công bố, có ghi nhật ký', async () => {
    const id = await submitted();
    const before = await policyRow(id);

    const cfg = await pget('/sla/config', 'kt01');
    expect(cfg.body.days).toBe(14);
    expect(cfg.body.countsWeekends).toBe(true);

    const put = await pput('/sla/config', { days: 7 }, 'admin01');
    expect(put.status).toBe(200);
    expect(put.body.days).toBe(7);
    expect(put.body.recalculated).toBeGreaterThanOrEqual(1);

    const after = await policyRow(id);
    // Quy tắc: hạn = lúc BẮT ĐẦU CHỜ + N ngày. Không phải "hạn cũ trừ 7 ngày" —
    // hai cách chỉ trùng nhau khi SLA đổi đúng một lần.
    const days = (after.sla_due_at!.getTime() - after.sla_started_at!.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 5);
    expect(after.sla_started_at!.getTime()).toBe(before.sla_started_at!.getTime());

    const logged = await withAdminDb(async (c) => {
      const r = await c.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM pol.outbox WHERE routing_key = 'sla.config_changed'
          ORDER BY seq DESC LIMIT 1`,
      );
      return r.rows[0]!.payload;
    });
    expect(logged['before']).toEqual({ days: 14 });
    expect(logged['after']).toEqual({ days: 7 });
    expect(logged['actorRole']).toBe('QUAN_TRI');

    // Hồ sơ chuyển bước SAU khi đổi cấu hình phải dùng số ngày MỚI ngay, không
    // chờ triển khai lại.
    const fresh = await submitted();
    const freshRow = await policyRow(fresh);
    expect(
      (freshRow.sla_due_at!.getTime() - freshRow.sla_started_at!.getTime()) / 86_400_000,
    ).toBeCloseTo(7, 5);

    await pput('/sla/config', { days: 14 }, 'admin01');
  }, 120_000);

  it('chỉ Quản trị hệ thống đổi được, và số ngày phải hợp lệ', async () => {
    expect((await pput('/sla/config', { days: 7 }, 'kt01')).status).toBe(403);
    expect((await pput('/sla/config', { days: 7 }, 'sa01')).status).toBe(403);

    const bad = await pput('/sla/config', { days: 0 }, 'admin01');
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe('days');
  }, 60_000);
});

// =============================================================================
// OPS-04 — sla-worker dọn dữ liệu hết vòng đời
// =============================================================================

describe('OPS-04 sla-worker gọi được sys.run_retention()', () => {
  it('chạy dưới role csbh_pol mà vẫn xoá được ở idn, cat, cus và pol', async () => {
    // Đây là phép kiểm quyền, không phải kiểm số lượng: hàm xoá ở BỐN schema mà
    // role csbh_pol chỉ có quyền trên MỘT. Không có SECURITY DEFINER thì lời gọi
    // dừng ở dòng đầu với lỗi 42501, và câu "sla-worker gọi mỗi ngày" trong bản
    // thiết kế là câu không thực hiện được.
    const r = await sla.runRetention();
    expect(r).toBeTypeOf('object');
    expect(Object.keys(r).length).toBeGreaterThan(0);
  }, 60_000);
});
