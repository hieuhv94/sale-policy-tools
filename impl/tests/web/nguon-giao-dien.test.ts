/**
 * FE-19 · FE-21 — hai bất biến kiểm bằng cách QUÉT MÃ NGUỒN.
 *
 * Không kiểm được bằng cách mở màn hình: cái sai là sự CÓ MẶT của một dòng mã,
 * ở một màn hình mà người kiểm có thể không nghĩ tới.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NHAN_TRANG_THAI, nhomTrangThai } from '@csbh/web/format';
import { THE_THEO_VAI_TRO, mauThe } from '@csbh/web/tong-quan';
import { MAU_TRANG_THAI_SAN_PHAM } from '@csbh/web/danh-muc';

const GOC = 'apps/web/src';

function moiTep(thuMuc: string, duoi: string[]): string[] {
  const ra: string[] = [];
  for (const t of readdirSync(thuMuc)) {
    const d = join(thuMuc, t);
    if (statSync(d).isDirectory()) ra.push(...moiTep(d, duoi));
    else if (duoi.some((x) => d.endsWith(x))) ra.push(d);
  }
  return ra;
}

describe('FE-19 mọi màu đến từ bảng token', () => {
  it('không có mã màu viết thẳng ngoài tokens.css', () => {
    const lac: string[] = [];
    for (const tep of moiTep(GOC, ['.ts', '.tsx', '.css'])) {
      if (tep.endsWith('tokens.css')) continue;
      const noiDung = readFileSync(tep, 'utf8');
      for (const [i, dong] of noiDung.split('\n').entries()) {
        // #abc, #aabbcc, #aabbccdd
        if (/#[0-9a-fA-F]{3,8}\b/.test(dong)) lac.push(`${tep}:${i + 1}  ${dong.trim()}`);
        if (/\b(rgb|hsl)a?\s*\(/.test(dong) && !dong.includes('rgb(27 37 48')) {
          lac.push(`${tep}:${i + 1}  ${dong.trim()}`);
        }
      }
    }
    expect(lac, `màu nằm ngoài bảng token:\n${lac.join('\n')}`).toEqual([]);
  });

  it('`0050` mọi biến CSS được dùng đều CÓ THẬT trong tokens.css', () => {
    /*
     * Lỗ hổng mà `FE-19` không bịt, và nó đã lọt suốt từ `0029`.
     *
     * `FE-19` cấm mã màu viết thẳng, nên `background: var(--mau-chinh)` đi qua
     * sạch sẽ — trông y hệt một biến hợp lệ. Nhưng `--mau-chinh` chưa bao giờ
     * được khai. Trình duyệt bỏ qua cả khai báo hỏng, nhãn *Giá* không có nền,
     * mà chữ thì `color: var(--mau-nen)` — trắng trên nền trắng.
     *
     * Không màn hình nào đỏ, không test nào đỏ; nhãn chỉ đơn giản là vô hình.
     * Quét ngược từ chỗ DÙNG về chỗ KHAI là cách duy nhất bắt được.
     */
    const tokens = readFileSync(join(GOC, 'styles/tokens.css'), 'utf8');
    const KHAI = /(--[a-z0-9-]+)\s*:/g;
    const daKhai = new Set([...tokens.matchAll(KHAI)].map((m) => m[1]!));

    const thieu: string[] = [];
    for (const tep of moiTep(GOC, ['.css', '.tsx'])) {
      if (tep.endsWith('tokens.css')) continue;
      const noiDung = readFileSync(tep, 'utf8');
      /*
       * Biến khai NGAY TRONG tệp đang xét cũng tính (`0073`).
       *
       * Không phải mọi biến CSS đều là một token thiết kế. `.hop-thoai-xem` tính
       * `--cao-khung` và `--ty-le` để dựng một khung xem khớp tỷ lệ nội dung —
       * hai đại lượng cục bộ, thay đổi theo từng lần mở hộp, và đưa chúng vào
       * bảng token là nói dối về vai trò của chúng.
       *
       * Bất biến ca này giữ vẫn còn nguyên: KHÔNG `var()` nào trỏ tới một cái
       * tên chẳng ai khai ở đâu cả — đúng lỗi `--mau-chinh` đã lọt suốt từ
       * `0029`. Chỗ khai chỉ nới từ "bảng token" ra "bảng token, hoặc chính tệp
       * này". Vế cấm mã màu viết thẳng nằm ở ca trên, không đụng tới.
       */
      const cuaTep = new Set([...noiDung.matchAll(KHAI)].map((m) => m[1]!));
      for (const [i, dong] of noiDung.split('\n').entries()) {
        for (const m of dong.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
          // `var(--x, giá-trị-lùi)` thì thiếu cũng không sao — đã có đường lùi.
          const coDuongLui = dong.slice(m.index ?? 0).includes(',');
          const co = daKhai.has(m[1]!) || cuaTep.has(m[1]!);
          if (!co && !coDuongLui) thieu.push(`${tep}:${i + 1} ${m[1]}`);
        }
      }
    }
    expect(thieu, thieu.join('\n')).toEqual([]);
  });

  it('`0057` trong bảng, ô số căn TRÁI như tiêu đề cột', () => {
    /*
     * `.so` căn phải, `th`/`td` căn trái. Không ghi đè thì tiêu đề cột nằm sát
     * mép trái còn con số dưới nó nằm sát mép phải — cột càng rộng, khoảng hở
     * càng lớn, và mắt phải bắc cầu qua chỗ trống ấy để biết con số thuộc tiêu
     * đề nào.
     *
     * Quét CSS chứ không dựng trình duyệt: jsdom không tính kiểu xếp tầng, nên
     * `getComputedStyle` ở đây trả về đúng thứ ta vừa viết chứ không kiểm gì.
     */
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const luat = css.match(/th\.so\s*,\s*td\.so\s*\{[^}]*\}/);
    expect(luat, 'thiếu luật căn lề cho ô số trong bảng').not.toBeNull();
    expect(luat![0]).toContain('text-align: left');

    // Và luật ấy phải đứng SAU `.so` để thắng theo thứ tự — cùng độ đặc hiệu thì
    // dòng sau thắng, mà `td.so` (0,1,1) vốn đã đặc hiệu hơn `.so` (0,1,0).
    expect(css.indexOf('td.so')).toBeGreaterThan(css.indexOf('.so {'));
  });

  it('`0056` không selector nào bị chú thích cắt làm hai', () => {
    /*
     * Lỗi đã xảy ra thật ở `0054`, và không phép kiểm nào bắt được.
     *
     * Dọn CSS chết để lại một `.canh-bao-lech` lơ lửng ngay trên một chú thích:
     *
     *     .canh-bao-lech
     *     (chú thích)
     *     .bang-lech { … }
     *
     * Chú thích không cắt được selector, nên hai dòng dính thành
     * `.canh-bao-lech .bang-lech` — cả bộ kiểu chỉ áp trong khối cảnh báo, còn
     * bảng trong box *Yêu cầu cập nhật* thì trần trụi. CSS vẫn hợp lệ, không lỗi
     * nào nổi lên; chỉ một bảng trông khác bảng kia.
     *
     * CẮT HẾT CHÚ THÍCH TRƯỚC rồi mới quét. Bản đầu tôi soi từng dòng thô và nó
     * báo mười hai chỗ sai — toàn là DÒNG KẾT THÚC của chú thích nhiều dòng: nó
     * không chứa dấu ngoặc nhọn nào nên trông y hệt một selector đứng một mình.
     *
     * (Và viết câu trên bằng ký hiệu thật thì chính chú thích này tự đóng sớm —
     * đã dính một lượt.)
     */
    const khongChuThich = readFileSync(join(GOC, 'styles/app.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const dong = khongChuThich.split('\n');
    const lac: string[] = [];

    for (const [i, tho] of dong.entries()) {
      const d = tho.trim();
      if (d === '' || /[{};]/.test(d) || d.endsWith(',')) continue;

      // Dòng CÓ NGHĨA kế tiếp — chú thích đã bị cắt nên chỉ còn dòng trống.
      let j = i + 1;
      while (j < dong.length && dong[j]!.trim() === '') j += 1;

      // Một selector đứng một mình mà dòng sau mở khối mới → nó bị bỏ rơi.
      if ((dong[j]?.trim() ?? '').includes('{')) {
        lac.push(`app.css: dòng ${i + 1} "${d}" — selector lơ lửng`);
      }
    }
    expect(lac, lac.join('\n')).toEqual([]);
  });

  it('tokens.css khai đủ nhóm màu có nghĩa nghiệp vụ', () => {
    const css = readFileSync(join(GOC, 'styles/tokens.css'), 'utf8');
    for (const bien of [
      '--mau-thuong-hieu',
      '--mau-loi',
      '--mau-tot',
      '--mau-canh-bao',
      '--mau-cho',
      '--vung-cham',
    ]) {
      expect(css, `thiếu token ${bien}`).toContain(bien);
    }
  });
});

