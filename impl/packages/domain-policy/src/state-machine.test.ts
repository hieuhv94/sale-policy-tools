/** WF — luồng duyệt và chuyển trạng thái (YCNV §3, §4). */
import { describe, expect, it } from 'vitest';
import {
  ACTION_OF, ACTIONS, allowedActions, allowedActionsFor, ForbiddenRoleError, InvalidTransitionError,
  markOverdue, ReasonRequiredError, RULES, STATUSES, TERMINAL, transition, WAITING,
  type Action, type Status,
} from './state-machine.js';

const go = (current: Status, action: Action, role: Parameters<typeof transition>[0]['role'],
            reason?: string) => transition({ current, action, role, reason });

describe('WF-02/03 · bộ trạng thái là danh sách đóng', () => {
  it('đúng 10 trạng thái ĐẾN ĐƯỢC', () => {
    // 11 của muc 4, cộng `DA_XOA` từ `0035`, trừ `TBP_DA_KY_SO` gỡ ở `0064`,
    // trừ `TU_CHOI` bỏ ở `0155`.
    expect(STATUSES).toHaveLength(10);
    expect(STATUSES as readonly string[]).not.toContain('TBP_DA_KY_SO');
  });
  it('không còn nhãn cũ nào', () => {
    for (const cu of ['BAN_DEMO', 'DANG_DUYET', 'DA_CHUYEN_BUOC_SAU', 'DANG_AP_DUNG']) {
      expect(STATUSES as readonly string[]).not.toContain(cu);
    }
  });
});

describe('WF-01/04/09/10/13/16 · đường đi chính của một hồ sơ', () => {
  it('chạy trọn 10 bước từ Nháp tới Đang có hiệu lực', () => {
    let s: Status = 'NHAP';
    s = go(s, 'SUBMIT', 'TDV').next;                 expect(s).toBe('CHO_TBP_DUYET');
    // MỘT nước, không hai (`0064`): `TBP_DA_KY_SO` và `PUBLISH_SIGNED` đã bị gỡ.
    s = go(s, 'TBP_SIGN', 'TBP').next;               expect(s).toBe('CHO_KT_L1');
    s = go(s, 'KT_RECEIVE_L1', 'KE_TOAN').next;      expect(s).toBe('SA_DANG_XU_LY');
    s = go(s, 'SA_HANDOVER', 'SALE_ADMIN').next;     expect(s).toBe('CHO_KT_L2');
    const last = go(s, 'KT_RECEIVE_L2', 'KE_TOAN');
    expect(last.next).toBe('DANG_CO_HIEU_LUC');
    expect(last.setsEffectiveFrom).toBe(true);       // hiệu lực NGAY lúc này (§5.3)
  });

  it('mỗi bước ghi đúng cột mốc thời gian riêng', () => {
    expect(go('NHAP', 'SUBMIT', 'TDV').stamp).toBe('submitted');
    expect(go('CHO_TBP_DUYET', 'TBP_SIGN', 'TBP').stamp).toBe('tbp_signed');
    expect(go('CHO_KT_L1', 'KT_RECEIVE_L1', 'KE_TOAN').stamp).toBe('kt_l1_received');
    expect(go('SA_DANG_XU_LY', 'SA_HANDOVER', 'SALE_ADMIN').stamp).toBe('sa_handover');
    expect(go('CHO_KT_L2', 'KT_RECEIVE_L2', 'KE_TOAN').stamp).toBe('kt_l2_received');
  });
});

describe('WF-06/07/27 · trả lại bắt buộc có lý do và tạo phiên bản mới', () => {
  it.each([
    ['CHO_TBP_DUYET', 'TBP_RETURN', 'TBP'],
    ['CHO_KT_L1', 'KT_RETURN_L1', 'KE_TOAN'],
    ['CHO_KT_L2', 'KT_RETURN_L2', 'KE_TOAN'],
  ] as const)('%s · %s thiếu lý do thì bị chặn', (from, action, role) => {
    expect(() => go(from, action, role)).toThrow(ReasonRequiredError);
    expect(() => go(from, action, role, '   ')).toThrow(ReasonRequiredError);
  });

  it.each([
    ['CHO_TBP_DUYET', 'TBP_RETURN', 'TBP'],
    ['CHO_KT_L1', 'KT_RETURN_L1', 'KE_TOAN'],
    ['CHO_KT_L2', 'KT_RETURN_L2', 'KE_TOAN'],
  ] as const)('%s · %s có lý do thì về Yêu cầu chỉnh sửa và tạo phiên bản mới', (from, action, role) => {
    const r = go(from, action, role, 'sai gia');
    expect(r.next).toBe('YEU_CAU_CHINH_SUA');
    expect(r.createsNewVersion).toBe(true);
  });
});

