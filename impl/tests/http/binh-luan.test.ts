/**
 * `0261` — bình luận trên hồ sơ CSBH, tầng HTTP với Postgres thật.
 *
 * Bốn service chạy thật (identity, catalog, customer, policy) — danh sách nhắc tên và
 * tên người viết đi qua identity bằng HTTP, đúng đường sản phẩm đi.
 *
 * Danh mục ca ở `agents/KE-HOACH-BINH-LUAN.md` — mỗi `describe` dưới đây là một nhóm
 * của danh mục ấy. Thông báo (`0262`) và tệp (`0263`) có tệp kiểm riêng ở chặng của chúng.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createPolicyApp, BinhLuanService } from '@csbh/policy/testing';
import { RULES, ruleFor } from '@csbh/gateway/testing';
import { dauNhac, GIOI_HAN_BINH_LUAN } from '@csbh/domain-policy';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  http,
  idNguoiDung,
  maDuyNhat,
  mstDuyNhat,
  phanCongMacDinh,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZBL';
const NGUOI = ['tdv01', 'tdv02', 'tbp01', 'tbp02', 'kt01', 'kt02', 'sa01', 'admin01', 'bld01'];

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let app: INestApplication;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
let id: Record<string, string> = {};

const goi = async (method: 'get' | 'post' | 'patch' | 'delete' | 'put', path: string, who: string, body?: object) => {
  const r = (await http(app))[method](path).set('Authorization', `Bearer ${tok[who]}`);
  return body ? r.send(body) : r;
};
const act = async (policyId: string, action: string, who: string) =>
  goi('post', `/policies/${policyId}/actions/${action}`, who, await phanCongMacDinh(action));

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';
const uniq = (k: string) => maDuyNhat(P, k);

const makeProduct = async () => {
  const r = await (await http(catalog))
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('SP'), name: 'Nutricare Gold', groupCode, price: '100000' });
  if (r.status !== 201) throw new Error(`tạo sản phẩm hỏng: ${JSON.stringify(r.body)}`);
  return r.body.id as string;
};

const makeCustomer = async () => {
  const r = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      code: uniq('KH'),
      name: 'Nha thuoc binh luan',
      customerType: 1,
      province: 'Hà Nội',
      streetWard: 'Hà Nội',
      ownerName: 'Chu ho',
      ownerTitle: 'Chu ho',
      idNumber: mstDuyNhat(),
      phone: '0900000000',
    });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return r.body.id as string;
};

/** Hồ sơ Nháp của tdv01. `buoc` đẩy nó tới đâu trong luồng. */
const hoSo = async (buoc: 'nhap' | 'gui' | 'ky' | 'hieu-luc' = 'nhap') => {
  const r = await goi('post', '/policies', 'tdv01', {
    customerId: await makeCustomer(),
    lines: [{ productId: await makeProduct(), wholesalePrice: '90000', cpbh: ['5000'] }],
  });
  if (r.status !== 201) throw new Error(`tạo hồ sơ hỏng: ${JSON.stringify(r.body)}`);
  const pid = r.body.id as string;
  if (buoc === 'nhap') return pid;
  expect((await act(pid, 'SUBMIT', 'tdv01')).status).toBe(200);
  if (buoc === 'gui') return pid;
  expect((await act(pid, 'TBP_SIGN', 'tbp01')).status).toBe(200);
  if (buoc === 'ky') return pid;
  expect((await act(pid, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
  for (const kind of ['SCAN', 'BAN_MEM']) {
    expect(
      (await goi('post', `/policies/${pid}/attachments`, 'sa01', {
        kind,
        fileName: `${kind}.pdf`,
        objectKey: `bl/${pid}/${kind}.pdf`,
      })).status,
    ).toBe(201);
  }
  expect((await act(pid, 'SA_HANDOVER', 'sa01')).status).toBe(200);
  expect((await act(pid, 'KT_RECEIVE_L2', 'kt01')).status).toBe(200);
  return pid;
};

const viet = (pid: string, noiDung: string, who = 'tdv01', extra: object = {}) =>
  goi('post', `/policies/${pid}/binh-luan`, who, { maGui: randomUUID(), noiDung, ...extra });

const suKien = (pid: string) =>
  withAdminDb(async (c) =>
    (
      await c.query<{ routing_key: string; payload: Record<string, unknown> }>(
        `SELECT routing_key, payload FROM pol.outbox WHERE payload->>'policyId' = $1 ORDER BY seq`,
        [pid],
      )
    ).rows,
  );

const cleanup = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM pol.outbox`);
    await c.query(`ALTER TABLE pol.policy DISABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(
      `DELETE FROM pol.policy WHERE customer_id IN (SELECT id FROM cus.customer WHERE code LIKE $1)`,
      [`${P}%`],
    );
    await c.query(`ALTER TABLE pol.policy ENABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.discount_rule WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.outbox`);
  });

beforeAll(async () => {
  await cleanup();
  for (const [boot, set] of [
    [bootIdentityListening, (a: INestApplication) => (identity = a)],
    [bootCatalogListening, (a: INestApplication) => (catalog = a)],
    [bootCustomerListening, (a: INestApplication) => (customer = a)],
  ] as const) {
    const b = await boot();
    set(b.app);
    restores.push(b.restore);
  }
  await clearAccountCache();
  await clearScopeCache();
  app = await createPolicyApp();
  for (const u of NGUOI) tok[u] = await accessTokenFor(identity, u, SEED_PW);
  id = await idNguoiDung();

  groupCode = uniq('NHOM');
  const dm = await http(catalog);
  await dm.post('/catalog/product-groups').set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: groupCode, name: 'Nhom binh luan' });
  const r = await dm.post('/catalog/discount-rules').set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('CK'), productGroupCode: groupCode, effectiveFrom: '2020-01-01', thresholdRate2: 1500 });
  if (r.status !== 201) throw new Error(`khai quy định hỏng: ${JSON.stringify(r.body)}`);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
  await cleanup();
});

