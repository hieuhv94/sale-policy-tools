/**
 * @vitest-environment jsdom
 *
 * 0030 — phân trang, tối đa 20 mục một trang, ở MỌI danh sách.
 *
 * Trước đợt này mỗi màn hình tự chọn một con số: hồ sơ 50, người dùng 200, nhật
 * ký 100, hộp việc 100. Không con số nào sai riêng lẻ, nhưng gộp lại thì không
 * màn hình nào nói cho người dùng biết họ đang nhìn một phần hay toàn bộ — và
 * với danh sách bị cắt trong im lặng, người dùng luôn tin mình nhìn toàn bộ.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhanTrang } from '@csbh/web/phan-trang-ui';
import { MOI_TRANG, soTrangCua, trangCua, useTrangMay } from '@csbh/web/phan-trang';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('0030 cỡ trang là một hằng số dùng chung', () => {
  it('đúng 20 mục một trang', () => {
    expect(MOI_TRANG).toBe(20);
  });

  it('số trang làm tròn LÊN, và danh sách rỗng vẫn là một trang', () => {
    // Không phải 0 trang: một thanh "Trang 0 / 0" là thứ không đọc được.
    expect(soTrangCua(0)).toBe(1);
    expect(soTrangCua(1)).toBe(1);
    expect(soTrangCua(20)).toBe(1);
    expect(soTrangCua(21)).toBe(2);
    expect(soTrangCua(41)).toBe(3);
  });

  it('cắt đúng lát, trang đếm từ 1', () => {
    const ds = Array.from({ length: 45 }, (_, i) => i);
    expect(trangCua(ds, 1)).toHaveLength(20);
    expect(trangCua(ds, 1)[0]).toBe(0);
    expect(trangCua(ds, 2)[0]).toBe(20);
    expect(trangCua(ds, 3)).toHaveLength(5);
    // Trang quá tay trả rỗng chứ không ném — số trang co lại khi dữ liệu co lại.
    expect(trangCua(ds, 9)).toHaveLength(0);
  });
});

describe('0030 thanh phân trang', () => {
  const ve = (trang: number, soTrang: number, doiTrang = () => undefined) =>
    render(<PhanTrang trang={trang} soTrang={soTrang} tong={soTrang * 20} doiTrang={doiTrang} />);

  it('ẨN HẲN khi chỉ có một trang', () => {
    // Danh sách 6 dòng không cần ai nói cho biết nó chỉ có một trang.
    ve(1, 1);
    expect(document.querySelector('.phan-trang')).toBeNull();
  });

  it('nói rõ đang ở trang mấy trên mấy, và tổng bao nhiêu mục', () => {
    ve(2, 5);
    const nav = screen.getByRole('navigation', { name: 'Phân trang' });
    expect(nav.textContent).toContain('Trang');
    expect(nav.textContent).toContain('2');
    expect(nav.textContent).toContain('5');
    expect(nav.textContent).toContain('100');
  });

  it('trang đầu thì nút Trước TẮT, trang cuối thì nút Sau tắt', () => {
    ve(1, 3);
    expect((screen.getByRole('button', { name: /Trước/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Sau/ }) as HTMLButtonElement).disabled).toBe(false);

    cleanup();
    ve(3, 3);
    expect((screen.getByRole('button', { name: /Trước/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Sau/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('bấm Sau và Trước gọi đúng số trang liền kề', async () => {
    const nguoi = userEvent.setup();
    const doi = vi.fn();
    ve(2, 5, doi);
    await nguoi.click(screen.getByRole('button', { name: /Sau/ }));
    expect(doi).toHaveBeenCalledWith(3);
    await nguoi.click(screen.getByRole('button', { name: /Trước/ }));
    expect(doi).toHaveBeenCalledWith(1);
  });

  it('có aria-live để trình đọc màn hình biết đã sang trang', () => {
    // Nội dung đổi ở nơi khác trên màn hình, ngoài tiêu điểm bàn phím — không có
    // vùng sống thì người dùng bấm Sau và không có gì báo là đã sang trang.
    ve(2, 5);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

/** Màn hình tí hon chỉ để chạy hook — hook không gọi được ngoài component. */
function ManHinhThu({ duong }: { duong: string }) {
  const { muc, tong, trang, soTrang, doiTrang } = useTrangMay<{ id: string }>(duong);
  return (
    <div>
      <ul data-testid="ds">{(muc ?? []).map((m) => <li key={m.id}>{m.id}</li>)}</ul>
      <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} />
    </div>
  );
}

describe('0030 useTrangMay gọi máy chủ đúng cách', () => {
  const goi: string[] = [];
  const chan = (total: number) => {
    goi.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((duong: unknown) => {
        const d = String(duong);
        goi.push(d);
        const off = Number(new URL(d, 'http://x').searchParams.get('offset') ?? '0');
        const con = Math.max(0, Math.min(MOI_TRANG, total - off));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: Array.from({ length: con }, (_, i) => ({ id: `m-${off + i}` })),
              total,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }),
    );
  };

  it('luôn xin đúng 20 dòng, và offset theo trang', async () => {
    chan(45);
    const nguoi = userEvent.setup();
    render(<ManHinhThu duong="/thu" />);
    await waitFor(() => expect(screen.getByText('m-0')).toBeDefined());
    expect(goi[0]).toContain('limit=20');
    expect(goi[0]).toContain('offset=0');

    await nguoi.click(screen.getByRole('button', { name: /Sau/ }));
    await waitFor(() => expect(screen.getByText('m-20')).toBeDefined());
    expect(goi.at(-1)).toContain('offset=20');
  });

  it('nối tham số bằng & khi đường dẫn đã có dấu hỏi', async () => {
    // Nối nhầm bằng `?` thứ hai thì máy chủ đọc `limit` thành một phần của tham
    // số trước đó, và trang 2 im lặng trả về trang 1.
    chan(45);
    render(<ManHinhThu duong="/thu?open=true" />);
    await waitFor(() => expect(goi.length).toBeGreaterThan(0));
    expect(goi[0]).toContain('/thu?open=true&limit=20');
  });

  it('KHÔNG bao giờ hiện quá 20 dòng một trang', async () => {
    chan(45);
    render(<ManHinhThu duong="/thu" />);
    await waitFor(() => expect(screen.getByText('m-0')).toBeDefined());
    expect(within(screen.getByTestId('ds')).getAllByRole('listitem')).toHaveLength(20);
  });

  it('đổi đường dẫn (đổi bộ lọc) thì VỀ TRANG 1', async () => {
    // Đứng ở trang 7 của kết quả cũ mà lọc lại thì trang 7 của kết quả mới
    // thường rỗng, và màn hình trắng ngay sau khi gõ từ khoá đọc ra là "không
    // tìm thấy gì".
    chan(45);
    const nguoi = userEvent.setup();
    const { rerender } = render(<ManHinhThu duong="/thu" />);
    await waitFor(() => expect(screen.getByText('m-0')).toBeDefined());
    await nguoi.click(screen.getByRole('button', { name: /Sau/ }));
    await waitFor(() => expect(screen.getByText('m-20')).toBeDefined());

    rerender(<ManHinhThu duong="/thu?q=abc" />);
    await waitFor(() => expect(goi.at(-1)).toContain('offset=0'));
  });
});
