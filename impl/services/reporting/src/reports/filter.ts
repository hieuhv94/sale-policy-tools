/**
 * Chín tiêu chí lọc ở muc 9.2, dịch sang SQL.
 *
 * Từng là mười bốn, rồi mười một. Tỉnh/thành, bệnh viện và kênh rời khỏi phần
 * mềm ở `0026` cùng ba cột nguồn của chúng bên khách hàng. `0077` bỏ tiếp **địa
 * chỉ đăng ký** và **mã số thuế** — hai ô không ai lọc theo, và gộp **người đề
 * nghị** vào **TDV phụ trách** (xem `tdvUserId` bên dưới). Đổi lại, *hạn xử lý*
 * vào hẳn muc 9.2 thay vì đứng ngoài.
 *
 * NĂM TIÊU CHÍ NHẬN NHIỀU GIÁ TRỊ (`0077`) — xem `KHOA_NHIEU_GIA_TRI`. Trước đó
 * chỉ `status` nhận, và cũng chỉ qua liên kết: biểu mẫu không có cách nào chọn
 * hai trạng thái, nên muốn xem hồ sơ của ba khách hàng là phải lọc ba lần.
 *
 * MỘT LUẬT KHÔNG ĐƯỢC PHÉP LÁCH: phạm vi dữ liệu áp TRƯỚC bộ lọc và không tiêu
 * chí nào ghi đè được nó (RPT-09). Vì thế `tdv_user_id` xuất hiện ở HAI chỗ với
 * hai nghĩa khác nhau, và trộn lẫn chúng là lỗ hổng:
 *
 *   - `scopeUserIds` — do identity trả về, người dùng không đụng vào được. Luôn
 *     là điều kiện đầu tiên trong mệnh đề WHERE.
 *   - `tdvUserId` — tiêu chí lọc số 7, do người dùng chọn. Nó chỉ THU HẸP thêm
 *     trong phạm vi đã có; chọn người ngoài phạm vi thì kết quả rỗng, chứ không
 *     mở rộng ra được. Từ `0077` ô chọn ấy lấy danh sách từ
 *     `GET /reports/handlers` — vốn đã lọc theo phạm vi — nên chuyện ngoài phạm
 *     vi gần như không còn xảy ra; luật trên vẫn đứng đó vì nó bảo vệ đường API,
 *     không bảo vệ cái ô chọn.
 *
 * Cách dựng câu lệnh cũng chọn theo hướng đó: điều kiện phạm vi được nối cứng
 * trong `build()` chứ không nằm trong danh sách tiêu chí, nên không có đường nào
 * để một tiêu chí "quên" nó.
 */
import { BadRequestException } from '@nestjs/common';
import { contains, norm, normAll } from '@csbh/http-kit';

/**
 * Giá trị vẫn là CHUỖI, kể cả với tiêu chí nhiều giá trị — nối bằng dấu phẩy.
 *
 * Không đổi sang `string[]`, và đó là một lựa chọn chứ không phải lười: cả đường
 * ống đều là chuỗi — query string của trình duyệt, JSON trong Redis
 * (`filter-store.ts`), cột `filter jsonb` của `rpt.export_job`. Đổi kiểu ở đây
 * là sửa bốn chỗ để được đúng một chỗ gọn hơn, và mỗi chỗ ấy là một dịp lệch.
 *
 * `tach()` là ranh giới: mọi nơi cần từng giá trị đều đi qua nó, nên không có
 * hai cách hiểu một chuỗi.
 */
export type Filter = {
  appliedFrom?: string | undefined;
  appliedTo?: string | undefined;
  approvedFrom?: string | undefined;
  approvedTo?: string | undefined;
  customerCode?: string | undefined;
  customerName?: string | undefined;
  productName?: string | undefined;
  productGroupCode?: string | undefined;
  /**
   * TDV phụ trách KHÁCH HÀNG — không phải người lập hồ sơ (`0077`).
   *
   * Trước `0077` có thêm `requesterId` (người lập). Hai cột chỉ lệch nhau sau
   * khi Sale Admin **bàn giao khách hàng**: hồ sơ cũ giữ nguyên người lập, còn
   * TDV phụ trách đổi. Khi ấy chỉ một trong hai trả lời đúng câu *"hồ sơ của TDV
   * này"*, và đó là cột này — cũng chính là cột `sync.service.ts` dùng để quyết
   * định ai NHÌN THẤY hồ sơ, và là cột khối *Theo trình dược viên* trên trang
   * Tổng quan đếm theo. Giữ cả hai là bày ra hai ô gần giống nhau cho một câu
   * hỏi, rồi để người dùng chọn nhầm.
   */
  tdvUserId?: string | undefined;
  status?: string | undefined;
  han?: string | undefined;
  pendingStep?: string | undefined;
};

