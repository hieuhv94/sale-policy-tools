/**
 * `0263` — tệp đính kèm của bình luận, tầng HTTP với Postgres + MinIO thật.
 *
 * Sáu service chạy thật và nói chuyện bằng HTTP theo đúng đường sản phẩm: `policy` hỏi
 * `document` tệp là gì trước khi gắn, `document` hỏi `policy` ai đọc được và tệp nào
 * phải dọn. Mỗi `describe` là một nhóm *Tệp* của danh mục ở `agents/KE-HOACH-BINH-LUAN.md`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { FilesService, Storage } from '@csbh/document/testing';
import { createTestWorker, SlaService } from '@csbh/sla-worker/testing';
import { GIOI_HAN_BINH_LUAN } from '@csbh/domain-policy';
import { BinhLuanService } from '@csbh/policy/testing';
import type { TestingModule } from '@nestjs/testing';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootDocumentListening,
  bootIdentityListening,
  bootPolicyListening,
  clearAccountCache,
  clearScopeCache,
  http,
  maDuyNhat,
  mstDuyNhat,
  phanCongMacDinh,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZBLT';
const NGUOI = ['tdv01', 'tdv02', 'tbp01', 'kt01', 'sa01', 'admin01', 'bld01'];

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let doc: INestApplication;
let worker: TestingModule;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const goi = async (method: 'get' | 'post' | 'patch' | 'delete', path: string, who: string, body?: object) => {
  const r = (await http(policy))[method](path).set('Authorization', `Bearer ${tok[who]}`);
  return body ? r.send(body) : r;
};
const goiDoc = async (method: 'get' | 'delete', path: string, who: string) =>
  (await http(doc))[method](path).set('Authorization', `Bearer ${tok[who]}`);
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
      name: 'Nha thuoc tep binh luan',
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

const hoSo = async (buoc: 'nhap' | 'gui' | 'ky' = 'nhap') => {
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
  return pid;
};

// --- Tệp mẫu: đúng số nhận dạng đầu tệp của từng loại -----------------------

const dem = (n: number) => Buffer.alloc(n, 0x20);
const MAU: Record<string, { buf: Buffer; ten: string; loai: string }> = {
  pdf: { buf: Buffer.concat([Buffer.from('%PDF-1.4\n'), dem(64)]), ten: 'bao-gia.pdf', loai: 'application/pdf' },
  jpg: { buf: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), dem(64)]), ten: 'anh.jpg', loai: 'image/jpeg' },
  png: {
    buf: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), dem(64)]),
    ten: 'anh.png',
    loai: 'image/png',
  },
  webp: {
    buf: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBPVP8 '), dem(64)]),
    ten: 'anh.webp',
    loai: 'image/webp',
  },
  docx: {
    buf: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), dem(30), Buffer.from('word/document.xml'), dem(30)]),
    ten: 'bien-ban.docx',
    loai: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    buf: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), dem(30), Buffer.from('xl/workbook.xml'), dem(30)]),
    ten: 'bang-tinh.xlsx',
    loai: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

const taiLen = async (
  pid: string,
  who: string,
  m: { buf: Buffer; ten: string } = MAU['pdf']!,
  q: { ownerKind?: string; purpose?: string } = {},
) =>
  (await http(doc))
    .post(
      `/files?ownerKind=${q.ownerKind ?? 'POLICY'}&ownerId=${pid}&purpose=${q.purpose ?? 'BINH_LUAN'}&fileName=${encodeURIComponent(m.ten)}`,
    )
    .set('Authorization', `Bearer ${tok[who]}`)
    .attach('file', m.buf, { filename: m.ten, contentType: 'application/octet-stream' });

const tepCua = async (pid: string, who = 'tdv01', m?: { buf: Buffer; ten: string }) => {
  const r = await taiLen(pid, who, m);
  if (r.status !== 201) throw new Error(`tải tệp hỏng: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id as string;
};

const viet = (pid: string, noiDung: string, tep: string[], who = 'tdv01', extra: object = {}) =>
  goi('post', `/policies/${pid}/binh-luan`, who, { maGui: randomUUID(), noiDung, tep, ...extra });

/** Tải nội dung tệp qua đúng hai bước của giao diện: xin liên kết, rồi mở. */
const doc_ = async (fileId: string, who: string) => {
  const l = await goiDoc('get', `/files/${fileId}/link`, who);
  if (l.status !== 200) return l.status;
  const c = await (await http(doc)).get(`${l.body.url}&xem=1`).set('Authorization', `Bearer ${tok[who]}`);
  return c.status;
};

