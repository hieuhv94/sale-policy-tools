/**
 * Trang *Thống kê* gồm những gì, cho vai trò nào (`0093`).
 *
 * Cùng cơ chế với `tong-quan.ts`: BẢNG TRA là nguồn duy nhất, màn hình chỉ đọc
 * và dựng. Rải `if (vaiTro === …)` trong JSX là cách chắc chắn để có ngày một
 * vai trò sót một cột — mà cột sót thì không báo lỗi, nó chỉ vắng mặt.
 *
 * HAI TRANG, HAI CÂU HỎI KHÁC NHAU, và đây là lý do trang này đổi tên (22/08):
 *
 *   - *Tổng quan* hỏi **bây giờ đang thế nào**: bao nhiêu hồ sơ đang chờ, cái
 *     nào sắp quá hạn, việc của tôi hôm nay là gì. Con số TỒN TẠI THỜI ĐIỂM.
 *   - *Thống kê* hỏi **kỳ vừa rồi đi thế nào**: lập bao nhiêu, duyệt xong bao
 *     nhiêu, nhanh hơn hay chậm đi. Con số DÒNG CHẢY TRONG KỲ.
 *
 * Bản *Báo cáo* cũ bày lại chính những con số của Tổng quan dưới một cái tên
 * khác — mở ra là thấy đúng thứ vừa xem xong, chỉ khác cách sắp xếp.
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
 * Không phải chuyện thẩm mỹ: nhịp sai làm bảng số vô nghĩa theo hai hướng ngược
 * nhau. Một TDV xem theo tuần thì phần lớn ô là 0 vì hồ sơ của một người không
 * nhiều đến thế; Ban lãnh đạo xem theo tuần thì chiết khấu bình quân nhảy loạn
 * vì mỗi tuần chỉ vài hồ sơ có hiệu lực.
 *
 * Người dùng đổi được ngay trên màn hình — đây là điểm BẮT ĐẦU, không phải giới
 * hạn.
 */
export const KY_MAC_DINH: Record<VaiTro, Ky> = {
  // Đủ dài để có mẫu số. Hồ sơ của một trình dược viên không nhiều.
  TDV: 'thang',
  // Khối lượng ký dồn theo tuần, và một tuần dồn việc phải thấy ngay.
  TBP: 'tuan',
  KE_TOAN: 'tuan',
  SALE_ADMIN: 'tuan',
  // Chiết khấu bình quân và tỷ lệ vượt ngưỡng chỉ có nghĩa ở nhịp dài.
  BAN_LANH_DAO: 'quy',
  // Không đọc số hồ sơ nào — xem `KHOI_THEO_VAI_TRO`. Nhịp này áp cho khối
  // hoạt động hệ thống, và tháng là nhịp cửa sổ nhật ký chịu được (6 tháng).
  QUAN_TRI: 'thang',
};

export type DangSo = 'dem' | 'tien' | 'ngay' | 'tyLe';

/**
 * MỖI CỘT NÓI RA MỐC CỦA NÓ.
 *
 * "Tháng này có bao nhiêu CSBH" là câu chưa đủ nghĩa: lập trong tháng, gửi duyệt
 * trong tháng, hay có hiệu lực trong tháng? Ba con số khác nhau. `neo` là câu
 * trả lời, và nó hiện thành một chú giải dưới bảng chứ không nằm trong đầu người
 * viết mã.
 */
export const COT: Record<
  string,
  { nhan: string; neo: string; dang: DangSo; tot?: 'cao' | 'thap' }
