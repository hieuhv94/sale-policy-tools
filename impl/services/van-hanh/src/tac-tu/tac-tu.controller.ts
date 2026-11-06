import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '@csbh/http-kit';
import { TacTuService } from './tac-tu.service.js';

@Controller('van-hanh')
export class TacTuController {
  constructor(private readonly tacTu: TacTuService) {}

  @Roles('QUAN_TRI')
  @Get('tac-tu')
  async xem() {
    const [nhip, container, docker, viec] = await Promise.all([
      this.tacTu.nhipTim(),
      this.tacTu.container(),
      this.tacTu.doDocker(),
      this.tacTu.viecGanDay(),
    ]);
    return { ...nhip, container, docker, viec };
  }

  /** Xếp việc cho tác tử; giao diện hỏi lại `GET /van-hanh/viec/:id` tới khi xong. */
  @Roles('QUAN_TRI')
  @Post('sao-luu/chay-ngay')
  @HttpCode(202)
  async chayNgay(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    return this.tacTu.chayNgay((body as { loai?: unknown } | undefined)?.loai, me);
  }

  @Roles('QUAN_TRI')
  @Get('viec/:id')
  async viec(@Param('id') id: string) {
    return this.tacTu.motViec(id);
  }
}
