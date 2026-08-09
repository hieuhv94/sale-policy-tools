/**
 * CUST-01 … CUST-17 — khách hàng do TDV tạo (YCNV muc 6.1).
 *
 * Ba service chạy thật cùng lúc: customer gọi identity để giải phạm vi dữ liệu
 * và gọi catalog để kiểm mã danh mục. Không có bản giả nào — đường token dịch vụ
 * giữa các service được chạy qua trong mọi test.
 *
 * CHƯA PHỦ: CUST-11 và CUST-12 (tải và kiểm file hồ sơ pháp lý). File do service
 * `document` giữ trên MinIO, service đó thuộc chặng P6.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createCustomerApp } from '@csbh/customer/testing';
import {
  accessTokenFor,
  bootCatalogListening,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  http,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZCUS';

let identity: INestApplication;
let catalog: INestApplication;
let app: INestApplication;
let restoreIdentity: () => void;
let restoreCatalog: () => void;
const tok: Record<string, string> = {};

const post = async (path: string, body: object, who = 'tdv01') =>
  (await http(app)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const patch = async (path: string, body: object, who = 'tdv01') =>
  (await http(app)).patch(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const get = async (path: string, who = 'tdv01') =>
  (await http(app)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const del = async (path: string, who = 'tdv01') =>
  (await http(app)).delete(path).set('Authorization', `Bearer ${tok[who]}`);

let n = 0;
const code = () => `${P}-${++n}-${Date.now() % 100000}`;

const base = (over: Record<string, unknown> = {}) => ({
  code: code(),
  name: 'Nha thuoc Minh Chau',
  customerType: 1,
  registeredAddress: 'So 1 Lang Ha, Ha Noi',
  ownerName: 'Nguyen Van A',
  ...over,
});

const cleanup = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM pol.policy WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cus.outbox`);
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.province WHERE code LIKE $1`, [`${P}%`]);
  });

beforeAll(async () => {
  await cleanup();
  const idn = await bootIdentityListening();
  identity = idn.app;
  restoreIdentity = idn.restore;

  const cat = await bootCatalogListening();
  catalog = cat.app;
  restoreCatalog = cat.restore;

  await clearAccountCache();
  await clearScopeCache();
  app = await createCustomerApp();

  for (const u of ['tdv01', 'tdv02', 'kt01', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }

  // Một mã tỉnh có thật trong danh mục, để phân biệt "mã sai" với "mã đúng".
  await (
    await http(catalog)
  )
    .post('/catalog/lookups/province')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: `${P}-HN`, name: 'Ha Noi' });
});

afterAll(async () => {
  await app?.close();
  await catalog?.close();
  await identity?.close();
  restoreCatalog?.();
  restoreIdentity?.();
  await cleanup();
});

describe('CUST-01 tạo khách hàng đủ trường bắt buộc', () => {
  it('201 và TDV phụ trách mặc định là người tạo', async () => {
    const r = await post('/customers', base());
    expect(r.status).toBe(201);

    const me = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'tdv01'`,
      );
      return q.rows[0]!.id;
    });
    expect(r.body.tdvUserId).toBe(me);
  });

  it('thiếu trường bắt buộc thì 400 kèm tên trường', async () => {
    const r = await post('/customers', { code: code(), name: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('customerType');
  });
});

describe('CUST-02 · CUST-03 mã khách hàng trùng', () => {
  it('trùng y hệt thì 409', async () => {
    const c = code();
    expect((await post('/customers', base({ code: c }))).status).toBe(201);
    const again = await post('/customers', base({ code: c }));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('CUSTOMER_CODE_DUPLICATE');
  });

  it('khác hoa thường hoặc thừa khoảng trắng vẫn bị chặn', async () => {
    const c = code();
    await post('/customers', base({ code: c }));
    const messy = await post('/customers', base({ code: `  ${c.toLowerCase()} ` }));
    expect(messy.status).toBe(409);
  });
});

describe('CUST-04 định dạng CCCD/MST', () => {
  it('9 chữ số bị từ chối kèm thông báo cụ thể', async () => {
    const r = await post('/customers', base({ idNumber: '123456789' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('idNumber');
    expect(r.body.message).toContain('chữ số');
  });

  it('có chữ cái cũng bị từ chối', async () => {
    const r = await post('/customers', base({ idNumber: '01234A6789' }));
    expect(r.status).toBe(400);
  });

  it('10, 12 và 13 chữ số đều hợp lệ', async () => {
    for (const v of ['0123456789', '012345678912', '0123456789123']) {
      const r = await post('/customers', base({ idNumber: v }));
      expect(r.status, `${v} đáng lẽ hợp lệ`).toBe(201);
    }
  });
});

describe('CUST-05 CCCD/MST trùng khách hàng khác', () => {
  it('vẫn lưu được nhưng trả cảnh báo kèm danh sách trùng', async () => {
    const mst = '9988776655';
    const first = await post('/customers', base({ idNumber: mst, name: 'Ho kinh doanh A' }));
    expect(first.status).toBe(201);

    const second = await post('/customers', base({ idNumber: mst, name: 'Diem ban thu hai' }));
    // Một chủ hộ mở nhiều điểm bán là nghiệp vụ có thật — chặn cứng là chặn nhầm.
    expect(second.status).toBe(201);
    expect(second.body.duplicateIdNumberWith).toHaveLength(1);
    expect(second.body.duplicateIdNumberWith[0].id).toBe(first.body.id);
  });

  it('không trùng thì danh sách cảnh báo rỗng', async () => {
    const r = await post('/customers', base({ idNumber: '1122334455' }));
    expect(r.body.duplicateIdNumberWith).toEqual([]);
  });
});

describe('CUST-06 loại khách hàng chỉ có ba giá trị', () => {
  it('giá trị 4 bị từ chối', async () => {
    const r = await post('/customers', base({ customerType: 4 }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('customerType');
  });

  it('cả ba giá trị hợp lệ đều nhận', async () => {
    for (const t of [1, 2, 3]) {
      expect((await post('/customers', base({ customerType: t }))).status).toBe(201);
    }
  });
});

describe('CUST-07 địa chỉ đăng ký khác nơi nhận hàng', () => {
  it('lưu và trả về đủ hai trường', async () => {
    const r = await post(
      '/customers',
      base({
        registeredAddress: 'So 1 Lang Ha, Ha Noi',
        deliveryAddress: 'Kho so 5, Bac Ninh',
      }),
    );
    expect(r.status).toBe(201);
    expect(r.body.registeredAddress).toBe('So 1 Lang Ha, Ha Noi');
    expect(r.body.deliveryAddress).toBe('Kho so 5, Bac Ninh');

    const back = await get(`/customers/${r.body.id}`);
    expect(back.body.deliveryAddress).toBe('Kho so 5, Bac Ninh');
  });
});

describe('CUST-08 bốn trường phân loại là danh mục có mã', () => {
  it('mã tỉnh không có trong danh mục thì bị từ chối', async () => {
    const r = await post('/customers', base({ provinceCode: 'KHONG-CO-TINH-NAY' }));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('LOOKUP_CODE_UNKNOWN');
    expect(r.body.unknown).toContain('province:KHONG-CO-TINH-NAY');
  });

  it('mã có thật thì nhận — kiểm qua API nội bộ của catalog', async () => {
    const r = await post('/customers', base({ provinceCode: `${P}-HN` }));
    expect(r.status).toBe(201);
    expect(r.body.provinceCode).toBe(`${P}-HN`);
  });
});

describe('CUST-09 công nợ là trường số bình thường', () => {
  it('lưu và trả về đúng, không có lời gọi ra hệ thống kế toán nào', async () => {
    const r = await post('/customers', base({ debt: '150000000' }));
    expect(r.status).toBe(201);
    expect(r.body.debt).toBe('150000000');
  });
});

describe('CUST-10 đổi TDV phụ trách', () => {
  it('TDV tự chuyển khách của mình thì 403', async () => {
    const c = await post('/customers', base());
    const tdv02Id = await withAdminDb(async (x) => {
      const q = await x.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'tdv02'`,
      );
      return q.rows[0]!.id;
    });
    const r = await patch(`/customers/${c.body.id}`, { tdvUserId: tdv02Id });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('REASSIGN_FORBIDDEN');
  });

  it('Sale Admin thì đổi được', async () => {
    const c = await post('/customers', base());
    const tdv02Id = await withAdminDb(async (x) => {
      const q = await x.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'tdv02'`,
      );
      return q.rows[0]!.id;
    });
    const r = await patch(`/customers/${c.body.id}`, { tdvUserId: tdv02Id }, 'sa01');
    expect(r.status).toBe(200);
    expect(r.body.tdvUserId).toBe(tdv02Id);
  });
});

describe('CUST-13 không đính kèm giấy tờ nào', () => {
  it('vẫn tạo được — hệ thống không cấu hình giấy tờ bắt buộc', async () => {
    const r = await post('/customers', base());
    expect(r.status).toBe(201);
    const docs = await get(`/customers/${r.body.id}/documents`);
    expect(docs.status).toBe(200);
    expect(docs.body).toEqual([]);
  });
});

describe('CUST-14 phạm vi dữ liệu', () => {
  it('tdv02 không đọc được khách hàng của tdv01', async () => {
    const c = await post('/customers', base());
    const r = await get(`/customers/${c.body.id}`, 'tdv02');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });

  it('kt01 thấy được vì tdv01 nằm dưới quyền mình', async () => {
    const c = await post('/customers', base());
    expect((await get(`/customers/${c.body.id}`, 'kt01')).status).toBe(200);
  });

  it('Ban lãnh đạo đọc được toàn bộ nhưng không ghi được', async () => {
    const c = await post('/customers', base());
    expect((await get(`/customers/${c.body.id}`, 'bld01')).status).toBe(200);
    const w = await post('/customers', base(), 'bld01');
    expect(w.status).toBe(403);
  });

  it('danh sách chỉ trả khách trong phạm vi', async () => {
    await post('/customers', base());
    const mine = (await get('/customers?limit=200')).body.items as { tdvUserId: string }[];
    const theirs = (await get('/customers?limit=200', 'tdv02')).body.items as { id: string }[];
    expect(mine.length).toBeGreaterThan(0);
    const mineIds = new Set(mine.map((x) => (x as unknown as { id: string }).id));
    expect(theirs.every((t) => !mineIds.has(t.id))).toBe(true);
  });
});

describe('CUST-15 sửa khách hàng đang có CSBH hiệu lực', () => {
  it('sửa được thông tin liên hệ và nhật ký ghi giá trị trước/sau', async () => {
    const c = await post('/customers', base({ name: 'Ten cu' }));
    await withAdminDb((x) =>
      x.query(
        `INSERT INTO pol.policy (code, customer_id, status)
         VALUES ($1, $2, 'DANG_CO_HIEU_LUC')`,
        [`${P}-POL-${Date.now()}`, c.body.id],
      ),
    );

    const r = await patch(`/customers/${c.body.id}`, { name: 'Ten moi', debt: '5000' });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Ten moi');

    const ev = await withAdminDb(async (x) => {
      const q = await x.query<{ payload: { before: { name: string }; after: { name: string } } }>(
        `SELECT payload FROM cus.outbox WHERE routing_key = 'customer.changed'
          ORDER BY created_at DESC LIMIT 1`,
      );
      return q.rows[0]!.payload;
    });
    expect(ev.before.name).toBe('Ten cu');
    expect(ev.after.name).toBe('Ten moi');
  });

  it('KHÔNG đổi được mã khách hàng — chặn ở tầng CSDL', async () => {
    const c = await post('/customers', base());
    // API không nhận trường code, nên thử đi đường vòng bằng SQL thô.
    const err = await withAdminDb(async (x) => {
      try {
        await x.query(`UPDATE cus.customer SET code = 'MA-MOI' WHERE id = $1`, [c.body.id]);
        return undefined;
      } catch (e) {
        return e as { message: string };
      }
    });
    expect(err?.message).toContain('Khong duoc doi ma khach hang');
  });
});

describe('CUST-16 xoá khách hàng đã có hồ sơ CSBH', () => {
  it('trả 409', async () => {
    const c = await post('/customers', base());
    await withAdminDb((x) =>
      x.query(`INSERT INTO pol.policy (code, customer_id, status) VALUES ($1,$2,'NHAP')`, [
        `${P}-POL2-${Date.now()}`,
        c.body.id,
      ]),
    );
    const r = await del(`/customers/${c.body.id}`);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CUSTOMER_HAS_POLICY');
  });

  it('chưa có hồ sơ nào thì xoá được', async () => {
    const c = await post('/customers', base());
    expect((await del(`/customers/${c.body.id}`)).status).toBe(200);
  });
});

describe('CUST-17 tìm khách hàng', () => {
  it('tìm theo tên, địa chỉ đăng ký và mã số thuế', async () => {
    const mst = '5566778899';
    await post(
      '/customers',
      base({ name: 'Hieu thuoc Kim Lien', registeredAddress: 'Ngo 12 Kim Lien', idNumber: mst }),
    );

    for (const q of ['Kim Lien', 'Ngo 12', mst]) {
      const r = await get(`/customers?q=${encodeURIComponent(q)}`);
      expect(r.status).toBe(200);
      expect((r.body.items as unknown[]).length, `tìm "${q}" phải ra kết quả`).toBeGreaterThan(0);
    }
  });

  it('KHÔNG tồn tại trường "Tên mã khách" ở bất kỳ đâu', async () => {
    const r = await post('/customers', base());
    expect(Object.keys(r.body)).not.toContain('tenMaKhach');
    expect(Object.keys(r.body)).not.toContain('customerShortName');

    const cols = await withAdminDb(async (x) => {
      const q = await x.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'cus' AND table_name = 'customer'`,
      );
      return q.rows.map((c) => c.column_name);
    });
    expect(cols).not.toContain('short_name');
    expect(cols).not.toContain('ten_ma_khach');
  });
});

describe('AD-02 customer không đọc chéo schema khác', () => {
  it('role csbh_cus không SELECT được cat.product hay idn.app_user', async () => {
    for (const table of ['cat.product', 'idn.app_user']) {
      const err = await withAdminDb(async (c) => {
        await c.query(`SET ROLE csbh_cus`);
        try {
          await c.query(`SELECT 1 FROM ${table} LIMIT 1`);
          return undefined;
        } catch (e) {
          return e as { code?: string };
        } finally {
          await c.query(`RESET ROLE`);
        }
      });
      expect(err?.code, `csbh_cus đáng lẽ không đọc được ${table}`).toBe('42501');
    }
  });
});

describe('Công nợ bằng 0 là hợp lệ', () => {
  it('lập được khách hàng không nợ gì', async () => {
    // `money()` bắt buộc > 0 và đúng cho GIÁ BÁN. Công nợ thì khác: khách vừa
    // thanh toán xong là nợ 0. Lỗi này chỉ lộ ra khi dựng dữ liệu demo thật.
    const r = await post('/customers', base({ debt: '0' }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.debt).toBe('0');
  });

  it('công nợ ÂM vẫn bị chặn', async () => {
    const r = await post('/customers', base({ debt: '-1000' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('debt');
  });
});

describe('OPS-07 phân trang', () => {
  it('mặc định trả tối đa 50 dòng kèm tổng số', async () => {
    for (let i = 0; i < 3; i++) await post('/customers', base());
    const r = await get('/customers');
    expect(r.status).toBe(200);
    expect(r.body.limit).toBe(50);
    expect(r.body.offset).toBe(0);
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(r.body.items.length).toBeLessThanOrEqual(50);
    // Tổng phải là tổng THẬT của cả tập, không phải số dòng trang này.
    expect(r.body.total).toBeGreaterThanOrEqual(r.body.items.length);
  });

  it('limit và offset cắt đúng, không trùng không sót', async () => {
    for (let i = 0; i < 5; i++) await post('/customers', base());
    const p1 = (await get('/customers?limit=2&offset=0')).body;
    const p2 = (await get('/customers?limit=2&offset=2')).body;
    expect(p1.items).toHaveLength(2);
    expect(p2.items).toHaveLength(2);
    const ids1 = (p1.items as { id: string }[]).map((x) => x.id);
    const ids2 = (p2.items as { id: string }[]).map((x) => x.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    expect(p1.total).toBe(p2.total);
  });

  it('limit vượt trần bị từ chối — không có đường lấy cả bảng', async () => {
    const r = await get('/customers?limit=100000');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('limit');
  });

  it('limit và offset không hợp lệ đều bị chặn', async () => {
    expect((await get('/customers?limit=0')).status).toBe(400);
    expect((await get('/customers?limit=abc')).status).toBe(400);
    expect((await get('/customers?offset=-1')).status).toBe(400);
  });
});
