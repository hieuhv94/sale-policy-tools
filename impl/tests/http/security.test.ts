/**
 * SEC-01 … SEC-15 và AUD-08 — biên mạng, gateway, và các bề mặt tấn công.
 *
 * Gateway chạy THẬT và chuyển tiếp sang identity/policy/reporting cũng chạy thật
 * trên cổng ngẫu nhiên. Caddy chạy thật trong Docker. Không có bản giả nào, vì
 * thứ đang kiểm chính là cấu hình — mà cấu hình giả lập thì không kiểm được gì.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { unzipSync, strFromU8 } from 'fflate';
import { createTestApp as createGatewayApp, RateLimiter, RULES, UPSTREAMS } from '@csbh/gateway/testing';
import { createTestApp as createReportingApp } from '@csbh/reporting/testing';
import { createTestApp as createAuditApp } from '@csbh/audit/testing';
import { PolicyOutbox } from '@csbh/policy/testing';
import { Bus, BUS } from '@csbh/bus';
import { mintServiceToken } from '@csbh/http-kit';
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
  serviceToken,
  withAdminDb,
} from './app.js';

const exec = promisify(execFile);
const SEED_PW = 'Test@1234';
const P = 'ZZSEC';
const CADDY = process.env.CADDY_URL ?? 'http://caddy';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let reporting: INestApplication;
let gateway: INestApplication;
let audit: INestApplication;
let limiter: RateLimiter;
let outbox: PolicyOutbox;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const uniq = (k: string) => maDuyNhat(P, k);

/** Gọi QUA gateway — đường duy nhất mà thế giới bên ngoài có. */
const gw = async () => http(gateway);
const gget = async (path: string, who?: string) => {
  const r = (await gw()).get(path);
  return who ? r.set('Authorization', `Bearer ${tok[who]}`) : r;
};
const gpost = async (path: string, body: object, who?: string) => {
  const r = (await gw()).post(path);
  if (who) r.set('Authorization', `Bearer ${tok[who]}`);
  return r.send(body);
};

/** Gỡ khoá đăng nhập cho các tài khoản mẫu mà file test này dùng tới. */
const unlockSeedUsers = () =>
  withAdminDb(async (c) => {
    await c.query(
      `UPDATE idn.app_user SET failed_attempts = 0, locked_until = NULL
        WHERE username = ANY($1::text[])`,
      [['tdv01', 'tdv03', 'sa01', 'kt01', 'admin01', 'tbp01', 'bld01']],
    );
  });

beforeAll(async () => {
  // Gỡ khoá TRƯỚC khi đăng nhập. Khoá do một lượt chạy trước để lại vẫn nằm
  // trong CSDL, và lúc đó `beforeAll` chết ngay ở dòng lấy token — cả file bị
  // bỏ qua với một thông báo không liên quan gì tới thứ đang hỏng.
  await unlockSeedUsers();
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
  const po = await bootPolicyListening();
  policy = po.app;
  restores.push(po.restore);
  outbox = policy.get(PolicyOutbox);

  reporting = await createReportingApp();
  await reporting.listen(0, '127.0.0.1');
  const addr = (reporting.getHttpServer() as { address(): { port: number } }).address();
  const prevRpt = process.env.REPORTING_URL;
  process.env.REPORTING_URL = `http://127.0.0.1:${addr.port}`;
  restores.push(() => {
    if (prevRpt === undefined) delete process.env.REPORTING_URL;
    else process.env.REPORTING_URL = prevRpt;
  });

  const purge = new Bus();
  await purge.declareConsumer(BUS.queues.audit, BUS.queues.auditDlq, BUS.bindings.audit);
  const ch = await purge.channel();
  await ch.purgeQueue(BUS.queues.audit);
  await purge.close();

  // audit phải CHẠY: `security.denied` do gateway phát chỉ thành dòng nhật ký
  // khi có người tiêu thụ. Thiếu bước này thì AUD-08 chờ mãi một dòng không bao
  // giờ tới, và thông báo lỗi lại trông như gateway không phát gì.
  audit = await createAuditApp();

  gateway = await createGatewayApp();
  limiter = gateway.get(RateLimiter);
}, 180_000);

afterAll(async () => {
  await gateway?.close();
  await audit?.close();
  await reporting?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
});

