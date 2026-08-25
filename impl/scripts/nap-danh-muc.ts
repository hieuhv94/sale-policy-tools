/**
 * NẠP DANH MỤC KHỞI ĐẦU cho một bản chạy thử (`0109`).
 *
 * Sản phẩm, giá, ba quy định chiết khấu, năm khách hàng, và ba văn bản mẫu.
 * **KHÔNG tài khoản, KHÔNG hồ sơ** — đó là ranh giới của script này, và nó là lý
 * do script được phép chạy ở `production` trong khi `seed.ts` và `seed-demo.ts`
 * thì không (SEC-14).
 *
 * SEC-14 canh một chuyện cụ thể: **tài khoản có mật khẩu ai cũng đoán được**
 * không bao giờ được nạp lên máy chủ thật. Danh mục sản phẩm không phải chuyện
 * đó — nó là dữ liệu nghiệp vụ mà Quản trị hệ thống dù sao cũng phải gõ tay, và
 * gõ tay hai mươi dòng giá là chỗ người thử bỏ cuộc trước khi thấy phần mềm làm
 * được gì.
 *
 * BỐN CHỐT CHẶN thay cho chốt `NODE_ENV`:
 *
 *   1. Phải có tài khoản Quản trị THẬT và mật khẩu của nó. Không có đường nào
 *      chạy được mà không ai đăng nhập.
 *   2. Từ chối nếu danh mục ĐÃ CÓ sản phẩm. Đây là lệnh khởi đầu, không phải
 *      lệnh nhập liệu — chạy lần hai trên hệ đang dùng là trộn dữ liệu mẫu vào
 *      dữ liệu thật.
 *   3. Đi qua API THẬT, không INSERT thẳng. Giá và ngưỡng phải qua đúng phép
 *      kiểm mà màn hình Quản trị dùng, nếu không bản chạy thử mang những con số
 *      mà phần mềm không tạo ra được.
 *   4. In ra một dòng nói rõ đây là dữ liệu MẪU, ở cả đầu và cuối.
 *
 * Gọi:  ./csbh nap-danh-muc
 */
import { readFileSync } from 'node:fs';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://gateway:3000';
const THU_MUC = process.env.TEMPLATES_DIR ?? '/app/templates';

const doc = (ten: string): string => {
  const tep = process.env[`${ten}_FILE`];
  if (tep) return readFileSync(tep, 'utf8').trim();
  const v = process.env[ten]?.trim();
  if (!v) {
    console.error(`nap-danh-muc: thiếu ${ten}.`);
    process.exit(1);
  }
  return v;
};

let token = '';

