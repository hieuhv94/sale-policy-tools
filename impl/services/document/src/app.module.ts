import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource, TraceMiddleware } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { DocumentOutbox } from './infra/outbox.relay.js';
import { Storage } from './infra/storage.js';
import { Clients } from './infra/clients.js';
import { Gotenberg } from './infra/gotenberg.js';
import { FilesService } from './files/files.service.js';
import { FilesController } from './files/files.controller.js';
import { FilesInternalController } from './files/internal.controller.js';
import { RenderService } from './render/render.service.js';
import { RenderController } from './render/render.controller.js';
import { TemplatesService } from './contracts/templates.service.js';
import { ContractsService } from './contracts/contracts.service.js';
import {
  ContractsController,
  ContractTemplatesController,
  PolicyTemplatesController,
} from './contracts/contracts.controller.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('healthz')
  async health() {
    await this.db.q('SELECT 1');
    return { ok: true, service: 'document', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'document' };
  }
}

@Module({
  controllers: [
    HealthController,
    FilesController,
    FilesInternalController,
    RenderController,
    ContractTemplatesController,
    PolicyTemplatesController,
      ContractsController,
  ],
  providers: [
    Db,
    DocumentOutbox,
    Storage,
    Clients,
    Gotenberg,
    FilesService,
    RenderService,
    TemplatesService,
    ContractsService,
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
