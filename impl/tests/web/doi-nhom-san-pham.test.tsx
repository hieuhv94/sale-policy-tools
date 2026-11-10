/**
 * @vitest-environment jsdom
 *
 * `0238` — hộp thoại *Sửa sản phẩm* đổi được NHÓM (khách hàng 29/09).
 *
 * Vế máy chủ và vế *Yêu cầu cập nhật* ở `tests/http/policy.test.ts` (khối
 * `0238`). Ở đây canh ba điều của giao diện: ô chọn mở ra ở ĐÚNG nhóm đang có,
 * `groupCode` chỉ đi lên khi thật sự đổi (một lượt sửa tên không được kéo theo
 * một lượt đổi nhóm), và câu hậu quả hiện ra khi đổi.
 */
import { chonMuc, giaTri } from './chon-co-go.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TheSanPham } from '@csbh/web/san-pham-ui';

const NHOM = [
  { id: 'g1', code: 'SUA-BOT', name: 'Sữa bột' },
  { id: 'g2', code: 'SUA-NUOC', name: 'Sữa nước' },
];
const SP = {
  id: 'sp-1',
  code: 'NC-01',
  name: 'Nutricare Gold',
  groupCode: 'SUA-BOT',
  status: 'DANG_AP_DUNG',
  price: '100000',
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

let daGui: Record<string, unknown> | null = null;

const bay = async () => {
  daGui = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: unknown, init?: RequestInit) => {
      const d = String(duong);
      if (init?.method === 'PATCH') {
        daGui = JSON.parse(String(init.body));
        return Promise.resolve(json(SP));
      }
      if (d.includes('/prices')) return Promise.resolve(json([]));
      if (d.includes('/catalog/products')) return Promise.resolve(json({ items: [SP], total: 1 }));
      return Promise.resolve(json([]));
    }),
  );
  render(<TheSanPham nhom={NHOM as never} />);
  await waitFor(() => screen.getByText('Nutricare Gold'));
  await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
};

// Theo `id`, không theo nhãn: bộ lọc ở đầu trang cũng có nhãn bắt đầu bằng *Nhóm*.
const oNhom = () => document.getElementById('sp-sua-nhom') as HTMLInputElement;
const luu = async () => {
  await userEvent.type(screen.getByLabelText(/Gõ lại mã/), 'NC-01');
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(daGui).not.toBeNull());
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('`0238` sửa sản phẩm — đổi nhóm', () => {
  it('ô Nhóm mở ra ở ĐÚNG nhóm đang có', async () => {
    await bay();
    expect(giaTri(oNhom())).toBe('SUA-BOT');
  });

  it('đổi nhóm → gửi `groupCode` mới, và câu hậu quả nhắc *Yêu cầu cập nhật*', async () => {
    await bay();
    await chonMuc(userEvent.setup(), oNhom(), 'SUA-NUOC');
    expect(document.body.textContent).toContain('Đổi nhóm là đổi quy định chiết khấu');
    await luu();
    expect(daGui!['groupCode']).toBe('SUA-NUOC');
  });

  it('KHÔNG đổi nhóm (chỉ sửa tên) → thân KHÔNG mang `groupCode`', async () => {
    await bay();
    const ten = screen.getByLabelText(/Tên sản phẩm/);
    await userEvent.clear(ten);
    await userEvent.type(ten, 'Nutricare Gold 2');
    expect(document.body.textContent).not.toContain('Đổi nhóm là đổi quy định chiết khấu');
    await luu();
    expect(daGui).not.toHaveProperty('groupCode');
  });

  it('nhóm đang có KHÔNG nằm trong danh sách vẫn được giữ, không tự nhảy sang nhóm đầu', async () => {
    // Danh sách nhóm chưa tải hoặc nhóm cũ đã bị xoá: thiếu mục ấy thì trình
    // duyệt tự chọn mục đầu tiên, và Lưu để sửa tên sẽ lặng lẽ đổi nhóm.
    daGui = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((duong: unknown, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          daGui = JSON.parse(String(init.body));
          return Promise.resolve(json(SP));
        }
        if (String(duong).includes('/prices')) return Promise.resolve(json([]));
        return Promise.resolve(json({ items: [{ ...SP, groupCode: 'NHOM-CU' }], total: 1 }));
      }),
    );
    render(<TheSanPham nhom={NHOM as never} />);
    await waitFor(() => screen.getByText('Nutricare Gold'));
    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(oNhom().value).toBe('NHOM-CU');
    await luu();
    expect(daGui).not.toHaveProperty('groupCode');
  });
});
