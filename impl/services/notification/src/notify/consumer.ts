/**
 * Nối hàng đợi RabbitMQ vào `NotifyService`.
 *
 * Queue được KHAI BÁO lúc khởi động và không bao giờ xoá. Đó là điều kiện để
 * tắt notification mà bước duyệt vẫn hoàn tất và thư vẫn được gửi bù khi service
 * trở lại (INT-06): sự kiện nằm chờ trong queue bền, không rơi vào hư vô như khi
 * publish vào một exchange chưa ai bind.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS } from '@csbh/bus';
import { NotifyService } from './notify.service.js';

@Injectable()
export class NotifyConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotifyConsumer.name);
  readonly bus = new Bus();
  private tag?: string;

  constructor(private readonly notify: NotifyService) {}

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(
      BUS.queues.notification,
      BUS.queues.notificationDlq,
      BUS.bindings.notification,
    );
    if (process.env.NTF_CONSUME === '0') {
      this.log.warn('NTF_CONSUME=0 — chỉ khai báo hàng đợi, không tiêu thụ');
      return;
    }
    this.tag = await this.bus.consume(BUS.queues.notification, async (e) => {
      const outcome = await this.notify.handle({
        eventId: e.eventId,
        routingKey: e.routingKey,
        payload: e.payload,
      });
      this.log.debug(`${e.routingKey} ${e.eventId} -> ${outcome}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tag) await this.bus.cancel(this.tag);
    await this.bus.close();
  }
}
