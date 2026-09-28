/**
 * `0178` — TÀI LIỆU KHÔNG ĐƯỢC NÓI SAI VỀ THỨ ĐANG CHẠY.
 *
 * Lượt rà 06/09 tìm ra hai lớp lệch trong `agents/KIEN-TRUC-CSBH.md`, và cả hai
 * đều sống sót vì **không ai canh**:
 *
 *   1. **Số đếm trôi.** Tài liệu khai *"11 trạng thái"* suốt từ bản thiết kế;
 *      `0155` gỡ `TU_CHOI` khỏi enum mà không chỗ nào đỏ. Con số ấy còn lọt vào
 *      `impl/docs/03-HUONG-DAN-SU-DUNG.md` — tài liệu khách hàng đọc.
 *   2. **Công cụ không tồn tại.** Tài liệu khai đang dùng Prisma, Playwright,
 *      BullMQ, Chromium, Ant Design, Testcontainers, k6, docxtemplater — **không
 *      gói nào trong số đó có trong repo**. Ai đọc để lên môi trường sẽ đi cài
 *      một chồng công cụ mà phần mềm không dùng.
 *
 * Hai lớp ấy có chung một hình dạng: **hai vế ở hai thế giới**. Một vế là văn bản
 * tiếng Việt, vế kia là `STATUSES` và `package.json` — và không trình dịch nào
 * nối chúng lại. Đây là cùng lý do `0134` và `0151` phải viết ca quét.
 *
 * Tệp thuần: đọc tệp trên đĩa, không dựng ứng dụng, không chạm CSDL.
 *
 * ---------------------------------------------------------------------------
 * PHẠM VI QUÉT, VÀ VÌ SAO NHẬT KÝ ĐỨNG NGOÀI
 * ---------------------------------------------------------------------------
 *
 * Quét tài liệu **HIỆN HÀNH**: yêu cầu nghiệp vụ, kiến trúc, ba tài liệu bàn
 * giao, và `CLAUDE.md`. `agents/NHAT-KY-TRIEN-KHAI.md` đứng NGOÀI — nó ghi lại
 * chuyện đã xảy ra, nên nó **phải** giữ được tên cũ và con số cũ. Một ca kiểm bắt
 * viết lại lịch sử là một ca kiểm sai; `0151` đã phải nói đúng điều này một lần.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATUSES } from '@csbh/domain-policy';

/**
 * Tài liệu nguồn nằm NGOÀI `impl/`, nên chúng được mount riêng vào
 * `/tai-lieu` (xem `deploy/compose.test.yml`). Ngoài container thì đọc thẳng
 * đường tương đối.
 */
const GOC = existsSync('/tai-lieu/agents') ? '/tai-lieu' : '..';

const TAI_LIEU: string[] = [
  join(GOC, 'agents/YEU-CAU-NGHIEP-VU-CSBH.md'),
  join(GOC, 'agents/KIEN-TRUC-CSBH.md'),
  join(GOC, 'CLAUDE.md'),
  ...readdirSync('docs')
    .filter((f) => f.endsWith('.md'))
    .map((f) => join('docs', f)),
];

/**
 * KHÔNG đọc được thì ĐỎ, không phải bỏ qua.
 *
 * `0156` đã trả giá cho một bước im lặng: *"một bước dọn im lặng bỏ qua sẽ có
 * ngày im lặng không chạy"*. Ở đây còn tệ hơn — một phép kiểm tài liệu tự tắt
 * khi thiếu mount trông giống hệt một phép kiểm đang xanh.
 */
const doc = (f: string): string => {
  expect(existsSync(f), `không đọc được ${f} — thiếu mount trong compose.test.yml?`).toBe(true);
  return readFileSync(f, 'utf8');
};

