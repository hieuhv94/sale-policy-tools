/**
 * NTF-01 … NTF-06, NTF-13, NTF-16, NTF-18, NTF-19 — thông báo email.
 *
 * Năm service chạy thật cùng lúc và nói chuyện qua RabbitMQ thật: policy phát
 * sự kiện vào `pol.outbox`, relay đẩy lên bus, notification tiêu thụ rồi gửi
 * SMTP tới Mailpit, và test đọc lại hộp thư qua HTTP API của Mailpit.
 *
 * Không giả lập một mắt xích nào. Ba lỗi tốn nhiều thời gian nhất của chặng này
 * — queue chưa khai báo nên sự kiện rơi vào hư vô, thứ tự thư sai vì `now()` là
 * thời điểm bắt đầu transaction, và thư trùng khi cùng sự kiện tới hai lần —
 * đều KHÔNG lộ ra ở bất kỳ bản giả nào.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PolicyOutbox } from '@csbh/policy/testing';
import { CatalogOutbox } from '@csbh/catalog/testing';
import {
  createTestApp as createNotificationApp,
  NotifyService,
  Mailer,
  assertSafeMailConfig,
  UnsafeMailConfigError,
} from '@csbh/notification/testing';
import { Bus, BUS } from '@csbh/bus';
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
  mailpitClear,
  withAdminDb,
  phanCongMacDinh,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZNTF';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let ntf: INestApplication;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

let outbox: PolicyOutbox;
let catOutbox: CatalogOutbox;
let notify: NotifyService;

const uniq = (k: string) => maDuyNhat(P, k);

const post = async (path: string, body: object, who = 'tdv01') =>
  (await http(policy)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
/**
 * MỌI hành động đi qua đây tự kèm người được phân công (`0031`).
 *
 * Xem `phanCongMacDinh`. Ca nào quan tâm tới người cụ thể thì truyền trong
 * `body` — nó nằm sau nên ghi đè mặc định.
 */
const act = async (id: string, action: string, who: string, body: object = {}) =>
  post(`/policies/${id}/actions/${action}`, { ...(await phanCongMacDinh(action)), ...body }, who);

// --- Đọc hộp thư Mailpit -----------------------------------------------------

type Summary = {
  ID: string;
  To: { Address: string }[];
  Subject: string;
  MessageID: string;
};

const listMail = async (): Promise<Summary[]> => {
  const r = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  return ((await r.json()) as { messages: Summary[] }).messages;
};

/**
 * Dọn hộp thư rồi CHỜ CHO NÓ ĐỨNG YÊN.
 *
 * `ntf.close()` không chờ lá thư đang gửi dở hoàn tất, nên một lá của ca kiểm
 * thử trước vẫn đáp xuống SAU `mailpitClear()` — và ca dưới đây, vốn khẳng định
 * "consumer đã tắt thì hộp thư phải trống", đếm nhầm nó thành thư của mình. Đỏ
 * theo xác suất, chỉ khi cả bộ test chạy cùng nhau.
 *
 * Dọn LẶP LẠI cho tới khi một lượt dọn không còn nhặt được gì mới: đó là dấu
 * hiệu duy nhất đáng tin rằng không còn lá nào trên đường.
 */
async function donHopThuVaCho(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await mailpitClear();
    await new Promise((r) => setTimeout(r, 250));
    if ((await listMail()).length === 0) return;
  }
  throw new Error('hộp thư vẫn nhận thư mới sau 20 lượt dọn — consumer chưa tắt hẳn?');
}

const fullMail = async (id: string) => {
  const r = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await r.json()) as {
    Text: string;
    Subject: string;
    To: { Address: string }[];
    MessageID: string;
    ReplyTo?: unknown;
  };
};

const rawMail = async (id: string): Promise<string> => {
  const r = await fetch(`${MAILPIT}/api/v1/message/${id}/raw`);
  return r.text();
};

/**
 * Chờ tới khi Mailpit có đủ `want` thư.
 *
 * Không phải `sleep` cho chắc: đường đi qua RabbitMQ là bất đồng bộ thật, nên
 * một khoảng chờ cố định vừa chậm vừa vẫn đỏ ngẫu nhiên trên máy tải nặng.
 */
async function waitMail(want: number, timeoutMs = 15_000): Promise<Summary[]> {
  const until = Date.now() + timeoutMs;
  let last: Summary[] = [];
  while (Date.now() < until) {
    last = await listMail();
    if (last.length >= want) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`chỉ có ${last.length}/${want} thư sau ${timeoutMs}ms`);
}

/** Chờ một điều kiện thành đúng. Đường đi qua bus là bất đồng bộ thật. */
async function waitFor(
  cond: () => Promise<boolean>,
  what: string,
  timeoutMs = 15_000,
): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${what} — quá ${timeoutMs}ms`);
}

/** Đẩy sự kiện lên bus rồi chờ notification xử lý xong đúng số thư mong đợi. */
async function flush(want: number): Promise<Summary[]> {
  await outbox.pumpOnce();
  return waitMail(want);
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
    });
  await c
    .post(`/catalog/products/${r.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
  return r.body.id as string;
};

/** Tên có đủ dấu tiếng Việt — NTF-18 kiểm mã hoá MIME trên chính tên này. */
const CUSTOMER_NAME = 'Nhà thuốc Minh Châu — Quận Đống Đa';

const makeCustomer = async (): Promise<{ id: string; code: string }> => {
  const c = await http(customer);
  const code = uniq('KH');
  const r = await c
    .post('/customers')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      code,
      name: CUSTOMER_NAME,
      customerType: 1,
      registeredAddress: 'Số 8 Tôn Thất Thuyết, Hà Nội',
      ownerName: 'Trần Thị Mỹ Hạnh',
    });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, code };
};

const line = (productId: string, over = false) => ({
  productId,
  wholesalePrice: '90000',
  cpbh: [over ? '20000' : '3000'],
});

