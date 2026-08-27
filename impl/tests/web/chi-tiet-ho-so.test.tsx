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
import { TY_LE_KHO } from '@csbh/web/mau-hop-dong';

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
    congNo: 'Thanh toán gối đơn, công nợ không quá 90 ngày',
    trangThai: 'DANG_HOP_TAC',
  },
  xoaDuoc: false,
  lech: [],
  nguoiDuyet: {},
  loaiTepGhiDuoc: [],
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

/** Hai mẫu đang dùng — đủ để ô chọn hiện ra (`0058`). */
const MAU = [
  { id: '00000000-0000-4000-8000-000000000001', ten: 'Mẫu A4 dọc', khoGiay: 'a4p' },
  { id: '00000000-0000-4000-8000-000000000002', ten: 'Mẫu A4 ngang', khoGiay: 'a4l' },
];

/** Người để chọn ở bước gửi duyệt — hộp thoại đòi cả Trưởng bộ phận lẫn Kế toán. */
const NGUOI = [{ id: 'nguoi-1', username: 'tbp01', fullName: 'Tran Thi Tbp' }];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/**
 * `/auth/me` trả về chính người dùng đang nằm trong `localStorage` (`0076`).
 *
 * Từ `0076` `PhienProvider` hỏi máy chủ xem phiên còn sống không ngay lúc khởi
 * động. Không chặn đường này thì nó rơi vào nhánh cuối và nhận về một HỒ SƠ —
 * thứ không có `role` — nên vai trò của người dùng thành rỗng và mọi nút gắn
 * quyền biến mất. Triệu chứng ("không tìm thấy nút Ký") không nhắc gì tới phiên.
 */
