/**
 * @vitest-environment jsdom
 *
 * `0257` — kanban hồ sơ dựng thật trong DOM, `fetch` giả trả số đếm theo trạng thái.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { KanbanHoSo } from '@csbh/web/kanban-ho-so';
import { BoDinhTuyen } from '@csbh/web/router';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const DEM: Record<string, number> = { YEU_CAU_CHINH_SUA: 1, CHO_TBP_DUYET: 2, DANG_CO_HIEU_LUC: 7 };
const the = (st: string, i: number) => ({
  policyId: `${st}-${i}`,
  code: `CSBH-2026-${st}-${i}`,
  status: st,
  customerCode: 'KH-001',
  customerName: 'Nhà thuốc Minh Châu',
  appliedDate: '2026-11-01',
  tdvName: 'Lê Thu Hà',
  sapQuaHan: st === 'CHO_TBP_DUYET' && i === 0,
});

let goi: string[] = [];
beforeEach(() => {
  goi = [];
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      goi.push(u);
      const q = new URL(u, 'http://x').searchParams;
      const st = q.get('status') ?? '';
      if (u.includes('/reports/policies/count')) return json({ total: DEM[st] ?? 0 });
      const n = DEM[st] ?? 0;
      return json({ items: Array.from({ length: Math.min(n, 20) }, (_, i) => the(st, i)), nextCursor: null });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const mo = () =>
  render(
    <BoDinhTuyen>
      <KanbanHoSo vaiTro="TDV" truyVan={(t) => new URLSearchParams({ tdv: 'x', ...t }).toString()} locTrangThai={[]} lan={0} />
    </BoDinhTuyen>,
  );

describe('`0257` kanban hồ sơ', () => {
  it('cột theo thứ tự luồng, chỉ cột CÓ hồ sơ; ghi tên cột ẩn vì trống', async () => {
    mo();
    await screen.findByText('CSBH-2026-YEU_CAU_CHINH_SUA-0');
    const cot = [...document.querySelectorAll('.kb > .kb-cot')].map((e) => e.getAttribute('aria-label'));
    expect(cot).toEqual([
      'Yêu cầu chỉnh sửa, 1 hồ sơ',
      'Chờ TBP duyệt, 2 hồ sơ',
      'Đang có hiệu lực, 7 hồ sơ, đang gập',
    ]);
    expect(document.querySelector('.kb-an')!.textContent).toContain('Đang ẩn 8 cột không có hồ sơ: Nháp,');
  });

  it('bộ lọc của trang đi kèm MỌI lượt gọi; mỗi cột đếm và tải đúng trạng thái của nó', async () => {
    mo();
    await screen.findByText('CSBH-2026-CHO_TBP_DUYET-1');
    expect(goi.length).toBeGreaterThan(11);
    expect(goi.every((u) => u.includes('tdv=x'))).toBe(true);
    expect(goi.filter((u) => u.includes('/count')).length).toBe(11);
    // Cột GẬP chỉ đếm, không tải thẻ.
    expect(goi.some((u) => !u.includes('/count') && u.includes('status=DANG_CO_HIEU_LUC'))).toBe(false);
  });

  it('cột Việc của bạn tô viền, KHÔNG có nút gập; thẻ dẫn tới hồ sơ và báo sắp quá hạn', async () => {
    mo();
    await screen.findByText('CSBH-2026-CHO_TBP_DUYET-0');
    const viec = document.querySelector('.kb-cua-ban') as HTMLElement;
    expect(viec.getAttribute('aria-label')).toBe('Yêu cầu chỉnh sửa, 1 hồ sơ');
    expect(within(viec).queryByRole('button', { name: /Gập cột/ })).toBeNull();
    const lien = screen.getByRole('link', { name: /CSBH-2026-CHO_TBP_DUYET-0/ });
    expect(lien.getAttribute('href')).toBe('/ho-so/CHO_TBP_DUYET-0');
    expect(within(lien).getByText('Sắp quá hạn')).toBeTruthy();
  });

  it('mở một cột gập: tải thẻ, NHỚ qua lần sau; "Về bộ cột mặc định" gập lại', async () => {
    mo();
    await screen.findByText('CSBH-2026-YEU_CAU_CHINH_SUA-0');
    fireEvent.click(screen.getByRole('button', { name: /Đang có hiệu lực|Mở cột Đang có hiệu lực/ }));
    await screen.findByText('CSBH-2026-DANG_CO_HIEU_LUC-6');
    expect(JSON.parse(localStorage.getItem('csbh:kanban-cot:TDV')!)).toEqual({ DANG_CO_HIEU_LUC: 'mo' });

    cleanup();
    mo();
    await screen.findByText('CSBH-2026-DANG_CO_HIEU_LUC-0');
    fireEvent.click(screen.getByRole('button', { name: 'Về bộ cột mặc định' }));
    await waitFor(() => expect(document.querySelector('.kb-gap')).not.toBeNull());
    expect(localStorage.getItem('csbh:kanban-cot:TDV')).toBeNull();
  });
});
