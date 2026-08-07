import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, int, money, opt, Roles, str, validate, type AuthUser } from '@csbh/http-kit';
import { CustomersService } from './customers.service.js';
import { taxId } from './tax-id.js';

/** Ban lãnh đạo chỉ đọc; mọi endpoint ghi ở đây đều loại vai trò đó ra (AUTH-13). */
const WRITERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'QUAN_TRI'];

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  search(@CurrentUser() me: AuthUser, @Query('q') q?: string) {
    return this.customers.search(q, me);
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
      ownerIdNumber: opt(str(1, 60)),
      debt: opt(money()),
      provinceCode: opt(str(1, 40)),
      hospitalCode: opt(str(1, 40)),
      channelCode: opt(str(1, 40)),
    });
    return this.customers.create(b, me);
  }

  @Roles(...WRITERS)
  @Patch(':id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      name: opt(str(1, 300)),
      registeredAddress: opt(str(1, 500)),
      deliveryAddress: opt(str(1, 500)),
      ownerName: opt(str(1, 200)),
      ownerTitle: opt(str(1, 120)),
      ownerIdNumber: opt(str(1, 60)),
      idNumber: opt(taxId()),
      debt: opt(money()),
      provinceCode: opt(str(1, 40)),
      hospitalCode: opt(str(1, 40)),
      channelCode: opt(str(1, 40)),
      tdvUserId: opt(str(36, 36)),
    });
    return this.customers.update(id, b, me);
  }

  @Roles(...WRITERS)
  @Delete(':id')
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.remove(id, me);
  }
}
