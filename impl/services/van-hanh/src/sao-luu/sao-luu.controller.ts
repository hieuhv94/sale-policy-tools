import { Controller, Delete, Get, HttpCode, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, tenTepTaiVe, type AuthUser } from '@csbh/http-kit';
import { SaoLuuService } from './sao-luu.service.js';

@Controller('van-hanh')
export class SaoLuuController {
  constructor(private readonly saoLuu: SaoLuuService) {}

  @Roles('QUAN_TRI')
  @Get('sao-luu')
  async danhSach() {
    return { csdl: await this.saoLuu.banCsdl(), khoTep: await this.saoLuu.banChup() };
  }

  /** Tải ghi một dòng nhật ký: bản sao lưu là TOÀN BỘ dữ liệu — mang nó ra là việc phải có vết. */
  @Roles('QUAN_TRI')
  @Get('sao-luu/csdl/:ten/tai')
  async tai(@CurrentUser() me: AuthUser, @Param('ten') ten: string, @Res() res: Response): Promise<void> {
    const { luong, tenTai } = await this.saoLuu.moCsdl(ten, me);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', tenTepTaiVe(tenTai));
    luong.pipe(res);
  }

  @Roles('QUAN_TRI')
  @Delete('sao-luu/csdl/:ten')
  @HttpCode(204)
  async xoaCsdl(@CurrentUser() me: AuthUser, @Param('ten') ten: string, @Query('caBanSaoNgoai') ca?: string): Promise<void> {
    await this.saoLuu.xoaCsdl(ten, ca === '1' || ca === 'true', me);
  }

  @Roles('QUAN_TRI')
  @Delete('sao-luu/kho-tep/:moc')
  @HttpCode(204)
  async xoaChup(@CurrentUser() me: AuthUser, @Param('moc') moc: string, @Query('caBanSaoNgoai') ca?: string): Promise<void> {
    await this.saoLuu.xoaChup(moc, ca === '1' || ca === 'true', me);
  }
}
