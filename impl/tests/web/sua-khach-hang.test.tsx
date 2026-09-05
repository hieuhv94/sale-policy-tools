/**
 * @vitest-environment jsdom
 *
 * 0023 — loại khách hàng: hiện ra, và sửa được.
 *
 * Hai chuyện đi liền nhau. Trước `0023` ô này chỉ có ở biểu mẫu LẬP MỚI, còn
 * màn hình khách hàng thì không hiện loại ở đâu cả — nên người lập hồ sơ không
 * có cách nào biết khách này thuộc loại mấy, trong khi chính con số ấy quyết
 * định ngưỡng chiết khấu của mọi dòng sản phẩm họ sắp nhập.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BieuMauKhachHang, type KhachHangDayDu } from '@csbh/web/sua-khach-hang';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const phanHoi = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Trả về hàm `fetch` giả để test đọc được THÂN request đã gửi đi. */
const chanFetch = () => {
  const f = vi.fn(() => Promise.resolve(phanHoi([])));
  vi.stubGlobal('fetch', f);
  return f;
};

const thanDaGui = (f: ReturnType<typeof chanFetch>): Record<string, unknown> => {
  const ghi = f.mock.calls.find(
    (c) => (c[1] as { method?: string } | undefined)?.method === 'PATCH',
  );
  return JSON.parse(String((ghi?.[1] as { body?: unknown } | undefined)?.body)) as Record<
    string,
    unknown
  >;
};

const KHACH: KhachHangDayDu = {
  id: 'kh-1',
  code: 'KH-0001',
  name: 'Nha thuoc Minh Chau',
  customerType: 1,
  registeredAddress: 'So 1 Lang Ha',
  deliveryAddress: null,
  registeredAddresses: ['So 1 Lang Ha'],
  province: 'Ha Noi',
  streetWard: 'So 1 Lang Ha',
  deliveryAddresses: [],
  ownerName: 'Nguyen Van A',
  ownerTitle: null,
  // `0175` — mã số thuế BẮT BUỘC, nên `null` ở đây làm nút Lưu xám và mọi ca
  // gửi request bên dưới im lặng không gửi gì.
  idNumber: '0101234567',
  debt: '0',
  tdvUserId: 'u-1',
};

const moSua = () =>
  render(<BieuMauKhachHang khach={KHACH} dong={() => undefined} xong={() => undefined} />);

const oLoai = () => screen.getByLabelText(/Loại khách hàng/) as HTMLSelectElement;

describe('0023 ô loại khách hàng có mặt khi SỬA', () => {
  it('biểu mẫu sửa có ô loại, đặt sẵn đúng loại hiện tại', async () => {
    chanFetch();
    moSua();
    expect(oLoai().value).toBe('1');
  });

  it('không còn câu "loại khách hàng không sửa được"', async () => {
    // Câu đó từng nằm ngay trên biểu mẫu. Để lại thì màn hình tự mâu thuẫn với
    // chính cái ô ngay bên dưới nó.
    chanFetch();
    moSua();
    expect(screen.queryByText(/loại khách hàng không sửa được/)).toBeNull();
    // Mã khách hàng thì VẪN không sửa được — câu ấy phải còn.
    expect(screen.getByText(/không sửa được/)).toBeDefined();
  });

  it('biểu mẫu LẬP MỚI vẫn có ô loại', async () => {
    chanFetch();
    render(<BieuMauKhachHang dong={() => undefined} xong={() => undefined} />);
    expect(oLoai()).toBeDefined();
  });
});

describe('0023 cảnh báo hệ quả khi đổi loại', () => {
  it('chưa đổi thì KHÔNG có cảnh báo nào', async () => {
    // Bày sẵn một khối vàng ở mọi lượt sửa tên hay địa chỉ là dạy người dùng bỏ
    // qua nó, và lúc họ đổi loại thật thì nó đã thành nền.
    chanFetch();
    moSua();
    expect(document.querySelector('.hop-canh-bao')).toBeNull();
  });

  it('đổi loại thì hiện cảnh báo, nói rõ đổi từ đâu sang đâu', async () => {
    const nguoi = userEvent.setup();
    chanFetch();
    moSua();
    await nguoi.selectOptions(oLoai(), '3');

    const canhBao = await waitFor(() => {
      const el = document.querySelector('.hop-canh-bao');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(canhBao.textContent).toContain('Loại 1');
    expect(canhBao.textContent).toContain('Loại 3');
    // Và nói HỆ QUẢ, không chỉ nhắc lại thao tác vừa làm. Từ `0029` hệ quả là
    // HAI vế khác nhau: hồ sơ còn sửa được tự nhận ngưỡng mới, hồ sơ đã gửi
    // duyệt thì không. Nói một vế là để người dùng suy sai vế kia.
    expect(canhBao.textContent).toContain('tự nhận ngưỡng mới');
    expect(canhBao.textContent).toContain('đã gửi duyệt');
  });

  it('chọn lại đúng loại cũ thì cảnh báo biến mất', async () => {
    const nguoi = userEvent.setup();
    chanFetch();
    moSua();
    await nguoi.selectOptions(oLoai(), '2');
    await waitFor(() => expect(document.querySelector('.hop-canh-bao')).not.toBeNull());
    await nguoi.selectOptions(oLoai(), '1');
    await waitFor(() => expect(document.querySelector('.hop-canh-bao')).toBeNull());
  });
});

describe('0023 chỉ gửi customerType khi thật sự đổi', () => {
  it('sửa tên mà không đụng loại thì thân request KHÔNG có customerType', async () => {
    // Gửi kèm ở mọi lượt sửa thì một lần sửa địa chỉ cũng ghi một dòng "đổi loại
    // khách hàng" vào nhật ký kiểm toán — và nhật ký đầy những thay đổi không có
    // thật thì không ai đọc nữa.
    const nguoi = userEvent.setup();
    const f = chanFetch();
    moSua();
    await nguoi.type(screen.getByLabelText(/Tên Hộ kinh doanh/), ' B');
    await nguoi.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(thanDaGui(f)).toBeDefined());
    expect(thanDaGui(f)).not.toHaveProperty('customerType');
    expect(thanDaGui(f).name).toBe('Nha thuoc Minh Chau B');
  });

  it('đổi loại thì gửi customerType dạng SỐ, không phải chuỗi', async () => {
    // Máy chủ dùng `int(1, 3)`; gửi chuỗi "3" là 400 ở một trường người dùng đã
    // chọn đúng trên màn hình.
    const nguoi = userEvent.setup();
    const f = chanFetch();
    moSua();
    await nguoi.selectOptions(oLoai(), '2');
    await nguoi.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(thanDaGui(f)).toBeDefined());
    expect(thanDaGui(f).customerType).toBe(2);
  });
});
