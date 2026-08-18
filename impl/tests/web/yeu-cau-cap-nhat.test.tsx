/**
 * @vitest-environment jsdom
 *
 * 0029 — box "Yêu cầu cập nhật" trên trang Tổng quan.
 *
 * Box này tồn tại vì một lý do rất cụ thể: hồ sơ đã gửi duyệt đóng băng giá và
 * ngưỡng — luật đúng, không ai được sửa văn bản đang chờ chữ ký — nên người sắp
 * ký vào nó không có cách nào biết con số đã lỗi thời. Mọi test dưới đây kiểm
 * đúng cái đó: người đọc box phải thấy CON SỐ, không phải một câu "bị ảnh hưởng".
 *
 * `0049` gấp chi tiết lại sau một cú bấm, nên phần lớn ca dưới đây phải MỞ hồ sơ
 * ra trước khi soi con số. Cái không đổi: mở ra rồi thì con số vẫn phải ở đó.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { YeuCauCapNhat, type HoSoLech } from '@csbh/web/yeu-cau-cap-nhat';
import { KHOI_THEO_VAI_TRO, MOI_TRANG_TONG_QUAN } from '@csbh/web/tong-quan';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HO_SO: HoSoLech[] = [
  {
    id: 'hs-1',
    code: 'CSBH-2026-000123',
    status: 'CHO_TBP_DUYET',
    versionNo: 1,
    appliedDate: '2026-03-01',
    detectedAt: '2026-08-16T02:00:00.000Z',
    lech: [
      { kind: 'PRICE', productCode: 'NC-GOLD-900', snapValue: '615000', newValue: '680000' },
      { kind: 'RULE', productCode: 'NC-GOLD-900', snapValue: '15.00', newValue: '18.00' },
    ],
  },
];

const phanHoi = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const chan = (items: HoSoLech[]) =>
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(phanHoi({ items }))));

/**
 * Chờ khối hiện ra rồi trả về nó.
 *
 * `waitFor(() => document.querySelector(...))` KHÔNG chờ: `querySelector` trả
 * `null` chứ không ném, nên `waitFor` coi lần gọi đầu là thành công và trả về
 * `null`. Phải khẳng định BÊN TRONG callback thì nó mới thử lại.
 */
const doiKhoi = async (): Promise<HTMLElement> =>
  waitFor(() => {
    const el = document.querySelector('.khoi');
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });

/** Chờ khối rồi BẤM MỞ hồ sơ đầu tiên — chi tiết gấp lại từ `0049`. */
const moHoSoDau = async (): Promise<HTMLElement> => {
  const khoi = await doiKhoi();
  fireEvent.click(within(khoi).getAllByRole('button', { expanded: false })[0]!);
  return khoi;
};

