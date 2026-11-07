/**
 * Bình luận trên hồ sơ (`0264`) — phần THUẦN của giao diện.
 *
 * Tách khỏi các component vì đây là chỗ sai được IM LẶNG: một bình luận mới hiện
 * hai lần, một phản hồi cũ chen vào giữa luồng, một cái tên được nhắc biến thành chữ
 * trơn lúc gửi — màn hình vẫn trông bình thường. Phần JSX thì sai là thấy.
 *
 * Mọi giới hạn (5.000 ký tự, 5 tệp, 10MB, nhịp 15 giây) đọc từ `GIOI_HAN_BINH_LUAN`
 * của `@csbh/domain-policy` — bản máy chủ cũng đọc. Không chép số nào ở đây.
 */
import { GIOI_HAN_BINH_LUAN, tachDoan, type MaCamXuc } from '@csbh/domain-policy';

// --- Hình dạng máy chủ trả về (`binh-luan.service.ts` của policy) -------------

export type TepBinhLuan = { id: string; ten: string; loai: string; co: number };
export type CamXucBay = { loai: MaCamXuc; so: number; cuaToi: boolean; nguoi: string[] };

export type MucBinhLuan = {
  id: string;
  parentId: string | null;
  stt: number;
  tacGia: { id: string; ten: string; vaiTro: string | null };
  cuaToi: boolean;
  /** `null` khi đã xoá — nội dung gốc không rời máy chủ. */
  noiDung: string | null;
  daXoa: boolean;
  taoLuc: string;
  suaLuc: string | null;
  camXuc: CamXucBay[];
  tep: TepBinhLuan[];
  /** Chỉ bình luận gốc: tổng số phản hồi trên máy chủ. */
  soPhanHoi?: number;
};

/** Một luồng = bình luận gốc + các phản hồi ĐÃ TẢI (tăng dần theo `stt`). */
export type Luong = MucBinhLuan & { phanHoi: MucBinhLuan[] };

export type TrangVe = { binhLuan: Luong[]; conCu: boolean; ten: Record<string, string>; moc: number };
export type ThayDoiVe = { thayDoi: MucBinhLuan[]; ten: Record<string, string>; moc: number; conNua: boolean };
export type PhanHoiVe = { phanHoi: MucBinhLuan[]; conCu: boolean; ten: Record<string, string> };

// --- Hợp nhất kết quả hỏi thay đổi -------------------------------------------

/**
 * Đưa một lô thay đổi vào danh sách đang bày, KHÔNG đổi chỗ thứ gì người đọc đang nhìn.
 *
 * Luật, theo đúng ba câu hỏi một mục thay đổi đặt ra:
 *
 *   1. *Đã có trên màn hình?* → thay tại chỗ (sửa, xoá, đổi cảm xúc, đổi số phản hồi).
 *      Bình luận gốc GIỮ các phản hồi đã tải: máy chủ trả gốc không kèm phản hồi.
 *   2. *Gốc chưa có?* → mới hơn gốc đầu đang bày thì là bình luận MỚI, chèn theo `stt`;
 *      cũ hơn thì là một bình luận ở trang chưa tải vừa bị sửa — BỎ QUA, không chen
 *      một bình luận cũ vào đầu luồng.
 *   3. *Phản hồi chưa có?* → gốc chưa tải thì bỏ qua; mới hơn phản hồi cuối đang bày
 *      thì nối vào cuối (phản hồi mới không bao giờ bị thu gọn — chốt mockup); cũ hơn
 *      thì nằm trong phần *Xem N phản hồi trước* chưa mở, bỏ qua.
 *
 * Trả `moi`: id các mục MỚI không phải của mình — để đếm *N bình luận mới* và tô nổi.
 * Gốc xử trước phản hồi: một lô có cả gốc mới lẫn phản hồi đầu tiên của nó.
 */
