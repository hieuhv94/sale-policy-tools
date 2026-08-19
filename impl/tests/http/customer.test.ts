/**
 * CUST-01 … CUST-17 — khách hàng do TDV tạo (YCNV muc 6.1).
 *
 * Hai service chạy thật cùng lúc: customer gọi identity để giải phạm vi dữ
 * liệu. Không có bản giả nào — đường token dịch vụ giữa các service được chạy
 * qua trong mọi test.
 *
 * Từ `0026` customer KHÔNG còn gọi catalog: ba mã phân loại (tỉnh · bệnh viện ·
 * kênh) đã rời khỏi phần mềm, và chúng là thứ duy nhất customer từng hỏi sang.
 *
 * CHƯA PHỦ: CUST-11 và CUST-12 (tải và kiểm file hồ sơ pháp lý). File do service
 * `document` giữ trên MinIO, service đó thuộc chặng P6.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createCustomerApp } from '@csbh/customer/testing';
import {
  accessTokenFor,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  http,
  withAdminDb,
  bootPolicyListening,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZCUS';

let identity: INestApplication;
let app: INestApplication;
let policyApp: INestApplication;
let restorePolicy: (() => void) | undefined;
let restoreIdentity: () => void;
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
    // Gỡ nhãn kết thúc TRƯỚC khi xoá: trigger `trg_forbid_delete_rejected` chặn
    // xoá hồ sơ ở CẢ HAI trạng thái kết thúc (YCNV muc 4 và `DA_XOA` từ `0035`),
    // và tệp này cố ý dựng ra hồ sơ như vậy để kiểm nhánh "đã kết thúc" của việc
    // ngừng hợp tác.
    await c.query(
      `UPDATE pol.policy SET status = 'NHAP'
        WHERE code LIKE $1 AND status::text IN ('TU_CHOI', 'DA_XOA')`,
      [`${P}%`],
    );
    await c.query(`DELETE FROM pol.policy WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cus.outbox`);
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
  });

beforeAll(async () => {
  await cleanup();
  const idn = await bootIdentityListening();
  identity = idn.app;
  restoreIdentity = idn.restore;

  await clearAccountCache();
  await clearScopeCache();
  app = await createCustomerApp();
  // `0034`: ngừng hợp tác hỏi `policy` xem khách còn hồ sơ nào đang chờ, và
  // FAIL CLOSED nếu không hỏi được. Tệp này phải dựng policy dù nó kiểm về
  // khách hàng.
  const po = await bootPolicyListening();
  policyApp = po.app;
  restorePolicy = po.restore;

  for (const u of ['tdv01', 'tdv02', 'kt01', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }
});

afterAll(async () => {
  await policyApp?.close();
  restorePolicy?.();
  await app?.close();
  await identity?.close();
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

/**
 * CUST-08 cũ — ba mã phân loại phải có trong danh mục. Luật ấy mất hiệu lực ở
 * `0026` cùng với chính ba trường: ngưỡng chiết khấu chỉ còn khớp theo nhóm sản
 * phẩm × loại khách hàng, và không chỗ nào khác trong phần mềm đọc tới chúng.
 *
 * Cái còn phải giữ là ĐƯỜNG CŨ KHÔNG GÃY: một biểu mẫu chưa kịp cập nhật gửi
 * kèm `provinceCode` thì khách hàng vẫn lập được, chỉ là trường ấy rơi mất.
 */