describe('0029 box hiện đúng thứ người đọc cần', () => {
  it('hiện mã hồ sơ và trạng thái của nó', async () => {
    chan(HO_SO);
    render(<YeuCauCapNhat />);
    await waitFor(() => expect(screen.getByText('CSBH-2026-000123')).toBeDefined());
  });

  it('mở ra rồi thì nói RÕ lệch cái gì, từ đâu sang đâu', async () => {
    chan(HO_SO);
    render(<YeuCauCapNhat />);
    const khoi = await moHoSoDau();
    // Giá đọc theo tiền, ngưỡng đọc theo phần trăm — cùng một cột text ở CSDL.
    expect(within(khoi).getByText('615.000 đ')).toBeDefined();
    expect(within(khoi).getByText('680.000 đ')).toBeDefined();
    expect(within(khoi).getByText('15,00%')).toBeDefined();
    expect(within(khoi).getByText('18,00%')).toBeDefined();
  });

  it('phân biệt được chênh lệch GIÁ với chênh lệch NGƯỠNG', async () => {
    chan(HO_SO);
    render(<YeuCauCapNhat />);
    await waitFor(() => expect(document.querySelector('.nhan-lech.gia')).not.toBeNull());
    expect(document.querySelector('.nhan-lech.nguong')).not.toBeNull();
  });

  it('`0049` dòng GẤP LẠI vẫn mang nhãn loại — quét được mà không phải mở', async () => {
    /*
     * Khẳng định chính của `0049`, và là chỗ dễ cắt quá tay nhất.
     *
     * "Chỉ hiện danh sách hồ sơ" mà cắt luôn nhãn loại thì mười hồ sơ lệch trông
     * y hệt nhau, và người dùng phải mở từng cái mới biết cái nào mất sản phẩm
     * (điều khoản không thực hiện được) với cái nào chỉ lệch giá vài đồng.
     */
    chan(HO_SO);
    render(<YeuCauCapNhat />);
    const khoi = await doiKhoi();
    const tomTat = khoi.querySelector('.lech-tom-tat');
    expect(tomTat, 'dòng gấp lại không có nhãn loại nào').not.toBeNull();
    expect(tomTat!.textContent).toContain('Giá');
    expect(tomTat!.textContent).toContain('QĐ chiết khấu');

    // Nhưng CON SỐ thì chưa hiện — đó mới là phần được gấp lại.
    expect(within(khoi).queryByText('615.000 đ')).toBeNull();
  });

  it('`0049` nhãn loại KHÔNG lặp lại khi một hồ sơ lệch nhiều dòng cùng loại', async () => {
    chan([
      {
        ...HO_SO[0]!,
        lech: [
          { kind: 'PRICE', productCode: 'A', snapValue: '1', newValue: '2' },
          { kind: 'PRICE', productCode: 'B', snapValue: '3', newValue: '4' },
        ],
      },
    ]);
    render(<YeuCauCapNhat />);
    const khoi = await doiKhoi();
    expect(khoi.querySelectorAll('.lech-tom-tat .nhan-lech')).toHaveLength(1);
    // Nhưng số điểm lệch vẫn đếm đủ hai.
    expect(khoi.textContent).toContain('2 điểm lệch');
  });

  it('`0049` nhãn nặng nhất đứng trước — Sản phẩm trước Giá', async () => {
    // Cùng thứ tự với thư báo: mất sản phẩm là điều khoản không thực hiện được,
    // không cùng hạng với chênh lệch vài đồng.
    chan([
      {
        ...HO_SO[0]!,
        lech: [
          { kind: 'PRICE', productCode: 'A', snapValue: '1', newValue: '2' },
          { kind: 'PRODUCT', productCode: 'B', snapValue: 'Đang áp dụng', newValue: null },
        ],
      },
    ]);
    render(<YeuCauCapNhat />);
    const khoi = await doiKhoi();
    const nhan = [...khoi.querySelectorAll('.lech-tom-tat .nhan-lech')].map((e) => e.textContent);
    expect(nhan).toEqual(['Sản phẩm', 'Giá']);
  });

  it('`0054` loại RULE gọi là "QĐ chiết khấu", không phải "Ngưỡng"', async () => {
    /*
     * Thứ đã đổi là **quy định** chiết khấu; ngưỡng chỉ là con số nó sinh ra.
     * Gọi theo con số thì người đọc đi tìm một trường tên "ngưỡng" để sửa, mà
     * cái sửa được nằm ở màn hình *Danh mục ▸ Quy định chiết khấu*.
     */
    chan([{ ...HO_SO[0]!, lech: [
      { kind: 'RULE', productCode: 'NC-GOLD-900', snapValue: '15.00', newValue: '18.00' },
    ] }]);
    render(<YeuCauCapNhat />);
    const khoi = await moHoSoDau();
    expect(khoi.textContent).toContain('QĐ chiết khấu');
    expect(khoi.textContent, 'vẫn còn tên cũ').not.toContain('Ngưỡng');
  });

  it('`0054` chi tiết lệch dựng thành BẢNG, các cột thẳng hàng', async () => {
    /*
     * Bản trước xếp bốn mẩu trên một dòng chảy, nên mã sản phẩm và con số bắt
     * đầu ở một cột khác nhau trên mỗi dòng — đọc ba dòng thì mắt phải dò lại từ
     * đầu ba lần, mà đây đúng là chỗ người ta cần so con số theo cột.
     */
    chan([{ ...HO_SO[0]!, lech: [
      { kind: 'PRICE', productCode: 'NC-GOLD-900', snapValue: '615000', newValue: '680000' },
      { kind: 'RULE', productCode: 'NC-BONE-900', snapValue: '15.00', newValue: '18.00' },
    ] }]);
    render(<YeuCauCapNhat />);
    const khoi = await moHoSoDau();

    const bang = khoi.querySelector('table.bang-lech');
    expect(bang, 'chi tiết lệch không phải bảng').not.toBeNull();
    expect([...bang!.querySelectorAll('thead th')].map((e) => e.textContent)).toEqual([
      'Lệch ở',
      'Sản phẩm',
      'Trên hồ sơ',
      'Danh mục hiện tại',
    ]);

    const dong = [...bang!.querySelectorAll('tbody tr')];
    expect(dong).toHaveLength(2);
    // Giá trị cũ và mới nằm ở HAI CỘT, không phải hai mẩu chữ cách nhau bằng mũi tên.
    const o = [...dong[0]!.querySelectorAll('td')].map((e) => e.textContent);
    expect(o).toEqual(['Giá', 'NC-GOLD-900', '615.000 đ', '680.000 đ']);

    // Bảng phải cuộn ngang được trên điện thoại, như mọi bảng khác trong sản phẩm.
    expect(bang!.closest('.khung-cuon'), 'bảng không bọc trong khung cuộn').not.toBeNull();
  });

  it('`0049` bấm lần nữa thì gấp lại', async () => {
    chan(HO_SO);
    render(<YeuCauCapNhat />);
    const khoi = await moHoSoDau();
    expect(within(khoi).getByText('615.000 đ')).toBeDefined();

    fireEvent.click(within(khoi).getAllByRole('button', { expanded: true })[0]!);
    expect(within(khoi).queryByText('615.000 đ')).toBeNull();
  });

  it('không còn quy định nào thì nói THÀNH LỜI, không để ô trống', async () => {
    chan([{ ...HO_SO[0]!, lech: [
      { kind: 'RULE', productCode: 'NC-GOLD-900', snapValue: '15.00', newValue: null },
    ] }]);
    render(<YeuCauCapNhat />);
    await moHoSoDau();
    expect(screen.getByText(/không còn quy định nào/)).toBeDefined();
  });

  it('nói rõ hồ sơ KHÔNG tự cập nhật — nếu không người dùng sẽ chờ nó tự sửa', async () => {
    chan(HO_SO);
    render(<YeuCauCapNhat />);
    const khoi = await doiKhoi();
    expect(khoi.textContent).toContain('không tự cập nhật');
  });

  it('`0049` mở ra rồi vẫn còn đường sang hồ sơ', async () => {
    // Dòng ngoài giờ là nút gấp/mở, nên liên kết chuyển vào phần mở ra. Mất nó
    // thì box này thành một bảng thông báo cụt: biết hồ sơ nào lệch mà không có
    // cách nào tới đó.
    chan(HO_SO);
    render(<YeuCauCapNhat />);
    const khoi = await doiKhoi();
    expect(within(khoi).queryByRole('link'), 'gấp lại mà đã có liên kết').toBeNull();

    fireEvent.click(within(khoi).getAllByRole('button', { expanded: false })[0]!);
    const a = within(khoi).getByRole('link') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/ho-so/hs-1');
  });
});