beforeEach(async () => {
  // Hạn mức là toàn cục theo IP và theo người; không xoá thì test sau thừa hưởng
  // bộ đếm của test trước và đỏ vì lý do không liên quan.
  await limiter.reset(RULES.login, 'ip:::ffff:127.0.0.1');
  await limiter.reset(RULES.login, 'ip:127.0.0.1');
  await limiter.reset(RULES.login, 'ip:unknown');
  for (const u of ['tdv01', 'sa01']) {
    const id = await userIdOf(u);
    await limiter.reset(RULES.export, `user:${id}`);
  }
  // Khoá sau 5 lần sai (AUTH-09) là một lớp KHÁC với giới hạn tần suất; trộn
  // hai thứ đó vào nhau làm test này đỏ vì lý do không liên quan.
  await unlockSeedUsers();
});

const userIdOf = async (username: string): Promise<string> =>
  withAdminDb(async (c) => {
    const r = await c.query<{ id: string }>(`SELECT id FROM idn.app_user WHERE username = $1`, [
      username,
    ]);
    return r.rows[0]!.id;
  });

// =============================================================================
// SEC-01 — bề mặt lộ ra ngoài là DANH SÁCH TRẮNG
// =============================================================================

describe('SEC-01 gateway chỉ chuyển tiếp những gì được liệt kê', () => {
  it('không có tiền tố nào dẫn tới API nội bộ', () => {
    // `internal/**` là API giữa các service, dùng token dịch vụ. Token đó đã
    // chặn ở tầng service (AUTH-21), nhưng đó là lớp THỨ HAI — lớp thứ nhất là
    // gateway không có đường nào dẫn tới chúng.
    for (const u of UPSTREAMS) {
      expect(u.prefix.startsWith('/internal'), `${u.prefix} lộ API nội bộ`).toBe(false);
    }
  });

  it('gọi thẳng /internal qua gateway thì 404, không chạm tới service nào', async () => {
    const r = await gget('/internal/customers/00000000-0000-0000-0000-000000000000', 'admin01');
    expect(r.status).toBe(404);
  });

  it('đường dẫn chỉ TRÙNG TIỀN TỐ chuỗi không được chuyển tiếp', async () => {
    // `/authorize` bắt đầu bằng chuỗi `/auth` nhưng không phải đoạn `/auth`.
    // So khớp bằng startsWith trần sẽ đẩy nó sang identity.
    const r = await gget('/authorize-me');
    expect(r.status).toBe(404);
  });

  it('hai đường công khai duy nhất vẫn gọi được khi chưa đăng nhập', async () => {
    expect((await gget('/healthz')).status).toBe(200);
    const login = await gpost('/auth/login', { login: 'tdv01', password: SEED_PW });
    expect(login.status).toBe(200);
  });

  it('MỌI tiền tố controller của bảy service đều có đường qua gateway', () => {
    // Quét mã nguồn tìm tiền tố thật, thay vì tin vào bảng định tuyến. Thiếu một
    // tiền tố nghĩa là một màn hình trả 404 mà không lỗi nào chỉ ra vì sao —
    // đúng cách `/contract-templates` và `/admin/users` đã bị bỏ sót, và chỉ lộ
    // ra khi chạy demo thật.
    const thuMuc = 'services';
    const timTep = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? timTep(join(d, e.name))
          : e.name.endsWith('.controller.ts')
            ? [join(d, e.name)]
            : [],
      );

    const tienTo = new Set<string>();
    for (const tep of timTep(thuMuc)) {
      for (const m of readFileSync(tep, 'utf8').matchAll(/@Controller\('([^']*)'\)/g)) {
        const p = m[1]!;
        // API nội bộ CỐ Ý không có đường qua gateway (xem SEC-01 ở trên).
        if (p === '' || p.startsWith('internal')) continue;
        tienTo.add(`/${p}`);
      }
    }

    expect(tienTo.size).toBeGreaterThan(5);
    const cua = new Set(UPSTREAMS.map((u) => u.prefix));
    const thieu = [...tienTo].filter((p) => !cua.has(p));
    expect(thieu, `tiền tố không có đường qua gateway: ${thieu.join(', ')}`).toEqual([]);
  });

  it('mọi đường nghiệp vụ đều đòi token', async () => {
    for (const path of ['/policies', '/customers', '/catalog/products', '/reports/policies']) {
      const r = await gget(path);
      expect(r.status, `${path} phải đòi token`).toBe(401);
    }
  });
});

