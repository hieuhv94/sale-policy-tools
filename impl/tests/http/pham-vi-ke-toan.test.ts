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
import {
  PoliciesService,
  thuocPhamVi,
} from '../../services/policy/src/policies/policies.service.js';
import { phanCongCua } from '../../services/policy/src/policies/workflow.service.js';
import { oChonCua } from '../../apps/web/src/lib/nguoi-xu-ly.js';
import { build } from '../../services/reporting/src/reports/filter.js';

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

  /*
   * Ca *"`assertPolicyInScope` có luật riêng của Kế toán"* ĐÃ GỠ (`0143`).
   *
   * Nó khẳng định ba chuỗi có mặt trong mã nguồn — `me.role === 'KE_TOAN'` và
   * hai chuỗi nữa — và nó đỏ ngay lúc `0143` viết lại `p.da_qua_tbp === false`
   * thành `!p.da_qua_tbp`, một lượt sửa KHÔNG đổi hành vi gì cả.
   *
   * Đó là toàn bộ vấn đề của nó: nó mô tả CÁCH VIẾT, không mô tả HÀNH VI. Chiều
   * ngược lại còn tệ hơn — đổi `&&` thành `||` là đảo ngược luật mà cả ba phép
   * so vẫn xanh.
   *
   * Bốn ca ở `0143` bên dưới gọi thẳng hàm và thay hẳn nó.
   */

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

// =============================================================================
// `0143` — HÀNH VI của chốt chặn, và hai bảng phân công khớp nhau
// =============================================================================

/**
 * Dựng `PoliciesService` với đúng thứ `assertPolicyInScope` dùng tới.
 *
 * Nó chỉ đọc `this.scope.userIdsFor(me)`; `db` và `clients` không được chạm tới
 * trên đường này. Truyền `null` cho hai cái ấy là một khẳng định — nếu ngày nào
 * hàm bắt đầu gọi CSDL thì ca kiểm nổ ngay, chứ không lặng lẽ mở một kết nối.
 */
const dungService = (ids: string[]): PoliciesService =>
  new PoliciesService(
    null as never,
    null as never,
    { userIdsFor: async () => ids } as never,
  );

const KT = 'kt-1';
const hoSo = (over: Partial<Record<string, unknown>> = {}) => ({
  tdv_user_id: 'tdv-1',
  tbp_user_id: 'tbp-1',
  ke_toan_user_id: KT,
  sale_admin_user_id: null,
  status: 'CHO_TBP_DUYET',
  da_qua_tbp: false,
  ...over,
});

const me = (role: string, id = KT) => ({ id, role }) as never;

const choPhep = async (svc: PoliciesService, p: unknown, u: unknown): Promise<boolean> => {
  try {
    await svc.assertPolicyInScope(p as never, u as never);
    return true;
  } catch {
    return false;
  }
};

