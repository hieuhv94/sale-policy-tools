/**
 * `0257` — phông Be Vietnam Pro TỰ HOST.
 *
 * Ba cách hỏng đều IM LẶNG: trình duyệt rơi về phông dự phòng mà không báo lỗi
 * nào, và trang vẫn đọc được — chỉ là không phải phông đã duyệt.
 *   1. `@font-face` trỏ tới một tệp không có trong `public/fonts/` (đổi tên, gõ sai).
 *   2. `src` trỏ ra ngoài (fonts.googleapis.com…) — CSP `font-src 'self' data:`
 *      chặn lặng lẽ. Đây đúng là lỗi của bản mockup đầu tiên.
 *   3. Ô nhập/nút không thừa kế phông của trang (mặc định của trình duyệt), nên
 *      giữa một trang Be Vietnam Pro mọi ô nhập vẫn là phông hệ thống.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PHONG = readFileSync('apps/web/src/styles/phong.css', 'utf8');
const APP = readFileSync('apps/web/src/styles/app.css', 'utf8');
const TOKENS = readFileSync('apps/web/src/styles/tokens.css', 'utf8');
const MAIN = readFileSync('apps/web/src/main.tsx', 'utf8');

const nguon = [...PHONG.matchAll(/src:\s*url\('([^']+)'\)/g)].map((m) => m[1]!);

describe('`0257` phông tự host', () => {
  it('bốn độ đậm × hai bộ ký tự (latin + vietnamese)', () => {
    const khoi = [...PHONG.matchAll(/font-weight:\s*(\d+);[\s\S]*?url\('\/fonts\/be-vietnam-pro-\d+-([a-z]+)\.woff2'\)/g)];
    expect(khoi.map((m) => `${m[1]}-${m[2]}`).sort()).toEqual(
      ['400', '500', '600', '700'].flatMap((w) => [`${w}-latin`, `${w}-vietnamese`]).sort(),
    );
  });

  it('mọi `src` là đường dẫn CÙNG GỐC, và tệp có thật trong `public/`', () => {
    expect(nguon.length).toBe(8);
    for (const u of nguon) {
      expect(u, `${u} không cùng gốc — CSP font-src 'self' sẽ chặn`).toMatch(/^\/fonts\//);
      expect(existsSync(`apps/web/public${u}`), `thiếu tệp apps/web/public${u}`).toBe(true);
    }
    expect(existsSync('apps/web/public/fonts/OFL.txt'), 'thiếu giấy phép OFL').toBe(true);
  });

  it('phông được nạp và được DÙNG: main.tsx nhập phong.css, body và ô nhập dùng nó', () => {
    expect(MAIN).toContain("import './styles/phong.css';");
    expect(TOKENS).toMatch(/--phong:\s*'Be Vietnam Pro',/);
    expect(APP).toMatch(/body \{[^}]*font-family: var\(--phong\);/);
    expect(APP).toMatch(/button, input, select, textarea \{ font-family: inherit; \}/);
  });
});
