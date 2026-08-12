/**
 * API giữa các service. Chín service kia hỏi identity "người này được xem hồ sơ
 * của ai" thay vì tự đọc lược đồ idn — ranh giới sở hữu dữ liệu ở AD-02.
 *
 * Cùng nằm trong mạng `internal` không phải là căn cứ để tin nhau: mọi request
 * ở đây bắt buộc có token dịch vụ đúng audience (AUTH-21).
 */
import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
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

  /**
   * Tên hiển thị của một loạt người dùng.
   *
   * `reporting` cần "người đề nghị" và "TDV phụ trách" hiện ra bằng TÊN chứ
   * không phải uuid. Read-model lưu lại tên đã tra được — không phải để đỡ một
   * lời gọi, mà vì báo cáo về hồ sơ cũ phải đọc được cả sau khi người đó nghỉ
   * việc và tài khoản đã bị vô hiệu hoá.
   */
  @Post('users/names')
  @HttpCode(200)
  async names(@Body() body: unknown) {
    const ids = (body as { userIds?: unknown }).userIds;
    if (!Array.isArray(ids) || ids.length > 500) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'userIds',
        message: 'userIds phải là mảng tối đa 500 phần tử',
      });
    }
    if (ids.length === 0) return {};
    const rows = await this.db.q<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM idn.app_user WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return Object.fromEntries(rows.map((r) => [r.id, r.full_name]));
  }

  /**
   * TDV này đã có Trưởng bộ phận quản lý chưa.
   *
   * `policy` hỏi TRƯỚC khi cho gửi hồ sơ. Trưởng bộ phận không còn bắt buộc lúc
   * tạo tài khoản, nên chỗ duy nhất còn chặn được là đây — hồ sơ gửi đi khi
   * chưa có người duyệt sẽ nằm ở "Chờ TBP duyệt" mà không vào hộp việc của ai,
   * vì hộp việc của TBP suy từ `approver_user_id` (`idn.scope_user_ids`).
   *
   * Trả riêng một câu hỏi hẹp chứ không dùng lại `notify-targets`: câu kia trả
   * cả địa chỉ thư của mọi người liên quan, và một service chỉ cần biết "có hay
   * không" thì không nên cầm chỗ dữ liệu đó.
   */
  @Get('approver/:tdvUserId')
  async approver(@Param('tdvUserId') tdvUserId: string) {
    const r = await this.db.one<{ approver_user_id: string | null; role: string }>(
      `SELECT approver_user_id, role::text AS role FROM idn.app_user WHERE id = $1`,
      [tdvUserId],
    );
    if (!r) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    return { tdvUserId, role: r.role, approverUserId: r.approver_user_id };
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
   * của TDV, "TBP" là người duyệt gán thẳng cho TDV đó. Đổi người duyệt chỉ là
   * đổi một cột trong idn, không service nào khác phải biết.
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
