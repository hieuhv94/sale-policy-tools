/**
 * @vitest-environment jsdom
 *
 * `0040` — đăng nhập xong thì vào TRANG TỔNG QUAN.
 *
 * Trước đợt này không có bước điều hướng nào sau khi đăng nhập: màn hình hiện ra
 * là bất cứ đường dẫn nào đang nằm trên thanh địa chỉ. Mở app ở `/` thì tình cờ
 * đúng, còn mở lại một tab cũ đang ở `/nguoi-dung` thì người dùng rơi thẳng vào
 * giữa một màn hình con — và với vai trò không xem được màn hình ấy thì rơi vào
 * "Bạn không có quyền", NGAY SAU khi đăng nhập thành công.
 *
 * Kiểm cho CẢ SÁU vai trò, vì trang tổng quan dựng nội dung khác nhau cho từng
 * vai trò và hai trong số đó (Ban lãnh đạo, Quản trị) không có hồ sơ nào trong
 * phạm vi — đúng hai vai trò dễ ra màn hình trắng nhất.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@csbh/web/app';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { BaoLoiProvider } from '@csbh/web/bao-loi';
import { VAI_TRO } from '@csbh/web/can';
import { duongSauDangNhap } from '@csbh/web/sau-dang-nhap';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Phiên chuyển sang `localStorage` ở `0042`; bản nháp biểu mẫu vẫn ở
  // `sessionStorage`. Dọn cả hai cho chắc.
  localStorage.clear();
  sessionStorage.clear();
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/**
 * `fetch` giả cho cả màn hình: trả phiên cho `/auth/login`, và trả rỗng cho mọi
 * lời gọi số liệu của trang tổng quan.
 *
 * Không giả từng đường một: trang tổng quan gọi khá nhiều thứ tuỳ vai trò, và
 * liệt kê tay từng đường là dựng ra một ca kiểm thử đỏ mỗi lần ai đó thêm một
 * khối mới — trong khi điều đang kiểm chỉ là "màn hình nào hiện ra".
 */
const chanMang = (role: string) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/auth/login')) {
      return Promise.resolve(
        json({
          accessToken: 'at',
          refreshToken: 'rt',
          mustChangePassword: false,
          user: { id: 'u-1', username: 'nguoidung', fullName: 'Nguoi Dung', role },
        }),
      );
    }
    // `/contract-templates` là đường DUY NHẤT của trang này còn trả về một mảng
    // trần thay vì `{ items, total }` — nợ kỹ thuật đã ghi nhận. Trả sai hình
    // dạng cho nó thì khối của Sale Admin nổ ngay lúc dựng.
    if (d.includes('/contract-templates')) return Promise.resolve(json([]));
    // Ca liên kết sâu dựng THẬT màn hình chi tiết hồ sơ, nên nó cần một hồ sơ
    // đúng hình dạng — không phải danh sách rỗng như mọi đường kia.
    if (d.includes('/allowed-actions')) return Promise.resolve(json({ allowed: [] }));
    // `impacted` và `inbox` cũng khớp `/policies/<gì đó>` nhưng là DANH SÁCH,
    // không phải một hồ sơ — trả nhầm hình dạng thì khối *Yêu cầu cập nhật* và
    // hộp việc nổ ngay.
    const laDanhSach = ['/policies/impacted', '/policies/inbox'].some((x) => d.includes(x));
    if (!laDanhSach && /\/policies\/[^/?]+($|\?)/.test(d)) {
      return Promise.resolve(
        json({
          id: 'abc-123',
          code: 'CSBH-2026-000001',
          customerId: 'kh-1',
          versionNo: 1,
          status: 'DANG_CO_HIEU_LUC',
          appliedDate: '2026-01-01',
          effectiveFrom: null,
          lastReason: null,
          xoaDuoc: false,
          rowVersion: 0,
          lines: [],
          attachments: [],
          // Ba cờ `0048`, có mặt ở đây vì đúng lý do đã ghi cho `byStepDetail`:
          // stub phải nói đúng hình dạng máy chủ trả, không phải hình dạng tối
          // thiểu để ca kiểm thử xanh.
          loaiTepGhiDuoc: [],
          xuatHopDongDuoc: false,
        }),
      );
    }
    /*
     * Hình dạng chung đủ cho mọi khối còn lại: danh sách rỗng, tổng bằng 0.
     *
     * `byHandler`, `byPendingStep` và `byStepDetail` phải đúng TÊN của máy chủ.
     * Bản đầu tôi viết `byTdv` và khối *Theo từng TDV* của Sale Admin nổ ngay
     * trong lúc dựng — ca kiểm thử vẫn xanh vì nó chỉ soi đường dẫn, còn màn
     * hình thì trắng. Đó là lời nhắc rằng khẳng định "về đúng trang" chưa đủ;
     * xem ca cuối khối. `byStepDetail` (`0045`) vào đây vì đúng lý do ấy.
     */
    return Promise.resolve(
      json({
        items: [],
        total: 0,
        byStatus: {},
        byPendingStep: {},
        byStepDetail: {},
        byHandler: [],
      }),
    );
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const dangNhap = async () => {
  await userEvent.type(screen.getByLabelText(/Tên đăng nhập|đăng nhập/i), 'nguoidung');
  await userEvent.type(screen.getByLabelText(/^Mật khẩu/), 'Test@1234');
  await userEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }));
};

