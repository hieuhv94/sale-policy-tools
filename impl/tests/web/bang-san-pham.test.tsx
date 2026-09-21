/**
 * @vitest-environment jsdom
 *
 * FE-03 · FE-05 · FE-28 — bảng dòng sản phẩm.
 *
 * jsdom KHÔNG áp dụng media query, nên các test này không đo được bố cục thật ở
 * từng bề ngang. Chúng kiểm thứ khác và quan trọng không kém: **cả ba cách bố
 * trí đều có mặt trong cùng một cây DOM, và không dữ liệu nào bị bỏ rơi.**
 * Kiểm hình học thật cần trình duyệt thật — xem phần "Còn nợ" của P7d.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BangSanPham,
  cotCho,
  lopTrangThai,
  soCotCpbh,
  type DongSanPham,
} from '@csbh/web/bang-san-pham';

/**
 * Dọn DOM sau mỗi test.
 *
 * `globals` đang tắt trong vitest.config nên testing-library KHÔNG tự đăng ký
 * bước dọn này. Thiếu nó thì các lần render chồng lên nhau trong cùng một tệp,
 * và lỗi hiện ra dưới dạng "tìm thấy nhiều phần tử" ở một test chẳng liên quan.
 */
afterEach(cleanup);

const dong = (p: Partial<DongSanPham> = {}): DongSanPham => ({
  id: 'd1',
  productId: 'sp-1',
  productCode: 'SP-01',
  productName: 'Nutricare Gold Đặc Biệt',
  companyPrice: '100000',
  wholesalePrice: '90000',
  cpbh: ['3000'],
  cpbhTotal: '3000',
  netPrice: '87000',
  discountRate: '13.00',
  threshold: '30.00',
  overThreshold: false,
  ...p,
});

/**
 * Đếm dấu hiệu TRONG PHẦN DỮ LIỆU, bỏ qua chú thích màu.
 *
 * Khối chú thích màu đã gỡ ở `0028` nên không còn chỗ nào ngoài bảng vẽ những
 * lớp ấy nữa. Giữ hàm này vì câu hỏi nó đặt ra vẫn đúng — "DÒNG NÀO mang dấu",
 * không phải "có dấu nào trên trang" — và vì bất kỳ khối chú thích nào thêm lại
 * sau này cũng sẽ dùng lại đúng những lớp ấy.
 */
const dauTrongDuLieu = (lop: string) =>
  document.querySelectorAll(`.bang-san-pham ${lop}, .the-san-pham ${lop}`);

describe('FE-05 hiện đủ mọi cột, không cột nào bị bỏ', () => {
  it('số cột khớp đúng dữ liệu', () => {
    const ds = [dong()];
    render(<BangSanPham dong={ds} />);
    const bang = screen.getByRole('table');
    const tieuDe = within(bang).getAllByRole('columnheader');
    expect(tieuDe.map((t) => t.textContent)).toEqual(cotCho(ds).map((c) => c.nhan));
  });

  it('mỗi khoản CPBH là một cột riêng, không gộp sẵn', () => {
    const ds = [dong({ cpbh: ['3000', '1000', '500'] })];
    render(<BangSanPham dong={ds} />);
    const bang = screen.getByRole('table');
    for (const n of ['CPBH 1', 'CPBH 2', 'CPBH 3']) {
      expect(within(bang).getByText(n)).toBeDefined();
    }
    expect(within(bang).queryByText('CPBH 4')).toBeNull();
  });

  it('SỐ CỘT lấy theo dòng NHIỀU KHOẢN NHẤT', () => {
    // Bảng phải có số cột đều nhau; dòng ít khoản hơn để ô trống.
    const ds = [dong({ id: 'a', cpbh: ['1000'] }), dong({ id: 'b', cpbh: ['1000', '2000', '300'] })];
    expect(soCotCpbh(ds)).toBe(3);
    render(<BangSanPham dong={ds} />);
    const bang = screen.getByRole('table');
    expect(within(bang).getByText('CPBH 3')).toBeDefined();
  });

  it('dòng ít khoản hơn để Ô TRỐNG, không phải số 0', () => {
    // Số 0 là một con số CÓ NGHĨA — "khoản này bằng không". Điền 0 vào chỗ không
    // có khoản nào là bịa ra một dữ kiện người dùng chưa từng nhập.
    const ds = [dong({ id: 'a', cpbh: ['1000'] }), dong({ id: 'b', cpbh: ['1000', '2000'] })];
    render(<BangSanPham dong={ds} />);
    const hang = screen.getAllByRole('row').find((r) => within(r).queryByText('SP-01') !== null);
    const o = within(hang as HTMLElement).getAllByRole('cell');
    // Ô CPBH 2 của dòng chỉ có một khoản: rỗng, không phải "0".
    expect(o.some((x) => x.textContent === '0')).toBe(false);
  });

  it('không dòng nào có khoản nào thì KHÔNG có cột CPBH ĐÁNH SỐ', () => {
    /*
     * `0056` — cột *CPBH* (tổng) là cột CỐ ĐỊNH, luôn có, như *Giá thu về*.
     * Nhãn của nó đổi *CPBH tổng* → *CPBH* ở `0172` cho khớp bản mềm.
     *
     * Chỉ các cột CPBH1…CPBHn mới sinh theo dữ liệu, và chúng biến mất khi
     * không dòng nào có khoản nào — bốn cột số 0 nói sai về một hồ sơ chẳng có
     * khoản chi phí nào.
     */
    const ds = [dong({ cpbh: [], cpbhTotal: '0', netPrice: '90000' })];
    expect(soCotCpbh(ds)).toBe(0);
    render(<BangSanPham dong={ds} />);
    const bang = within(screen.getByRole('table'));
    expect(bang.queryByText(/^CPBH \d/)).toBeNull();
    expect(bang.getByText('CPBH')).toBeDefined();
  });
});

describe('FE-03 dưới 640px thành thẻ, KHÔNG cột nào biến mất', () => {
  it('thẻ mang đủ mọi con số của dòng', () => {
    render(<BangSanPham dong={[dong()]} />);
    const the = document.querySelector('.the-san-pham .the');
    expect(the).not.toBeNull();
    const t = within(the as HTMLElement);
    // Bốn con số chính hiện thẳng.
    expect(t.getByText('100.000')).toBeDefined();
    expect(t.getByText('90.000')).toBeDefined();
    expect(t.getByText('87.000')).toBeDefined();
    expect(t.getByText(/13,00%/)).toBeDefined();
    // Mã và tên sản phẩm.
    expect(t.getByText('SP-01')).toBeDefined();
    expect(t.getByText('Nutricare Gold Đặc Biệt')).toBeDefined();
  });

  it('các ô CPBH gấp vào một dòng tổng, bấm mới mở', async () => {
    const nguoi = userEvent.setup();
    render(
      <BangSanPham dong={[dong({ cpbh: ['3000', '1000', '500', '250'], cpbhTotal: '4750' })]} />,
    );
    const the = document.querySelector('.the-san-pham .the') as HTMLElement;
    // Nhãn nút gấp cũng theo `0172`: *Tổng CPBH* → *CPBH*, một tên cho cả ba chỗ.
    const nut = within(the).getByRole('button', { name: /CPBH/ });

    expect(nut.getAttribute('aria-expanded')).toBe('false');
    expect(within(the).queryByText('CPBH 3')).toBeNull();

    await nguoi.click(nut);
    expect(nut.getAttribute('aria-expanded')).toBe('true');
    // Mở ra thì có ĐỦ BỐN ô — gấp lại là để đỡ chật, không phải để bỏ bớt.
    for (const n of ['CPBH 1', 'CPBH 2', 'CPBH 3', 'CPBH 4']) {
      expect(within(the).getByText(n)).toBeDefined();
    }
    expect(within(the).getByText('500')).toBeDefined();
  });
});

