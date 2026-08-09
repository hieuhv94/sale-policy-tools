/**
 * FE-23 · FE-24 · FE-25 — ai thấy nút gì.
 *
 * Quét BẢNG QUYỀN chứ không mở từng màn hình bằng tay, đúng như `FE-23` yêu
 * cầu. Điều đó chỉ có nghĩa khi bảng quyền là nguồn duy nhất — nên có thêm một
 * test quét mã nguồn tìm chỗ so sánh vai trò viết thẳng.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUYEN_GHI, VAI_TRO, can, dieuHuongCho, xem } from '@csbh/web/can';

const GOC = 'apps/web/src';

function moiTep(thuMuc: string, duoi: string[]): string[] {
  const ra: string[] = [];
  for (const t of readdirSync(thuMuc)) {
    const d = join(thuMuc, t);
    if (statSync(d).isDirectory()) ra.push(...moiTep(d, duoi));
    else if (duoi.some((x) => d.endsWith(x))) ra.push(d);
  }
  return ra;
}

describe('FE-23 Ban lãnh đạo chỉ đọc', () => {
  it('không có MỘT quyền ghi nào trong toàn bộ bảng quyền', () => {
    for (const [ten, vaiTro] of Object.entries(QUYEN_GHI)) {
      expect(vaiTro as readonly string[], `BAN_LANH_DAO không được có quyền ${ten}`).not.toContain(
        'BAN_LANH_DAO',
      );
    }
  });

  it('`can()` trả false ở mọi quyền', () => {
    for (const q of Object.keys(QUYEN_GHI)) {
      expect(can('BAN_LANH_DAO', q as keyof typeof QUYEN_GHI)).toBe(false);
    }
  });

  it('vẫn đọc được hồ sơ, khách hàng, báo cáo và nhật ký', () => {
    for (const m of ['hoSo', 'khachHang', 'baoCao', 'nhatKy'] as const) {
      expect(xem('BAN_LANH_DAO', m), `phải xem được ${m}`).toBe(true);
    }
  });
});

describe('FE-24 nút xuất hợp đồng', () => {
  it('chỉ Kế toán và Sale Admin thấy', () => {
    expect(can('KE_TOAN', 'xuatHopDong')).toBe(true);
    expect(can('SALE_ADMIN', 'xuatHopDong')).toBe(true);
    // Trưởng bộ phận KHÔNG thấy — YCNV ghi sai chỗ này, bản hợp nhất muc 8.3 sửa.
    for (const v of ['TBP', 'TDV', 'BAN_LANH_DAO', 'QUAN_TRI']) {
      expect(can(v, 'xuatHopDong'), `${v} không được thấy nút xuất hợp đồng`).toBe(false);
    }
  });
});

describe('FE-25 điều hướng của Quản trị hệ thống', () => {
  it('không có quyền duyệt, ký số hay tiếp nhận', () => {
    for (const q of ['kySo', 'tiepNhanL1', 'tiepNhanL2', 'banGiao', 'guiDuyet'] as const) {
      expect(can('QUAN_TRI', q), `QUAN_TRI không được có quyền ${q}`).toBe(false);
    }
  });

  it('mục điều hướng không chứa màn hình nào của luồng duyệt', () => {
    const nhan = dieuHuongCho('QUAN_TRI').map((m) => m.nhan.toLowerCase());
    for (const cam of ['duyệt', 'ký số', 'tiếp nhận', 'bàn giao']) {
      expect(nhan.some((n) => n.includes(cam)), `menu không được có mục "${cam}"`).toBe(false);
    }
  });
});

describe('Bảng quyền là nguồn DUY NHẤT', () => {
  it('không màn hình nào so sánh vai trò bằng chuỗi viết thẳng', () => {
    // `role === 'TBP'` rải trong màn hình là cách chắc chắn để có ngày một chỗ
    // sót, và `FE-23` quét bảng quyền chứ không quét màn hình — nên chỗ sót đó
    // sẽ không ai thấy.
    const viPham: string[] = [];
    for (const tep of moiTep(GOC, ['.ts', '.tsx'])) {
      if (tep.endsWith('can.ts')) continue;
      const noiDung = readFileSync(tep, 'utf8');
      for (const [i, dong] of noiDung.split('\n').entries()) {
        // Bỏ qua chú thích — chúng nêu tên vai trò để giải thích, không để kiểm.
        const s = dong.trim();
        if (s.startsWith('*') || s.startsWith('//')) continue;
        if (/===\s*['"](TDV|TBP|KE_TOAN|SALE_ADMIN|BAN_LANH_DAO|QUAN_TRI)['"]/.test(dong)) {
          viPham.push(`${tep}:${i + 1}`);
        }
      }
    }
    // `ViecCuaToi` được phép: nó đổi CHỮ hướng dẫn theo vai trò, không đổi quyền.
    expect(viPham.filter((v) => !v.includes('ViecCuaToi'))).toEqual([]);
  });

  it('mọi vai trò trong bảng đều là một trong sáu vai trò đã khai', () => {
    for (const vaiTro of Object.values(QUYEN_GHI)) {
      for (const v of vaiTro as readonly string[]) {
        expect(VAI_TRO as readonly string[]).toContain(v);
      }
    }
  });
});
