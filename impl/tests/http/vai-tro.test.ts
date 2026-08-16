/**
 * Đổi vai trò, và người dùng tự đổi người quản lý của mình.
 *
 * Hai đường ghi mở ra ở P18, và cả hai đều đụng vào CÂY TỔ CHỨC — thứ quyết định
 * hồ sơ chạy tới ai duyệt và ai nhìn thấy dữ liệu của ai. Nên cái đáng kiểm
 * không phải "sửa được", mà là ba thứ:
 *
 *   1. Đổi vai trò bị CHẶN khi người đó còn hồ sơ dở dang — hồ sơ đang chờ đúng
 *      bước của vai trò cũ không tự chuyển cho ai.
 *   2. Đổi vai trò xong thì liên kết cây không còn hợp lệ phải BIẾN MẤT, không
 *      nằm lại thành một quan hệ sai kiểu mà không ai thấy.
 *   3. Người dùng tự đổi được người quản lý, nhưng KHÔNG đổi được vai trò hay
 *      email qua cùng đường đó.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  bootPolicyListening,
  cleanupTestUsers,
  clearAccountCache,
  clearScopeCache,
  http,
  maDuyNhat,
  TEST_PREFIX,
  withAdminDb,
  phanCongMacDinh,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZVT';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
let n = 0;

const uniq = (k: string) => maDuyNhat(P, k);

const idn = async (path: string, body: object, who = 'admin01') =>
  (await http(identity)).patch(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

/** Tạo một tài khoản thử nghiệm qua API quản trị và trả về id. */
const taoNguoiDung = async (
  role: string,
  over: Record<string, unknown> = {},
): Promise<{ id: string; username: string }> => {
  const username = `${TEST_PREFIX}_vt${++n}`;
  const res = await (await http(identity))
    .post('/admin/users')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      username,
      email: `${username}@csbh.test`,
      fullName: 'Nguoi dung thu nghiem',
      role,
      ...over,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { id: res.body.id as string, username };
};

const idCua = async (username: string): Promise<string> =>
  withAdminDb(async (c) => {
    const r = await c.query<{ id: string }>(`SELECT id FROM idn.app_user WHERE username = $1`, [
      username,
    ]);
    return r.rows[0]!.id;
  });

/**
 * Lập một hồ sơ bằng `tdv01` rồi GỬI DUYỆT — hồ sơ dừng ở `CHO_TBP_DUYET`.
 *
 * Gửi duyệt chứ không để nguyên Nháp, vì hai nhánh của chốt chặn cần hai thứ
 * khác nhau: nhánh "người lập" chỉ cần hồ sơ chưa kết thúc, còn nhánh "đang chờ
 * xử lý" cần nó nằm đúng ở bước mà vai trò kia phụ trách.
 */