/**
 * FE-28 sau `0028` — dấu `!` và hình thoi `◆` đã gỡ, nhưng luật thì không.
 *
 * Vật mang tin đổi chứ không mất: dấu `?` là ký hiệu nhìn thấy được, hiện đúng ở
 * dòng có màu và biến mất ở dòng thường; câu cho trình đọc màn hình giữ nguyên.
 */
describe('FE-28 dấu hiệu vượt ngưỡng không chỉ dựa vào màu', () => {
  it('có cả dấu hiệu hình và chữ cho trình đọc màn hình', () => {
    render(<BangSanPham dong={[dong({ overThreshold: true, discountRate: '35.00' })]} />);
    // Chữ: đọc được bằng trình đọc màn hình và bằng người mù màu đỏ-lục.
    expect(screen.getAllByText(/vượt ngưỡng 30,00%/).length).toBeGreaterThan(0);
    // Dấu hình, tách khỏi màu.
    expect(dauTrongDuLieu('.dau-hoi').length).toBeGreaterThan(0);
  });

  it('dòng không vượt thì không có dấu nào', () => {
    render(<BangSanPham dong={[dong({ overThreshold: false })]} />);
    expect(dauTrongDuLieu('.dau-hoi')).toHaveLength(0);
    expect(screen.queryByText(/vượt ngưỡng/)).toBeNull();
  });

  it('0028 KHÔNG còn dấu ! và hình thoi ◆ ở bất kỳ đâu trên trang', () => {
    render(
      <BangSanPham dong={[dong({ overThreshold: true, thresholdSource: 'KHONG_CO' })]} />,
    );
    expect(document.querySelectorAll('.dau-vuot')).toHaveLength(0);
    expect(document.querySelectorAll('.dau-mac-dinh')).toHaveLength(0);
    // Kiểm cả ký tự thật, không chỉ lớp CSS: đổi lớp mà giữ ký tự thì test cũ
    // xanh còn màn hình thì vẫn y nguyên.
    expect(document.body.textContent).not.toContain('◆');
  });
});

describe('sửa một dòng đã có', () => {
  it('không truyền `suaDong` thì KHÔNG có nút Sửa', () => {
    // Hồ sơ đã gửi duyệt thì không sửa được; bày nút ra là mời người dùng bấm
    // vào một thứ máy chủ chắc chắn từ chối.
    render(<BangSanPham dong={[dong()]} />);
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
  });

  it('truyền `suaDong` thì trả về ĐÚNG dòng được bấm', async () => {
    const nguoi = userEvent.setup();
    const sua = vi.fn();
    const ds = [dong({ id: 'a', productCode: 'SP-A' }), dong({ id: 'b', productCode: 'SP-B' })];
    render(<BangSanPham dong={ds} suaDong={sua} />);

    // Hai bố cục cùng nằm trong một cây DOM nên mỗi dòng có HAI nút Sửa; cả hai
    // phải trỏ về cùng một dòng.
    const bang = screen.getByRole('table');
    const hang = within(bang)
      .getAllByRole('row')
      .find((r) => within(r).queryByText('SP-B') !== null);
    await nguoi.click(within(hang as HTMLElement).getByRole('button', { name: 'Sửa' }));
    expect(sua).toHaveBeenCalledWith(ds[1]);
  });

  it('sửa và xoá đứng cạnh nhau, không thay chỗ nhau', async () => {
    render(<BangSanPham dong={[dong()]} suaDong={() => undefined} xoaDong={() => undefined} />);
    const bang = screen.getByRole('table');
    expect(within(bang).getAllByRole('button', { name: 'Sửa' }).length).toBeGreaterThan(0);
    expect(within(bang).getAllByRole('button', { name: 'Xoá' }).length).toBeGreaterThan(0);
  });

  it('`0124` hai nút nằm trong CÙNG MỘT khối không cho xuống dòng', () => {
    /*
     * jsdom không tính bố cục, nên không đo được "chúng có cùng một hàng không".
     * Thứ đo được — và cũng là thứ quyết định — là hai nút thuộc cùng một khối
     * flex, và khối ấy mang lớp cấm xuống dòng.
     *
     * Luật CSS đi kèm nằm ở `nguon-giao-dien.test.ts`; thiếu một trong hai thì
     * hoặc nút bị tách khối, hoặc lớp thành mã chết.
     */
    render(<BangSanPham dong={[dong()]} suaDong={() => undefined} xoaDong={() => undefined} />);
    const bang = screen.getByRole('table');
    const nutSua = within(bang).getAllByRole('button', { name: 'Sửa' })[0]!;
    const nutXoa = within(bang).getAllByRole('button', { name: 'Xoá' })[0]!;

    expect(nutSua.parentElement).toBe(nutXoa.parentElement);
    expect(nutSua.parentElement?.className).toContain('nhom-nut-hang');
  });
});

describe('FE-36 hồ sơ chưa có dòng nào', () => {
  it('nói việc cần làm tiếp, không phải bảng rỗng không lời', () => {
    render(<BangSanPham dong={[]} />);
    expect(screen.getByText(/Thêm sản phẩm/)).toBeDefined();
  });
});

/**
 * 0022 — dòng rơi về ngưỡng mặc định của sản phẩm.
 *
 * Không phải lỗi, nhưng người duyệt cần biết: con số ngưỡng ấy không đến từ
 * chính sách chiết khấu đã ban hành mà từ ô mặc định khai trong danh mục.
 */
