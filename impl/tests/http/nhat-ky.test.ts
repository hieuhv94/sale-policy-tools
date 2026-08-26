/**
 * `0090` — nhật ký TRA ĐƯỢC: cửa sổ sáu tháng, bộ lọc, và cột "ai".
 *
 * Ba câu hỏi mà bộ kiểm này gác, theo đúng thứ tự chúng hỏng trước `0090`:
 *
 *   1. Nhật ký có nói được AI đã làm không — hay chỉ nói vai trò?
 *   2. Cửa sổ sáu tháng có được chặn ở MÁY CHỦ không — hay chỉ ở màn hình?
 *   3. Lọc theo người, hành động, IP có thật sự lọc không?
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createAuditApp } from '@csbh/audit/testing';
import { somNhat } from '@csbh/audit/window';
import { kemNguCanh, runWithContext } from '@csbh/http-kit';
import {
  accessTokenFor,
  bootCustomerListening,
  bootIdentityListening,
  bootPolicyListening,
  http,
  withAdminDb,
} from './app.js';

/**
 * Bộ đếm MST — MỖI khách hàng một mã số thuế riêng (`0104`).
 *
 * Dùng chung một số cho cả tệp thì `POST /customers` tra trùng MST trả về
 * danh sách lớn dần theo số khách hàng đã tạo — O(n²), và những ca chạy sau
 * cùng bắt đầu chạm ngưỡng quá giờ.
 */
let nMst = 0;

let identity: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
const khoiPhuc: (() => void)[] = [];
let audit: INestApplication;
const tok: Record<string, string> = {};

const aget = async (path: string, who: string) =>
  (await http(audit)).get(path).set('Authorization', `Bearer ${tok[who]}`);

/** Ghi thẳng một dòng nhật ký để khỏi phải dựng cả một luồng nghiệp vụ. */
async function ghi(row: {
  at: Date;
  action: string;
  actorId?: string | null;
  actorName?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  ip?: string | null;
  entity?: string;
  outcome?: string | null;
  targetLabel?: string | null;
  traceId?: string | null;
}) {
  await withAdminDb(async (c) => {
    // Vùng của tháng ấy phải tồn tại: bảng phân vùng theo `occurred_at` từ
    // `0008`, và một dòng của tháng chưa có vùng sẽ rơi vào vùng mặc định.
    await c.query(`SELECT aud.ensure_partition($1::date)`, [row.at]);
    await c.query(
      `INSERT INTO aud.audit_log
         (event_id, occurred_at, actor_id, actor_role, actor_name, actor_username, actor_ip,
          action, entity, outcome, target_label, trace_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::inet, $7, $8, $9, $10, $11)`,
      [
        row.at,
        row.actorId ?? null,
        row.actorRole ?? null,
        row.actorName ?? null,
        row.actorUsername ?? null,
        row.ip ?? null,
        row.action,
        row.entity ?? 'policy',
        row.outcome ?? null,
        row.targetLabel ?? null,
        row.traceId ?? null,
      ],
    );
  });
}

const ngayTruoc = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const MOC = `AUD90-${Date.now()}`;

beforeAll(async () => {
  const idn = await bootIdentityListening();
  identity = idn.app;
  khoiPhuc.push(idn.restore);
  const cus = await bootCustomerListening();
  customer = cus.app;
  khoiPhuc.push(cus.restore);
  // `identity` gọi sang `policy` và `customer` trong luồng vô hiệu hoá tài
  // khoản (bàn giao hồ sơ và khách hàng), nên hai service ấy phải đứng thật.
  const pol = await bootPolicyListening();
  policy = pol.app;
  khoiPhuc.push(pol.restore);
  for (const u of ['admin01', 'bld01', 'tdv01']) {
    tok[u] = await accessTokenFor(identity, u, 'Test@1234');
  }
  audit = await createAuditApp();
  await ghi({ at: ngayTruoc(1), action: `${MOC}_MOI`, actorName: 'Trần Minh', actorUsername: 'tdv04', actorRole: 'TDV', ip: '10.4.19.7', outcome: 'OK', targetLabel: 'CSBH-2026-000130' });
  await ghi({ at: ngayTruoc(2), action: `${MOC}_HONG`, actorName: 'Trần Minh', actorUsername: 'tdv04', actorRole: 'TDV', ip: '10.4.19.7', outcome: 'FAILED' });
  await ghi({ at: ngayTruoc(3), action: `${MOC}_KHAC`, actorName: 'Lê Hoa', actorUsername: 'kt01', actorRole: 'KE_TOAN', ip: '10.4.19.9' });
  // Ngoài cửa sổ: 200 ngày ~ 6,5 tháng.
  await ghi({ at: ngayTruoc(200), action: `${MOC}_CU`, actorName: 'Người xưa', actorUsername: 'tdv01' });
}, 60_000);