const mo = (duongBanDau: string) => {
  window.history.replaceState(null, '', duongBanDau);
  render(
    <BaoLoiProvider>
      <BoDinhTuyen>
        <PhienProvider>
          <App />
        </PhienProvider>
      </BoDinhTuyen>
    </BaoLoiProvider>,
  );
};

describe('`0040` đăng nhập xong là vào trang tổng quan', () => {
  for (const vaiTro of VAI_TRO) {
    it(`${vaiTro}: mở app ở "/" rồi đăng nhập thì ở lại trang tổng quan`, async () => {
      chanMang(vaiTro);
      mo('/');
      await dangNhap();

      await waitFor(() => expect(window.location.pathname).toBe('/'));
      // Biểu mẫu đăng nhập đã đi hẳn. So theo NÚT chứ không theo chữ: dải thẻ
      // của Quản trị có một ô phụ nhắc tới việc "không đăng nhập được", và một
      // phép so chữ chung chung sẽ khớp nhầm vào đó.
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /^Đăng nhập$/ })).toBeNull(),
      );
    });

    it(`${vaiTro}: mở app ở một màn hình con rồi đăng nhập thì VẪN về trang tổng quan`, async () => {
      // Đây mới là ca thật sự đang sửa. `/nguoi-dung` chọn có chủ ý: năm trong
      // sáu vai trò không xem được nó, nên trước `0040` họ đăng nhập xong là
      // gặp ngay "Bạn không có quyền".
      chanMang(vaiTro);
      mo('/nguoi-dung');
      await dangNhap();

      await waitFor(() => expect(window.location.pathname).toBe('/'));
      expect(screen.queryByText(/không có quyền/i)).toBeNull();
    });
  }

  it('trang tổng quan dựng XONG, không khối nào nổ giữa chừng', async () => {
    /*
     * Khẳng định "về đúng đường dẫn" chưa đủ: một khối nổ lúc dựng thì đường dẫn
     * vẫn là `/` mà màn hình trắng. Chính chuyện đó đã xảy ra khi viết tệp này —
     * stub trả sai tên một trường và khối *Theo từng TDV* của Sale Admin chết.
     *
     * Sale Admin là vai trò có NHIỀU khối nhất (bốn), nên nó là ca canh gác tốt
     * nhất; đi kèm Quản trị vì khối của họ gọi bốn đường khác hẳn phần còn lại.
     */
    for (const vaiTro of ['SALE_ADMIN', 'QUAN_TRI']) {
      const loi: unknown[] = [];
      const cu = console.error;
      console.error = (...a: unknown[]) => loi.push(a[0]);
      try {
        chanMang(vaiTro);
        mo('/');
        await dangNhap();
        await waitFor(() => expect(window.location.pathname).toBe('/'));
        // Có nội dung thật, không phải một khung rỗng.
        await waitFor(() => expect(document.querySelector('.trang')).not.toBeNull());
      } finally {
        console.error = cu;
        cleanup();
        // Phiên nằm ở `localStorage` (`0042`), và vòng lặp này ở TRONG một ca
        // kiểm thử nên `afterEach` chưa chạy. Không dọn thì vòng thứ hai mở ra
        // đã đăng nhập sẵn và không tìm thấy biểu mẫu nào để điền.
        localStorage.clear();
      }
      const no = loi.filter((x) => String(x).includes('Uncaught'));
      expect(no, `${vaiTro}: có khối nổ khi dựng — ${String(no[0] ?? '')}`).toEqual([]);
    }
  });

  it('`0041` liên kết trong thư GIỮ NGUYÊN, không bị đá về trang tổng quan', async () => {
    // Người nhận thư vừa bấm vào một hồ sơ CỤ THỂ vì họ cần đúng hồ sơ đó. Đưa
    // họ về trang tổng quan là làm mất chính thứ vừa bấm, và không có cách nào
    // tìm lại ngoài mở lại hộp thư.
    chanMang('TDV');
    mo('/ho-so/abc-123');
    await dangNhap();
    await waitFor(() =>
      expect(window.location.pathname, 'liên kết mở hồ sơ').toBe('/ho-so/abc-123'),
    );
    // Và màn hình hồ sơ dựng THẬT, không phải chỉ đúng đường dẫn.
    await waitFor(() => expect(screen.getByText('CSBH-2026-000001')).toBeTruthy());
  });

  it('màn hình công khai KHÔNG bị đá về trang tổng quan', async () => {
    // `/quen-mat-khau` đứng trước lớp kiểm phiên: người quên mật khẩu theo định
    // nghĩa là chưa đăng nhập được, nên điều hướng sau đăng nhập không được
    // chạm tới nó.
    chanMang('TDV');
    mo('/quen-mat-khau');
    await waitFor(() => expect(window.location.pathname).toBe('/quen-mat-khau'));
  });
});

