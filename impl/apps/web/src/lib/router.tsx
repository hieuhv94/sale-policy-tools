/**
 * Bộ định tuyến tối giản, tự viết.
 *
 * VÌ SAO KHÔNG DÙNG `react-router`. `FE-38` đặt trần 250KB nén cho gói dùng
 * chung, và ứng dụng này có đúng chín đường dẫn, không có route lồng nhau, không
 * có tải dữ liệu ở tầng route. Thư viện định tuyến đầy đủ giải quyết những vấn
 * đề mà hệ này không có, đổi lại một phần đáng kể của trần đó.
 *
 * Dùng History API chứ không hash: Caddy đã cấu hình `try_files … /index.html`
 * nên tải lại trang ở `/ho-so/abc` vẫn ra đúng màn hình.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type Duong = { duong: string; di: (d: string) => void };

const Ctx = createContext<Duong>({ duong: '/', di: () => {} });

export function BoDinhTuyen({ children }: { children: ReactNode }) {
  const [duong, datDuong] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const doi = () => datDuong(window.location.pathname || '/');
    window.addEventListener('popstate', doi);
    return () => window.removeEventListener('popstate', doi);
  }, []);

  const di = useCallback((d: string) => {
    if (d === window.location.pathname) return;
    window.history.pushState(null, '', d);
    datDuong(d);
    // Đưa tiêu điểm về đầu trang sau khi chuyển màn hình. Không làm thì người
    // dùng bàn phím và trình đọc màn hình vẫn đứng ở chỗ cũ của trang trước
    // (FE-35).
    document.getElementById('noi-dung-chinh')?.focus();
  }, []);

  const v = useMemo(() => ({ duong, di }), [duong, di]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export const useDuong = (): Duong => useContext(Ctx);

/** `<Lien den="/ho-so">` — thẻ `a` thật, để mở tab mới và bàn phím đều chạy. */
export function Lien({
  den,
  children,
  className,
  ...rest
}: {
  den: string;
  children: ReactNode;
  className?: string;
  /**
   * Mục điều hướng đang mở đặt `aria-current="page"`.
   *
   * Không thừa so với lớp `dang-o`: lớp CSS chỉ đổi màu, mà trình đọc màn hình
   * không đọc màu. Thiếu thuộc tính này thì người dùng NVDA nghe hết tám mục
   * giống hệt nhau và không biết mình đang ở đâu (FE-35).
   */
  'aria-current'?: 'page';
}) {
  const { di } = useDuong();
  return (
    <a
      {...rest}
      href={den}
      className={className}
      onClick={(e) => {
        // Giữ nguyên hành vi mặc định khi người dùng CỐ Ý mở tab mới.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        di(den);
      }}
    >
      {children}
    </a>
  );
}

/** Khớp `/ho-so/:id` → `{ id }`. Trả `null` nếu không khớp. */
export function khop(mau: string, duong: string): Record<string, string> | null {
  const a = mau.split('/').filter(Boolean);
  const b = duong.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const ra: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const m = a[i]!;
    const d = b[i]!;
    if (m.startsWith(':')) ra[m.slice(1)] = decodeURIComponent(d);
    else if (m !== d) return null;
  }
  return ra;
}