describe('`0050` cùng thông tin ấy có mặt trên màn hình hồ sơ', () => {
  it('màn hình chi tiết hồ sơ dựng danh sách lệch, không chỉ trang tổng quan', () => {
    /*
     * Box này chỉ cứu được người tình cờ ghé qua trang tổng quan trước khi ký.
     * Người sắp ký thường mở THẲNG hồ sơ — từ thư báo, từ hộp việc, từ danh sách
     * — và tới `0049` ở đó không có gì nói rằng con số họ đang nhìn đã lỗi thời.
     *
     * Quét mã nguồn vì dựng cả trang chi tiết trong test cần chặn bốn lời gọi
     * mạng và một ngữ cảnh phiên; ở đây chỉ cần biết khối ấy CÓ được dựng.
     */
    const nguon = readFileSync('apps/web/src/pages/ChiTietHoSo.tsx', 'utf8');
    expect(nguon).toContain('DanhSachLech');
    expect(nguon).toContain('canh-bao-lech');

    // Và nó phải đứng TRƯỚC bảng số. Đọc sau khi đã quét hết mười cột thì đã
    // muộn — người ta đã tin vào những con số ấy rồi.
    expect(nguon.indexOf('canh-bao-lech')).toBeLessThan(nguon.indexOf('<h2>Dòng sản phẩm</h2>'));
  });
});

