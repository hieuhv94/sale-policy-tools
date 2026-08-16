import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ROLE_VALUES, UsersService } from './users.service.js';
import { CurrentUser, email, oneOf, opt, pageOf, Roles, str, validate, type AuthUser } from '@csbh/http-kit';

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
    });
    return this.users.create(b, me.id);
  }

  /**
   * CHỈ họ tên. `role` đã bị gỡ hẳn ở `0032` — xem chú thích ở `UpdateUserInput`.
   * Người sửa về sau đừng thêm nó vào đây mà không đọc chỗ đó.
   */
  @Patch(':id')
  @HttpCode(200)
  update(@Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, { fullName: opt(str(2, 200)) });
    return this.users.update(id, {
      ...(b.fullName !== undefined ? { fullName: b.fullName } : {}),
    });
  }

  /** Người này đang giữ hồ sơ nào — hỏi trước khi mở hộp thoại vô hiệu hoá. */
  @Get(':id/ban-giao')
  banGiao(@Param('id') id: string) {
    return this.users.xemTruocBanGiao(id);
  }

  @Post(':id/resend-invite')
  @HttpCode(200)
  resend(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.users.resendInvite(id, me.id);
  }

  /**
   * Vô hiệu hoá — đòi gõ lại TÊN ĐĂNG NHẬP VÀ chọn người nhận bàn giao (`0032`).
   *
   * `confirmUsername` (trước `0036` là `confirmName`, gõ lại họ tên) và
   * `successorId` đọc qua `validate` như mọi trường khác, nhưng cả hai là
   * `opt()`: chốt chặn nằm ở tầng service, nơi biết được người này có đang giữ
   * hồ sơ nào không. Bắt buộc ở DTO thì tài khoản chưa cầm hồ sơ nào cũng phải
   * chọn người nhận — một ô bắt buộc không có nghĩa gì.
   */
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body ?? {}, {
      confirmUsername: opt(str(1, 200)),
      successorId: opt(str(36, 36)),
    });
    return this.users.setActive(id, false, {
      ...(b.confirmUsername !== undefined ? { confirmUsername: b.confirmUsername } : {}),
      ...(b.successorId !== undefined ? { successorId: b.successorId } : {}),
      actorId: me.id,
    });
  }

  @Post(':id/activate-account')
  @HttpCode(200)
  reactivate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.users.setActive(id, true, { actorId: me.id });
  }
}
