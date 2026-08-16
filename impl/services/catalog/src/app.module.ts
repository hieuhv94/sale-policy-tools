import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource, TraceMiddleware } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { ProductsService } from './products/products.service.js';
import { RulesService } from './rules/rules.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogInternalController } from './internal.controller.js';
import { CatalogOutbox } from './infra/outbox.relay.js';

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
    return { ok: true, service: 'catalog', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'catalog' };
  }
}

@Module({
  controllers: [HealthController, CatalogController, CatalogInternalController],
  providers: [
    Db,
    ProductsService,
    RulesService,
    CatalogOutbox,
    // catalog KHÔNG có quyền trên schema idn nên phải hỏi identity qua API nội
    // bộ; kết quả nằm ở đúng khoá Redis mà identity dùng, nên vô hiệu hoá tài
    // khoản vẫn có hiệu lực ở đây trong vòng 60 giây (AUTH-07).
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
