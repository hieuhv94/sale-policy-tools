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

/**
 * `0199` — BỘ NẠP DEMO PHẢI THEO KỊP LUẬT MỘT-BẢN-NHÁP-MỖI-KHÁCH (`0197`).
 *
 * **Lần thứ BA** bộ nạp demo bị bỏ quên trong một lượt đổi luật: `0168` (chốt
 * `BAN_MEM_REQUIRED`), `0180` (gỡ `applied_date`), và giờ là `0197` — chỉ mục
 * `uq_policy_nhap_moi_khach` cộng chốt `DRAFT_EXISTS`. Triệu chứng:
 * `make demo-mau` chết giữa chừng bằng `409 DRAFT_EXISTS`, ở một chỗ tuỳ số
 * khách và số hồ sơ — tức mỗi lần sửa bộ nạp lại chết ở một chỗ khác.
 *
 * VẾ ÍT AI NGHĨ TỚI, và nó mới là thứ làm hỏng bộ nạp: luật đọc như *"một khách
 * một bản Nháp"*, nhưng hệ quả thật là **khách đang giữ Nháp thì không lập thêm
 * được hồ sơ NÀO nữa** — mọi lượt `POST /policies` đều dựng ra một bản Nháp
 * trước, kể cả lượt lập phiên bản mới.
 *
 * CHỈ QUÉT ĐƯỢC HAI QUYẾT ĐỊNH, và nói ra điều đó: va chạm thật phụ thuộc dữ
 * liệu (khách nào ở lượt thứ mấy), không quét bằng chuỗi được. Hai quyết định
 * dưới đây là thứ giữ cho nó không xảy ra, và cả hai đều trông vô hại với người
 * đọc lướt — đúng loại dòng bị sửa "cho gọn" rồi vỡ ở buổi trình bày kế tiếp.
 */
describe('`0199` bộ nạp demo và luật một bản Nháp mỗi khách', () => {
  const nguon = () => readFileSync('scripts/seed-demo.ts', 'utf8');

  it('`NHAP` là nhóm CUỐI CÙNG của `KE_HOACH`', () => {
    const m = nguon().match(/const KE_HOACH:[^=]*=\s*\[([\s\S]*?)\n\s*\];/);
    expect(m, 'không tìm thấy bảng KE_HOACH').not.toBeNull();
    const nhom = [...m![1]!.matchAll(/\[\s*'([A-Z_]+)'/g)].map((x) => x[1]!);
    expect(nhom.length).toBeGreaterThan(1);
    expect(
      nhom[nhom.length - 1],
      `KE_HOACH đang kết thúc bằng ${nhom[nhom.length - 1]}; ` +
        'nhóm NHAP phải đứng cuối, vì khách giữ Nháp thì không lập thêm hồ sơ nào được',
    ).toBe('NHAP');
  });

  it('khách giữ bản Nháp viết tay ĐỨNG NGOÀI vòng sinh hàng loạt', () => {
    /*
     * `KH-0001` giữ bản Nháp của phần viết tay. Để nó trong `cuaTdv01` là mọi
     * vòng lặp sau đó có thể rơi trúng nó — và lượt nạp chết ở đó.
     */
    const s = nguon().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const m = s.match(/const cuaTdv01 = KHACH\.filter\(([\s\S]*?)\)\.map\(/);
    expect(m, 'không tìm thấy phép dựng cuaTdv01').not.toBeNull();
    expect(
      m![1]!.includes("'KH-0001'"),
      'cuaTdv01 phải loại trừ KH-0001 — khách ấy giữ bản Nháp viết tay',
    ).toBe(true);
  });

  it('bản Nháp viết tay lập SAU hồ sơ bị trả lại của cùng khách', () => {
    /*
     * Hai hồ sơ viết tay cùng dùng `KH-0001`, và thứ tự giữa chúng là luật chứ
     * không phải sở thích: bản Nháp phải là thứ CUỐI CÙNG lập cho khách ấy.
     */
    const s = nguon();
    const nhap = s.indexOf('// 1. NHÁP');
    const traLai = s.indexOf('// 5. YÊU CẦU CHỈNH SỬA');
    expect(nhap, 'không tìm thấy hồ sơ viết tay số 1').toBeGreaterThan(0);
    expect(traLai, 'không tìm thấy hồ sơ viết tay số 5').toBeGreaterThan(0);
    expect(traLai, 'hồ sơ 5 phải lập TRƯỚC hồ sơ 1 — cả hai cùng KH-0001').toBeLessThan(nhap);
  });

  it('lượt đổi giá cuối bộ nạp với tới được hồ sơ CÒN SỬA ĐƯỢC', () => {
    /*
     * Hai đường đọc chênh lệch hỏi danh mục ở HAI thời điểm: hồ sơ đã đóng băng
     * so với bảng giá HÔM NAY, hồ sơ còn sửa được so ở NGÀY ÁP DỤNG của từng
     * dòng (`0180`). Đổi giá hiệu lực từ hôm nay thì chỉ nhóm đầu thấy, và nút
     * *Tự động cập nhật* của `0194` trên bản demo không có gì để áp — một khối
     * cảnh báo trống, không phải một lỗi, nên không ai phát hiện ra.
     */
    const s = nguon().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const khoi = s.slice(s.indexOf('const doiGia:'));
    /*
     * Quét MỌI `effectiveFrom` trong khối, không chỉ hỏi "có còn một chỗ dùng
     * hằng không" — bản đầu của ca này hỏi đúng câu sau, và lượt phá lại vá một
     * trong hai chỗ thì nó vẫn xanh. Khối có hai lượt ghi (giá sản phẩm và
     * ngưỡng quy định), và một nửa lệch cũng đủ làm mất đúng loại lệch ấy khỏi
     * bản demo.
     */
    const ngay = [...khoi.matchAll(/effectiveFrom:\s*([A-Za-z_][\w.]*)/g)].map((m) => m[1]!);
    expect(ngay.length, 'khối đổi giá phải có ít nhất hai lượt ghi').toBeGreaterThanOrEqual(2);
    for (const v of ngay) {
      expect(v, `đổi giá theo \`${v}\` thì hồ sơ còn sửa được không thấy gì`).toBe(
        'NGAY_AP_DUNG_MAC_DINH',
      );
    }
  });
});
