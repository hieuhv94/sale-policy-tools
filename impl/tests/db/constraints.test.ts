/**
 * Bốn bất biến cưỡng chế ở tầng CSDL (quyết định kiến trúc AD-04).
 *
 * Test ở đây cố tình chạy SQL THÔ chứ không qua tầng ứng dụng: điều cần chứng minh
 * là ngay cả khi ai đó sửa thẳng vào CSDL thì ràng buộc vẫn giữ.
 *
 * MỌI test có ghi đều bọc trong `inRollback`. Bản đầu không bọc và để lại 135
 * dòng trong pol.policy sau vài chục lần chạy — trong đó có hồ sơ DA_XOA mà
 * chính trigger ở đây cấm xoá, nên chúng vĩnh viễn không dọn được. Đúng bất biến
 * mà test này chứng minh lại là thứ biến rác test thành rác không xoá nổi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, expectSqlErrorInTx, inRollback, mkCustomer } from './helpers';
import { norm } from '@csbh/http-kit';
import { STATUSES } from '@csbh/domain-policy';

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
            company_price_snap, wholesale_price, discount_rate, ngay_ap_dung)
         VALUES ($1,$2,'VT-01','San pham',100000,90000,15.00, current_date)`, [id, p]);
      await line(prod);
      const err = await expectSqlErrorInTx(db, () => line(prod));
      expect(err.code).toBe('23505');
    });
  });
});

describe('POL-14 · hồ sơ Từ chối không ai xoá được', () => {
  it('DELETE bằng SQL thô vẫn bị chặn và báo lỗi rõ ràng', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `POL14-${Date.now()}`, await mkCustomer(db, 'POL14'), 'DA_XOA');
      const err = await expectSqlErrorInTx(db, () =>
        db.query('DELETE FROM pol.policy WHERE id=$1', [id]));
      expect(err.message).toContain('DA_XOA');
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

  /*
   * Trạng thái kết thúc THỨ HAI, thêm ở `0035`.
   *
   * Cùng một trigger, cùng một lý do: hồ sơ `DA_XOA` giữ nguyên lịch sử của nó,
   * và `pol.policy_event` có `ON DELETE CASCADE` — xoá dòng hồ sơ là xoá luôn
   * phần nhật ký mà cả tính năng ấy sinh ra để giữ.
   */
  it('`DA_XOA` cũng không xoá nổi bằng SQL thô (`0035`)', async () => {
    await inRollback(db, async () => {
      const id = await mkPolicy(db, `P35-${Date.now()}`, await mkCustomer(db, 'P35'), 'DA_XOA');
      const err = await expectSqlErrorInTx(db, () =>
        db.query('DELETE FROM pol.policy WHERE id=$1', [id]));
      // Thông báo nêu ĐÚNG trạng thái đang chặn, không phải một câu chung chung:
      // người đọc log phải biết ngay hồ sơ ấy bị bỏ hay bị từ chối.
      expect(err.message).toContain('DA_XOA');
      const still = await db.query('SELECT count(*)::int n FROM pol.policy WHERE id=$1', [id]);
      expect(still.rows[0].n).toBe(1);
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
            discount_rate, threshold_snap, ngay_ap_dung)
         VALUES ($1,$2,'VT-02','Nutricare Gold',100000,90000,
                 ARRAY[2000,1500,1000,500]::bigint[],15.00,12.34, current_date)`,
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
            company_price_snap, wholesale_price, discount_rate, threshold_snap, ngay_ap_dung)
         VALUES ($1,$2,'VT-03','Khong co CPBH',100000,90000,10.00,12.34, current_date)`,
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
              company_price_snap, wholesale_price, cpbh, discount_rate, ngay_ap_dung)
           VALUES ($1,$2,'VT-04','Am',100000,90000,ARRAY[1000,-5]::bigint[],10.00, current_date)`,
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
            company_price_snap, wholesale_price, discount_rate, ngay_ap_dung)
         VALUES ($1,$2,'VT-03','X',0,90000,15.00, current_date)`, [id, crypto.randomUUID()]));
      expect(err.code).toBe('23514');                       // check_violation
    });
  });
});

