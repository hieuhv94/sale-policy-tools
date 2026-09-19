/**
 * @vitest-environment jsdom
 *
 * `0089` — mười lăm chỗ NUỐT LỖI IM LẶNG.
 *
 * `0088` chuẩn hoá câu chữ và dạng hiển thị cho mọi lỗi ĐƯỢC BÁO. Lớp còn lại
 * là những lỗi chưa bao giờ được báo: `.catch(() => undefined)` rải khắp các
 * đường phụ. Chúng không hiện gì cả, nên không câu chữ nào sai — nhưng ba chỗ
 * trong số đó khiến màn hình **nói một câu sai sự thật**:
 *
 *   - `/policies/current` hỏng → *"Khách hàng chưa có CSBH nào"*
 *   - danh sách gợi ý hỏng → *"Không có mục nào khớp"*
 *   - danh sách ứng viên bàn giao hỏng → *"không có ai cùng vai trò"*
 *
 * Ba câu ấy tệ hơn im lặng: chúng trả lời dứt khoát một câu hỏi mà phần mềm
 * chưa hỏi được, và người dùng không có cách nào nghi ngờ.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChiTietKhachHang } from '@csbh/web/khach-hang-ui';
import { ChonNhieu } from '@csbh/web/chon-nhieu';
import { BaoLoiProvider } from '@csbh/web/bao-loi';
import { PhienProvider } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';

const TDV_ID = '11111111-1111-1111-1111-111111111111';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const KHACH = {
  id: 'kh-1',
  code: 'KH-0007',
  name: 'Nha thuoc Minh Chau',
  customerType: 1,
  registeredAddress: 'Hà Nội',
  deliveryAddress: null,
  registeredAddresses: ['Hà Nội'],
  province: 'Hà Nội',
  streetWard: 'Hà Nội',
  deliveryAddresses: [],
  ownerName: 'Chu ho',
  ownerTitle: null,
  idNumber: null,
  debt: '0',
  tdvUserId: TDV_ID,
  status: 'DANG_HOP_TAC',
};

const dangNhapLa = (id: string, role: string) =>
  localStorage.setItem(
    'csbh:phien',
    JSON.stringify({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id, username: 'u', fullName: 'Nguoi Dung', email: 'u@x.vn', role, mustChangePassword: false },
    }),
  );

/** `traLoiCsbh` quyết định máy chủ trả gì cho `/policies/current`. */
const chanMang = (traLoiCsbh: () => Response) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/auth/me')) {
        return Promise.resolve(json(JSON.parse(localStorage.getItem('csbh:phien')!).user));
      }
      if (d.includes('/documents')) return Promise.resolve(json([]));
      if (d.includes('/policies/current')) return Promise.resolve(traLoiCsbh());
      if (/\/customers\/[^/?]+($|\?)/.test(d)) return Promise.resolve(json(KHACH));
      return Promise.resolve(json({ items: [], total: 0 }));
    }),
  );
};

