/**
 * @vitest-environment jsdom
 *
 * `0051` — nút **Xem** trên từng tệp đính kèm (muc 11.1, món nợ N-02).
 *
 * Chuỗi gọi ở đây là chỗ dễ làm sai nhất, và nó KHÔNG rút ngắn được:
 *
 *   1. `GET /files?ownerKind=POLICY&ownerId=…` — đổi `objectKey` trên hồ sơ sang
 *      `id` của file trên kho. Hồ sơ chỉ giữ con trỏ, không giữ id.
 *   2. `GET /files/:id/link` — xin một token cấp riêng cho ĐÚNG người đang gọi
 *      (DOC-09). Không có URL công khai nào trên kho lưu trữ.
 *   3. Mới mở được nội dung.
 *
 * Hộp xem KHÔNG tự làm hai bước đầu: nó chỉ nhận một đường và vẽ. Đưa hai bước
 * ấy vào trong nó là bắt một hộp thoại dùng chung biết luật đính kèm của hồ sơ.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TepDinhKem } from '@csbh/web/tep-dinh-kem';

const TEP = [
  {
    id: 'dk-1',
    kind: 'SCAN',
    fileName: 'ban-cung-da-ky.pdf',
    objectKey: 'scan/hs-1.pdf',
    uploadedAt: '2026-08-10T03:00:00.000Z',
  },
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const chan = () => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/link')) {
      return Promise.resolve(
        json({ url: '/files/f-9/content?t=tok', expiresInSec: 300, fileName: 'ban-cung-da-ky.pdf' }),
      );
    }
    if (d.includes('/content')) {
      return Promise.resolve(
        new Response('%PDF-', { status: 200, headers: { 'content-type': 'application/pdf' } }),
      );
    }
    if (d.startsWith('/api/files') || d.includes('/files?')) {
      return Promise.resolve(json([{ id: 'f-9', objectKey: 'scan/hs-1.pdf' }]));
    }
    return Promise.resolve(json([{ id: 'f-9', objectKey: 'scan/hs-1.pdf' }]));
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const bay = () =>
  render(<TepDinhKem hoSoId="hs-1" tep={TEP} loaiGhiDuoc={[]} choPhepXoa={false} taiLai={() => undefined} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('`0051` xem tệp đính kèm không cần tải về', () => {
  it('mỗi tệp có nút Xem, và nó đứng TRƯỚC nút Tải xuống', async () => {
    chan();
    bay();
    const nut = [...document.querySelectorAll('.danh-sach-tep button')].map((b) => b.textContent);
    // Với bản scan thì xem là việc hay làm hơn hẳn — Kế toán mở ra đối chiếu
    // chữ ký rồi đóng, không cần một bản sao nằm lại trong thư mục tải xuống.
    expect(nut[0]).toBe('Xem');
    expect(nut[1]).toBe('Tải xuống');
  });

  it('bấm Xem thì đi qua ĐỦ hai bước rồi mới mở hộp', async () => {
    const nguoi = userEvent.setup();
    const f = chan();
    bay();

    await nguoi.click(screen.getByRole('button', { name: 'Xem' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());

    const duong = f.mock.calls.map((c) => String(c[0]));
    expect(duong.some((d) => d.includes('ownerKind=POLICY')), 'thiếu bước tra id file').toBe(true);
    expect(duong.some((d) => d.includes('/link')), 'thiếu bước xin token').toBe(true);
    // Và nội dung tải qua chính đường có token, chứ không phải một URL đoán ra.
    expect(duong.some((d) => d.includes('/files/f-9/content?t=tok'))).toBe(true);
  });

  it('hộp xem mang TÊN TỆP làm tiêu đề', async () => {
    const nguoi = userEvent.setup();
    chan();
    bay();
    await nguoi.click(screen.getByRole('button', { name: 'Xem' }));
    // Mở ba bản scan liền nhau thì tiêu đề là thứ duy nhất phân biệt được chúng.
    await waitFor(() =>
      expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('ban-cung-da-ky.pdf'),
    );
  });

  it('xin liên kết hỏng thì báo lỗi, KHÔNG mở một hộp trắng', async () => {
    const nguoi = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((duong: unknown) =>
        String(duong).includes('/link')
          ? Promise.resolve(new Response('', { status: 404 }))
          : Promise.resolve(json([{ id: 'f-9', objectKey: 'scan/hs-1.pdf' }])),
      ),
    );
    bay();
    await nguoi.click(screen.getByRole('button', { name: 'Xem' }));
    await waitFor(() => expect(document.querySelector('.bao-loi')).not.toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
