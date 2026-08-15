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
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BangSanPham, cotCho, soCotCpbh, type DongSanPham } from '@csbh/web/bang-san-pham';

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
 * Chú thích màu cố tình dùng ĐÚNG những lớp ấy — một chú thích vẽ ký hiệu khác
 * với ký hiệu thật thì không đối chiếu được, tức là không còn là chú thích. Nên
 * `document.querySelectorAll('.dau-vuot')` luôn đếm dư đúng một cái, và câu hỏi
 * mà mọi test dưới đây đặt ra là "DÒNG NÀO mang dấu", không phải "có dấu nào
 * trên trang".
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

  it('không dòng nào có khoản nào thì KHÔNG có cột CPBH', () => {
    const ds = [dong({ cpbh: [], cpbhTotal: '0', netPrice: '90000' })];
    expect(soCotCpbh(ds)).toBe(0);
    render(<BangSanPham dong={ds} />);
    expect(within(screen.getByRole('table')).queryByText(/^CPBH/)).toBeNull();
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
    const nut = within(the).getByRole('button', { name: /Tổng CPBH/ });

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

describe('FE-28 dấu hiệu vượt ngưỡng không chỉ dựa vào màu', () => {
  it('có cả dấu hiệu hình và chữ cho trình đọc màn hình', () => {
    render(<BangSanPham dong={[dong({ overThreshold: true, discountRate: '35.00' })]} />);
    // Chữ: đọc được bằng trình đọc màn hình và bằng người mù màu đỏ-lục.
    expect(screen.getAllByText(/vượt ngưỡng 30,00%/).length).toBeGreaterThan(0);
    // Dấu hình, tách khỏi màu.
    expect(dauTrongDuLieu('.dau-vuot').length).toBeGreaterThan(0);
  });

  it('dòng không vượt thì không có dấu nào', () => {
    render(<BangSanPham dong={[dong({ overThreshold: false })]} />);
    expect(dauTrongDuLieu('.dau-vuot')).toHaveLength(0);
    expect(screen.queryByText(/vượt ngưỡng/)).toBeNull();
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
    expect(within(bang).getAllByRole('button', { name: 'Xoá dòng' }).length).toBeGreaterThan(0);
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
  it('tô lớp cảnh báo cho dòng PRODUCT_DEFAULT', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'PRODUCT_DEFAULT' })]} />);
    expect(document.querySelectorAll('tr.thieu-quy-dinh')).toHaveLength(1);
    expect(document.querySelectorAll('li.the.thieu-quy-dinh')).toHaveLength(1);
  });

  it('KHÔNG tô gì khi ngưỡng đến từ một quy định', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'RULE' })]} />);
    expect(document.querySelectorAll('.thieu-quy-dinh')).toHaveLength(0);
    expect(dauTrongDuLieu('.dau-mac-dinh')).toHaveLength(0);
  });

  it('KHÔNG tô gì cho dòng lập trước 0022 — nguồn null là "không rõ"', () => {
    // Tô vàng hàng loạt dòng cũ chỉ vì thiếu dữ liệu là báo động giả, và báo
    // động giả hàng loạt thì lần sau không ai nhìn màu vàng nữa.
    render(<BangSanPham dong={[dong({ thresholdSource: null })]} />);
    expect(document.querySelectorAll('.thieu-quy-dinh')).toHaveLength(0);
  });

  it('FE-28 dấu hiệu KHÔNG chỉ là màu — có ký hiệu và có câu cho trình đọc', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'PRODUCT_DEFAULT' })]} />);
    expect(dauTrongDuLieu('.dau-mac-dinh').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/chưa có quy định chiết khấu nào áp dụng/).length)
      .toBeGreaterThan(0);
  });

  it('vừa vượt ngưỡng vừa thiếu quy định: nền là ĐỎ, dấu thiếu quy định vẫn còn', () => {
    // Một dòng chỉ tô được một nền. Vượt ngưỡng thắng vì nó là thứ người duyệt
    // phải xử lý; nguồn ngưỡng thì vẫn nói được bằng ký hiệu, ngoài nền.
    render(
      <BangSanPham
        dong={[dong({ overThreshold: true, thresholdSource: 'PRODUCT_DEFAULT' })]}
      />,
    );
    expect(document.querySelectorAll('tr.vuot-nguong')).toHaveLength(1);
    expect(document.querySelectorAll('tr.thieu-quy-dinh')).toHaveLength(0);
    expect(dauTrongDuLieu('.dau-mac-dinh').length).toBeGreaterThan(0);
    expect(dauTrongDuLieu('.dau-vuot').length).toBeGreaterThan(0);
  });
});

describe('0022 chú thích màu', () => {
  it('giải nghĩa CẢ HAI màu ngay cả khi bảng chưa có dòng nào mang màu ấy', () => {
    // Người dùng gặp dòng đỏ đầu tiên vào lúc đang lập hồ sơ dở — lúc tệ nhất
    // để đi tìm xem màu đỏ nghĩa là gì.
    render(<BangSanPham dong={[dong()]} />);
    const chu = document.querySelector('.chu-thich-mau') as HTMLElement;
    expect(chu).not.toBeNull();
    expect(within(chu).getByText(/Vượt ngưỡng/)).toBeDefined();
    expect(within(chu).getByText(/Chưa có quy định chiết khấu/)).toBeDefined();
    // Ô màu để đối chiếu bằng mắt với nền của dòng.
    expect(chu.querySelectorAll('.o-mau-loi')).toHaveLength(1);
    expect(chu.querySelectorAll('.o-mau-canh-bao')).toHaveLength(1);
  });
});
