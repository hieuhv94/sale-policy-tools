/**
 * @vitest-environment jsdom
 *
 * 0023 — bảng Quy định chiết khấu: cột **Id**, bỏ **Độ cụ thể**, và ô tìm kiếm.
 *
 * Ba thay đổi này là một chuỗi, không phải ba việc rời: cột *Độ cụ thể* từng là
 * câu trả lời cho "vì sao hồ sơ này lấy ngưỡng 25% chứ không 30%", nhưng nó bắt
 * người đọc tự học luật trọng số. Câu trả lời mới là **mã quy định** — hồ sơ mang
 * mã ở cột QĐCK, dán vào ô tìm ở đây là ra thẳng dòng cần xem. Bỏ cột cũ mà
 * quên một trong hai mảnh kia là bỏ đi một câu trả lời và không đưa lại gì.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TheChietKhau } from '@csbh/web/chiet-khau-ui';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const QUY_DINH = [
  {
    code: 'CK-SUA-L1',
    productGroupCode: 'SUA',
    customerType: 1,
    effectiveFrom: '2026-01-01',
    thresholdRate2: 2500,
    specificity: 3,
  },
  {
    code: 'CK-BOT-CHUNG',
    productGroupCode: 'BOT',
    customerType: null,
    effectiveFrom: '2026-01-01',
    thresholdRate2: 3000,
    specificity: 2,
  },
];

const phanHoi = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Mọi đường đã gọi, theo thứ tự — dùng để khẳng định ĐIỀU KIỆN LỌC gửi lên. */
let daGoi: string[] = [];

const chanFetch = (loc?: (d: string) => unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/discount-rules')) {
        daGoi.push(d);
        const items = (loc?.(d) as typeof QUY_DINH | undefined) ?? QUY_DINH;
        // `total` là thật, không phải `items.length`: từ `0049` máy chủ cắt trang
        // nên hai con số khác nhau, và thanh phân trang đọc `total`.
        return Promise.resolve(phanHoi({ items, total: items.length }));
      }
      return Promise.resolve(phanHoi({}));
    }),
  );

const NHOM = [
  { id: 'n1', code: 'SUA', name: 'Sữa nước' },
  { id: 'n2', code: 'BOT', name: 'Bột dinh dưỡng' },
];

const bay = async (loc?: (d: string) => unknown) => {
  daGoi = [];
  chanFetch(loc);
  render(<TheChietKhau nhom={NHOM} />);
  return waitFor(() => screen.getByRole('table'));
};

describe('0023 cột Id thay cho Độ cụ thể', () => {
  it('có cột Id, và nó mang mã đầy đủ của quy định', async () => {
    const bang = await bay();
    expect(within(bang).getByText('Id')).toBeDefined();
    // Mã hiện NGUYÊN VẸN: nó dùng để chép, cắt bớt là cắt luôn công dụng.
    expect(within(bang).getByText('CK-SUA-L1')).toBeDefined();
  });

  it('KHÔNG còn cột Độ cụ thể', async () => {
    const bang = await bay();
    expect(within(bang).queryByText('Độ cụ thể')).toBeNull();
    // Và con số của nó cũng không lọt ra chỗ nào khác trong bảng.
    expect(within(bang).queryByText('3')).toBeNull();
  });

  it('vẫn còn đủ ba cột nội dung còn lại', async () => {
    const bang = await bay();
    const tieuDe = within(bang)
      .getAllByRole('columnheader')
      .map((t) => t.textContent);
    expect(tieuDe).toEqual(['Id', 'Áp dụng cho', 'Ngưỡng', 'Hiệu lực', 'Thao tác']);
  });

  it('chế độ chỉ xem không có cột Thao tác, nhưng vẫn có Id', async () => {
    chanFetch();
    render(<TheChietKhau nhom={[]} chiXem />);
    const bang = await waitFor(() => screen.getByRole('table'));
    const tieuDe = within(bang)
      .getAllByRole('columnheader')
      .map((t) => t.textContent);
    expect(tieuDe).toEqual(['Id', 'Áp dụng cho', 'Ngưỡng', 'Hiệu lực']);
  });
});

/**
 * `0049` — hai Ô CHỌN thay cho ô gõ tự do.
 *
 * Ô tìm chữ cũ khớp trên bốn thứ, trong đó hai thứ là chuỗi do chính màn hình
 * dựng ra: câu mô tả phạm vi, và con số phần trăm đang hiển thị. Không đưa xuống
 * máy chủ được — mà giữ ở màn hình thì nó chỉ tìm trong 200 dòng đầu, trái
 * muc 11.3. Khách hàng chốt đổi sang hai ô chọn, và cả hai là cột thật.
 */
