import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { COOKIE_STATE, GoogleService, STATE_TTL_SEC } from './google.service.js';
import {
  CurrentUser,
  oneOf,
  Public,
  PwdResetOk,
  secret,
  str,
  validate,
  type AuthUser,
} from '@csbh/http-kit';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleService,
  ) {}

  /**
   * Những cách đăng nhập đang bật — màn hình đăng nhập hỏi để biết có bày nút
   * Google hay không (`0241`). Bày nút khi tính năng tắt là một nút bấm vào lần
   * nào cũng hỏng.
   */
  @Public()
  @Get('phuong-thuc')
  phuongThuc() {
    return { google: this.google.bat };
  }

  /**
   * Bắt đầu đăng nhập Google: 302 sang hộp chọn tài khoản của Google (`0241`).
   *
   * Trình duyệt tới đây bằng một LIÊN KẾT (điều hướng), không bằng `fetch` — nên
   * trả lời là chuyển hướng chứ không phải JSON, và tính năng tắt cũng trả về
   * màn hình đăng nhập kèm mã lỗi thay vì một trang 404 trơn.
   */
  @Public()
  @Get('google/start')
  async googleStart(@Query('next') next: unknown, @Res() res: Response): Promise<void> {
    if (!this.google.bat) {
      res.redirect(302, `${this.google.webBaseUrl}/?loi=GOOGLE_LOGIN_DISABLED`);
      return;
    }
    const { state, url } = await this.google.batDau(next);
    res.cookie(COOKIE_STATE, state, {
      httpOnly: true,
      secure: this.google.cookieSecure,
      // `Lax` chứ không `Strict`: lượt quay về từ Google là một điều hướng
      // XUYÊN TRANG, và `Strict` không gửi cookie ở đúng lượt ấy.
      sameSite: 'lax',
      // Đường dẫn trình duyệt nhìn thấy, tức có `/api` của Caddy phía trước.
      path: '/api/auth/google',
      maxAge: STATE_TTL_SEC * 1000,
    });
    res.redirect(302, url);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query() q: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const s = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : undefined);
    if (!this.google.bat) {
      res.redirect(302, `${this.google.webBaseUrl}/?loi=GOOGLE_LOGIN_DISABLED`);
      return;
    }
    const kq = await this.google.goiVe({
      code: s('code'),
      state: s('state'),
      error: s('error'),
      cookieState: docCookie(req.headers.cookie, COOKIE_STATE),
    });
    res.clearCookie(COOKIE_STATE, { path: '/api/auth/google' });
    const base = this.google.webBaseUrl;
    if (!kq.ok) {
      res.redirect(302, `${base}/?loi=${encodeURIComponent(kq.code)}`);
      return;
    }
    // FRAGMENT, không phải query: không vào log máy chủ, không đi theo Referer.
    const f = new URLSearchParams({ ma: kq.ma, next: kq.next });
    res.redirect(302, `${base}/dang-nhap/google#${f.toString()}`);
  }

  /** Nộp mã một lần — trả CÙNG hình dạng với `/auth/login`. */
  @Public()
  @Post('google/exchange')
  @HttpCode(200)
  googleExchange(@Body() body: unknown) {
    const b = validate(body, { ma: str(1, 200) });
    return this.google.doiMaMotLan(b.ma);
  }

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

  /**
   * Quên mật khẩu. CÔNG KHAI, và LUÔN trả về cùng một câu trả lời.
   *
   * Không phân biệt "có tài khoản" với "không có": phân biệt ra là biến đường
   * này thành máy dò xem tên tài khoản hay địa chỉ email nào có thật trong hệ
   * thống — cùng lý do với `INVALID_CREDENTIALS` ở đăng nhập (AUTH-02).
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() body: unknown) {
    const b = validate(body, { login: str(1, 254) });
    return this.auth.forgotPassword(b.login);
  }

  /** Đặt mật khẩu mới bằng liên kết trong thư — người dùng chưa đăng nhập được. */
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() body: unknown) {
    const b = validate(body, { token: str(1), newPassword: secret(1) });
    return this.auth.resetPassword(b.token, b.newPassword);
  }

  @PwdResetOk()
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u.id);
  }

  /**
   * Người dùng tự sửa thông tin của chính mình.
   *
   * KHÔNG có `@PwdResetOk()`: người đang bị buộc đổi mật khẩu chỉ được đi đúng
   * một đường, là đổi mật khẩu. Mở thêm đường ghi nào ở trạng thái đó là mở
   * đúng thứ `must_change_password` dựng ra để đóng.
   *
   * Nhận `fullName`, và với TDV/Kế toán thì nhận thêm người quản lý. Danh sách
   * TRẮNG chứ không phải danh sách đen — thêm cột mới vào bảng thì nó KHÔNG tự
   * nhiên sửa được từ đây. Vai trò và email cố ý không có mặt: đổi vai trò là tự
   * nâng quyền, đổi email là tự chuyển đường đặt lại mật khẩu sang hộp thư khác.
   */
  @Patch('me')
  @HttpCode(200)
  async updateMe(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = validate(body, { fullName: str(2, 200) });
    return this.auth.updateProfile(u.id, b.fullName);
  }

  /**
   * Tài khoản đang hoạt động của một vai trò — nguồn cho MỌI ô chọn người (`0031`).
   *
   * Thay cho `GET /auth/managers`, vốn trả "ai làm quản lý của tôi được". Không
   * còn quản lý, nhưng nhu cầu dựng ô chọn thì lớn hơn trước: gửi duyệt chọn
   * Trưởng bộ phận và Kế toán, tiếp nhận L1 chọn Sale Admin.
   *
   * Mở cho MỌI người đã đăng nhập, và chỉ trả tên với tài khoản — không email.
   * Một TDV cần chọn người duyệt thì không có lý do gì để họ cầm danh bạ email
   * của cả công ty; đó là việc của `/admin/users`, sau `@Roles('QUAN_TRI')`.
   */
  @Get('nguoi-theo-vai-tro/:role')
  nguoiTheoVaiTro(@Param('role') role: string) {
    const b = validate({ role }, { role: oneOf('TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN') });
    return this.auth.nguoiTheoVaiTro(b.role);
  }

  @PwdResetOk()
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = validate(body, { currentPassword: secret(1), newPassword: secret(1) });
    return this.auth.changePassword(u.id, b.currentPassword, b.newPassword);
  }
}

/** Đọc một cookie từ header — identity không cài `cookie-parser` cho đúng một chỗ dùng. */
export function docCookie(header: string | undefined, ten: string): string | undefined {
  if (!header) return undefined;
  for (const phan of header.split(';')) {
    const i = phan.indexOf('=');
    if (i < 0) continue;
    if (phan.slice(0, i).trim() === ten) {
      try {
        return decodeURIComponent(phan.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