/** Id của một tài khoản mẫu — cần khi ca kiểm thử chọn ĐÍCH DANH người xử lý. */
const idCua = async (username: string): Promise<string> =>
  withAdminDb(async (c) => {
    const r = await c.query<{ id: string }>(`SELECT id FROM idn.app_user WHERE username = $1`, [
      username,
    ]);
    return r.rows[0]!.id;
  });

async function draft(): Promise<{
  id: string;
  code: string;
  customerId: string;
  productId: string;
}> {
  const productId = await makeProduct();
  const cus = await makeCustomer();
  const r = await post('/policies', { customerId: cus.id, lines: [line(productId)] });
  if (r.status !== 201) throw new Error(`lập hồ sơ hỏng: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, code: r.body.code as string, customerId: cus.id, productId };
}

/** Chạy hết 10 bước bằng 5 tài khoản mẫu. */
async function runToActive(id: string): Promise<void> {
  await act(id, 'SUBMIT', 'tdv01');
  await act(id, 'TBP_SIGN', 'tbp01');
  await act(id, 'KT_RECEIVE_L1', 'kt01');
  await post(
    `/policies/${id}/attachments`,
    { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${id}.pdf` },
    'sa01',
  );
  await act(id, 'SA_HANDOVER', 'sa01');
  await act(id, 'KT_RECEIVE_L2', 'kt01');
}

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();

  // `tbp02` cho ca `0066` M-08: bản 2 phải do một Trưởng bộ phận KHÁC duyệt thì
  // mới có ai đó cần được báo rằng bản 1 vừa hết hiệu lực.
  for (const u of ['tdv01', 'tbp01', 'tbp02', 'kt01', 'sa01', 'admin01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }

  const c = await bootCatalogListening();
  catalog = c.app;
  restores.push(c.restore);
  const cu = await bootCustomerListening();
  customer = cu.app;
  restores.push(cu.restore);

  /*
   * Policy phải NGHE THẬT, không chỉ dựng trong tiến trình (`0066`).
   *
   * Ca *ngừng hợp tác* đi customer → policy bằng HTTP, và `POLICY_URL` mặc định
   * trỏ vào một container không có ở đây. `bootPolicyListening` mở cổng rồi trỏ
   * biến môi trường vào đúng bản vừa dựng — nhờ đó sự kiện thư rơi vào CÙNG một
   * `pol.outbox` mà `outbox.pumpOnce()` bên dưới đang bơm.
   */
  const po = await bootPolicyListening();
  policy = po.app;
  restores.push(po.restore);
  outbox = policy.get(PolicyOutbox);
  catOutbox = catalog.get(CatalogOutbox);

  // Dọn sạch hàng đợi TRƯỚC khi bật consumer. Queue là bền, nên sự kiện còn sót
  // từ lần chạy trước sẽ được giao ngay khi notification khởi động và làm sai
  // mọi phép đếm thư.
  const purge = new Bus();
  await purge.declareConsumer(
    BUS.queues.notification,
    BUS.queues.notificationDlq,
    BUS.bindings.notification,
  );
  await purge.declareConsumer(BUS.queues.policy, BUS.queues.policyDlq, BUS.bindings.policy);
  const ch = await purge.channel();
  await ch.purgeQueue(BUS.queues.notification);
  await ch.purgeQueue(BUS.queues.policy);
  await purge.close();

  // Mọi sự kiện tồn đọng trong outbox của các file test khác đánh dấu đã phát,
  // để chúng không trộn vào phép đếm ở đây.
  await withAdminDb(async (db) => {
    await db.query(`UPDATE pol.outbox SET published_at = now() WHERE published_at IS NULL`);
    await db.query(`UPDATE cat.outbox SET published_at = now() WHERE published_at IS NULL`);
  });

  ntf = await createNotificationApp();
  notify = ntf.get(NotifyService);

  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom NTF' });
  groupCode = g.body.code as string;
}, 90_000);

afterAll(async () => {
  await ntf?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
});

beforeEach(async () => {
  await mailpitClear();
});

// =============================================================================
// NTF-01 · NTF-02 — người nhận và nội dung
// =============================================================================

describe('NTF-01 · WF-01 · WF-04 · WF-28 người nhận từng bước khớp bảng muc 3', () => {
  // Đây là phần EMAIL của WF-01/04/28 đã hoãn từ chặng P5: khi đó `policy` mới
  // khẳng định tới lớp sự kiện outbox, còn thư có thật sự tới đúng người hay
  // không thì chưa có service nào gửi để mà kiểm.
  //
  // NĂM thư chứ không phải mười hai như bản thiết kế ghi: một bước gửi MỘT thư
  // cho nhiều người nhận, không phải mỗi người một thư — đó cũng là điều kiện
  // để chúng gộp được vào một luồng (NTF-04). Con số 12 trong thiết kế đếm nhầm
  // theo lượt người nhận.
  //
  // Sáu xuống năm ở `0064`: lá thư "B5 phát hành" đi cùng `PUBLISH_SIGNED`, mà
  // Kế toán đã có tên trong lá B4 ngay trước nó. Hai thư về cùng một giây.
  it('năm bước sinh năm thư, mỗi thư đúng tập người nhận', async () => {
    const d = await draft();
    await runToActive(d.id);

    const mails = await flush(5);
    expect(mails.length).toBe(5);

    // Mailpit trả thư mới nhất trước; đảo lại để so theo thứ tự nghiệp vụ.
    const byOrder = [...mails].reverse();
    const to = byOrder.map((m) => m.To.map((t) => t.Address).sort());

    expect(to).toEqual([
      ['tbp01@csbh.test'], //                                     B3 gửi duyệt   -> TBP
      ['kt01@csbh.test', 'tdv01@csbh.test'], //                    B4 ký số       -> KT, TDV
      ['sa01@csbh.test', 'tbp01@csbh.test', 'tdv01@csbh.test'], //  B6 tiếp nhận 1 -> SA, TBP, TDV
      ['kt01@csbh.test', 'tbp01@csbh.test', 'tdv01@csbh.test'], //  B8 bàn giao    -> KT, TBP, TDV
      ['kt01@csbh.test', 'sa01@csbh.test', 'tbp01@csbh.test', 'tdv01@csbh.test'], // B10 -> đủ 4
    ]);
  });

  it('không gửi cho TDV ngoài phạm vi — tdv03 và tbp02 không nhận thư nào', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await flush(1);

    const all = await listMail();
    const addrs = all.flatMap((m) => m.To.map((t) => t.Address));
    expect(addrs).not.toContain('tdv03@csbh.test');
    // tbp02 duyệt tdv03; hồ sơ này của tdv01, do tbp01 duyệt.
    expect(addrs).not.toContain('tbp02@csbh.test');
  });
});