describe('`0049` lọc bằng hai ô chọn, không còn ô gõ tự do', () => {
  const oNhom = () => screen.getByLabelText(/Nhóm sản phẩm/);
  const oLoai = () => screen.getByLabelText(/Loại khách hàng/);

  it('KHÔNG còn ô tìm chữ nào', async () => {
    await bay();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('có đủ hai ô chọn, mỗi ô mở đầu bằng lựa chọn "mọi"', async () => {
    await bay();
    // Lựa chọn đầu KHÔNG lọc gì. Thiếu nó thì người dùng chọn xong không có
    // đường quay lại xem toàn bộ, ngoài việc tải lại trang.
    expect(within(oNhom()).getByRole('option', { name: /Mọi nhóm/ })).toBeDefined();
    expect(within(oLoai()).getByRole('option', { name: /Mọi loại/ })).toBeDefined();
  });

  it('ô nhóm liệt kê đúng các nhóm được truyền vào', async () => {
    await bay();
    expect(within(oNhom()).getByRole('option', { name: /Sữa nước/ })).toBeDefined();
    expect(within(oNhom()).getByRole('option', { name: /Bột dinh dưỡng/ })).toBeDefined();
  });

  it('chọn một nhóm thì gửi `groupCode` LÊN MÁY CHỦ', async () => {
    const nguoi = userEvent.setup();
    await bay();
    await nguoi.selectOptions(oNhom(), 'SUA');
    // Đây là cả điểm của `0049`: điều kiện lọc đi lên máy chủ, không chạy trên
    // 200 dòng đã tải. Khẳng định trên ĐƯỜNG GỌI chứ không trên bảng — bảng chỉ
    // vẽ lại thứ máy chủ trả về, nên nó không chứng minh được phép lọc ở đâu.
    await waitFor(() => expect(daGoi.at(-1)).toContain('groupCode=SUA'), { timeout: 3000 });
  });

  it('chọn loại khách thì gửi `customerType`', async () => {
    const nguoi = userEvent.setup();
    await bay();
    await nguoi.selectOptions(oLoai(), '2');
    await waitFor(() => expect(daGoi.at(-1)).toContain('customerType=2'), { timeout: 3000 });
  });

  it('hai ô chọn kết hợp trong CÙNG một lời gọi', async () => {
    const nguoi = userEvent.setup();
    await bay();
    await nguoi.selectOptions(oNhom(), 'BOT');
    await nguoi.selectOptions(oLoai(), '3');
    await waitFor(() => {
      expect(daGoi.at(-1)).toContain('groupCode=BOT');
      expect(daGoi.at(-1)).toContain('customerType=3');
    }, { timeout: 3000 });
  });

  it('mở lại về "mọi" thì bỏ hẳn điều kiện, không gửi chuỗi rỗng', async () => {
    const nguoi = userEvent.setup();
    await bay();
    await nguoi.selectOptions(oNhom(), 'SUA');
    await waitFor(() => expect(daGoi.at(-1)).toContain('groupCode=SUA'), { timeout: 3000 });
    await nguoi.selectOptions(oNhom(), '');
    // `groupCode=` rỗng cũng bị máy chủ bỏ qua, nhưng gửi nó lên là để lại một
    // đường gọi đọc như thể có điều kiện lọc — và đó là thứ người sau đi tìm khi
    // gỡ lỗi "vì sao danh sách không đổi".
    await waitFor(() => expect(daGoi.at(-1)).not.toContain('groupCode'), { timeout: 3000 });
  });

  it('đang lọc thì nói rõ danh sách VẪN GỒM quy định chung', async () => {
    const nguoi = userEvent.setup();
    await bay();
    await nguoi.selectOptions(oNhom(), 'SUA');
    // Không nói ra thì người dùng thấy một dòng "mọi nhóm sản phẩm" nằm trong
    // kết quả lọc theo nhóm SUA và tưởng bộ lọc hỏng.
    await waitFor(() => expect(document.body.textContent).toContain('vẫn áp cho lựa chọn này'), {
      timeout: 3000,
    });
  });

  it('không dòng nào khớp thì nói KHÔNG KHỚP, không bày lại cả bảng', async () => {
    const nguoi = userEvent.setup();
    await bay((d) => (d.includes('groupCode=SUA') ? [] : QUY_DINH));
    await nguoi.selectOptions(oNhom(), 'SUA');
    await waitFor(() => {
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getByText(/Không có quy định nào khớp/)).toBeDefined();
    }, { timeout: 3000 });
  });

  it('chưa lọc gì mà bảng rỗng thì nói CHƯA CÓ, không nói KHÔNG KHỚP', async () => {
    // Hai câu cho hai tình huống khác hẳn nhau: "danh mục còn trống" bảo người
    // quản trị đi tạo quy định, "không khớp" bảo họ nới bộ lọc.
    chanFetch(() => []);
    render(<TheChietKhau nhom={NHOM} />);
    await waitFor(() => expect(screen.getByText(/Chưa có quy định chiết khấu nào/)).toBeDefined());
  });
});

/**
 * 0028 — cột Hiệu lực chỉ còn NGÀY, và hộp thoại sửa có ô ngày.
 */
describe('0028 cột Hiệu lực', () => {
  it('KHÔNG còn chữ "vô thời hạn" trong bảng', async () => {
    // Chữ ấy lặp y nguyên ở mọi dòng nên nó không phân biệt dòng nào với dòng
    // nào — đó là một luật của cả bảng, không phải dữ liệu của một dòng.
    const bang = await bay();
    expect(bang.textContent).not.toContain('vô thời hạn');
  });

  it('luật vô thời hạn vẫn được nói, ĐÚNG MỘT LẦN, ngoài bảng', async () => {
    await bay();
    expect(screen.getAllByText(/vô thời hạn/)).toHaveLength(1);
  });

  it('ô Hiệu lực vẫn hiện ngày bắt đầu', async () => {
    const bang = await bay();
    expect(within(bang).getAllByText('01/01/2026').length).toBeGreaterThan(0);
  });
});

describe('0028 sửa được ngày hiệu lực', () => {
  const moSua = async () => {
    const nguoi = userEvent.setup();
    await bay();
    await nguoi.click(screen.getAllByRole('button', { name: 'Sửa' })[0] as HTMLElement);
    return nguoi;
  };

  it('hộp thoại sửa có ô Hiệu lực từ, đặt sẵn ngày hiện tại của dòng', async () => {
    await moSua();
    const o = (await waitFor(() => screen.getByLabelText(/Hiệu lực từ/))) as HTMLInputElement;
    // `0208` — ô CHỮ `dd/mm/yyyy`, không phải ô ngày của trình duyệt. Giá trị
    // vào ra vẫn là chuỗi ISO; thứ đổi là lối viết trên màn hình.
    expect(o.type).toBe('text');
    expect(o.value).toBe('01/01/2026');
  });

  it('gửi lên CẢ ngưỡng lẫn ngày, không chỉ ngưỡng', async () => {
    const nguoi = await moSua();
    const o = (await waitFor(() => screen.getByLabelText(/Hiệu lực từ/))) as HTMLInputElement;
    await nguoi.clear(o);
    await nguoi.type(o, '01062027');
    await nguoi.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => {
      const goi = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => (c[1] as { method?: string } | undefined)?.method === 'PATCH',
      );
      expect(goi).toBeDefined();
      const than = JSON.parse(String((goi![1] as { body: string }).body)) as Record<string, unknown>;
      expect(than['effectiveFrom']).toBe('2027-06-01');
      expect(than['thresholdRate2']).toBe(2500);
    }, { timeout: 3000 });
  });

  it('xoá trắng ô ngày thì nút Lưu tắt — cột này KHÔNG cho rỗng', async () => {
    const nguoi = await moSua();
    const o = (await waitFor(() => screen.getByLabelText(/Hiệu lực từ/))) as HTMLInputElement;
    await nguoi.clear(o);
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true),
    );
  });
});

