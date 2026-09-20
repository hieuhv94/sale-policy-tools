/**
 * @vitest-environment jsdom
 *
 * `0073` — khung xem KHỚP theo hình dáng nội dung, không đóng khuôn cứng.
 *
 * Trước đợt này hộp xem tệp rộng cứng 520px và khung bên trong cao cứng
 * `min(68vh, 760px)`, bất kể bên trong là gì. Hệ quả thấy bằng mắt:
 *
 *   - tờ **A4 ngang** thành một dải bẹp kẹp giữa hai vệt xám trên dưới;
 *   - tờ **A4 dọc** vừa chiều cao nhưng chữ nhỏ tới mức phải phóng to;
 *   - **ảnh chụp** bằng điện thoại thì nằm lọt thỏm, hoặc thừa hai bên.
 *
 * Ba loại nội dung, ba mức làm được khác nhau — và đó là cả nội dung của tệp
 * kiểm thử này:
 *
 *   1. **Ảnh** — đo được tới từng pixel (`naturalWidth`/`naturalHeight`).
 *   2. **PDF ta tự sinh** — không đo được, nhưng khổ giấy đã nằm sẵn ở mẫu.
 *   3. **PDF do người dùng tải lên** — không biết gì, rơi về A4 dọc.
 *
 * Phần CSS kiểm bằng cách ĐỌC NGUỒN: jsdom không có bố cục, nên không đo được
 * một pixel nào. Đọc nguồn bắt được đúng thứ dễ tái phát nhất ở đây — một dòng
 * `height` cố định quay lại `.khung-xem` và mọi phép tính tỷ lệ thành vô nghĩa.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { XemTep } from '@csbh/web/xem-tep';
import { TY_LE_KHO, TY_LE_MAC_DINH } from '@csbh/web/mau-hop-dong';

const TAO = vi.fn(() => 'blob:gia-lap-1');

const tep = (kieu: string) =>
  new Response('noi-dung', { status: 200, headers: { 'content-type': kieu } });

const chanFetch = (kieu: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(tep(kieu))),
  );

beforeEach(() => {
  TAO.mockClear();
  vi.stubGlobal('URL', { ...URL, createObjectURL: TAO, revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bay = (props: Partial<Parameters<typeof XemTep>[0]> = {}) =>
  render(
    <XemTep
      tieuDe="Bản scan"
      duong="/files/f1/content"
      tenTep="ban-cung.pdf"
      dong={() => undefined}
      {...props}
    />,
  );

/** Tỷ lệ mà hộp thoại đang mang, đọc từ chính biến CSS nó đặt ra. */
const tyLeCuaHop = (): number | null => {
  const hop = document.querySelector<HTMLElement>('[role="dialog"]');
  const v = hop?.style.getPropertyValue('--ty-le') ?? '';
  return v === '' ? null : Number(v);
};

/** Chiều cao thật của ảnh mà hộp đang khai, đọc từ chính biến CSS nó đặt ra. */
const caoAnhCuaHop = (): string =>
  document.querySelector<HTMLElement>('[role="dialog"]')?.style.getPropertyValue('--cao-anh') ?? '';

const A4_DOC = TY_LE_KHO.a4p;
const A4_NGANG = TY_LE_KHO.a4l;

// =============================================================================
// Tỷ lệ đi vào hộp thoại
// =============================================================================

