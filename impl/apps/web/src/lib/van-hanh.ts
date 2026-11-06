/**
 * Trang Vận hành (`0255`) — phần THUẦN: kiểu dữ liệu, nhãn tiếng Việt, mô tả lịch, kiểm ô
 * nhập, và phép dựng danh sách cảnh báo từ dữ liệu thẻ Sức khoẻ.
 *
 * NGƯỜI DÙNG KHÔNG CÓ CHUYÊN MÔN IT (chốt 05/11): mọi chữ đi ra màn hình nằm ở đây hoặc ở
 * component, và không câu nào được mang thuật ngữ máy (dump, volume, container, outbox,
 * cron…). Máy chủ trả DỮ LIỆU có cấu trúc; câu chữ là việc của tệp này.
 *
 * Tách khỏi `.tsx` để `tests/http/` (không bật `jsx`) đối chiếu được bảng giới hạn ở đây với
 * bảng của máy chủ — lối `0172`.
 */

export type The = 'suc-khoe' | 'o-dia' | 'sao-luu' | 'tep-log' | 'thu-hang-doi' | 'lich-tu-dong';

export const THE: { khoa: The; nhan: string }[] = [
  { khoa: 'suc-khoe', nhan: 'Sức khoẻ' },
  { khoa: 'o-dia', nhan: 'Ổ đĩa' },
  { khoa: 'sao-luu', nhan: 'Sao lưu' },
  { khoa: 'tep-log', nhan: 'Tệp log' },
  { khoa: 'thu-hang-doi', nhan: 'Thư & hàng đợi' },
  { khoa: 'lich-tu-dong', nhan: 'Lịch tự động' },
];

