/**
 * @vitest-environment jsdom
 *
 * `0242` — hết phiên ở BẤT KỲ cửa sổ nào: ô đăng nhập lại hiện ra, và KHÔNG một
 * thứ gì phía sau còn nhìn thấy, bấm, Tab hay đọc được bằng trình đọc màn hình.
 *
 * Câu hỏi chung của mọi ca: *ngoài lớp phủ, có phần tử nào còn "sống" không?*
 * — `conLo()` trả về những phần tử trong `body` KHÔNG nằm dưới một tổ tiên
 * `inert` + `aria-hidden`. Hỏi bằng CẤU TRÚC chứ không bằng một danh sách lớp CSS:
 * bản đầu của `0242` chỉ giấu màn hình chính, và hộp lỗi của `BaoLoiProvider` —
 * nằm NGOÀI `App` — vẫn nổi lên trên lớp phủ được; một ca chỉ hỏi "màn hình
 * chính có bị giấu không" sẽ xanh với đúng lỗ ấy.
 */
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@csbh/web/app';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { BaoLoiProvider } from '@csbh/web/bao-loi';
import { dangKyDocPhienLuu, datPhien, goi } from '@csbh/web/api';
import { DIEU_HUONG, VAI_TRO, dieuHuongCho } from '@csbh/web/can';
import { BANG_LOI } from '@csbh/web/loi';
import { KENH_GOOGLE } from '@csbh/web/google-cua-so';

const KHOA = 'csbh:phien';
const KHOA_DANG_XUAT = 'csbh:dang-xuat';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const nguoi = (role = 'TDV', them: Record<string, unknown> = {}) => ({
  id: `u-${role}`,
  username: role.toLowerCase(),
  email: `${role.toLowerCase()}@x.test`,
  fullName: `Nguoi ${role}`,
  role,
  mustChangePassword: false,
  ...them,
});

const phienLuu = (user = nguoi(), rt = 'rt-1') => ({ accessToken: `at-${rt}`, refreshToken: rt, user });
const datPhienLuu = (user = nguoi(), rt = 'rt-1') => localStorage.setItem(KHOA, JSON.stringify(phienLuu(user, rt)));

const RONG = { items: [], total: 0, byStatus: {}, byPendingStep: {}, byStepDetail: {}, byHandler: [] };

/**
 * `fetch` giả. `chet()` bật/tắt: khi chết, MỌI lời gọi có token ăn 401 và làm mới
 * cũng 401 — đúng hình dạng một phiên vừa bị thu hồi ở nơi khác.
 */
function mang(o: { me?: () => Response; khac?: (d: string, init?: RequestInit) => Response | null; google?: boolean } = {}) {
  let chet = false;
  const f = vi.fn((duong: unknown, init?: RequestInit) => {
    const d = String(duong);
    const r = o.khac?.(d, init);
    if (r) return Promise.resolve(r);
    if (d.includes('/auth/phuong-thuc')) return Promise.resolve(json({ google: o.google ?? false }));
    if (d.includes('/auth/refresh')) return Promise.resolve(json({ code: 'REFRESH_INVALID' }, 401));
    if (chet) return Promise.resolve(json({ code: 'TOKEN_EXPIRED' }, 401));
    if (d.includes('/auth/me')) return Promise.resolve(o.me ? o.me() : json(JSON.parse(localStorage.getItem(KHOA) ?? '{}').user ?? nguoi()));
    if (d.includes('/contract-templates')) return Promise.resolve(json([]));
    if (d.includes('/allowed-actions')) return Promise.resolve(json({ allowed: [] }));
    return Promise.resolve(json(RONG));
  });
  vi.stubGlobal('fetch', f);
  return { f, chet: (v = true) => (chet = v) };
}