/** Hai giá trị của tiêu chí *Hạn xử lý* (`0060`). */
export const HAN_XU_LY = ['SAP_QUA_HAN', 'QUA_HAN'] as const;

/**
 * Bước đang chờ suy từ trạng thái — dạng SQL.
 *
 * Lặp lại `STEP_OF_STATUS` bên `@csbh/domain-policy` vì phép này phải chạy TRONG
 * CSDL: kéo hai mươi nghìn dòng về Node để nhóm lại là chính thứ read-model sinh
 * ra để tránh.
 */
export const STEP_FROM_STATUS = `CASE status
    WHEN 'CHO_TBP_DUYET' THEN 'B4_TBP_DUYET'
    WHEN 'CHO_KT_L1'     THEN 'B6_KT_L1'
    WHEN 'SA_DANG_XU_LY' THEN 'B8_SA_XU_LY'
    WHEN 'SA_SUA_BAN_CUNG' THEN 'B8_SA_XU_LY'
    WHEN 'CHO_KT_L2'     THEN 'B10_KT_L2'
  END`;

/**
 * Bước mà hồ sơ ĐANG CHỜ — và chỉ hồ sơ còn sống mới có bước (`0047`).
 *
 * Từng là `coalesce(pending_step, …)` để hồ sơ quá hạn vẫn tính vào bước cũ của
 * nó, hồi quá hạn còn là lớp phủ và người phụ trách vẫn duyệt được. Từ `0047`
 * quá hạn là chết, nên nó KHÔNG còn là "đang chờ" ở đâu cả: `STEP_FROM_STATUS`
 * trả `NULL` cho `QUA_HAN_DUYET`, và thế là nó tự rơi ra khỏi mọi phép đếm lẫn
 * mọi bộ lọc theo bước.
 *
 * Giữ tên và giữ MỘT định nghĩa dùng chung là chuyện sống còn ở đây: đếm và lọc
 * phải cho ra cùng một tập, nếu không thẻ ghi 12 mà bấm vào ra 9 dòng.
 */
export const BUOC_DANG_CHO = STEP_FROM_STATUS;

/**
 * "Sắp quá hạn" — dưới 24 giờ là tới hạn, và hồ sơ CÒN ĐANG CHỜ.
 *
 * Ba vế, và vế thứ ba mới thêm ở `0059`:
 *
 *   1. `sla_due_at` còn trong vòng 24 giờ tới;
 *   2. chưa mang nhãn `QUA_HAN_DUYET` (`0047`) — hồ sơ đã chết thì `sla_due_at`
 *      vẫn nằm đó, đã trôi qua, nên thiếu vế này là đếm luôn cả nó;
 *   3. **vẫn đang ở một bước chờ**.
 *
 * Vế ba bịt một lỗ đúng cùng kiểu với vế hai, ở một trạng thái khác: hồ sơ hệ
 * thống TỰ XOÁ sau 3 ngày quá hạn (`0047`) chuyển sang `DA_XOA` mà KHÔNG xoá
 * `sla_due_at` — nó thoả cả vế một lẫn vế hai, và lọt vào đây vĩnh viễn. Thẻ
 * *Sắp quá hạn* thì đếm qua `byStepDetail`, vốn đã lọc theo bước, nên thẻ ghi 5
 * còn danh sách mở ra 6 dòng: kiểu lệch người dùng đếm được mà phép kiểm không.
 *
 * Dựng TỪ `BUOC_DANG_CHO` chứ không viết lại điều kiện — một khái niệm, một định
 * nghĩa. Đó cũng là lý do khối này phải nằm SAU nó.
 */
export const SAP_QUA_HAN = `(status <> 'QUA_HAN_DUYET'
    AND ${BUOC_DANG_CHO} IS NOT NULL
    AND sla_due_at IS NOT NULL
    AND sla_due_at <= now() + interval '1 day')`;

/** Tên tham số nhận từ query string, theo đúng thứ tự 9 tiêu chí ở muc 9.2. */
export const FILTER_KEYS = [
  'appliedFrom',
  'appliedTo',
  'approvedFrom',
  'approvedTo',
  'customerCode',
  'customerName',
  'productName',
  'productGroupCode',
  'tdvUserId',
  'status',
  'han',
] as const;

