/**
 * @vitest-environment jsdom
 *
 * `0056` — trang **Thêm mẫu**: hướng dẫn nằm ngay cạnh biểu mẫu.
 *
 * Ca đáng giá nhất tệp này là phép ĐỐI CHIẾU HAI PHÍA ở cuối: bảng hướng dẫn
 * phải liệt kê đúng những khoá máy chủ nhận. Thiếu một khoá thì người soạn mẫu
 * không biết nó tồn tại; thừa một khoá thì họ gõ vào file, ánh xạ không được, và
 * thông báo lỗi nói "không có trường nguồn" về đúng thứ phần mềm vừa mời họ dùng.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KHOA_HUONG_DAN, ThemMau } from '@csbh/web/them-mau';
import { NHAN_KHOA } from '@csbh/web/mau-hop-dong';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bay = (loai: 'HO_SO' | 'HOP_DONG' = 'HO_SO') =>
  render(<ThemMau loai={loai} quayLai={() => undefined} xong={() => undefined} />);

describe('`0056` hướng dẫn hiện ngay trên trang', () => {
  it('`0058` mẫu hồ sơ: KHÔNG hỏi khổ giấy nữa, và nói rõ luật bảng sản phẩm', () => {
    bay('HO_SO');
    /*
     * Ô "Khổ giấy" đã bỏ: nó từng là khoá tra mẫu, giờ khổ giấy đọc từ chính
     * file. Một ô nhập tay không còn hậu quả gì là một ô sẽ nói dối — Quản trị
     * tải file ngang lên rồi chọn nhầm "A4 dọc" và không gì phát hiện ra.
     */
    expect(screen.queryByLabelText(/Khổ giấy/)).toBeNull();
    expect(document.body.textContent).toContain('Khổ giấy lấy từ chính file');
    expect(document.body.textContent).toContain('{{bang_san_pham}}');
    expect(document.body.textContent).toContain('đừng vẽ bảng bằng tay');
    // Cột của bảng nói ra ngay tại đây — người soạn mẫu cần biết bảng sẽ trông
    // thế nào để chừa chỗ cho nó.
    expect(document.body.textContent).toContain('CPBH tổng');
  });

  it('mẫu hợp đồng: KHÔNG có luật bảng sản phẩm', () => {
    // Bảng của hợp đồng do người soạn vẽ tay bằng nhóm khoá `san_pham.` — bốn
    // cột chữ ngắn, không có luật nào đổi theo hồ sơ.
    bay('HOP_DONG');
    expect(screen.queryByLabelText(/Khổ giấy/)).toBeNull();
    expect(document.body.textContent).not.toContain('{{bang_san_pham}}');
  });

  it('nhóm "Dòng sản phẩm" CHỈ hiện ở mẫu hợp đồng', () => {
    /*
     * Mẫu hồ sơ dùng `{{bang_san_pham}}`; bày nhóm `san_pham.` ra ở đó là mời
     * người soạn vẽ một bảng tay có số cột cố định — đúng thứ mà cả cơ chế bảng
     * do hệ thống dựng sinh ra để tránh.
     */
    bay('HO_SO');
    expect(document.body.textContent).not.toContain('{{san_pham.ma_san_pham}}');
    cleanup();
    bay('HOP_DONG');
    expect(document.body.textContent).toContain('{{san_pham.ma_san_pham}}');
  });

  it('mỗi khoá là một NÚT bấm được, không phải chữ trơ', () => {
    /*
     * `fireEvent` chứ không `userEvent`: `userEvent.setup()` tự cài một
     * clipboard giả của riêng nó lên `navigator`, và nó đè mất bản giả ở đây —
     * ca kiểm thử xanh hay đỏ tuỳ thứ tự hai thứ chạm vào `navigator`.
     */
    const chep = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText: chep } });
    bay('HO_SO');

    fireEvent.click(screen.getByRole('button', { name: /ho_so\.ten_khach_hang/ }));
    expect(chep).toHaveBeenCalledWith('{{ho_so.ten_khach_hang}}');
  });

  it('không có clipboard thì KHÔNG nổ — khoá vẫn đọc và bôi đen được', () => {
    // Trình duyệt cũ và ngữ cảnh http không có `navigator.clipboard`. Chép là
    // tiện ích, không phải đường duy nhất.
    vi.stubGlobal('navigator', {});
    bay('HO_SO');
    fireEvent.click(screen.getByRole('button', { name: /ho_so\.ma_ho_so/ }));
    expect(document.body.textContent).toContain('{{ho_so.ma_ho_so}}');
  });

  it('khối chữ ký số của TBP có trong danh sách, kèm lời giải thích hai dòng', () => {
    bay('HO_SO');
    expect(document.body.textContent).toContain('{{ho_so.chu_ky_so_TBP}}');
    expect(document.body.textContent).toContain('TBP đã ký số');
  });

  it('có nút quay lại danh sách, và nó nằm cùng hàng với tiêu đề', () => {
    bay('HO_SO');
    const nut = screen.getByRole('button', { name: 'Quay lại danh sách' });
    expect(nut.closest('.nhom-nut-dau')).not.toBeNull();
  });
});

describe('`0056` bảng khoá khớp đúng máy chủ', () => {
  /** `KNOWN_SOURCES` của máy chủ, đọc thẳng từ mã nguồn. */
  const nguonMayChu = (): string[] => {
    const ma = readFileSync('services/document/src/contracts/sources.ts', 'utf8');
    const scalar = [...ma.matchAll(/^ {2}'?([a-zA-Z0-9_.]+)'?:\s*\(/gm)].map((m) => m[1]!);
    const line = [...ma.matchAll(/^ {2}([a-z_]+):\s*\((?:_?l|_l)/gm)].map((m) => `san_pham.${m[1]!}`);
    return [...new Set([...scalar.filter((s) => s.includes('.') || s === 'ngay_in'), ...line])];
  };

  it('không khoá nào của máy chủ vắng mặt trên hướng dẫn', () => {
    const thieu = nguonMayChu().filter((s) => !KHOA_HUONG_DAN.includes(s));
    expect(thieu, `hướng dẫn thiếu khoá: ${thieu.join(', ')}`).toEqual([]);
  });

  it('không khoá nào trên hướng dẫn là khoá máy chủ không nhận', () => {
    const may = nguonMayChu();
    const thua = KHOA_HUONG_DAN.filter((k) => !may.includes(k));
    expect(thua, `hướng dẫn nêu khoá lạ: ${thua.join(', ')}`).toEqual([]);
  });

  it('khoá nào cũng có nhãn tiếng Việt, không bày mã trần cho người đọc', () => {
    for (const k of KHOA_HUONG_DAN) {
      expect(NHAN_KHOA[k], `thiếu nhãn cho ${k}`).toBeDefined();
    }
  });
});
