/**
 * ONB-02 · muc 2.3 — bộ phận và người duyệt của bộ phận.
 *
 * Trước P11a hai bảng `idn.department` và `idn.department_approver` chỉ được
 * điền bởi `scripts/seed.ts`. Hệ quả là một TBP tạo qua API có tài khoản đúng,
 * quyền đúng, mà KHÔNG nhận được hồ sơ nào — `idn.scope_user_ids` định tuyến
 * theo bộ phận, và người đó không thuộc bộ phận nào.
 *
 * Test ở đây đi tới tận `scope_user_ids` thay vì đọc lại cột vừa ghi: cái cần
 * chứng minh là hồ sơ TỚI ĐÚNG NGƯỜI, không phải là câu UPDATE có chạy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import {
  accessTokenFor,
  boot,
  cleanupTestUsers,
  http,
  TEST_PREFIX,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const DEFAULT_PW = 'MacDinh@2026';

let app: INestApplication;
let adminToken = '';
let n = 0;

const ten = () => `${TEST_PREFIX}_bp${++n}`;

const taoNguoiDung = async (role: string, over: Record<string, unknown> = {}) => {
  const u = ten();
  const agent = await http(app);
  const res = await agent
    .post('/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      username: u,
      email: `${u}@csbh.test`,
      fullName: 'Nguoi dung thu nghiem',
      role,
      defaultPassword: DEFAULT_PW,
      ...over,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { id: res.body.id as string, username: u };
};

const taoBoPhan = async () => {
  const ma = ten().toUpperCase();
  const agent = await http(app);
  const res = await agent
    .post('/admin/departments')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code: ma, name: `Bo phan ${ma}` });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { id: res.body.id as string, code: ma };
};

beforeAll(async () => {
  await cleanupTestUsers();
  app = await boot();
  adminToken = await accessTokenFor(app, 'admin01', SEED_PW);
});

afterAll(async () => {
  await cleanupTestUsers();
  await withAdminDb((c) =>
    c.query(`DELETE FROM idn.department WHERE code LIKE $1`, [`${TEST_PREFIX.toUpperCase()}%`]),
  );
  await app?.close();
});

describe('tạo bộ phận', () => {
  it('tạo rồi thấy ngay trong danh sách, chưa có người duyệt nào', async () => {
    const bp = await taoBoPhan();
    const agent = await http(app);
    const ds = await agent.get('/admin/departments').set('Authorization', `Bearer ${adminToken}`);
    expect(ds.status).toBe(200);
    const tim = (ds.body as { id: string; approvers: unknown[] }[]).find((b) => b.id === bp.id);
    expect(tim).toBeDefined();
    // Mảng RỖNG chứ không phải null — giao diện đếm `approvers.length` để cảnh
    // báo "bộ phận này chưa ai duyệt".
    expect(tim!.approvers).toEqual([]);
  });

  it('trùng mã bộ phận thì 409, không tạo thêm bản thứ hai', async () => {
    const bp = await taoBoPhan();
    const agent = await http(app);
    const lai = await agent
      .post('/admin/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: bp.code, name: 'Ten khac' });
    expect(lai.status).toBe(409);
    expect(lai.body.code).toBe('DEPARTMENT_DUPLICATE');
  });
});

describe('người duyệt của bộ phận', () => {
  it('gán một TBP rồi thấy trong danh sách kèm cờ duyệt chính', async () => {
    const bp = await taoBoPhan();
    const tbp = await taoNguoiDung('TBP', { departmentCode: bp.code });
    const agent = await http(app);

    const gan = await agent
      .post(`/admin/departments/${bp.id}/approvers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: tbp.id, isPrimary: true });
    expect(gan.status, JSON.stringify(gan.body)).toBe(200);

    const ds = await agent.get('/admin/departments').set('Authorization', `Bearer ${adminToken}`);
    const tim = (ds.body as { id: string; approvers: { userId: string; isPrimary: boolean }[] }[])
      .find((b) => b.id === bp.id);
    expect(tim!.approvers).toHaveLength(1);
    expect(tim!.approvers[0]!.userId).toBe(tbp.id);
    expect(tim!.approvers[0]!.isPrimary).toBe(true);
  });

  it('gán người KHÔNG phải Trưởng bộ phận thì 400', async () => {
    // Đây là khẳng định chính của nhóm này. Không chặn thì hồ sơ đi vào ngõ cụt:
    // `scope_user_ids` vẫn định tuyến tới người đó, mà người đó không có hành
    // động `TBP_SIGN` nào để làm — hồ sơ đứng im tới lúc quá hạn, và không có
    // thông báo nào chỉ ra nguyên nhân.
    const bp = await taoBoPhan();
    const tdv = await taoNguoiDung('TDV');
    const agent = await http(app);

    const gan = await agent
      .post(`/admin/departments/${bp.id}/approvers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: tdv.id });
    expect(gan.status).toBe(400);
    expect(gan.body.code).toBe('VALIDATION_FAILED');
    expect(gan.body.field).toBe('userId');
  });

  it('gán lại cùng người thì đổi cờ duyệt chính, không nhân đôi dòng', async () => {
    const bp = await taoBoPhan();
    const tbp = await taoNguoiDung('TBP', { departmentCode: bp.code });
    const agent = await http(app);
    const gan = (isPrimary: boolean) =>
      agent
        .post(`/admin/departments/${bp.id}/approvers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: tbp.id, isPrimary });

    await gan(true);
    await gan(false);

    const ds = await agent.get('/admin/departments').set('Authorization', `Bearer ${adminToken}`);
    const tim = (ds.body as { id: string; approvers: { isPrimary: boolean }[] }[]).find(
      (b) => b.id === bp.id,
    );
    expect(tim!.approvers).toHaveLength(1);
    expect(tim!.approvers[0]!.isPrimary).toBe(false);
  });

  it('gỡ người duyệt rồi gỡ lần nữa thì 404', async () => {
    const bp = await taoBoPhan();
    const tbp = await taoNguoiDung('TBP', { departmentCode: bp.code });
    const agent = await http(app);
    await agent
      .post(`/admin/departments/${bp.id}/approvers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: tbp.id });

    const go = await agent
      .delete(`/admin/departments/${bp.id}/approvers/${tbp.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(go.status).toBe(200);

    const lai = await agent
      .delete(`/admin/departments/${bp.id}/approvers/${tbp.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lai.status).toBe(404);
  });
});

describe('sửa người dùng', () => {
  it('đổi bộ phận của một TDV thì hồ sơ của họ tới đúng TBP mới', async () => {
    // Đi tới tận `idn.scope_user_ids` chứ không đọc lại cột vừa ghi: câu hỏi
    // thật là "hồ sơ tới đúng người chưa", không phải "câu UPDATE có chạy chưa".
    const bpCu = await taoBoPhan();
    const bpMoi = await taoBoPhan();
    const tbpCu = await taoNguoiDung('TBP', { departmentCode: bpCu.code });
    const tbpMoi = await taoNguoiDung('TBP', { departmentCode: bpMoi.code });
    const tdv = await taoNguoiDung('TDV', { departmentCode: bpCu.code });
    const agent = await http(app);

    for (const [bp, tbp] of [
      [bpCu, tbpCu],
      [bpMoi, tbpMoi],
    ] as const) {
      await agent
        .post(`/admin/departments/${bp.id}/approvers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: tbp.id });
    }

    const trongTam = (userId: string, tdvId: string) =>
      withAdminDb(async (c) => {
        // Hàm trả về TABLE nên phải đọc từ FROM, không gọi trong SELECT — gọi
        // trong SELECT ra một cột composite và phép `.includes` luôn sai.
        const r = await c.query(`SELECT user_id FROM idn.scope_user_ids($1)`, [userId]);
        return r.rows.some((x) => x.user_id === tdvId);
      });

    expect(await trongTam(tbpCu.id, tdv.id)).toBe(true);
    expect(await trongTam(tbpMoi.id, tdv.id)).toBe(false);

    const sua = await agent
      .patch(`/admin/users/${tdv.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentCode: bpMoi.code });
    expect(sua.status, JSON.stringify(sua.body)).toBe(200);

    expect(await trongTam(tbpMoi.id, tdv.id)).toBe(true);
    expect(await trongTam(tbpCu.id, tdv.id)).toBe(false);
  });

  it('danh sách người dùng trả về bộ phận và cấp trên đang có', async () => {
    // Thiếu hai cột này thì biểu mẫu sửa mở ra rỗng và người quản trị tưởng
    // chưa gán gì — rồi lưu đè lên giá trị đúng bằng giá trị trống.
    const bp = await taoBoPhan();
    const tdv = await taoNguoiDung('TDV', { departmentCode: bp.code, parentUsername: 'kt01' });
    const agent = await http(app);

    const ds = await agent
      .get('/admin/users?limit=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const tim = (ds.body.items as { id: string; departmentCode: string; parentUsername: string }[])
      .find((u) => u.id === tdv.id);
    expect(tim!.departmentCode).toBe(bp.code);
    expect(tim!.parentUsername).toBe('kt01');
  });

  it('chuỗi rỗng GỠ liên kết, thiếu trường thì giữ nguyên', async () => {
    // Hai thứ khác nhau và phải khác nhau: gộp lại thì không bao giờ gỡ được một
    // cấp trên đã gán nhầm.
    const bp = await taoBoPhan();
    const tdv = await taoNguoiDung('TDV', { departmentCode: bp.code, parentUsername: 'kt01' });
    const agent = await http(app);
    const doc = async () => {
      const ds = await agent
        .get('/admin/users?limit=200')
        .set('Authorization', `Bearer ${adminToken}`);
      return (ds.body.items as { id: string; departmentCode: string | null; parentUsername: string | null }[])
        .find((u) => u.id === tdv.id)!;
    };

    await agent
      .patch(`/admin/users/${tdv.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Ten moi' });
    expect((await doc()).departmentCode).toBe(bp.code);

    await agent
      .patch(`/admin/users/${tdv.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentUsername: '' });
    expect((await doc()).parentUsername).toBeNull();
  });

  it('không đặt được chính mình làm cấp trên', async () => {
    const tdv = await taoNguoiDung('TDV');
    const agent = await http(app);
    const res = await agent
      .patch(`/admin/users/${tdv.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentUsername: tdv.username });
    expect(res.status).toBe(400);
  });

  it('bộ phận không tồn tại thì 404, không ghi im lặng thành null', async () => {
    const tdv = await taoNguoiDung('TDV');
    const agent = await http(app);
    const res = await agent
      .patch(`/admin/users/${tdv.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentCode: 'KHONG_CO_MA_NAY' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DEPARTMENT_NOT_FOUND');
  });
});

describe('chỉ Quản trị hệ thống vào được nhóm route này', () => {
  it.each(['tdv01', 'tbp01', 'kt01', 'sa01', 'bld01'])('%s gọi thì 403', async (tenTaiKhoan) => {
    const token = await accessTokenFor(app, tenTaiKhoan, SEED_PW);
    const agent = await http(app);
    expect((await agent.get('/admin/departments').set('Authorization', `Bearer ${token}`)).status)
      .toBe(403);
  });
});
