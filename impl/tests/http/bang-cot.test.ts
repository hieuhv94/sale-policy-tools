/**
 * `0135` — BỀ RỘNG CỘT của bảng sản phẩm trên bản mềm.
 *
 * Tệp này KHÔNG dựng ứng dụng và KHÔNG chạm CSDL: nó gọi hai hàm thuần
 * (`bangSanPhamXml`, `makeDocx`) rồi đọc chính XML sinh ra.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CẦN, VÀ VÌ SAO PHẢI ĐO TRƯỚC KHI VIẾT
 * ---------------------------------------------------------------------------
 *
 * Khách hàng bảo *"tên sản phẩm cần rộng hơn"*, và `COT_BANG` đã có sẵn cột
 * `trongSo` từ `0055` — nên việc trông như chỉnh vài con số.
 *
 * Đo trên bản PDF THẬT (dựng docx → Gotenberg → LibreOffice → PDF, rồi đọc vị
 * trí các đường kẻ dọc trong content stream) cho ra một chuyện khác hẳn:
 *
 *     TRƯỚC:  mười một cột, MỖI CỘT ĐÚNG 43,8pt — bằng nhau tăm tắp
 *     SAU:    Tên sản phẩm 123,0pt (25,5%), STT 17,7pt (3,7%)
 *
 * Tức là toàn bộ `trongSo` **chưa bao giờ có tác dụng**. Nguyên nhân: `table()`
 * phát ra `<w:tblGrid>` chia ĐỀU, trong khi từng ô mang `w:tcW` theo tỷ lệ —
 * hai nguồn nói hai chuyện về cùng một câu hỏi, và ở chế độ `fixed` thì
 * LibreOffice nghe theo LƯỚI. Một chú thích trong `docx.ts` khẳng định `tblGrid`
 * "chỉ là gợi ý", và câu ấy đúng với `autofit`, sai với `fixed`.
 *
 * Ca kiểm không dựng được PDF (Gotenberg là dịch vụ ngoài, và bộ test không
 * được phụ thuộc vào nó). Thứ kiểm được — và là đúng thứ đã hỏng — là **hai dãy
 * số phải khớp nhau**.
 */
import { describe, expect, it } from 'vitest';
import {
  COT_BANG,
  COT_MAC_DINH,
  RONG_TOI_THIEU_PCT,
  bangSanPhamXml,
  makeDocx,
} from '@csbh/document/testing';

/** Một dòng hồ sơ đủ dữ liệu — chỉ cần đúng hình dạng để dựng bảng. */
const dong = (i: number, soKhoan = 2) => ({
  id: `l${i}`,
  product_code_snap: `NC-GOLD-${900 + i}`,
  product_name_snap: 'Nutricare Gold nước 180ml (thùng 48 lon)',
  company_price: '615000',
  wholesale_price: '540000',
  cpbh_total: '45000',
  cpbh: Array.from({ length: soKhoan }, () => '20000'),
  net_price: '495000',
  discount_rate: '1951',
  note: 'Áp dụng cho đơn từ 10 thùng',
});

const hoSo = (soKhoan = 2, soDong = 3) =>
  ({ lines: Array.from({ length: soDong }, (_, i) => dong(i, soKhoan)) }) as never;

/** Bề rộng lưới cột, đọc từ `<w:tblGrid>`. */
const luoi = (xml: string): number[] =>
  [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));

/** Bề rộng từng ô của HÀNG ĐẦU, đọc từ `w:tcW` (đơn vị: 1/50 phần trăm). */
const oHangDau = (xml: string): number[] => {
  const hang = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/)?.[0] ?? '';
  return [...hang.matchAll(/<w:tcW w:w="(\d+)" w:type="pct"\/>/g)].map((m) => Number(m[1]));
};

const tyLe = (xs: number[]): number[] => {
  const tong = xs.reduce((a, b) => a + b, 0);
  return xs.map((x) => (x / tong) * 100);
};

