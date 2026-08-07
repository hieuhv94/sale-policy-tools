import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ROLE_VALUES, UsersService } from './users.service.js';
import { CurrentUser, email, oneOf, opt, Roles, secret, str, validate, type AuthUser } from '@csbh/http-kit';

/** Toàn bộ nhóm route này chỉ dành cho Quản trị hệ thống (ONB-02). */
@Roles('QUAN_TRI')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
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
