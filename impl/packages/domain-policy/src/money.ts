/**
 * Tiền trong hệ này LUÔN là số nguyên đồng (YCNV §7). Không có phần thập phân ở
 * bất kỳ API hay file xuất nào, nên dùng bigint chứ không dùng number.
 */
export type Vnd = bigint;

export const vnd = (v: number | string | bigint): Vnd => {
  const b = typeof v === 'bigint' ? v : BigInt(v);
  return b;
};

/** Định dạng có dấu phân nhóm nghìn để hiển thị và để in. */
export const formatVnd = (v: Vnd): string =>
  v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Tỷ lệ chiết khấu được giữ dưới dạng SỐ NGUYÊN phần trăm nhân 100 — tức đơn vị
 * là một phần trăm của phần trăm. 12,35% được lưu là 1235.
 *
 * Vì sao không dùng số thực: YCNV §7 đòi con số hiển thị, con số in ra và con số
 * dùng so ngưỡng phải là MỘT. Số thực nhị phân không biểu diễn được 12,35 chính
 * xác, nên sớm muộn sẽ có màn hình hiện 12,35% mà phép so lại coi là 12,349999.
 * Giữ số nguyên thì phép so là phép so số nguyên, không bao giờ lệch.
 */
export type Rate2 = number;

export const rate2FromPercent = (p: number): Rate2 => Math.round(p * 100);
export const formatRate2 = (r: Rate2): string =>
  `${Math.trunc(r / 100)},${String(Math.abs(r % 100)).padStart(2, '0')}`;

/**
 * Chia hai số nguyên rồi làm tròn NỬA LÊN, hiểu theo nghĩa nửa đi xa khỏi số 0.
 * Đây là quy tắc làm tròn tiền quen thuộc: 12,345 → 12,35 và −12,345 → −12,35.
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Chia cho 0');
  const neg = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const q = (a * 2n + b) / (b * 2n);
  return neg ? -q : q;
}