afterAll(async () => {
  await audit?.close();
  await policy?.close();
  await customer?.close();
  for (const f of khoiPhuc) f();
  await identity?.close();
});

describe('`0090` cột "ai" — câu hỏi đầu tiên của mọi cuộc kiểm toán', () => {
  it('trả về TÊN và tên đăng nhập, không chỉ vai trò', async () => {
    const r = await aget(`/audit/entries?action=${MOC}_MOI`, 'admin01');
    expect(r.status).toBe(200);
    const d = (r.body.items as Record<string, unknown>[])[0]!;
    expect(d['actorName']).toBe('Trần Minh');
    expect(d['actorUsername']).toBe('tdv04');
    // Ba trường còn lại của `0090`, cùng một lượt.
    expect(d['outcome']).toBe('OK');
    expect(d['targetLabel']).toBe('CSBH-2026-000130');
  }, 30_000);

  it('dòng cũ KHÔNG bị bịa tên', async () => {
    /*
     * Cách sai mà `0090` cố ý không làm: tra bảng tài khoản lúc đọc để điền tên
     * cho dòng cũ. Nó đưa TÊN HÔM NAY vào một sự việc của quá khứ, và với tài
     * khoản đã đổi tên thì đó là một dòng nhật ký sai người.
     */
    await ghi({ at: ngayTruoc(1), action: `${MOC}_KHUYET`, actorId: null });
    const r = await aget(`/audit/entries?action=${MOC}_KHUYET`, 'admin01');
    const d = (r.body.items as Record<string, unknown>[])[0]!;
    expect(d['actorName']).toBeNull();
  }, 30_000);
});

describe('`0090` cửa sổ sáu tháng chặn ở MÁY CHỦ', () => {
  it('không khai `from` thì tự chặn ở mép cửa sổ, dòng cũ không lọt vào', async () => {
    const r = await aget(`/audit/entries?action=${MOC}_CU`, 'admin01');
    expect(r.status).toBe(200);
    expect((r.body.items as unknown[]).length, 'dòng 200 ngày trước không được lọt').toBe(0);
    // Và câu trả lời NÓI RA cửa sổ, để giao diện không phải tự đoán.
    expect(r.body.window.months).toBe(6);
  }, 30_000);

  it('khai `from` xa hơn sáu tháng thì bị TỪ CHỐI, không phải im lặng cắt bớt', async () => {
    /*
     * Cắt âm thầm về mép cửa sổ cũng cho ra danh sách đúng, nhưng người dùng
     * tưởng mình đang xem cả năm — một câu trả lời đúng cho một câu hỏi khác.
     */
    const xa = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const r = await aget(`/audit/entries?from=${encodeURIComponent(xa)}`, 'admin01');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('AUDIT_WINDOW_EXCEEDED');
  }, 30_000);

  it('`user-activity` cũng chặn cùng cửa sổ — không có cửa sau', async () => {
    const xa = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const r = await aget(`/audit/user-activity?from=${encodeURIComponent(xa)}`, 'admin01');
    expect(r.status).toBe(200);
    // Thống kê không được đếm dòng nằm ngoài cửa sổ.
    expect(r.body.byAction[`${MOC}_CU`]).toBeUndefined();
  }, 30_000);

  it('mốc sáu tháng tính đúng theo THÁNG, không phải 180 ngày', () => {
    const bay = new Date('2026-08-22T10:00:00Z');
    expect(somNhat(bay).toISOString().slice(0, 10)).toBe('2026-02-22');
  });
});

