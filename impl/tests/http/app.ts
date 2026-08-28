/**
 * Hạ tầng cho test HTTP: dựng app NestJS thật, gọi qua supertest, đọc hộp thư Mailpit.
 *
 * Không giả lập tầng nào — app nối vào đúng Postgres và Redis trong Docker, nên
 * test bắt được cả lỗi SQL và lỗi ràng buộc chứ không chỉ lỗi logic TypeScript.
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import request, { type Response } from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '@csbh/identity/testing';
import { admin } from '../db/helpers.js';

export { serviceToken, expiredAccessToken } from '@csbh/identity/testing';

/** Tiền tố cho mọi tài khoản do test tạo ra, để dọn sạch mà không đụng dữ liệu mẫu. */
export const TEST_PREFIX = 'zztest';

/**
 * Hậu tố ngẫu nhiên của LƯỢT CHẠY này.
 *
 * Bản cũ dùng `Date.now() % 100000`, tức là quay vòng sau đúng 100 giây. Mã sản
 * phẩm và mã khách hàng thì ở lại trong CSDL vĩnh viễn, nên hai lượt chạy cách
 * nhau bội số của 100 giây có thể sinh ra cùng một mã — và cú va chạm đó hiện ra
 * ở một chỗ chẳng liên quan: `productId: phải là chuỗi`, ba mươi dòng sau, vì
 * lời gọi tạo sản phẩm trả 409 mà không ai kiểm.
 */
const LAN_CHAY = randomBytes(4).toString('hex');
let demMa = 0;

/** Mã duy nhất xuyên suốt mọi lượt chạy. Dùng thay cho `uniq` cục bộ ở từng tệp. */
export const maDuyNhat = (tienTo: string, loai: string): string =>
  `${tienTo}-${loai}-${++demMa}-${LAN_CHAY}`;

export async function boot(): Promise<INestApplication> {
  return createTestApp();
}

/** supertest gọi thẳng vào HTTP server của Nest, không cần mở cổng ra ngoài. */
export const http = async (app: INestApplication): Promise<TestAgent> =>
  request(app.getHttpServer() as Parameters<typeof request>[0]);

export async function login(
  app: INestApplication,
  loginName: string,
  password: string,
): Promise<Response> {
  const agent = await http(app);
  return agent.post('/auth/login').send({ login: loginName, password });
}

