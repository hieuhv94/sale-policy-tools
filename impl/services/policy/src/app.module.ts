import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource, TraceMiddleware } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { Clients } from './infra/clients.js';
import { ScopeClient } from './infra/scope.client.js';
import { PoliciesService } from './policies/policies.service.js';
import { WorkflowService } from './policies/workflow.service.js';
import { PoliciesController } from './policies/policies.controller.js';
import { PolicyOutbox } from './infra/outbox.relay.js';
import { PolicyInternalController } from './internal.controller.js';
import { SlaConfigService } from './policies/sla-config.service.js';
import { SlaConfigController } from './policies/sla-config.controller.js';
import { PriceChangedConsumer } from './consumers/price-changed.consumer.js';

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
    return { ok: true, service: 'policy', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'policy' };
  }
}

@Module({
  controllers: [
    HealthController,
    PoliciesController,
    SlaConfigController,
    PolicyInternalController,
  ],
  providers: [
    Db,
    Clients,
    ScopeClient,
    PoliciesService,
    WorkflowService,
    SlaConfigService,
    PolicyOutbox,
    PriceChangedConsumer,
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
