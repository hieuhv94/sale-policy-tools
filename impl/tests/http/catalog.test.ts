/**
 * CAT-01 … CAT-18 — danh mục sản phẩm, giá, chiết khấu quy định, người ký.
 *
 * catalog chạy cùng identity thật: mỗi request đi qua guard, và guard phải hỏi
 * identity qua API nội bộ vì catalog không có quyền trên schema idn.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { createTestApp as createCatalogApp } from '@csbh/catalog/testing';
import {
  accessTokenFor,
  bootIdentityListening,
  clearAccountCache,
  http,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZCAT';

let identity: INestApplication;
let restoreEnv: () => void;
let app: INestApplication;
let adminT = '';
let tdvT = '';

const post = async (path: string, body: object, token = adminT) =>
  (await http(app)).post(path).set('Authorization', `Bearer ${token}`).send(body);
const patch = async (path: string, body: object, token = adminT) =>
  (await http(app)).patch(path).set('Authorization', `Bearer ${token}`).send(body);
const get = async (path: string, token = adminT) =>
  (await http(app)).get(path).set('Authorization', `Bearer ${token}`);
const del = async (path: string, token = adminT) =>
  (await http(app)).delete(path).set('Authorization', `Bearer ${token}`);

const cleanup = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM cat.outbox`);
    await c.query(`DELETE FROM cat.discount_rule`);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.signer WHERE full_name LIKE $1`, [`${P}%`]);
    for (const t of ['province', 'hospital', 'channel']) {
      await c.query(`DELETE FROM cat.${t} WHERE code LIKE $1`, [`${P}%`]);
    }
  });

/** Sự kiện outbox mới nhất theo routing key. */
const lastEvent = (routingKey: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM cat.outbox WHERE routing_key = $1 ORDER BY created_at DESC LIMIT 1`,
      [routingKey],
    );
    return r.rows[0]?.payload;
  });

const countEvents = (routingKey: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM cat.outbox WHERE routing_key = $1`,
      [routingKey],
    );
    return Number(r.rows[0]!.n);
  });

let n = 0;
const code = (kind: string) => `${P}-${kind}-${++n}`;

/** Tạo một nhóm sản phẩm và một sản phẩm trong đó. */
const makeProduct = async (over: Record<string, unknown> = {}) => {
  const groupCode = code('G');
  await post('/catalog/product-groups', { code: groupCode, name: 'Nhom thu nghiem' });
  const res = await post('/catalog/products', {
    code: code('P'),
    name: 'San pham thu nghiem',
    groupCode,
    ...over,
  });
  return { groupCode, res, id: res.body.id as string };
};

beforeAll(async () => {
  await cleanup();
  const boot = await bootIdentityListening();
  identity = boot.app;
  restoreEnv = boot.restore;
  await clearAccountCache();
  app = await createCatalogApp();
  adminT = await accessTokenFor(identity, 'admin01', SEED_PW);
  tdvT = await accessTokenFor(identity, 'tdv01', SEED_PW);
});

afterAll(async () => {
  await app?.close();
  await identity?.close();
  restoreEnv?.();
  await cleanup();
});

describe('CAT-01 chỉ quản trị hệ thống sửa được danh mục', () => {
  it('tdv01 tạo sản phẩm thì 403', async () => {
    const r = await post(
      '/catalog/products',
      { code: code('X'), name: 'x', groupCode: 'bat-ky' },
      tdvT,
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ROLE_FORBIDDEN');
  });

  it('tdv01 vẫn ĐỌC được danh mục — cần để lập hồ sơ', async () => {
    const r = await get('/catalog/products', tdvT);
    expect(r.status).toBe(200);
  });
});

describe('CAT-02 mã vật tư trùng', () => {
  it('trả 409', async () => {
    const { res, groupCode } = await makeProduct();
    expect(res.status).toBe(201);
    const again = await post('/catalog/products', {
      code: res.body.code,
      name: 'Ten khac',
      groupCode,
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('PRODUCT_CODE_DUPLICATE');
  });

  it('chặn cả khi khác hoa thường hoặc thừa khoảng trắng', async () => {
    const { res, groupCode } = await makeProduct();
    const messy = await post('/catalog/products', {
      code: `  ${(res.body.code as string).toLowerCase()}  `,
      name: 'Ten khac',
      groupCode,
    });
    expect(messy.status).toBe(409);
  });
});

describe('CAT-03 chỉ có hai loại giá', () => {
  it('loại giá thứ ba bị từ chối', async () => {
    const { id } = await makeProduct();
    const r = await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_LE_NIEM_YET',
      amount: '100000',
      effectiveFrom: '2026-01-01',
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
    expect(r.body.field).toBe('priceType');
  });

  it('hai loại giá hợp lệ đều nhận', async () => {
    const { id } = await makeProduct();
    for (const priceType of ['GIA_BAN_CONG_TY', 'GIA_BAN_BUON']) {
      const r = await post(`/catalog/products/${id}/prices`, {
        priceType,
        amount: '100000',
        effectiveFrom: '2026-01-01',
      });
      expect(r.status).toBe(201);
    }
  });
});

describe('CAT-04 đổi giá tạo bản ghi lịch sử mới', () => {
  it('bản cũ giữ nguyên, không bị ghi đè', async () => {
    const { id } = await makeProduct();
    await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '100000',
      effectiveFrom: '2026-01-01',
    });
    await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '120000',
      effectiveFrom: '2026-06-01',
    });

    const hist = await get(`/catalog/products/${id}/prices`);
    const amounts = (hist.body as { amount: string }[]).map((r) => r.amount);
    expect(amounts).toContain('100000');
    expect(amounts).toContain('120000');
  });
});

