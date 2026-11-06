/**
 * TIẾN TRÌNH DUYỆT của một hồ sơ (`0257`) — cột phải của trang hồ sơ.
 *
 * Thay dải *"đã duyệt"* của `0056`, và trả lời RỘNG hơn nó: dải cũ chỉ bày bước
 * ĐÃ xảy ra (*"ai ký cái này"*); cột này bày cả bước ĐANG ở và bước CÒN LẠI —
 * câu hỏi kế tiếp của người vừa đọc cái tên là *"giờ nó nằm ở bàn ai, còn mấy
 * bước nữa"*.
 *
 * KHÔNG cần dữ liệu mới: trạng thái hồ sơ cho biết bước đang ở, còn tên + mốc thời
 * gian của bốn bước có chữ ký lấy từ đúng `nguoiDuyet` mà dải cũ đọc. Phần thuần
 * để ca kiểm phủ được mọi trạng thái mà không dựng cả trang.
 *
 * Sáu bước theo trình tự luồng; nhãn của bốn bước giữa GIỮ NGUYÊN chữ của dải cũ
 * (`BUOC_DUYET`, `0056`) — người dùng đã quen đọc chúng.
 */

export type KhoaDuyet = 'tbp' | 'keToanL1' | 'saleAdmin' | 'keToanL2';
export type NguoiDuyet = Partial<Record<KhoaDuyet, { ten: string | null; luc: string } | null>>;

export type TinhTrangBuoc = 'xong' | 'dang' | 'chua';

export type Buoc = {
  khoa: 'gui' | KhoaDuyet | 'hieuLuc';
  nhan: string;
  tinhTrang: TinhTrangBuoc;
  /** Ai đã làm bước này — chỉ có ở bước ĐÃ XONG mang chữ ký. */
  nguoi?: string;
  /** Mốc thời gian (ISO) của bước đã xong, nếu máy chủ có. */
  luc?: string;
  /** Câu ngắn cho bước ĐANG ở: *Đang soạn* · *Đang sửa theo yêu cầu* · *Đang chờ*. */
  ghiChu?: string;
};

const BUOC: { khoa: Buoc['khoa']; nhan: string }[] = [
  { khoa: 'gui', nhan: 'Trình dược viên gửi duyệt' },
  { khoa: 'tbp', nhan: 'Trưởng bộ phận ký' },
  { khoa: 'keToanL1', nhan: 'KT duyệt bản mềm' },
  { khoa: 'saleAdmin', nhan: 'Sale Admin bàn giao' },
  { khoa: 'keToanL2', nhan: 'KT duyệt bản cứng' },
  { khoa: 'hieuLuc', nhan: 'Có hiệu lực' },
];

/**
 * Chỉ số bước ĐANG Ở theo trạng thái. `6` = mọi bước đã xong. Hai trạng thái
 * dừng (`QUA_HAN_DUYET`, `DA_XOA`) không có bước đang ở — xem `dung`.
 *
 * *Sale Admin sửa bản cứng* (`0225`) vẫn là bàn Sale Admin: Kế toán bắt in lại
 * thì hồ sơ quay về đúng bước bàn giao, không phải một bước mới.
 */
const DANG_O: Record<string, number> = {
  NHAP: 0,
  YEU_CAU_CHINH_SUA: 0,
  CHO_TBP_DUYET: 1,
  CHO_KT_L1: 2,
  SA_DANG_XU_LY: 3,
  SA_SUA_BAN_CUNG: 3,
  CHO_KT_L2: 4,
  DANG_CO_HIEU_LUC: 6,
  HET_HIEU_LUC: 6,
};

const GHI_CHU_DANG: Record<string, string> = {
  NHAP: 'Đang soạn',
  YEU_CAU_CHINH_SUA: 'Đang sửa theo yêu cầu',
  SA_SUA_BAN_CUNG: 'Đang sửa bản cứng',
};

export function tienTrinh(
  trangThai: string,
  nguoiDuyet: NguoiDuyet | undefined,
  nguoiDeNghi: string | null | undefined,
): { buoc: Buoc[]; dung: boolean } {
  const dangO = DANG_O[trangThai];
  const dung = dangO === undefined;
  const buoc = BUOC.map((b, i): Buoc => {
    const ky = b.khoa === 'gui' || b.khoa === 'hieuLuc' ? undefined : nguoiDuyet?.[b.khoa];
    // Hồ sơ DỪNG (quá hạn, đã xoá): bước nào có chữ ký thì đã xong; bước gửi
    // xong khi đã có ít nhất một chữ ký — không suy thêm được gì khác.
    const xong = dung
      ? b.khoa === 'gui'
        ? Object.values(nguoiDuyet ?? {}).some(Boolean)
        : !!ky
      : i < dangO;
    const tinhTrang: TinhTrangBuoc = xong ? 'xong' : !dung && i === dangO ? 'dang' : 'chua';
    const ra: Buoc = { khoa: b.khoa, nhan: b.nhan, tinhTrang };
    if (xong && ky) {
      ra.nguoi = ky.ten ?? 'không tra được tên';
      ra.luc = ky.luc;
    }
    if (xong && b.khoa === 'gui' && nguoiDeNghi) ra.nguoi = nguoiDeNghi;
    if (tinhTrang === 'dang') ra.ghiChu = GHI_CHU_DANG[trangThai] ?? 'Đang chờ';
    return ra;
  });
  return { buoc, dung };
}
