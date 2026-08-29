/**
 * Trang *Thống kê* gồm những HÌNH gì, cho vai trò nào (`0094`).
 *
 * BẢNG TRA là nguồn duy nhất, màn hình chỉ đọc và dựng — cùng cơ chế với
 * `tong-quan.ts`. Rải `if (vaiTro === …)` trong JSX là cách chắc chắn để có ngày
 * một vai trò sót một khối, mà khối sót thì không báo lỗi: nó chỉ vắng mặt.
 *
 * HAI TRANG, HAI CÂU HỎI (chốt 22/08, giữ nguyên ở `0094`):
 *
 *   - *Tổng quan* hỏi **bây giờ đang thế nào** — con số tồn tại thời điểm.
 *   - *Thống kê* hỏi **kỳ vừa rồi đi thế nào** — con số dòng chảy trong kỳ.
 *
 * VÀ TỪ `0094`: nhìn bằng HÌNH, không đọc bằng bảng số. Bản `0093` bày mỗi vai
 * trò một bảng 6–8 cột × 12 dòng; thứ người ta mở màn hình ra để hỏi — *đang lên
 * hay đang xuống* — lại là thứ duy nhất một bảng 96 ô không nói được.
 *
 * AI SOI ĐƯỢC TỪNG NGƯỜI (chốt 23/08): Ban lãnh đạo trên toàn công ty, Trưởng bộ
 * phận trong phạm vi của mình. Bốn vai trò còn lại chỉ nhìn việc của chính họ.
 */
import { useEffect, useState } from 'react';
import { layJson } from './api.js';
import type { VaiTro } from './can.js';

export type Ky = 'tuan' | 'thang' | 'quy' | 'nam';

export const MOI_KY: Ky[] = ['tuan', 'thang', 'quy', 'nam'];

export const NHAN_KY: Record<Ky, string> = {
  tuan: 'Tuần',
  thang: 'Tháng',
  quy: 'Quý',
  nam: 'Năm',
};

/**
 * NHỊP MẶC ĐỊNH của từng vai trò — mở màn hình ra là đã đúng nhịp của mình.
 *
 * Không phải chuyện thẩm mỹ: nhịp sai làm hình vô nghĩa theo hai hướng ngược
 * nhau. Một TDV xem theo tuần thì phần lớn điểm nằm ở 0 vì hồ sơ của một người
 * không nhiều đến thế; Ban lãnh đạo xem theo tuần thì chiết khấu bình quân nhảy
 * loạn vì mỗi tuần chỉ vài hồ sơ có hiệu lực.
 */
export const KY_MAC_DINH: Record<VaiTro, Ky> = {
  TDV: 'thang',
  // Khối lượng ký dồn theo tuần, và một tuần dồn việc phải hiện ra ngay.
  TBP: 'tuan',
  KE_TOAN: 'tuan',
  SALE_ADMIN: 'tuan',
  // Chiết khấu bình quân và tỷ lệ vượt ngưỡng chỉ có nghĩa ở nhịp dài.
  BAN_LANH_DAO: 'quy',
  QUAN_TRI: 'thang',
};

export type MaXuHuong = 'len' | 'ngang' | 'chung' | 'xuong';

// --- Kiểu dữ liệu máy chủ trả về ---------------------------------------------

export type SoLieuKy = {
  ma: string;
  nhan: string;
  nhanNgan: string;
  tu: string;
  den: string;
  dangChay: boolean;
  dem: Record<string, number>;
  giaTri: number;
  soNgayDuyetTb: number | null;
  chietKhauTb: number | null;
  soDong: number;
  dongVuotNguong: number;
  tyLeVuotNguong: number | null;
  tyLeTraLai: number | null;
};

export type ThoiGianBuoc = {
  choTbp: number | null;
  choKtL1: number | null;
  saLamBanCung: number | null;
  choKtL2: number | null;
};

export type BoThongKe = {
  ky: Ky;
  soKy: number;
  muiGio: string;
  chuoi: SoLieuKy[];
  soSanh: {
    kyNay: SoLieuKy | null;
    kyTruoc: SoLieuKy | null;
    daQua: number;
    denKyTruoc: string;
  };
  loaiTruLegacy: number;
  /** Trung vị số CSBH có hiệu lực của MỘT trình dược viên, theo kỳ. */
  trungVi: Record<string, number>;
  buoc: Record<string, ThoiGianBuoc>;
};

export type ChatLuong = {
  kyThang: number;
  traLai1: number;
  traLaiNhieu: number;
  dangXuLy: number;
};

export type NguoiThongKe = {
  userId: string;
  ten: string;
  kyNay: { guiDuyet: number; coHieuLuc: number; traLai: number; giaTri: number };
  chuoiHieuLuc: number[];
  chuoiGui: number[];
  xuHuong: MaXuHuong;
  xuHuongGui: MaXuHuong;
  tyLeTraLai: number | null;
  chatLuong: ChatLuong;
  chatLuongTheoKy: ChatLuong[];
  suaLaiNgay: number | null;
};

