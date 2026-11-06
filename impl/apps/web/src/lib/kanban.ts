/**
 * KANBAN HỒ SƠ THEO VAI TRÒ (`0257`) — phần thuần của trang danh sách hồ sơ.
 *
 * Khách hàng chọn PHƯƠNG ÁN 2 khi duyệt mockup: MỖI TRẠNG THÁI MỘT CỘT, không kéo
 * thả, cột đứng theo THỨ TỰ LUỒNG (giống nhau với mọi người — hai người nói chuyện
 * với nhau về "cột thứ ba" thì cùng một cột). Thứ đổi theo vai trò là MỨC HIỂN THỊ
 * của từng cột, chốt bằng ma trận trong mockup:
 *
 *   V  Việc của bạn — luôn mở, tô viền, không gập được
 *   M  mở sẵn
 *   G  gập thành dải hẹp (tên + số), bấm để mở
 *   A  ẩn — trạng thái nằm ngoài phạm vi dữ liệu của vai trò
 *
 * Hai luật đứng TRÊN ma trận:
 *   - **Cột không có hồ sơ nào thì ẩn, ở MỌI mức** (khách hàng chốt khi duyệt), kể
 *     cả *Việc của bạn*. Trang ghi tên các cột đang ẩn vì trống, để không ai tưởng
 *     phần mềm mất cột.
 *   - **`A` không bao giờ giấu hồ sơ**: phạm vi dữ liệu là việc của MÁY CHỦ; ma
 *     trận chỉ đoán trước cột nào thường trống. Lỡ có hồ sơ ở trạng thái ấy thì cột
 *     hiện ra ở dạng gập.
 */
import { CHU_BUOC, type Role, type Status } from '@csbh/domain-policy';

/** Mười một trạng thái theo thứ tự luồng duyệt. */
export const LUONG: readonly Status[] = [
  'NHAP',
  'YEU_CAU_CHINH_SUA',
  'CHO_TBP_DUYET',
  'CHO_KT_L1',
  'SA_DANG_XU_LY',
  'SA_SUA_BAN_CUNG',
  'CHO_KT_L2',
  'DANG_CO_HIEU_LUC',
  'HET_HIEU_LUC',
  'QUA_HAN_DUYET',
  'DA_XOA',
];

export type Muc = 'V' | 'M' | 'G' | 'A';
export type VaiTroKanban = Exclude<Role, 'QUAN_TRI' | 'SYSTEM'>;

/**
 * VIỆC CỦA AI = `CHU_BUOC` của `domain-policy` (cùng bảng chuông thông báo đọc —
 * cột *Việc của bạn* và con số đỏ trên chuông không thể nói hai điều khác nhau),
 * CỘNG `NHAP → TDV`. `CHU_BUOC` cố ý không có `NHAP`: bảng ấy nói ai phải làm gì
 * khi hồ sơ ĐÃ vào luồng (`0192`), còn một bản Nháp thì chưa vào luồng nào — nhưng
 * trên bảng việc của trình dược viên, bản Nháp của họ đúng là việc của họ.
 */
const VIEC: Partial<Record<Status, Role>> = { ...CHU_BUOC, NHAP: 'TDV' };

/**
 * Mức của các cột KHÔNG phải việc của người xem — ma trận đã duyệt trong mockup.
 * Cột *Việc của bạn* không khai ở đây: nó suy từ `VIEC`, nên đổi chủ bước ở máy
 * trạng thái là bảng việc đổi theo, không phải sửa hai chỗ.
 */
