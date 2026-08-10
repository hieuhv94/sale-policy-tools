/**
 * @vitest-environment jsdom
 *
 * Chọn giao diện sáng / tối.
 *
 * Cái đáng kiểm ở đây KHÔNG phải "bấm nút thì đổi màu" — mà là trạng thái thứ
 * ba: **chưa chọn gì**. Nó dễ mất theo đúng một cách, và mất rồi thì không ai
 * thấy: chỉ cần lưu sẵn `'sang'` ở lần chạy đầu là lựa chọn của người dùng bị
 * đóng băng vĩnh viễn vào cài đặt máy tại đúng giây họ mở phần mềm lần đầu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useGiaoDien } from '@csbh/web/giao-dien';

const KHOA = 'csbh:giao-dien';

/** jsdom không có `matchMedia`. Dựng bản giả có cả `addEventListener`. */
function mayDeToi(toi: boolean): { doiMay: (m: boolean) => void } {
  const nghe = new Set<(e: MediaQueryListEvent) => void>();
  let hienTai = toi;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('dark') ? hienTai : false,
    media: q,
    addEventListener: (_: string, f: (e: MediaQueryListEvent) => void) => nghe.add(f),
    removeEventListener: (_: string, f: (e: MediaQueryListEvent) => void) => nghe.delete(f),
  }));
  return {
    doiMay: (m: boolean) => {
      hienTai = m;
      act(() => {
        for (const f of nghe) f({ matches: m } as MediaQueryListEvent);
      });
    },
  };
}

function ManHinhThu() {
  const { dangToi, doi } = useGiaoDien();
  return (
    <button type="button" onClick={doi}>
      {dangToi ? 'đang tối' : 'đang sáng'}
    </button>
  );
}

const thuocTinh = () => document.documentElement.getAttribute('data-theme');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('chưa chọn gì thì theo cài đặt của máy', () => {
  it('máy để tối → giao diện tối, mà KHÔNG đặt thuộc tính lên <html>', () => {
    mayDeToi(true);
    render(<ManHinhThu />);
    expect(screen.getByRole('button').textContent).toBe('đang tối');
    // Đặt `data-theme="toi"` ở đây cũng cho ra màu đúng, nhưng là sai: nó chặn
    // mất nhánh `prefers-color-scheme` trong tokens.css, nên người dùng đổi cài
    // đặt máy sau đó thì phần mềm đứng yên.
    expect(thuocTinh()).toBeNull();
  });

  it('máy để sáng → giao diện sáng', () => {
    mayDeToi(false);
    render(<ManHinhThu />);
    expect(screen.getByRole('button').textContent).toBe('đang sáng');
    expect(thuocTinh()).toBeNull();
  });

  it('không ghi gì vào localStorage cho tới khi người dùng thật sự chọn', () => {
    mayDeToi(true);
    render(<ManHinhThu />);
    expect(localStorage.getItem(KHOA)).toBeNull();
  });

  it('máy tự chuyển sang tối giữa chừng thì đổi theo', () => {
    const { doiMay } = mayDeToi(false);
    render(<ManHinhThu />);
    expect(screen.getByRole('button').textContent).toBe('đang sáng');
    // Nhiều hệ điều hành tự chuyển tối lúc chiều muộn, ngay giữa lúc người dùng
    // đang mở một hồ sơ.
    doiMay(true);
    expect(screen.getByRole('button').textContent).toBe('đang tối');
  });
});

describe('chọn tay thì thắng cài đặt của máy', () => {
  it('máy tối, chọn sáng → sáng, và ghi nhớ', async () => {
    const nguoi = userEvent.setup();
    mayDeToi(true);
    render(<ManHinhThu />);
    await nguoi.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('đang sáng');
    expect(thuocTinh()).toBe('sang');
    expect(localStorage.getItem(KHOA)).toBe('sang');
  });

  it('máy sáng, chọn tối → tối', async () => {
    const nguoi = userEvent.setup();
    mayDeToi(false);
    render(<ManHinhThu />);
    await nguoi.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('đang tối');
    expect(thuocTinh()).toBe('toi');
  });

  it('lựa chọn cũ được đọc lại ở lần mở sau, ngược hẳn với máy', () => {
    localStorage.setItem(KHOA, 'toi');
    mayDeToi(false);
    render(<ManHinhThu />);
    expect(screen.getByRole('button').textContent).toBe('đang tối');
    expect(thuocTinh()).toBe('toi');
  });

  it('đã chọn tay rồi thì máy đổi cài đặt cũng không lay chuyển', () => {
    localStorage.setItem(KHOA, 'sang');
    const { doiMay } = mayDeToi(false);
    render(<ManHinhThu />);
    doiMay(true);
    expect(screen.getByRole('button').textContent).toBe('đang sáng');
  });

  it('giá trị rác trong localStorage bị bỏ qua, quay về theo máy', () => {
    localStorage.setItem(KHOA, 'xanh-la');
    mayDeToi(true);
    render(<ManHinhThu />);
    expect(screen.getByRole('button').textContent).toBe('đang tối');
    expect(thuocTinh()).toBeNull();
  });
});
