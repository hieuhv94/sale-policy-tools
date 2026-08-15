/**
 * Danh mục — phép quy đổi ngưỡng và các bảng tra.
 *
 * Ngưỡng chiết khấu lưu dưới dạng PHẦN VẠN (`int(0, 10_000)`, 10 000 = 100%) mà
 * người dùng nhập và đọc bằng phần trăm. Đây là loại lỗi tệ nhất trong cả hệ
 * thống: sai 100 lần thì không ai đọc ra ngay, và hậu quả là mọi dòng sản phẩm
 * đều bị đánh dấu vượt ngưỡng — hoặc không dòng nào bị đánh dấu cả.
 */
import { describe, expect, it } from 'vitest';
import {
  LOAI_GIA,
  LOAI_TRA_CUU,
  MUC_DANH_MUC,
  NHAN_LOAI_GIA,
  NHAN_TRA_CUU,
  NHAN_TRANG_THAI_SAN_PHAM,
  TRANG_THAI_SAN_PHAM,
  nguongTuPhanTram,
  phamViChietKhau,
  phanTramTuNguong,
  type QuyDinhChietKhau,
} from '@csbh/web/danh-muc';

const qd = (p: Partial<QuyDinhChietKhau>): QuyDinhChietKhau => ({
  id: 'q1',
  productGroupCode: null,
  customerType: null,
  channelCode: null,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  thresholdRate2: 2500,
  specificity: 0,
  ...p,
});

describe('quy đổi ngưỡng chiết khấu', () => {
  it('phần vạn ra phần trăm, hai chữ số thập phân', () => {
    expect(phanTramTuNguong(2500)).toBe('25.00');
    expect(phanTramTuNguong(10_000)).toBe('100.00');
    expect(phanTramTuNguong(0)).toBe('0.00');
  });

  it('giữ được phần lẻ mà máy chủ lưu được', () => {
    // 2 rưỡi phần vạn = 0.25%. Làm tròn về số nguyên phần trăm ở đây là vứt đi
    // độ chính xác mà CSDL vẫn giữ.
    expect(phanTramTuNguong(25)).toBe('0.25');
    expect(phanTramTuNguong(1)).toBe('0.01');
  });

  it('phần trăm về phần vạn là số NGUYÊN', () => {
    // Máy chủ khai `int(0, 10_000)` — gửi số thập phân là 400 ngay.
    expect(nguongTuPhanTram('25')).toBe(2500);
    expect(nguongTuPhanTram('25.5')).toBe(2550);
    expect(Number.isInteger(nguongTuPhanTram('33.333'))).toBe(true);
  });

  it('đi một vòng rồi về vẫn ra đúng con số', () => {
    for (const n of [0, 1, 25, 2500, 9999, 10_000]) {
      expect(nguongTuPhanTram(phanTramTuNguong(n))).toBe(n);
    }
  });

  it('không sinh ra giá trị ngoài khoảng máy chủ nhận', () => {
    expect(nguongTuPhanTram('100')).toBeLessThanOrEqual(10_000);
    expect(nguongTuPhanTram('0')).toBeGreaterThanOrEqual(0);
  });
});

describe('câu mô tả phạm vi áp dụng', () => {
  it('bỏ trống đọc ra "mọi", không đọc ra ô rỗng', () => {
    expect(phamViChietKhau(qd({}))).toBe('mọi nhóm sản phẩm · mọi loại khách');
  });

  it('điền đủ thì nêu đủ ba phần', () => {
    const s = phamViChietKhau(qd({ productGroupCode: 'SUA', customerType: 2, channelCode: 'BV' }));
    expect(s).toContain('nhóm SUA');
    expect(s).toContain('khách loại 2');
    expect(s).toContain('kênh BV');
  });

  it('loại khách 0 KHÔNG bị nhầm thành "mọi loại"', () => {
    // Bẫy kinh điển: `q.customerType ? ... : 'mọi loại'` cho ra "mọi loại" khi
    // giá trị là 0. Máy chủ chỉ nhận 1–3 nên 0 không hợp lệ, nhưng phép kiểm
    // phải là `=== null` chứ không phải kiểm giá trị falsy.
    expect(phamViChietKhau(qd({ customerType: 0 }))).toContain('khách loại 0');
  });
});

describe('các bảng tra cố định', () => {
  it('danh mục chỉ ĐẶT được một loại giá: Giá bán Công ty (CAT-03)', () => {
    // Giá bán lẻ niêm yết chính là Giá bán Công ty, nên chỉ còn đúng một. Giá
    // bán buôn không phải thuộc tính của sản phẩm — người đề nghị nhập nó trên
    // từng dòng của từng hồ sơ, khác nhau theo khách hàng (muc 6.1).
    expect([...LOAI_GIA]).toEqual(['GIA_BAN_CONG_TY']);

    // Bảng nhãn RỘNG HƠN danh sách đặt được, và đó là chủ ý: lịch sử giá có thể
    // còn dòng ghi trước lúc `GIA_BAN_BUON` rút khỏi danh mục, và bảng lịch sử
    // phải đọc ra chữ chứ không phải mã enum trần.
    for (const g of LOAI_GIA) expect(NHAN_LOAI_GIA[g]).toBeTruthy();
    expect(NHAN_LOAI_GIA['GIA_BAN_BUON']).toBeTruthy();
  });

  it('đúng hai trạng thái sản phẩm, đều có nhãn', () => {
    expect(Object.keys(NHAN_TRANG_THAI_SAN_PHAM).sort()).toEqual([...TRANG_THAI_SAN_PHAM].sort());
  });

  it('ba loại tra cứu khớp LOOKUP_KINDS của máy chủ', () => {
    expect([...LOAI_TRA_CUU]).toEqual(['province', 'hospital', 'channel']);
    expect(Object.keys(NHAN_TRA_CUU).sort()).toEqual([...LOAI_TRA_CUU].sort());
  });

  it('năm thẻ danh mục, khoá không trùng nhau', () => {
    expect(MUC_DANH_MUC).toHaveLength(5);
    expect(new Set(MUC_DANH_MUC.map((m) => m.khoa)).size).toBe(5);
  });

  it('thẻ Nhóm sản phẩm đứng TRƯỚC thẻ Sản phẩm', () => {
    // Thứ tự thẻ là thứ tự phụ thuộc: phải có nhóm mới tạo được sản phẩm. Người
    // quản trị mở màn hình lần đầu không biết điều đó.
    const i = (k: string) => MUC_DANH_MUC.findIndex((m) => m.khoa === k);
    expect(i('nhom')).toBeLessThan(i('san-pham'));
  });
});
