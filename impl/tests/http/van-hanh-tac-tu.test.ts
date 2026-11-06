/**
 * `0254` — tác tử nhìn từ `van-hanh`: nhịp tim · ảnh chụp container · cỡ Docker · "Sao lưu
 * ngay" (xếp việc) · theo dõi một việc. Phần tác tử nhận và chạy việc được giả bằng CHÍNH
 * hai hàm SQL nó gọi (`ops.tac_tu_nhip`, `ops.tac_tu_xong`) — ca shell ở `csbh-tac-tu.test.ts`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '@csbh/van-hanh/testing';
import { accessTokenFor, bootIdentityListening, clearAccountCache, http, idNguoiDung, withAdminDb } from './app.js';

const SEED_PW = 'Test@1234';
let identity: INestApplication;
let app: INestApplication;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const goi = async () => http(app);
const voi = (u: string) => ({ Authorization: `Bearer ${tok[u]}` });
const sql = (s: string, p: unknown[] = []) => withAdminDb(async (c) => (await c.query(s, p)).rows);
const nhip = (truocGiay = 0) =>
  sql(`INSERT INTO ops.tac_tu (id, lan_cuoi, phien_ban, may) VALUES (true, now() - make_interval(secs => $1), '1.1.0', 'may-chu')
       ON CONFLICT (id) DO UPDATE SET lan_cuoi = EXCLUDED.lan_cuoi`, [truocGiay]);
const don = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM ops.viec_tay; DELETE FROM ops.tac_tu; DELETE FROM ops.container; DELETE FROM ops.do_docker`);
    await c.query(`DELETE FROM ops.lan_chay WHERE viec IN ('SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP')`);
  });

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  for (const u of ['admin01', 'bld01', 'tdv01', 'kt01']) tok[u] = await accessTokenFor(identity, u, SEED_PW);
  process.env.VAN_HANH_TU_CHAY = '0';
  process.env.GATEWAY_URL = 'http://127.0.0.1:1';
  app = await createTestApp();
}, 60_000);

afterAll(async () => {
  await don();
  await app?.close();
  await identity?.close();
  for (const r of restores) r();
  delete process.env.GATEWAY_URL;
});

beforeEach(don);

describe('`0254` chỉ Quản trị hệ thống', () => {
  it.each(['bld01', 'tdv01', 'kt01'])('%s nhận 403', async (u) => {
    const a = await goi();
    for (const [i, r] of [
      await a.get('/van-hanh/tac-tu').set(voi(u)),
      await a.post('/van-hanh/sao-luu/chay-ngay').set(voi(u)).send({ loai: 'CSDL' }),
      await a.get('/van-hanh/viec/1').set(voi(u)),
    ].entries()) {
      expect(r.status, `đường thứ ${i}`).toBe(403);
    }
    expect((await sql(`SELECT count(*)::int AS n FROM ops.viec_tay`))[0].n).toBe(0);
  });
});

describe('`0254` trạng thái tác tử', () => {
  it('chưa từng nhịp → mất liên lạc, không mốc nào', async () => {
    const r = await (await goi()).get('/van-hanh/tac-tu').set(voi('admin01'));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ online: false, lanCuoi: null, container: [], docker: [], viec: [] });
  });

  // Số 60 viết THẲNG ở đây (kế hoạch: "quá 60 giây → mất liên lạc"); dùng hằng của mã nguồn
  // thì ca kiểm trôi theo bất kỳ giá trị nào (phá lại đo được: 6000 vẫn xanh).
  it('nhịp vừa xong → liên lạc; 59 giây trước vẫn liên lạc; 61 giây trước → mất liên lạc', async () => {
    await nhip(5);
    expect((await (await goi()).get('/van-hanh/tac-tu').set(voi('admin01'))).body).toMatchObject({ online: true, phienBan: '1.1.0', may: 'may-chu' });
    await nhip(59);
    expect((await (await goi()).get('/van-hanh/tac-tu').set(voi('admin01'))).body.online).toBe(true);
    await nhip(61);
    expect((await (await goi()).get('/van-hanh/tac-tu').set(voi('admin01'))).body.online).toBe(false);
  });

  it('container và cỡ Docker tác tử ghi được trả về, và đi tới thẻ Sức khoẻ / Ổ đĩa', async () => {
    await nhip();
    await sql(`SELECT ops.ghi_container($1)`, [
      '{"Service":"postgres","State":"running","Health":"healthy","Status":"Up"}\n{"Service":"redis","State":"exited","Health":"","Status":"Exited (1)"}',
    ]);
    await sql(`INSERT INTO ops.do_docker (ten, loai, co) VALUES ('pgdata', 'VOLUME', 4100000000), ('anh-docker', 'ANH', 4200000000)`);
    const a = await goi();
    const t = (await a.get('/van-hanh/tac-tu').set(voi('admin01'))).body;
    expect(t.container).toEqual([
      expect.objectContaining({ service: 'postgres', trangThai: 'running', sucKhoe: 'healthy' }),
      expect.objectContaining({ service: 'redis', trangThai: 'exited', sucKhoe: null }),
    ]);
    expect(t.docker).toEqual([
      expect.objectContaining({ ten: 'pgdata', loai: 'VOLUME', co: 4.1e9 }),
      expect.objectContaining({ ten: 'anh-docker', loai: 'ANH', co: 4.2e9 }),
    ]);
    const sk = (await a.get('/van-hanh/suc-khoe').set(voi('admin01'))).body;
    expect(sk.tacTu).toMatchObject({ online: true });
    expect(sk.container.map((c: { service: string }) => c.service)).toEqual(['postgres', 'redis']);
    const od = (await a.get('/van-hanh/o-dia').set(voi('admin01'))).body;
    expect(od.theoDocker.map((d: { ten: string }) => d.ten)).toEqual(['pgdata', 'anh-docker']);
  });
});

describe('`0254` Sao lưu ngay', () => {
  it('tác tử mất liên lạc → 409 AGENT_OFFLINE, KHÔNG xếp việc nào (việc nằm chờ không ai nhận trông y như đang chạy)', async () => {
    await nhip(90);
    const r = await (await goi()).post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('AGENT_OFFLINE');
    expect((await sql(`SELECT count(*)::int AS n FROM ops.viec_tay`))[0].n).toBe(0);
  });

  it('liên lạc → 202, một việc CHỜ mang người bấm, ghi nhật ký', async () => {
    await nhip();
    const r = await (await goi()).post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' });
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    expect(r.body).toMatchObject({ loai: 'SAO_LUU_CSDL', trangThai: 'CHO', nguoiTao: (await idNguoiDung())['admin01'] });
    const sk = (await sql(`SELECT payload FROM ops.outbox WHERE routing_key = 'van_hanh.sao_luu_chay_ngay' ORDER BY seq DESC LIMIT 1`))[0].payload;
    expect(sk).toMatchObject({ action: 'VAN_HANH_SAO_LUU_CHAY_NGAY', targetLabel: 'SAO_LUU_CSDL', after: { viec: r.body.id } });
    expect(sk).not.toHaveProperty('id');
  });

  it('bấm lần hai khi việc cùng loại còn chờ / đang chạy → 409 JOB_RUNNING; loại KHÁC vẫn được; xong rồi bấm lại được', async () => {
    await nhip();
    const a = await goi();
    expect((await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' })).status).toBe(202);
    const hai = await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' });
    expect(hai.status).toBe(409);
    expect(hai.body.code).toBe('JOB_RUNNING');
    expect((await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'KHO_TEP' })).status).toBe(202);
    await sql(`UPDATE ops.viec_tay SET trang_thai = 'DANG_CHAY' WHERE loai = 'SAO_LUU_CSDL'`);
    expect((await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' })).body.code).toBe('JOB_RUNNING');
    await sql(`UPDATE ops.viec_tay SET trang_thai = 'LOI', ket_thuc = now() WHERE loai = 'SAO_LUU_CSDL'`);
    expect((await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' })).status).toBe(202);
  });

  it('hai lượt bấm SONG SONG → đúng một việc, lượt kia JOB_RUNNING (chỉ mục là chốt thật)', async () => {
    await nhip();
    const a = await goi();
    const kq = await Promise.all([1, 2, 3].map(() => a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'KHO_TEP' })));
    expect(kq.map((r) => r.status).sort()).toEqual([202, 409, 409]);
    expect((await sql(`SELECT count(*)::int AS n FROM ops.viec_tay`))[0].n).toBe(1);
  });

  it('lượt sao lưu THEO LỊCH cùng loại đang chạy (dưới 1 giờ) → JOB_RUNNING; lượt "đang chạy" cũ hơn (chết dở) không chặn', async () => {
    await nhip();
    await sql(`INSERT INTO ops.lan_chay (viec) VALUES ('SAO_LUU_CSDL')`);
    const a = await goi();
    expect((await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' })).body.code).toBe('JOB_RUNNING');
    await sql(`UPDATE ops.lan_chay SET bat_dau = now() - interval '2 hours' WHERE viec = 'SAO_LUU_CSDL'`);
    expect((await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' })).status).toBe(202);
  });

  it.each([[{}], [{ loai: 'SAO_LUU_CSDL' }], [{ loai: 'XOA_HET' }], [{ loai: 'toString' }], [{ loai: 7 }]])(
    'loại không hợp lệ %j → 400, không xếp việc',
    async (body) => {
      await nhip();
      const r = await (await goi()).post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send(body);
      expect(r.status).toBe(400);
      expect((await sql(`SELECT count(*)::int AS n FROM ops.viec_tay`))[0].n).toBe(0);
    },
  );
});

describe('`0254` theo dõi một việc tới khi xong', () => {
  it('xếp → tác tử nhận (ĐANG CHẠY) → tác tử báo xong (THÀNH CÔNG kèm đầu ra)', async () => {
    await nhip();
    const a = await goi();
    const id = (await a.post('/van-hanh/sao-luu/chay-ngay').set(voi('admin01')).send({ loai: 'CSDL' })).body.id as string;
    expect((await a.get(`/van-hanh/viec/${id}`).set(voi('admin01'))).body.trangThai).toBe('CHO');
    const nhan = (await sql(`SELECT ops.tac_tu_nhip('1.1.0', 'may-chu', true) AS v`))[0].v as string;
    expect(nhan.split(' ').slice(0, 2)).toEqual([id, 'SAO_LUU_CSDL']);
    expect((await a.get(`/van-hanh/viec/${id}`).set(voi('admin01'))).body).toMatchObject({ trangThai: 'DANG_CHAY', batDau: expect.any(String) });
    await sql(`SELECT ops.tac_tu_xong($1, true, 'backup: xong csbh-20261106T040000Z.dump')`, [id]);
    const v = (await a.get(`/van-hanh/viec/${id}`).set(voi('admin01'))).body;
    expect(v).toMatchObject({ trangThai: 'THANH_CONG', chiTiet: expect.stringContaining('csbh-20261106T040000Z.dump'), ketThuc: expect.any(String) });
    expect((await a.get('/van-hanh/tac-tu').set(voi('admin01'))).body.viec[0]).toMatchObject({ id, trangThai: 'THANH_CONG' });
  });

  it('việc không có → 404 VIEC_KHONG_CO; mã không phải số → 400', async () => {
    const a = await goi();
    const r = await a.get('/van-hanh/viec/999999999').set(voi('admin01'));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('VIEC_KHONG_CO');
    expect((await a.get('/van-hanh/viec/1;DROP').set(voi('admin01'))).status).toBe(400);
  });
});