/**
 * Số TIÊU CHÍ nghiệp vụ — 9, không phải 11 (`0077`).
 *
 * Mỗi cặp `…From`/`…To` là MỘT tiêu chí *"thời gian áp dụng"*, không phải hai:
 * muc 9.2 kể một khoảng thời gian, còn hai khoá kia là cách một khoảng đi qua
 * query string.
 *
 * Suy ra từ chính `FILTER_KEYS` chứ không viết tay. Bản trước ghi cứng `11` ở
 * controller, và một con số phải nhớ sửa mỗi lần thêm bớt tiêu chí là con số sẽ
 * có ngày nói dối về danh sách nằm ngay cạnh nó.
 */
export const SO_TIEU_CHI = FILTER_KEYS.filter((k) => !k.endsWith('To')).length;

/**
 * Tiêu chí NGOÀI muc 9.2 — chỉ sinh ra từ một cú bấm ở màn hình khác.
 *
 * Để RIÊNG khỏi `FILTER_KEYS` chứ không nối vào cuối: danh sách kia là bản chép
 * của muc 9.2 và `GET /reports/filter-keys` công bố đúng con số ấy. Trộn vào là
 * làm một tài liệu nghiệp vụ nói sai về chính nó.
 *
 * Không phải thứ người ta gõ ra được: "bước đang chờ" là mã viết hoa. `reprint`
 * từng đứng cạnh nó (`0045`) và **đã gỡ** ở `0225` — hai nửa của bước B8 giờ là
 * hai trạng thái, nên tiêu chí `status` lọc được chúng. `han` từng đứng ở đây (`0060`) và **đã chuyển vào**
 * `FILTER_KEYS` ở `0077` — khách hàng kể nó trong danh sách trường của bộ lọc,
 * nên nó là một tiêu chí nghiệp vụ chứ không còn là phụ lục kỹ thuật.
 */
export const KHOA_NGOAI_MUC_92 = ['pendingStep'] as const;

/**
 * Tiêu chí nhận NHIỀU giá trị, nối bằng dấu phẩy (`0077`).
 *
 * Một bảng tra, dùng cho cả phép kiểm lẫn phép dựng SQL. Rải `if` ở hai chỗ là
 * mở đường cho một tiêu chí được kiểm như nhiều giá trị nhưng dựng SQL như một
 * giá trị — và triệu chứng của nó là kết quả rỗng, thứ không ai báo lỗi giúp.
 *
 * Năm tiêu chí này đều có ô CHỌN ở giao diện, nên giá trị đến từ danh mục chứ
 * không do người dùng gõ. Bốn tiêu chí còn lại không có mặt ở đây vì lý do
 * riêng: hai cặp ngày là khoảng chứ không phải tập; *Tên KH* tìm gần đúng nên
 * hai từ khoá cùng lúc là câu hỏi không có nghĩa; *Hạn xử lý* chỉ có hai giá trị
 * và chúng loại trừ nhau.
 */
export const KHOA_NHIEU_GIA_TRI = [
  'customerCode',
  'productName',
  'productGroupCode',
  'tdvUserId',
  'status',
] as const;

const laNhieuGiaTri = (k: string): boolean =>
  (KHOA_NHIEU_GIA_TRI as readonly string[]).includes(k);

/**
 * Trần số giá trị mỗi tiêu chí.
 *
 * Không có trần thì một bộ lọc dán vào 5.000 mã khách hàng là một câu truy vấn
 * không ai chặn — và nó đi qua đúng cái đường mà mọi người dùng đều gọi được.
 * 50 đủ rộng cho mọi thao tác thật: ô chọn hiện chip, và không ai chọn tay quá
 * vài chục chip mà vẫn đọc được cái mình vừa chọn.
 */
export const SO_GIA_TRI_TOI_DA = 50;

/** Trần độ dài của MỘT giá trị đơn lẻ. Uuid dài 36, tên sản phẩm dài nhất ~120. */
const DAI_TOI_DA = 200;

/**
 * Cắt một chuỗi nhiều giá trị thành danh sách: bỏ khoảng trắng, bỏ rỗng, khử trùng.
 *
 * KHỬ TRÙNG là phần dễ quên nhất. Chọn cùng một mã hai lần — chuyện thường gặp
 * khi bộ lọc đến từ liên kết rồi người dùng chọn thêm — thì `= ANY` vẫn đúng,
 * nhưng con số "đang lọc theo mấy giá trị" hiện sai và chip mọc lên hai cái
 * giống hệt nhau.
 */
