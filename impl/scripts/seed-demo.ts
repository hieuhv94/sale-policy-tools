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
import { readFileSync } from 'node:fs';
import { BO_MAU, THU_MUC } from './tao-mau-ho-so.js';
import { MAU_MAC_DINH } from '../services/document/src/contracts/bootstrap-mau.js';

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

/*
 * XOAY VÒNG MẪU HỒ SƠ ĐÃ GỠ (`0165`).
 *
 * Khối này gán cho mỗi hồ sơ một mẫu khác nhau qua `mauHoSoId` của `SUBMIT`, để
 * bản demo bày ra việc *mỗi hồ sơ một bố cục*. `0163` bỏ hẳn việc gửi duyệt kèm
 * mẫu — và đây là **mã chết từ lúc ấy mà không gì báo**: `validate` bỏ qua khoá
 * lạ, nên thân yêu cầu vẫn mang một trường không ai đọc, suốt hai chặng.
 *
 * Bài học đã ghi ở `0128` nhìn từ chiều ngược: một khoá thừa trong thân yêu cầu
 * im lặng hệt như một cột thiếu trong `SELECT`.
 */

const phanCong = (hanhDong: string): Record<string, string> => {
  if (hanhDong === 'SUBMIT' || hanhDong === 'RESUBMIT_AFTER_EDIT') {
    return {
      tbpUserId: idNguoiDung['tbp01']!,
      keToanUserId: idNguoiDung['kt01']!,
    };
  }
  if (hanhDong === 'KT_RECEIVE_L1') return { saleAdminUserId: idNguoiDung['sa01']! };
  return {};
};

const act = (id: string, hanhDong: string, ai: string, body: Record<string, unknown> = {}) =>
  goi(`/policies/${id}/actions/${hanhDong}`, ai, { ...phanCong(hanhDong), ...body });

/**
 * Người lập bỏ hẳn một hồ sơ đã vào luồng (`0035`) — đường DUY NHẤT tới `DA_XOA`
 * từ `0155`.
 *
 * `DELETE` chứ không phải một hành động của máy trạng thái: xoá không đi qua
 * `/actions/*`, nó có endpoint riêng và luật riêng (chỉ TDV phụ trách, chỉ ở hai
 * trạng thái sửa được).
 */
const xoaHoSo = (id: string, ai: string) => goi(`/policies/${id}`, ai, {}, 'DELETE');

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
  /**
   * MỘT HOẶC NHIỀU địa chỉ đăng ký (`0154`).
   *
   * Bản demo phải có khách NHIỀU địa chỉ, nếu không thì tính năng vừa dựng
   * không có chỗ nào bày ra — đúng cái mất mà `0137` đã ghi khi mẫu rút gọn
   * rời khỏi bộ nạp và demo hết chỗ bày việc chọn tập cột.
   */
  registeredAddresses: string[];
  deliveryAddresses?: string[];
  ownerName: string;
  ownerTitle: string;
  idNumber: string;
  /** `0128` — bắt buộc lúc gửi duyệt, nên khách hàng mẫu phải có. */
  phone: string;
  debtTerm: string;
  debtNote?: string;
};

/** Bốn khách viết tay — phủ đủ ba loại khách, và `KH-0002` thuộc `tdv02`. */
const KHACH_TAY: KhachMau[] = [
  {
    code: 'KH-0001',
    name: 'Nhà thuốc Minh Châu',
    customerType: 1,
    // BA địa chỉ — chuỗi nhà thuốc, đúng nghiệp vụ mà `0154` sinh ra để đỡ.
    registeredAddresses: [
      'Số 8 Tôn Thất Thuyết, Cầu Giấy, Hà Nội',
      'Số 214 Nguyễn Trãi, Thanh Xuân, Hà Nội',
      'Số 31 Chùa Bộc, Đống Đa, Hà Nội',
    ],
    deliveryAddresses: ['Kho số 2, KCN Quang Minh, Mê Linh, Hà Nội'],
    ownerName: 'Trần Thị Mỹ Hạnh',
    ownerTitle: 'Chủ nhà thuốc',
    idNumber: '0101234567',
    phone: '0912 345 678',
    debtTerm: 'GOI_DON_90',
  },
  {
    code: 'KH-0002',
    name: 'Nhà thuốc Đông Á',
    customerType: 1,
    registeredAddresses: ['Số 12 Nguyễn Văn Linh, Hải Châu, Đà Nẵng'],
    ownerName: 'Lê Quang Đạo',
    ownerTitle: 'Chủ nhà thuốc',
    idNumber: '0402345678',
    phone: '0905 234 567',
    debtTerm: 'SAU_NHAN_HANG',
  },
  {
    code: 'KH-0003',
    name: 'Công ty TNHH Dược phẩm Hoàng Long',
    customerType: 2,
    // HAI địa chỉ đăng ký cộng một nơi nhận hàng riêng.
    registeredAddresses: [
      'Số 55 Lê Duẩn, Quận 1, TP Hồ Chí Minh',
      'Lô B12, KCN Tân Bình, TP Hồ Chí Minh',
    ],
    deliveryAddresses: [
      'Kho Bình Chánh, TP Hồ Chí Minh',
      'Kho Thủ Đức, TP Hồ Chí Minh',
    ],
    ownerName: 'Phạm Hoàng Long',
    ownerTitle: 'Giám đốc',
    idNumber: '0312345678',
    phone: '0938 456 789',
    debtTerm: 'KHAC',
    debtNote: 'Thanh toán 50% khi đặt hàng, 50% sau 30 ngày',
  },
  {
    code: 'KH-0004',
    name: 'Khoa Dinh dưỡng — Bệnh viện Bạch Mai',
    customerType: 3,
    registeredAddresses: ['Số 78 Giải Phóng, Đống Đa, Hà Nội'],
    ownerName: 'Nguyễn Thị Thu Hà',
    ownerTitle: 'Trưởng khoa',
    idNumber: '0104567890',
    phone: '0987 654 321',
    debtTerm: 'SAU_NHAN_HANG',
  },
];

