import { Controller, Get, Header, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, oneOf, opt, Roles, validate, type AuthUser } from '@csbh/http-kit';
import { RenderService, type Size } from './render.service.js';

const READERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO'];

@Controller('policies')
export class RenderController {
  constructor(private readonly render: RenderService) {}

  /**
   * `format=html` trả về CHÍNH chuỗi HTML mà bản PDF được dựng từ đó.
   *
   * Đây không phải một endpoint gỡ lỗi. Nó là cách yêu cầu "file tải về khớp
   * bản đang xem" được bảo đảm bằng cấu trúc thay vì bằng lời hứa: giao diện
   * nhúng đúng chuỗi này, nên hai bản không thể lệch nhau (muc 11.1).
   */
  @Roles(...READERS)
  @Get(':id/render')
  async render_(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const b = validate(q, { size: opt(oneOf('a4p', 'a4l')), format: opt(oneOf('html', 'pdf')) });
    const size = (b.size ?? 'a4p') as Size;

    if ((b.format ?? 'pdf') === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await this.render.html(id, size, me));
      return;
    }
    const { body, code } = await this.render.pdf(id, size, me);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CSBH-${code}-${size}.pdf"`);
    res.end(body);
  }

  @Roles('TBP')
  @Post(':id/sign-file')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async sign(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const { draft, signed } = await this.render.sign(id, me);
    return {
      draftFileId: draft.id,
      signedFileId: signed.id,
      draftSha256: draft.sha256,
      signedSha256: signed.sha256,
      signature: signed.signature,
    };
  }
}
