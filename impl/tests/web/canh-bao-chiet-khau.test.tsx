/**
 * @vitest-environment jsdom
 *
 * 0022 — cảnh báo "chưa có quy định chiết khấu" LÚC ĐANG LẬP, không phải sau khi lưu.
 *
 * Ngưỡng đóng băng vào dòng hồ sơ ngay khi bấm Lưu. Biết sau thì phải xoá dòng,
 * đi nhờ Quản trị khai quy định, rồi nhập lại từ đầu; biết trước thì người lập
 * chọn được — vẫn lập với ngưỡng mặc định, hay dừng lại hỏi.
 *
 * Test dựng đúng cây DOM thật của hộp thoại và chặn ở tầng `fetch`, vì thứ cần
 * chứng minh nằm ở chỗ nối: chọn sản phẩm → gọi đúng đường xem trước → đọc đúng
 * trường trong câu trả lời → hiện đúng khối cảnh báo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemDongSanPham } from '@csbh/web/sua-ho-so-ui';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const phanHoi = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const SAN_PHAM = {
  items: [{ id: 'sp-1', code: 'SP-01', name: 'Nutricare Gold', price: '125000' }],
};

/**
 * Chặn `fetch` và định tuyến theo đường dẫn.
 *
 * Trả về chính hàm giả để test khẳng định được ĐƯỜNG NÀO đã bị gọi — "hiện đúng
 * chữ" mà gọi nhầm đường thì trên máy thật sẽ hiện cảnh báo của một hồ sơ khác.
 */
const chanFetch = (xemTruoc: () => Response) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/threshold-preview')) return Promise.resolve(xemTruoc());
    if (d.includes('/catalog/products')) return Promise.resolve(phanHoi(200, SAN_PHAM));
    return Promise.resolve(phanHoi(200, {}));
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const moHopThoai = () =>
  render(<ThemDongSanPham hoSoId="hs-9" dong={() => undefined} xong={() => undefined} />);

const chonSanPham = async () => {
  const nguoi = userEvent.setup();
  await waitFor(() => expect(screen.getByRole('option', { name: /Nutricare Gold/ })).toBeDefined());
  await nguoi.selectOptions(screen.getByRole('combobox'), 'sp-1');
};