describe('0022 dấu hiệu "chưa có quy định chiết khấu"', () => {
  it('tô CON SỐ tỷ lệ cho dòng PRODUCT_DEFAULT, ở cả bảng lẫn thẻ', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'PRODUCT_DEFAULT' })]} />);
    expect(dauTrongDuLieu('.ty-le.thieu')).toHaveLength(2);
  });

  it('KHÔNG tô gì khi ngưỡng đến từ một quy định', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'RULE' })]} />);
    expect(dauTrongDuLieu('.ty-le.thieu')).toHaveLength(0);
    expect(dauTrongDuLieu('.dau-hoi')).toHaveLength(0);
  });

  it('KHÔNG tô gì cho dòng lập trước 0022 — nguồn null là "không rõ"', () => {
    // Tô vàng hàng loạt dòng cũ chỉ vì thiếu dữ liệu là báo động giả, và báo
    // động giả hàng loạt thì lần sau không ai nhìn màu vàng nữa.
    render(<BangSanPham dong={[dong({ thresholdSource: null })]} />);
    expect(dauTrongDuLieu('.ty-le.thieu')).toHaveLength(0);
  });

  it('FE-28 dấu hiệu KHÔNG chỉ là màu — có ký hiệu và có câu cho trình đọc', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'PRODUCT_DEFAULT' })]} />);
    expect(dauTrongDuLieu('.dau-hoi').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/chưa có quy định chiết khấu nào áp dụng/).length)
      .toBeGreaterThan(0);
  });

  it('vừa vượt ngưỡng vừa thiếu quy định: con số ĐỎ, dấu thiếu quy định vẫn còn', () => {
    // Một con số chỉ mang được một màu. Vượt ngưỡng thắng vì nó là thứ người
    // duyệt phải xử lý; nguồn ngưỡng thì vẫn nói được bằng ký hiệu, ngoài màu.
    render(
      <BangSanPham
        dong={[dong({ overThreshold: true, thresholdSource: 'PRODUCT_DEFAULT' })]}
      />,
    );
    expect(dauTrongDuLieu('.ty-le.vuot')).toHaveLength(2);
    expect(dauTrongDuLieu('.ty-le.thieu')).toHaveLength(0);
    // Màu chỉ nói được MỘT trong hai; dấu `?` nói cả hai.
    const t = (dauTrongDuLieu('.dau-hoi')[0] as HTMLElement).getAttribute('title') ?? '';
    expect(t).toContain('Vượt ngưỡng');
    expect(t).toContain('Không tìm thấy quy định chiết khấu');
  });
});

describe('0028 khối chú thích màu đã gỡ', () => {
  it('không còn khối chú thích nào dưới bảng', () => {
    // Nó chiếm bốn dòng chữ dưới MỌI hồ sơ, kể cả hồ sơ không có dòng nào mang
    // màu. Lời giải thích chuyển vào dấu `?` cạnh chính con số có màu.
    render(<BangSanPham dong={[dong({ overThreshold: true })]} />);
    expect(document.querySelector('.chu-thich-mau')).toBeNull();
    expect(document.querySelectorAll('.o-mau')).toHaveLength(0);
  });

  it('nhưng lý do thì vẫn đọc được — trên chính dấu ?', () => {
    render(<BangSanPham dong={[dong({ overThreshold: true })]} />);
    const nut = dauTrongDuLieu('.dau-hoi')[0] as HTMLElement;
    expect(nut.getAttribute('title')).toContain('Vượt ngưỡng');
  });
});

/**
 * 0023 — sản phẩm không có ngưỡng nào, và cột QĐCK.
 */
describe('0023 nguồn ngưỡng thứ ba và cột QĐCK', () => {
  it('KHONG_CO cũng tô vàng — cùng một chuyện: không quy định nào phủ', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'KHONG_CO', threshold: null })]} />);
    expect(dauTrongDuLieu('.ty-le.thieu')).toHaveLength(2);
    expect(dauTrongDuLieu('.dau-hoi').length).toBeGreaterThan(0);
  });

  it('KHONG_CO nói RÕ là không có cả ngưỡng mặc định', () => {
    // Cùng một màu vàng nhưng hai câu khác nhau: rơi về mặc định là còn một con số
    // để đối chiếu, không có ngưỡng nào thì không. Người dùng trình đọc màn hình
    // không thấy được khác biệt ấy qua màu.
    render(<BangSanPham dong={[dong({ thresholdSource: 'KHONG_CO', threshold: null })]} />);
    expect(screen.getAllByText(/cũng không có ngưỡng mặc định/).length).toBeGreaterThan(0);
  });

  it('không ngưỡng thì KHÔNG bị đánh dấu vượt ngưỡng', () => {
    render(
      <BangSanPham
        dong={[dong({ thresholdSource: 'KHONG_CO', threshold: null, overThreshold: false })]}
      />,
    );
    expect(dauTrongDuLieu('.ty-le.vuot')).toHaveLength(0);
  });

  it('`0180` cột QĐCK hiện NGƯỠNG PHẦN TRĂM, mã nằm trong dấu ?', () => {
    /*
     * Khách hàng chốt 07/09: *"nội dung của cột QĐCK hiển thị số phần trăm chứ
     * không hiển thị tên QĐCK, để dấu ? nhỏ bên cạnh để khi người dùng di chuột
     * vào sẽ hiện tên QĐCK"*.
     *
     * Ca canh CẢ HAI vế. Chỉ canh vế đầu thì một bản sửa bỏ luôn mã đi vẫn xanh,
     * mà mã là đường tra ngược sang màn hình Chiết khấu — bỏ nó là bỏ công dụng
     * còn lại của cột.
     */
    const ds = [dong({ thresholdSource: 'RULE', ruleCode: 'CK-SUA-L1', threshold: '12.00' })];
    render(<BangSanPham dong={ds} />);
    const bang = screen.getByRole('table');
    expect(within(bang).getByText('QĐCK')).toBeDefined();

    const cot = cotCho(ds).findIndex((c) => c.khoa === 'ruleCode');
    const hang = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByText('SP-01') !== null) as HTMLElement;
    const o = within(hang).getAllByRole('cell')[cot - 1] as HTMLElement;
    // Ngưỡng, đúng cách viết phần trăm của cả bảng.
    expect(o.textContent).toContain('12,00%');
    // Mã KHÔNG còn là chữ nhìn thấy được...
    expect(o.textContent).not.toContain('CK-SUA-L1');
    // ...nhưng đọc được từ dấu `?`, và bằng CẢ HAI đường (chuột và trình đọc
    // màn hình) — `title` một mình không tới được người dùng bàn phím (`0027`).
    const nut = o.querySelector('.dau-hoi') as HTMLElement;
    expect(nut, 'ô QĐCK không có dấu ?').not.toBeNull();
    expect(nut.getAttribute('title')).toContain('CK-SUA-L1');
    expect(nut.getAttribute('aria-label')).toContain('CK-SUA-L1');
  });

  it('không có quy định thì ô QĐCK để TRỐNG', () => {
    const ds = [dong({ thresholdSource: 'PRODUCT_DEFAULT', ruleCode: null })];
    render(<BangSanPham dong={ds} />);
    const hang = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByText('SP-01') !== null) as HTMLElement;
    // Đếm từ đầu theo VỊ TRÍ CỘT, không lấy ô cuối: cột QĐCK không còn đứng
    // cuối từ khi có cột Ghi chú (0027).
    const cot = cotCho(ds).findIndex((c) => c.khoa === 'ruleCode');
    expect(within(hang).getAllByRole('cell')[cot - 1]?.textContent).toBe('');
  });

  it('cột QĐCK nằm trong danh sách cột chuẩn, không phải cột lén thêm', () => {
    // `cotCho()` là nguồn duy nhất cho tiêu đề bảng và cho test bố cục; thêm ô
    // vào `<tr>` mà quên khai ở đây thì bảng lệch cột mà không test nào bắt.
    const ds = [dong()];
    expect(cotCho(ds).map((c) => c.nhan)).toContain('QĐCK');
    render(<BangSanPham dong={ds} />);
    const bang = screen.getByRole('table');
    expect(within(bang).getAllByRole('columnheader').map((t) => t.textContent)).toEqual(
      cotCho(ds).map((c) => c.nhan),
    );
  });

  it('bố trí THẺ chỉ hiện QĐCK khi có', () => {
    render(<BangSanPham dong={[dong({ ruleCode: null })]} />);
    const the = document.querySelector('.the-san-pham .the') as HTMLElement;
    expect(within(the).queryByText('QĐCK')).toBeNull();

    cleanup();
    render(<BangSanPham dong={[dong({ ruleCode: 'q-123', threshold: '9.50' })]} />);
    const the2 = document.querySelector('.the-san-pham .the') as HTMLElement;
    expect(within(the2).getByText('QĐCK')).toBeDefined();
    // `0180` — trên thẻ cũng là NGƯỠNG, mã đi vào dấu `?`. Bố cục điện thoại
    // dùng chung `OQuyDinh` với bảng, và ca này canh cho nó không tách đôi.
    const o = within(the2).getByText('QĐCK').parentElement as HTMLElement;
    expect(o.textContent).toContain('9,50%');
    expect(
      (o.querySelector('.dau-hoi') as HTMLElement | null)?.getAttribute('title'),
    ).toContain('q-123');
  });
});


