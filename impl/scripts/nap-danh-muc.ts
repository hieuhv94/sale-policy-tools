/**
 * NẠP DANH MỤC KHỞI ĐẦU cho một bản chạy thử (`0109`).
 *
 * Sản phẩm, giá, ba quy định chiết khấu, và ba văn bản mẫu. KHÔNG tài khoản,
 * KHÔNG khách hàng, KHÔNG hồ sơ — đó là ranh giới của script này, và nó là lý do
 * script được phép chạy ở `production` trong khi `seed.ts` và `seed-demo.ts` thì
 * không (SEC-14).
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

/*
 * NẠP VĂN BẢN MẪU ĐÃ GỠ KHỎI SCRIPT NÀY (`0165`).
 *
 * Khách hàng chốt 30/08: ba mẫu mặc định *"luôn luôn được deploy cùng hệ thống
 * mà không cần phải make demo-mau hay make nap-danh-muc"*. Chúng nạp lúc
 * `document` khởi động — xem `services/document/src/contracts/bootstrap-mau.ts`.
 *
 * Giữ lại ở đây một bản thứ hai là dựng ra hai đường nạp cho cùng một thứ, và
 * đường thứ hai sẽ đâm vào `uq_template_ten` hoặc — tệ hơn — thêm một bộ mẫu
 * gần giống bên cạnh bộ đã có.
 *
 * `TEMPLATES_DIR` và `readFileSync` đi theo: không còn ai đọc file trong script
 * này nữa.
 */

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

  // Danh mục đã có sản phẩm thì DỪNG — xem chốt chặn số 2 ở đầu tệp.
  const daCo = await goi<{ items?: unknown[] }>('/catalog/products?limit=1', undefined, 'GET');
  if ((daCo.items?.length ?? 0) > 0) {
    console.error(
      'nap-danh-muc: TỪ CHỐI — danh mục đã có sản phẩm. ' +
        'Lệnh này chỉ dùng cho một hệ vừa cài xong, chưa ai nhập gì.',
    );
    process.exit(1);
  }

  for (const n of NHOM) {
    await goi('/catalog/product-groups', { code: n.code, name: n.name });
  }
  console.log(`  nhóm sản phẩm: ${NHOM.length}`);

  /*
   * HÔM NAY theo giờ VIỆT NAM, không theo UTC.
   *
   * `new Date().toISOString().slice(0, 10)` ở đây sẽ nạp vào bản chạy thử của
   * khách hàng một ngày hiệu lực LỆCH MỘT NGÀY mỗi lần chạy trong khoảng 00:00
   * tới 07:00 giờ Việt Nam — và không ai đọc lại con số ấy để mà phát hiện.
   * `0208b` thêm một ca quét cấm lối viết kia trong cả `scripts/`.
   */
  const homNay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );

  for (const q of QUY_DINH_CK) {
    await goi('/catalog/discount-rules', { ...q, effectiveFrom: homNay });
  }
  console.log(`  quy định chiết khấu: ${QUY_DINH_CK.length}`);

  for (const p of SAN_PHAM) {
    // MỘT lượt gọi: từ `0123` giá là trường bắt buộc của lượt tạo, và nó áp
    // dụng từ hôm nay — đúng thứ bộ nạp này vẫn làm bằng hai bước.
    await goi<{ id: string }>('/catalog/products', {
      code: p.code,
      name: p.name,
      groupCode: p.nhom,
      price: String(p.gia),
    });
  }
  console.log(`  sản phẩm kèm giá: ${SAN_PHAM.length}`);


  console.log('');
  console.log('  Xong. Đây là DỮ LIỆU MẪU — sửa hoặc vô hiệu hoá trước khi dùng thật.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
