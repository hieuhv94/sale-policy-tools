/**
 * @vitest-environment jsdom
 *
 * `0083` — lập hồ sơ NGAY TỪ màn hình khách hàng.
 *
 * Đường cũ: *Hồ sơ CSBH* → *Lập hồ sơ* → gõ lại tên khách vừa xem → chọn trong
 * danh sách. Ba bước để quay lại đúng chỗ đang đứng, và bước cuối còn có khả
 * năng chọn nhầm một khách trùng tên.
 *
 * Hai nửa, kiểm riêng: nút có hiện đúng người không, và bấm vào có tới thẳng
 * bước chọn cách lập không.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ChiTietKhachHang } from '@csbh/web/khach-hang-ui';
import { LapHoSo } from '@csbh/web/lap-ho-so';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';

const TDV_ID = '11111111-1111-1111-1111-111111111111';
const KHAC_ID = '22222222-2222-2222-2222-222222222222';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const KHACH = {
  id: 'kh-1',
  code: 'KH-0007',
  name: 'Nha thuoc Minh Chau',
  customerType: 1,
  registeredAddress: 'Ha Noi',
  deliveryAddress: null,
  ownerName: 'Chu ho',
  ownerTitle: null,
  idNumber: null,
  debt: '0',
  tdvUserId: TDV_ID,
  status: 'DANG_HOP_TAC',
};

/** Đăng nhập sẵn bằng một vai trò — `PhienProvider` đọc từ `localStorage`. */
const dangNhapLa = (id: string, role: string) =>
  localStorage.setItem(
    'csbh:phien',
    JSON.stringify({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id, username: 'u', fullName: 'Nguoi Dung', email: 'u@x.vn', role, mustChangePassword: false },
    }),
  );

const chanMang = (khach: Record<string, unknown>) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/auth/me')) {
      return Promise.resolve(json(JSON.parse(localStorage.getItem('csbh:phien')!).user));
    }
    // Hồ sơ pháp lý trả về MẢNG TRẦN, không phải `{ items }` — `HoSoPhapLy`
    // gọi `ds.map` thẳng. Trả sai hình dạng thì màn hình nổ ngay lúc dựng, và
    // ca kiểm thử vẫn xanh vì nó không nhìn tới khối ấy.
    if (d.includes('/documents')) return Promise.resolve(json([]));
    if (/\/customers\/[^/?]+($|\?)/.test(d)) return Promise.resolve(json(khach));
    if (d.includes('/customers')) return Promise.resolve(json({ items: [khach], total: 1 }));
    /*
     * 404, KHÔNG phải `null`. Máy chủ ném `NO_ACTIVE_POLICY` khi khách chưa có
     * CSBH nào (`policies.service.current`), và màn hình bắt đúng 404 ấy để
     * hiện "chưa có CSBH". Trả `null` thì `hienHanh` vẫn là `null` và màn hình
     * đứng ở vòng quay mãi mãi — một stub nói sai hình dạng máy chủ trả về, và
     * ca kiểm thử đỏ vì chính nó chứ không vì mã sản phẩm.
     */
    if (d.includes('/policies/current')) {
      return Promise.resolve(new Response('{"code":"NO_ACTIVE_POLICY"}', { status: 404 }));
    }
    return Promise.resolve(json({ items: [], total: 0 }));
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const mo = (el: React.ReactNode, duong = '/khach-hang/kh-1') => {
  window.history.replaceState(null, '', duong);
  return render(
    <BoDinhTuyen>
      <PhienProvider>{el}</PhienProvider>
    </BoDinhTuyen>,
  );
};

const nutLap = () => screen.queryByRole('link', { name: 'Lập hồ sơ CSBH' });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('`0083` nút lập hồ sơ ở màn hình khách hàng', () => {
  it('TDV ĐANG PHỤ TRÁCH thấy nút, và nút mang theo id khách hàng', async () => {
    dangNhapLa(TDV_ID, 'TDV');
    chanMang(KHACH);
    mo(<ChiTietKhachHang id="kh-1" />);

    await waitFor(() => expect(nutLap()).not.toBeNull());
    // Id đi theo đường dẫn: đó là cả điểm của nút — sang tới nơi là đã chọn
    // đúng khách, không phải tìm lại.
    expect(nutLap()!.getAttribute('href')).toBe('/ho-so/moi?khachHang=kh-1');
  });

  it('TDV KHÁC không thấy nút — máy chủ cũng sẽ từ chối họ', async () => {
    /*
     * `create()` gọi `assertInScope(customer.tdvUserId, me)`, mà phạm vi của một
     * TDV là chính họ. Bày nút cho TDV khác là bày một nút chắc chắn nhận 403.
     */
    dangNhapLa(KHAC_ID, 'TDV');
    chanMang(KHACH);
    mo(<ChiTietKhachHang id="kh-1" />);

    await waitFor(() => expect(screen.getByText(/Minh Chau/)).toBeDefined());
    expect(nutLap()).toBeNull();
  });

  it('vai trò KHÔNG lập được hồ sơ thì không thấy nút', async () => {
    // Kế toán xem được khách hàng nhưng không lập CSBH (`FE-23`, bảng quyền).
    dangNhapLa(TDV_ID, 'KE_TOAN');
    chanMang(KHACH);
    mo(<ChiTietKhachHang id="kh-1" />);

    await waitFor(() => expect(screen.getByText(/Minh Chau/)).toBeDefined());
    expect(nutLap()).toBeNull();
  });

  it('khách ĐÃ NGỪNG HỢP TÁC thì ẩn nút', async () => {
    // Máy chủ trả `CUSTOMER_RETIRED`. Một nút bấm vào chỉ để nhận lỗi là một nút
    // không nên có — cùng lý do với nút *Xoá* ngay cạnh nó.
    dangNhapLa(TDV_ID, 'TDV');
    chanMang({ ...KHACH, status: 'NGUNG_HOP_TAC' });
    mo(<ChiTietKhachHang id="kh-1" />);

    await waitFor(() => expect(screen.getByText(/Minh Chau/)).toBeDefined());
    expect(nutLap()).toBeNull();
  });
});

