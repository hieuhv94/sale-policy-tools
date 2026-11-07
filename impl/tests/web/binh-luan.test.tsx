/**
 * @vitest-environment jsdom
 *
 * `0264` — giao diện bình luận trên hồ sơ.
 *
 * Hai lớp, như `thong-bao.test.tsx`:
 *
 *   1. PHẦN THUẦN (`lib/binh-luan.ts`) — chỗ sai IM LẶNG: bình luận mới hiện hai lần,
 *      phản hồi cũ chen vào giữa luồng, tên được nhắc thành chữ trơn lúc gửi.
 *   2. KHỐI TRÊN MÀN HÌNH với một máy chủ giả: tải · tự cập nhật · gửi/lỗi/thử lại ·
 *      nhắc tên · sửa · xoá · cảm xúc · trả lời · tệp · tự đọc thông báo · liên kết
 *      `#binh-luan-…` · không lưu nháp. Hợp đồng THẬT của máy chủ do
 *      `tests/http/binh-luan*.test.ts` canh; ở đây canh giao diện gửi ĐÚNG thứ ấy.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GIOI_HAN_BINH_LUAN } from '@csbh/domain-policy';
import { BoDinhTuyen, CAU_ROI_TRANG, useDuong } from '@csbh/web/router';
import { KhoiBinhLuan } from '@csbh/web/khoi-binh-luan';
import {
  chenNhac,
  coChu,
  doanBay,
  hopNhat,
  idTuNeo,
  kiemTepTruoc,
  sangNoiDung,
  timNhacDangGo,
  tuNoiDung,
  xoaLuiNhac,
  type Luong,
  type MucBinhLuan,
} from '@csbh/web/binh-luan';

const HS = '11111111-1111-4111-8111-111111111111';
const U = {
  an: 'aaaaaaaa-0000-4000-8000-000000000001',
  bich: 'aaaaaaaa-0000-4000-8000-000000000002',
  minh: 'aaaaaaaa-0000-4000-8000-000000000003',
};
const id = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;

const M = (o: Partial<MucBinhLuan> & { stt: number }): MucBinhLuan => ({
  id: id(o.stt),
  parentId: null,
  tacGia: { id: U.bich, ten: 'Trần Thị Bích', vaiTro: 'TBP' },
  cuaToi: false,
  noiDung: `Bình luận ${o.stt}`,
  daXoa: false,
  taoLuc: new Date(Date.now() - 3_600_000).toISOString(),
  suaLuc: null,
  camXuc: [],
  tep: [],
  ...o,
});
const G = (o: Partial<MucBinhLuan> & { stt: number }, phanHoi: MucBinhLuan[] = []): Luong => ({
  soPhanHoi: phanHoi.length,
  ...M(o),
  phanHoi,
});

// =============================================================================
// Lớp 1 — phần thuần
// =============================================================================

describe('`0264` hopNhat — đưa thay đổi vào luồng mà không đổi chỗ thứ đang đọc', () => {
  const nen = (): Luong[] => [G({ stt: 5 }, [M({ stt: 6, parentId: id(5) }), M({ stt: 7, parentId: id(5) })]), G({ stt: 8 })];

  it('gốc đã có → thay TẠI CHỖ, giữ nguyên các phản hồi đã tải', () => {
    const r = hopNhat(nen(), [M({ stt: 5, noiDung: 'đã sửa', suaLuc: new Date().toISOString(), soPhanHoi: 9 })]);
    expect(r.ds[0]!.noiDung).toBe('đã sửa');
    expect(r.ds[0]!.phanHoi.map((p) => p.stt)).toEqual([6, 7]);
    expect(r.ds[0]!.soPhanHoi).toBe(9);
    expect(r.moi).toEqual([]);
  });

  it('gốc MỚI của người khác → nối cuối và báo mới; của mình → nối, KHÔNG báo', () => {
    const r = hopNhat(nen(), [M({ stt: 12 }), M({ stt: 13, cuaToi: true })]);
    expect(r.ds.map((g) => g.stt)).toEqual([5, 8, 12, 13]);
    expect(r.moi).toEqual([id(12)]);
  });

  it('gốc CŨ HƠN trang đang bày (bị sửa ở trang chưa tải) → bỏ qua, không chen lên đầu', () => {
    const r = hopNhat(nen(), [M({ stt: 2, noiDung: 'cũ' })]);
    expect(r.ds.map((g) => g.stt)).toEqual([5, 8]);
  });

  it('phản hồi mới → nối cuối luồng của nó; phản hồi CŨ chưa tải → bỏ qua; gốc chưa tải → bỏ qua', () => {
    const r = hopNhat(nen(), [
      M({ stt: 14, parentId: id(5) }),
      M({ stt: 3, parentId: id(5) }),
      M({ stt: 15, parentId: id(99) }),
    ]);
    expect(r.ds[0]!.phanHoi.map((p) => p.stt)).toEqual([6, 7, 14]);
    expect(r.moi).toEqual([id(14)]);
  });

  it('một lô có cả gốc mới lẫn phản hồi đầu tiên của nó', () => {
    const r = hopNhat(nen(), [M({ stt: 21, parentId: id(20) }), M({ stt: 20 })]);
    expect(r.ds[2]!.id).toBe(id(20));
    expect(r.ds[2]!.phanHoi.map((p) => p.stt)).toEqual([21]);
  });

  it('áp cùng một lô HAI LẦN (lượt hỏi trùng mốc) → không có gì hiện hai lần', () => {
    const lo = [M({ stt: 30 }), M({ stt: 31, parentId: id(8) })];
    const mot = hopNhat(nen(), lo).ds;
    const hai = hopNhat(mot, lo);
    expect(hai.ds).toEqual(mot);
    expect(hai.moi).toEqual([]);
  });
});

describe('`0264` nhắc tên trong ô soạn', () => {
  it('đang gõ `@…` khi `@` ở đầu ô hoặc sau khoảng trắng; email, xuống dòng, quá 30 ký tự thì không', () => {
    expect(timNhacDangGo('@Bí', 3)).toEqual({ batDau: 0, q: 'Bí' });
    expect(timNhacDangGo('Chị @Trần T', 11)).toEqual({ batDau: 4, q: 'Trần T' });
    expect(timNhacDangGo('an@nutricare', 12)).toBeNull();
    expect(timNhacDangGo('@Bí\nchào', 8)).toBeNull();
    expect(timNhacDangGo(`@${'a'.repeat(31)}`, 32)).toBeNull();
    expect(timNhacDangGo('không nhắc ai', 5)).toBeNull();
  });

  it('chèn tên thay phần đang gõ, con trỏ đứng sau dấu cách', () => {
    const r = chenNhac('Chị @Bí xem giúp', 7, 4, { id: U.bich, ten: 'Trần Thị Bích' });
    expect(r.chu).toBe('Chị @Trần Thị Bích  xem giúp');
    expect(r.caret).toBe('Chị @Trần Thị Bích '.length);
  });

  it('gửi: CHỈ tên đã chọn thành dấu nhắc; tên gõ tay là chữ trơn; tên dài thắng tên ngắn', () => {
    const nhac = [
      { id: U.bich, ten: 'Trần Thị Bích' },
      { id: U.minh, ten: 'Trần Thị Bích Ngọc' },
    ];
    expect(sangNoiDung('@Trần Thị Bích Ngọc và @Trần Thị Bích, @Lan', nhac)).toBe(
      `@{${U.minh}} và @{${U.bich}}, @Lan`,
    );
    expect(sangNoiDung('@Trần Thị Bích', [])).toBe('@Trần Thị Bích');
  });

  it('mở bình luận cũ để sửa: dấu nhắc thành tên HIỆN TẠI, và quay ngược được đúng như cũ', () => {
    const goc = `Nhờ @{${U.minh}} xem, cc @{${U.bich}} và @{${U.minh}}`;
    const r = tuNoiDung(goc, { [U.minh]: 'Lê Hoàng Minh', [U.bich]: 'Trần Thị Bích' });
    expect(r.chu).toBe('Nhờ @Lê Hoàng Minh xem, cc @Trần Thị Bích và @Lê Hoàng Minh');
    expect(r.nhac).toHaveLength(2);
    expect(sangNoiDung(r.chu, r.nhac)).toBe(goc);
  });

  it('xoá lùi ngay sau một tên đã chọn → xoá CẢ tên; chỗ khác → để phím làm việc thường', () => {
    const nhac = [{ id: U.bich, ten: 'Trần Thị Bích' }];
    expect(xoaLuiNhac('Chị @Trần Thị Bích', 18, nhac)).toEqual({ chu: 'Chị ', caret: 4 });
    expect(xoaLuiNhac('Chị @Trần Thị Bích xem', 22, nhac)).toBeNull();
    expect(xoaLuiNhac('a@Trần Thị Bích', 15, nhac)).toBeNull();
  });
});

describe('`0264` dựng chữ để bày', () => {
  it('liên kết http(s) là liên kết, dấu câu cuối không dính; `javascript:` thì không', () => {
    const d = doanBay('Xem https://a.vn/x). Và javascript:alert(1)', {});
    expect(d.filter((x) => x.loai === 'lien-ket')).toEqual([{ loai: 'lien-ket', url: 'https://a.vn/x' }]);
    expect(d.map((x) => (x.loai === 'chu' ? x.chu : '')).join('')).toContain('javascript:alert(1)');
  });

  it('người được nhắc hiện TÊN HIỆN TẠI; không tra được thì "Người dùng"', () => {
    const d = doanBay(`@{${U.minh}} và @{${U.an}}`, { [U.minh]: 'Lê Hoàng Minh' });
    expect(d.filter((x) => x.loai === 'nhac').map((x) => (x.loai === 'nhac' ? x.ten : ''))).toEqual([
      'Lê Hoàng Minh',
      'Người dùng',
    ]);
  });
});

describe('`0264` tệp và liên kết', () => {
  it('kiểm trước khi tải: đuôi lạ, rỗng, quá cỡ bị chặn; đúng trần thì qua', () => {
    const tran = GIOI_HAN_BINH_LUAN.coTepToiDaByte;
    expect(kiemTepTruoc({ name: 'virus.exe', size: 10 })).toMatch(/Chỉ đính kèm/);
    expect(kiemTepTruoc({ name: 'a.pdf', size: 0 })).toMatch(/rỗng/);
    expect(kiemTepTruoc({ name: 'a.pdf', size: tran + 1 })).toMatch(/10MB/);
    expect(kiemTepTruoc({ name: 'A.PDF', size: tran })).toBeNull();
    for (const t of ['a.jpg', 'a.jpeg', 'a.png', 'a.webp', 'a.docx', 'a.xlsx']) expect(kiemTepTruoc({ name: t, size: 5 })).toBeNull();
  });

  it('cỡ tệp kiểu Việt Nam', () => {
    expect(coChu(500)).toBe('500 B');
    expect(coChu(412 * 1024)).toBe('412 KB');
    expect(coChu(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });

  it('neo `#binh-luan-<uuid>` — mọi thứ khác là null', () => {
    expect(idTuNeo(`#binh-luan-${id(7).toUpperCase()}`)).toBe(id(7));
    expect(idTuNeo('#binh-luan-abc')).toBeNull();
    expect(idTuNeo('#lich-su')).toBeNull();
    expect(idTuNeo('')).toBeNull();
  });
});

// =============================================================================
// Lớp 2 — khối trên màn hình, máy chủ giả
// =============================================================================

type Goi = { phuongThuc: string; duong: string; than: unknown };
let goi: Goi[] = [];
type TraLoi = { status?: number; than: unknown } | ((g: Goi) => { status?: number; than: unknown });
let traLoi: Record<string, TraLoi> = {};
let trang: { binhLuan: Luong[]; conCu: boolean; ten: Record<string, string>; moc: number };
let thayDoi: { thayDoi: MucBinhLuan[]; ten: Record<string, string>; moc: number; conNua: boolean };

/** Khoá tra: `PHƯƠNG_THỨC đường-không-truy-vấn`, rơi về khoá chỉ có phương thức + tiền tố. */
const timTraLoi = (g: Goi) => {
  const tho = `${g.phuongThuc} ${g.duong.split('?')[0]}`;
  for (const [k, v] of Object.entries(traLoi)) if (tho === k || (k.endsWith('*') && tho.startsWith(k.slice(0, -1)))) return typeof v === 'function' ? v(g) : v;
  return undefined;
};