> = {
  lapMoi: { nhan: 'Lập mới', neo: 'tính theo ngày lập hồ sơ', dang: 'dem' },
  guiDuyet: { nhan: 'Gửi duyệt', neo: 'tính theo ngày TDV bấm gửi duyệt', dang: 'dem' },
  tbpKy: { nhan: 'TBP ký', neo: 'tính theo ngày Trưởng bộ phận ký số', dang: 'dem' },
  ktNhanL1: { nhan: 'KT nhận L1', neo: 'tính theo ngày kế toán tiếp nhận bản mềm', dang: 'dem' },
  banGiao: { nhan: 'Bàn giao', neo: 'tính theo ngày Sale Admin bàn giao bản cứng', dang: 'dem' },
  hopDong: { nhan: 'Xuất hợp đồng', neo: 'tính theo lần xuất hợp đồng gần nhất', dang: 'dem' },
  coHieuLuc: {
    nhan: 'Có hiệu lực',
    neo: 'tính theo ngày hồ sơ có hiệu lực — lúc kế toán tiếp nhận bản cứng xong',
    dang: 'dem',
  },
  traLai: { nhan: 'Bị trả lại', neo: 'tính theo ngày bị trả lại', dang: 'dem', tot: 'thap' },
  tuChoi: { nhan: 'Bị từ chối', neo: 'tính theo ngày bị từ chối', dang: 'dem', tot: 'thap' },
  quaHan: {
    nhan: 'Quá hạn',
    neo: 'tính theo ngày hết hạn 14 ngày — hạn trôi qua chính là lúc hồ sơ chết',
    dang: 'dem',
    tot: 'thap',
  },
  hetHieuLuc: {
    nhan: 'Hết hiệu lực',
    neo: 'tính theo ngày bị bản mới của cùng khách hàng thay',
    dang: 'dem',
  },
  giaTri: {
    nhan: 'Giá trị',
    neo: 'tổng giá thu về của hồ sơ có hiệu lực trong kỳ',
    dang: 'tien',
  },
  soNgayDuyetTb: {
    nhan: 'Số ngày duyệt TB',
    neo: 'từ lúc gửi duyệt tới lúc có hiệu lực, của hồ sơ có hiệu lực trong kỳ',
    dang: 'ngay',
    tot: 'thap',
  },
  chietKhauTb: {
    nhan: 'Chiết khấu TB',
    neo: 'bình quân trên từng dòng sản phẩm của hồ sơ có hiệu lực trong kỳ',
    dang: 'tyLe',
  },
  tyLeVuotNguong: {
    nhan: 'Vượt ngưỡng',
    neo: 'tỷ lệ dòng sản phẩm vượt ngưỡng, trên hồ sơ có hiệu lực trong kỳ',
    dang: 'tyLe',
    tot: 'thap',
  },
  tyLeTraLai: {
    nhan: 'Tỷ lệ trả lại',
    neo: 'số lượt trả lại và từ chối trong kỳ, chia số lượt gửi duyệt trong kỳ',
    dang: 'tyLe',
    tot: 'thap',
  },
};

/**
 * Cột nào cho vai trò nào — **việc của chính họ trước, kết quả sau**.
 *
 * Cùng quy tắc với dải thẻ ở Tổng quan: một Sale Admin nhìn cột "TBP ký" thì
 * không làm được gì với con số ấy, mà nó vẫn chiếm chỗ và vẫn bắt phải đọc.
 *
 * `QUAN_TRI` KHÔNG có cột nào, và đây là chỗ dễ làm sai nhất của cả màn hình:
 * `idn.scope_user_ids` trả về RỖNG cho họ, nên mọi con số hồ sơ đều là 0. Bày
 * một bảng toàn số 0 là nói với người xem rằng hệ thống không có hoạt động nào.
 */
export const COT_THEO_VAI_TRO: Record<VaiTro, string[]> = {
  TDV: ['lapMoi', 'guiDuyet', 'coHieuLuc', 'traLai', 'tyLeTraLai', 'soNgayDuyetTb'],
  TBP: ['guiDuyet', 'tbpKy', 'traLai', 'tuChoi', 'quaHan', 'tyLeTraLai'],
  KE_TOAN: ['ktNhanL1', 'hopDong', 'coHieuLuc', 'giaTri', 'quaHan', 'soNgayDuyetTb'],
  SALE_ADMIN: ['banGiao', 'hopDong', 'coHieuLuc', 'quaHan', 'soNgayDuyetTb'],
  BAN_LANH_DAO: [
    'lapMoi',
    'coHieuLuc',
    'tuChoi',
    'quaHan',
    'giaTri',
    'chietKhauTb',
    'tyLeVuotNguong',
    'soNgayDuyetTb',
  ],
  QUAN_TRI: [],
};

/**
 * Chỉ số nào lên DẢI THẺ so sánh "kỳ này với kỳ trước".
 *
 * Ba, không hơn: dải thẻ là chỗ trả lời trong ba giây, và bảy con số có mũi tên
 * tăng giảm thì không con số nào nổi lên được. Phần còn lại nằm trong bảng.
 */
export const THE_THEO_VAI_TRO: Record<VaiTro, string[]> = {
  TDV: ['guiDuyet', 'coHieuLuc', 'tyLeTraLai'],
  TBP: ['tbpKy', 'traLai', 'quaHan'],
  KE_TOAN: ['ktNhanL1', 'coHieuLuc', 'giaTri'],
  SALE_ADMIN: ['banGiao', 'coHieuLuc', 'quaHan'],
  BAN_LANH_DAO: ['coHieuLuc', 'giaTri', 'chietKhauTb'],
  QUAN_TRI: [],
};