/** `[tên, loại khách, địa chỉ đăng ký, người đại diện, chức danh, công nợ]`. */
const KHACH_THEM: [string, number, string, string, string][] = [
  ['Nhà thuốc Thanh Bình', 1, 'Số 21 Trần Phú, Hà Đông, Hà Nội', 'Nguyễn Thanh Bình', 'Chủ nhà thuốc'],
  ['Nhà thuốc An Khang', 1, 'Số 145 Cầu Giấy, Cầu Giấy, Hà Nội', 'Đỗ Thị An', 'Chủ nhà thuốc'],
  ['Nhà thuốc Phúc Lộc', 1, 'Số 9 Lê Lợi, TP Vinh, Nghệ An', 'Trần Phúc Lộc', 'Chủ nhà thuốc'],
  ['Nhà thuốc Bảo Ngọc', 1, 'Số 32 Hai Bà Trưng, TP Huế, Thừa Thiên Huế', 'Lê Bảo Ngọc', 'Chủ nhà thuốc'],
  ['Nhà thuốc Hương Sen', 1, 'Số 88 Nguyễn Trãi, Thanh Xuân, Hà Nội', 'Vũ Thị Hương', 'Chủ nhà thuốc'],
  ['Nhà thuốc Tâm Đức', 1, 'Số 4 Quang Trung, TP Nam Định, Nam Định', 'Phạm Tâm Đức', 'Chủ nhà thuốc'],
  ['Nhà thuốc Việt Nhật', 1, 'Số 60 Lạch Tray, Ngô Quyền, Hải Phòng', 'Hoàng Việt Anh', 'Chủ nhà thuốc'],
  ['Quầy thuốc Kim Ngân', 1, 'Số 7 Hùng Vương, TP Việt Trì, Phú Thọ', 'Ngô Kim Ngân', 'Chủ quầy thuốc'],
  ['Công ty CP Dược phẩm Đại Việt', 2, 'Số 210 Nguyễn Thị Minh Khai, Quận 3, TP Hồ Chí Minh', 'Trịnh Đại Nghĩa', 'Tổng giám đốc'],
  ['Công ty TNHH Dược Tân Á', 2, 'Số 18 Điện Biên Phủ, Bình Thạnh, TP Hồ Chí Minh', 'Bùi Tân Á', 'Giám đốc'],
  ['Công ty TNHH Thương mại Nam Dược', 2, 'Số 3 Trường Chinh, Đống Đa, Hà Nội', 'Dương Nam Sơn', 'Giám đốc'],
  ['Công ty CP Dược Miền Trung', 2, 'Số 44 Ngô Quyền, Sơn Trà, Đà Nẵng', 'Cao Minh Trung', 'Giám đốc'],
  ['Công ty TNHH Dược phẩm Sông Hồng', 2, 'Số 27 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', 'Hà Thị Hồng', 'Giám đốc'],
  ['Công ty CP Y tế Tây Đô', 2, 'Số 5 Nguyễn Văn Cừ, Ninh Kiều, Cần Thơ', 'Mai Tây Đô', 'Phó giám đốc'],
  ['Công ty TNHH Dược Cao Nguyên', 2, 'Số 91 Phan Đình Phùng, TP Buôn Ma Thuột, Đắk Lắk', 'Lý Cao Sơn', 'Giám đốc'],
  ['Chuỗi nhà thuốc Sức Khoẻ Vàng', 2, 'Số 300 Xã Đàn, Đống Đa, Hà Nội', 'Nguyễn Hoàng Giang', 'Giám đốc chuỗi'],
  ['Khoa Dinh dưỡng — Bệnh viện Chợ Rẫy', 3, 'Số 201B Nguyễn Chí Thanh, Quận 5, TP Hồ Chí Minh', 'Trần Quốc Bảo', 'Trưởng khoa'],
  ['Khoa Dinh dưỡng — Bệnh viện Việt Đức', 3, 'Số 40 Tràng Thi, Hoàn Kiếm, Hà Nội', 'Lê Thị Kim Chi', 'Trưởng khoa'],
  ['Khoa Nhi — Bệnh viện Đa khoa Thanh Hoá', 3, 'Số 181 Hải Thượng Lãn Ông, TP Thanh Hoá', 'Phạm Văn Toàn', 'Trưởng khoa'],
  ['Khoa Dinh dưỡng — Bệnh viện Đà Nẵng', 3, 'Số 124 Hải Phòng, Thanh Khê, Đà Nẵng', 'Nguyễn Thị Diệu', 'Phó trưởng khoa'],
  ['Khoa Ung bướu — Bệnh viện K Tân Triều', 3, 'Số 30 Cầu Bươu, Thanh Trì, Hà Nội', 'Đặng Hoàng Nam', 'Trưởng khoa'],
  ['Khoa Hồi sức — Bệnh viện Bình Dân', 3, 'Số 371 Điện Biên Phủ, Quận 3, TP Hồ Chí Minh', 'Vũ Đình Khoa', 'Trưởng khoa'],
  ['Trung tâm Y tế huyện Đông Anh', 3, 'Thị trấn Đông Anh, Đông Anh, Hà Nội', 'Trần Thị Vân', 'Giám đốc trung tâm'],
  ['Trung tâm Dinh dưỡng TP Hồ Chí Minh', 3, 'Số 180 Lê Văn Sỹ, Phú Nhuận, TP Hồ Chí Minh', 'Lương Minh Khôi', 'Giám đốc'],
];

/** MST 10 chữ số, sinh theo thứ tự để không trùng và vẫn hợp lệ (CUST-04). */
const mst = (i: number): string => String(3_000_000_000 + i * 137);

