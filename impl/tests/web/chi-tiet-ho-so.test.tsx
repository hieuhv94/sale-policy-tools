/**
 * @vitest-environment jsdom
 *
 * `0061` — đầu màn hình hồ sơ, và khối lịch sử ở cuối nó.
 *
 * Ba yêu cầu của khách hàng, và cả ba đều là chuyện BỐ CỤC chứ không phải chuyện
 * dữ liệu — nên chúng chỉ kiểm được bằng cách dựng thật màn hình ra:
 *
 *   1. Thông tin hồ sơ mỗi thứ một dòng CÓ NHÃN, không dồn hết lên một dòng.
 *   2. Nút thao tác ở góc trên bên phải, ngang hàng với mã hồ sơ.
 *   3. Lịch sử là mục CUỐI CÙNG, gập lại, bấm mới sổ ra.
 *
 * Ca dễ hỏng nhất là số 3: một khối gập tải sẵn nội dung ngay lúc mở trang thì
 * nhìn bằng mắt không thấy khác gì, mà mỗi lượt mở hồ sơ lại thêm một vòng mạng.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ChiTietHoSo } from '@csbh/web/chi-tiet-ho-so';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';

const TBP = {
  accessToken: 'a',
  refreshToken: 'r',
  user: {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'tbp01',
    fullName: 'Tran Thi Tbp',
    email: 'tbp01@example.com',
    role: 'TBP',
    mustChangePassword: false,
  },
};

const HO_SO = {
  id: 'hs-1',
  code: 'CSBH-2026-000123',
  customerId: 'kh-1',
  versionNo: 2,
  status: 'CHO_TBP_DUYET',
  createdAt: '2026-07-28T02:15:00.000Z',
  appliedDate: '2026-08-01',
  effectiveFrom: null,
  lastReason: null,
  nguoiDeNghi: { ten: 'Nguyen Van Tdv' },
  khachHang: {
    ma: 'KH-000123',
    ten: 'Cong ty TNHH Duoc pham ABC',
    loai: 2,
    congNo: '4500000',
    trangThai: 'DANG_HOP_TAC',
  },
  xoaDuoc: false,
  lech: [],
  nguoiDuyet: {},
  loaiTepGhiDuoc: [],
  tepXoaDuoc: false,
  xuatHopDongDuoc: false,
  rowVersion: 3,
  lines: [],
  attachments: [],
};

const LICH_SU = [
  {
    seq: 1,
    fromStatus: null,
    toStatus: 'NHAP',
    action: 'CREATE',
    actorId: '11111111-1111-1111-1111-111111111111',
    actorRole: 'TDV',
    actorName: 'Nguyen Van Tdv',
    reason: null,
    at: '2026-07-28T02:15:00.000Z',
  },
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Chặn `fetch` theo ĐƯỜNG DẪN, không theo thứ tự lời gọi.
 *
 * Màn hình này gọi ba đường song song lúc mở (hồ sơ, hành động cho phép, tệp) và
 * thêm một đường nữa khi người dùng sổ lịch sử ra. Trả theo thứ tự thì đổi thứ
 * tự `Promise.all` một lần là test đỏ mà chẳng có gì hỏng.
 */
const chan = (hoSo: unknown = HO_SO, choPhep: string[] = ['TBP_SIGN', 'TBP_REJECT']) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/events')) return Promise.resolve(json(LICH_SU));
    if (d.includes('/allowed-actions')) return Promise.resolve(json({ allowed: choPhep }));
    if (d.includes('/files')) return Promise.resolve(json([]));
    return Promise.resolve(json(hoSo));
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const mo = async (hoSo: unknown = HO_SO, choPhep?: string[]) => {
  const f = chan(hoSo, choPhep);
  render(
    <PhienProvider>
      <BoDinhTuyen>
        <ChiTietHoSo id="hs-1" />
      </BoDinhTuyen>
    </PhienProvider>,
  );
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeDefined());
  return f;
};

/** Ô giá trị đứng cạnh nhãn này trong lưới thông tin. */
const oCua = (nhan: string): string => {
  const dt = [...document.querySelectorAll('.tom-tat-nhom dt')].find((e) => e.textContent === nhan);
  expect(dt, `không có ô nào tên "${nhan}"`).toBeDefined();
  return dt!.parentElement!.querySelector('dd')!.textContent ?? '';
};

