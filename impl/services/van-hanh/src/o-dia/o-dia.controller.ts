import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '@csbh/http-kit';
import { ODiaService } from './o-dia.service.js';
import { TacTuService } from '../tac-tu/tac-tu.service.js';

@Controller('van-hanh')
export class ODiaController {
  constructor(
    private readonly oDia: ODiaService,
    private readonly tacTu: TacTuService,
  ) {}

  @Roles('QUAN_TRI')
  @Get('o-dia')
  async xem() {
    const [theoO, theoHangMuc, cauHinh, lichSuDuLieu, lichSuNgoai, docker] = await Promise.all([
      this.oDia.theoO(),
      this.oDia.theoHangMuc(),
      this.oDia.cauHinh(),
      this.oDia.lichSu('du-lieu', 30),
      this.oDia.lichSu('ban-sao-ngoai', 30),
      // Cỡ từng volume và ảnh Docker — do tác tử đo mỗi giờ (`0254`); `van-hanh` không gắn
      // volume dữ liệu Postgres/MinIO chỉ để đo. Rỗng khi tác tử chưa từng chạy.
      this.tacTu.doDocker(),
    ]);
    return {
      theoO,
      theoHangMuc,
      theoDocker: docker,
      nguong: cauHinh.nguong,
      guiThu: cauHinh.guiThu,
      lichSu: { 'du-lieu': lichSuDuLieu, 'ban-sao-ngoai': lichSuNgoai },
    };
  }

  @Roles('QUAN_TRI')
  @Put('o-dia/nguong')
  async datNguong(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = (body ?? {}) as { nguong?: unknown; guiThu?: unknown };
    return this.oDia.datNguong(Number(b.nguong), b.guiThu !== false, me);
  }
}
