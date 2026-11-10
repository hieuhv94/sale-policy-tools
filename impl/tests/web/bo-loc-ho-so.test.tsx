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

  it('mũi tên ↓ ↑ di chuyển mục đang tô, Enter chọn ĐÚNG mục đang tô (`0284`)', async () => {
    const nguoi = userEvent.setup();
    const doi = vi.fn();
    render(<ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={[]} nguon={NHOM} doi={doi} />);
    const o = screen.getByLabelText('Nhóm sản phẩm');
    await nguoi.click(o);
    const tomDau = () => screen.getAllByRole('option').findIndex((x) => x.getAttribute('aria-selected') === 'true');
    expect(tomDau(), 'mặc định tô mục đầu — Enter ngay vẫn chọn mục đầu như trước').toBe(0);
    await nguoi.keyboard('{ArrowDown}{ArrowDown}');
    expect(tomDau()).toBe(2);
    // `aria-activedescendant` trỏ đúng mục đang tô, để trình đọc màn hình đọc được.
    expect(o.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[2]!.id);
    await nguoi.keyboard('{ArrowUp}');
    expect(tomDau()).toBe(1);
    await nguoi.keyboard('{Enter}');
    expect(doi).toHaveBeenLastCalledWith(['BOT']);
  });

  it('mũi tên không vượt khỏi hai đầu danh sách', async () => {
    const nguoi = userEvent.setup();
    render(<ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={[]} nguon={NHOM} doi={() => undefined} />);
    await nguoi.click(screen.getByLabelText('Nhóm sản phẩm'));
    await nguoi.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true');
    await nguoi.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getAllByRole('option')[2]!.getAttribute('aria-selected')).toBe('true');
  });

  it('danh sách gợi ý bám ô NHẬP, không che nó (`0284`)', () => {
    /*
     * jsdom không dàn trang nên không đo được vị trí; hai điều kiện sau là thứ giữ vị trí đúng:
     *   1. ô nhập và danh sách chung MỘT khung định vị (`.chon-nhieu-o`), không phải khung `.truong` có cả
     *      nhãn và thẻ đã chọn;
     *   2. luật `.chon-nhieu-ds` có `top` tường minh. Thiếu nó thì danh sách đứng ở vị trí TĨNH — trong
     *      container flex là ĐỈNH container, chồng lên chính ô đang gõ (đo trên Chrome thật: danh sách ở
     *      y=316, ô nhập ở y=335).
     */
    render(
      <ChonNhieu id="t" nhan="Nhóm sản phẩm" giaTri={['SUA']} nguon={NHOM} doi={() => undefined} />,
    );
    screen.getByLabelText('Nhóm sản phẩm').focus();
    const o = screen.getByLabelText('Nhóm sản phẩm');
    fireEvent.focus(o);
    const ds = document.querySelector('.chon-nhieu-ds');
    expect(ds, 'danh sách phải hiện khi ô được chọn').not.toBeNull();
    expect(ds!.parentElement).toBe(o.parentElement);
    expect(o.parentElement!.className).toContain('chon-nhieu-o');
    // Nhãn và thẻ đã chọn nằm NGOÀI khung định vị.
    expect(o.parentElement!.querySelector('label, .chon-nhieu-chip')).toBeNull();

    const css = readFileSync('apps/web/src/styles/app.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const luat = (ten: string) => new RegExp(`(?:^|\\n)${ten.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(luat('.chon-nhieu-o')).toMatch(/position:\s*relative/);
    expect(luat('.chon-nhieu-ds')).toMatch(/\btop:\s*calc\(100%/);
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

describe('`0077`/`0283` xuất Excel: xem trước rồi mới tải', () => {
  const XEM = {
    soHoSo: 2,
    soDong: 3,
    daCat: false,
    tran: 20000,
    dong: [
      { code: 'CSBH-1', customerName: 'Nhà thuốc A', status: 'NHAP', productCode: 'SP-1', productName: 'Sữa Gold', groupCode: 'SUA', netPrice: '535000', discountRate: '22.00', overThreshold: false },
      { code: 'CSBH-1', customerName: 'Nhà thuốc A', status: 'NHAP', productCode: 'SP-2', productName: 'Bột ăn dặm', groupCode: 'BOT', netPrice: '89000', discountRate: '8.00', overThreshold: false },
      { code: 'CSBH-2', customerName: 'Nhà thuốc B', status: 'NHAP', productCode: 'SP-3', productName: 'Sữa Mom', groupCode: 'SUA', netPrice: '361000', discountRate: '24.80', overThreshold: true },
    ],
  };
  type Vet = { xemTruoc: string[]; thanXuat: unknown[] };
  const chan = (xem: Record<string, unknown> = XEM): Vet => {
    const vet: Vet = { xemTruoc: [], thanXuat: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn((duong: unknown, tuyChon?: { body?: string }) => {
        const d = String(duong);
        if (d.includes('/reports/exports/preview')) {
          vet.xemTruoc.push(d);
          return Promise.resolve(json(xem));
        }
        if (d.includes('/reports/exports') && tuyChon?.body !== undefined) {
          vet.thanXuat.push(JSON.parse(tuyChon.body));
          return Promise.resolve(json({ jobId: 'j1', status: 'CHO', rowCount: null, downloadUrl: null }));
        }
        return Promise.resolve(
          json({ jobId: 'j1', status: 'XONG', rowCount: 27, downloadUrl: '/reports/exports/j1/file' }),
        );
      }),
    );
    return vet;
  };
  const moHop = async (boLoc: Record<string, string>) => {
    const nguoi = userEvent.setup();
    render(<NutXuatExcel boLoc={boLoc} />);
    await nguoi.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await screen.findByRole('dialog');
    await screen.findByText(/dòng sản phẩm trong file/);
    return nguoi;
  };

  it('bấm nút KHÔNG tải gì: mở hộp xem trước với đúng bộ lọc, và hai con số của cả lượt', async () => {
    const vet = chan();
    await moHop({ status: 'NHAP', productGroupCode: 'SUA' });
    expect(vet.thanXuat).toHaveLength(0);
    expect(vet.xemTruoc).toHaveLength(1);
    expect(vet.xemTruoc[0]).toContain('status=NHAP');
    expect(vet.xemTruoc[0]).toContain('productGroupCode=SUA');
    expect(vet.xemTruoc[0]).toContain('limit=50');
    expect(vet.xemTruoc[0]).not.toContain('tatCaSanPham');
    expect(screen.getByText(/dòng sản phẩm trong file/).textContent).toMatch(/2.*hồ sơ.*3.*dòng sản phẩm/);
    // Bảng xem trước có mặt các dòng.
    expect(screen.getByText('Sữa Gold')).toBeDefined();
    expect(screen.getByText('Bột ăn dặm')).toBeDefined();
  });

  it('MẶC ĐỊNH chỉ dòng khớp: ô tích tắt, lượt xuất không mang cờ, và bộ lọc đi nguyên vẹn', async () => {
    const vet = chan();
    const boLoc = { status: 'NHAP,CHO_TBP_DUYET', productGroupCode: 'SUA', discountFrom: '20', discountTo: '25' };
    const nguoi = await moHop(boLoc);
    const o = screen.getByRole('checkbox', { name: /Thêm mọi sản phẩm trong CSBH/ }) as HTMLInputElement;
    expect(o.checked).toBe(false);
    expect(o.disabled).toBe(false);
    await nguoi.click(screen.getByRole('button', { name: /Tải file Excel/ }));
    await waitFor(() => expect(vet.thanXuat).toHaveLength(1));
    // Đây chính là lỗi cũ đã sửa ở `0077`: bộ lọc phải đi lên, không phải `{}`.
    expect(vet.thanXuat[0]).toEqual(boLoc);
  });

  it('TÍCH ô: bản xem trước hỏi lại VỚI cờ, và file tải về mang đúng cờ ấy', async () => {
    const vet = chan();
    const nguoi = await moHop({ productGroupCode: 'SUA' });
    await nguoi.click(screen.getByRole('checkbox', { name: /Thêm mọi sản phẩm trong CSBH/ }));
    await waitFor(() => expect(vet.xemTruoc).toHaveLength(2));
    expect(vet.xemTruoc[1]).toContain('tatCaSanPham=1');
    await screen.findByText(/dòng sản phẩm trong file/);
    await nguoi.click(screen.getByRole('button', { name: /Tải file Excel/ }));
    await waitFor(() => expect(vet.thanXuat).toHaveLength(1));
    // Xem thế nào tải thế ấy.
    expect(vet.thanXuat[0]).toEqual({ productGroupCode: 'SUA', tatCaSanPham: true });
  });

  it('không tiêu chí sản phẩm nào: ô tích TẮT kèm một câu nói vì sao, và cờ không bao giờ đi lên', async () => {
    const vet = chan();
    const nguoi = await moHop({ status: 'NHAP' });
    const o = screen.getByRole('checkbox', { name: /Thêm mọi sản phẩm trong CSBH/ }) as HTMLInputElement;
    expect(o.disabled).toBe(true);
    expect(screen.getByText(/không có tiêu chí về sản phẩm/)).toBeDefined();
    await nguoi.click(screen.getByRole('button', { name: /Tải file Excel/ }));
    await waitFor(() => expect(vet.thanXuat).toHaveLength(1));
    expect(vet.thanXuat[0]).not.toHaveProperty('tatCaSanPham');
  });

  it('ba tiêu chí sản phẩm đều mở được ô tích: tên, nhóm, khoảng chiết khấu', async () => {
    for (const boLoc of [{ productName: 'Sữa' }, { productGroupCode: 'SUA' }, { discountFrom: '20' }, { discountTo: '30' }]) {
      chan();
      const { unmount } = render(<NutXuatExcel boLoc={boLoc} />);
      await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
      await screen.findByText(/dòng sản phẩm trong file/);
      expect((screen.getByRole('checkbox', { name: /Thêm mọi sản phẩm/ }) as HTMLInputElement).disabled, JSON.stringify(boLoc)).toBe(false);
      unmount();
      cleanup();
    }
  });

  it('ĐỔI ô tích hay bộ lọc thì vứt việc đang có, không để tải nhầm file của lựa chọn kia', async () => {
    /*
     * Không có nhánh này thì người dùng xem bản hẹp, bấm tải, tích ô rồi bấm tải lần nữa — và nhận về file
     * dựng cho lựa chọn CŨ. Không có gì báo sai, chỉ có một file sai.
     */
    const vet = chan();
    const nguoi = await moHop({ productGroupCode: 'SUA' });
    await nguoi.click(screen.getByRole('button', { name: /Tải file Excel/ }));
    await screen.findByRole('button', { name: /Đã dựng xong/ }, { timeout: 3000 });

    await nguoi.click(screen.getByRole('checkbox', { name: /Thêm mọi sản phẩm trong CSBH/ }));
    await screen.findByRole('button', { name: /Tải file Excel/ });
    expect(screen.queryByRole('button', { name: /Đã dựng xong/ })).toBeNull();
    await nguoi.click(screen.getByRole('button', { name: /Tải file Excel/ }));
    await waitFor(() => expect(vet.thanXuat).toHaveLength(2));
    expect(vet.thanXuat[0]).not.toHaveProperty('tatCaSanPham');
    expect(vet.thanXuat[1]).toHaveProperty('tatCaSanPham', true);
  });

  it('vượt trần số dòng: nói ra và KHÔNG cho tải', async () => {
    chan({ ...XEM, soDong: 25000, daCat: true });
    await moHop({ productGroupCode: 'SUA' });
    expect(screen.getByText(/vượt trần 20000 dòng/)).toBeDefined();
    expect((screen.getByRole('button', { name: /Tải file Excel/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('không hồ sơ nào khớp: nói ra, không có bảng, nút tải khoá', async () => {
    chan({ ...XEM, soHoSo: 0, soDong: 0, dong: [] });
    await moHop({ status: 'DA_XOA' });
    expect(screen.getByText(/Không có hồ sơ nào khớp bộ lọc/)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    expect((screen.getByRole('button', { name: /Tải file Excel/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('bản xem trước hỏng thì có nút Thử lại, không treo ở "đang dựng"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ code: 'INTERNAL' }), { status: 500, headers: { 'content-type': 'application/json' } }))));
    const nguoi = userEvent.setup();
    render(<NutXuatExcel boLoc={{}} />);
    await nguoi.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    expect(await screen.findByRole('button', { name: /Thử lại/ })).toBeDefined();
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
