/**
 * DOC-10 … DOC-16, DOC-21 … DOC-35 — mẫu hợp đồng và xuất hợp đồng.
 *
 * `.docx` thật, LibreOffice thật trong Gotenberg, PDF sinh ra được đọc lại bằng
 * `pdfjs-dist`. Cả hai đầu của phép biến đổi đều là file thật, nên bước dễ hỏng
 * nhất — ô trống bị Word cắt rời thành nhiều đoạn XML — không cách nào lọt qua.
 *
 * DOC-16 KHÔNG có ở đây, và đó là một quyết định chứ không phải bỏ sót. Xem
 * describe cuối file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createAuditApp } from '@csbh/audit/testing';
import {
  createTestApp as createDocumentApp,
  DocumentOutbox,
  COMPANY,
  TemplatesService,
  makeDocx,
  para,
  placeholdersOf,
  documentXml,
  KNOWN_SOURCES,
  NGUON_BAT_BUOC_HO_SO,
  NHOM_TRUONG,
  O_BANG_SAN_PHAM,
  SYSTEM_USER_ID,
  table,
  tableRow,
} from '@csbh/document/testing';
import { TRUONG_CHAN_LUC_GUI } from '@csbh/policy/testing';
import {
  accessTokenFor,
  bootCatalogListening,
  bootCustomerListening,
  bootIdentityListening,
  bootPolicyListening,
  clearAccountCache,
  clearScopeCache,
  idNguoiDung,
  maDuyNhat,
  http,
  withAdminDb,
  phanCongMacDinh,
} from './app.js';

/**
 * Bộ đếm MST — MỖI khách hàng một mã số thuế riêng (`0104`).
 *
 * Dùng chung một số cho cả tệp thì `POST /customers` tra trùng MST trả về
 * danh sách lớn dần theo số khách hàng đã tạo — O(n²), và những ca chạy sau
 * cùng bắt đầu chạm ngưỡng quá giờ.
 */
let nMst = 0;

const SEED_PW = 'Test@1234';
const P = 'ZZHD';

let identity: INestApplication;
let catalog: INestApplication;
let customer: INestApplication;
let policy: INestApplication;
let doc: INestApplication;
/** Chỉ để TIÊU THỤ hàng đợi nhật ký — tệp này không gọi API nào của audit. */
let auditApp: INestApplication;
/** Bơm tay `doc.outbox`: bộ test đặt `OUTBOX_AUTO_PUMP=0` nên relay không tự chạy. */
let docOutbox: DocumentOutbox;
let templates: TemplatesService;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};

const uniq = (k: string) => maDuyNhat(P, k);

const dget = async (path: string, who: string) =>
  (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`);
const dpost = async (path: string, who: string, body: object = {}) =>
  (await http(doc)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const dput = async (path: string, who: string, body: object) =>
  (await http(doc)).put(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
const ppost = async (path: string, body: object, who: string) =>
  (await http(policy)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);
/** Đọc hồ sơ đúng đường mà MÀN HÌNH chi tiết đi (`0101`). */
const pget = async (path: string, who: string) =>
  (await http(policy)).get(path).set('Authorization', `Bearer ${tok[who]}`);
/**
 * MỌI hành động đi qua đây tự kèm người được phân công (`0031`).
 *
 * Xem `phanCongMacDinh`. Ca nào quan tâm tới người cụ thể thì truyền trong
 * `body` — nó nằm sau nên ghi đè mặc định.
 */
const act = async (id: string, action: string, who: string, body: object = {}) =>
  ppost(`/policies/${id}/actions/${action}`, { ...(await phanCongMacDinh(action)), ...body }, who);


/**
 * Dọn một mẫu do ca kiểm dựng ra (`0098`).
 *
 * Không còn đường xoá nào, nên "dọn" nghĩa là VÔ HIỆU HOÁ: mẫu rời khỏi ô chọn
 * của mọi ca chạy sau, đúng việc mà `ddel` vẫn làm ở đây. Dòng ở lại trong bảng
 * là chấp nhận được — bộ test không đếm số dòng mẫu.
 *
 * Phải đọc TÊN trước vì máy chủ đòi gõ lại tên để xác nhận (luật `17/08`), và
 * ca kiểm đi qua đúng cửa mà người dùng đi.
 */
const donMau = async (goc: string, id: string, who = 'admin01') => {
  const ds = (await dget(goc, who)).body as { id: string; name: string }[];
  const m = ds?.find?.((x) => x.id === id);
  if (!m) return { status: 404, body: {} };
  return dpost(`${goc}/${id}/vo-hieu`, who, { confirm: m.name });
};

const pdfOf = async (path: string, who: string) =>
  (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`).responseType('blob');

/**
 * Một mẫu hợp đồng CÒN DÙNG ĐƯỢC, cho những ca không quan tâm mẫu nào (`0098`).
 *
 * Từ `0098` cả hai đường hợp đồng đòi `mauId` — không còn "bỏ trống thì lấy mẫu
 * đầu danh sách". Hàm này thay chỗ cho ô chọn mà Kế toán và Sale Admin sẽ bấm.
 *
 * KHÔNG nhớ lại giữa các ca: nhiều ca ở tệp này thêm mẫu mới, và mẫu mới nhất
 * đứng đầu danh sách — nhớ một id cũ là bịa ra một hành vi mà người dùng thật
 * không có.
 */
/** Đợi nhật ký (đi qua outbox → RabbitMQ → audit) có đủ số dòng cho một mẫu. */
type DongNhatKy = {
  action: string;
  before_data: { voHieuHoaLuc: string | null } | null;
  after_data: { voHieuHoaLuc: string | null } | null;
};
const doiNhatKy = async (id: string, can: number, hanMs = 30_000): Promise<DongNhatKy[]> => {
  // BƠM TRƯỚC KHI ĐỢI. `deploy/compose.test.yml` đặt `OUTBOX_AUTO_PUMP=0`, nên
  // trong bộ test không relay nào tự chạy — đợi suông là đợi một lá thư chưa ai
  // gửi. Ca viết ở `0098` thiếu đúng bước này (và thiếu cả bản audit tiêu thụ);
  // nó xanh một lượt rồi đỏ ở lượt sau, tuỳ tệp nào chạy trước còn để lại gì.
  await docOutbox.pumpOnce();
  const het = Date.now() + hanMs;
  let rows: DongNhatKy[] = [];
  while (Date.now() < het) {
    rows = await withAdminDb(async (c) => {
      const r = await c.query<DongNhatKy>(
        `SELECT action, before_data, after_data FROM aud.audit_log
          WHERE entity_id = $1 ORDER BY occurred_at, id`,
        [id],
      );
      return r.rows;
    });
    if (rows.length >= can) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`chỉ có ${rows.length}/${can} dòng nhật ký cho mẫu ${id}`);
};

/**
 * Hai mẫu của RIÊNG tệp này, dựng một lần ở `beforeAll` (`0150`).
 *
 * Trước đó hai hàm dưới đây lấy "mẫu đầu tiên trong danh sách dùng được", và nó
 * chạy được nhờ `ensureDefault` seed sẵn mẫu lúc `document` khởi động. `0150` bỏ
 * hẳn cơ chế ấy, nên bảng có thể rỗng — và tệ hơn, dòng duy nhất còn lại có thể
 * là mẫu tối thiểu do `app.ts` dựng, thứ KHÔNG có object trên kho: mọi ca dựng
 * văn bản sẽ nhận 409 `TEMPLATE_FILE_MISSING`.
 *
 * Nhớ id thay vì tra lại mỗi lần cũng bỏ luôn một chỗ mong manh cũ: "cái đầu
 * tiên" phụ thuộc `updated_at DESC`, nên một mẫu do ca khác vừa tải lên là đủ
 * đổi mẫu mà cả tệp đang dùng.
 */
let mauHDNho = '';
let mauHoSoNho = '';

const mauHD = async (): Promise<string> => {
  if (!mauHDNho) throw new Error('beforeAll chưa dựng mẫu hợp đồng');
  return mauHDNho;
};

/** Mẫu HỒ SƠ còn dùng được — cho ca nào cần xem trước lúc hồ sơ còn Nháp. */
const mauHoSo = async (): Promise<string> => {
  if (!mauHoSoNho) throw new Error('beforeAll chưa dựng mẫu hồ sơ');
  return mauHoSoNho;
};

/**
 * Bỏ HẾT khoảng trắng để so.
 *
 * LibreOffice ngắt dòng trong ô bảng hẹp, nên `ZZHD-SP-16-21919` ra khỏi trình
 * trích chữ thành `ZZHD- SP-16- 21919`. Đó là chuyện trình bày, không phải dữ
 * liệu thiếu — câu hỏi cần trả lời là "mã này có trong văn bản không".
 */
const packed = (s: string): string => s.replace(/\s+/g, '');

async function pdfText(pdf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const d = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  let out = '';
  for (let i = 1; i <= d.numPages; i++) {
    const c = await (await d.getPage(i)).getTextContent();
    out += c.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  await d.destroy();
  return out.replace(/\s+/g, ' ');
}

// --- Dữ liệu nền -------------------------------------------------------------

let groupCode = '';
const CUSTOMER_NAME = 'Nhà thuốc Minh Châu — Quận Đống Đa';
const ADDRESS_1 = 'Số 8 Tôn Thất Thuyết, Hà Nội';
const ADDRESS_2 = 'Số 145 Nguyễn Trãi, Thanh Xuân, Hà Nội';

const makeProduct = async (i = 0): Promise<string> => {
  const c = await http(catalog);
  const r = await c
    .post('/catalog/products')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({
      code: uniq('SP'),
      name: `Nutricare Gold ${i}`,
      groupCode, price: '100000' });
  // Kiểm NGAY tại đây. Không kiểm thì một lời gọi hỏng đi tiếp với `id`
  // undefined và nổ ba mươi dòng sau ở chỗ lập hồ sơ, với thông báo
  // "productId: phải là chuỗi" — chẳng liên quan gì tới nguyên nhân.
  if (r.status !== 201) throw new Error(`tạo sản phẩm hỏng: ${JSON.stringify(r.body)}`);
  await c
    .post(`/catalog/products/${r.body.id}/prices`)
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ priceType: 'GIA_BAN_CONG_TY', amount: '100000', effectiveFrom: '2020-01-01' });
  return r.body.id as string;
};

const makeCustomer = async (over: Record<string, unknown> = {}) => {
  const code = uniq('KH');
  const r = await (await http(customer))
    .post('/customers')
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send({
      code,
      name: CUSTOMER_NAME,
      customerType: 1,
      registeredAddresses: [ADDRESS_1],
      ownerName: 'Trần Thị Mỹ Hạnh',
      // `0104` — gửi duyệt đòi đủ MST và chức danh, nên khách hàng
      // của bộ test phải giống khách hàng thật.
      ownerTitle: 'Chu ho',
      idNumber: String(5100333333 + ++nMst),
      debtTerm: 'SAU_NHAN_HANG',
      ...over, phone: '0900000000' });
  if (r.status !== 201) throw new Error(`tạo khách hàng hỏng: ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, code };
};

const line = (productId: string) => ({ productId, wholesalePrice: '90000', cpbh: ['3000'] });

async function draft(lineCount = 1, customerId?: string) {
  const cus = customerId ? { id: customerId, code: '' } : await makeCustomer();
  const lines = [];
  for (let i = 0; i < lineCount; i++) lines.push(line(await makeProduct(i)));
  const r = await ppost(
    '/policies',
    { customerId: cus.id, lines, ...(customerId ? { mode: 'AMEND' } : {}) },
    'tdv01',
  );
  if (r.status !== 201) throw new Error(`lập hồ sơ hỏng: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.id as string, customerId: cus.id, code: cus.code };
}

/**
 * Giao hồ sơ cho `sa01` bằng cách vặn thẳng CSDL (`0163`).
 *
 * Chỉ Sale Admin dựng được bản mềm, mà `sale_admin_user_id` chỉ được điền ở
 * bước `KT_RECEIVE_L1`. Ca nào muốn dựng bản mềm của một hồ sơ CHƯA tới bước ấy
 * thì gọi hàm này, thay vì đẩy hồ sơ đi ba bước — tệp này kiểm việc DỰNG VĂN
 * BẢN, không kiểm luồng duyệt.
 *
 * **KHÔNG gọi nó trong `draft()`.** Bản đầu của `0163` làm đúng thế và DOC-27 đỏ
 * ở một chỗ chẳng liên quan: từ `0141` bước `KT_RECEIVE_L1` chỉ hỏi Sale Admin
 * khi cột còn rỗng, nên gán sẵn là bước ấy thôi ghi — và thôi bắn sự kiện dựng
 * dòng `cus.customer_access`. `sa01` giữ được quyền đọc HỒ SƠ mà mất quyền sửa
 * KHÁCH HÀNG. Phép gán tắt phải đứng ngoài đường đi thật, đúng chỗ nó cần.
 */
const giaoChoSa = (id: string) =>
  withAdminDb((c) =>
    c.query(
      `UPDATE pol.policy
          SET sale_admin_user_id = (SELECT id FROM idn.app_user WHERE username = 'sa01')
        WHERE id = $1`,
      [id],
    ),
  );

/** Đưa hồ sơ tới đúng bước Kế toán đã tiếp nhận lần 1 — cổng mở cho xuất hợp đồng. */
async function toReceivedL1(lineCount = 1) {
  const d = await draft(lineCount);
  await act(d.id, 'SUBMIT', 'tdv01');
  await act(d.id, 'TBP_SIGN', 'tbp01');
  await act(d.id, 'KT_RECEIVE_L1', 'kt01');
  return d;
}

/*
 * `toReceivedL1Voi` ĐÃ GỠ (`0163`).
 *
 * Nó đẩy hồ sơ tới `CHO_KT_L1` bằng MỘT mẫu cụ thể, vì `0098` đóng băng mẫu lúc
 * gửi duyệt nên "hồ sơ dựng bằng mẫu nào" là một tính chất của hồ sơ. Không còn
 * thế: mẫu là tham số của lượt IN, nên `toReceivedL1()` cộng một `mauId` ở lượt
 * render nói đúng chuyện ấy và nói gọn hơn.
 */

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();
  for (const u of ['tdv01', 'tbp01', 'kt01', 'sa01', 'admin01', 'bld01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }

  const c = await bootCatalogListening();
  catalog = c.app;
  restores.push(c.restore);
  const cu = await bootCustomerListening();
  customer = cu.app;
  restores.push(cu.restore);
  const po = await bootPolicyListening();
  policy = po.app;
  restores.push(po.restore);

  /*
   * DỌN MẪU CỦA LƯỢT CHẠY TRƯỚC, giữ lại mẫu mặc định (`0067`).
   *
   * Từ `0067` mọi mẫu trong bảng đều dùng được, và lời gọi không kèm `mauId`
   * lấy mẫu MỚI NHẤT. Nên một mẫu do ca kiểm thử của lượt trước bỏ quên sẽ
   * thắng mẫu mặc định, và mọi khẳng định về NỘI DUNG hợp đồng đổi nghĩa —
   * triệu chứng là hàng loạt ca đỏ với "expected 'đứng dọc' to contain ...",
   * ở những ca chẳng liên quan gì tới nhau.
   *
   * Trước `0067` chuyện này không xảy ra vì mẫu bỏ quên nằm ở trạng thái nháp
   * hoặc đã ngừng — vòng đời ấy che giấu việc bộ kiểm thử vốn không tự dọn.
   *
   * `0150` — CHỪA LẠI MẪU CỦA CHÍNH BỘ KIỂM, không chừa "mẫu mặc định".
   *
   * Khái niệm mẫu mặc định đã bỏ hẳn: hệ thống không tự dựng mẫu nào nữa. Thứ
   * duy nhất còn phải chừa là dòng do `mauHoSoMacDinh()` bên `app.ts` dựng ra
   * để các tệp kiểm khác có "một id hợp lệ" — nó mang `updated_by` là người
   * dùng HỆ THỐNG, và hàm ấy nhớ id trong biến toàn cục suốt lượt chạy. Xoá nó
   * ở đây là để lại một id treo cho mọi tệp chạy sau.
   *
   * Mẫu do chính tệp này tải lên ở lượt trước thì xoá sạch — chúng mang tên
   * `admin01` và `0150` cấm trùng tên, nên bỏ lại là lượt sau không tải lên
   * được nữa.
   */
  await withAdminDb(async (c) => {
    await c.query(
      `DELETE FROM doc.contract_template_field f
        USING doc.contract_template t
        WHERE f.template_id = t.id AND t.updated_by <> $1::uuid`,
      [SYSTEM_USER_ID],
    );
    await c.query(`DELETE FROM doc.contract_template WHERE updated_by <> $1::uuid`, [
      SYSTEM_USER_ID,
    ]);
  });


  doc = await createDocumentApp();
  templates = doc.get(TemplatesService);

  /*
   * AUDIT PHẢI CHẠY TRONG CHÍNH TỆP NÀY (`0099`).
   *
   * `document` tự bơm `doc.outbox` sang RabbitMQ, nhưng lá thư nằm trong hàng
   * đợi `audit` cho tới khi có ai đó tiêu thụ. Ca "vô hiệu để lại dòng nhật ký"
   * viết ở `0098` không dựng audit, nên nó đọc `aud.audit_log` và chỉ xanh khi
   * một tệp test CHẠY TRƯỚC tình cờ còn để một bản audit sống — nghĩa là nó
   * xanh hay đỏ tuỳ thứ tự tệp. Lượt rà `0099` bắt được nó đỏ: `0/1 dòng` sau
   * 30 giây đợi.
   *
   * Dựng ở đây thì chuỗi outbox → RabbitMQ → `aud.audit_log` đóng trọn trong
   * tệp này, và ca kiểm nói đúng thứ nó khẳng định.
   */
  auditApp = await createAuditApp();
  docOutbox = doc.get(DocumentOutbox);

  const g = await (await http(catalog))
    .post('/catalog/product-groups')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .send({ code: uniq('NHOM'), name: 'Nhom HD' });
  groupCode = g.body.code as string;

  /*
   * HAI MẪU của riêng tệp này (`0150`).
   *
   * Thay cho hai bản `ensureDefault` từng seed lúc `document` khởi động. Dựng ở
   * đây, một lần, và nhớ id — xem chú thích ở `mauHD`/`mauHoSo`.
   */
  const hd = await luuMau('admin01', thanMauHopDong(), { name: uniq('Mau HD cua bo kiem') });
  if (hd.status !== 201) throw new Error(`không dựng được mẫu hợp đồng: ${JSON.stringify(hd.body)}`);
  mauHDNho = hd.body.id as string;

  const hs = await luuMauHoSoTen(uniq('Mau ho so cua bo kiem'));
  if (hs.status !== 201) throw new Error(`không dựng được mẫu hồ sơ: ${JSON.stringify(hs.body)}`);
  mauHoSoNho = hs.body.id as string;
}, 120_000);

