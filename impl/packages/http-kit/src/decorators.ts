import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const PUBLIC = 'csbh:public';
export const ROLES = 'csbh:roles';
export const PWD_RESET_OK = 'csbh:pwdResetOk';
export const SERVICE_ONLY = 'csbh:serviceOnly';

/** Không cần đăng nhập: đăng nhập, làm mới token, kích hoạt tài khoản. */
export const Public = () => SetMetadata(PUBLIC, true);

export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);

/**
 * Route vẫn gọi được khi tài khoản đang bị bắt buộc đổi mật khẩu.
 *
 * Danh sách này phải NGẮN và cố ý: chỉ đổi mật khẩu, xem thông tin bản thân và
 * đăng xuất. Mọi thứ khác bị chặn, nếu không thì bước đổi mật khẩu lách được (ONB-06).
 */
export const PwdResetOk = () => SetMetadata(PWD_RESET_OK, true);

/** Chỉ nhận token dịch vụ (audience nội bộ), không nhận token người dùng. */
export const ServiceOnly = () => SetMetadata(SERVICE_ONLY, true);

export type AuthUser = {
  id: string;
  role: string;
  mustChangePassword: boolean;
  /** Ảnh chụp danh tính cho nhật ký (`0090`) — xem `AccountState`. */
  name?: string | undefined;
  username?: string | undefined;
};

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
