/**
 * Tập loại khách hàng của một quy định chiết khấu (`0280`).
 *
 * Một quy định mang MỘT TẬP loại khách: `null` là MỌI loại, còn lại là một tập con
 * thật sự của {1,2,3}. Hàm thuần để ca kiểm gọi thẳng — luật nằm ở một chỗ, và CSDL
 * (`rule_loai_khach_hop_le`, `0133`) là chốt thứ hai chứ không phải chỗ duy nhất.
 */

/** Ba loại khách hàng của hệ thống (CHECK của `0005`). Thêm loại thứ tư = thêm một chỉ mục `uq_rule_pham_vi_l4`. */
export const CAC_LOAI_KHACH = [1, 2, 3] as const;

/**
 * Chuẩn hoá về dạng lưu: xếp tăng dần, bỏ lặp; rỗng và ĐỦ BA LOẠI đều là `null`.
 *
 * Đủ ba loại là "mọi loại" — hệ thống chỉ có ba loại, nên hai cách viết là một câu. Để cả hai
 * tồn tại thì chúng thành hai quy định khác bậc cụ thể (`specificity`) cho cùng một ý.
 */
export function chuanLoaiKhach(v: readonly number[] | null | undefined): number[] | null {
  if (!v || v.length === 0) return null;
  const tap = [...new Set(v)].sort((a, b) => a - b);
  return tap.length >= CAC_LOAI_KHACH.length ? null : tap;
}

/** Hai tập có chung ít nhất một loại không? `null` (mọi loại) giao với mọi tập. */
export function giaoNhau(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === null || b === null) return true;
  return a.some((x) => b.includes(x));
}
