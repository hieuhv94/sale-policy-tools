/**
 * @vitest-environment jsdom
 *
 * `0082` — lịch sử CSBH của một khách hàng.
 *
 * Màn hình khách hàng tới giờ chỉ có *CSBH đang áp dụng* — đúng một hồ sơ, đúng
 * hiện tại. Câu hỏi *"khách này từng áp dụng những chính sách nào, và bản nào
 * thay bản nào lúc nào"* không trả lời được ở đâu cả.
 *
 * Thứ đáng kiểm ở đây KHÔNG phải là bảng có vẽ ra hay không, mà là hai chỗ dễ
 * nói dối: mốc thay thế, và ô trống.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LichSuCsbh } from '@csbh/web/lich-su-csbh';
import { BoDinhTuyen } from '@csbh/web/router';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const V1 = {
  id: 'p-1',
  code: 'CSBH-2026-000001',
  versionNo: 1,
  status: 'HET_HIEU_LUC',
  appliedDate: '2026-01-05',
  effectiveFrom: '2026-01-06T03:00:00.000Z',
  deactivatedAt: '2026-03-10T08:15:00.000Z',
  supersedesId: null,
  supersededById: 'p-2',
};

const V2 = {
  id: 'p-2',
  code: 'CSBH-2026-000042',
  versionNo: 2,
  status: 'DANG_CO_HIEU_LUC',
  appliedDate: '2026-03-01',
  effectiveFrom: '2026-03-10T08:15:00.000Z',
  deactivatedAt: null,
  supersedesId: 'p-1',
  supersededById: null,
};

const chan = (items: unknown[]) => {
  const f = vi.fn(() => Promise.resolve(json({ items, total: items.length })));
  vi.stubGlobal('fetch', f);
  return f;
};

const mo = () =>
  render(
    <BoDinhTuyen>
      <LichSuCsbh khachHangId="kh-1" />
    </BoDinhTuyen>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('`0082` lịch sử CSBH', () => {
  it('liệt kê MỌI phiên bản, không chỉ bản đang hiệu lực', async () => {
    chan([V2, V1]);
    mo();
    // Tìm theo LIÊN KẾT, không theo chữ: mã của bản mới xuất hiện HAI lần —
    // một lần là dòng của chính nó, một lần trong ô *Bị thay bởi* của bản cũ.
    // Đó là điều đúng, và ca sau kiểm chính nó.
    await waitFor(() => expect(screen.getByRole('link', { name: V1.code })).toBeDefined());
    expect(screen.getByRole('link', { name: V2.code })).toBeDefined();
  });

  it('cột *Bị thay bởi* hiện MÃ của bản đã thay, không hiện uuid', async () => {
    /*
     * Máy chủ trả về `supersededById` — một uuid, thứ không ai đọc được. Màn
     * hình tra ngược sang mã hồ sơ NGAY TRONG danh sách đã tải, không gọi thêm
     * một lượt mạng cho mỗi dòng.
     */
    chan([V2, V1]);
    mo();
    const hang = await waitFor(() => screen.getByRole('link', { name: V1.code }).closest('tr')!);
    expect(hang.textContent).toContain('CSBH-2026-000042');
    expect(hang.textContent, 'uuid lọt ra màn hình').not.toContain('p-2');
  });

  it('MỐC thay thế hiện cả GIỜ, không chỉ ngày', async () => {
    /*
     * Hai phiên bản thay nhau trong CÙNG một ngày là chuyện thường — bản mới có
     * hiệu lực đúng lúc kế toán tiếp nhận lần 2, và bản cũ chết cùng giây ấy.
     * Chỉ hiện ngày thì hai dòng trông như cùng lúc và không ai đọc ra thứ tự.
     */
    chan([V2, V1]);
    mo();
    const hang = await waitFor(() => screen.getByRole('link', { name: V1.code }).closest('tr')!);
    expect(hang.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it('bản CHƯA bị thay thì hai ô mốc là gạch ngang, không phải ô trống', async () => {
    /*
     * Ô trống đọc ra là "chưa có dữ liệu"; gạch ngang đọc ra là "không có, và
     * đúng là không có". Với một CSBH đang hiệu lực thì vế thứ hai mới đúng —
     * nó chưa bị thay, và có thể không bao giờ bị thay.
     */
    chan([V2]);
    mo();
    const hang = await waitFor(() => screen.getByRole('link', { name: V2.code }).closest('tr')!);
    const o = [...hang.querySelectorAll('td')].map((td) => td.textContent?.trim());
    expect(o.filter((x) => x === '—').length, 'phải có 2 ô gạch ngang').toBe(2);
    expect(o.some((x) => x === ''), 'còn ô trống chưa giải thích').toBe(false);
  });

  it('khách chưa có CSBH nào thì NÓI RA, không để bảng rỗng', async () => {
    chan([]);
    mo();
    await waitFor(() => expect(screen.getByText(/Chưa có CSBH nào/)).toBeDefined());
    expect(document.querySelector('table'), 'bảng rỗng vẫn hiện').toBeNull();
  });

  it('nói thẳng CSBH không có ngày hết hạn', async () => {
    // Câu chữ này chống một hiểu nhầm cụ thể: người đọc thấy cột *Hết hiệu lực*
    // trống ở bản mới nhất và đi tìm "hạn" của nó. Không có hạn nào cả — muc 5.2.
    chan([V2, V1]);
    mo();
    await waitFor(() => expect(document.body.textContent).toContain('không có ngày hết hạn'));
  });
});
