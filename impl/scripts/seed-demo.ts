/**
 * Dữ liệu mẫu cho bản demo: NHỎ, thật, và phủ đủ các trạng thái đáng xem.
 *
 * Vì sao cần script riêng thay vì dùng luôn dữ liệu có sẵn: bản demo và bộ test
 * dùng chung một Postgres, mà bộ test để lại hàng nghìn bản ghi `ZZ*` — mở màn
 * hình khách hàng ra là 5.000 dòng vô nghĩa. Không ai thử được gì trên đó.
 *
 * HAI QUYẾT ĐỊNH:
 *
 * 1. **Xoá sạch dữ liệu nghiệp vụ trước khi nạp.** Không cộng thêm vào đống cũ.
 *    Chỉ xoá `cat/cus/pol/rpt/doc` — KHÔNG đụng tài khoản (`idn`), vì tài khoản
 *    do `seed.ts` lo và người dùng có thể vừa đổi mật khẩu.
 *
 * 2. **Nạp qua API THẬT, không INSERT thẳng.** Chèn SQL nhanh hơn nhưng đi vòng
 *    qua máy trạng thái, qua việc đóng băng giá, qua phép tính chiết khấu — và
 *    dữ liệu demo sẽ ở những trạng thái mà phần mềm không bao giờ tạo ra được.
 *    Đi qua API thì dữ liệu demo đúng theo đúng nghĩa mà phần mềm hiểu.
 */
import { Client } from 'pg';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo: TỪ CHỐI chạy ở môi trường production');
  process.exit(1);
}

const GATEWAY = process.env.GATEWAY_URL ?? 'http://gateway:3000';
const MAT_KHAU = 'Test@1234';

const tok: Record<string, string> = {};

