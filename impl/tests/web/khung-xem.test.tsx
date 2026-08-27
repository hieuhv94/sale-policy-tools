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
    expect(k.some((x) => /(^|[;{\s])height:/.test(x)), 'height cố định đã quay lại').toBe(false);
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
    expect(k).toMatch(/--cao-khung:\s*clamp\(/);
    expect(k).toMatch(/calc\(100dvh\s*-\s*\d+rem\)/);
    // `dvh` không được hiểu thì CẢ dòng bị bỏ, nên phải có dòng `vh` đứng trước.
    expect(k).toMatch(/calc\(100vh\s*-\s*\d+rem\)/);
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

  it('ba bậc bề rộng tăng dần, và bậc thường gấp đôi con số cũ', () => {
    /*
     * Ba bậc mà không tăng dần là ba bậc vô nghĩa — một hộp `to` hẹp hơn hộp
     * thường thì mọi chỗ gọi `co="to"` đang nói ngược lại điều nó định nói, và
     * không có màn hình nào đỏ lên vì việc ấy.
     */
    const thuong = token('--rong-hop-thoai');
    const rong = token('--rong-hop-thoai-rong');
    const to = token('--rong-hop-thoai-to');

    expect(thuong).toBe(520 * 2);
    expect(rong).toBe(760 * 2);
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

  it('TRẦN chiều cao khung xem không cắn trên màn hình 27"', () => {
    /*
     * Ca này canh đúng chỗ `0129` nới, và nó là chỗ dễ đọc lướt qua nhất: bề
     * rộng hộp xem là HỆ QUẢ của chiều cao khung, nên "mở rộng cửa sổ xem
     * trước" không sửa được bằng một dòng `width`.
     *
     * `0073` đặt trần 900px. Màn 2560×1440 còn `1440 - 240 = 1200px` chỗ trống,
     * nên trần ấy vứt đi 300px — một phần tư khung — và tờ giấy nhỏ đi đúng
     * chừng ấy. Trần phải cao hơn phần chiều cao mà một màn hình 1440px cho.
     */
    const k = khoi('app.css', /\.hop-thoai-xem/);
    // `[^;]*` chạy tới dấu phẩy CUỐI của `clamp(…)` — vế thứ ba là cái trần.
    const tran = [...k.matchAll(/--cao-khung:[^;]*,\s*(\d+)px\s*\)\s*;/g)].map((m) => Number(m[1]));
    expect(tran.length, 'không đọc được trần của --cao-khung').toBe(2);
    for (const t of tran) expect(t).toBeGreaterThanOrEqual(1440 - 240);
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