export type BoTheoTdv = {
  ky: Ky;
  soKy: number;
  chuoi: { ma: string; nhan: string; nhanNgan: string; tu: string; den: string; dangChay: boolean }[];
  nguoi: NguoiThongKe[];
};

export type BoTheoNhom = {
  ky: Ky;
  chuoi: { ma: string; nhan: string; nhanNgan: string }[];
  dong: { nhom: string; maKy: string; chietKhauTb: number; soDong: number; vuotNguong: number }[];
};

export type KyHoatDong = {
  ma: string;
  nhan: string;
  nhanNgan: string;
  dangChay: boolean;
  tong: number;
  nguoi: number;
  theoDoiTuong: Record<string, number>;
};

export type BoHoatDong = {
  ky: Ky;
  chuoi: KyHoatDong[];
  window: { from: string; months: number };
  kyBiCat?: number;
};

// --- Khối nào cho vai trò nào ------------------------------------------------

export type TenKhoiTk =
  | 'vi-sao-khong-co-so'
  | 'luong'
  | 'ket-cuc'
  | 'pheu'
  | 'chiet-khau'
  | 'thoi-gian-buoc'
  | 'tdv-hieu-qua'
  | 'tdv-gui-len'
  | 'tdv-chat-luong'
  | 'tdv-sua-lai'
  | 'viec-tbp'
  | 'toi-so-voi-chung'
  | 'hai-hang-doi'
  | 'gia-tri'
  | 'ban-cung'
  | 'hoat-dong';

/**
 * Thứ tự trong mảng là thứ tự trên màn hình, và nó là thứ tự NGƯỜI TA HỎI.
 *
 * Ban lãnh đạo: khối lượng có tăng không → kết cục có xấu đi không → tắc ở đâu →
 * giá có trôi không → ai đang chạy tốt, ai đang chững.
 *
 * Trưởng bộ phận mở ra là thấy NGƯỜI trước, việc của mình sau: câu hỏi thường
 * trực của họ ở màn hình này là về TDV, còn khối lượng ký của chính mình thì
 * trang *Tổng quan* đã nói mỗi ngày.
 */
export const KHOI_THEO_VAI_TRO: Record<VaiTro, TenKhoiTk[]> = {
  TDV: ['toi-so-voi-chung', 'ket-cuc'],
  TBP: ['tdv-gui-len', 'tdv-chat-luong', 'tdv-sua-lai', 'viec-tbp'],
  KE_TOAN: ['hai-hang-doi', 'gia-tri'],
  SALE_ADMIN: ['ban-cung'],
  BAN_LANH_DAO: ['luong', 'ket-cuc', 'pheu', 'chiet-khau', 'thoi-gian-buoc', 'tdv-hieu-qua'],
  /*
   * Quản trị hệ thống KHÔNG có một con số hồ sơ nào.
   *
   * `idn.scope_user_ids` trả RỖNG cho vai trò này (`0031`), nên mọi chỉ số hồ sơ
   * đều bằng 0 — đúng về kỹ thuật, đọc ra là "hệ thống không có hoạt động nào".
   */
  QUAN_TRI: ['vi-sao-khong-co-so', 'hoat-dong'],
};

/**
 * Khối nào chiếm TRỌN bề ngang, khối nào nằm nửa lưới (`0095`).
 *
 * Mặc định là nửa: hai hình cạnh nhau thì mắt so được, còn một hình kéo hết
 * 1100 điểm ảnh thì phải cuộn mới thấy hình kế tiếp — và cả trang này là để
 * nhìn tổng quan. Chỉ những khối có DÒNG NGƯỜI (tên · thanh · nhãn xu hướng ·
 * đường nhỏ) mới cần trọn bề ngang; ép chúng vào nửa lưới thì tên bị cắt.
 */
export const KHOI_RONG: TenKhoiTk[] = [
  'tdv-hieu-qua',
  'tdv-gui-len',
  'tdv-chat-luong',
  'viec-tbp',
  'ban-cung',
];

/** Khối nào cần `/reports/thong-ke`. */
export const KHOI_CAN_SO_LIEU: TenKhoiTk[] = [
  'luong',
  'ket-cuc',
  'pheu',
  'thoi-gian-buoc',
  'toi-so-voi-chung',
  'viec-tbp',
  'hai-hang-doi',
  'gia-tri',
  'ban-cung',
];

/** Khối nào cần `/reports/thong-ke/tdv` — chỉ hai vai trò có (`0094`). */
export const KHOI_CAN_TDV: TenKhoiTk[] = [
  'tdv-hieu-qua',
  'tdv-gui-len',
  'tdv-chat-luong',
  'tdv-sua-lai',
];

/** Khối nào cần `/reports/thong-ke/nhom`. */
export const KHOI_CAN_NHOM: TenKhoiTk[] = ['chiet-khau'];

/** Khối nào đọc `/audit/*` — đối chiếu với quyền `nhatKy`, cùng lý do như `0086`. */
export const KHOI_DOC_NHAT_KY: TenKhoiTk[] = ['hoat-dong'];

