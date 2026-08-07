/**
 * Bơm `cus.outbox` lên bus. Cùng lý do đặt-trong-service như ở policy và
 * catalog: chỉ role của chính service đọc được schema của nó.
 */
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS, OutboxRelay } from '@csbh/bus';
import { Db } from './db.js';

@Injectable()
export class CustomerOutbox implements OnModuleInit, OnModuleDestroy {
  readonly bus = new Bus();
  readonly relay: OutboxRelay;

  constructor(db: Db) {
    this.relay = new OutboxRelay(db, 'cus.outbox', this.bus);
  }

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(
      BUS.queues.notification,
      BUS.queues.notificationDlq,
      BUS.bindings.notification,
    );
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
