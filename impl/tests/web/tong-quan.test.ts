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
  BUOC_CUA,
  BUOC_THAT,
  duongThe,
  KHOI_CO_NUT_GHI,
  KHOI_THEO_VAI_TRO,
  LY_DO_KHONG_CO_VIEC,
  MOI_O_BUOC,
  MOI_TRANG_THAI,
  mauThe,
  nhanThe,
  THE_THEO_VAI_TRO,
  type OBuoc,
  type The,
} from '@csbh/web/tong-quan';

/** Trạng thái mà thẻ này đếm, hoặc `null` nếu nó đếm theo bước. */
const trangThaiCua = (t: The): string | null =>
  t.dem.tu === 'trangThai' ? t.dem.trangThai : null;

/** Các ô bước mà thẻ này cộng vào. Rỗng với thẻ trạng thái và thẻ *Sắp quá hạn*. */
const oCua = (t: The): OBuoc[] => (t.dem.tu === 'buoc' ? t.dem.o : []);

describe('hai bảng tra phủ đủ sáu vai trò', () => {
  it('không vai trò nào thiếu khoá trong `THE_THEO_VAI_TRO`', () => {
    for (const v of VAI_TRO) {
      expect(THE_THEO_VAI_TRO[v], `thiếu ${v}`).toBeDefined();
    }
    expect(Object.keys(THE_THEO_VAI_TRO).sort()).toEqual([...VAI_TRO].sort());
  });

  it('không vai trò nào thiếu khoá trong `KHOI_THEO_VAI_TRO`', () => {
    for (const v of VAI_TRO) {
      expect(KHOI_THEO_VAI_TRO[v], `thiếu ${v}`).toBeDefined();
    }
    expect(Object.keys(KHOI_THEO_VAI_TRO).sort()).toEqual([...VAI_TRO].sort());
  });

  it('mọi vai trò đều có ít nhất một thứ để nhìn', () => {
    // Đây chính là lỗi đang sửa ở P10: trước đó Ban lãnh đạo và Quản trị đăng
    // nhập vào một trang TRẮNG vì `/policies/inbox` trả rỗng cho họ theo thiết kế.
    for (const v of VAI_TRO) {
      const co = THE_THEO_VAI_TRO[v].length + KHOI_THEO_VAI_TRO[v].length;
      expect(co, `vai trò ${v} không có khối nào — sẽ ra trang trắng`).toBeGreaterThan(0);
    }
  });
});

/**
 * Bốn dải thẻ khách hàng đã chốt, chép nguyên văn (`0045`).
 *
 * Khẳng định CỨNG chứ không suy ra từ bảng: đây là thứ khách hàng ngồi đọc và
 * gật đầu, nên nó phải gãy ngay khi ai đó thêm bớt một ô — kể cả khi ô thêm vào
 * trông có lý. Đổi bảng mà không đổi cả dòng ở đây là chưa hỏi lại khách hàng.
 */
const DA_CHOT: Partial<Record<VaiTro, string[]>> = {
  TDV: ['Yêu cầu chỉnh sửa', 'Nháp', 'Sắp quá hạn', 'Đang chờ', 'Đang có hiệu lực', 'Từ chối'],
  TBP: ['Chờ TBP duyệt', 'Sắp quá hạn', 'Đang chờ', 'Đang có hiệu lực', 'Từ chối'],
  KE_TOAN: [
    'KT duyệt bản mềm',
    'KT duyệt bản cứng',
    'Sắp quá hạn',
    'Đang chờ',
    'Đang có hiệu lực',
  ],
  SALE_ADMIN: ['Trình ký', 'Lỗi bản cứng', 'Sắp quá hạn', 'Đang chờ', 'Đang có hiệu lực'],
};

