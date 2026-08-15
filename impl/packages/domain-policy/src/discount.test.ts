/** CALC — công thức tính và làm tròn (YCNV §7). Logic thuần, không cần hạ tầng. */
import { describe, expect, it } from 'vitest';
import { computeLine, InvalidLineError } from './discount.js';
import { formatRate2, formatVnd, rate2FromPercent } from './money.js';

const line = (o: Partial<Parameters<typeof computeLine>[0]> = {}) =>
  computeLine({
    companyPrice: 100_000n, wholesalePrice: 90_000n,
    cpbh: [], ...o,
  });

describe('CALC-01/03 · CPBH tổng và giá thu về', () => {
  it('CPBH tổng là tổng bốn khoản', () => {
    const r = line({ cpbh: [2000n, 1500n, 1000n, 500n] });
    expect(r.cpbhTotal).toBe(5000n);
  });
  it('giá thu về = giá bán buôn − CPBH tổng', () => {
    const r = line({ cpbh: [2000n, 1500n, 1000n, 500n] });
    expect(r.netPrice).toBe(85_000n);
  });
});

describe('CALC-05 · bộ số chuẩn của tài liệu', () => {
  it('GBCT 100.000 · GBB 90.000 · CPBH tổng 5.000 → thu về 85.000, tỷ lệ 15,00%', () => {
    const r = line({ cpbh: [5000n] });
    expect(r.netPrice).toBe(85_000n);
    expect(r.discountRate).toBe(1500);
    expect(formatRate2(r.discountRate)).toBe('15,00');
  });
});

describe('CALC-06/07/08 · làm tròn hai chữ số rồi mới so ngưỡng', () => {
  // Chọn bộ số cho ra đúng 12,345% trước khi làm tròn:
  // (C − N)/C = 0,12345 với C = 200.000 → C − N = 24.690
  it('tỷ lệ thô 12,345% làm tròn LÊN thành 12,35%', () => {
    const r = line({ companyPrice: 200_000n, wholesalePrice: 175_310n });
    expect(r.discountRate).toBe(1235);
    expect(formatRate2(r.discountRate)).toBe('12,35');
  });

  it('ngưỡng 12,34% · tỷ lệ thô 12,344% → làm tròn 12,34% → KHÔNG vượt', () => {
    // C − N = 24.688 → 12,344%
    const r = line({
      companyPrice: 200_000n, wholesalePrice: 175_312n,
      threshold: rate2FromPercent(12.34),
    });
    expect(r.discountRate).toBe(1234);
    expect(r.overThreshold).toBe(false);
  });

  it('ngưỡng 12,34% · tỷ lệ thô 12,345% → làm tròn 12,35% → VƯỢT', () => {
    const r = line({
      companyPrice: 200_000n, wholesalePrice: 175_310n,
      threshold: rate2FromPercent(12.34),
    });
    expect(r.discountRate).toBe(1235);
    expect(r.overThreshold).toBe(true);
  });

  it('bằng đúng ngưỡng thì KHÔNG tính là vượt', () => {
    const r = line({ cpbh: [5000n], threshold: rate2FromPercent(15) });
    expect(r.discountRate).toBe(1500);
    expect(r.overThreshold).toBe(false);
  });
});

describe('CALC-09 · con số hiển thị và con số so ngưỡng là MỘT', () => {
  it('giá trị đem so chính là giá trị đem hiển thị, không tính lại lần hai', () => {
    for (let extra = 0; extra < 500; extra++) {
      const r = line({
        companyPrice: 200_000n, wholesalePrice: BigInt(175_000 + extra),
        threshold: rate2FromPercent(12.34),
      });
      const hienThi = Number(formatRate2(r.discountRate).replace(',', '.'));
      const soSanh = r.discountRate / 100;
      expect(hienThi).toBe(soSanh);
      expect(r.overThreshold).toBe(r.discountRate > 1234);
    }
  });
});

describe('CALC-10 · giá bán Công ty không hợp lệ', () => {
  it('bằng 0 thì báo lỗi, không chia cho 0', () => {
    expect(() => line({ companyPrice: 0n })).toThrow(InvalidLineError);
  });
  it('âm cũng bị chặn', () => {
    expect(() => line({ companyPrice: -1n })).toThrow(InvalidLineError);
  });
  it('không bao giờ sinh NaN hay Infinity', () => {
    const r = line({ companyPrice: 1n, wholesalePrice: 0n });
    expect(Number.isFinite(r.discountRate)).toBe(true);
  });
});

describe('CALC-11 · giá thu về âm', () => {
  it('CPBH tổng lớn hơn giá bán buôn thì cảnh báo nhưng vẫn tính được', () => {
    const r = line({ wholesalePrice: 1000n, cpbh: [5000n] });
    expect(r.negativeNetPrice).toBe(true);
    expect(r.netPrice).toBe(-4000n);
  });
});

describe('CALC-12 · tiền luôn là số nguyên đồng', () => {
  it('mọi giá trị tiền trả về đều là bigint, không có phần thập phân', () => {
    const r = line({ cpbh: [5000n] });
    expect(typeof r.cpbhTotal).toBe('bigint');
    expect(typeof r.netPrice).toBe('bigint');
  });
  it('định dạng có dấu phân nhóm nghìn', () => {
    expect(formatVnd(1_234_567n)).toBe('1.234.567');
  });
});

describe('CALC-19 · kết quả ổn định', () => {
  it('chạy lại 1000 lần cùng đầu vào cho kết quả giống hệt — không sai số tích luỹ', () => {
    const first = line({ companyPrice: 199_999n, wholesalePrice: 123_457n, cpbh: [777n] });
    for (let i = 0; i < 1000; i++) {
      const r = line({ companyPrice: 199_999n, wholesalePrice: 123_457n, cpbh: [777n] });
      expect(r.discountRate).toBe(first.discountRate);
      expect(r.netPrice).toBe(first.netPrice);
    }
  });

  it('giá trị lớn vẫn chính xác — bigint không mất chữ số như số thực', () => {
    const r = line({ companyPrice: 999_999_999_999n, wholesalePrice: 500_000_000_000n });
    expect(r.discountRate).toBe(5000);
  });
});