/**
 * `0064` — mỗi trạng thái một màu, và không dải thẻ nào có hai ô trùng màu.
 *
 * Đây là bất biến khách hàng yêu cầu, và nó là loại bất biến KHÔNG tự giữ được:
 * thêm một trạng thái hay một thẻ mới thì không có gì báo lỗi, chỉ có hai ô im
 * lặng cùng màu. Nên nó phải có người canh.
 *
 * Hai cặp được phép trùng, cả hai do khách hàng chốt ngày 19/08 — chúng khai
 * tường minh dưới đây chứ không ẩn trong một phép trừ, để lần sau ai muốn thêm
 * cặp thứ ba thì phải sửa đúng dòng này và đọc được vì sao hai cặp kia có mặt.
 */
describe('`0064` màu trạng thái và màu thẻ', () => {
  const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
  const token = readFileSync(join(GOC, 'styles/tokens.css'), 'utf8');

  /** Cặp trạng thái được phép dùng chung một màu, kèm lý do. */
  const CHUNG_MAU: Record<string, string> = {
    // `0155` bỏ `TU_CHOI`, nên cặp `TU_CHOI+QUA_HAN_DUYET` không còn — `hong`
    // giờ chỉ có đúng một trạng thái. Còn lại một cặp duy nhất.
    'HET_HIEU_LUC+DA_XOA': 'đều đã rời khỏi luồng, không đòi ai làm gì',
  };

  it('mỗi trạng thái có một khoá màu, và chỉ một cặp được trùng', () => {
    const theoMau = new Map<string, string[]>();
    for (const t of Object.keys(NHAN_TRANG_THAI)) {
      const m = nhomTrangThai(t);
      theoMau.set(m, [...(theoMau.get(m) ?? []), t]);
    }
    const trung = [...theoMau.values()]
      .filter((ds) => ds.length > 1)
      .map((ds) => [...ds].sort().join('+'))
      .sort();
    expect(trung, 'có cặp trạng thái trùng màu ngoài danh sách đã chốt').toEqual(
      Object.keys(CHUNG_MAU).map((k) => k.split('+').sort().join('+')).sort(),
    );
  });

  it('trong một dải thẻ, chỉ ĐÚNG hai cặp đã chốt được trùng màu', () => {
    /*
     * Yêu cầu ban đầu là "không hai thẻ nào trùng màu". Hai chỉ đạo ngày 19/08
     * — gộp *Từ chối* với *Quá hạn duyệt*, gộp *Hết hiệu lực* với *Đã xoá* —
     * lật lại chính nó, vì cả hai cặp ấy ĐỨNG CHUNG một dải thẻ:
     *
     *   - *Từ chối* + *Quá hạn* cùng có mặt ở Trình dược viên, Trưởng bộ phận
     *     và Ban lãnh đạo.
     *   - *Hết hiệu lực* + *Đã xoá* cùng có mặt ở Ban lãnh đạo.
     *
     * Nên bất biến còn giữ được là bản hẹp hơn: ngoài hai cặp ấy ra, không ô
     * nào được trùng ô nào. Khai tên thẻ tường minh chứ không đếm số cặp — đếm
     * thì một cặp trùng MỚI vẫn lọt qua miễn tổng số không đổi.
     */
    const CAP_CHO_PHEP = [['HET_HIEU_LUC', 'DA_XOA']].map((c) => c.sort().join('+'));

    for (const [vaiTro, ds] of Object.entries(THE_THEO_VAI_TRO)) {
      const theoMau = new Map<string, string[]>();
      for (const t of ds) {
        const m = mauThe(t);
        theoMau.set(m, [...(theoMau.get(m) ?? []), t.ma]);
      }
      for (const [m, ma] of theoMau) {
        if (ma.length === 1) continue;
        expect(
          [...ma].sort().join('+'),
          `${vaiTro}: ${ma.join(' và ')} cùng màu "${m}" mà không nằm trong danh sách đã chốt`,
        ).toSatisfy((c: string) => CAP_CHO_PHEP.includes(c));
      }
    }
  });

  it('mọi khoá màu đều có lớp CSS thật, ở CẢ nhãn lẫn thẻ', () => {
    // Khoá không có lớp thì nhãn mất màu và thẻ mất vạch — không lỗi, chỉ nhạt.
    const khoa = new Set<string>([
      ...Object.keys(NHAN_TRANG_THAI).map(nhomTrangThai),
      ...Object.values(THE_THEO_VAI_TRO).flat().map(mauThe),
    ]);
    for (const k of khoa) {
      expect(css.includes(`.nhan-${k} `), `thiếu lớp .nhan-${k}`).toBe(true);
      // `thuong` là thẻ *Đang chờ* — cố ý không có vạch màu.
      if (k !== 'thuong') {
        expect(css.includes(`.chi-so-${k}::before`), `thiếu lớp .chi-so-${k}`).toBe(true);
      }
    }
  });

  it('mọi màu trạng thái khai đủ ở CẢ BA khối của tokens.css', () => {
    /*
     * Ba khối: `:root` (sáng), media query (theo máy), `[data-theme='toi']`
     * (chọn tay). Thiếu ở khối thứ ba thì người bật giao diện tối bằng tay nhận
     * màu của bảng SÁNG trên nền tối — chữ gần như không đọc được, và nó chỉ lộ
     * ra với đúng những người đã chọn tay.
     */
    const ten = [...token.matchAll(/--mau-tt-[a-z0-9-]+/g)].map((m) => m[0]);
    for (const t of new Set(ten)) {
      expect(ten.filter((x) => x === t).length, `${t} không khai đủ ba khối`).toBe(3);
    }
  });
});

