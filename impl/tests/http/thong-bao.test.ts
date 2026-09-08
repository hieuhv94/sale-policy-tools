/**
 * `0096` — thông báo trên web.
 *
 * Luật khách hàng chốt gọn: **mọi hành động dẫn tới gửi email cho một người đều
 * là một thông báo của người ấy, ngoài ra không có thông báo nào khác**. Tệp này
 * gác đúng câu đó, và nó gác bằng cách so THƯ với THÔNG BÁO — không bằng một
 * danh sách hành động chép lại. Một danh sách chép lại thì chính nó cũng trôi.
 *
 * Đẩy sự kiện thẳng vào `NotifyService.handle()` thay vì chạy trọn mười bước qua
 * policy: cái cần kiểm ở đây là quãng từ *đã biết ai nhận thư* tới *đã có dòng
 * trong bảng*, và mười bước kia đã có `notification.test.ts` gác.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bodyBanGiao,
  bodyFor,
  createTestApp as createNotificationApp,
  duongDan,
  DUONG_BAN_GIAO,
  loaiThayDoi,
  moTaNgan,
  NotifyService,
  TITLE,
  type MailEvent,
} from '@csbh/notification/testing';
import {
  accessTokenFor,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  http,
  mailpitClear,
  mailpitLatestTo,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';

let identity: INestApplication;
let ntf: INestApplication;
let notify: NotifyService;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
const uid: Record<string, string> = {};

const get = async (path: string, who: string) =>
  (await http(ntf)).get(path).set('Authorization', `Bearer ${tok[who]}`);

const post = async (path: string, who: string, body: object = {}) =>
  (await http(ntf)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

/** Đọc thẳng bảng — cột `duong_dan` là thứ ca kiểm phải nhìn thấy nguyên văn. */
/** Địa chỉ thư của tài khoản mẫu — nạp cùng `uid` (`0190`). */
const EMAIL: Record<string, string> = {};

const dong = async (eventId: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{
      user_id: string;
      kind: string;
      action: string | null;
      tieu_de: string;
      mo_ta: string | null;
      duong_dan: string;
      xay_ra_luc: Date;
    }>(
      `SELECT user_id, kind, action, tieu_de, mo_ta, duong_dan, xay_ra_luc
         FROM ntf.thong_bao WHERE event_id = $1 ORDER BY kind, user_id`,
      [eventId],
    );
    return r.rows;
  });

/**
 * Một sự kiện luồng duyệt đầy đủ, đúng khuôn mà `policy` phát ra.
 *
 * `observers` để trống ở phần lớn ca: lá thư "để biết" có ca riêng, và trộn nó
 * vào mọi ca khác là làm mọi phép đếm phải trừ đi một con số không nói gì.
 */
const suKien = (o: Partial<Record<string, unknown>> = {}) => ({
  eventId: randomUUID(),
  routingKey: 'policy.status_changed',
  payload: {
    action: 'TBP_RETURN',
    recipients: ['TDV'],
    tdvUserId: uid['tdv01'],
    tbpUserId: uid['tbp01'],
    policyId: randomUUID(),
    policyCode: 'CS-TB-0001',
    customerId: randomUUID(),
    customerCode: 'KHTB01',
    customerName: 'Nhà thuốc Thử Nghiệm',
    toStatus: 'YEU_CAU_CHINH_SUA',
    pendingStep: 'YEU_CAU_CHINH_SUA',
    at: '2026-08-20T03:00:00.000Z',
    reason: 'Thiếu giấy phép kinh doanh',
    ...o,
  } as Record<string, unknown>,
});

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();

  for (const u of ['tdv01', 'tdv02', 'tbp01', 'kt01', 'sa01', 'admin01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }
  await withAdminDb(async (c) => {
    const r = await c.query<{ id: string; username: string; email: string }>(
      // `0190` — địa chỉ thư đi cùng lượt hỏi: ca đi-hết-đường đọc lá thư THẬT
      // trong Mailpit, và nó cần biết thư ấy gửi tới đâu.
      `SELECT id, username, email FROM idn.app_user WHERE username = ANY($1)`,
      [Object.keys(tok)],
    );
    for (const row of r.rows) {
      uid[row.username] = row.id;
      EMAIL[row.username] = row.email;
    }
  });

  ntf = await createNotificationApp();
  notify = ntf.get(NotifyService);
}, 90_000);

