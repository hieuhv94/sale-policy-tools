/**
 * Ghi sự kiện vào outbox TRONG CÙNG transaction với thay đổi nghiệp vụ (AD-03).
 *
 * Hai việc khác nhau đi chung một đường ở đây, và đó là chủ ý:
 *   - `catalog.changed`      -> audit ghi nhật ký giá trị trước/sau (CAT-13)
 *   - `catalog.price_changed`-> policy rà soát hồ sơ Nháp bị ảnh hưởng (CAT-18)
 *
 * Role csbh_cat KHÔNG có quyền ghi vào schema aud, nên "ghi nhật ký" ở đây bắt
 * buộc là phát sự kiện chứ không phải INSERT chéo schema. Ranh giới AD-02 ép ra
 * đúng kiến trúc: một transaction, một nguồn sự thật, không có ghi hai nơi.
 */
import type { PoolClient } from 'pg';

export type Change = { before: unknown; after: unknown };

export async function emit(
  c: PoolClient,
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await c.query(`INSERT INTO cat.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
    routingKey,
    JSON.stringify(payload),
  ]);
}

export const changeEvent = (
  entity: string,
  id: string,
  actorId: string,
  change: Change,
): Record<string, unknown> => ({
  entity,
  id,
  actorId,
  before: change.before,
  after: change.after,
  at: new Date().toISOString(),
});
