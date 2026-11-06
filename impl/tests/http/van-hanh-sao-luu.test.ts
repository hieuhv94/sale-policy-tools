/**
 * `0253` — trang Vận hành, chặng B3b: bản sao lưu (liệt kê · tải · xoá) · ổ đĩa (đo, ngưỡng,
 * thư khi vượt) · thẻ Sức khoẻ.
 *
 * Thư mục sao lưu và bản sao ngoài là hai thư mục TẠM đặt qua `BACKUP_DIR` /
 * `BACKUP_MIRROR_DIR` — service đọc hai biến ấy mỗi lần gọi, nên mỗi khối ca dựng lại cây
 * của nó theo đúng bố cục `backup.sh` và `CHUP_KHO_TEP` ghi ra (`0250`). Gateway là một máy
 * HTTP giả trả `/readyz`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestApp, ODiaService, duBaoNgayDay, mocThanhIso } from '@csbh/van-hanh/testing';
import { createTestApp as createNotificationApp, NotifyService } from '@csbh/notification/testing';
import { Bus } from '@csbh/bus';
import { accessTokenFor, bootIdentityListening, clearAccountCache, http, mailpitClear, withAdminDb } from './app.js';

const SEED_PW = 'Test@1234';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
let identity: INestApplication;
let app: INestApplication;
let oDia: ODiaService;
let gateway: Server;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
let goc = '';
let ngoai = '';
let logDir = '';

const goi = async () => http(app);
const voi = (u: string) => ({ Authorization: `Bearer ${tok[u]}` });
const suKien = (key: string) =>
  withAdminDb(async (c) =>
    (await c.query<{ payload: Record<string, unknown> }>(`SELECT payload FROM ops.outbox WHERE routing_key = $1 ORDER BY seq DESC LIMIT 1`, [key]))
      .rows[0]?.payload,
  );
const demSuKien = (key: string) =>
  withAdminDb(async (c) => Number((await c.query(`SELECT count(*) AS n FROM ops.outbox WHERE routing_key = $1`, [key])).rows[0].n));

const datLaiODia = () =>
  withAdminDb(async (c) => {
    await c.query(`UPDATE ops.cau_hinh_o_dia SET nguong = 80, gui_thu = true, dang_vuot = false`);
    await c.query(`DELETE FROM ops.mau_o_dia`);
  });
const datLaiSaoLuu = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM ops.lan_chay WHERE viec IN ('SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP')`);
    await c.query(`UPDATE ops.cau_hinh_viec SET tan_suat='HANG_NGAY', gio_chay='01:15', thu_trong_tuan=NULL, giu_toi_da=7 WHERE viec='SAO_LUU_CSDL'`);
    await c.query(`UPDATE ops.cau_hinh_viec SET tan_suat='HANG_NGAY', gio_chay='02:00', thu_trong_tuan=NULL, giu_toi_da=7 WHERE viec='SAO_LUU_KHO_TEP'`);
  });

const M1 = '20261101T181500Z';
const M2 = '20261102T181500Z';
const M3 = '20261103T181500Z';
const csdl = (m: string) => `csbh-${m}.dump`;

/** Ba bản CSDL (bản cũ nhất KHÔNG có ở bản sao ngoài) và ba bản chụp liên kết cứng. */
const dungCay = () => {
  for (const d of [goc, ngoai]) {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  }
  for (const m of [M1, M2, M3]) writeFileSync(join(goc, csdl(m)), `PGDMP-${m}`);
  for (const m of [M2, M3]) writeFileSync(join(ngoai, csdl(m)), `PGDMP-${m}`);
  // Bản chụp: tệp `chung` có ở cả ba (một inode), mỗi bản thêm một tệp riêng.
  let truoc = '';
  for (const m of [M1, M2, M3]) {
    const t = join(goc, 'kho-tep', m, 'tep', 'csbh', 'ho-so');
    mkdirSync(t, { recursive: true });
    if (truoc) linkSync(join(truoc, 'chung'), join(t, 'chung'));
    else writeFileSync(join(t, 'chung'), 'x'.repeat(1000));
    writeFileSync(join(t, `rieng-${m}`), 'y'.repeat(10));
    truoc = t;
  }
  mkdirSync(join(ngoai, 'kho-tep', M2), { recursive: true });
  writeFileSync(join(ngoai, 'kho-tep', M2, 'dau'), '1');
};

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  for (const u of ['admin01', 'bld01', 'tdv01', 'kt01']) tok[u] = await accessTokenFor(identity, u, SEED_PW);
  goc = mkdtempSync(join(tmpdir(), 'csbh-sl-'));
  ngoai = mkdtempSync(join(tmpdir(), 'csbh-sl-ngoai-'));
  logDir = mkdtempSync(join(tmpdir(), 'csbh-sl-log-'));
  writeFileSync(join(logDir, 'a.log'), 'z'.repeat(500));
  process.env.BACKUP_DIR = goc;
  process.env.BACKUP_MIRROR_DIR = ngoai;
  process.env.CSBH_LOG_DIR = logDir;
  process.env.VAN_HANH_TU_CHAY = '0';
  gateway = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, services: [{ service: 'policy', ok: true, status: 200 }, { service: 'notification', ok: false, error: 'timeout' }] }));
  });
  await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', () => r()));
  process.env.GATEWAY_URL = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  app = await createTestApp();
  oDia = app.get(ODiaService);
  await datLaiODia();
  await datLaiSaoLuu();
}, 60_000);

