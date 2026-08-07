/**
 * API xem hàng đợi lỗi. Thư hỏng phải NHÌN THẤY ĐƯỢC, nếu không thì "đã gửi
 * thông báo rồi" là câu không ai kiểm chứng được (NTF-05).
 */
import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, pageOf, paged, pageSql, type AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { NotifyService } from './notify.service.js';

@Controller('notifications')
export class NotifyController {
  constructor(
    private readonly db: Db,
    private readonly notify: NotifyService,
  ) {}

  @Roles('QUAN_TRI')
  @Get('dead-letters')
  async deadLetters(@Query() q: { limit?: string; offset?: string; open?: string }) {
    const p = pageOf(q);
    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT id, event_id, routing_key, attempts, last_error, failed_at, resolved_at,
              count(*) OVER() AS total_count
         FROM ntf.dead_letter
        WHERE ($1::boolean IS NOT TRUE OR resolved_at IS NULL)
        ORDER BY failed_at DESC ${pageSql(2)}`,
      [q.open === 'true', p.limit, p.offset],
    );
    return paged(rows, p);
  }

  @Roles('QUAN_TRI')
  @Get('sent')
  async sent(@Query() q: { limit?: string; offset?: string; policyId?: string }) {
    const p = pageOf(q);
    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT id, event_id, routing_key, policy_id, to_addresses, subject, thread_key, sent_at,
              count(*) OVER() AS total_count
         FROM ntf.sent_mail
        WHERE ($1::uuid IS NULL OR policy_id = $1)
        ORDER BY sent_at DESC ${pageSql(2)}`,
      [q.policyId ?? null, p.limit, p.offset],
    );
    return paged(rows, p);
  }

  /**
   * Gửi lại một thư trong DLQ. Chạy lại đúng đường xử lý cũ, kể cả bước chống
   * trùng — sự kiện đã gửi thành công ở lần khác thì lần này trả `duplicate`.
   */
  @Roles('QUAN_TRI')
  @Post('dead-letters/:id/retry')
  async retry(@CurrentUser() _me: AuthUser, @Param('id') id: string, @Body() _b: unknown) {
    const row = await this.db.one<{ event_id: string; routing_key: string; payload: unknown }>(
      `SELECT event_id, routing_key, payload FROM ntf.dead_letter WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException({ code: 'DEAD_LETTER_NOT_FOUND' });

    const outcome = await this.notify.handle({
      eventId: row.event_id,
      routingKey: row.routing_key,
      payload: row.payload as Record<string, unknown>,
    });
    if (outcome === 'sent' || outcome === 'duplicate') {
      await this.db.q(`UPDATE ntf.dead_letter SET resolved_at = now() WHERE id = $1`, [id]);
    }
    return { outcome };
  }
}
