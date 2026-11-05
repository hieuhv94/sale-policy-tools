/**
 * @vitest-environment jsdom
 *
 * VER-05 (`0118`) — chân thanh bên hiện SỐ PHIÊN BẢN THẬT.
 *
 * Danh mục ca kiểm đòi điều này từ đầu: *"Mở bất kỳ màn hình nào của web → chân
 * trang hiện số phiên bản"*, để người dùng báo lỗi thì đọc luôn được bản đang
 * chạy mà không phải hỏi. Hằng `PHIEN_BAN` cũng dựng từ P7d.
 *
 * Nhưng suốt tới `0117` **không ai đọc hằng ấy**: chân thanh bên ghi cứng chuỗi
 * "Phiên bản demo", nên chồng production thật cũng hiện đúng chữ "demo". Một
 * hằng số không có người đọc và một chuỗi viết cứng thì không bên nào tự sai —
 * chỉ có khoảng trống giữa hai bên là sai.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { BoCuc } from '@csbh/web/bo-cuc';
import { PHIEN_BAN } from '@csbh/web/phien-ban';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';

const TDV = {
  accessToken: 'a',
  refreshToken: 'r',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'tdv01',
    fullName: 'Nguyen Van Hung',
    email: 'tdv01@nutricare.com.vn',
    role: 'TDV',
    mustChangePassword: false,
  },
};

const mo = () =>
  render(
    <PhienProvider>
      <BoDinhTuyen>
        <BoCuc>
          <p>nội dung</p>
        </BoCuc>
      </BoDinhTuyen>
    </PhienProvider>,
  );

/*
 * Đọc bằng lớp CSS chứ không bằng `getByText`: câu "Phiên bản 1.0.0" là HAI nút
 * văn bản của React, nên cả `<span>` lẫn `<div>` bọc nó cùng khớp một biểu thức,
 * và `getByText` ném "Found multiple elements".
 */
const chanThanhBen = () => document.querySelector('.chan-trang-phien-ban')?.textContent ?? '';

beforeEach(() => {
  localStorage.setItem('csbh:phien', JSON.stringify(TDV));
  // Khung chung không gọi mạng; chặn `fetch` để một lượt lạc đường không đi ra
  // ngoài — cùng nếp với `menu-tai-khoan.test.tsx`.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('không được gọi mạng'))));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('VER-05 chân trang hiện số phiên bản (dời từ chân thanh bên ở `0244`)', () => {
  it('số phiên bản CHỈ nằm ở chân trang — thanh bên không còn bản thứ hai', () => {
    mo();
    expect(document.querySelector('.thanh-ben')!.textContent).not.toContain('Phiên bản');
    expect(document.querySelectorAll('.chan-trang-phien-ban')).toHaveLength(1);
  });

  it('hiện đúng giá trị của `PHIEN_BAN`, không phải một chuỗi viết cứng', () => {
    mo();
    expect(chanThanhBen()).toContain(PHIEN_BAN);
    expect(screen.queryByText(/Phiên bản demo/)).toBeNull();
  });

  it('hiện NGAY lần vẽ đầu, không đợi lời gọi API nào', () => {
    /*
     * Lý do chọn hằng nhúng lúc build thay vì header `x-app-version`: không có
     * trạng thái "chưa biết", nên không có ô trống và không có cú nhảy bố cục.
     * `fetch` ở đây luôn ném — nếu con số phụ thuộc một phản hồi thì ca này đỏ.
     */
    mo();
    expect(chanThanhBen()).toContain(PHIEN_BAN);
  });
});

describe('VER-04 con số ấy đến TỪ tệp `VERSION`', () => {
  /*
   * Hai ca trên chạy dưới jsdom, nơi Vite không thay `__PHIEN_BAN__`, nên
   * `PHIEN_BAN` rơi về `0.0.0-dev`. Tức là chúng canh được ĐƯỜNG NỐI mà không
   * canh được GIÁ TRỊ — bản dựng thật có thể lấy số từ bất kỳ đâu mà hai ca kia
   * vẫn xanh.
   *
   * Ca này bịt đúng khoảng đó, ở chỗ duy nhất quyết định giá trị thật.
   */
  const cfg = readFileSync('apps/web/vite.config.ts', 'utf8');

  it('`vite.config.ts` đọc `VERSION` và nhúng vào `__PHIEN_BAN__`', () => {
    expect(cfg).toMatch(/readFileSync\(new URL\('\.\.\/\.\.\/VERSION'/);
    expect(cfg).toMatch(/__PHIEN_BAN__: JSON\.stringify\(version\)/);
  });

  it('giá trị dự phòng KHÔNG phải một số phiên bản thật', () => {
    /*
     * Dự phòng phải nhìn là biết ngay đang chạy ngoài Vite. Đặt `1.0.0` ở đó thì
     * một bản dựng hỏng — Vite không thay được hằng — sẽ hiện một con số trông
     * hoàn toàn hợp lệ, và không ai phát hiện.
     */
    const nguon = readFileSync('apps/web/src/lib/phien-ban.ts', 'utf8');
    const duPhong = /'([^']+)';\s*$/.exec(nguon.trim())?.[1];
    expect(duPhong).toMatch(/dev/);
    expect(duPhong).not.toMatch(/^\d+\.\d+\.\d+$/);
  });
});
