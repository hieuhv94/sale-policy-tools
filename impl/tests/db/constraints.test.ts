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
            company_price_snap, wholesale_price, cpbh,
            discount_rate, threshold_snap)
         VALUES ($1,$2,'VT-02','Nutricare Gold',100000,90000,
                 ARRAY[2000,1500,1000,500]::bigint[],15.00,12.34)`,
        [id, crypto.randomUUID()]);
      const r = await db.query(
        'SELECT cpbh_total, net_price, over_threshold FROM pol.policy_line WHERE policy_id=$1', [id]);
      expect(Number(r.rows[0].cpbh_total)).toBe(5000);
      expect(Number(r.rows[0].net_price)).toBe(85000);      // 90.000 − 5.000
      expect(r.rows[0].over_threshold).toBe(true);          // 15,00% > 12,34%
    });
  });

  it('mảng CPBH rỗng cho tổng 0 và giá thu về bằng giá bán buôn', async () => {
    // Không có khoản chi phí nào là chuyện hợp lệ từ 0021. Tổng phải là 0, KHÔNG
    // phải NULL — `sum()` của một mảng rỗng trả NULL, và `net_price` mà NULL thì
    // mọi phép so sánh sau đó im lặng sai.
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `CALC0-${Date.now()}`, await mkCustomer(db, 'CALC0'), 'NHAP');
      await db.query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, discount_rate, threshold_snap)
         VALUES ($1,$2,'VT-03','Khong co CPBH',100000,90000,10.00,12.34)`,
        [id, crypto.randomUUID()]);
      const r = await db.query(
        'SELECT cpbh, cpbh_total, net_price FROM pol.policy_line WHERE policy_id=$1', [id]);
      expect(r.rows[0].cpbh).toEqual([]);
      expect(Number(r.rows[0].cpbh_total)).toBe(0);
      expect(Number(r.rows[0].net_price)).toBe(90000);
    });
  });

  it('CSDL từ chối khoản CPBH âm', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `CALCA-${Date.now()}`, await mkCustomer(db, 'CALCA'), 'NHAP');
      const e = await expectSqlErrorInTx(db, () =>
        db.query(
          `INSERT INTO pol.policy_line
             (policy_id, product_id, product_code_snap, product_name_snap,
              company_price_snap, wholesale_price, cpbh, discount_rate)
           VALUES ($1,$2,'VT-04','Am',100000,90000,ARRAY[1000,-5]::bigint[],10.00)`,
          [id, crypto.randomUUID()]));
      expect(e.code).toBe('23514'); // check_violation
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

/**
 * 0022 — một phạm vi chiết khấu chỉ có một quy định.
 *
 * Kiểm ở tầng CSDL chứ không chỉ qua HTTP vì đây là thứ duy nhất còn đứng vững
 * khi ai đó chèn thẳng bằng SQL, và vì cái dễ sai nhất — NULL — là hành vi của
 * chỉ mục chứ không phải của mã ứng dụng.
 */
