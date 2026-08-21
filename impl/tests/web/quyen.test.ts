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
import {
  HANH_DONG_NHAN,
  QUYEN_GHI,
  QUYEN_HANH_DONG,
  VAI_TRO,
  can,
  canHanhDong,
  dieuHuongCho,
  xem,
} from '@csbh/web/can';
import { ACTIONS, STATUSES, allowedActions, allowedActionsFor } from '@csbh/domain-policy';

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

  it('vẫn đọc được hồ sơ, khách hàng và báo cáo', () => {
    for (const m of ['hoSo', 'khachHang', 'baoCao'] as const) {
      expect(xem('BAN_LANH_DAO', m), `phải xem được ${m}`).toBe(true);
    }
  });

  it('`0086` KHÔNG đọc nhật ký hệ thống', () => {
    /*
     * "Chỉ đọc" không có nghĩa là "đọc được mọi thứ". Nhật ký ghi IP,
     * `trace_id` và giá trị trước/sau của từng lần sửa — vết kiểm soát của
     * Quản trị, không phải dữ liệu điều hành. Chuyện hồ sơ đã đi qua tay ai thì
     * *Lịch sử hồ sơ* kể, và Ban lãnh đạo vẫn đọc được nó.
     */
    expect(xem('BAN_LANH_DAO', 'nhatKy')).toBe(false);
    expect(xem('QUAN_TRI', 'nhatKy')).toBe(true);
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

// =============================================================================
// `0038` — dải nút *Thao tác* chỉ hiện việc vai trò ấy làm được
// =============================================================================

describe('`0038` không bày nút bấm vào là 403', () => {
  /*
   * Lỗi đang bịt: `/allowed-actions` từng trả về mọi hành động của TRẠNG THÁI,
   * không xét ai hỏi, và màn hình đem thẳng ra vẽ nút. Trình dược viên mở hồ sơ
   * của chính mình đang *Chờ TBP duyệt* thấy đủ "Ký số duyệt", "Trả lại chỉnh
   * sửa", "Từ chối hồ sơ" — bấm cái nào cũng 403 `FORBIDDEN_ROLE`.
   */
  it('BẢNG QUYỀN của giao diện khớp đúng máy trạng thái, ở mọi cặp trạng thái × vai trò', () => {
    // Đây là ca giữ cho bảng ở `can.ts` không trôi khỏi `RULES`. Không có nó thì
    // bảng kia là bản sao thứ hai, và lệch về phía "thừa" là quay lại đúng lỗi
    // vừa sửa.
    const lech: string[] = [];
    for (const s of STATUSES) {
      for (const v of VAI_TRO) {
        const mayChu = new Set(allowedActionsFor(s, v));
        const giaoDien = new Set(allowedActions(s).filter((a) => canHanhDong(v, a)));
        const chung = [...new Set([...mayChu, ...giaoDien])];
        for (const a of chung) {
          if (mayChu.has(a) !== giaoDien.has(a)) {
            lech.push(
              `${s} × ${v} · ${a}: máy chủ ${mayChu.has(a) ? 'cho' : 'cấm'}, ` +
                `giao diện ${giaoDien.has(a) ? 'cho' : 'cấm'}`,
            );
          }
        }
      }
    }
    expect(lech, `hai bảng lệch nhau:\n${lech.join('\n')}`).toEqual([]);
  });

  it('hành động của HỆ THỐNG không vai trò nào bấm được', () => {
    // `SUPERSEDE` tự chạy khi bản mới có hiệu lực. Trước `0038` nó hiện thành
    // nút, và vì không có nhãn tiếng Việt nên hiện nguyên mã viết hoa.
    // (`PUBLISH_SIGNED` từng đứng cùng nhóm, đã gỡ ở `0064`.)
    for (const a of ['SUPERSEDE']) {
      for (const v of VAI_TRO) {
        expect(canHanhDong(v, a), `${v} không được bấm ${a}`).toBe(false);
      }
    }
  });

  it('Ban lãnh đạo không bấm được hành động nào, ở bất kỳ trạng thái nào', () => {
    for (const s of STATUSES) {
      for (const a of allowedActions(s)) {
        expect(canHanhDong('BAN_LANH_DAO', a), `${s} · ${a}`).toBe(false);
      }
    }
  });

  it('Quản trị hệ thống cũng vậy — họ đứng ngoài luồng duyệt', () => {
    for (const s of STATUSES) {
      for (const a of allowedActions(s)) {
        expect(canHanhDong('QUAN_TRI', a), `${s} · ${a}`).toBe(false);
      }
    }
  });

  it('bốn vai trò trong luồng vẫn bấm được đúng việc của mình', () => {
    // Vế NGƯỢC LẠI của ba ca trên: lọc quá tay thì người ta không làm được việc,
    // và đó là lỗi im lặng hơn nhiều so với một nút trả 403.
    expect(canHanhDong('TDV', 'SUBMIT')).toBe(true);
    expect(canHanhDong('TDV', 'RESUBMIT_AFTER_EDIT')).toBe(true);
    expect(canHanhDong('TBP', 'TBP_SIGN')).toBe(true);
    expect(canHanhDong('TBP', 'TBP_RETURN')).toBe(true);
    expect(canHanhDong('TBP', 'TBP_REJECT')).toBe(true);
    expect(canHanhDong('KE_TOAN', 'KT_RECEIVE_L1')).toBe(true);
    expect(canHanhDong('KE_TOAN', 'KT_RECEIVE_L2')).toBe(true);
    expect(canHanhDong('KE_TOAN', 'KT_RETURN_L1')).toBe(true);
    expect(canHanhDong('KE_TOAN', 'KT_RETURN_L2')).toBe(true);
    expect(canHanhDong('KE_TOAN', 'KT_REQUEST_REPRINT')).toBe(true);
    expect(canHanhDong('SALE_ADMIN', 'SA_HANDOVER')).toBe(true);
  });

  it('mọi hành động có nút đều có CẢ nhãn lẫn quyền', () => {
    // Thiếu nhãn thì nút hiện mã viết hoa; thiếu quyền thì nút biến mất với mọi
    // vai trò. Cả hai đều lặng lẽ.
    for (const a of ACTIONS) {
      const cuaHeThong = a === 'SUPERSEDE';
      expect(QUYEN_HANH_DONG[a] !== undefined, `${a} thiếu quyền`).toBe(!cuaHeThong);
      expect(HANH_DONG_NHAN[a] !== undefined, `${a} thiếu nhãn`).toBe(!cuaHeThong);
    }
  });
});