// =============================================================================
// Nội dung và kiểm hợp lệ
// =============================================================================

describe('nội dung', () => {
  it('bình luận hợp lệ → 201, đúng tác giả, vai trò, chưa sửa, chưa có reply', async () => {
    const pid = await hoSo();
    const r = await viet(pid, 'Em đã gửi duyệt hồ sơ.');
    expect(r.status).toBe(201);
    const b = r.body.binhLuan;
    expect(b).toMatchObject({
      noiDung: 'Em đã gửi duyệt hồ sơ.',
      cuaToi: true,
      daXoa: false,
      suaLuc: null,
      parentId: null,
      soPhanHoi: 0,
      camXuc: [],
    });
    expect(b.tacGia).toMatchObject({ id: id['tdv01'], vaiTro: 'TDV' });
    expect(b.tacGia.ten).not.toBe('Người dùng');
  });

  it('rỗng, chỉ khoảng trắng, chỉ dòng trống → BINH_LUAN_RONG', async () => {
    const pid = await hoSo();
    for (const s of ['', '   ', '\n\n\t  \r\n']) {
      const r = await viet(pid, s);
      expect(r.status, JSON.stringify(s)).toBe(400);
      expect(r.body.code).toBe('BINH_LUAN_RONG');
    }
  });

  it('thiếu trường hoặc sai kiểu → VALIDATION_FAILED, không phải 500', async () => {
    const pid = await hoSo();
    expect((await goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID() })).body.code)
      .toBe('VALIDATION_FAILED');
    expect((await goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: 'x', noiDung: 'a' })).body.code)
      .toBe('VALIDATION_FAILED');
    expect((await viet(pid, 'a', 'tdv01', { parentId: 'khong-phai-uuid' })).body.code).toBe('VALIDATION_FAILED');
    expect((await goi('get', `/policies/khong-phai-uuid/binh-luan`, 'tdv01')).status).toBe(400);
    expect((await goi('get', `/policies/${pid}/binh-luan?truoc=abc`, 'tdv01')).body.code).toBe('VALIDATION_FAILED');
  });

  it('hồ sơ không tồn tại → 404 POLICY_NOT_FOUND', async () => {
    const r = await viet(randomUUID(), 'a');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('POLICY_NOT_FOUND');
  });

  it(`đúng ${GIOI_HAN_BINH_LUAN.kyTuToiDa} ký tự thì được, quá một ký tự thì BINH_LUAN_QUA_DAI`, async () => {
    const pid = await hoSo();
    expect((await viet(pid, 'a'.repeat(GIOI_HAN_BINH_LUAN.kyTuToiDa))).status).toBe(201);
    const r = await viet(pid, 'a'.repeat(GIOI_HAN_BINH_LUAN.kyTuToiDa + 1));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BINH_LUAN_QUA_DAI');
  });

  it('lưu bản chuẩn: NFC, \\r\\n → \\n, cắt khoảng trắng hai đầu', async () => {
    const pid = await hoSo();
    const r = await viet(pid, `  Hà Nội\r\nngày mai  `.normalize('NFD'));
    expect(r.body.binhLuan.noiDung).toBe('Hà Nội\nngày mai');
    const db = await withAdminDb(async (c) =>
      (await c.query<{ noi_dung: string }>(`SELECT noi_dung FROM pol.binh_luan WHERE id = $1`, [r.body.binhLuan.id])).rows[0]!,
    );
    expect(db.noi_dung).toBe('Hà Nội\nngày mai');
  });

  it('chữ HTML lưu và trả NGUYÊN VĂN — máy chủ không lọc, giao diện không chèn HTML', async () => {
    const pid = await hoSo();
    const s = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    expect((await viet(pid, s)).body.binhLuan.noiDung).toBe(s);
  });

  it('giả mạo tác giả trong thân → bị bỏ qua, tác giả là người cầm token', async () => {
    const pid = await hoSo();
    const r = await viet(pid, 'a', 'tdv01', { tacGiaId: id['tbp01'], tac_gia_id: id['tbp01'] });
    expect(r.status).toBe(201);
    expect(r.body.binhLuan.tacGia.id).toBe(id['tdv01']);
  });
});

// =============================================================================
// Phạm vi — mọi đường, mọi vai trò
// =============================================================================