beforeEach(() => localStorage.setItem('csbh:phien', JSON.stringify(TBP)));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('`0061` thông tin hồ sơ tách dòng, mỗi thứ một nhãn', () => {
  it('sáu thứ đều có nhãn riêng, không dồn lên một dòng chữ xám', async () => {
    /*
     * Tới `0060` cả khối này là MỘT dòng: "Phiên bản 2 · Ngày áp dụng … · Có
     * hiệu lực …". Ba con số ngày tháng nối nhau bằng dấu chấm giữa dòng thì mắt
     * phải đọc cả câu mới tách được cái mình cần.
     */
    await mo();
    expect(oCua('Phiên bản')).toBe('2');
    expect(oCua('Trạng thái')).toBe('Chờ TBP duyệt');
    expect(oCua('Ngày soạn thảo')).toBe('28/07/2026');
    expect(oCua('Ngày áp dụng')).toBe('01/08/2026');
    expect(oCua('Người đề nghị')).toBe('Nguyen Van Tdv');
  });

  it('ngày soạn thảo KHÁC ngày áp dụng — hai mốc, hai ô', async () => {
    // Dễ lẫn nhất trong cả khối: hồ sơ soạn dần thì hai mốc cách nhau hàng tuần,
    // và lấy nhầm mốc nào cũng ra một ngày trông có vẻ hợp lý.
    await mo();
    expect(oCua('Ngày soạn thảo')).not.toBe(oCua('Ngày áp dụng'));
  });

  it('khách hàng là NHÓM RIÊNG: mã, tên, loại, công nợ', async () => {
    await mo();
    const nhom = [...document.querySelectorAll('.tom-tat-nhom')].find(
      (e) => e.querySelector('h2')?.textContent === 'Khách hàng',
    );
    expect(nhom, 'không có nhóm Khách hàng').toBeDefined();

    expect(within(nhom as HTMLElement).getByText('KH-000123')).toBeDefined();
    expect(oCua('Tên')).toBe('Cong ty TNHH Duoc pham ABC');
    expect(oCua('Loại')).toBe('Loại 2');
    // Công nợ đọc theo tiền, không phải một chuỗi bigint thô.
    expect(oCua('Công nợ')).toBe('4.500.000 đ');
  });

  it('mã khách hàng bấm được, dẫn sang màn hình khách hàng đó', async () => {
    await mo();
    const a = screen.getByText('KH-000123').closest('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/khach-hang/kh-1');
  });

  it('"Có hiệu lực" chỉ hiện khi ĐÃ có hiệu lực', async () => {
    // Một ô "Có hiệu lực —" trên mọi hồ sơ đang đi trong luồng là một dòng không
    // nói gì, nằm ngay cạnh hai ô ngày tháng có thật.
    await mo();
    expect(document.body.textContent).not.toContain('Có hiệu lực');

    cleanup();
    await mo({ ...HO_SO, effectiveFrom: '2026-08-05T03:12:00.000Z' });
    expect(oCua('Có hiệu lực')).toContain('05/08/2026');
  });

  it('`customer` chết thì mất KHỐI khách hàng, không mất cả màn hình', async () => {
    await mo({ ...HO_SO, khachHang: null });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CSBH-2026-000123');
    expect(document.body.textContent).toContain('Chưa tải được thông tin khách hàng');
  });

  it('khách đã ngừng hợp tác thì nói ra ở ngay khối này', async () => {
    // Hồ sơ cũ của họ vẫn mở được, và không có dòng này thì người đọc không thấy
    // gì bất thường ở một chính sách dành cho khách không còn giao dịch.
    await mo({ ...HO_SO, khachHang: { ...HO_SO.khachHang, trangThai: 'NGUNG_HOP_TAC' } });
    expect(document.body.textContent).toContain('Đã ngừng hợp tác');
  });
});

