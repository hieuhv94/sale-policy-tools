import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  int,
  money,
  oneOf,
  opt,
  pageOf,
  Roles,
  str,
  validate,
  type AuthUser,
} from '@csbh/http-kit';
import { PRICE_TYPES, PRODUCT_STATUSES, ProductsService } from './products/products.service.js';
import { RulesService } from './rules/rules.service.js';
import { parseProductSheet } from './products/excel.js';

const isoDate = () => str(10, 10);

/**
 * Đọc thì mọi vai trò đã đăng nhập đều được — TDV cần danh mục để lập hồ sơ.
 * GHI thì chỉ Quản trị hệ thống, khai báo ngay trên từng route bằng @Roles (CAT-01).
 */
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly products: ProductsService,
    private readonly rules: RulesService,
  ) {}

  // --- Nhóm sản phẩm --------------------------------------------------------

  @Get('product-groups')
  listGroups() {
    return this.products.listGroups();
  }

  @Roles('QUAN_TRI')
  @Post('product-groups')
  @HttpCode(201)
  createGroup(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = validate(body, { code: str(1, 40), name: str(1, 200) });
    return this.products.createGroup(b.code, b.name, me.id);
  }

  @Roles('QUAN_TRI')
  @Delete('product-groups/:id')
  deleteGroup(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.products.deleteGroup(id, me.id);
  }

  // --- Sản phẩm -------------------------------------------------------------

  @Get('products')
  list(
    @Query('forNewPolicy') forNewPolicy?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.products.list(
      { forNewPolicy: forNewPolicy === 'true' },
      pageOf({ limit, offset }),
    );
  }

  @Get('products/:id')
  byId(@Param('id') id: string) {
    return this.products.byId(id);
  }

  @Roles('QUAN_TRI')
  @Post('products')
  @HttpCode(201)
  create(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = validate(body, {
      code: str(1, 60),
      name: str(1, 300),
      groupCode: str(1, 40),
    });
    return this.products.create(b, me.id);
  }

  @Roles('QUAN_TRI')
  @Patch('products/:id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      name: opt(str(1, 300)),
      // Trạng thái ngoài tập hai giá trị bị chặn ngay ở đây, trước khi tới CSDL (CAT-06).
      status: opt(oneOf(...PRODUCT_STATUSES)),
    });
    return this.products.update(id, b, me.id);
  }

  // --- Giá ------------------------------------------------------------------

  @Get('products/:id/prices')
  priceHistory(@Param('id') id: string) {
    return this.products.priceHistory(id);
  }

  @Get('products/:id/current-price')
  currentPrice(@Param('id') id: string, @Query('priceType') pt?: string, @Query('on') on?: string) {
    const b = validate({ priceType: pt, on }, { priceType: oneOf(...PRICE_TYPES), on: opt(isoDate()) });
    return this.products.currentPrice(id, b.priceType, b.on);
  }

  @Roles('QUAN_TRI')
  @Post('products/:id/prices')
  @HttpCode(201)
  setPrice(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      // Loại giá nào khác Giá bán Công ty đều bị chặn ở đây (CAT-03). Để `opt()`
      // vì danh mục chỉ còn một loại — biểu mẫu không có ô chọn nữa, và bắt gửi
      // một trường chỉ có đúng một giá trị hợp lệ là bắt gõ lại một hằng số.
      priceType: opt(oneOf(...PRICE_TYPES)),
      amount: money(),
      effectiveFrom: isoDate(),
    });
    return this.products.setPrice(
      id,
      b.priceType ?? 'GIA_BAN_CONG_TY',
      b.amount,
      b.effectiveFrom,
      me.id,
    );
  }

  @Roles('QUAN_TRI')
  @Post('products/import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async importProducts(
    @CurrentUser() me: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    const rows = await parseProductSheet(file?.buffer ?? Buffer.alloc(0));
    return this.products.importProducts(rows, me.id);
  }

  // --- Chiết khấu quy định --------------------------------------------------

  @Get('discount-rules')
  listRules(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.rules.list(pageOf({ limit, offset }));
  }

  @Roles('QUAN_TRI')
  @Post('discount-rules')
  @HttpCode(201)
  createRule(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = validate(body, {
      /*
       * Mã do Quản trị ĐẶT, không sinh tự động (`0024`).
       *
       * Mã này đi ra tới mặt người dùng: cột *Id* ở bảng quy định, cột *QĐCK*
       * trên từng dòng hồ sơ, và ô tìm kiếm khớp theo nó. Một uuid 36 ký tự
       * không ai đọc được, không nhớ được, không đọc qua điện thoại được.
       */
      code: str(1, 40),
      productGroupCode: opt(str(1, 40)),
      customerType: opt(int(1, 3)),
      effectiveFrom: isoDate(),
      thresholdRate2: int(0, 10_000),
    });
    return this.rules.create(b, me.id);
  }

  /**
   * Sửa NGƯỠNG và NGÀY HIỆU LỰC (`0028`).
   *
   * Hai khoá khớp không sửa được — đổi chúng là đổi thứ tự ưu tiên của cả bảng
   * (`specificity`). Ngày kết thúc thì không còn tồn tại từ 0020: quy định vô
   * thời hạn, muốn dừng thì xoá dòng hoặc khai một dòng cụ thể hơn đè lên.
   *
   * `effectiveFrom` bọc `opt()` vì vắng mặt là GIỮ NGUYÊN — cột `NOT NULL` nên
   * không có trạng thái "không có giá trị" nào để một lần gửi thiếu diễn đạt.
   */
  @Roles('QUAN_TRI')
  @Patch('discount-rules/:code')
  updateRule(@CurrentUser() me: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    const b = validate(body, {
      thresholdRate2: int(0, 10_000),
      effectiveFrom: opt(isoDate()),
    });
    return this.rules.update(code, b, me.id);
  }

  @Roles('QUAN_TRI')
  @Delete('discount-rules/:code')
  removeRule(@CurrentUser() me: AuthUser, @Param('code') code: string) {
    return this.rules.remove(code, me.id);
  }

  @Get('thresholds/resolve')
  resolve(
    @Query('productId') productId: string,
    @Query('customerType') customerType: string,
    @Query('on') on?: string,
  ) {
    const b = validate(
      { productId, customerType, on },
      { productId: str(1, 60), customerType: int(1, 3), on: opt(isoDate()) },
    );
    return this.rules.resolve(b);
  }
}