export const tach = (v: string): string[] => [
  ...new Set(
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lọc bộ lọc: bỏ khoá lạ, cắt khoảng trắng, bỏ chuỗi rỗng.
 *
 * "Bỏ chuỗi rỗng" không phải chuyện gọn gàng. Màn hình gửi lên `status=` khi
 * người dùng vừa bấm *Xóa bộ lọc*; hiểu nó là "trạng thái bằng chuỗi rỗng" thì
 * kết quả rỗng, và người dùng thấy màn hình trắng ngay sau khi xoá bộ lọc
 * (RPT-03).
 */
export function cleanFilter(q: Record<string, unknown>): Filter {
  const out: Record<string, string> = {};
  for (const k of [...FILTER_KEYS, ...KHOA_NGOAI_MUC_92]) {
    const v = q[k];
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t === '') continue;

    /*
     * Tiêu chí nhiều giá trị: kiểm TỪNG PHẦN TỬ, không kiểm cả chuỗi (`0077`).
     *
     * Trần 200 ký tự áp cho cả chuỗi vỡ ngay với 5 uuid — 185 ký tự cho 5 giá
     * trị, và người dùng chọn giá trị thứ sáu thì nhận về một lỗi 400 nói mình
     * gõ dài quá, trong khi họ không gõ gì cả.
     */
    if (laNhieuGiaTri(k)) {
      const ds = tach(t);
      if (ds.length === 0) continue;
      if (ds.length > SO_GIA_TRI_TOI_DA) {
        throw bad(k, `nhiều nhất ${SO_GIA_TRI_TOI_DA} giá trị, đang có ${ds.length}`);
      }
      for (const x of ds) {
        if (x.length > DAI_TOI_DA) throw bad(k, `mỗi giá trị dài quá ${DAI_TOI_DA} ký tự`);
      }
      // Ghi lại BẢN ĐÃ CHUẨN HOÁ, không ghi nguyên văn: bản lưu trong Redis và
      // bản đi vào việc xuất file phải giống hệt bản dùng để truy vấn.
      out[k] = ds.join(',');
      continue;
    }

    if (t.length > DAI_TOI_DA) throw bad(k, `dài quá ${DAI_TOI_DA} ký tự`);
    out[k] = t;
  }
  for (const k of ['appliedFrom', 'appliedTo', 'approvedFrom', 'approvedTo'] as const) {
    if (out[k] && !DATE.test(out[k]!)) throw bad(k, 'phải có dạng YYYY-MM-DD');
  }
  // Uuid kiểm từng phần tử. Một phần tử hỏng làm hỏng cả tiêu chí, và nói ra là
  // đúng: `= ANY` với một uuid rác thì Postgres ném lỗi kiểu, không phải bỏ qua.
  if (out['tdvUserId']) {
    for (const x of tach(out['tdvUserId'])) {
      if (!UUID.test(x)) throw bad('tdvUserId', `"${x}" không phải uuid`);
    }
  }
  if (out['han'] && !(HAN_XU_LY as readonly string[]).includes(out['han'])) {
    throw bad('han', `chỉ nhận ${HAN_XU_LY.join(' hoặc ')}`);
  }
  return out as Filter;
}

export type Built = { where: string; params: unknown[] };

/**
 * Dựng mệnh đề WHERE. `params[0]` LUÔN là danh sách phạm vi.
 *
 * Mỗi tiêu chí thêm một tham số đánh số động thay vì cố định `$1..$13`: điều
 * kiện `IS NULL OR` cho mọi tiêu chí đọc gọn hơn nhưng buộc Postgres lập kế
 * hoạch cho một câu lệnh không dùng được chỉ mục nào — với 20 nghìn hồ sơ thì
 * đó là quét toàn bảng ở mọi lần mở màn hình.
 */
/**
 * PHẠM VI của người đang hỏi — id **và** vai trò (`0144`).
 *
 * Tới `0143` chỗ này chỉ truyền `string[]`. Đủ dùng chừng nào phạm vi còn là
 * *"id tôi ở một trong bốn cột"* — và `0142` phá vỡ điều đó: Kế toán có thêm một
 * luật riêng, mà một mảng id thì không nói được ai đang hỏi.
 *
 * Đổi kiểu thay vì thêm một tham số thứ ba: `ids` được luồn qua chục hàm riêng
 * của hai service, và một tham số tuỳ chọn thêm vào cuối thì chỗ nào quên truyền
 * cũng vẫn dịch được — tức là luật im lặng biến mất ở đúng chỗ ấy. Đổi KIỂU thì
 * trình biên dịch chỉ ra từng chỗ, đúng cách `0143` đã bịt hai đường `attach` và
 * `detach`.
 */
export type PhamVi = { ids: string[]; vaiTro: string };

/**
 * Luật riêng của Kế toán (`0142`, nối sang `reporting` ở `0144`).
 *
 * Bản sao của `KE_TOAN_CHUA_TOI_LUOT` bên `policy`. `0157` bỏ vế trạng thái nên
 * hai bên giờ giống nhau từng ký tự — trước đó chúng lệch một phép ép kiểu, vì
 * `rpt.policy_row.status` là `text` còn `pol.policy.status` là enum.
 *
 * Hai chỗ phải trả lời giống hệt nhau. `tests/http/pham-vi-ke-toan.test.ts` so
 * chính hai chuỗi SQL sinh ra, nên lệch là đỏ chứ không lặng lẽ.
 */
const KE_TOAN_CHUA_TOI_LUOT = '(da_qua_tbp = false)';

export function build(f: Filter, pv: PhamVi): Built {
  const params: unknown[] = [pv.ids];
  // Phạm vi: id của tôi ở MỘT TRONG BỐN cột người (`0031`). Cùng phép lọc với
  // `thuocPhamVi` bên policy — hai chỗ phải trả lời giống hệt nhau, nếu không
  // thì một hồ sơ mở được ở màn hình Hồ sơ mà biến mất khỏi Báo cáo.
  const bonCot = `(${['tdv_user_id', 'tbp_user_id', 'ke_toan_user_id', 'sale_admin_user_id']
    .map((c) => `${c} = ANY($1::uuid[])`)
    .join(' OR ')})`;
  /*
   * `0144` — Kế toán chưa thấy hồ sơ ở lượt chờ TBP đầu tiên.
   *
   * Thiếu vế này thì thẻ *Sắp quá hạn* trên Tổng quan đếm cả hồ sơ mà màn hình
   * Hồ sơ đã giấu: ô ghi 3, bấm vào ra 2 dòng, và không có gì nói dòng thứ ba đi
   * đâu. Thẻ ấy cộng `soon` của MỌI bước, kể cả `B4_TBP_DUYET`.
   */
  const cond: string[] =
    pv.vaiTro === 'KE_TOAN' ? [`(${bonCot} AND NOT ${KE_TOAN_CHUA_TOI_LUOT})`] : [bonCot];
  const add = (sql: (i: number) => string, value: unknown): void => {
    params.push(value);
    cond.push(sql(params.length));
  };

  // 1. Thời gian áp dụng — hai đầu đều BAO GỒM ngày biên. Người dùng gõ
  //    01/07 → 31/07 thì hồ sơ áp dụng đúng ngày 31/07 phải nằm trong kết quả.
  if (f.appliedFrom) add((i) => `applied_date >= $${i}::date`, f.appliedFrom);
  if (f.appliedTo) add((i) => `applied_date <= $${i}::date`, f.appliedTo);

  // 2. Thời gian duyệt — là timestamptz nên đầu trên phải là "< ngày hôm sau",
  //    không phải "<= ngày đó": `<= '2026-07-31'` cắt mất mọi hồ sơ duyệt trong
  //    ngày 31/07 sau 00:00:00.
  if (f.approvedFrom) add((i) => `approved_at >= $${i}::date`, f.approvedFrom);
  if (f.approvedTo) add((i) => `approved_at < ($${i}::date + 1)`, f.approvedTo);

  /*
   * 3. Mã khách hàng — khớp CHÍNH XÁC sau chuẩn hoá hoa thường và khoảng trắng,
   *    giống hệt cách `cus.customer` chống trùng mã. Nhiều mã một lúc (`0077`).
   *
   * Chuẩn hoá vế phải Ở NODE (`toUpperCase`) chứ không gọi `upper()` trên mảng
   * trong SQL: `upper(btrim(customer_code)) = ANY($i)` dùng được chỉ mục biểu
   * thức `ix_rpt_customer_norm`, còn bọc thêm hàm quanh tham số thì không.
   */
  if (f.customerCode) {
    add(
      (i) => `upper(btrim(customer_code)) = ANY($${i}::text[])`,
      tach(f.customerCode).map((s) => s.toUpperCase()),
    );
  }

  // 4. Tên khách hàng — "có chứa", bỏ dấu, không phân biệt hoa thường. MỘT từ
  //    khoá: hai từ khoá gần đúng cùng lúc là câu hỏi không có nghĩa rõ ràng.
  if (f.customerName) add((i) => `customer_name_norm LIKE $${i}`, contains(f.customerName));

  /*
   * 5. Tên sản phẩm — khớp nếu hồ sơ CÓ bất kỳ sản phẩm nào trong danh sách đã
   *    chọn (`0077`).
   *
   * Đổi từ "có chứa" sang khớp ĐÚNG TÊN trên mảng đã bỏ dấu. Ô nhập giờ là ô
   * chọn: người dùng gõ để TÌM, rồi chọn ra từng sản phẩm cụ thể, nên thứ gửi
   * lên là tên đầy đủ chứ không phải mảnh từ khoá. Đổi lại được hai thứ — `&&`
   * dùng được chỉ mục GIN `ix_rpt_pnames`, còn `LIKE '%…%'` trên từng phần tử
   * thì không; và chọn ba sản phẩm ra đúng ba sản phẩm ấy, không kèm theo mọi
   * mặt hàng khác có tên chứa cùng một chữ.
   */
  if (f.productName) add((i) => `product_names_norm && $${i}::text[]`, normAll(tach(f.productName)));

  // 6. Nhóm sản phẩm — `&&` (hai mảng có phần tử chung) dùng được chỉ mục GIN.
  if (f.productGroupCode) {
    add((i) => `product_group_codes && $${i}::text[]`, tach(f.productGroupCode));
  }

  // 7. TDV phụ trách — CHỈ thu hẹp trong phạm vi, xem chú thích đầu file.
  if (f.tdvUserId) add((i) => `tdv_user_id = ANY($${i}::uuid[])`, tach(f.tdvUserId));

  // 8. Trạng thái. Màn hình báo cáo thường hỏi "đang chờ ai đó xử lý", tức là
  //    bốn trạng thái một lúc.
  if (f.status) add((i) => `status = ANY($${i}::text[])`, tach(f.status));

  /*
   * 9. Bước đang chờ (`0045`) — cách DUY NHẤT để một liên kết mở ra đúng tập hồ
   * sơ mà thẻ trên trang tổng quan đã đếm.
   *
   * Không thay được bằng `status`: thẻ "Chờ TBP duyệt" đếm cả hồ sơ quá hạn ở
   * bước ấy, mà chúng mang `status = 'QUA_HAN_DUYET'`. Lọc `status=CHO_TBP_DUYET`
   * cho ra một danh sách NGẮN HƠN con số vừa bấm vào — người dùng đếm được, và
   * đó là kiểu sai không ai báo lỗi giúp.
   */
  if (f.pendingStep) {
    add(
      (i) => `${BUOC_DANG_CHO} = ANY($${i}::text[])`,
      f.pendingStep.split(',').map((s) => s.trim()).filter(Boolean),
    );
  }

  // 10. `reprint` (`0045`) ĐÃ GỠ ở `0225` — xem `KHOA_NGOAI_MUC_92`.

  /*
   * 11. Hạn xử lý (`0060`) — một ô chọn gom hai câu hỏi về hạn vào một chỗ.
   *
   * Thay cho `dueSoon=1` của `0047`. Hai tiêu chí cho hai nửa của cùng một câu
   * hỏi là hai chỗ phải nhớ, và người dùng thì hỏi "hồ sơ nào đang có vấn đề về
   * hạn" chứ không hỏi riêng từng nửa.
   *
   * `QUA_HAN` trùng nghĩa với `status=QUA_HAN_DUYET`, và trùng là chấp nhận
   * được: người tìm theo HẠN không nhất thiết nghĩ nó là một trạng thái.
   */
  if (f.han === 'SAP_QUA_HAN') cond.push(SAP_QUA_HAN);
  if (f.han === 'QUA_HAN') cond.push(`status = 'QUA_HAN_DUYET'`);

  return { where: cond.join(' AND '), params };
}

/** Đếm số tiêu chí đang áp — dùng cho phần đầu báo cáo và cho log. */
export const activeCount = (f: Filter): number => Object.values(f).filter(Boolean).length;

/** Chuẩn hoá cùng cách với dữ liệu, để test và màn hình gọi lại được. */
export const normalizeTerm = norm;

const bad = (field: string, why: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', field, message: `${field}: ${why}` });
