/**
 * Trang tổng quan — quét HAI BẢNG TRA, không mở từng màn hình.
 *
 * Cái sai cần bắt ở đây không phải một hàm trả sai giá trị, mà là **một ô vắng
 * mặt**: thiếu một vai trò trong bảng, hoặc bày cho một vai trò con số thuộc
 * việc của người khác. Không lỗi nào trong hai lỗi đó làm màn hình đỏ lên —
 * chúng chỉ làm màn hình sai một cách im lặng, và chỉ phát hiện được bằng cách
 * đăng nhập lần lượt sáu tài khoản mà nhìn.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VAI_TRO, type VaiTro } from '@csbh/web/can';
import { NHAN_TRANG_THAI } from '@csbh/web/format';
import {
  BAN_CUA,
  CO_THE_DANG_CHO,
  DANG_CHO,
  KHOI_CO_NUT_GHI,
  KHOI_THEO_VAI_TRO,
  LY_DO_KHONG_CO_VIEC,
  MOI_TRANG_THAI,
  THE_TRANG_THAI,
} from '@csbh/web/tong-quan';

describe('hai bảng tra phủ đủ sáu vai trò', () => {
  it('không vai trò nào thiếu khoá trong `THE_TRANG_THAI`', () => {
    for (const v of VAI_TRO) {
      expect(THE_TRANG_THAI[v], `thiếu ${v}`).toBeDefined();
    }
    expect(Object.keys(THE_TRANG_THAI).sort()).toEqual([...VAI_TRO].sort());
  });

  it('không vai trò nào thiếu khoá trong `KHOI_THEO_VAI_TRO`', () => {
    for (const v of VAI_TRO) {
      expect(KHOI_THEO_VAI_TRO[v], `thiếu ${v}`).toBeDefined();
    }
    expect(Object.keys(KHOI_THEO_VAI_TRO).sort()).toEqual([...VAI_TRO].sort());
  });

  it('mọi vai trò đều có ít nhất một thứ để nhìn', () => {
    // Đây chính là lỗi đang sửa: trước P10, Ban lãnh đạo và Quản trị đăng nhập
    // vào một trang TRẮNG vì `/policies/inbox` trả rỗng cho họ theo thiết kế.
    for (const v of VAI_TRO) {
      const co = THE_TRANG_THAI[v].length + KHOI_THEO_VAI_TRO[v].length;
      expect(co, `vai trò ${v} không có khối nào — sẽ ra trang trắng`).toBeGreaterThan(0);
    }
  });
});

describe('mã trạng thái phải có thật', () => {
  it('`MOI_TRANG_THAI` đúng bằng 11 trạng thái của muc 4', () => {
    expect([...MOI_TRANG_THAI].sort()).toEqual(Object.keys(NHAN_TRANG_THAI).sort());
  });

  it('mọi thẻ đều trỏ tới một trạng thái có nhãn', () => {
    // Gõ sai một mã thì thẻ hiện số 0 vĩnh viễn và nhãn hiện ra chính cái mã gõ
    // sai — không có lỗi nào, chỉ có một ô luôn bằng không.
    for (const v of VAI_TRO) {
      for (const t of THE_TRANG_THAI[v]) {
        expect(NHAN_TRANG_THAI[t], `${v}: trạng thái lạ "${t}"`).toBeDefined();
      }
    }
  });

  it('`DANG_CHO` và `BAN_CUA` cũng chỉ dùng trạng thái có thật', () => {
    for (const t of DANG_CHO) expect(NHAN_TRANG_THAI[t]).toBeDefined();
    expect(Object.keys(BAN_CUA).sort()).toEqual(Object.keys(NHAN_TRANG_THAI).sort());
  });

  it('không thẻ nào lặp lại trong cùng một vai trò', () => {
    for (const v of VAI_TRO) {
      expect(new Set(THE_TRANG_THAI[v]).size, `${v} có thẻ trùng`).toBe(
        THE_TRANG_THAI[v].length,
      );
    }
  });
});

describe('thẻ trạng thái chỉ nói việc của CHÍNH vai trò đó', () => {
  /**
   * Khẳng định chính của đợt này.
   *
   * Một TDV nhìn ô "Chờ Kế toán L2: 7" thì không làm được gì với con số ấy, mà
   * nó vẫn chiếm chỗ và vẫn bắt phải đọc. `BAN_CUA` được khai RIÊNG chứ không
   * suy ra từ `THE_TRANG_THAI` — suy ngược thì test chỉ đang lặp lại chính dữ
   * liệu nó cần kiểm.
   */
  const TRU: VaiTro[] = ['BAN_LANH_DAO'];

  it('không vai trò nào bày bước của vai trò khác', () => {
    const viPham: string[] = [];
    for (const v of VAI_TRO) {
      if (TRU.includes(v)) continue;
      for (const t of THE_TRANG_THAI[v]) {
        const chu = BAN_CUA[t];
        // `null` là trạng thái kết thúc hoặc cắt ngang (hiệu lực, hết hiệu lực,
        // từ chối, quá hạn) — ai xem cũng có nghĩa.
        if (chu !== null && chu !== v) viPham.push(`${v} có thẻ "${t}" vốn là việc của ${chu}`);
      }
    }
    expect(viPham, viPham.join('\n')).toEqual([]);
  });

  it('Ban lãnh đạo thì ngược lại — thấy đủ cả 11', () => {
    expect([...THE_TRANG_THAI.BAN_LANH_DAO].sort()).toEqual([...MOI_TRANG_THAI].sort());
  });

  it('Quản trị hệ thống KHÔNG có thẻ hồ sơ nào', () => {
    // `idn.scope_user_ids` trả rỗng cho vai trò này (0003_identity.sql), nên mọi
    // lời gọi /reports/* ra 0. Một ô "Tổng hồ sơ: 0" là con số đúng nhưng đọc ra
    // nghĩa hoàn toàn sai — người xem tưởng hệ thống trống.
    expect(THE_TRANG_THAI.QUAN_TRI).toEqual([]);
  });

  it('mỗi vai trò trong luồng có ít nhất một thẻ là việc của chính mình', () => {
    for (const v of VAI_TRO) {
      if (TRU.includes(v) || THE_TRANG_THAI[v].length === 0) continue;
      const cuaMinh = THE_TRANG_THAI[v].filter((t) => BAN_CUA[t] === v);
      expect(cuaMinh.length, `${v} chỉ có thẻ kết thúc, không có việc nào của mình`).toBeGreaterThan(
        0,
      );
    }
  });
});

