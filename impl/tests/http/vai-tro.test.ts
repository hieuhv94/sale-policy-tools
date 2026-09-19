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
  mstDuyNhat,
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
      province: 'Hà Nội',
      streetWard: 'Hà Nội',
      ownerName: 'Chu ho',
      // `0104` — gửi duyệt đòi đủ MST và chức danh, nên khách hàng
      // của bộ test phải giống khách hàng thật.
      ownerTitle: 'Chu ho',
      idNumber: mstDuyNhat(), phone: '0900000000' });
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
      price: '100000',
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

/** Tài khoản chỉ còn vai trò và trạng thái để đọc — hai cột liên kết gỡ ở `0031`. */
const doc = async (id: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ role: string; isActive: boolean }>(
      `SELECT role::text AS role, is_active AS "isActive" FROM idn.app_user WHERE id = $1`,
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
    // Gỡ nhãn kết thúc TRƯỚC khi xoá: trigger `trg_forbid_delete_rejected` chặn
    // xoá hồ sơ ở CẢ HAI trạng thái kết thúc (YCNV muc 4 và `0035`), và tệp này
    // cố ý dựng ra
    // một hồ sơ như vậy để kiểm việc chuyển giao bỏ qua nó. Không gỡ thì bước
    // dọn ném lỗi và CẢ TỆP đỏ, với một thông báo chẳng liên quan tới điều đang
    // kiểm — đúng thứ đã xảy ra một lần.
    await c.query(
      `UPDATE pol.policy SET status = 'NHAP'
        WHERE status::text = 'DA_XOA'
          AND customer_id IN (SELECT id FROM cus.customer WHERE code LIKE $1)`,
      [`${P}%`],
    );
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

describe('`0032` KHÔNG còn đổi được vai trò', () => {
  /*
   * Cả khối `describe('đổi vai trò')` cũ đã bỏ. Nó kiểm bảy ca quanh một chốt
   * chặn có điều kiện — "còn hồ sơ dở dang thì không đổi được vai trò" — và
   * chốt chặn ấy giờ là một cái CẤM HẲN.
   *
   * Vì sao cấm hẳn thay vì giữ chốt chặn: chốt chặn chỉ dời vấn đề. Nó bắt người
   * quản trị đi xử lý cho hết hồ sơ trước khi đổi vai trò, mà "xử lý cho hết"
   * không phải việc của người quản trị — họ không có quyền ký số, không tiếp
   * nhận, không bàn giao. Đường đi đúng là vô hiệu hoá tài khoản cũ (kèm chuyển
   * giao) rồi tạo tài khoản mới, và đó là đường duy nhất còn lại.
   */
  it('gửi `role` trong PATCH thì bị BỎ QUA, không đổi gì', async () => {
    const u = await taoNguoiDung('TDV');
    const res = await idn(`/admin/users/${u.id}`, { fullName: 'Ten Moi', role: 'QUAN_TRI' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await doc(u.id)).role).toBe('TDV');
  });

  it('gửi mỗi `role`, không kèm gì khác, cũng không đổi', async () => {
    const u = await taoNguoiDung('KE_TOAN');
    expect((await idn(`/admin/users/${u.id}`, { role: 'TDV' })).status).toBe(200);
    expect((await doc(u.id)).role).toBe('KE_TOAN');
  });

  it('vai trò khác Quản trị không sửa được tài khoản của ai', async () => {
    const u = await taoNguoiDung('TDV');
    for (const who of ['tdv01', 'kt01', 'tbp01', 'sa01', 'bld01']) {
      const res = await idn(`/admin/users/${u.id}`, { fullName: 'X' }, who);
      expect(res.status, `${who} đáng lẽ bị chặn`).toBe(403);
    }
  });
});

// =============================================================================
// `0032` — Vô hiệu hoá tài khoản: gõ lại tên, chọn người nhận, chuyển giao
// =============================================================================

describe('`0032` vô hiệu hoá tài khoản và chuyển giao hồ sơ', () => {
  const post = async (path: string, body: object = {}, who = 'admin01') =>
    (await http(identity)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
  const get = async (path: string, who = 'admin01') =>
    (await http(identity)).get(path).set('Authorization', `Bearer ${tok[who]}`);

  const cot = (r: string) =>
    ({ TDV: 'tdv_user_id', TBP: 'tbp_user_id', KE_TOAN: 'ke_toan_user_id', SALE_ADMIN: 'sale_admin_user_id' })[r]!;

  /** Ai đang giữ hồ sơ này ở vai trò ấy. */
  const nguoiGiu = (code: string, role: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ v: string | null }>(
        `SELECT ${cot(role)} AS v FROM pol.policy WHERE code = $1`,
        [code],
      );
      return r.rows[0]?.v ?? null;
    });

  const nhatKy = (code: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ action: string; reason: string | null; from_status: string; to_status: string }>(
        `SELECT e.action, e.reason, e.from_status::text, e.to_status::text
           FROM pol.policy_event e JOIN pol.policy p ON p.id = e.policy_id
          WHERE p.code = $1 ORDER BY e.seq`,
        [code],
      );
      return r.rows;
    });

  const batLai = async (id: string) => post(`/admin/users/${id}/activate-account`);

  it('xem trước nói đúng số hồ sơ đang giữ, TRƯỚC khi bấm gì', async () => {
    const hs = await lapVaGui();
    const tbp01 = await idCua('tbp01');
    const r = await get(`/admin/users/${tbp01}/ban-giao`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.role).toBe('TBP');
    expect(r.body.count).toBeGreaterThanOrEqual(1);
    expect((r.body.policies as { code: string }[]).some((x) => x.code === hs.code)).toBe(true);
  });

  it('gõ SAI tên đăng nhập thì 400 và KHÔNG vô hiệu hoá gì', async () => {
    const u = await taoNguoiDung('TBP');
    const r = await post(`/admin/users/${u.id}/deactivate`, { confirmUsername: 'ten-sai' });
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(r.body.code).toBe('CONFIRM_MISMATCH');
    // Câu báo phải NÓI RA chuỗi đúng, nếu không người quản trị chỉ đoán.
    expect(r.body.message).toContain(u.username);
    expect((await doc(u.id)).isActive).toBe(true);
  });

  it('thiếu tên đăng nhập hoàn toàn cũng bị chặn', async () => {
    const u = await taoNguoiDung('TBP');
    expect((await post(`/admin/users/${u.id}/deactivate`)).status).toBe(400);
    expect((await doc(u.id)).isActive).toBe(true);
  });

  it('tên đăng nhập chỉ khác khoảng trắng và chữ hoa thì VẪN nhận', async () => {
    // Người quản trị chép chuỗi từ màn hình sang; một dấu cách thừa không phải
    // là bấm nhầm dòng, và bắt họ gõ lại là làm phiền chứ không làm an toàn hơn.
    const u = await taoNguoiDung('BAN_LANH_DAO');
    const r = await post(`/admin/users/${u.id}/deactivate`, {
      confirmUsername: `  ${u.username.toUpperCase()} `,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await doc(u.id)).isActive).toBe(false);
  });

  it('tài khoản KHÔNG giữ hồ sơ nào thì không cần chọn người nhận', async () => {
    const u = await taoNguoiDung('KE_TOAN');
    const r = await post(`/admin/users/${u.id}/deactivate`, {
      confirmUsername: u.username,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.handedOver).toBe(0);
    expect((await doc(u.id)).isActive).toBe(false);
  });

  it('còn giữ hồ sơ mà KHÔNG chọn người nhận thì 422, và tài khoản vẫn hoạt động', async () => {
    // Ca quan trọng nhất của cả khối: đây đúng là chỗ hồ sơ bị treo nếu bỏ chốt
    // chặn. Id người xử lý nằm cứng trên hồ sơ, nên vô hiệu hoá mà không chuyển
    // giao là để lại hồ sơ không ai thấy và không ai thao tác được.
    await lapVaGui();
    const tbp01 = await idCua('tbp01');
    const r = await post(`/admin/users/${tbp01}/deactivate`, {
      confirmUsername: 'tbp01',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.code).toBe('SUCCESSOR_REQUIRED');
    expect((await doc(tbp01)).isActive).toBe(true);
  });

  it('chọn người nhận SAI VAI TRÒ thì 422', async () => {
    await lapVaGui();
    const tbp01 = await idCua('tbp01');
    const r = await post(`/admin/users/${tbp01}/deactivate`, {
      confirmUsername: 'tbp01',
      successorId: await idCua('kt01'),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.code).toBe('SUCCESSOR_WRONG_ROLE');
    expect((await doc(tbp01)).isActive).toBe(true);
  });

  it('chọn CHÍNH MÌNH làm người nhận thì 422', async () => {
    await lapVaGui();
    const tbp01 = await idCua('tbp01');
    const r = await post(`/admin/users/${tbp01}/deactivate`, {
      confirmUsername: 'tbp01',
      successorId: tbp01,
    });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('SUCCESSOR_INVALID');
  });

  it('chọn người nhận CHƯA KÍCH HOẠT thì 422', async () => {
    // Tài khoản tạo qua API chưa đi qua thư mời — giao hồ sơ cho họ là gửi vào
    // chỗ không ai mở ra, đúng cái ngõ cụt đang đi chữa.
    await lapVaGui();
    const moi = await taoNguoiDung('TBP');
    const tbp01 = await idCua('tbp01');
    const r = await post(`/admin/users/${tbp01}/deactivate`, {
      confirmUsername: 'tbp01',
      successorId: moi.id,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.code).toBe('SUCCESSOR_INACTIVE');
  });

  it('chuyển giao THẬT: hồ sơ đổi tay, giữ nguyên trạng thái, ghi vào nhật ký hồ sơ', async () => {
    const hs = await lapVaGui();
    const tbp01 = await idCua('tbp01');
    const tbp02 = await idCua('tbp02');
    expect(await nguoiGiu(hs.code, 'TBP')).toBe(tbp01);

    const r = await post(`/admin/users/${tbp01}/deactivate`, {
      confirmUsername: 'tbp01',
      successorId: tbp02,
    });
    try {
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.handedOver).toBeGreaterThanOrEqual(1);

      // 1. Hồ sơ đã đổi tay.
      expect(await nguoiGiu(hs.code, 'TBP')).toBe(tbp02);

      // 2. TRẠNG THÁI KHÔNG ĐỔI — chuyển giao là đổi người, không phải một bước
      //    của luồng duyệt.
      const sau = await withAdminDb(async (c) => {
        const x = await c.query<{ s: string }>(
          `SELECT status::text AS s FROM pol.policy WHERE code = $1`,
          [hs.code],
        );
        return x.rows[0]!.s;
      });
      expect(sau).toBe('CHO_TBP_DUYET');

      // 3. Nhật ký CỦA CHÍNH HỒ SƠ có vết, kèm lý do đọc được.
      const nk = await nhatKy(hs.code);
      const dong = nk.find((x) => x.action === 'HANDOVER');
      expect(dong, 'phải có dòng HANDOVER trong nhật ký hồ sơ').toBeDefined();
      expect(dong!.reason).toContain('vô hiệu hoá');
      // from = to: không bịa ra một bước chuyển không có thật.
      expect(dong!.from_status).toBe(dong!.to_status);
    } finally {
      await batLai(tbp01);
    }
  });

  it('hồ sơ ĐANG CÓ HIỆU LỰC cũng chuyển, không chỉ hồ sơ đang chờ', async () => {
    // Hồ sơ hiệu lực không phải "việc đang chờ", nhưng người phụ trách nó là
    // người nhận thư khi giá hay quy định chiết khấu đổi. Bỏ sót nó là gửi thư
    // vào một hộp thư không ai đọc.
    const hs = await lapVaGui();
    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET status = 'DANG_CO_HIEU_LUC' WHERE code = $1`, [hs.code]),
    );
    const tbp01 = await idCua('tbp01');
    const tbp02 = await idCua('tbp02');
    try {
      const r = await post(`/admin/users/${tbp01}/deactivate`, {
        confirmUsername: 'tbp01',
        successorId: tbp02,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await nguoiGiu(hs.code, 'TBP')).toBe(tbp02);
    } finally {
      await batLai(tbp01);
    }
  });

  // Hai trạng thái kết thúc, cùng một lý do không bàn giao: không có việc gì cho
  // người kế nhiệm làm với chúng. `DA_XOA` vào đây từ `0035`.
  for (const tt of ['DA_XOA']) {
    it(`hồ sơ ${tt} thì KHÔNG chuyển — đó là trạng thái kết thúc`, async () => {
      const hs = await lapVaGui();
      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = $2::pol.policy_status WHERE code = $1`, [
          hs.code,
          tt,
        ]),
      );
      const tbp01 = await idCua('tbp01');
      const tbp02 = await idCua('tbp02');
      try {
        await post(`/admin/users/${tbp01}/deactivate`, {
          confirmUsername: 'tbp01',
          successorId: tbp02,
        });
        expect(await nguoiGiu(hs.code, 'TBP')).toBe(tbp01);
      } finally {
        await batLai(tbp01);
        // Trả trạng thái về: `afterAll` dọn bằng `DELETE`, mà trigger
        // `trg_forbid_delete_rejected` chặn xoá hồ sơ ở CẢ HAI trạng thái này
        // (YCNV muc 4, `0035`). Để nguyên là cả tệp đỏ ở bước dọn, với một lỗi
        // chẳng liên quan tới điều đang kiểm.
        await withAdminDb((c) =>
          c.query(`UPDATE pol.policy SET status = 'CHO_TBP_DUYET' WHERE code = $1`, [hs.code]),
        );
      }
    });
  }

  it('KHÔNG hồ sơ nào của người bị vô hiệu hoá còn treo lại — quét cả bốn cột', async () => {
    // Bất biến của cả tính năng, phát biểu thẳng: sau khi vô hiệu hoá, không tồn
    // tại một hồ sơ CHƯA KẾT THÚC nào còn trỏ tới tài khoản đó ở bất kỳ cột nào.
    const hs = await lapVaGui();
    const tbp01 = await idCua('tbp01');
    const tbp02 = await idCua('tbp02');
    try {
      await post(`/admin/users/${tbp01}/deactivate`, {
        confirmUsername: 'tbp01',
        successorId: tbp02,
      });
      const treo = await withAdminDb(async (c) => {
        const r = await c.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pol.policy
            WHERE status::text <> ALL($2::text[])
              AND (tdv_user_id = $1 OR tbp_user_id = $1
                   OR ke_toan_user_id = $1 OR sale_admin_user_id = $1)`,
          [tbp01, ['HET_HIEU_LUC', 'DA_XOA']],
        );
        return Number(r.rows[0]!.n);
      });
      expect(treo, `hồ sơ còn treo lại ở tài khoản đã vô hiệu hoá (${hs.code} chẳng hạn)`).toBe(0);
    } finally {
      await batLai(tbp01);
    }
  });

  /*
   * BỐN VAI TRÒ TRONG LUỒNG, cùng một bất biến.
   *
   * Ca thật đi hết luồng ở trên đã phủ `TBP`. Ba vai trò còn lại dựng bằng cách
   * ĐẶT THẲNG cột người trên hồ sơ rồi vô hiệu hoá tài khoản ấy — và đó là phép
   * thử đúng, vì chính cột đó là thứ mọi phép lọc phạm vi và mọi hộp việc đọc.
   *
   * Dùng tài khoản dùng một lần chứ không dùng `tdv01`/`kt01`/`sa01`: các tệp
   * test chạy SONG SONG trên cùng một CSDL và gần như tệp nào cũng thao tác bằng
   * ba tài khoản ấy. Vô hiệu hoá một trong số chúng dù chỉ vài trăm mili giây
   * cũng đủ làm một tệp khác đỏ vì lý do chẳng liên quan tới nó.
   */
  for (const [role, nguoiNhan] of [
    ['TDV', 'tdv01'],
    ['TBP', 'tbp01'],
    ['KE_TOAN', 'kt01'],
    ['SALE_ADMIN', 'sa01'],
  ] as const) {
    it(`${role}: vô hiệu hoá thì hồ sơ đổi tay và không còn hồ sơ nào treo`, async () => {
      const hs = await lapVaGui();
      const u = await taoNguoiDung(role);
      const nhan = await idCua(nguoiNhan);

      // Đặt tài khoản dùng một lần vào đúng cột của vai trò ấy.
      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET ${cot(role)} = $1 WHERE code = $2`, [u.id, hs.code]),
      );
      expect(await nguoiGiu(hs.code, role)).toBe(u.id);

      // Thiếu người nhận thì chặn — với MỌI vai trò, không riêng TBP.
      const thieu = await post(`/admin/users/${u.id}/deactivate`, {
        confirmUsername: u.username,
      });
      expect(thieu.status, `${role}: ${JSON.stringify(thieu.body)}`).toBe(422);
      expect(thieu.body.code).toBe('SUCCESSOR_REQUIRED');
      expect((await doc(u.id)).isActive, `${role} không được vô hiệu hoá khi chưa bàn giao`).toBe(
        true,
      );

      // Chọn đúng người thì chuyển được.
      const r = await post(`/admin/users/${u.id}/deactivate`, {
        confirmUsername: u.username,
        successorId: nhan,
      });
      expect(r.status, `${role}: ${JSON.stringify(r.body)}`).toBe(200);
      expect(await nguoiGiu(hs.code, role)).toBe(nhan);
      expect((await doc(u.id)).isActive).toBe(false);

      // Nhật ký của chính hồ sơ có vết.
      expect((await nhatKy(hs.code)).some((x) => x.action === 'HANDOVER')).toBe(true);

      // Bất biến: không còn hồ sơ CHƯA KẾT THÚC nào trỏ tới tài khoản đã khoá.
      const treo = await withAdminDb(async (c) => {
        const x = await c.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pol.policy
            WHERE status::text <> ALL($2::text[])
              AND (tdv_user_id = $1 OR tbp_user_id = $1
                   OR ke_toan_user_id = $1 OR sale_admin_user_id = $1)`,
          [u.id, ['HET_HIEU_LUC', 'DA_XOA']],
        );
        return Number(x.rows[0]!.n);
      });
      expect(treo, `${role}: còn hồ sơ treo lại`).toBe(0);
    });
  }

  for (const role of ['BAN_LANH_DAO', 'QUAN_TRI'] as const) {
    it(`${role}: không cầm hồ sơ nào nên vô hiệu hoá thẳng, không hỏi người nhận`, async () => {
      // Hai vai trò này đứng ngoài luồng duyệt — một bên chỉ đọc, một bên quản
      // trị. Đòi người nhận bàn giao ở đây là bắt người quản trị trả lời một câu
      // hỏi không có nghĩa.
      const u = await taoNguoiDung(role);
      const xt = await get(`/admin/users/${u.id}/ban-giao`);
      expect(xt.status).toBe(200);
      expect(xt.body.count).toBe(0);

      const r = await post(`/admin/users/${u.id}/deactivate`, {
        confirmUsername: u.username,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.handedOver).toBe(0);
      expect((await doc(u.id)).isActive).toBe(false);
    });
  }

  // --- Khách hàng đi cùng hồ sơ (`0032`) -------------------------------------

  const khachCua = (userId: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cus.customer WHERE tdv_user_id = $1`,
        [userId],
      );
      return Number(r.rows[0]!.n);
    });

  /** Một khách hàng do `tdv01` lập, rồi gán sang tài khoản dùng một lần. */
  const khachCuaAi = async (userId: string): Promise<string> => {
    const kh = await (await http(customer))
      .post('/customers')
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({
        code: uniq('KH'),
        name: 'Nha thuoc ban giao',
        customerType: 1,
        province: 'Hà Nội',
      streetWard: 'Hà Nội',
        ownerName: 'Chu ho',
        // `0104` — gửi duyệt đòi đủ MST và chức danh, nên khách hàng
        // của bộ test phải giống khách hàng thật.
        ownerTitle: 'Chu ho',
        idNumber: mstDuyNhat(), phone: '0900000000' });
    expect(kh.status, JSON.stringify(kh.body)).toBe(201);
    await withAdminDb((c) =>
      c.query(`UPDATE cus.customer SET tdv_user_id = $1 WHERE id = $2`, [userId, kh.body.id]),
    );
    return kh.body.id as string;
  };

  it('TDV chỉ có KHÁCH HÀNG, không hồ sơ nào — vẫn phải chọn người nhận', async () => {
    // Đây là ca dễ mồ côi nhất và là chỗ bản đầu của `0032` để lọt: điều kiện
    // "cần người nhận" chỉ đếm hồ sơ, nên một TDV có 5 khách mà chưa lập hồ sơ
    // nào thì vô hiệu hoá thẳng được — và 5 khách ấy trỏ vào tài khoản đã khoá,
    // không TDV nào khác thấy, không hồ sơ nào dẫn tới chúng.
    const u = await taoNguoiDung('TDV');
    await khachCuaAi(u.id);

    const xt = await get(`/admin/users/${u.id}/ban-giao`);
    expect(xt.status).toBe(200);
    expect(xt.body.count).toBe(0);
    expect(xt.body.customerCount).toBe(1);

    const thieu = await post(`/admin/users/${u.id}/deactivate`, {
      confirmUsername: u.username,
    });
    expect(thieu.status, JSON.stringify(thieu.body)).toBe(422);
    expect(thieu.body.code).toBe('SUCCESSOR_REQUIRED');
    expect((await doc(u.id)).isActive).toBe(true);
  });

  it('khách hàng chuyển CÙNG hồ sơ sang đúng TDV nhận bàn giao', async () => {
    const hs = await lapVaGui();
    const u = await taoNguoiDung('TDV');
    const nhan = await idCua('tdv01');
    const khId = await khachCuaAi(u.id);
    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET tdv_user_id = $1 WHERE code = $2`, [u.id, hs.code]),
    );
    expect(await khachCua(u.id)).toBe(1);

    const r = await post(`/admin/users/${u.id}/deactivate`, {
      confirmUsername: u.username,
      successorId: nhan,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.handedOver).toBeGreaterThanOrEqual(1);
    expect(r.body.customersHandedOver).toBe(1);

    // Cả hai vế đều sang người mới.
    expect(await nguoiGiu(hs.code, 'TDV')).toBe(nhan);
    expect(await khachCua(u.id)).toBe(0);
    const chu = await withAdminDb(async (c) => {
      const x = await c.query<{ v: string }>(
        `SELECT tdv_user_id AS v FROM cus.customer WHERE id = $1`,
        [khId],
      );
      return x.rows[0]!.v;
    });
    expect(chu).toBe(nhan);
  });

  it('khách hàng CHƯA CÓ HỒ SƠ nào cũng chuyển', async () => {
    // `policy` chỉ biết khách hàng CÓ hồ sơ, nên nếu việc chuyển khách nhờ policy
    // làm hộ thì đúng loại khách này bị bỏ lại. identity gọi thẳng `customer`
    // chính là vì thế.
    const u = await taoNguoiDung('TDV');
    const nhan = await idCua('tdv01');
    await khachCuaAi(u.id);
    await khachCuaAi(u.id);

    const r = await post(`/admin/users/${u.id}/deactivate`, {
      confirmUsername: u.username,
      successorId: nhan,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.handedOver).toBe(0);
    expect(r.body.customersHandedOver).toBe(2);
    expect(await khachCua(u.id)).toBe(0);
  });

  it('vai trò KHÔNG phải TDV thì không có khách nào để chuyển', async () => {
    // `cus.customer.tdv_user_id` chỉ trỏ vào TDV. Đi hỏi `customer` cho một
    // Trưởng bộ phận là hỏi một câu không có nghĩa.
    const u = await taoNguoiDung('TBP');
    const xt = await get(`/admin/users/${u.id}/ban-giao`);
    expect(xt.body.customerCount).toBe(0);
  });

  it('KHÔNG khách hàng nào còn trỏ vào tài khoản đã vô hiệu hoá', async () => {
    // Bất biến song song với bất biến về hồ sơ, và cùng một lý do: một hàng dữ
    // liệu trỏ vào tài khoản đã khoá là một hàng không ai còn nhìn thấy.
    const u = await taoNguoiDung('TDV');
    const nhan = await idCua('tdv01');
    await khachCuaAi(u.id);
    await post(`/admin/users/${u.id}/deactivate`, {
      confirmUsername: u.username,
      successorId: nhan,
    });
    expect(await khachCua(u.id), 'còn khách hàng mồ côi').toBe(0);
  });

  it('bật lại tài khoản KHÔNG cần gõ tên hay chọn ai', async () => {
    // Bật lại không làm hồ sơ nào kẹt, nên không có lý do gì để hỏi thêm.
    const u = await taoNguoiDung('SALE_ADMIN');
    await post(`/admin/users/${u.id}/deactivate`, { confirmUsername: u.username });
    expect((await doc(u.id)).isActive).toBe(false);
    expect((await batLai(u.id)).status).toBe(200);
    expect((await doc(u.id)).isActive).toBe(true);
  });

  it('vai trò khác Quản trị không vô hiệu hoá được ai', async () => {
    const u = await taoNguoiDung('TDV');
    for (const who of ['tdv01', 'kt01', 'tbp01', 'sa01', 'bld01']) {
      const r = await post(
        `/admin/users/${u.id}/deactivate`,
        { confirmUsername: u.username },
        who,
      );
      expect(r.status, `${who} đáng lẽ bị chặn`).toBe(403);
    }
    expect((await doc(u.id)).isActive).toBe(true);
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
