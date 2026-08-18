/**
 * Dữ liệu mẫu cho bản demo: thật, phủ đủ trạng thái đáng xem, và ĐỦ NHIỀU.
 *
 * Vì sao cần script riêng thay vì dùng luôn dữ liệu có sẵn: bản demo và bộ test
 * dùng chung một Postgres, mà bộ test để lại hàng nghìn bản ghi `ZZ*` — mở màn
 * hình khách hàng ra là 5.000 dòng vô nghĩa. Không ai thử được gì trên đó.
 *
 * BA QUYẾT ĐỊNH:
 *
 * 1. **Xoá sạch dữ liệu nghiệp vụ trước khi nạp.** Không cộng thêm vào đống cũ.
 *    Chỉ xoá `cat/cus/pol/rpt/doc/ntf` — KHÔNG đụng tài khoản (`idn`), vì tài
 *    khoản do `seed.ts` lo và người dùng có thể vừa đổi mật khẩu.
 *
 * 2. **Nạp qua API THẬT, không INSERT thẳng.** Chèn SQL nhanh hơn nhưng đi vòng
 *    qua máy trạng thái, qua việc đóng băng giá, qua phép tính chiết khấu — và
 *    dữ liệu demo sẽ ở những trạng thái mà phần mềm không bao giờ tạo ra được.
 *    Đi qua API thì dữ liệu demo đúng theo đúng nghĩa mà phần mềm hiểu.
 *
 * 3. **PHẦN ĐẦU viết tay, PHẦN ĐUÔI sinh ra.** Mỗi màn hình danh sách phải vượt
 *    20 dòng thì mới thử được phân trang (`0030`), mà 20 dòng viết tay cho mười
 *    màn hình là 200 dòng dữ liệu không ai đọc và không ai giữ đúng được.
 *
 *    Nên: những ca ĐÁNG NHÌN vẫn viết tay và vẫn đứng đầu danh sách — hồ sơ bị
 *    trả lại kèm lý do, dòng vượt ngưỡng nằm cạnh dòng dưới ngưỡng, hai khách
 *    thuộc hai TDV khác nhau. Phần sinh ra chỉ để **có khối lượng**, và nó xếp
 *    sau. Người mở demo lần đầu vẫn gặp đúng những ca đã chọn cho họ.
 *
 * MỘT NGOẠI LỆ CỦA QUYẾT ĐỊNH 2: thư hỏng (`ntf.dead_letter`). Không API nào
 * tạo ra nó — nó là thứ sinh ra khi consumer gửi thư thất bại đủ số lần. Chỉ
 * chỗ này chèn thẳng SQL, và payload là sự kiện THẬT của hồ sơ thật, để nút
 * "Gửi lại" trên màn hình Quản trị chạy được chứ không báo lỗi.
 */
import { Client } from 'pg';
import { makeDocx, para } from '../services/document/src/contracts/docx.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo: TỪ CHỐI chạy ở môi trường production');
  process.exit(1);
}

const GATEWAY = process.env.GATEWAY_URL ?? 'http://gateway:3000';
const MAT_KHAU = 'Test@1234';

/**
 * Vừa đủ vượt một trang.
 *
 * Cỡ trang của giao diện là 20 (`MOI_TRANG` trong `apps/web/src/lib/phan-trang.ts`).
 * 21 là con số nhỏ nhất chứng minh được thanh phân trang hiện ra và trang 2 có
 * đúng một dòng — vừa đủ để thử, không nhiều tới mức bản demo mất tính đọc được.
 */
const QUA_MOT_TRANG = 21;

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

/**
 * Gửi multipart. KHÔNG đặt `content-type` bằng tay: `undici` tự đặt kèm
 * `boundary`, còn đặt tay là gửi một boundary không khớp với thân thư và máy chủ
 * đọc ra một form rỗng.
 */