const KHACH: KhachMau[] = [
  ...KHACH_TAY,
  /*
   * Điều khoản thanh toán XOAY VÒNG qua cả ba phương án (`0138`).
   *
   * Cột thứ sáu của `KHACH_THEM` từng là số tiền công nợ; công nợ thôi là số
   * tiền, và giữ lại cột ấy để rồi vứt đi là để một bảng dữ liệu nói dối về thứ
   * nó chứa. Xoay theo chỉ số thay vì đổi 24 dòng thành 24 mã: bản demo cần cả
   * ba phương án xuất hiện — nhất là *Khác*, chỗ duy nhất có phần gõ tay.
   */
  ...KHACH_THEM.map(([name, loai, diaChi, chu, chucDanh], i) => ({
    code: `KH-${String(i + 5).padStart(4, '0')}`,
    name,
    customerType: loai,
    registeredAddresses: [diaChi],
    ownerName: chu,
    ownerTitle: chucDanh,
    idNumber: mst(i + 5),
    phone: `09${String(10000000 + i).slice(0, 8)}`,
    debtTerm: (['SAU_NHAN_HANG', 'GOI_DON_90', 'KHAC'] as const)[i % 3]!,
    ...(i % 3 === 2 ? { debtNote: 'Thanh toán trong vòng 45 ngày kể từ ngày giao hàng' } : {}),
  })),
];

/*
 * `MAU_HOP_DONG` ĐÃ GỠ (`0165`) — mười mấy cái tên chỉ để bản demo có đủ dòng mà
 * thấy phân trang trên màn hình mẫu hợp đồng. Bộ nạp thôi tạo mẫu nào, nên danh
 * sách ấy hết chỗ dùng.
 *
 * Cái mất: màn hình *Văn bản mẫu* của bản demo giờ có đúng ba dòng, không đủ để
 * bày phân trang. Chấp nhận được — phân trang đã có ca kiểm riêng, và một bản
 * demo có ba mẫu là bức tranh ĐÚNG của một hệ thống vừa cài xong.
 */

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

/**
 * Xoá dòng giá mà lượt TẠO sản phẩm vừa sinh ra (`0125`).
 *
 * Từ `0123` tạo sản phẩm bắt buộc có giá, và dòng ấy mang ngày HÔM NAY. Bộ nạp
 * này dựng ba năm lịch sử rồi vặn đồng hồ về quá khứ, nên một dòng ngày hôm nay
 * là sai với chính câu chuyện nó kể: mở *Sửa* một sản phẩm trên bản demo thì
 * *Lịch sử giá* hiện hai dòng cùng số tiền, một dòng đề ngày hôm nay — và người
 * xem đọc nó như thể hệ thống vừa tự ghi một lần đổi giá.
 *
 * Đi thẳng CSDL vì không có API xoá dòng giá, và cố ý không có: giá là chuỗi
 * lịch sử mà hồ sơ đã đóng băng tra ngược lại. Đây là bộ nạp dựng một quá khứ,
 * không phải một đường nghiệp vụ.
 *
 * XOÁ CÓ ĐIỀU KIỆN: chỉ những dòng ngày hôm nay mà đã có một dòng khác cho cùng
 * sản phẩm. Xoá trần theo ngày sẽ cuốn theo cả giá của `nap-danh-muc`, nơi ngày
 * hôm nay là mốc ĐÚNG và là mốc duy nhất.
 */
async function donGiaTao(): Promise<void> {
  const db = moKetNoi();
  await db.connect();
  try {
    const r = await db.query(
      `DELETE FROM cat.product_price gia
        WHERE gia.effective_from = current_date
          AND EXISTS (
            SELECT 1 FROM cat.product_price khac
             WHERE khac.product_id = gia.product_id
               AND khac.price_type = gia.price_type
               AND khac.effective_from <> gia.effective_from
          )`,
    );
    console.log(`  dọn ${r.rowCount} dòng giá của lượt tạo`);
  } finally {
    await db.end();
  }
}

/**
 * GIỮ LẠI ba mẫu mặc định khi dọn dữ liệu cũ (`0166`).
 *
 * Lỗi thật, và nó chỉ hiện ra sau `0165`: `xoaDuLieuCu()` quét sạch
 * `doc.contract_template`, và tới `0164` điều đó vô hại vì bộ nạp demo dựng lại
 * ngay một bộ mẫu của riêng nó. `0165` bỏ việc dựng ấy đi — ba mẫu mặc định giờ
 * nạp ở **lượt khởi động của service**, không phải ở lượt seed.
 *
 * Nên `make demo-mau` xoá chúng và **không gì đưa chúng về**: bộ nạp không tạo
 * mẫu, còn `document` thì đã khởi động xong từ lâu. Bản demo mất sạch văn bản
 * mẫu, và triệu chứng lộ ra ở tận màn hình *Xem bản mềm* của Sale Admin.
 *
 * Ranh giới đúng: lượt dọn này xoá **dữ liệu NGHIỆP VỤ của bản demo** — khách
 * hàng, hồ sơ, danh mục. Ba mẫu mặc định không thuộc nhóm ấy; chúng là một phần
 * của HỆ THỐNG, đúng như `idn.app_user` — thứ mà khối dọn này cũng không đụng
 * tới. Mẫu do Quản trị tự tải lên thì vẫn bị xoá: chúng đúng là dữ liệu demo.
 */
