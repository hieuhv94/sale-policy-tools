/**
 * JWT RS256 dựng trên node:crypto — không thêm phụ thuộc nào.
 *
 * TẠI SAO TỰ VIẾT: định dạng JWS compact chỉ có ba đoạn base64url, phần khó duy
 * nhất là chỗ dễ sai về an toàn, và tự viết cho phép đóng đúng chỗ đó một cách
 * dứt khoát — xem `verifyJwt`. Đổi lại là 60 dòng phải tự bảo trì.
 */
import { createSign, createVerify, type KeyObject } from 'node:crypto';

export class TokenInvalidError extends Error {
  override readonly name = 'TokenInvalidError';
}
export class TokenExpiredError extends Error {
  override readonly name = 'TokenExpiredError';
}

export type JwtPayload = {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  [claim: string]: unknown;
};

const enc = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');

export type SignOptions = {
  issuer: string;
  audience: string;
  expiresInSec: number;
  now?: number;
};

export function signJwt(
  claims: Record<string, unknown> & { sub: string },
  privateKey: KeyObject,
  opt: SignOptions,
): string {
  const iat = Math.floor((opt.now ?? Date.now()) / 1000);
  const payload: JwtPayload = {
    ...claims,
    iss: opt.issuer,
    aud: opt.audience,
    iat,
    exp: iat + opt.expiresInSec,
  };
  const head = enc({ alg: 'RS256', typ: 'JWT' });
  const body = `${head}.${enc(payload)}`;
  const sig = createSign('RSA-SHA256').update(body).end().sign(privateKey).toString('base64url');
  return `${body}.${sig}`;
}

export type VerifyOptions = {
  issuer: string;
  audience: string;
  now?: number;
  clockSkewSec?: number;
};

export function verifyJwt(token: string, publicKey: KeyObject, opt: VerifyOptions): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenInvalidError('token không đúng định dạng');
  const [head, body, sig] = parts as [string, string, string];

  // Xác minh chữ ký TRƯỚC khi đọc nội dung: mọi thứ trong payload đều là dữ liệu
  // do bên ngoài đưa vào cho tới khi chữ ký được chứng minh là đúng.
  const ok = createVerify('RSA-SHA256')
    .update(`${head}.${body}`)
    .end()
    .verify(publicKey, Buffer.from(sig, 'base64url'));
  if (!ok) throw new TokenInvalidError('chữ ký không hợp lệ');

  // Thuật toán CỐ ĐỊNH là RS256, đọc từ hằng số trong mã chứ không đọc từ header.
  // Đây là chỗ sinh ra lỗ hổng alg confusion (alg:none, hoặc đổi RS256 -> HS256
  // rồi ký bằng chính public key): thư viện nào chọn khóa theo header đều dính.
  let header: { alg?: unknown; typ?: unknown };
  try {
    header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
  } catch {
    throw new TokenInvalidError('header hỏng');
  }
  if (header.alg !== 'RS256') throw new TokenInvalidError('thuật toán không được chấp nhận');

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
  } catch {
    throw new TokenInvalidError('payload hỏng');
  }

  if (payload.iss !== opt.issuer) throw new TokenInvalidError('sai issuer');
  // Kiểm audience chặn việc mang token của luồng này sang dùng cho luồng khác:
  // access token của người dùng không gọi được API nội bộ giữa các service.
  if (payload.aud !== opt.audience) throw new TokenInvalidError('sai audience');

  const now = Math.floor((opt.now ?? Date.now()) / 1000);
  const skew = opt.clockSkewSec ?? 0;
  if (typeof payload.exp !== 'number' || now > payload.exp + skew) {
    throw new TokenExpiredError('token đã hết hạn');
  }
  return payload;
}

/** Đọc payload KHÔNG xác minh — chỉ dùng cho log và test, không bao giờ để quyết định quyền. */
export function decodeJwtUnsafe(token: string): JwtPayload | null {
  const body = token.split('.')[1];
  if (!body) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }
}
