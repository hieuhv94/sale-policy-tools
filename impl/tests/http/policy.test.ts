/**
 * POL-01 … POL-19, WF-01 … WF-28, EFF-01 … EFF-13 — hồ sơ CSBH và luồng duyệt.
 *
 * Bốn service chạy thật cùng lúc: identity, catalog, customer nghe trên cổng
 * ngẫu nhiên, policy gọi cả ba bằng HTTP với token dịch vụ.
 *
 * PHÂN CÔNG với các file test khác: ở đây khẳng định tới lớp mà `policy` thật
 * sự chịu trách nhiệm — sự kiện outbox và con trỏ file. Phần EMAIL của
 * WF-01/04/28 (số thư trong Mailpit) nằm ở `notification.test.ts`; phần FILE
 * của WF-13/18/21 (object trên MinIO) thuộc `document`, chặng P6b.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp as createPolicyApp,
  CatalogImpactConsumer,
  Clients,
  TRUONG_CHAN_LUC_GUI,
  CHUA_DUYET_XONG,
  UQ_DANG_DO,
} from '@csbh/policy/testing';
import { NHOM_TRUONG } from '@csbh/document/testing';
// `0180` — CÙNG hàm mà máy chủ dùng để điền mặc định, không phải một bản chép.
// Bản chép sẽ xanh mười bảy giờ mỗi ngày và đỏ bảy giờ còn lại (`0128`).
import { mintServiceToken, ngayVN } from '@csbh/http-kit';
import { rate2ToNumeric, TINH_NANG, TINH_NANG_MAC_DINH } from '@csbh/domain-policy';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  maDuyNhat,
  http,
  withAdminDb,
  phanCongMacDinh,
  idNguoiDung,
  mstDuyNhat,
} from './app.js';


const SEED_PW = 'Test@1234';
const P = 'ZZPOL';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let app: INestApplication;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const post = async (path: string, body: object, who = 'tdv01') =>
  (await http(app)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const patch = async (path: string, body: object, who = 'tdv01') =>
  (await http(app)).patch(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const get = async (path: string, who = 'tdv01') =>
  (await http(app)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const del = async (path: string, who = 'tdv01') =>
  (await http(app)).delete(path).set('Authorization', `Bearer ${tok[who]}`);

/**
 * MỌI hành động đi qua đây tự kèm người được phân công (`0031`).
 *
 * Xem `phanCongMacDinh`. Ca nào quan tâm tới người cụ thể thì truyền trong
 * `body` — nó nằm sau nên ghi đè mặc định.
 */
const act = async (policyId: string, action: string, who: string, body: object = {}) =>
  post(`/policies/${policyId}/actions/${action}`, { ...(await phanCongMacDinh(action)), ...body }, who);

const uniq = (k: string) => maDuyNhat(P, k);

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';
const products: string[] = [];

/** Sản phẩm có Giá bán Công ty 100.000. Ngưỡng 15,00% đến từ quy định của nhóm. */
const makeProduct = async (): Promise<string> => {
  const c = await http(catalog);
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('SP'), name: 'Nutricare Gold', groupCode, price: '100000' });
  await c
    .post(`/catalog/products/${r.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
  products.push(r.body.id);
  return r.body.id as string;
};

const makeCustomer = async (who = 'tdv01'): Promise<string> => {
  const c = await http(customer);
  const r = await c
    .post('/customers')
    .set('Authorization', `Bearer ${tok[who]}`)
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
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return r.body.id as string;
};

const line = (productId: string, over: Record<string, unknown> = {}) => ({
  productId,
  wholesalePrice: '90000',
  cpbh: ['5000'],
  ...over,
});

/**
 * Hồ sơ Nháp có một dòng sản phẩm, sẵn sàng gửi duyệt.
 *
 * `ngayApDung` (`0180`) đi vào DÒNG chứ không vào hồ sơ — không còn ngày nào ở
 * cấp hồ sơ để mà khai.
 */
const draft = async (
  opts: { customerId?: string; productId?: string; ngayApDung?: string } = {},
) => {
  const customerId = opts.customerId ?? (await makeCustomer());
  const productId = opts.productId ?? (await makeProduct());
  const r = await post('/policies', {
    customerId,
    lines: [line(productId, opts.ngayApDung ? { ngayApDung: opts.ngayApDung } : {})],
  });
  if (r.status !== 201) throw new Error(`tạo hồ sơ hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, customerId, productId, body: r.body };
};

/** Chạy hết luồng 10 bước tới Đang có hiệu lực. */
const runToActive = async (d: { id: string }) => {
  expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
  expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
  expect(
    (
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
        'sa01',
      )
    ).status,
  ).toBe(201);
      // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
        'sa01',
      );
  expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
  const last = await act(d.id, 'KT_RECEIVE_L2', 'kt01');
  expect(last.status).toBe(200);
  return last;
};

const outboxFor = (policyId: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ routing_key: string; payload: Record<string, unknown> }>(
      // ORDER BY seq chứ không phải created_at: sự kiện phát trong cùng một
      // transaction có created_at giống hệt nhau (now() = thời điểm bắt đầu
      // transaction), nên thứ tự theo thời gian là tuỳ ý.
      `SELECT routing_key, payload FROM pol.outbox
        WHERE payload->>'policyId' = $1 ORDER BY seq`,
      [policyId],
    );
    return r.rows;
  });

const cleanup = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM pol.outbox`);
    // Hồ sơ DA_XOA không xoá được nên phải tắt trigger — chỉ làm trong dọn dẹp test.
    await c.query(`ALTER TABLE pol.policy DISABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(
      `DELETE FROM pol.policy WHERE customer_id IN
         (SELECT id FROM cus.customer WHERE code LIKE $1)`,
      [`${P}%`],
    );
    await c.query(`ALTER TABLE pol.policy ENABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.outbox`);
  });

beforeAll(async () => {
  await cleanup();
  const idn = await bootIdentityListening();
  identity = idn.app;
  restores.push(idn.restore);
  const cat = await bootCatalogListening();
  catalog = cat.app;
  restores.push(cat.restore);
  const cus = await bootCustomerListening();
  customer = cus.app;
  restores.push(cus.restore);

  await clearAccountCache();
  await clearScopeCache();
  app = await createPolicyApp();

  for (const u of ['tdv01', 'tdv02', 'tbp01', 'tbp02', 'kt01', 'kt02', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }

  groupCode = uniq('NHOM');
  const dm = await http(catalog);
  await dm
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: groupCode, name: 'Nhom thu nghiem' });

  // MỘT quy định chiết khấu 15% cho cả nhóm.
  //
  // Trước `0025` con số ấy đến từ ba cột ngưỡng mặc định trên từng sản phẩm. Ba
  // cột đó đã bỏ — bảng quy định là nguồn duy nhất — nên nền của cả tệp test
  // này phải khai một quy định, đúng như người dùng thật sẽ phải làm.
  const r = await dm
    .post('/catalog/discount-rules')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      code: uniq('CK'),
      productGroupCode: groupCode,
      effectiveFrom: '2020-01-01',
      thresholdRate2: 1500,
    });
  if (r.status !== 201) throw new Error(`khai quy định hỏng: ${JSON.stringify(r.body)}`);
});

afterAll(async () => {
  await app?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
  await cleanup();
});

// =============================================================================
// POL — lập hồ sơ
// =============================================================================

describe('POL-01 · POL-03 lập hồ sơ', () => {
  it('201, trạng thái Nháp, mã hồ sơ tự sinh', async () => {
    const d = await draft();
    expect(d.body.status).toBe('NHAP');
    expect(d.body.code).toMatch(/^CSBH-\d{4}-\d{6}$/);
    expect(d.body.versionNo).toBe(1);
    expect(d.body.lines).toHaveLength(1);
  });

  it('khách hàng chưa có CSBH nào thì tạo thẳng, không hỏi bổ sung hay chỉnh sửa', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(201);
    expect(r.body.supersedesId).toBeNull();
  });

  it('tính đúng CPBH tổng, giá thu về và tỷ lệ chiết khấu', async () => {
    const d = await draft();
    const l = d.body.lines[0];
    expect(l.companyPrice).toBe('100000');
    expect(l.cpbhTotal).toBe('5000');
    expect(l.netPrice).toBe('85000'); // 90.000 − 5.000
    expect(l.discountRate).toBe('15.00'); // (100.000 − 85.000) / 100.000
    expect(l.overThreshold).toBe(false); // 15,00% không lớn hơn ngưỡng 15,00%
  });
});

describe('POL-02 không trùng sản phẩm trong một hồ sơ', () => {
  it('thêm cùng sản phẩm lần hai thì 409', async () => {
    const d = await draft();
    const r = await post(`/policies/${d.id}/lines`, line(d.productId));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DUPLICATE_PRODUCT');
  });
});

describe('POL-04 … POL-07 bổ sung và chỉnh sửa', () => {
  /*
   * `0180` — POL-04 và POL-06 GỘP LÀM MỘT, chốt 07/09.
   *
   * Hai ca cũ khẳng định hệ thống hỏi HAI câu khác nhau tuỳ lô sản phẩm gửi lên
   * có mặt hàng mới hay không. Khách hàng bỏ sự phân biệt ấy: hai nút *Bổ sung*
   * và *Chỉnh sửa* dẫn tới cùng một việc, nên chỉ còn MỘT câu hỏi.
   *
   * Ca dưới đây giữ nguyên phần đáng giá của POL-04/POL-06 — **hệ thống không tự
   * quyết định thay người dùng** — và ghim câu hỏi đúng từng chữ. Vế "hai câu
   * khác nhau" thì kiểm chiều NGƯỢC LẠI: cùng một câu cho cả hai lô.
   */
  it('POL-04 · POL-06 khách đã có CSBH thì HỎI LẠI — MỘT câu, đúng từng chữ', async () => {
    const d = await draft();
    await runToActive(d);

    const CAU = 'Khách hàng đã có CSBH đang hiệu lực. Bạn có muốn lập phiên bản mới không?';

    // Lô có mặt hàng MỚI…
    const moi = await post('/policies', {
      customerId: d.customerId,
      lines: [line(await makeProduct())],
    });
    expect(moi.status).toBe(409);
    expect(moi.body.code).toBe('NEW_VERSION_REQUIRED');
    expect(moi.body.message).toBe(CAU);
    expect(moi.body.activePolicyId).toBe(d.id);

    // …và lô chỉ SỬA mặt hàng đã có: cùng mã, cùng câu.
    const sua = await post('/policies', {
      customerId: d.customerId,
      lines: [line(d.productId, { wholesalePrice: '80000' })],
    });
    expect(sua.status).toBe(409);
    expect(sua.body.code).toBe('NEW_VERSION_REQUIRED');
    expect(sua.body.message).toBe(CAU);
  });

  it('POL-05 xác nhận rồi thì hồ sơ mới chứa TOÀN BỘ sản phẩm cũ cộng sản phẩm mới', async () => {
    const d = await draft();
    await runToActive(d);
    const moi = await makeProduct();

    const r = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(moi)],
    });
    expect(r.status).toBe(201);
    expect(r.body.versionNo).toBe(2);
    expect(r.body.supersedesId).toBe(d.id);

    const ids = (r.body.lines as { productId: string }[]).map((l) => l.productId).sort();
    expect(ids).toEqual([d.productId, moi].sort());
  });

  it('POL-07 sửa một mặt hàng đã có: hồ sơ mới đầy đủ, giữ liên kết tới bản gốc', async () => {
    const d = await draft();
    await runToActive(d);

    const r = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { wholesalePrice: '80000', cpbh: ['1000'] })],
    });
    expect(r.status).toBe(201);
    expect(r.body.supersedesId).toBe(d.id);
    const l = (r.body.lines as { productId: string; wholesalePrice: string }[])[0];
    expect(l!.wholesalePrice).toBe('80000');
  });

  it('không có CSBH hiệu lực mà gửi mode thì 400', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      mode: 'NEW_VERSION',
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('NO_ACTIVE_POLICY');
  });
});

/**
 * `0186` — RÚT MỘT MẶT HÀNG KHỎI PHIÊN BẢN MỚI (POL-08 đảo, chốt 08/09).
 *
 * Khối này THAY khối `POL-08` cũ chứ không nới nó. Ca cũ khẳng định *"gửi duyệt
 * khi thiếu một sản phẩm thừa kế thì 422"* — một câu về LUẬT, và luật ấy vừa bị
 * khách hàng đảo. Sửa con số 422 thành 200 là giữ lại một ca kiểm không còn
 * canh gì; thứ phải canh bây giờ khác hẳn: dòng bị rút PHẢI NẰM LẠI cho người
 * duyệt thấy, và phải biến mất đúng một lần, đúng lúc.
 */
describe('`0186` rút một mặt hàng khỏi phiên bản mới', () => {
  /** Bản v2 của một khách đã có CSBH hiệu lực, kèm id dòng thừa kế. */
  const v2Voi = async (them?: string) => {
    const d = await draft();
    await runToActive(d);
    const r = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: them ? [line(them)] : [],
    });
    expect(r.status).toBe(201);
    const dongCu = (r.body.lines as { id: string; productId: string }[]).find(
      (l) => l.productId === d.productId,
    )!;
    return { d, v2: r.body.id as string, dongCu };
  };

  const dongCua = async (policyId: string, who = 'tdv01') =>
    (await get(`/policies/${policyId}`, who)).body.lines as {
      id: string;
      productId: string;
      trangThai: string;
      wholesalePrice: string;
    }[];

  it('xoá dòng thừa kế: dòng NẰM LẠI, mang trạng thái Đã xoá', async () => {
    const { v2, dongCu } = await v2Voi(await makeProduct());
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);

    const ds = await dongCua(v2);
    const con = ds.find((l) => l.id === dongCu.id);
    expect(con, 'dòng thừa kế bị xoá hẳn thay vì làm mờ').toBeDefined();
    expect(con!.trangThai).toBe('DA_XOA');
  });

  it('xoá dòng *Bổ sung*: biến mất hẳn, không để lại dòng mờ', async () => {
    const moi = await makeProduct();
    const { v2 } = await v2Voi(moi);
    const dongMoi = (await dongCua(v2)).find((l) => l.productId === moi)!;
    expect(dongMoi.trangThai).toBe('BO_SUNG');

    expect((await del(`/policies/${v2}/lines/${dongMoi.id}`)).status).toBe(200);
    expect((await dongCua(v2)).some((l) => l.id === dongMoi.id)).toBe(false);
  });

  it('gửi duyệt được dù thiếu một sản phẩm thừa kế — POL-08 đã gỡ', async () => {
    const { v2, dongCu } = await v2Voi(await makeProduct());
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);

    const sub = await act(v2, 'SUBMIT', 'tdv01');
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);
  });

  it('rút HẾT mọi dòng thì vẫn không gửi duyệt được (NO_LINES)', async () => {
    /*
     * Dòng đã rút không tính là "hồ sơ có sản phẩm".
     *
     * Không có vế `NOT da_xoa` ở chốt `NO_LINES` thì ca này XANH nhầm: bảng vẫn
     * còn một hàng, hồ sơ đi tới bàn Trưởng bộ phận, và tờ giấy in ra là một
     * bảng sản phẩm rỗng.
     */
    const { v2, dongCu } = await v2Voi();
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);

    const sub = await act(v2, 'SUBMIT', 'tdv01');
    expect(sub.status).toBe(422);
    expect(sub.body.code).toBe('NO_LINES');
  });

  it('thêm lại: dòng quay về đúng trạng thái cũ và NGUYÊN SỐ CŨ', async () => {
    const { v2, dongCu } = await v2Voi(await makeProduct());
    // Sửa trước rồi mới rút: khôi phục là hoàn tác lượt XOÁ, không phải hoàn tác
    // lượt sửa — nếu nó trả dòng về số của bản trước thì nút này làm hai việc.
    expect(
      (await patch(`/policies/${v2}/lines/${dongCu.id}`, { wholesalePrice: '77000' })).status,
    ).toBe(200);
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);

    const r = await post(`/policies/${v2}/lines/${dongCu.id}/khoi-phuc`, {});
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const con = (await dongCua(v2)).find((l) => l.id === dongCu.id)!;
    expect(con.trangThai).toBe('CHINH_SUA');
    expect(con.wholesalePrice).toBe('77000');
  });

  it('xoá một dòng ĐÃ xoá thì 404, không phải 200 im lặng', async () => {
    const { v2, dongCu } = await v2Voi(await makeProduct());
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);

    const lai = await del(`/policies/${v2}/lines/${dongCu.id}`);
    expect(lai.status).toBe(404);
    expect(lai.body.code).toBe('LINE_NOT_FOUND');
  });

  it('thêm lại bằng đường THÊM DÒNG thì báo đúng việc phải làm', async () => {
    const { d, v2, dongCu } = await v2Voi(await makeProduct());
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);

    const r = await post(`/policies/${v2}/lines`, line(d.productId));
    expect(r.status).toBe(409);
    // KHÔNG phải `DUPLICATE_PRODUCT`: câu của mã ấy — "đã có trong hồ sơ" — đọc
    // như một lời nói dối khi người dùng vừa nhìn thấy dòng đó bị gạch đi.
    expect(r.body.code).toBe('PRODUCT_LINE_DELETED');
  });

  it('dòng đã rút XOÁ HẲN khi hồ sơ sang Đang có hiệu lực, và KHÔNG mọc lại ở bản sau', async () => {
    const moi = await makeProduct();
    const { d, v2, dongCu } = await v2Voi(moi);
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);
    await runToActive({ id: v2 });

    // Xoá hẳn: bảng của chính hồ sơ vừa có hiệu lực không còn dòng mờ nào.
    expect((await dongCua(v2)).some((l) => l.id === dongCu.id)).toBe(false);

    /*
     * VẾ THỨ HAI LÀ VẾ ĐẮT: `create` chép nguyên dòng của bản đang hiệu lực sang
     * phiên bản kế tiếp. Không xoá hẳn ở bước có hiệu lực thì mặt hàng vừa rút
     * quay lại ở v3 dưới dạng một dòng thừa kế bình thường, và TDV phải rút lại
     * nó ở mọi phiên bản, mãi mãi.
     */
    const v3 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(v3.status).toBe(201);
    const ids = (v3.body.lines as { productId: string }[]).map((l) => l.productId);
    expect(ids).toEqual([moi]);
    expect(ids).not.toContain(d.productId);
  });

  it('BẢN MỀM VÀ BÁO CÁO KHÔNG THẤY dòng đã rút, màn hình thì có', async () => {
    /*
     * Hỏi ĐÚNG CÁI CỬA mà `document` và `reporting` hỏi.
     *
     * Khách hàng chốt *"bản mềm cũng không hiện sản phẩm đã xoá"*, và chốt ấy
     * thi hành ở `internal.controller` — cửa duy nhất hai service kia đọc được
     * hồ sơ (AD-02). Đo ở đây thay vì đọc chữ trong một file PDF vì đây là chỗ
     * quyết định: dựng bảng chỉ in ra thứ nó được đưa, nên một ca đọc PDF sẽ
     * xanh cả khi phép lọc chuyển sang `document` và `reporting` âm thầm đếm
     * tiếp mặt hàng đã rút.
     *
     * Vế NGƯỢC LẠI đi kèm và nó là nửa quan trọng của ca này: cùng một hồ sơ,
     * đường đọc của giao diện PHẢI còn thấy dòng ấy. Lọc nhầm ở cả hai đường là
     * dòng mờ biến mất khỏi màn hình người duyệt — tức là mất đúng thứ `0186`
     * dựng ra.
     */
    const moi = await makeProduct();
    const { d, v2, dongCu } = await v2Voi(moi);
    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);

    const noiBo = await (await http(app))
      .get(`/internal/policies/${v2}`)
      .set('X-Service-Token', mintServiceToken('document'));
    expect(noiBo.status, JSON.stringify(noiBo.body)).toBe(200);
    const maNoiBo = (noiBo.body.lines as { product_id: string }[]).map((l) => l.product_id);
    expect(maNoiBo).toEqual([moi]);
    expect(maNoiBo).not.toContain(d.productId);

    const manHinh = (await dongCua(v2)).map((l) => l.productId).sort();
    expect(manHinh).toEqual([moi, d.productId].sort());
  });

  it('BẾ TẮC NC-CAN-400: mặt hàng bị vô hiệu hoá thì rút ra rồi gửi duyệt được', async () => {
    /*
     * KỊCH BẢN THẬT khách hàng báo, chạy đầu-cuối.
     *
     * Trước `0186` hai chốt chặn cấm nhau: giữ dòng thì `STALE_LINE` (mặt hàng
     * đã vô hiệu hoá, không tra được giá hiện hành), xoá dòng thì
     * `MISSING_INHERITED_PRODUCT`. Hồ sơ chết hẳn ở Nháp, không lối ra nào — kể
     * cả thêm lại, vì `PRODUCT_DISABLED` chặn mặt hàng đã vô hiệu hoá.
     *
     * Ca này khẳng định CẢ HAI VẾ: giữ thì vẫn chặn (CAT-07 còn nguyên — không
     * cam kết bán thứ đã ngừng bán), và rút ra thì đi được.
     */
    const { d, v2, dongCu } = await v2Voi(await makeProduct());
    // Vô hiệu hoá đòi GÕ LẠI MÃ (`0036`, `0123`) — `confirm` là mã sản phẩm.
    const c = await http(catalog);
    const ma = (
      await c
        .get(`/catalog/products/${d.productId}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
    ).body.code as string;
    const tat = await c
      .patch(`/catalog/products/${d.productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ status: 'DA_VO_HIEU_HOA', confirm: ma });
    expect(tat.status, JSON.stringify(tat.body)).toBe(200);

    const giu = await act(v2, 'SUBMIT', 'tdv01');
    expect(giu.status).toBe(422);
    expect(giu.body.code).toBe('STALE_LINE');

    expect((await del(`/policies/${v2}/lines/${dongCu.id}`)).status).toBe(200);
    const sau = await act(v2, 'SUBMIT', 'tdv01');
    expect(sau.status, JSON.stringify(sau.body)).toBe(200);
  });
});

describe('`0031` chọn người xử lý lúc gửi duyệt', () => {
  /*
   * Thay cho khối `TDV chưa có Trưởng bộ phận quản lý thì chưa gửi được hồ sơ`.
   *
   * Khối cũ canh một ca hỏng có thật: TDV không được gán người duyệt thì hồ sơ
   * đi vào "Chờ TBP duyệt" và NẰM ĐÓ — hộp việc của TBP suy từ `approver_user_id`,
   * không ai gán thì không hộp việc nào chứa nó, và hồ sơ biến mất êm ru tới lúc
   * quá hạn.
   *
   * Ca hỏng ấy không còn tồn tại được: người duyệt chọn ngay tại chỗ gửi. Nhưng
   * ba cách chọn SAI thì có, và cả ba dẫn tới đúng cái ngõ cụt cũ — nên phải
   * chặn cả ba.
   */
  it('thiếu ô chọn thì 422 và nói rõ thiếu ô nào', async () => {
    const d = await draft();
    const r = await post(`/policies/${d.id}/actions/SUBMIT`, {}, 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.code).toBe('ASSIGNEE_REQUIRED');
    expect(r.body.fields).toEqual(['tbpUserId', 'keToanUserId']);
    // Câu báo phải nói việc phải làm, không chỉ nói "không được".
    expect(r.body.message).toContain('Trưởng bộ phận');

    // Hồ sơ vẫn nguyên là bản nháp — chặn ở đây không làm mất gì.
    expect((await get(`/policies/${d.id}`)).body.status).toBe('NHAP');
  });

  it('chọn thiếu MỘT trong hai ô cũng bị chặn', async () => {
    const d = await draft();
    const id = await idNguoiDung();
    const r = await post(`/policies/${d.id}/actions/SUBMIT`, { tbpUserId: id['tbp01'] }, 'tdv01');
    expect(r.status).toBe(422);
    expect(r.body.fields).toEqual(['keToanUserId']);
  });

  it('chọn SAI VAI TRÒ thì 422, kèm tên ô và vai trò thật của người vừa chọn', async () => {
    // Gán một kế toán vào ô Trưởng bộ phận là hồ sơ vào ngõ cụt: người đó không
    // có hành động `TBP_SIGN` nào để làm. Đây đúng là ca mà trigger
    // `forbid_bad_approver` của mô hình cũ chặn ở tầng CSDL.
    const d = await draft();
    const id = await idNguoiDung();
    const r = await post(
      `/policies/${d.id}/actions/SUBMIT`,
      { tbpUserId: id['kt01'], keToanUserId: id['kt01'] },
      'tdv01',
    );
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.code).toBe('ASSIGNEE_WRONG_ROLE');
    expect(r.body.field).toBe('tbpUserId');
    expect(r.body.message).toContain('KE_TOAN');
  });

  it('chọn tài khoản ĐÃ VÔ HIỆU HOÁ thì 422', async () => {
    // Ô chọn của giao diện đã lọc, nhưng ô chọn là thứ người dùng sửa được.
    const d = await draft();
    const id = await idNguoiDung();
    await withAdminDb((c) =>
      c.query(`UPDATE idn.app_user SET is_active = false WHERE username = 'tbp02'`),
    );
    try {
      const r = await post(
        `/policies/${d.id}/actions/SUBMIT`,
        { tbpUserId: id['tbp02'], keToanUserId: id['kt01'] },
        'tdv01',
      );
      expect(r.status, JSON.stringify(r.body)).toBe(422);
      expect(r.body.code).toBe('ASSIGNEE_INACTIVE');
    } finally {
      await withAdminDb((c) =>
        c.query(`UPDATE idn.app_user SET is_active = true WHERE username = 'tbp02'`),
      );
    }
  });

  it('chọn đúng thì hồ sơ GHI LẠI cả hai người, và hộp việc chỉ hiện ở người được chọn', async () => {
    const d = await draft();
    const id = await idNguoiDung();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const cot = await withAdminDb(async (c) => {
      const r = await c.query<{ tbp: string; kt: string }>(
        `SELECT tbp_user_id AS tbp, ke_toan_user_id AS kt FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return r.rows[0]!;
    });
    expect(cot.tbp).toBe(id['tbp01']);
    expect(cot.kt).toBe(id['kt01']);

    // tbp01 được chọn → thấy trong hộp việc. tbp02 không → không thấy.
    const cua = (who: string) => hetHopViec(who);
    expect(await cua('tbp01')).toContain(d.id);
    expect(await cua('tbp02')).not.toContain(d.id);
  });

  it('Trưởng bộ phận KHÔNG được chọn thì không đọc nổi hồ sơ', async () => {
    // Ranh giới chặt hơn hẳn mô hình cây: trước đây mọi TBP cùng nhánh đều đọc
    // được. Giờ chỉ người được ghi tên lên hồ sơ.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await get(`/policies/${d.id}`, 'tbp01')).status).toBe(200);
    const ngoai = await get(`/policies/${d.id}`, 'tbp02');
    expect(ngoai.status).toBe(403);
    expect(ngoai.body.code).toBe('OUT_OF_SCOPE');
  });
});

/**
 * HỘP VIỆC ĐẦY ĐỦ — đọc hết mọi trang, không chỉ trang đầu (`0064`).
 *
 * Trước đó các ca gọi thẳng `?limit=200` — đúng trần của `pageOf` — rồi khẳng
 * định hồ sơ vừa lập có mặt. Nó đúng cho tới hôm tệp test này tự tích đủ 200 hồ
 * sơ nháp của `tdv01`: hộp việc xếp `sla_due_at NULLS LAST, created_at`, mà nháp
 * không có hạn, nên hồ sơ MỚI NHẤT nằm ở cuối — đúng thứ bị cắt mất.
 *
 * Loại đỏ này chỉ xuất hiện khi tệp đủ dài, và nó trỏ vào một chỗ chẳng liên
 * quan gì tới thứ vừa sửa. Đọc hết trang thì nó không bao giờ quay lại.
 */
const hetHopViec = async (who: string): Promise<string[]> => {
  const ra: string[] = [];
  for (let offset = 0; ; offset += 200) {
    const r = await get(`/policies/inbox?limit=200&offset=${offset}`, who);
    const items = (r.body.items ?? []) as { id: string }[];
    ra.push(...items.map((x) => x.id));
    if (items.length < 200) return ra;
  }
};

describe('`0056` hồ sơ mang theo AI ĐÃ DUYỆT bước nào', () => {
  const duyet = async (id: string, who = 'tdv01') =>
    (await get(`/policies/${id}`, who)).body.nguoiDuyet as Record<
      string,
      { ten: string | null; luc: string } | null
    >;

  it('hồ sơ chưa qua bước nào thì rỗng sạch — không bày ô chờ điền', async () => {
    const d = await draft();
    const n = await duyet(d.id);
    expect(n.tbp).toBeNull();
    expect(n.keToanL1).toBeNull();
    expect(n.keToanL2).toBeNull();
    expect(n.saleAdmin).toBeNull();
  });

  it('điền dần theo từng bước, và mốc thời gian đi KÈM tên', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await duyet(d.id)).tbp, 'chưa ký mà đã có người ký').toBeNull();

    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    const sauKy = await duyet(d.id);
    expect(sauKy.tbp).not.toBeNull();
    expect(sauKy.tbp!.ten, 'thiếu tên người ký').toBeTruthy();
    // Thiếu mốc thì người đọc vẫn phải mở nhật ký ra mới biết hồ sơ nằm đó bao
    // lâu — đúng chuyến đi mà dải này sinh ra để khỏi phải làm.
    expect(Number.isNaN(Date.parse(sauKy.tbp!.luc)), 'mốc thời gian không đọc được').toBe(false);
    expect(sauKy.keToanL1, 'kế toán chưa nhận mà đã hiện').toBeNull();

    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    expect((await duyet(d.id)).keToanL1!.ten).toBeTruthy();
  });

  it('đi hết luồng thì có đủ bốn bước', async () => {
    const d = await draft();
    await runToActive(d);
    const n = await duyet(d.id);
    for (const k of ['tbp', 'keToanL1', 'saleAdmin', 'keToanL2']) {
      expect(n[k], `thiếu bước ${k}`).not.toBeNull();
      expect(n[k]!.ten, `bước ${k} thiếu tên`).toBeTruthy();
    }
  });

  it('người ký lấy từ `tbp_signed_by`, không phải người được phân công', async () => {
    /*
     * Hai cột khác nhau khi có người duyệt thay: `tbp_user_id` là người ĐƯỢC
     * CHỌN lúc gửi duyệt, `tbp_signed_by` là người THẬT SỰ đặt bút. Đọc cột đầu
     * là ghi công sai người — và đó là loại sai không ai phát hiện ra được từ
     * màn hình, vì cả hai đều là tên một Trưởng bộ phận có thật.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);

    // Đổi người ĐƯỢC PHÂN CÔNG sang tbp02, giữ nguyên người đã ký là tbp01.
    await withAdminDb((c) =>
      c.query(
        `UPDATE pol.policy SET tbp_user_id = (SELECT id FROM idn.app_user WHERE username = 'tbp02')
          WHERE id = $1`,
        [d.id],
      ),
    );

    // Đọc bằng TDV phụ trách, không bằng `tbp01`: đổi người được phân công sang
    // tbp02 làm tbp01 rơi ra khỏi phạm vi hồ sơ, và `GET /policies/:id` trả 403.
    const n = await duyet(d.id, 'tdv01');
    const ten01 = await withAdminDb(async (c) => {
      const r = await c.query<{ full_name: string }>(
        `SELECT full_name FROM idn.app_user WHERE username = 'tbp01'`,
      );
      return r.rows[0]!.full_name;
    });
    expect(n.tbp!.ten, 'ghi công cho người được phân công thay vì người đã ký').toBe(ten01);
  });
});

describe('`0061` hồ sơ mang theo đủ thứ đầu màn hình cần', () => {
  it('ngày soạn thảo, người đề nghị và khách hàng đều có mặt', async () => {
    /*
     * Tới `0060` màn hình hồ sơ KHÔNG hiện khách hàng nào cả — chỉ có
     * `customerId` trong dữ liệu, không vẽ ra đâu hết. Nghĩa là người sắp ký một
     * chính sách bán hàng không đọc được nó dành cho ai, trừ khi tải bản A4 về.
     */
    const d = await draft();
    const r = await get(`/policies/${d.id}`, 'tdv01');
    expect(r.status).toBe(200);

    expect(Number.isNaN(Date.parse(r.body.createdAt)), 'ngày soạn thảo không đọc được').toBe(false);
    expect(r.body.nguoiDeNghi?.ten, 'thiếu tên người đề nghị').toBeTruthy();

    const kh = r.body.khachHang;
    expect(kh, 'thiếu hẳn khối khách hàng').toBeTruthy();
    expect(kh.ma).toBeTruthy();
    expect(kh.ten).toBeTruthy();
    expect([1, 2, 3]).toContain(kh.loai);
    // Công nợ là bigint dạng CHUỖI: quá 2^53 thì chuyển sang số là mất chữ số
    // trong im lặng, và đây là tiền.
    expect(typeof kh.congNo).toBe('string');
  });

  it('người đề nghị là người LẬP, không phải TDV đang phụ trách khách hàng', async () => {
    /*
     * Hai cột khác nhau, và Sale Admin đổi được cột sau. Đọc nhầm sang đó thì
     * đổi người phụ trách xong là hồ sơ cũ đổi luôn tên người đề nghị — viết lại
     * lịch sử của một văn bản đã gửi đi.
     */
    const d = await draft();
    const ten = await withAdminDb(async (c) => {
      const r = await c.query<{ full_name: string }>(
        `SELECT full_name FROM idn.app_user WHERE username = 'tdv01'`,
      );
      return r.rows[0]!.full_name;
    });

    await withAdminDb((c) =>
      c.query(
        `UPDATE pol.policy SET tdv_user_id = (SELECT id FROM idn.app_user WHERE username = 'tdv02')
          WHERE id = $1`,
        [d.id],
      ),
    );

    // Đọc bằng tdv02: đổi cột phụ trách xong thì tdv01 rơi ra khỏi phạm vi hồ sơ.
    const r = await get(`/policies/${d.id}`, 'tdv02');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.nguoiDeNghi.ten, 'đọc nhầm sang TDV đang phụ trách').toBe(ten);
  });
});

describe('`0052` hộp việc của TDV gồm cả hồ sơ Nháp', () => {
  const hopViec = (who: string) => hetHopViec(who);

  it('hồ sơ chưa gửi duyệt nằm trong hộp việc của người lập', async () => {
    /*
     * Đi cùng việc bỏ thẻ *Nháp* khỏi dải thẻ của TDV.
     *
     * Hai thứ ấy nói cùng một chuyện — "hồ sơ bạn chưa gửi đi" — nên bày cả hai
     * là bắt người dùng đọc một con số ở trên rồi đọc lại chính danh sách ấy ở
     * dưới. Bỏ thẻ mà KHÔNG thêm vào hộp việc thì hồ sơ nháp biến mất khỏi trang
     * tổng quan, và đó là thứ duy nhất TDV mở phần mềm ra để làm tiếp.
     */
    const d = await draft();
    expect(await hopViec('tdv01'), 'hồ sơ nháp rơi khỏi hộp việc').toContain(d.id);
  });

  it('gửi duyệt xong thì RỜI hộp việc của TDV, sang hộp việc của TBP', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect(await hopViec('tdv01'), 'gửi rồi mà vẫn là việc của TDV').not.toContain(d.id);
    expect(await hopViec('tbp01')).toContain(d.id);
  });

  it('ba vai trò còn lại KHÔNG thấy hồ sơ nháp của người khác', async () => {
    // Hồ sơ chưa gửi duyệt chưa từng rời khỏi bàn người lập — nó không phải việc
    // của ai khác, và cũng chưa có ai khác được phân công vào nó.
    const d = await draft();
    for (const who of ['tbp01', 'kt01', 'sa01']) {
      expect(await hopViec(who), `${who} thấy hồ sơ nháp`).not.toContain(d.id);
    }
  });

  it('hồ sơ nháp của TDV khác cũng không lọt vào hộp việc của mình', async () => {
    // Phạm vi dữ liệu vẫn áp như mọi chỗ khác: `NHAP` không nới lỏng gì cả.
    const cua02 = await makeCustomer('tdv02');
    const sp = await makeProduct();
    const r = await post('/policies', { customerId: cua02, lines: [line(sp)] }, 'tdv02');
    expect(r.status).toBe(201);

    expect(await hopViec('tdv01')).not.toContain(r.body.id);
    expect(await hopViec('tdv02')).toContain(r.body.id);
  });
});

describe('POL-09 ngày áp dụng trong quá khứ', () => {
  it('chấp nhận — và từ `0180` nó nằm trên DÒNG, không trên hồ sơ', async () => {
    // Hiệu lực vẫn tính từ lúc tiếp nhận L2 (EFF-07); ngày áp dụng của một dòng
    // không chi phối trạng thái hồ sơ.
    const d = await draft({ ngayApDung: '2020-01-01' });
    expect(d.body.status).toBe('NHAP');
    expect(String(d.body.lines[0].ngayApDung)).toContain('2020-01-01');
  });

  it('`0180` KHÔNG còn đường nào đổi ngày ở CẤP HỒ SƠ', async () => {
    /*
     * `PATCH /policies/:id` gỡ hẳn cùng cột `applied_date`. Ca này canh cho nó
     * không mọc lại: một đường `PATCH` cấp hồ sơ là chỗ để lần sau ai đó nhét
     * vào một trường bất kỳ, ngoài mọi phép kiểm của luồng duyệt.
     */
    const d = await draft();
    const r = await patch(`/policies/${d.id}`, { appliedDate: '2020-01-01' });
    expect(r.status, JSON.stringify(r.body)).toBe(404);
  });
});

describe('POL-10 mọi CSBH đều vô thời hạn', () => {
  it('lược đồ KHÔNG có cột ngày hết hiệu lực nào', async () => {
    const cols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'pol' AND table_name IN ('policy','policy_line')`,
      );
      return r.rows.map((x) => x.column_name);
    });
    for (const bad of ['expires_at', 'expiry_date', 'effective_to', 'valid_to', 'end_date']) {
      expect(cols, `không được có cột ${bad}`).not.toContain(bad);
    }
    // `deactivated_at` là DẤU VẾT bị thay thế, không phải hạn định trước.
    expect(cols).toContain('deactivated_at');
  });

  it('hồ sơ trả về không có trường hạn hiệu lực', async () => {
    const d = await draft();
    const keys = Object.keys(d.body);
    expect(keys).not.toContain('expiresAt');
    expect(keys).not.toContain('effectiveTo');
  });
});

describe('POL-11 hồ sơ đã gửi duyệt thì khoá sửa', () => {
  it('sửa sau khi gửi duyệt thì 409 POLICY_LOCKED', async () => {
    // `0180` — phép sửa duy nhất còn lại là sửa DÒNG; đường `PATCH` cấp hồ sơ
    // đã gỡ cùng với ngày áp dụng của hồ sơ.
    const d = await draft();
    const lineId = d.body.lines[0].id as string;
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await patch(`/policies/${d.id}/lines/${lineId}`, { wholesalePrice: '80000' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_LOCKED');
  });

  it('thêm dòng sau khi gửi duyệt cũng bị chặn', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await post(`/policies/${d.id}/lines`, line(await makeProduct()));
    expect(r.status).toBe(409);
  });
});

describe('`0099` chỉ TDV ĐANG PHỤ TRÁCH sửa được hồ sơ', () => {
  /*
   * Dựng lại trên chồng demo trước khi viết ca này, và cả ba đều là 200:
   *
   *   bld01 xoá dòng khỏi hồ sơ NHÁP của tdv01     -> 200, còn 1 dòng
   *   tbp01 xoá dòng khỏi hồ sơ YEU_CAU_CHINH_SUA  -> 200, còn 1 dòng
   *   kt01  xoá dòng khỏi hồ sơ YEU_CAU_CHINH_SUA  -> 200, 7 dòng còn 6
   *
   * Hai nguyên nhân chồng lên nhau, và phải kiểm CẢ HAI:
   *
   *   1. `@Roles('TDV')` rơi mất khỏi đường xoá dòng (P26). Cái này bld01 dùng —
   *      phạm vi dữ liệu của Ban lãnh đạo chứa mọi TDV, nên `assertPolicyInScope`
   *      cho họ qua ở hồ sơ Nháp của bất kỳ ai.
   *   2. `mustEdit` hỏi "tôi có LIÊN QUAN tới hồ sơ này không" thay vì "tôi có
   *      được SỬA nó không". Cái này tbp01 và kt01 dùng: hồ sơ bị trả lại vẫn
   *      giữ tên họ ở `tbp_user_id`/`ke_toan_user_id`, nên họ nằm trong phạm vi
   *      của chính hồ sơ ấy — dán lại `@Roles` KHÔNG chặn được đường này.
   *
   * Nên hai ca dưới đây phải cùng xanh: gỡ bản sửa ở `mustEdit` thì ca thứ hai
   * đỏ, gỡ `@Roles` thì ca thứ nhất đỏ.
   */
  it('Ban lãnh đạo KHÔNG xoá được dòng sản phẩm khỏi hồ sơ Nháp của người khác', async () => {
    const d = await draft();
    const truoc = await get(`/policies/${d.id}`);
    const lineId = truoc.body.lines[0].id as string;

    const r = await del(`/policies/${d.id}/lines/${lineId}`, 'bld01');
    expect(r.status).toBe(403);

    const sau = await get(`/policies/${d.id}`);
    expect(sau.body.lines).toHaveLength(truoc.body.lines.length);
  });

  it('Trưởng bộ phận và Kế toán KHÔNG sửa được hồ sơ họ vừa trả lại', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    // Trả lại: hồ sơ về YEU_CAU_CHINH_SUA và VẪN mang tên tbp01, kt01 ở bốn cột
    // người — đó là điều kiện làm `assertPolicyInScope` cho họ qua.
    expect(
      (await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thiếu giấy tờ, đề nghị bổ sung' })).status,
    ).toBe(200);

    const truoc = await get(`/policies/${d.id}`);
    expect(truoc.body.status).toBe('YEU_CAU_CHINH_SUA');
    const lineId = truoc.body.lines[0].id as string;

    for (const who of ['tbp01', 'kt01']) {
      const r = await del(`/policies/${d.id}/lines/${lineId}`, who);
      expect(r.status, `${who} xoá được dòng của hồ sơ đang chờ TDV sửa`).toBe(403);
      // `ROLE_FORBIDDEN` chứ không `NOT_OWNER`: LỚP NGOÀI bắt trước. Cả hai lớp
      // đều chặn được ca này — gỡ `@Roles` thì `mustEdit` trả `NOT_OWNER`, gỡ
      // `mustEdit` thì chốt vai trò trả `ROLE_FORBIDDEN`, gỡ cả hai mới ra 200.
      // Khẳng định lớp ngoài vì đó là thứ người gọi thật sự nhận được.
      expect(r.body.code).toBe('ROLE_FORBIDDEN');
    }

    const sau = await get(`/policies/${d.id}`);
    expect(sau.body.lines).toHaveLength(truoc.body.lines.length);
  });

  it('chính TDV đang phụ trách thì vẫn xoá được — bản sửa không khoá nhầm người', async () => {
    const d = await draft({ productId: await makeProduct() });
    const them = await post(`/policies/${d.id}/lines`, line(await makeProduct()));
    expect(them.status).toBe(201);

    const truoc = await get(`/policies/${d.id}`);
    expect(truoc.body.lines.length).toBe(2);
    const r = await del(`/policies/${d.id}/lines/${truoc.body.lines[1].id}`);
    expect(r.status).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines).toHaveLength(1);
  });

  it('TDV KHÁC cũng không sửa được, dù cùng vai trò', async () => {
    const d = await draft();
    const lineId = (await get(`/policies/${d.id}`)).body.lines[0].id as string;
    // tdv02 không có tên ở cột nào của hồ sơ này, nên họ dừng sớm hơn một bước:
    // ở phạm vi dữ liệu, không phải ở phép so người phụ trách.
    const r = await del(`/policies/${d.id}/lines/${lineId}`, 'tdv02');
    expect(r.status).toBe(403);
  });
});

describe('POL-12 TDV không sửa được giá bán Công ty và ngưỡng', () => {
  it('gửi kèm companyPrice thì 400', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      companyPrice: '1',
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('FIELD_NOT_ALLOWED');
  });

  it('gửi kèm thresholdRate2 trong dòng sản phẩm cũng bị chặn', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      lines: [{ ...line(await makeProduct()), thresholdRate2: 9999 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.fields).toContain('thresholdRate2');
  });

  it('giá và ngưỡng luôn lấy từ danh mục, đóng băng vào hồ sơ', async () => {
    const d = await draft();
    expect(d.body.lines[0].companyPrice).toBe('100000');

    // So với chính DANH MỤC, không so với một con số viết cứng.
    //
    // Bất biến cần kiểm là "ngưỡng trên dòng hồ sơ CHÍNH LÀ ngưỡng danh mục trả
    // về", chứ không phải "ngưỡng bằng 15,00". Viết cứng con số là ngầm giả định
    // thêm một điều kiện — rằng không quy định chiết khấu nào khớp sản phẩm này
    // — mà điều kiện đó phụ thuộc dữ liệu của tệp test KHÁC đang chạy song song
    // trên cùng một CSDL. Từ khi quy định chiết khấu vô thời hạn (0020), giả
    // định ấy càng dễ vỡ: một dòng khai từ 2020 không còn tự hết hiệu lực.
    const tra = await (await http(catalog))
      .get(
        `/catalog/thresholds/resolve?productId=${d.productId}&customerType=1`,
      )
      .set('Authorization', `Bearer ${tok['admin01']}`);
    expect(tra.status, JSON.stringify(tra.body)).toBe(200);
    const mongDoi = (tra.body.thresholdRate2 / 100).toFixed(2);
    expect(d.body.lines[0].threshold).toBe(mongDoi);
  });
});

/**
 * Đưa một hồ sơ mới tới đúng một trạng thái, để ma trận xoá bên dưới thử được
 * CẢ MƯỜI MỘT.
 *
 * MỘT trạng thái không tới được bằng lời gọi API và phải đặt thẳng bằng SQL:
 * `QUA_HAN_DUYET` — chỉ `sla-worker` đặt, sau 14 ngày. Nó là một NHÃN chồng lên
 * trạng thái chờ, nên đặt kèm `pending_step` đúng như worker làm.
 *
 * `TBP_DA_KY_SO` từng là trạng thái thứ hai phải đặt bằng SQL. Nó đã bị gỡ khỏi
 * máy trạng thái ở `0064` và khỏi enum của CSDL ở `0048`, nên câu lệnh SQL ấy
 * giờ hỏng chứ không chỉ vô nghĩa.
 */
const datTrangThai = (id: string, tt: string, buoc: string | null = null) =>
  withAdminDb((c) =>
    c.query(
      `UPDATE pol.policy SET status = $2::pol.policy_status,
              pending_step = $3::pol.policy_step WHERE id = $1`,
      [id, tt, buoc],
    ),
  );

/** Hồ sơ ở `YEU_CAU_CHINH_SUA` — ba đường trả về, mặc định là TBP trả lại. */
const biTraLai = async (
  qua: 'TBP_RETURN' | 'KT_RETURN_L1' | 'KT_RETURN_L2' = 'TBP_RETURN',
) => {
  const d = await draft();
  await act(d.id, 'SUBMIT', 'tdv01');
  if (qua === 'TBP_RETURN') {
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' });
  } else {
    await act(d.id, 'TBP_SIGN', 'tbp01');
    if (qua === 'KT_RETURN_L1') {
      await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Sai ma khach hang' });
    } else {
      await act(d.id, 'KT_RECEIVE_L1', 'kt01');
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
        'sa01',
      );
      // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
      await post(
        `/policies/${d.id}/attachments`,
        { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
        'sa01',
      );
      await act(d.id, 'SA_HANDOVER', 'sa01');
      await act(d.id, 'KT_RETURN_L2', 'kt01', { reason: 'Ban cung sai mau' });
    }
  }
  expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
  return d;
};

const nhatKy = (policyId: string) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ from_status: string; to_status: string; action: string }>(
      `SELECT from_status::text, to_status::text, action FROM pol.policy_event
        WHERE policy_id = $1 ORDER BY seq`,
      [policyId],
    );
    return r.rows;
  });

describe('POL-13 · POL-14 · `0035` xoá hồ sơ', () => {
  describe('Nháp — xoá hẳn, không để lại vết', () => {
    it('POL-13 xoá hồ sơ Nháp của chính mình thì 204 và hồ sơ biến mất', async () => {
      const d = await draft();
      expect((await del(`/policies/${d.id}`)).status).toBe(204);
      expect((await get(`/policies/${d.id}`)).status).toBe(404);
      // Chống spam: bản nháp không để lại dòng nhật ký nào (`0035`).
      expect(await nhatKy(d.id)).toEqual([]);
    });

    it('phát `policy.deleted` — read-model phải XOÁ dòng, không phải cập nhật', async () => {
      const d = await draft();
      await del(`/policies/${d.id}`);
      const khoa = (await outboxFor(d.id)).map((e) => e.routing_key);
      expect(khoa).toContain('policy.deleted');
      expect(khoa).not.toContain('policy.discarded');
    });

    // `0197` — ca này gánh thêm một việc: nó là chỗ canh cho
    // `uq_policy_dang_do_moi_khach` (`0220`, trước là `uq_policy_nhap_moi_khach`) là chỉ mục PHẦN. Một
    // ràng buộc giữ chỗ vĩnh viễn cũng thoả mọi ca khác của luật một-bản-Nháp.
    it('xoá nháp rồi lập lại cho cùng khách hàng thì được', async () => {
      const d = await draft();
      await del(`/policies/${d.id}`);
      const lai = await post('/policies', {
        customerId: d.customerId,
        lines: [line(d.productId)],
      });
      expect(lai.status).toBe(201);
    });
  });

  describe('Yêu cầu chỉnh sửa — chuyển `DA_XOA`, giữ nguyên lịch sử', () => {
    // Ba đường về `YEU_CAU_CHINH_SUA` đều phải xoá được: yêu cầu nghiệp vụ nêu
    // đích danh cả ba ("bị Yêu cầu chỉnh sửa, L1 hoặc L2 không tiếp nhận").
    for (const qua of ['TBP_RETURN', 'KT_RETURN_L1', 'KT_RETURN_L2'] as const) {
      it(`bị trả lại qua ${qua} thì TDV xoá được, hồ sơ còn nguyên ở "Đã xoá"`, async () => {
        const d = await biTraLai(qua);
        expect((await del(`/policies/${d.id}`)).status).toBe(204);

        const sau = await get(`/policies/${d.id}`);
        expect(sau.status).toBe(200);
        expect(sau.body.status).toBe('DA_XOA');
      });
    }

    it('ghi vào nhật ký của chính hồ sơ, và KHÔNG xoá dòng cũ nào', async () => {
      const d = await biTraLai('TBP_RETURN');
      const truoc = await nhatKy(d.id);
      await del(`/policies/${d.id}`);
      const sau = await nhatKy(d.id);

      // Lịch sử chỉ DÀI THÊM. Lý do trả lại của Trưởng bộ phận vẫn còn — đó là
      // phần việc của người khác, xoá nó đi là làm biến mất một việc đã làm.
      expect(sau.slice(0, truoc.length)).toEqual(truoc);
      expect(sau).toHaveLength(truoc.length + 1);
      expect(sau.at(-1)).toEqual({
        from_status: 'YEU_CAU_CHINH_SUA',
        to_status: 'DA_XOA',
        action: 'DELETE',
      });
    });

    it('phát `policy.discarded` kèm người nhận, KHÔNG phát `policy.deleted`', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);
      const evs = await outboxFor(d.id);
      const khoa = evs.map((e) => e.routing_key);

      // Dùng nhầm `policy.deleted` ở đây thì `sync.service.ts` xoá dòng
      // read-model, và hồ sơ "Đã xoá" biến mất khỏi mọi báo cáo — đúng thứ việc
      // giữ lại lịch sử sinh ra để tránh.
      expect(khoa).toContain('policy.discarded');
      expect(khoa).not.toContain('policy.deleted');

      const e = evs.find((x) => x.routing_key === 'policy.discarded')!;
      // Người đã trả hồ sơ lại đang chờ một bản sửa sẽ không bao giờ tới.
      expect(e.payload['recipients']).toEqual(['TBP', 'KE_TOAN']);
      expect(e.payload['toStatus']).toBe('DA_XOA');
      expect(e.payload['tbpUserId']).toBe((await idNguoiDung())['tbp01']);
    });

    it('xoá rồi thì lập hồ sơ mới cho cùng khách hàng được', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);
      const lai = await post('/policies', {
        customerId: d.customerId,
        lines: [line(d.productId)],
      });
      expect(lai.status).toBe(201);
    });
  });

  describe('`0050` hồ sơ mang theo chênh lệch so với danh mục', () => {
    /*
     * Người sắp ký thường mở THẲNG hồ sơ — từ thư báo, từ hộp việc, từ danh sách
     * — chứ không đi vòng qua trang tổng quan. Tới `0049` thông tin "số này đã
     * lỗi thời" chỉ có ở box *Yêu cầu cập nhật* trên trang ấy, nên ai mở thẳng
     * hồ sơ thì không có gì nói cho họ biết.
     */
    const lechCua = async (id: string, who = 'tdv01') =>
      (await get(`/policies/${id}`, who)).body.lech as { kind: string; productCode: string }[];

    it('rỗng khi không có dấu vết nào', async () => {
      const d = await draft();
      expect(await lechCua(d.id)).toEqual([]);
    });

    it('trả đúng dấu vết của hồ sơ ĐÃ ĐÓNG BĂNG', async () => {
      const d = await draft();
      expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

      await withAdminDb((c) =>
        c.query(
          `INSERT INTO pol.policy_impact
             (policy_id, product_id, kind, product_code, snap_value, new_value)
           SELECT $1, product_id, 'PRICE', product_code_snap, '100', '120'
             FROM pol.policy_line WHERE policy_id = $1`,
          [d.id],
        ),
      );

      const l = await lechCua(d.id);
      expect(l.length).toBeGreaterThan(0);
      expect(l[0]!.kind).toBe('PRICE');
    });

    it('hồ sơ chưa đóng băng thì KHÔNG trả dấu vết, dù bảng còn dòng cũ', async () => {
      /*
       * `byId` vừa LÀM MỚI giá và ngưỡng ngay trước đó cho hồ sơ còn sửa được,
       * nên nó không thể lệch. Một dòng dấu vết còn sót từ lần gửi duyệt trước
       * mà hiện ra ở đây là cảnh báo về một chênh lệch đã tự biến mất — người
       * dùng đi tìm mãi không thấy.
       */
      const d = await draft();
      await withAdminDb((c) =>
        c.query(
          `INSERT INTO pol.policy_impact
             (policy_id, product_id, kind, product_code, snap_value, new_value)
           SELECT $1, product_id, 'PRICE', product_code_snap, '100', '120'
             FROM pol.policy_line WHERE policy_id = $1`,
          [d.id],
        ),
      );
      expect(await lechCua(d.id)).toEqual([]);
    });
  });

  describe('`0048` ba cờ còn lại — thao tác không làm được thì KHÔNG hiện', () => {
    /*
     * Yêu cầu của khách hàng: "thao tác nào không thực hiện được thì không hiển
     * thị, tránh trường hợp nhấn vào rồi hiện lỗi".
     *
     * Nên phép kiểm ở đây KHÔNG so cờ với một bảng trạng thái chép tay — chép
     * tay thì test và mã cùng sai một kiểu. Nó so cờ với VIỆC MÁY CHỦ CÓ NHẬN
     * THẬT KHÔNG: bật cờ mà gọi vào 409, hoặc tắt cờ mà gọi vào 200, đều đỏ.
     */
    const co = async (policyId: string, who = 'tdv01') =>
      (await get(`/policies/${policyId}`, who)).body as {
        loaiTepGhiDuoc: string[];
        xuatHopDongDuoc: boolean;
        xoaDuoc: boolean;
      };

    /** Ép hồ sơ về một trạng thái bất kỳ để soi cờ, không phải đi hết luồng. */
    const dat = (id: string, tt: string) =>
      withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = $2::pol.policy_status WHERE id = $1`, [id, tt]),
      );

    it('`loaiTepGhiDuoc` khớp đúng loại tệp máy chủ nhận', async () => {
      /*
       * Bảng này đọc bằng CON MẮT CỦA `tdv01`, và từ `0069` điều đó có nghĩa.
       *
       * Cờ giờ xét cả VAI TRÒ: `SCAN` chỉ Sale Admin, `HO_SO` chỉ TDV. Nên với
       * `tdv01` thì `SA_DANG_XU_LY` cho ra danh sách RỖNG — đúng, vì bản scan
       * không phải việc của họ. Nửa còn lại (Sale Admin thấy `['SCAN']`) nằm ở
       * ca `0069` phía dưới, nơi hồ sơ đi hết luồng thật nên `sa01` mới trong
       * phạm vi.
       */
      const MONG: Record<string, string[]> = {
        NHAP: ['HO_SO'],
        YEU_CAU_CHINH_SUA: ['HO_SO'],
        SA_DANG_XU_LY: [],
        CHO_TBP_DUYET: [],
        CHO_KT_L1: [],
        CHO_KT_L2: [],
        DANG_CO_HIEU_LUC: [],
        QUA_HAN_DUYET: [],
        DA_XOA: [],
      };

      for (const [tt, mong] of Object.entries(MONG)) {
        const d = await draft();
        await dat(d.id, tt);
        expect((await co(d.id)).loaiTepGhiDuoc, tt).toEqual(mong);

        /*
         * Và cờ ấy phải ĐÚNG: thử đính kèm cả hai loại, xem máy chủ nhận cái nào.
         *
         * Gọi bằng `tdv01` — TDV phụ trách luôn nằm trong phạm vi hồ sơ của mình
         * ở MỌI trạng thái. Dùng `sa01` thì hồ sơ còn ở Nháp trả 403 vì chưa
         * phân công, và ca kiểm thử đỏ vì phạm vi chứ không vì cái cờ nó đang đo.
         */
        for (const loai of ['HO_SO', 'SCAN']) {
          const r = await post(
            `/policies/${d.id}/attachments`,
            { kind: loai, fileName: 'a.pdf', objectKey: uniq('k') },
            'tdv01',
          );
          const nhan = r.status === 201;
          expect(nhan, `${tt}/${loai}: cờ nói ${mong.includes(loai)} mà máy chủ nói ${nhan}`).toBe(
            mong.includes(loai),
          );
        }
        await dat(d.id, 'NHAP');
      }
    });

    it('`xuatHopDongDuoc` bật đúng từ lúc kế toán tiếp nhận lần 1', async () => {
      // Cổng là MỐC THỜI GIAN, không phải trạng thái (muc 8.3): mốc ấy không mất
      // đi khi hồ sơ đi tiếp, nên cờ phải còn bật ở cả những bước sau.
      const d = await draft();
      expect((await co(d.id)).xuatHopDongDuoc, 'chưa gửi duyệt mà đã xuất được').toBe(false);

      expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
      expect((await co(d.id)).xuatHopDongDuoc, 'mới gửi duyệt mà đã xuất được').toBe(false);

      expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
      expect((await co(d.id)).xuatHopDongDuoc, 'TBP mới ký mà đã xuất được').toBe(false);

      expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
      expect((await co(d.id)).xuatHopDongDuoc, 'đã nhận L1 mà chưa xuất được').toBe(true);
    });

    it('hồ sơ QUÁ HẠN tắt sạch mọi cờ ghi', async () => {
      // Khớp `0047`: quá hạn là trạng thái chết. Giao diện không được bày một
      // nút nào lên hồ sơ ấy — kể cả nút đính kèm hay nút gỡ tệp.
      const d = await draft();
      await dat(d.id, 'QUA_HAN_DUYET');
      const c = await co(d.id);
      // Một trường cho cả nút tải lên lẫn nút gỡ từ `0097` — rỗng là tắt cả hai.
      expect(c.loaiTepGhiDuoc).toEqual([]);
      expect(c.xoaDuoc).toBe(false);
      expect((await get(`/policies/${d.id}/allowed-actions`, 'tdv01')).body.allowed).toEqual([]);
    });
  });

  describe('`0039` cờ `xoaDuoc` trên hồ sơ', () => {
    // Giao diện đọc đúng cờ này để ẩn nút, nên nó phải khớp từng ca với việc
    // `DELETE` có chạy hay không — thừa thì bày ra một nút 403, thiếu thì giấu
    // mất đường bỏ hồ sơ.
    const co = async (policyId: string, who = 'tdv01'): Promise<boolean> =>
      (await get(`/policies/${policyId}`, who)).body.xoaDuoc as boolean;

    it('bật ở đúng hai trạng thái xoá được', async () => {
      for (const tt of ['NHAP', 'YEU_CAU_CHINH_SUA']) {
        const d = await draft();
        if (tt !== 'NHAP') {
          await withAdminDb((c) =>
            c.query(`UPDATE pol.policy SET status = $2::pol.policy_status WHERE id = $1`, [
              d.id,
              tt,
            ]),
          );
        }
        expect(await co(d.id), `${tt} phải xoá được`).toBe(true);
        await withAdminDb((c) =>
          c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
        );
      }
    });

    it('tắt ở mọi trạng thái còn lại', async () => {
      for (const tt of [
        'CHO_TBP_DUYET',
        'CHO_KT_L1',
        'SA_DANG_XU_LY',
        'CHO_KT_L2',
        'DANG_CO_HIEU_LUC',
        'HET_HIEU_LUC',
        'QUA_HAN_DUYET',
        'DA_XOA',
      ]) {
        const d = await draft();
        await withAdminDb((c) =>
          c.query(
            `UPDATE pol.policy SET status = $2::pol.policy_status,
                    pending_step = $3::pol.policy_step WHERE id = $1`,
            [d.id, tt, tt === 'QUA_HAN_DUYET' ? 'B4_TBP_DUYET' : null],
          ),
        );
        expect(await co(d.id), `${tt} không được xoá`).toBe(false);
        await withAdminDb((c) =>
          c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
        );
      }
    });

    it('tắt với TDV KHÁC, dù hồ sơ đang ở trạng thái xoá được', async () => {
      const d = await biTraLai('TBP_RETURN');
      // tdv02 không thấy hồ sơ này, nên hỏi bằng chính người trong phạm vi:
      // Trưởng bộ phận. Họ mở được, và cờ phải tắt.
      expect(await co(d.id, 'tbp01')).toBe(false);
    });
  });

  describe('`DA_XOA` là trạng thái KẾT THÚC', () => {
    it('không hành động nào đi ra được, và xoá lần hai thì 403', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);

      expect((await get(`/policies/${d.id}/allowed-actions`)).body.allowed).toEqual([]);
      expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(409);
      expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(409);

      const lai = await del(`/policies/${d.id}`);
      expect(lai.status).toBe(403);
      expect(lai.body.code).toBe('ONLY_EDITABLE_DELETABLE');
    });

    it('nội dung khoá lại — không thêm dòng, không sửa dòng', async () => {
      const d = await biTraLai('TBP_RETURN');
      const lineId = d.body.lines[0].id as string;
      await del(`/policies/${d.id}`);

      const them = await post(`/policies/${d.id}/lines`, line(await makeProduct()));
      expect(them.status).toBe(409);
      // `0180` — vế thứ hai đổi từ "không đổi ngày áp dụng của hồ sơ" sang
      // "không sửa được dòng", vì ngày đã chuyển xuống dòng.
      const sua = await patch(`/policies/${d.id}/lines/${lineId}`, {
        wholesalePrice: '80000',
        ngayApDung: '2030-01-01',
      });
      expect(sua.status).toBe(409);
    });

    it('SQL thô cũng không xoá nổi — trigger ở CSDL chặn (`0035`)', async () => {
      const d = await biTraLai('TBP_RETURN');
      await del(`/policies/${d.id}`);

      const err = await withAdminDb(async (c) => {
        try {
          await c.query(`DELETE FROM pol.policy WHERE id = $1`, [d.id]);
          return undefined;
        } catch (e) {
          return e as { message: string };
        }
      });
      expect(err?.message).toContain('DA_XOA');
    });
  });

  describe('mọi trạng thái CÒN LẠI đều 403', () => {
    /**
     * Bảng dựng từng hồ sơ tới đúng một trạng thái. Viết thành bảng chứ không
     * thành mười `it` rời: thêm một trạng thái vào enum mà quên thử xoá ở đó là
     * đúng loại lỗ hổng chỉ lộ ra khi có người dùng bấm trúng.
     */
    const CACH: Record<string, () => Promise<string>> = {
      CHO_TBP_DUYET: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        return d.id;
      },
      CHO_KT_L1: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await act(d.id, 'TBP_SIGN', 'tbp01');
        return d.id;
      },
      SA_DANG_XU_LY: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await act(d.id, 'TBP_SIGN', 'tbp01');
        await act(d.id, 'KT_RECEIVE_L1', 'kt01');
        return d.id;
      },
      CHO_KT_L2: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await act(d.id, 'TBP_SIGN', 'tbp01');
        await act(d.id, 'KT_RECEIVE_L1', 'kt01');
        await post(
          `/policies/${d.id}/attachments`,
          { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
          'sa01',
        );
        // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
        await post(
          `/policies/${d.id}/attachments`,
          { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
          'sa01',
        );
        await act(d.id, 'SA_HANDOVER', 'sa01');
        return d.id;
      },
      DANG_CO_HIEU_LUC: async () => {
        const d = await draft();
        await runToActive(d);
        return d.id;
      },
      HET_HIEU_LUC: async () => {
        // Hết hiệu lực theo đúng đường thật: một bản CHỈNH SỬA chạy tới hiệu lực
        // sẽ đẩy bản cũ ra (EFF-01).
        const d = await draft();
        await runToActive(d);
        const v2 = await post('/policies', {
          customerId: d.customerId,
          mode: 'NEW_VERSION',
          lines: [line(d.productId, { wholesalePrice: '80000', cpbh: ['1000'] })],
        });
        await runToActive({ id: v2.body.id as string });
        return d.id;
      },
      QUA_HAN_DUYET: async () => {
        const d = await draft();
        await act(d.id, 'SUBMIT', 'tdv01');
        await datTrangThai(d.id, 'QUA_HAN_DUYET', 'B4_TBP_DUYET');
        return d.id;
      },
    };

    for (const [tt, dung] of Object.entries(CACH)) {
      it(`hồ sơ ở ${tt} thì chính TDV phụ trách cũng không xoá được`, async () => {
        const id = await dung();
        const r = await del(`/policies/${id}`);
        expect(r.status, `${tt} đáng lẽ 403`).toBe(403);
        expect(r.body.code).toBe('ONLY_EDITABLE_DELETABLE');
        // Và hồ sơ vẫn còn nguyên trạng thái cũ.
        expect((await get(`/policies/${id}`)).body.status).toBe(tt);
      });
    }
  });

  describe('POL-14 · ai được xoá', () => {
    /*
     * POL-14 ĐỔI NGHĨA ở `0039`, không bị bỏ.
     *
     * Bản cũ: "hồ sơ Từ chối không ai xoá được, kể cả quản trị". Điều luật ấy
     * bảo vệ DẤU VẾT — hồ sơ bị từ chối phải còn trong lịch sử và trong báo cáo
     * tỷ lệ trả lại. Từ `0039` TDV phụ trách bỏ được nó khỏi màn hình của mình,
     * nhưng "bỏ" ở đây là chuyển `DA_XOA`: không dòng nào mất, nhật ký dài thêm
     * một dòng, và báo cáo đếm theo `rejected_at` nên không đổi.
     *
     * Ba vế dưới đây là ba nửa còn lại của POL-14, và cả ba vẫn đúng nguyên.
     */
    it('POL-14 hồ sơ Đã xoá: KHÔNG XOÁ ĐƯỢC DÒNG, kể cả bằng SQL thô', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });
      /*
       * PHẢI ĐI TỚI `DA_XOA` THẬT, không dừng ở `YEU_CAU_CHINH_SUA`.
       *
       * Trigger chỉ chặn xoá ở trạng thái KẾT THÚC, và `YEU_CAU_CHINH_SUA` thì
       * không phải — hồ sơ ở đó còn sửa được, còn gửi lại được, và xoá dòng của
       * nó là chuyện hợp lệ. `0155` thay `TU_CHOI` bằng đường trả-lại-rồi-xoá,
       * nên ca này phải đi hết đường ấy mới chạm được chốt chặn nó đang kiểm.
       */
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);
      expect((await get(`/policies/${d.id}`)).body.status).toBe('DA_XOA');

      const err = await withAdminDb(async (c) => {
        try {
          await c.query(`DELETE FROM pol.policy WHERE id = $1`, [d.id]);
          return undefined;
        } catch (e) {
          return e as { message: string };
        }
      });
      expect(err?.message).toContain('DA_XOA');
    });

    it('POL-14 năm vai trò còn lại vẫn không đụng được vào hồ sơ Đã xoá', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      for (const who of ['tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
        const r = await del(`/policies/${d.id}`, who);
        expect([403, 404], `${who} đáng lẽ không xoá được`).toContain(r.status);
        expect(r.status).not.toBe(204);
      }
      expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
    });

    it('`0039` chính TDV phụ trách thì xoá được — hồ sơ sang `DA_XOA`', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      const truoc = await nhatKy(d.id);
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);

      const sau = await get(`/policies/${d.id}`);
      expect(sau.status, 'hồ sơ phải CÒN, chỉ đổi trạng thái').toBe(200);
      expect(sau.body.status).toBe('DA_XOA');

      // Nhật ký chỉ DÀI THÊM — lý do trả lại của Trưởng bộ phận còn nguyên.
      const nk = await nhatKy(d.id);
      expect(nk.slice(0, truoc.length)).toEqual(truoc);
      expect(nk.at(-1)).toEqual({
        from_status: 'YEU_CAU_CHINH_SUA',
        to_status: 'DA_XOA',
        action: 'DELETE',
      });
      expect(nk.some((x) => x.action === 'TBP_RETURN')).toBe(true);
    });

    it('`0039` KHÔNG động vào CSDL: chỉ đúng cột `status` đổi, không dòng nào mất', async () => {
      /*
       * Khẳng định thẳng điều người dùng đã chốt: "chỉ chuyển trạng thái sang
       * Đã xóa, không động gì vào CSDL, mọi nhật ký của hồ sơ đó vẫn còn".
       *
       * Ca này chụp TOÀN BỘ dòng hồ sơ trước và sau rồi so từng cột, thay vì chỉ
       * kiểm trạng thái. Một câu `DELETE` lọt vào nhánh này về sau, hay một cột
       * bị dọn kèm cho "sạch", đều đỏ ở đây.
       */
      const d = await draft();
      // Thêm một tệp đính kèm để ca này còn kiểm cả bảng con thứ ba.
      await post(`/policies/${d.id}/attachments`, {
        kind: 'HO_SO',
        fileName: 'ho-so-phap-ly.pdf',
        objectKey: `hs/${d.id}.pdf`,
      });
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      const chup = () =>
        withAdminDb(async (c) => {
          const p = await c.query(`SELECT * FROM pol.policy WHERE id = $1`, [d.id]);
          const dem = await c.query<{ dong: string; su_kien: string; tep: string }>(
            `SELECT (SELECT count(*) FROM pol.policy_line WHERE policy_id = $1)::text AS dong,
                    (SELECT count(*) FROM pol.policy_event WHERE policy_id = $1)::text AS su_kien,
                    (SELECT count(*) FROM pol.policy_attachment WHERE policy_id = $1)::text AS tep`,
            [d.id],
          );
          return { hang: p.rows[0] as Record<string, unknown>, dem: dem.rows[0]! };
        });

      const truoc = await chup();
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);
      const sau = await chup();

      // 1. Dòng hồ sơ CÒN, và chỉ hai cột đổi: trạng thái, và số phiên bản của
      //    khoá lạc quan. Mọi cột khác — mã, khách hàng, bốn cột người, mọi mốc
      //    thời gian, `rejected_at`, `last_reason` — giữ nguyên từng cái.
      const boQua = new Set(['status', 'row_version']);
      for (const cot of Object.keys(truoc.hang)) {
        if (boQua.has(cot)) continue;
        expect(String(sau.hang[cot]), `cột ${cot} không được đổi`).toBe(String(truoc.hang[cot]));
      }
      expect(truoc.hang['status']).toBe('YEU_CAU_CHINH_SUA');
      expect(sau.hang['status']).toBe('DA_XOA');

      // 2. Không bảng con nào mất dòng. Nhật ký DÀI THÊM đúng một dòng.
      expect(sau.dem.dong, 'dòng sản phẩm').toBe(truoc.dem.dong);
      expect(sau.dem.tep, 'tệp đính kèm').toBe(truoc.dem.tep);
      expect(Number(sau.dem.su_kien)).toBe(Number(truoc.dem.su_kien) + 1);

      // 3. Và lý do từ chối của Trưởng bộ phận vẫn đọc được nguyên văn.
      const nk = await nhatKy(d.id);
      expect(nk.some((x) => x.action === 'TBP_RETURN')).toBe(true);
      const lyDo = await withAdminDb(async (c) => {
        const r = await c.query<{ reason: string }>(
          `SELECT reason FROM pol.policy_event WHERE policy_id = $1 AND action = 'TBP_RETURN'`,
          [d.id],
        );
        return r.rows[0]?.reason;
      });
      expect(lyDo).toBe('Chiet khau qua cao');
    });

    it('`0039` TDV khác không xoá được hồ sơ Từ chối của người khác', async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Chiet khau qua cao' });

      const r = await del(`/policies/${d.id}`, 'tdv02');
      expect(r.status).toBe(403);
      expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
    });

    /*
     * Năm vai trò còn lại KHÔNG xoá được, kể cả hồ sơ đang nằm trên bàn của họ.
     *
     * Từ `0035` chốt chặn nằm ở `@Roles('TDV')`, tức là 403 ngay ở cổng — trước
     * đó bốn vai trò ghi vẫn qua được cổng rồi mới bị `remove()` từ chối. Thử ở
     * CẢ HAI trạng thái xoá được, vì đó là hai trạng thái duy nhất mà một lỗi
     * phân quyền ở đây thành xoá thật.
     */
    for (const tt of ['NHAP', 'YEU_CAU_CHINH_SUA'] as const) {
      it(`hồ sơ ${tt}: năm vai trò không phải TDV đều 403`, async () => {
        const d = tt === 'NHAP' ? await draft() : await biTraLai('TBP_RETURN');
        for (const who of ['tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
          const r = await del(`/policies/${d.id}`, who);
          expect(r.status, `${who} đáng lẽ 403`).toBe(403);
        }
        expect((await get(`/policies/${d.id}`)).body.status).toBe(tt);
      });
    }

    it('TDV khác thì không thấy hồ sơ, nên không xoá được', async () => {
      const d = await biTraLai('TBP_RETURN');
      const r = await del(`/policies/${d.id}`, 'tdv02');
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('OUT_OF_SCOPE');
      expect((await get(`/policies/${d.id}`)).body.status).toBe('YEU_CAU_CHINH_SUA');
    });

    /*
     * NGƯỜI PHỤ TRÁCH HIỆN TẠI, không phải người đã lập.
     *
     * `created_by` đứng yên khi hồ sơ đổi tay lúc bàn giao (`0032`), nên so với
     * nó là để lại một hồ sơ mà người đang phải xử lý không xoá nổi — đúng loại
     * hồ sơ treo mà đợt bàn giao sinh ra để dọn.
     */
    it('hồ sơ đã bàn giao sang TDV khác thì người đó xoá được', async () => {
      const d = await biTraLai('TBP_RETURN');
      const nguoiMoi = (await idNguoiDung())['tdv02'];
      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET tdv_user_id = $2 WHERE id = $1`, [d.id, nguoiMoi]),
      );
      // Người lập cũ giờ ngoài phạm vi.
      expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(403);
      expect((await del(`/policies/${d.id}`, 'tdv02')).status).toBe(204);
      expect((await get(`/policies/${d.id}`, 'tdv02')).body.status).toBe('DA_XOA');
    });
  });
});

// =============================================================================
// `0036` — nhật ký của một hồ sơ
//
// Đường `GET /policies/:id/events` có từ chặng đầu và tới `0036` mới có màn hình
// gọi nó, cùng một liên kết trong thư. Hai thứ ấy đòi hai điều đường cũ không
// có: TÊN người thao tác, và phép kiểm phạm vi đúng như khi mở hồ sơ.
// =============================================================================

describe('`0036` nhật ký hồ sơ', () => {
  const nk = async (policyId: string, who = 'tdv01') =>
    get(`/policies/${policyId}/events`, who);

  it('mỗi bước một dòng, đúng thứ tự, kèm TÊN người thao tác', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' });

    const r = await nk(d.id);
    expect(r.status).toBe(200);
    const ds = r.body as {
      seq: number;
      action: string;
      actorName: string | null;
      actorRole: string;
      reason: string | null;
      fromStatus: string | null;
      toStatus: string;
    }[];

    expect(ds.map((x) => x.action)).toEqual(['CREATE', 'SUBMIT', 'TBP_RETURN']);
    expect(ds.map((x) => x.seq)).toEqual([1, 2, 3]);
    // TÊN, không phải uuid — đó là cả lý do đường này được sửa ở `0036`.
    expect(ds[0]!.actorName, 'phải tra được tên người lập').toBeTruthy();
    expect(ds[2]!.actorRole).toBe('TBP');
    expect(ds[2]!.reason).toBe('Thieu chung tu');
    expect(ds[2]!.fromStatus).toBe('CHO_TBP_DUYET');
    expect(ds[2]!.toStatus).toBe('YEU_CAU_CHINH_SUA');
  });

  it('`0064` một lần bấm nút để lại đúng MỘT dòng lịch sử', async () => {
    /*
     * Trước `0064` lần ký số để lại HAI dòng: `TBP_SIGN` của Trưởng bộ phận và
     * `PUBLISH_SIGNED` của `SYSTEM`. Dòng thứ hai kể một bước không ai bấm và
     * không ai thấy — nó chỉ nói lại đúng chuyện dòng trước vừa nói.
     *
     * Việc lịch sử vẫn ghi được dòng của `SYSTEM` thì không mất: `SLA_OVERDUE`,
     * `SLA_DISCARDED` và `CUSTOMER_RETIRED` đều là bước hệ thống tự chạy, và
     * chúng có test riêng ở `sla.test.ts`.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');

    const ds = (await nk(d.id)).body as {
      action: string;
      actorRole: string;
      fromStatus: string | null;
      toStatus: string;
    }[];
    const ky = ds.filter((x) => x.action === 'TBP_SIGN');
    expect(ky).toHaveLength(1);
    expect(ky[0]!.actorRole).toBe('TBP');
    expect(ky[0]!.fromStatus).toBe('CHO_TBP_DUYET');
    expect(ky[0]!.toStatus).toBe('CHO_KT_L1');
  });

  /*
   * ĐỌC ĐƯỢC Ở MỌI TRẠNG THÁI, kể cả ba trạng thái kết thúc.
   *
   * Đây là chỗ dễ làm sai theo hướng ngược với trực giác: nhật ký của một hồ sơ
   * đã đóng lại là thứ người ta cần NHẤT, vì không còn màn hình nào khác nói
   * chuyện gì đã xảy ra. Chặn ở đây là bịt đúng lối đi cuối cùng.
   */
  for (const tt of [
    'NHAP',
    'CHO_TBP_DUYET',
    'CHO_KT_L1',
    'SA_DANG_XU_LY',
    'CHO_KT_L2',
    'DANG_CO_HIEU_LUC',
    'HET_HIEU_LUC',
    'YEU_CAU_CHINH_SUA',
    'QUA_HAN_DUYET',
    'DA_XOA',
  ]) {
    it(`hồ sơ ${tt}: nhật ký vẫn đọc được`, async () => {
      const d = await draft();
      await act(d.id, 'SUBMIT', 'tdv01');
      if (tt !== 'CHO_TBP_DUYET') {
        await withAdminDb((c) =>
          c.query(
            `UPDATE pol.policy SET status = $2::pol.policy_status,
                    pending_step = $3::pol.policy_step WHERE id = $1`,
            [d.id, tt, tt === 'QUA_HAN_DUYET' ? 'B4_TBP_DUYET' : null],
          ),
        );
      }

      const r = await nk(d.id);
      expect(r.status, `${tt}: ${JSON.stringify(r.body)}`).toBe(200);
      expect((r.body as unknown[]).length, `${tt}: phải có ít nhất CREATE và SUBMIT`)
        .toBeGreaterThanOrEqual(2);

      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
      );
    });
  }

  it('cùng phép kiểm phạm vi với việc MỞ hồ sơ — TDV khác thì 403', async () => {
    // Nhật ký kể ra tên khách hàng, lý do trả lại, tên người duyệt. Để nó lỏng
    // hơn đường mở hồ sơ là dựng một cửa sau vào đúng phần nhạy cảm nhất.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await nk(d.id, 'tdv02');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });

  it('người được giao hồ sơ đọc được, và Ban lãnh đạo cũng vậy', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await nk(d.id, 'tbp01')).status).toBe(200);
    expect((await nk(d.id, 'bld01')).status).toBe(200);
  });
});

// =============================================================================
// `0038` — `/allowed-actions` lọc theo VAI TRÒ
//
// Trước đợt này nó trả về mọi hành động của TRẠNG THÁI, bất kể ai hỏi, và giao
// diện đem thẳng ra vẽ nút. Hệ quả: Trình dược viên mở hồ sơ của chính mình đang
// *Chờ TBP duyệt* thấy đủ "Ký số duyệt", "Trả lại chỉnh sửa", "Từ chối hồ sơ" —
// bấm cái nào cũng 403.
// =============================================================================

describe('`0038` chỉ trả về hành động vai trò ấy làm được', () => {
  const nut = async (policyId: string, who: string): Promise<string[]> =>
    (await get(`/policies/${policyId}/allowed-actions`, who)).body.allowed as string[];

  it('hồ sơ Chờ TBP duyệt: TBP thấy HAI nút, TDV thấy KHÔNG nút nào', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');

    // `0155` — nút *Từ chối* đã bỏ; TBP chỉ còn ký hoặc trả lại.
    expect([...(await nut(d.id, 'tbp01'))].sort()).toEqual(['TBP_RETURN', 'TBP_SIGN']);
    // Người lập vẫn MỞ được hồ sơ của mình, chỉ là không có việc gì để bấm.
    expect(await nut(d.id, 'tdv01')).toEqual([]);

    // `0142` — Kế toán chưa THẤY hồ sơ ở lượt chờ TBP đầu tiên, nên câu trả lời
    // của họ không phải "không có nút nào" mà là 403. Hai câu ấy khác nhau, và
    // ca kiểm phải nói rõ mình đang hỏi câu nào.
    expect((await get(`/policies/${d.id}/allowed-actions`, 'kt01')).status).toBe(403);
  });

  /**
   * Đưa một hồ sơ tới đúng một trạng thái rồi hỏi cả sáu vai trò cùng lúc.
   *
   * Bảng kỳ vọng viết TAY, không suy từ `allowedActionsFor` — suy lại từ chính
   * hàm đang kiểm thì ca này chỉ đang lặp lại mã nguồn của nó.
   */
  const MONG_DOI: Record<string, Record<string, string[]>> = {
    NHAP: { tdv01: ['SUBMIT'] },
    CHO_TBP_DUYET: { tbp01: ['TBP_SIGN', 'TBP_RETURN'] },
    /*
     * `0185` — *Hoàn duyệt* của Trưởng bộ phận đứng cạnh việc của người khác ở
     * ba trạng thái SAU chữ ký của họ. Bảng này viết TAY, nên nó là chỗ nói ra
     * rằng nút mới hiện đúng cho MỘT vai trò và KHÔNG mọc thêm cho ai khác.
     */
    CHO_KT_L1: { kt01: ['KT_RECEIVE_L1', 'KT_RETURN_L1'], tbp01: ['TBP_RECALL'] },
    SA_DANG_XU_LY: { sa01: ['SA_HANDOVER'], tbp01: ['TBP_RECALL'] },
    // `0225` — cùng hai nút với lượt làm bản cứng lần đầu: bàn giao LẠI, và
    // hoàn duyệt (khách hàng chốt 28/09 giữ quyền ấy). Kế toán không có nút nào.
    SA_SUA_BAN_CUNG: { sa01: ['SA_HANDOVER'], tbp01: ['TBP_RECALL'] },
    CHO_KT_L2: {
      kt01: ['KT_RECEIVE_L2', 'KT_RETURN_L2', 'KT_REQUEST_REPRINT'],
      tbp01: ['TBP_RECALL'],
    },
    YEU_CAU_CHINH_SUA: { tdv01: ['RESUBMIT_AFTER_EDIT'] },
    // `SUPERSEDE` cũng của hệ thống — không ai bấm cho bản đang hiệu lực hết hạn.
    DANG_CO_HIEU_LUC: {},
    HET_HIEU_LUC: {},
    DA_XOA: {},
  };

  /**
   * Vai trò KHÔNG THẤY hồ sơ ở trạng thái ấy — 403, không phải "không có nút".
   *
   * Để riêng khỏi `MONG_DOI` vì hai bảng trả lời hai câu khác nhau: bảng kia hỏi
   * *"bấm được gì"*, bảng này hỏi *"mở được không"*. Gộp lại thì một hồ sơ biến
   * mất khỏi tầm mắt một vai trò trông y hệt một hồ sơ hết việc để làm.
   */
  const KHONG_THAY: Record<string, string[]> = {
    /*
     * `0157` — Kế toán chỉ thấy hồ sơ ĐÃ TỪNG TỚI BÀN MÌNH, ở MỌI trạng thái.
     *
     * `0142` chỉ giấu ở `CHO_TBP_DUYET`; giờ điều kiện bỏ hẳn vế trạng thái, nên
     * ba trạng thái dưới đây — những trạng thái ĐẾN ĐƯỢC mà không cần chữ ký
     * Trưởng bộ phận — cũng khuất mắt Kế toán.
     */
    NHAP: ['kt01'],
    CHO_TBP_DUYET: ['kt01'],
    YEU_CAU_CHINH_SUA: ['kt01'],
    DA_XOA: ['kt01'],
  };

  /**
   * Trạng thái CHỈ đến được sau chữ ký Trưởng bộ phận (`0157`).
   *
   * Ca này vặn thẳng `status` bằng SQL, nên nó phải tự đặt `da_qua_tbp` cho khớp
   * — nếu không thì nó dựng ra một tổ hợp KHÔNG TỒN TẠI trong đời thật
   * (`CHO_KT_L1` mà chưa qua TBP) và hỏi hệ thống cư xử thế nào với nó.
   *
   * Đó đúng là cái bẫy `0142` đã để lại: một fixture như vậy nằm trong bộ kiểm
   * suốt hai chặng, xanh, và không bảo vệ gì.
   */
  const SAU_CHU_KY_TBP = new Set([
    'CHO_KT_L1',
    'SA_DANG_XU_LY',
    'SA_SUA_BAN_CUNG',
    'CHO_KT_L2',
    'DANG_CO_HIEU_LUC',
    'HET_HIEU_LUC',
  ]);

  for (const [tt, mong] of Object.entries(MONG_DOI)) {
    it(`hồ sơ ${tt}: mỗi vai trò chỉ thấy đúng việc của mình`, async () => {
      const d = await draft();
      // Bốn cột người phải có mặt thì bốn vai trò mới MỞ được hồ sơ — không mở
      // được thì 403, và ca này không phân biệt được "không có nút" với "không
      // thấy hồ sơ". Gửi duyệt một lần là đủ để điền `tbp` và `keToan`.
      await act(d.id, 'SUBMIT', 'tdv01');
      await withAdminDb(async (c) => {
        await c.query(
          `UPDATE pol.policy
              SET sale_admin_user_id = (SELECT id FROM idn.app_user WHERE username = 'sa01'),
                  status = $2::pol.policy_status,
                  da_qua_tbp = $3,
                  pending_step = NULL
            WHERE id = $1`,
          [d.id, tt, SAU_CHU_KY_TBP.has(tt)],
        );
      });

      for (const who of ['tdv01', 'tbp01', 'kt01', 'sa01', 'bld01']) {
        if ((KHONG_THAY[tt] ?? []).includes(who)) {
          const r = await get(`/policies/${d.id}/allowed-actions`, who);
          expect(r.status, `${tt} × ${who} phải KHÔNG thấy hồ sơ`).toBe(403);
          continue;
        }
        const co = [...(await nut(d.id, who))].sort();
        expect(co, `${tt} × ${who}`).toEqual([...(mong[who] ?? [])].sort());
      }

      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.id]),
      );
    });
  }

  it('hành động của HỆ THỐNG không lọt ra cho vai trò nào', async () => {
    /*
     * `SUPERSEDE` do máy chạy — không ai bấm cho một bản đang hiệu lực hết hạn.
     * Trước `0038` nó hiện thành nút, và vì không có nhãn tiếng Việt nên hiện
     * nguyên mã viết hoa.
     *
     * Ca này từng dựng hồ sơ ở `TBP_DA_KY_SO` để thử `PUBLISH_SIGNED`. Cả hai
     * đã đi: trạng thái gỡ khỏi máy trạng thái ở `0064`, giá trị enum gỡ khỏi
     * CSDL ở `0048`. Nên nó chuyển sang thử `DANG_CO_HIEU_LUC` — trạng thái duy
     * nhất còn lại có một hành động HỆ THỐNG đi ra.
     */
    const d = await draft();
    const r = await runToActive(d);
    expect(r.body.status).toBe('DANG_CO_HIEU_LUC');

    for (const who of ['tdv01', 'tbp01', 'kt01', 'sa01', 'bld01']) {
      expect(await nut(d.id, who), `${who} không được thấy nút nào`).toEqual([]);
    }
  });

  it('Ban lãnh đạo mở được hồ sơ ở mọi bước mà không có nút nào', async () => {
    // Muc 2.6: chỉ đọc. Đây là vai trò dễ lọt nhất — họ thấy MỌI hồ sơ.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await get(`/policies/${d.id}`, 'bld01')).status).toBe(200);
    expect(await nut(d.id, 'bld01')).toEqual([]);

    await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(await nut(d.id, 'bld01')).toEqual([]);
  });

  it('lỗi INVALID_TRANSITION vẫn liệt kê ĐỦ hành động của trạng thái', async () => {
    /*
     * Vế ngược: danh sách trong THÔNG BÁO LỖI không được lọc theo vai trò.
     *
     * Câu đó nói về trạng thái — "ở đây chỉ đi tiếp được bằng X hoặc Y" — nên nó
     * phải kể cả hành động của người khác. Lọc luôn ở đây thì Kế toán bấm nhầm
     * sẽ đọc được "hành động được phép: không có", và hiểu ra là hồ sơ hỏng chứ
     * không phải là đang chờ Trưởng bộ phận.
     */
    /*
     * Người bấm nhầm ở đây là TDV chứ không phải Kế toán: `0142` giấu hẳn hồ sơ
     * ở lượt chờ TBP đầu tiên khỏi Kế toán, nên họ nhận 403 trước khi câu
     * `INVALID_TRANSITION` kịp dựng. Luật cần kiểm không đổi — danh sách trong
     * câu báo lỗi kể ĐỦ hành động của trạng thái, kể cả của vai trò khác.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
    expect([...(r.body.allowed as string[])].sort()).toEqual(['TBP_RETURN', 'TBP_SIGN']);
  });
});

describe('POL-15 phạm vi dữ liệu khi lập hồ sơ', () => {
  it('tdv02 lập hồ sơ cho khách hàng của tdv01 thì 403', async () => {
    const customerId = await makeCustomer('tdv01');
    const r = await post('/policies', { customerId, lines: [line(await makeProduct())] }, 'tdv02');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });

  it('kế toán chỉ đọc được hồ sơ ĐƯỢC GIAO cho mình (`0031`)', async () => {
    // Bản cũ dựa vào cây: kt01 đọc được vì tdv01 nằm dưới quyền mình, kt02 thì
    // không. Giờ căn cứ là phân công trên chính hồ sơ, nên hồ sơ còn NHÁP thì
    // KHÔNG kế toán nào đọc được — kể cả người sắp được chọn.
    const d = await draft();
    expect((await get(`/policies/${d.id}`, 'kt01')).status).toBe(403);
    expect((await get(`/policies/${d.id}`, 'kt02')).status).toBe(403);

    /*
     * Gửi duyệt và chọn kt01 — nhưng `0142` chèn thêm một điều kiện NỮA vào
     * đúng chỗ này: được giao là chưa đủ, hồ sơ còn phải ĐÃ TỪNG qua tay Trưởng
     * bộ phận. Ở lượt chờ TBP đầu tiên kt01 vẫn 403, y như kt02 — hai con số
     * giống nhau vì hai lý do khác hẳn nhau.
     */
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await get(`/policies/${d.id}`, 'kt01')).status).toBe(403);
    expect((await get(`/policies/${d.id}`, 'kt02')).status).toBe(403);

    // TBP ký xong thì phân công mới có hiệu lực thật: kt01 đọc được, kt02 không.
    await act(d.id, 'TBP_SIGN', 'tbp01');
    expect((await get(`/policies/${d.id}`, 'kt01')).status).toBe(200);
    expect((await get(`/policies/${d.id}`, 'kt02')).status).toBe(403);
  });
});

describe('POL-16 số phiên bản', () => {
  it('cập nhật lần thứ ba thì version_no = 3', async () => {
    const d = await draft();
    await runToActive(d);

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await runToActive({ id: v2.body.id });

    const v3 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['7000'] })],
    });
    expect(v3.body.versionNo).toBe(3);
  });
});

describe('POL-17 hai hồ sơ cho cùng khách hàng gửi đồng thời', () => {
  /*
   * `0197` — CA NÀY THAY BẢN CŨ, không sửa số.
   *
   * Bản cũ mở đầu bằng *"cả hai ở Nháp được"* rồi mới đi tới phần đáng giá. Vế
   * ấy là chính thứ khách hàng vừa cấm (10/09), nên nó phải đi; bất biến POL-17
   * bảo vệ — **chỉ một hồ sơ kích hoạt được** — thì còn nguyên và vẫn cần canh.
   *
   * Đường tới hai hồ sơ song song giờ đi qua lượt GỬI DUYỆT: hồ sơ rời `NHAP` là
   * chỗ trống ra, và đó cũng là hình dạng thật của tình huống này — một bản đang
   * chờ duyệt, một bản mới lập.
   */
  it('`0197` hai lượt lập SONG SONG cho cùng khách: một 201, một 409', async () => {
    /*
     * Đây là ca canh CHỈ MỤC, không canh phép kiểm ở service.
     *
     * `Promise.all` cho hai request cùng đọc thấy *"chưa có Nháp nào"* rồi cùng
     * ghi — đúng kịch bản bấm đúp nút *Lập hồ sơ*, tức đúng thứ sinh ra cả yêu
     * cầu này. Gỡ `uq_policy_dang_do_moi_khach` (`0220` — thay chỉ mục Nháp của `0197`) thì phép kiểm ở service vẫn xanh ở
     * mọi ca tuần tự, và chỉ ca này đỏ.
     */
    const customerId = await makeCustomer();
    /*
     * DỰNG XONG SẢN PHẨM TRƯỚC, rồi mới bắn hai lượt.
     *
     * Bản đầu của ca này viết `await makeProduct()` NGAY TRONG mảng của
     * `Promise.all`, và nó **không hề chạy song song**: phần tử mảng dựng lần
     * lượt, nên lượt `post` thứ nhất đã bay đi trong khi `makeProduct` thứ hai
     * còn đang đi một vòng mạng — thừa thời gian để lượt đầu ghi xong. Đo được:
     * gỡ hẳn chỉ mục mà cả 312 ca vẫn xanh.
     *
     * Một `Promise.all` KHÔNG tự làm cho hai việc chạy song song; thứ làm điều
     * đó là cả hai promise đã được TẠO trước khi cái nào bị chờ.
     */
    const sp = [await makeProduct(), await makeProduct()];
    const [a, b] = await Promise.all([
      post('/policies', { customerId, lines: [line(sp[0]!)] }),
      post('/policies', { customerId, lines: [line(sp[1]!)] }),
    ]);

    const ma = [a.status, b.status].sort();
    expect(ma, `song song ra ${a.status}/${b.status}`).toEqual([201, 409]);

    const hong = a.status === 409 ? a : b;
    const duoc = a.status === 201 ? a : b;
    // Cùng MỘT câu lỗi với đường tuần tự, và trỏ đúng bản vừa thắng — người bấm
    // đúp không được nhận một màn hình khác người bấm một lần.
    expect(hong.body.code).toBe('DRAFT_EXISTS');
    expect(hong.body.draftPolicyId).toBe(duoc.body.id);
  });

  it('`0220` bản đầu còn đang duyệt thì KHÔNG lập được bản thứ hai', async () => {
    /*
     * THAY ca *"chỉ một hồ sơ của cùng khách kích hoạt được"*. Ca cũ lập bản
     * thứ hai ngay sau khi bản đầu gửi duyệt rồi đẩy cả hai tới bước cuối để
     * thấy `uq_policy_active_per_customer` chặn — đường tới ấy giờ đóng từ lượt
     * LẬP (khách hàng chốt 25/09), nên bất biến POL-17 được giữ sớm hơn chín
     * bước. Chỉ mục một-CSBH-hiệu-lực vẫn còn ở CSDL; nó chỉ thôi với tới được
     * bằng API.
     */
    const customerId = await makeCustomer();
    const a = await post('/policies', { customerId, lines: [line(await makeProduct())] });
    expect(a.status).toBe(201);
    expect((await act(a.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const b = await post('/policies', { customerId, lines: [line(await makeProduct())] });
    expect(b.status).toBe(409);
    expect(b.body.code).toBe('POLICY_IN_PROGRESS');
    expect(b.body.policyId).toBe(a.body.id);
    expect(b.body.policyCode).toBe(a.body.code);
    expect(b.body.status).toBe('CHO_TBP_DUYET');
  });
});

/**
 * `0197` — MỘT BẢN NHÁP MỖI KHÁCH HÀNG (chốt 10/09).
 *
 * *"Để tránh spam tạo quá nhiều bản Nháp đối với 1 khách hàng."* Luật gọn, và
 * chỗ dễ làm sai nằm ở RANH GIỚI của nó: chặn đúng `NHAP`, không chặn rộng ra
 * `YEU_CAU_CHINH_SUA` (cùng nằm trong `SUA_DUOC`, rất dễ gộp nhầm), và không
 * chặn hồ sơ đã rời khỏi Nháp bằng bất kỳ đường nào.
 */
describe('`0197` một bản Nháp mỗi khách hàng', () => {
  it('lập bản thứ hai thì 409 và trỏ về bản Nháp đang có', async () => {
    const d = await draft();
    const lai = await post('/policies', {
      customerId: d.customerId,
      lines: [line(await makeProduct())],
    });
    expect(lai.status).toBe(409);
    expect(lai.body.code).toBe('DRAFT_EXISTS');
    // Id là thứ làm nút *Mở bản Nháp đang có* bấm được; thiếu nó thì câu lỗi chỉ
    // còn là một lời từ chối.
    expect(lai.body.draftPolicyId).toBe(d.id);
  });

  /*
   * Vế *"xoá bản Nháp rồi thì lập lại được"* KHÔNG viết lại ở đây — ca
   * *"xoá nháp rồi lập lại cho cùng khách hàng thì được"* của POL-13 đã khẳng
   * định đúng điều ấy từ trước, và từ `0197` nó gánh thêm một việc: canh cho chỉ
   * mục `uq_policy_dang_do_moi_khach` (`0220`) là chỉ mục PHẦN, chứ không phải một ràng buộc
   * giữ chỗ vĩnh viễn. Viết bản thứ hai là dựng hai ca sẽ trôi khỏi nhau.
   */

  it('`0220` hồ sơ ở YÊU CẦU CHỈNH SỬA CŨNG chặn lượt lập mới — ĐẢO ca `0197`', async () => {
    /*
     * Ca `0197` ở chỗ này là một ca CHIỀU DƯƠNG: nó khẳng định hồ sơ bị trả về
     * KHÔNG chặn, vì *"cấm ở đó là một luật không ai yêu cầu"*. Khách hàng yêu
     * cầu đúng luật ấy ngày 25/09, nên ca đảo chiều chứ không xoá — ranh giới
     * vẫn cần canh, chỉ là nó dời chỗ.
     *
     * Mã lỗi là `POLICY_IN_PROGRESS`, không phải `DRAFT_EXISTS`: hồ sơ ấy đã
     * vào luồng, và việc của TDV là sửa rồi gửi lại CHÍNH nó.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect(
      (await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' })).status,
    ).toBe(200);

    const lai = await post('/policies', {
      customerId: d.customerId,
      lines: [line(await makeProduct())],
    });
    expect(lai.status).toBe(409);
    expect(lai.body.code).toBe('POLICY_IN_PROGRESS');
    expect(lai.body.status).toBe('YEU_CAU_CHINH_SUA');
  });

  it('chặn cả đường LẬP PHIÊN BẢN MỚI, không riêng bản đầu', async () => {
    // `mode: NEW_VERSION` đi một nhánh khác trong `create`. Một bản nháp đang dở
    // là một bản nháp đang dở, không phụ thuộc nó sẽ thành phiên bản thứ mấy.
    const d = await draft();
    await runToActive(d);
    const moi = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(moi.status).toBe(201);

    const nua = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(nua.status).toBe(409);
    expect(nua.body.code).toBe('DRAFT_EXISTS');
    expect(nua.body.draftPolicyId).toBe(moi.body.id);
  });

  it('trả DRAFT_EXISTS TRƯỚC NEW_VERSION_REQUIRED — câu nào có việc để làm thì hỏi trước', async () => {
    /*
     * Khách có CẢ bản đang hiệu lực LẪN một bản nháp, và người lập bấm nút của
     * bản đầu (không `mode`). Hai chốt cùng nói *"đừng lập cái mới"*, nhưng chỉ
     * một chốt đưa ra được việc làm ngay — mở bản nháp đang có.
     */
    const d = await draft();
    await runToActive(d);
    const nhap = await post('/policies', { customerId: d.customerId, mode: 'NEW_VERSION', lines: [] });
    expect(nhap.status).toBe(201);

    const r = await post('/policies', { customerId: d.customerId, lines: [] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DRAFT_EXISTS');
  });

  it('khách KHÁC không bị chặn theo nhau', async () => {
    // Chỉ mục là `(customer_id) WHERE status = 'NHAP'` — ca này canh vế `WHERE`
    // không nới thành *"một bản Nháp trong cả hệ thống"*.
    await draft();
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(201);
  });
});

/**
 * `0220` — MỖI KHÁCH CHỈ MỘT HỒ SƠ ĐANG XỬ LÝ (chốt 25/09).
 *
 * *"Không tính các CSBH đang có hiệu lực, đã xoá, hết hiệu lực"* — cộng
 * `QUA_HAN_DUYET`, chốt khi được hỏi. Mười trạng thái chia đôi thành sáu chặn và
 * bốn không chặn, và ca kiểm đi hết CẢ MƯỜI: thiếu một vế là để trống đúng chỗ
 * luật dễ lệch nhất — hằng `CHUA_DUYET_XONG` thêm/bớt một trạng thái, hoặc vị từ
 * của chỉ mục gõ tay trong migration trôi khỏi hằng ấy.
 */
describe('`0220` một hồ sơ đang xử lý mỗi khách hàng', () => {
  /** Đẩy một bản Nháp mới tới đúng trạng thái, bằng chính các hành động của luồng. */
  const denTrangThai = async (tt: string) => {
    const d = await draft();
    if (tt === 'NHAP') return d;
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    if (tt === 'CHO_TBP_DUYET') return d;
    if (tt === 'YEU_CAU_CHINH_SUA') {
      expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' })).status).toBe(200);
      return d;
    }
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    if (tt === 'CHO_KT_L1') return d;
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    if (tt === 'SA_DANG_XU_LY') return d;
    await post(`/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 's.pdf', objectKey: `scan/${d.id}.pdf` }, 'sa01');
    await post(`/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'bm.pdf', objectKey: `bm/${d.id}.pdf` }, 'sa01');
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    if (tt === 'CHO_KT_L2') return d;
    // `0225` — đi đường thật tới trạng thái mới: Kế toán yêu cầu in lại.
    expect((await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'In lai' })).status).toBe(200);
    return d;
  };

  const lapLai = (customerId: string) =>
    post('/policies', { customerId, mode: 'NEW_VERSION', lines: [] });

  it('bảy trạng thái được tính ĐÚNG BẰNG `CHUA_DUYET_XONG`', () => {
    // Ghim tập, để ca vòng lặp ngay dưới không lặng lẽ đi theo một hằng đã nới.
    // `0225` thêm `SA_SUA_BAN_CUNG` — sáu thành bảy.
    expect([...CHUA_DUYET_XONG].sort()).toEqual(
      ['CHO_KT_L1', 'CHO_KT_L2', 'CHO_TBP_DUYET', 'NHAP', 'SA_DANG_XU_LY', 'SA_SUA_BAN_CUNG',
       'YEU_CAU_CHINH_SUA'],
    );
  });

  for (const tt of ['NHAP', 'YEU_CAU_CHINH_SUA', 'CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY',
                    'SA_SUA_BAN_CUNG', 'CHO_KT_L2']) {
    it(`hồ sơ ${tt} chặn lượt lập mới, và câu lỗi trỏ đúng hồ sơ ấy`, async () => {
      const d = await denTrangThai(tt);
      const r = await post('/policies', { customerId: d.customerId, lines: [line(await makeProduct())] });
      expect(r.status).toBe(409);
      if (tt === 'NHAP') {
        // Bản Nháp giữ mã cũ của `0197`: việc làm được là SOẠN TIẾP, khác hẳn.
        expect(r.body.code).toBe('DRAFT_EXISTS');
        expect(r.body.draftPolicyId).toBe(d.id);
      } else {
        expect(r.body.code).toBe('POLICY_IN_PROGRESS');
        expect(r.body.policyId).toBe(d.id);
        expect(r.body.status).toBe(tt);
      }
    });
  }

  it('DANG_CO_HIEU_LUC và HET_HIEU_LUC KHÔNG chặn', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await lapLai(d.customerId);
    expect(v2.status, 'bản đang hiệu lực không được chặn phiên bản mới').toBe(201);
    await runToActive({ id: v2.body.id });
    // Giờ bản đầu là HET_HIEU_LUC và bản hai là DANG_CO_HIEU_LUC — cả hai không tính.
    const trangThai = await withAdminDb(async (c) =>
      (await c.query<{ status: string }>(`SELECT status::text AS status FROM pol.policy WHERE id = $1`, [d.id])).rows[0]!.status,
    );
    expect(trangThai).toBe('HET_HIEU_LUC');
    expect((await lapLai(d.customerId)).status).toBe(201);
  });

  it('DA_XOA KHÔNG chặn', async () => {
    // Đi đường thật: bị trả về rồi TDV xoá (`0155`) — bản Nháp xoá là xoá hẳn dòng.
    const d = await denTrangThai('YEU_CAU_CHINH_SUA');
    expect((await del(`/policies/${d.id}`)).status).toBeLessThan(300);
    const r = await post('/policies', { customerId: d.customerId, lines: [line(d.productId)] });
    expect(r.status).toBe(201);
  });

  it('QUA_HAN_DUYET KHÔNG chặn — trạng thái kết thúc, chốt khi được hỏi', async () => {
    /*
     * Dựng bằng CSDL như các ca `0047` — `sla-worker` là đường duy nhất tới đây,
     * và tổ hợp `CHO_TBP_DUYET` → `QUA_HAN_DUYET` kèm `pending_step` là tổ hợp
     * nó thật sự sinh ra.
     */
    const d = await denTrangThai('CHO_TBP_DUYET');
    await withAdminDb((c) =>
      c.query(
        `UPDATE pol.policy SET status = 'QUA_HAN_DUYET', pending_step = 'B4_TBP_DUYET',
                overdue_at = now() WHERE id = $1`,
        [d.id],
      ),
    );
    const r = await post('/policies', { customerId: d.customerId, lines: [line(d.productId)] });
    expect(r.status).toBe(201);
  });

  it('vị từ của chỉ mục ở CSDL liệt kê ĐÚNG tập `CHUA_DUYET_XONG`', async () => {
    /*
     * Migration phải gõ sáu trạng thái thành chữ — không có cách nào để một
     * `CREATE INDEX … WHERE` đọc một hằng TypeScript. Hỏi thẳng `pg_indexes`
     * thay vì đọc tệp `.sql`: thứ chạy là chỉ mục trong CSDL (bài học `0198`).
     */
    const def = await withAdminDb(async (c) =>
      (await c.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'pol' AND indexname = $1`,
        [UQ_DANG_DO],
      )).rows[0]?.indexdef,
    );
    expect(def, `không có chỉ mục ${UQ_DANG_DO}`).toBeDefined();
    const trongChiMuc = [...def!.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]!).sort();
    expect(trongChiMuc).toEqual([...CHUA_DUYET_XONG].sort());
    // Chỉ mục cũ của `0197` phải đi — hai tên cho một lượt vi phạm là câu lỗi
    // tuỳ bản nào nổ trước.
    const cu = await withAdminDb(async (c) =>
      (await c.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'uq_policy_nhap_moi_khach'`)).rowCount,
    );
    expect(cu).toBe(0);
  });

  it('trả POLICY_IN_PROGRESS TRƯỚC NEW_VERSION_REQUIRED — cùng thứ tự `0197` đặt cho bản Nháp', async () => {
    /*
     * Ca này là thứ DUY NHẤT phân biệt phép kiểm ở service với chỉ mục ở CSDL.
     * Thu phép kiểm về lại `status = 'NHAP'` thì mọi ca khác vẫn xanh — lượt
     * `INSERT` vấp `uq_policy_dang_do_moi_khach` và `doiTrungNhap` trả đúng câu
     * này. Nhưng khách đã có CSBH hiệu lực mà người lập không khai `mode` thì
     * `NEW_VERSION_REQUIRED` nổ TRƯỚC lượt `INSERT`, và người dùng được mời lập
     * một phiên bản mới mà máy chủ sẽ từ chối ở lượt bấm kế tiếp.
     */
    const d = await draft();
    await runToActive(d);
    const moi = await lapLai(d.customerId);
    expect(moi.status).toBe(201);
    expect((await act(moi.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const r = await post('/policies', { customerId: d.customerId, lines: [] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_IN_PROGRESS');
    expect(r.body.policyId).toBe(moi.body.id);
  });

  it('hai lượt lập SONG SONG khi khách đang có hồ sơ chờ duyệt: cả hai 409, không cái nào lọt', async () => {
    const d = await denTrangThai('CHO_KT_L1');
    const sp = [await makeProduct(), await makeProduct()];
    const kq = await Promise.all([
      post('/policies', { customerId: d.customerId, lines: [line(sp[0]!)] }),
      post('/policies', { customerId: d.customerId, lines: [line(sp[1]!)] }),
    ]);
    expect(kq.map((r) => r.status)).toEqual([409, 409]);
  });

  it('`phienBanSau` hỏi theo KHÁCH HÀNG — trùng câu hỏi của chốt chặn', async () => {
    /*
     * Hộp *Lập phiên bản mới* đọc trường này để BIẾT TRƯỚC nút sẽ bị từ chối.
     * Hồ sơ đang xử lý trong ca này KHÔNG phải bản kế nhiệm của bản đang hiệu
     * lực (không có `supersedes_id` trỏ về nó) — câu hỏi cũ theo `supersedes_id`
     * trả `null` rồi hộp mời bấm một nút mà máy chủ sẽ từ chối.
     *
     * Trạng thái vặn bằng CSDL này ĐẾN ĐƯỢC, chỉ không còn đến được từ `0220`:
     * trước đó khách có hai hồ sơ song song, bản A lên hiệu lực trong khi bản B
     * (lập lúc chưa có bản nào hiệu lực, nên `supersedes_id` rỗng) còn đang
     * duyệt. Migration giữ lại đúng tổ hợp ấy — nó chỉ chặn HAI hồ sơ đang xử lý.
     */
    const d = await draft();
    await runToActive(d);
    const moi = await lapLai(d.customerId);
    expect(moi.status).toBe(201);
    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET supersedes_id = NULL WHERE id = $1`, [moi.body.id]),
    );
    const doc = (await get(`/policies/${d.id}`)).body;
    expect(doc.phienBanSau?.id).toBe(moi.body.id);
  });
});

/**
 * `0198` — MÃ HỒ SƠ do TDV đặt, và duy nhất (chốt 10/09).
 *
 * Ba yêu cầu khoá vào nhau: đề xuất mã lúc lập · sửa được trong lúc còn *Nháp* ·
 * không cho trùng. Yêu cầu thứ ba là ĐIỀU KIỆN của hai yêu cầu kia — tới `0197`
 * cột `code` không có ràng buộc nào, nó duy nhất chỉ vì không ai gõ được nó.
 */
describe('`0198` mã hồ sơ do TDV đặt', () => {
  // `uniq` gắn tiền tố `ZZPOL` — cùng khuôn với mọi thứ bộ kiểm tạo ra, nên
  // bước dọn đầu lượt chạy nhặt được (`0156`).
  let dem = 0;
  const maRieng = () => uniq(`ma${(dem += 1)}`);

  it('đề xuất một mã, và HAI lượt hỏi cho HAI mã khác nhau', async () => {
    /*
     * Vế thứ hai là cả lý do lượt đề xuất ĐỐT một số của sequence. Cách kia —
     * đọc `last_value + 1` mà không lấy — cho hai TDV mở màn hình cùng lúc đúng
     * một mã, tức đẩy một người vào lỗi trùng với con số họ không tự gõ.
     */
    const a = await get('/policies/ma-de-xuat');
    expect(a.status).toBe(200);
    expect(a.body.code).toMatch(/^CSBH-\d{4}-\d{6}$/);

    const b = await get('/policies/ma-de-xuat');
    expect(b.body.code).not.toBe(a.body.code);
  });

  it('mã đề xuất DÙNG ĐƯỢC ngay — không bị chính phép kiểm của mình từ chối', async () => {
    // Ca đối chiếu: hai đầu của cùng một đường phải khớp nhau. Siết `chuanHoaMa`
    // mà quên hình dạng máy chủ đang sinh là mọi lượt lập đều 400.
    const de = (await get('/policies/ma-de-xuat')).body.code as string;
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      code: de,
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(de);
  });

  it('lập hồ sơ với mã TỰ GÕ thì lưu đúng mã ấy', async () => {
    const ma = maRieng();
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      code: `  ${ma}  `,
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(201);
    // Cắt khoảng trắng hai đầu: người dùng gõ dư một dấu cách thì mã hiện ra
    // phải là mã họ nhìn thấy, không phải chuỗi thô.
    expect(r.body.code).toBe(ma);
  });

  it('KHÔNG gửi mã thì máy chủ tự sinh — bốn chỗ gọi máy-với-máy vẫn chạy', async () => {
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^CSBH-/);
  });

  it('mã TRÙNG thì không lập được', async () => {
    const d = await draft();
    const r = await post('/policies', {
      customerId: await makeCustomer(),
      code: d.body.code,
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_CODE_TAKEN');
  });

  it('mã của hồ sơ ở *Đã xoá* KHÔNG dùng lại được — mã giữ chỗ vĩnh viễn', async () => {
    /*
     * Khách hàng chốt 10/09, và đây là chỗ luật này NGƯỢC với `uq_customer_id_number`
     * (`0114`): mã số thuế định danh một pháp nhân đang tồn tại, còn mã hồ sơ
     * định danh một VĂN BẢN — hồ sơ *Đã xoá* vẫn nằm trong nhật ký và báo cáo.
     *
     * Hồ sơ phải đi qua luồng duyệt rồi mới xoá được thành `DA_XOA`; xem ca
     * ngay dưới về đường còn lại.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' });
    const maCu = d.body.code as string;
    expect((await del(`/policies/${d.id}`)).status).toBe(204);
    expect((await get(`/policies/${d.id}`)).body.status).toBe('DA_XOA');

    const r = await post('/policies', {
      customerId: await makeCustomer(),
      code: maCu,
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_CODE_TAKEN');
  });

  it('mã của bản NHÁP đã xoá thì DÙNG LẠI ĐƯỢC — bản nháp xoá là xoá hẳn', async () => {
    /*
     * VẾ NÀY LỘ RA LÚC CHẠY CA TRÊN, và nó KHÔNG mâu thuẫn với quyết định
     * *"giữ chỗ vĩnh viễn"*: quyết định ấy nói về hồ sơ CÒN NẰM LẠI trong hồ sơ
     * lưu trữ. Bản Nháp xoá đi thì `0035` **xoá hẳn dòng**, không để lại một vết
     * nào — không nhật ký, không báo cáo — nên không còn gì để cái mã ấy gây nhập
     * nhằng với.
     *
     * Nó cũng làm biến mất đúng cái giá đã nêu với khách hàng lúc chốt: *lập
     * nhầm một bản Nháp rồi xoá thì mất luôn mã ấy*. Không mất.
     */
    const d = await draft();
    const maCu = d.body.code as string;
    expect((await del(`/policies/${d.id}`)).status).toBe(204);
    expect((await get(`/policies/${d.id}`)).status).toBe(404);

    const r = await post('/policies', {
      customerId: await makeCustomer(),
      code: maCu,
      lines: [line(await makeProduct())],
    });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(maCu);
  });

  it('mã hỏng hình dạng thì 400, kèm tên ô để giao diện dán câu đúng chỗ', async () => {
    for (const xau of ['', '   ', 'a"b', 'a/b', 'x'.repeat(60)]) {
      const r = await post('/policies', {
        customerId: await makeCustomer(),
        code: xau,
        lines: [],
      });
      expect(r.status, `mã ${JSON.stringify(xau)}`).toBe(400);
      expect(r.body.code).toBe('POLICY_CODE_INVALID');
      expect(r.body.field).toBe('code');
    }
  });

  it('SỬA mã khi hồ sơ còn Nháp', async () => {
    const d = await draft();
    const ma = maRieng();
    const r = await patch(`/policies/${d.id}/ma`, { code: ma });
    expect(r.status).toBe(200);
    expect(r.body.code).toBe(ma);
    // Đọc lại từ đường chính, không tin thân trả về: hai chỗ đọc khác nhau thì
    // một trong hai đang nói dối.
    expect((await get(`/policies/${d.id}`)).body.code).toBe(ma);
  });

  it('sửa mã thành mã ĐANG CÓ thì 409', async () => {
    const a = await draft();
    const b = await draft();
    const r = await patch(`/policies/${b.id}/ma`, { code: a.body.code });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_CODE_TAKEN');
    // Không đổi gì — hồ sơ giữ nguyên mã cũ.
    expect((await get(`/policies/${b.id}`)).body.code).toBe(b.body.code);
  });

  it('sửa mã thành CHÍNH NÓ thì không sao', async () => {
    // Người dùng bấm bút chì rồi bấm dấu tick mà chưa sửa chữ nào. Không có
    // nhánh này thì lượt ấy vấp chính chỉ mục duy nhất và báo *"mã đã có"* —
    // đúng theo CSDL, vô nghĩa với người đang nhìn.
    const d = await draft();
    const r = await patch(`/policies/${d.id}/ma`, { code: d.body.code });
    expect(r.status).toBe(200);
  });

  it('hồ sơ ĐÃ GỬI DUYỆT thì KHÔNG đổi mã được', async () => {
    /*
     * Ranh giới của chặng: `mustEdit` cho cả `YEU_CAU_CHINH_SUA`, còn đây phải
     * hẹp hơn nó. Mã của một hồ sơ đã gửi duyệt đã đi vào thư đã gửi, vào dòng
     * thông báo trên chuông, và có thể vào tên tệp một bản mềm đã lưu — đổi lúc
     * ấy là làm mọi tham chiếu kia trỏ vào hư không, lặng lẽ.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    const r = await patch(`/policies/${d.id}/ma`, { code: maRieng() });
    expect(r.status).toBe(409);
    /*
     * `POLICY_LOCKED`, KHÔNG phải `POLICY_CODE_LOCKED` — và hai mã ấy chia nhau
     * đúng theo nghĩa của chúng.
     *
     * Hồ sơ đã gửi duyệt thì khoá TOÀN BỘ, nên `mustEdit` trả lời trước bằng câu
     * chung; `POLICY_CODE_LOCKED` dành cho khe còn lại: hồ sơ *Yêu cầu chỉnh
     * sửa*, nơi hồ sơ SỬA ĐƯỢC mà riêng mã thì không (ca ngay dưới).
     */
    expect(r.body.code).toBe('POLICY_LOCKED');
  });

  it('hồ sơ BỊ TRẢ VỀ cũng KHÔNG đổi mã được', async () => {
    // Vế thứ hai của cùng ranh giới, và là vế dễ mất: `YEU_CAU_CHINH_SUA` nằm
    // trong `EDITABLE`, nên viết `mustEdit` một mình là nó lọt.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' })).status).toBe(200);
    const r = await patch(`/policies/${d.id}/ma`, { code: maRieng() });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_CODE_LOCKED');
  });

  it('TDV KHÁC không đổi được mã hồ sơ của người khác', async () => {
    const d = await draft();
    const r = await patch(`/policies/${d.id}/ma`, { code: maRieng() }, 'tdv02');
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('vai trò KHÔNG phải TDV thì 403', async () => {
    const d = await draft();
    expect((await patch(`/policies/${d.id}/ma`, { code: maRieng() }, 'tbp01')).status).toBe(403);
  });

  it('tên ràng buộc duy nhất đúng như mã nguồn đang tra', async () => {
    /*
     * `policies.service` bắt `23505` rồi ĐỐI CHIẾU TÊN ràng buộc để phân biệt
     * *trùng mã* với *đã có bản Nháp* — hai ràng buộc trên cùng một bảng.
     *
     * Tên ấy là `policy_code_key`, do Postgres TỰ ĐẶT cho `code text UNIQUE`
     * khai inline ở `0001_init.sql`. Nó KHÔNG xuất hiện trong mã nguồn migration
     * nào, nên không có cách nào đọc ra nó ngoài việc hỏi CSDL — và một lượt
     * đổi bảng về sau (`ALTER TABLE … ADD CONSTRAINT` tên khác) sẽ làm nhánh bắt
     * lỗi kia lặng lẽ hết khớp, trả `500` thay cho `409`.
     */
    const ten = await withAdminDb(async (c) => {
      const r = await c.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conrelid = 'pol.policy'::regclass AND contype = 'u'
            AND pg_get_constraintdef(oid) = 'UNIQUE (code)'`,
      );
      return r.rows.map((x) => x.conname);
    });
    expect(ten).toEqual(['policy_code_key']);
  });

  it('đổi mã thì PHÁT SỰ KIỆN — read-model giữ một bản sao của mã', async () => {
    // Thiếu sự kiện thì màn hình *Hồ sơ CSBH* và mọi báo cáo vẫn bày mã CŨ cho
    // tới lượt hồ sơ đổi trạng thái. Hai chỗ nói hai mã, và không gì đỏ.
    const d = await draft();
    await patch(`/policies/${d.id}/ma`, { code: maRieng() });
    const khoa = (await outboxFor(d.id)).map((e) => e.routing_key);
    expect(khoa.some((k) => k.startsWith('policy.'))).toBe(true);
  });
});

describe('POL-18 file đính kèm hồ sơ', () => {
  it('Nháp thì thêm và xoá được', async () => {
    const d = await draft();
    const a = await post(`/policies/${d.id}/attachments`, {
      kind: 'HO_SO',
      fileName: 'gpkd.pdf',
      objectKey: 'x/gpkd.pdf',
    });
    expect(a.status).toBe(201);
    expect((await del(`/policies/${d.id}/attachments/${a.body.id}`)).status).toBe(200);
  });

  it('đã gửi duyệt thì chỉ đọc', async () => {
    const d = await draft();
    await post(`/policies/${d.id}/attachments`, {
      kind: 'HO_SO',
      fileName: 'gpkd.pdf',
      objectKey: 'x/gpkd.pdf',
    });
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await post(`/policies/${d.id}/attachments`, {
      kind: 'HO_SO',
      fileName: 'them.pdf',
      objectKey: 'x/them.pdf',
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_LOCKED');
  });
});

describe('POL-19 gửi duyệt hồ sơ rỗng', () => {
  it('không có dòng sản phẩm nào thì 422', async () => {
    const r = await post('/policies', { customerId: await makeCustomer(), lines: [] });
    expect(r.status).toBe(201);
    const sub = await act(r.body.id, 'SUBMIT', 'tdv01');
    expect(sub.status).toBe(422);
    expect(sub.body.code).toBe('NO_LINES');
  });
});

// =============================================================================
// WF — luồng duyệt
// =============================================================================

describe('WF-01 gửi duyệt', () => {
  it('sang Chờ TBP duyệt, khoá sửa, đặt SLA, phát sự kiện tới TBP', async () => {
    const d = await draft();
    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_TBP_DUYET');

    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ days: string; submitted_by: string | null }>(
        `SELECT round(extract(epoch FROM (sla_due_at - now())) / 86400)::text AS days,
                submitted_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(Number(row.days)).toBe(14);
    expect(row.submitted_by).toBeTruthy();

    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.submit');
    expect(ev?.payload.recipients).toEqual(['TBP']);
  });
});

describe('WF-02 · WF-03 danh sách trạng thái là danh sách đóng', () => {
  it('hành động ngoài danh sách thì 400', async () => {
    const d = await draft();
    const r = await act(d.id, 'PHE_DUYET_NHANH', 'tdv01');
    expect(r.status).toBe(400);
  });

  it('không còn nhãn cũ nào trong enum', async () => {
    const labels = await withAdminDb(async (c) => {
      const r = await c.query<{ enumlabel: string }>(
        `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'policy_status'`,
      );
      return r.rows.map((x) => x.enumlabel);
    });
    for (const old of ['BAN_DEMO', 'DANG_DUYET', 'DA_CHUYEN_BUOC_SAU', 'DANG_AP_DUNG']) {
      expect(labels).not.toContain(old);
    }
    expect(labels).toContain('DANG_CO_HIEU_LUC');
  });
});

describe('WF-04 · WF-05 · WF-09 TBP ký số', () => {
  it('`0064` ký xong sang thẳng KT duyệt bản mềm — MỘT nước, MỘT lá thư', async () => {
    /*
     * Trước `0064` đây là hai nước: `TBP_SIGN` đặt `TBP_DA_KY_SO`, rồi
     * `PUBLISH_SIGNED` chuyển tiếp sang `CHO_KT_L1` trong cùng transaction.
     * Trạng thái giữa không ai từng nhìn thấy, nhưng nó phát THÊM một sự kiện
     * thư gửi Kế toán — mà Kế toán đã có tên trong lá thư của `TBP_SIGN`. Mỗi
     * lần Trưởng bộ phận ký, kế toán nhận hai thư trong cùng một giây.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_KT_L1');

    const keys = (await outboxFor(d.id)).map((e) => e.routing_key);
    expect(keys).toContain('policy.tbp_sign');
    expect(keys, 'còn phát lá thư thứ hai').not.toContain('policy.publish_signed');

    // Và đúng MỘT dòng lịch sử cho một lần bấm nút.
    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    const ma = events.map((e) => e.action);
    expect(ma).toContain('TBP_SIGN');
    expect(ma).not.toContain('PUBLISH_SIGNED');
  });

  it('WF-05 ký lần thứ hai thì 409 ALREADY_SIGNED', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const again = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_SIGNED');
  });

  it('ghi mốc thời gian và người ký', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ tbp_signed_at: Date | null; tbp_signed_by: string | null }>(
        `SELECT tbp_signed_at, tbp_signed_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(row.tbp_signed_at).not.toBeNull();
    expect(row.tbp_signed_by).not.toBeNull();
  });
});

/**
 * `0185` — HOÀN DUYỆT: Trưởng bộ phận rút lại chữ ký của chính mình.
 *
 * Máy trạng thái đã có ca thuần ở `packages/domain-policy`; nhóm này đi ĐƯỜNG
 * HTTP THẬT, vì ba thứ chỉ lộ ra ở đó: chốt vai trò của controller, việc xoá
 * chữ ký, và người nào nhận thư.
 */
describe('`0185` Trưởng bộ phận hoàn duyệt', () => {
  /** Đẩy hồ sơ tới một trạng thái SAU chữ ký TBP, đi đúng đường thật. */
  const toi = async (dich: 'CHO_KT_L1' | 'SA_DANG_XU_LY' | 'CHO_KT_L2') => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    if (dich === 'CHO_KT_L1') return d;
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    if (dich === 'SA_DANG_XU_LY') return d;
    expect(
      (
        await post(
          `/policies/${d.id}/attachments`,
          { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
          'sa01',
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await post(
          `/policies/${d.id}/attachments`,
          { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `banmem/${d.id}.pdf` },
          'sa01',
        )
      ).status,
    ).toBe(201);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    return d;
  };

  it.each(['CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2'] as const)(
    'từ %s: hồ sơ về Yêu cầu chỉnh sửa, và CHỮ KÝ TBP bị xoá',
    async (dich) => {
      const d = await toi(dich);
      expect((await get(`/policies/${d.id}`, 'tbp01')).body.status).toBe(dich);

      const r = await act(d.id, 'TBP_RECALL', 'tbp01', { reason: 'Ky nham ho so' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');
      expect(r.body.lastReason).toBe('Ky nham ho so');

      /*
       * CHỮ KÝ PHẢI BỊ XOÁ, và đây là vế dễ mất nhất của cả lượt.
       *
       * `TBP_SIGN` chặn khi `tbp_signed_at` còn giá trị (`ALREADY_SIGNED`), nên
       * một lượt hoàn duyệt giữ nguyên chữ ký sẽ cho ra đúng lỗ hổng `P0` mà
       * `0101` đã vá: hồ sơ gửi lại rồi **không ký lại được** và nằm chết ở
       * *Chờ TBP duyệt*.
       */
      const cot = await withAdminDb((c) =>
        c.query<{ tbp_signed_at: Date | null; da_qua_tbp: boolean }>(
          `SELECT tbp_signed_at, da_qua_tbp FROM pol.policy WHERE id = $1`,
          [d.id],
        ),
      );
      expect(cot.rows[0]!.tbp_signed_at, 'chữ ký phải bị xoá').toBeNull();
      // …nhưng `da_qua_tbp` thì KHÔNG BAO GIỜ tắt (`0142`): nó trả lời "đã từng
      // ký chưa", và tắt nó là lấy lại quyền đọc của Kế toán.
      expect(cot.rows[0]!.da_qua_tbp).toBe(true);

      // Đi lại được trọn vòng: gửi lại rồi ký lại, không vướng ALREADY_SIGNED.
      expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(200);
      expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    },
    120_000,
  );

  it('thiếu lý do thì 400 REASON_REQUIRED', async () => {
    const d = await toi('SA_DANG_XU_LY');
    const r = await act(d.id, 'TBP_RECALL', 'tbp01');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REASON_REQUIRED');
  }, 60_000);

  it('KHÔNG làm được ở Chờ TBP duyệt — ở đó đã có sẵn Trả lại', async () => {
    /*
     * Trạng thái khách hàng loại trừ đích danh. Hai nút cùng làm một việc ở cùng
     * một chỗ là bắt người dùng đoán chúng khác nhau ở đâu.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    const r = await act(d.id, 'TBP_RECALL', 'tbp01', { reason: 'x' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
    // Câu lỗi nói ra đường đi thật ở đây.
    expect(r.body.allowed).toContain('TBP_RETURN');
  }, 60_000);

  it('KHÔNG làm được với hồ sơ ĐANG CÓ HIỆU LỰC', async () => {
    // Đường đúng khi ấy là lập phiên bản mới, không phải kéo bản đã ký quay lại.
    const d = await draft();
    await runToActive(d);
    const r = await act(d.id, 'TBP_RECALL', 'tbp01', { reason: 'x' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
  }, 120_000);

  it('CHỈ Trưởng bộ phận — ba vai trò kia nhận 403', async () => {
    const d = await toi('SA_DANG_XU_LY');
    for (const who of ['tdv01', 'kt01', 'sa01']) {
      const r = await act(d.id, 'TBP_RECALL', who, { reason: 'x' });
      expect(r.status, `${who} phải bị chặn`).toBe(403);
    }
  }, 90_000);

  it('KHÔNG lẫn với hành động cùng đích của Kế toán', async () => {
    /*
     * `0185` là cạnh ĐẦU TIÊN làm hai hành động của hai vai trò cùng đi tới một
     * đích từ cùng một trạng thái, và phép tra luật cũ — theo `(from, to, by)`,
     * không có tên hành động — khi ấy cho TBP thực hiện `KT_RETURN_L1`.
     *
     * Ca này đi đường HTTP thật để canh cả chốt của controller, không chỉ hàm
     * thuần: một lượt sửa nới `@Roles` cũng phải đỏ ở đây.
     */
    const d = await toi('CHO_KT_L1');
    const r = await act(d.id, 'KT_RETURN_L1', 'tbp01', { reason: 'x' });
    expect(r.status, 'TBP không mượn được đường của Kế toán').toBe(403);

    const k = await act(d.id, 'TBP_RECALL', 'kt01', { reason: 'x' });
    expect(k.status, 'Kế toán không mượn được đường của TBP').toBe(403);
  }, 90_000);

  it('ghi một dòng LỊCH SỬ mang đúng hành động và lý do', async () => {
    const d = await toi('SA_DANG_XU_LY');
    expect((await act(d.id, 'TBP_RECALL', 'tbp01', { reason: 'Sai dieu khoan' })).status).toBe(200);

    const ls = await get(`/policies/${d.id}/events`, 'tbp01');
    const dong = (ls.body as { action: string; reason: string | null }[]).find(
      (e) => e.action === 'TBP_RECALL',
    );
    expect(dong, 'không có dòng nào cho TBP_RECALL').toBeDefined();
    expect(dong!.reason).toBe('Sai dieu khoan');
  }, 90_000);
});

describe('WF-06 · WF-07 · WF-27 TBP không duyệt', () => {
  it('WF-06 bỏ trống lý do thì 400 REASON_REQUIRED', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'TBP_RETURN', 'tbp01');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REASON_REQUIRED');
  });

  it('WF-07 kèm lý do thì sang Yêu cầu chỉnh sửa và mở khoá', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu giay to' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');

    // Mở khoá: sửa lại được. `0180` — phép sửa là sửa DÒNG.
    const lineId = d.body.lines[0].id as string;
    expect(
      (await patch(`/policies/${d.id}/lines/${lineId}`, { wholesalePrice: '80000' })).status,
    ).toBe(200);
  });

  it('WF-27 lý do lưu vào hồ sơ, vào lịch sử và vào sự kiện email', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chu ky chu ho' });

    expect((await get(`/policies/${d.id}`)).body.lastReason).toBe('Thieu chu ky chu ho');

    const events = (await get(`/policies/${d.id}/events`)).body as { reason: string | null }[];
    expect(events.some((e) => e.reason === 'Thieu chu ky chu ho')).toBe(true);

    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.tbp_return');
    expect(ev?.payload.reason).toBe('Thieu chu ky chu ho');
  });
});

describe('`0155` Đã xoá là trạng thái kết thúc — thay cho WF-08 Từ chối', () => {
  it('mọi hành động tiếp theo đều 409', async () => {
    /*
     * WF-08 cũ kiểm chuyện này trên `TU_CHOI`. `0155` bỏ trạng thái ấy, nhưng
     * TÍNH CHẤT thì không mất: hồ sơ đi hết đường trả-lại-rồi-xoá vẫn phải là
     * một ngõ cụt. Đổi đích, giữ nguyên câu hỏi.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Khong dat' });
    expect((await del(`/policies/${d.id}`, 'tdv01')).status).toBe(204);

    for (const [a, who] of [
      ['SUBMIT', 'tdv01'],
      ['TBP_SIGN', 'tbp01'],
      ['RESUBMIT_AFTER_EDIT', 'tdv01'],
    ] as const) {
      const r = await act(d.id, a, who);
      expect(r.status, `${a} đáng lẽ bị chặn`).toBe(409);
      expect(r.body.code).toBe('INVALID_TRANSITION');
    }

    /*
     * KẾ TOÁN nhận **403, không phải 409** (`0157`), và đó là câu trả lời MẠNH
     * HƠN chứ không phải một ngoại lệ.
     *
     * Hồ sơ này đi SUBMIT → TBP trả lại → người lập xoá, nên nó chưa bao giờ
     * qua chữ ký Trưởng bộ phận. Kế toán không thấy nó, và chốt phạm vi trả lời
     * TRƯỚC cả máy trạng thái: không phải *"hành động này sai bước"* mà là *"hồ
     * sơ này không thuộc về bạn"*.
     */
    const rKt = await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    expect(rKt.status, 'Kế toán không thấy hồ sơ chưa từng qua TBP').toBe(403);
    expect(rKt.body.code).toBe('OUT_OF_SCOPE');

    const allowed = (await get(`/policies/${d.id}/allowed-actions`)).body;
    expect(allowed.allowed).toEqual([]);
  });
});

describe('WF-10 · WF-11 · WF-12 kế toán tiếp nhận lần 1', () => {
  it('WF-10 tiếp nhận thì sang Sale Admin đang xử lý', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('SA_DANG_XU_LY');

    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.kt_receive_l1');
    expect(ev?.payload.recipients).toEqual(['SALE_ADMIN', 'TBP', 'TDV']);
  });

  it('WF-11 không tiếp nhận, có lý do thì về Yêu cầu chỉnh sửa', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Sai so tien' });
    expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');
  });

  it('WF-12 kt02 tiếp nhận hồ sơ ngoài phạm vi thì 403', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'KT_RECEIVE_L1', 'kt02');
    expect(r.status).toBe(403);
  });
});

describe('WF-13 · WF-14 · WF-15 Sale Admin bàn giao', () => {
  const toSaStage = async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    return d;
  };

  it('WF-14 bàn giao khi chưa có bản scan thì 409', async () => {
    const d = await toSaStage();
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SCAN_REQUIRED');
  });

  it('`0160` cờ `banGiaoDuoc` đi CÙNG chốt chặn — tắt khi chưa scan, bật khi đã có', async () => {
    /*
     * Cờ này chỉ để vẽ nút; chốt thật vẫn là `SCAN_REQUIRED` ở ca ngay trên.
     * Nhưng hai bên phải nói CÙNG một câu, nếu không thì màn hình sáng nút mà
     * máy chủ từ chối — hoặc xám nút trong khi máy chủ sẵn sàng nhận.
     *
     * Khẳng định CẢ HAI chiều trên CÙNG một hồ sơ, trước và sau khi tải scan:
     * chỉ kiểm chiều tắt thì một cờ trả `false` cứng vẫn xanh.
     */
    const d = await toSaStage();
    expect((await get(`/policies/${d.id}`, 'sa01')).body.banGiaoDuoc, 'chưa scan').toBe(false);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status, 'chốt chặn cùng chiều').toBe(409);

    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    expect((await get(`/policies/${d.id}`, 'sa01')).body.banGiaoDuoc, 'đã scan').toBe(true);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status, 'chốt chặn cùng chiều').toBe(200);
  });

  it('WF-13 có scan rồi thì sang KT duyệt bản cứng', async () => {
    const d = await toSaStage();
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_KT_L2');
  });

  it('WF-15 bàn giao khi hồ sơ còn ở KT duyệt bản mềm thì 409 INVALID_TRANSITION', async () => {
    // Phải đi qua `KT_RECEIVE_L1` rồi LÙI trạng thái bằng SQL, chứ không dừng ở
    // `CHO_KT_L1` như bản cũ (`0031`): Sale Admin chỉ được giao ở bước tiếp nhận
    // L1, nên trước đó họ chưa liên quan gì tới hồ sơ và bị chặn ở tầng PHẠM VI
    // — 403, không phải 409. Muốn kiểm CỔNG TRẠNG THÁI thì người gọi phải đã ở
    // trong phạm vi, nếu không ca này kiểm nhầm thứ khác.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET status = 'CHO_KT_L1' WHERE id = $1`, [d.id]),
    );
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
  });

  it('Sale Admin CHƯA được giao thì 403, chặn trước cả cổng trạng thái', async () => {
    // Nửa còn lại của ca trên, tách ra vì nó nói về một luật khác: phạm vi chặn
    // TRƯỚC trạng thái, và đó là đúng thứ tự — không nói cho người ngoài phạm vi
    // biết hồ sơ đang ở bước nào.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  });
});

describe('WF-16 · WF-24 tiếp nhận lần 2', () => {
  it('hiệu lực bắt đầu NGAY tại thời điểm tiếp nhận L2', async () => {
    const d = await draft();
    const before = Date.now();
    const r = await runToActive(d);
    const after = Date.now();

    expect(r.body.status).toBe('DANG_CO_HIEU_LUC');
    const eff = new Date(r.body.effectiveFrom).getTime();
    expect(eff).toBeGreaterThanOrEqual(before - 1000);
    expect(eff).toBeLessThanOrEqual(after + 1000);
  });

  it('WF-24 đủ mốc thời gian riêng và người thực hiện cho từng bước', async () => {
    const d = await draft();
    await runToActive(d);
    const row = await withAdminDb(async (c) => {
      const q = await c.query<Record<string, unknown>>(
        `SELECT submitted_at, submitted_by, tbp_signed_at, tbp_signed_by,
                kt_l1_received_at, kt_l1_received_by, sa_handover_at, sa_handover_by,
                kt_l2_received_at, kt_l2_received_by, effective_from
           FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    for (const [k, v] of Object.entries(row)) {
      expect(v, `cột ${k} phải có giá trị`).not.toBeNull();
    }
  });
});

describe('WF-17 · WF-18 · WF-19 kế toán không tiếp nhận L2', () => {
  const toL2 = async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    await act(d.id, 'SA_HANDOVER', 'sa01');
    return d;
  };

  it('WF-17 trả về Bước 3 thì bắt buộc có lý do', async () => {
    const d = await toL2();
    expect((await act(d.id, 'KT_RETURN_L2', 'kt01')).status).toBe(400);
    const r = await act(d.id, 'KT_RETURN_L2', 'kt01', { reason: 'Ban cung khong khop' });
    expect(r.body.status).toBe('YEU_CAU_CHINH_SUA');
  });

  it('`0050` WF-18 yêu cầu in lại thì bản scan cũ Ở LẠI, không bị xoá', async () => {
    /*
     * Đảo ngược luật cũ theo yêu cầu khách hàng 19/08.
     *
     * Trước đó bản scan bị xoá khỏi cả `pol` lẫn kho lưu trữ ngay khi Kế toán
     * bấm yêu cầu in lại. Giờ nó ở lại để Sale Admin chủ động gỡ và thay — Kế
     * toán chê bản GIẤY, mà nhiều khi chỉ so với bản scan đang có mới thấy hỏng
     * ở đâu.
     */
    const d = await toL2();
    const r = await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('SA_SUA_BAN_CUNG'); // `0225` — trạng thái riêng, không còn chung lượt đầu
    // HAI tệp từ `0167`: bản scan và bản mềm — `toL2()` gắn cả hai vì bàn giao
    // đòi cả hai. Lọc theo LOẠI chứ không đếm tổng: câu ca này khẳng định là về
    // BẢN SCAN, và một con số tổng sẽ đổi mỗi lần thêm một loại tệp.
    const scan = (r.body.attachments as { kind: string; fileName: string }[]).filter(
      (a) => a.kind === 'SCAN',
    );
    expect(scan, 'bản scan phải còn nguyên').toHaveLength(1);
    expect(scan[0]!.fileName).toBe('ban-cung.pdf');

    // Và KHÔNG còn sự kiện huỷ nào được phát.
    const ev = (await outboxFor(d.id)).find((e) => e.routing_key === 'policy.scan_discarded');
    expect(ev, 'policy.scan_discarded đã gỡ hẳn').toBeUndefined();
  });

  it('`0050` bản scan cũ được ĐÁNH DẤU là bản đã bị chê', async () => {
    const d = await toL2();
    const truoc = await get(`/policies/${d.id}`, 'sa01');
    expect(truoc.body.banScanCu, 'chưa yêu cầu in lại thì không cảnh báo gì').toBe(false);

    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    const sau = await get(`/policies/${d.id}`, 'sa01');
    // Cờ này KHÔNG chặn bàn giao — nó để màn hình nói ra. Chặn là đi ngược yêu
    // cầu "Sale Admin chủ động": có lần in lại mà bản scan cũ vẫn dùng được.
    expect(sau.body.banScanCu).toBe(true);
  });

  it('`0050` tải bản scan MỚI lên thì cảnh báo tự tắt', async () => {
    const d = await toL2();
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });

    // Gỡ bản cũ rồi tải bản mới — đúng đường Sale Admin phải đi.
    //
    // Lấy đúng tệp SCAN chứ không `attachments[0]`: từ `0167` hồ sơ tới được
    // bước này luôn có hai tệp, và thứ tự trong mảng không phải thứ ca này nói
    // về. Bản mềm ở lại — yêu cầu in lại là chê BẢN GIẤY.
    const cu = (
      (await get(`/policies/${d.id}`, 'sa01')).body.attachments as {
        id: string;
        kind: string;
      }[]
    ).find((a) => a.kind === 'SCAN')!;
    expect((await del(`/policies/${d.id}/attachments/${cu.id}`, 'sa01')).status).toBe(200);
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung-2.pdf', objectKey: `scan/${d.id}-moi.pdf` },
      'sa01',
    );

    const sau = await get(`/policies/${d.id}`, 'sa01');
    expect(
      (sau.body.attachments as { kind: string }[]).filter((a) => a.kind === 'SCAN'),
    ).toHaveLength(1);
    // Cảnh báo suy từ MỐC TẢI LÊN chứ không từ một cờ phải nhớ xoá — nên nó tự
    // đúng, không có trạng thái nào để quên dọn.
    expect(sau.body.banScanCu).toBe(false);
  });

  it('`0050` bàn giao lại mà KHÔNG thay scan vẫn đi được — cảnh báo, không chặn', async () => {
    const d = await toL2();
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status, 'không chặn: quyết định là của Sale Admin').toBe(200);
    expect(r.body.status).toBe('CHO_KT_L2');
  });

  it('WF-19 in lại và bàn giao lần hai thì KHÔNG phải ký số lại', async () => {
    const d = await toL2();
    await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban in mo' });
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung-2.pdf', objectKey: `scan/${d.id}-2.pdf` },
      'sa01',
    );
    // `0167` — bàn giao đòi CẢ HAI tệp; bản mềm là tệp thứ hai.
    await post(
      `/policies/${d.id}/attachments`,
      { kind: 'BAN_MEM', fileName: 'ban-mem.pdf', objectKey: `ban-mem/${d.id}.pdf` },
      'sa01',
    );
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHO_KT_L2');

    // Ngoại lệ duy nhất: không có bước ký số nào trong nhánh này.
    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    expect(events.filter((e) => e.action === 'TBP_SIGN')).toHaveLength(1);
  });
});

describe('WF-20 trả về Bước 3 thì đi lại toàn bộ vòng duyệt', () => {
  it('kể cả bước ký số của TBP', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Tra lai' });

    const re = await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');
    expect(re.body.status).toBe('CHO_TBP_DUYET');

    // Không nhảy thẳng sang kế toán được — phải qua TBP ký lại.
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(409);

    // …và KÝ LẠI PHẢI ĐƯỢC. Ca này thiếu tới `0101`, nên vế thứ hai của WF-20
    // — *"đi lại toàn bộ vòng duyệt, KỂ CẢ bước ký số"* — chưa từng được kiểm:
    // ca cũ chỉ chứng minh không nhảy cóc được, không chứng minh đi tiếp được.
    const ky = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(ky.status, 'ký lại sau khi gửi lại phải được — WF-20').toBe(200);
    expect(ky.body.status).toBe('CHO_KT_L1');
  });
});

describe('WF-22 không có nghiệp vụ thu hồi', () => {
  it('không hành động nào trong máy trạng thái là thu hồi', async () => {
    const { ACTIONS } = await import('@csbh/domain-policy');
    for (const a of ACTIONS) {
      expect(a.toLowerCase()).not.toContain('revoke');
      expect(a.toLowerCase()).not.toContain('withdraw');
      expect(a.toLowerCase()).not.toContain('thu_hoi');
    }
  });

  it('endpoint thu hồi không tồn tại', async () => {
    const d = await draft();
    const r = await post(`/policies/${d.id}/revoke`, {});
    expect(r.status).toBe(404);
  });
});

describe('WF-23 hành động sai trạng thái', () => {
  it('409 kèm trạng thái hiện tại và danh sách hành động được phép', async () => {
    // Người gọi phải NẰM TRONG phạm vi thì mới tới được cổng trạng thái (`0031`)
    // — dùng chính người lập, vì hồ sơ Nháp chưa giao cho ai khác.
    const d = await draft();
    const r = await act(d.id, 'KT_RECEIVE_L2', 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.status).toBe('NHAP');
    expect(r.body.allowed).toEqual(['SUBMIT']);
  });
});

describe('WF-25 hai người duyệt cùng lúc', () => {
  it('một thành công, một nhận 409 nhờ khoá lạc quan', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const rowVersion = (await get(`/policies/${d.id}`)).body.rowVersion as number;

    const [a, b] = await Promise.all([
      act(d.id, 'TBP_SIGN', 'tbp01', { rowVersion }),
      act(d.id, 'TBP_SIGN', 'tbp01', { rowVersion }),
    ]);
    const codes = [a.status, b.status].sort();
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBe(409);
  });
});

describe('WF-26 luồng hoàn toàn tuần tự', () => {
  it('mỗi trạng thái chỉ có đúng một đường đi tiếp cho mỗi vai trò', async () => {
    const { allowedActions, STATUSES } = await import('@csbh/domain-policy');
    // Không trạng thái nào mở ra hai nhánh chạy SONG SONG: các lựa chọn ở cùng
    // một trạng thái là loại trừ nhau (duyệt HOẶC trả lại HOẶC từ chối).
    for (const s of STATUSES) {
      const acts = allowedActions(s);
      const targets = new Set(acts);
      expect(targets.size).toBe(acts.length);
    }
  });
});

describe('WF-28 chạy hết luồng bằng 5 tài khoản mẫu', () => {
  it('kết thúc ở Đang có hiệu lực với đủ mốc và đủ chuỗi sự kiện', async () => {
    const d = await draft();
    const r = await runToActive(d);
    expect(r.body.status).toBe('DANG_CO_HIEU_LUC');

    // SÁU dòng, không bảy: `PUBLISH_SIGNED` gỡ ở `0064`.
    const events = (await get(`/policies/${d.id}/events`)).body as { action: string }[];
    expect(events.map((e) => e.action)).toEqual([
      'CREATE',
      'SUBMIT',
      'TBP_SIGN',
      'KT_RECEIVE_L1',
      'SA_HANDOVER',
      'KT_RECEIVE_L2',
    ]);

    // Năm sự kiện email, đúng danh sách người nhận của muc 3. Việc GỬI thư thuộc
    // notification (P6); ở đây khẳng định policy đã phát đủ và đúng.
    const mails = (await outboxFor(d.id)).filter((e) => e.payload.recipients);
    expect(mails.map((m) => m.routing_key)).toEqual([
      'policy.submit',
      'policy.tbp_sign',
      'policy.kt_receive_l1',
      'policy.sa_handover',
      'policy.kt_receive_l2',
    ]);
  });
});

// =============================================================================
// EFF — hiệu lực và phiên bản
// =============================================================================

describe('EFF-01 · EFF-05 · EFF-09 thay thế phiên bản', () => {
  it('bản cũ hết hiệu lực đúng lúc bản mới được tiếp nhận L2', async () => {
    const d = await draft();
    await runToActive(d);

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await runToActive({ id: v2.body.id });

    const old = await withAdminDb(async (c) => {
      const q = await c.query<{
        status: string;
        deactivated_at: Date | null;
        superseded_by_id: string | null;
      }>(`SELECT status::text, deactivated_at, superseded_by_id FROM pol.policy WHERE id = $1`, [
        d.id,
      ]);
      return q.rows[0]!;
    });
    expect(old.status).toBe('HET_HIEU_LUC');
    expect(old.deactivated_at).not.toBeNull();
    expect(old.superseded_by_id).toBe(v2.body.id);
  });

  it('`0082` danh sách theo khách hàng mang đủ MỐC THAY THẾ, dựng được lịch sử', async () => {
    /*
     * Màn hình khách hàng vẽ *Lịch sử CSBH* từ chính đường này. Trước `0082` nó
     * chỉ trả mã, phiên bản, trạng thái và hai ngày — không có `deactivatedAt`
     * lẫn `supersededById`, nên câu hỏi "bản nào thay bản nào, lúc mấy giờ"
     * không có dữ liệu để trả lời.
     *
     * Ba cột ấy nằm trong bảng từ `0001`; thiếu ở đây là thiếu ở phép chiếu.
     */
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['7000'] })],
    });
    await runToActive({ id: v2.body.id });

    const r = await get(`/policies?customerId=${d.customerId}&limit=50`);
    expect(r.status).toBe(200);
    const theo = (id: string) =>
      (r.body.items as Record<string, unknown>[]).find((x) => x['id'] === id)!;

    const cu = theo(d.id);
    const moi = theo(v2.body.id);

    // Bản cũ: có mốc hết hiệu lực, và trỏ tới ĐÚNG bản đã thay nó.
    expect(cu['status']).toBe('HET_HIEU_LUC');
    expect(cu['deactivatedAt']).not.toBeNull();
    expect(cu['supersededById']).toBe(v2.body.id);

    // Bản mới: chưa bị thay, và trỏ NGƯỢC về bản gốc — hai chiều của cùng một
    // quan hệ, và màn hình cần cả hai để nối chuỗi mà không phải gọi thêm.
    expect(moi['status']).toBe('DANG_CO_HIEU_LUC');
    expect(moi['deactivatedAt']).toBeNull();
    expect(moi['supersededById']).toBeNull();
    expect(moi['supersedesId']).toBe(d.id);

    // Mốc thay thế phải là MỘT thời điểm có thật, không phải cờ boolean: hai
    // phiên bản thay nhau trong cùng một ngày là chuyện thường.
    expect(Number.isNaN(new Date(String(cu['deactivatedAt'])).getTime())).toBe(false);
  });

  it('EFF-09 chuỗi ba phiên bản tra ngược được toàn bộ', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await runToActive({ id: v2.body.id });
    const v3 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['7000'] })],
    });
    await runToActive({ id: v3.body.id });

    const chain = (await get(`/policies/${v3.body.id}/versions`)).body as {
      versionNo: number;
      status: string;
    }[];
    expect(chain).toHaveLength(3);
    expect(chain.map((x) => x.status)).toEqual([
      'HET_HIEU_LUC',
      'HET_HIEU_LUC',
      'DANG_CO_HIEU_LUC',
    ]);

    // Tra ngược từ mắt xích đầu cũng ra đủ chuỗi.
    const fromV1 = (await get(`/policies/${d.id}/versions`)).body as unknown[];
    expect(fromV1).toHaveLength(3);
  });
});

describe('EFF-03 · EFF-04 bản cũ giữ nguyên hiệu lực trong lúc bản mới đi duyệt', () => {
  it('EFF-03 bản mới đang chờ duyệt thì bản cũ vẫn hiệu lực', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await act(v2.body.id, 'SUBMIT', 'tdv01');
    await act(v2.body.id, 'TBP_SIGN', 'tbp01');

    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.body.id).toBe(d.id);
    expect(cur.body.status).toBe('DANG_CO_HIEU_LUC');
  });

  it('EFF-04 bản mới bị từ chối thì bản cũ vẫn nguyên, không có khoảng trống', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { cpbh: ['6000'] })],
    });
    await act(v2.body.id, 'SUBMIT', 'tdv01');
    await act(v2.body.id, 'TBP_RETURN', 'tbp01', { reason: 'Khong dat' });

    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.body.id).toBe(d.id);
  });
});

describe('EFF-06 mọi CSBH đều vô thời hạn', () => {
  it('không có job nào tự làm hết hiệu lực', async () => {
    const d = await draft();
    await runToActive(d);
    // Đẩy mốc hiệu lực lùi hai năm — nếu có logic hết hạn theo thời gian thì đây
    // là lúc nó lộ ra.
    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET effective_from = now() - interval '2 years' WHERE id = $1`, [
        d.id,
      ]),
    );
    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.body.status).toBe('DANG_CO_HIEU_LUC');
  });
});

describe('EFF-07 ngày áp dụng trước ngày duyệt xong', () => {
  it('hiệu lực vẫn tính từ lúc tiếp nhận L2, không lùi theo ngày áp dụng', async () => {
    const d = await draft({ ngayApDung: '2020-03-01' });
    const r = await runToActive(d);
    expect(new Date(r.body.effectiveFrom).getFullYear()).toBe(new Date().getFullYear());
  });
});

describe('EFF-08 CSBH hiện hành của một khách hàng', () => {
  it('trả đúng một bản ghi dù lịch sử có nhiều phiên bản', async () => {
    const d = await draft();
    await runToActive(d);
    for (const cpbh of ['6000', '7000']) {
      const v = await post('/policies', {
        customerId: d.customerId,
        mode: 'NEW_VERSION',
        lines: [line(d.productId, { cpbh: [cpbh] })],
      });
      await runToActive({ id: v.body.id });
    }
    const cur = await get(`/policies/current?customerId=${d.customerId}`);
    expect(cur.status).toBe(200);
    expect(cur.body.versionNo).toBe(3);

    const all = (await get(`/policies?customerId=${d.customerId}&limit=200`)).body.items as { status: string }[];
    expect(all.filter((p) => p.status === 'DANG_CO_HIEU_LUC')).toHaveLength(1);
  });
});

describe('EFF-10 tập sản phẩm giữa hai phiên bản liên tiếp', () => {
  it('tập của v(n) chứa toàn bộ tập của v(n−1)', async () => {
    const d = await draft();
    await runToActive(d);
    const moi = await makeProduct();
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(moi)],
    });

    const v1Ids = new Set(
      ((await get(`/policies/${d.id}`)).body.lines as { productId: string }[]).map(
        (l) => l.productId,
      ),
    );
    const v2Ids = new Set(
      (v2.body.lines as { productId: string }[]).map((l) => l.productId),
    );
    for (const id of v1Ids) expect(v2Ids.has(id)).toBe(true);
    expect(v2Ids.size).toBe(v1Ids.size + 1);
  });
});

describe('EFF-11 hiệu lực quản lý ở cấp hồ sơ', () => {
  it('bảng dòng sản phẩm KHÔNG có cột hiệu lực hay trạng thái', async () => {
    const cols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'pol' AND table_name = 'policy_line'`,
      );
      return r.rows.map((x) => x.column_name);
    });
    for (const bad of ['status', 'effective_from', 'effective_to', 'is_active', 'deactivated_at']) {
      expect(cols, `dòng sản phẩm không được có cột ${bad}`).not.toContain(bad);
    }
  });
});

describe('EFF-12 · EFF-13 bất biến một-CSBH-hiệu-lực', () => {
  it('EFF-12 nạp bản ghi LEGACY cho khách đã có CSBH hiệu lực thì báo lỗi rõ ràng', async () => {
    const d = await draft();
    await runToActive(d);

    const err = await withAdminDb(async (c) => {
      try {
        await c.query(
          `INSERT INTO pol.policy (code, customer_id, status, source)
           VALUES ($1, $2, 'DANG_CO_HIEU_LUC', 'LEGACY')`,
          [`${P}-LEGACY-${Date.now()}`, d.customerId],
        );
        return undefined;
      } catch (e) {
        return e as { code?: string; message: string };
      }
    });
    expect(err?.code).toBe('23505');
    expect(err?.message).toContain('uq_policy_active_per_customer');
  });

  it('EFF-13 kích hoạt hỏng giữa chừng thì rollback toàn bộ', async () => {
    const d = await draft();
    await runToActive(d);

    // Mô phỏng đúng thứ tự thao tác của bước tiếp nhận L2, rồi ném lỗi ở giữa.
    await withAdminDb(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          `UPDATE pol.policy SET status = 'HET_HIEU_LUC', deactivated_at = now() WHERE id = $1`,
          [d.id],
        );
        throw new Error('lỗi giả lập sau khi vô hiệu bản cũ');
      } catch {
        await c.query('ROLLBACK');
      }
    });

    const after = await withAdminDb(async (c) => {
      const r = await c.query<{ id: string; status: string }>(
        `SELECT id, status::text FROM pol.policy
          WHERE customer_id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
        [d.customerId],
      );
      return r.rows;
    });
    // Vẫn đúng một CSBH hiệu lực, và vẫn là bản cũ.
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(d.id);
  });
});

describe('AD-02 policy không đọc chéo schema khác', () => {
  it('role csbh_pol không SELECT được cus.customer hay cat.product', async () => {
    for (const table of ['cus.customer', 'cat.product']) {
      const err = await withAdminDb(async (c) => {
        await c.query(`SET ROLE csbh_pol`);
        try {
          await c.query(`SELECT 1 FROM ${table} LIMIT 1`);
          return undefined;
        } catch (e) {
          return e as { code?: string };
        } finally {
          await c.query(`RESET ROLE`);
        }
      });
      expect(err?.code, `csbh_pol đáng lẽ không đọc được ${table}`).toBe('42501');
    }
  });
});

// =============================================================================
// CPBH số lượng tự do (0021)
// =============================================================================

describe('CPBH không cố định bốn khoản', () => {
  it('lập được dòng KHÔNG có khoản chi phí nào', async () => {
    // Giá thu về khi đó bằng đúng giá bán buôn. Trước 0021 phải gõ bốn số 0.
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '90000' }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const l = r.body.lines[0];
    expect(l.cpbh).toEqual([]);
    expect(l.cpbhTotal).toBe('0');
    expect(l.netPrice).toBe('90000');
  });

  it('lập được dòng nhiều hơn bốn khoản', async () => {
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [
        { productId, wholesalePrice: '90000', cpbh: ['1000', '2000', '500', '400', '100', '3000'] },
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const l = r.body.lines[0];
    expect(l.cpbh).toEqual(['1000', '2000', '500', '400', '100', '3000']);
    expect(l.cpbhTotal).toBe('7000');
    expect(l.netPrice).toBe('83000');
  });

  it('GIỮ NGUYÊN THỨ TỰ người dùng nhập', async () => {
    // Thứ tự là dữ liệu: khoản thứ mấy trên bản in phải khớp khoản thứ mấy người
    // lập đã khai. Sắp lại hay dồn số 0 xuống cuối đều là sửa hồ sơ của họ.
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '90000', cpbh: ['0', '5000', '0'] }],
    });
    expect(r.body.lines[0].cpbh).toEqual(['0', '5000', '0']);
    expect(r.body.lines[0].cpbhTotal).toBe('5000');
  });

  it('khoản âm bị chặn, và báo ĐÚNG khoản thứ mấy', async () => {
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '90000', cpbh: ['1000', '-5'] }],
    });
    expect(r.status).toBe(400);
    // Chỉ số nằm trong tên trường: "cpbh[1]", không phải "cpbh" trần — với mười
    // khoản thì lỗi không nêu chỉ số bắt người dùng dò lại cả dòng.
    expect(JSON.stringify(r.body)).toContain('cpbh[1]');
  });

  it('phiên bản mới chép lại ĐÚNG các khoản của bản cũ', async () => {
    // Bản bổ sung phải chứa lại toàn bộ sản phẩm cũ (POL-08). Chép thiếu khoản
    // chi phí là đổi giá thu về của một dòng mà không ai bấm gì.
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', { customerId: d.customerId, mode: 'NEW_VERSION', lines: [] });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    const cu = (await get(`/policies/${d.id}`)).body.lines[0];
    const moi = v2.body.lines.find((l: { productId: string }) => l.productId === d.productId);
    expect(moi.cpbh).toEqual(cu.cpbh);
    expect(moi.netPrice).toBe(cu.netPrice);
  });
});

describe('sửa một dòng sản phẩm đã có', () => {
  /**
   * Trước đây giao diện chỉ có Xoá, nên đổi một con số nghĩa là xoá dòng rồi
   * thêm lại — gõ lại cả giá bán buôn lẫn mọi khoản chi phí, và giữa hai thao
   * tác thì hồ sơ thiếu mất một sản phẩm.
   *
   * Đường riêng `PATCH .../lines/:lineId`, KHÔNG cho `POST` ghi đè khi trùng sản
   * phẩm: trùng lúc thêm là một nhầm lẫn và `POL-02` chặn nó có chủ ý.
   */
  const suaDong = async (policyId: string, lineId: string, body: object, who = 'tdv01') =>
    patch(`/policies/${policyId}/lines/${lineId}`, body, who);

  it('đổi được giá bán buôn và các khoản chi phí', async () => {
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];

    const r = await suaDong(d.id, l.id, {
      wholesalePrice: '80000',
      cpbh: ['1000', '2000'],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const sau = (await get(`/policies/${d.id}`)).body.lines;
    expect(sau).toHaveLength(1);
    expect(sau[0].wholesalePrice).toBe('80000');
    expect(sau[0].cpbh).toEqual(['1000', '2000']);
    // Giá thu về tính lại theo con số mới, không giữ giá trị cũ.
    expect(sau[0].netPrice).toBe('77000');
  });

  it('giữ NGUYÊN id dòng và sản phẩm', async () => {
    // Giao diện nhận diện dòng theo `id` để bấm Xoá; đổi id sau mỗi lần sửa là
    // nút Xoá trỏ vào một dòng không còn tồn tại.
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    await suaDong(d.id, l.id, { wholesalePrice: '85000' });
    const sau = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(sau.id).toBe(l.id);
    expect(sau.productId).toBe(l.productId);
  });

  it('KHÔNG đổi được sản phẩm qua đường sửa', async () => {
    // `productId` không có trong DTO nên bị bỏ qua. Đổi sản phẩm của một dòng là
    // xoá dòng này và thêm dòng khác — hai việc có ý nghĩa nghiệp vụ khác nhau.
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    const spKhac = await makeProduct();
    await suaDong(d.id, l.id, { wholesalePrice: '85000', productId: spKhac });
    expect((await get(`/policies/${d.id}`)).body.lines[0].productId).toBe(l.productId);
  });

  it('KHÔNG gửi kèm được giá bán Công ty hay ngưỡng', async () => {
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    const r = await suaDong(d.id, l.id, { wholesalePrice: '85000', companyPrice: '1' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('FIELD_NOT_ALLOWED');
  });

  it('dòng không thuộc hồ sơ này thì 404', async () => {
    const a = await draft();
    const b = await draft();
    const lb = (await get(`/policies/${b.id}`)).body.lines[0];
    expect((await suaDong(a.id, lb.id, { wholesalePrice: '80000' })).status).toBe(404);
  });

  it('hồ sơ đã gửi duyệt thì KHÔNG sửa được dòng', async () => {
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await suaDong(d.id, l.id, { wholesalePrice: '80000' })).status).toBe(409);
  });
});

/**
 * 0022 — dòng hồ sơ nhớ NGUỒN của ngưỡng, không chỉ con số.
 *
 * Giao diện tô vàng dòng nào rơi về ngưỡng mặc định của sản phẩm, và người duyệt
 * dựa vào đó để biết con số ấy KHÔNG đến từ chính sách chiết khấu đã ban hành.
 * Cờ đó vô nghĩa nếu nó không đi theo dòng qua mọi đường ghi.
 */
describe('0022 nguồn ngưỡng chiết khấu đóng băng vào dòng hồ sơ', () => {
  /** Sản phẩm trong NHÓM RIÊNG, để khai quy định mà không đụng nhóm chung của tệp. */
  const sanPhamNhomRieng = async (): Promise<{ productId: string; groupCode: string }> => {
    const c = await http(catalog);
    const g = uniq('NHOM0022');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0022' });
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0022'), name: 'Nutricare Gold', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return { productId: r.body.id as string, groupCode: g };
  };

  const khaiQuyDinh = async (g: string, nguong: number) =>
    (await http(catalog))
      .post('/catalog/discount-rules')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({
        code: uniq('CK0022'),
        productGroupCode: g,
        customerType: 1,
        effectiveFrom: '2020-01-01',
        thresholdRate2: nguong,
      });

  it('có quy định khớp → thresholdSource là RULE', async () => {
    const { productId, groupCode: g } = await sanPhamNhomRieng();
    expect((await khaiQuyDinh(g, 2500)).status).toBe(201);

    const d = await draft({ productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('RULE');
    expect(l.threshold).toBe('25.00');
  });

  it('không quy định nào khớp → thresholdSource là KHONG_CO, ngưỡng rỗng', async () => {
    // Nhóm riêng và KHÔNG khai quy định nào cho nó. Từ `0025` không còn ngưỡng
    // mặc định nào để rơi về, nên dòng đơn giản là không có ngưỡng đối chiếu.
    // Mọi quy định do bộ test tạo ra đều gắn nhóm cụ thể, không có dòng nào phủ
    // "mọi nhóm" để lọt vào đây.
    const { productId } = await sanPhamNhomRieng();
    const d = await draft({ productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');
    expect(l.threshold).toBeNull();
  });

  it('sửa một dòng thì tra lại nguồn, không giữ nguyên cờ cũ', async () => {
    // `upsertLine` chạy lại `resolve` mỗi lần ghi. Nếu Quản trị khai quy định
    // giữa hai lần sửa thì dòng phải đổi cả ngưỡng lẫn nguồn — giữ cờ cũ là để
    // lại một dòng vàng vĩnh viễn dù quy định đã có.
    const { productId, groupCode: g } = await sanPhamNhomRieng();
    const d = await draft({ productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');

    expect((await khaiQuyDinh(g, 2800)).status).toBe(201);
    expect((await patch(`/policies/${d.id}/lines/${l.id}`, { wholesalePrice: '80000' })).status)
      .toBe(200);

    const sau = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(sau.thresholdSource).toBe('RULE');
    expect(sau.threshold).toBe('28.00');
  });

  it('phiên bản mới thừa kế dòng cũ thì thừa kế cả nguồn ngưỡng', async () => {
    // Dòng thừa kế giữ NGUYÊN ngưỡng của bản cũ, nên nó phải giữ nguyên cả câu
    // trả lời "ngưỡng ấy từ đâu ra". Bỏ hai cột lại thì dòng thừa kế mang ngưỡng
    // cũ mà nguồn rỗng, và màn hình đọc ra là "không rõ".
    const { productId } = await sanPhamNhomRieng();
    const d = await draft({ productId });
    await runToActive(d);

    const spMoi = await makeProduct();
    const moi = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(spMoi)],
    });
    expect(moi.status, JSON.stringify(moi.body)).toBe(201);

    const lines = (await get(`/policies/${moi.body.id}`)).body.lines as {
      productId: string;
      thresholdSource: string | null;
    }[];
    const thuaKe = lines.find((x) => x.productId === productId);
    expect(thuaKe?.thresholdSource).toBe('KHONG_CO');
  });
});

/**
 * 0022 — xem trước ngưỡng TRƯỚC khi thêm dòng.
 *
 * Sinh ra để màn hình cảnh báo được lúc người dùng còn đổi ý được rẻ. Sau khi
 * lưu thì con số đã đóng băng và sửa lại là thêm một lượt thao tác.
 */
describe('0022 GET /policies/:id/threshold-preview', () => {
  it('nói rõ ngưỡng sẽ dùng và nó từ đâu ra', async () => {
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${d.productId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.threshold).toBe('15.00');
    expect(r.body.thresholdSource).toBe('RULE');
    expect(r.body.productId).toBe(d.productId);
  });

  it('KHÔNG ghi gì — hồ sơ vẫn nguyên số dòng cũ', async () => {
    const d = await draft();
    const spKhac = await makeProduct();
    await get(`/policies/${d.id}/threshold-preview?productId=${spKhac}`);
    expect((await get(`/policies/${d.id}`)).body.lines).toHaveLength(1);
  });

  it('sản phẩm không có thật thì 404', async () => {
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${crypto.randomUUID()}`);
    expect(r.status).toBe(404);
  });

  it('thiếu productId thì 400', async () => {
    const d = await draft();
    expect((await get(`/policies/${d.id}/threshold-preview`)).status).toBe(400);
  });

  it('hồ sơ ngoài phạm vi thì 403 — đường đọc vẫn siết phạm vi', async () => {
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${d.productId}`, 'tdv02');
    expect(r.status).toBe(403);
  });

  /**
   * `0193` — đường này phải đủ để hộp thoại DỰNG LẠI đúng con số máy chủ sắp ghi.
   *
   * Khối xem trước trong hộp thoại thêm dòng gọi `computeLine` ngay trong trình
   * duyệt để bày tỷ lệ CK trước khi lưu. Nó chỉ đúng khi nhận được **cùng bộ đầu
   * vào** mà `upsertLine` sẽ dùng: giá bán Công ty và ngưỡng, cả hai theo NGÀY ÁP
   * DỤNG.
   */
  it('trả đủ bộ đầu vào của `computeLine`: giá, ngưỡng thô, mã quy định', async () => {
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${d.productId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    // Giá bán Công ty — thiếu nó thì không có mẫu số cho phép chia.
    expect(BigInt(r.body.companyPrice as string)).toBeGreaterThan(0n);

    /*
     * NGƯỠNG DẠNG THÔ, cạnh dạng chuỗi. Trùng nội dung và chủ ý: `threshold` để
     * BÀY RA, `thresholdRate2` để TÍNH. Gửi mỗi chuỗi thì trình duyệt phải đổi
     * ngược `Number('15.00') * 100` — một phép suy lại mà `Rate2` sinh ra để
     * khỏi phải làm.
     */
    expect(r.body.thresholdRate2).toBe(1500);
    expect(r.body.threshold).toBe(rate2ToNumeric(r.body.thresholdRate2 as number));
    // Mã quy định — vào `title` cạnh con số ngưỡng, đúng quy ước cột QĐCK (`0180`).
    expect(typeof r.body.ruleCode).toBe('string');
  });

  it('giá và ngưỡng đi theo NGÀY ÁP DỤNG, không phải hôm nay', async () => {
    /*
     * Vế mà `0180` bỏ sót và `0193` nối nốt.
     *
     * `0180` đưa `ngayApDung` vào đường này cho NGƯỠNG, còn giao diện vẫn đọc giá
     * HÔM NAY từ danh mục — nên hộp thoại bày một con số rồi máy chủ ghi một con
     * số khác ở đúng những dòng hẹn ngày tương lai. Chốt chặn là ở đây: cùng sản
     * phẩm, hai ngày, hai câu trả lời.
     */
    const d = await draft();
    /*
     * PHẢI DỰNG HAI MỐC GIÁ THẬT.
     *
     * Bản đầu của ca này hỏi giá ở `2020-01-01` rồi mong nó khác giá hôm nay, với
     * lý lẽ *"trước mốc giá đầu tiên thì chưa có giá nào"*. Sai, và ca kiểm đỏ đã
     * nói ra: phép tra rơi về mốc gần nhất chứ không trả rỗng — nên hai ngày cho
     * cùng một con số, và ca kiểm chẳng chứng minh được gì.
     */
    await (await http(catalog))
      .post(`/catalog/products/${d.productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '200000', effectiveFrom: '2030-01-01' });

    const nay = await get(`/policies/${d.id}/threshold-preview?productId=${d.productId}`);
    const sau = await get(
      `/policies/${d.id}/threshold-preview?productId=${d.productId}&ngayApDung=2030-06-01`,
    );
    expect(sau.status, JSON.stringify(sau.body)).toBe(200);
    expect(nay.body.companyPrice).toBe('100000');
    expect(sau.body.companyPrice).toBe('200000');
  });
});

/**
 * 0023 — sản phẩm KHÔNG có ngưỡng nào vẫn đưa vào hồ sơ được.
 *
 * Trước 0023 máy chủ ném `THRESHOLD_NOT_CONFIGURED` và chặn luôn việc thêm dòng.
 * Ngưỡng chỉ để cảnh báo — vượt ngưỡng còn không chặn gửi duyệt — nên thiếu
 * ngưỡng không thể là lý do chặn, nhất là khi TDV không có quyền tự khai.
 */
describe('0023 sản phẩm không có ngưỡng nào', () => {
  /** Sản phẩm nhóm riêng, KHÔNG khai ngưỡng mặc định nào. */
  const sanPhamKhongNguong = async (): Promise<string> => {
    const c = await http(catalog);
    const g = uniq('NHOM0023');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0023' });
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0023'), name: 'San pham khong nguong', groupCode: g, price: '100000' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return r.body.id as string;
  };

  it('danh mục trả nguồn KHONG_CO thay vì 404', async () => {
    const productId = await sanPhamKhongNguong();
    const r = await (await http(catalog))
      .get(`/catalog/thresholds/resolve?productId=${productId}&customerType=1`)
      .set('Authorization', `Bearer ${tok['admin01']}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.source).toBe('KHONG_CO');
    expect(r.body.thresholdRate2).toBeNull();
    expect(r.body.ruleCode).toBeNull();
  });

  it('THÊM ĐƯỢC dòng, và dòng đó không có ngưỡng', async () => {
    const productId = await sanPhamKhongNguong();
    const customerId = await makeCustomer();
    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    expect(hs.status, JSON.stringify(hs.body)).toBe(201);

    const l = (await get(`/policies/${hs.body.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');
    expect(l.threshold).toBeNull();
    expect(l.ruleCode).toBeNull();
    // Mọi con số khác vẫn đủ: 90.000 − 5.000 = 85.000, tức chiết khấu 15%.
    expect(l.netPrice).toBe('85000');
    expect(l.discountRate).toBe('15.00');
  });

  it('không ngưỡng thì KHÔNG bao giờ bị đánh dấu vượt ngưỡng', async () => {
    // Cột sinh `over_threshold` đã tính sẵn `threshold_snap IS NOT NULL`. Nếu ai
    // đó "sửa" bằng cách đặt ngưỡng 0 khi thiếu thì MỌI dòng sẽ đỏ.
    const productId = await sanPhamKhongNguong();
    const customerId = await makeCustomer();
    const hs = await post('/policies', {
      customerId,
      // Giá thu về rất thấp: chiết khấu 90%, chắc chắn vượt mọi ngưỡng có thật.
      lines: [line(productId, { wholesalePrice: '10000', cpbh: [] })],
    });
    expect(hs.status).toBe(201);
    const l = (await get(`/policies/${hs.body.id}`)).body.lines[0];
    expect(l.discountRate).toBe('90.00');
    expect(l.overThreshold).toBe(false);
  });

  it('hồ sơ đó vẫn chạy hết luồng tới Đang có hiệu lực', async () => {
    // Thiếu ngưỡng không được chặn ở BẤT KỲ bước nào sau đó, không riêng bước
    // thêm dòng — một cái chặn ở giữa luồng còn khó gỡ hơn cái chặn lúc lập.
    const productId = await sanPhamKhongNguong();
    const customerId = await makeCustomer();
    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    await runToActive({ id: hs.body.id as string });
    expect((await get(`/policies/${hs.body.id}`)).body.status).toBe('DANG_CO_HIEU_LUC');
  });

  it('xem trước cũng trả KHONG_CO, không 404', async () => {
    const productId = await sanPhamKhongNguong();
    const d = await draft();
    const r = await get(`/policies/${d.id}/threshold-preview?productId=${productId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.thresholdSource).toBe('KHONG_CO');
    expect(r.body.threshold).toBeNull();
  });
});

/** 0023 — mã quy định đi ra tới giao diện, cho cột QĐCK. */
describe('0023 dòng hồ sơ trả ruleId', () => {
  /** Sản phẩm nhóm riêng, KHÔNG khai quy định nào cho nhóm ấy. */
  const sanPhamTroi = async (): Promise<string> => {
    const c = await http(catalog);
    const g = uniq('NHOM0024');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0024' });
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0024'), name: 'SP troi', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return r.body.id as string;
  };

  it('có quy định khớp thì ruleCode là ĐÚNG quy định ấy', async () => {
    const c = await http(catalog);
    const g = uniq('NHOM0023B');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0023b' });
    const sp = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0023B'), name: 'SP', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${sp.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    const qd = await c
      .post('/catalog/discount-rules')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({
        code: uniq('CK0023B'),
        productGroupCode: g,
        customerType: 1,
        effectiveFrom: '2020-01-01',
        thresholdRate2: 3300,
      });
    expect(qd.status, JSON.stringify(qd.body)).toBe(201);

    const d = await draft({ productId: sp.body.id as string });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.ruleCode).toBe(qd.body.code);
    expect(l.threshold).toBe('33.00');
  });

  it('không quy định nào khớp thì ruleCode là null', async () => {
    const productId = await sanPhamTroi();
    const customerId = await makeCustomer();
    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    const l = (await get(`/policies/${hs.body.id}`)).body.lines[0];
    expect(l.thresholdSource).toBe('KHONG_CO');
    expect(l.ruleCode).toBeNull();
  });
});

/**
 * 0023 — đổi loại khách hàng KHÔNG được làm lệch hồ sơ đã lập.
 *
 * Loại khách hàng quyết định ngưỡng chiết khấu, và từ `0023` nó sửa được. Cái
 * phải chứng minh là việc sửa ấy an toàn: hồ sơ đã lập giữ nguyên con số của
 * mình, còn hồ sơ lập sau thì dùng ngưỡng mới.
 */
describe('0023 đổi loại khách hàng và ngưỡng đã đóng băng', () => {
  /**
   * Sản phẩm nhóm riêng, BA QUY ĐỊNH cho ba loại khách — ba ngưỡng khác nhau.
   *
   * Ba ngưỡng phải KHÁC NHAU thì test mới có nghĩa: sản phẩm ngưỡng đều nhau
   * làm cả bốn case dưới đây xanh kể cả khi mã sai hoàn toàn.
   *
   * Trước `0025` ba con số này là ba cột trên chính sản phẩm. Giờ chúng là ba
   * dòng trong bảng quy định — đúng chỗ duy nhất khai ngưỡng.
   */
  const sanPhamBaNguong = async (): Promise<string> => {
    const c = await http(catalog);
    const g = uniq('NHOM0023C');
    await c
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom rieng 0023c' });
    for (const [loai, nguong] of [
      [1, 1000], // 10,00%
      [2, 2000], // 20,00%
      [3, 3000], // 30,00%
    ] as const) {
      const q = await c
        .post('/catalog/discount-rules')
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({
          code: uniq('CK0023C'),
          productGroupCode: g,
          customerType: loai,
          effectiveFrom: '2020-01-01',
          thresholdRate2: nguong,
        });
      if (q.status !== 201) throw new Error(`khai quy định hỏng: ${JSON.stringify(q.body)}`);
    }
    const r = await c
      .post('/catalog/products')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: uniq('SP0023C'), name: 'SP ba nguong', groupCode: g, price: '100000' });
    await c
      .post(`/catalog/products/${r.body.id}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
    return r.body.id as string;
  };

  const doiLoai = async (customerId: string, loai: number) =>
    (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ customerType: loai });

  /*
   * ĐẢO NGƯỢC Ở `0029`.
   *
   * P31 chốt: hồ sơ Nháp GIỮ NGUYÊN ngưỡng cũ sau khi đổi loại khách hàng, với
   * lý do "một con số trong hồ sơ đang mở không được đổi dưới tay người đang
   * xem". Lý do ấy nghe đúng nhưng dẫn tới điều tệ hơn: người lập đọc một con
   * số rồi bấm Gửi duyệt, và thứ được đóng băng là một con số KHÁC — vì lúc gửi
   * mới tra lại. Nói cách khác, con số vẫn đổi dưới tay họ, chỉ là đổi muộn hơn
   * và ở chỗ họ không nhìn thấy.
   *
   * `0029` chọn hướng ngược lại và nói thẳng: hồ sơ Nháp SỐNG THEO danh mục, mọi
   * lúc. Đóng băng chỉ xảy ra một lần, ở đúng lúc gửi duyệt.
   */
  /*
   * `0194` — CA NÀY THAY BẢN CŨ, không sửa số.
   *
   * Bản cũ tên *"nhận ngưỡng MỚI ngay khi MỞ LẠI"* — một câu về cơ chế, và `0194`
   * đảo đúng cơ chế ấy: mở lại chỉ BÀY RA, áp dụng mới ghi. Điều đang gác vẫn
   * nguyên — đổi LOẠI KHÁCH HÀNG kéo theo ngưỡng của hồ sơ chưa đóng băng.
   */
  it('0029 đổi loại khách → hồ sơ NHÁP bày ra chênh lệch, áp dụng thì nhận ngưỡng mới', async () => {
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    expect((await get(`/policies/${d.id}`)).body.lines[0].threshold).toBe('10.00');

    expect((await doiLoai(customerId, 3)).status).toBe(200);
    const bay = (await get(`/policies/${d.id}`)).body;
    expect(bay.lines[0].threshold, 'đọc thôi thì chưa đổi').toBe('10.00');
    // `0238` — đổi loại khách là rơi sang một quy định KHÁC, nên hai vế mang cả
    // mã (`<ngưỡng>|<mã>`); mã do `sanPhamBaNguong` sinh nên so theo khuôn.
    expect(bay.lech).toEqual([
      expect.objectContaining({
        kind: 'RULE',
        snapValue: expect.stringMatching(/^10\.00\|.+/),
        newValue: expect.stringMatching(/^30\.00\|.+/),
      }),
    ]);
    const [, maCu] = String(bay.lech[0].snapValue).split('|');
    const [, maMoi] = String(bay.lech[0].newValue).split('|');
    expect(maCu).not.toBe(maMoi);

    expect((await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01')).status).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].threshold).toBe('30.00');
  });

  it('hồ sơ lập SAU khi đổi loại thì dùng ngưỡng mới', async () => {
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    expect((await doiLoai(customerId, 3)).status).toBe(200);

    const hs = await post('/policies', { customerId, lines: [line(productId)] });
    expect(hs.status, JSON.stringify(hs.body)).toBe(201);
    expect((await get(`/policies/${hs.body.id}`)).body.lines[0].threshold).toBe('30.00');
  });

  it('sửa một dòng cũng nhận ngưỡng mới — một trong BA đường, không phải đường duy nhất', async () => {
    /*
     * Ba đường đưa ngưỡng mới vào một hồ sơ chưa đóng băng, và cả ba đều phải
     * đúng: **sửa chính dòng ấy** (`upsertLine` tra lại danh mục), **bấm Tự động
     * cập nhật** (`0194`), và **gửi duyệt** (lượt làm mới cuối cùng).
     *
     * Bản trước `0194` có đường thứ tư — *mở hồ sơ ra* — và đó là đường vừa bị
     * gỡ: nó ghi đè trong im lặng.
     */
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    expect((await doiLoai(customerId, 2)).status).toBe(200);

    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    expect(l.threshold, '`0194` — mở hồ sơ ra KHÔNG còn ghi đè').toBe('10.00');
    expect((await patch(`/policies/${d.id}/lines/${l.id}`, { wholesalePrice: '88000' })).status)
      .toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].threshold).toBe('20.00');
  });

  it('hồ sơ ĐANG CÓ HIỆU LỰC không đổi số, và cũng không sửa được dòng', async () => {
    const productId = await sanPhamBaNguong();
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    await runToActive(d);
    expect((await doiLoai(customerId, 3)).status).toBe(200);

    const sau = (await get(`/policies/${d.id}`)).body;
    expect(sau.status).toBe('DANG_CO_HIEU_LUC');
    expect(sau.lines[0].threshold).toBe('10.00');
    // Hồ sơ đã khoá sửa nên không có đường nào làm nó đổi số.
    expect((await patch(`/policies/${d.id}/lines/${sau.lines[0].id}`, { wholesalePrice: '80000' })).status)
      .toBe(409);
  });
});

/**
 * 0027 — ghi chú tự do trên từng dòng sản phẩm.
 *
 * Cột chữ duy nhất giữa một dòng toàn số, và là thứ duy nhất trên dòng KHÔNG
 * phải ảnh chụp của danh mục: nó là chữ người lập gõ vào chính dòng này.
 */
describe('0027 ghi chú của dòng sản phẩm', () => {
  it('lưu và trả về nguyên văn khi lập hồ sơ', async () => {
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const r = await post('/policies', {
      customerId,
      lines: [line(productId, { note: 'Giá theo thoả thuận tháng 8' })],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines[0].note).toBe('Giá theo thoả thuận tháng 8');
  });

  it('không gửi ghi chú thì là null, không phải chuỗi rỗng', async () => {
    // Chuỗi rỗng và null cùng nghĩa "không ghi chú" — hai cách viết một nghĩa là
    // hai cách để một bộ lọc sót. Ràng buộc `ghi_chu_khong_rong` chặn ở CSDL.
    const d = await draft();
    expect((await get(`/policies/${d.id}`)).body.lines[0].note).toBeNull();
  });

  it('chuỗi rỗng nghĩa là KHÔNG ghi chú, và lưu xuống thành null', async () => {
    // `opt()` coi chuỗi rỗng là vắng mặt — nhờ đó ô ghi chú của biểu mẫu gửi
    // lên được ở mọi lượt lưu mà không phải tự quyết định khi nào thì bỏ trường
    // đi. Chuỗi rỗng KHÔNG bao giờ xuống tới CSDL: `ghi_chu_khong_rong` chặn nó
    // ở đó, phòng đường ghi nào khác quên chuẩn hoá.
    const d = await draft();
    const r = await post(`/policies/${d.id}/lines`, line(await makeProduct(), { note: '' }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines.at(-1).note).toBeNull();
  });

  it('chuỗi toàn khoảng trắng bị từ chối kèm tên trường', async () => {
    // Khác chuỗi rỗng: người dùng gõ mấy dấu cách rồi lưu là một nhầm lẫn, và
    // `str()` cắt khoảng trắng trước khi đo độ dài nên nó rơi xuống dưới tối
    // thiểu 1 ký tự.
    const d = await draft();
    const r = await post(`/policies/${d.id}/lines`, line(await makeProduct(), { note: '   ' }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('note');
  });

  it('quá 500 ký tự thì 400 — ô này in thẳng vào bản A4', async () => {
    const d = await draft();
    const r = await post(
      `/policies/${d.id}/lines`,
      line(await makeProduct(), { note: 'x'.repeat(501) }),
    );
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('note');
  });

  it('sửa dòng đổi được ghi chú, và BỎ trường đi là XOÁ ghi chú', async () => {
    // Biểu mẫu sửa dòng gửi lên toàn bộ nội dung dòng, nên vắng mặt ô ghi chú
    // nghĩa là người dùng vừa xoá nó — không phải "giữ nguyên giá trị cũ".
    const d = await draft();
    const l = (await get(`/policies/${d.id}`)).body.lines[0];

    expect(
      (await patch(`/policies/${d.id}/lines/${l.id}`, {
        wholesalePrice: '90000',
        note: 'Khách yêu cầu đóng thùng 12',
      })).status,
    ).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].note).toBe(
      'Khách yêu cầu đóng thùng 12',
    );

    expect(
      (await patch(`/policies/${d.id}/lines/${l.id}`, { wholesalePrice: '90000' })).status,
    ).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lines[0].note).toBeNull();
  });

  it('phiên bản mới CHÉP LẠI ghi chú của dòng thừa kế', async () => {
    // Phiên bản mới phải chứa lại toàn bộ sản phẩm cũ (POL-05). Chép dòng mà bỏ
    // ghi chú lại thì bản ký tên lần hai thiếu đúng phần chữ người lập viết ra.
    const customerId = await makeCustomer();
    const productId = await makeProduct();
    const d = await draft({ customerId, productId });
    const l = (await get(`/policies/${d.id}`)).body.lines[0];
    await patch(`/policies/${d.id}/lines/${l.id}`, {
      wholesalePrice: '90000',
      note: 'Ghi chú phải sống qua phiên bản',
    });
    await runToActive(d);

    // BỔ SUNG một sản phẩm khác: dòng cũ KHÔNG nằm trong danh sách gửi lên nên
    // nó là dòng thừa kế thuần tuý.
    const spMoi = await makeProduct();
    const v2 = await post('/policies', {
      customerId,
      mode: 'NEW_VERSION',
      lines: [line(spMoi)],
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);

    const cu = (v2.body.lines as { productId: string; note: string | null }[]).find(
      (x) => x.productId === productId,
    );
    expect(cu?.note).toBe('Ghi chú phải sống qua phiên bản');
  });
});

// =============================================================================
// 0029 — giá và ngưỡng theo NGÀY ÁP DỤNG, hồ sơ Nháp sống theo danh mục
// =============================================================================

const cat = async () => http(catalog);
const datGia = async (productId: string, amount: string, effectiveFrom: string) =>
  (await cat())
    .post(`/catalog/products/${productId}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount, effectiveFrom });

const khaiQuyDinh = async (body: object) =>
  (await cat())
    .post('/catalog/discount-rules')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send(body);

/** Sản phẩm thuộc nhóm RIÊNG, để quy định khai cho nó không đụng tệp test khác. */
const sanPhamNhomRieng = async (gia: string, tuNgay = '2020-01-01') => {
  const nhom = uniq('NHOM');
  const c = await cat();
  await c
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: nhom, name: 'Nhom rieng' });
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('SP'), name: 'San pham rieng', groupCode: nhom, price: '100000' });
  products.push(r.body.id);

  /*
   * XOÁ dòng giá của NGÀY HÔM NAY mà lượt tạo vừa sinh ra (`0123`).
   *
   * Từ `0123` tạo sản phẩm BẮT BUỘC có giá, và dòng ấy mang ngày hôm nay — nên
   * nó thắng mọi mốc quá khứ mà helper này dựng, và mọi ca kiểm về lịch sử giá
   * đọc ra đúng con số của lượt tạo. Đo được: 12 ca đỏ cùng lúc, tất cả với
   * `expected '100000' to be '300000'`.
   *
   * Đi thẳng CSDL vì API không còn đường nào tạo một sản phẩm chưa có giá — mà
   * đó chính là điểm của `0123`. Đây là fixture dựng một quá khứ, không phải một
   * đường nghiệp vụ.
   */
  await withAdminDb(async (c) =>
    c.query(
      `DELETE FROM cat.product_price
        WHERE product_id = $1 AND price_type = 'GIA_BAN_CONG_TY'
          AND effective_from = current_date`,
      [r.body.id],
    ),
  );
  await datGia(r.body.id as string, gia, tuNgay);
  return { productId: r.body.id as string, groupCode: nhom };
};

/*
 * `0180` — LUẬT `0029` GIỮ NGUYÊN, CHỈ ĐỔI MỨC: ngày áp dụng của TỪNG DÒNG
 * quyết định bảng giá và ngưỡng được chụp cho chính dòng ấy.
 */
/**
 * `0180` — TRẠNG THÁI của từng dòng, và TỶ LỆ CK CŨ.
 *
 * Khách hàng chốt 07/09: mỗi sản phẩm trong CSBH mang một trong ba trạng thái —
 * *Bổ sung* cho mặt hàng mới so với CSBH đang có, *Chỉnh sửa* cho mặt hàng có
 * sẵn mà TDV vừa sửa, *Đang áp dụng* cho mặt hàng có sẵn và để nguyên — cộng
 * một cột *Tỷ lệ CK cũ* cho những dòng đã bị sửa.
 *
 * Cả hai đều DẪN XUẤT, không lưu thành cột: phép so chạy giữa dòng của hồ sơ
 * này và dòng cùng sản phẩm của bản bị thay thế (`supersedes_id`). Vì thế nhóm
 * ca này canh cả những tính chất mà một CỜ lưu sẵn sẽ không có — sửa rồi trả
 * lại giá trị cũ thì dòng quay về *Đang áp dụng*.
 */
describe('`0180` trạng thái dòng và tỷ lệ CK cũ', () => {
  /** Dòng theo mã sản phẩm, cho gọn phần khẳng định. */
  const dongCua = (body: { lines: Record<string, unknown>[] }, productId: string) =>
    body.lines.find((l) => l['productId'] === productId)!;

  it('PHIÊN BẢN ĐẦU TIÊN: mọi dòng là *Bổ sung*, không có tỷ lệ cũ', async () => {
    // Khách chưa có CSBH nào thì `supersedes_id` rỗng, và mọi mặt hàng đều là
    // thứ vừa được đưa vào — khách hàng chốt đọc chúng là *Bổ sung*.
    const d = await draft();
    const l = dongCua(d.body, d.productId);
    expect(l['trangThai']).toBe('BO_SUNG');
    expect(l['discountRateTruoc']).toBeNull();
  });

  it('phiên bản mới KHÔNG SỬA GÌ: dòng thừa kế là *Đang áp dụng*', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    const l = dongCua(v2.body, d.productId);
    expect(l['trangThai']).toBe('DANG_AP_DUNG');
    // Không sửa thì không có gì để đối chiếu: tỷ lệ cũ BẰNG tỷ lệ mới, và in nó
    // ra là một cột lặp lại cột bên cạnh.
    expect(l['discountRateTruoc']).toBeNull();
  });

  it('SỬA GIÁ BÁN BUÔN: dòng thành *Chỉnh sửa*, và mang tỷ lệ CK của bản trước', async () => {
    const d = await draft();
    await runToActive(d);
    const tyLeCu = (d.body.lines as Record<string, unknown>[])[0]!['discountRate'];

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { wholesalePrice: '80000' })],
    });
    const l = dongCua(v2.body, d.productId);
    expect(l['trangThai']).toBe('CHINH_SUA');
    expect(l['discountRateTruoc']).toBe(tyLeCu);
    // …và tỷ lệ MỚI phải khác, nếu không thì ca này không chứng minh gì.
    expect(l['discountRate']).not.toBe(tyLeCu);
  });

  it('THÊM MẶT HÀNG MỚI vào phiên bản mới: dòng ấy là *Bổ sung*, dòng cũ vẫn nguyên', async () => {
    const d = await draft();
    await runToActive(d);
    const moi = await makeProduct();

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(moi)],
    });
    expect(dongCua(v2.body, moi)['trangThai']).toBe('BO_SUNG');
    expect(dongCua(v2.body, moi)['discountRateTruoc']).toBeNull();
    // Vế đối chiếu: thêm một mặt hàng KHÔNG được làm dòng cũ đổi trạng thái.
    expect(dongCua(v2.body, d.productId)['trangThai']).toBe('DANG_AP_DUNG');
  });

  it('`0215` đổi CHỈ GHI CHÚ thì KHÔNG phải *Chỉnh sửa*', async () => {
    /*
     * ĐẢO CHIỀU ca kiểm của `0180`, và đây là lý do nó phải được THAY chứ không
     * sửa số: bản cũ khẳng định *"đổi CHỈ GHI CHÚ cũng là Chỉnh sửa"*, dựa trên
     * chốt `07/09` — *"bị sửa là đổi bất kỳ dữ liệu nào người lập nhập"*. Khách
     * hàng đảo đúng vế ấy ngày 21/09: *"ghi chú không phải là trường để đánh giá
     * sản phẩm có bị chỉnh sửa không, nếu chỉ có ghi chú thay đổi, sản phẩm sẽ
     * vẫn giữ nguyên trạng thái"*.
     *
     * Ranh giới đọc ra được từ bốn trường còn lại: cả bốn đều đi vào TỜ GIẤY
     * khách hàng ký, còn ghi chú là lời nhắn của người lập cho người duyệt.
     *
     * Ghi chú vẫn phải GHI ĐƯỢC — nếu không thì ca này xanh vì lượt ghi hỏng chứ
     * không vì luật đúng.
     */
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { note: 'Khach yeu cau giao thang' })],
    });
    const l = dongCua(v2.body, d.productId);
    expect(l['trangThai']).toBe('DANG_AP_DUNG');
    expect(l['note'], 'ghi chú phải ghi được thật').toBe('Khach yeu cau giao thang');
  });

  it('đổi CHỈ NGÀY ÁP DỤNG cũng là *Chỉnh sửa*', async () => {
    const d = await draft({ ngayApDung: '2026-01-01' });
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { ngayApDung: '2026-02-01' })],
    });
    expect(dongCua(v2.body, d.productId)['trangThai']).toBe('CHINH_SUA');
  });

  it('SỬA RỒI TRẢ LẠI giá trị cũ thì dòng quay về *Đang áp dụng*', async () => {
    /*
     * Tính chất này là chỗ phân biệt DẪN XUẤT với một CỜ lưu sẵn, và nó không
     * phải một chi tiết kỹ thuật: TDV sửa nhầm rồi sửa lại thì hồ sơ của họ
     * KHÔNG khác bản đang hiệu lực ở dòng ấy, và một nhãn *Chỉnh sửa* dính lại
     * sẽ bắt người duyệt đi tìm một khác biệt không tồn tại.
     */
    const d = await draft();
    await runToActive(d);
    const cu = (d.body.lines as Record<string, unknown>[])[0]!;

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [line(d.productId, { wholesalePrice: '80000' })],
    });
    expect(dongCua(v2.body, d.productId)['trangThai']).toBe('CHINH_SUA');

    const lineId = dongCua(v2.body, d.productId)['id'] as string;
    const lai = await patch(`/policies/${v2.body.id}/lines/${lineId}`, {
      wholesalePrice: cu['wholesalePrice'],
      cpbh: cu['cpbh'],
      ngayApDung: String(cu['ngayApDung']).slice(0, 10),
    });
    expect(lai.status, JSON.stringify(lai.body)).toBe(200);
    expect(dongCua(lai.body, d.productId)['trangThai']).toBe('DANG_AP_DUNG');
    expect(dongCua(lai.body, d.productId)['discountRateTruoc']).toBeNull();
  });

  it('phép so đi theo SẢN PHẨM, không theo id dòng', async () => {
    /*
     * Dòng thừa kế là một HÀNG MỚI trong một hồ sơ mới, nên id của nó khác id
     * của dòng cùng sản phẩm ở bản trước. Phép so vẫn phải nối được hai bên —
     * nếu `SQL_NOI_BAN_TRUOC` nối theo `l.id` thì mọi dòng thừa kế của mọi phiên
     * bản thành *Bổ sung*, và người duyệt đọc ra rằng CSBH này thêm mới toàn bộ
     * danh mục — một câu sai về chính thứ họ sắp ký.
     *
     * ------------------------------------------------------------------------
     * CA NÀY THAY ca *"XOÁ rồi THÊM LẠI cùng sản phẩm"* của `0180` (`0186`).
     * ------------------------------------------------------------------------
     *
     * Ca cũ chứng minh cùng tính chất bằng đường xoá-rồi-thêm-lại, và `0186`
     * ĐÓNG đường ấy: xoá một dòng thừa kế giờ là xoá MỀM, nên `POST .../lines`
     * cho cùng sản phẩm trả `PRODUCT_LINE_DELETED` chứ không tạo hàng mới. Sửa
     * con số 201 thành 409 sẽ giữ lại một ca không còn nói gì về phép so nữa —
     * nó sẽ chỉ nói lại điều mà ca `PRODUCT_LINE_DELETED` bên `0186` đã nói.
     *
     * Nên ca này hỏi thẳng tính chất ấy, ở chỗ nó luôn đúng: hai id khác nhau,
     * một câu trả lời nối theo sản phẩm. Vế *"thêm lại vẫn là Chỉnh sửa"* không
     * mất — nó chuyển sang đường mới, xem ca *"thêm lại: dòng quay về đúng
     * trạng thái cũ"* của `0186`.
     */
    const d = await draft();
    await runToActive(d);
    const idCu = dongCua(d.body, d.productId)['id'] as string;

    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    const dongMoi = dongCua(v2.body, d.productId);
    expect(dongMoi['id'], 'dòng thừa kế phải là một hàng MỚI').not.toBe(idCu);
    expect(dongMoi['trangThai']).toBe('DANG_AP_DUNG');
  });
});

describe('0029 ảnh chụp lấy theo NGÀY ÁP DỤNG của DÒNG, không phải hôm nay', () => {
  it('giá của ngày áp dụng thắng giá của hôm nay', async () => {
    // Hai mốc giá: 100.000 từ 2020, 300.000 từ 2020-06. Hồ sơ áp dụng 2020-03
    // phải chụp 100.000 — dù hôm nay giá đã là 300.000.
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '300000', '2020-06-01');

    const customerId = await makeCustomer();
    const r = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2020-03-15' })],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines[0].companyPrice).toBe('100000');
  });

  it('`0180` HAI DÒNG HAI NGÀY thì chụp HAI bảng giá khác nhau', async () => {
    /*
     * Đây là điều mà bản trước `0180` KHÔNG làm được, và là lý do cả chặng tồn
     * tại: một hồ sơ gồm ba mặt hàng cũ áp dụng từ tháng trước cộng một mặt
     * hàng mới áp dụng từ tháng sau.
     *
     * Ca này cũng canh chỗ dễ hỏng nhất của bản sửa: `create` gom các dòng theo
     * NGÀY rồi tra ảnh chụp một lô cho mỗi ngày. Gom sai — hoặc trả về lô đầu
     * cho mọi dòng — thì hai dòng cùng mang một giá, và đó là một con số trông
     * hoàn toàn hợp lý.
     */
    const { productId: a } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(a, '300000', '2020-06-01');
    const { productId: b } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(b, '300000', '2020-06-01');

    const customerId = await makeCustomer();
    const r = await post('/policies', {
      customerId,
      lines: [
        line(a, { ngayApDung: '2020-03-15' }),
        line(b, { ngayApDung: '2020-09-15' }),
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const theoSp = new Map(
      (r.body.lines as { productId: string; companyPrice: string; ngayApDung: string }[]).map(
        (l) => [l.productId, l],
      ),
    );
    expect(theoSp.get(a)!.companyPrice).toBe('100000');
    expect(theoSp.get(b)!.companyPrice).toBe('300000');
    expect(String(theoSp.get(a)!.ngayApDung)).toContain('2020-03-15');
    expect(String(theoSp.get(b)!.ngayApDung)).toContain('2020-09-15');
  });

  it('không khai ngày áp dụng thì lấy giá hôm nay — và DÒNG mang ngày hôm nay', async () => {
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '300000', '2020-06-01');

    const customerId = await makeCustomer();
    const r = await post('/policies', { customerId, lines: [line(productId)] });
    expect(r.status).toBe(201);
    expect(r.body.lines[0].companyPrice).toBe('300000');
    // Mặc định đặt ở MÁY CHỦ (`0104`, `0180`): cột `NOT NULL`, không có dòng
    // nào không có ngày áp dụng.
    expect(String(r.body.lines[0].ngayApDung).slice(0, 10)).toBe(ngayVN());
  });

  it('NGƯỠNG cũng theo ngày áp dụng, không chỉ giá', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000', '2019-01-01');
    expect((await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2019-01-01', thresholdRate2: 1000,
    })).status).toBe(201);
    expect((await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2019-06-01', thresholdRate2: 2000,
    })).status).toBe(201);

    const customerId = await makeCustomer();
    const r = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2019-03-01' })],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines[0].threshold).toBe('10.00');
  });

  it('đổi NGÀY ÁP DỤNG của một dòng thì chụp lại theo bảng giá của ngày mới', async () => {
    // Đây là chỗ dễ quên nhất: đổi ngày mà không chụp lại thì dòng mang ngày
    // của tháng sau và giá của tháng trước. `0180` chuyển phép sửa ấy từ
    // `PATCH /policies/:id` sang `PATCH /policies/:id/lines/:lineId`.
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '300000', '2020-06-01');

    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2020-03-15' })],
    });
    expect(d.body.lines[0].companyPrice).toBe('100000');

    const lineId = d.body.lines[0].id as string;
    const sua = await patch(`/policies/${d.body.id}/lines/${lineId}`, {
      wholesalePrice: '90000',
      cpbh: ['5000'],
      ngayApDung: '2020-09-01',
    });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);
    expect(sua.body.lines[0].companyPrice).toBe('300000');
    expect(String(sua.body.lines[0].ngayApDung)).toContain('2020-09-01');
  });

  it('`0180` sửa dòng mà KHÔNG khai ngày thì GIỮ NGUYÊN ngày cũ', async () => {
    /*
     * Ngược với `note` ngay cạnh trong cùng DTO, nơi vắng mặt là XOÁ. Cột
     * `ngay_ap_dung` là `NOT NULL` nên không có trạng thái rỗng để xoá về, và
     * rơi về hôm nay thì sửa một khoản chi phí sẽ âm thầm kéo một dòng áp dụng
     * từ tháng sau về hôm nay — kèm theo là chụp lại một bảng giá khác.
     */
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2020-03-15' })],
    });
    const lineId = d.body.lines[0].id as string;

    const sua = await patch(`/policies/${d.body.id}/lines/${lineId}`, {
      wholesalePrice: '80000',
    });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);
    expect(String(sua.body.lines[0].ngayApDung)).toContain('2020-03-15');
  });
});

/*
 * `0194` — BA CA DƯỚI ĐÂY PHẢI THAY, KHÔNG SỬA SỐ.
 *
 * Chúng khẳng định *"mở lại hồ sơ Nháp thì thấy số MỚI"* — một câu về CƠ CHẾ, và
 * khách hàng vừa đảo đúng cơ chế ấy: từ `0194` đường đọc THÔI ghi đè, cái đã đổi
 * được BÀY RA và TDV bấm *Tự động cập nhật* để áp.
 *
 * Bất biến sống sót thì vẫn nguyên, và nó mới là thứ `0029` sinh ra để bảo vệ:
 * **con số TDV đọc đúng là con số sẽ được đóng băng**. Chỉ khác chỗ nó được bảo
 * đảm — trước là *"mỗi lượt mở"*, giờ là *"lượt áp dụng, và lượt gửi duyệt"*.
 * Tên `describe` đổi theo, vì "sống theo danh mục" đã hết đúng.
 */
describe('0029 hồ sơ Nháp không đóng băng — số lấy lại được, `0194` bằng một cú bấm', () => {
  /** Bấm *Tự động cập nhật* rồi đọc lại hồ sơ. */
  const apDungRoiDoc = async (id: string) => {
    const r = await post(`/policies/${id}/ap-dung-thay-doi`, {}, 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return get(`/policies/${id}`);
  };

  it('đổi giá → chênh lệch BÀY RA, bấm áp dụng thì thấy giá MỚI', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect(d.body.lines[0].companyPrice).toBe('100000');

    await datGia(productId, '150000', '2020-02-01');

    // `0194` — lượt ĐỌC chỉ bày ra, không ghi đè.
    const truoc = await get(`/policies/${d.body.id}`);
    expect(truoc.body.lines[0].companyPrice).toBe('100000');
    expect(truoc.body.lech).toHaveLength(1);

    const lai = await apDungRoiDoc(d.body.id as string);
    expect(lai.status).toBe(200);
    expect(lai.body.lines[0].companyPrice).toBe('150000');
    expect(lai.body.lech).toEqual([]);
    // Giá thu về giữ nguyên (người dùng nhập), tỷ lệ chiết khấu tính LẠI.
    expect(lai.body.lines[0].wholesalePrice).toBe('90000');
    expect(lai.body.lines[0].discountRate).not.toBe(d.body.lines[0].discountRate);
  });

  it('đổi NGƯỠNG → bấm áp dụng thì thấy ngưỡng MỚI', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    const qd = await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    });
    expect(qd.status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect(d.body.lines[0].threshold).toBe('10.00');

    expect(
      (await (await cat())
        .patch(`/catalog/discount-rules/${qd.body.code}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({ thresholdRate2: 2500 })).status,
    ).toBe(200);

    const truoc = await get(`/policies/${d.body.id}`);
    expect(truoc.body.lines[0].threshold, 'đọc thôi thì chưa đổi').toBe('10.00');
    expect(truoc.body.lech.map((l: { kind: string }) => l.kind)).toEqual(['RULE']);

    const lai = await apDungRoiDoc(d.body.id as string);
    expect(lai.body.lines[0].threshold).toBe('25.00');
    expect(lai.body.lines[0].ruleCode).toBe(qd.body.code);
  });

  it('làm mới KHÔNG đụng giá bán buôn và CPBH — đó là số người dùng nhập', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [{ productId, wholesalePrice: '77000', cpbh: ['1000', '2000'] }],
    });
    await datGia(productId, '500000', '2020-02-01');

    const lai = await apDungRoiDoc(d.body.id as string);
    expect(lai.body.lines[0].wholesalePrice).toBe('77000');
    expect(lai.body.lines[0].cpbh).toEqual(['1000', '2000']);
    expect(lai.body.lines[0].companyPrice).toBe('500000');
  });

  it('hồ sơ ĐÃ GỬI DUYỆT thì KHÔNG làm mới — đóng băng là đóng băng', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '900000', '2020-02-01');

    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.body.status).toBe('CHO_TBP_DUYET');
    expect(lai.body.lines[0].companyPrice).toBe('100000');
  });

  it('làm mới KHÔNG bump row_version — thẻ khoá lạc quan phải còn dùng được', async () => {
    // Một lượt ĐỌC làm hỏng thẻ khoá người dùng đang cầm là một 409 không giải
    // thích được cho họ.
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const v = d.body.rowVersion as number;

    await datGia(productId, '150000', '2020-02-01');
    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.body.rowVersion).toBe(v);
    // Và hành động kèm đúng rowVersion ấy vẫn đi được.
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  });
});

describe('0029 GỬI DUYỆT làm mới lần cuối rồi mới đóng băng', () => {
  it('giá đổi giữa lúc mở và lúc bấm Gửi thì đóng băng giá MỚI', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });

    // Không mở lại hồ sơ — đổi giá rồi bấm Gửi thẳng.
    await datGia(productId, '250000', '2020-02-01');
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const sau = await get(`/policies/${d.body.id}`);
    expect(sau.body.lines[0].companyPrice).toBe('250000');
  });

  it('sản phẩm vô hiệu hoá: MỞ vẫn được, GỬI thì 422 kèm tên sản phẩm', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const maSp = d.body.lines[0].productCode as string;

    expect(
      (await (await cat())
        .patch(`/catalog/products/${productId}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        // `confirm` = mã sản phẩm, bắt buộc từ `0036`.
        .send({ status: 'DA_VO_HIEU_HOA', confirm: maSp })).status,
    ).toBe(200);

    // MỞ: vẫn xem được, dòng giữ nguyên số cũ. Chặn ở đây là nhốt người dùng
    // ngoài chính hồ sơ của họ, đúng cái hồ sơ họ cần vào để xoá dòng hỏng.
    const lai = await get(`/policies/${d.body.id}`);
    expect(lai.status).toBe(200);
    expect(lai.body.lines[0].companyPrice).toBe('100000');

    // GỬI: chặn, và nói rõ sản phẩm nào.
    const gui = await act(d.body.id, 'SUBMIT', 'tdv01');
    expect(gui.status).toBe(422);
    expect(gui.body.code).toBe('STALE_LINE');
    expect(gui.body.products).toContain(maSp);
  });
});

// =============================================================================
// 0029 — dấu vết "hồ sơ đã đóng băng đang lệch so với danh mục"
//
// Gọi THẲNG `handle()` thay vì đẩy qua RabbitMQ: phần bus đã được `notification.
// test.ts` chạy qua đường thật rồi, còn ở đây thứ cần khẳng định là PHÉP SO và
// phép đồng bộ bảng — hai thứ không cần tới hàng đợi để sai.
// =============================================================================

describe('0029 box Yêu cầu cập nhật', () => {
  const raSoat = async (productId?: string) =>
    app.get(CatalogImpactConsumer).handle(productId === undefined ? {} : { productId });

  /*
   * `limit=200` — trần một trang, không phải 50.
   *
   * Mỗi ca trong khối này dựng thêm một hồ sơ lệch, và CSDL của bộ test dùng
   * chung nên chúng cộng dồn. Tới lúc vượt 50, hồ sơ mà ca kiểm thử vừa dựng rơi
   * ra ngoài trang đầu và ca ấy đỏ vì một lý do chẳng liên quan gì tới điều đang
   * kiểm. Đã dính đúng chuyện này.
   */
  const lech = async (who = 'tdv01') =>
    (await get('/policies/impacted?limit=200', who)).body.items as {
      id: string;
      lech: { kind: string; productCode: string; snapValue: string; newValue: string | null }[];
    }[];

  it('đổi giá xong thì hồ sơ ĐANG CHỜ DUYỆT hiện trong box, kèm giá cũ và mới', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '180000', '2020-02-01');
    await raSoat(productId);

    const ds = await lech();
    const h = ds.find((x) => x.id === d.body.id);
    expect(h, 'hồ sơ chờ duyệt phải nằm trong box').toBeDefined();
    const gia = h!.lech.find((l) => l.kind === 'PRICE')!;
    expect(gia.snapValue).toBe('100000');
    expect(gia.newValue).toBe('180000');
  });

  it('hồ sơ ĐANG CÓ HIỆU LỰC cũng nằm trong box', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId });
    await runToActive(d);

    await datGia(productId, '190000', '2020-02-01');
    await raSoat(productId);

    expect((await lech()).some((x) => x.id === d.id)).toBe(true);
  });

  it('`0200` hồ sơ NHÁP CŨNG nằm trong box', async () => {
    /*
     * CA NÀY PHẢI THAY, không sửa số. Bản cũ khẳng định điều NGƯỢC LẠI — *"hồ sơ
     * Nháp không nằm trong box, nó tự cập nhật nên không cần nhắc"* — và câu ấy
     * đúng cho tới `0193`, khi mở một bản nháp là giá bị chụp lại trong im lặng.
     *
     * `0194` gỡ phép ghi đè ấy và thay bằng một cái nút, nên từ đó bản nháp CÓ
     * THỂ lệch mà nằm yên. `0200` là vế còn thiếu: không có box thì TDV không có
     * đường nào để BIẾT mà bấm — họ phải mở từng hồ sơ ra xem.
     */
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });

    await datGia(productId, '200000', '2020-02-01');
    await raSoat(productId);

    expect((await lech()).some((x) => x.id === d.body.id)).toBe(true);
  });

  it('đổi giá TRẢ LẠI như cũ thì dấu vết BIẾN MẤT', async () => {
    // Một box còn treo cảnh báo đã hết hiệu lực là một box người dùng học cách
    // bỏ qua — nên xoá quan trọng ngang ghi.
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '210000', '2020-02-01');
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(true);

    await datGia(productId, '100000', '2020-03-01');
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });

  it('đổi NGƯỠNG cũng vào box, và loại chênh lệch là RULE', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    const qd = await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    });
    expect(qd.status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    expect(
      (await (await cat())
        .patch(`/catalog/discount-rules/${qd.body.code}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({ thresholdRate2: 2200 })).status,
    ).toBe(200);
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h).toBeDefined();
    const ng = h!.lech.find((l) => l.kind === 'RULE')!;
    expect(ng.snapValue).toBe('10.00');
    expect(ng.newValue).toBe('22.00');
  });

  it('quy định MỚI cụ thể hơn cũng bị bắt — dù hồ sơ không nhắc tới mã của nó', async () => {
    // Đây là lý do phép rà phải TRA LẠI thay vì lọc theo `rule_code_snap`. Hồ sơ
    // chụp quy định chung cho cả nhóm; một quy định khai sau, riêng cho loại
    // khách này, thắng nó — mà mã của quy định mới chưa từng xuất hiện trên hồ sơ.
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    expect((await khaiQuyDinh({
      code: uniq('CK'), productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    })).status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    // Khách hàng test là loại 1 (`makeCustomer`).
    const maMoi = uniq('CK');
    expect((await khaiQuyDinh({
      code: maMoi, productGroupCode: nhom, customerType: 1,
      effectiveFrom: '2020-01-01', thresholdRate2: 3300,
    })).status).toBe(201);
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'quy định mới cụ thể hơn phải bị bắt').toBeDefined();
    // `0238` — quy định khác nên vế mới mang cả mã của nó.
    expect(h!.lech.find((l) => l.kind === 'RULE')!.newValue).toBe(`33.00|${maMoi}`);
  });

  it('phạm vi dữ liệu: TDV khác KHÔNG thấy hồ sơ này', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer('tdv01');
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await datGia(productId, '230000', '2020-02-01');
    await raSoat(productId);

    expect((await lech('tdv01')).some((x) => x.id === d.body.id)).toBe(true);
    expect((await lech('tdv02')).some((x) => x.id === d.body.id)).toBe(false);
    // Trưởng bộ phận duyệt tdv01 thì THẤY — box đi theo cây phân quyền.
    expect((await lech('tbp01')).some((x) => x.id === d.body.id)).toBe(true);
  });

  it('không có gì lệch thì trả danh sách RỖNG, không phải lỗi', async () => {
    const r = await get('/policies/impacted?limit=50', 'sa01');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
  });

  // ===========================================================================
  // `0036` — loại lệch thứ ba: sản phẩm không còn dùng được
  //
  // Trước `0036` cả nhóm này lọt sạch. Vô hiệu hoá một sản phẩm KHÔNG đổi giá
  // của nó, mà consumer chỉ so giá và ngưỡng; còn xoá hẳn thì lời gọi tra ảnh
  // chụp trả 404 cho cả lô và consumer bỏ qua TOÀN BỘ hồ sơ.
  // ===========================================================================

  const voHieuHoa = async (productId: string, ma: string) =>
    (await cat())
      .patch(`/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ status: 'DA_VO_HIEU_HOA', confirm: ma });

  it('VÔ HIỆU HOÁ sản phẩm cũng là một thay đổi — vào box, loại PRODUCT', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const maSp = d.body.lines[0].productCode as string;
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    expect((await voHieuHoa(productId, maSp)).status).toBe(200);
    await raSoat(productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'sản phẩm vô hiệu hoá phải đưa hồ sơ vào box').toBeDefined();
    const sp = h!.lech.find((l) => l.kind === 'PRODUCT');
    expect(sp, `chỉ thấy: ${JSON.stringify(h!.lech)}`).toBeDefined();
    expect(sp!.snapValue).toBe('Đang áp dụng');
    expect(sp!.newValue).toBe('Đã vô hiệu hoá');
    // Giá không đổi thì KHÔNG kèm một dòng PRICE — box nói đúng thứ đã đổi.
    expect(h!.lech.some((l) => l.kind === 'PRICE')).toBe(false);
  });

  it('BẬT LẠI sản phẩm thì dấu vết biến mất', async () => {
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    const maSp = d.body.lines[0].productCode as string;
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await voHieuHoa(productId, maSp);
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(true);

    await (await cat())
      .patch(`/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      // `confirm` bắt buộc ở MỌI lượt sửa từ `0123`, kể cả lượt bật lại.
      .send({ status: 'DANG_AP_DUNG', confirm: maSp });
    await raSoat(productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });

  it('sản phẩm bị XOÁ khỏi danh mục: `newValue` rỗng, không nuốt lặng', async () => {
    // Ca nặng nhất và lại bị nuốt gọn nhất trước `0036`: lời gọi tra ảnh chụp
    // trả 404 cho cả lô, consumer `continue`, và hồ sơ biến khỏi box.
    const { productId } = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    // Không có đường API nào xoá sản phẩm — đó là chủ ý. Ở đây xoá thẳng bằng
    // SQL để dựng đúng tình huống "dòng hồ sơ trỏ vào một sản phẩm không còn".
    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [productId]));
    await raSoat(productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'sản phẩm đã xoá phải đưa hồ sơ vào box').toBeDefined();
    const sp = h!.lech.find((l) => l.kind === 'PRODUCT')!;
    expect(sp.newValue).toBeNull();
  });

  it('một sản phẩm biến mất KHÔNG che mất chênh lệch của dòng còn lại', async () => {
    // Bất biến của cả nhánh lùi-về-hỏi-từng-cái: lời gọi cả lô hỏng thì phải hỏi
    // lẻ, chứ không bỏ qua cả hồ sơ.
    const a = await sanPhamNhomRieng('100000');
    const b = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [line(a.productId), line(b.productId)],
    });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [a.productId]));
    await datGia(b.productId, '175000', '2020-02-01');
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h).toBeDefined();
    expect(h!.lech.some((l) => l.kind === 'PRODUCT')).toBe(true);
    const gia = h!.lech.find((l) => l.kind === 'PRICE');
    expect(gia, 'dòng còn lại vẫn phải được so').toBeDefined();
    expect(gia!.newValue).toBe('175000');
  });

  it('`0083` lời gọi danh mục HỎNG thì giữ nguyên dấu vết, không kết luận "đã xoá"', async () => {
    /*
     * ĐÂY LÀ GỐC CỦA MỘT CA CHẬP CHỜN, và là một lỗi thật nặng hơn nhiều so với
     * cái ca chập chờn ấy.
     *
     * `traAnhChup` từng nuốt MỌI loại lỗi rồi coi id vắng mặt trong kết quả là
     * *"sản phẩm đã bị xoá khỏi danh mục"*. Một lần catalog khởi động lại, một
     * lần mạng chớp — và mọi hồ sơ đã đóng băng bị ghi đè dấu vết thành "sản
     * phẩm đã bị xoá". Tệ hơn: nhánh ấy `continue`, không so giá nữa, nên dấu
     * vết **lệch giá thật** bị xoá theo.
     *
     * Không có gì báo. Con số trên box *Yêu cầu cập nhật* chỉ đổi, và đổi sang
     * một lời nói dối về danh mục.
     *
     * Dựng lại đúng tình huống ấy: chặn cả hai đường tra danh mục cho hỏng
     * KHÔNG PHẢI 404, rồi rà lại. Dấu vết cũ phải còn nguyên.
     */
    const a = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(a.productId)] });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await datGia(a.productId, '155000', '2020-02-01');
    await raSoat(a.productId);
    const truoc = (await lech()).find((x) => x.id === d.body.id)!.lech;
    expect(truoc.some((l) => l.kind === 'PRICE'), 'chưa dựng được dấu vết nền').toBe(true);

    // Cả hai đường tra danh mục cùng hỏng — đúng như lúc catalog đang khởi động lại.
    const clients = app.get(Clients);
    const loi = new Error('catalog trả 503');
    const g1 = vi.spyOn(clients, 'productSnapshots').mockRejectedValue(loi);
    const g2 = vi.spyOn(clients, 'productSnapshot').mockRejectedValue(loi);
    try {
      await raSoat(a.productId);
    } finally {
      g1.mockRestore();
      g2.mockRestore();
    }

    const sau = (await lech()).find((x) => x.id === d.body.id);
    expect(sau, 'hồ sơ biến mất khỏi box vì một lời gọi hỏng').toBeDefined();
    expect(
      sau!.lech.some((l) => l.kind === 'PRICE'),
      `dấu vết lệch giá bị xoá; còn lại: ${JSON.stringify(sau!.lech)}`,
    ).toBe(true);
    expect(
      sau!.lech.some((l) => l.kind === 'PRODUCT'),
      'kết luận "đã xoá khỏi danh mục" từ một lời gọi hỏng',
    ).toBe(false);
  });

  it('`0083` 404 THẬT thì vẫn kết luận đã xoá — không nới tay quá', async () => {
    /*
     * Vế đối chứng. Nếu `0083` chặn cả ca này thì sản phẩm bị xoá khỏi danh mục
     * lại lọt qua im lặng, đúng cái lỗ mà `0036` mở ra để bịt.
     */
    const a = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(a.productId)] });
    await act(d.body.id, 'SUBMIT', 'tdv01');

    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [a.productId]));
    await raSoat(a.productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'hồ sơ có sản phẩm đã xoá phải hiện trong box').toBeDefined();
    const sp = h!.lech.find((l) => l.kind === 'PRODUCT');
    expect(sp, 'sản phẩm đã xoá mà không có dấu vết nào').toBeDefined();
    expect(sp!.newValue, 'đã xoá khỏi danh mục thì không có trạng thái mới').toBeNull();
  });

  it('rà theo MỘT sản phẩm KHÔNG xoá dấu vết của sản phẩm khác cùng hồ sơ', async () => {
    /*
     * Lỗi có thật, và hỏng lặng lẽ.
     *
     * Lượt rà theo một sản phẩm cụ thể chỉ tính ra chênh lệch cho đúng sản phẩm
     * ấy, rồi vòng dọn coi mọi dấu vết còn lại của cùng hồ sơ là "đã hết" và
     * xoá sạch. Quản trị đổi giá sản phẩm A thì cảnh báo của sản phẩm B trên
     * cùng hồ sơ biến mất, dù B vẫn đang lệch — không có gì báo, con số chỉ tụt.
     *
     * Trước `0036` lỗi bị che vì lượt rà cuối trong mọi đường đi đều là quét
     * toàn bộ; thêm một lượt rà theo sản phẩm vào cuối là lộ ra ngay.
     */
    const a = await sanPhamNhomRieng('100000');
    const b = await sanPhamNhomRieng('100000');
    const customerId = await makeCustomer();
    const d = await post('/policies', {
      customerId,
      lines: [line(a.productId), line(b.productId)],
    });
    const maB = (d.body.lines as { productId: string; productCode: string }[]).find(
      (x) => x.productId === b.productId,
    )!.productCode;
    await act(d.body.id, 'SUBMIT', 'tdv01');

    // Lệch ở A trước.
    await datGia(a.productId, '155000', '2020-02-01');
    await raSoat(a.productId);
    expect(
      (await lech()).find((x) => x.id === d.body.id)?.lech.some((l) => l.kind === 'PRICE'),
    ).toBe(true);

    // Rồi một lượt rà CHỈ VỀ B. Dấu vết của A phải còn nguyên.
    expect((await voHieuHoa(b.productId, maB)).status).toBe(200);
    await raSoat(b.productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'hồ sơ không được biến mất khỏi box').toBeDefined();
    expect(
      h!.lech.some((l) => l.kind === 'PRICE'),
      `dấu vết của sản phẩm A bị xoá oan; còn lại: ${JSON.stringify(h!.lech)}`,
    ).toBe(true);
    expect(h!.lech.some((l) => l.kind === 'PRODUCT')).toBe(true);
  });

  it('XOÁ quy định chiết khấu: ngưỡng về rỗng, và đó là một chênh lệch', async () => {
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000');
    const ma = uniq('CK');
    expect((await khaiQuyDinh({
      code: ma, productGroupCode: nhom,
      effectiveFrom: '2020-01-01', thresholdRate2: 1000,
    })).status).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    expect(
      (await (await cat())
        .delete(`/catalog/discount-rules/${ma}`)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .send({ confirm: ma })).status,
    ).toBe(200);
    await raSoat();

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h, 'xoá quy định phải đưa hồ sơ vào box').toBeDefined();
    const ng = h!.lech.find((l) => l.kind === 'RULE')!;
    expect(ng.snapValue).toBe('10.00');
    expect(ng.newValue, 'không còn quy định nào phủ').toBeNull();
  });

  /*
   * PHỦ ĐỦ MƯỜI TRẠNG THÁI.
   *
   * Câu hỏi thật của box: hồ sơ nào còn AI LÀM ĐƯỢC GÌ với chênh lệch ấy.
   *
   * `0200` DỜI HAI TRẠNG THÁI từ vế dưới lên vế trên, và đó là một phép THAY chứ
   * không phải nới: câu cũ giải thích rằng `NHAP` và `YEU_CAU_CHINH_SUA` vắng
   * mặt *"vì chúng tự tra lại mỗi lần mở, nên nhắc là thừa"*. Lý do ấy chết từ
   * `0194` — đường đọc thôi ghi đè, và việc áp dụng thành một cú bấm. Từ đó
   * chúng là đúng những hồ sơ mà nhắc có ích NHẤT: chỉ ở đó mới có người sửa
   * được ngay.
   *
   * Ba trạng thái kết thúc vẫn vắng mặt, với lý do KHÔNG đổi: không ai làm gì
   * được nữa.
   */
  const CHO_VAO_BOX = [
    'NHAP',
    'YEU_CAU_CHINH_SUA',
    'CHO_TBP_DUYET',
    'CHO_KT_L1',
    'SA_DANG_XU_LY',
    'CHO_KT_L2',
    'QUA_HAN_DUYET',
    'DANG_CO_HIEU_LUC',
  ];
  const KHONG_VAO_BOX = ['HET_HIEU_LUC', 'DA_XOA'];

  for (const tt of [...CHO_VAO_BOX, ...KHONG_VAO_BOX]) {
    const nen = CHO_VAO_BOX.includes(tt);
    it(`vô hiệu hoá sản phẩm · hồ sơ ${tt} ${nen ? 'VÀO' : 'KHÔNG vào'} box`, async () => {
      const { productId } = await sanPhamNhomRieng('100000');
      const customerId = await makeCustomer();
      const d = await post('/policies', { customerId, lines: [line(productId)] });
      const maSp = d.body.lines[0].productCode as string;

      // Đặt thẳng trạng thái: ở đây điều đang kiểm là PHÉP LỌC theo trạng thái,
      // không phải đường đi tới trạng thái ấy — cái đó đã có bộ test luồng
      // riêng. Chạy đủ mười bước cho mười hai ca là mười hai lần chạy lại cùng
      // một luồng để kiểm một mệnh đề khác.
      if (tt !== 'NHAP') {
        await withAdminDb((c) =>
          c.query(
            `UPDATE pol.policy SET status = $2::pol.policy_status,
                    pending_step = $3::pol.policy_step WHERE id = $1`,
            [d.body.id, tt, tt === 'QUA_HAN_DUYET' ? 'B4_TBP_DUYET' : null],
          ),
        );
      }

      expect((await voHieuHoa(productId, maSp)).status).toBe(200);
      await raSoat(productId);

      const co = await withAdminDb(async (c) => {
        const r = await c.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pol.policy_impact
            WHERE policy_id = $1 AND kind = 'PRODUCT'`,
          [d.body.id],
        );
        return Number(r.rows[0]!.n) > 0;
      });
      expect(co, `${tt}: dấu vết PRODUCT`).toBe(nen);

      // Dọn: `DA_XOA` không xoá được ở bước dọn cuối tệp.
      await withAdminDb((c) =>
        c.query(`UPDATE pol.policy SET status = 'NHAP' WHERE id = $1`, [d.body.id]),
      );
    });
  }
});

// =============================================================================
// 0238 — ĐỔI NHÓM một sản phẩm → quy định chiết khấu đổi → *Yêu cầu cập nhật*
//
// Khách hàng 29/09: *"khi sửa thông tin sản phẩm cho phép thay đổi cả nhóm… khi
// nhóm thay đổi, quy định chiết khấu đối với sản phẩm đó cũng thay đổi, yêu cầu
// hệ thống cập nhật thông tin này vào danh sách CSBH cần yêu cầu cập nhật"*.
//
// Không có đường báo riêng cho lượt đổi nhóm: `PATCH /catalog/products/:id` phát
// `catalog.changed` (entity `product`), consumer rà mọi hồ sơ chứa sản phẩm ấy,
// và ngưỡng tra theo nhóm HIỆN TẠI. Khối này canh cả chuỗi ấy, và vế mới của phép
// so — MÃ quy định (cùng ngưỡng, khác mã vẫn là lệch; chốt khi được hỏi).
// =============================================================================

describe('0238 đổi nhóm sản phẩm → Yêu cầu cập nhật', () => {
  const raSoat = async (productId: string) => app.get(CatalogImpactConsumer).handle({ productId });
  const lech = async (who = 'tdv01') =>
    (await get('/policies/impacted?limit=200', who)).body.items as {
      id: string;
      lech: { kind: string; productCode: string; snapValue: string; newValue: string | null }[];
    }[];

  /** Nhóm mới, trống, kèm (tuỳ) MỘT quy định cho nó. Trả mã nhóm và mã quy định. */
  const nhomMoi = async (nguong: number | null) => {
    const g = uniq('NHOM');
    await (await cat())
      .post('/catalog/product-groups')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ code: g, name: 'Nhom moi 0238' });
    if (nguong === null) return { g, qd: null };
    const qd = uniq('CK');
    const r = await khaiQuyDinh({
      code: qd, productGroupCode: g, effectiveFrom: '2020-01-01', thresholdRate2: nguong,
    });
    expect(r.status).toBe(201);
    return { g, qd };
  };

  /** Sản phẩm trong nhóm riêng CÓ một quy định (ngưỡng `nguong`). */
  const sanPhamCoQuyDinh = async (nguong: number) => {
    const sp = await sanPhamNhomRieng('100000');
    const qd = uniq('CK');
    expect(
      (await khaiQuyDinh({
        code: qd, productGroupCode: sp.groupCode, effectiveFrom: '2020-01-01', thresholdRate2: nguong,
      })).status,
    ).toBe(201);
    return { ...sp, qd };
  };

  const maCua = async (productId: string) =>
    withAdminDb(async (c) =>
      (await c.query<{ code: string }>(`SELECT code FROM cat.product WHERE id = $1`, [productId]))
        .rows[0]!.code,
    );

  const doiNhom = async (productId: string, groupCode: string, confirm?: string) =>
    (await cat())
      .patch(`/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ groupCode, confirm: confirm ?? (await maCua(productId)) });

  it('PATCH đổi được nhóm, và sự kiện `catalog.changed` mang nhóm TRƯỚC và SAU', async () => {
    const sp = await sanPhamCoQuyDinh(1000);
    const { g } = await nhomMoi(2200);
    const r = await doiNhom(sp.productId, g);
    expect(r.status).toBe(200);

    const nhom = await withAdminDb(async (c) =>
      (
        await c.query<{ code: string }>(
          `SELECT g.code FROM cat.product p JOIN cat.product_group g ON g.id = p.group_id
            WHERE p.id = $1`,
          [sp.productId],
        )
      ).rows[0]!.code,
    );
    expect(nhom).toBe(g);

    // Consumer của `policy` nghe đúng sự kiện này (entity `product`) — và nhật ký
    // (CAT-13) cần thấy nhóm đổi, không phải một lượt sửa rỗng.
    const ev = await withAdminDb(async (c) =>
      (
        await c.query<{ payload: { entity: string; before: { groupId: string }; after: { groupId: string } } }>(
          `SELECT payload FROM cat.outbox
            WHERE routing_key = 'catalog.changed' AND payload->>'id' = $1
            ORDER BY created_at DESC LIMIT 1`,
          [sp.productId],
        )
      ).rows[0]!.payload,
    );
    expect(ev.entity).toBe('product');
    expect(ev.before.groupId).not.toBe(ev.after.groupId);
  });

  it('nhóm KHÔNG có thật → 404 GROUP_NOT_FOUND, nhóm cũ giữ nguyên', async () => {
    const sp = await sanPhamCoQuyDinh(1000);
    const r = await doiNhom(sp.productId, uniq('KHONGCO'));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('GROUP_NOT_FOUND');
    const nhom = await withAdminDb(async (c) =>
      (
        await c.query<{ code: string }>(
          `SELECT g.code FROM cat.product p JOIN cat.product_group g ON g.id = p.group_id
            WHERE p.id = $1`,
          [sp.productId],
        )
      ).rows[0]!.code,
    );
    expect(nhom).toBe(sp.groupCode);
  });

  it('đổi nhóm vẫn đòi GÕ LẠI MÃ như mọi lượt sửa (`0123`)', async () => {
    const sp = await sanPhamCoQuyDinh(1000);
    const { g } = await nhomMoi(2200);
    const r = await doiNhom(sp.productId, g, 'SAI-MA');
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('nhóm mới NGƯỠNG KHÁC → hồ sơ ĐANG CÓ HIỆU LỰC vào box, RULE mang ngưỡng và mã hai vế', async () => {
    const sp = await sanPhamCoQuyDinh(1000);
    const customerId = await makeCustomer();
    const d = await draft({ customerId, productId: sp.productId });
    await runToActive(d);

    const { g, qd } = await nhomMoi(2200);
    expect((await doiNhom(sp.productId, g)).status).toBe(200);
    await raSoat(sp.productId);

    const h = (await lech()).find((x) => x.id === d.id);
    expect(h, 'hồ sơ hiệu lực phải nằm trong box').toBeDefined();
    const r = h!.lech.find((l) => l.kind === 'RULE')!;
    expect(r.snapValue).toBe(`10.00|${sp.qd}`);
    expect(r.newValue).toBe(`22.00|${qd}`);
  });

  it('nhóm mới CÙNG NGƯỠNG, KHÁC quy định → VẪN vào box (chốt 29/09)', async () => {
    /*
     * Ca khách hàng chốt khi được hỏi. Trước `0238` phép so chỉ nhìn con số, nên
     * hồ sơ nằm yên với cột QĐCK mang mã của một quy định không còn phủ dòng ấy.
     */
    const sp = await sanPhamCoQuyDinh(1500);
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(sp.productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const { g, qd } = await nhomMoi(1500);
    expect((await doiNhom(sp.productId, g)).status).toBe(200);
    await raSoat(sp.productId);

    const h = (await lech()).find((x) => x.id === d.body.id);
    expect(h).toBeDefined();
    expect(h!.lech).toEqual([
      expect.objectContaining({ kind: 'RULE', snapValue: `15.00|${sp.qd}`, newValue: `15.00|${qd}` }),
    ]);
  });

  it('nhóm mới KHÔNG có quy định nào → vào box, vế mới là *"không còn quy định nào"*', async () => {
    const sp = await sanPhamCoQuyDinh(1000);
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(sp.productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const { g } = await nhomMoi(null);
    expect((await doiNhom(sp.productId, g)).status).toBe(200);
    await raSoat(sp.productId);

    const r = (await lech()).find((x) => x.id === d.body.id)!.lech.find((l) => l.kind === 'RULE')!;
    expect(r.snapValue).toBe('10.00');
    expect(r.newValue).toBeNull();
  });

  it('đổi nhóm rồi ĐỔI LẠI → dấu vết biến mất', async () => {
    const sp = await sanPhamCoQuyDinh(1000);
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(sp.productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const { g } = await nhomMoi(2200);
    await doiNhom(sp.productId, g);
    await raSoat(sp.productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(true);

    expect((await doiNhom(sp.productId, sp.groupCode)).status).toBe(200);
    await raSoat(sp.productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });

  it('hồ sơ NHÁP: vào box, *Tự động cập nhật* chụp quy định MỚI rồi rời box', async () => {
    const sp = await sanPhamCoQuyDinh(1500);
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(sp.productId)] });

    const { g, qd } = await nhomMoi(1500);
    expect((await doiNhom(sp.productId, g)).status).toBe(200);
    await raSoat(sp.productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(true);
    // Màn hình hồ sơ TÍNH TẠI CHỖ (`0194`) — cũng phải thấy cùng mục lệch.
    expect((await get(`/policies/${d.body.id}`)).body.lech).toEqual([
      expect.objectContaining({ kind: 'RULE', snapValue: `15.00|${sp.qd}`, newValue: `15.00|${qd}` }),
    ]);

    expect((await post(`/policies/${d.body.id}/ap-dung-thay-doi`, {}, 'tdv01')).status).toBe(200);
    const l = (await get(`/policies/${d.body.id}`)).body.lines[0];
    expect(l.ruleCode).toBe(qd);
    expect(l.threshold).toBe('15.00');
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });

  it('sửa TÊN mà không gửi nhóm → nhóm và quy định giữ nguyên, không sinh lệch', async () => {
    const sp = await sanPhamCoQuyDinh(1000);
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(sp.productId)] });
    expect((await act(d.body.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const r = await (await cat())
      .patch(`/catalog/products/${sp.productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ name: 'Ten moi 0238', confirm: await maCua(sp.productId) });
    expect(r.status).toBe(200);
    await raSoat(sp.productId);
    expect((await lech()).some((x) => x.id === d.body.id)).toBe(false);
  });
});

// =============================================================================
// `0069` — mỗi loại tệp một người, không phải mọi vai trò trong luồng
// =============================================================================

describe('`0069` ai được đụng vào tệp nào', () => {
  /*
   * Tới `0068` phép kiểm chỉ xét TRẠNG THÁI hồ sơ. Nghĩa là ở bước *Sale Admin
   * xử lý*, kế toán tải được bản scan lên — và gỡ được bản scan đi, chặn luôn
   * bước bàn giao.
   *
   * Bản scan là bản giấy có chữ ký khách hàng, do chính Sale Admin in ra, trình
   * ký rồi scan lại. Không ai khác cầm nó trong tay, nên không ai khác có gì để
   * mà tải lên.
   */
  const toiBuocSaleAdmin = async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    return d;
  };

  const banScan = (d: { id: string }) => ({
    kind: 'SCAN',
    fileName: 'ban-cung.pdf',
    objectKey: `scan/${d.id}-0069.pdf`,
  });

  it('BẢN SCAN: Sale Admin tải lên được, ba vai trò kia đều 403', async () => {
    const d = await toiBuocSaleAdmin();
    for (const who of ['tdv01', 'tbp01', 'kt01']) {
      const r = await post(`/policies/${d.id}/attachments`, banScan(d), who);
      expect(r.status, `${who} không được tải bản scan`).toBe(403);
      expect(r.body.code).toBe('FORBIDDEN_ROLE');
    }
    expect((await post(`/policies/${d.id}/attachments`, banScan(d), 'sa01')).status).toBe(201);
  }, 60_000);

  it('BẢN SCAN: chỉ Sale Admin gỡ được — kế toán gỡ là chặn cả bước bàn giao', async () => {
    const d = await toiBuocSaleAdmin();
    const t = await post(`/policies/${d.id}/attachments`, banScan(d), 'sa01');
    expect(t.status).toBe(201);

    const kt = await del(`/policies/${d.id}/attachments/${t.body.id}`, 'kt01');
    expect(kt.status).toBe(403);
    expect(kt.body.code).toBe('FORBIDDEN_ROLE');
    expect((await del(`/policies/${d.id}/attachments/${t.body.id}`, 'sa01')).status).toBe(200);
  }, 60_000);

  it('GIẤY TỜ HỒ SƠ: chỉ TDV, kể cả khi hồ sơ còn Nháp', async () => {
    const d = await draft();
    const tep = { kind: 'HO_SO', fileName: 'giay-phep.pdf', objectKey: `hs/${d.id}-0069.pdf` };
    for (const who of ['tbp01', 'kt01', 'sa01']) {
      expect((await post(`/policies/${d.id}/attachments`, tep, who)).status, who).toBe(403);
    }
    expect((await post(`/policies/${d.id}/attachments`, tep, 'tdv01')).status).toBe(201);
  }, 60_000);

  it('cờ trên MÀN HÌNH khớp đúng phép chặn — không bày nút chắc chắn 403', async () => {
    /*
     * `loaiTepGhiDuoc` quyết định vùng tải lên có hiện hay không, còn
     * `assertNguoiGhiTep` là thứ chặn thật. Hai bên lệch nhau theo chiều nào
     * cũng tệ: nút hiện rồi trả 403, hoặc nút ẩn mà đường vẫn mở.
     */
    const d = await draft();
    // Đính một giấy tờ NGAY LÚC CÒN NHÁP rồi mới đẩy hồ sơ đi — đó là tình
    // huống thật, và là tình huống làm lộ ra lỗi cờ gỡ ở `0097`.
    const gt = await post(
      `/policies/${d.id}/attachments`,
      { kind: 'HO_SO', fileName: 'gpkd.pdf', objectKey: uniq('gt') },
      'tdv01',
    );
    expect(gt.status).toBe(201);
    const giayTo = gt.body.id as string;

    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    const cua = async (who: string) =>
      (await get(`/policies/${d.id}`, who)).body as { loaiTepGhiDuoc: string[] };

    /*
     * HAI loại ở bước này từ `0167`: bản scan và bản mềm — cả hai của Sale Admin.
     *
     * Đây là lần đầu `loaiTepGhiDuoc` trả về nhiều hơn một phần tử, và đó không
     * phải chi tiết vô hại: giao diện từng đọc `loaiGhiDuoc[0]` để biết đang tải
     * loại gì, nên phần tử thứ hai làm tệp tải ở khối *Bản cứng* được ghi dưới
     * nhãn của khối kia. `TepDinhKem` giờ lấy loại từ CHÍNH KHỐI đang bấm.
     *
     * THỨ TỰ có nghĩa và được khẳng định ở đây: giao diện duyệt `KHOI` theo thứ
     * tự của nó, nhưng phép kiểm `includes` thì không — đảo hai giá trị này là
     * một thay đổi không ai thấy, nên ghim lại cho chắc.
     */
    const sa = await cua('sa01');
    expect(sa.loaiTepGhiDuoc).toEqual(['SCAN', 'BAN_MEM']);

    for (const who of ['tdv01', 'tbp01', 'kt01']) {
      const x = await cua(who);
      expect(x.loaiTepGhiDuoc, `${who} không được thấy vùng tải lên`).toEqual([]);
    }

    /*
     * `0097` — CỜ CHỈ CÓ MỘT, và nó nói theo LOẠI tệp.
     *
     * Trước đó có thêm `tepXoaDuoc: boolean` suy từ chính `loaiTepGhiDuoc`, nên
     * ở đúng bước này Sale Admin nhận `true` cho CẢ HAI loại — giao diện bày dấu
     * ✕ lên cả giấy tờ TDV đính từ lúc lập, và `detach` trả 403. Đó là "nút hiện
     * rồi trả 403" mà chính ca kiểm này sinh ra để chặn, lọt qua vì nó chỉ so
     * đường TẢI LÊN.
     */
    expect((await cua('sa01')) as Record<string, unknown>).not.toHaveProperty('tepXoaDuoc');

    // Và phép chặn THẬT ở đường gỡ: giấy tờ do TDV đính từ lúc lập vẫn nằm đó ở
    // bước này, Sale Admin không có việc gì với chúng.
    const r = await del(`/policies/${d.id}/attachments/${giayTo}`, 'sa01');
    expect(r.status, 'Sale Admin không được gỡ giấy tờ của TDV').toBe(403);
    expect(r.body.code).toBe('FORBIDDEN_ROLE');
  }, 60_000);
});

// =============================================================================
// `0104` — đủ trường mới gửi duyệt được
// =============================================================================

describe('`0104` đủ trường mới gửi duyệt được', () => {
  /**
   * Khách hàng THIẾU một trường, để dựng đúng cái hồ sơ không gửi được.
   *
   * `makeCustomer` khai đủ từ `0104`, nên ca nào muốn thấy chốt chặn phải tự
   * tạo một khách thiếu — chứ không sửa `makeCustomer`, thứ mọi ca khác dựa vào.
   */
  const khachThieu = async (bo: 'idNumber' | 'ownerTitle' | 'phone'): Promise<string> => {
    const than: Record<string, unknown> = {
      code: uniq('KHT'),
      name: 'Nha thuoc thieu truong',
      customerType: 1,
      province: 'Hà Nội',
      streetWard: 'Hà Nội',
      ownerName: 'Chu ho',
      ownerTitle: 'Chu nha thuoc',
      idNumber: mstDuyNhat(), phone: '0900000000' };
    /*
     * MÃ SỐ THUẾ KHÔNG BỎ ĐƯỢC QUA API NỮA (`0175`, chốt 05/09) — ô ấy bắt buộc
     * lúc lập. Nhưng chốt chặn lúc GỬI DUYỆT vẫn phải sống, và nó phục vụ đúng
     * một tập khách hàng: những khách lập TRƯỚC `0175`, cột `id_number` còn
     * `NULL` vì hồi ấy ô này tuỳ chọn.
     *
     * Nên ca kiểm dựng lại đúng tình trạng ấy: lập khách hàng hợp lệ rồi XOÁ
     * cột bằng SQL. Bỏ chốt chặn đi vì "API không tạo ra được nữa" là bỏ lưới
     * duy nhất canh những khách hàng cũ.
     */
    if (bo === 'idNumber') {
      const r = await (await http(customer))
        .post('/customers')
        .set('Authorization', `Bearer ${tok['tdv01']}`)
        .send(than);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      await withAdminDb((c) =>
        c.query(`UPDATE cus.customer SET id_number = NULL WHERE id = $1`, [r.body.id]),
      );
      return r.body.id as string;
    }
    delete than[bo];
    const r = await (await http(customer))
      .post('/customers')
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send(than);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.id as string;
  };

  it('thiếu MÃ SỐ THUẾ thì không gửi duyệt được', async () => {
    const d = await draft({ customerId: await khachThieu('idNumber') });
    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('POLICY_FIELDS_MISSING');
    expect(r.body.thieu).toEqual(['Mã số thuế']);
    // Câu phải nói ĐI ĐÂU MÀ SỬA. Người đọc đang đứng ở màn hình hồ sơ, còn
    // trường thiếu thì nằm ở hồ sơ khách hàng.
    expect(r.body.message).toContain('hồ sơ khách hàng');
    // Và KHÔNG được lộ tên trường trong mã (`0088`).
    expect(r.body.message).not.toContain('idNumber');
    expect(r.body.message).not.toContain('ho_so.');
  }, 60_000);

  it('`0171` thiếu CHỨC DANH hoặc SỐ ĐIỆN THOẠI thì VẪN gửi duyệt được', async () => {
    /*
     * Ca này ĐẢO NGƯỢC hai ca của `0104` và `0128`, và chỗ đảo là một luật chứ
     * không phải một ý thích.
     *
     * Khách hàng chốt 31/08 bỏ *chức danh người đại diện* và *số điện thoại* khỏi
     * cả hai mẫu hồ sơ mặc định. Luật `0134` nói: **trường nào chặn gửi duyệt thì
     * phải in ra ở đâu đó** — nó sinh ra sau khi `0128` thêm số điện thoại vào
     * danh sách chặn mà không mẫu nào in con số ấy, khiến TDV bị bắt điền một ô
     * không xuất hiện trên bất kỳ tờ giấy nào.
     *
     * Giữ phép chặn mà bỏ khỏi tờ giấy là dựng lại đúng cái hỏng ấy. Nên hai vế
     * đi cùng nhau, và `0134` không phải nới một dòng nào.
     *
     * Hai trường VẪN CÒN trong hồ sơ khách hàng và vẫn khai được — chúng chỉ
     * thôi CHẶN.
     */
    for (const bo of ['ownerTitle', 'phone'] as const) {
      const d = await draft({ customerId: await khachThieu(bo) });
      const r = await act(d.id, 'SUBMIT', 'tdv01');
      expect(r.status, `thiếu ${bo} mà vẫn phải gửi được: ${JSON.stringify(r.body)}`).toBe(200);
      expect(r.body.status).toBe('CHO_TBP_DUYET');
    }
  }, 90_000);

  it('`0171` hai trường ấy KHÔNG còn trong danh sách chặn, ở cả hai bảng', () => {
    /*
     * Chiều đối chiếu, và nó canh chỗ hai bảng trôi khỏi nhau: `document` phân
     * loại trường (`NHOM_TRUONG`), `policy` thực thi phép chặn
     * (`TRUONG_CHAN_LUC_GUI`). Bỏ ở một bên mà quên bên kia thì hoặc `0134` đỏ,
     * hoặc phép chặn sống sót ở một chỗ không ai ngờ.
     */
    for (const truong of ['ho_so.chuc_danh_dai_dien', 'ho_so.dien_thoai']) {
      expect(TRUONG_CHAN_LUC_GUI as readonly string[], truong).not.toContain(truong);
      expect(NHOM_TRUONG[truong], `${truong} phải sang nhóm de-trong`).toBe('de-trong');
    }
    /*
     * Và trường CÒN LẠI thì vẫn chặn — không nới quá tay.
     *
     * `0180` — còn ĐÚNG MỘT. `ho_so.ngay_ap_dung` rời danh sách theo một đường
     * KHÁC hẳn hai trường trên: nó không bị bỏ khỏi tờ giấy vì ai đó không muốn
     * in, mà vì **trường ấy không còn tồn tại ở cấp hồ sơ** — ngày áp dụng
     * chuyển xuống từng dòng, nơi cột `NOT NULL` và máy chủ điền mặc định, tức
     * không có trạng thái "thiếu" nào để mà chặn.
     */
    expect([...TRUONG_CHAN_LUC_GUI].sort()).toEqual(['ho_so.ma_so_thue']);
    expect(NHOM_TRUONG['ho_so.ngay_ap_dung'], 'khoá này phải biến mất khỏi bảng').toBeUndefined();
  });

  it('`0128` số điện thoại ĐÓNG BĂNG vào hồ sơ lúc gửi duyệt', async () => {
    /*
     * `0101` đóng băng bảy trường khách hàng và chọn CỘT RỜI thay vì `jsonb`,
     * với lý do: thêm một trường về sau thì BUỘC phải viết migration, tức buộc
     * phải trả lời "đóng băng hay đọc sống?". `0128` là lần đầu câu hỏi ấy được
     * hỏi, và câu trả lời là ĐÓNG BĂNG — đọc sống thì khách đổi số sau khi hồ sơ
     * đã duyệt là tờ CSBH đã ký lặng lẽ mang một con số khác.
     */
    const customerId = await makeCustomer();
    const d = await draft({ customerId });
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const sdtMoi = '0999 111 222';
    const sua = await (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ phone: sdtMoi });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);
    // `0223` — máy chủ lưu bản CHUẨN: mười chữ số liền, bỏ dấu cách.
    expect(sua.body.phone).toBe('0999111222');

    // Hồ sơ giữ số CŨ.
    const snap = await withAdminDb(async (c) =>
      c.query<{ kh_dien_thoai_snap: string | null }>(
        `SELECT kh_dien_thoai_snap FROM pol.policy WHERE id = $1`,
        [d.id],
      ),
    );
    expect(snap.rows[0]!.kh_dien_thoai_snap).toBe('0900000000');
    expect(snap.rows[0]!.kh_dien_thoai_snap).not.toBe('0999111222');
  }, 60_000);

  /*
   * `0177` — HAI Ô ĐỊA CHỈ ĐĂNG KÝ và ĐỊA CHỈ GIAO HÀNG trên khối khách hàng.
   *
   * Cùng câu hỏi mà `0101` dựng cột rời để bắt phải hỏi, và `0128` hỏi lần đầu:
   * *"đóng băng hay đọc sống?"*. Câu trả lời lần này cũng là ĐÓNG BĂNG, nhưng lý
   * do hẹp hơn: `kh_dia_chi_dang_ky_snap` ĐÃ đóng băng địa chỉ ấy từ `0101`, nên
   * bày hai ô đọc sống cạnh nó là dựng ra một khối nói hai địa chỉ khác nhau cho
   * cùng một hồ sơ — chính thứ `0101` sinh ra để chống.
   */
  const khachCoDiaChi = async (over: Record<string, unknown> = {}): Promise<string> => {
    const r = await (await http(customer))
      .post('/customers')
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({
        code: uniq('KH'),
        name: 'Ho kinh doanh Minh Anh',
        customerType: 1,
        province: 'Hà Nội',
        streetWard: 'Số 12 ngõ 5, Phường Láng Hạ',
        deliveryAddresses: ['Kho 1, KCN Bắc Thăng Long', 'Số 8 Trần Duy Hưng'],
        ownerName: 'Nguyen Thi Dai Dien',
        ownerTitle: 'Chu ho',
        idNumber: mstDuyNhat(),
        phone: '0900000000',
        ...over,
      });
    if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
    return r.body.id as string;
  };

  it('`0177` hồ sơ NHÁP đọc SỐNG hai ô địa chỉ và danh sách giao hàng', async () => {
    /*
     * Vế đầu của cặp: chưa gửi duyệt thì chưa có ảnh chụp nào, và khối phải theo
     * kịp khách hàng hôm nay — cùng lẽ với giá và ngưỡng ở `0029`.
     *
     * Ca này cũng là chốt duy nhất canh bẫy `0128` cho hai cột mới: `province` và
     * `street_ward` phải có mặt trong câu `SELECT` liệt kê từng cột của
     * `customer/internal.controller`. Thiếu chúng thì `policy` nhận `undefined`,
     * TypeScript im vì hai trường khai tuỳ chọn, và hai ô ra rỗng.
     */
    const customerId = await khachCoDiaChi();
    const d = await draft({ customerId });

    const r = await get(`/policies/${d.id}`, 'tdv01');
    expect(r.status).toBe(200);
    expect(r.body.khachHang.soNha).toBe('Số 12 ngõ 5, Phường Láng Hạ');
    expect(r.body.khachHang.tinhThanh).toBe('Hà Nội');
    expect(r.body.khachHang.nguoiDaiDien).toBe('Nguyen Thi Dai Dien');
    expect(r.body.khachHang.noiNhanHang).toEqual([
      'Kho 1, KCN Bắc Thăng Long',
      'Số 8 Trần Duy Hưng',
    ]);

    // Đổi khách hàng thì hồ sơ Nháp ĐỔI THEO.
    const sua = await (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ province: 'Bắc Ninh' });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);

    const r2 = await get(`/policies/${d.id}`, 'tdv01');
    expect(r2.body.khachHang.tinhThanh).toBe('Bắc Ninh');
  }, 60_000);

  it('`0177` GỬI DUYỆT đóng băng hai ô địa chỉ và danh sách giao hàng', async () => {
    const customerId = await khachCoDiaChi();
    const d = await draft({ customerId });
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const sua = await (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({
        province: 'Bắc Ninh',
        streetWard: 'Số 99 Đường Mới',
        deliveryAddresses: ['Kho 2, Quế Võ'],
      });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);

    // Hồ sơ giữ ĐỊA CHỈ CŨ, cả hai ô lẫn danh sách giao hàng.
    const r = await get(`/policies/${d.id}`, 'tdv01');
    expect(r.body.khachHang.soNha).toBe('Số 12 ngõ 5, Phường Láng Hạ');
    expect(r.body.khachHang.tinhThanh).toBe('Hà Nội');
    expect(r.body.khachHang.noiNhanHang).toEqual([
      'Kho 1, KCN Bắc Thăng Long',
      'Số 8 Trần Duy Hưng',
    ]);

    /*
     * Và đọc thẳng CSDL: hai ô phải nằm trong CỘT RIÊNG, không phải suy ra từ
     * `kh_dia_chi_dang_ky_snap` lúc đọc. Cột gộp là DẪN XUẤT (`0175`) — tách
     * ngược nó chạy được hôm nay và hỏng ngầm ngày trigger đổi dấu ngăn.
     */
    const snap = await withAdminDb(async (c) =>
      c.query<{ kh_so_nha_snap: string | null; kh_tinh_thanh_snap: string | null }>(
        `SELECT kh_so_nha_snap, kh_tinh_thanh_snap FROM pol.policy WHERE id = $1`,
        [d.id],
      ),
    );
    expect(snap.rows[0]!.kh_so_nha_snap).toBe('Số 12 ngõ 5, Phường Láng Hạ');
    expect(snap.rows[0]!.kh_tinh_thanh_snap).toBe('Hà Nội');
  }, 60_000);

  it('`0177` hồ sơ gửi TRƯỚC migration: hai ô rỗng, KHÔNG rơi về đọc sống', async () => {
    /*
     * Dựng thẳng trên CSDL vì không đường API nào tạo ra được tình huống này: nó
     * là hồ sơ đã gửi duyệt trước khi `0115` thêm hai cột.
     *
     * Điều ca này canh là một cám dỗ, không phải một lỗi hiển nhiên: chỗ đọc rất
     * dễ viết `khSoNhaSnap ?? khach?.streetWard`, và nó sẽ trông đúng trên mọi
     * khách hàng chưa đổi địa chỉ. Với khách ĐÃ đổi thì hồ sơ đã ký lặng lẽ hiện
     * địa chỉ hôm nay cạnh một cột gộp mang địa chỉ cũ.
     */
    const customerId = await khachCoDiaChi();
    const d = await draft({ customerId });
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await withAdminDb((c) =>
      c.query(`UPDATE pol.policy SET kh_so_nha_snap = NULL, kh_tinh_thanh_snap = NULL WHERE id = $1`, [
        d.id,
      ]),
    );
    // Khách hàng đổi địa chỉ SAU đó — nếu chỗ đọc rơi về đọc sống thì lộ ra ở đây.
    const sua = await (await http(customer))
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ province: 'Bắc Ninh', streetWard: 'Số 99 Đường Mới' });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);

    const r = await get(`/policies/${d.id}`, 'tdv01');
    expect(r.body.khachHang.soNha).toBeNull();
    expect(r.body.khachHang.tinhThanh).toBeNull();
    // Cột gộp đã đóng băng vẫn còn, và nó là thứ màn hình bày thay.
    expect(r.body.khachHang.diaChiDangKy).toBe('Số 12 ngõ 5, Phường Láng Hạ, Hà Nội');
  }, 60_000);

  it('`0177` khách KHÔNG có địa chỉ giao hàng thì danh sách RỖNG, không phải một dòng trắng', async () => {
    /*
     * Mảng rỗng có nghĩa riêng — *"giao tới địa chỉ đăng ký"* (`0006`) — nên một
     * phần tử chuỗi rỗng lọt vào đây sẽ thành một dòng trắng trên màn hình, đọc
     * ra như một địa chỉ chưa điền xong.
     */
    const customerId = await khachCoDiaChi({ deliveryAddresses: [] });
    const d = await draft({ customerId });
    const r = await get(`/policies/${d.id}`, 'tdv01');
    expect(r.body.khachHang.noiNhanHang).toEqual([]);
  }, 60_000);

  it('`0180` ngày áp dụng KHÔNG còn chặn được lượt gửi — nó là cột NOT NULL của DÒNG', async () => {
    /*
     * Ca cũ xoá trắng `pol.policy.applied_date` bằng SQL thô rồi đòi 422. Cột ấy
     * không còn tồn tại, và ca này thay nó bằng câu hỏi ĐÚNG cho hình dạng mới:
     * **có dựng được một hồ sơ thiếu ngày áp dụng không?**
     *
     * Câu trả lời là KHÔNG, và đó là lý do phép chặn biến mất chứ không phải bị
     * nới. Ba lớp cùng chặn, và ca kiểm đi qua lớp cuối cùng — lớp mà một lượt
     * sửa vội không nhìn thấy: ràng buộc `NOT NULL` ở CSDL.
     */
    const d = await draft();
    const hong = await withAdminDb(async (c) => {
      try {
        await c.query(`UPDATE pol.policy_line SET ngay_ap_dung = NULL WHERE policy_id = $1`, [d.id]);
        return null;
      } catch (e) {
        return (e as { code?: string }).code ?? 'khong-ro';
      }
    });
    expect(hong, 'phải là 23502 not_null_violation').toBe('23502');

    // Và hồ sơ vẫn gửi duyệt được bình thường.
    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }, 60_000);

  it('thiếu MÃ SỐ THUẾ thì không gửi duyệt được, và câu chỉ đúng chỗ phải sửa', async () => {
    // `0180` — chỉ còn MỘT trường chặn, nên ca "kể hết nhiều trường" không còn
    // dựng được. Cái đáng giữ là vế thứ hai: câu báo lỗi phải nói người ta đi
    // đâu mà sửa (`0088` cấm lộ tên trường trong mã).
    const d = await draft({ customerId: await khachThieu('idNumber') });

    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status).toBe(422);
    expect(r.body.thieu).toEqual(['Mã số thuế']);
    expect(r.body.message).toContain('hồ sơ khách hàng');
  }, 60_000);

  it('BỔ SUNG rồi gửi lại thì đi tiếp — chốt chặn không phải ngõ cụt', async () => {
    const khId = await khachThieu('idNumber');
    const d = await draft({ customerId: khId });
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(422);

    await (await http(customer))
      .patch(`/customers/${khId}`)
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({ idNumber: '5100999998' });

    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  }, 90_000);

  it('BẢY trường điền sau KHÔNG chặn — hồ sơ chưa ai duyệt vẫn gửi được', async () => {
    /*
     * Vế quan trọng nhất của `0104`, và là vế dễ mất nhất.
     *
     * Đọc yêu cầu theo nghĩa đen — *"đủ tất cả các trường trong bảng hướng dẫn
     * ánh xạ"* — thì KHÔNG hồ sơ nào gửi duyệt được, vì bảy trường ấy do chính
     * các bước SAU sinh ra. Ca này canh cho lằn ranh đó: một hồ sơ Nháp chưa có
     * ngày TBP ký, chưa có kế toán, chưa có Sale Admin, chưa có ngày hiệu lực
     * vẫn phải gửi được.
     */
    const d = await draft();
    const truoc = await withAdminDb((c) =>
      c.query(
        `SELECT tbp_signed_at, ke_toan_user_id, sale_admin_user_id,
                kt_l1_received_at, kt_l2_received_at, effective_from
           FROM pol.policy WHERE id = $1`,
        [d.id],
      ),
    );
    const row = truoc.rows[0] as Record<string, unknown>;
    // Chứng minh chúng THẬT SỰ rỗng — nếu không, ca này không kiểm gì cả.
    for (const k of ['tbp_signed_at', 'sale_admin_user_id', 'kt_l1_received_at', 'kt_l2_received_at', 'effective_from']) {
      expect(row[k], `${k} phải rỗng ở hồ sơ Nháp`).toBeNull();
    }

    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  }, 60_000);
});

/**
 * `0189` — LÝ DO TRẢ VỀ nói đủ AI và TỪ BƯỚC NÀO.
 *
 * Khách hàng chốt 08/09: *"phần lý do CSBH bị trả về yêu cầu cần rõ ràng hơn,
 * như ai đã trả về và trả về từ bước nào"*.
 *
 * Tới `0188` hồ sơ chỉ mang `lastReason` — một chuỗi trần. Hồ sơ đi qua mười
 * bước và có BỐN hành động kèm lý do (TBP trả lại · TBP hoàn duyệt · Kế toán
 * không tiếp nhận L1 · và L2), nên cùng một câu *"thiếu chứng từ"* đến từ hai
 * bàn khác nhau là hai việc phải làm khác nhau — mà người đọc không phân biệt
 * được nếu không tự mở Nhật ký ra dò.
 */
describe('`0189` lý do trả về kèm người và bước', () => {
  it('TBP trả lại: đủ bốn vế — lý do, hành động, vai trò/người, bước xuất phát', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    const r = await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chu ky chu ho' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const ly = (await get(`/policies/${d.id}`)).body.lyDoTraLai;
    expect(ly, 'không dựng ra khối lý do nào').toBeTruthy();
    expect(ly.lyDo).toBe('Thieu chu ky chu ho');
    // HÀNH ĐỘNG mang cả vai trò: nhãn của nó là *"Trưởng bộ phận trả lại để
    // chỉnh sửa"*, và từ `0185` mỗi hành động thuộc đúng một vai trò.
    expect(ly.hanhDong).toBe('TBP_RETURN');
    expect(ly.ten, 'tên người trả lại phải tra được từ identity').toBeTruthy();
    // BƯỚC XUẤT PHÁT, không phải bước hiện tại: hồ sơ giờ ở YEU_CAU_CHINH_SUA,
    // còn câu hỏi của người đọc là "nó bị trả về TỪ đâu".
    expect(ly.tuTrangThai).toBe('CHO_TBP_DUYET');
    expect(ly.luc).toBeTruthy();
  });

  it('phân biệt được HAI bàn cùng một câu lý do', async () => {
    /*
     * Đây là lý do cả chặng tồn tại. Cùng chuỗi *"Thieu chung tu"*, một lần từ
     * bàn Trưởng bộ phận và một lần từ bàn Kế toán — `lastReason` cho hai hồ sơ
     * ấy giống hệt nhau, không gì phân biệt được.
     */
    const a = await draft();
    expect((await act(a.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(a.id, 'TBP_RETURN', 'tbp01', { reason: 'Thieu chung tu' })).status).toBe(200);

    const b = await draft();
    expect((await act(b.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(b.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(b.id, 'KT_RETURN_L1', 'kt01', { reason: 'Thieu chung tu' })).status).toBe(200);

    const lyA = (await get(`/policies/${a.id}`)).body;
    const lyB = (await get(`/policies/${b.id}`)).body;
    expect(lyA.lastReason, 'tiền đề của ca này: hai chuỗi giống hệt nhau').toBe(lyB.lastReason);
    expect(lyA.lyDoTraLai.hanhDong).toBe('TBP_RETURN');
    expect(lyB.lyDoTraLai.hanhDong).toBe('KT_RETURN_L1');
    expect(lyA.lyDoTraLai.tuTrangThai).not.toBe(lyB.lyDoTraLai.tuTrangThai);
  });

  it('`0221` GỬI LẠI sau khi sửa thì KHÔNG còn khối lý do — việc đã làm xong', async () => {
    /*
     * ĐẢO ca `0189` (*"gửi lại vẫn giữ lý do CŨ"*). Khách hàng chốt 25/09: khối
     * lý do chỉ hiện khi nó còn là VIỆC của ai đó — ở `YEU_CAU_CHINH_SUA`, hoặc
     * ở bàn Sale Admin sau *Yêu cầu in lại*. `lastReason` vẫn còn chữ (nó sống
     * qua mọi bước sau), và đó chính là lý do giao diện thôi rơi về nó.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Sai gia ban buon' })).status).toBe(200);
    const truoc = (await get(`/policies/${d.id}`)).body;
    expect(truoc.lyDoTraLai?.lyDo, 'đang Yêu cầu chỉnh sửa thì PHẢI có').toBe('Sai gia ban buon');

    expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(200);
    const b = (await get(`/policies/${d.id}`)).body;
    expect(b.status).toBe('CHO_TBP_DUYET');
    expect(b.lastReason, 'tiền đề: chuỗi lý do vẫn nằm trên hồ sơ').toBe('Sai gia ban buon');
    expect(b.lyDoTraLai).toBeNull();
  });

  it('`0221` Kế toán YÊU CẦU IN LẠI: bàn Sale Admin thấy lý do, bàn giao xong thì hết', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    for (const [kind, ten] of [['SCAN', 'ban-cung.pdf'], ['BAN_MEM', 'ban-mem.pdf']] as const) {
      await post(
        `/policies/${d.id}/attachments`,
        { kind, fileName: ten, objectKey: `${kind}/${d.id}.pdf` },
        'sa01',
      );
    }
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    expect((await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Ban cung mo' })).status).toBe(200);

    const o = (await get(`/policies/${d.id}`)).body;
    expect(o.status).toBe('SA_SUA_BAN_CUNG'); // `0225`
    expect(o.lyDoTraLai, 'Sale Admin phải thấy vì sao phải tải lại bản cứng').toBeTruthy();
    expect(o.lyDoTraLai.hanhDong).toBe('KT_REQUEST_REPRINT');
    expect(o.lyDoTraLai.lyDo).toBe('Ban cung mo');
    expect(o.lyDoTraLai.tuTrangThai).toBe('CHO_KT_L2');

    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    expect((await get(`/policies/${d.id}`)).body.lyDoTraLai).toBeNull();
  });

  it('`0221` ở bàn Sale Admin LƯỢT ĐẦU thì lý do trả về cũ KHÔNG hiện', async () => {
    /*
     * `SA_DANG_XU_LY` là bước bình thường ngay sau tiếp nhận L1, và lúc ấy lý do
     * gần nhất là một lượt trả về đã sửa xong. Tới `0224` luật phải hỏi cả HÀNH
     * ĐỘNG để tách ca này khỏi ca in lại; từ `0225` ca in lại là trạng thái
     * riêng và luật chỉ còn hỏi trạng thái — ca này giữ nguyên, canh vế ấy.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Sai gia' })).status).toBe(200);
    expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);

    const b = (await get(`/policies/${d.id}`)).body;
    expect(b.status).toBe('SA_DANG_XU_LY');
    expect(b.lastReason).toBe('Sai gia');
    expect(b.lyDoTraLai).toBeNull();
  });

  it('hồ sơ CHƯA từng bị trả về thì không có khối lý do', async () => {
    const d = await draft();
    const b = (await get(`/policies/${d.id}`)).body;
    expect(b.lastReason).toBeNull();
    expect(b.lyDoTraLai).toBeNull();
  });
});

/**
 * `0190` — SỰ KIỆN MANG `versionNo`, để lá thư nói ra loại thay đổi.
 *
 * Ca này có mặt vì một lượt PHÁ LẠI XANH: gỡ `versionNo` khỏi `ctx` bên
 * `workflow` mà cả khối `0190` của `thong-bao.test.ts` vẫn xanh — những ca ấy
 * dựng thân sự kiện BẰNG TAY (`suKien({ versionNo: 3 })`), nên chúng canh phần
 * `notification` đọc và in, không canh phần `policy` GỬI.
 *
 * Hai nửa của cùng một đường, và mỗi nửa cần người canh riêng: thiếu ca này thì
 * `policy` thôi gửi là mọi lá thư lặng lẽ mất một dòng, không gì đỏ.
 */
describe('`0190` sự kiện luồng duyệt mang số phiên bản', () => {
  const versionCuaSuKien = async (policyId: string) => {
    const ds = await outboxFor(policyId);
    const gui = ds.filter((e) => e.payload['action'] === 'SUBMIT');
    expect(gui.length, 'không có sự kiện SUBMIT nào').toBeGreaterThan(0);
    return gui.at(-1)!.payload['versionNo'];
  };

  it('CSBH đầu tiên của khách hàng → `versionNo` bằng 1', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect(await versionCuaSuKien(d.id)).toBe(1);
  });

  it('phiên bản thay thế → `versionNo` lớn hơn 1', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(v2.status).toBe(201);
    expect((await act(v2.body.id as string, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect(await versionCuaSuKien(v2.body.id as string)).toBe(2);
  });

  it('MỌI sự kiện của luồng đều mang nó, không riêng lượt gửi duyệt', async () => {
    /*
     * `versionNo` đặt ở `ctx`, tức đi kèm mọi sự kiện của mọi bước — đúng lối
     * `0031` đã chọn cho bốn khoá người, và vì cùng một lý do: thiếu ở MỘT sự
     * kiện là một lá thư lặng lẽ thiếu một dòng, ở đúng bước nào không ai đoán
     * trước được.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Thieu chung tu' })).status).toBe(200);

    const thieu = (await outboxFor(d.id))
      .filter((e) => typeof e.payload['action'] === 'string' && e.payload['recipients'])
      .filter((e) => e.payload['versionNo'] === undefined)
      .map((e) => e.payload['action']);
    expect(thieu, `sự kiện thiếu versionNo: ${thieu.join(', ')}`).toEqual([]);
  });
});

/**
 * `0191` — LẬP PHIÊN BẢN MỚI từ trang hồ sơ, và cảnh báo bản dở dang.
 *
 * Lối tắt này KHÔNG có đường máy chủ riêng: nó gọi đúng `POST /policies` với
 * `mode: 'NEW_VERSION'` mà trang *Lập hồ sơ* vẫn gọi. Nên phần máy chủ của chặng
 * chỉ có một thứ mới — `phienBanSau`, dữ liệu để hộp xác nhận hỏi đúng câu.
 */
describe('`0191` phiên bản kế nhiệm đang dở dang', () => {
  const doc = async (policyId: string, who = 'tdv01') =>
    (await get(`/policies/${policyId}`, who)).body;

  it('CSBH đang hiệu lực, chưa ai lập bản mới → `null`', async () => {
    const d = await draft();
    await runToActive(d);
    expect((await doc(d.id)).phienBanSau).toBeNull();
  });

  it('đã có bản mới đang SOẠN → trả về mã và trạng thái của nó', async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(v2.status).toBe(201);

    const sau = (await doc(d.id)).phienBanSau;
    expect(sau, 'bản đang soạn không hiện ra ở hồ sơ đang hiệu lực').toBeTruthy();
    expect(sau.id).toBe(v2.body.id);
    expect(sau.status).toBe('NHAP');
    expect(sau.code).toBe(v2.body.code);
  });

  it('bản mới đang ĐI TRONG LUỒNG cũng tính', async () => {
    // `CHUA_DUYET_XONG` gồm cả bốn bàn duyệt, không riêng Nháp: một bản đang chờ
    // Trưởng bộ phận ký vẫn là một bản dở dang với người sắp lập bản thứ hai.
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect((await act(v2.body.id as string, 'SUBMIT', 'tdv01')).status).toBe(200);

    expect((await doc(d.id)).phienBanSau.status).toBe('CHO_TBP_DUYET');
  });

  it('hồ sơ KHÔNG ở trạng thái đang hiệu lực thì luôn `null`', async () => {
    // Nút chỉ hiện ở `DANG_CO_HIEU_LUC`, nên câu hỏi này chỉ có nghĩa ở đó — và
    // một câu `SELECT` cho mọi lượt mở mọi hồ sơ là cái giá không mua gì.
    const d = await draft();
    expect((await doc(d.id)).phienBanSau).toBeNull();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await doc(d.id)).phienBanSau).toBeNull();
  });

  it('bản mới đã DUYỆT XONG thì thôi tính là dở dang', async () => {
    /*
     * Lúc bản mới có hiệu lực thì bản cũ sang `HET_HIEU_LUC` — và nó thôi bày
     * nút, nên `phienBanSau` của nó về `null` theo. Ca này canh đúng vế ấy: điều
     * kiện là `CHUA_DUYET_XONG`, không phải "có bản kế nhiệm nào không".
     */
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    await runToActive({ id: v2.body.id as string });

    expect((await doc(d.id)).status).toBe('HET_HIEU_LUC');
    expect((await doc(d.id)).phienBanSau).toBeNull();
  });
});

/**
 * `0194` — YÊU CẦU CẬP NHẬT trên hồ sơ CÒN SỬA ĐƯỢC, và nút *Tự động cập nhật*.
 *
 * Khách hàng chốt 10/09, ba câu: khối chênh lệch phải hiện cả khi TDV mở hồ sơ ra
 * SỬA; có một thao tác áp chênh lệch ấy vào bảng sản phẩm; áp xong thì khối biến
 * mất. Câu thứ ba đòi *"test case cho tất cả các trường hợp"* — nhánh thuần nằm ở
 * `tests/http/lech-danh-muc.test.ts`, tệp này đi HẾT ĐƯỜNG.
 *
 * NỀN CỦA CẢ KHỐI: tới `0193` đường đọc gọi `lamMoiDong`, tức mở hồ sơ ra là giá
 * và ngưỡng bị chụp lại TRONG IM LẶNG — nên khối chênh lệch không thể tồn tại
 * trên hồ sơ sửa được, và một nút *Tự động cập nhật* sẽ không làm gì nhìn thấy
 * được. `0194` gỡ phép ghi đè ấy khỏi đường đọc; lượt GỬI DUYỆT vẫn làm mới như
 * cũ, nên bản nháp không bao giờ vào luồng với số cũ.
 */
describe('`0194` chênh lệch hiện trên hồ sơ còn sửa được', () => {
  /** Đổi giá bán Công ty hôm nay — `0123`: không khai ngày thì áp dụng ngay. */
  const doiGia = async (productId: string, tien: string) => {
    const r = await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };

  const doc = async (id: string, who = 'tdv01') => (await get(`/policies/${id}`, who)).body;

  it('hồ sơ NHÁP lệch giá → `byId` trả về chênh lệch', async () => {
    const d = await draft();
    await doiGia(d.productId, '120000');

    const hs = await doc(d.id);
    expect(hs.lech).toHaveLength(1);
    expect(hs.lech[0]).toMatchObject({ kind: 'PRICE', snapValue: '100000', newValue: '120000' });
  });

  it('ĐƯỜNG ĐỌC KHÔNG GHI ĐÈ — mở hai lần, số trên dòng vẫn là số cũ', async () => {
    /*
     * CA QUAN TRỌNG NHẤT của chặng, và là thứ `0193` làm ngược lại.
     *
     * Nếu đường đọc còn gọi `lamMoiDong` thì lượt đọc THỨ NHẤT đã ghi đè, `lech`
     * rỗng ngay từ đầu, và cái nút ở yêu cầu thứ hai thành một nút không làm gì.
     */
    const d = await draft();
    await doiGia(d.productId, '120000');

    for (const lan of [1, 2]) {
      const hs = await doc(d.id);
      expect(hs.lines[0].companyPrice, `lượt đọc ${lan}`).toBe('100000');
      expect(hs.lech, `lượt đọc ${lan}`).toHaveLength(1);
    }
  });

  it('hồ sơ bị TRẢ LẠI cũng thấy chênh lệch — đúng lúc TDV mở ra sửa', async () => {
    // Đường vào thật của yêu cầu: hồ sơ đi vào luồng, danh mục đổi, TBP trả lại,
    // TDV mở ra sửa. Tới `0193` khối biến mất đúng ở bước cuối ấy.
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await doiGia(d.productId, '120000');
    expect(
      (await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Sua lai gia' })).status,
    ).toBe(200);

    const hs = await doc(d.id);
    expect(hs.status).toBe('YEU_CAU_CHINH_SUA');
    expect(hs.lech).toHaveLength(1);
  });

  it('không lệch gì thì KHÔNG có khối nào', async () => {
    const d = await draft();
    expect((await doc(d.id)).lech).toEqual([]);
  });

  it('dòng ĐÃ RÚT không sinh chênh lệch — nó sắp biến mất khỏi hồ sơ', async () => {
    /*
     * `0186`: dòng đã rút không làm mới và không chặn gửi duyệt. Nó cũng không
     * được BÀY RA như một việc phải làm — bảo người dùng cập nhật một mặt hàng
     * họ vừa quyết định bỏ đi là một câu hỏi không có câu trả lời đúng.
     */
    const d = await draft();
    const hs0 = await doc(d.id);
    const lineId = hs0.lines[0].id as string;
    // `0186` — XOÁ MỀM: dòng nằm lại với cờ `da_xoa`, nên đường này trả 200 kèm
    // hồ sơ chứ không phải 204.
    expect((await del(`/policies/${d.id}/lines/${lineId}`)).status).toBe(200);
    await doiGia(d.productId, '120000');

    expect((await doc(d.id)).lech).toEqual([]);
  });
});

describe('`0194` nút Tự động cập nhật', () => {
  const doiGia = async (productId: string, tien: string) => {
    await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
  };
  const apDung = (id: string, who = 'tdv01') =>
    post(`/policies/${id}/ap-dung-thay-doi`, {}, who);
  const doc = async (id: string, who = 'tdv01') => (await get(`/policies/${id}`, who)).body;

  it('áp xong thì số ĐỔI và khối chênh lệch BIẾN MẤT', async () => {
    const d = await draft();
    await doiGia(d.productId, '120000');
    expect((await doc(d.id)).lech).toHaveLength(1);

    const r = await apDung(d.id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.hong).toEqual([]);

    const hs = await doc(d.id);
    expect(hs.lines[0].companyPrice).toBe('120000');
    expect(hs.lech).toEqual([]);
  });

  it('KHÔNG đụng giá bán buôn và CPBH — đó là số NGƯỜI DÙNG nhập', async () => {
    // Vế này là ranh giới của cả tính năng: nút chỉ lấy lại thứ đến từ DANH MỤC.
    // Ghi đè con số TDV vừa gõ thì "tự động cập nhật" thành "tự động xoá việc".
    const d = await draft();
    const truoc = await doc(d.id);
    await doiGia(d.productId, '120000');
    await apDung(d.id);

    const sau = await doc(d.id);
    expect(sau.lines[0].wholesalePrice).toBe(truoc.lines[0].wholesalePrice);
    expect(sau.lines[0].cpbh).toEqual(truoc.lines[0].cpbh);
    // Tỷ lệ CK thì PHẢI đổi: nó tính từ giá bán Công ty vừa đổi.
    expect(sau.lines[0].discountRate).not.toBe(truoc.lines[0].discountRate);
  });

  it('bấm lần hai không đổi gì thêm', async () => {
    const d = await draft();
    await doiGia(d.productId, '120000');
    await apDung(d.id);
    const sau1 = await doc(d.id);

    const r = await apDung(d.id);
    expect(r.status).toBe(200);
    expect(r.body.conLai).toBe(0);
    expect((await doc(d.id)).lines[0]).toEqual(sau1.lines[0]);
  });

  it('không có gì để áp cũng trả 200, không phải lỗi', async () => {
    // Bấm một nút không còn việc gì để làm là chuyện thường (hai tab, bấm hai
    // lần). Trả lỗi ở đó là doạ người dùng vì một thao tác vô hại.
    const d = await draft();
    const r = await apDung(d.id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ hong: [], conLai: 0 });
  });

  it('`0200` SẢN PHẨM VÔ HIỆU HOÁ: RÚT khỏi hồ sơ, không còn nằm trong `hong`', async () => {
    /*
     * CA NÀY PHẢI THAY. Bản `0194` khẳng định điều ngược lại — *"báo `hong`,
     * dòng giữ số cũ, khối lệch Ở LẠI"* — và nó đúng cho tới khi khách hàng chốt
     * 11/09 rằng mặt hàng đã vô hiệu hoá thì nút phải rút hẳn nó ra.
     *
     * Lập luận cũ (*"áp được dòng nào thì áp, dòng còn lại nằm lại với đúng lý do
     * của nó"*) KHÔNG sai và vẫn còn nguyên việc: nó giờ nói về ba nguyên nhân
     * `hong` còn lại — mặt hàng biến mất khỏi danh mục, chưa khai giá tại ngày áp
     * dụng, và dòng tính ra số vô lý. Cái đổi là mặt hàng vô hiệu hoá rời khỏi
     * nhóm ấy, vì việc phải làm với nó chỉ có MỘT.
     */
    const d = await draft();
    const truoc = await doc(d.id);
    const r = await (await http(catalog))
      .patch(`/catalog/products/${d.productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      // `0123` — mọi lượt sửa sản phẩm đòi GÕ LẠI MÃ, kể cả lượt chỉ đổi trạng
      // thái: màn hình này đổi được cả giá, nên tiền đề "sửa nhẹ" của `0036` mất.
      .send({
        status: 'DA_VO_HIEU_HOA',
        confirm: truoc.lines[0].productCode,
      });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const ap = await apDung(d.id);
    expect(ap.status).toBe(200);
    expect(ap.body.daRut).toEqual([truoc.lines[0].productCode]);
    expect(ap.body.hong, 'vô hiệu hoá thôi là lý do `hong`').toEqual([]);

    const sau = await doc(d.id);
    expect(sau.lines, 'dòng của chính phiên bản này thì xoá hẳn').toHaveLength(0);
    expect(sau.lech, 'rút xong thì không còn gì để cảnh báo').toEqual([]);
  });
});

describe('`0194` ai bấm được nút Tự động cập nhật', () => {
  const apDung = (id: string, who: string) => post(`/policies/${id}/ap-dung-thay-doi`, {}, who);

  it('bốn vai trò còn lại đều 403 — đây là đường GHI vào dòng hồ sơ', async () => {
    const d = await draft();
    for (const u of ['tbp01', 'kt01', 'sa01', 'bld01']) {
      expect((await apDung(d.id, u)).status, u).toBe(403);
    }
  });

  it('TDV KHÁC cũng 403, dù cùng vai trò', async () => {
    const d = await draft();
    const r = await apDung(d.id, 'tdv02');
    expect(r.status).toBe(403);
  });

  it('hồ sơ ĐANG TRONG LUỒNG thì 409 — luật đóng băng thắng', async () => {
    /*
     * Chốt nặng nhất của chặng. Một hồ sơ đang chờ chữ ký mà bấm được nút này
     * thì người duyệt đọc một con số rồi ký vào một con số khác.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    const r = await apDung(d.id, 'tdv01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_LOCKED');
  });

  it('hồ sơ ĐANG CÓ HIỆU LỰC cũng 409', async () => {
    const d = await draft();
    await runToActive(d);
    const r = await apDung(d.id, 'tdv01');
    expect(r.status).toBe(409);
  });

  it('hồ sơ không có thật thì 404', async () => {
    expect((await apDung(crypto.randomUUID(), 'tdv01')).status).toBe(404);
  });
});

/**
 * `0194` — DẤU VẾT ĐƯỢC DỌN khi dòng được làm mới. Lỗi CÓ SẴN, đo được.
 *
 * `pol.policy_impact` chỉ được dọn bởi consumer, và chỉ cho những `product_id` nó
 * vừa quét lại ở lượt ấy (`0036`). Không có gì dọn nó khi chính DÒNG được làm
 * mới — nên hồ sơ đi hết chuỗi *lệch → trả về → làm mới → gửi lại* sẽ quay lại
 * luồng duyệt kèm một khối cảnh báo nói về chênh lệch ĐÃ ĐƯỢC SỬA XONG.
 *
 * Nó nằm đó tới lần đổi danh mục kế tiếp chạm đúng sản phẩm ấy. Không mã lỗi nào,
 * không màn hình nào báo — chỉ là một khối cảnh báo nói dối, ở đúng chỗ người ta
 * đọc trước khi đặt bút ký.
 *
 * Lỗi có từ `0029`; `0194` chỉ làm nó dễ thấy hơn (nút *Tự động cập nhật* là một
 * đường thứ hai dẫn tới cùng chuỗi ấy) và sửa nó ở `lamMoiDong`.
 */
describe('`0194` dấu vết lệch được dọn sau khi làm mới', () => {
  const raSoat = async (productId?: string) =>
    app.get(CatalogImpactConsumer).handle(productId === undefined ? {} : { productId });

  const demDauVet = (policyId: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pol.policy_impact WHERE policy_id = $1`,
        [policyId],
      );
      return Number(r.rows[0]!.n);
    });

  const doiGia = async (productId: string, tien: string) => {
    await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
  };

  it('lệch → trả về → áp dụng → gửi lại: khối cảnh báo KHÔNG mọc lại', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    // Danh mục đổi trong lúc hồ sơ đang chờ TBP → consumer ghi dấu vết.
    await doiGia(d.productId, '120000');
    await raSoat(d.productId);
    expect(await demDauVet(d.id), 'consumer phải ghi dấu vết').toBeGreaterThan(0);
    expect((await get(`/policies/${d.id}`)).body.lech.length).toBeGreaterThan(0);

    // TBP trả lại → hồ sơ sửa được, TDV bấm *Tự động cập nhật*.
    expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Gia da doi' })).status).toBe(200);
    expect((await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01')).status).toBe(200);
    expect(await demDauVet(d.id), 'dấu vết phải được dọn ngay lúc áp dụng').toBe(0);

    // Gửi lại → hồ sơ đóng băng trở lại, và `byId` đọc `policy_impact`.
    expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(200);
    const hs = (await get(`/policies/${d.id}`)).body;
    expect(hs.status).toBe('CHO_TBP_DUYET');
    expect(hs.lines[0].companyPrice).toBe('120000');
    expect(hs.lech, 'khối cảnh báo nói về chênh lệch đã sửa xong').toEqual([]);
  });

  it('GỬI DUYỆT cũng dọn — không cần ai bấm nút', async () => {
    /*
     * Đường đi thật của phần lớn hồ sơ: TDV không bấm *Tự động cập nhật*, chỉ
     * bấm *Gửi lại duyệt*. Lượt gửi duyệt gọi CHÍNH `lamMoiDong`, nên phép dọn
     * đi kèm miễn phí — và nó phải đi kèm, nếu không thì nhánh phổ biến nhất
     * vẫn mang lỗi cũ.
     */
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    await doiGia(d.productId, '130000');
    await raSoat(d.productId);
    expect(await demDauVet(d.id)).toBeGreaterThan(0);

    expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Gia da doi' })).status).toBe(200);
    expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(200);

    expect(await demDauVet(d.id)).toBe(0);
    expect((await get(`/policies/${d.id}`)).body.lech).toEqual([]);
  });

  it('dòng KHÔNG áp được thì dấu vết của nó Ở LẠI', async () => {
    /*
     * Phép dọn xoá theo `product_id` ĐÃ ÁP DỤNG, không xoá cả hồ sơ. Dòng không
     * làm mới được thì dấu vết của nó vẫn đúng — xoá đi là giấu mất đúng cái
     * dòng người dùng phải tự xử.
     *
     * `0200` ĐỔI CÁCH DỰNG, không đổi mệnh đề. Bản cũ dùng một sản phẩm VÔ HIỆU
     * HOÁ để tạo ra `hong`, mà từ `0200` nút rút hẳn mặt hàng ấy ra khỏi hồ sơ —
     * nên nó thôi là một ví dụ của *"không áp được"*. Ba nguyên nhân còn lại vẫn
     * còn; ở đây dùng sản phẩm BIẾN MẤT khỏi danh mục, thứ mà nút cố ý không tự
     * quyết (`0200` — việc phải làm của nó khác).
     */
    const con = await makeProduct();
    const mat = await makeProduct();
    const d = await draft({ productId: con });
    expect((await post(`/policies/${d.id}/lines`, line(mat))).status).toBe(201);
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await doiGia(con, '145000');
    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [mat]));
    await raSoat();
    expect(await demDauVet(d.id)).toBeGreaterThan(0);

    expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'San pham bien mat' })).status).toBe(
      200,
    );
    const ap = await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01');
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    expect(ap.body.hong).toHaveLength(1);
    expect(await demDauVet(d.id), 'dấu vết của dòng hỏng phải ở lại').toBeGreaterThan(0);
  });
});

/**
 * `0199` — SẢN PHẨM BIẾN MẤT khỏi danh mục: hồ sơ còn sửa được vẫn phải nói ra.
 *
 * Lỗi `0194` để lại, đo được trên chồng thật: `docDongVaAnh` gọi lời gọi CẢ LÔ
 * `product-snapshots`, vốn trả 404 cho TOÀN BỘ khi chỉ một id không còn. Hậu
 * quả xếp thành ba tầng, và tầng nào cũng im lặng theo một kiểu riêng:
 *
 *   * `byId` nuốt lỗi (`.catch(() => [])`) nên khối cảnh báo TẮT HẲN — kể cả
 *     chênh lệch của những dòng chẳng liên quan gì tới sản phẩm đã mất;
 *   * nút *Tự động cập nhật* trả `404 PRODUCT_NOT_FOUND`;
 *   * lượt GỬI DUYỆT cũng `404`, nên `STALE_LINE` — chốt chặn nêu đích danh mã
 *     sản phẩm và chỉ ra ba lối gỡ — không bao giờ chạy tới.
 *
 * Consumer thì KHÔNG dính, vì `0083` đã dựng cho nó một nhánh lùi. Nên cùng một
 * trạng thái danh mục cho ra HAI câu trả lời khác hẳn nhau tuỳ trạng thái hồ sơ
 * — đúng thứ `lech.ts` viết ra để chống, chỉ khác là chỗ bị chép làm hai bản
 * không phải phép so mà là bước đi lấy ảnh chụp trước khi so.
 */
describe('`0199` sản phẩm biến mất khỏi danh mục', () => {
  /** Không có đường API nào xoá sản phẩm (`0121`) — `0036` viết cho đúng ca này. */
  const xoaKhoiDanhMuc = (productId: string) =>
    withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [productId]));

  const doiGia = async (productId: string, tien: string) => {
    const r = await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };

  /** Hồ sơ hai dòng: một dòng sẽ lệch giá, một dòng sẽ biến mất. */
  const haiDong = async () => {
    const con = await makeProduct();
    const mat = await makeProduct();
    const d = await draft({ productId: con });
    expect((await post(`/policies/${d.id}/lines`, line(mat))).status).toBe(201);
    const hs = (await get(`/policies/${d.id}`)).body;
    const maCua = (pid: string) =>
      hs.lines.find((l: { productId: string }) => l.productId === pid).productCode as string;
    return { ...d, con, mat, maCon: maCua(con), maMat: maCua(mat) };
  };

  it('khối lệch VẪN HIỆN, và nói cả dòng mất lẫn dòng còn', async () => {
    const d = await haiDong();
    await doiGia(d.con, '130000');
    await xoaKhoiDanhMuc(d.mat);

    const lech = (await get(`/policies/${d.id}`)).body.lech as {
      kind: string;
      productCode: string;
      newValue: string | null;
    }[];
    // Chênh lệch của dòng CÒN LẠI là vế dễ mất nhất: nó chẳng liên quan gì tới
    // sản phẩm đã biến mất, mà bản `0194` cuốn nó đi theo.
    expect(lech).toContainEqual(
      expect.objectContaining({ kind: 'PRICE', productCode: d.maCon, newValue: '130000' }),
    );
    // `newValue: null` = "đã xoá khỏi danh mục" — xem `doc()` bên `Lech.tsx`.
    expect(lech).toContainEqual(
      expect.objectContaining({ kind: 'PRODUCT', productCode: d.maMat, newValue: null }),
    );
  });

  it('HỒ SƠ ĐÓNG BĂNG VÀ HỒ SƠ SỬA ĐƯỢC TRẢ CÙNG MỘT CÂU', async () => {
    /*
     * CA ĐÁNG GIÁ NHẤT của lượt sửa, vì nó canh đúng cái bất biến đã trôi: hai
     * đường tính, một câu trả lời. Dựng hai hồ sơ giống hệt nhau — cùng hai mặt
     * hàng, cùng một trạng thái danh mục — rồi đẩy một cái vào luồng. Bản `0194`
     * cho `[PRICE, PRODUCT]` ở cái đóng băng và `[]` ở cái còn Nháp.
     */
    const a = await haiDong();
    const b = await haiDong();
    expect((await act(b.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    await doiGia(a.con, '140000');
    await doiGia(b.con, '140000');
    await xoaKhoiDanhMuc(a.mat);
    await xoaKhoiDanhMuc(b.mat);
    await app.get(CatalogImpactConsumer).handle({});

    const goi = (l: { kind: string; newValue: string | null }[]) =>
      l.map((x) => `${x.kind}:${x.newValue}`).sort();
    const suaDuoc = goi((await get(`/policies/${a.id}`)).body.lech);
    const dongBang = goi((await get(`/policies/${b.id}`)).body.lech);
    expect(suaDuoc).toEqual(dongBang);
    expect(suaDuoc).toEqual(['PRICE:140000', 'PRODUCT:null']);
  });

  it('nút *Tự động cập nhật* trả 200 và áp được dòng CÒN LẠI', async () => {
    // Bản `0194` trả `404 PRODUCT_NOT_FOUND`, tức một dòng hoàn toàn lành cũng
    // không cập nhật được chỉ vì một dòng khác đã mất sản phẩm.
    const d = await haiDong();
    await doiGia(d.con, '150000');
    await xoaKhoiDanhMuc(d.mat);

    const r = await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.hong).toEqual([d.maMat]);

    const hs = (await get(`/policies/${d.id}`)).body;
    const dongCon = hs.lines.find((l: { productId: string }) => l.productId === d.con);
    expect(dongCon.companyPrice).toBe('150000');
  });

  it('GỬI DUYỆT trả `STALE_LINE` nêu đích danh mặt hàng, KHÔNG phải 404', async () => {
    /*
     * Chốt chặn có sẵn, viết đúng, và tới `0198` không bao giờ chạy tới. Khác
     * biệt với người dùng không nằm ở mã HTTP mà ở CÂU CHỮ: `404` nói *"không
     * tìm thấy sản phẩm này trong danh mục, tải lại rồi chọn lại"* cho một người
     * đang bấm Gửi duyệt và không chọn sản phẩm nào.
     */
    const d = await haiDong();
    await xoaKhoiDanhMuc(d.mat);

    const g = await act(d.id, 'SUBMIT', 'tdv01');
    expect(g.status, JSON.stringify(g.body)).toBe(422);
    expect(g.body.code).toBe('STALE_LINE');
    expect(g.body.products).toEqual([d.maMat]);
  });

  it('rút dòng hỏng rồi gửi lại thì ĐI TIẾP — lối gỡ mà câu lỗi chỉ ra', async () => {
    // Câu `STALE_LINE` bảo *"rút mặt hàng đó khỏi hồ sơ"*; nếu lối ấy không thật
    // thì nó chỉ là một câu an ủi, và hồ sơ chết hẳn ở Nháp như bế tắc `0186`.
    const d = await haiDong();
    await xoaKhoiDanhMuc(d.mat);
    const hs = (await get(`/policies/${d.id}`)).body;
    const dongXau = hs.lines.find((l: { productCode: string }) => l.productCode === d.maMat);

    expect((await del(`/policies/${d.id}/lines/${dongXau.id}`)).status).toBe(200);
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
  });

  it('CATALOG KHÔNG TRA ĐƯỢC thì KHÔNG đoán bừa — không rơi vào `hong`', async () => {
    /*
     * Ranh giới của cả lượt sửa. Chịu được sản phẩm VẮNG MẶT là đúng; chịu được
     * TRA HỤT thì sai, và sai theo hướng phá dữ liệu: mọi mặt hàng rơi vào
     * `hong`, rồi `STALE_LINE` khuyên người dùng rút hết chúng khỏi hồ sơ trong
     * khi danh mục chỉ đang khởi động lại.
     */
    const d = await draft();
    // Cả hai đường — lời gọi lô hỏng thì nhánh lùi hỏi từng cái cũng phải hỏng.
    const clients = app.get(Clients);
    const loi = new Error('catalog đang khởi động lại');
    const g1 = vi.spyOn(clients, 'productSnapshots').mockRejectedValue(loi);
    const g2 = vi.spyOn(clients, 'productSnapshot').mockRejectedValue(loi);
    try {
      const g = await act(d.id, 'SUBMIT', 'tdv01');
      expect(g.status, 'không được là 422 STALE_LINE').not.toBe(422);
      expect((await get(`/policies/${d.id}`)).body.status).toBe('NHAP');
    } finally {
      g1.mockRestore();
      g2.mockRestore();
    }
  });
});

/**
 * `0199` — ba vế còn lại của nút *Tự động cập nhật*.
 */
describe('`0199` nút Tự động cập nhật: dấu vết, `conLai`, và bất biến của `hong`', () => {
  const doiGia = async (productId: string, tien: string) => {
    await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
  };
  const apDung = (id: string) => post(`/policies/${id}/ap-dung-thay-doi`, {}, 'tdv01');
  const suKien = async (policyId: string) =>
    (await outboxFor(policyId)).map((r) => r.routing_key);

  it('bấm nút để lại MỘT dòng nhật ký — đo được ở outbox', async () => {
    /*
     * `lamMoiDong` cố ý không phát sự kiện nào, đúng khi nó còn chạy ở đường ĐỌC
     * (`0029`: *"không có người nào vừa sửa gì"*). Từ `0194` tiền đề ấy mất: đây
     * là một lượt GHI do người dùng bấm, đổi giá bán Công ty · ngưỡng · tỷ lệ CK
     * của nhiều dòng. `audit` nghe `#`, nên không sự kiện = không dấu vết nào.
     */
    const d = await draft();
    await doiGia(d.productId, '160000');
    await withAdminDb((c) => c.query(`DELETE FROM pol.outbox WHERE payload->>'policyId' = $1`, [d.id]));

    expect((await apDung(d.id)).status).toBe(200);
    expect(await suKien(d.id)).toEqual(['policy.updated']);
    const ev = (await outboxFor(d.id))[0]!;
    expect(ev.payload['change']).toBe('LINES_REFRESHED');
    expect(ev.payload['soDong']).toBe(1);
  });

  it('bấm khi KHÔNG có gì để áp thì KHÔNG ghi gì', async () => {
    // Bấm một nút không còn việc gì để làm là chuyện thường (hai tab, bấm hai
    // lần). Ghi nhật ký cho nó là dựng ra tiếng ồn đúng ở chỗ người ta vào để
    // tìm dấu vết.
    const d = await draft();
    await withAdminDb((c) => c.query(`DELETE FROM pol.outbox WHERE payload->>'policyId' = $1`, [d.id]));
    expect((await apDung(d.id)).status).toBe(200);
    expect(await suKien(d.id)).toEqual([]);
  });

  it('`conLai` KHỚP đúng số mục lệch mà lượt đọc kế tiếp bày ra', async () => {
    /*
     * `conLai` giờ tính ngay trong lượt ghi, từ chính bộ số vừa đọc, chứ không
     * mở một transaction thứ hai hỏi lại danh mục sau khi đã commit. Ca này canh
     * cho phép tính tại chỗ ấy đừng trôi khỏi thứ màn hình thật sự hiện ra.
     */
    // `0200` — dựng `hong` bằng sản phẩm BIẾN MẤT, không bằng sản phẩm vô hiệu
    // hoá: từ `0200` nút rút hẳn mặt hàng vô hiệu hoá, nên nó thôi để lại gì.
    const con = await makeProduct();
    const mat = await makeProduct();
    const d = await draft({ productId: con });
    expect((await post(`/policies/${d.id}/lines`, line(mat))).status).toBe(201);
    await doiGia(con, '170000');
    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [mat]));

    const r = await apDung(d.id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.conLai).toBe((await get(`/policies/${d.id}`)).body.lech.length);
    expect(r.body.conLai).toBeGreaterThan(0);
  });

  it('KHÔNG có lượt hỏi danh mục THỨ HAI sau khi đã ghi', async () => {
    /*
     * Bản `0194` mở hai transaction: một để ghi, một để gọi `soSanhDong` đếm lại
     * phần còn lệch — tức hỏi danh mục thêm một vòng SAU KHI đã commit, và vòng
     * ấy không có `catch` (khác `byId`). Một cú chớp mạng đúng khoảng đó trả lỗi
     * cho người dùng về một việc ĐÃ LÀM XONG: giao diện bắt lỗi nên không tải
     * lại, và màn hình bày số cũ cho một dòng đã đổi dưới CSDL.
     *
     * Thứ ca này KHẲNG ĐỊNH là **số lượt hỏi danh mục cho một cú bấm**, không
     * phải mã HTTP — và đó là lựa chọn có lý do, đo được lúc phá lại: dựng lại
     * lượt hỏi thứ hai thì request vẫn trả 200, vì `productSnapshotsChiuLoi` bắt
     * lượt gọi lô hỏng rồi lùi về hỏi từng cái (đường ấy không bị giả lập). Nói
     * cách khác nhánh lùi của `0199` che mất chính triệu chứng, nên canh theo
     * triệu chứng là dựng một ca xanh với đúng cái hỏng. Con số lượt gọi thì
     * không che được: một cú bấm, một vòng mạng, không có vòng nào sau phép ghi.
     */
    const d = await draft();
    await doiGia(d.productId, '180000');

    const clients = app.get(Clients);
    const that = clients.productSnapshots.bind(clients);
    let lan = 0;
    const gian = vi
      .spyOn(clients, 'productSnapshots')
      .mockImplementation(async (ids, loai, on) => {
        lan += 1;
        if (lan > 1) throw new Error('catalog chớp ngay sau lượt ghi');
        return that(ids, loai, on);
      });
    try {
      const r = await apDung(d.id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(lan, 'một cú bấm chỉ được hỏi danh mục một lượt').toBe(1);
    } finally {
      gian.mockRestore();
    }
    // Và phép ghi đi trọn vẹn, không dở dang.
    expect((await get(`/policies/${d.id}`)).body.lines[0].companyPrice).toBe('180000');
  });

  it('BẤT BIẾN: `hong` không rỗng thì `conLai` cũng không rỗng', async () => {
    /*
     * Đây là điều kiện để câu *"N mặt hàng chưa cập nhật được"* ở giao diện có
     * chỗ đứng: nó nằm BÊN TRONG khối chênh lệch, nên khối biến mất là câu ấy
     * biến mất theo. Mọi nguyên nhân của `hong` đều tự sinh ra ít nhất một mục
     * lệch — ca này giữ cho tính chất đó khỏi trôi.
     *
     * `0200` THU HẸP tập nguyên nhân (mặt hàng vô hiệu hoá rời khỏi `hong`, nút
     * rút hẳn nó ra) nhưng KHÔNG động tới bất biến: sản phẩm biến mất khỏi danh
     * mục vẫn ra một mục `PRODUCT`, chưa khai giá tại ngày áp dụng cũng thế, và
     * dòng tính ra số vô lý thì giá đã đổi nên đã có mục `PRICE`.
     */
    const con = await makeProduct();
    const mat = await makeProduct();
    const d = await draft({ productId: con });
    expect((await post(`/policies/${d.id}/lines`, line(mat))).status).toBe(201);
    // Không đổi giá dòng nào: đây là ca MỎNG NHẤT của bất biến — thứ duy nhất
    // sinh ra mục lệch là chính lượt biến mất.
    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [mat]));

    const r = await apDung(d.id);
    expect(r.body.hong).toHaveLength(1);
    expect(r.body.conLai).toBeGreaterThan(0);
  });
});

/**
 * `0200` — BOX *Yêu cầu cập nhật* kể cả hồ sơ CÒN SỬA ĐƯỢC.
 *
 * Tới `0199` box chỉ liệt kê hồ sơ đã đóng băng, nên TDV **không có đường nào để
 * BIẾT** bản Nháp của mình đã lệch — đúng lúc `0194` vừa cho họ một cái nút để
 * sửa chuyện ấy. Họ phải mở từng hồ sơ ra xem mới thấy.
 *
 * HAI VAI TRÒ CỦA BẢNG `pol.policy_impact`, và đừng lẫn: ở box nó là một CHỈ MỤC
 * (*"hồ sơ nào đáng mở ra xem"*), còn màn hình hồ sơ vẫn TÍNH TẠI CHỖ (`0194`).
 * Chỉ mục đi sau một nhịp thì chấp nhận được; một con số sai trên tờ giấy sắp ký
 * thì không.
 */
describe('`0200` yêu cầu cập nhật gồm cả hồ sơ còn sửa được', () => {
  const raSoat = (productId?: string) =>
    app.get(CatalogImpactConsumer).handle(productId === undefined ? {} : { productId });

  const doiGia = async (productId: string, tien: string) => {
    const r = await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };

  const trongBox = async (policyId: string, who = 'tdv01') => {
    const r = await get('/policies/impacted?limit=200', who);
    expect(r.status).toBe(200);
    return (r.body.items as { id: string; lech: unknown[] }[]).find((x) => x.id === policyId);
  };

  it('hồ sơ NHÁP lệch giá thì CÓ trong box', async () => {
    const d = await draft();
    await doiGia(d.productId, '210000');
    await raSoat(d.productId);

    const m = await trongBox(d.id);
    expect(m, 'bản Nháp đang lệch phải có trong box').toBeDefined();
    expect(m!.lech).toContainEqual(
      expect.objectContaining({ kind: 'PRICE', newValue: '210000' }),
    );
  });

  it('hồ sơ bị TRẢ LẠI cũng có — đó là lúc TDV mở ra sửa', async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_RETURN', 'tbp01', { reason: 'Sua gia' })).status).toBe(200);
    await doiGia(d.productId, '220000');
    await raSoat(d.productId);

    expect(await trongBox(d.id)).toBeDefined();
  });

  it('KHÔNG lệch thì KHÔNG có trong box, dù là Nháp', async () => {
    // Chiều đối chiếu: nới tập trạng thái mà quên phép so là box liệt kê MỌI
    // bản Nháp, và một danh sách luôn đầy thì người dùng học cách bỏ qua nó.
    const d = await draft();
    await raSoat(d.productId);
    expect(await trongBox(d.id)).toBeUndefined();
  });

  it('`0201` dòng đề ngày HÔM QUA vẫn thấy giá của hôm nay', async () => {
    /*
     * CA NÀY PHẢI THAY, không phải sửa con số — `0201` đảo đúng mệnh đề của nó.
     *
     * Bản `0200` khẳng định điều ngược lại (*"giá của hôm nay không chạm tới dòng
     * đề ngày hôm qua"*) với lý lẽ *"vì đó mới là con số sẽ được chụp lúc gửi
     * duyệt"* — và chính lý lẽ ấy là tiền đề sai: `lamMoiDong` đọc cùng bộ số với
     * phép so, nên "con số sẽ được chụp" là thứ do phép so quyết định, không phải
     * một sự thật độc lập để dựa vào.
     *
     * Hệ quả thật của luật cũ đo được ở `0201`: bảng giá của một ngày ĐÃ QUA
     * không đổi nữa (`0123`), nên một dòng đề ngày quá khứ — mà mọi dòng thừa kế
     * của một phiên bản mới đều thế — không bao giờ nhìn thấy được lượt đổi giá
     * nào, và hồ sơ đi hết luồng duyệt rồi được ký với giá lỗi thời.
     *
     * Vế còn nguyên giá trị của ca cũ, giữ lại: hai đường (box và màn hình hồ sơ)
     * phải nói CÙNG một câu.
     */
    const homQua = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const d = await draft({ ngayApDung: homQua });
    await doiGia(d.productId, '230000'); // hiệu lực HÔM NAY
    await raSoat(d.productId);

    const trong = await trongBox(d.id);
    expect(trong, 'dòng đề ngày quá khứ vẫn phải thấy lượt đổi giá').toBeDefined();
    expect((trong!.lech as { kind: string }[]).map((l) => l.kind)).toEqual(['PRICE']);
    // Và màn hình hồ sơ nói CÙNG một câu — hai đường, một câu trả lời.
    expect(
      ((await get(`/policies/${d.id}`)).body.lech as { kind: string }[]).map((l) => l.kind),
    ).toEqual(['PRICE']);
  });

  it('TDV SỬA DÒNG thì dấu vết của mặt hàng ấy bị QUÊN ngay', async () => {
    /*
     * Dấu vết do consumer ghi lúc danh mục đổi, còn dòng thì TDV sửa bất cứ lúc
     * nào. Thiếu bước quên, box nói về một chênh lệch người dùng vừa tự tay xử
     * xong — và nó nằm đó tới lần đổi danh mục kế tiếp chạm đúng sản phẩm ấy.
     */
    const d = await draft();
    await doiGia(d.productId, '240000');
    await raSoat(d.productId);
    expect(await trongBox(d.id), 'chưa dựng được dấu vết nền').toBeDefined();

    const lineId = (await get(`/policies/${d.id}`)).body.lines[0].id as string;
    // `wholesalePrice` bắt buộc: biểu mẫu sửa dòng gửi lên toàn bộ nội dung dòng.
    const r = await patch(`/policies/${d.id}/lines/${lineId}`, {
      wholesalePrice: '90000',
      cpbh: ['6000'],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    expect(await trongBox(d.id), 'sửa dòng là chụp lại giá, nên dấu vết cũ hết đúng').toBeUndefined();
  });

  it('RÚT DÒNG cũng quên dấu vết của mặt hàng ấy', async () => {
    // `0186` — dòng đã rút không sinh *Yêu cầu cập nhật*. Từ `0200` luật ấy phải
    // nói cả với dấu vết ĐÃ GHI, không riêng lượt rà kế tiếp.
    const d = await draft();
    await doiGia(d.productId, '250000');
    await raSoat(d.productId);
    expect(await trongBox(d.id)).toBeDefined();

    const lineId = (await get(`/policies/${d.id}`)).body.lines[0].id as string;
    expect((await del(`/policies/${d.id}/lines/${lineId}`)).status).toBe(200);

    expect(await trongBox(d.id)).toBeUndefined();
  });

  it('bấm *Tự động cập nhật* thì hồ sơ RỜI box', async () => {
    // Vòng khép kín của cả tính năng: box chỉ đường → TDV bấm nút → hồ sơ biến
    // mất khỏi box. Thiếu vế cuối thì cái nút không dọn được chính lời nhắc.
    const d = await draft();
    await doiGia(d.productId, '260000');
    await raSoat(d.productId);
    expect(await trongBox(d.id)).toBeDefined();

    expect((await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01')).status).toBe(200);
    expect(await trongBox(d.id)).toBeUndefined();
  });
});

/**
 * `0239` — *Yêu cầu cập nhật* CHƯA MỞ ở phiên bản này (khách hàng chốt 24/10).
 *
 * Bộ kiểm chạy với công tắc BẬT (`tests/bat-tinh-nang.ts`) để mọi ca ở trên vẫn
 * canh tính năng; khối này tự TẮT rồi trả lại, và hỏi ba đường ra của máy chủ.
 * Dữ liệu nền (`pol.policy_impact`) vẫn ghi trong lúc tắt — ca cuối đòi điều ấy,
 * vì đó là thứ làm cho ngày bật lên không phải đợi một lượt đổi danh mục nữa.
 */
describe('`0239` công tắc tính năng Yêu cầu cập nhật', () => {
  const raSoat = (productId: string) => app.get(CatalogImpactConsumer).handle({ productId });

  const doiGia = async (productId: string, tien: string) => {
    const r = await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };

  const trongBox = async (policyId: string) => {
    const r = await get('/policies/impacted?limit=200');
    expect(r.status).toBe(200);
    return (r.body.items as { id: string }[]).find((x) => x.id === policyId);
  };

  const tat = async <T>(f: () => Promise<T>): Promise<T> => {
    TINH_NANG.yeuCauCapNhat = false;
    try {
      return await f();
    } finally {
      TINH_NANG.yeuCauCapNhat = true;
    }
  };

  it('phiên bản này GIAO với công tắc TẮT — bật lên là việc của phiên bản sau', () => {
    // Ca GHIM. Bật tính năng thì sửa ca này cùng lượt, có chủ ý.
    expect(TINH_NANG_MAC_DINH.yeuCauCapNhat).toBe(false);
    // Và bộ kiểm thật sự chạy với công tắc bật — thiếu `setupFiles` thì mọi ca
    // của tính năng ở trên đỏ hàng loạt, nhưng câu này nói thẳng vì sao.
    expect(TINH_NANG.yeuCauCapNhat).toBe(true);
  });

  it('TẮT: box rỗng, hồ sơ không trả `lech` — dù dấu vết có thật', async () => {
    const d = await draft();
    await doiGia(d.productId, '270000');
    await raSoat(d.productId);
    // Mốc đối chứng: cùng hồ sơ, công tắc bật thì CÓ.
    expect(await trongBox(d.id)).toBeDefined();
    expect((await get(`/policies/${d.id}`)).body.lech).not.toEqual([]);

    await tat(async () => {
      expect(await trongBox(d.id)).toBeUndefined();
      const r = await get('/policies/impacted?limit=200');
      expect(r.body.total).toBe(0);
      expect((await get(`/policies/${d.id}`)).body.lech).toEqual([]);
    });
  });

  it('TẮT: nút *Tự động cập nhật* gọi thẳng API là 404, và không đổi số nào', async () => {
    const d = await draft();
    await doiGia(d.productId, '280000');
    await raSoat(d.productId);
    const truoc = (await get(`/policies/${d.id}`)).body.lines[0].companyPrice;

    await tat(async () => {
      const r = await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01');
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('FEATURE_NOT_ENABLED');
    });

    expect((await get(`/policies/${d.id}`)).body.lines[0].companyPrice).toBe(truoc);
    // Bật lại: dấu vết ghi trong lúc tắt vẫn còn, nút chạy như cũ.
    expect(await trongBox(d.id)).toBeDefined();
    expect((await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01')).status).toBe(200);
  });

  it('TẮT: consumer VẪN ghi dấu vết — bật lên là có dữ liệu ngay', async () => {
    const d = await draft();
    await tat(async () => {
      await doiGia(d.productId, '290000');
      await raSoat(d.productId);
    });
    expect(await trongBox(d.id)).toBeDefined();
  });

  it('TẮT: gửi duyệt VẪN chụp số hiện hành — luật đóng băng không thuộc công tắc', async () => {
    const d = await draft();
    await doiGia(d.productId, '300000');
    await tat(async () => {
      expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    });
    expect(Number((await get(`/policies/${d.id}`)).body.lines[0].companyPrice)).toBe(300000);
  });
});

/**
 * `0200` — MẶT HÀNG ĐÃ VÔ HIỆU HOÁ: nút *Tự động cập nhật* RÚT nó khỏi hồ sơ.
 *
 * Khách hàng chốt 11/09. Trước đó dòng ấy nằm lại trong `hong` mãi mãi: nút
 * không áp được nó, và người dùng phải tự đi tìm nút *Xoá* trên đúng hàng ấy sau
 * khi đọc một câu giải thích. Một mặt hàng không còn bán thì việc phải làm chỉ
 * có MỘT, nên bắt họ làm tay là bắt gõ lại một quyết định đã rõ.
 */
describe('`0200` tự động cập nhật rút mặt hàng đã vô hiệu hoá', () => {
  const voHieuHoa = async (productId: string, ma: string) => {
    const r = await (await http(catalog))
      .patch(`/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ status: 'DA_VO_HIEU_HOA', confirm: ma });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  };
  const maCua = async (id: string, productId: string) =>
    ((await get(`/policies/${id}`)).body.lines as { productId: string; productCode: string }[]).find(
      (l) => l.productId === productId,
    )!.productCode;

  it('dòng MỚI (không thừa kế) bị XOÁ HẲN khỏi bảng', async () => {
    const d = await draft();
    await voHieuHoa(d.productId, await maCua(d.id, d.productId));

    const r = await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.daRut).toHaveLength(1);
    // Và nó KHÔNG còn nằm trong `hong`: hai danh sách nói hai chuyện ngược nhau.
    expect(r.body.hong).toEqual([]);

    const hs = (await get(`/policies/${d.id}`)).body;
    expect(hs.lines, 'dòng của phiên bản này thì xoá hẳn (`0186`)').toHaveLength(0);
    expect(hs.lech, 'rút xong thì không còn gì để cảnh báo').toEqual([]);
  });

  it('dòng THỪA KẾ thì XOÁ MỀM — nằm lại với nhãn *Đã xoá*', async () => {
    /*
     * `0186`: mặt hàng bị rút khỏi một phiên bản mới phải NHÌN THẤY ĐƯỢC. Xoá
     * hẳn một dòng thừa kế là thu hồi một quyền lợi trong im lặng — người duyệt
     * mở bản mới ra và không có gì nói rằng mặt hàng ấy vừa biến mất.
     */
    const d = await draft();
    await runToActive(d);
    const moi = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(moi.status, JSON.stringify(moi.body)).toBe(201);
    await voHieuHoa(d.productId, await maCua(moi.body.id, d.productId));

    const r = await post(`/policies/${moi.body.id}/ap-dung-thay-doi`, {}, 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.daRut).toHaveLength(1);

    const dongs = (await get(`/policies/${moi.body.id}`)).body.lines as {
      productId: string;
      trangThai: string;
    }[];
    const con = dongs.find((l) => l.productId === d.productId);
    expect(con, 'dòng thừa kế phải NẰM LẠI').toBeDefined();
    expect(con!.trangThai).toBe('DA_XOA');
  });

  it('GỬI DUYỆT thì KHÔNG rút — vẫn chặn bằng `STALE_LINE`', async () => {
    /*
     * Ranh giới nguy hiểm nhất của lượt sửa. Lượt gửi duyệt gọi CHÍNH
     * `lamMoiDong`; bật phép rút mặc định là hồ sơ âm thầm mất một mặt hàng ngay
     * lúc rời tay người lập — không ai bấm gì, không màn hình nào nói gì, và chỉ
     * lộ ra khi người duyệt đọc một bảng thiếu dòng.
     */
    const d = await draft();
    const ma = await maCua(d.id, d.productId);
    await voHieuHoa(d.productId, ma);

    const g = await act(d.id, 'SUBMIT', 'tdv01');
    expect(g.status, JSON.stringify(g.body)).toBe(422);
    expect(g.body.code).toBe('STALE_LINE');
    expect(g.body.products).toEqual([ma]);
    // Và dòng vẫn còn nguyên trong hồ sơ.
    expect((await get(`/policies/${d.id}`)).body.lines).toHaveLength(1);
  });

  it('CHỈ mặt hàng vô hiệu hoá — sản phẩm biến mất thì vẫn vào `hong`', async () => {
    /*
     * Ba nguyên nhân rơi vào `hong`, và việc phải làm của chúng khác nhau. Sản
     * phẩm biến mất khỏi danh mục thì rút là đúng, nhưng khách hàng chốt đúng
     * một câu — *mặt hàng vô hiệu hoá* — và mở rộng hộ là quyết định thay họ ở
     * một chỗ họ chưa nhìn tới.
     */
    const con = await makeProduct();
    const mat = await makeProduct();
    const d = await draft({ productId: con });
    expect((await post(`/policies/${d.id}/lines`, line(mat))).status).toBe(201);
    const maMat = await maCua(d.id, mat);
    await withAdminDb((c) => c.query(`DELETE FROM cat.product WHERE id = $1`, [mat]));

    const r = await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.daRut).toEqual([]);
    expect(r.body.hong).toEqual([maMat]);
    expect((await get(`/policies/${d.id}`)).body.lines).toHaveLength(2);
  });

  it('lượt rút để lại dấu vết trong nhật ký', async () => {
    // Rút một mặt hàng khỏi văn bản là một thay đổi thật, và `0199` vừa dựng
    // đường ghi dấu vết cho chính nút này. Rút mà không ghi là đúng cái lỗ hổng
    // ấy quay lại ở một nhánh khác.
    const d = await draft();
    await voHieuHoa(d.productId, await maCua(d.id, d.productId));
    await withAdminDb((c) =>
      c.query(`DELETE FROM pol.outbox WHERE payload->>'policyId' = $1`, [d.id]),
    );

    expect((await post(`/policies/${d.id}/ap-dung-thay-doi`, {}, 'tdv01')).status).toBe(200);
    const sk = await outboxFor(d.id);
    expect(sk.map((r) => r.routing_key)).toEqual(['policy.updated']);
    expect(sk[0]!.payload['soDongRut']).toBe(1);
  });
});

/**
 * `0200` — CSBH ĐANG CÓ HIỆU LỰC: mọi dòng mang trạng thái *Đang áp dụng*.
 *
 * Khách hàng chốt 11/09. Lý do rộng hơn câu chữ: *Bổ sung* và *Chỉnh sửa* trả
 * lời câu hỏi CỦA NGƯỜI ĐANG SOẠN — *"so với bản đang chạy, tôi vừa đổi gì?"*.
 * Hồ sơ duyệt xong thì bản trước đã vô hiệu TOÀN BỘ và không còn gì để so; giữ
 * nhãn cũ là bày ra một phép so với một văn bản đã chết.
 */
describe('`0200` hồ sơ có hiệu lực thì mọi dòng là Đang áp dụng', () => {
  const dongCua = async (id: string, who = 'tdv01') =>
    (await get(`/policies/${id}`, who)).body.lines as {
      productCode: string;
      trangThai: string;
      discountRateTruoc: string | null;
    }[];

  it('bản mới có DÒNG SỬA và DÒNG THÊM: đang duyệt là hai nhãn, hiệu lực là một', async () => {
    /*
     * Ca đi hết đường, và nó phải bắt được CẢ HAI thời điểm trên cùng một hồ sơ:
     * chỉ kiểm lúc có hiệu lực thì một bản sửa làm mọi dòng *Đang áp dụng* ở mọi
     * trạng thái vẫn xanh — mà đó là xoá mất thông tin của người duyệt.
     */
    const spCu = await makeProduct();
    const spMoi = await makeProduct();
    const d = await draft({ productId: spCu });
    await runToActive(d);

    const moi = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(moi.status, JSON.stringify(moi.body)).toBe(201);
    const idMoi = moi.body.id as string;

    // Sửa dòng thừa kế → *Chỉnh sửa*; thêm một mặt hàng → *Bổ sung*.
    const lineCu = (await dongCua(idMoi)).find((l) => l.productCode !== undefined)!;
    const lineId = ((await get(`/policies/${idMoi}`)).body.lines as { id: string }[])[0]!.id;
    expect(
      (await patch(`/policies/${idMoi}/lines/${lineId}`, { wholesalePrice: '88000' })).status,
    ).toBe(200);
    expect((await post(`/policies/${idMoi}/lines`, line(spMoi))).status).toBe(201);
    void lineCu;

    const dangSoan = await dongCua(idMoi);
    expect(
      dangSoan.map((l) => l.trangThai).sort(),
      'lúc còn soạn thì hai nhãn phải KHÁC nhau',
    ).toEqual(['BO_SUNG', 'CHINH_SUA']);
    expect(dangSoan.some((l) => l.discountRateTruoc !== null), 'dòng Chỉnh sửa có tỷ lệ cũ').toBe(
      true,
    );

    await runToActive({ id: idMoi });

    const coHieuLuc = await dongCua(idMoi);
    expect(coHieuLuc).toHaveLength(2);
    for (const l of coHieuLuc) {
      expect(l.trangThai, `${l.productCode} phải là Đang áp dụng`).toBe('DANG_AP_DUNG');
      // Cột *Tỷ lệ CK cũ* phải tắt theo: để nó còn số là đánh dấu đúng những
      // dòng vốn là *Chỉnh sửa*, tức dựng lại bằng một cột số cái phân biệt vừa
      // được yêu cầu bỏ đi.
      expect(l.discountRateTruoc, `${l.productCode} không được còn tỷ lệ cũ`).toBeNull();
    }
  });

  it('BẢN MỀM và read-model nói CÙNG một câu — cùng một biểu thức SQL', async () => {
    /*
     * `internal.controller` là cửa duy nhất `document` và `reporting` đọc hồ sơ
     * (AD-02), và nó dùng CHUNG `SQL_TRANG_THAI_DONG`. Ca này canh cho phép dùng
     * chung ấy đừng bị tách ra: tờ giấy in *Bổ sung* trong khi màn hình nói
     * *Đang áp dụng* là hai câu trả lời cho một câu hỏi.
     */
    const d = await draft();
    await runToActive(d);

    const noiBo = await (await http(app))
      .get(`/internal/policies/${d.id}`)
      .set('X-Service-Token', mintServiceToken('document'));
    expect(noiBo.status, JSON.stringify(noiBo.body)).toBe(200);
    for (const l of noiBo.body.lines as { trang_thai: string }[]) {
      expect(l.trang_thai).toBe('DANG_AP_DUNG');
    }
  });
});

// =============================================================================
// `0201` — PHIÊN BẢN MỚI VẪN THẤY LƯỢT ĐỔI GIÁ
// =============================================================================

/**
 * Người dùng báo 11/09: *"sản phẩm có giá bán công ty thay đổi biến mất trong lý
 * do yêu cầu cập nhật sau khi tạo một phiên bản mới cho CSBH đang có hiệu lực"*.
 *
 * Đo được trên chồng kiểm, cùng khách · cùng sản phẩm · cùng danh mục:
 *
 *   bản đang hiệu lực (đóng băng) → PRICE 100.000 → 130.000
 *   bản mới           (sửa được)  → không lệch gì
 *
 * Đúng hình dạng hỏng mà `0199` vừa chữa một lần — *hai hồ sơ giống hệt nhau,
 * hai câu trả lời ngược nhau* — lần này ở NGÀY TRA DANH MỤC thay vì ở lời gọi lô.
 * Dòng thừa kế giữ nguyên ngày áp dụng của bản cũ (cố ý), nên nó luôn đề một ngày
 * QUÁ KHỨ; mà bảng giá của một ngày đã qua thì không đổi nữa (`0123`), nên phép
 * so ấy không bao giờ tìm ra được gì. Xem `ngayTraDanhMuc`.
 *
 * Và nó không dừng ở một câu cảnh báo mất tích: `lamMoiDong` đọc cùng bộ số, nên
 * nút không áp được gì, lượt gửi duyệt chụp lại đúng con số cũ, `STALE_LINE`
 * không có gì để chặn — bản CSBH mới được KÝ với giá đã lỗi thời.
 */
describe('`0201` phiên bản mới vẫn thấy lượt đổi giá của danh mục', () => {
  const doiGiaHomNay = async (productId: string, tien: string) => {
    const r = await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };

  /** Bản đang hiệu lực có một dòng đề ngày QUÁ KHỨ — hình dạng của hồ sơ lập từ tháng trước. */
  const banHieuLucNgayCu = async () => {
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    const customerId = await makeCustomer();
    const r = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2020-06-01' })],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await runToActive({ id: r.body.id });
    return { customerId, productId, id: r.body.id as string };
  };

  it('dòng THỪA KẾ đề ngày quá khứ vẫn báo lệch giá', async () => {
    const cu = await banHieuLucNgayCu();
    await doiGiaHomNay(cu.productId, '130000');

    const v2 = await post('/policies', {
      customerId: cu.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);

    const hs = (await get(`/policies/${v2.body.id}`)).body;
    expect(hs.lech).toHaveLength(1);
    expect(hs.lech[0]).toMatchObject({ kind: 'PRICE', snapValue: '100000', newValue: '130000' });
  });

  it('hai bản của CÙNG một khách nói CÙNG một câu', async () => {
    /*
     * Bất biến thật sự của lượt sửa, và là thứ ca trên một mình không nói được:
     * hồ sơ đóng băng và hồ sơ còn sửa được hỏi danh mục ở hai thời điểm khác
     * nhau theo thiết kế (`0180`), nhưng câu trả lời *"mặt hàng này đã lệch giá
     * chưa"* thì phải giống nhau — người dùng đọc hai màn hình cạnh nhau.
     */
    const cu = await banHieuLucNgayCu();
    await doiGiaHomNay(cu.productId, '130000');
    const v2 = await post('/policies', {
      customerId: cu.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    await app.get(CatalogImpactConsumer).handle({ productId: cu.productId });

    const cuLech = (await get(`/policies/${cu.id}`)).body.lech as { kind: string }[];
    const moiLech = (await get(`/policies/${v2.body.id}`)).body.lech as { kind: string }[];
    expect(cuLech.map((l) => l.kind)).toEqual(['PRICE']);
    expect(moiLech.map((l) => l.kind)).toEqual(['PRICE']);
  });

  it('nút *Tự động cập nhật* áp được, và KHÔNG đụng NGÀY ÁP DỤNG', async () => {
    /*
     * Vế phải canh: `ngay_ap_dung` là một trong những trường mà
     * `SQL_TRANG_THAI_DONG` so để suy ra *Đang áp dụng* / *Chỉnh sửa* (`0180`).
     * Chữa lỗi `0201` bằng cách dời ngày của dòng thừa kế về hôm nay thì mọi dòng
     * của mọi phiên bản mới nhảy sang *Chỉnh sửa* — đúng, mà sai hẳn chỗ khác.
     *
     * ------------------------------------------------------------------------
     * VẾ NHÃN TRẠNG THÁI PHẢI THAY (`0202`).
     * ------------------------------------------------------------------------
     *
     * Bản `0201` của ca này còn đòi `trangThai` giữ nguyên *Đang áp dụng* sau
     * lượt bấm. Khách hàng chốt 12/09 điều ngược lại: Giá bán Công ty khác bản
     * trước thì dòng LÀ *Chỉnh sửa*. Mệnh đề đổi, nên phần khẳng định đổi theo —
     * còn cái nó bảo vệ (đừng dời ngày để chữa `0201`) thì không đổi, nên nó
     * được hỏi bằng một câu KHÁC: nhãn đúng ra sao thì `0202` canh, ở đây chỉ
     * hỏi NGÀY.
     */
    const cu = await banHieuLucNgayCu();
    await doiGiaHomNay(cu.productId, '130000');
    const v2 = await post('/policies', {
      customerId: cu.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });

    const ap = await post(`/policies/${v2.body.id}/ap-dung-thay-doi`, {});
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    // `conLai` ra ngoài là một CON SỐ, không phải mảng — xem `apDungThayDoi`.
    expect(ap.body).toMatchObject({ hong: [], conLai: 0 });

    const hs = (await get(`/policies/${v2.body.id}`)).body;
    expect(hs.lech).toEqual([]);
    expect(hs.lines[0].companyPrice).toBe('130000');
    expect(String(hs.lines[0].ngayApDung)).toContain('2020-06-01');
  });

  it('dòng đề ngày TƯƠNG LAI vẫn tra bảng giá của NGÀY ẤY', async () => {
    /*
     * RANH GIỚI, và là cách chữa sai hấp dẫn nhất: *"đường đối chiếu cứ so với
     * danh mục hôm nay, giống hệt hồ sơ đã đóng băng"*. Nó chữa được ca trên rồi
     * làm hỏng ca này theo chiều ngược — dòng đề ngày tháng sau đã chụp đúng bảng
     * giá của tháng sau, nên so với hôm nay là báo lệch NGƯỢC, và nút *Tự động
     * cập nhật* ghi đè giá tương lai bằng giá hôm nay.
     */
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '500000', '2030-01-01');
    const customerId = await makeCustomer();
    const r = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2030-06-01' })],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.lines[0].companyPrice).toBe('500000');

    await doiGiaHomNay(productId, '130000');

    const hs = (await get(`/policies/${r.body.id}`)).body;
    expect(hs.lech, 'giá của ngày áp dụng tương lai không đổi thì không có gì lệch').toEqual([]);
  });
});

// =============================================================================
// `0202` — GIÁ BÁN CÔNG TY ĐỔI SO VỚI BẢN TRƯỚC CŨNG LÀ *Chỉnh sửa*
// =============================================================================

/**
 * Khách hàng chốt 12/09. Đây là lượt ĐẢO một quyết định của `0180`, và điều đáng
 * ghi là **tiền đề của quyết định cũ đã chết từ `0194`**:
 *
 * `0180` loại `company_price_snap` ra khỏi phép so với lý do *"`lamMoiDong` chụp
 * lại chúng ở MỖI LƯỢT ĐỌC, nên danh mục đổi giá một mình cũng làm mọi dòng của
 * mọi bản nháp nhảy sang Chỉnh sửa"*. `0194` gỡ đúng phép ghi đè ở đường đọc ấy —
 * từ đó `lamMoiDong` chỉ chạy khi TDV bấm *Tự động cập nhật* hoặc khi gửi duyệt.
 * Hậu quả mà `0180` sợ đã hết đường xảy ra, và ca *"chưa bấm gì thì chưa đổi
 * nhãn"* dưới đây là chốt giữ cho điều đó đúng.
 */
describe('`0202` giá bán Công ty đổi thì dòng thừa kế thành *Chỉnh sửa*', () => {
  const dongCua = (body: { lines: Record<string, unknown>[] }, productId: string) =>
    body.lines.find((l) => l['productId'] === productId)!;

  const doiGia = async (productId: string, tien: string) => {
    const r = await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };

  /** Bản đang hiệu lực + một phiên bản mới chưa ai sửa gì. */
  const banMoiChuaSua = async () => {
    const d = await draft();
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    expect(dongCua(v2.body, d.productId)['trangThai']).toBe('DANG_AP_DUNG');
    return { ...d, v2Id: v2.body.id as string };
  };

  it('bấm *Tự động cập nhật* xong: dòng thành *Chỉnh sửa*, kèm tỷ lệ CK cũ', async () => {
    const d = await banMoiChuaSua();
    await doiGia(d.productId, '130000');

    const ap = await post(`/policies/${d.v2Id}/ap-dung-thay-doi`, {});
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);

    const l = dongCua((await get(`/policies/${d.v2Id}`)).body, d.productId);
    expect(l['companyPrice']).toBe('130000');
    expect(l['trangThai']).toBe('CHINH_SUA');
    // Vế thứ hai, và là lý do thực dụng của cả lượt sửa: cột *Tỷ lệ CK cũ* chỉ
    // hiện cho dòng *Chỉnh sửa*, nên trước `0202` nó tắt đúng ở những dòng cần
    // nó nhất — chỗ tỷ lệ vừa nhảy vì giá Công ty đổi.
    expect(l['discountRateTruoc']).not.toBeNull();
  });

  it('CHƯA BẤM GÌ thì dòng vẫn *Đang áp dụng* — phép so đọc ẢNH CHỤP, không đọc danh mục', async () => {
    /*
     * Chốt chặn giữ cho lập luận của `0180` khỏi sống lại thành sự thật. Phép so
     * đứng giữa hai ảnh chụp nằm trên hai DÒNG hồ sơ; danh mục không có mặt trong
     * đó. Nối thẳng phép so vào danh mục là mọi bản nháp của mọi khách nhảy sang
     * *Chỉnh sửa* cùng lúc, ngay lượt Quản trị đổi một con số.
     */
    const d = await banMoiChuaSua();
    await doiGia(d.productId, '130000');

    const l = dongCua((await get(`/policies/${d.v2Id}`)).body, d.productId);
    expect(l['companyPrice'], 'ảnh chụp chưa đổi thì nhãn cũng chưa').toBe('100000');
    expect(l['trangThai']).toBe('DANG_AP_DUNG');
    expect(l['discountRateTruoc']).toBeNull();
  });

  it('GỬI DUYỆT cũng làm nhãn ấy mọc ra — không ai gõ gì', async () => {
    /*
     * Hệ quả đã nêu lúc chốt, và nó phải có ca kiểm chứ không chỉ một dòng chú
     * thích: `lamMoiDong` tự chạy ở lượt gửi duyệt (`0029`), nên hồ sơ đóng băng
     * với giá mới và dòng mang nhãn *Chỉnh sửa* trên chính văn bản đem ký — dù
     * TDV không sửa một ô nào. Đúng câu khách hàng đặt: câu hỏi là *"dòng này có
     * khác bản trước không"*, không phải *"TDV có gõ gì không"*.
     */
    const d = await banMoiChuaSua();
    await doiGia(d.productId, '130000');

    expect((await act(d.v2Id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const hs = (await get(`/policies/${d.v2Id}`)).body;
    expect(hs.status).toBe('CHO_TBP_DUYET');
    expect(dongCua(hs, d.productId)['trangThai']).toBe('CHINH_SUA');
  });

  it('HỒ SƠ CÓ HIỆU LỰC vẫn kéo mọi dòng về *Đang áp dụng* — `0200` đứng trước', async () => {
    // Thứ tự các nhánh `CASE` là thứ duy nhất giữ hai luật này khỏi cãi nhau.
    const d = await banMoiChuaSua();
    await doiGia(d.productId, '130000');
    await post(`/policies/${d.v2Id}/ap-dung-thay-doi`, {});
    await runToActive({ id: d.v2Id });

    const l = dongCua((await get(`/policies/${d.v2Id}`)).body, d.productId);
    expect(l['trangThai']).toBe('DANG_AP_DUNG');
    expect(l['discountRateTruoc']).toBeNull();
  });

  it('RANH GIỚI: đổi MỘT MÌNH ngưỡng thì vẫn là *Đang áp dụng*', async () => {
    /*
     * `threshold_snap` vẫn đứng ngoài phép so — khách hàng chốt đúng MỘT trường,
     * và ngưỡng không suy ra được từ ba trường kia (nó đổi `over_threshold` mà
     * không đổi tỷ lệ CK). Ca này ghim quyết định ấy để lượt nới sau — nếu có —
     * là một lượt sửa có chủ ý, không phải một hệ quả kèm theo.
     */
    const { productId, groupCode: nhom } = await sanPhamNhomRieng('100000', '2020-01-01');
    expect(
      (await khaiQuyDinh({
        code: uniq('CK'), productGroupCode: nhom,
        effectiveFrom: '2020-01-01', thresholdRate2: 1500,
      })).status,
    ).toBe(201);

    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [line(productId)] });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    await runToActive({ id: d.body.id });
    const v2 = await post('/policies', { customerId, mode: 'NEW_VERSION', lines: [] });

    // Chỉ đổi NGƯỠNG, không đụng giá.
    expect(
      (await khaiQuyDinh({
        code: uniq('CK'), productGroupCode: nhom,
        effectiveFrom: ngayVN(), thresholdRate2: 2500,
      })).status,
    ).toBe(201);
    expect((await post(`/policies/${v2.body.id}/ap-dung-thay-doi`, {})).status).toBe(200);

    const l = dongCua((await get(`/policies/${v2.body.id}`)).body, productId);
    expect(l['threshold'], 'ngưỡng PHẢI đã đổi — nếu không thì ca này đo nhầm thứ').toBe('25.00');
    expect(l['companyPrice']).toBe('100000');
    expect(l['trangThai']).toBe('DANG_AP_DUNG');
  });
});

// =============================================================================
// `0203` — SỬA MỘT DÒNG THÌ GIÁ BÁN CÔNG TY LẤY BẢNG GIÁ HIỆN HÀNH
// =============================================================================

/**
 * Khách hàng chốt 12/09: *"khi hồ sơ ở Nháp hoặc Yêu cầu chỉnh sửa, nhấn sửa một
 * sản phẩm thì Giá bán Công ty phải tự động cập nhật giá hiện tại, chứ không phải
 * giá đang hiện trong CSBH"*.
 *
 * Cùng gốc với `0201`, ở nửa còn lại: `0201` quy đổi ngày tra cho đường ĐỐI CHIẾU
 * và đường LÀM MỚI, còn đường GHI của `addLine`/`updateLine` — và hộp thoại xem
 * trước đi kèm — vẫn tra theo đúng `ngay_ap_dung` của dòng. Với dòng thừa kế thì
 * ngày ấy là ngày của bản CSBH trước, nên hộp thoại bày lại chính con số đang nằm
 * trên dòng.
 *
 * Đo được trên chồng kiểm, và nặng hơn hộp thoại:
 *
 *   bấm *Tự động cập nhật* → 130.000
 *   sửa MỘT GHI CHÚ        → 100.000   ← lượt cập nhật biến mất, khối cảnh báo mọc lại
 */
describe('`0203` sửa dòng thì giá bán Công ty là giá hiện hành', () => {
  const dongCua = (body: { lines: Record<string, unknown>[] }, productId: string) =>
    body.lines.find((l) => l['productId'] === productId)!;

  const doiGiaHomNay = async (productId: string, tien: string) => {
    const r = await (await http(catalog))
      .post(`/catalog/products/${productId}/prices`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ priceType: 'GIA_BAN_CONG_TY', amount: tien });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };

  /** Phiên bản mới có một dòng thừa kế đề ngày QUÁ KHỨ, và danh mục vừa đổi giá. */
  const banMoiDongNgayCu = async () => {
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    const customerId = await makeCustomer();
    const v1 = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2020-06-01' })],
    });
    expect(v1.status, JSON.stringify(v1.body)).toBe(201);
    await runToActive({ id: v1.body.id });
    await doiGiaHomNay(productId, '130000');
    const v2 = await post('/policies', { customerId, mode: 'NEW_VERSION', lines: [] });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    return { productId, customerId, v2Id: v2.body.id as string, v2: v2.body };
  };

  it('HỘP THOẠI xem trước bày giá HIỆN HÀNH, không bày lại số trên dòng', async () => {
    const d = await banMoiDongNgayCu();
    const dong = dongCua(d.v2, d.productId);
    expect(dong['companyPrice'], 'dòng vẫn giữ số đã đóng băng').toBe('100000');

    const xem = await get(
      `/policies/${d.v2Id}/threshold-preview?productId=${d.productId}` +
        `&ngayApDung=${String(dong['ngayApDung']).slice(0, 10)}`,
    );
    expect(xem.status, JSON.stringify(xem.body)).toBe(200);
    expect(xem.body.companyPrice).toBe('130000');
  });

  it('SỬA GHI CHÚ cũng chụp lại giá hiện hành — không làm mất lượt *Tự động cập nhật*', async () => {
    /*
     * Ca đáng giá nhất của chặng, và nó nói về một chuỗi chứ không một lượt gọi:
     * bấm nút xong rồi sửa một ô CHẲNG LIÊN QUAN GÌ TỚI GIÁ là con số vừa cập
     * nhật bị ghi đè ngược. Không mã lỗi, không màn hình nào nói, và khối *Yêu
     * cầu cập nhật* mọc lại như chưa có chuyện gì.
     */
    const d = await banMoiDongNgayCu();
    expect((await post(`/policies/${d.v2Id}/ap-dung-thay-doi`, {})).status).toBe(200);
    const sauAp = dongCua((await get(`/policies/${d.v2Id}`)).body, d.productId);
    expect(sauAp['companyPrice']).toBe('130000');

    const r = await patch(`/policies/${d.v2Id}/lines/${sauAp['id']}`, {
      wholesalePrice: sauAp['wholesalePrice'],
      cpbh: sauAp['cpbh'],
      note: 'doi moi ghi chu',
      ngayApDung: String(sauAp['ngayApDung']).slice(0, 10),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const hs = (await get(`/policies/${d.v2Id}`)).body;
    expect(dongCua(hs, d.productId)['companyPrice']).toBe('130000');
    expect(hs.lech, 'hồ sơ vừa cập nhật xong thì không còn gì lệch').toEqual([]);
  });

  it('NGÀY ÁP DỤNG của dòng KHÔNG bị kéo theo', async () => {
    /*
     * Ranh giới của cả bản sửa, và là chỗ nó dễ hỏng nhất: `upsertLine` dùng
     * `customer.on` cho CẢ HAI việc — tra bảng giá và ghi `ngay_ap_dung`. Quy đổi
     * cả cụm thay vì chỉ ngày TRA là dời ngày áp dụng của mọi dòng thừa kế về hôm
     * nay, và `ngay_ap_dung` nằm trong phép so trạng thái (`0180`) nên cả bảng
     * nhảy sang *Chỉnh sửa* vì một lý do không ai nêu.
     */
    const d = await banMoiDongNgayCu();
    const dong = dongCua(d.v2, d.productId);

    const r = await patch(`/policies/${d.v2Id}/lines/${dong['id']}`, {
      wholesalePrice: dong['wholesalePrice'],
      cpbh: dong['cpbh'],
      ngayApDung: '2020-06-01',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const sau = dongCua((await get(`/policies/${d.v2Id}`)).body, d.productId);
    expect(String(sau['ngayApDung'])).toContain('2020-06-01');
    expect(sau['companyPrice']).toBe('130000');
  });

  it('THÊM một dòng đề ngày quá khứ cũng lấy giá hiện hành', async () => {
    // `addLine` và `updateLine` đi cùng một hộp thoại, nên chúng phải đi cùng một
    // luật — để lệch là người dùng thấy hai câu trả lời trong cùng một biểu mẫu.
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [] });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    await doiGiaHomNay(productId, '130000');

    const them = await post(`/policies/${d.body.id}/lines`, {
      productId,
      wholesalePrice: '90000',
      cpbh: ['5000'],
      ngayApDung: '2020-06-01',
    });
    expect(them.status, JSON.stringify(them.body)).toBe(201);
    const l = dongCua(them.body, productId);
    expect(l['companyPrice']).toBe('130000');
    expect(String(l['ngayApDung'])).toContain('2020-06-01');
  });

  it('XEM TRƯỚC và LƯU cho CÙNG một con số', async () => {
    /*
     * Bất biến mà hai ca trên không nói được khi đứng riêng: hộp thoại bày con số
     * rồi lượt lưu ngay sau đó ghi con số. Lệch nhau là đúng lỗi `0193` sinh ra để
     * chống — và nó lệch được theo cả hai chiều, nên hỏi thẳng bằng một phép so.
     */
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [] });
    await doiGiaHomNay(productId, '170000');

    const xem = await get(
      `/policies/${d.body.id}/threshold-preview?productId=${productId}&ngayApDung=2020-06-01`,
    );
    const them = await post(`/policies/${d.body.id}/lines`, {
      productId, wholesalePrice: '90000', cpbh: ['5000'], ngayApDung: '2020-06-01',
    });
    expect(dongCua(them.body, productId)['companyPrice']).toBe(xem.body.companyPrice);
  });

  it('RANH GIỚI: dòng đề ngày TƯƠNG LAI vẫn lấy bảng giá của ngày ấy', async () => {
    // Vế `0201` đã dựng và `0203` không được làm hỏng: `max(ngày dòng, hôm nay)`,
    // không phải "luôn hôm nay".
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    await datGia(productId, '500000', '2030-01-01');
    const customerId = await makeCustomer();
    const d = await post('/policies', { customerId, lines: [] });
    await doiGiaHomNay(productId, '130000');

    const them = await post(`/policies/${d.body.id}/lines`, {
      productId, wholesalePrice: '90000', cpbh: ['5000'], ngayApDung: '2030-06-01',
    });
    expect(them.status, JSON.stringify(them.body)).toBe(201);
    expect(dongCua(them.body, productId)['companyPrice']).toBe('500000');
  });

  it('RANH GIỚI: `create` mang sẵn `lines` thì VẪN theo `0029`', async () => {
    /*
     * Chỗ duy nhất còn tra theo đúng `ngay_ap_dung`, và nó có chủ ý — ghim lại để
     * lượt đổi sau (nếu có) là một quyết định chứ không phải một hệ quả kèm theo.
     *
     * Người dùng không có đường nào nhìn thấy hai câu trả lời: cả *Lập hồ sơ* lẫn
     * *Lập phiên bản mới* đều gửi `lines: []` rồi thêm từng dòng bằng `addLine`
     * (có ca kiểm quét mã nguồn giao diện giữ cho điều đó đúng). Đường này chỉ
     * còn API và bộ nạp dữ liệu đi qua.
     */
    const { productId } = await sanPhamNhomRieng('100000', '2020-01-01');
    const customerId = await makeCustomer();
    await doiGiaHomNay(productId, '130000');

    const d = await post('/policies', {
      customerId,
      lines: [line(productId, { ngayApDung: '2020-06-01' })],
    });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    expect(dongCua(d.body, productId)['companyPrice']).toBe('100000');
  });
});

// =============================================================================
// `0204`/`0213` — DÒNG *Chỉnh sửa* NÓI RA BẢN TRƯỚC CỦA NÓ
// =============================================================================

/**
 * `0204`, khách hàng chốt 12/09: bấm vào nhãn *Chỉnh sửa* thì mở ra một bảng.
 * `0213`, chốt 20/09: bảng ấy bày **cả dòng ở bản trước**, ô đã đổi bôi vàng —
 * thay cho danh sách *"đổi những gì"*.
 *
 * Phần máy chủ là `SQL_BAN_TRUOC_TRA_VE`, và điều đáng canh nhất KHÔNG phải nội
 * dung từng ô mà là **nó với nhãn *Chỉnh sửa* phải luôn đi cùng nhau**: một dòng
 * mang nhãn mà bảng vắng mặt (hoặc ngược lại) là dấu hiệu hai câu trả lời đã trôi
 * khỏi nhau.
 */
describe('`0204` bảng bản trước của dòng', () => {
  const dongCua = (body: { lines: Record<string, unknown>[] }, productId: string) =>
    body.lines.find((l) => l['productId'] === productId)!;
  const banTruoc = (body: { lines: Record<string, unknown>[] }, productId: string) =>
    dongCua(body, productId)['banTruoc'] as Record<string, unknown> | null;
  const oDoi = (body: { lines: Record<string, unknown>[] }, productId: string) =>
    (banTruoc(body, productId)?.['doi'] ?? []) as string[];

  /** Bản đang hiệu lực + phiên bản mới chưa sửa gì. */
  const banMoi = async () => {
    const d = await draft();
    // Dòng THỨ HAI, để ca bất biến có một dòng thừa kế đem rút (xoá MỀM).
    const spPhu = await makeProduct();
    expect((await post(`/policies/${d.id}/lines`, line(spPhu))).status).toBe(201);
    await runToActive(d);
    const v2 = await post('/policies', {
      customerId: d.customerId,
      mode: 'NEW_VERSION',
      lines: [],
    });
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    return { ...d, spPhu, v2Id: v2.body.id as string, v2: v2.body };
  };

  const suaDong = async (hoSoId: string, lineId: string, than: object) => {
    const r = await patch(`/policies/${hoSoId}/lines/${lineId}`, than);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body;
  };

  it('SỬA GIÁ BÁN BUÔN: ba ô đổi theo, vì hai con số DẪN XUẤT từ nó', async () => {
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    const sau = await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: '80000',
      cpbh: cu['cpbh'],
      ngayApDung: String(cu['ngayApDung']).slice(0, 10),
    });

    /*
     * BA Ô, không một — và đó là điều `0213` phải nói ra.
     *
     * Giá thu về = giá bán buôn − CPBH, còn tỷ lệ CK tính ngược từ giá thu về.
     * Đổi một con số TDV gõ thì hai con số dẫn xuất đổi theo, và cả ba đều là
     * *"thông tin bị đổi"* theo đúng câu khách hàng viết — nên cả ba bôi vàng.
     *
     * Nhãn *Chỉnh sửa* thì vẫn chỉ xét năm trường TDV gõ (`0180`, `0202`): hai
     * tập khác nhau, hai câu hỏi khác nhau, và ca BẤT BIẾN bên dưới canh chỗ
     * chúng gặp nhau.
     */
    expect(oDoi(sau, d.productId)).toEqual(['wholesalePrice', 'netPrice', 'discountRate']);
    expect(banTruoc(sau, d.productId)!['wholesalePrice']).toBe('90000');
  });

  it('CPBH trả về MẢNG, không phải tổng', async () => {
    /*
     * Hai mảng khác nhau vẫn có thể cùng tổng — `[5000]` → `[3000, 2000]`. Gộp
     * thành một con số ở máy chủ là bày ra *"CPBH 5.000 → 5.000"*: một thay đổi
     * tự nói rằng nó không có thay đổi nào, ở đúng chỗ người ta mở ra để hiểu vì
     * sao dòng bị đánh dấu.
     */
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    const sau = await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: cu['wholesalePrice'],
      cpbh: ['3000', '2000'],
      ngayApDung: String(cu['ngayApDung']).slice(0, 10),
    });

    /*
     * ĐÚNG MỘT Ô, và đây là ca phân biệt sắc nhất của cả khối: hai mảng CÙNG
     * TỔNG, nên giá thu về và tỷ lệ CK **không đổi** — khác hẳn ca sửa giá bán
     * buôn ngay trên, nơi hai con số dẫn xuất đổi theo.
     *
     * Tức phép so chạy trên CHÍNH cột `cpbh` (`text[]`), không chạy trên tổng
     * của nó. Một bản so bằng `cpbh_total` sẽ cho mảng rỗng ở đây, và dòng mang
     * nhãn *Chỉnh sửa* mà mở ra không ô nào vàng.
     */
    expect(oDoi(sau, d.productId)).toEqual(['cpbh']);
    expect(banTruoc(sau, d.productId)!['cpbh']).toEqual(['5000']);
  });

  it('NHIỀU trường cùng đổi thì đủ cả, theo thứ tự khai', async () => {
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    const sau = await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: '80000',
      cpbh: ['7000'],
      note: 'ghi chu moi',
      ngayApDung: '2030-01-01',
    });

    /*
     * Thứ tự là thứ tự KHAI ở `TRUONG_BAY_BAN_TRUOC`, tức thứ tự cột của bảng
     * sản phẩm — `0213` xếp lại so với `0204` cho khớp mắt người đọc.
     *
     * `note` KHÔNG có mặt dù lượt sửa này có gõ ghi chú mới: `0215` gỡ nó khỏi
     * cả hai danh sách (khách hàng chốt 21/09). Ca dưới cùng khối này canh vế
     * mạnh hơn — ghi chú đổi MỘT MÌNH thì dòng không đổi cả trạng thái.
     */
    expect(oDoi(sau, d.productId)).toEqual([
      'ngayApDung',
      'wholesalePrice',
      'cpbh',
      // `0214` — `[5000]` → `[7000]` đổi CẢ mảng lẫn tổng, nên hai ô cùng vàng.
      // Khác hẳn ca ngay trên, nơi mảng đổi mà tổng giữ nguyên.
      'cpbhTotal',
      'netPrice',
      'discountRate',
    ]);
  });

  it('NGÀY trả về dạng `YYYY-MM-DD` — giao diện tự định dạng', async () => {
    // Hình dạng ấy là một phần của hợp đồng chứ không phải chi tiết dựng câu
    // SQL: `chieuDoi` bên giao diện quy CẢ HAI vế về ngày lịch Việt Nam rồi mới
    // so, và nó làm được điều đó vì biết vế này luôn là `YYYY-MM-DD`.
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    const sau = await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: cu['wholesalePrice'],
      cpbh: cu['cpbh'],
      ngayApDung: '2030-01-01',
    });

    expect(String(banTruoc(sau, d.productId)!['ngayApDung'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('`0215` CHỈ ĐỔI GHI CHÚ: dòng GIỮ NGUYÊN trạng thái, không có bản trước', async () => {
    /*
     * Khách hàng chốt 21/09, nguyên văn: *"ghi chú không phải là trường để đánh
     * giá sản phẩm có bị chỉnh sửa không, nếu chỉ có ghi chú thay đổi, sản phẩm
     * sẽ vẫn giữ nguyên trạng thái"*.
     *
     * Đảo một phần chốt `07/09` (*"bị sửa là đổi BẤT KỲ dữ liệu nào người lập
     * nhập"*). Ca này canh CẢ BA hệ quả của một luật, vì chúng sinh ra từ cùng
     * một biểu thức `SQL_DONG_KHAC_BAN_TRUOC` và sẽ cùng sai hoặc cùng đúng:
     * nhãn · *Tỷ lệ CK cũ* · bản trước. Chỉ kiểm nhãn thì một bản sửa gỡ `note`
     * khỏi đúng một trong ba chỗ vẫn xanh.
     *
     * Ghi chú PHẢI ghi được vào thật — nếu không thì ca này xanh vì lượt ghi
     * hỏng chứ không vì luật đúng, nên có phép kiểm giá trị ở cuối.
     */
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    const sau = await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: cu['wholesalePrice'],
      cpbh: cu['cpbh'],
      ngayApDung: String(cu['ngayApDung']).slice(0, 10),
      note: 'ghi chu chi de nguoi duyet doc',
    });

    const l = dongCua(sau, d.productId);
    expect(l['trangThai'], 'ghi chú một mình không làm dòng thành *Chỉnh sửa*').toBe(
      'DANG_AP_DUNG',
    );
    expect(l['discountRateTruoc']).toBeNull();
    expect(l['banTruoc']).toBeNull();
    expect(l['note'], 'ghi chú phải ghi được thật').toBe('ghi chu chi de nguoi duyet doc');
  });

  it('`0213` bày CẢ những ô KHÔNG đổi, gồm ba con số DẪN XUẤT', async () => {
    /*
     * Khác biệt của `0213` với `0204`, và là cả điểm của yêu cầu: câu hỏi đổi từ
     * *"đổi những gì"* sang *"trước đó dòng này thế nào"*, và câu sau chỉ đọc
     * được khi có đủ ngữ cảnh.
     *
     * BA CON SỐ DẪN XUẤT là vế đáng canh nhất: `net_price` với `over_threshold`
     * là cột SINH, `discount_rate` với `threshold_snap` là cột LƯU — nên bản
     * trước đã có sẵn chúng trong CSDL, và giao diện KHÔNG phải tính lại. Thiếu
     * chúng thì người duyệt đọc được giá bán buôn cũ mà không biết tỷ lệ chiết
     * khấu khi ấy là bao nhiêu — đúng con số cả tờ giấy nói về.
     */
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    const sau = await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: '80000',
      cpbh: cu['cpbh'],
      ngayApDung: String(cu['ngayApDung']).slice(0, 10),
    });

    const b = banTruoc(sau, d.productId)!;
    expect(Object.keys(b).sort()).toEqual(
      [
        'cpbh',
        // `0214` — tổng đi cùng mảng: hàng *bản trước* phải khớp CỘT với hàng
        // trên, và bảng có cột *CPBH* mang tổng trước dải cột từng khoản.
        'cpbhTotal',
        'companyPrice',
        'discountRate',
        'doi',
        'netPrice',
        'ngayApDung',
        // `note` ĐÃ RỜI KHỎI ĐÂY ở `0215`: dấu tam giác mang đúng một tin —
        // *lớn hơn* hay *bé hơn* — và câu hỏi ấy không có nghĩa với một câu chữ.
        'threshold',
        'wholesalePrice',
      ].sort(),
    );
    // Giá trị của bản TRƯỚC, không phải của dòng hiện tại.
    expect(b['wholesalePrice']).toBe('90000');
    expect(b['netPrice'], 'giá thu về của bản trước').not.toBe(
      dongCua(sau, d.productId)['netPrice'],
    );
  });

  it('BẤT BIẾN: nhãn *Chỉnh sửa* và bảng chi tiết luôn đi CÙNG NHAU', async () => {
    /*
     * CA ĐÁNG GIÁ NHẤT của chặng, và là lý do `TRUONG_SO_VOI_BAN_TRUOC` tồn tại.
     *
     * Nhãn trạng thái và danh sách thay đổi là hai câu trả lời cho cùng một câu
     * hỏi. Gõ tay hai biểu thức SQL cho cùng năm trường thì thêm một trường vào
     * phép so mà quên bảng chi tiết là một dòng mang nhãn *Chỉnh sửa* với một
     * bảng rỗng — người dùng bấm vào và không thấy gì, không mã lỗi nào.
     *
     * Quét MỌI dòng của hồ sơ chứ không kiểm một dòng dựng sẵn: chỗ hỏng sẽ là
     * một trường cụ thể nào đó, và một ca dựng sẵn chỉ đi qua trường nó chọn.
     */
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: '80000',
      cpbh: cu['cpbh'],
      ngayApDung: String(cu['ngayApDung']).slice(0, 10),
    });
    // Thêm một dòng *Bổ sung* để lượt quét đi qua nhánh ấy.
    const spMoi = await makeProduct();
    await post(`/policies/${d.v2Id}/lines`, line(spMoi));

    /*
     * VÀ MỘT DÒNG THỪA KẾ VỪA SỬA VỪA RÚT — nhánh này ca kiểm bản đầu KHÔNG đi
     * qua, và lượt phá lại chỉ ra điều đó: bỏ cả ba vế gác của
     * `SQL_THAY_DOI_TRA_VE` mà ca vẫn xanh, vì mọi dòng nó dựng đều có nhãn khớp
     * sẵn với phép so. Hai câu trả lời chỉ tách khỏi nhau ở chỗ nhãn KHÔNG đến từ
     * phép so — `DA_XOA`, và hồ sơ đã có hiệu lực (ca riêng bên dưới).
     *
     * PHẢI LÀ DÒNG THỪA KẾ. Lượt phá lại thứ hai bắt được chính chỗ này: bản đầu
     * rút một dòng vừa THÊM, mà `0186` xoá HẲN dòng *Bổ sung* — không có hàng
     * `da_xoa` nào để mà đo, và ca lại xanh.
     */
    const cuRut = dongCua(d.v2, d.spPhu);
    await suaDong(d.v2Id, cuRut['id'] as string, {
      wholesalePrice: '70000',
      cpbh: cuRut['cpbh'],
      ngayApDung: String(cuRut['ngayApDung']).slice(0, 10),
    });
    expect((await del(`/policies/${d.v2Id}/lines/${cuRut['id']}`)).status).toBe(200);

    const hs = (await get(`/policies/${d.v2Id}`)).body as {
      lines: Record<string, unknown>[];
    };
    expect(hs.lines.length).toBeGreaterThanOrEqual(2);
    for (const l of hs.lines) {
      const coBang = l['banTruoc'] !== null && l['banTruoc'] !== undefined;
      expect(
        coBang,
        `dòng ${l['productCode']} mang nhãn ${l['trangThai']} mà bảng chi tiết ` +
          `${coBang ? 'CÓ' : 'RỖNG'} — hai câu trả lời đã trôi khỏi nhau`,
      ).toBe(l['trangThai'] === 'CHINH_SUA');
    }
  });

  it('dòng *Bổ sung* và *Đang áp dụng* trả `null`, không phải một đối tượng rỗng', async () => {
    /*
     * Giao diện hỏi *"có gì để mở không"* bằng chính sự vắng mặt của đối tượng
     * này. Một `{}` ở đây thì `banTruocCua()` trả về nó, nhãn thành nút bấm
     * được, và bảng mở ra tám ô dấu gạch — một câu trả lời trống cho một câu hỏi
     * không có nghĩa với dòng ấy.
     */
    const d = await banMoi();
    expect(dongCua(d.v2, d.productId)['banTruoc']).toBeNull();

    const dauTien = await draft();
    expect(dongCua(dauTien.body, dauTien.productId)['trangThai']).toBe('BO_SUNG');
    expect(dongCua(dauTien.body, dauTien.productId)['banTruoc']).toBeNull();
  });

  it('HỒ SƠ CÓ HIỆU LỰC: bảng chi tiết tắt cùng lúc với *Tỷ lệ CK cũ*', async () => {
    /*
     * Ba vế gác của `SQL_THAY_DOI_TRA_VE` phải khớp từng chữ với
     * `SQL_TY_LE_CK_TRUOC`. Lệch một vế là cùng một hàng vừa nói *"tỷ lệ CK cũ
     * 15%"* vừa nói *"không có thay đổi nào"*.
     */
    const d = await banMoi();
    const cu = dongCua(d.v2, d.productId);
    await suaDong(d.v2Id, cu['id'] as string, {
      wholesalePrice: '80000',
      cpbh: cu['cpbh'],
      ngayApDung: String(cu['ngayApDung']).slice(0, 10),
    });
    await runToActive({ id: d.v2Id });

    const l = dongCua((await get(`/policies/${d.v2Id}`)).body, d.productId);
    expect(l['trangThai']).toBe('DANG_AP_DUNG');
    expect(l['discountRateTruoc']).toBeNull();
    expect(l['banTruoc']).toBeNull();
  });

  it('BẢN IN KHÔNG ĐỔI GÌ: `internal.controller` không mang trường này', async () => {
    /*
     * Khách hàng chốt 12/09 từng chữ — *"bản in docx không cần sửa gì cả"*. Cửa
     * duy nhất `document` và `reporting` đọc hồ sơ là đường nội bộ này (AD-02),
     * nên đây là chỗ canh được câu ấy: thêm trường vào đây là mở đường cho một
     * cột mới lặng lẽ đi ra tờ giấy ở lượt sửa mẫu tiếp theo.
     */
    const d = await banMoi();
    const noiBo = await (await http(app))
      .get(`/internal/policies/${d.v2Id}`)
      .set('X-Service-Token', mintServiceToken('document'));
    expect(noiBo.status, JSON.stringify(noiBo.body)).toBe(200);
    for (const l of noiBo.body.lines as Record<string, unknown>[]) {
      expect(Object.keys(l)).not.toContain('banTruoc');
      expect(Object.keys(l)).not.toContain('ban_truoc');
    }
  });
});

// =============================================================================
// `0225` — trạng thái *Sale Admin sửa bản cứng*
// =============================================================================

/**
 * Khách hàng chốt 28/09: Kế toán trả hồ sơ về Sale Admin (*Yêu cầu in lại*) thì
 * hồ sơ mang trạng thái RIÊNG, phân biệt với *Sale Admin đang xử lý*. Mọi ca đi
 * đường HTTP thật tới `CHO_KT_L2` rồi bấm in lại — không vặn `status` bằng SQL,
 * vì thứ phải kiểm là chính lượt chuyển trạng thái ấy.
 */
describe('`0225` Sale Admin sửa bản cứng', () => {
  const tepSa = (id: string, kind: 'SCAN' | 'BAN_MEM', key = `${kind}/${id}-${uniq('t')}.pdf`) =>
    post(`/policies/${id}/attachments`, { kind, fileName: `${kind}.pdf`, objectKey: key }, 'sa01');

  /** Đi thật tới `CHO_KT_L2` rồi Kế toán yêu cầu in lại. */
  const inLai = async () => {
    const d = await draft();
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    expect((await tepSa(d.id, 'SCAN')).status).toBe(201);
    expect((await tepSa(d.id, 'BAN_MEM')).status).toBe(201);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    const r = await act(d.id, 'KT_REQUEST_REPRINT', 'kt01', { reason: 'Thiếu dấu giáp lai' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return d;
  };

  const trangThai = async (id: string) => (await get(`/policies/${id}`, 'sa01')).body.status as string;

  it('yêu cầu in lại → SA sửa bản cứng, KHÔNG còn là SA đang xử lý', async () => {
    const d = await inLai();
    expect(await trangThai(d.id)).toBe('SA_SUA_BAN_CUNG');
  });

  it('nhật ký ghi đúng đích của lượt in lại', async () => {
    const d = await inLai();
    const ev = (await get(`/policies/${d.id}/events`, 'sa01')).body as {
      action: string; fromStatus: string; toStatus: string;
    }[];
    const cuoi = ev[ev.length - 1]!;
    expect(cuoi).toMatchObject({
      action: 'KT_REQUEST_REPRINT', fromStatus: 'CHO_KT_L2', toStatus: 'SA_SUA_BAN_CUNG',
    });
  });

  it('có HẠN 14 ngày — tách trạng thái không được tắt SLA của ca này', async () => {
    const d = await inLai();
    const r = await withAdminDb((c) =>
      c.query<{ han: string | null }>(`SELECT sla_due_at AS han FROM pol.policy WHERE id = $1`, [d.id]),
    );
    expect(r.rows[0]!.han, 'không có hạn — `isWaiting` không biết trạng thái mới').not.toBeNull();
  });

  it('Sale Admin gỡ bản scan bị chê, tải bản mới, rồi BÀN GIAO LẠI → KT duyệt bản cứng', async () => {
    const d = await inLai();
    const tep = (await get(`/policies/${d.id}`, 'sa01')).body.attachments as { id: string; kind: string }[];
    const scanCu = tep.find((t) => t.kind === 'SCAN')!;
    // Gỡ và tải lên ĐƯỢC ở trạng thái mới — viết chốt tệp bằng `=== 'SA_DANG_XU_LY'`
    // là khoá Sale Admin khỏi đúng ca họ phải thay bản scan.
    expect((await del(`/policies/${d.id}/attachments/${scanCu.id}`, 'sa01')).status).toBe(200);
    expect((await tepSa(d.id, 'SCAN')).status).toBe(201);
    expect((await tepSa(d.id, 'BAN_MEM')).status).toBe(201);
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    expect(await trangThai(d.id)).toBe('CHO_KT_L2');
  });

  it('màn hình cho Sale Admin ghi CẢ HAI loại tệp ở trạng thái mới', async () => {
    const d = await inLai();
    const b = (await get(`/policies/${d.id}`, 'sa01')).body;
    expect(b.loaiTepGhiDuoc).toEqual(['SCAN', 'BAN_MEM']);
  });

  it('bàn giao lại vẫn đòi bản scan — gỡ hết thì 409 SCAN_REQUIRED', async () => {
    const d = await inLai();
    const tep = (await get(`/policies/${d.id}`, 'sa01')).body.attachments as { id: string; kind: string }[];
    for (const t of tep.filter((x) => x.kind === 'SCAN')) {
      expect((await del(`/policies/${d.id}/attachments/${t.id}`, 'sa01')).status).toBe(200);
    }
    const r = await act(d.id, 'SA_HANDOVER', 'sa01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SCAN_REQUIRED');
  });

  it('TBP hoàn duyệt được ở trạng thái mới (chốt 28/09)', async () => {
    const d = await inLai();
    expect((await act(d.id, 'TBP_RECALL', 'tbp01', { reason: 'Ký nhầm' })).status).toBe(200);
    expect(await trangThai(d.id)).toBe('YEU_CAU_CHINH_SUA');
  });

  it('Kế toán KHÔNG làm được gì ở trạng thái mới — việc đang ở bàn Sale Admin', async () => {
    const d = await inLai();
    for (const a of ['KT_RECEIVE_L2', 'KT_RETURN_L2', 'KT_REQUEST_REPRINT']) {
      const r = await act(d.id, a, 'kt01', { reason: 'x' });
      expect(r.status, a).toBe(409);
    }
  });

  it('khối lý do HIỆN ở trạng thái mới — đó là việc Sale Admin phải làm', async () => {
    const d = await inLai();
    const ly = (await get(`/policies/${d.id}`, 'sa01')).body.lyDoTraLai;
    expect(ly?.lyDo).toBe('Thiếu dấu giáp lai');
    expect(ly?.hanhDong).toBe('KT_REQUEST_REPRINT');
  });

  it('cảnh báo "bản scan cũ" CHỈ ở trạng thái mới, không ở lượt làm bản cứng lần đầu', async () => {
    const d = await inLai();
    expect((await get(`/policies/${d.id}`, 'sa01')).body.banScanCu).toBe(true);

    // Hoàn duyệt → gửi lại → tới bàn Sale Admin LẦN ĐẦU của vòng mới: bản scan
    // từ vòng trước còn đó, nhưng không còn là bản "Kế toán vừa chê".
    expect((await act(d.id, 'TBP_RECALL', 'tbp01', { reason: 'Ký nhầm' })).status).toBe(200);
    expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(200);
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);
    expect((await act(d.id, 'KT_RECEIVE_L1', 'kt01')).status).toBe(200);
    const b = (await get(`/policies/${d.id}`, 'sa01')).body;
    expect(b.status).toBe('SA_DANG_XU_LY');
    expect(b.banScanCu).toBe(false);
  });

  it('hộp việc của Sale Admin có hồ sơ ở trạng thái mới', async () => {
    const d = await inLai();
    expect(await hetHopViec('sa01')).toContain(d.id);
  });

  it('khách đang có hồ sơ ở trạng thái mới thì KHÔNG lập thêm được (một hồ sơ đang xử lý)', async () => {
    const d = await inLai();
    const r = await post('/policies', { customerId: d.customerId, lines: [line(await makeProduct())] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('POLICY_IN_PROGRESS');
  });
});
