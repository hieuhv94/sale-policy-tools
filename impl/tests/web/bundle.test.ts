/**
 * FE-38 — ngân sách gói dùng chung.
 *
 * Dựng thật rồi ĐO, không ước lượng. Ngân sách chỉ có tác dụng khi nó đỏ được:
 * ai thêm một thư viện nặng sẽ thấy ngay ở đây thay vì thấy ở máy người dùng
 * dùng mạng 4G.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const DIST = 'apps/web/dist/assets';

/** Trần của `FE-38`: gói dùng chung ≤ 250KB sau khi nén. */
const TRAN_KB = 250;

let kbJs = 0;
let kbCss = 0;

beforeAll(async () => {
  await exec('pnpm', ['build:web'], { maxBuffer: 20 * 1024 * 1024 });
  for (const tep of readdirSync(DIST)) {
    const b = readFileSync(join(DIST, tep));
    const kb = gzipSync(b).byteLength / 1024;
    if (tep.endsWith('.js')) kbJs += kb;
    if (tep.endsWith('.css')) kbCss += kb;
  }
}, 300_000);

describe('FE-38 gói dùng chung', () => {
  it(`JS + CSS sau khi nén dưới ${TRAN_KB}KB`, () => {
    const tong = kbJs + kbCss;
    expect(kbJs, 'không tìm thấy gói JS nào — build hỏng?').toBeGreaterThan(0);
    expect(
      tong,
      `gói dùng chung ${tong.toFixed(1)}KB nén, vượt trần ${TRAN_KB}KB. ` +
        'Kiểm xem vừa thêm thư viện nào.',
    ).toBeLessThan(TRAN_KB);
  });

  it('không nhét thư viện component nặng vào gói', () => {
    // Bản thiết kế đề xuất Ant Design. Đã đi chệch có chủ ý — xem nhật ký P7d:
    // riêng nó đã chiếm phần lớn ngân sách trên, trong khi bảng sản phẩm vẫn
    // phải viết tay vì AntD không làm được kiểu thẻ giữ đủ 10 cột của FE-03.
    const goi = JSON.parse(readFileSync('apps/web/package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(goi.dependencies).sort()).toEqual(['react', 'react-dom']);
  });
});
