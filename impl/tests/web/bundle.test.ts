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

  /**
   * DANH SÁCH KHÉP, không phải một phép lọc (`0193`).
   *
   * Ca này gác *"đừng nhét một thư viện component vào gói"*, và tới `0192` nó
   * gác bằng cách đòi đúng hai tên. `0193` thêm `@csbh/domain-policy` — gói
   * thuần hằng và hàm tính, không phụ thuộc gì, để hộp thoại thêm dòng gọi CHÍNH
   * `computeLine` mà máy chủ gọi thay vì chép lại công thức (`FE-27`).
   *
   * VÌ SAO KHÔNG NỚI THÀNH *"cho phép mọi `@csbh/*`"*: phần lớn gói trong kho
   * này kéo theo Nest, `pg`, `nodemailer` — nhập nhầm một cái là ngân sách vỡ,
   * mà phép lọc theo tiền tố thì im lặng cho qua. Danh sách khép bắt người thêm
   * gói thứ tư phải sửa đúng dòng này và tự hỏi nó nặng bao nhiêu; ca đo kích
   * thước ngay trên trả lời nốt phần còn lại.
   */
  it('không nhét thư viện component nặng vào gói', () => {
    // Bản thiết kế đề xuất Ant Design. Đã đi chệch có chủ ý — xem nhật ký P7d:
    // riêng nó đã chiếm phần lớn ngân sách trên, trong khi bảng sản phẩm vẫn
    // phải viết tay vì AntD không làm được kiểu thẻ giữ đủ 10 cột của FE-03.
    const goi = JSON.parse(readFileSync('apps/web/package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(goi.dependencies).sort()).toEqual([
      '@csbh/domain-policy',
      'react',
      'react-dom',
    ]);
  });

  it('`@csbh/domain-policy` KHÔNG kéo theo phụ thuộc nào', () => {
    /*
     * Điều kiện để gói ấy được phép có mặt trong gói trình duyệt.
     *
     * Ca trên chỉ đòi cái TÊN. Ngày ai đó thêm `pg` hay `@nestjs/common` vào
     * `domain-policy` thì tên vẫn thế, và cả cây phụ thuộc mới đi thẳng vào gói
     * của trình duyệt — ca đo kích thước sẽ đỏ, nhưng câu nó nói (*"kiểm xem vừa
     * thêm thư viện nào"*) không chỉ tới đây.
     */
    const goi = JSON.parse(readFileSync('packages/domain-policy/package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(Object.keys(goi.dependencies ?? {})).toEqual([]);
    expect(Object.keys(goi.peerDependencies ?? {})).toEqual([]);
  });
});

/**
 * `0193` — MỘT phép đổi `Rate2` → `numeric(5,2)`, không sáu.
 *
 * Tệp này vốn gác ngân sách gói, nhưng ca dưới đây đúng chỗ: nó cũng là một phép
 * quét MÃ NGUỒN, và thứ nó gác là điều kiện để giao diện được phép tính toán.
 *
 * `FE-27` cấm giao diện tính lại vì sợ một bản cài đặt thứ hai của phép làm
 * tròn. Hộp thoại thêm dòng gọi `computeLine` + `rate2ToNumeric` — chính hai hàm
 * máy chủ gọi — nên không có bản thứ hai nào. Điều đó chỉ đúng chừng nào phép
 * đổi ấy còn nằm ở MỘT chỗ: viết lại `(x / 100).toFixed(2)` ở đâu đó là dựng lại
 * bản thứ hai, và nó sẽ trôi trong im lặng vì hai bản khởi đầu bằng nhau.
 */
describe('`0193` phép đổi Rate2 sang numeric nằm ở đúng một chỗ', () => {
  const NGUON = ['services', 'packages', 'apps/web/src'];

  it('không nơi nào viết lại `(x / 100).toFixed(2)`', () => {
    const sai: string[] = [];
    const quet = (thuMuc: string) => {
      for (const m of readdirSync(thuMuc, { withFileTypes: true })) {
        const p = join(thuMuc, m.name);
        if (m.isDirectory()) {
          if (m.name === 'node_modules' || m.name === 'dist') continue;
          quet(p);
          continue;
        }
        if (!/\.tsx?$/.test(m.name)) continue;
        // Chính tệp khai hàm ấy thì được — nó LÀ chỗ duy nhất.
        if (p.endsWith(join('domain-policy', 'src', 'money.ts'))) continue;
        const s = readFileSync(p, 'utf8');
        if (/\/\s*100\s*\)\s*\.toFixed\(2\)/.test(s)) sai.push(p);
      }
    };
    for (const g of NGUON) quet(g);
    expect(sai, `\ndùng \`rate2ToNumeric()\` thay vì viết lại:\n${sai.join('\n')}\n`).toEqual([]);
  });
});
