/**
 * Guard xác thực dùng chung. Bốn lớp kiểm, theo đúng thứ tự này:
 *
 *   1. chữ ký + hạn + issuer + audience của token
 *   2. tài khoản còn hoạt động không (qua cache TTL 60 giây)
 *   3. token có cũ hơn lần đổi mật khẩu gần nhất không
 *   4. tài khoản có đang bị bắt buộc đổi mật khẩu không
 *
 * Kiểm vai trò nằm ở guard riêng vì nó là câu hỏi khác: "đúng người" và "đủ
 * quyền" hỏng theo hai cách khác nhau và trả về hai mã lỗi khác nhau.
 */
import {
  Injectable,
  type CanActivate,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError, verifyJwt, type JwtPayload } from '@csbh/identity-core';
import { getKeyPair } from '../infra/keys.js';
import { CONFIG } from '../infra/config.js';
import { AccountCache } from '../infra/account-cache.js';
import { PUBLIC, PWD_RESET_OK, ROLES, SERVICE_ONLY, type AuthUser } from './decorators.js';

type Req = { headers: Record<string, string | string[] | undefined>; user?: AuthUser };

const bearer = (req: Req): string | undefined => {
  const h = req.headers['authorization'];
  const v = Array.isArray(h) ? h[0] : h;
  return v?.startsWith('Bearer ') ? v.slice(7) : undefined;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accounts: AccountCache,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Req>();
    const serviceOnly = this.reflector.getAllAndOverride<boolean>(SERVICE_ONLY, targets) ?? false;

    if (serviceOnly) return this.checkServiceToken(req);

    const token = bearer(req);
    if (!token) throw new UnauthorizedException({ code: 'TOKEN_MISSING' });

    const payload = this.verify(token, CONFIG.audUser);

    const state = await this.accounts.get(String(payload.sub));
    // Tài khoản bị xoá hoặc bị vô hiệu hoá trong lúc token còn hạn (AUTH-07).
    if (!state || !state.isActive) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED' });

    // Đổi mật khẩu đá văng luôn access token đang cầm, không chờ hết 15 phút (ONB-13).
    //
    // Mốc này tính bằng MILI GIÂY. Để ở giây thì đăng nhập rồi đổi mật khẩu
    // trong cùng một giây sẽ cho hai giá trị bằng nhau, phép so `<` không thành,
    // và token của phiên cũ sống sót — test ONB-13 chỉ đỏ khi hai thao tác rơi
    // đúng vào cùng một giây, nên lỗi này lúc xanh lúc đỏ.
    const issuedFor = Number(payload['pat'] ?? 0);
    if (issuedFor < state.passwordChangedAt) {
      throw new UnauthorizedException({ code: 'TOKEN_STALE' });
    }

    if (state.mustChangePassword) {
      const ok = this.reflector.getAllAndOverride<boolean>(PWD_RESET_OK, targets) ?? false;
      if (!ok) {
        throw new ForbiddenException({
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Phải đổi mật khẩu mặc định trước khi dùng hệ thống',
        });
      }
    }

    req.user = {
      id: String(payload.sub),
      role: state.role,
      mustChangePassword: state.mustChangePassword,
    };

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, targets);
    if (roles && roles.length > 0 && !roles.includes(state.role)) {
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN' });
    }
    return true;
  }

  private checkServiceToken(req: Req): boolean {
    const h = req.headers['x-service-token'];
    const raw = Array.isArray(h) ? h[0] : h;
    // Cùng mạng nội bộ không phải là căn cứ để tin nhau (AUTH-21).
    if (!raw) throw new UnauthorizedException({ code: 'SERVICE_TOKEN_MISSING' });
    this.verify(raw, CONFIG.audInternal);
    return true;
  }

  private verify(token: string, audience: string): JwtPayload {
    try {
      return verifyJwt(token, getKeyPair().publicKey, { issuer: CONFIG.issuer, audience });
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        throw new UnauthorizedException({ code: 'TOKEN_EXPIRED' });
      }
      // Một mã lỗi duy nhất cho mọi kiểu token hỏng: chữ ký sai, sai audience,
      // sai issuer, payload hỏng. Phân biệt ra là chỉ cho người thử token biết
      // họ đang tiến gần tới đâu (AUTH-05).
      throw new UnauthorizedException({ code: 'TOKEN_INVALID' });
    }
  }
}
