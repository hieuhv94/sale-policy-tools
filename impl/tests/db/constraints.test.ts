/**
 * Bốn bất biến cưỡng chế ở tầng CSDL (quyết định kiến trúc AD-04).
 *
 * Test ở đây cố tình chạy SQL THÔ chứ không qua tầng ứng dụng: điều cần chứng minh
 * là ngay cả khi ai đó sửa thẳng vào CSDL thì ràng buộc vẫn giữ.
 *
 * MỌI test có ghi đều bọc trong `inRollback`. Bản đầu không bọc và để lại 135
 * dòng trong pol.policy sau vài chục lần chạy — trong đó có hồ sơ TU_CHOI mà
 * chính trigger ở đây cấm xoá, nên chúng vĩnh viễn không dọn được. Đúng bất biến
 * mà test này chứng minh lại là thứ biến rác test thành rác không xoá nổi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, expectSqlErrorInTx, inRollback, mkCustomer } from './helpers';

let db: Client;

const mkPolicy = async (c: Client, code: string, customerId: string, status: string) => {
  const r = await c.query(
    `INSERT INTO pol.policy (code, customer_id, status) VALUES ($1, $2, $3::pol.policy_status)
     RETURNING id`, [code, customerId, status]);
  return r.rows[0].id as string;
};

beforeAll(async () => { db = admin(); await db.connect(); });
afterAll(async () => { await db.end(); });

describe('EFF-02 · mỗi khách hàng đúng một CSBH còn hiệu lực', () => {
  it('chèn bản ghi DANG_CO_HIEU_LUC thứ hai cho cùng khách hàng thì CSDL từ chối', async () => {
    await inRollback(db, async () => {
      const cust = await mkCustomer(db, 'EFF02A');
      await mkPolicy(db, `EFF02-A-${Date.now()}`, cust, 'DANG_CO_HIEU_LUC');
      const err = await expectSqlErrorInTx(db, () =>
        mkPolicy(db, `EFF02-B-${Date.now()}`, cust, 'DANG_CO_HIEU_LUC'));
      expect(err.code).toBe('23505');                       // unique_violation
      expect(err.message).toContain('uq_policy_active_per_customer');
    });
  });

  it('cùng khách hàng vẫn có nhiều bản HET_HIEU_LUC — chỉ trạng thái hiệu lực mới bị chặn', async () => {
    await inRollback(db, async () => {
      const cust = await mkCustomer(db, 'EFF02C');
      await mkPolicy(db, `EFF02-C-${Date.now()}`, cust, 'HET_HIEU_LUC');
      await mkPolicy(db, `EFF02-D-${Date.now()}`, cust, 'HET_HIEU_LUC');
      const r = await db.query('SELECT count(*)::int n FROM pol.policy WHERE customer_id=$1', [cust]);
      expect(r.rows[0].n).toBe(2);
    });
  });
});

describe('POL-02 · không trùng sản phẩm trong cùng một hồ sơ', () => {
  it('thêm cùng product_id lần hai vào một hồ sơ thì CSDL từ chối', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `POL02-${Date.now()}`, await mkCustomer(db, 'POL02'), 'NHAP');
      const prod = crypto.randomUUID();
      const line = (p: string) => db.query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, discount_rate)
         VALUES ($1,$2,'VT-01','San pham',100000,90000,15.00)`, [id, p]);
      await line(prod);
      const err = await expectSqlErrorInTx(db, () => line(prod));
      expect(err.code).toBe('23505');
    });
  });
});

describe('POL-14 · hồ sơ Từ chối không ai xoá được', () => {
  it('DELETE bằng SQL thô vẫn bị chặn và báo lỗi rõ ràng', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `POL14-${Date.now()}`, await mkCustomer(db, 'POL14'), 'TU_CHOI');
      const err = await expectSqlErrorInTx(db, () =>
        db.query('DELETE FROM pol.policy WHERE id=$1', [id]));
      expect(err.message).toContain('TU_CHOI');
      const still = await db.query('SELECT count(*)::int n FROM pol.policy WHERE id=$1', [id]);
      expect(still.rows[0].n).toBe(1);                      // vẫn còn nguyên
    });
  });

  it('hồ sơ ở trạng thái khác thì xoá được bình thường', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `POL14B-${Date.now()}`, await mkCustomer(db, 'POL14B'), 'NHAP');
      await db.query('DELETE FROM pol.policy WHERE id=$1', [id]);
      const r = await db.query('SELECT count(*)::int n FROM pol.policy WHERE id=$1', [id]);
      expect(r.rows[0].n).toBe(0);
    });
  });
});

describe('AUD-03/04 · nhật ký chỉ ghi thêm', () => {
  const ins = (c: Client) => c.query(
    `INSERT INTO aud.audit_log (action, entity, after_data)
     VALUES ('TEST','policy','{"a":1}'::jsonb) RETURNING id`);

  it('INSERT được', async () => {
    await inRollback(db, async () => {
      const r = await ins(db);
      expect(r.rows[0].id).toBeDefined();
    });
  });

  it('UPDATE bị chặn ở tầng CSDL, kể cả bằng tài khoản quản trị', async () => {
    await inRollback(db, async () => {
      const r = await ins(db);
      const err = await expectSqlErrorInTx(db, () =>
        db.query('UPDATE aud.audit_log SET action=$1 WHERE id=$2', ['SUA', r.rows[0].id]));
      expect(err.message).toContain('chi duoc phep INSERT');
    });
  });

  it('DELETE bị chặn', async () => {
    await inRollback(db, async () => {
      const r = await ins(db);
      const err = await expectSqlErrorInTx(db, () =>
        db.query('DELETE FROM aud.audit_log WHERE id=$1', [r.rows[0].id]));
      expect(err.message).toContain('chi duoc phep INSERT');
    });
  });

  it('TRUNCATE bị chặn', async () => {
    await inRollback(db, async () => {
      const err = await expectSqlErrorInTx(db, () => db.query('TRUNCATE aud.audit_log'));
      expect(err.message).toContain('chi duoc phep INSERT');
    });
  });
});

describe('CALC · cột sinh tính đúng ngay ở tầng CSDL', () => {
  it('CPBH tổng, giá thu về và cờ vượt ngưỡng do CSDL tự tính', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `CALC-${Date.now()}`, await mkCustomer(db, 'CALC'), 'NHAP');
      await db.query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, cpbh1, cpbh2, cpbh3, cpbh4,
            discount_rate, threshold_snap)
         VALUES ($1,$2,'VT-02','Nutricare Gold',100000,90000,2000,1500,1000,500,15.00,12.34)`,
        [id, crypto.randomUUID()]);
      const r = await db.query(
        'SELECT cpbh_total, net_price, over_threshold FROM pol.policy_line WHERE policy_id=$1', [id]);
      expect(Number(r.rows[0].cpbh_total)).toBe(5000);
      expect(Number(r.rows[0].net_price)).toBe(85000);      // 90.000 − 5.000
      expect(r.rows[0].over_threshold).toBe(true);          // 15,00% > 12,34%
    });
  });

  it('giá bán Công ty bằng 0 bị chặn — không có phép chia cho 0 ở tầng trên', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `CALC0-${Date.now()}`, await mkCustomer(db, 'CALC0'), 'NHAP');
      const err = await expectSqlErrorInTx(db, () => db.query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, discount_rate)
         VALUES ($1,$2,'VT-03','X',0,90000,15.00)`, [id, crypto.randomUUID()]));
      expect(err.code).toBe('23514');                       // check_violation
    });
  });
});

describe('WF-02 · danh sách trạng thái là danh sách đóng', () => {
  it('trạng thái ngoài 11 giá trị bị CSDL từ chối', async () => {
    await inRollback(db, async () => {
      const cust = await mkCustomer(db, 'WF02');
      const err = await expectSqlErrorInTx(db, () =>
        mkPolicy(db, `WF02-${Date.now()}`, cust, 'DANG_DUYET'));
      expect(err.code).toBe('22P02');                       // invalid_text_representation
    });
  });

  it('đủ đúng 11 trạng thái, không thừa không thiếu', async () => {
    const r = await db.query(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
       WHERE t.typname='policy_status' ORDER BY e.enumsortorder`);
    expect(r.rows.map((x) => x.enumlabel)).toEqual([
      'NHAP','CHO_TBP_DUYET','TBP_DA_KY_SO','CHO_KT_L1','SA_DANG_XU_LY','CHO_KT_L2',
      'DANG_CO_HIEU_LUC','HET_HIEU_LUC','YEU_CAU_CHINH_SUA','TU_CHOI','QUA_HAN_DUYET']);
  });
});

describe('CUST-16 · khoá ngoại pol.policy -> cus.customer', () => {
  it('không xoá được khách hàng đã có hồ sơ CSBH', async () => {
    await inRollback(db, async () => {
      const cust = await mkCustomer(db, 'FK');
      await mkPolicy(db, `FK-${Date.now()}`, cust, 'NHAP');
      const err = await expectSqlErrorInTx(db, () =>
        db.query('DELETE FROM cus.customer WHERE id=$1', [cust]));
      expect(err.code).toBe('23503');                       // foreign_key_violation
    });
  });

  it('hồ sơ không trỏ vào khách hàng có thật cũng không tạo được', async () => {
    await inRollback(db, async () => {
      const err = await expectSqlErrorInTx(db, () =>
        mkPolicy(db, `FK2-${Date.now()}`, crypto.randomUUID(), 'NHAP'));
      expect(err.code).toBe('23503');
    });
  });
});

describe('MIG-01/02 · sẵn sàng cho giai đoạn 2', () => {
  it('chấp nhận bản ghi thiếu file ký, thiếu người duyệt, thiếu mốc thời gian', async () => {
    await inRollback(db, async () => {
      const r = await db.query(
        `INSERT INTO pol.policy (code, customer_id, status, source, import_batch_id)
         VALUES ($1,$2,'DANG_CO_HIEU_LUC','LEGACY',$3) RETURNING id, source`,
        [`MIG01-${Date.now()}`, await mkCustomer(db, 'MIG01'), crypto.randomUUID()]);
      expect(r.rows[0].source).toBe('LEGACY');
    });
  });

  it('cột source và import_batch_id có mặt từ ngày đầu', async () => {
    const r = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='pol' AND table_name='policy'
         AND column_name IN ('source','import_batch_id','app_version')`);
    expect(r.rows.map((x) => x.column_name).sort()).toEqual(
      ['app_version','import_batch_id','source']);
  });
});