describe('`0125` lịch sử giá nói rõ dòng nào đang áp dụng', () => {
  const nguon = readFileSync(join(GOC, 'components/danh-muc/SanPham.tsx'), 'utf8');

  it('có nhãn *Đang áp dụng*, và nó dùng lớp màu xanh có thật', () => {
    /*
     * Khách hàng báo: mở *Sửa* một sản phẩm vừa tạo thì *Lịch sử giá* hiện đúng
     * con số đang ở ô giá ngay trên, kèm ngày hôm nay — đọc như thể mở hộp thoại
     * ra là hệ thống tự ghi một lần đổi giá.
     *
     * Dòng ấy có thật và đúng (`0123` ghi nó lúc TẠO). Thứ thiếu là câu trả lời
     * cho *"dòng nào đang có hiệu lực"*.
     */
    expect(nguon).toContain('Đang áp dụng');
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    expect(css).toContain('.nhan-hieu-luc');
  });

  it('phân biệt cả dòng CHƯA hiệu lực — ngày ở tương lai', () => {
    // Chỉ đặt được qua API (màn hình bỏ ô chọn ngày ở `0123`), nhưng không nói
    // ra thì nó đọc y hệt dòng đang áp dụng.
    expect(nguon).toContain('Chưa hiệu lực');
  });

  it('`0126` khung lịch sử tự cuộn dọc, không đẩy nút Lưu khỏi tầm nhìn', () => {
    /*
     * Lịch sử chỉ dài ra chứ không bao giờ ngắn lại — mỗi ngày có đổi giá là một
     * dòng, và từ `0126` mỗi LẦN sửa trong ngày cũng là một dòng. Nó nằm ở cuối
     * hộp thoại Sửa, nên dài quá thì ô gõ xác nhận và nút Lưu bị đẩy khỏi tầm
     * nhìn và người dùng phải cuộn ngược lên để bấm.
     *
     * `.khung-cuon` chỉ có `overflow-x` — cuộn NGANG. Phải là một lớp riêng.
     */
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    expect(css).toMatch(/\.khung-lich-su-gia\s*\{[^}]*max-height/);
    expect(css).toMatch(/\.khung-lich-su-gia\s*\{[^}]*overflow-y:\s*auto/);
    expect(nguon).toMatch(/className="[^"]*\bkhung-lich-su-gia\b[^"]*"/);
  });

  it('`0126` KHÔNG tự sắp lại lịch sử ở giao diện — thứ tự do máy chủ quyết', () => {
    /*
     * Từ `0126` nhiều dòng dùng chung một ngày hiệu lực, và thứ phân xử giữa
     * chúng là cột `stt` — một con số giao diện không nhận được. Sắp lại theo
     * `effectiveFrom` thì hai dòng cùng ngày bằng nhau, và nhãn *Đang áp dụng*
     * rơi vào dòng nào cũng được.
     */
    expect(nguon, 'giao diện không được `sort` lại lịch sử giá').not.toMatch(
      /ls[^\n]*\.sort\(/,
    );
  });

  it('MỘT dòng thì nói thẳng là chưa đổi giá lần nào', () => {
    expect(nguon).toContain('chưa đổi giá lần nào');
  });

  /*
   * `0131` — HAI KHOẢNG HỞ, cả hai đều là chuyện bố cục thuần.
   *
   * Quét nguồn chứ không dựng màn hình, và lần này là bắt buộc chứ không phải
   * tiện tay: jsdom KHÔNG tính bố cục, nên `getComputedStyle` ở đó trả về đúng
   * thứ vừa viết vào chứ không đo được một pixel nào. Thứ kiểm được là lớp có
   * đúng chỗ và luật có đúng nội dung — hai vế, và thiếu vế nào cũng vô nghĩa:
   * một lớp không có luật thì không đẩy được gì, một luật không ai gắn thì là
   * mã chết.
   */
  it('`0131` tiêu đề *Lịch sử giá* có khoảng hở trên và dưới', () => {
    /*
     * `h3 { margin: 0 }` khai ở đầu `app.css`, và đó là chủ ý — mỗi chỗ dùng tự
     * khai khoảng hở nó cần. Chỗ này chưa khai bao giờ, nên chữ *Lịch sử giá*
     * dính sát mép khung bảng và đọc như một dòng của bảng chứ không phải tên
     * của nó.
     */
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    expect(nguon, 'tiêu đề chưa mang lớp khoảng hở').toMatch(
      /<h3 className="[^"]*\btieu-de-lich-su-gia\b[^"]*">Lịch sử giá<\/h3>/,
    );

    const luat = css.match(/\.tieu-de-lich-su-gia\s*\{([^}]*)\}/);
    expect(luat, 'thiếu luật cho `.tieu-de-lich-su-gia`').not.toBeNull();
    const le = luat![1]!.match(/margin:\s*var\(--k(\d)\)\s+0\s+var\(--k(\d)\)/);
    expect(le, 'lớp có mặt nhưng không đặt lề trên/dưới').not.toBeNull();
    // Hở TRÊN dày hơn hở DƯỚI: khoảng hở nói cho mắt biết tiêu đề thuộc khối
    // nào. Bằng nhau thì nó lửng lơ giữa ô giá phía trên và bảng phía dưới.
    expect(Number(le![1]), 'hở trên phải dày hơn hở dưới').toBeGreaterThan(Number(le![2]));
  });

  it('`0131` nhãn *Đang áp dụng* KHÔNG dính vào ngày áp dụng', () => {
    /*
     * `.nhan` không có lề, và ở đây nó theo sau một nút VĂN BẢN chứ không phải
     * một thẻ — nên không luật anh-em nào với tới. JSX cũng không cứu: xuống
     * dòng giữa hai biểu thức thì khoảng trắng bị nuốt.
     *
     * Và vế thứ hai, cái bẫy: `display: flex` đặt thẳng lên `<td>` thì ô ấy
     * thôi là ô bảng — trình duyệt bọc nó trong một ô ẩn và bề rộng của nó thôi
     * tham gia phép chia cột, nên cột *Áp dụng từ* lệch khỏi tiêu đề của chính
     * nó. Lớp phải nằm trên một thẻ BỌC BÊN TRONG ô.
     */
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    const luat = css.match(/\.o-ngay-hieu-luc\s*\{([^}]*)\}/);
    expect(luat, 'thiếu luật cho `.o-ngay-hieu-luc`').not.toBeNull();
    expect(luat![1]).toMatch(/display:\s*flex/);
    expect(luat![1], 'thiếu `gap` — hai thứ vẫn dính nhau').toMatch(/gap:\s*var\(--k\d\)/);

    expect(nguon).toMatch(/<span className="[^"]*\bo-ngay-hieu-luc\b[^"]*">/);
    expect(nguon, 'lớp flex không được nằm thẳng trên `<td>`').not.toMatch(
      /<td className="[^"]*\bo-ngay-hieu-luc\b/,
    );
  });
});

