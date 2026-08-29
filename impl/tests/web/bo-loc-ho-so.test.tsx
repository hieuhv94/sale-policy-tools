/**
 * @vitest-environment jsdom
 *
 * `0077` — bộ lọc CSBH dựng lại: chọn nhiều, và xuất Excel theo kết quả tìm.
 *
 * Ba thứ đợt này sửa, và cả ba đều là "dùng được hay không" chứ không phải lỗi:
 *
 *   1. **Không chọn được nhiều thứ.** Chỉ `status` nhận nhiều giá trị, và cũng
 *      chỉ qua liên kết — biểu mẫu không có cách nào chọn hai trạng thái.
 *   2. **Gõ tay những thứ có sẵn danh sách.** Mã khách hàng và nhóm sản phẩm là
 *      mã có thật trong danh mục; gõ sai một ký tự thì kết quả rỗng, và không có
 *      gì phân biệt "không có hồ sơ nào" với "bạn gõ sai mã".
 *   3. **Xuất Excel không theo bộ lọc.** Nút nằm ở trang *Báo cáo* và gửi lên
 *      `{}` — nó xuất cả phạm vi. Màn hình có bộ lọc thì không có nút nào.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChonNhieu } from '@csbh/web/chon-nhieu';
import { NutXuatExcel } from '@csbh/web/nut-xuat-excel';
import { KHOA_NHAN_TU_LIEN_KET, KHOA_NHIEU } from '@csbh/web/ho-so-ui';
import {
  FILTER_KEYS,
  KHOA_NGOAI_MUC_92,
  KHOA_NHIEU_GIA_TRI,
} from '@csbh/reporting/testing';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// =============================================================================
// Ô chọn nhiều
// =============================================================================

const NHOM = [
  { gia: 'SUA', nhan: 'SUA — Sữa dinh dưỡng' },
  { gia: 'BOT', nhan: 'BOT — Bột ăn dặm' },
  { gia: 'NUOC', nhan: 'NUOC — Nước uống' },
];

describe('`0077` ô chọn nhiều', () => {
  it('chọn hai mục thì trả về CẢ HAI giá trị', async () => {
    const nguoi = userEvent.setup();
    const doi = vi.fn();
    const { rerender } = render(
      <ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={[]} nguon={NHOM} doi={doi} />,
    );

    await nguoi.click(screen.getByLabelText('Nhóm sản phẩm'));
    await nguoi.click(await screen.findByRole('option', { name: /Sữa dinh dưỡng/ }));
    expect(doi).toHaveBeenLastCalledWith(['SUA']);

    // Thành phần không tự giữ giá trị — trang cha giữ. Vẽ lại với giá trị mới,
    // đúng như trang cha làm sau khi nhận `doi`.
    rerender(<ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={['SUA']} nguon={NHOM} doi={doi} />);
    await nguoi.click(screen.getByLabelText('Nhóm sản phẩm'));
    await nguoi.click(await screen.findByRole('option', { name: /Bột ăn dặm/ }));
    expect(doi).toHaveBeenLastCalledWith(['SUA', 'BOT']);
  });

  it('mục ĐÃ CHỌN không hiện lại trong danh sách', async () => {
    const nguoi = userEvent.setup();
    render(
      <ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={['SUA']} nguon={NHOM} doi={() => undefined} />,
    );
    await nguoi.click(screen.getByLabelText('Nhóm sản phẩm'));
    // Chọn lại thứ đang chọn là một thao tác không làm gì cả — bày nó ra là mời
    // người dùng bấm một nút vô nghĩa.
    expect(screen.queryByRole('option', { name: /Sữa dinh dưỡng/ })).toBeNull();
    expect(await screen.findByRole('option', { name: /Bột ăn dặm/ })).toBeDefined();
  });

  it('bấm chip thì gỡ ĐÚNG một giá trị, giữ nguyên phần còn lại', async () => {
    const nguoi = userEvent.setup();
    const doi = vi.fn();
    render(
      <ChonNhieu
        id="t"
        nhan="Nhóm sản phẩm"
        giaTri={['SUA', 'BOT', 'NUOC']}
        nguon={NHOM}
        doi={doi}
      />,
    );
    await nguoi.click(screen.getByRole('button', { name: /Bỏ .*Bột ăn dặm/ }));
    expect(doi).toHaveBeenCalledWith(['SUA', 'NUOC']);
  });

  it('chip hiện NHÃN, không hiện mã trần', () => {
    render(
      <ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={['SUA']} nguon={NHOM} doi={() => undefined} />,
    );
    // Danh sách nạp sẵn nên tra được nhãn ngay, không phải gọi thêm lượt mạng
    // nào chỉ để biết chip hiện chữ gì.
    expect(screen.getByRole('button', { name: /Bỏ/ }).textContent).toContain('Sữa dinh dưỡng');
  });

  it('BÀN PHÍM chọn được: Tab tới ô, gõ, rồi Enter', async () => {
    /*
     * Dựng bằng `<div onClick>` thì bàn phím không tới được, và đó là kiểu hỏng
     * không ai thấy cho tới khi có người không dùng chuột — cùng lý do đã ghi ở
     * `VungTaiLen.tsx`.
     */
    const nguoi = userEvent.setup();
    const doi = vi.fn();
    render(<ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={[]} nguon={NHOM} doi={doi} />);

    await nguoi.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Nhóm sản phẩm'));
    await nguoi.keyboard('nuoc{Enter}');
    expect(doi).toHaveBeenCalledWith(['NUOC']);
  });

  it('Tab sang ô KHÁC thì danh sách gập lại, không để hai cái cùng xoè', async () => {
    /*
     * Tìm ra bằng cách đo trong Chrome thật, không phải bằng suy luận. Bản đầu
     * chỉ nghe `mousedown`, nên với chuột thì mọi thứ trông ổn — cú bấm vào ô
     * sau đã dọn hộ ô trước. Đi bằng bàn phím thì không có cú bấm nào, và hai
     * danh sách chồng lên nhau.
     */
    const nguoi = userEvent.setup();
    render(
      <>
        <ChonNhieu id="a" nhan="Nhóm sản phẩm" giaTri={[]} nguon={NHOM} doi={() => undefined} />
        <ChonNhieu id="b" nhan="Trạng thái" giaTri={[]} nguon={NHOM} doi={() => undefined} />
      </>,
    );

    await nguoi.click(screen.getByLabelText('Nhóm sản phẩm'));
    await waitFor(() => expect(document.querySelectorAll('.chon-nhieu-ds')).toHaveLength(1));

    // Tab một nhịp đi VÀO danh sách đang xoè — đúng thứ tự người dùng bàn phím
    // cần: mở ra rồi đi tiếp là tới các mục chọn được.
    await nguoi.tab();
    expect((document.activeElement as HTMLElement).className).toBe('chon-nhieu-muc');

    // Rời hẳn sang ô kia.
    screen.getByLabelText('Trạng thái').focus();
    await waitFor(() => {
      const ds = document.querySelectorAll('.chon-nhieu-ds');
      expect(ds.length, 'hai danh sách cùng xoè').toBe(1);
    });
    // Và cái đang xoè là của ô ĐANG có tiêu điểm, không phải ô vừa rời.
    expect(document.querySelector('#b')?.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('#a')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('nguồn ở MÁY CHỦ: chưa gõ thì chưa gọi mạng, và KHÔNG mở hộp rỗng', async () => {
    /*
     * Hai chuyện trong một ca, vì chúng cùng một nguyên nhân — chưa có gì để bày.
     *
     * Không gọi mạng: danh mục khách hàng và sản phẩm có thể lên hàng nghìn
     * dòng, nạp sẵn cả danh mục là một lượt tải lớn cho một ô có thể không ai
     * đụng tới.
     *
     * Không mở hộp: bản `0077` mở một khung chứa đúng một dòng chữ *"Gõ vài chữ
     * để tìm"* — nói lại điều mà chỗ gợi ý trong ô nhập đã nói, và che mất ô ngay
     * bên dưới (`0078`).
     */
    const nguoi = userEvent.setup();
    const tim = vi.fn(() => Promise.resolve([{ gia: 'KH01', nhan: 'KH01 — Nhà thuốc A' }]));
    render(<ChonNhieu id="t" nhan="Mã khách hàng" giaTri={[]} nguon={tim} doi={() => undefined} />);

    await nguoi.click(screen.getByLabelText('Mã khách hàng'));
    expect(tim).not.toHaveBeenCalled();
    expect(document.querySelector('.chon-nhieu-ds'), 'mở một hộp rỗng').toBeNull();
    expect(screen.queryByText(/Gõ vài chữ/)).toBeNull();
  });

  it('nguồn NẠP SẴN thì vẫn mở ngay — không có gì phải chờ gõ', async () => {
    // Vế đối chứng của ca trên: quy tắc là "chưa có gì để bày thì đừng bày", chứ
    // không phải "luôn bắt gõ trước". Danh sách nạp sẵn thì bày được ngay.
    const nguoi = userEvent.setup();
    render(
      <ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={[]} nguon={NHOM} doi={() => undefined} />,
    );
    await nguoi.click(screen.getByLabelText('Nhóm sản phẩm'));
    await waitFor(() => expect(document.querySelector('.chon-nhieu-ds')).not.toBeNull());
  });

  it('nguồn ở MÁY CHỦ: gõ xong mới hỏi, và hỏi MỘT lần cho cả từ khoá', async () => {
    vi.useFakeTimers();
    try {
      const tim = vi.fn(() => Promise.resolve([{ gia: 'KH01', nhan: 'KH01 — Nhà thuốc A' }]));
      render(
        <ChonNhieu id="t" nhan="Mã khách hàng" giaTri={[]} nguon={tim} doi={() => undefined} />,
      );
      const o = screen.getByLabelText('Mã khách hàng');
      // Gõ theo từng phím là năm lượt mạng cho một từ khoá năm chữ, và bốn lượt
      // đầu đều vô ích.
      for (const ch of ['n', 'ha', 'nha ', 'nha t']) {
        fireEvent.change(o, { target: { value: ch } });
        vi.advanceTimersByTime(100);
      }
      expect(tim).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(tim).toHaveBeenCalledTimes(1);
      expect(tim).toHaveBeenCalledWith('nha t');
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================
// Xuất Excel
// =============================================================================

describe('`0077` nút xuất Excel', () => {
  const chan = (batLoc: (than: unknown) => void) => {
    const f = vi.fn((duong: unknown, tuyChon?: { body?: string }) => {
      const d = String(duong);
      if (d.includes('/reports/exports') && tuyChon?.body !== undefined) {
        batLoc(JSON.parse(tuyChon.body));
        return Promise.resolve(json({ jobId: 'j1', status: 'CHO', rowCount: null, downloadUrl: null }));
      }
      return Promise.resolve(
        json({ jobId: 'j1', status: 'XONG', rowCount: 27, downloadUrl: '/reports/exports/j1/file' }),
      );
    });
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('gửi lên ĐÚNG bộ lọc đang áp, không phải `{}`', async () => {
    /*
     * Đây chính là lỗi đang sửa. Máy chủ vốn nhận và tôn trọng một bộ lọc từ
     * ngày đầu (`POST /reports/exports` gọi `cleanFilter`); cả khả năng ấy nằm
     * đó không ai gọi tới, vì nút duy nhất trong phần mềm gửi lên một object
     * rỗng — và nó đứng ở trang *Báo cáo*, nơi không có bộ lọc nào để gửi.
     */
    const nguoi = userEvent.setup();
    let daGui: unknown = null;
    chan((than) => (daGui = than));

    const boLoc = { status: 'NHAP,CHO_TBP_DUYET', productGroupCode: 'SUA' };
    render(<NutXuatExcel boLoc={boLoc} />);
    await nguoi.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(daGui).not.toBeNull());
    expect(daGui).toEqual(boLoc);
  });

  it('xong thì nút đổi thành *Tải file* kèm SỐ DÒNG', async () => {
    const nguoi = userEvent.setup();
    chan(() => undefined);
    render(<NutXuatExcel boLoc={{}} />);
    await nguoi.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    // Số dòng trên nút là thứ người dùng đối chiếu với con số trên màn hình —
    // hai con số ấy phải là một, và máy chủ có một ca riêng canh điều đó.
    const nut = await screen.findByRole('button', { name: /Tải file \(27 dòng\)/ }, { timeout: 3000 });
    expect(nut).toBeDefined();
  });

  it('ĐỔI bộ lọc thì vứt việc đang có, không để tải nhầm file cũ', async () => {
    /*
     * Không có nhánh này thì người dùng bấm xuất, đổi điều kiện, rồi bấm "Tải
     * file" — và nhận về file của bộ lọc CŨ, mang đúng số dòng của một danh sách
     * không còn trên màn hình. Không có gì báo sai, chỉ có một file sai.
     */
    const nguoi = userEvent.setup();
    chan(() => undefined);
    const { rerender } = render(<NutXuatExcel boLoc={{ status: 'NHAP' }} />);
    await nguoi.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await screen.findByRole('button', { name: /Tải file/ }, { timeout: 3000 });

    rerender(<NutXuatExcel boLoc={{ status: 'DA_XOA' }} />);
    expect(screen.queryByRole('button', { name: /Tải file/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeDefined();
  });

  it('tải file đi qua `taiVe`, KHÔNG phải một thẻ neo trỏ vào API', () => {
    /*
     * Thẻ neo không gửi header `Authorization`, mà đường tải file nằm sau
     * `@Roles(...)` — nên `<a href={GOC_API + downloadUrl}>` trả về 401 và trình
     * duyệt hiện một trang lỗi thay vì tải file. Đúng lỗi mà nút *Xuất hợp đồng*
     * từng mắc và `taiVe()` sinh ra để bịt.
     *
     * Nó lọt lại ở đây vì bộ kiểm thử gọi đường ấy từ phía máy chủ, nơi header
     * luôn có sẵn. Quét mã nguồn là cách duy nhất bắt được nó quay lại.
     */
    const nguon = readFileSync('apps/web/src/components/NutXuatExcel.tsx', 'utf8');
    expect(nguon).toContain('taiVe(');
    expect(nguon, 'thẻ neo trỏ thẳng vào API đã quay lại').not.toMatch(/href=\{`?\$\{GOC_API\}/);
  });
});

// =============================================================================
// Đối chiếu hai chiều: biểu mẫu ↔ máy chủ
// =============================================================================

describe('`0077` biểu mẫu lọc khớp đúng danh sách tiêu chí của máy chủ', () => {
  it('không tiêu chí nào có ở một bên mà thiếu ở bên kia', () => {
    /*
     * Phép đối chiếu này CHƯA TỪNG CÓ, và chỗ trống ấy đã có người nhận ra:
     * chú thích ở `reports.controller.ts` nói *"màn hình dựng form từ đây"*, còn
     * màn hình thì chép tay danh sách. Hai bên lệch nhau thì hoặc có một ô lọc
     * mà máy chủ bỏ qua trong im lặng, hoặc có một tiêu chí không ô nào chạm
     * tới — và không lỗi nào trong hai lỗi đó làm màn hình đỏ lên.
     */
    const mayChu = [...FILTER_KEYS, ...KHOA_NGOAI_MUC_92].sort();
    expect([...KHOA_NHAN_TU_LIEN_KET].sort()).toEqual(mayChu);
  });

  it('ô chọn nhiều ở giao diện khớp đúng `KHOA_NHIEU_GIA_TRI` của máy chủ', () => {
    // Lệch chiều nào cũng hỏng: một ô cho chọn nhiều mà máy chủ hiểu là một giá
    // trị thì kết quả rỗng; một tiêu chí máy chủ nhận nhiều mà giao diện chỉ cho
    // gõ một thì cả khả năng ấy không ai với tới.
    expect([...KHOA_NHIEU].sort()).toEqual([...KHOA_NHIEU_GIA_TRI].sort());
  });

  it('ba tiêu chí đã bỏ không còn dấu vết nào ở biểu mẫu', () => {
    for (const bo of ['address', 'taxId', 'requesterId']) {
      expect(KHOA_NHAN_TU_LIEN_KET, `${bo} vẫn còn`).not.toContain(bo);
    }
  });
});
