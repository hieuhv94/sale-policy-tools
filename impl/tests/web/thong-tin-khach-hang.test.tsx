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
  registeredAddresses: ['So 1 Lang Ha, Ba Dinh, Ha Noi'],
  province: 'Ha Noi',
  streetWard: 'So 1 Lang Ha, Ba Dinh',
  deliveryAddresses: [],
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

const chanMang = (kh: typeof KHACH = KHACH) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/auth/me')) {
        return Promise.resolve(json(JSON.parse(localStorage.getItem('csbh:phien')!).user));
      }
      if (d.includes('/documents')) return Promise.resolve(json([]));
      if (/\/customers\/[^/?]+($|\?)/.test(d)) return Promise.resolve(json(kh));
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
  it('đúng dãy ô, đúng thứ tự — Loại khách hàng ở CUỐI', async () => {
    /*
     * Khẳng định CẢ DÃY bằng `toEqual`, không kiểm từng cặp lân cận: kiểm từng
     * cặp thì chèn một ô mới vào giữa vẫn xanh, mà chèn vào giữa là cách thứ tự
     * này hỏng dễ nhất về sau. Cùng bài học `0152` vừa ghi cho thanh bên.
     *
     * `0175` thêm HAI ô địa chỉ đăng ký ngay sau mã số thuế — khách hàng chốt
     * *"hiển thị thông tin ở mục trên trong trang thông tin khách hàng"*. Đặt
     * chúng cạnh mã số thuế vì cả ba đều đọc từ giấy đăng ký kinh doanh.
     */
    dangNhapLa(TDV_ID, 'TDV');
    chanMang();
    mo();

    await waitFor(() => expect(document.querySelector('dl.the-so')).not.toBeNull());
    expect(nhanTrongKhoi()).toEqual([
      'Mã số thuế',
      'Tỉnh/Thành phố',
      'Số nhà, Phường xã',
      'Người đại diện',
      'Số điện thoại',
      'Công nợ',
      'Loại khách hàng',
    ]);
  });

  it('`0175` ĐỊA CHỈ GIAO HÀNG chỉ hiện KHI CÓ', async () => {
    /*
     * *"Hiển thị thông tin này trong trang thông tin của khách hàng NẾU CÓ"*.
     * Vế cuối là một yêu cầu thật: mảng rỗng nghĩa là *"giao tới địa chỉ đăng
     * ký"* (`0006`), nên một ô ghi dấu gạch ở đây nói rằng khách hàng thiếu một
     * thông tin mà họ không hề thiếu.
     */
    dangNhapLa(TDV_ID, 'TDV');
    chanMang({ ...KHACH, deliveryAddresses: ['Kho A - so 1', 'Kho B - so 2'] });
    mo();

    await waitFor(() => expect(document.querySelector('dl.the-so')).not.toBeNull());
    expect(nhanTrongKhoi()).toContain('Địa chỉ giao hàng');
    const khoi = document.querySelector('dl.the-so')!.textContent ?? '';
    // ĐỦ CẢ HAI: in một dòng rồi bỏ phần còn lại là mất địa chỉ mà không báo gì.
    expect(khoi).toContain('Kho A - so 1');
    expect(khoi).toContain('Kho B - so 2');
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
    /*
     * `0175` ĐẢO MỘT NỬA ca này: hai ô địa chỉ đăng ký quay lại khối, nên phép
     * cấm *"không có chữ địa chỉ nào"* thôi đúng. Cái còn lại — và là cái ca này
     * sinh ra để canh — là **chuỗi địa chỉ GỘP không được quay lại**: nó vẫn ở
     * thẻ danh sách, và in cả hai chỗ là in cùng một thứ hai lần.
     */
    expect(khoi).not.toContain(KHACH.registeredAddress);
    // Và không ô nào mang nhãn *Địa chỉ đăng ký* trần: hai ô mới có tên riêng.
    expect(nhanTrongKhoi()).not.toContain('Địa chỉ đăng ký');
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
    /*
     * `0154` đổi CÁCH in chứ không bỏ: thẻ in địa chỉ ĐẦU cộng một con số, vì
     * cột gộp mang nhiều dòng và HTML nuốt `\n` thành dấu cách.
     *
     * Ca này đã bắt được đúng lượt ấy — nó đỏ khi `{k.registeredAddress}` biến
     * mất, và đó là việc nó sinh ra để làm. Nới nó ra thành *"có chữ address ở
     * đâu đó"* là bỏ mất khả năng ấy; giữ nguyên độ chặt, chỉ đổi sang biểu thức
     * thật đang dùng.
     */
    expect(ma).toContain('{k.registeredAddresses[0]');
    expect(ma).toContain('địa chỉ khác');
    expect(ma).toContain('Tìm theo tên, địa chỉ hoặc mã số thuế');
  });
});
