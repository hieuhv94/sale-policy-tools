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
import { readFileSync } from 'node:fs';
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
  province: 'Hà Nội',
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

/**
 * `0205` — TỈNH/THÀNH PHỐ là Ô CHỌN, khách hàng chốt 19/09.
 *
 * Bảng 63 tên và hàm chuẩn hoá có ca kiểm riêng (`tests/http/tinh-thanh.test.ts`);
 * khối này dựng DOM thật để hỏi ba chuyện chỉ màn hình trả lời được — ô ấy là gì,
 * nó mở ra với giá trị nào, và một giá trị CŨ ngoài danh sách thì ra sao.
 */
describe('`0205` ô Tỉnh/Thành phố', () => {
  const oTinh = () => screen.getByLabelText(/Tỉnh\/Thành phố/) as HTMLSelectElement;

  it('là ô CHỌN, đủ 63 tên cộng một mục rỗng, đặt sẵn giá trị của khách', () => {
    chanFetch();
    moSua();
    expect(oTinh().tagName).toBe('SELECT');
    // 63 + mục trống. Đếm chứ không `toContain` một cái tên: thiếu vài tỉnh thì
    // ô chọn vẫn trông đầy đủ với người đang thử bằng mắt.
    expect(oTinh().options).toHaveLength(64);
    expect(oTinh().value).toBe('Hà Nội');
  });

  it('biểu mẫu LẬP MỚI mở ra với ô TRỐNG, không tự chọn tỉnh đầu danh sách', async () => {
    /*
     * Không có mục `value=""` thì trình duyệt tự chọn mục đầu tiên, và biểu mẫu
     * mở ra với *An Giang* điền sẵn. Người dùng không đọc kỹ sẽ lưu đúng cái tên
     * ấy — không lỗi nào hiện ra, và dữ liệu sai theo kiểu không ai kiểm lại.
     */
    chanFetch();
    render(<BieuMauKhachHang dong={() => undefined} xong={() => undefined} />);
    expect(oTinh().value).toBe('');
  });

  it('giá trị CŨ ngoài danh sách vẫn hiện ra, và KHÔNG chọn lại được', async () => {
    /*
     * Khách hàng lập trước `0205` mang tỉnh/thành gõ tay. Không bày nó ra thì ô
     * chọn hiện một dòng trống, và lượt Lưu tiếp theo — dù người dùng chỉ sửa số
     * điện thoại — **âm thầm ghi đè địa chỉ pháp nhân**.
     *
     * `disabled` là nửa thứ hai: nó là thứ ĐANG LƯU, không phải một câu trả lời
     * hợp lệ. Bày ra để đọc được mình đang đổi cái gì; chọn lại xong thì không
     * quay về nó được nữa.
     */
    chanFetch();
    render(
      <BieuMauKhachHang
        khach={{ ...KHACH, province: 'TP Hồ Chí Minh' }}
        dong={() => undefined}
        xong={() => undefined}
      />,
    );
    expect(oTinh().value).toBe('TP Hồ Chí Minh');
    expect(oTinh().options).toHaveLength(65);
    const cu = [...oTinh().options].find((o) => o.value === 'TP Hồ Chí Minh');
    expect(cu?.disabled).toBe(true);
  });

  it('chọn một tỉnh rồi Lưu thì thân request mang đúng tên trong bảng', async () => {
    const nguoi = userEvent.setup();
    const f = chanFetch();
    moSua();
    await nguoi.selectOptions(oTinh(), 'Thừa Thiên Huế');
    await nguoi.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(thanDaGui(f)).toBeDefined());
    expect(thanDaGui(f).province).toBe('Thừa Thiên Huế');
  });
});

/**
 * `0176` — HÀNG ĐỊA CHỈ: nút *Xoá* thẳng hàng với ô nhập, chốt 05/09.
 *
 * jsdom KHÔNG tính bố cục, nên không ca kiểm nào ở tệp này đo được vị trí thật.
 * Thứ đo được — và là đúng thứ đã hỏng — là **hai luật CSS nói ngược nhau**:
 * `.hang-dia-chi` căn `align-items: end`, mà flexbox căn theo hộp CÓ LỀ, trong
 * khi `.truong` mang `margin-bottom`. Nút thẳng hàng với mép dưới của cái LỀ chứ
 * không phải của ô nhập.
 *
 * Đọc thẳng tệp CSS, cùng lối `0164` đã dùng cho hộp xem.
 */
describe('`0176` nút Xoá của hàng địa chỉ thẳng hàng với ô nhập', () => {
  const css = (): string =>
    readFileSync('apps/web/src/styles/app.css', 'utf8');

  const khoi = (re: RegExp): string =>
    [...css().matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => re.test(m[1]!))
      .map((m) => m[2]!)
      .join('\n');

  it('ô nhập trong hàng địa chỉ KHÔNG mang lề dưới', () => {
    const k = khoi(/\.hang-dia-chi > :first-child/);
    expect(k, 'không tìm thấy luật nào cho ô nhập trong hàng địa chỉ').not.toBe('');
    expect(k, 'lề dưới của `.truong` đẩy nút Xoá tụt xuống').toMatch(/margin-bottom:\s*0\s*;/);
  });

  it('và hàng vẫn căn theo MÉP DƯỚI — hai luật ấy đi cùng nhau', () => {
    /*
     * Chiều đối chiếu. Đổi `.hang-dia-chi` sang `align-items: center` cũng làm
     * nút trông thẳng hàng ở ca trên — nhưng lúc ấy nhãn *Địa chỉ giao hàng 2*
     * kéo hàng cao lên và nút trôi ra giữa, lệch theo một kiểu khác. Hai luật
     * này là một cơ chế, nên chúng phải được canh cùng nhau.
     */
    expect(khoi(/^\s*\.hang-dia-chi\s*$/m)).toMatch(/align-items:\s*end\s*;/);
  });

  it('khoảng cách giữa các hàng KHÔNG mất — nó đến từ `gap` của nhóm', () => {
    // Gỡ lề dưới mà không có `gap` thì hai hàng địa chỉ dính nhau; ca này là lý
    // do lượt sửa trên an toàn.
    expect(khoi(/^\s*\.nhom-dia-chi\s*$/m)).toMatch(/gap:/);
  });
});