afterAll(async () => {
  await ntf?.close();
  await identity?.close();
  for (const r of restores) r();
});

beforeEach(async () => {
  await mailpitClear();
  await withAdminDb(async (c) => {
    await c.query(`DELETE FROM ntf.thong_bao`);
  });
});

describe('`0096` thư nào cũng thành thông báo, và chỉ thư mới thành thông báo', () => {
  it('mỗi NGƯỜI NHẬN THƯ được đúng một dòng', async () => {
    // `saleAdminUserId` phải có mặt trong sự kiện, đúng như policy phát ra
    // (`0031`): thiếu nó thì `targetsFor` không có ai mang vai trò ấy để dịch,
    // và cả THƯ lẫn thông báo đều mất một người nhận. Ca này đã đỏ vì đúng lý do
    // ấy lúc mới viết — một minh chứng nhỏ rằng hai bên đi chung một đường.
    const ev = suKien({
      action: 'KT_RECEIVE_L1',
      recipients: ['SALE_ADMIN', 'TBP', 'TDV'],
      saleAdminUserId: uid['sa01'],
    });
    expect(await notify.handle(ev)).toBe('sent');

    const ds = await dong(ev.eventId);
    // Ba vai trò → ba người khác nhau trong bộ tài khoản mẫu.
    expect(ds.map((d) => d.user_id).sort()).toEqual(
      [uid['sa01']!, uid['tbp01']!, uid['tdv01']!].sort(),
    );
    expect(new Set(ds.map((d) => d.kind))).toEqual(new Set(['CHINH']));
  });

  it('người KHÔNG nhận thư thì không có dòng nào', async () => {
    // `tdv02` không nằm trong hồ sơ này. Đây là vế "ngoài ra không còn thông báo
    // nào khác" của luật — vế dễ quên vì nó không có gì để nhìn.
    const ev = suKien({ recipients: ['TDV'] });
    await notify.handle(ev);

    const ds = await dong(ev.eventId);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.user_id).toBe(uid['tdv01']);
  });

  it('sự kiện KHÔNG sinh thư (dành cho service khác) cũng không sinh thông báo', async () => {
    // `policy.superseded` dành cho reporting: không có `recipients`, `handle`
    // trả `ignored`. Nếu chỗ ghi thông báo nằm sai phía nhánh ấy thì đây đỏ.
    const ev = suKien({ recipients: [], action: 'SUPERSEDE' });
    expect(await notify.handle(ev)).toBe('ignored');
    expect(await dong(ev.eventId)).toHaveLength(0);
  });
});

