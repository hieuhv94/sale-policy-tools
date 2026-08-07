/**
 * Hạ tầng cho test HTTP: dựng app NestJS thật, gọi qua supertest, đọc hộp thư Mailpit.
 *
 * Không giả lập tầng nào — app nối vào đúng Postgres và Redis trong Docker, nên
 * test bắt được cả lỗi SQL và lỗi ràng buộc chứ không chỉ lỗi logic TypeScript.
 */
import { Client } from 'pg';
import request, { type Response } from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '@csbh/identity/testing';
import { admin } from '../db/helpers.js';

export { serviceToken, expiredAccessToken } from '@csbh/identity/testing';

/** Tiền tố cho mọi tài khoản do test tạo ra, để dọn sạch mà không đụng dữ liệu mẫu. */
export const TEST_PREFIX = 'zztest';

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
