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

/**
 * `duong` là ĐƯỜNG DẪN THUẦN, không kèm chuỗi truy vấn.
 *
 * Tách hẳn hai thứ vì `App` so `duong === '/ho-so'` và `khop('/ho-so/:id', duong)`.
 * Gộp chuỗi truy vấn vào thì `di('/ho-so?status=NHAP')` cho `duong` bằng
 * `'/ho-so?status=NHAP'`, không khớp mục nào, và người dùng bấm một con số trên
 * trang tổng quan lại rơi vào màn hình "không có màn hình nào ở địa chỉ này".
 */
type Duong = { duong: string; truyVan: URLSearchParams; di: (d: string) => void };

const Ctx = createContext<Duong>({
  duong: '/',
  truyVan: new URLSearchParams(),
  di: () => {},
});

export function BoDinhTuyen({ children }: { children: ReactNode }) {
  const [duong, datDuong] = useState(() => window.location.pathname || '/');
  // Giữ dạng chuỗi trong state chứ không giữ thẳng `URLSearchParams`: đối tượng
  // đó có thể sửa tại chỗ, nên hai lần dựng khác nhau vẫn có thể là cùng một
  // tham chiếu và React sẽ không vẽ lại.
  const [chuoiTruyVan, datChuoiTruyVan] = useState(() => window.location.search);

  useEffect(() => {
    const doi = () => {
      datDuong(window.location.pathname || '/');
      datChuoiTruyVan(window.location.search);
    };
    window.addEventListener('popstate', doi);
    return () => window.removeEventListener('popstate', doi);
  }, []);

  const di = useCallback((d: string) => {
    const [dan = '/', hoi = ''] = d.split('?');
    const search = hoi === '' ? '' : `?${hoi}`;
    // So CẢ chuỗi truy vấn: bấm hai con số khác nhau cùng trỏ về `/ho-so` là hai
    // lần chuyển màn hình thật, không phải một lần lặp lại.
    if (dan === window.location.pathname && search === window.location.search) return;
    window.history.pushState(null, '', d);
    datDuong(dan);
    datChuoiTruyVan(search);
    // Đưa tiêu điểm về đầu trang sau khi chuyển màn hình. Không làm thì người
    // dùng bàn phím và trình đọc màn hình vẫn đứng ở chỗ cũ của trang trước
    // (FE-35).
    document.getElementById('noi-dung-chinh')?.focus();
  }, []);

  const v = useMemo(
    () => ({ duong, truyVan: new URLSearchParams(chuoiTruyVan), di }),
    [duong, chuoiTruyVan, di],
  );
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export const useDuong = (): Duong => useContext(Ctx);

/** `<Lien den="/ho-so">` — thẻ `a` thật, để mở tab mới và bàn phím đều chạy. */
export function Lien({
  den,
  children,
  className,
  truocKhiDi,
  ...rest
}: {
  den: string;
  children: ReactNode;
  className?: string;
  /**
   * Chạy TRƯỚC khi điều hướng (`0096`).
   *
   * Không nhận `onClick` qua `...rest` được: hàm này tự đặt `onClick` của riêng
   * nó ngay bên dưới, nên một `onClick` truyền vào sẽ bị đè và biến mất trong im
   * lặng — kiểu hỏng không có thông báo nào.
   *
   * Chạy cả khi người dùng Ctrl+bấm để mở tab mới. Đúng: họ vẫn vừa đọc thông
   * báo ấy, chỉ là đọc ở tab khác.
   */
  truocKhiDi?: () => void;
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
        truocKhiDi?.();
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