describe('`0135` lưới cột và ô nói CÙNG một điều', () => {
  it('`tblGrid` mang đúng tỷ lệ mà `w:tcW` khai — đây là chỗ đã hỏng', () => {
    /*
     * Ca đáng giá nhất của tệp này. Trước `0135` lưới chia đều còn ô chia theo
     * tỷ lệ, và **không màn hình nào, không ca kiểm nào đỏ** — bảng vẫn dựng ra,
     * vẫn mở được, chỉ là mọi cột bằng nhau và không ai đọc XML để biết.
     */
    const xml = bangSanPhamXml(hoSo());
    const g = tyLe(luoi(xml));
    const o = tyLe(oHangDau(xml));

    expect(g.length, 'lưới phải có đúng số cột của hàng đầu').toBe(o.length);
    expect(g.length).toBeGreaterThan(5);
    for (const [i, x] of g.entries()) {
      expect(x, `cột ${i}: lưới ${x.toFixed(2)}% ≠ ô ${o[i]!.toFixed(2)}%`).toBeCloseTo(o[i]!, 1);
    }
  });

  it('lưới KHÔNG được chia đều — chia đều là triệu chứng của lỗi cũ', () => {
    // Chiều đối chiếu, và nó bắt đúng hình dạng cũ: mười một cột bằng nhau.
    const g = luoi(bangSanPhamXml(hoSo()));
    expect(new Set(g).size, 'mọi cột cùng bề rộng — `trongSo` lại mất tác dụng').toBeGreaterThan(1);
  });
});

describe('`0135` tên sản phẩm là cột rộng nhất', () => {
  it('rộng hơn MỌI cột khác, và hơn hẳn chứ không hơn một chút', () => {
    /*
     * Yêu cầu của khách hàng phát biểu thành một BẤT ĐẲNG THỨC, không thành một
     * con số: ghim `22` thì mỗi lượt chỉnh cỡ về sau đều đỏ mà chẳng phát hiện
     * được gì, còn bất đẳng thức thì sống qua mọi lượt chỉnh.
     */
    const ten = COT_BANG.find((c) => c.khoa === 'ten_san_pham')!.trongSo;
    for (const c of COT_BANG) {
      if (c.khoa === 'ten_san_pham') continue;
      expect(ten, `tên sản phẩm phải rộng hơn ${c.khoa}`).toBeGreaterThan(c.trongSo);
    }
    // "Rộng hơn hẳn": ít nhất gấp rưỡi cột chữ còn lại (*Ghi chú*).
    const ghiChu = COT_BANG.find((c) => c.khoa === 'ghi_chu')!.trongSo;
    expect(ten).toBeGreaterThanOrEqual(ghiChu * 1.5);
  });

  it('STT là cột HẸP nhất — nội dung dài nhất là hai chữ số', () => {
    const stt = COT_BANG.find((c) => c.khoa === 'stt')!.trongSo;
    for (const c of COT_BANG) {
      if (c.khoa === 'stt') continue;
      expect(stt, `STT phải hẹp hơn ${c.khoa}`).toBeLessThanOrEqual(c.trongSo);
    }
  });

  it('cột STT vẫn CÓ MẶT, và đứng đầu tiên', () => {
    // Khách hàng nêu tên nó trong yêu cầu. Nó có sẵn từ `0055`, nhưng một lượt
    // dọn dẹp gỡ nó đi thì bảng vẫn dựng ra bình thường.
    expect(COT_BANG[0]!.khoa).toBe('stt');
    expect(COT_MAC_DINH[0]).toBe('stt');
    expect(bangSanPhamXml(hoSo())).toContain('STT');
  });
});

