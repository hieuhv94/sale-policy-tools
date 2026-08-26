/**
 * CAT-01 … CAT-18 — danh mục sản phẩm, giá, quy định chiết khấu.
 *
 * KHÔNG còn `CAT-17 chọn người ký`: đối tượng Người ký đã xoá hẳn ở `0033`. Nó ở
 * trạng thái nửa vời từ 15/08 — có lược đồ, có API, có test, mà KHÔNG có màn
 * hình nhập liệu, nên trên một bản triển khai mới không ai tạo được người ký
 * nào. Khách hàng chốt 16/08 là hợp đồng không cần in tên người ký của Công ty.
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
/**
 * `DELETE` KÈM THÂN REQUEST — mọi đường xoá của danh mục đòi gõ lại mã (`0036`).
 *
 * Mặc định `{}` để những ca cố ý gọi THIẾU `confirm` vẫn viết được ngắn gọn.
 */
const del = async (path: string, body: object = {}, token = adminT) =>
  (await http(app)).delete(path).set('Authorization', `Bearer ${token}`).send(body);

const cleanup = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM cat.outbox`);
    await c.query(`DELETE FROM cat.discount_rule`);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
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
    // Giá bắt buộc từ `0123`. Đặt TRƯỚC `...over` để ca kiểm ghi đè được.
    price: '100000',
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
      groupCode, price: '100000' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('PRODUCT_CODE_DUPLICATE');
  });

  it('chặn cả khi khác hoa thường hoặc thừa khoảng trắng', async () => {
    const { res, groupCode } = await makeProduct();
    const messy = await post('/catalog/products', {
      code: `  ${(res.body.code as string).toLowerCase()}  `,
      name: 'Ten khac',
      groupCode, price: '100000' });
    expect(messy.status).toBe(409);
  });
});

describe('`0123` tạo sản phẩm BẮT BUỘC có giá', () => {
  it('thiếu giá thì 400 và KHÔNG tạo sản phẩm nào', async () => {
    /*
     * Trước `0123` giá là một bước riêng, và hệ quả là sản phẩm sinh ra ở trạng
     * thái KHÔNG DÙNG ĐƯỢC: nó hiện trong ô chọn lúc lập hồ sơ rồi chặn ở
     * `PRICE_NOT_SET` đúng lúc Trình dược viên đã gõ xong dòng.
     */
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom thieu gia' });
    const ma = code('P');

    const r = await post('/catalog/products', { code: ma, name: 'Khong gia', groupCode });
    expect(r.status).toBe(400);

    const co = await withAdminDb(async (c) =>
      c.query(`SELECT 1 FROM cat.product WHERE code = $1`, [ma]),
    );
    expect(co.rowCount).toBe(0);
  });

  it('giá 0 hoặc âm bị chặn — bán không đồng là nhập sai', async () => {
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom gia xau' });
    for (const price of ['0', '-1000']) {
      const r = await post('/catalog/products', {
        code: code('P'),
        name: `Gia ${price}`,
        groupCode,
        price,
      });
      expect(r.status, `giá ${price}`).toBe(400);
    }
  });

  it('tạo xong là DÙNG ĐƯỢC NGAY: có giá hiện hành, áp dụng từ hôm nay', async () => {
    const { id } = await makeProduct({ price: '77000' });
    const gia = await get(`/catalog/products/${id}/current-price?priceType=GIA_BAN_CONG_TY`);
    expect(gia.body.amount).toBe('77000');
    expect(String(gia.body.effectiveFrom).slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  it('sản phẩm và giá nằm trong MỘT transaction', async () => {
    /*
     * Mã nhóm không tồn tại thì lượt tạo hỏng ở giữa. Không có gì được ghi —
     * một sản phẩm không có giá không được phép tồn tại dù chỉ một khoảnh khắc.
     */
    const ma = code('P');
    const r = await post('/catalog/products', {
      code: ma,
      name: 'Nhom bia',
      groupCode: 'NHOM-KHONG-CO-THAT',
      price: '10000',
    });
    expect(r.status).toBe(404);
    const co = await withAdminDb(async (c) =>
      c.query(`SELECT 1 FROM cat.product WHERE code = $1`, [ma]),
    );
    expect(co.rowCount).toBe(0);
  });
});

describe('`0125` mở hộp thoại Sửa KHÔNG ghi gì', () => {
  /*
   * Khách hàng báo: mở *Sửa* thì *Lịch sử giá* luôn hiện giá hiện tại kèm ngày
   * hôm nay, dù chưa bấm Lưu — nghe như hệ thống tự ghi một lần đổi giá.
   *
   * Đo lại thì KHÔNG có lượt ghi nào. Dòng ấy do chính lượt TẠO sinh ra
   * (`0123`), và nó đúng. Hai chỗ sai là ở nơi khác: bộ nạp demo để lại một
   * dòng thừa mang ngày hôm nay, và bảng lịch sử không nói dòng nào đang có
   * hiệu lực. Nhóm ca này khoá lại phần "không ghi gì" để nghi ngờ ấy không
   * quay lại.
   */
  const demDong = async (id: string) =>
    Number(
      (
        await withAdminDb(async (c) =>
          c.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM cat.product_price WHERE product_id = $1`,
            [id],
          ),
        )
      ).rows[0]!.n,
    );

  it('tạo xong có ĐÚNG MỘT dòng giá, và đọc lịch sử nhiều lần không thêm dòng nào', async () => {
    const { id } = await makeProduct({ price: '60000' });
    expect(await demDong(id)).toBe(1);

    for (let i = 0; i < 3; i++) {
      const r = await get(`/catalog/products/${id}/prices`);
      expect(r.status).toBe(200);
    }
    expect(await demDong(id)).toBe(1);
  });

  it('Lưu mà KHÔNG đổi giá thì không thêm dòng nào', async () => {
    const { id, res } = await makeProduct({ price: '60000' });
    await patch(`/catalog/products/${id}`, { name: 'Chi doi ten', confirm: res.body.code });
    expect(await demDong(id)).toBe(1);
  });

  it('gửi lại ĐÚNG giá đang có cũng không thêm dòng nào', async () => {
    const { id, res } = await makeProduct({ price: '60000' });
    await patch(`/catalog/products/${id}`, { price: '60000', confirm: res.body.code });
    expect(await demDong(id)).toBe(1);
  });
});

