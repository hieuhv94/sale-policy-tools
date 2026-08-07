/**
 * Nối hàng đợi RabbitMQ vào `SyncService`.
 *
 * Queue khai báo lúc khởi động và không bao giờ xoá — điều kiện để tắt reporting
 * mà không mất một thay đổi nào: sự kiện nằm chờ trong queue bền rồi được đồng
 * bộ bù khi service trở lại. Đó cũng là lý do queue này được khai báo ở CẢ hai
 * relay (policy và customer), không chỉ ở đây: sự kiện phát trong lúc reporting
 * chưa từng khởi động lần nào vẫn phải có chỗ để rơi vào.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS } from '@csbh/bus';
import { SyncService } from './sync.service.js';

@Injectable()
export class ReportingConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ReportingConsumer.name);
  readonly bus = new Bus();
  private tag: string | undefined;

  constructor(private readonly sync: SyncService) {}

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(
      BUS.queues.reporting,
      BUS.queues.reportingDlq,
      BUS.bindings.reporting,
    );
    if (process.env.RPT_CONSUME === '0') {
      this.log.warn('RPT_CONSUME=0 — chỉ khai báo hàng đợi, không tiêu thụ');
      return;
    }
    this.tag = await this.bus.consume(BUS.queues.reporting, async (e) => {
      const outcome = await this.sync.handle({ routingKey: e.routingKey, payload: e.payload });
      this.log.debug(`${e.routingKey} ${e.eventId} -> ${outcome}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tag) await this.bus.cancel(this.tag);
    await this.bus.close();
  }
}
