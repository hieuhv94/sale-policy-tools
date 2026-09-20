/**
 * `0208` — Ô NHẬP NGÀY dạng `dd/mm/yyyy` (khách hàng chốt 20/09).
 *
 * Tệp thuần: gọi ba hàm dịch lối viết, không dựng ứng dụng, không chạm CSDL. Vế
 * DOM nằm ở `tests/web/canh-bao-chiet-khau.test.tsx`.
 *
 * Nằm ở `tests/http/` chứ không `tests/web/` vì nó cần **cả hai thế giới**: bộ
 * kiểm của máy chủ (`ngayIso` trong `@csbh/http-kit`) và hàm của giao diện. Môi
 * trường jsdom không nạp được gói máy chủ; cùng lối `tinh-thanh.test.ts` của
 * `0205`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ngayIso } from '@csbh/http-kit';
import { isoTuNgay, matNaNgay, ngayTuIso } from '../../apps/web/src/lib/ngay-nhap.js';
import { ngay } from '../../apps/web/src/lib/format.js';
import { dmyHm } from '../../services/document/src/contracts/dinh-dang.js';

/** Ngày hợp lệ, gồm hai ca biên: năm nhuận và ngày cuối năm. */
const HOP_LE: [string, string][] = [
  ['2026-09-20', '20/09/2026'],
  ['2026-01-01', '01/01/2026'],
  ['2026-12-31', '31/12/2026'],
  ['2024-02-29', '29/02/2024'],
  ['2020-06-01', '01/06/2020'],
];

describe('`0208` mặt nạ lúc gõ', () => {
  it('chèn dấu gạch theo số chữ số đã gõ', () => {
    expect(matNaNgay('')).toBe('');
    expect(matNaNgay('2')).toBe('2');
    expect(matNaNgay('20')).toBe('20');
    expect(matNaNgay('209')).toBe('20/9');
    expect(matNaNgay('2009')).toBe('20/09');
    expect(matNaNgay('200920')).toBe('20/09/20');
    expect(matNaNgay('20092026')).toBe('20/09/2026');
  });

  it('bỏ mọi thứ không phải chữ số, nên gõ lại chuỗi đã có dấu vẫn đúng', () => {
    /*
     * Hàm chạy trên CHÍNH chuỗi đang nằm trong ô, nên nó phải bất biến khi gọi
     * lại: `20/09/2026` vào phải ra đúng nó. Một bản giữ nguyên dấu gạch cũ rồi
     * chèn thêm sẽ cho `20//09//2026` ở lượt gõ thứ hai.
     */
    expect(matNaNgay('20/09/2026')).toBe('20/09/2026');
    expect(matNaNgay(matNaNgay('20092026'))).toBe('20/09/2026');
    expect(matNaNgay('20-09-2026')).toBe('20/09/2026');
    expect(matNaNgay('ab20cd09')).toBe('20/09');
  });

  it('không nhận quá tám chữ số', () => {
    // Dán nhầm cả một mốc thời gian vào ô thì ô lấy tám số đầu, không dài ra mãi.
    expect(matNaNgay('200920261234')).toBe('20/09/2026');
  });
});