const dong = (fileId: string) =>
  withAdminDb(async (c) =>
    (
      await c.query<{ deleted_at: Date | null; object_key: string }>(
        `SELECT deleted_at, object_key FROM doc.stored_file WHERE id = $1`,
        [fileId],
      )
    ).rows[0]!,
  );
const lui = (fileId: string, gio: number) =>
  withAdminDb((c) =>
    c.query(`UPDATE doc.stored_file SET uploaded_at = now() - make_interval(hours => $2) WHERE id = $1`, [
      fileId,
      gio,
    ]),
  );
const conTrenKho = async (fileId: string) => doc.get(Storage).exists((await dong(fileId)).object_key);

const cleanup = () =>
  withAdminDb(async (c) => {
    await c.query(`DELETE FROM pol.outbox`);
    await c.query(
      `DELETE FROM doc.stored_file WHERE purpose = 'BINH_LUAN' AND owner_id IN (
         SELECT p.id FROM pol.policy p JOIN cus.customer k ON k.id = p.customer_id WHERE k.code LIKE $1)`,
      [`${P}%`],
    );
    await c.query(`ALTER TABLE pol.policy DISABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(
      `DELETE FROM pol.policy WHERE customer_id IN (SELECT id FROM cus.customer WHERE code LIKE $1)`,
      [`${P}%`],
    );
    await c.query(`ALTER TABLE pol.policy ENABLE TRIGGER trg_forbid_delete_rejected`);
    await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.product_group WHERE code LIKE $1`, [`${P}%`]);
    await c.query(`DELETE FROM cat.outbox`);
  });

/** Tệp bình luận mồ côi (hồ sơ đã bị một tệp khác xoá) làm lượt dọn hỏi `policy` về chúng — dọn trước. */
const donRacCu = () =>
  withAdminDb((c) =>
    c.query(
      `UPDATE doc.stored_file SET deleted_at = now(), delete_reason = 'dọn rác bộ kiểm'
        WHERE purpose = 'BINH_LUAN' AND deleted_at IS NULL`,
    ),
  );

beforeAll(async () => {
  for (const [boot, gan] of [
    [bootIdentityListening, (a: INestApplication) => (identity = a)],
    [bootCatalogListening, (a: INestApplication) => (catalog = a)],
    [bootCustomerListening, (a: INestApplication) => (customer = a)],
    [bootPolicyListening, (a: INestApplication) => (policy = a)],
    [bootDocumentListening, (a: INestApplication) => (doc = a)],
  ] as const) {
    const b = await boot();
    gan(b.app);
    restores.push(b.restore);
  }
  await clearAccountCache();
  await clearScopeCache();
  await cleanup();
  await donRacCu();
  for (const u of NGUOI) tok[u] = await accessTokenFor(identity, u, SEED_PW);
  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom tep binh luan' });
  groupCode = g.body.code as string;
  worker = await createTestWorker();
}, 120_000);

afterAll(async () => {
  await cleanup();
  await worker?.close();
  for (const a of [doc, policy, customer, catalog, identity]) await a?.close();
  for (const r of restores.reverse()) r();
});

// =============================================================================