describe('0022 · uq_rule_pham_vi — trùng phạm vi thì CSDL từ chối', () => {
  const mkGroup = async (c: Client, tag: string) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO cat.product_group (code, name) VALUES ($1, 'Nhom test') RETURNING id`,
      [`ZZ-G-${tag}-${crypto.randomUUID().slice(0, 8)}`],
    );
    return r.rows[0]!.id;
  };

  // Mã sinh ngẫu nhiên: nhóm test này kiểm chỉ mục PHẠM VI, nên mã phải luôn
  // khác nhau để không vướng chỉ mục MÃ và làm lẫn hai loại trùng (0024).
  const mkRule = (
    c: Client,
    v: {
      groupId?: string | null;
      customerType?: number | null;
      from?: string;
      threshold?: number;
    } = {},
  ) =>
    c.query(
      `INSERT INTO cat.discount_rule
         (code, product_group_id, customer_type, effective_from, threshold_rate2)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        `ZZ-CK-${crypto.randomUUID().slice(0, 8)}`,
        v.groupId ?? null,
        v.customerType ?? null,
        v.from ?? '2020-01-01',
        v.threshold ?? 1500,
      ],
    );

  it('hai dòng cùng nhóm, cùng loại KH, cùng ngày → 23505', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db, 'DUP1');
      await mkRule(db, { groupId: g, customerType: 1 });
      const err = await expectSqlErrorInTx(db, () =>
        mkRule(db, { groupId: g, customerType: 1, threshold: 2500 }));
      expect(err.code).toBe('23505');
      expect(err.message).toContain('uq_rule_pham_vi');
    });
  });

  /**
   * Đây là test QUAN TRỌNG NHẤT của nhóm này.
   *
   * Mặc định Postgres coi mỗi NULL là một giá trị riêng, nên nếu chỉ mục thiếu
   * `NULLS NOT DISTINCT` thì hai dòng "mọi nhóm, mọi loại KH" vẫn lọt — mà đó
   * chính là cặp dễ khai trùng nhất, vì nó là dòng người ta khai đầu tiên khi
   * chưa nghĩ tới phạm vi.
   */
  it('hai dòng để trống CẢ HAI ô phạm vi, cùng ngày → vẫn 23505', async () => {
    await inRollback(db, async () => {
      await mkRule(db, { from: '2021-03-01' });
      const err = await expectSqlErrorInTx(db, () =>
        mkRule(db, { from: '2021-03-01', threshold: 2000 }));
      expect(err.code).toBe('23505');
      expect(err.message).toContain('uq_rule_pham_vi');
    });
  });

  it('cùng phạm vi nhưng KHÁC ngày hiệu lực thì nhận — đó là cách đổi ngưỡng', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db, 'DUP2');
      await mkRule(db, { groupId: g, customerType: 2, from: '2020-01-01', threshold: 1500 });
      await mkRule(db, { groupId: g, customerType: 2, from: '2026-01-01', threshold: 2000 });
      const r = await db.query(
        `SELECT count(*)::int n FROM cat.discount_rule WHERE product_group_id = $1`, [g]);
      expect(r.rows[0].n).toBe(2);
    });
  });

  it('khác phạm vi, cùng ngày thì nhận — dòng chung và dòng riêng đều đúng', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db, 'DUP3');
      await mkRule(db, { groupId: g });
      await mkRule(db, { groupId: g, customerType: 1 });
      await mkRule(db, { groupId: g, customerType: 2 });
      const r = await db.query(
        `SELECT count(*)::int n FROM cat.discount_rule WHERE product_group_id = $1`, [g]);
      expect(r.rows[0].n).toBe(3);
    });
  });
});

/**
 * 0022 — dòng hồ sơ phải nói được ngưỡng của nó từ đâu ra.
 *
 * Ràng buộc này giữ hai cột KHỚP NHAU. Không có nó thì một dòng có thể mang
 * `threshold_source='RULE'` mà `rule_code_snap` rỗng — tức là khẳng định "có quy
 * định" nhưng không chỉ ra được quy định nào, đúng thứ mà hai cột này sinh ra
 * để tránh.
 */
describe('0022 · nguon_nguong_hop_le — nguồn ngưỡng và mã quy định phải khớp', () => {
  const mkLine = (c: Client, policyId: string, v: { source: string | null; ruleCode: string | null }) =>
    c.query(
      `INSERT INTO pol.policy_line
         (policy_id, product_id, product_code_snap, product_name_snap,
          company_price_snap, wholesale_price, discount_rate,
          threshold_snap, threshold_source, rule_code_snap)
       VALUES ($1, $2, 'SP-01', 'San pham test', 100000, 90000, 10.00, 30.00, $3, $4)`,
      [policyId, crypto.randomUUID(), v.source, v.ruleCode],
    );

  it("source='RULE' mà không có rule_code_snap → 23514", async () => {
    await inRollback(db, async () => {
      const pol = await mkPolicy(db, `NG-A-${Date.now()}`, await mkCustomer(db, 'NGA'), 'NHAP');
      const err = await expectSqlErrorInTx(db, () =>
        mkLine(db, pol, { source: 'RULE', ruleCode: null }));
      expect(err.code).toBe('23514');
      expect(err.message).toContain('nguon_nguong_hop_le');
    });
  });

  it("source='PRODUCT_DEFAULT' mà lại có rule_code_snap → 23514", async () => {
    await inRollback(db, async () => {
      const pol = await mkPolicy(db, `NG-B-${Date.now()}`, await mkCustomer(db, 'NGB'), 'NHAP');
      const err = await expectSqlErrorInTx(db, () =>
        mkLine(db, pol, { source: 'PRODUCT_DEFAULT', ruleCode: 'CK-01' }));
      expect(err.code).toBe('23514');
    });
  });

  it('cả hai cùng NULL thì nhận — đó là dòng lập trước 0022', async () => {
    await inRollback(db, async () => {
      const pol = await mkPolicy(db, `NG-C-${Date.now()}`, await mkCustomer(db, 'NGC'), 'NHAP');
      await mkLine(db, pol, { source: null, ruleCode: null });
      const r = await db.query(
        `SELECT count(*)::int n FROM pol.policy_line WHERE policy_id = $1`, [pol]);
      expect(r.rows[0].n).toBe(1);
    });
  });
});

