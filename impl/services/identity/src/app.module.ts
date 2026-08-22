import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from './infra/db.js';
import { Mailer } from './infra/mailer.js';
import { AccountCache } from './infra/account-cache.js';
import { PolicyClient } from './infra/policy.client.js';
import { CustomerClient } from './infra/customer.client.js';
import { CONFIG } from './infra/config.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { UsersService } from './admin/users.service.js';
import { UsersController } from './admin/users.controller.js';
import { InternalController } from './internal/internal.controller.js';
import { ACCOUNT_SOURCE, AuthGuard, Public, TraceMiddleware } from '@csbh/http-kit';
import { SuKienIdn } from './infra/outbox.js';
import { IdentityOutbox } from './infra/outbox.relay.js';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  /**
   * Healthcheck phải CHẠM tới phụ thuộc thật.
   *
   * Trả `ok: true` vô điều kiện là healthcheck không phát hiện được gì: Postgres
   * chết mà container vẫn "khoẻ", bộ cân bằng tải vẫn dồn request vào.
   */
  @Public()
  @Get('healthz')
  async health() {
    await this.db.q('SELECT 1');
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
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    InternalController,
  ],
  providers: [
    Db,
    Mailer,
    AccountCache,
    SuKienIdn,
    IdentityOutbox,
    PolicyClient,
    CustomerClient,
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
export class AppModule implements NestModule {
  /**
   * Ngữ cảnh request mở ở ĐÂY, trước mọi guard và mọi controller: một lời gọi bị
   * guard chặn cũng cần `trace_id` để tra lại (AUD-08).
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
