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
  @Public()
  @Get('healthz')
  health() {
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
