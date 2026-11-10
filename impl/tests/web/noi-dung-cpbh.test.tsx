/**
 * @vitest-environment jsdom
 *
 * `0268` — NỘI DUNG từng khoản CPBH (khách hàng chốt 08/11/2026), và dải *+ Thêm
 * khoản chi phí* thôi dính đáy ngăn trượt (cách 1).
 *
 * Hộp thoại: mỗi khoản một khung (số tiền + nội dung), gửi `cpbhNoiDung` ĐỦ một
 * phần tử cho mỗi khoản; bớt một khoản là bớt cả nội dung CỦA NÓ. Bảng: dấu `?`
 * cạnh ĐÚNG con số của khoản có nội dung (phương án B).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemDongSanPham } from '@csbh/web/sua-ho-so-ui';
import { BangSanPham, type DongSanPham } from '@csbh/web/bang-san-pham';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const phanHoi = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const XEM_TRUOC = {
  productId: 'sp-1', productCode: 'SP-01', productName: 'Nutricare Gold', companyPrice: '125000',
  threshold: '25.00', thresholdRate2: 2500, thresholdSource: 'RULE', ruleCode: 'QD-01',
};

const chanFetch = () => {
  const f = vi.fn((duong: unknown, _init?: RequestInit) => {
    const d = String(duong);
    if (d.includes('/threshold-preview')) return Promise.resolve(phanHoi(200, XEM_TRUOC));
    if (d.includes('/catalog/products')) return Promise.resolve(phanHoi(200, { items: [{ id: 'sp-1', code: 'SP-01', name: 'Nutricare Gold' }] }));
    return Promise.resolve(phanHoi(200, {}));
  });
  vi.stubGlobal('fetch', f);
  return f;
};

/** Thân của lượt GHI dòng (POST thêm / PATCH sửa) đã gửi. */
const thanGhi = (f: ReturnType<typeof chanFetch>) => {
  const goi = f.mock.calls.find(([d, init]) => /\/lines/.test(String(d)) && init?.method && init.method !== 'GET');
  expect(goi, 'không có lượt ghi dòng nào').toBeDefined();
  return JSON.parse(String(goi![1]!.body)) as { cpbh: string[]; cpbhNoiDung: string[] };
};

const oNoiDung = (i: number) => screen.getByRole('textbox', { name: `Nội dung khoản chi phí ${i}` });

describe('`0268` hộp thoại: ô Nội dung cho từng khoản', () => {
  const moVaChon = async () => {
    const f = chanFetch();
    render(<ThemDongSanPham hoSoId="hs-9" dong={() => undefined} xong={() => undefined} />);
    const nguoi = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('option', { name: /Nutricare Gold/ })).toBeDefined());
    await nguoi.selectOptions(screen.getByRole('combobox'), 'sp-1');
    await nguoi.type(screen.getByLabelText(/Giá bán buôn/), '100000');
    return { f, nguoi };
  };

  it('mỗi khoản có một ô Nội dung KHÔNG bắt buộc, cùng khung với ô số tiền', async () => {
    await moVaChon();
    const o = oNoiDung(1);
    expect(o.hasAttribute('required')).toBe(false);
    expect(o.getAttribute('maxlength')).toBe('200');
    expect(o.closest('.khoan-cpbh')).toBe(screen.getByLabelText(/^CPBH 1/).closest('.khoan-cpbh'));
  });

  it('gửi cpbhNoiDung ĐỦ một phần tử cho mỗi khoản, cắt khoảng trắng, rỗng vẫn giữ chỗ', async () => {
    const { f, nguoi } = await moVaChon();
    await nguoi.type(screen.getByLabelText(/^CPBH 1/), '3000');
    await nguoi.click(screen.getByRole('button', { name: /Thêm khoản chi phí/ }));
    await nguoi.click(screen.getByRole('button', { name: /Thêm khoản chi phí/ }));
    await nguoi.type(screen.getByLabelText(/^CPBH 2/), '2000');
    await nguoi.type(screen.getByLabelText(/^CPBH 3/), '1000');
    await nguoi.type(oNoiDung(1), '  Trưng bày tại quầy  ');
    await nguoi.type(oNoiDung(3), 'Quà tặng');
    await nguoi.click(screen.getByRole('button', { name: /Xác nhận/ }));
    await waitFor(() => expect(thanGhi(f).cpbhNoiDung).toEqual(['Trưng bày tại quầy', '', 'Quà tặng']));
    expect(thanGhi(f).cpbh).toHaveLength(3);
  });

  it('BỚT khoản giữa: nội dung của khoản sau KHÔNG dời sang mô tả khoản khác', async () => {
    const { f, nguoi } = await moVaChon();
    await nguoi.click(screen.getByRole('button', { name: /Thêm khoản chi phí/ }));
    await nguoi.click(screen.getByRole('button', { name: /Thêm khoản chi phí/ }));
    await nguoi.type(oNoiDung(1), 'A');
    await nguoi.type(oNoiDung(2), 'B');
    await nguoi.type(oNoiDung(3), 'C');
    await nguoi.click(screen.getByRole('button', { name: 'Bớt CPBH 2' }));
    expect((oNoiDung(1) as HTMLInputElement).value).toBe('A');
    expect((oNoiDung(2) as HTMLInputElement).value).toBe('C');
    await nguoi.click(screen.getByRole('button', { name: /Xác nhận/ }));
    await waitFor(() => expect(thanGhi(f).cpbhNoiDung).toEqual(['A', 'C']));
  });

  it('SỬA: nạp sẵn nội dung của dòng cũ theo đúng khoản', async () => {
    chanFetch();
    const dongCu = {
      id: 'l1', productId: 'sp-1', productCode: 'SP-01', productName: 'Nutricare Gold',
      companyPrice: '125000', wholesalePrice: '100000', cpbh: ['3000', '1000'], cpbhNoiDung: ['', 'Quà tặng'],
      cpbhTotal: '4000', netPrice: '96000', discountRate: '23.20', threshold: '25.00', overThreshold: false,
      ngayApDung: '2026-08-01',
    } as DongSanPham;
    render(<ThemDongSanPham hoSoId="hs-9" dongCu={dongCu} dong={() => undefined} xong={() => undefined} />);
    await waitFor(() => expect((oNoiDung(2) as HTMLInputElement).value).toBe('Quà tặng'));
    expect((oNoiDung(1) as HTMLInputElement).value).toBe('');
  });

  it('cách 1: trong biểu mẫu, ĐÚNG MỘT dải nút khớp luật dính đáy — dải chứa nút gửi', async () => {
    await moVaChon();
    const css = readFileSync('apps/web/src/styles/app.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const luat = [...css.matchAll(/([^{}]*\.hop-thoai form[^{}]*)\{([^}]*)\}/g)].filter((m) => /position:\s*sticky/.test(m[2]!));
    expect(luat, 'phải có đúng một luật dính đáy cho biểu mẫu trong hộp thoại').toHaveLength(1);
    const chon = luat[0]![1]!.trim();
    expect(chon).toContain(':has(button[type="submit"])');
    // Chạy CHÍNH bộ chọn ấy trên hộp thoại thật .
    const khop = [...document.querySelectorAll(chon)];
    expect(khop, 'số dải nút dính đáy').toHaveLength(1);
    expect(khop[0]!.querySelector('button[type="submit"]')).not.toBeNull();
    expect(within(khop[0] as HTMLElement).queryByRole('button', { name: /Thêm khoản chi phí/ })).toBeNull();
  });
});