describe('WF-02 · danh sách trạng thái là danh sách đóng', () => {
  it('trạng thái ngoài 12 giá trị bị CSDL từ chối', async () => {
    await inRollback(db, async () => {
      const cust = await mkCustomer(db, 'WF02');
      const err = await expectSqlErrorInTx(db, () =>
        mkPolicy(db, `WF02-${Date.now()}`, cust, 'DANG_DUYET'));
      expect(err.code).toBe('22P02');                       // invalid_text_representation
    });
  });

  it('`0048` enum trong CSDL khớp ĐÚNG `STATUSES`, kể cả thứ tự', async () => {
    const r = await db.query(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
       WHERE t.typname='policy_status' ORDER BY e.enumsortorder`);
    /*
     * `0048` dựng LẠI cả kiểu, nên thứ tự giờ là thứ tự khai trong migration —
     * `DA_XOA` không còn bị đẩy xuống cuối bởi `ADD VALUE` như hồi `0035`.
     *
     * Và `TBP_DA_KY_SO` đã đi hẳn: Postgres không có `ALTER TYPE ... DROP VALUE`,
     * nên `0048` đổi tên kiểu cũ, dựng kiểu mới, chuyển ba cột sang rồi bỏ kiểu
     * cũ. Ca này là chốt chặn: một migration sau vô tình `ADD VALUE` nó lại thì
     * đỏ ngay.
     */
    /*
     * `0225` — đối chiếu với `STATUSES` chứ không gõ lại dãy: trạng thái thứ
     * mười một (`SA_SUA_BAN_CUNG`) thêm bằng `ADD VALUE … BEFORE 'CHO_KT_L2'`,
     * nên thứ tự enum vẫn đi theo thứ tự các bước, đúng như `STATUSES`. Một dãy
     * gõ tay ở đây là bản chép thứ ba của cùng một danh sách.
     */
    expect(r.rows.map((x) => x.enumlabel)).toEqual([...STATUSES]);
    expect(STATUSES).not.toContain('TBP_DA_KY_SO');
  });

  it('`0048` không cột nào còn dùng kiểu cũ, và kiểu cũ đã biến mất', async () => {
    // Đổi tên kiểu rồi quên bỏ là để lại một kiểu mồ côi mang đúng giá trị vừa
    // gỡ — lần sau ai đó khai cột theo nó thì giá trị quay lại mà không ai thấy.
    const con = await db.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'pol' AND t.typname = 'policy_status_cu'`);
    expect(con.rowCount, 'kiểu cũ vẫn còn trong CSDL').toBe(0);
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
      customerTypes?: number[] | null;
      from?: string;
      threshold?: number;
    } = {},
  ) =>
    c.query(
      `INSERT INTO cat.discount_rule
         (code, product_group_id, customer_types, effective_from, threshold_rate2)
       VALUES ($1,$2,$3::smallint[],$4,$5)`,
      [
        `ZZ-CK-${crypto.randomUUID().slice(0, 8)}`,
        v.groupId ?? null,
        v.customerTypes ?? null,
        v.from ?? '2020-01-01',
        v.threshold ?? 1500,
      ],
    );

  it('hai dòng cùng nhóm, cùng loại KH, cùng ngày → 23505', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db, 'DUP1');
      await mkRule(db, { groupId: g, customerTypes: [1] });
      const err = await expectSqlErrorInTx(db, () =>
        mkRule(db, { groupId: g, customerTypes: [1], threshold: 2500 }));
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
      await mkRule(db, { groupId: g, customerTypes: [2], from: '2020-01-01', threshold: 1500 });
      await mkRule(db, { groupId: g, customerTypes: [2], from: '2026-01-01', threshold: 2000 });
      const r = await db.query(
        `SELECT count(*)::int n FROM cat.discount_rule WHERE product_group_id = $1`, [g]);
      expect(r.rows[0].n).toBe(2);
    });
  });

  it('khác phạm vi, cùng ngày thì nhận — dòng chung và dòng riêng đều đúng', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db, 'DUP3');
      await mkRule(db, { groupId: g });
      await mkRule(db, { groupId: g, customerTypes: [1] });
      await mkRule(db, { groupId: g, customerTypes: [2] });
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
          threshold_snap, threshold_source, rule_code_snap, ngay_ap_dung)
       VALUES ($1, $2, 'SP-01', 'San pham test', 100000, 90000, 10.00, 30.00, $3, $4, current_date)`,
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
      `INSERT INTO cat.discount_rule (code, customer_types, effective_from, threshold_rate2)
       VALUES ($1, ARRAY[1]::smallint[], $2, 1500)`,
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
            threshold_snap, threshold_source, rule_code_snap, ngay_ap_dung)
         VALUES ($1, $2, 'SP-01', 'San pham cu', 100000, 90000, 10.00,
                 15.00, 'PRODUCT_DEFAULT', NULL, current_date)`,
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
            threshold_snap, threshold_source, rule_code_snap, ngay_ap_dung)
         VALUES ($1, $2, 'SP-01', 'San pham', 100000, 10000, 90.00,
                 NULL, 'KHONG_CO', NULL, current_date)`,
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
      const rule = (groupId: string | null, customerTypes: number[] | null) =>
        db.query(
          `INSERT INTO cat.discount_rule
             (code, product_group_id, customer_types, effective_from, threshold_rate2)
           VALUES ($1,$2,$3::smallint[],'2019-01-01',1500)`,
          [`ZZ-CK-${crypto.randomUUID().slice(0, 8)}`, groupId, customerTypes],
        );
      await rule(null, null);
      await rule(null, [1]);
      await rule(g, null);
      await rule(g, [1]);
      const r = await db.query<{ specificity: number }>(
        `SELECT specificity FROM cat.discount_rule
          WHERE effective_from = '2019-01-01' ORDER BY specificity`,
      );
      expect(r.rows.map((x) => x.specificity)).toEqual([0, 1, 2, 3]);
    });
  });
});

/**
 * 0027 — ghi chú của dòng sản phẩm.
 *
 * Chặn chuỗi rỗng ở CSDL chứ không chỉ ở DTO: chuỗi rỗng và NULL cùng nghĩa
 * "không ghi chú", và hai cách viết một nghĩa là hai cách để một bộ lọc sót.
 * Tầng ứng dụng đã quên chuẩn hoá một lần rồi (`delivery_address`).
 */
describe('0027 · ghi_chu_khong_rong — ghi chú rỗng thì không phải ghi chú', () => {
  const mkLine = (c: Client, policyId: string, note: string | null) =>
    c.query(
      `INSERT INTO pol.policy_line
         (policy_id, product_id, product_code_snap, product_name_snap,
          company_price_snap, wholesale_price, discount_rate, note, ngay_ap_dung)
       VALUES ($1, $2, 'SP-01', 'San pham', 100000, 90000, 10.00, $3, current_date)`,
      [policyId, crypto.randomUUID(), note],
    );

  it('NULL là hợp lệ — phần lớn dòng không có ghi chú', async () => {
    await inRollback(db, async () => {
      const pol = await mkPolicy(db, `GC-${Date.now()}`, await mkCustomer(db, 'GC'), 'NHAP');
      await mkLine(db, pol, null);
      const r = await db.query(`SELECT note FROM pol.policy_line WHERE policy_id = $1`, [pol]);
      expect(r.rows[0].note).toBeNull();
    });
  });

  it('chuỗi rỗng và chuỗi toàn khoảng trắng đều bị từ chối', async () => {
    for (const rong of ['', '   ']) {
      await inRollback(db, async () => {
        const pol = await mkPolicy(db, `GC-${Date.now()}-${rong.length}`,
          await mkCustomer(db, 'GC'), 'NHAP');
        const err = await expectSqlErrorInTx(db, () => mkLine(db, pol, rong));
        expect(err.code).toBe('23514');
        expect(err.message).toContain('ghi_chu_khong_rong');
      });
    }
  });
});

// =============================================================================
// `0049` — phép bỏ dấu ở TypeScript và ở SQL phải cho CÙNG một kết quả
// =============================================================================

describe('`0049` sys.khong_dau khớp từng ký tự với norm() của TypeScript', () => {
  /*
   * Phép chuẩn hoá này có HAI bản cài đặt, và không tránh được:
   *
   *   - `norm()` ở `packages/http-kit` — dùng cho từ khoá lúc truy vấn.
   *   - `sys.khong_dau()` trong CSDL — dùng cho cột sinh `name_norm` và
   *     `full_name_norm`, vì cột sinh phải tính được bằng SQL.
   *
   * Hai bản lệch nhau là kiểu hỏng TỆ NHẤT của cả tính năng tìm kiếm: tìm được
   * vài chuỗi, không tìm được vài chuỗi khác, và không có thông báo lỗi nào. Ca
   * này là thứ duy nhất giữ chúng bằng nhau.
   */
  const MAU = [
    'Sữa Nutricare Gold 900g',
    'Đà Nẵng',
    'ĐƯỜNG ăn kiêng',
    'Bột dinh dưỡng cho người tiểu đường',
    'Ngũ cốc HG',
    'Nutricare  Metabolic', // hai khoảng trắng — norm() gộp lại thành một
    '  lề trước và sau  ',
    'ĂÂÊÔƠƯăâêôơư',
    'Trần Thị Mỹ Hạnh',
    'abc-123',
  ];

  it('mười chuỗi tiếng Việt cho ra cùng kết quả ở hai bên', async () => {
    const r = await db.query<{ sql: string }>(
      `SELECT sys.khong_dau(x) AS sql FROM unnest($1::text[]) AS t(x)`,
      [MAU],
    );
    // So CẢ MẢNG một lần thay vì vòng lặp `expect` từng dòng: lệch ở đâu thì
    // báo lỗi in ra cả hai mảng cạnh nhau, đọc ra ngay chuỗi nào hỏng.
    expect(r.rows.map((x) => x.sql)).toEqual(MAU.map((x) => norm(x)));
  });

  it('chữ đ — chỗ mà extension unaccent làm sai và vì sao không dùng nó', async () => {
    const r = await db.query<{ sql: string }>(`SELECT sys.khong_dau('Đà Nẵng') AS sql`);
    expect(r.rows[0]!.sql).toBe('da nang');
    expect(norm('Đà Nẵng')).toBe('da nang');
  });

  it('cột sinh của sản phẩm và người dùng đều đi qua đúng hàm ấy', async () => {
    await inRollback(db, async () => {
      const g = await db.query<{ id: string }>(
        `INSERT INTO cat.product_group (code, name) VALUES ($1,'Nhom KD') RETURNING id`,
        [`KD-${Date.now()}`],
      );
      const p = await db.query<{ name_norm: string }>(
        `INSERT INTO cat.product (code, name, group_id) VALUES ($1,'Sữa Đặc Ông Thọ',$2)
         RETURNING name_norm`,
        [`KD-${Date.now()}`, g.rows[0]!.id],
      );
      expect(p.rows[0]!.name_norm).toBe('sua dac ong tho');

      const u = await db.query<{ full_name_norm: string }>(
        `INSERT INTO idn.app_user (username, email, full_name, role, password_hash)
         VALUES ($1,$2,'Đỗ Thị Hường','TDV','x') RETURNING full_name_norm`,
        [`kd${Date.now()}`, `kd${Date.now()}@csbh.test`],
      );
      expect(u.rows[0]!.full_name_norm).toBe('do thi huong');
    });
  });
});

// =============================================================================
// `0067` — mọi mẫu trong bảng đều dùng được
// =============================================================================

describe('`0067` CSDL không còn khái niệm mẫu "đang dùng"', () => {
  /*
   * Luật này đi qua ba đời, và ca kiểm thử đi theo:
   *
   *   `0050` — mỗi (loại × khổ giấy) đúng MỘT mẫu đang dùng, giữ bằng hai
   *            partial unique index.
   *   `0058` — bỏ hai index ấy: người xem chọn thẳng mẫu, nên nhiều mẫu cùng
   *            đang dùng KHÔNG còn là mập mờ mà chính là cái danh sách.
   *   `0067` — bỏ luôn cột `is_active` và `published_at`: nếu mọi mẫu đều dùng
   *            được thì một cột nói "có dùng được không" chỉ còn một giá trị.
   *
   * Kiểm bằng cách CHÈN THẬT rồi cuộn lại, không phải bằng cách đọc `pg_indexes`
   * cho vắng tên: một index tương đương đặt tên khác ở lần migration sau sẽ lọt
   * qua phép đọc tên, còn phép chèn thì không.
   */
  it('hai mẫu HO_SO cùng khổ giấy — chèn được, không ràng buộc nào chặn', async () => {
    await inRollback(db, async () => {
      const f = await db.query<{ id: string }>(`SELECT id FROM doc.stored_file LIMIT 1`);
      expect(f.rows[0]?.id, 'cần ít nhất một file trong kho để mượn khoá ngoại').toBeDefined();
      const u = await db.query<{ id: string }>(`SELECT id FROM idn.app_user LIMIT 1`);

      for (const ten of ['Mẫu một', 'Mẫu hai']) {
        await db.query(
          `INSERT INTO doc.contract_template (name, file_id, updated_by, kind, paper_size)
           VALUES ($1,$2,$3,'HO_SO','a4p')`,
          [ten, f.rows[0]!.id, u.rows[0]!.id],
        );
      }
      const n = await db.query<{ c: string }>(
        `SELECT count(*) AS c FROM doc.contract_template
          WHERE kind = 'HO_SO' AND paper_size = 'a4p'`,
      );
      expect(Number(n.rows[0]!.c)).toBeGreaterThanOrEqual(2);
    });
  });

  it('hai cột vòng đời ĐÃ BIẾN MẤT khỏi lược đồ', async () => {
    // Đọc lược đồ chứ không chèn: `is_active` còn đó mà không ai đọc thì mã vẫn
    // chạy đúng, nhưng dòng mẫu mang một cột nói dối — và người đọc CSDL sau này
    // sẽ tin nó.
    const r = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'doc' AND table_name = 'contract_template'
          AND column_name IN ('is_active','published_at')`,
    );
    expect(r.rows.map((x) => x.column_name)).toEqual([]);
  });

  it('bảng ánh xạ chỉ còn "ô trống nào → trường nào"', async () => {
    // `format` và `required` cùng đi ở `0067`: định dạng gắn cứng vào TRƯỜNG
    // nguồn, còn mục bắt buộc kiểm theo muc 11.1 chứ không theo cờ người dùng
    // tự đánh cho từng ô.
    const r = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'doc' AND table_name = 'contract_template_field'
          AND column_name IN ('format','required')`,
    );
    expect(r.rows.map((x) => x.column_name)).toEqual([]);
  });

  it('mẫu HỢP ĐỒNG khai khổ giấy — không còn bị CHECK chặn', async () => {
    // `0050` cấm mẫu hợp đồng có khổ giấy vì cột ấy chỉ dùng để tra mẫu hồ sơ.
    // Từ `0058` nó là nhãn đọc từ file, và hợp đồng cũng in ra giấy.
    await inRollback(db, async () => {
      const f = await db.query<{ id: string }>(`SELECT id FROM doc.stored_file LIMIT 1`);
      const u = await db.query<{ id: string }>(`SELECT id FROM idn.app_user LIMIT 1`);
      await db.query(
        `INSERT INTO doc.contract_template (name, file_id, updated_by, kind, paper_size)
         VALUES ('Hợp đồng khổ ngang',$1,$2,'HOP_DONG','a4l')`,
        [f.rows[0]!.id, u.rows[0]!.id],
      );
    });
  });
});

// =============================================================================
// `0059` — nhật ký tải bản mềm và hợp đồng đã xoá hẳn
// =============================================================================

describe('`0059` không còn dòng lịch sử tải bản mềm hay hợp đồng', () => {
  /*
   * Ca này canh HAI thứ cùng lúc, và cả hai đều cần:
   *
   *   1. Migration `0059` đã dọn sạch những dòng cũ.
   *   2. Không đường nào trong mã còn ghi thêm — bộ kiểm thử vừa chạy qua hàng
   *      trăm lượt dựng bản mềm và xuất hợp đồng ngay trước ca này, nên nếu một
   *      đường nào còn sót thì đây là nơi nó lộ ra.
   *
   * Điểm thứ hai là lý do ca này nằm ở tầng CSDL chứ không ở tầng HTTP: nó nhìn
   * TOÀN BỘ bảng, không nhìn một hồ sơ do chính nó dựng.
   */
  it('bảng pol.policy_event sạch mã TAI_HO_SO và TAI_HOP_DONG', async () => {
    const r = await db.query<{ action: string; n: string }>(
      `SELECT action, count(*) AS n FROM pol.policy_event
        WHERE action IN ('TAI_HO_SO','TAI_HOP_DONG') GROUP BY action`,
    );
    expect(r.rows, `còn sót: ${JSON.stringify(r.rows)}`).toEqual([]);
  });

  it('nhưng nhật ký tải BẢN CỨNG thì vẫn ghi — không dọn nhầm', async () => {
    // Phép đối chứng. Không có nó thì một câu DELETE quét sạch mọi mã `TAI_%`
    // cũng làm ca trên xanh, và cả tính năng biến mất mà không ai biết.
    const r = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM pol.policy_event
        WHERE action IN ('TAI_BAN_SCAN','TAI_TEP_DINH_KEM')`,
    );
    expect(Number(r.rows[0]!.n), 'bộ kiểm thử vừa tải bản scan vài lượt').toBeGreaterThan(0);
  });
});

