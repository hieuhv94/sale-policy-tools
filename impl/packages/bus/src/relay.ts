/**
 * Nửa sau của mẫu outbox: đọc bảng outbox của chính service rồi đẩy lên bus.
 *
 * Nửa đầu — ghi nghiệp vụ và ghi sự kiện trong CÙNG một transaction — đã nằm
 * trong từng service. Hai nửa cộng lại cho đúng một bảo đảm: **ít nhất một lần**.
 *
 * Không phải "đúng một lần", và cố đạt "đúng một lần" ở đây là sai chỗ. Giữa
 * `bus.publish` và `UPDATE published_at` luôn có một khe: tiến trình chết đúng
 * lúc đó thì lần bơm sau phát lại sự kiện đã phát. Chốt chống trùng nằm ở bên
 * NHẬN, bằng khoá duy nhất trên `event_id` — nơi duy nhất chặn được cả trường
 * hợp hai bản notification chạy song song (NTF-06).
 */
import { Logger } from '@nestjs/common';
import type { Bus } from './bus.js';

type Row = Record<string, unknown>;
type Runner = {
  tx<T>(fn: (c: { query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }> }) => Promise<T>): Promise<T>;
};

/** Chỉ nhận tên bảng dạng `schema.table` — tên đến từ hằng số trong mã, không từ request. */
const SAFE_TABLE = /^[a-z_]+\.[a-z_]+$/;

export class OutboxRelay {
  private readonly log = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Runner,
    private readonly table: string,
    private readonly bus: Bus,
  ) {
    if (!SAFE_TABLE.test(table)) throw new Error(`tên bảng outbox không hợp lệ: ${table}`);
  }

  /**
   * Đẩy một lô sự kiện chưa phát. Trả về số sự kiện đã đẩy.
   *
   * `ORDER BY seq` chứ không `ORDER BY created_at`: `now()` trong Postgres là
   * thời điểm bắt đầu TRANSACTION, nên mọi sự kiện phát trong cùng một bước
   * duyệt mang dấu thời gian giống hệt nhau. Sắp theo thời gian thì thư "đã
   * chuyển sang chờ kế toán" có thể đi trước thư "Trưởng bộ phận đã ký".
   *
   * `FOR UPDATE SKIP LOCKED` để chạy nhiều bản service cùng lúc mà không bản nào
   * phát lại phần việc của bản kia.
   */
  async pumpOnce(limit = 200): Promise<number> {
    return this.db.tx(async (c) => {
      const r = await c.query(
        `SELECT id, routing_key, payload FROM ${this.table}
          WHERE published_at IS NULL
          ORDER BY seq
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [limit],
      );
      for (const row of r.rows) {
        await this.bus.publish(row.id as string, row.routing_key as string, {
          eventId: row.id,
          routingKey: row.routing_key,
          ...(row.payload as Record<string, unknown>),
        });
        await c.query(`UPDATE ${this.table} SET published_at = now() WHERE id = $1`, [row.id]);
      }
      return r.rows.length;
    });
  }

  /**
   * Bơm định kỳ. Test KHÔNG dùng đường này — test gọi thẳng `pumpOnce()` để mỗi
   * khẳng định chạy sau một thời điểm xác định, thay vì chờ đồng hồ và đỏ ngẫu nhiên.
   */
  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pumpOnce().catch((e: unknown) => this.log.error(`bơm outbox hỏng: ${String(e)}`));
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
