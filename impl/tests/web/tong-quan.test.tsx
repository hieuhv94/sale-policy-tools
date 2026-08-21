/**
 * @vitest-environment jsdom
 *
 * Trang tổng quan — quét HAI BẢNG TRA, không mở từng màn hình.
 *
 * Cái sai cần bắt ở đây không phải một hàm trả sai giá trị, mà là **một ô vắng
 * mặt**: thiếu một vai trò trong bảng, hoặc bày cho một vai trò con số thuộc
 * việc của người khác. Không lỗi nào trong hai lỗi đó làm màn hình đỏ lên —
 * chúng chỉ làm màn hình sai một cách im lặng, và chỉ phát hiện được bằng cách
 * đăng nhập lần lượt sáu tài khoản mà nhìn.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DaiTheTrangThai } from '@csbh/web/so-lieu';
import { DanhSachViec } from '@csbh/web/hop-viec';
import { BoDinhTuyen } from '@csbh/web/router';
import { KHOA_NHAN_TU_LIEN_KET } from '@csbh/web/ho-so-ui';
import { VAI_TRO, xem, type VaiTro } from '@csbh/web/can';
import { NHAN_TRANG_THAI, nhomTrangThai } from '@csbh/web/format';
import {
  BAN_CUA,
  BUOC_CUA,
  BUOC_THAT,
  duongThe,
  KHOI_CO_NUT_GHI,
  KHOI_DOC_NHAT_KY,
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
  TDV: [
    'Yêu cầu chỉnh sửa',
    'Sắp quá hạn',
    'Quá hạn',
    'Đang chờ',
    'Đang có hiệu lực',
    'Từ chối',
  ],
  TBP: ['Chờ TBP duyệt', 'Sắp quá hạn', 'Quá hạn', 'Đang chờ', 'Đang có hiệu lực', 'Từ chối'],
  KE_TOAN: [
    'KT duyệt bản mềm',
    'KT duyệt bản cứng',
    'Sắp quá hạn',
    'Quá hạn',
    'Đang chờ',
    'Đang có hiệu lực',
  ],
  SALE_ADMIN: [
    'Trình ký',
    'Lỗi bản cứng',
    'Sắp quá hạn',
    'Quá hạn',
    'Đang chờ',
    'Đang có hiệu lực',
  ],
};

describe('dải thẻ đúng bản đã chốt với khách hàng', () => {
  for (const [v, nhan] of Object.entries(DA_CHOT)) {
    it(`${v} có đúng ${nhan.length} thẻ, đúng thứ tự`, () => {
      expect(THE_THEO_VAI_TRO[v as VaiTro].map(nhanThe)).toEqual(nhan);
    });
  }

  it('mỗi vai trò trong luồng đều có thẻ đếm theo bước', () => {
    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      const buoc = THE_THEO_VAI_TRO[v].filter((t) => t.dem.tu === 'buoc');
      expect(buoc.length, `${v} phải có ít nhất một thẻ đếm theo bước`).toBeGreaterThan(0);
    }
  });
});

describe('mã trạng thái và mã bước phải có thật', () => {
  it('`MOI_TRANG_THAI` đúng bằng 11 trạng thái của muc 4, `0035` và `0064`', () => {
    /*
     * Hai tập này bằng nhau TRỞ LẠI từ `0048`. Ở `0064` chúng lệch một phần tử:
     * `NHAN_TRANG_THAI` còn giữ `TBP_DA_KY_SO` để đọc dòng lịch sử cũ, vì giá trị
     * enum vẫn nằm trong CSDL. `0048` gỡ luôn giá trị ấy khỏi enum, nên không dòng
     * dữ liệu nào còn mang nó và bảng nhãn không phải chứa nó nữa.
     */
    expect([...MOI_TRANG_THAI].sort()).toEqual(Object.keys(NHAN_TRANG_THAI).sort());
    expect(MOI_TRANG_THAI).not.toContain('TBP_DA_KY_SO');
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

  it('`BAN_CUA` phủ đủ 11 trạng thái sống', () => {
    expect(Object.keys(BAN_CUA).sort()).toEqual([...MOI_TRANG_THAI].sort());
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

  it('`0064` màu CAM riêng, khác đỏ của thẻ Quá hạn đứng ngay cạnh', () => {
    // Hai ô này kề nhau trên MỌI dải thẻ và là hai chuyện khác hẳn nhau: cái này
    // còn kịp cứu, cái kia đã mất. Cùng màu thì mất luôn phần "còn kịp".
    for (const v of CO_HO_SO) {
      const the = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'SAP_QUA_HAN')!;
      expect(mauThe(the), v).toBe('gap');
      const quaHan = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'QUA_HAN_DUYET');
      if (quaHan) expect(mauThe(quaHan), v).not.toBe('gap');
    }
  });

  it('bấm vào lọc theo `han`, không theo bước nào', () => {
    // Nó cộng hồ sơ ở MỌI bước — người liên quan nào cũng thấy, kể cả khi hồ sơ
    // đang nằm ở bàn người khác. Kèm `pendingStep` vào là cắt mất phần lớn.
    for (const v of CO_HO_SO) {
      const the = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'SAP_QUA_HAN')!;
      expect(duongThe(the)).toBe('/ho-so?han=SAP_QUA_HAN');
    }
  });

  it('`0053` thẻ Đang chờ KHÔNG mang dòng đếm sắp quá hạn', () => {
    /*
     * Thẻ ấy đếm hồ sơ ở bàn NGƯỜI KHÁC — theo đúng định nghĩa khách hàng chốt,
     * phần không cần mình làm gì. Treo một con số gấp lên đó là mời người đọc lo
     * một việc họ không bấm được, mà thẻ *Sắp quá hạn* ngay bên cạnh đã đếm sẵn
     * toàn phạm vi rồi.
     *
     * Kiểm bằng cách DỰNG số liệu rồi soi kết quả, không đọc mã: thứ cần khẳng
     * định là con số hiện ra, không phải một nhánh `if` nào đó còn nguyên.
     */
    const bo = {
      tienDo: {
        total: 0,
        byStatus: {},
        byPendingStep: {},
        byStepDetail: {
          B4_TBP_DUYET: { total: 4, soon: 2 },
          B6_KT_L1: { total: 3, soon: 1 },
          B8_TRINH_KY: { total: 2, soon: 1 },
          B8_LOI_BAN_CUNG: { total: 1, soon: 0 },
          B10_KT_L2: { total: 5, soon: 3 },
        },
        byHandler: [],
      },
      traLai: { submitted: 0, returned: 0, rejected: 0, returnedOrRejected: 0, rate: 0 },
      sla: { waiting: 0, overdue: 0, dueUnflagged: 0, dueToday: 0, avgWaitingDays: 0, excludedLegacy: 0 },
    };

    const ve = (v: VaiTro) =>
      render(createElement(DaiTheTrangThai, { danhSach: THE_THEO_VAI_TRO[v], bo }));

    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      cleanup();
      ve(v);
      const o = [...document.querySelectorAll('.chi-so')].find(
        (e) => e.querySelector('.chi-so-nhan')?.textContent === 'Đang chờ',
      );
      expect(o, `${v} thiếu thẻ Đang chờ`).toBeDefined();
      expect(o!.querySelector('.chi-so-tre'), `${v}: thẻ Đang chờ còn dòng đếm`).toBeNull();
    }
    cleanup();
  });

  it('`0053` nhưng thẻ của CHÍNH bước mình thì vẫn giữ dòng đếm ấy', () => {
    // Ở đó con số nói "trong mười hai việc của bạn, hai cái sắp hết giờ" — đó là
    // thứ quyết định thứ tự xử lý sáng nay, và không chỗ nào khác nói ra được.
    const bo = {
      tienDo: {
        total: 0,
        byStatus: {},
        byPendingStep: {},
        byStepDetail: { B4_TBP_DUYET: { total: 12, soon: 2 } },
        byHandler: [],
      },
      traLai: { submitted: 0, returned: 0, rejected: 0, returnedOrRejected: 0, rate: 0 },
      sla: { waiting: 0, overdue: 0, dueUnflagged: 0, dueToday: 0, avgWaitingDays: 0, excludedLegacy: 0 },
    };
    render(createElement(DaiTheTrangThai, { danhSach: THE_THEO_VAI_TRO.TBP, bo }));
    const o = [...document.querySelectorAll('.chi-so')].find(
      (e) => e.querySelector('.chi-so-nhan')?.textContent === 'Chờ TBP duyệt',
    );
    expect(o!.querySelector('.chi-so-tre')?.textContent).toContain('2 sắp quá hạn');
    cleanup();
  });

  it('`0048` đứng ngay cạnh thẻ Quá hạn, và hai thẻ nói hai chuyện khác nhau', () => {
    /*
     * Ở `0047` tôi cố ý KHÔNG làm thẻ *Quá hạn*, lập luận rằng đếm một thứ không
     * bấm được vào ô đếm việc là nói dối về lượng việc. Khách hàng yêu cầu lại ở
     * `0048`, và lý do của họ đúng hơn: ba ngày ấy là cửa sổ duy nhất để người ta
     * biết mình vừa mất gì và lập lại trước khi nó biến mất hẳn.
     *
     * Hai thẻ phải ĐỨNG CẠNH NHAU và theo đúng thứ tự thời gian — còn cứu được
     * trước, đã mất sau. Đảo lại là bắt người đọc nhảy ngược dòng thời gian.
     */
    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      const ma = THE_THEO_VAI_TRO[v].map((t) => t.ma);
      const i = ma.indexOf('SAP_QUA_HAN');
      expect(i, `${v} thiếu thẻ Sắp quá hạn`).toBeGreaterThanOrEqual(0);
      expect(ma[i + 1], `${v}: thẻ Quá hạn không đứng ngay sau Sắp quá hạn`).toBe('QUA_HAN_DUYET');
    }
  });

  it('`0048` thẻ Quá hạn đếm theo TRẠNG THÁI, không gộp vào thẻ của bước', () => {
    // Thẻ của bước đếm việc phải làm; thẻ này đếm việc phải làm LẠI. Gộp lại là
    // đúng cái `0045` từng làm và `0047` đã gỡ ra.
    for (const v of Object.keys(DA_CHOT) as VaiTro[]) {
      const the = THE_THEO_VAI_TRO[v].find((t) => t.ma === 'QUA_HAN_DUYET')!;
      expect(the.dem.tu).toBe('trangThai');
      // ĐẾM theo trạng thái, nhưng BẤM vào lọc theo *Hạn xử lý* (`0060`): hai
      // đường cho ra cùng một tập, và đường này để lại đúng cái ô chọn mà người
      // dùng thấy trong biểu mẫu.
      expect(duongThe(the)).toBe('/ho-so?han=QUA_HAN');
      // `0064` đỏ, CÙNG màu *Từ chối* — khách hàng chốt ngày 19/08. Hai ngõ cụt
      // khác nguyên nhân, nhưng với người dùng cùng một kết cục.
      expect(mauThe(the), v).toBe('hong');
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

  it('`0064` thẻ của một bước mang đúng màu trạng thái của bước ấy', () => {
    /*
     * Bấm thẻ *Chờ TBP duyệt* rồi rơi vào một danh sách toàn nhãn màu khác thì
     * người dùng phải học bảng màu lần thứ hai. Bốn ô bước mượn màu của bốn
     * trạng thái tương ứng, nên hai màn hình đọc như một.
     */
    expect(mauThe(THE_THEO_VAI_TRO.TBP[0]!)).toBe(nhomTrangThai('CHO_TBP_DUYET'));
    expect(mauThe(THE_THEO_VAI_TRO.KE_TOAN[0]!)).toBe(nhomTrangThai('CHO_KT_L1'));
    expect(mauThe(THE_THEO_VAI_TRO.KE_TOAN[1]!)).toBe(nhomTrangThai('CHO_KT_L2'));
    expect(mauThe(THE_THEO_VAI_TRO.SALE_ADMIN[0]!)).toBe(nhomTrangThai('SA_DANG_XU_LY'));

    /*
     * `B8_LOI_BAN_CUNG` là ngoại lệ DUY NHẤT, và nó không có trạng thái riêng
     * để mượn: cả nó lẫn *Trình ký* đều là `SA_DANG_XU_LY`. Nó mượn màu của
     * *Yêu cầu chỉnh sửa* — cùng một chuyện "có người trả việc về cho bạn" — và
     * hai thẻ ấy không bao giờ đứng chung một dải.
     */
    expect(mauThe(THE_THEO_VAI_TRO.SALE_ADMIN[1]!)).toBe(nhomTrangThai('YEU_CAU_CHINH_SUA'));
    expect(mauThe(THE_THEO_VAI_TRO.SALE_ADMIN[1]!)).not.toBe(
      mauThe(THE_THEO_VAI_TRO.SALE_ADMIN[0]!),
    );
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

describe('`0086` khối đọc nhật ký và quyền đọc nhật ký', () => {
  it('vai trò nào có khối đọc nhật ký thì phải xem được mục Nhật ký', () => {
    /*
     * KHÔNG nêu tên vai trò nào. Quyền nằm ở `can.ts`, bố cục nằm ở
     * `tong-quan.ts` — hai tệp, và `0086` sinh ra đúng từ việc chỉ một bên được
     * sửa: bỏ mục menu *Nhật ký* của Ban lãnh đạo mà để lại khối *Hoạt động gần
     * đây* thì trang đầu tiên sau khi đăng nhập có một khối 403.
     *
     * Quét mọi vai trò nên lượt đổi quyền lần sau tự nằm trong phạm vi phép
     * kiểm, không cần ai nhớ sửa ca này.
     */
    for (const v of VAI_TRO) {
      const khoi = KHOI_THEO_VAI_TRO[v].filter((k) => KHOI_DOC_NHAT_KY.includes(k));
      if (khoi.length === 0) continue;
      expect(xem(v, 'nhatKy'), `${v} có khối ${khoi.join(', ')} mà không đọc được nhật ký`).toBe(
        true,
      );
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

  it('`0075` Kế toán dùng CHUNG hộp việc, không còn khối tách riêng', () => {
    /*
     * Hai lần tiếp nhận gộp vào một danh sách. Điều kiện để gộp được là mỗi dòng
     * TỰ NÓI bước của nó — ca dưới kiểm chính điều ấy trên `DanhSachViec`.
     */
    expect(KHOI_THEO_VAI_TRO.KE_TOAN).toContain('hop-viec');
    const rieng = Object.values(KHOI_THEO_VAI_TRO)
      .flat()
      .filter((k) => k.startsWith('hop-viec') && k !== 'hop-viec');
    expect(rieng, `còn khối hộp việc riêng: ${rieng.join(', ')}`).toEqual([]);
  });

  it('`0075` một danh sách gộp vẫn phân biệt được hai lần tiếp nhận', () => {
    /*
     * Lý do tách hồi `0045` là "trộn chung thì phải đọc nhãn trạng thái từng
     * dòng mới biết dòng đó thuộc bước nào". Ca này chốt vế còn lại của câu ấy:
     * nhãn NẰM SẴN trên mỗi dòng, nên không phải đọc gì thêm — chỉ nhìn.
     *
     * Ngày nào `DanhSachViec` bỏ nhãn đi thì ca này đỏ, và đó đúng là ngày việc
     * gộp hai danh sách trở thành sai.
     */
    const muc = (id: string, status: string) => ({
      id,
      code: `CSBH-2026-00000${id}`,
      customerId: 'kh-1',
      versionNo: 1,
      status,
      pendingStep: null,
      slaDueAt: '2026-09-01T00:00:00.000Z',
      sapQuaHan: false,
    });

    render(
      createElement(BoDinhTuyen, {
        children: createElement(DanhSachViec, {
          muc: [muc('1', 'CHO_KT_L1'), muc('2', 'CHO_KT_L2')],
          trongTieuDe: 'trống',
        }),
      }),
    );

    const chu = document.body.textContent ?? '';
    expect(chu).toContain(NHAN_TRANG_THAI.CHO_KT_L1);
    expect(chu).toContain(NHAN_TRANG_THAI.CHO_KT_L2);
    // Và hai nhãn ấy KHÁC nhau — cùng tên thì có hiện cũng không phân biệt được.
    expect(NHAN_TRANG_THAI.CHO_KT_L1).not.toBe(NHAN_TRANG_THAI.CHO_KT_L2);
    cleanup();
  });

  it('`0074` và ngược lại: mọi khối KHAI RA đều có ít nhất một vai trò dùng', () => {
    /*
     * Chiều còn thiếu của phép đối chiếu trên. Ca kia đi từ BẢNG về MÀN HÌNH:
     * dùng một khối thì phải dựng được nó. Ca này đi từ KIỂU về BẢNG: khai một
     * tên khối thì phải có người nhìn thấy nó.
     *
     * Chỗ hổng ấy vừa suýt cắn ở `0074`. `suc-khoe-luong` có ba vai trò dùng,
     * đợt này gỡ khỏi hai — còn đúng một. Gỡ nốt cái thứ ba thì cả một khối
     * cùng nhánh `case` dựng nó nằm lại trong mã, không ai gọi, không ca nào
     * đỏ, và người sửa sau đọc nó tưởng là màn hình đang có thật.
     *
     * Đọc thẳng danh sách từ kiểu `TenKhoi`: nó là kiểu chuỗi hợp, không tồn tại
     * lúc chạy, nên không có cách nào khác ngoài quét nguồn.
     */
    const nguon = readFileSync('apps/web/src/lib/tong-quan.ts', 'utf8');
    const hop = /export type TenKhoi =([\s\S]*?);/.exec(nguon);
    expect(hop, 'không tìm thấy khai báo `TenKhoi`').not.toBeNull();
    const khai = [...hop![1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
    expect(khai.length, 'đọc hụt danh sách khối').toBeGreaterThan(5);

    const dangDung = new Set(Object.values(KHOI_THEO_VAI_TRO).flat());
    const boRoi = khai.filter((k) => !dangDung.has(k as never));
    expect(boRoi, `khối khai ra mà không vai trò nào dùng: ${boRoi.join(', ')}`).toEqual([]);
  });

  it('`0059` MỌI tham số thẻ sinh ra đều được màn hình hồ sơ chấp nhận', () => {
    /*
     * Bản trước liệt kê tay hai khoá (`pendingStep`, `reprint`) và quét mã nguồn
     * tìm chúng. Nó xanh mãi mãi — kể cả khi `0047` thêm thẻ *Sắp quá hạn* với
     * tham số thứ ba (`dueSoon`, nay là `han`) mà quên khai bên màn hình hồ sơ.
     * Hệ quả: bấm thẻ
     * ấy ra TOÀN BỘ hồ sơ, vì tham số nào không có tên trong danh sách nhận thì
     * bị bỏ trong IM LẶNG — không lỗi, không cảnh báo, chỉ một danh sách dài hơn
     * con số vừa bấm vào.
     *
     * Một phép kiểm liệt kê tay không lớn theo mã. Bản này SUY RA danh sách khoá
     * từ chính `duongThe()` của mọi thẻ, nên thêm thẻ mới với tham số mới là nó
     * tự bắt.
     */
    const thieu: string[] = [];
    for (const v of VAI_TRO) {
      for (const t of THE_THEO_VAI_TRO[v]) {
        const q = duongThe(t).split('?')[1] ?? '';
        for (const khoa of new URLSearchParams(q).keys()) {
          if (!KHOA_NHAN_TU_LIEN_KET.includes(khoa)) {
            thieu.push(`${v}/${t.ma} gửi "${khoa}" mà màn hình hồ sơ không nhận`);
          }
        }
      }
    }
    expect([...new Set(thieu)], [...new Set(thieu)].join('\n')).toEqual([]);
  });
});