describe('`0135` không cột nào bị bóp tới mức vỡ chữ', () => {
  it('ở tổ hợp XẤU NHẤT, cột hẹp nhất vẫn trên ngưỡng', () => {
    /*
     * Bảng chạy ở chế độ `fixed`: chữ dài hơn cột thì XUỐNG DÒNG chứ không nong
     * cột ra. Một cột 2% của khổ A4 dọc rộng chừng 0,35cm, và `1.234.567` xuống
     * bảy dòng — mỗi dòng một chữ số.
     *
     * Mỗi cột CPBH thêm vào là một lần chia lại, nên càng nhiều khoản thì mọi
     * cột càng hẹp — quét tới BA khoản, quá mức ấy thì bảng chật vì SỐ CỘT chứ
     * không vì bộ trọng số. Muc 7.1 cho tới 50 khoản, và một hồ sơ như thế
     * không đọc được trên A4 dù chia kiểu gì; đó là giới hạn đã biết của bố cục
     * này, không phải thứ ca kiểm này canh.
     */
    for (const soKhoan of [0, 1, 2, 3]) {
      const o = tyLe(oHangDau(bangSanPhamXml(hoSo(soKhoan))));
      const hep = Math.min(...o);
      expect(
        hep,
        `${soKhoan} khoản CPBH: cột hẹp nhất còn ${hep.toFixed(2)}%`,
      ).toBeGreaterThanOrEqual(RONG_TOI_THIEU_PCT);
    }
  });

  it('hồ sơ CHƯA CÓ DÒNG NÀO vẫn ra bảng có lưới đúng tỷ lệ', () => {
    // Nhánh riêng trong `bangSanPhamXml`, và nó cũng gọi `table()` — quên truyền
    // trọng số ở đúng nhánh này là một lỗi chỉ hiện ra ở hồ sơ rỗng.
    const xml = bangSanPhamXml({ lines: [] } as never);
    expect(new Set(luoi(xml)).size).toBeGreaterThan(1);
    expect(tyLe(luoi(xml))[0]).toBeCloseTo(tyLe(oHangDau(xml))[0]!, 1);
  });
});

describe('`0135` phông chữ Times New Roman', () => {
  const goi = (buf: Buffer): Record<string, string> => {
    // `makeDocx` trả về một file zip; đọc lại bằng chính bộ giải nén của nó là
    // vòng tròn, nên dùng `fflate` trực tiếp như `documentXml` vẫn làm.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { unzipSync, strFromU8 } = require('fflate') as typeof import('fflate');
    const f = unzipSync(new Uint8Array(buf));
    return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, strFromU8(v)]));
  };

  it('gói `.docx` có `word/styles.xml`, và nó khai Times New Roman', () => {
    /*
     * Tới `0134` gói KHÔNG có phần styles nào. Thiếu nó thì phông do trình xem
     * tự chọn — LibreOffice lấy Liberation Serif, Word lấy Calibri — nên cùng
     * một file in ở hai máy ra hai bản khác nhau.
     */
    const f = goi(makeDocx('<w:p/>'));
    expect(Object.keys(f)).toContain('word/styles.xml');
    const st = f['word/styles.xml']!;
    expect(st).toContain('<w:docDefaults>');
    // BA thuộc tính, không phải một: tiếng Việt có dấu rơi vào `hAnsi`, nên khai
    // thiếu nó là để chữ không dấu một phông, chữ có dấu một phông khác.
    for (const a of ['w:ascii', 'w:hAnsi', 'w:cs']) {
      expect(st, `thiếu ${a}`).toContain(`${a}="Times New Roman"`);
    }
  });

  it('phần styles được KHAI ở cả hai chỗ, nếu không Word từ chối mở file', () => {
    /*
     * Một phần nằm trong zip mà không khai ở `[Content_Types].xml` và không có
     * quan hệ trong `document.xml.rels` thì Word báo "tài liệu bị hỏng" và
     * KHÔNG mở — còn LibreOffice thì mở bình thường và bỏ qua phông.
     *
     * Đúng loại lệch nguy hiểm nhất ở đây: bản in qua Gotenberg (LibreOffice)
     * trông đẹp, còn Quản trị tải file về mở bằng Word thì không mở được.
     */
    const f = goi(makeDocx('<w:p/>'));
    expect(f['[Content_Types].xml']).toContain('/word/styles.xml');
    expect(f['word/_rels/document.xml.rels']).toContain('styles.xml');
  });
});
