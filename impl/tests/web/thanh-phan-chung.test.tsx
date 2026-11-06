/**
 * @vitest-environment jsdom
 *
 * `0257` — thành phần dùng chung sau thiết kế lại: nút × ở đầu hộp thoại, ngăn
 * trượt cho biểu mẫu dài, và KHÔNG còn ký tự nào làm icon.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HopThoai } from '@csbh/web/chung';

afterEach(cleanup);

describe('`0257` hộp thoại có nút × ở đầu', () => {
  it('bấm × gọi đúng `dong`, nút nằm NGOÀI vùng cuộn', () => {
    const dong = vi.fn();
    const { container } = render(
      <HopThoai tieuDe="Tạo người dùng" dong={dong}>
        <input aria-label="Họ tên" />
      </HopThoai>,
    );
    const nut = screen.getByRole('button', { name: 'Đóng hộp thoại' });
    expect(container.querySelector('.hop-thoai-than')!.contains(nut)).toBe(false);
    fireEvent.click(nut);
    expect(dong).toHaveBeenCalledTimes(1);
  });

  it('mở biểu mẫu thì tiêu điểm vào Ô NHẬP đầu, không vào nút ×; nút × ngoài vòng Tab', () => {
    render(
      <HopThoai tieuDe="Tạo người dùng" dong={() => {}}>
        <input aria-label="Họ tên" />
      </HopThoai>,
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Họ tên');
    expect(screen.getByRole('button', { name: 'Đóng hộp thoại' }).getAttribute('tabindex')).toBe('-1');
  });

  it('trình xem tệp (`tyLe`) KHÔNG có nút × — nó có dải nút riêng', () => {
    render(
      <HopThoai tieuDe="Bản mềm" dong={() => {}} tyLe={0.7}>
        <p>tài liệu</p>
      </HopThoai>,
    );
    expect(screen.queryByRole('button', { name: 'Đóng hộp thoại' })).toBeNull();
  });
});

describe('`0257` ngăn trượt (`ngan`) cho biểu mẫu dài', () => {
  it('lớp và luật Escape giữ nguyên như hộp thoại thường', () => {
    const dong = vi.fn();
    const { container } = render(
      <HopThoai tieuDe="Lập khách hàng" dong={dong} ngan>
        <input aria-label="Mã khách hàng" />
      </HopThoai>,
    );
    expect(container.querySelector('.lop-phu.lop-phu-ngan > .hop-thoai.hop-thoai-ngan')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dong).toHaveBeenCalled();
  });

  it('đúng ba biểu mẫu dài dùng ngăn trượt: lập/sửa khách hàng, thêm/sửa dòng sản phẩm, sửa sản phẩm', () => {
    const doc = (p: string) => readFileSync(`apps/web/src/components/${p}`, 'utf8');
    expect(doc('SuaKhachHang.tsx')).toMatch(/'Lập khách hàng'\} dong=\{dong\} ngan>/);
    expect(doc('SuaHoSo.tsx')).toMatch(/'Thêm sản phẩm'\}\s*dong=\{dong\}\s*ngan\s*>/);
    expect(doc('danh-muc/SanPham.tsx')).toMatch(/`Sửa \$\{sp\.code\}`\} dong=\{dong\} ngan>/);
  });
});

describe('`0257` không còn KÝ TỰ nào làm icon', () => {
  it('🗓 ✎ ✓ ✕ không xuất hiện trong JSX của giao diện (chú thích thì được)', () => {
    const tep: string[] = [];
    const duyet = (d: string) => {
      for (const f of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, f.name);
        if (f.isDirectory()) duyet(p);
        else if (p.endsWith('.tsx')) tep.push(p);
      }
    };
    duyet('apps/web/src');
    const sai = tep.filter((p) => /aria-hidden="true">\s*[🗓✎✓✕]/u.test(readFileSync(p, 'utf8')));
    expect(sai).toEqual([]);
  });
});