describe('`0096` một hàm dựng liên kết, hai nơi dùng', () => {
  /*
   * CA KIỂM ĐÁNG GIÁ NHẤT CỦA CẢ TỆP.
   *
   * Khách hàng chốt: bấm vào thông báo phải tới ĐÚNG chỗ mà liên kết trong thư
   * dẫn tới. Nếu thư tự dựng đường của nó còn cái chuông tự dựng đường của cái
   * chuông thì hai bên khớp nhau bằng lời hứa — và lời hứa ấy hỏng ở lượt sửa
   * thứ hai, im lặng, vì không màn hình nào báo rằng mình vừa mở nhầm hồ sơ.
   *
   * Lặp trên chính `TITLE`, nên thêm một lá thư mới về sau là ca này tự phủ tới.
   */
  const GOC = 'https://csbh.nutricare.test';

  it.each(Object.keys(TITLE))('thư %s: thân thư chứa đúng `duongDan()`', (action) => {
    const e: MailEvent = {
      eventId: randomUUID(),
      routingKey: 'policy.status_changed',
      action,
      policyId: '11111111-2222-3333-4444-555555555555',
      policyCode: 'CS-2026-0031',
      customerCode: 'KH0007',
      customerName: 'Nhà thuốc Minh Châu',
      toStatus: 'CHO_TBP_DUYET',
      at: '2026-08-20T03:00:00.000Z',
    };
    expect(bodyFor(e, GOC)).toContain(`${GOC}${duongDan(e)}`);
    expect(bodyFor({ ...e, chiDeBiet: true }, GOC)).toContain(
      `${GOC}${duongDan({ ...e, chiDeBiet: true })}`,
    );
  });

  it('thư bàn giao cũng vậy', () => {
    const e = { count: 3, customers: [], fromName: 'Nguyễn Văn Hùng' };
    expect(bodyBanGiao(e, GOC)).toContain(`${GOC}${DUONG_BAN_GIAO}`);
  });

  it('thiếu `policyId` thì về trang chủ, KHÔNG dựng `/ho-so/undefined`', () => {
    // Sự kiện cũ nằm trong DLQ có thể thiếu khoá này. Một liên kết về trang chủ
    // vẫn dùng được; `/ho-so/undefined` thì dẫn thẳng vào màn hình lỗi.
    const e: MailEvent = { eventId: randomUUID(), routingKey: 'policy.status_changed' };
    expect(duongDan(e)).toBe('/');
    expect(bodyFor(e, GOC)).not.toContain('undefined');
  });
});

describe('`0096` liên kết trong thông báo bằng đúng liên kết trong thư', () => {
  it('thư thường trỏ vào hồ sơ', async () => {
    const ev = suKien();
    await notify.handle(ev);
    expect((await dong(ev.eventId))[0]!.duong_dan).toBe(`/ho-so/${ev.payload['policyId']}`);
  });

  it('thư "để biết" trỏ vào LỊCH SỬ hồ sơ, không vào hồ sơ', async () => {
    /*
     * Hai lá thư của cùng một sự kiện dẫn đi hai chỗ khác nhau (`0036`), nên hai
     * dòng thông báo cũng phải vậy. Đây là ca duy nhất phân biệt được `kind`.
     */
    const ev = suKien({ recipients: ['TDV'], observers: [uid['kt01']] });
    await notify.handle(ev);

    const ds = await dong(ev.eventId);
    const chinh = ds.find((d) => d.kind === 'CHINH')!;
    const theoDoi = ds.find((d) => d.kind === 'THEO_DOI')!;
    expect(chinh.user_id).toBe(uid['tdv01']);
    expect(theoDoi.user_id).toBe(uid['kt01']);
    expect(chinh.duong_dan).toBe(`/ho-so/${ev.payload['policyId']}`);
    expect(theoDoi.duong_dan).toBe(`/ho-so/${ev.payload['policyId']}/nhat-ky`);
  });

  it('thư bàn giao khách hàng trỏ vào DANH SÁCH KHÁCH HÀNG', async () => {
    const ev = {
      eventId: randomUUID(),
      routingKey: 'customer.handover',
      payload: {
        tdvUserId: uid['tdv02'],
        fromName: 'Nguyễn Văn Hùng',
        count: 23,
        customers: [{ code: 'KH0007', name: 'Nhà thuốc Minh Châu' }],
        at: '2026-08-21T02:00:00.000Z',
      } as Record<string, unknown>,
    };
    expect(await notify.handle(ev)).toBe('sent');

    const ds = await dong(ev.eventId);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.duong_dan).toBe('/khach-hang');
    expect(ds[0]!.tieu_de).toBe('Bạn được bàn giao 23 khách hàng');
    expect(ds[0]!.mo_ta).toBe('từ Nguyễn Văn Hùng');
  });
});

