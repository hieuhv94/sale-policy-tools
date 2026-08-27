/**
 * `0142` — KẾ TOÁN CHƯA THẤY HỒ SƠ Ở LƯỢT CHỜ TBP ĐẦU TIÊN.
 *
 * Tệp thuần: gọi `thuocPhamVi()` và đọc chính chuỗi SQL nó sinh ra. Không dựng
 * ứng dụng, không chạm CSDL.
 *
 * Kiểm được gì bằng cách đọc SQL: rằng mệnh đề CÓ MẶT, nhắm đúng cột, và chỉ
 * áp cho đúng một vai trò. Không kiểm được: Postgres chạy nó ra đúng kết quả —
 * việc ấy thuộc về ca HTTP, và chúng cần CSDL.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { thuocPhamVi } from '../../services/policy/src/policies/policies.service.js';

/** Bốn cột người — phần không đổi của mọi mệnh đề phạm vi (`0031`). */
const BON_COT = ['tdv_user_id', 'tbp_user_id', 'ke_toan_user_id', 'sale_admin_user_id'];

describe('`0142` bốn cột người vẫn là nền của mọi phạm vi', () => {
  it('mọi vai trò đều lọc theo đủ bốn cột', () => {
    for (const vt of [undefined, 'TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO']) {
      const sql = thuocPhamVi(1, '', vt);
      for (const c of BON_COT) expect(sql, `${vt} · ${c}`).toContain(`${c} = ANY($1::uuid[])`);
    }
  });

  it('bí danh bảng đi vào MỌI cột, không chỉ cột đầu', () => {
    // Câu lệnh ở `impacted()` nối hai bảng, nên thiếu bí danh ở một cột là
    // `column reference is ambiguous` — một lỗi lúc chạy, không lúc dịch.
    const sql = thuocPhamVi(1, 'p', 'KE_TOAN');
    for (const c of BON_COT) expect(sql, c).toContain(`p.${c}`);
    expect(sql).toContain('p.status');
    expect(sql).toContain('p.da_qua_tbp');
  });
});