describe('0029 box ẩn hẳn khi không có gì', () => {
  it('danh sách rỗng thì KHÔNG vẽ khối nào', async () => {
    // Đây là màn hình mở mỗi sáng. Một khối rỗng lặp lại mỗi ngày là khối người
    // dùng ngừng nhìn, và đúng hôm nó có nội dung thì họ cũng không nhìn.
    chan([]);
    render(<YeuCauCapNhat />);
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector('.khoi')).toBeNull();
  });

  it('gọi API hỏng cũng KHÔNG vẽ gì — không doạ người dùng bằng lỗi hạ tầng', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('mạng hỏng'))));
    render(<YeuCauCapNhat />);
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector('.khoi')).toBeNull();
  });
});

describe('0029 box có mặt ở đúng bốn vai trò', () => {
  it('`0052` bốn vai trò trong luồng đều có, và nó đứng SAU hộp việc', () => {
    /*
     * ĐẢO NGƯỢC `0029`, và lý do đảo được nằm ở `0050`.
     *
     * Hồi `0029` box phải đứng TRƯỚC vì nó là chỗ duy nhất nói cho người sắp ký
     * biết con số đã lỗi thời. `0050` đưa cảnh báo ấy lên thẳng màn hình hồ sơ,
     * phía trên bảng số — không còn đường nào mở hồ sơ ra mà không thấy nó.
     *
     * Ràng buộc cũ mất, nên việc phải làm hôm nay lên trước. Nếu ai đó gỡ khối
     * cảnh báo ở `ChiTietHoSo` thì thứ tự này phải xét lại — ca kiểm thử
     * `0050` bên trên canh đúng chỗ ấy.
     */
    for (const vt of ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN'] as const) {
      const khoi = KHOI_THEO_VAI_TRO[vt];
      expect(khoi, `${vt} phải có box`).toContain('yeu-cau-cap-nhat');
      const hopViec = khoi.findIndex((k) => k.startsWith('hop-viec'));
      expect(hopViec, `${vt} phải có hộp việc`).toBeGreaterThanOrEqual(0);
      expect(hopViec).toBeLessThan(khoi.indexOf('yeu-cau-cap-nhat'));
    }
  });

  it('`0052` mỗi trang tối đa 5 hồ sơ, và box hỏi máy chủ đúng con số ấy', async () => {
    // Không phải cắt ở phía giao diện: hỏi 20 dòng rồi vẽ 5 là tải thừa gấp bốn
    // trên mỗi lần mở trang tổng quan, và số trang hiện ra cũng sai.
    expect(MOI_TRANG_TONG_QUAN).toBe(5);

    const f = vi.fn(() => Promise.resolve(phanHoi({ items: HO_SO, total: 12 })));
    vi.stubGlobal('fetch', f);
    render(<YeuCauCapNhat />);
    await doiKhoi();

    const duong = String((f.mock.calls[0] as unknown[])[0]);
    expect(duong).toContain('limit=5');
    expect(duong).toContain('offset=0');
  });

  it('Ban lãnh đạo và Quản trị KHÔNG có — cả hai nằm ngoài luồng duyệt', () => {
    for (const vt of ['BAN_LANH_DAO', 'QUAN_TRI'] as const) {
      expect(KHOI_THEO_VAI_TRO[vt]).not.toContain('yeu-cau-cap-nhat');
    }
  });
});