async function dangNhap(u: string): Promise<void> {
  const r = await fetch(`${GATEWAY}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: u, password: MAT_KHAU }),
  });
  if (!r.ok) throw new Error(`đăng nhập ${u} hỏng: ${r.status} ${await r.text()}`);
  tok[u] = ((await r.json()) as { accessToken: string }).accessToken;
}

async function goi<T>(duong: string, ai: string, body?: unknown, method = 'POST'): Promise<T> {
  const r = await fetch(`${GATEWAY}${duong}`, {
    method: body === undefined && method === 'POST' ? 'GET' : method,
    headers: {
      authorization: `Bearer ${tok[ai]}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`${method} ${duong} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

const act = (id: string, hanhDong: string, ai: string, body: Record<string, unknown> = {}) =>
  goi(`/policies/${id}/actions/${hanhDong}`, ai, body);

// --- Danh mục -----------------------------------------------------------------

const NHOM = [
  { code: 'SUA-BOT', name: 'Sữa bột dinh dưỡng' },
  { code: 'DINH-DUONG-Y-HOC', name: 'Dinh dưỡng y học' },
];

/** Giá bán Công ty là số nguyên đồng. Sáu sản phẩm là đủ để thấy bảng 10 cột. */
const SAN_PHAM = [
  { code: 'NC-GOLD-900', name: 'Nutricare Gold 900g', nhom: 'SUA-BOT', gia: 615_000 },
  { code: 'NC-GOLD-400', name: 'Nutricare Gold 400g', nhom: 'SUA-BOT', gia: 315_000 },
  { code: 'NC-BONE-900', name: 'Nutricare Bone 900g', nhom: 'SUA-BOT', gia: 585_000 },
  { code: 'NC-META-900', name: 'Metacare Gold 900g', nhom: 'SUA-BOT', gia: 495_000 },
  { code: 'NC-LEAN-400', name: 'Leanmax Rice 400g', nhom: 'DINH-DUONG-Y-HOC', gia: 275_000 },
  { code: 'NC-CANXI-400', name: 'Nutricare Canxi 400g', nhom: 'DINH-DUONG-Y-HOC', gia: 325_000 },
];

/**
 * Ngưỡng chiết khấu — nguồn DUY NHẤT, khớp theo nhóm sản phẩm × loại khách hàng
 * (`0025`, `0026`).
 *
 * Bốn dòng chứ không phải hai, để chồng demo bày ra được chính cái luật khó nhất
 * của màn hình này: dòng CỤ THỂ HƠN thắng. Khách loại 1 mua sữa bột lấy 18% từ
 * `CK-SUA-L1`, khách loại 3 mua cùng sản phẩm ấy lấy 15% từ `CK-SUA` — hai hồ sơ
 * cạnh nhau, hai ngưỡng khác nhau, và cột QĐCK nói ra vì sao.
 */
const QUY_DINH_CK = [
  { code: 'CK-SUA', productGroupCode: 'SUA-BOT', thresholdRate2: 1500 },
  { code: 'CK-SUA-L1', productGroupCode: 'SUA-BOT', customerType: 1, thresholdRate2: 1800 },
  { code: 'CK-SUA-L2', productGroupCode: 'SUA-BOT', customerType: 2, thresholdRate2: 2000 },
  { code: 'CK-YHOC', productGroupCode: 'DINH-DUONG-Y-HOC', thresholdRate2: 1200 },
];

const KHACH = [
  {
    code: 'KH-0001',
    name: 'Nhà thuốc Minh Châu',
    customerType: 1,
    registeredAddress: 'Số 8 Tôn Thất Thuyết, Cầu Giấy, Hà Nội',
    ownerName: 'Trần Thị Mỹ Hạnh',
    ownerTitle: 'Chủ nhà thuốc',
    idNumber: '0101234567',
    debt: '4500000',
  },
  {
    code: 'KH-0002',
    name: 'Nhà thuốc Đông Á',
    customerType: 1,
    registeredAddress: 'Số 12 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
    ownerName: 'Lê Quang Đạo',
    ownerTitle: 'Chủ nhà thuốc',
    idNumber: '0402345678',
    debt: '0',
  },
  {
    code: 'KH-0003',
    name: 'Công ty TNHH Dược phẩm Hoàng Long',
    customerType: 2,
    registeredAddress: 'Số 55 Lê Duẩn, Quận 1, TP Hồ Chí Minh',
    ownerName: 'Phạm Hoàng Long',
    ownerTitle: 'Giám đốc',
    idNumber: '0312345678',
    debt: '128000000',
  },
  {
    code: 'KH-0004',
    name: 'Khoa Dinh dưỡng — Bệnh viện Bạch Mai',
    customerType: 3,
    registeredAddress: 'Số 78 Giải Phóng, Đống Đa, Hà Nội',
    ownerName: 'Nguyễn Thị Thu Hà',
    ownerTitle: 'Trưởng khoa',
    idNumber: '0104567890',
    debt: '0',
  },
];

// --- Xoá dữ liệu nghiệp vụ cũ -------------------------------------------------

async function xoaDuLieuCu(): Promise<void> {
  const db = new Client({
    host: process.env.PGHOST ?? 'postgres',
    database: process.env.PGDATABASE ?? 'csbh',
    user: process.env.PG_SUPERUSER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
  });
  await db.connect();
  try {
    // Thứ tự theo chiều phụ thuộc. `pol.policy` có khoá ngoại sang `cus.customer`
    // và tự trỏ vào chính nó qua supersedes_id, nên phải gỡ hai cột đó trước.
    //
    // `TRUNCATE` KHÔNG dùng được với aud.audit_log: trigger chặn cả TRUNCATE
    // (bất biến "nhật ký chỉ ghi thêm"). Phải tắt trigger một cách có ý thức —
    // ở đây là hợp lệ vì đang dựng lại một môi trường thử nghiệm từ đầu.
    await db.query(`
      BEGIN;
      UPDATE pol.policy SET supersedes_id = NULL, superseded_by_id = NULL;
      DELETE FROM pol.policy_attachment;
      DELETE FROM pol.policy_event;
      DELETE FROM pol.policy_line;
      DELETE FROM pol.outbox;
      ALTER TABLE pol.policy DISABLE TRIGGER trg_forbid_delete_rejected;
      DELETE FROM pol.policy;
      ALTER TABLE pol.policy ENABLE TRIGGER trg_forbid_delete_rejected;
      DELETE FROM rpt.export_job;
      DELETE FROM rpt.policy_row;
      DELETE FROM cus.customer_document;
      DELETE FROM cus.outbox;
      DELETE FROM cus.customer;
      DELETE FROM doc.contract_template_field;
      DELETE FROM doc.contract_template;
      DELETE FROM doc.outbox;
      DELETE FROM doc.stored_file;
      DELETE FROM cat.outbox;
      DELETE FROM cat.product_price;
      DELETE FROM cat.discount_rule;
      DELETE FROM cat.product;
      DELETE FROM cat.product_group;
      DELETE FROM cat.signer;
      DELETE FROM ntf.sent_mail;
      DELETE FROM ntf.dead_letter;
      ALTER TABLE aud.audit_log DISABLE TRIGGER trg_audit_immutable;
      DELETE FROM aud.audit_log;
      ALTER TABLE aud.audit_log ENABLE TRIGGER trg_audit_immutable;
      COMMIT;
    `);
  } finally {
    await db.end();
  }
}

// --- Nạp --------------------------------------------------------------------

type CoId = { id: string };

async function main(): Promise<void> {
  await xoaDuLieuCu();

  for (const u of ['tdv01', 'tdv02', 'tbp01', 'kt01', 'sa01', 'admin01']) await dangNhap(u);

  for (const n of NHOM) await goi('/catalog/product-groups', 'admin01', n);
  for (const q of QUY_DINH_CK) {
    await goi('/catalog/discount-rules', 'admin01', { ...q, effectiveFrom: '2026-01-01' });
  }

  const sanPham: Record<string, string> = {};
  for (const p of SAN_PHAM) {
    const r = await goi<CoId>('/catalog/products', 'admin01', {
      code: p.code,
      name: p.name,
      groupCode: p.nhom,
    });
    sanPham[p.code] = r.id;
    await goi(`/catalog/products/${r.id}/prices`, 'admin01', {
      priceType: 'GIA_BAN_CONG_TY',
      amount: String(p.gia),
      effectiveFrom: '2026-01-01',
    });
  }

  await goi('/catalog/signers', 'admin01', {
    fullName: 'Nguyễn Văn Thành',
    title: 'Giám đốc Kinh doanh',
    unit: 'Công ty TNHH Dược phẩm Nutricare',
    signScope: 'Chính sách bán hàng',
    validFrom: '2026-01-01',
  }).catch(() => undefined);

  const khach: Record<string, string> = {};
  for (const k of KHACH) {
    // KH-0002 thuộc tdv02 để thấy rõ phạm vi dữ liệu: tdv01 KHÔNG thấy khách này.
    const chu = k.code === 'KH-0002' ? 'tdv02' : 'tdv01';
    const r = await goi<CoId>('/customers', chu, k);
    khach[k.code] = r.id;
  }

  /** Một dòng sản phẩm. `cpbh` là chi phí bán hàng, quyết định tỷ lệ chiết khấu. */
  const dong = (ma: string, giaBuon: number, ...cpbh: number[]) => ({
    productId: sanPham[ma]!,
    wholesalePrice: String(giaBuon),
    cpbh: cpbh.map(String),
  });

  const lapHoSo = async (khachHang: string, lines: object[], ai = 'tdv01') =>
    (await goi<CoId>('/policies', ai, { customerId: khach[khachHang]!, lines, appliedDate: '2026-08-01' })).id;

  // 1. NHÁP — tdv01 mở phần mềm là có ngay việc dở dang để xem và sửa.
  await lapHoSo('KH-0001', [
    dong('NC-GOLD-900', 540_000, 18_000), // 15,12%
    dong('NC-GOLD-400', 280_000, 9_000),  // 13,97%
  ]);

  // 2. CHỜ TBP DUYỆT — tbp01 đăng nhập là thấy việc ở trang chủ.
  //
  // Hai dòng đầu nằm DƯỚI ngưỡng, dòng thứ ba vượt. Tỷ lệ đó là có chủ ý: vượt
  // ngưỡng phải là NGOẠI LỆ thì dấu cảnh báo mới có nghĩa. Một bảng mà dòng nào
  // cũng đỏ thì người duyệt thôi không nhìn nữa.
  const hs2 = await lapHoSo('KH-0003', [
    dong('NC-GOLD-900', 528_000, 20_000), // 17,40% — dưới ngưỡng 18%
    dong('NC-BONE-900', 530_000, 15_000), // 11,97% — dưới ngưỡng 15%
    dong('NC-META-900', 390_000, 20_000), // 25,25% — VƯỢT ngưỡng 15%
  ]);
  await act(hs2, 'SUBMIT', 'tdv01');

  // 3. CHỜ KẾ TOÁN L1 — kt01 đăng nhập là thấy việc, và xuất được hợp đồng.
  const hs3 = await lapHoSo('KH-0004', [
    dong('NC-LEAN-400', 258_000, 8_000),  // 9,09% — dưới ngưỡng 12%
    dong('NC-CANXI-400', 302_000, 10_000), // 10,15% — dưới ngưỡng 12%
  ]);
  await act(hs3, 'SUBMIT', 'tdv01');
  await act(hs3, 'TBP_SIGN', 'tbp01');

  // 4. ĐANG CÓ HIỆU LỰC — đi hết 10 bước, để báo cáo và màn hình khách hàng có
  //    thứ để hiện.
  const hs4 = await lapHoSo('KH-0002', [dong('NC-GOLD-900', 550_000, 15_000)], 'tdv02'); // 13,01%
  await act(hs4, 'SUBMIT', 'tdv02');
  await act(hs4, 'TBP_SIGN', 'tbp01');
  await act(hs4, 'KT_RECEIVE_L1', 'kt01');
  await goi(`/policies/${hs4}/attachments`, 'sa01', {
    kind: 'SCAN',
    fileName: 'ban-cung-da-ky.pdf',
    objectKey: `scan/demo-${hs4}.pdf`,
  });
  await act(hs4, 'SA_HANDOVER', 'sa01');
  await act(hs4, 'KT_RECEIVE_L2', 'kt01');

  // 5. YÊU CẦU CHỈNH SỬA — hồ sơ bị Trưởng bộ phận trả lại kèm lý do.
  //
  // Không có nó thì tdv01 mở phần mềm ra thấy trang chủ TRỐNG: hộp thư đến của
  // TDV chỉ hiện hồ sơ bị trả lại. Đúng về hành vi, nhưng là một bản demo tệ —
  // và đây cũng là chỗ duy nhất nhìn thấy dải "lý do trả lại" trên màn hình.
  const hs5 = await lapHoSo('KH-0001', [
    dong('NC-BONE-900', 470_000, 15_000), // 22,22% — vượt ngưỡng 15%
  ]);
  await act(hs5, 'SUBMIT', 'tdv01');
  await act(hs5, 'TBP_RETURN', 'tbp01', {
    reason:
      'Chiết khấu dòng Nutricare Bone 900g vượt ngưỡng quy định. ' +
      'Đề nghị điều chỉnh giá bán buôn hoặc bổ sung phê duyệt ngoại lệ.',
  });

  console.log(
    `seed-demo: xong — ${SAN_PHAM.length} sản phẩm, ${KHACH.length} khách hàng, 5 hồ sơ ` +
      '(Nháp · Yêu cầu chỉnh sửa · Chờ TBP duyệt · Chờ Kế toán L1 · Đang có hiệu lực)',
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