/**
 * `0280` (migration `0133`) — một quy định mang một TẬP loại khách.
 *
 * Gọi thẳng CSDL, không qua service: service đã chuẩn hoá tập trước khi ghi, nên mọi ca ở
 * `catalog.test.ts` xanh dù ràng buộc ở đây có hay không. Đây là chỗ canh chốt thứ hai — một
 * script nhập liệu, một migration tay, một người sửa SQL — không đi qua `chuanLoaiKhach`.
 */
describe('0280 · customer_types — tập loại khách của quy định chiết khấu', () => {
  const mkGroup = async (c: Client) =>
    (
      await c.query<{ id: string }>(
        `INSERT INTO cat.product_group (code, name) VALUES ($1, 'Nhom test') RETURNING id`,
        [`ZZ-G-TAP-${crypto.randomUUID().slice(0, 8)}`],
      )
    ).rows[0]!.id;
  const rule = (c: Client, groupId: string | null, loai: string | null, from = '2020-01-01') =>
    c.query(
      `INSERT INTO cat.discount_rule (code, product_group_id, customer_types, effective_from, threshold_rate2)
       VALUES ($1, $2, $3::smallint[], $4, 1500)`,
      [`ZZ-CK-${crypto.randomUUID().slice(0, 8)}`, groupId, loai, from],
    );

  it('cột cũ `customer_type` đã biến mất, cột mới là mảng', async () => {
    const r = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'cat' AND table_name = 'discount_rule'
          AND column_name IN ('customer_type', 'customer_types')`,
    );
    expect(r.rows).toEqual([{ column_name: 'customer_types', data_type: 'ARRAY' }]);
  });

  it('CHECK: chỉ nhận {1}, {2}, {3}, {1,2}, {1,3}, {2,3} và NULL', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db);
      for (const [i, loai] of ['{1}', '{2}', '{3}', '{1,2}', '{1,3}', '{2,3}', null].entries()) {
        await rule(db, g, loai, `20${10 + i}-01-01`);
      }
      const r = await db.query(`SELECT count(*)::int n FROM cat.discount_rule WHERE product_group_id = $1`, [g]);
      expect(r.rows[0].n).toBe(7);
    });
  });

  it.each([
    ['{1,2,3}', 'đủ ba loại phải viết là NULL'],
    ['{3,1}', 'phải xếp tăng dần'],
    ['{1,1}', 'không lặp'],
    ['{4}', 'ngoài 1–3'],
    ['{0}', 'ngoài 1–3'],
    ['{}', 'rỗng phải là NULL'],
    ['{1,NULL}', 'không phần tử NULL'],
  ])('CHECK từ chối %s (%s)', async (loai) => {
    await inRollback(db, async () => {
      const g = await mkGroup(db);
      const err = await expectSqlErrorInTx(db, () => rule(db, g, loai));
      expect(err.code).toBe('23514');
      expect(err.message).toContain('rule_loai_khach_hop_le');
    });
  });

  it('hai tập GIAO NHAU ở một loại, cùng nhóm, cùng ngày → 23505', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db);
      await rule(db, g, '{1,3}');
      const err = await expectSqlErrorInTx(db, () => rule(db, g, '{3}'));
      expect(err.code).toBe('23505');
      expect(err.message).toContain('uq_rule_pham_vi_l3');
    });
  });

  it('hai tập KHÔNG giao nhau thì nhận; khác ngày thì nhận; "mọi loại" sống chung với tập', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db);
      await rule(db, g, '{1,3}');
      await rule(db, g, '{2}');
      await rule(db, g, '{1,3}', '2021-01-01');
      await rule(db, g, null);
      const r = await db.query(`SELECT count(*)::int n FROM cat.discount_rule WHERE product_group_id = $1`, [g]);
      expect(r.rows[0].n).toBe(4);
    });
  });

  it('hai dòng "mọi loại" cùng nhóm, cùng ngày → 23505 (kể cả cùng để trống nhóm)', async () => {
    await inRollback(db, async () => {
      const g = await mkGroup(db);
      await rule(db, g, null);
      expect((await expectSqlErrorInTx(db, () => rule(db, g, null))).code).toBe('23505');
    });
    await inRollback(db, async () => {
      await rule(db, null, null, '2031-05-05');
      expect((await expectSqlErrorInTx(db, () => rule(db, null, null, '2031-05-05'))).code).toBe('23505');
    });
  });

  it('NULL nhóm cũng là một giá trị trong chỉ mục: hai dòng {2} "mọi nhóm" cùng ngày → 23505', async () => {
    await inRollback(db, async () => {
      await rule(db, null, '{2}', '2032-02-02');
      expect((await expectSqlErrorInTx(db, () => rule(db, null, '{1,2}', '2032-02-02'))).code).toBe('23505');
    });
  });

  it('có ĐÚNG ba chỉ mục theo loại và một cho "mọi loại" — thêm loại thứ tư phải thêm chỉ mục', async () => {
    const r = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'cat' AND tablename = 'discount_rule' AND indexname LIKE 'uq_rule_pham_vi%'
        ORDER BY indexname`,
    );
    expect(r.rows.map((x) => x.indexname)).toEqual([
      'uq_rule_pham_vi_l1',
      'uq_rule_pham_vi_l2',
      'uq_rule_pham_vi_l3',
      'uq_rule_pham_vi_moi',
    ]);
    // Số loại khách của hệ thống = số chỉ mục theo loại. Gỡ một vế mà quên vế kia thì loại ấy
    // hết được canh trùng mà không gì đỏ.
    const ck = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'rule_loai_khach_hop_le'`,
    );
    expect(ck.rows[0]!.def).toMatch(/ARRAY\[\(1\)::smallint, \(2\)::smallint, \(3\)::smallint\]/);
  });
});