/**
 * 0027 — màu chỉ nằm trên CON SỐ, và dấu `?` nói vì sao.
 *
 * Trước 0027 cả dòng đổi nền. Nền phủ lên Giá bán Công ty và các khoản CPBH,
 * những con số hoàn toàn bình thường; thứ duy nhất đáng ngờ là tỷ lệ chiết khấu.
 */
describe('0027 màu chỉ trên con số tỷ lệ', () => {
  it('KHÔNG dòng nào và KHÔNG thẻ nào mang nền cảnh báo nữa', () => {
    render(
      <BangSanPham dong={[dong({ overThreshold: true, thresholdSource: 'KHONG_CO' })]} />,
    );
    expect(document.querySelectorAll('tr.vuot-nguong')).toHaveLength(0);
    expect(document.querySelectorAll('.the.vuot-nguong')).toHaveLength(0);
    expect(document.querySelectorAll('tr.thieu-quy-dinh')).toHaveLength(0);
    expect(document.querySelectorAll('.the.thieu-quy-dinh')).toHaveLength(0);
  });

  it('màu nằm đúng trên ô Tỷ lệ CK, không lan sang ô nào khác', () => {
    render(<BangSanPham dong={[dong({ overThreshold: true })]} />);
    const hang = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByText('SP-01') !== null) as HTMLElement;
    const mang = within(hang)
      .getAllByRole('cell')
      .filter((o) => o.querySelector('.ty-le.vuot') !== null);
    expect(mang).toHaveLength(1);
    expect(mang[0]?.textContent).toContain('%');
  });
});

describe('0027 dấu ? giải thích lý do', () => {
  it('vượt ngưỡng: lời giải thích nêu cả tỷ lệ lẫn ngưỡng', () => {
    render(<BangSanPham dong={[dong({ overThreshold: true, discountRate: '40.00' })]} />);
    const nut = dauTrongDuLieu('.dau-hoi')[0] as HTMLElement;
    expect(nut).toBeDefined();
    // `title` cho chuột, `aria-label` cho trình đọc màn hình và người dùng Tab —
    // cùng một câu, vì một dấu hỏi chỉ trả lời được cho người có chuột là một
    // dấu hỏi hỏng với phần còn lại.
    expect(nut.getAttribute('title')).toContain('Vượt ngưỡng');
    expect(nut.getAttribute('title')).toContain('40,00%');
    expect(nut.getAttribute('title')).toContain('30,00%');
    expect(nut.getAttribute('aria-label')).toBe(nut.getAttribute('title'));
  });

  it('không có quy định: lời giải thích nói KHÔNG TÌM THẤY quy định nào', () => {
    render(
      <BangSanPham dong={[dong({ thresholdSource: 'KHONG_CO', threshold: null })]} />,
    );
    const nut = dauTrongDuLieu('.dau-hoi')[0] as HTMLElement;
    expect(nut.getAttribute('title')).toContain('Không tìm thấy quy định chiết khấu');
  });

  it('cả hai lý do cùng đúng thì nói CẢ HAI, không chọn một', () => {
    render(
      <BangSanPham
        dong={[dong({ overThreshold: true, thresholdSource: 'PRODUCT_DEFAULT' })]}
      />,
    );
    const t = (dauTrongDuLieu('.dau-hoi')[0] as HTMLElement).getAttribute('title') ?? '';
    expect(t).toContain('Vượt ngưỡng');
    expect(t).toContain('Không tìm thấy quy định chiết khấu');
  });

  it('dòng bình thường KHÔNG có dấu ? — không có gì để hỏi', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'RULE' })]} />);
    expect(dauTrongDuLieu('.dau-hoi')).toHaveLength(0);
  });

  it('là NÚT thật nên bấm và Tab tới được, không phải span trơ', () => {
    render(<BangSanPham dong={[dong({ overThreshold: true })]} />);
    const nut = dauTrongDuLieu('.dau-hoi')[0] as HTMLElement;
    expect(nut.tagName).toBe('BUTTON');
    // `type="button"` — thiếu nó thì trong một <form> nút này gửi biểu mẫu.
    expect(nut.getAttribute('type')).toBe('button');
  });
});

/**
 * 0027 — cột Ghi chú.
 */
describe('0027 cột Ghi chú của dòng sản phẩm', () => {
  it('nằm trong danh sách cột chuẩn và đứng CUỐI', () => {
    const ds = [dong()];
    const nhan = cotCho(ds).map((c) => c.nhan);
    expect(nhan.at(-1)).toBe('Ghi chú');
    render(<BangSanPham dong={ds} />);
    const bang = screen.getByRole('table');
    expect(within(bang).getAllByRole('columnheader').map((t) => t.textContent)).toEqual(nhan);
  });

  it('hiện nguyên văn ghi chú trong bảng', () => {
    render(<BangSanPham dong={[dong({ note: 'Giá theo thoả thuận tháng 8' })]} />);
    const bang = screen.getByRole('table');
    expect(within(bang).getByText('Giá theo thoả thuận tháng 8')).toBeDefined();
  });

  it('không có ghi chú thì ô để TRỐNG, không phải dấu gạch', () => {
    const ds = [dong({ note: null })];
    render(<BangSanPham dong={ds} />);
    const hang = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByText('SP-01') !== null) as HTMLElement;
    expect(within(hang).getAllByRole('cell').at(-1)?.textContent).toBe('');
  });

  it('bố trí THẺ chỉ hiện Ghi chú khi có', () => {
    render(<BangSanPham dong={[dong({ note: null })]} />);
    const the = document.querySelector('.the-san-pham .the') as HTMLElement;
    expect(within(the).queryByText('Ghi chú')).toBeNull();

    cleanup();
    render(<BangSanPham dong={[dong({ note: 'Đóng thùng 12' })]} />);
    const the2 = document.querySelector('.the-san-pham .the') as HTMLElement;
    expect(within(the2).getByText('Ghi chú')).toBeDefined();
    expect(within(the2).getByText('Đóng thùng 12')).toBeDefined();
  });
});

