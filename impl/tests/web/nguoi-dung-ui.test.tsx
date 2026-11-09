/**
 * @vitest-environment jsdom
 *
 * `0070` — cột **Thao tác** của danh sách người dùng phải thẳng hàng.
 *
 * Nút *Gửi lại thư mời* chỉ có ở tài khoản CHƯA kích hoạt. Nhét cả ba nút vào
 * một ô thì dòng nào thiếu nút ấy sẽ đẩy *Vô hiệu hoá* sang trái, và cột thao
 * tác thành một hàng răng cưa — mắt phải đọc chữ trên từng nút mới biết mình
 * sắp bấm cái gì.
 *
 * Cột bảng thẳng hàng theo ĐỊNH NGHĨA; một `<div>` bên trong ô thì không, vì mỗi
 * ô tự căn theo nội dung của chính nó. Nên ca này đếm ô, không đo pixel — đo
 * pixel trong jsdom là đo một con số luôn bằng 0.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NguoiDung } from '@csbh/web/nguoi-dung-ui';

const DS = [
  {
    id: 'u1',
    username: 'tdv01',
    email: 'tdv01@csbh.test',
    fullName: 'Nguyen Van A',
    role: 'TDV',
    isActive: true,
    // ĐÃ kích hoạt → KHÔNG có nút "Gửi lại thư mời".
    activatedAt: '2026-08-01T02:00:00.000Z',
    createdAt: '2026-08-01T02:00:00.000Z',
  },
  {
    id: 'u2',
    username: 'kt02',
    email: 'kt02@csbh.test',
    fullName: 'Tran Thi B',
    role: 'KE_TOAN',
    isActive: true,
    // CHƯA kích hoạt → CÓ nút ấy. Hai dòng khác nhau đúng ở chỗ này.
    activatedAt: null,
    createdAt: '2026-08-02T02:00:00.000Z',
  },
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const bay = async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/admin/users')) return Promise.resolve(json({ items: DS, total: DS.length }));
      return Promise.resolve(json([]));
    }),
  );
  render(<NguoiDung />);
  await waitFor(() => expect(screen.getByText('Nguyen Van A')).toBeDefined());
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('`0070` cột thao tác thẳng hàng', () => {
  it('mỗi dòng có ĐÚNG ba ô thao tác, kể cả dòng thiếu nút', async () => {
    await bay();
    const dong = [...document.querySelectorAll('tbody tr')];
    expect(dong.length, 'cần ít nhất hai dòng để so').toBeGreaterThan(1);
    for (const tr of dong) {
      expect(tr.querySelectorAll('td.o-thao-tac').length, 'ba ô, không hơn không kém').toBe(3);
    }
  });

  it('nút CÙNG LOẠI nằm cùng một cột ở mọi dòng', async () => {
    await bay();
    const cot = (i: number) =>
      [...document.querySelectorAll('tbody tr')].map(
        (tr) => tr.querySelectorAll('td.o-thao-tac')[i]?.textContent?.trim() ?? '',
      );

    expect(cot(0).every((t) => t === 'Xem')).toBe(true);
    // `0236` — *Vô hiệu hoá* NGAY SAU *Xem*, không ô nào chen giữa.
    expect(cot(1).every((t) => t === 'Vô hiệu hoá' || t === 'Kích hoạt lại')).toBe(true);
    // Ô TRỐNG vẫn giữ chỗ — đó là cả điểm của việc tách cột — và nó đứng CUỐI.
    expect(cot(2).every((t) => t === '' || t === 'Gửi lại thư mời')).toBe(true);
    // Và phải CÓ một ô trống ở cột ấy, nếu không ca này chẳng kiểm gì cả.
    expect(cot(2).some((t) => t === '')).toBe(true);
  });

  it('`0236` ở MỌI dòng, ô *Xem* và ô *Vô hiệu hoá* là hai ô LIỀN NHAU của hàng', async () => {
    // Đọc anh em DOM chứ không đọc chỉ số cột: một ô thứ tư chen vào giữa (kể cả
    // ô không mang lớp `o-thao-tac`) là đúng cái khách hàng vừa bảo bỏ.
    await bay();
    for (const tr of document.querySelectorAll('tbody tr')) {
      const xem = [...tr.querySelectorAll('td')].find((td) => td.textContent?.trim() === 'Xem')!;
      expect(xem.nextElementSibling?.textContent?.trim()).toMatch(/^(Vô hiệu hoá|Kích hoạt lại)$/);
    }
  });

  it('tiêu đề "Thao tác" trải đủ ba cột', async () => {
    await bay();
    const th = [...document.querySelectorAll('thead th')].find((e) => e.textContent === 'Thao tác');
    expect(th?.getAttribute('colspan')).toBe('3');
  });
});

// =============================================================================
// `0277` — Sửa tài khoản CHƯA kích hoạt
// =============================================================================

describe('`0277` nút *Sửa thông tin* chỉ có ở tài khoản CHƯA kích hoạt', () => {
  const moXem = async (ten: string) => {
    const dong = screen.getByText(ten).closest('tr')!;
    await userEvent.click(within(dong).getByRole('button', { name: 'Xem' }));
    return screen.getByRole('dialog');
  };

  it('đã kích hoạt → hộp Xem KHÔNG có nút Sửa', async () => {
    await bay();
    const hop = await moXem('Nguyen Van A');
    expect(within(hop).queryByRole('button', { name: 'Sửa thông tin' })).toBeNull();
  });

  it('chưa kích hoạt → có nút Sửa, và Lưu gửi PATCH đủ bốn trường', async () => {
    const goi: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((duong: unknown, init?: RequestInit) => {
        const d = String(duong);
        if (init?.method === 'PATCH') {
          goi.push({ url: d, method: 'PATCH', body: JSON.parse(String(init.body)) });
          return Promise.resolve(json({ ok: true, inviteMailSent: true }));
        }
        if (d.includes('/admin/users')) return Promise.resolve(json({ items: DS, total: DS.length }));
        return Promise.resolve(json([]));
      }),
    );
    render(<NguoiDung />);
    await waitFor(() => expect(screen.getByText('Tran Thi B')).toBeDefined());

    const hop = await moXem('Tran Thi B');
    await userEvent.click(within(hop).getByRole('button', { name: 'Sửa thông tin' }));

    const luu = screen.getByRole('button', { name: 'Lưu và gửi thư mời mới' });
    // Chưa đổi gì → không cho lưu (một lượt lưu rỗng vẫn thu hồi và gửi thư mới).
    expect((luu as HTMLButtonElement).disabled).toBe(true);

    const email = screen.getByLabelText(/^Email/);
    await userEvent.clear(email);
    await userEvent.type(email, 'kt02.moi@csbh.test');
    expect((luu as HTMLButtonElement).disabled).toBe(false);
    // Câu cảnh báo nói ĐÚNG địa chỉ sẽ nhận thư mới.
    expect(screen.getByRole('dialog').textContent).toContain('kt02.moi@csbh.test');

    await userEvent.click(luu);
    await waitFor(() => expect(goi.length).toBe(1));
    expect(goi[0]!.url).toContain('/admin/users/u2');
    expect(goi[0]!.body).toEqual({
      fullName: 'Tran Thi B',
      username: 'kt02',
      email: 'kt02.moi@csbh.test',
      role: 'KE_TOAN',
    });
  });
});

// =============================================================================
// `0070` — ô CÂU CHỮ trong bảng phải tự xuống dòng
// =============================================================================

describe('`0070` ghi chú trong ô bảng không kéo bảng ra ngang', () => {
  /*
   * `th, td { white-space: nowrap }` áp cho MỌI ô — đúng với mã, ngày và tiền,
   * sai với câu chữ: một ghi chú dài nong bảng ra theo chiều ngang, và người đọc
   * phải cuộn ngang để đọc hết một câu.
   *
   * Kiểm bằng CSS THẬT chứ không bằng tên lớp có mặt trên DOM: một quy tắc bị
   * xoá thì tên lớp vẫn còn nguyên, và ca kiểm thử vẫn xanh trong khi ô đã hết
   * xuống dòng. Trong jsdom thì không có bố cục để mà đo, nên đọc nguồn là cách
   * duy nhất còn lại.
   */
  const css = () => readFileSync('apps/web/src/styles/app.css', 'utf8');

  /** Các khai báo của khối CSS đầu tiên có bộ chọn khớp `re`. */
  const khoi = (re: RegExp): string[] =>
    [...css().matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => re.test(m[1]!))
      .map((m) => m[2]!);

  it('ô ghi chú, ô câu chữ và ô lỗi gốc đều được xuống dòng', () => {
    const k = khoi(/td\.ghi-chu|td\.o-cau-chu|td\.loi-goc/);
    expect(k.length, 'không tìm thấy luật nào cho ô câu chữ').toBeGreaterThan(0);
    expect(k.some((x) => /white-space:\s*normal/.test(x)), 'phải đảo nowrap').toBe(true);
    expect(k.some((x) => /overflow-wrap:/.test(x)), 'phải cho ngắt từ dài').toBe(true);
  });

  it('có TRẦN bề rộng, nếu không thì nó nong cột thay vì xuống dòng', () => {
    // Xuống dòng thôi chưa đủ: bảng ở chế độ tự co vẫn nong cột ra tới hết chỗ
    // rồi mới ngắt. Trần bề rộng là thứ ép nó ngắt sớm.
    const k = khoi(/td\.ghi-chu|td\.o-cau-chu/);
    expect(k.some((x) => /max-width:/.test(x))).toBe(true);
  });

  it('`.loi-goc` — lỗi cũ, và ca này là thứ giữ nó không quay lại', () => {
    /*
     * `.loi-goc` khai `max-width: 28rem` và `overflow-wrap: anywhere` từ lâu,
     * nhưng `nowrap` thừa hưởng từ `td` nuốt cả hai: một chuỗi lỗi kỹ thuật dài
     * kéo bảng thư hỏng rộng gấp mấy lần màn hình, và không ai đọc được cột nào
     * khác nữa. Hai khai báo đứng đó suốt mà không có tác dụng gì.
     */
    expect(khoi(/\.loi-goc/).some((x) => /max-width:/.test(x))).toBe(true);
    expect(khoi(/td\.loi-goc/).some((x) => /white-space:\s*normal/.test(x))).toBe(true);
  });
});