describe('`0142` luật riêng CHỈ áp cho Kế toán', () => {
  it('Kế toán bị loại hồ sơ CHỜ TBP chưa từng qua TBP', () => {
    const sql = thuocPhamVi(1, '', 'KE_TOAN');
    expect(sql).toContain("status::text = 'CHO_TBP_DUYET'");
    expect(sql).toContain('da_qua_tbp = false');
    // Mệnh đề phải PHỦ ĐỊNH: quên `NOT` là đảo ngược luật — Kế toán chỉ còn
    // thấy đúng những hồ sơ đáng lẽ phải giấu.
    expect(sql).toMatch(/AND NOT \(/);
  });

  it('năm vai trò còn lại KHÔNG bị đụng tới', () => {
    /*
     * Chiều đối chiếu, và nó bắt đúng cách làm sai dễ nhất: quên truyền vai trò
     * ở một chỗ gọi thì mệnh đề biến mất; áp cho mọi vai trò thì TDV mất luôn hồ
     * sơ mình vừa gửi, và triệu chứng là "hồ sơ tôi vừa bấm gửi biến mất".
     */
    const chuan = thuocPhamVi(1);
    for (const vt of ['TDV', 'TBP', 'SALE_ADMIN', 'BAN_LANH_DAO', 'QUAN_TRI']) {
      expect(thuocPhamVi(1, '', vt), vt).toBe(chuan);
    }
    expect(chuan).not.toContain('da_qua_tbp');
  });

  it('KHÔNG truyền vai trò thì không lọc gì thêm — mặc định phía NỚI', () => {
    // Siết nhầm ở đây là giấu hồ sơ khỏi người có quyền đọc, và triệu chứng là
    // một danh sách rỗng không giải thích gì.
    expect(thuocPhamVi(1, '', undefined)).toBe(thuocPhamVi(1));
  });
});

describe('`0142` cột `da_qua_tbp` không bao giờ bị xoá', () => {
  const wf = readFileSync('services/policy/src/policies/workflow.service.ts', 'utf8');

  it('bật ở lượt TBP KÝ', () => {
    expect(wf).toMatch(/da_qua_tbp = true/);
  });

  it('KHÔNG nằm trong nhánh xoá chữ ký lúc trả về', () => {
    /*
     * Ca đáng giá nhất của tệp này, và nó canh một sự VẮNG MẶT.
     *
     * `da_qua_tbp` đứng cạnh ba cột chữ ký nhưng trả lời câu ngược lại về thời
     * gian: ba cột kia hỏi *"bây giờ có chữ ký không"* nên phải xoá lúc trả về;
     * cột này hỏi *"đã từng ký chưa"* nên xoá là nói dối.
     *
     * Gom nó vào nhánh ấy cho gọn là lấy lại quyền đọc của Kế toán với chính
     * những hồ sơ họ đã trả về — và không ca kiểm nào của lượt trả về đỏ lên.
     */
    const nhanhXoa = wf.match(/kySql = 'tbp_signed_at = NULL[^']*'/)?.[0] ?? '';
    expect(nhanhXoa, 'không tìm thấy nhánh xoá chữ ký').not.toBe('');
    expect(nhanhXoa).not.toContain('da_qua_tbp');
    expect(wf).not.toMatch(/da_qua_tbp = false/);
  });

  it('migration nói rõ luật ấy, và có lượt nạp lại cho dữ liệu cũ', () => {
    /*
     * Dữ liệu cũ không suy được từ `tbp_signed_at` — nó đã bị xoá ở đúng những
     * hồ sơ từng bị trả về, tức đúng tập cần nhất. Nguồn duy nhất còn giữ được
     * sự thật ấy là nhật ký.
     */
    const m = readFileSync('db/migrations/0107_ke_toan_chua_thay_luot_dau.sql', 'utf8');
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS da_qua_tbp/);
    expect(m).toMatch(/FROM pol\.policy_event[\s\S]*?TBP_SIGN/);
    expect(m, 'bản sao đọc phải có cột ấy từ cùng lượt').toMatch(/rpt\.policy_row[\s\S]*?da_qua_tbp/);
  });
});

describe('`0142` chốt chặn ở đường MỞ MỘT HỒ SƠ', () => {
  const svc = readFileSync('services/policy/src/policies/policies.service.ts', 'utf8');

  it('`assertPolicyInScope` có luật riêng của Kế toán', () => {
    /*
     * Danh sách giấu hồ sơ đi mà `byId` không chặn thì gõ thẳng địa chỉ vẫn mở
     * được — đúng lỗ hổng `0133` vừa bịt ở tầng định tuyến, chỉ khác chỗ.
     */
    const ham = svc.slice(svc.indexOf('async assertPolicyInScope'));
    expect(ham).toContain("me.role === 'KE_TOAN'");
    expect(ham).toContain("p.status === 'CHO_TBP_DUYET'");
    expect(ham).toContain('p.da_qua_tbp === false');
  });

  it('`byId` ĐỌC cột ấy — thiếu thì chốt chặn im lặng không chặn gì', () => {
    /*
     * `da_qua_tbp` khai tuỳ chọn ở kiểu tham số, nên quên nó trong câu `SELECT`
     * không làm TypeScript đỏ: giá trị là `undefined`, phép so `=== false` sai,
     * và chốt chặn không bao giờ nổ.
     *
     * GỠ CHÚ THÍCH TRƯỚC KHI QUÉT. Bản đầu của ca này chỉ tìm chuỗi `da_qua_tbp`
     * trong 900 ký tự sau `async byId(` — và nó XANH lúc phá lại, vì ngay trên
     * câu `SELECT` có một dòng chú thích nhắc đúng tên cột ấy. Cùng bẫy mà
     * `0124` đã dính: ca kiểm xanh nhờ chính lời giải thích của nó.
     */
    const sel = svc
      .slice(svc.indexOf('async byId('), svc.indexOf('async byId(') + 1200)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sel).toMatch(/SELECT[\s\S]*?\bda_qua_tbp\b[\s\S]*?FROM pol\.policy/);
  });
});
