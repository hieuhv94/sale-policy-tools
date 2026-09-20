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

  /**
   * Phóng to bằng LĂN CHUỘT — `0211` gỡ hai cái nút dấu cộng trừ.
   *
   * Các ca dưới đây trước kia bấm nút *Phóng to* để dựng trạng thái *đã phóng*;
   * nút ấy không còn, và đường duy nhất người dùng có giờ cũng là đường duy nhất
   * bộ kiểm có. Một mức 1.15 thay cho 1.25 — con số khác, cùng trạng thái.
   */
  const lanChuot = async (anh: HTMLElement, lan = 1) => {
    for (let i = 0; i < lan; i += 1) {
      anh.parentElement!.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }),
      );
    }
    await waitFor(() => expect(anh.getAttribute('style')).not.toContain('scale(1)'));
  };

  it('mở ra ở cỡ VỪA KHUNG, và hàng trên khung CHỈ CÓ câu hướng dẫn (`0211`)', async () => {
    const anh = await moAnh();
    /*
     * `0211` — *"chỉ cần câu hướng dẫn, không cần hai nút +/- bên cạnh"*.
     *
     * Đọc CẢ HÀNG chứ không hỏi từng cái nút: `queryByRole(...)` trả `null` cho
     * một nút đã gỡ, nhưng nó cũng trả `null` khi cả hàng biến mất — và một ca
     * hỏi ba lần "nút này không còn chứ" sẽ xanh với cả trạng thái ấy.
     */
    const hang = document.querySelector('.thanh-phong');
    expect(hang, 'mất luôn hàng hướng dẫn').not.toBeNull();
    expect(hang!.textContent).toContain('Lăn chuột để phóng to');
    expect(hang!.querySelectorAll('button')).toHaveLength(0);
    // `scale(1)` chứ không phải "không có transform": một mức phóng khai tường
    // minh là thứ giữ cho lượt kéo và lượt phóng dùng chung một công thức.
    expect(anh.getAttribute('style')).toContain('scale(1)');
  });

  it('phóng lên thì ảnh to ra thật, và con số nói đúng mức đang phóng', async () => {
    const anh = await moAnh();
    await lanChuot(anh);
    /*
     * Đo trên `transform` của chính thẻ ảnh, không đo state.
     *
     * Một ca chỉ đọc con số phần trăm sẽ XANH ngay cả khi quên nối mức phóng vào
     * `style` — tức là xanh với một cái nút không làm gì cả.
     */
    expect(anh.getAttribute('style')).toContain('scale(1.15)');
    // Nút đường thoát MỌC RA khi có gì để thoát, và nó nói cả mức đang phóng.
    expect(screen.getByRole('button', { name: 'Về cỡ vừa khung' }).textContent).toContain('115%');
  });

  it('không thu nhỏ được xuống dưới cỡ vừa khung', async () => {
    /*
     * Dưới 100% thì ảnh nhỏ hơn khung và chỉ còn viền trống — không ai cần.
     *
     * `0211` gỡ nút *Thu nhỏ*, nên luật này thôi đo được bằng một thuộc tính
     * `disabled`; nó chuyển xuống chính cái chặn trong `dungPhong`. Lăn chuột
     * xuống ở cỡ vừa khung là đường DUY NHẤT còn lại để chạm tới nó.
     */
    const anh = await moAnh();
    anh.parentElement!.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(anh.getAttribute('style'), 'lăn xuống mà tụt dưới cỡ vừa khung').toContain('scale(1)');
  });

  it('nút phần trăm đưa ảnh VỀ cỡ vừa khung, và về giữa', async () => {
    const nguoi = userEvent.setup();
    const anh = await moAnh();
    await lanChuot(anh);
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

    await lanChuot(anh);
    keo();
    await waitFor(() => expect(anh.getAttribute('style')).toContain('translate(30px, 20px)'));
  });

  it('`0211` KHÔNG còn nút phóng to / thu nhỏ ở BẤT KỲ mức phóng nào', async () => {
    /*
     * Hai vế, và vế thứ hai là vế dễ sót: gỡ hai cái nút ở trạng thái mở ra thì
     * dễ, nhưng chúng cũng không được mọc lại sau khi người dùng đã phóng — chỗ
     * ấy là một nhánh JSX khác, và nó chỉ dựng ra khi có người lăn chuột.
     */
    const anh = await moAnh();
    for (const ten of ['Phóng to', 'Thu nhỏ']) {
      expect(screen.queryByRole('button', { name: ten }), `${ten} ở cỡ vừa khung`).toBeNull();
    }
    await lanChuot(anh, 2);
    for (const ten of ['Phóng to', 'Thu nhỏ']) {
      expect(screen.queryByRole('button', { name: ten }), `${ten} sau khi phóng`).toBeNull();
    }
    // Và hàng ấy đúng MỘT nút: đường thoát, không hơn.
    expect(document.querySelector('.thanh-phong')!.querySelectorAll('button')).toHaveLength(1);
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
    /*
     * HỎI CẢ HÀNG, không hỏi một cái nút (`0211`).
     *
     * Bản trước hỏi `queryByRole('button', { name: 'Phóng to' })` — và `0211`
     * gỡ chính cái nút ấy khỏi CẢ phần mềm, nên câu hỏi kia từ nay đúng ở mọi
     * hộp, kể cả hộp ảnh. Một ca kiểm thành câu lệnh rỗng mà vẫn xanh là đúng
     * lớp bẫy `0186` đã ghi cho `NOT EXISTS`.
     *
     * Thứ phải vắng mặt ở hộp PDF là CẢ hàng phóng to, gồm cả câu hướng dẫn:
     * *"lăn chuột để phóng to"* nói sai với một khung mà lăn chuột chỉ cuộn tài
     * liệu bên trong trình xem PDF.
     */
    expect(document.querySelector('.thanh-phong')).toBeNull();
    expect(document.body.textContent).not.toContain('Lăn chuột để phóng to');
  });
});