const toiLaAi = (): Response =>
  json(JSON.parse(localStorage.getItem('csbh:phien') ?? '{}').user ?? {});

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
    if (d.includes('/auth/me')) return Promise.resolve(toiLaAi());
    if (d.includes('/events')) return Promise.resolve(json(LICH_SU));
    if (d.includes('/allowed-actions')) return Promise.resolve(json({ allowed: choPhep }));
    if (d.includes('/files')) return Promise.resolve(json([]));
    // Danh sách mẫu cho ô chọn của hộp *Xem bản mềm* / *Xuất hợp đồng* (`0058`).
    if (d.includes('/available')) return Promise.resolve(json(MAU));
    // Người xử lý bước sau, cho hộp *Gửi duyệt* (`0031`).
    if (d.includes('/nguoi-theo-vai-tro/')) return Promise.resolve(json(NGUOI));
    // Bản A4 xem trước tải về dạng blob (`0098` kèm `mauId`).
    if (d.includes('/render')) return Promise.resolve(new Response(new Blob(['%PDF-1.4'])));
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

  it('khách hàng là NHÓM RIÊNG: mã, tên, loại, điều khoản thanh toán', async () => {
    await mo();
    const nhom = [...document.querySelectorAll('.tom-tat-nhom')].find(
      (e) => e.querySelector('h2')?.textContent === 'Khách hàng',
    );
    expect(nhom, 'không có nhóm Khách hàng').toBeDefined();

    expect(within(nhom as HTMLElement).getByText('KH-000123')).toBeDefined();
    expect(oCua('Tên')).toBe('Cong ty TNHH Duoc pham ABC');
    // `0139` — nhãn mang cả SỐ lẫn TÊN THẬT của loại khách hàng.
    expect(oCua('Loại')).toBe('Loại 2 - Hộ kinh doanh cộng tác');
    /*
     * `0138` — công nợ thôi là số tiền, nó là ĐIỀU KHOẢN thanh toán, và máy chủ
     * gửi xuống câu chữ đã dựng xong. Ô này in nguyên câu ấy: không `tien()`,
     * không hậu tố ` đ`.
     */
    expect(oCua('Điều khoản thanh toán')).toBe('Thanh toán gối đơn, công nợ không quá 90 ngày');
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

  it('`0067` HỎI MẪU TRƯỚC, chưa tải nội dung gì cả', async () => {
    /*
     * `0058` mở sẵn mẫu đầu danh sách. Khách hàng chốt lại ngày 20/08: bắt chọn
     * mẫu trước — và lý do đứng về phía họ. Từ `0067` mỗi mẫu có TẬP CỘT riêng,
     * nên hai mẫu của cùng một hồ sơ ra hai bản giấy khác hẳn nhau. Mở sẵn một
     * cái nghĩa là phần lớn người dùng không bao giờ biết cái kia tồn tại.
     */
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    expect(screen.getByRole('button', { name: /Mẫu A4 dọc/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Mẫu A4 ngang/ })).toBeDefined();
    // CHƯA gọi máy chủ dựng bản mềm lần nào.
    expect(f.mock.calls.map((c) => String(c[0])).some((d) => d.includes('/render'))).toBe(false);
  });

  it('`0067` chọn mẫu rồi mới tải, và đường tải mang đúng mẫu vừa chọn', async () => {
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    fireEvent.click(await screen.findByRole('button', { name: /Mẫu A4 ngang/ }));

    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'));
      expect(d.length).toBeGreaterThan(0);
      expect(d.every((x) => x.includes(`mauId=${MAU[1]!.id}`))).toBe(true);
      // `xem=1` ĐÃ BỎ khỏi đường bản mềm (`0059`): nó chỉ tồn tại để máy chủ
      // phân biệt xem với tải cho *Lịch sử*, mà bản mềm không ghi lịch sử nữa.
      expect(d.every((x) => !x.includes('xem=1')), 'không cần cờ xem nữa').toBe(true);
    });
  });

  it('`0058` ô chọn liệt kê ĐỦ mẫu, kèm khổ giấy đọc từ file', async () => {
    await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    fireEvent.click(await screen.findByRole('button', { name: /Mẫu A4 dọc/ }));
    const o = (await screen.findByLabelText('Mẫu')) as HTMLSelectElement;
    expect([...o.options].map((x) => x.textContent)).toEqual([
      'Mẫu A4 dọc · A4 dọc',
      'Mẫu A4 ngang · A4 ngang',
    ]);
  });

  it('`0058` đổi mẫu thì tải lại theo ĐÚNG mẫu vừa chọn', async () => {
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    fireEvent.click(await screen.findByRole('button', { name: /Mẫu A4 dọc/ }));
    const o = await screen.findByLabelText('Mẫu');
    fireEvent.change(o, { target: { value: MAU[1]!.id } });

    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'));
      expect(d.some((x) => x.includes(`mauId=${MAU[1]!.id}`))).toBe(true);
    });
  });

  it('`0058` chưa có mẫu nào đang dùng thì nói AI chữa được, không chỉ báo lỗi', async () => {
    /*
     * Người đứng đây không sửa được — chỉ Quản trị ban hành mẫu. Câu "chưa có
     * mẫu" mà không nói ai chữa là đẩy một việc không làm được sang cho họ.
     */
    const f = vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/auth/me')) return Promise.resolve(toiLaAi());
      if (d.includes('/events')) return Promise.resolve(json(LICH_SU));
      if (d.includes('/allowed-actions')) return Promise.resolve(json({ allowed: [] }));
      if (d.includes('/files')) return Promise.resolve(json([]));
      if (d.includes('/available')) return Promise.resolve(json([]));
      return Promise.resolve(json(HO_SO));
    });
    vi.stubGlobal('fetch', f);
    render(
      <PhienProvider>
        <BoDinhTuyen>
          <ChiTietHoSo id="hs-1" />
        </BoDinhTuyen>
      </PhienProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));

    await waitFor(() =>
      expect(screen.getByRole('dialog').textContent).toContain('Quản trị hệ thống'),
    );
    expect(f.mock.calls.map((c) => String(c[0])).some((d) => d.includes('/render'))).toBe(false);
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

  it('Trưởng bộ phận KHÔNG thấy nút hợp đồng nào (FE-24)', async () => {
    await mo({ ...HO_SO, status: 'SA_DANG_XU_LY', xuatHopDongDuoc: true });
    expect(nut('Xuất hợp đồng')).toBeNull();
    expect(nut('Xem hợp đồng')).toBeNull();
  });

  it('chưa tới lúc xuất được hợp đồng thì KHÔNG có nút xem', async () => {
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({ ...TBP, user: { ...TBP.user, role: 'KE_TOAN', username: 'kt01' } }),
    );
    await mo({ ...HO_SO, status: 'CHO_KT_L1', xuatHopDongDuoc: false });
    expect(nut('Xuất hợp đồng')).toBeNull();
  });

  it('`0058` Kế toán bấm *Xuất hợp đồng* thì XEM TRƯỚC, chưa tải về', async () => {
    /*
     * Trước `0058` đây là hai nút: *Xem hợp đồng* mở hộp xem, *Xuất hợp đồng
     * (PDF)* tải thẳng về. Nút tải thẳng ấy có một tác dụng phụ không ai muốn:
     * đường duy nhất để BIẾT hợp đồng trông thế nào lại là đường không đi qua
     * bước nhìn — nên người ta bấm tải, mở file, thấy sai mẫu, rồi bấm lại. Mỗi
     * lượt như thế là một dòng "đã tải hợp đồng" trong Lịch sử.
     */
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({ ...TBP, user: { ...TBP.user, role: 'KE_TOAN', username: 'kt01' } }),
    );
    const f = await mo({ ...HO_SO, status: 'SA_DANG_XU_LY', xuatHopDongDuoc: true });
    expect(nut('Xuất hợp đồng')).not.toBeNull();
    // Một nút, không phải hai.
    expect(nut('Xem hợp đồng')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Xuất hợp đồng' }));
    fireEvent.click(await screen.findByRole('button', { name: /Mẫu A4 dọc/ }));
    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('contract.pdf'));
      expect(d.length).toBeGreaterThan(0);
      // MỘT đường cho cả xem lẫn tải (`0059`) — hợp đồng không ghi lịch sử nữa.
      expect(d.every((x) => !x.includes('xem=1'))).toBe(true);
      expect(d.every((x) => x.includes('mauId='))).toBe(true);
    });
  });
});

