import { Controller, Delete, Get, HttpCode, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, tenTepTaiVe, type AuthUser } from '@csbh/http-kit';
import { emit } from '../infra/outbox.js';
import { Db } from '../infra/db.js';
import { LogService } from './log.service.js';

// Tiền tố controller phải đúng là tiền tố khai ở gateway (SEC-01) — đường con nằm ở từng phương thức.
@Controller('van-hanh')
export class LogController {
  constructor(
    private readonly logs: LogService,
    private readonly db: Db,
  ) {}

  @Roles('QUAN_TRI')
  @Get('logs')
  danhSach() {
    return this.logs.danhSach();
  }

  @Roles('QUAN_TRI')
  @Get('logs/tra')
  tra(@Query('traceId') traceId: string | undefined) {
    return this.logs.traMa(traceId ?? '');
  }

  @Roles('QUAN_TRI')
  @Get('logs/dang-ghi/:service')
  xem(
    @Param('service') service: string,
    @Query('muc') muc: string | undefined,
    @Query('traceId') traceId: string | undefined,
    @Query('so') so: string | undefined,
  ) {
    return this.logs.xem(service, {
      muc,
      traceId: traceId || undefined,
      so: so ? Math.min(Math.max(Number(so) || 500, 1), 2000) : undefined,
    });
  }

  /** Tải về ghi một dòng nhật ký: log mang email, tên khách — tải ra là dữ liệu rời máy chủ. */
  @Roles('QUAN_TRI')
  @Get('logs/:ten/tai')
  async tai(@CurrentUser() me: AuthUser, @Param('ten') ten: string, @Res() res: Response): Promise<void> {
    const luong = this.logs.moTepNen(ten);
    await emit(this.db, 'van_hanh.log_tai', { action: 'VAN_HANH_LOG_TAI', actorId: me.id, targetLabel: ten });
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', tenTepTaiVe(ten));
    luong.pipe(res);
  }

  @Roles('QUAN_TRI')
  @Delete('logs/:ten')
  @HttpCode(204)
  async xoa(@CurrentUser() me: AuthUser, @Param('ten') ten: string): Promise<void> {
    await this.logs.xoaTepNen(ten, me);
  }
}