const gia = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duongDu: string, tc?: { method?: string; body?: unknown }) => {
      const duong = duongDu.replace(/^\/api/, '');
      const g: Goi = {
        phuongThuc: tc?.method ?? 'GET',
        duong,
        than: typeof tc?.body === 'string' ? JSON.parse(tc.body) : tc?.body,
      };
      goi.push(g);
      const r = timTraLoi(g) ??
        (duong.startsWith(`/policies/${HS}/binh-luan/thay-doi`)
          ? { than: thayDoi }
          : duong.startsWith(`/policies/${HS}/binh-luan`) && g.phuongThuc === 'GET'
            ? { than: trang }
            : duong.startsWith('/notifications/da-doc-binh-luan')
              ? { than: { soViecChuaDoc: 0, soTinChuaDoc: 0, soDaDanhDau: 1 } }
              : { status: 404, than: { code: 'KHONG_CO' } });
      return Promise.resolve(
        new Response(JSON.stringify(r.than), {
          status: r.status ?? 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );

const mo = () =>
  render(
    <BoDinhTuyen>
      <KhoiBinhLuan hoSoId={HS} />
    </BoDinhTuyen>,
  );
const daTai = () => screen.findByText(/Tự cập nhật/);
const oChinh = () => screen.getByLabelText('Viết bình luận') as HTMLTextAreaElement;
const goiToi = (p: string, phuongThuc = 'GET') => goi.filter((g) => g.phuongThuc === phuongThuc && g.duong.startsWith(p));

beforeEach(() => {
  goi = [];
  traLoi = {};
  // Không gán `location.hash`: jsdom bắn `hashchange` trễ, rơi vào ca kế tiếp.
  window.history.replaceState(null, '', window.location.pathname);
  trang = {
    binhLuan: [
      G(
        { stt: 1, tacGia: { id: U.an, ten: 'Nguyễn Văn An', vaiTro: 'TDV' }, cuaToi: true, noiDung: `Nhờ @{${U.minh}} xem https://nutricare.vn/a.` },
        [M({ stt: 2, parentId: id(1), tacGia: { id: U.minh, ten: 'Lê Hoàng Minh', vaiTro: 'KE_TOAN' }, noiDung: 'Đã xem' })],
      ),
      G({ stt: 3, daXoa: true, noiDung: null }),
      G({ stt: 4, suaLuc: new Date().toISOString(), noiDung: '<img src=x onerror=alert(1)><script>alert(2)</script>' }),
    ],
    conCu: false,
    ten: { [U.minh]: 'Lê Hoàng Minh' },
    moc: 4,
  };
  thayDoi = { thayDoi: [], ten: {}, moc: 4, conNua: false };
  gia();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // Không gán `location.hash`: jsdom bắn `hashchange` trễ, rơi vào ca kế tiếp.
  window.history.replaceState(null, '', window.location.pathname);
});

describe('`0264` tải và bày', () => {
  it('đủ luồng: tên, vai trò, nhắc tên, liên kết mở tab mới, đã xoá, đã sửa, phản hồi thụt vào', async () => {
    mo();
    await daTai();
    const khoi = screen.getByRole('region', { name: 'Bình luận' });
    expect(within(khoi).getByText('Nguyễn Văn An')).toBeDefined();
    expect(within(khoi).getByText('Trình dược viên')).toBeDefined();
    expect(khoi.querySelector('.bl-nhac')?.textContent).toBe('@Lê Hoàng Minh');
    const a = within(khoi).getByRole('link', { name: 'https://nutricare.vn/a' });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(khoi).getByText('Bình luận này đã bị xoá.')).toBeDefined();
    expect(within(khoi).getByText('· Đã sửa')).toBeDefined();
    expect(khoi.querySelector('.bl-phan-hoi')?.textContent).toContain('Đã xem');
    // Số đếm gồm cả phản hồi.
    expect(khoi.querySelector('.bl-dem')?.textContent).toBe('4');
  });

  it('chữ có thẻ HTML hiện ĐÚNG LÀ CHỮ — không phần tử nào được dựng', async () => {
    mo();
    await daTai();
    const khoi = screen.getByRole('region', { name: 'Bình luận' });
    expect(khoi.querySelector('script')).toBeNull();
    expect(khoi.querySelector('.bl-noi-dung img')).toBeNull();
    expect(khoi.textContent).toContain('<script>alert(2)</script>');
  });

  it('chưa có bình luận → câu mời, vẫn có ô soạn', async () => {
    trang = { ...trang, binhLuan: [] };
    mo();
    expect(await screen.findByText('Chưa có bình luận nào.')).toBeDefined();
    expect(oChinh()).toBeDefined();
  });

  it('không tải được → khối báo lỗi có Thử lại; trang không sập', async () => {
    traLoi[`GET /policies/${HS}/binh-luan`] = { status: 500, than: { code: 'HTTP_500' } };
    mo();
    const nut = await screen.findByRole('button', { name: /Thử lại/ });
    delete traLoi[`GET /policies/${HS}/binh-luan`];
    fireEvent.click(nut);
    await daTai();
  });

  it('máy chủ trả SAI HÌNH DẠNG → khối báo lỗi, KHÔNG tháo cả cây (bài học `0162`)', async () => {
    traLoi[`GET /policies/${HS}/binh-luan`] = { than: { khongPhai: 'danh sách' } };
    mo();
    expect(await screen.findByRole('button', { name: /Thử lại/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Bình luận' })).toBeDefined();
  });

  it('403 → *mất quyền*, không ô soạn', async () => {
    traLoi[`GET /policies/${HS}/binh-luan`] = { status: 403, than: { code: 'OUT_OF_SCOPE' } };
    mo();
    expect(await screen.findByText('Bạn không còn quyền xem hồ sơ này.')).toBeDefined();
    expect(screen.queryByLabelText('Viết bình luận')).toBeNull();
  });
});

describe('`0264` tự cập nhật mỗi 15 giây', () => {
  it('hỏi `thay-doi?tu=<mốc>`; bình luận người khác hiện ra; mốc tiến', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mo();
    await daTai();
    thayDoi = { thayDoi: [M({ stt: 9, noiDung: 'Bình luận mới tới' })], ten: {}, moc: 9, conNua: false };
    await act(async () => {
      vi.advanceTimersByTime(GIOI_HAN_BINH_LUAN.nhipHoiTrangMs);
    });
    expect(await screen.findByText('Bình luận mới tới')).toBeDefined();
    expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`)[0]!.duong).toContain('tu=4');
    thayDoi = { thayDoi: [], ten: {}, moc: 9, conNua: false };
    await act(async () => {
      vi.advanceTimersByTime(GIOI_HAN_BINH_LUAN.nhipHoiTrangMs);
    });
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`).at(-1)!.duong).toContain('tu=9'));
    expect(screen.getAllByText('Bình luận mới tới')).toHaveLength(1);
  });

  it('tab ẨN thì không hỏi; quay lại thì hỏi NGAY', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mo();
    await daTai();
    const an = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      vi.advanceTimersByTime(GIOI_HAN_BINH_LUAN.nhipHoiTrangMs * 3);
    });
    expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`)).toHaveLength(0);
    an.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`)).toHaveLength(1));
    an.mockRestore();
  });

  it('lượt hỏi hỏng vì mạng → KHÔNG dải lỗi; lượt sau hỏi lại từ ĐÚNG mốc cũ', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mo();
    await daTai();
    traLoi[`GET /policies/${HS}/binh-luan/thay-doi`] = { status: 502, than: { code: 'HTTP_502' } };
    await act(async () => {
      vi.advanceTimersByTime(GIOI_HAN_BINH_LUAN.nhipHoiTrangMs);
    });
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`)).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
    delete traLoi[`GET /policies/${HS}/binh-luan/thay-doi`];
    await act(async () => {
      vi.advanceTimersByTime(GIOI_HAN_BINH_LUAN.nhipHoiTrangMs);
    });
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`)).toHaveLength(2));
    expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`)[1]!.duong).toContain('tu=4');
  });

  it('lượt hỏi nhận 403 → *mất quyền* và THÔI hỏi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mo();
    await daTai();
    traLoi[`GET /policies/${HS}/binh-luan/thay-doi`] = { status: 403, than: { code: 'OUT_OF_SCOPE' } };
    await act(async () => {
      vi.advanceTimersByTime(GIOI_HAN_BINH_LUAN.nhipHoiTrangMs);
    });
    expect(await screen.findByText('Bạn không còn quyền xem hồ sơ này.')).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(GIOI_HAN_BINH_LUAN.nhipHoiTrangMs * 3);
    });
    expect(goiToi(`/policies/${HS}/binh-luan/thay-doi`)).toHaveLength(1);
  });
});

const traVe = (m: MucBinhLuan) => ({ than: { binhLuan: m, ten: {} } });

describe('`0264` gửi', () => {
  it('Enter gửi; Shift+Enter không; một lượt bấm đúp là MỘT lượt gửi; xong thì ô trống', async () => {
    let n = 0;
    traLoi[`POST /policies/${HS}/binh-luan`] = () => traVe(M({ stt: 20 + ++n, cuaToi: true, noiDung: 'Xin chào' }));
    mo();
    await daTai();
    fireEvent.change(oChinh(), { target: { value: 'Xin chào' } });
    fireEvent.keyDown(oChinh(), { key: 'Enter', shiftKey: true });
    expect(goiToi(`/policies/${HS}/binh-luan`, 'POST')).toHaveLength(0);
    fireEvent.keyDown(oChinh(), { key: 'Enter' });
    fireEvent.keyDown(oChinh(), { key: 'Enter' });
    await waitFor(() => expect(oChinh().value).toBe(''));
    const p = goiToi(`/policies/${HS}/binh-luan`, 'POST');
    expect(p).toHaveLength(1);
    expect(p[0]!.than).toMatchObject({ noiDung: 'Xin chào', tep: [] });
    expect(String((p[0]!.than as { maGui: string }).maGui)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mất mạng → CHỮ CÒN NGUYÊN, câu lỗi dưới ô; Thử lại dùng LẠI đúng `maGui`', async () => {
    traLoi[`POST /policies/${HS}/binh-luan`] = { status: 503, than: { code: 'HTTP_503' } };
    mo();
    await daTai();
    fireEvent.change(oChinh(), { target: { value: 'Khách đồng ý' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nội dung vẫn còn trong ô');
    expect(oChinh().value).toBe('Khách đồng ý');
    traLoi[`POST /policies/${HS}/binh-luan`] = traVe(M({ stt: 40, cuaToi: true, noiDung: 'Khách đồng ý' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(oChinh().value).toBe(''));
    const p = goiToi(`/policies/${HS}/binh-luan`, 'POST').map((g) => (g.than as { maGui: string }).maGui);
    expect(p).toHaveLength(2);
    expect(p[0]).toBe(p[1]);
  });

  it('lỗi của Ô (`BINH_LUAN_QUA_DAI`) → câu tiếng Việt dưới ô, chữ còn', async () => {
    traLoi[`POST /policies/${HS}/binh-luan`] = { status: 400, than: { code: 'NHAC_TEN_KHONG_HOP_LE' } };
    mo();
    await daTai();
    fireEvent.change(oChinh(), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect((await screen.findByRole('alert')).textContent).toContain('không còn ở trên hồ sơ này');
    expect(oChinh().value).toBe('abc');
  });

  it('quá 5.000 ký tự → nút Gửi xám và bộ đếm đỏ — không gửi gì', async () => {
    mo();
    await daTai();
    fireEvent.change(oChinh(), { target: { value: 'a'.repeat(GIOI_HAN_BINH_LUAN.kyTuToiDa + 1) } });
    expect((screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/quá dài/)).toBeDefined();
  });
});

describe('`0264` nhắc tên trong khối', () => {
  it('gõ `@Bí` → chờ rồi hỏi máy chủ; ↓ Enter chọn (KHÔNG gửi); gửi đi mang dấu `@{id}`', async () => {
    traLoi[`GET /policies/${HS}/binh-luan/nguoi-nhac`] = {
      than: {
        nguoi: [
          { id: U.minh, ten: 'Lê Hoàng Minh', email: 'minh@nutricare.vn', vaiTro: 'KE_TOAN' },
          { id: U.bich, ten: 'Trần Thị Bích', email: 'bich@nutricare.vn', vaiTro: 'TBP' },
        ],
      },
    };
    traLoi[`POST /policies/${HS}/binh-luan`] = traVe(M({ stt: 50, cuaToi: true }));
    mo();
    await daTai();
    const o = oChinh();
    fireEvent.change(o, { target: { value: 'Chị @Bí', selectionStart: 7, selectionEnd: 7 } });
    const ds = await screen.findByRole('listbox');
    expect(goiToi(`/policies/${HS}/binh-luan/nguoi-nhac`)[0]!.duong).toContain(`q=${encodeURIComponent('Bí')}`);
    expect(within(ds).getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(o, { key: 'ArrowDown' });
    fireEvent.keyDown(o, { key: 'Enter' });
    expect(goiToi(`/policies/${HS}/binh-luan`, 'POST')).toHaveLength(0);
    expect(o.value).toBe('Chị @Trần Thị Bích ');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(o, { key: 'Enter' });
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan`, 'POST')).toHaveLength(1));
    expect((goiToi(`/policies/${HS}/binh-luan`, 'POST')[0]!.than as { noiDung: string }).noiDung).toBe(`Chị @{${U.bich}} `);
  });

  it('danh sách gợi ý: không tìm thấy · không tải được (có Thử lại)', async () => {
    traLoi[`GET /policies/${HS}/binh-luan/nguoi-nhac`] = { than: { nguoi: [] } };
    mo();
    await daTai();
    fireEvent.change(oChinh(), { target: { value: '@zz', selectionStart: 3, selectionEnd: 3 } });
    expect(await screen.findByText('Không tìm thấy người dùng')).toBeDefined();
    traLoi[`GET /policies/${HS}/binh-luan/nguoi-nhac`] = { status: 500, than: {} };
    fireEvent.change(oChinh(), { target: { value: '@zzz', selectionStart: 4, selectionEnd: 4 } });
    expect(await screen.findByText(/Không tải được danh sách/)).toBeDefined();
  });
});