export async function accessTokenFor(
  app: INestApplication,
  loginName: string,
  password: string,
): Promise<string> {
  const res = await login(app, loginName, password);
  if (res.status !== 200) {
    throw new Error(`đăng nhập ${loginName} hỏng: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

/** Xoá mọi tài khoản do test tạo ra. Các bảng con đều ON DELETE CASCADE. */
export async function cleanupTestUsers(): Promise<void> {
  const c = admin();
  await c.connect();
  try {
    await c.query(`DELETE FROM idn.app_user WHERE username LIKE $1`, [`${TEST_PREFIX}%`]);
  } finally {
    await c.end();
  }
}

/**
 * Một mẫu hồ sơ CÒN DÙNG ĐƯỢC, để các ca kiểm gửi duyệt được (`0098`).
 *
 * Từ `0098` mọi lượt `SUBMIT` và `RESUBMIT_AFTER_EDIT` phải kèm `mauHoSoId` —
 * hàm này thay chỗ cho ô chọn mà người dùng thật sẽ bấm.
 *
 * Đọc THẲNG CSDL chứ không qua `/policy-templates/available`: đường API cần một
 * token và một trong năm vai trò xem hồ sơ, mà phần lớn ca gọi hàm này chỉ cần
 * "một id hợp lệ bất kỳ".
 *
 * `0150` — TỰ DỰNG MỘT MẪU nếu chưa có cái nào.
 *
 * Trước đó mẫu luôn có sẵn vì `TemplateBootstrap` seed hai bản mặc định lúc
 * `document` khởi động. Khách hàng chốt bỏ hẳn khái niệm ấy: hệ thống không bao
 * giờ tự tạo một văn bản mẫu. Nên trên một CSDL test vừa migrate xong, bảng mẫu
 * RỖNG — và mọi ca gọi hàm này sẽ hỏng ở một chỗ chẳng nói gì về nguyên nhân.
 *
 * Dựng bằng `INSERT` thẳng chứ không qua API: hàm này chạy trong hàng chục tệp
 * kiểm, phần lớn không dựng `document` lên, và bắt chúng làm thế chỉ để có một
 * id hợp lệ là đổi một dòng lấy một vòng khởi động.
 *
 * Nhớ MỘT LẦN cho cả lượt chạy: nó không đổi giữa chừng, và mỗi ca một lượt kết
 * nối CSDL riêng là chỗ chậm không cần thiết trong một bộ test vốn đã chạy tuần
 * tự.
 */
let mauNho: string | undefined;
export async function mauHoSoMacDinh(): Promise<string> {
  if (mauNho) return mauNho;
  const id = await withAdminDb(async (c) => {
    const co = await c.query<{ id: string }>(
      `SELECT id FROM doc.contract_template
        WHERE kind = 'HO_SO' AND vo_hieu_hoa_luc IS NULL
        ORDER BY updated_at DESC, paper_size, id LIMIT 1`,
    );
    if (co.rows[0]) return co.rows[0].id;

    /*
     * Chưa có mẫu nào — dựng một mẫu DỰNG ĐƯỢC THẬT.
     *
     * "Một dòng giả trỏ vào một file không tồn tại" là điều hấp dẫn ở đây, và
     * nó sai: `phanCongMacDinh` dùng chính id này lúc gửi duyệt, và `0098` ĐÓNG
     * BĂNG nó vào hồ sơ. Từ đó mọi lượt xem bản mềm của hồ sơ ấy đi qua đúng mẫu
     * này — không có object trên kho thì cả loạt ca nhận `TEMPLATE_FILE_MISSING`
     * ở một chỗ chẳng nói gì về nguyên nhân.
     *
     * Nên: ghi object thật lên MinIO, rồi mới ghi hai dòng CSDL. `Storage` dựng
     * độc lập được — nó đọc cấu hình từ biến môi trường, không cần Nest.
     */
    const { makeDocx, para, Storage } = await import('@csbh/document/testing');
    const than = makeDocx(
      [
        para('CHÍNH SÁCH BÁN HÀNG'),
        para('Số {{ho_so.ma_ho_so}}'),
        para('Khách hàng: {{ho_so.ten_khach_hang}}'),
        para('{{bang_san_pham}}'),
      ].join(''),
    );
    const kho = new Storage();
    await kho.onModuleInit();
    const khoa = `mau_hd/bo-kiem-${Date.now()}.docx`;
    await kho.put(
      khoa,
      than,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    const f = await c.query<{ id: string }>(
      `INSERT INTO doc.stored_file
         (object_key, file_name, content_type, size_bytes, sha256,
          owner_kind, owner_id, purpose, uploaded_by)
       VALUES ($1, 'mau-bo-kiem.docx',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               $2, encode(sha256($3::bytea), 'hex'), 'TEMPLATE', NULL, 'MAU_HD',
               '00000000-0000-0000-0000-000000000000')
       RETURNING id`,
      [khoa, than.length, than],
    );
    const t = await c.query<{ id: string }>(
      `INSERT INTO doc.contract_template (name, file_id, updated_by, kind, paper_size)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'HO_SO', 'a4p')
       RETURNING id`,
      [`Mau ho so cho bo kiem ${Date.now()}`, f.rows[0]!.id],
    );
    for (const [o, n] of [
      ['{{ho_so.ma_ho_so}}', 'ho_so.ma_ho_so'],
      ['{{ho_so.ten_khach_hang}}', 'ho_so.ten_khach_hang'],
    ]) {
      await c.query(
        `INSERT INTO doc.contract_template_field (template_id, placeholder, source)
         VALUES ($1,$2,$3)`,
        [t.rows[0]!.id, o, n],
      );
    }
    return t.rows[0]!.id;
  });
  if (!id) throw new Error('không dựng được mẫu hồ sơ cho bộ kiểm');
  mauNho = id;
  return id;
}

export async function withAdminDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = admin();
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

// --- Mailpit -----------------------------------------------------------------
// Không cần hộp thư thật nào: Mailpit nhận hết SMTP trong mạng nội bộ và mở API
// HTTP để đọc lại. Tên miền .test cũng không phân giải ra Internet được.

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';

export async function mailpitClear(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}

type Summary = { ID: string; To: { Address: string }[]; Subject: string };

export async function mailpitFind(
  toAddress: string,
): Promise<{ subject: string; text: string } | undefined> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const list = (await res.json()) as { messages: Summary[] };
  const hit = list.messages.find((m) =>
    m.To.some((t) => t.Address.toLowerCase() === toAddress.toLowerCase()),
  );
  if (!hit) return undefined;
  const full = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`);
  const body = (await full.json()) as { Text: string; Subject: string };
  return { subject: body.Subject, text: body.Text };
}

export async function mailpitCountTo(toAddress: string): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const list = (await res.json()) as { messages: Summary[] };
  return list.messages.filter((m) =>
    m.To.some((t) => t.Address.toLowerCase() === toAddress.toLowerCase()),
  ).length;
}

