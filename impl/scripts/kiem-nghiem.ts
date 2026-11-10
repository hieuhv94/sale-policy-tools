/**
 * KIỂM NGHIỆM ĐỦ CHỨC NĂNG trên CHỒNG KIỂM RIÊNG (`0270`).
 *
 * Mỗi lượt cài đầu và mỗi lượt `csbh cap-nhat` dựng một chồng production THỨ HAI từ CÙNG
 * ảnh (`deploy/compose.kiem.yml`, dự án `csbh-kiem`, volume riêng, không mở cổng, thư vào
 * Mailpit), chạy script này với dữ liệu GIẢ, rồi `down -v` xoá sạch — dù xanh hay đỏ. Chồng
 * thật không bao giờ chứa một dòng dữ liệu giả nào.
 *
 * Đi ĐƯỜNG API THẬT qua gateway, đúng như trình duyệt: tài khoản kích hoạt bằng liên kết
 * trong thư, hồ sơ đi đủ mười bước, bản mềm dựng qua Gotenberg, tệp lên MinIO, thông báo
 * qua RabbitMQ, báo cáo qua read-model. Hỏng ở bất kỳ tầng nào là một ca đỏ có tên.
 *
 * TỪ CHỐI CHẠY khi thiếu `CSBH_KIEM_NGHIEM=1` — cờ chỉ khai ở `compose.kiem.yml`, nên script
 * này về mặt cấu hình không chạy được trên chồng thật (và mạng của chồng kiểm không với tới
 * gateway của chồng thật).
 *
 * Đầu ra: mỗi ca một dòng `✔`/`✘`/`–` kèm thời gian, cuối cùng `KIEM_NGHIEM <xanh>/<tổng>`.
 * Mã thoát 0 khi xanh hết. Ca phụ thuộc một ca đã hỏng thì BỎ QUA (–), không đỏ dây chuyền.
 */
import { randomUUID } from 'node:crypto';
import { pdfMau } from './api-khach.js';

if (process.env.CSBH_KIEM_NGHIEM !== '1') {
  console.error('kiem-nghiem: TỪ CHỐI — chỉ chạy trong chồng kiểm nghiệm (CSBH_KIEM_NGHIEM=1).');
  process.exit(2);
}

const GATEWAY = process.env.GATEWAY_URL ?? 'http://gateway:3000';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const ADMIN = process.env.KIEM_ADMIN ?? 'admin';
const ADMIN_MK = process.env.KIEM_ADMIN_MAT_KHAU ?? '';
const MIEN = process.env.KIEM_MIEN_THU ?? 'kiem.test';
const MK = 'KiemNghiem2026x';
const CHO_MS = Number(process.env.KIEM_CHO_MS ?? 60_000);

// --- Khung chạy ca -------------------------------------------------------------

type Ket = 'xanh' | 'do' | 'bo';
const ketQua: { nhom: string; ten: string; ket: Ket; ms: number; loi?: string }[] = [];
const hong = new Set<string>();

/** Chạy một ca. `can`: tên những ca phải xanh trước — một cái hỏng thì ca này bỏ qua. */
async function ca(nhom: string, ten: string, can: string[], fn: () => Promise<void>): Promise<void> {
  const t = Date.now();
  const thieu = can.filter((c) => hong.has(c));
  if (thieu.length) {
    hong.add(ten);
    ketQua.push({ nhom, ten, ket: 'bo', ms: 0, loi: `phụ thuộc: ${thieu.join(', ')}` });
    console.log(`  – [${nhom}] ${ten} — bỏ qua (phụ thuộc ca đã hỏng)`);
    return;
  }
  try {
    await fn();
    ketQua.push({ nhom, ten, ket: 'xanh', ms: Date.now() - t });
    console.log(`  ✔ [${nhom}] ${ten}  (${Date.now() - t} ms)`);
  } catch (e) {
    hong.add(ten);
    const loi = e instanceof Error ? e.message : String(e);
    ketQua.push({ nhom, ten, ket: 'do', ms: Date.now() - t, loi });
    console.log(`  ✘ [${nhom}] ${ten} — ${loi}`);
  }
}

function ky(dk: unknown, cau: string): asserts dk {
  if (!dk) throw new Error(cau);
}