const MUC_KHAC: Record<VaiTroKanban, Partial<Record<Status, Exclude<Muc, 'V'>>>> = {
  // TDV theo dõi hồ sơ mình đi tới đâu; SA sửa bản cứng là việc giữa KT và SA.
  TDV: { CHO_TBP_DUYET: 'M', CHO_KT_L1: 'M', SA_DANG_XU_LY: 'M', CHO_KT_L2: 'M' },
  // TBP còn quyền Hoàn duyệt ở bốn bước sau khi ký (`0185`, `0225`); Nháp chưa
  // vào phạm vi của TBP cho tới lượt gửi duyệt.
  TBP: {
    NHAP: 'A',
    YEU_CAU_CHINH_SUA: 'M',
    CHO_KT_L1: 'M',
    SA_DANG_XU_LY: 'M',
    SA_SUA_BAN_CUNG: 'M',
    CHO_KT_L2: 'M',
  },
  // Hai cột Sale Admin nằm giữa hai bàn của Kế toán: hồ sơ sắp quay lại bàn mình.
  // Kế toán chỉ thấy hồ sơ đã từng qua TBP (`0157`) nên không bao giờ có Nháp.
  KE_TOAN: { NHAP: 'A', SA_DANG_XU_LY: 'M', SA_SUA_BAN_CUNG: 'M' },
  // Sale Admin được giao từ lượt tiếp nhận L1 (`0141`); bản cứng vừa bàn giao còn
  // có thể bị yêu cầu in lại.
  SALE_ADMIN: { NHAP: 'A', CHO_KT_L2: 'M' },
  // Năm bàn chờ có hạn xử lý: thấy tắc ở đâu; quá hạn duyệt là sự cố cần biết.
  BAN_LANH_DAO: {
    CHO_TBP_DUYET: 'M',
    CHO_KT_L1: 'M',
    SA_DANG_XU_LY: 'M',
    SA_SUA_BAN_CUNG: 'M',
    CHO_KT_L2: 'M',
    QUA_HAN_DUYET: 'M',
  },
};

export function mucCot(vaiTro: VaiTroKanban, st: Status): Muc {
  if (VIEC[st] === vaiTro) return 'V';
  return MUC_KHAC[vaiTro][st] ?? 'G';
}

export function laVaiTroKanban(r: string | undefined): r is VaiTroKanban {
  return r !== undefined && r in MUC_KHAC;
}

/** Lựa chọn tay của người xem: mở một cột mặc định gập, hoặc gập một cột mặc định mở. */
export type ChonTay = Partial<Record<Status, 'mo' | 'gap'>>;

export type Cot = { trangThai: Status; muc: Muc; gap: boolean; dem: number };

/**
 * Các cột HIỆN RA, theo thứ tự luồng, và các cột ẩn vì TRỐNG.
 *
 * `dem[st] === undefined` nghĩa là chưa đếm xong — cột ấy chưa hiện (không đoán).
 * `locTrangThai` là bộ lọc *Trạng thái* của trang: có lọc thì trạng thái ngoài bộ
 * lọc không thành cột, và cũng không tính là "ẩn vì trống".
 */
export function cotHien(
  vaiTro: VaiTroKanban,
  dem: Partial<Record<Status, number>>,
  locTrangThai: readonly string[],
  chonTay: ChonTay,
): { cot: Cot[]; anVITrong: Status[] } {
  const cot: Cot[] = [];
  const anVITrong: Status[] = [];
  for (const st of LUONG) {
    if (locTrangThai.length > 0 && !locTrangThai.includes(st)) continue;
    const n = dem[st];
    if (n === undefined) continue;
    if (n === 0) {
      anVITrong.push(st);
      continue;
    }
    const muc = mucCot(vaiTro, st);
    const macDinhGap = muc === 'G' || muc === 'A';
    const gap = muc === 'V' ? false : (chonTay[st] ?? (macDinhGap ? 'gap' : 'mo')) === 'gap';
    cot.push({ trangThai: st, muc, gap, dem: n });
  }
  return { cot, anVITrong };
}

const khoaNho = (vaiTro: string) => `csbh:kanban-cot:${vaiTro}`;

/** Đọc lựa chọn tay — bọc `try` như `thanh-ben.ts`: trình duyệt chặn lưu trữ thì NÉM. */
export function docChonTay(vaiTro: string): ChonTay {
  try {
    const s = localStorage.getItem(khoaNho(vaiTro));
    const v: unknown = s ? JSON.parse(s) : {};
    return v && typeof v === 'object' ? (v as ChonTay) : {};
  } catch {
    return {};
  }
}

export function ghiChonTay(vaiTro: string, chon: ChonTay): void {
  try {
    if (Object.keys(chon).length === 0) localStorage.removeItem(khoaNho(vaiTro));
    else localStorage.setItem(khoaNho(vaiTro), JSON.stringify(chon));
  } catch {
    /* Không ghi được: lựa chọn chỉ sống trong phiên này. */
  }
}