describe('`0090` tên người đi TỪ NGỮ CẢNH vào sự kiện', () => {
  it('`kemNguCanh` gắn danh tính, IP và trace mà không cần ai truyền tay', () => {
    /*
     * Đây là bản sửa ở NGUỒN. Trước `0090` chỉ `policy` gắn `traceId` và
     * `actorIp`; catalog, customer, document ghi outbox thẳng nên nhật ký về
     * đổi giá hay đổi khách hàng đều KHÔNG có IP và không nối được chuỗi — một
     * khoảng hụt vô hình vì dòng nhật ký vẫn hiện ra bình thường.
     */
    const ra = runWithContext(
      { traceId: 'tr-x', ip: '10.0.0.9', actor: { id: 'u-1', role: 'TDV', name: 'Trần Minh', username: 'tdv04' } },
      () => kemNguCanh({ entity: 'policy', id: 'p-1' }),
    );
    expect(ra['traceId']).toBe('tr-x');
    expect(ra['actorIp']).toBe('10.0.0.9');
    expect(ra['actorId']).toBe('u-1');
    expect(ra['actorName']).toBe('Trần Minh');
    expect(ra['actorUsername']).toBe('tdv04');
  });

  it('KHÔNG ghép tên người đang bấm vào `actorId` của người khác', () => {
    /*
     * Bàn giao lúc vô hiệu hoá tài khoản phát sự kiện mang `actorId` của người
     * BỊ vô hiệu hoá, không phải của Quản trị đang bấm. Lấy tên từ ngữ cảnh ở
     * đó là dựng ra một dòng nhật ký sai người — đúng loại sai mà nhật ký không
     * được phép mắc.
     */
    const ra = runWithContext(
      { traceId: 'tr-y', actor: { id: 'quan-tri', role: 'QUAN_TRI', name: 'Quản trị' } },
      () => kemNguCanh({ actorId: 'nguoi-khac' }),
    );
    expect(ra['actorId']).toBe('nguoi-khac');
    expect(ra['actorName'], 'không được mượn tên của người đang bấm').toBeUndefined();
  });

  it('ngoài request thì không bịa gì cả', () => {
    // Consumer chạy nền và đường công khai không có người nào đang gọi.
    const ra = kemNguCanh({ entity: 'policy' });
    expect(ra['actorId']).toBeNull();
    expect(ra['traceId']).toBeNull();
  });

  it('ĐỐI CHIẾU: một request THẬT để lại tên người trong outbox', async () => {
    /*
     * Ba ca trên gọi thẳng `kemNguCanh`, nên chúng xanh kể cả khi `AuthGuard`
     * quên ghi người gọi vào ngữ cảnh — đo được ở lượt phá lại của `0090`.
     * Ca này đi qua HTTP thật: đăng nhập, lập một khách hàng, rồi đọc chính
     * dòng outbox mà sự kiện ấy sinh ra.
     *
     * Nó cũng là ca duy nhất chứng minh `customer` — service tới `0090` vẫn
     * ghi outbox thẳng, không qua helper nào — nay có đủ danh tính và IP.
     */
    const ma = `NK90${Date.now().toString().slice(-8)}`;
    const r = await (await http(customer))
      .post('/customers')
      .set('Authorization', `Bearer ${tok['tdv01']}`)
      .send({
        code: ma,
        customerType: 1,
        name: 'Nha thuoc kiem thu 0090',
        registeredAddress: 'Ha Noi',
        ownerName: 'Chu ho',
        // `0104` — gửi duyệt đòi đủ MST và chức danh, nên khách hàng
        // của bộ test phải giống khách hàng thật.
        ownerTitle: 'Chu ho',
        idNumber: String(5100666666 + ++nMst), phone: '0900000000' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);

    const payload = await withAdminDb(async (c) => {
      const q = await c.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM cus.outbox WHERE routing_key = 'customer.created'
            AND payload->>'id' = $1`,
        [r.body.id],
      );
      return q.rows[0]?.payload;
    });
    expect(payload, 'không thấy sự kiện customer.created').toBeTruthy();
    expect(payload!['actorName'], 'sự kiện thiếu tên người thực hiện').toBeTruthy();
    expect(payload!['traceId'], 'sự kiện thiếu mã tra cứu').toBeTruthy();
  }, 60_000);
});

// =============================================================================
// `0091` — nhóm sự kiện tài khoản và phiên đăng nhập
// =============================================================================

/**
 * Đọc sự kiện `idn.outbox` mới nhất của một hành động, TỪ MỘT MỐC trở đi.
 *
 * `moc` không phải chuyện thừa: bộ kiểm chạy trên CSDL thật và không dọn giữa
 * các lượt, nên "dòng mới nhất của hành động này" có thể là dòng của lần chạy
 * trước. Đo được ở lượt phá lại `0091`: gỡ hẳn sự kiện đăng nhập hỏng mà ca
 * kiểm vẫn XANH, vì nó đọc trúng một dòng cũ.
 */
const suKien = (action: string, moc: Date) =>
  withAdminDb(async (c) => {
    const r = await c.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM idn.outbox
        WHERE payload->>'action' = $1 AND created_at >= $2 ORDER BY seq DESC LIMIT 1`,
      [action, moc],
    );
    return r.rows[0]?.payload;
  });

describe('`0091` đăng nhập để lại vết', () => {
  it('đăng nhập ĐÚNG ghi LOGIN_OK kèm tên người', async () => {
    const moc = new Date();
    await accessTokenFor(identity, 'tdv01', 'Test@1234');
    const e = await suKien('LOGIN_OK', moc);
    expect(e, 'không có sự kiện LOGIN_OK nào').toBeTruthy();
    expect(e!['outcome']).toBe('OK');
    expect(e!['actorName'], 'thiếu tên người đăng nhập').toBeTruthy();
    expect(e!['targetLabel']).toBeTruthy();
  }, 30_000);

  it('đăng nhập SAI ghi LOGIN_FAILED kèm lý do THẬT', async () => {
    /*
     * Người gọi chỉ nhận đúng một mã lỗi cho mọi nhánh hỏng (AUTH-02) — phân
     * biệt ra là xác nhận giúp người dò rằng tài khoản đó có thật. Nhật ký thì
     * ngược lại: nó chỉ Quản trị đọc, và "sai mật khẩu" với "tài khoản đã khoá"
     * là hai câu chuyện an ninh khác hẳn nhau.
     */
    const moc = new Date();
    const r = await (await http(identity))
      .post('/auth/login')
      .send({ login: 'tdv01', password: 'SaiHoanToan@9' });
    expect(r.status).toBe(401);

    const e = await suKien('LOGIN_FAILED', moc);
    expect(e).toBeTruthy();
    expect(e!['outcome']).toBe('FAILED');
    expect(e!['reason']).toBe('Sai mật khẩu');
    expect(e!['targetLabel']).toBe('tdv01');
  }, 30_000);

  it('gõ vào một tên KHÔNG TỒN TẠI vẫn ghi lại chính tên đã gõ', async () => {
    // Một chuỗi thử liên tiếp vào những tên không có thật chính là hình dạng
    // của một lượt dò — mà không ghi tên đã gõ thì không nhận ra hình dạng ấy.
    const ten = `khongcothat${Date.now()}`;
    const moc = new Date();
    await (await http(identity)).post('/auth/login').send({ login: ten, password: 'X@123456' });
    const e = await suKien('LOGIN_FAILED', moc);
    expect(e!['targetLabel']).toBe(ten);
    expect(e!['reason']).toBe('Không có tài khoản nào khớp');
  }, 30_000);

  it('KHÔNG ghi mật khẩu vào bất kỳ đâu', async () => {
    const mk = `RatBiMat${Date.now()}@9`;
    await (await http(identity)).post('/auth/login').send({ login: 'tdv01', password: mk });
    const co = await withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM idn.outbox WHERE payload::text LIKE $1`,
        [`%${mk}%`],
      );
      return Number(r.rows[0]!.n);
    });
    expect(co, 'mật khẩu lọt vào outbox').toBe(0);
  }, 30_000);
});

describe('`0091` vòng đời tài khoản để lại vết', () => {
  it('vô hiệu hoá tài khoản ghi USER_DISABLED kèm trước/sau', async () => {
    const ten = `nk91${Date.now().toString().slice(-9)}`;
    const moc = new Date();
    const tao = await (await http(identity))
      .post('/admin/users')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ username: ten, email: `${ten}@csbh.test`, fullName: 'Nguoi kiem thu 0091', role: 'TDV' });
    expect(tao.status, JSON.stringify(tao.body)).toBe(201);

    const eTao = await suKien('USER_CREATED', moc);
    expect(eTao!['targetLabel']).toBe(ten);
    expect((eTao!['after'] as Record<string, unknown>)['role']).toBe('TDV');

    const nguoiNhan = await withAdminDb(async (c) => {
      const r = await c.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'tdv01'`,
      );
      return r.rows[0]!.id;
    });
    const tat = await (await http(identity))
      .post(`/admin/users/${tao.body.id}/deactivate`)
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .send({ confirmUsername: ten, successorId: nguoiNhan });
    expect(tat.status, JSON.stringify(tat.body)).toBe(200);

    const e = await suKien('USER_DISABLED', moc);
    expect(e!['targetLabel']).toBe(ten);
    expect((e!['before'] as Record<string, unknown>)['isActive']).toBe(true);
    expect((e!['after'] as Record<string, unknown>)['isActive']).toBe(false);
    // Người THỰC HIỆN là Quản trị đang bấm, không phải tài khoản bị tắt.
    expect(e!['actorName']).toBeTruthy();
  }, 60_000);
});

describe('`0090` bộ lọc thật sự lọc', () => {
  it('lọc theo IP', async () => {
    const r = await aget('/audit/entries?ip=10.4.19.9', 'admin01');
    const ds = r.body.items as Record<string, unknown>[];
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.every((d) => d['actorIp'] === '10.4.19.9')).toBe(true);
  }, 30_000);

  it('lọc theo hành động', async () => {
    const r = await aget(`/audit/entries?action=${MOC}_HONG`, 'admin01');
    const ds = r.body.items as Record<string, unknown>[];
    expect(ds.length).toBe(1);
    expect(ds[0]!['outcome']).toBe('FAILED');
  }, 30_000);

  it('`facets` chỉ liệt kê giá trị CÓ THẬT trong cửa sổ', async () => {
    const r = await aget('/audit/facets', 'admin01');
    expect(r.status).toBe(200);
    const ma = (r.body.actions as { value: string }[]).map((a) => a.value);
    expect(ma).toContain(`${MOC}_MOI`);
    // Hành động chỉ xuất hiện ở dòng ngoài cửa sổ thì không được vào ô chọn:
    // bày ra một lựa chọn mà chọn vào ra danh sách rỗng là tự đặt bẫy.
    expect(ma).not.toContain(`${MOC}_CU`);
  }, 30_000);

  it('vai trò khác vẫn KHÔNG đọc được gì, kể cả với bộ lọc', async () => {
    expect((await aget('/audit/entries?action=X', 'bld01')).status).toBe(403);
    expect((await aget('/audit/facets', 'bld01')).status).toBe(403);
    expect((await aget('/audit/thong-ke', 'bld01')).status).toBe(403);
  }, 30_000);
});