describe('`0123` bảng sản phẩm mang theo giá bán Công ty', () => {
  it('mỗi dòng có `price`, và MỌI vai trò đọc được', async () => {
    /*
     * Bảng này là màn hình Sản phẩm của cả sáu vai trò. Tới `0122` nó không
     * hiện giá ở đâu, nên Trình dược viên muốn biết giá một mặt hàng phải mở
     * màn hình lập hồ sơ rồi thêm dòng — đi vào một luồng GHI để đọc một con số.
     */
    const { id } = await makeProduct({ price: '88000' });
    for (const [ai, token] of [
      ['quản trị', adminT],
      ['TDV', tdvT],
    ] as const) {
      const r = await get(`/catalog/products?limit=200&q=San pham thu nghiem`, token);
      const dong = (r.body.items as { id: string; price: string | null }[]).find((x) => x.id === id);
      expect(dong?.price, `${ai} phải đọc được giá`).toBe('88000');
    }
  });

  it('giá trong bảng KHỚP `current-price` — không phải hai phép chọn khác nhau', async () => {
    /*
     * Hai chỗ trả lời "giá hiện hành là bao nhiêu" mà lệch nhau thì bảng nói một
     * con số còn hồ sơ đóng băng một con số khác. Đặt một giá cho NGÀY MAI để
     * ép cả hai phải bỏ qua nó.
     */
    const { id, res } = await makeProduct({ price: '20000' });
    const mai = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await post(`/catalog/products/${id}/prices`, { amount: '999000', effectiveFrom: mai });

    const bang = await get(`/catalog/products?limit=200&q=San pham thu nghiem`);
    const dong = (bang.body.items as { id: string; price: string }[]).find((x) => x.id === id);
    const mot = await get(`/catalog/products/${id}/current-price?priceType=GIA_BAN_CONG_TY`);
    expect(dong?.price).toBe(mot.body.amount);
    expect(dong?.price, `giá của ngày mai chưa được tính`).toBe('20000');
    expect(res.body.code).toBeTruthy();
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
    const { id, res } = await makeProduct();
    await patch(`/catalog/products/${id}`, {
      status: 'DA_VO_HIEU_HOA',
      confirm: res.body.code,
    });

    const forNew = await get(`/catalog/products?forNewPolicy=true&limit=200`);
    expect((forNew.body.items as { id: string }[]).some((p) => p.id === id)).toBe(false);

    // Duyệt HẾT các trang, không chỉ trang đầu. Danh mục đã vượt 200 sản phẩm
    // (trần một trang), và sản phẩm sắp theo mã nên bản mới tạo không nhất
    // thiết nằm ở trang đầu — test cũ xanh chỉ vì bảng còn nhỏ.
    expect(await existsInAllPages(id)).toBe(true);
  });

  it('hồ sơ cũ vẫn mở xem được, hiện đúng mã và tên', async () => {
    const { id, res } = await makeProduct();
    await patch(`/catalog/products/${id}`, {
      status: 'DA_VO_HIEU_HOA',
      confirm: res.body.code,
    });

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
      groupCode: 'KHONG-CO-NHOM-NAY', price: '100000' });
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

    // Dòng chung cho cả nhóm, và dòng riêng cho một loại khách — cả hai đều
    // khớp khi khách thuộc loại ấy. HAI chiều là tất cả những gì còn lại (0026).
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
      effectiveFrom: '2020-01-01',
      thresholdRate2: 2000,
    });

    const specific = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=2`);
    expect(specific.body.thresholdRate2).toBe(2000);

    // Khách loại khác thì dòng riêng không còn khớp, rơi về dòng chung.
    const general = await get(`/catalog/thresholds/resolve?productId=${id}&customerType=3`);
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
    await patch(`/catalog/products/${id}`, { name: 'Ten da sua', confirm: res.body.code });

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
    await post('/catalog/products', { code: code('P'), name: 'sp', groupCode, price: '100000' });

    const r = await del(`/catalog/product-groups/${g.body.id}`, { confirm: groupCode });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('GROUP_IN_USE');
  });

  it('nhóm rỗng thì xoá được', async () => {
    const ma = code('G');
    const g = await post('/catalog/product-groups', { code: ma, name: 'Nhom rong' });
    expect((await del(`/catalog/product-groups/${g.body.id}`, { confirm: ma })).status).toBe(200);
  });
});

/**
 * CAT-15 · CAT-16 · CAT-17 — nhập danh mục từ Excel (`0121`).
 *
 * Từ `0121` đây không còn là "thêm sản phẩm hàng loạt" mà là **ghi đè danh mục**:
 * file mang đủ mọi sản phẩm đang có, và lượt nhập sửa tên, nhóm, giá của những
 * mã đã tồn tại. Nên phần lớn ca dưới đây kiểm những thứ KHÔNG được xảy ra.
 *
 * Mọi ca đều chạy trên một danh mục dùng chung với các nhóm ca khác trong tệp
 * này, nên file nhập phải dựng TỪ ảnh chụp hiện tại — `fileDayDu()` lo việc đó.
 */
describe('CAT-15 · CAT-16 nhập danh mục từ Excel', () => {
  const COT = ['ma_vat_tu', 'ten_vat_tu', 'nhom_sp', 'gia_ban_cong_ty', 'dang_co_hieu_luc'];

  /*
   * Cho phép `undefined` vì các ca dưới đây dựng dòng bằng `d[4]` — TypeScript
   * không chứng minh được chỉ số 4 có mặt trên một mảng, và ExcelJS coi
   * `undefined` y như ô trống.
   */
  type Dong = (string | number | boolean | null | undefined)[];

  /*
   * TÊN cũng phải duy nhất, không riêng mã.
   *
   * File nhập chứa CẢ danh mục, và bước 4 chặn tên lặp lại trong file — nên một
   * ca kiểm đặt tên `'x'` sẽ đụng đúng cái tên mà một ca khác trong tệp này đã
   * tạo, rồi đỏ vì một lý do chẳng liên quan gì tới thứ nó định kiểm. Đã dính
   * một lượt trước khi có hàm này.
   */
  const ten = (goi: string) => `${goi} ${P}-${++n}`;

  const sheet = async (rows: Dong[], cot: (string | number)[] = COT): Promise<Buffer> => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('SP');
    ws.addRow(cot);
    for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  };

  const taiMau = async () =>
    (await http(app))
      .get('/catalog/products/import/mau')
      .set('Authorization', `Bearer ${adminT}`)
      .buffer(true)
      .parse((res, cb) => {
        const phan: Buffer[] = [];
        res.on('data', (c: Buffer) => phan.push(c));
        res.on('end', () => cb(null, Buffer.concat(phan)));
      });

  /** Mọi dòng của danh mục hiện tại, đọc ra từ chính file mẫu. */
  const dongHienCo = async (): Promise<Dong[]> => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await taiMau()).body as Buffer);
    const ra: Dong[] = [];
    wb.worksheets[0]!.eachRow((row, n) => {
      if (n === 1) return;
      ra.push([1, 2, 3, 4, 5].map((i) => (row.getCell(i).value ?? null) as string | number | null));
    });
    return ra;
  };

  /**
   * File ĐỦ: toàn bộ danh mục hiện tại, cộng những dòng truyền vào.
   *
   * Bắt buộc phải đi đường này. Từ `0121` một file thiếu bất kỳ mã nào đang có
   * đều bị chặn ở bước 5, nên một ca kiểm dựng file bằng tay sẽ đỏ vì lý do
   * chẳng liên quan gì tới thứ nó định kiểm.
   */
  const fileDayDu = async (them: Dong[] = [], sua?: (ds: Dong[]) => Dong[]) => {
    let ds = await dongHienCo();
    if (sua) ds = sua(ds);
    return sheet([...ds, ...them]);
  };

  const xemTruoc = async (buf: Buffer, token = adminT) =>
    (await http(app))
      .post('/catalog/products/import/xem-truoc')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, 'danh-muc.xlsx');

  const ghiDe = async (buf: Buffer, confirm = 'GHI DE') =>
    (await http(app))
      .post('/catalog/products/import')
      .set('Authorization', `Bearer ${adminT}`)
      .field('confirm', confirm)
      .attach('file', buf, 'danh-muc.xlsx');

  /** Một nhóm dùng riêng cho nhóm ca này. */
  let nhom = '';
  beforeAll(async () => {
    nhom = code('G');
    await post('/catalog/product-groups', { code: nhom, name: 'Nhom nhap excel' });
  });

  // --- Bước 1: đủ cột -------------------------------------------------------

  it('bước 1 — thiếu cột thì chặn, nêu đúng cột nào', async () => {
    const r = await xemTruoc(await sheet([], ['ma_vat_tu', 'ten_vat_tu', 'nhom_sp']));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BAD_HEADER');
    expect(r.body.message).toContain('gia_ban_cong_ty');
  });

  // --- Bước 2: sai kiểu -----------------------------------------------------

  it('bước 2 — ô lỗi công thức bị chặn, KHÔNG lọt thành tên sản phẩm', async () => {
    /*
     * Tới `0120` `String({ error: '#N/A' })` cho ra `"[object Object]"`, và
     * chuỗi ấy đi thẳng vào CSDL làm tên sản phẩm. Không ca kiểm nào bắt được
     * vì lượt nhập vẫn trả 200.
     */
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await fileDayDu([[code('I'), ten('O hong'), nhom, '50000', 'Đang bán']])) as unknown as Buffer);
    const ws = wb.worksheets[0]!;
    ws.getRow(ws.rowCount).getCell(2).value = { error: '#N/A' } as ExcelJS.CellErrorValue;

    const r = await xemTruoc(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('IMPORT_BAD_TYPE');
    expect(r.body.o[0].cot).toBe('ten_vat_tu');
  });

  it('bước 2 — giá không phải số thì chặn; nhưng chấp nhận cách gõ THẬT', async () => {
    const xau = await xemTruoc(await fileDayDu([[code('I'), ten('Gia hong'), nhom, 'mười nghìn', 'Đang bán']]));
    expect(xau.status).toBe(400);
    expect(xau.body.code).toBe('IMPORT_BAD_TYPE');
    expect(xau.body.o[0].lyDo).toBe('KHONG_PHAI_SO');

    // Dấu chấm và dấu phẩy là dấu NGHÌN — danh mục không có giá lẻ dưới đồng.
    for (const gia of ['12.500', '12,500', '12 500', 12500, '12500,00']) {
      const r = await xemTruoc(await fileDayDu([[code('I'), ten(`Gia ${gia}`), nhom, gia, 'Đang bán']]));
      expect(r.status, `gõ "${gia}" phải đọc được`).toBe(200);
      expect(r.body.themMoi[0].price).toBe('12500');
    }
  });

  it('bước 2 — MÃ VẬT TƯ TOÀN SỐ là file hợp lệ, không phải "sai kiểu"', async () => {
    // Excel đọc ô `12345` ra kiểu number. Chặn "cột chữ mà điền số" là chặn
    // nhầm một danh mục hoàn toàn bình thường.
    const ma = Number(`9${Date.now()}`.slice(0, 9));
    const r = await xemTruoc(await fileDayDu([[ma, ten('Ma toan so'), nhom, '50000', 'Đang bán']]));
    expect(r.status).toBe(200);
    expect(r.body.themMoi[0].code).toBe(String(ma));
  });

  // --- Bước 3: nhóm chưa có -------------------------------------------------

  it('bước 3 — gom HẾT mã nhóm thiếu vào một lần trả lời', async () => {
    /*
     * Dừng ở dòng hỏng đầu tiên nghĩa là một file có ba nhóm chưa tạo phải tải
     * lên bốn lần để biết đủ.
     */
    const r = await xemTruoc(
      await fileDayDu([
        [code('I'), ten('a'), 'NHOM-KHONG-CO-1', '50000', 'Đang bán'],
        [code('I'), ten('b'), 'NHOM-KHONG-CO-2', '50000', 'Đang bán'],
        [code('I'), ten('c'), 'NHOM-KHONG-CO-1', '50000', 'Đang bán'],
      ]),
    );
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('IMPORT_GROUP_MISSING');
    expect(r.body.nhom.map((n: { ma: string }) => n.ma).sort()).toEqual([
      'NHOM-KHONG-CO-1',
      'NHOM-KHONG-CO-2',
    ]);
    // Nêu cả số dòng — người dùng mở file ra sửa, không đi dò từng dòng.
    expect(r.body.nhom.find((n: { ma: string }) => n.ma === 'NHOM-KHONG-CO-1').dong).toHaveLength(2);
  });

  // --- Bước 4: trùng trong file ---------------------------------------------

  it('bước 4 — trùng mã hoặc trùng tên TRONG FILE thì chặn, nêu các cặp dòng', async () => {
    const maTrung = code('I');
    const r = await xemTruoc(
      await fileDayDu([
        [maTrung, ten('Ten mot'), nhom, '50000', 'Đang bán'],
        [maTrung, ten('Ten hai'), nhom, '50000', 'Đang bán'],
        [code('I'), 'Ten lap lai', nhom, '50000', 'Đang bán'],
        [code('I'), 'ten LAP  lai', nhom, '50000', 'Đang bán'],
      ]),
    );
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('IMPORT_DUPLICATE_IN_FILE');
    expect(r.body.trungMa).toHaveLength(1);
    expect(r.body.trungMa[0].dong).toHaveLength(2);
    // Tên so sau khi gom khoảng trắng và bỏ hoa thường — nhưng KHÔNG bỏ dấu.
    expect(r.body.trungTen).toHaveLength(1);
    expect(r.body.trungTen[0].dong).toHaveLength(2);
  });

  // --- Bước 5: thiếu sản phẩm đang có ---------------------------------------

  it('`0122` thiếu một mã đang có = NGỪNG BÁN sản phẩm ấy, tách riêng lý do', async () => {
    /*
     * ĐẢO quyết định của `0121`, vốn chặn hẳn lượt nhập. Khách hàng chốt cho
     * phép, nên rủi ro chuyển hết sang bảng xem trước: một dòng biến mất vì lọc
     * rồi chép phần đang hiện trông y hệt một quyết định ngừng bán, và thứ duy
     * nhất đứng giữa là khối `VANG_MAT` liệt kê đủ.
     */
    const ma = code('I');
    const sp = await post('/catalog/products', {
      code: ma,
      name: ten('Vang mat trong file'),
      groupCode: nhom, price: '100000' });

    const thieu = () => fileDayDu([], (ds) => ds.filter((d) => d[0] !== ma));

    const r = await xemTruoc(await thieu());
    expect(r.status).toBe(200);
    const d = r.body.ngungBan.find((x: { code: string }) => x.code === ma);
    expect(d.lyDo).toBe('VANG_MAT');

    // Xem trước KHÔNG ghi gì.
    expect((await get(`/catalog/products/${sp.body.id}`)).body.status).toBe('DANG_AP_DUNG');

    const g = await ghiDe(await thieu());
    expect(g.status).toBe(200);
    expect((await get(`/catalog/products/${sp.body.id}`)).body.status).toBe('DA_VO_HIEU_HOA');
  });

  it('`0122` vắng mặt mà VỐN ĐÃ ngừng bán thì không có gì để làm', async () => {
    const ma = code('I');
    const sp = await post('/catalog/products', { code: ma, name: ten('Da ngung tu truoc'), groupCode: nhom, price: '100000' });
    await patch(`/catalog/products/${sp.body.id}`, { status: 'DA_VO_HIEU_HOA', confirm: ma });

    const r = await xemTruoc(await fileDayDu([], (ds) => ds.filter((d) => d[0] !== ma)));
    expect(r.status).toBe(200);
    expect(r.body.ngungBan.map((x: { code: string }) => x.code)).not.toContain(ma);
  });

  it('`0122` ô hiệu lực ghi *Ngừng bán* thì ngừng bán, lý do là Ô CHỌN', async () => {
    const ma = code('I');
    const sp = await post('/catalog/products', { code: ma, name: ten('Ngung bang o chon'), groupCode: nhom, price: '100000' });

    const buf = await fileDayDu([], (ds) =>
      ds.map((d) => (d[0] === ma ? [d[0], d[1], d[2], d[3], 'Ngừng bán'] : d)),
    );
    const r = await xemTruoc(buf);
    expect(r.body.ngungBan.find((x: { code: string }) => x.code === ma).lyDo).toBe('O_CHON');

    expect((await ghiDe(buf)).status).toBe(200);
    expect((await get(`/catalog/products/${sp.body.id}`)).body.status).toBe('DA_VO_HIEU_HOA');
  });

  it('`0122` đổi ô về *Đang bán* thì BÁN LẠI', async () => {
    const ma = code('I');
    const sp = await post('/catalog/products', { code: ma, name: ten('Ban lai'), groupCode: nhom, price: '100000' });
    await patch(`/catalog/products/${sp.body.id}`, { status: 'DA_VO_HIEU_HOA', confirm: ma });

    const buf = await fileDayDu([], (ds) =>
      ds.map((d) => (d[0] === ma ? [d[0], d[1], d[2], d[3], 'Đang bán'] : d)),
    );
    const r = await xemTruoc(buf);
    expect(r.body.banLai.map((x: { code: string }) => x.code)).toContain(ma);

    expect((await ghiDe(buf)).status).toBe(200);
    expect((await get(`/catalog/products/${sp.body.id}`)).body.status).toBe('DANG_AP_DUNG');
  });

  it('`0122` ô hiệu lực để TRỐNG là lỗi, không phải ngừng bán', async () => {
    /*
     * Chỗ dễ làm sai nhất của `0122`: dòng sản phẩm MỚI người dùng gõ thêm vào
     * cuối file luôn có ô này trống. Hiểu ô trống là ngừng bán nghĩa là mọi sản
     * phẩm vừa thêm đều chết ngay lúc sinh ra.
     */
    const r = await xemTruoc(await fileDayDu([[code('I'), ten('Thieu o hieu luc'), nhom, '50000', null]]));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('IMPORT_MISSING_FIELD');
    expect(r.body.o.some((x: { cot: string }) => x.cot === 'dang_co_hieu_luc')).toBe(true);
  });

  it('`0122` giá trị lạ ở ô hiệu lực là lỗi KIỂU, nêu đúng dòng', async () => {
    const r = await xemTruoc(await fileDayDu([[code('I'), ten('Hieu luc la'), nhom, '50000', 'có']]));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('IMPORT_BAD_TYPE');
    expect(r.body.o[0].cot).toBe('dang_co_hieu_luc');
    expect(r.body.o[0].lyDo).toBe('KHONG_PHAI_HIEU_LUC');
  });

  it('`0122` nhận cả TRUE/FALSE — checkbox của Excel 365 ghi ra boolean', async () => {
    const maBan = code('I');
    const maNgung = code('I');
    const r = await xemTruoc(
      await fileDayDu([
        [maBan, ten('Boolean that'), nhom, '50000', true],
        [maNgung, ten('Boolean gia'), nhom, '50000', false],
      ]),
    );
    expect(r.status).toBe(200);
    const them = r.body.themMoi as { code: string; conBan: boolean }[];
    expect(them.find((x) => x.code === maBan)!.conBan).toBe(true);
    expect(them.find((x) => x.code === maNgung)!.conBan).toBe(false);
  });

  it('`0122` dòng MỚI ghi *Ngừng bán* thì sinh ra đã ở trạng thái ngừng bán', async () => {
    const ma = code('I');
    const r = await ghiDe(await fileDayDu([[ma, ten('Sinh ra da ngung'), nhom, '50000', 'Ngừng bán']]));
    expect(r.status).toBe(200);
    const sp = await withAdminDb(async (c) =>
      c.query<{ status: string }>(`SELECT status::text FROM cat.product WHERE code = $1`, [ma]),
    );
    expect(sp.rows[0]!.status).toBe('DA_VO_HIEU_HOA');
  });

  // --- Kế hoạch -------------------------------------------------------------

  it('xem trước KHÔNG ghi gì, và tách đúng ba khối', async () => {
    const ma = code('I');
    // Giá đặt NGAY lúc tạo (`0123`) — dòng giá của hôm nay thắng mọi mốc quá
    // khứ, nên một lượt `POST /prices` với ngày 2020 ở đây không đổi được gì.
    const sp = await post('/catalog/products', {
      code: ma,
      name: ten('Ten cu'),
      groupCode: nhom,
      price: '10000',
    });

    const tenMoi = ten('Ten moi');
    const truoc = (await get('/catalog/products?limit=1')).body.total as number;
    const r = await xemTruoc(
      await fileDayDu(
        [[code('I'), ten('Hoan toan moi'), nhom, '5000', 'Đang bán']],
        (ds) => ds.map((d) => (d[0] === ma ? [d[0], tenMoi, d[2], 20000, d[4]] : d)),
      ),
    );

    expect(r.status).toBe(200);
    expect((await get('/catalog/products?limit=1')).body.total).toBe(truoc);

    expect(r.body.themMoi).toHaveLength(1);
    const sua = r.body.sua.find((d: { code: string }) => d.code === ma);
    expect(sua.ten.sau).toBe(tenMoi);
    expect(sua.gia).toEqual({ truoc: '10000', sau: '20000' });
    // Nhóm không đổi thì KHÔNG có mặt — bảng xem trước chỉ vẽ thứ sắp thay đổi.
    expect(sua.nhom).toBeUndefined();
    // Giá gấp đôi → vượt ngưỡng 50%.
    expect(sua.canhBaoGia).toBeGreaterThan(0.5);
    expect(r.body.khongDoi).toBeGreaterThan(0);
  });

  it('`0123` ô giá để TRỐNG là lỗi — sản phẩm phải có giá', async () => {
    /*
     * ĐẢO quyết định của `0121`, vốn hiểu ô trống là "giữ nguyên giá cũ". Từ
     * `0123` sản phẩm không tồn tại được mà không có giá, nên một ô trống ở đây
     * là dấu hiệu file soạn dở chứ không phải một ý định.
     *
     * Hệ quả phải nhớ, và tài liệu người dùng nói: sản phẩm CŨ chưa từng đặt giá
     * xuất ra file mẫu với ô trống, nên lượt nhập đầu tiên sau `0123` là một đợt
     * dọn dữ liệu.
     */
    const ma = code('I');
    await post('/catalog/products', {
      code: ma,
      name: ten('Gia trong'),
      groupCode: nhom,
      price: '33000',
    });

    const r = await xemTruoc(
      await fileDayDu([], (ds) => ds.map((d) => (d[0] === ma ? [d[0], d[1], d[2], null, d[4]] : d))),
    );
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('IMPORT_MISSING_FIELD');
    expect(
      r.body.o.some(
        (x: { cot: string; rowNumber: number }) => x.cot === 'gia_ban_cong_ty',
      ),
    ).toBe(true);
  });

  // --- Bước 6: xác nhận rồi ghi ---------------------------------------------

  it('bước 6 — KHÔNG gõ đúng chuỗi xác nhận thì không ghi gì', async () => {
    const ma = code('I');
    const buf = await fileDayDu([[ma, ten('Khong duoc tao'), nhom, '50000', 'Đang bán']]);

    for (const sai of ['', 'ghi', 'XOA']) {
      const r = await ghiDe(buf, sai);
      expect(r.status, `"${sai}" đáng lẽ bị chặn`).toBe(400);
      expect(r.body.code).toBe('CONFIRM_MISMATCH');
    }
    const co = await withAdminDb(async (c) =>
      c.query(`SELECT 1 FROM cat.product WHERE code = $1`, [ma]),
    );
    expect(co.rowCount).toBe(0);
  });

  it('ghi đè thật: thêm mới, đổi tên, đổi nhóm và đổi giá trong MỘT lượt', async () => {
    const ma = code('I');
    const sp = await post('/catalog/products', { code: ma, name: ten('Truoc khi ghi de'), groupCode: nhom, price: '100000' });
    const nhomKhac = code('G');
    await post('/catalog/product-groups', { code: nhomKhac, name: 'Nhom dich' });
    const maMoi = code('I');
    const tenSau = ten('Sau khi ghi de');

    const r = await ghiDe(
      await fileDayDu(
        [[maMoi, ten('San pham moi tinh'), nhom, '7000', 'Đang bán']],
        (ds) => ds.map((d) => (d[0] === ma ? [d[0], tenSau, nhomKhac, 90000, d[4]] : d)),
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.themMoi).toBe(1);

    const sau = await get(`/catalog/products/${sp.body.id}`);
    expect(sau.body.name).toBe(tenSau);
    expect(sau.body.groupCode).toBe(nhomKhac);
    const gia = await get(`/catalog/products/${sp.body.id}/current-price?priceType=GIA_BAN_CONG_TY`);
    expect(gia.body.amount).toBe('90000');
  });

  it('`0122` giữ nguyên ô hiệu lực thì trạng thái KHÔNG đổi', async () => {
    /*
     * Chiều ngược của bốn ca đổi trạng thái ở trên. Không có nó thì một lượt sửa
     * biến cột 5 thành "luôn ghi đè" vẫn xanh — mọi ca kia chỉ kiểm chiều ĐỔI.
     */
    const ma = code('I');
    const sp = await post('/catalog/products', { code: ma, name: ten('Van ngung ban'), groupCode: nhom, price: '100000' });
    await patch(`/catalog/products/${sp.body.id}`, { status: 'DA_VO_HIEU_HOA', confirm: ma });

    const r = await ghiDe(await fileDayDu());
    expect(r.status).toBe(200);
    expect((await get(`/catalog/products/${sp.body.id}`)).body.status).toBe('DA_VO_HIEU_HOA');
  });

  it('CHỈ phát sự kiện cho dòng THẬT SỰ đổi', async () => {
    /*
     * Mỗi `catalog.changed` và `catalog.price_changed` kéo theo một lượt rà mọi
     * hồ sơ đã đóng băng × mọi dòng ở `policy` (nợ N-09). Phát cho cả những dòng
     * khớp y nguyên là biến một lượt nhập 500 dòng thành 500 lượt rà vô ích, và
     * làm box *Yêu cầu cập nhật* của mọi TDV đầy hồ sơ chẳng lệch gì.
     */
    const ma = code('I');
    await post('/catalog/products', { code: ma, name: ten('Chi doi mot dong'), groupCode: nhom, price: '100000' });

    const dem = async () =>
      Number(
        (
          await withAdminDb(async (c) =>
            c.query<{ n: string }>(`SELECT count(*)::text AS n FROM cat.outbox`),
          )
        ).rows[0]!.n,
      );

    const truoc = await dem();
    const r = await ghiDe(
      await fileDayDu([], (ds) => ds.map((d) => (d[0] === ma ? [d[0], 'Ten khac han', d[2], d[3], d[4]] : d))),
    );
    expect(r.status).toBe(200);
    expect(r.body.sua).toBe(1);
    expect(r.body.khongDoi).toBeGreaterThan(0);
    // Đúng MỘT sự kiện, cho đúng một dòng đã đổi.
    expect((await dem()) - truoc).toBe(1);
  });

  it('nhập LẦN HAI trong cùng ngày thì đè giá, không báo trùng ngày', async () => {
    /*
     * `UNIQUE (product_id, price_type, effective_from)` giữ nguyên; lượt ghi đi
     * qua `ON CONFLICT DO UPDATE` (`0121`). Bỏ ràng buộc thì hai dòng cùng ngày
     * cùng tồn tại, mà `currentPrice` chọn dòng bằng `ORDER BY effective_from
     * DESC LIMIT 1` — không có gì phân xử.
     */
    const ma = code('I');
    const sp = await post('/catalog/products', { code: ma, name: ten('Doi gia hai lan'), groupCode: nhom, price: '100000' });

    for (const gia of [11000, 22000]) {
      const r = await ghiDe(
        await fileDayDu([], (ds) => ds.map((d) => (d[0] === ma ? [d[0], d[1], d[2], gia, d[4]] : d))),
      );
      expect(r.status, `lượt giá ${gia}`).toBe(200);
    }

    const gia = await get(`/catalog/products/${sp.body.id}/current-price?priceType=GIA_BAN_CONG_TY`);
    expect(gia.body.amount).toBe('22000');

    // Đúng MỘT dòng giá cho hôm nay, không phải hai.
    const dong = await withAdminDb(async (c) =>
      c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cat.product_price
          WHERE product_id = $1 AND effective_from = current_date`,
        [sp.body.id],
      ),
    );
    expect(dong.rows[0]!.n).toBe('1');
  });

  it('chỉ Quản trị hệ thống xem trước được', async () => {
    const r = await xemTruoc(await sheet([]), tdvT);
    expect(r.status).toBe(403);
  });
});