afterAll(async () => {
  await auditApp?.close();
  await doc?.close();
  await policy?.close();
  await customer?.close();
  await catalog?.close();
  await identity?.close();
  for (const r of restores) r();
});

// =============================================================================
// DOC-25 · DOC-29 · DOC-30 · DOC-33 — mẫu và bảng ánh xạ
// =============================================================================

/** Mẫu 12 ô trống, đúng con số ở DOC-25. */
/**
 * Mẫu 12 ô trống — không còn khoá `cong_ty.` (`0067`).
 *
 * Tên và địa chỉ Công ty gõ THẲNG, đúng như người soạn mẫu thật sẽ làm: chúng
 * cố định ở mọi hồ sơ nên không có ô trống nào cho chúng nữa.
 */
const twelveSlotTemplate = () =>
  makeDocx(
    [
      para(COMPANY.name),
      para('HỢP ĐỒNG với {{ho_so.ten_khach_hang}} (mã {{ho_so.ma_khach_hang}})'),
      para('Địa chỉ: {{ho_so.dia_chi_dang_ky}} — nhận hàng {{ho_so.noi_nhan_hang}}'),
      para('Đại diện: {{ho_so.nguoi_dai_dien}} — {{ho_so.chuc_danh_dai_dien}}'),
      para('Công nợ: {{ho_so.cong_no}}'),
      para('Hồ sơ {{ho_so.ma_ho_so}} · phiên bản {{ho_so.phien_ban}}, áp dụng {{ho_so.ngay_ap_dung}}'),
      para('Người lập: {{ho_so.nguoi_de_nghi}}'),
      para('Ngày ký: {{ngay_in}}'),
    ].join(''),
  );

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Ánh xạ suy từ CHÍNH TÊN Ô TRỐNG — dùng cho phần lớn ca kiểm thử (`0067`).
 *
 * Khoá trộn viết bằng tiếng Việt từ `0051` và trùng luôn tên trường nguồn, nên
 * phép suy này đúng với mọi mẫu hợp lệ. Ca nào cần một ánh xạ SAI thì tự khai
 * lấy — đó mới là thứ nó đang kiểm.
 */
const anhXaTu = (buf: Buffer) =>
  placeholdersOf(buf)
    .filter((o) => o !== '{{bang_san_pham}}')
    .map((o) => ({ placeholder: o, source: o.slice(2, -2) }));

/**
 * LƯU một mẫu: file, ánh xạ và tập cột trong MỘT lượt gọi (`0067`).
 *
 * Ba bước cũ — tải lên, ánh xạ, ban hành — gộp làm một, vì cả ba chỉ có nghĩa
 * khi đủ cả ba. Không còn mẫu nháp, không còn mẫu chờ ban hành.
 */
const luuMau = async (
  who: string,
  buf: Buffer,
  o: { name?: string; mapping?: { placeholder: string; source: string }[]; cotBang?: string[] } = {},
) => {
  let r = (await http(doc))
    .post('/contract-templates')
    .set('Authorization', `Bearer ${tok[who]}`)
    .field('name', o.name ?? 'Mẫu thử')
    .field('mapping', JSON.stringify(o.mapping ?? anhXaTu(buf)));
  if (o.cotBang) r = r.field('cotBang', JSON.stringify(o.cotBang));
  return r.attach('file', buf, { filename: 'mau.docx', contentType: DOCX });
};

/** Bí danh cũ, giữ để những ca chỉ cần "có một mẫu hợp lệ" đọc vẫn xuôi. */
const uploadTemplate = async (who: string, buf: Buffer, name = 'Mẫu thử') =>
  luuMau(who, buf, { name });

/** Đọc ô trống mà KHÔNG lưu gì — bước đầu của màn hình thêm mẫu (`0067`). */
const docOTrong = async (who: string, buf: Buffer) =>
  (await http(doc))
    .post('/contract-templates/o-trong')
    .set('Authorization', `Bearer ${tok[who]}`)
    .attach('file', buf, { filename: 'mau.docx', contentType: DOCX });

describe('DOC-25 đọc ô trống của một file .docx', () => {
  it('`0067` liệt kê đủ ô trống và GỢI Ý sẵn ánh xạ, KHÔNG lưu dòng nào', async () => {
    /*
     * Bước đầu của màn hình thêm mẫu: chọn file → dựng bảng ánh xạ → bấm Lưu.
     * Bước này không tạo dòng nào, và đó là cả điểm của nó. Trước `0067` việc
     * tải lên đã tạo ngay một mẫu "nháp", nên mỗi lần người dùng đổi ý giữa
     * chừng lại để lại một dòng rác mà chỉ họ biết là rác.
     */
    const truoc = ((await dget('/contract-templates', 'admin01')).body as unknown[]).length;

    const r = await docOTrong('admin01', twelveSlotTemplate());
    expect(r.status).toBe(200);
    expect(r.body.placeholders).toHaveLength(12);
    expect(r.body.placeholders).toContain('{{ho_so.ten_khach_hang}}');
    // Gợi ý suy từ chính tên ô trống — khoá tiếng Việt trùng tên trường nguồn.
    expect(r.body.goiY).toContainEqual({
      placeholder: '{{ho_so.ten_khach_hang}}',
      source: 'ho_so.ten_khach_hang',
    });

    const sau = ((await dget('/contract-templates', 'admin01')).body as unknown[]).length;
    expect(sau, 'đọc ô trống KHÔNG được tạo mẫu nào').toBe(truoc);
  }, 60_000);

  it('ô trống bị Word cắt rời thành nhiều đoạn XML vẫn nhận ra được', async () => {
    // Word cắt một đoạn văn thành nhiều <w:r> bất cứ lúc nào nó muốn. Đây là
    // kiểu hỏng IM LẶNG: file vẫn sinh ra, chỉ là ô trống không được điền.
    const split =
      '<w:p><w:r><w:t>Kính gửi {{ho_so.</w:t></w:r>' +
      '<w:r><w:t>ten_khach</w:t></w:r>' +
      '<w:r><w:t>_hang}}, xin chào</w:t></w:r></w:p>';
    expect(placeholdersOf(makeDocx(split))).toEqual(['{{ho_so.ten_khach_hang}}']);
  });
});

describe('DOC-33 file mẫu hỏng hoặc không phải .docx', () => {
  it('400 và mẫu đang có KHÔNG bị ảnh hưởng', async () => {
    // `khaDung` chứ không `chon()` từ `0098`: `chon` đòi một id cụ thể, còn câu
    // ca này hỏi là "danh sách mẫu dùng được có đổi không".
    const activeBefore = await templates.khaDung('HOP_DONG');

    // `mapping: []` khai tay: `anhXaTu` đọc ô trống ngay tại tiến trình test, và
    // với một file hỏng thì nó nổ TRƯỚC khi kịp gửi đi — che mất chính phép kiểm
    // phía máy chủ mà ca này đang canh.
    const notZip = await luuMau('admin01', Buffer.from('day khong phai file docx'), { mapping: [] });
    expect(notZip.status).toBe(400);
    expect(notZip.body.code).toBe('TEMPLATE_NOT_DOCX');

    // Zip HỢP LỆ nhưng không có word/document.xml — mở được như zip, không phải
    // tài liệu Word. Hai đường hỏng khác nhau và phải chặn được cả hai.
    const { zipSync, strToU8 } = await import('fflate');
    const zipNoDoc = Buffer.from(zipSync({ 'ghi-chu.txt': strToU8('khong phai docx') }));
    const corrupt = await luuMau('admin01', zipNoDoc, { mapping: [] });
    expect(corrupt.status).toBe(400);
    expect(corrupt.body.code).toBe('TEMPLATE_NOT_DOCX');

    const activeAfter = await templates.khaDung('HOP_DONG');
    expect(activeAfter.map((m) => m.id)).toEqual(activeBefore.map((m) => m.id));
  }, 60_000);
});