async function guiTep<T>(duong: string, ai: string, form: FormData): Promise<T> {
  const r = await fetch(`${GATEWAY}${duong}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok[ai]}` },
    body: form,
  });
  if (!r.ok) throw new Error(`POST ${duong} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

/**
 * Người được phân công ở ba bước bắt buộc chọn (`0031`).
 *
 * Điền ở đây một lần thay vì rải ra ~140 chỗ gọi: bộ nạp không quan tâm ai duyệt,
 * nó chỉ cần hồ sơ đi hết luồng. Ca nào cần người khác thì truyền trong `body` —
 * nó nằm sau nên ghi đè.
 */
const idNguoiDung: Record<string, string> = {};

const phanCong = (hanhDong: string): Record<string, string> => {
  if (hanhDong === 'SUBMIT' || hanhDong === 'RESUBMIT_AFTER_EDIT') {
    return { tbpUserId: idNguoiDung['tbp01']!, keToanUserId: idNguoiDung['kt01']! };
  }
  if (hanhDong === 'KT_RECEIVE_L1') return { saleAdminUserId: idNguoiDung['sa01']! };
  return {};
};

const act = (id: string, hanhDong: string, ai: string, body: Record<string, unknown> = {}) =>
  goi(`/policies/${id}/actions/${hanhDong}`, ai, { ...phanCong(hanhDong), ...body });

// --- Danh mục -----------------------------------------------------------------

/**
 * Nhóm sản phẩm. Hai nhóm đầu là hai nhóm của các ca viết tay bên dưới; phần còn
 * lại là dải sản phẩm thật của một công ty dinh dưỡng, đủ để bảng nhóm vượt một
 * trang.
 *
 * `nguong` là ngưỡng chiết khấu của nhóm, đơn vị **phần vạn** (1500 = 15,00%) —
 * mỗi nhóm sinh ra đúng một quy định `CK-<mã nhóm>`. Để ngưỡng nằm cạnh nhóm chứ
 * không ở một bảng thứ hai: hai bảng song song là hai bảng lệch nhau.
 */
const NHOM = [
  { code: 'SUA-BOT', name: 'Sữa bột dinh dưỡng', nguong: 1500 },
  { code: 'DINH-DUONG-Y-HOC', name: 'Dinh dưỡng y học', nguong: 1200 },
  { code: 'SUA-NUOC', name: 'Sữa nước pha sẵn', nguong: 1400 },
  { code: 'BOT-AN-DAM', name: 'Bột ăn dặm', nguong: 1600 },
  { code: 'NGU-COC', name: 'Ngũ cốc dinh dưỡng', nguong: 1700 },
  { code: 'SUA-NON', name: 'Sữa non colostrum', nguong: 1100 },
  { code: 'CANXI', name: 'Bổ sung canxi', nguong: 1500 },
  { code: 'TIEU-DUONG', name: 'Dinh dưỡng cho người tiểu đường', nguong: 1000 },
  { code: 'THAN', name: 'Dinh dưỡng cho người bệnh thận', nguong: 1000 },
  { code: 'GAN', name: 'Dinh dưỡng cho người bệnh gan', nguong: 1000 },
  { code: 'UNG-BUOU', name: 'Dinh dưỡng cho người bệnh ung bướu', nguong: 900 },
  { code: 'HAU-PHAU', name: 'Dinh dưỡng hậu phẫu', nguong: 950 },
  { code: 'BA-BAU', name: 'Sữa cho phụ nữ mang thai', nguong: 1450 },
  { code: 'SINH-NON', name: 'Dinh dưỡng cho trẻ sinh non', nguong: 800 },
  { code: 'CAO-TUOI', name: 'Dinh dưỡng cho người cao tuổi', nguong: 1350 },
  { code: 'TANG-CAN', name: 'Sữa tăng cân', nguong: 1650 },
  { code: 'GIAM-CAN', name: 'Dinh dưỡng kiểm soát cân nặng', nguong: 1600 },
  { code: 'THE-THAO', name: 'Dinh dưỡng thể thao', nguong: 1800 },
  { code: 'VITAMIN', name: 'Vitamin và khoáng chất', nguong: 2000 },
  { code: 'MEN-VI-SINH', name: 'Men vi sinh', nguong: 1900 },
  { code: 'DAU-AN', name: 'Dầu ăn dinh dưỡng', nguong: 2200 },
  { code: 'CHAO', name: 'Cháo dinh dưỡng đóng gói', nguong: 2100 },
  { code: 'THANH-DD', name: 'Thanh dinh dưỡng', nguong: 2300 },
  { code: 'NUOC-UONG', name: 'Nước uống dinh dưỡng', nguong: 2400 },
];

/**
 * Giá bán Công ty là số nguyên đồng.
 *
 * Sáu sản phẩm đầu là sáu sản phẩm của các ca viết tay — đừng đổi giá của chúng,
 * mọi con số chiết khấu trong chú thích bên dưới tính theo đúng những giá này.
 */
const SAN_PHAM = [
  { code: 'NC-GOLD-900', name: 'Nutricare Gold 900g', nhom: 'SUA-BOT', gia: 615_000 },
  { code: 'NC-GOLD-400', name: 'Nutricare Gold 400g', nhom: 'SUA-BOT', gia: 315_000 },
  { code: 'NC-BONE-900', name: 'Nutricare Bone 900g', nhom: 'SUA-BOT', gia: 585_000 },
  { code: 'NC-META-900', name: 'Metacare Gold 900g', nhom: 'SUA-BOT', gia: 495_000 },
  { code: 'NC-LEAN-400', name: 'Leanmax Rice 400g', nhom: 'DINH-DUONG-Y-HOC', gia: 275_000 },
  { code: 'NC-CANXI-400', name: 'Nutricare Canxi 400g', nhom: 'DINH-DUONG-Y-HOC', gia: 325_000 },

  { code: 'NC-NUOC-180', name: 'Nutricare Gold nước 180ml', nhom: 'SUA-NUOC', gia: 32_000 },
  { code: 'NC-NUOC-220', name: 'Metacare nước 220ml', nhom: 'SUA-NUOC', gia: 38_000 },
  { code: 'NC-DAM-200', name: 'Bột ăn dặm Metacare 200g', nhom: 'BOT-AN-DAM', gia: 78_000 },
  { code: 'NC-DAM-350', name: 'Bột ăn dặm Metacare 350g', nhom: 'BOT-AN-DAM', gia: 125_000 },
  { code: 'NC-COC-500', name: 'Ngũ cốc Nutricare 500g', nhom: 'NGU-COC', gia: 145_000 },
  { code: 'NC-NON-60', name: 'Colos Care sữa non 60g', nhom: 'SUA-NON', gia: 265_000 },
  { code: 'NC-NON-120', name: 'Colos Care sữa non 120g', nhom: 'SUA-NON', gia: 485_000 },
  { code: 'NC-CAL-900', name: 'Nutricare Canxi 900g', nhom: 'CANXI', gia: 645_000 },
  { code: 'NC-DIA-400', name: 'Glucare Gold 400g', nhom: 'TIEU-DUONG', gia: 355_000 },
  { code: 'NC-DIA-850', name: 'Glucare Gold 850g', nhom: 'TIEU-DUONG', gia: 685_000 },
  { code: 'NC-REN-400', name: 'Leanmax Rena 400g', nhom: 'THAN', gia: 395_000 },
  { code: 'NC-HEP-400', name: 'Leanmax Hepa 400g', nhom: 'GAN', gia: 415_000 },
  { code: 'NC-CAN-400', name: 'Leanmax Cany 400g', nhom: 'UNG-BUOU', gia: 465_000 },
  { code: 'NC-SUR-400', name: 'Leanmax Surgery 400g', nhom: 'HAU-PHAU', gia: 445_000 },
  { code: 'NC-MOM-900', name: 'Metamom 900g', nhom: 'BA-BAU', gia: 525_000 },
  { code: 'NC-MOM-400', name: 'Metamom 400g', nhom: 'BA-BAU', gia: 275_000 },
  { code: 'NC-PRE-400', name: 'Metacare Preterm 400g', nhom: 'SINH-NON', gia: 585_000 },
  { code: 'NC-OLD-900', name: 'Nutricare Gold Plus 900g', nhom: 'CAO-TUOI', gia: 635_000 },
  { code: 'NC-OLD-400', name: 'Nutricare Gold Plus 400g', nhom: 'CAO-TUOI', gia: 335_000 },
  { code: 'NC-WGN-900', name: 'Weight Gain 900g', nhom: 'TANG-CAN', gia: 555_000 },
  { code: 'NC-SLM-400', name: 'Leanmax Ligos 400g', nhom: 'GIAM-CAN', gia: 385_000 },
  { code: 'NC-SPT-500', name: 'Nutri Sport Whey 500g', nhom: 'THE-THAO', gia: 725_000 },
  { code: 'NC-VIT-30', name: 'Nutri Multi Vitamin 30 viên', nhom: 'VITAMIN', gia: 185_000 },
  { code: 'NC-VIT-60', name: 'Nutri Multi Vitamin 60 viên', nhom: 'VITAMIN', gia: 335_000 },
  { code: 'NC-PRO-20', name: 'Nutri Probiotic 20 gói', nhom: 'MEN-VI-SINH', gia: 245_000 },
  { code: 'NC-OIL-250', name: 'Dầu óc chó Nutricare 250ml', nhom: 'DAU-AN', gia: 195_000 },
  { code: 'NC-CHAO-240', name: 'Cháo dinh dưỡng 240g', nhom: 'CHAO', gia: 28_000 },
  { code: 'NC-BAR-35', name: 'Thanh dinh dưỡng 35g', nhom: 'THANH-DD', gia: 22_000 },
  { code: 'NC-DRK-330', name: 'Nước uống dinh dưỡng 330ml', nhom: 'NUOC-UONG', gia: 26_000 },
];

/**
 * Ngưỡng chiết khấu — nguồn DUY NHẤT, khớp theo nhóm sản phẩm × loại khách hàng
 * (`0025`, `0026`).
 *
 * Ba dòng viết tay ở đầu là để chồng demo bày ra được chính cái luật khó nhất của
 * màn hình này: dòng CỤ THỂ HƠN thắng. Khách loại 1 mua sữa bột lấy 18% từ
 * `CK-SUA-L1`, khách loại 3 mua cùng sản phẩm ấy lấy 15% từ `CK-SUA-BOT` — hai hồ
 * sơ cạnh nhau, hai ngưỡng khác nhau, và cột QĐCK nói ra vì sao.
 *
 * Mỗi nhóm còn lại sinh thêm một quy định chung cho mọi loại khách.
 */
const QUY_DINH_CK = [
  { code: 'CK-SUA-L1', productGroupCode: 'SUA-BOT', customerType: 1, thresholdRate2: 1800 },
  { code: 'CK-SUA-L2', productGroupCode: 'SUA-BOT', customerType: 2, thresholdRate2: 2000 },
  {
    code: 'CK-YHOC-L1',
    productGroupCode: 'DINH-DUONG-Y-HOC',
    customerType: 1,
    thresholdRate2: 1400,
  },
  ...NHOM.map((n) => ({ code: `CK-${n.code}`, productGroupCode: n.code, thresholdRate2: n.nguong })),
];

type KhachMau = {
  code: string;
  name: string;
  customerType: number;
  registeredAddress: string;
  ownerName: string;
  ownerTitle: string;
  idNumber: string;
  debt: string;
};

/** Bốn khách viết tay — phủ đủ ba loại khách, và `KH-0002` thuộc `tdv02`. */
const KHACH_TAY: KhachMau[] = [
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

/** `[tên, loại khách, địa chỉ đăng ký, người đại diện, chức danh, công nợ]`. */
const KHACH_THEM: [string, number, string, string, string, string][] = [
  ['Nhà thuốc Thanh Bình', 1, 'Số 21 Trần Phú, Hà Đông, Hà Nội', 'Nguyễn Thanh Bình', 'Chủ nhà thuốc', '2100000'],
  ['Nhà thuốc An Khang', 1, 'Số 145 Cầu Giấy, Cầu Giấy, Hà Nội', 'Đỗ Thị An', 'Chủ nhà thuốc', '0'],
  ['Nhà thuốc Phúc Lộc', 1, 'Số 9 Lê Lợi, TP Vinh, Nghệ An', 'Trần Phúc Lộc', 'Chủ nhà thuốc', '860000'],
  ['Nhà thuốc Bảo Ngọc', 1, 'Số 32 Hai Bà Trưng, TP Huế, Thừa Thiên Huế', 'Lê Bảo Ngọc', 'Chủ nhà thuốc', '5400000'],
  ['Nhà thuốc Hương Sen', 1, 'Số 88 Nguyễn Trãi, Thanh Xuân, Hà Nội', 'Vũ Thị Hương', 'Chủ nhà thuốc', '0'],
  ['Nhà thuốc Tâm Đức', 1, 'Số 4 Quang Trung, TP Nam Định, Nam Định', 'Phạm Tâm Đức', 'Chủ nhà thuốc', '1250000'],
  ['Nhà thuốc Việt Nhật', 1, 'Số 60 Lạch Tray, Ngô Quyền, Hải Phòng', 'Hoàng Việt Anh', 'Chủ nhà thuốc', '3300000'],
  ['Quầy thuốc Kim Ngân', 1, 'Số 7 Hùng Vương, TP Việt Trì, Phú Thọ', 'Ngô Kim Ngân', 'Chủ quầy thuốc', '0'],
  ['Công ty CP Dược phẩm Đại Việt', 2, 'Số 210 Nguyễn Thị Minh Khai, Quận 3, TP Hồ Chí Minh', 'Trịnh Đại Nghĩa', 'Tổng giám đốc', '245000000'],
  ['Công ty TNHH Dược Tân Á', 2, 'Số 18 Điện Biên Phủ, Bình Thạnh, TP Hồ Chí Minh', 'Bùi Tân Á', 'Giám đốc', '92000000'],
  ['Công ty TNHH Thương mại Nam Dược', 2, 'Số 3 Trường Chinh, Đống Đa, Hà Nội', 'Dương Nam Sơn', 'Giám đốc', '58000000'],
  ['Công ty CP Dược Miền Trung', 2, 'Số 44 Ngô Quyền, Sơn Trà, Đà Nẵng', 'Cao Minh Trung', 'Giám đốc', '134000000'],
  ['Công ty TNHH Dược phẩm Sông Hồng', 2, 'Số 27 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', 'Hà Thị Hồng', 'Giám đốc', '0'],
  ['Công ty CP Y tế Tây Đô', 2, 'Số 5 Nguyễn Văn Cừ, Ninh Kiều, Cần Thơ', 'Mai Tây Đô', 'Phó giám đốc', '76500000'],
  ['Công ty TNHH Dược Cao Nguyên', 2, 'Số 91 Phan Đình Phùng, TP Buôn Ma Thuột, Đắk Lắk', 'Lý Cao Sơn', 'Giám đốc', '31000000'],
  ['Chuỗi nhà thuốc Sức Khoẻ Vàng', 2, 'Số 300 Xã Đàn, Đống Đa, Hà Nội', 'Nguyễn Hoàng Giang', 'Giám đốc chuỗi', '188000000'],
  ['Khoa Dinh dưỡng — Bệnh viện Chợ Rẫy', 3, 'Số 201B Nguyễn Chí Thanh, Quận 5, TP Hồ Chí Minh', 'Trần Quốc Bảo', 'Trưởng khoa', '0'],
  ['Khoa Dinh dưỡng — Bệnh viện Việt Đức', 3, 'Số 40 Tràng Thi, Hoàn Kiếm, Hà Nội', 'Lê Thị Kim Chi', 'Trưởng khoa', '0'],
  ['Khoa Nhi — Bệnh viện Đa khoa Thanh Hoá', 3, 'Số 181 Hải Thượng Lãn Ông, TP Thanh Hoá', 'Phạm Văn Toàn', 'Trưởng khoa', '0'],
  ['Khoa Dinh dưỡng — Bệnh viện Đà Nẵng', 3, 'Số 124 Hải Phòng, Thanh Khê, Đà Nẵng', 'Nguyễn Thị Diệu', 'Phó trưởng khoa', '0'],
  ['Khoa Ung bướu — Bệnh viện K Tân Triều', 3, 'Số 30 Cầu Bươu, Thanh Trì, Hà Nội', 'Đặng Hoàng Nam', 'Trưởng khoa', '0'],
  ['Khoa Hồi sức — Bệnh viện Bình Dân', 3, 'Số 371 Điện Biên Phủ, Quận 3, TP Hồ Chí Minh', 'Vũ Đình Khoa', 'Trưởng khoa', '0'],
  ['Trung tâm Y tế huyện Đông Anh', 3, 'Thị trấn Đông Anh, Đông Anh, Hà Nội', 'Trần Thị Vân', 'Giám đốc trung tâm', '0'],
  ['Trung tâm Dinh dưỡng TP Hồ Chí Minh', 3, 'Số 180 Lê Văn Sỹ, Phú Nhuận, TP Hồ Chí Minh', 'Lương Minh Khôi', 'Giám đốc', '0'],
];

/** MST 10 chữ số, sinh theo thứ tự để không trùng và vẫn hợp lệ (CUST-04). */
const mst = (i: number): string => String(3_000_000_000 + i * 137);

const KHACH: KhachMau[] = [
  ...KHACH_TAY,
  ...KHACH_THEM.map(([name, loai, diaChi, chu, chucDanh, congNo], i) => ({
    code: `KH-${String(i + 5).padStart(4, '0')}`,
    name,
    customerType: loai,
    registeredAddress: diaChi,
    ownerName: chu,
    ownerTitle: chucDanh,
    idNumber: mst(i + 5),
    debt: congNo,
  })),
];

/** Mẫu hợp đồng — tên phải khác nhau để nhìn ra thứ tự trang khi phân trang. */
const MAU_HOP_DONG = [
  'Hợp đồng phân phối — nhà thuốc lẻ',
  'Hợp đồng phân phối — nhà thuốc chuỗi',
  'Hợp đồng phân phối — công ty dược',
  'Hợp đồng phân phối — bệnh viện',
  'Hợp đồng nguyên tắc năm 2026',
  'Hợp đồng nguyên tắc năm 2025',
  'Phụ lục điều chỉnh giá',
  'Phụ lục bổ sung sản phẩm',
  'Phụ lục gia hạn công nợ',
  'Biên bản bàn giao hàng mẫu',
  'Biên bản đối chiếu công nợ',
  'Biên bản thanh lý hợp đồng',
  'Thoả thuận trưng bày sản phẩm',
  'Thoả thuận hỗ trợ truyền thông',
  'Cam kết giá bán lẻ',
  'Cam kết không bán phá giá',
  'Đơn đề nghị mở mã khách hàng',
  'Đơn đề nghị điều chỉnh chiết khấu',
  'Hợp đồng phân phối khu vực miền Bắc',
  'Hợp đồng phân phối khu vực miền Trung',
  'Hợp đồng phân phối khu vực miền Nam',
  'Hợp đồng phân phối kênh bệnh viện',
];

/**
 * Tài khoản thêm — **chỉ cho bản demo**, để danh sách Người dùng vượt 20 dòng.
 *
 * Không còn liên kết quản lý nào (`0031`): tài khoản chỉ có tên, email và vai
 * trò. Trước đây khối này phải khai một nhánh tổ chức tách hẳn để khỏi làm đỏ
 * bảy ca kiểm thử phân quyền — không còn cây thì không còn nhánh nào để tách.
 *
 * Vẫn KHÔNG nằm trong `seed.ts`: tệp ấy là kho tài khoản của bộ test, không
 * phải chỗ chứa dữ liệu trình diễn.
 *
 * Tên có dấu là có chủ ý: ô tìm kiếm trong màn hình Người dùng khớp bỏ dấu, mà
 * mười tài khoản gốc viết không dấu nên không bao giờ chạm tới nhánh mã ấy.
 */
const NGUOI_DUNG_THEM: { u: string; ten: string; role: string }[] = [
  { u: 'sa02', ten: 'Đặng Thu Hằng', role: 'SALE_ADMIN' },
  { u: 'tbp03', ten: 'Lý Trường Giang', role: 'TBP' },
  { u: 'kt03', ten: 'Vũ Thị Bích Ngọc', role: 'KE_TOAN' },
  { u: 'kt04', ten: 'Hoàng Minh Tuấn', role: 'KE_TOAN' },
  { u: 'tdv04', ten: 'Nguyễn Văn Cường', role: 'TDV' },
  { u: 'tdv05', ten: 'Trần Thị Kim Oanh', role: 'TDV' },
  { u: 'tdv06', ten: 'Phạm Đức Anh', role: 'TDV' },
  { u: 'tdv07', ten: 'Lê Thị Hồng Nhung', role: 'TDV' },
  { u: 'tdv08', ten: 'Đỗ Quang Huy', role: 'TDV' },
  { u: 'tdv09', ten: 'Bùi Thanh Tùng', role: 'TDV' },
  { u: 'tdv10', ten: 'Ngô Thị Lan Anh', role: 'TDV' },
  { u: 'tdv11', ten: 'Dương Hữu Phước', role: 'TDV' },
  { u: 'tdv12', ten: 'Trịnh Thị Mai', role: 'TDV' },
  { u: 'tdv13', ten: 'Cao Bá Lộc', role: 'TDV' },
  { u: 'tdv14', ten: 'Hà Thị Thuỳ Dương', role: 'TDV' },
  { u: 'tdv15', ten: 'Mai Xuân Trường', role: 'TDV' },
];

const SO_THU_HONG = 24;

/**
 * Hồ sơ SẮP quá hạn và ĐÃ quá hạn (`0051`).
 *
 * Bốn bước chờ đều có mặt ở cả hai nhóm, nên mỗi vai trò trong luồng đăng nhập
 * vào đều thấy thẻ *Sắp quá hạn* và *Quá hạn* khác 0 — chứ không phải chỉ một
 * vai trò may mắn.
 *
 * `conLaiGio` là số giờ còn tới hạn: dưới 24 thì hồ sơ vào thẻ *Sắp quá hạn*, và
 * vòng quét SLA gửi luôn thư nhắc nên `make demo-mail` cũng có cái để xem.
 *
 * `quaHanNgay` là số ngày ĐÃ quá hạn. Giữ dưới 3 — đúng 3 ngày là sla-worker tự
 * chuyển *Đã xoá* (`0047`), và một bản demo mà dữ liệu tự biến mất sau vài phút
 * là một bản demo khó tin.
 */
const SAP_QUA_HAN: { buoc: string; conLaiGio: number }[] = [
  { buoc: 'CHO_TBP_DUYET', conLaiGio: 3 },
  { buoc: 'CHO_TBP_DUYET', conLaiGio: 11 },
  { buoc: 'CHO_KT_L1', conLaiGio: 6 },
  { buoc: 'SA_DANG_XU_LY', conLaiGio: 20 },
  { buoc: 'CHO_KT_L2', conLaiGio: 9 },
];

const DA_QUA_HAN: { buoc: string; quaHanNgay: number }[] = [
  { buoc: 'CHO_TBP_DUYET', quaHanNgay: 2 },
  { buoc: 'CHO_KT_L1', quaHanNgay: 1 },
  { buoc: 'SA_DANG_XU_LY', quaHanNgay: 2 },
  { buoc: 'CHO_KT_L2', quaHanNgay: 1 },
];

/** Bước chờ → vai trò phải xử lý. Người nhận thư quá hạn, cùng bảng với sla-worker. */
const CHU_BUOC: Record<string, string> = {
  CHO_TBP_DUYET: 'TBP',
  CHO_KT_L1: 'KE_TOAN',
  SA_DANG_XU_LY: 'SALE_ADMIN',
  CHO_KT_L2: 'KE_TOAN',
};

/** Bước chờ → mã bước lưu trong `pending_step`. Bảng của muc 3. */
const MA_BUOC: Record<string, string> = {
  CHO_TBP_DUYET: 'B4_TBP_DUYET',
  CHO_KT_L1: 'B6_KT_L1',
  SA_DANG_XU_LY: 'B8_SA_XU_LY',
  CHO_KT_L2: 'B10_KT_L2',
};

const LOI_THU = [
  'connect ECONNREFUSED 172.20.0.9:1025',
  'Greeting never received',
  'Message failed: 450 4.7.1 Client host rejected: cannot find your hostname',
  'socket hang up',
  'Message failed: 550 5.1.1 Recipient address rejected: User unknown',
];

const LY_DO_TRA_LAI =
  'Chiết khấu dòng Nutricare Bone 900g vượt ngưỡng quy định. ' +
  'Đề nghị điều chỉnh giá bán buôn hoặc bổ sung phê duyệt ngoại lệ.';

// --- Kết nối thẳng CSDL -------------------------------------------------------

function moKetNoi(): Client {
  return new Client({
    host: process.env.PGHOST ?? 'postgres',
    database: process.env.PGDATABASE ?? 'csbh',
    user: process.env.PG_SUPERUSER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
  });
}

async function xoaDuLieuCu(): Promise<void> {
  const db = moKetNoi();
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
      DELETE FROM pol.policy_impact;
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

/**
 * Chèn thẳng SQL — ngoại lệ DUY NHẤT của "nạp qua API thật".
 *
 * Không có API nào tạo được thư hỏng, và đúng như vậy: thư hỏng là hậu quả của
 * một lần gửi thất bại, không phải một thứ ai đó khai báo. Muốn có nó một cách
 * "thật" thì phải tắt SMTP giữa lúc nạp rồi bật lại — một thủ tục mong manh hơn
 * nhiều so với việc chèn thẳng và nói rõ ở đây là đã chèn thẳng.
 *
 * Payload lấy từ chính những hồ sơ vừa lập, đúng hình dạng mà consumer đọc
 * (`recipients` + `tdvUserId`), nên nút **Gửi lại** trên màn hình Quản trị gửi
 * được thư thật và tự đánh dấu đã xử lý.
 */
async function namThuHong(): Promise<void> {
  const db = moKetNoi();
  await db.connect();
  try {
    await db.query(
      `INSERT INTO ntf.dead_letter (event_id, routing_key, payload, attempts, last_error, failed_at)
       SELECT gen_random_uuid(),
              'policy.submit',
              jsonb_build_object(
                'policyId', t.id, 'policyCode', t.code,
                'customerId', t.customer_id, 'customerCode', t.ma_kh, 'customerName', t.ten_kh,
                'tdvUserId', t.tdv_user_id,
                'action', 'SUBMIT', 'fromStatus', 'NHAP', 'toStatus', 'CHO_TBP_DUYET',
                'recipients', jsonb_build_array('TBP'),
                'reason', NULL,
                'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              ),
              3,
              ($2::text[])[1 + (t.n - 1)::int % array_length($2::text[], 1)],
              now() - (t.n || ' hours')::interval
         FROM (
           SELECT p.id, p.code, p.customer_id, p.tdv_user_id,
                  c.code AS ma_kh, c.name AS ten_kh,
                  row_number() OVER (ORDER BY p.code) AS n
             FROM pol.policy p
             JOIN cus.customer c ON c.id = p.customer_id
            WHERE p.tdv_user_id IS NOT NULL
         ) t
        WHERE t.n <= $1`,
      [SO_THU_HONG, LOI_THU],
    );
  } finally {
    await db.end();
  }
}

/**
 * Vặn đồng hồ SLA của những hồ sơ vừa lập — ngoại lệ THỨ HAI của "nạp qua API thật".
 *
 * Cùng lý do với `namThuHong`: **không API nào tạo được hồ sơ quá hạn**. Hạn 14
 * ngày do máy chủ tự đặt lúc chuyển bước, và trạng thái *Quá hạn duyệt* chỉ đến
 * từ vòng quét của sla-worker khi đồng hồ thật đi qua mốc ấy. Muốn có nó "thật"
 * thì phải chờ hai tuần, hoặc chỉnh đồng hồ máy chủ — cả hai đều tệ hơn nhiều so
 * với việc ghi thẳng và nói rõ ở đây là đã ghi thẳng.
 *
 * Hồ sơ thì VẪN lập qua API và đẩy tới bước bằng đúng những hành động giao diện
 * gọi, nên dòng sản phẩm, nhật ký, người được phân công đều là dữ liệu thật. Chỉ
 * mốc thời gian là vặn tay.
 *
 * Với nhóm ĐÃ quá hạn còn phát kèm `sla.overdue` vào outbox — đúng khoá và đúng
 * hình dạng sla-worker phát ra. Nhờ vậy read-model đồng bộ theo (`0051`), nhật ký
 * kiểm toán có vết, và Mailpit có thư quá hạn để xem. Ghi thẳng vào
 * `rpt.policy_row` thì nhanh hơn nhưng dựng ra một bản demo mà các đường ống
 * không hề chạy — đúng thứ dễ làm người xem tin nhầm.
 */
async function vanDongHoSla(
  sapQuaHan: string[],
  daQuaHan: { id: string; buoc: string; quaHanNgay: number }[],
): Promise<void> {
  const db = moKetNoi();
  await db.connect();
  try {
    for (const [i, id] of sapQuaHan.entries()) {
      const gio = SAP_QUA_HAN[i]!.conLaiGio;
      await db.query(
        `UPDATE pol.policy
            SET sla_due_at = now() + ($2 || ' hours')::interval,
                sla_started_at = now() + ($2 || ' hours')::interval - interval '14 days',
                row_version = row_version + 1
          WHERE id = $1`,
        [id, String(gio)],
      );
      // Read-model giữ `sla_due_at` cho thẻ *Sắp quá hạn*, nên nó phải nghe được
      // lần vặn này. `policy.updated` khớp `policy.#`.
      await db.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
        'policy.updated',
        JSON.stringify({ policyId: id }),
      ]);
    }

    for (const h of daQuaHan) {
      await db.query(
        `UPDATE pol.policy
            SET status = 'QUA_HAN_DUYET',
                pending_step = $2::pol.policy_step,
                overdue_at = now() - ($3 || ' days')::interval,
                sla_due_at = now() - ($3 || ' days')::interval,
                row_version = row_version + 1
          WHERE id = $1`,
        [h.id, MA_BUOC[h.buoc]!, String(h.quaHanNgay)],
      );
      // Nhật ký hồ sơ phải đọc ra được vì sao nó chết — thiếu dòng này thì màn
      // hình nhật ký nhảy thẳng từ "Gửi duyệt" sang một trạng thái không ai gây ra.
      await db.query(
        `INSERT INTO pol.policy_event
           (policy_id, seq, from_status, to_status, action, actor_role, at)
         VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM pol.policy_event WHERE policy_id = $1),
                 $2::pol.policy_status, 'QUA_HAN_DUYET', 'SLA_OVERDUE', 'SYSTEM',
                 now() - ($3 || ' days')::interval)`,
        [h.id, h.buoc, String(h.quaHanNgay)],
      );
      await db.query(
        `INSERT INTO pol.outbox (routing_key, payload)
         SELECT 'sla.overdue',
                jsonb_build_object(
                  'policyId', p.id, 'policyCode', p.code,
                  'customerId', p.customer_id, 'customerCode', c.code, 'customerName', c.name,
                  'tdvUserId', p.tdv_user_id, 'tbpUserId', p.tbp_user_id,
                  'keToanUserId', p.ke_toan_user_id, 'saleAdminUserId', p.sale_admin_user_id,
                  'action', 'SLA_OVERDUE', 'toStatus', 'QUA_HAN_DUYET',
                  'pendingStep', $2::text,
                  'recipients', jsonb_build_array($3::text, 'TDV'),
                  'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                )
           FROM pol.policy p JOIN cus.customer c ON c.id = p.customer_id
          WHERE p.id = $1`,
        [h.id, h.buoc, CHU_BUOC[h.buoc]!],
      );
    }
  } finally {
    await db.end();
  }
}

