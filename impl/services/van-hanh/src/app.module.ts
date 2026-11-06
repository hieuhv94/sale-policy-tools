import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_SOURCE, AuthGuard, Public, RemoteAccountSource, TraceMiddleware } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { VanHanhOutbox } from './infra/outbox.js';
import { LichController } from './lich/lich.controller.js';
import { HenGio } from './lich/hen-gio.js';
import { LogController } from './logs/log.controller.js';
import { LogService } from './logs/log.service.js';
import { SaoLuuController } from './sao-luu/sao-luu.controller.js';
import { SaoLuuService } from './sao-luu/sao-luu.service.js';
import { ODiaController } from './o-dia/o-dia.controller.js';
import { ODiaService } from './o-dia/o-dia.service.js';
import { SucKhoeController } from './suc-khoe/suc-khoe.controller.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

@Controller()
class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get('healthz')
  async health() {
    await this.db.q('SELECT 1');
    return { ok: true, service: 'van-hanh', version: VERSION };
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'van-hanh' };
  }
}

/**
 * Service thứ 11 (`0252`) — API của trang Vận hành cho Quản trị hệ thống. Mọi đường đều
 * `@Roles('QUAN_TRI')`; mọi thao tác ghi phát sự kiện vào nhật ký kiểm toán.
 */
@Module({
  controllers: [HealthController, LichController, LogController, SaoLuuController, ODiaController, SucKhoeController],
  providers: [
    Db,
    VanHanhOutbox,
    LogService,
    SaoLuuService,
    ODiaService,
    HenGio,
    { provide: ACCOUNT_SOURCE, useClass: RemoteAccountSource },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
