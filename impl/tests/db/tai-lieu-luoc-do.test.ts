/**
 * `0217` — KHỐI LƯỢC ĐỒ TRONG TÀI LIỆU KIẾN TRÚC PHẢI KHỚP CSDL THẬT.
 *
 * `0178` dựng `tests/http/tai-lieu.test.ts` cho hai lớp lệch của cùng tệp ấy —
 * số đếm trôi, và công cụ không tồn tại. Lượt rà 21/09 tìm ra **lớp thứ ba**, và
 * nó là lớp nguy hiểm nhất trong ba:
 *
 *     applied_date      date      -- NGÀY ÁP DỤNG: chỉ để hiển thị (§5.3)
 *
 * Cột ấy **đã `DROP` ở `0180`**, mười sáu chặng trước lượt rà này. Tài liệu vẫn
 * khai nó như một cột đang sống, ngay giữa khối lược đồ mà người đọc tra khi họ
 * cần biết dữ liệu nằm ở đâu — và không gì đỏ, vì hai vế ở hai thế giới: một bên
 * là văn bản tiếng Việt, bên kia là Postgres.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHÔNG QUÉT MIGRATION, DÙ NÓ RẺ HƠN
 * ---------------------------------------------------------------------------
 *
 * Cách hấp dẫn hơn là gom mọi `DROP COLUMN` trong `db/migrations/*.sql` rồi cấm
 * tài liệu nhắc tới chúng — không cần CSDL, tệp thuần. Đo ra thì nó **sai**:
 * `cpbh`, `cpbh_total`, `net_price` đều có trong danh sách ấy, vì có migration
 * xoá rồi dựng lại chúng dưới kiểu khác. Một phép quét như thế sẽ đỏ với ba cột
 * đang sống và đúng.
 *
 * Chỗ DUY NHẤT trả lời được *"cột này còn không"* là `information_schema`. Đó
 * đúng là bài học `0198` đã trả giá để học, ở đúng hình dạng ấy: một `grep` mã
 * nguồn không thay được một câu hỏi đặt cho chính CSDL.
 *
 * ---------------------------------------------------------------------------
 * MỘT CHIỀU, CÓ CHỦ Ý
 * ---------------------------------------------------------------------------
 *
 * Chỉ đòi *"cột tài liệu khai thì phải CÓ THẬT"*, không đòi chiều ngược. Khối ấy
 * mở đầu bằng *"Chỉ trình bày phần chi phối tính đúng đắn"* — nó là một bản rút
 * gọn có chủ ý, nên bắt nó liệt kê đủ mọi cột là bắt nó thành một thứ khác.
 *
 * Dòng đã đánh dấu **ĐÃ GỠ** thì đứng ngoài: tài liệu này cố ý giữ lại dấu vết
 * của thứ đã đảo thay vì xoá lặng lẽ (`0178`), và một ca kiểm bắt xoá chúng đi
 * là một ca kiểm chống lại chính quy ước ấy.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { admin, withClient } from './helpers.js';

const GOC = existsSync('/tai-lieu/agents') ? '/tai-lieu' : '..';
const KIEN_TRUC = join(GOC, 'agents/KIEN-TRUC-CSBH.md');

/** Hai khối lược đồ, nhận diện bằng dòng mở đầu của chính chúng. */
const KHOI: { neo: string; bang: string }[] = [
  { neo: '-- mốc thời gian là CỘT RIÊNG', bang: 'policy' },
  // Neo bằng DÒNG ĐẦU của chính khối, không bằng tên bảng: chuỗi `pol.policy_line`
  // còn xuất hiện sớm hơn trong khối ràng buộc (`ALTER TABLE … ADD CONSTRAINT
  // uq_line`), và neo vào đó thì phép cắt lấy nhầm khối `pol.policy` — bảy cột
  // của hồ sơ bị đem đi hỏi bảng dòng sản phẩm. Lượt chạy đầu đã dính đúng thế.
  { neo: 'pol.policy_line\n  policy_id', bang: 'policy_line' },
];

/**
 * Tên cột mà một khối khai là ĐANG SỐNG.
 *
 * Dòng bắt đầu bằng một định danh thường rồi tới khoảng trắng và một kiểu dữ
 * liệu. Bỏ qua dòng chú thích (`--`), dòng thụt vào (phần tiếp của chú thích
 * trước), và mọi dòng mang chữ `ĐÃ GỠ`.
 */
const cotKhai = (khoi: string): string[] =>
  khoi
    .split('\n')
    .filter((d) => !d.startsWith('--') && !/ĐÃ GỠ/.test(d))
    .map((d) => /^\s{0,2}([a-z][a-z0-9_]*)\s+[a-z]/.exec(d)?.[1])
    .filter((x): x is string => x !== undefined && x !== 'pol');

describe('`0217` khối lược đồ của tài liệu kiến trúc', () => {
  it('mọi cột tài liệu khai là đang sống đều CÓ THẬT trong CSDL', async () => {
    const vb = readFileSync(KIEN_TRUC, 'utf8');
    const that = await withClient(admin(), async (c) => {
      const r = await c.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'pol' AND table_name = ANY($1)`,
        [KHOI.map((k) => k.bang)],
      );
      return new Set(r.rows.map((x) => `${x.table_name}.${x.column_name}`));
    });

    const thieu: string[] = [];
    for (const { neo, bang } of KHOI) {
      const i = vb.indexOf(neo);
      expect(i, `không tìm thấy khối lược đồ neo bằng "${neo}"`).toBeGreaterThan(-1);
      const khoi = vb.slice(i, vb.indexOf('```', i));
      const cot = cotKhai(khoi);
      // Một khối rỗng thì vòng lặp dưới xanh mà chẳng đo gì — đúng bẫy `0205`
      // đã ghi cho phép đếm địa chỉ của bộ nạp demo.
      expect(cot.length, `không đọc ra cột nào trong khối ${bang}`).toBeGreaterThan(5);
      for (const ten of cot) if (!that.has(`${bang}.${ten}`)) thieu.push(`${bang}.${ten}`);
    }

    expect(
      thieu,
      `tài liệu khai những cột KHÔNG còn trong CSDL: ${thieu.join(', ')}`,
    ).toEqual([]);
  });
});
