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
  datLaiChuaDoc,
  dauChuong,
  lopDong,
  nhanChuong,
  nhanHuyHieu,
  thoiGianTuongDoi,
  TRAN_HUY_HIEU,
  truMot,
  type ThongBao as DongTb,
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
    expect(nhanChuong({ viec: 250, tin: 0 })).toContain('250');
    expect(nhanChuong({ viec: 250, tin: 0 })).not.toContain('99+');
    expect(nhanChuong({ viec: 0, tin: 0 })).toBe('Thông báo — đã đọc hết');
  });
});

describe('`0192` chuông: SỐ cho việc, CHẤM cho tin', () => {
  it('còn việc thì vẽ con số — đếm VIỆC, không đếm cả hộp', () => {
    // Khách hàng chốt 23/08 rằng huy hiệu nói *"còn 12 VIỆC chưa xem"*. Trộn cả
    // tin vào là con số ấy leo lên rồi đứng đó, và thôi được ai phản ứng.
    expect(dauChuong({ viec: 3, tin: 40 })).toEqual({ dang: 'so', nhan: '3' });
  });

  it('hết việc mà còn tin thì vẽ DẤU CHẤM, không phải số 0', () => {
    expect(dauChuong({ viec: 0, tin: 12 })).toEqual({ dang: 'cham' });
  });

  it('đọc hết cả hai vế thì không vẽ gì', () => {
    expect(dauChuong({ viec: 0, tin: 0 })).toEqual({ dang: 'khong' });
  });

  it('SỐ và CHẤM loại trừ nhau ở MỌI tổ hợp', () => {
    /*
     * Luật loại trừ nằm trong kiểu dữ liệu chứ không ở hai điều kiện rời nhau
     * trong JSX — hai điều kiện rời sẽ có ngày cùng đúng, cho ra số và chấm
     * chồng lên nhau ở một góc 18px mà không có gì đỏ.
     *
     * Quét cả lưới thay vì kiểm vài điểm: `dang` là một chuỗi, và một bản sửa
     * dựng ra giá trị thứ tư sẽ lọt qua ba ca trên.
     */
    for (const viec of [0, 1, 5, 250]) {
      for (const tin of [0, 1, 5, 250]) {
        const d = dauChuong({ viec, tin });
        expect(['so', 'cham', 'khong']).toContain(d.dang);
        expect(d.dang === 'so').toBe(viec > 0);
        expect(d.dang === 'cham').toBe(viec === 0 && tin > 0);
      }
    }
  });

  it('rác từ mạng không vẽ ra huy hiệu rỗng', () => {
    // `viec` > 0 nhưng `nhanHuyHieu` trả rỗng là tổ hợp duy nhất vẽ ra một huy
    // hiệu không có chữ. Phép chuẩn hoá TRƯỚC phép so là thứ chặn nó.
    for (const xau of [Number.NaN, -3, Number.POSITIVE_INFINITY]) {
      const d = dauChuong({ viec: xau, tin: 0 });
      expect(d.dang === 'so' && d.nhan === '').toBe(false);
    }
  });

  it('nhãn đọc lên nói CẢ HAI vế — dấu chấm vô hình với trình đọc màn hình', () => {
    expect(nhanChuong({ viec: 0, tin: 12 })).toBe('Thông báo — 12 tin mới');
    expect(nhanChuong({ viec: 3, tin: 12 })).toBe('Thông báo — 3 việc chưa xem, 12 tin mới');
  });
});

