/**
 * `0252` — service `van-hanh`: lịch tự động · lượt chạy · tệp log (liệt kê/xem/tải/xoá) ·
 * nén log hằng ngày giữ tối đa N tệp.
 *
 * Thư mục log là một thư mục TẠM đặt qua `CSBH_LOG_DIR` trước khi dựng app — service đọc
 * biến ấy mỗi lần gọi, nên mỗi khối ca dựng lại cây tệp của nó.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestApp, LogService, VanHanhOutbox, canDon, canNen } from '@csbh/van-hanh/testing';
import { ngayVN } from '@csbh/http-kit';
import { accessTokenFor, bootIdentityListening, clearAccountCache, http, withAdminDb } from './app.js';

const SEED_PW = 'Test@1234';
let identity: INestApplication;
let app: INestApplication;
let logs: LogService;
let outbox: VanHanhOutbox;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
let goc = '';

const datLaiLich = () =>
  withAdminDb(async (c) => {
    await c.query(`UPDATE ops.cau_hinh_viec SET tan_suat='HANG_NGAY', gio_chay='01:15', thu_trong_tuan=NULL, giu_toi_da=7 WHERE viec='SAO_LUU_CSDL'`);
    await c.query(`UPDATE ops.cau_hinh_viec SET tan_suat='HANG_NGAY', gio_chay='02:00', thu_trong_tuan=NULL, giu_toi_da=7 WHERE viec='SAO_LUU_KHO_TEP'`);
    await c.query(`UPDATE ops.cau_hinh_viec SET tan_suat='HANG_NGAY', gio_chay='00:15', thu_trong_tuan=NULL, giu_toi_da=30 WHERE viec='NEN_LOG'`);
    await c.query(`DELETE FROM ops.lan_chay WHERE viec = 'NEN_LOG'`);
  });
const suKien = (key: string) =>
  withAdminDb(async (c) =>
    (await c.query<{ payload: Record<string, unknown> }>(`SELECT payload FROM ops.outbox WHERE routing_key = $1 ORDER BY seq DESC LIMIT 1`, [key]))
      .rows[0]?.payload,
  );
const dongLog = (o: Record<string, unknown>) => JSON.stringify({ t: '2026-11-06T02:00:00Z', muc: 'log', service: 'policy', msg: 'x', ...o });

const goi = async () => http(app);
const voi = (u: string) => ({ Authorization: `Bearer ${tok[u]}` });

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  for (const u of ['admin01', 'bld01', 'tdv01', 'kt01']) tok[u] = await accessTokenFor(identity, u, SEED_PW);
  goc = mkdtempSync(join(tmpdir(), 'csbh-vh-'));
  process.env.CSBH_LOG_DIR = goc;
  process.env.VAN_HANH_TU_CHAY = '0';
  app = await createTestApp();
  logs = app.get(LogService);
  outbox = app.get(VanHanhOutbox);
  await datLaiLich();
}, 60_000);

afterAll(async () => {
  await datLaiLich();
  await app?.close();
  await identity?.close();
  for (const r of restores) r();
  delete process.env.CSBH_LOG_DIR;
});

const dungCay = () => {
  rmSync(goc, { recursive: true, force: true });
  mkdirSync(join(goc, 'dang-ghi'), { recursive: true });
};

// ---------------------------------------------------------------------------
describe('`0252` hàm thuần', () => {
  it('canNen: chỉ tệp của ngày ĐÃ QUA, gom theo ngày, bỏ tên lạ', () => {
    const m = canNen(
      ['policy-2026-11-04.log', 'audit-2026-11-04.log', 'policy-2026-11-05.log', 'policy-2026-11-06.log', 'rac.txt', 'x-2026-1-1.log'],
      '2026-11-06',
    );
    expect([...m.keys()]).toEqual(['2026-11-04', '2026-11-05']);
    expect(m.get('2026-11-04')!.map((t) => t.ten).sort()).toEqual(['audit-2026-11-04.log', 'policy-2026-11-04.log']);
  });

  it('canDon: giữ N tệp MỚI NHẤT, bỏ qua tên không phải tệp nén', () => {
    const ds = ['log-2026-11-03.tar.gz', 'log-2026-11-01.tar.gz', 'log-2026-11-02.tar.gz', 'log-2026-11-02-2.tar.gz', 'dang-ghi', 'log-2026-11-01.tar.gz.sha256'];
    expect(canDon(ds, 2)).toEqual(['log-2026-11-01.tar.gz', 'log-2026-11-02-2.tar.gz']);
    expect(canDon(ds, 30)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('`0252` lịch tự động qua API', () => {
  beforeEach(datLaiLich);

  it('GET /van-hanh/lich — bốn việc, đúng thứ tự, có lần tới', async () => {
    const r = await (await goi()).get('/van-hanh/lich').set(voi('admin01'));
    expect(r.status).toBe(200);
    expect(r.body.map((d: { viec: string }) => d.viec)).toEqual(['SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP', 'NEN_LOG', 'DON_DU_LIEU']);
    expect(r.body[0]).toMatchObject({ tanSuat: 'HANG_NGAY', gioChay: '01:15', giuToiDa: 7 });
    expect(new Date(r.body[0].lanToi).getTime()).toBeGreaterThan(Date.now());
  });

  it('PUT hợp lệ (hằng tuần Thứ Tư 22:30, giữ 12) → lưu, trả dòng mới, phát sự kiện nhật ký trước/sau', async () => {
    const r = await (await goi())
      .put('/van-hanh/lich/SAO_LUU_CSDL')
      .set(voi('admin01'))
      .send({ tanSuat: 'HANG_TUAN', gioChay: '22:30', thuTrongTuan: 3, giuToiDa: 12 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ tanSuat: 'HANG_TUAN', gioChay: '22:30', thuTrongTuan: 3, giuToiDa: 12 });
    const sk = await suKien('van_hanh.lich_doi');
    expect(sk).toMatchObject({
      action: 'VAN_HANH_LICH_DOI',
      targetLabel: 'SAO_LUU_CSDL',
      before: { tanSuat: 'HANG_NGAY', gioChay: '01:15', giuToiDa: 7 },
      after: { tanSuat: 'HANG_TUAN', gioChay: '22:30', thuTrongTuan: 3, giuToiDa: 12 },
    });
    expect(sk).not.toHaveProperty('id'); // entity_id của nhật ký là uuid
  });

  it('đổi tần suất từ hằng tuần về hằng ngày thì xoá thứ trong tuần', async () => {
    await (await goi()).put('/van-hanh/lich/SAO_LUU_CSDL').set(voi('admin01')).send({ tanSuat: 'HANG_TUAN', gioChay: '01:00', thuTrongTuan: 5, giuToiDa: 7 });
    const r = await (await goi()).put('/van-hanh/lich/SAO_LUU_CSDL').set(voi('admin01')).send({ tanSuat: 'HANG_NGAY', gioChay: '01:00', thuTrongTuan: 5, giuToiDa: 7 });
    expect(r.status).toBe(200);
    expect(r.body.thuTrongTuan).toBeNull();
  });

  it.each([
    ['SAO_LUU_CSDL', { tanSuat: 'HANG_NGAY', gioChay: '01:15', giuToiDa: 0 }, 'giuToiDa'],
    ['SAO_LUU_CSDL', { tanSuat: 'HANG_NGAY', gioChay: '01:15', giuToiDa: 61 }, 'giuToiDa'],
    ['SAO_LUU_KHO_TEP', { tanSuat: 'HANG_NGAY', gioChay: '02:00' }, 'giuToiDa'],
    ['NEN_LOG', { tanSuat: 'HANG_NGAY', gioChay: '00:15', giuToiDa: 91 }, 'giuToiDa'],
    ['NEN_LOG', { tanSuat: 'MOI_6_GIO', gioChay: '00:15', giuToiDa: 30 }, 'tanSuat'],
    ['DON_DU_LIEU', { tanSuat: 'HANG_TUAN', gioChay: '03:00', thuTrongTuan: 1 }, 'tanSuat'],
    ['SAO_LUU_CSDL', { tanSuat: 'HANG_TUAN', gioChay: '01:15', giuToiDa: 7 }, 'thuTrongTuan'],
    ['SAO_LUU_CSDL', { tanSuat: 'HANG_NGAY', gioChay: '25:00', giuToiDa: 7 }, 'gioChay'],
    ['SAO_LUU_CSDL', { tanSuat: 'HANG_NGAY', gioChay: '1:15', giuToiDa: 7 }, 'gioChay'],
  ])('PUT %s sai (%j) → 400 LICH_KHONG_HOP_LE ở ô %s, lịch không đổi', async (viec, body, truong) => {
    const r = await (await goi()).put(`/van-hanh/lich/${viec}`).set(voi('admin01')).send(body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'LICH_KHONG_HOP_LE', field: truong });
    const sau = await (await goi()).get('/van-hanh/lich').set(voi('admin01'));
    expect(sau.body.find((d: { viec: string }) => d.viec === 'SAO_LUU_CSDL')).toMatchObject({ gioChay: '01:15', giuToiDa: 7 });
  });

  it('tần suất lạ / thiếu giờ → 400 VALIDATION_FAILED', async () => {
    const r1 = await (await goi()).put('/van-hanh/lich/SAO_LUU_CSDL').set(voi('admin01')).send({ tanSuat: 'MOI_GIO', gioChay: '01:15', giuToiDa: 7 });
    expect(r1.body.code).toBe('VALIDATION_FAILED');
    const r2 = await (await goi()).put('/van-hanh/lich/SAO_LUU_CSDL').set(voi('admin01')).send({ tanSuat: 'HANG_NGAY', giuToiDa: 7 });
    expect(r2.body.code).toBe('VALIDATION_FAILED');
  });

  it('việc lạ → 404 LICH_KHONG_CO', async () => {
    const r = await (await goi()).put('/van-hanh/lich/XOA_HET').set(voi('admin01')).send({ tanSuat: 'HANG_NGAY', gioChay: '01:00', giuToiDa: 1 });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('LICH_KHONG_CO');
  });

  it('GET /van-hanh/lan-chay đọc lượt mới nhất trước, lọc được theo việc', async () => {
    await withAdminDb((c) =>
      c.query(`INSERT INTO ops.lan_chay (viec, bat_dau, ket_thuc, ket_qua, tu_dong) VALUES
                 ('NEN_LOG', now() - interval '2 hours', now() - interval '2 hours', 'LOI', true),
                 ('NEN_LOG', now() - interval '1 hour', now() - interval '1 hour', 'THANH_CONG', false)`),
    );
    const r = await (await goi()).get('/van-hanh/lan-chay?viec=NEN_LOG&so=5').set(voi('admin01'));
    expect(r.status).toBe(200);
    expect(r.body.map((d: { ketQua: string }) => d.ketQua)).toEqual(['THANH_CONG', 'LOI']);
    const lich = await (await goi()).get('/van-hanh/lich').set(voi('admin01'));
    expect(lich.body.find((d: { viec: string }) => d.viec === 'NEN_LOG').lanGanNhat).toMatchObject({ ketQua: 'THANH_CONG', tuDong: false });
  });
});

// ---------------------------------------------------------------------------
describe('`0252` chỉ Quản trị hệ thống', () => {
  it.each(['bld01', 'tdv01', 'kt01'])('%s nhận 403 ở mọi đường', async (u) => {
    const a = await goi();
    for (const r of [
      await a.get('/van-hanh/lich').set(voi(u)),
      await a.put('/van-hanh/lich/SAO_LUU_CSDL').set(voi(u)).send({ tanSuat: 'HANG_NGAY', gioChay: '01:15', giuToiDa: 7 }),
      await a.get('/van-hanh/lan-chay').set(voi(u)),
      await a.get('/van-hanh/logs').set(voi(u)),
      await a.get('/van-hanh/logs/tra?traceId=abcd1234').set(voi(u)),
      await a.get('/van-hanh/logs/dang-ghi/policy').set(voi(u)),
      await a.get('/van-hanh/logs/log-2026-11-01.tar.gz/tai').set(voi(u)),
      await a.delete('/van-hanh/logs/log-2026-11-01.tar.gz').set(voi(u)),
    ]) {
      expect(r.status).toBe(403);
    }
  });

  it('không đăng nhập → 401', async () => {
    expect((await (await goi()).get('/van-hanh/lich')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('`0252` tệp log qua API', () => {
  const homNay = ngayVN();
  beforeEach(() => {
    dungCay();
    writeFileSync(
      join(goc, 'dang-ghi', `policy-${homNay}.log`),
      [dongLog({ msg: 'khoi dong' }), dongLog({ muc: 'warn', msg: 'cham' }), dongLog({ muc: 'error', msg: 'hong', traceId: 'tra1234cuu' })].join('\n') + '\n',
    );
    writeFileSync(join(goc, 'dang-ghi', `gateway-${homNay}.log`), dongLog({ service: 'gateway', traceId: 'tra1234cuu', msg: 'POST /policies' }) + '\n');
    writeFileSync(join(goc, 'log-2026-11-01.tar.gz'), 'noi dung nen 1');
    writeFileSync(join(goc, 'log-2026-11-01.tar.gz.sha256'), 'x');
    writeFileSync(join(goc, 'log-2026-11-02.tar.gz'), 'noi dung nen 2');
  });

  it('GET /van-hanh/logs — tệp đang ghi và tệp nén (mới nhất trước), kèm cỡ và giới hạn giữ', async () => {
    const r = await (await goi()).get('/van-hanh/logs').set(voi('admin01'));
    expect(r.status).toBe(200);
    expect(r.body.dangGhi.map((t: { service: string }) => t.service)).toEqual(['gateway', 'policy']);
    expect(r.body.daNen.map((t: { ten: string }) => t.ten)).toEqual(['log-2026-11-02.tar.gz', 'log-2026-11-01.tar.gz']);
    expect(r.body.daNen[0].co).toBe(14);
    expect(r.body.giuToiDa).toBe(30);
  });

  it('xem tệp đang ghi: lọc mức lỗi / cảnh báo / theo mã tra cứu', async () => {
    const a = await goi();
    const tatCa = await a.get('/van-hanh/logs/dang-ghi/policy').set(voi('admin01'));
    expect(tatCa.body.dong).toHaveLength(3);
    const loi = await a.get('/van-hanh/logs/dang-ghi/policy?muc=loi').set(voi('admin01'));
    expect(loi.body.dong.map((d: string) => JSON.parse(d).msg)).toEqual(['hong']);
    const cb = await a.get('/van-hanh/logs/dang-ghi/policy?muc=canh-bao').set(voi('admin01'));
    expect(cb.body.dong).toHaveLength(2);
    const ma = await a.get('/van-hanh/logs/dang-ghi/policy?traceId=tra1234cuu').set(voi('admin01'));
    expect(ma.body.dong).toHaveLength(1);
    const chua = await a.get('/van-hanh/logs/dang-ghi/minio').set(voi('admin01'));
    expect(chua.body.dong).toEqual([]);
  });

  it('tra mã ở MỌI tệp đang ghi — nối dòng của mọi service cho một request', async () => {
    const r = await (await goi()).get('/van-hanh/logs/tra?traceId=tra1234cuu').set(voi('admin01'));
    expect(r.body.dong.map((d: string) => JSON.parse(d).service).sort()).toEqual(['gateway', 'policy']);
  });

  it.each(['khong-co', '..%2F..%2Fetc', 'policy;rm'])('xem thành phần lạ "%s" → 400', async (s) => {
    const r = await (await goi()).get(`/van-hanh/logs/dang-ghi/${s}`).set(voi('admin01'));
    expect([400, 404]).toContain(r.status);
    if (r.status === 400) expect(r.body.code).toBe('TEN_TEP_SAI');
  });

  it('mã tra cứu chứa ký tự lạ → 400', async () => {
    const r = await (await goi()).get('/van-hanh/logs/tra?traceId=a%27b%22c').set(voi('admin01'));
    expect(r.status).toBe(400);
  });

  it('tải tệp nén → đúng byte, tên tệp an toàn, ghi một dòng nhật ký', async () => {
    const r = await (await goi()).get('/van-hanh/logs/log-2026-11-01.tar.gz/tai').set(voi('admin01')).buffer(true);
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body as Buffer).toString()).toBe('noi dung nen 1');
    expect(r.headers['content-disposition']).toContain('log-2026-11-01.tar.gz');
    expect(await suKien('van_hanh.log_tai')).toMatchObject({ action: 'VAN_HANH_LOG_TAI', targetLabel: 'log-2026-11-01.tar.gz' });
  });

  it('xoá tệp nén → mất cả tệp lẫn .sha256, ghi nhật ký kèm cỡ', async () => {
    const r = await (await goi()).delete('/van-hanh/logs/log-2026-11-01.tar.gz').set(voi('admin01'));
    expect(r.status).toBe(204);
    expect(existsSync(join(goc, 'log-2026-11-01.tar.gz'))).toBe(false);
    expect(existsSync(join(goc, 'log-2026-11-01.tar.gz.sha256'))).toBe(false);
    expect(await suKien('van_hanh.log_xoa')).toMatchObject({ action: 'VAN_HANH_LOG_XOA', targetLabel: 'log-2026-11-01.tar.gz', after: { co: 14 } });
  });

  it.each([
    ['tệp không còn', 'log-2020-01-01.tar.gz', 404, 'LOG_KHONG_CO'],
    ['đi ngược thư mục', '..%2Fbi-mat.txt', 400, 'TEN_TEP_SAI'],
    ['tệp đang ghi', `policy-${homNay}.log`, 400, 'TEN_TEP_SAI'],
    ['tệp kiểm tra', 'log-2026-11-01.tar.gz.sha256', 400, 'TEN_TEP_SAI'],
  ])('xoá %s', async (_mo, ten, ma, code) => {
    const r = await (await goi()).delete(`/van-hanh/logs/${ten}`).set(voi('admin01'));
    expect(r.status).toBe(ma);
    expect(r.body.code).toBe(code);
  });

  it('không xoá được tệp ĐANG GHI của hôm nay qua bất kỳ đường nào', async () => {
    await (await goi()).delete(`/van-hanh/logs/dang-ghi`).set(voi('admin01'));
    await (await goi()).delete(`/van-hanh/logs/policy-${homNay}.log`).set(voi('admin01'));
    expect(existsSync(join(goc, 'dang-ghi', `policy-${homNay}.log`))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('`0252` nén log hằng ngày', () => {
  const luc = new Date('2026-11-06T00:20:00+07:00'); // hôm nay (giờ VN) là 06/11
  const viet = (ten: string, noiDung = 'dong\n') => writeFileSync(join(goc, 'dang-ghi', ten), noiDung);
  const tarDs = (p: string) => execFileSync('tar', ['-tzf', p], { encoding: 'utf8' }).split('\n').filter(Boolean).map((x) => x.replace(/^\.\//, '')).sort();
  beforeEach(async () => {
    dungCay();
    await datLaiLich();
  });

  it('mỗi ngày đã qua → MỘT tệp nén chứa đủ mọi service; tệp gốc chỉ xoá sau khi kiểm; HÔM NAY giữ nguyên', async () => {
    viet('policy-2026-11-04.log', 'p4\n');
    viet('audit-2026-11-04.log', 'a4\n');
    viet('policy-2026-11-05.log', 'p5\n');
    viet('policy-2026-11-06.log', 'p6\n');
    const r = await logs.nen(luc);
    expect(r.daNen).toEqual(['log-2026-11-04.tar.gz', 'log-2026-11-05.tar.gz']);
    expect(tarDs(join(goc, 'log-2026-11-04.tar.gz'))).toEqual(['audit-2026-11-04.log', 'policy-2026-11-04.log']);
    expect(readdirSync(join(goc, 'dang-ghi'))).toEqual(['policy-2026-11-06.log']);
    const bam = createHash('sha256').update(readFileSync(join(goc, 'log-2026-11-04.tar.gz'))).digest('hex');
    expect(readFileSync(join(goc, 'log-2026-11-04.tar.gz.sha256'), 'utf8')).toBe(`${bam}  log-2026-11-04.tar.gz\n`);
    expect(execFileSync('tar', ['-xzOf', join(goc, 'log-2026-11-04.tar.gz'), 'audit-2026-11-04.log'], { encoding: 'utf8' })).toBe('a4\n');
  });

  it('chạy lại ngay → không làm gì thêm, không tạo bản trùng', async () => {
    viet('policy-2026-11-05.log');
    await logs.nen(luc);
    const r = await logs.nen(luc);
    expect(r.daNen).toEqual([]);
    expect(readdirSync(goc).filter((t) => t.endsWith('.tar.gz'))).toEqual(['log-2026-11-05.tar.gz']);
  });

  it('lượt trước CHẾT sau khi nén mà trước khi dọn gốc → lượt sau chỉ kiểm rồi dọn, không nén lần hai', async () => {
    viet('policy-2026-11-05.log');
    execFileSync('tar', ['-czf', join(goc, 'log-2026-11-05.tar.gz'), '-C', join(goc, 'dang-ghi'), 'policy-2026-11-05.log']);
    const r = await logs.nen(luc);
    expect(r.daNen).toEqual(['log-2026-11-05.tar.gz']);
    expect(readdirSync(join(goc, 'dang-ghi'))).toEqual([]);
    expect(readdirSync(goc).filter((t) => t.endsWith('.tar.gz'))).toEqual(['log-2026-11-05.tar.gz']);
  });

  it('ngày ấy đã có tệp nén chứa tệp KHÁC → tệp mới mang hậu tố, KHÔNG ghi đè tệp cũ', async () => {
    viet('audit-2026-11-05.log');
    execFileSync('tar', ['-czf', join(goc, 'log-2026-11-05.tar.gz'), '-C', join(goc, 'dang-ghi'), 'audit-2026-11-05.log']);
    rmSync(join(goc, 'dang-ghi', 'audit-2026-11-05.log'));
    viet('policy-2026-11-05.log');
    const r = await logs.nen(luc);
    expect(r.daNen).toEqual(['log-2026-11-05-2.tar.gz']);
    expect(tarDs(join(goc, 'log-2026-11-05.tar.gz'))).toEqual(['audit-2026-11-05.log']);
    expect(tarDs(join(goc, 'log-2026-11-05-2.tar.gz'))).toEqual(['policy-2026-11-05.log']);
  });

  it('giữ tối đa N (cấu hình NEN_LOG): có 30 tệp nén, thêm một → xoá CŨ NHẤT, còn đúng 30', async () => {
    for (let d = 1; d <= 30; d++) {
      const ngay = new Date(Date.UTC(2026, 9, d)).toISOString().slice(0, 10);
      writeFileSync(join(goc, `log-${ngay}.tar.gz`), 'cu');
      writeFileSync(join(goc, `log-${ngay}.tar.gz.sha256`), 'cu');
    }
    viet('policy-2026-11-05.log');
    const r = await logs.nen(luc);
    expect(r.daXoa).toEqual(['log-2026-10-01.tar.gz']);
    expect(readdirSync(goc).filter((t: string) => t.endsWith('.tar.gz'))).toHaveLength(30);
    expect(existsSync(join(goc, 'log-2026-10-01.tar.gz.sha256'))).toBe(false);
  });

  it('hạ giới hạn từ 30 xuống 3 → lượt nén kế tiếp còn 3', async () => {
    for (let d = 1; d <= 6; d++) writeFileSync(join(goc, `log-2026-10-0${d}.tar.gz`), 'cu');
    await withAdminDb((c) => c.query(`UPDATE ops.cau_hinh_viec SET giu_toi_da = 3 WHERE viec = 'NEN_LOG'`));
    viet('policy-2026-11-05.log');
    await logs.nen(luc);
    expect(readdirSync(goc).filter((t) => t.endsWith('.tar.gz')).sort()).toEqual([
      'log-2026-10-05.tar.gz',
      'log-2026-10-06.tar.gz',
      'log-2026-11-05.tar.gz',
    ]);
  });

  it('nén HỎNG (không đọc lại được) → giữ nguyên tệp gốc, không đặt tên tệp nén', async () => {
    viet('policy-2026-11-05.log');
    const goc0 = process.env.PATH;
    const bin = mkdtempSync(join(tmpdir(), 'tar-hong-'));
    writeFileSync(join(bin, 'tar'), '#!/bin/sh\ncase "$1" in -czf) echo rac > "$2" ;; esac\nexit 0\n', { mode: 0o755 });
    process.env.PATH = `${bin}:${goc0}`;
    try {
      await expect(logs.nen(luc)).rejects.toThrow(/đọc lại không đủ/);
    } finally {
      process.env.PATH = goc0;
    }
    expect(readdirSync(join(goc, 'dang-ghi'))).toEqual(['policy-2026-11-05.log']);
    expect(readdirSync(goc).filter((t) => t.includes('.tar.gz'))).toEqual([]);
  });

  it('theo lịch: chưa tới giờ → không nén; tới giờ → nén và ghi MỘT lượt THÀNH CÔNG', async () => {
    viet('policy-2026-11-05.log');
    await withAdminDb(async (c) => {
      await c.query(`INSERT INTO ops.lan_chay (viec, bat_dau, ket_thuc, ket_qua) VALUES ('NEN_LOG', '2026-11-05 00:15+07', '2026-11-05 00:16+07', 'THANH_CONG')`);
    });
    expect(await logs.nenTheoLich(new Date('2026-11-06T00:10:00+07:00'))).toBeNull();
    const r = await logs.nenTheoLich(new Date('2026-11-06T00:15:00+07:00'));
    expect(r?.daNen).toEqual(['log-2026-11-05.tar.gz']);
    expect(await logs.nenTheoLich(new Date('2026-11-06T00:20:00+07:00'))).toBeNull();
    const ds = await withAdminDb(async (c) => (await c.query(`SELECT ket_qua FROM ops.lan_chay WHERE viec='NEN_LOG' ORDER BY id`)).rows);
    expect(ds.map((d) => d.ket_qua)).toEqual(['THANH_CONG', 'THANH_CONG']);
  });

  it('sự kiện của van-hanh tới được bus (relay đọc ops.outbox)', async () => {
    await (await goi()).put('/van-hanh/lich/NEN_LOG').set(voi('admin01')).send({ tanSuat: 'HANG_NGAY', gioChay: '00:15', giuToiDa: 30 });
    expect(await outbox.pumpOnce()).toBeGreaterThan(0);
  });
});