describe('dải thẻ đúng bản đã chốt với khách hàng', () => {
  for (const [v, nhan] of Object.entries(DA_CHOT)) {
    it(`${v} có đúng ${nhan.length} thẻ, đúng thứ tự`, () => {
      expect(THE_THEO_VAI_TRO[v as VaiTro].map(nhanThe)).toEqual(nhan);
    });
  }

  it('không vai trò nào trong luồng còn thẻ "Quá hạn duyệt"', () => {
    /*
     * Hồ sơ quá hạn KHÔNG biến mất theo cái thẻ vừa bỏ đi.
     *
     * `QUA_HAN_DUYET` là cái NHÃN đè lên trạng thái cũ chứ không phải một chặng
     * mới, và người phụ trách vẫn duyệt được bình thường (muc 4). Nên thẻ của
     * bốn bước chờ đếm theo BƯỚC — `byStepDetail`, vốn đọc
     * `coalesce(pending_step, …)` — chứ không theo trạng thái. Nếu ai đó đổi
     * chúng sang đếm theo trạng thái thì đúng những hồ sơ trễ nhất lặng lẽ rơi
     * khỏi màn hình của người duy nhất xử lý được chúng.
     */
    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      const the = THE_THEO_VAI_TRO[v];
      expect(the.map(trangThaiCua)).not.toContain('QUA_HAN_DUYET');
      const buoc = the.filter((t) => t.dem.tu === 'buoc');
      expect(buoc.length, `${v} phải có ít nhất một thẻ đếm theo bước`).toBeGreaterThan(0);
    }
  });
});

describe('mã trạng thái và mã bước phải có thật', () => {
  it('`MOI_TRANG_THAI` đúng bằng 12 trạng thái của muc 4 và `0035`', () => {
    expect([...MOI_TRANG_THAI].sort()).toEqual(Object.keys(NHAN_TRANG_THAI).sort());
  });

  it('mọi thẻ đều trỏ tới một trạng thái hoặc một ô bước có thật', () => {
    // Gõ sai một mã thì thẻ hiện số 0 vĩnh viễn — không có lỗi nào, chỉ có một ô
    // luôn bằng không.
    for (const v of VAI_TRO) {
      for (const t of THE_THEO_VAI_TRO[v]) {
        if (t.dem.tu === 'trangThai') {
          expect(NHAN_TRANG_THAI[t.dem.trangThai], `${v}: trạng thái lạ`).toBeDefined();
        } else {
          for (const o of oCua(t)) expect(MOI_O_BUOC, `${v}: ô bước lạ "${o}"`).toContain(o);
        }
      }
    }
  });

  it('`BUOC_THAT` và `BUOC_CUA` phủ đúng năm ô đếm', () => {
    expect(Object.keys(BUOC_THAT).sort()).toEqual([...MOI_O_BUOC].sort());
    expect(Object.keys(BUOC_CUA).sort()).toEqual([...MOI_O_BUOC].sort());
  });

  it('`BAN_CUA` phủ đủ 12 trạng thái', () => {
    expect(Object.keys(BAN_CUA).sort()).toEqual(Object.keys(NHAN_TRANG_THAI).sort());
  });

  it('hai nửa của B8 cùng trỏ về một bước thật', () => {
    // Chúng là MỘT trạng thái `SA_DANG_XU_LY`; chỉ mốc `reprint_requested_at`
    // tách được. Trỏ về hai bước khác nhau là lọc ra hai tập rỗng.
    expect(BUOC_THAT.B8_TRINH_KY).toBe('B8_SA_XU_LY');
    expect(BUOC_THAT.B8_LOI_BAN_CUNG).toBe('B8_SA_XU_LY');
  });

  it('không thẻ nào lặp lại trong cùng một vai trò', () => {
    for (const v of VAI_TRO) {
      const ma = THE_THEO_VAI_TRO[v].map((t) => t.ma);
      expect(new Set(ma).size, `${v} có thẻ trùng`).toBe(ma.length);
    }
  });
});