describe('`0132` · `0133` thao tác trong bảng hiện khi rê chuột', () => {
  const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');

  /**
   * BẢY bảng có cột thao tác ở bên phải — `0133` đưa nốt bốn bảng còn lại vào.
   *
   * `0132` chỉ đổi ba bảng danh mục, và bốn bảng kia lọt vì ca kiểm liệt kê đúng
   * ba tên tệp. Danh sách viết tay là con dao hai lưỡi: nó nói rõ phạm vi, nhưng
   * một bảng mới thêm về sau sẽ không có ai nhắc. Ca *"không còn tiêu đề nhìn
   * thấy được ở BẤT KỲ đâu"* bên dưới là vế quét toàn bộ, bù cho chỗ đó.
   */
  const BANG_CO_THAO_TAC = [
    'components/danh-muc/SanPham.tsx',
    'components/danh-muc/Nhom.tsx',
    'components/danh-muc/ChietKhau.tsx',
    'pages/MauHopDong.tsx',
    'pages/NguoiDung.tsx',
    'components/quan-tri/HeThong.tsx',
    'components/BangSanPham.tsx',
  ];
  const BANG_DANH_MUC = BANG_CO_THAO_TAC;

  it('MỌI ô thao tác của cả bảy bảng đều gắn lớp, không phải một ô mỗi tệp', () => {
    /*
     * Lớp phải nằm trên chính `<td>`, không phải trên nút bên trong: ô giữ chỗ
     * của cột. Đặt lên nút thì ô rỗng vẫn có đệm, và cột co lại đúng một chút —
     * đủ để bảng nhảy ngang mỗi lần rê chuột qua một dòng.
     *
     * ĐẾM TỪNG Ô chứ không hỏi "tệp này có ô nào mang lớp không", và đó là chỗ
     * bản `0133` đầu tiên viết sai: bảng Người dùng có BA ô thao tác (`0070` cố
     * ý tách ba cột), gỡ lớp khỏi một ô thì hai ô kia vẫn ẩn còn ô ấy hiện suốt
     * — một lỗ thủng nhìn thấy được ngay giữa cột — mà ca kiểm cũ vẫn xanh vì
     * hai ô còn lại đã trả lời "có".
     */
    const lac: string[] = [];
    for (const tep of BANG_CO_THAO_TAC) {
      const s = readFileSync(join(GOC, tep), 'utf8');
      // Mọi `<td …> … </td>` có chứa một nút. Trong bảy tệp này, ô nào có nút
      // thì ô ấy là ô thao tác — không có ngoại lệ nào.
      for (const m of s.matchAll(/<td\b([^>]*)>((?:(?!<\/td>)[\s\S])*?)<\/td>/g)) {
        if (!m[2]!.includes('<button')) continue;
        if (/\bo-thao-tac-re-chuot\b/.test(m[1]!)) continue;
        lac.push(`${tep}:${s.slice(0, m.index ?? 0).split('\n').length}`);
      }
    }
    expect(lac, `ô thao tác chưa gắn lớp rê chuột:\n${lac.join('\n')}`).toEqual([]);
  });

  it('tiêu đề cột KHÔNG còn hiện ra mắt, nhưng vẫn còn cho trình đọc màn hình', () => {
    /*
     * Hai vế, và vế thứ hai mới là vế dễ mất. Một `<th>` rỗng thì trình đọc màn
     * hình đọc ô nút là "cột trống", và người dùng bàn phím Tab vào một nút mà
     * không biết nút ấy thuộc cột nào của bảng nào.
     *
     * `.chi-doc-man-hinh` là lớp đã có sẵn cho đúng việc này (`NutGiaoDien`,
     * `ChuongThongBao`, `BangSanPham`), không phải một lớp dựng riêng ở đây.
     */
    for (const tep of BANG_DANH_MUC) {
      const s = readFileSync(join(GOC, tep), 'utf8');
      // `<th[^>]*>` chứ không `<th>`: bảng Người dùng khai `colSpan={3}` — ba ô
      // cho ba nút (`0070`) — và một regex chặt hơn sẽ bỏ sót đúng bảng ấy.
      expect(s, `${tep} còn tiêu đề *Thao tác* nhìn thấy được`).not.toMatch(
        /<th[^>]*>\s*Thao tác\s*<\/th>/,
      );
      expect(s, `${tep} mất hẳn tên cột, kể cả với trình đọc màn hình`).toMatch(
        /<span className="chi-doc-man-hinh">Thao tác<\/span>/,
      );
    }
  });

  it('KHÔNG còn tiêu đề *Thao tác* nhìn thấy được ở bất kỳ màn hình nào', () => {
    /*
     * Vế QUÉT TOÀN BỘ, bù cho danh sách bảy tên tệp viết tay ở trên.
     *
     * `0132` đổi ba bảng và ca kiểm liệt kê đúng ba tên, nên bốn bảng còn lại
     * lọt qua — không phải vì ai làm sai, mà vì ca kiểm chỉ nhìn vào chỗ nó được
     * bảo nhìn. Ca này nhìn khắp nơi, và nó cũng canh cho bảng thêm mới về sau.
     */
    const lac: string[] = [];
    for (const tep of moiTep(GOC, ['.tsx'])) {
      const s = readFileSync(tep, 'utf8');
      for (const [i, dong] of s.split('\n').entries()) {
        if (/<th[^>]*>\s*Thao tác\s*<\/th>/.test(dong)) lac.push(`${tep}:${i + 1}`);
      }
    }
    expect(lac, `tiêu đề *Thao tác* còn nhìn thấy ở:\n${lac.join('\n')}`).toEqual([]);
  });

  it('BA điều kiện hiện nút, không phải một', () => {
    /*
     * `:hover` một mình là hỏng cho hai nhóm người dùng cùng lúc, và cả hai đều
     * không lộ ra khi thử bằng chuột trên máy để bàn:
     *
     *   - bàn phím — Tab tới nút mà nút vẫn trong suốt;
     *   - cảm ứng  — không có "rê" nào cả, nút không bao giờ hiện.
     *
     * Cùng ba điều kiện với thẻ tệp của `0069`.
     */
    const luat = css.match(/\.o-thao-tac-re-chuot\s*\{([^}]*)\}/);
    expect(luat, 'thiếu luật cho `.o-thao-tac-re-chuot`').not.toBeNull();
    expect(luat![1]).toMatch(/opacity:\s*0/);

    expect(css, 'thiếu vế rê chuột').toMatch(/tr:hover\s*>\s*\.o-thao-tac-re-chuot/);
    expect(css, 'thiếu vế bàn phím — nút không với tới được bằng Tab').toMatch(
      /tr:focus-within\s*>\s*\.o-thao-tac-re-chuot/,
    );
    expect(css, 'thiếu vế cảm ứng — nút không bao giờ hiện trên điện thoại').toMatch(
      /@media \(hover: none\)\s*\{\s*\.o-thao-tac-re-chuot\s*\{[^}]*opacity:\s*1/,
    );
  });

  it('ẩn bằng `opacity`, KHÔNG bằng `display` hay `visibility`', () => {
    /*
     * Cái bẫy, và nó tự khoá mất đường thoát của chính nó: một phần tử
     * `visibility: hidden` KHÔNG nhận được tiêu điểm, nên `:focus-within` không
     * bao giờ kích hoạt được — vế bàn phím ở ca trên thành mã chết mà vẫn còn
     * nguyên trong tệp CSS.
     *
     * `display: none` thì hỏng theo kiểu nhìn thấy được: cột co lại rồi bung ra
     * khi rê chuột, tức cả bảng nhảy ngang dưới con trỏ.
     */
    const luat = css.match(/\.o-thao-tac-re-chuot\s*\{([^}]*)\}/);
    expect(luat![1]).not.toMatch(/display:\s*none/);
    expect(luat![1]).not.toMatch(/visibility:\s*hidden/);
  });
});