describe('`0096` nội dung ngắn gọn', () => {
  it('tiêu đề KHÔNG mang tiền tố `[CSBH]`, mô tả có khách hàng và mã hồ sơ', async () => {
    const ev = suKien();
    await notify.handle(ev);

    const d = (await dong(ev.eventId))[0]!;
    expect(d.tieu_de).toBe('Hồ sơ bị trả lại để chỉnh sửa');
    expect(d.tieu_de).not.toContain('[CSBH]');
    expect(d.mo_ta).toBe('KHTB01 — Nhà thuốc Thử Nghiệm · CS-TB-0001');
    // Lý do trả lại KHÔNG vào thông báo: nó dài, và nó là thứ phải đọc kỹ ở
    // trong hồ sơ chứ không phải liếc qua ở một dòng cao 3 phân.
    expect(d.mo_ta).not.toContain('giấy phép');
  });

  it('mốc thời gian lấy từ SỰ KIỆN, không phải lúc ghi dòng', async () => {
    /*
     * Sự kiện nằm trong DLQ ba tiếng rồi mới được gửi lại thì thông báo vẫn phải
     * đứng đúng chỗ của nó trong dòng thời gian. `now()` sẽ đẩy nó lên đầu danh
     * sách — nói dối ở đúng chỗ người dùng đang tin.
     */
    const ev = suKien({ at: '2026-01-15T04:30:00.000Z' });
    await notify.handle(ev);
    expect((await dong(ev.eventId))[0]!.xay_ra_luc.toISOString()).toBe('2026-01-15T04:30:00.000Z');
  });
});

describe('`0096` gửi lại từ DLQ không nhân đôi thông báo', () => {
  it('ba lượt xử lý cùng một sự kiện vẫn GỬI ĐƯỢC và vẫn ra một dòng', async () => {
    const ev = suKien();
    const ketQua = [await notify.handle(ev)];
    for (let i = 0; i < 2; i += 1) {
      // Xoá chỗ đã giữ, đúng như nhánh hỏng của `handle` làm trước khi vào DLQ —
      // không có bước này thì lượt sau trả `duplicate` và ca kiểm không chạm tới
      // câu INSERT lần nào.
      await withAdminDb(async (c) => {
        await c.query(`DELETE FROM ntf.sent_mail WHERE event_id = $1`, [ev.eventId]);
      });
      ketQua.push(await notify.handle(ev));
    }

    /*
     * KIỂM CẢ HAI VẾ, và vế thứ hai mới là vế `ON CONFLICT DO NOTHING` gác.
     *
     * Chỉ đếm dòng thì bỏ `ON CONFLICT` đi ca này VẪN XANH: câu INSERT ném lỗi
     * trùng khoá, cả lượt xử lý rơi vào `catch`, và bảng vẫn đúng một dòng. Cái
     * mất là lá THƯ — lượt gửi lại từ DLQ không bao giờ đi nổi qua dòng đầu.
     */
    expect(ketQua).toEqual(['sent', 'sent', 'sent']);
    expect(await dong(ev.eventId)).toHaveLength(1);
  });
});

describe('`0096` thư TÀI KHOẢN không thành thông báo', () => {
  it('không chỗ nào trong identity chạm tới `ntf.thong_bao`', () => {
    /*
     * Kích hoạt tài khoản và đặt lại mật khẩu là hai lá thư duy nhất bị loại
     * khỏi luật "thư nào cũng thành thông báo", và không phải vì thẩm mỹ.
     *
     * Chúng mang TOKEN THÔ trong thân thư. `ONB-15` cho phép token thô tồn tại
     * đúng hai chỗ — bộ nhớ tiến trình và thân email — còn CSDL chỉ giữ bản băm.
     * `ntf.thong_bao` đọc được qua API, nên một liên kết kích hoạt nằm trong
     * `duong_dan` là đúng cái rò rỉ mà đường gửi thư thứ hai của identity dựng
     * ra để tránh (xem đầu `identity/infra/mailer.ts`).
     *
     * Quét mã nguồn chứ không đếm dòng trong bảng: đếm dòng chỉ chứng minh rằng
     * lượt chạy này không ghi gì, còn phép quét chặn cả ý định.
     */
    const goc = new URL('../../services/identity/src', import.meta.url).pathname;
    const pham: string[] = [];
    const di = (thuMuc: string) => {
      for (const m of readdirSync(thuMuc, { withFileTypes: true })) {
        const p = join(thuMuc, m.name);
        if (m.isDirectory()) di(p);
        else if (p.endsWith('.ts') && readFileSync(p, 'utf8').includes('thong_bao')) pham.push(p);
      }
    };
    di(goc);
    expect(pham, pham.join(', ')).toEqual([]);
  });
});

