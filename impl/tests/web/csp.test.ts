/**
 * `0072` — CSP phải cho phép ĐÚNG những gì giao diện thật sự dùng.
 *
 * LỖI ĐÃ XẢY RA THẬT, và nó lọt qua cả 1300 ca kiểm thử: CSP không khai
 * `frame-src`, nên nó rơi về `default-src 'self'` — mà `blob:` KHÔNG thuộc
 * `'self'`. Trình duyệt chặn `<iframe src="blob:…">` và hiện đúng một dòng
 * *"This content is blocked. Contact the site owner to fix the issue."*, không
 * nói vì sao. Mọi lượt xem bản mềm, hợp đồng và bản scan đều hỏng.
 *
 * VÌ SAO KHÔNG CÓ CA NÀO BẮT ĐƯỢC. CSP là header do **Caddy** đặt; bộ kiểm thử
 * gọi thẳng vào service, và jsdom thì không thi hành CSP. Chỉ chồng demo — Caddy
 * thật, trình duyệt thật — mới lộ ra. Nghĩa là cả một lớp cấu hình đứng ngoài
 * tầm với của mọi phép kiểm tự động đang có.
 *
 * Ca này thu hẹp khoảng trống ấy theo cách duy nhất còn lại: ĐỌC cấu hình như
 * một chuỗi và đối chiếu với thứ mã nguồn thật sự cần. Nó không chứng minh
 * trình duyệt sẽ chấp nhận — chỉ chứng minh hai bên không nói ngược nhau.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const caddy = () => readFileSync('deploy/caddy/Caddyfile', 'utf8');

/** Chuỗi CSP, tách thành bảng chỉ thị → danh sách nguồn. */
const csp = (): Record<string, string[]> => {
  const m = /Content-Security-Policy\s+"([^"]+)"/.exec(caddy());
  expect(m, 'không tìm thấy Content-Security-Policy trong Caddyfile').not.toBeNull();
  return Object.fromEntries(
    m![1]!
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [ten, ...nguon] = p.split(/\s+/);
        return [ten!, nguon];
      }),
  );
};

describe('`0072` CSP cho phép đúng thứ giao diện dùng', () => {
  it('giao diện CÓ dựng `blob:` — nếu không thì ca dưới vô nghĩa', () => {
    /*
     * Vế đối chứng. Ngày nào giao diện thôi dùng `blob:` thì ca dưới phải được
     * xem lại chứ không phải cứ nới CSP mãi — nới một chỉ thị mà không ai còn
     * cần là để lại một cánh cửa mở không lý do.
     */
    const api = readFileSync('apps/web/src/lib/api.ts', 'utf8');
    expect(api).toMatch(/URL\.createObjectURL/);
  });

  it('`frame-src` cho phép `blob:` — PDF nhúng trong hộp xem', () => {
    /*
     * `<iframe src="blob:…">` là cách DUY NHẤT xem được: đường tải nội dung đòi
     * header `Authorization`, mà `<iframe src>` không gửi header nào. Nên nội
     * dung phải tải bằng `fetch` rồi dựng blob để nhúng.
     */
    const d = csp();
    expect(d['frame-src'], '`frame-src` phải được KHAI, không để rơi về default-src').toBeDefined();
    expect(d['frame-src']).toContain('blob:');
  });

  it('`img-src` cho phép `blob:` — ảnh thu nhỏ trên thẻ tệp', () => {
    // `TheTep` dựng ảnh xem trước cũng bằng blob, cùng một lý do: `<img src>`
    // không gửi header `Authorization`.
    expect(csp()['img-src']).toContain('blob:');
  });

  it('KHÔNG nới quá tay: `script-src` vẫn khoá, `object-src` vẫn `none`', () => {
    /*
     * Nửa còn lại của việc nới CSP. `blob:` chỉ cho phép nội dung do CHÍNH trang
     * này tạo ra trong bộ nhớ tab — nó không mở cửa cho nguồn ngoài nào. Nhưng
     * một lượt sửa CSP rất dễ nới rộng hơn mức cần, và không có gì báo.
     */
    const d = csp();
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    for (const [ten, nguon] of Object.entries(d)) {
      expect(nguon, `${ten} không được dùng ký tự đại diện`).not.toContain('*');
      expect(nguon, `${ten} không được cho phép script nội tuyến`).not.toContain("'unsafe-eval'");
    }
  });

  it('CHỈ `style-src` được nới `unsafe-inline`, và có lý do viết ngay cạnh', () => {
    const d = csp();
    const noi = Object.entries(d).filter(([, n]) => n.includes("'unsafe-inline'"));
    expect(noi.map(([t]) => t)).toEqual(['style-src']);
    expect(caddy(), 'phải nói VÌ SAO nới').toMatch(/unsafe-inline.*[\s\S]{0,400}?tiêm CSS/);
  });
});
