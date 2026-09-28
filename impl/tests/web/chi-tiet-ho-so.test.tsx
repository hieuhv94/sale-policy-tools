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
import { readFileSync } from 'node:fs';
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
  effectiveFrom: null,
  lastReason: null,
  nguoiDeNghi: { ten: 'Nguyen Van Tdv' },
  khachHang: {
    ma: 'KH-000123',
    ten: 'Cong ty TNHH Duoc pham ABC',
    // `0177` — năm trường của khối *Khách hàng* trên trang hồ sơ.
    nguoiDaiDien: 'Nguyen Thi Dai Dien',
    // `0228` — chức danh người đại diện; rỗng ở fixture mặc định để ô ghi dấu gạch.
    chucDanh: null,
    soNha: 'Số 12 ngõ 5, Phường Láng Hạ',
    /*
     * GIỮ NGUYÊN lối viết CŨ, có chủ ý (`0205`).
     *
     * `0205` thu ô nhập về 63 tên ngắn, nên khách hàng lập từ nay không mang
     * chuỗi này. Nhưng đây là ẢNH CHỤP của một hồ sơ đã gửi (`0177`) — nó giữ
     * câu chữ lúc gửi và không ai viết lại nó — nên trang hồ sơ phải bày ra
     * được. Đừng "dọn cho đồng bộ": đổi nó là mất chỗ duy nhất canh chuyện ấy.
     */
    tinhThanh: 'Thành phố Hà Nội',
    diaChiDangKy: 'Số 12 ngõ 5, Phường Láng Hạ, Thành phố Hà Nội',
    noiNhanHang: ['Kho 1, KCN Bắc Thăng Long', 'Số 8 Trần Duy Hưng'],
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

/**
 * Ba mẫu đang dùng — đủ để ô chọn hiện ra (`0058`), và đủ để phép LỌC của `0167`
 * có gì mà lọc.
 *
 * Ô chọn lúc XEM trộn chung hai loại hồ sơ (`0165`); hộp TẠO BẢN MỀM chỉ nhận
 * mẫu ĐẦY ĐỦ. Không có mẫu rút gọn ở đây thì ca kiểm phép lọc xanh vì danh sách
 * vốn không có gì để loại — một ca xanh không nói lên điều gì.
 */
const MAU = [
  { id: '00000000-0000-4000-8000-000000000001', ten: 'Mẫu A4 dọc', khoGiay: 'a4p', loai: 'HO_SO' },
  { id: '00000000-0000-4000-8000-000000000002', ten: 'Mẫu A4 ngang', khoGiay: 'a4l', loai: 'HO_SO' },
  {
    id: '00000000-0000-4000-8000-000000000003',
    ten: 'Mẫu rút gọn',
    khoGiay: 'a4l',
    loai: 'HO_SO_RUT_GON',
  },
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

/**
 * Khối thông tin ở đầu trang — MỘT khối kể từ `0206`.
 *
 * Đòi đúng MỘT: trước `0206` có hai thẻ, nên một phép `querySelector` lấy cái
 * đầu tiên sẽ xanh cả khi lượt gộp mới làm được nửa việc.
 */
const khoiChung = (): HTMLElement => {
  const ds = [...document.querySelectorAll('.tom-tat-nhom')];
  expect(ds.length, 'đầu trang phải có đúng MỘT khối thông tin').toBe(1);
  expect(ds[0]!.querySelector('h2')?.textContent).toBe('Thông tin chung');
  return ds[0] as HTMLElement;
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

/**
 * `0228` — MƯỜI BỐN Ô, VỊ TRÍ CỐ ĐỊNH, bảy hàng đôi (khách hàng 29/09: *"mã KH lúc
 * bên trái lúc bên phải"*). Tới `0227` dãy này có 11 ô ở fixture mặc định và
 * DÀI NGẮN theo từng hồ sơ; từ `0228` nó là MỘT dãy cho mọi hồ sơ — ca ngay dưới
 * đòi đúng điều ấy qua các hình dạng dữ liệu khác nhau.
 */
const DAY_NHAN = [
  'Phiên bản',
  'Ngày soạn thảo',
  'Người đề nghị',
  'Có hiệu lực',
  'Mã khách hàng',
  'Loại khách hàng',
  'Người đại diện',
  'Chức danh người đại diện',
  'Tên Hộ kinh doanh/Tên Công ty',
  'Trạng thái khách hàng',
  'Số nhà, Phường xã',
  'Tỉnh/Thành phố',
  'Địa chỉ giao hàng',
  'Công nợ',
];

describe('`0061` thông tin hồ sơ tách dòng, mỗi thứ một nhãn', () => {
  it('mỗi thứ một nhãn riêng, không dồn lên một dòng chữ xám', async () => {
    /*
     * Tới `0060` cả khối này là MỘT dòng: "Phiên bản 2 · Ngày áp dụng … · Có
     * hiệu lực …". Ba con số ngày tháng nối nhau bằng dấu chấm giữa dòng thì mắt
     * phải đọc cả câu mới tách được cái mình cần.
     */
    await mo();
    expect(oCua('Phiên bản')).toBe('2');
    expect(oCua('Ngày soạn thảo')).toBe('28/07/2026');
    expect(oCua('Người đề nghị')).toBe('Nguyen Van Tdv');
  });

  it('`0180` khối hồ sơ KHÔNG còn ô *Ngày áp dụng* — ngày là của từng dòng', async () => {
    /*
     * Ca này canh một thứ ĐÃ BỎ, và nó đáng có mặt vì cái bỏ đi rất dễ quay lại:
     * một ô tên *Ngày áp dụng* ở khối đầu trang trông hoàn toàn hợp lý, và người
     * sửa sau sẽ điền vào đó ngày sớm nhất của các dòng. Đúng lúc ấy tờ giấy nói
     * một câu sai về mọi dòng có ngày khác — chính điều khách hàng chốt 07/09 là
     * không được nói.
     *
     * Đọc CẢ DÃY nhãn của khối chứ không tìm một ô: `oCua` trả `undefined` cho ô
     * không có, và một ca `toBeUndefined()` cũng xanh khi cả khối hỏng.
     */
    await mo();
    const nhom = khoiChung();
    const nhan = [...nhom.querySelectorAll('dt')].map((e) => e.textContent);
    expect(nhan).toContain('Ngày soạn thảo');
    expect(nhan).not.toContain('Ngày áp dụng');
  });

  it('`0206` MỘT khối duy nhất, và ĐỦ DÃY Ô theo ĐÚNG THỨ TỰ (`0177`)', async () => {
    await mo();
    const nhom = khoiChung();

    /*
     * CẢ DÃY bằng `toEqual`, không phải từng ô bằng `toContain`.
     *
     * `0152` đã trả giá cho lối kia: hỏi *"có mặt không"* thì đảo hai ô vẫn xanh,
     * mà thứ tự chính là thứ khách hàng viết ra trong yêu cầu này. Khẳng định cả
     * dãy còn bắt được luôn chiều ngược — chèn thêm một ô không ai yêu cầu, hoặc
     * để sót ô *Tên* cũ nằm lại.
     *
     * `0206` gộp hai khối làm một, và dãy này là chỗ duy nhất nói ra rằng lượt
     * gộp KHÔNG xáo thứ tự: bốn ô của hồ sơ trước, rồi nguyên dãy của khách hàng
     * theo đúng thứ tự `0177` chốt. Ô *Trạng thái* của hồ sơ thì rời hẳn khỏi
     * đây — nó lên cạnh mã ở đầu trang.
     */
    expect([...nhom.querySelectorAll('dt')].map((e) => e.textContent)).toEqual(DAY_NHAN);

    expect(within(nhom).getByText('KH-000123')).toBeDefined();
    expect(oCua('Người đại diện')).toBe('Nguyen Thi Dai Dien');
    expect(oCua('Tên Hộ kinh doanh/Tên Công ty')).toBe('Cong ty TNHH Duoc pham ABC');
    expect(oCua('Số nhà, Phường xã')).toBe('Số 12 ngõ 5, Phường Láng Hạ');
    expect(oCua('Tỉnh/Thành phố')).toBe('Thành phố Hà Nội');
    // `0139` — nhãn mang cả SỐ lẫn TÊN THẬT của loại khách hàng.
    expect(oCua('Loại khách hàng')).toBe('Loại 2 - Hộ kinh doanh cộng tác');
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

  it('`0228` ô "Có hiệu lực" LUÔN có mặt — chưa hiệu lực thì nói thành lời', async () => {
    // Tới `0227` ô này chỉ hiện khi đã hiệu lực (`0061`), và chính nó làm mọi ô
    // sau dịch một nấc — *Mã khách hàng* đổi cột giữa hai loại hồ sơ.
    await mo();
    expect(oCua('Có hiệu lực')).toBe('Chưa có hiệu lực');

    cleanup();
    await mo({ ...HO_SO, effectiveFrom: '2026-08-05T03:12:00.000Z' });
    expect(oCua('Có hiệu lực')).toContain('05/08/2026');
  });

  it('`0228` CÙNG MỘT DÃY Ô ở mọi hình dạng dữ liệu — vị trí không đổi giữa các CSBH', async () => {
    /*
     * Đúng triệu chứng người dùng báo. Mỗi biến thể dưới đây, tới `0227`, làm
     * dãy dài/ngắn đi một hai ô: hồ sơ đã hiệu lực, khách không có địa chỉ giao
     * hàng, khách đã ngừng hợp tác, hồ sơ gửi trước `0177` (chỉ có chuỗi địa chỉ
     * gộp), khách chưa khai địa chỉ nào, và `customer` không tra được.
     */
    const bienThe = [
      HO_SO,
      { ...HO_SO, effectiveFrom: '2026-08-05T03:12:00.000Z' },
      { ...HO_SO, khachHang: { ...HO_SO.khachHang, noiNhanHang: [] } },
      { ...HO_SO, khachHang: { ...HO_SO.khachHang, trangThai: 'NGUNG_HOP_TAC' } },
      { ...HO_SO, khachHang: { ...HO_SO.khachHang, soNha: null, tinhThanh: null } },
      {
        ...HO_SO,
        khachHang: { ...HO_SO.khachHang, soNha: null, tinhThanh: null, diaChiDangKy: null },
      },
      { ...HO_SO, khachHang: null },
    ];
    for (const [i, h] of bienThe.entries()) {
      await mo(h);
      const nhan = [...khoiChung().querySelectorAll('dt')].map((e) => e.textContent);
      expect(nhan, `biến thể ${i}`).toEqual(DAY_NHAN);
      cleanup();
    }
  });

  it('`0228` chức danh người đại diện hiện ngay cạnh người đại diện', async () => {
    await mo({ ...HO_SO, khachHang: { ...HO_SO.khachHang, chucDanh: 'Giám đốc' } });
    expect(oCua('Chức danh người đại diện')).toBe('Giám đốc');
  });

  it('`0228` trạng thái khách hàng: đang hợp tác thì nói thành lời, ngừng thì nhãn cảnh báo', async () => {
    await mo();
    expect(oCua('Trạng thái khách hàng')).toBe('Đang hợp tác');
    cleanup();
    await mo({ ...HO_SO, khachHang: { ...HO_SO.khachHang, trangThai: 'NGUNG_HOP_TAC' } });
    expect(oCua('Trạng thái khách hàng')).toBe('Đã ngừng hợp tác');
  });

  it('`customer` chết thì mất KHỐI khách hàng, không mất cả màn hình', async () => {
    await mo({ ...HO_SO, khachHang: null });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CSBH-2026-000123');
    expect(document.body.textContent).toContain('Chưa tải được thông tin khách hàng');
  });

  /*
   * `0177` — *"bỏ mục Tên"* KHÔNG phải bỏ tên khách hàng khỏi màn hình.
   *
   * Câu kế tiếp trong cùng yêu cầu đòi thêm *tên hộ kinh doanh/tên công ty*, và
   * đó chính là dữ liệu ô cũ đang mang: `0175` đã đổi nhãn của nó ở biểu mẫu lập
   * khách hàng, trang này là chỗ còn sót. Đọc riêng vế đầu là làm sai cả hai.
   *
   * Ca này canh đúng cách hiểu sai ấy: nhãn cũ phải biến mất, GIÁ TRỊ phải ở lại.
   */
  it('nhãn *Tên* trần không còn, nhưng tên pháp nhân vẫn hiện', async () => {
    await mo();
    const nhan = [...document.querySelectorAll('.tom-tat-nhom dt')].map((e) => e.textContent);
    expect(nhan).not.toContain('Tên');
    expect(oCua('Tên Hộ kinh doanh/Tên Công ty')).toBe('Cong ty TNHH Duoc pham ABC');
  });

  it('hồ sơ gửi TRƯỚC `0177`: chuỗi địa chỉ gộp vào ô số nhà, KHÔNG tách ngược', async () => {
    /*
     * `0228` thay ca *"một ô Địa chỉ đăng ký, không phải hai ô rỗng"*: ô ấy là một
     * trong bốn nguồn xô lệch vị trí. Hai ô cố định, chuỗi gộp nằm trọn ở ô đầu
     * — tách nó ở dấu phẩy là suy ngược lên một cột dẫn xuất (`0177`).
     */
    await mo({
      ...HO_SO,
      khachHang: { ...HO_SO.khachHang, soNha: null, tinhThanh: null },
    });
    expect(oCua('Số nhà, Phường xã')).toBe('Số 12 ngõ 5, Phường Láng Hạ, Thành phố Hà Nội');
    expect(oCua('Tỉnh/Thành phố')).toBe('—');
  });

  it('không có địa chỉ nào thì hai ô ghi dấu gạch, không biến mất', async () => {
    await mo({
      ...HO_SO,
      khachHang: { ...HO_SO.khachHang, soNha: null, tinhThanh: null, diaChiDangKy: null },
    });
    expect(oCua('Số nhà, Phường xã')).toBe('—');
    expect(oCua('Tỉnh/Thành phố')).toBe('—');
  });

  it('nhiều địa chỉ giao hàng thì MỖI CÁI MỘT DÒNG', async () => {
    // Nối bằng dấu phẩy thì một địa chỉ vốn đã có dấu phẩy đọc ra thành hai —
    // và cả hai địa chỉ trong fixture đều có dấu phẩy, nên phép nối sai sẽ cho
    // ra bốn dòng chứ không phải hai.
    await mo();
    const dd = [...document.querySelectorAll('.tom-tat-nhom dt')]
      .find((e) => e.textContent === 'Địa chỉ giao hàng')!
      .parentElement!.querySelector('dd')!;
    const dong = [...dd.querySelectorAll('.dong-dia-chi')].map((e) => e.textContent);
    expect(dong).toEqual(['Kho 1, KCN Bắc Thăng Long', 'Số 8 Trần Duy Hưng']);
  });

  it('KHÔNG có địa chỉ giao hàng thì ô nói *Giao tới địa chỉ đăng ký*, không dấu gạch', async () => {
    /*
     * `0006` — mảng rỗng nghĩa là *"giao tới địa chỉ đăng ký"*. Tới `0227` ô bỏ
     * hẳn (dấu gạch nói khách thiếu một thông tin họ không thiếu); `0228` giữ lý
     * do ấy mà cho ô đứng yên chỗ: nói đúng câu trả lời thay vì biến mất.
     */
    await mo({ ...HO_SO, khachHang: { ...HO_SO.khachHang, noiNhanHang: [] } });
    expect(oCua('Địa chỉ giao hàng')).toBe('Giao tới địa chỉ đăng ký');
  });

  /*
   * `0220` — NHÃN Ở TRÊN, GIÁ TRỊ Ở DƯỚI, cùng bố cục trang khách hàng.
   *
   * Thay ca `0179` (cột nhãn đo từ nội dung): nhãn đứng riêng một dòng thì
   * không còn cột nhãn nào để đo. jsdom không tính bố cục, nên thứ đo được là
   * ba mảnh phải khớp nhau, và mỗi mảnh chặn một cách hỏng khác:
   *   1. `dl` của khối mang lớp `the-so` — thiếu thì không có bố cục nào của
   *      trang khách hàng được áp;
   *   2. trang khách hàng CŨNG dùng lớp ấy — nếu không thì *"giống trang khách
   *      hàng"* chỉ còn là trùng tên;
   *   3. luật nhãn-trái của `.tom-tat-nhom dl` ĐỨNG NGOÀI `the-so` — nó đặc hơn
   *      `.the-so` nên không có `:not` là nó thắng, `display: contents` ở hàng
   *      xoá hộp của từng ô, và khối quay về nhãn-trái mà trang vẫn dựng được.
   */
  it('`0220` khối thông tin dùng CHÍNH bố cục `the-so` của trang khách hàng', async () => {
    await mo();
    const dl = khoiChung().querySelector('dl');
    expect(dl?.classList.contains('the-so'), '`dl` của khối phải mang lớp `the-so`').toBe(true);

    // Mỗi ô là MỘT hàng `<div>` bọc đúng một cặp nhãn trên, giá trị dưới.
    for (const dt of dl!.querySelectorAll('dt')) {
      expect(dt.parentElement!.parentElement).toBe(dl);
      expect(dt.nextElementSibling?.tagName).toBe('DD');
    }

    const kh = readFileSync('apps/web/src/pages/KhachHang.tsx', 'utf8');
    expect(kh, 'trang khách hàng phải dùng cùng lớp `the-so`').toMatch(/<dl className="the-so">/);

    const css = readFileSync('apps/web/src/styles/app.css', 'utf8');
    const chon = [...css.matchAll(/([^{}]+)\{[^}]*\}/g)].map((m) =>
      m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    );
    const nhanTrai = chon.filter((c) => /^\.tom-tat-nhom dl\b/.test(c));
    expect(nhanTrai.length, 'không còn luật nhãn-trái nào của `.tom-tat-nhom dl`').toBeGreaterThan(0);
    for (const c of nhanTrai) {
      expect(c, `luật "${c}" phải đứng ngoài \`the-so\``).toContain(':not(.the-so)');
    }
    // Cột nhãn `auto` của `0179` gỡ theo — không ai đọc biến ấy nữa.
    expect(css).not.toMatch(/--cot-nhan/);
  });

  it('khách đã ngừng hợp tác thì nói ra ở ngay khối này', async () => {
    // Hồ sơ cũ của họ vẫn mở được, và không có dòng này thì người đọc không thấy
    // gì bất thường ở một chính sách dành cho khách không còn giao dịch.
    await mo({ ...HO_SO, khachHang: { ...HO_SO.khachHang, trangThai: 'NGUNG_HOP_TAC' } });
    expect(document.body.textContent).toContain('Đã ngừng hợp tác');
    // `0206` — nhãn phải nói rõ *khách hàng*: trạng thái HỒ SƠ đã lên đầu trang,
    // nên một ô tên trần *Trạng thái* trong lưới đọc ra là trạng thái của hồ sơ.
    expect(oCua('Trạng thái khách hàng')).toBe('Đã ngừng hợp tác');
  });
});

/**
 * `0206` — GỘP hai khối đầu trang, TRẠNG THÁI lên cạnh mã (khách hàng chốt 19/09).
 *
 * Ba vế, và vế thứ ba là vế không đọc ra được từ câu yêu cầu: tiêu đề nhóm
 * *Khách hàng* đang GÁNH NGHĨA cho ba cái nhãn, nên bỏ nó đi mà giữ nguyên nhãn
 * thì `Mã` đứng cạnh `Phiên bản` trong khi mã hồ sơ là `<h1>` của chính trang.
 */
describe('`0206` một khối thông tin, trạng thái ở đầu trang', () => {
  it('nhãn trạng thái HỒ SƠ nằm trong khối tiêu đề, cạnh mã', async () => {
    await mo();
    const dau = document.querySelector('.dau-trang-ten') as HTMLElement;
    expect(dau, 'không có khối nào gom mã với nhãn trạng thái').not.toBeNull();

    // Cùng MỘT khối với `<h1>`, không phải một chỗ nào đó trên trang: yêu cầu
    // là *"để luôn bên cạnh mã hồ sơ ở trên"*.
    expect(within(dau).getByRole('heading', { level: 1 }).textContent).toBe('CSBH-2026-000123');
    const nhan = dau.querySelector('.nhan');
    expect(nhan?.textContent).toBe('Chờ TBP duyệt');

    // Và THỨ TỰ: mã trước, nhãn sau.
    expect(
      dau.querySelector('h1')!.compareDocumentPosition(nhan!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('lưới KHÔNG còn ô *Trạng thái* nào của hồ sơ', async () => {
    /*
     * Đọc CẢ DÃY nhãn chứ không tìm một ô: sót lại ô cũ thì trang có HAI chỗ nói
     * trạng thái hồ sơ, và chúng sẽ lệch nhau ở lượt sửa đầu tiên.
     *
     * Hồ sơ này có khách đang hợp tác nên không có ô *Trạng thái khách hàng* —
     * dãy phải sạch cả hai chữ.
     */
    await mo();
    const nhan = [...khoiChung().querySelectorAll('dt')].map((e) => e.textContent);
    expect(nhan).not.toContain('Trạng thái');
  });

  it('ba nhãn của khách hàng TỰ NÓI RA chúng thuộc về ai', async () => {
    /*
     * `Mã` · `Loại` · `Trạng thái` chỉ đọc ra được nghĩa nhờ đứng dưới tiêu đề
     * *Khách hàng*. Gộp khối là lấy mất chỗ dựa ấy, nên ba nhãn phải tự mang nó.
     * `Mã` là ca nặng nhất: trang này đã có một cái mã khác, ở ngay `<h1>`.
     */
    await mo({ ...HO_SO, khachHang: { ...HO_SO.khachHang, trangThai: 'NGUNG_HOP_TAC' } });
    const nhan = [...khoiChung().querySelectorAll('dt')].map((e) => e.textContent);
    for (const n of ['Mã khách hàng', 'Loại khách hàng', 'Trạng thái khách hàng']) {
      expect(nhan, n).toContain(n);
    }
    for (const n of ['Mã', 'Loại', 'Trạng thái']) {
      expect(nhan, `nhãn trần "${n}" còn nằm lại`).not.toContain(n);
    }
  });

  it('`customer` chết thì bốn ô của HỒ SƠ vẫn đọc được', async () => {
    /*
     * Trước `0206` hai nhóm ở hai thẻ, nên chuyện này là hiển nhiên. Gộp vào một
     * `<dl>` thì cách viết tự nhiên nhất — cả lưới nằm trong nhánh `kh ?` — làm
     * mất luôn *Phiên bản* và *Người đề nghị* ở đúng lượt người dùng cần biết họ
     * đang mở hồ sơ nào.
     */
    await mo({ ...HO_SO, khachHang: null });
    expect(oCua('Phiên bản')).toBe('2');
    expect(oCua('Người đề nghị')).toBe('Nguyen Van Tdv');
    expect(document.body.textContent).toContain('Chưa tải được thông tin khách hàng');
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
    /*
     * Nhãn phụ nói CẢ HAI thứ từ `0167`: loại mẫu, rồi khổ giấy.
     *
     * Ô chọn trộn chung mẫu đầy đủ với mẫu rút gọn (`0165`), mà hai bản ấy in ra
     * sáu cột và mười cột — hai cái tên do Quản trị đặt không bắt buộc nói ra
     * điều đó, nên ô chọn phải tự nói.
     */
    const o = (await screen.findByLabelText('Mẫu')) as HTMLSelectElement;
    expect([...o.options].map((x) => x.textContent)).toEqual([
      'Mẫu A4 dọc · đầy đủ · A4 dọc',
      'Mẫu A4 ngang · đầy đủ · A4 ngang',
      'Mẫu rút gọn · rút gọn · A4 ngang',
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


describe('`0167` khối Bản mềm, và lượt bàn giao chen bước tạo', () => {
  const SA_XU_LY = {
    ...HO_SO,
    status: 'SA_DANG_XU_LY',
    loaiTepGhiDuoc: ['SCAN', 'BAN_MEM'],
    banGiaoDuoc: true,
  };

  const laSaAdmin = () => localStorage.setItem('csbh:phien', JSON.stringify(SA));

  /** Mở trang với vai Sale Admin ở bước B8. */
  const moSa = async (thay: Record<string, unknown> = {}) => {
    laSaAdmin();
    return mo({ ...SA_XU_LY, ...thay }, ['SA_HANDOVER']);
  };

  it('có BA khối tệp, và Bản mềm đứng TRƯỚC File SCAN bản cứng', async () => {
    /*
     * Thứ tự theo chiều hồ sơ đi: giấy tờ có từ lúc lập, rồi Sale Admin dựng bản
     * mềm, in ra, trình ký, rồi mới scan lại thành bản cứng. Đặt bản mềm sau bản
     * cứng là đọc ngược chiều công việc.
     *
     * Khẳng định CẢ DÃY bằng `toEqual` chứ không `toContain`: đảo hai khối vẫn
     * qua được mọi phép "có mặt không", và đó đúng là bài học `0152` đã ghi.
     *
     * `0170` tách ba khối này ra HAI chỗ trên trang, nhưng thứ tự DOM giữ nguyên
     * — nên ca này không đổi một chữ. Chỗ nó không nhìn thấy là những mục KHÁC
     * chen vào giữa, và đó là việc của ca `0170` ngay dưới.
     *
     * `0172` bỏ khối *Giấy tờ hồ sơ*, nên dãy còn HAI — và hai khối ấy lại đứng
     * liền nhau, tức trang gọi `TepDinhKem` đúng MỘT lượt.
     */
    await moSa();
    const ten = [...document.querySelectorAll('.khoi-tep h2')].map((e) => e.textContent);
    expect(ten).toEqual(['Bản mềm', 'File SCAN bản cứng']);
  });

  it('`0170` THỨ TỰ MỤC trên cả trang — hai khối tệp ngay trên Lịch sử', async () => {
    /*
     * Thứ tự mục là một YÊU CẦU, nên nó phải có ca kiểm — và tới `0170` KHÔNG ca
     * nào canh nó. Ca ngay trên chỉ đọc `.khoi-tep h2`, tức chỉ thấy ba khối tệp
     * và mù hoàn toàn với những mục xen giữa chúng: chuyển *Hồ sơ pháp lý* xuống
     * dưới *Bản cứng* thì nó vẫn xanh. Đây là lần thứ ba một yêu cầu về TRÌNH
     * BÀY chạm vào vùng không ai canh (`0152` thứ tự thanh bên, `0153` khối
     * thông tin khách hàng).
     *
     * Đọc CẢ DÃY `<h2>` của trang, theo đúng thứ tự DOM — tức đúng thứ tự người
     * dùng cuộn qua. Quét mã nguồn thì chỉ thấy thứ tự CHỮ trong tệp, và hai thứ
     * ấy tách nhau ngay khi một mục bị bọc vào nhánh điều kiện.
     */
    await moSa();
    const muc = [...document.querySelectorAll('h2')].map((e) => e.textContent);
    expect(muc).toEqual([
      // MỘT khối tóm tắt ở đầu trang — `0061` dựng hai, `0206` gộp lại.
      'Thông tin chung',
      'Sản phẩm',
      /*
        *Giấy tờ hồ sơ* đứng ở ĐÂY tới `0170`, và `0172` bỏ hẳn khối ấy — khách
        hàng: *"bỏ mục giấy tờ hồ sơ, không cần trong thông tin của hồ sơ"*. Ca
        này là chỗ duy nhất của bộ kiểm nói ra rằng nó ĐÃ BIẾN MẤT khỏi trang,
        chứ không phải bị đẩy đi đâu đó.
      */
      'Hồ sơ pháp lý của khách hàng',
      'Bản mềm',
      'File SCAN bản cứng',
      // *Lịch sử* vẫn CUỐI CÙNG (`0061`) — yêu cầu `0170` nói *"xuống cuối
      // nhưng trước mục lịch sử"*, nên hai vế ấy phải cùng đúng.
      'Lịch sử',
    ]);
  });

  it('`0183` khối TỆP CỦA PHIÊN BẢN TRƯỚC: chỉ đọc, và nằm ngay trên Lịch sử', async () => {
    /*
     * Khách hàng chốt 07/09: hồ sơ sửa đổi/bổ sung đang đi trong luồng thì bày
     * bản mềm và bản cứng của phiên bản trước để TBP và Kế toán đối chiếu.
     *
     * Ca này canh BA vế, và vế thứ ba là vế dễ mất nhất:
     *
     *   1. khối có mặt, đúng chỗ — sau hai khối của chính hồ sơ, trước *Lịch sử*;
     *   2. nó nói rõ mình thuộc hồ sơ NÀO, và bấm sang được;
     *   3. nó KHÔNG ghi được: không ô chọn file, không dấu ✕.
     *
     * Thiếu vế ba thì một bản sửa dùng lại `TepDinhKem` cho khối này vẫn xanh —
     * và khi ấy người duyệt gỡ được tệp của một hồ sơ đã ký.
     */
    await moSa({
      banTruoc: {
        id: 'hs-cu',
        code: 'CSBH-2026-000001',
        versionNo: 1,
        attachments: [
          {
            id: 'bt-1',
            kind: 'BAN_MEM',
            fileName: 'ban-mem-v1.pdf',
            objectKey: 'banmem/hs-cu.pdf',
            uploadedAt: '2026-08-01T03:00:00.000Z',
          },
          {
            id: 'bt-2',
            kind: 'SCAN',
            fileName: 'ban-cung-v1.pdf',
            objectKey: 'scan/hs-cu.pdf',
            uploadedAt: '2026-08-02T03:00:00.000Z',
          },
        ],
      },
    });

    const muc = [...document.querySelectorAll('h2')].map((e) => e.textContent);
    expect(muc).toEqual([
      'Thông tin chung',
      'Sản phẩm',
      'Hồ sơ pháp lý của khách hàng',
      'Bản mềm',
      'File SCAN bản cứng',
      'Bản mềm và bản cứng của phiên bản trước',
      'Lịch sử',
    ]);

    const khoi = document.querySelector('.khoi-ban-truoc') as HTMLElement;
    expect(khoi, 'không có khối tệp bản trước').not.toBeNull();

    // Vế 2: nói rõ hồ sơ nào, và bấm sang được.
    const lien = within(khoi).getByRole('link', { name: 'CSBH-2026-000001' });
    expect(lien.getAttribute('href')).toBe('/ho-so/hs-cu');

    // Cả hai tệp có mặt, và mỗi thẻ nói mình là loại gì — khối này trộn hai loại
    // nên tiêu đề khối không nói hộ được (khác `0097`).
    expect(within(khoi).getByText('ban-mem-v1.pdf')).toBeDefined();
    expect(within(khoi).getByText('ban-cung-v1.pdf')).toBeDefined();
    expect(khoi.textContent).toContain('Bản mềm ·');
    expect(khoi.textContent).toContain('File SCAN bản cứng ·');

    // Vế 3: CHỈ ĐỌC.
    expect(khoi.querySelector('input[type="file"]'), 'khối chỉ đọc mà nhận file').toBeNull();
    expect(khoi.querySelector('.the-tep-go'), 'khối chỉ đọc mà có dấu ✕').toBeNull();
  });

  it('`0184` khối hiện cả với TDV ở hồ sơ NHÁP — giao diện không lọc theo trạng thái', async () => {
    /*
     * `0183` mở khối cho bốn bàn duyệt; `0184` mở thêm *Nháp* và *Yêu cầu chỉnh
     * sửa* để TDV đối chiếu trong lúc soạn.
     *
     * Ca này canh một tính chất của GIAO DIỆN chứ không của luật: màn hình vẽ
     * khối theo `banTruoc` mà máy chủ gửi, **không** tự lọc theo `status`. Thiếu
     * nó thì một điều kiện `status === 'CHO_TBP_DUYET'` lọt vào component và mọi
     * lượt nới ở máy chủ về sau đều im lặng không có tác dụng.
     */
    // Vai TDV dựng tại chỗ: hằng `TDV` của tệp này sống trong một `describe`
    // khác. Màn hình chỉ đọc VAI TRÒ từ phiên — phạm vi là việc của máy chủ.
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({
        ...TBP,
        user: { ...TBP.user, username: 'tdv01', role: 'TDV' },
      }),
    );
    await mo(
      {
        ...HO_SO,
        status: 'NHAP',
        loaiTepGhiDuoc: [],
        banTruoc: {
          id: 'hs-cu',
          code: 'CSBH-2026-000001',
          versionNo: 1,
          attachments: [],
        },
      },
      [],
    );

    const khoi = document.querySelector('.khoi-ban-truoc') as HTMLElement;
    expect(khoi, 'hồ sơ Nháp cũng phải có khối').not.toBeNull();
    // Bản trước CHƯA có tệp nào: nói thành lời, không ẩn khối.
    expect(khoi.textContent).toContain('chưa lưu bản mềm hay file scan nào');
  });

  it('`0183` KHÔNG có bản trước thì không có khối nào — máy chủ quyết định', async () => {
    /*
     * Chiều đối chiếu. Giao diện KHÔNG tự suy từ `status`: `banTruoc` rỗng là
     * câu trả lời đầy đủ, và nó cũng chính là điều kiện mà phép nới quyền bên
     * `document` dùng. Hai chỗ tự suy là hai chỗ sẽ lệch — khối hiện ra rồi mỗi
     * tệp trong nó trả 403.
     */
    await moSa();
    expect(document.querySelector('.khoi-ban-truoc')).toBeNull();
  });

  it('nút TẠO BẢN MỀM chỉ hiện cho người ghi được, và nó KHÔNG phải ô chọn file', async () => {
    /*
     * Bản mềm không nằm sẵn trên máy ai để mà chọn — nó dựng ra từ dữ liệu hồ sơ
     * và một mẫu. Một `<input type="file">` ở đây là mời người dùng đính một tệp
     * bất kỳ dưới nhãn *bản mềm*, đúng thứ máy chủ vừa chặn ở `purpose`.
     */
    await moSa();
    const khoi = [...document.querySelectorAll('.khoi-tep')].find(
      (e) => e.querySelector('h2')?.textContent === 'Bản mềm',
    )!;
    expect(within(khoi as HTMLElement).getByRole('button', { name: 'Tạo bản mềm' })).toBeDefined();
    expect(khoi.querySelector('input[type="file"]'), 'khối bản mềm không nhận file').toBeNull();

    // Chiều đối chiếu: khối BẢN CỨNG thì vẫn là chỗ nhận file.
    const cung = [...document.querySelectorAll('.khoi-tep')].find(
      (e) => e.querySelector('h2')?.textContent === 'File SCAN bản cứng',
    )!;
    expect(cung.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('vai trò KHÁC không thấy nút tạo, nhưng vẫn thấy khối', async () => {
    // *"Chỉ SA mới có quyền thêm và xóa bản mềm, các người dùng khác chỉ có xem
    // và tải xuống"* — nên khối phải còn đó, chỉ mất đường ghi.
    await mo({ ...SA_XU_LY, loaiTepGhiDuoc: [] }, []);
    const ten = [...document.querySelectorAll('.khoi-tep h2')].map((e) => e.textContent);
    expect(ten).toContain('Bản mềm');
    expect(screen.queryByRole('button', { name: 'Tạo bản mềm' })).toBeNull();
  });

  it('hộp tạo bản mềm CHỈ bày mẫu ĐẦY ĐỦ', async () => {
    /*
     * `MAU` của tệp kiểm này có hai mẫu; ca dưới thêm một mẫu rút gọn vào câu
     * trả lời của `/available` để phép lọc có gì mà lọc.
     */
    laSaAdmin();
    const f = chan(SA_XU_LY, ['SA_HANDOVER']);
    render(
      <PhienProvider>
        <BoDinhTuyen>
          <ChiTietHoSo id="hs-1" />
        </BoDinhTuyen>
      </PhienProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản mềm' }));

    const o = (await screen.findByLabelText(/Văn bản mẫu/)) as HTMLSelectElement;
    const nhan = [...o.options].map((x) => x.textContent ?? '');
    expect(nhan.some((x) => /Mẫu A4 dọc/.test(x)), 'mẫu đầy đủ phải có').toBe(true);
    expect(nhan.some((x) => /Mẫu rút gọn/.test(x)), 'mẫu rút gọn KHÔNG được có').toBe(false);
    expect(f).toBeDefined();
  });

  it('BÀN GIAO khi chưa có bản mềm: mở hộp TẠO trước, KHÔNG gửi hành động nào', async () => {
    /*
     * Ca đáng giá nhất của lượt này, và nó canh đúng chỗ dễ đấu nhầm: nút *Bàn
     * giao* đổi việc nó làm tuỳ theo `coBanMem`. Đấu thẳng vào `datHanhDong` thì
     * hồ sơ đi ngay lúc Sale Admin tưởng mình bấm để TẠO BẢN MỀM — không lùi
     * được, vì bàn giao chuyển hồ sơ sang tay Kế toán.
     */
    const f = await moSa({ coBanMem: false });
    fireEvent.click(screen.getByRole('button', { name: 'Bàn giao' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    expect(screen.getByRole('dialog').textContent).toContain('Tạo bản mềm');
    expect(
      f.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/actions/')),
      'chưa được gửi hành động nào',
    ).toEqual([]);
  });

  it('đã CÓ bản mềm thì Bàn giao đi thẳng vào hộp xác nhận', async () => {
    // Chiều đối chiếu: thiếu nó thì gỡ hẳn nhánh `coBanMem` vẫn xanh ở ca trên.
    await moSa({ coBanMem: true });
    fireEvent.click(screen.getByRole('button', { name: 'Bàn giao' }));

    const hop = await screen.findByRole('dialog');
    expect(hop.textContent).not.toContain('Tạo bản mềm');
    expect(within(hop).getByRole('button', { name: /^Xác nhận/ })).toBeDefined();
  });

  it('máy chủ cũ KHÔNG gửi cờ thì coi như ĐÃ CÓ — không chen bước không có thật', async () => {
    /*
     * Giá trị lùi chọn phía KHÔNG CẢN ĐƯỜNG, ngược với `banGiaoDuoc`. Đoán sai
     * theo hướng này thì người dùng nhận `409 BAN_MEM_REQUIRED` và biết phải làm
     * gì; đoán sai hướng kia thì họ bị chặn bởi một bước không tồn tại và không
     * có gì trên màn hình nói vì sao.
     */
    await moSa();
    fireEvent.click(screen.getByRole('button', { name: 'Bàn giao' }));
    const hop = await screen.findByRole('dialog');
    expect(hop.textContent).not.toContain('Tạo bản mềm');
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

  it('`0181` dòng nhắc trỏ ĐÚNG TÊN khối đang có trên màn hình', async () => {
    /*
     * LỖI CÓ THẬT, tìm ra ở lượt đổi nhãn `0181`.
     *
     * Câu nhắc bảo người dùng *"tải bản scan lên ở khối **Tệp đính kèm**"* —
     * một cái tên đã đổi từ `0054` và không còn trên màn hình từ đó. Hai lượt
     * đổi tên khối đều không ai nghĩ tới câu chỉ đường nằm cách đó hai trăm
     * dòng, và ca `0160` chỉ đòi có chữ *"chưa có bản scan"* nên nó xanh suốt.
     *
     * Ca này canh phép ĐỐI CHIẾU chứ không canh một chuỗi: mọi tên khối mà câu
     * nhắc nhắc tới phải là tên một khối thật sự dựng ra trên trang. Ghim chuỗi
     * *"File SCAN bản cứng"* thì lượt đổi nhãn sau lại đỏ ở đây mà lỗi thật —
     * hai chỗ trôi khỏi nhau — vẫn lọt.
     */
    dangNhapSa();
    await mo({ ...HO_SO, banGiaoDuoc: false }, ['SA_HANDOVER']);

    const nhac = screen.getByText(/chưa có bản scan/i).closest('p')!;
    const khoiNhac = [...nhac.querySelectorAll('em')].map((e) => e.textContent);
    expect(khoiNhac.length, 'câu nhắc không trỏ tới khối nào').toBeGreaterThan(0);

    const tenKhoi = [...document.querySelectorAll('.khoi-tep h2')].map((e) => e.textContent);
    // `Bàn giao` là tên NÚT, không phải tên khối — nó có quyền không nằm trong dãy.
    for (const t of khoiNhac.filter((x) => x !== 'Bàn giao')) {
      expect(tenKhoi, `câu nhắc trỏ tới khối "${t}" không có trên trang`).toContain(t);
    }
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

/**
 * `0189` — KHỐI LÝ DO nói đủ AI và TỪ BƯỚC NÀO.
 *
 * Khách hàng chốt 08/09. Tới `0188` khối này chỉ có mỗi câu chữ, và người đọc
 * phải mở màn hình Nhật ký rồi tự dò xem dòng nào ứng với nó — trong khi bốn
 * hành động khác nhau đều kèm lý do, ở bốn bàn khác nhau.
 */
describe('`0189` lý do trả về nói rõ ai và từ bước nào', () => {
  const LY_DO = {
    lyDo: 'Thieu chu ky chu ho',
    hanhDong: 'TBP_RETURN',
    tuTrangThai: 'CHO_TBP_DUYET',
    ten: 'Tran Thi Truong Bo Phan',
    luc: '2026-09-08T03:20:00.000Z',
  };
  const khoi = () => document.querySelector('.ghi-chu-tra-lai') as HTMLElement | null;

  it('hiện đủ bốn vế: lý do · hành động · người · bước xuất phát', async () => {
    await mo({ ...HO_SO, status: 'YEU_CAU_CHINH_SUA', lastReason: LY_DO.lyDo, lyDoTraLai: LY_DO });
    const k = khoi();
    expect(k, 'không dựng ra khối lý do').not.toBeNull();
    const chu = k!.textContent ?? '';
    expect(chu).toContain('Thieu chu ky chu ho');
    // Nhãn TIẾNG VIỆT, không phải mã trần — giao diện tra bảng nhãn của nó.
    // Nhãn hành động đã nói ra VAI TRÒ, nên câu không lặp lại vai trò lần nữa.
    expect(chu).toContain('Trưởng bộ phận trả lại để chỉnh sửa');
    expect(chu).toContain('Tran Thi Truong Bo Phan');
    expect(
      chu.match(/Trưởng bộ phận/g)?.length,
      'vai trò bị in hai lần — nhãn hành động đã chứa nó',
    ).toBe(1);
    expect(chu).toContain('Chờ TBP duyệt');
    expect(chu, 'mã trần lọt ra màn hình').not.toContain('TBP_RETURN');
    expect(chu).not.toContain('CHO_TBP_DUYET');
  });

  it('MẤT TÊN vẫn còn câu có nghĩa — identity chết không làm hỏng khối', async () => {
    // `userNames` nuốt lỗi và trả rỗng có chủ ý, nên `ten` là `null` được. Câu
    // trả lời cho *"bàn nào trả về"* nằm ở NHÃN HÀNH ĐỘNG, không ở cái tên — nên
    // mất tên không mất vế quan trọng nhất.
    await mo({
      ...HO_SO,
      status: 'YEU_CAU_CHINH_SUA',
      lastReason: LY_DO.lyDo,
      lyDoTraLai: { ...LY_DO, ten: null },
    });
    const chu = khoi()!.textContent ?? '';
    expect(chu).toContain('Trưởng bộ phận trả lại để chỉnh sửa');
    expect(chu).toContain('Chờ TBP duyệt');
    expect(chu).toContain('Thieu chu ky chu ho');
  });

  it('`0221` chỉ có `lastReason` thì KHÔNG dựng khối — máy chủ quyết định khi nào hiện', async () => {
    /*
     * Thay ca *"máy chủ cũ chỉ gửi `lastReason`"* của `0189`. `lastReason` sống
     * qua mọi bước sau lượt trả về, nên rơi về nó là khối hiện lại ở đúng những
     * trạng thái khách hàng vừa yêu cầu giấu. Máy chủ trả `lyDoTraLai: null` là
     * câu trả lời, không phải một chỗ thiếu cần vá.
     */
    await mo({ ...HO_SO, status: 'CHO_TBP_DUYET', lastReason: 'Chi co chuoi', lyDoTraLai: null });
    expect(khoi()).toBeNull();
    expect(document.body.textContent).not.toContain('Chi co chuoi');
  });

  it('hồ sơ chưa từng bị trả về thì KHÔNG có khối nào', async () => {
    await mo();
    expect(khoi()).toBeNull();
  });
});

/**
 * `0191` — LẬP PHIÊN BẢN MỚI ngay từ trang hồ sơ.
 *
 * Khách hàng chốt 08/09: TDV xem một CSBH đang hiệu lực thì lập được bản mới tại
 * chỗ, không phải vòng qua trang khách hàng.
 */
describe('`0191` lập phiên bản mới từ trang hồ sơ', () => {
  const TDV = {
    ...TBP,
    user: { ...TBP.user, id: '11111111-1111-1111-1111-111111111111', username: 'tdv01', role: 'TDV' },
  };
  const laTdv = () => localStorage.setItem('csbh:phien', JSON.stringify(TDV));
  const HIEU_LUC = { ...HO_SO, status: 'DANG_CO_HIEU_LUC', effectiveFrom: '2026-08-01' };
  const nutMoi = () => screen.queryByRole('button', { name: 'Lập phiên bản mới' });

  const moHop = async (hoSo: unknown = HIEU_LUC) => {
    laTdv();
    const f = await mo(hoSo, []);
    fireEvent.click(nutMoi()!);
    await screen.findByRole('dialog');
    return f;
  };

  it('TDV xem hồ sơ ĐANG HIỆU LỰC thì có nút', async () => {
    laTdv();
    await mo(HIEU_LUC, []);
    expect(nutMoi()).not.toBeNull();
  });

  it('hồ sơ CHƯA hiệu lực thì KHÔNG có nút, dù vẫn là TDV', async () => {
    /*
     * Trạng thái là một nửa điều kiện. Bày nút trên hồ sơ đang chờ duyệt là mời
     * người lập tạo bản thứ hai của một thứ chưa ai duyệt xong — và máy chủ trả
     * `NO_ACTIVE_POLICY`, một câu không nói được vì sao nút lại có mặt.
     */
    laTdv();
    await mo({ ...HO_SO, status: 'CHO_TBP_DUYET' }, []);
    expect(nutMoi()).toBeNull();
  });

  it('vai trò KHÁC TDV thì KHÔNG có nút, dù hồ sơ đang hiệu lực', async () => {
    /*
     * Nửa còn lại của điều kiện. Hồ sơ đang hiệu lực vẫn mở ra với TBP, Kế toán
     * và Sale Admin — họ nằm trong bốn cột người — mà lập hồ sơ là việc của TDV.
     */
    for (const v of ['TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO']) {
      cleanup();
      localStorage.setItem(
        'csbh:phien',
        JSON.stringify({ ...TBP, user: { ...TBP.user, role: v, username: 'x01' } }),
      );
      await mo(HIEU_LUC, []);
      expect(nutMoi(), `${v} không được thấy nút lập phiên bản mới`).toBeNull();
    }
  });

  it('hộp xác nhận nói ra HAI điều người lập cần biết trước khi bấm', async () => {
    await moHop();
    const hop = screen.getByRole('dialog');
    // Bản mới chép sẵn — họ không phải nhập lại.
    expect(hop.textContent).toContain('chép sẵn toàn bộ sản phẩm');
    // Và bản đang hiệu lực KHÔNG mất hiệu lực ngay lúc này.
    expect(hop.textContent).toContain('vẫn có hiệu lực');
  });

  it('`0220` khách có hồ sơ ĐANG DUYỆT thì hộp CHẶN, không còn nút lập — thay cảnh báo `0191`', async () => {
    /*
     * Ca `0191` ở chỗ này khẳng định một CẢNH BÁO (*"lập tiếp sẽ tạo bản thứ
     * hai"*) vì khi ấy `create` không chặn. Khách hàng chốt 25/09 rằng mỗi khách
     * chỉ một hồ sơ đang xử lý, nên câu cảnh báo thành câu sai: nút ngay dưới nó
     * sẽ bị máy chủ từ chối. Vế còn giữ được của ca cũ là MÃ và TRẠNG THÁI của hồ
     * sơ đang dở — người dùng vẫn cần biết nó là cái nào.
     */
    await moHop({
      ...HIEU_LUC,
      phienBanSau: { id: 'hs-9', code: 'CSBH-2026-000999', status: 'CHO_TBP_DUYET' },
    });
    const hop = screen.getByRole('dialog');
    expect(hop.textContent).toContain('đang có một hồ sơ chưa duyệt xong');
    expect(hop.textContent).toContain('CSBH-2026-000999');
    expect(hop.textContent).toContain('Chờ TBP duyệt');
    expect(within(hop).getByRole('button', { name: 'Mở hồ sơ đang xử lý' })).toBeDefined();
    expect(within(hop).queryByRole('button', { name: 'Lập phiên bản mới' })).toBeNull();
    // Không phải câu của bản Nháp: hồ sơ này không còn trong tay TDV để "soạn tiếp".
    expect(hop.textContent).not.toContain('soạn dở');
  });

  it('KHÔNG cảnh báo khi chưa có bản nào dở dang', async () => {
    await moHop();
    expect(screen.getByRole('dialog').textContent).not.toContain('dở dang');
  });

  it('bấm xác nhận thì gọi ĐÚNG đường của trang Lập hồ sơ', async () => {
    /*
     * Cùng một đường máy chủ với trang *Lập hồ sơ* (`POST /policies`, `mode:
     * NEW_VERSION`), không phải một đường riêng: mọi chốt chặn của việc lập hồ sơ
     * — phạm vi TDV, khách đã ngừng hợp tác, "chưa có CSBH nào thì không lập bản
     * mới được" — đều nằm ở đó, và một đường thứ hai là một bản sao sẽ trôi.
     */
    const f = await moHop();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Lập phiên bản mới' }),
    );

    await waitFor(() => {
      const goi = f.mock.calls
        .map((c) => [String(c[0]), c[1] as RequestInit | undefined] as const)
        .find(([d, o]) => d.endsWith('/policies') && o?.method === 'POST');
      expect(goi, 'không gọi POST /policies').toBeDefined();
      const than = JSON.parse(String(goi![1]!.body)) as Record<string, unknown>;
      expect(than['mode']).toBe('NEW_VERSION');
      expect(than['customerId']).toBe(HO_SO.customerId);
      // Bản mới chép sẵn dòng cũ ở MÁY CHỦ; lối tắt này không thêm dòng nào.
      expect(than['lines']).toEqual([]);
    });
  });

  /**
   * `0200` — KHÁCH ĐÃ CÓ BẢN NHÁP thì hộp thoại đổi hẳn câu hỏi.
   *
   * `0197` cấm lập hồ sơ thứ hai cho khách đang giữ Nháp, và `DRAFT_EXISTS` khai
   * `dang: 'im'` (`0088`) vì màn hình *Lập hồ sơ* tự xử mã ấy. Lối tắt `0191`
   * không có nhánh ấy, nên nó nuốt lỗi rồi đứng yên — **bấm nút và không có gì
   * xảy ra**, kể cả một câu báo. Đây là loại hỏng không lỗi nào đỏ và không log
   * nào ghi.
   */
  const NHAP_SAU = { id: 'hs-nhap', code: 'CSBH-2026-000777', status: 'NHAP' };

  it('`0200` bản kế nhiệm ở NHÁP: đổi tiêu đề, đổi nút, KHÔNG còn nút lập', async () => {
    await moHop({ ...HIEU_LUC, phienBanSau: NHAP_SAU });
    const hop = screen.getByRole('dialog');
    expect(hop.textContent).toContain('đã có một bản Nháp đang soạn dở');
    expect(hop.textContent).toContain('CSBH-2026-000777');
    expect(within(hop).getByRole('button', { name: 'Mở bản Nháp đang có' })).toBeDefined();
    // Vế ĐỐI CHIẾU, và là vế chính của yêu cầu: thao tác chết phải BIẾN MẤT, chứ
    // không phải nằm cạnh một câu giải thích vì sao nó không chạy.
    expect(within(hop).queryByRole('button', { name: 'Lập phiên bản mới' })).toBeNull();
  });

  it('`0200` bấm *Mở bản Nháp* thì SANG hồ sơ ấy, không gọi POST nào', async () => {
    const f = await moHop({ ...HIEU_LUC, phienBanSau: NHAP_SAU });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mở bản Nháp đang có' }),
    );
    await waitFor(() => expect(location.pathname).toBe('/ho-so/hs-nhap'));
    expect(
      f.mock.calls.some(
        (c) => String(c[0]).endsWith('/policies') && (c[1] as RequestInit | undefined)?.method === 'POST',
      ),
      'không được lập hồ sơ nào — khách đang có Nháp',
    ).toBe(false);
  });

  it('`0201` bấm *Mở bản Nháp* thì hộp thoại ĐÓNG LẠI', async () => {
    /*
     * Triệu chứng được báo: bấm xong sang đúng bản Nháp, nhưng hộp thoại nằm
     * nguyên đó đè lên trang vừa mở.
     *
     * `HopThoaiXacNhan` KHÔNG tự đóng — nơi dùng phải đóng, và nhánh *Lập phiên
     * bản mới* ngay cạnh đã làm đúng thế từ `0191`. Nhánh này chỉ gọi `di()`, và
     * chỗ ấy thường tự khỏi vì trang đích là một màn hình khác; ở đây trang đích
     * là CHÍNH màn hình này với một id khác, nên không có gì tháo component ra.
     *
     * Ca kiểm hỏi ở tầng COMPONENT chứ không tầng định tuyến: `key` ở
     * `App.noiDung` cũng đóng được hộp thoại, nhưng nó là câu trả lời của một
     * câu hỏi khác (*"trang này thuộc về hồ sơ nào"*), và một component tự nó
     * phải đúng dù ai mount nó.
     */
    await moHop({ ...HIEU_LUC, phienBanSau: NHAP_SAU });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mở bản Nháp đang có' }),
    );
    await waitFor(() => expect(location.pathname).toBe('/ho-so/hs-nhap'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('`0220` máy chủ trả `POLICY_IN_PROGRESS` giữa chừng thì hộp ĐỔI, và nút mở đúng hồ sơ', async () => {
    /*
     * THAY ca `0200` *"bản kế nhiệm đang duyệt thì vẫn lập được"* — ranh giới ấy
     * vừa bị khách hàng dời đi. Cùng khe thời gian với ca `DRAFT_EXISTS` ngay
     * dưới: hồ sơ kia có thể được gửi duyệt giữa lúc mở trang và lúc bấm, nên
     * nhánh bắt mã mới phải có, và nó đọc id TỪ LỖI chứ không từ `phienBanSau`.
     */
    const f = await moHop();
    (f as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      (duong: unknown, o?: RequestInit) => {
        const d = String(duong);
        if (d.endsWith('/policies') && o?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                code: 'POLICY_IN_PROGRESS',
                policyId: 'hs-dang-duyet',
                policyCode: 'CSBH-2026-000888',
                status: 'CHO_KT_L1',
                message: 'x',
              }),
              { status: 409, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(HIEU_LUC), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    );

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Lập phiên bản mới' }),
    );
    const nut = await waitFor(() =>
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mở hồ sơ đang xử lý' }),
    );
    expect(screen.getByRole('dialog').textContent).toContain('CSBH-2026-000888');
    fireEvent.click(nut);
    await waitFor(() => expect(location.pathname).toBe('/ho-so/hs-dang-duyet'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('`0200` máy chủ trả `DRAFT_EXISTS` giữa chừng thì hộp thoại ĐỔI, không im', async () => {
    /*
     * Khe thời gian có thật: một bản Nháp ra đời giữa lúc mở trang và lúc bấm.
     * `phienBanSau` khi ấy đã cũ, nên nhánh bắt lỗi vẫn phải còn — nó là thứ
     * duy nhất nói đúng về HIỆN TẠI.
     */
    const f = await moHop();
    (f as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      (duong: unknown, o?: RequestInit) => {
        const d = String(duong);
        if (d.endsWith('/policies') && o?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({ code: 'DRAFT_EXISTS', draftPolicyId: 'hs-nhap', message: 'x' }),
              { status: 409, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(HIEU_LUC), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    );

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Lập phiên bản mới' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('dialog').textContent).toContain('đã có một bản Nháp đang soạn dở'),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mở bản Nháp đang có' }),
    ).toBeDefined();
  });
});

/**
 * `0194` — KHỐI CHÊNH LỆCH và nút *Tự động cập nhật* trên trang hồ sơ.
 *
 * Khách hàng chốt 10/09. Hai vế phải đúng cùng lúc, và chúng ngược nhau:
 *
 *   * hồ sơ CÒN SỬA ĐƯỢC → có nút, và câu chữ nói về việc bấm nó;
 *   * hồ sơ ĐANG TRONG LUỒNG → KHÔNG có nút, và câu chữ nói về luật đóng băng.
 *
 * Chỉ kiểm vế đầu thì bày nút cho cả người duyệt vẫn xanh — mà đó đúng là chỗ
 * hỏng nặng nhất: một hồ sơ đang chờ chữ ký bị sửa số dưới tay người sắp ký.
 */
describe('`0194` khối chênh lệch trên trang hồ sơ', () => {
  const TDV_MO = {
    ...TBP,
    user: { ...TBP.user, id: '11111111-1111-1111-1111-111111111111', username: 'tdv01', role: 'TDV' },
  };

  const LECH = [
    { kind: 'PRICE', productCode: 'NC-GOLD-900', snapValue: '100000', newValue: '120000' },
    { kind: 'RULE', productCode: 'NC-GOLD-900', snapValue: '15.00', newValue: null },
  ];

  /** Hồ sơ CÒN SỬA ĐƯỢC, mở bằng phiên TDV. */
  const moSuaDuoc = async (lech: unknown[] = LECH) => {
    localStorage.setItem('csbh:phien', JSON.stringify(TDV_MO));
    return mo({ ...HO_SO, status: 'YEU_CAU_CHINH_SUA', lech }, ['RESUBMIT_AFTER_EDIT']);
  };

  const nutCapNhat = () => screen.queryByRole('button', { name: /Tự động cập nhật/ });

  it('hồ sơ SỬA ĐƯỢC: có khối, có nút, và bảng lệch nói đủ hai chiều', async () => {
    await moSuaDuoc();
    const khoi = document.querySelector('.canh-bao-lech') as HTMLElement;
    expect(khoi, 'không có khối chênh lệch').not.toBeNull();
    expect(nutCapNhat()).not.toBeNull();
    // Bảng lệch dựng ra, và nói được cả ca "không còn quy định nào".
    expect(khoi.textContent).toContain('NC-GOLD-900');
    expect(khoi.textContent).toContain('không còn quy định nào');
  });

  it('hồ sơ SỬA ĐƯỢC: câu chữ hứa GIỮ NGUYÊN giá bán buôn và CPBH', async () => {
    /*
     * Vế này là ranh giới của cả tính năng. Người dùng sắp bấm một nút tên *Tự
     * động cập nhật* trên một bảng có mười cột số, mà chỉ ba cột trong đó bị
     * đụng tới — không nói ra thì họ phải bấm rồi mới biết mình mất gì.
     */
    await moSuaDuoc();
    const khoi = document.querySelector('.canh-bao-lech') as HTMLElement;
    expect(khoi.textContent).toContain('giá bán buôn và các khoản CPBH bạn đã nhập giữ nguyên');
    // Và KHÔNG còn câu của hồ sơ đóng băng — nó mâu thuẫn với cái nút bên dưới.
    expect(khoi.textContent).not.toContain('đang chờ chữ ký');
  });

  it('hồ sơ ĐANG TRONG LUỒNG: có khối nhưng KHÔNG có nút', async () => {
    // Chiều đối chiếu, và là chiều quan trọng hơn: `mustEdit` bên máy chủ vẫn
    // chặn, nhưng bày ra một nút bấm vào là 409 thì người duyệt sẽ thử.
    await mo({ ...HO_SO, status: 'CHO_TBP_DUYET', lech: LECH }, ['TBP_SIGN']);
    expect(document.querySelector('.canh-bao-lech')).not.toBeNull();
    expect(nutCapNhat()).toBeNull();
    expect(document.querySelector('.canh-bao-lech')!.textContent).toContain('đóng băng');
  });

  it('không lệch gì thì KHÔNG vẽ khối, kể cả khi sửa được', async () => {
    await moSuaDuoc([]);
    expect(document.querySelector('.canh-bao-lech')).toBeNull();
    expect(nutCapNhat()).toBeNull();
  });

  it('bấm nút thì gọi ĐÚNG đường máy chủ, rồi TẢI LẠI hồ sơ', async () => {
    /*
     * Tải lại chứ không sửa tại chỗ: lượt gọi này đổi giá, ngưỡng, tỷ lệ CK và
     * trạng thái của nhiều dòng cùng lúc, mà những con số ấy do MÁY CHỦ tính.
     * Dựng lại chúng ở giao diện là chép phép tính sang đây (`FE-27`).
     */
    const f = await moSuaDuoc();
    const truoc = f.mock.calls.filter((c) => /\/policies\/hs-1$/.test(String(c[0]))).length;

    fireEvent.click(nutCapNhat()!);
    await waitFor(() =>
      expect(
        f.mock.calls.some((c) => String(c[0]).includes('/policies/hs-1/ap-dung-thay-doi')),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        f.mock.calls.filter((c) => /\/policies\/hs-1$/.test(String(c[0]))).length,
      ).toBeGreaterThan(truoc),
    );
  });

  it('KHÔNG tự ẩn khối ở giao diện — máy chủ mới biết còn lệch gì', async () => {
    /*
     * Ẩn bằng tay thì nói dối ở đúng ca có dòng KHÔNG áp được (sản phẩm đã vô
     * hiệu hoá): khối biến mất trong khi chênh lệch vẫn còn nguyên, và người
     * dùng tưởng đã xong.
     */
    const ma = readFileSync('apps/web/src/pages/ChiTietHoSo.tsx', 'utf8');
    const than = ma.slice(ma.indexOf('const apDungThayDoi'), ma.indexOf('const xoaDong'));
    expect(than).toContain('taiLai()');
    expect(than).not.toMatch(/datLech|datHoSo\(/);
  });

  /**
   * `0199` — LƯỢT BẤM BỎ LẠI GÌ THÌ PHẢI NÓI RA.
   *
   * Máy chủ trả `hong` từ `0194` và giao diện vứt nó đi, nên người dùng bấm nút,
   * chờ, trang tải lại — khối nằm y nguyên và không một chữ nào nói vì sao. Đúng
   * chỗ ấy khách hàng đã chốt điều ngược lại: *"sau khi cập nhật xong phần thông
   * tin yêu cầu thay đổi sẽ biến mất"*. Nó không biến mất được thì phải có lý do
   * đọc được, nếu không người dùng chỉ biết là nút hỏng.
   */
  const bamVoiKetQua = async (than: unknown) => {
    await moSuaDuoc();
    const goc = globalThis.fetch as (d: unknown, o?: unknown) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn((d: unknown, o?: unknown) =>
        String(d).includes('/ap-dung-thay-doi') ? Promise.resolve(json(than)) : goc(d, o),
      ),
    );
    fireEvent.click(nutCapNhat()!);
  };

  it('`0199` dòng KHÔNG áp được thì nói ra TÊN mặt hàng', async () => {
    await bamVoiKetQua({ hong: ['NC-GOLD-900'], conLai: 2 });
    const khoi = await waitFor(() => {
      const k = document.querySelector('.canh-bao-lech') as HTMLElement;
      expect(k.textContent).toContain('chưa cập nhật được');
      return k;
    });
    // Tên mặt hàng chứ không phải một con số trần: khối bên dưới có thể nhiều
    // dòng, và "1 mặt hàng" không nói được là dòng nào.
    expect(khoi.textContent).toContain('NC-GOLD-900');
    expect(khoi.textContent).toContain('1 mặt hàng');
  });

  it('`0200` mặt hàng bị RÚT thì nói ra, và câu ấy sống NGOÀI khối lệch', async () => {
    /*
     * Ngược với câu *"chưa cập nhật được"* của `0199`, thứ sống được bên trong
     * khối nhờ một bất biến. Ở đây thì rút xong là mục `PRODUCT` của chính mặt
     * hàng ấy biến mất — nếu nó là mục lệch duy nhất thì CẢ KHỐI biến mất, và
     * một câu nằm trong khối sẽ biến mất theo đúng lượt nó cần nói nhất.
     *
     * Ca này dựng đúng tình huống ấy: máy chủ trả `daRut` rồi lượt tải lại trả
     * về một hồ sơ KHÔNG còn chênh lệch nào.
     */
    await moSuaDuoc();
    const goc = globalThis.fetch as (d: unknown, o?: unknown) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn((d: unknown, o?: RequestInit) => {
        const duong = String(d);
        if (duong.includes('/ap-dung-thay-doi')) {
          return Promise.resolve(json({ hong: [], daRut: ['NC-GOLD-900'], conLai: 0 }));
        }
        // Hồ sơ sau khi áp: SẠCH, nên khối chênh lệch không còn được vẽ.
        if (/\/policies\/hs-1$/.test(duong)) {
          return Promise.resolve(json({ ...HO_SO, status: 'YEU_CAU_CHINH_SUA', lech: [] }));
        }
        return goc(d, o);
      }),
    );

    fireEvent.click(nutCapNhat()!);
    // ĐỢI CẢ HAI trong một `waitFor`: câu *Đã rút* đặt ngay lúc phản hồi về, còn
    // khối lệch chỉ biến mất sau lượt TẢI LẠI — hai mốc khác nhau, và khẳng định
    // mốc sau ngay sau khi mốc trước tới là bắt được trạng thái giữa chừng.
    await waitFor(() => {
      expect(document.body.textContent).toContain('Đã rút');
      expect(document.querySelector('.canh-bao-lech'), 'khối lệch phải biến mất').toBeNull();
    });
    expect(document.body.textContent).toContain('NC-GOLD-900');
  });

  it('`0199` áp được HẾT thì KHÔNG thêm câu nào', async () => {
    /*
     * Chiều đối chiếu, và nó là chiều dễ mất: khối biến mất ĐÃ LÀ câu trả lời
     * (`0194`). Thêm một dòng chữ vào lượt trơn tru là doạ người dùng về một việc
     * vừa xong xuôi.
     */
    await bamVoiKetQua({ hong: [], conLai: 0 });
    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
          String(c[0]).includes('/ap-dung-thay-doi'),
        ),
      ).toBe(true),
    );
    expect(document.body.textContent).not.toContain('chưa cập nhật được');
  });
});

/**
 * `0198` — sửa MÃ HỒ SƠ ngay tại tiêu đề, khi hồ sơ còn ở *Nháp*.
 *
 * Khách hàng chốt 10/09: *"để một biểu tượng edit ngay tại tiêu đề Mã hồ sơ,
 * sửa xong có dấu tick để lưu"*.
 *
 * Phiên mặc định của tệp này là TBP, còn bút chì chỉ của TDV — nên mọi ca ở đây
 * đăng nhập lại bằng TDV, và chính điều đó cho một ca đối chiếu rẻ tiền.
 */
describe('`0198` sửa mã hồ sơ tại tiêu đề', () => {
  const TDV = {
    ...TBP,
    user: { ...TBP.user, id: 'tdv-1', username: 'tdv01', role: 'TDV' },
  };
  const laTdv = () => localStorage.setItem('csbh:phien', JSON.stringify(TDV));

  /** Hồ sơ Nháp mà TDV này sửa được — `SUBMIT` là dấu hiệu của đúng tổ hợp ấy. */
  const nhap = { ...HO_SO, status: 'NHAP' };
  const CHO_PHEP_NHAP = ['SUBMIT'];

  const but = () => screen.queryByRole('button', { name: 'Sửa mã hồ sơ' });

  it('hồ sơ NHÁP của chính TDV thì có bút chì', async () => {
    laTdv();
    await mo(nhap, CHO_PHEP_NHAP);
    expect(but()).not.toBeNull();
  });

  it('hồ sơ ĐÃ GỬI DUYỆT thì KHÔNG có bút chì', async () => {
    /*
     * Vế `NHAP` của điều kiện, tách khỏi vế "TDV sửa được". Máy chủ chặn cùng
     * luật ở `doiMa`, nên ca này canh cho giao diện đừng bày ra một cái nút bấm
     * vào sẽ nhận `409`.
     */
    laTdv();
    await mo({ ...HO_SO, status: 'CHO_TBP_DUYET' }, ['TBP_SIGN']);
    expect(but()).toBeNull();
  });

  it('hồ sơ ở YÊU CẦU CHỈNH SỬA cũng KHÔNG có bút chì', async () => {
    // Ranh giới đắt nhất: hồ sơ này SỬA ĐƯỢC (có `RESUBMIT_AFTER_EDIT`), nên một
    // điều kiện viết bằng "TDV sửa được hồ sơ" sẽ bày bút chì ra ở đây.
    laTdv();
    await mo({ ...HO_SO, status: 'YEU_CAU_CHINH_SUA' }, ['RESUBMIT_AFTER_EDIT']);
    expect(but()).toBeNull();
  });

  it('vai trò KHÁC không thấy bút chì, dù hồ sơ đang ở Nháp', async () => {
    // Phiên mặc định của tệp là TBP.
    await mo(nhap, CHO_PHEP_NHAP);
    expect(but()).toBeNull();
  });

  it('bấm bút chì → ô nhập mang sẵn mã cũ; dấu tick gửi PATCH đúng đường', async () => {
    laTdv();
    const f = await mo(nhap, CHO_PHEP_NHAP);
    fireEvent.click(but()!);

    const o = screen.getByLabelText('Mã hồ sơ') as HTMLInputElement;
    expect(o.value, 'ô phải mang sẵn mã đang có, không phải ô trống').toBe(HO_SO.code);

    fireEvent.change(o, { target: { value: 'CSBH-TU-GO-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mã hồ sơ' }));

    await waitFor(() => {
      const goi = f.mock.calls.find(
        (c) =>
          String(c[0]).endsWith('/policies/hs-1/ma') &&
          (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(goi, 'không thấy lượt PATCH .../ma').toBeDefined();
      expect(JSON.parse(String((goi![1] as RequestInit).body)).code).toBe('CSBH-TU-GO-01');
    });
  });

  it('Escape huỷ mà KHÔNG gửi gì', async () => {
    // Phím này là đường thoát của người dùng bàn phím. Thiếu nó thì họ phải đi
    // tìm nút *Huỷ* bằng Tab, ở một ô nhập chỉ có ba phần tử.
    laTdv();
    const f = await mo(nhap, CHO_PHEP_NHAP);
    fireEvent.click(but()!);
    const o = screen.getByLabelText('Mã hồ sơ');
    fireEvent.change(o, { target: { value: 'CSBH-BO-DI' } });
    fireEvent.keyDown(o, { key: 'Escape' });

    await waitFor(() => expect(but()).not.toBeNull());
    expect(
      f.mock.calls.some((c) => String(c[0]).endsWith('/ma')),
      'Escape mà vẫn gửi đi thì nó không phải nút huỷ',
    ).toBe(false);
  });

  it('máy chủ từ chối thì câu lỗi Ở LẠI cạnh ô, và ô KHÔNG đóng lại', async () => {
    /*
     * Hai vế, và vế thứ hai mới là vế dễ mất: đóng ô lại thì người dùng mất luôn
     * chuỗi vừa gõ, và phải nhớ lại mình đã gõ gì để sửa. Câu lỗi ở đây nói về
     * chính chuỗi ấy (`0088`, dạng `o-nhap`).
     */
    laTdv();
    const f = await mo(nhap, CHO_PHEP_NHAP);
    f.mockImplementation((duong: unknown, tuyChon?: unknown) => {
      const d = String(duong);
      if (d.endsWith('/ma') && (tuyChon as RequestInit | undefined)?.method === 'PATCH') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ code: 'POLICY_CODE_TAKEN', message: 'Mã hồ sơ này đã có hồ sơ khác dùng.' }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      if (d.includes('/auth/me')) return Promise.resolve(toiLaAi());
      if (d.includes('/allowed-actions')) return Promise.resolve(json({ allowed: CHO_PHEP_NHAP }));
      if (d.includes('/documents') || d.includes('/files')) return Promise.resolve(json([]));
      if (d.includes('/events')) return Promise.resolve(json(LICH_SU));
      return Promise.resolve(json(nhap));
    });

    fireEvent.click(but()!);
    fireEvent.change(screen.getByLabelText('Mã hồ sơ'), { target: { value: 'CSBH-TRUNG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mã hồ sơ' }));

    await waitFor(() => expect(screen.getByText(/đã có hồ sơ khác dùng/)).toBeDefined());
    expect(
      (screen.getByLabelText('Mã hồ sơ') as HTMLInputElement).value,
      'chuỗi vừa gõ phải còn nguyên',
    ).toBe('CSBH-TRUNG');
  });
});

/**
 * `0223` — TÊN HAI NÚT của việc thêm sản phẩm (khách hàng chốt 27/09).
 *
 * Nút trên bảng là *Thêm sản phẩm* (đã vậy từ P119 — ca này ghim nó, vì chưa ca
 * nào canh); nút chốt trong hộp thoại đổi *Thêm dòng* → *Xác nhận*. Dựng TRANG
 * THẬT chứ không dựng riêng hộp thoại: câu hỏi là người dùng đi từ nút nào tới
 * nút nào.
 */
describe('`0223` nút thêm sản phẩm', () => {
  it('bảng có nút Thêm sản phẩm, hộp thoại chốt bằng Xác nhận — không còn chữ Thêm dòng', async () => {
    localStorage.setItem(
      'csbh:phien',
      JSON.stringify({
        ...TBP,
        user: { ...TBP.user, id: '11111111-1111-1111-1111-111111111111', username: 'tdv01', role: 'TDV' },
      }),
    );
    await mo({ ...HO_SO, status: 'NHAP' }, ['SUBMIT']);
    expect(screen.queryByRole('button', { name: /Thêm dòng/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm sản phẩm' }));
    const hop = await screen.findByRole('dialog');
    expect(within(hop).getByRole('button', { name: 'Xác nhận' })).toBeDefined();
    expect(within(hop).queryByRole('button', { name: /Thêm dòng/ })).toBeNull();
  });
});

/**
 * `0224` — SỬA THÔNG TIN KHÁCH HÀNG NGAY TRÊN TRANG HỒ SƠ.
 *
 * Khách hàng báo 28/09: hồ sơ bị trả về thì TDV *"chưa sửa được thông tin
 * chung"*. Máy chủ bỏ đóng băng lúc trả về (ca ở `contract.test.ts`); ở đây là
 * nửa giao diện — nút mở CHÍNH biểu mẫu của trang Khách hàng, lưu xong tải lại
 * hồ sơ. Điều kiện bày nút là `dangSua` của trang: máy chủ cho sửa VÀ vai trò có
 * quyền — nên mỗi vế có một ca phá riêng.
 */
describe('`0224` sửa thông tin khách hàng tại trang hồ sơ', () => {
  const TDV = {
    ...TBP,
    user: { ...TBP.user, id: 'tdv-1', username: 'tdv01', role: 'TDV' },
  };
  const laTdv = () => localStorage.setItem('csbh:phien', JSON.stringify(TDV));
  const traVe = { ...HO_SO, status: 'YEU_CAU_CHINH_SUA' };

  /** Bản ĐẦY ĐỦ của khách hàng — đủ để nút Lưu của biểu mẫu sáng. */
  const KHACH = {
    id: 'kh-1',
    code: 'KH-000123',
    name: 'Cong ty TNHH Duoc pham ABC',
    customerType: 2,
    registeredAddress: 'Số 12 ngõ 5, Phường Láng Hạ, Hà Nội',
    deliveryAddress: null,
    province: 'Hà Nội',
    streetWard: 'Số 12 ngõ 5, Phường Láng Hạ',
    registeredAddresses: [],
    deliveryAddresses: [],
    ownerName: 'Nguyen Thi Dai Dien',
    ownerTitle: 'Giám đốc',
    phone: '0912345678',
    idNumber: '0101234567',
    debt: 'Thanh toán gối đơn, công nợ không quá 90 ngày',
    debtTerm: 'GOI_DON_90',
    debtNote: null,
    tdvUserId: 'tdv-1',
    status: 'DANG_HOP_TAC',
  };

  const nut = () => screen.queryByRole('button', { name: 'Sửa thông tin khách hàng' });

  /** `chan()` của tệp trả HỒ SƠ cho mọi đường lạ — kể cả `/customers/kh-1`. */
  const chanCoKhach = (hoSo: unknown, choPhep: string[]) => {
    const f = chan(hoSo, choPhep);
    const goc = f.getMockImplementation()!;
    f.mockImplementation((duong: unknown, tuyChon?: unknown) => {
      const d = String(duong);
      if (d.includes('/customers/kiem-tra-mst')) return Promise.resolve(json({ trung: false }));
      if (d.endsWith('/customers/kh-1')) return Promise.resolve(json(KHACH));
      return goc(duong, tuyChon as never);
    });
    return f;
  };
  const moVoi = async (hoSo: unknown, choPhep: string[]) => {
    const f = chanCoKhach(hoSo, choPhep);
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

  it('hồ sơ BỊ TRẢ VỀ của chính TDV thì có nút, nằm trong khối Thông tin chung', async () => {
    laTdv();
    await moVoi(traVe, ['RESUBMIT_AFTER_EDIT']);
    await waitFor(() => expect(nut()).not.toBeNull());
    expect(khoiChung().contains(nut()), 'nút phải nằm trong khối Thông tin chung').toBe(true);
  });

  it('`0228` nút ghi *Sửa*, đứng NGANG TIÊU ĐỀ khối — không còn ở đuôi khối', async () => {
    // Chữ hiện rút gọn; tên cho trình đọc màn hình giữ đủ nghĩa vì trang còn
    // hai nút *Sửa* ở mỗi dòng sản phẩm (WCAG: nhãn chứa chữ hiện).
    laTdv();
    await moVoi(traVe, ['RESUBMIT_AFTER_EDIT']);
    await waitFor(() => expect(nut()).not.toBeNull());
    expect(nut()!.textContent).toBe('Sửa');
    const dau = khoiChung().querySelector('.dau-tom-tat')!;
    expect(dau.querySelector('h2')?.textContent).toBe('Thông tin chung');
    expect(dau.contains(nut())).toBe(true);
  });

  it('hồ sơ NHÁP cũng có nút — cùng một luật "sửa được"', async () => {
    laTdv();
    await moVoi({ ...HO_SO, status: 'NHAP' }, ['SUBMIT']);
    await waitFor(() => expect(nut()).not.toBeNull());
  });

  it('hồ sơ ĐANG DUYỆT thì KHÔNG có nút, dù người xem là TDV', async () => {
    // Vế "máy chủ cho sửa": `allowed-actions` của TDV ở bàn TBP là rỗng.
    laTdv();
    await moVoi(HO_SO, []);
    expect(nut()).toBeNull();
  });

  it('TBP mở hồ sơ bị trả về thì KHÔNG có nút', async () => {
    // Vế "vai trò": người duyệt thấy dữ liệu SỐNG (chốt 28/09) nhưng không sửa.
    await moVoi(traVe, []);
    expect(nut()).toBeNull();
  });

  it('bấm nút → tải khách hàng ĐẦY ĐỦ, mở biểu mẫu mang sẵn số cũ', async () => {
    laTdv();
    const f = await moVoi(traVe, ['RESUBMIT_AFTER_EDIT']);
    await waitFor(() => expect(nut()).not.toBeNull());
    fireEvent.click(nut()!);

    const hop = await screen.findByRole('dialog');
    expect(within(hop).getByRole('heading').textContent).toBe(`Sửa ${KHACH.code}`);
    // Dựng từ `/customers/:id` chứ không từ `hoSo.khachHang`: khối ấy không
    // mang mã số thuế, nên dựng từ nó là lượt Lưu xoá trắng mã số thuế.
    expect(f.mock.calls.some((c) => String(c[0]).endsWith('/customers/kh-1'))).toBe(true);
    expect((within(hop).getByDisplayValue(KHACH.idNumber) as HTMLInputElement).value).toBe(
      KHACH.idNumber,
    );
  });

  it('Lưu → PATCH đúng khách hàng, đóng hộp và TẢI LẠI hồ sơ', async () => {
    laTdv();
    const f = await moVoi(traVe, ['RESUBMIT_AFTER_EDIT']);
    await waitFor(() => expect(nut()).not.toBeNull());
    fireEvent.click(nut()!);
    const hop = await screen.findByRole('dialog');

    const lanDocHoSo = () =>
      f.mock.calls.filter(
        (c) =>
          String(c[0]).endsWith('/policies/hs-1') &&
          ((c[1] as RequestInit | undefined)?.method ?? 'GET') === 'GET',
      ).length;
    const truoc = lanDocHoSo();

    fireEvent.change(within(hop).getByDisplayValue(KHACH.name), {
      target: { value: 'Nhà thuốc Tên Mới' },
    });
    fireEvent.click(within(hop).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const goi = f.mock.calls.find(
      (c) =>
        String(c[0]).endsWith('/customers/kh-1') &&
        (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(goi, 'không thấy lượt PATCH /customers/kh-1').toBeDefined();
    expect(JSON.parse(String((goi![1] as RequestInit).body)).name).toBe('Nhà thuốc Tên Mới');
    await waitFor(() =>
      expect(lanDocHoSo(), 'lưu xong phải đọc lại hồ sơ để khối hiện số mới').toBeGreaterThan(truoc),
    );
  });

  it('nút KHÔNG mở đường sửa mã hồ sơ (chốt 28/09)', async () => {
    // Mã hồ sơ đứng ngoài "thông tin chung": ở `YEU_CAU_CHINH_SUA` bút chì của
    // `0198` vẫn vắng mặt, và biểu mẫu khách hàng không có ô nào mang mã hồ sơ.
    laTdv();
    await moVoi(traVe, ['RESUBMIT_AFTER_EDIT']);
    await waitFor(() => expect(nut()).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Sửa mã hồ sơ' })).toBeNull();
    fireEvent.click(nut()!);
    const hop = await screen.findByRole('dialog');
    expect(within(hop).queryByDisplayValue(HO_SO.code)).toBeNull();
  });
});