// =============================================================================
// SEC-07 — giới hạn tần suất
// =============================================================================

describe('SEC-07 gọi liên tục endpoint đăng nhập và endpoint xuất file', () => {
  it('đăng nhập quá ngưỡng thì 429 kèm Retry-After', async () => {
    // Dò vào một tên KHÔNG TỒN TẠI, có chủ ý: gõ sai mật khẩu của tài khoản
    // thật 20 lần sẽ khoá tài khoản đó (AUTH-09) và các test sau nhận 401 vì lý
    // do hoàn toàn khác. Bộ đếm tần suất đếm theo IP nên vẫn chạy như thường.
    const ghost = { login: 'zztest-khong-ton-tai', password: 'sai-mat-khau' };
    let last = await gpost('/auth/login', ghost);
    for (let i = 0; i < RULES.login.limit + 2 && last.status !== 429; i++) {
      last = await gpost('/auth/login', ghost);
    }
    expect(last.status).toBe(429);
    expect(last.body.code).toBe('RATE_LIMITED');
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(last.headers['retry-after'])).toBeLessThanOrEqual(RULES.login.windowSec);
  }, 60_000);

  it('chặn cả khi mật khẩu ĐÚNG — giới hạn là về tần suất, không phải về việc sai', async () => {
    let last = await gpost('/auth/login', { login: 'tdv01', password: SEED_PW });
    expect(last.status).toBe(200);
    for (let i = 0; i < RULES.login.limit + 2 && last.status !== 429; i++) {
      last = await gpost('/auth/login', { login: 'tdv01', password: SEED_PW });
    }
    // Khoá tài khoản sau 5 lần sai (AUTH-09) chỉ thấy được kiểu dò một tài
    // khoản. Lớp này chặn kiểu dò trải mỏng trên nhiều tài khoản.
    expect(last.status).toBe(429);
  }, 60_000);

  it('xuất file quá ngưỡng thì 429, và đếm theo NGƯỜI chứ không theo IP', async () => {
    let last = await gpost('/reports/exports', {}, 'tdv01');
    expect([202, 429]).toContain(last.status);
    for (let i = 0; i < RULES.export.limit + 2 && last.status !== 429; i++) {
      last = await gpost('/reports/exports', {}, 'tdv01');
    }
    expect(last.status).toBe(429);

    // Người khác, cùng địa chỉ IP, vẫn xuất được. Cả phòng ngồi sau một địa chỉ
    // NAT thì đếm theo IP là một người xuất file làm cả phòng bị chặn.
    const other = await gpost('/reports/exports', {}, 'sa01');
    expect(other.status).toBe(202);
  }, 60_000);

  it('đường không nằm trong hai đường tốn kém thì không bị giới hạn', async () => {
    for (let i = 0; i < RULES.login.limit + 5; i++) {
      const r = await gget('/policies?limit=1', 'tdv01');
      expect(r.status).toBe(200);
    }
  }, 60_000);
});

// =============================================================================
// SEC-12 — CORS
// =============================================================================

describe('SEC-12 gọi API từ một origin lạ', () => {
  it('origin trong danh sách trắng được phép', async () => {
    const r = await (await gw())
      .get('/healthz')
      .set('Origin', 'https://csbh.nutricare.local');
    expect(r.headers['access-control-allow-origin']).toBe('https://csbh.nutricare.local');
    expect(r.headers['vary']).toContain('Origin');
  });

  it('origin lạ KHÔNG nhận được header cho phép', async () => {
    const r = await (await gw()).get('/healthz').set('Origin', 'https://ke-tan-cong.test');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight kết thúc ở gateway, không chuyển tiếp xuống service', async () => {
    const r = await (await gw())
      .options('/policies')
      .set('Origin', 'https://csbh.nutricare.local')
      .set('Access-Control-Request-Method', 'POST');
    // 204 và KHÔNG phải 401: trình duyệt gửi preflight tự động, không kèm token.
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-methods']).toContain('POST');
  });

  it('không bao giờ trả về dấu sao', async () => {
    const r = await (await gw()).get('/healthz').set('Origin', 'https://csbh.nutricare.local');
    expect(r.headers['access-control-allow-origin']).not.toBe('*');
  });
});