// --- Nạp --------------------------------------------------------------------

type CoId = { id: string };

async function main(): Promise<void> {
  await xoaDuLieuCu();

  for (const u of ['tdv01', 'tdv02', 'tdv03', 'tbp01', 'kt01', 'sa01', 'admin01']) {
    await dangNhap(u);
  }

  // Id của những người sẽ được giao hồ sơ. Đọc THẲNG từ CSDL: `/admin/users`
  // phân trang 20 dòng một trang, và bộ nạp này tạo tới 26 tài khoản.
  {
    const db = moKetNoi();
    await db.connect();
    try {
      const r = await db.query<{ username: string; id: string }>(
        `SELECT username, id FROM idn.app_user`,
      );
      for (const x of r.rows) idNguoiDung[x.username] = x.id;
    } finally {
      await db.end();
    }
  }

  // Tài khoản thêm. `xoaDuLieuCu` KHÔNG đụng schema `idn`, nên chạy lại
  // `demo-mau` lần thứ hai sẽ gặp lại đúng những tài khoản này — bỏ qua trong im
  // lặng thay vì chết, vì tạo trùng ở đây không phải một lỗi đáng dừng cả lượt.
  for (const n of NGUOI_DUNG_THEM) {
    await goi('/admin/users', 'admin01', {
      username: n.u,
      email: `${n.u}@csbh.test`,
      fullName: n.ten,
      role: n.role,
    }).catch((e: unknown) => {
      if (!String(e).includes('409')) throw e;
    });
  }

  for (const n of NHOM) {
    await goi('/catalog/product-groups', 'admin01', { code: n.code, name: n.name });
  }
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

  // Khách hàng. `KH-0002` thuộc tdv02 để thấy rõ phạm vi dữ liệu: tdv01 KHÔNG
  // thấy khách này. Bốn khách cuối chia cho tdv02 và tdv03 vì cùng lý do — một
  // màn hình mà mọi dòng đều của mình thì không chứng minh được gì về phạm vi.
  const khach: Record<string, string> = {};
  const cuaTdv02 = new Set(['KH-0002', 'KH-0025', 'KH-0026']);
  const cuaTdv03 = new Set(['KH-0027', 'KH-0028']);
  for (const k of KHACH) {
    const chu = cuaTdv02.has(k.code) ? 'tdv02' : cuaTdv03.has(k.code) ? 'tdv03' : 'tdv01';
    const r = await goi<CoId>('/customers', chu, k);
    khach[k.code] = r.id;
  }

  /** Khách của tdv01 — nguồn để sinh hồ sơ hàng loạt. 23 mã, đủ vượt một trang. */
  const cuaTdv01 = KHACH.filter((k) => !cuaTdv02.has(k.code) && !cuaTdv03.has(k.code)).map(
    (k) => k.code,
  );

  /** Một dòng sản phẩm. `cpbh` là chi phí bán hàng, quyết định tỷ lệ chiết khấu. */
  const dong = (ma: string, giaBuon: number, ...cpbh: number[]) => ({
    productId: sanPham[ma]!,
    wholesalePrice: String(giaBuon),
    cpbh: cpbh.map(String),
  });

  const lapHoSo = async (khachHang: string, lines: object[], ai = 'tdv01') =>
    (
      await goi<CoId>('/policies', ai, {
        customerId: khach[khachHang]!,
        lines,
        appliedDate: '2026-08-01',
      })
    ).id;

  // === PHẦN VIẾT TAY: năm hồ sơ được chọn, đứng đầu danh sách =================

  // 1. NHÁP — tdv01 mở phần mềm là có ngay việc dở dang để xem và sửa.
  await lapHoSo('KH-0001', [
    { ...dong('NC-GOLD-900', 540_000, 18_000), note: 'Khách đề nghị giữ giá tới hết quý' }, // 15,12%
    dong('NC-GOLD-400', 280_000, 9_000), // 13,97%
  ]);

  // 2. CHỜ TBP DUYỆT — tbp01 đăng nhập là thấy việc ở trang chủ.
  //
  // Hai dòng đầu nằm DƯỚI ngưỡng, dòng thứ ba vượt. Tỷ lệ đó là có chủ ý: vượt
  // ngưỡng phải là NGOẠI LỆ thì dấu cảnh báo mới có nghĩa. Một bảng mà dòng nào
  // cũng đỏ thì người duyệt thôi không nhìn nữa.
  const hs2 = await lapHoSo('KH-0003', [
    dong('NC-GOLD-900', 528_000, 20_000), // 17,40% — dưới ngưỡng 18%
    dong('NC-BONE-900', 530_000, 15_000), // 11,97% — dưới ngưỡng 15%
    { ...dong('NC-META-900', 390_000, 20_000), note: 'Chờ duyệt ngoại lệ của Ban lãnh đạo' }, // VƯỢT
  ]);
  await act(hs2, 'SUBMIT', 'tdv01');

  // 3. CHỜ KẾ TOÁN L1 — kt01 đăng nhập là thấy việc, và xuất được hợp đồng.
  const hs3 = await lapHoSo('KH-0004', [
    dong('NC-LEAN-400', 258_000, 8_000), // 9,09% — dưới ngưỡng 12%
    dong('NC-CANXI-400', 302_000, 10_000), // 10,15% — dưới ngưỡng 12%
  ]);
  await act(hs3, 'SUBMIT', 'tdv01');
  await act(hs3, 'TBP_SIGN', 'tbp01');

  // 4. ĐANG CÓ HIỆU LỰC — đi hết 10 bước, để báo cáo và màn hình khách hàng có
  //    thứ để hiện. Hồ sơ này của tdv02, không phải tdv01.
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
  await act(hs5, 'TBP_RETURN', 'tbp01', { reason: LY_DO_TRA_LAI });

  // === PHẦN SINH RA: khối lượng để thử phân trang =============================

  const themScan = (id: string) =>
    goi(`/policies/${id}/attachments`, 'sa01', {
      kind: 'SCAN',
      fileName: 'ban-cung-da-ky.pdf',
      objectKey: `scan/demo-${id}.pdf`,
    });

  /**
   * Bảng bước ở muc 3, viết đúng MỘT lần. Đẩy một hồ sơ Nháp tới trạng thái đích
   * bằng chính những hành động mà giao diện gọi.
   */
  const CHUOI: { dich: string; chay: (id: string) => Promise<unknown> }[] = [
    { dich: 'CHO_TBP_DUYET', chay: (id) => act(id, 'SUBMIT', 'tdv01') },
    { dich: 'CHO_KT_L1', chay: (id) => act(id, 'TBP_SIGN', 'tbp01') },
    { dich: 'SA_DANG_XU_LY', chay: (id) => act(id, 'KT_RECEIVE_L1', 'kt01') },
    {
      dich: 'CHO_KT_L2',
      chay: async (id) => {
        await themScan(id);
        return act(id, 'SA_HANDOVER', 'sa01');
      },
    },
    { dich: 'DANG_CO_HIEU_LUC', chay: (id) => act(id, 'KT_RECEIVE_L2', 'kt01') },
  ];

  async function dayToi(id: string, dich: string): Promise<void> {
    for (const b of CHUOI) {
      await b.chay(id);
      if (b.dich === dich) return;
    }
  }

  /**
   * Mỗi hồ sơ sinh ra ĐỀU chứa `NC-GOLD-900`.
   *
   * Không phải cho đẹp: cuối script có một lần đổi giá sản phẩm này, và chỉ khi
   * mọi hồ sơ đã đóng băng cùng chứa nó thì box *Yêu cầu cập nhật* mới vượt được
   * 20 dòng. Dòng thứ hai xoay vòng qua danh mục để bảng sản phẩm trong hồ sơ
   * không phải bảng giống hệt nhau hàng trăm lần.
   */
  const dongCuaHoSo = (i: number) => {
    const phu = SAN_PHAM[6 + (i % (SAN_PHAM.length - 6))]!;
    return [
      dong('NC-GOLD-900', 535_000 + (i % 7) * 2_000, 16_000),
      dong(phu.code, Math.round(phu.gia * 0.86), Math.round(phu.gia * 0.02)),
    ];
  };

  /**
   * THỨ TỰ TRONG BẢNG NÀY LÀ BẮT BUỘC: `DANG_CO_HIEU_LUC` phải đứng CUỐI.
   *
   * `uq_policy_active_per_customer` cho mỗi khách đúng một CSBH hiệu lực, và
   * `POST /policies` từ chối lập hồ sơ mới cho khách đã có CSBH hiệu lực trừ khi
   * khai rõ là bổ sung hay chỉnh sửa. Đẩy một khách lên hiệu lực trước rồi mới
   * lập tiếp cho họ là tự dựng ra lỗi 409 giữa chừng.
   */
  let stt = 0;
  let daLap = 5;

  // === Hồ sơ sắp quá hạn và đã quá hạn (`0051`) ==============================
  //
  // Dựng TRƯỚC khối hàng loạt, và lý do rất cụ thể: `DANG_CO_HIEU_LUC` chiếm mỗi
  // khách một suất (`uq_policy_active_per_customer`), nên lập sau đợt ấy thì hết
  // khách còn trống. Ở đây khách vẫn xoay vòng thoải mái — chín hồ sơ này đều
  // dừng ở một bước chờ, không cái nào lên hiệu lực.
  const idSapQuaHan: string[] = [];
  for (const h of SAP_QUA_HAN) {
    stt += 1;
    const id = await lapHoSo(cuaTdv01[stt % cuaTdv01.length]!, dongCuaHoSo(stt));
    await dayToi(id, h.buoc);
    idSapQuaHan.push(id);
    daLap += 1;
  }

  const idDaQuaHan: { id: string; buoc: string; quaHanNgay: number }[] = [];
  for (const h of DA_QUA_HAN) {
    stt += 1;
    const id = await lapHoSo(cuaTdv01[stt % cuaTdv01.length]!, dongCuaHoSo(stt));
    await dayToi(id, h.buoc);
    idDaQuaHan.push({ id, buoc: h.buoc, quaHanNgay: h.quaHanNgay });
    daLap += 1;
  }

  await vanDongHoSla(idSapQuaHan, idDaQuaHan);

  const KE_HOACH: [string, number][] = [
    ['NHAP', QUA_MOT_TRANG],
    ['YEU_CAU_CHINH_SUA', QUA_MOT_TRANG],
    ['CHO_TBP_DUYET', QUA_MOT_TRANG],
    ['CHO_KT_L1', 11],
    ['CHO_KT_L2', 11],
    ['SA_DANG_XU_LY', QUA_MOT_TRANG],
    ['TU_CHOI', 5],
    ['DANG_CO_HIEU_LUC', QUA_MOT_TRANG],
  ];

  if (cuaTdv01.length < QUA_MOT_TRANG) {
    throw new Error(
      `tdv01 chỉ có ${cuaTdv01.length} khách, không đủ ${QUA_MOT_TRANG} hồ sơ hiệu lực — ` +
        'mỗi khách chỉ được một CSBH hiệu lực (uq_policy_active_per_customer)',
    );
  }

  for (const [dich, soLuong] of KE_HOACH) {
    for (let i = 0; i < soLuong; i += 1) {
      // Hồ sơ hiệu lực lấy khách theo CHỈ SỐ THẲNG, không xoay vòng: xoay vòng
      // là có ngày hai hồ sơ hiệu lực rơi vào cùng một khách và cả lượt nạp chết
      // giữa chừng bằng một lỗi 409 chẳng liên quan gì tới phân trang.
      const kh = dich === 'DANG_CO_HIEU_LUC' ? cuaTdv01[i]! : cuaTdv01[stt % cuaTdv01.length]!;
      stt += 1;
      const id = await lapHoSo(kh, dongCuaHoSo(stt));
      daLap += 1;

      if (dich === 'NHAP') continue;
      if (dich === 'YEU_CAU_CHINH_SUA') {
        await act(id, 'SUBMIT', 'tdv01');
        await act(id, 'TBP_RETURN', 'tbp01', { reason: LY_DO_TRA_LAI });
        continue;
      }
      if (dich === 'TU_CHOI') {
        await act(id, 'SUBMIT', 'tdv01');
        await act(id, 'TBP_REJECT', 'tbp01', {
          reason: 'Khách hàng đang quá hạn công nợ trên 90 ngày, chưa cấp CSBH mới.',
        });
        continue;
      }
      await dayToi(id, dich);
    }
  }

  // === Mẫu hợp đồng ==========================================================
  //
  // `.docx` dựng bằng chính bộ dựng của service document, không phải file rỗng:
  // máy chủ đọc ô trống ngay lúc tải lên và từ chối file không phải docx
  // (`DOC-33`), nên một file giả sẽ hỏng ở đúng bước này.
  const than = [
    para('HỢP ĐỒNG PHÂN PHỐI SẢN PHẨM'),
    para('Bên A: Công ty TNHH Dược phẩm Nutricare'),
    para('Bên B: {{customer.name}} — mã {{customer.code}}'),
    para('Địa chỉ: {{customer.registeredAddress}}'),
    para('Áp dụng theo hồ sơ CSBH số {{policy.code}}'),
  ].join('');
  for (const ten of MAU_HOP_DONG) {
    const form = new FormData();
    form.append('name', ten);
    form.append('file', new Blob([makeDocx(than)]), `${ten}.docx`);
    await guiTep('/contract-templates', 'sa01', form);
  }

  // === Thư hỏng ==============================================================
  await namThuHong();

  // === Yêu cầu cập nhật ======================================================
  //
  // ĐỔI GIÁ CUỐI CÙNG, sau khi mọi hồ sơ đã đóng băng. Đổi trước thì hồ sơ lập
  // sau đó chụp luôn giá mới và không có gì lệch để mà hiện.
  const homNay = new Date().toISOString().slice(0, 10);
  const doiGia: [string, number][] = [
    ['NC-GOLD-900', 648_000],
    ['NC-GOLD-400', 332_000],
  ];
  for (const [ma, giaMoi] of doiGia) {
    await goi(`/catalog/products/${sanPham[ma]!}/prices`, 'admin01', {
      priceType: 'GIA_BAN_CONG_TY',
      amount: String(giaMoi),
      effectiveFrom: homNay,
    });
  }
  // Và một ngưỡng đổi, để box hiện được cả loại lệch thứ hai chứ không chỉ giá.
  await goi(
    '/catalog/discount-rules/CK-SUA-L1',
    'admin01',
    { thresholdRate2: 1650, effectiveFrom: homNay },
    'PATCH',
  );

  /*
   * Và loại thứ BA: một sản phẩm bị vô hiệu hoá (`0036`).
   *
   * Chọn `NC-CAN-400` — nó nằm trong hồ sơ hàng loạt nhưng KHÔNG phải
   * `NC-GOLD-900`, nên nó không đè lên hai loại lệch kia và box hiện đủ ba nhãn
   * cạnh nhau. Đặt CUỐI CÙNG, sau mọi lần lập hồ sơ: vô hiệu hoá sớm hơn thì
   * `POL-01` chặn chính những hồ sơ sắp dùng nó.
   *
   * `confirm` là mã vật tư — bắt buộc từ `0036` cho mọi thao tác phá huỷ.
   */
  await goi(
    `/catalog/products/${sanPham['NC-CAN-400']!}`,
    'admin01',
    { status: 'DA_VO_HIEU_HOA', confirm: 'NC-CAN-400' },
    'PATCH',
  );

  const lech = await choDauVet();

  console.log(
    `seed-demo: xong — ${NHOM.length} nhóm, ${SAN_PHAM.length} sản phẩm, ` +
      `${QUY_DINH_CK.length} quy định chiết khấu, ${KHACH.length} khách hàng, ` +
      `${daLap} hồ sơ (${SAP_QUA_HAN.length} sắp quá hạn, ${DA_QUA_HAN.length} đã quá hạn), ` +
      `${MAU_HOP_DONG.length} mẫu hợp đồng, ${SO_THU_HONG} thư hỏng, ` +
      `${lech} hồ sơ cần cập nhật`,
  );
}

/**
 * Đợi consumer `catalog-impact` rà xong.
 *
 * Nó chạy BẤT ĐỒNG BỘ qua RabbitMQ: `POST .../prices` trả về ngay khi sự kiện
 * nằm trong outbox, còn dấu vết lệch thì xuất hiện vài giây sau. Script kết thúc
 * trước lúc đó sẽ in ra "0 hồ sơ cần cập nhật" và người đọc tưởng chức năng hỏng.
 */
async function choDauVet(): Promise<number> {
  for (let i = 0; i < 40; i += 1) {
    const r = await goi<{ total: number }>('/policies/impacted?limit=1', 'tdv01');
    if (r.total > 20) return r.total;
    await new Promise((ok) => setTimeout(ok, 1_500));
  }
  console.warn('seed-demo: chờ 60 giây mà dấu vết lệch vẫn chưa đủ — xem log service policy');
  return (await goi<{ total: number }>('/policies/impacted?limit=1', 'tdv01')).total;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
