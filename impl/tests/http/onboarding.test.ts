/**
 * ONB-01 … ONB-15 — tạo tài khoản bằng email, kích hoạt, bắt buộc đổi mật khẩu.
 * YCNV muc 2.8.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { assertSafeMailConfig, UnsafeMailConfigError } from '@csbh/http-kit';
import { Mailer as IdentityMailer } from '@csbh/identity/testing';
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
  // `fullName` thêm ở `0049`: ô tìm mới khớp theo họ tên, nên ca kiểm thử phải
  // đặt được tên cụ thể thay vì nhận chuỗi mặc định của mọi tài khoản.
  over: Partial<{
    username: string;
    email: string;
    role: string;
    defaultPassword: string;
    fullName: string;
  }> = {},
) => {
  const base = newUser();
  const agent = await http(app);
  const body = {
    username: base.username,
    email: base.email,
    fullName: 'Nguoi dung thu nghiem',
    role: 'TDV',
    approverUsername: 'tbp01',
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

describe('ONB-01 quản trị tạo tài khoản, KHÔNG có mật khẩu mặc định', () => {
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
        .send({ ...newUser(), fullName: 'X', role: 'TDV' });
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

  it('nói RÕ trùng cái nào, và nói đúng việc phải làm', async () => {
    // Không có `message` thì giao diện rơi xuống câu mặc định cho 409 — "Dữ liệu
    // vừa được người khác thay đổi, hãy tải lại rồi thử lại" — đúng cho tranh
    // chấp ghi đồng thời và hoàn toàn sai ở đây: tải lại bao nhiêu lần thì tên
    // tài khoản đó vẫn đang có người dùng. Việc phải làm là ĐỔI.
    const first = await createUser();

    const trungTen = await createUser({ username: first.username });
    expect(trungTen.res.status).toBe(409);
    expect(trungTen.res.body.code).toBe('USERNAME_DUPLICATE');
    expect(trungTen.res.body.message).toContain(first.username);
    expect(trungTen.res.body.message).not.toMatch(/tải lại/i);

    const trungMail = await createUser({ email: first.email });
    expect(trungMail.res.body.code).toBe('EMAIL_DUPLICATE');
    expect(trungMail.res.body.message).toContain(first.email);

    // Trùng cả hai thì báo cả hai — sửa một cái rồi vẫn 409 là hai lượt bực mình
    // liên tiếp cho cùng một việc.
    const trungCa = await createUser({ username: first.username, email: first.email });
    expect(trungCa.res.body.message).toContain(first.username);
    expect(trungCa.res.body.message).toContain(first.email);
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

  it('thư KHÔNG chứa mật khẩu nào', async () => {
    const { email } = await createUser();
    const mail = await mailpitFind(email);
    // Không còn mật khẩu mặc định nào để lỡ tay đưa vào thư — nhưng vẫn kiểm,
    // vì một bản sửa sau này có thể lại nhét mật khẩu sinh tự động vào đây.
    expect(mail!.text).not.toMatch(/m\u1eadt kh\u1ea9u l\u00e0|password:/i);
  });
});

describe('ONB-05 · ONB-06 tài khoản chưa kích hoạt thì KHÔNG đăng nhập được', () => {
  it('không mật khẩu nào vào được — liên kết trong thư là đường duy nhất', async () => {
    const { username, email } = await createUser();

    // Vài phỏng đoán quen thuộc, kể cả những chuỗi mà một bản "mật khẩu mặc
    // định sinh tự động" hay rơi vào.
    for (const doan of ['MacDinh@2026', 'Test@1234', ' ', username, email]) {
      expect((await login(app, username, doan)).status, doan).toBe(401);
    }

    // Mật khẩu rỗng dừng ở tầng kiểm dữ liệu vào (`secret(1)`), trước cả khi
    // chạm tới tài khoản — 400 chứ không phải 401, và câu trả lời đó không phụ
    // thuộc vào việc tài khoản có thật hay không nên không lộ gì.
    expect((await login(app, username, '')).status).toBe(400);
  });

  it('CSDL không lưu mật khẩu dùng được nào cho tài khoản mới', async () => {
    const { res } = await createUser();
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ password_hash: string; must_change_password: boolean }>(
        `SELECT password_hash, must_change_password FROM idn.app_user WHERE id = $1`,
        [res.body.id],
      );
      return q.rows[0]!;
    });
    // Có băm — cột NOT NULL — nhưng là băm của một chuỗi ngẫu nhiên 32 byte mà
    // không ai biết. Để cột nhận NULL thì mọi đường đăng nhập phải thêm một
    // nhánh kiểm, và quên một nhánh là một lỗ xác thực.
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash.length).toBeGreaterThan(40);
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

    // Liên kết đã dùng xong; không còn đường nào khác vào tài khoản.
    expect((await login(app, username, 'MacDinh@2026')).status).toBe(401);
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

describe('ONB-14 không còn đường kích hoạt nào ngoài email', () => {
  it('đổi mật khẩu đòi mật khẩu hiện tại, mà tài khoản mới không có mật khẩu nào', async () => {
    // Trước đây quản trị bàn giao mật khẩu mặc định ngoài luồng, người dùng
    // đăng nhập rồi tự đổi — tài khoản hoạt động mà email chưa từng được xác
    // nhận. Bỏ mật khẩu mặc định là bỏ luôn nhánh đó: KHÔNG có cách nào vào
    // được tài khoản mà không đi qua hộp thư.
    const { username, res } = await createUser();
    expect((await login(app, username, 'MacDinh@2026')).status).toBe(401);

    const listed = await http(app).then((a) =>
      a.get('/admin/users').set('Authorization', `Bearer ${adminToken}`),
    );
    const row = (
      listed.body.items as { id: string; activatedAt: string | null; emailVerifiedAt: string | null }[]
    ).find((r) => r.id === res.body.id);
    expect(row!.activatedAt).toBeNull();
    expect(row!.emailVerifiedAt).toBeNull();
  });
});

describe('ONB-16 SMTP hỏng không làm mất tài khoản vừa tạo', () => {
  it('vẫn trả 201, báo rõ thư chưa gửi được, và tài khoản có thật', async () => {
    // Thư gửi SAU khi transaction đã commit. Ném ra thì quản trị nhận 500 và
    // không biết mình vừa tạo xong hay chưa — rồi thử tạo lại và nhận 409.
    const mailer = app.get(IdentityMailer);
    const that = mailer.sendInvite.bind(mailer);
    mailer.sendInvite = async () => {
      throw new Error('SMTP giả vờ hỏng');
    };

    let res;
    try {
      ({ res } = await createUser());
    } finally {
      mailer.sendInvite = that;
    }

    expect(res!.status).toBe(201);
    expect(res!.body.inviteMailSent).toBe(false);
    expect(res!.body.status).toBe('CHO_KICH_HOAT');

    // Tài khoản có thật, và đường cứu là "Gửi lại thư mời" — nút đó chỉ hiện
    // với tài khoản chưa kích hoạt, nên trạng thái phải đúng như trên.
    const co = await withAdminDb(async (c) => {
      const q = await c.query(`SELECT 1 FROM idn.app_user WHERE id = $1`, [res!.body.id]);
      return q.rowCount;
    });
    expect(co).toBe(1);
  });

  it('gửi được thì cờ là true — cờ phải nói lên điều gì đó', async () => {
    const { res } = await createUser();
    expect(res.body.inviteMailSent).toBe(true);
  });
});

describe('ONB-17 identity dùng CHUNG chốt an toàn cấu hình thư với notification', () => {
  it('production trỏ vào hộp thư giả — chặn', () => {
    // Trước P14a, identity đọc `SMTP_HOST` còn deploy đặt `MAIL_HOST`, nên nó
    // bỏ qua cấu hình triển khai và dùng mặc định viết cứng `mailpit:1025`.
    // Trên máy chủ thật, mọi thư kích hoạt hỏng — mà từ P13 thư kích hoạt là
    // đường DUY NHẤT để tài khoản có mật khẩu.
    expect(() => assertSafeMailConfig({ NODE_ENV: 'production', MAIL_HOST: 'mailpit' })).toThrow(
      UnsafeMailConfigError,
    );
  });

  it('cấu hình thư của identity đọc MAIL_HOST, không phải SMTP_HOST', async () => {
    const { loadMailConfig } = await import('@csbh/http-kit');
    const cfg = loadMailConfig({ MAIL_HOST: 'mailpit', MAIL_PORT: '2525' } as NodeJS.ProcessEnv);
    expect(cfg.host).toBe('mailpit');
    expect(cfg.port).toBe(2525);
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

// =============================================================================
// `0049` — tìm tài khoản theo HỌ TÊN, ở phía máy chủ (N-05, muc 11.3)
// =============================================================================

describe('`0049` GET /admin/users?q= tìm theo họ tên', () => {
  const tenCua = (r: { body: { items: { fullName: string }[] } }) =>
    r.body.items.map((x) => x.fullName);

  const timKiem = async (q: string) =>
    (await http(app))
      .get(`/admin/users?q=${encodeURIComponent(q)}&limit=200`)
      .set('Authorization', `Bearer ${adminToken}`);

  it('gõ KHÔNG DẤU vẫn ra tên có dấu', async () => {
    const ten = `Nguyễn Thị Bưởi ${Date.now()}`;
    await createUser({ fullName: ten });
    expect(tenCua(await timKiem('nguyen thi buoi'))).toContain(ten);
  });

  it('chữ đ tìm được bằng d', async () => {
    const ten = `Đỗ Đình Đạt ${Date.now()}`;
    await createUser({ fullName: ten });
    expect(tenCua(await timKiem('do dinh dat'))).toContain(ten);
  });

  it('khớp CHUỖI CON — gõ mỗi tên riêng cũng ra', async () => {
    const ten = `Trần Mỹ Hạnh ${Date.now()}`;
    await createUser({ fullName: ten });
    expect(tenCua(await timKiem('my hanh'))).toContain(ten);
  });

  it('KHÔNG khớp tên tài khoản và KHÔNG khớp email', async () => {
    /*
     * Khách hàng chốt ô tìm chỉ ăn họ tên. Khớp cả email thì màn hình quản trị
     * thành chỗ dò địa chỉ thư của cả công ty — một đường rò dữ liệu mở ra bằng
     * một dòng SQL, và không ai nhận ra vì nó chỉ làm ô tìm "tiện hơn".
     */
    const { username, email } = await createUser({ fullName: 'Khong Trung Gi Ca' });
    expect((await timKiem(username)).body.items).toHaveLength(0);
    expect((await timKiem(email)).body.items).toHaveLength(0);
  });

  it('`q` rỗng KHÔNG phải điều kiện lọc', async () => {
    await createUser();
    for (const rong of ['', '   ']) {
      const r = await timKiem(rong);
      expect(r.body.items.length, `q=${JSON.stringify(rong)}`).toBeGreaterThan(0);
    }
  });

  it('`total` là tổng SAU KHI LỌC, và phân trang cắt trên tổng ấy', async () => {
    const dau = `Zz${Date.now()}`;
    for (const i of [1, 2, 3]) await createUser({ fullName: `${dau} Nguoi ${i}` });

    const het = await timKiem(dau);
    expect(het.body.total).toBe(3);

    const trang1 = await (await http(app))
      .get(`/admin/users?q=${encodeURIComponent(dau)}&limit=2&offset=0`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(trang1.body.items).toHaveLength(2);
    // `total` KHÔNG đổi theo cỡ trang — thanh phân trang đọc con số này để nói
    // "trang 1/2", và nó phải là tổng của cả kết quả lọc chứ không phải của trang.
    expect(trang1.body.total).toBe(3);
  });
});