describe('`0047` thẻ Sắp quá hạn', () => {
  const CO_HO_SO: VaiTro[] = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO'];

  it('có ở mọi vai trò nhìn thấy hồ sơ', () => {
    for (const v of CO_HO_SO) {
      expect(
        THE_THEO_VAI_TRO[v].map((t) => t.ma),
        `${v} thiếu thẻ Sắp quá hạn`,
      ).toContain('SAP_QUA_HAN');
    }
  });

  it('KHÔNG có ở Quản trị hệ thống, vì họ không thấy hồ sơ nào', () => {
    // `idn.scope_user_ids` trả rỗng cho vai trò này, nên ô ấy vĩnh viễn bằng 0.
    // Một cảnh báo đỏ luôn bằng 0 dạy người ta bỏ qua mọi cảnh báo đỏ khác.
    expect(THE_THEO_VAI_TRO.QUAN_TRI).toEqual([]);
  });

  it('màu ĐỎ, không phải vàng', () => {
    // Vàng là "có việc tồn"; đỏ là "sắp mất". Sau 24 giờ nữa hồ sơ chết hẳn, và
    // 3 ngày sau hệ thống xoá — đây là ô duy nhất trên trang báo một thứ sắp mất.
    for (const v of CO_HO_SO) {
      const the = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'SAP_QUA_HAN')!;
      expect(mauThe(the), v).toBe('loi');
    }
  });

  it('bấm vào lọc theo `dueSoon`, không theo bước nào', () => {
    // Nó cộng hồ sơ ở MỌI bước — người liên quan nào cũng thấy, kể cả khi hồ sơ
    // đang nằm ở bàn người khác. Kèm `pendingStep` vào là cắt mất phần lớn.
    for (const v of CO_HO_SO) {
      const the = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'SAP_QUA_HAN')!;
      expect(duongThe(the)).toBe('/ho-so?dueSoon=1');
    }
  });

  it('không vai trò nào còn thẻ cho trạng thái Quá hạn duyệt', () => {
    // `0047`: quá hạn là trạng thái CHẾT — không thao tác được, 3 ngày sau bị
    // xoá. Bày nó thành một ô đếm việc là mời người ta bấm vào một thứ đã hỏng.
    for (const v of CO_HO_SO) {
      if (v === 'BAN_LANH_DAO') continue; // vai trò giám sát, thấy đủ 12 trạng thái
      expect(THE_THEO_VAI_TRO[v].map(trangThaiCua)).not.toContain('QUA_HAN_DUYET');
    }
  });
});

describe('mọi thẻ đều bấm được, và bấm ra đúng thứ nó đếm', () => {
  it('không thẻ nào là con số chết', () => {
    // Yêu cầu chốt cùng đợt: người dùng phải bấm được vào TẤT CẢ các thẻ. Một
    // con số không mở ra được danh sách sau nó là con số phải tin mà không kiểm
    // được — và thẻ "Đang chờ duyệt" của TDV từng đúng như vậy.
    for (const v of VAI_TRO) {
      for (const t of THE_THEO_VAI_TRO[v]) {
        expect(duongThe(t), `${v}/${t.ma} không bấm được`).toMatch(/^\/ho-so\?/);
      }
    }
  });

  it('thẻ đếm theo bước lọc theo `pendingStep`, KHÔNG theo `status`', () => {
    /*
     * Chỗ này là cả lý do tiêu chí `pendingStep` tồn tại.
     *
     * Thẻ "Chờ TBP duyệt: 12" đếm cả hồ sơ quá hạn ở bước ấy, mà chúng mang
     * `status = 'QUA_HAN_DUYET'`. Lọc `?status=CHO_TBP_DUYET` mở ra một danh
     * sách NGẮN HƠN con số vừa bấm vào — người dùng đếm được, và không có phép
     * kiểm nào tự bắt lỗi ấy.
     */
    for (const v of VAI_TRO) {
      for (const t of THE_THEO_VAI_TRO[v]) {
        if (t.dem.tu !== 'buoc') continue;
        expect(duongThe(t), `${v}/${t.ma}`).toContain('pendingStep=');
        expect(duongThe(t), `${v}/${t.ma} lọc theo trạng thái`).not.toContain('status=');
      }
    }
  });

  it('chỉ thẻ lấy ĐÚNG MỘT nửa của B8 mới kèm tiêu chí `reprint`', () => {
    // Thẻ "Đang chờ" của TDV/TBP/Kế toán ôm trọn cả hai nửa; kèm `reprint` vào
    // là lọc mất một nửa số hồ sơ nó vừa đếm.
    for (const v of VAI_TRO) {
      for (const t of THE_THEO_VAI_TRO[v]) {
        if (t.dem.tu !== 'buoc') continue;
        const nua = t.dem.o.filter((o) => BUOC_THAT[o] === 'B8_SA_XU_LY').length;
        expect(duongThe(t).includes('reprint='), `${v}/${t.ma} có ${nua} nửa B8`).toBe(nua === 1);
      }
    }
    expect(duongThe(THE_THEO_VAI_TRO.SALE_ADMIN[0]!)).toContain('reprint=0');
    expect(duongThe(THE_THEO_VAI_TRO.SALE_ADMIN[1]!)).toContain('reprint=1');
  });
});