describe('`0096` hộp thông báo là của riêng một người', () => {
  const hai = async () => {
    await notify.handle(suKien({ recipients: ['TDV'], tdvUserId: uid['tdv01'] }));
    await notify.handle(suKien({ recipients: ['TDV'], tdvUserId: uid['tdv02'] }));
  };

  it('mỗi người chỉ đọc được hộp của mình', async () => {
    await hai();
    const a = await get('/notifications/cua-toi', 'tdv01');
    const b = await get('/notifications/cua-toi', 'tdv02');
    expect(a.body.items).toHaveLength(1);
    expect(b.body.items).toHaveLength(1);
    expect(a.body.items[0].id).not.toBe(b.body.items[0].id);
    expect(a.body.soChuaDoc).toBe(1);
  });

  it('KHÔNG đánh dấu được thông báo của người khác — 404, không phải 403', async () => {
    /*
     * Mệnh đề `user_id = $me` trong câu UPDATE là thứ DUY NHẤT chặn đường này,
     * và nó là chỗ dễ quên nhất: câu SELECT có nó thì màn hình đã chạy đúng, và
     * lỗ hổng không lộ ra ở bất kỳ thao tác bình thường nào.
     *
     * 404 chứ không 403: tách hai câu ra là để lộ rằng id ấy có tồn tại.
     */
    await hai();
    const cuaB = (await get('/notifications/cua-toi', 'tdv02')).body.items[0].id as string;

    const r = await post(`/notifications/${cuaB}/da-doc`, 'tdv01');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('THONG_BAO_NOT_FOUND');

    // Và nó vẫn chưa đọc bên chủ thật.
    expect((await get('/notifications/cua-toi/dem', 'tdv02')).body.soChuaDoc).toBe(1);
  });

  it('*đã đọc hết* chỉ chạm hộp của chính mình', async () => {
    await hai();
    await post('/notifications/da-doc-het', 'tdv01');
    expect((await get('/notifications/cua-toi/dem', 'tdv01')).body.soChuaDoc).toBe(0);
    expect((await get('/notifications/cua-toi/dem', 'tdv02')).body.soChuaDoc).toBe(1);
  });

  it('mọi vai trò đều mở được hộp của mình — không có bảng phân quyền nào', async () => {
    // Kể cả Quản trị hệ thống, vai trò mà `idn.scope_user_ids` trả về rỗng nên
    // mọi endpoint số liệu đều ra 0. Hộp thư thì khác: nó không đi qua phạm vi.
    for (const u of ['tdv01', 'tbp01', 'kt01', 'sa01', 'admin01']) {
      expect((await get('/notifications/cua-toi/dem', u)).status, u).toBe(200);
    }
  });
});

