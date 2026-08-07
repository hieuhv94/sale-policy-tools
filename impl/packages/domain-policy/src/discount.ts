/**
 * Công thức tính của YCNV §7. Logic thuần, không chạm CSDL, không chạm mạng —
 * nhờ vậy chạy được hàng nghìn lần trong vài giây và không cần hạ tầng nào.
 */
import { divRoundHalfUp, type Rate2, type Vnd } from './money.js';

export interface LineInput {
  /** Giá bán Công ty — cũng chính là giá bán lẻ niêm yết. Đóng băng khi gửi duyệt. */
  companyPrice: Vnd;
  /** Giá bán buôn — người đề nghị nhập. */
  wholesalePrice: Vnd;
  /** CPBH1–4: số tiền VNĐ, KHÔNG phải tỷ lệ (§7). */
  cpbh1: Vnd; cpbh2: Vnd; cpbh3: Vnd; cpbh4: Vnd;
  /** Ngưỡng lấy từ bảng Chiết khấu quy định, đơn vị Rate2. */
  threshold?: Rate2 | undefined;
}

export interface LineResult {
  cpbhTotal: Vnd;
  netPrice: Vnd;
  /** Tỷ lệ ĐÃ làm tròn 2 chữ số, dạng số nguyên. Ghi đúng một lần, không tính lại. */
  discountRate: Rate2;
  overThreshold: boolean;
  /** Giá thu về âm: cảnh báo nhưng vẫn cho lưu nháp (§7). */
  negativeNetPrice: boolean;
}

export class InvalidLineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'InvalidLineError';
  }
}

export function computeLine(input: LineInput): LineResult {
  const { companyPrice, wholesalePrice, cpbh1, cpbh2, cpbh3, cpbh4 } = input;

  if (companyPrice <= 0n) {
    throw new InvalidLineError(
      'COMPANY_PRICE_REQUIRED',
      'Giá bán Công ty phải lớn hơn 0 — không có phép chia cho 0',
    );
  }
  for (const [name, v] of Object.entries({ wholesalePrice, cpbh1, cpbh2, cpbh3, cpbh4 })) {
    if (v < 0n) throw new InvalidLineError('NEGATIVE_AMOUNT', `${name} không được âm`);
  }

  const cpbhTotal = cpbh1 + cpbh2 + cpbh3 + cpbh4;
  const netPrice = wholesalePrice - cpbhTotal;

  // (Giá bán Công ty − Giá thu về) / Giá bán Công ty × 100, làm tròn 2 chữ số.
  // Nhân 10000 trước khi chia để phép làm tròn xảy ra ĐÚNG MỘT LẦN, ngay tại đây.
  const scaled = divRoundHalfUp((companyPrice - netPrice) * 10_000n, companyPrice);
  const discountRate = Number(scaled);

  return {
    cpbhTotal,
    netPrice,
    discountRate,
    // So sánh SAU KHI đã làm tròn, nên con số hiện ra và con số so ngưỡng là một.
    overThreshold: input.threshold !== undefined && discountRate > input.threshold,
    negativeNetPrice: netPrice < 0n,
  };
}
