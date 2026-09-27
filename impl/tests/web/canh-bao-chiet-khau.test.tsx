/**
 * @vitest-environment jsdom
 *
 * 0022 — cảnh báo "chưa có quy định chiết khấu" LÚC ĐANG LẬP, không phải sau khi lưu.
 *
 * Ngưỡng đóng băng vào dòng hồ sơ ngay khi bấm Lưu. Biết sau thì phải xoá dòng,
 * đi nhờ Quản trị khai quy định, rồi nhập lại từ đầu; biết trước thì người lập
 * chọn được — vẫn lập với ngưỡng mặc định, hay dừng lại hỏi.
 *
 * Test dựng đúng cây DOM thật của hộp thoại và chặn ở tầng `fetch`, vì thứ cần
 * chứng minh nằm ở chỗ nối: chọn sản phẩm → gọi đúng đường xem trước → đọc đúng
 * trường trong câu trả lời → hiện đúng khối cảnh báo.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemDongSanPham } from '@csbh/web/sua-ho-so-ui';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const phanHoi = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/*
 * KHÔNG còn trường `price` (`0193`).
 *
 * `0124` lấy giá bán Công ty từ danh sách này. Từ `0180` ngày áp dụng là thuộc
 * tính của DÒNG và giá thì phụ thuộc ngày, nên con số ở đây là giá HÔM NAY —
 * câu trả lời sai cho mọi dòng hẹn ngày khác. Nguồn đúng là `threshold-preview`.
 *
 * Bỏ hẳn khỏi fixture chứ không để nguyên: còn nó thì một bản sửa lỡ đọc lại
 * danh mục vẫn xanh, và ca kiểm thôi chứng minh được điều nó nói.
 */
const SAN_PHAM = {
  items: [{ id: 'sp-1', code: 'SP-01', name: 'Nutricare Gold' }],
};

/** Câu trả lời đầy đủ của `threshold-preview`, cho ca nào cần đủ trường. */
const XEM_TRUOC = {
  productId: 'sp-1',
  productCode: 'SP-01',
  productName: 'Nutricare Gold',
  companyPrice: '125000',
  threshold: '25.00',
  thresholdRate2: 2500,
  thresholdSource: 'RULE',
  ruleCode: 'QD-01',
};

/**
 * Chặn `fetch` và định tuyến theo đường dẫn.
 *
 * Trả về chính hàm giả để test khẳng định được ĐƯỜNG NÀO đã bị gọi — "hiện đúng
 * chữ" mà gọi nhầm đường thì trên máy thật sẽ hiện cảnh báo của một hồ sơ khác.
 */
const chanFetch = (xemTruoc: () => Response) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/threshold-preview')) return Promise.resolve(xemTruoc());
    if (d.includes('/catalog/products')) return Promise.resolve(phanHoi(200, SAN_PHAM));
    return Promise.resolve(phanHoi(200, {}));
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const moHopThoai = () =>
  render(<ThemDongSanPham hoSoId="hs-9" dong={() => undefined} xong={() => undefined} />);

const chonSanPham = async () => {
  const nguoi = userEvent.setup();
  await waitFor(() => expect(screen.getByRole('option', { name: /Nutricare Gold/ })).toBeDefined());
  await nguoi.selectOptions(screen.getByRole('combobox'), 'sp-1');
};