/**
 * 0024 — mã quy định là khoá chính, và chuẩn hoá như mã vật tư.
 */
describe('0024 · mã quy định chiết khấu', () => {
  const mkRule = (c: Client, ma: string) =>
    c.query(
      `INSERT INTO cat.discount_rule (code, customer_type, effective_from, threshold_rate2)
       VALUES ($1, 1, $2, 1500)`,
      [ma, `20${String(Math.floor(Math.random() * 90) + 10)}-01-01`],
    );

  it('trùng mã y nguyên → 23505', async () => {
    await inRollback(db, async () => {
      await mkRule(db, 'ZZ-CK-A');
      const err = await expectSqlErrorInTx(db, () => mkRule(db, 'ZZ-CK-A'));
      expect(err.code).toBe('23505');
    });
  });

  it('trùng mã chỉ khác HOA THƯỜNG hoặc khoảng trắng → vẫn 23505', async () => {
    // Hai mã người dùng đọc ra giống hệt nhau. Để lọt thì một trong hai không
    // bao giờ tìm được bằng ô tìm kiếm.
    await inRollback(db, async () => {
      await mkRule(db, 'ZZ-CK-B');
      const err = await expectSqlErrorInTx(db, () => mkRule(db, '  zz-ck-b  '));
      expect(err.code).toBe('23505');
      expect(err.message).toContain('uq_rule_code_norm');
    });
  });

  it('mã toàn khoảng trắng bị CSDL chặn, không chỉ chặn ở ứng dụng', async () => {
    await inRollback(db, async () => {
      const err = await expectSqlErrorInTx(db, () => mkRule(db, '   '));
      expect(err.code).toBe('23514');
      expect(err.message).toContain('rule_code_khong_rong');
    });
  });

  it('cột id cũ KHÔNG còn tồn tại', async () => {
    const r = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'cat' AND table_name = 'discount_rule' AND column_name = 'id'`,
    );
    expect(r.rowCount).toBe(0);
  });
});

/**
 * 0025 — ba cột ngưỡng mặc định biến mất khỏi sản phẩm.
 *
 * Kiểm ở tầng lược đồ chứ không chỉ qua API: cột còn nằm đó thì sớm muộn có
 * người ghi vào nó, và nguồn ngưỡng thứ hai sống lại mà không ai để ý.
 */
describe('0025 · sản phẩm không còn ngưỡng mặc định', () => {
  it('ba cột default_rate2_type* đã bị xoá', async () => {
    const r = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'cat' AND table_name = 'product'
          AND column_name LIKE 'default_rate2%'`,
    );
    expect(r.rowCount).toBe(0);
  });

  it("nhãn PRODUCT_DEFAULT vẫn CHÈN ĐƯỢC — dòng hồ sơ cũ mang nó", async () => {
    // Cấm nhãn cũ là làm hỏng chính những dòng đã lập theo nguồn ấy. Ngưỡng của
    // chúng vẫn đúng tại thời điểm chúng được lập.
    await inRollback(db, async () => {
      const pol = await mkPolicy(db, `PD-${Date.now()}`, await mkCustomer(db, 'PD'), 'NHAP');
      await db.query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, discount_rate,
            threshold_snap, threshold_source, rule_code_snap)
         VALUES ($1, $2, 'SP-01', 'San pham cu', 100000, 90000, 10.00,
                 15.00, 'PRODUCT_DEFAULT', NULL)`,
        [pol, crypto.randomUUID()],
      );
      const r = await db.query(
        `SELECT threshold_source FROM pol.policy_line WHERE policy_id = $1`, [pol]);
      expect(r.rows[0].threshold_source).toBe('PRODUCT_DEFAULT');
    });
  });

  it("source='KHONG_CO' đi kèm ngưỡng RỖNG, và không bao giờ vượt ngưỡng", async () => {
    await inRollback(db, async () => {
      const pol = await mkPolicy(db, `KC-${Date.now()}`, await mkCustomer(db, 'KC'), 'NHAP');
      await db.query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, discount_rate,
            threshold_snap, threshold_source, rule_code_snap)
         VALUES ($1, $2, 'SP-01', 'San pham', 100000, 10000, 90.00,
                 NULL, 'KHONG_CO', NULL)`,
        [pol, crypto.randomUUID()],
      );
      const r = await db.query(
        `SELECT over_threshold FROM pol.policy_line WHERE policy_id = $1`, [pol]);
      // Chiết khấu 90% mà cờ vẫn tắt: cột sinh đã tính sẵn `IS NOT NULL`.
      expect(r.rows[0].over_threshold).toBe(false);
    });
  });
});