describe('`0061` thao tác ở góc trên bên phải', () => {
  it('nút nằm TRONG khối tiêu đề, ngang hàng với mã hồ sơ', async () => {
    /*
     * Trước `0061` chúng ở đáy trang, sau bảng sản phẩm và sau tệp đính kèm.
     * Người vào đây để KÝ phải cuộn qua toàn bộ nội dung mới tới việc của mình.
     */
    await mo();
    const dau = document.querySelector('.dau-trang') as HTMLElement;
    expect(dau).not.toBeNull();
    expect(within(dau).getByRole('heading', { level: 1 })).toBeDefined();
    expect(within(dau).getByRole('button', { name: /ký/i })).toBeDefined();
  });

  it('không còn mục "Thao tác" riêng ở cuối trang', async () => {
    await mo();
    expect(screen.queryByRole('heading', { name: 'Thao tác' })).toBeNull();
  });

  it('`0054` vai trò không làm được gì thì nhóm nút chỉ còn ĐÚNG nút xem', async () => {
    /*
     * Ca này đảo chiều ở `0054`, và đảo có lý do.
     *
     * Bản cũ khẳng định nhóm nút BIẾN MẤT khi vai trò không thao tác được gì —
     * một khối bo góc rỗng bám mép phải tiêu đề trông như giao diện hỏng. Giờ
     * nhóm ấy luôn có ít nhất *Xem bản mềm*, vốn không phải thao tác ghi, nên nó
     * không bao giờ rỗng nữa. Điều cần giữ là **không có nút ghi nào lọt vào**.
     */
    await mo(HO_SO, []);
    const dau = document.querySelector('.nhom-nut-dau');
    expect(dau).not.toBeNull();
    const ten = [...dau!.querySelectorAll('button')].map((b) => b.textContent);
    expect(ten).toEqual(['Xem bản mềm']);
  });
});

describe('`0061` lịch sử là mục cuối, gập lại', () => {
  it('gập sẵn lúc mở trang, và KHÔNG gọi `/events` trước khi người dùng bấm', async () => {
    /*
     * Đây là ca đáng giá nhất tệp này. Tải sẵn thì nhìn bằng mắt không thấy khác
     * gì — chỉ khác ở chỗ mỗi lượt mở hồ sơ tốn thêm một vòng mạng, trên đúng
     * màn hình được mở nhiều nhất của phần mềm.
     */
    const f = await mo();
    const chiTiet = document.querySelector('details.khoi-gap') as HTMLDetailsElement;
    expect(chiTiet, 'lịch sử không phải khối gập').not.toBeNull();
    expect(chiTiet.open).toBe(false);

    const goi = f.mock.calls.map((c) => String(c[0]));
    expect(goi.some((d) => d.includes('/events')), 'đã gọi /events khi chưa ai bấm').toBe(false);
  });

  it('bấm vào thì sổ ra và mới đi lấy nội dung', async () => {
    const f = await mo();
    const chiTiet = document.querySelector('details.khoi-gap') as HTMLDetailsElement;

    // jsdom không tự phát `toggle` khi đổi `open`, nên đặt cờ rồi phát tay —
    // đúng thứ trình duyệt làm khi người dùng bấm vào `<summary>`.
    chiTiet.open = true;
    fireEvent(chiTiet, new Event('toggle'));

    await waitFor(() => expect(document.body.textContent).toContain('Lập hồ sơ'));
    expect(f.mock.calls.map((c) => String(c[0])).some((d) => d.includes('/events'))).toBe(true);
  });

  it('nó là mục CUỐI CÙNG của trang', async () => {
    await mo();
    const trang = document.querySelector('.trang') as HTMLElement;
    const muc = [...trang.querySelectorAll(':scope > h2, :scope > details.khoi-gap')];
    expect(muc.at(-1)?.tagName).toBe('DETAILS');
  });

  it('`0065` thanh gập chỉ có TÊN MỤC, không có dòng chú thích nào', async () => {
    /*
     * Một mục tên *Lịch sử* trên màn hình hồ sơ thì không cần ai giải thích, và
     * dòng chữ nhỏ màu xám đứng đó đẩy mũi tên tụt xuống giữa thanh — chỗ mắt
     * không tìm. Mũi tên vẽ bằng CSS ở mép phải, nên phần tử duy nhất trong
     * `<summary>` phải là tiêu đề.
     */
    await mo();
    const tom = document.querySelector('details.khoi-gap > summary') as HTMLElement;
    expect(tom.children).toHaveLength(1);
    expect(tom.children[0]!.tagName).toBe('H2');
    expect(tom.textContent).toBe('Lịch sử');
  });

  it('`0065` bảng sổ ra KHÔNG kèm câu chú thích nào phía trên', async () => {
    // Câu cũ nói hai thứ bảng đã tự nói: thứ tự đọc ra từ cột `#`, còn "chỉ ghi
    // thêm" thì không ai kiểm được bằng mắt — nó là lời hứa, chỗ của nó là tài
    // liệu hướng dẫn.
    const f = await mo();
    const chiTiet = document.querySelector('details.khoi-gap') as HTMLDetailsElement;
    chiTiet.open = true;
    fireEvent(chiTiet, new Event('toggle'));
    await waitFor(() => expect(document.body.textContent).toContain('Lập hồ sơ'));

    const than = document.querySelector('.khoi-gap-than') as HTMLElement;
    expect(than.querySelector('.ghi-chu'), 'còn dòng chú thích trong khối gập').toBeNull();
    // Phần tử đầu tiên trong thân là khung cuộn của bảng, không phải một đoạn chữ.
    expect(than.firstElementChild?.className).toContain('khung-cuon');
    expect(f).toBeDefined();
  });

  it('đổi tên thành "Lịch sử" — không còn gọi là "Nhật ký"', async () => {
    /*
     * Phần mềm có hai thứ tên "Nhật ký": nhật ký kiểm toán toàn hệ thống (một
     * mục menu của Quản trị) và lịch sử của một hồ sơ. Trùng tên ở hai thứ có
     * phạm vi khác hẳn nhau là một câu hỏi lặp lại mãi trong mọi buổi hướng dẫn.
     */
    await mo();
    expect(screen.getByRole('heading', { name: 'Lịch sử' })).toBeDefined();
    expect(document.body.textContent).not.toContain('Nhật ký');
  });
});