describe('0022 hộp thoại thêm dòng cảnh báo trước khi lưu', () => {
  it('có quy định khớp → KHÔNG cảnh báo gì', async () => {
    chanFetch(() =>
      phanHoi(200, { ...XEM_TRUOC, companyPrice: '100000' }),
    );
    moHopThoai();
    await chonSanPham();

    // Chờ lời gọi xem trước xong hẳn rồi mới khẳng định "không có gì" — khẳng
    // định ngay lập tức thì test xanh cả khi cảnh báo hiện ra một nhịp sau đó.
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('value', 'sp-1'));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.hop-canh-bao')).toBeNull();
  });

  it('sản phẩm không có ngưỡng nào → vẫn cảnh báo VÀNG, vì vẫn thêm được', async () => {
    // Trước `0023` chỗ này là khối ĐỎ và máy chủ từ chối thêm dòng. Ngưỡng chỉ
    // để cảnh báo — vượt ngưỡng còn không chặn gửi duyệt — nên thiếu ngưỡng
    // không thể là lý do chặn, nhất là khi người lập không có quyền tự khai.
    chanFetch(() =>
      phanHoi(200, {
        productId: 'sp-1',
        productCode: 'SP-01',
        productName: 'Nutricare Gold',
        companyPrice: '100000',
        threshold: null,
        thresholdSource: 'KHONG_CO',
      }),
    );
    moHopThoai();
    await chonSanPham();

    const canhBao = await waitFor(() => {
      const el = document.querySelector('.hop-canh-bao');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(canhBao.textContent).toContain('không có ngưỡng nào để đối chiếu');
    expect(canhBao.textContent).toContain('Vẫn lập hồ sơ được');
    // Không phải khối lỗi, và nút Xác nhận không bị khoá vì chuyện này.
    expect(document.querySelectorAll('.bao-loi')).toHaveLength(0);
  });

  it('KHONG_CO không hiện con số ngưỡng — không có con số nào để hiện', async () => {
    chanFetch(() =>
      phanHoi(200, { productId: 'sp-1', threshold: null, thresholdSource: 'KHONG_CO' }),
    );
    moHopThoai();
    await chonSanPham();

    const canhBao = await waitFor(() => {
      const el = document.querySelector('.hop-canh-bao');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(canhBao.textContent).not.toContain('null');
    expect(canhBao.textContent).not.toContain('%');
  });

  it('lỗi lúc xem trước KHÔNG hiện gì', async () => {
    // Đây là thông tin thêm, không phải điều kiện để lưu. Một khối đỏ cạnh biểu
    // mẫu đang gõ dở chỉ làm người dùng tưởng mình vừa làm hỏng thứ gì, trong
    // khi máy chủ vẫn tra lại ngưỡng lúc lưu.
    const f = vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/threshold-preview')) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(phanHoi(200, SAN_PHAM));
    });
    vi.stubGlobal('fetch', f);
    moHopThoai();
    await chonSanPham();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('.hop-canh-bao')).toBeNull();
    expect(document.querySelector('.bao-loi')).toBeNull();
  });

  it('gọi đúng hồ sơ và đúng sản phẩm', async () => {
    const f = chanFetch(() => phanHoi(200, { threshold: null, thresholdSource: 'KHONG_CO' }));
    moHopThoai();
    await chonSanPham();

    await waitFor(() => {
      const duong = f.mock.calls.map((c) => String(c[0]));
      expect(duong.some((d) => d.includes('/policies/hs-9/threshold-preview?productId=sp-1')))
        .toBe(true);
    });
  });
});


/**
 * `0124` — GIÁ BÁN CÔNG TY hiện ngay trên ô Giá bán buôn.
 *
 * Tỷ lệ chiết khấu tính ngược từ con số ấy (`1 − giá thu về / giá bán Công ty`),
 * nên gõ giá bán buôn mà không thấy nó là gõ một nửa của một phép tính. Tới
 * `0123` người lập phải mở màn hình Danh mục ở một tab khác để tra.
 */
