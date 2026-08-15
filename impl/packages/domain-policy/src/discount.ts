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
  /**
   * Các khoản chi phí bán hàng: số tiền VNĐ, KHÔNG phải tỷ lệ (§7).
   *
   * SỐ LƯỢNG TUỲ DÒNG, không cố định bốn. Mỗi sản phẩm có số khoản chi phí khác
   * nhau, và bắt điền đủ bốn là bắt gõ số 0 vào những ô không có nghĩa gì. Mảng
   * rỗng là hợp lệ: giá thu về khi đó bằng đúng giá bán buôn.
   */
  cpbh: readonly Vnd[];
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
  const { companyPrice, wholesalePrice, cpbh } = input;

  if (companyPrice <= 0n) {
    throw new InvalidLineError(
      'COMPANY_PRICE_REQUIRED',
      'Giá bán Công ty phải lớn hơn 0 — không có phép chia cho 0',
    );
  }
  if (wholesalePrice < 0n) {
    throw new InvalidLineError('NEGATIVE_AMOUNT', 'wholesalePrice không được âm');
  }
  cpbh.forEach((v, i) => {
    // Nêu ĐÚNG khoản thứ mấy. "CPBH không được âm" khi có mười khoản là bắt
    // người dùng dò lại cả dòng.
    if (v < 0n) throw new InvalidLineError('NEGATIVE_AMOUNT', `CPBH ${i + 1} không được âm`);
  });

  const cpbhTotal = cpbh.reduce((a, v) => a + v, 0n);
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
