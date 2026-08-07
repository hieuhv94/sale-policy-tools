import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource } from '@csbh/http-kit';
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
    NotifyService,
    NotifyConsumer,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
