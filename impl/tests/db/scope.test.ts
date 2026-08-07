/**
 * AUTH-09…20 · phạm vi dữ liệu suy ra từ CÂY TỔ CHỨC, không cấu hình tay (YCNV §2.1).
 *
 * Cây trong dữ liệu mẫu:
 *   sa01 ──┬── kt01 ──┬── tdv01  (bộ phận BP01, tbp01 duyệt)
 *          │          └── tdv02  (BP01)
 *          └── kt02 ───── tdv03  (BP02, tbp02 duyệt)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, expectSqlError, inRollback } from './helpers';

let db: Client;
const uid: Record<string, string> = {};

const scopeOf = async (username: string): Promise<string[]> => {
  const r = await db.query(
    `SELECT u2.username FROM idn.scope_user_ids($1) s JOIN idn.app_user u2 ON u2.id = s.user_id
     ORDER BY u2.username`, [uid[username]]);
  return r.rows.map((x) => x.username);
};

beforeAll(async () => {
  db = admin(); await db.connect();
  const r = await db.query('SELECT id, username FROM idn.app_user');
  for (const row of r.rows) uid[row.username] = row.id;
});
afterAll(async () => { await db.end(); });

describe('AUTH-08 · đúng 6 vai trò', () => {
  it('không có vai trò riêng cho Kế toán L2 hay QL', async () => {
    const r = await db.query(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
       WHERE t.typname='user_role' ORDER BY e.enumsortorder`);
    expect(r.rows.map((x) => x.enumlabel)).toEqual(
      ['TDV','TBP','KE_TOAN','SALE_ADMIN','BAN_LANH_DAO','QUAN_TRI']);
  });
  it('10 tài khoản mẫu phủ đủ 6 vai trò', async () => {
    const r = await db.query('SELECT count(DISTINCT role)::int n, count(*)::int t FROM idn.app_user');
    expect(r.rows[0].n).toBe(6);
    expect(r.rows[0].t).toBe(10);
  });
});

describe('AUTH-09 · TDV chỉ thấy hồ sơ của chính mình', () => {
  it('tdv01 chỉ có mình trong phạm vi', async () => {
    expect(await scopeOf('tdv01')).toEqual(['tdv01']);
  });
  it('tdv02 không thấy tdv01', async () => {
    expect(await scopeOf('tdv02')).not.toContain('tdv01');
  });
});

describe('AUTH-10 · kế toán thấy đúng TDV mình phụ trách', () => {
  it('kt01 thấy tdv01 và tdv02, KHÔNG thấy tdv03', async () => {
    const s = await scopeOf('kt01');
    expect(s).toContain('tdv01');
    expect(s).toContain('tdv02');
    expect(s).not.toContain('tdv03');
  });
  it('kt02 không thấy tdv01', async () => {
    expect(await scopeOf('kt02')).not.toContain('tdv01');
  });
});

describe('AUTH-11/19 · Sale Admin thấy toàn nhánh, cây sâu 3 cấp', () => {
  it('sa01 thấy cả hai kế toán và cả ba TDV — đúng 6 người kể cả chính mình', async () => {
    const s = await scopeOf('sa01');
    expect(s).toEqual(['kt01','kt02','sa01','tdv01','tdv02','tdv03']);
  });
});

describe('AUTH-12 · Trưởng bộ phận là nhánh riêng, độc lập với nhánh kế toán', () => {
  it('tbp01 thấy TDV của bộ phận BP01', async () => {
    expect(await scopeOf('tbp01')).toEqual(['tdv01','tdv02']);
  });
  it('tbp02 chỉ thấy tdv03', async () => {
    expect(await scopeOf('tbp02')).toEqual(['tdv03']);
  });
  it('phạm vi của TBP không phụ thuộc vào cây kế toán', async () => {
    // tdv01 nằm dưới kt01, nhưng tbp01 thấy được mà không cần liên quan gì tới kt01.
    expect(await scopeOf('tbp01')).not.toContain('kt01');
  });
});

describe('AUTH-13/14 · Ban lãnh đạo và Quản trị hệ thống', () => {
  it('bld01 thấy toàn bộ 10 người', async () => {
    expect(await scopeOf('bld01')).toHaveLength(10);
  });
  it('admin01 không có phạm vi hồ sơ nào — đứng ngoài luồng duyệt', async () => {
    expect(await scopeOf('admin01')).toEqual([]);
  });
});

describe('AUTH-15 · chuyển TDV sang kế toán khác thì phạm vi đổi theo, không sửa tay từng hồ sơ', () => {
  it('chuyển tdv03 từ kt02 sang kt01 thì cả hai phạm vi đổi theo', async () => {
    await inRollback(db, async () => {
      await db.query('UPDATE idn.user_node SET parent_id=$1 WHERE user_id=$2',
                     [uid['kt01'], uid['tdv03']]);
      expect(await scopeOf('kt01')).toContain('tdv03');
      expect(await scopeOf('kt02')).not.toContain('tdv03');
    });
    // Sau khi hoàn tác, phạm vi trở lại như cũ.
    expect(await scopeOf('kt01')).not.toContain('tdv03');
    expect(await scopeOf('kt02')).toContain('tdv03');
  });
});

describe('AUTH-17 · cây tổ chức không được có vòng lặp', () => {
  it('đặt sa01 làm cấp dưới của tdv01 (tạo chu trình) thì bị chặn', async () => {
    const err = await expectSqlError(() =>
      db.query('UPDATE idn.user_node SET parent_id=$1 WHERE user_id=$2',
               [uid['tdv01'], uid['sa01']]));
    expect(err.message).toContain('vong lap');
  });
  it('không ai làm cấp trên của chính mình', async () => {
    const err = await expectSqlError(() =>
      db.query('UPDATE idn.user_node SET parent_id=$1 WHERE user_id=$1', [uid['kt01']]));
    expect(err.code).toBe('23514');
  });
  it('truy vấn phạm vi vẫn trả kết quả bình thường sau khi thử tạo vòng lặp', async () => {
    expect(await scopeOf('sa01')).toHaveLength(6);
  });
});

describe('AUTH-18/20 · Trưởng bộ phận cấu hình theo bộ phận, có người duyệt thay', () => {
  it('thêm người duyệt thay cho BP01 thì người đó thấy thêm TDV của BP01', async () => {
    await inRollback(db, async () => {
      await db.query(
        `INSERT INTO idn.department_approver (department_id, user_id, is_primary)
         VALUES ((SELECT id FROM idn.department WHERE code='BP01'), $1, false)`,
        [uid['tbp02']]);
      // tbp02 giữ nguyên BP02 của mình và có thêm BP01.
      expect(await scopeOf('tbp02')).toEqual(['tdv01','tdv02','tdv03']);
    });
    expect(await scopeOf('tbp02')).toEqual(['tdv03']);
  });

  it('đổi người giữ chức TBP chỉ là đổi một dòng, không đụng tới hồ sơ nào', async () => {
    await inRollback(db, async () => {
      await db.query(
        `UPDATE idn.department_approver SET user_id=$1
          WHERE user_id=$2 AND department_id=(SELECT id FROM idn.department WHERE code='BP01')`,
        [uid['tbp02'], uid['tbp01']]);
      // Người cũ mất phạm vi, người mới nhận thêm BP01 bên cạnh BP02 sẵn có.
      expect(await scopeOf('tbp01')).toEqual([]);
      expect(await scopeOf('tbp02')).toEqual(['tdv01','tdv02','tdv03']);
    });
    expect(await scopeOf('tbp01')).toEqual(['tdv01','tdv02']);
  });
});
