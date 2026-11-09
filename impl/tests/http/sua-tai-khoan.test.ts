/**
 * `0277` — Quản trị sửa tài khoản CHƯA kích hoạt: họ tên, tên tài khoản, email, vai trò.
 *
 * Luật cần canh (mỗi vế một ca, và mỗi ca được phá lại):
 *   1. Chưa kích hoạt → sửa được cả bốn trường.
 *   2. Sửa là THU HỒI thư mời cũ rồi GỬI thư mới tới email HIỆN CÓ (kể cả khi chỉ đổi họ tên).
 *   3. Không đổi gì thì không thu hồi, không gửi thư.
 *   4. Đã kích hoạt → chỉ họ tên; trường khác đổi thì 409 và không đụng gì.
 *   5. Trùng email/tên của NGƯỜI KHÁC → 409, thư cũ còn nguyên; gửi lại chính email của mình thì được.
 *   6. Có dòng nhật ký `USER_UPDATED` chỉ mang trường đã đổi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  accessTokenFor,
  activationTokenFrom,
  boot,
  cleanupTestUsers,
  http,
  mailpitClear,
  mailpitCountTo,
  mailpitFind,
  TEST_PREFIX,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const MAT_KHAU_MOI = 'MatKhauMoi@2026';

let app: INestApplication;
let adminToken = '';
let n = 0;

const tenMoi = () => `${TEST_PREFIX}_sua${++n}`;

const tao = async (over: Record<string, unknown> = {}) => {
  const username = tenMoi();
  const email = `${username}@csbh.test`;
  const res = await (await http(app))
    .post('/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username, email, fullName: 'Nguoi dung thu nghiem', role: 'TDV', ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { id: res.body.id as string, username, email };
};

const sua = async (id: string, body: object, token = adminToken) =>
  (await http(app)).patch(`/admin/users/${id}`).set('Authorization', `Bearer ${token}`).send(body);

const doc = async (id: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{
      username: string;
      email: string;
      full_name: string;
      role: string;
      activated_at: Date | null;
    }>(
      `SELECT username, email, full_name, role::text AS role, activated_at
         FROM idn.app_user WHERE id = $1`,
      [id],
    );
    return r.rows[0]!;
  });

const kichHoat = async (token: string) =>
  (await http(app)).post('/auth/activate').send({ token, newPassword: MAT_KHAU_MOI });

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

describe('`0277` tài khoản CHƯA kích hoạt: sửa đủ bốn trường', () => {
  it('đổi họ tên, tên tài khoản, email và vai trò cùng lúc', async () => {
    const u = await tao();
    const ten = tenMoi();
    const res = await sua(u.id, {
      fullName: 'Ho Ten Moi',
      username: ten,
      email: `${ten}@csbh.test`,
      role: 'KE_TOAN',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.inviteMailSent).toBe(true);
    const d = await doc(u.id);
    expect(d.full_name).toBe('Ho Ten Moi');
    expect(d.username).toBe(ten);
    expect(d.email).toBe(`${ten}@csbh.test`);
    expect(d.role).toBe('KE_TOAN');
    expect(d.activated_at).toBeNull();
  });

  it('thư mời CŨ chết, thư MỚI đi tới email MỚI và kích hoạt được', async () => {
    const u = await tao();
    const cu = activationTokenFrom((await mailpitFind(u.email))!.text);
    const ten = tenMoi();
    const emailMoi = `${ten}@csbh.test`;
    expect((await sua(u.id, { username: ten, email: emailMoi })).status).toBe(200);

    // Email cũ KHÔNG nhận thêm thư nào; email mới nhận đúng một thư.
    expect(await mailpitCountTo(u.email)).toBe(1);
    expect(await mailpitCountTo(emailMoi)).toBe(1);

    const chet = await kichHoat(cu);
    expect(chet.status).toBe(400);
    expect(chet.body.code).toBe('TOKEN_REVOKED');

    const moi = activationTokenFrom((await mailpitFind(emailMoi))!.text);
    expect(moi).not.toBe(cu);
    expect((await kichHoat(moi)).status).toBe(200);
  });

  it('chỉ đổi HOA/THƯỜNG của tên tài khoản vẫn là một lượt sửa thật', async () => {
    const u = await tao();
    const hoa = u.username.toUpperCase();
    expect((await sua(u.id, { username: hoa })).status).toBe(200);
    expect((await doc(u.id)).username).toBe(hoa);
    expect(await mailpitCountTo(u.email)).toBe(2);
    // Trả về chữ thường: dọn rác của bộ kiểm khớp theo tiền tố chữ thường, nên một tên
    // còn chữ HOA nằm lại CSDL mãi và lượt chạy sau va vào nó (409 ngay ở bước tạo).
    expect((await sua(u.id, { username: u.username })).status).toBe(200);
  });

  it('chỉ đổi HỌ TÊN cũng thu hồi và gửi thư mới (một luật cho mọi trường)', async () => {
    const u = await tao();
    const cu = activationTokenFrom((await mailpitFind(u.email))!.text);
    expect((await sua(u.id, { fullName: 'Chi Doi Ten' })).status).toBe(200);
    expect(await mailpitCountTo(u.email)).toBe(2);
    expect((await kichHoat(cu)).body.code).toBe('TOKEN_REVOKED');
    // Thư mới chào bằng họ tên MỚI.
    expect((await mailpitFind(u.email))!.text).toContain('Chi Doi Ten');
  });

  it('gửi giá trị Y HỆT hiện có → không thu hồi, không gửi thư', async () => {
    const u = await tao();
    const cu = activationTokenFrom((await mailpitFind(u.email))!.text);
    const res = await sua(u.id, {
      fullName: 'Nguoi dung thu nghiem',
      username: u.username,
      email: u.email.toUpperCase(),
      role: 'TDV',
    });
    expect(res.status).toBe(200);
    expect(res.body.inviteMailSent).toBeUndefined();
    expect(await mailpitCountTo(u.email)).toBe(1);
    // Thư cũ vẫn dùng được.
    expect((await kichHoat(cu)).status).toBe(200);
  });
});

describe('`0277` tài khoản ĐÃ kích hoạt: chỉ họ tên', () => {
  const daKichHoat = async () => {
    const u = await tao();
    const token = activationTokenFrom((await mailpitFind(u.email))!.text);
    expect((await kichHoat(token)).status).toBe(200);
    return u;
  };

  it('đổi tên tài khoản / email / vai trò → 409 USER_ACTIVATED_LOCKED, không đổi gì', async () => {
    const u = await daKichHoat();
    for (const body of [
      { username: tenMoi() },
      { email: `${tenMoi()}@csbh.test` },
      { role: 'QUAN_TRI' },
      { fullName: 'Ten Moi', role: 'QUAN_TRI' },
    ]) {
      const res = await sua(u.id, body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.body.code).toBe('USER_ACTIVATED_LOCKED');
    }
    const d = await doc(u.id);
    expect([d.username, d.email, d.role, d.full_name]).toEqual([
      u.username,
      u.email,
      'TDV',
      'Nguoi dung thu nghiem',
    ]);
  });

  it('chỉ đổi họ tên thì được, và KHÔNG gửi thư nào', async () => {
    const u = await daKichHoat();
    const truoc = await mailpitCountTo(u.email);
    const res = await sua(u.id, { fullName: 'Ten Sua Sau Kich Hoat' });
    expect(res.status).toBe(200);
    expect((await doc(u.id)).full_name).toBe('Ten Sua Sau Kich Hoat');
    expect(await mailpitCountTo(u.email)).toBe(truoc);
  });

  it('gửi lại đúng giá trị cũ của các trường khoá thì không bị coi là đổi', async () => {
    const u = await daKichHoat();
    const res = await sua(u.id, {
      fullName: 'Chi Ten Doi',
      username: u.username,
      email: u.email,
      role: 'TDV',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe('`0277` trùng và quyền', () => {
  it('email hoặc tên tài khoản của NGƯỜI KHÁC → 409, thư cũ còn dùng được', async () => {
    const a = await tao();
    const b = await tao();
    const cu = activationTokenFrom((await mailpitFind(a.email))!.text);

    const trungThu = await sua(a.id, { email: b.email });
    expect(trungThu.status).toBe(409);
    expect(trungThu.body.code).toBe('EMAIL_DUPLICATE');
    const trungTen = await sua(a.id, { username: b.username.toUpperCase() });
    expect(trungTen.status).toBe(409);
    expect(trungTen.body.code).toBe('USERNAME_DUPLICATE');

    const d = await doc(a.id);
    expect([d.username, d.email]).toEqual([a.username, a.email]);
    expect(await mailpitCountTo(a.email)).toBe(1);
    expect((await kichHoat(cu)).status).toBe(200);
  });

  it('người khác Quản trị không sửa được', async () => {
    const u = await tao();
    for (const who of ['tdv01', 'kt01', 'tbp01', 'sa01', 'bld01']) {
      const t = await accessTokenFor(app, who, SEED_PW);
      const res = await sua(u.id, { username: tenMoi() }, t);
      expect(res.status, who).toBe(403);
    }
  });

  it('tài khoản không tồn tại → 404', async () => {
    const res = await sua('00000000-0000-0000-0000-000000000000', { fullName: 'Khong Co Ai' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });
});

describe('`0277` nhật ký', () => {
  it('USER_UPDATED chỉ mang đúng trường đã đổi', async () => {
    const u = await tao();
    const ten = tenMoi();
    expect((await sua(u.id, { username: ten, role: 'SALE_ADMIN' })).status).toBe(200);
    const e = await withAdminDb(async (c) => {
      const r = await c.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM idn.outbox
          WHERE routing_key = 'identity.user_updated' AND payload->>'id' = $1
          ORDER BY id DESC LIMIT 1`,
        [u.id],
      );
      return r.rows[0]?.payload;
    });
    expect(e, 'thiếu sự kiện identity.user_updated').toBeDefined();
    expect(e!['action']).toBe('USER_UPDATED');
    expect(e!['before']).toEqual({ username: u.username, role: 'TDV' });
    expect(e!['after']).toEqual({ username: ten, role: 'SALE_ADMIN' });
  });
});
