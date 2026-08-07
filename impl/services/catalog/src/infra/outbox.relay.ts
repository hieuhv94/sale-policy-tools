/**
 * Bơm `cat.outbox` lên bus. Cùng lý do đặt-trong-service như ở policy: chỉ role
 * csbh_cat đọc được schema cat.
 */
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS, OutboxRelay } from '@csbh/bus';
import { Db } from './db.js';

@Injectable()
export class CatalogOutbox implements OnModuleInit, OnModuleDestroy {
  readonly bus = new Bus();
  readonly relay: OutboxRelay;

  constructor(db: Db) {
    this.relay = new OutboxRelay(db, 'cat.outbox', this.bus);
  }

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(
      BUS.queues.notification,
      BUS.queues.notificationDlq,
      BUS.bindings.notification,
    );
    await this.bus.declareConsumer(BUS.queues.policy, BUS.queues.policyDlq, BUS.bindings.policy);
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
