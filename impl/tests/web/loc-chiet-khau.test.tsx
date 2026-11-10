/**
 * @vitest-environment jsdom
 *
 * `0283` — ô lọc khoảng tỷ lệ chiết khấu của *Hồ sơ CSBH*.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { khoangChietKhau, moTaKhoang } from '@csbh/web/loc-chiet-khau';
import { OKhoangChietKhau } from '@csbh/web/o-khoang-chiet-khau';

afterEach(cleanup);

describe('khoangChietKhau — phần thuần', () => {
  it('cả hai đầu rỗng là không lọc gì, không phải lỗi', () => {
    expect(khoangChietKhau('', '')).toEqual({ tu: '', den: '', loi: null });
  });
  it('dấu phẩy của người dùng thành dấu chấm gửi máy chủ', () => {
    expect(khoangChietKhau('22,5', '30')).toEqual({ tu: '22.5', den: '30', loi: null });
  });
  it('chỉ một đầu: đầu kia là không giới hạn', () => {
    expect(khoangChietKhau('20', '')).toEqual({ tu: '20', den: '', loi: null });
    expect(khoangChietKhau('', '10')).toEqual({ tu: '', den: '10', loi: null });
  });
  it('hai đầu BẰNG nhau là hợp lệ (đúng một con số)', () => {
    expect(khoangChietKhau('20', '20').loi).toBeNull();
  });
  it('số đầu lớn hơn số cuối → lỗi, và KHÔNG gửi gì', () => {
    expect(khoangChietKhau('30', '12')).toEqual({
      tu: '',
      den: '',
      loi: 'Số đầu đang lớn hơn số cuối. Đổi chỗ hai số.',
    });
  });
  it.each(['101', '-1', 'abc', '2,555', '1000', '20,'])('"%s" không phải một tỷ lệ hợp lệ', (s) => {
    expect(khoangChietKhau(s, '').loi).not.toBeNull();
    expect(khoangChietKhau('', s).loi).not.toBeNull();
  });
  it('0 và 100 là hai biên hợp lệ', () => {
    expect(khoangChietKhau('0', '100').loi).toBeNull();
  });
  it('moTaKhoang đọc ra một câu', () => {
    expect(moTaKhoang('20', '25')).toBe('20% – 25%');
    expect(moTaKhoang('22.5', '')).toBe('từ 22,5% trở lên');
    expect(moTaKhoang('', '10')).toBe('đến 10%');
    expect(moTaKhoang('', '')).toBe('');
  });
});

describe('OKhoangChietKhau', () => {
  const Mau = ({ doi, dau = { tu: '', den: '' } }: { doi: (p: Record<string, string>) => void; dau?: { tu: string; den: string } }) => {
    const [v, datV] = useState(dau);
    return (
      <OKhoangChietKhau
        id="loc"
        tu={v.tu}
        den={v.den}
        doi={(p) => {
          doi(p);
          datV({ tu: p.discountFrom ?? '', den: p.discountTo ?? '' });
        }}
      />
    );
  };

  it('gõ hai đầu hợp lệ: MỘT lời gọi mang CẢ HAI khoá (hai lời gọi riêng thì lời sau ghi đè lời trước)', async () => {
    const doi = vi.fn();
    const nd = userEvent.setup();
    render(<Mau doi={doi} />);
    await nd.type(screen.getByLabelText('Từ'), '20');
    await nd.type(screen.getByLabelText('Đến'), '25');
    expect(doi).toHaveBeenLastCalledWith({ discountFrom: '20', discountTo: '25' });
  });

  it('chỉ gõ đầu "Từ": khoá "Đến" đi lên là chuỗi rỗng (nghĩa là gỡ)', async () => {
    const doi = vi.fn();
    render(<Mau doi={doi} />);
    await userEvent.setup().type(screen.getByLabelText('Từ'), '20');
    expect(doi).toHaveBeenLastCalledWith({ discountFrom: '20', discountTo: '' });
  });

  it('sai thứ tự: hiện lỗi dưới ô và KHÔNG gọi `doi` với khoảng sai', async () => {
    const doi = vi.fn();
    const nd = userEvent.setup();
    render(<Mau doi={doi} dau={{ tu: '', den: '12' }} />);
    doi.mockClear();
    await nd.type(screen.getByLabelText('Từ'), '30');
    expect(screen.getByRole('alert').textContent).toContain('Số đầu đang lớn hơn số cuối');
    // Lượt gõ "3" (3 ≤ 12) hợp lệ nên được gửi; lượt "30" thì không.
    for (const goi of doi.mock.calls) expect(Number(goi[0].discountFrom || 0)).toBeLessThanOrEqual(12);
    expect(doi).not.toHaveBeenCalledWith({ discountFrom: '30', discountTo: '12' });
  });

  it('gõ dở ("2,") không bị ghi đè bằng giá trị đang áp', async () => {
    const nd = userEvent.setup();
    render(<Mau doi={() => undefined} />);
    const o = screen.getByLabelText('Từ') as HTMLInputElement;
    await nd.type(o, '2,');
    expect(o.value).toBe('2,');
  });

  it('bộ lọc đổi từ NGOÀI (Xoá bộ lọc) thì ô theo', () => {
    const { rerender } = render(<OKhoangChietKhau id="loc" tu="20" den="25" doi={() => undefined} />);
    expect((screen.getByLabelText('Từ') as HTMLInputElement).value).toBe('20');
    rerender(<OKhoangChietKhau id="loc" tu="" den="" doi={() => undefined} />);
    expect((screen.getByLabelText('Từ') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Đến') as HTMLInputElement).value).toBe('');
  });

  it('đặt sẵn từ bộ lọc đã lưu: hiện dấu PHẨY', () => {
    render(<OKhoangChietKhau id="loc" tu="22.5" den="" doi={() => undefined} />);
    expect((screen.getByLabelText('Từ') as HTMLInputElement).value).toBe('22,5');
  });
});
