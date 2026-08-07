/**
 * Ghi lại MỌI nỗ lực thao tác bị từ chối vì thiếu quyền — cho cả bảy service,
 * từ một chỗ duy nhất (AUD-08).
 *
 * Ở P7a việc này làm bằng một `ExceptionFilter` đặt trong `policy`. Nhân bản
 * filter đó ra sáu service còn lại là cách chắc chắn nhất để có ngày một service
 * quên mất nó, và cái thiếu đó không ai phát hiện được: nhật ký vẫn có dòng, chỉ
 * là không có dòng nào của service bị quên.
 *
 * Gateway nhìn thấy 403 của mọi service nên nó là chỗ đúng — miễn là **không có
 * đường nào đi vòng qua gateway** từ bên ngoài, và điều đó do `SEC-10` giữ:
 * chỉ Caddy mở cổng, mà Caddy chỉ trỏ vào đây.
 *
 * PHÁT THẲNG LÊN BUS, không qua outbox. Outbox tồn tại để việc ghi nghiệp vụ và
 * việc phát sự kiện cùng thành công hoặc cùng thất bại; ở đây **không có việc
 * ghi nghiệp vụ nào** — thao tác vừa bị từ chối. Không có gì để nguyên tử với,
 * nên một bảng outbox riêng cho gateway chỉ thêm một schema phải vận hành.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Bus, BUS } from '@csbh/bus';

export type Denial = {
  actorId: string | null;
  actorRole: string | null;
  method: string;
  path: string;
  reason: string;
  upstream: string;
  traceId: string | null;
  actorIp: string | null;
};

const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

@Injectable()
export class DeniedPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DeniedPublisher.name);
  readonly bus = new Bus();

  async onModuleInit(): Promise<void> {
    // Khai báo hàng đợi nhật ký trước khi phát sự kiện đầu tiên — cùng lý do
    // với các relay: RabbitMQ vứt bỏ trong im lặng thư gửi vào exchange chưa ai
    // bind, nên thiếu bước này thì gateway chạy êm và không dòng nào tới nơi.
    await this.bus.declareConsumer(BUS.queues.audit, BUS.queues.auditDlq, BUS.bindings.audit);
  }

  /**
   * CHỜ phát xong rồi mới trả 403 về cho người gọi.
   *
   * Cùng lý lẽ đã chốt ở P7a và không đổi: một bản ghi an ninh *thường* được ghi
   * thì không phải bản ghi an ninh. Cái giá là một vòng tới RabbitMQ, trên đúng
   * nhánh mà người dùng vừa bị từ chối.
   *
   * Phát hỏng thì VẪN trả 403: không ghi được nhật ký là sự cố vận hành, không
   * phải lý do để cho qua một thao tác vượt quyền.
   */
  async record(d: Denial): Promise<void> {
    const eventId = randomUUID();
    try {
      await this.bus.publish(eventId, 'security.denied', {
        eventId,
        routingKey: 'security.denied',
        entity: 'security',
        id: UUID_IN_PATH.exec(d.path)?.[0] ?? null,
        action: 'ACCESS_DENIED',
        actorId: d.actorId,
        actorRole: d.actorRole,
        reason: d.reason,
        after: { method: d.method, path: d.path, upstream: d.upstream },
        traceId: d.traceId,
        actorIp: d.actorIp,
        at: new Date().toISOString(),
      });
    } catch (e) {
      this.log.error(`KHÔNG ghi được nỗ lực vượt quyền ${d.method} ${d.path}: ${String(e)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.bus.close();
  }
}
