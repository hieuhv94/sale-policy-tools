/**
 * @vitest-environment jsdom
 *
 * `0153` — KHỐI THÔNG TIN trên trang chi tiết khách hàng: bày ô nào, thứ tự nào.
 *
 * Khách hàng chốt 29/08: **Loại khách hàng xuống cuối**, **Địa chỉ đăng ký ra
 * khỏi khối**.
 *
 * Tới lượt này khối ấy **chưa có ca kiểm nào**. Ba tệp kiểm dựng
 * `ChiTietKhachHang` thật, nhưng cả ba đều hỏi chuyện khác — nút *Lập hồ sơ*,
 * hộp *Sửa*, phép nuốt lỗi — và không tệp nào nhìn tới `dl.the-so`. Nghĩa là
 * thêm, bớt hay đảo một ô trong khối ấy không làm đỏ bất cứ thứ gì; triệu chứng
 * duy nhất là người dùng mở màn hình ra thấy nó khác hôm qua.
 *
 * Dựng DOM THẬT chứ không quét mã nguồn. Một ca quét chuỗi sẽ khẳng định *"tệp
 * có chữ Loại khách hàng ở sau chữ Công nợ"* — đúng với thứ tự CHỮ trong tệp,
 * không đúng với thứ tự người dùng THẤY, và hai thứ ấy tách nhau ngay khi ai đó
 * bọc một ô vào nhánh điều kiện hay dời nó sang một thành phần con.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ChiTietKhachHang } from '@csbh/web/khach-hang-ui';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';

const TDV_ID = '11111111-1111-1111-1111-111111111111';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const KHACH = {
  id: 'kh-1',
  code: 'KH-0007',
  name: 'Nha thuoc Minh Chau',
  customerType: 1,
  registeredAddress: 'So 1 Lang Ha, Ba Dinh, Ha Noi',
  deliveryAddress: null,
  ownerName: 'Tran Thi B',
  ownerTitle: null,
  idNumber: '0101234567',
  phone: '0912345678',
  debt: 'Thanh toan trong 30 ngay',
  tdvUserId: TDV_ID,
  status: 'DANG_HOP_TAC',
};

const dangNhapLa = (id: string, role: string) =>
  localStorage.setItem(
    'csbh:phien',
    JSON.stringify({
      accessToken: 'a',
      refreshToken: 'r',
      user: {
        id,
        username: 'u',
        fullName: 'Nguoi Dung',
        email: 'u@x.vn',
        role,
        mustChangePassword: false,
      },
    }),
  );

const chanMang = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/auth/me')) {
        return Promise.resolve(json(JSON.parse(localStorage.getItem('csbh:phien')!).user));
      }
      if (d.includes('/documents')) return Promise.resolve(json([]));
      if (/\/customers\/[^/?]+($|\?)/.test(d)) return Promise.resolve(json(KHACH));
      if (d.includes('/policies/current')) {
        return Promise.resolve(new Response('{"code":"NO_ACTIVE_POLICY"}', { status: 404 }));
      }
      return Promise.resolve(json({ items: [], total: 0 }));
    }),
  );
};

const mo = () => {
  window.history.replaceState(null, '', '/khach-hang/kh-1');
  return render(
    <BoDinhTuyen>
      <PhienProvider>
        <ChiTietKhachHang id="kh-1" />
      </PhienProvider>
    </BoDinhTuyen>,
  );
};

/** Nhãn của từng ô trong khối, đúng thứ tự đang hiện trên màn hình. */
const nhanTrongKhoi = (): string[] => {
  const dl = document.querySelector('dl.the-so');
  if (!dl) throw new Error('không tìm thấy khối thông tin khách hàng');
  return [...dl.querySelectorAll('dt')].map((o) => o.textContent ?? '');
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('`0153` khối thông tin khách hàng', () => {
  it('đúng năm ô, đúng thứ tự — Loại khách hàng ở CUỐI', async () => {
    /*
     * Khẳng định CẢ DÃY bằng `toEqual`, không kiểm từng cặp lân cận: kiểm từng
     * cặp thì chèn một ô mới vào giữa vẫn xanh, mà chèn vào giữa là cách thứ tự
     * này hỏng dễ nhất về sau. Cùng bài học `0152` vừa ghi cho thanh bên.
     */
    dangNhapLa(TDV_ID, 'TDV');
    chanMang();
    mo();

    await waitFor(() => expect(document.querySelector('dl.the-so')).not.toBeNull());
    expect(nhanTrongKhoi()).toEqual([
      'Mã số thuế / CCCD',
      'Người đại diện',
      'Số điện thoại',
      'Công nợ',
      'Loại khách hàng',
    ]);
  });

  it('KHÔNG còn ô địa chỉ nào trong khối', async () => {
    /*
     * Ca riêng chứ không dựa vào ca trên, và nó bắt một cách hỏng khác hẳn: ai
     * đó thêm lại địa chỉ dưới một cái NHÃN KHÁC — *Địa chỉ*, *Trụ sở*, *Nơi
     * nhận hàng* — thì ca trên đỏ vì độ dài mảng, còn ca này nói ra vì sao.
     *
     * Hỏi cả GIÁ TRỊ chứ không chỉ nhãn: một ô nhãn *Trụ sở* mang chính chuỗi
     * địa chỉ vẫn là đưa địa chỉ trở lại khối.
     */
    dangNhapLa(TDV_ID, 'TDV');
    chanMang();
    mo();

    await waitFor(() => expect(document.querySelector('dl.the-so')).not.toBeNull());
    const khoi = document.querySelector('dl.the-so')!.textContent ?? '';
    expect(khoi).not.toMatch(/[Đđ]ịa chỉ/);
    expect(khoi).not.toContain(KHACH.registeredAddress);
  });

  it('nhưng địa chỉ VẪN CÒN trong hệ thống — thẻ danh sách giữ nó', async () => {
    /*
     * Chiều đối chiếu, và nó canh đúng cách làm sai tai hại nhất của lượt này:
     * hiểu *"bỏ phần địa chỉ"* thành gỡ trường khỏi màn hình khách hàng.
     *
     * Thẻ trong danh sách phải giữ địa chỉ — hai khách trùng tên chỉ phân biệt
     * được bằng nó, và ô tìm kiếm ngay phía trên khai *"tìm theo tên, địa chỉ
     * hoặc mã số thuế"*. Gỡ nốt chỗ ấy là biến một câu hướng dẫn thành câu nói
     * dối, và không ca kiểm nào ở tệp này đỏ nếu thiếu ca này.
     */
    const ma = (await import('node:fs')).readFileSync(
      'apps/web/src/pages/KhachHang.tsx',
      'utf8',
    );
    expect(ma).toContain('{k.registeredAddress}');
    expect(ma).toContain('Tìm theo tên, địa chỉ hoặc mã số thuế');
  });
});
