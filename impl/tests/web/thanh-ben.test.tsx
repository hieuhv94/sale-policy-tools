/**
 * @vitest-environment jsdom
 *
 * `0257` — khung ứng dụng sau thiết kế lại: thanh bên THU GỌN được, thanh trên nói
 * TÊN MỤC đang ở, chân trang đặt phiên bản bên phải.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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

const mo = (duong = '/') => {
  window.history.pushState({}, '', duong);
  return render(
    <PhienProvider>
      <BoDinhTuyen>
        <BoCuc>
          <p>nội dung</p>
        </BoCuc>
      </BoDinhTuyen>
    </PhienProvider>,
  );
};

const khung = () => document.querySelector('.khung-app')!;
const nutGon = () => document.querySelector<HTMLButtonElement>('.nut-thu-gon')!;
const CSS = readFileSync('apps/web/src/styles/app.css', 'utf8');

beforeEach(() => {
  localStorage.setItem('csbh:phien', JSON.stringify(TDV));
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('không được gọi mạng'))));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('`0257` thanh bên thu gọn', () => {
  it('nút nằm ở ĐẦU thanh bên (cạnh logo), mặc định là đang MỞ RỘNG', () => {
    mo();
    expect(document.querySelector('.thanh-ben-dau')!.contains(nutGon())).toBe(true);
    expect(khung().classList.contains('thu-gon')).toBe(false);
    expect(nutGon().getAttribute('aria-expanded')).toBe('true');
    expect(nutGon().textContent).toContain('Thu gọn thanh bên');
  });

  it('bấm thì thu gọn, NHỚ qua lần mở sau, bấm lại thì mở rộng và quên', () => {
    mo();
    fireEvent.click(nutGon());
    expect(khung().classList.contains('thu-gon')).toBe(true);
    expect(nutGon().getAttribute('aria-expanded')).toBe('false');
    expect(nutGon().textContent).toContain('Mở rộng thanh bên');
    expect(localStorage.getItem('csbh:thanh-ben-gon')).toBe('1');

    cleanup();
    mo();
    expect(khung().classList.contains('thu-gon'), 'mở lại trang phải còn thu gọn').toBe(true);
    fireEvent.click(nutGon());
    expect(khung().classList.contains('thu-gon')).toBe(false);
    expect(localStorage.getItem('csbh:thanh-ben-gon')).toBeNull();
  });

  it('thu gọn rồi vẫn ĐỌC ĐƯỢC tên mục: chữ còn trong DOM, liên kết mang `title`', () => {
    localStorage.setItem('csbh:thanh-ben-gon', '1');
    mo();
    const lien = screen.getByRole('link', { name: 'Khách hàng' });
    expect(lien.getAttribute('title')).toBe('Khách hàng');
  });

  it('`localStorage` ném lỗi (trình duyệt chặn lưu trữ) thì khung vẫn dựng, mặc định mở rộng', () => {
    const goc = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k: string) {
      if (k === 'csbh:thanh-ben-gon') throw new Error('SecurityError');
      return goc.call(this, k);
    };
    try {
      mo();
      expect(khung().classList.contains('thu-gon')).toBe(false);
    } finally {
      Storage.prototype.getItem = goc;
    }
  });

  it('CSS: thu gọn chỉ áp từ 1024px, và chữ mục ẨN KHỎI MẮT chứ không `display: none`', () => {
    // Mọi khối `@media (min-width: 1024px)`, rồi lấy khối mang luật thu gọn — tệp
    // có nhiều khối cùng điều kiện, khối ĐẦU không phải là nó.
    const khoiDu = CSS.split('@media (min-width: 1024px) {').slice(1).map((k) => k.slice(0, k.indexOf('\n}\n')));
    const trongKhoi = khoiDu.find((k) => k.includes('thu-gon')) ?? '';
    expect(trongKhoi).toContain('.khung-app.thu-gon .thanh-ben { width: var(--rong-thanh-ben-gon); }');
    expect(trongKhoi).toContain('.nut-thu-gon { display: inline-grid; }');
    const muc = trongKhoi.slice(trongKhoi.indexOf('.thu-gon .muc-chu {'));
    expect(muc.slice(0, muc.indexOf('}'))).toContain('clip-path: inset(50%)');
    expect(CSS).not.toMatch(/\.thu-gon \.muc-chu \{[^}]*display:\s*none/);
    // Ngoài khối 1024px nút thu gọn tắt — dưới đó thanh bên là ngăn kéo.
    expect(CSS).toContain('.nut-thu-gon { display: none;');
  });
});

describe('`0257` thanh trên nói TÊN MỤC đang ở', () => {
  it.each([
    ['/', 'Tổng quan'],
    ['/khach-hang', 'Khách hàng'],
    ['/ho-so/123', 'Hồ sơ CSBH'],
    ['/thong-tin', 'Thông tin của tôi'],
  ])('%s → %s', (duong, ten) => {
    mo(duong);
    expect(document.querySelector('.thanh-tieu-de .tieu-de-gon')!.textContent).toBe(ten);
  });
});

describe('`0257` chân trang: phiên bản bên phải, cấu trúc DOM không đổi', () => {
  it('lưới hai cột, phiên bản ở cột 2 hàng 1', () => {
    expect(CSS).toMatch(/\.chan-trang \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(CSS).toContain('.chan-trang > .chan-trang-phien-ban { grid-column: 2; grid-row: 1;');
  });
});