describe('`0098` mẫu bản mềm: TDV chọn lúc gửi, các vai trò sau chỉ xem', () => {
  const TDV = {
    ...TBP,
    user: { ...TBP.user, id: '11111111-1111-1111-1111-111111111111', username: 'tdv01', role: 'TDV' },
  };

  it('hộp GỬI DUYỆT có ô chọn mẫu, và nút Tiếp tục xám cho tới khi chọn', async () => {
    localStorage.setItem('csbh:phien', JSON.stringify(TDV));
    const f = await mo({ ...HO_SO, status: 'NHAP', mauHoSoId: null }, ['SUBMIT']);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    const oMau = await screen.findByLabelText(/Văn bản mẫu/);
    expect(oMau).toBeDefined();

    /*
     * CHƯA CHỌN thì KHÔNG gọi `render` lần nào.
     *
     * Không phải chuyện tiết kiệm một vòng mạng: máy chủ trả 409 khi thiếu mẫu,
     * nên gọi trước là bày một khối đỏ ra trước khi người dùng kịp làm gì sai.
     */
    expect(f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'))).toEqual([]);
    // `0140` — bước một kết bằng *Tiếp tục*: nút này chuyển bước, không gửi gì.
    expect(screen.getByRole('button', { name: 'Tiếp tục' }).hasAttribute('disabled')).toBe(true);
  });

  it('đổi mẫu thì bản xem trước DỰNG LẠI bằng đúng mẫu vừa chọn', async () => {
    localStorage.setItem('csbh:phien', JSON.stringify(TDV));
    const f = await mo({ ...HO_SO, status: 'NHAP', mauHoSoId: null }, ['SUBMIT']);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    const oMau = await screen.findByLabelText(/Văn bản mẫu/);
    fireEvent.change(oMau, { target: { value: MAU[0]!.id } });
    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'));
      expect(d.some((x) => x.includes(`mauId=${MAU[0]!.id}`))).toBe(true);
    });

    // Mẫu thứ hai có TẬP CỘT khác, nên bản đang hiện không còn là bản sắp gửi.
    fireEvent.change(oMau, { target: { value: MAU[1]!.id } });
    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'));
      expect(d.some((x) => x.includes(`mauId=${MAU[1]!.id}`))).toBe(true);
    });
  });

  it('gửi duyệt thì `mauHoSoId` đi kèm thân yêu cầu — qua CẢ HAI bước', async () => {
    // jsdom không có `URL.createObjectURL`, mà bản xem trước dựng `blob:` từ nó
    // — thiếu thì `xemUrl` mãi là null và nút *Xác nhận* xám vĩnh viễn.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    localStorage.setItem('csbh:phien', JSON.stringify(TDV));
    const f = await mo({ ...HO_SO, status: 'NHAP', mauHoSoId: null }, ['SUBMIT']);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    fireEvent.change(await screen.findByLabelText(/Văn bản mẫu/), {
      target: { value: MAU[1]!.id },
    });
    for (const nhan of [/Trưởng bộ phận/, /Kế toán/]) {
      const o = screen.queryByLabelText(nhan);
      if (o) fireEvent.change(o, { target: { value: 'nguoi-1' } });
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tiếp tục' }).hasAttribute('disabled')).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    /*
     * BƯỚC HAI (`0140`): đọc bản mềm, rồi mới có nút gửi thật.
     *
     * Tìm TRONG hộp thoại, không tìm cả trang: nút *Gửi duyệt* của dải thao tác
     * phía sau vẫn còn đó, cùng tên. `getByRole` toàn trang trả về "tìm thấy hai
     * phần tử" — một câu lỗi nói đúng vấn đề nhưng dễ đọc nhầm thành lỗi của mã
     * sản phẩm.
     */
    const nutGui = await within(await screen.findByRole('dialog')).findByRole('button', {
      name: 'Gửi duyệt',
    });
    await waitFor(() => expect(nutGui.hasAttribute('disabled')).toBe(false));
    fireEvent.click(nutGui);

    await waitFor(() => {
      const goi = f.mock.calls.find((c) => String(c[0]).includes('/actions/SUBMIT'));
      expect(goi, 'chưa gọi SUBMIT').toBeDefined();
      const than = JSON.parse(String((goi![1] as { body?: string })?.body ?? '{}'));
      expect(than.mauHoSoId).toBe(MAU[1]!.id);
    });
  });

  it('`0130` hộp GỬI DUYỆT ở BẬC THƯỜNG như mọi hộp hành động khác', async () => {
    /*
     * `0129` cho bước gửi duyệt bậc `to` vì nó nhúng cả một tờ CSBH; khách hàng
     * xem xong chốt 27/08 đưa về bậc thường. Ca này canh CHIỀU ĐẢO NGƯỢC ấy.
     *
     * Đáng canh vì suy luận sai nghe rất hợp lý và sẽ quay lại: bề rộng hộp KHÔNG
     * quyết định tờ CSBH to hay nhỏ — `.khung-pdf` khoá theo tỷ lệ tờ giấy và
     * chặn bằng chiều cao, nên nới hộp ra chỉ thêm nền xám hai bên.
     *
     * Kiểm CẢ HAI hộp: bước gửi duyệt (có bản mềm) và bước ký (không có). Chúng
     * phải giống nhau, và đó chính là điều `0130` chốt.
     */
    localStorage.setItem('csbh:phien', JSON.stringify(TDV));
    await mo({ ...HO_SO, status: 'NHAP', mauHoSoId: null }, ['SUBMIT']);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    await screen.findByLabelText(/Văn bản mẫu/);
    expect(document.querySelector('.hop-thoai')).not.toBeNull();
    expect(document.querySelector('.hop-thoai-to'), 'hộp gửi duyệt đã về bậc thường').toBeNull();
    expect(document.querySelector('.hop-thoai-rong')).toBeNull();

    // Vai trò phải trở về TBP: `canHanhDong` giấu nút ký của một phiên TDV, và
    // hộp không mở ra thì ca này xanh vì không tìm thấy gì, không vì đúng.
    cleanup();
    localStorage.setItem('csbh:phien', JSON.stringify(TBP));
    await mo(HO_SO, ['TBP_SIGN']);
    fireEvent.click(screen.getByRole('button', { name: 'Ký số duyệt' }));
    await screen.findByRole('button', { name: /^Xác nhận/ });
    expect(document.querySelector('.hop-thoai')).not.toBeNull();
    expect(document.querySelector('.hop-thoai-to')).toBeNull();
  });

  it('`0129`·`0140` hộp XEM TRƯỚC mang khổ giấy của mẫu đang chọn', async () => {
    /*
     * Tỷ lệ giờ nằm trên chính HỘP THOẠI, không trên khung.
     *
     * `0140` đưa bản xem trước sang một hộp riêng dùng `tyLe` → `.hop-thoai-xem`,
     * nơi bề rộng hộp suy ra từ `--cao-khung × --ty-le` (`0073`), và khung bên
     * trong đọc lại chính hai biến ấy. Đặt tỷ lệ lên khung như bản `0129` giờ là
     * đặt sai chỗ: hộp mang một hình, khung mang một hình khác.
     *
     * Sai thì KHÔNG có gì đỏ lên — mẫu A4 ngang chỉ hiện trong một hộp dọc và tờ
     * giấy co lại còn một nửa.
     */
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    localStorage.setItem('csbh:phien', JSON.stringify(TDV));
    await mo({ ...HO_SO, status: 'NHAP', mauHoSoId: null }, ['SUBMIT']);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    fireEvent.change(await screen.findByLabelText(/Văn bản mẫu/), { target: { value: MAU[1]!.id } });
    for (const nhan of [/Trưởng bộ phận/, /Kế toán/]) {
      const o = screen.queryByLabelText(nhan);
      if (o) fireEvent.change(o, { target: { value: 'nguoi-1' } });
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục' }));

    const hop = await waitFor(() => {
      const e = document.querySelector<HTMLElement>('.hop-thoai-xem');
      expect(e, 'bước hai phải dùng cỡ hộp XEM TRƯỚC').not.toBeNull();
      return e!;
    });
    // Mẫu A4 NGANG — rộng hơn cao.
    expect(Number(hop.style.getPropertyValue('--ty-le'))).toBeCloseTo(TY_LE_KHO.a4l, 5);
    expect(document.querySelector('.khung-xem'), 'khung phải là `.khung-xem`').not.toBeNull();
    // Và KHÔNG còn khung `.khung-pdf` của bản cũ nằm lẫn trong hộp.
    expect(document.querySelector('.khung-pdf')).toBeNull();
  });

  /* ---------------------------------------------------------------------
   * `0140` — GỬI DUYỆT TÁCH LÀM HAI BƯỚC
   * ------------------------------------------------------------------- */

  /** Đưa hộp gửi duyệt tới cuối bước một: đã chọn mẫu và đủ người. */
  const denCuoiBuocMot = async (mau = MAU[1]!.id) => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    localStorage.setItem('csbh:phien', JSON.stringify(TDV));
    const f = await mo({ ...HO_SO, status: 'NHAP', mauHoSoId: null }, ['SUBMIT']);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    fireEvent.change(await screen.findByLabelText(/Văn bản mẫu/), { target: { value: mau } });
    for (const nhan of [/Trưởng bộ phận/, /Kế toán/]) {
      const o = screen.queryByLabelText(nhan);
      if (o) fireEvent.change(o, { target: { value: 'nguoi-1' } });
    }
    return f;
  };

  it('BƯỚC MỘT không có bản xem trước nào — đó là cả điểm của lượt tách', async () => {
    /*
     * Tới `0139` khung PDF nằm kẹp giữa ô chọn mẫu và hai ô chọn người, cao
     * `min(52dvh, 560px)`. Nó ở lại thì bước một dài gấp đôi mà tờ giấy vẫn
     * không đọc nổi — hai cái hỏng cùng lúc.
     */
    await denCuoiBuocMot();
    expect(document.querySelector('.khung-pdf'), 'bước một không được có khung PDF').toBeNull();
    expect(document.querySelector('.khung-xem')).toBeNull();
    expect(document.querySelector('.hop-thoai-xem')).toBeNull();
  });

  it('*Tiếp tục* KHÔNG gửi gì cả', async () => {
    /*
     * Ca đáng giá nhất của lượt này. Nút bước một đổi từ *Xác nhận* sang *Tiếp
     * tục* và đổi luôn việc nó làm; đấu nhầm nó vào `gui` thì hồ sơ đi ngay lúc
     * người dùng tưởng mình vừa bấm để XEM — không lùi lại được, vì gửi duyệt
     * đóng băng giá và ngưỡng.
     */
    const f = await denCuoiBuocMot();
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục' }));

    await screen.findByRole('button', { name: 'Quay lại' });
    expect(f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/actions/'))).toEqual([]);
  });

  it('BƯỚC HAI dùng cỡ hộp XEM TRƯỚC, không phải cỡ hộp thường', async () => {
    // Yêu cầu nói thẳng: *"kích thước hộp thư như preview bản mềm"*. Cỡ ấy là
    // `.hop-thoai-xem` — bề rộng suy từ chiều cao khung nhân tỷ lệ tờ giấy.
    await denCuoiBuocMot();
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục' }));

    await waitFor(() => expect(document.querySelector('.hop-thoai-xem')).not.toBeNull());
    expect(document.querySelector('.khung-xem')).not.toBeNull();
    expect(document.querySelector('.hop-thoai-to'), 'không phải bậc `to`').toBeNull();
  });

  it('*Quay lại* về bước một và GIỮ nguyên mẫu đã chọn', async () => {
    /*
     * Người dùng tới bước hai để ĐỌC, và thứ họ hay muốn sau khi đọc là đổi mẫu
     * — nên đường về phải giữ nguyên những gì đã chọn. Dựng lại hộp từ đầu là
     * bắt họ chọn lại ba ô để sửa một ô.
     */
    await denCuoiBuocMot(MAU[0]!.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Quay lại' }));

    const oMau = await screen.findByLabelText(/Văn bản mẫu/);
    expect((oMau as HTMLSelectElement).value).toBe(MAU[0]!.id);
    expect(screen.getByRole('button', { name: 'Tiếp tục' }).hasAttribute('disabled')).toBe(false);
  });

  it('hành động KHÔNG có xem trước vẫn là MỘT bước', async () => {
    /*
     * Chiều đối chiếu. Cho mọi hành động hai bước thì Trưởng bộ phận bấm *Ký số
     * duyệt* xong phải bấm thêm một nút nữa để làm đúng việc vừa bấm.
     */
    localStorage.setItem('csbh:phien', JSON.stringify(TBP));
    await mo(HO_SO, ['TBP_SIGN']);
    fireEvent.click(screen.getByRole('button', { name: 'Ký số duyệt' }));

    const hop = await screen.findByRole('dialog');
    expect(within(hop).getByRole('button', { name: /^Xác nhận/ })).toBeDefined();
    expect(within(hop).queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
  });

  it('hồ sơ ĐÃ GẮN MẪU: hộp xem bản mềm KHÔNG hỏi mẫu nào nữa', async () => {
    /*
     * Đây là câu yêu cầu nói thẳng: sau khi TDV gửi duyệt thì mọi vai trò khác
     * chỉ XEM, không chọn. Trưởng bộ phận mở bản mềm ra phải thấy ngay nội dung,
     * không thấy một danh sách mẫu để bấm.
     */
    const f = await mo({ ...HO_SO, status: 'CHO_TBP_DUYET', mauHoSoId: MAU[0]!.id });
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));

    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0]));
      // Không hỏi danh sách mẫu, và đường xem KHÔNG mang `mauId` — máy chủ đọc
      // mẫu từ chính hồ sơ, và nó từ chối một `mauId` khác (`TEMPLATE_LOCKED`).
      expect(d.some((x) => x.includes('/policy-templates/available'))).toBe(false);
      expect(d.some((x) => x.includes('/render') && x.includes('mauId='))).toBe(false);
    });
    expect(screen.queryByRole('button', { name: /Mẫu A4 dọc/ })).toBeNull();
  });
});
