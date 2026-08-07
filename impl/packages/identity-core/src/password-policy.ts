/**
 * Điều kiện mật khẩu mới (YCNV muc 2.8): tối thiểu 10 ký tự, có chữ và số, và
 * không được trùng mật khẩu mặc định do Quản trị hệ thống đặt.
 *
 * Trả về DANH SÁCH lỗi chứ không phải true/false: người dùng cần biết thiếu
 * điều kiện nào, sửa một lần cho xong thay vì đoán từng vòng (ONB-12).
 */
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordProblem =
  | 'TOO_SHORT'
  | 'NEEDS_LETTER'
  | 'NEEDS_DIGIT'
  | 'SAME_AS_CURRENT';

export const PASSWORD_PROBLEM_TEXT: Record<PasswordProblem, string> = {
  TOO_SHORT: `Mật khẩu phải có tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`,
  NEEDS_LETTER: 'Mật khẩu phải có ít nhất một chữ cái',
  NEEDS_DIGIT: 'Mật khẩu phải có ít nhất một chữ số',
  SAME_AS_CURRENT: 'Mật khẩu mới phải khác mật khẩu đang dùng',
};

export function checkNewPassword(
  plain: string,
  opts: { currentPlain?: string } = {},
): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (plain.length < PASSWORD_MIN_LENGTH) problems.push('TOO_SHORT');
  if (!/\p{L}/u.test(plain)) problems.push('NEEDS_LETTER');
  if (!/\d/.test(plain)) problems.push('NEEDS_DIGIT');
  // Cho phép đổi mật khẩu mà đặt lại đúng mật khẩu cũ thì cả bước này vô nghĩa.
  if (opts.currentPlain !== undefined && plain === opts.currentPlain) {
    problems.push('SAME_AS_CURRENT');
  }
  return problems;
}

export const describePasswordProblems = (p: PasswordProblem[]): string =>
  p.map((x) => PASSWORD_PROBLEM_TEXT[x]).join('; ');