const mo = (duong = '/') => {
  window.history.replaceState(null, '', duong);
  return render(
    <BaoLoiProvider>
      <BoDinhTuyen>
        <PhienProvider>
          <App />
        </PhienProvider>
      </BoDinhTuyen>
    </BaoLoiProvider>,
  );
};

const lopPhu = () => document.querySelector('.lop-phu-het-phien');
const goc = () => document.querySelector('.goc-lop-phu-het-phien');

/** Phần tử trong `body`, ngoài lớp phủ, mà KHÔNG nằm dưới một tổ tiên bị khoá. */
function conLo(): string[] {
  const g = goc();
  const lo: string[] = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (g && (el === g || g.contains(el))) continue;
    if (el.closest('[inert][aria-hidden="true"]')) continue;
    if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    lo.push(`${el.tagName.toLowerCase()}.${el.className}`);
  }
  return lo;
}

/** Bất biến của cả tệp: lớp phủ CÓ, nằm ngoài cây ứng dụng, và không gì lộ. */
async function phaiCheKin() {
  await waitFor(() => expect(lopPhu(), 'không có lớp phủ hết phiên').not.toBeNull());
  expect(conLo(), 'còn phần tử ngoài lớp phủ chưa bị khoá').toEqual([]);
  // Trình đọc màn hình chỉ còn thấy đúng một vùng: ô đăng nhập lại.
  expect(screen.getByRole('dialog', { name: 'Đăng nhập lại' })).toBeTruthy();
  expect(screen.queryByRole('navigation')).toBeNull();
}

/**
 * `BroadcastChannel` GIẢ, trong bộ nhớ. Trong jsdom của vitest, lớp có sẵn là của
 * Node và KHÔNG chuyển được tin (đo được: `onmessage` không bao giờ chạy, vitest
 * báo lỗi chưa bắt) — giới hạn của môi trường kiểm, không phải của trình duyệt.
 * Bản giả giữ đúng ba tính chất mà mã dựa vào: giao BẤT ĐỒNG BỘ, KHÔNG giao cho
 * chính kênh gửi, và dữ liệu được SAO CHÉP (`structuredClone`) — gửi xong đóng
 * ngay vẫn tới, như trình duyệt.
 */
class KenhGia {
  static ds = new Set<KenhGia>();
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    KenhGia.ds.add(this);
  }
  postMessage(d: unknown) {
    const data = structuredClone(d);
    for (const o of [...KenhGia.ds]) {
      if (o !== this && o.name === this.name) setTimeout(() => o.onmessage?.({ data }), 0);
    }
  }
  close() {
    KenhGia.ds.delete(this);
  }
}

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', KenhGia);
  KenhGia.ds.clear();
  datPhien(null);
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------

describe('`0242` hết phiên trên MỌI màn hình của MỌI vai trò', () => {
  const chiTiet = ['/ho-so/abc', '/ho-so/abc/nhat-ky', '/khach-hang/kh-1', '/thong-tin', '/thong-bao', '/ho-so/moi'];
  for (const vaiTro of VAI_TRO) {
    const duong = [...dieuHuongCho(vaiTro).map((m) => m.duong), ...chiTiet];
    it(`${vaiTro}: ${duong.length} màn hình đều che kín`, async () => {
      for (const d of duong) {
        datPhien(null);
        datPhienLuu(nguoi(vaiTro));
        // Phiên SỐNG lúc khởi động (`/auth/me`), rồi mọi lời gọi dữ liệu 401 —
        // màn hình hết phiên đúng lúc đang mở, và không bao giờ nhận dữ liệu sai
        // hình dạng để mà nổ trước.
        mang({ khac: (x) => (x.includes('/auth/me') || x.includes('/auth/phuong-thuc') ? null : json({ code: 'TOKEN_EXPIRED' }, 401)) });
        mo(d);
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });
        // Màn hình nào không gọi gì lúc mở thì tab khác dọn phiên chết hộ.
        if (!lopPhu()) {
          await act(async () => {
            window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: null }));
          });
        }
        await phaiCheKin().catch((e: Error) => {
          throw new Error(`${vaiTro} ${d}: ${e.message}`);
        });
        cleanup();
        localStorage.clear();
      }
    }, 60_000);
  }

  it('mục điều hướng nào cũng được quét — danh sách không tự thu hẹp', () => {
    const daQuet = new Set(VAI_TRO.flatMap((v) => dieuHuongCho(v).map((m) => m.duong)));
    expect([...daQuet].sort()).toEqual([...new Set(DIEU_HUONG.map((m) => m.duong))].sort());
  });
});