describe('thẻ chỉ nói việc của CHÍNH vai trò đó', () => {
  /**
   * Khẳng định chính của đợt trước, giữ nguyên hiệu lực.
   *
   * Một TDV nhìn ô "KT duyệt bản cứng: 7" thì không làm được gì với con số ấy,
   * mà nó vẫn chiếm chỗ và vẫn bắt phải đọc. `BAN_CUA` và `BUOC_CUA` được khai
   * RIÊNG chứ không suy ra từ bảng thẻ — suy ngược thì test chỉ đang lặp lại
   * chính dữ liệu nó cần kiểm.
   */
  const TRU: VaiTro[] = ['BAN_LANH_DAO'];

  it('không vai trò nào bày bước của vai trò khác thành thẻ riêng', () => {
    const viPham: string[] = [];
    for (const v of VAI_TRO) {
      if (TRU.includes(v)) continue;
      for (const t of THE_THEO_VAI_TRO[v]) {
        if (t.dem.tu === 'trangThai') {
          const chu = BAN_CUA[t.dem.trangThai];
          // `null` là trạng thái kết thúc hoặc cắt ngang (hiệu lực, hết hiệu
          // lực, từ chối) — ai xem cũng có nghĩa.
          if (chu !== null && chu !== v) viPham.push(`${v} có thẻ "${t.ma}" vốn là việc của ${chu}`);
          continue;
        }
        // Hai thẻ là ngoại lệ CÓ CHỦ Ý, và vì cùng một lẽ: chúng nói về hồ sơ
        // của người khác. "Đang chờ" nói phần còn lại đang ở bàn ai; "Sắp quá
        // hạn" nói hồ sơ nào sắp chết, ở bất kỳ bàn nào (`0047`).
        if (t.ma === 'DANG_CHO' || t.dem.tu === 'sapQuaHan') continue;
        for (const o of t.dem.o) {
          if (BUOC_CUA[o] !== v) viPham.push(`${v} có thẻ bước "${o}" vốn là việc của ${BUOC_CUA[o]}`);
        }
      }
    }
    expect(viPham, viPham.join('\n')).toEqual([]);
  });

  it('thẻ "Đang chờ" KHÔNG chứa bước của chính vai trò đó', () => {
    // Định nghĩa khách hàng chốt: "hồ sơ trong phạm vi nhưng không cần thao tác
    // gì hiện tại". Lọt bước của chính mình vào đây là đếm việc phải làm thành
    // việc không phải làm — hỏng đúng câu mà thẻ này sinh ra để trả lời.
    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      const the = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'DANG_CHO');
      expect(the, `${v} thiếu thẻ Đang chờ`).toBeDefined();
      const o = oCua(the!);
      expect(o.length, `${v}: thẻ Đang chờ rỗng`).toBeGreaterThan(0);
      for (const b of o) expect(BUOC_CUA[b], `${v} tự đếm bước của mình`).not.toBe(v);
    }
  });

  it('thẻ "Đang chờ" cộng lại đúng bằng mọi bước còn lại', () => {
    // Thiếu một bước thì con số nhỏ hơn thực tế mà không ai biết: không có tổng
    // nào ở màn hình để đối chiếu.
    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      const the = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'DANG_CHO')!;
      const o = [...oCua(the)].sort();
      expect(o).toEqual(MOI_O_BUOC.filter((b) => BUOC_CUA[b] !== v).sort());
    }
  });

  it('Ban lãnh đạo thì ngược lại — thấy đủ cả 12 trạng thái', () => {
    const t = THE_THEO_VAI_TRO.BAN_LANH_DAO.map(trangThaiCua).filter((x) => x !== null);
    expect([...t].sort()).toEqual([...MOI_TRANG_THAI].sort());
  });

  it('Quản trị hệ thống KHÔNG có thẻ hồ sơ nào', () => {
    // `idn.scope_user_ids` trả rỗng cho vai trò này (0003_identity.sql), nên mọi
    // lời gọi /reports/* ra 0. Một ô "Tổng hồ sơ: 0" là con số đúng nhưng đọc ra
    // nghĩa hoàn toàn sai — người xem tưởng hệ thống trống.
    expect(THE_THEO_VAI_TRO.QUAN_TRI).toEqual([]);
  });

  it('mỗi vai trò trong luồng có ít nhất một thẻ là việc của chính mình', () => {
    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      const cuaMinh = THE_THEO_VAI_TRO[v].filter((t) =>
        t.dem.tu === 'trangThai'
          ? BAN_CUA[t.dem.trangThai] === v
          : t.ma !== 'DANG_CHO' &&
            t.dem.tu === 'buoc' &&
            t.dem.o.every((o) => BUOC_CUA[o] === v),
      );
      expect(cuaMinh.length, `${v} chỉ có thẻ kết thúc, không có việc nào của mình`).toBeGreaterThan(
        0,
      );
    }
  });

  it('chỉ "Lỗi bản cứng" mang màu cảnh báo trong nhóm thẻ bước', () => {
    // Bốn ô kia là việc bình thường đang tới lượt; ô này là việc PHẢI LÀM LẠI vì
    // bản cứng đã in, đã trình ký, đã scan rồi bị bỏ hết. Tô vàng cả bốn ô kia
    // là làm cái duy nhất đáng chú ý mất chỗ đứng.
    expect(mauThe(THE_THEO_VAI_TRO.SALE_ADMIN[1]!)).toBe('canh-bao');
    expect(mauThe(THE_THEO_VAI_TRO.SALE_ADMIN[0]!)).toBe('cho');
    expect(mauThe(THE_THEO_VAI_TRO.TBP[0]!)).toBe('cho');
  });
});