/**
 * `0186` — DÒNG ĐÃ RÚT: làm mờ, còn đọc được, và chỉ còn một nút.
 *
 * Khách hàng chốt 08/09: xoá một mặt hàng thừa kế thì dòng *"chưa bị xoá khỏi
 * bảng ngay, mà chỉ bị làm mờ và chuyển sang trạng thái đã xoá"*.
 *
 * Ba ca dưới đây canh ba vế KHÁC NHAU của cùng một yêu cầu, và bỏ vế nào thì
 * hai vế kia vẫn xanh với đúng thứ đang hỏng: dòng phải CÒN ĐÓ, phải MANG DẤU
 * nhìn thấy được, và phải đổi hẳn dải nút — bày *Xoá* trên một dòng đã xoá là
 * bày một cái nút chỉ để nhận về `LINE_NOT_FOUND`.
 */
describe('`0186` dòng sản phẩm đã rút khỏi phiên bản mới', () => {
  const daXoa = dong({ id: 'd2', productId: 'sp-2', productCode: 'SP-02', trangThai: 'DA_XOA' });
  const conSong = dong({ trangThai: 'DANG_AP_DUNG' });

  it('vẫn nằm trong bảng và vẫn đọc được mọi con số của nó', () => {
    render(<BangSanPham dong={[conSong, daXoa]} />);
    const bang = screen.getByRole('table');
    // Không phải "có mặt trong DOM" — phải là một HÀNG của bảng, cạnh dòng kia.
    expect(within(bang).getByText('SP-02')).toBeDefined();
    expect(within(bang).getAllByText('Đã xoá').length).toBeGreaterThan(0);
  });

  it('mang lớp làm mờ, và CHỈ dòng ấy', () => {
    render(<BangSanPham dong={[conSong, daXoa]} />);
    const hang = screen
      .getAllByRole('row')
      .filter((r) => r.classList.contains('dong-da-xoa'));
    expect(hang).toHaveLength(1);
    expect(within(hang[0] as HTMLElement).getByText('SP-02')).toBeDefined();
  });

  it('bày *Thêm lại* thay cho *Sửa* và *Xoá*', async () => {
    const themLai = vi.fn();
    const xoa = vi.fn();
    render(
      <BangSanPham
        dong={[conSong, daXoa]}
        xoaDong={xoa}
        suaDong={vi.fn()}
        themLaiDong={themLai}
      />,
    );
    const hang = screen
      .getAllByRole('row')
      .find((r) => r.classList.contains('dong-da-xoa')) as HTMLElement;

    expect(within(hang).queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(within(hang).queryByRole('button', { name: 'Sửa' })).toBeNull();
    await userEvent.click(within(hang).getByRole('button', { name: 'Thêm lại' }));
    expect(themLai).toHaveBeenCalledWith('d2');
    expect(xoa).not.toHaveBeenCalled();
  });

  it('dòng CÒN SỐNG không đổi gì — vẫn Sửa và Xoá', () => {
    render(
      <BangSanPham
        dong={[conSong, daXoa]}
        xoaDong={vi.fn()}
        suaDong={vi.fn()}
        themLaiDong={vi.fn()}
      />,
    );
    const hang = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByText('SP-01') !== null && r.tagName === 'TR') as HTMLElement;
    expect(within(hang).getByRole('button', { name: 'Xoá' })).toBeDefined();
    expect(within(hang).queryByRole('button', { name: 'Thêm lại' })).toBeNull();
  });
});

/**
 * `0124` — dải nút trong Ô BẢNG mang `.nhom-nut-hang`, ngoài bảng thì không.
 *
 * Ca này THAY phép quét mã nguồn ở `tests/web/nguon-giao-dien.test.ts` (`0186`):
 * lớp giờ do một biểu thức chọn ra nên không còn thuộc tính `className="…"` nào
 * để tìm, và quan trọng hơn — đọc DOM trả lời đúng câu hỏi ấy dù lớp được ghép
 * bằng cách nào.
 *
 * Vế NGƯỢC LẠI đi kèm và nó chính là điều `0124` chốt: `.nhom-nut-gon` dùng
 * chung với danh sách thẻ trên điện thoại, nơi xuống dòng là hành vi ĐÚNG, nên
 * lớp cấm-xuống-dòng chỉ được có mặt ở vế bảng.
 */
describe('`0124` lớp cấm xuống dòng chỉ ở dải nút trong ô bảng', () => {
  it('ô bảng có, thẻ điện thoại không', () => {
    render(<BangSanPham dong={[dong()]} xoaDong={vi.fn()} suaDong={vi.fn()} />);

    const oBang = document.querySelector('.bang-san-pham .nhom-nut') as HTMLElement;
    expect(oBang, 'không dựng ra dải nút nào trong bảng').not.toBeNull();
    expect(oBang.classList.contains('nhom-nut-hang')).toBe(true);

    const the = document.querySelector('.the-san-pham .nhom-nut') as HTMLElement;
    expect(the, 'không dựng ra dải nút nào trong thẻ').not.toBeNull();
    expect(the.classList.contains('nhom-nut-hang')).toBe(false);
  });
});

/**
 * `0188` — BỐN NHÃN TRẠNG THÁI, BỐN MÀU.
 *
 * Khách hàng chốt 08/09: *Đang áp dụng* xanh, *Đã xoá* xám — đảo lại `0180`.
 *
 * KHỐI NÀY CÓ MẶT VÌ MỘT LƯỢT PHÁ LẠI XANH. Lần đầu làm việc này (trong chặng
 * đã revert), hoàn tác bảng màu về đúng như `0180` mà **cả bộ kiểm vẫn xanh** —
 * màu của bốn nhãn chưa từng có ai canh, dù chúng là thứ người duyệt đọc lướt
 * để biết bản mới khác bản cũ ở đâu.
 *
 * Ca thứ hai là ca đáng giá nhất, và nó canh thứ khách hàng KHÔNG nêu: *Đang áp
 * dụng* lấy xanh thì *Bổ sung* buộc phải rời khỏi xanh. Đó là hệ quả, nên nó là
 * chỗ dễ mất nhất trong một lượt sửa màu về sau — và mất nó thì hai trạng thái
 * khác hẳn nhau trông giống hệt nhau, không gì đỏ.
 */