describe('DOC-29 ánh xạ tới trường nguồn không tồn tại', () => {
  it('400 ngay lúc LƯU, không đợi tới lúc xuất', async () => {
    const buf = twelveSlotTemplate();
    const r = await luuMau('admin01', buf, {
      mapping: [{ placeholder: '{{ho_so.ten_khach_hang}}', source: 'customer.ten_khong_co' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('SOURCE_UNKNOWN');
    expect(r.body.knownSources).toContain('ho_so.ten_khach_hang');
  }, 60_000);

  it('ánh xạ tới ô trống không có trong mẫu cũng bị chặn', async () => {
    const r = await luuMau('admin01', twelveSlotTemplate(), {
      mapping: [{ placeholder: '{{khong.co.trong.mau}}', source: 'ho_so.ten_khach_hang' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PLACEHOLDER_NOT_IN_TEMPLATE');
  }, 60_000);

  it('`0067` một lượt LƯU hỏng thì KHÔNG để lại dòng mẫu nào', async () => {
    /*
     * Điểm được nhất của việc gộp ba bước làm một: không có trạng thái nửa vời.
     * Trước `0067` lượt tải lên đã tạo dòng, nên một ánh xạ sai để lại đúng thứ
     * mà không màn hình nào giải thích được — một mẫu tồn tại nhưng không dùng
     * được, và người dùng không biết mình đang đứng ở đâu.
     */
    const truoc = ((await dget('/contract-templates', 'admin01')).body as unknown[]).length;
    const r = await luuMau('admin01', twelveSlotTemplate(), {
      name: 'Mau hong khong duoc luu',
      mapping: [{ placeholder: '{{ho_so.ten_khach_hang}}', source: 'khong.co.truong.nay' }],
    });
    expect(r.status).toBe(400);
    const sau = (await dget('/contract-templates', 'admin01')).body as { name: string }[];
    expect(sau.length).toBe(truoc);
    expect(sau.some((t) => t.name === 'Mau hong khong duoc luu')).toBe(false);
  }, 60_000);
});

describe('DOC-30 lưu mẫu còn ô trống chưa ánh xạ', () => {
  it('chặn và chỉ rõ ô nào chưa ánh xạ', async () => {
    const r = await luuMau('admin01', twelveSlotTemplate(), {
      mapping: [{ placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang' }],
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('TEMPLATE_INCOMPLETE');
    expect(r.body.missing).toHaveLength(11);
    expect(r.body.missing).toContain('{{ho_so.ma_ho_so}}');
  }, 60_000);
});

describe('`0060` DOC-26 ĐẢO CHIỀU — mẫu hợp đồng về tay Quản trị hệ thống', () => {
  /*
   * DOC-26 giao mẫu hợp đồng cho Sale Admin vì nó là "văn bản nghiệp vụ của
   * người bán". Khách hàng chốt lại ngày 20/08: gộp về Quản trị, cùng chỗ với
   * mẫu hồ sơ CSBH, thành hai thẻ của một trang *Văn bản mẫu*.
   *
   * Ca này giữ nguyên hình dạng của ca cũ nhưng ĐỔI CHIỀU mọi khẳng định — đó
   * là cách duy nhất để một lượt "nới quyền" không lặng lẽ bỏ sót nửa còn lại:
   * mở cho Quản trị mà quên đóng cho Sale Admin thì cả hai cùng vào được, và
   * không có gì đỏ.
   */
  it('Quản trị quản lý được mẫu hợp đồng', async () => {
    expect((await dget('/contract-templates', 'admin01')).status).toBe(200);
    const t = await uploadTemplate('admin01', twelveSlotTemplate());
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    // Dọn ngay: từ `0067` mẫu mới nhất là mẫu mặc định của mọi lời gọi không kèm
    // `mauId`, nên một mẫu bỏ quên ở đây làm đổi nghĩa mọi ca nói về NỘI DUNG
    // hợp đồng phía sau.
    expect((await donMau('/contract-templates', t.body.id, 'admin01')).status).toBe(200);
  }, 60_000);

  it('Sale Admin KHÔNG còn quản lý được — mọi đường quản lý đều 403', async () => {
    expect((await dget('/contract-templates', 'sa01')).status).toBe(403);
    expect((await uploadTemplate('sa01', twelveSlotTemplate())).status).toBe(403);
    expect((await dget('/contract-templates/sources', 'sa01')).status).toBe(403);
  }, 60_000);

  it('nhưng Sale Admin và Kế toán VẪN chọn được mẫu lúc xuất hợp đồng', async () => {
    /*
     * Nửa quan trọng nhất của lượt này: đổi chủ sở hữu KHÔNG được lấy đi thứ gì
     * trong luồng nghiệp vụ. Sale Admin và Kế toán vẫn là người bấm xuất hợp
     * đồng, nên họ vẫn phải thấy danh sách mẫu để chọn.
     *
     * Và Quản trị — người quản lý chính những mẫu ấy — thì KHÔNG thấy đường này,
     * vì họ không xuất hợp đồng bao giờ. Bất đối xứng ấy là cố ý, không phải sót.
     */
    expect((await dget('/contract-templates/available', 'sa01')).status).toBe(200);
    expect((await dget('/contract-templates/available', 'kt01')).status).toBe(200);
    expect((await dget('/contract-templates/available', 'admin01')).status).toBe(403);
  }, 60_000);
});

// =============================================================================
// DOC-10 · DOC-11 · DOC-21 — cổng thời điểm và vai trò
// =============================================================================

describe('DOC-10 · DOC-21 cổng thời điểm giống nhau cho cả hai vai trò', () => {
  it('kế toán xuất khi chưa tiếp nhận L1 thì 409', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await dget(`/policies/${d.id}/contract/preview?mauId=${await mauHD()}`, 'kt01');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONTRACT_NOT_READY');
  }, 60_000);

  it('DOC-21 Sale Admin CHƯA ĐƯỢC GIAO thì 403, không phải 409 (`0031`)', async () => {
    // Ca này đổi ý nghĩa cùng `0031`, và đổi theo hướng chặt hơn.
    //
    // Trước đây Sale Admin thấy mọi hồ sơ trong nhánh cây của mình, nên câu hỏi
    // duy nhất còn lại là "cổng thời điểm đã mở chưa" — và câu trả lời là 409.
    // Giờ Sale Admin chỉ được giao hồ sơ ở bước `KT_RECEIVE_L1`; ở `CHO_TBP_DUYET`
    // họ chưa liên quan gì tới hồ sơ này, nên chặn ở tầng PHẠM VI trước.
    //
    // 403 trước 409 là đúng thứ tự: không nói cho người ngoài phạm vi biết hồ sơ
    // ấy đang ở bước nào.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const r = await dget(`/policies/${d.id}/contract/preview?mauId=${await mauHD()}`, 'sa01');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
  }, 60_000);

  it('Sale Admin ĐÃ ĐƯỢC GIAO thì qua phạm vi, và cổng thời điểm vẫn giữ nguyên', async () => {
    // Nửa còn lại của DOC-21: quyền rộng ra không mở cổng sớm hơn. Kiểm bằng
    // chính người đã được giao, để phép kiểm nói về CỔNG chứ không về phạm vi.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    const r = await dget(`/policies/${d.id}/contract/preview?mauId=${await mauHD()}`, 'sa01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }, 60_000);
});

describe('DOC-11 gọi API xuất hợp đồng bằng cả 6 vai trò', () => {
  it('Kế toán 200 · Sale Admin 200 · bốn vai trò còn lại 403', async () => {
    const d = await toReceivedL1();

    for (const who of ['kt01', 'sa01']) {
      const r = await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, who);
      expect(r.status, `${who} phải xuất được`).toBe(200);
      expect(r.headers['content-type']).toBe('application/pdf');
    }
    for (const who of ['tbp01', 'tdv01', 'bld01', 'admin01']) {
      const r = await dget(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, who);
      expect(r.status, `${who} không được xuất`).toBe(403);
    }
  }, 120_000);
});

// =============================================================================
// DOC-14 · DOC-13 · DOC-31 · DOC-32 — trộn dữ liệu
// =============================================================================

describe('DOC-14 xem trước hợp đồng', () => {
  it('trộn đúng dữ liệu và KHÔNG tạo bản ghi nào', async () => {
    const d = await toReceivedL1(2);

    const before = await withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM doc.stored_file WHERE purpose <> 'MAU_HD'`,
      );
      return r.rows[0]!.n;
    });

    const r = await dget(`/policies/${d.id}/contract/preview?mauId=${await mauHD()}`, 'kt01');
    expect(r.status).toBe(200);
    expect(r.body.values['{{ho_so.ten_khach_hang}}']).toBe(CUSTOMER_NAME);
    expect(r.body.values['{{ho_so.dia_chi_dang_ky}}']).toBe(ADDRESS_1);
    expect(r.body.values['{{ho_so.ma_ho_so}}']).toMatch(/^CSBH-/);
    // `lines` và `missingRequired` KHÔNG còn trong bản xem trước (`0067`): bảng
    // sản phẩm do hệ thống dựng lúc trộn, và cờ bắt buộc theo từng ô đã bỏ.
    expect(r.body.lines).toBeUndefined();
    expect(r.body.missingRequired).toBeUndefined();

    const after = await withAdminDb(async (c) => {
      const q = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM doc.stored_file WHERE purpose <> 'MAU_HD'`,
      );
      return q.rows[0]!.n;
    });
    expect(after).toBe(before);
  }, 90_000);
});

describe('`0067` DOC-13 ĐỔI LUẬT — hồ sơ thiếu trường thì ô trống ra RỖNG', () => {
  /*
   * DOC-13 cũ: người soạn mẫu đánh dấu một ô trống là BẮT BUỘC, và hồ sơ thiếu
   * trường ấy thì chặn xuất với 422.
   *
   * `0067` bỏ cờ `required`, nên luật đổi hẳn. Lý do bỏ: cờ ấy chỉ đổi THỜI
   * ĐIỂM báo lỗi, và báo cho người KHÔNG sửa được — kế toán bấm xuất và nhận
   * "hồ sơ khách hàng thiếu chức danh người đại diện", trong khi sửa hồ sơ khách
   * hàng là việc của TDV còn sửa mẫu là việc của Quản trị.
   *
   * Cái giá đã chấp nhận: hợp đồng in ra CÓ THỂ thiếu một dòng thông tin. Đổi
   * lại nó nhìn thấy được ngay trên bản xem trước — mà từ `0060` bản xem trước
   * là đường DUY NHẤT dẫn tới nút tải, nên không ai xuất mà chưa nhìn.
   *
   * `0104` ĐỔI NEO CỦA CA NÀY. Bản trước dựng trên một khách hàng bỏ trống *chức
   * danh người đại diện* — tình huống mà `0104` vừa bịt: hồ sơ ấy không gửi duyệt
   * được nữa, nên nó không bao giờ tới bước xuất hợp đồng.
   *
   * Neo mới là *ngày KT nhận lần 2*, và nó neo CHẶT HƠN: hợp đồng xuất ở B7 còn
   * trường ấy do B10 sinh ra, nên nó rỗng KHÔNG PHẢI vì ai đó quên nhập mà vì
   * chưa tới lúc. Không ai sửa được, và chặn xuất ở đây là chặn vĩnh viễn. Đó
   * đúng là điều `0102` đã nói khi gỡ hai mục ấy khỏi danh sách bắt buộc.
   */
  it('xuất được, và ô trống của trường CHƯA TỚI LÚC ra chuỗi rỗng', async () => {
    const d = await toReceivedL1();

    const buf = makeDocx(
      [
        para(COMPANY.name),
        para('HỢP ĐỒNG với {{ho_so.ten_khach_hang}}'),
        para('Duyệt ngày {{ho_so.ngay_kt_nhan_l2}}'),
      ].join(''),
    );
    const t = await luuMau('admin01', buf, { name: 'Mẫu có ngày duyệt' });
    expect(t.status, JSON.stringify(t.body)).toBe(201);

    try {
      const prev = await dget(`/policies/${d.id}/contract/preview?mauId=${t.body.id}`, 'kt01');
      expect(prev.status).toBe(200);
      expect(prev.body.values['{{ho_so.ngay_kt_nhan_l2}}']).toBe('');

      // Và KHÔNG còn 422: bản PDF sinh ra bình thường, chỗ ấy để trống.
      const exp = await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${t.body.id}`, 'kt01');
      expect(exp.status).toBe(200);
      const chu = await pdfText(exp.body as Buffer);
      // Không mang nguyên chuỗi `{{...}}` — rỗng khác hẳn chưa-thay.
      expect(chu).not.toContain('{{');
    } finally {
      await donMau('/contract-templates', t.body.id, 'admin01');
    }
  }, 150_000);
});

describe('DOC-31 · DOC-32 định dạng và bảng lặp', () => {
  it('tiền có phân nhóm nghìn, ngày dd/mm/yyyy, tỷ lệ khớp số trên hồ sơ CSBH', async () => {
    const d = await toReceivedL1(1);
    const prev = (await dget(`/policies/${d.id}/contract/preview?mauId=${await mauHD()}`, 'kt01')).body;

    /*
     * `0138` — công nợ đi ra là CÂU CHỮ, không phải số tiền. Để nó ở `money_vnd`
     * thì `applyFormat` phân nhóm hàng nghìn một câu tiếng Việt.
     *
     * Phép phân nhóm hàng nghìn vẫn được canh trong chính ca này, chỉ đổi chỗ:
     * `87.000` ở cuối, đọc ra từ bảng sản phẩm trong PDF.
     */
    expect(prev.values['{{ho_so.cong_no}}']).toBe('Thanh toán sau khi nhận hàng');
    expect(prev.values['{{ngay_in}}']).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    /*
     * Tỷ lệ chiết khấu phải khớp TỪNG KÝ TỰ với con số trên hồ sơ CSBH: cùng
     * phép làm tròn hai chữ số đã chốt ở muc 7, không tính lại theo cách khác.
     *
     * Đọc từ PDF chứ không từ bản xem trước (`0067`): bảng sản phẩm của hợp
     * đồng giờ do hệ thống dựng lúc trộn, nên nó không đi qua `values` nữa.
     */
    const onPolicy = (
      await (await http(policy)).get(`/policies/${d.id}`).set('Authorization', `Bearer ${tok['tdv01']}`)
    ).body.lines[0].discountRate as string;

    const chu = packed(await pdfText((await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).body as Buffer));
    expect(chu).toContain(packed(`${Number(onPolicy).toFixed(2)}%`));
    expect(chu).toContain(packed('87.000'));
  }, 120_000);

  it('`0067` DOC-32 hồ sơ 40 dòng thì bảng hợp đồng sinh đủ 40 dòng', async () => {
    /*
     * DOC-32 gốc kiểm cơ chế NHÂN BẢN DÒNG BẢNG: mẫu vẽ tay một dòng thân mang
     * khoá `san_pham.`, hệ thống nhân nó ra 40 lần.
     *
     * `0067` bỏ cơ chế ấy — mẫu hợp đồng cũng đặt `{{bang_san_pham}}` và hệ
     * thống dựng cả bảng. Điều CẦN khẳng định thì không đổi chút nào: đủ 40
     * dòng, không mất dòng cuối, không sót chuỗi `{{...}}` nào.
     */
    const d = await toReceivedL1(40);
    const linesOf = (
      await (await http(policy)).get(`/policies/${d.id}`).set('Authorization', `Bearer ${tok['tdv01']}`)
    ).body.lines as { productCode: string }[];
    expect(linesOf).toHaveLength(40);

    const pdf = await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01');
    expect(pdf.status).toBe(200);
    const text = await pdfText(pdf.body as Buffer);

    const flat = packed(text);
    for (const l of linesOf) {
      expect(flat, `thiếu dòng ${l.productCode}`).toContain(packed(l.productCode));
    }
    // Và không còn chuỗi {{...}} nào sót lại trong văn bản đưa cho khách hàng.
    expect(text).not.toContain('{{');
  }, 300_000);
});

// =============================================================================
// DOC-34 — chuyển sang PDF qua Gotenberg
// =============================================================================

describe('DOC-34 chuyển hợp đồng đã trộn sang PDF', () => {
  it('đúng khổ, dấu tiếng Việt hiển thị đúng', async () => {
    const d = await toReceivedL1(2);
    const pdf = await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01');
    expect(pdf.status).toBe(200);

    const text = await pdfText(pdf.body as Buffer);
    expect(text).toContain(CUSTOMER_NAME); //          dấu tiếng Việt nguyên vẹn
    expect(text).toContain('Nhà thuốc');
    expect(text).toContain(ADDRESS_1);
    expect(text).toContain(COMPANY.name);
    expect(text).not.toContain('{{');

    const { PDFDocument } = await import('pdf-lib');
    const parsed = await PDFDocument.load(new Uint8Array(pdf.body as Buffer));
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(Math.round(parsed.getPage(0).getWidth())).toBe(595);
  }, 120_000);

  it('Gotenberg không gọi được thì báo lỗi RÕ, không tạo dấu vết nửa vời', async () => {
    const d = await toReceivedL1();
    const saved = process.env.GOTENBERG_URL;
    process.env.GOTENBERG_URL = 'http://127.0.0.1:1';
    try {
      const r = await dget(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01');
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('PDF_ENGINE_UNAVAILABLE');
    } finally {
      if (saved === undefined) delete process.env.GOTENBERG_URL;
      else process.env.GOTENBERG_URL = saved;
    }

    // Hồ sơ KHÔNG mang dấu "đã xuất hợp đồng" cho một lần xuất không hề xảy ra.
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ contract_issued_at: Date | null }>(
        `SELECT contract_issued_at FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(row.contract_issued_at).toBeNull();
  }, 90_000);
});

// =============================================================================
// DOC-12 · DOC-22 · DOC-23 · DOC-24 · DOC-27 — hành vi của việc KHÔNG lưu
// =============================================================================

describe('DOC-12 hai hồ sơ của cùng một khách hàng', () => {
  it('PDF chứa đúng dữ liệu của hồ sơ được bấm, không lẫn hồ sơ khác', async () => {
    const a = await toReceivedL1(1);
    const aPrev = (await dget(`/policies/${a.id}/contract/preview?mauId=${await mauHD()}`, 'kt01')).body;

    // Đưa A đi hết luồng: bản CHỈNH SỬA chỉ lập được khi khách hàng đã có một
    // CSBH đang hiệu lực để mà chỉnh sửa.
    await ppost(
      `/policies/${a.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${a.id}.pdf` },
      'sa01',
    );
    await act(a.id, 'SA_HANDOVER', 'sa01');
    await act(a.id, 'KT_RECEIVE_L2', 'kt01');

    // Hồ sơ thứ hai của CÙNG khách hàng, sản phẩm khác.
    const b = await draft(1, a.customerId);
    await act(b.id, 'SUBMIT', 'tdv01');
    await act(b.id, 'TBP_SIGN', 'tbp01');
    await act(b.id, 'KT_RECEIVE_L1', 'kt01');
    const bPrev = (await dget(`/policies/${b.id}/contract/preview?mauId=${await mauHD()}`, 'kt01')).body;

    expect(aPrev.values['{{ho_so.ma_ho_so}}']).not.toBe(bPrev.values['{{ho_so.ma_ho_so}}']);

    const pdf = await pdfOf(`/policies/${b.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01');
    const flat = packed(await pdfText(pdf.body as Buffer));

    // Mã hồ sơ là thứ phân biệt hai bản hợp đồng: đúng mã của hồ sơ được bấm,
    // và KHÔNG có mã của hồ sơ kia.
    expect(flat).toContain(packed(bPrev.values['{{ho_so.ma_ho_so}}']));
    expect(flat).not.toContain(packed(aPrev.values['{{ho_so.ma_ho_so}}']));

    // Nhưng SẢN PHẨM thì có lẫn, và đó là ĐÚNG. B là bản chỉnh sửa của A, mà
    // "phiên bản mới phải chứa lại toàn bộ sản phẩm cũ" (muc 5.1) — nên sản
    // phẩm của A có mặt trong hợp đồng của B là nghiệp vụ, không phải rò rỉ dữ
    // liệu. Khẳng định ngược lại ở đây sẽ ép hệ thống vi phạm luật đó.
    const dongB = (
      await (await http(policy)).get(`/policies/${b.id}`).set('Authorization', `Bearer ${tok['tdv01']}`)
    ).body.lines as { productCode: string }[];
    expect(dongB).toHaveLength(2);
    for (const l of dongB) expect(flat).toContain(packed(l.productCode));
  }, 180_000);
});

describe('DOC-22 · DOC-23 hai người cùng bấm xuất', () => {
  it('cả hai đều nhận PDF, nhật ký ghi HAI dòng kèm đúng người và vai trò', async () => {
    const d = await toReceivedL1();
    await withAdminDb(async (c) => {
      await c.query(`DELETE FROM doc.outbox WHERE payload->>'id' = $1`, [d.id]);
    });

    const [kt, sa] = await Promise.all([
      pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01'),
      pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'sa01'),
    ]);
    // Không ghi đè gì nên không có xung đột nào để mà thua.
    expect(kt.status).toBe(200);
    expect(sa.status).toBe(200);

    const events = await withAdminDb(async (c) => {
      const r = await c.query<{ payload: Record<string, string> }>(
        `SELECT payload FROM doc.outbox
          WHERE routing_key = 'document.contract_issued' AND payload->>'id' = $1
          ORDER BY seq`,
        [d.id],
      );
      return r.rows.map((x) => x.payload);
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e['actorRole']).sort()).toEqual(['KE_TOAN', 'SALE_ADMIN']);

    // DOC-23: hai cột trên hồ sơ cập nhật theo lần xuất GẦN NHẤT.
    const row = await withAdminDb(async (c) => {
      const q = await c.query<{ contract_issued_at: Date; contract_issued_by: string }>(
        `SELECT contract_issued_at, contract_issued_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return q.rows[0]!;
    });
    expect(row.contract_issued_at).not.toBeNull();
    const sa01 = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'sa01'`,
      );
      return q.rows[0]!.id;
    });
    const kt01 = await withAdminDb(async (c) => {
      const q = await c.query<{ id: string }>(
        `SELECT id FROM idn.app_user WHERE username = 'kt01'`,
      );
      return q.rows[0]!.id;
    });
    expect([sa01, kt01]).toContain(row.contract_issued_by);
  }, 120_000);
});

describe('DOC-27 xuất, đổi địa chỉ khách hàng, xuất lại', () => {
  it('bản thứ hai mang địa chỉ MỚI — đúng theo thiết kế, không phải lỗi', async () => {
    const d = await toReceivedL1();
    const first = await pdfText((await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).body as Buffer);
    expect(first).toContain(ADDRESS_1);

    const upd = await (await http(customer))
      .patch(`/customers/${d.customerId}`)
      .set('Authorization', `Bearer ${tok['sa01']}`)
      .send({ registeredAddresses: [ADDRESS_2] });
    expect(upd.status).toBe(200);

    const second = await pdfText((await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).body as Buffer);
    expect(second).toContain(ADDRESS_2);
    expect(second).not.toContain(ADDRESS_1);
  }, 150_000);
});

describe('DOC-15 thay mẫu rồi xuất lại', () => {
  it('lần xuất mới dùng MẪU MỚI, không có ràng buộc phiên bản nào', async () => {
    const d = await toReceivedL1();
    const firstText = await pdfText(
      (await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).body as Buffer,
    );
    expect(firstText).toContain('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG');

    const MARK = 'PHU LUC HOP DONG PHIEN BAN MOI';
    const t = await uploadTemplate(
      'admin01',
      makeDocx([para(MARK), para('Khách hàng: {{ho_so.ten_khach_hang}}'), para('Hồ sơ {{ho_so.ma_ho_so}}')].join('')),
      'Mẫu mới',
    );
    expect(t.status, JSON.stringify(t.body)).toBe(201);

    try {
      /*
       * Xuất bằng ĐÚNG id mẫu vừa tải lên (`0150`).
       *
       * Bản trước gọi lại `mauHD()` và dựa vào việc hàm ấy trả "mẫu mới nhất" —
       * một phép suy gián tiếp qua `updated_at DESC`. `0150` cho `mauHD()` nhớ
       * một mẫu cố định của cả tệp, nên phép suy ấy hết đúng; và nói thẳng id ra
       * thì ca kiểm khẳng định đúng điều nó muốn khẳng định.
       */
      const secondText = await pdfText(
        (await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${t.body.id}`, 'kt01')).body as Buffer,
      );
      expect(secondText).toContain(MARK);
      expect(secondText).not.toContain('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG');
    } finally {
      /*
        XOÁ mẫu vừa thêm — và chỉ thế (`0067`).

        `0058` phải dọn hai đầu: gỡ mẫu mới rồi phát hành lại mẫu cũ, vì phát
        hành chỉ THÊM vào danh sách chứ không thay thế. `0067` bỏ hẳn hai nút ấy,
        nên mẫu cũ chưa từng rời đi — xoá mẫu mới là danh sách về nguyên trạng.

        Bỏ bước xoá thì mẫu "Mẫu mới" ở lại và thành mẫu MỚI NHẤT, tức là mẫu
        mặc định của mọi lời gọi không kèm `mauId` — kể cả ở những ca phía sau
        chẳng liên quan gì. DOC-24 đã đỏ đúng vì chuyện đó.
      */
      await donMau('/contract-templates', t.body.id, 'admin01');
    }
  }, 180_000);
});

describe('DOC-24 hồ sơ bị trả về rồi duyệt lại và xuất tiếp', () => {
  it('lần xuất sau lấy dữ liệu phiên bản mới, không có bản ghi hợp đồng cũ nào', async () => {
    const d = await toReceivedL1();
    await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01');

    // Đường trả về ĐÚNG theo máy trạng thái: sau khi tiếp nhận L1 hồ sơ đã ở
    // bước Sale Admin xử lý, nên `KT_RETURN_L1` không còn hợp lệ. Kịch bản thật
    // của DOC-24 là kế toán từ chối ở LẦN HAI và hồ sơ quay về Bước 3.
    await ppost(
      `/policies/${d.id}/attachments`,
      { kind: 'SCAN', fileName: 'ban-cung.pdf', objectKey: `scan/${d.id}.pdf` },
      'sa01',
    );
    expect((await act(d.id, 'SA_HANDOVER', 'sa01')).status).toBe(200);
    expect((await act(d.id, 'KT_RETURN_L2', 'kt01', { reason: 'Sai giá bán buôn' })).status).toBe(200);

    const newProduct = await makeProduct(99);
    const add = await ppost(`/policies/${d.id}/lines`, line(newProduct), 'tdv01');
    expect(add.status).toBe(201);

    await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');

    const prev = (await dget(`/policies/${d.id}/contract/preview?mauId=${await mauHD()}`, 'kt01')).body;
    expect(prev.values['{{ho_so.ma_ho_so}}']).toBeDefined();

    const flat = packed(
      await pdfText((await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).body as Buffer),
    );
    // Hai dòng: sản phẩm cũ và sản phẩm vừa bổ sung. "Phiên bản mới phải chứa
    // lại toàn bộ sản phẩm cũ" (muc 5.1), nên cả hai đều phải có mặt.
    const dong = (
      await (await http(policy)).get(`/policies/${d.id}`).set('Authorization', `Bearer ${tok['tdv01']}`)
    ).body.lines as { productCode: string }[];
    expect(dong).toHaveLength(2);
    for (const l of dong) expect(flat).toContain(packed(l.productCode));
  }, 180_000);
});

// =============================================================================
// DOC-35 — chưa có mẫu nào đang dùng
// =============================================================================

describe('DOC-35 vô hiệu hết mẫu hợp đồng', () => {
  /*
   * `0098` VIẾT LẠI ca này, vì cái nó gác đã đổi bản chất.
   *
   * Bản cũ XOÁ hết mẫu rồi kiểm `NO_ACTIVE_TEMPLATE`. Từ `0098` không còn đường
   * xoá nào — mẫu chỉ vô hiệu hoá được — nên câu hỏi đổi thành: vô hiệu hết mẫu
   * thì đường xuất hợp đồng nói gì?
   *
   * Và câu trả lời cũng đổi. `NO_ACTIVE_TEMPLATE` là câu cho "không truyền mẫu,
   * mà danh sách cũng rỗng"; nhánh ấy biến mất khi `mauId` thành bắt buộc. Giờ
   * người xuất cầm trong tay một id vừa bị vô hiệu, nên câu đúng là câu nói về
   * CHÍNH CÁI MẪU ẤY.
   */
  it('mẫu vừa bị vô hiệu thì từ chối, và nói rõ phải chọn lại', async () => {
    const d = await toReceivedL1();
    const dangCo = await templates.khaDung('HOP_DONG');
    expect(dangCo.length, 'phải có mẫu mặc định seed sẵn lúc khởi động').toBeGreaterThan(0);
    const mau = dangCo[0]!.id;

    for (const m of dangCo) {
      expect(
        (await dpost(`/contract-templates/${m.id}/vo-hieu`, 'admin01', { confirm: m.ten })).status,
      ).toBe(200);
    }
    try {
      expect(await templates.khaDung('HOP_DONG')).toEqual([]);
      const r = await dget(`/policies/${d.id}/contract.pdf?mauId=${mau}`, 'kt01');
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('TEMPLATE_NOT_USABLE');
      expect(r.body.message).toContain('chọn lại');
    } finally {
      for (const m of dangCo) await dpost(`/contract-templates/${m.id}/mo-lai`, 'admin01');
    }
  }, 90_000);

  /**
   * Dòng mẫu vẫn còn nguyên — "vô hiệu" khác "xoá" ở đúng chỗ này.
   *
   * Nếu vô hiệu hoá làm dòng biến mất khỏi màn hình quản trị thì không ai bật
   * lại được, và nó chính là xoá dưới một cái tên dễ nghe hơn.
   */
  it('mẫu đã vô hiệu VẪN nằm trong danh sách của Quản trị, và bật lại được', async () => {
    const truoc = await templates.khaDung('HOP_DONG');
    const mau = truoc[0]!;
    await dpost(`/contract-templates/${mau.id}/vo-hieu`, 'admin01', { confirm: mau.ten });
    try {
      const ds = (await dget('/contract-templates', 'admin01')).body as {
        id: string;
        voHieuHoaLuc: string | null;
      }[];
      const dong = ds.find((x) => x.id === mau.id);
      expect(dong, 'mẫu đã vô hiệu phải còn trong bảng quản trị').toBeTruthy();
      expect(dong!.voHieuHoaLuc).not.toBeNull();
      expect((await templates.khaDung('HOP_DONG')).map((x) => x.id)).not.toContain(mau.id);
    } finally {
      expect((await dpost(`/contract-templates/${mau.id}/mo-lai`, 'admin01')).status).toBe(200);
    }
    expect((await templates.khaDung('HOP_DONG')).map((x) => x.id)).toContain(mau.id);
  }, 60_000);

  /**
   * NHẬT KÝ ghi giá trị TRƯỚC và SAU (YCNV muc 10).
   *
   * Vô hiệu hoá một mẫu là thao tác phá huỷ duy nhất còn lại của màn hình Văn
   * bản mẫu, và nó đổi thứ cả công ty nhìn thấy trong ô chọn. Không có dòng nhật
   * ký thì câu *"ai rút mẫu này đi, lúc nào"* không có chỗ nào trả lời — cột
   * `vo_hieu_hoa_boi` nói được người, nhưng nó bị ghi đè ở lượt vô hiệu kế tiếp.
   */
  it('vô hiệu và mở lại đều để lại dòng nhật ký kèm trước–sau', async () => {
    const mau = (await templates.khaDung('HOP_DONG'))[0]!;
    await dpost(`/contract-templates/${mau.id}/vo-hieu`, 'admin01', { confirm: mau.ten });
    try {
      const tat = (await doiNhatKy(mau.id, 1)).find((r) => r.action === 'TEMPLATE_DISABLED');
      expect(tat, 'thiếu dòng nhật ký cho lượt vô hiệu hoá').toBeTruthy();
      // TRƯỚC còn dùng được, SAU thì không — con số đọc được, không phải chỉ một
      // cái tên hành động.
      expect(tat!.before_data?.voHieuHoaLuc ?? null).toBeNull();
      expect(tat!.after_data?.voHieuHoaLuc ?? null).not.toBeNull();
    } finally {
      await dpost(`/contract-templates/${mau.id}/mo-lai`, 'admin01');
    }

    const bat = (await doiNhatKy(mau.id, 2)).find((r) => r.action === 'TEMPLATE_ENABLED');
    expect(bat, 'thiếu dòng nhật ký cho lượt dùng lại').toBeTruthy();
    expect(bat!.after_data?.voHieuHoaLuc ?? null).toBeNull();
  }, 90_000);

  /** Gõ sai tên mẫu thì máy chủ chặn, không phải chỉ hộp thoại chặn (luật `17/08`). */
  it('vô hiệu hoá đòi gõ đúng tên mẫu, kiểm ở MÁY CHỦ', async () => {
    const mau = (await templates.khaDung('HOP_DONG'))[0]!;
    const r = await dpost(`/contract-templates/${mau.id}/vo-hieu`, 'admin01', {
      confirm: 'gõ đại cho xong',
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CONFIRM_MISMATCH');
    expect((await templates.khaDung('HOP_DONG')).map((x) => x.id)).toContain(mau.id);
  }, 60_000);
});

// =============================================================================
// DOC-28 — không có dấu vết lưu hợp đồng ở bất cứ đâu
// =============================================================================

describe('DOC-28 quét lược đồ, bảng định tuyến và kho lưu trữ', () => {
  it('không có bảng contract nào ngoài bảng MẪU', async () => {
    const tables = await withAdminDb(async (c) => {
      const r = await c.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'doc'`,
      );
      return r.rows.map((x) => x.table_name);
    });
    expect(tables).not.toContain('contract');
    // Hai bảng có chữ "contract" đều là bảng MẪU, không phải bảng hợp đồng.
    expect(tables.filter((t) => t.includes('contract')).sort()).toEqual([
      'contract_template',
      'contract_template_field',
    ]);
  });

  it('không có endpoint GET /contracts/:id', async () => {
    const server = doc.getHttpServer() as {
      _events: { request: { _router?: { stack: { route?: { path: string } }[] } } };
    };
    const router = server._events.request._router;
    const paths = (router?.stack ?? []).map((l) => l.route?.path).filter(Boolean) as string[];
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => /^\/contracts\//.test(p))).toBe(false);
  });

  it('xuất hợp đồng không sinh thêm file nào trong kho', async () => {
    // Bằng chứng đọc từ `doc.stored_file`, KHÔNG từ việc liệt kê MinIO.
    //
    // Bản trước liệt kê kho theo từng tiền tố mục đích và nó treo: trình phân
    // tích XML trong `minio` ném "Entity expansion limit exceeded" từ bên trong
    // `Transform._flush`, tức là ngoại lệ không ai bắt được, và lượt liệt kê chỉ
    // đứng chờ tới lúc hết giờ. Bốn hướng đã bị loại trừ — xem chú thích ở
    // `Storage.listKeys`. Chưa tìm ra nguyên nhân gốc.
    //
    // Đổi nguồn bằng chứng chứ không nới bất biến: điều cần chứng minh vẫn là
    // "xuất hợp đồng không để lại gì trong kho". `doc.stored_file` trả lời được
    // đúng câu đó vì mọi lượt ghi MinIO của ứng dụng đều kèm một dòng ở đây —
    // test ngay dưới ghim lại chính điều kiện ấy, để phép thay nguồn không âm
    // thầm mất hiệu lực khi ai đó thêm một đường ghi kho thứ ba.
    //
    // So CẢ TẬP DÒNG chứ không so số đếm: một cặp thêm-rồi-xoá giữ nguyên số
    // đếm nhưng vẫn là dấu vết hợp đồng đã từng nằm trong kho.
    const anhChup = () =>
      withAdminDb(async (c) => {
        const r = await c.query<{ k: string }>(
          `SELECT object_key || ' ' || purpose || ' ' || coalesce(deleted_at::text,'-') AS k
             FROM doc.stored_file ORDER BY object_key`,
        );
        return r.rows.map((x) => x.k);
      });

    const d = await toReceivedL1();
    const truoc = await anhChup();
    expect((await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).status).toBe(200);

    // PDF trả thẳng về người bấm và không đi qua kho. Chỉ có thể y nguyên.
    expect(await anhChup()).toEqual(truoc);
  }, 120_000);

  it('mọi đường ghi vào kho đều để lại một dòng `stored_file`', async () => {
    // Điều kiện làm cho test trên có giá trị. Nếu một ngày có mã gọi thẳng
    // `storage.put` mà không ghi CSDL thì phép "soi kho qua CSDL" mù đúng chỗ
    // hợp đồng có thể lọt vào — nên ghim số điểm ghi lại ở đây.
    const src = readFileSync(
      new URL('../../services/document/src/files/files.service.ts', import.meta.url),
      'utf8',
    );
    // Hai điểm ghi: `upload()` (file người dùng tải lên) và `store()` (file do
    // hệ thống sinh). Cả hai đều gọi `insert()` ngay sau đó.
    expect(src.match(/this\.storage\.put\(/g)).toHaveLength(2);

    // Chỉ quét `services/document`: `Storage` là provider của riêng service này,
    // service khác không tiêm được nó.
    const goc = new URL('../../services/document/src/', import.meta.url);
    const khac = readdirSync(goc, { recursive: true })
      .map(String)
      .filter((t) => t.endsWith('.ts') && t !== 'files/files.service.ts')
      .filter((t) => /\.storage\.put\(|\.putObject\(/.test(readFileSync(new URL(t, goc), 'utf8')))
      // `storage.ts` là chính lớp bọc — nó gọi `putObject`, đó là việc của nó.
      .filter((t) => t !== 'infra/storage.ts');
    expect(khac).toEqual([]);
  });

  it('không mục đích lưu trữ nào dành cho hợp đồng', async () => {
    // Hợp đồng không được lưu, nên nó không có chỗ để lưu. Danh sách khai thẳng
    // ra: thêm một giá trị enum mới là test đỏ và người thêm phải nói rõ nó
    // dùng cho việc gì.
    const known = await withAdminDb(async (c) => {
      const r = await c.query<{ v: string }>(
        `SELECT unnest(enum_range(NULL::doc.file_purpose))::text AS v`,
      );
      return r.rows.map((x) => x.v.toLowerCase());
    });
    expect(known.sort()).toEqual(['ban_csbh', 'ban_da_ky', 'ho_so', 'mau_hd', 'phap_ly', 'scan']);
  });
});

// =============================================================================
// DOC-16 — mâu thuẫn trong danh mục test, đã xử lý
// =============================================================================

describe('DOC-16 đã bị DOC-28 thay thế', () => {
  it('không có trạng thái hợp đồng và không có bản scan hợp đồng — CÓ CHỦ Ý', async () => {
    // DOC-16 ghi "Hợp đồng có trạng thái riêng và tải được bản scan". Điều đó
    // MÂU THUẪN TRỰC TIẾP với DOC-28 và muc 8.3, vốn nói không có bảng hợp đồng,
    // không mã, không trạng thái, không bản scan.
    //
    // DOC-16 là mức P1 và có từ trước quyết định "hợp đồng là một phép biến đổi";
    // DOC-28 là P0 và viện dẫn thẳng muc 8.3 của bản hợp nhất. Bản hợp nhất
    // thắng, nên DOC-16 nghỉ. Test này giữ lại quyết định đó ở dạng chạy được,
    // thay vì để nó nằm trong một dòng ghi chú rồi bị làm lại sau sáu tháng.
    //
    // Hệ quả phải nói rõ với người dùng: hệ thống KHÔNG trả lời được câu hỏi
    // "hợp đồng nào đã ký, hợp đồng nào chưa". Muốn theo dõi việc ký hợp đồng
    // thì phải bổ sung lưu trữ, và khi đó nên thêm cả ảnh chụp dữ liệu tại thời
    // điểm xuất chứ không chỉ thêm cột trạng thái.
    const cols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'doc' AND table_name LIKE 'contract%'`,
      );
      return r.rows.map((x) => x.column_name);
    });
    expect(cols).not.toContain('status');
    expect(cols).not.toContain('scan_file_id');
    expect(cols).not.toContain('contract_code');

    // Liên kết ngược về hồ sơ nguồn — phần DUY NHẤT của DOC-16 vẫn còn giá trị —
    // được giữ, nhưng ở trên chính hồ sơ chứ không ở một bản ghi hợp đồng.
    const polCols = await withAdminDb(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'pol' AND table_name = 'policy' AND column_name LIKE 'contract%'`,
      );
      return r.rows.map((x) => x.column_name).sort();
    });
    expect(polCols).toEqual(['contract_issued_at', 'contract_issued_by']);
  });
});

// =============================================================================
// `0059` — N-01 thu hẹp: bản mềm và hợp đồng KHÔNG ghi lịch sử nữa
// =============================================================================

describe('`0059` bản mềm và hợp đồng không để lại dòng lịch sử nào', () => {
  /** Các dòng lịch sử của một hồ sơ, mới nhất sau cùng. */
  const lichSu = (id: string) =>
    withAdminDb(async (c) => {
      const r = await c.query<{ action: string; actor_role: string; to_status: string; from_status: string | null }>(
        `SELECT action, actor_role, to_status::text AS to_status,
                from_status::text AS from_status
           FROM pol.policy_event WHERE policy_id = $1 ORDER BY seq`,
        [id],
      );
      return r.rows;
    });

  const dem = (rows: { action: string }[], a: string) => rows.filter((r) => r.action === a).length;

  it('TẢI cũng như XEM — không dòng nào, cho cả hai loại văn bản', async () => {
    /*
     * ĐẢO NGƯỢC `0052`, theo yêu cầu 20/08.
     *
     * `0052` ghi mỗi lượt tải một dòng cho cả bốn loại văn bản (N-01). Khách
     * hàng bỏ hai loại đầu — và bỏ bằng chính lý do đã dùng để loại lượt XEM ở
     * `0052`: bản mềm và hợp đồng là thứ người ta mở ra ĐỌC, mỗi hồ sơ vài lần
     * một buổi, nên những dòng ấy chỉ làm dày lịch sử và dìm mất thứ nó sinh ra
     * để kể — ai duyệt, ai trả về, vì sao.
     *
     * Kiểm CẢ BỐN đường trong một ca: tải và xem, bản mềm và hợp đồng. Tách ra
     * bốn ca thì mỗi ca dựng một hồ sơ mới và chạy thêm một lượt Gotenberg cho
     * cùng một khẳng định.
     */
    const d = await toReceivedL1();
    expect((await pdfOf(`/policies/${d.id}/render?mauId=${await mauHoSo()}`, 'sa01')).status).toBe(200);
    expect((await pdfOf(`/policies/${d.id}/render?mauId=${await mauHoSo()}`, 'sa01')).status).toBe(200);
    expect((await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).status).toBe(200);
    // `xem=1` là khoá thừa còn sót từ `0058`; `validate` bỏ qua khoá lạ. Nhưng
    // `mauId` thì KHÔNG thừa nữa (`0098`), nên nó phải đi kèm.
    expect(
      (await pdfOf(`/policies/${d.id}/contract.pdf?xem=1&mauId=${await mauHD()}`, 'sa01')).status,
    ).toBe(200);

    const rows = await lichSu(d.id);
    expect(dem(rows, 'TAI_HO_SO'), 'bản mềm không được ghi gì').toBe(0);
    expect(dem(rows, 'TAI_HOP_DONG'), 'hợp đồng không được ghi gì').toBe(0);
    // Và không ghi dưới một cái tên nào khác: lịch sử chỉ còn các bước duyệt.
    expect(rows.every((x) => !x.action.startsWith('TAI_'))).toBe(true);
  }, 150_000);

  it('XUẤT hợp đồng VẪN đóng dấu đã xuất — kể cả khi chỉ xem', async () => {
    /*
     * Con dấu KHÔNG đi theo dòng lịch sử, và đây là chỗ dễ gỡ nhầm nhất của lượt
     * này: cả hai từng nằm trong CÙNG một lời gọi sang `policy`.
     *
     * Chúng trả lời hai câu khác nhau. Dòng lịch sử nói *"ai đã lấy file ra"* —
     * câu khách hàng vừa bỏ. Con dấu nói *"hồ sơ này đã có hợp đồng chưa"* —
     * một trạng thái của hồ sơ mà muc 8.3 hỏi, và báo cáo tiến độ đọc.
     */
    const d = await toReceivedL1();
    expect(
      (await pdfOf(`/policies/${d.id}/contract.pdf?xem=1&mauId=${await mauHD()}`, 'kt01')).status,
    ).toBe(200);

    const p = await withAdminDb(async (c) => {
      const r = await c.query<{ contract_issued_at: Date | null; contract_issued_by: string | null }>(
        `SELECT contract_issued_at, contract_issued_by FROM pol.policy WHERE id = $1`,
        [d.id],
      );
      return r.rows[0]!;
    });
    expect(p.contract_issued_at).not.toBeNull();
    expect(p.contract_issued_by).not.toBeNull();
  }, 90_000);

  it('`0055` `format=html` đã gỡ — đường đó không còn tồn tại', async () => {
    /*
     * Ca này từng khẳng định bản HTML xem trước không ghi dòng tải nào. Từ
     * `0055` bản mềm sinh từ mẫu .docx, không còn bản HTML nào để trả về, và
     * tham số `format` bị loại ở tầng kiểm dữ liệu.
     *
     * Giữ ca lại thay vì xoá: một tham số đã gỡ mà máy chủ vẫn lặng lẽ nhận là
     * một đường cũ còn sống, và không ai biết nó trả về cái gì.
     */
    const d = await toReceivedL1();
    // `validate` bỏ qua khoá lạ chứ không từ chối, nên đường cũ vẫn trả 200 —
    // nhưng trả về PDF như mọi lượt xem khác, không còn HTML nào.
    const r = await pdfOf(`/policies/${d.id}/render?format=html&mauId=${await mauHoSo()}`, 'sa01');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(dem(await lichSu(d.id), 'TAI_HO_SO')).toBe(0);
  }, 90_000);

  it('năm lượt dựng bản mềm song song vẫn ra PDF — không còn `seq` để mà đụng', async () => {
    /*
     * Ca này từng là ca bắt được lỗi thật: `seq` cấp bằng
     * `coalesce(max(seq),0)+1` ngay trong câu INSERT chỉ thấy dòng ĐÃ COMMIT,
     * nên năm lượt tải song song đọc ra cùng một số và bốn lượt vỡ ở ràng buộc
     * UNIQUE — 500 cho một thao tác đọc thuần tuý.
     *
     * Bản mềm không ghi dòng nào nữa nên nó không còn chạm tới `seq`. Phép khoá
     * `FOR UPDATE` vẫn nguyên và vẫn được canh — ở `document.test.ts`, trên
     * đường TẢI BẢN SCAN, nơi lịch sử vẫn ghi.
     *
     * Giữ lại nửa còn giá trị: năm lượt dựng PDF song song không lượt nào hỏng.
     */
    const d = await toReceivedL1();
    const runs = await Promise.all(
      [0, 1, 2, 3, 4].map(async () => pdfOf(`/policies/${d.id}/render?mauId=${await mauHoSo()}`, 'sa01')),
    );
    for (const r of runs) expect(r.status).toBe(200);
    expect(dem(await lichSu(d.id), 'TAI_HO_SO')).toBe(0);
  }, 120_000);
});

// =============================================================================
// `0055` — Mẫu hồ sơ CSBH của Quản trị hệ thống (muc 6.4)
// =============================================================================

describe('`0055` mẫu hồ sơ CSBH', () => {
  const qget = async (path: string, who: string) =>
    (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`);
  /**
   * Mẫu HỒ SƠ đủ mục bắt buộc, lưu một lượt (`0067`).
   *
   * Ánh xạ suy từ tên ô trống như mọi chỗ khác; thân mẫu mặc định là "đủ 12 mục
   * + ô bảng sản phẩm", nên ca nào muốn kiểm đường HỎNG thì tự truyền thân khác.
   */
  const luuMauHoSo = async (name: string, buf?: Buffer) => {
    const than =
      buf ??
      makeDocx(
        [...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)), para('{{bang_san_pham}}')].join(''),
      );
    return (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', name)
      .field('mapping', JSON.stringify(anhXaTu(than)))
      .attach('file', than, { filename: 'ho-so.docx', contentType: DOCX });
  };

  const qpost = async (path: string, who: string, body: object = {}) =>
    (await http(doc)).post(path).set('Authorization', `Bearer ${tok[who]}`).send(body);

  /**
   * VÔ HIỆU MỌI mẫu hồ sơ, trả về hàm dựng lại (`0098`).
   *
   * `0058` vô hiệu rồi phát hành lại; `0067` đổi sang xoá; `0098` quay về vô
   * hiệu hoá — lần này không có đường lui nào khác, vì xoá đã gỡ hẳn.
   *
   * Hàm dựng lại TỰ TẢI một mẫu lên (`0150`). Trước đó nó gọi `ensureDefault`,
   * và điều ấy chỉ chạy được chừng nào hệ thống còn tự dựng mẫu hộ — `0150` bỏ
   * hẳn khái niệm ấy: không mẫu nào thì không xem trước được, chấm hết.
   *
   * Tên mang hậu tố ngẫu nhiên vì `0150` cấm trùng tên KỂ CẢ với mẫu đã vô hiệu,
   * và ca này vừa vô hiệu hoá cả bảng ngay phía trên.
   */
  const xoaHet = async () => {
    const ds = (await qget('/policy-templates', 'admin01')).body as { id: string }[];
    for (const t of ds) await donMau('/policy-templates', t.id, 'admin01');
    return async () => {
      const r = await luuMauHoSo(uniq('Mau dung lai'));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      /*
       * TRỎ LẠI `mauHoSoNho` sang bản vừa dựng.
       *
       * Lượt vô hiệu ở trên quét CẢ BẢNG, nên nó vô hiệu luôn mẫu mà `beforeAll`
       * dựng cho cả tệp. Không trỏ lại thì `mauHoSo()` còn trả id của một mẫu đã
       * vô hiệu, và ca chạy sau nhận lỗi ở chỗ chẳng liên quan gì tới nó — đúng
       * kiểu đỏ chỉ xuất hiện khi chạy cả tệp, không bao giờ khi chạy riêng.
       */
      mauHoSoNho = r.body.id as string;
    };
  };

  it('`0150` hệ thống KHÔNG tự dựng mẫu nào — không còn khái niệm mẫu mặc định', async () => {
    /*
     * Ca này ĐẢO NGƯỢC hẳn bản trước, thứ khẳng định *"hệ thống seed sẵn mỗi khổ
     * một mẫu, để chạy được từ phút đầu"*.
     *
     * Khách hàng chốt 28/08: hệ thống không bao giờ được tự tạo một văn bản mẫu.
     * Vô hiệu hoá mẫu cuối cùng của một khổ rồi khởi động lại thì bản cũ dựng
     * một mẫu Quản trị không hề tạo — và nó nằm ngay trong ô chọn của mọi TDV.
     *
     * Cái giá đã ghi ở migration `0108`: hệ thống vừa cài xong KHÔNG dùng được
     * cho tới khi có mẫu, và `./csbh nap-danh-muc` thành bước cài đặt bắt buộc.
     *
     * Quét MÃ NGUỒN chứ không quét CSDL: bảng lúc này đã đầy mẫu do các ca khác
     * tải lên, nên "không có mẫu nào" không đo được nữa. Thứ đo được, và là thứ
     * đáng canh, là không còn đường nào TỰ dựng mẫu.
     */
    const src = readFileSync('services/document/src/contracts/templates.service.ts', 'utf8');
    for (const ten of ['ensureDefault', 'ensureDefaultHoSo', 'ensureDefaultHopDong', 'vaFileMacDinh']) {
      expect(src, `${ten} phải gỡ hẳn`).not.toContain(`async ${ten}(`);
    }
    expect(
      readFileSync('services/document/src/app.module.ts', 'utf8'),
      'TemplateBootstrap còn được đăng ký thì nó vẫn chạy lúc khởi động',
    ).not.toContain('TemplateBootstrap');
  }, 30_000);

  it('chỉ QUẢN TRỊ vào được — Sale Admin và Kế toán đều 403', async () => {
    // Mẫu hồ sơ là cấu hình hệ thống (muc 6.4); mẫu hợp đồng mới là văn bản
    // nghiệp vụ của Sale Admin (muc 8.2). Hai màn hình, hai chủ.
    for (const who of ['sa01', 'kt01', 'tdv01']) {
      expect((await qget('/policy-templates', who)).status, who).toBe(403);
    }
  }, 90_000);

  it('`0060` Quản trị đụng được vào CẢ HAI loại mẫu, Sale Admin thì không loại nào', async () => {
    // Đảo chiều so với `0055`: khi ấy hai loại mẫu là của hai người, và ca này
    // canh đúng bức tường giữa họ. Giờ tường ấy không còn — nhưng bức tường với
    // các vai trò KHÁC thì vẫn phải còn, nên ca này canh đúng chỗ mới.
    expect((await qget('/contract-templates', 'admin01')).status).toBe(200);
    expect((await qget('/policy-templates', 'admin01')).status).toBe(200);
    expect((await qget('/contract-templates', 'sa01')).status).toBe(403);
    expect((await qget('/policy-templates', 'sa01')).status).toBe(403);
  }, 90_000);

  it('danh sách hai loại mẫu KHÔNG lẫn vào nhau', async () => {
    const hoSo = (await qget('/policy-templates', 'admin01')).body as { kind: string }[];
    const hopDong = (await qget('/contract-templates', 'admin01')).body as { kind: string }[];
    expect(hoSo.every((t) => t.kind === 'HO_SO')).toBe(true);
    expect(hopDong.every((t) => t.kind === 'HOP_DONG')).toBe(true);
  }, 90_000);

  it('`0163` VÔ HIỆU HẾT MẪU thì KHÔNG hồ sơ nào in được — kể cả hồ sơ đã duyệt', async () => {
    /*
     * Ca này đảo chiều LẦN THỨ HAI, và hai lần đảo kể đúng lịch sử của khái niệm
     * "mẫu đóng băng".
     *
     * `0097`: mọi người xem đều chọn mẫu, nên danh sách rỗng làm hỏng mọi lượt
     *         xem — kể cả hồ sơ duyệt xong từ năm ngoái.
     * `0098`: mẫu đóng băng vào hồ sơ, nên danh sách rỗng KHÔNG chạm tới hồ sơ
     *         đã gửi duyệt. Đó là cả lý do để bỏ đường xoá mẫu.
     * `0163`: bỏ đóng băng. Bản mềm dựng lại mỗi lần in, nên nó lại phụ thuộc
     *         hoàn toàn vào danh mục mẫu HÔM NAY.
     *
     * Cái mất phải ghi rõ: **hồ sơ đã ký in lại hôm nay có thể ra một tờ giấy
     * khác** hôm nó được ký, và nếu Quản trị vô hiệu hết mẫu thì không in được
     * nữa. Khách hàng chấp nhận — tờ giấy có giá trị pháp lý là BẢN CỨNG đã ký
     * và đã scan, không phải bản mềm dựng lại.
     */
    const d = await toReceivedL1();
    const mau = await mauHoSo();

    const khoiPhuc = await xoaHet();
    try {
      const r = await dget(`/policies/${d.id}/render?mauId=${mau}`, 'sa01');
      expect(r.status, 'mẫu đã vô hiệu thì không dựng được nữa').toBe(404);
    } finally {
      await khoiPhuc();
    }
  }, 120_000);

  it('THÊM mẫu hồ sơ KHÔNG đụng gì tới mẫu hợp đồng', async () => {
    /*
     * Index "đang dùng" cũ cho đúng MỘT mẫu trong toàn bảng. Giữ nguyên thì
     * thêm một mẫu hồ sơ là kế toán mất khả năng xuất hợp đồng ngay lúc ấy —
     * một hệ quả không có đường nào đoán ra. Hai loại mẫu dùng chung một bảng,
     * nên ranh giới giữa chúng phải có ca canh giữ chứ không nằm trong đầu ai.
     */
    const d = await toReceivedL1();
    const truoc = await templates.khaDung('HOP_DONG');

    const up = await luuMauHoSo('Mẫu hồ sơ thêm giữa chừng');
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    try {
      expect(await templates.khaDung('HOP_DONG')).toEqual(truoc);
      expect((await pdfOf(`/policies/${d.id}/contract.pdf?mauId=${await mauHD()}`, 'kt01')).status).toBe(200);
    } finally {
      await donMau('/policy-templates', up.body.id, 'admin01');
    }
  }, 120_000);

  it('`0067` mẫu THIẾU MỤC BẮT BUỘC thì không LƯU được', async () => {
    /*
     * Muc 6.4 để ngỏ đúng câu hỏi này: *"nếu mẫu do người dùng soạn, hệ thống
     * không còn bảo đảm được 13 mục kia có mặt"*. Phép kiểm là câu trả lời, và
     * `0067` dời nó sớm thêm một bước: từ lúc PHÁT HÀNH sang lúc LƯU.
     *
     * Sớm hơn thì tốt hơn ở đúng một chỗ có thật: người soạn đang mở file Word
     * ra, chưa đóng, và sửa thêm một ô trống là xong. Báo ở bước sau nghĩa là họ
     * đã coi như xong việc rồi mới bị gọi lại.
     */
    const r = await luuMauHoSo('Mau thieu muc', makeDocx(para('{{ho_so.ten_khach_hang}}')));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('TEMPLATE_MISSING_REQUIRED');
    // Nói RÕ thiếu gì, không chỉ nói "thiếu": Quản trị phải sửa được ngay.
    expect(r.body.thieuTruong).toContain('ho_so.ma_ho_so');
    expect(r.body.thieuBangSanPham).toBe('{{bang_san_pham}}');
  }, 120_000);

  it('`0102` mẫu KHÔNG có *trạng thái* và *thời gian duyệt* vẫn LƯU được', async () => {
    /*
     * Chốt 24/08: hai mục ấy thôi bắt buộc. Lý do không phải "cho dễ" mà là
     * chúng CÒN ĐANG ĐỔI — bản mềm dựng lúc TBP ký in ra `Chờ kế toán duyệt lần
     * 1` và một ô *thời gian duyệt* rỗng, nên ép có mặt là ép in một câu sai ở
     * mọi hồ sơ chưa tới B10.
     *
     * Thân mẫu dựng từ danh sách ép rồi **TRỪ ĐI hai ô** — chứ không gõ tay mười
     * ô, và cũng không lấy nguyên danh sách. Cả hai cách kia đều làm ca này im
     * lặng lúc quan trọng nhất:
     *
     *   - Gõ tay mười ô: thêm một mục bắt buộc về sau thì ca vẫn xanh, mà cái
     *     xanh ấy không còn kiểm chuyện gì.
     *   - Lấy nguyên danh sách: đưa hai ô trở lại danh sách ép thì thân mẫu cũng
     *     có lại chúng, máy chủ vẫn nhận 201, và ca vẫn xanh — đỏ ở dòng tự kiểm
     *     chứ không đỏ ở MÁY CHỦ, tức đỏ sai tầng.
     *
     * Trừ đi rồi thì đưa hai ô trở lại danh sách ép là mẫu này thiếu hai mục bắt
     * buộc, và máy chủ trả 409 — đúng tầng đặt luật.
     */
    const BO_EP = ['ho_so.trang_thai', 'ho_so.ngay_kt_nhan_l2'];
    const than = makeDocx(
      [
        ...NGUON_BAT_BUOC_HO_SO.filter((n) => !BO_EP.includes(n)).map((n) => para(`{{${n}}}`)),
        para('{{bang_san_pham}}'),
      ].join(''),
    );
    const o = placeholdersOf(than);
    for (const n of BO_EP) expect(o).not.toContain(`{{${n}}}`);

    const r = await luuMauHoSo('Mau khong trang thai, khong ngay duyet', than);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await donMau('/policy-templates', r.body.id, 'admin01');
  }, 120_000);

  it('ô bảng sản phẩm KHÔNG cần ánh xạ — nó không trỏ tới trường nào', async () => {
    // Mẫu hồ sơ đầy đủ lưu được dù `{{bang_san_pham}}` không có dòng ánh xạ nào:
    // nó không trỏ tới trường dữ liệu, hệ thống thay nó bằng cả một bảng.
    const r = await luuMauHoSo('Mẫu đủ mục, không ánh xạ ô bảng');
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await donMau('/policy-templates', r.body.id, 'admin01');
  }, 90_000);

  it('bản mềm dựng từ MẪU: thêm mẫu khác thì bản mềm đổi theo', async () => {
    const CAU = 'Dieu khoan rieng cua Nutricare';
    const than = makeDocx(
      [
        ...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)),
        para(CAU),
        para('{{bang_san_pham}}'),
      ].join(''),
    );
    const up = await luuMauHoSo('Mau moi cua quan tri', than);
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    /*
     * `0163`: mẫu KHÔNG đóng băng nữa, nên hồ sơ đi luồng bằng gì cũng được —
     * cái quyết định bản mềm là `mauId` của chính lượt in.
     */
    const d = await toReceivedL1();

    try {
      const pdf = await pdfOf(`/policies/${d.id}/render?mauId=${up.body.id}`, 'sa01');
      expect(pdf.status).toBe(200);
      const t = await pdfText(pdf.body as Buffer);
      // Câu chỉ có trong mẫu MỚI — chứng minh bản mềm đọc từ mẫu, không dựng cứng.
      expect(t.replace(/\s+/g, '')).toContain(CAU.replace(/\s+/g, ''));
      // Và bảng sản phẩm vẫn do hệ thống dựng, đủ cột.
      expect(t.replace(/\s+/g, '')).toContain('Giácôngty');
    } finally {
      await donMau('/policy-templates', up.body.id, 'admin01');
    }
  }, 180_000);

  it('`0067` CHỌN CỘT theo từng mẫu — bảng in ra đúng tập cột đã khai', async () => {
    /*
     * Phương án A, chốt 20/08: tập cột là thuộc tính của BẢN TRÌNH BÀY, nên nó
     * lưu theo từng mẫu. Quản trị soạn được "bản đầy đủ cho nội bộ" và "bản gọn
     * đưa khách hàng" mà không cần ai lập trình.
     *
     * Kiểm CẢ HAI CHIỀU trên cùng một hồ sơ: cột đã chọn thì có mặt, cột không
     * chọn thì KHÔNG — chiều thứ hai mới dễ hỏng, vì một phép lọc viết sai
     * thường bỏ sót theo hướng "hiện tất".
     */
    const than = makeDocx(
      [...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)), para('{{bang_san_pham}}')].join(''),
    );
    const up = await (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', 'Ban gon dua khach hang')
      .field('mapping', JSON.stringify(anhXaTu(than)))
      .field('cotBang', JSON.stringify(['stt', 'ten_san_pham', 'cpbh_tong', 'gia_thu_ve']))
      .attach('file', than, { filename: 'gon.docx', contentType: DOCX });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const d = await toReceivedL1();

    try {
      const chu = packed(
        await pdfText((await pdfOf(`/policies/${d.id}/render?mauId=${up.body.id}`, 'sa01')).body as Buffer),
      );
      for (const co of ['STT', 'Tênsảnphẩm', 'CPBHtổng', 'Giáthuvề']) {
        expect(chu, `thiếu cột ${co}`).toContain(co);
      }
      for (const khong of ['Mãsảnphẩm', 'Giácôngty', 'Giábánbuôn', 'TỷlệCK', 'Ghichú']) {
        expect(chu, `cột ${khong} KHÔNG được in ra`).not.toContain(khong);
      }
    } finally {
      await donMau('/policy-templates', up.body.id, 'admin01');
    }
  }, 180_000);

  it('`0067` cột BẮT BUỘC không tắt được — khai thiếu thì hệ thống thêm lại', async () => {
    /*
     * Một bảng giá không nói mình đang nói về mặt hàng nào thì không còn là bảng
     * giá, nên *Tên sản phẩm* ở lại cùng muc 11.1. Hệ thống THÊM LẠI thay vì báo
     * lỗi: người dùng không làm gì sai, họ chỉ không biết luật.
     *
     * `0084` — và giờ nó là cột DUY NHẤT như vậy; CPBH tổng không còn được thêm
     * lại nữa. Ca ngay dưới kiểm nửa kia của chuyện đó.
     */
    const than = makeDocx(
      [...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)), para('{{bang_san_pham}}')].join(''),
    );
    const up = await (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', 'Chi mot cot')
      .field('mapping', JSON.stringify(anhXaTu(than)))
      .field('cotBang', JSON.stringify(['stt']))
      .attach('file', than, { filename: 'motcot.docx', contentType: DOCX });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.cotBang).toEqual(['stt', 'ten_san_pham']);
    const d = await toReceivedL1();

    try {
      const chu = packed(
        await pdfText((await pdfOf(`/policies/${d.id}/render?mauId=${up.body.id}`, 'sa01')).body as Buffer),
      );
      expect(chu).toContain('Tênsảnphẩm');
    } finally {
      await donMau('/policy-templates', up.body.id, 'admin01');
    }
  }, 180_000);

  it('`0084` TẮT ĐƯỢC cả hai cột CPBH — bản đưa khách hàng không lộ chi phí nội bộ', async () => {
    /*
     * Khách hàng chốt 21/08: CPBH tổng rời khỏi tập cột bắt buộc. Lý do là chính
     * cái mà tập cột theo mẫu được đẻ ra để làm — soạn *"bản gọn đưa khách
     * hàng"* — mà CPBH là chi phí NỘI BỘ.
     *
     * Ca này kiểm chiều KHÓ HỎNG THẦM: không phải "lưu được", mà là **bản in ra
     * thật sự không còn chữ CPBH nào**. Một phép "thêm lại cột bắt buộc" viết
     * sót sẽ vẫn cho lưu đúng tập cột đã khai rồi lặng lẽ in ra cột đã tắt, và
     * cái lộ ra là con số chi phí trên một văn bản đã gửi cho khách hàng.
     */
    const than = makeDocx(
      [...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)), para('{{bang_san_pham}}')].join(''),
    );
    const up = await (await http(doc))
      .post('/policy-templates')
      .set('Authorization', `Bearer ${tok['admin01']}`)
      .field('name', 'Ban dua khach hang')
      .field('mapping', JSON.stringify(anhXaTu(than)))
      .field('cotBang', JSON.stringify(['stt', 'ten_san_pham', 'gia_ban_buon']))
      .attach('file', than, { filename: 'khongcpbh.docx', contentType: DOCX });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.cotBang, 'CPBH tổng bị thêm lại').toEqual(['stt', 'ten_san_pham', 'gia_ban_buon']);
    const d = await toReceivedL1();

    try {
      const chu = packed(
        await pdfText((await pdfOf(`/policies/${d.id}/render?mauId=${up.body.id}`, 'sa01')).body as Buffer),
      );
      expect(chu).toContain('Tênsảnphẩm');
      expect(chu, 'CPBH tổng vẫn in ra dù đã tắt').not.toContain('CPBHtổng');
      // Cả cột lẻ cũng phải vắng: hai lựa chọn tách nhau, và tắt một mà lộ cái
      // kia thì con số chi phí vẫn nằm trên giấy.
      expect(chu, 'cột CPBH lẻ vẫn in ra').not.toContain('CPBH1');
    } finally {
      await donMau('/policy-templates', up.body.id, 'admin01');
    }
  }, 180_000);
});