/**
 * `0119` · `0120` · `0121` — file Excel mẫu tải về.
 *
 * Ca đáng giá nhất là ca VÒNG TRÒN: tải file mẫu về, sửa một ô, nhập lại và phải
 * thành công. Nó là thứ duy nhất chứng minh được điều mà file mẫu tồn tại để bảo
 * đảm — người dùng không phải sửa gì ở phần tiêu đề. Kiểm riêng "có đủ năm cột
 * đúng tên" thì hai bên vẫn trôi khỏi nhau được ở mọi chỗ khác: thứ tự cột, hoa
 * thường, trang nào là trang đầu.
 */
describe('`0119` file Excel mẫu', () => {
  const taiMau = async () =>
    (await http(app))
      .get('/catalog/products/import/mau')
      .set('Authorization', `Bearer ${adminT}`)
      .buffer(true)
      .parse((res, cb) => {
        const phan: Buffer[] = [];
        res.on('data', (c: Buffer) => phan.push(c));
        res.on('end', () => cb(null, Buffer.concat(phan)));
      });

  const mo = async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await taiMau()).body as Buffer);
    return wb;
  };

  it('tải về được, đúng kiểu nội dung và có tên tệp', async () => {
    const r = await taiMau();
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['content-disposition']).toContain('mau-danh-muc-san-pham.xlsx');
  });

  it('`0121` đủ NĂM cột, đúng tên và đúng thứ tự', async () => {
    const ws = (await mo()).worksheets[0]!;
    const tieuDe = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(tieuDe).toEqual([
      'ma_vat_tu',
      'ten_vat_tu',
      'nhom_sp',
      'gia_ban_cong_ty',
      'dang_co_hieu_luc',
    ]);
  });

  it('`0120` chứa TOÀN BỘ sản phẩm hiện có, đúng ô, kèm giá và trạng thái', async () => {
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom co san pham' });
    const maSp = code('I');
    const tenMau = `San pham phai co trong file ${P}-${++n}`;
    const sp = await post('/catalog/products', {
      code: maSp,
      name: tenMau,
      groupCode,
      price: '45000',
    });
    expect(sp.status).toBe(201);

    const ws = (await mo()).worksheets[0]!;
    let thay: unknown[] | null = null;
    ws.eachRow((row, n) => {
      if (n > 1 && String(row.getCell(1).value) === maSp) {
        thay = [2, 3, 4, 5].map((i) => row.getCell(i).value);
      }
    });
    // Đúng ô, không chỉ "có mặt đâu đó": lệch cột thì file vẫn nhập được và nạp
    // tên sản phẩm vào ô mã nhóm.
    expect(thay).toEqual([tenMau, groupCode, 45000, 'Đang bán']);
  });

  it('`0120` lấy CẢ sản phẩm đã vô hiệu hoá — file là ảnh chụp danh mục', async () => {
    /*
     * Lọc chúng đi thì người dùng thấy một khoảng trống, điền lại chính mã ấy,
     * rồi nhận lỗi trùng mã ở một dòng họ vừa tự tay gõ. Từ `0121` còn nặng hơn:
     * file thiếu một mã đang có là bị chặn hẳn.
     */
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom co hang ngung ban' });
    const maSp = code('I');
    const sp = await post('/catalog/products', { code: maSp, name: `Hang ngung ban ${P}-${++n}`, groupCode, price: '100000' });
    await patch(`/catalog/products/${sp.body.id}`, { status: 'DA_VO_HIEU_HOA', confirm: maSp });

    const ws = (await mo()).worksheets[0]!;
    const dong = new Map<string, unknown>();
    ws.eachRow((row, n) => {
      if (n > 1) dong.set(String(row.getCell(1).value), row.getCell(5).value);
    });
    expect(dong.has(maSp)).toBe(true);
    expect(dong.get(maSp)).toBe('Ngừng bán');
  });

  it('VÒNG TRÒN: sửa một ô trên chính file mẫu rồi nhập lại thì xong', async () => {
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom vong tron' });
    const maSp = code('I');
    const sp = await post('/catalog/products', { code: maSp, name: `Ten ban dau ${P}-${++n}`, groupCode, price: '100000' });

    const tenDaSua = `Ten da sua ${P}-${++n}`;
    const wb = await mo();
    const ws = wb.worksheets[0]!;
    ws.eachRow((row, d) => {
      if (d > 1 && String(row.getCell(1).value) === maSp) row.getCell(2).value = tenDaSua;
    });

    const r = await (await http(app))
      .post('/catalog/products/import')
      .set('Authorization', `Bearer ${adminT}`)
      .field('confirm', 'GHI DE')
      .attach('file', Buffer.from(await wb.xlsx.writeBuffer()), 'danh-muc.xlsx');

    expect(r.status).toBe(200);
    expect(r.body.sua).toBe(1);
    expect((await get(`/catalog/products/${sp.body.id}`)).body.name).toBe(tenDaSua);
  });

  it('`0121` tải về rồi nhập lại NGUYÊN TRẠNG là hợp lệ và không đổi gì', async () => {
    /*
     * Từ `0121` đây mới là cách dùng bình thường: file là ảnh chụp đầy đủ, nên
     * nhập lại nguyên trạng phải qua sạch và không sinh thay đổi nào. Tới `0120`
     * chính lượt này báo trùng mã.
     */
    const r = await (await http(app))
      .post('/catalog/products/import/xem-truoc')
      .set('Authorization', `Bearer ${adminT}`)
      .attach('file', (await taiMau()).body as Buffer, 'danh-muc.xlsx');

    expect(r.status).toBe(200);
    expect(r.body.themMoi).toHaveLength(0);
    expect(r.body.sua).toHaveLength(0);
    expect(r.body.khongDoi).toBeGreaterThan(0);
  });

  it('trang thứ hai liệt kê mã nhóm đang có, và bộ đọc KHÔNG chạm tới nó', async () => {
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom hien o trang hai' });

    const wb = await mo();
    const wsN = wb.worksheets[1];
    expect(wsN, 'file mẫu phải có trang thứ hai').toBeDefined();
    const maNhom: string[] = [];
    wsN!.eachRow((row) => maNhom.push(String(row.getCell(1).value ?? '')));
    expect(maNhom).toContain(groupCode);
    // Có TÊN nhóm chứ không chỉ mã — một trang tra cứu chỉ có mã thì tra được gì.
    expect(wsN!.getRow(2).getCell(2).value).toBeTruthy();

    /*
     * `parseProductSheet` chỉ đọc `worksheets[0]`. Không có phép khẳng định này
     * thì một lượt sửa đổi bộ đọc sang "duyệt mọi trang" sẽ nạp cả danh sách
     * nhóm vào bảng sản phẩm, và ca vòng tròn ở trên vẫn xanh.
     */
    const r = await (await http(app))
      .post('/catalog/products/import/xem-truoc')
      .set('Authorization', `Bearer ${adminT}`)
      .attach('file', Buffer.from(await wb.xlsx.writeBuffer()), 'danh-muc.xlsx');
    expect(r.status).toBe(200);
    expect(r.body.themMoi).toHaveLength(0);
  });

  it('`0122` cột hiệu lực là Ô CHỌN hai giá trị, không cho để trống', async () => {
    /*
     * Excel không có checkbox nằm TRONG một ô — ô chọn xổ xuống là dạng duy nhất
     * dựng được và đọc lại được. `allowBlank: false` là lớp chặn duy nhất đứng
     * TRƯỚC lúc tải lên; mọi lớp còn lại chỉ nói được sau khi người dùng đã soạn
     * xong cả file.
     *
     * Ca này kiểm ràng buộc sống qua vòng ghi/đọc — nếu ExcelJS đánh rơi nó thì
     * file vẫn "đúng" với bộ đọc của ta, và không gì khác bắt được.
     */
    const groupCode = code('G');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom o chon' });
    await post('/catalog/products', {
      code: code('I'),
      name: `Co o chon ${P}-${++n}`,
      groupCode, price: '100000' });

    const ws = (await mo()).worksheets[0]!;
    const rb = ws.getRow(2).getCell(5).dataValidation;
    expect(rb?.type).toBe('list');
    expect(rb?.formulae?.[0]).toContain('Ngừng bán');
    expect(rb?.formulae?.[0]).toContain('Đang bán');
    // Excel phải CHẶN giá trị lạ, không chỉ cảnh báo rồi vẫn nhận.
    expect(rb?.showErrorMessage).toBe(true);
    expect(rb?.errorStyle).toBe('stop');
    /*
     * `allowBlank` đọc lại ra `undefined`, không phải `false` — và đó là ĐÚNG:
     * `allowBlank="0"` là mặc định của OOXML nên ExcelJS không ghi thuộc tính ấy
     * ra file. Khẳng định `toBe(false)` ở đây đỏ, và đỏ vì một lý do sai.
     */
    expect(rb?.allowBlank ?? false).toBe(false);
  });

  it('chỉ Quản trị hệ thống tải được', async () => {
    const r = await (await http(app))
      .get('/catalog/products/import/mau')
      .set('Authorization', `Bearer ${tdvT}`);
    expect(r.status).toBe(403);
  });
});