describe('FE-23 Ban lãnh đạo chỉ đọc', () => {
  it('không có khối nào chứa nút ghi', () => {
    for (const k of KHOI_THEO_VAI_TRO.BAN_LANH_DAO) {
      expect(KHOI_CO_NUT_GHI, `Ban lãnh đạo không được có khối "${k}"`).not.toContain(k);
    }
  });

  it('hai vai trò ngoài luồng không có thẻ gộp "Đang chờ"', () => {
    // Thẻ ấy trả lời "phần còn lại có đang chạy không" — một câu chỉ có nghĩa
    // với người ĐANG chờ đến lượt mình.
    for (const v of ['BAN_LANH_DAO', 'QUAN_TRI'] as VaiTro[]) {
      expect(THE_THEO_VAI_TRO[v].map((t) => t.ma)).not.toContain('DANG_CHO');
    }
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

  it('màn hình hồ sơ nhận được hai tiêu chí mà thẻ gửi sang', () => {
    // Thẻ trỏ tới `?pendingStep=…&reprint=…`; nếu màn hình kia không nhận hai
    // khoá đó thì mọi thẻ bước mở ra danh sách KHÔNG lọc gì — dài hơn con số
    // vừa bấm, và trông vẫn như đang chạy đúng.
    const nguon = readFileSync('apps/web/src/pages/DanhSachHoSo.tsx', 'utf8');
    expect(nguon).toContain('pendingStep:');
    expect(nguon).toContain('reprint:');
  });
});
