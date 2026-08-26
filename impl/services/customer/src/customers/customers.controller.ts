import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, int, money, moneyKhongAm, opt, pageOf, Roles, str, validate, type AuthUser } from '@csbh/http-kit';
import { CustomersService } from './customers.service.js';
import { taxId } from './tax-id.js';

/** Ban lãnh đạo chỉ đọc; mọi endpoint ghi ở đây đều loại vai trò đó ra (AUTH-13). */
const WRITERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'QUAN_TRI'];

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  search(
    @CurrentUser() me: AuthUser,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    /** `true` = giấu khách đã ngừng hợp tác. Dùng cho ô chọn lúc lập hồ sơ (`0034`). */
    @Query('forNewPolicy') forNewPolicy?: string,
  ) {
    return this.customers.search(q, me, pageOf({ limit, offset }), {
      forNewPolicy: forNewPolicy === 'true',
    });
  }

  @Get(':id')
  byId(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.byId(id, me);
  }

  @Get(':id/documents')
  documents(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.listDocuments(id, me);
  }

  @Roles(...WRITERS)
  @Post(':id/documents')
  @HttpCode(201)
  attachDocument(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      kind: str(1, 60),
      fileName: str(1, 300),
      objectKey: str(1, 500),
      sizeBytes: money(),
    });
    return this.customers.attachDocument(id, b, me);
  }
  /**
   * Gỡ một hồ sơ pháp lý (`0069`).
   *
   * `@Roles(...WRITERS)` chỉ là cửa ngoài; phép kiểm thật — **đúng TDV phụ
   * trách khách hàng ấy** — nằm ở service, vì nó cần đọc dòng khách hàng ra mới
   * trả lời được.
   */
  @Roles(...WRITERS)
  @Delete(':id/documents/:documentId')
  removeDocument(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.customers.removeDocument(id, documentId, me);
  }


  @Roles(...WRITERS)
  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = validate(body, {
      code: str(1, 60),
      name: str(1, 300),
      // Loại khách hàng chỉ có ba giá trị (CUST-06).
      customerType: int(1, 3),
      registeredAddress: str(1, 500),
      ownerName: str(1, 200),
      idNumber: opt(taxId()),
      deliveryAddress: opt(str(1, 500)),
      ownerTitle: opt(str(1, 120)),
      phone: opt(str(1, 30)),
      ownerIdNumber: opt(str(1, 60)),
      debt: opt(moneyKhongAm()),
    });
    return this.customers.create(b, me);
  }

  @Roles(...WRITERS)
  @Patch(':id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      name: opt(str(1, 300)),
      /*
       * Loại khách hàng SỬA ĐƯỢC (`0023`).
       *
       * Trước đây chỉ đặt được lúc lập. Lý do cũ nghe hợp lý — nó quyết định
       * ngưỡng chiết khấu — nhưng thực tế khách hàng ĐỔI hạng, và cách duy nhất
       * còn lại là lập một khách hàng mới với mã mới, tức là cắt đôi lịch sử
       * CSBH của cùng một khách.
       *
       * An toàn với hồ sơ đã lập: mỗi dòng giữ `threshold_snap` của riêng nó, và
       * ngưỡng chỉ tra lại khi dòng được ghi lại. Hồ sơ đang chờ duyệt không
       * khoá sửa được nên chúng không đổi số dưới tay người duyệt.
       */
      customerType: opt(int(1, 3)),
      registeredAddress: opt(str(1, 500)),
      deliveryAddress: opt(str(1, 500)),
      ownerName: opt(str(1, 200)),
      ownerTitle: opt(str(1, 120)),
      phone: opt(str(1, 30)),
      ownerIdNumber: opt(str(1, 60)),
      idNumber: opt(taxId()),
      debt: opt(moneyKhongAm()),
      tdvUserId: opt(str(36, 36)),
    });
    return this.customers.update(id, b, me);
  }

  /**
   * Xem trước hậu quả của *Ngừng hợp tác* (`0034`).
   *
   * `@Roles('TDV')` chứ không phải `WRITERS`: chỉ TDV phụ trách bấm được, và
   * service còn kiểm đúng người nữa (`assertChinhTdv`).
   */
  @Roles('TDV')
  @Get(':id/ngung-hop-tac')
  xemTruocNgung(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.xemTruocNgung(id, me);
  }

  /**
   * MỘT thao tác thay cho *Xoá* và *Ngừng hợp tác* (`0034`).
   *
   * Giữ động từ HTTP `DELETE` vì với khách chưa có hồ sơ nào thì nó xoá thật;
   * còn khách đã có lịch sử thì nó chuyển trạng thái. Người gọi không phải chọn
   * — xem `CustomersService.ngungHopTac`.
   */
  @Roles('TDV')
  @Delete(':id')
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.ngungHopTac(id, me);
  }
}