describe('`0093` hoạt động hệ thống theo kỳ', () => {
  it('gom dòng nhật ký vào đúng kỳ, và đếm cả số người', async () => {
    /*
     * Khối duy nhất của Quản trị hệ thống trên trang *Thống kê*: phạm vi dữ
     * liệu của họ rỗng nên mọi chỉ số hồ sơ đều là 0, còn nhật ký thì họ có
     * toàn bộ.
     */
    const r = await aget('/audit/thong-ke?ky=thang&soKy=3', 'admin01');
    expect(r.status).toBe(200);
    const kyNay = r.body.chuoi[r.body.chuoi.length - 1];
    expect(kyNay.dangChay).toBe(true);
    expect(kyNay.tong).toBeGreaterThan(0);
    expect(kyNay.nguoi).toBeGreaterThan(0);
    // Gom theo đối tượng để đọc được "hệ thống đang bận ở đâu".
    expect(Object.keys(kyNay.theoDoiTuong).length).toBeGreaterThan(0);
  }, 30_000);

  it('CẮT ở mép cửa sổ sáu tháng thay vì từ chối cả lời gọi', async () => {
    /*
     * `soKy=8` với nhịp quý là hai năm — vượt xa cửa sổ. Trả 400 ở đây là chặn
     * đúng một thao tác hợp lý (đổi nhịp sang quý), nên chuỗi bị cắt ngắn và
     * phần bị cắt phải được NÓI RA.
     */
    const r = await aget('/audit/thong-ke?ky=quy&soKy=8', 'admin01');
    expect(r.status).toBe(200);
    expect(r.body.kyBiCat).toBeGreaterThan(0);
    expect(r.body.chuoi.length).toBeLessThan(8);
    expect(r.body.window.months).toBe(6);
    for (const k of r.body.chuoi as { den: string }[]) {
      expect(new Date(k.den).getTime()).toBeGreaterThan(somNhat().getTime());
    }
  }, 30_000);

  it('CẮT KỲ CÙNG MỘT HÀM với reporting — nhãn tuần giống hệt', async () => {
    // Hai service, hai khối trên cùng một màn hình. Hai phép cắt viết riêng thì
    // đến ngày chúng lệch nhau một giờ, và người xem thấy "Tháng 8" của khối
    // này không khớp "Tháng 8" của khối kia.
    const r = await aget('/audit/thong-ke?ky=tuan&soKy=2', 'admin01');
    expect(r.body.chuoi[0].nhan).toMatch(/^Tuần \d+ · \d\d\/\d\d–\d\d\/\d\d$/);
  }, 30_000);

  it('nhịp lạ bị TỪ CHỐI', async () => {
    const r = await aget('/audit/thong-ke?ky=ngay', 'admin01');
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('ky');
  }, 30_000);
});