describe('`0242` hết phiên đúng lúc lời gọi 401 trên đường thật', () => {
  it('trang đang tải ăn 401 → lớp phủ, và màn hình cũ vẫn còn TRONG DOM (FE-33)', async () => {
    datPhienLuu();
    mang({ khac: (d) => (d.includes('/policies/inbox') ? json({ code: 'X' }, 401) : null) });
    mo('/');
    await phaiCheKin();
    expect(screen.queryByRole('heading', { name: 'Tổng quan', hidden: true })).not.toBeNull();
  });

  it('thứ nằm NGOÀI `App` (chỗ của hộp lỗi và thông báo nổi) cũng bị khoá dưới lớp phủ', async () => {
    /*
     * `BaoLoiProvider` dựng hộp lỗi làm ANH EM của `App`, không phải con — đúng
     * chỗ bản đầu của `0242` để hở. Dựng một hộp ở đúng vị trí ấy, với chính lớp
     * và `z-index` 70 của hộp lỗi thật, rồi cho phiên chết.
     */
    datPhienLuu();
    mang();
    window.history.replaceState(null, '', '/ho-so');
    render(
      <BaoLoiProvider>
        <BoDinhTuyen>
          <PhienProvider>
            <App />
            <div className="lop-phu lop-phu-loi" role="alertdialog" aria-label="Lỗi">
              Công nợ khách hàng KH-001: 120.000.000
            </div>
          </PhienProvider>
        </BoDinhTuyen>
      </BaoLoiProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeNull());
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: null }));
    });
    await phaiCheKin();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('.lop-phu-loi')!.closest('[inert]')).not.toBeNull();
  });

  it('phần tử gắn THẲNG vào `body` (ngoài cả cây React) cũng bị khoá', async () => {
    const la = document.createElement('div');
    la.textContent = 'thông báo nổi của một thư viện nào đó';
    document.body.appendChild(la);
    try {
      datPhienLuu();
      mang({ khac: (d) => (d.includes('/policies/inbox') ? json({ code: 'X' }, 401) : null) });
      mo('/');
      await phaiCheKin();
      expect(la.hasAttribute('inert')).toBe(true);
    } finally {
      la.remove();
    }
  });

  it('màn hình ĐỔI MẬT KHẨU bắt buộc cũng có lớp phủ', async () => {
    datPhienLuu(nguoi('TDV', { mustChangePassword: true }));
    mang();
    mo('/');
    await screen.findByRole('heading', { name: 'Đổi mật khẩu' });
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: null }));
    });
    await phaiCheKin();
    expect(screen.queryByRole('heading', { name: 'Đổi mật khẩu' })).toBeNull();
  });

  it('đóng lớp phủ thì mọi thứ được MỞ KHOÁ lại', async () => {
    datPhienLuu();
    mang({ khac: (d) => (d.includes('/policies/inbox') ? json({ code: 'X' }, 401) : null) });
    mo('/');
    await phaiCheKin();
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: JSON.stringify(phienLuu(nguoi(), 'rt-2')) }));
    });
    await waitFor(() => expect(lopPhu()).toBeNull());
    expect(document.querySelectorAll('[inert]').length).toBe(0);
    expect(document.querySelectorAll('.an-khi-het-phien').length).toBe(0);
    expect(goc()).toBeNull();
  });
});

