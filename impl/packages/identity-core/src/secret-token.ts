/**
 * Token dùng một lần gửi qua email (kích hoạt tài khoản — YCNV muc 2.8).
 *
 * Chuỗi thô chỉ tồn tại trong đúng một email. CSDL chỉ giữ bản băm, nên đọc trộm
 * được bảng activation_token cũng không kích hoạt hộ được tài khoản nào.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ACTIVATION_TTL_HOURS = 72;

/** SHA-256 là đủ ở đây: token là 256 bit ngẫu nhiên, không phải mật khẩu người
 *  nghĩ ra, nên không có gì để tấn công từ điển. Không cần hàm băm chậm. */
export const hashSecretToken = (raw: string): string =>
  createHash('sha256').update(raw, 'utf8').digest('hex');

export function newSecretToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashSecretToken(raw) };
}

export function secretTokenMatches(raw: string, hash: string): boolean {
  const a = Buffer.from(hashSecretToken(raw), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