describe('FE-23 Ban lãnh đạo chỉ đọc', () => {
  it('không có khối nào chứa nút ghi', () => {
    for (const k of KHOI_THEO_VAI_TRO.BAN_LANH_DAO) {
      expect(KHOI_CO_NUT_GHI, `Ban lãnh đạo không được có khối "${k}"`).not.toContain(k);
    }
  });

  it('thẻ gộp "Đang chờ duyệt" không dành cho vai trò chỉ đọc', () => {
    expect(CO_THE_DANG_CHO).not.toContain('BAN_LANH_DAO');
    expect(CO_THE_DANG_CHO).not.toContain('QUAN_TRI');
  });
});

describe('khối và câu giải thích khớp nhau', () => {
  it('vai trò nào có khối giải thích thì phải có câu để hiện', () => {
    for (const v of VAI_TRO) {
      const can = KHOI_THEO_VAI_TRO[v].includes('vi-sao-khong-co-viec');
      const co = (LY_DO_KHONG_CO_VIEC[v] ?? '').trim().length > 0;
      // Thiếu câu thì khối vẫn dựng, chỉ là một dải màu RỖNG — trông còn khó
      // hiểu hơn là không có khối nào.
      expect(co, `${v}: khối giải thích ${can ? 'có' : 'không'} mà câu thì ${co ? 'có' : 'không'}`)
        .toBe(can);
    }
  });

  it('vai trò có khối giải thích thì KHÔNG có hộp việc', () => {
    for (const v of VAI_TRO) {
      if (!KHOI_THEO_VAI_TRO[v].includes('vi-sao-khong-co-viec')) continue;
      const coViec = KHOI_THEO_VAI_TRO[v].some((k) => k.startsWith('hop-viec'));
      expect(coViec, `${v} vừa nói không có việc vừa hiện hộp việc`).toBe(false);
    }
  });

  it('mọi tên khối đều được màn hình dựng thật', () => {
    // `TenKhoi` là kiểu chuỗi, nên thêm một tên vào bảng mà quên thêm nhánh
    // `case` thì TypeScript báo — nhưng chỉ khi `switch` còn đủ tính vét cạn.
    // Quét mã nguồn là chốt thứ hai, không phụ thuộc vào điều đó.
    const nguon = readFileSync('apps/web/src/pages/TongQuan.tsx', 'utf8');
    const moiKhoi = new Set(Object.values(KHOI_THEO_VAI_TRO).flat());
    for (const k of moiKhoi) {
      expect(nguon, `màn hình không dựng khối "${k}"`).toContain(`case '${k}'`);
    }
  });
});