// =============================================================================
// `0057` — bộ mẫu hồ sơ trong `templates/`
// =============================================================================

describe('`0057` bộ file mẫu trong templates/', () => {
  const HO_SO = [
    'mau-ho-so-a4-doc.docx',
    'mau-ho-so-a4-ngang.docx',
    'mau-ho-so-a4-doc-rut-gon.docx',
  ];
  const HOP_DONG = 'mau-hop-dong-a4-doc.docx';
  const BO = [...HO_SO, HOP_DONG];

  it('cả ba file có mặt và là .docx thật', () => {
    /*
     * File .docx là một file zip — bốn byte đầu là `PK\x03\x04`. Kiểm ở đây vì
     * chúng là BINARY trong git: một lượt commit hỏng, hay một trình soạn thảo
     * lỡ mở ra rồi lưu lại dạng text, đều biến chúng thành file mà máy chủ từ
     * chối ở bước tải lên — và triệu chứng chỉ hiện ra lúc ai đó chạy
     * `make demo-mau`.
     */
    for (const f of BO) {
      const buf = readFileSync(`templates/${f}`);
      expect(buf.length, `${f} rỗng`).toBeGreaterThan(500);
      expect([...buf.subarray(0, 4)], `${f} không phải zip`).toEqual([0x50, 0x4b, 0x03, 0x04]);
    }
  });

  it('mọi ô trống đều là trường máy chủ NHẬN', () => {
    for (const f of BO) {
      const o = placeholdersOf(readFileSync(`templates/${f}`));
      expect(o, `${f} thiếu ô bảng sản phẩm`).toContain('{{bang_san_pham}}');
      // Mọi ô trống phải là một trường máy chủ NHẬN — trừ ô bảng, vốn không trỏ
      // tới trường nào. Một ô lạ trong file mẫu là một mẫu không ban hành được.
      for (const x of o) {
        if (x === '{{bang_san_pham}}') continue;
        expect(KNOWN_SOURCES, `${f} có ô lạ ${x}`).toContain(x.slice(2, -2));
      }
    }
  });

  /**
   * `0134` — MẪU `nap-danh-muc` NẠP PHẢI IN ĐƯỢC MỌI TRƯỜNG CHẶN GỬI DUYỆT.
   *
   * Lỗ hổng có thật, và `0128` mở ra nó: thêm *số điện thoại khách hàng*, xếp nó
   * vào nhóm `chan-moi` (rỗng thì không gửi duyệt được), thêm khoá vào bảng ánh
   * xạ — nhưng **không mẫu nào kèm theo phần mềm in con số ấy**. Bản chạy thử
   * bắt mọi người điền một trường không xuất hiện trên bất kỳ tờ giấy nào.
   *
   * Không ca kiểm nào bắt được, vì hai vế nằm ở hai thế giới khác nhau: một bên
   * là bảng phân loại trong TypeScript, một bên là bốn file `.docx` nhị phân.
   *
   * Danh sách file ĐỌC TỪ CHÍNH `nap-danh-muc.ts` chứ không chép sang: chép là
   * dựng bản sao thứ hai, và ngày bộ nạp đổi danh sách thì ca này canh những
   * file chẳng ai nạp.
   */
  it('`0134` mẫu bộ nạp dùng in đủ MỌI trường chặn gửi duyệt', () => {
    const nguon = readFileSync('scripts/nap-danh-muc.ts', 'utf8');
    const tepNap = [...nguon.matchAll(/tep:\s*'([^']+\.docx)'/g)].map((m) => m[1]!);
    expect(tepNap.length, 'không đọc được danh sách mẫu của nap-danh-muc').toBe(3);

    const chanMoi = Object.entries(NHOM_TRUONG)
      .filter(([, nhom]) => nhom === 'chan-moi')
      .map(([khoa]) => khoa);
    expect(chanMoi.length, 'nhóm chan-moi rỗng — bảng phân loại hỏng').toBeGreaterThan(0);

    const thieu: string[] = [];
    for (const tep of tepNap) {
      const o = new Set(placeholdersOf(readFileSync(`templates/${tep}`)));
      for (const n of chanMoi) if (!o.has(`{{${n}}}`)) thieu.push(`${tep} thiếu {{${n}}}`);
    }
    expect(thieu, thieu.join('\n')).toEqual([]);
  });

  it('mẫu RÚT GỌN có đủ mục bắt buộc — nếu không thì không lưu được', () => {
    /*
     * Mẫu rút gọn tồn tại để trả lời câu "ít nhất phải có những gì". Nó mà thiếu
     * một mục thì chính nó là câu trả lời SAI, và người soạn theo nó bị chặn ở
     * bước lưu.
     */
    const o = new Set(placeholdersOf(readFileSync('templates/mau-ho-so-a4-doc-rut-gon.docx')));
    // MƯỜI HAI từ `0067` (mục *thông tin công ty* rời cùng nhóm khoá `cong_ty.`),
    // MƯỜI từ `0102` — *trạng thái* và *thời gian duyệt* thôi bị ép.
    expect(NGUON_BAT_BUOC_HO_SO.length, 'phải có đúng 10 mục').toBe(10);
    for (const n of NGUON_BAT_BUOC_HO_SO) {
      expect(o.has(`{{${n}}}`), `mẫu rút gọn thiếu {{${n}}}`).toBe(true);
    }
  });

  it('`0102` *trạng thái* và *thời gian duyệt* thôi bắt buộc, nhưng vẫn ĐẶT được', () => {
    /*
     * Hai chiều của cùng một quyết định, kiểm ở tầng danh sách vì đây là chỗ duy
     * nhất phát biểu nó:
     *
     *   - KHÔNG còn trong danh sách ép → mẫu thiếu chúng vẫn lưu được (ca HTTP
     *     bên dưới đi đường thật).
     *   - VẪN trong `KNOWN_SOURCES` → mẫu nào muốn in vẫn đặt ô được, và ba mẫu
     *     kèm theo phần mềm vẫn in.
     *
     * Chiều thứ hai mới dễ mất: gỡ một trường khỏi danh sách ép và gỡ luôn khỏi
     * `SCALAR` là hai việc chỉ cách nhau vài dòng, mà hệ quả thì trái ngược —
     * cái sau biến mọi mẫu đang có sẵn ô ấy thành mẫu KHÔNG LƯU LẠI ĐƯỢC.
     */
    for (const n of ['ho_so.trang_thai', 'ho_so.ngay_kt_nhan_l2', 'ho_so.ngay_kt_nhan_l1']) {
      expect(NGUON_BAT_BUOC_HO_SO, `${n} không được ép nữa`).not.toContain(n);
      expect(KNOWN_SOURCES, `${n} vẫn phải đặt ô được`).toContain(n);
    }
    // Ba mẫu hồ sơ kèm phần mềm VẪN in — bỏ ép không phải bỏ hiển thị, và giữ
    // chúng lại là cách duy nhất chứng minh hai trường ấy còn dựng được thật.
    for (const f of HO_SO) {
      const o = new Set(placeholdersOf(readFileSync(`templates/${f}`)));
      expect(o.has('{{ho_so.trang_thai}}'), `${f} nên vẫn in trạng thái`).toBe(true);
      expect(o.has('{{ho_so.ngay_kt_nhan_l2}}'), `${f} nên vẫn in ngày duyệt`).toBe(true);
    }
  });

  it('`0067` MỌI mẫu đều dùng ô bảng của hệ thống — kể cả mẫu hợp đồng', () => {
    /*
     * `0058` cho mẫu hợp đồng một bảng VẼ TAY với nhóm khoá `{{san_pham.*}}`, vì
     * nó chỉ cần bốn cột cố định. `0067` đảo lại: cả hai loại đặt
     * `{{bang_san_pham}}`, vì bảng do hệ thống dựng cho phép CHỌN CỘT theo từng
     * mẫu — một bảng vẽ tay thì tập cột nằm cứng trong file.
     *
     * Ca này canh cả hai chiều: mọi mẫu phải có ô bảng, và KHÔNG mẫu nào được
     * còn sót khoá `{{san_pham.*}}` — cơ chế nhân bản dòng đã gỡ, nên một khoá
     * sót lại sẽ in nguyên chuỗi `{{...}}` ra giấy mà không báo gì.
     */
    for (const f of BO) {
      const o = placeholdersOf(readFileSync(`templates/${f}`));
      expect(o, `${f} thiếu ô bảng sản phẩm`).toContain('{{bang_san_pham}}');
      expect(o.filter((x) => x.startsWith('{{san_pham.')), `${f} còn sót khoá dòng`).toEqual([]);
      expect(o.filter((x) => x.startsWith('{{cong_ty.')), `${f} còn sót khoá công ty`).toEqual([]);
    }
  });

  it('`0067` mọi file trong templates/ LƯU ĐƯỢC qua đúng đường người dùng đi', async () => {
    /*
     * Phép thử cuối cùng của một file mẫu là chính đường người dùng đi: đọc ô
     * trống, ánh xạ theo tên ô, bấm Lưu. Một khoá gõ sai trong file chỉ lộ ra ở
     * bước này — `placeholdersOf` đọc nó ra bình thường, chỉ có máy chủ mới nói
     * được "không có trường nguồn ấy".
     *
     * Chạy cho CẢ BỐN file, kể cả mẫu hợp đồng mà `make demo-mau` không nạp:
     * một file bàn giao mà không lưu nổi thì nó là rác, dù không ai nạp tự động.
     */
    for (const f of BO) {
      const buf = readFileSync(`templates/${f}`);
      const duong = f.includes('hop-dong') ? '/contract-templates' : '/policy-templates';
      const up = await (await http(doc))
        .post(duong)
        .set('Authorization', `Bearer ${tok['admin01']}`)
        .field('name', `Kiểm ${f}`)
        .field('mapping', JSON.stringify(anhXaTu(buf)))
        .attach('file', buf, { filename: f, contentType: DOCX });
      expect(up.status, `${f}: ${JSON.stringify(up.body)}`).toBe(201);
      expect((await donMau(duong, up.body.id)).status).toBe(200);
    }
  }, 120_000);

  it('mẫu A4 ngang thật sự khai khổ NGANG trong file', () => {
    // `w:orient` không đủ một mình — LibreOffice vẫn lấy kích thước từ w:w/w:h.
    // Cả hai phải cùng nói một chuyện, nên kiểm cả nhãn lẫn con số.
    const ngang = documentXml(readFileSync('templates/mau-ho-so-a4-ngang.docx'));
    const doc = documentXml(readFileSync('templates/mau-ho-so-a4-doc.docx'));
    expect(ngang).toContain('w:orient="landscape"');
    expect(ngang).toContain('w:w="16838"');
    expect(doc).not.toContain('w:orient="landscape"');
    expect(doc).toContain('w:w="11906"');
  });
});

