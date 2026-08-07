/**
 * Bơm `pol.outbox` lên bus.
 *
 * Đặt trong chính policy chứ không dựng một service "relay" riêng: bảng outbox
 * thuộc schema pol và chỉ role csbh_pol đọc được. Một relay dùng chung sẽ phải
 * có quyền đọc cả chín schema — đúng thứ ranh giới sở hữu dữ liệu ở AD-02 dựng
 * lên để chặn.
 */
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS, OutboxRelay } from '@csbh/bus';
import { Db } from './db.js';

@Injectable()
export class PolicyOutbox implements OnModuleInit, OnModuleDestroy {
  readonly bus = new Bus();
  readonly relay: OutboxRelay;

  constructor(db: Db) {
    this.relay = new OutboxRelay(db, 'pol.outbox', this.bus);
  }

  async onModuleInit(): Promise<void> {
    // Khai báo queue của MỌI bên nhận trước khi phát sự kiện đầu tiên. RabbitMQ
    // vứt bỏ trong im lặng thư gửi vào exchange chưa ai bind, nên thiếu bước này
    // thì hệ thống chạy êm suốt và không ai nhận được gì.
    await this.bus.declareConsumer(
      BUS.queues.notification,
      BUS.queues.notificationDlq,
      BUS.bindings.notification,
    );
    await this.bus.declareConsumer(
      BUS.queues.document,
      BUS.queues.documentDlq,
      BUS.bindings.document,
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
