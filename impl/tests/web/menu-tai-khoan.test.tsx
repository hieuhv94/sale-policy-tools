/**
 * @vitest-environment jsdom
 *
 * `0062` — thẻ tên ở thanh trên cùng sổ xuống thành menu tài khoản.
 *
 * Trước đó thanh này bày sẵn một nút *Đăng xuất* ngay cạnh thẻ tên. Hai chuyện,
 * và chuyện thứ hai mới là lý do phải sửa: nút cắt phiên đứng sát chỗ người ta
 * bấm để xem thông tin của mình, nên bấm trượt một lần là mất cả biểu mẫu đang
 * dở. Menu sổ xuống bắt việc nguy hiểm ấy tốn HAI cú bấm có chủ ý.
 *
 * Nên phần lớn ca dưới đây kiểm đúng một điều: **đăng xuất không với tới được
 * bằng một cú bấm**, và menu đóng lại đúng lúc phải đóng.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BoCuc } from '@csbh/web/bo-cuc';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';

const TDV = {
  accessToken: 'a',
  refreshToken: 'r',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'tdv01',
    fullName: 'Nguyen Van Hung',
    email: 'tdv01@nutricare.com.vn',
    role: 'TDV',
    mustChangePassword: false,
  },
};

const mo = () => {
  render(
    <PhienProvider>
      <BoDinhTuyen>
        <BoCuc>
          <p>nội dung</p>
        </BoCuc>
      </BoDinhTuyen>
    </PhienProvider>,
  );
  return screen.getByRole('button', { expanded: false, name: /Nguyen Van Hung/ });
};

beforeEach(() => {
  localStorage.setItem('csbh:phien', JSON.stringify(TDV));
  // Không có lời gọi mạng nào ở khung chung, nhưng `PhienProvider` đăng ký vài
  // callback lên `api.ts` — chặn `fetch` để một lượt lạc đường không đi ra ngoài.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('không được gọi mạng'))));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('`0062` đăng xuất không còn bày sẵn trên thanh trên cùng', () => {
  it('lúc chưa bấm gì thì KHÔNG có nút Đăng xuất nào trên màn hình', () => {
    mo();
    expect(screen.queryByText('Đăng xuất')).toBeNull();
  });

  it('bấm thẻ tên mới sổ ra, và đó là chỗ duy nhất có Đăng xuất', () => {
    fireEvent.click(mo());
    expect(screen.getByRole('button', { name: /Đăng xuất/ })).toBeDefined();
  });
});

describe('`0062` nội dung menu đúng ba dòng, đúng thứ tự', () => {
  it('dòng đầu là email, hai dòng sau là hai thao tác', () => {
    fireEvent.click(mo());
    const khoi = document.querySelector('.menu-so') as HTMLElement;
    expect(khoi).not.toBeNull();

    // Email KHÔNG bấm được: nó trả lời "tôi đang đăng nhập bằng tài khoản nào",
    // không dẫn đi đâu. Biến nó thành liên kết là hứa một chỗ để tới.
    const email = khoi.querySelector('.menu-so-email')!;
    expect(email.textContent).toBe('tdv01@nutricare.com.vn');
    expect(email.closest('a'), 'email lại bấm được').toBeNull();

    const muc = [...khoi.querySelectorAll('.menu-so-muc')];
    expect(muc.map((e) => e.textContent)).toEqual(['Thông tin tài khoản', 'Đăng xuất']);
    // Thứ tự trong DOM cũng là thứ tự đọc của trình đọc màn hình và thứ tự Tab.
    expect(email.compareDocumentPosition(muc[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('*Thông tin tài khoản* là LIÊN KẾT tới /thong-tin, không phải một nút', () => {
    // Phải là thẻ neo: người dùng mở ở tab mới, sao chép địa chỉ, bấm chuột giữa
    // — cả ba chỉ chạy trên liên kết thật.
    fireEvent.click(mo());
    const a = screen.getByRole('link', { name: /Thông tin tài khoản/ }) as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/thong-tin');
  });
});

describe('`0062` menu đóng lại đúng lúc phải đóng', () => {
  it('bấm ra ngoài thì đóng', () => {
    fireEvent.click(mo());
    expect(document.querySelector('.menu-so')).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(document.querySelector('.menu-so')).toBeNull();
  });

  it('bấm TRONG menu thì KHÔNG đóng — nếu không thì không bấm nổi mục nào', () => {
    fireEvent.click(mo());
    const khoi = document.querySelector('.menu-so') as HTMLElement;
    fireEvent.mouseDown(khoi);
    expect(document.querySelector('.menu-so')).not.toBeNull();
  });

  it('Escape thì đóng, và tiêu điểm về lại thẻ tên', () => {
    // Thiếu vế sau thì người dùng bàn phím rơi về đầu trang và phải Tab lại từ
    // đó — thoát khỏi một menu không nên tốn hơn một phím.
    const nut = mo();
    fireEvent.click(nut);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.menu-so')).toBeNull();
    expect(document.activeElement).toBe(nut);
  });

  it('bấm lần nữa vào thẻ tên thì gập lại', () => {
    const nut = mo();
    fireEvent.click(nut);
    expect(nut.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(nut);
    expect(nut.getAttribute('aria-expanded')).toBe('false');
  });
});
