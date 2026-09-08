/**
 * @vitest-environment jsdom
 *
 * `0022` · `0124` — HAI BẢO ĐẢM CŨ, ĐỌC Ở CHỖ MỚI (`0187`).
 *
 * Tệp này trước đây dựng hộp thoại *Thêm sản phẩm* và chặn `fetch` để chứng minh
 * chuỗi: chọn sản phẩm → gọi `threshold-preview` → đọc đúng trường → hiện đúng
 * khối cảnh báo. `0187` gỡ hẳn hộp thoại ấy, nên **cả chuỗi không còn tồn tại**.
 *
 * Sửa vài dòng cho ca cũ chạy lại là không làm được, và cũng không nên: thứ phải
 * canh bây giờ khác hẳn. Nhưng HAI LUẬT thì còn nguyên, và chúng phải có người
 * canh ở chỗ mới của chúng:
 *
 *   * `0022` — *người lập biết TRƯỚC KHI LƯU rằng dòng này không có quy định
 *     chiết khấu nào phủ*. Trên bảng soạn thẳng, ô chọn sản phẩm ghi ngay lúc
 *     chọn, nên dòng hiện ra kèm ngưỡng thật và kèm dấu cảnh báo của chính nó —
 *     sớm hơn hộp thoại cũ một bước, chứ không muộn hơn. Việc còn phải chứng
 *     minh là **bảng có bày dấu ấy ra**.
 *   * `0124` — *Giá bán Công ty đọc được TRƯỚC ô Giá bán buôn*. Trong hộp thoại
 *     nó là thứ tự hai khối; trên bảng nó là thứ tự hai CỘT.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { BangSanPham, cotCho, type DongSanPham } from '@csbh/web/bang-san-pham';

afterEach(cleanup);

const dong = (p: Partial<DongSanPham> = {}): DongSanPham => ({
  id: 'd1',
  productId: 'sp-1',
  productCode: 'SP-01',
  productName: 'Nutricare Gold',
  companyPrice: '125000',
  wholesalePrice: '90000',
  cpbh: ['3000'],
  cpbhTotal: '3000',
  netPrice: '87000',
  discountRate: '30.40',
  threshold: '30.00',
  overThreshold: false,
  ngayApDung: '2026-09-08',
  ...p,
});

describe('`0022` dòng không có quy định chiết khấu nào phủ thì BẢNG NÓI RA', () => {
  it('`KHONG_CO` → ô Tỷ lệ CK mang dấu cảnh báo', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'KHONG_CO', threshold: null })]} />);
    // Lớp `.thieu` là dấu của *"không có ngưỡng nào để đối chiếu"* — khác hẳn
    // `.vuot` (vượt ngưỡng), và ca này phải phân biệt được hai thứ ấy.
    expect(document.querySelectorAll('.bang-san-pham .ty-le.thieu').length).toBeGreaterThan(0);
  });

  it('có quy định khớp → KHÔNG dấu nào', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'RULE', ruleCode: 'QD-01' })]} />);
    expect(document.querySelectorAll('.bang-san-pham .ty-le.thieu')).toHaveLength(0);
    expect(document.querySelectorAll('.bang-san-pham .ty-le.vuot')).toHaveLength(0);
  });

  it('`KHONG_CO` KHÔNG hiện con số ngưỡng — không có con số nào để hiện', () => {
    render(<BangSanPham dong={[dong({ thresholdSource: 'KHONG_CO', threshold: null })]} />);
    const bang = screen.getByRole('table');
    expect(within(bang).queryByText('30,00%')).toBeNull();
  });
});

describe('`0124` Giá bán Công ty đọc được TRƯỚC Giá bán buôn', () => {
  it('cột Giá bán Công ty đứng bên trái cột Giá bán buôn', () => {
    /*
     * Đo bằng THỨ TỰ CỘT THẬT của bảng đang dựng, không đọc mảng hằng: hai cột
     * có thể đúng thứ tự trong `COT_TRUOC` mà vẫn dựng ra sai nếu chỗ dựng hàng
     * tự sắp lại — và chính chỗ dựng hàng là thứ `0187` vừa viết lại.
     */
    const ds = [dong()];
    render(<BangSanPham dong={ds} />);
    const nhan = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((t) => t.textContent);
    expect(nhan).toEqual(cotCho(ds).map((c) => c.nhan));
    expect(nhan.indexOf('Giá bán Công ty')).toBeLessThan(nhan.indexOf('Giá bán buôn'));
  });

  it('con số Giá bán Công ty lấy từ chính dòng, không phải một ô trống', () => {
    render(<BangSanPham dong={[dong({ companyPrice: '125000' })]} />);
    expect(within(screen.getByRole('table')).getByText('125.000')).toBeDefined();
  });
});
