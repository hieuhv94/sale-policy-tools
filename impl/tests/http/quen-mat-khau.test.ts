/**
 * PWD-01 … PWD-08 — quên mật khẩu và đặt lại bằng liên kết trong thư.
 *
 * Đường này CÔNG KHAI và nhận tên tài khoản của bất kỳ ai, nên phần lớn test ở
 * đây không kiểm "chức năng chạy đúng" mà kiểm những thứ nó KHÔNG được làm: nói
 * ra tài khoản nào có thật, gửi thư dồn dập, thu hồi nhầm token của thư mời, hay
 * cho một token dùng chéo giữa hai đường.
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
  resetTokenFrom,
  TEST_PREFIX,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const PW_MOI = 'DatLai@2026xyz';

let app: INestApplication;
let adminToken = '';
let n = 0;

/** Một tài khoản đã kích hoạt xong, sẵn sàng cho việc quên mật khẩu. */
async function nguoiDaKichHoat(matKhau: string) {
  const u = `${TEST_PREFIX}_pwd${++n}`;
  const email = `${u}@csbh.test`;
  const agent = await http(app);
  await agent
    .post('/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: u, email, fullName: 'Nguoi quen mat khau', role: 'TBP' })
    .expect(201);

  const token = activationTokenFrom((await mailpitFind(email))!.text);
  await agent.post('/auth/activate').send({ token, newPassword: matKhau }).expect(200);
  return { username: u, email };
}

const quen = async (login: string) =>
  (await http(app)).post('/auth/forgot-password').send({ login });

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

describe('PWD-01 gửi liên kết đặt lại', () => {
  it('thư tới đúng hộp thư, kèm liên kết đặt lại chứ không phải liên kết kích hoạt', async () => {
    const cu = 'MatKhauCu@2026';
    const { email } = await nguoiDaKichHoat(cu);
    await mailpitClear();

    expect((await quen(email)).status).toBe(200);

    const mail = await mailpitFind(email);
    expect(mail!.subject).toContain('Đặt lại mật khẩu');
    expect(mail!.text).toContain('/dat-lai-mat-khau?token=');
    // Thư nói rõ phải làm gì nếu không phải mình yêu cầu — đường này công khai
    // nên người dùng có thể nhận thư mà không hề bấm gì.
    expect(mail!.text).toContain('bỏ qua thư này');
  });

  it('đặt được mật khẩu mới, mật khẩu cũ chết ngay', async () => {
    const cu = 'MatKhauCu@2026';
    const { username, email } = await nguoiDaKichHoat(cu);
    await mailpitClear();
    await quen(username);

    const token = resetTokenFrom((await mailpitFind(email))!.text);
    const agent = await http(app);
    expect((await agent.post('/auth/reset-password').send({ token, newPassword: PW_MOI })).status)
      .toBe(200);

    expect((await login(app, username, PW_MOI)).status).toBe(200);
    expect((await login(app, username, cu)).status).toBe(401);
  });

  it('nhận cả tên tài khoản lẫn địa chỉ email', async () => {
    const { username, email } = await nguoiDaKichHoat('MatKhauCu@2026');
    await mailpitClear();
    expect((await quen(username)).status).toBe(200);
    expect(await mailpitCountTo(email)).toBe(1);
  });
});

describe('PWD-02 không lộ tài khoản nào có thật', () => {
  it('tài khoản không tồn tại vẫn trả về đúng câu trả lời đó, và không gửi thư', async () => {
    await mailpitClear();
    const res = await quen(`${TEST_PREFIX}_khong_co_that`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await mailpitCountTo(`${TEST_PREFIX}_khong_co_that@csbh.test`)).toBe(0);
  });

  it('tài khoản có thật trả về CÙNG một thân phản hồi', async () => {
    const { username } = await nguoiDaKichHoat('MatKhauCu@2026');
    const co = await quen(username);
    const khong = await quen(`${TEST_PREFIX}_cung_khong_co`);
    // So cả mã lẫn thân: chỉ cần khác một chữ là đủ để dò danh sách tài khoản.
    expect(co.status).toBe(khong.status);
    expect(co.body).toEqual(khong.body);
  });
});

describe('PWD-03 tài khoản bị vô hiệu hoá không nhận thư', () => {
  it('gửi đi là mời đặt mật khẩu cho một tài khoản không đăng nhập được', async () => {
    const { username, email } = await nguoiDaKichHoat('MatKhauCu@2026');
    const id = await withAdminDb(async (c) => {
      const r = await c.query<{ id: string }>(`SELECT id FROM idn.app_user WHERE username = $1`, [
        username,
      ]);
      return r.rows[0]!.id;
    });
    await (await http(app))
      .post(`/admin/users/${id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await mailpitClear();
    expect((await quen(username)).status).toBe(200);
    expect(await mailpitCountTo(email)).toBe(0);
  });
});

describe('PWD-04 chặn gửi dồn', () => {
  it('gọi ba lần liên tiếp chỉ ra MỘT thư', async () => {
    const { username, email } = await nguoiDaKichHoat('MatKhauCu@2026');
    await mailpitClear();
    await quen(username);
    await quen(username);
    await quen(username);
    // Thiếu chốt này thì bất kỳ ai cũng bơm được thư vào hộp thư của người
    // khác, và giữa đống thư đó là một liên kết thật.
    expect(await mailpitCountTo(email)).toBe(1);
  });
});

describe('PWD-05 không đụng tới token của thư mời', () => {
  it('người ngoài gọi quên mật khẩu KHÔNG làm chết liên kết kích hoạt đang treo', async () => {
    const u = `${TEST_PREFIX}_pwd${++n}`;
    const email = `${u}@csbh.test`;
    await (await http(app))
      .post('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: u, email, fullName: 'Chua kich hoat', role: 'TBP' })
      .expect(201);
    const tokenMoi = activationTokenFrom((await mailpitFind(email))!.text);

    // Kẻ ngoài chỉ cần biết tên tài khoản. Nếu đường này thu hồi cả token kích
    // hoạt thì gọi lặp lại là vô hiệu hoá được mọi thư mời vừa gửi đi.
    await quen(u);

    const act = await (await http(app))
      .post('/auth/activate')
      .send({ token: tokenMoi, newPassword: PW_MOI });
    expect(act.status).toBe(200);
  });
});

describe('PWD-06 không dùng chéo hai loại token', () => {
  it('token kích hoạt nộp vào đường đặt lại thì TOKEN_INVALID', async () => {
    const u = `${TEST_PREFIX}_pwd${++n}`;
    const email = `${u}@csbh.test`;
    await (await http(app))
      .post('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: u, email, fullName: 'Cheo', role: 'TBP' })
      .expect(201);
    const token = activationTokenFrom((await mailpitFind(email))!.text);

    const res = await (await http(app))
      .post('/auth/reset-password')
      .send({ token, newPassword: PW_MOI });
    expect(res.status).toBe(400);
    // Không phân biệt được với token không tồn tại — trả mã khác là nói cho
    // người thử biết họ đang cầm một token thật, chỉ nộp nhầm cửa.
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('token đặt lại nộp vào đường kích hoạt thì TOKEN_INVALID', async () => {
    const { username, email } = await nguoiDaKichHoat('MatKhauCu@2026');
    await mailpitClear();
    await quen(username);
    const token = resetTokenFrom((await mailpitFind(email))!.text);

    const res = await (await http(app)).post('/auth/activate').send({ token, newPassword: PW_MOI });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });
});

describe('PWD-07 liên kết đặt lại dùng một lần', () => {
  it('dùng lần thứ hai thì TOKEN_USED', async () => {
    const { username, email } = await nguoiDaKichHoat('MatKhauCu@2026');
    await mailpitClear();
    await quen(username);
    const token = resetTokenFrom((await mailpitFind(email))!.text);
    const agent = await http(app);

    expect((await agent.post('/auth/reset-password').send({ token, newPassword: PW_MOI })).status)
      .toBe(200);
    const lai = await agent
      .post('/auth/reset-password')
      .send({ token, newPassword: 'MotCaiKhac@2026' });
    expect(lai.status).toBe(400);
    expect(lai.body.code).toBe('TOKEN_USED');
  });

  it('quá hạn thì TOKEN_EXPIRED', async () => {
    const { username, email } = await nguoiDaKichHoat('MatKhauCu@2026');
    await mailpitClear();
    await quen(username);
    const token = resetTokenFrom((await mailpitFind(email))!.text);

    // Đẩy hạn về quá khứ thay vì chờ hai giờ.
    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE idn.activation_token SET expires_at = now() - interval '1 minute'
          WHERE purpose = 'RESET' AND used_at IS NULL
            AND user_id = (SELECT id FROM idn.app_user WHERE username = $1)`,
        [username],
      );
    });

    const res = await (await http(app))
      .post('/auth/reset-password')
      .send({ token, newPassword: PW_MOI });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

describe('PWD-08 đặt lại mật khẩu cắt mọi phiên đang mở', () => {
  it('access token cấp trước đó không dùng được nữa', async () => {
    const cu = 'MatKhauCu@2026';
    const { username, email } = await nguoiDaKichHoat(cu);
    const phienCu = (await login(app, username, cu)).body.accessToken as string;
    const agent = await http(app);
    expect((await agent.get('/auth/me').set('Authorization', `Bearer ${phienCu}`)).status).toBe(200);

    await mailpitClear();
    await quen(username);
    const token = resetTokenFrom((await mailpitFind(email))!.text);
    await agent.post('/auth/reset-password').send({ token, newPassword: PW_MOI }).expect(200);

    // Nếu mật khẩu bị lộ thì đặt lại phải CẮT phiên của kẻ đang dùng, không chỉ
    // tạo thêm một phiên mới cho chính chủ (ONB-13).
    expect((await agent.get('/auth/me').set('Authorization', `Bearer ${phienCu}`)).status).toBe(401);
  });
});
