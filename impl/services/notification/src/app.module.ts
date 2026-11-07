import { PolicyClient } from './infra/policy.client.js';
import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource, TraceMiddleware } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { Mailer } from './infra/mailer.js';
import { NotifyService } from './notify/notify.service.js';
import { NotifyController } from './notify/notify.controller.js';
import { NotifyConsumer } from './notify/consumer.js';
import { RecipientsClient } from './notify/recipients.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('healthz')
  async health() {
    await this.db.q('SELECT 1');
    return { ok: true, service: 'notification', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'notification' };
  }
}

@Module({
  controllers: [HealthController, NotifyController],
  providers: [
    Db,
    Mailer,
    RecipientsClient,
    PolicyClient,
    NotifyService,
    NotifyConsumer,
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