export function hopNhat(ds: Luong[], doi: MucBinhLuan[]): { ds: Luong[]; moi: string[] } {
  let ra = ds.slice();
  const moi: string[] = [];
  const goc = doi.filter((m) => m.parentId === null);
  const phan = doi.filter((m) => m.parentId !== null);

  for (const m of goc) {
    const i = ra.findIndex((g) => g.id === m.id);
    if (i >= 0) {
      ra[i] = { ...m, phanHoi: ra[i]!.phanHoi };
      continue;
    }
    if (ra.length > 0 && m.stt < ra[0]!.stt) continue;
    ra.push({ ...m, phanHoi: [] });
    ra.sort((a, b) => a.stt - b.stt);
    if (!m.cuaToi) moi.push(m.id);
  }

  for (const m of phan) {
    const gi = ra.findIndex((g) => g.id === m.parentId);
    if (gi < 0) continue;
    const g = ra[gi]!;
    const j = g.phanHoi.findIndex((p) => p.id === m.id);
    let phanHoi: MucBinhLuan[];
    if (j >= 0) {
      phanHoi = g.phanHoi.slice();
      phanHoi[j] = m;
    } else {
      const cuoi = g.phanHoi[g.phanHoi.length - 1];
      if (cuoi && m.stt < cuoi.stt) continue;
      phanHoi = [...g.phanHoi, m];
      if (!m.cuaToi) moi.push(m.id);
    }
    ra = ra.map((x, k) => (k === gi ? { ...g, phanHoi } : x));
  }
  return { ds: ra, moi };
}

/** Thay MỘT mục vừa ghi (mình gửi, sửa, xoá, thả cảm xúc) — cùng luật với `hopNhat`. */
export const thayMot = (ds: Luong[], m: MucBinhLuan): Luong[] => hopNhat(ds, [m]).ds;

/** Tổng số bình luận + phản hồi theo máy chủ, kể cả phần chưa tải. */
export const demTatCa = (ds: Luong[]): number =>
  ds.reduce((n, g) => n + 1 + Math.max(g.soPhanHoi ?? 0, g.phanHoi.length), 0);

