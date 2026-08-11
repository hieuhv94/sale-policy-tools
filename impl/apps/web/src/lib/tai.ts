/**
 * Nạp dữ liệu cho một khối màn hình.
 *
 * Cùng một đoạn `AbortController` + `catch` đã lặp lại ở tám màn hình, và trang
 * tổng quan sẽ thêm năm chỗ nữa. Gom về đây, kèm hai thứ dễ quên nhất:
 *
 *   1. **Huỷ khi rời màn hình.** Không huỷ thì `setState` chạy trên component
 *      đã tháo, và lỗi hiện ra ở một chỗ chẳng liên quan.
 *   2. **Nuốt lỗi khi ĐÃ huỷ.** Request bị huỷ cũng ném lỗi; báo nó ra là hiện
 *      một dải đỏ ngay lúc người dùng vừa bấm sang màn hình khác.
 */
import { useEffect, useState } from 'react';
import { layJson } from './api.js';

export type KetQua<T> = { du: T | null; loi: unknown; dangTai: boolean };

/**
 * Truyền `duong = null` để KHÔNG gọi gì cả.
 *
 * Cần thiết vì trang tổng quan quyết định gọi endpoint nào dựa trên vai trò, mà
 * hook thì không gọi có điều kiện được. Bọc trong `if` là vi phạm quy tắc hook;
 * truyền `null` là cách duy nhất còn lại.
 */
export function useTai<T>(duong: string | null): KetQua<T> {
  const [du, datDu] = useState<T | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  useEffect(() => {
    if (duong === null) return;
    const huy = new AbortController();
    datLoi(null);
    layJson<T>(duong, huy.signal)
      .then(datDu)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [duong]);

  return { du, loi, dangTai: duong !== null && du === null && loi === null };
}
