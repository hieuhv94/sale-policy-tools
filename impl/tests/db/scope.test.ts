/**
 * AUTH-09…20 · phạm vi dữ liệu suy ra từ PHÂN CÔNG TRÊN HỒ SƠ (`0031`).
 *
 * KHÔNG CÒN CÂY TỔ CHỨC. Tệp này từng kiểm một cây ba tầng
 * `sa01 → kt01/kt02 → tdv01…03` cùng với `approver_user_id` gán thẳng cho từng
 * TDV, và phần lớn nội dung cũ của nó đã mất chỗ dựa — không phải vì viết sai,
 * mà vì thứ nó canh không còn tồn tại.
 *
 * Ghi lại để người sau không đi tìm: cây ấy trả lời câu "ai nhìn thấy dữ liệu
 * của ai", và nó trả lời SAI ở một chỗ căn bản — cùng một TDV có hồ sơ này gửi
 * cho Trưởng bộ phận A, hồ sơ kia gửi cho Trưởng bộ phận B, mà cây thì chỉ có
 * một câu trả lời cho cả hai. `0031` chuyển câu hỏi sang từng hồ sơ.
 *
 * `idn.scope_user_ids` sau `0031` chỉ còn ba nhánh và không đệ quy:
 *   - Ban lãnh đạo → mọi người
 *   - Quản trị     → rỗng
 *   - còn lại      → chính mình
 *
 * Phần "còn thấy gì nữa" nằm ở `pol.policy`: bốn cột người, kiểm ở
 * `tests/http/policy.test.ts` và `tests/http/vai-tro.test.ts`.
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
    // Đếm ĐÚNG bộ tài khoản mẫu, không đếm cả bảng.
    //
    // Bản demo và bộ test dùng chung một Postgres, và từ khi `make demo` bắt đầu
    // từ CSDL trống thì mọi tài khoản người thử tự tạo đều nằm lại ở đây. Đếm
    // cả bảng là một test đỏ vì lý do chẳng liên quan gì tới điều đang kiểm.
    const r = await db.query(
      `SELECT count(DISTINCT role)::int n, count(*)::int t FROM idn.app_user
        WHERE username = ANY($1)`,
      [['sa01','kt01','kt02','tdv01','tdv02','tdv03','tbp01','tbp02','bld01','admin01']],
    );
    expect(r.rows[0].t).toBe(10);
    expect(r.rows[0].n).toBe(6);
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

describe('AUTH-10/11/12 · bốn vai trò trong luồng chỉ có CHÍNH MÌNH trong phạm vi (`0031`)', () => {
  // Bốn ca này thay cho ba `describe` cũ về nhánh kế toán và nhánh Trưởng bộ
  // phận. Chúng nói cùng một điều, và điều đó mới là bất biến thật: KHÔNG vai
  // trò nào thừa hưởng dữ liệu của người khác chỉ vì một quan hệ nhân sự.
  for (const u of ['kt01', 'kt02', 'sa01', 'tbp01', 'tbp02']) {
    it(`${u} chỉ có mình trong phạm vi`, async () => {
      expect(await scopeOf(u)).toEqual([u]);
    });
  }

  it('không ai thấy TDV nào qua phạm vi nữa — kể cả Sale Admin ở gốc cây cũ', async () => {
    // Đây là ca đắt nhất của cả tệp: trước `0031` câu này trả về sáu người và
    // đó là căn cứ để Sale Admin đọc được hồ sơ của ba TDV. Giờ Sale Admin đọc
    // được hồ sơ vì tên họ nằm ở cột `sale_admin_user_id` của chính hồ sơ đó,
    // không vì ai là cấp dưới của ai.
    for (const u of ['sa01', 'kt01', 'tbp01']) {
      const s = await scopeOf(u);
      expect(s).not.toContain('tdv01');
      expect(s).not.toContain('tdv02');
      expect(s).not.toContain('tdv03');
    }
  });
});

describe('AUTH-13/14 · Ban lãnh đạo và Quản trị hệ thống', () => {
  it('bld01 thấy MỌI tài khoản trong hệ thống, không giới hạn nhánh', async () => {
    // So với chính bảng người dùng, KHÔNG chốt con số 10.
    //
    // Bản demo và bộ test dùng chung một Postgres, và từ khi `make demo` cho
    // người dùng tự tạo tài khoản thì bảng này có thêm bao nhiêu dòng là chuyện
    // của người đang thử. Chốt con số là một test đỏ vì lý do chẳng liên quan gì
    // tới điều đang kiểm — mà điều đang kiểm là "không giới hạn nhánh".
    const tatCa = await db.query<{ username: string }>(
      `SELECT username FROM idn.app_user ORDER BY username`,
    );
    expect(await scopeOf('bld01')).toEqual(tatCa.rows.map((r) => r.username));
    expect(tatCa.rows.length).toBeGreaterThanOrEqual(10);
  });
  it('admin01 không có phạm vi hồ sơ nào — đứng ngoài luồng duyệt', async () => {
    expect(await scopeOf('admin01')).toEqual([]);
  });
});

describe('AUTH-15/17/18/20 · cây tổ chức đã bị gỡ (`0031`)', () => {
  it('không còn bảng idn.user_node', async () => {
    const r = await db.query(
      `SELECT to_regclass('idn.user_node') IS NULL AS da_go`,
    );
    expect(r.rows[0].da_go).toBe(true);
  });

  it('không còn cột approver_user_id trên idn.app_user', async () => {
    const r = await db.query(
      `SELECT count(*)::int n FROM information_schema.columns
        WHERE table_schema='idn' AND table_name='app_user' AND column_name='approver_user_id'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('không còn bản notify_targets(uuid) một tham số', async () => {
    // Bản cũ suy người nhận thư từ cây. Để lại hai bản chồng tên thì Postgres
    // chọn theo số tham số, và một lời gọi thiếu đối số rơi âm thầm vào bản cũ —
    // im lặng đúng tới ngày cây không còn dữ liệu.
    const r = await db.query(
      `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='idn' AND p.proname='notify_targets' AND p.pronargs = 1`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('notify_targets bốn tham số trả đúng những người được truyền vào', async () => {
    const r = await db.query(
      `SELECT target_role FROM idn.notify_targets($1,$2,$3,$4) ORDER BY target_role`,
      [uid['tdv01'], uid['tbp01'], uid['kt01'], uid['sa01']],
    );
    expect(r.rows.map((x) => x.target_role)).toEqual(['KE_TOAN', 'SALE_ADMIN', 'TBP', 'TDV']);
  });

  it('ô phân công bỏ trống thì người đó đơn giản là không có trong danh sách', async () => {
    // Hồ sơ Nháp chưa chọn ai. Thư của nó vẫn phải tới được người lập.
    const r = await db.query(
      `SELECT target_role FROM idn.notify_targets($1,NULL,NULL,NULL)`,
      [uid['tdv01']],
    );
    expect(r.rows.map((x) => x.target_role)).toEqual(['TDV']);
  });

  it('tài khoản đã vô hiệu hoá KHÔNG nhận thư', async () => {
    await inRollback(db, async () => {
      await db.query(`UPDATE idn.app_user SET is_active = false WHERE id = $1`, [uid['tbp01']]);
      const r = await db.query(
        `SELECT target_role FROM idn.notify_targets($1,$2,NULL,NULL)`,
        [uid['tdv01'], uid['tbp01']],
      );
      expect(r.rows.map((x) => x.target_role)).toEqual(['TDV']);
    });
  });
});
