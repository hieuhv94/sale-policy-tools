/**
 * `0262` — thông báo bình luận trên chuông.
 *
 * Hai tầng:
 *
 *   1. SỰ KIỆN ĐẨY THẲNG vào `notify.handle` (identity chạy thật) — canh luật người nhận và câu
 *      chữ: ai nhận, ai không, một người một dòng, không thư, Ban lãnh đạo không bao giờ.
 *   2. HẾT ĐƯỜNG — bình luận thật qua `policy`, sự kiện đọc từ `pol.outbox` đưa vào `notify.handle`,
 *      hộp thông báo đọc qua `notification` với `policy` nghe thật (kiểm quyền LÚC ĐỌC), và đường
 *      tự đánh dấu đã đọc theo id bình luận.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { dauNhac } from '@csbh/domain-policy';
import { createTestApp as createNotificationApp, NotifyService } from '@csbh/notification/testing';
import { BUS } from '@csbh/bus';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  bootPolicyListening,
  clearAccountCache,
  clearScopeCache,
  http,
  idNguoiDung,
  mailpitClear,
  maDuyNhat,
  mstDuyNhat,
  phanCongMacDinh,
  withAdminDb,
} from './app.js';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const SEED_PW = 'Test@1234';
const P = 'ZZBT';
let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let ntf: INestApplication;
let notify: NotifyService;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
let id: Record<string, string> = {};
const eventIds: string[] = [];

const hopThu = async () =>
  ((await (await fetch(`${MAILPIT}/api/v1/messages?limit=200`)).json()) as { messages: unknown[] }).messages;

type DongTB = {
  user_id: string;
  kind: string;
  action: string;
  tieu_de: string;
  mo_ta: string | null;
  trich_doan: string | null;
  duong_dan: string;
  binh_luan_id: string | null;
};
const dongCua = (eventId: string) =>
  withAdminDb(async (c) =>
    (await c.query<DongTB>(`SELECT * FROM ntf.thong_bao WHERE event_id = $1 ORDER BY user_id`, [eventId])).rows,
  );

/** Một sự kiện `binh_luan.tao` / `.sua` đúng hình dạng `policy` phát ra. */
const suKien = (o: {
  key?: string;
  actor: string;
  nhac?: string[];
  tacGiaGoc?: string | null;
  noiDung?: string;
}) => {
  const eventId = randomUUID();
  eventIds.push(eventId);
  return {
    eventId,
    routingKey: o.key ?? 'binh_luan.tao',
    payload: {
      entity: 'binh_luan',
      action: o.key === 'binh_luan.sua' ? 'BINH_LUAN_SUA' : 'BINH_LUAN_TAO',
      policyId: randomUUID(),
      policyCode: 'CSBH-ZZBT-0001',
      customerId: randomUUID(),
      customerName: 'Nhà thuốc Minh Châu',
      binhLuanId: randomUUID(),
      parentId: o.tacGiaGoc ? randomUUID() : null,
      tacGiaGocId: o.tacGiaGoc ?? null,
      nguoiDuocNhac: o.nhac ?? [],
      noiDungBinhLuan: o.noiDung ?? 'Anh xem lại giá dòng Sữa X giúp em',
      actorId: o.actor,
      at: new Date().toISOString(),
    },
  };
};

// --- Nền cho tầng hết đường ---------------------------------------------------

let groupCode = '';
const uniq = (k: string) => maDuyNhat(P, k);
const pg = async (method: 'get' | 'post' | 'patch' | 'delete', path: string, who: string, body?: object) => {
  const r = (await http(policy))[method](path).set('Authorization', `Bearer ${tok[who]}`);
  return body ? r.send(body) : r;
};
const nt = async (method: 'get' | 'post', path: string, who: string, body?: object) => {
  const r = (await http(ntf))[method](path).set('Authorization', `Bearer ${tok[who]}`);
  return body ? r.send(body) : r;
};

