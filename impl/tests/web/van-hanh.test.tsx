/**
 * @vitest-environment jsdom
 *
 * `0255` — trang Vận hành (giao diện). Chốt 05/11: phủ HẾT thao tác người dùng.
 *
 * `fetch` giả trả lời theo đường + phương thức và GHI LẠI mọi lượt gọi, để ca kiểm khẳng
 * định ĐÚNG request đi ra (đường, thân) chứ không chỉ "có gọi". Phía máy chủ của từng đường
 * có ca riêng ở `tests/http/van-hanh*.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { VanHanh } from '@csbh/web/van-hanh-ui';
import { BoDinhTuyen, useDuong } from '@csbh/web/router';
import { BaoLoiProvider } from '@csbh/web/bao-loi';
import {
  canhBao,
  coTep,
  docDongLog,
  kiemLich,
  moTaLich,
  thanLich,
  theTuHash,
  type SucKhoe,
} from '@csbh/web/van-hanh';

// --- Dữ liệu mẫu ---------------------------------------------------------------

const SK_TOT: SucKhoe = {
  thanhPhan: { ok: true, services: [{ service: 'policy', ok: true, status: 200 }, { service: 'identity', ok: true, status: 200 }] },
  hangDoiLoi: [{ hangDoi: 'thong-bao', so: 0 }, { hangDoi: 'tep', so: 0 }],
  suKienChoPhat: [{ nguon: 'pol', so: 0 }, { nguon: 'cus', so: 2 }],
  thuHong: 0,
  saoLuu: [
    { viec: 'SAO_LUU_CSDL', quaHan: false, lanThanhCong: '2026-11-05T18:15:00Z', lanGanNhat: 'THANH_CONG' },
    { viec: 'SAO_LUU_KHO_TEP', quaHan: false, lanThanhCong: '2026-11-05T19:00:00Z', lanGanNhat: 'THANH_CONG' },
  ],
  oDia: [{ o: 'du-lieu', phanTram: 40, vuotNguong: false, duBaoNgayDay: null }],
  tacTu: { online: true, lanCuoi: '2026-11-06T02:00:00Z' },
  container: ['postgres', 'redis', 'rabbitmq', 'minio', 'gotenberg', 'caddy'].map((service) => ({
    service,
    trangThai: 'running',
    sucKhoe: 'healthy',
    moTa: 'Up',
    luc: '2026-11-06T02:00:00Z',
  })),
};
const SK_XAU: SucKhoe = {
  ...SK_TOT,
  thanhPhan: { ok: false, services: [{ service: 'notification', ok: false, error: 'timeout' }] },
  hangDoiLoi: [{ hangDoi: 'thong-bao', so: 3 }],
  thuHong: 4,
  saoLuu: [
    { viec: 'SAO_LUU_CSDL', quaHan: true, lanThanhCong: null, lanGanNhat: null },
    { viec: 'SAO_LUU_KHO_TEP', quaHan: false, lanThanhCong: null, lanGanNhat: 'LOI' },
  ],
  oDia: [{ o: 'du-lieu', phanTram: 84.2, vuotNguong: true, duBaoNgayDay: 41 }],
  tacTu: { online: false, lanCuoi: null },
  container: [{ service: 'redis', trangThai: 'exited', sucKhoe: null, moTa: 'Exited (1)', luc: '2026-11-06T02:00:00Z' }],
};

const LICH = [
  { viec: 'SAO_LUU_CSDL', tanSuat: 'HANG_NGAY', gioChay: '01:15', thuTrongTuan: null, giuToiDa: 7, lanToi: '2026-11-06T18:15:00Z', lanGanNhat: { batDau: '2026-11-05T18:15:00Z', ketThuc: '2026-11-05T18:16:00Z', ketQua: 'THANH_CONG', tuDong: true, chiTiet: 'backup: xong' } },
  { viec: 'SAO_LUU_KHO_TEP', tanSuat: 'HANG_TUAN', gioChay: '02:00', thuTrongTuan: 3, giuToiDa: 7, lanToi: '2026-11-10T19:00:00Z', lanGanNhat: null },
  { viec: 'NEN_LOG', tanSuat: 'HANG_NGAY', gioChay: '00:15', thuTrongTuan: null, giuToiDa: 30, lanToi: '2026-11-06T17:15:00Z', lanGanNhat: null },
  { viec: 'DON_DU_LIEU', tanSuat: 'HANG_NGAY', gioChay: '03:00', thuTrongTuan: null, giuToiDa: null, lanToi: '2026-11-06T20:00:00Z', lanGanNhat: null },
];
const SAO_LUU = {
  csdl: [
    { ten: 'csbh-20261105T181500Z.dump', luc: '2026-11-05T18:15:00Z', co: 42_000_000, coBanSaoNgoai: true, moiNhat: true },
    { ten: 'csbh-20261104T181500Z.dump', luc: '2026-11-04T18:15:00Z', co: 41_000_000, coBanSaoNgoai: true, moiNhat: false },
  ],
  khoTep: [
    { moc: '20261105T190000Z', luc: '2026-11-05T19:00:00Z', soTep: 18402, chiemThem: 140_000_000, coBanSaoNgoai: false, moiNhat: true },
    { moc: '20261104T190000Z', luc: '2026-11-04T19:00:00Z', soTep: 18384, chiemThem: 96_000_000_000, coBanSaoNgoai: false, moiNhat: false },
  ],
};
const O_DIA = {
  theoO: [
    { o: 'du-lieu', tong: 200e9, dung: 168e9, conLai: 32e9, phanTram: 84, vuotNguong: true, duBaoNgayDay: 41 },
    { o: 'ban-sao-ngoai', tong: 500e9, dung: 110e9, conLai: 390e9, phanTram: 22, vuotNguong: false, duBaoNgayDay: null, cungODuLieu: true },
  ],
  theoHangMuc: [{ hangMuc: 'csdl', co: 4.1e9 }, { hangMuc: 'tep-log', co: 1.8e9 }],
  theoDocker: [{ ten: 'anh-docker', loai: 'ANH', co: 9.6e9, luc: '2026-11-06T02:00:00Z' }],
  nguong: 80,
  guiThu: true,
  lichSu: { 'du-lieu': [{ luc: '2026-11-05T00:00:00Z', dung: 160e9, tong: 200e9 }, { luc: '2026-11-06T00:00:00Z', dung: 168e9, tong: 200e9 }] },
};
const LOGS = {
  dangGhi: [{ ten: 'policy-2026-11-06.log', service: 'policy', ngay: '2026-11-06', co: 1000 }],
  daNen: [{ ten: 'log-2026-11-05.tar.gz', ngay: '2026-11-05', co: 6_100_000 }],
  giuToiDa: 30,
  tongCo: 6_101_000,
};

// --- fetch giả ---------------------------------------------------------------

type Goi = { url: string; method: string; body: unknown };
let goi: Goi[] = [];
let tl: Record<string, (g: Goi) => Response | undefined> = {};
let tacTu = { online: true, viec: [] as unknown[] };
let sk: SucKhoe = SK_TOT;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  goi = [];
  tl = {};
  tacTu = { online: true, viec: [] };
  sk = SK_TOT;
  window.history.replaceState(null, '', '/van-hanh');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input).replace(/^\/api/, '');
      const g: Goi = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
      goi.push(g);
      for (const [k, f] of Object.entries(tl)) {
        if (`${g.method} ${url}`.startsWith(k)) {
          const r = f(g);
          if (r) return Promise.resolve(r);
        }
      }
      if (g.method === 'GET' && url.startsWith('/van-hanh/suc-khoe')) return Promise.resolve(json(sk));
      if (g.method === 'GET' && url.startsWith('/van-hanh/lich')) return Promise.resolve(json(LICH));
      if (g.method === 'GET' && url.startsWith('/van-hanh/sao-luu')) return Promise.resolve(json(SAO_LUU));
      if (g.method === 'GET' && url.startsWith('/van-hanh/tac-tu')) return Promise.resolve(json(tacTu));
      if (g.method === 'GET' && url.startsWith('/van-hanh/o-dia')) return Promise.resolve(json(O_DIA));
      if (g.method === 'GET' && url === '/van-hanh/logs') return Promise.resolve(json(LOGS));
      if (g.method === 'GET' && url.startsWith('/van-hanh/lan-chay')) return Promise.resolve(json([]));
      if (g.method === 'GET' && url.startsWith('/notifications/dead-letters')) return Promise.resolve(json({ items: [], total: 0 }));
      if (g.method === 'GET' && url.startsWith('/sla/config')) return Promise.resolve(json({ days: 14, updatedAt: null, countsWeekends: true, remindDaysBefore: 2 }));
      if (g.method === 'GET' && url.startsWith('/audit/facets')) return Promise.resolve(json({ actions: [], entities: [], actors: [] }));
      if (g.method === 'GET' && url.startsWith('/audit/entries')) return Promise.resolve(json({ items: [], total: 0 }));
      if (g.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(json({}));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const moTrang = async (hash = '') => {
  window.history.replaceState(null, '', `/van-hanh${hash}`);
  // TRONG `BaoLoiProvider` như ứng dụng thật: ngoài provider `bao()` chỉ đọc lỗi, không
  // gọi `vaoO`, nên lỗi của một ô không bao giờ tới ô ấy (lượt chạy đầu đo được).
  render(
    <BaoLoiProvider>
      <VanHanh />
    </BaoLoiProvider>,
  );
};
const theDangMo = () => screen.getByRole('tab', { selected: true }).textContent;
const goiDen = (method: string, dau: string) => goi.filter((g) => g.method === method && g.url.startsWith(dau));

// =============================================================================
describe('`0255` phần thuần', () => {
  it('thẻ đọc từ #…; lạ hoặc rỗng → Sức khoẻ', () => {
    expect(theTuHash('#o-dia')).toBe('o-dia');
    expect(theTuHash('#thu-hang-doi')).toBe('thu-hang-doi');
    expect(theTuHash('#khong-co')).toBe('suc-khoe');
    expect(theTuHash('')).toBe('suc-khoe');
  });

  it('mô tả lịch cho bốn tần suất', () => {
    expect(moTaLich({ tanSuat: 'HANG_NGAY', gioChay: '01:15', thuTrongTuan: null })).toBe('Hằng ngày lúc 01:15');
    expect(moTaLich({ tanSuat: 'HANG_TUAN', gioChay: '02:00', thuTrongTuan: 7 })).toBe('Chủ nhật hằng tuần lúc 02:00');
    expect(moTaLich({ tanSuat: 'MOI_6_GIO', gioChay: '00:30', thuTrongTuan: null })).toBe('Mỗi 6 giờ, bắt đầu 00:30');
    expect(moTaLich({ tanSuat: 'MOI_12_GIO', gioChay: '06:00', thuTrongTuan: null })).toBe('Mỗi 12 giờ, bắt đầu 06:00');
  });

  it('kiểm biểu mẫu lịch: giờ, thứ, số bản giữ theo TỪNG việc', () => {
    const f = { tanSuat: 'HANG_NGAY' as const, gioChay: '01:15', thuTrongTuan: '', giuToiDa: '7' };
    expect(kiemLich('SAO_LUU_CSDL', f)).toEqual({});
    for (const g of ['1:15', '24:00', '01:60', 'ab:cd', '']) expect(kiemLich('SAO_LUU_CSDL', { ...f, gioChay: g })).toHaveProperty('gioChay');
    expect(kiemLich('SAO_LUU_CSDL', { ...f, tanSuat: 'HANG_TUAN' })).toHaveProperty('thuTrongTuan');
    expect(kiemLich('SAO_LUU_CSDL', { ...f, tanSuat: 'HANG_TUAN', thuTrongTuan: '3' })).toEqual({});
    for (const n of ['0', '61', 'abc', '1.5', '-1', '']) expect(kiemLich('SAO_LUU_CSDL', { ...f, giuToiDa: n }), n).toHaveProperty('giuToiDa');
    expect(kiemLich('NEN_LOG', { ...f, giuToiDa: '90' })).toEqual({});
    expect(kiemLich('NEN_LOG', { ...f, giuToiDa: '91' }).giuToiDa).toContain('từ 1 đến 90');
    expect(kiemLich('SAO_LUU_KHO_TEP', { ...f, giuToiDa: '61' }).giuToiDa).toContain('bản chụp');
    expect(kiemLich('DON_DU_LIEU', { ...f, giuToiDa: '' })).toEqual({}); // không có số giữ
  });

  it('thân gửi đi: việc chỉ-hằng-ngày luôn HANG_NGAY; hằng tuần mang thứ; dọn dữ liệu không mang số giữ', () => {
    const f = { tanSuat: 'HANG_TUAN' as const, gioChay: ' 01:15 ', thuTrongTuan: '3', giuToiDa: '9' };
    expect(thanLich('SAO_LUU_CSDL', f)).toEqual({ tanSuat: 'HANG_TUAN', gioChay: '01:15', thuTrongTuan: 3, giuToiDa: 9 });
    expect(thanLich('NEN_LOG', f)).toEqual({ tanSuat: 'HANG_NGAY', gioChay: '01:15', giuToiDa: 9 });
    expect(thanLich('DON_DU_LIEU', f)).toEqual({ tanSuat: 'HANG_NGAY', gioChay: '01:15' });
  });

  it('cỡ cho người đọc', () => {
    expect(coTep(0)).toBe('0 byte');
    expect(coTep(1536)).toBe('1,5 KB');
    expect(coTep(42 * 1024 * 1024)).toBe('42,0 MB');
    expect(coTep(150 * 1024 ** 3)).toBe('150 GB');
    expect(coTep(null)).toBe('—');
  });

  it('cảnh báo: hệ tốt → rỗng; hệ xấu → đủ mọi việc, ĐỎ trước VÀNG, mỗi việc dẫn đúng thẻ', () => {
    expect(canhBao(SK_TOT)).toEqual([]);
    const cb = canhBao(SK_XAU);
    expect(cb.map((c) => [c.muc, c.the])).toEqual([
      ['do', 'suc-khoe'],
      ['do', 'sao-luu'],
      ['do', 'sao-luu'],
      ['vang', 'o-dia'],
      ['vang', 'thu-hang-doi'],
      ['vang', 'thu-hang-doi'],
      ['vang', 'sao-luu'],
    ]);
    // Tên tiếng Anh đúng của thành phần (chốt 06/11), không tên tiếng Việt tự đặt.
    expect(cb[0]!.cau).toBe('Không trả lời: notification, redis. Báo người vận hành máy chủ.');
    expect(cb[1]!.cau).toContain('cơ sở dữ liệu chưa chạy đúng lịch');
    expect(cb[2]!.cau).toContain('kho tệp gần nhất bị hỏng');
    expect(cb[3]!.cau).toBe('Ổ dữ liệu đã dùng 84,2% — đầy sau khoảng 41 ngày nếu giữ tốc độ hiện tại.');
    expect(cb[4]!.cau).toContain('4 thư');
    expect(cb[5]!.cau).toContain('3 sự kiện');
    expect(cb[6]!.cau).toContain('Sao lưu theo lịch vẫn chạy');
  });

  it('đọc dòng log: JSON của service, dòng thô của nền tảng, chuỗi lạ', () => {
    expect(docDongLog(JSON.stringify({ t: '2026-11-06T02:41:02Z', muc: 'error', traceId: '7f3c2a91', msg: 'hỏng', stack: 'at x' }))).toEqual({
      luc: '2026-11-06T02:41:02Z',
      muc: 'loi',
      traceId: '7f3c2a91',
      noiDung: 'hỏng\nat x',
    });
    expect(docDongLog(JSON.stringify({ t: 'x', muc: 'warn', msg: 'chậm' })).muc).toBe('canh-bao');
    expect(docDongLog('2026-11-06T05:45:59.601Z LOG:  starting PostgreSQL')).toEqual({
      luc: '2026-11-06T05:45:59.601Z',
      muc: 'thuong',
      traceId: null,
      noiDung: 'LOG:  starting PostgreSQL',
    });
    expect(docDongLog('rác không đọc được').noiDung).toBe('rác không đọc được');
  });
});

// =============================================================================
describe('`0255` thẻ và địa chỉ', () => {
  it('mặc định Sức khoẻ; hệ tốt → một câu "bình thường", không danh sách cảnh báo, nhãn thẻ không đếm', async () => {
    await moTrang();
    await screen.findByText('Mọi thứ đang hoạt động bình thường.');
    expect(theDangMo()).toBe('Sức khoẻ');
    expect(screen.queryByRole('list', { name: 'Việc cần chú ý' })).toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Sức khoẻ', 'Ổ đĩa', 'Sao lưu', 'Tệp log', 'Thư & hàng đợi', 'Lịch tự động',
    ]);
  });

  it('địa chỉ /van-hanh#o-dia (liên kết của thư cảnh báo) mở thẳng thẻ Ổ đĩa', async () => {
    await moTrang('#o-dia');
    await screen.findByText('Theo ổ');
    expect(theDangMo()).toBe('Ổ đĩa');
  });

  it('bấm thẻ → đổi `#` bằng replaceState (không thêm bước Quay lại)', async () => {
    await moTrang();
    const dai = window.history.length;
    fireEvent.click(screen.getByRole('tab', { name: 'Lịch tự động' }));
    expect(window.location.hash).toBe('#lich-tu-dong');
    expect(window.history.length).toBe(dai);
  });

  it('hệ có chuyện → nhãn thẻ đếm số việc; bấm Xem ở một việc mở đúng thẻ', async () => {
    sk = SK_XAU;
    await moTrang();
    const ds = await screen.findByRole('list', { name: 'Việc cần chú ý' });
    expect(within(ds).getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByRole('tab', { name: /Sức khoẻ/ }).textContent).toContain('7');
    const dong = within(ds).getByText(/Ổ dữ liệu đã dùng/).closest('li')!;
    fireEvent.click(within(dong as HTMLElement).getByRole('button', { name: 'Xem' }));
    expect(theDangMo()).toBe('Ổ đĩa');
    expect(window.location.hash).toBe('#o-dia');
  });

  it('bảng thành phần: dịch vụ không trả lời và nền tảng không chạy là ĐỎ; nền tảng chưa có số liệu là xám', async () => {
    sk = SK_XAU;
    await moTrang();
    const bang = await screen.findByRole('region', { name: 'Thành phần hệ thống' });
    const dong = (ten: string) => within(bang).getByText(ten).closest('tr')!;
    expect(dong('notification').textContent).toContain('không trả lời');
    expect(dong('redis').textContent).toContain('không chạy');
    expect(dong('postgres').textContent).toContain('chưa có số liệu');
    // Chỉ tên tiếng Anh — không còn tên tiếng Việt tự đặt nào trong cột (chốt 06/11).
    const ten = within(bang).getAllByRole('row').slice(1).map((r) => (r as HTMLTableRowElement).cells[0]!.textContent);
    expect(ten).toEqual(['notification', 'postgres', 'redis', 'rabbitmq', 'minio', 'gotenberg', 'caddy']);
  });

  it('không tải được Sức khoẻ → khối lỗi có nút thử lại, không trang trắng', async () => {
    tl['GET /van-hanh/suc-khoe'] = () => json({ code: 'X', message: 'hỏng' }, 500);
    await moTrang();
    await screen.findByRole('button', { name: /Thử lại/ });
  });
});

// =============================================================================
describe('`0255` Ổ đĩa', () => {
  it('hai ổ có mức dùng; bản sao ngoài CÙNG ổ với dữ liệu thì nói ra; hạng mục có "Bản cài phần mềm"', async () => {
    await moTrang('#o-dia');
    const meter = await screen.findAllByRole('meter');
    expect(meter.map((m) => m.getAttribute('aria-valuenow'))).toEqual(['84', '22']);
    expect(screen.getByText(/Vượt ngưỡng 80% · đầy sau khoảng 41 ngày/)).toBeDefined();
    expect(screen.getByText(/nằm CÙNG ổ với dữ liệu/)).toBeDefined();
    expect(screen.getByText('Bản cài phần mềm')).toBeDefined();
  });

  it.each(['0', '100', 'abc', '1.5'])('ngưỡng "%s" → lỗi dưới ô, KHÔNG gửi gì', async (v) => {
    await moTrang('#o-dia');
    const o = await screen.findByLabelText(/Cảnh báo khi ổ dùng từ/);
    fireEvent.change(o, { target: { value: v } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Ngưỡng phải là số nguyên từ 1 đến 99.');
    expect(goiDen('PUT', '/van-hanh/o-dia')).toHaveLength(0);
  });

  it('ngưỡng hợp lệ + tắt thư → PUT đúng thân, báo đã lưu', async () => {
    tl['PUT /van-hanh/o-dia/nguong'] = () => json({ nguong: 70, guiThu: false, dangVuot: false });
    await moTrang('#o-dia');
    fireEvent.change(await screen.findByLabelText(/Cảnh báo khi ổ dùng từ/), { target: { value: '70' } });
    fireEvent.click(screen.getByLabelText('Gửi thư cho Quản trị khi vượt ngưỡng'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Đã lưu ngưỡng cảnh báo.');
    expect(goiDen('PUT', '/van-hanh/o-dia/nguong')[0]!.body).toEqual({ nguong: 70, guiThu: false });
  });
});

// =============================================================================
describe('`0255` Sao lưu', () => {
  const bangCsdl = async () => screen.findByRole('region', { name: 'Bản sao lưu cơ sở dữ liệu' });

  it('bản mới nhất không có nút Xoá; bản chụp kho tệp không có nút Tải; không chữ "dump" nào lộ ra', async () => {
    await moTrang('#sao-luu');
    const b = await bangCsdl();
    const dong = within(b).getAllByRole('row').slice(1);
    expect(within(dong[0]!).queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(within(dong[0]!).getByText('mới nhất')).toBeDefined();
    expect(within(dong[1]!).getByRole('button', { name: 'Xoá' })).toBeDefined();
    const kho = screen.getByRole('region', { name: 'Bản chụp kho tệp' });
    expect(within(kho).queryByRole('button', { name: 'Tải' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/dump/i);
  });

  it('Xoá bản cũ → hộp xác nhận; tick "cả bản sao ngoài" → DELETE mang ?caBanSaoNgoai=1, rồi tải lại danh sách', async () => {
    await moTrang('#sao-luu');
    const b = await bangCsdl();
    fireEvent.click(within(within(b).getAllByRole('row')[2]!).getByRole('button', { name: 'Xoá' }));
    const hop = await screen.findByRole('dialog');
    fireEvent.click(within(hop).getByLabelText('Xoá cả bản ở bản sao ngoài'));
    const truoc = goiDen('GET', '/van-hanh/sao-luu').length;
    fireEvent.click(within(hop).getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(goiDen('DELETE', '/van-hanh/sao-luu')).toHaveLength(1));
    expect(goiDen('DELETE', '/van-hanh/sao-luu')[0]!.url).toBe('/van-hanh/sao-luu/csdl/csbh-20261104T181500Z.dump?caBanSaoNgoai=1');
    await waitFor(() => expect(goiDen('GET', '/van-hanh/sao-luu').length).toBeGreaterThan(truoc));
  });

  it('Xoá KHÔNG tick → không mang tham số; Huỷ → không gửi gì', async () => {
    await moTrang('#sao-luu');
    const b = await bangCsdl();
    fireEvent.click(within(within(b).getAllByRole('row')[2]!).getByRole('button', { name: 'Xoá' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Huỷ' }));
    expect(goiDen('DELETE', '/')).toHaveLength(0);
    fireEvent.click(within(within(b).getAllByRole('row')[2]!).getByRole('button', { name: 'Xoá' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(goiDen('DELETE', '/')).toHaveLength(1));
    expect(goiDen('DELETE', '/')[0]!.url).toBe('/van-hanh/sao-luu/csdl/csbh-20261104T181500Z.dump');
  });

  it('bản chụp kho tệp không có ở bản sao ngoài → hộp xác nhận KHÔNG bày ô "cả bản sao ngoài"', async () => {
    await moTrang('#sao-luu');
    const kho = await screen.findByRole('region', { name: 'Bản chụp kho tệp' });
    fireEvent.click(within(within(kho).getAllByRole('row')[2]!).getByRole('button', { name: 'Xoá' }));
    const hop = await screen.findByRole('dialog');
    expect(within(hop).queryByLabelText('Xoá cả bản ở bản sao ngoài')).toBeNull();
    fireEvent.click(within(hop).getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(goiDen('DELETE', '/')[0]?.url).toBe('/van-hanh/sao-luu/kho-tep/20261104T190000Z'));
  });

  it('Tải → gọi đúng đường tải của bản ấy', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    tl['GET /van-hanh/sao-luu/csdl/'] = () =>
      new Response('PGDMP', { status: 200, headers: { 'content-disposition': 'attachment; filename="csbh-sao-luu-x.backup"' } });
    await moTrang('#sao-luu');
    const b = await bangCsdl();
    fireEvent.click(within(within(b).getAllByRole('row')[1]!).getByRole('button', { name: 'Tải' }));
    await waitFor(() => expect(goiDen('GET', '/van-hanh/sao-luu/csdl/csbh-20261105T181500Z.dump/tai')).toHaveLength(1));
  });

  it('máy chủ mất liên lạc → hai nút Sao lưu ngay XÁM và có dòng chữ nói vì sao (không chỉ title)', async () => {
    tacTu = { online: false, viec: [] };
    await moTrang('#sao-luu');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Sao lưu ngay' }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole('button', { name: 'Sao lưu kho tệp ngay' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/Máy chủ chưa sẵn sàng nhận lệnh/)).toHaveLength(2);
  });

  it('Sao lưu ngay → POST đúng loại; theo dõi tới khi xong; xong thì tải lại danh sách', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let lan = 0;
    tl['POST /van-hanh/sao-luu/chay-ngay'] = (g) =>
      json({ id: '5', loai: (g.body as { loai: string }).loai === 'CSDL' ? 'SAO_LUU_CSDL' : 'SAO_LUU_KHO_TEP', trangThai: 'CHO', taoLuc: 'x', ketThuc: null, chiTiet: null }, 202);
    tl['GET /van-hanh/viec/5'] = () =>
      ++lan < 2
        ? json({ id: '5', loai: 'SAO_LUU_CSDL', trangThai: 'DANG_CHAY', taoLuc: 'x', ketThuc: null, chiTiet: null })
        : json({ id: '5', loai: 'SAO_LUU_CSDL', trangThai: 'THANH_CONG', taoLuc: 'x', ketThuc: '2026-11-06T04:00:00Z', chiTiet: 'ok' });
    await moTrang('#sao-luu');
    const nut = await screen.findByRole('button', { name: 'Sao lưu ngay' });
    await waitFor(() => expect((nut as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(nut);
    await screen.findByText('Đã gửi lệnh, máy chủ sắp bắt đầu…');
    expect(goiDen('POST', '/van-hanh/sao-luu/chay-ngay')[0]!.body).toEqual({ loai: 'CSDL' });
    const truoc = goiDen('GET', '/van-hanh/sao-luu').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await screen.findByText('Đang sao lưu, có thể mất vài phút…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await screen.findByText(/Sao lưu xong lúc/);
    await waitFor(() => expect(goiDen('GET', '/van-hanh/sao-luu').length).toBeGreaterThan(truoc));
  });

  it('việc hỏng → nhãn "không thành công" + nút xem chi tiết mở đúng đầu ra', async () => {
    tacTu = { online: true, viec: [{ id: '9', loai: 'SAO_LUU_KHO_TEP', trangThai: 'DANG_CHAY', taoLuc: 'x', ketThuc: null, chiTiet: null }] };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    tl['GET /van-hanh/viec/9'] = () => json({ id: '9', loai: 'SAO_LUU_KHO_TEP', trangThai: 'LOI', taoLuc: 'x', ketThuc: 'y', chiTiet: 'mc: hỏng' });
    await moTrang('#sao-luu');
    // Mở trang giữa lúc việc đang chạy → tự theo dõi tiếp.
    await screen.findByText('Đang sao lưu, có thể mất vài phút…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết' }));
    expect(within(await screen.findByRole('dialog')).getByText('mc: hỏng')).toBeDefined();
  });

  it('bấm trùng (máy chủ 409 JOB_RUNNING) → hộp lỗi bằng câu tiếng Việt, nút vẫn dùng được', async () => {
    tl['POST /van-hanh/sao-luu/chay-ngay'] = () => json({ code: 'JOB_RUNNING', message: 'x' }, 409);
    await moTrang('#sao-luu');
    const nut = await screen.findByRole('button', { name: 'Sao lưu ngay' });
    await waitFor(() => expect((nut as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(nut);
    await screen.findByText('Đang có một lượt sao lưu loại này. Đợi lượt ấy xong rồi thử lại.');
    expect((nut as HTMLButtonElement).disabled).toBe(false);
  });
});

// =============================================================================
describe('`0255` lịch tự động ngay trong thẻ (chốt 05/11: phải nhìn thấy)', () => {
  it('thẻ Sao lưu bày lịch của cả hai việc; hằng tuần hiện ô Thứ', async () => {
    await moTrang('#sao-luu');
    await screen.findByText(/Hằng ngày lúc 01:15/);
    expect(screen.getByText(/Thứ 4 hằng tuần lúc 02:00/)).toBeDefined();
    expect((screen.getByLabelText('Thứ') as HTMLSelectElement).value).toBe('3');
  });

  it('giảm số bản 7 → 3 → PUT đúng thân, câu báo nói phần thừa xoá ở lượt KẾ TIẾP', async () => {
    tl['PUT /van-hanh/lich/SAO_LUU_CSDL'] = (g) => json({ ...LICH[0], ...(g.body as object) });
    await moTrang('#sao-luu');
    const o = (await screen.findAllByLabelText(/Giữ tối đa \(bản\)/))[0]!;
    fireEvent.change(o, { target: { value: '3' } });
    fireEvent.click(within(o.closest('form')!).getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Đã lưu. Các bản thừa sẽ được xoá ở lượt chạy kế tiếp, cũ nhất trước.');
    expect(goiDen('PUT', '/van-hanh/lich/SAO_LUU_CSDL')[0]!.body).toEqual({ tanSuat: 'HANG_NGAY', gioChay: '01:15', giuToiDa: 3 });
  });

  it('giờ sai dạng → lỗi dưới ô, KHÔNG gửi', async () => {
    await moTrang('#sao-luu');
    const o = (await screen.findAllByLabelText(/Chạy lúc/))[0]!;
    fireEvent.change(o, { target: { value: '25:00' } });
    fireEvent.click(within(o.closest('form')!).getByRole('button', { name: 'Lưu' }));
    await screen.findByText(/Giờ chạy viết dạng giờ:phút/);
    expect(goiDen('PUT', '/van-hanh/lich')).toHaveLength(0);
  });

  it('máy chủ trả lỗi của MỘT ô (LICH_KHONG_HOP_LE + field) → câu nằm dưới đúng ô ấy', async () => {
    tl['PUT /van-hanh/lich/SAO_LUU_CSDL'] = () =>
      json({ code: 'LICH_KHONG_HOP_LE', field: 'giuToiDa', message: 'Số bản giữ lại phải từ 1 đến 60' }, 400);
    await moTrang('#sao-luu');
    const o = (await screen.findAllByLabelText(/Giữ tối đa \(bản\)/))[0]!;
    fireEvent.change(o, { target: { value: '5' } });
    fireEvent.click(within(o.closest('form')!).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(o.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Số bản giữ lại phải từ 1 đến 60')).toBeDefined();
  });

  it('thẻ Tệp log: lịch nén giữ tối đa 90 TỆP, không có ô tần suất', async () => {
    await moTrang('#tep-log');
    const o = await screen.findByLabelText(/Giữ tối đa \(tệp\)/);
    expect(within(o.closest('form')!).queryByLabelText('Tần suất')).toBeNull();
    fireEvent.change(o, { target: { value: '91' } });
    fireEvent.click(within(o.closest('form')!).getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Số tệp giữ lại phải từ 1 đến 90.');
  });

  it('thẻ Lịch tự động: bốn việc + hai việc cố định; Sửa mở hộp, Đóng đóng; dọn dữ liệu không có ô giữ', async () => {
    await moTrang('#lich-tu-dong');
    const bang = await screen.findByRole('region', { name: 'Việc định kỳ' });
    expect(within(bang).getAllByRole('row').slice(1).map((r) => r.cells[0]!.textContent)).toEqual([
      'Sao lưu cơ sở dữ liệu', 'Sao lưu kho tệp', 'Nén log ngày trước', 'Dọn dữ liệu hết hạn', 'Thu log nền tảng', 'Đo ổ đĩa',
    ]);
    const sua = within(bang).getAllByRole('button', { name: 'Sửa' });
    expect(sua).toHaveLength(4);
    fireEvent.click(sua[3]!);
    const hop = await screen.findByRole('dialog');
    expect(within(hop).queryByLabelText(/Giữ tối đa/)).toBeNull();
    fireEvent.click(within(hop).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lịch sử: lượt có chi tiết mở được đầu ra; cách chạy nói theo lịch hay chạy tay', async () => {
    tl['GET /van-hanh/lan-chay'] = () =>
      json([
        { id: '2', viec: 'SAO_LUU_CSDL', batDau: '2026-11-06T02:00:00Z', ketThuc: 'x', ketQua: 'LOI', tuDong: false, chiTiet: 'pg_dump: hỏng' },
        { id: '1', viec: 'NEN_LOG', batDau: '2026-11-05T17:15:00Z', ketThuc: 'x', ketQua: 'THANH_CONG', tuDong: true, chiTiet: null },
      ]);
    await moTrang('#lich-tu-dong');
    const bang = await screen.findByRole('region', { name: 'Lịch sử các lượt chạy' });
    const [a, b] = within(bang).getAllByRole('row').slice(1);
    expect(a!.textContent).toContain('Chạy tay');
    expect(b!.textContent).toContain('Theo lịch');
    expect(within(b!).queryByRole('button')).toBeNull();
    fireEvent.click(within(a!).getByRole('button', { name: 'Xem chi tiết' }));
    expect(within(await screen.findByRole('dialog')).getByText('pg_dump: hỏng')).toBeDefined();
  });
});

// =============================================================================
describe('`0255` Tệp log', () => {
  it('Xem → hỏi đúng thành phần + mức; dòng lỗi có lớp riêng; mã dẫn sang Nhật ký lọc đúng mã', async () => {
    tl['GET /van-hanh/logs/dang-ghi/'] = () =>
      json({ dong: [JSON.stringify({ t: '2026-11-06T02:41:02Z', muc: 'error', traceId: '7f3c2a91', msg: 'POST /policies → 500' })] });
    await moTrang('#tep-log');
    fireEvent.change(await screen.findByLabelText('Thành phần'), { target: { value: 'document' } });
    fireEvent.change(screen.getByLabelText('Mức'), { target: { value: 'loi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    const log = await screen.findByRole('log');
    expect(goiDen('GET', '/van-hanh/logs/dang-ghi/')[0]!.url).toBe('/van-hanh/logs/dang-ghi/document?muc=loi');
    expect(log.querySelector('.dong-log-loi')).not.toBeNull();
    expect(within(log).getByRole('link', { name: '7f3c2a91' }).getAttribute('href')).toBe('/nhat-ky?traceId=7f3c2a91');
  });

  it('"Mọi thành phần" cần mã; có mã → hỏi đường tra mã', async () => {
    tl['GET /van-hanh/logs/tra'] = () => json({ dong: [] });
    await moTrang('#tep-log');
    fireEvent.change(await screen.findByLabelText('Thành phần'), { target: { value: '__moi__' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    await screen.findByText('Tra ở mọi thành phần cần một mã tra cứu.');
    expect(goiDen('GET', '/van-hanh/logs/tra')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Mã tra cứu'), { target: { value: 'abc12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    await screen.findByText('Không có dòng nào khớp.');
    expect(goiDen('GET', '/van-hanh/logs/tra')[0]!.url).toBe('/van-hanh/logs/tra?traceId=abc12345');
  });

  it('mã chứa ký tự lạ → lỗi dưới ô, không gửi', async () => {
    await moTrang('#tep-log');
    fireEvent.change(await screen.findByLabelText('Mã tra cứu'), { target: { value: "x'; DROP" } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    await screen.findByText(/chỉ gồm chữ, số, gạch ngang/);
    expect(goiDen('GET', '/van-hanh/logs/dang-ghi')).toHaveLength(0);
  });

  it('Xoá tệp nén → xác nhận → DELETE đúng tên; Tải → đúng đường', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    tl['GET /van-hanh/logs/log-'] = () => new Response('gz', { status: 200 });
    await moTrang('#tep-log');
    const bang = await screen.findByRole('region', { name: 'Tệp log đã nén' });
    expect(within(bang).getByText('05/11/2026')).toBeDefined();
    fireEvent.click(within(bang).getByRole('button', { name: 'Tải' }));
    await waitFor(() => expect(goiDen('GET', '/van-hanh/logs/log-2026-11-05.tar.gz/tai')).toHaveLength(1));
    fireEvent.click(within(bang).getByRole('button', { name: 'Xoá' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(goiDen('DELETE', '/van-hanh/logs/')[0]?.url).toBe('/van-hanh/logs/log-2026-11-05.tar.gz'));
  });
});

// =============================================================================
describe('`0255` Thư & hàng đợi (dời từ trang Người dùng)', () => {
  it('thư hỏng, sự kiện chờ gửi / xử lý hỏng theo nguồn bằng chữ, hạn xử lý có đơn vị NGÀY', async () => {
    await moTrang('#thu-hang-doi');
    await screen.findByText('Không có thư hỏng nào chưa xử lý');
    const cho = screen.getByRole('table', { name: 'Sự kiện chờ gửi đi' });
    expect(within(cho).getByText('Khách hàng').closest('tr')!.textContent).toContain('2');
    expect(screen.getByRole('table', { name: 'Sự kiện xử lý hỏng' }).textContent).toContain('Thông báo');
    const han = await screen.findByLabelText(/Hạn xử lý/);
    expect(han.closest('.truong')!.textContent).toContain('ngày');
  });
});

// =============================================================================
describe('`0255` không thuật ngữ máy trên màn hình (Quản trị không chuyên IT)', () => {
  it.each(['', '#o-dia', '#sao-luu', '#tep-log', '#thu-hang-doi', '#lich-tu-dong'])('thẻ %s', async (h) => {
    sk = SK_XAU;
    tacTu = { online: false, viec: [] };
    await moTrang(h);
    await waitFor(() => expect(screen.queryByText('Đang tải…')).toBeNull());
    const chu = [...document.body.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && e.tagName !== 'OPTION')
      .map((e) => e.textContent ?? '')
      .join(' ');
    expect(chu).not.toMatch(/\b(dump|docker|container|cron|outbox|volume|systemd|psql)\b|\.\/csbh|phuc-hoi/i);
  });
});

// =============================================================================
describe('`0255` bộ định tuyến hiểu `#`', () => {
  function Hien() {
    const { duong, di } = useDuong();
    return (
      <>
        <p data-testid="duong">{duong}</p>
        <button type="button" onClick={() => di('/van-hanh#o-dia')}>
          đi
        </button>
      </>
    );
  }

  it('di("/van-hanh#o-dia") → màn hình /van-hanh, `#` nằm trên địa chỉ', () => {
    window.history.replaceState(null, '', '/');
    render(
      <BoDinhTuyen>
        <Hien />
      </BoDinhTuyen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'đi' }));
    expect(screen.getByTestId('duong').textContent).toBe('/van-hanh');
    expect(window.location.hash).toBe('#o-dia');
  });

  it('đang ở /van-hanh, đi tới /van-hanh#o-dia → bắn hashchange để trang đổi thẻ', () => {
    window.history.replaceState(null, '', '/van-hanh');
    const nghe = vi.fn();
    window.addEventListener('hashchange', nghe);
    render(
      <BoDinhTuyen>
        <Hien />
      </BoDinhTuyen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'đi' }));
    expect(nghe).toHaveBeenCalledTimes(1);
    window.removeEventListener('hashchange', nghe);
  });
});

// =============================================================================
describe('`0255` Nhật ký mở theo mã từ trang Vận hành', () => {
  it('/nhat-ky?traceId=… → lượt tải đầu lọc đúng mã, KHÔNG kèm mốc "từ đầu tháng"', async () => {
    const { NhatKy } = await import('@csbh/web/nhat-ky-ui');
    window.history.replaceState(null, '', '/nhat-ky?traceId=7f3c2a91');
    render(
      <BoDinhTuyen>
        <NhatKy />
      </BoDinhTuyen>,
    );
    await waitFor(() => expect(goi.some((g) => g.url.startsWith('/audit/entries?'))).toBe(true));
    const tai = goi.find((g) => g.url.startsWith('/audit/entries?'))!;
    expect(tai.url).toContain('traceId=7f3c2a91');
    expect(tai.url).not.toContain('from=');
  });

  it('mã sai dạng trên địa chỉ → bỏ qua, lọc như mặc định', async () => {
    const { NhatKy } = await import('@csbh/web/nhat-ky-ui');
    window.history.replaceState(null, '', "/nhat-ky?traceId=x'%3B");
    render(
      <BoDinhTuyen>
        <NhatKy />
      </BoDinhTuyen>,
    );
    await waitFor(() => expect(goi.some((g) => g.url.startsWith('/audit/entries?'))).toBe(true));
    expect(goi.find((g) => g.url.startsWith('/audit/entries?'))!.url).not.toContain('traceId');
  });
});
