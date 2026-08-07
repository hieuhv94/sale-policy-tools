/**
 * Liên kết xem file: hạn 5 phút và GẮN VỚI NGƯỜI DÙNG đã xin nó (muc 10).
 *
 * Hai tính chất phải có cùng lúc, và thiếu một trong hai là hỏng khác nhau:
 *
 *   - **Hạn ngắn** chống liên kết bị lưu lại rồi dùng lại sau nhiều tháng.
 *   - **Gắn người dùng** chống chuyển tiếp: liên kết của kế toán A dán vào chat
 *     nhóm không biến người khác thành người xem được file.
 *
 * Và ngay cả khi cả hai đều đúng, `document` VẪN kiểm quyền lại từ đầu ở mỗi
 * lượt tải. Liên kết chỉ trả lời "đúng người xin liên kết này không"; nó không
 * bao giờ thay thế câu hỏi "người này có được xem hồ sơ đó không" (DOC-09).
 */
import { signJwt, verifyJwt, TokenExpiredError } from '@csbh/identity-core';
import { getKeyPair, JWT } from '@csbh/http-kit';

/** Audience riêng: token xem file KHÔNG gọi được API nào khác, và ngược lại. */
export const AUD_FILE = 'csbh-file';
export const FILE_LINK_TTL_SEC = 300;

export const mintFileToken = (fileId: string, userId: string): string =>
  signJwt({ sub: userId, fid: fileId }, getKeyPair().privateKey, {
    issuer: JWT.issuer,
    audience: AUD_FILE,
    expiresInSec: FILE_LINK_TTL_SEC,
  });

export type LinkCheck = 'ok' | 'expired' | 'invalid' | 'wrong-user' | 'wrong-file';

export function checkFileToken(token: string, fileId: string, userId: string): LinkCheck {
  let payload;
  try {
    payload = verifyJwt(token, getKeyPair().publicKey, {
      issuer: JWT.issuer,
      audience: AUD_FILE,
    });
  } catch (e) {
    return e instanceof TokenExpiredError ? 'expired' : 'invalid';
  }
  if (payload.fid !== fileId) return 'wrong-file';
  if (payload.sub !== userId) return 'wrong-user';
  return 'ok';
}