/** Bỏ `*` và `` ` `` để `**10** trạng thái` khớp cùng một mẫu với `10 trạng thái`. */
const tron = (s: string): string => s.replace(/[*`~]/g, '');

/**
 * Gộp các dòng liên tiếp thành ĐOẠN, kèm số dòng đầu đoạn.
 *
 * Bản đầu của ca kiểm dưới quét theo DÒNG, và nó đỏ ở một câu hoàn toàn đúng:
 * *"…không dùng \n Testcontainers, Playwright hay k6"* — chữ *không* nằm ở dòng
 * trước vì markdown xuống dòng thủ công ở cột 100. Đoạn mới là đơn vị ngữ nghĩa
 * đúng: một câu tiếng Việt không bị cắt đôi bởi chỗ người ta bấm Enter.
 */
const doanCua = (noiDung: string): { dong: number; text: string }[] => {
  const ra: { dong: number; text: string }[] = [];
  let dau = 0;
  let gom: string[] = [];
  tron(noiDung)
    .split('\n')
    .forEach((l, i) => {
      if (l.trim() === '') {
        if (gom.length) ra.push({ dong: dau + 1, text: gom.join(' ') });
        gom = [];
      } else {
        if (!gom.length) dau = i;
        gom.push(l.trim());
      }
    });
  if (gom.length) ra.push({ dong: dau + 1, text: gom.join(' ') });
  return ra;
};

/** Các dòng khớp `re`, kèm số dòng — để câu báo lỗi chỉ thẳng chỗ phải sửa. */
const khop = (noiDung: string, re: RegExp): { dong: number; text: string; so: number }[] =>
  tron(noiDung)
    .split('\n')
    .flatMap((l, i) =>
      [...l.matchAll(re)].map((m) => ({ dong: i + 1, text: l.trim(), so: Number(m[1]) })),
    );

describe('`0178` tài liệu hiện hành khớp với thứ đang chạy', () => {
  /**
   * MIỄN TRỪ phải khai kèm LÝ DO, cùng khuôn `NUOT_CO_LY_DO` của `0089`.
   *
   * Không phải mọi con số đứng trước chữ "trạng thái" đều là tổng số trạng thái
   * của máy trạng thái. Khai ra từng chỗ, kèm lý do, thì người thêm một miễn trừ
   * mới phải dừng lại và tự hỏi mình đang miễn trừ cái gì.
   */
  const MIEN_TRU_TRANG_THAI: Record<string, string> = {
    '11 hành động × 2 trạng thái':
      'nhật ký chặng P171 — kích thước một bảng đối chiếu, không phải tổng số trạng thái',
    '146, trải khắp 9 trạng thái':
      'dữ liệu của `make demo-mau` — bộ nạp không dựng hồ sơ ở đủ mười trạng thái',
    // `0180` — ba trạng thái của một DÒNG SẢN PHẨM (*Bổ sung* · *Chỉnh sửa* ·
    // *Đang áp dụng*), không phải trạng thái của hồ sơ. Câu này là lời khách
    // hàng trích nguyên văn ở Phụ lục B, nên nó không sửa được để né phép quét.
    'sẽ có 3 trạng thái':
      'ba trạng thái của một DÒNG sản phẩm (`0180`), không phải của hồ sơ',
  };

  it('mọi con số "N trạng thái" khớp `STATUSES`, hoặc được miễn trừ có lý do', () => {
    /*
     * Vế đối chiếu là `STATUSES` chứ không phải một con số gõ tay ở đây: gõ tay
     * là dựng ra bản chép thứ ba, và bản thứ ba cũng sẽ trôi.
     */
    const dung = STATUSES.length;
    const sai: string[] = [];

    for (const f of TAI_LIEU) {
      for (const m of khop(doc(f), /(\d+)\s+trạng thái/g)) {
        if (m.so === dung) continue;
        if (Object.keys(MIEN_TRU_TRANG_THAI).some((k) => tron(m.text).includes(k))) continue;
        sai.push(`${f}:${m.dong} — "${m.so} trạng thái" (đúng: ${dung})\n    ${m.text}`);
      }
    }
    expect(sai, `\n${sai.join('\n')}\n`).toEqual([]);
  });

  it('con số viết bằng CHỮ cũng khớp `STATUSES`', () => {
    /*
     * `toEqual([])` ở ca trên chỉ bắt được CHỮ SỐ. Bản thiết kế viết "Mười một
     * trạng thái" bằng chữ, và nó đã sống sót đúng vì thế.
     *
     * Tới `0224` ca này CẤM cứng cụm *"mười một trạng thái"* — đúng lúc ấy, vì
     * con số thật là mười. `0225` thêm trạng thái thứ mười một và cụm ấy thành
     * câu ĐÚNG, còn *"Mười trạng thái"* ở KIEN-TRUC §07 thành câu sai mà lệnh cấm
     * cũ không bao giờ thấy. Nên giờ đổi chữ ra số rồi so với `STATUSES`, như ca
     * trên — một lệnh cấm một con số cụ thể là một bản chép khác của con số ấy.
     * Chỉ đọc từ mười trở lên: *"sáu trạng thái"* hay *"ba trạng thái"* là một
     * TẬP CON được kể ra (hồ sơ đang xử lý, dòng sản phẩm), không phải tổng số.
     */
    const SO: Record<string, number> = { 'mười': 10, 'mười một': 11, 'mười hai': 12, 'mười ba': 13 };
    const dung = STATUSES.length;
    const sai: string[] = [];
    for (const f of TAI_LIEU) {
      const s = tron(doc(f)).toLowerCase();
      for (const m of s.matchAll(/(mười(?: một| hai| ba)?)\s+trạng thái/g)) {
        if (SO[m[1]!] !== dung) sai.push(`${f}: "${m[0]}" (đúng: ${dung})`);
      }
    }
    expect(sai, `\n${sai.join('\n')}\n`).toEqual([]);
  });

  it('số migration khai trong tài liệu khớp số file `.sql` thật', () => {
    const dung = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).length;
    const sai: string[] = [];
    for (const f of TAI_LIEU) {
      for (const m of khop(doc(f), /(\d+)\s+migration/g)) {
        if (m.so === dung) continue;
        sai.push(`${f}:${m.dong} — "${m.so} migration" (đúng: ${dung})\n    ${m.text}`);
      }
    }
    expect(sai, `\n${sai.join('\n')}\n`).toEqual([]);
  });

  /**
   * Công cụ tài liệu từng khai là ĐANG DÙNG, mà repo không có gói nào.
   *
   * Mỗi tên đi kèm thứ đã THAY nó — vì câu hỏi tiếp theo của người đọc luôn là
   * *"thế giờ dùng gì"*, và một danh sách cấm không trả lời được câu ấy.
   */
  const DA_BO: Record<string, string> = {
    Prisma: '`pg` thuần + SQL viết tay',
    Playwright: 'jsdom trong cùng bộ Vitest',
    BullMQ: 'không còn hàng đợi việc nào',
    'Ant Design': 'component tự viết',
    Testcontainers: 'hạ tầng dựng bằng `compose.test.yml`',
    docxtemplater: 'mã tự viết ở `contracts/docx.ts`',
    Lighthouse: '`tests/web/bundle.test.ts`',
  };

  /*
   * `Chromium` CỐ Ý ĐỨNG NGOÀI danh sách trên, và đây là chỗ bản đầu của ca kiểm
   * này sai.
   *
   * Nó bị bỏ với tư cách **đường dựng PDF của chúng ta** (Playwright ở trên đại
   * diện cho lựa chọn ấy) — nhưng nó **vẫn đang chạy thật**, bên trong ảnh
   * Gotenberg. Nên `docs/04` viết *"Chromium trong Gotenberg ngốn nhất"* và
   * `docs/05` viết *"kiểm gotenberg: nó chạy Chromium"* đều là những câu ĐÚNG, và
   * một ca kiểm bắt xoá chúng đi sẽ làm tài liệu vận hành nói dối về thứ đang
   * chiếm RAM trên máy chủ.
   */

  /**
   * Dấu hiệu cho biết câu ấy đang NÓI VỀ việc đã bỏ, không phải khẳng định đang
   * dùng. Đây là chỗ mềm nhất của ca kiểm, và nó mềm có chủ ý: cấm tiệt cái tên
   * thì không viết được câu *"đã bỏ Prisma vì …"* — mà đúng câu ấy mới là thứ
   * người đọc sau này cần.
   */
  const PHU_DINH = /không|bỏ khỏi|đã bỏ|chưa dựng|nghỉ |đảo lựa chọn|đã gỡ|~~/i;

  it('không tài liệu nào khẳng định đang dùng một công cụ KHÔNG có trong repo', () => {
    /*
     * Vế thứ hai đọc CHÍNH `package.json` của cả bốn workspace — nếu một ngày
     * nào đó Playwright được thêm thật, ca này tự thôi đòi hỏi thay vì bắt người
     * ta đi sửa một danh sách cấm nằm ở chỗ khác.
     */
    const goi = new Set<string>();
    const them = (f: string) => {
      if (!existsSync(f)) return;
      const j = JSON.parse(readFileSync(f, 'utf8')) as Record<string, Record<string, string>>;
      for (const k of Object.keys({ ...j.dependencies, ...j.devDependencies })) goi.add(k.toLowerCase());
    };
    them('package.json');
    for (const d of ['apps', 'services', 'packages']) {
      for (const x of readdirSync(d)) them(join(d, x, 'package.json'));
    }

    const sai: string[] = [];
    for (const f of TAI_LIEU) {
      for (const { dong, text } of doanCua(doc(f))) {
        for (const [ten, thay] of Object.entries(DA_BO)) {
          if (!text.toLowerCase().includes(ten.toLowerCase())) continue;
          // Gói có thật trong repo thì tài liệu nói về nó là đúng.
          if ([...goi].some((g) => g.includes(ten.toLowerCase().replace(/\s/g, '')))) continue;
          if (PHU_DINH.test(text)) continue;
          sai.push(
            `${f}:${dong} — "${ten}" không có trong repo (đã thay bằng ${thay})\n    ${text.slice(0, 160)}`,
          );
        }
      }
    }
    expect(sai, `\n${sai.join('\n')}\n`).toEqual([]);
  });
});