export const LY_DO_KHONG_CO_SO: Partial<Record<VaiTro, string>> = {
  QUAN_TRI:
    'Quản trị hệ thống không nằm trong luồng duyệt nên không hồ sơ nào thuộc phạm vi dữ liệu ' +
    'của bạn — mọi chỉ số hồ sơ sẽ là 0 và đọc ra nghĩa hoàn toàn sai. ' +
    'Màn hình này thống kê hoạt động của chính hệ thống.',
};

/**
 * Mỗi đường, mỗi cột NÓI RA MỐC của nó.
 *
 * "Tháng này có bao nhiêu CSBH" là câu chưa đủ nghĩa: lập trong tháng, gửi duyệt
 * trong tháng, hay có hiệu lực trong tháng là ba con số khác nhau. Chú thích
 * dưới mỗi hình đọc bảng này.
 */
export const NEO: Record<string, { nhan: string; moc: string }> = {
  lapMoi: { nhan: 'Lập mới', moc: 'theo ngày lập hồ sơ' },
  guiDuyet: { nhan: 'Gửi duyệt', moc: 'theo ngày TDV bấm gửi duyệt' },
  tbpKy: { nhan: 'TBP ký', moc: 'theo ngày Trưởng bộ phận ký số' },
  ktNhanL1: { nhan: 'KT nhận L1', moc: 'theo ngày kế toán tiếp nhận bản mềm' },
  banGiao: { nhan: 'Bàn giao', moc: 'theo ngày Sale Admin bàn giao bản cứng' },
  hopDong: { nhan: 'Xuất hợp đồng', moc: 'theo lần xuất hợp đồng gần nhất' },
  coHieuLuc: { nhan: 'Có hiệu lực', moc: 'theo ngày kế toán tiếp nhận bản cứng xong' },
  traLai: { nhan: 'Bị trả lại', moc: 'theo ngày bị trả lại' },
  quaHan: { nhan: 'Quá hạn', moc: 'theo ngày hết hạn 14 ngày' },
  hetHieuLuc: { nhan: 'Hết hiệu lực', moc: 'theo ngày bị bản mới thay' },
  giaTri: { nhan: 'Giá trị', moc: 'tổng giá thu về của hồ sơ có hiệu lực trong kỳ' },
};

/** Lấy một chuỗi số theo tên chỉ số, xuyên suốt các kỳ. */
export const chuoiChiSo = (bo: BoThongKe, ten: string): number[] =>
  bo.chuoi.map((k) => k.dem[ten] ?? 0);

/**
 * Nhãn NGẮN của cả chuỗi — trục hoành dùng chung cho mọi hình trên trang.
 *
 * `nhanNgan` chứ không `nhan`: nhãn đầy đủ của tuần là *"Tuần 34 · 17/08–23/08"*,
 * đọc rất rõ trong một dòng chữ và chồng lên nhau ngay từ nhãn thứ hai khi nằm
 * trên trục. Bản đầy đủ vẫn dùng ở câu tóm tắt cho trình đọc màn hình.
 */
export const mocNgan = (bo: BoThongKe): string[] => bo.chuoi.map((k) => k.nhanNgan);

/**
 * Tỷ lệ ký thẳng của một kỳ. `null` khi kỳ ấy không có hồ sơ nào.
 *
 * `null` chứ không phải 0, và đây là chỗ dễ sai: một kỳ không gửi hồ sơ nào mà
 * vẽ thành 0% thì đường tụt xuống đáy và đọc ra là "kỳ ấy hỏng hết".
 */
export function tyLeKyThang(c: ChatLuong): number | null {
  const tong = c.kyThang + c.traLai1 + c.traLaiNhieu + c.dangXuLy;
  if (tong === 0) return null;
  return Number(((c.kyThang / tong) * 100).toFixed(2));
}

// --- Nạp dữ liệu -------------------------------------------------------------

const useGoi = <T,>(duong: string | null): { du: T | null; loi: unknown } => {
  const [du, datDu] = useState<T | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  useEffect(() => {
    if (duong === null) return;
    const huy = new AbortController();
    datLoi(null);
    /*
     * KHÔNG xoá dữ liệu cũ khi đổi nhịp: đổi từ Tháng sang Quý là một lượt gọi
     * mạng, và dọn sạch hình trong lúc chờ làm cả màn hình nhảy lên rồi tụt
     * xuống. Hình cũ đứng yên thêm nửa giây rồi đổi số thì đọc được.
     */
    layJson<T>(duong, huy.signal)
      .then(datDu)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [duong]);
  return { du, loi };
};

export const useThongKe = (ky: Ky, bat: boolean) =>
  useGoi<BoThongKe>(bat ? `/reports/thong-ke?ky=${ky}` : null);

export const useThongKeTdv = (ky: Ky, bat: boolean) =>
  useGoi<BoTheoTdv>(bat ? `/reports/thong-ke/tdv?ky=${ky}` : null);

export const useThongKeNhom = (ky: Ky, bat: boolean) =>
  useGoi<BoTheoNhom>(bat ? `/reports/thong-ke/nhom?ky=${ky}` : null);

export const useHoatDong = (ky: Ky, bat: boolean) =>
  useGoi<BoHoatDong>(bat ? `/audit/thong-ke?ky=${ky}` : null);