const mo = () => {
  window.history.replaceState(null, '', '/khach-hang/kh-1');
  return render(
    <BaoLoiProvider>
      <BoDinhTuyen>
        <PhienProvider>
          <ChiTietKhachHang id="kh-1" />
        </PhienProvider>
      </BoDinhTuyen>
    </BaoLoiProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('`0089` 404 là câu trả lời, lỗi khác thì KHÔNG', () => {
  it('404 vẫn nói "chưa có CSBH nào" — không hồi quy', async () => {
    dangNhapLa(TDV_ID, 'TDV');
    chanMang(() => new Response('{"code":"NO_ACTIVE_POLICY"}', { status: 404 }));
    mo();
    await waitFor(() =>
      expect(document.body.textContent).toContain('Khách hàng chưa có CSBH nào đang hiệu lực'),
    );
  });

  it('máy chủ hỏng thì KHÔNG được nói là khách chưa có CSBH nào', async () => {
    /*
     * Đây là câu sai mà `0089` đi chữa. Trước đó `catch` bắt tất — mất mạng,
     * 500, token hỏng — rồi đặt cùng một trạng thái `'khong-co'`, và màn hình
     * khẳng định khách chưa từng có chính sách nào. Với một khách đang có CSBH
     * hiệu lực thì đó là câu sai nguy hiểm nhất màn hình này nói được.
     */
    dangNhapLa(TDV_ID, 'TDV');
    chanMang(() => new Response('{"code":"UPSTREAM_UNAVAILABLE"}', { status: 502 }));
    mo();
    await waitFor(() => expect(document.querySelector('.bao-loi')).not.toBeNull());
    /*
     * Câu phải KHÔNG hiện là câu của khối *CSBH đang áp dụng*, chứ không phải
     * mọi chữ "chưa có CSBH" trên trang: khối *Lịch sử CSBH* ngay dưới nó cũng
     * có một câu gần giống, và bắt cả hai thì ca kiểm đỏ vì nhầm khối.
     */
    expect(document.body.textContent).not.toContain('Khách hàng chưa có CSBH nào đang hiệu lực');
  });
});

describe('`0089` danh sách gợi ý hỏng thì nói đúng là hỏng', () => {
  it('KHÔNG còn nói "Không có mục nào khớp" khi chưa hỏi được máy chủ', async () => {
    const nguoi = userEvent.setup();
    render(
      <ChonNhieu
        id="nhom"
        nhan="Nhóm sản phẩm"
        giaTri={[]}
        nguon={() => Promise.reject(new Error('mat mang'))}
        doi={() => undefined}
      />,
    );
    await nguoi.type(screen.getByLabelText(/Nhóm sản phẩm/), 'abc');
    await waitFor(() =>
      expect(document.querySelector('.chon-nhieu-trong')?.textContent).toContain(
        'Không tra được danh sách',
      ),
    );
    expect(document.body.textContent).not.toContain('Không có mục nào khớp');
  });

  it('nguồn chạy được thì vẫn là câu cũ', async () => {
    const nguoi = userEvent.setup();
    render(
      <ChonNhieu
        id="nhom2"
        nhan="Nhóm sản phẩm"
        giaTri={[]}
        nguon={() => Promise.resolve([])}
        doi={() => undefined}
      />,
    );
    await nguoi.type(screen.getByLabelText(/Nhóm sản phẩm/), 'abc');
    await waitFor(() =>
      expect(document.querySelector('.chon-nhieu-trong')?.textContent).toBe('Không có mục nào khớp'),
    );
  });
});

// =============================================================================
// Chốt chặn: không thêm chỗ nuốt lỗi mới mà không nói lý do
// =============================================================================

function moiTep(thuMuc: string): string[] {
  const ra: string[] = [];
  for (const t of readdirSync(thuMuc)) {
    const d = join(thuMuc, t);
    if (statSync(d).isDirectory()) ra.push(...moiTep(d));
    else if (d.endsWith('.ts') || d.endsWith('.tsx')) ra.push(d);
  }
  return ra;
}

/**
 * Bốn chỗ CỐ Ý nuốt lỗi, và lý do của từng chỗ nằm ngay trên nó trong mã.
 *
 * Danh sách này là bản duyệt: thêm một chỗ nuốt lỗi mới thì phải thêm vào đây,
 * và lượt thêm ấy buộc người viết trả lời câu "người dùng mất gì khi việc này
 * hỏng mà không ai nói". Ba trong bốn chỗ dưới đây trả lời được; chỗ thứ tư
 * (`SuaHoSo`) trả lời được vì máy chủ tra lại ngưỡng lúc lưu.
 */
const NUOT_CO_LY_DO = [
  'apps/web/src/components/TheTep.tsx', // ảnh thu nhỏ — thẻ tệp vẫn dùng được
  'apps/web/src/components/SuaHoSo.tsx', // xem trước ngưỡng — máy chủ tra lại lúc lưu
  'apps/web/src/lib/auth.tsx', // gọi logout — trình duyệt đã đăng xuất xong
  'apps/web/src/pages/LapHoSo.tsx', // tra khách theo id trên địa chỉ — rơi về bước tìm
  'apps/web/src/lib/thong-bao.ts', // đếm chưa đọc mỗi 60 giây — lượt sau tự chữa (`0096`)
  'apps/web/src/components/ChuongThongBao.tsx', // đánh dấu đã đọc — màn hình đang rời đi (`0096`)
];

describe('`0089` không lọt một chỗ nuốt lỗi nào', () => {
  it('mọi `.catch(() => …)` trong giao diện đều nằm trong danh sách đã duyệt', () => {
    const pham: string[] = [];
    for (const tep of moiTep('apps/web/src')) {
      const s = readFileSync(tep, 'utf8');
      /*
       * Chỉ bắt dạng NUỐT THẬT: hàm bắt lỗi trả về một giá trị trơ và không làm
       * gì khác. `.catch(() => { …đặt cờ… })` không tính — nó có xử lý, chỉ là
       * không cần tới đối tượng lỗi.
       *
       * Phép quét này KHÔNG bắt được dạng thứ hai của cùng một bệnh: một
       * `.catch` ánh xạ MỌI lỗi về một trạng thái bình thường, như
       * `.catch(() => datHoSo('khong-co'))` mà `0089` vừa gỡ. Dạng ấy do ca
       * kiểm hành vi ở trên gác, không có mẫu chữ nào nhận ra nó.
       */
      const n = [...s.matchAll(/\.catch\(\(\)\s*=>\s*(?:undefined|null|\[\]|\{\})\s*\)/g)].length;
      // `res.json().catch(() => ({}))` trong `api.ts` là chuyện khác: thân lỗi
      // không phải JSON thì mã lỗi vẫn suy được từ HTTP status.
      const boQua = tep.endsWith('lib/api.ts') ? [...s.matchAll(/res\.json\(\)\.catch/g)].length : 0;
      if (n - boQua > 0 && !NUOT_CO_LY_DO.includes(tep)) pham.push(tep);
    }
    expect(
      pham,
      `chỗ nuốt lỗi chưa duyệt: ${pham.join(', ')} — thêm lý do vào mã rồi khai ở NUOT_CO_LY_DO`,
    ).toEqual([]);
  });

  it('mỗi chỗ đã duyệt đều CÓ THẬT và có ghi chú `0089` giải thích', () => {
    for (const tep of NUOT_CO_LY_DO) {
      const s = readFileSync(tep, 'utf8');
      expect(
        [...s.matchAll(/\.catch\(\(\)\s*=>\s*(?:undefined|null|\[\]|\{\})\s*\)/g)].length,
        `${tep} không còn chỗ nuốt nào — gỡ nó khỏi NUOT_CO_LY_DO`,
      ).toBeGreaterThan(0);
      // Ghi chú là thứ duy nhất phân biệt "cố ý" với "quên" khi đọc lại sau này.
      expect(s.includes('`0089`') || s.includes('KHÔNG báo lỗi'), `${tep} thiếu lý do`).toBe(true);
    }
  });
});