describe('`0268` bảng: dấu ? cạnh ĐÚNG con số của khoản có nội dung', () => {
  const dong = (p: Partial<DongSanPham> = {}): DongSanPham => ({
    id: 'd1', productId: 'sp-1', productCode: 'SP-01', productName: 'Nutricare Gold',
    companyPrice: '100000', wholesalePrice: '90000', cpbh: ['3000', '1000'], cpbhTotal: '4000',
    netPrice: '86000', discountRate: '14.00', threshold: '30.00', overThreshold: false, ...p,
  });

  it('chỉ khoản có nội dung mới mang dấu; dấu nằm TRONG ô của khoản ấy', () => {
    render(<BangSanPham dong={[dong({ cpbhNoiDung: ['', 'Quà tặng kèm'] })]} />);
    const bang = screen.getByRole('table');
    const dau = bang.querySelectorAll('.dau-noi-dung');
    expect(dau).toHaveLength(1);
    const nut = dau[0] as HTMLElement;
    expect(nut.getAttribute('aria-label')).toBe('Nội dung CPBH 2: Quà tặng kèm');
    // `0269` — chữ rê chuột là NGUYÊN VĂN nội dung, không tiền tố tên khoản.
    expect(nut.getAttribute('title')).toBe('Quà tặng kèm');
    // Ô chứa dấu là ô mang con số 1.000 (khoản 2), không phải ô tổng hay khoản 1.
    expect(nut.closest('td')!.textContent).toContain('1.000');
  });

  it('không có nội dung (hoặc máy chủ cũ không trả trường) thì không có dấu nào', () => {
    render(<BangSanPham dong={[dong(), dong({ id: 'd2', productCode: 'SP-02', cpbhNoiDung: ['  ', ''] })]} />);
    expect(screen.getByRole('table').querySelectorAll('.dau-noi-dung')).toHaveLength(0);
  });

  it('bố cục thẻ: dấu đi cùng khoản trong danh sách CPBH gấp', async () => {
    render(<BangSanPham dong={[dong({ cpbhNoiDung: ['Trưng bày', ''] })]} />);
    const the = document.querySelector('.the-san-pham .the') as HTMLElement;
    await userEvent.click(within(the).getByRole('button', { name: /CPBH/ }));
    expect(within(the).getByRole('button', { name: 'Nội dung CPBH 1: Trưng bày' })).toBeDefined();
  });
});
