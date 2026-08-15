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

const SAN_PHAM = { items: [{ id: 'sp-1', code: 'SP-01', name: 'Nutricare Gold' }] };

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
  it('rơi về mặc định sản phẩm → hiện cảnh báo vàng kèm con số sẽ dùng', async () => {
    chanFetch(() =>
      phanHoi(200, {
        productId: 'sp-1',
        productCode: 'SP-01',
        productName: 'Nutricare Gold',
        companyPrice: '100000',
        threshold: '15.00',
        thresholdSource: 'PRODUCT_DEFAULT',
      }),
    );
    moHopThoai();
    await chonSanPham();

    const canhBao = await waitFor(() => {
      const el = document.querySelector('.hop-canh-bao');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(canhBao.textContent).toContain('Chưa có quy định chiết khấu');
    // Con số PHẢI có mặt: "chưa có quy định" mà không nói sẽ dùng ngưỡng nào thì
    // người lập vẫn không quyết định được gì.
    expect(canhBao.textContent).toContain('15.00%');
    // Không phải khối lỗi — vẫn lập hồ sơ được.
    expect(document.querySelectorAll('.bao-loi')).toHaveLength(0);
  });

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

  it('sản phẩm không có ngưỡng nào → khối LỖI, vì lưu chắc chắn hỏng', async () => {
    chanFetch(() => phanHoi(404, { code: 'THRESHOLD_NOT_CONFIGURED' }));
    moHopThoai();
    await chonSanPham();

    const loi = await waitFor(() => {
      const el = document.querySelector('.bao-loi');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(loi.textContent).toContain('chưa có ngưỡng chiết khấu nào');
  });

  it('lỗi mạng lúc xem trước KHÔNG hiện gì', async () => {
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
    const f = chanFetch(() =>
      phanHoi(200, { threshold: '15.00', thresholdSource: 'PRODUCT_DEFAULT' }),
    );
    moHopThoai();
    await chonSanPham();

    await waitFor(() => {
      const duong = f.mock.calls.map((c) => String(c[0]));
      expect(duong.some((d) => d.includes('/policies/hs-9/threshold-preview?productId=sp-1')))
        .toBe(true);
    });
  });
});
