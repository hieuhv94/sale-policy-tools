import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { Storage } from './infra/storage.js';
import { Clients } from './infra/clients.js';
import { Gotenberg } from './infra/gotenberg.js';
import { FilesService } from './files/files.service.js';
import { FilesController } from './files/files.controller.js';
import { RenderService } from './render/render.service.js';
import { RenderController } from './render/render.controller.js';
import { ScanDiscardConsumer } from './consumers/scan-discard.consumer.js';
import { TemplatesService } from './contracts/templates.service.js';
import { ContractsService } from './contracts/contracts.service.js';
import {
  ContractsController,
  ContractTemplatesController,
} from './contracts/contracts.controller.js';
import { TemplateBootstrap } from './contracts/bootstrap.js';

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
    RenderController,
    ContractTemplatesController,
    ContractsController,
  ],
  providers: [
    Db,
    Storage,
    Clients,
    Gotenberg,
    FilesService,
    RenderService,
    TemplatesService,
    ContractsService,
    TemplateBootstrap,
    ScanDiscardConsumer,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
