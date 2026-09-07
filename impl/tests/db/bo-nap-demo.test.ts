/**
 * `0180` — SQL THÔ CỦA BỘ NẠP DEMO PHẢI KHỚP LƯỢC ĐỒ ĐANG CHẠY.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CÓ TỆP NÀY
 * ---------------------------------------------------------------------------
 *
 * `scripts/seed-demo.ts` dựng dữ liệu mẫu qua **đường API thật**, trừ một chỗ:
 * nó vặn đồng hồ bằng `UPDATE` thẳng vào `pol.policy` và `pol.policy_line` để
 * dựng ba năm lịch sử (`0095`). Mười lăm bước duyệt của một hồ sơ 2024 không có
 * đường API nào đặt lại được, nên chỗ ấy buộc phải là SQL thô.
 *
 * Và SQL thô là chỗ **không có gì canh**: `tsc` không đọc chuỗi, `make test`
 * không chạy bộ nạp (nó cần cả chồng demo), nên một cột bị đổi tên hay gỡ đi chỉ
 * lộ ra lúc ai đó gõ `make demo-mau` — thường là ngay trước một buổi trình bày.
 *
 * `0180` gỡ `pol.policy.applied_date`, và câu `UPDATE` của bộ nạp vẫn đặt cột
 * ấy. Đây là **lần thứ hai** bộ nạp demo bị bỏ quên trong một lượt đổi luật:
 * `0168` là lần đầu (chốt `BAN_MEM_REQUIRED` thêm vào luồng, 22 chỗ trong bộ
 * kiểm được vá, `seed-demo` thì không) — và bài học ghi lúc ấy là *"bộ nạp demo
 * cũng đẩy hồ sơ qua B8"*. Lần này bài học rộng hơn một bậc: **bộ nạp demo là
 * một người dùng của lược đồ, và nó cần một chốt chặn như mọi người dùng khác.**
 *
 * ---------------------------------------------------------------------------
 * CHỈ KIỂM ĐƯỢC PHẦN SQL, VÀ NÓI RA ĐIỀU ĐÓ
 * ---------------------------------------------------------------------------
 *
 * Ca kiểm này KHÔNG chạy bộ nạp. Nó đọc mã nguồn, rút ra tên cột trong các câu
 * `UPDATE pol.<bảng> SET …`, rồi đối chiếu với `information_schema` của CSDL
 * đang chạy — hai thế giới, một câu hỏi.
 *
 * Phần bộ nạp gọi API (DTO, mã lỗi, thứ tự bước) vẫn không có gì canh ngoài một
 * lượt `make demo-mau` thật. Nói ra để một bảo đảm nửa phần không bị đọc thành
 * bảo đảm đầy đủ — đúng lối `0102` đã ghi cho con số 13 mục.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { admin } from './helpers';

let db: Client;

beforeAll(async () => {
  db = admin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

const NGUON = ['scripts/seed-demo.ts', 'scripts/nap-danh-muc.ts'];

/**
 * Rút `{bảng, cột}` từ mọi câu `UPDATE <schema>.<bảng> SET a = …, b = …`.
 *
 * Cắt tới `WHERE` chứ không tới hết chuỗi: mệnh đề `WHERE` cũng nhắc tên cột,
 * nhưng một cột chỉ đọc mà sai tên thì Postgres cũng ném lỗi — nên bỏ qua nó
 * chỉ làm ca này yếu đi chứ không sai. Giữ phạm vi hẹp để phép rút chuỗi không
 * biến thành một bộ phân tích SQL viết dở.
 */
function cotTrongUpdate(ma: string): { bang: string; cot: string }[] {
  const ra: { bang: string; cot: string }[] = [];
  for (const m of ma.matchAll(/UPDATE\s+(\w+)\.(\w+)[\s\S]*?SET([\s\S]*?)WHERE/g)) {
    const bang = `${m[1]}.${m[2]}`;
    for (const c of m[3]!.matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=/g)) {
      ra.push({ bang, cot: c[1]! });
    }
  }
  return ra;
}

describe('`0180` bộ nạp demo và lược đồ nói cùng một thứ tiếng', () => {
  it('mọi cột mà bộ nạp GHI vào đều có thật trong CSDL', async () => {
    const co = await db.query<{ table_schema: string; table_name: string; column_name: string }>(
      `SELECT table_schema, table_name, column_name FROM information_schema.columns
        WHERE table_schema IN ('pol','cus','cat','doc','idn','ntf','rpt','sla')`,
    );
    const that = new Set(
      co.rows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`),
    );

    const sai: string[] = [];
    let daQuet = 0;
    for (const tep of NGUON) {
      for (const { bang, cot } of cotTrongUpdate(readFileSync(tep, 'utf8'))) {
        daQuet += 1;
        if (!that.has(`${bang}.${cot}`)) sai.push(`${tep}: ${bang}.${cot}`);
      }
    }

    /*
     * Đếm số cột đã quét, và đòi nó KHÁC KHÔNG.
     *
     * Không có dòng này thì ca kiểm xanh rực rỡ vào ngày phép rút chuỗi hỏng —
     * đổi cách viết câu SQL, hay đơn giản là đổi tên tệp bộ nạp. Một ca kiểm
     * quét mã nguồn mà không đếm thứ nó quét được là một ca kiểm tự tắt.
     */
    expect(daQuet, 'không rút được cột nào — phép quét hỏng, không phải bộ nạp sạch')
      .toBeGreaterThan(5);
    expect(sai, `\ncột không có trong lược đồ:\n${sai.join('\n')}\n`).toEqual([]);
  });

  it('bộ nạp KHÔNG còn nhắc tới trường đã gỡ của API hồ sơ', () => {
    /*
     * Vế thứ hai, và nó canh phần bộ nạp gọi API — chỗ mà ca trên không với tới.
     *
     * Danh sách hẹp có chủ ý: chỉ những cái tên `0180` vừa gỡ, chứ không phải
     * một bộ lọc chung. Một danh sách cấm dài là thứ người sau sẽ nới ra cho
     * qua chuyện; ba dòng có ngày tháng thì không.
     */
    const cam: Record<string, string> = {
      appliedDate: '`0180` — ngày áp dụng chuyển xuống dòng, khoá là `ngayApDung`',
      "'SUPPLEMENT'": "`0180` — gộp vào `'NEW_VERSION'`",
      "'AMEND'": "`0180` — gộp vào `'NEW_VERSION'`",
    };
    for (const tep of NGUON) {
      const s = readFileSync(tep, 'utf8');
      for (const [tu, ly] of Object.entries(cam)) {
        // Bỏ chú thích trước khi quét: nhật ký của chính lượt sửa nhắc tên cũ,
        // và cấm nhắc tới nó trong lời giải thích là cấm giải thích.
        const ma = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        expect(ma.includes(tu), `${tep} còn dùng ${tu} — ${ly}`).toBe(false);
      }
    }
  });
});
