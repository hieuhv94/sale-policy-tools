/**
 * `0138` — CÔNG NỢ là một ĐIỀU KHOẢN, không phải số tiền.
 *
 * Tệp thuần: gọi `cauNo()` và đối chiếu hai bảng câu chữ, không dựng ứng dụng,
 * không chạm CSDL.
 *
 * Ba lựa chọn khách hàng chốt 27/08, và lựa chọn thứ ba cho gõ tự do:
 *
 *   1. Thanh toán sau khi nhận hàng
 *   2. Thanh toán gối đơn, công nợ không quá 90 ngày
 *   3. Khác — người dùng tự nhập nội dung
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAU_DIEU_KHOAN,
  DIEU_KHOAN_NO,
  cauNo,
  loiDieuKhoan,
} from '../../services/customer/src/customers/dieu-khoan.js';
import {
  DIEU_KHOAN_NO as DIEU_KHOAN_WEB,
  NHAN_DIEU_KHOAN_NO,
} from '../../apps/web/src/lib/danh-muc.js';

describe('`0138` ba phương án, và chỉ ba', () => {
  it('mã và câu chữ đúng như khách hàng chốt', () => {
    expect([...DIEU_KHOAN_NO]).toEqual(['SAU_NHAN_HANG', 'GOI_DON_90', 'KHAC']);
    expect(CAU_DIEU_KHOAN.SAU_NHAN_HANG).toBe('Thanh toán sau khi nhận hàng');
    expect(CAU_DIEU_KHOAN.GOI_DON_90).toBe('Thanh toán gối đơn, công nợ không quá 90 ngày');
  });

  it('BẢNG CỦA GIAO DIỆN khớp bảng của máy chủ', () => {
    /*
     * Hai bản sao có chủ ý: máy chủ dựng sẵn câu chữ để `policy` và `document`
     * chỉ thấy một chuỗi, còn giao diện phải biết ba phương án vì nó VẼ Ô CHỌN.
     * Cùng lối với bảng quyền của `can.ts` — chấp nhận bản sao, nhưng có người
     * canh, nên lệch là đỏ chứ không lặng lẽ.
     *
     * Nhãn *Khác* được phép khác: giao diện thêm chữ *(tự nhập)* để nói trước
     * điều gì sắp xảy ra khi chọn nó, và chữ ấy KHÔNG đi vào dữ liệu.
     */
    expect([...DIEU_KHOAN_WEB]).toEqual([...DIEU_KHOAN_NO]);
    for (const k of ['SAU_NHAN_HANG', 'GOI_DON_90'] as const) {
      expect(NHAN_DIEU_KHOAN_NO[k], k).toBe(CAU_DIEU_KHOAN[k]);
    }
    expect(NHAN_DIEU_KHOAN_NO.KHAC).toContain('Khác');
  });
});

describe('`0138` dựng câu chữ để in ra tờ CSBH', () => {
  it('hai phương án đầu lấy câu sẵn, bỏ qua ghi chú', () => {
    expect(cauNo('SAU_NHAN_HANG', null)).toBe('Thanh toán sau khi nhận hàng');
    // Ghi chú kèm phương án 1 là dữ liệu KHÔNG hợp lệ (`assertDieuKhoan` chặn),
    // nhưng nếu nó lọt vào CSDL bằng đường nào đó thì câu in ra vẫn phải đúng.
    expect(cauNo('GOI_DON_90', 'rác')).toBe('Thanh toán gối đơn, công nợ không quá 90 ngày');
  });

  it('*Khác* in ra ĐÚNG câu người dùng gõ', () => {
    expect(cauNo('KHAC', '  Trả trước 30%, phần còn lại sau 60 ngày  ')).toBe(
      'Trả trước 30%, phần còn lại sau 60 ngày',
    );
  });

  it('*Khác* mà rỗng thì trả CHUỖI RỖNG, không trả chữ "Khác"', () => {
    /*
     * *Khác* không phải một điều khoản — nó là một chỗ để gõ điều khoản. In chữ
     * "Khác" lên tờ giấy hai bên ký là in ra một câu không nói gì, và tệ hơn ô
     * trống vì ô trống thì người đọc biết là thiếu.
     */
    expect(cauNo('KHAC', null)).toBe('');
    expect(cauNo('KHAC', '   ')).toBe('');
  });

  it('mã LẠ trả về chính mã ấy, không trả rỗng', () => {
    /*
     * Dữ liệu cũ, hoặc một mã ai đó thêm mà quên khai câu. Ô trống trên bản in
     * đọc như lỗi hiển thị; thấy `GOI_DON_120` thì người đọc biết ngay phải đi
     * hỏi ai.
     */
    expect(cauNo('GOI_DON_120', null)).toBe('GOI_DON_120');
    expect(cauNo(null, null)).toBe('');
  });
});