// =============================================================================
// `0058` — chọn MẪU thay cho chọn khổ giấy
// =============================================================================

describe('`0058` danh sách mẫu đang dùng, cho ô chọn', () => {
  it('mở cho ĐÚNG những vai trò xem được văn bản, không hơn', async () => {
    /*
     * Đây là một đường đọc MỞ RỘNG: `/contract-templates` còn lại chỉ Sale Admin
     * vào được, riêng `available` thì kế toán cũng phải thấy — chính họ bấm xuất
     * hợp đồng nên chính họ chọn mẫu. Thấy danh sách ≠ sửa được mẫu, và ranh
     * giới ấy phải có ca canh giữ chứ không nằm trong đầu người viết.
     */
    expect((await dget('/contract-templates/available', 'kt01')).status).toBe(200);
    expect((await dget('/contract-templates/available', 'sa01')).status).toBe(200);
    for (const u of ['tdv01', 'tbp01', 'bld01', 'admin01']) {
      expect((await dget('/contract-templates/available', u)).status, u).toBe(403);
    }

    /*
     * Mẫu HỒ SƠ thu về ĐÚNG Sale Admin ở `0163`, khớp `READERS` của render.
     *
     * Tới `0162` là năm vai trò, vì khi ấy TDV chọn mẫu lúc gửi duyệt và bốn vai
     * trò kia mở được bản mềm. Cả hai vế đã bỏ. Bất biến giữ nguyên hình dạng —
     * *ai dựng được bản mềm thì thấy được danh sách mẫu* — chỉ tập hợp co lại.
     *
     * Quản trị vẫn KHÔNG thấy, dù họ quản lý chính những mẫu ấy: họ không xem hồ
     * sơ, và đây là ô chọn của một màn hình hồ sơ.
     */
    expect((await dget('/policy-templates/available', 'sa01')).status).toBe(200);
    for (const u of ['tdv01', 'tbp01', 'kt01', 'bld01', 'admin01']) {
      expect((await dget('/policy-templates/available', u)).status, u).toBe(403);
    }
  }, 60_000);

  it('trả về ĐÚNG ba trường, không rò cột nội bộ nào của mẫu', async () => {
    const r = await dget('/policy-templates/available', 'sa01');
    expect(r.status).toBe(200);
    expect((r.body as unknown[]).length).toBeGreaterThan(0);
    for (const m of r.body as Record<string, unknown>[]) {
      expect(Object.keys(m).sort()).toEqual(['id', 'khoGiay', 'ten']);
    }
  }, 30_000);

  it('`0067` mẫu vừa lưu VÀO NGAY ô chọn — không còn trạng thái nháp', async () => {
    /*
     * `0058` khẳng định điều NGƯỢC LẠI: mẫu nháp không lọt vào ô chọn, vì nháp
     * nghĩa là chưa qua phép kiểm nào.
     *
     * `0067` bỏ trạng thái nháp bằng cách chuyển mọi phép kiểm về lúc LƯU: lưu
     * được nghĩa là đã ánh xạ đủ và đã qua mục bắt buộc, nên không còn lý do gì
     * để nằm ngoài danh sách. Một mẫu tồn tại mà không dùng được là một trạng
     * thái không màn hình nào giải thích nổi.
     */
    const t = await uploadTemplate('admin01', makeDocx(para('Mẫu không có ô trống nào')), 'Mẫu trơn');
    try {
      const ds = await dget('/contract-templates/available', 'sa01');
      // `0067` ĐẢO CHIỀU: lưu được là dùng được, không còn trạng thái nháp nào
      // để mà nằm ngoài danh sách.
      expect((ds.body as { id: string }[]).some((m) => m.id === t.body.id)).toBe(true);
    } finally {
      await donMau('/contract-templates', t.body.id, 'admin01');
    }
  }, 60_000);

  it('THÊM mẫu thứ hai KHÔNG đẩy mẫu thứ nhất đi — cả hai cùng ở trong ô chọn', async () => {
    /*
     * Đây là điểm đảo chiều của `0058`, và nó phải được canh ở tầng HTTP chứ
     * không chỉ ở tầng CSDL: bỏ hai partial unique index mà quên bỏ câu UPDATE
     * hạ mẫu cũ trong `publish()` thì lược đồ cho phép hai mẫu, còn phần mềm vẫn
     * lặng lẽ gỡ mẫu cũ — và triệu chứng là ô chọn mãi mãi chỉ có một dòng.
     */
    const truoc = (await dget('/contract-templates/available', 'sa01')).body as { id: string }[];
    expect(truoc.length).toBeGreaterThan(0);

    const t = await uploadTemplate('admin01', makeDocx(para('Bản thứ hai — {{ho_so.ma_ho_so}}')), 'Mẫu thứ hai');
    expect(t.status, JSON.stringify(t.body)).toBe(201);

    try {
      const sau = (await dget('/contract-templates/available', 'sa01')).body as { id: string }[];
      for (const m of truoc) {
        expect(sau.some((x) => x.id === m.id), `mẫu ${m.id} bị hạ xuống oan`).toBe(true);
      }
      expect(sau.some((x) => x.id === t.body.id)).toBe(true);
      // Mẫu vừa thêm đứng ĐẦU: nó là bản mở sẵn cho lần xem sau.
      expect(sau[0]!.id).toBe(t.body.id);
    } finally {
      await donMau('/contract-templates', t.body.id, 'admin01');
    }
  }, 90_000);

  it('khổ giấy ĐỌC TỪ FILE, không phải từ lời khai của người tải lên', async () => {
    // Tải hai file cùng một lượt gọi, cùng một tham số — chỉ khác nội dung .docx.
    // Nhãn khổ giấy phải theo file, vì không còn ô nào để khai.
    const ngang = await uploadTemplate('admin01', makeDocx(para('nằm ngang'), 'a4l'), 'Tự khai gì cũng thế');
    const doc_ = await uploadTemplate('admin01', makeDocx(para('đứng dọc'), 'a4p'), 'Bản dọc');
    try {
      expect(ngang.body.paperSize).toBe('a4l');
      expect(doc_.body.paperSize).toBe('a4p');
    } finally {
      // Dọn: từ `0067` mẫu nào cũng dùng được và lời gọi không kèm `mauId` lấy
      // mẫu MỚI NHẤT, nên một mẫu bỏ quên ở đây sẽ thành mẫu mặc định của mọi
      // ca phía sau — và của cả lượt chạy sau nữa.
      await donMau('/contract-templates', ngang.body.id, 'admin01');
      await donMau('/contract-templates', doc_.body.id, 'admin01');
    }
  }, 60_000);
});