describe('`0242` CSS: lớp phủ đặc và cao nhất', () => {
  const css = readFileSync('apps/web/src/styles/app.css', 'utf8');
  const khoi = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    expect(i, `thiếu khối ${sel}`).toBeGreaterThanOrEqual(0);
    return css.slice(i, css.indexOf('}', i));
  };
  it('`z-index` của lớp phủ hết phiên LỚN HƠN mọi `z-index` khác trong tệp', () => {
    const cua = Number(/z-index:\s*(\d+)/.exec(khoi('.lop-phu.lop-phu-het-phien'))![1]);
    const khac = [...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])).filter((n) => n !== cua);
    expect(khac.length).toBeGreaterThan(5);
    expect(cua).toBeGreaterThan(Math.max(...khac));
  });
  it('nền ĐẶC (không phải lớp mờ của hộp thoại), và phần bị khoá thì vô hình', () => {
    const phu = khoi('.lop-phu.lop-phu-het-phien');
    expect(phu).not.toContain('--mau-lop-phu');
    expect(phu).toMatch(/background-color:\s*var\(--mau-nen-phu\)/);
    expect(khoi('.an-khi-het-phien')).toMatch(/visibility:\s*hidden/);
  });
});

describe('`0242` nhiều cửa sổ', () => {
  it('tab kia ĐĂNG XUẤT → tab này về màn hình đăng nhập, không còn gì của phiên cũ', async () => {
    datPhienLuu();
    sessionStorage.setItem('csbh:nhap:ho-so-moi', '"ban nhap"');
    mang();
    mo('/ho-so');
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeNull());
    localStorage.setItem(KHOA_DANG_XUAT, String(Date.now()));
    localStorage.removeItem(KHOA);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: null }));
    });
    await screen.findByRole('button', { name: /^Đăng nhập$/ });
    expect(lopPhu()).toBeNull();
    expect(screen.queryByRole('navigation', { hidden: true })).toBeNull();
    expect(sessionStorage.getItem('csbh:nhap:ho-so-moi'), 'bản nháp phải bị xoá khi đăng xuất').toBeNull();
  });

  it('tab kia DỌN phiên đã chết (không phải đăng xuất) → lớp phủ, GIỮ bản nháp', async () => {
    datPhienLuu();
    sessionStorage.setItem('csbh:nhap:ho-so-moi', '"ban nhap"');
    mang();
    mo('/ho-so');
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeNull());
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: null }));
    });
    await phaiCheKin();
    expect(sessionStorage.getItem('csbh:nhap:ho-so-moi')).toBe('"ban nhap"');
  });

  it('tab kia ĐĂNG NHẬP LẠI (cùng người) → lớp phủ ở tab này tự đóng, màn hình cũ CÒN NGUYÊN', async () => {
    datPhienLuu();
    mang();
    mo('/ho-so');
    const tieuDe = await screen.findByRole('heading', { name: 'Hồ sơ CSBH' });
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: null }));
    });
    await phaiCheKin();
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: JSON.stringify(phienLuu(nguoi(), 'rt-2')) }));
    });
    await waitFor(() => expect(lopPhu()).toBeNull());
    // CÙNG một nút DOM — không dựng lại, nên state React của biểu mẫu còn nguyên.
    expect(screen.getByRole('heading', { name: 'Hồ sơ CSBH' })).toBe(tieuDe);
    expect(window.location.pathname).toBe('/ho-so');
  });

  it('tab kia đã XOAY VÒNG token → tab này dùng bản mới, KHÔNG nộp lại token đã tiêu', async () => {
    /*
     * Nộp lại refresh token đã tiêu là máy chủ đọc ra BỊ ĐÁNH CẮP (`REFRESH_REUSED`)
     * và thu hồi CẢ HỌ — hai tab mở quá 15 phút là cả hai bị đá ra.
     */
    dangKyDocPhienLuu(() => ({ accessToken: 'at-moi', refreshToken: 'rt-moi' }));
    datPhien({ accessToken: 'at-cu', refreshToken: 'rt-cu' });
    const f = vi.fn((duong: unknown, init?: RequestInit) => {
      if (String(duong).includes('/auth/refresh')) return Promise.resolve(json({}, 401));
      const auth = (init?.headers as Record<string, string>)['authorization'];
      return Promise.resolve(auth === 'Bearer at-moi' ? json({ ok: true }) : json({ code: 'TOKEN_EXPIRED' }, 401));
    });
    vi.stubGlobal('fetch', f);
    await expect(goi('/policies')).resolves.toEqual({ ok: true });
    expect(f.mock.calls.some((c) => String(c[0]).includes('/auth/refresh'))).toBe(false);
  });

  /*
   * Tab IM LẶNG thật: màn hình không tự gọi gì sau khi lên. Ca bản đầu đứng ở
   * `/ho-so` và XANH cả khi gỡ hẳn lượt hỏi lúc quay lại tab — màn hình ấy tự gọi
   * lại báo cáo, và chính các lượt ấy bật lớp phủ. Nên giờ ca tự KHẲNG ĐỊNH tiền
   * đề trước: không lời gọi mới, và phiên chết mà CHƯA có lớp phủ.
   */
  const tabImLang = async () => {
    datPhienLuu();
    const m = mang();
    mo('/thong-tin');
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeNull());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    const so = m.f.mock.calls.length;
    m.chet();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(m.f.mock.calls.length, 'tiền đề: màn hình này không được tự gọi gì').toBe(so);
    expect(lopPhu(), 'tiền đề: phiên chết mà chưa ai biết').toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    return m;
  };

  it('tab để KHÔNG lâu: QUAY LẠI tab (visibilitychange) thì hỏi máy chủ → che ngay', async () => {
    await tabImLang();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await phaiCheKin();
  });

  it('quay lại tab ở màn hình ĐỔI MẬT KHẨU — nơi KHÔNG có chuông thông báo — vẫn hỏi', async () => {
    /*
     * Chuông (`thong-bao.ts`, `0096`) cũng hỏi lại lúc quay lại tab, nên trên mọi
     * màn hình có chuông thì có HAI đường bật lớp phủ — phá lại: gỡ lượt hỏi của
     * `auth.tsx` mà ca ở `/thong-tin` vẫn xanh. Chuông chỉ sống trong `BoCuc`;
     * màn hình đổi mật khẩu thì không, nên ở đây chỉ còn đường của `auth.tsx`.
     */
    datPhienLuu(nguoi('TDV', { mustChangePassword: true }));
    const m = mang();
    mo('/');
    await screen.findByRole('heading', { name: 'Đổi mật khẩu' });
    m.chet();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(lopPhu(), 'tiền đề: phiên chết mà chưa ai biết').toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await phaiCheKin();
  });

  it('tab để KHÔNG lâu: bấm vào cửa sổ (focus) cũng hỏi', async () => {
    await tabImLang();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await phaiCheKin();
  });

  it('tab đang HIỆN mà không ai chạm: đồng hồ 5 phút tự hỏi', async () => {
    const dat = vi.spyOn(window, 'setInterval');
    await tabImLang();
    const dong = dat.mock.calls.find((c) => c[1] === 5 * 60_000);
    expect(dong, 'không có đồng hồ 5 phút nào').toBeTruthy();
    await act(async () => {
      (dong![0] as () => void)();
    });
    await phaiCheKin();
  });

  it('quay lại tab liên tục KHÔNG dội máy chủ — tối đa một lượt hỏi mỗi 30 giây', async () => {
    datPhienLuu();
    const { f } = mang();
    mo('/ho-so');
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeNull());
    const truoc = f.mock.calls.filter((c) => String(c[0]).includes('/auth/me')).length;
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    expect(f.mock.calls.filter((c) => String(c[0]).includes('/auth/me')).length).toBe(truoc);
  });
});