describe('`0035` TDV xoá hồ sơ bị trả lại thì người đã trả nhận được thư', () => {
  /*
   * Vì sao có thư ở đây, trong khi yêu cầu không nhắc tới email.
   *
   * `YEU_CAU_CHINH_SUA` nghĩa là có người đã đọc hồ sơ, đã trả nó lại kèm lý do,
   * và đang chờ một bản sửa. Xoá trong im lặng thì bản sửa ấy không bao giờ tới
   * và không có gì nói vì sao — hồ sơ chỉ lặng lẽ rời khỏi danh sách của họ. Đó
   * đúng là loại "việc treo" mà cả hệ này đang cố gỡ.
   */
  it('thư đi tới TBP và Kế toán, tiêu đề nói rõ ai làm gì', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' });

    const xoa = await (await http(policy))
      .delete(`/policies/${d.id}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(xoa.status, JSON.stringify(xoa.body)).toBe(204);

    // Ba thư: gửi duyệt → TBP, trả lại → TDV, xoá → TBP và Kế toán.
    const mails = await flush(3);
    const m = await fullMail(mails[0]!.ID);
    expect(m.To.map((t) => t.Address).sort()).toEqual(['kt01@csbh.test', 'tbp01@csbh.test']);
    // Tiêu đề KHÔNG nói "bị trả lại" nữa (`0039`): hồ sơ *Từ chối* cũng xoá được,
    // và một tiêu đề đúng cho nửa số trường hợp là tiêu đề sai.
    expect(m.Subject).toContain('Trình dược viên đã xoá hồ sơ');
    // Trạng thái trong thân thư phải là nhãn tiếng Việt, không phải mã enum —
    // thiếu một dòng trong `STATUS_LABEL` là người nhận đọc thấy "DA_XOA".
    expect(m.Text).toContain('Đã xoá');
    expect(m.Text).not.toContain('DA_XOA');
  });
});

describe('`0036` thư "để biết" cho mọi người đã tác động lên hồ sơ', () => {
  /*
   * Yêu cầu: đổi trạng thái thì báo cho MỌI người đã đi qua hồ sơ, không chỉ
   * người phải xử lý bước hiện tại.
   *
   * Ca dựng ra ở đây là ca duy nhất mà hai tập ấy KHÁC NHAU: Trưởng bộ phận thứ
   * nhất trả hồ sơ về, người lập sửa rồi gửi cho một Trưởng bộ phận KHÁC. Người
   * thứ nhất biến khỏi cột `tbp_user_id`, nên mọi phép suy từ bốn cột phân công
   * đều bỏ sót họ — nhưng họ là người đã đọc hồ sơ và đã viết lý do trả lại.
   */
  it('Trưởng bộ phận đã bị thay vẫn nhận thư, và liên kết trỏ vào NHẬT KÝ', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' });
    // Gửi lại cho tbp02 — `RESUBMIT_AFTER_EDIT` chọn lại người, không kế thừa.
    await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01', { tbpUserId: await idCua('tbp02') });

    // Bốn thư: gửi duyệt → tbp01, trả lại → tdv01, gửi lại → tbp02, và thư
    // "để biết" → tbp01.
    const mails = await flush(4);
    const theoDoi = [];
    for (const m of mails) {
      const full = await fullMail(m.ID);
      if (full.Text.includes('chỉ để bạn biết')) theoDoi.push(full);
    }
    expect(theoDoi, 'phải có đúng một thư "để biết"').toHaveLength(1);

    const t = theoDoi[0]!;
    expect(t.To.map((x) => x.Address)).toEqual(['tbp01@csbh.test']);
    // Liên kết trỏ vào NHẬT KÝ: mở hồ sơ ra họ chẳng có nút nào bấm được, còn
    // thứ họ muốn biết là hồ sơ đã đi qua đâu từ lúc mình rời tay.
    expect(t.Text).toMatch(/\/ho-so\/[0-9a-f-]{36}\/nhat-ky/);
    expect(t.Text).toContain('KHÔNG phải xử lý gì');
  });

  it('người ĐANG phải xử lý chỉ nhận MỘT thư, không nhận thêm bản "để biết"', async () => {
    // Hai thư cho một sự kiện là cách nhanh nhất khiến người ta ngừng đọc cả
    // hai. Người nhận thư chính bị trừ khỏi danh sách "để biết".
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    // HAI thư: gửi duyệt và ký số. Bước tự động sau ký đã gỡ ở `0064`.
    const mails = await flush(2);
    expect(mails).toHaveLength(2);
    for (const m of mails) {
      expect((await fullMail(m.ID)).Text).not.toContain('chỉ để bạn biết');
    }
  });

  it('người vừa bấm nút KHÔNG tự nhận thư "để biết" về việc mình vừa làm', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await flush(1);
    await mailpitClear();

    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Sai gia' });
    const mails = await flush(1);
    // Đúng một thư, tới người lập. tbp01 vừa bấm nút nên không nhận gì.
    expect(mails).toHaveLength(1);
    const m = await fullMail(mails[0]!.ID);
    expect(m.To.map((x) => x.Address)).toEqual(['tdv01@csbh.test']);
  });
});

describe('NTF-02 nội dung một thư có đủ bảy trường bắt buộc', () => {
  it('mã KH, tên KH, mã hồ sơ, trạng thái, bước, thời điểm, liên kết', async () => {
    const d = await draft();
    const cus = await withAdminDb(async (c) => {
      const q = await c.query<{ code: string }>(`SELECT code FROM cus.customer WHERE id = $1`, [
        d.customerId,
      ]);
      return q.rows[0]!;
    });
    await act(d.id, 'SUBMIT', 'tdv01');

    const mails = await flush(1);
    const m = await fullMail(mails[0]!.ID);

    expect(m.Text).toContain(cus.code);
    expect(m.Text).toContain(CUSTOMER_NAME);
    expect(m.Text).toContain('CSBH-');
    expect(m.Text).toContain('Chờ Trưởng bộ phận duyệt');
    // `0066`: nhãn bước KHÔNG còn số thứ tự. Khẳng định cả hai vế — có phần
    // chữ, và không còn chữ "Bước 4" — vì bỏ số là cả điểm của thay đổi ấy.
    expect(m.Text).toContain('Bước đang duyệt: Trưởng bộ phận duyệt và ký số');
    expect(m.Text).not.toMatch(/Bước \d/);
    expect(m.Text).toMatch(/Thời điểm:\s+\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    // `/ho-so/:id`, KHÔNG phải `/policies/:id` (`0036`). Đường cũ là đường của
    // API — `App.tsx` không bắt nó, nên mọi liên kết trong mọi lá thư từ trước
    // tới nay đều dẫn tới màn hình "Không có màn hình nào ở địa chỉ này".
    expect(m.Text).toMatch(/\/ho-so\/[0-9a-f-]{36}/);
    expect(m.Text).not.toContain('/policies/');
  });

  it('thư trả lại có LÝ DO, thư báo thành công thì không có dòng lý do', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await flush(1);
    await mailpitClear();

    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thiếu chữ ký người đề nghị' });
    const back = await flush(1);
    expect((await fullMail(back[0]!.ID)).Text).toContain('Thiếu chữ ký người đề nghị');

    await mailpitClear();
    await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const signed = await flush(2);
    const sign = signed.find((x) => x.Subject.includes('đã ký số'))!;
    expect((await fullMail(sign.ID)).Text).not.toContain('Lý do:');
  });
});

// =============================================================================
// `0066` M-08 — CSBH hết hiệu lực thì có thư, cả hai đường
// =============================================================================

describe('`0066` M-08 hết hiệu lực vì có phiên bản mới', () => {
  /** Chờ tới khi hộp thư có một lá mang tiêu đề chứa `khoa`, rồi trả về lá đó. */
  async function doiThu(khoa: string) {
    await outbox.pumpOnce();
    await waitFor(
      async () => (await listMail()).some((m) => m.Subject.includes(khoa)),
      `thư có tiêu đề chứa "${khoa}"`,
    );
    return (await listMail()).find((m) => m.Subject.includes(khoa))!;
  }

  it('người của bản CŨ, không còn tên ở bản mới, được báo hết hiệu lực', async () => {
    const d = await draft();
    await runToActive(d.id);

    /*
     * Bản 2 gửi cho một Trưởng bộ phận KHÁC — và đó chính là ca duy nhất lá thư
     * này có ích. tbp01 đã duyệt và ký bản 1, không có tên trong bản 2, nên
     * không lá thư nào khác báo cho họ rằng chính sách họ từng ký vừa hết hiệu
     * lực. Trước `0066` chuyện đó diễn ra hoàn toàn trong im lặng.
     */
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'SUPPLEMENT',
      lines: [line(await makeProduct())],
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    const id2 = v2.body.id as string;

    await act(id2, 'SUBMIT', 'tdv01', { tbpUserId: await idCua('tbp02') });
    await act(id2, 'TBP_SIGN', 'tbp02');
    await act(id2, 'KT_RECEIVE_L1', 'kt01');
    await post(
      `/policies/${id2}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${id2}.pdf` },
      'sa01',
    );
    await act(id2, 'SA_HANDOVER', 'sa01');
    await act(id2, 'KT_RECEIVE_L2', 'kt01');

    const thu = await doiThu('phiên bản mới');
    // ĐÚNG tbp01. Ba người còn lại của bản cũ đều đang giữ bản mới, và họ vừa
    // nhận lá "CSBH bắt đầu có hiệu lực" trong cùng một giây.
    expect(thu.To.map((x) => x.Address)).toEqual(['tbp01@csbh.test']);

    const m = await fullMail(thu.ID);
    // Thư nói về hồ sơ CŨ: mã hồ sơ cũ, liên kết mở hồ sơ cũ.
    expect(m.Text).toContain(d.code);
    expect(m.Text).toContain(`/ho-so/${d.id}`);
    expect(m.Text).toContain('Trạng thái:');
    expect(m.Text).toContain('Hết hiệu lực');
    expect(m.Text).toContain('Đã kết thúc — CSBH này không còn hiệu lực');
    // Và chỉ ra bản thay thế — không có dòng này thì người nhận phải tự đi tìm.
    expect(m.Text).toContain(`Phiên bản thay thế`);
    expect(m.Text).toContain(v2.body.code as string);
  }, 120_000);

  it('cả bốn người vẫn giữ bản mới thì KHÔNG có lá thư nào thêm', async () => {
    /*
     * Ca bảo vệ trước chính lá thư vừa thêm.
     *
     * Đây là hình dạng THƯỜNG GẶP: cùng một TDV, cùng một Trưởng bộ phận, cùng
     * một Kế toán giữ cả hai phiên bản. Cả bốn người vừa nhận lá "CSBH bắt đầu
     * có hiệu lực", nên gửi thêm một lá nữa cho chính họ là hai thư trong một
     * giây — đúng thứ đã phải gỡ bỏ một trạng thái khỏi máy trạng thái để dứt.
     */
    const d = await draft();
    await runToActive(d.id);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'SUPPLEMENT',
      lines: [line(await makeProduct())],
    });
    const id2 = v2.body.id as string;

    await act(id2, 'SUBMIT', 'tdv01');
    await act(id2, 'TBP_SIGN', 'tbp01');
    await act(id2, 'KT_RECEIVE_L1', 'kt01');
    await post(
      `/policies/${id2}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${id2}.pdf` },
      'sa01',
    );
    await act(id2, 'SA_HANDOVER', 'sa01');
    await donHopThuVaCho();
    await act(id2, 'KT_RECEIVE_L2', 'kt01');

    // Lá cuối của luồng là mốc: nó và lá "hết hiệu lực" phát ra trong CÙNG một
    // transaction, nên thấy nó tới rồi mà vẫn chỉ có một thư nghĩa là lá kia
    // thật sự không được gửi, không phải chưa kịp tới.
    await doiThu('bắt đầu có hiệu lực');
    const tat = await listMail();
    expect(tat.filter((m) => m.Subject.includes('hết hiệu lực'))).toHaveLength(0);
  }, 120_000);

  it('khách hàng ngừng hợp tác — ba người còn lại của hồ sơ được báo', async () => {
    const d = await draft();
    await runToActive(d.id);
    await donHopThuVaCho();

    // TDV phụ trách bấm *Ngừng hợp tác*. customer gọi sang policy, policy cho
    // mọi CSBH đang hiệu lực của khách này hết hiệu lực.
    const r = await (await http(customer))
      .delete(`/customers/${d.customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const thu = await doiThu('ngừng hợp tác');
    // Không có tdv01: họ vừa bấm nút và vừa nhìn thấy kết quả trên màn hình.
    expect(thu.To.map((x) => x.Address).sort()).toEqual([
      'kt01@csbh.test',
      'sa01@csbh.test',
      'tbp01@csbh.test',
    ]);

    const m = await fullMail(thu.ID);
    expect(m.Text).toContain(d.code);
    expect(m.Text).toContain(CUSTOMER_NAME);
    expect(m.Text).toContain('Hết hiệu lực');
    // Lý do in ra chứ không để người nhận đoán vì sao chính sách biến mất.
    expect(m.Text).toContain('Khách hàng ngừng hợp tác');
    // KHÔNG có dòng "Phiên bản thay thế": ở đường này không có bản nào thay thế,
    // và gợi ý ngược lại là bắt người đọc đi tìm một hồ sơ không tồn tại.
    expect(m.Text).not.toContain('Phiên bản thay thế');
  }, 120_000);
});

// =============================================================================
// NTF-04 · NTF-18 — gộp luồng và tiếng Việt
// =============================================================================

describe('NTF-04 mọi thư của một khách hàng nằm chung một luồng', () => {
  it('cùng References, khác Message-ID', async () => {
    const d = await draft();
    await runToActive(d.id);
    const mails = await flush(5);

    const raws = await Promise.all(mails.map((m) => rawMail(m.ID)));
    const refs = raws.map((r) => /^References:\s*(.+)$/im.exec(r)?.[1]?.trim());
    const ids = raws.map((r) => /^Message-ID:\s*(.+)$/im.exec(r)?.[1]?.trim());

    expect(new Set(refs).size).toBe(1);
    expect(refs[0]).toMatch(/^<csbh\.thread\..+@nutricare\.test>$/);
    // Năm thư khác nhau: gộp luồng KHÔNG được làm chúng thành một thư.
    expect(new Set(ids).size).toBe(5);
  });

  it('hai khách hàng khác nhau thì hai luồng khác nhau', async () => {
    const a = await draft();
    const b = await draft();
    await act(a.id, 'SUBMIT', 'tdv01');
    await act(b.id, 'SUBMIT', 'tdv01');
    const mails = await flush(2);

    const raws = await Promise.all(mails.map((m) => rawMail(m.ID)));
    const refs = raws.map((r) => /^References:\s*(.+)$/im.exec(r)?.[1]?.trim());
    expect(new Set(refs).size).toBe(2);
  });
});

describe('NTF-18 dấu tiếng Việt trong tiêu đề và thân thư', () => {
  it('tiêu đề mã hoá MIME đúng, đọc ra lại nguyên tên khách hàng', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const mails = await flush(1);

    const m = await fullMail(mails[0]!.ID);
    expect(m.Subject).toContain(CUSTOMER_NAME);
    expect(m.Text).toContain('Trưởng bộ phận');

    // Trên dây, tiêu đề PHẢI ở dạng mã hoá — gửi UTF-8 thô là thứ Outlook hiển
    // thị ra ký tự lạ, và Mailpit thì vẫn đọc ra đúng nên không lộ ở phép so trên.
    const raw = await rawMail(mails[0]!.ID);
    expect(raw).toMatch(/^Subject:.*=\?UTF-8\?/im);
  });
});

