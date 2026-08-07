import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  ACCOUNT_SOURCE,
  AuthGuard,
  Public,
  RemoteAccountSource,
  TraceMiddleware,
} from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { Clients } from './infra/clients.js';
import { ScopeClient } from './infra/scope.client.js';
import { SyncService } from './reports/sync.service.js';
import { ReportingConsumer } from './reports/consumer.js';
import { ReportsService } from './reports/reports.service.js';
import { ReportsController } from './reports/reports.controller.js';
import { FilterStore } from './reports/filter-store.js';
import { ExportsService } from './exports/exports.service.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('healthz')
  async health() {
    await this.db.q('SELECT 1');
    return { ok: true, service: 'reporting', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'reporting' };
  }
}

@Module({
  controllers: [HealthController, ReportsController],
  providers: [
    Db,
    Clients,
    ScopeClient,
    SyncService,
    ReportingConsumer,
    ReportsService,
    FilterStore,
    ExportsService,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