describe('`0138` luật HAI CHIỀU của ô ghi rõ nội dung', () => {
  it('chọn *Khác* mà bỏ trống thì bị chặn, và lỗi chỉ vào ĐÚNG ô', () => {
    const l = loiDieuKhoan('KHAC', '   ');
    expect(l?.code).toBe('DEBT_NOTE_REQUIRED');
    // `field` là thứ giao diện dùng để đặt câu lỗi ngay dưới ô nhập (`0088`).
    expect(l?.field).toBe('debtNote');
  });

  it('chọn phương án 1 hoặc 2 mà VẪN gõ nội dung thì cũng bị chặn', () => {
    /*
     * Chiều thứ hai, và nó là chiều dễ bỏ quên. Không chặn thì dòng vừa gõ
     * không đi đâu cả — không lên màn hình, không ra bản in — mà người gõ tin
     * rằng nó có. Nuốt im lặng tệ hơn một câu lỗi.
     */
    for (const t of ['SAU_NHAN_HANG', 'GOI_DON_90']) {
      expect(loiDieuKhoan(t, 'ghi thêm')?.code, t).toBe('DEBT_NOTE_NOT_ALLOWED');
    }
  });

  it('bốn tổ hợp HỢP LỆ thì không chặn gì', () => {
    expect(loiDieuKhoan('SAU_NHAN_HANG', undefined)).toBeNull();
    expect(loiDieuKhoan('GOI_DON_90', '')).toBeNull();
    expect(loiDieuKhoan('KHAC', 'Trả sau 45 ngày')).toBeNull();
    // Lượt sửa KHÔNG đụng tới điều khoản: không kiểm gì cả.
    expect(loiDieuKhoan(undefined, undefined)).toBeNull();
  });

  it('hai mã lỗi đều đã khai câu ở giao diện (`0088`)', () => {
    const loi = readFileSync('apps/web/src/lib/loi.ts', 'utf8');
    for (const m of ['DEBT_NOTE_REQUIRED', 'DEBT_NOTE_NOT_ALLOWED']) {
      expect(loi, m).toContain(m);
    }
  });
});

describe('`0138` không còn chỗ nào coi công nợ là tiền', () => {
  const doc = (p: string) => readFileSync(p, 'utf8');

  it('`ho_so.cong_no` định dạng CHỮ, không phải `money_vnd`', () => {
    /*
     * `applyFormat` với `money_vnd` phân nhóm hàng nghìn — chạy trên một câu
     * chữ thì nó không ném lỗi, chỉ ra một chuỗi lạ. Đúng kiểu hỏng im lặng mà
     * chỉ bản in mới thấy.
     */
    const s = doc('services/document/src/contracts/sources.ts');
    expect(s).toMatch(/'ho_so\.cong_no':\s*'text'/);
    expect(s).not.toMatch(/'ho_so\.cong_no':\s*'money_vnd'/);
  });

  it('ba mẫu văn bản thôi in chữ *đồng* sau công nợ', () => {
    // Câu cũ là "Công nợ tại thời điểm lập: {{ho_so.cong_no}} đồng". Giữ nguyên
    // thì tờ CSBH in ra "Thanh toán sau khi nhận hàng đồng".
    const s = doc('scripts/tao-mau-ho-so.ts');
    expect(s).not.toMatch(/\{\{ho_so\.cong_no\}\}\s*đồng/);
    expect(s).toContain('Điều khoản thanh toán: {{ho_so.cong_no}}');
  });

  it('cột `debt` cũ đã gỡ khỏi lược đồ, và ảnh chụp đổi sang chữ', () => {
    const m = doc('db/migrations/0106_cong_no_la_dieu_khoan.sql');
    expect(m).toMatch(/DROP COLUMN IF EXISTS debt\b/);
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS debt_term/);
    expect(m).toMatch(/ALTER COLUMN kh_cong_no_snap TYPE text/);
  });

  it('giao diện thôi gọi `tien()` cho công nợ', () => {
    /*
     * Hai màn hình hiện nó: chi tiết khách hàng và chi tiết hồ sơ. `tien()` trên
     * một câu chữ ra `NaN` hoặc chuỗi rỗng tuỳ chỗ — và không màn hình nào đỏ.
     */
    for (const p of ['apps/web/src/pages/KhachHang.tsx', 'apps/web/src/pages/ChiTietHoSo.tsx']) {
      expect(doc(p), p).not.toMatch(/tien\((kh\.debt|kh\.congNo)\)/);
    }
  });
});
