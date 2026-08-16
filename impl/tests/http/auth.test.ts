/**
 * AUTH-01 … AUTH-07 và AUTH-21 — đăng nhập, vòng đời token, cách ly service.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { decodeJwtUnsafe, hashPassword } from '@csbh/identity-core';
import { CONFIG } from '@csbh/identity/config';
import {
  accessTokenFor,
  boot,
  cleanupTestUsers,
  expiredAccessToken,
  http,
  login,
  serviceToken,
  TEST_PREFIX,
  withAdminDb,
  bootPolicyListening,
  bootCustomerListening,
} from './app.js';

const SEED_PW = 'Test@1234';
const LOCK_USER = `${TEST_PREFIX}_lock`;
const DEACT_USER = `${TEST_PREFIX}_deact`;

let app: INestApplication;
let policyApp: INestApplication;
let customerApp: INestApplication;
let restoreCustomer: (() => void) | undefined;
let restorePolicy: (() => void) | undefined;
let redis: Redis;
let lockUserId = '';
let deactUserId = '';

beforeAll(async () => {
  await cleanupTestUsers();
  const hash = await hashPassword(SEED_PW);
  await withAdminDb(async (c) => {
    for (const u of [LOCK_USER, DEACT_USER]) {
      const r = await c.query<{ id: string }>(
        `INSERT INTO idn.app_user (username, email, full_name, role, password_hash,
                                   activated_at, email_verified_at)
         VALUES ($1, $1 || '@csbh.test', $1, 'TDV', $2, now(), now()) RETURNING id`,
        [u, hash],
      );
      // `idn.user_node` đã bị gỡ ở `0031` — tài khoản không còn chỗ nào trong
      // một cây tổ chức để phải đăng ký vào.
      const id = r.rows[0]!.id;
      if (u === LOCK_USER) lockUserId = id;
      else deactUserId = id;
    }
  });
  app = await boot();
  // `POST /admin/users/:id/deactivate` hỏi `policy` xem tài khoản đang giữ hồ sơ
  // nào (`0032`), và FAIL CLOSED nếu không hỏi được — mục đích của cả tính năng
  // là "không hồ sơ nào bị treo", mà không hỏi được thì không biết. Nên tệp này
  // phải dựng `policy` dù nó chẳng kiểm gì về hồ sơ.
  const po = await bootPolicyListening();
  policyApp = po.app;
  restorePolicy = po.restore;
  // Và `customer`: tài khoản thử nghiệm ở tệp này là TDV, mà vô hiệu hoá một
  // TDV còn phải hỏi "đang phụ trách khách hàng nào" (`0032`).
  const cu = await bootCustomerListening();
  customerApp = cu.app;
  restoreCustomer = cu.restore;
  redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');
});

afterAll(async () => {
  await policyApp?.close();
  restorePolicy?.();
  await customerApp?.close();
  restoreCustomer?.();
  await redis?.quit();
  await app?.close();
  await cleanupTestUsers();
});

describe('AUTH-01 đăng nhập đúng mật khẩu', () => {
  it('trả access token 15 phút, refresh token 8 giờ, vai trò và thông tin người dùng', async () => {
    const res = await login(app, 'tdv01', SEED_PW);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('TDV');
    expect(res.body.user.email).toBe('tdv01@csbh.test');
    expect(res.body.mustChangePassword).toBe(false);

    const claims = decodeJwtUnsafe(res.body.accessToken)!;
    expect(claims.aud).toBe(CONFIG.audUser);
    expect(claims.exp - claims.iat).toBe(15 * 60);
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('đăng nhập được bằng email thay cho tên tài khoản', async () => {
    const res = await login(app, 'TDV01@CSBH.TEST', SEED_PW);
    expect(res.status).toBe(200);
  });

  it('refresh token hết hạn sau đúng 8 giờ', async () => {
    const res = await login(app, 'tdv02', SEED_PW);
    const raw = (res.body.refreshToken as string).split('.').slice(1).join('.');
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ secs: string }>(
        `SELECT extract(epoch FROM (expires_at - created_at))::text AS secs
           FROM idn.refresh_token
          WHERE token_hash = encode(sha256($1::bytea), 'hex')`,
        [raw],
      );
      return q.rows[0];
    });
    expect(Number(row!.secs)).toBe(8 * 60 * 60);
  });
});

describe('AUTH-02 sai mật khẩu 5 lần liên tiếp', () => {
  it('khoá tài khoản 15 phút và không tiết lộ tài khoản có tồn tại hay không', async () => {
    const agent = await http(app);
    for (let i = 0; i < 5; i++) {
      const r = await agent.post('/auth/login').send({ login: LOCK_USER, password: 'sai-be-bet' });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('INVALID_CREDENTIALS');
    }

    // Lần thứ sáu ĐÚNG mật khẩu vẫn phải bị từ chối — tài khoản đang bị khoá.
    const after = await agent.post('/auth/login').send({ login: LOCK_USER, password: SEED_PW });
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('INVALID_CREDENTIALS');

    const locked = await withAdminDb(async (c) => {
      const q = await c.query<{ mins: string }>(
        `SELECT round(extract(epoch FROM (locked_until - now())) / 60)::text AS mins
           FROM idn.app_user WHERE id = $1`,
        [lockUserId],
      );
      return Number(q.rows[0]!.mins);
    });
    expect(locked).toBeGreaterThanOrEqual(14);
    expect(locked).toBeLessThanOrEqual(15);
  });

  it('tài khoản không tồn tại trả về đúng một lỗi giống hệt tài khoản sai mật khẩu', async () => {
    const agent = await http(app);
    const ghost = await agent
      .post('/auth/login')
      .send({ login: 'khong-he-ton-tai', password: 'x'.repeat(12) });
    const wrong = await agent.post('/auth/login').send({ login: 'tdv01', password: 'sai-mat-khau' });

    expect(ghost.status).toBe(wrong.status);
    expect(ghost.body).toEqual(wrong.body);
  });
});

describe('AUTH-03 access token đã hết hạn', () => {
  it('trả 401 TOKEN_EXPIRED', async () => {
    const agent = await http(app);
    const res = await agent
      .get('/auth/me')
      .set('Authorization', `Bearer ${expiredAccessToken(deactUserId)}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('refresh token vẫn đổi được access token mới', async () => {
    const lg = await login(app, 'tdv01', SEED_PW);
    const agent = await http(app);
    const res = await agent.post('/auth/refresh').send({ refreshToken: lg.body.refreshToken });
    expect(res.status).toBe(200);

    const me = await agent.get('/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('tdv01');
  });
});

describe('AUTH-04 dùng lại refresh token đã xoay vòng', () => {
  it('thu hồi toàn bộ họ token của phiên đó', async () => {
    const agent = await http(app);
    const first = await login(app, 'tdv02', SEED_PW);
    const old = first.body.refreshToken as string;

    const rotated = await agent.post('/auth/refresh').send({ refreshToken: old });
    expect(rotated.status).toBe(200);
    const fresh = rotated.body.refreshToken as string;

    const replay = await agent.post('/auth/refresh').send({ refreshToken: old });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_REUSED');

    // Token vừa xoay ra cũng chết theo: không phân biệt được ai là kẻ trộm nên
    // cắt cả hai, buộc chính chủ đăng nhập lại.
    const afterFamilyRevoke = await agent.post('/auth/refresh').send({ refreshToken: fresh });
    expect(afterFamilyRevoke.status).toBe(401);
  });
});

describe('AUTH-05 token bị sửa chữ ký', () => {
  it('trả 401 và không lộ chi tiết lỗi xác minh', async () => {
    const token = await accessTokenFor(app, 'tdv01', SEED_PW);
    const [h, p, s] = token.split('.') as [string, string, string];
    const tampered = `${h}.${p}.${s.slice(0, -2)}${s.slice(-2) === 'AA' ? 'BB' : 'AA'}`;

    const agent = await http(app);
    const res = await agent.get('/auth/me').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
    expect(JSON.stringify(res.body)).not.toMatch(/chữ ký|signature|RSA/i);
  });

  it('không nhận payload bị sửa dù giữ nguyên chữ ký cũ', async () => {
    const token = await accessTokenFor(app, 'tdv01', SEED_PW);
    const [h, p, s] = token.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    claims.role = 'QUAN_TRI';
    const forged = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');

    const agent = await http(app);
    const res = await agent.get('/auth/me').set('Authorization', `Bearer ${h}.${forged}.${s}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });
});

describe('AUTH-06 đăng xuất rồi dùng lại token cũ', () => {
  it('refresh token không dùng lại được', async () => {
    const agent = await http(app);
    const lg = await login(app, 'kt01', SEED_PW);
    const rt = lg.body.refreshToken as string;

    const out = await agent.post('/auth/logout').send({ refreshToken: rt });
    expect(out.status).toBe(204);

    const res = await agent.post('/auth/refresh').send({ refreshToken: rt });
    expect(res.status).toBe(401);
  });
});

describe('AUTH-07 vô hiệu hoá tài khoản khi token còn hạn', () => {
  it('vô hiệu hoá qua API thì chặn ngay, không chờ hết TTL', async () => {
    const agent = await http(app);
    const victim = await accessTokenFor(app, DEACT_USER, SEED_PW);
    expect((await agent.get('/auth/me').set('Authorization', `Bearer ${victim}`)).status).toBe(200);

    const adminToken = await accessTokenFor(app, 'admin01', SEED_PW);
    // Gõ lại TÊN ĐĂNG NHẬP để chặn bấm nhầm dòng — bắt buộc từ `0032`, và đổi
    // từ họ tên sang tên đăng nhập ở `0036` (họ tên không duy nhất).
    const off = await agent
      .post(`/admin/users/${deactUserId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmUsername: DEACT_USER });
    expect(off.status, JSON.stringify(off.body)).toBe(200);

    const after = await agent.get('/auth/me').set('Authorization', `Bearer ${victim}`);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('ACCOUNT_DISABLED');

    await agent
      .post(`/admin/users/${deactUserId}/activate-account`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('đổi thẳng dưới CSDL thì cửa sổ trễ bị chặn trên bởi TTL 60 giây', async () => {
    const agent = await http(app);
    const victim = await accessTokenFor(app, DEACT_USER, SEED_PW);
    expect((await agent.get('/auth/me').set('Authorization', `Bearer ${victim}`)).status).toBe(200);

    // Đi vòng ngoài API nên cache không bị xoá — đây là kịch bản xấu nhất.
    await withAdminDb((c) =>
      c.query(`UPDATE idn.app_user SET is_active = false WHERE id = $1`, [deactUserId]),
    );
    expect((await agent.get('/auth/me').set('Authorization', `Bearer ${victim}`)).status).toBe(200);

    // Cửa sổ trễ chính là TTL còn lại của khoá cache. Kiểm trực tiếp giá trị đó
    // thay vì ngồi chờ 60 giây trong test.
    const ttl = await redis.ttl(`idn:acct:${deactUserId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    expect(CONFIG.accountCacheTtlSec).toBe(60);

    // Hết TTL, cache đọc lại từ CSDL và chặn.
    await redis.del(`idn:acct:${deactUserId}`);
    const after = await agent.get('/auth/me').set('Authorization', `Bearer ${victim}`);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('ACCOUNT_DISABLED');

    await withAdminDb((c) =>
      c.query(`UPDATE idn.app_user SET is_active = true WHERE id = $1`, [deactUserId]),
    );
    await redis.del(`idn:acct:${deactUserId}`);
  });
});

describe('AUTH-14 quản trị hệ thống ngoài luồng duyệt', () => {
  it('admin01 gọi được nhóm route quản trị', async () => {
    const agent = await http(app);
    const t = await accessTokenFor(app, 'admin01', SEED_PW);
    const res = await agent.get('/admin/users').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });

  it('vai trò khác gọi route quản trị thì 403', async () => {
    const agent = await http(app);
    const t = await accessTokenFor(app, 'sa01', SEED_PW);
    const res = await agent.get('/admin/users').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });
});

describe('AUTH-21 API nội bộ giữa hai service', () => {
  it('không kèm token dịch vụ thì 401', async () => {
    const agent = await http(app);
    const res = await agent.get(`/internal/scope/${deactUserId}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SERVICE_TOKEN_MISSING');
  });

  it('token người dùng KHÔNG dùng thay được token dịch vụ', async () => {
    const agent = await http(app);
    const userToken = await accessTokenFor(app, 'sa01', SEED_PW);
    const res = await agent
      .get(`/internal/scope/${deactUserId}`)
      .set('X-Service-Token', userToken);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('token dịch vụ đúng audience thì gọi được và trả đúng phạm vi', async () => {
    const agent = await http(app);
    const sa = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'sa01'`,
      );
      return q.rows[0]!.id;
    });
    const res = await agent
      .get(`/internal/scope/${sa}`)
      .set('X-Service-Token', serviceToken());
    expect(res.status).toBe(200);
    // ĐÚNG MỘT người — chính mình (`0031`).
    //
    // Trước đây câu này trả về sáu người (sa01 + hai kế toán + ba TDV) vì phạm
    // vi suy từ cây tổ chức. Cây đã gỡ; phần "tôi liên quan tới hồ sơ nào" nằm
    // ở bốn cột người trên `pol.policy`, không ở đây nữa.
    expect(res.body.scopeUserIds).toEqual([sa]);
  });
});

// =============================================================================
// Người dùng tự sửa thông tin của mình
// =============================================================================

describe('PATCH /auth/me', () => {
  /**
   * Trước lượt này, đổi họ tên phải nhờ Quản trị hệ thống. Cái đáng kiểm không
   * phải là "sửa được" — mà là ba thứ KHÔNG sửa được, vì mỗi thứ hỏng theo một
   * kiểu riêng: đổi email là chuyển đường khôi phục mật khẩu sang hộp thư khác,
   * đổi username là làm nhật ký kiểm toán mất tính đối chứng, đổi vai trò là tự
   * nâng quyền.
   *
   * Dùng tài khoản RIÊNG của tệp này chứ không mượn `tdv01`: các tệp test chạy
   * song song trên cùng một CSDL, và họ tên của `tdv01` đi vào read-model báo
   * cáo — đổi nó giữa chừng là gài một lần đỏ ngẫu nhiên cho tệp khác.
   */
  const ME_USER = `${TEST_PREFIX}_me`;
  let token = '';

  beforeAll(async () => {
    const hash = await hashPassword(SEED_PW);
    await withAdminDb(async (c) => {
      await c.query(
        `INSERT INTO idn.app_user (username, email, full_name, role, password_hash,
                                   activated_at, email_verified_at)
         VALUES ($1, $1 || '@csbh.test', 'Ten Ban Dau', 'TDV', $2, now(), now())`,
        [ME_USER, hash],
      );
    });
    token = await accessTokenFor(app, ME_USER, SEED_PW);
  });

  const sua = async (body: object, t = token) =>
    (await http(app)).patch('/auth/me').set('Authorization', `Bearer ${t}`).send(body);

  const doc = async (t = token) =>
    (await (await http(app)).get('/auth/me').set('Authorization', `Bearer ${t}`)).body;

  it('sửa được họ tên của chính mình', async () => {
    const res = await sua({ fullName: 'Ten Vua Doi' });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Ten Vua Doi');

    // Đọc lại từ máy chủ, không tin phản hồi của chính lời gọi vừa rồi.
    expect((await doc()).fullName).toBe('Ten Vua Doi');
  });

  it('KHÔNG đổi được email, tên tài khoản hay vai trò dù gửi kèm', async () => {
    const truoc = await doc();
    const res = await sua({
      fullName: truoc.fullName,
      email: 'ke-gian@csbh.test',
      username: 'admin99',
      role: 'QUAN_TRI',
    });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(truoc.email);
    expect(res.body.username).toBe(truoc.username);
    expect(res.body.role).toBe(truoc.role);
  });

  it('họ tên rỗng hoặc một ký tự thì 400', async () => {
    for (const v of ['', ' ', 'A']) {
      expect((await sua({ fullName: v })).status, `"${v}" đáng lẽ bị chặn`).toBe(400);
    }
  });

  it('không có token thì 401', async () => {
    const res = await (await http(app)).patch('/auth/me').send({ fullName: 'X' });
    expect(res.status).toBe(401);
  });

  it('tài khoản đang buộc đổi mật khẩu thì KHÔNG dùng được', async () => {
    // `must_change_password` chỉ mở đúng một đường là đổi mật khẩu. Mở thêm một
    // đường ghi nào ở trạng thái đó là mở đúng thứ nó dựng ra để đóng.
    await withAdminDb((c) =>
      c.query(`UPDATE idn.app_user SET must_change_password = true WHERE username = $1`, [ME_USER]),
    );
    try {
      const t = await accessTokenFor(app, ME_USER, SEED_PW);
      expect((await sua({ fullName: 'Ten Moi' }, t)).status).toBe(403);
    } finally {
      await withAdminDb((c) =>
        c.query(`UPDATE idn.app_user SET must_change_password = false WHERE username = $1`, [
          ME_USER,
        ]),
      );
    }
  });

  it('tài khoản bị vô hiệu hoá thì 401, không phải "ok" cho một lần ghi không xảy ra', async () => {
    const t = await accessTokenFor(app, ME_USER, SEED_PW);
    await withAdminDb((c) =>
      c.query(`UPDATE idn.app_user SET is_active = false WHERE username = $1`, [ME_USER]),
    );
    try {
      expect((await sua({ fullName: 'Ten Khac' }, t)).status).toBe(401);
    } finally {
      await withAdminDb((c) =>
        c.query(`UPDATE idn.app_user SET is_active = true WHERE username = $1`, [ME_USER]),
      );
    }
  });
});