const moMenu = async (ten: string) => {
  const bl = screen.getByText(ten).closest('article')!;
  fireEvent.click(within(bl as HTMLElement).getByRole('button', { name: 'Thao tác khác' }));
  return bl as HTMLElement;
};

describe('`0264` sửa · xoá · cảm xúc · trả lời', () => {
  it('Sửa: ô mở TẠI CHỖ với tên người được nhắc; Lưu gửi PATCH mang lại dấu `@{id}`', async () => {
    traLoi[`PATCH /policies/${HS}/binh-luan/${id(1)}`] = (g) =>
      traVe(M({ stt: 1, cuaToi: true, noiDung: (g.than as { noiDung: string }).noiDung, suaLuc: new Date().toISOString() }));
    mo();
    await daTai();
    const bl = await moMenu('Nguyễn Văn An');
    fireEvent.click(within(bl).getByRole('menuitem', { name: /Sửa/ }));
    const o = screen.getByLabelText('Sửa bình luận') as HTMLTextAreaElement;
    expect(o.value).toBe('Nhờ @Lê Hoàng Minh xem https://nutricare.vn/a.');
    fireEvent.change(o, { target: { value: `${o.value} gấp` } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan/${id(1)}`, 'PATCH')).toHaveLength(1));
    expect(goiToi(`/policies/${HS}/binh-luan/${id(1)}`, 'PATCH')[0]!.than).toEqual({
      noiDung: `Nhờ @{${U.minh}} xem https://nutricare.vn/a. gấp`,
      tep: [],
    });
  });

  it('Sửa/Xoá chỉ có ở bình luận CỦA MÌNH', async () => {
    mo();
    await daTai();
    const bl = await moMenu('Đã xem');
    expect(within(bl).queryByRole('menuitem', { name: /Sửa/ })).toBeNull();
    expect(within(bl).getByRole('menuitem', { name: /Sao chép liên kết/ })).toBeDefined();
  });

  it('Xoá: HỎI LẠI trước; Huỷ không gửi gì; xác nhận → DELETE và dòng thành "đã bị xoá"', async () => {
    traLoi[`DELETE /policies/${HS}/binh-luan/${id(1)}`] = traVe(M({ stt: 1, cuaToi: true, daXoa: true, noiDung: null }));
    mo();
    await daTai();
    let bl = await moMenu('Nguyễn Văn An');
    fireEvent.click(within(bl).getByRole('menuitem', { name: /Xoá bình luận/ }));
    let hop = screen.getByRole('dialog');
    expect(hop.textContent).toContain('Các phản hồi vẫn được giữ');
    fireEvent.click(within(hop).getByRole('button', { name: 'Huỷ' }));
    expect(goiToi(`/policies/${HS}/binh-luan/${id(1)}`, 'DELETE')).toHaveLength(0);
    bl = await moMenu('Nguyễn Văn An');
    fireEvent.click(within(bl).getByRole('menuitem', { name: /Xoá bình luận/ }));
    hop = screen.getByRole('dialog');
    fireEvent.click(within(hop).getByRole('button', { name: 'Xoá bình luận' }));
    await waitFor(() => expect(screen.getAllByText('Bình luận này đã bị xoá.')).toHaveLength(2));
  });

  it('cảm xúc: thả → PUT đúng mã; bấm lại chip của mình → DELETE', async () => {
    traLoi[`PUT /policies/${HS}/binh-luan/${id(4)}/cam-xuc/MUNG`] = traVe(
      M({ stt: 4, camXuc: [{ loai: 'MUNG', so: 1, cuaToi: true, nguoi: ['Nguyễn Văn An'] }] }),
    );
    traLoi[`DELETE /policies/${HS}/binh-luan/${id(4)}/cam-xuc/MUNG`] = traVe(M({ stt: 4 }));
    mo();
    await daTai();
    const bl = document.getElementById(`binh-luan-${id(4)}`)!;
    fireEvent.click(within(bl).getByRole('button', { name: 'Thả cảm xúc' }));
    fireEvent.click(within(bl).getByRole('menuitemcheckbox', { name: 'Chúc mừng' }));
    const chip = await within(bl).findByRole('button', { name: /Chúc mừng, 1 người, gồm bạn/ });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan/${id(4)}/cam-xuc/MUNG`, 'DELETE')).toHaveLength(1));
  });

  it('trả lời: ô mở cuối luồng, nói đang trả lời ai; gửi mang `parentId`; gốc đã xoá thì không có nút', async () => {
    traLoi[`POST /policies/${HS}/binh-luan`] = traVe(M({ stt: 60, parentId: id(1), cuaToi: true, noiDung: 'Dạ' }));
    mo();
    await daTai();
    expect(
      within(document.getElementById(`binh-luan-${id(3)}`)!).queryByRole('button', { name: /Trả lời/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trả lời Nguyễn Văn An' }));
    const o = screen.getByLabelText('Trả lời bình luận');
    expect(screen.getByText('Đang trả lời')).toBeDefined();
    fireEvent.change(o, { target: { value: 'Dạ' } });
    fireEvent.keyDown(o, { key: 'Enter' });
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan`, 'POST')).toHaveLength(1));
    expect(goiToi(`/policies/${HS}/binh-luan`, 'POST')[0]!.than).toMatchObject({ parentId: id(1), noiDung: 'Dạ' });
    expect(await screen.findByText('Dạ')).toBeDefined();
  });

  it('luồng nhiều phản hồi: "Xem N phản hồi trước" hỏi `phan-hoi?truoc=<stt phản hồi đầu>`', async () => {
    trang.binhLuan[0] = { ...trang.binhLuan[0]!, soPhanHoi: 30 };
    traLoi[`GET /policies/${HS}/binh-luan/${id(1)}/phan-hoi`] = {
      than: { phanHoi: [M({ stt: 1.5, id: id(150), parentId: id(1), noiDung: 'Phản hồi cũ' })], conCu: true, ten: {} },
    };
    mo();
    await daTai();
    fireEvent.click(screen.getByRole('button', { name: /Xem 20 phản hồi trước \(còn 29 phản hồi\)/ }));
    expect(await screen.findByText('Phản hồi cũ')).toBeDefined();
    expect(goiToi(`/policies/${HS}/binh-luan/${id(1)}/phan-hoi`)[0]!.duong).toContain('truoc=2');
  });
});