describe('0022 hộp thoại thêm dòng cảnh báo trước khi lưu', () => {
  it('có quy định khớp → KHÔNG cảnh báo gì', async () => {
    chanFetch(() =>
      phanHoi(200, {
        productId: 'sp-1',
        productCode: 'SP-01',
        productName: 'Nutricare Gold',
        companyPrice: '100000',
        threshold: '25.00',
        thresholdSource: 'RULE',
      }),
    );
    moHopThoai();
    await chonSanPham();

    // Chờ lời gọi xem trước xong hẳn rồi mới khẳng định "không có gì" — khẳng
    // định ngay lập tức thì test xanh cả khi cảnh báo hiện ra một nhịp sau đó.
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('value', 'sp-1'));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.hop-canh-bao')).toBeNull();
  });

  it('sản phẩm không có ngưỡng nào → vẫn cảnh báo VÀNG, vì vẫn thêm được', async () => {
    // Trước `0023` chỗ này là khối ĐỎ và máy chủ từ chối thêm dòng. Ngưỡng chỉ
    // để cảnh báo — vượt ngưỡng còn không chặn gửi duyệt — nên thiếu ngưỡng
    // không thể là lý do chặn, nhất là khi người lập không có quyền tự khai.
    chanFetch(() =>
      phanHoi(200, {
        productId: 'sp-1',
        productCode: 'SP-01',
        productName: 'Nutricare Gold',
        companyPrice: '100000',
        threshold: null,
        thresholdSource: 'KHONG_CO',
      }),
    );
    moHopThoai();
    await chonSanPham();

    const canhBao = await waitFor(() => {
      const el = document.querySelector('.hop-canh-bao');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(canhBao.textContent).toContain('không có ngưỡng nào để đối chiếu');
    expect(canhBao.textContent).toContain('Vẫn lập hồ sơ được');
    // Không phải khối lỗi, và nút Thêm dòng không bị khoá vì chuyện này.
    expect(document.querySelectorAll('.bao-loi')).toHaveLength(0);
  });

  it('KHONG_CO không hiện con số ngưỡng — không có con số nào để hiện', async () => {
    chanFetch(() =>
      phanHoi(200, { productId: 'sp-1', threshold: null, thresholdSource: 'KHONG_CO' }),
    );
    moHopThoai();
    await chonSanPham();

    const canhBao = await waitFor(() => {
      const el = document.querySelector('.hop-canh-bao');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(canhBao.textContent).not.toContain('null');
    expect(canhBao.textContent).not.toContain('%');
  });

  it('lỗi lúc xem trước KHÔNG hiện gì', async () => {
    // Đây là thông tin thêm, không phải điều kiện để lưu. Một khối đỏ cạnh biểu
    // mẫu đang gõ dở chỉ làm người dùng tưởng mình vừa làm hỏng thứ gì, trong
    // khi máy chủ vẫn tra lại ngưỡng lúc lưu.
    const f = vi.fn((duong: unknown) => {
      const d = String(duong);
      if (d.includes('/threshold-preview')) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(phanHoi(200, SAN_PHAM));
    });
    vi.stubGlobal('fetch', f);
    moHopThoai();
    await chonSanPham();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('.hop-canh-bao')).toBeNull();
    expect(document.querySelector('.bao-loi')).toBeNull();
  });

  it('gọi đúng hồ sơ và đúng sản phẩm', async () => {
    const f = chanFetch(() => phanHoi(200, { threshold: null, thresholdSource: 'KHONG_CO' }));
    moHopThoai();
    await chonSanPham();

    await waitFor(() => {
      const duong = f.mock.calls.map((c) => String(c[0]));
      expect(duong.some((d) => d.includes('/policies/hs-9/threshold-preview?productId=sp-1')))
        .toBe(true);
    });
  });
});


/**
 * `0124` — GIÁ BÁN CÔNG TY hiện ngay trên ô Giá bán buôn.
 *
 * Tỷ lệ chiết khấu tính ngược từ con số ấy (`1 − giá thu về / giá bán Công ty`),
 * nên gõ giá bán buôn mà không thấy nó là gõ một nửa của một phép tính. Tới
 * `0123` người lập phải mở màn hình Danh mục ở một tab khác để tra.
 */
describe('`0124` giá bán Công ty trong hộp thoại thêm dòng', () => {
  it('chưa chọn sản phẩm thì KHÔNG hiện con số nào', async () => {
    chanFetch(() => phanHoi(200, {}));
    moHopThoai();
    await waitFor(() => expect(screen.getByRole('option', { name: /Nutricare Gold/ })).toBeDefined());
    expect(screen.queryByText(/Giá bán Công ty của sản phẩm này/)).toBeNull();
  });

  it('chọn sản phẩm thì hiện đúng giá của DANH MỤC', async () => {
    chanFetch(() =>
      phanHoi(200, { productCode: 'SP-01', threshold: '1500', thresholdSource: 'RULE' }),
    );
    moHopThoai();
    await chonSanPham();
    await waitFor(() =>
      expect(screen.getByText(/Giá bán Công ty của sản phẩm này/)).toBeDefined(),
    );
    // Định dạng tiền của sản phẩm, không phải chuỗi thô `125000`.
    expect(screen.getByText(/125[.,]000/)).toBeDefined();
  });

  it('đứng TRƯỚC ô Giá bán buôn, không nằm dưới đáy biểu mẫu', async () => {
    /*
     * Vị trí là một phần của yêu cầu: đọc con số ấy SAU khi đã gõ xong giá bán
     * buôn thì quá muộn để nó có ích. `compareDocumentPosition` là cách duy nhất
     * đo được thứ tự trong jsdom — nó không tính bố cục.
     */
    chanFetch(() =>
      phanHoi(200, { productCode: 'SP-01', threshold: '1500', thresholdSource: 'RULE' }),
    );
    moHopThoai();
    await chonSanPham();
    const cau = await screen.findByText(/Giá bán Công ty của sản phẩm này/);
    const o = screen.getByLabelText(/Giá bán buôn/);
    expect(cau.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
