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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

/**
 * Bộ đếm MST — MỖI khách hàng một mã số thuế riêng (`0104`).
 *
 * Dùng chung một số cho cả tệp thì `POST /customers` tra trùng MST trả về
 * danh sách lớn dần theo số khách hàng đã tạo — O(n²), và những ca chạy sau
 * cùng bắt đầu chạm ngưỡng quá giờ.
 */
let nMst = 0;

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
    // Quét CẢ chồng demo VÀ chồng production (`0105`): đó là nơi mười service
    // ứng dụng được khai, tức là nơi dễ vô tình mở một cổng ra ngoài nhất.
    //
    // `compose.prod.yml` là tệp DUY NHẤT thật sự chạy trên máy khách hàng. Canh
    // bất biến này ở ba tệp kia mà bỏ nó ra ngoài là canh ở mọi nơi trừ nơi có
    // ý nghĩa — và tệp ấy đã có một `ports:` hợp lệ (80 và 443 của caddy), nên
    // "không có ports nào" không phải là cách kiểm thay thế.
    for (const f of [
      'deploy/compose.yml',
      'deploy/compose.test.yml',
      'deploy/compose.demo.yml',
      'deploy/compose.prod.yml',
    ]) {
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

  it('`0107` ĐƯỜNG HẦM chỉ được khai ở tệp riêng của nó', () => {
    /*
     * LỖ HỔNG CỦA CHÍNH PHÉP KIỂM NÀY, và đây là chỗ bịt nó.
     *
     * Mọi ca ở trên quét `ports:`. `cloudflared` KHÔNG mở cổng nào — nó mở một
     * kết nối ĐI RA tới biên Cloudflare rồi nhận request ngược qua đó. Nên bất
     * biến "chỉ caddy mở cổng" vẫn xanh trong khi cả hệ thống đã ra Internet:
     * phép kiểm đúng từng chữ, và vô dụng đúng lúc cần.
     *
     * Nên quét thêm theo TÊN, không theo `ports`. Và quét cả `command:` — một
     * service tên khác chạy ảnh `cloudflared` thì cái tên không nói ra điều gì.
     */
    const NOI_DUOC_PHEP = 'deploy/compose.tunnel.yml';
    for (const f of [
      'deploy/compose.yml',
      'deploy/compose.test.yml',
      'deploy/compose.demo.yml',
      'deploy/compose.prod.yml',
      'deploy/compose.mail.yml',
    ]) {
      const t = readFileSync(f, 'utf8');
      expect(t, `${f} khai đường hầm — nó chỉ được ở ${NOI_DUOC_PHEP}`).not.toMatch(
        /cloudflare|ngrok|tailscale|localtunnel/i,
      );
    }
    // Và tệp được phép thì phải THẬT SỰ có nó — ngược lại ca này canh một quy
    // tắc về thứ không tồn tại, và sẽ xanh mãi sau khi ai đó xoá tệp đi.
    expect(readFileSync(NOI_DUOC_PHEP, 'utf8')).toMatch(/cloudflare\/cloudflared/);
  });

  it('`0107` đường hầm KHÔNG mở sẵn — phải gõ thêm `-f` mới mở', () => {
    /*
     * Cùng lý do với hộp thư thử, và nặng hơn: đây là cả hệ thống ra Internet,
     * không phải một giao diện đọc thư. `cai-dat.sh` và lệnh `len` không được
     * kéo theo lớp phủ này.
     */
    const caiDat = readFileSync('scripts/cai-dat.sh', 'utf8');
    expect(caiDat).not.toContain('compose.tunnel.yml');

    const csbh = readFileSync('scripts/csbh', 'utf8');
    // Lớp phủ chỉ bật khi có TỆP DẤU, hoặc trong đúng lệnh mở đường hầm.
    expect(csbh).toContain('.thu-nghiem');
    expect(csbh).toMatch(/mo-thu-nghiem\)/);
    expect(csbh).toMatch(/dong-thu-nghiem\)/);
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
        // Giá bắt buộc từ `0123`.
        price: '100000',
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
        // `0104` — gửi duyệt đòi đủ MST và chức danh, nên khách hàng
        // của bộ test phải giống khách hàng thật.
        ownerTitle: 'Chu ho',
        idNumber: String(5101333332 + ++nMst),
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

describe('`0114` lệnh mồi KHÔNG gửi thư, và nói ra điều đó', () => {
  const nguon = readFileSync('scripts/bootstrap-admin.ts', 'utf8');

  it('không gọi mailer, không gọi SMTP, không gọi API nào', () => {
    /*
     * Tài khoản mồi là ngoại lệ DUY NHẤT của luật "thư mời là đường duy nhất để
     * một tài khoản có mật khẩu" — không có ai ở trên nó để gửi thư. Nó ghi
     * thẳng vào CSDL kèm `activated_at`, nên nó dùng được ngay.
     *
     * Thêm một lượt gửi thư vào đây là biến bước cài đặt đầu tiên thành một bước
     * phụ thuộc SMTP, trong khi SMTP chưa được kiểm ở thời điểm ấy.
     */
    for (const cam of ['nodemailer', 'Mailer', 'sendInvite', 'MAIL_HOST', 'fetch(']) {
      expect(nguon, `lệnh mồi không được gọi ${cam}`).not.toContain(cam);
    }
    expect(nguon).toContain('activated_at');
  });

  it('NÓI RA rằng không có thư nào — nếu không người cài ngồi chờ', () => {
    /*
     * Đã xảy ra: người cài đặt chạy lệnh, không thấy thư, rồi đi tra cấu hình
     * SMTP — thứ chưa liên quan gì ở bước ấy.
     */
    expect(nguon).toContain('KHÔNG có thư nào được gửi');
    // Và chỉ ra chỗ đường thư THẬT SỰ được kiểm.
    expect(nguon).toContain('tài khoản THỨ HAI');
  });
});

describe('`0117` lệnh mồi từ chối ADMIN_EMAIL ngoài MAIL_ALLOWLIST', () => {
  const nguon = readFileSync('scripts/bootstrap-admin.ts', 'utf8');

  it('so bằng HÀM DÙNG CHUNG, không chép lại phép so', () => {
    /*
     * Chép phép so vào đây là dựng chỗ thứ BA cho cùng một luật — và chỗ thứ hai
     * (`identity/mailer.ts`) đã kịp lệch khỏi chỗ thứ nhất suốt mười một chặng
     * trước khi `0117` gộp lại.
     */
    expect(nguon).toContain('thuocMienThu');
    expect(nguon).toContain('chuanHoaMienThu');
    // Không có phép so tự chế nào bên cạnh.
    expect(nguon).not.toMatch(/endsWith\(/);
  });

  it('CHẠY THẬT: địa chỉ ngoài danh sách thì DỪNG, trước cả khi mở kết nối CSDL', async () => {
    /*
     * Ca này chạy chính script, không đọc mã nguồn bằng mắt.
     *
     * `expect(...).not.toMatch(/TỪ CHỐI/)` là phần đáng giá: CSDL của bộ test đã
     * có 10 tài khoản mẫu, nên script SẼ dừng dù chốt tên miền có tồn tại hay
     * không — chỉ khác ở chỗ dừng vì lý do gì. Không phân biệt hai lý do thì ca
     * kiểm này xanh kể cả khi `0117` bị gỡ sạch.
     */
    let code = 0;
    let ra = '';
    try {
      await exec('pnpm', ['bootstrap-admin'], {
        env: {
          ...process.env,
          ADMIN_USERNAME: `${P}_boot`,
          ADMIN_EMAIL: 'ai-do@gmail.com',
          ADMIN_PASSWORD: 'MatKhauMoi@2026',
          MAIL_ALLOWLIST: 'nutricare.vn',
        },
      });
    } catch (e) {
      const err = e as { code?: number; stderr?: string; stdout?: string };
      code = err.code ?? 1;
      ra = `${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
    expect(code).not.toBe(0);
    expect(ra).toContain('MAIL_ALLOWLIST');
    expect(ra).not.toMatch(/TỪ CHỐI/);
    // Câu báo phải nói ra vì sao chuyện này quan trọng dù lệnh mồi không gửi thư
    // nào: sai ở đây chỉ lộ ra lần đầu bấm *Quên mật khẩu*, lúc không còn đường
    // vào nào khác. Không nói ra thì người cài đọc nó như một phép kiểm hình thức.
    expect(ra).toMatch(/Quên mật khẩu/);
  }, 120_000);

  it('CHẠY THẬT: địa chỉ trong danh sách thì đi tiếp — dừng ở chốt khác', async () => {
    let ra = '';
    try {
      await exec('pnpm', ['bootstrap-admin'], {
        env: {
          ...process.env,
          ADMIN_USERNAME: `${P}_boot2`,
          ADMIN_EMAIL: 'quan-tri@nutricare.vn',
          ADMIN_PASSWORD: 'MatKhauMoi@2026',
          MAIL_ALLOWLIST: 'nutricare.vn',
        },
      });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string };
      ra = `${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
    // Vẫn dừng — CSDL bộ test đã có tài khoản — nhưng KHÔNG vì tên miền. Chiều
    // ngược lại này giữ cho chốt không siết thành "chặn tất".
    expect(ra).not.toContain('MAIL_ALLOWLIST');
  }, 120_000);

  it('vẫn KHÔNG gửi thư — chốt mới không được kéo SMTP vào lệnh mồi (`0114`)', () => {
    // Đọc một biến môi trường là đọc cấu hình, không phải mở kết nối. Ranh giới
    // của `0114` phải còn nguyên sau lượt sửa này.
    for (const cam of ['nodemailer', 'Mailer', 'sendInvite', 'MAIL_HOST', 'fetch(']) {
      expect(nguon, `lệnh mồi không được gọi ${cam}`).not.toContain(cam);
    }
  });
});

describe('`0111` migrate nói ra khi Postgres từ chối mật khẩu', () => {
  /*
   * `pg_isready` KHÔNG kiểm được mật khẩu — nó chỉ hỏi "máy chủ có nhận kết nối
   * không" và trả 0 kể cả khi mọi lượt đăng nhập đều bị từ chối. Nên vòng chờ
   * qua được, rồi câu lệnh đầu tiên chết với một dòng của psql không nhắc gì tới
   * nguyên nhân thật.
   */
  const sh = readFileSync('scripts/migrate.sh', 'utf8');

  it('có phép thử ĐĂNG NHẬP riêng, không tin mỗi `pg_isready`', () => {
    expect(sh).toContain('pg_isready');
    // Một lượt `SELECT 1` thật, sau vòng chờ và trước câu lệnh đầu tiên.
    expect(sh).toMatch(/psql -q -c 'SELECT 1'/);
    expect(sh.indexOf('pg_isready')).toBeLessThan(sh.indexOf("psql -q -c 'SELECT 1'"));
  });

  it('nói ra nguyên nhân THẬT, không chỉ chép lại câu của psql', () => {
    // Nguyên nhân gần như luôn là một chuyện, và nó không nằm trong câu của psql.
    expect(sh).toContain('CHỈ ở lần khởi tạo dữ liệu đầu tiên');
    // Hai đường xử lý, vì chúng khác nhau hẳn.
    expect(sh).toContain('down -v');
    expect(sh).toContain('05-VAN-HANH.md');
    expect(sh).toContain('COMPOSE_PROJECT_NAME');
  });

  it('lỗi KHÁC lỗi mật khẩu vẫn hiện nguyên văn', () => {
    /*
     * Nuốt tất là biến một máy chủ sai tên, một CSDL chưa tạo, hay một quyền
     * thiếu thành cùng một câu về mật khẩu — và người đọc sẽ đi xoá volume.
     */
    expect(sh).toMatch(/cat \/tmp\/migrate-thu\.err >&2/);
  });
});

describe('`0110` lệnh mồi nói ra khi CSDL chưa chạy migration', () => {
  /*
   * `docker compose run ops` tự khởi động Postgres theo `depends_on`, nên gọi
   * `mo-tai-khoan` TRƯỚC `len` sẽ dựng một CSDL trống rồi chạy luôn. Bản trước
   * ném nguyên vết ngăn xếp của `pg`:
   *
   *   error: relation "idn.app_user" does not exist
   *
   * — đúng về mặt kỹ thuật, và không nói cho người cài đặt biết phải gõ gì.
   */
  const nguon = readFileSync('scripts/bootstrap-admin.ts', 'utf8');

  it('bắt theo MÃ lỗi Postgres, không theo câu chữ', () => {
    // Câu chữ của Postgres đổi theo `lc_messages` của máy chủ; mã thì không.
    expect(nguon).toContain("'42P01'");
    expect(nguon).not.toMatch(/does not exist['"]/);
  });

  it('câu báo nói ĐÚNG hai đường dẫn tới lỗi, và việc phải làm cho mỗi đường', () => {
    expect(nguon).toContain('chưa chạy migration');
    expect(nguon).toContain('./csbh len');
    // Đường thứ hai: migration đã chạy, nhưng ở một CSDL khác.
    expect(nguon).toContain('COMPOSE_PROJECT_NAME');
  });

  it('lỗi KHÁC 42P01 vẫn được ném lên nguyên vẹn', () => {
    /*
     * Nuốt mọi lỗi ở đây là biến một sự cố kết nối, một mật khẩu sai, hay một
     * quyền thiếu thành cùng một câu "chưa chạy migration" — và người đọc sẽ đi
     * chạy migration, thấy nó chạy được, rồi không hiểu gì nữa.
     */
    expect(nguon).toMatch(/!==\s*'42P01'\)\s*throw e/);
  });
});

describe('`0109` bộ nạp danh mục ĐƯỢC phép chạy ở production — và vì sao', () => {
  /*
   * `nap-danh-muc.ts` là script nạp dữ liệu DUY NHẤT không có chốt `NODE_ENV`,
   * nên nó phải tự biện minh được. Ca này giữ cho lời biện minh ấy còn đúng.
   *
   * SEC-14 canh một chuyện cụ thể: **tài khoản có mật khẩu ai cũng đoán được**
   * không được nạp lên máy chủ thật. Danh mục sản phẩm không phải chuyện đó.
   * Nhưng ranh giới ấy chỉ giữ được chừng nào script KHÔNG đụng tới tài khoản —
   * và thứ dễ xảy ra nhất là ai đó thêm "tiện thể tạo vài tài khoản mẫu".
   */
  const nguon = readFileSync('scripts/nap-danh-muc.ts', 'utf8');

  it('KHÔNG tạo tài khoản, KHÔNG đặt mật khẩu nào', () => {
    for (const cam of ['app_user', '/admin/users', 'password_hash', 'hashPassword']) {
      expect(nguon, `nap-danh-muc không được đụng tới ${cam}`).not.toContain(cam);
    }
    // Nó ĐỌC mật khẩu quản trị để đăng nhập, và chỉ được dùng vào đúng việc ấy.
    expect(nguon).toContain('ADMIN_PASSWORD');
    expect(nguon).toContain('/auth/login');
  });

  it('đi qua API THẬT, không INSERT thẳng vào CSDL', () => {
    /*
     * Giá và ngưỡng phải qua đúng phép kiểm mà màn hình Quản trị dùng. Chèn
     * thẳng SQL thì bản chạy thử mang những con số mà phần mềm không tạo ra
     * được — và người thử sẽ tin rằng nó tạo được.
     */
    expect(nguon).not.toMatch(/INSERT INTO/i);
    expect(nguon).not.toContain("from 'pg'");
    expect(nguon).toContain('/catalog/products');
    expect(nguon).toContain('/catalog/discount-rules');
  });

  it('có ĐỦ hai chốt chặn thay cho chốt NODE_ENV', () => {
    // Chốt 1: tài khoản còn phải đổi mật khẩu thì dừng, kèm câu nói việc phải làm.
    expect(nguon).toContain('mustChangePassword');
    // Chốt 2: danh mục đã có sản phẩm thì dừng — đây là lệnh KHỞI ĐẦU.
    expect(nguon).toMatch(/TỪ CHỐI/);
    expect(nguon).toContain('/catalog/products?limit=1');
  });

  it('ba văn bản mẫu nó nạp đều có thật trong `templates/`', () => {
    for (const t of [
      'mau-ho-so-a4-doc.docx',
      'mau-ho-so-a4-ngang.docx',
      'mau-hop-dong-a4-doc.docx',
    ]) {
      expect(nguon, `nap-danh-muc phải nạp ${t}`).toContain(t);
      expect(existsSync(`templates/${t}`), `thiếu templates/${t}`).toBe(true);
    }
  });

  it('nói ra rằng đây là DỮ LIỆU MẪU, ở cả đầu lẫn cuối', () => {
    // Một hệ thật lỡ nạp bộ này mà không ai biết thì bảng giá minh hoạ trở thành
    // bảng giá công ty, và không có gì trên màn hình nói ra điều đó.
    expect(nguon.match(/DỮ LIỆU MẪU/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

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

// =============================================================================
// SEC-13 — Ban lãnh đạo KHÔNG ghi được gì
//
// Ca kiểm này nằm trong danh mục kiến trúc từ đầu (`P0`, muc 2.6) và CHƯA TỪNG
// được viết. `0099` viết nó, sau khi lỗ nó sinh ra để bịt đã mở thật:
// `DELETE /policies/:id/lines/:lineId` mất `@Roles('TDV')` từ P26, và trên chồng
// demo, bld01 xoá được một dòng sản phẩm khỏi hồ sơ Nháp của tdv01 — 200, dòng
// biến mất. Kế toán và Trưởng bộ phận cũng xoá được, ở hồ sơ *Yêu cầu chỉnh sửa*
// mà họ có tên trong bốn cột người.
//
// Bảng quyền của giao diện ĐÚNG suốt thời gian ấy (`tests/web/quyen.test.ts`,
// FE-23), nên không màn hình nào bày ra cái nút. Đó chính là lý do ca kiểm này
// phải quét MÁY CHỦ: chốt chặn nằm ở đó, còn giao diện chỉ là chỗ không mời.
// =============================================================================

type DuongGhi = {
  tep: string;
  method: string;
  path: string;
  vaiTro: string[] | null;
  noiBo: boolean;
  congKhai: boolean;
  trung: boolean;
};

/**
 * Đường mang phương thức GHI mà **không ghi dữ liệu nghiệp vụ**, nên Ban lãnh đạo
 * đi qua được mà không mâu thuẫn gì với "chỉ đọc" (muc 2.6).
 *
 * Hai nhóm, và ranh giới giữa chúng là thứ đáng đọc kỹ:
 *
 *   1. **Tài khoản của chính người gọi.** Không ai bị cấm tự đổi mật khẩu mình.
 *   2. **ĐỌC nhưng viết bằng POST/PUT.** Xuất Excel tạo một *việc* rồi trả file;
 *      bộ lọc đã lưu là trạng thái màn hình của riêng người dùng. Cả hai đều đi
 *      qua đúng phạm vi dữ liệu của người gọi, nên chúng không mở thêm gì.
 *
 * Danh sách TRẮNG chứ không phải một mệnh đề `if`: thêm một đường ghi không khai
 * vai trò thì phải khai ở đây kèm lý do, và người đọc thấy ngay có bao nhiêu
 * ngoại lệ. Cùng lối với `NUOT_CO_LY_DO` ở `tests/web/nuot-loi.test.tsx`.
 */
const KHONG_PHAI_GHI_NGHIEP_VU: Record<string, string> = {
  // 1 — tài khoản của chính mình
  'PATCH /auth/me': 'tự sửa họ tên của chính mình',
  'POST /auth/change-password': 'tự đổi mật khẩu của chính mình',
  'POST /auth/logout': 'tự kết thúc phiên của chính mình',
  'POST /auth/login': 'công khai — chưa đăng nhập thì chưa có vai trò',
  'POST /auth/refresh': 'công khai',
  'POST /auth/activate': 'công khai — kích hoạt bằng token trong thư',
  'POST /auth/forgot-password': 'công khai',
  'POST /auth/reset-password': 'công khai — đặt lại bằng token trong thư',
  'POST /notifications/:id/da-doc': 'đánh dấu đã đọc thông báo CỦA CHÍNH MÌNH',
  'POST /notifications/da-doc-het': 'đánh dấu đã đọc thông báo CỦA CHÍNH MÌNH',

  // 2 — đọc, nhưng viết bằng POST/PUT
  'POST /reports/exports': 'XUẤT Excel danh sách hồ sơ — đọc, và đọc trong đúng phạm vi của người gọi',
  'PUT /reports/filters/:screen': 'bộ lọc đã lưu của RIÊNG người dùng, không phải dữ liệu nghiệp vụ',
  'POST /reports/filters/:screen/clear': 'xoá bộ lọc đã lưu của RIÊNG người dùng',
};

const timControllers = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? timControllers(join(d, e.name))
      : e.name.endsWith('.controller.ts')
        ? [join(d, e.name)]
        : [],
  );

const vaiTroTrong = (khoi: string[]): string[] | null => {
  const r = khoi.filter((d) => d.startsWith('@Roles('));
  if (r.length === 0) return null;
  return r.flatMap((d) => [...d.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!));
};

/**
 * Mọi đường GHI của mười service, đọc từ mã nguồn.
 *
 * Đọc nguồn chứ không hỏi Nest: bảng định tuyến của Nest chỉ có những service
 * đang chạy trong chính tệp test này, mà lỗ hổng thì không chờ service nào khởi
 * động. Phép quét theo KHỐI DECORATOR — cùng đơn vị mà lỗi `0099` sinh ra ở đó.
 */
const quetDuongGhi = (): DuongGhi[] => {
  const ra: DuongGhi[] = [];
  for (const tep of timControllers('services')) {
    let cho: string[] = [];
    let tienTo = '';
    let lopVaiTro: string[] | null = null;
    let lopNoiBo = false;
    for (const l of readFileSync(tep, 'utf8').split('\n')) {
      const s = l.trim();
      if (s.startsWith('@')) {
        cho.push(s);
        continue;
      }
      // Chú thích và dòng trắng KHÔNG cắt khối: chúng nằm giữa hai decorator là
      // chuyện thường, và chính chỗ ấy đã nuốt mất một `@Roles`.
      if (s === '' || s.startsWith('*') || s.startsWith('/*') || s.startsWith('//')) continue;

      const khoi = cho;
      cho = [];
      if (khoi.length === 0) continue;

      const ctrl = khoi.find((d) => d.startsWith('@Controller('));
      if (ctrl) {
        tienTo = /@Controller\('([^']*)'\)/.exec(ctrl)?.[1] ?? '';
        lopVaiTro = vaiTroTrong(khoi);
        lopNoiBo = khoi.some((d) => d.startsWith('@ServiceOnly'));
        continue;
      }

      const ghi = khoi
        .map((d) => /^@(Post|Patch|Put|Delete)\(\s*'?([^')]*)'?/.exec(d))
        .find((m) => m !== null);
      if (!ghi) continue;

      const duoi = ghi[2] ?? '';
      const vaiTro = vaiTroTrong(khoi) ?? lopVaiTro;
      ra.push({
        tep,
        method: ghi[1]!.toUpperCase(),
        path: `/${[tienTo, duoi].filter((x) => x !== '').join('/')}`,
        vaiTro,
        noiBo: lopNoiBo || khoi.some((d) => d.startsWith('@ServiceOnly')),
        congKhai: khoi.some((d) => d.startsWith('@Public')),
        trung: khoi.filter((d) => d.startsWith('@Roles(')).length > 1,
      });
    }
  }
  return ra;
};

describe('SEC-13 Ban lãnh đạo và mọi đường ghi', () => {
  it('quét ra được bề mặt ghi của cả mười service', () => {
    const ds = quetDuongGhi();
    // Ngưỡng thô, chỉ để phép quét không âm thầm trả về rỗng rồi mọi khẳng định
    // dưới đây đều xanh vì không có gì để kiểm.
    expect(ds.length).toBeGreaterThan(50);
    expect(ds.some((d) => d.path === '/policies/:id/lines/:lineId' && d.method === 'DELETE')).toBe(
      true,
    );
  });

  it('KHÔNG khối decorator nào khai `@Roles` hai lần', () => {
    // Đúng cơ chế đã sinh ra lỗ hổng: `@Roles` thứ hai ghi đè cái thứ nhất trong
    // im lặng, nên hai dòng cùng đứng đó mà chỉ một dòng có tác dụng — và đường
    // bên cạnh, vốn sở hữu cái bị đẩy đi, còn lại tay không.
    const trung = quetDuongGhi().filter((d) => d.trung);
    expect(trung.map((d) => `${d.method} ${d.path} (${d.tep})`)).toEqual([]);
  });

  it('MỌI đường ghi đều khai vai trò, trừ danh sách trắng có lý do', () => {
    const thieu = quetDuongGhi()
      .filter((d) => !d.noiBo && !d.congKhai && d.vaiTro === null)
      .filter((d) => KHONG_PHAI_GHI_NGHIEP_VU[`${d.method} ${d.path}`] === undefined);
    expect(
      thieu.map((d) => `${d.method} ${d.path} (${d.tep})`),
      'đường ghi không khai @Roles — khai vai trò, hoặc khai vào KHONG_PHAI_GHI_NGHIEP_VU kèm lý do',
    ).toEqual([]);
  });

  it('KHÔNG đường ghi nào cho Ban lãnh đạo vào, kể cả gián tiếp', () => {
    const hong = quetDuongGhi().filter((d) => d.vaiTro?.includes('BAN_LANH_DAO'));
    expect(hong.map((d) => `${d.method} ${d.path}`)).toEqual([]);
  });

  it('gọi THẬT từng đường ghi bằng bld01 thì 403, không đường nào lọt', async () => {
    // Chỉ quét service đang chạy trong tệp này; phần còn lại do ba ca tĩnh ở
    // trên canh. Ca này là lớp đối chiếu giữ cho phép quét tĩnh không trôi —
    // nó khẳng định "khai @Roles" thật sự dẫn tới 403, chứ không chỉ là một
    // chuỗi khớp trong mã nguồn.
    const DANG_CHAY = ['services/identity/', 'services/catalog/', 'services/customer/', 'services/policy/', 'services/reporting/'];
    const NGAU_NHIEN = '11111111-2222-3333-4444-555555555555';

    const ds = quetDuongGhi().filter(
      (d) =>
        !d.noiBo &&
        !d.congKhai &&
        DANG_CHAY.some((s) => d.tep.startsWith(s)) &&
        KHONG_PHAI_GHI_NGHIEP_VU[`${d.method} ${d.path}`] === undefined,
    );
    expect(ds.length).toBeGreaterThan(20);

    const lot: string[] = [];
    for (const d of ds) {
      const path = d.path.replace(/:[A-Za-z]+/g, NGAU_NHIEN);
      const req = (await gw())[d.method.toLowerCase() as 'post'](path)
        .set('Authorization', `Bearer ${tok['bld01']}`)
        .send({});
      const r = await req;
      // 403 CHỨ KHÔNG PHẢI 400/404/409: chốt chặn vai trò chạy trước cả phép
      // kiểm dữ liệu, nên bất kỳ mã nào khác nghĩa là bld01 đã đi qua nó và
      // đang đứng trong thân nghiệp vụ.
      if (r.status !== 403) lot.push(`${d.method} ${path} -> ${r.status}`);
    }
    expect(lot, 'Ban lãnh đạo lọt qua chốt chặn ở những đường này').toEqual([]);
  }, 120_000);
});