describe('`0143` GỌI THẬT chốt chặn, không đọc mã nguồn', () => {
  /*
   * Bốn ca của `0142` đọc CHỮ trong mã nguồn: chúng khẳng định ba chuỗi có mặt.
   * Đổi `&&` thành `||` là luật đảo ngược mà cả ba `toContain` vẫn xanh — đúng
   * loại ca kiểm mô tả hình dạng thay vì mô tả hành vi.
   */
  it('Kế toán KHÔNG mở được hồ sơ chờ TBP chưa từng qua TBP', async () => {
    const svc = dungService([KT]);
    expect(await choPhep(svc, hoSo(), me('KE_TOAN'))).toBe(false);
  });

  it('nhưng MỞ ĐƯỢC khi hồ sơ đã từng qua TBP — chiều dương của luật', async () => {
    /*
     * Ca này là thứ `0142` thiếu hẳn. Không có nó thì một bản sửa chặn TẤT CẢ
     * hồ sơ chờ TBP của Kế toán vẫn xanh — kể cả hồ sơ chính họ đã trả về, tức
     * là mất đúng nửa yêu cầu của khách hàng.
     */
    const svc = dungService([KT]);
    expect(await choPhep(svc, hoSo({ da_qua_tbp: true }), me('KE_TOAN'))).toBe(true);
  });

  it('mọi TRẠNG THÁI khác đều mở được, dù chưa qua TBP', async () => {
    const svc = dungService([KT]);
    for (const st of ['CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2', 'YEU_CAU_CHINH_SUA', 'DA_XOA']) {
      expect(await choPhep(svc, hoSo({ status: st }), me('KE_TOAN')), st).toBe(true);
    }
  });

  it('năm vai trò còn lại KHÔNG bị luật này chạm tới', async () => {
    // Cùng một hồ sơ, cùng một phạm vi — chỉ đổi vai trò người mở.
    for (const vt of ['TDV', 'TBP', 'SALE_ADMIN', 'BAN_LANH_DAO']) {
      const svc = dungService(['nguoi-1']);
      const p = hoSo({ tdv_user_id: 'nguoi-1' });
      expect(await choPhep(svc, p, me(vt, 'nguoi-1')), vt).toBe(true);
    }
  });

  it('ngoài phạm vi vẫn là ngoài phạm vi — luật mới không nới cho ai', async () => {
    const svc = dungService(['nguoi-la']);
    expect(await choPhep(svc, hoSo({ da_qua_tbp: true }), me('KE_TOAN', 'nguoi-la'))).toBe(false);
  });

  it('hai trường của luật khai BẮT BUỘC, không tuỳ chọn', () => {
    /*
     * `0142` khai chúng tuỳ chọn, và hai đường `attach`/`detach` — vốn liệt kê
     * từng cột trong câu `SELECT` — im lặng bỏ qua chốt. Khai bắt buộc thì trình
     * biên dịch rà giúp mọi chỗ gọi.
     *
     * Ca này canh cho không ai nới lại: một dấu `?` ở đây là chốt chặn có thể
     * biến mất ở một chỗ gọi mới mà không ai biết.
     */
    const src = readFileSync('services/policy/src/policies/policies.service.ts', 'utf8');
    const ham = src.slice(src.indexOf('async assertPolicyInScope'), src.indexOf('async assertPolicyInScope') + 1600);
    expect(ham).toMatch(/\n\s+status: string;/);
    expect(ham).toMatch(/\n\s+da_qua_tbp: boolean;/);
    expect(ham, 'khai tuỳ chọn là mở lại lỗ hổng của `0142`').not.toMatch(/status\?: string/);
    expect(ham).not.toMatch(/da_qua_tbp\?: boolean/);
  });
});

describe('`0143` bảng phân công của giao diện KHỚP bảng máy chủ', () => {
  /*
   * Docstring của `nguoi-xu-ly.test.ts` từ `0031` đã hứa có ca này — *"hai bản
   * lệch nhau là lỗi im lặng… ca cuối cùng canh đúng điều đó"* — nhưng ca ấy
   * chưa bao giờ tồn tại. Nó so `CAN_XEM_TRUOC` với bảng ô chọn, không so hai
   * bảng với nhau. `0143` viết ra ca thật.
   *
   * Lệch nhau trông thế nào: giao diện không hiện ô, người dùng bấm gửi, máy chủ
   * trả 422 `ASSIGNEE_REQUIRED` nói thiếu một trường không có trên màn hình.
   */
  const HANH_DONG = [
    'SUBMIT',
    'RESUBMIT_AFTER_EDIT',
    'KT_RECEIVE_L1',
    'KT_RECEIVE_L2',
    'TBP_SIGN',
    'TBP_RETURN',
    'SA_HANDOVER',
    'KT_RETURN_L1',
    'KT_RETURN_L2',
    'KT_REQUEST_REPRINT',
  ];

  it('mọi hành động × mọi trạng thái Sale Admin đều cho cùng một danh sách', () => {
    for (const hd of HANH_DONG) {
      for (const daChon of [false, true]) {
        const may = phanCongCua(hd as never, {
          sale_admin_user_id: daChon ? 'sa-1' : null,
        }).map((x) => x.truong);
        const web = oChonCua(hd, { daChonSaleAdmin: daChon }).map((x) => x.truong);
        expect(web, `${hd} · daChonSaleAdmin=${daChon}`).toEqual(may);
      }
    }
  });

  it('VAI TRÒ của từng ô cũng khớp, không chỉ tên trường', () => {
    // Tên trường khớp mà vai trò lệch thì ô chọn nạp sai danh sách người, và
    // máy chủ trả `ASSIGNEE_WRONG_ROLE` sau khi người dùng đã chọn xong.
    for (const hd of ['SUBMIT', 'KT_RECEIVE_L1']) {
      const may = phanCongCua(hd as never, { sale_admin_user_id: null }).map((x) => x.vaiTro);
      const web = oChonCua(hd, { daChonSaleAdmin: false }).map((x) => x.vaiTro);
      expect(web, hd).toEqual(may);
    }
  });
});

