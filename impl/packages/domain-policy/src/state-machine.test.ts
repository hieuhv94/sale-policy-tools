/** WF — luồng duyệt và chuyển trạng thái (YCNV §3, §4). */
import { describe, expect, it } from 'vitest';
import {
  ACTIONS, allowedActions, ForbiddenRoleError, InvalidTransitionError, markOverdue,
  ReasonRequiredError, resumeFromOverdue, STATUSES, TERMINAL, transition, WAITING,
  type Action, type Status,
} from './state-machine.js';

const go = (current: Status, action: Action, role: Parameters<typeof transition>[0]['role'],
            reason?: string) => transition({ current, action, role, reason });

describe('WF-02/03 · bộ trạng thái là danh sách đóng', () => {
  it('đúng 11 trạng thái', () => {
    expect(STATUSES).toHaveLength(11);
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
    s = go(s, 'TBP_SIGN', 'TBP').next;               expect(s).toBe('TBP_DA_KY_SO');
    s = go(s, 'PUBLISH_SIGNED', 'SYSTEM').next;      expect(s).toBe('CHO_KT_L1');
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

describe('WF-08 · Từ chối là trạng thái kết thúc', () => {
  it('TBP từ chối cần lý do', () => {
    expect(() => go('CHO_TBP_DUYET', 'TBP_REJECT', 'TBP')).toThrow(ReasonRequiredError);
  });
  it('không hành động nào đi ra khỏi Từ chối', () => {
    expect(allowedActions('TU_CHOI')).toEqual([]);
    for (const a of ACTIONS) {
      expect(() => go('TU_CHOI', a, 'TDV')).toThrow(InvalidTransitionError);
    }
  });
  it('TERMINAL đúng bằng một trạng thái', () => {
    expect(TERMINAL).toEqual(['TU_CHOI']);
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
      expect(err.allowed.sort()).toEqual(['KT_RECEIVE_L1', 'KT_RETURN_L1']);
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

describe('NTF-10/11 · Quá hạn duyệt là lớp phủ, nhớ bước đang chờ', () => {
  it('bốn trạng thái chờ đều quá hạn được và lưu lại bước cũ', () => {
    expect(WAITING).toHaveLength(4);
    for (const s of WAITING) {
      const r = markOverdue(s);
      expect(r.next).toBe('QUA_HAN_DUYET');
      expect(r.pendingStep).toBe(s);
      expect(resumeFromOverdue(r.pendingStep)).toBe(s);   // đi tiếp đúng nhánh cũ
    }
  });
  it('trạng thái không phải chờ thì không quá hạn được', () => {
    expect(() => markOverdue('DANG_CO_HIEU_LUC')).toThrow(InvalidTransitionError);
    expect(() => markOverdue('TU_CHOI')).toThrow(InvalidTransitionError);
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
