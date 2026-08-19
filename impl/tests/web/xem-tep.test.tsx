/**
 * @vitest-environment jsdom
 *
 * `0051` — xem tệp NGAY TRONG PHẦN MỀM (muc 11.1, món nợ N-02).
 *
 * Trước đó mọi tệp chỉ có nút *Tải xuống*: muốn xem một bản scan là phải tải về
 * rồi mở bằng ứng dụng khác, và mỗi lần xem để lại một bản sao trong thư mục tải
 * xuống của máy — ngoài tầm kiểm soát của phần mềm.
 *
 * Ba khẳng định cốt lõi ở đây, và cả ba đều là chỗ dễ làm sai:
 *   1. Nội dung tải qua `goi()` rồi mới nhúng bằng `blob:` — nhúng thẳng đường
 *      API vào `<iframe src>` là 401, vì thẻ ấy không gửi header xác thực.
 *   2. `blob:` URL được THU HỒI khi đóng, nếu không thì mở vài chục bản scan
 *      trong một phiên là vài trăm MB nằm lại trong bộ nhớ tab.
 *   3. Nút **Đóng** luôn hiện — kể cả lúc đang tải và lúc lỗi (muc 11.1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { XemTep } from '@csbh/web/xem-tep';

const TAO = vi.fn(() => 'blob:gia-lap-1');
const THU_HOI = vi.fn();

/** Phản hồi có `Content-Type` thật — `blob.type` quyết định cách nhúng. */
const tep = (kieu: string, than = 'noi-dung') =>
  new Response(than, { status: 200, headers: { 'content-type': kieu } });

const chanFetch = (tra: () => Response | Promise<Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(tra())),
  );

beforeEach(() => {
  TAO.mockClear();
  THU_HOI.mockClear();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: TAO,
    revokeObjectURL: THU_HOI,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bay = (props: Partial<Parameters<typeof XemTep>[0]> = {}) =>
  render(
    <XemTep
      tieuDe="Bản scan hợp đồng"
      duong="/files/f1/content?t=abc"
      tenTep="ban-cung.pdf"
      dong={props.dong ?? (() => undefined)}
      {...props}
    />,
  );

describe('`0051` hộp xem tệp', () => {
  it('PDF nhúng bằng iframe, và nguồn là `blob:` chứ KHÔNG phải đường API', async () => {
    chanFetch(() => tep('application/pdf'));
    bay();

    const khung = await waitFor(() => screen.getByTitle('Bản scan hợp đồng'));
    expect(khung.tagName).toBe('IFRAME');
    // Đây là cả điểm của `xemTruoc`: nhúng thẳng `/files/...` là 401 vì thẻ
    // iframe không gửi header Authorization.
    expect(khung.getAttribute('src')).toBe('blob:gia-lap-1');
    expect(khung.getAttribute('src')).not.toContain('/files/');
  });

  it('ảnh nhúng bằng thẻ img, không phải iframe', async () => {
    chanFetch(() => tep('image/jpeg'));
    bay();
    const anh = await waitFor(() => screen.getByAltText('Bản scan hợp đồng'));
    expect(anh.tagName).toBe('IMG');
    expect(anh.getAttribute('src')).toBe('blob:gia-lap-1');
  });

  it('kiểu KHÔNG nhúng được thì nói thẳng, không bày một khung trắng', async () => {
    // Word là ca thật: `<iframe>` với docx cho ra trang trắng hoặc âm thầm kích
    // hoạt tải xuống — cả hai đều tệ hơn một câu nói rõ phải làm gì.
    chanFetch(() =>
      tep('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    );
    bay();
    await waitFor(() =>
      expect(document.body.textContent).toContain('không xem trực tiếp được'),
    );
    expect(screen.queryByTitle('Bản scan hợp đồng')).toBeNull();
  });

  it('THU HỒI `blob:` khi đóng hộp', async () => {
    chanFetch(() => tep('application/pdf'));
    const { unmount } = bay();
    await waitFor(() => screen.getByTitle('Bản scan hợp đồng'));
    expect(THU_HOI).not.toHaveBeenCalled();

    unmount();
    // Không thu hồi thì nội dung nằm lại trong bộ nhớ tab tới lúc đóng tab.
    expect(THU_HOI).toHaveBeenCalledWith('blob:gia-lap-1');
  });

  it('nút Đóng hiện NGAY, không phải chờ tải xong', async () => {
    // Muc 11.1: "nút Đóng luôn hiển thị ở màn hình xem". `HopThoai` chỉ đóng
    // bằng Escape và bấm ra ngoài — hai đường không ai nhìn thấy.
    let mo: (r: Response) => void = () => undefined;
    chanFetch(() => new Promise<Response>((r) => (mo = r)));
    bay();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeDefined();
    mo(tep('application/pdf'));
    await waitFor(() => screen.getByTitle('Bản scan hợp đồng'));
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeDefined();
  });

  it('tải hỏng thì báo lỗi mà nút Đóng vẫn còn', async () => {
    chanFetch(() => new Response('', { status: 500 }));
    bay();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đóng' })).toBeDefined());
    expect(screen.queryByTitle('Bản scan hợp đồng')).toBeNull();
  });

  it('bấm Đóng gọi đúng hàm đóng', async () => {
    const nguoi = userEvent.setup();
    const dong = vi.fn();
    chanFetch(() => tep('application/pdf'));
    bay({ dong });
    await nguoi.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(dong).toHaveBeenCalledTimes(1);
  });

  it('Tải xuống gọi lại MÁY CHỦ, không lưu blob đang cầm', async () => {
    const nguoi = userEvent.setup();
    const goi = vi.fn(() => Promise.resolve(tep('application/pdf')));
    vi.stubGlobal('fetch', goi);
    bay();
    await waitFor(() => screen.getByTitle('Bản scan hợp đồng'));
    const truoc = goi.mock.calls.length;

    await nguoi.click(screen.getByRole('button', { name: 'Tải xuống' }));
    /*
     * Một lượt gọi NỮA, không phải lưu `blob:` đang có sẵn.
     *
     * Từ `0052` đường tải ghi một dòng lịch sử còn đường xem thì không. Lưu blob
     * ra file là một lượt tải không để lại vết nào — đúng cái lỗ mà N-01 mở ra.
     */
    await waitFor(() => expect(goi.mock.calls.length).toBeGreaterThan(truoc));
  });
});