describe('phạm vi', () => {
  /** Mọi đường đọc và ghi của một hồ sơ, với một người — trả mã trạng thái từng đường. */
  const moiDuong = async (pid: string, who: string, bid: string) => ({
    trang: (await goi('get', `/policies/${pid}/binh-luan`, who)).status,
    thayDoi: (await goi('get', `/policies/${pid}/binh-luan/thay-doi?tu=0`, who)).status,
    nguoiNhac: (await goi('get', `/policies/${pid}/binh-luan/nguoi-nhac`, who)).status,
    phanHoi: (await goi('get', `/policies/${pid}/binh-luan/${bid}/phan-hoi`, who)).status,
    tao: (await viet(pid, 'thử', who)).status,
    traLoi: (await viet(pid, 'thử', who, { parentId: bid })).status,
    camXuc: (await goi('put', `/policies/${pid}/binh-luan/${bid}/cam-xuc/THICH`, who)).status,
  });

  it('người ngoài phạm vi bị chặn ở MỌI đường — TDV khác, TBP khác, Kế toán khác', async () => {
    const pid = await hoSo('ky');
    const bid = (await viet(pid, 'gốc')).body.binhLuan.id;
    for (const who of ['tdv02', 'tbp02', 'kt02']) {
      const r = await moiDuong(pid, who, bid);
      expect(Object.values(r).every((s) => s === 403), `${who}: ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it('Quản trị hệ thống không thấy bình luận (không có phạm vi hồ sơ nào)', async () => {
    const pid = await hoSo('ky');
    const bid = (await viet(pid, 'gốc')).body.binhLuan.id;
    const r = await moiDuong(pid, 'admin01', bid);
    expect(Object.values(r).every((s) => s === 403), JSON.stringify(r)).toBe(true);
  });

  it('Kế toán trước khi TBP ký: 403 ở mọi đường; sau khi ký: thấy CẢ bình luận lúc Nháp', async () => {
    const pid = await hoSo();
    const bid = (await viet(pid, 'viết lúc còn Nháp')).body.binhLuan.id;
    expect((await act(pid, 'SUBMIT', 'tdv01')).status).toBe(200);
    const truoc = await moiDuong(pid, 'kt01', bid);
    expect(Object.values(truoc).every((s) => s === 403), JSON.stringify(truoc)).toBe(true);

    expect((await act(pid, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    const r = await goi('get', `/policies/${pid}/binh-luan`, 'kt01');
    expect(r.status).toBe(200);
    expect(r.body.binhLuan.map((b: { noiDung: string }) => b.noiDung)).toContain('viết lúc còn Nháp');
    expect((await viet(pid, 'Kế toán vào', 'kt01')).status).toBe(201);
  });

  it('TBP chưa được chọn (hồ sơ còn Nháp) thì chưa thấy; được chọn rồi thì thấy', async () => {
    const pid = await hoSo();
    expect((await goi('get', `/policies/${pid}/binh-luan`, 'tbp01')).status).toBe(403);
    expect((await act(pid, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await goi('get', `/policies/${pid}/binh-luan`, 'tbp01')).status).toBe(200);
  });

  it('Ban lãnh đạo ĐƯỢC bình luận, trả lời, thả cảm xúc (chốt 06/11)', async () => {
    const pid = await hoSo('gui');
    const bid = (await viet(pid, 'gốc')).body.binhLuan.id;
    const r = await moiDuong(pid, 'bld01', bid);
    expect(r).toEqual({ trang: 200, thayDoi: 200, nguoiNhac: 200, phanHoi: 200, tao: 201, traLoi: 201, camXuc: 200 });
  });

  it('mất phạm vi giữa chừng → lượt hỏi kế tiếp 403 (đổi người duyệt)', async () => {
    const pid = await hoSo('gui');
    expect((await goi('get', `/policies/${pid}/binh-luan/thay-doi?tu=0`, 'tbp01')).status).toBe(200);
    await withAdminDb((c) => c.query(`UPDATE pol.policy SET tbp_user_id = $2 WHERE id = $1`, [pid, id['tbp02']]));
    await clearScopeCache();
    expect((await goi('get', `/policies/${pid}/binh-luan/thay-doi?tu=0`, 'tbp01')).status).toBe(403);
    expect((await goi('get', `/policies/${pid}/binh-luan/thay-doi?tu=0`, 'tbp02')).status).toBe(200);
  });

  it('id bình luận của hồ sơ KHÁC đặt trên đường của hồ sơ này → 404, không chạm được', async () => {
    const a = await hoSo();
    const b = await hoSo();
    const bidB = (await viet(b, 'của hồ sơ B')).body.binhLuan.id;
    for (const r of [
      await goi('patch', `/policies/${a}/binh-luan/${bidB}`, 'tdv01', { noiDung: 'x' }),
      await goi('delete', `/policies/${a}/binh-luan/${bidB}`, 'tdv01'),
      await goi('put', `/policies/${a}/binh-luan/${bidB}/cam-xuc/THICH`, 'tdv01'),
      await goi('get', `/policies/${a}/binh-luan/${bidB}/phan-hoi`, 'tdv01'),
      await viet(a, 'trả lời chéo', 'tdv01', { parentId: bidB }),
    ]) {
      expect(r.status, JSON.stringify(r.body)).toBe(404);
      expect(r.body.code).toBe('BINH_LUAN_KHONG_TIM_THAY');
    }
  });

  it('bình luận được ở mọi trạng thái, kể cả đã kết thúc', async () => {
    const pid = await hoSo('hieu-luc');
    expect((await viet(pid, 'trên hồ sơ đang hiệu lực')).status).toBe(201);
    for (const st of ['HET_HIEU_LUC', 'QUA_HAN_DUYET', 'DA_XOA']) {
      await withAdminDb((c) => c.query(`UPDATE pol.policy SET status = $2 WHERE id = $1`, [pid, st]));
      expect((await viet(pid, `ở ${st}`)).status, st).toBe(201);
    }
  });
});

// =============================================================================
// Reply
// =============================================================================

describe('reply', () => {
  it('trả lời gốc → reply nằm dưới gốc, số reply của gốc tăng', async () => {
    const pid = await hoSo();
    const g = (await viet(pid, 'gốc')).body.binhLuan;
    const r = await viet(pid, 'trả lời', 'tdv01', { parentId: g.id });
    expect(r.status).toBe(201);
    expect(r.body.binhLuan.parentId).toBe(g.id);
    expect(r.body.binhLuan.soPhanHoi).toBeUndefined();
    const t = (await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body;
    expect(t.binhLuan[0].soPhanHoi).toBe(1);
    expect(t.binhLuan[0].phanHoi.map((x: { noiDung: string }) => x.noiDung)).toEqual(['trả lời']);
  });

  it('trả lời một reply → PHAN_HOI_LONG_NHAU', async () => {
    const pid = await hoSo();
    const g = (await viet(pid, 'gốc')).body.binhLuan;
    const ph = (await viet(pid, 'reply', 'tdv01', { parentId: g.id })).body.binhLuan;
    const r = await viet(pid, 'reply của reply', 'tdv01', { parentId: ph.id });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PHAN_HOI_LONG_NHAU');
  });

  it('một cấp reply chốt cả ở CSDL — chèn thẳng reply lồng nhau thì Postgres từ chối', async () => {
    const pid = await hoSo();
    const g = (await viet(pid, 'gốc')).body.binhLuan;
    const ph = (await viet(pid, 'reply', 'tdv01', { parentId: g.id })).body.binhLuan;
    await expect(
      withAdminDb((c) =>
        c.query(
          `INSERT INTO pol.binh_luan (policy_id, parent_id, tac_gia_id, noi_dung, ma_gui) VALUES ($1,$2,$3,'x',$4)`,
          [pid, ph.id, id['tdv01'], randomUUID()],
        ),
      ),
    ).rejects.toThrow(/không nhận reply/);
  });

  it('gốc đã xoá: không trả lời được nữa (BINH_LUAN_GOC_DA_XOA), reply cũ vẫn còn', async () => {
    const pid = await hoSo();
    const g = (await viet(pid, 'gốc')).body.binhLuan;
    await viet(pid, 'reply cũ', 'tdv01', { parentId: g.id });
    expect((await goi('delete', `/policies/${pid}/binh-luan/${g.id}`, 'tdv01')).status).toBe(200);
    const r = await viet(pid, 'reply mới', 'tdv01', { parentId: g.id });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('BINH_LUAN_GOC_DA_XOA');
    const t = (await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body;
    expect(t.binhLuan[0].daXoa).toBe(true);
    expect(t.binhLuan[0].phanHoi.map((x: { noiDung: string }) => x.noiDung)).toEqual(['reply cũ']);
  });
});

// =============================================================================
// Sửa và xoá
// =============================================================================

describe('sửa và xoá', () => {
  it('tác giả sửa → nội dung mới, có thời điểm sửa', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'cũ')).body.binhLuan;
    const r = await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01', { noiDung: 'mới' });
    expect(r.status).toBe(200);
    expect(r.body.binhLuan.noiDung).toBe('mới');
    expect(r.body.binhLuan.suaLuc).not.toBeNull();
  });

  it('sửa mà không đổi chữ nào → không thành "đã sửa", không sinh sự kiện', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'y nguyên')).body.binhLuan;
    const r = await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01', { noiDung: '  y nguyên ' });
    expect(r.body.binhLuan.suaLuc).toBeNull();
    expect((await suKien(pid)).filter((e) => e.routing_key === 'binh_luan.sua')).toHaveLength(0);
  });

  it('sửa thành rỗng → BINH_LUAN_RONG, nội dung cũ giữ nguyên', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'giữ')).body.binhLuan;
    expect((await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01', { noiDung: ' ' })).body.code).toBe('BINH_LUAN_RONG');
    expect((await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body.binhLuan[0].noiDung).toBe('giữ');
  });

  it('người khác sửa hay xoá → 403 KHONG_PHAI_TAC_GIA — kể cả Ban lãnh đạo', async () => {
    const pid = await hoSo('gui');
    const b = (await viet(pid, 'của tdv01')).body.binhLuan;
    for (const who of ['tbp01', 'bld01']) {
      const s = await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, who, { noiDung: 'sửa hộ' });
      const x = await goi('delete', `/policies/${pid}/binh-luan/${b.id}`, who);
      expect([s.status, s.body.code, x.status, x.body.code], who).toEqual([403, 'KHONG_PHAI_TAC_GIA', 403, 'KHONG_PHAI_TAC_GIA']);
    }
  });

  it('xoá → nội dung KHÔNG rời máy chủ ở bất kỳ đường nào, kể cả với chính tác giả', async () => {
    const pid = await hoSo('gui');
    const b = (await viet(pid, 'BI_MAT_DA_XOA')).body.binhLuan;
    const x = await goi('delete', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01');
    expect(x.status).toBe(200);
    expect(x.body.binhLuan).toMatchObject({ daXoa: true, noiDung: null, camXuc: [] });
    for (const who of ['tdv01', 'tbp01', 'bld01']) {
      const t = await goi('get', `/policies/${pid}/binh-luan`, who);
      const d = await goi('get', `/policies/${pid}/binh-luan/thay-doi?tu=0`, who);
      expect(JSON.stringify(t.body) + JSON.stringify(d.body), who).not.toContain('BI_MAT_DA_XOA');
    }
  });

  it('đã xoá thì không sửa, không xoá lại, không thả cảm xúc được — BINH_LUAN_DA_XOA', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'x')).body.binhLuan;
    await goi('delete', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01');
    for (const r of [
      await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01', { noiDung: 'y' }),
      await goi('delete', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01'),
      await goi('put', `/policies/${pid}/binh-luan/${b.id}/cam-xuc/THICH`, 'tdv01'),
    ]) {
      expect([r.status, r.body.code]).toEqual([409, 'BINH_LUAN_DA_XOA']);
    }
  });

  it('nhật ký: tạo, sửa, xoá đều có sự kiện; sự kiện xoá không mang nội dung', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'một')).body.binhLuan;
    await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01', { noiDung: 'hai' });
    await goi('delete', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01');
    const ev = (await suKien(pid)).filter((e) => e.routing_key.startsWith('binh_luan.'));
    expect(ev.map((e) => [e.routing_key, e.payload['action'], e.payload['entity']])).toEqual([
      ['binh_luan.tao', 'BINH_LUAN_TAO', 'binh_luan'],
      ['binh_luan.sua', 'BINH_LUAN_SUA', 'binh_luan'],
      ['binh_luan.xoa', 'BINH_LUAN_XOA', 'binh_luan'],
    ]);
    expect(ev[2]!.payload['noiDungBinhLuan']).toBeUndefined();
    for (const e of ev) expect(e.payload['actorId']).toBe(id['tdv01']);
  });

  it('sự kiện bình luận KHÔNG đi khoá `policy.*` — reporting không tính lại hồ sơ vì một câu bình luận', async () => {
    const pid = await hoSo();
    const truoc = (await suKien(pid)).length;
    await viet(pid, 'không chạm reporting');
    const sau = (await suKien(pid)).slice(truoc);
    expect(sau.map((e) => e.routing_key)).toEqual(['binh_luan.tao']);
  });
});

// =============================================================================
// Gửi trùng
// =============================================================================

describe('gửi trùng', () => {
  it('gửi lại cùng maGui (mất phản hồi, bấm Thử lại) → cùng một bình luận, một dòng', async () => {
    const pid = await hoSo();
    const maGui = randomUUID();
    const a = await goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui, noiDung: 'một lần' });
    const b = await goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui, noiDung: 'một lần' });
    expect(b.body.binhLuan.id).toBe(a.body.binhLuan.id);
    const n = await withAdminDb(async (c) =>
      (await c.query(`SELECT 1 FROM pol.binh_luan WHERE policy_id = $1`, [pid])).rowCount,
    );
    expect(n).toBe(1);
    expect((await suKien(pid)).filter((e) => e.routing_key === 'binh_luan.tao')).toHaveLength(1);
  });

  it('HAI lượt song song cùng maGui → một dòng (khoá theo hồ sơ + ràng buộc duy nhất)', async () => {
    const pid = await hoSo();
    const maGui = randomUUID();
    const [a, b] = await Promise.all([
      goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui, noiDung: 'bấm đúp' }),
      goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui, noiDung: 'bấm đúp' }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.binhLuan.id).toBe(b.body.binhLuan.id);
  });

  it('maGui đã dùng ở hồ sơ khác hoặc bởi người khác → BINH_LUAN_TRUNG_MA, không lộ bình luận kia', async () => {
    const a = await hoSo('gui');
    const b = await hoSo();
    const maGui = randomUUID();
    await goi('post', `/policies/${a}/binh-luan`, 'tdv01', { maGui, noiDung: 'của A' });
    const khacHoSo = await goi('post', `/policies/${b}/binh-luan`, 'tdv01', { maGui, noiDung: 'x' });
    const khacNguoi = await goi('post', `/policies/${a}/binh-luan`, 'tbp01', { maGui, noiDung: 'x' });
    for (const r of [khacHoSo, khacNguoi]) {
      expect([r.status, r.body.code]).toEqual([409, 'BINH_LUAN_TRUNG_MA']);
      expect(JSON.stringify(r.body)).not.toContain('của A');
    }
  });
});

// =============================================================================
// Cảm xúc
// =============================================================================

describe('cảm xúc', () => {
  it('thả, thả lại không nhân đôi, gỡ; người khác thấy số và tên, không thấy "của tôi"', async () => {
    const pid = await hoSo('gui');
    const b = (await viet(pid, 'x')).body.binhLuan;
    const u = `/policies/${pid}/binh-luan/${b.id}/cam-xuc/THICH`;
    expect((await goi('put', u, 'tdv01')).body.binhLuan.camXuc).toEqual([
      expect.objectContaining({ loai: 'THICH', so: 1, cuaToi: true }),
    ]);
    expect((await goi('put', u, 'tdv01')).body.binhLuan.camXuc[0].so).toBe(1);
    const khac = (await goi('get', `/policies/${pid}/binh-luan`, 'tbp01')).body.binhLuan[0].camXuc[0];
    expect(khac).toMatchObject({ loai: 'THICH', so: 1, cuaToi: false });
    expect(khac.nguoi).toHaveLength(1);
    expect((await goi('delete', u, 'tdv01')).body.binhLuan.camXuc).toEqual([]);
    expect((await goi('delete', u, 'tdv01')).status).toBe(200);
  });

  it('hai lượt thả song song cùng loại → một dòng (khoá chính)', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'x')).body.binhLuan;
    const u = `/policies/${pid}/binh-luan/${b.id}/cam-xuc/VUI`;
    await Promise.all([goi('put', u, 'tdv01'), goi('put', u, 'tdv01')]);
    const n = await withAdminDb(async (c) =>
      (await c.query(`SELECT 1 FROM pol.binh_luan_cam_xuc WHERE binh_luan_id = $1`, [b.id])).rowCount,
    );
    expect(n).toBe(1);
  });

  it('loại ngoài bộ sáu → CAM_XUC_KHONG_HOP_LE; cảm xúc không sinh sự kiện nhật ký', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'x')).body.binhLuan;
    const r = await goi('put', `/policies/${pid}/binh-luan/${b.id}/cam-xuc/${encodeURIComponent('👍')}`, 'tdv01');
    expect([r.status, r.body.code]).toEqual([400, 'CAM_XUC_KHONG_HOP_LE']);
    await goi('put', `/policies/${pid}/binh-luan/${b.id}/cam-xuc/MUNG`, 'tdv01');
    expect((await suKien(pid)).map((e) => e.routing_key)).not.toContain('binh_luan.cam_xuc');
  });
});

// =============================================================================
// Phân trang và hỏi thay đổi
// =============================================================================

describe('phân trang', () => {
  it('45 bình luận gốc: trang đầu 20 MỚI NHẤT theo thứ tự tăng; lùi hai lượt đủ 45, không trùng, không sót', async () => {
    const pid = await hoSo();
    for (let i = 1; i <= 45; i++) await viet(pid, `gốc ${i}`);
    const t1 = (await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body;
    expect(t1.binhLuan).toHaveLength(20);
    expect(t1.binhLuan[0].noiDung).toBe('gốc 26');
    expect(t1.binhLuan[19].noiDung).toBe('gốc 45');
    expect(t1.conCu).toBe(true);
    const t2 = (await goi('get', `/policies/${pid}/binh-luan?truoc=${t1.binhLuan[0].stt}`, 'tdv01')).body;
    const t3 = (await goi('get', `/policies/${pid}/binh-luan?truoc=${t2.binhLuan[0].stt}`, 'tdv01')).body;
    expect(t3.conCu).toBe(false);
    const tat = [...t3.binhLuan, ...t2.binhLuan, ...t1.binhLuan].map((b: { noiDung: string }) => b.noiDung);
    expect(tat).toEqual(Array.from({ length: 45 }, (_, i) => `gốc ${i + 1}`));
  });

  it('luồng 25 reply: trang hồ sơ bày 3 MỚI NHẤT + số 25; xem thêm từng đợt 20', async () => {
    const pid = await hoSo();
    const g = (await viet(pid, 'gốc')).body.binhLuan;
    for (let i = 1; i <= 25; i++) await viet(pid, `r${i}`, 'tdv01', { parentId: g.id });
    const t = (await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body.binhLuan[0];
    expect(t.soPhanHoi).toBe(25);
    expect(t.phanHoi.map((x: { noiDung: string }) => x.noiDung)).toEqual(['r23', 'r24', 'r25']);
    const a = (await goi('get', `/policies/${pid}/binh-luan/${g.id}/phan-hoi`, 'tdv01')).body;
    expect(a.phanHoi).toHaveLength(20);
    expect(a.phanHoi[0].noiDung).toBe('r6');
    expect(a.conCu).toBe(true);
    const b = (await goi('get', `/policies/${pid}/binh-luan/${g.id}/phan-hoi?truoc=${a.phanHoi[0].stt}`, 'tdv01')).body;
    expect(b.phanHoi.map((x: { noiDung: string }) => x.noiDung)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(b.conCu).toBe(false);
  });

  it('phan-hoi của một reply (không phải gốc) → 404', async () => {
    const pid = await hoSo();
    const g = (await viet(pid, 'gốc')).body.binhLuan;
    const ph = (await viet(pid, 'r', 'tdv01', { parentId: g.id })).body.binhLuan;
    expect((await goi('get', `/policies/${pid}/binh-luan/${ph.id}/phan-hoi`, 'tdv01')).status).toBe(404);
  });
});

describe('hỏi thay đổi', () => {
  it('từ mốc của trang: tạo · reply (kèm gốc với số mới) · sửa · cảm xúc · xoá đều tới; không gì đổi thì rỗng', async () => {
    const pid = await hoSo('gui');
    const g = (await viet(pid, 'gốc')).body.binhLuan;
    let moc = (await goi('get', `/policies/${pid}/binh-luan`, 'tbp01')).body.moc as number;
    const hoi = async () => {
      const r = (await goi('get', `/policies/${pid}/binh-luan/thay-doi?tu=${moc}`, 'tbp01')).body;
      moc = r.moc;
      return r.thayDoi as { id: string; noiDung: string | null; soPhanHoi?: number; daXoa: boolean; camXuc: unknown[] }[];
    };
    expect(await hoi()).toEqual([]);

    const moi = (await viet(pid, 'mới')).body.binhLuan;
    expect((await hoi()).map((x) => x.id)).toEqual([moi.id]);

    const ph = (await viet(pid, 'reply', 'tdv01', { parentId: g.id })).body.binhLuan;
    const d = await hoi();
    expect(d.map((x) => x.id).sort()).toEqual([g.id, ph.id].sort());
    expect(d.find((x) => x.id === g.id)!.soPhanHoi).toBe(1);

    await goi('patch', `/policies/${pid}/binh-luan/${moi.id}`, 'tdv01', { noiDung: 'đã sửa' });
    expect((await hoi()).map((x) => x.noiDung)).toEqual(['đã sửa']);

    await goi('put', `/policies/${pid}/binh-luan/${moi.id}/cam-xuc/THICH`, 'tdv01');
    expect((await hoi())[0]!.camXuc).toHaveLength(1);
    // Thả lại đúng cảm xúc ấy không đổi gì → không có "thay đổi" rỗng nào được đẩy đi.
    await goi('put', `/policies/${pid}/binh-luan/${moi.id}/cam-xuc/THICH`, 'tdv01');
    expect(await hoi()).toEqual([]);

    await goi('delete', `/policies/${pid}/binh-luan/${moi.id}`, 'tdv01');
    expect((await hoi())[0]).toMatchObject({ id: moi.id, daXoa: true, noiDung: null });
    expect(await hoi()).toEqual([]);
  });

  it('KHÔNG BỎ SÓT — lượt ghi đang dở giữ khoá, lượt ghi sau phải XẾP HÀNG (ca xác định, không dựa may rủi)', async () => {
    // Ca 30-lượt-song-song bên dưới XANH cả khi bỏ khoá (`0261`, phá lại): khe giữa
    // lấy số và commit quá hẹp để một lượt chạy bắt được. Ca này dựng đúng khe ấy bằng
    // tay: kết nối thứ nhất giữ khoá của hồ sơ và một dòng CHƯA commit (số nhỏ hơn);
    // lượt ghi thứ hai qua service phải đợi. Bỏ khoá thì lượt thứ hai commit trước,
    // lượt hỏi đặt mốc vượt qua dòng thứ nhất, và dòng ấy không bao giờ được hỏi tới.
    const pid = await hoSo();
    const svc = app.get(BinhLuanService);
    const me = { id: id['tdv01']!, role: 'TDV', mustChangePassword: false };
    let moc = (await svc.thayDoi(pid, 0, me)).moc;
    const thay = new Set<string>();
    const hoi = async () => {
      const r = await svc.thayDoi(pid, moc, me);
      r.thayDoi.forEach((x) => thay.add(x.id));
      moc = r.moc;
    };
    let dangDo = '';
    await withAdminDb(async (c) => {
      await c.query('BEGIN');
      await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [pid]);
      dangDo = (
        await c.query<{ id: string }>(
          `INSERT INTO pol.binh_luan (policy_id, tac_gia_id, noi_dung, ma_gui) VALUES ($1, $2, 'đang dở', $3) RETURNING id`,
          [pid, id['tdv01'], randomUUID()],
        )
      ).rows[0]!.id;
      const sau = svc.tao(pid, { maGui: randomUUID(), noiDung: 'ghi sau' }, me);
      await new Promise((r) => setTimeout(r, 400));
      await hoi(); // có khoá: lượt sau còn đang đợi, chưa gì để thấy
      await c.query('COMMIT');
      await sau;
    });
    await hoi();
    expect(thay.has(dangDo), 'dòng commit sau mốc đã bị bỏ sót').toBe(true);
    expect(thay.size).toBe(2);
  });

  it('KHÔNG BỎ SÓT khi nhiều người ghi cùng lúc: 30 lượt song song, hỏi xen kẽ, đủ 30', async () => {
    const pid = await hoSo('gui');
    const svc = app.get(BinhLuanService);
    const me = (u: string, role: string) => ({ id: id[u]!, role, mustChangePassword: false });
    let moc = 0;
    const thay = new Set<string>();
    const ghi = Array.from({ length: 30 }, (_, i) =>
      svc.tao(pid, { maGui: randomUUID(), noiDung: `song song ${i}` }, i % 2 ? me('tdv01', 'TDV') : me('tbp01', 'TBP')),
    );
    // Hỏi xen kẽ TRONG LÚC các lượt ghi đang chạy — đúng tình huống một số commit
    // sau một số khác.
    const hoi = (async () => {
      for (let k = 0; k < 15; k++) {
        const r = await svc.thayDoi(pid, moc, me('tdv01', 'TDV'));
        r.thayDoi.forEach((x) => thay.add(x.id));
        moc = r.moc;
      }
    })();
    await Promise.all([...ghi, hoi]);
    const cuoi = await svc.thayDoi(pid, moc, me('tdv01', 'TDV'));
    cuoi.thayDoi.forEach((x) => thay.add(x.id));
    expect(thay.size).toBe(30);
  });
});

// =============================================================================
// Nhắc tên
// =============================================================================

describe('nhắc tên', () => {
  const ds = async (pid: string, who: string, q = '') =>
    ((await goi('get', `/policies/${pid}/binh-luan/nguoi-nhac?q=${encodeURIComponent(q)}`, who)).body.nguoi as {
      id: string;
      ten: string;
      email: string;
      vaiTro: string;
    }[]).map((n) => n.id);

  it('danh sách = người ĐỨNG TÊN trên hồ sơ, trừ chính mình; Kế toán chỉ sau khi TBP ký; không BLĐ', async () => {
    const pid = await hoSo('gui');
    expect(await ds(pid, 'tdv01')).toEqual([id['tbp01']]);
    expect(await ds(pid, 'tbp01')).toEqual([id['tdv01']]);
    // BLĐ xem được danh sách nhưng chính họ không bao giờ có trong đó.
    expect((await ds(pid, 'bld01')).sort()).toEqual([id['tdv01'], id['tbp01']].sort());
    expect((await act(pid, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await ds(pid, 'tdv01')).sort()).toEqual([id['tbp01'], id['kt01']].sort());
    expect(await ds(pid, 'tdv01')).not.toContain(id['bld01']);
  });

  it('lọc theo tên (không phân biệt hoa thường, kể cả gõ NFD) và theo email', async () => {
    const pid = await hoSo('ky');
    const tat = (await goi('get', `/policies/${pid}/binh-luan/nguoi-nhac`, 'tdv01')).body.nguoi as { id: string; ten: string; email: string }[];
    const kt = tat.find((n) => n.id === id['kt01'])!;
    const manh = [...kt.ten.split(' ').pop()!].slice(0, 2).join('');
    expect(await ds(pid, 'tdv01', manh.toUpperCase().normalize('NFD'))).toContain(id['kt01']);
    expect(await ds(pid, 'tdv01', kt.email.split('@')[0]!)).toEqual([id['kt01']]);
    expect(await ds(pid, 'tdv01', 'khong-co-ai-ten-the-nay')).toEqual([]);
  });

  it('nhắc người hợp lệ → lưu, trả tên HIỆN TẠI trong bảng tên', async () => {
    const pid = await hoSo('gui');
    const r = await viet(pid, `Nhờ ${dauNhac(id['tbp01']!)} xem`);
    expect(r.status).toBe(201);
    expect(r.body.ten[id['tbp01']!]).toBeTruthy();
  });

  it('nhắc người ngoài phạm vi, Ban lãnh đạo, id không tồn tại, chính mình → NHAC_TEN_KHONG_HOP_LE', async () => {
    const pid = await hoSo('gui');
    for (const ai of [id['tdv02']!, id['bld01']!, randomUUID(), id['tdv01']!, id['kt01']!]) {
      const r = await viet(pid, `nhắc ${dauNhac(ai)}`);
      expect([r.status, r.body.code], ai).toEqual([400, 'NHAC_TEN_KHONG_HOP_LE']);
    }
  });

  it(`nhắc quá ${GIOI_HAN_BINH_LUAN.nhacToiDa} người → QUA_NHIEU_NHAC_TEN`, async () => {
    const pid = await hoSo('gui');
    const nhieu = Array.from({ length: GIOI_HAN_BINH_LUAN.nhacToiDa + 1 }, () => dauNhac(randomUUID())).join(' ');
    expect((await viet(pid, nhieu)).body.code).toBe('QUA_NHIEU_NHAC_TEN');
  });

  it('nhắc một người ba lần → một mục trong sự kiện', async () => {
    const pid = await hoSo('gui');
    const t = dauNhac(id['tbp01']!);
    await viet(pid, `${t} ${t} và ${t}`);
    const ev = (await suKien(pid)).find((e) => e.routing_key === 'binh_luan.tao')!;
    expect(ev.payload['nguoiDuocNhac']).toEqual([id['tbp01']]);
  });

  it('sửa: chỉ người MỚI vào sự kiện; người đã nhắc từ trước nay hết hợp lệ vẫn giữ được', async () => {
    const pid = await hoSo('ky');
    const b = (await viet(pid, `cho ${dauNhac(id['kt01']!)}`)).body.binhLuan;
    // Kế toán của hồ sơ đổi người → kt01 thôi nhắc được.
    await withAdminDb((c) => c.query(`UPDATE pol.policy SET ke_toan_user_id = $2 WHERE id = $1`, [pid, id['kt02']]));
    const giu = await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01', {
      noiDung: `cho ${dauNhac(id['kt01']!)} và ${dauNhac(id['tbp01']!)}`,
    });
    expect(giu.status).toBe(200);
    const ev = (await suKien(pid)).filter((e) => e.routing_key === 'binh_luan.sua');
    expect(ev[ev.length - 1]!.payload['nguoiDuocNhac']).toEqual([id['tbp01']]);
    const them = await goi('patch', `/policies/${pid}/binh-luan/${b.id}`, 'tdv01', {
      noiDung: `cho ${dauNhac(id['kt01']!)} và ${dauNhac(id['tdv02']!)}`,
    });
    expect(them.body.code).toBe('NHAC_TEN_KHONG_HOP_LE');
  });

  it('người được nhắc ĐỔI TÊN → bình luận cũ hiện tên mới', async () => {
    const pid = await hoSo('gui');
    await viet(pid, `cho ${dauNhac(id['tbp01']!)}`);
    const cu = await withAdminDb(async (c) =>
      (await c.query<{ full_name: string }>(`SELECT full_name FROM idn.app_user WHERE id = $1`, [id['tbp01']])).rows[0]!.full_name,
    );
    try {
      await withAdminDb((c) => c.query(`UPDATE idn.app_user SET full_name = 'Tên Mới Đổi' WHERE id = $1`, [id['tbp01']]));
      const t = (await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body;
      expect(t.ten[id['tbp01']!]).toBe('Tên Mới Đổi');
    } finally {
      await withAdminDb((c) => c.query(`UPDATE idn.app_user SET full_name = $2 WHERE id = $1`, [id['tbp01'], cu]));
      await clearAccountCache();
    }
  });

  it('reply mang id tác giả gốc trong sự kiện (để thông báo "đã phản hồi")', async () => {
    const pid = await hoSo('gui');
    const g = (await viet(pid, 'gốc', 'tbp01')).body.binhLuan;
    await viet(pid, 'trả lời', 'tdv01', { parentId: g.id });
    const ev = (await suKien(pid)).filter((e) => e.routing_key === 'binh_luan.tao');
    expect(ev[ev.length - 1]!.payload).toMatchObject({ parentId: g.id, tacGiaGocId: id['tbp01'] });
  });
});

// =============================================================================
// Bản Nháp xoá, phiên bản mới, giấy tờ
// =============================================================================

describe('vòng đời hồ sơ', () => {
  it('bản Nháp bị xoá hẳn → bình luận và cảm xúc của nó mất theo', async () => {
    const pid = await hoSo();
    const b = (await viet(pid, 'sẽ mất')).body.binhLuan;
    await goi('put', `/policies/${pid}/binh-luan/${b.id}/cam-xuc/THICH`, 'tdv01');
    expect((await goi('delete', `/policies/${pid}`, 'tdv01')).status).toBeLessThan(300);
    const n = await withAdminDb(async (c) => ({
      bl: (await c.query(`SELECT 1 FROM pol.binh_luan WHERE policy_id = $1`, [pid])).rowCount,
      cx: (await c.query(`SELECT 1 FROM pol.binh_luan_cam_xuc WHERE binh_luan_id = $1`, [b.id])).rowCount,
    }));
    expect(n).toEqual({ bl: 0, cx: 0 });
  });

  it('phiên bản mới bắt đầu với khu vực bình luận TRỐNG; bản cũ vẫn đọc được', async () => {
    const cu = await hoSo('hieu-luc');
    await viet(cu, 'trên bản cũ');
    const khach = await withAdminDb(async (c) =>
      (await c.query<{ customer_id: string }>(`SELECT customer_id FROM pol.policy WHERE id = $1`, [cu])).rows[0]!.customer_id,
    );
    const r = await goi('post', '/policies', 'tdv01', { customerId: khach, mode: 'NEW_VERSION', lines: [] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await goi('get', `/policies/${r.body.id}/binh-luan`, 'tdv01')).body.binhLuan).toEqual([]);
    expect((await goi('get', `/policies/${cu}/binh-luan`, 'tdv01')).body.binhLuan).toHaveLength(1);
  });

  it('đường đọc nội bộ (bản mềm, hợp đồng, báo cáo) KHÔNG mang bình luận', () => {
    const src = readFileSync('services/policy/src/internal.controller.ts', 'utf8');
    expect(src).not.toMatch(/binh_luan|binhLuan/);
  });
});

// =============================================================================
// Giới hạn tần suất ở gateway
// =============================================================================

describe('giới hạn tần suất', () => {
  const P_ID = '11111111-2222-3333-4444-555555555555';
  it('gửi và sửa bình luận đếm chung xô binhLuan; tìm người nhắc có xô riêng', () => {
    expect(ruleFor('POST', `/policies/${P_ID}/binh-luan`)).toBe(RULES.binhLuan);
    expect(ruleFor('PATCH', `/policies/${P_ID}/binh-luan/${P_ID}`)).toBe(RULES.binhLuan);
    expect(ruleFor('GET', `/policies/${P_ID}/binh-luan/nguoi-nhac`)).toBe(RULES.timNguoiNhac);
  });
  it('đọc, hỏi thay đổi, cảm xúc, xoá không bị giới hạn — chúng không tạo chữ mới', () => {
    for (const [m, p] of [
      ['GET', `/policies/${P_ID}/binh-luan`],
      ['GET', `/policies/${P_ID}/binh-luan/thay-doi`],
      ['PUT', `/policies/${P_ID}/binh-luan/${P_ID}/cam-xuc/THICH`],
      ['DELETE', `/policies/${P_ID}/binh-luan/${P_ID}`],
      ['POST', `/policies/${P_ID}/lines`],
    ] as const) {
      expect(ruleFor(m, p), `${m} ${p}`).toBeUndefined();
    }
  });
  it('trần mặc định: 30 lượt gửi và 60 lượt tìm mỗi phút mỗi người', () => {
    expect([RULES.binhLuan.limit, RULES.binhLuan.windowSec]).toEqual([30, 60]);
    expect([RULES.timNguoiNhac.limit, RULES.timNguoiNhac.windowSec]).toEqual([60, 60]);
  });
});