describe('`0242` đăng nhập lại ở lớp phủ', () => {
  const hetPhien = async (duong = '/ho-so', google = false, khac?: (d: string, i?: RequestInit) => Response | null) => {
    datPhienLuu();
    sessionStorage.setItem('csbh:nhap:ho-so-moi', '"ban nhap"');
    const m = mang({ google, ...(khac ? { khac } : {}) });
    mo(duong);
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeNull());
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: KHOA, newValue: null }));
    });
    await phaiCheKin();
    return m;
  };
  const trongLopPhu = () => within(lopPhu() as HTMLElement);

  it('CÙNG người đăng nhập lại → ở nguyên chỗ, bản nháp còn', async () => {
    await hetPhien('/ho-so', false, (d) =>
      d.includes('/auth/login') ? json({ ...phienLuu(nguoi(), 'rt-9'), mustChangePassword: false }) : null,
    );
    await userEvent.type(trongLopPhu().getByLabelText(/Tên đăng nhập/), 'tdv');
    await userEvent.type(trongLopPhu().getByLabelText(/^Mật khẩu/), 'MatKhau@2026');
    await userEvent.click(trongLopPhu().getByRole('button', { name: /^Đăng nhập$/ }));
    await waitFor(() => expect(lopPhu()).toBeNull());
    expect(window.location.pathname).toBe('/ho-so');
    expect(sessionStorage.getItem('csbh:nhap:ho-so-moi')).toBe('"ban nhap"');
  });

  it('NGƯỜI KHÁC đăng nhập vào lớp phủ → màn hình người trước bị dỡ, về Tổng quan, bản nháp bị xoá', async () => {
    await hetPhien('/ho-so', false, (d) =>
      d.includes('/auth/login') ? json({ ...phienLuu(nguoi('KE_TOAN'), 'rt-9'), mustChangePassword: false }) : null,
    );
    const cu = screen.getByRole('heading', { name: 'Hồ sơ CSBH', hidden: true });
    await userEvent.type(trongLopPhu().getByLabelText(/Tên đăng nhập/), 'ketoan');
    await userEvent.type(trongLopPhu().getByLabelText(/^Mật khẩu/), 'MatKhau@2026');
    await userEvent.click(trongLopPhu().getByRole('button', { name: /^Đăng nhập$/ }));
    await waitFor(() => expect(lopPhu()).toBeNull());
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(cu.isConnected, 'màn hình của người trước vẫn còn trong DOM').toBe(false);
    expect(sessionStorage.getItem('csbh:nhap:ho-so-moi')).toBeNull();
  });

  it('NGƯỜI KHÁC vào khi đang đứng ở Tổng quan — đường dẫn không đổi, màn hình VẪN phải dỡ', async () => {
    // Ở `/ho-so` thì lượt `di('/')` đã tự tháo màn hình cũ, nên ca trên không tách
    // được vai trò của `key` (phá lại: gỡ `key` vẫn xanh). Ở `/` chỉ `key` tháo được.
    await hetPhien('/', false, (d) =>
      d.includes('/auth/login') ? json({ ...phienLuu(nguoi('KE_TOAN'), 'rt-9'), mustChangePassword: false }) : null,
    );
    const cu = screen.getByRole('heading', { name: 'Tổng quan', hidden: true });
    await userEvent.type(trongLopPhu().getByLabelText(/Tên đăng nhập/), 'ketoan');
    await userEvent.type(trongLopPhu().getByLabelText(/^Mật khẩu/), 'MatKhau@2026');
    await userEvent.click(trongLopPhu().getByRole('button', { name: /^Đăng nhập$/ }));
    await waitFor(() => expect(lopPhu()).toBeNull());
    expect(cu.isConnected, 'màn hình của người trước vẫn còn trong DOM').toBe(false);
  });

  it('mất mạng lúc đăng nhập lại → lỗi DƯỚI Ô, không đẩy ra hộp thoại nằm dưới lớp phủ', async () => {
    await hetPhien('/ho-so', false, (d) => {
      if (d.includes('/auth/login')) throw new TypeError('Failed to fetch');
      return null;
    });
    // So SỐ hộp lỗi trước/sau lượt bấm: màn hình phía sau có thể đã tự mở hộp
    // lỗi của nó (bản giả mạng trả hình dạng chung cho mọi đường), và câu hỏi ở
    // đây chỉ là lỗi ĐĂNG NHẬP LẠI có bị đẩy ra một hộp mới hay không.
    const truoc = document.querySelectorAll('.lop-phu-loi').length;
    await userEvent.type(trongLopPhu().getByLabelText(/Tên đăng nhập/), 'tdv');
    await userEvent.type(trongLopPhu().getByLabelText(/^Mật khẩu/), 'MatKhau@2026');
    await userEvent.click(trongLopPhu().getByRole('button', { name: /^Đăng nhập$/ }));
    expect(await trongLopPhu().findByText(BANG_LOI['MAT_KET_NOI']!.cau!)).toBeTruthy();
    expect(document.querySelectorAll('.lop-phu-loi').length).toBe(truoc);
  });

  describe('Google trong cửa sổ bật lên', () => {
    const giaCuaSo = () => {
      const w = { closed: false };
      const open = vi.spyOn(window, 'open').mockReturnValue(w as unknown as Window);
      return { w, open };
    };
    const maCuaSoTu = (open: ReturnType<typeof vi.spyOn>) =>
      new URL(String(open.mock.calls[0]![0]), 'http://x').searchParams.get('cua_so')!;
    const gui = async (tin: unknown) => {
      const k = new BroadcastChannel(KENH_GOOGLE);
      k.postMessage(tin);
      k.close();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
    };

    it('lớp phủ có nút Google; bấm là mở CỬA SỔ BẬT LÊN, trang này không rời đi', async () => {
      await hetPhien('/ho-so', true);
      const { open } = giaCuaSo();
      await userEvent.click(await trongLopPhu().findByRole('button', { name: /Đăng nhập bằng Google/ }));
      expect(open).toHaveBeenCalledTimes(1);
      const url = String(open.mock.calls[0]![0]);
      expect(url).toMatch(/^\/api\/auth\/google\/start\?cua_so=[A-Za-z0-9_-]{8,64}$/);
      expect(window.location.pathname).toBe('/ho-so');
      expect(trongLopPhu().getByRole('button', { name: /Đang chờ cửa sổ Google/ })).toBeTruthy();
    });

    it('cửa sổ con trả mã ĐÚNG lượt → nộp mã, lớp phủ đóng, ở nguyên chỗ', async () => {
      const m = await hetPhien('/ho-so', true, (d) =>
        d.includes('/auth/google/exchange') ? json({ ...phienLuu(nguoi(), 'rt-g'), mustChangePassword: false }) : null,
      );
      const { open } = giaCuaSo();
      await userEvent.click(await trongLopPhu().findByRole('button', { name: /Đăng nhập bằng Google/ }));
      await gui({ cuaSo: maCuaSoTu(open), ma: 'ma-mot-lan' });
      await waitFor(() => expect(lopPhu()).toBeNull());
      const nop = m.f.mock.calls.filter((c) => String(c[0]).includes('/auth/google/exchange'));
      expect(nop).toHaveLength(1);
      expect(JSON.parse(String((nop[0]![1] as RequestInit).body))).toEqual({ ma: 'ma-mot-lan' });
      expect(window.location.pathname).toBe('/ho-so');
    });

    it('tin mang mã của lượt KHÁC (tab khác) thì bỏ qua', async () => {
      const m = await hetPhien('/ho-so', true);
      giaCuaSo();
      await userEvent.click(await trongLopPhu().findByRole('button', { name: /Đăng nhập bằng Google/ }));
      await gui({ cuaSo: 'ma-cua-luot-khac-123', ma: 'x' });
      expect(m.f.mock.calls.some((c) => String(c[0]).includes('/auth/google/exchange'))).toBe(false);
      expect(lopPhu()).not.toBeNull();
    });

    it('cửa sổ con báo lỗi → câu của bảng tra dưới ô', async () => {
      await hetPhien('/ho-so', true);
      const { open } = giaCuaSo();
      await userEvent.click(await trongLopPhu().findByRole('button', { name: /Đăng nhập bằng Google/ }));
      await gui({ cuaSo: maCuaSoTu(open), loi: 'GOOGLE_LOGIN_FAILED' });
      expect(await trongLopPhu().findByText(BANG_LOI['GOOGLE_LOGIN_FAILED']!.cau!)).toBeTruthy();
    });

    it('trình duyệt CHẶN cửa sổ bật lên → nói ra, không đứng chờ', async () => {
      await hetPhien('/ho-so', true);
      vi.spyOn(window, 'open').mockReturnValue(null);
      await userEvent.click(await trongLopPhu().findByRole('button', { name: /Đăng nhập bằng Google/ }));
      expect(await trongLopPhu().findByText(/chặn cửa sổ đăng nhập Google/)).toBeTruthy();
      expect(trongLopPhu().getByRole('button', { name: /Đăng nhập bằng Google/ })).toBeTruthy();
    });

    it('người dùng tự đóng cửa sổ con → nút trở lại bấm được', async () => {
      await hetPhien('/ho-so', true);
      const { w } = giaCuaSo();
      await userEvent.click(await trongLopPhu().findByRole('button', { name: /Đăng nhập bằng Google/ }));
      w.closed = true;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600));
      });
      expect(trongLopPhu().getByRole('button', { name: /Đăng nhập bằng Google/ })).toBeTruthy();
    });
  });
});

