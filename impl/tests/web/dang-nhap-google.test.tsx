/**
 * @vitest-environment jsdom
 *
 * `0241` — đăng nhập bằng Google, phía giao diện.
 *
 * Máy chủ có bộ kiểm riêng (`tests/http/google-login.test.ts`); ở đây canh bốn
 * chuyện chỉ giao diện làm được: nút chỉ hiện khi máy chủ nói tính năng bật,
 * nút KHÔNG hiện ở lớp phủ hết phiên (rời trang là mất bản nhập dở), lỗi quay
 * về qua `?loi=` chỉ được chọn một câu đã viết sẵn, và trang nhận kết quả nộp
 * mã một lần rồi gỡ nó khỏi thanh địa chỉ.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '@csbh/web/app';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { BaoLoiProvider } from '@csbh/web/bao-loi';
import { DangNhap } from '@csbh/web/dang-nhap';
import { BANG_LOI } from '@csbh/web/loi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const PHIEN = {
  accessToken: 'at',
  refreshToken: 'rt',
  mustChangePassword: false,
  user: { id: 'u-1', username: 'tbp01', email: 'tbp01@x.test', fullName: 'Nguoi Dung', role: 'TBP' },
};

const chanMang = (o: { google?: boolean; exchange?: () => Response } = {}) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/auth/phuong-thuc')) return Promise.resolve(json({ google: o.google ?? false }));
    if (d.includes('/auth/google/exchange')) return Promise.resolve(o.exchange ? o.exchange() : json(PHIEN));
    if (d.includes('/contract-templates')) return Promise.resolve(json([]));
    if (d.includes('/allowed-actions')) return Promise.resolve(json({ allowed: [] }));
    return Promise.resolve(
      json({ items: [], total: 0, byStatus: {}, byPendingStep: {}, byStepDetail: {}, byHandler: [] }),
    );
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const mo = (duong: string, cay = <App />) => {
  window.history.replaceState(null, '', duong);
  render(
    <BaoLoiProvider>
      <BoDinhTuyen>
        <PhienProvider>{cay}</PhienProvider>
      </BoDinhTuyen>
    </BaoLoiProvider>,
  );
};

const nutGoogle = () => screen.queryByRole('link', { name: /Đăng nhập bằng Google/ });

describe('`0241` nút Đăng nhập bằng Google', () => {
  it('hiện khi máy chủ nói bật — một LIÊN KẾT điều hướng tới /api/auth/google/start, mang theo đường hiện tại', async () => {
    chanMang({ google: true });
    mo('/ho-so/abc');
    const a = await screen.findByRole('link', { name: /Đăng nhập bằng Google/ });
    expect(a.getAttribute('href')).toBe('/api/auth/google/start?next=%2Fho-so%2Fabc');
  });

  it('KHÔNG hiện khi máy chủ nói tắt', async () => {
    const f = chanMang({ google: false });
    mo('/');
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('/auth/phuong-thuc'))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(nutGoogle()).toBeNull();
  });

  it('KHÔNG hiện ở lớp phủ hết phiên, và lớp phủ không hỏi máy chủ', async () => {
    const f = chanMang({ google: true });
    mo('/', <DangNhap lopPhu />);
    await new Promise((r) => setTimeout(r, 20));
    expect(nutGoogle()).toBeNull();
    expect(f.mock.calls.some((c) => String(c[0]).includes('/auth/phuong-thuc'))).toBe(false);
  });
});

describe('`0241` lỗi quay về qua ?loi=', () => {
  it('mã GOOGLE_* có trong bảng tra hiện DƯỚI Ô, rồi gỡ khỏi thanh địa chỉ', async () => {
    chanMang({ google: true });
    mo('/?loi=GOOGLE_LOGIN_FAILED');
    expect(await screen.findByText(BANG_LOI['GOOGLE_LOGIN_FAILED']!.cau!)).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('mã lạ — kể cả mã có thật nhưng không phải của Google — không hiện gì', async () => {
    chanMang({ google: true });
    mo('/?loi=INVALID_CREDENTIALS');
    await screen.findByRole('link', { name: /Đăng nhập bằng Google/ });
    expect(screen.queryByText(BANG_LOI['INVALID_CREDENTIALS']!.cau!)).toBeNull();
    expect(window.location.search).toBe('');
  });
});

describe('`0241` trang /dang-nhap/google', () => {
  it('nộp mã một lần, gỡ fragment, vào đúng bản ghi của liên kết sâu', async () => {
    const f = chanMang();
    mo('/dang-nhap/google#ma=ma-mot-lan&next=%2Fho-so%2Fabc');
    await waitFor(() => expect(window.location.pathname).toBe('/ho-so/abc'));
    const nop = f.mock.calls.filter((c) => String(c[0]).includes('/auth/google/exchange'));
    expect(nop).toHaveLength(1);
    expect(JSON.parse(String((nop[0]![1] as RequestInit).body))).toEqual({ ma: 'ma-mot-lan' });
    expect(window.location.hash).toBe('');
    expect(JSON.parse(localStorage.getItem('csbh:phien')!).user.username).toBe('tbp01');
  });

  it('`next` không phải bản ghi thì về Tổng quan', async () => {
    chanMang();
    mo('/dang-nhap/google#ma=x&next=%2Fnguoi-dung');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('mã hết hạn → câu của bảng tra và nút về màn hình đăng nhập', async () => {
    chanMang({ exchange: () => json({ code: 'GOOGLE_CODE_INVALID', message: 'x' }, 401) });
    mo('/dang-nhap/google#ma=het-han&next=%2F');
    expect(await screen.findByText(BANG_LOI['GOOGLE_CODE_INVALID']!.cau!)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tới màn hình đăng nhập/ })).toBeTruthy();
    expect(window.location.hash).toBe('');
  });

  it('thiếu mã thì không gọi máy chủ', async () => {
    const f = chanMang();
    mo('/dang-nhap/google');
    expect(await screen.findByText(/không đúng/)).toBeTruthy();
    expect(f.mock.calls.some((c) => String(c[0]).includes('/auth/google/exchange'))).toBe(false);
  });
});
