/**
 * AD-02 · ranh giới sở hữu dữ liệu là ranh giới CỨNG.
 * Service khác không SELECT chéo được vì DB role không có quyền — vi phạm lỗi ngay
 * lúc chạy chứ không lọt qua review.
 */
import { describe, expect, it } from 'vitest';
import { admin, asRole, expectSqlError, mkCustomer, withClient } from './helpers';

const SCHEMAS = ['idn', 'cat', 'cus', 'pol', 'doc', 'ntf', 'rpt', 'aud', 'sys'];

describe('AD-02 · 9 schema và 10 DB role (`0252` thêm csbh_ops)', () => {
  it('cả 9 schema đều tồn tại', async () => {
    await withClient(asRole('csbh_sys'), async (c) => {
      const r = await c.query(
        `SELECT nspname FROM pg_namespace WHERE nspname = ANY($1) ORDER BY 1`, [SCHEMAS]);
      expect(r.rows.map((x) => x.nspname)).toEqual([...SCHEMAS].sort());
    });
  });

  it('cả 10 role đăng nhập đều tồn tại', async () => {
    await withClient(asRole('csbh_sys'), async (c) => {
      const r = await c.query(
        `SELECT rolname FROM pg_roles WHERE rolname LIKE 'csbh\\_%' AND rolcanlogin ORDER BY 1`);
      expect(r.rows).toHaveLength(10);
    });
  });
});

describe('AD-02 · không đọc chéo được schema của service khác', () => {
  it('csbh_cat không đọc được pol.policy', async () => {
    await withClient(asRole('csbh_cat'), async (c) => {
      const err = await expectSqlError(() => c.query('SELECT 1 FROM pol.policy LIMIT 1'));
      expect(err.code).toBe('42501');                 // insufficient_privilege
    });
  });

  it('`0252` csbh_ops (van-hanh) không đọc được dữ liệu nghiệp vụ nào', async () => {
    await withClient(asRole('csbh_ops'), async (c) => {
      for (const bang of ['pol.policy', 'cus.customer', 'idn.app_user', 'aud.audit_log']) {
        const err = await expectSqlError(() => c.query(`SELECT 1 FROM ${bang} LIMIT 1`));
        expect(err.code, bang).toBe('42501');
      }
    });
  });

  it('csbh_pol không đọc được aud.audit_log', async () => {
    await withClient(asRole('csbh_pol'), async (c) => {
      const err = await expectSqlError(() => c.query('SELECT 1 FROM aud.audit_log LIMIT 1'));
      expect(err.code).toBe('42501');
    });
  });

  it('csbh_pol đọc và ghi được schema của chính mình', async () => {
    // Khách hàng phải có thật vì pol.policy có khoá ngoại sang cus.customer, và
    // phải COMMIT vì csbh_pol là một kết nối khác. Chính csbh_pol không tạo được
    // khách hàng — nó không có quyền trên schema cus — nên dựng bằng quản trị.
    const cust = await withClient(admin(), (a) => mkCustomer(a, 'ROLE'));
    try {
      await withClient(asRole('csbh_pol'), async (c) => {
        const r = await c.query(
          `INSERT INTO pol.policy (code, customer_id) VALUES ($1,$2) RETURNING id`,
          [`ROLE-${Date.now()}`, cust]);
        expect(r.rows[0].id).toBeDefined();
      });
    } finally {
      // Dọn tay: hồ sơ NHAP xoá được, khác với DA_XOA. Không dọn thì mỗi lần
      // chạy lại bồi thêm một dòng không bao giờ mất.
      await withClient(admin(), async (a) => {
        await a.query('DELETE FROM pol.policy WHERE customer_id = $1', [cust]);
        await a.query('DELETE FROM cus.customer WHERE id = $1', [cust]);
      });
    }
  });
});

describe('AUD-03 · role của audit không có quyền sửa hay xoá', () => {
  it('csbh_aud ghi thêm được', async () => {
    await withClient(asRole('csbh_aud'), async (c) => {
      const r = await c.query(
        `INSERT INTO aud.audit_log (action, entity) VALUES ('ROLE_TEST','policy') RETURNING id`);
      expect(r.rows[0].id).toBeDefined();
    });
  });

  it('csbh_aud KHÔNG có quyền UPDATE — chặn ở tầng quyền, trước cả trigger', async () => {
    await withClient(asRole('csbh_aud'), async (c) => {
      const err = await expectSqlError(() =>
        c.query(`UPDATE aud.audit_log SET action='X' WHERE id=1`));
      expect(err.code).toBe('42501');
    });
  });

  it('csbh_aud KHÔNG có quyền DELETE', async () => {
    await withClient(asRole('csbh_aud'), async (c) => {
      const err = await expectSqlError(() => c.query('DELETE FROM aud.audit_log WHERE id=1'));
      expect(err.code).toBe('42501');
    });
  });
});

describe('SEC-11 · không còn quyền mặc định của PUBLIC', () => {
  it('PUBLIC không còn quyền trên schema public', async () => {
    await withClient(asRole('csbh_sys'), async (c) => {
      const r = await c.query(
        `SELECT has_schema_privilege('public','public','CREATE') AS can_create`);
      expect(r.rows[0].can_create).toBe(false);
    });
  });
});
