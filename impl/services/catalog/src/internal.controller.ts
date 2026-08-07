/**
 * API nội bộ của catalog. `customer` gọi để kiểm mã danh mục, `policy` gọi để
 * tra giá và ngưỡng — không service nào đọc thẳng schema cat (AD-02).
 */
import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { int, opt, ServiceOnly, str, validate } from '@csbh/http-kit';
import { LookupsService } from './lookups/lookups.service.js';
import { ProductsService } from './products/products.service.js';
import { RulesService } from './rules/rules.service.js';

@ServiceOnly()
@Controller('internal/catalog')
export class CatalogInternalController {
  constructor(
    private readonly lookups: LookupsService,
    private readonly products: ProductsService,
    private readonly rules: RulesService,
  ) {}

  /**
   * Ảnh chụp một sản phẩm tại thời điểm lập hồ sơ: mã, tên, Giá bán Công ty và
   * ngưỡng chiết khấu áp dụng.
   *
   * `policy` gọi đúng một lần rồi ĐÓNG BĂNG kết quả vào dòng hồ sơ. Nếu để nó
   * tra lại mỗi lần hiển thị thì hồ sơ đã gửi duyệt sẽ đổi số khi danh mục đổi
   * giá — chính là thứ việc đóng băng giá theo phiên bản sinh ra để tránh.
   */
  @Get('product-snapshot/:productId')
  async snapshot(
    @Param('productId') productId: string,
    @Query('customerType') customerType: string,
    @Query('channelCode') channelCode?: string,
    @Query('on') on?: string,
  ) {
    const q = validate(
      { customerType, channelCode, on },
      { customerType: int(1, 3), channelCode: opt(str(1, 40)), on: opt(str(10, 10)) },
    );
    const product = (await this.products.byId(productId)) as {
      id: string;
      code: string;
      name: string;
      status: string;
    };
    const price = await this.products.currentPrice(productId, 'GIA_BAN_CONG_TY', q.on);
    const threshold = await this.rules.resolve({ productId, ...q });
    return {
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      status: product.status,
      companyPrice: price.amount,
      thresholdRate2: threshold.thresholdRate2,
      thresholdSource: threshold.source,
    };
  }

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

  /**
   * Ảnh chụp NHIỀU sản phẩm trong một lời gọi.
   *
   * Hồ sơ 30 sản phẩm mà gọi từng cái là 30 vòng mạng nối tiếp — thời gian lập
   * hồ sơ tăng tuyến tính theo số dòng, và đó là màn hình người dùng ngồi chờ.
   */
  @Post('product-snapshots')
  @HttpCode(200)
  async snapshots(@Body() body: unknown) {
    const b = validate(body, {
      customerType: int(1, 3),
      channelCode: opt(str(1, 40)),
      on: opt(str(10, 10)),
    });
    const ids = (body as { productIds?: unknown }).productIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'productIds',
        message: 'productIds phải là mảng 1..200 phần tử',
      });
    }
    const out = [];
    for (const id of ids as string[]) {
      out.push(await this.snapshot(id, String(b.customerType), b.channelCode, b.on));
    }
    return out;
  }

  @Get('lookups')
  list(@Query('kind') kind?: string) {
    const b = validate({ kind }, { kind: str(1, 20) });
    return this.lookups.list(b.kind as 'province');
  }
}