describe('`0242` trang /dang-nhap/google trong CỬA SỔ CON', () => {
  it('chuyển mã về trang mẹ qua kênh, KHÔNG tự nộp, KHÔNG khôi phục phiên cũ, rồi tự đóng', async () => {
    datPhienLuu();
    const { f } = mang();
    const dong = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const nhan: unknown[] = [];
    const k = new BroadcastChannel(KENH_GOOGLE);
    k.onmessage = (e) => nhan.push(e.data);
    mo('/dang-nhap/google#ma=ma-1&next=%2F&cua_so=abcdefgh1234');
    await waitFor(() => expect(nhan).toEqual([{ cuaSo: 'abcdefgh1234', ma: 'ma-1' }]));
    k.close();
    expect(dong).toHaveBeenCalled();
    expect(f.mock.calls.some((c) => String(c[0]).includes('/auth/google/exchange'))).toBe(false);
    // Không hỏi `/auth/me` bằng phiên cũ — hỏi là ăn 401 rồi xoá phiên dưới chân trang mẹ.
    expect(f.mock.calls.some((c) => String(c[0]).includes('/auth/me'))).toBe(false);
    expect(localStorage.getItem(KHOA)).not.toBeNull();
    expect(await screen.findByText(/có thể đóng cửa sổ này/)).toBeTruthy();
  });

  it('lỗi cũng đi về trang mẹ', async () => {
    mang();
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const nhan: unknown[] = [];
    const k = new BroadcastChannel(KENH_GOOGLE);
    k.onmessage = (e) => nhan.push(e.data);
    mo('/dang-nhap/google#loi=GOOGLE_STATE_INVALID&cua_so=abcdefgh1234');
    await waitFor(() => expect(nhan).toEqual([{ cuaSo: 'abcdefgh1234', loi: 'GOOGLE_STATE_INVALID' }]));
    k.close();
  });
});

void fireEvent;