describe('`0263` tải tệp lên — loại, cỡ, người', () => {
  it('nhận đúng sáu loại, nhận dạng bằng byte đầu tệp chứ không bằng tên', async () => {
    const pid = await hoSo();
    for (const [k, m] of Object.entries(MAU)) {
      const r = await taiLen(pid, 'tdv01', m);
      expect(r.status, k).toBe(201);
      expect(r.body.contentType, k).toBe(m.loai);
      expect(r.body.purpose).toBe('BINH_LUAN');
    }
  });

  it('`.docx` và `.xlsx` tách được nhau; zip không mang mục nào của hai loại thì KHÔNG nhận', async () => {
    const pid = await hoSo();
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), dem(30), Buffer.from('ppt/presentation.xml')]);
    const r = await taiLen(pid, 'tdv01', { buf: zip, ten: 'trinh-chieu.docx' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('`.exe` đổi đuôi thành `.png` → từ chối', async () => {
    const pid = await hoSo();
    const r = await taiLen(pid, 'tdv01', { buf: Buffer.concat([Buffer.from('MZ'), dem(64)]), ten: 'anh.png' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('đúng 10MB → nhận; 10MB + 1 byte → FILE_TOO_LARGE (trần riêng của bình luận, không phải 20MB)', async () => {
    const pid = await hoSo();
    const tran = GIOI_HAN_BINH_LUAN.coTepToiDaByte;
    expect(tran).toBe(10 * 1024 * 1024);
    const dau = Buffer.from('%PDF-1.4\n');
    const vua = Buffer.concat([dau, dem(tran - dau.length)]);
    expect((await taiLen(pid, 'tdv01', { buf: vua, ten: 'vua.pdf' })).status).toBe(201);
    const qua = await taiLen(pid, 'tdv01', { buf: Buffer.concat([vua, Buffer.from(' ')]), ten: 'qua.pdf' });
    expect(qua.status).toBe(400);
    expect(qua.body.code).toBe('FILE_TOO_LARGE');
    // Mục đích khác GIỮ trần 20MB: tệp 10MB+1 của hồ sơ vẫn nhận.
    const hs = await taiLen(pid, 'tdv01', { buf: Buffer.concat([vua, Buffer.from(' ')]), ten: 'giay-to.pdf' }, { purpose: 'HO_SO' });
    expect(hs.status).toBe(201);
  }, 60_000);

  it('tệp rỗng → FILE_EMPTY', async () => {
    const pid = await hoSo();
    const r = await taiLen(pid, 'tdv01', { buf: Buffer.alloc(0), ten: 'rong.pdf' });
    expect(r.status).toBe(400);
  });

  it('Ban lãnh đạo tải được tệp BÌNH LUẬN, và CHỈ tệp bình luận', async () => {
    const pid = await hoSo('gui');
    expect((await taiLen(pid, 'bld01')).status).toBe(201);
    for (const purpose of ['HO_SO', 'SCAN']) {
      const r = await taiLen(pid, 'bld01', MAU['pdf'], { purpose });
      expect(r.status, purpose).toBe(403);
      expect(r.body.code).toBe('ROLE_FORBIDDEN');
    }
  });

  it('ngoài phạm vi hồ sơ → 403: TDV khác, Kế toán CHƯA tới lượt, Quản trị', async () => {
    const pid = await hoSo('gui');
    expect((await taiLen(pid, 'tdv02')).status).toBe(403);
    // kt01 đã được chọn làm Kế toán nhưng TBP chưa ký (`da_qua_tbp`) — `mucDocHoSo` bốn
    // cột của document sẽ cho qua; luật của policy thì không.
    expect((await taiLen(pid, 'kt01')).status).toBe(403);
    expect((await taiLen(pid, 'admin01')).status).toBe(403);
    expect((await taiLen(pid, 'tbp01')).status).toBe(201);
  });

  it('Kế toán SAU khi TBP ký thì tải được', async () => {
    const pid = await hoSo('ky');
    expect((await taiLen(pid, 'kt01')).status).toBe(201);
  });

  it('chủ không phải HỒ SƠ (khách hàng) hay hồ sơ không tồn tại → 403', async () => {
    const pid = await hoSo();
    expect((await taiLen(pid, 'tdv01', MAU['pdf'], { ownerKind: 'CUSTOMER' })).status).toBe(403);
    expect((await taiLen(randomUUID(), 'tdv01')).status).toBe(403);
  });
});

describe('`0263` gắn tệp vào bình luận', () => {
  it('bình luận mang tệp trả về tên · loại · cỡ; chỉ có tệp không chữ vẫn gửi được', async () => {
    const pid = await hoSo();
    const a = await tepCua(pid, 'tdv01', MAU['png']);
    const b = await tepCua(pid, 'tdv01', MAU['xlsx']);
    const r = await viet(pid, '', [a, b]);
    expect(r.status).toBe(201);
    expect(r.body.binhLuan.tep).toEqual([
      { id: a, ten: 'anh.png', loai: 'image/png', co: MAU['png']!.buf.length },
      { id: b, ten: 'bang-tinh.xlsx', loai: MAU['xlsx']!.loai, co: MAU['xlsx']!.buf.length },
    ]);
    // Có mặt ở cả đường đọc trang lẫn đường hỏi thay đổi.
    const t = await goi('get', `/policies/${pid}/binh-luan`, 'tbp01');
    expect(t.status).toBe(403); // tbp01 chưa ở trên hồ sơ Nháp
    const t2 = await goi('get', `/policies/${pid}/binh-luan`, 'tdv01');
    expect(t2.body.binhLuan[0].tep.map((x: { id: string }) => x.id)).toEqual([a, b]);
    const d = await goi('get', `/policies/${pid}/binh-luan/thay-doi?tu=0`, 'tdv01');
    expect(d.body.thayDoi[0].tep).toHaveLength(2);
  });

  it('không chữ, không tệp → BINH_LUAN_RONG', async () => {
    const pid = await hoSo();
    const r = await viet(pid, '  ', []);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BINH_LUAN_RONG');
  });

  it('6 tệp → QUA_NHIEU_TEP, không bình luận nào được ghi', async () => {
    const pid = await hoSo();
    const ds: string[] = [];
    for (let i = 0; i < GIOI_HAN_BINH_LUAN.tepToiDa + 1; i++) ds.push(await tepCua(pid));
    const r = await viet(pid, 'nhiều tệp', ds);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('QUA_NHIEU_TEP');
    expect((await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body.binhLuan).toEqual([]);
    // Đúng 5 thì được.
    expect((await viet(pid, 'năm tệp', ds.slice(0, 5))).status).toBe(201);
  }, 60_000);

  it('TEP_KHONG_HOP_LE cho mọi tệp không phải của mình-ở-đây-chưa-gắn', async () => {
    const pid = await hoSo('gui');
    const khac = await hoSo();
    const cuaTbp = await tepCua(pid, 'tbp01');
    const hoSoKhac = await tepCua(khac, 'tdv01');
    const giayTo = (await taiLen(pid, 'tdv01', MAU['pdf'], { purpose: 'HO_SO' })).body.id as string;
    const daGan = await tepCua(pid, 'tdv01');
    expect((await viet(pid, 'gắn trước', [daGan])).status).toBe(201);
    const truong: [string, string[]][] = [
      ['tệp của người khác', [cuaTbp]],
      ['tệp của hồ sơ khác', [hoSoKhac]],
      ['tệp mục đích khác (giấy tờ hồ sơ)', [giayTo]],
      ['tệp đã gắn bình luận khác', [daGan]],
      ['id không tồn tại', [randomUUID()]],
      ['một tệp gửi hai lần', await tepCua(pid).then((x) => [x, x])],
    ];
    for (const [ten, ds] of truong) {
      const r = await viet(pid, ten, ds);
      expect(r.status, ten).toBe(400);
      expect(r.body.code, ten).toBe('TEP_KHONG_HOP_LE');
    }
    // Không lượt hỏng nào để lại bình luận.
    expect((await goi('get', `/policies/${pid}/binh-luan`, 'tdv01')).body.binhLuan).toHaveLength(1);
  }, 60_000);

  it('tệp đã bị huỷ ở document → TEP_KHONG_HOP_LE', async () => {
    const pid = await hoSo();
    const f = await tepCua(pid);
    await withAdminDb((c) => c.query(`UPDATE doc.stored_file SET deleted_at = now() WHERE id = $1`, [f]));
    expect((await viet(pid, 'x', [f])).body.code).toBe('TEP_KHONG_HOP_LE');
  });

  it('hai bình luận song song cùng một tệp → đúng một bình luận mang nó', async () => {
    const pid = await hoSo();
    const f = await tepCua(pid);
    const [a, b] = await Promise.all([viet(pid, 'một', [f]), viet(pid, 'hai', [f])]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    const n = await withAdminDb(
      async (c) => (await c.query(`SELECT count(*)::int AS n FROM pol.binh_luan_tep WHERE file_id = $1`, [f])).rows[0].n,
    );
    expect(n).toBe(1);
  });

  it('gửi lại cùng `maGui` không gắn tệp lần hai', async () => {
    const pid = await hoSo();
    const f = await tepCua(pid);
    const maGui = randomUUID();
    const a = await goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui, noiDung: 'x', tep: [f] });
    const b = await goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui, noiDung: 'x', tep: [f] });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.binhLuan.id).toBe(a.body.binhLuan.id);
    expect(b.body.binhLuan.tep).toHaveLength(1);
  });

  it('`tep` không phải danh sách id → VALIDATION_FAILED', async () => {
    const pid = await hoSo();
    const r = await goi('post', `/policies/${pid}/binh-luan`, 'tdv01', { maGui: randomUUID(), noiDung: 'x', tep: ['khong-phai-id'] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('`0263` sửa bình luận có tệp', () => {
  it('vắng `tep` = giữ nguyên; danh sách mới = gỡ cái thiếu, gắn cái thêm; đổi tệp thôi cũng là một lượt sửa', async () => {
    const pid = await hoSo();
    const a = await tepCua(pid);
    const b = await tepCua(pid);
    const bl = (await viet(pid, 'giữ chữ', [a])).body.binhLuan;

    const giu = await goi('patch', `/policies/${pid}/binh-luan/${bl.id}`, 'tdv01', { noiDung: 'giữ chữ' });
    expect(giu.body.binhLuan.tep.map((t: { id: string }) => t.id)).toEqual([a]);
    expect(giu.body.binhLuan.suaLuc, 'không đổi gì thì không phải lượt sửa').toBeNull();

    const doi = await goi('patch', `/policies/${pid}/binh-luan/${bl.id}`, 'tdv01', { noiDung: 'giữ chữ', tep: [b] });
    expect(doi.status).toBe(200);
    expect(doi.body.binhLuan.tep.map((t: { id: string }) => t.id)).toEqual([b]);
    expect(doi.body.binhLuan.suaLuc).not.toBeNull();
    const go = await withAdminDb(
      async (c) => (await c.query(`SELECT go_luc FROM pol.binh_luan_tep WHERE file_id = $1`, [a])).rows[0].go_luc,
    );
    expect(go).not.toBeNull();
    // Tệp đã gỡ không gắn lại được — kể cả vào chính bình luận ấy.
    const lai = await goi('patch', `/policies/${pid}/binh-luan/${bl.id}`, 'tdv01', { noiDung: 'giữ chữ', tep: [a, b] });
    expect(lai.body.code).toBe('TEP_KHONG_HOP_LE');
  });

  it('gỡ hết tệp của bình luận không chữ → BINH_LUAN_RONG', async () => {
    const pid = await hoSo();
    const bl = (await viet(pid, '', [await tepCua(pid)])).body.binhLuan;
    const r = await goi('patch', `/policies/${pid}/binh-luan/${bl.id}`, 'tdv01', { noiDung: '', tep: [] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BINH_LUAN_RONG');
  });

  it('bình luận đã xoá trả `tep: []` — tệp không rời máy chủ, kể cả với tác giả', async () => {
    const pid = await hoSo();
    const bl = (await viet(pid, 'sắp xoá', [await tepCua(pid)])).body.binhLuan;
    const x = await goi('delete', `/policies/${pid}/binh-luan/${bl.id}`, 'tdv01');
    expect(x.body.binhLuan.tep).toEqual([]);
  });
});

describe('`0263` đọc tệp bình luận', () => {
  it('người trong phạm vi đọc được tệp đang gắn; ngoài phạm vi / Kế toán chưa tới lượt → 404 ở cả ba đường', async () => {
    const pid = await hoSo('gui');
    const f = await tepCua(pid, 'tdv01');
    expect((await viet(pid, 'xem tệp', [f])).status).toBe(201);
    expect(await doc_(f, 'tbp01')).toBe(200);
    expect(await doc_(f, 'bld01')).toBe(200);
    for (const who of ['tdv02', 'kt01', 'admin01']) {
      expect((await goiDoc('get', `/files/${f}`, who)).status, who).toBe(404);
      expect(await doc_(f, who), who).toBe(404);
      expect((await goiDoc('get', `/files/${f}/verify`, who)).status, who).toBe(404);
    }
  });

  it('tệp chưa gắn: chỉ người tải lên đọc được', async () => {
    const pid = await hoSo('gui');
    const f = await tepCua(pid, 'tdv01');
    expect(await doc_(f, 'tdv01')).toBe(200);
    expect(await doc_(f, 'tbp01')).toBe(404);
  });

  it('tệp đã gỡ khi sửa, tệp của bình luận đã xoá: không ai đọc được, kể cả tác giả', async () => {
    const pid = await hoSo('gui');
    const a = await tepCua(pid);
    const b = await tepCua(pid);
    const bl = (await viet(pid, 'hai tệp', [a])).body.binhLuan;
    expect(await doc_(a, 'tdv01')).toBe(200);
    // Gỡ bằng sửa — vẫn còn chữ nên lượt sửa hợp lệ.
    expect((await goi('patch', `/policies/${pid}/binh-luan/${bl.id}`, 'tdv01', { noiDung: 'hai tệp', tep: [] })).status).toBe(200);
    expect(await doc_(a, 'tdv01')).toBe(404);
    expect(await doc_(a, 'tbp01')).toBe(404);
    const bl2 = (await viet(pid, 'sắp xoá', [b])).body.binhLuan;
    expect(await doc_(b, 'tbp01')).toBe(200);
    await goi('delete', `/policies/${pid}/binh-luan/${bl2.id}`, 'tdv01');
    expect(await doc_(b, 'tdv01')).toBe(404);
    expect(await doc_(b, 'tbp01')).toBe(404);
  });

  it('danh sách tệp của hồ sơ KHÔNG bày tệp bình luận', async () => {
    const pid = await hoSo();
    const f = await tepCua(pid);
    await viet(pid, 'x', [f]);
    const giayTo = (await taiLen(pid, 'tdv01', MAU['pdf'], { purpose: 'HO_SO' })).body.id as string;
    const r = await goiDoc('get', `/files?ownerKind=POLICY&ownerId=${pid}`, 'tdv01');
    expect(r.status).toBe(200);
    const ids = (r.body as { id: string }[]).map((x) => x.id);
    expect(ids).toContain(giayTo);
    expect(ids).not.toContain(f);
  });

  it('xoá rời một tệp bình luận → 409, tệp còn nguyên', async () => {
    const pid = await hoSo();
    const f = await tepCua(pid);
    await viet(pid, 'x', [f]);
    const r = await goiDoc('delete', `/files/${f}`, 'tdv01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('TEP_BINH_LUAN_XOA_QUA_BINH_LUAN');
    expect((await dong(f)).deleted_at).toBeNull();
    expect(await doc_(f, 'tdv01')).toBe(200);
  });

  it('tải tệp bình luận KHÔNG ghi vào *Lịch sử* hồ sơ', async () => {
    const pid = await hoSo();
    const f = await tepCua(pid);
    await viet(pid, 'x', [f]);
    const l = await goiDoc('get', `/files/${f}/link`, 'tdv01');
    expect((await (await http(doc)).get(l.body.url).set('Authorization', `Bearer ${tok['tdv01']}`)).status).toBe(200);
    const n = await withAdminDb(
      async (c) =>
        (await c.query(`SELECT count(*)::int AS n FROM pol.policy_event WHERE policy_id = $1 AND action LIKE 'TAI_%'`, [pid]))
          .rows[0].n,
    );
    expect(n).toBe(0);
  });
});

describe('`0263` dọn tệp bình luận', () => {
  const files = () => doc.get(FilesService);
  const donHet = async () => {
    let sau: { moc: string; id: string } | null = null;
    let daXoa = 0;
    let loi = 0;
    do {
      const r = await files().donTepBinhLuan(sau, 2);
      daXoa += r.daXoa;
      loi += r.loi;
      sau = r.tiep;
    } while (sau);
    return { daXoa, loi };
  };

  it('dọn đúng bốn loại; tệp còn sống và tệp chưa gắn dưới 24 giờ KHÔNG đụng', async () => {
    await donRacCu();
    const pid = await hoSo();
    const nhap = await hoSo();
    const song = await tepCua(pid);
    const go = await tepCua(pid);
    const xoaBl = await tepCua(pid);
    const moCoi = await tepCua(pid);
    const tre = await tepCua(pid);
    const cuaNhapXoa = await tepCua(nhap);
    const bl1 = (await viet(pid, 'sống', [song, go])).body.binhLuan;
    await goi('patch', `/policies/${pid}/binh-luan/${bl1.id}`, 'tdv01', { noiDung: 'sống', tep: [song] });
    const bl2 = (await viet(pid, 'xoá', [xoaBl])).body.binhLuan;
    await goi('delete', `/policies/${pid}/binh-luan/${bl2.id}`, 'tdv01');
    await viet(nhap, 'trên bản nháp', [cuaNhapXoa]);
    // Bản Nháp xoá HẲN dòng (`0035`) → dòng gắn mất theo, tệp thành mồ côi.
    expect((await goi('delete', `/policies/${nhap}`, 'tdv01')).status).toBe(204);
    for (const f of [song, go, xoaBl, moCoi, cuaNhapXoa]) await lui(f, 25);
    await lui(tre, 23);

    const r = await donHet();
    expect(r).toEqual({ daXoa: 4, loi: 0 });
    for (const f of [go, xoaBl, moCoi, cuaNhapXoa]) {
      expect((await dong(f)).deleted_at, f).not.toBeNull();
      expect(await conTrenKho(f), f).toBe(false);
    }
    for (const f of [song, tre]) {
      expect((await dong(f)).deleted_at).toBeNull();
      expect(await conTrenKho(f)).toBe(true);
    }
    expect(await doc_(song, 'tdv01')).toBe(200);
  }, 60_000);

  it('con trỏ đi qua được hơn một lô tệp còn sống (lô 2, ba tệp sống đứng trước tệp phải dọn)', async () => {
    await donRacCu();
    const pid = await hoSo();
    const song = [await tepCua(pid), await tepCua(pid), await tepCua(pid)];
    await viet(pid, 'ba tệp sống', song);
    const moCoi = await tepCua(pid);
    for (const [i, f] of song.entries()) await lui(f, 50 - i);
    await lui(moCoi, 25);
    expect(await donHet()).toEqual({ daXoa: 1, loi: 0 });
    expect((await dong(moCoi)).deleted_at).not.toBeNull();
  });

  it('kho tệp hỏng → dòng GIỮ NGUYÊN, lượt sau dọn được; lượt *Dọn dữ liệu* báo LỖI', async () => {
    await donRacCu();
    const pid = await hoSo();
    const f = await tepCua(pid);
    await lui(f, 25);
    const kho = doc.get(Storage);
    const goc = kho.remove.bind(kho);
    kho.remove = async () => {
      throw new Error('kho tệp không trả lời');
    };
    try {
      expect(await donHet()).toEqual({ daXoa: 0, loi: 1 });
      expect((await dong(f)).deleted_at).toBeNull();
      await expect(worker.get(SlaService).runRetention()).rejects.toThrow(/Không xoá được 1 tệp bình luận/);
    } finally {
      kho.remove = goc;
    }
    expect(await donHet()).toEqual({ daXoa: 1, loi: 0 });
    expect(await conTrenKho(f)).toBe(false);
  }, 60_000);

  it('lượt *Dọn dữ liệu* của sla-worker gọi sang document và đếm số tệp đã dọn', async () => {
    await donRacCu();
    const pid = await hoSo();
    const f = await tepCua(pid);
    await lui(f, 25);
    const r = await worker.get(SlaService).runRetention();
    expect(r['tep_binh_luan']).toBe(1);
    expect((await dong(f)).deleted_at).not.toBeNull();
  }, 60_000);

  it('thứ tự tệp là thứ tự người gửi xếp, không phải thứ tự id', async () => {
    const pid = await hoSo();
    const ds = [await tepCua(pid), await tepCua(pid), await tepCua(pid), await tepCua(pid)];
    const xep = [...ds].sort().reverse();
    const r = await viet(pid, 'xếp', xep);
    expect(r.body.binhLuan.tep.map((t: { id: string }) => t.id)).toEqual(xep);
  });

  it('policy TỰ giữ ngưỡng 24 giờ — không dựa vào bộ lọc của document', async () => {
    // Lớp thứ hai: phá lại cho thấy bỏ ngưỡng ở `phanLoaiTep` thì cả bộ vẫn xanh, vì
    // `document` chỉ gửi tệp quá 24 giờ. Ca này hỏi thẳng hàm của policy.
    const pl = policy.get(BinhLuanService);
    const bayGio = Date.now();
    const id = randomUUID();
    expect(await pl.phanLoaiTep([{ id, taoLuc: new Date(bayGio - 23 * 3600e3).toISOString() }], bayGio)).toEqual([]);
    expect(await pl.phanLoaiTep([{ id, taoLuc: new Date(bayGio - 25 * 3600e3).toISOString() }], bayGio)).toEqual([id]);
    expect(await pl.phanLoaiTep([{ id, taoLuc: 'khong-phai-ngay' }], bayGio)).toEqual([]);
  });

  it('policy hỏng → lượt dọn KHÔNG xoá gì (không đoán)', async () => {
    await donRacCu();
    const pid = await hoSo();
    const f = await tepCua(pid);
    await lui(f, 25);
    const truoc = process.env.POLICY_URL;
    process.env.POLICY_URL = process.env.IDENTITY_URL; // trả 404 cho đường bình luận
    try {
      await expect(files().donTepBinhLuan(null)).rejects.toThrow();
    } finally {
      process.env.POLICY_URL = truoc;
    }
    expect((await dong(f)).deleted_at).toBeNull();
  });
});