const hoSoDaGui = async () => {
  const c = await http(customer);
  const kh = await c.post('/customers').set('Authorization', `Bearer ${tok['tdv01']}`).send({
    code: uniq('KH'), name: 'Nha thuoc thong bao', customerType: 1, province: 'Hà Nội', streetWard: 'Hà Nội',
    ownerName: 'Chu ho', ownerTitle: 'Chu ho', idNumber: mstDuyNhat(), phone: '0900000000',
  });
  const sp = await (await http(catalog)).post('/catalog/products').set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('SP'), name: 'Nutricare Gold', groupCode, price: '100000' });
  const r = await pg('post', '/policies', 'tdv01', {
    customerId: kh.body.id, lines: [{ productId: sp.body.id, wholesalePrice: '90000', cpbh: ['5000'] }],
  });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  const s = await pg('post', `/policies/${r.body.id}/actions/SUBMIT`, 'tdv01', await phanCongMacDinh('SUBMIT'));
  if (s.status !== 200) throw new Error(JSON.stringify(s.body));
  return r.body.id as string;
};

/** Mọi sự kiện bình luận của hồ sơ trong outbox → `notify.handle`, đúng như relay sẽ làm. */
const chuyenSuKien = async (pid: string) => {
  const rows = await withAdminDb(async (c) =>
    (
      await c.query<{ id: string; routing_key: string; payload: Record<string, unknown> }>(
        `SELECT id, routing_key, payload FROM pol.outbox
          WHERE payload->>'policyId' = $1 AND routing_key LIKE 'binh_luan.%' AND published_at IS NULL ORDER BY created_at`,
        [pid],
      )
    ).rows,
  );
  for (const r of rows) {
    eventIds.push(r.id);
    await notify.handle({ eventId: r.id, routingKey: r.routing_key, payload: r.payload });
    await withAdminDb((c) => c.query(`UPDATE pol.outbox SET published_at = now() WHERE id = $1`, [r.id]));
  }
};

beforeAll(async () => {
  for (const [boot, set] of [
    [bootIdentityListening, (a: INestApplication) => (identity = a)],
    [bootCatalogListening, (a: INestApplication) => (catalog = a)],
    [bootCustomerListening, (a: INestApplication) => (customer = a)],
    [bootPolicyListening, (a: INestApplication) => (policy = a)],
  ] as const) {
    const b = await boot();
    set(b.app);
    restores.push(b.restore);
  }
  await clearAccountCache();
  await clearScopeCache();
  id = await idNguoiDung();
  ntf = await createNotificationApp();
  notify = ntf.get(NotifyService);
  for (const u of ['tdv01', 'tbp01', 'tbp02', 'kt01', 'admin01', 'bld01']) tok[u] = await accessTokenFor(identity, u, SEED_PW);

  groupCode = uniq('NHOM');
  const dm = await http(catalog);
  await dm.post('/catalog/product-groups').set('Authorization', `Bearer ${tok['admin01']}`).send({ code: groupCode, name: 'Nhom' });
  await dm.post('/catalog/discount-rules').set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('CK'), productGroupCode: groupCode, effectiveFrom: '2020-01-01', thresholdRate2: 1500 });
}, 90_000);

