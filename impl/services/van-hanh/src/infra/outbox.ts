/**
 * Sự kiện của `van-hanh` → nhật ký kiểm toán (`0252`), cùng đường mười service kia.
 *
 * KHÔNG đặt khoá `id` trong payload: `aud.audit_log.entity_id` là `uuid`, mà thứ bị tác
 * động ở đây (một tệp log, một bản sao lưu) mang TÊN chứ không mang uuid — đặt `id` là
 * dòng nhật ký hỏng ở `INSERT` và sự kiện vào hàng đợi lỗi. Tên đi qua `targetLabel`.
 */
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Bus, BUS, OutboxRelay } from '@csbh/bus';
import { kemNguCanh } from '@csbh/http-kit';
import { Db } from './db.js';

export async function emit(
  c: Pick<PoolClient, 'query'> | Db,
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const sql = `INSERT INTO ops.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`;
  const thamSo = [routingKey, JSON.stringify(kemNguCanh({ entity: 'van_hanh', at: new Date().toISOString(), ...payload }))];
  if (c instanceof Db) await c.q(sql, thamSo);
  else await c.query(sql, thamSo);
}

@Injectable()
export class VanHanhOutbox implements OnModuleInit, OnModuleDestroy {
  readonly bus = new Bus();
  readonly relay: OutboxRelay;

  constructor(db: Db) {
    this.relay = new OutboxRelay(db, 'ops.outbox', this.bus);
  }

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(BUS.queues.audit, BUS.queues.auditDlq, BUS.bindings.audit);
    if (process.env.OUTBOX_AUTO_PUMP !== '0') this.relay.start(1000);
  }

  pumpOnce(): Promise<number> {
    return this.relay.pumpOnce();
  }

  async onModuleDestroy(): Promise<void> {
    this.relay.stop();
    await this.bus.close();
  }
}