describe('`0188` bốn nhãn trạng thái dòng, bốn màu', () => {
  it('*Đang áp dụng* XANH, *Đã xoá* XÁM', () => {
    expect(lopTrangThai('DANG_AP_DUNG')).toContain('nhan-tot');
    expect(lopTrangThai('DA_XOA')).toContain('nhan-thuong');
  });

  it('không hai trạng thái nào dùng chung một màu', () => {
    const lop = ['BO_SUNG', 'CHINH_SUA', 'DANG_AP_DUNG', 'DA_XOA'].map(lopTrangThai);
    expect(new Set(lop).size, `hai nhãn trùng màu: ${lop.join(' · ')}`).toBe(4);
  });

  it('*Đã xoá* thôi mang màu LỖI — nó không phải một lỗi', () => {
    // `0186` cho nó màu đỏ vì lúc ấy nó là thứ mới và cần bắt mắt. Rút một mặt
    // hàng là một quyết định bình thường của người lập, không phải sự cố; màu đỏ
    // ở đó tranh chỗ với hai cảnh báo THẬT của cột Tỷ lệ CK.
    expect(lopTrangThai('DA_XOA')).not.toContain('nhan-loi');
  });

  it('màu ấy đến được tận DOM, không chỉ đúng trong hàm', () => {
    render(
      <BangSanPham
        dong={[
          dong({ id: 'd1', trangThai: 'DANG_AP_DUNG' }),
          dong({ id: 'd2', productCode: 'SP-02', trangThai: 'DA_XOA' }),
        ]}
      />,
    );
    const bang = screen.getByRole('table');
    expect(within(bang).getAllByText('Đang áp dụng')[0]!.className).toContain('nhan-tot');
    expect(within(bang).getAllByText('Đã xoá')[0]!.className).toContain('nhan-thuong');
  });
});


/**
 * `0215` — DẤU TAM GIÁC cạnh giá trị đã đổi (khách hàng chốt 21/09).
 *
 * *"Giá trị của cột nào bị thay đổi thì đặt bên cạnh giá trị đó dấu tam giác màu
 * xanh hướng lên nếu giá trị đó mới lớn hơn giá trị cũ, màu đỏ hướng xuống nếu
 * giá trị mới bé hơn. Khi người dùng di chuột vào vị trí dấu tam giác, sẽ hiện
 * ra giá trị trong phiên bản trước"*.
 *
 * Thay hẳn cơ chế của `0204`/`0213`/`0214` — bấm nhãn *Chỉnh sửa* để mở một hàng
 * *bản trước*. Những ca kiểm của ba chặng ấy vì thế bị THAY chứ không sửa số:
 * chúng khẳng định một cơ chế vừa được khách hàng bỏ đi, không phải một con số
 * vừa đổi.
 *
 * Dữ liệu vẫn đến từ máy chủ (`SQL_BAN_TRUOC_TRA_VE`), và giao diện vẫn KHÔNG
 * suy từ `trangThai === 'CHINH_SUA'` — nên mấy ca dưới đây dựng thẳng trường
 * `banTruoc` chứ không dựng một dòng "đã sửa" rồi mong nó tự có.
 */
