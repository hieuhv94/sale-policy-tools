import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource, TraceMiddleware } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { AuditService } from './log/audit.service.js';
import { AuditController } from './log/audit.controller.js';
import { AuditConsumer } from './log/consumer.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('healthz')
  async health() {
    await this.db.q('SELECT 1');
    return { ok: true, service: 'audit', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'audit' };
  }
}

@Module({
  controllers: [HealthController, AuditController],
  providers: [
    Db,
    AuditService,
    AuditConsumer,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