// =============================================================================
// `0098` — Mẫu hồ sơ đóng băng vào hồ sơ lúc gửi duyệt
// =============================================================================

describe('`0163` bản mềm KHÔNG còn đóng băng theo hồ sơ', () => {
  /*
   * Cả khối `0098` cũ đã đi cùng cơ chế đóng băng: "gửi duyệt thiếu mẫu thì
   * chặn", "cột `mauHoSoId` mang đúng mẫu vừa chọn", "truyền mẫu khác thì 409
   * TEMPLATE_LOCKED", "vô hiệu mẫu đã gắn thì hồ sơ vẫn xem được".
   *
   * Khách hàng chốt 29/08 rằng bản mềm không phải văn bản đi qua luồng duyệt —
   * nó là thao tác IN của Sale Admin ở bước B8. Bốn câu trên hết nghĩa cùng lúc.
   *
   * Bốn ca dưới đây khẳng định thế giới MỚI, và mỗi ca canh một cách quay lại
   * khác nhau.
   */
  it('GỬI DUYỆT không cần mẫu — hệ thống không có mẫu nào vẫn gửi được', async () => {
    /*
     * Đảo ngược `0098` và một nửa `0150`. Chặng ấy ghi *"không có mẫu thì không
     * hồ sơ nào gửi duyệt được"*, và câu ấy đúng cho tới hôm nay. Thiếu mẫu giờ
     * chỉ chặn đúng thao tác in của Sale Admin.
     */
    const d = await draft();
    const r = await act(d.id, 'SUBMIT', 'tdv01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await pget(`/policies/${d.id}`, 'tdv01')).body.status).toBe('CHO_TBP_DUYET');
  });

  it('hồ sơ KHÔNG mang trường `mauHoSoId` nào nữa', async () => {
    // Cột đã gỡ khỏi lược đồ (`0111`). Ca này canh chiều còn lại: DTO thôi khai
    // nó, nên một màn hình viết sau này không đọc được một giá trị luôn rỗng.
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await pget(`/policies/${d.id}`, 'tdv01')).body).not.toHaveProperty('mauHoSoId');
  });

  it('CÙNG một hồ sơ, hai mẫu khác nhau cho ra hai bản mềm khác nhau', async () => {
    /*
     * Đây là cả nội dung của yêu cầu: Sale Admin chọn mẫu ở MỖI lượt in, và
     * không có gì khoá họ vào một bản trình bày. Trước `0163` lượt thứ hai trả
     * `409 TEMPLATE_LOCKED`.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');

    // Mẫu thứ hai dựng tại chỗ: cả điểm của ca này là HAI mẫu khác nhau trên
    // CÙNG một hồ sơ, nên không dùng lại được mẫu dùng chung của tệp.
    const mau2 = await luuMauHoSoTen(uniq('Mau ho so thu hai'));
    expect(mau2.status, JSON.stringify(mau2.body)).toBe(201);

    const a = await pdfOf(`/policies/${d.id}/render?mauId=${await mauHoSo()}`, 'sa01');
    const b = await pdfOf(`/policies/${d.id}/render?mauId=${mau2.body.id}`, 'sa01');
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(Buffer.compare(a.body as Buffer, b.body as Buffer), 'hai mẫu phải ra hai bản').not.toBe(0);
  });

  it('CHỈ Sale Admin dựng được — bốn vai trò kia nhận 403', async () => {
    /*
     * Chặn ở MÁY CHỦ, không chỉ ẩn nút. Kể cả Ban lãnh đạo — hỏi lại và khách
     * hàng chốt đúng chữ *"chỉ giữ ở SA"*, dù đó là nút duy nhất của vai trò
     * chỉ-đọc trên trang hồ sơ.
     */
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RECEIVE_L1', 'kt01');
    const duong = `/policies/${d.id}/render?mauId=${await mauHoSo()}`;

    expect((await pdfOf(duong, 'sa01')).status, 'sa01').toBe(200);
    for (const ai of ['tdv01', 'tbp01', 'kt01', 'bld01']) {
      expect((await pdfOf(duong, ai)).status, ai).toBe(403);
    }
  });
});