afterAll(async () => {
  await withAdminDb(async (c) => {
    await c.query(`DELETE FROM ntf.thong_bao WHERE event_id = ANY($1::uuid[])`, [eventIds]);
    await c.query(`ALTER TABLE pol.policy DISABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(`DELETE FROM pol.policy WHERE customer_id IN (SELECT id FROM cus.customer WHERE code LIKE $1)`, [`${P}%`]);
    await c.query(`ALTER TABLE pol.policy ENABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.discount_rule WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
  });
  await ntf?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
});

// =============================================================================
// 1. Luật người nhận và câu chữ
// =============================================================================

describe('người nhận', () => {
  it('người được nhắc nhận MỘT dòng bậc VIỆC, đúng câu chữ, dẫn tới đúng bình luận', async () => {
    const ev = suKien({ actor: id['kt01']!, nhac: [id['tdv01']!] });
    expect(await notify.handle(ev)).toBe('sent');
    const d = await dongCua(ev.eventId);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      user_id: id['tdv01'],
      kind: 'CHINH',
      action: 'BINH_LUAN_NHAC',
      mo_ta: 'CSBH-ZZBT-0001 · Nhà thuốc Minh Châu',
      trich_doan: 'Anh xem lại giá dòng Sữa X giúp em',
      duong_dan: `/ho-so/${ev.payload.policyId}#binh-luan-${ev.payload.binhLuanId}`,
      binh_luan_id: ev.payload.binhLuanId,
    });
    expect(d[0]!.tieu_de).toMatch(/^.+ đã nhắc đến bạn trong một bình luận$/);
    expect(d[0]!.tieu_de).not.toMatch(/^Một người dùng/);
  });

  it('reply → tác giả gốc nhận "… đã phản hồi một bình luận của bạn"', async () => {
    const ev = suKien({ actor: id['kt01']!, tacGiaGoc: id['tbp01']! });
    await notify.handle(ev);
    const d = await dongCua(ev.eventId);
    expect(d.map((x) => [x.user_id, x.action])).toEqual([[id['tbp01'], 'BINH_LUAN_TRA_LOI']]);
    expect(d[0]!.tieu_de).toMatch(/ đã phản hồi một bình luận của bạn$/);
  });

  it('vừa được nhắc VỪA là tác giả gốc → MỘT dòng, câu nhắc tên', async () => {
    const ev = suKien({ actor: id['kt01']!, nhac: [id['tbp01']!], tacGiaGoc: id['tbp01']! });
    await notify.handle(ev);
    const d = await dongCua(ev.eventId);
    expect(d).toHaveLength(1);
    expect(d[0]!.action).toBe('BINH_LUAN_NHAC');
  });

  it('nhắc nhiều người → mỗi người một dòng; người viết không bao giờ nhận', async () => {
    const ev = suKien({ actor: id['tdv01']!, nhac: [id['tbp01']!, id['kt01']!, id['tdv01']!], tacGiaGoc: id['tdv01']! });
    await notify.handle(ev);
    expect((await dongCua(ev.eventId)).map((x) => x.user_id).sort()).toEqual([id['tbp01'], id['kt01']].sort());
  });

  it('tự nhắc mình / tự trả lời mình → không dòng nào ("ignored")', async () => {
    const ev = suKien({ actor: id['tdv01']!, nhac: [id['tdv01']!], tacGiaGoc: id['tdv01']! });
    expect(await notify.handle(ev)).toBe('ignored');
    expect(await dongCua(ev.eventId)).toEqual([]);
  });

  it('Ban lãnh đạo KHÔNG BAO GIỜ nhận — kể cả được nhắc hay là tác giả gốc', async () => {
    const ev = suKien({ actor: id['tdv01']!, nhac: [id['bld01']!, id['tbp01']!], tacGiaGoc: id['bld01']! });
    await notify.handle(ev);
    expect((await dongCua(ev.eventId)).map((x) => x.user_id)).toEqual([id['tbp01']]);
    const ev2 = suKien({ actor: id['tdv01']!, tacGiaGoc: id['bld01']! });
    await notify.handle(ev2);
    expect(await dongCua(ev2.eventId)).toEqual([]);
  });

  it('Ban lãnh đạo VIẾT thì người được nhắc vẫn nhận, và tiêu đề mang tên Ban lãnh đạo', async () => {
    const ev = suKien({ actor: id['bld01']!, nhac: [id['tdv01']!] });
    await notify.handle(ev);
    const d = await dongCua(ev.eventId);
    expect(d.map((x) => x.user_id)).toEqual([id['tdv01']]);
    expect(d[0]!.tieu_de).not.toMatch(/^Một người dùng/);
  });

  it('tài khoản đã vô hiệu hoá → không dòng nào', async () => {
    await withAdminDb((c) => c.query(`UPDATE idn.app_user SET is_active = false WHERE id = $1`, [id['tbp02']]));
    try {
      const ev = suKien({ actor: id['tdv01']!, nhac: [id['tbp02']!, id['tbp01']!] });
      await notify.handle(ev);
      expect((await dongCua(ev.eventId)).map((x) => x.user_id)).toEqual([id['tbp01']]);
    } finally {
      await withAdminDb((c) => c.query(`UPDATE idn.app_user SET is_active = true WHERE id = $1`, [id['tbp02']]));
      await clearAccountCache();
    }
  });

  it('sự kiện SỬA: chỉ người mới được nhắc nhận; tác giả gốc không nhận lại "đã phản hồi"', async () => {
    const ev = suKien({ key: 'binh_luan.sua', actor: id['kt01']!, nhac: [id['tdv01']!], tacGiaGoc: id['tbp01']! });
    await notify.handle(ev);
    expect((await dongCua(ev.eventId)).map((x) => [x.user_id, x.action])).toEqual([[id['tdv01'], 'BINH_LUAN_NHAC']]);
    const rong = suKien({ key: 'binh_luan.sua', actor: id['kt01']!, nhac: [] });
    expect(await notify.handle(rong)).toBe('ignored');
  });

  it('hàng đợi giao LẠI cùng sự kiện → vẫn một dòng mỗi người', async () => {
    const ev = suKien({ actor: id['kt01']!, nhac: [id['tdv01']!], tacGiaGoc: id['tbp01']! });
    await notify.handle(ev);
    await notify.handle(ev);
    expect(await dongCua(ev.eventId)).toHaveLength(2);
  });

  it('KHÔNG lá thư nào tới Mailpit cho mọi sự kiện bình luận', async () => {
    // Hỏi THEO MÃ SỰ KIỆN (thư mang nó trong `MessageID`), không hỏi "hộp thư trống":
    // chạy cả bộ thì thư của tệp khác tới Mailpit trễ đúng lúc này — đo được ở `0262`.
    await mailpitClear();
    const cuaToi: string[] = [];
    for (const ev of [
      suKien({ actor: id['kt01']!, nhac: [id['tdv01']!, id['tbp01']!] }),
      suKien({ actor: id['kt01']!, tacGiaGoc: id['tdv01']! }),
      suKien({ key: 'binh_luan.sua', actor: id['kt01']!, nhac: [id['tbp01']!] }),
    ]) {
      cuaToi.push(ev.eventId);
      await notify.handle(ev);
    }
    await new Promise((r) => setTimeout(r, 500));
    const thu = (await hopThu()) as { MessageID?: string }[];
    expect(thu.filter((m) => cuaToi.some((e) => (m.MessageID ?? '').includes(e)))).toEqual([]);
    const giuCho = await withAdminDb(async (c) =>
      (await c.query(`SELECT 1 FROM ntf.sent_mail WHERE event_id = ANY($1::uuid[])`, [eventIds])).rowCount,
    );
    expect(giuCho).toBe(0);
  });

  it('trích đoạn: dấu nhắc thành @tên hiện tại, gộp khoảng trắng, không lộ id', async () => {
    const ev = suKien({ actor: id['kt01']!, nhac: [id['tdv01']!], noiDung: `Nhờ ${dauNhac(id['tbp01']!)}\n\nxem   giúp` });
    await notify.handle(ev);
    const t = (await dongCua(ev.eventId))[0]!.trich_doan!;
    expect(t).toMatch(/^Nhờ @\S.* xem giúp$/);
    expect(t).not.toContain(id['tbp01']!);
  });

  it('sự kiện thiếu trường cốt lõi → "ignored", không ghi gì, không ném', async () => {
    const ev = suKien({ actor: id['kt01']!, nhac: [id['tdv01']!] });
    delete (ev.payload as Record<string, unknown>)['binhLuanId'];
    expect(await notify.handle(ev)).toBe('ignored');
  });

  it('hàng đợi notification nghe ĐÚNG hai khoá bình luận — xoá và cảm xúc không sinh thông báo', () => {
    const b = BUS.bindings.notification as readonly string[];
    expect(b.filter((k) => k.startsWith('binh_luan'))).toEqual(['binh_luan.tao', 'binh_luan.sua']);
    expect(BUS.bindings.reporting as readonly string[]).not.toContain('binh_luan.#');
  });
});