describe('`0124` hai nút thao tác của một dòng bảng không xuống dòng', () => {
  const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');

  it('luật CSS có mặt và nhắm ĐÚNG lớp riêng, không nới `.nhom-nut-gon`', () => {
    /*
     * `.nhom-nut-gon` cũng dùng ở danh sách thẻ trên điện thoại, nơi xuống dòng
     * là hành vi đúng. Nới nó ra là sửa một chỗ và làm hỏng chỗ kia.
     */
    expect(css).toMatch(/\.nhom-nut-hang\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(css).toMatch(/\.nhom-nut-gon\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('vẫn còn chỗ dùng lớp ấy — nếu không nó là mã chết', () => {
    /*
     * Tìm trong THUỘC TÍNH `className`, không tìm chuỗi trần: bản đầu của ca này
     * dùng `toContain('nhom-nut-hang')` và nó vẫn xanh sau khi gỡ lớp khỏi JSX,
     * vì chính dòng chú thích ngay trên đó nhắc tên lớp.
     */
    const nguon = readFileSync(join(GOC, 'components/BangSanPham.tsx'), 'utf8');
    expect(nguon).toMatch(/className="[^"]*\bnhom-nut-hang\b[^"]*"/);
  });
});

describe('`0123` nhãn trạng thái sản phẩm có màu', () => {
  const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');

  it('hai trạng thái, hai khoá màu khác nhau, và cả hai có lớp CSS thật', () => {
    const khoa = Object.values(MAU_TRANG_THAI_SAN_PHAM);
    expect(new Set(khoa).size, 'hai trạng thái không được trùng màu').toBe(khoa.length);
    for (const k of khoa) {
      expect(css, `thiếu lớp .nhan-${k}`).toContain(`.nhan-${k}`);
    }
  });

  it('DÙNG LẠI khoá màu của nhãn trạng thái hồ sơ, không dựng cặp token thứ ba', () => {
    /*
     * Xanh và đỏ ở đây nói đúng thứ chúng nói ở nhãn hồ sơ — đang dùng được, và
     * đã dừng. Một bảng màu riêng cho danh mục là hai chỗ phải giữ đồng bộ mãi
     * mãi để trông giống hệt nhau.
     */
    expect(MAU_TRANG_THAI_SAN_PHAM.DANG_AP_DUNG).toBe(nhomTrangThai('DANG_CO_HIEU_LUC'));
    expect(MAU_TRANG_THAI_SAN_PHAM.DA_VO_HIEU_HOA).toBe(nhomTrangThai('QUA_HAN_DUYET'));
  });

  it('CẢ HAI bảng sản phẩm đều vẽ nhãn màu và cột giá', () => {
    /*
     * Hai bảng: thẻ của Quản trị, và bảng chỉ-xem của năm vai trò còn lại. Sửa
     * một bên rồi quên bên kia là vá cho một người và để nguyên cho tất cả những
     * người khác — đúng lỗi mà `0049` đã mắc một lần ở chính hai tệp này.
     */
    for (const tep of ['components/danh-muc/SanPham.tsx', 'pages/DanhMuc.tsx']) {
      const nguon = readFileSync(join(GOC, tep), 'utf8');
      expect(nguon, `${tep} phải dùng NhanSanPham`).toContain('<NhanSanPham');
      expect(nguon, `${tep} phải có cột giá`).toContain('Giá bán Công ty</th>');
    }
  });
});

describe('FE-21 không có chức năng in phía máy người dùng', () => {
  it('không lời gọi window.print, không @media print, không nút In', () => {
    const viPham: string[] = [];
    for (const tep of moiTep(GOC, ['.ts', '.tsx', '.css'])) {
      const noiDung = readFileSync(tep, 'utf8');
      for (const [i, dong] of noiDung.split('\n').entries()) {
        const s = dong.trim();
        if (s.startsWith('*') || s.startsWith('//')) continue;
        // Bản in A4 sinh Ở MÁY CHỦ và tải về dạng PDF (muc 11.1). In từ trình
        // duyệt cho ra file khác nhau trên từng máy — chính thứ FE-20 cấm.
        if (/window\s*\.\s*print\s*\(/.test(dong)) viPham.push(`${tep}:${i + 1} window.print`);
        if (/@media\s+print/.test(dong)) viPham.push(`${tep}:${i + 1} @media print`);
      }
    }
    expect(viPham, viPham.join('\n')).toEqual([]);
  });
});

describe('FE-08 vùng chạm tối thiểu', () => {
  it('mọi lớp nút và ô nhập đều đặt chiều cao tối thiểu bằng token', () => {
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    for (const lop of ['.nut {', '.o-nhap {', '.nut-menu {', '.cpbh-nut {']) {
      const i = css.indexOf(lop);
      expect(i, `không tìm thấy lớp ${lop}`).toBeGreaterThan(-1);
      const khoi = css.slice(i, css.indexOf('}', i));
      expect(khoi, `${lop} thiếu min-height: var(--vung-cham)`).toContain('var(--vung-cham)');
    }
  });
});

describe('FE-11 không đặt cỡ chữ tuyệt đối', () => {
  it('không dùng px cho font-size — cỡ chữ hệ thống 200% phải phóng được', () => {
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    const tokens = readFileSync(join(GOC, 'styles/tokens.css'), 'utf8');
    for (const [ten, noiDung] of [['app.css', css], ['tokens.css', tokens]] as const) {
      const xau = noiDung
        .split('\n')
        .filter((d) => /font-size\s*:\s*\d+px/.test(d))
        .map((d) => `${ten}: ${d.trim()}`);
      expect(xau, xau.join('\n')).toEqual([]);
    }
  });
});

describe('`0116` hai nút rộng xếp chồng thì không được chạm nhau', () => {
  const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');

  /**
   * Mọi cặp `<button class="… nut-rong …">` đứng KỀ NHAU trong cùng một khối.
   *
   * Quét theo thẻ thật chứ không theo tên tệp: chỗ hỏng là một CẶP, và cặp ấy có
   * thể xuất hiện ở bất kỳ màn hình nào ai đó viết sau này.
   */
  const capNutRong = (): string[] => {
    const ra: string[] = [];
    for (const tep of moiTep(GOC, ['.tsx'])) {
      const s = readFileSync(tep, 'utf8');
      // `[^]*?` không tham lam, và chặn lại nếu gặp một thẻ mở khác — hai nút
      // cách nhau bởi một thẻ khác thì không còn là anh em kề nhau.
      const re = /<button(?:(?!<)[^])*?nut-rong(?:(?!<button)[^])*?<\/button>\s*<button(?:(?!<)[^])*?nut-rong/g;
      for (const m of s.matchAll(re)) {
        ra.push(`${tep}:${s.slice(0, m.index ?? 0).split('\n').length}`);
      }
    }
    return ra;
  };

  it('luật khoảng cách có mặt, và nhắm ĐÚNG nút rộng', () => {
    /*
     * `.nut + .nut-rong`, không phải `.nut + .nut`: nút rộng chiếm cả hàng nên
     * nó luôn xếp CHỒNG, và một `margin-top` ở đó luôn đúng. Đặt lên mọi `.nut`
     * thì mọi hàng nút NẰM NGANG trong ứng dụng bị đẩy lệch xuống.
     */
    expect(css).toMatch(/^\.nut \+ \.nut-rong \{ margin-top: var\(--k\d\); \}$/m);
    expect(css, 'không được nhắm mọi .nut — hàng nút ngang sẽ lệch').not.toMatch(
      /^\.nut \+ \.nut \{/m,
    );
  });

  it('vẫn còn cặp nút rộng để luật ấy có việc mà làm', () => {
    /*
     * Chiều thứ hai. Không có ca này thì gỡ hết nút phụ đi, luật thành mã chết,
     * và ca ở trên vẫn xanh — canh một quy tắc về thứ không còn tồn tại.
     */
    const cap = capNutRong();
    expect(cap.length, 'không còn cặp nút rộng nào — luật CSS kia đã thành mã chết').toBeGreaterThan(0);
  });
});
