import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { CurrentUser, int, Roles, validate, type AuthUser } from '@csbh/http-kit';
import { SlaConfigService } from './sla-config.service.js';

@Controller('sla')
export class SlaConfigController {
  constructor(private readonly sla: SlaConfigService) {}

  /** Mọi vai trò trong luồng đều đọc được: hạn xử lý là thông tin của người làm việc. */
  @Get('config')
  get() {
    return this.sla.get();
  }

  @Roles('QUAN_TRI')
  @Put('config')
  @HttpCode(200)
  set(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = validate(body, { days: int(1, 365) });
    return this.sla.set(b.days, me);
  }
}
