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

  /**
   * Xoá một nhóm — đòi gõ lại MÃ NHÓM (`0036`).
   *
   * `@Body()` trên một `DELETE` là chuyện hiếm nhưng hợp lệ, và ở đây nó đúng
   * hơn hai lựa chọn kia: tham số truy vấn thì chuỗi xác nhận nằm trong URL và
   * đi thẳng vào log máy chủ, còn một header riêng thì không màn hình nào và
   * không lệnh `curl` nào của người vận hành nghĩ tới.
   */
  @Roles('QUAN_TRI')
  @Delete('product-groups/:id')
  deleteGroup(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body ?? {}, { confirm: opt(str(1, 60)) });
    return this.products.deleteGroup(id, b.confirm, me.id);
  }

  // --- Sản phẩm -------------------------------------------------------------

  /**
   * `q` tìm theo TÊN sản phẩm, `groupCode` lọc theo nhóm (`0049`).
   *
   * Cả hai chạy Ở MÁY CHỦ. Trước `0049` màn hình lấy 200 dòng đầu rồi lọc trên
   * trình duyệt, nên vượt 200 sản phẩm là gõ tên một mặt hàng CÓ THẬT vẫn ra
   * "không tìm thấy" — và không gì báo cho người dùng biết họ chỉ tìm trong một
   * phần (muc 11.3).
   */
  @Get('products')
  list(
    @Query('forNewPolicy') forNewPolicy?: string,
    @Query('q') q?: string,
    @Query('groupCode') groupCode?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.products.list(
      {
        forNewPolicy: forNewPolicy === 'true',
        // Chuỗi rỗng KHÔNG phải một điều kiện lọc. Màn hình gửi `q=` khi người
        // dùng vừa xoá hết ô tìm; hiểu nó là "tên bằng rỗng" thì kết quả rỗng và
        // họ thấy màn hình trắng ngay sau khi xoá từ khoá (cùng bẫy như RPT-03).
        q: q?.trim() || undefined,
        groupCode: groupCode?.trim() || undefined,
      },
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

  /**
   * Sửa sản phẩm. VÔ HIỆU HOÁ thì đòi gõ lại mã sản phẩm (`0036`).
   *
   * `confirm` là `opt()` ở đây chứ không bắt buộc: đổi tên sản phẩm là thao tác
   * nhẹ, hằng ngày, và bắt gõ lại mã cho nó là làm mòn chính chốt chặn ấy —
   * người dùng gõ mãi thành phản xạ rồi gõ luôn cả lúc vô hiệu hoá. Ai phải gõ
   * và khi nào thì `products.service` quyết, vì chỉ nó biết trạng thái đang đổi
   * theo chiều nào.
   */
  @Roles('QUAN_TRI')
  @Patch('products/:id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      name: opt(str(1, 300)),
      // Trạng thái ngoài tập hai giá trị bị chặn ngay ở đây, trước khi tới CSDL (CAT-06).
      status: opt(oneOf(...PRODUCT_STATUSES)),
      confirm: opt(str(1, 60)),
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

  /**
   * Hai Ô CHỌN, không ô tìm chữ (`0049`).
   *
   * Khách hàng chốt màn hình Chiết khấu lọc bằng nhóm sản phẩm và loại khách
   * hàng, bỏ hẳn ô gõ tự do. Hợp với dữ liệu: cả hai đều là tập giá trị đóng và
   * người dùng chọn từ danh sách, không ai phải nhớ để gõ đúng.
   *
   * `customerType` nhận đúng 1 · 2 · 3 và không nhận gì khác — nó đi thẳng vào
   * một cột `smallint`, nên chuỗi lạ phải bị chặn ở đây chứ không để Postgres
   * ném lỗi kiểu ra thành lỗi 500.
   */
  @Get('discount-rules')
  listRules(
    @Query('groupCode') groupCode?: string,
    @Query('customerType') customerType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const b = validate(
      { groupCode: groupCode?.trim() || undefined, customerType: customerType?.trim() || undefined },
      { groupCode: opt(str(1, 60)), customerType: opt(oneOf('1', '2', '3')) },
    );
    return this.rules.list(pageOf({ limit, offset }), {
      groupCode: b.groupCode,
      customerType: b.customerType === undefined ? undefined : Number(b.customerType),
    });
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

  /** Xoá một quy định — đòi gõ lại MÃ QUY ĐỊNH (`0036`). Xem `deleteGroup`. */
  @Roles('QUAN_TRI')
  @Delete('discount-rules/:code')
  removeRule(@CurrentUser() me: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    const b = validate(body ?? {}, { confirm: opt(str(1, 60)) });
    return this.rules.remove(code, b.confirm, me.id);
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