const lapVaGui = async (): Promise<{ id: string; code: string }> => {
  const kh = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      code: uniq('KH'),
      name: 'Nha thuoc thu nghiem',
      customerType: 1,
      registeredAddress: 'Ha Noi',
      ownerName: 'Chu ho',
    });
  expect(kh.status, JSON.stringify(kh.body)).toBe(201);

  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom thu nghiem' });
  const sp = await (await http(catalog))
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      code: uniq('SP'),
      name: 'Nutricare Gold',
      groupCode: g.body.code,
    });
  await (await http(catalog))
    .post(`/catalog/products/${sp.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });

  const hs = await (await http(policy))
    .post('/policies')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      customerId: kh.body.id,
      lines: [{ productId: sp.body.id, wholesalePrice: '90000', cpbh: ['5000'] }],
    });
  expect(hs.status, JSON.stringify(hs.body)).toBe(201);

  // Chọn người xử lý ngay lúc gửi (`0031`). Trước đây `send({})` là đủ vì hồ sơ
  // tự tìm đường qua cây tổ chức.
  const gui = await (await http(policy))
    .post(`/policies/${hs.body.id}/actions/SUBMIT`)
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send(await phanCongMacDinh('SUBMIT'));
  expect(gui.status, JSON.stringify(gui.body)).toBe(200);

  return { id: hs.body.id as string, code: hs.body.code as string };
};

/** Tài khoản chỉ còn vai trò để đọc — hai cột liên kết đã gỡ ở `0031`. */
const doc = async (id: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ role: string }>(
      `SELECT role::text AS role FROM idn.app_user WHERE id = $1`,
      [id],
    );
    return r.rows[0]!;
  });

beforeAll(async () => {
  await cleanupTestUsers();
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  const c = await bootCatalogListening();
  catalog = c.app;
  restores.push(c.restore);
  const cu = await bootCustomerListening();
  customer = cu.app;
  restores.push(cu.restore);
  // `identity` hỏi `policy` "còn hồ sơ dở dang không", nên policy phải NGHE
  // THẬT trên một cổng, không chỉ dựng trong tiến trình.
  const p = await bootPolicyListening();
  policy = p.app;
  restores.push(p.restore);

  await clearAccountCache();
  await clearScopeCache();

  for (const u of ['admin01', 'tdv01', 'kt01', 'tbp01', 'sa01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }
});

afterAll(async () => {
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
  await cleanupTestUsers();
  // Mã hồ sơ do máy chủ sinh, KHÔNG mang tiền tố của tệp test này — nên dọn theo
  // khách hàng. Xoá khách hàng trước mà bỏ lại hồ sơ là để lại rác trỏ vào một
  // khách hàng không còn tồn tại, và các lượt chạy sau đếm phải nó.
  await withAdminDb(async (c) => {
    await c.query(
      `DELETE FROM pol.policy WHERE customer_id IN
         (SELECT id FROM cus.customer WHERE code LIKE $1)`,
      [`${P}%`],
    );
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
  });
});

// =============================================================================
// Quản trị đổi vai trò
// =============================================================================

describe('đổi vai trò', () => {
  it('tài khoản sạch thì đổi được', async () => {
    const u = await taoNguoiDung('TDV');
    const res = await idn(`/admin/users/${u.id}`, { role: 'BAN_LANH_DAO' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await doc(u.id)).role).toBe('BAN_LANH_DAO');
  });

  it('tạo tài khoản KHÔNG còn nhận trường liên kết nào (`0031`)', async () => {
    // Ba ca cũ ở chỗ này kiểm việc DỌN liên kết khi đổi vai trò: gỡ người duyệt
    // khi TDV lên Sale Admin, gỡ cấp trên khi TDV thành Kế toán vì cấp trên của
    // Kế toán phải là Sale Admin, và giữ nguyên khi loại cấp trên không đổi.
    // Cả ba là hệ quả của việc biểu mẫu tạo tài khoản đổi hình theo vai trò —
    // và mỗi lần đổi hình là một chỗ có thể gán sai.
    //
    // Không còn ô nào để gán, nên không còn gì để dọn. Ca này canh đúng điều đó:
    // gửi kèm hai trường cũ thì máy chủ BỎ QUA chúng, không tạo ra liên kết nào.
    const u = await taoNguoiDung('TDV', { approverUsername: 'tbp01', parentUsername: 'kt01' });
    expect((await doc(u.id)).role).toBe('TDV');

    expect((await idn(`/admin/users/${u.id}`, { role: 'SALE_ADMIN' })).status).toBe(200);
    expect((await doc(u.id)).role).toBe('SALE_ADMIN');
  });

  it('còn hồ sơ dở dang thì CHẶN, và nói rõ hồ sơ nào', async () => {
    const hs = await lapVaGui();
    const tdv01Id = await idCua('tdv01');

    const chan = await idn(`/admin/users/${tdv01Id}`, { role: 'KE_TOAN' });
    expect(chan.status, JSON.stringify(chan.body)).toBe(409);
    expect(chan.body.code).toBe('ROLE_CHANGE_BLOCKED');
    // Con số không đủ: người quản trị phải tra ra được ĐÚNG hồ sơ nào.
    expect(Array.isArray(chan.body.policies)).toBe(true);
    expect(chan.body.policies.some((x: { code: string }) => x.code === hs.code)).toBe(true);
    expect(chan.body.count).toBeGreaterThan(0);

    // Và vai trò KHÔNG đổi — chặn phải là chặn thật, không phải cảnh báo rồi ghi.
    expect((await doc(tdv01Id)).role).toBe('TDV');
  });

  it('CHẶN cả khi hồ sơ đang chờ NGƯỜI KHÁC lập, nhưng chờ đúng bước của mình', async () => {
    // Nhánh thứ hai của chốt chặn, và là kiểu mắc kẹt tệ hơn: hồ sơ không nằm ở
    // người bị đổi vai trò mà ở một TDV khác, GIAO ĐÍCH DANH cho họ. Đổi vai trò
    // một Trưởng bộ phận đang có hồ sơ chờ ký là bỏ rơi đúng hồ sơ đó — và từ
    // `0031` điều này chặt hơn hẳn: trước đây một đồng nghiệp cùng nhánh cây còn
    // nhìn thấy, giờ hồ sơ chỉ nằm trong hộp việc của đúng người được chọn.
    const hs = await lapVaGui();
    const tbp01Id = await idCua('tbp01');

    const chan = await idn(`/admin/users/${tbp01Id}`, { role: 'BAN_LANH_DAO' });
    expect(chan.status, JSON.stringify(chan.body)).toBe(409);
    expect(chan.body.code).toBe('ROLE_CHANGE_BLOCKED');
    expect(chan.body.policies.some((x: { code: string }) => x.code === hs.code)).toBe(true);
    // Lý do phải nói đúng NHÁNH nào bắt được nó, không gộp làm một.
    expect(
      chan.body.policies.find((x: { code: string }) => x.code === hs.code).reason,
    ).toBe('dang cho xu ly');
    expect((await doc(tbp01Id)).role).toBe('TBP');
  });

  it('hồ sơ QUÁ HẠN vẫn tính là dở dang', async () => {
    // Hồ sơ quá hạn giấu bước thật trong `pending_step`, nên câu truy vấn có một
    // nhánh riêng cho nó. Bỏ sót nhánh đó là bỏ sót đúng những hồ sơ đã chờ lâu
    // nhất — cái dễ bị quên nhất khi đổi vai trò.
    const hs = await lapVaGui();
    await withAdminDb((c) =>
      c.query(
        `UPDATE pol.policy SET status = 'QUA_HAN_DUYET', pending_step = 'B4_TBP_DUYET'
          WHERE code = $1`,
        [hs.code],
      ),
    );
    const tbp01Id = await idCua('tbp01');
    const chan = await idn(`/admin/users/${tbp01Id}`, { role: 'BAN_LANH_DAO' });
    expect(chan.status).toBe(409);
    expect(chan.body.policies.some((x: { code: string }) => x.code === hs.code)).toBe(true);
  });

  it('vai trò lạ thì 400', async () => {
    const u = await taoNguoiDung('TDV');
    expect((await idn(`/admin/users/${u.id}`, { role: 'GIAM_DOC' })).status).toBe(400);
  });

  it('vai trò khác Quản trị không đổi được vai trò của ai', async () => {
    const u = await taoNguoiDung('TDV');
    for (const who of ['tdv01', 'kt01', 'tbp01', 'sa01', 'bld01']) {
      const res = await idn(`/admin/users/${u.id}`, { role: 'KE_TOAN' }, who);
      expect(res.status, `${who} đáng lẽ bị chặn`).toBe(403);
    }
  });
});

// =============================================================================
// Ô CHỌN NGƯỜI XỬ LÝ — thay cho "tự đổi người quản lý" (`0031`)
// =============================================================================
//
// Cả khối `describe('tự đổi người quản lý')` cũ đã bỏ cùng với `GET /auth/managers`
// và `PATCH /auth/me` phần liên kết. Nó kiểm mười hai ca quanh một tính năng có
// hệ quả không nhỏ: định tuyến suy từ `approver_user_id` chứ không lưu vào hồ sơ,
// nên người dùng tự đổi một ô là chuyển NGAY mọi hồ sơ đang chờ duyệt của mình
// sang hộp việc người khác — kể cả hồ sơ đã gửi từ tuần trước.
//
// Thay bằng `GET /auth/nguoi-theo-vai-tro/:role`: chỉ đọc, và phục vụ đúng chỗ
// quyết định giờ nằm ở — ô chọn lúc gửi duyệt.

describe('/auth/nguoi-theo-vai-tro — nguồn cho mọi ô chọn người', () => {
  it('trả đúng vai trò được hỏi', async () => {
    const res = await (await http(identity))
      .get('/auth/nguoi-theo-vai-tro/TBP')
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ten = (res.body as { username: string }[]).map((x) => x.username);
    expect(ten).toContain('tbp01');
    expect(ten).not.toContain('kt01');
  });

  it('KHÔNG trả email — ô chọn chỉ cần tên và tài khoản', async () => {
    // Một TDV chọn người duyệt thì không có lý do gì để họ cầm danh bạ email của
    // cả công ty. Đó là việc của `/admin/users`, sau `@Roles('QUAN_TRI')`.
    const res = await (await http(identity))
      .get('/auth/nguoi-theo-vai-tro/KE_TOAN')
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(res.status).toBe(200);
    for (const x of res.body as Record<string, unknown>[]) {
      expect(Object.keys(x).sort()).toEqual(['fullName', 'id', 'username']);
    }
  });

  it('tài khoản CHƯA KÍCH HOẠT không xuất hiện', async () => {
    // Giao hồ sơ cho người chưa đăng nhập được lần nào là gửi nó vào chỗ không
    // ai mở ra. Tài khoản vừa tạo qua `/admin/users` luôn ở trạng thái này.
    const u = await taoNguoiDung('TBP');
    const res = await (await http(identity))
      .get('/auth/nguoi-theo-vai-tro/TBP')
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect((res.body as { username: string }[]).map((x) => x.username)).not.toContain(u.username);
  });

  it('vai trò ngoài luồng duyệt thì 400', async () => {
    // Ban lãnh đạo và Quản trị không nhận hồ sơ, nên không có ô chọn nào cho họ.
    for (const r of ['BAN_LANH_DAO', 'QUAN_TRI', 'GIAM_DOC']) {
      const res = await (await http(identity))
        .get(`/auth/nguoi-theo-vai-tro/${r}`)
        .set('Authorization', `Bearer ${tok['tdv01']}`);
      expect(res.status, r).toBe(400);
    }
  });

  it('`/auth/managers` đã bị gỡ', async () => {
    const res = await (await http(identity))
      .get('/auth/managers')
      .set('Authorization', `Bearer ${tok['tdv01']}`);
    expect(res.status).toBe(404);
  });

  it('`PATCH /auth/me` chỉ đổi được họ tên', async () => {
    const res = await (await http(identity))
      .patch('/auth/me')
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ fullName: 'Ten Moi 0031', approverUsername: 'tbp02', role: 'QUAN_TRI' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await doc(await idCua('tdv01'))).role).toBe('TDV');
  });
});