/** Bóc token kích hoạt ra khỏi liên kết trong thư. */
export function activationTokenFrom(mailText: string): string {
  const m = /kich-hoat\?token=([^\s]+)/.exec(mailText);
  if (!m?.[1]) throw new Error('không tìm thấy liên kết kích hoạt trong thư');
  return decodeURIComponent(m[1]);
}

/** Bóc token đặt lại mật khẩu ra khỏi liên kết trong thư. */
export function resetTokenFrom(mailText: string): string {
  const m = /dat-lai-mat-khau\?token=([^\s]+)/.exec(mailText);
  if (!m?.[1]) throw new Error('không tìm thấy liên kết đặt lại mật khẩu trong thư');
  return decodeURIComponent(m[1]);
}

/** Thư MỚI NHẤT gửi tới địa chỉ này. `mailpitFind` trả thư đầu danh sách. */
export async function mailpitLatestTo(
  toAddress: string,
): Promise<{ subject: string; text: string } | undefined> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const list = (await res.json()) as { messages: Summary[] };
  // Mailpit trả mới nhất trước; lấy cái đầu tiên khớp địa chỉ.
  const hit = list.messages.find((m) =>
    m.To.some((t) => t.Address.toLowerCase() === toAddress.toLowerCase()),
  );
  if (!hit) return undefined;
  const full = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`);
  const body = (await full.json()) as { Text: string; Subject: string };
  return { subject: body.Subject, text: body.Text };
}

// --- Dựng nhiều service nói chuyện với nhau ----------------------------------

/**
 * Dựng identity và cho nó NGHE THẬT trên một cổng ngẫu nhiên, rồi trỏ biến môi
 * trường `IDENTITY_URL` vào đó.
 *
 * Service khác hỏi trạng thái tài khoản bằng HTTP thật chứ không phải bằng bản
 * giả, nên đường token dịch vụ giữa hai service được chạy qua trong mọi test —
 * đúng thứ AUTH-21 nói tới.
 */
export async function bootIdentityListening(): Promise<{
  app: INestApplication;
  url: string;
  restore: () => void;
}> {
  const app = await boot();
  await app.listen(0, '127.0.0.1');
  const addr = (app.getHttpServer() as { address(): { port: number } }).address();
  const url = `http://127.0.0.1:${addr.port}`;
  const previous = process.env.IDENTITY_URL;
  process.env.IDENTITY_URL = url;
  return {
    app,
    url,
    restore: () => {
      if (previous === undefined) delete process.env.IDENTITY_URL;
      else process.env.IDENTITY_URL = previous;
    },
  };
}

/** Xoá cache trạng thái tài khoản để service khác phải hỏi lại identity. */
export async function clearAccountCache(): Promise<void> {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');
  const keys = await r.keys('idn:acct:*');
  if (keys.length > 0) await r.del(...keys);
  await r.quit();
}

/** Dựng catalog nghe thật và trỏ `CATALOG_URL` vào đó — customer gọi nó bằng HTTP. */
export async function bootCatalogListening(): Promise<{
  app: INestApplication;
  restore: () => void;
}> {
  const { createTestApp } = await import('@csbh/catalog/testing');
  const app = await createTestApp();
  await app.listen(0, '127.0.0.1');
  const addr = (app.getHttpServer() as { address(): { port: number } }).address();
  const previous = process.env.CATALOG_URL;
  process.env.CATALOG_URL = `http://127.0.0.1:${addr.port}`;
  return {
    app,
    restore: () => {
      if (previous === undefined) delete process.env.CATALOG_URL;
      else process.env.CATALOG_URL = previous;
    },
  };
}

/** Xoá cache phạm vi dữ liệu — dùng sau khi đổi cây tổ chức trong test. */
export async function clearScopeCache(): Promise<void> {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');
  const keys = await r.keys('idn:scope:*');
  if (keys.length > 0) await r.del(...keys);
  await r.quit();
}

/** Dựng customer nghe thật và trỏ `CUSTOMER_URL` vào đó. */
export async function bootCustomerListening(): Promise<{
  app: INestApplication;
  restore: () => void;
}> {
  const { createTestApp } = await import('@csbh/customer/testing');
  const app = await createTestApp();
  await app.listen(0, '127.0.0.1');
  const addr = (app.getHttpServer() as { address(): { port: number } }).address();
  const previous = process.env.CUSTOMER_URL;
  process.env.CUSTOMER_URL = `http://127.0.0.1:${addr.port}`;
  return {
    app,
    restore: () => {
      if (previous === undefined) delete process.env.CUSTOMER_URL;
      else process.env.CUSTOMER_URL = previous;
    },
  };
}

