/**
 * Cấu hình SLA — đọc và đổi số ngày (YCNV muc 2.7, NTF-12).
 *
 * Đặt ở `policy` chứ không ở `sla-worker`: đây là một thao tác QUẢN TRỊ qua
 * giao diện, mà sla-worker là tiến trình nền không mở cổng HTTP nào. sla-worker
 * chỉ ĐỌC cấu hình này.
 */
import { Injectable } from '@nestjs/common';
import { WAITING } from '@csbh/domain-policy';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';

@Injectable()
export class SlaConfigService {
  constructor(private readonly db: Db) {}

  async get() {
    const r = await this.db.one<{ days: number; updated_at: Date }>(
      `SELECT days, updated_at FROM pol.sla_config`,
    );
    return {
      days: r?.days ?? 14,
      updatedAt: r?.updated_at ?? null,
      // Nói rõ quy tắc ngay trong câu trả lời của API: SLA tính cả cuối tuần,
      // không trừ ngày lễ. Đây là chỗ người dùng hay giả định ngược lại.
      countsWeekends: true,
      remindDaysBefore: 1,
    };
  }

  /**
   * Đổi số ngày và TÍNH LẠI hạn cho mọi hồ sơ đang chờ.
   *
   * Tính từ `sla_started_at + N ngày`, KHÔNG phải "hạn cũ cộng thêm chênh lệch".
   * Hai cách cho kết quả khác nhau nếu SLA đổi hai lần, và cách thứ hai làm hạn
   * phụ thuộc vào lịch sử thay đổi cấu hình — không ai giải thích nổi cho kế toán
   * vì sao hai hồ sơ vào cùng ngày lại có hai hạn khác nhau.
   */
  async set(days: number, me: AuthUser) {
    return this.db.tx(async (c) => {
      const before = await c.query<{ days: number }>(`SELECT days FROM pol.sla_config`);
      await c.query(
        `UPDATE pol.sla_config SET days = $1, updated_by = $2, updated_at = now() WHERE id`,
        [days, me.id],
      );
      const upd = await c.query(
        `UPDATE pol.policy
            SET sla_due_at = sla_started_at + ($1 || ' days')::interval
          WHERE sla_started_at IS NOT NULL AND status::text = ANY($2::text[])`,
        [days, [...WAITING]],
      );
      // Nhật ký đi qua outbox: role csbh_pol không ghi được vào schema aud.
      await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
        'sla.config_changed',
        JSON.stringify({
          entity: 'sla_config',
          actorId: me.id,
          actorRole: me.role,
          before: { days: before.rows[0]?.days ?? null },
          after: { days },
          recalculated: upd.rowCount ?? 0,
          at: new Date().toISOString(),
        }),
      ]);
      return { days, recalculated: upd.rowCount ?? 0 };
    });
  }
}
