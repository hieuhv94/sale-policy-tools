/**
 * Nghe MỌI sự kiện trên bus. Khác với notification (chỉ nghe thứ có người nhận)
 * và document (chỉ nghe vòng đời file), nhật ký phải thấy tất cả.
 *
 * Queue khai báo lúc khởi động và không bao giờ xoá — điều kiện để tắt
 * audit-service mà không mất vết: sự kiện nằm chờ trong queue bền rồi được ghi
 * bù khi service trở lại (AUD-11).
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS } from '@csbh/bus';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AuditConsumer.name);
  readonly bus = new Bus();
  private tag: string | undefined;

  constructor(private readonly audit: AuditService) {}

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(BUS.queues.audit, BUS.queues.auditDlq, BUS.bindings.audit);
    if (process.env.AUD_CONSUME === '0') return;
    this.tag = await this.bus.consume(BUS.queues.audit, async (e) => {
      const outcome = await this.audit.record({
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
