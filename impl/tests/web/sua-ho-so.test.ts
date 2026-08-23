/**
 * Điều kiện SỬA ĐƯỢC của hồ sơ.
 *
 * Cái cần bắt ở đây: giao diện không được giữ một bản sao của danh sách trạng
 * thái sửa được. Máy trạng thái nằm ở `@csbh/domain-policy` và `EDITABLE` ở
 * `policies.service.ts`; chép sang giao diện là thêm một bản sao phải giữ đồng
 * bộ, và nó sẽ lệch vào ngày ai đó thêm một trạng thái.
 *
 * Cách suy: hồ sơ nào sửa được thì `allowed-actions` của máy chủ có `SUBMIT`
 * hoặc `RESUBMIT_AFTER_EDIT` — hai hành động chỉ tồn tại ở đúng hai trạng thái
 * đó.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { suaDuoc } from '@csbh/web/sua-ho-so';

describe('suy "sửa được" từ câu trả lời của máy chủ', () => {
  it('hồ sơ Nháp — có SUBMIT', () => {
    expect(suaDuoc(['SUBMIT'])).toBe(true);
  });

  it('hồ sơ bị trả lại — có RESUBMIT_AFTER_EDIT', () => {
    expect(suaDuoc(['RESUBMIT_AFTER_EDIT'])).toBe(true);
  });

  it('hồ sơ đang chờ người khác duyệt — KHÔNG sửa được', () => {
    expect(suaDuoc(['TBP_SIGN', 'TBP_RETURN', 'TBP_REJECT'])).toBe(false);
    expect(suaDuoc(['KT_RECEIVE_L1', 'KT_RETURN_L1'])).toBe(false);
    expect(suaDuoc(['SA_HANDOVER'])).toBe(false);
  });

  it('không hành động nào — không sửa được', () => {
    expect(suaDuoc([])).toBe(false);
  });
});

describe('phép suy khớp đúng máy trạng thái của máy chủ', () => {
  /** Đọc bảng chuyển trạng thái thật, không tin vào trí nhớ. */
  const doiChieu = () => {
    const ma = readFileSync('packages/domain-policy/src/state-machine.ts', 'utf8');
    const bang = /const ACTION_OF: Record<Action, \{ from: Status\[\]; to: Status \}> = \{([\s\S]*?)\n\};/.exec(ma);
    expect(bang, 'không đọc được ACTION_OF').not.toBeNull();
    const tu: Record<string, string[]> = {};
    for (const d of bang![1]!.split('\n')) {
      const m = /^\s*([A-Z_]+):\s*\{ from: \[([^\]]*)\]/.exec(d);
      if (m) tu[m[1]!] = [...m[2]!.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]!);
    }
    return tu;
  };

  const SUA_DUOC = ['NHAP', 'YEU_CAU_CHINH_SUA'];

  it('hành động đi RA TỪ trạng thái sửa được đúng là hai mã đang dùng', () => {
    // Khẳng định chính. Thêm một hành động mới đi ra từ NHAP ở máy chủ mà quên
    // ở đây thì `suaDuoc` vẫn đúng — nhưng ĐỔI trạng thái nguồn của SUBMIT thì
    // giao diện ngừng hiện nút sửa mà không lỗi nào báo.
    const tu = doiChieu();
    const raTuSuaDuoc = Object.entries(tu)
      .filter(([, from]) => from.some((s) => SUA_DUOC.includes(s)))
      .map(([a]) => a)
      .sort();
    expect(raTuSuaDuoc).toEqual(['RESUBMIT_AFTER_EDIT', 'SUBMIT']);
  });

  it('mỗi mã đi ra từ đúng một trạng thái sửa được', () => {
    const tu = doiChieu();
    expect(tu['SUBMIT']).toEqual(['NHAP']);
    expect(tu['RESUBMIT_AFTER_EDIT']).toEqual(['YEU_CAU_CHINH_SUA']);
  });

  /*
   * `0098` đổi cách ca này gác, vì thứ nó gác đã tự biến mất.
   *
   * Trước đó `policies.service.ts` khai một mảng chữ riêng và ca này đọc mảng ấy
   * bằng biểu thức chính quy để so với `SUA_DUOC` — một bản sao được canh chừng.
   * Từ `0098` nó KHÔNG còn bản sao nào: `EDITABLE` gán thẳng từ `SUA_DUOC`, nên
   * hai bên không lệch được nữa.
   *
   * Nên ca kiểm đổi câu hỏi: thay vì "hai mảng có bằng nhau không", nó hỏi "còn
   * ai khai lại danh sách ấy bằng chữ không". Quét cả `services/policy` chứ
   * không riêng một tệp — chỗ chép lại tiếp theo sẽ không nằm ở tệp cũ.
   */
  it('không service nào khai lại danh sách trạng thái sửa được bằng chữ', () => {
    const moiTep = (thuMuc: string): string[] =>
      readdirSync(thuMuc).flatMap((t) => {
        const d = join(thuMuc, t);
        return statSync(d).isDirectory() ? moiTep(d) : d.endsWith('.ts') ? [d] : [];
      });
    /*
     * TRÙNG HỢP CÓ LÝ DO, không phải bản sao.
     *
     * Hộp việc của TDV gồm đúng hai trạng thái ấy, nhưng vì một câu hỏi KHÁC:
     * *"hồ sơ nào đang nằm ở bàn tôi"*, không phải *"hồ sơ nào sửa được"*. Hai
     * câu ấy hôm nay cùng đáp án và ngày mai có thể không — `NHAP` rời khỏi hộp
     * việc thì `SUA_DUOC` không đổi. Gộp chúng lại là buộc hai luật rời nhau vào
     * một dây, đúng cái lỗi mà `0097` vừa gỡ ở `tepXoaDuoc`.
     */
    const TRUNG_CO_LY_DO = ['services/policy/src/policies/policies.service.ts'];
    const pham: string[] = [];
    for (const tep of moiTep('services/policy/src')) {
      if (TRUNG_CO_LY_DO.includes(tep)) continue;
      const s = readFileSync(tep, 'utf8');
      // Hai chuỗi đứng cạnh nhau trong cùng một mảng — đúng hình dạng của một
      // bản sao. Ghi chú và câu SQL không khớp mẫu này.
      if (/\[\s*'NHAP'\s*,\s*'YEU_CAU_CHINH_SUA'\s*\]/.test(s)) pham.push(tep);
    }
    expect(
      pham,
      `khai lại SUA_DUOC bằng chữ: ${pham.join(', ')} — nhập từ @csbh/domain-policy`,
    ).toEqual([]);
  });

  it('EDITABLE ở policy.service đọc thẳng từ SUA_DUOC', () => {
    const ma = readFileSync('services/policy/src/policies/policies.service.ts', 'utf8');
    expect(/const EDITABLE[^=]*=\s*SUA_DUOC;/.test(ma)).toBe(true);
    expect(ma).toContain('SUA_DUOC');
  });
});
