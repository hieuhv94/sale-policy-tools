/**
 * Bình luận trên hồ sơ CSBH (`0261`) — phần THUẦN mà máy chủ và giao diện cùng đọc.
 *
 * Ở GÓI NÀY vì cùng lý do `tinh-nang.ts`: giới hạn khai ở hai chỗ là hai chỗ sẽ
 * lệch, và lệch theo chiều nào cũng hỏng — giao diện cho gõ 6.000 ký tự rồi máy
 * chủ từ chối, hoặc giao diện chặn ở 4.000 trong khi máy chủ nhận 5.000.
 *
 * ## Nhắc tên nằm NGAY TRONG CHỮ, dạng `@{<user id>}`
 *
 * Không gửi kèm một danh sách vị trí (`[{userId, tu, den}]`) như đặc tả gợi ý:
 * hai thứ đi song song thì trôi khỏi nhau được — vị trí đếm theo đơn vị UTF-16
 * ở trình duyệt, theo code point ở máy chủ, lệch một emoji là lệch cả dải, và
 * máy chủ phải kiểm thêm một lớp "vị trí có khớp chữ không". Đặt dấu nhắc trong
 * chính nội dung thì danh sách người được nhắc là thứ ĐỌC RA từ chữ, không có
 * gì để lệch.
 *
 * Tên KHÔNG lưu — chỉ id. Người được nhắc đổi tên thì bình luận cũ hiện tên mới
 * (yêu cầu 4), vì tên tra lúc đọc.
 */

export const GIOI_HAN_BINH_LUAN = Object.freeze({
  /** Đếm theo code point, mỗi dấu nhắc tính MỘT — xem `demKyTu`. */
  kyTuToiDa: 5000,
  nhacToiDa: 20,
  tepToiDa: 5,
  coTepToiDaByte: 10 * 1024 * 1024,
  /** Số bình luận gốc mỗi lượt tải. */
  trangGoc: 20,
  /** Số reply mỗi lượt *Xem N phản hồi trước*. */
  trangPhanHoi: 20,
  /** Số reply MỚI NHẤT bày sẵn dưới mỗi bình luận gốc (chốt khi duyệt mockup). */
  phanHoiXemTruoc: 3,
  /** Nhịp hỏi thay đổi khi đang mở khu vực bình luận — chậm nhất 30 giây tính cả mạng. */
  nhipHoiTrangMs: 15_000,
  /** Độ dài trích đoạn trong thông báo. */
  trichDoan: 100,
});

/**
 * Bộ cảm xúc CỐ ĐỊNH. Khoá là mã chữ để đi trên địa chỉ (`/cam-xuc/THICH`) —
 * một emoji trên URL là một chuỗi phải mã hoá phần trăm, và mỗi trình duyệt
 * chuẩn hoá nó một kiểu.
 *
 * Thứ tự là thứ tự bày trên bảng chọn.
 */
export const CAM_XUC = Object.freeze({
  THICH: '👍',
  YEU: '❤️',
  MUNG: '🎉',
  XEM: '👀',
  TIEN: '🚀',
  VUI: '😄',
} as const);
export type MaCamXuc = keyof typeof CAM_XUC;
export const MA_CAM_XUC = Object.keys(CAM_XUC) as MaCamXuc[];
export const laMaCamXuc = (s: string): s is MaCamXuc => (MA_CAM_XUC as string[]).includes(s);