describe('`0215` dấu tam giác cạnh giá trị đã đổi', () => {
  const banTruoc = {
    ngayApDung: '2026-08-01',
    companyPrice: '120000',
    wholesalePrice: '95000',
    cpbh: ['5000'],
    cpbhTotal: '5000',
    netPrice: '90000',
    discountRate: '25.00',
    threshold: '18.00',
    doi: ['companyPrice', 'wholesalePrice', 'netPrice', 'discountRate'],
  };

  /** Một dòng *Chỉnh sửa* có bản trước, giá trị mới THẤP HƠN ở cả bốn ô `doi`. */
  const dongSua = (b: unknown = banTruoc, p: Partial<DongSanPham> = {}): DongSanPham =>
    dong({ trangThai: 'CHINH_SUA', banTruoc: b, ...p } as Partial<DongSanPham>);

  /** Mọi dấu trong vế BẢNG, theo thứ tự cột. */
  const dauTrongBang = () => [...document.querySelectorAll('.bang-san-pham .dau-doi')];

  it('ĐÚNG những ô máy chủ báo đã đổi mới mang dấu — không hơn, không kém', () => {
    /*
     * CA ĐÁNG GIÁ NHẤT, và nó canh HAI chiều trong một phép so: đủ bốn ô, và
     * ĐÚNG bốn ô ấy. Một bản sửa rắc dấu lên mọi ô vẫn qua được một ca chỉ đếm.
     *
     * Neo vào `<thead>` chứ không vào chỉ số viết cứng: số cột CPBH co giãn theo
     * dữ liệu, nên một con số ở đây chỉ đúng cho đúng một bộ fixture (bài học
     * `0214`).
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const bang = screen.getByRole('table');
    const nhan = [...bang.querySelectorAll('thead th')].map((x) => x.textContent);
    const hang = bang.querySelector('tbody tr') as HTMLElement;
    const coDau = [...hang.children]
      .map((o, i) => (o.querySelector('.dau-doi') === null ? null : nhan[i]))
      .filter(Boolean);
    expect(coDau).toEqual(['Giá bán Công ty', 'Giá bán buôn', 'Giá thu về', 'Tỷ lệ CK']);
  });

  it('XANH HƯỚNG LÊN khi giá trị mới LỚN HƠN, ĐỎ HƯỚNG XUỐNG khi bé hơn', () => {
    /*
     * Hai chiều trong một ca, trên cùng một dòng: fixture có giá bán Công ty mới
     * THẤP hơn (100.000 < 120.000) và ngày áp dụng mới MUỘN hơn. Tách hai ca thì
     * một bản sửa trả cứng một chiều vẫn xanh được một nửa.
     *
     * Đọc LỚP chứ không đọc màu: jsdom không tính CSS, và lớp mới là thứ tệp
     * `app.css` gắn màu vào.
     */
    render(
      <BangSanPham
        dong={[
          dongSua(
            { ...banTruoc, ngayApDung: '2026-01-01', doi: ['ngayApDung', 'companyPrice'] },
            { ngayApDung: '2026-08-01' },
          ),
        ]}
      />,
    );
    const dau = dauTrongBang();
    expect(dau).toHaveLength(2);
    // Ngày áp dụng: 01/08/2026 muộn hơn 01/01/2026 → TĂNG.
    expect(dau[0]!.className, 'ngày muộn hơn phải là tam giác lên').toContain('dau-tang');
    expect(dau[0]!.textContent).toContain('▲');
    // Giá bán Công ty: 100.000 thấp hơn 120.000 → GIẢM.
    expect(dau[1]!.className, 'giá thấp hơn phải là tam giác xuống').toContain('dau-giam');
    expect(dau[1]!.textContent).toContain('▼');
  });

  it('giá trị CŨ đọc được bằng chuột, bằng bàn phím và bằng ngón tay', async () => {
    /*
     * Yêu cầu viết *"di chuột"*, mà `:hover` thì jsdom không đo được bằng gì cả
     * — và trên điện thoại nó cũng không tồn tại. Đó đúng là lý do dấu này là
     * một `<button>` chứ không một `<span title>` (`0027`): lượt BẤM là đường
     * thứ ba, và là đường duy nhất ca kiểm chạm tới được.
     *
     * Ô chữ có mặt sẵn trong DOM và chỉ ẩn bằng CSS, nên phép đo là LỚP `dau-mo`
     * chứ không phải sự có mặt của phần tử.
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const dau = dauTrongBang()[0]!;
    expect(dau.className).not.toContain('dau-mo');
    // Ô chữ có mặt sẵn, chỉ đang ẩn — nên nội dung của nó đo được ngay.
    expect(dau.querySelector('.gia-cu')!.textContent, 'giá bán Công ty cũ').toBe('120.000');

    await userEvent.click(dau);
    expect(dau.className, 'bấm rồi mà ô chữ không mở').toContain('dau-mo');
    await userEvent.click(dau);
    expect(dau.className, 'bấm lần nữa mà không đóng').not.toContain('dau-mo');
  });

  it('`0216` BẤM RA NGOÀI thì ô chữ đóng', async () => {
    /*
     * LỖI CỦA CHÍNH `0215`, người dùng tìm ra. Ô chữ hiện ra từ BA nguồn —
     * `:hover`, `:focus` và lớp `dau-mo` do state React. Bấm ra ngoài tắt được
     * hai nguồn đầu, còn `dau-mo` thì chỉ đảo khi bấm lại ĐÚNG cái dấu ấy, nên ô
     * chữ nằm lại trên bảng.
     *
     * Không lộ ra lúc thử bằng chuột vì hai nguồn kia tự đóng: chỉ khi đã BẤM
     * (đường dành cho cảm ứng) thì cái còn lại mới thấy được.
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const dau = dauTrongBang()[0]!;
    await userEvent.click(dau);
    expect(dau.className).toContain('dau-mo');

    await userEvent.click(screen.getByRole('table'));
    expect(dau.className, 'bấm ra ngoài mà ô chữ còn mở').not.toContain('dau-mo');
  });

  it('`0216` KHÔNG BAO GIỜ hai ô chữ cùng mở', async () => {
    /*
     * Hệ quả thứ hai của cùng một gốc, và nặng hơn: mỗi dấu giữ state RIÊNG —
     * chúng không loại trừ nhau như `dangMo` của `0204` vốn là một tập ở cấp
     * bảng. Nên bấm năm dấu là năm ô chữ cùng đè lên bảng.
     *
     * Ca *"bấm rồi bấm lại"* ở trên KHÔNG bắt được, vì nó chỉ đụng tới một dấu.
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const dau = dauTrongBang();
    expect(dau.length).toBeGreaterThan(1);

    await userEvent.click(dau[0]!);
    await userEvent.click(dau[1]!);
    expect(dau.filter((x) => x.className.includes('dau-mo'))).toHaveLength(1);
    expect(dau[1]!.className, 'dấu vừa bấm phải là dấu đang mở').toContain('dau-mo');
  });

  it('`0216` CHẠM RA NGOÀI mà tiêu điểm KHÔNG đổi thì vẫn đóng', async () => {
    /*
     * CA NÀY CÓ VÌ MỘT LƯỢT PHÁ LẠI XANH. Gỡ hẳn listener `pointerdown` mà cả 65
     * ca vẫn xanh — ba ca `0216` kia đều đi qua `onBlur`, nên lớp thứ hai không
     * ai canh.
     *
     * Lớp ấy tồn tại vì một tình huống `onBlur` KHÔNG với tới: trên iOS Safari
     * một cú chạm không phải lúc nào cũng trao tiêu điểm cho `<button>`, mà nút
     * chưa từng nhận tiêu điểm thì nó cũng không bao giờ mất — và đường bấm lại
     * đúng là đường dành cho cảm ứng.
     *
     * Dựng lại đúng hình ấy: bắn thẳng một `pointerdown` ở chỗ khác, KHÔNG đụng
     * tới tiêu điểm. `userEvent.click` không làm được vì nó luôn kéo theo lượt
     * đổi tiêu điểm, tức luôn đi qua `onBlur`.
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const dau = dauTrongBang()[0]!;
    await userEvent.click(dau);
    expect(dau.className).toContain('dau-mo');

    const truoc = document.activeElement;
    // `act` vì sự kiện này bắn NGOÀI hệ sự kiện của React: lượt `setState` từ
    // một listener cấp tài liệu không được vẽ lại ngay, nên đọc `className`
    // thẳng sau đó là đọc lần vẽ CŨ.
    act(() => {
      screen.getByRole('table').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(document.activeElement, 'ca này phải KHÔNG đổi tiêu điểm').toBe(truoc);
    expect(dau.className, 'chạm ra ngoài mà ô chữ còn mở').not.toContain('dau-mo');
  });

  it('`0216` chạm vào CHÍNH cái dấu thì listener đứng ngoài', async () => {
    /*
     * Vế `contains`. Thiếu nó thì một lượt bấm đi HAI bước ngược nhau —
     * `pointerdown` đóng, rồi `click` lật lại thành mở — và cái dấu thành một
     * nút không bao giờ tắt được, đúng cái lỗi lượt này sinh ra để sửa.
     *
     * Đo bằng cách bắn `pointerdown` lên chính cái dấu, không kèm `click`: nó
     * phải KHÔNG đổi gì cả.
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const dau = dauTrongBang()[0]!;
    await userEvent.click(dau);

    act(() => {
      dau.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(dau.className, 'listener nuốt mất cú chạm của chính cái dấu').toContain('dau-mo');
  });

  it('`0216` TAB ĐI cũng đóng — không để lại ô chữ sau lưng', async () => {
    // Cùng một `onBlur` lo cả ba đường; ca này canh riêng đường bàn phím vì nó
    // là đường DUY NHẤT không đi qua `pointerdown`.
    render(<BangSanPham dong={[dongSua()]} />);
    const dau = dauTrongBang()[0]!;
    await userEvent.click(dau);
    expect(dau.className).toContain('dau-mo');

    await userEvent.tab();
    expect(dau.className, 'Tab đi mà ô chữ còn mở').not.toContain('dau-mo');
  });

  it('câu cho trình đọc màn hình nói ĐỦ BA VẾ: tên cột, giá trị cũ, chiều', () => {
    /*
     * FE-28 — không bao giờ chỉ dùng màu. Hình ▲/▼ lo cho người nhìn được;
     * `aria-label` lo cho người không nhìn, và nó phải tự đủ nghĩa: một nhãn chỉ
     * có *"120.000"* thì người dùng nghe được một con số không biết của cột nào.
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const cau = dauTrongBang()[0]!.getAttribute('aria-label') ?? '';
    expect(cau).toContain('Giá bán Công ty');
    expect(cau).toContain('120.000');
    expect(cau).toContain('thấp hơn');
  });

  it('TÊN CỘT trong câu ấy LÀ tiêu đề cột của chính bảng', () => {
    // Không phải một danh sách chữ thứ hai gõ tay (`0204`): người đọc đang ở
    // ngay cạnh hàng tiêu đề, và hai chữ khác nhau cho cùng một ô bắt họ tự ghép.
    render(<BangSanPham dong={[dongSua()]} />);
    const bang = screen.getByRole('table');
    const nhan = [...bang.querySelectorAll('thead th')].map((x) => x.textContent);
    for (const dau of dauTrongBang()) {
      const ten = (dau.getAttribute('aria-label') ?? '').split(' ở phiên bản trước')[0];
      expect(nhan, `"${ten}" không phải tên cột nào`).toContain(ten);
    }
  });

  it('KHOẢN CPBH: chỉ khoản THẬT SỰ đổi mới mang dấu', () => {
    /*
     * Máy chủ chỉ nói được *"mảng `cpbh` đã đổi"* — nó so cả cột một lượt. Dải
     * cột thì mỗi khoản một ô, nên khoản nào đổi là câu chỉ giao diện trả lời
     * được, và đây là chỗ duy nhất nó được phép so hai bên.
     *
     * Fixture: khoản 1 giữ nguyên, khoản 2 mới xuất hiện.
     */
    render(
      <BangSanPham
        dong={[
          dongSua(
            { ...banTruoc, cpbh: ['3000'], cpbhTotal: '3000', doi: ['cpbh', 'cpbhTotal'] },
            { cpbh: ['3000', '2000'], cpbhTotal: '5000' },
          ),
        ]}
      />,
    );
    const bang = screen.getByRole('table');
    const nhan = [...bang.querySelectorAll('thead th')].map((x) => x.textContent);
    const hang = bang.querySelector('tbody tr') as HTMLElement;
    const coDau = [...hang.children]
      .map((o, i) => (o.querySelector('.dau-doi') === null ? null : nhan[i]))
      .filter(Boolean);
    expect(coDau, 'khoản không đổi mà vẫn mang dấu').toEqual(['CPBH', 'CPBH 2']);
  });

  it('khoản CHỈ CÓ ở một bản thì dấu KHÔNG phải tam giác', () => {
    /*
     * `khac` là câu trả lời THẬT, không phải một nhánh lỗi: một khoản vừa có giá
     * trị từ chỗ trống đã đổi mà không lớn hơn hay bé hơn cái gì cả. Bịa cho nó
     * một chiều là nói sai ở đúng chỗ người duyệt đang đọc để quyết định.
     */
    render(
      <BangSanPham
        dong={[
          dongSua(
            { ...banTruoc, cpbh: ['3000'], doi: ['cpbh'] },
            { cpbh: ['3000', '2000'] },
          ),
        ]}
      />,
    );
    const dau = dauTrongBang()[0]!;
    expect(dau.className).toContain('dau-khac');
    expect(dau.textContent, 'không được là tam giác').not.toContain('▲');
    expect(dau.textContent).not.toContain('▼');
  });

  it('dòng KHÔNG có bản trước thì KHÔNG dấu nào, và nhãn KHÔNG phải nút', () => {
    /*
     * Hai vế của cùng một chuyện. Vế nhãn là thứ `0215` vừa gỡ: `0204` biến nó
     * thành nút để mở bảng, và giữ cái nút ấy lại là để nó mở một thứ không còn
     * tồn tại.
     *
     * Dòng dưới đây MANG nhãn *Chỉnh sửa* mà máy chủ không gửi bản trước nào —
     * đó là vế canh việc giao diện đọc `banTruoc` chứ không đọc `trangThai`.
     */
    render(<BangSanPham dong={[dong({ trangThai: 'CHINH_SUA' })]} />);
    expect(dauTrongBang(), 'không có bản trước mà vẫn có dấu').toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Chỉnh sửa/ })).toBeNull();
    expect(screen.getAllByText('Chỉnh sửa').length).toBeGreaterThan(0);
  });

  it('máy chủ KHÔNG gửi danh sách `doi` thì không dấu nào, bảng vẫn dựng', () => {
    // `oDaDoi` đọc bằng `Array.isArray` chứ không tin khai báo kiểu — thiếu nó
    // thì `.includes` ném ngay lúc dựng và React tháo cả cây.
    const { doi: _bo, ...khongDoi } = banTruoc;
    render(<BangSanPham dong={[dongSua(khongDoi)]} />);
    expect(dauTrongBang()).toHaveLength(0);
    expect(screen.getByRole('table')).toBeDefined();
  });

  it('máy chủ cũ gửi `banTruoc` KHÔNG phải đối tượng thì bảng vẫn dựng', () => {
    /*
     * `banTruoc` đến từ thân phản hồi, và một khai báo TypeScript là LỜI HỨA chứ
     * không phải phép kiểm (bẫy `0198`). Ném ở đây là trang hồ sơ trắng — vì
     * phần trang trí của một ô.
     */
    render(<BangSanPham dong={[dongSua('khong-phai-doi-tuong')]} />);
    expect(screen.getAllByText('Chỉnh sửa').length).toBeGreaterThan(0);
    expect(dauTrongBang()).toHaveLength(0);
  });

  it('GHI CHÚ đổi thì KHÔNG có dấu nào — nó đã ra khỏi phép so', () => {
    /*
     * Khách hàng chốt 21/09: *"ghi chú không phải là trường để đánh giá sản phẩm
     * có bị chỉnh sửa không"*. Máy chủ vì thế thôi gửi khoá `note`, và ca này
     * canh chiều còn lại: giao diện không được tự dựng một dấu cho nó.
     *
     * Fixture gửi hẳn một `doi` có `note` — tức giả sử một máy chủ CŨ hơn giao
     * diện. Ô ghi chú vẫn phải trơn, vì `O_BAN_TRUOC` không còn khoá ấy.
     */
    render(
      <BangSanPham
        dong={[dongSua({ ...banTruoc, note: 'ghi chu cu', doi: ['note'] }, { note: 'ghi chu moi' })]}
      />,
    );
    expect(dauTrongBang(), 'ghi chú không được mang dấu').toHaveLength(0);
  });

  it('vế THẺ cũng có dấu — tính năng không được biến mất dưới 640px', () => {
    /*
     * `0214` cho hai bố cục hai HÌNH khác nhau vì hàng *bản trước* cần những cột
     * thẻ không có. `0215` đưa chúng về chung một hình: dấu bám vào GIÁ TRỊ, và
     * giá trị thì ở đâu cũng có.
     *
     * Đây cũng là bề rộng người duyệt hay mở hồ sơ để xem trước khi ký.
     */
    render(<BangSanPham dong={[dongSua()]} />);
    const the = document.querySelectorAll('.the-san-pham .dau-doi');
    expect(the.length, 'thẻ mất dấu').toBe(4);
  });

  it('TỔNG CPBH ở thẻ: dấu nằm NGOÀI nút gấp, không lồng nút trong nút', () => {
    /*
     * Ô tổng CPBH của thẻ nằm trong một `<button>` gấp/mở. Một `<button>` lồng
     * trong `<button>` thì trình duyệt tự gỡ ra, và bấm vào dấu sẽ gập luôn cả
     * khối — một cái bẫy HTML không có gì đỏ, vì jsdom vẫn dựng ra cả hai.
     */
    render(<BangSanPham dong={[dongSua({ ...banTruoc, doi: ['cpbhTotal'] })]} />);
    const gop = document.querySelector('.the-san-pham .cpbh-gop') as HTMLElement;
    expect(gop.querySelector('.dau-doi'), 'thẻ mất dấu tổng CPBH').not.toBeNull();
    expect(
      gop.querySelector('.cpbh-nut .dau-doi'),
      'dấu nằm TRONG nút gấp — nút lồng nút',
    ).toBeNull();
  });
});
