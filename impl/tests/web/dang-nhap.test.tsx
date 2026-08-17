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
import { VAI_TRO } from '@csbh/web/can';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    /*
     * Hình dạng chung đủ cho mọi khối còn lại: danh sách rỗng, tổng bằng 0.
     *
     * `byHandler` và `byPendingStep` phải đúng TÊN của máy chủ. Bản đầu tôi viết
     * `byTdv` và khối *Theo từng TDV* của Sale Admin nổ ngay trong lúc dựng —
     * ca kiểm thử vẫn xanh vì nó chỉ soi đường dẫn, còn màn hình thì trắng. Đó
     * là lời nhắc rằng khẳng định "về đúng trang" chưa đủ; xem ca cuối khối.
     */
    return Promise.resolve(
      json({ items: [], total: 0, byStatus: {}, byPendingStep: {}, byHandler: [] }),
    );
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const dangNhap = async () => {
  await userEvent.type(screen.getByLabelText(/Tên đăng nhập|đăng nhập/i), 'nguoidung');
  await userEvent.type(screen.getByLabelText(/Mật khẩu/i), 'Test@1234');
  await userEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }));
};

const mo = (duongBanDau: string) => {
  window.history.replaceState(null, '', duongBanDau);
  render(
    <BoDinhTuyen>
      <PhienProvider>
        <App />
      </PhienProvider>
    </BoDinhTuyen>,
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
        // Phiên nằm ở `sessionStorage`, và vòng lặp này ở TRONG một ca kiểm thử
        // nên `afterEach` chưa chạy. Không dọn thì vòng thứ hai mở ra đã đăng
        // nhập sẵn và không tìm thấy biểu mẫu nào để điền.
        sessionStorage.clear();
      }
      const no = loi.filter((x) => String(x).includes('Uncaught'));
      expect(no, `${vaiTro}: có khối nổ khi dựng — ${String(no[0] ?? '')}`).toEqual([]);
    }
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