/**
 * Dựng document nghe thật và trỏ `DOCUMENT_URL` vào đó (`0148`).
 *
 * Chiều gọi NGƯỢC với `bootPolicyListening`: từ `0148`, `policy` hỏi `document`
 * nhân bản giấy tờ khi lập phiên bản CSBH mới. Chỉ tệp kiểm nào dựng một bản cũ
 * CÓ giấy tờ mới cần hàm này — `create()` không gọi ra ngoài khi bản cũ không
 * đính tờ nào, và đó là lý do 78 tệp kiểm còn lại không phải đổi gì.
 */
export async function bootDocumentListening(): Promise<{
  app: INestApplication;
  restore: () => void;
}> {
  const { createTestApp } = await import('@csbh/document/testing');
  const app = await createTestApp();
  await app.listen(0, '127.0.0.1');
  const addr = (app.getHttpServer() as { address(): { port: number } }).address();
  const previous = process.env.DOCUMENT_URL;
  process.env.DOCUMENT_URL = `http://127.0.0.1:${addr.port}`;
  return {
    app,
    restore: () => {
      if (previous === undefined) delete process.env.DOCUMENT_URL;
      else process.env.DOCUMENT_URL = previous;
    },
  };
}

/** Xoá bộ lọc đã lưu trong phiên — dùng giữa các test của reporting (RPT-04). */
export async function clearSavedFilters(): Promise<void> {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');
  const keys = await r.keys('rpt:filter:*');
  if (keys.length > 0) await r.del(...keys);
  await r.quit();
}

/** Dựng policy nghe thật và trỏ `POLICY_URL` vào đó — document gọi nó bằng HTTP. */
export async function bootPolicyListening(): Promise<{
  app: INestApplication;
  restore: () => void;
}> {
  const { createTestApp } = await import('@csbh/policy/testing');
  const app = await createTestApp();
  await app.listen(0, '127.0.0.1');
  const addr = (app.getHttpServer() as { address(): { port: number } }).address();
  const previous = process.env.POLICY_URL;
  process.env.POLICY_URL = `http://127.0.0.1:${addr.port}`;
  return {
    app,
    restore: () => {
      if (previous === undefined) delete process.env.POLICY_URL;
      else process.env.POLICY_URL = previous;
    },
  };
}


// --- Phân công người xử lý (`0031`) -----------------------------------------

let _idNguoiDung: Record<string, string> | null = null;

/** Id của mười tài khoản mẫu, tra MỘT lần cho cả lượt chạy. */
export async function idNguoiDung(): Promise<Record<string, string>> {
  if (_idNguoiDung) return _idNguoiDung;
  _idNguoiDung = await withAdminDb(async (c) => {
    const r = await c.query<{ username: string; id: string }>(
      `SELECT username, id FROM idn.app_user`,
    );
    return Object.fromEntries(r.rows.map((x) => [x.username, x.id]));
  });
  return _idNguoiDung;
}

/**
 * Người mặc định cho ba bước bắt buộc chọn (`0031`).
 *
 * Từ khi bỏ cây tổ chức, `SUBMIT` không tự tìm được Trưởng bộ phận nữa — nó đòi
 * `tbpUserId` và `keToanUserId`, và `KT_RECEIVE_L1` đòi `saleAdminUserId`. Gần
 * một trăm chỗ trong bộ test gọi `act(id, 'SUBMIT', 'tdv01')` và không chỗ nào
 * quan tâm ai duyệt.
 *
 * Nên: mặc định `tbp01`/`kt01`/`sa01` — đúng những người mà cây tổ chức cũ vẫn
 * chọn cho `tdv01`, nên hành vi của các ca cũ không đổi. Ca nào QUAN TÂM tới
 * người cụ thể thì truyền thẳng trong `body`, và nó ghi đè (xem `act` từng tệp).
 *
 * `0098` thêm `mauHoSoId` vào đúng hai bước gửi duyệt, cùng một lẽ: gần một trăm
 * chỗ gọi `act(id, 'SUBMIT', 'tdv01')` và không chỗ nào quan tâm bản mềm dựng
 * bằng mẫu nào. Ca nào quan tâm — chính những ca của `0098` — thì truyền thẳng
 * trong `body` và nó ghi đè.
 */
export async function phanCongMacDinh(action: string): Promise<Record<string, string>> {
  const id = await idNguoiDung();
  if (action === 'SUBMIT' || action === 'RESUBMIT_AFTER_EDIT') {
    return {
      tbpUserId: id['tbp01']!,
      keToanUserId: id['kt01']!,
      mauHoSoId: await mauHoSoMacDinh(),
    };
  }
  if (action === 'KT_RECEIVE_L1') return { saleAdminUserId: id['sa01']! };
  return {};
}