describe('WF-20 · trả lại thì đi lại TOÀN BỘ vòng duyệt, kể cả ký số', () => {
  it('từ Yêu cầu chỉnh sửa gửi lại phải qua Chờ TBP duyệt chứ không nhảy thẳng', () => {
    const r = go('YEU_CAU_CHINH_SUA', 'RESUBMIT_AFTER_EDIT', 'TDV');
    expect(r.next).toBe('CHO_TBP_DUYET');
  });
  it('không có đường tắt nào từ Yêu cầu chỉnh sửa sang các bước sau', () => {
    for (const a of ['KT_RECEIVE_L1', 'SA_HANDOVER', 'KT_RECEIVE_L2'] as Action[]) {
      expect(() => go('YEU_CAU_CHINH_SUA', a, 'KE_TOAN')).toThrow(InvalidTransitionError);
    }
  });
});

describe('`0155` · Từ chối đã bỏ hẳn khỏi máy trạng thái', () => {
  /*
   * WF-08 cũ khẳng định *"Từ chối là trạng thái kết thúc"*. Khách hàng chốt
   * 29/08 bỏ hẳn nó, nên ba ca ấy đổi chiều: giờ phải khẳng định nó KHÔNG TỒN
   * TẠI, chứ không phải xoá chúng đi.
   *
   * Xoá đi thì máy trạng thái mất chốt duy nhất canh việc ai đó thêm lại
   * `TU_CHOI` — và thêm lại là chuyện dễ xảy ra, vì hai cột `rejected_at` /
   * `rejected_by` vẫn còn nguyên trong lược đồ.
   */
  it('không còn trạng thái `TU_CHOI` nào trong danh sách', () => {
    expect(STATUSES as readonly string[]).not.toContain('TU_CHOI');
  });

  it('không còn hành động `TBP_REJECT` nào', () => {
    expect(ACTIONS as readonly string[]).not.toContain('TBP_REJECT');
  });

  it('TBP ở bước Chờ TBP duyệt chỉ còn HAI đường ra: ký, hoặc trả lại', () => {
    /*
     * Ca chiều dương, và nó là ca quan trọng nhất của lượt này. Ba ca trên chỉ
     * nói *"cái cũ đã mất"*; ca này nói *"cái còn lại vẫn đủ dùng"* — bỏ nhầm
     * `TBP_RETURN` thì cả ba ca kia vẫn xanh trong khi hồ sơ nằm chết ở bước
     * TBP, không ai đưa đi đâu được.
     */
    expect(allowedActions('CHO_TBP_DUYET').sort()).toEqual(['TBP_RETURN', 'TBP_SIGN']);
  });

  it('TERMINAL còn đúng hai trạng thái kết thúc', () => {
    expect(TERMINAL).toEqual(['DA_XOA', 'QUA_HAN_DUYET']);
  });
});

describe('`0035` · Đã xoá cũng là trạng thái kết thúc', () => {
  it('không hành động nào đi ra khỏi Đã xoá', () => {
    expect(allowedActions('DA_XOA')).toEqual([]);
    for (const a of ACTIONS) {
      expect(() => go('DA_XOA', a, 'TDV')).toThrow(InvalidTransitionError);
    }
  });

  /**
   * Và không hành động nào ĐI VÀO nó, cũng có chủ ý.
   *
   * Đường tới `DA_XOA` là `DELETE /policies/:id`, không phải một nút trong dải
   * *Thao tác*. Thêm một luật ở đây sẽ làm `allowedActions('YEU_CAU_CHINH_SUA')`
   * mọc thêm một nút xoá đứng ngay cạnh "Gửi lại duyệt" — cạnh nhau đúng chỗ dễ
   * bấm nhầm nhất, mà xoá thì phải gõ lại mã hồ sơ mới chạy.
   */
  it('cũng không hành động nào đi VÀO Đã xoá', () => {
    for (const s of STATUSES) {
      for (const a of allowedActions(s)) {
        for (const v of ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'SYSTEM'] as const) {
          let toi: string | undefined;
          try {
            toi = go(s, a, v).next;
          } catch {
            continue;
          }
          expect(toi, `${s} + ${a} (${v}) không được dẫn tới DA_XOA`).not.toBe('DA_XOA');
        }
      }
    }
  });
});