// =============================================================================
// `0050` · `0051` — cảnh báo bản scan cũ, và xem tệp trực tiếp
// =============================================================================

describe('`0050` cảnh báo bản scan Kế toán đã yêu cầu in lại', () => {
  it('có cờ thì nói rõ phải gỡ và thay, và nói rõ hệ thống KHÔNG chặn', async () => {
    await mo({ ...HO_SO, status: 'SA_DANG_XU_LY', banScanCu: true });
    const khoi = document.querySelector('.canh-bao-scan');
    expect(khoi, 'phải có khối cảnh báo').not.toBeNull();
    expect(khoi!.textContent).toContain('đã yêu cầu in lại');
    // Hai câu này là cả lý do khối tồn tại: hồ sơ vẫn bàn giao lại được ngay,
    // nên phải nói ra việc cần làm VÀ nói rõ không ai chặn nếu bỏ qua.
    expect(khoi!.textContent).toContain('tải bản scan mới lên');
    expect(khoi!.textContent).toContain('không chặn');
  });

  it('không có cờ thì KHÔNG có khối nào — đây là màn hình mở mỗi ngày', async () => {
    await mo({ ...HO_SO, status: 'SA_DANG_XU_LY', banScanCu: false });
    expect(document.querySelector('.canh-bao-scan')).toBeNull();
  });

  it('máy chủ cũ không gửi cờ thì cũng KHÔNG hiện — mặc định phía an toàn', async () => {
    // Cùng luật với ba cờ của `0048`: thiếu một cờ thì mất một khối, không phải
    // hiện một cảnh báo sai ở mọi hồ sơ.
    await mo({ ...HO_SO, status: 'SA_DANG_XU_LY' });
    expect(document.querySelector('.canh-bao-scan')).toBeNull();
  });
});

