import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource, TraceMiddleware } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { CustomerOutbox } from './infra/outbox.relay.js';
import { ScopeClient } from './infra/scope.client.js';
import { PolicyClient } from './infra/policy.client.js';
import { CustomersService } from './customers/customers.service.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomerInternalController } from './internal.controller.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

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
    return { ok: true, service: 'customer', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'customer' };
  }
}

@Module({
  controllers: [HealthController, CustomersController, CustomerInternalController],
  providers: [
    Db,
    CustomerOutbox,
    ScopeClient,
    PolicyClient,
    CustomersService,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
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