describe('`0264` tệp đính kèm', () => {
  it('chọn tệp → tải lên `document` với mục đích BINH_LUAN; gửi mang id tệp', async () => {
    const tepId = 'cccccccc-0000-4000-8000-000000000001';
    traLoi['POST /files'] = { than: { id: tepId, fileName: 'bao-gia.pdf', contentType: 'application/pdf', sizeBytes: '2048' } };
    traLoi[`POST /policies/${HS}/binh-luan`] = traVe(M({ stt: 70, cuaToi: true, noiDung: '' }));
    mo();
    await daTai();
    const input = document.querySelector('.bl-soan-chinh input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'bao-gia.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('2 KB')).toBeDefined();
    const tai = goiToi('/files', 'POST')[0]!;
    expect(tai.duong).toContain(`ownerKind=POLICY&ownerId=${HS}&purpose=BINH_LUAN`);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(goiToi(`/policies/${HS}/binh-luan`, 'POST')).toHaveLength(1));
    expect(goiToi(`/policies/${HS}/binh-luan`, 'POST')[0]!.than).toMatchObject({ tep: [tepId] });
  });

  it('tệp sai loại → báo ngay trên thẻ tệp, KHÔNG tải lên; tải hỏng → Thử lại', async () => {
    traLoi['POST /files'] = { status: 500, than: {} };
    mo();
    await daTai();
    const input = document.querySelector('.bl-soan-chinh input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['MZ'], 'virus.exe')] } });
    expect(await screen.findByText(/Chỉ đính kèm được/)).toBeDefined();
    expect(goiToi('/files', 'POST')).toHaveLength(0);
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeDefined();
    // Chỉ có tệp hỏng → không có gì để gửi.
    expect((screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('`0264` thông báo tự thành đã đọc khi bình luận hiện trên màn hình', () => {
  it('trình duyệt không đo được khung nhìn → báo đã đọc các bình luận KHÔNG PHẢI của mình, một lượt', async () => {
    mo();
    await daTai();
    await waitFor(() => expect(goiToi('/notifications/da-doc-binh-luan', 'POST')).toHaveLength(1), { timeout: 2000 });
    const ids = (goiToi('/notifications/da-doc-binh-luan', 'POST')[0]!.than as { binhLuanIds: string[] }).binhLuanIds;
    expect(ids.sort()).toEqual([id(2), id(3), id(4)].sort());
    expect(ids).not.toContain(id(1));
  });
});

describe('`0264` liên kết tới một bình luận', () => {
  it('đang ở trang, bấm liên kết khác tới một bình luận (`hashchange`) → đưa tiêu điểm tới nó', async () => {
    mo();
    await daTai();
    await act(async () => {
      window.history.pushState(null, '', `${window.location.pathname}#binh-luan-${id(4)}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(document.activeElement?.id).toBe(`binh-luan-${id(4)}`));
  });

  it('`#binh-luan-<id>` ở trang CHƯA TẢI → tải thêm tới khi gặp, rồi đưa tiêu điểm tới nó', async () => {
    trang = { ...trang, conCu: true };
    traLoi[`GET /policies/${HS}/binh-luan`] = (g) =>
      g.duong.includes('truoc=')
        ? { than: { binhLuan: [G({ stt: 0.5, noiDung: 'Bình luận rất cũ', id: id(900) })], conCu: false, ten: {}, moc: 4 } }
        : { than: trang };
    // `replaceState`, KHÔNG gán `location.hash`: gán thì jsdom bắn `hashchange` SAU khi
    // khối đã dựng, và ca này đi qua đường nghe sự kiện thay vì lượt mở neo lúc tải
    // trang — phá lại *bỏ mở neo lúc tải* từng xanh đúng vì thế.
    window.history.replaceState(null, '', `${window.location.pathname}#binh-luan-${id(900)}`);
    mo();
    expect(await screen.findByText('Bình luận rất cũ')).toBeDefined();
    await waitFor(() => expect(document.activeElement?.id).toBe(`binh-luan-${id(900)}`));
  });
});

describe('`0264` không lưu nháp — nhưng hỏi trước khi mất chữ', () => {
  it('còn chữ → `beforeunload` bị chặn; ô trống → không', async () => {
    mo();
    await daTai();
    const ev1 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev1);
    expect(ev1.defaultPrevented).toBe(false);
    fireEvent.change(oChinh(), { target: { value: 'đang gõ' } });
    const ev2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);
  });

  it('chuyển màn hình TRONG ứng dụng khi còn chữ → hỏi lại; Huỷ thì đứng yên', async () => {
    let di: (d: string) => void = () => {};
    function LayDi() {
      di = useDuong().di;
      return null;
    }
    render(
      <BoDinhTuyen>
        <LayDi />
        <KhoiBinhLuan hoSoId={HS} />
      </BoDinhTuyen>,
    );
    await daTai();
    fireEvent.change(oChinh(), { target: { value: 'đang gõ' } });
    const hoi = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const truoc = window.location.pathname;
    act(() => di('/khach-hang'));
    expect(hoi).toHaveBeenCalledWith(CAU_ROI_TRANG);
    expect(window.location.pathname).toBe(truoc);
    hoi.mockRestore();
  });

  it('không gì của bình luận ghi vào bộ nhớ trình duyệt', () => {
    for (const tep of tepBinhLuan()) {
      const s = ma(tep);
      expect(s, tep).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });
});

// --- Quét mã nguồn ------------------------------------------------------------------

const GOC = 'apps/web/src/components/binh-luan';
/** Mã thật, không kể chú thích — chú thích được phép NÓI về thứ bị cấm để giải thích vì sao. */
const ma = (tep: string) =>
  readFileSync(tep, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const tepBinhLuan = () => [
  ...readdirSync(GOC).map((f) => join(GOC, f)),
  'apps/web/src/lib/binh-luan.ts',
];

describe('`0264` quét mã nguồn', () => {
  it('KHÔNG đường nào đổ chữ vào HTML', () => {
    for (const tep of tepBinhLuan()) {
      const s = ma(tep);
      expect(s, tep).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML|insertAdjacentHTML/);
    }
  });

  it('giới hạn KHÔNG chép tay — đọc từ `GIOI_HAN_BINH_LUAN` mà máy chủ cũng đọc', () => {
    for (const tep of tepBinhLuan()) {
      const s = ma(tep);
      expect(s, tep).not.toMatch(/\b(5000|5_000|15000|15_000|10485760)\b|10 \* 1024 \* 1024/);
    }
  });

  it('khối nằm NGAY TRÊN *Lịch sử* trong trang hồ sơ', () => {
    const s = readFileSync('apps/web/src/pages/ChiTietHoSo.tsx', 'utf8');
    const a = s.indexOf('<KhoiBinhLuan');
    const b = s.indexOf('<LichSuGap');
    expect(a).toBeGreaterThan(0);
    expect(b - a).toBeGreaterThan(0);
    expect(s.slice(a, b), 'không khối nào chen giữa').not.toMatch(/<(?!KhoiBinhLuan)[A-Z][A-Za-z]+/);
  });
});
