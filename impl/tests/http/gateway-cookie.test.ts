/**
 * `0242` — gateway chuyển MỌI `Set-Cookie` của service phía sau, không chỉ cái cuối.
 *
 * Lộ ra trên chồng production chạy thử chứ không ở bộ kiểm: lượt `start` của đăng
 * nhập Google ở cửa sổ bật lên đặt HAI cookie (state + mã cửa sổ), identity gửi
 * đủ hai, trình duyệt nhận MỘT. Mọi ca kiểm Google gọi thẳng identity, nên chặng
 * gateway nằm ngoài tầm của chúng — ca này dựng một máy phía sau giả, trả đúng
 * hai cookie, ngay sau một gateway THẬT.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp as createGatewayApp } from '@csbh/gateway/testing';

let may: Server;
let gateway: INestApplication;
let cu: string | undefined;

beforeAll(async () => {
  may = createServer((_req, res) => {
    res.setHeader('set-cookie', [
      'csbh_g_cua_so=abc12345; Max-Age=600; Path=/api/auth/google; Expires=Wed, 04 Nov 2026 17:55:06 GMT; HttpOnly; SameSite=Lax',
      'csbh_g_state=xyz98765; Max-Age=600; Path=/api/auth/google; HttpOnly; SameSite=Lax',
    ]);
    res.writeHead(302, { location: 'https://accounts.google.test/' });
    res.end();
  });
  await new Promise<void>((r) => may.listen(0, '127.0.0.1', r));
  cu = process.env.IDENTITY_URL;
  process.env.IDENTITY_URL = `http://127.0.0.1:${(may.address() as AddressInfo).port}`;
  gateway = await createGatewayApp();
});

afterAll(async () => {
  await gateway?.close();
  await new Promise<void>((r) => may.close(() => r()));
  if (cu === undefined) delete process.env.IDENTITY_URL;
  else process.env.IDENTITY_URL = cu;
});

describe('`0242` gateway giữ đủ Set-Cookie', () => {
  it('hai cookie vào thì HAI cookie ra, nguyên vẹn từng cái (kể cả dấu phẩy trong Expires)', async () => {
    const r = await request(gateway.getHttpServer() as Parameters<typeof request>[0]).get('/auth/google/start');
    expect(r.status).toBe(302);
    const ck = ([] as string[]).concat(r.headers['set-cookie'] ?? []);
    expect(ck).toHaveLength(2);
    expect(ck[0]).toBe(
      'csbh_g_cua_so=abc12345; Max-Age=600; Path=/api/auth/google; Expires=Wed, 04 Nov 2026 17:55:06 GMT; HttpOnly; SameSite=Lax',
    );
    expect(ck[1]).toMatch(/^csbh_g_state=xyz98765;/);
  });
});