afterAll(async () => {
  await datLaiODia();
  await datLaiSaoLuu();
  await app?.close();
  await identity?.close();
  await new Promise((r) => gateway?.close(r));
  for (const r of restores) r();
  for (const d of [goc, ngoai, logDir]) rmSync(d, { recursive: true, force: true });
  for (const k of ['BACKUP_DIR', 'BACKUP_MIRROR_DIR', 'CSBH_LOG_DIR', 'GATEWAY_URL']) delete process.env[k];
});

// ---------------------------------------------------------------------------
describe('`0253` chỉ Quản trị hệ thống', () => {
  it.each(['bld01', 'tdv01', 'kt01'])('%s nhận 403 ở mọi đường mới', async (u) => {
    const a = await goi();
    for (const r of [
      await a.get('/van-hanh/sao-luu').set(voi(u)),
      await a.get(`/van-hanh/sao-luu/csdl/${csdl(M1)}/tai`).set(voi(u)),
      await a.delete(`/van-hanh/sao-luu/csdl/${csdl(M1)}`).set(voi(u)),
      await a.delete(`/van-hanh/sao-luu/kho-tep/${M1}`).set(voi(u)),
      await a.get('/van-hanh/o-dia').set(voi(u)),
      await a.put('/van-hanh/o-dia/nguong').set(voi(u)).send({ nguong: 50, guiThu: true }),
      await a.get('/van-hanh/suc-khoe').set(voi(u)),
    ]) {
      expect(r.status, r.req.path).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------------
describe('`0253` bản sao lưu', () => {
  beforeEach(async () => {
    dungCay();
    await datLaiSaoLuu();
  });

  it('mocThanhIso đổi mốc tên tệp sang ISO', () => {
    expect(mocThanhIso(M1)).toBe('2026-11-01T18:15:00Z');
  });

  it('GET /van-hanh/sao-luu — mới nhất trước, đánh dấu bản mới nhất và bản có ở bản sao ngoài', async () => {
    const r = await (await goi()).get('/van-hanh/sao-luu').set(voi('admin01'));
    expect(r.status).toBe(200);
    expect(r.body.csdl.map((b: { ten: string }) => b.ten)).toEqual([csdl(M3), csdl(M2), csdl(M1)]);
    expect(r.body.csdl.map((b: { moiNhat: boolean }) => b.moiNhat)).toEqual([true, false, false]);
    expect(r.body.csdl.map((b: { coBanSaoNgoai: boolean }) => b.coBanSaoNgoai)).toEqual([true, true, false]);
    expect(r.body.csdl[0]).toMatchObject({ luc: '2026-11-03T18:15:00Z', co: `PGDMP-${M3}`.length });
  });

  it('bản chụp: "chiếm thêm" chỉ đếm tệp riêng của bản ấy — tệp chung qua liên kết cứng không tính', async () => {
    const r = await (await goi()).get('/van-hanh/sao-luu').set(voi('admin01'));
    expect(r.body.khoTep.map((b: { moc: string }) => b.moc)).toEqual([M3, M2, M1]);
    for (const b of r.body.khoTep) expect(b).toMatchObject({ soTep: 2, chiemThem: 10 });
    expect(r.body.khoTep.map((b: { coBanSaoNgoai: boolean }) => b.coBanSaoNgoai)).toEqual([false, true, false]);
    // Chỉ còn một bản giữ tệp chung → nó thành phần "chiếm thêm" của bản ấy.
    rmSync(join(goc, 'kho-tep', M1), { recursive: true });
    rmSync(join(goc, 'kho-tep', M2), { recursive: true });
    const r2 = await (await goi()).get('/van-hanh/sao-luu').set(voi('admin01'));
    expect(r2.body.khoTep).toEqual([expect.objectContaining({ moc: M3, chiemThem: 1010 })]);
  });

  it('thư mục sao lưu trống / chưa có bản nào → hai danh sách rỗng, không lỗi', async () => {
    rmSync(goc, { recursive: true, force: true });
    mkdirSync(goc);
    const r = await (await goi()).get('/van-hanh/sao-luu').set(voi('admin01'));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ csdl: [], khoTep: [] });
  });

  it('tải bản CSDL → đúng byte, tên tệp không có chữ "dump", ghi một dòng nhật ký', async () => {
    const r = await (await goi())
      .get(`/van-hanh/sao-luu/csdl/${csdl(M2)}/tai`)
      .set(voi('admin01'))
      .buffer(true)
      .parse((res, cb) => {
        const parts: Buffer[] = [];
        res.on('data', (d: Buffer) => parts.push(d));
        res.on('end', () => cb(null, Buffer.concat(parts)));
      });
    expect(r.status).toBe(200);
    expect((r.body as Buffer).toString()).toBe(`PGDMP-${M2}`);
    expect(r.headers['content-disposition']).toContain(`csbh-sao-luu-${M2}.backup`);
    expect(r.headers['content-disposition']).not.toMatch(/dump/);
    expect(await suKien('van_hanh.sao_luu_tai')).toMatchObject({ action: 'VAN_HANH_SAO_LUU_TAI', targetLabel: csdl(M2) });
  });

  it('bản chụp kho tệp KHÔNG có đường tải', async () => {
    const r = await (await goi()).get(`/van-hanh/sao-luu/kho-tep/${M2}/tai`).set(voi('admin01'));
    expect(r.status).toBe(404);
  });

  it('xoá bản CSDL cũ, KHÔNG kèm bản sao ngoài → mất tại chỗ, còn ở bản sao ngoài; nhật ký ghi cỡ', async () => {
    const r = await (await goi()).delete(`/van-hanh/sao-luu/csdl/${csdl(M2)}`).set(voi('admin01'));
    expect(r.status, JSON.stringify(r.body)).toBe(204);
    expect(existsSync(join(goc, csdl(M2)))).toBe(false);
    expect(existsSync(join(ngoai, csdl(M2)))).toBe(true);
    expect(await suKien('van_hanh.sao_luu_xoa')).toMatchObject({
      action: 'VAN_HANH_SAO_LUU_XOA',
      targetLabel: csdl(M2),
      after: { loai: 'CSDL', co: `PGDMP-${M2}`.length, caBanSaoNgoai: false },
    });
  });

  it('xoá kèm bản sao ngoài → mất ở CẢ HAI nơi', async () => {
    const r = await (await goi()).delete(`/van-hanh/sao-luu/csdl/${csdl(M2)}?caBanSaoNgoai=1`).set(voi('admin01'));
    expect(r.status).toBe(204);
    expect(existsSync(join(goc, csdl(M2)))).toBe(false);
    expect(existsSync(join(ngoai, csdl(M2)))).toBe(false);
    expect((await suKien('van_hanh.sao_luu_xoa'))?.after).toMatchObject({ caBanSaoNgoai: true });
  });

  it('không xoá được bản MỚI NHẤT → 409 SAO_LUU_CUOI_CUNG, tệp còn nguyên', async () => {
    const r = await (await goi()).delete(`/van-hanh/sao-luu/csdl/${csdl(M3)}`).set(voi('admin01'));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SAO_LUU_CUOI_CUNG');
    expect(existsSync(join(goc, csdl(M3)))).toBe(true);
  });

  it('đang có lượt sao lưu CSDL chạy → 409 SAO_LUU_DANG_CHAY; lượt "đang chạy" quá một giờ (chết dở) không chặn', async () => {
    await withAdminDb((c) => c.query(`INSERT INTO ops.lan_chay (viec) VALUES ('SAO_LUU_CSDL')`));
    const r = await (await goi()).delete(`/van-hanh/sao-luu/csdl/${csdl(M1)}`).set(voi('admin01'));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SAO_LUU_DANG_CHAY');
    expect(existsSync(join(goc, csdl(M1)))).toBe(true);
    // Lượt kho tệp đang chạy KHÔNG chặn việc xoá bản CSDL — hai loại độc lập.
    await withAdminDb((c) => c.query(`UPDATE ops.lan_chay SET viec = 'SAO_LUU_KHO_TEP' WHERE viec = 'SAO_LUU_CSDL'`));
    expect((await (await goi()).delete(`/van-hanh/sao-luu/csdl/${csdl(M1)}`).set(voi('admin01'))).status).toBe(204);
    // … nhưng chặn việc xoá bản chụp.
    const r2 = await (await goi()).delete(`/van-hanh/sao-luu/kho-tep/${M1}`).set(voi('admin01'));
    expect(r2.body.code).toBe('SAO_LUU_DANG_CHAY');
    await withAdminDb((c) => c.query(`UPDATE ops.lan_chay SET bat_dau = now() - interval '2 hours'`));
    expect((await (await goi()).delete(`/van-hanh/sao-luu/kho-tep/${M1}`).set(voi('admin01'))).status).toBe(204);
  });

  it.each([
    ['csdl', 'csbh-20261101.dump'],
    ['csdl', '..%2F..%2Fetc%2Fpasswd'],
    ['csdl', 'csbh-20261101T181500Z.dump.bak'],
    ['kho-tep', '20261101T181500Z%2F..'],
    ['kho-tep', '2026-11-01'],
  ])('tên lạ (%s: %s) → 400 TEN_TEP_SAI, không đụng tệp nào', async (loai, ten) => {
    const r = await (await goi()).delete(`/van-hanh/sao-luu/${loai}/${ten}`).set(voi('admin01'));
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(r.body.code).toBe('TEN_TEP_SAI');
    expect(existsSync(join(goc, csdl(M1)))).toBe(true);
    expect(existsSync(join(goc, 'kho-tep', M1))).toBe(true);
  });

  it('đoạn ".." bị chuẩn hoá ngay trong URL → không tới đường xoá nào (404), không đụng tệp', async () => {
    for (const p of ['/van-hanh/sao-luu/csdl/%2E%2E', '/van-hanh/sao-luu/kho-tep/..']) {
      const r = await (await goi()).delete(p).set(voi('admin01'));
      expect(r.status, p).toBe(404);
      expect(r.body.code).not.toBe('SAO_LUU_KHONG_CO');
    }
    expect(existsSync(join(goc, csdl(M1)))).toBe(true);
    expect(existsSync(join(goc, 'kho-tep', M1))).toBe(true);
  });

  it('tên đúng mẫu mà không có tệp → 404 SAO_LUU_KHONG_CO (cả tải lẫn xoá)', async () => {
    const a = await goi();
    const t = await a.get(`/van-hanh/sao-luu/csdl/${csdl('20200101T000000Z')}/tai`).set(voi('admin01'));
    expect(t.status).toBe(404);
    expect(t.body.code).toBe('SAO_LUU_KHONG_CO');
    const x = await a.delete(`/van-hanh/sao-luu/kho-tep/20200101T000000Z`).set(voi('admin01'));
    expect(x.body.code).toBe('SAO_LUU_KHONG_CO');
  });

  it('xoá bản chụp cũ → bản mới vẫn đọc đủ mọi tệp (kể cả tệp chung); kèm bản sao ngoài thì mất ở cả hai', async () => {
    const r = await (await goi()).delete(`/van-hanh/sao-luu/kho-tep/${M2}?caBanSaoNgoai=1`).set(voi('admin01'));
    expect(r.status).toBe(204);
    expect(existsSync(join(goc, 'kho-tep', M2))).toBe(false);
    expect(existsSync(join(ngoai, 'kho-tep', M2))).toBe(false);
    const moi = join(goc, 'kho-tep', M3, 'tep', 'csbh', 'ho-so');
    expect(readFileSync(join(moi, 'chung'), 'utf8')).toBe('x'.repeat(1000));
    expect(readFileSync(join(moi, `rieng-${M3}`), 'utf8')).toBe('y'.repeat(10));
    expect(statSync(join(moi, 'chung')).nlink).toBe(2); // còn M1 và M3
    expect(await suKien('van_hanh.sao_luu_xoa')).toMatchObject({
      targetLabel: `kho-tep/${M2}`,
      after: { loai: 'KHO_TEP', soTep: 2, caBanSaoNgoai: true },
    });
  });

  it('không xoá được bản chụp MỚI NHẤT → 409 SAO_LUU_CUOI_CUNG', async () => {
    const r = await (await goi()).delete(`/van-hanh/sao-luu/kho-tep/${M3}`).set(voi('admin01'));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SAO_LUU_CUOI_CUNG');
    expect(existsSync(join(goc, 'kho-tep', M3))).toBe(true);
  });

  it('máy chủ chưa khai thư mục sao lưu → 404 SAO_LUU_CHUA_CAU_HINH', async () => {
    delete process.env.BACKUP_DIR;
    try {
      const r = await (await goi()).get('/van-hanh/sao-luu').set(voi('admin01'));
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('SAO_LUU_CHUA_CAU_HINH');
    } finally {
      process.env.BACKUP_DIR = goc;
    }
  });
});

// ---------------------------------------------------------------------------
describe('`0253` dự báo ngày đầy (hàm thuần)', () => {
  const bayGio = new Date('2026-11-06T00:00:00Z');
  const chuoi = (soMau: number, buocGio: number, tang: number) =>
    Array.from({ length: soMau }, (_, i) => ({
      luc: new Date(bayGio.getTime() - (soMau - 1 - i) * buocGio * 3_600_000).toISOString(),
      dung: 100e9 + i * tang,
      tong: 200e9,
    }));

  it('dưới 24 mẫu → chưa đủ dữ liệu', () => {
    expect(duBaoNgayDay(chuoi(23, 6, 1e9), bayGio)).toBeNull();
  });
  it('đủ mẫu nhưng trải dưới một ngày → chưa đủ dữ liệu', () => {
    expect(duBaoNgayDay(chuoi(30, 0.5, 1e9), bayGio)).toBeNull();
  });
  it('ổ không lớn dần (phẳng hoặc giảm) → không dự báo', () => {
    expect(duBaoNgayDay(chuoi(48, 1, 0), bayGio)).toBeNull();
    expect(duBaoNgayDay(chuoi(48, 1, -1e6), bayGio)).toBeNull();
  });
  it('tăng đều 1 GB mỗi giờ (24 GB/ngày), còn ~52 GB → đầy sau 2 ngày', () => {
    // Mẫu cuối dùng 100 + 47 = 147 GB / 200 → còn 53 GB ÷ 24 GB/ngày = 2,2 → 2.
    expect(duBaoNgayDay(chuoi(48, 1, 1e9), bayGio)).toBe(2);
  });
  it('chỉ dùng mẫu 7 ngày gần nhất — mẫu cũ hơn không kéo lệch dốc', () => {
    const cu = Array.from({ length: 50 }, (_, i) => ({ luc: new Date(bayGio.getTime() - (20 - i * 0.1) * 86_400_000).toISOString(), dung: 0, tong: 200e9 }));
    expect(duBaoNgayDay([...cu, ...chuoi(48, 1, 1e9)], bayGio)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('`0253` ổ đĩa qua API', () => {
  beforeEach(async () => {
    dungCay();
    await datLaiODia();
  });

  it('GET /van-hanh/o-dia — hai ổ, cùng thiết bị thì nói ra; hạng mục đếm tệp liên kết cứng MỘT lần', async () => {
    const r = await (await goi()).get('/van-hanh/o-dia').set(voi('admin01'));
    expect(r.status).toBe(200);
    expect(r.body.nguong).toBe(80);
    expect(r.body.guiThu).toBe(true);
    expect(r.body.theoO.map((d: { o: string }) => d.o)).toEqual(['du-lieu', 'ban-sao-ngoai']);
    for (const d of r.body.theoO) {
      expect(d.tong).toBeGreaterThan(0);
      expect(d.dung + d.conLai).toBe(d.tong);
      expect(d.phanTram).toBeGreaterThanOrEqual(0);
      expect(d.duBaoNgayDay).toBeNull();
    }
    expect(r.body.theoO[1].cungODuLieu).toBe(true); // hai thư mục tạm cùng một ổ
    const hm = Object.fromEntries(r.body.theoHangMuc.map((h: { hangMuc: string; co: number }) => [h.hangMuc, h.co]));
    expect(Object.keys(hm)).toEqual(['csdl', 'kho-tep', 'ban-sao-luu', 'tep-log']);
    expect(hm['csdl']).toBeGreaterThan(0);
    // 3 bản CSDL (22 byte) + tệp chung 1000 (một lần, dù ba liên kết) + 3 tệp riêng 10.
    expect(hm['ban-sao-luu']).toBe(3 * `PGDMP-${M1}`.length + 1000 + 30);
    expect(hm['tep-log']).toBe(500);
    expect(Object.keys(r.body.lichSu)).toEqual(['du-lieu', 'ban-sao-ngoai']);
  });

  it('PUT ngưỡng hợp lệ → lưu, trả cấu hình mới, ghi nhật ký trước/sau', async () => {
    const r = await (await goi()).put('/van-hanh/o-dia/nguong').set(voi('admin01')).send({ nguong: 70, guiThu: false });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ nguong: 70, guiThu: false });
    expect(await suKien('van_hanh.nguong_doi')).toMatchObject({
      action: 'VAN_HANH_NGUONG_DOI',
      before: { nguong: 80, guiThu: true },
      after: { nguong: 70, guiThu: false },
    });
    expect((await (await goi()).get('/van-hanh/o-dia').set(voi('admin01'))).body.nguong).toBe(70);
  });

  it.each([[0], [100], [-5], [1.5], ['abc'], [null]])('ngưỡng %s → 400 NGUONG_KHONG_HOP_LE, cấu hình không đổi', async (n) => {
    const r = await (await goi()).put('/van-hanh/o-dia/nguong').set(voi('admin01')).send({ nguong: n, guiThu: true });
    expect(r.status).toBe(400);
    expect(['NGUONG_KHONG_HOP_LE', 'VALIDATION_FAILED']).toContain(r.body.code);
    expect((await oDia.cauHinh()).nguong).toBe(80);
  });

  it('đo hằng giờ: lượt đầu ghi một mẫu mỗi ổ; lượt sau trong vòng 55 phút bỏ qua', async () => {
    const t = new Date();
    expect(await oDia.doVaBao(t)).toMatchObject({ daDo: true });
    expect(await oDia.doVaBao(new Date(t.getTime() + 30 * 60_000))).toEqual({ daDo: false, daBao: false });
    expect(await oDia.doVaBao(new Date(t.getTime() + 61 * 60_000))).toMatchObject({ daDo: true });
    const n = await withAdminDb(async (c) => (await c.query(`SELECT o, count(*)::int AS n FROM ops.mau_o_dia GROUP BY o ORDER BY o`)).rows);
    expect(n).toEqual([
      { o: 'ban-sao-ngoai', n: 2 },
      { o: 'du-lieu', n: 2 },
    ]);
  });

  it('mẫu cũ hơn 90 ngày bị dọn ở lượt đo', async () => {
    await withAdminDb((c) => c.query(`INSERT INTO ops.mau_o_dia (luc, o, tong, dung) VALUES (now() - interval '91 days', 'du-lieu', 10, 1), (now() - interval '89 days', 'du-lieu', 10, 1)`));
    await oDia.doVaBao(new Date());
    const n = await withAdminDb(async (c) => (await c.query(`SELECT count(*)::int AS n FROM ops.mau_o_dia WHERE luc < now() - interval '1 day'`)).rows[0].n);
    expect(n).toBe(1);
  });

  it('VƯỢT ngưỡng: báo MỘT lần khi đi từ dưới lên; ở trên nhiều giờ không báo lại; xuống rồi vượt lại thì báo lại', async () => {
    const truoc = await demSuKien('van_hanh.o_dia_vuot_nguong');
    await withAdminDb((c) => c.query(`UPDATE ops.cau_hinh_o_dia SET nguong = 1`));
    const t = Date.now();
    expect(await oDia.doVaBao(new Date(t))).toEqual({ daDo: true, daBao: true });
    const sk = await suKien('van_hanh.o_dia_vuot_nguong');
    expect(sk).toMatchObject({ action: 'VAN_HANH_O_DIA_VUOT_NGUONG', nguong: 1 });
    expect(typeof sk?.['phanTram']).toBe('number');
    expect(typeof sk?.['conLai']).toBe('number');
    expect(await oDia.doVaBao(new Date(t + 61 * 60_000))).toEqual({ daDo: true, daBao: false });
    expect(await oDia.doVaBao(new Date(t + 122 * 60_000))).toEqual({ daDo: true, daBao: false });
    expect(await demSuKien('van_hanh.o_dia_vuot_nguong')).toBe(truoc + 1);
    // Xuống dưới (ngưỡng 99, giữ trạng thái "đã báo" để thấy nó được XOÁ bởi lượt đo).
    await withAdminDb((c) => c.query(`UPDATE ops.cau_hinh_o_dia SET nguong = 99`));
    await oDia.doVaBao(new Date(t + 183 * 60_000));
    expect((await oDia.cauHinh()).dangVuot).toBe(false);
    await withAdminDb((c) => c.query(`UPDATE ops.cau_hinh_o_dia SET nguong = 1`));
    expect(await oDia.doVaBao(new Date(t + 244 * 60_000))).toEqual({ daDo: true, daBao: true });
    expect(await demSuKien('van_hanh.o_dia_vuot_nguong')).toBe(truoc + 2);
  });

  it('đổi ngưỡng trên web quên trạng thái "đã báo" — ngưỡng mới vẫn ra một lá thư', async () => {
    await withAdminDb((c) => c.query(`UPDATE ops.cau_hinh_o_dia SET nguong = 1, dang_vuot = true`));
    const t = Date.now();
    expect((await oDia.doVaBao(new Date(t))).daBao).toBe(false);
    await (await goi()).put('/van-hanh/o-dia/nguong').set(voi('admin01')).send({ nguong: 2, guiThu: true });
    expect((await oDia.doVaBao(new Date(t + 61 * 60_000))).daBao).toBe(true);
  });

  it('tắt gửi thư → vượt ngưỡng vẫn ghi trạng thái, KHÔNG phát sự kiện thư', async () => {
    const truoc = await demSuKien('van_hanh.o_dia_vuot_nguong');
    await withAdminDb((c) => c.query(`UPDATE ops.cau_hinh_o_dia SET nguong = 1, gui_thu = false`));
    expect(await oDia.doVaBao(new Date())).toEqual({ daDo: true, daBao: false });
    expect((await oDia.cauHinh()).dangVuot).toBe(true);
    expect(await demSuKien('van_hanh.o_dia_vuot_nguong')).toBe(truoc);
  });
});

// ---------------------------------------------------------------------------
describe('`0253` thẻ Sức khoẻ', () => {
  beforeEach(async () => {
    dungCay();
    await datLaiSaoLuu();
  });

  /** Giờ VN cách đây 3 tiếng — mốc lịch hằng ngày đã trôi hơn 2 giờ. */
  const gioTruoc3Tieng = () => {
    const d = new Date(Date.now() + 7 * 3_600_000 - 3 * 3_600_000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };

  it('gom thành phần (từ /readyz của gateway), hàng đợi lỗi, sự kiện chờ phát, thư hỏng, ổ đĩa', async () => {
    const r = await (await goi()).get('/van-hanh/suc-khoe').set(voi('admin01'));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.thanhPhan.services).toEqual([
      expect.objectContaining({ service: 'policy', ok: true }),
      expect.objectContaining({ service: 'notification', ok: false }),
    ]);
    expect(r.body.hangDoiLoi.map((h: { hangDoi: string }) => h.hangDoi)).toEqual(['thong-bao', 'tep', 'ho-so', 'nhat-ky', 'bao-cao']);
    for (const h of r.body.hangDoiLoi) expect(h.so === null || typeof h.so === 'number').toBe(true);
    const nguon = r.body.suKienChoPhat.map((o: { nguon: string }) => o.nguon);
    for (const n of ['cat', 'cus', 'doc', 'idn', 'ops', 'pol']) expect(nguon).toContain(n);
    expect(typeof r.body.thuHong).toBe('number');
    expect(r.body.oDia.map((d: { o: string }) => d.o)).toEqual(['du-lieu', 'ban-sao-ngoai']);
  });

  it('hàng đợi lỗi CHƯA TỒN TẠI → null, tiến trình không chết; hàng đợi có thật → đúng số thư', async () => {
    const bus = new Bus();
    try {
      expect(await bus.demHangDoi(`khong.co.${randomUUID()}`)).toBeNull();
      const q = `zz.vh.${randomUUID()}`;
      const ch = await bus.channel();
      await ch.assertQueue(q, { autoDelete: true });
      ch.sendToQueue(q, Buffer.from('1'));
      ch.sendToQueue(q, Buffer.from('2'));
      await ch.waitForConfirms();
      expect(await bus.demHangDoi(q)).toBe(2);
      // Kênh chung vẫn sống sau lượt 404 ở trên.
      expect(await bus.demHangDoi(`khong.co.${randomUUID()}`)).toBeNull();
      await ch.deleteQueue(q);
    } finally {
      await bus.close();
    }
  });

  it('sự kiện chờ phát và thư hỏng đếm ĐÚNG số thật', async () => {
    const id = randomUUID();
    const dem = async () => {
      const b = (await (await goi()).get('/van-hanh/suc-khoe').set(voi('admin01'))).body;
      return { ops: b.suKienChoPhat.find((o: { nguon: string }) => o.nguon === 'ops').so as number, thu: b.thuHong as number };
    };
    const truoc = await dem();
    await withAdminDb(async (c) => {
      await c.query(`INSERT INTO ops.outbox (routing_key, payload) VALUES ('van_hanh.thu', '{}')`);
      await c.query(`INSERT INTO ntf.dead_letter (event_id, routing_key, payload, last_error, attempts) VALUES ($1, 'x', '{}', 'thử', 1)`, [id]);
    });
    try {
      expect(await dem()).toEqual({ ops: truoc.ops + 1, thu: truoc.thu + 1 });
    } finally {
      await withAdminDb(async (c) => {
        await c.query(`DELETE FROM ops.outbox WHERE routing_key = 'van_hanh.thu'`);
        await c.query(`DELETE FROM ntf.dead_letter WHERE event_id = $1`, [id]);
      });
    }
  });

  it('sao lưu QUÁ HẠN khi mốc lịch đã trôi hơn 2 giờ mà chưa có lượt thành công; có lượt thành công thì hết', async () => {
    const gio = gioTruoc3Tieng();
    await withAdminDb((c) => c.query(`UPDATE ops.cau_hinh_viec SET gio_chay = $1 WHERE viec IN ('SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP')`, [gio]));
    const sl = async () => (await (await goi()).get('/van-hanh/suc-khoe').set(voi('admin01'))).body.saoLuu;
    expect((await sl()).map((s: { viec: string; quaHan: boolean }) => [s.viec, s.quaHan])).toEqual([
      ['SAO_LUU_CSDL', true],
      ['SAO_LUU_KHO_TEP', true],
    ]);
    await withAdminDb((c) =>
      c.query(`INSERT INTO ops.lan_chay (viec, ket_thuc, ket_qua) VALUES ('SAO_LUU_CSDL', now(), 'THANH_CONG')`),
    );
    const s = await sl();
    expect(s[0]).toMatchObject({ viec: 'SAO_LUU_CSDL', quaHan: false, lanGanNhat: 'THANH_CONG' });
    expect(s[0].lanThanhCong).not.toBeNull();
    expect(s[1]).toMatchObject({ viec: 'SAO_LUU_KHO_TEP', quaHan: true, lanThanhCong: null });
  });

  it('gateway không trả lời → thành phần báo gateway hỏng, trang vẫn trả 200', async () => {
    const cu = process.env.GATEWAY_URL;
    process.env.GATEWAY_URL = 'http://127.0.0.1:1';
    try {
      const r = await (await goi()).get('/van-hanh/suc-khoe').set(voi('admin01'));
      expect(r.status).toBe(200);
      expect(r.body.thanhPhan).toMatchObject({ ok: false, services: [expect.objectContaining({ service: 'gateway', ok: false })] });
    } finally {
      process.env.GATEWAY_URL = cu;
    }
  });
});

// ---------------------------------------------------------------------------
describe('`0253` thư cảnh báo ổ đĩa tới MỌI Quản trị', () => {
  let ntf: INestApplication;
  let notify: NotifyService;
  const idThu: string[] = [];

  beforeAll(async () => {
    ntf = await createNotificationApp();
    notify = ntf.get(NotifyService);
  }, 60_000);
  afterAll(async () => {
    await withAdminDb(async (c) => {
      await c.query(`DELETE FROM ntf.thong_bao WHERE event_id = ANY($1::uuid[])`, [idThu]).catch(() => undefined);
      await c.query(`DELETE FROM ntf.sent_mail WHERE event_id = ANY($1::uuid[])`, [idThu]);
      await c.query(`DELETE FROM idn.app_user WHERE username = 'zzvh_khoa'`);
    });
    await ntf?.close();
  });

  const suKienODia = (over: Record<string, unknown> = {}) => {
    const eventId = randomUUID();
    idThu.push(eventId);
    return {
      eventId,
      routingKey: 'van_hanh.o_dia_vuot_nguong',
      payload: { o: 'du-lieu', phanTram: 84.2, nguong: 80, conLai: 32e9, duBaoNgayDay: 41, at: new Date().toISOString(), ...over },
    };
  };

  it('identity: danh sách Quản trị chỉ gồm tài khoản QUAN_TRI ĐANG hoạt động', async () => {
    // Dữ liệu mẫu không có Quản trị nào bị khoá — thiếu dòng này thì bỏ `is_active` khỏi câu
    // SQL vẫn xanh (phá lại đo được).
    await withAdminDb((c) =>
      c.query(`INSERT INTO idn.app_user (username, email, full_name, role, password_hash, is_active)
               VALUES ('zzvh_khoa', 'zzvh-khoa@csbh.test', 'Quan tri da khoa', 'QUAN_TRI', 'x', false)
               ON CONFLICT (username) DO UPDATE SET is_active = false`),
    );
    const quanTri = await withAdminDb(async (c) =>
      (await c.query(`SELECT email FROM idn.app_user WHERE role = 'QUAN_TRI' AND is_active ORDER BY username`)).rows.map((r) => r.email),
    );
    const { targets } = (await (
      await fetch(`${process.env.IDENTITY_URL}/internal/users/quan-tri`, {
        headers: { 'X-Service-Token': (await import('@csbh/http-kit')).mintServiceToken('notification') },
      })
    ).json()) as { targets: { email: string; role: string }[] };
    expect(targets.map((t) => t.email)).toEqual(quanTri);
    expect(targets.map((t) => t.email)).not.toContain('zzvh-khoa@csbh.test');
    await withAdminDb((c) => c.query(`DELETE FROM idn.app_user WHERE username = 'zzvh_khoa'`));
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) expect(t.role).toBe('QUAN_TRI');
  });

  it('một sự kiện → MỘT lá thư tới mọi Quản trị, câu chữ không thuật ngữ kỹ thuật, kèm chuông', async () => {
    await mailpitClear();
    const ev = suKienODia();
    expect(await notify.handle(ev)).toBe('sent');
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json()) as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    expect(list.messages).toHaveLength(1);
    const m = list.messages[0]!;
    expect(m.To.map((t) => t.Address)).toContain('admin01@csbh.test');
    const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string };
    expect(m.Subject + full.Text).toMatch(/84/);
    expect(full.Text).toContain('/van-hanh');
    expect(m.Subject + full.Text).not.toMatch(/statfs|docker|volume|\bdf\b|inode|\/dev\//i);
    const chuong = await withAdminDb(async (c) =>
      (await c.query(`SELECT kind, action, duong_dan FROM ntf.thong_bao WHERE event_id = $1`, [ev.eventId])).rows,
    );
    expect(chuong.length).toBeGreaterThan(0);
    for (const t of chuong) expect(t).toMatchObject({ kind: 'CHINH', action: 'O_DIA_VUOT_NGUONG' });
  });

  it('cùng sự kiện tới hai lần → lần hai là trùng, không lá thư thứ hai', async () => {
    const ev = suKienODia();
    expect(await notify.handle(ev)).toBe('sent');
    expect(await notify.handle(ev)).toBe('duplicate');
  });

  it('sự kiện thiếu số liệu → bỏ qua, không thư', async () => {
    expect(await notify.handle(suKienODia({ phanTram: undefined }))).toBe('ignored');
  });
});
