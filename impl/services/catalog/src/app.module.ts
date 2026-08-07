import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { ProductsService } from './products/products.service.js';
import { RulesService } from './rules/rules.service.js';
import { LookupsService } from './lookups/lookups.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogInternalController } from './internal.controller.js';

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
    LookupsService,
    // catalog KHÔNG có quyền trên schema idn nên phải hỏi identity qua API nội
    // bộ; kết quả nằm ở đúng khoá Redis mà identity dùng, nên vô hiệu hoá tài
    // khoản vẫn có hiệu lực ở đây trong vòng 60 giây (AUTH-07).
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