describe('WF-18/19 · yêu cầu in lại là ngoại lệ duy nhất không phải ký lại', () => {
  it('từ Chờ KT L2 quay về Sale Admin, không về Bước 3', () => {
    const r = go('CHO_KT_L2', 'KT_REQUEST_REPRINT', 'KE_TOAN', 'ban cung mo chu');
    expect(r.next).toBe('SA_DANG_XU_LY');
    expect(r.createsNewVersion).toBe(false);   // KHÔNG tạo phiên bản mới
  });
  it('sau khi làm lại bản cứng thì quay lại Chờ KT L2 mà không cần ký số', () => {
    const r = go('SA_DANG_XU_LY', 'SA_HANDOVER', 'SALE_ADMIN');
    expect(r.next).toBe('CHO_KT_L2');
  });
  it('yêu cầu in lại vẫn bắt buộc nhập lý do', () => {
    expect(() => go('CHO_KT_L2', 'KT_REQUEST_REPRINT', 'KE_TOAN')).toThrow(ReasonRequiredError);
  });
});

/**
 * `0185` — HOÀN DUYỆT: Trưởng bộ phận rút lại chữ ký của chính mình.
 *
 * Khách hàng chốt 07/09: TBP làm được thao tác này ở mọi trạng thái TRỪ *Chờ TBP
 * duyệt*, *Đang có hiệu lực*, *Nháp* và *Yêu cầu chỉnh sửa* — và trong phạm vi
 * *"CSBH đang trong luồng duyệt"*. Hai câu ghép lại ra đúng ba trạng thái.
 */