// =============================================================================
// NTF-06 — chống gửi trùng
// =============================================================================

describe('NTF-06 cùng một sự kiện tới ba lần', () => {
  it('chỉ gửi đúng một thư', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const ev = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string; routing_key: string; payload: object }>(
        `SELECT id, routing_key, payload FROM pol.outbox
          WHERE payload->>'policyId' = $1 ORDER BY seq DESC LIMIT 1`,
        [d.id],
      );
      return q.rows[0]!;
    });

    const incoming = {
      eventId: ev.id,
      routingKey: ev.routing_key,
      payload: ev.payload as Record<string, unknown>,
    };
    const outcomes = [
      await notify.handle(incoming),
      await notify.handle(incoming),
      await notify.handle(incoming),
    ];

    expect(outcomes).toEqual(['sent', 'duplicate', 'duplicate']);
    expect((await listMail()).length).toBe(1);
  });

  it('hai bản notification xử lý song song cũng chỉ ra một thư', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const ev = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string; routing_key: string; payload: object }>(
        `SELECT id, routing_key, payload FROM pol.outbox
          WHERE payload->>'policyId' = $1 ORDER BY seq DESC LIMIT 1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    const incoming = {
      eventId: ev.id,
      routingKey: ev.routing_key,
      payload: ev.payload as Record<string, unknown>,
    };

    // Chạy đồng thời: nếu chống trùng làm bằng SELECT rồi INSERT thì cả hai đều
    // thấy "chưa có" và cả hai đều gửi. Ràng buộc UNIQUE thì không lách được.
    const both = await Promise.all([notify.handle(incoming), notify.handle(incoming)]);
    expect(both.filter((x) => x === 'sent').length).toBe(1);
    expect(both.filter((x) => x === 'duplicate').length).toBe(1);
    expect((await listMail()).length).toBe(1);
  });
});

// =============================================================================
// NTF-05 — SMTP hỏng, thử lại, DLQ
// =============================================================================

describe('NTF-05 SMTP hỏng', () => {
  it('thử lại rồi vào DLQ, không mất sự kiện và không đánh dấu đã gửi', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const ev = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string; routing_key: string; payload: object }>(
        `SELECT id, routing_key, payload FROM pol.outbox
          WHERE payload->>'policyId' = $1 ORDER BY seq DESC LIMIT 1`,
        [d.id],
      );
      return q.rows[0]!;
    });

    const mailer = ntf.get(Mailer);
    const real = mailer.send.bind(mailer);
    let calls = 0;
    (mailer as unknown as { send: unknown }).send = async () => {
      calls++;
      throw new Error('ECONNREFUSED 127.0.0.1:1');
    };

    const outcome = await notify.handle({
      eventId: ev.id,
      routingKey: ev.routing_key,
      payload: ev.payload as Record<string, unknown>,
    });
    (mailer as unknown as { send: unknown }).send = real;

    expect(outcome).toBe('dead');
    // Ba lần thử lại có giãn cách, cộng lần đầu.
    expect(calls).toBe(mailer.cfg.retryBackoffMs.length + 1);
    expect((await listMail()).length).toBe(0);

    const dead = await withAdminDb(async (c) => {
      const q = await c.query<{ attempts: number; last_error: string }>(
        `SELECT attempts, last_error FROM ntf.dead_letter WHERE event_id = $1`,
        [ev.id],
      );
      return q.rows[0]!;
    });
    expect(dead.attempts).toBe(calls);
    expect(dead.last_error).toContain('ECONNREFUSED');

    // Chỗ giữ trong sent_mail phải được TRẢ LẠI, nếu không thì gửi lại bao nhiêu
    // lần cũng bị chặn vì trùng event_id — mất thư vĩnh viễn.
    const claimed = await withAdminDb(async (c) =>
      c.query(`SELECT 1 FROM ntf.sent_mail WHERE event_id = $1`, [ev.id]),
    );
    expect(claimed.rowCount).toBe(0);

    // Gửi lại sau khi SMTP hồi phục thì thành công.
    const again = await notify.handle({
      eventId: ev.id,
      routingKey: ev.routing_key,
      payload: ev.payload as Record<string, unknown>,
    });
    expect(again).toBe('sent');
    expect((await waitMail(1)).length).toBe(1);
  });

  it('API xem hàng đợi lỗi trả về đúng bản ghi, và Quản trị mới gọi được', async () => {
    const admin = await (await http(ntf))
      .get('/notifications/dead-letters?open=true')
      .set('Authorization', `Bearer ${tok['admin01']}`);
    expect(admin.status).toBe(200);
    expect(Array.isArray(admin.body.items)).toBe(true);

    // Tên trường camelCase như mọi endpoint khác. Trước P11b nhóm này trả thẳng
    // tên cột snake_case — màn hình thư hỏng đọc `routingKey`/`failedAt`, nên
    // quay lại snake_case là bảng hiện toàn ô trống mà không lỗi nào báo.
    const dong = (admin.body.items as Record<string, unknown>[])[0];
    if (dong) {
      expect(Object.keys(dong)).toEqual(
        expect.arrayContaining(['eventId', 'routingKey', 'lastError', 'failedAt', 'resolvedAt']),
      );
    }

    const tdv = await (await http(ntf))
      .get('/notifications/dead-letters')
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(tdv.status).toBe(403);
  });
});

// =============================================================================
// NTF-16 · NTF-19 — hai chốt an toàn và chuyển hướng thư
// =============================================================================

describe('NTF-16 cấu hình thư nguy hiểm thì service từ chối khởi động', () => {
  it('production trỏ vào Mailpit — chặn', () => {
    expect(() =>
      assertSafeMailConfig({ NODE_ENV: 'production', MAIL_HOST: 'mailpit' }),
    ).toThrow(UnsafeMailConfigError);
  });

  it('môi trường test trỏ vào SMTP thật mà chưa đặt MAIL_REDIRECT_ALL — chặn', () => {
    expect(() =>
      assertSafeMailConfig({ NODE_ENV: 'staging', MAIL_HOST: 'smtp.nutricare.vn' }),
    ).toThrow(UnsafeMailConfigError);
  });

  it('cùng cấu hình đó nhưng CÓ MAIL_REDIRECT_ALL — cho qua', () => {
    expect(() =>
      assertSafeMailConfig({
        NODE_ENV: 'staging',
        MAIL_HOST: 'smtp.nutricare.vn',
        MAIL_REDIRECT_ALL: 'qa@nutricare.vn',
      }),
    ).not.toThrow();
  });

  it('production trỏ vào SMTP thật — cho qua', () => {
    expect(() =>
      assertSafeMailConfig({ NODE_ENV: 'production', MAIL_HOST: 'smtp.nutricare.vn' }),
    ).not.toThrow();
  });

  it('tên máy chủ chưa từng gặp bị coi là relay THẬT, không phải hộp thư giả', () => {
    // Mặc định nghiêng về phía an toàn. Ngược lại thì mọi tên lạ đều lọt qua và
    // chốt an toàn này không chặn được gì.
    expect(() => assertSafeMailConfig({ NODE_ENV: 'test', MAIL_HOST: 'mail-server-01' })).toThrow(
      UnsafeMailConfigError,
    );
  });
});

describe('NTF-19 MAIL_REDIRECT_ALL dồn thư về hộp QA', () => {
  it('người nhận gốc vẫn tra được ở header X-Original-To', async () => {
    const mailer = ntf.get(Mailer);
    const saved = mailer.cfg.redirectAll;
    (mailer.cfg as { redirectAll: string | undefined }).redirectAll = 'qa@csbh.test';
    try {
      await mailer.send({
        eventId: '11111111-1111-1111-1111-111111111111',
        to: ['tdv01@csbh.test', 'tbp01@csbh.test'],
        subject: '[CSBH] Thử chuyển hướng',
        text: 'nội dung',
        threadKey: 'KH-REDIRECT',
      });
    } finally {
      (mailer.cfg as { redirectAll: string | undefined }).redirectAll = saved;
    }

    const mails = await waitMail(1);
    expect(mails[0]!.To.map((t) => t.Address)).toEqual(['qa@csbh.test']);
    const raw = await rawMail(mails[0]!.ID);
    expect(raw).toMatch(/X-Original-To:.*tdv01@csbh\.test/i);
    expect(raw).toMatch(/X-Original-To:.*tbp01@csbh\.test/i);
  });

  it('MAIL_ALLOWLIST loại địa chỉ ngoài tên miền công ty', () => {
    const mailer = ntf.get(Mailer);
    const saved = mailer.cfg.allowlist;
    (mailer.cfg as { allowlist: string[] }).allowlist = ['@nutricare.vn'];
    try {
      expect(mailer.allowed(['a@nutricare.vn', 'b@gmail.com'])).toEqual(['a@nutricare.vn']);
    } finally {
      (mailer.cfg as { allowlist: string[] }).allowlist = saved;
    }
  });
});

// =============================================================================
// NTF-13 — đổi giá sản phẩm trong CSBH đang hiệu lực
// =============================================================================

describe('NTF-13 đổi giá sản phẩm nằm trong CSBH đang hiệu lực', () => {
  it('thư tới đúng TDV phụ trách, và hồ sơ đã ký KHÔNG bị ghi đè', async () => {
    const d = await draft();
    await runToActive(d.id);
    await flush(5);
    await mailpitClear();

    const before = await withAdminDb(async (c) => {
      const q = await c.query<{ company_price_snap: string; row_version: number }>(
        `SELECT l.company_price_snap::text, p.row_version
           FROM pol.policy p JOIN pol.policy_line l ON l.policy_id = p.id
          WHERE p.id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });

    // Lập sản phẩm cũng ghi một sự kiện đổi giá (lần đặt giá đầu tiên). Đánh dấu
    // mọi sự kiện tồn đọng là đã phát để chỉ ĐÚNG một sự kiện đi lên bus ở đây —
    // nếu không thì thư đầu tiên tới là thư của lần đặt giá 100.000.
    await withAdminDb(async (c) => {
      await c.query(`UPDATE cat.outbox SET published_at = now() WHERE published_at IS NULL`);
      await c.query(`UPDATE pol.outbox SET published_at = now() WHERE published_at IS NULL`);
    });

    await (await http(catalog))
      .post(`/catalog/products/${d.productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '120000', effectiveFrom: '2020-06-01' });

    /*
     * Chạy đúng đường thật: catalog -> bus -> policy tiêu thụ -> `pol.policy_impact`.
     *
     * `0055` bỏ lá thư, nên chờ DẤU VẾT chứ không chờ sự kiện thư. Dấu vết mới là
     * thứ box *Yêu cầu cập nhật* và khối cảnh báo trên màn hình hồ sơ đọc.
     */
    await catOutbox.pumpOnce();
    await waitFor(async () => {
      const r = await withAdminDb(async (c) =>
        c.query(`SELECT 1 FROM pol.policy_impact WHERE policy_id = $1 AND kind = 'PRICE'`, [d.id]),
      );
      return r.rowCount === 1;
    }, 'policy chưa tiêu thụ xong catalog.price_changed');

    // Và KHÔNG lá thư nào đi ra (`0055`). Đây là nửa quan trọng của ca này: gỡ
    // một tính năng mà không có gì canh thì nó lặng lẽ quay lại ở lần sửa sau.
    await outbox.pumpOnce();
    await new Promise((r) => setTimeout(r, 500));
    expect((await listMail()).length, 'vẫn còn gửi thư báo lệch danh mục').toBe(0);

    // Giá đóng băng và số phiên bản không đổi một chữ số nào.
    const after = await withAdminDb(async (c) => {
      const q = await c.query<{ company_price_snap: string; row_version: number }>(
        `SELECT l.company_price_snap::text, p.row_version
           FROM pol.policy p JOIN pol.policy_line l ON l.policy_id = p.id
          WHERE p.id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(after).toEqual(before);
  });
});

