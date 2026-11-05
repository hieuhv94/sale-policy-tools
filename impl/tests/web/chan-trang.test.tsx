/**
 * @vitest-environment jsdom
 *
 * `0244` — chân trang: bản quyền · quyền sở hữu · phiên bản. Câu chữ khách hàng
 * duyệt 05/11, nên ca kiểm ghim NGUYÊN VĂN chứ không ghim từng mảnh.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ChanTrang } from '@csbh/web/chan-trang';
import { TEN_CONG_TY } from '@csbh/web/cong-ty';
import { PHIEN_BAN } from '@csbh/web/phien-ban';

afterEach(cleanup);

const chu = () =>
  Array.from(document.querySelectorAll('.chan-trang > span')).map((s) => s.textContent);

describe('`0244` chân trang', () => {
  it('ba mảnh, đúng câu đã duyệt, đúng thứ tự', () => {
    render(<ChanTrang />);
    const nam = new Date().getFullYear();
    expect(chu()).toEqual([
      `© ${nam} Công ty TNHH Dược phẩm Nutricare. Bảo lưu mọi quyền.`,
      'Phần mềm Chính sách bán hàng — tài sản của Công ty TNHH Dược phẩm Nutricare, chỉ dành cho người được cấp tài khoản.',
      `Phiên bản ${PHIEN_BAN}`,
    ]);
  });

  it('tên công ty đến từ `TEN_CONG_TY`, không gõ tay', () => {
    render(<ChanTrang />);
    expect(chu().filter((c) => c!.includes(TEN_CONG_TY))).toHaveLength(2);
  });

  it('rút gọn (màn hình đăng nhập): chỉ dòng bản quyền', () => {
    render(<ChanTrang rutGon />);
    expect(chu()).toHaveLength(1);
    expect(chu()[0]).toMatch(/^© \d{4} .*Bảo lưu mọi quyền\.$/);
  });

  it('là một `<footer>` — trình đọc màn hình gọi đúng tên vùng', () => {
    render(<ChanTrang />);
    expect(document.querySelector('footer.chan-trang')).not.toBeNull();
  });
});
