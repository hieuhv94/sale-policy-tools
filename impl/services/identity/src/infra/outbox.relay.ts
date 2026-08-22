/**
 * Bơm `idn.outbox` lên bus (`0091`).
 *
 * Cùng khuôn với bốn relay kia, và giống nhau là chủ ý: `OutboxRelay` dùng
 * chung cho cả năm, nên một bản lệch khuôn là một nhánh riêng trong đoạn mã khó
 * kiểm nhất của hệ thống.
 *
 * Chỉ khai queue `audit`. Bốn service kia còn khai `notification` và `policy` vì
 * có người nghe sự kiện của chúng; sự kiện tài khoản thì tới nay **chỉ nhật ký
 * quan tâm** — `audit` nghe `#` nên nó nhận hết mà không cần binding riêng.
 */
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS, OutboxRelay } from '@csbh/bus';
import { Db } from './db.js';

@Injectable()
export class IdentityOutbox implements OnModuleInit, OnModuleDestroy {
  readonly bus = new Bus();
  readonly relay: OutboxRelay;

  constructor(db: Db) {
    this.relay = new OutboxRelay(db, 'idn.outbox', this.bus);
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
