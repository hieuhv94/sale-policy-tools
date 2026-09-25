/**
 * @vitest-environment jsdom
 *
 * `0222` — con mắt hiện/ẩn mật khẩu ở MỌI ô mật khẩu.
 *
 * Khách hàng (25/09): *"thêm chức năng hiển thị mật khẩu lúc nhập, để hình con
 * mắt bên cạnh của mọi text box chứa mật khẩu"*. Sáu ô ở ba màn hình, một
 * component (`OMatKhau`) — và chữ *"mọi"* được canh bằng phép quét mã nguồn ở
 * cuối tệp, vì ô thứ bảy ai đó thêm sau này thì không ca nào khác biết tới.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OMatKhau, Truong } from '@csbh/web/chung';
import { App } from '@csbh/web/app';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { BaoLoiProvider } from '@csbh/web/bao-loi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

function MotO({ id = 'mk', nhan = 'Mật khẩu' }: { id?: string; nhan?: string }) {
  const [v, datV] = useState('');
  return (
    <Truong id={id} nhan={nhan} bắtBuộc>
      {(p) => <OMatKhau {...p} autoComplete="current-password" giaTri={v} doi={datV} />}
    </Truong>
  );
}

const o = (id = 'mk') => document.getElementById(id) as HTMLInputElement;

describe('`0222` ô mật khẩu có con mắt', () => {
  it('mặc định ẨN; bấm con mắt thì HIỆN, bấm lần nữa thì ẩn lại', async () => {
    render(<MotO />);
    await userEvent.type(o(), 'Bi@mat123');
    expect(o().type).toBe('password');

    const nut = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    expect(nut.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(nut);
    expect(o().type).toBe('text');
    expect(o().value, 'đổi kiểu ô không được mất chữ đã gõ').toBe('Bi@mat123');
    // Nhãn đổi theo trạng thái: hình con mắt là `aria-hidden`, nên đây là
    // đường duy nhất trình đọc màn hình biết đang hiện hay ẩn.
    const nutAn = screen.getByRole('button', { name: 'Ẩn mật khẩu' });
    expect(nutAn.getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(nutAn);
    expect(o().type).toBe('password');
  });

  it('nhãn của TRƯỜNG vẫn trỏ đúng vào ô nhập, không vào con mắt', () => {
    render(<MotO />);
    // `FE-34`: nhãn gắn bằng `htmlFor` — con mắt không được giành lấy `id`.
    expect(screen.getByLabelText(/^Mật khẩu/)).toBe(o());
    expect(o().getAttribute('autocomplete')).toBe('current-password');
  });

  it('bấm con mắt trong một biểu mẫu KHÔNG gửi biểu mẫu', async () => {
    /*
     * `<button>` không khai `type` là nút GỬI khi nằm trong `<form>` — bấm con
     * mắt ở màn hình đăng nhập sẽ gửi luôn mật khẩu gõ dở.
     */
    const gui = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={gui}>
        <MotO />
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(gui).not.toHaveBeenCalled();
  });

  it('mỗi ô giữ trạng thái RIÊNG — hiện ô này không hiện ô kia', async () => {
    render(
      <>
        <MotO id="mk-moi" nhan="Mật khẩu mới" />
        <MotO id="mk-lai" nhan="Nhập lại mật khẩu mới" />
      </>,
    );
    const [dau] = screen.getAllByRole('button', { name: 'Hiện mật khẩu' });
    await userEvent.click(dau!);
    expect(o('mk-moi').type).toBe('text');
    expect(o('mk-lai').type, 'ô nhập lại tồn tại để gõ mà không nhìn').toBe('password');
  });

  it('màn hình ĐĂNG NHẬP thật có con mắt cạnh ô mật khẩu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
    );
    window.history.replaceState(null, '', '/');
    render(
      <BaoLoiProvider>
        <BoDinhTuyen>
          <PhienProvider>
            <App />
          </PhienProvider>
        </BoDinhTuyen>
      </BaoLoiProvider>,
    );
    const oMk = (await screen.findByLabelText(/^Mật khẩu/)) as HTMLInputElement;
    expect(oMk.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(oMk.type).toBe('text');
  });
});

describe('`0222` MỌI ô mật khẩu đi qua `OMatKhau`', () => {
  const GOC = 'apps/web/src';
  const tsx = (thuMuc: string): string[] =>
    readdirSync(thuMuc).flatMap((t) => {
      const p = join(thuMuc, t);
      return statSync(p).isDirectory() ? tsx(p) : p.endsWith('.tsx') ? [p] : [];
    });

  it('không tệp nào ngoài `Chung.tsx` tự dựng một ô `password`', () => {
    /*
     * Khớp cả ba cách viết: thuộc tính JSX, và chuỗi `'password'`/`"password"`
     * làm giá trị của `type`. Không khớp `autoComplete="current-password"` — dấu
     * nháy phải đứng NGAY trước chữ `password`.
     */
    const lo = tsx(GOC)
      .filter((f) => !f.endsWith('components/Chung.tsx'))
      .filter((f) => /type\s*=\s*\{?\s*["']password["']/.test(readFileSync(f, 'utf8')));
    expect(lo, 'ô mật khẩu không có con mắt').toEqual([]);
  });

  it('sáu ô ở ba màn hình đều dùng `OMatKhau`', () => {
    const dem = (tep: string) =>
      (readFileSync(join(GOC, 'pages', tep), 'utf8').match(/<OMatKhau\b/g) ?? []).length;
    expect({
      dangNhap: dem('DangNhap.tsx'),
      doiMatKhau: dem('DoiMatKhau.tsx'),
      datMatKhau: dem('DatMatKhau.tsx'),
    }).toEqual({ dangNhap: 1, doiMatKhau: 3, datMatKhau: 2 });
  });
});