describe('`0208` dịch hai chiều giữa dd/mm/yyyy và ISO', () => {
  it('đi và về cho lại đúng chuỗi cũ', () => {
    for (const [iso, vn] of HOP_LE) {
      expect(ngayTuIso(iso), iso).toBe(vn);
      expect(isoTuNgay(vn), vn).toBe(iso);
    }
  });

  it('chuỗi ISO có kèm phần GIỜ vẫn đọc được', () => {
    /*
     * `pg` dựng cột `date` của Postgres thành chuỗi ISO đầy đủ, và `ChietKhau`
     * đã phải tự cắt mười ký tự đầu từ `0043`. Cắt ở đây một lần thì nơi dùng
     * thôi phải nhớ — nhưng lượt cắt bên `ChietKhau` vẫn còn, vì giá trị ấy là
     * thứ GỬI LÊN máy chủ chứ không chỉ để bày ra.
     */
    expect(ngayTuIso('2026-09-20T00:00:00.000Z')).toBe('20/09/2026');
  });

  it('gõ dở, gõ thiếu số, hay ngày KHÔNG CÓ THẬT đều ra chuỗi rỗng', () => {
    /*
     * Rỗng chứ không `null`: nơi dùng đem thẳng giá trị này đặt vào state vốn
     * giữ chuỗi ISO, và ô trống cũng là `''` ở đó. *Chưa gõ* và *gõ sai* cùng
     * nghĩa **chưa có ngày nào để gửi đi**.
     *
     * `31/02` là ca đáng giá nhất: `new Date('2026-02-31')` KHÔNG ném lỗi, nó
     * trôi sang 03/03 (bẫy `0136`). Một phép kiểm chỉ dựng `Date` rồi hỏi
     * `isNaN` sẽ nhận cả ngày ấy.
     */
    for (const s of ['', '2', '20/09', '20/09/202', '20/9/2026', '31/02/2026', '29/02/2026', '00/01/2026', '20/13/2026', '32/01/2026', 'hai muoi']) {
      expect(isoTuNgay(s), s).toBe('');
    }
    for (const s of ['', 'hom nay', '2026-02-31', '2026-13-01', '20/09/2026']) {
      expect(ngayTuIso(s), s).toBe('');
    }
  });

  it('KHỚP phép kiểm của máy chủ — hai vế ở hai thế giới', () => {
    /*
     * Giao diện chặn một ngày thì máy chủ cũng phải chặn, và ngược lại. Lệch
     * chiều nào cũng hỏng theo một kiểu riêng: giao diện lỏng hơn thì người dùng
     * bấm Lưu mới biết, giao diện chặt hơn thì có ngày hợp lệ không ai nhập được.
     *
     * `ngayIso()` ném lỗi khi sai, `isoTuNgay` trả rỗng — nên phép so là giữa
     * *"có nhận không"*, không phải giữa hai giá trị trả về.
     */
    const mayChuNhan = (iso: string): boolean => {
      try {
        ngayIso().parse(iso, 'ngay');
        return true;
      } catch {
        return false;
      }
    };
    const thu = [
      ...HOP_LE.map(([iso]) => iso),
      '2026-02-31',
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-01-32',
      '2026-1-01',
      '',
    ];
    for (const iso of thu) {
      expect(ngayTuIso(iso) !== '', iso).toBe(mayChuNhan(iso));
    }
  });

  it('KHỚP `ngay()` của màn hình — cùng một ngày, cùng một lối viết', () => {
    /*
     * Hai hàm cùng cho `dd/mm/yyyy` nhưng trả lời hai câu khác nhau: `ngay()`
     * in một MỐC THỜI GIAN theo giờ Việt Nam (đi qua `Date` và một phép đổi múi
     * giờ), còn `ngayTuIso` cắt chuỗi của một NGÀY TRÊN LỊCH. Ranh giới ấy là
     * chủ ý — nhưng trên một ngày hợp lệ chúng phải cho cùng kết quả, nếu không
     * thì bảng và ô nhập nói hai điều về cùng một dòng.
     */
    for (const [iso, vn] of HOP_LE) {
      expect(ngay(iso), iso).toBe(vn);
      expect(ngayTuIso(iso), iso).toBe(vn);
    }
  });
});

describe('`0208` mốc thời gian trong TÊN TỆP bản mềm', () => {
  it('giờ VIỆT NAM, ngày đứng trước, và KHÔNG có dấu gạch chéo', () => {
    /*
     * Ba vế, ba lớp lỗi khác nhau:
     *
     *   1. **Múi giờ** — bản cũ là `toISOString()`, tức UTC, nên thẻ tệp hiện
     *      lệch bảy tiếng. 02:00 UTC là 09:00 sáng ở Việt Nam, và mốc dưới đây
     *      là mốc duy nhất phân biệt được hai bản.
     *   2. **Thứ tự** — `dd-mm-yyyy`, không phải `yyyy-mm-dd`.
     *   3. **Dấu ngăn** — `/` là ký tự ngăn THƯ MỤC. Chuỗi này đi thẳng vào tên
     *      tệp và vào `Content-Disposition`; đó đúng là lý do `chuanHoaMa` của
     *      `0198` chặn dấu ấy ở mã hồ sơ. Vế này không suy ra được từ hai vế
     *      trên, nên nó phải có phép kiểm riêng.
     */
    expect(dmyHm(new Date('2026-09-20T02:00:00.000Z'))).toBe('20-09-2026 09h00');
    expect(dmyHm(new Date('2026-09-19T18:00:00.000Z'))).toBe('20-09-2026 01h00');
    expect(dmyHm(new Date('2026-01-05T23:30:00.000Z'))).not.toContain('/');
  });
});

