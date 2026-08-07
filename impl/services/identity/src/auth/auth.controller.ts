import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, PwdResetOk, secret, str, validate, type AuthUser } from '@csbh/http-kit';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const b = validate(body, { login: str(1), password: secret(1) });
    return this.auth.login(b.login, b.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    const b = validate(body, { refreshToken: str(1) });
    return this.auth.refresh(b.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown) {
    const b = validate(body, { refreshToken: str(1) });
    await this.auth.logout(b.refreshToken);
  }

  /** Kích hoạt bằng liên kết trong email — người dùng chưa đăng nhập được nên phải công khai. */
  @Public()
  @Post('activate')
  @HttpCode(200)
  activate(@Body() body: unknown) {
    const b = validate(body, { token: str(1), newPassword: secret(1) });
    return this.auth.activate(b.token, b.newPassword);
  }

  @PwdResetOk()
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u.id);
  }

  @PwdResetOk()
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = validate(body, { currentPassword: secret(1), newPassword: secret(1) });
    return this.auth.changePassword(u.id, b.currentPassword, b.newPassword);
  }
}
