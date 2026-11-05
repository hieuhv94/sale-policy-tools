/**
 * @vitest-environment jsdom
 *
 * `0244` — chân trang: bản quyền · quyền sở hữu · phiên bản. Câu chữ khách hàng
 * duyệt 05/11, nên ca kiểm ghim NGUYÊN VĂN chứ không ghim từng mảnh.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('`0245` rút gọn (màn hình đăng nhập): dòng bản quyền GIỮ NGUYÊN, thêm số phiên bản', () => {
    render(<ChanTrang rutGon />);
    expect(chu()).toEqual([
      `© ${new Date().getFullYear()} Công ty TNHH Dược phẩm Nutricare. Bảo lưu mọi quyền.`,
      `Phiên bản ${PHIEN_BAN}`,
    ]);
  });

  it('`0245` màn hình đăng nhập THẬT có số phiên bản', async () => {
    const { DangNhap } = await import('@csbh/web/dang-nhap');
    const { PhienProvider } = await import('@csbh/web/auth');
    const { BoDinhTuyen } = await import('@csbh/web/router');
    const { BaoLoiProvider } = await import('@csbh/web/bao-loi');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } }))));
    render(
      <BaoLoiProvider>
        <BoDinhTuyen>
          <PhienProvider>
            <DangNhap />
          </PhienProvider>
        </BoDinhTuyen>
      </BaoLoiProvider>,
    );
    expect(document.querySelector('.chan-trang-phien-ban')?.textContent).toBe(`Phiên bản ${PHIEN_BAN}`);
    vi.unstubAllGlobals();
  });

  it('là một `<footer>` — trình đọc màn hình gọi đúng tên vùng', () => {
    render(<ChanTrang />);
    expect(document.querySelector('footer.chan-trang')).not.toBeNull();
  });
});