describe('`0124` giá bán Công ty trong hộp thoại thêm dòng', () => {
  it('chưa chọn sản phẩm thì KHÔNG hiện con số nào', async () => {
    chanFetch(() => phanHoi(200, {}));
    moHopThoai();
    await waitFor(() => expect(screen.getByRole('option', { name: /Nutricare Gold/ })).toBeDefined());
    expect(screen.queryByText(/Giá bán Công ty của sản phẩm này/)).toBeNull();
  });

  /*
   * CA NÀY THAY BẢN CŨ, không sửa số (`0193`).
   *
   * Bản cũ tên là *"hiện đúng giá của DANH MỤC"* — một câu về NGUỒN, và `0193`
   * đổi đúng cái nguồn ấy. Nới nó thành `toContain` là giữ lại một câu đã hết
   * đúng và làm ca kiểm thôi gác được gì.
   */
  it('giá lấy từ XEM TRƯỚC, tức theo ngày áp dụng — không lấy giá hôm nay của danh mục', async () => {
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    await waitFor(() =>
      expect(screen.getByText(/Giá bán Công ty của sản phẩm này/)).toBeDefined(),
    );
    // Định dạng tiền, không phải chuỗi thô `125000`.
    expect(screen.getByText(/125[.,]000/)).toBeDefined();
  });

  it('ĐỔI NGÀY ÁP DỤNG thì con số đổi theo', async () => {
    /*
     * Vế chứng minh rằng giá thật sự đến từ ngày, không phải tình cờ trùng.
     *
     * Đây là LỖI CÓ SẴN mà `0193` sửa: hộp thoại bày giá hôm nay trong khi máy
     * chủ sắp chụp giá của ngày áp dụng. Chú thích của chính
     * `threshold-preview` đã viết ra điều phải tránh — *"xem trước bằng ngày
     * khác ngày sắp ghi là bày ra một con số rồi ghi một con số khác"* — nhưng
     * `0180` chỉ nối được vế NGƯỠNG và bỏ sót vế GIÁ.
     */
    const f = vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/threshold-preview')) {
        const mai = d.includes('2030-01-01');
        return Promise.resolve(
          phanHoi(200, { ...XEM_TRUOC, companyPrice: mai ? '200000' : '125000' }),
        );
      }
      if (d.includes('/catalog/products')) return Promise.resolve(phanHoi(200, SAN_PHAM));
      return Promise.resolve(phanHoi(200, {}));
    });
    vi.stubGlobal('fetch', f);
    moHopThoai();
    await chonSanPham();
    await waitFor(() => expect(screen.getByText(/125[.,]000/)).toBeDefined());

    const nguoi = userEvent.setup();
    const oNgay = screen.getByLabelText(/Ngày áp dụng/) as HTMLInputElement;
    await nguoi.clear(oNgay);
    // `0208` — ô ngày là ô CHỮ `dd/mm/yyyy`; gõ tám chữ số, phần mềm tự chèn
    // dấu gạch. Trước đó ca này gõ `2030-01-01`, lối viết của `<input type=date>`.
    await nguoi.type(oNgay, '01012030');

    await waitFor(() => expect(screen.getByText(/200[.,]000/)).toBeDefined());
    expect(screen.queryByText(/125[.,]000/)).toBeNull();
  });

  it('xem trước HỎNG thì thôi bày giá, không rơi về một con số khác', async () => {
    // Nhánh rơi về `dongCu.companyPrice` của `0124` che đúng ca này: nó bày con
    // số ĐÃ ĐÓNG BĂNG của dòng cũ trong khi máy chủ sắp ghi con số của ngày mới.
    // Không biết thì thôi bày.
    const f = vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/threshold-preview')) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(phanHoi(200, SAN_PHAM));
    });
    vi.stubGlobal('fetch', f);
    moHopThoai();
    await chonSanPham();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Giá bán Công ty của sản phẩm này/)).toBeNull();
  });

  it('đứng TRƯỚC ô Giá bán buôn, không nằm dưới đáy biểu mẫu', async () => {
    /*
     * Vị trí là một phần của yêu cầu: đọc con số ấy SAU khi đã gõ xong giá bán
     * buôn thì quá muộn để nó có ích. `compareDocumentPosition` là cách duy nhất
     * đo được thứ tự trong jsdom — nó không tính bố cục.
     */
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    const cau = await screen.findByText(/Giá bán Công ty của sản phẩm này/);
    const o = screen.getByLabelText(/Giá bán buôn/);
    expect(cau.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/**
 * `0193` — KHỐI XEM TRƯỚC bốn con số trong hộp thoại thêm dòng.
 *
 * Khách hàng chốt 09/09: *"hiển thị thêm các thông tin về CPBH, tỷ lệ CK và QĐCK
 * luôn trong hộp thoại để người dùng có thể thấy ngay mà chưa cần phải ra phần
 * bảng để nhìn"*.
 *
 * Thứ đáng gác nhất KHÔNG phải bốn con số có hiện ra hay không, mà là **tỷ lệ CK
 * ở đây có bằng đúng tỷ lệ máy chủ sắp ghi hay không**. `format.ts` cấm giao
 * diện tính toán (`FE-27`) vì sợ một bản cài đặt thứ hai của phép làm tròn; hộp
 * thoại này gọi chính `computeLine`, và ca *"nửa lên"* dưới đây là chỗ duy nhất
 * phân biệt được hai chuyện ấy.
 */
describe('`0193` khối xem trước trong hộp thoại thêm dòng', () => {
  const goGia = async (gia: string, cpbh?: string) => {
    const nguoi = userEvent.setup();
    await nguoi.type(screen.getByLabelText(/Giá bán buôn/), gia);
    if (cpbh !== undefined) await nguoi.type(screen.getByLabelText(/CPBH 1/), cpbh);
  };

  /** Ô của khối, tra theo nhãn — nhãn phải khớp tên cột bảng. */
  const o = (nhan: string) => {
    const khoi = document.querySelector('.xem-truoc-dong');
    expect(khoi, 'không có khối xem trước').not.toBeNull();
    const dt = [...khoi!.querySelectorAll('dt')].find((x) => x.textContent === nhan);
    expect(dt, `không có ô "${nhan}"`).toBeDefined();
    return dt!.nextElementSibling as HTMLElement;
  };

  it('chưa gõ giá bán buôn thì KHÔNG có khối nào', async () => {
    // Giá trống cho ra tỷ lệ 100% — một con số không có nghĩa, và bày nó ra là
    // dạy người dùng bỏ qua cả khối.
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.xem-truoc-dong')).toBeNull();
  });

  it('bốn ô mang đúng TÊN CỘT của bảng', async () => {
    // Cả điểm của yêu cầu là thôi phải ra bảng đối chiếu; hai cách gọi khác nhau
    // cho cùng một con số thì người dùng vẫn phải dịch.
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    await goGia('100000');
    await waitFor(() => expect(document.querySelector('.xem-truoc-dong')).not.toBeNull());
    const nhan = [...document.querySelectorAll('.xem-truoc-dong dt')].map((x) => x.textContent);
    expect(nhan).toEqual(['CPBH', 'Giá thu về', 'Tỷ lệ CK', 'QĐCK']);
  });

  it('CPBH cộng lại, giá thu về trừ ra, tỷ lệ tính từ giá bán Công ty', async () => {
    chanFetch(() =>
      phanHoi(200, { ...XEM_TRUOC, companyPrice: '100000', threshold: '20.00', thresholdRate2: 2000 }),
    );
    moHopThoai();
    await chonSanPham();
    await goGia('90000', '5000');

    await waitFor(() => expect(o('CPBH').textContent).toMatch(/5[.,]000/));
    expect(o('Giá thu về').textContent).toMatch(/85[.,]000/);
    // (100000 − 85000) / 100000 = 15%
    expect(o('Tỷ lệ CK').textContent).toBe('15,00%');
    expect(o('QĐCK').textContent).toBe('20,00%');
  });

  it('`0207` bốn ô trên MỘT HÀNG, và số cột khớp số ô', async () => {
    /*
     * Khách hàng chốt 20/09: *"CPBH, Giá thu về, tỷ lệ CK, QĐCK để chung một
     * dòng"*. `0193` xếp chúng 2×2.
     *
     * jsdom không tính bố cục, nên thứ đo được là luật CSS. Nhưng một ca chỉ đọc
     * CSS sẽ xanh mãi mãi kể cả khi ai đó thêm một ô thứ năm vào khối — và khi
     * ấy "một hàng" lặng lẽ thành hai. Nên ca này nối HAI thế giới: số cột khai
     * ở `app.css` phải bằng số ô dựng ra trong DOM.
     */
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    await goGia('100000');
    await waitFor(() => expect(document.querySelector('.xem-truoc-dong')).not.toBeNull());
    const soO = document.querySelectorAll('.xem-truoc-dong > div').length;
    expect(soO, 'khối phải có bốn ô').toBe(4);

    /*
     * Đọc TỪNG luật khai cho đúng selector ấy, theo thứ tự nguồn — không phân
     * tích cây `@media`. Ba luật, ba bậc: màn hình rộng · bậc giữa · điện thoại.
     */
    const css = readFileSync('apps/web/src/styles/app.css', 'utf8');
    const cot = [...css.matchAll(/\.xem-truoc-dong\s*\{([^}]*)\}/g)]
      .map((m) => m[1]!.match(/grid-template-columns:\s*([^;]+);/)?.[1]?.trim())
      .filter((x): x is string => x !== undefined);

    expect(cot.length, 'phải có BA bậc: màn rộng, bậc giữa, điện thoại').toBe(3);

    // Bậc rộng nhất: đúng một hàng, tức số cột bằng số ô.
    const n = Number(cot[0]!.match(/^repeat\(\s*(\d+)\s*,/)?.[1]);
    expect(n, `bậc màn rộng phải là repeat(n, …), đang là "${cot[0]}"`).toBe(soO);

    // Bậc giữa KHÔNG thừa: bỏ nó là nhảy thẳng từ bốn cột sang một.
    expect(cot[1], 'bậc giữa phải là hai cột').toMatch(/^repeat\(\s*2\s*,/);
    expect(cot[2], 'khổ điện thoại phải là một cột').not.toMatch(/repeat\(/);
    expect(css).toContain('@media (max-width: 48rem)');
  });

  it('LÀM TRÒN NỬA LÊN, đúng như máy chủ — không phải `toFixed` trên số thực', async () => {
    /*
     * CA ĐÁNG GIÁ NHẤT của chặng, và là ca duy nhất phân biệt được *gọi
     * `computeLine`* với *viết lại công thức*.
     *
     * Giá bán Công ty 20.000, giá thu về 17.531 → chênh 2.469, tỷ lệ đúng bằng
     * 12,345%. `computeLine` làm tròn NỬA ĐI XA KHỎI 0 trên số nguyên → 12,35%.
     * Một bản viết tay `((1 - 17531/20000) * 100).toFixed(2)` cho **12,34%**, vì
     * 12,345 không biểu diễn được chính xác bằng số thực nhị phân.
     *
     * Đây cũng đúng con số máy chủ sẽ ghi vào `discount_rate`, nên hai chỗ lệch
     * nhau ở đây nghĩa là hộp thoại nói một đằng và bảng hiện một nẻo.
     */
    chanFetch(() =>
      phanHoi(200, { ...XEM_TRUOC, companyPrice: '20000', threshold: null, thresholdRate2: null }),
    );
    moHopThoai();
    await chonSanPham();
    await goGia('17531');

    await waitFor(() => expect(document.querySelector('.xem-truoc-dong')).not.toBeNull());
    expect(o('Tỷ lệ CK').textContent).toBe('12,35%');
    expect(o('Tỷ lệ CK').textContent).not.toBe('12,34%');
  });

  it('vượt ngưỡng tô ĐÚNG lớp mà bảng dùng', async () => {
    // Cùng lớp thì cùng màu. Một lớp riêng ở đây là để hai chỗ tô hai màu cho
    // cùng một chuyện, và bảng dùng `--mau-loi` chứ không phải màu cảnh báo.
    chanFetch(() =>
      phanHoi(200, { ...XEM_TRUOC, companyPrice: '100000', threshold: '12.00', thresholdRate2: 1200 }),
    );
    moHopThoai();
    await chonSanPham();
    await goGia('85000');

    await waitFor(() => expect(o('Tỷ lệ CK').textContent).toBe('15,00%'));
    expect(o('Tỷ lệ CK').className).toContain('ty-le');
    expect(o('Tỷ lệ CK').className).toContain('vuot');
  });

  it('DƯỚI ngưỡng thì KHÔNG tô', async () => {
    // Chiều đối chiếu: thiếu nó thì tô cứng lớp `vuot` cho mọi dòng vẫn xanh.
    chanFetch(() =>
      phanHoi(200, { ...XEM_TRUOC, companyPrice: '100000', threshold: '30.00', thresholdRate2: 3000 }),
    );
    moHopThoai();
    await chonSanPham();
    await goGia('85000');

    await waitFor(() => expect(o('Tỷ lệ CK').textContent).toBe('15,00%'));
    expect(o('Tỷ lệ CK').className).not.toContain('vuot');
  });

  it('QĐCK bày NGƯỠNG, mã quy định lui vào `title` — đúng quy ước cột QĐCK', async () => {
    chanFetch(() => phanHoi(200, { ...XEM_TRUOC, companyPrice: '100000' }));
    moHopThoai();
    await chonSanPham();
    await goGia('90000');

    await waitFor(() => expect(o('QĐCK').textContent).toBe('25,00%'));
    expect(o('QĐCK').getAttribute('title')).toBe('QD-01');
  });

  it('không quy định nào phủ thì ô QĐCK để TRỐNG, và tỷ lệ vẫn tính', async () => {
    // `computeLine` phải nhận ngưỡng VẮNG MẶT chứ không phải 0 — gửi 0 là mọi
    // dòng bị đánh dấu vượt ngưỡng.
    chanFetch(() =>
      phanHoi(200, {
        ...XEM_TRUOC,
        companyPrice: '100000',
        threshold: null,
        thresholdRate2: null,
        thresholdSource: 'KHONG_CO',
        ruleCode: null,
      }),
    );
    moHopThoai();
    await chonSanPham();
    await goGia('85000');

    await waitFor(() => expect(o('Tỷ lệ CK').textContent).toBe('15,00%'));
    expect(o('QĐCK').textContent).toBe('—');
    expect(o('Tỷ lệ CK').className).not.toContain('vuot');
  });

  it('đứng SAU các ô CPBH và TRƯỚC ô Ghi chú', async () => {
    // Nó là KẾT QUẢ của mọi ô phía trên, và ghi chú thì nói về kết quả ấy.
    chanFetch(() => phanHoi(200, { ...XEM_TRUOC, companyPrice: '100000' }));
    moHopThoai();
    await chonSanPham();
    await goGia('90000');

    const khoi = await waitFor(() => {
      const el = document.querySelector('.xem-truoc-dong');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const oCpbh = screen.getByLabelText(/CPBH 1/);
    const oGhiChu = screen.getByLabelText(/Ghi chú/);
    expect(oCpbh.compareDocumentPosition(khoi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(khoi.compareDocumentPosition(oGhiChu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/**
 * `0208` — Ô NHẬP NGÀY dạng `dd/mm/yyyy` (khách hàng chốt 20/09).
 *
 * Hộp thoại thêm dòng mang ô *Ngày áp dụng*, nên nó là chỗ dựng DOM thật rẻ
 * nhất để hỏi ba chuyện: ô là gì, gõ vào ra sao, và cái nút lịch.
 *
 * Ba hàm dịch lối viết có ca kiểm riêng ở `tests/http/ngay-nhap.test.ts`, kèm
 * phép đối chiếu với bộ kiểm của máy chủ.
 */
describe('`0208` ô nhập ngày trong hộp thoại thêm dòng', () => {
  const oNgay = () => screen.getByLabelText(/Ngày áp dụng/) as HTMLInputElement;

  it('là ô CHỮ, không phải ô ngày của trình duyệt, và mở ra đã đúng lối viết', async () => {
    /*
     * Đo trên Chromium thật: `<input type="date">` in ra `09/20/2026` kể cả khi
     * khai `lang="vi"`, vì nó đọc ngôn ngữ GIAO DIỆN của trình duyệt. Nên vế
     * `type` không phải chuyện phong cách — nó là cả bản sửa.
     */
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    expect(oNgay().type).toBe('text');
    expect(oNgay().placeholder).toBe('dd/mm/yyyy');
    // Mặc định là HÔM NAY (`0180`), và nó phải hiện ra đã ở lối viết Việt Nam.
    expect(oNgay().value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('gõ tám chữ số thì dấu gạch tự mọc ra', async () => {
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    const nguoi = userEvent.setup();
    await nguoi.clear(oNgay());
    await nguoi.type(oNgay(), '20092026');
    expect(oNgay().value).toBe('20/09/2026');
  });

  it('ngày KHÔNG CÓ THẬT thì chữ ở lại trong ô, nhưng nút Xác nhận xám', async () => {
    /*
     * Hai vế, và vế đầu là vế dễ làm sai: xoá chữ người dùng vừa gõ là họ không
     * biết mình gõ sai ở đâu. Chữ ở lại, còn giá trị gửi đi thì rỗng — nên phép
     * kiểm *bắt buộc* sẵn có (`thieuTruong`) làm nút xám mà không cần một câu
     * báo lỗi mới.
     *
     * `31/02` chứ không `99/99`: `new Date('2026-02-31')` KHÔNG ném lỗi, nó trôi
     * sang 03/03 (bẫy `0136`), nên đây là ngày mà một phép kiểm hời hợt nhận.
     */
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    const nguoi = userEvent.setup();
    await nguoi.clear(oNgay());
    await nguoi.type(oNgay(), '31022026');
    expect(oNgay().value).toBe('31/02/2026');
    expect((screen.getByRole('button', { name: /Xác nhận/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('nút lịch mở bộ chọn của trình duyệt — và VẮNG MẶT khi trình duyệt không có', async () => {
    /*
     * `showPicker` là thứ jsdom không có, nên trạng thái mặc định của bộ kiểm
     * chính là *"trình duyệt cũ"*: không có nút. Bày ra một cái nút bấm vào
     * không xảy ra gì thì tệ hơn hẳn là không có nút.
     */
    chanFetch(() => phanHoi(200, XEM_TRUOC));
    moHopThoai();
    await chonSanPham();
    expect(screen.queryByRole('button', { name: /Chọn ngày trên lịch/ })).toBeNull();
    cleanup();

    const mo = vi.fn();
    (HTMLInputElement.prototype as unknown as { showPicker: () => void }).showPicker = mo;
    try {
      chanFetch(() => phanHoi(200, XEM_TRUOC));
      moHopThoai();
      await chonSanPham();
      const nut = screen.getByRole('button', { name: /Chọn ngày trên lịch/ });
      await userEvent.setup().click(nut);
      expect(mo).toHaveBeenCalled();
    } finally {
      delete (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker;
    }
  });
});