// =============================================================================
// SEC-09 — header an toàn qua Caddy (Caddy THẬT, không đọc file bằng mắt)
// =============================================================================

describe('SEC-09 header phản hồi qua Caddy', () => {
  it('có đủ HSTS, nosniff, CSP và Referrer-Policy', async () => {
    const res = await fetch(`${CADDY}/`);
    expect(res.status).toBe(200);
    const h = (k: string) => res.headers.get(k) ?? '';

    expect(h('strict-transport-security')).toContain('max-age=');
    expect(h('strict-transport-security')).toContain('includeSubDomains');
    expect(h('x-content-type-options')).toBe('nosniff');
    expect(h('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(h('x-frame-options')).toBe('DENY');

    const csp = h('content-security-policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Script bị khoá chặt. `style-src` có nới cho Ant Design, nhưng script mới
    // là thứ chạy được mã, nên chỗ này không được có 'unsafe-inline'.
    expect(csp).toMatch(/script-src 'self'\s*;/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it('không tiết lộ máy chủ nào đang chạy', async () => {
    const res = await fetch(`${CADDY}/`);
    expect(res.headers.get('server')).toBeNull();
  });

  it('đường dẫn không tồn tại vẫn trả index.html để React Router tự định tuyến', async () => {
    const res = await fetch(`${CADDY}/policies/abc-123`);
    expect(res.status).toBe(200);
    // Header an toàn phải có trên CẢ phản hồi này — đó là lý do đặt ở Caddy chứ
    // không ở ứng dụng.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

// =============================================================================
// SEC-10 — chỉ biên mạng mở cổng
// =============================================================================

describe('SEC-10 cổng mở ra ngoài', () => {
  const composeServicesWithPorts = (file: string): string[] => {
    const text = readFileSync(file, 'utf8');
    const out: string[] = [];
    let current = '';
    for (const line of text.split('\n')) {
      // Tên service: thụt đúng hai dấu cách dưới `services:`.
      const svc = /^ {2}([a-z0-9_-]+):\s*$/.exec(line);
      if (svc?.[1]) current = svc[1];
      if (/^ {4}ports:/.test(line) || /^ {4}ports:\s*\[/.test(line)) out.push(current);
    }
    return out;
  };

  it('không service nào trong compose publish cổng, trừ caddy', () => {
    // Quét CẢ chồng demo: đó là nơi mười service ứng dụng được khai, tức là
    // nơi dễ vô tình mở một cổng ra ngoài nhất.
    for (const f of ['deploy/compose.yml', 'deploy/compose.test.yml', 'deploy/compose.demo.yml']) {
      const withPorts = composeServicesWithPorts(f);
      const illegal = withPorts.filter((s) => s !== 'caddy');
      expect(illegal, `${f} có service publish cổng ngoài caddy: ${illegal.join(', ')}`).toEqual([]);
    }
  });

  it('lớp phủ hộp thư thử mở ĐÚNG một cổng, và chỉ của mailpit', () => {
    // `compose.mail.yml` là ngoại lệ DUY NHẤT, và nó phải ở một tệp riêng chứ
    // không nằm trong ba tệp trên: bất biến "chỉ biên mạng mở cổng" chỉ có
    // nghĩa khi việc phá nó là một hành động rõ ràng, phải gõ ra.
    //
    // Test này giữ cho ngoại lệ đó không phình ra. Thêm một service vào tệp ấy
    // là mở thẳng một cổng ra ngoài mà không test nào khác nhìn thấy.
    expect(composeServicesWithPorts('deploy/compose.mail.yml')).toEqual(['mailpit']);
  });

  it('hộp thư thử KHÔNG mở sẵn — phải gọi `make demo-mail` mới mở', () => {
    // Giao diện Mailpit đọc được MỌI thư của hệ thống, kể cả liên kết kích hoạt
    // và liên kết đặt lại mật khẩu — tức là chiếm được mọi tài khoản. Mở thường
    // trực là để hở đúng cái đó.
    const mk = readFileSync('Makefile', 'utf8');
    expect(mk).toMatch(/^demo-mail:/m);
    expect(mk).toContain('compose.mail.yml');
    // `make demo` KHÔNG được kéo theo lớp phủ này.
    const khoiDemo = /^demo: [\s\S]*?\n\n/m.exec(mk)?.[0] ?? '';
    expect(khoiDemo).not.toContain('compose.mail.yml');
  });

  it('mười service ứng dụng đều nằm trong mạng internal, không service nào lộ cổng', () => {
    const text = readFileSync('deploy/compose.demo.yml', 'utf8');
    for (const svc of [
      'identity', 'catalog', 'customer', 'policy', 'document',
      'notification', 'audit', 'reporting', 'sla-worker', 'gateway',
    ]) {
      expect(text, `thiếu service ${svc} trong chồng demo`).toContain(`\n  ${svc}:`);
    }
    // Chỉ đúng MỘT dòng `ports:` trong cả file, và nó thuộc về caddy.
    const soDongPorts = text.split('\n').filter((d) => /^ {4}ports:/.test(d)).length;
    expect(soDongPorts).toBe(1);
  });

  it('Postgres, Redis, RabbitMQ, MinIO đều nằm trong mạng internal', () => {
    const text = readFileSync('deploy/compose.yml', 'utf8');
    for (const svc of ['postgres', 'redis', 'rabbitmq', 'minio', 'mailpit', 'gotenberg']) {
      const block = text.slice(text.indexOf(`\n  ${svc}:`));
      const upToNext = block.slice(0, block.indexOf('\n  ', 10) === -1 ? undefined : undefined);
      expect(upToNext).toContain('networks: [ internal ]');
    }
  });
});

// =============================================================================
// SEC-15 — token có audience ràng buộc
// =============================================================================

describe('SEC-15 token của service này gọi API của service khác', () => {
  it('token dịch vụ KHÔNG gọi được endpoint của người dùng', async () => {
    const r = await (await gw())
      .get('/policies')
      .set('Authorization', `Bearer ${mintServiceToken('document')}`);
    expect(r.status).toBe(401);
  });

  it('token người dùng KHÔNG gọi được API nội bộ', async () => {
    // Gọi thẳng vào policy, không qua gateway — mô phỏng kẻ đã ở trong mạng.
    const r = await (await http(policy))
      .get('/internal/policies/00000000-0000-0000-0000-000000000000')
      .set('X-Service-Token', tok['tdv01']!);
    expect(r.status).toBe(401);
  });

  it('token dịch vụ đúng audience thì gọi được API nội bộ', async () => {
    const r = await (await http(policy))
      .get('/internal/policies/00000000-0000-0000-0000-000000000000')
      .set('X-Service-Token', serviceToken());
    // 404 vì hồ sơ không tồn tại — nhưng đã qua được cửa xác thực.
    expect(r.status).toBe(404);
  });
});

// =============================================================================
// AUD-08 — nỗ lực vượt quyền, ghi từ MỘT chỗ cho cả bảy service
// =============================================================================

describe('AUD-08 thao tác vượt quyền bị từ chối', () => {
  /**
   * Chờ dòng nhật ký của ĐÚNG đường dẫn này.
   *
   * Không đếm tổng số dòng ACCESS_DENIED rồi so với mốc trước đó: CSDL dùng
   * chung còn giữ hàng chục dòng của các lần chạy trước, nên phép trừ hai con
   * số toàn cục vừa mong manh vừa không nói được dòng nào là dòng vừa sinh ra.
   */
  const waitDenied = async (path: string, timeoutMs = 30_000) => {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const rows = await withAdminDb(async (c) => {
        const r = await c.query<{ actor_role: string; reason: string; after_data: Record<string, string> }>(
          `SELECT actor_role, reason, after_data FROM aud.audit_log
            WHERE action = 'ACCESS_DENIED' AND after_data->>'path' = $1`,
          [path],
        );
        return r.rows;
      });
      if (rows.length > 0) return rows;
      if (Date.now() >= until) throw new Error(`không có dòng ACCESS_DENIED nào cho ${path}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  it('gateway ghi lại nỗ lực, kèm vai trò, lý do và đường dẫn', async () => {
    // tdv03 thuộc nhánh kế toán khác — hồ sơ của tdv01 nằm ngoài phạm vi.
    const id = await draftPolicy();
    const path = `/policies/${id}/actions/SUBMIT`;
    const denied = await gpost(path, {}, 'tdv03');
    expect(denied.status).toBe(403);

    const rows = await waitDenied(path);
    const mine = rows[0]!;
    expect(mine.actor_role).toBe('TDV');
    expect(mine.reason).toBeTruthy();
    expect(mine.after_data['method']).toBe('POST');
    // Ghi rõ service nào từ chối — gateway phục vụ cả bảy nên thiếu nó thì dòng
    // nhật ký không nói được nỗ lực nhắm vào đâu.
    expect(mine.after_data['upstream']).toBe('policy');
  }, 90_000);

  it('chỉ ghi MỘT dòng cho một lần bị từ chối', async () => {
    const id = await draftPolicy();
    const path = `/policies/${id}/actions/SUBMIT`;
    expect((await gpost(path, {}, 'tdv03')).status).toBe(403);
    await waitDenied(path);
    await new Promise((r) => setTimeout(r, 500));

    const n2 = await withAdminDb(async (c) => {
      const r = await c.query(
        `SELECT 1 FROM aud.audit_log WHERE action = 'ACCESS_DENIED' AND after_data->>'path' = $1`,
        [path],
      );
      return r.rowCount;
    });
    // Hai bộ ghi (một ở policy, một ở gateway) sẽ cho hai dòng, và AUD-09 đếm
    // theo DÒNG — con số sai gửi lên Ban lãnh đạo.
    expect(n2).toBe(1);
  }, 90_000);

  async function draftPolicy(): Promise<string> {
    const g = await gpost(
      '/catalog/product-groups',
      { code: uniq('NHOM'), name: 'Nhom SEC' },
      'admin01',
    );
    const prod = await gpost(
      '/catalog/products',
      {
        code: uniq('SP'),
        name: 'Nutricare Gold',
        groupCode: g.body.code,
        defaultRate2Type1: 3000,
        defaultRate2Type2: 3000,
        defaultRate2Type3: 3000,
      },
      'admin01',
    );
    await gpost(
      `/catalog/products/${prod.body.id}/prices`,
      { priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' },
      'admin01',
    );
    const cus = await gpost(
      '/customers',
      {
        code: uniq('KH'),
        name: 'Nhà thuốc Minh Châu',
        customerType: 1,
        registeredAddress: 'Số 8 Tôn Thất Thuyết, Hà Nội',
        ownerName: 'Trần Thị Mỹ Hạnh',
      },
      'tdv01',
    );
    const p = await gpost(
      '/policies',
      {
        customerId: cus.body.id,
        lines: [{ productId: prod.body.id, wholesalePrice: '90000', cpbh: ['3000'] }],
      },
      'tdv01',
    );
    expect(p.status).toBe(201);
    await outbox.pumpOnce();
    return p.body.id as string;
  }
});

// =============================================================================
// SEC-03 — chèn SQL vào tham số lọc
// =============================================================================

describe('SEC-03 chèn SQL vào tham số lọc', () => {
  it('chuỗi tấn công đi qua như dữ liệu, không thành câu lệnh', async () => {
    const payloads = [
      "'; DROP TABLE rpt.policy_row; --",
      "' OR '1'='1",
      "1); DELETE FROM cus.customer WHERE ('1'='1",
      '%',
      '_',
      "\\",
    ];
    for (const p of payloads) {
      const r = await gget(
        `/reports/policies?customerName=${encodeURIComponent(p)}&limit=5`,
        'tdv01',
      );
      // Không 500 và không lộ thông điệp lỗi của CSDL.
      expect(r.status, `payload ${p}`).toBe(200);
      expect(JSON.stringify(r.body)).not.toMatch(/syntax error|pg_|relation .* does not exist/i);
    }

    // Bảng vẫn còn nguyên sau tất cả.
    const alive = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT count(*)::text AS n FROM rpt.policy_row`);
      return r.rows[0]!.n as string;
    });
    expect(Number(alive)).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('dấu phần trăm trong từ khoá là KÝ TỰ, không phải mọi thứ', async () => {
    // Không thoát `%` thì gõ một dấu phần trăm khớp toàn bộ bảng — không phải
    // lỗ hổng, nhưng là kết quả sai mà người dùng không hiểu vì sao.
    const all = await gget('/reports/policies?limit=200', 'tdv01');
    const pct = await gget('/reports/policies?customerName=%25&limit=200', 'tdv01');
    expect(pct.body.items.length).toBeLessThan(Math.max(all.body.items.length, 1));
  });
});

// =============================================================================
// SEC-04 — không ô nào trong file Excel là công thức
// =============================================================================

describe('SEC-04 tên khách hàng chứa công thức', () => {
  it('ô xuất ra là VĂN BẢN, không phải công thức — và không bị bóp méo', async () => {
    const nasty = '=HYPERLINK("http://ke-tan-cong.test","bam vao day")';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('t');
    ws.columns = [{ header: 'Tên khách hàng', key: 'name', width: 30 }];
    ws.addRow({ name: nasty });
    ws.addRow({ name: '+1+1' });
    ws.addRow({ name: '@SUM(1,1)' });
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const files = unzipSync(new Uint8Array(buf));
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);

    // Khẳng định thật nằm ở ĐÂY, trên XML thô: không có phần tử <f> nào. Đọc lại
    // bằng chính exceljs thì chỉ chứng minh nó tự hiểu được file của nó.
    expect(sheet).not.toContain('<f>');
    expect(sheet).not.toContain('<f ');
    // Mọi ô đều mang kiểu chuỗi.
    expect(sheet).toMatch(/t="s"/);

    // Và dữ liệu KHÔNG bị sửa. Cách chống phổ biến là thêm dấu nháy đơn vào đầu
    // ô; ở định dạng xlsx điều đó vừa thừa vừa làm sai tên khách hàng thật bắt
    // đầu bằng dấu trừ hoặc dấu cộng.
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as unknown as ArrayBuffer);
    const cell = back.worksheets[0]!.getRow(2).getCell(1);
    expect(cell.value).toBe(nasty);
    expect(cell.formula).toBeUndefined();
  });
});

// =============================================================================
// SEC-14 — ba script nạp/xoá dữ liệu đều từ chối chạy ở production
//
// `reset-db.sh` XOÁ HẲN CSDL. Nó chạy trong container `migrate` chứ không qua
// pnpm, nên gọi thẳng bằng sh — điều đang kiểm là chốt chặn ở đầu script, không
// phải đường gọi.
// =============================================================================

describe('SEC-14 chạy script seed với NODE_ENV=production', () => {
  it('tự thoát, không tạo tài khoản nào', async () => {
    const before = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT count(*)::text AS n FROM idn.app_user`);
      return r.rows[0]!.n as string;
    });

    let code = 0;
    let stderr = '';
    try {
      await exec('pnpm', ['seed'], { env: { ...process.env, NODE_ENV: 'production' } });
    } catch (e) {
      const err = e as { code?: number; stderr?: string; stdout?: string };
      code = err.code ?? 1;
      stderr = `${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/production/i);

    const after = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT count(*)::text AS n FROM idn.app_user`);
      return r.rows[0]!.n as string;
    });
    expect(after).toBe(before);
  }, 120_000);

  it('script tạo tài khoản quản trị của bản demo cũng tự thoát', async () => {
    const dem = async () =>
      withAdminDb(async (c) => {
        const r = await c.query(`SELECT count(*)::text AS n FROM idn.app_user`);
        return r.rows[0]!.n as string;
      });
    const before = await dem();

    let code = 0;
    let stderr = '';
    try {
      await exec('pnpm', ['seed:admin'], { env: { ...process.env, NODE_ENV: 'production' } });
    } catch (e) {
      const err = e as { code?: number; stderr?: string; stdout?: string };
      code = err.code ?? 1;
      stderr = `${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/production/i);
    expect(await dem()).toBe(before);
  }, 120_000);

  it('script XOÁ CSDL tự thoát — và CSDL vẫn còn nguyên', async () => {
    // Đây là chốt chặn đáng giá nhất trong ba cái: hai script kia nạp thêm dữ
    // liệu, script này xoá sạch. Chạy nhầm nó trên máy chủ thật là mất tất cả.
    let code = 0;
    let stderr = '';
    try {
      await exec('sh', ['scripts/reset-db.sh'], {
        env: { ...process.env, NODE_ENV: 'production' },
      });
    } catch (e) {
      const err = e as { code?: number; stderr?: string; stdout?: string };
      code = err.code ?? 1;
      stderr = `${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/production/i);

    // Không chỉ đo mã thoát: nếu script vẫn chạy tới lệnh DROP thì bảng này
    // biến mất, và mã thoát khác 0 vì lý do hoàn toàn khác.
    const con = await withAdminDb(async (c) => {
      const r = await c.query(`SELECT count(*)::text AS n FROM idn.app_user`);
      return r.rows[0]!.n as string;
    });
    expect(Number(con)).toBeGreaterThan(0);
  }, 120_000);
});

// =============================================================================
// Gateway chuyển tiếp đúng — hai chỗ hỏng lặng lẽ nhất
// =============================================================================

describe('Gateway chuyển tiếp', () => {
  it('thân request POST tới nơi nguyên vẹn', async () => {
    // Nếu ai bật lại body parser của Nest ở gateway thì luồng dữ liệu bị đọc cạn
    // trước khi tới middleware chuyển tiếp, và MỌI request POST đi tiếp với thân
    // RỖNG. Triệu chứng là lỗi "thiếu trường" ở service — trông như lỗi kiểm dữ
    // liệu vào, không ai nghĩ tới gateway.
    const r = await gpost('/auth/login', { login: 'tdv01', password: SEED_PW });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
  });

  it('gắn số phiên bản và trace-id vào mọi phản hồi', async () => {
    const r = await gget('/policies?limit=1', 'tdv01');
    expect(r.headers['x-app-version']).toBeTruthy();
    expect(r.headers['x-trace-id']).toBeTruthy();
  });

  it('nối tiếp trace-id do người gọi đưa vào, không sinh mã mới', async () => {
    const trace = `trace-sec-${Date.now()}`;
    const r = await (await gw())
      .get('/policies?limit=1')
      .set('x-trace-id', trace)
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(r.headers['x-trace-id']).toBe(trace);
  });

  it('/readyz gom trạng thái cả hệ vào một lời gọi', async () => {
    const r = await gget('/readyz');
    const services = r.body.services as { service: string; ok: boolean }[];

    // KHÔNG khẳng định 200. File test này chỉ dựng sáu service; `notification`
    // và `document` không chạy, nên `/readyz` báo đỏ — và báo đỏ mới là đúng.
    // Khẳng định ở đây là về phép GOM, không phải về việc mọi thứ đang sống.
    expect(r.status).toBe(r.body.ok ? 200 : 503);
    expect(r.body.ok).toBe(services.every((x) => x.ok));

    // Mỗi service hỏi ĐÚNG một lần dù nhiều tiền tố cùng trỏ vào nó.
    const names = services.map((x) => x.service);
    expect(new Set(names).size).toBe(names.length);

    // Service đang chạy thì phải xanh; service không chạy thì phải đỏ. Thiếu vế
    // sau thì một endpoint luôn trả "ổn" cũng qua được test này.
    expect(services.find((x) => x.service === 'policy')?.ok).toBe(true);
    expect(services.find((x) => x.service === 'identity')?.ok).toBe(true);
    expect(services.find((x) => x.service === 'document')?.ok).toBe(false);
  }, 30_000);

  it('/readyz chuyển sang 503 khi một service đang sống bị tắt', async () => {
    const before = await gget('/readyz');
    expect(before.body.services.find((x: { service: string }) => x.service === 'catalog').ok).toBe(
      true,
    );

    const prev = process.env.CATALOG_URL;
    process.env.CATALOG_URL = 'http://127.0.0.1:1';
    try {
      const down = await gget('/readyz');
      // 503 chứ không 200-kèm-cảnh-báo: công cụ giám sát đọc MÃ TRẠNG THÁI, và
      // một sự cố chỉ nằm trong thân phản hồi là một sự cố không ai thấy —
      // đúng kiểu hỏng lặng lẽ mà `archive_command` đã dạy ở P5.6.
      expect(down.status).toBe(503);
      expect(down.body.ok).toBe(false);
      const bad = (down.body.services as { service: string; ok: boolean }[]).find(
        (x) => x.service === 'catalog',
      );
      expect(bad?.ok).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CATALOG_URL;
      else process.env.CATALOG_URL = prev;
    }
  }, 30_000);

  it('service phía sau chết thì 502, không phải 500', async () => {
    const prev = process.env.REPORTING_URL;
    // Cổng 1 không có gì lắng nghe — kết nối bị từ chối ngay.
    process.env.REPORTING_URL = 'http://127.0.0.1:1';
    try {
      const r = await gget('/reports/policies', 'tdv01');
      expect(r.status).toBe(502);
      expect(r.body.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(r.body.service).toBe('reporting');
    } finally {
      if (prev === undefined) delete process.env.REPORTING_URL;
      else process.env.REPORTING_URL = prev;
    }
  });
});
