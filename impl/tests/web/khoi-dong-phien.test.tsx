/**
 * @vitest-environment jsdom
 *
 * `0076` — mở phần mềm ra thì XÁC THỰC phiên trước, rồi mới dựng màn hình.
 *
 * Lỗi người dùng báo: vào địa chỉ gốc khi chưa đăng nhập thì hiện **nền của
 * trang tổng quan** với một lớp phủ *"phiên hết hạn"* đè lên.
 *
 * Đường đi tới cảnh ấy, và không bước nào trong đó là lỗi rõ ràng:
 *
 *   1. `localStorage` còn phiên của lần dùng trước → khôi phục, tin luôn.
 *   2. Màn hình dựng đủ *Tổng quan*, gọi báo cáo và hộp việc.
 *   3. Token chết → 401 → làm mới hỏng → `hetHan`.
 *   4. `FE-33` nói phiên hết hạn KHÔNG được dỡ màn hình đang mở, nên lớp phủ
 *      nằm đè lên — đúng như thiết kế, nhưng thứ nằm dưới là một trang mà người
 *      dùng chưa hề đăng nhập để vào.
 *
 * Chỗ sai là bước 1: **chưa hỏi máy chủ mà đã tin**. Nên tệp này kiểm cả bốn
 * nhánh khởi động, và kiểm luôn rằng `FE-33` không bị sửa hỏng theo — hai hành
 * vi ấy trông giống nhau và rất dễ gộp nhầm làm một.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '@csbh/web/app';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { datPhien } from '@csbh/web/api';

const KHOA = 'csbh:phien';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Hồ sơ người dùng như máy chủ trả ở `/auth/me`. */
const nguoiDung = (them: Record<string, unknown> = {}) => ({
  id: 'u-1',
  username: 'kt01',
  fullName: 'Ke Toan Mot',
  email: 'kt01@example.com',
  role: 'KE_TOAN',
  mustChangePassword: false,
  ...them,
});

/** Phiên nằm sẵn trong `localStorage`, như sau một lần đăng nhập của hôm trước. */
const datPhienLuu = (user: Record<string, unknown> = nguoiDung()) =>
  localStorage.setItem(KHOA, JSON.stringify({ accessToken: 'at-cu', refreshToken: 'rt-cu', user }));

/**
 * `fetch` giả: `me` quyết định `/auth/me` trả gì, mọi đường còn lại trả hình
 * dạng rỗng đủ để trang tổng quan dựng xong.
 */
const chanMang = (me: () => Promise<Response>, khac?: (d: string) => Response | null) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/auth/me')) return me();
    // Làm mới HỎNG ở mọi ca: phiên trong `localStorage` là phiên đã chết, và
    // chính đường này là thứ quyết định 401 kia có cứu được hay không.
    if (d.includes('/auth/refresh')) return Promise.resolve(json({}, 401));
    const r = khac?.(d);
    if (r) return Promise.resolve(r);
    if (d.includes('/contract-templates')) return Promise.resolve(json([]));
    return Promise.resolve(
      json({ items: [], total: 0, byStatus: {}, byPendingStep: {}, byStepDetail: {}, byHandler: [] }),
    );
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const mo = () => {
  window.history.replaceState(null, '', '/');
  render(
    <BoDinhTuyen>
      <PhienProvider>
        <App />
      </PhienProvider>
    </BoDinhTuyen>,
  );
};

const oBangDangNhap = () => screen.queryByRole('button', { name: /^Đăng nhập$/i });
const coTongQuan = () => screen.queryByRole('heading', { name: 'Tổng quan' });
/** Lớp phủ đăng nhập lại — dấu hiệu của phiên hết hạn GIỮA CHỪNG. */
const coLopPhu = () => document.querySelector('.lop-phu');