// =============================================================================
// `0144` — `policy` và `reporting` trả lời GIỐNG HỆT nhau
// =============================================================================

/**
 * `filter.ts` bên `reporting` chép lại mệnh đề phạm vi của `policy`, và có sẵn
 * một chú thích từ `0031`: *"hai chỗ phải trả lời giống hệt nhau, nếu không thì
 * một hồ sơ mở được ở màn hình Hồ sơ mà biến mất khỏi Báo cáo"*.
 *
 * Suốt từ đó tới `0143` **không ca kiểm nào canh câu ấy**, và `0142` đã tạo ra
 * đúng cái lệch ấy theo chiều ngược: thẻ *Sắp quá hạn* của Kế toán đếm 3, bấm
 * vào ra 2 dòng.
 *
 * So bằng cách CHUẨN HOÁ hai chuỗi SQL rồi đối chiếu — không so từng ký tự, vì
 * hai bên khác nhau hợp lệ ở hai chỗ: `policy` đọc enum nên phải `status::text`,
 * và `policy` có bí danh bảng còn `reporting` thì không.
 */
const chuanHoa = (sql: string): string =>
  sql
    .replace(/\bp\./g, '')
    .replace(/status::text/g, 'status')
    .replace(/\s+/g, ' ')
    .trim();

describe('`0144` hai service dựng cùng một mệnh đề phạm vi', () => {
  /*
   * Bộ lọc RỖNG, nên `where` chỉ gồm đúng mệnh đề phạm vi — `build` nối các
   * điều kiện bằng ` AND `, và cắt theo chuỗi ấy sẽ cắt nhầm vào giữa chính
   * mệnh đề của Kế toán (nó cũng chứa một chữ `AND`). Đã dính một lượt.
   */
  const cuaReporting = (vaiTro: string): string => build({}, { ids: ['x'], vaiTro }).where;

  it('KẾ TOÁN: cùng bốn cột, cùng luật riêng', () => {
    expect(chuanHoa(cuaReporting('KE_TOAN'))).toBe(chuanHoa(thuocPhamVi(1, '', 'KE_TOAN')));
  });

  it('mọi vai trò khác: cùng bốn cột, không luật nào thêm', () => {
    for (const vt of ['TDV', 'TBP', 'SALE_ADMIN', 'BAN_LANH_DAO', 'QUAN_TRI']) {
      expect(chuanHoa(cuaReporting(vt)), vt).toBe(chuanHoa(thuocPhamVi(1, '', vt)));
    }
  });

  it('bên `reporting` cũng CHỈ siết Kế toán, không siết ai khác', () => {
    // Chiều đối chiếu: nối nhầm luật cho mọi vai trò thì TDV mất hồ sơ mình vừa
    // gửi khỏi mọi con số của Tổng quan, và không thẻ nào nói vì sao.
    expect(cuaReporting('KE_TOAN')).toContain('da_qua_tbp');
    for (const vt of ['TDV', 'TBP', 'SALE_ADMIN', 'BAN_LANH_DAO']) {
      expect(cuaReporting(vt), vt).not.toContain('da_qua_tbp');
    }
  });

  it('`params[0]` vẫn là danh sách phạm vi — hợp đồng của `build`', () => {
    // Mọi tiêu chí lọc đánh số tham số động tính từ `$1`. Đổi chỗ nó là lệch
    // toàn bộ, và triệu chứng là một câu SQL chạy được nhưng lọc sai.
    const { params } = build({}, { ids: ['a', 'b'], vaiTro: 'KE_TOAN' });
    expect(params[0]).toEqual(['a', 'b']);
  });
});