type AnhChup = {
  kh_ma_snap: string | null;
  kh_ten_snap: string | null;
  kh_dia_chi_dang_ky_snap: string | null;
  kh_cong_no_snap: string | null;
  nguoi_de_nghi_snap: string | null;
  tbp_ky_ten_snap: string | null;
  tbp_signed_at: Date | null;
  tbp_signed_by: string | null;
};

const anhChup = (id: string): Promise<AnhChup> =>
  withAdminDb(async (c) => {
    const r = await c.query<AnhChup>(
      `SELECT kh_ma_snap, kh_ten_snap, kh_dia_chi_dang_ky_snap,
              kh_cong_no_snap::text AS kh_cong_no_snap,
              nguoi_de_nghi_snap, tbp_ky_ten_snap, tbp_signed_at, tbp_signed_by
         FROM pol.policy WHERE id = $1`,
      [id],
    );
    return r.rows[0]!;
  });

/** Sửa khách hàng — đúng đường mà TDV dùng trên màn hình. */
const suaKhach = async (id: string, than: Record<string, unknown>) => {
  const r = await (await http(customer))
    .patch(`/customers/${id}`)
    .set('Authorization', `Bearer ${tok['tdv01']}`)
    .send(than);
  if (r.status !== 200) throw new Error(`sửa khách hàng hỏng: ${JSON.stringify(r.body)}`);
};

/**
 * Dựng bản mềm rồi trả về CHỮ trong đó.
 *
 * `0163` — chỉ Sale Admin dựng được, và `mauId` bắt buộc. Bản trước mặc định
 * `bld01` và cho bỏ trống mẫu (khi ấy bỏ trống nghĩa là *"đọc mẫu đã gắn vào hồ
 * sơ"*); cả hai vế đã bỏ.
 */
const banMem = async (policyId: string, mauId: string, who = 'sa01'): Promise<string> => {
  // Bản mềm là thao tác của Sale Admin (`0163`), nên hồ sơ phải nằm trên bàn
  // họ. Các ca dưới đây dừng ở giữa luồng duyệt để soi ảnh chụp, nên phép giao
  // đi kèm ngay đây thay vì rải ra từng ca.
  if (who === 'sa01') await giaoChoSa(policyId);
  const r = await pdfOf(`/policies/${policyId}/render?mauId=${mauId}`, who);
  if (r.status !== 200) throw new Error(`dựng bản mềm hỏng: ${r.status} ${JSON.stringify(r.body)}`);
  return pdfText(r.body as Buffer);
};

