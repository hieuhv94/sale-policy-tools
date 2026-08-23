/**
 * @vitest-environment jsdom
 *
 * `0096` — cái chuông thông báo.
 *
 * Hai lớp, và chúng hỏng theo hai kiểu khác nhau:
 *
 *   1. **Phép toán của huy hiệu và của câu thời gian.** Đây là phần sai IM
 *      LẶNG: một huy hiệu ghi `9+` trong khi hộp có 250 dòng vẫn trông bình
 *      thường, và "3 giờ trước" tính nhầm cũng vậy.
 *   2. **Luồng trên màn hình.** Bấm vào một dòng phải đi ĐÚNG đường mà máy chủ
 *      gửi xuống — cùng đường mà thư dẫn tới. Ca đối chiếu hai bên nằm ở
 *      `tests/http/thong-bao.test.ts`; ở đây kiểm rằng giao diện KHÔNG tự dựng
 *      lại đường ấy.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PhienProvider, usePhien } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { ChuongThongBao } from '@csbh/web/chuong';
import {
  datLaiSoChuaDoc,
  nhanChuong,
  nhanHuyHieu,
  thoiGianTuongDoi,
  TRAN_HUY_HIEU,
} from '@csbh/web/thong-bao';

const doc = (p: string) => readFileSync(`apps/web/src/${p}`, 'utf8');

// --- Lớp 1: phép toán --------------------------------------------------------

describe('`0096` huy hiệu hiện CON SỐ, không phải một dấu chấm', () => {
  it('không có gì chưa đọc thì không vẽ huy hiệu', () => {
    expect(nhanHuyHieu(0)).toBe('');
    expect(nhanHuyHieu(-3)).toBe('');
    expect(nhanHuyHieu(Number.NaN)).toBe('');
  });

  it('dưới trần thì in đúng con số', () => {
    expect(nhanHuyHieu(1)).toBe('1');
    expect(nhanHuyHieu(12)).toBe('12');
    expect(nhanHuyHieu(TRAN_HUY_HIEU)).toBe('99');
  });

  it('quá trần thì `99+`, không phải `100`', () => {
    // Chốt 23/08. `100` là chữ số thứ ba và nó đội huy hiệu tròn thành một viên
    // thuốc dài, đẩy lệch cả thanh trên cùng.
    expect(nhanHuyHieu(100)).toBe('99+');
    expect(nhanHuyHieu(2508)).toBe('99+');
  });

  it('câu đọc lên nói con số THẬT, không nói `99+`', () => {
    // Trần kia sinh ra vì chỗ hẹp trên màn hình; một câu đọc lên thì không hẹp.
    expect(nhanChuong(250)).toContain('250');
    expect(nhanChuong(250)).not.toContain('99+');
    expect(nhanChuong(0)).toBe('Thông báo — đã đọc hết');
  });
});

describe('`0096` thời gian tương đối', () => {
  const BAY_GIO = Date.parse('2026-08-23T10:00:00.000Z');
  const truoc = (ms: number) => new Date(BAY_GIO - ms).toISOString();

  it('bậc thang phút · giờ · ngày', () => {
    expect(thoiGianTuongDoi(truoc(30_000), BAY_GIO)).toBe('vừa xong');
    expect(thoiGianTuongDoi(truoc(5 * 60_000), BAY_GIO)).toBe('5 phút trước');
    expect(thoiGianTuongDoi(truoc(3 * 3_600_000), BAY_GIO)).toBe('3 giờ trước');
    expect(thoiGianTuongDoi(truoc(2 * 86_400_000), BAY_GIO)).toBe('2 ngày trước');
  });

  it('quá bảy ngày thì trả về ngày giờ TUYỆT ĐỐI', () => {
    // "43 ngày trước" bắt người đọc tự trừ ra; một cái mốc thì đọc thẳng.
    const cu = thoiGianTuongDoi(truoc(43 * 86_400_000), BAY_GIO);
    expect(cu).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('mốc ở TƯƠNG LAI đọc là "vừa xong", không phải số âm', () => {
    // Xảy ra thật khi đồng hồ máy trạm lệch vài giây so với máy chủ.
    expect(thoiGianTuongDoi(new Date(BAY_GIO + 4000).toISOString(), BAY_GIO)).toBe('vừa xong');
  });

  it('không có mốc thì gạch ngang, không phải `Invalid Date`', () => {
    expect(thoiGianTuongDoi(null)).toBe('—');
    expect(thoiGianTuongDoi('khong-phai-ngay')).toBe('—');
  });
});

// --- Lớp 2: màn hình ---------------------------------------------------------

const phien = () => ({
  accessToken: 'a',
  refreshToken: 'r',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'tdv01',
    fullName: 'Người kiểm thử',
    email: 'tdv01@nutricare.com.vn',
    role: 'TDV',
    mustChangePassword: false,
  },
});

const TB = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'tb-1',
  kind: 'CHINH',
  action: 'TBP_RETURN',
  tieuDe: 'Hồ sơ bị trả lại để chỉnh sửa',
  moTa: 'KH0007 — Nhà thuốc Minh Châu · CS-2026-0031',
  duongDan: '/ho-so/abc-123',
  policyId: 'abc-123',
  customerId: null,
  xayRaLuc: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  daDocLuc: null,
  ...o,
});

let daGoi: string[] = [];
let hop = { items: [TB()], total: 1, limit: 10, offset: 0, soChuaDoc: 1 };
let soChuaDoc = 1;

const chan = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: string, tuyChon?: { method?: string }) => {
      daGoi.push(`${tuyChon?.method ?? 'GET'} ${duong}`);
      const than = duong.includes('/auth/me')
        ? phien().user
        : duong.includes('/cua-toi/dem')
          ? { soChuaDoc }
          : duong.includes('/da-doc')
            ? { soChuaDoc: 0, soDaDanhDau: 1 }
            : hop;
      return Promise.resolve(
        new Response(JSON.stringify(than), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );

function ChoPhien({ children }: { children: React.ReactNode }) {
  const { dangTai } = usePhien();
  return dangTai ? null : <>{children}</>;
}

const mo = () => {
  localStorage.setItem('csbh:phien', JSON.stringify(phien()));
  render(
    <PhienProvider>
      <BoDinhTuyen>
        <ChoPhien>
          <ChuongThongBao />
        </ChoPhien>
      </BoDinhTuyen>
    </PhienProvider>,
  );
};

const chuong = () => screen.getByRole('button', { name: /Thông báo/ });

beforeEach(() => {
  daGoi = [];
  soChuaDoc = 1;
  hop = { items: [TB()], total: 1, limit: 10, offset: 0, soChuaDoc: 1 };
  datLaiSoChuaDoc();
  chan();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('`0096` cái chuông trên thanh tiêu đề', () => {
  it('hỏi số chưa đọc ngay lúc dựng và vẽ huy hiệu', async () => {
    soChuaDoc = 7;
    mo();
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());
    expect(daGoi.some((d) => d.includes('/notifications/cua-toi/dem'))).toBe(true);
    // KHÔNG kéo cả danh sách về chỉ để lấy một con số — đường này chạy mỗi 60
    // giây cho mọi phiên đang mở.
    expect(daGoi.some((d) => /cua-toi\?/.test(d))).toBe(false);
  });

  it('hộp rỗng thì KHÔNG có huy hiệu nào', async () => {
    soChuaDoc = 0;
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    expect(screen.queryByText('0')).toBeNull();
  });

  it('quá 99 thì huy hiệu ghi `99+` còn nhãn đọc lên nói số thật', async () => {
    soChuaDoc = 250;
    mo();
    await waitFor(() => expect(screen.getByText('99+')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Thông báo — 250 chưa đọc' })).toBeTruthy();
  });

  it('bấm mới tải danh sách, và mỗi dòng là một LIÊN KẾT tới đường máy chủ gửi', async () => {
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    expect(daGoi.some((d) => /cua-toi\?/.test(d))).toBe(false);

    fireEvent.click(chuong());
    await waitFor(() => expect(screen.getByText('Hồ sơ bị trả lại để chỉnh sửa')).toBeTruthy());

    /*
     * `href` lấy NGUYÊN VĂN từ `duongDan` của máy chủ — không ghép lại từ
     * `policyId`. Ghép lại là dựng nguồn thứ hai cho cùng một câu trả lời, và
     * lá thư "để biết" (`/nhat-ky`) sẽ đi nhầm chỗ ngay lượt sửa đầu tiên.
     */
    const lien = screen.getByRole('link', { name: /Hồ sơ bị trả lại/ });
    expect(lien.getAttribute('href')).toBe('/ho-so/abc-123');
    expect(screen.getByText('3 giờ trước')).toBeTruthy();
  });

  it('dòng "để biết" mang nhãn riêng và trỏ vào lịch sử hồ sơ', async () => {
    hop = {
      ...hop,
      items: [TB({ kind: 'THEO_DOI', duongDan: '/ho-so/abc-123/nhat-ky' })],
    };
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    fireEvent.click(chuong());

    await waitFor(() => expect(screen.getByText('để biết')).toBeTruthy());
    expect(
      screen.getByRole('link', { name: /Hồ sơ bị trả lại/ }).getAttribute('href'),
    ).toBe('/ho-so/abc-123/nhat-ky');
  });

  it('bấm một dòng thì báo đã đọc và huy hiệu tắt ngay', async () => {
    mo();
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());
    fireEvent.click(chuong());
    await waitFor(() => expect(screen.getByRole('link', { name: /Hồ sơ/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('link', { name: /Hồ sơ/ }));
    await waitFor(() =>
      expect(daGoi.some((d) => d === 'POST /api/notifications/tb-1/da-doc')).toBe(true),
    );
    expect(screen.queryByText('1')).toBeNull();
  });

  it('hộp trống nói ra bằng chữ, không để một khối rỗng', async () => {
    soChuaDoc = 0;
    hop = { items: [], total: 0, limit: 10, offset: 0, soChuaDoc: 0 };
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    fireEvent.click(chuong());
    await waitFor(() => expect(screen.getByText('Chưa có thông báo nào.')).toBeTruthy());
  });

  it('`Escape` đóng bảng và trả tiêu điểm về nút', async () => {
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    fireEvent.click(chuong());
    await waitFor(() => expect(chuong().getAttribute('aria-expanded')).toBe('true'));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(chuong().getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(chuong());
  });
});

describe('`0096` chuông nằm đúng chỗ và không dựng mẫu sổ xuống thứ hai', () => {
  it('đứng sát trái thẻ tài khoản trong `BoCuc`', () => {
    // Thứ tự trong JSX là thứ tự trên màn hình: nút giao diện, vai trò, chuông,
    // thẻ tài khoản. Chuông thuộc cụm "của tôi", không thuộc cụm tuỳ chọn.
    const s = doc('components/BoCuc.tsx');
    expect(s.indexOf('<ChuongThongBao')).toBeGreaterThan(s.indexOf('vai-tro-rieng'));
    expect(s.indexOf('<ChuongThongBao')).toBeLessThan(s.indexOf('<MenuTaiKhoan'));
  });

  it('dùng lại `menu-so` chứ không dựng lại khối sổ xuống', () => {
    // Hai khối sổ xuống cạnh nhau trên cùng một thanh mà lệch nhau vài pixel là
    // thứ người dùng cảm thấy trước khi kịp gọi tên.
    expect(doc('components/ChuongThongBao.tsx')).toContain('menu-so');
  });
});
