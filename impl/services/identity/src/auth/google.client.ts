/**
 * Phần DUY NHẤT nói chuyện với máy chủ của Google (`0241`).
 *
 * Tách khỏi `GoogleService` để bộ kiểm thay được bằng một bản giả — và chỉ phần
 * này, vì mọi phép KIỂM (state, nonce, hạn, `email_verified`, miền) nằm bên kia
 * và phải chạy thật. Một ca đối chiếu ở `google-login.test.ts` chạy chính lớp
 * này vào một máy HTTP giả cục bộ, để bản giả không trôi khỏi hợp đồng thật.
 *
 * KHÔNG kiểm chữ ký `id_token`, và đó là chủ ý: token tới thẳng từ endpoint
 * token của Google qua TLS, trong lượt gọi mà chính máy chủ này mở ra, kèm
 * client secret — OIDC Core 3.1.3.7 cho phép dùng TLS thay chữ ký ở đúng tình
 * huống này. Kiểm chữ ký cần tải và giữ JWKS của Google, tức một phụ thuộc mạng
 * thứ hai không thêm được gì. Token tới từ TRÌNH DUYỆT thì khác hẳn — và luồng
 * này không bao giờ nhận token từ trình duyệt.
 */
import { Inject, Injectable } from '@nestjs/common';
import { CAU_HINH_GOOGLE, type CauHinhGoogle } from './google.config.js';

export type ClaimGoogle = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
  name?: unknown;
};

export class LoiGoogle extends Error {}

@Injectable()
export class GoogleClient {
  constructor(@Inject(CAU_HINH_GOOGLE) private readonly cfg: CauHinhGoogle) {}

  /** Đổi `code` lấy `id_token`, trả về phần thân đã giải mã. */
  async doiMa(code: string, codeVerifier: string): Promise<ClaimGoogle> {
    const res = await fetch(this.cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        redirect_uri: this.cfg.redirectUri,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new LoiGoogle(`endpoint token trả ${res.status}`);
    const body = (await res.json()) as { id_token?: unknown };
    if (typeof body.id_token !== 'string') throw new LoiGoogle('phản hồi không có id_token');
    return giaiMaIdToken(body.id_token);
  }
}

export function giaiMaIdToken(idToken: string): ClaimGoogle {
  const phan = idToken.split('.');
  if (phan.length !== 3) throw new LoiGoogle('id_token sai hình dạng');
  try {
    const v = JSON.parse(Buffer.from(phan[1]!, 'base64url').toString('utf8')) as unknown;
    if (typeof v !== 'object' || v === null) throw new Error();
    return v as ClaimGoogle;
  } catch {
    throw new LoiGoogle('id_token không đọc được');
  }
}