describe('`0101` khách hàng và hai cái tên đóng băng vào hồ sơ', () => {
  it('hồ sơ NHÁP CHƯA chụp gì — và bản xem thử đọc SỐNG', async () => {
    const d = await draft();
    const mau = await mauHoSo();
    expect((await anhChup(d.id)).kh_ten_snap).toBeNull();
    expect((await anhChup(d.id)).nguoi_de_nghi_snap).toBeNull();

    // Đọc sống là ĐÚNG ở quãng này: người lập đang cân nhắc, họ phải thấy số
    // hiện tại chứ không phải một ảnh chụp chưa ai chụp.
    expect(await banMem(d.id, mau)).toContain(CUSTOMER_NAME);
    await suaKhach(d.customerId, { name: 'Nhà thuốc Nháp Vừa Sửa' });
    expect(await banMem(d.id, mau)).toContain('Nhà thuốc Nháp Vừa Sửa');
    expect((await anhChup(d.id)).kh_ten_snap).toBeNull();
  }, 120_000);

  it('GỬI DUYỆT thì chụp đủ tám trường khách hàng và tên người đề nghị', async () => {
    const d = await draft();
    await suaKhach(d.customerId, {
      name: 'Nhà thuốc Trước Khi Gửi',
      debtTerm: 'GOI_DON_90',
    });
    expect((await act(d.id, 'SUBMIT', 'tdv01')).status).toBe(200);

    const a = await anhChup(d.id);
    expect(a.kh_ten_snap).toBe('Nhà thuốc Trước Khi Gửi');
    // `0138` — ảnh chụp giữ CÂU đã dựng, không giữ mã điều khoản: đổi câu chữ
    // của `CAU_DIEU_KHOAN` về sau không được sửa lại tờ CSBH đã gửi duyệt.
    expect(a.kh_cong_no_snap).toBe('Thanh toán gối đơn, công nợ không quá 90 ngày');
    expect(a.kh_ma_snap).toBe(d.code);
    expect(a.kh_dia_chi_dang_ky_snap).toBe(ADDRESS_1);
    // `AuthUser.name` — ảnh chụp danh tính của `0090`, chính người vừa bấm gửi.
    expect(a.nguoi_de_nghi_snap).toBeTruthy();
  }, 90_000);

  it('SỬA KHÁCH HÀNG sau khi gửi duyệt thì bản mềm KHÔNG đổi', async () => {
    const d = await draft();
    await suaKhach(d.customerId, { name: 'Nhà thuốc Đã Duyệt', debtTerm: 'GOI_DON_90' });
    await act(d.id, 'SUBMIT', 'tdv01');

    const truoc = await banMem(d.id, await mauHoSo());
    expect(truoc).toContain('Nhà thuốc Đã Duyệt');

    // Đổi cả tên lẫn công nợ — đúng kịch bản đã đo được ở lượt rà `0099`.
    await suaKhach(d.customerId, {
      name: 'TÊN MỚI SAU KHI KÝ',
      debtTerm: 'KHAC',
      debtNote: 'ĐIỀU KHOẢN MỚI SAU KHI KÝ',
    });

    const sau = await banMem(d.id, await mauHoSo());
    expect(sau, 'tên mới KHÔNG được lọt vào văn bản đã gửi duyệt').not.toContain(
      'TÊN MỚI SAU KHI KÝ',
    );
    expect(sau).toContain('Nhà thuốc Đã Duyệt');
    expect(packed(sau)).not.toContain(packed('ĐIỀU KHOẢN MỚI SAU KHI KÝ'));
  }, 120_000);

  it('TBP KÝ thì chụp tên người ký, và tên ấy in ra bản mềm', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    expect((await act(d.id, 'TBP_SIGN', 'tbp01')).status).toBe(200);

    const a = await anhChup(d.id);
    expect(a.tbp_ky_ten_snap).toBeTruthy();
    expect(a.tbp_signed_at).not.toBeNull();
    expect(await banMem(d.id, await mauHoSo())).toContain(a.tbp_ky_ten_snap!);
  }, 120_000);

  it('TBP TỰ ĐỔI HỌ TÊN thì tên trên bản ĐÃ KÝ vẫn nguyên', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    const tenLucKy = (await anhChup(d.id)).tbp_ky_ten_snap!;

    const doiTen = async (ten: string) =>
      (await http(identity))
        .patch('/auth/me')
        .set('Authorization', `Bearer ${tok['tbp01']}`)
        .send({ fullName: ten });

    await doiTen('Nguyễn Văn Đổi Tên Sau Khi Ký');
    try {
      const chu = await banMem(d.id, await mauHoSo());
      expect(chu, 'bản đã ký phải giữ tên lúc ký').toContain(tenLucKy);
      expect(chu).not.toContain('Đổi Tên Sau Khi Ký');
    } finally {
      // Tài khoản mẫu là TOÀN CỤC với cả bộ test — trả tên về chỗ cũ.
      await doiTen(tenLucKy);
    }
  }, 120_000);

  it('TRẢ VỀ sau khi đã ký thì ba cột chữ ký bị XOÁ cùng lúc', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    expect((await anhChup(d.id)).tbp_ky_ten_snap).toBeTruthy();

    await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Sai thông tin khách hàng' });

    const a = await anhChup(d.id);
    // Ba cột nói CÙNG một sự thật, nên phải cùng rỗng — để sót một cột là dựng
    // ra một hồ sơ "đã ký bởi không ai".
    expect(a.tbp_ky_ten_snap).toBeNull();
    expect(a.tbp_signed_at).toBeNull();
    expect(a.tbp_signed_by).toBeNull();
  }, 120_000);

  it('BỊ TRẢ LẠI: TDV sửa khách hàng rồi gửi lại thì ảnh chụp LÀM MỚI', async () => {
    const d = await draft();
    await suaKhach(d.customerId, { name: 'Tên SAI lúc gửi lần đầu' });
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Sai tên khách hàng' });
    expect((await anhChup(d.id)).kh_ten_snap).toBe('Tên SAI lúc gửi lần đầu');

    // Đây là cả nội dung của yêu cầu: đóng băng KHÔNG được khoá chết việc sửa.
    await suaKhach(d.customerId, {
      name: 'Tên ĐÚNG sau khi sửa',
      debtTerm: 'KHAC',
      debtNote: 'Trả trước 30%, còn lại sau 60 ngày',
    });
    expect((await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01')).status).toBe(200);

    const a = await anhChup(d.id);
    expect(a.kh_ten_snap).toBe('Tên ĐÚNG sau khi sửa');
    expect(a.kh_cong_no_snap).toBe('Trả trước 30%, còn lại sau 60 ngày');

    const chu = await banMem(d.id, await mauHoSo());
    expect(chu).toContain('Tên ĐÚNG sau khi sửa');
    expect(chu).not.toContain('Tên SAI lúc gửi lần đầu');
  }, 150_000);

  it('BỊ TRẢ LẠI rồi gửi lại thì KÝ LẠI ĐƯỢC, và chụp tên người ký lần này', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    await act(d.id, 'TBP_SIGN', 'tbp01');
    await act(d.id, 'KT_RETURN_L1', 'kt01', { reason: 'Tra lai' });
    await act(d.id, 'RESUBMIT_AFTER_EDIT', 'tdv01');

    // Tới `0101` đường này trả 409 `ALREADY_SIGNED` — hồ sơ nằm chết ở *Chờ TBP
    // duyệt* rồi bị SLA xoá. Xem đầu tệp migration `0101`.
    const ky = await act(d.id, 'TBP_SIGN', 'tbp01');
    expect(ky.status, 'WF-20: gửi lại thì phải ký lại được').toBe(200);
    expect((await anhChup(d.id)).tbp_ky_ten_snap).toBeTruthy();
  }, 150_000);

  it('BÀN GIAO đổi TDV phụ trách nhưng NGƯỜI ĐỀ NGHỊ trên văn bản không đổi', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const nguoiDeNghi = (await anhChup(d.id)).nguoi_de_nghi_snap!;

    // Bàn giao thật đi qua đường vô hiệu hoá tài khoản (`vai-tro.test.ts` kiểm
    // trọn đường ấy); ở đây chỉ cần đúng HỆ QUẢ của nó lên hồ sơ.
    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE pol.policy SET tdv_user_id = (SELECT id FROM idn.app_user WHERE username = 'tdv02')
          WHERE id = $1`,
        [d.id],
      );
    });

    const a = await anhChup(d.id);
    expect(a.nguoi_de_nghi_snap, 'người ĐỀ NGHỊ là việc đã xảy ra, bàn giao không đổi nó').toBe(
      nguoiDeNghi,
    );
    expect(await banMem(d.id, await mauHoSo())).toContain(nguoiDeNghi);
  }, 120_000);

  it('MÀN HÌNH hồ sơ và BẢN MỀM nói cùng một con số công nợ', async () => {
    /*
     * Không phải một ca thừa của ca "sửa khách hàng thì bản mềm không đổi".
     *
     * Ca kia canh tờ giấy; ca này canh chỗ mà tờ giấy và màn hình có thể tách
     * đôi. `0101` đóng băng phía văn bản, và nếu `GET /policies/:id` vẫn đọc
     * sống thì Kế toán nhìn màn hình thấy một số, mở bản mềm thấy số khác, và
     * không có gì nói cho họ biết cái nào đúng.
     */
    const d = await draft();
    await suaKhach(d.customerId, {
      name: 'Nhà thuốc Khớp Nhau',
      debtTerm: 'KHAC',
      debtNote: 'Trả sau 45 ngày kể từ ngày nhận hàng',
    });
    await act(d.id, 'SUBMIT', 'tdv01');
    // `0142` — Kế toán chưa thấy hồ sơ ở lượt chờ TBP ĐẦU TIÊN, nên phải cho nó
    // đi qua chữ ký thì mới hỏi được đúng câu ca kiểm này muốn hỏi.
    await act(d.id, 'TBP_SIGN', 'tbp01');

    await suaKhach(d.customerId, { name: 'Tên đổi sau khi gửi', debtTerm: 'SAU_NHAN_HANG' });

    const man = await pget(`/policies/${d.id}`, 'kt01');
    expect(man.status, JSON.stringify(man.body)).toBe(200);
    expect(man.body.khachHang.congNo).toBe('Trả sau 45 ngày kể từ ngày nhận hàng');
    expect(man.body.khachHang.ten).toBe('Nhà thuốc Khớp Nhau');
    expect(man.body.nguoiDeNghi.ten).toBe((await anhChup(d.id)).nguoi_de_nghi_snap);

    const chu = await banMem(d.id, await mauHoSo());
    expect(chu).toContain('Nhà thuốc Khớp Nhau');
    expect(packed(chu)).toContain(packed('Trả sau 45 ngày kể từ ngày nhận hàng'));
  }, 120_000);

  it('hồ sơ lập TRƯỚC `0101` vẫn dựng được — đọc sống, không vỡ', async () => {
    const d = await draft();
    await act(d.id, 'SUBMIT', 'tdv01');
    const a = await anhChup(d.id);

    // Vặn CSDL để giả dữ liệu cũ: không API nào tạo ra được nữa.
    await withAdminDb(async (c) => {
      await c.query(
        `UPDATE pol.policy SET kh_ma_snap = NULL, kh_ten_snap = NULL,
                kh_ma_so_thue_snap = NULL, kh_dia_chi_dang_ky_snap = NULL,
                kh_noi_nhan_hang_snap = NULL, kh_nguoi_dai_dien_snap = NULL,
                kh_chuc_danh_dai_dien_snap = NULL, kh_cong_no_snap = NULL,
                nguoi_de_nghi_snap = NULL
          WHERE id = $1`,
        [d.id],
      );
    });

    try {
      const chu = await banMem(d.id, await mauHoSo());
      // Đọc sống thì ra đúng tên đang có trong `cus.customer`.
      expect(chu).toContain(CUSTOMER_NAME);
    } finally {
      await withAdminDb(async (c) => {
        await c.query(
          `UPDATE pol.policy SET kh_ma_snap = $2, kh_ten_snap = $3,
                  kh_dia_chi_dang_ky_snap = $4, kh_cong_no_snap = $5::text,
                  nguoi_de_nghi_snap = $6
            WHERE id = $1`,
          [
            d.id,
            a.kh_ma_snap,
            a.kh_ten_snap,
            a.kh_dia_chi_dang_ky_snap,
            a.kh_cong_no_snap,
            a.nguoi_de_nghi_snap,
          ],
        );
      });
    }
  }, 120_000);
});

// =============================================================================
// `0104` — bảng phân loại trường phải phủ hết danh mục
// =============================================================================

describe('`0104` NHOM_TRUONG phủ hết bảng hướng dẫn ánh xạ', () => {
  /*
   * Bảng phân loại nằm ở `document` (nó sở hữu danh mục trường), còn chốt chặn
   * chạy ở `policy` (nó sở hữu bước gửi duyệt). Hai chỗ, một sự thật — nên phải
   * có một ca đứng giữa, nếu không chúng trôi khỏi nhau vào đúng ngày ai đó
   * thêm một trường mới.
   */
  it('mọi khoá của danh mục đều được xếp nhóm, và không có nhóm thừa', () => {
    for (const k of KNOWN_SOURCES) {
      expect(NHOM_TRUONG[k], `trường ${k} chưa xếp nhóm — bắt buộc lúc gửi, hay điền sau?`)
        .toBeDefined();
    }
    // Chiều ngược lại: xếp nhóm cho một khoá đã gỡ khỏi danh mục là để lại một
    // dòng nói về thứ không tồn tại, và nó sẽ được đọc như thể còn đúng.
    for (const k of Object.keys(NHOM_TRUONG)) {
      expect(KNOWN_SOURCES, `${k} có nhóm nhưng không còn trong danh mục`).toContain(k);
    }
  });

  it('nhóm `chan-moi` khớp ĐÚNG danh sách mà `policy` thật sự chặn', () => {
    const theoBang = Object.entries(NHOM_TRUONG)
      .filter(([, n]) => n === 'chan-moi')
      .map(([k]) => k)
      .sort();
    expect([...TRUONG_CHAN_LUC_GUI].sort()).toEqual(theoBang);
  });

  it('BẢY trường `dien-sau` — con số này là một quyết định, không phải phép đếm', () => {
    /*
     * Chốt 24/08. Đã cân nhắc GỠ bảy trường này khỏi danh mục ánh xạ rồi bỏ ý
     * ấy: chúng là khối phê duyệt của tờ CSBH — tên kế toán, ngày duyệt, khối
     * chữ ký số. Ghim con số ở đây để một lượt thêm hay bớt phải đi qua ca này.
     */
    const dienSau = Object.entries(NHOM_TRUONG)
      .filter(([, n]) => n === 'dien-sau')
      .map(([k]) => k)
      .sort();
    expect(dienSau).toEqual(
      [
        'ho_so.chu_ky_so_TBP',
        'ho_so.ke_toan',
        'ho_so.ngay_hieu_luc',
        'ho_so.ngay_kt_nhan_l1',
        'ho_so.ngay_kt_nhan_l2',
        'ho_so.ngay_tbp_ky',
        'ho_so.sale_admin',
      ].sort(),
    );
  });

  it('mọi trường `dien-sau` VẪN dựng được văn bản — chúng ở lại danh mục, không bị gỡ', () => {
    /*
     * Vế "không gỡ" của quyết định. Gỡ khỏi `SCALAR` thì ba mẫu bàn giao thành
     * mẫu không lưu lại được (`400 SOURCE_UNKNOWN`), và bản CSBH đã duyệt in ra
     * không còn chỗ nào nói ai duyệt, duyệt lúc nào. Đo được ở lượt phá `0102`.
     */
    for (const [k, n] of Object.entries(NHOM_TRUONG)) {
      if (n !== 'dien-sau') continue;
      expect(KNOWN_SOURCES, `${k} phải còn đặt ô được`).toContain(k);
    }
  });
});

// =============================================================================
// `0150` — XEM MẪU, VÀ TÊN MẪU KHÔNG ĐƯỢC TRÙNG
// =============================================================================

/**
 * Thân mẫu HỢP ĐỒNG của bộ kiểm — chép lại bố cục mẫu mặc định trước `0150`.
 *
 * Hàm dựng bố cục ấy sống trong `templates.service.ts` để `ensureDefault` seed
 * lúc khởi động; `0150` gỡ cả hai. Bố cục thì phải giữ, vì cả một loạt ca kiểm
 * đọc NỘI DUNG hợp đồng đã ký: tiêu đề, mã sản phẩm trong bảng, tỷ lệ chiết
 * khấu. Chép về đây là đưa nó về đúng chỗ — nó vốn là dữ liệu thử, không phải
 * một phần của sản phẩm.
 */
const thanMauHopDong = (): Buffer =>
  makeDocx(
    [
      para(COMPANY.name),
      // Địa chỉ ở đây KHÔNG được trùng địa chỉ khách hàng nào của bộ kiểm: ca
      // DOC-27 khẳng định bản xuất lần hai KHÔNG còn địa chỉ cũ, và một chuỗi
      // giống hệt nằm sẵn trong phần đầu trang làm ca ấy đỏ mà chẳng liên quan.
      para('Trụ sở Công ty — MST 0100000000'),
      para(''),
      para('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG'),
      para('Số hồ sơ CSBH: {{ho_so.ma_ho_so}} — ngày áp dụng {{ho_so.ngay_ap_dung}}'),
      para(''),
      para('BÊN MUA: {{ho_so.ten_khach_hang}} (mã {{ho_so.ma_khach_hang}})'),
      para('Địa chỉ: {{ho_so.dia_chi_dang_ky}}'),
      para('Người đại diện: {{ho_so.nguoi_dai_dien}}'),
      para('Công nợ hiện tại: {{ho_so.cong_no}}'),
      para(''),
      para('Danh sách sản phẩm và chính sách giá:'),
      // MỘT ô trống, hệ thống dựng cả bảng (`0067`).
      para(O_BANG_SAN_PHAM),
      para(''),
      para('Hà Nội, ngày {{ngay_in}}'),
    ].join(''),
  );

/** Thân `.docx` tối thiểu — hai ô trống, đủ để lưu thành một mẫu hợp đồng. */
const mauToiThieu = (): Buffer =>
  makeDocx([para('{{ho_so.ten_khach_hang}}'), para('{{ho_so.ma_ho_so}}')].join(''));

/** Một mẫu HỒ SƠ mang đúng tên truyền vào — dùng cho ca "khác loại thì cho qua". */
const luuMauHoSoTen = async (name: string) => {
  const than = makeDocx(
    [...NGUON_BAT_BUOC_HO_SO.map((n) => para(`{{${n}}}`)), para('{{bang_san_pham}}')].join(''),
  );
  return (await http(doc))
    .post('/policy-templates')
    .set('Authorization', `Bearer ${tok['admin01']}`)
    .field('name', name)
    .field('mapping', JSON.stringify(anhXaTu(than)))
    .attach('file', than, { filename: 'ho-so.docx', contentType: DOCX });
};

describe('`0150` chi tiết văn bản mẫu', () => {
  const cget = async (path: string, who: string) =>
    (await http(doc)).get(path).set('Authorization', `Bearer ${tok[who]}`);

  it('trả về bảng ánh xạ và tập cột — mẫu đã lưu thôi là hộp đen', async () => {
    /*
     * Trước `0150`, mẫu đã lưu không có đường nào xem lại: bảng quản trị hiện
     * tên, khổ giấy, ngày sửa, trạng thái, và thao tác duy nhất là vô hiệu hoá.
     *
     * Chỗ hở ấy không phải một tính năng bị bỏ quên — `0067` bỏ hẳn việc sửa mẫu
     * với lý do *"muốn đổi thì XOÁ đi và thêm mẫu mới"*, rồi `0098` bỏ luôn
     * quyền xoá. Đường thoát bị lấy đi mà không ai để ý.
     */
    const than = makeDocx(
      [
        para('{{ho_so.ten_khach_hang}}'),
        para('{{ho_so.ma_ho_so}}'),
        para('{{bang_san_pham}}'),
      ].join(''),
    );
    const up = await luuMau('admin01', than, {
      name: uniq('Mau xem chi tiet'),
      cotBang: ['stt', 'ten_san_pham', 'ty_le_ck'],
    });
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    try {
      const ct = await cget(`/contract-templates/${up.body.id}/chi-tiet`, 'admin01');
      expect(ct.status, JSON.stringify(ct.body)).toBe(200);

      const anhXa = ct.body.anhXa as { placeholder: string; source: string }[];
      expect(anhXa.map((x) => x.placeholder).sort()).toEqual([
        '{{ho_so.ma_ho_so}}',
        '{{ho_so.ten_khach_hang}}',
      ]);
      expect(anhXa.find((x) => x.placeholder === '{{ho_so.ma_ho_so}}')?.source).toBe(
        'ho_so.ma_ho_so',
      );

      /*
       * NHÃN của tập cột, không phải mã khoá — và giữ đúng thứ tự khai ở
       * `COT_BANG`, không phải thứ tự người dùng gõ vào.
       *
       * Thứ tự ấy là thứ tự cột in ra trên giấy, nên đọc theo thứ tự nào cũng
       * "đúng" mà chỉ một thứ tự nói được tờ giấy trông ra sao.
       */
      expect(ct.body.nhanCot).toEqual(['STT', 'Tên sản phẩm', 'Tỷ lệ CK']);
    } finally {
      await donMau('/contract-templates', up.body.id, 'admin01');
    }
  }, 90_000);

  it('KHÔNG khai tập cột thì mẫu nhận ĐỦ mọi cột, không phải rỗng', async () => {
    /*
     * `chuanHoaCot(undefined)` trả về cả mười cột, nên mẫu nào không khai gì
     * cũng được ghi một tập ĐẦY ĐỦ chứ không để trống. Đó là hành vi đúng — bảng
     * sản phẩm phải in được ngay — nhưng nó có nghĩa là màn hình chi tiết gần
     * như không bao giờ gặp `null`.
     *
     * Ghi ra ở đây vì suy ngược lại rất dễ: đọc `cot_bang` là `NOT NULL` trên
     * mọi dòng mới rồi kết luận rằng tính năng chọn tập cột đã bị bỏ.
     */
    const up = await luuMau('admin01', mauToiThieu(), { name: uniq('Mau khong cot') });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    try {
      const ct = await cget(`/contract-templates/${up.body.id}/chi-tiet`, 'admin01');
      const cot = ct.body.nhanCot as string[];
      expect(cot, 'không khai thì phải nhận đủ cột').toHaveLength(10);
      expect(cot[0]).toBe('STT');
      expect(cot).toContain('Tên sản phẩm');
    } finally {
      await donMau('/contract-templates', up.body.id, 'admin01');
    }
  }, 90_000);

  it('XEM ĐƯỢC CẢ MẪU ĐÃ VÔ HIỆU — nếu không thì mất hết mẫu là ngõ cụt', async () => {
    /*
     * Ca đáng giá nhất của tệp, và lý do nằm ở `0150` chứ không ở đây: hệ thống
     * thôi tự dựng mẫu. Nên nếu Quản trị lỡ vô hiệu hoá hết mẫu, đường duy nhất
     * để có lại là tải một `.docx` lên — mà file `.docx` duy nhất trong tầm tay
     * họ là file lấy về từ chính màn hình này.
     *
     * Chặn mẫu vô hiệu ở đây là biến một bước lùi được thành một ngõ cụt.
     */
    const up = await luuMau('admin01', mauToiThieu(), { name: uniq('Mau se vo hieu') });
    expect(up.status).toBe(201);
    await donMau('/contract-templates', up.body.id, 'admin01');

    const ct = await cget(`/contract-templates/${up.body.id}/chi-tiet`, 'admin01');
    expect(ct.status, JSON.stringify(ct.body)).toBe(200);
    expect(ct.body.voHieuHoaLuc, 'phải nói rõ nó đã vô hiệu').not.toBeNull();
    // `fileId` là thứ nút *Tải file .docx* cần — thiếu nó thì màn hình mở được
    // mà không lấy được gì về.
    expect(ct.body.fileId).toBeTruthy();
  }, 90_000);

  it('CHỈ Quản trị — bốn vai trò còn lại đều 403', async () => {
    // Đường `GET :id` sẵn có mở cho năm vai trò để ô chọn đọc cái tên. Đường này
    // trả dữ liệu quản trị — ô trống nào lấy trường nào — nên nó hẹp hơn hẳn.
    const up = await luuMau('admin01', mauToiThieu(), { name: uniq('Mau quyen') });
    expect(up.status).toBe(201);
    try {
      for (const who of ['tdv01', 'tbp01', 'kt01', 'sa01']) {
        expect(
          (await cget(`/contract-templates/${up.body.id}/chi-tiet`, who)).status,
          who,
        ).toBe(403);
      }
    } finally {
      await donMau('/contract-templates', up.body.id, 'admin01');
    }
  }, 90_000);
});

describe('`0150` tên văn bản mẫu không được trùng', () => {
  it('trùng tên với mẫu ĐANG DÙNG thì 409, và câu lỗi nói ra cái tên', async () => {
    const ten = uniq('Mau trung ten');
    const a = await luuMau('admin01', mauToiThieu(), { name: ten });
    expect(a.status, JSON.stringify(a.body)).toBe(201);

    try {
      const b = await luuMau('admin01', mauToiThieu(), { name: ten });
      expect(b.status).toBe(409);
      expect(b.body.code).toBe('TEMPLATE_NAME_TAKEN');
      // Câu lỗi mang chính cái tên: người dùng vừa gõ nó, và họ phải thấy hệ
      // thống đang nói về đúng ô nào.
      expect(b.body.message).toContain(ten);
    } finally {
      await donMau('/contract-templates', a.body.id, 'admin01');
    }
  }, 90_000);

  it('trùng tên với mẫu ĐÃ VÔ HIỆU cũng bị chặn', async () => {
    /*
     * Đây là vế khách hàng chốt riêng, và nó có một cái giá phải biết: tên của
     * một mẫu hỏng bị CHÁY VĨNH VIỄN. Không còn đường sửa mẫu, nên chữa một mẫu
     * sai là tải bản mới lên rồi vô hiệu hoá bản cũ — mà tên tự nhiên của bản
     * mới chính là tên bản cũ.
     *
     * Nới ra thì chỉ cần thêm `WHERE vo_hieu_hoa_luc IS NULL` vào chỉ mục.
     */
    const ten = uniq('Mau vo hieu roi trung');
    const a = await luuMau('admin01', mauToiThieu(), { name: ten });
    expect(a.status).toBe(201);
    await donMau('/contract-templates', a.body.id, 'admin01');

    const b = await luuMau('admin01', mauToiThieu(), { name: ten });
    expect(b.status, 'mẫu đã vô hiệu vẫn giữ chỗ cái tên').toBe(409);
    expect(b.body.code).toBe('TEMPLATE_NAME_TAKEN');
  }, 90_000);

  it('cùng tên nhưng KHÁC LOẠI mẫu thì cho qua', async () => {
    // Mẫu hồ sơ và mẫu hợp đồng nằm ở hai ô chọn khác nhau, nên trùng tên giữa
    // hai loại không gây nhầm cho ai. Cấm cả hai loại là siết một chỗ không đau.
    const ten = uniq('Mau hai loai');
    const a = await luuMau('admin01', mauToiThieu(), { name: ten });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    const b = await luuMauHoSoTen(ten);
    expect(b.status, JSON.stringify(b.body)).toBe(201);

    await donMau('/contract-templates', a.body.id, 'admin01');
    await donMau('/policy-templates', b.body.id, 'admin01');
  }, 90_000);
});
