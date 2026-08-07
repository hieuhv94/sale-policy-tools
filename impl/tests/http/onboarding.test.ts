/**
 * ONB-01 … ONB-15 — tạo tài khoản bằng email, kích hoạt, bắt buộc đổi mật khẩu.
 * YCNV muc 2.8.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  accessTokenFor,
  activationTokenFrom,
  boot,
  cleanupTestUsers,
  http,
  login,
  mailpitClear,
  mailpitCountTo,
  mailpitFind,
  TEST_PREFIX,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const DEFAULT_PW = 'MacDinh@2026';
const NEW_PW = 'MatKhauMoi@2026';

let app: INestApplication;
let adminToken = '';
let n = 0;

/** Mỗi test một tài khoản riêng — không test nào phụ thuộc dấu vết của test khác. */
const newUser = () => {
  const u = `${TEST_PREFIX}_onb${++n}`;
  return { username: u, email: `${u}@csbh.test` };
};

const createUser = async (
  over: Partial<{ username: string; email: string; role: string; defaultPassword: string }> = {},
) => {
  const base = newUser();
  const agent = await http(app);
  const body = {
    username: base.username,
    email: base.email,
    fullName: 'Nguoi dung thu nghiem',
    role: 'TDV',
    defaultPassword: DEFAULT_PW,
    departmentCode: 'BP01',
    parentUsername: 'kt01',
    ...over,
  };
  const res = await agent
    .post('/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
  return { res, ...base, ...over };
};

beforeAll(async () => {
  await cleanupTestUsers();
  await mailpitClear();
  app = await boot();
  adminToken = await accessTokenFor(app, 'admin01', SEED_PW);
});

afterAll(async () => {
  await app?.close();
  await cleanupTestUsers();
  await mailpitClear();
});

describe('ONB-01 quản trị tạo tài khoản kèm mật khẩu mặc định', () => {
  it('tài khoản ở trạng thái chờ kích hoạt và có token dùng một lần', async () => {
    const { res, username } = await createUser();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CHO_KICH_HOAT');

    const row = await withAdminDb(async (c) => {
      const q = await c.query<{
        must_change_password: boolean;
        activated_at: Date | null;
        email_verified_at: Date | null;
        tokens: string;
        hours: string;
      }>(
        `SELECT u.must_change_password, u.activated_at, u.email_verified_at,
                count(t.id)::text AS tokens,
                round(extract(epoch FROM (min(t.expires_at) - min(t.created_at))) / 3600)::text AS hours
           FROM idn.app_user u LEFT JOIN idn.activation_token t ON t.user_id = u.id
          WHERE u.username = $1
          GROUP BY u.id`,
        [username],
      );
      return q.rows[0]!;
    });
    expect(row.must_change_password).toBe(true);
    expect(row.activated_at).toBeNull();
    expect(row.email_verified_at).toBeNull();
    expect(Number(row.tokens)).toBe(1);
    expect(Number(row.hours)).toBe(72);
  });
});

describe('ONB-02 chỉ quản trị hệ thống tạo được tài khoản', () => {
  it('vai trò khác gọi thì 403 — không có đăng ký công khai', async () => {
    const agent = await http(app);
    for (const who of ['sa01', 'kt01', 'tbp01', 'tdv01', 'bld01']) {
      const t = await accessTokenFor(app, who, SEED_PW);
      const res = await agent
        .post('/admin/users')
        .set('Authorization', `Bearer ${t}`)
        .send({ ...newUser(), fullName: 'X', role: 'TDV', defaultPassword: DEFAULT_PW });
      expect(res.status, `${who} đáng lẽ bị chặn`).toBe(403);
    }
  });

  it('không có token thì 401', async () => {
    const agent = await http(app);
    const res = await agent.post('/admin/users').send({ fullName: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('ONB-03 email trùng', () => {
  it('trả 409 và không gửi thêm thư nào', async () => {
    const first = await createUser();
    expect(first.res.status).toBe(201);
    const before = await mailpitCountTo(first.email);

    const again = await createUser({ email: first.email });
    expect(again.res.status).toBe(409);
    expect(again.res.body.code).toBe('EMAIL_DUPLICATE');
    expect(await mailpitCountTo(first.email)).toBe(before);
  });

  it('chặn cả khi chỉ khác hoa thường', async () => {
    const first = await createUser();
    const again = await createUser({ email: first.email.toUpperCase() });
    expect(again.res.status).toBe(409);
  });
});

describe('ONB-04 email mời', () => {
  it('đúng một thư tới đúng địa chỉ, có liên kết kích hoạt', async () => {
    const { email } = await createUser();
    expect(await mailpitCountTo(email)).toBe(1);
    const mail = await mailpitFind(email);
    expect(mail?.subject).toContain('Kích hoạt tài khoản');
    expect(mail!.text).toMatch(/kich-hoat\?token=/);
    expect(mail!.text).toContain('72 giờ');
  });

  it('thư KHÔNG chứa mật khẩu mặc định', async () => {
    const { email } = await createUser();
    const mail = await mailpitFind(email);
    expect(mail!.text).not.toContain(DEFAULT_PW);
  });
});

describe('ONB-05 · ONB-06 đăng nhập bằng mật khẩu mặc định', () => {
  it('vào được nhưng phiên bị giới hạn đúng màn hình đổi mật khẩu', async () => {
    const { username } = await createUser();
    const lg = await login(app, username, DEFAULT_PW);
    expect(lg.status).toBe(200);
    expect(lg.body.mustChangePassword).toBe(true);

    const agent = await http(app);
    const token = lg.body.accessToken as string;

    // Được phép: xem thông tin bản thân và đổi mật khẩu.
    expect((await agent.get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    // Bị chặn: mọi thứ còn lại.
    const blocked = await agent.get('/admin/users').set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
});

describe('ONB-07 kích hoạt qua liên kết trong email', () => {
  it('đặt mật khẩu mới thì tài khoản hoạt động và email được xác nhận', async () => {
    const { username, email } = await createUser();
    const mail = await mailpitFind(email);
    const token = activationTokenFrom(mail!.text);

    const agent = await http(app);
    const act = await agent.post('/auth/activate').send({ token, newPassword: NEW_PW });
    expect(act.status).toBe(200);
    expect(act.body.emailVerified).toBe(true);

    const lg = await login(app, username, NEW_PW);
    expect(lg.status).toBe(200);
    expect(lg.body.mustChangePassword).toBe(false);

    // Quyền đầy đủ theo vai trò — không còn bị chặn bởi PASSWORD_CHANGE_REQUIRED.
    const me = await agent.get('/auth/me').set('Authorization', `Bearer ${lg.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.emailVerifiedAt).not.toBeNull();
    expect(me.body.activatedAt).not.toBeNull();

    // Mật khẩu mặc định chết hẳn.
    expect((await login(app, username, DEFAULT_PW)).status).toBe(401);
  });
});

describe('ONB-08 dùng lại liên kết đã dùng', () => {
  it('trả 400 TOKEN_USED', async () => {
    const { email } = await createUser();
    const token = activationTokenFrom((await mailpitFind(email))!.text);
    const agent = await http(app);

    expect((await agent.post('/auth/activate').send({ token, newPassword: NEW_PW })).status).toBe(200);
    const again = await agent
      .post('/auth/activate')
      .send({ token, newPassword: 'MatKhauKhac@2026' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TOKEN_USED');
  });
});

describe('ONB-09 liên kết quá 72 giờ', () => {
  it('trả 400 TOKEN_EXPIRED', async () => {
    const { email, username } = await createUser();
    const token = activationTokenFrom((await mailpitFind(email))!.text);

    await withAdminDb((c) =>
      c.query(
        `UPDATE idn.activation_token SET expires_at = now() - interval '1 minute'
          WHERE user_id = (SELECT id FROM idn.app_user WHERE username = $1)`,
        [username],
      ),
    );

    const agent = await http(app);
    const res = await agent.post('/auth/activate').send({ token, newPassword: NEW_PW });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

describe('ONB-10 gửi lại lời mời', () => {
  it('liên kết cũ mất hiệu lực, chỉ liên kết mới nhất dùng được', async () => {
    const { res, email } = await createUser();
    const oldToken = activationTokenFrom((await mailpitFind(email))!.text);

    const agent = await http(app);
    const resend = await agent
      .post(`/admin/users/${res.body.id}/resend-invite`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resend.status).toBe(200);
    expect(await mailpitCountTo(email)).toBe(2);

    const old = await agent.post('/auth/activate').send({ token: oldToken, newPassword: NEW_PW });
    expect(old.status).toBe(400);
    expect(old.body.code).toBe('TOKEN_REVOKED');

    // Thư mới nhất nằm ở đầu danh sách Mailpit.
    const newToken = activationTokenFrom((await mailpitFind(email))!.text);
    expect(newToken).not.toBe(oldToken);
    const ok = await agent.post('/auth/activate').send({ token: newToken, newPassword: NEW_PW });
    expect(ok.status).toBe(200);
  });
});

describe('ONB-11 · ONB-12 điều kiện mật khẩu mới', () => {
  it('trùng mật khẩu mặc định thì bị từ chối', async () => {
    const { email } = await createUser();
    const token = activationTokenFrom((await mailpitFind(email))!.text);
    const agent = await http(app);
    const res = await agent.post('/auth/activate').send({ token, newPassword: DEFAULT_PW });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_WEAK');
    expect(res.body.problems).toContain('SAME_AS_CURRENT');
  });

  it('quá ngắn hoặc thiếu chữ số thì báo rõ thiếu điều kiện nào', async () => {
    const { email } = await createUser();
    const token = activationTokenFrom((await mailpitFind(email))!.text);
    const agent = await http(app);

    const short = await agent.post('/auth/activate').send({ token, newPassword: 'Ab1' });
    expect(short.status).toBe(400);
    expect(short.body.problems).toContain('TOO_SHORT');

    const noDigit = await agent
      .post('/auth/activate')
      .send({ token, newPassword: 'KhongCoChuSoNao' });
    expect(noDigit.status).toBe(400);
    expect(noDigit.body.problems).toEqual(['NEEDS_DIGIT']);
    expect(noDigit.body.message).toContain('chữ số');
  });
});

describe('ONB-13 đổi mật khẩu thu hồi mọi phiên đang mở', () => {
  it('phiên cũ chết cả access token lẫn refresh token', async () => {
    const { username, email } = await createUser();
    const token = activationTokenFrom((await mailpitFind(email))!.text);
    const agent = await http(app);
    await agent.post('/auth/activate').send({ token, newPassword: NEW_PW });

    // Hai phiên song song, ví dụ máy tính và điện thoại.
    const s1 = await login(app, username, NEW_PW);
    const s2 = await login(app, username, NEW_PW);
    expect((await agent.get('/auth/me').set('Authorization', `Bearer ${s1.body.accessToken}`)).status).toBe(200);

    const changed = await agent
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${s2.body.accessToken}`)
      .send({ currentPassword: NEW_PW, newPassword: 'DoiLanNua@2026' });
    expect(changed.status).toBe(200);

    // Access token của phiên kia chết ngay, không sống thêm 15 phút.
    const stale = await agent.get('/auth/me').set('Authorization', `Bearer ${s1.body.accessToken}`);
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe('TOKEN_STALE');

    const refreshed = await agent
      .post('/auth/refresh')
      .send({ refreshToken: s1.body.refreshToken });
    expect(refreshed.status).toBe(401);
  });
});

describe('ONB-14 kích hoạt không qua email', () => {
  it('tài khoản hoạt động nhưng email vẫn chưa được xác nhận', async () => {
    const { username, res } = await createUser();
    const lg = await login(app, username, DEFAULT_PW);
    const agent = await http(app);

    const changed = await agent
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${lg.body.accessToken}`)
      .send({ currentPassword: DEFAULT_PW, newPassword: NEW_PW });
    expect(changed.status).toBe(200);
    expect(changed.body.emailVerified).toBe(false);

    const full = await login(app, username, NEW_PW);
    expect(full.body.mustChangePassword).toBe(false);

    const listed = await agent.get('/admin/users').set('Authorization', `Bearer ${adminToken}`);
    const row = (listed.body as { id: string; activatedAt: string | null; emailVerifiedAt: string | null }[])
      .find((r) => r.id === res.body.id);
    expect(row!.activatedAt).not.toBeNull();
    // Đây là điểm khác nhau giữa hai cột: chưa ai chứng minh hộp thư có thật.
    expect(row!.emailVerifiedAt).toBeNull();
  });
});

describe('ONB-15 không lưu bí mật dạng thô', () => {
  it('bảng người dùng và bảng token chỉ chứa bản băm', async () => {
    const { username, email } = await createUser();
    const rawToken = activationTokenFrom((await mailpitFind(email))!.text);

    const rows = await withAdminDb(async (c) => {
      const q = await c.query<{ password_hash: string; token_hash: string }>(
        `SELECT u.password_hash, t.token_hash
           FROM idn.app_user u JOIN idn.activation_token t ON t.user_id = u.id
          WHERE u.username = $1`,
        [username],
      );
      return q.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.password_hash).not.toContain(DEFAULT_PW);
    expect(rows[0]!.password_hash.startsWith('scrypt$')).toBe(true);
    expect(rows[0]!.token_hash).not.toContain(rawToken);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('CSDL từ chối lưu chuỗi token thô kể cả khi mã nguồn lỡ tay', async () => {
    const { username } = await createUser();
    const err = await withAdminDb(async (c) => {
      try {
        await c.query(
          `INSERT INTO idn.activation_token (user_id, token_hash, expires_at)
           VALUES ((SELECT id FROM idn.app_user WHERE username = $1), 'chuoi-tho-khong-phai-bam', now())`,
          [username],
        );
        return undefined;
      } catch (e) {
        return e as { constraint?: string };
      }
    });
    expect(err?.constraint).toBe('token_hash_must_be_sha256_hex');
  });
});