describe('`0051` xem bản CSBH và hợp đồng không cần tải về', () => {
  const nut = (ten: string) => screen.queryByRole('button', { name: ten });

  it('`0054` MỘT nút *Xem bản mềm*, và nó nằm cùng hàng với mã hồ sơ', async () => {
    await mo();
    const n = nut('Xem bản mềm');
    expect(n).not.toBeNull();
    // Cùng hàng với `<h1>`, không phải một mục giữa trang.
    expect(n!.closest('.nhom-nut-dau')).not.toBeNull();

    // Ba nút cũ đã dồn hết vào nút trên.
    expect(nut('Xem bản CSBH')).toBeNull();
    expect(nut('Tải bản CSBH (A4 dọc)')).toBeNull();
    expect(nut('Tải bản CSBH (A4 ngang)')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tải văn bản' })).toBeNull();
  });

  it('`0054` bấm vào thì hỏi KHỔ GIẤY trước, chưa tải gì cả', async () => {
    /*
     * Thứ tự này là cả điểm của `0054`: bản cũ bắt chọn khổ TRƯỚC khi nhìn thấy
     * nội dung, trong khi chính nội dung mới nói được khổ nào vừa. Giờ hộp mở ra
     * là một câu hỏi, và chưa gọi máy chủ lần nào.
     */
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    expect(screen.getByRole('button', { name: 'A4 dọc' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'A4 ngang' })).toBeDefined();
    expect(f.mock.calls.map((c) => String(c[0])).some((d) => d.includes('/render'))).toBe(false);
  });

  it('`0054` chọn khổ rồi mới tải nội dung, và đường xem mang `xem=1`', async () => {
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    await waitFor(() => screen.getByRole('button', { name: 'A4 ngang' }));
    fireEvent.click(screen.getByRole('button', { name: 'A4 ngang' }));

    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'));
      expect(d.length).toBeGreaterThan(0);
      expect(d.every((x) => x.includes('size=a4l'))).toBe(true);
      // Xem thì KHÔNG ghi dòng tải xuống vào Lịch sử (`0052`).
      expect(d.every((x) => x.includes('xem=1'))).toBe(true);
    });
  });

  it('`0054` gợi ý khổ theo SỐ DÒNG, nhưng vẫn cho chọn khổ kia', async () => {
    // Hồ sơ nhiều dòng thì bảng mười cột ép chữ trên khổ dọc. Gợi ý, không ép.
    await mo({ ...HO_SO, lines: [1, 2, 3, 4, 5, 6].map(() => ({})) });
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    await waitFor(() => screen.getByRole('button', { name: 'A4 ngang' }));
    expect(screen.getByRole('button', { name: 'A4 ngang' }).className).toContain('nut-chinh');
    expect(screen.getByRole('button', { name: 'A4 dọc' })).toBeDefined();
  });

  it('`0054` Ban lãnh đạo — không có nút thao tác nào nhưng VẪN xem được bản mềm', async () => {
    /*
     * Trước `0054` cả nhóm nút ở tiêu đề ẩn khi `thaoTac` rỗng, nên vai trò
     * chỉ-đọc không thấy nút nào. Xem bản mềm không phải thao tác ghi.
     */
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({ ...TBP, user: { ...TBP.user, role: 'BAN_LANH_DAO', username: 'bld01' } }),
    );
    await mo(HO_SO, []);
    expect(nut('Xem bản mềm')).not.toBeNull();
  });

  it('Trưởng bộ phận KHÔNG thấy nút hợp đồng nào — cả xem lẫn xuất (FE-24)', async () => {
    // Phiên đang đăng nhập là TBP. Nút *Xem hợp đồng* phải theo đúng cổng quyền
    // của nút *Xuất hợp đồng*, nếu không thì nó thành đường vòng quanh FE-24.
    await mo({ ...HO_SO, status: 'SA_DANG_XU_LY', xuatHopDongDuoc: true });
    expect(nut('Xem hợp đồng')).toBeNull();
    expect(nut('Xuất hợp đồng (PDF)')).toBeNull();
  });

  it('chưa tới lúc xuất được hợp đồng thì KHÔNG có nút xem', async () => {
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({ ...TBP, user: { ...TBP.user, role: 'KE_TOAN', username: 'kt01' } }),
    );
    await mo({ ...HO_SO, status: 'CHO_KT_L1', xuatHopDongDuoc: false });
    expect(nut('Xem hợp đồng')).toBeNull();
  });

  it('Kế toán sau tiếp nhận L1 thấy CẢ HAI nút hợp đồng', async () => {
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({ ...TBP, user: { ...TBP.user, role: 'KE_TOAN', username: 'kt01' } }),
    );
    await mo({ ...HO_SO, status: 'SA_DANG_XU_LY', xuatHopDongDuoc: true });
    expect(nut('Xem hợp đồng')).not.toBeNull();
    expect(nut('Xuất hợp đồng (PDF)')).not.toBeNull();
  });
});
