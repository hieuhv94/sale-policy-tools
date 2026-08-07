/**
 * Cặp khoá RS256 dùng để ký token.
 *
 * Bất đối xứng chứ không phải HS256 có chủ đích: chín service kia chỉ cần XÁC
 * MINH token, nên chúng chỉ nhận public key. Đọc được mã nguồn hay ảnh Docker
 * của service khác cũng không phát hành được token — với HS256 thì khoá ký và
 * khoá xác minh là một, mọi service đều tự cấp token cho mình được.
 */
import { generateKeyPairSync, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type KeyPair = { privateKey: KeyObject; publicKey: KeyObject };

let cached: KeyPair | undefined;

export function getKeyPair(): KeyPair {
  if (cached) return cached;

  const file = process.env.JWT_PRIVATE_KEY_FILE;
  if (file) {
    const privateKey = createPrivateKey(readFileSync(file, 'utf8'));
    cached = { privateKey, publicKey: createPublicKey(privateKey) };
    return cached;
  }

  // Không có file khoá thì sinh khoá tạm cho lần chạy này. Chấp nhận được ở dev
  // và trong test; ở production thì mọi service phải trỏ vào cùng một file
  // secret, nếu không khởi động lại là toàn bộ token đang lưu hành chết hết.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_PRIVATE_KEY_FILE bắt buộc phải có ở môi trường production');
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  cached = { privateKey, publicKey };
  return cached;
}

/** Chỉ dùng trong test để cô lập các bộ test với nhau. */
export function resetKeyPairForTest(): void {
  cached = undefined;
}
