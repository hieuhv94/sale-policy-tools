/**
 * @vitest-environment jsdom
 *
 * `0035` — hộp thoại xoá hồ sơ phải nói ĐÚNG hậu quả sắp xảy ra.
 *
 * Cùng một nút, hai kết cục do máy chủ chọn theo trạng thái: hồ sơ chưa gửi
 * duyệt biến mất hẳn, hồ sơ đã bị trả lại thì ở lại với nhãn *Đã xoá*. Người
 * dùng không chọn giữa hai cái đó, nên thứ duy nhất họ có để quyết định là câu
 * chữ trong hộp thoại này — nói chung chung cho cả hai là đúng một nửa ở mỗi vế.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { XoaHoSo } from '@csbh/web/sua-ho-so-ui';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mo = (trangThai: string) => {
  const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', f);
  render(
    <XoaHoSo
      hoSoId="hs-1"
      ma="CSBH-0001"
      trangThai={trangThai}
      dong={() => undefined}
      xong={() => undefined}
    />,
  );
  return f;
};

const chu = () => document.body.textContent ?? '';

describe('hộp thoại nói đúng hậu quả', () => {
  it('Nháp: biến mất hẳn, không nhắc tới nhãn "Đã xoá"', () => {
    mo('NHAP');
    expect(chu()).toContain('biến mất hẳn');
    expect(chu()).toContain('chưa gửi duyệt');
    // Nói hồ sơ "ở lại với nhãn Đã xoá" cho một bản nháp là sai sự thật, và nó
    // làm người lập ngại mở nháp — đúng thứ nhánh xoá hẳn sinh ra để tránh.
    expect(chu()).not.toContain('Đã xoá');
  });

  it('Yêu cầu chỉnh sửa: ở lại với nhãn "Đã xoá", giữ lịch sử', () => {
    mo('YEU_CAU_CHINH_SUA');
    expect(chu()).toContain('Đã xoá');
    expect(chu()).toContain('lịch sử');
    expect(chu()).not.toContain('biến mất hẳn');
  });
});

describe('vẫn phải gõ lại mã hồ sơ', () => {
  it('nút khoá cho tới khi gõ đúng mã, ở CẢ HAI trạng thái', async () => {
    for (const tt of ['NHAP', 'YEU_CAU_CHINH_SUA']) {
      const f = mo(tt);
      const nut = () => screen.getByRole('button', { name: 'Xoá hồ sơ' }) as HTMLButtonElement;
      expect(nut().disabled, `${tt}: nút đáng lẽ khoá`).toBe(true);

      // Gõ gần đúng vẫn không mở — đó là toàn bộ giá trị của mức xác nhận này.
      await userEvent.type(screen.getByRole('textbox'), 'CSBH-000');
      expect(nut().disabled, `${tt}: gõ thiếu mà nút đã mở`).toBe(true);

      await userEvent.type(screen.getByRole('textbox'), '1');
      expect(nut().disabled).toBe(false);
      await userEvent.click(nut());

      const goi = f.mock.calls.find(
        (c) => (c[1] as { method?: string } | undefined)?.method === 'DELETE',
      );
      expect(goi, `${tt}: chưa gọi DELETE`).toBeTruthy();
      expect(String(goi?.[0])).toContain('/policies/hs-1');
      cleanup();
    }
  });
});
