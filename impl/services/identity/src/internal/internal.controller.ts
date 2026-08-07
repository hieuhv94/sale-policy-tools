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

  /**
   * Địa chỉ thư của những người liên quan tới hồ sơ do TDV này lập.
   *
   * `notification` nhận được danh sách VAI TRÒ trong sự kiện (bảng bước muc 3)
   * chứ không nhận địa chỉ. Dịch vai trò sang người cụ thể phải làm ở đây vì
   * phép dịch đó đọc cây tổ chức: "kế toán" của hồ sơ này là cấp trên gần nhất
   * của TDV, "TBP" là người duyệt của bộ phận TDV. Đổi người giữ chức chỉ là đổi
   * một dòng trong idn, không service nào khác phải biết.
   */
  @Get('notify-targets/:tdvUserId')
  async notifyTargets(@Param('tdvUserId') tdvUserId: string) {
    const rows = await this.db.q<{
      target_user_id: string;
      target_role: string;
      target_email: string;
      target_name: string;
    }>(`SELECT * FROM idn.notify_targets($1)`, [tdvUserId]);
    return {
      tdvUserId,
      targets: rows.map((r) => ({
        userId: r.target_user_id,
        role: r.target_role,
        email: r.target_email,
        fullName: r.target_name,
      })),
    };
  }
}