describe('0026 ba trường phân loại đã rời khỏi khách hàng', () => {
  it('gửi kèm provinceCode vẫn tạo được, và trường ấy không quay về', async () => {
    const r = await post('/customers', base({ provinceCode: 'HN', channelCode: 'NHA-THUOC' }));
    expect(r.status).toBe(201);
    expect(r.body.provinceCode).toBeUndefined();
    expect(r.body.channelCode).toBeUndefined();
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

  it('Quản trị hệ thống thì đổi được (`0031`)', async () => {
    // Quyền này chuyển từ Sale Admin sang Quản trị hệ thống. Rà lại thì KHÔNG
    // yêu cầu nghiệp vụ nào cấp nó cho Sale Admin — YCNV §6.1 chỉ nói "khách
    // hàng do TDV tạo", §2.5 liệt kê bảy đầu việc của Sale Admin mà không có
    // việc giao khách. Căn cứ duy nhất của lựa chọn cũ là Sale Admin đứng ở gốc
    // nhánh cây chứa TDV đó, và cây ấy đã bị gỡ.
    //
    // Quản trị hệ thống thay vào vì đây là vế sau của một việc hành chính họ đã
    // làm: vô hiệu hoá tài khoản TDV nghỉ việc rồi chuyển khách của người đó.
    const c = await post('/customers', base());
    const tdv02Id = await withAdminDb(async (x) => {
      const q = await x.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'tdv02'`,
      );
      return q.rows[0]!.id;
    });
    const r = await patch(`/customers/${c.body.id}`, { tdvUserId: tdv02Id }, 'admin01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.tdvUserId).toBe(tdv02Id);
  });

  it('Sale Admin KHÔNG còn đổi được', async () => {
    const c = await post('/customers', base());
    const r = await patch(`/customers/${c.body.id}`, { tdvUserId: c.body.tdvUserId }, 'sa01');
    // 403 vì phạm vi (chưa có hồ sơ nào giao cho họ) — chặn sớm hơn cả phép kiểm
    // quyền, và đó là đúng thứ tự: không nói cho người ngoài phạm vi biết gì.
    expect(r.status).toBe(403);
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

  it('kt01 KHÔNG thấy khách chưa có hồ sơ nào giao cho mình (`0031`)', async () => {
    // Đảo ngược hoàn toàn so với bản cũ, và đây là thay đổi CÓ CHỦ Ý.
    //
    // Trước đây kt01 thấy mọi khách của mọi TDV dưới nhánh cây của mình — kể cả
    // khách vừa lập xong, chưa có hồ sơ nào. Giờ quyền xem khách hàng đi kèm
    // việc được giao một CSBH của khách ấy; chưa được giao thì chưa thấy.
    const c = await post('/customers', base());
    expect((await get(`/customers/${c.body.id}`, 'kt01')).status).toBe(403);
  });

  it('Quản trị hệ thống thấy MỌI khách — để còn đổi được TDV phụ trách', async () => {
    // Ngoại lệ có chủ ý: phạm vi hồ sơ của Quản trị rỗng theo thiết kế, nhưng
    // khách cần chuyển khi một TDV nghỉ việc thường là khách CHƯA có hồ sơ nào,
    // tức không đường nào khác với tới. Không mở đường này thì chức năng đổi TDV
    // phụ trách không dùng được, và những khách đó không còn ai nhìn thấy.
    const c = await post('/customers', base());
    expect((await get(`/customers/${c.body.id}`, 'admin01')).status).toBe(200);
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

describe('`0034` CUST-16 ngừng hợp tác — một nút thay cho hai', () => {
  /*
   * Khối này thay `CUST-16 xoá khách hàng đã có hồ sơ CSBH` cũ (2 ca).
   *
   * Bản cũ kiểm một thao tác `DELETE` thuần: có hồ sơ thì 409, không có thì xoá.
   * Nó bỏ ngỏ đúng tình huống hay gặp nhất — khách hàng NGỪNG GIAO DỊCH — vì
   * `cus.customer` khi ấy không có cột trạng thái nào, nên khách đã có hồ sơ thì
   * nằm mãi trong danh sách và CSBH của họ "Đang có hiệu lực" vĩnh viễn.
   *
   * Giờ MỘT thao tác, MỘT điều kiện (không hồ sơ nào đang chờ), và hệ thống tự
   * chọn kết cục theo lịch sử của khách.
   */
  const idTdv = (u: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ id: string }>(`SELECT id FROM idn.app_user WHERE username = $1`, [
        u,
      ]);
      return r.rows[0]!.id;
    });

  /** Cắm một hồ sơ ở trạng thái bất kỳ cho khách này. */
  const themHoSo = async (customerId: string, status: string): Promise<string> => {
    const code = `${P}-HS-${Math.random().toString(36).slice(2, 10)}`;
    await withAdminDb((x) =>
      x.query(
        `INSERT INTO pol.policy (code, customer_id, status, tdv_user_id)
         VALUES ($1,$2,$3::pol.policy_status,$4)`,
        [code, customerId, status, tok['tdv01'] ? null : null],
      ),
    );
    return code;
  };

  const trangThaiKhach = (id: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ s: string }>(
        `SELECT status::text AS s FROM cus.customer WHERE id = $1`,
        [id],
      );
      return r.rows[0]?.s ?? null;
    });

  const trangThaiHoSo = (code: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ s: string }>(
        `SELECT status::text AS s FROM pol.policy WHERE code = $1`,
        [code],
      );
      return r.rows[0]?.s ?? null;
    });

  // --- Nhánh CHẶN -----------------------------------------------------------

  for (const st of [
    'NHAP',
    'YEU_CAU_CHINH_SUA',
    'CHO_TBP_DUYET',
    'CHO_KT_L1',
    'SA_DANG_XU_LY',
    'CHO_KT_L2',
    'QUA_HAN_DUYET',
  ]) {
    it(`còn hồ sơ ở ${st} thì CHẶN, và khách vẫn nguyên trạng`, async () => {
      // Kể cả `NHAP`: bản nháp chưa chờ ai duyệt, nhưng nó vẫn là việc đang dở
      // của chính người lập. Ngừng hợp tác khi còn nháp là để lại một hồ sơ trỏ
      // vào khách hàng không còn giao dịch.
      const c = await post('/customers', base());
      const code = await themHoSo(c.body.id as string, st);

      const r = await del(`/customers/${c.body.id}`);
      expect(r.status, `${st}: ${JSON.stringify(r.body)}`).toBe(409);
      expect(r.body.code).toBe('CUSTOMER_HAS_PENDING_POLICY');
      expect((r.body.policies as { code: string }[]).some((x) => x.code === code)).toBe(true);

      expect(await trangThaiKhach(c.body.id as string)).toBe('DANG_HOP_TAC');
      expect(await trangThaiHoSo(code)).toBe(st);
    });
  }

  // --- Nhánh XOÁ HẲN --------------------------------------------------------

  it('chưa có hồ sơ nào thì XOÁ HẲN dòng', async () => {
    // Đây là ca lập nhầm: gõ sai mã KH, tạo trùng, chọn nhầm loại khách. Một bản
    // ghi như thế bị "ngừng hợp tác" sẽ nằm lại trong mọi danh sách mãi mãi.
    const c = await post('/customers', base());
    const r = await del(`/customers/${c.body.id}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.deleted).toBe(true);
    expect(await trangThaiKhach(c.body.id as string)).toBeNull();
  });

  // --- Nhánh GIỮ LẠI --------------------------------------------------------

  it('có CSBH đang hiệu lực: khách GIỮ LẠI, hồ sơ chuyển HẾT HIỆU LỰC', async () => {
    const c = await post('/customers', base());
    const code = await themHoSo(c.body.id as string, 'DANG_CO_HIEU_LUC');

    const r = await del(`/customers/${c.body.id}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.deleted).toBe(false);
    expect(r.body.expired).toBe(1);

    expect(await trangThaiKhach(c.body.id as string)).toBe('NGUNG_HOP_TAC');
    expect(await trangThaiHoSo(code)).toBe('HET_HIEU_LUC');
  });

  it('không thể có HAI CSBH hiệu lực để mà phải hết hiệu lực cả hai', async () => {
    // Ca này ban đầu tôi viết là "nhiều CSBH hiệu lực thì hết hiệu lực tất cả",
    // và nó KHÔNG dựng được: `uq_policy_active_per_customer` là một unique index
    // riêng phần, chặn ngay ở tầng CSDL, và tắt trigger không tắt được index.
    //
    // Giữ lại ca này để nói ra điều đó. Vòng lặp trong `ngung-hop-tac.controller`
    // vẫn viết theo kiểu nhiều dòng — đúng, vì nó đọc từ một câu truy vấn trả về
    // tập hợp — nhưng bất biến thật nằm ở đây, và nếu ai gỡ index kia thì ca này
    // đỏ trước khi hồ sơ hỏng.
    const c = await post('/customers', base());
    await themHoSo(c.body.id as string, 'DANG_CO_HIEU_LUC');
    await expect(themHoSo(c.body.id as string, 'DANG_CO_HIEU_LUC')).rejects.toMatchObject({
      constraint: 'uq_policy_active_per_customer',
    });
  });

  // `DA_XOA` nằm trong danh sách này từ `0035`, và đó là nửa quan trọng của việc
  // thêm một trạng thái kết thúc: quên nó ở `KET_THUC` thì hồ sơ người lập đã tự
  // bỏ vẫn bị đếm là "đang chờ", nên khách hàng không xoá được nữa — mà cũng
  // không thao tác nào đưa hồ sơ đó đi tiếp được. Một ngõ cụt kín.
  for (const st of ['TU_CHOI', 'HET_HIEU_LUC', 'DA_XOA']) {
    it(`chỉ có hồ sơ ${st} (đã kết thúc): giữ lại khách, KHÔNG hết hiệu lực gì`, async () => {
      const c = await post('/customers', base());
      const code = await themHoSo(c.body.id as string, st);

      const r = await del(`/customers/${c.body.id}`);
      expect(r.status, `${st}: ${JSON.stringify(r.body)}`).toBe(200);
      expect(r.body.deleted, 'còn hồ sơ thì không xoá dòng khách').toBe(false);
      expect(r.body.expired).toBe(0);
      expect(await trangThaiKhach(c.body.id as string)).toBe('NGUNG_HOP_TAC');
      expect(await trangThaiHoSo(code)).toBe(st);
    });
  }

  it('ghi vết vào nhật ký CỦA CHÍNH HỒ SƠ', async () => {
    const c = await post('/customers', base());
    const code = await themHoSo(c.body.id as string, 'DANG_CO_HIEU_LUC');
    await del(`/customers/${c.body.id}`);

    const nk = await withAdminDb(async (x) => {
      const r = await x.query<{ action: string; reason: string; from_status: string; to_status: string }>(
        `SELECT e.action, e.reason, e.from_status::text, e.to_status::text
           FROM pol.policy_event e JOIN pol.policy p ON p.id = e.policy_id
          WHERE p.code = $1`,
        [code],
      );
      return r.rows;
    });
    const dong = nk.find((x) => x.action === 'CUSTOMER_RETIRED');
    expect(dong, 'phải có dòng CUSTOMER_RETIRED').toBeDefined();
    expect(dong!.from_status).toBe('DANG_CO_HIEU_LUC');
    expect(dong!.to_status).toBe('HET_HIEU_LUC');
    // KHÁC `policy.superseded`: ở đây không có bản mới nào thay thế.
    expect(dong!.reason).toContain('ngừng hợp tác');
  });

  // --- Quyền -----------------------------------------------------------------

  it('ngừng hai lần thì 409', async () => {
    const c = await post('/customers', base());
    await themHoSo(c.body.id as string, 'HET_HIEU_LUC');
    expect((await del(`/customers/${c.body.id}`)).status).toBe(200);
    const lai = await del(`/customers/${c.body.id}`);
    expect(lai.status).toBe(409);
    expect(lai.body.code).toBe('CUSTOMER_ALREADY_RETIRED');
  });

  it('TDV KHÁC không ngừng được, dù cùng vai trò', async () => {
    // Chặt hơn phạm vi đọc: quyết định về quan hệ với khách hàng thuộc người
    // phụ trách họ, không thuộc bất kỳ ai nhìn thấy được họ.
    const c = await post('/customers', base());
    const r = await del(`/customers/${c.body.id}`, 'tdv02');
    expect(r.status).toBe(403);
    expect(await trangThaiKhach(c.body.id as string)).toBe('DANG_HOP_TAC');
  });

  it('bốn vai trò còn lại và cả Quản trị đều KHÔNG ngừng được', async () => {
    // Quản trị thấy MỌI khách hàng (`0031`) và đổi được TDV phụ trách — nhưng
    // ngừng hợp tác là quyết định nghiệp vụ, không phải việc hành chính.
    const c = await post('/customers', base());
    for (const who of ['kt01', 'sa01', 'bld01', 'admin01']) {
      const r = await del(`/customers/${c.body.id}`, who);
      expect(r.status, `${who} đáng lẽ bị chặn`).toBe(403);
    }
    expect(await trangThaiKhach(c.body.id as string)).toBe('DANG_HOP_TAC');
  });

  // --- Sau khi ngừng ---------------------------------------------------------

  it('khách đã ngừng BIẾN KHỎI ô chọn lập hồ sơ, nhưng VẪN trong danh sách thường', async () => {
    // Hai câu khác nhau: ô chọn phải sạch, còn danh sách tra cứu thì không —
    // hồ sơ cũ của họ phải tra lại được, và một khách biến mất hẳn khỏi mọi màn
    // hình là một khách không ai đối chiếu được nữa.
    const c = await post('/customers', base());
    await themHoSo(c.body.id as string, 'HET_HIEU_LUC');
    await del(`/customers/${c.body.id}`);

    const chon = (await get('/customers?limit=200&forNewPolicy=true')).body.items as {
      id: string;
    }[];
    expect(chon.map((x) => x.id)).not.toContain(c.body.id);

    const thuong = (await get('/customers?limit=200')).body.items as { id: string }[];
    expect(thuong.map((x) => x.id)).toContain(c.body.id);
  });

  it('xem trước nói đúng ba con số TRƯỚC khi bấm', async () => {
    const c = await post('/customers', base());
    await themHoSo(c.body.id as string, 'DANG_CO_HIEU_LUC');
    const r = await get(`/customers/${c.body.id}/ngung-hop-tac`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.seXoaHan).toBe(false);
    expect(r.body.dangCho).toEqual([]);
    expect(r.body.dangHieuLuc).toHaveLength(1);
  });

  it('xem trước với khách chưa có hồ sơ nói rõ là sẽ XOÁ HẲN', async () => {
    const c = await post('/customers', base());
    const r = await get(`/customers/${c.body.id}/ngung-hop-tac`);
    expect(r.body.seXoaHan).toBe(true);
  });

  it('xem trước cũng chỉ TDV phụ trách gọi được', async () => {
    const c = await post('/customers', base());
    expect((await get(`/customers/${c.body.id}/ngung-hop-tac`, 'tdv02')).status).toBe(403);
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

/**
 * 0023 — loại khách hàng SỬA ĐƯỢC.
 *
 * Trước đây chỉ đặt được lúc lập, vì nó quyết định ngưỡng chiết khấu. Lý do ấy
 * không đủ: khách hàng có đổi hạng thật, và cách duy nhất còn lại là lập một
 * khách hàng mới với mã mới — tức là cắt đôi lịch sử CSBH của cùng một khách.
 */
describe('0023 sửa loại khách hàng', () => {
  it('đổi được từ loại 1 sang loại 3', async () => {
    const kh = await post('/customers', base({ customerType: 1 }));
    expect(kh.status).toBe(201);

    const r = await patch(`/customers/${kh.body.id}`, { customerType: 3 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.customerType).toBe(3);
    expect((await get(`/customers/${kh.body.id}`)).body.customerType).toBe(3);
  });

  it('giá trị ngoài 1..3 thì 400, và KHÔNG ghi gì', async () => {
    const kh = await post('/customers', base({ customerType: 2 }));
    const r = await patch(`/customers/${kh.body.id}`, { customerType: 4 });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('customerType');
    expect((await get(`/customers/${kh.body.id}`)).body.customerType).toBe(2);
  });

  it('không gửi trường này thì loại GIỮ NGUYÊN', async () => {
    // `coalesce($n, customer_type)` — sửa tên không được kéo theo loại về mặc
    // định. Giao diện cũng chỉ gửi trường này khi ô thật sự đổi giá trị.
    const kh = await post('/customers', base({ customerType: 3 }));
    const r = await patch(`/customers/${kh.body.id}`, { name: 'Ten moi' });
    expect(r.status).toBe(200);
    expect(r.body.customerType).toBe(3);
    expect(r.body.name).toBe('Ten moi');
  });

  it('danh sách khách hàng trả kèm loại — màn hình cần nó để hiện', async () => {
    const kh = await post('/customers', base({ customerType: 2 }));
    const ds = await get('/customers?limit=200');
    const co = (ds.body.items as { id: string; customerType: number }[]).find(
      (x) => x.id === kh.body.id,
    );
    expect(co?.customerType).toBe(2);
  });

  it('đổi loại đi vào nhật ký kèm giá trị TRƯỚC và SAU', async () => {
    // CUST-15. Không có dòng này thì sáu tháng sau không ai trả lời được vì sao
    // khách này từng lấy ngưỡng của loại 1.
    const kh = await post('/customers', base({ customerType: 1 }));
    await patch(`/customers/${kh.body.id}`, { customerType: 2 });
    const ev = await withAdminDb(async (c) => {
      const r = await c.query<{ payload: { before: { customerType: number }; after: { customerType: number } } }>(
        `SELECT payload FROM cus.outbox WHERE routing_key = 'customer.changed'
           AND payload->>'id' = $1 ORDER BY created_at DESC LIMIT 1`,
        [kh.body.id],
      );
      return r.rows[0]?.payload;
    });
    expect(ev?.before.customerType).toBe(1);
    expect(ev?.after.customerType).toBe(2);
  });
});
