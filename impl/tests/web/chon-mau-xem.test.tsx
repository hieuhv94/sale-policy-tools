/**
 * @vitest-environment jsdom
 *
 * `0145` — bước CHỌN MẪU của hộp *Xem bản mềm* là một **ô chọn**.
 *
 * Ba đời của cùng một bước, và mỗi lần đổi đều đổi một thứ khác nhau:
 *
 *   `0058`  mở sẵn mẫu đầu danh sách — không hỏi gì cả.
 *   `0067`  bắt CHỌN trước khi xem, bày thành một danh sách nút.
 *   `0145`  vẫn bắt chọn, nhưng bằng một ô chọn.
 *
 * Chỗ dễ làm hỏng nhất khi đổi hình dạng là làm mất luật của `0067`, và mất theo
 * kiểu không ai thấy: một `<select>` mặc định mang giá trị của `<option>` đầu
 * tiên, nên chỉ cần bỏ dòng rỗng đứng đầu là phần mềm lại tự chọn hộ người dùng
 * — đúng thứ khách hàng bác ngày 20/08 — mà màn hình vẫn trông y hệt.
 *
 * Nên phần lớn tệp này canh **thứ tự**: chọn xong RỒI mới xem, và giữa hai việc
 * ấy phải có một lượt bấm của người dùng.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { XemBanMem } from '@csbh/web/xem-ban-mem';

const MAU = [
  { id: 'm1', ten: 'Mẫu CSBH đầy đủ', khoGiay: 'a4p' },
  { id: 'm2', ten: 'Mẫu CSBH rút gọn', khoGiay: 'a4l' },
  { id: 'm3', ten: 'Mẫu CSBH bốn cột', khoGiay: 'a4p' },
];

/** Danh sách mẫu qua `layJson`, nội dung tệp qua `xemTruoc` — hai đường khác nhau. */
const chanFetch = (ds: unknown[] = MAU) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: string) => {
      if (duong.includes('/render') || duong.includes('.pdf')) {
        return Promise.resolve(
          new Response('%PDF-1.4', { status: 200, headers: { 'content-type': 'application/pdf' } }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(ds), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:gia-lap'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bay = () =>
  render(<XemBanMem hoSoId="hs-1" maHoSo="CSBH-0001" dong={() => undefined} />);

/** Ô chọn của BƯỚC MỘT — nhãn khác hẳn ô ĐỔI MẪU ở màn hình sau. */
const oChon = () => screen.getByLabelText(/Văn bản mẫu/) as HTMLSelectElement;
const nutXem = () => screen.getByRole('button', { name: 'Xem' }) as HTMLButtonElement;

describe('`0145` bước chọn mẫu dùng ô chọn', () => {
  it('dựng một `select` mang đủ mọi mẫu, không phải một nút cho mỗi mẫu', async () => {
    chanFetch();
    bay();
    const o = await waitFor(oChon);
    expect(o.tagName).toBe('SELECT');

    // Ba mẫu cộng dòng rỗng đứng đầu.
    expect(o.options).toHaveLength(MAU.length + 1);
    for (const m of MAU) {
      expect([...o.options].some((x) => x.textContent?.includes(m.ten)), m.ten).toBe(true);
    }

    // Và KHÔNG còn nút nào mang tên mẫu — đó là hình dạng cũ.
    for (const m of MAU) {
      expect(screen.queryByRole('button', { name: new RegExp(m.ten) }), m.ten).toBeNull();
    }
  });

  it('khổ giấy vẫn đi kèm tên mẫu trong từng dòng', async () => {
    // Hai mẫu cùng tên khác khổ là chuyện có thật; bỏ phụ đề đi thì hai dòng ấy
    // không phân biệt được bằng mắt.
    chanFetch();
    bay();
    const o = await waitFor(oChon);
    const dong = [...o.options].find((x) => x.value === 'm2');
    expect(dong?.textContent).toContain('Mẫu CSBH rút gọn');
    expect(dong?.textContent).toMatch(/A4 ngang/i);
  });

  it('`0067` KHÔNG tự chọn hộ: ô mở ra rỗng và nút *Xem* khoá', async () => {
    /*
     * Ca đáng giá nhất của tệp. Bỏ `<option value="">` đi thì trình duyệt tự
     * chọn mẫu đầu danh sách, nút *Xem* mở khoá, và người dùng bấm một cái là
     * xem bản trình bày mà phần mềm chọn hộ — không màn hình nào đỏ, không câu
     * chữ nào đổi.
     */
    chanFetch();
    bay();
    const o = await waitFor(oChon);
    expect(o.value, 'ô chọn mở ra phải RỖNG').toBe('');
    expect(nutXem().disabled, 'nút *Xem* phải khoá khi chưa chọn').toBe(true);
  });

  it('chọn một mẫu KHÔNG tự mở bản xem trước — phải bấm *Xem*', async () => {
    /*
     * Khác biệt căn bản giữa một cái nút và một ô chọn: cái nút vừa là lựa chọn
     * vừa là lượt xác nhận, ô chọn thì không. Đấu thẳng `onChange` vào lượt xem
     * nghĩa là người dùng dùng bàn phím rê qua danh sách sẽ mở lần lượt từng
     * bản xem trước — mỗi lần một lời gọi dựng văn bản ở máy chủ.
     */
    const nd = userEvent.setup();
    chanFetch();
    bay();
    const o = await waitFor(oChon);

    await nd.selectOptions(o, 'm2');
    expect(o.value).toBe('m2');
    // Vẫn đứng ở bước một: ô chọn còn đó, khung xem chưa có.
    expect(oChon()).toBeTruthy();
    expect(document.querySelector('.khung-xem')).toBeNull();

    expect(nutXem().disabled).toBe(false);
    await nd.click(nutXem());

    await waitFor(() => expect(document.querySelector('.khung-xem')).not.toBeNull());
  });

  it('mẫu ĐANG XEM đúng là mẫu vừa chọn, không phải mẫu đầu danh sách', async () => {
    // Nối nhầm nút *Xem* vào `ds[0].id` thay vì giá trị ô chọn thì mọi ca trên
    // vẫn xanh, và người dùng đọc một bản khác bản họ chọn.
    const nd = userEvent.setup();
    chanFetch();
    bay();
    const o = await waitFor(oChon);
    await nd.selectOptions(o, 'm3');
    await nd.click(nutXem());

    await waitFor(() => expect(document.querySelector('.khung-xem')).not.toBeNull());
    const goi = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(goi.some((d) => d.includes('mauId=m3')), goi.join(' | ')).toBe(true);
  });

  it('danh sách RỖNG thì không có ô chọn lẫn nút *Xem*, chỉ có câu nhắn', async () => {
    // Một ô chọn không có dòng nào là một câu hỏi không trả lời được, và một nút
    // *Xem* khoá vĩnh viễn thì người dùng đứng bấm mãi.
    chanFetch([]);
    bay();
    await waitFor(() => expect(document.body.textContent).toContain('Chưa có văn bản mẫu nào'));
    expect(screen.queryByLabelText(/Văn bản mẫu/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xem' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
  });
});
