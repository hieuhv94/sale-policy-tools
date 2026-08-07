/**
 * Bộ hẹn giờ: quét SLA mỗi 5 phút, dọn dữ liệu mỗi ngày.
 *
 * Tách khỏi `SlaService` để test gọi thẳng `scan()` tại một thời điểm xác định.
 * Test chạy qua bộ hẹn giờ là test phụ thuộc vào việc bộ đếm có kịp nổ hay
 * chưa — đỏ ngẫu nhiên trên máy tải nặng và không chứng minh thêm điều gì.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS, OutboxRelay } from '@csbh/bus';
import { Db } from '@csbh/policy/infra';
import { SlaService } from './sla.service.js';
import { Clock } from './clock.js';

const SCAN_EVERY_MS = 5 * 60 * 1000;
const RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class Scheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(Scheduler.name);
  readonly bus = new Bus();
  readonly relay: OutboxRelay;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    db: Db,
    private readonly sla: SlaService,
    private readonly clock: Clock,
  ) {
    // sla-worker phát sự kiện vào CHÍNH `pol.outbox` (nó chạy dưới role csbh_pol),
    // nên nó cũng phải bơm được bảng đó lên bus — bằng không thư nhắc nằm lại
    // trong outbox cho tới lần policy-service bơm kế tiếp.
    this.relay = new OutboxRelay(db, 'pol.outbox', this.bus);
  }

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(
      BUS.queues.notification,
      BUS.queues.notificationDlq,
      BUS.bindings.notification,
    );
    await this.bus.declareConsumer(BUS.queues.audit, BUS.queues.auditDlq, BUS.bindings.audit);
    if (process.env.SLA_AUTO_SCAN === '0') return;

    this.timers.push(
      setInterval(() => {
        void this.tick();
      }, SCAN_EVERY_MS),
      setInterval(() => {
        void this.sla
          .runRetention()
          .then((r) => this.log.log(`dọn dữ liệu: ${JSON.stringify(r)}`))
          .catch((e: unknown) => this.log.error(`dọn dữ liệu hỏng: ${String(e)}`));
      }, RETENTION_EVERY_MS),
    );
    for (const t of this.timers) t.unref?.();
  }

  async tick(): Promise<void> {
    try {
      const r = await this.sla.scan();
      if (!r.skipped && (r.reminded > 0 || r.overdue > 0)) {
        this.log.log(`quét ${r.scanned}: nhắc ${r.reminded}, quá hạn ${r.overdue}`);
      }
      await this.relay.pumpOnce();
    } catch (e) {
      this.log.error(`vòng quét hỏng lúc ${this.clock.now().toISOString()}: ${String(e)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.bus.close();
    await this.sla.close();
  }
}
