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
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BangSanPham, COT, type DongSanPham } from '@csbh/web/bang-san-pham';

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
  productCode: 'SP-01',
  productName: 'Nutricare Gold Đặc Biệt',
  companyPrice: '100000',
  wholesalePrice: '90000',
  cpbh1: '3000',
  cpbh2: '0',
  cpbh3: '0',
  cpbh4: '0',
  cpbhTotal: '3000',
  netPrice: '87000',
  discountRate: '13.00',
  threshold: '30.00',
  overThreshold: false,
  ...p,
});

describe('FE-05 từ 1024px hiện đủ 10 cột', () => {
  it('bảng có đúng 10 cột, không cột nào bị bỏ', () => {
    render(<BangSanPham dong={[dong()]} />);
    const bang = screen.getByRole('table');
    const tieuDe = within(bang).getAllByRole('columnheader');
    expect(tieuDe).toHaveLength(10);
    expect(COT).toHaveLength(10);
    expect(tieuDe.map((t) => t.textContent)).toEqual(COT.map((c) => c.nhan));
  });

  it('bốn ô CPBH đều là cột riêng, không gộp sẵn', () => {
    render(<BangSanPham dong={[dong()]} />);
    const bang = screen.getByRole('table');
    for (const n of ['CPBH 1', 'CPBH 2', 'CPBH 3', 'CPBH 4']) {
      expect(within(bang).getByText(n)).toBeDefined();
    }
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

  it('bốn ô CPBH gấp vào một dòng tổng, bấm mới mở', async () => {
    const nguoi = userEvent.setup();
    render(<BangSanPham dong={[dong({ cpbh1: '3000', cpbh2: '1000', cpbh3: '500', cpbh4: '250', cpbhTotal: '4750' })]} />);
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
    expect(document.querySelectorAll('.dau-vuot').length).toBeGreaterThan(0);
  });

  it('dòng không vượt thì không có dấu nào', () => {
    render(<BangSanPham dong={[dong({ overThreshold: false })]} />);
    expect(document.querySelectorAll('.dau-vuot')).toHaveLength(0);
    expect(screen.queryByText(/vượt ngưỡng/)).toBeNull();
  });
});

describe('FE-36 hồ sơ chưa có dòng nào', () => {
  it('nói việc cần làm tiếp, không phải bảng rỗng không lời', () => {
    render(<BangSanPham dong={[]} />);
    expect(screen.getByText(/Thêm sản phẩm/)).toBeDefined();
  });
});
