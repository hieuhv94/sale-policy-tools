/**
 * Phân trang — MỘT cỡ trang cho cả ứng dụng (`0030`).
 *
 * Trước đợt này mỗi màn hình tự chọn một con số: hồ sơ 50, người dùng 200, nhật
 * ký 100, hộp việc 100, sản phẩm 200. Không con số nào sai riêng lẻ, nhưng gộp
 * lại thì không màn hình nào nói cho người dùng biết họ đang nhìn một phần hay
 * toàn bộ — và với danh sách bị cắt trong im lặng thì người dùng luôn tin mình
 * đang nhìn toàn bộ.
 *
 * HAI KIỂU phân trang, và việc chọn kiểu nào KHÔNG tuỳ tiện:
 *
 *   - **Máy chủ cắt** (`useTrangMay`) — cho danh sách lớn tuỳ dữ liệu: hồ sơ,
 *     khách hàng, nhật ký, thư hỏng. Tải 20 dòng thì chỉ tốn 20 dòng.
 *   - **Màn hình cắt** (`trangCua`) — cho danh sách đã tải TRỌN để phục vụ một
 *     việc khác: ô tìm kiếm bỏ dấu chạy tại chỗ (sản phẩm, chiết khấu), hoặc ô
 *     chọn trong hộp thoại cần đủ danh sách (người dùng). Cắt ở máy chủ những
 *     chỗ này là gãy đúng cái việc kia — tìm kiếm chỉ còn tìm trong 20 dòng
 *     đang hiện.
 */
import { useCallback, useEffect, useState } from 'react';
import { layJson } from './api.js';

/**
 * Tối đa 20 mục một trang, mọi màn hình.
 *
 * Một hằng số chứ không phải một con số rải khắp nơi: đổi cỡ trang là một quyết
 * định về sản phẩm, và nó phải sửa được ở đúng một chỗ.
 */
export const MOI_TRANG = 20;

export const soTrangCua = (tong: number): number => Math.max(1, Math.ceil(tong / MOI_TRANG));

/** Cắt một mảng đã có sẵn trong tay thành trang. Trang đếm từ 1. */
export const trangCua = <T>(ds: readonly T[], trang: number): T[] =>
  ds.slice((trang - 1) * MOI_TRANG, trang * MOI_TRANG);

/**
 * Giữ số trang cho một danh sách MÀN HÌNH TỰ CẮT.
 *
 * Tự lùi về trang cuối còn dữ liệu khi danh sách co lại — xoá mục cuối cùng của
 * trang 5 mà vẫn đứng ở trang 5 là nhìn vào một trang rỗng và tưởng mất dữ liệu.
 */
export function useTrangTaiCho<T>(ds: readonly T[]): {
  trang: number;
  soTrang: number;
  doiTrang: (n: number) => void;
  cuaTrang: T[];
} {
  const [trang, datTrang] = useState(1);
  const soTrang = soTrangCua(ds.length);
  useEffect(() => {
    if (trang > soTrang) datTrang(soTrang);
  }, [trang, soTrang]);
  return { trang, soTrang, doiTrang: datTrang, cuaTrang: trangCua(ds, trang) };
}

export type TrangMay<T> = {
  muc: T[] | null;
  tong: number;
  loi: unknown;
  trang: number;
  soTrang: number;
  doiTrang: (n: number) => void;
  taiLai: () => void;
};

/** Máy chủ trả về dạng này ở mọi endpoint danh sách (`paged()` của http-kit). */
type PhanHoi<T> = { items: T[]; total: number };

/**
 * Đọc một danh sách do MÁY CHỦ cắt trang.
 *
 * `duongCoSo` là đường dẫn kèm mọi tham số riêng của màn hình, KHÔNG kèm
 * `limit`/`offset` — hook tự nối hai cái đó. Truyền `null` để chưa tải gì.
 *
 * `moiTrang` mặc định là `MOI_TRANG`. Hai khối trên trang Tổng quan truyền số
 * nhỏ hơn (`0052`): ở đó chúng chỉ là hai trong nhiều khối, không phải cả màn
 * hình — hai mươi dòng mỗi khối là đẩy mọi thứ còn lại xuống dưới tầm mắt.
 *
 * Đổi `duongCoSo` (tức đổi bộ lọc hay từ khoá) thì VỀ TRANG 1: đứng ở trang 7
 * của kết quả cũ mà lọc lại thì trang 7 của kết quả mới thường là rỗng, và màn
 * hình trắng ngay sau khi gõ từ khoá đọc ra là "không tìm thấy gì".
 */
export function useTrangMay<T>(duongCoSo: string | null, moiTrang = MOI_TRANG): TrangMay<T> {
  const [trang, datTrang] = useState(1);
  const [du, datDu] = useState<PhanHoi<T> | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);
  useEffect(() => datTrang(1), [duongCoSo]);

  useEffect(() => {
    if (duongCoSo === null) return;
    const huy = new AbortController();
    datLoi(null);
    const noi = duongCoSo.includes('?') ? '&' : '?';
    const duong = `${duongCoSo}${noi}limit=${moiTrang}&offset=${(trang - 1) * moiTrang}`;
    layJson<PhanHoi<T>>(duong, huy.signal)
      .then(datDu)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [duongCoSo, trang, lan, moiTrang]);

  const tong = du?.total ?? 0;
  const soTrang = Math.max(1, Math.ceil(tong / moiTrang));

  // Xoá mục cuối cùng của trang cuối thì trang ấy biến mất — kéo người dùng về
  // trang còn dữ liệu thay vì để họ nhìn một danh sách rỗng.
  useEffect(() => {
    if (du !== null && du.items.length === 0 && trang > 1) datTrang(soTrang);
  }, [du, trang, soTrang]);

  return { muc: du?.items ?? null, tong, loi, trang, soTrang, doiTrang: datTrang, taiLai };
}