describe('0026 kênh bán không còn ảnh hưởng tới ngưỡng', () => {
  it('gửi kèm channelCode cũng ra đúng ngưỡng của nhóm × loại khách', async () => {
    const { id, groupCode } = await makeProduct();
    await post('/catalog/discount-rules', {
      code: code('CK'),
      productGroupCode: groupCode,
      customerType: 1,
      channelCode: 'KENH-CU',
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1700,
    });

    const r = await get(
      `/catalog/thresholds/resolve?productId=${id}&customerType=1&channelCode=KENH-KHAC`,
    );
    expect(r.status).toBe(200);
    expect(r.body.thresholdRate2).toBe(1700);
  });

  it('danh mục tra cứu không còn đường nào để gọi', async () => {
    expect((await get('/catalog/lookups/province')).status).toBe(404);
    expect((await post('/catalog/lookups/channel', { code: 'X', name: 'X' })).status).toBe(404);
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

  it('`0121` đặt lại giá CÙNG NGÀY thì ĐÈ, không báo lỗi trùng ngày', async () => {
    /*
     * Tới `0120` lượt thứ hai chết với `PRICE_ALREADY_SET_FOR_DATE` — đúng về
     * mặt dữ liệu và sai về mặt người dùng: gõ nhầm một số 0 lúc sáng thì cả
     * ngày hôm đó không sửa lại được, phải đợi sang hôm sau hoặc khai một ngày
     * hiệu lực giả.
     *
     * Ràng buộc `UNIQUE (product_id, price_type, effective_from)` GIỮ NGUYÊN;
     * lượt ghi đi qua `ON CONFLICT DO UPDATE`. Bỏ ràng buộc thì hai dòng cùng
     * ngày cùng tồn tại, mà `currentPrice` chọn dòng bằng `ORDER BY
     * effective_from DESC LIMIT 1` — không có gì phân xử, nên giá hiện hành đổi
     * theo tâm trạng của Postgres.
     */
    const { id } = await makeProduct();
    for (const amount of ['100000', '111000']) {
      const r = await post(`/catalog/products/${id}/prices`, {
        priceType: 'GIA_BAN_CONG_TY',
        amount,
        effectiveFrom: '2020-01-01',
      });
      expect(r.status, `đặt giá ${amount}`).toBe(201);
    }

    // ĐÚNG MỘT dòng cho ngày ấy, mang giá của lượt sau.
    const dong = await withAdminDb(async (c) =>
      c.query<{ n: string; amount: string }>(
        `SELECT count(*)::text AS n, max(amount)::text AS amount
           FROM cat.product_price
          WHERE product_id = $1 AND price_type = 'GIA_BAN_CONG_TY'
            AND effective_from = '2020-01-01'`,
        [id],
      ),
    );
    expect(dong.rows[0]!.n).toBe('1');
    expect(dong.rows[0]!.amount).toBe('111000');
  });

  it('mỗi lượt đặt giá phát ĐÚNG MỘT sự kiện, kể cả lượt ghi đè', async () => {
    // Sự kiện nằm trong cùng transaction với dòng giá, nên không có chuyện giá
    // đổi mà sự kiện mất, hay ngược lại (CAT-18).
    const { id } = await makeProduct();
    const before = await countEvents('catalog.price_changed');
    for (const amount of ['50000', '60000']) {
      await post(`/catalog/products/${id}/prices`, {
        priceType: 'GIA_BAN_CONG_TY',
        amount,
        effectiveFrom: '2021-01-01',
      });
    }
    expect(await countEvents('catalog.price_changed')).toBe(before + 2);
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
// Sửa và xoá quy định chiết khấu
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
      groupCode, price: '100000' });

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
      groupCode, price: '100000' });
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
    await del(`/catalog/discount-rules/${ma}`, { confirm: ma });
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

  /*
   * 0028 — sửa được NGÀY HIỆU LỰC.
   *
   * Nó không đổi phạm vi của dòng nào, chỉ đổi thứ tự giữa các dòng CÙNG phạm
   * vi — đúng cái cơ chế "khai ngày muộn hơn để đè lên" của 0020. Trước 0028,
   * gõ nhầm một ngày nghĩa là xoá dòng rồi khai lại, và giữa hai thao tác thì
   * mọi hồ sơ lập ra mất ngưỡng.
   */
  it('0028 đổi ngày hiệu lực, và ngày mới quyết định lúc nào quy định ăn', async () => {
    const { ma, groupCode } = await mkRule();
    const sp = await post('/catalog/products', { code: code('P'), name: 'SP', groupCode, price: '100000' });
    const tra = (on: string) =>
      get(`/catalog/thresholds/resolve?productId=${sp.body.id}&customerType=1&on=${on}`);

    // Dời sang tương lai: tra ở một ngày TRƯỚC mốc mới thì không quy định nào khớp.
    const sua = await patch(`/catalog/discount-rules/${ma}`, {
      thresholdRate2: 1500,
      effectiveFrom: '2027-06-01',
    });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);

    expect((await tra('2027-01-01')).body.source).toBe('KHONG_CO');
    expect((await tra('2027-06-01')).body.source).toBe('RULE');
  });

  it('0028 vắng `effectiveFrom` là GIỮ NGUYÊN, không phải xoá', async () => {
    // Cột `NOT NULL` nên không có trạng thái "không có giá trị" để một lần gửi
    // thiếu diễn đạt — ngược với `note` của dòng hồ sơ (0027).
    const { ma } = await mkRule({ effectiveFrom: '2021-03-04' });
    expect((await patch(`/catalog/discount-rules/${ma}`, { thresholdRate2: 1800 })).status)
      .toBe(200);

    const dong = ((await get('/catalog/discount-rules?limit=200')).body.items as {
      code: string;
      effectiveFrom: string;
    }[]).find((x) => x.code === ma)!;
    expect(String(dong.effectiveFrom).slice(0, 10)).toBe('2021-03-04');
  });

  it('0028 dời vào đúng ngày của một dòng CÙNG phạm vi thì 409', async () => {
    // Hai dòng trùng phạm vi và trùng ngày không phân xử được — `uq_rule_pham_vi`
    // chặn từ 0022, và đường sửa phải trả cùng một mã lỗi với đường tạo.
    const { groupCode } = await makeProduct();
    const chung = { productGroupCode: groupCode, customerType: 2, thresholdRate2: 1500 };
    expect(
      (await post('/catalog/discount-rules', {
        code: code('CK'), ...chung, effectiveFrom: '2024-01-01',
      })).status,
    ).toBe(201);
    const sau = await post('/catalog/discount-rules', {
      code: code('CK'), ...chung, effectiveFrom: '2025-01-01',
    });
    expect(sau.status).toBe(201);

    const dung = await patch(`/catalog/discount-rules/${sau.body.code}`, {
      thresholdRate2: 1500,
      effectiveFrom: '2024-01-01',
    });
    expect(dung.status).toBe(409);
    expect(dung.body.code).toBe('RULE_SCOPE_DUPLICATE');
  });

  it('xoá rồi thì không còn trong danh sách, xoá lần nữa là 404', async () => {
    const { ma } = await mkRule();
    expect((await del(`/catalog/discount-rules/${ma}`, { confirm: ma })).status).toBe(200);

    const ds = (await get('/catalog/discount-rules?limit=200')).body.items as { code: string }[];
    expect(ds.some((x) => x.code === ma)).toBe(false);

    expect((await del(`/catalog/discount-rules/${ma}`, { confirm: ma })).status).toBe(404);
  });

  it('sửa và xoá đều phát sự kiện nhật ký kèm giá trị TRƯỚC (CAT-13)', async () => {
    const { ma } = await mkRule();

    await patch(`/catalog/discount-rules/${ma}`, { thresholdRate2: 3000 });
    let ev = await lastEvent('catalog.changed');
    expect((ev!['before'] as Record<string, unknown>)['threshold_rate2']).toBe(1500);

    await del(`/catalog/discount-rules/${ma}`, { confirm: ma });
    ev = await lastEvent('catalog.changed');
    expect(ev!['after']).toBeNull();
    expect((ev!['before'] as Record<string, unknown>)['threshold_rate2']).toBe(3000);
  });

  it('vai trò khác Quản trị không sửa và không xoá được', async () => {
    const { ma } = await mkRule();
    expect((await patch(`/catalog/discount-rules/${ma}`, { thresholdRate2: 1 }, tdvT)).status).toBe(403);
    expect((await del(`/catalog/discount-rules/${ma}`, { confirm: ma }, tdvT)).status).toBe(403);
  });
});

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

    expect((await del(`/catalog/discount-rules/${ma}`, { confirm: ma })).status).toBe(200);
    expect((await del(`/catalog/discount-rules/${ma}`, { confirm: ma })).status).toBe(404);
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

  it('`0121` ba cột `ck_loai_*` của file mẫu CŨ giờ KHÔNG còn nhận nữa', async () => {
    /*
     * `0025` cố ý cho file cũ đi qua: ba cột thừa bị bỏ qua chứ không báo lỗi,
     * vì chặn chúng là bắt người dùng sửa lại một file họ đã có để đổi lấy đúng
     * con số không.
     *
     * `0121` đảo lại, và có lý do: cột thứ tư giờ là `gia_ban_cong_ty`, tức là
     * đúng vị trí mà file cũ để `ck_loai_1`. Im lặng bỏ qua nghĩa là đọc ngưỡng
     * chiết khấu cũ thành GIÁ BÁN — `12.35` thành mười hai đồng. Nên ở đây báo
     * lỗi là cách duy nhất đúng, và câu lỗi nêu thẳng tên cột phải có.
     */
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('sp');
    ws.addRow(['ma_vat_tu', 'ten_vat_tu', 'nhom_sp', 'ck_loai_1', 'ck_loai_2', 'ck_loai_3']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const r = await (await http(app))
      .post('/catalog/products/import/xem-truoc')
      .set('Authorization', `Bearer ${adminT}`)
      .attach('file', buf, 'sp.xlsx');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BAD_HEADER');
    expect(r.body.message).toContain('gia_ban_cong_ty');
  });
});