describe('`0073` hộp xem tệp nhận đúng tỷ lệ', () => {
  it('khổ giấy khai trước đi thẳng vào biến CSS của hộp', async () => {
    // Đây là đường của bản mềm và hợp đồng: `XemBanMem` đọc `khoGiay` của mẫu
    // đang chọn rồi truyền xuống. Không đo được PDF, nhưng cũng không cần đo.
    chanFetch('application/pdf');
    bay({ tyLe: A4_NGANG });
    await waitFor(() => screen.getByTitle('Bản scan'));
    expect(tyLeCuaHop()).toBeCloseTo(A4_NGANG, 5);
  });

  it('PDF không biết khổ thì rơi về A4 dọc, không phải một khuôn vuông', async () => {
    // Bản scan người dùng tải lên: không có thông tin nào đi kèm. A4 dọc là
    // phỏng đoán đúng với gần như mọi bản scan giấy tờ.
    chanFetch('application/pdf');
    bay();
    await waitFor(() => screen.getByTitle('Bản scan'));
    expect(tyLeCuaHop()).toBeCloseTo(TY_LE_MAC_DINH, 5);
    expect(TY_LE_MAC_DINH).toBeCloseTo(A4_DOC, 5);
  });

  it('hộp đã mang tỷ lệ NGAY LÚC ĐANG TẢI, không đợi nội dung tới', () => {
    /*
     * Chờ tải xong mới đặt cỡ thì hộp mở ra nhỏ rồi giật ra to — một cú nhảy bố
     * cục ngay giữa tầm nhìn, ở đúng lúc người dùng đang nhìn vào đó.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    bay({ tyLe: A4_NGANG });
    expect(tyLeCuaHop()).toBeCloseTo(A4_NGANG, 5);
  });

  it('ẢNH tự đo, và số đo được ĐÈ LÊN mọi con số khai trước', async () => {
    /*
     * Thứ tự tin cậy: đo được > khai trước > mặc định. Ảnh nằm trong DOM của
     * chính trang nên trình duyệt biết kích thước thật của nó; một con số truyền
     * vào chỉ là phỏng đoán, và phỏng đoán phải nhường chỗ cho số đo.
     */
    chanFetch('image/jpeg');
    bay({ tyLe: A4_NGANG });
    const anh = await waitFor(() => screen.getByAltText('Bản scan') as HTMLImageElement);
    expect(tyLeCuaHop()).toBeCloseTo(A4_NGANG, 5);

    // jsdom không tải ảnh thật, nên số đo phải gắn tay rồi phát sự kiện `load`.
    Object.defineProperty(anh, 'naturalWidth', { value: 1600, configurable: true });
    Object.defineProperty(anh, 'naturalHeight', { value: 1200, configurable: true });
    anh.dispatchEvent(new Event('load'));

    await waitFor(() => expect(tyLeCuaHop()).toBeCloseTo(1600 / 1200, 5));
  });

  it('ảnh hỏng — hai số đo bằng 0 — KHÔNG kéo theo `NaN` vào bố cục', async () => {
    /*
     * Vài trình duyệt vẫn phát `load` cho một ảnh giải mã hỏng, với
     * `naturalWidth === 0`. `0 / 0` là `NaN`, mà `calc()` gặp `NaN` thì cả bề
     * rộng hộp thoại thành vô nghĩa — hỏng ở một chỗ chẳng liên quan gì tới ảnh.
     */
    chanFetch('image/png');
    bay();
    const anh = await waitFor(() => screen.getByAltText('Bản scan') as HTMLImageElement);
    Object.defineProperty(anh, 'naturalWidth', { value: 0, configurable: true });
    Object.defineProperty(anh, 'naturalHeight', { value: 0, configurable: true });
    anh.dispatchEvent(new Event('load'));

    const t = tyLeCuaHop();
    expect(t).not.toBeNaN();
    expect(t).toBeCloseTo(TY_LE_MAC_DINH, 5);
  });

  it('`0164` ẢNH khai CỠ THẬT của nó, và khai bằng pixel', async () => {
    /*
     * Nửa React của luật *"preview ảnh thì fit với kích thước ảnh"*. Nửa CSS —
     * `--cao-khung: min(chỗ trống, --cao-anh)` — nằm ở ca riêng bên dưới; ca này
     * canh chỗ nối giữa hai nửa, và chỗ nối ấy là một CHUỖI có đơn vị.
     *
     * Quên `px` thì `min()` gặp một số trần, coi cả khai báo là sai cú pháp, và
     * `--cao-khung` rơi về rỗng — hộp co về bề rộng nội dung, hỏng ở một chỗ
     * không nhắc gì tới ảnh.
     */
    chanFetch('image/jpeg');
    bay();
    const anh = await waitFor(() => screen.getByAltText('Bản scan') as HTMLImageElement);
    // Chưa đo xong thì CHƯA khai: một con số đoán trước ở đây là chặn nhầm.
    expect(caoAnhCuaHop()).toBe('');

    Object.defineProperty(anh, 'naturalWidth', { value: 800, configurable: true });
    Object.defineProperty(anh, 'naturalHeight', { value: 600, configurable: true });
    anh.dispatchEvent(new Event('load'));

    await waitFor(() => expect(caoAnhCuaHop()).toBe('600px'));
  });

  it('`0164` PDF KHÔNG khai chiều cao — nó phóng bao nhiêu cũng nét', async () => {
    /*
     * Chiều đối chiếu, và là chiều dễ hỏng lặng lẽ hơn: khai một con số cho PDF
     * thì tờ giấy bị chặn ở đúng con số ấy trên mọi màn hình, và không có triệu
     * chứng nào ngoài "hộp nhỏ hơn mình tưởng".
     */
    chanFetch('application/pdf');
    bay({ tyLe: A4_NGANG });
    await waitFor(() => expect(document.querySelector('.khung-giay')).not.toBeNull());
    expect(caoAnhCuaHop()).toBe('');
  });

  it('`0164` ảnh hỏng thì cũng KHÔNG khai chiều cao', async () => {
    // Cùng một chốt chặn với ca `NaN` ở trên, nhìn từ phía chiều cao: `0px` lọt
    // vào `min()` là khung xẹp xuống không còn gì.
    chanFetch('image/png');
    bay();
    const anh = await waitFor(() => screen.getByAltText('Bản scan') as HTMLImageElement);
    Object.defineProperty(anh, 'naturalWidth', { value: 0, configurable: true });
    Object.defineProperty(anh, 'naturalHeight', { value: 0, configurable: true });
    anh.dispatchEvent(new Event('load'));
    expect(caoAnhCuaHop()).toBe('');
  });

  it('tệp KHÔNG nhúng được thì hộp về cỡ hộp thoại thường', async () => {
    // Word, Excel: không có khung xem nào, chỉ một câu nhắn tải về. Giữ hộp to
    // bằng tờ A4 để đựng hai dòng chữ là một khoảng trống không giải thích được.
    chanFetch('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    bay();
    await waitFor(() => expect(document.body.textContent).toContain('không xem trực tiếp được'));
    expect(tyLeCuaHop()).toBeNull();
    expect(document.querySelector('.hop-thoai-xem')).toBeNull();
  });
});

// =============================================================================
// Hai con số khổ giấy
// =============================================================================

describe('`0073` tỷ lệ khổ giấy', () => {
  it('A4 dọc cao hơn rộng, A4 ngang thì ngược lại', () => {
    // Đảo hai giá trị này là lỗi im lặng nhất có thể: không ca nào đỏ, chỉ có
    // mọi khung xem mang đúng hình sai.
    expect(A4_DOC).toBeLessThan(1);
    expect(A4_NGANG).toBeGreaterThan(1);
    expect(A4_DOC * A4_NGANG).toBeCloseTo(1, 10);
    expect(A4_DOC).toBeCloseTo(0.7071, 3);
  });
});

// =============================================================================
// CSS — chỗ thật sự làm việc
// =============================================================================

describe('`0073` khung xem trong CSS', () => {
  const css = () => readFileSync('apps/web/src/styles/app.css', 'utf8');

  /** Các khai báo của khối CSS đầu tiên có bộ chọn khớp `re`. */
  const khoi = (re: RegExp): string[] =>
    [...css().matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => re.test(m[1]!))
      .map((m) => m[2]!);

  it('`.khung-xem` KHÔNG đặt chiều cao cố định', () => {
    /*
     * Đây là ca đáng giá nhất trong tệp này. Một dòng `height` quay lại đây là
     * đủ để vô hiệu hoá `aspect-ratio` — trình duyệt có cả rộng lẫn cao thì nó
     * bỏ qua tỷ lệ — mà giao diện vẫn chạy, chỉ là khung lại méo như cũ.
     */
    const k = khoi(/\.khung-xem/);
    expect(k.length, 'không tìm thấy luật nào cho `.khung-xem`').toBeGreaterThan(0);
    /*
     * `0210` NỚI phép so, và nới đúng một chữ: `height: auto`.
     *
     * Chế độ toàn màn hình phải GỠ chiều cao suy từ tỷ lệ để khung lấy hết phần
     * còn lại của màn hình — mà cách gỡ một thuộc tính trong CSS chính là khai
     * nó bằng `auto`. Câu ca này giữ vẫn nguyên: **một con số** quay lại đây là
     * đủ vô hiệu hoá `aspect-ratio`, vì trình duyệt có cả rộng lẫn cao thì nó bỏ
     * qua tỷ lệ. `auto` không phải một con số.
     */
    expect(
      /*
       * Khoảng trắng nằm TRONG lookahead, không đứng trước nó: `height:\s*(?!auto)`
       * trông đúng mà luôn khớp, vì `\s*` lùi về rỗng rồi lookahead xét ngay sau
       * dấu hai chấm — chỗ ấy là một dấu cách, không phải `auto`. Bản đầu của
       * dòng này viết đúng như vậy và đỏ với chính luật hợp lệ của `0210`.
       */
      k.some((x) => /(^|[;{\s])height:(?!\s*auto\b)/.test(x)),
      'height cố định đã quay lại',
    ).toBe(false);
    expect(k.some((x) => /aspect-ratio:\s*var\(--ty-le\)/.test(x))).toBe(true);
  });

  it('bề rộng khung bị chặn bởi CHIỀU CAO tối đa, không phải `max-height`', () => {
    /*
     * `max-height` là bẫy: trình duyệt cắt chiều cao nhưng KHÔNG tính lại chiều
     * rộng, nên khung méo đi đúng vào lúc màn hình thấp. Cách đúng là chặn ngay
     * ở bề rộng — `min(100%, cao × tỷ lệ)` — để tỷ lệ luôn còn nguyên.
     */
    const k = khoi(/\.khung-xem/).join('\n');
    expect(k).toMatch(/width:\s*min\(\s*100%\s*,\s*calc\(var\(--cao-khung\)\s*\*\s*var\(--ty-le\)/);
    expect(k, '`max-height` ở đây làm méo khung').not.toMatch(/max-height:/);
  });

  it('hộp thoại có SÀN bề rộng, không co theo tỷ lệ tới mức vỡ tiêu đề', () => {
    /*
     * Một bản scan hoá đơn cao và hẹp cho ra tỷ lệ cỡ 0.3; nhân với chiều cao
     * khung là một hộp rộng chừng 200px, không đủ chỗ cho tiêu đề và hai nút.
     *
     * `0129` cắt sợi dây "sàn = bề rộng hộp thoại thường" mà bản `0073` buộc:
     * hộp thường nới gấp đôi, còn câu hỏi *"hẹp tới đâu thì vỡ"* thì không đổi
     * theo. Nới sàn theo hộp thường nghĩa là tờ A4 dọc nằm giữa một hộp 1040px
     * với hai vệt xám hai bên — đúng thứ `0073` sinh ra để bỏ đi.
     */
    const k = khoi(/\.hop-thoai-xem/).join('\n');
    expect(k).toMatch(/width:\s*min\(\s*max\(/);
    expect(k).toMatch(/var\(--san-hop-thoai\)/);
  });

  it('CSS tự đứng được: `--ty-le` có mặc định, không đợi JavaScript', () => {
    /*
     * `calc()` gặp một biến không có giá trị thì CẢ khai báo bề rộng thành vô
     * nghĩa, và hộp thoại co về bề rộng nội dung — hỏng ở một chỗ trông chẳng
     * liên quan gì tới nguyên nhân. Một dòng mặc định A4 dọc đủ giữ tệp CSS này
     * tự đứng, còn React đặt đè bằng style nội tuyến (đo trong Chrome: nội tuyến
     * thắng, khung ra đúng 1.4142 khi truyền A4 ngang).
     */
    expect(khoi(/\.hop-thoai-xem/).join('\n')).toMatch(/--ty-le:\s*0?\.\d+/);
  });

  it('chiều cao khung trừ một khoản CỐ ĐỊNH cho tiêu đề và hàng nút', () => {
    /*
     * Tiêu đề, hàng nút và ô chọn mẫu cao bằng chữ — chúng không co theo màn
     * hình. Lấy một phần trăm chiều cao như bản cũ (`68vh`) thì trên laptop 13"
     * hàng nút bị đẩy khỏi tầm nhìn, còn trên màn hình 27" thì thừa một dải trống.
     */
    const k = khoi(/\.hop-thoai-xem/).join('\n');
    // `0164` bỏ TRẦN nên `clamp()` thành `max()` — hai vế, không còn ba.
    expect(k).toMatch(/--cao-kha-dung:\s*max\(/);
    expect(k).toMatch(/calc\(100dvh\s*-\s*\d+rem\)/);
    // `dvh` không được hiểu thì CẢ dòng bị bỏ, nên phải có dòng `vh` đứng trước.
    expect(k).toMatch(/calc\(100vh\s*-\s*\d+rem\)/);
  });

  it('`0164` chiều cao khung chặn ở CỠ THẬT của ảnh, và chỉ của ảnh', () => {
    /*
     * Yêu cầu viết thẳng: *"đối với preview ảnh thì tự điều chỉnh kích thước để
     * fit với kích thước ảnh"*. Bỏ trần `--cao-khung` mà không thêm chốt này thì
     * một tấm 400×300 bị kéo lên cao gần hết màn hình — phóng to gấp ba, mờ theo
     * kiểu người dùng tưởng bản scan bị hỏng.
     *
     * Giá trị lùi `99999px` là cả cơ chế: React KHÔNG đặt `--cao-anh` cho PDF,
     * nên `var()` rơi về con số ấy và `min()` không chặn gì. Đặt một giá trị lùi
     * nhỏ, hay quên hẳn giá trị lùi, đều làm PDF co lại — và co lặng lẽ.
     */
    const k = khoi(/\.hop-thoai-xem/).join('\n');
    const m = k.match(/--cao-khung:\s*min\(\s*var\(--cao-kha-dung\)\s*,\s*var\(--cao-anh,\s*(\d+)px\)\s*\)/);
    expect(m, '`--cao-khung` phải là min(chỗ trống, cỡ thật của ảnh)').not.toBeNull();
    expect(
      Number(m![1]),
      'giá trị lùi phải cao hơn mọi màn hình, nếu không thì PDF bị co lặng lẽ',
    ).toBeGreaterThan(4320);
  });
});

// =============================================================================
// `0129` — ba bậc bề rộng hộp thoại
// =============================================================================

describe('`0129` hộp thoại đủ rộng', () => {
  /*
   * Chú thích GỠ TRƯỚC, khác với hàm `khoi` ở khối trên.
   *
   * `[^{}]+` trước dấu `{` nuốt cả chú thích đứng trên bộ chọn, nên `.khung-pdf`
   * nhắc tên trong một chú thích của `.hop-thoai-xem` là đủ để hai khối gộp làm
   * một — và ca kiểm xanh nhờ khai báo của khối KHÁC.
   */
  const css = (t: string) =>
    readFileSync(`apps/web/src/styles/${t}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  const khoi = (tep: string, re: RegExp): string =>
    [...css(tep).matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => re.test(m[1]!))
      .map((m) => m[2]!)
      .join('\n');

  /** Giá trị của một token, đọc từ `tokens.css`. */
  const token = (ten: string): number => {
    const m = css('tokens.css').match(new RegExp(`${ten}:\\s*(\\d+)px`));
    expect(m, `thiếu token ${ten}`).not.toBeNull();
    return Number(m![1]);
  };

  it('ba bậc bề rộng TĂNG DẦN, và bậc thường rộng hơn con số trước `0129`', () => {
    /*
     * Ba bậc mà không tăng dần là ba bậc vô nghĩa — một hộp `to` hẹp hơn hộp
     * thường thì mọi chỗ gọi `co="to"` đang nói ngược lại điều nó định nói, và
     * không có màn hình nào đỏ lên vì việc ấy.
     *
     * Canh QUAN HỆ chứ không canh con số, và `0130` là lý do: nó hạ cả ba bậc
     * một phần ba sau khi khách hàng xem bản `0129`. Một ca kiểm ghim `1040px`
     * thì mỗi lượt chỉnh cỡ đều đỏ mà chẳng phát hiện được gì — thứ đáng canh là
     * cái thang, cộng với việc bậc thường không lặng lẽ tụt về 520px của `0128`.
     *
     * Ca đỏ đúng lúc đáng đỏ: `0130` thoạt tiên chỉ hạ hai bậc khách hàng nêu
     * tên, để `rong` ở 1520px — và nó thành bậc RỘNG NHẤT, rộng hơn cả `to`.
     */
    const thuong = token('--rong-hop-thoai');
    const rong = token('--rong-hop-thoai-rong');
    const to = token('--rong-hop-thoai-to');

    expect(thuong).toBeGreaterThan(520);
    expect(thuong).toBeLessThan(rong);
    expect(rong).toBeLessThan(to);
  });

  it('SÀN hộp xem KHÔNG đi theo bề rộng hộp thường', () => {
    /*
     * Hai con số trả lời hai câu hỏi khác nhau (xem ca "hộp thoại có SÀN" ở
     * trên). Buộc chúng bằng nhau là cách bản `0073` viết, và đó chính là chỗ
     * `0129` suýt sửa nhầm: nới hộp thường lên 1040px mà sàn đi theo thì tờ A4
     * dọc trong hộp xem tự dưng có hai vệt xám hai bên.
     */
    expect(token('--san-hop-thoai')).toBeLessThan(token('--rong-hop-thoai'));
  });

  it('ba bậc đều bọc trong `min(…, 100%)`', () => {
    // Lớp phủ đã có lề hai bên. Đặt bề rộng cứng thì trên laptop 1366px hộp đẩy
    // nội dung chạy ra ngoài mép màn hình, và không cuộn ngang tới được.
    for (const [chon, bien] of [
      [/^\s*\.hop-thoai\s*$/m, '--rong-hop-thoai'],
      [/\.hop-thoai-rong/, '--rong-hop-thoai-rong'],
      [/\.hop-thoai-to/, '--rong-hop-thoai-to'],
    ] as const) {
      const k = khoi('app.css', chon);
      expect(k, `thiếu luật cho ${bien}`).toMatch(
        new RegExp(`width:\\s*min\\(\\s*var\\(${bien}\\)\\s*,\\s*100%\\s*\\)`),
      );
    }
  });

  it('`0164` lớp phủ ĐÈ LÊN thanh bên và thanh tiêu đề', () => {
    /*
     * Nửa này của yêu cầu — *"có thể đè lên thanh bar bên trái"* — ĐÃ ĐÚNG SẴN,
     * và đó là điều đáng ghi: `.lop-phu` là `position: fixed; inset: 0` với
     * `z-index: 50`, còn thanh bên đứng ở 40 và thanh tiêu đề ở 30. Hộp xem chưa
     * bao giờ bị thanh bên cắt; cái làm nó trông nhỏ là trần chiều cao và bề
     * rộng cố định, hai thứ lượt này gỡ.
     *
     * Nên ca này không canh một bản sửa, nó canh một BẤT BIẾN chưa ai viết ra:
     * hạ `z-index` của lớp phủ, hoặc nâng thanh bên lên, là hộp xem bị một dải
     * 260px che mất mép trái — và không có gì đỏ lên.
     */
    const soZ = (bo: RegExp) => Number(khoi('app.css', bo).match(/z-index:\s*(\d+)/)?.[1]);
    const phu = soZ(/\.lop-phu/);
    expect(phu, 'không đọc được z-index của lớp phủ').toBeGreaterThan(0);
    for (const [ten, bo] of [
      ['thanh bên', /\.thanh-ben/],
      ['thanh tiêu đề', /\.thanh-tieu-de/],
      ['màn che ngăn kéo', /\.man-che/],
    ] as const) {
      const z = soZ(bo);
      expect(z, `không đọc được z-index của ${ten}`).toBeGreaterThan(0);
      expect(phu, `${ten} nằm trên lớp phủ — hộp xem bị nó che mất một mép`).toBeGreaterThan(z);
    }
  });

  it('`0164` KHÔNG còn trần chiều cao — màn hình to thì khung to theo', () => {
    /*
     * Ba lượt sửa cùng một con số, và lượt này bỏ hẳn nó:
     *
     *   `0073` trần 900px  — cắn từ màn hình cao hơn 1140px
     *   `0129` trần 1600px — cắn từ 1904px
     *   `0130` trần 1400px — cắn từ 1704px
     *   `0164` KHÔNG CÓ TRẦN
     *
     * Khách hàng đòi *"phóng to hết cỡ… gần như full hết cả màn hình"*, và một
     * cái trần là thứ duy nhất còn ngăn điều đó trên màn hình lớn. Cái nó từng
     * bảo vệ — ảnh nhỏ bị kéo giãn — giờ do `--cao-anh` lo, và lo đúng chỗ hơn:
     * theo cỡ THẬT của tệp chứ theo một con số đoán trước.
     *
     * Ca này canh chiều KHÔNG có: `max()` chỉ nhận hai đối, nên một cái trần lén
     * quay lại sẽ phải viết thành `clamp()` hoặc `min()` và đỏ ở đây.
     */
    const k = khoi('app.css', /\.hop-thoai-xem/);
    const dong = [...k.matchAll(/--cao-kha-dung:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(dong.length, 'thiếu cặp vh/dvh của --cao-kha-dung').toBe(2);
    for (const d of dong) {
      expect(d, 'trần quay lại thì màn hình lớn bỏ phí chiều cao').toMatch(/^max\(/);
      expect(d).not.toMatch(/clamp\(/);
    }
  });

  it('`0164` hộp xem gần chạm hai mép, nhưng hàng nút vẫn còn chỗ', () => {
    /*
     * Ca này ĐẢO NGƯỢC `0130`, và cả hai ngưỡng đổi chiều cùng lúc.
     *
     * `0130` đòi khoản trừ **lớn hơn** 289px để hộp còn chừa khoảng hở — khách
     * hàng khi ấy bảo hộp cao quá. `0164` họ bảo ngược lại: *"gần như full hết
     * cả màn hình"*. Nên giờ nó là một trần, không phải một sàn.
     *
     * Sàn còn lại là ngưỡng VẬT LÝ, và nó không đổi theo ý ai:
     *
     *   khung hộp   ≤ 157px (đo trong Chrome ở `0073`, ca có ô chọn mẫu)
     *   lề lớp phủ  = 2 × var(--k4) = 32px
     *   viền        = 2px
     *
     * Dưới 191px là khung bị cắt và hàng nút trôi khỏi tầm nhìn — `0073` đã đo
     * và ghi lại rằng 11rem (176px) là chỗ nó bắt đầu hỏng. Trần 240px giữ cho
     * lượt sau đừng lùi về mức `0130`: trừ nhiều hơn thế là quay lại đúng cái
     * khoảng hở mà khách hàng vừa bảo bỏ.
     */
    const k = khoi('app.css', /\.hop-thoai-xem/);
    const tru = [...k.matchAll(/--cao-kha-dung:[^;]*?100d?vh\s*-\s*(\d+)rem/g)].map(
      (m) => Number(m[1]) * 16,
    );
    expect(tru.length).toBe(2);
    for (const t of tru) {
      expect(t, 'trừ ít quá — hàng nút trôi khỏi tầm nhìn').toBeGreaterThanOrEqual(157 + 32 + 2);
      expect(t, 'hộp chưa gần full màn hình').toBeLessThanOrEqual(240);
    }
  });

  it('`0164` hộp TỜ GIẤY lấy phần LỚN HƠN của tỷ lệ và sàn ổn định', () => {
    /*
     * Ba lượt, ba câu trả lời cho cùng một câu hỏi, và ca này canh câu thứ ba:
     *
     *   `0073` bề rộng = `cao × tỷ lệ`  → A4 dọc ra 315px trên laptop, và bề
     *                                     rộng NHẢY khi đổi mẫu
     *   `0146` bề rộng = 900px cố định  → hết nhảy, nhưng màn 27" cũng 900px
     *   `0164` bề rộng = `max()` cả hai → không bao giờ hẹp hơn `0146`, và rộng
     *                                     ra khi màn hình cho phép
     *
     * Vì sao vế tỷ lệ là mức TỐI ƯU chứ không phải tối đa: `#view=FitH` khớp tờ
     * giấy theo BỀ RỘNG, nên hộp rộng hơn `cao × tỷ lệ` làm trình xem phóng
     * trang cao hơn khung và sinh một thanh cuộn dọc BÊN TRONG khung. Rộng đúng
     * bằng ấy thì trang lấp đầy khung cả hai chiều.
     *
     * `max()` chứ không phải thay hẳn sàn bằng tỷ lệ: bỏ sàn đi là A4 dọc trên
     * laptop 1366×768 tụt về 605px, tức lùi lại đúng chỗ khách hàng đã than
     * phiền ở `0145`.
     */
    const k = khoi('app.css', /\.hop-thoai-giay/);
    expect(k, 'không tìm thấy luật cho `.hop-thoai-giay`').not.toBe('');
    expect(k, 'thiếu vế tỷ lệ thì màn hình lớn không rộng thêm được').toMatch(
      /max\(\s*calc\(\s*var\(--cao-khung\)\s*\*\s*var\(--ty-le\)\s*\)\s*,\s*var\(--rong-hop-thoai-xem\)/,
    );
    expect(k, 'thiếu `min(…, 100%)` thì hộp chạy ra ngoài mép màn hình').toMatch(/min\(/);
    expect(k).toMatch(/100%/);

    // Sàn vẫn nằm giữa hộp thường và hộp rộng: đây là mặt ĐỌC, không phải biểu mẫu.
    const xem = token('--rong-hop-thoai-xem');
    expect(xem).toBeGreaterThan(token('--rong-hop-thoai'));
    expect(xem).toBeLessThan(token('--rong-hop-thoai-rong'));
  });

  it('`0164` KHỔ NGANG rộng thêm thật, và khổ dọc không hẹp đi', () => {
    /*
     * Ca đối chiếu, và nó dựng lại chính phép tính của CSS bằng những con số ĐỌC
     * TỪ CSS — không chép tay con số nào, nên nới sàn hay đổi khoản trừ đều
     * được đo lại ở đây.
     *
     * Hai mẫu bàn giao của `0164` đều là A4 NGANG, nên đó là ca phải thắng.
     * Khổ dọc thì chỉ cần KHÔNG THUA bản `0146`.
     *
     * DÒNG ĐẦU LÀ CHỖ NEO, và nó có mặt vì phá lại: bỏ vế tỷ lệ khỏi
     * `.hop-thoai-giay` thì ca này vẫn XANH — nó dựng lại công thức trong
     * JavaScript, nên nó đo cái công thức của chính nó chứ không đo CSS. Một ca
     * dựng trên bản sao chỉ đúng chừng nào có thứ giữ cho bản sao khỏi trôi.
     */
    expect(
      khoi('app.css', /\.hop-thoai-giay/),
      'phép tính dưới đây dựng theo luật của `.hop-thoai-giay`, nên vế tỷ lệ phải còn ở đó',
    ).toMatch(/--ty-le/);

    const k = khoi('app.css', /\.hop-thoai-xem/);
    const tru = Number(k.match(/--cao-kha-dung:[^;]*?100dvh\s*-\s*(\d+)rem/)?.[1]) * 16;
    expect(tru, 'không đọc được khoản trừ').toBeGreaterThan(0);
    const san = token('--rong-hop-thoai-xem');
    const rong = (caoManHinh: number, tyLe: number) =>
      Math.max(Math.max(300, caoManHinh - tru) * tyLe, san);

    // A4 ngang trên hai màn hình văn phòng phổ biến: phải rộng hơn hẳn sàn.
    expect(rong(1080, 1.4142)).toBeGreaterThan(san * 1.2);
    expect(rong(1440, 1.4142)).toBeGreaterThan(san * 1.6);
    // A4 dọc: sàn thắng, tức đúng bằng hành vi `0146` — không thua.
    expect(rong(1080, 0.7071)).toBe(san);
    expect(rong(768, 0.7071)).toBe(san);
  });

  it('`0146` khung TỜ GIẤY lấp đầy hộp — cả hai chiều', () => {
    /*
     * `width: 100%` một mình KHÔNG đủ, và đây là chỗ dễ sửa nhầm nhất của cả
     * lượt: `aspect-ratio` của `.khung-xem` vẫn còn hiệu lực, nên chiều cao đi
     * theo bề rộng và khung tràn khỏi hộp. Phải gỡ tỷ lệ ĐI cho riêng ca này.
     */
    const k = khoi('app.css', /\.khung-giay/);
    expect(k, 'không tìm thấy luật cho `.khung-giay`').not.toBe('');
    expect(k).toMatch(/width:\s*100%/);
    expect(k, 'thiếu chiều cao thì khung xẹp xuống 150px mặc định của iframe').toMatch(
      /height:\s*var\(--cao-khung\)/,
    );
    expect(k, '`aspect-ratio` còn sót thì khung vẫn mang hình tờ giấy').toMatch(
      /aspect-ratio:\s*auto/,
    );
  });

  it('`0146` mọi khung TỜ GIẤY đều xin trình xem PDF vừa bề rộng', () => {
    /*
     * Quét nguồn vì phép này không đo được bằng jsdom lẫn bằng CSS: nó nằm ở
     * chuỗi `src`. Đòi ĐỦ hai điều kiện trên cùng một khung — có `khung-giay`
     * thì phải có `FitH` — chứ không đếm riêng từng chuỗi trong tệp.
     *
     * `0146` quét HAI tệp: `XemTep` và bước hai của lượt gửi duyệt
     * (`ChiTietHoSo`, `0140`). `0163` gỡ bước hai — TDV thôi chọn mẫu nên thôi
     * có bản xem trước — nên chỉ còn một chỗ dựng khung tờ giấy. Danh sách rút
     * còn một tệp chứ KHÔNG bỏ ca: cái nó canh là "mọi khung tờ giấy đều xin
     * `FitH`", và câu ấy vẫn phải đúng ở chỗ duy nhất còn lại.
     */
    for (const tep of ['apps/web/src/components/XemTep.tsx']) {
      const src = readFileSync(tep, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const khung = [...src.matchAll(/<iframe[\s\S]*?\/>/g)]
        .map((m) => m[0])
        .filter((x) => x.includes('khung-giay'));
      expect(khung.length, `${tep} không còn khung tờ giấy nào`).toBeGreaterThan(0);
      for (const x of khung) expect(x, `${tep}: khung tờ giấy thiếu #view=FitH`).toContain('#view=FitH');
    }
  });

  it('`0145` SÀN không được lớn hơn tờ A4 dọc trên laptop 768px', () => {
    /*
     * Đây là ca của lỗi khách hàng báo: *"thừa một phần lề lớn bên phải hộp
     * thoại"*. Bề rộng hộp là `max(khung + đệm, SÀN)`, nên khi sàn thắng thì cả
     * phần chênh lệch thành một dải trắng chết bên trong hộp.
     *
     * Đo được trong Chrome trước khi sửa, ba cỡ cửa sổ:
     *
     *     1920×1080   hộp 535px · khung 485px   hở phải  25px
     *     1366×768    hộp 520px · khung 267px   hở phải 203px
     *     1280×720    hộp 520px · khung 233px   hở phải 237px
     *
     * `0146` đưa TỜ GIẤY ra khỏi phép tính này (bề rộng cố định, xem
     * `.hop-thoai-giay`), nên sàn giờ chỉ còn cầm lái hộp xem **ẢNH** — thứ
     * không phóng to được. Ca kiểm vẫn đứng nguyên và vẫn đáng: một bản scan
     * dọc cũng cho ra đúng cái dải trắng ấy.
     *
     * Ca này dựng lại chính phép tính ấy từ CSS, ở cỡ màn hình PHỔ BIẾN NHẤT
     * trong văn phòng — laptop 1366×768. Nó canh một QUAN HỆ giữa ba con số nằm
     * ở hai tệp khác nhau (`--san-hop-thoai` bên `tokens.css`, khoản trừ của
     * `--cao-khung` bên `app.css`), nên nới bất kỳ con số nào mà quên con số kia
     * đều đỏ ở đây.
     *
     * `768 - 87` là chiều cao KHUNG NHÌN đo được trong Chrome không màn hình, đã
     * trừ phần khung cửa sổ; lấy tròn 768 thì ca kiểm rộng tay hơn thực tế.
     */
    const A4_DOC_SO = 0.7071;
    const k5 = 24;
    const khoTrong = 768 - 87;

    const k = khoi('app.css', /\.hop-thoai-xem/);
    const tru = Number(k.match(/--cao-kha-dung:[^;]*?100dvh\s*-\s*(\d+)rem/)?.[1]) * 16;
    expect(tru, 'không đọc được khoản trừ của --cao-kha-dung').toBeGreaterThan(0);

    const caoKhung = Math.max(300, khoTrong - tru);
    const rongKhung = caoKhung * A4_DOC_SO;
    const san = token('--san-hop-thoai');

    expect(
      san,
      `sàn ${san}px lớn hơn tờ A4 dọc (${Math.round(rongKhung)}px) — phần chênh ` +
        `lệch thành dải trắng chết trong hộp`,
    ).toBeLessThanOrEqual(Math.round(rongKhung) + k5 * 2);
  });

  it('`0145` SÀN vẫn đủ chỗ cho hàng nút — nó là lý do sàn tồn tại', () => {
    /*
     * Vế ngược, và cần cả hai: hạ sàn để bịt dải trắng thì rất dễ hạ quá tay,
     * và cái vỡ đầu tiên là hàng nút — *Đóng* cạnh *Tải xuống*.
     *
     * 186px là số ĐO ĐƯỢC trong Chrome (tổng bề rộng hai nút cộng `gap`), không
     * phải ước lượng. Cộng đệm hai bên của thân hộp là ngưỡng thật.
     *
     * Tiêu đề KHÔNG nằm trong phép tính này: nó xuống dòng chứ không vỡ. Bản
     * `0073` gộp cả hai vào một câu — *"tiêu đề với hai nút vỡ hết"* — và đó là
     * lý do sàn bị đặt cao gấp đôi mức cần thiết suốt bảy mươi chặng.
     */
    expect(token('--san-hop-thoai')).toBeGreaterThanOrEqual(186 + 24 * 2);
  });

  it('`0145` `.khung-xem` là khối, nếu không thì lề tự động vô nghĩa', () => {
    /*
     * `<iframe>` mặc định `display: inline`, và lề tự động KHÔNG căn giữa một
     * phần tử inline — nó dạt trái, dồn hết chỗ thừa sang PHẢI. Chú thích cạnh
     * `margin-inline: auto` đã hứa căn giữa suốt từ `0073` mà chưa bao giờ làm
     * được; đo trong Chrome ở `0145`: hở trái 25px, hở phải 203px.
     *
     * Hai khai báo phải đi cùng nhau, nên ca kiểm đòi cả hai: gỡ `display` đi
     * thì `margin-inline` thành mã chết, còn gỡ `margin-inline` thì `display`
     * chẳng làm gì.
     */
    const k = khoi('app.css', /\.khung-xem/);
    expect(k, 'iframe inline thì lề tự động không căn giữa').toMatch(/display:\s*block/);
    expect(k).toMatch(/margin-inline:\s*auto/);
  });

  it('bảng xem trước lượt nhập Excel mở ở bậc TO', () => {
    /*
     * Quét nguồn chứ không dựng màn hình: chưa có bộ đồ giả nào cho màn hình
     * danh mục, và thứ dễ mất nhất ở đây là một thuộc tính JSX bị xoá trong một
     * lượt dọn dẹp.
     *
     * Khớp CẢ thẻ mở chứ không khớp chuỗi `co="to"` trần: `0124` đã dính đúng
     * bẫy ấy — một ca kiểm xanh nhờ chính dòng chú thích của nó.
     */
    const src = readFileSync('apps/web/src/components/danh-muc/SanPham.tsx', 'utf8');
    const the = src.match(/<HopThoai[^>]*tieuDe="Xem trước thay đổi danh mục"[^>]*>/);
    expect(the, 'không tìm thấy hộp xem trước thay đổi danh mục').not.toBeNull();
    expect(the![0]).toMatch(/\bco="to"/);

    // Và hộp CHỌN TỆP thì không: ở đó chỉ có một ô chọn tệp và hai nút.
    const chonTep = src.match(/<HopThoai[^>]*tieuDe="Nhập sản phẩm từ Excel"[^>]*>/);
    expect(chonTep, 'không tìm thấy hộp chọn tệp').not.toBeNull();
    expect(chonTep![0]).not.toMatch(/\bco=/);
  });

  it('`.khung-pdf` chặn bề rộng theo chiều cao, không kéo hết hộp', () => {
    /*
     * Hộp gửi duyệt nới ra `to`, và `width: 100%` cũ biến khung thành một dải
     * ngang 1800px đựng một tờ A4 dọc: trình xem PDF khớp trang theo chiều cao,
     * nên hơn 700px mỗi bên là xám trơn và chữ không to thêm chút nào.
     *
     * Cùng một phép với `.khung-xem`, và cùng một lý do.
     */
    const k = khoi('app.css', /\.khung-pdf/);
    expect(k).toMatch(/width:\s*min\(\s*100%\s*,\s*calc\(var\(--cao-pdf\)\s*\*\s*var\(--ty-le\)/);
    expect(k, 'chiều cao vẫn phải là thứ cầm lái').toMatch(/height:\s*var\(--cao-pdf\)/);
    expect(k, 'thiếu đường lùi A4 dọc cho `--ty-le`').toMatch(/--ty-le:\s*0?\.\d+/);
  });
});

// =============================================================================
// Toàn màn hình (`0210`)
// =============================================================================

/**
 * `0210` — HỘP XEM PHỦ KÍN MÀN HÌNH, bỏ khung bọc quanh tài liệu.
 *
 * Khách hàng xem bản `0164` rồi bảo *"vẫn hơi bé… không cần bọc tài liệu hoặc
 * ảnh trong hộp thoại"*. Đây là lượt thứ NĂM của cùng một dòng, và là lượt bỏ
 * chính cái khung — nên phần lớn cơ chế cũ (`--ty-le`, `--cao-anh`) vẫn còn và
 * vẫn phải đúng; thứ đổi là ai đọc chúng.
 */
describe('`0210` hộp xem toàn màn hình', () => {
  const hop = () => document.querySelector<HTMLElement>('[role="dialog"]');

  /** Thân của luật CSS mang ĐÚNG bộ chọn này; rỗng nếu không có luật nào. */
  const luat = (chon: string): string =>
    [...readFileSync('apps/web/src/styles/app.css', 'utf8').matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim() === chon)
      .map((m) => m[2]!)
      .join('\n');

  it('PDF và ẢNH đều phủ kín, và LỚP PHỦ bỏ luôn lề', async () => {
    /*
     * Hai lớp, hai việc khác nhau, và thiếu lớp nào thì vẫn còn một viền trắng:
     * `hop-thoai-toan-man` bỏ khung hộp, `lop-phu-toan-man` bỏ lề của lớp phủ.
     */
    for (const kieu of ['application/pdf', 'image/png']) {
      chanFetch(kieu);
      bay();
      await waitFor(() => expect(hop()?.classList.contains('hop-thoai-toan-man')).toBe(true));
      expect(document.querySelector('.lop-phu-toan-man'), kieu).not.toBeNull();
      cleanup();
    }
  });

  it('tệp KHÔNG nhúng được thì GIỮ hộp thoại thường', async () => {
    /*
     * RANH GIỚI, và nó không suy ra được từ câu yêu cầu. Word/Excel không có tài
     * liệu nào để bày — chỉ một câu nhắn tải về cộng hai cái nút. Phủ kín màn
     * hình cho ba dòng chữ là bắt người dùng thoát khỏi một trang trống để quay
     * lại chỗ họ đang đứng.
     */
    chanFetch('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    bay();
    await waitFor(() => expect(document.body.textContent).toContain('không xem trực tiếp được'));
    expect(hop()?.classList.contains('hop-thoai-toan-man')).toBe(false);
    expect(document.querySelector('.lop-phu-toan-man')).toBeNull();
  });

  it('nút Đóng VẪN hiện — không còn mép lớp phủ nào để bấm ra ngoài', async () => {
    /*
     * Muc 11.1: *"nút Đóng luôn hiển thị ở màn hình xem"*. Ở chế độ thường người
     * dùng còn bấm được ra ngoài hộp; phủ kín màn hình thì đường ấy biến mất, nên
     * cái nút thôi là tiện lợi và thành đường thoát DUY NHẤT nhìn thấy được.
     */
    chanFetch('application/pdf');
    bay();
    await waitFor(() => expect(hop()?.classList.contains('hop-thoai-toan-man')).toBe(true));
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeDefined();
  });

  it('CSS: hộp bỏ KHUNG và lấy hết khung nhìn', () => {
    /*
     * Bốn vế, và chúng là MỘT cơ chế chứ không phải bốn lựa chọn rời: còn bề
     * rộng suy từ tỷ lệ (`0073`) thì tài liệu vẫn nằm giữa hai vệt trống; còn
     * `max-width` thì `width: 100%` không với tới; còn bo góc và viền thì vẫn
     * là một cái hộp. `100dvh` chứ không `100vh` là đơn vị đúng trên di động,
     * và dòng `vh` đứng trước làm nền cho trình duyệt không hiểu `dvh`.
     */
    const than = luat('.hop-thoai.hop-thoai-toan-man');
    expect(than, 'không tìm thấy luật toàn màn hình').not.toBe('');
    expect(than).toMatch(/width:\s*100%/);
    expect(than).toMatch(/max-width:\s*none/);
    expect(than).toMatch(/height:\s*100dvh/);
    expect(than).toMatch(/border-radius:\s*0/);
    expect(luat('.lop-phu-toan-man')).toMatch(/padding:\s*0/);
  });

  it('CSS: khung xem lấy HẾT phần còn lại, và hàng nút không trôi đi', () => {
    // `min-height: 0` là vế dễ quên nhất: thiếu nó thì một phần tử flex không co
    // nhỏ hơn nội dung, khung đẩy cả khối dài ra và hàng nút rơi khỏi màn hình.
    const khung = luat('.hop-thoai-toan-man .khung-xem');
    expect(khung).toMatch(/flex:\s*1/);
    expect(khung).toMatch(/min-height:\s*0/);
    expect(khung, 'phải bỏ phép khoá theo tỷ lệ của `0073`').toMatch(/aspect-ratio:\s*auto/);

    const than = luat('.hop-thoai-toan-man .hop-thoai-than');
    expect(than).toMatch(/min-height:\s*0/);
    expect(luat('.hop-thoai-toan-man .nhom-nut')).toMatch(/flex:\s*none/);
  });

  it('`0164` ẢNH vẫn chặn ở CỠ THẬT — luật chỉ ĐỔI CHỖ, không mất', () => {
    /*
     * Trước `0210` trần ấy là `--cao-khung` của cả hộp; giờ hộp phủ kín màn hình
     * nên trần phải nằm trên chính thẻ `<img>`. Mất vế này thì một tấm ảnh
     * 400×300 kéo lên full màn hình — mờ, và mờ theo kiểu người dùng tưởng bản
     * scan bị hỏng, đúng câu `0164` đã ghi.
     */
    const img = luat('.hop-thoai-toan-man .khung-anh img');
    expect(img, 'không tìm thấy luật chặn cỡ ảnh').not.toBe('');
    expect(img).toMatch(/max-height:\s*min\(100%,\s*var\(--cao-anh/);
  });
});