// =============================================================================
// 0029 — đổi QUY ĐỊNH CHIẾT KHẤU cũng ghi dấu vết, đúng như đổi giá
// =============================================================================

describe('0029 đổi quy định chiết khấu áp cho CSBH đang hiệu lực', () => {
  it('`0055` ghi dấu vết cho box Yêu cầu cập nhật, và KHÔNG gửi thư', async () => {
    // Sản phẩm thuộc nhóm RIÊNG: quy định khai cho nó không được đụng tới những
    // hồ sơ khác trong tệp này, nếu không phép đếm thư ở đây thành vô nghĩa.
    const c = await http(catalog);
    const nhom = uniq('NHOM29');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: nhom, name: 'Nhom rieng 0029' });
    const sp = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP29'), name: 'SP rieng 0029', groupCode: nhom });
    await c
      .post(`/catalog/products/${sp.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });

    const cus = await makeCustomer();
    const hs = await post('/policies', {
      customerId: cus.id,
      lines: [line(sp.body.id as string)],
    });
    expect(hs.status, JSON.stringify(hs.body)).toBe(201);
    await runToActive(hs.body.id as string);
    await flush(5);
    await mailpitClear();

    await withAdminDb(async (cc) => {
      await cc.query(`UPDATE cat.outbox SET published_at = now() WHERE published_at IS NULL`);
      await cc.query(`UPDATE pol.outbox SET published_at = now() WHERE published_at IS NULL`);
    });

    // Hồ sơ chụp lúc CHƯA có quy định nào — ngưỡng rỗng. Khai một quy định giờ
    // là đúng cái tình huống khó thấy nhất: hồ sơ không mang mã quy định nào,
    // nên lọc theo `rule_code_snap` sẽ bỏ sót nó hoàn toàn.
    await c
      .post('/catalog/discount-rules')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({
        code: uniq('CK29'),
        productGroupCode: nhom,
        effectiveFrom: '2020-01-01',
        thresholdRate2: 1750,
      });

    /*
     * BƠM MỖI VÒNG, không bơm một lần rồi chờ suông.
     *
     * Một lượt bơm duy nhất phải rơi đúng lúc consumer đã sẵn sàng thì mới ăn;
     * lệch nhịp là ca này chờ hết hạn rồi đỏ, mà chạy lại một mình thì xanh.
     * Đúng kiểu mong manh chỉ lộ ra khi cả bộ test chạy cùng nhau.
     *
     * VÀ HẠN CHỜ RỘNG HƠN HẲN MẶC ĐỊNH — 120 giây, không phải 15.
     *
     * Đổi một quy định chiết khấu buộc consumer rà LẠI MỌI hồ sơ đã đóng băng
     * (xem `catalog-impact.consumer.ts`): không suy ra được hồ sơ nào bị ảnh
     * hưởng mà không tra lại từng cái. Mỗi hồ sơ tốn một lượt hỏi khách hàng và
     * một lượt hỏi danh mục, nối đuôi nhau.
     *
     * CSDL của bộ test KHÔNG bị dọn giữa các lượt chạy, nên số hồ sơ đã đóng
     * băng chỉ tăng — mỗi lượt `make test` bồi thêm vài trăm. Ở mốc 1300 hồ sơ,
     * lượt rà đã vượt 15 giây, và ca này đỏ theo đúng cái đà tăng ấy chứ không
     * theo bất kỳ thay đổi nào của mã.
     *
     * Nới hạn là ĐÚNG chỗ để sửa: ca này khẳng định dấu vết ghi ra đúng NGƯỠNG
     * mới — nó không khẳng định gì về tốc độ rà. Buộc nó vào một ngân sách thời
     * gian là bắt nó gãy vì một lý do nó không nói tới.
     */
    let dauVet!: { kind: string; new_value: string | null };
    await waitFor(async () => {
      await catOutbox.pumpOnce();
      const r = await withAdminDb(async (cc) =>
        cc.query<{ kind: string; new_value: string | null }>(
          `SELECT kind, new_value FROM pol.policy_impact WHERE policy_id = $1`,
          [hs.body.id],
        ),
      );
      if (r.rowCount !== 1) return false;
      dauVet = r.rows[0]!;
      return true;
    }, 'policy chưa tiêu thụ xong catalog.changed', 120_000);

    // Dấu vết nói về NGƯỠNG chứ không nói về giá, và mang đúng con số mới.
    expect(dauVet.kind).toBe('RULE');
    expect(dauVet.new_value).toBe('17.50');

    /*
     * Và KHÔNG lá thư nào đi ra (`0055`).
     *
     * Trước `0055` đây là chỗ ca kiểm thử đi tìm lá thư của đúng hồ sơ này giữa
     * một hộp thư dùng chung — đổi một quy định làm consumer quét TOÀN BỘ hồ sơ
     * đã đóng băng, nên nó sinh thư cho cả TDV của tệp test khác. Bỏ thư thì
     * phiền phức ấy biến mất, và khẳng định còn lại gọn hơn hẳn: hộp thư trống.
     */
    await outbox.pumpOnce();
    await new Promise((r) => setTimeout(r, 500));
    expect((await listMail()).length, 'vẫn còn gửi thư báo lệch danh mục').toBe(0);

    // Và hồ sơ đã ký KHÔNG bị ghi đè: ngưỡng của nó vẫn rỗng như lúc lập.
    const sau = await withAdminDb(async (cc) => {
      const q = await cc.query<{ threshold_snap: string | null }>(
        `SELECT threshold_snap::text FROM pol.policy_line WHERE policy_id = $1`,
        [hs.body.id],
      );
      return q.rows[0]!;
    });
    expect(sau.threshold_snap).toBeNull();
  });
});

// =============================================================================
// INT-06 — tắt notification rồi duyệt hồ sơ
// =============================================================================

describe('INT-06 notification chết trong lúc duyệt hồ sơ', () => {
  it('duyệt vẫn hoàn tất, thư được gửi bù khi service trở lại', async () => {
    // Ngắt tiêu thụ nhưng KHÔNG xoá queue: sự kiện phải nằm chờ chứ không mất.
    const consumer = ntf.get<{ bus: Bus }>(
      (await import('@csbh/notification/testing')).NotifyConsumer,
    );
    await ntf.close();
    await donHopThuVaCho();

    const d = await draft();
    await runToActive(d.id);
    await outbox.pumpOnce();

    // Không có consumer nào chạy — hộp thư trống.
    await new Promise((r) => setTimeout(r, 300));
    expect((await listMail()).length, 'consumer đã tắt mà thư vẫn đi').toBe(0);

    // Hồ sơ vẫn đi hết luồng: gửi thư không nằm trong transaction duyệt.
    const status = await withAdminDb(async (c) => {
      const q = await c.query<{ status: string }>(
        `SELECT status::text FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!.status;
    });
    expect(status).toBe('DANG_CO_HIEU_LUC');
    expect(consumer).toBeDefined();

    // Bật lại: năm thư tồn đọng được giao ngay (`0064` bỏ lá thứ sáu).
    ntf = await createNotificationApp();
    notify = ntf.get(NotifyService);
    expect((await waitMail(5)).length).toBe(5);
  }, 60_000);
});
