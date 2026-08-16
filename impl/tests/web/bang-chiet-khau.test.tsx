/**
 * @vitest-environment jsdom
 *
 * 0023 — bảng Quy định chiết khấu: cột **Id**, bỏ **Độ cụ thể**, và ô tìm kiếm.
 *
 * Ba thay đổi này là một chuỗi, không phải ba việc rời: cột *Độ cụ thể* từng là
 * câu trả lời cho "vì sao hồ sơ này lấy ngưỡng 25% chứ không 30%", nhưng nó bắt
 * người đọc tự học luật trọng số. Câu trả lời mới là **mã quy định** — hồ sơ mang
 * mã ở cột QĐCK, dán vào ô tìm ở đây là ra thẳng dòng cần xem. Bỏ cột cũ mà
 * quên một trong hai mảnh kia là bỏ đi một câu trả lời và không đưa lại gì.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TheChietKhau } from '@csbh/web/chiet-khau-ui';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const QUY_DINH = [
  {
    code: 'CK-SUA-L1',
    productGroupCode: 'SUA',
    customerType: 1,
    effectiveFrom: '2026-01-01',
    thresholdRate2: 2500,
    specificity: 3,
  },
  {
    code: 'CK-BOT-CHUNG',
    productGroupCode: 'BOT',
    customerType: null,
    effectiveFrom: '2026-01-01',
    thresholdRate2: 3000,
    specificity: 2,
  },
];

const phanHoi = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const chanFetch = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/discount-rules')) return Promise.resolve(phanHoi({ items: QUY_DINH }));
      return Promise.resolve(phanHoi({}));
    }),
  );

const bay = async () => {
  chanFetch();
  render(<TheChietKhau nhom={[]} />);
  return waitFor(() => screen.getByRole('table'));
};

describe('0023 cột Id thay cho Độ cụ thể', () => {
  it('có cột Id, và nó mang mã đầy đủ của quy định', async () => {
    const bang = await bay();
    expect(within(bang).getByText('Id')).toBeDefined();
    // Mã hiện NGUYÊN VẸN: nó dùng để chép, cắt bớt là cắt luôn công dụng.
    expect(within(bang).getByText('CK-SUA-L1')).toBeDefined();
  });

  it('KHÔNG còn cột Độ cụ thể', async () => {
    const bang = await bay();
    expect(within(bang).queryByText('Độ cụ thể')).toBeNull();
    // Và con số của nó cũng không lọt ra chỗ nào khác trong bảng.
    expect(within(bang).queryByText('3')).toBeNull();
  });

  it('vẫn còn đủ ba cột nội dung còn lại', async () => {
    const bang = await bay();
    const tieuDe = within(bang)
      .getAllByRole('columnheader')
      .map((t) => t.textContent);
    expect(tieuDe).toEqual(['Id', 'Áp dụng cho', 'Ngưỡng', 'Hiệu lực', 'Thao tác']);
  });

  it('chế độ chỉ xem không có cột Thao tác, nhưng vẫn có Id', async () => {
    chanFetch();
    render(<TheChietKhau nhom={[]} chiXem />);
    const bang = await waitFor(() => screen.getByRole('table'));
    const tieuDe = within(bang)
      .getAllByRole('columnheader')
      .map((t) => t.textContent);
    expect(tieuDe).toEqual(['Id', 'Áp dụng cho', 'Ngưỡng', 'Hiệu lực']);
  });
});

describe('0023 tìm kiếm quy định chiết khấu', () => {
  const go = async (chu: string) => {
    const nguoi = userEvent.setup();
    await nguoi.type(screen.getByRole('searchbox'), chu);
  };

  it('dán nguyên mã thì còn đúng một dòng', async () => {
    await bay();
    await go('CK-BOT-CHUNG');
    await waitFor(() => {
      const bang = screen.getByRole('table');
      expect(within(bang).queryByText('CK-SUA-L1')).toBeNull();
      expect(within(bang).getByText('CK-BOT-CHUNG')).toBeDefined();
    }, { timeout: 3000 });
  });

  it('nói rõ còn bao nhiêu dòng khớp', async () => {
    // Không có con số này thì lọc xong người dùng không biết mình đang nhìn một
    // bảng đã bị cắt hay là bảng đầy đủ.
    await bay();
    await go('SUA');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1 quy định'), {
      timeout: 3000,
    });
  });

  it('không khớp gì thì nói KHÔNG KHỚP, không bày lại cả bảng', async () => {
    await bay();
    await go('zzz-khong-co');
    await waitFor(() => {
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getByText(/Không có quy định nào khớp/)).toBeDefined();
    }, { timeout: 3000 });
  });

  it('xoá hết từ khoá thì bảng trở lại đủ dòng', async () => {
    const nguoi = userEvent.setup();
    await bay();
    await go('SUA');
    await waitFor(() => expect(screen.getByRole('status')).toBeDefined(), { timeout: 3000 });
    await nguoi.clear(screen.getByRole('searchbox'));
    await waitFor(() => {
      const bang = screen.getByRole('table');
      expect(within(bang).getAllByRole('row')).toHaveLength(3); // 1 tiêu đề + 2 dòng
    }, { timeout: 3000 });
  });
});