export type TenKhoiTk = 'vi-sao-khong-co-so' | 'so-sanh' | 'chuoi-ky' | 'theo-nhom' | 'hoat-dong';

export const KHOI_THEO_VAI_TRO: Record<VaiTro, TenKhoiTk[]> = {
  TDV: ['so-sanh', 'chuoi-ky'],
  TBP: ['so-sanh', 'chuoi-ky'],
  KE_TOAN: ['so-sanh', 'chuoi-ky'],
  SALE_ADMIN: ['so-sanh', 'chuoi-ky'],
  /*
   * Ban lãnh đạo có thêm khối CHIẾT KHẤU THEO NHÓM SẢN PHẨM.
   *
   * Đây là con số quan trọng nhất của cả trang với họ, và là con số duy nhất
   * trong phần mềm nói về chính sách giá ở mức toàn công ty: một quý nhích nửa
   * điểm phần trăm trên toàn danh mục thì không ai thấy được bằng cách mở từng
   * hồ sơ.
   */
  BAN_LANH_DAO: ['so-sanh', 'chuoi-ky', 'theo-nhom'],
  QUAN_TRI: ['vi-sao-khong-co-so', 'hoat-dong'],
};

/** Khối nào đọc `/audit/*` — đối chiếu với quyền `nhatKy`, cùng lý do như `0086`. */
export const KHOI_DOC_NHAT_KY: TenKhoiTk[] = ['hoat-dong'];

/** Khối nào cần `/reports/thong-ke`. Vai trò không có khối nào thì không gọi. */
export const KHOI_CAN_SO_LIEU: TenKhoiTk[] = ['so-sanh', 'chuoi-ky'];

export const LY_DO_KHONG_CO_SO: Partial<Record<VaiTro, string>> = {
  QUAN_TRI:
    'Quản trị hệ thống không nằm trong luồng duyệt nên không hồ sơ nào thuộc phạm vi dữ liệu ' +
    'của bạn — mọi chỉ số hồ sơ sẽ là 0 và đọc ra nghĩa hoàn toàn sai. ' +
    'Màn hình này thống kê hoạt động của chính hệ thống.',
};

// --- Kiểu dữ liệu máy chủ trả về ---------------------------------------------

export type SoLieuKy = {
  ma: string;
  nhan: string;
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
};

export type BoTheoNhom = {
  ky: Ky;
  chuoi: { ma: string; nhan: string }[];
  dong: { nhom: string; maKy: string; chietKhauTb: number; soDong: number; vuotNguong: number }[];
};

export type KyHoatDong = {
  ma: string;
  nhan: string;
  tu: string;
  den: string;
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

/**
 * Lấy MỘT con số của một kỳ, dù nó nằm ở `dem` hay ở thân dòng.
 *
 * Mười một chỉ số dòng chảy nằm trong `dem` vì chúng sinh ra từ cùng một bảng
 * `NEO` ở máy chủ; năm chỉ số còn lại là trường riêng. Màn hình không nên biết
 * khác biệt ấy — nó chỉ có tên cột.
 */
export function soCua(k: SoLieuKy | null, cot: string): number | null {
  if (k === null) return null;
  if (cot in k.dem) return k.dem[cot] ?? 0;
  const v = (k as unknown as Record<string, unknown>)[cot];
  return typeof v === 'number' ? v : null;
}

const useGoi = <T,>(duong: string | null): { du: T | null; loi: unknown } => {
  const [du, datDu] = useState<T | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  useEffect(() => {
    if (duong === null) return;
    const huy = new AbortController();
    datLoi(null);
    /*
     * KHÔNG xoá dữ liệu cũ khi đổi nhịp.
     *
     * Đổi từ Tháng sang Quý là một lần gọi mạng, và dọn bảng trong lúc chờ làm
     * cả màn hình nhảy lên rồi tụt xuống. Bảng cũ đứng yên thêm nửa giây rồi
     * đổi số là thứ đọc được; một khoảng trắng rồi một bảng mới thì không.
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

export const useThongKeNhom = (ky: Ky, bat: boolean) =>
  useGoi<BoTheoNhom>(bat ? `/reports/thong-ke/nhom?ky=${ky}` : null);

export const useHoatDong = (ky: Ky, bat: boolean) =>
  useGoi<BoHoatDong>(bat ? `/audit/thong-ke?ky=${ky}` : null);