describe('`0083` màn hình lập hồ sơ nhận khách hàng từ đường dẫn', () => {
  it('có `?khachHang=` thì vào THẲNG bước chọn cách lập, bỏ qua bước tìm', async () => {
    dangNhapLa(TDV_ID, 'TDV');
    chanMang(KHACH);
    mo(<LapHoSo />, '/ho-so/moi?khachHang=kh-1');

    // Dấu hiệu của bước hai: tên khách đã chốt, và không còn ô tìm nào.
    await waitFor(() => expect(screen.getByText(/Minh Chau/)).toBeDefined());
    expect(screen.queryByLabelText('Tìm khách hàng'), 'vẫn bắt tìm lại').toBeNull();
  });

  it('KHÔNG có tham số thì vẫn là bước tìm như cũ', async () => {
    dangNhapLa(TDV_ID, 'TDV');
    chanMang(KHACH);
    mo(<LapHoSo />, '/ho-so/moi');
    await waitFor(() => expect(screen.getByLabelText('Tìm khách hàng')).toBeDefined());
  });

  it('id trong đường dẫn tra HỤT thì rơi về bước tìm, không phải màn hình lỗi', async () => {
    /*
     * Id có thể cũ, có thể sai, có thể của một khách ngoài phạm vi. Một màn hình
     * lỗi ở đây chặn cả việc lập hồ sơ cho khách khác, mà bước tìm vẫn dùng được.
     */
    dangNhapLa(TDV_ID, 'TDV');
    const f = vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/auth/me')) {
        return Promise.resolve(json(JSON.parse(localStorage.getItem('csbh:phien')!).user));
      }
      if (/\/customers\/[^/?]+($|\?)/.test(d)) {
        return Promise.resolve(new Response('{"code":"NOT_FOUND"}', { status: 404 }));
      }
      return Promise.resolve(json({ items: [], total: 0 }));
    });
    vi.stubGlobal('fetch', f);
    mo(<LapHoSo />, '/ho-so/moi?khachHang=khong-co-that');

    await waitFor(() => expect(screen.getByLabelText('Tìm khách hàng')).toBeDefined());
  });
});

// =============================================================================
// `0133` — hai khối CSBH nói "không khả dụng" với Quản trị hệ thống
// =============================================================================

describe('`0133` màn hình khách hàng với Quản trị hệ thống', () => {
  const QT_ID = '33333333-3333-3333-3333-333333333333';

  it('hai khối CSBH nói KHÔNG KHẢ DỤNG, và không hỏi máy chủ câu nào', async () => {
    /*
     * Ba câu trả lời khác hẳn nhau, và hai câu kia đều nói sai với vai trò này:
     *
     *   - khối ĐỎ  — `scope_user_ids` rỗng nên máy chủ trả `403 OUT_OF_SCOPE`,
     *     và một khối đỏ đọc như hệ thống đang hỏng;
     *   - "chưa có CSBH nào" — một khẳng định về DỮ LIỆU mà màn hình không có
     *     căn cứ đưa ra: khách rất có thể đang có một CSBH hiệu lực.
     *
     * Vế thứ hai của ca này là vế đáng giá: KHÔNG GỌI API. Câu trả lời đã biết
     * trước khi hỏi, nên gọi rồi bắt `403` là dựng câu trả lời từ một mã lỗi —
     * hỏng lặng lẽ nếu máy chủ đổi mã.
     */
    dangNhapLa(QT_ID, 'QUAN_TRI');
    const f = chanMang(KHACH);
    mo(<ChiTietKhachHang id="kh-1" />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeDefined());
    await waitFor(() =>
      expect(screen.getAllByText(/Không khả dụng với vai trò của bạn/).length).toBe(2),
    );

    const goi = f.mock.calls.map((c) => String(c[0]));
    expect(goi.filter((d) => d.includes('/policies')), 'không được hỏi hồ sơ').toEqual([]);
    // Và thông tin khách hàng thì vẫn hiện bình thường — đó là cả lý do trang
    // này còn ở lại trong phạm vi của họ.
    expect(screen.getByText(KHACH.name)).toBeDefined();
  });

  it('TDV thì ngược lại: có hỏi hồ sơ, và không có chữ *không khả dụng* nào', async () => {
    // Chiều đối chiếu. Thiếu nó thì đổi cờ thành hằng `false` vẫn xanh, và mọi
    // vai trò đều mất khối CSBH trên màn hình khách hàng.
    dangNhapLa(TDV_ID, 'TDV');
    const f = chanMang(KHACH);
    mo(<ChiTietKhachHang id="kh-1" />);

    await waitFor(() =>
      expect(f.mock.calls.some((c) => String(c[0]).includes('/policies/current'))).toBe(true),
    );
    expect(screen.queryByText(/Không khả dụng với vai trò của bạn/)).toBeNull();
  });
});
