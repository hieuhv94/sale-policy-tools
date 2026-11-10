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
import { chonMuc, docMuc, giaTri } from './chon-co-go.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BieuMauKhachHang, type KhachHangDayDu } from '@csbh/web/sua-khach-hang';
import { PhienProvider } from '@csbh/web/auth';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/**
 * Dựng trong `PhienProvider` (`0226`): biểu mẫu đọc người đang đăng nhập để
 * quyết định ô MÃ có sửa được không. Trong ứng dụng nó luôn nằm dưới provider ở
 * gốc; không có phiên lưu thì provider không gọi máy chủ và `nguoiDung` rỗng.
 */
const dung = (ui: ReactElement) => render(<PhienProvider>{ui}</PhienProvider>);

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
  dung(<BieuMauKhachHang khach={KHACH} dong={() => undefined} xong={() => undefined} />);

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
    // `0226` ĐẢO dòng này: tới `0225` nó đòi câu *"Mã khách hàng … không sửa
    // được"* phải còn. Giờ mã sửa được (TDV phụ trách), và câu ấy đã gỡ.
    expect(screen.queryByText(/không sửa được/)).toBeNull();
  });

  it('biểu mẫu LẬP MỚI vẫn có ô loại', async () => {
    chanFetch();
    dung(<BieuMauKhachHang dong={() => undefined} xong={() => undefined} />);
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
  const oTinh = () => screen.getByLabelText(/Tỉnh\/Thành phố/) as HTMLInputElement;

  it('là ô CHỌN có gõ, đủ 63 tên, đặt sẵn giá trị của khách', async () => {
    chanFetch();
    moSua();
    expect(oTinh().getAttribute('role')).toBe('combobox');
    // Đếm chứ không `toContain` một cái tên: thiếu vài tỉnh thì ô chọn vẫn trông
    // đầy đủ với người đang thử bằng mắt. Không có mục rỗng: ô trống là *chưa chọn*.
    expect(await docMuc(userEvent.setup(), oTinh())).toHaveLength(63);
    expect(giaTri(oTinh())).toBe('Hà Nội');
  });

  it('gõ KHÔNG DẤU vẫn ra tên có dấu, và chữ lạ không thành giá trị', async () => {
    const nguoi = userEvent.setup();
    chanFetch();
    dung(<BieuMauKhachHang dong={() => undefined} xong={() => undefined} />);
    await nguoi.click(oTinh());
    await nguoi.type(oTinh(), 'ha noi');
    const ds = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(ds.map((m) => m.getAttribute('data-gia'))).toEqual(['Hà Nội']);
    // Chữ không có trong danh sách: nói ra, và giá trị vẫn rỗng.
    await nguoi.clear(oTinh());
    await nguoi.type(oTinh(), 'xyz');
    expect(screen.getByText(/Không có tỉnh\/thành phố nào khớp/)).toBeDefined();
    await nguoi.tab();
    expect(giaTri(oTinh())).toBe('');
  });

  it('biểu mẫu LẬP MỚI mở ra với ô TRỐNG, không tự chọn tỉnh đầu danh sách', async () => {
    /*
     * Không có mục `value=""` thì trình duyệt tự chọn mục đầu tiên, và biểu mẫu
     * mở ra với *An Giang* điền sẵn. Người dùng không đọc kỹ sẽ lưu đúng cái tên
     * ấy — không lỗi nào hiện ra, và dữ liệu sai theo kiểu không ai kiểm lại.
     */
    chanFetch();
    dung(<BieuMauKhachHang dong={() => undefined} xong={() => undefined} />);
    expect(giaTri(oTinh())).toBe('');
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
    dung(
      <BieuMauKhachHang
        khach={{ ...KHACH, province: 'TP Hồ Chí Minh' }}
        dong={() => undefined}
        xong={() => undefined}
      />,
    );
    expect(giaTri(oTinh())).toBe('TP Hồ Chí Minh');
    const ds = await docMuc(userEvent.setup(), oTinh());
    expect(ds).toHaveLength(64);
    const cu = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .find((o) => o.getAttribute('data-gia') === 'TP Hồ Chí Minh');
    expect(cu?.getAttribute('aria-disabled')).toBe('true');
  });

  it('chọn một tỉnh rồi Lưu thì thân request mang đúng tên trong bảng', async () => {
    const nguoi = userEvent.setup();
    const f = chanFetch();
    moSua();
    await chonMuc(nguoi, oTinh(), 'Thừa Thiên Huế');
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

/**
 * `0223` — SỐ ĐIỆN THOẠI ĐÚNG 10 CHỮ SỐ, báo đỏ dưới ô và chặn nút Lưu.
 *
 * Luật và bảng ca nằm ở `tests/http/so-dien-thoai.test.ts` (đối chiếu hai bản);
 * khối này hỏi ba chuyện chỉ màn hình trả lời được: câu lỗi nằm ĐÚNG dưới ô
 * (gắn `aria-describedby`), nút Lưu xám, và ô TRỐNG vẫn lưu được.
 */
describe('`0223` ô số điện thoại', () => {
  const oSdt = () => screen.getByLabelText(/Số điện thoại/) as HTMLInputElement;
  const nutLuu = () => screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;

  it('gõ 9 chữ số thì báo đỏ NGAY DƯỚI Ô và nút Lưu xám', async () => {
    const nguoi = userEvent.setup();
    chanFetch();
    moSua();
    await nguoi.type(oSdt(), '091234567');

    const idLoi = oSdt().getAttribute('aria-describedby');
    expect(idLoi, 'câu lỗi không gắn vào ô').toBeTruthy();
    const loi = document.getElementById(idLoi!)!;
    expect(loi.className).toContain('truong-loi');
    expect(loi.textContent).toContain('đúng 10 chữ số');
    expect(oSdt().getAttribute('aria-invalid')).toBe('true');
    expect(nutLuu().disabled).toBe(true);
  });

  it('gõ thêm chữ số thứ mười thì lỗi biến mất và lưu được', async () => {
    const nguoi = userEvent.setup();
    const f = chanFetch();
    moSua();
    await nguoi.type(oSdt(), '0912 345 67');
    expect(nutLuu().disabled).toBe(true);
    await nguoi.type(oSdt(), '8');
    expect(document.querySelector('.truong-loi')).toBeNull();
    expect(nutLuu().disabled).toBe(false);

    await nguoi.click(nutLuu());
    await waitFor(() => expect(thanDaGui(f)).toBeDefined());
    // Giao diện gửi đúng chữ đã gõ; bỏ dấu cách là việc của máy chủ (một chỗ).
    expect(thanDaGui(f).phone).toBe('0912 345 678');
  });

  it('11 chữ số cũng bị chặn — "đúng 10", không phải "ít nhất 10"', async () => {
    const nguoi = userEvent.setup();
    chanFetch();
    moSua();
    await nguoi.type(oSdt(), '09123456789');
    expect(nutLuu().disabled).toBe(true);
  });

  it('ô TRỐNG không báo lỗi — số điện thoại vẫn là ô tuỳ chọn', async () => {
    const nguoi = userEvent.setup();
    chanFetch();
    moSua();
    await nguoi.type(screen.getByLabelText(/Tên Hộ kinh doanh/), ' B');
    expect(oSdt().value).toBe('');
    expect(document.querySelector('.truong-loi')).toBeNull();
    expect(nutLuu().disabled).toBe(false);
  });
});

/**
 * `0223` — CHỨC DANH NGƯỜI ĐẠI DIỆN là ô chọn: *Giám đốc* · *Chủ hộ kinh doanh*
 * · *Khác* (tự nhập).
 */
describe('`0223` ô chức danh người đại diện', () => {
  const oChuc = () => screen.getByLabelText(/Chức danh người đại diện/) as HTMLSelectElement;
  const nutLuu = () => screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;

  it('là ô CHỌN: mục trống, hai chức danh, và Khác — đúng thứ tự', () => {
    chanFetch();
    moSua();
    expect(oChuc().tagName).toBe('SELECT');
    expect([...oChuc().options].map((o) => o.textContent)).toEqual([
      '— Chọn chức danh —',
      'Giám đốc',
      'Chủ hộ kinh doanh',
      'Khác (tự nhập)',
    ]);
    // Khách chưa có chức danh thì mở ra ở mục trống, KHÔNG tự chọn mục đầu.
    expect(oChuc().value).toBe('');
  });

  it('chọn một chức danh trong danh sách thì gửi đúng CÂU CHỮ ấy', async () => {
    const nguoi = userEvent.setup();
    const f = chanFetch();
    moSua();
    await nguoi.selectOptions(oChuc(), 'Chủ hộ kinh doanh');
    expect(screen.queryByLabelText(/Ghi rõ chức danh/)).toBeNull();
    await nguoi.click(nutLuu());
    await waitFor(() => expect(thanDaGui(f)).toBeDefined());
    expect(thanDaGui(f).ownerTitle).toBe('Chủ hộ kinh doanh');
  });

  it('chọn Khác thì hiện ô tự gõ, BẮT BUỘC, và gửi chữ đã gõ', async () => {
    const nguoi = userEvent.setup();
    const f = chanFetch();
    moSua();
    await nguoi.selectOptions(oChuc(), 'Khác (tự nhập)');
    const oKhac = screen.getByLabelText(/Ghi rõ chức danh/) as HTMLInputElement;
    // Chưa gõ gì thì nút Lưu xám — cùng lối ô công nợ Khác (`0138`).
    expect(nutLuu().disabled).toBe(true);
    await nguoi.type(oKhac, 'Trưởng khoa');
    expect(nutLuu().disabled).toBe(false);
    await nguoi.click(nutLuu());
    await waitFor(() => expect(thanDaGui(f)).toBeDefined());
    expect(thanDaGui(f).ownerTitle).toBe('Trưởng khoa');
    // Giá trị nội bộ của mục Khác không bao giờ đi xuống máy chủ.
    expect(JSON.stringify(thanDaGui(f))).not.toContain('__khac__');
  });

  it('chức danh CŨ ngoài danh sách mở ra thành Khác, chữ cũ nằm sẵn trong ô gõ', () => {
    /*
     * Không bao giờ để dữ liệu cũ hiện thành ô trống (bài học `0205`): lượt Lưu
     * tiếp theo — dù chỉ sửa số điện thoại — sẽ lặng lẽ xoá mất chức danh.
     */
    chanFetch();
    dung(
      <BieuMauKhachHang
        khach={{ ...KHACH, ownerTitle: 'Chủ nhà thuốc' }}
        dong={() => undefined}
        xong={() => undefined}
      />,
    );
    expect(oChuc().selectedOptions[0]!.textContent).toBe('Khác (tự nhập)');
    expect((screen.getByLabelText(/Ghi rõ chức danh/) as HTMLInputElement).value).toBe(
      'Chủ nhà thuốc',
    );
  });

  it('chức danh cũ TRÙNG một mục thì mở ra đúng mục ấy', () => {
    chanFetch();
    dung(
      <BieuMauKhachHang
        khach={{ ...KHACH, ownerTitle: 'Giám đốc' }}
        dong={() => undefined}
        xong={() => undefined}
      />,
    );
    expect(oChuc().value).toBe('Giám đốc');
    expect(screen.queryByLabelText(/Ghi rõ chức danh/)).toBeNull();
  });
});

/**
 * `0226` — MÃ KHÁCH HÀNG SỬA ĐƯỢC, CHỈ TDV PHỤ TRÁCH (khách hàng chốt 28/09).
 *
 * Ô mã có mặt ở cả biểu mẫu SỬA. Người phụ trách gõ được; người khác thấy ô
 * xám kèm một câu nói vì sao. `code` chỉ đi lên khi thật sự đổi — cùng lối với
 * `customerType` (`0023`), để nhật ký không đầy những lượt "đổi mã" không có thật.
 */
describe('`0226` ô mã khách hàng khi SỬA', () => {
  const dangNhap = (id: string, role: string) =>
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({
        accessToken: 'a',
        refreshToken: 'r',
        user: { id, username: 'x', fullName: 'X', email: 'x@example.com', role, mustChangePassword: false },
      }),
    );
  /**
   * `/auth/me` trả đúng người trong phiên; `/policies/current` trả theo `hieuLuc`
   * — mặc định 404 (chưa có CSBH đang hiệu lực); mọi đường khác trả rỗng.
   */
  const chanCoPhien = (hieuLuc: 404 | 500 | { code: string } = 404) => {
    const f = vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/auth/me')) {
        return Promise.resolve(phanHoi(JSON.parse(localStorage.getItem('csbh:phien') ?? '{}').user));
      }
      if (d.includes('/policies/current')) {
        if (typeof hieuLuc === 'object') return Promise.resolve(phanHoi(hieuLuc));
        return Promise.resolve(
          new Response(JSON.stringify({ code: hieuLuc === 404 ? 'NO_ACTIVE_POLICY' : 'LOI' }), {
            status: hieuLuc,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(phanHoi({}));
    });
    vi.stubGlobal('fetch', f);
    return f;
  };
  const oMa = () => screen.getByLabelText(/Mã khách hàng/) as HTMLInputElement;

  it('TDV PHỤ TRÁCH: ô mã gõ được, mang sẵn mã hiện tại, kèm câu hệ quả', async () => {
    dangNhap(KHACH.tdvUserId!, 'TDV');
    chanCoPhien();
    moSua();
    await waitFor(() => expect(oMa().disabled).toBe(false));
    expect(oMa().value).toBe(KHACH.code);
    expect(screen.getByText(/đã gửi duyệt/)).toBeDefined();
  });

  it('đổi mã → PATCH mang `code` đã cắt khoảng trắng', async () => {
    const nguoi = userEvent.setup();
    dangNhap(KHACH.tdvUserId!, 'TDV');
    const f = chanCoPhien();
    moSua();
    await waitFor(() => expect(oMa().disabled).toBe(false));
    await nguoi.clear(oMa());
    await nguoi.type(oMa(), '  KH-0099  ');
    await nguoi.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(thanDaGui(f).code).toBe('KH-0099'));
  });

  it('KHÔNG đổi mã → PATCH không mang `code`', async () => {
    const nguoi = userEvent.setup();
    dangNhap(KHACH.tdvUserId!, 'TDV');
    const f = chanCoPhien();
    moSua();
    await waitFor(() => expect(oMa().disabled).toBe(false));
    await nguoi.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(thanDaGui(f)).not.toHaveProperty('code'));
  });

  it('người KHÁC (Quản trị) thấy ô mã nhưng xám, kèm câu nói vì sao', async () => {
    dangNhap('quan-tri-1', 'QUAN_TRI');
    chanCoPhien();
    moSua();
    await waitFor(() => expect(screen.getByText(/Chỉ Trình dược viên phụ trách/)).toBeDefined());
    expect(oMa().disabled).toBe(true);
    expect(oMa().value).toBe(KHACH.code);
  });

  it('xoá trắng ô mã thì nút Lưu xám', async () => {
    const nguoi = userEvent.setup();
    dangNhap(KHACH.tdvUserId!, 'TDV');
    chanCoPhien();
    moSua();
    await waitFor(() => expect(oMa().disabled).toBe(false));
    await nguoi.clear(oMa());
    expect((screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('`0226` khách ĐANG CÓ CSBH hiệu lực → ô mã khoá, nói ra mã hồ sơ (bổ sung 28/09)', async () => {
    dangNhap(KHACH.tdvUserId!, 'TDV');
    chanCoPhien({ code: 'CSBH-2026-000123' });
    moSua();
    await waitFor(() => expect(screen.getByText(/đang có CSBH hiệu lực/)).toBeDefined());
    expect(screen.getByText('CSBH-2026-000123')).toBeDefined();
    expect(oMa().disabled).toBe(true);
  });

  it('`0226` hỏi CSBH hiệu lực HỎNG → ô mã khoá, không đoán là chưa có', async () => {
    // Nuốt lỗi thành "chưa có" (`0089`) là mở ô cho một lượt Lưu mà máy chủ
    // chắc chắn từ chối (fail closed).
    dangNhap(KHACH.tdvUserId!, 'TDV');
    chanCoPhien(500);
    moSua();
    await waitFor(() => expect(screen.getByText(/Chưa kiểm được/)).toBeDefined());
    expect(oMa().disabled).toBe(true);
  });

  it('`0226` người KHÔNG phụ trách thì không hỏi `/policies/current` — hỏi cũng vô ích', async () => {
    dangNhap('quan-tri-1', 'QUAN_TRI');
    const f = chanCoPhien();
    moSua();
    await waitFor(() => expect(screen.getByText(/Chỉ Trình dược viên phụ trách/)).toBeDefined());
    expect(f.mock.calls.some((c) => String(c[0]).includes('/policies/current'))).toBe(false);
  });
});
