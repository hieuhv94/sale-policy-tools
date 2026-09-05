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
    const src = khung.getAttribute('src') ?? '';
    expect(src.split('#')[0]).toBe('blob:gia-lap-1');
    expect(src).not.toContain('/files/');

    /*
     * `0146` — mảnh neo `#view=FitH` bảo trình xem PDF phóng tờ giấy cho VỪA BỀ
     * RỘNG khung. Thiếu nó thì trình xem khớp trang theo chiều CAO như mặc định,
     * và dải xám hai bên quay lại — đúng thứ khách hàng vừa bảo sửa.
     *
     * Canh ở đây chứ không chỉ ở CSS, vì hai vế nằm hai nơi và mỗi vế một mình
     * đều vô nghĩa: `.khung-giay` cho khung lấp đầy hộp, mảnh neo này cho tờ
     * giấy lấp đầy khung.
     */
    expect(src).toContain('#view=FitH');
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

/**
 * `0172` — PHÓNG TO ẢNH trong hộp xem, chốt 01/09.
 *
 * *"Cho phép zoom bằng chuột hoặc biểu tượng khi xem preview ảnh hoặc pdf nếu
 * chưa có"*. PDF thì ĐÃ CÓ — trình xem PDF của trình duyệt mang sẵn thanh công
 * cụ phóng to và `Ctrl` + lăn chuột — nên lượt này chỉ dựng cho ẢNH, và có một
 * ca canh đúng chỗ ranh giới ấy: thanh phóng KHÔNG được mọc ra ở hộp PDF.
 */
describe('`0172` phóng to ảnh', () => {
  const moAnh = async () => {
    chanFetch(() => tep('image/jpeg'));
    bay();
    return await waitFor(() => screen.getByAltText('Bản scan hợp đồng'));
  };

  it('mở ra ở cỡ VỪA KHUNG — 100%, không phóng sẵn', async () => {
    const anh = await moAnh();
    expect(screen.getByRole('button', { name: 'Về cỡ vừa khung' }).textContent).toBe('100%');
    // `scale(1)` chứ không phải "không có transform": một mức phóng khai tường
    // minh là thứ giữ cho lượt kéo và lượt phóng dùng chung một công thức.
    expect(anh.getAttribute('style')).toContain('scale(1)');
  });

  it('bấm + thì ảnh to ra thật, và con số nói đúng mức đang phóng', async () => {
    const nguoi = userEvent.setup();
    const anh = await moAnh();
    await nguoi.click(screen.getByRole('button', { name: 'Phóng to' }));
    /*
     * Đo trên `transform` của chính thẻ ảnh, không đo state.
     *
     * Một ca chỉ đọc con số phần trăm sẽ XANH ngay cả khi quên nối mức phóng vào
     * `style` — tức là xanh với một cái nút không làm gì cả.
     */
    expect(anh.getAttribute('style')).toContain('scale(1.25)');
    expect(screen.getByRole('button', { name: 'Về cỡ vừa khung' }).textContent).toBe('125%');
  });

  it('không thu nhỏ được xuống dưới cỡ vừa khung', async () => {
    // Dưới 100% thì ảnh nhỏ hơn khung và chỉ còn viền trống — không ai cần, và
    // nó dựng ra một trạng thái mà nút *Về cỡ vừa khung* phải chữa.
    await moAnh();
    expect(
      screen.getByRole('button', { name: 'Thu nhỏ' }).hasAttribute('disabled'),
      'ở 100% mà vẫn bấm thu nhỏ được',
    ).toBe(true);
  });

  it('nút phần trăm đưa ảnh VỀ cỡ vừa khung, và về giữa', async () => {
    const nguoi = userEvent.setup();
    const anh = await moAnh();
    await nguoi.click(screen.getByRole('button', { name: 'Phóng to' }));
    await nguoi.click(screen.getByRole('button', { name: 'Về cỡ vừa khung' }));
    expect(anh.getAttribute('style')).toContain('scale(1)');
    // Về cỡ cũ mà giữ độ lệch là để lại một ảnh vừa khung nằm lệch hẳn sang một
    // bên, và không nút nào chỉnh lại được.
    expect(anh.getAttribute('style')).toContain('translate(0px, 0px)');
  });

  it('LĂN CHUỘT phóng to, và chặn trang cuộn phía sau', async () => {
    /*
     * Ca này chỉ có nghĩa vì React gắn `onWheel` dưới dạng listener THỤ ĐỘNG:
     * viết `onWheel={...}` rồi gọi `preventDefault()` thì trang vẫn cuộn. Nên
     * `defaultPrevented` là vế phải kiểm, không kém vế mức phóng.
     */
    const anh = await moAnh();
    const khung = anh.parentElement!;
    const e = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true });
    khung.dispatchEvent(e);
    await waitFor(() => expect(anh.getAttribute('style')).toContain('scale(1.15)'));
    expect(e.defaultPrevented, 'lăn chuột vẫn cuộn trang phía sau').toBe(true);
  });

  it('kéo được khi ĐÃ phóng to, và KHÔNG kéo được lúc vừa khung', async () => {
    const nguoi = userEvent.setup();
    const anh = await moAnh();
    const khung = anh.parentElement as HTMLElement;
    // jsdom không dựng Pointer Events, nên `setPointerCapture` phải tự cắm vào.
    khung.setPointerCapture = () => undefined;

    const keo = () => {
      khung.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }),
      );
      khung.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 130, clientY: 120 }),
      );
      khung.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    };

    keo();
    expect(anh.getAttribute('style'), 'ảnh vừa khung mà vẫn kéo đi được').toContain(
      'translate(0px, 0px)',
    );

    await nguoi.click(screen.getByRole('button', { name: 'Phóng to' }));
    keo();
    await waitFor(() => expect(anh.getAttribute('style')).toContain('translate(30px, 20px)'));
  });

  it('hộp PDF KHÔNG có thanh phóng — trình xem của trình duyệt đã có sẵn', async () => {
    /*
     * Ranh giới, và nó là một quyết định chứ không phải một chỗ chưa làm: điều
     * khiển mức phóng của trình xem PDF nhúng phải đi qua tham số `#zoom=` trong
     * địa chỉ, tức NẠP LẠI cả tài liệu và nhảy mất chỗ người ta đang đọc — tệ
     * hơn hẳn thanh công cụ sẵn có.
     */
    chanFetch(() => tep('application/pdf'));
    bay();
    await waitFor(() => screen.getByTitle('Bản scan hợp đồng'));
    expect(screen.queryByRole('button', { name: 'Phóng to' })).toBeNull();
  });
});