const TEN_MAU_MAC_DINH = MAU_MAC_DINH.map((m) => m.ten);

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
      DELETE FROM doc.outbox;
    `);

    /*
     * Ba lượt xoá của `doc` tách ra khỏi khối trên vì chúng cần THAM SỐ, và
     * node-pg chỉ cho truyền tham số khi câu lệnh đứng một mình.
     *
     * VẪN MỘT TRANSACTION: khối trên mở `BEGIN` và không đóng, khối dưới đóng
     * bằng `COMMIT`. Cùng một `Client`, nên ba câu ở giữa nằm trong đúng
     * transaction ấy — lượt dọn hỏng giữa chừng vẫn không để lại nửa vời.
     *
     * Thứ tự bắt buộc: `contract_template.file_id` có khoá ngoại sang
     * `stored_file`, nên tệp phải xoá SAU mẫu — và chỉ xoá những tệp không còn
     * mẫu nào trỏ tới.
     */
    await db.query(
      `DELETE FROM doc.contract_template_field
        WHERE template_id IN (SELECT id FROM doc.contract_template WHERE name <> ALL($1))`,
      [TEN_MAU_MAC_DINH],
    );
    await db.query(`DELETE FROM doc.contract_template WHERE name <> ALL($1)`, [
      TEN_MAU_MAC_DINH,
    ]);
    // `NOT EXISTS` chứ không `NOT IN`: `NOT IN` gặp một NULL trong tập con là trả
    // về rỗng cho MỌI dòng, tức không xoá gì và cũng không báo gì.
    await db.query(
      `DELETE FROM doc.stored_file f
        WHERE NOT EXISTS (SELECT 1 FROM doc.contract_template t WHERE t.file_id = f.id)`,
    );

    await db.query(`
      DELETE FROM cat.outbox;
      DELETE FROM cat.product_price;
      DELETE FROM cat.discount_rule;
      DELETE FROM cat.product;
      DELETE FROM cat.product_group;
      DELETE FROM ntf.sent_mail;
      DELETE FROM ntf.dead_letter;
      DELETE FROM ntf.thong_bao;
      ALTER TABLE aud.audit_log DISABLE TRIGGER trg_audit_immutable;
      DELETE FROM aud.audit_log;
      ALTER TABLE aud.audit_log ENABLE TRIGGER trg_audit_immutable;
      COMMIT;
    `);
  } finally {
    await db.end();
  }
}

/*
 * NẠP MẪU HỒ SƠ ĐÃ GỠ KHỎI BỘ NẠP DEMO (`0165`).
 *
 * Khách hàng chốt 30/08: ba mẫu mặc định đi cùng hệ thống, không cần `demo-mau`
 * lẫn `nap-danh-muc`. Bản demo dùng chính ba mẫu ấy — thứ khách hàng sẽ thấy
 * trên máy chủ thật — thay vì một bộ mẫu riêng chỉ tồn tại trong bản demo.
 *
 * Cái mất, và nó đã mất từ `0137`: bản demo không còn chỗ trưng bày tính năng
 * *mỗi mẫu một tập cột* (`0067`). Giờ nó có lại, và có theo cách đúng hơn — hai
 * mẫu hồ sơ mặc định là ĐẦY ĐỦ và RÚT GỌN, tức đúng hai tập cột khác nhau.
 *
 * `BO_MAU` và `tao-mau-ho-so.ts` ở lại: chúng còn dựng file `.docx` trong
 * `templates/`, thứ `templates/default/` lấy làm nguồn.
 */

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

/**
 * BA NĂM LỊCH SỬ — để trang *Thống kê* có gì mà so giữa các năm (`0095`).
 *
 * Không có phần này thì mọi hồ sơ của bản demo đều sinh ra trong vài phút chạy
 * `demo-mau`, và mọi biểu đồ theo kỳ chỉ có **một cột duy nhất**: đúng về dữ
 * liệu, vô dụng để xem. Chiều thời gian là thứ cả màn hình ấy nói về.
 *
 * MỖI HỒ SƠ VẪN ĐI QUA API và qua đủ mười bước — dòng sản phẩm, nhật ký, người
 * được phân công đều là dữ liệu thật. Chỉ **mốc thời gian** là vặn tay, đúng
 * cách `vanDongHoSla` đã làm với hồ sơ quá hạn, và vì đúng một lý do: không API
 * nào lập được hồ sơ của năm ngoái.
 *
 * Chuỗi phiên bản là chuỗi THẬT: bản sau lập ở chế độ *chỉnh sửa*, và khi nó có
 * hiệu lực thì bản trước tự chuyển *Hết hiệu lực* — đúng bất biến "mỗi khách
 * hàng chỉ có một CSBH còn hiệu lực".
 */
const MOC_LICH_SU: { ngay: string; heSoCpbh: number; nhan: string }[] = [
  // `heSoCpbh` nhân vào chi phí bán hàng đã đóng băng, nên tỷ lệ chiết khấu
  // nhích dần qua các năm — đó chính là đường mà Ban lãnh đạo mở màn hình ra để
  // nhìn. Giá bán Công ty giữ nguyên: đổi cả hai thì không còn đọc ra được cái
  // gì đang đẩy tỷ lệ lên.
  { ngay: '2024-05-16', heSoCpbh: 0.62, nhan: 'giữa 2024' },
  { ngay: '2024-11-14', heSoCpbh: 0.71, nhan: 'cuối 2024' },
  { ngay: '2025-04-17', heSoCpbh: 0.8, nhan: 'giữa 2025' },
  { ngay: '2025-10-16', heSoCpbh: 0.89, nhan: 'cuối 2025' },
  { ngay: '2026-03-19', heSoCpbh: 0.96, nhan: 'đầu 2026' },
];

/**
 * Vặn đồng hồ của MỘT hồ sơ đã có hiệu lực về một mốc trong quá khứ.
 *
 * Đặt mốc THẲNG cho từng bước thay vì dịch cả chuỗi đi một khoảng: hồ sơ do bộ
 * nạp đẩy qua mười bước trong vài giây, nên dịch cả chuỗi cho ra những hồ sơ
 * "duyệt xong trong 4 giây" — và biểu đồ *số ngày duyệt trung bình* thành một
 * đường phẳng bằng 0.
 */
async function luiHoSo(
  db: Client,
  id: string,
  moc: { ngay: string; heSoCpbh: number },
  suaNgay = 0,
): Promise<void> {
  await db.query(
    `UPDATE pol.policy
        SET created_at        = ($2::date - interval '19 days'),
            submitted_at      = ($2::date - interval '15 days'),
            tbp_signed_at     = ($2::date - interval '11 days'),
            kt_l1_received_at = ($2::date - interval '9 days'),
            contract_issued_at = ($2::date - interval '8 days'),
            sa_handover_at    = ($2::date - interval '3 days'),
            kt_l2_received_at = $2::date,
            effective_from    = $2::date,
            applied_date      = $2::date,
            sla_started_at    = NULL,
            sla_due_at        = NULL,
            row_version       = row_version + 1
      WHERE id = $1`,
    [id, moc.ngay],
  );

  // Nhật ký hồ sơ phải khớp với những mốc vừa đặt. Không sửa thì màn hình *Lịch
  // sử* của một hồ sơ năm 2024 kể lại rằng nó đi hết mười bước vào hôm nay.
  await db.query(
    `UPDATE pol.policy_event e
        SET at = CASE e.action
                   WHEN 'SUBMIT'         THEN p.submitted_at
                   -- Vòng trả lại nằm GIỮA gửi duyệt và ký: hai mốc này nuôi
                   -- khối "trả lại rồi bao lâu mới quay lại" của Trưởng bộ phận,
                   -- nên khoảng cách giữa chúng phải là một con số thật.
                   WHEN 'TBP_RETURN'     THEN p.submitted_at + interval '1 day'
                   WHEN 'RESUBMIT_AFTER_EDIT'
                     THEN p.submitted_at + interval '1 day' + ($2 || ' days')::interval
                   WHEN 'TBP_SIGN'       THEN p.tbp_signed_at
                   WHEN 'KT_RECEIVE_L1'  THEN p.kt_l1_received_at
                   WHEN 'SA_HANDOVER'    THEN p.sa_handover_at
                   WHEN 'KT_RECEIVE_L2'  THEN p.kt_l2_received_at
                   ELSE p.created_at
                 END
       FROM pol.policy p
      WHERE p.id = e.policy_id AND e.policy_id = $1`,
    [id, String(suaNgay)],
  );

  /*
   * Chi phí bán hàng đóng băng nhân theo hệ số của mốc, rồi TÍNH LẠI tỷ lệ chiết
   * khấu từ chính nó.
   *
   * HAI CÂU LỆNH, không phải một, vì `cpbh_total` · `net_price` ·
   * `over_threshold` là **cột sinh** (`GENERATED ALWAYS`): ghi thẳng vào chúng
   * thì Postgres từ chối cả câu lệnh. Câu đầu đổi mảng `cpbh` — ba cột kia tự
   * tính lại theo. Câu sau đọc `net_price` MỚI để đặt `discount_rate`, cột duy
   * nhất còn lại phải tính tay, và `over_threshold` lại tự theo nó.
   *
   * Không đặt thẳng một tỷ lệ mong muốn: bốn con số ấy phải khớp nhau, vì màn
   * hình hồ sơ bày cả bốn cột cạnh nhau và người xem cộng trừ được bằng mắt.
   */
  await db.query(
    `UPDATE pol.policy_line
        -- Ép kiểu numeric cho tham số chứ không để Postgres tự đoán: cột cpbh
        -- là bigint[], nên tham số không ép kiểu bị suy thành bigint và chuỗi
        -- 0.62 chết ngay ở khâu đọc số. Ép về bigint ở ngoài để kết quả đúng
        -- kiểu phần tử của mảng.
        SET cpbh = ARRAY(SELECT round(x * $2::numeric)::bigint FROM unnest(cpbh) AS x)
      WHERE policy_id = $1`,
    [id, String(moc.heSoCpbh)],
  );
  await db.query(
    `UPDATE pol.policy_line
        SET discount_rate = round((1 - net_price::numeric / company_price_snap) * 100, 2)
      WHERE policy_id = $1 AND company_price_snap IS NOT NULL`,
    [id],
  );

  // Read-model nghe qua outbox như mọi thay đổi khác — xem `vanDongHoSla`.
  await db.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
    'policy.updated',
    JSON.stringify({ policyId: id }),
  ]);
}

/** Bản trước trong chuỗi hết hiệu lực ĐÚNG LÚC bản sau có hiệu lực. */
async function luiHetHieuLuc(db: Client, id: string, ngay: string): Promise<void> {
  await db.query(
    `UPDATE pol.policy SET deactivated_at = $2::date, row_version = row_version + 1 WHERE id = $1`,
    [id, ngay],
  );
  await db.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
    'policy.updated',
    JSON.stringify({ policyId: id }),
  ]);
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
    // Hiệu lực từ 2024, không phải 2026 (`0095`): bộ nạp dựng ba năm lịch sử hồ
    // sơ, và một hồ sơ áp dụng từ 2024 phải đóng băng được NGƯỠNG của thời điểm
    // ấy. Không có quy định nào hiệu lực khi đó thì ngưỡng đóng băng là rỗng, và
    // cột *Vượt ngưỡng* của cả ba năm đầu trống trơn.
    await goi('/catalog/discount-rules', 'admin01', { ...q, effectiveFrom: '2024-01-01' });
  }

  const sanPham: Record<string, string> = {};
  for (const p of SAN_PHAM) {
    const r = await goi<CoId>('/catalog/products', 'admin01', {
      code: p.code,
      name: p.name,
      groupCode: p.nhom,
      // Bắt buộc từ `0123`. Dòng giá nó ghi mang ngày HÔM NAY — xem `donGiaTao`.
      price: String(p.gia),
    });
    sanPham[p.code] = r.id;
    await goi(`/catalog/products/${r.id}/prices`, 'admin01', {
      priceType: 'GIA_BAN_CONG_TY',
      amount: String(p.gia),
      // Cùng lý do với quy định chiết khấu: hồ sơ năm 2024 phải tìm được giá
      // bán Công ty có hiệu lực lúc ấy, nếu không `POST /policies` trả
      // `PRODUCT_NOT_FOUND` ngay ở bản lịch sử đầu tiên.
      effectiveFrom: '2024-01-01',
    });
  }
  await donGiaTao();

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

  /*
   * MẪU HỒ SƠ ĐẦY ĐỦ để dựng bản mềm (`0168`).
   *
   * Đọc MỘT LẦN từ chính ô chọn mà Sale Admin dùng, và lọc theo `loai`: bản lưu
   * chỉ nhận mẫu đầy đủ (`0167`). Không gõ tên mẫu vào đây — tên ấy là khoá
   * idempotent của lượt nạp mẫu mặc định (`0165`), và một bản chép ở bộ nạp demo
   * là chỗ nó trôi được.
   */
  const mauDayDu = await (async () => {
    const ds = await goi<{ id: string; loai?: string }[]>(
      '/policy-templates/available',
      'sa01',
      undefined,
      'GET',
    );
    const m = ds.find((x) => x.loai === 'HO_SO');
    if (!m) {
      throw new Error(
        'không có mẫu hồ sơ ĐẦY ĐỦ nào — bản mềm không dựng được. ' +
          'Ba mẫu mặc định nạp lúc `document` khởi động; khởi động lại service ấy rồi chạy lại.',
      );
    }
    return m.id;
  })();

  /*
   * BẢN MỀM dựng bằng ĐƯỜNG API THẬT, không chèn một con trỏ giả (`0168`).
   *
   * Bản scan ở ngay dưới thì giả — và đúng là phải giả: không có API nào sinh ra
   * một bản giấy đã ký, nó là vật ngoài phần mềm. Bản mềm thì ngược lại: phần
   * mềm dựng ra nó, ở `POST /policies/:id/render/luu`. Nên luật *"nạp qua API
   * thật"* của bộ nạp này áp được, và áp thì bản demo có những tệp MỞ RA ĐƯỢC —
   * thứ cả tính năng `0167` sinh ra để có.
   *
   * Cái giá đã đo: chừng 35 hồ sơ đi qua bàn giao, mỗi lượt một vòng Gotenberg.
   * Đổi lại là khối *Bản mềm* của bản demo không phải một dãy liên kết chết.
   */
  const themBanMem = async (id: string) => {
    const x = await goi<{ fileName: string; objectKey: string; sizeBytes: string }>(
      `/policies/${id}/render/luu?mauId=${mauDayDu}`,
      'sa01',
      {},
    );
    await goi(`/policies/${id}/attachments`, 'sa01', {
      kind: 'BAN_MEM',
      fileName: x.fileName,
      objectKey: x.objectKey,
      sizeBytes: x.sizeBytes,
    });
  };


  /** Một dòng sản phẩm. `cpbh` là chi phí bán hàng, quyết định tỷ lệ chiết khấu. */
  const dong = (ma: string, giaBuon: number, ...cpbh: number[]) => ({
    productId: sanPham[ma]!,
    wholesalePrice: String(giaBuon),
    cpbh: cpbh.map(String),
  });

  const lapHoSo = async (
    khachHang: string,
    lines: object[],
    ai = 'tdv01',
    them: { mode?: string; appliedDate?: string } = {},
  ) =>
    (
      await goi<CoId>('/policies', ai, {
        customerId: khach[khachHang]!,
        lines,
        appliedDate: them.appliedDate ?? '2026-08-01',
        ...(them.mode ? { mode: them.mode } : {}),
      })
    ).id;

  // === Mẫu hồ sơ CSBH ========================================================
  //
  // BỘ NẠP THÔI ĐỤNG TỚI VĂN BẢN MẪU (`0165`) — ba mẫu mặc định đã có sẵn từ lúc
  // `document` khởi động. Ràng buộc thứ tự cũ (*"nạp mẫu trước mọi lượt lập hồ
  // sơ, vì gửi duyệt bắt buộc kèm mẫu"*) mất theo `0163`: gửi duyệt không cần
  // mẫu nữa.

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
  await themBanMem(hs4);
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
  const CHUOI: { dich: string; chay: (id: string, ai: string) => Promise<unknown> }[] = [
    // Người GỬI phải là TDV phụ trách chính khách hàng ấy — `0095` dựng lịch sử
    // cho cả khách của tdv02 và tdv03, và gửi hộ thì máy chủ trả `OUT_OF_SCOPE`.
    { dich: 'CHO_TBP_DUYET', chay: (id, ai) => act(id, 'SUBMIT', ai) },
    { dich: 'CHO_KT_L1', chay: (id) => act(id, 'TBP_SIGN', 'tbp01') },
    { dich: 'SA_DANG_XU_LY', chay: (id) => act(id, 'KT_RECEIVE_L1', 'kt01') },
    {
      dich: 'CHO_KT_L2',
      chay: async (id) => {
        // Thứ tự đúng chiều việc thật: dựng bản mềm → in → trình ký → scan.
        await themBanMem(id);
        await themScan(id);
        return act(id, 'SA_HANDOVER', 'sa01');
      },
    },
    { dich: 'DANG_CO_HIEU_LUC', chay: (id) => act(id, 'KT_RECEIVE_L2', 'kt01') },
  ];

  async function dayToi(id: string, dich: string, ai = 'tdv01', traLai = false): Promise<void> {
    for (const b of CHUOI) {
      await b.chay(id, ai);
      /*
       * Vòng TRẢ LẠI RỒI GỬI LẠI (`0095`).
       *
       * Không có nó thì hai khối của Trưởng bộ phận trống trơn trên bản demo:
       * *cơ cấu chất lượng* chỉ có một màu "ký thẳng", và *trả lại rồi bao lâu
       * mới quay lại* không có dòng nào — vì `sua_lai_ngay` chỉ có giá trị khi
       * một hồ sơ đi trọn cặp trả-lại → gửi-lại.
       */
      if (traLai && b.dich === 'CHO_TBP_DUYET') {
        await act(id, 'TBP_RETURN', 'tbp01', { reason: LY_DO_TRA_LAI });
        await act(id, 'RESUBMIT_AFTER_EDIT', ai);
      }
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

  /** Mã sản phẩm của hồ sơ thứ `i` — cùng phép chọn với `dongCuaHoSo`. */
  const maCuaHoSo = (i: number): string[] => [
    'NC-GOLD-900',
    SAN_PHAM[6 + (i % (SAN_PHAM.length - 6))]!.code,
  ];

  /**
   * Khách nào đang có CSBH hiệu lực, và CSBH ấy gồm những sản phẩm nào (`0095`).
   *
   * Từ khi bộ nạp dựng ba năm lịch sử, phần lớn khách đã có một CSBH hiệu lực
   * TRƯỚC khi vòng `KE_HOACH` chạy tới. `POST /policies` khi ấy đòi khai rõ đây
   * là bản *bổ sung* hay *chỉnh sửa* (POL-04) — và chọn nhầm một trong hai thì
   * máy chủ trả 409 chứ không đoán hộ.
   *
   * Luật đúng bằng luật của máy chủ: có sản phẩm MỚI so với bản đang hiệu lực
   * thì là *bổ sung*, không thì là *chỉnh sửa*.
   */
  const spDangHieuLuc = new Map<string, Set<string>>();
  const cheDo = (kh: string, ma: string[]): { mode?: string } => {
    const dang = spDangHieuLuc.get(kh);
    if (!dang) return {};
    return { mode: ma.some((m) => !dang.has(m)) ? 'SUPPLEMENT' : 'AMEND' };
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
    const khSap = cuaTdv01[stt % cuaTdv01.length]!;
    const id = await lapHoSo(khSap, dongCuaHoSo(stt), 'tdv01', cheDo(khSap, maCuaHoSo(stt)));
    await dayToi(id, h.buoc);
    idSapQuaHan.push(id);
    daLap += 1;
  }

  const idDaQuaHan: { id: string; buoc: string; quaHanNgay: number }[] = [];
  for (const h of DA_QUA_HAN) {
    stt += 1;
    const khQua = cuaTdv01[stt % cuaTdv01.length]!;
    const id = await lapHoSo(khQua, dongCuaHoSo(stt), 'tdv01', cheDo(khQua, maCuaHoSo(stt)));
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
    ['DA_XOA', 5],
    ['DANG_CO_HIEU_LUC', QUA_MOT_TRANG],
  ];

  if (cuaTdv01.length < QUA_MOT_TRANG) {
    throw new Error(
      `tdv01 chỉ có ${cuaTdv01.length} khách, không đủ ${QUA_MOT_TRANG} hồ sơ hiệu lực — ` +
        'mỗi khách chỉ được một CSBH hiệu lực (uq_policy_active_per_customer)',
    );
  }

  /*
   * === BA NĂM LỊCH SỬ =======================================================
   *
   * Dựng TRƯỚC vòng `KE_HOACH`, và thứ tự ấy bắt buộc: chuỗi phiên bản phải đi
   * theo thời gian thật — bản 2024 có hiệu lực trước, rồi bản 2025 thay nó, rồi
   * mới tới bản của hôm nay do vòng dưới lập. Lập ngược lại thì hồ sơ của hôm
   * nay bị một bản đề ngày 2024 thay thế, và cả chuỗi đọc ra vô nghĩa.
   *
   * Chỉ một PHẦN khách hàng có lịch sử — người thật cũng thế: có khách mới ký
   * năm nay, có khách theo từ 2024. Một bản demo mà khách nào cũng có đúng năm
   * đời hồ sơ trông như dữ liệu sinh bằng máy, vì nó đúng là thế.
   */
  {
    const db = moKetNoi();
    await db.connect();
    try {
      const coLichSu: { kh: string; ai: string; soDoi: number }[] = [
        ...cuaTdv01.slice(0, 10).map((kh, i) => ({ kh, ai: 'tdv01', soDoi: 5 - (i % 3) })),
        { kh: 'KH-0025', ai: 'tdv02', soDoi: 4 },
        { kh: 'KH-0026', ai: 'tdv02', soDoi: 3 },
        { kh: 'KH-0027', ai: 'tdv03', soDoi: 3 },
        { kh: 'KH-0028', ai: 'tdv03', soDoi: 2 },
      ];

      /*
       * Mỗi trình dược viên sửa lại NHANH CHẬM khác nhau — đó là cả nội dung của
       * khối *trả lại rồi bao lâu mới quay lại*. Ba người, ba con số, và một
       * người vượt hẳn mốc "quá 5 ngày là chậm" để thanh ấy có ít nhất một dòng
       * đổi màu.
       */
      const suaLaiCua: Record<string, number> = { tdv01: 2, tdv02: 6, tdv03: 9 };

      for (const { kh, ai, soDoi } of coLichSu) {
        // Lấy các mốc GẦN NHẤT: khách có ít đời hồ sơ thì là khách mới, không
        // phải khách bỏ giữa chừng từ 2024.
        const moc = MOC_LICH_SU.slice(-soDoi);
        let truoc: string | null = null;
        for (const [i, m] of moc.entries()) {
          stt += 1;
          const ma = maCuaHoSo(stt);
          const id = await lapHoSo(kh, dongCuaHoSo(stt), ai, {
            appliedDate: m.ngay,
            ...cheDo(kh, ma),
          });
          // Cứ hai đời thì một đời bị trả lại — vượt ngưỡng ấy là bản demo trông
          // như một bộ phận không ai duyệt nổi hồ sơ của ai.
          const coTraLai = i % 2 === 1;
          await dayToi(id, 'DANG_CO_HIEU_LUC', ai, coTraLai);
          spDangHieuLuc.set(kh, new Set(ma));
          await luiHoSo(db, id, m, coTraLai ? (suaLaiCua[ai] ?? 3) : 0);
          if (truoc) await luiHetHieuLuc(db, truoc, m.ngay);
          truoc = id;
          daLap += 1;
        }
      }
    } finally {
      await db.end();
    }
  }

  for (const [dich, soLuong] of KE_HOACH) {
    for (let i = 0; i < soLuong; i += 1) {
      // Hồ sơ hiệu lực lấy khách theo CHỈ SỐ THẲNG, không xoay vòng: xoay vòng
      // là có ngày hai hồ sơ hiệu lực rơi vào cùng một khách và cả lượt nạp chết
      // giữa chừng bằng một lỗi 409 chẳng liên quan gì tới phân trang.
      const kh = dich === 'DANG_CO_HIEU_LUC' ? cuaTdv01[i]! : cuaTdv01[stt % cuaTdv01.length]!;
      stt += 1;
      const ma = maCuaHoSo(stt);
      const id = await lapHoSo(kh, dongCuaHoSo(stt), 'tdv01', cheDo(kh, ma));
      daLap += 1;
      if (dich === 'DANG_CO_HIEU_LUC') spDangHieuLuc.set(kh, new Set(ma));

      if (dich === 'NHAP') continue;
      if (dich === 'YEU_CAU_CHINH_SUA') {
        await act(id, 'SUBMIT', 'tdv01');
        await act(id, 'TBP_RETURN', 'tbp01', { reason: LY_DO_TRA_LAI });
        continue;
      }
      /*
       * `DA_XOA` thay cho `TU_CHOI` (`0155`).
       *
       * Đường tới nó đổi hẳn: trước là TBP bấm *Từ chối* một nước; giờ là TBP
       * TRẢ LẠI, rồi chính người lập bấm *Xoá*. Bản demo phải đi đúng đường ấy
       * — dựng trạng thái bằng cách ghi thẳng CSDL là bày ra một hồ sơ mà phần
       * mềm không tạo ra được, và nhật ký của nó sẽ trống ở giữa.
       */
      if (dich === 'DA_XOA') {
        await act(id, 'SUBMIT', 'tdv01');
        await act(id, 'TBP_RETURN', 'tbp01', {
          reason: 'Khách hàng đang quá hạn công nợ trên 90 ngày, chưa cấp CSBH mới.',
        });
        await xoaHoSo(id, 'tdv01');
        continue;
      }
      await dayToi(id, dich);
    }
  }

  // === Mẫu hợp đồng ĐÃ GỠ (`0165`) ==========================================
  //
  // Bản demo dùng chính mẫu hợp đồng mặc định mà `document` nạp lúc khởi động —
  // thứ khách hàng sẽ thấy trên máy chủ thật. Khối cũ dựng ba mẫu bằng `makeDocx`
  // ngay trong bộ nạp, tức một bố cục chỉ tồn tại trong mã seed.

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
  const tb = await donThongBao();

  console.log(
    `seed-demo: xong — ${NHOM.length} nhóm, ${SAN_PHAM.length} sản phẩm, ` +
      `${QUY_DINH_CK.length} quy định chiết khấu, ${KHACH.length} khách hàng, ` +
      `${daLap} hồ sơ (${SAP_QUA_HAN.length} sắp quá hạn, ${DA_QUA_HAN.length} đã quá hạn), ` +
      // KHÔNG còn đếm mẫu (`0165`): bộ nạp thôi tạo mẫu nào, nên một con số ở đây
      // sẽ nói về thứ nó không làm.
      `${SO_THU_HONG} thư hỏng, ` +
      `${lech} hồ sơ cần cập nhật, ${tb.tong} thông báo (${tb.chuaDoc} chưa đọc)`,
  );
}

/**
 * Vặn đồng hồ của hộp THÔNG BÁO cho khớp với lịch sử vừa dựng (`0096`).
 *
 * Không có bước này thì mở bản demo lên là một cái chuông báo vài trăm thông
 * báo, tất cả đề *vừa xong* — kể cả thông báo của những hồ sơ mang mốc 2024.
 * Lý do: thông báo do service `notification` ghi lúc nó tiêu thụ sự kiện, mà
 * `luiHoSo()` vặn `pol.policy` và `pol.policy_event` chứ không chạm tới `ntf`.
 *
 * BA VIỆC, theo đúng thứ tự này:
 *
 *   1. **Chờ hàng đợi lặng.** Đường đi qua RabbitMQ là bất đồng bộ thật; dừng
 *      sớm thì phần thông báo tới sau vẫn mang mốc hôm nay.
 *   2. **Kéo mốc về đúng sự kiện sinh ra nó.** Ghép theo `(policy_id, action)`,
 *      lấy lần GẦN NHẤT khi một hành động lặp lại — một hồ sơ bị trả lại hai lần
 *      có hai `TBP_RETURN`, và thông báo thuộc về lần sau.
 *   3. **Đánh dấu đã đọc phần cũ**, chừa 8 dòng mới nhất mỗi người. Một hộp chưa
 *      đọc 300 dòng và một hộp chưa đọc 0 dòng đều không cho người xem demo thấy
 *      cái huy hiệu làm việc gì.
 */
async function donThongBao(): Promise<{ tong: number; chuaDoc: number }> {
  const db = moKetNoi();
  await db.connect();
  try {
    const dem = async () =>
      Number(
        (await db.query<{ n: string }>(`SELECT count(*) AS n FROM ntf.thong_bao`)).rows[0]!.n,
      );

    // Lặng nghĩa là hai lượt đo liên tiếp cho cùng một con số — dấu hiệu đáng
    // tin duy nhất rằng không còn sự kiện nào trên đường.
    let truoc = -1;
    for (let i = 0; i < 40; i += 1) {
      const nay = await dem();
      if (nay > 0 && nay === truoc) break;
      truoc = nay;
      await new Promise((ok) => setTimeout(ok, 1_500));
    }

    await db.query(`
      UPDATE ntf.thong_bao t
         SET xay_ra_luc = m.at
        FROM (SELECT DISTINCT ON (policy_id, action) policy_id, action, at
                FROM pol.policy_event
               ORDER BY policy_id, action, at DESC) m
       WHERE m.policy_id = t.policy_id AND m.action = t.action
    `);

    await db.query(`
      WITH giu AS (
        SELECT id FROM (
          SELECT id, row_number() OVER (PARTITION BY user_id
                                            ORDER BY xay_ra_luc DESC, id DESC) AS hang
            FROM ntf.thong_bao) x
         WHERE hang <= 8)
      UPDATE ntf.thong_bao
         SET da_doc_luc = xay_ra_luc + interval '2 hours'
       WHERE id NOT IN (SELECT id FROM giu)
    `);

    const r = await db.query<{ tong: string; chua: string }>(
      `SELECT count(*) AS tong, count(*) FILTER (WHERE da_doc_luc IS NULL) AS chua
         FROM ntf.thong_bao`,
    );
    return { tong: Number(r.rows[0]!.tong), chuaDoc: Number(r.rows[0]!.chua) };
  } finally {
    await db.end();
  }
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
