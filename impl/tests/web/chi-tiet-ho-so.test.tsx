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

/**
 * Phiên Sale Admin (`0163`).
 *
 * Từ `0163` *Xem bản mềm* chỉ của Sale Admin, nên mọi ca về bản mềm phải đăng
 * nhập bằng vai trò này. Tệp mặc định là TBP vì phần lớn ca ở đây nói về màn
 * hình của người DUYỆT — đổi mặc định là kéo theo hàng chục ca chẳng liên quan.
 */
const SA = {
  ...TBP,
  user: {
    ...TBP.user,
    id: '44444444-4444-4444-4444-444444444444',
    username: 'sa01',
    fullName: 'Le Van Sa',
    role: 'SALE_ADMIN',
  },
};

const laSa = () => localStorage.setItem('csbh:phien', JSON.stringify(SA));

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
const chan = (
  hoSo: unknown = HO_SO,
  choPhep: string[] = ['TBP_SIGN', 'TBP_RETURN'],
  /** Hồ sơ pháp lý của KHÁCH HÀNG — khối mới ở `0162`. */
  giayToKhach: unknown[] = [],
) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/auth/me')) return Promise.resolve(toiLaAi());
    // Đặt TRƯỚC `/files`: đường này là `/customers/:id/documents`, và khối
    // `HoSoPhapLy` gọi nó ngay khi trang dựng lên.
    if (d.includes('/documents')) return Promise.resolve(json(giayToKhach));
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

