/**
 * API giữa các service. Chín service kia hỏi identity "người này được xem hồ sơ
 * của ai" thay vì tự đọc lược đồ idn — ranh giới sở hữu dữ liệu ở AD-02.
 *
 * Cùng nằm trong mạng `internal` không phải là căn cứ để tin nhau: mọi request
 * ở đây bắt buộc có token dịch vụ đúng audience (AUTH-21).
 */
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Db } from '../infra/db.js';
import { AccountCache } from '../infra/account-cache.js';
import { ServiceOnly } from '@csbh/http-kit';

@ServiceOnly()
@Controller('internal')
export class InternalController {
  constructor(
    private readonly db: Db,
    private readonly accounts: AccountCache,
  ) {}

  /**
   * Trạng thái tài khoản cho service khác. Chúng không có quyền trên schema idn
   * nên không tự đọc được; đi qua đây thì bản ghi vào đúng khoá Redis dùng chung,
   * và lần sau chúng đọc thẳng cache không phải hỏi lại (AUTH-07).
   */
  @Get('account/:userId')
  async account(@Param('userId') userId: string) {
    const state = await this.accounts.get(userId);
    if (!state) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    return state;
  }

  @Get('scope/:userId')
  async scope(@Param('userId') userId: string) {
    const rows = await this.db.q<{ user_id: string }>(
      `SELECT user_id FROM idn.scope_user_ids($1)`,
      [userId],
    );
    return { userId, scopeUserIds: rows.map((r) => r.user_id) };
  }
}
