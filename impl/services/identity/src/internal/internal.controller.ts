/**
 * API giữa các service. Chín service kia hỏi identity "người này được xem hồ sơ
 * của ai" thay vì tự đọc lược đồ idn — ranh giới sở hữu dữ liệu ở AD-02.
 *
 * Cùng nằm trong mạng `internal` không phải là căn cứ để tin nhau: mọi request
 * ở đây bắt buộc có token dịch vụ đúng audience (AUTH-21).
 */
import { Controller, Get, Param } from '@nestjs/common';
import { Db } from '../infra/db.js';
import { ServiceOnly } from '../auth/decorators.js';

@ServiceOnly()
@Controller('internal')
export class InternalController {
  constructor(private readonly db: Db) {}

  @Get('scope/:userId')
  async scope(@Param('userId') userId: string) {
    const rows = await this.db.q<{ user_id: string }>(
      `SELECT user_id FROM idn.scope_user_ids($1)`,
      [userId],
    );
    return { userId, scopeUserIds: rows.map((r) => r.user_id) };
  }
}