describe('`0185` · Hoàn duyệt của Trưởng bộ phận', () => {
  it.each(['CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2'] as const)(
    'từ %s về Yêu cầu chỉnh sửa, tạo phiên bản mới',
    (from) => {
      const r = go(from, 'TBP_RECALL', 'TBP', 'ky nham ho so');
      expect(r.next).toBe('YEU_CAU_CHINH_SUA');
      expect(r.createsNewVersion, 'phải đi lại toàn bộ vòng duyệt, kể cả ký số').toBe(true);
      expect(r.stamp).toBe('returned');
    },
  );

  it.each(['CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2'] as const)(
    '%s · thiếu lý do thì bị chặn',
    (from) => {
      expect(() => go(from, 'TBP_RECALL', 'TBP')).toThrow(ReasonRequiredError);
      expect(() => go(from, 'TBP_RECALL', 'TBP', '  ')).toThrow(ReasonRequiredError);
    },
  );

  it.each(['NHAP', 'CHO_TBP_DUYET', 'YEU_CAU_CHINH_SUA', 'DANG_CO_HIEU_LUC',
           'HET_HIEU_LUC', 'QUA_HAN_DUYET', 'DA_XOA'] as const)(
    'KHÔNG làm được ở %s',
    (from) => {
      expect(() => go(from, 'TBP_RECALL', 'TBP', 'x')).toThrow(InvalidTransitionError);
    },
  );

  it('CHỈ Trưởng bộ phận — ba vai trò kia đều bị chặn', () => {
    for (const v of ['TDV', 'KE_TOAN', 'SALE_ADMIN'] as const) {
      expect(() => go('SA_DANG_XU_LY', 'TBP_RECALL', v, 'x')).toThrow(ForbiddenRoleError);
    }
  });

  /**
   * LỖ HỔNG CÓ SẴN, lộ ra vì `0185` là cạnh ĐẦU TIÊN làm hai hành động của hai
   * vai trò cùng đi tới một đích từ cùng một trạng thái.
   *
   * Trước `0185`, `transition` tra luật bằng `(from, to, by)` — không có tên
   * hành động trong đó. Phép ấy luôn ra đúng một kết quả **chỉ vì** mỗi cặp
   * `(from, to)` có đúng một hành động. Thêm `TBP_RECALL` vào `CHO_KT_L1` là ở
   * đó có hai: `KT_RETURN_L1` (Kế toán) và `TBP_RECALL` (TBP), cùng về
   * `YEU_CAU_CHINH_SUA`.
   *
   * Hệ quả đo được trước khi sửa: `transition('CHO_KT_L1', 'KT_RETURN_L1',
   * 'TBP')` **đi qua** — Trưởng bộ phận thực hiện được hành động của Kế toán —
   * và `allowedActionsFor` bày ra đúng nút ấy cho cả hai người.
   */
  it('KHÔNG lẫn với hành động cùng đích của vai trò khác', () => {
    // TBP không mượn được đường của Kế toán…
    expect(() => go('CHO_KT_L1', 'KT_RETURN_L1', 'TBP', 'x')).toThrow(ForbiddenRoleError);
    expect(() => go('CHO_KT_L2', 'KT_RETURN_L2', 'TBP', 'x')).toThrow(ForbiddenRoleError);
    // …và Kế toán không mượn được đường của TBP.
    expect(() => go('CHO_KT_L1', 'TBP_RECALL', 'KE_TOAN', 'x')).toThrow(ForbiddenRoleError);

    // Và danh sách NÚT của mỗi người chỉ có hành động của chính họ.
    expect(allowedActionsFor('CHO_KT_L1', 'TBP')).toEqual(['TBP_RECALL']);
    expect(allowedActionsFor('CHO_KT_L1', 'KE_TOAN').sort()).toEqual([
      'KT_RECEIVE_L1',
      'KT_RETURN_L1',
    ]);
  });

  /**
   * Chốt chặn cho chính lớp lỗi trên: mỗi luật phải khai đúng hành động của nó,
   * và bảng `ACTION_OF` phải khớp với `RULES` cả hai chiều.
   *
   * Hai bảng ấy là hai bản mô tả của cùng một máy trạng thái, nên chúng trôi
   * khỏi nhau được — và lượt trôi đầu tiên đã là một lỗ hổng phân quyền.
   */
  it('mọi hành động có luật, và luật khai đúng `from`/`to` của hành động ấy', () => {
    for (const a of ACTIONS) {
      const luat = RULES.filter((r) => r.action === a);
      expect(luat.length, `${a} không có luật nào`).toBeGreaterThan(0);
      for (const r of luat) {
        expect(ACTION_OF[a].from, `${a}: luật khai from=${r.from}`).toContain(r.from);
        expect(r.to, `${a}: luật khai to=${r.to}`).toBe(ACTION_OF[a].to);
      }
      // Chiều ngược: mọi `from` khai ở `ACTION_OF` phải có một luật thật.
      for (const f of ACTION_OF[a].from) {
        expect(luat.some((r) => r.from === f), `${a}: ACTION_OF khai ${f} mà không có luật`).toBe(true);
      }
    }
  });
});

describe('WF-15/23 · chuyển bước không hợp lệ', () => {
  it('Sale Admin không bỏ qua được bước tiếp nhận L1', () => {
    expect(() => go('CHO_KT_L1', 'SA_HANDOVER', 'SALE_ADMIN')).toThrow(InvalidTransitionError);
  });
  it('lỗi nêu rõ trạng thái hiện tại và danh sách hành động được phép', () => {
    try {
      go('CHO_KT_L1', 'SA_HANDOVER', 'SALE_ADMIN');
      throw new Error('đáng lẽ phải lỗi');
    } catch (e) {
      const err = e as InvalidTransitionError;
      expect(err.code).toBe('INVALID_TRANSITION');
      expect(err.current).toBe('CHO_KT_L1');
      /*
       * BA hành động từ `0185`: *Hoàn duyệt* của Trưởng bộ phận đứng cạnh hai
       * hành động của Kế toán.
       *
       * Danh sách này KHÔNG xét vai trò — có chủ ý (xem `allowedActions`): câu
       * `INVALID_TRANSITION` nói về TRẠNG THÁI, và người đọc cần biết hồ sơ ở
       * đây còn đi tiếp được bằng gì, kể cả bằng tay người khác.
       */
      expect(err.allowed.sort()).toEqual(['KT_RECEIVE_L1', 'KT_RETURN_L1', 'TBP_RECALL']);
    }
  });
});