/** Thẻ đang mở đọc từ `#…` của địa chỉ — thư cảnh báo ổ đĩa dẫn tới `/van-hanh#o-dia`. */
export const theTuHash = (hash: string): The => {
  const k = hash.replace(/^#/, '');
  return THE.some((t) => t.khoa === k) ? (k as The) : 'suc-khoe';
};

// --- Dữ liệu từ máy chủ ------------------------------------------------------

export type SucKhoe = {
  thanhPhan: { ok: boolean; services: { service: string; ok: boolean; status?: number; error?: string }[] };
  hangDoiLoi: { hangDoi: string; so: number | null }[];
  suKienChoPhat: { nguon: string; so: number }[];
  thuHong: number;
  saoLuu: { viec: string; quaHan: boolean; lanThanhCong: string | null; lanGanNhat: string | null }[];
  oDia: { o: string; phanTram: number; vuotNguong: boolean; duBaoNgayDay: number | null }[];
  tacTu: { online: boolean; lanCuoi: string | null };
  container: { service: string; trangThai: string; sucKhoe: string | null; moTa: string | null; luc: string }[];
};

export type Viec = 'SAO_LUU_CSDL' | 'SAO_LUU_KHO_TEP' | 'NEN_LOG' | 'DON_DU_LIEU';
export type TanSuat = 'MOI_6_GIO' | 'MOI_12_GIO' | 'HANG_NGAY' | 'HANG_TUAN';

export type LanChay = {
  batDau: string;
  ketThuc: string | null;
  ketQua: 'DANG_CHAY' | 'THANH_CONG' | 'LOI';
  tuDong: boolean;
  chiTiet: string | null;
};

export type DongLich = {
  viec: Viec;
  tanSuat: TanSuat;
  gioChay: string;
  thuTrongTuan: number | null;
  giuToiDa: number | null;
  lanToi: string;
  lanGanNhat: LanChay | null;
};

export type ViecTay = {
  id: string;
  loai: 'SAO_LUU_CSDL' | 'SAO_LUU_KHO_TEP';
  trangThai: 'CHO' | 'DANG_CHAY' | 'THANH_CONG' | 'LOI';
  taoLuc: string;
  ketThuc: string | null;
  chiTiet: string | null;
};

// --- Nhãn ---------------------------------------------------------------------

export const NHAN_VIEC: Record<Viec, string> = {
  SAO_LUU_CSDL: 'Sao lưu cơ sở dữ liệu',
  SAO_LUU_KHO_TEP: 'Sao lưu kho tệp',
  NEN_LOG: 'Nén log ngày trước',
  DON_DU_LIEU: 'Dọn dữ liệu hết hạn',
};

/**
 * Giới hạn "giữ tối đa" của từng việc — BẢN CHÉP của `GIU_TOI_DA` ở
 * `services/van-hanh/src/lich/lich.controller.ts`. Máy chủ mới là chốt; bản này chỉ để
 * báo lỗi ngay dưới ô trước khi gửi. `tests/http/van-hanh-giao-dien.test.ts` đòi hai bảng
 * khớp từng khoá.
 */
export const GIU_TOI_DA: Record<Viec, { min: number; max: number; donVi: string } | null> = {
  SAO_LUU_CSDL: { min: 1, max: 60, donVi: 'bản' },
  SAO_LUU_KHO_TEP: { min: 1, max: 60, donVi: 'bản chụp' },
  NEN_LOG: { min: 1, max: 90, donVi: 'tệp' },
  DON_DU_LIEU: null,
};

/** Việc chỉ chạy hằng ngày — không có ô tần suất. Bản chép `CHI_HANG_NGAY` của máy chủ. */
export const CHI_HANG_NGAY: readonly Viec[] = ['NEN_LOG', 'DON_DU_LIEU'];

export const TAN_SUAT: { khoa: TanSuat; nhan: string }[] = [
  { khoa: 'MOI_6_GIO', nhan: 'Mỗi 6 giờ' },
  { khoa: 'MOI_12_GIO', nhan: 'Mỗi 12 giờ' },
  { khoa: 'HANG_NGAY', nhan: 'Hằng ngày' },
  { khoa: 'HANG_TUAN', nhan: 'Hằng tuần' },
];

/** Thứ theo ISO (1 = Thứ 2 … 7 = Chủ nhật) — đúng quy ước `ops.moc_truoc`. */
export const THU: { so: number; nhan: string }[] = [
  { so: 1, nhan: 'Thứ 2' },
  { so: 2, nhan: 'Thứ 3' },
  { so: 3, nhan: 'Thứ 4' },
  { so: 4, nhan: 'Thứ 5' },
  { so: 5, nhan: 'Thứ 6' },
  { so: 6, nhan: 'Thứ 7' },
  { so: 7, nhan: 'Chủ nhật' },
];

export function moTaLich(l: Pick<DongLich, 'tanSuat' | 'gioChay' | 'thuTrongTuan'>): string {
  switch (l.tanSuat) {
    case 'HANG_NGAY':
      return `Hằng ngày lúc ${l.gioChay}`;
    case 'HANG_TUAN':
      return `${THU.find((t) => t.so === l.thuTrongTuan)?.nhan ?? 'Một ngày'} hằng tuần lúc ${l.gioChay}`;
    case 'MOI_6_GIO':
      return `Mỗi 6 giờ, bắt đầu ${l.gioChay}`;
    case 'MOI_12_GIO':
      return `Mỗi 12 giờ, bắt đầu ${l.gioChay}`;
  }
}

export type BieuMauLich = { tanSuat: TanSuat; gioChay: string; thuTrongTuan: string; giuToiDa: string };

/**
 * Kiểm biểu mẫu lịch TRƯỚC khi gửi. Trả lỗi theo TỪNG Ô — tên ô trùng `field` máy chủ trả
 * về, nên một câu lỗi từ máy chủ rơi đúng vào cùng chỗ.
 */
export function kiemLich(viec: Viec, f: BieuMauLich): Partial<Record<keyof BieuMauLich, string>> {
  const loi: Partial<Record<keyof BieuMauLich, string>> = {};
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.gioChay.trim())) loi.gioChay = 'Giờ chạy viết dạng giờ:phút, ví dụ 01:15.';
  if (f.tanSuat === 'HANG_TUAN' && !THU.some((t) => String(t.so) === f.thuTrongTuan)) loi.thuTrongTuan = 'Chọn thứ trong tuần.';
  const g = GIU_TOI_DA[viec];
  if (g) {
    const n = Number(f.giuToiDa);
    if (!/^\d+$/.test(f.giuToiDa.trim()) || n < g.min || n > g.max) {
      loi.giuToiDa = `Số ${g.donVi} giữ lại phải từ ${g.min} đến ${g.max}.`;
    }
  }
  return loi;
}

/** Thân gửi lên `PUT /van-hanh/lich/:viec` — chỉ gọi sau khi `kiemLich` trả rỗng. */
export function thanLich(viec: Viec, f: BieuMauLich) {
  const tanSuat = CHI_HANG_NGAY.includes(viec) ? 'HANG_NGAY' : f.tanSuat;
  return {
    tanSuat,
    gioChay: f.gioChay.trim(),
    ...(tanSuat === 'HANG_TUAN' ? { thuTrongTuan: Number(f.thuTrongTuan) } : {}),
    ...(GIU_TOI_DA[viec] ? { giuToiDa: Number(f.giuToiDa) } : {}),
  };
}