describe('CAT-05 giá có ngày hiệu lực trong tương lai', () => {
  it('hôm nay vẫn lấy giá hiện hành, không lấy giá tương lai', async () => {
    const { id } = await makeProduct();
    await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '100000',
      effectiveFrom: '2020-01-01',
    });
    await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '999000',
      effectiveFrom: '2099-01-01',
    });

    const now = await get(`/catalog/products/${id}/current-price?priceType=GIA_BAN_CONG_TY`);
    expect(now.body.amount).toBe('100000');

    // Tra đúng ngày trong tương lai thì mới ra giá tương lai.
    const later = await get(
      `/catalog/products/${id}/current-price?priceType=GIA_BAN_CONG_TY&on=2099-06-01`,
    );
    expect(later.body.amount).toBe('999000');
  });
});

describe('CAT-06 trạng thái sản phẩm chỉ có hai giá trị', () => {
  it('giá trị thứ ba bị từ chối', async () => {
    const { id } = await makeProduct();
    const r = await patch(`/catalog/products/${id}`, { status: 'TAM_NGUNG' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('status');
  });
});

describe('CAT-07 · CAT-08 sản phẩm đã vô hiệu hoá', () => {
  it('không xuất hiện khi lấy danh sách để lập CSBH mới', async () => {
    const { id } = await makeProduct();
    await patch(`/catalog/products/${id}`, { status: 'DA_VO_HIEU_HOA' });

    const forNew = await get('/catalog/products?forNewPolicy=true');
    expect((forNew.body as { id: string }[]).some((p) => p.id === id)).toBe(false);

    const all = await get('/catalog/products');
    expect((all.body as { id: string }[]).some((p) => p.id === id)).toBe(true);
  });

  it('hồ sơ cũ vẫn mở xem được, hiện đúng mã và tên', async () => {
    const { id, res } = await makeProduct();
    await patch(`/catalog/products/${id}`, { status: 'DA_VO_HIEU_HOA' });

    const one = await get(`/catalog/products/${id}`);
    expect(one.status).toBe(200);
    expect(one.body.code).toBe(res.body.code);
    expect(one.body.status).toBe('DA_VO_HIEU_HOA');
  });
});

describe('CAT-09 nhóm sản phẩm bắt buộc', () => {
  it('thiếu nhóm thì 400', async () => {
    const r = await post('/catalog/products', { code: code('N'), name: 'Khong nhom' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('groupCode');
  });

  it('nhóm không tồn tại thì 404', async () => {
    const r = await post('/catalog/products', {
      code: code('N'),
      name: 'x',
      groupCode: 'KHONG-CO-NHOM-NAY',
    });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('CAT-10 · CAT-11 · CAT-12 tra ngưỡng chiết khấu', () => {
  it('CAT-10 đúng một dòng khớp thì trả ngưỡng của dòng đó', async () => {
    const { id, groupCode } = await makeProduct();
    await post('/catalog/discount-rules', {
      productGroupCode: groupCode,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1500,
    });
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=1`);
    expect(r.status).toBe(200);
    expect(r.body.thresholdRate2).toBe(1500);
    expect(r.body.source).toBe('RULE');
  });

  it('CAT-11 hai dòng cùng khớp thì chọn dòng cụ thể nhất', async () => {
    const { id, groupCode } = await makeProduct();
    await post('/catalog/lookups/channel', { code: `${P}-KENH`, name: 'Kenh thu nghiem' });

    // Dòng chung cho cả nhóm, và dòng riêng cho một kênh — cả hai đều khớp.
    await post('/catalog/discount-rules', {
      productGroupCode: groupCode,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1000,
    });
    await post('/catalog/discount-rules', {
      productGroupCode: groupCode,
      customerType: 2,
      channelCode: `${P}-KENH`,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 2000,
    });

    const specific = await get(
      `/catalog/thresholds/resolve?productId=${id}&customerType=2&channelCode=${P}-KENH`,
    );
    expect(specific.body.thresholdRate2).toBe(2000);

    // Bỏ kênh đi thì dòng riêng không còn khớp, rơi về dòng chung.
    const general = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=2`);
    expect(general.body.thresholdRate2).toBe(1000);
  });

  it('CAT-11 kết quả TẤT ĐỊNH — gọi lại nhiều lần cho cùng một dòng', async () => {
    const { id, groupCode } = await makeProduct();
    // Hai dòng cùng điểm cụ thể, khác ngày hiệu lực: phải luôn chọn dòng mới hơn.
    await post('/catalog/discount-rules', {
      productGroupCode: groupCode,
      customerType: 3,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1100,
    });
    await post('/catalog/discount-rules', {
      productGroupCode: groupCode,
      customerType: 3,
      effectiveFrom: '2024-01-01',
      thresholdRate2: 2200,
    });
    for (let i = 0; i < 5; i++) {
      const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=3`);
      expect(r.body.thresholdRate2).toBe(2200);
    }
  });

  it('CAT-12 không dòng nào khớp thì lấy mặc định của sản phẩm', async () => {
    const { id } = await makeProduct({
      defaultRate2Type1: 800,
      defaultRate2Type2: 900,
      defaultRate2Type3: 1000,
    });
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=2`);
    expect(r.body.thresholdRate2).toBe(900);
    expect(r.body.source).toBe('PRODUCT_DEFAULT');
    expect(r.body.ruleId).toBeNull();
  });

  it('CAT-12 hết hiệu lực thì dòng đó không còn khớp', async () => {
    const { id, groupCode } = await makeProduct({ defaultRate2Type1: 700 });
    await post('/catalog/discount-rules', {
      productGroupCode: groupCode,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      effectiveTo: '2020-12-31',
      thresholdRate2: 5000,
    });
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=1`);
    expect(r.body.thresholdRate2).toBe(700);
    expect(r.body.source).toBe('PRODUCT_DEFAULT');
  });
});

describe('CAT-13 nhật ký ghi giá trị trước và sau', () => {
  it('sửa tên sản phẩm sinh sự kiện có cả before lẫn after', async () => {
    const { id, res } = await makeProduct();
    await patch(`/catalog/products/${id}`, { name: 'Ten da sua' });

    const ev = (await lastEvent('catalog.changed')) as {
      entity: string;
      before: { name: string };
      after: { name: string };
      actorId: string;
    };
    expect(ev.entity).toBe('product');
    expect(ev.before.name).toBe(res.body.name);
    expect(ev.after.name).toBe('Ten da sua');
    expect(ev.actorId).toBeTruthy();
  });
});

describe('CAT-14 xoá nhóm còn sản phẩm tham chiếu', () => {
  it('trả 409', async () => {
    const groupCode = code('G');
    const g = await post('/catalog/product-groups', { code: groupCode, name: 'Nhom co SP' });
    await post('/catalog/products', { code: code('P'), name: 'sp', groupCode });

    const r = await del(`/catalog/product-groups/${g.body.id}`);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('GROUP_IN_USE');
  });

  it('nhóm rỗng thì xoá được', async () => {
    const g = await post('/catalog/product-groups', { code: code('G'), name: 'Nhom rong' });
    expect((await del(`/catalog/product-groups/${g.body.id}`)).status).toBe(200);
  });
});

describe('CAT-15 nhập danh mục từ Excel', () => {
  const sheet = async (rows: (string | number | undefined)[][]): Promise<Buffer> => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('SP');
    ws.addRow(['ma_vat_tu', 'ten_vat_tu', 'nhom_sp', 'ck_loai_1', 'ck_loai_2', 'ck_loai_3']);
    for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  };

  const upload = async (buf: Buffer) =>
    (await http(app))
      .post('/catalog/products/import')
      .set('Authorization', `Bearer ${adminT}`)
      .attach('file', buf, 'danh-muc.xlsx');

  it('file sạch thì nhập đủ', async () => {
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom nhap' });
    const r = await upload(
      await sheet([
        [code('I'), 'San pham A', groupCode, '12,35'],
        [code('I'), 'San pham B', groupCode, 10],
      ]),
    );
    expect(r.status).toBe(200);
    expect(r.body.imported).toBe(2);
  });

  it('có dòng lỗi thì báo SỐ DÒNG và KHÔNG ghi một phần', async () => {
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom nhap 2' });
    const okCode = code('I');
    const before = (await get('/catalog/products')).body.length as number;

    const r = await upload(
      await sheet([
        [okCode, 'Dong nay hop le', groupCode],
        ['', 'Dong nay thieu ma', groupCode],
      ]),
    );
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('IMPORT_FAILED');
    expect(r.body.rowNumber).toBe(3); // dòng 1 là tiêu đề
    expect(r.body.message).toContain('Không dòng nào được ghi');

    // Dòng hợp lệ đứng TRƯỚC dòng lỗi cũng không được ghi.
    const after = (await get('/catalog/products')).body as { code: string }[];
    expect(after).toHaveLength(before);
    expect(after.some((p) => p.code === okCode)).toBe(false);
  });

  it('nhóm sản phẩm không tồn tại cũng là lỗi cả lô', async () => {
    const r = await upload(await sheet([[code('I'), 'x', 'NHOM-KHONG-CO']]));
    expect(r.status).toBe(400);
    expect(r.body.rowNumber).toBe(2);
  });
});

describe('CAT-16 đổi tên tỉnh/thành', () => {
  it('mã giữ nguyên nên hồ sơ và bộ lọc cũ vẫn đúng', async () => {
    const c = `${P}-TINH`;
    await post('/catalog/lookups/province', { code: c, name: 'Ten cu' });
    const renamed = await post('/catalog/lookups/province', { code: c, name: 'Ten moi' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.code).toBe(c);
    expect(renamed.body.name).toBe('Ten moi');

    const all = (await get('/catalog/lookups/province')).body as { code: string }[];
    expect(all.filter((x) => x.code === c)).toHaveLength(1);
  });
});

describe('CAT-17 chọn người ký', () => {
  const mkSigner = (over: Record<string, unknown> = {}) =>
    post('/catalog/signers', {
      fullName: `${P} Nguoi ky`,
      title: 'Giam doc',
      unit: 'Nutricare',
      signScope: 'CSBH',
      validFrom: '2020-01-01',
      ...over,
    });

  it('người ký đã hết hiệu lực thì 400', async () => {
    const s = await mkSigner({ validTo: '2021-12-31' });
    const r = await post('/catalog/signers/select', { signerId: s.body.id, scope: 'CSBH' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SIGNER_NOT_VALID');
  });

  it('ký ngoài phạm vi được giao cũng bị chặn', async () => {
    const s = await mkSigner();
    const r = await post('/catalog/signers/select', { signerId: s.body.id, scope: 'HOP_DONG' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SIGNER_OUT_OF_SCOPE');
  });

  it('người ký còn hiệu lực, đúng phạm vi thì chọn được', async () => {
    const s = await mkSigner();
    const r = await post('/catalog/signers/select', { signerId: s.body.id, scope: 'CSBH' });
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(s.body.id);
  });

  it('danh sách lọc theo ngày chỉ trả người còn hiệu lực', async () => {
    await mkSigner({ fullName: `${P} Het han`, validTo: '2021-01-01' });
    const list = (await get('/catalog/signers?activeOn=2026-08-07')).body as {
      fullName: string;
    }[];
    expect(list.some((s) => s.fullName === `${P} Het han`)).toBe(false);
  });
});

describe('CAT-18 đổi giá phát sự kiện đúng một lần', () => {
  it('sự kiện kèm giá cũ và giá mới, nằm cùng transaction với thay đổi', async () => {
    const { id } = await makeProduct();
    await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '100000',
      effectiveFrom: '2020-01-01',
    });
    const before = await countEvents('catalog.price_changed');

    await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '150000',
      effectiveFrom: '2020-06-01',
    });

    expect(await countEvents('catalog.price_changed')).toBe(before + 1);
    const ev = (await lastEvent('catalog.price_changed')) as {
      oldAmount: string;
      newAmount: string;
      productId: string;
    };
    expect(ev.productId).toBe(id);
    expect(ev.oldAmount).toBe('100000');
    expect(ev.newAmount).toBe('150000');
  });

  it('ghi giá hỏng thì KHÔNG có sự kiện mồ côi', async () => {
    const { id } = await makeProduct();
    await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '100000',
      effectiveFrom: '2020-01-01',
    });
    const before = await countEvents('catalog.price_changed');

    // Trùng (sản phẩm, loại giá, ngày hiệu lực) — transaction phải cuốn cả sự kiện.
    const dup = await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: '111000',
      effectiveFrom: '2020-01-01',
    });
    expect(dup.status).toBe(409);
    expect(await countEvents('catalog.price_changed')).toBe(before);
  });
});

describe('AD-02 catalog không đọc chéo schema khác', () => {
  it('role csbh_cat không SELECT được idn.app_user', async () => {
    const err = await withAdminDb(async (c) => {
      await c.query(`SET ROLE csbh_cat`);
      try {
        await c.query(`SELECT 1 FROM idn.app_user LIMIT 1`);
        return undefined;
      } catch (e) {
        return e as { code?: string };
      } finally {
        await c.query(`RESET ROLE`);
      }
    });
    expect(err?.code).toBe('42501');
  });
});
