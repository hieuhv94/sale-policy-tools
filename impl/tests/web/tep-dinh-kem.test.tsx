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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  it('`0069` mỗi tệp là một THẺ, hai thao tác nằm giữa ảnh thu nhỏ', async () => {
    /*
     * Bản trước là danh sách gạch đầu dòng với ba nút CHỮ mỗi dòng. Tệp ở đây
     * gần như luôn là bản scan giấy tờ, mà người ta nhận ra chúng bằng cách
     * nhìn chứ không bằng cách đọc tên `IMG_4821.jpg`.
     *
     * *Xem* đứng TRƯỚC *Tải xuống*: với bản scan thì xem là việc hay làm hơn
     * hẳn — Kế toán mở ra đối chiếu chữ ký rồi đóng, không cần một bản sao nằm
     * lại trong thư mục tải xuống.
     */
    chan();
    bay();
    const the = document.querySelector('.the-tep');
    expect(the, 'phải là thẻ tệp, không phải dòng danh sách').not.toBeNull();
    const nhan = [...the!.querySelectorAll('.the-tep-thao-tac button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(nhan[0]).toBe('Xem ban-cung-da-ky.pdf');
    expect(nhan[1]).toBe('Tải xuống ban-cung-da-ky.pdf');
  });

  it('`0069` KHÔNG có quyền thì không có nút gỡ và không có vùng tải lên', async () => {
    // Thẻ vẫn xem và tải được — chỉ hai thứ GHI mới ẩn đi.
    chan();
    bay();
    expect(document.querySelector('.the-tep-go'), 'không được có nút gỡ').toBeNull();
    expect(document.querySelector('.vung-tai-len'), 'không được có vùng tải lên').toBeNull();
    expect(document.querySelector('.the-tep-thao-tac')).not.toBeNull();
  });

  it('`0069` CÓ quyền thì hiện cả nút gỡ lẫn vùng tải lên', async () => {
    chan();
    render(
      <TepDinhKem
        hoSoId="hs-1"
        tep={TEP}
        loaiGhiDuoc={['SCAN']}
        choPhepXoa
        taiLai={() => undefined}
      />,
    );
    expect(document.querySelector('.the-tep-go')).not.toBeNull();
    expect(document.querySelector('.vung-tai-len')).not.toBeNull();
  });

  it('bấm Xem thì đi qua ĐỦ hai bước rồi mới mở hộp', async () => {
    const nguoi = userEvent.setup();
    const f = chan();
    bay();

    await nguoi.click(screen.getByRole('button', { name: 'Xem ban-cung-da-ky.pdf' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());

    const duong = f.mock.calls.map((c) => String(c[0]));
    expect(duong.some((d) => d.includes('ownerKind=POLICY')), 'thiếu bước tra id file').toBe(true);
    expect(duong.some((d) => d.includes('/link')), 'thiếu bước xin token').toBe(true);
    // Và nội dung tải qua chính đường có token, chứ không phải một URL đoán ra.
    expect(duong.some((d) => d.includes('/files/f-9/content?t=tok'))).toBe(true);
  });

  it('`0053` đường XEM kèm `xem=1`, đường TẢI thì KHÔNG', async () => {
    /*
     * Chỉ lượt TẢI mới vào Lịch sử của hồ sơ. Dùng chung một đường cho cả hai là
     * mở một lối tải không để lại vết nào — đúng cái lỗ N-01 sinh ra để bịt, và
     * là lỗi đã suýt lọt một lần ở nút Tải xuống bên trong hộp xem.
     */
    const nguoi = userEvent.setup();
    const f = chan();
    bay();

    await nguoi.click(screen.getByRole('button', { name: 'Xem ban-cung-da-ky.pdf' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    const khiXem = f.mock.calls.map((c) => String(c[0])).filter((d) => d.includes('/content'));
    expect(khiXem.every((d) => d.includes('xem=1')), khiXem.join(' · ')).toBe(true);

    // Nút trong HỘP XEM, không phải nút cùng tên ở danh sách phía sau.
    const hop = screen.getByRole('dialog');
    await nguoi.click(within(hop).getByRole('button', { name: 'Tải xuống' }));
    await waitFor(() => {
      const sau = f.mock.calls.map((c) => String(c[0])).filter((d) => d.includes('/content'));
      expect(sau.some((d) => !d.includes('xem=1')), 'đường tải không được mang xem=1').toBe(true);
    });
  });

  it('`0053` nút Tải xuống trong DANH SÁCH cũng không mang `xem=1`', async () => {
    const nguoi = userEvent.setup();
    const f = chan();
    bay();
    await nguoi.click(screen.getByRole('button', { name: 'Tải xuống ban-cung-da-ky.pdf' }));
    await waitFor(() => {
      const goi = f.mock.calls.map((c) => String(c[0])).filter((d) => d.includes('/content'));
      expect(goi.length).toBeGreaterThan(0);
      expect(goi.every((d) => !d.includes('xem=1'))).toBe(true);
    });
  });

  it('hộp xem mang TÊN TỆP làm tiêu đề', async () => {
    const nguoi = userEvent.setup();
    chan();
    bay();
    await nguoi.click(screen.getByRole('button', { name: 'Xem ban-cung-da-ky.pdf' }));
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
    await nguoi.click(screen.getByRole('button', { name: 'Xem ban-cung-da-ky.pdf' }));
    await waitFor(() => expect(document.querySelector('.bao-loi')).not.toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
