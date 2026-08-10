/**
 * Chọn giao diện sáng / tối.
 *
 * BA trạng thái, không phải hai — và trạng thái thứ ba mới là mặc định:
 *
 *   - chưa chọn gì  → **theo cài đặt của máy**. Không ghi gì vào `localStorage`,
 *     không đặt thuộc tính nào lên `<html>`; `tokens.css` tự bắt bằng
 *     `prefers-color-scheme`.
 *   - chọn `'sang'` / `'toi'` → ghi đè, và ghi đè theo cả hai chiều.
 *
 * Vì sao không lưu sẵn một giá trị ngay lần đầu vào: người dùng đổi cài đặt
 * sáng/tối của máy (nhiều hệ điều hành tự đổi theo giờ trong ngày) thì phần mềm
 * phải đi theo. Lưu sẵn `'sang'` ở lần chạy đầu là đóng băng lựa chọn mà người
 * dùng chưa hề đưa ra.
 *
 * Dùng `localStorage` chứ không `sessionStorage` — khác hẳn `nhap-tam.ts`: đây
 * là sở thích hiển thị, không phải nội dung hồ sơ, nên để lại trên máy dùng
 * chung cũng không lộ gì.
 */
import { useCallback, useEffect, useState } from 'react';

export type GiaoDien = 'sang' | 'toi';

const KHOA = 'csbh:giao-dien';

/** Đọc lựa chọn đã lưu. Trả `null` nghĩa là "theo máy". */
function daChon(): GiaoDien | null {
  try {
    const s = localStorage.getItem(KHOA);
    return s === 'sang' || s === 'toi' ? s : null;
  } catch {
    // Trình duyệt chặn lưu trữ (chế độ riêng tư, hoặc chính sách của công ty).
    // Vẫn đổi được giao diện trong phiên, chỉ là không nhớ sang lần sau.
    return null;
  }
}

function mayDangToi(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Đặt thuộc tính lên `<html>`.
 *
 * Khi chưa chọn gì thì XOÁ HẲN thuộc tính chứ không đặt giá trị mặc định — có
 * thuộc tính là chặn mất nhánh `prefers-color-scheme` trong `tokens.css`.
 */
function apDung(chon: GiaoDien | null): void {
  const goc = document.documentElement;
  if (chon === null) goc.removeAttribute('data-theme');
  else goc.setAttribute('data-theme', chon);
}

export function useGiaoDien(): { dangToi: boolean; doi: () => void } {
  const [chon, datChon] = useState<GiaoDien | null>(daChon);
  const [mayToi, datMayToi] = useState(mayDangToi);

  // Người dùng đổi cài đặt của máy giữa chừng thì đổi theo — nhưng chỉ khi họ
  // chưa chọn tay. Nhiều máy tự chuyển tối lúc chiều muộn.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const nghe = (e: MediaQueryListEvent) => datMayToi(e.matches);
    mq.addEventListener('change', nghe);
    return () => mq.removeEventListener('change', nghe);
  }, []);

  useEffect(() => apDung(chon), [chon]);

  const doi = useCallback(() => {
    const dangToi = chon === null ? mayDangToi() : chon === 'toi';
    const moi: GiaoDien = dangToi ? 'sang' : 'toi';
    datChon(moi);
    try {
      localStorage.setItem(KHOA, moi);
    } catch {
      /* không lưu được thì thôi — xem ghi chú ở `daChon` */
    }
  }, [chon]);

  return { dangToi: chon === null ? mayToi : chon === 'toi', doi };
}
