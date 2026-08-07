import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { Clients } from './infra/clients.js';
import { ScopeClient } from './infra/scope.client.js';
import { PoliciesService } from './policies/policies.service.js';
import { WorkflowService } from './policies/workflow.service.js';
import { PoliciesController } from './policies/policies.controller.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

@Controller()
class HealthController {
  @Public()
  @Get('healthz')
  health() {
    return { ok: true, service: 'policy', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'policy' };
  }
}

@Module({
  controllers: [HealthController, PoliciesController],
  providers: [
    Db,
    Clients,
    ScopeClient,
    PoliciesService,
    WorkflowService,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