async function goi<T>(duong: string, body?: unknown, method = 'POST'): Promise<T> {
  const r = await fetch(`${GATEWAY}${duong}`, {
    method: body === undefined && method === 'POST' ? 'GET' : method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`${method} ${duong} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

/** KHÔNG đặt `content-type` bằng tay — `undici` tự đặt kèm `boundary`. */
async function guiTep<T>(duong: string, form: FormData): Promise<T> {
  const r = await fetch(`${GATEWAY}${duong}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!r.ok) throw new Error(`POST ${duong} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

// --- Thứ được nạp -----------------------------------------------------------

const NHOM = [
  { code: 'SUA-BOT', name: 'Sữa bột dinh dưỡng' },
  { code: 'DINH-DUONG-Y-HOC', name: 'Dinh dưỡng y học' },
  { code: 'SUA-NUOC', name: 'Sữa nước pha sẵn' },
];

/** Giá bán Công ty, số nguyên đồng. */
const SAN_PHAM = [
  { code: 'NC-GOLD-900', name: 'Nutricare Gold 900g', nhom: 'SUA-BOT', gia: 615_000 },
  { code: 'NC-GOLD-400', name: 'Nutricare Gold 400g', nhom: 'SUA-BOT', gia: 315_000 },
  { code: 'NC-BONE-900', name: 'Nutricare Bone 900g', nhom: 'SUA-BOT', gia: 585_000 },
  { code: 'NC-META-900', name: 'Metacare Gold 900g', nhom: 'SUA-BOT', gia: 495_000 },
  { code: 'NC-LEAN-400', name: 'Leanmax Rice 400g', nhom: 'DINH-DUONG-Y-HOC', gia: 275_000 },
  { code: 'NC-CANXI-400', name: 'Nutricare Canxi 400g', nhom: 'DINH-DUONG-Y-HOC', gia: 325_000 },
  { code: 'NC-DIA-400', name: 'Glucare Gold 400g', nhom: 'DINH-DUONG-Y-HOC', gia: 355_000 },
  { code: 'NC-NUOC-180', name: 'Nutricare Gold nước 180ml', nhom: 'SUA-NUOC', gia: 32_000 },
  { code: 'NC-NUOC-220', name: 'Metacare nước 220ml', nhom: 'SUA-NUOC', gia: 38_000 },
];

/**
 * BA quy định, và ba dòng này cố tình bày ra luật khó nhất của màn hình ấy:
 * **dòng CỤ THỂ HƠN thắng**.
 *
 * Khách loại 1 mua sữa bột lấy ngưỡng 18% từ `CK-SUA-L1`; khách loại 2 và 3 mua
 * đúng sản phẩm ấy lấy 15% từ `CK-SUA-BOT`. Hai hồ sơ cạnh nhau, hai ngưỡng khác
 * nhau, và cột *Quy định chiết khấu* trên hồ sơ nói ra vì sao.
 *
 * Chỉ có một quy định chung thì người thử không bao giờ nhìn thấy luật ấy hoạt
 * động, và sẽ tin rằng ngưỡng là một con số cố định cho cả hệ thống.
 */
const QUY_DINH_CK = [
  { code: 'CK-SUA-BOT', productGroupCode: 'SUA-BOT', thresholdRate2: 1500 },
  { code: 'CK-SUA-L1', productGroupCode: 'SUA-BOT', customerType: 1, thresholdRate2: 1800 },
  { code: 'CK-YHOC', productGroupCode: 'DINH-DUONG-Y-HOC', thresholdRate2: 1200 },
];

/**
 * NĂM KHÁCH HÀNG MẪU, phủ đủ ba loại khách (`0115`).
 *
 * Loại khách quyết định ngưỡng chiết khấu nào áp cho hồ sơ, và ba quy định ở
 * trên cố tình bày ra luật "dòng cụ thể hơn thắng". Nên năm khách này phải có ít
 * nhất một khách LOẠI 1 và một khách loại khác cùng mua sữa bột — không thì cái
 * luật ấy vẫn không nhìn thấy được.
 *
 * Mã số thuế và chức danh khai ĐỦ: từ `0104` thiếu một trong hai thì không gửi
 * duyệt được, và một bộ dữ liệu mẫu mà không lập nổi hồ sơ thì vô dụng.
 */
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
  {
    code: 'KH-0005',
    name: 'Nhà thuốc Thanh Bình',
    customerType: 1,
    registeredAddress: 'Số 21 Trần Phú, Hà Đông, Hà Nội',
    ownerName: 'Nguyễn Thanh Bình',
    ownerTitle: 'Chủ nhà thuốc',
    idNumber: '0105678901',
    debt: '2100000',
  },
];

/**
 * Hai mẫu hồ sơ và một mẫu hợp đồng.
 *
 * Hệ thống đã tự nạp một mẫu mỗi loại lúc `document` khởi động (`ensureDefault`),
 * nên ba file này KHÔNG phải điều kiện để dùng được — chúng là bản trình bày đẹp
 * hơn, và là thứ Quản trị tải về sửa câu chữ trong Word.
 */
const MAU = [
  { tep: 'mau-ho-so-a4-doc.docx', ten: 'Mẫu CSBH A4 dọc', duong: '/policy-templates' },
  { tep: 'mau-ho-so-a4-ngang.docx', ten: 'Mẫu CSBH A4 ngang', duong: '/policy-templates' },
  { tep: 'mau-hop-dong-a4-doc.docx', ten: 'Mẫu hợp đồng A4 dọc', duong: '/contract-templates' },
];

/**
 * Tìm một tài khoản theo TÊN ĐĂNG NHẬP.
 *
 * `GET /admin/users?q=` chỉ tìm theo HỌ TÊN (`0049`) — có lý do: người quản trị
 * đi tìm "chị Hạnh kế toán", không đi tìm "kt01". Nên ở đây phải quét trang.
 * Trên một hệ vừa cài thì danh sách rất ngắn; giới hạn 200 dòng để một hệ đã
 * dùng lâu không biến lệnh này thành một vòng lặp không hồi kết.
 */
async function timTaiKhoan(ten: string): Promise<{ id: string; role: string } | null> {
  for (let bo = 0; bo < 200; bo += 50) {
    const t = await goi<{ items?: { id: string; username: string; role: string }[] }>(
      `/admin/users?limit=50&offset=${bo}`,
      undefined,
      'GET',
    );
    const ds = t.items ?? [];
    const thay = ds.find((u) => u.username === ten);
    if (thay) return { id: thay.id, role: thay.role };
    if (ds.length < 50) return null;
  }
  return null;
}

/**
 * NĂM KHÁCH HÀNG, và câu hỏi "ai phụ trách".
 *
 * `POST /customers` gán `tdv_user_id = me.id` — TDV phụ trách mặc định là NGƯỜI
 * TẠO (CUST-01). Lệnh này chạy bằng tài khoản Quản trị, nên nếu không làm gì
 * thêm thì năm khách hàng ấy thuộc về Quản trị, và **TDV thật mở màn hình Khách
 * hàng sẽ thấy trống trơn** — phạm vi dữ liệu lọc theo `tdv_user_id`.
 *
 * Nên khai `TDV_USERNAME` thì giao lại luôn: `PATCH /customers/:id` với
 * `tdvUserId`, một quyền chỉ Quản trị có (`CAN_REASSIGN`). Không khai thì vẫn nạp,
 * và in ra một dòng nói rõ phải đổi tay ở màn hình Khách hàng.
 */
/**
 * KIỂM TRƯỚC KHI GHI BẤT CỨ THỨ GÌ.
 *
 * Bản đầu để phép kiểm này nằm trong `napKhach`, tức là SAU khi nhóm, quy định
 * và sản phẩm đã ghi xong. Một cái tên TDV gõ sai khi ấy để lại một hệ nạp dở —
 * và lượt chạy lại bị chính chốt "danh mục đã có sản phẩm" từ chối. Không có
 * đường tiến, cũng không có đường lùi, trừ dựng lại CSDL.
 *
 * Đo được ở lượt chạy thật đầu tiên. Mọi phép kiểm không cần dữ liệu vừa tạo đều
 * phải đứng trước lượt ghi đầu tiên.
 */
async function kiemTdv(tdv: string | undefined): Promise<{ id: string } | null> {
  if (!tdv) return null;
  const nguoi = await timTaiKhoan(tdv);
  if (!nguoi) {
    console.error(`nap-danh-muc: không có tài khoản "${tdv}". Chưa ghi gì cả.`);
    process.exit(1);
  }
  if (nguoi.role !== 'TDV') {
    console.error(
      `nap-danh-muc: "${tdv}" có vai trò ${nguoi.role}, không phải TDV. ` +
        'Khách hàng chỉ giao được cho Trình dược viên. Chưa ghi gì cả.',
    );
    process.exit(1);
  }
  return { id: nguoi.id };
}

async function napKhach(tdv: string | undefined, nguoi: { id: string } | null): Promise<void> {
  for (const k of KHACH) {
    const kh = await goi<{ id: string }>('/customers', k);
    if (nguoi) await goi(`/customers/${kh.id}`, { tdvUserId: nguoi.id }, 'PATCH');
  }

  if (nguoi) {
    console.log(`  khách hàng: ${KHACH.length}, đã giao cho ${tdv}`);
  } else {
    console.log(`  khách hàng: ${KHACH.length} — ĐANG THUỘC TÀI KHOẢN QUẢN TRỊ`);
    console.log('    TDV mở màn hình Khách hàng sẽ thấy trống. Đổi *TDV phụ trách*');
    console.log('    ở màn hình Khách hàng, hoặc chạy lại lệnh với TDV_USERNAME.');
  }
}

async function napMau(): Promise<void> {
  for (const m of MAU) {
    const buf = readFileSync(`${THU_MUC}/${m.tep}`);

    const oTrong = await guiTep<{ placeholders: string[] }>(
      `${m.duong}/o-trong`,
      (() => {
        const f = new FormData();
        f.append('file', new Blob([buf]), m.tep);
        return f;
      })(),
    );

    // `{{bang_san_pham}}` KHÔNG ánh xạ tới trường nào — hệ thống thay nó bằng cả
    // một bảng. Mọi ô còn lại thì tên khoá trùng luôn tên trường nguồn (`0051`).
    const mapping = oTrong.placeholders
      .filter((o) => o !== '{{bang_san_pham}}')
      .map((o) => ({ placeholder: o, source: o.slice(2, -2) }));

    const form = new FormData();
    form.append('name', m.ten);
    form.append('mapping', JSON.stringify(mapping));
    form.append('file', new Blob([buf]), m.tep);
    await guiTep(m.duong, form);
    console.log(`  mẫu: ${m.ten}`);
  }
}

async function main(): Promise<void> {
  const taiKhoan = doc('ADMIN_USERNAME');
  const matKhau = doc('ADMIN_PASSWORD');

  console.log('');
  console.log('  nap-danh-muc: nạp DỮ LIỆU MẪU cho bản chạy thử.');
  console.log('  Sản phẩm, giá và quy định chiết khấu dưới đây là số minh hoạ.');
  console.log('');

  const r = await fetch(`${GATEWAY}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: taiKhoan, password: matKhau }),
  });
  if (!r.ok) {
    console.error(`nap-danh-muc: đăng nhập ${taiKhoan} hỏng — ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  const phien = (await r.json()) as { accessToken: string; mustChangePassword?: boolean };
  /*
   * Tài khoản còn cờ "phải đổi mật khẩu" thì MỌI đường API trả 403
   * `PASSWORD_CHANGE_REQUIRED` (`auth.guard.ts`) — kể cả danh mục. Nói ra ở đây
   * chứ không để script chết ở lời gọi đầu tiên với một mã lỗi không giải thích
   * gì về việc phải làm.
   */
  if (phien.mustChangePassword) {
    console.error(
      'nap-danh-muc: tài khoản này còn phải đổi mật khẩu lần đầu. ' +
        'Đăng nhập trên giao diện, đổi mật khẩu, rồi chạy lại lệnh này với mật khẩu mới.',
    );
    process.exit(1);
  }
  token = phien.accessToken;

  const tenTdv = process.env.TDV_USERNAME?.trim() || undefined;

  // Danh mục đã có sản phẩm thì DỪNG — xem chốt chặn số 2 ở đầu tệp.
  const daCo = await goi<{ items?: unknown[] }>('/catalog/products?limit=1', undefined, 'GET');
  if ((daCo.items?.length ?? 0) > 0) {
    console.error(
      'nap-danh-muc: TỪ CHỐI — danh mục đã có sản phẩm. ' +
        'Lệnh này chỉ dùng cho một hệ vừa cài xong, chưa ai nhập gì.',
    );
    process.exit(1);
  }

  // Mọi phép kiểm đứng TRƯỚC lượt ghi đầu tiên. Xem chú thích ở `kiemTdv`.
  const nguoiTdv = await kiemTdv(tenTdv);

  for (const n of NHOM) {
    await goi('/catalog/product-groups', { code: n.code, name: n.name });
  }
  console.log(`  nhóm sản phẩm: ${NHOM.length}`);

  const homNay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );

  for (const q of QUY_DINH_CK) {
    await goi('/catalog/discount-rules', { ...q, effectiveFrom: homNay });
  }
  console.log(`  quy định chiết khấu: ${QUY_DINH_CK.length}`);

  for (const p of SAN_PHAM) {
    const sp = await goi<{ id: string }>('/catalog/products', {
      code: p.code,
      name: p.name,
      groupCode: p.nhom,
    });
    await goi(`/catalog/products/${sp.id}/prices`, {
      priceType: 'GIA_BAN_CONG_TY',
      amount: String(p.gia),
      effectiveFrom: homNay,
    });
  }
  console.log(`  sản phẩm kèm giá: ${SAN_PHAM.length}`);

  await napKhach(tenTdv, nguoiTdv);
  await napMau();

  console.log('');
  console.log('  Xong. Đây là DỮ LIỆU MẪU — sửa hoặc vô hiệu hoá trước khi dùng thật.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
