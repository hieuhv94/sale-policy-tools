/**
 * `0260` — Ban lãnh đạo KHÔNG BAO GIỜ nhận thư hay thông báo (chốt 06/11: *"giữ nguyên, đảm bảo
 * ban lãnh đạo sẽ không nhận bất kỳ thông báo nào"*).
 *
 * Tới `0260` điều ấy đúng TÌNH CỜ: Ban lãnh đạo không đứng tên ở ô nào trên hồ sơ, nên không đường
 * tra người nhận nào chạm tới họ. Ca kiểm ở đây đặt CỐ Ý một tài khoản Ban lãnh đạo vào chỗ lẽ ra
 * nó không thể ở (ô Kế toán của sự kiện, danh sách người đã thao tác) và đòi không lá thư, không
 * dòng chuông nào tới nó — tức canh LUẬT, không canh dữ liệu mẫu.
 *
 * Chốt nằm ở identity (`KHONG_NHAN_THONG_BAO`), ở cả ba đường tra người nhận. Phá lại cho thấy hai
 * lớp: bỏ lọc ở đường THEO HỒ SƠ thì ca hết-đường vẫn xanh — `pick` của notification chỉ chọn vai
 * trò bước gọi tên, mà `BAN_LANH_DAO` không bao giờ được gọi — nên ca gọi thẳng identity là ca canh
 * đường ấy; bỏ lọc ở đường THEO ID (lá "để biết") thì ca hết-đường và ca bất biến cùng đỏ — đó là
 * lỗ thật.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';
import { KHONG_NHAN_THONG_BAO } from '@csbh/identity/testing';
import { createTestApp as createNotificationApp, NotifyService } from '@csbh/notification/testing';
import { bootIdentityListening, clearAccountCache, idNguoiDung, mailpitClear, withAdminDb } from './app.js';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
let identity: INestApplication;
let ntf: INestApplication;
let notify: NotifyService;
const restores: (() => void)[] = [];
let id: Record<string, string> = {};
const eventIds: string[] = [];

const noiBo = async <T>(duong: string, init: RequestInit = {}): Promise<T> => {
  const r = await fetch(`${process.env.IDENTITY_URL}/internal${duong}`, {
    ...init,
    headers: { 'X-Service-Token': mintServiceToken('notification'), 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  expect(r.status, duong).toBe(200);
  return (await r.json()) as T;
};
type Targets = { targets: { userId: string; role: string; email: string }[] };
const hopThu = async () =>
  ((await (await fetch(`${MAILPIT}/api/v1/messages?limit=200`)).json()) as { messages: { To: { Address: string }[] }[] }).messages;

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  id = await idNguoiDung();
  ntf = await createNotificationApp();
  notify = ntf.get(NotifyService);
}, 60_000);

afterAll(async () => {
  await withAdminDb(async (c) => {
    await c.query(`DELETE FROM ntf.thong_bao WHERE event_id = ANY($1::uuid[])`, [eventIds]);
    await c.query(`DELETE FROM ntf.sent_mail WHERE event_id = ANY($1::uuid[])`, [eventIds]);
  });
  await ntf?.close();
  await identity?.close();
  for (const r of restores) r();
});

describe('`0260` hằng chặn', () => {
  it('Ban lãnh đạo nằm trong danh sách không nhận — và CHỈ Ban lãnh đạo', () => {
    expect([...KHONG_NHAN_THONG_BAO]).toEqual(['BAN_LANH_DAO']);
  });
});

describe('`0260` ba đường tra người nhận của identity', () => {
  it('theo hồ sơ: Ban lãnh đạo đặt vào ô Kế toán / TBP → bị loại, người khác còn nguyên', async () => {
    const r = await noiBo<Targets>(`/notify-targets/${id['tdv01']}?tbp=${id['bld01']}&keToan=${id['kt01']}`);
    const ai = r.targets.map((t) => t.userId);
    expect(ai).not.toContain(id['bld01']);
    expect(ai).toContain(id['tdv01']);
    expect(ai).toContain(id['kt01']);
    const r2 = await noiBo<Targets>(`/notify-targets/${id['tdv01']}?keToan=${id['bld01']}`);
    expect(r2.targets.map((t) => t.userId)).toEqual([id['tdv01']]);
  });

  it('theo id (lá "để biết" cho người đã thao tác): Ban lãnh đạo bị loại', async () => {
    const r = await noiBo<Targets>('/users/mail-targets', {
      method: 'POST',
      body: JSON.stringify({ userIds: [id['bld01'], id['tdv01'], id['tbp01']] }),
    });
    expect(r.targets.map((t) => t.userId).sort()).toEqual([id['tdv01'], id['tbp01']].sort());
    const chiBld = await noiBo<Targets>('/users/mail-targets', { method: 'POST', body: JSON.stringify({ userIds: [id['bld01']] }) });
    expect(chiBld.targets).toEqual([]);
  });

  it('mọi Quản trị: không Ban lãnh đạo nào', async () => {
    const r = await noiBo<Targets>('/users/quan-tri');
    for (const t of r.targets) expect(t.role).not.toBe('BAN_LANH_DAO');
  });
});

describe('`0260` hết đường: sự kiện thật qua notification', () => {
  it('Ban lãnh đạo ở ô Kế toán (chủ bước) VÀ trong người đã thao tác → không thư, không chuông; TDV vẫn nhận', async () => {
    await mailpitClear();
    const ev = {
      eventId: randomUUID(),
      routingKey: 'policy.tbp_sign',
      payload: {
        entity: 'policy',
        action: 'TBP_SIGN',
        policyId: randomUUID(),
        policyCode: 'ZZBLD-0260',
        customerId: randomUUID(),
        customerCode: 'ZZBLD-KH',
        customerName: 'Nha thuoc ZZBLD',
        toStatus: 'CHO_KT_L1',
        pendingStep: 'B4',
        recipients: ['TDV', 'KE_TOAN'],
        tdvUserId: id['tdv01'],
        keToanUserId: id['bld01'],
        observers: [id['bld01']],
        at: new Date().toISOString(),
      },
    };
    eventIds.push(ev.eventId);
    expect(await notify.handle(ev)).toBe('sent');
    let thu: { To: { Address: string }[] }[] = [];
    for (let i = 0; i < 20 && thu.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 250));
      thu = await hopThu();
    }
    const nguoiNhan = thu.flatMap((m) => m.To.map((t) => t.Address));
    expect(nguoiNhan, 'đối chứng: TDV phải nhận').toContain('tdv01@csbh.test');
    expect(nguoiNhan).not.toContain('bld01@csbh.test');
    const chuong = await withAdminDb(async (c) =>
      (await c.query(`SELECT user_id FROM ntf.thong_bao WHERE event_id = $1`, [ev.eventId])).rows.map((r) => r.user_id),
    );
    expect(chuong).toContain(id['tdv01']);
    expect(chuong).not.toContain(id['bld01']);
  }, 30_000);
});

describe('`0260` bất biến toàn hệ thống', () => {
  it('không một dòng thông báo nào trong CSDL thuộc về tài khoản Ban lãnh đạo', async () => {
    const n = await withAdminDb(async (c) =>
      Number(
        (
          await c.query(
            `SELECT count(*) AS n FROM ntf.thong_bao t JOIN idn.app_user u ON u.id = t.user_id WHERE u.role = 'BAN_LANH_DAO'`,
          )
        ).rows[0].n,
      ),
    );
    expect(n).toBe(0);
  });

  it('notification chỉ tra người nhận qua ĐÚNG ba đường đã chặn — đường thứ tư phải đi qua chốt này', () => {
    const src = readFileSync('services/notification/src/notify/recipients.ts', 'utf8');
    const duong = [...src.matchAll(/\/internal\/([a-z-]+(?:\/[a-z-]+)?)/g)].map((m) => m[1]!).sort();
    expect(duong).toEqual(['notify-targets', 'users/mail-targets', 'users/quan-tri']);
    const ctl = readFileSync('services/identity/src/internal/internal.controller.ts', 'utf8');
    expect(ctl.match(/KHONG_NHAN_THONG_BAO\]/g)?.length ?? 0, 'mỗi đường truyền hằng chặn làm tham số').toBe(3);
  });
});