export const NHAN_KET_QUA: Record<string, { nhan: string; lop: string }> = {
  THANH_CONG: { nhan: 'thành công', lop: 'nhan-tot' },
  LOI: { nhan: 'hỏng', lop: 'nhan-loi' },
  DANG_CHAY: { nhan: 'đang chạy', lop: 'nhan-cho' },
  CHO: { nhan: 'đang chờ', lop: 'nhan-cho' },
};

/** Tên thành phần cho người không chuyên IT — tên máy đứng cạnh, nhỏ, để báo lại cho người vận hành. */
export const NHAN_THANH_PHAN: Record<string, string> = {
  gateway: 'Cổng vào phần mềm',
  identity: 'Đăng nhập và tài khoản',
  catalog: 'Danh mục sản phẩm',
  customer: 'Khách hàng',
  policy: 'Hồ sơ CSBH',
  document: 'Tệp và văn bản',
  notification: 'Thư và thông báo',
  audit: 'Nhật ký',
  reporting: 'Thống kê',
  'sla-worker': 'Hạn xử lý hồ sơ',
  'van-hanh': 'Vận hành',
  postgres: 'Cơ sở dữ liệu',
  redis: 'Bộ nhớ tạm',
  rabbitmq: 'Hàng đợi sự kiện',
  minio: 'Kho tệp',
  gotenberg: 'Dựng bản PDF',
  caddy: 'Cổng web',
};
export const HA_TANG = ['postgres', 'redis', 'rabbitmq', 'minio', 'gotenberg', 'caddy'];

export const NHAN_HANG_DOI: Record<string, string> = {
  'thong-bao': 'Thông báo',
  tep: 'Tệp',
  'ho-so': 'Hồ sơ',
  'nhat-ky': 'Nhật ký',
  'bao-cao': 'Thống kê',
};
export const NHAN_NGUON: Record<string, string> = {
  pol: 'Hồ sơ',
  cus: 'Khách hàng',
  cat: 'Danh mục',
  doc: 'Tệp',
  idn: 'Tài khoản',
  ops: 'Vận hành',
};
export const NHAN_HANG_MUC: Record<string, string> = {
  csdl: 'Cơ sở dữ liệu',
  'kho-tep': 'Kho tệp',
  'ban-sao-luu': 'Bản sao lưu',
  'tep-log': 'Tệp log',
};
export const NHAN_O: Record<string, string> = { 'du-lieu': 'Ổ dữ liệu', 'ban-sao-ngoai': 'Ổ bản sao ngoài' };
/** Vùng lưu trữ do tác tử đo — chỉ đặt tên cho những vùng người dùng nhận ra được. */
export const NHAN_VUNG: Record<string, string> = {
  pgdata: 'Cơ sở dữ liệu',
  miniodata: 'Kho tệp',
  pgbackup: 'Bản sao lưu',
  'anh-docker': 'Bản cài phần mềm',
};

/** Cỡ cho người đọc: 1 024 byte = 1 KB, một chữ số thập phân, dấu phẩy thập phân. */
export function coTep(byte: number | null | undefined): string {
  if (byte === null || byte === undefined || !Number.isFinite(byte)) return '—';
  const dv = ['byte', 'KB', 'MB', 'GB', 'TB'];
  let v = byte;
  let i = 0;
  while (v >= 1024 && i < dv.length - 1) {
    v /= 1024;
    i++;
  }
  const so = i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1).replace('.', ',');
  return `${so} ${dv[i]}`;
}

// --- Cảnh báo thẻ Sức khoẻ ------------------------------------------------------

export type CanhBao = { muc: 'do' | 'vang'; cau: string; the: The };

/**
 * Danh sách việc cần chú ý, dựng từ dữ liệu thô. Một câu cho một VIỆC phải làm — không liệt
 * kê từng con số.
 *
 * THỨ TỰ ĐẨY VÀO LÀ THỨ TỰ HIỆN — mọi khối đỏ đứng trước mọi khối vàng ngay trong thân hàm.
 * Bản đầu có thêm một phép sắp "đỏ trước vàng" ở cuối; phá lại cho thấy nó là mã chết (gỡ đi
 * vẫn xanh), nên gỡ hẳn. Thêm một cảnh báo mới thì đặt nó vào đúng khối màu của nó.
 */
