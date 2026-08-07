/**
 * API nội bộ của catalog. `customer` gọi để kiểm mã danh mục, `policy` gọi để
 * tra giá và ngưỡng — không service nào đọc thẳng schema cat (AD-02).
 */
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { opt, ServiceOnly, str, validate } from '@csbh/http-kit';
import { LookupsService } from './lookups/lookups.service.js';

@ServiceOnly()
@Controller('internal/catalog')
export class CatalogInternalController {
  constructor(private readonly lookups: LookupsService) {}

  @Post('validate-codes')
  @HttpCode(200)
  validateCodes(@Body() body: unknown) {
    const b = validate(body, {
      provinceCode: opt(str(1, 40)),
      hospitalCode: opt(str(1, 40)),
      channelCode: opt(str(1, 40)),
    });
    return this.lookups.validateCodes(b);
  }

  @Get('lookups')
  list(@Query('kind') kind?: string) {
    const b = validate({ kind }, { kind: str(1, 20) });
    return this.lookups.list(b.kind as 'province');
  }
}
