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

  const gui = await (await http(policy))
    .post(`/policies/${hs.body.id}/actions/SUBMIT`)
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({});
  expect(gui.status, JSON.stringify(gui.body)).toBe(200);

  return { id: hs.body.id as string, code: hs.body.code as string };
};

const doc = async (id: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ role: string; approver: string | null; parent: string | null }>(
      `SELECT u.role::text AS role, a.username AS approver, p.username AS parent
         FROM idn.app_user u
         LEFT JOIN idn.app_user a ON a.id = u.approver_user_id
         LEFT JOIN idn.user_node nd ON nd.user_id = u.id
         LEFT JOIN idn.app_user p ON p.id = nd.parent_id
        WHERE u.id = $1`,
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

  it('gỡ Trưởng bộ phận quản lý khi vai trò mới không phải TDV', async () => {
    // Không gỡ thì còn lại đúng thứ trigger `forbid_bad_approver` chặn không cho
    // tạo: một người không phải TDV mà vẫn mang Trưởng bộ phận quản lý.
    const u = await taoNguoiDung('TDV', { approverUsername: 'tbp01', parentUsername: 'kt01' });
    expect((await doc(u.id)).approver).toBe('tbp01');

    expect((await idn(`/admin/users/${u.id}`, { role: 'SALE_ADMIN' })).status).toBe(200);
    const sau = await doc(u.id);
    expect(sau.approver).toBeNull();
    // Sale Admin đứng ngoài cây dữ liệu nên cấp trên cũng phải biến mất.
    expect(sau.parent).toBeNull();
  });

  it('gỡ cấp trên khi vai trò mới đòi hỏi một LOẠI cấp trên khác', async () => {
    // Chỗ này dễ sót nhất: TDV → Kế toán thì ô cấp trên vẫn còn, nhưng người
    // đang nằm trong đó là một kế toán, còn cấp trên của kế toán phải là Sale
    // Admin. Giữ lại là để một quan hệ SAI KIỂU trong cây, và phạm vi dữ liệu
    // suy ra từ đó thì sai mà không có lỗi nào báo.
    const u = await taoNguoiDung('TDV', { approverUsername: 'tbp01', parentUsername: 'kt01' });
    expect((await idn(`/admin/users/${u.id}`, { role: 'KE_TOAN' })).status).toBe(200);
    expect((await doc(u.id)).parent).toBeNull();
  });

  it('GIỮ cấp trên khi vai trò mới vẫn đòi hỏi đúng loại đó', async () => {
    const u = await taoNguoiDung('KE_TOAN', { parentUsername: 'sa01' });
    // Kế toán và... kế toán: không đổi gì thì không được đụng vào liên kết.
    expect((await idn(`/admin/users/${u.id}`, { fullName: 'Ten Khac' })).status).toBe(200);
    expect((await doc(u.id)).parent).toBe('sa01');
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
    // người bị đổi vai trò mà ở một TDV dưới quyền họ. Đổi vai trò một Trưởng bộ
    // phận đang có hồ sơ chờ duyệt là bỏ rơi đúng hồ sơ đó — hộp việc suy từ cây
    // tổ chức nên không ai khác nhận được nó.
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
// Người dùng tự đổi người quản lý
// =============================================================================

describe('tự đổi người quản lý', () => {
  /** Tạo một TDV thật, kích hoạt bằng cách đặt mật khẩu thẳng vào CSDL. */
  const taoVaDangNhap = async (role: string, over: Record<string, unknown> = {}) => {
    const u = await taoNguoiDung(role, over);
    const { hashPassword } = await import('@csbh/identity-core');
    const hash = await hashPassword(SEED_PW);
    await withAdminDb((c) =>
      c.query(
        `UPDATE idn.app_user
            SET password_hash = $2, must_change_password = false,
                activated_at = now(), email_verified_at = now()
          WHERE id = $1`,
        [u.id, hash],
      ),
    );
    await clearAccountCache();
    return { ...u, token: await accessTokenFor(identity, u.username, SEED_PW) };
  };

  const suaToi = async (token: string, body: object) =>
    (await http(identity)).patch('/auth/me').set('Authorization', `Bearer ${token}`).send(body);

  it('TDV đổi được cả Trưởng bộ phận và kế toán quản lý', async () => {
    const u = await taoVaDangNhap('TDV');
    const res = await suaToi(u.token, {
      fullName: 'Ten Van Nhu Cu',
      approverUsername: 'tbp01',
      parentUsername: 'kt01',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const sau = await doc(u.id);
    expect(sau.approver).toBe('tbp01');
    expect(sau.parent).toBe('kt01');

    // Và `/auth/me` trả lại đúng hai liên kết đó — màn hình đọc từ đây.
    expect(res.body.approverUsername).toBe('tbp01');
    expect(res.body.parentUsername).toBe('kt01');
  });

  it('chuỗi rỗng là GỠ liên kết, không phải "không đụng tới"', async () => {
    const u = await taoVaDangNhap('TDV', { approverUsername: 'tbp01' });
    expect((await suaToi(u.token, { fullName: 'X X', approverUsername: '' })).status).toBe(200);
    expect((await doc(u.id)).approver).toBeNull();
  });

  it('kế toán đổi được Sale Admin quản lý, nhưng KHÔNG có Trưởng bộ phận', async () => {
    const u = await taoVaDangNhap('KE_TOAN');
    expect((await suaToi(u.token, { fullName: 'X X', parentUsername: 'sa01' })).status).toBe(200);
    expect((await doc(u.id)).parent).toBe('sa01');

    const sai = await suaToi(u.token, { fullName: 'X X', approverUsername: 'tbp01' });
    expect(sai.status).toBe(400);
  });

  it('không gán được người SAI VAI TRÒ làm quản lý', async () => {
    const u = await taoVaDangNhap('TDV');
    // kt01 không phải TBP, tbp01 không phải kế toán — cả hai đều phải bị chặn.
    expect((await suaToi(u.token, { fullName: 'X X', approverUsername: 'kt01' })).status).toBe(400);
    expect((await suaToi(u.token, { fullName: 'X X', parentUsername: 'tbp01' })).status).toBe(400);
  });

  it('không đặt được chính mình làm quản lý', async () => {
    const u = await taoVaDangNhap('KE_TOAN');
    const res = await suaToi(u.token, { fullName: 'X X', parentUsername: u.username });
    expect(res.status).toBe(400);
  });

  it('vai trò ngoài cây dữ liệu thì không có gì để đổi', async () => {
    const u = await taoVaDangNhap('BAN_LANH_DAO');
    expect((await suaToi(u.token, { fullName: 'X X', parentUsername: 'sa01' })).status).toBe(400);
  });

  it('`/auth/managers` chỉ trả tên và tài khoản, KHÔNG trả email', async () => {
    // Một TDV chọn Trưởng bộ phận thì chỉ cần tên. Không có lý do gì để họ cầm
    // danh bạ email của cả công ty — đó là việc `/admin/users` làm, và đường đó
    // chỉ Quản trị hệ thống vào được.
    const u = await taoVaDangNhap('TDV');
    const res = await (await http(identity))
      .get('/auth/managers')
      .set('Authorization', `Bearer ${u.token}`);
    expect(res.status).toBe(200);
    expect(res.body.coApprover).toBe(true);
    expect(res.body.coCapTren).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('@');
    expect(res.body.approvers.every((x: { role?: string }) => x.role === undefined)).toBe(true);
  });

  it('Ban lãnh đạo không có ô nào để chọn', async () => {
    const u = await taoVaDangNhap('BAN_LANH_DAO');
    const res = await (await http(identity))
      .get('/auth/managers')
      .set('Authorization', `Bearer ${u.token}`);
    expect(res.body.coApprover).toBe(false);
    expect(res.body.coCapTren).toBe(false);
  });

  it('KHÔNG đổi được vai trò hay email qua `/auth/me`', async () => {
    const u = await taoVaDangNhap('TDV');
    const res = await suaToi(u.token, {
      fullName: 'X X',
      role: 'QUAN_TRI',
      email: 'ke-gian@csbh.test',
    });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('TDV');
    expect(res.body.email).toBe(`${u.username}@csbh.test`);
  });
});