describe('`0096` đánh dấu đã đọc', () => {
  it('bấm một dòng thì số chưa đọc giảm, bấm lại không dời mốc', async () => {
    const ev = suKien();
    await notify.handle(ev);
    const id = (await get('/notifications/cua-toi', 'tdv01')).body.items[0].id as string;

    const lan1 = await post(`/notifications/${id}/da-doc`, 'tdv01');
    expect(lan1.body.soChuaDoc).toBe(0);
    const moc = (await get('/notifications/cua-toi', 'tdv01')).body.items[0].daDocLuc as string;

    await new Promise((r) => setTimeout(r, 20));
    await post(`/notifications/${id}/da-doc`, 'tdv01');
    // `coalesce(da_doc_luc, now())`: mở lại một hồ sơ từ danh sách đầy đủ là
    // chuyện thường, và nó không được phép dời mốc đã đọc.
    expect((await get('/notifications/cua-toi', 'tdv01')).body.items[0].daDocLuc).toBe(moc);
  });

  it('lọc `chuaDoc=true` bỏ dòng đã đọc, `soChuaDoc` vẫn nói CẢ HỘP', async () => {
    await notify.handle(suKien({ policyCode: 'CS-TB-0002' }));
    await notify.handle(suKien({ policyCode: 'CS-TB-0003' }));
    const ds = (await get('/notifications/cua-toi', 'tdv01')).body.items;
    await post(`/notifications/${ds[0].id}/da-doc`, 'tdv01');

    const r = await get('/notifications/cua-toi?chuaDoc=true', 'tdv01');
    expect(r.body.items).toHaveLength(1);
    expect(r.body.total).toBe(1);
    expect(r.body.soChuaDoc).toBe(1);
  });

  it('mới nhất đứng đầu, theo mốc SỰ KIỆN', async () => {
    await notify.handle(suKien({ at: '2026-08-01T00:00:00.000Z', policyCode: 'CU' }));
    await notify.handle(suKien({ at: '2026-08-20T00:00:00.000Z', policyCode: 'MOI' }));
    const ds = (await get('/notifications/cua-toi', 'tdv01')).body.items;
    expect(ds.map((d: { moTa: string }) => d.moTa.split(' · ')[1])).toEqual(['MOI', 'CU']);
  });
});

/**
 * `0190` — THÔNG BÁO NÓI RÕ ĐÂY LÀ CSBH MỚI HAY BẢN THAY THẾ.
 *
 * Khách hàng chốt 08/09: *"thêm vào phần nội dung thông báo để biết thay đổi
 * trên CSBH là tạo mới CSBH đối với khách hàng mới, hay đó là chỉnh sửa bổ sung
 * trên một CSBH của một khách hàng đã có"*.
 *
 * Hai loại ấy đòi hai việc khác nhau ở người duyệt: bản đầu không có gì để đối
 * chiếu, bản thay thế thì phải soi xem nó đổi gì so với thứ khách hàng ĐANG được
 * hưởng — mà tới `0189` lá thư không phân biệt được hai trường hợp.
 */