/** Hỏi lại tới khi `fn` trả giá trị truthy — cho những thứ đi qua hàng đợi (thư, read-model). */
async function cho<T>(cau: string, fn: () => Promise<T | undefined | null | false>): Promise<T> {
  const het = Date.now() + CHO_MS;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > het) throw new Error(`hết ${CHO_MS / 1000} giây chờ: ${cau}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// --- Gọi API -------------------------------------------------------------------

const tok: Record<string, string> = {};
const id: Record<string, string> = {};

/** `khoa`: tên dùng trong mã để gọi lại token; `login`: tên đăng nhập thật (mặc định = khoá). */
async function dangNhap(u: string, mk: string, login = u): Promise<{ mustChangePassword: boolean }> {
  const r = await fetch(`${GATEWAY}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password: mk }),
  });
  if (!r.ok) throw new Error(`đăng nhập ${u} → ${r.status} ${await r.text()}`);
  const b = (await r.json()) as { accessToken: string; mustChangePassword: boolean };
  tok[u] = b.accessToken;
  return { mustChangePassword: b.mustChangePassword };
}

async function goiTho(phuongThuc: string, duong: string, ai: string | null, body?: unknown): Promise<Response> {
  return fetch(`${GATEWAY}${duong}`, {
    method: phuongThuc,
    headers: {
      ...(ai ? { authorization: `Bearer ${tok[ai]}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function goi<T>(phuongThuc: string, duong: string, ai: string, body?: unknown): Promise<T> {
  const r = await goiTho(phuongThuc, duong, ai, body);
  if (!r.ok) throw new Error(`${phuongThuc} ${duong} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}

async function guiTep<T>(duong: string, ai: string, ten: string, buf: Buffer, loai: string): Promise<T> {
  const f = new FormData();
  f.append('file', new Blob([buf], { type: loai }), ten);
  const r = await fetch(`${GATEWAY}${duong}&fileName=${encodeURIComponent(ten)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok[ai]}` },
    body: f,
  });
  if (!r.ok) throw new Error(`POST ${duong} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as T;
}

async function taiVe(duong: string, ai: string): Promise<Buffer> {
  const r = await goiTho('GET', duong, ai);
  if (!r.ok) throw new Error(`GET ${duong} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

const dsCua = <T>(x: T[] | { items: T[] }): T[] => (Array.isArray(x) ? x : x.items);

/** Thư mới nhất tới một địa chỉ (Mailpit), hoặc undefined. */
async function thuToi(dia: string, chuaTieuDe?: string): Promise<{ Subject: string; Text: string } | undefined> {
  const ds = ((await (await fetch(`${MAILPIT}/api/v1/messages?limit=500`)).json()) as {
    messages: { ID: string; Subject: string; To: { Address: string }[] }[];
  }).messages;
  const m = ds.find(
    (x) => x.To.some((t) => t.Address.toLowerCase() === dia.toLowerCase()) && (!chuaTieuDe || x.Subject.includes(chuaTieuDe)),
  );
  if (!m) return undefined;
  return (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Subject: string; Text: string };
}

/** Ngày hôm nay theo giờ Việt Nam, `YYYY-MM-DD` — không dựng từ `toISOString` (lệch 7 giờ, `0208`). */
const homNay = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const soNgauNhien = (n: number): string => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

// --- Kịch bản ------------------------------------------------------------------

/*
 * Tên đăng nhập mang HẬU TỐ NGẪU NHIÊN của lượt chạy: chồng kiểm thật lần nào cũng trống, nhưng
 * script chạy lại được trên một CSDL đã có lượt trước (chạy thử trên chồng demo) mà không va tên.
 * Trong mã, tài khoản gọi bằng khoá vai trò (`kn-tdv`…); `ten[k]` là tên đăng nhập thật.
 */
const HAU_TO = soNgauNhien(4);
const NGUOI = [
  { k: 'kn-tdv', role: 'TDV', ten: 'TDV kiểm nghiệm' },
  { k: 'kn-tbp', role: 'TBP', ten: 'TBP kiểm nghiệm' },
  { k: 'kn-kt', role: 'KE_TOAN', ten: 'Kế toán kiểm nghiệm' },
  { k: 'kn-sa', role: 'SALE_ADMIN', ten: 'Sale Admin kiểm nghiệm' },
  { k: 'kn-bld', role: 'BAN_LANH_DAO', ten: 'Ban lãnh đạo kiểm nghiệm' },
] as const;
const tenDN = (k: string): string => `${k}${HAU_TO}`;
const thuCua = (k: string): string => `${tenDN(k)}@${MIEN}`;

const S: { nhom?: string; sp?: string; kh?: string; hs?: string; mauHoSo?: string; mauHD?: string; banMoi?: string } = {};

async function trangThai(hs: string, ai = 'kn-tdv'): Promise<string> {
  return (await goi<{ status: string }>('GET', `/policies/${hs}`, ai)).status;
}

async function buoc(hs: string, hanhDong: string, ai: string, body: Record<string, unknown> = {}, dich?: string) {
  await goi('POST', `/policies/${hs}/actions/${hanhDong}`, ai, body);
  if (dich) {
    const tt = await trangThai(hs, ai === 'kn-bld' ? 'kn-tdv' : ai);
    ky(tt === dich, `${hanhDong}: trạng thái ${tt}, mong đợi ${dich}`);
  }
}

async function main(): Promise<void> {
  console.log(`Kiểm nghiệm qua ${GATEWAY} — dữ liệu giả, chồng kiểm riêng`);

  // === 1. Tài khoản ===========================================================
  await ca('Tài khoản', 'Quản trị đầu tiên đăng nhập và đổi mật khẩu bắt buộc', [], async () => {
    ky(ADMIN_MK, 'thiếu KIEM_ADMIN_MAT_KHAU');
    const u = await dangNhap(ADMIN, ADMIN_MK);
    if (u.mustChangePassword) {
      await goi('POST', '/auth/change-password', ADMIN, { currentPassword: ADMIN_MK, newPassword: MK });
      await dangNhap(ADMIN, MK);
    }
    const me = await goi<{ id: string; role: string }>('GET', '/auth/me', ADMIN);
    ky(me.role === 'QUAN_TRI', `vai trò ${me.role}, mong đợi QUAN_TRI`);
  });

  await ca('Tài khoản', 'Tạo năm tài khoản đủ năm vai trò nghiệp vụ', ['Quản trị đầu tiên đăng nhập và đổi mật khẩu bắt buộc'], async () => {
    for (const n of NGUOI) {
      const r = await goi<{ id: string }>('POST', '/admin/users', ADMIN, {
        username: tenDN(n.k), email: thuCua(n.k), fullName: n.ten, role: n.role,
      });
      id[n.k] = r.id;
    }
  });

  await ca('Tài khoản', 'Thư mời tới hộp thư, kích hoạt bằng liên kết trong thư, đăng nhập được', ['Tạo năm tài khoản đủ năm vai trò nghiệp vụ'], async () => {
    for (const n of NGUOI) {
      const thu = await cho(`thư mời tới ${thuCua(n.k)}`, () => thuToi(thuCua(n.k)));
      const token = /kich-hoat\?token=([^\s"<>]+)/.exec(thu.Text)?.[1];
      ky(token, `thư mời của ${n.k} không có liên kết kích hoạt`);
      await goi('POST', '/auth/activate', ADMIN, { token: decodeURIComponent(token), newPassword: MK });
      await dangNhap(n.k, MK, tenDN(n.k));
    }
  });

  const TK = 'Thư mời tới hộp thư, kích hoạt bằng liên kết trong thư, đăng nhập được';

  // === 2. Danh mục ============================================================
  await ca('Danh mục', 'Nhóm sản phẩm, quy định chiết khấu, sản phẩm kèm giá', [TK], async () => {
    const ma = `KN${soNgauNhien(5)}`;
    await goi('POST', '/catalog/product-groups', ADMIN, { code: `${ma}-NHOM`, name: 'Nhóm kiểm nghiệm' });
    await goi('POST', '/catalog/discount-rules', ADMIN, {
      code: `${ma}-CK`, productGroupCode: `${ma}-NHOM`, customerTypes: [1], thresholdRate2: 1800, effectiveFrom: homNay(),
    });
    const sp = await goi<{ id: string }>('POST', '/catalog/products', ADMIN, {
      code: `${ma}-SP`, name: 'Sản phẩm kiểm nghiệm 900g', groupCode: `${ma}-NHOM`, price: '600000',
    });
    S.nhom = `${ma}-NHOM`;
    S.sp = sp.id;
    const gia = await goi<{ amount?: string }>('GET', `/catalog/products/${sp.id}/current-price?priceType=GIA_BAN_CONG_TY`, ADMIN);
    ky(gia, 'không đọc được giá hiện hành');
  });

  await ca('Danh mục', 'Tải tệp Excel mẫu của danh mục', ['Nhóm sản phẩm, quy định chiết khấu, sản phẩm kèm giá'], async () => {
    const b = await taiVe('/catalog/products/import/mau', ADMIN);
    ky(b.subarray(0, 2).toString('latin1') === 'PK', 'tệp tải về không phải xlsx');
  });

  // === 3. Khách hàng ===========================================================
  await ca('Khách hàng', 'TDV lập khách hàng; mã số thuế trùng bị nhận ra', [TK], async () => {
    const mst = `0${soNgauNhien(9)}`;
    const kh = await goi<{ id: string }>('POST', '/customers', 'kn-tdv', {
      code: `KH-KN${soNgauNhien(5)}`, name: 'Nhà thuốc Kiểm Nghiệm', customerType: 1,
      province: 'Hà Nội', streetWard: 'Số 1 Phố Kiểm, Phường Thử', deliveryAddresses: [],
      ownerName: 'Nguyễn Văn Kiểm', ownerTitle: 'Giám đốc', idNumber: mst, phone: '0912345678',
      debtTerm: 'SAU_NHAN_HANG',
    });
    S.kh = kh.id;
    const kt = await goi<{ trung: boolean }>('GET', `/customers/kiem-tra-mst?mst=${mst}`, 'kn-tdv');
    ky(kt.trung === true, 'kiểm tra MST không nhận ra mã vừa lập');
  });

  await ca('Khách hàng', 'Tải hồ sơ pháp lý lên kho tệp và gắn vào khách hàng', ['TDV lập khách hàng; mã số thuế trùng bị nhận ra'], async () => {
    const t = await guiTep<{ objectKey: string; sizeBytes: string }>(
      `/files?ownerKind=CUSTOMER&ownerId=${S.kh}&purpose=PHAP_LY`, 'kn-tdv', 'giay-dkkd.pdf', pdfMau('Giay DKKD kiem nghiem'), 'application/pdf',
    );
    await goi('POST', `/customers/${S.kh}/documents`, 'kn-tdv', {
      kind: 'GIAY_DKKD', fileName: 'giay-dkkd.pdf', objectKey: t.objectKey, sizeBytes: t.sizeBytes,
    });
  });

  const KH = 'TDV lập khách hàng; mã số thuế trùng bị nhận ra';
  const SP = 'Nhóm sản phẩm, quy định chiết khấu, sản phẩm kèm giá';

  // === 4. Hồ sơ CSBH đi đủ mười bước ===========================================
  await ca('Hồ sơ', 'TDV lập hồ sơ một dòng sản phẩm (Nháp)', [KH, SP], async () => {
    const r = await goi<{ id: string }>('POST', '/policies', 'kn-tdv', {
      customerId: S.kh,
      lines: [{ productId: S.sp, wholesalePrice: '540000', cpbh: ['18000'], ngayApDung: homNay() }],
    });
    S.hs = r.id;
    ky((await trangThai(r.id)) === 'NHAP', 'hồ sơ mới không ở trạng thái Nháp');
  });
  const HS = 'TDV lập hồ sơ một dòng sản phẩm (Nháp)';
  const giao = () => ({ tbpUserId: id['kn-tbp'], keToanUserId: id['kn-kt'] });

  await ca('Hồ sơ', 'Gửi duyệt → TBP trả lại kèm lý do → TDV gửi lại', [HS], async () => {
    await buoc(S.hs!, 'SUBMIT', 'kn-tdv', giao(), 'CHO_TBP_DUYET');
    await buoc(S.hs!, 'TBP_RETURN', 'kn-tbp', { reason: 'Kiểm nghiệm: bổ sung chứng từ' }, 'YEU_CAU_CHINH_SUA');
    await buoc(S.hs!, 'RESUBMIT_AFTER_EDIT', 'kn-tdv', giao(), 'CHO_TBP_DUYET');
  });
  const GUI = 'Gửi duyệt → TBP trả lại kèm lý do → TDV gửi lại';

  await ca('Hồ sơ', 'Thư thông báo luồng duyệt tới đúng người (TBP)', [GUI], async () => {
    await cho(`thư thông báo tới ${thuCua('kn-tbp')}`, async () => {
      const ds = ((await (await fetch(`${MAILPIT}/api/v1/messages?limit=500`)).json()) as {
        messages: { To: { Address: string }[] }[];
      }).messages;
      return ds.filter((m) => m.To.some((t) => t.Address === thuCua('kn-tbp'))).length >= 2; // thư mời + thư luồng
    });
  });

  await ca('Hồ sơ', 'TBP ký → Kế toán tiếp nhận lần 1, chọn Sale Admin', [GUI], async () => {
    await buoc(S.hs!, 'TBP_SIGN', 'kn-tbp', {}, 'CHO_KT_L1');
    await buoc(S.hs!, 'KT_RECEIVE_L1', 'kn-kt', { saleAdminUserId: id['kn-sa'] }, 'SA_DANG_XU_LY');
  });
  const KT1 = 'TBP ký → Kế toán tiếp nhận lần 1, chọn Sale Admin';

  await ca('Hồ sơ', 'Sale Admin dựng bản mềm qua Gotenberg và lưu vào hồ sơ', [KT1], async () => {
    const ds = await goi<{ id: string; loai?: string }[]>('GET', '/policy-templates/available', 'kn-sa');
    const m = ds.find((x) => x.loai === 'HO_SO');
    ky(m, 'không có mẫu hồ sơ đầy đủ nào (mẫu mặc định nạp lúc document khởi động)');
    S.mauHoSo = m.id;
    const pdf = await taiVe(`/policies/${S.hs}/render?mauId=${m.id}`, 'kn-sa');
    ky(pdf.subarray(0, 4).toString('latin1') === '%PDF', 'bản mềm dựng ra không phải PDF');
    const x = await goi<{ fileName: string; objectKey: string; sizeBytes: string }>(
      'POST', `/policies/${S.hs}/render/luu?mauId=${m.id}`, 'kn-sa', {},
    );
    await goi('POST', `/policies/${S.hs}/attachments`, 'kn-sa', { kind: 'BAN_MEM', ...x });
  });

  await ca('Hồ sơ', 'Sale Admin tải bản scan lên và bàn giao', ['Sale Admin dựng bản mềm qua Gotenberg và lưu vào hồ sơ'], async () => {
    const t = await guiTep<{ objectKey: string; sizeBytes: string }>(
      `/files?ownerKind=POLICY&ownerId=${S.hs}&purpose=SCAN`, 'kn-sa', 'ban-cung-da-ky.pdf', pdfMau('Ban cung da ky'), 'application/pdf',
    );
    await goi('POST', `/policies/${S.hs}/attachments`, 'kn-sa', {
      kind: 'SCAN', fileName: 'ban-cung-da-ky.pdf', objectKey: t.objectKey, sizeBytes: t.sizeBytes,
    });
    await buoc(S.hs!, 'SA_HANDOVER', 'kn-sa', {}, 'CHO_KT_L2');
  });
  const BG = 'Sale Admin tải bản scan lên và bàn giao';

  await ca('Hồ sơ', 'Kế toán xuất hợp đồng PDF', [BG], async () => {
    const ds = await goi<{ id: string }[]>('GET', '/contract-templates/available', 'kn-kt');
    ky(ds.length > 0, 'không có mẫu hợp đồng nào');
    const pdf = await taiVe(`/policies/${S.hs}/contract.pdf?mauId=${ds[0]!.id}`, 'kn-kt');
    ky(pdf.subarray(0, 4).toString('latin1') === '%PDF', 'hợp đồng xuất ra không phải PDF');
  });

  await ca('Hồ sơ', 'Kế toán duyệt bản cứng → hồ sơ Đang có hiệu lực', [BG], async () => {
    await buoc(S.hs!, 'KT_RECEIVE_L2', 'kn-kt', {}, 'DANG_CO_HIEU_LUC');
  });
  const HL = 'Kế toán duyệt bản cứng → hồ sơ Đang có hiệu lực';

  await ca('Hồ sơ', 'Lập phiên bản mới từ CSBH đang hiệu lực, rồi xoá bản Nháp ấy', [HL], async () => {
    const r = await goi<{ id: string }>('POST', '/policies', 'kn-tdv', { customerId: S.kh, mode: 'NEW_VERSION', lines: [] });
    S.banMoi = r.id;
    ky((await trangThai(r.id)) === 'NHAP', 'phiên bản mới không ở trạng thái Nháp');
    await goi('DELETE', `/policies/${r.id}`, 'kn-tdv', {});
  });

  // === 5. Bình luận và thông báo ===============================================
  await ca('Bình luận', 'TDV bình luận nhắc tên Kế toán → Kế toán có thông báo trên chuông', [KT1], async () => {
    await goi('POST', `/policies/${S.hs}/binh-luan`, 'kn-tdv', {
      maGui: randomUUID(), noiDung: `Nhờ @{${id['kn-kt']}} kiểm lại chứng từ (kiểm nghiệm)`,
    });
    await cho('thông báo bình luận của Kế toán', async () => {
      const ds = dsCua(await goi<{ binhLuanId?: string | null }[] | { items: { binhLuanId?: string | null }[] }>(
        'GET', '/notifications/cua-toi?limit=50', 'kn-kt',
      ));
      return ds.some((x) => x.binhLuanId);
    });
    const dem = await goi<{ soViecChuaDoc: number; soTinChuaDoc: number }>('GET', '/notifications/cua-toi/dem', 'kn-kt');
    ky(typeof dem.soViecChuaDoc === 'number', 'đếm chuông trả sai hình dạng');
  });

  // === 6. Phân quyền ===========================================================
  await ca('Phân quyền', 'Ban lãnh đạo không lập được hồ sơ; TDV không vào được quản trị; không đăng nhập thì 401', [HS], async () => {
    const a = await goiTho('POST', '/policies', 'kn-bld', { customerId: S.kh, lines: [] });
    ky(a.status === 403, `Ban lãnh đạo lập hồ sơ → ${a.status}, mong đợi 403`);
    const b = await goiTho('GET', '/admin/users', 'kn-tdv');
    ky(b.status === 403, `TDV xem danh sách người dùng → ${b.status}, mong đợi 403`);
    const c = await goiTho('GET', `/policies/${S.hs}`, null);
    ky(c.status === 401, `không đăng nhập → ${c.status}, mong đợi 401`);
  });

  // === 7. Báo cáo, nhật ký, vận hành ===========================================
  await ca('Báo cáo', 'Báo cáo hồ sơ (read-model) thấy hồ sơ vừa có hiệu lực', [HL], async () => {
    await cho('read-model báo cáo cập nhật', async () => {
      const ds = dsCua(await goi<{ id?: string; policyId?: string }[] | { items: { id?: string; policyId?: string }[] }>(
        'GET', '/reports/policies?limit=100', 'kn-bld',
      ));
      return ds.some((x) => (x.id ?? x.policyId) === S.hs);
    });
    await goi('GET', '/reports/thong-ke?ky=thang', 'kn-bld');
  });

  await ca('Nhật ký', 'Nhật ký kiểm toán có dòng của lượt vừa chạy', [HS], async () => {
    await cho('nhật ký kiểm toán có dòng', async () =>
      dsCua(await goi<unknown[] | { items: unknown[] }>('GET', '/audit/entries?limit=5', ADMIN)).length > 0,
    );
  });

  await ca('Vận hành', 'Trang Vận hành trả lời: sức khoẻ, ổ đĩa, lịch tự động', [TK], async () => {
    await goi('GET', '/van-hanh/suc-khoe', ADMIN);
    await goi('GET', '/van-hanh/o-dia', ADMIN);
    await goi('GET', '/van-hanh/lich', ADMIN);
  });

  // === Tổng kết ================================================================
  const xanh = ketQua.filter((k) => k.ket === 'xanh').length;
  console.log('');
  console.log(`KIEM_NGHIEM ${xanh}/${ketQua.length}`);
  for (const k of ketQua.filter((x) => x.ket !== 'xanh')) {
    console.log(`  ${k.ket === 'do' ? 'ĐỎ ' : 'BỎ QUA'} [${k.nhom}] ${k.ten}: ${k.loi}`);
  }
  process.exit(xanh === ketQua.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`kiem-nghiem: lỗi ngoài kịch bản — ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