/**
 * `0208` — NGÀY MẶC ĐỊNH của hộp thoại *Thêm quy định* theo giờ VIỆT NAM.
 *
 * Bản cũ lấy `new Date().toISOString().slice(0, 10)`, tức ngày theo giờ UTC —
 * nên **từ 00:00 tới 07:00 giờ Việt Nam nó điền sẵn NGÀY HÔM QUA**, và không có
 * gì đỏ vì hôm qua cũng là một ngày hợp lệ.
 */
describe('`0208` ngày mặc định khi thêm quy định', () => {
  afterEach(() => vi.useRealTimers());

  it('điền HÔM NAY theo giờ Việt Nam, kể cả lúc UTC còn là hôm qua', async () => {
    /*
     * 18:00 UTC ngày 19/09 = 01:00 sáng ngày 20/09 giờ Việt Nam. Đây đúng là
     * khung giờ hai lịch lệch nhau, và là khung giờ duy nhất phân biệt được bản
     * đúng với bản cũ — mọi mốc khác cho cùng một kết quả ở cả hai bản.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-19T18:00:00.000Z'));

    const nguoi = userEvent.setup();
    await bay();
    await nguoi.click(screen.getByRole('button', { name: 'Thêm quy định' }));

    const o = (await waitFor(() => screen.getByLabelText(/Hiệu lực từ/))) as HTMLInputElement;
    expect(o.value).toBe('20/09/2026');
  });
});