// =============================================================================
// `0041` — đường nào giữ, đường nào về trang tổng quan
//
// Kiểm THẲNG hàm quyết định thay vì dựng cả màn hình cho từng đường: dựng màn
// hình đắt, và điều đang kiểm ở đây thuần là một phép phân loại đường dẫn.
// =============================================================================

describe('`0041` `duongSauDangNhap`', () => {
  it('GIỮ đường trỏ vào một bản ghi cụ thể', () => {
    // Hai dòng đầu là hai liên kết duy nhất xuất hiện trong thư báo.
    expect(duongSauDangNhap('/ho-so/abc-123')).toBe('/ho-so/abc-123');
    expect(duongSauDangNhap('/ho-so/abc-123/nhat-ky')).toBe('/ho-so/abc-123/nhat-ky');
    expect(duongSauDangNhap('/khach-hang/kh-9')).toBe('/khach-hang/kh-9');
  });

  it('ĐƯA VỀ trang tổng quan mọi màn hình danh sách và quản trị', () => {
    // Đây là những đường một tab cũ hay đứng lại, và là chỗ vai trò không xem
    // được sẽ gặp "Bạn không có quyền" ngay sau khi đăng nhập.
    for (const d of [
      '/',
      '/ho-so',
      '/khach-hang',
      '/bao-cao',
      '/san-pham',
      '/chiet-khau',
      '/nguoi-dung',
      '/mau-hop-dong',
      '/nhat-ky',
      '/thong-tin',
      '/khong-ton-tai',
    ]) {
      expect(duongSauDangNhap(d), `${d} phải về trang tổng quan`).toBe('/');
    }
  });

  it('`/ho-so/moi` KHỚP mẫu bản ghi nhưng KHÔNG được giữ', () => {
    /*
     * Cùng cái bẫy `App.tsx` phải xử bằng thứ tự: `moi` lọt qua `/ho-so/:id`
     * như một mã hồ sơ.
     *
     * Và loại nó là đúng chứ không chỉ là tránh bẫy: đó là biểu mẫu lập hồ sơ
     * mới, mà phiên mất thì nội dung đang gõ cũng mất theo (phiên nằm ở
     * `sessionStorage`, `nhap-tam.ts`). Trả về một biểu mẫu trống không giúp gì.
     */
    expect(duongSauDangNhap('/ho-so/moi')).toBe('/');
  });
});

describe('nửa giới thiệu của màn hình đăng nhập (`0257`, câu chữ chốt 06/11)', () => {
  it('một câu mô tả + năm chức năng nổi bật; không còn ba bước luồng duyệt', () => {
    chanMang('TDV');
    mo('/');
    const gt = document.querySelector('.dang-nhap-gioi-thieu') as HTMLElement;
    expect(gt).not.toBeNull();
    expect(gt.querySelector('.gioi-thieu-chinh')?.textContent).toBe(
      'Phần mềm số hóa quy trình xử lý chính sách bán hàng',
    );
    const tinhNang = [...gt.querySelectorAll('.gioi-thieu-tinh-nang > li')].map((li) => li.textContent);
    expect(tinhNang).toHaveLength(5);
    expect(tinhNang[0]).toContain('tự tính tỷ lệ chiết khấu');
    // Danh sách chức năng không phải một trình tự — không đánh số.
    expect(gt.querySelector('ol')).toBeNull();
    expect(gt.textContent).not.toContain('Sale Admin bàn giao, Kế toán duyệt bản cứng');
  });
});