// =============================================================================
// `0036` — mọi thao tác PHÁ HUỶ đòi gõ lại mã
//
// Vì sao phép kiểm nằm ở MÁY CHỦ chứ không chỉ ở hộp thoại: hộp thoại chặn bấm
// nhầm, còn đây là hợp đồng. Một script dọn dữ liệu, một lần thử tay bằng
// `curl`, hay một màn hình viết sau này quên mất bước xác nhận — cả ba đều đi
// qua đường này, và cả ba đều phải nói ra đúng thứ mình định xoá.
// =============================================================================

describe('`0036` xác nhận bằng cách gõ lại mã', () => {
  describe('xoá nhóm sản phẩm', () => {
    const nhomRong = async () => {
      const ma = code('G');
      const g = await post('/catalog/product-groups', { code: ma, name: 'Nhom xac nhan' });
      return { id: g.body.id as string, ma };
    };

    it('thiếu `confirm` thì 400 và nhóm CÒN NGUYÊN', async () => {
      const { id, ma } = await nhomRong();
      const r = await del(`/catalog/product-groups/${id}`);
      expect(r.status, JSON.stringify(r.body)).toBe(400);
      expect(r.body.code).toBe('CONFIRM_MISMATCH');
      // Câu báo phải NÓI RA chuỗi đúng — giấu nó đi không thêm an toàn nào,
      // người gọi đang nhìn thẳng vào bản ghi đó, mà lại biến một chốt chặn
      // chống bấm nhầm thành một câu đố.
      expect(r.body.message).toContain(ma);
      expect((await get('/catalog/product-groups')).body.some((x: { id: string }) => x.id === id))
        .toBe(true);
    });

    it('gõ SAI mã thì 400', async () => {
      const { id } = await nhomRong();
      expect((await del(`/catalog/product-groups/${id}`, { confirm: 'MA-SAI' })).status).toBe(400);
    });

    it('gõ đúng nhưng khác hoa thường và thừa khoảng trắng thì VẪN nhận', async () => {
      // Người quản trị chép mã từ màn hình sang; một chữ hoa lệch không phải là
      // bấm nhầm dòng, và bắt gõ lại là làm phiền chứ không làm an toàn hơn.
      const { id, ma } = await nhomRong();
      const r = await del(`/catalog/product-groups/${id}`, { confirm: `  ${ma.toLowerCase()} ` });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    });
  });

  describe('xoá quy định chiết khấu', () => {
    const quyDinh = async () => {
      const ma = code('CK');
      const g = code('G');
      await post('/catalog/product-groups', { code: g, name: 'Nhom cho quy dinh' });
      const r = await post('/catalog/discount-rules', {
        code: ma,
        productGroupCode: g,
        effectiveFrom: '2020-01-01',
        thresholdRate2: 1500,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return ma;
    };

    it('thiếu `confirm` thì 400 và quy định CÒN NGUYÊN', async () => {
      const ma = await quyDinh();
      const r = await del(`/catalog/discount-rules/${ma}`);
      expect(r.status, JSON.stringify(r.body)).toBe(400);
      expect(r.body.code).toBe('CONFIRM_MISMATCH');
      // Phép kiểm chạy TRƯỚC câu `DELETE`, nên quy định phải còn đó thật.
      const con = await get(`/catalog/discount-rules?limit=200`);
      expect((con.body.items as { code: string }[]).some((x) => x.code === ma)).toBe(true);
    });

    it('gõ SAI mã thì 400', async () => {
      const ma = await quyDinh();
      expect((await del(`/catalog/discount-rules/${ma}`, { confirm: `${ma}X` })).status).toBe(400);
    });

    it('quy định KHÔNG TỒN TẠI thì 404, không phải 400', async () => {
      // Thứ tự phép kiểm quan trọng: "không có gì để xoá" là một câu trả lời
      // khác hẳn "gõ sai chuỗi xác nhận", và trả nhầm mã làm người gọi đi sửa
      // sai chỗ.
      const r = await del('/catalog/discount-rules/KHONG-CO-THAT', { confirm: 'KHONG-CO-THAT' });
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('RULE_NOT_FOUND');
    });
  });

  describe('sửa sản phẩm', () => {
    /*
     * `0123` SIẾT chốt của `0036`: gõ lại mã ở MỌI lượt sửa, không riêng lượt vô
     * hiệu hoá.
     *
     * Lập luận cũ — "bắt gõ cho một thao tác hằng ngày thì làm mòn chính chốt
     * chặn ấy" — đúng khi màn hình sửa chỉ đổi được TÊN. Từ `0123` nó đổi được
     * cả GIÁ, con số đóng băng vào mọi hồ sơ gửi duyệt kể từ lúc ấy. Không còn
     * thao tác nhẹ nào ở đây để mà làm mòn.
     */
    it('thiếu `confirm` thì 400, kể cả khi CHỈ đổi tên', async () => {
      const { id, res } = await makeProduct();
      const r = await patch(`/catalog/products/${id}`, { name: 'Ten moi' });
      expect(r.status, JSON.stringify(r.body)).toBe(400);
      expect(r.body.code).toBe('CONFIRM_MISMATCH');
      expect(r.body.message).toContain(res.body.code);
      expect((await get(`/catalog/products/${id}`)).body.name).toBe(res.body.name);
    });

    it('gõ SAI mã thì 400', async () => {
      const { id } = await makeProduct();
      const r = await patch(`/catalog/products/${id}`, {
        status: 'DA_VO_HIEU_HOA',
        confirm: 'SAI-MA',
      });
      expect(r.status).toBe(400);
    });

    it('BẬT LẠI cũng phải gõ — mọi lượt sửa đều gõ', async () => {
      const { id, res } = await makeProduct();
      await patch(`/catalog/products/${id}`, {
        status: 'DA_VO_HIEU_HOA',
        confirm: res.body.code,
      });
      expect((await patch(`/catalog/products/${id}`, { status: 'DANG_AP_DUNG' })).status).toBe(400);

      const r = await patch(`/catalog/products/${id}`, {
        status: 'DANG_AP_DUNG',
        confirm: res.body.code,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.status).toBe('DANG_AP_DUNG');
    });

    it('`0123` sửa được GIÁ ngay tại đây, áp dụng từ HÔM NAY', async () => {
      const { id, res } = await makeProduct();
      const r = await patch(`/catalog/products/${id}`, {
        price: '250000',
        confirm: res.body.code,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);

      const gia = await get(`/catalog/products/${id}/current-price?priceType=GIA_BAN_CONG_TY`);
      expect(gia.body.amount).toBe('250000');

      const dong = await withAdminDb(async (c) =>
        c.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM cat.product_price
            WHERE product_id = $1 AND effective_from = current_date`,
          [id],
        ),
      );
      expect(dong.rows[0]!.n).toBe('1');
    });

    it('`0123` gửi lại ĐÚNG giá đang có thì KHÔNG sinh sự kiện đổi giá', async () => {
      /*
       * Một sự kiện `catalog.price_changed` kéo theo một lượt rà mọi hồ sơ đã
       * đóng băng (nợ N-09). Phát nó ra cho một lượt lưu không đổi giá là trả
       * cái giá ấy để đổi lấy đúng con số không — và làm khối *Yêu cầu cập nhật*
       * của mọi TDV đầy những hồ sơ chẳng lệch gì.
       */
      const { id, res } = await makeProduct();
      const truoc = await countEvents('catalog.price_changed');
      await patch(`/catalog/products/${id}`, {
        name: 'Chi doi ten thoi',
        price: res.body.price ?? '100000',
        confirm: res.body.code,
      });
      expect(await countEvents('catalog.price_changed')).toBe(truoc);
    });
  });
});

// =============================================================================
// `0049` — tìm và lọc PHÍA MÁY CHỦ (N-05, muc 11.3)
// =============================================================================

describe('`0049` tìm sản phẩm theo TÊN, lọc theo nhóm', () => {
  /** Một nhóm riêng cộng ba sản phẩm có dấu, để không lẫn với dữ liệu ca khác. */
  const dungBoBa = async () => {
    const groupCode = code('GT');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom tim kiem' });
    const ten = ['Sữa Nutricare Gold', 'Bột dinh dưỡng Metacare', 'Ngũ cốc Đường ăn kiêng'];
    for (const t of ten) {
      await post('/catalog/products', { code: code('PT'), name: t, groupCode, price: '100000' });
    }
    return { groupCode, ten };
  };

  const tenCua = (r: { body: { items: { name: string }[] } }) => r.body.items.map((x) => x.name);

  it('gõ KHÔNG DẤU vẫn ra chuỗi có dấu', async () => {
    const { groupCode } = await dungBoBa();
    const r = await get(`/catalog/products?groupCode=${groupCode}&q=sua`);
    expect(r.status).toBe(200);
    expect(tenCua(r)).toEqual(['Sữa Nutricare Gold']);
  });

  it('chữ đ tìm được bằng d — chỗ extension unaccent làm sai', async () => {
    const { groupCode } = await dungBoBa();
    // "Đường" → "duong". Đây là ca duy nhất chứng minh vì sao phép chuẩn hoá
    // phải tự viết thay vì gọi `unaccent`: extension ấy để nguyên chữ đ.
    //
    // Gõ ĐỦ CỤM chứ không mỗi "duong": "dinh dưỡng" cũng chuẩn hoá thành
    // "dinh duong", nên một từ khoá "duong" khớp hai sản phẩm — đúng, nhưng
    // không phân biệt được nhánh đ→d với nhánh bỏ dấu thường.
    const r = await get(`/catalog/products?groupCode=${groupCode}&q=duong%20an%20kieng`);
    expect(tenCua(r)).toEqual(['Ngũ cốc Đường ăn kiêng']);
  });

  it('khớp CHUỖI CON, không phải chỉ đầu chuỗi', async () => {
    const { groupCode } = await dungBoBa();
    const r = await get(`/catalog/products?groupCode=${groupCode}&q=care`);
    expect(tenCua(r).sort()).toEqual(['Bột dinh dưỡng Metacare', 'Sữa Nutricare Gold']);
  });

  it('KHÔNG khớp mã vật tư — khách hàng chốt ô tìm chỉ ăn tên', async () => {
    const { groupCode } = await dungBoBa();
    const ds = await get(`/catalog/products?groupCode=${groupCode}`);
    const ma = ds.body.items[0].code as string;
    const r = await get(`/catalog/products?groupCode=${groupCode}&q=${encodeURIComponent(ma)}`);
    expect(r.body.items).toHaveLength(0);
  });

  it('lọc theo nhóm KHÔNG kèm từ khoá', async () => {
    const { groupCode } = await dungBoBa();
    const r = await get(`/catalog/products?groupCode=${groupCode}`);
    expect(r.body.items).toHaveLength(3);
    expect(r.body.total).toBe(3);
  });

  it('nhóm không tồn tại thì rỗng, không phải lỗi', async () => {
    const r = await get('/catalog/products?groupCode=KHONG-CO-NHOM-NAY');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(0);
  });

  it('`q` rỗng KHÔNG phải điều kiện lọc — màn hình gửi nó khi vừa xoá ô tìm', async () => {
    const { groupCode } = await dungBoBa();
    for (const rong of ['', '%20%20']) {
      const r = await get(`/catalog/products?groupCode=${groupCode}&q=${rong}`);
      expect(r.body.items, `q=${JSON.stringify(rong)} phải trả về cả ba`).toHaveLength(3);
    }
  });

  it('ký tự % của người dùng bị thoát, không khớp cả bảng', async () => {
    const { groupCode } = await dungBoBa();
    const r = await get(`/catalog/products?groupCode=${groupCode}&q=%25`);
    expect(r.body.items).toHaveLength(0);
  });

  it('`total` là tổng SAU KHI LỌC, không phải tổng cả bảng', async () => {
    const { groupCode } = await dungBoBa();
    const r = await get(`/catalog/products?groupCode=${groupCode}&q=sua&limit=20`);
    expect(r.body.total).toBe(1);
  });
});

describe('`0049` lọc quy định chiết khấu bằng hai ô chọn', () => {
  /*
   * Một nhóm riêng, hai quy định trong nhóm ấy: một dòng riêng cho khách loại 2,
   * một dòng cho MỌI LOẠI khách.
   *
   * KHÔNG dựng quy định "mọi nhóm · mọi loại" ở đây, vì hai lý do đều đắt:
   *
   *   1. `uq_rule_pham_vi` là UNIQUE với `NULLS NOT DISTINCT` — cả tệp chỉ tồn
   *      tại được ĐÚNG MỘT dòng như vậy cho mỗi ngày hiệu lực, nên lần dựng thứ
   *      hai nhận 409.
   *   2. Nguy hơn: một dòng như thế khớp MỌI sản phẩm, nên nó đổi kết quả của
   *      các ca tra ngưỡng ở phía trên tệp — và vì dữ liệu test không bị dọn
   *      giữa các lượt chạy, nó còn đổi kết quả của LƯỢT CHẠY SAU.
   *
   * Nhánh `product_group_id IS NULL` có ca riêng bên dưới, tự dọn bằng `finally`.
   */
  const dungQuyDinh = async () => {
    const groupCode = code('GQ');
    await post('/catalog/product-groups', { code: groupCode, name: 'Nhom quy dinh' });
    const rieng = code('CKR');
    const moiLoai = code('CKL');
    await post('/catalog/discount-rules', {
      code: rieng,
      productGroupCode: groupCode,
      customerType: 2,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 2500,
    });
    await post('/catalog/discount-rules', {
      code: moiLoai,
      productGroupCode: groupCode,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1000,
    });
    return { groupCode, rieng, moiLoai };
  };

  const maCua = (r: { body: { items: { code: string }[] } }) => r.body.items.map((x) => x.code);

  it('lọc theo nhóm giữ cả dòng riêng lẫn dòng cho mọi loại khách', async () => {
    const { groupCode, rieng, moiLoai } = await dungQuyDinh();
    const ma = maCua(await get(`/catalog/discount-rules?groupCode=${groupCode}&limit=200`));
    expect(ma).toContain(rieng);
    expect(ma).toContain(moiLoai);
  });

  it('lọc theo nhóm LOẠI quy định của nhóm khác', async () => {
    const a = await dungQuyDinh();
    const b = await dungQuyDinh();
    const ma = maCua(await get(`/catalog/discount-rules?groupCode=${a.groupCode}&limit=200`));
    expect(ma).not.toContain(b.rieng);
  });

  it('lọc theo loại khách giữ dòng của loại đó và dòng cho mọi loại', async () => {
    const { rieng, moiLoai } = await dungQuyDinh();
    const loai2 = maCua(await get('/catalog/discount-rules?customerType=2&limit=200'));
    expect(loai2).toContain(rieng);
    expect(loai2).toContain(moiLoai);

    const loai1 = maCua(await get('/catalog/discount-rules?customerType=1&limit=200'));
    expect(loai1, 'dòng riêng của loại 2 không được lọt sang loại 1').not.toContain(rieng);
    expect(loai1, 'dòng cho mọi loại vẫn áp cho loại 1').toContain(moiLoai);
  });

  it('hai ô chọn kết hợp được', async () => {
    const { groupCode, rieng } = await dungQuyDinh();
    const ma = maCua(
      await get(`/catalog/discount-rules?groupCode=${groupCode}&customerType=2&limit=200`),
    );
    expect(ma).toContain(rieng);
  });

  it('loại khách ngoài 1·2·3 bị chặn ở đây, không để CSDL ném lỗi kiểu', async () => {
    const r = await get('/catalog/discount-rules?customerType=9');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
    expect(r.body.field).toBe('customerType');
  });

  it('không ô chọn nào thì trả về tất cả', async () => {
    const { rieng, moiLoai } = await dungQuyDinh();
    const ma = maCua(await get('/catalog/discount-rules?limit=200'));
    expect(ma).toContain(rieng);
    expect(ma).toContain(moiLoai);
  });

  it('quy định cho MỌI NHÓM vẫn hiện khi lọc theo một nhóm cụ thể', async () => {
    /*
     * Nhánh `product_group_id IS NULL`, và là ca DUY NHẤT dựng một quy định
     * toàn cục. Nó khớp mọi sản phẩm nên phải dọn ngay trong `finally`, kể cả
     * khi phần khẳng định hỏng — để lại là mọi ca tra ngưỡng của lượt chạy sau
     * nhận `source: 'RULE'` thay vì `'DEFAULT'`, mà không gì chỉ ra vì sao.
     */
    const { groupCode } = await dungQuyDinh();
    const toanCuc = code('CKG');
    const tao = await post('/catalog/discount-rules', {
      code: toanCuc,
      // Ngày hiệu lực riêng: `uq_rule_pham_vi` dùng NULLS NOT DISTINCT, nên hai
      // dòng toàn cục chỉ khác nhau được ở ngày.
      effectiveFrom: '2019-02-02',
      thresholdRate2: 500,
    });
    expect(tao.status, JSON.stringify(tao.body)).toBe(201);
    try {
      const ma = maCua(await get(`/catalog/discount-rules?groupCode=${groupCode}&limit=200`));
      expect(ma, 'quy định cho mọi nhóm vẫn áp cho nhóm này').toContain(toanCuc);
    } finally {
      await del(`/catalog/discount-rules/${toanCuc}`, { confirm: toanCuc });
    }
  });
});