/**
 * 0026 — quy định chiết khấu chỉ còn HAI chiều, và ba danh mục địa lý biến mất.
 *
 * Kiểm ở tầng lược đồ vì đây là loại thứ chỉ chết hẳn khi cột chết: cột
 * `channel_code` còn nằm đó thì một script nhập liệu vẫn ghi vào được, và chiều
 * thứ ba sống lại trong im lặng — `resolve` không đọc nó nữa nhưng chỉ mục phạm
 * vi thì vẫn tính nó là một phần của "phạm vi".
 */
describe('0026 · chiết khấu chỉ phụ thuộc nhóm sản phẩm và loại khách hàng', () => {
  it('cột channel_code đã bị xoá khỏi quy định', async () => {
    const r = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'cat' AND table_name = 'discount_rule'
          AND column_name = 'channel_code'`,
    );
    expect(r.rowCount).toBe(0);
  });

  it('ba bảng danh mục địa lý đã bị xoá', async () => {
    const r = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'cat' AND table_name IN ('province', 'hospital', 'channel')`,
    );
    expect(r.rowCount).toBe(0);
  });

  it('khách hàng không còn ba cột phân loại', async () => {
    const r = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'cus' AND table_name = 'customer'
          AND column_name IN ('province_code', 'hospital_code', 'channel_code')`,
    );
    expect(r.rowCount).toBe(0);
  });

  it('read model báo cáo cũng không còn ba cột ấy', async () => {
    const r = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'rpt' AND table_name = 'policy_row'
          AND column_name IN ('province_code', 'hospital_code', 'channel_code')`,
    );
    expect(r.rowCount).toBe(0);
  });

  /**
   * Trọng số 2/1 phải giữ tính nhị phân — đó là thứ làm cho hai phạm vi KHÁC
   * nhau không bao giờ hoà điểm, tức là thứ giữ cho `resolve` tất định mà không
   * cần tới tầng phân xử theo mã.
   */
  it('điểm cụ thể: bốn tổ hợp cho bốn con số phân biệt', async () => {
    await inRollback(db, async () => {
      const g = (
        await db.query<{ id: string }>(
          `INSERT INTO cat.product_group (code, name) VALUES ($1, 'Nhom test') RETURNING id`,
          [`ZZ-G-SPEC-${crypto.randomUUID().slice(0, 8)}`],
        )
      ).rows[0]!.id;
      const rule = (groupId: string | null, customerType: number | null) =>
        db.query(
          `INSERT INTO cat.discount_rule
             (code, product_group_id, customer_type, effective_from, threshold_rate2)
           VALUES ($1,$2,$3,'2019-01-01',1500)`,
          [`ZZ-CK-${crypto.randomUUID().slice(0, 8)}`, groupId, customerType],
        );
      await rule(null, null);
      await rule(null, 1);
      await rule(g, null);
      await rule(g, 1);
      const r = await db.query<{ specificity: number }>(
        `SELECT specificity FROM cat.discount_rule
          WHERE effective_from = '2019-01-01' ORDER BY specificity`,
      );
      expect(r.rows.map((x) => x.specificity)).toEqual([0, 1, 2, 3]);
    });
  });
});
