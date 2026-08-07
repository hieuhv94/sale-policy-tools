import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { CatalogClient } from './infra/catalog.client.js';
import { ScopeClient } from './infra/scope.client.js';
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
    CatalogClient,
    ScopeClient,
    CustomersService,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
