/**
 * @vitest-environment jsdom
 *
 * `0280` — ô chọn có gõ (`ChonCoGo`).
 *
 * Các luật nằm ở hành vi, không ở hình dạng: gõ không dấu vẫn ra, chữ gõ không
 * bao giờ thành giá trị, Escape đóng danh sách mà KHÔNG đóng hộp thoại, Enter
 * khi danh sách mở chọn mục chứ không gửi biểu mẫu.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChonCoGo, boDau, locMuc, type MucChon } from '@csbh/web/chon-co-go';
import { HopThoai } from '@csbh/web/chung';
import { giaTri } from './chon-co-go.js';

afterEach(cleanup);

const DS: MucChon[] = [
  { gia: 'HN', nhan: 'Hà Nội' },
  { gia: 'HP', nhan: 'Hải Phòng' },
  { gia: 'DN', nhan: 'Đà Nẵng' },
  { gia: 'HCM', nhan: 'Hồ Chí Minh', phu: 'TP.HCM' },
  { gia: 'CU', nhan: 'Tỉnh cũ', tat: true },
];

function Mau({ mucRong, doi }: { mucRong?: string; doi?: (v: string) => void }) {
  const [v, datV] = useState('');
  return (
    <>
      <label htmlFor="o">Tỉnh</label>
      <ChonCoGo
        id="o"
        giaTri={v}
        doi={(x) => {
          datV(x);
          doi?.(x);
        }}
        ds={DS}
        {...(mucRong ? { mucRong } : {})}
      />
    </>
  );
}

describe('lọc thuần', () => {
  it('bỏ dấu, kể cả đ/Đ', () => {
    expect(boDau('Đà Nẵng')).toBe('da nang');
    expect(boDau('Hồ Chí Minh')).toBe('ho chi minh');
  });
  it('gõ không dấu ra tên có dấu; so cả dòng phụ; rỗng thì trả cả danh sách', () => {
    expect(locMuc(DS, 'ha noi').map((m) => m.gia)).toEqual(['HN']);
    expect(locMuc(DS, 'da n').map((m) => m.gia)).toEqual(['DN']);
    expect(locMuc(DS, 'tp.hcm').map((m) => m.gia)).toEqual(['HCM']);
    expect(locMuc(DS, '  ')).toHaveLength(DS.length);
    expect(locMuc(DS, 'xyz')).toEqual([]);
  });
});

describe('hành vi', () => {
  it('bấm vào ô sổ ra ĐỦ danh sách; chọn một mục thì ô hiện nhãn, giá trị nằm ở data-gia', async () => {
    const nd = userEvent.setup();
    render(<Mau />);
    const o = screen.getByLabelText('Tỉnh');
    expect(giaTri(o)).toBe('');
    await nd.click(o);
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(DS.length);
    await nd.click(screen.getByRole('option', { name: /Hải Phòng/ }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((o as HTMLInputElement).value).toBe('Hải Phòng');
    expect(giaTri(o)).toBe('HP');
  });

  it('chữ gõ KHÔNG thành giá trị: rời ô mà chưa chọn thì ô trả về mục đang chọn', async () => {
    const nd = userEvent.setup();
    render(<Mau />);
    const o = screen.getByLabelText('Tỉnh') as HTMLInputElement;
    await nd.click(o);
    await nd.type(o, 'xyz');
    expect(screen.getByText(/Không có mục nào khớp/)).toBeDefined();
    await nd.tab();
    expect(giaTri(o)).toBe('');
    expect(o.value).toBe('');
  });

  it('mục tắt (giá trị cũ) hiện ra nhưng KHÔNG chọn được', async () => {
    const nd = userEvent.setup();
    const doi = vi.fn();
    render(<Mau doi={doi} />);
    await nd.click(screen.getByLabelText('Tỉnh'));
    await nd.click(screen.getByRole('option', { name: /Tỉnh cũ/ }));
    expect(doi).not.toHaveBeenCalled();
  });

  it('bàn phím: ↓ ↓ Enter chọn mục thứ ba; Enter KHÔNG gửi biểu mẫu khi danh sách mở', async () => {
    const nd = userEvent.setup();
    const gui = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={gui}>
        <Mau />
        <button type="submit">Gửi</button>
      </form>,
    );
    const o = screen.getByLabelText('Tỉnh');
    await nd.click(o);
    await nd.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(giaTri(o)).toBe('DN');
    expect(gui).not.toHaveBeenCalled();
    // Danh sách đã đóng: Enter lúc này là Enter của biểu mẫu.
    await nd.keyboard('{Enter}');
    expect(gui).toHaveBeenCalledTimes(1);
  });

  it('đã chọn xong (ô còn tiêu điểm) thì bấm lại mở lại danh sách', async () => {
    const nd = userEvent.setup();
    render(<Mau />);
    const o = screen.getByLabelText('Tỉnh');
    await nd.click(o);
    await nd.click(screen.getByRole('option', { name: /Hà Nội/ }));
    await nd.click(o);
    expect(screen.getByRole('listbox')).toBeDefined();
  });

  it('có `mucRong`: mục rỗng đứng đầu khi CHƯA gõ, và chọn nó trả về chuỗi rỗng', async () => {
    const nd = userEvent.setup();
    const doi = vi.fn();
    render(<Mau mucRong="— Mọi nhóm —" doi={doi} />);
    const o = screen.getByLabelText('Tỉnh') as HTMLInputElement;
    expect(o.value).toBe('— Mọi nhóm —');
    await nd.click(o);
    const ds = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(ds[0]!.getAttribute('data-gia')).toBe('');
    await nd.click(screen.getByRole('option', { name: /Hà Nội/ }));
    await nd.click(o);
    await nd.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]!);
    expect(doi).toHaveBeenLastCalledWith('');
    // Gõ rồi thì mục rỗng không khớp chữ gõ — nó biến mất.
    await nd.click(o);
    await nd.type(o, 'ha');
    expect(screen.queryByRole('option', { name: /Mọi nhóm/ })).toBeNull();
  });

  it('Escape đóng DANH SÁCH nhưng KHÔNG đóng hộp thoại chứa nó', async () => {
    const nd = userEvent.setup();
    const dong = vi.fn();
    render(
      <HopThoai tieuDe="Thử" dong={dong}>
        <Mau />
      </HopThoai>,
    );
    await nd.click(screen.getByLabelText('Tỉnh'));
    expect(screen.getByRole('listbox')).toBeDefined();
    await nd.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(dong).not.toHaveBeenCalled();
    // Lần Escape thứ hai (danh sách đã đóng) thì hộp thoại đóng như thường.
    await nd.keyboard('{Escape}');
    expect(dong).toHaveBeenCalled();
  });

  it('khớp được tô đậm đúng chữ đã gõ, kể cả khi gõ không dấu', async () => {
    const nd = userEvent.setup();
    render(<Mau />);
    const o = screen.getByLabelText('Tỉnh');
    await nd.click(o);
    await nd.type(o, 'ha n');
    const mark = screen.getByRole('listbox').querySelector('mark');
    expect(mark?.textContent).toBe('Hà N');
  });
});