/** Một dấu nhắc tên. Id là uuid chữ thường — đúng dạng Postgres trả ra. */
export const DAU_NHAC = /@\{([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}/g;

/** Chèn một dấu nhắc — giao diện gọi khi người dùng chọn một người trong danh sách `@`. */
export const dauNhac = (userId: string): string => `@{${userId.toLowerCase()}}`;

/**
 * Chuẩn hoá nội dung TRƯỚC khi đếm, kiểm và lưu.
 *
 * NFC vì tiếng Việt viết được bằng hai dạng Unicode trông giống hệt nhau
 * (`0151`, `0205`): không chuẩn hoá thì cùng một câu đếm ra hai độ dài. Cắt
 * khoảng trắng ĐẦU và CUỐI (kể cả dòng trống), giữ nguyên khoảng trắng giữa
 * chữ — xuống dòng là một phần của nội dung người dùng gõ.
 *
 * `\r\n` → `\n`: dán từ Windows ra hai ký tự cho một lần xuống dòng, và hai cách
 * xuống dòng trong cùng một bình luận làm `white-space: pre-wrap` hiện hai dòng
 * trống ở chỗ người gõ chỉ thấy một.
 */
export const chuanNoiDung = (s: string): string =>
  s.normalize('NFC').replace(/\r\n?/g, '\n').trim();

/** Độ dài như người dùng thấy: code point, mỗi dấu nhắc tính một ký tự. */
export const demKyTu = (s: string): number => [...s.replace(DAU_NHAC, '@')].length;

/** Mọi id được nhắc, KHÔNG trùng, đúng thứ tự xuất hiện lần đầu. */
export const nguoiDuocNhac = (s: string): string[] => [
  ...new Set([...s.matchAll(DAU_NHAC)].map((m) => m[1]!)),
];

export type LoiNoiDung = 'BINH_LUAN_RONG' | 'BINH_LUAN_QUA_DAI' | 'QUA_NHIEU_NHAC_TEN';

/**
 * Kiểm một nội dung đã chuẩn hoá. Trả MÃ LỖI chứ không ném — giao diện gọi
 * đúng hàm này để xám nút Gửi, và máy chủ đổi mã thành ngoại lệ HTTP.
 *
 * `coTep`: bình luận chỉ có tệp, không chữ, là hợp lệ (yêu cầu 3.1).
 */
export function kiemNoiDung(noiDung: string, coTep = false): LoiNoiDung | null {
  if (noiDung === '' && !coTep) return 'BINH_LUAN_RONG';
  if (demKyTu(noiDung) > GIOI_HAN_BINH_LUAN.kyTuToiDa) return 'BINH_LUAN_QUA_DAI';
  if (nguoiDuocNhac(noiDung).length > GIOI_HAN_BINH_LUAN.nhacToiDa) return 'QUA_NHIEU_NHAC_TEN';
  return null;
}

export type DoanChu =
  | { loai: 'chu'; chu: string }
  | { loai: 'nhac'; userId: string }
  | { loai: 'lien-ket'; url: string };

/**
 * Liên kết: CHỈ `http://` và `https://` (yêu cầu 3.1). Dừng ở khoảng trắng, và
 * bỏ dấu câu dính ở cuối — *"xem https://a.b/x)."* là liên kết `https://a.b/x`
 * cộng `).`, không phải một địa chỉ kết thúc bằng dấu chấm.
 */
const LIEN_KET = /https?:\/\/[^\s<>"]+/g;
const DUOI_CAU = /[.,;:!?)\]}'"»”’]+$/;

/**
 * Tách nội dung thành các đoạn để HIỂN THỊ — chữ, nhắc tên, liên kết.
 *
 * Giao diện dựng từng đoạn bằng nút chữ của React, KHÔNG BAO GIỜ chèn HTML: đây
 * là lý do cả lớp lỗi "chèn script" không tồn tại ở tính năng này, và máy chủ
 * không phải lọc HTML. `javascript:` không khớp mẫu nên không bao giờ thành
 * liên kết.
 */
export function tachDoan(noiDung: string): DoanChu[] {
  const ra: DoanChu[] = [];
  const themChu = (chu: string) => {
    if (chu === '') return;
    const cuoi = ra[ra.length - 1];
    if (cuoi?.loai === 'chu') cuoi.chu += chu;
    else ra.push({ loai: 'chu', chu });
  };
  const tachLienKet = (chu: string) => {
    let i = 0;
    for (const m of chu.matchAll(LIEN_KET)) {
      const tho = m[0];
      const duoi = DUOI_CAU.exec(tho)?.[0] ?? '';
      const url = tho.slice(0, tho.length - duoi.length);
      themChu(chu.slice(i, m.index));
      if (/^https?:\/\/[^/]/.test(url)) ra.push({ loai: 'lien-ket', url });
      else themChu(url);
      themChu(duoi);
      i = m.index! + tho.length;
    }
    themChu(chu.slice(i));
  };
  let i = 0;
  for (const m of noiDung.matchAll(DAU_NHAC)) {
    tachLienKet(noiDung.slice(i, m.index));
    ra.push({ loai: 'nhac', userId: m[1]! });
    i = m.index! + m[0].length;
  }
  tachLienKet(noiDung.slice(i));
  return ra;
}

/**
 * Trích đoạn cho thông báo: dấu nhắc thay bằng `@tên`, gộp mọi khoảng trắng về
 * một dấu cách, cắt ở `GIOI_HAN_BINH_LUAN.trichDoan` code point kèm dấu ba chấm.
 *
 * Tên tra từ `ten` lúc DỰNG thông báo — thông báo là một bản chụp, khác bình
 * luận (đọc tên sống).
 */
export function trichDoan(noiDung: string, ten: (userId: string) => string | undefined): string {
  const phang = noiDung
    .replace(DAU_NHAC, (_, id: string) => `@${ten(id) ?? 'người dùng'}`)
    .replace(/\s+/g, ' ')
    .trim();
  const kt = [...phang];
  const n = GIOI_HAN_BINH_LUAN.trichDoan;
  return kt.length <= n ? phang : `${kt.slice(0, n).join('').trimEnd()}…`;
}