const mo = async (hoSo: unknown = HO_SO, choPhep?: string[], giayToKhach?: unknown[]) => {
  const f = chan(hoSo, choPhep, giayToKhach);
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
    // `0139` — nhãn mang cả SỐ lẫn TÊN THẬT của loại khách hàng.
    expect(oCua('Loại')).toBe('Loại 2 - Hộ kinh doanh cộng tác');
    /*
     * `0138` — công nợ thôi là số tiền, nó là ĐIỀU KHOẢN thanh toán, và máy chủ
     * gửi xuống câu chữ đã dựng xong. Ô này in nguyên câu ấy: không `tien()`,
     * không hậu tố ` đ`.
     *
     * Nhãn đổi lại thành *Công nợ* ở `0146` — đó là chữ khách hàng dùng, và cái
     * `0138` đổi là NỘI DUNG của ô, không phải tên gọi của nó. Nhãn *Điều khoản
     * thanh toán* mô tả đúng thứ đang hiện, nhưng nó là chữ của người viết phần
     * mềm chứ không phải chữ của người đọc màn hình.
     */
    expect(oCua('Công nợ')).toBe('Thanh toán gối đơn, công nợ không quá 90 ngày');
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

  it('`0163` vai trò không làm được gì thì nhóm nút RỖNG — trừ Sale Admin', async () => {
    /*
     * Ca này đảo chiều LẦN THỨ HAI.
     *
     * Bản gốc khẳng định nhóm nút biến mất khi vai trò không thao tác được gì.
     * `0054` đảo lại: nhóm luôn còn *Xem bản mềm*, vốn không phải thao tác ghi,
     * nên nó không bao giờ rỗng. `0163` đảo về: nút ấy chỉ còn của Sale Admin,
     * nên với năm vai trò kia nhóm rỗng lại như trước.
     *
     * Điều KHÔNG đổi qua cả ba lượt, và là điều ca này thật sự canh: **không có
     * nút ghi nào lọt vào** khi máy chủ nói không hành động nào cho phép.
     */
    await mo(HO_SO, []);
    const dau = document.querySelector('.nhom-nut-dau');
    expect(dau, 'khối vẫn phải dựng, chỉ là không có nút nào bên trong').not.toBeNull();
    expect([...dau!.querySelectorAll('button')].map((b) => b.textContent)).toEqual([]);

    // Chiều đối chiếu: cùng hồ sơ, cùng danh sách hành động rỗng, đổi mỗi vai
    // trò. Không có vế này thì gỡ hẳn nút khỏi mã nguồn vẫn xanh.
    cleanup();
    laSa();
    await mo(HO_SO, []);
    expect(
      [...document.querySelector('.nhom-nut-dau')!.querySelectorAll('button')].map(
        (b) => b.textContent,
      ),
    ).toEqual(['Xem bản mềm']);
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
    laSa();
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

  /**
   * Chọn một mẫu ở BƯỚC MỘT rồi bấm *Xem* (`0145`).
   *
   * Gộp vào một hàm vì bốn ca dưới đây đều phải đi qua đúng hai lượt bấm ấy, và
   * `0145` vừa cho thấy cái giá của việc chép tay: bước một đổi từ danh sách nút
   * sang ô chọn thì năm ca đỏ cùng lúc ở năm chỗ giống hệt nhau.
   */
  const chonMauRoiXem = async (ten: RegExp | string) => {
    const o = (await screen.findByLabelText(/Văn bản mẫu/)) as HTMLSelectElement;
    const dong = [...o.options].find((x) => new RegExp(ten).test(x.textContent ?? ''));
    expect(dong, `không thấy mẫu ${String(ten)} trong ô chọn`).toBeDefined();
    fireEvent.change(o, { target: { value: dong!.value } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
  };

  it('`0067` HỎI MẪU TRƯỚC, chưa tải nội dung gì cả', async () => {
    /*
     * `0058` mở sẵn mẫu đầu danh sách. Khách hàng chốt lại ngày 20/08: bắt chọn
     * mẫu trước — và lý do đứng về phía họ. Từ `0067` mỗi mẫu có TẬP CỘT riêng,
     * nên hai mẫu của cùng một hồ sơ ra hai bản giấy khác hẳn nhau. Mở sẵn một
     * cái nghĩa là phần lớn người dùng không bao giờ biết cái kia tồn tại.
     */
    laSa();
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    // `0145` — một Ô CHỌN mang đủ hai mẫu, không phải một nút cho mỗi mẫu.
    const o = (await screen.findByLabelText(/Văn bản mẫu/)) as HTMLSelectElement;
    expect([...o.options].some((x) => /Mẫu A4 dọc/.test(x.textContent ?? ''))).toBe(true);
    expect([...o.options].some((x) => /Mẫu A4 ngang/.test(x.textContent ?? ''))).toBe(true);
    // Ô mở ra RỖNG, và nút *Xem* khoá theo — luật `0067` nằm ở chính hai dòng này.
    expect(o.value).toBe('');
    expect((screen.getByRole('button', { name: 'Xem' }) as HTMLButtonElement).disabled).toBe(true);
    // CHƯA gọi máy chủ dựng bản mềm lần nào.
    expect(f.mock.calls.map((c) => String(c[0])).some((d) => d.includes('/render'))).toBe(false);
  });

  it('`0067` chọn mẫu rồi mới tải, và đường tải mang đúng mẫu vừa chọn', async () => {
    laSa();
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    await chonMauRoiXem(/Mẫu A4 ngang/);

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
    laSa();
    await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    await chonMauRoiXem(/Mẫu A4 dọc/);
    const o = (await screen.findByLabelText('Mẫu')) as HTMLSelectElement;
    expect([...o.options].map((x) => x.textContent)).toEqual([
      'Mẫu A4 dọc · A4 dọc',
      'Mẫu A4 ngang · A4 ngang',
    ]);
  });

  it('`0058` đổi mẫu thì tải lại theo ĐÚNG mẫu vừa chọn', async () => {
    laSa();
    const f = await mo();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));
    await chonMauRoiXem(/Mẫu A4 dọc/);
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
      if (d.includes('/documents')) return Promise.resolve(json([]));
      if (d.includes('/files')) return Promise.resolve(json([]));
      if (d.includes('/available')) return Promise.resolve(json([]));
      return Promise.resolve(json(HO_SO));
    });
    vi.stubGlobal('fetch', f);
    laSa();
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

  it('`0163` BỐN vai trò kia mất nút *Xem bản mềm*, Ban lãnh đạo mất luôn nút cuối', async () => {
    /*
     * `0054` khẳng định điều ngược lại — Ban lãnh đạo không thao tác được gì
     * nhưng VẪN xem được bản mềm. Khách hàng chốt 29/08 rằng bản mềm là thao tác
     * IN của Sale Admin, không phải văn bản đi qua luồng duyệt; được hỏi lại
     * riêng về Ban lãnh đạo, họ chốt đúng chữ *"chỉ giữ ở SA"*.
     *
     * Cái giá, ghi ra để không ai phải đoán: với Ban lãnh đạo đó là nút DUY NHẤT
     * trên trang này, nên dải thao tác của họ giờ rỗng hẳn. Người duyệt đọc hồ
     * sơ ở BẢNG dữ liệu ngay trên màn hình — vốn đã mang đủ mười ba mục của
     * muc 11.1 — chứ không ở tờ giấy dựng ra.
     */
    for (const v of ['TDV', 'TBP', 'KE_TOAN', 'BAN_LANH_DAO']) {
      cleanup();
      localStorage.setItem(
        'csbh:phien',
        JSON.stringify({ ...TBP, user: { ...TBP.user, role: v, username: 'x01' } }),
      );
      await mo(HO_SO, []);
      expect(nut('Xem bản mềm'), `${v} không được thấy nút bản mềm`).toBeNull();
    }

    // Chiều đối chiếu, cùng hồ sơ cùng danh sách hành động rỗng.
    cleanup();
    laSa();
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
    await chonMauRoiXem(/Mẫu A4 dọc/);
    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('contract.pdf'));
      expect(d.length).toBeGreaterThan(0);
      // MỘT đường cho cả xem lẫn tải (`0059`) — hợp đồng không ghi lịch sử nữa.
      expect(d.every((x) => !x.includes('xem=1'))).toBe(true);
      expect(d.every((x) => x.includes('mauId='))).toBe(true);
    });
  });
});

