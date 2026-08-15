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

describe('CAT-03 danh mục chỉ có Giá bán Công ty', () => {
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

  it('GIÁ BÁN BUÔN cũng bị từ chối — nó không thuộc danh mục', async () => {
    // Giá bán buôn do người đề nghị nhập trên từng dòng hồ sơ, khác nhau theo
    // khách hàng và theo lần lập (muc 6.1). Một con số cấp danh mục không tả
    // được thứ đó, và không service nào đọc nó — để lại là bày ra một ô mà điền
    // vào cũng không ảnh hưởng tới phép tính nào.
    const { id } = await makeProduct();
    const r = await post(`/catalog/products/${id}/prices`, {
      priceType: 'GIA_BAN_BUON',
      amount: '90000',
      effectiveFrom: '2026-01-01',
    });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('priceType');
  });

  it('bỏ trống loại giá thì hiểu là Giá bán Công ty', async () => {
    // Biểu mẫu không còn ô chọn, nên nó không gửi trường này. Bắt gửi một trường
    // chỉ có đúng một giá trị hợp lệ là bắt gõ lại một hằng số.
    const { id } = await makeProduct();
    const r = await post(`/catalog/products/${id}/prices`, {
      amount: '100000',
      effectiveFrom: '2026-01-01',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);

    const ls = await get(`/catalog/products/${id}/prices`);
    expect(ls.body[0].priceType).toBe('GIA_BAN_CONG_TY');
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


/** Có mặt trong danh sách đầy đủ hay không, duyệt qua mọi trang. */
async function existsInAllPages(productId: string): Promise<boolean> {
  for (let offset = 0; ; offset += 200) {
    const r = await get(`/catalog/products?limit=200&offset=${offset}`);
    const items = r.body.items as { id: string }[];
    if (items.some((p) => p.id === productId)) return true;
    if (offset + items.length >= Number(r.body.total) || items.length === 0) return false;
  }
}

describe('CAT-07 · CAT-08 sản phẩm đã vô hiệu hoá', () => {
  it('không xuất hiện khi lấy danh sách để lập CSBH mới', async () => {
    const { id } = await makeProduct();
    await patch(`/catalog/products/${id}`, { status: 'DA_VO_HIEU_HOA' });

    const forNew = await get(`/catalog/products?forNewPolicy=true&limit=200`);
    expect((forNew.body.items as { id: string }[]).some((p) => p.id === id)).toBe(false);

    // Duyệt HẾT các trang, không chỉ trang đầu. Danh mục đã vượt 200 sản phẩm
    // (trần một trang), và sản phẩm sắp theo mã nên bản mới tạo không nhất
    // thiết nằm ở trang đầu — test cũ xanh chỉ vì bảng còn nhỏ.
    expect(await existsInAllPages(id)).toBe(true);
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
      code: code('CK'),
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
      code: code('CK'),
      productGroupCode: groupCode,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1000,
    });
    await post('/catalog/discount-rules', {
      code: code('CK'),
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
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 3,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1100,
    });
    await post('/catalog/discount-rules', {
      code: code('CK'),
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

  it('CAT-12 không dòng nào khớp thì KHÔNG CÓ ngưỡng nào', async () => {
    // Từ `0025` không còn ngưỡng mặc định trên sản phẩm để rơi về. Bảng quy định
    // là nguồn DUY NHẤT, đúng như `0005` đã chốt — ba cột mặc định kia là một
    // nguồn thứ hai song song, vô hình vì không có màn hình nhập.
    //
    // 200 chứ không 404: xem `0023`. Ngưỡng chỉ để cảnh báo, nên thiếu ngưỡng
    // không phải lỗi — chỉ là không đối chiếu được.
    const { id } = await makeProduct();
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=2`);
    expect(r.status).toBe(200);
    expect(r.body.thresholdRate2).toBeNull();
    expect(r.body.source).toBe('KHONG_CO');
    expect(r.body.ruleCode).toBeNull();
  });

  it('CAT-12 quy định VÔ THỜI HẠN — không có ngày hết hiệu lực', async () => {
    // Từ 0020, ngưỡng chiết khấu theo đúng luật của chính CSBH: có hiệu lực từ
    // ngày khai cho tới khi bị xoá. Gửi kèm `effectiveTo` thì trường lạ bị bỏ
    // qua, KHÔNG được âm thầm ghi vào.
    const { id, groupCode } = await makeProduct();
    const tao = await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      effectiveTo: '2020-12-31',
      thresholdRate2: 5000,
    });
    expect(tao.status).toBe(201);
    expect(tao.body.effectiveTo).toBeUndefined();

    // Ngày hôm nay vẫn khớp dù "ngày kết thúc" kia đã qua từ lâu.
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=1`);
    expect(r.body.thresholdRate2).toBe(5000);
    expect(r.body.source).toBe('RULE');
  });
});

/**
 * 0022 — hai quy định trùng phạm vi không còn tồn tại được.
 *
 * Trước 0022 chúng chèn được, và `resolve` phân xử bằng thứ tự `id` — tất định
 * nhưng vô nghĩa với người khai. Giờ máy chủ từ chối ngay lúc khai, kèm mã riêng
 * để màn hình nói được phải làm gì thay vì bày một lỗi 500.
 */
describe('0022 trùng phạm vi quy định chiết khấu', () => {
  it('khai lại đúng phạm vi và đúng ngày hiệu lực → 409 RULE_SCOPE_DUPLICATE', async () => {
    const { groupCode } = await makeProduct();
    const mot = await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1500,
    });
    expect(mot.status).toBe(201);

    const hai = await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 2000,
    });
    expect(hai.status).toBe(409);
    expect(hai.body.code).toBe('RULE_SCOPE_DUPLICATE');
  });

  it('dòng đầu vẫn nguyên vẹn sau khi dòng thứ hai bị từ chối', async () => {
    // Từ chối chứ KHÔNG ghi đè: người khai có thể đang định sửa ngưỡng, mà cũng
    // có thể đang khai nhầm. Ghi đè là đoán hộ họ và xoá mất dữ liệu nếu đoán sai.
    const { id, groupCode } = await makeProduct();
    await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 3,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1234,
    });
    await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 3,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 9999,
    });
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=3`);
    expect(r.body.thresholdRate2).toBe(1234);
  });

  it('cùng phạm vi, ngày muộn hơn → nhận, và dòng mới thắng', async () => {
    const { id, groupCode } = await makeProduct();
    await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 2,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1100,
    });
    const sau = await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 2,
      effectiveFrom: '2024-01-01',
      thresholdRate2: 2200,
    });
    expect(sau.status).toBe(201);
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=2`);
    expect(r.body.thresholdRate2).toBe(2200);
  });

  it('resolve chỉ ra ĐÍCH DANH quy định đã thắng', async () => {
    // `ruleCode` là thứ `policy` đóng băng vào `policy_line.rule_code_snap`. Không
    // có nó thì sáu tháng sau không ai trả lời được vì sao hồ sơ này ngưỡng
    // khác hồ sơ kia.
    const { id, groupCode } = await makeProduct();
    const tao = await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1700,
    });
    const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=1`);
    expect(r.body.source).toBe('RULE');
    expect(r.body.ruleCode).toBe(tao.body.code);
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
    const before = (await get('/catalog/products?limit=200')).body.total as number;

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
    //
    // So TỔNG với tổng, không so tổng với một trang. Bản trước lấy `before` từ
    // `total` rồi đối chiếu với `items` của trang đầu — hai con số chỉ bằng nhau
    // khi danh mục còn dưới 200 sản phẩm, nên test xanh suốt từ P4 rồi đỏ ở P6b
    // đúng lúc dữ liệu vượt trần phân trang. Lỗi của phép khẳng định, không phải
    // của mã sản phẩm.
    expect((await get('/catalog/products?limit=1')).body.total).toBe(before);
    const found = await withAdminDb(async (c) =>
      c.query(`SELECT 1 FROM cat.product WHERE code = $1`, [okCode]),
    );
    expect(found.rowCount).toBe(0);
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

// =============================================================================
// Sửa và xoá quy định chiết khấu, người ký
//
// Trước đợt này cả hai nhóm chỉ có POST. Khai nhầm một dòng thì không gỡ được
// qua API — phải vào thẳng CSDL, tức là một thao tác không đi qua nhật ký nào.
// =============================================================================

describe('sửa và xoá quy định chiết khấu', () => {
  const mkRule = async (over: Record<string, unknown> = {}) => {
    const { groupCode } = await makeProduct();
    const r = await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1500,
      ...over,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return { ma: r.body.code as string, groupCode };
  };

  it('sửa ngưỡng rồi tra lại ra con số mới', async () => {
    const { ma, groupCode } = await mkRule();
    const sp = await post('/catalog/products', {
      code: code('P'),
      name: 'San pham',
      groupCode,
    });

    const sua = await patch(`/catalog/discount-rules/${ma}`, { thresholdRate2: 2200 });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);

    const tra = await get(
      `/catalog/thresholds/resolve?productId=${sp.body.id}&customerType=1`,
    );
    expect(tra.body.thresholdRate2).toBe(2200);
  });

  it('đặt ngày kết thúc thì dòng thôi khớp sau ngày đó', async () => {
    const { ma, groupCode } = await mkRule();
    const sp = await post('/catalog/products', {
      code: code('P'),
      name: 'SP',
      groupCode,
    });
    const tra = (on: string) =>
      get(`/catalog/thresholds/resolve?productId=${sp.body.id}&customerType=1&on=${on}`);

    expect((await tra('2026-01-01')).body.source).toBe('RULE');

    // Gửi kèm `effectiveTo` KHÔNG cắt được hiệu lực nữa — trường đó không còn
    // tồn tại nên bị bỏ qua. Muốn dừng một quy định thì XOÁ dòng.
    const suaR = await patch(`/catalog/discount-rules/${ma}`, {
      thresholdRate2: 1500,
      effectiveTo: '2020-12-31',
    });
    expect(suaR.status).toBe(200);
    expect((await tra('2026-01-01')).body.source).toBe('RULE');

    // Xoá dòng thì KHÔNG còn quy định nào phủ sản phẩm này. Trước `0025` chỗ
    // này rơi về ngưỡng mặc định của sản phẩm; ba cột ấy đã bỏ nên giờ rơi thẳng
    // sang `KHONG_CO`.
    await del(`/catalog/discount-rules/${ma}`);
    const sau = await tra('2026-01-01');
    expect(sau.body.source).toBe('KHONG_CO');
    expect(sau.body.thresholdRate2).toBeNull();
  });

  it('KHÔNG sửa được ba khoá khớp — độ cụ thể giữ nguyên', async () => {
    // Đổi nhóm/loại khách/kênh là đổi `specificity`, tức đổi thứ tự ưu tiên của
    // cả bảng (CAT-11). Trường lạ bị bỏ qua, không được âm thầm ghi vào.
    const { ma } = await mkRule();
    const truoc = ((await get('/catalog/discount-rules?limit=200')).body.items as {
      code: string;
      specificity: number;
      customerType: number | null;
    }[]).find((x) => x.code === ma)!;

    await patch(`/catalog/discount-rules/${ma}`, {
      thresholdRate2: 1500,
      customerType: 3,
      productGroupCode: null,
    });

    const sau = ((await get('/catalog/discount-rules?limit=200')).body.items as typeof truoc[]).find(
      (x) => x.code === ma,
    )!;
    expect(sau.customerType).toBe(truoc.customerType);
    expect(sau.specificity).toBe(truoc.specificity);
  });

  it('xoá rồi thì không còn trong danh sách, xoá lần nữa là 404', async () => {
    const { ma } = await mkRule();
    expect((await del(`/catalog/discount-rules/${ma}`)).status).toBe(200);

    const ds = (await get('/catalog/discount-rules?limit=200')).body.items as { code: string }[];
    expect(ds.some((x) => x.code === ma)).toBe(false);

    expect((await del(`/catalog/discount-rules/${ma}`)).status).toBe(404);
  });

  it('sửa và xoá đều phát sự kiện nhật ký kèm giá trị TRƯỚC (CAT-13)', async () => {
    const { ma } = await mkRule();

    await patch(`/catalog/discount-rules/${ma}`, { thresholdRate2: 3000 });
    let ev = await lastEvent('catalog.changed');
    expect((ev!['before'] as Record<string, unknown>)['threshold_rate2']).toBe(1500);

    await del(`/catalog/discount-rules/${ma}`);
    ev = await lastEvent('catalog.changed');
    expect(ev!['after']).toBeNull();
    expect((ev!['before'] as Record<string, unknown>)['threshold_rate2']).toBe(3000);
  });

  it('vai trò khác Quản trị không sửa và không xoá được', async () => {
    const { ma } = await mkRule();
    expect((await patch(`/catalog/discount-rules/${ma}`, { thresholdRate2: 1 }, tdvT)).status).toBe(403);
    expect((await del(`/catalog/discount-rules/${ma}`, tdvT)).status).toBe(403);
  });
});

describe('sửa và xoá người ký', () => {
  const mkSigner = async (over: Record<string, unknown> = {}) => {
    const r = await post('/catalog/signers', {
      fullName: `${P} Nguoi ky sua`,
      title: 'Giam doc',
      unit: 'Nutricare',
      signScope: 'CSBH',
      validFrom: '2020-01-01',
      ...over,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.id as string;
  };

  it('ngừng dùng thì KHÔNG chọn được nữa, dùng lại thì chọn được', async () => {
    // `isActive: false` là cách đúng để ngừng một người ký — hợp đồng đã xuất
    // mang tên họ, mà hệ thống không lưu file để đối chiếu lại.
    const id = await mkSigner();
    expect((await post('/catalog/signers/select', { signerId: id, scope: 'CSBH' })).status).toBe(200);

    expect((await patch(`/catalog/signers/${id}`, { isActive: false })).status).toBe(200);
    expect((await post('/catalog/signers/select', { signerId: id, scope: 'CSBH' })).status).toBe(400);

    await patch(`/catalog/signers/${id}`, { isActive: true });
    expect((await post('/catalog/signers/select', { signerId: id, scope: 'CSBH' })).status).toBe(200);
  });

  it('sửa được phạm vi ký', async () => {
    const id = await mkSigner();
    expect((await post('/catalog/signers/select', { signerId: id, scope: 'HOP_DONG' })).status).toBe(400);

    await patch(`/catalog/signers/${id}`, { signScope: 'HOP_DONG' });
    expect((await post('/catalog/signers/select', { signerId: id, scope: 'HOP_DONG' })).status).toBe(200);
  });

  it('họ tên và ngày bắt đầu KHÔNG sửa được', async () => {
    const id = await mkSigner();
    await patch(`/catalog/signers/${id}`, { fullName: 'Ten khac', validFrom: '2030-01-01' });

    const ds = (await get('/catalog/signers')).body as {
      id: string;
      fullName: string;
      validFrom: string;
    }[];
    const k = ds.find((x) => x.id === id)!;
    expect(k.fullName).toBe(`${P} Nguoi ky sua`);
    expect(String(k.validFrom)).toContain('2020-01-01');
  });

  it('xoá rồi thì 404 ở lần xoá thứ hai', async () => {
    const id = await mkSigner();
    expect((await del(`/catalog/signers/${id}`)).status).toBe(200);
    expect((await del(`/catalog/signers/${id}`)).status).toBe(404);
  });

  it('vai trò khác Quản trị không sửa và không xoá được', async () => {
    const id = await mkSigner();
    expect((await patch(`/catalog/signers/${id}`, { isActive: false }, tdvT)).status).toBe(403);
    expect((await del(`/catalog/signers/${id}`, tdvT)).status).toBe(403);
  });
});

/**
 * 0024 — mã quy định do người dùng đặt, và hai cách trùng khác nhau.
 *
 * `0023` đưa mã ra tới mặt người dùng (cột *Id*, cột *QĐCK*, ô tìm kiếm) trong
 * khi nó vẫn là uuid. Một mã được CHÉP ra khỏi hệ thống thì phải do người dùng
 * đặt — 36 ký tự ngẫu nhiên không ai đọc, nhớ hay đọc qua điện thoại được.
 */
describe('0024 mã quy định chiết khấu', () => {
  const khai = (over: Record<string, unknown> = {}) =>
    post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: undefined,
      customerType: 1,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1500,
      ...over,
    });

  it('mã người dùng gửi lên chính là mã trả về và lưu lại', async () => {
    const { groupCode } = await makeProduct();
    const ma = code('CK-DAT-TAY');
    const r = await khai({ code: ma, productGroupCode: groupCode });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.code).toBe(ma);

    const ds = (await get('/catalog/discount-rules?limit=200')).body.items as { code: string }[];
    expect(ds.some((x) => x.code === ma)).toBe(true);
  });

  it('thiếu mã thì 400 — mã không sinh tự động nữa', async () => {
    const { groupCode } = await makeProduct();
    const r = await post('/catalog/discount-rules', {
      productGroupCode: groupCode,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1500,
    });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('code');
  });

  it('TRÙNG MÃ thì 409 RULE_CODE_DUPLICATE, phân biệt với trùng phạm vi', async () => {
    // Hai cách trùng, hai cách sửa khác nhau — gộp thành một thông báo là bắt
    // người dùng đoán mình phải đổi mã hay đổi ngày hiệu lực.
    const a = await makeProduct();
    const b = await makeProduct();
    const ma = code('CK-TRUNG');
    expect((await khai({ code: ma, productGroupCode: a.groupCode })).status).toBe(201);

    // Phạm vi KHÁC hẳn (nhóm khác) nên chỉ có mỗi mã là trùng.
    const lai = await khai({ code: ma, productGroupCode: b.groupCode });
    expect(lai.status).toBe(409);
    expect(lai.body.code).toBe('RULE_CODE_DUPLICATE');
  });

  it('trùng mã KHÔNG phân biệt hoa thường và khoảng trắng thừa', async () => {
    // Cùng luật với mã vật tư (CAT-02). Hai mã chỉ khác hoa thường là hai mã
    // người dùng đọc ra giống hệt nhau — và một trong hai sẽ không tìm được.
    const a = await makeProduct();
    const b = await makeProduct();
    const ma = code('CK-HOA-THUONG');
    expect((await khai({ code: ma, productGroupCode: a.groupCode })).status).toBe(201);

    const lai = await khai({ code: `  ${ma.toLowerCase()}  `, productGroupCode: b.groupCode });
    expect(lai.status).toBe(409);
    expect(lai.body.code).toBe('RULE_CODE_DUPLICATE');
  });

  it('trùng PHẠM VI vẫn là RULE_SCOPE_DUPLICATE, không lẫn sang mã', async () => {
    const { groupCode } = await makeProduct();
    expect((await khai({ productGroupCode: groupCode })).status).toBe(201);

    // Mã khác hẳn, chỉ phạm vi và ngày hiệu lực trùng.
    const lai = await khai({ productGroupCode: groupCode });
    expect(lai.status).toBe(409);
    expect(lai.body.code).toBe('RULE_SCOPE_DUPLICATE');
  });

  it('mã rỗng hoặc toàn khoảng trắng thì 400', async () => {
    const { groupCode } = await makeProduct();
    expect((await khai({ code: '', productGroupCode: groupCode })).status).toBe(400);
    expect((await khai({ code: '   ', productGroupCode: groupCode })).status).toBe(400);
  });

  it('sửa và xoá đi theo MÃ, không theo id nội bộ nào nữa', async () => {
    const { groupCode } = await makeProduct();
    const ma = code('CK-SUA-XOA');
    expect((await khai({ code: ma, productGroupCode: groupCode })).status).toBe(201);

    const sua = await patch(`/catalog/discount-rules/${ma}`, { thresholdRate2: 2600 });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);
    expect(sua.body.code).toBe(ma);
    expect(sua.body.thresholdRate2).toBe(2600);

    expect((await del(`/catalog/discount-rules/${ma}`)).status).toBe(200);
    expect((await del(`/catalog/discount-rules/${ma}`)).status).toBe(404);
  });
});

/**
 * 0025 — không còn ngưỡng chiết khấu mặc định trên sản phẩm.
 *
 * Ba cột `default_rate2_type1/2/3` là một NGUỒN NGƯỠNG THỨ HAI song song với
 * bảng quy định, trong khi `0005` đã chốt bảng quy định là nguồn duy nhất.
 */
describe('0025 bỏ ngưỡng mặc định của sản phẩm', () => {
  it('gửi kèm defaultRate2Type* thì bị BỎ QUA, không lưu lại', async () => {
    const { id, res } = await makeProduct({
      defaultRate2Type1: 800,
      defaultRate2Type2: 900,
      defaultRate2Type3: 1000,
    });
    expect(res.status).toBe(201);
    expect(res.body.defaultRate2Type1).toBeUndefined();

    const mot = await get(`/catalog/products/${id}`);
    expect(mot.body.defaultRate2Type1).toBeUndefined();
    expect(mot.body.defaultRate2Type2).toBeUndefined();
    expect(mot.body.defaultRate2Type3).toBeUndefined();
  });

  it('tra ngưỡng KHÔNG bao giờ trả PRODUCT_DEFAULT nữa', async () => {
    const { id } = await makeProduct({ defaultRate2Type1: 800 });
    for (const loai of [1, 2, 3]) {
      const r = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=${loai}`);
      expect(r.body.source).toBe('KHONG_CO');
    }
  });

  it('nhập Excel vẫn nhận file mẫu CŨ, ba cột thừa bị bỏ qua', async () => {
    // Chặn file cũ là bắt người dùng sửa lại một file họ đã có, để đổi lấy đúng
    // con số không: ba cột ấy giờ không dùng vào việc gì.
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom excel 0025' });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('sp');
    ws.addRow(['ma_vat_tu', 'ten_vat_tu', 'nhom_sp', 'ck_loai_1', 'ck_loai_2', 'ck_loai_3']);
    const maSp = code('P');
    ws.addRow([maSp, 'San pham excel', groupCode, 12.35, 12.35, 12.35]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const r = await (await http(app))
      .post('/catalog/products/import')
      .set('Authorization', `Bearer ${adminT}`)
      .attach('file', buf, 'sp.xlsx');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.imported).toBe(1);

    const ds = (await get(`/catalog/products?q=${encodeURIComponent(maSp)}&limit=50`)).body
      .items as { code: string; defaultRate2Type1?: number }[];
    const sp = ds.find((x) => x.code === maSp);
    expect(sp).toBeDefined();
    expect(sp!.defaultRate2Type1).toBeUndefined();
  });
});