/** Một mục theo id, gốc hay phản hồi. */
export function timMuc(ds: Luong[], id: string): MucBinhLuan | undefined {
  for (const g of ds) {
    if (g.id === id) return g;
    const p = g.phanHoi.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

// --- Dựng chữ để bày ----------------------------------------------------------

export type DoanBay =
  | { loai: 'chu'; chu: string }
  | { loai: 'nhac'; userId: string; ten: string }
  | { loai: 'lien-ket'; url: string };

/**
 * Nội dung → các đoạn để bày. Tên người được nhắc là tên HIỆN TẠI (yêu cầu 4):
 * máy chủ trả bảng `ten` cùng mỗi lượt đọc. Không tra được thì *"Người dùng"*.
 *
 * Phép tách là CHÍNH `tachDoan` của máy chủ — một chỗ quyết định thế nào là liên kết.
 */
export function doanBay(noiDung: string, ten: Record<string, string>): DoanBay[] {
  return tachDoan(noiDung).map((d) =>
    d.loai === 'nhac' ? { loai: 'nhac', userId: d.userId, ten: ten[d.userId] ?? 'Người dùng' } : d,
  );
}

// --- Nhắc tên trong ô soạn ----------------------------------------------------
//
// Ô soạn là `<textarea>` trơn: người gõ thấy `@Trần Thị Bích`, máy chủ nhận
// `@{uuid}`. Danh sách `NhacChon` nhớ những tên đã CHỌN từ danh sách gợi ý; lúc gửi,
// chỉ đúng những chuỗi ấy đổi thành dấu nhắc. Gõ tay `@Bích` mà không chọn thì là
// chữ trơn — đúng: máy chủ không có cách nào biết người gõ định nhắc ai.

export type NhacChon = { id: string; ten: string };

/** Độ dài tối đa của phần gõ sau `@` còn được coi là đang tìm người. */
const DAI_TIM = 30;

/**
 * Người dùng có đang gõ một lượt nhắc tên không: `@` đứng đầu ô hoặc sau khoảng
 * trắng, phần sau `@` tới con trỏ không có xuống dòng và không quá 30 ký tự.
 */
export function timNhacDangGo(chu: string, caret: number): { batDau: number; q: string } | null {
  const truoc = chu.slice(0, caret);
  const i = truoc.lastIndexOf('@');
  if (i < 0) return null;
  if (i > 0 && !/\s/.test(truoc[i - 1]!)) return null;
  const q = truoc.slice(i + 1);
  if (q.length > DAI_TIM || /[\n@]/.test(q)) return null;
  return { batDau: i, q };
}

/** Thay phần `@q` đang gõ bằng `@Tên ` — con trỏ đứng sau dấu cách. */
export function chenNhac(chu: string, caret: number, batDau: number, ng: NhacChon): { chu: string; caret: number } {
  const chen = `@${ng.ten} `;
  return { chu: chu.slice(0, batDau) + chen + chu.slice(caret), caret: batDau + chen.length };
}

const thoat = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Chữ trong ô → nội dung gửi máy chủ. Tên dài trước (`@Trần Thị Bích Ngọc` không bị
 * `@Trần Thị Bích` cắt mất), một lượt thay cho tất cả nên không thay chồng lên nhau.
 * Hai người trùng tên: người được chọn TRƯỚC thắng — đã nêu ở nhật ký.
 */
export function sangNoiDung(chu: string, nhac: NhacChon[]): string {
  if (nhac.length === 0) return chu;
  const theoTen = new Map<string, string>();
  for (const n of nhac) if (!theoTen.has(n.ten)) theoTen.set(n.ten, n.id);
  const ten = [...theoTen.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${ten.map(thoat).join('|')})`, 'g');
  return chu.replace(re, (_, t: string) => `@{${theoTen.get(t)!}}`);
}

/** Nội dung máy chủ → chữ trong ô (mở để sửa), kèm danh sách nhắc tên đã có. */
export function tuNoiDung(noiDung: string, ten: Record<string, string>): { chu: string; nhac: NhacChon[] } {
  const nhac: NhacChon[] = [];
  const chu = doanBay(noiDung, ten)
    .map((d) => {
      if (d.loai === 'chu') return d.chu;
      if (d.loai === 'lien-ket') return d.url;
      if (!nhac.some((n) => n.id === d.userId)) nhac.push({ id: d.userId, ten: d.ten });
      return `@${d.ten}`;
    })
    .join('');
  return { chu, nhac };
}

/**
 * Xoá lùi ngay sau một tên đã chọn thì xoá CẢ tên (lối của mọi ô nhắc tên): xoá từng
 * chữ thì `@Trần Thị Bíc` còn lại là chữ trơn mà người gõ tưởng vẫn là nhắc tên.
 * Trả `null` khi con trỏ không đứng sau tên nào — để phím Backspace làm việc thường.
 */
export function xoaLuiNhac(chu: string, caret: number, nhac: NhacChon[]): { chu: string; caret: number } | null {
  const truoc = chu.slice(0, caret);
  for (const n of [...nhac].sort((a, b) => b.ten.length - a.ten.length)) {
    const t = `@${n.ten}`;
    if (truoc.endsWith(t)) {
      const dau = caret - t.length;
      if (dau > 0 && !/\s/.test(chu[dau - 1]!)) continue;
      return { chu: chu.slice(0, dau) + chu.slice(caret), caret: dau };
    }
  }
  return null;
}

/** Tô đậm phần khớp trong tên ở danh sách gợi ý — không phân biệt hoa thường, theo NFC. */
export function tachKhop(ten: string, q: string): [string, string, string] {
  const t = ten.normalize('NFC');
  const k = q.normalize('NFC').toLowerCase().trim();
  const i = k === '' ? -1 : t.toLowerCase().indexOf(k);
  if (i < 0) return [t, '', ''];
  return [t.slice(0, i), t.slice(i, i + k.length), t.slice(i + k.length)];
}

// --- Tệp ----------------------------------------------------------------------

/** Cho `<input accept>` — chỉ là gợi ý cho hộp chọn tệp; máy chủ đọc byte đầu tệp. */
export const TEP_NHAN = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx';
const DUOI_NHAN = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx', 'xlsx'];

/**
 * Kiểm TRƯỚC khi tải lên — để người dùng khỏi chờ một tệp 40MB tải xong rồi mới bị
 * từ chối. Không thay phép kiểm của máy chủ (nó nhìn byte, ở đây chỉ nhìn tên và cỡ).
 */
export function kiemTepTruoc(f: { name: string; size: number }): string | null {
  const duoi = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!DUOI_NHAN.includes(duoi)) return 'Chỉ đính kèm được ảnh JPG, PNG, WebP, tệp PDF, Word (.docx) hoặc Excel (.xlsx).';
  if (f.size === 0) return 'Tệp rỗng.';
  if (f.size > GIOI_HAN_BINH_LUAN.coTepToiDaByte) {
    return `Tệp lớn hơn ${GIOI_HAN_BINH_LUAN.coTepToiDaByte / 1024 / 1024}MB.`;
  }
  return null;
}

export type LoaiTep = 'anh' | 'pdf' | 'docx' | 'xlsx' | 'khac';
export function loaiTep(contentTypeHoacTen: string): LoaiTep {
  const s = contentTypeHoacTen.toLowerCase();
  if (s.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(s)) return 'anh';
  if (s === 'application/pdf' || s.endsWith('.pdf')) return 'pdf';
  if (s.includes('wordprocessingml') || s.endsWith('.docx')) return 'docx';
  if (s.includes('spreadsheetml') || s.endsWith('.xlsx')) return 'xlsx';
  return 'khac';
}
export const NHAN_LOAI_TEP: Record<LoaiTep, string> = { anh: 'ẢNH', pdf: 'PDF', docx: 'DOCX', xlsx: 'XLSX', khac: 'TỆP' };

/** `412 KB`, `1,2 MB` — kiểu số Việt Nam. */
export function coChu(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Đường tải tệp bình luận lên `document`. */
export const duongTaiTep = (hoSoId: string, ten: string): string =>
  `/files?ownerKind=POLICY&ownerId=${encodeURIComponent(hoSoId)}&purpose=BINH_LUAN&fileName=${encodeURIComponent(ten)}`;

// --- Liên kết tới một bình luận -----------------------------------------------

export const neoBinhLuan = (id: string): string => `binh-luan-${id}`;

/** `#binh-luan-<uuid>` → uuid, mọi thứ khác → `null`. */
export function idTuNeo(hash: string): string | null {
  const m = /^#binh-luan-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(hash);
  return m ? m[1]!.toLowerCase() : null;
}

/** Liên kết đầy đủ để *Sao chép liên kết* — dán vào đâu cũng mở đúng bình luận. */
export const lienKetBinhLuan = (goc: string, hoSoId: string, id: string): string =>
  `${goc}/ho-so/${hoSoId}#${neoBinhLuan(id)}`;

/** Tên đọc được của sáu cảm xúc — cho `aria-label`; emoji không đọc lên được nghĩa. */
export const NHAN_CAM_XUC: Record<MaCamXuc, string> = {
  THICH: 'Thích',
  YEU: 'Yêu thích',
  MUNG: 'Chúc mừng',
  XEM: 'Đang xem',
  TIEN: 'Tiến lên',
  VUI: 'Vui',
};

/** *Tự cập nhật · 15 giây trước* — đầu khối (chốt mockup). */
export function nhanCapNhat(luc: number | null, bayGio = Date.now()): string {
  if (luc === null) return 'Tự cập nhật';
  const giay = Math.max(0, Math.round((bayGio - luc) / 1000));
  if (giay < 5) return 'Tự cập nhật · vừa xong';
  if (giay < 60) return `Tự cập nhật · ${giay} giây trước`;
  return `Tự cập nhật · ${Math.floor(giay / 60)} phút trước`;
}