describe('`0163` gửi duyệt KHÔNG chọn mẫu, và bản mềm luôn hỏi mẫu', () => {
  /*
   * Chặng này gỡ cả một cơ chế, nên nó gỡ theo mười ba ca của `0098` và `0140`.
   * Chúng khẳng định đúng thứ vừa bị bỏ — ô chọn mẫu trong hộp gửi duyệt, bản
   * xem trước ở bước hai, `mauHoSoId` trong thân `SUBMIT` — nên giữ lại là giữ
   * một bản mô tả sai về phần mềm.
   *
   * Bốn ca dưới đây là phần CÒN ĐÚNG của mười ba ca ấy, viết lại theo chiều
   * ngược: mỗi ca canh đúng chỗ mà cơ chế cũ sẽ quay lại nếu ai đó dựng lại nó
   * mà không đọc `0111_bo_dong_bang_mau_ho_so.sql`.
   */
  const TDV = {
    ...TBP,
    user: { ...TBP.user, id: '11111111-1111-1111-1111-111111111111', username: 'tdv01', role: 'TDV' },
  };

  const moGuiDuyet = async () => {
    localStorage.setItem('csbh:phien', JSON.stringify(TDV));
    const f = await mo({ ...HO_SO, status: 'NHAP' }, ['SUBMIT']);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    await screen.findByRole('dialog');
    return f;
  };

  it('hộp GỬI DUYỆT không còn ô chọn mẫu, và KHÔNG dựng bản mềm nào', async () => {
    /*
     * Hai vế, và vế thứ hai mới là vế đắt: ô chọn biến mất mà lượt gọi `/render`
     * ở lại thì mỗi lần TDV mở hộp gửi duyệt là một lượt dựng PDF ở máy chủ cho
     * một tờ giấy không ai nhìn — và từ `0163` TDV còn nhận 403 ở đường ấy, nên
     * hộp mở ra kèm một khối đỏ.
     */
    const f = await moGuiDuyet();
    expect(screen.queryByLabelText(/Văn bản mẫu/)).toBeNull();
    expect(f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'))).toEqual([]);
    expect(
      f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/policy-templates')),
    ).toEqual([]);
  });

  it('gửi duyệt là MỘT bước — không còn *Tiếp tục* lẫn *Quay lại*', async () => {
    /*
     * `0140` tách lượt gửi duyệt làm hai bước vì bước hai là chỗ ĐỌC bản mềm sắp
     * gửi. Không còn bản mềm ở đây thì bước hai là một cú bấm thừa.
     *
     * Tìm TRONG hộp thoại: nút *Gửi duyệt* của dải thao tác phía sau vẫn còn đó
     * với đúng cái tên ấy, và `getByRole` toàn trang sẽ báo "tìm thấy hai phần
     * tử" — một câu lỗi đúng nhưng dễ đọc nhầm thành lỗi của mã sản phẩm.
     */
    await moGuiDuyet();
    const hop = await screen.findByRole('dialog');
    expect(within(hop).queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
    expect(within(hop).queryByRole('button', { name: 'Quay lại' })).toBeNull();
    expect(within(hop).getByRole('button', { name: /^Xác nhận/ })).toBeDefined();
  });

  it('thân yêu cầu SUBMIT không mang `mauHoSoId` nữa', async () => {
    /*
     * Máy chủ bỏ qua khoá lạ (`validate` không từ chối), nên gửi thừa trường này
     * KHÔNG có gì đỏ lên — nó chỉ là một lời nói dối lặng lẽ về thứ hồ sơ mang
     * theo. Đó là lý do ca này soi THÂN yêu cầu chứ không soi mã trả về.
     */
    const f = await moGuiDuyet();
    for (const nhan of [/Trưởng bộ phận/, /Kế toán/]) {
      const o = screen.queryByLabelText(nhan);
      if (o) fireEvent.change(o, { target: { value: 'nguoi-1' } });
    }
    const hop = await screen.findByRole('dialog');
    fireEvent.click(within(hop).getByRole('button', { name: /^Xác nhận/ }));

    await waitFor(() => {
      const goi = f.mock.calls.find((c) => String(c[0]).includes('/actions/SUBMIT'));
      expect(goi, 'chưa gọi SUBMIT').toBeDefined();
      const than = JSON.parse(String((goi![1] as { body?: string })?.body ?? '{}'));
      expect(Object.keys(than)).not.toContain('mauHoSoId');
    });
  });

  it('`0130` hộp GỬI DUYỆT vẫn ở BẬC THƯỜNG như mọi hộp hành động khác', async () => {
    /*
     * `0129` cho bước gửi duyệt bậc `to` vì nó nhúng cả một tờ CSBH; khách hàng
     * xem xong chốt 27/08 đưa về bậc thường. Bản mềm rời khỏi hộp này hẳn ở
     * `0163`, nên lý do duy nhất để nới nó ra cũng mất — ca canh chiều ấy ở lại.
     */
    await moGuiDuyet();
    expect(document.querySelector('.hop-thoai')).not.toBeNull();
    expect(document.querySelector('.hop-thoai-to'), 'hộp gửi duyệt ở bậc thường').toBeNull();
    expect(document.querySelector('.hop-thoai-rong')).toBeNull();
    expect(document.querySelector('.hop-thoai-xem'), 'không còn hộp xem trước nào').toBeNull();
    expect(document.querySelector('.khung-pdf')).toBeNull();
    expect(document.querySelector('.khung-xem')).toBeNull();
  });

  it('hồ sơ ĐÃ DUYỆT XONG: Sale Admin vẫn phải CHỌN mẫu mỗi lượt in', async () => {
    /*
     * Đây là câu đảo ngược thẳng `0098`. Tới `0162` hồ sơ đã gửi duyệt mang sẵn
     * mẫu của nó, nên hộp xem bản mềm mở ra là thấy ngay nội dung. Từ `0163`
     * không có "mẫu của hồ sơ" nữa: mẫu là tham số của lượt IN, nên ô chọn phải
     * hiện lại ở MỌI trạng thái, kể cả hồ sơ đã có hiệu lực.
     *
     * Và nó mở ra RỖNG (luật `0067`): hai mẫu cho hai tập cột khác nhau, chọn
     * sẵn một cái nghĩa là phần lớn người dùng không biết cái kia tồn tại.
     */
    laSa();
    const f = await mo({ ...HO_SO, status: 'HIEU_LUC' }, []);
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản mềm' }));

    const o = (await screen.findByLabelText(/Văn bản mẫu/)) as HTMLSelectElement;
    expect(o.value, 'ô chọn mở ra rỗng').toBe('');
    expect(f.mock.calls.map((c) => String(c[0])).some((x) => x.includes('/available'))).toBe(true);
    expect(f.mock.calls.map((c) => String(c[0])).some((x) => x.includes('/render'))).toBe(false);

    // Chọn rồi mới dựng, và dựng bằng đúng mẫu vừa chọn.
    fireEvent.change(o, { target: { value: MAU[1]!.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    await waitFor(() => {
      const d = f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/render'));
      expect(d.length).toBeGreaterThan(0);
      expect(d.every((x) => x.includes(`mauId=${MAU[1]!.id}`))).toBe(true);
    });
  });

  it('hành động nào cũng MỘT bước — chiều đối chiếu ở bước ký', async () => {
    /*
     * Cho mọi hành động hai bước thì Trưởng bộ phận bấm *Ký số duyệt* xong phải
     * bấm thêm một nút nữa để làm đúng việc vừa bấm. Ca này có từ `0140` và ở
     * lại nguyên vẹn: nó không nói gì về mẫu.
     */
    localStorage.setItem('csbh:phien', JSON.stringify(TBP));
    await mo(HO_SO, ['TBP_SIGN']);
    fireEvent.click(screen.getByRole('button', { name: 'Ký số duyệt' }));

    const hop = await screen.findByRole('dialog');
    expect(within(hop).getByRole('button', { name: /^Xác nhận/ })).toBeDefined();
    expect(within(hop).queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
  });
});


describe('`0160` nút Bàn giao xám khi hồ sơ chưa có bản scan', () => {
  /*
   * Chốt thật nằm ở máy chủ (`SCAN_REQUIRED`, 409) và có từ lâu. Cái thiếu là
   * nửa kia: nút vẫn sáng, Sale Admin bấm, rồi mới biết mình còn thiếu việc.
   *
   * Ba ca dưới đây canh ba chuyện khác nhau, và bỏ ca nào cũng để lọt một cách
   * hỏng riêng.
   */
  const nutBanGiao = () => screen.getByRole('button', { name: 'Bàn giao' });

  /*
   * Đăng nhập bằng SALE ADMIN, không dùng `TBP` mặc định của tệp này.
   *
   * `thaoTac` lọc `allowed-actions` qua `canHanhDong(vaiTro, …)`, nên trả về
   * `SA_HANDOVER` cho một Trưởng bộ phận thì nút không bao giờ vẽ ra — ca kiểm
   * sẽ đỏ vì "không tìm thấy nút", một câu chẳng nói gì về cái đang kiểm.
   */
  const dangNhapSa = () =>
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({ ...TBP, user: { ...TBP.user, role: 'SALE_ADMIN', username: 'sa01' } }),
    );

  it('cờ TẮT → nút có mặt nhưng không bấm được', async () => {
    dangNhapSa();
    await mo({ ...HO_SO, banGiaoDuoc: false }, ['SA_HANDOVER']);
    expect(nutBanGiao().hasAttribute('disabled'), 'phải xám').toBe(true);
  });

  it('và màn hình NÓI RA vì sao, không để một nút xám câm', async () => {
    /*
     * `title` một mình không đủ: trình đọc màn hình không đọc nó trên một nút
     * `disabled`, và cảm ứng thì không có thao tác rê chuột. Ca này đòi một dòng
     * chữ THẬT trên màn hình.
     */
    dangNhapSa();
    await mo({ ...HO_SO, banGiaoDuoc: false }, ['SA_HANDOVER']);
    expect(screen.getByText(/chưa có bản scan/i)).toBeDefined();
  });

  it('cờ BẬT → nút bấm được, và không còn dòng nhắc nào', async () => {
    /*
     * Chiều dương. Thiếu ca này thì một bản sửa xám nút VĨNH VIỄN vẫn xanh —
     * và Sale Admin không bao giờ bàn giao được hồ sơ nào.
     */
    dangNhapSa();
    await mo({ ...HO_SO, banGiaoDuoc: true }, ['SA_HANDOVER']);
    expect(nutBanGiao().hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/chưa có bản scan/i)).toBeNull();
  });

  it('KHÔNG đụng tới nút khác trong cùng dải — chỉ Bàn giao bị cờ này chạm', async () => {
    /*
     * Đọc nhầm cờ thành "xám mọi nút" là khoá cả màn hình, và ba ca trên không
     * thấy vì chúng chỉ dựng đúng một nút.
     *
     * So với *Xuất hợp đồng* chứ không với một hành động thứ hai của luồng: Sale
     * Admin chỉ có ĐÚNG MỘT hành động (`banGiao`), nên không có nút cùng loại
     * nào để đặt cạnh. *Xuất hợp đồng* nằm cùng dải, cũng của họ, và đi qua một
     * đường điều kiện khác hẳn — đúng thứ cần để bắt một bản sửa xám cả dải.
     */
    dangNhapSa();
    await mo({ ...HO_SO, banGiaoDuoc: false, xuatHopDongDuoc: true }, ['SA_HANDOVER']);
    expect(nutBanGiao().hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Xuất hợp đồng' }).hasAttribute('disabled'),
      'nút khác trong cùng dải phải không bị chạm',
    ).toBe(false);
  });
});

describe('`0162` hồ sơ pháp lý của khách hàng hiện ngay trên trang hồ sơ CSBH', () => {
  const GIAY_TO = [
    {
      id: 'gt-1',
      kind: 'GIAY_PHEP_KINH_DOANH',
      fileName: 'giay-phep.pdf',
      objectKey: 'phap_ly/gp.pdf',
      sizeBytes: '2048',
      uploadedAt: '2026-07-01T03:00:00.000Z',
    },
  ];

  it('hiện đủ tệp của khách, không phải bấm sang trang khách hàng', async () => {
    await mo(HO_SO, undefined, GIAY_TO);
    await waitFor(() => expect(screen.getByText('giay-phep.pdf')).toBeDefined());
  });

  it('gọi đúng khách hàng của HỒ SƠ NÀY', async () => {
    /*
     * Ca này canh một cách hỏng im lặng: truyền nhầm `hoSo.id` thay cho
     * `hoSo.customerId`. Hai giá trị đều là uuid, khối vẫn dựng, lời gọi vẫn
     * 200 — chỉ là nó hỏi về một khách hàng không tồn tại và trả danh sách
     * rỗng. Trên màn hình đọc ra là *"khách này chưa có giấy tờ nào"*.
     */
    const f = await mo(HO_SO, undefined, GIAY_TO);
    const duong = f.mock.calls.map((c) => String(c[0]));
    expect(duong.some((d) => d.includes(`/customers/${HO_SO.customerId}/documents`))).toBe(true);
  });

  it('nhãn nói rõ đây là giấy tờ CỦA KHÁCH HÀNG', async () => {
    // Trang này đã có hai mục tệp khác — *Giấy tờ hồ sơ* và *Bản cứng*. Một mục
    // thứ ba tên trùng nghĩa là ba cái tên người dùng đọc nhầm.
    await mo(HO_SO, undefined, GIAY_TO);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Hồ sơ pháp lý của khách hàng/ })).toBeDefined(),
    );
  });

  it('CHỈ ĐỌC — không có vùng tải lên nào ở trang hồ sơ', async () => {
    /*
     * Chiều đối chiếu, và nó canh đúng chỗ dễ nới tay nhất: bật `choPhepGhi`
     * cho TDV phụ trách "cho tiện". Trang này là chỗ đọc hồ sơ CSBH; sửa giấy tờ
     * khách hàng có đủ ngữ cảnh ở trang khách hàng, không phải ở đây.
     */
    await mo(HO_SO, undefined, GIAY_TO);
    await waitFor(() => expect(screen.getByText('giay-phep.pdf')).toBeDefined());
    /*
     * Tìm đúng CHỮ mà `VungTaiLen` dựng ra khi `choPhepGhi` bật — *Thêm giấy
     * tờ*. Bản đầu của ca này đoán một cái tên khác (*Tải lên*), nên nó xanh cả
     * khi phá lại: một ca kiểm mô tả hình dạng tưởng tượng thay vì hành vi thật.
     * Bắt được đúng lúc phá lại, không phải lúc viết.
     */
    expect(screen.queryByText(/Thêm giấy tờ/)).toBeNull();
  });
});