beforeEach(() => {
  // `api.ts` giữ phiên ở biến cấp mô-đun, sống qua từng ca trong cùng một tệp.
  // Không xoá thì ca sau thừa hưởng token của ca trước.
  datPhien(null);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('`0076` bốn nhánh khởi động', () => {
  it('KHÔNG có phiên lưu → hiện bảng đăng nhập, và không hỏi máy chủ làm gì', async () => {
    const f = chanMang(() => Promise.resolve(json(nguoiDung())));
    mo();

    await waitFor(() => expect(oBangDangNhap()).not.toBeNull());
    expect(coTongQuan()).toBeNull();
    // Không có gì để xác thực thì đừng gọi: một lượt mạng thừa ở đúng lúc người
    // dùng đang chờ màn hình đầu tiên hiện ra.
    expect(f.mock.calls.some((c) => String(c[0]).includes('/auth/me'))).toBe(false);
  });

  it('phiên lưu CÒN SỐNG → vào trang tổng quan, dùng hồ sơ MỚI của máy chủ', async () => {
    /*
     * Hồ sơ lấy từ máy chủ chứ không từ bản đã lưu. Quản trị đổi vai trò hay
     * bật buộc đổi mật khẩu thì có hiệu lực ngay lần mở tiếp theo — trước đợt
     * này bản lưu sống mãi tới lần đăng nhập lại.
     */
    datPhienLuu(nguoiDung({ fullName: 'Ten Cu' }));
    chanMang(() => Promise.resolve(json(nguoiDung({ fullName: 'Ten Moi' }))));
    mo();

    await waitFor(() => expect(coTongQuan()).not.toBeNull());
    expect(document.body.textContent).toContain('Ten Moi');
    expect(document.body.textContent).not.toContain('Ten Cu');
    expect(localStorage.getItem(KHOA)).toContain('Ten Moi');
  });

  it('phiên lưu ĐÃ CHẾT → CHỈ bảng đăng nhập, không nền tổng quan, không lớp phủ', async () => {
    /*
     * Đây đúng là cảnh người dùng báo. Ba khẳng định, và cả ba đều cần:
     * có bảng đăng nhập, KHÔNG có trang tổng quan phía sau, KHÔNG có lớp phủ.
     */
    datPhienLuu();
    chanMang(() => Promise.resolve(json({ code: 'UNAUTHORIZED' }, 401)));
    mo();

    await waitFor(() => expect(oBangDangNhap()).not.toBeNull());
    expect(coTongQuan(), 'nền trang tổng quan vẫn hiện sau lưng bảng đăng nhập').toBeNull();
    expect(coLopPhu(), 'bảng đăng nhập mọc thêm một lớp phủ chồng lên chính nó').toBeNull();
    // Phiên chết thì xoá hẳn, không để lại cho lần mở sau lặp lại đúng vòng này.
    expect(localStorage.getItem(KHOA)).toBeNull();
  });

  it('LỖI MẠNG → vẫn vào bằng hồ sơ đã lưu, và KHÔNG xoá phiên', async () => {
    /*
     * Nhánh dễ làm sai nhất. Máy chủ khởi động lại hay mạng chập vài giây thì
     * chưa biết gì về phiên cả — coi như chết rồi xoá token là biến một sự cố
     * thoáng qua thành một lần đăng nhập lại, và người dùng không hiểu vì sao.
     */
    datPhienLuu(nguoiDung({ fullName: 'Ten Da Luu' }));
    chanMang(() => Promise.reject(new TypeError('Failed to fetch')));
    mo();

    await waitFor(() => expect(coTongQuan()).not.toBeNull());
    expect(document.body.textContent).toContain('Ten Da Luu');
    expect(localStorage.getItem(KHOA), 'sự cố mạng không được xoá phiên').not.toBeNull();
  });
});

describe('`0076` không được sửa hỏng `FE-33`', () => {
  it('hết hạn GIỮA CHỪNG vẫn là lớp phủ ĐÈ LÊN màn hình cũ, không dỡ nó đi', async () => {
    /*
     * Hai hành vi trông giống nhau — cùng là "phiên chết, hiện bảng đăng nhập" —
     * nhưng chúng phải khác nhau, và gộp nhầm làm một là hỏng một trong hai:
     *
     *   - chết LÚC KHỞI ĐỘNG: chưa có gì để giữ, dựng nền lên là nói dối;
     *   - chết GIỮA CHỪNG: có thể đang dở một hồ sơ 20 dòng, dỡ màn hình đi là
     *     xoá sạch việc của người ta (`FE-33`).
     *
     * Dựng đúng ca thứ hai: `/auth/me` sống nên khởi động trót lọt, rồi hộp việc
     * của trang tổng quan ăn 401 — phiên chết sau khi màn hình đã lên.
     */
    datPhienLuu();
    chanMang(
      () => Promise.resolve(json(nguoiDung())),
      (d) => (d.includes('/policies/inbox') ? json({ code: 'UNAUTHORIZED' }, 401) : null),
    );
    mo();

    await waitFor(() => expect(coLopPhu()).not.toBeNull());
    // Màn hình cũ CÒN NGUYÊN bên dưới — đó là cả điểm của `FE-33`.
    expect(coTongQuan(), 'lớp phủ đã dỡ mất màn hình bên dưới').not.toBeNull();
  });
});