describe('`0192` bậc nằm ở LỚP của cả dòng', () => {
  const tb = (o: Partial<DongTb>): DongTb => ({ kind: 'CHINH', daDocLuc: null, ...o }) as DongTb;

  it('bốn tổ hợp đã-đọc × bậc đều phân biệt được', () => {
    // Hai trục ĐỘC LẬP: một dòng VIỆC đã đọc vẫn là việc chưa làm xong.
    expect(lopDong(tb({ kind: 'CHINH', daDocLuc: null }))).toBe('tb-dong tb-chua-doc tb-viec');
    expect(lopDong(tb({ kind: 'CHINH', daDocLuc: 'x' }))).toBe('tb-dong tb-viec');
    expect(lopDong(tb({ kind: 'THEO_DOI', daDocLuc: null }))).toBe('tb-dong tb-chua-doc');
    expect(lopDong(tb({ kind: 'THEO_DOI', daDocLuc: 'x' }))).toBe('tb-dong');
  });

  it('CSS tô dòng VIỆC bằng hổ phách, KHÔNG bằng màu của chấm chưa đọc', () => {
    /*
     * Canh cả hai vế. Xanh thương hiệu đã là màu của *chưa đọc* ở `.tb-cham` và
     * ở dấu chấm trên chuông — mượn lại nó ở đây là một màu mang hai nghĩa trên
     * cùng một dòng. Đỏ thì tranh chỗ với huy hiệu đếm việc (`0188`).
     */
    const css = doc('styles/app.css');
    const khoi = css.slice(css.indexOf('.tb-viec {'), css.indexOf('.tb-viec:hover'));
    expect(khoi).toContain('--mau-canh-bao');
    expect(khoi).not.toContain('--mau-thuong-hieu');
    expect(khoi).not.toContain('--mau-loi');
  });

  it('dòng không có dải vẫn thẳng cột với dòng có dải', () => {
    // `border-left` trong suốt trên `.tb-dong` chừa sẵn chỗ; bỏ nó thì dòng TIN
    // thụt 3px và cả danh sách trông so le.
    const css = doc('styles/app.css');
    const khoi = css.slice(css.indexOf('.tb-dong {'), css.indexOf('.tb-danh-sach > li:last-child'));
    expect(khoi).toContain('border-left: 3px solid transparent');
  });

  it('chip `để biết` KHÔNG mọc lại ở bất kỳ màn hình nào', () => {
    // Nó đánh dấu cái không quan trọng, và từ `0192` tiêu đề đã tự nói ra bậc.
    for (const f of ['components/ChuongThongBao.tsx', 'pages/ThongBao.tsx', 'styles/app.css']) {
      expect(doc(f)).not.toContain('className="tb-de-biet"');
    }
    expect(doc('styles/app.css')).not.toContain('.tb-de-biet {');
  });

  it('trừ đúng VẾ của dòng vừa đọc', () => {
    expect(truMot({ viec: 3, tin: 5 }, tb({ kind: 'CHINH' }))).toEqual({ viec: 2, tin: 5 });
    expect(truMot({ viec: 3, tin: 5 }, tb({ kind: 'THEO_DOI' }))).toEqual({ viec: 3, tin: 4 });
    // Không tụt xuống âm — máy chủ và giao diện có thể lệch nhau một nhịp.
    expect(truMot({ viec: 0, tin: 0 }, tb({ kind: 'CHINH' }))).toEqual({ viec: 0, tin: 0 });
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
let hop = { items: [TB()], total: 1, limit: 10, offset: 0, soViecChuaDoc: 1, soTinChuaDoc: 0 };
let dem = { soViecChuaDoc: 1, soTinChuaDoc: 0 };

const chan = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: string, tuyChon?: { method?: string }) => {
      daGoi.push(`${tuyChon?.method ?? 'GET'} ${duong}`);
      const than = duong.includes('/auth/me')
        ? phien().user
        : duong.includes('/cua-toi/dem')
          ? dem
          : duong.includes('/da-doc')
            ? { soViecChuaDoc: 0, soTinChuaDoc: 0, soDaDanhDau: 1 }
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
  dem = { soViecChuaDoc: 1, soTinChuaDoc: 0 };
  hop = { items: [TB()], total: 1, limit: 10, offset: 0, soViecChuaDoc: 1, soTinChuaDoc: 0 };
  datLaiChuaDoc();
  chan();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('`0096` cái chuông trên thanh tiêu đề', () => {
  it('hỏi số chưa đọc ngay lúc dựng và vẽ huy hiệu', async () => {
    dem = { soViecChuaDoc: 7, soTinChuaDoc: 0 };
    mo();
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());
    expect(daGoi.some((d) => d.includes('/notifications/cua-toi/dem'))).toBe(true);
    // KHÔNG kéo cả danh sách về chỉ để lấy một con số — đường này chạy mỗi 60
    // giây cho mọi phiên đang mở.
    expect(daGoi.some((d) => /cua-toi\?/.test(d))).toBe(false);
  });

  it('hộp rỗng thì KHÔNG có huy hiệu nào', async () => {
    dem = { soViecChuaDoc: 0, soTinChuaDoc: 0 };
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    expect(screen.queryByText('0')).toBeNull();
    expect(document.querySelector('.tb-cham-chuong')).toBeNull();
  });

  it('quá 99 thì huy hiệu ghi `99+` còn nhãn đọc lên nói số thật', async () => {
    dem = { soViecChuaDoc: 250, soTinChuaDoc: 0 };
    mo();
    await waitFor(() => expect(screen.getByText('99+')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Thông báo — 250 việc chưa xem' })).toBeTruthy();
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

  it('dòng "để biết" KHÔNG mang dải bậc, và trỏ vào lịch sử hồ sơ', async () => {
    hop = {
      ...hop,
      items: [TB({ kind: 'THEO_DOI', duongDan: '/ho-so/abc-123/nhat-ky' })],
    };
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    fireEvent.click(chuong());

    const lien = await screen.findByRole('link', { name: /Hồ sơ bị trả lại/ });
    expect(lien.getAttribute('href')).toBe('/ho-so/abc-123/nhat-ky');
    expect(lien.className).not.toContain('tb-viec');
  });

  it('dòng VIỆC mang dải bậc và trỏ thẳng vào hồ sơ', async () => {
    // Ca đối chiếu của ca ngay trên. Thiếu nó thì gỡ hẳn `tb-viec` khỏi
    // `lopDong` vẫn xanh — ca kia chỉ đòi lớp ấy VẮNG MẶT.
    mo();
    await waitFor(() => expect(chuong()).toBeTruthy());
    fireEvent.click(chuong());

    const lien = await screen.findByRole('link', { name: /Hồ sơ bị trả lại/ });
    expect(lien.getAttribute('href')).toBe('/ho-so/abc-123');
    expect(lien.className).toContain('tb-viec');
  });

  it('hết việc mà còn tin thì chuông mang dấu chấm, không mang số', async () => {
    dem = { soViecChuaDoc: 0, soTinChuaDoc: 12 };
    mo();
    await waitFor(() => expect(document.querySelector('.tb-cham-chuong')).toBeTruthy());
    expect(document.querySelector('.tb-huy-hieu')).toBeNull();
    // Dấu chấm không có chữ nào, nên nhãn đọc lên là đường duy nhất nó tới được
    // người dùng trình đọc màn hình.
    expect(screen.getByRole('button', { name: 'Thông báo — 12 tin mới' })).toBeTruthy();
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
    dem = { soViecChuaDoc: 0, soTinChuaDoc: 0 };
    hop = { items: [], total: 0, limit: 10, offset: 0, soViecChuaDoc: 0, soTinChuaDoc: 0 };
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