export function canhBao(sk: SucKhoe): CanhBao[] {
  const ds: CanhBao[] = [];
  const hong = sk.thanhPhan.services.filter((s) => !s.ok).map((s) => NHAN_THANH_PHAN[s.service] ?? s.service);
  const htHong = sk.container
    .filter((c) => HA_TANG.includes(c.service) && (c.trangThai !== 'running' || c.sucKhoe === 'unhealthy'))
    .map((c) => NHAN_THANH_PHAN[c.service] ?? c.service);
  const tatCa = [...new Set([...hong, ...htHong])];
  if (tatCa.length > 0) {
    ds.push({ muc: 'do', cau: `Không trả lời: ${tatCa.join(', ')}. Báo người vận hành máy chủ.`, the: 'suc-khoe' });
  }
  for (const s of sk.saoLuu) {
    const ten = s.viec === 'SAO_LUU_CSDL' ? 'cơ sở dữ liệu' : 'kho tệp';
    if (s.lanGanNhat === 'LOI') ds.push({ muc: 'do', cau: `Lượt sao lưu ${ten} gần nhất bị hỏng.`, the: 'sao-luu' });
    else if (s.quaHan) ds.push({ muc: 'do', cau: `Sao lưu ${ten} chưa chạy đúng lịch.`, the: 'sao-luu' });
  }
  for (const o of sk.oDia) {
    if (!o.vuotNguong) continue;
    const du = o.duBaoNgayDay === null ? '' : ` — đầy sau khoảng ${o.duBaoNgayDay} ngày nếu giữ tốc độ hiện tại`;
    ds.push({ muc: 'vang', cau: `${NHAN_O[o.o] ?? o.o} đã dùng ${String(o.phanTram).replace('.', ',')}%${du}.`, the: 'o-dia' });
  }
  if (sk.thuHong > 0) ds.push({ muc: 'vang', cau: `${sk.thuHong} thư gửi hỏng chưa xử lý.`, the: 'thu-hang-doi' });
  const loi = sk.hangDoiLoi.reduce((t, h) => t + (h.so ?? 0), 0);
  if (loi > 0) ds.push({ muc: 'vang', cau: `${loi} sự kiện bị bên nhận xử lý hỏng.`, the: 'thu-hang-doi' });
  if (!sk.tacTu.online) {
    ds.push({
      muc: 'vang',
      cau: 'Máy chủ chưa sẵn sàng nhận lệnh: nút "Sao lưu ngay" tạm khoá. Sao lưu theo lịch vẫn chạy.',
      the: 'sao-luu',
    });
  }
  return ds;
}

// --- Dòng log ---------------------------------------------------------------------

export type DongLog = { luc: string; muc: 'loi' | 'canh-bao' | 'thuong'; traceId: string | null; noiDung: string };

/**
 * Một dòng của tệp log: dòng JSON của service ứng dụng (`LoggerTep`, `0249`) hoặc dòng thô
 * của hạ tầng (`<dấu thời gian> <chữ>`, `0254`). Không đọc được thì bày nguyên văn.
 */
export function docDongLog(d: string): DongLog {
  try {
    const j = JSON.parse(d) as Record<string, unknown>;
    const m = String(j['muc'] ?? '');
    return {
      luc: String(j['t'] ?? ''),
      muc: m === 'error' || m === 'fatal' ? 'loi' : m === 'warn' ? 'canh-bao' : 'thuong',
      traceId: typeof j['traceId'] === 'string' ? (j['traceId'] as string) : null,
      noiDung: [j['msg'], j['stack']].filter((x) => typeof x === 'string' && x !== '').join('\n'),
    };
  } catch {
    const i = d.indexOf(' ');
    const dau = i > 0 ? d.slice(0, i) : '';
    const coLuc = /^\d{4}-\d{2}-\d{2}T/.test(dau);
    return { luc: coLuc ? dau : '', muc: 'thuong', traceId: null, noiDung: coLuc ? d.slice(i + 1) : d };
  }
}

export const laMaTraCuu = (s: string): boolean => /^[A-Za-z0-9_-]{4,64}$/.test(s);

/** `log-2026-11-04.tar.gz` (hoặc `…-2.tar.gz`) → `04/11/2026`. */
export const ngayCuaTepLog = (ten: string): string | null => /^log-(\d{4})-(\d{2})-(\d{2})/.exec(ten)?.slice(1).reverse().join('/') ?? null;