describe('`0190` loại thay đổi trong nội dung thông báo', () => {
  const GOC_TEST = 'https://csbh.example.com';
  const su = (versionNo?: number): MailEvent => ({
    eventId: randomUUID(),
    routingKey: 'policy.status_changed',
    action: 'SUBMIT',
    policyId: '11111111-2222-3333-4444-555555555555',
    policyCode: 'CSBH-2026-000031',
    customerCode: 'KH0007',
    customerName: 'Nhà thuốc Minh Châu',
    toStatus: 'CHO_TBP_DUYET',
    at: '2026-09-08T03:00:00.000Z',
    ...(versionNo === undefined ? {} : { versionNo }),
  });

  it('phiên bản 1 → CSBH MỚI, và nói ra hệ quả', () => {
    const cau = loaiThayDoi(su(1));
    expect(cau).toContain('CSBH mới');
    // Nói ra HỆ QUẢ, không chỉ gọi tên: người duyệt đọc thư để biết mình sắp
    // phải làm gì.
    expect(cau).toContain('chưa có CSBH nào');
    expect(bodyFor(su(1), GOC_TEST)).toContain('Loại thay đổi');
  });

  it('phiên bản > 1 → BẢN THAY THẾ, kèm số phiên bản', () => {
    const cau = loaiThayDoi(su(4))!;
    expect(cau).toContain('Phiên bản 4');
    expect(cau).toContain('chỉnh sửa/bổ sung');
    expect(cau).toContain('thay thế');
    // Con số nói được thứ một cờ boolean không nói: hồ sơ này đã qua ba lần thay
    // thế trước đó.
    expect(cau).not.toContain('CSBH mới');
  });

  it('THIẾU `versionNo` thì dòng ấy VẮNG MẶT, không đoán bừa', () => {
    /*
     * Hai lá thư dùng chung khung này mà KHÔNG nói về một hồ sơ đang đi trong
     * luồng: `policy.superseded` nói về bản CŨ vừa hết hiệu lực. In một câu đoán
     * ra ở đó là khẳng định sai về chính hồ sơ người đọc đang cầm.
     */
    expect(loaiThayDoi(su())).toBeNull();
    const than = bodyFor(su(), GOC_TEST);
    expect(than).not.toContain('Loại thay đổi');
    expect(than).not.toContain('undefined');
    expect(than).not.toContain('NaN');
  });

  it('đứng ngay SAU mã hồ sơ, không bị đẩy xuống cuối thư', () => {
    /*
     * Chỗ đứng là một phần của yêu cầu: dòng này trả lời *"hồ sơ này là gì"*,
     * nên nó thuộc cụm định danh ở đầu thư. Đẩy xuống dưới *Trạng thái* và
     * *Bước đang duyệt* thì người đọc đã quyết định xong mình phải làm gì trước
     * khi đọc tới nó.
     */
    const dong = bodyFor(su(2), GOC_TEST).split('\n');
    const viTri = (k: string) => dong.findIndex((d) => d.startsWith(k));
    expect(viTri('Loại thay đổi')).toBeGreaterThan(viTri('Mã hồ sơ CSBH'));
    expect(viTri('Loại thay đổi')).toBeLessThan(viTri('Trạng thái'));
  });

  it('DÒNG CHUÔNG cũng nói, ở dạng ngắn', () => {
    // Khách hàng nói *"phần nội dung thông báo"* — thư và chuông là hai mặt của
    // cùng một thông báo (`0096`), nên bỏ sót một bên là làm đúng nửa việc.
    expect(moTaNgan(su(1))).toContain('CSBH mới');
    expect(moTaNgan(su(4))).toContain('Phiên bản 4');
    // Dạng NGẮN: dòng chuông là một dòng, không phải một đoạn văn.
    expect(moTaNgan(su(4))).not.toContain('chỉnh sửa/bổ sung');
    // Loại thay đổi đứng CUỐI — hai vế đầu là thứ người dùng dò để tìm hồ sơ.
    expect(moTaNgan(su(4))!.indexOf('Phiên bản 4')).toBeGreaterThan(
      moTaNgan(su(4))!.indexOf('CSBH-2026-000031'),
    );
  });

  it('thiếu `versionNo` thì dòng chuông giữ nguyên như trước', () => {
    expect(moTaNgan(su())).toBe('KH0007 — Nhà thuốc Minh Châu · CSBH-2026-000031');
  });

  it('ĐI HẾT ĐƯỜNG: `versionNo` từ sự kiện tới THƯ THẬT và tới dòng chuông', async () => {
    /*
     * CA QUAN TRỌNG NHẤT của `0190`, và nó canh một bẫy đã cắn ba lần.
     *
     * `notify.service` dựng `MailEvent` bằng cách LIỆT KÊ TỪNG TRƯỜNG — y hệt
     * một câu `SELECT` liệt kê từng cột. Thêm một khoá vào thân sự kiện mà quên
     * ở đó thì `versionNo` về `undefined`, TypeScript im vì trường khai `?`, và
     * triệu chứng là một dòng **lặng lẽ vắng mặt** trong thư. Ba ca ở trên đều
     * gọi thẳng `bodyFor` nên chúng XANH với đúng cái hỏng ấy.
     *
     * Nên ca này đẩy sự kiện qua `handle()` thật rồi đọc lá thư trong Mailpit.
     */
    const ev = suKien({ action: 'SUBMIT', recipients: ['TDV'], versionNo: 3 });
    expect(await notify.handle(ev)).toBe('sent');

    const thu = await mailpitLatestTo(EMAIL['tdv01']!);
    expect(thu, 'không gửi được thư nào').toBeDefined();
    expect(thu!.text).toContain('Loại thay đổi');
    expect(thu!.text).toContain('Phiên bản 3');

    const ds = await dong(ev.eventId);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.mo_ta, 'dòng chuông không nói loại thay đổi').toContain('Phiên bản 3');
  });
});
