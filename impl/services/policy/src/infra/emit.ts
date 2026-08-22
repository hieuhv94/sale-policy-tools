/**
 * Ghi một sự kiện vào `pol.outbox` — trong CÙNG transaction với việc ghi nghiệp
 * vụ đã gọi nó.
 *
 * Mọi sự kiện đều mang `traceId`, `actorIp` và danh tính người gọi, lấy từ ngữ
 * cảnh request qua `kemNguCanh()` (`0090`). Nhật ký cần cả bốn (AUD-06), mà nơi
 * phát sự kiện nằm sâu trong service còn chúng chỉ có ở tầng HTTP. Lấy ở một
 * chỗ thay vì truyền tay xuống từng lời gọi — bỏ sót một chỗ thì đúng dòng nhật
 * ký đó thiếu vết, và thiếu vết là thứ không ai phát hiện ra cho tới lúc cần
 * điều tra.
 */
import type { PoolClient } from 'pg';
import { kemNguCanh } from '@csbh/http-kit';

export async function emit(
  c: PoolClient,
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
    routingKey,
    JSON.stringify(kemNguCanh(payload)),
  ]);
}