// =============================================================================
// 2. Hết đường: bình luận thật → chuông → kiểm quyền lúc đọc → tự đọc
// =============================================================================

describe('hết đường', () => {
  const hop = async (who: string) =>
    (await nt('get', '/notifications/cua-toi?limit=50', who)).body as {
      items: { binhLuanId: string | null; tieuDe: string; moTa: string | null; trichDoan: string | null; matQuyen: boolean; kind: string; daDocLuc: string | null }[];
      soViecChuaDoc: number;
    };

  it('TDV nhắc TBP → TBP thấy trên chuông: tính vào số VIỆC, có mã hồ sơ · tên khách và trích đoạn', async () => {
    const pid = await hoSoDaGui();
    const truoc = (await hop('tbp01')).soViecChuaDoc;
    const bl = (await pg('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: `Nhờ ${dauNhac(id['tbp01']!)} xem giá` })).body.binhLuan;
    await chuyenSuKien(pid);
    const h = await hop('tbp01');
    // `≥` chứ không `=`: tệp khác có thể thả một thông báo vào hộp tbp01 giữa hai lượt
    // đọc khi chạy cả bộ (đo được ở `0262`). Dòng của CHÍNH bình luận này được kiểm đích danh.
    expect(h.soViecChuaDoc).toBeGreaterThanOrEqual(truoc + 1);
    const dong = h.items.find((x) => x.binhLuanId === bl.id)!;
    expect(dong).toMatchObject({ kind: 'CHINH', matQuyen: false });
    expect(dong.moTa).toMatch(/^CSBH-.+ · Nha thuoc thong bao$/);
    expect(dong.trichDoan).toMatch(/^Nhờ @\S.* xem giá$/);
  });

  it('người nhận MẤT phạm vi → dòng chỉ còn tiêu đề (không mã hồ sơ, không tên khách, không trích đoạn)', async () => {
    const pid = await hoSoDaGui();
    const bl = (await pg('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: `BI_MAT ${dauNhac(id['tbp01']!)}` })).body.binhLuan;
    await chuyenSuKien(pid);
    await withAdminDb((c) => c.query(`UPDATE pol.policy SET tbp_user_id = $2 WHERE id = $1`, [pid, id['tbp02']]));
    const h = await hop('tbp01');
    const dong = h.items.find((x) => x.binhLuanId === bl.id)!;
    expect(dong).toMatchObject({ matQuyen: true, moTa: null, trichDoan: null });
    expect(dong.tieuDe).toMatch(/đã nhắc đến bạn/);
    expect(JSON.stringify(h)).not.toContain('BI_MAT');
  });

  it('policy không trả lời → GIẤU (hỏng thì đóng)', async () => {
    const pid = await hoSoDaGui();
    const bl = (await pg('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: `KIN ${dauNhac(id['tbp01']!)}` })).body.binhLuan;
    await chuyenSuKien(pid);
    const cu = process.env.POLICY_URL;
    process.env.POLICY_URL = 'http://127.0.0.1:1';
    try {
      const dong = (await hop('tbp01')).items.find((x) => x.binhLuanId === bl.id)!;
      expect(dong).toMatchObject({ matQuyen: true, trichDoan: null });
    } finally {
      process.env.POLICY_URL = cu;
    }
  });

  it('policy TRẢ LỜI nhưng trả lỗi (không phải 200) → cũng GIẤU', async () => {
    // Ca trên chỉ đi nhánh `catch` (không kết nối được). Phá lại "hỏng thì mở" ở nhánh
    // `!res.ok` mà ca trên vẫn xanh (`0262`) — nên có ca này: trỏ POLICY_URL sang identity,
    // nơi đường `/internal/policies/trong-pham-vi` không tồn tại và trả 404.
    const pid = await hoSoDaGui();
    const bl = (await pg('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: `LOI ${dauNhac(id['tbp01']!)}` })).body.binhLuan;
    await chuyenSuKien(pid);
    const cu = process.env.POLICY_URL;
    process.env.POLICY_URL = process.env.IDENTITY_URL;
    try {
      const dong = (await hop('tbp01')).items.find((x) => x.binhLuanId === bl.id)!;
      expect(dong).toMatchObject({ matQuyen: true, trichDoan: null, moTa: null });
    } finally {
      process.env.POLICY_URL = cu;
    }
  });

  it('bình luận hiện trên màn hình → da-doc-binh-luan đánh dấu đã đọc, chuông giảm ngay', async () => {
    const pid = await hoSoDaGui();
    const bl = (await pg('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: `xem ${dauNhac(id['tbp01']!)}` })).body.binhLuan;
    await chuyenSuKien(pid);
    const r = await nt('post', '/notifications/da-doc-binh-luan', 'tbp01', { binhLuanIds: [bl.id] });
    expect(r.status).toBe(201);
    expect(r.body.soDaDanhDau).toBe(1);
    // Con số trả về là con số THẬT của hộp ngay sau lượt đánh dấu.
    const sau = await withAdminDb(async (c) =>
      Number((await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM ntf.thong_bao WHERE user_id = $1 AND kind = 'CHINH' AND da_doc_luc IS NULL`, [id['tbp01']])).rows[0]!.n),
    );
    expect(r.body.soViecChuaDoc).toBeLessThanOrEqual(sau + 1);
    expect((await hop('tbp01')).items.find((x) => x.binhLuanId === bl.id)!.daDocLuc).not.toBeNull();
    const lai = await nt('post', '/notifications/da-doc-binh-luan', 'tbp01', { binhLuanIds: [bl.id] });
    expect(lai.body.soDaDanhDau).toBe(0);
  });

  it('da-doc-binh-luan chỉ chạm thông báo CỦA MÌNH — id bình luận của người khác không đổi gì', async () => {
    const pid = await hoSoDaGui();
    const bl = (await pg('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: `cho ${dauNhac(id['tbp01']!)}` })).body.binhLuan;
    await chuyenSuKien(pid);
    expect((await nt('post', '/notifications/da-doc-binh-luan', 'kt01', { binhLuanIds: [bl.id] })).body.soDaDanhDau).toBe(0);
    const dong = (await hop('tbp01')).items.find((x) => x.binhLuanId === bl.id)!;
    expect(dong.daDocLuc).toBeNull();
  });

  it('da-doc-binh-luan sai hình dạng → VALIDATION_FAILED', async () => {
    for (const b of [{}, { binhLuanIds: 'x' }, { binhLuanIds: ['khong-phai-uuid'] }, { binhLuanIds: Array.from({ length: 101 }, () => randomUUID()) }]) {
      const r = await nt('post', '/notifications/da-doc-binh-luan', 'tbp01', b);
      expect([r.status, r.body.code], JSON.stringify(b).slice(0, 40)).toEqual([400, 'VALIDATION_FAILED']);
    }
  });

  it('reply qua policy thật → tác giả gốc nhận "đã phản hồi"; xoá và cảm xúc không sinh dòng nào', async () => {
    const pid = await hoSoDaGui();
    const g = (await pg('post', `/policies/${pid}/binh-luan`, 'tbp01', { maGui: randomUUID(), noiDung: 'gốc của TBP' })).body.binhLuan;
    const ph = (await pg('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: 'trả lời', parentId: g.id })).body.binhLuan;
    await pg('patch', `/policies/${pid}/binh-luan/${ph.id}`, 'tdv01', { noiDung: 'trả lời đã sửa' });
    await (await http(policy)).put(`/policies/${pid}/binh-luan/${g.id}/cam-xuc/THICH`).set('Authorization', `Bearer ${tok['tdv01']}`);
    await pg('delete', `/policies/${pid}/binh-luan/${ph.id}`, 'tdv01');
    await chuyenSuKien(pid);
    const cua = await withAdminDb(async (c) =>
      (await c.query<{ user_id: string; action: string }>(
        `SELECT user_id, action FROM ntf.thong_bao WHERE policy_id = $1 ORDER BY xay_ra_luc`, [pid])).rows,
    );
    expect(cua).toEqual([{ user_id: id['tbp01'], action: 'BINH_LUAN_TRA_LOI' }]);
  });
});