describe('`0208` không còn ô ngày nào của trình duyệt', () => {
  it('chỉ `ONhapNgay` được dùng `type="date"`, và nó dùng để mượn bộ chọn lịch', () => {
    /*
     * CHỐT CHẶN THẬT CỦA CẢ CHẶNG. Sáu ô đổi hôm nay thì đổi xong là xong; thứ
     * không có gì canh là ô ngày THỨ BẢY mà ai đó thêm vào tháng sau — `<input
     * type="date">` là cách viết tự nhiên nhất, `tsc` không nói gì, và trên máy
     * người viết (nếu trình duyệt để tiếng Việt) nó còn hiện đúng `dd/mm/yyyy`.
     *
     * Quét mã nguồn là cách duy nhất hỏi được câu này. Ngoại lệ đúng MỘT chỗ:
     * ô ẩn trong `Chung.tsx` mượn bộ chọn lịch của trình duyệt.
     */
    const NGOAI_LE = 'apps/web/src/components/Chung.tsx';
    expect(readFileSync(NGOAI_LE, 'utf8'), 'ô ẩn mượn bộ chọn lịch phải còn').toContain(
      'type="date"',
    );

    const tep = quetThuMuc('apps/web/src');
    // Đếm trước khi so: một phép quét hụt trả mảng rỗng, và `[]` khớp `[]` —
    // ca kiểm thành câu lệnh rỗng mà vẫn xanh (lớp bẫy `0186`).
    expect(tep.length, 'không quét được tệp nào').toBeGreaterThan(50);

    /*
     * BỎ CHÚ THÍCH TRƯỚC KHI QUÉT — bản đầu của ca này đỏ ở hai tệp KHÔNG có ô
     * ngày nào: `bat-buoc.ts` và chính `ngay-nhap.ts`, cả hai chỉ NHẮC TÊN
     * `<input type="date">` trong docstring để giải thích vì sao nó đã đi.
     *
     * Đây là mặt trái của bẫy `0124` (ca kiểm xanh nhờ chính dòng chú thích của
     * nó): ở đó chú thích làm phép quét nói CÓ khi thật ra không, ở đây nó làm
     * phép quét nói KHÔNG ĐƯỢC với một tệp hoàn toàn đúng luật. Một phép quét mã
     * nguồn phải đọc MÃ, không đọc văn xuôi quanh nó.
     */
    const conLai = tep.filter(
      (p) => p !== NGOAI_LE && boChuThich(readFileSync(p, 'utf8')).includes('type="date"'),
    );
    expect(conLai, `còn ô ngày của trình duyệt ở: ${conLai.join(', ')}`).toEqual([]);
  });

  it('KHÔNG chỗ nào lấy "hôm nay" bằng `toISOString().slice(0, 10)`', () => {
    /*
     * MỘT LỚP LỖI, KHÔNG PHẢI BA CHỖ. Lượt rà của `0208` tìm ra ba chỗ dựng một
     * NGÀY TRÊN LỊCH từ `toISOString()`, tức theo giờ UTC: ngày mặc định của hộp
     * thoại thêm quy định, chặn trên của bộ lọc Nhật ký, và mốc trong tên tệp
     * bản mềm. Cả ba sai đúng bảy tiếng mỗi ngày — từ 00:00 tới 07:00 giờ Việt
     * Nam chúng trả về HÔM QUA — và không cái nào làm gì đỏ, vì hôm qua cũng là
     * một ngày hợp lệ. Đây là bẫy `0128` đã đo, lần thứ tư nó xuất hiện.
     *
     * Sửa ba chỗ thì hết ba chỗ; thứ không có gì canh là chỗ thứ tư. Ranh giới
     * phép quét: nó chỉ cấm cách lấy một NGÀY (`slice(0, 10)`), không cấm
     * `toISOString()` dùng để gửi một MỐC THỜI GIAN lên máy chủ — chuỗi ISO đầy
     * đủ là đúng thứ dây truyền cần, và `ChuongThongBao` với `audit` đang dùng
     * nó đúng như thế.
     */
    const goc = ['apps/web/src', 'services', 'packages'].flatMap((d) => quetThuMuc(d));
    expect(goc.length, 'không quét được tệp nào').toBeGreaterThan(100);
    const xau = goc.filter((p) =>
      /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(boChuThich(readFileSync(p, 'utf8'))),
    );
    expect(xau, `lấy ngày theo giờ UTC ở: ${xau.join(', ')}`).toEqual([]);
  });
});

/**
 * Bỏ chú thích trước khi quét.
 *
 * Bản đầu của phép quét `type="date"` đỏ ở hai tệp KHÔNG có ô ngày nào — cả hai
 * chỉ NHẮC TÊN nó trong docstring để giải thích vì sao nó đã đi. Đây là mặt trái
 * của bẫy `0124` (ca kiểm xanh nhờ chính dòng chú thích của nó): ở đó chú thích
 * làm phép quét nói CÓ khi thật ra không, ở đây nó làm phép quét nói KHÔNG ĐƯỢC
 * với một tệp hoàn toàn đúng luật. Một phép quét mã nguồn phải đọc MÃ.
 */
const boChuThich = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Mọi tệp `.ts`/`.tsx` dưới một thư mục, đệ quy. */
function quetThuMuc(goc: string): string[] {
  const ra: string[] = [];
  const di = (d: string) => {
    for (const ten of readdirSync(d)) {
      const p = `${d}/${ten}`;
      if (statSync(p).isDirectory()) di(p);
      else if (/\.tsx?$/.test(ten)) ra.push(p);
    }
  };
  di(goc);
  return ra;
}
