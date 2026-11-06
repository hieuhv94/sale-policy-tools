/**
 * API giữa các service. Chín service kia hỏi identity "người này được xem hồ sơ
 * của ai" thay vì tự đọc lược đồ idn — ranh giới sở hữu dữ liệu ở AD-02.
 *
 * Cùng nằm trong mạng `internal` không phải là căn cứ để tin nhau: mọi request
 * ở đây bắt buộc có token dịch vụ đúng audience (AUTH-21).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Db } from '../infra/db.js';
import { AccountCache } from '../infra/account-cache.js';
import { ServiceOnly } from '@csbh/http-kit';

/**
 * Vai trò KHÔNG BAO GIỜ nhận thư hay thông báo của phần mềm (`0260`, chốt 06/11: *"đảm bảo ban
 * lãnh đạo sẽ không nhận bất kỳ thông báo nào"*).
 *
 * Đặt ở IDENTITY — chủ của vai trò tài khoản — chứ không ở `notification`: mọi người nhận (theo
 * hồ sơ, theo id cho lá "để biết", mọi Quản trị) đều đi qua ba đường dưới đây, và cả ba áp hằng
 * này, nên một đường gửi mới bên `notification` không phải nhớ gì.
 *
 * Tới `0260` điều ấy đúng TÌNH CỜ, và lỗ thật duy nhất đo được là lá "để biết": nó tra người đã
 * thao tác THEO ID, không qua phép chọn theo vai trò của bước (`pick`), nên bất kỳ ai từng chạm vào
 * hồ sơ đều nhận — kể cả một tài khoản Ban lãnh đạo nếu có ngày nó được cấp một thao tác.
 *
 * KHÔNG chặn hai lá thư của chính tài khoản (kích hoạt, đặt lại mật khẩu — `mailer.ts`): đó là
 * đường DUY NHẤT để người ấy có mật khẩu, không phải một thông báo nghiệp vụ.
 */
export const KHONG_NHAN_THONG_BAO: readonly string[] = ['BAN_LANH_DAO'];

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
   * Địa chỉ thư của một loạt người dùng CỤ THỂ, tra thẳng theo id (`0036`).
   *
   * Khác `notify-targets` ở chỗ căn bản: bên kia nhận bốn VAI TRÒ trên hồ sơ rồi
   * dịch sang người, còn ở đây `notification` đã biết chính xác cần gửi cho ai —
   * đó là danh sách những người đã từng thao tác lên hồ sơ, đọc ra từ nhật ký
   * của chính hồ sơ. Không có vai trò nào để dịch, chỉ còn việc tra địa chỉ.
   *
   * BỎ QUA tài khoản đã vô hiệu hoá: người đã nghỉ việc từng ký một hồ sơ vẫn
   * nằm trong nhật ký của nó mãi mãi, và gửi thư cho họ là gửi vào một hộp thư
   * không ai mở — hoặc tệ hơn, vào hộp thư công ty đã cấp lại cho người khác.
   */
  /**
   * Mọi Quản trị hệ thống đang hoạt động (`0253`) — người nhận thư cảnh báo ổ đĩa.
   * Sự kiện ấy không thuộc hồ sơ nào nên không có bốn cột người để tra theo.
   */
  @Get('users/quan-tri')
  async quanTri() {
    const rows = await this.db.q<{ userId: string; role: string; email: string; fullName: string }>(
      `SELECT id AS "userId", role::text AS role, email, full_name AS "fullName"
         FROM idn.app_user WHERE role = 'QUAN_TRI' AND is_active
          AND NOT (role::text = ANY($1::text[])) ORDER BY username`,
      [KHONG_NHAN_THONG_BAO],
    );
    return { targets: rows };
  }

  @Post('users/mail-targets')
  @HttpCode(200)
  async mailTargets(@Body() body: unknown) {
    const ids = (body as { userIds?: unknown }).userIds;
    if (!Array.isArray(ids) || ids.length > 200) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'userIds',
        message: 'userIds phải là mảng tối đa 200 phần tử',
      });
    }
    if (ids.length === 0) return { targets: [] };
    const rows = await this.db.q<{
      userId: string;
      role: string;
      email: string;
      fullName: string;
    }>(
      `SELECT id AS "userId", role::text AS role, email, full_name AS "fullName"
         FROM idn.app_user
        WHERE id = ANY($1::uuid[]) AND is_active AND NOT (role::text = ANY($2::text[]))`,
      [ids as string[], KHONG_NHAN_THONG_BAO],
    );
    return { targets: rows };
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
   * Những người này có tồn tại, còn hoạt động, và đúng vai trò không.
   *
   * Thay cho `GET approver/:tdvUserId` bị gỡ ở `0031`. Câu hỏi cũ là "TDV này đã
   * có người duyệt chưa" — nó suy từ `approver_user_id`, mà cột ấy không còn.
   * Câu hỏi mới là câu `policy` thật sự cần lúc TDV bấm gửi duyệt: **người vừa
   * được chọn có nhận việc này được không**.
   *
   * Trả cả `role` để phía gọi tự đối chiếu, thay vì nhận về một chữ "hợp lệ" —
   * `policy` cần biết chọn sai thành vai trò NÀO để nói cho người dùng.
   */
  @Post('users/check')
  @HttpCode(200)
  async check(@Body() body: { ids?: unknown }) {
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (ids.length === 0) return { users: {} };
    const rows = await this.db.q<{ id: string; role: string; is_active: boolean; name: string }>(
      `SELECT id, role::text AS role, is_active, full_name AS name
         FROM idn.app_user WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return {
      users: Object.fromEntries(
        rows.map((r) => [r.id, { role: r.role, isActive: r.is_active, fullName: r.name }]),
      ),
    };
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
   * Địa chỉ thư của bốn người được phân công trên một hồ sơ.
   *
   * `notification` nhận được danh sách VAI TRÒ trong sự kiện (bảng bước muc 3)
   * chứ không nhận địa chỉ. Phép dịch vai trò → người vẫn làm ở đây, nhưng từ
   * `0031` nó không còn đọc cây tổ chức: bốn người đã được ghi thẳng lên hồ sơ,
   * và ở đây chỉ còn việc tra địa chỉ thư của họ.
   *
   * Ba tham số sau nhận rỗng: hồ sơ Nháp chưa có ai được chọn, và sự kiện của nó
   * vẫn phải gửi được cho chính người lập.
   */
  @Get('notify-targets/:tdvUserId')
  async notifyTargets(
    @Param('tdvUserId') tdvUserId: string,
    @Query('tbp') tbp?: string,
    @Query('keToan') keToan?: string,
    @Query('saleAdmin') saleAdmin?: string,
  ) {
    const rows = await this.db.q<{
      target_user_id: string;
      target_role: string;
      target_email: string;
      target_name: string;
    }>(
      // `target_role` là vai trò THẬT của tài khoản (`u.role` trong `notify_targets`, `0031`).
      `SELECT * FROM idn.notify_targets($1,$2,$3,$4) WHERE NOT (target_role = ANY($5::text[]))`,
      [tdvUserId, tbp || null, keToan || null, saleAdmin || null, KHONG_NHAN_THONG_BAO],
    );
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
