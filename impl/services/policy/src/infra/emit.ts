/**
 * Ghi một sự kiện vào `pol.outbox` — trong CÙNG transaction với việc ghi nghiệp
 * vụ đã gọi nó.
 *
 * Mọi sự kiện đều mang `traceId` và `actorIp` lấy từ ngữ cảnh request. Nhật ký
 * cần cả hai (AUD-06), mà nơi phát sự kiện nằm sâu trong service còn hai thứ đó
 * chỉ có ở tầng HTTP. Lấy ở đây, một chỗ, thay vì truyền tay xuống từng lời gọi
 * — bỏ sót một chỗ thì dòng nhật ký đó thiếu vết, và thiếu vết là thứ không ai
 * phát hiện ra cho tới lúc cần điều tra.
 */
import type { PoolClient } from 'pg';
import { currentContext } from '@csbh/http-kit';

export async function emit(
  c: PoolClient,
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const ctx = currentContext();
  await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
    routingKey,
    JSON.stringify({ ...payload, traceId: ctx?.traceId ?? null, actorIp: ctx?.ip ?? null }),
  ]);
}
