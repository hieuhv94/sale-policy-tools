/**
 * `0136` — `ngayIso()`: kiểm NGÀY, không kiểm độ dài chuỗi.
 *
 * Khách hàng báo: *"nội dung lỗi khi nhập sai format hoặc sai giá trị ngày tháng
 * năm đang hiện không đúng hoặc không rõ"*. Đọc mã thì thấy nguyên nhân — năm
 * chỗ cần ngày đều tự viết `str(10, 10)`:
 *
 *   - câu lỗi là *"phải có tối thiểu 10 ký tự"* — nói về ĐỘ DÀI CHUỖI với một
 *     người đang nhập một cái ngày;
 *   - `'khong-phai'` đúng mười ký tự nên nó ĐI QUA, rồi Postgres từ chối và
 *     người dùng nhận HTTP 500;
 *   - `'2026-02-31'` cũng đi qua, và tháng Hai không có ngày 31.
 */
import { describe, expect, it } from 'vitest';
import { ngayIso, opt } from './validate.js';

/** Câu lỗi mà người dùng sẽ đọc, lấy từ `BadRequestException`. */
const cauLoi = (v: unknown): string => {
  try {
    ngayIso().parse(v, 'appliedDate');
    return '';
  } catch (e) {
    const r = (e as { response?: { message?: string } }).response;
    return r?.message ?? String(e);
  }
};

describe('`0136` ngày hợp lệ thì đi qua', () => {
  it('nhận đúng dạng năm-tháng-ngày, và trả lại nguyên chuỗi', () => {
    for (const d of ['2026-08-27', '2024-02-29', '2000-01-01', '2026-12-31']) {
      expect(ngayIso().parse(d, 'appliedDate')).toBe(d);
    }
  });

  it('cắt khoảng trắng thừa, như mọi bộ kiểm chuỗi khác', () => {
    expect(ngayIso().parse('  2026-08-27  ', 'appliedDate')).toBe('2026-08-27');
  });

  it('`opt()` vẫn cho bỏ trống — ô ngày không bắt buộc thì gửi chuỗi rỗng', () => {
    expect(opt(ngayIso()).parse('', 'on')).toBeUndefined();
    expect(opt(ngayIso()).parse(undefined, 'on')).toBeUndefined();
  });
});

describe('`0136` ngày sai bị chặn Ở CỬA, không để Postgres nhận', () => {
  it('chuỗi mười ký tự KHÔNG phải ngày — thứ `str(10, 10)` cho lọt', () => {
    /*
     * Ca đáng giá nhất. Đây là đường sinh ra HTTP 500: chuỗi qua cửa, đi thẳng
     * vào `WHERE effective_from = $1`, Postgres ném `22007`, và người dùng đọc
     * "lỗi máy chủ" cho một chuỗi chính họ gõ sai.
     */
    for (const d of ['khong-phai', '27/08/2026', '2026-8-27x', 'aaaa-bb-cc']) {
      expect(() => ngayIso().parse(d, 'appliedDate'), d).toThrow();
    }
  });

  it('ngày KHÔNG CÓ THẬT trên lịch bị chặn', () => {
    /*
     * `new Date('2026-02-31')` KHÔNG ném lỗi — nó lặng lẽ trôi sang 03/03. Nên
     * khớp biểu thức chính quy là chưa đủ; phải dựng ngày rồi in ngược ra so
     * lại. 2026 không phải năm nhuận, nên 29/02/2026 cũng là ngày không có.
     */
    for (const d of ['2026-02-31', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31']) {
      expect(() => ngayIso().parse(d, 'appliedDate'), d).toThrow();
    }
  });

  it('năm nhuận thì 29/02 vẫn hợp lệ — không chặn quá tay', () => {
    // Chiều đối chiếu: một phép kiểm chặn hết thì cũng "không có ngày sai nào
    // lọt", và ca trên vẫn xanh.
    expect(ngayIso().parse('2024-02-29', 'appliedDate')).toBe('2024-02-29');
  });
});

describe('`0136` câu lỗi nói về NGÀY, không nói về độ dài chuỗi', () => {
  it('không câu nào nhắc tới "ký tự"', () => {
    /*
     * Đây là chính lời phàn nàn của khách hàng. Câu lỗi đi vào dòng phụ của hộp
     * thoại lỗi (`0088`), nên nó là thứ người dùng đọc khi câu chính chưa đủ.
     */
    for (const d of ['khong-phai', '2026-02-31', '', '2026-8-2']) {
      expect(cauLoi(d), `"${d}" → ${cauLoi(d)}`).not.toContain('ký tự');
    }
  });

  it('phân biệt SAI DẠNG với NGÀY KHÔNG CÓ THẬT — hai câu khác nhau', () => {
    /*
     * Hai lỗi khác nhau cần hai câu khác nhau: `27/08/2026` là gõ đúng ngày
     * nhưng sai thứ tự, còn `2026-02-31` là gõ đúng thứ tự nhưng ngày không tồn
     * tại. Một câu chung cho cả hai bắt người dùng tự đoán mình sai kiểu gì.
     */
    expect(cauLoi('27/08/2026')).toContain('dạng');
    expect(cauLoi('2026-02-31')).toContain('có thật');
    expect(cauLoi('27/08/2026')).not.toBe(cauLoi('2026-02-31'));
  });
});