describe('AUTH-13/14 · vai trò không được phép', () => {
  it('Ban lãnh đạo không có bất kỳ hành động ghi nào', () => {
    for (const s of STATUSES) {
      for (const a of allowedActions(s)) {
        expect(() => go(s, a, 'BAN_LANH_DAO', 'x')).toThrow();
      }
    }
  });
  it('Quản trị hệ thống không tham gia luồng duyệt', () => {
    expect(() => go('CHO_TBP_DUYET', 'TBP_SIGN', 'QUAN_TRI')).toThrow(ForbiddenRoleError);
  });
  it('TDV không tự ký duyệt hồ sơ của mình', () => {
    expect(() => go('CHO_TBP_DUYET', 'TBP_SIGN', 'TDV')).toThrow(ForbiddenRoleError);
  });
});

describe('WF-26 · luồng tuần tự, không có bước nào song song', () => {
  it('mỗi hành động chỉ dẫn tới đúng một trạng thái đích', () => {
    const seen = new Map<string, string>();
    for (const s of STATUSES) {
      for (const a of allowedActions(s)) {
        const key = `${s}|${a}`;
        expect(seen.has(key)).toBe(false);
        seen.set(key, 'x');
      }
    }
  });
});

describe('NTF-10 · `0047` Quá hạn duyệt là trạng thái KẾT THÚC, vẫn nhớ bước chết', () => {
  it('bốn trạng thái chờ đều quá hạn được và lưu lại bước cũ', () => {
    expect(WAITING).toHaveLength(4);
    for (const s of WAITING) {
      const r = markOverdue(s);
      expect(r.next).toBe('QUA_HAN_DUYET');
      // `pending_step` VẪN lưu, dù `0047` đã bỏ việc định tuyến theo nó: nó là
      // câu trả lời duy nhất cho "hồ sơ chết ở bước nào", thứ phải có trong thư
      // báo và trong nhật ký.
      expect(r.pendingStep).toBe(s);
    }
  });

  it('trạng thái không phải chờ thì không quá hạn được', () => {
    expect(() => markOverdue('DANG_CO_HIEU_LUC')).toThrow(InvalidTransitionError);
    expect(() => markOverdue('DA_XOA')).toThrow(InvalidTransitionError);
  });

  it('KHÔNG hành động nào đi ra khỏi Quá hạn duyệt, với BẤT KỲ vai trò nào', () => {
    /*
     * Đảo ngược NTF-11 (`0047`). Trước đó hồ sơ quá hạn đi tiếp đúng nhánh cũ,
     * nên máy trạng thái không cần luật nào từ `QUA_HAN_DUYET` — lớp trên gỡ
     * nhãn ra rồi mới hỏi. Giờ không còn ai gỡ nhãn nữa, và tính chất "không có
     * đường ra" phải được khẳng định thẳng ở đây.
     */
    expect(allowedActions('QUA_HAN_DUYET')).toEqual([]);
    for (const vt of ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO', 'QUAN_TRI'] as const) {
      expect(allowedActionsFor('QUA_HAN_DUYET', vt), `${vt} còn thao tác được`).toEqual([]);
    }
  });
});

describe('EFF-01 · vô hiệu bản cũ', () => {
  it('chỉ hệ thống chuyển Đang có hiệu lực sang Hết hiệu lực', () => {
    expect(go('DANG_CO_HIEU_LUC', 'SUPERSEDE', 'SYSTEM').next).toBe('HET_HIEU_LUC');
    expect(() => go('DANG_CO_HIEU_LUC', 'SUPERSEDE', 'TDV')).toThrow(ForbiddenRoleError);
  });
});

describe('WF-22 · không có nghiệp vụ thu hồi', () => {
  it('không hành động nào tên là thu hồi', () => {
    expect(ACTIONS as readonly string[]).not.toContain('RECALL');
    expect(ACTIONS as readonly string[]).not.toContain('WITHDRAW');
  });
});
