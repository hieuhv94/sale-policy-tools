import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from './infra/db.js';
import { Mailer } from './infra/mailer.js';
import { AccountCache } from './infra/account-cache.js';
import { CONFIG } from './infra/config.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { UsersService } from './admin/users.service.js';
import { UsersController } from './admin/users.controller.js';
import { InternalController } from './internal/internal.controller.js';
import { ACCOUNT_SOURCE, AuthGuard, Public } from '@csbh/http-kit';

@Controller()
class HealthController {
  @Public()
  @Get('healthz')
  health() {
    return { ok: true, service: 'identity', version: CONFIG.appVersion };
  }

  /** Phiên bản lấy từ biến môi trường do file VERSION sinh ra — VER-01. */
  @Public()
  @Get('version')
  version() {
    return { version: CONFIG.appVersion, service: 'identity' };
  }
}

@Module({
  controllers: [HealthController, AuthController, UsersController, InternalController],
  providers: [
    Db,
    Mailer,
    AccountCache,
    AuthService,
    UsersService,
    // Guard đăng ký ở phạm vi TOÀN CỤC: mặc định là chặn, mở ra phải khai báo
    // @Public() ngay tại route. Ngược lại — mặc định mở, nhớ thì mới chặn — là
    // cách quên một route rồi hở cả hệ thống.
    // identity đọc trạng thái tài khoản thẳng từ CSDL vì nó sở hữu lược đồ idn.
    { provide: ACCOUNT_SOURCE, useExisting: AccountCache },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
