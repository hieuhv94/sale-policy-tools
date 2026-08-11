import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ROLE_VALUES, UsersService } from './users.service.js';
import { DepartmentsService } from './departments.service.js';
import { CurrentUser, email, oneOf, opt, pageOf, Roles, secret, str, validate, type AuthUser } from '@csbh/http-kit';

/**
 * Đọc một trường LIÊN KẾT thẳng từ thân request, không qua `validate`.
 *
 * `opt()` biến chuỗi rỗng thành `undefined` (`validate.ts:92`) — đúng cho hầu
 * hết trường, nhưng ở đây nó xoá mất một tín hiệu có nghĩa: thiếu trường là
 * "không đụng tới", còn chuỗi rỗng là "GỠ liên kết". Gộp hai thứ đó lại thì
 * không bao giờ gỡ được một cấp trên đã gán nhầm — và triệu chứng là bấm Lưu
 * xong ô vẫn còn nguyên giá trị cũ, không có lỗi nào.
 *
 * Trả `undefined` = không có trong thân; `''` = gỡ; chuỗi khác = đặt mới.
 */
function lienKet(body: unknown, khoa: string, max: number): string | undefined {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(raw, khoa)) return undefined;
  const v = raw[khoa];
  if (v === null || v === '') return '';
  return str(1, max).parse(v, khoa);
}

/** Toàn bộ nhóm route này chỉ dành cho Quản trị hệ thống (ONB-02). */
@Roles('QUAN_TRI')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.users.list(pageOf({ limit, offset }));
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = validate(body, {
      email: email(),
      username: str(2, 60),
      fullName: str(2, 200),
      role: oneOf(...ROLE_VALUES),
      defaultPassword: secret(8),
      departmentCode: opt(str(1, 40)),
      parentUsername: opt(str(1, 60)),
    });
    return this.users.create(b, me.id);
  }

  /**
   * KHÔNG có `role` trong danh sách trường sửa được — xem chú thích ở
   * `UsersService.update`. Người sửa về sau đừng thêm vào đây mà không đọc chỗ đó.
   */
  @Patch(':id')
  @HttpCode(200)
  update(@Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, { fullName: opt(str(2, 200)) });
    const departmentCode = lienKet(body, 'departmentCode', 40);
    const parentUsername = lienKet(body, 'parentUsername', 60);
    return this.users.update(id, {
      ...(b.fullName !== undefined ? { fullName: b.fullName } : {}),
      ...(departmentCode !== undefined ? { departmentCode } : {}),
      ...(parentUsername !== undefined ? { parentUsername } : {}),
    });
  }

  @Post(':id/resend-invite')
  @HttpCode(200)
  resend(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.users.resendInvite(id, me.id);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string) {
    return this.users.setActive(id, false);
  }

  @Post(':id/activate-account')
  @HttpCode(200)
  reactivate(@Param('id') id: string) {
    return this.users.setActive(id, true);
  }
}

/**
 * Bộ phận và người duyệt. Cũng chỉ Quản trị hệ thống (ONB-02).
 *
 * Tách controller riêng thay vì nhét vào `admin/users`: tiền tố đường dẫn khác
 * nhau, và gateway so khớp theo ĐOẠN đường dẫn (`resolveUpstream`) nên
 * `/admin/departments` phải được kể tên trong danh sách trắng như một mục riêng.
 */
@Roles('QUAN_TRI')
@Controller('admin/departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  list() {
    return this.departments.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: unknown) {
    const b = validate(body, { code: str(1, 40), name: str(1, 200) });
    return this.departments.create(b.code, b.name);
  }

  @Post(':id/approvers')
  @HttpCode(200)
  addApprover(@Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, { userId: str(36, 36) });
    // `isPrimary` là boolean nên không đi qua `validate` được — bộ kiểm chỉ có
    // str/int/money/oneOf. Đọc thẳng và mặc định `true`, giống cách
    // `contracts.controller.ts` xử lý `required`.
    const isPrimary = (body as { isPrimary?: unknown })?.isPrimary !== false;
    return this.departments.addApprover(id, b.userId, isPrimary);
  }

  @Delete(':id/approvers/:userId')
  @HttpCode(200)
  removeApprover(@Param('id') id: string, @Param('userId') userId: string) {
    return this.departments.removeApprover(id, userId);
  }
}
