/**
 * Đổi giá một sản phẩm — báo cho TDV của những CSBH ĐANG HIỆU LỰC có sản phẩm đó.
 *
 * Điều quan trọng nhất ở đây là thứ KHÔNG làm: hồ sơ đã ký không bị sửa một
 * dòng nào. Giá và ngưỡng đã đóng băng vào dòng hồ sơ lúc lập (muc 7); tự động
 * cập nhật lại là sửa một văn bản đã có chữ ký của Trưởng bộ phận. Hệ thống chỉ
 * báo, còn quyết định lập CSBH mới là của người (NTF-13, Hình 3).
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS } from '@csbh/bus';
import { Db } from '../infra/db.js';
import { Clients } from '../infra/clients.js';

@Injectable()
export class PriceChangedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PriceChangedConsumer.name);
  readonly bus = new Bus();
  private tag?: string;

  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(BUS.queues.policy, BUS.queues.policyDlq, BUS.bindings.policy);
    if (process.env.POL_CONSUME === '0') return;
    this.tag = await this.bus.consume(BUS.queues.policy, async (e) => {
      if (e.routingKey !== 'catalog.price_changed') return;
      const n = await this.handle(e.payload);
      this.log.log(`đổi giá ${String(e.payload['productCode'])}: ảnh hưởng ${n} CSBH hiệu lực`);
    });
  }

  /** Trả về số hồ sơ bị ảnh hưởng. Tách khỏi consumer để test gọi thẳng được. */
  async handle(payload: Record<string, unknown>): Promise<number> {
    const productId = String(payload['productId'] ?? '');
    if (!productId) return 0;

    const rows = await this.db.q<{
      id: string;
      code: string;
      customer_id: string;
      tdv_user_id: string | null;
      product_code_snap: string;
    }>(
      `SELECT p.id, p.code, p.customer_id, p.tdv_user_id, l.product_code_snap
         FROM pol.policy p
         JOIN pol.policy_line l ON l.policy_id = p.id
        WHERE l.product_id = $1 AND p.status = 'DANG_CO_HIEU_LUC'`,
      [productId],
    );
    if (rows.length === 0) return 0;

    for (const r of rows) {
      // Một sự kiện cho MỖI hồ sơ, không phải một sự kiện chung: mỗi hồ sơ có
      // TDV riêng, và thư phải tới đúng người phụ trách khách hàng đó.
      const cus = await this.clients.customer(r.customer_id).catch(() => undefined);
      await this.db.tx(async (c) => {
        await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
          'policy.price_impact',
          JSON.stringify({
            policyId: r.id,
            policyCode: r.code,
            customerId: r.customer_id,
            customerCode: cus?.code,
            customerName: cus?.name,
            tdvUserId: r.tdv_user_id,
            action: 'PRICE_IMPACT',
            toStatus: 'DANG_CO_HIEU_LUC',
            recipients: ['TDV'],
            productId,
            at: new Date().toISOString(),
            extra: {
              'Sản phẩm': `${r.product_code_snap}`,
              'Giá cũ': String(payload['oldAmount'] ?? '—'),
              'Giá mới': String(payload['newAmount'] ?? '—'),
            },
          }),
        ]);
      });
    }
    return rows.length;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tag) await this.bus.cancel(this.tag);
    await this.bus.close();
  }
}
