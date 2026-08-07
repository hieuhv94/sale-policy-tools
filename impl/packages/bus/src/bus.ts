/**
 * Kết nối RabbitMQ dùng chung cho cả bên phát lẫn bên nhận.
 *
 * Topology được KHAI BÁO lại ở mỗi lần kết nối (`assertExchange`, `assertQueue`
 * đều idempotent). Không dựa vào một bước cấu hình thủ công nào ngoài mã nguồn:
 * môi trường mới, RabbitMQ mới, `docker compose down -v` — chạy lên là có đủ.
 */
import amqp, { type Connection, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { BUS, RABBITMQ_URL } from './topology.js';

export type BusEvent = {
  eventId: string;
  routingKey: string;
  payload: Record<string, unknown>;
  /** Số lần sự kiện này đã được giao. Bên nhận dùng để biết đang thử lại lần mấy. */
  redelivered: boolean;
};

export class Bus {
  private conn: Connection | undefined;
  private ch: ConfirmChannel | undefined;

  async channel(): Promise<ConfirmChannel> {
    if (this.ch) return this.ch;
    this.conn = await amqp.connect(RABBITMQ_URL());
    // Kênh CÓ XÁC NHẬN: `publish` của amqplib trả về ngay và không báo lỗi khi
    // broker từ chối, nên không có bước chờ xác nhận thì "đã phát sự kiện" chỉ
    // có nghĩa là "đã ghi vào socket".
    const ch = await this.conn.createConfirmChannel();

    await ch.assertExchange(BUS.exchange, 'topic', { durable: true });
    await ch.assertExchange(BUS.dlx, 'topic', { durable: true });
    this.ch = ch;
    return ch;
  }

  /**
   * Khai báo queue của một consumer và nối nó vào exchange.
   *
   * Làm ở phía CONSUMER chứ không phía publisher, và cũng không làm lúc publish:
   * queue phải tồn tại TRƯỚC khi có sự kiện đầu tiên, nếu không những sự kiện
   * phát trong lúc consumer chưa từng khởi động sẽ mất hẳn. Gọi hàm này lúc dựng
   * hệ thống là đủ — sau đó consumer tắt bao lâu cũng không mất thư (INT-06).
   */
  async declareConsumer(queue: string, dlq: string, patterns: readonly string[]): Promise<void> {
    const ch = await this.channel();
    await ch.assertQueue(dlq, { durable: true });
    await ch.bindQueue(dlq, BUS.dlx, `${queue}.#`);
    await ch.assertQueue(queue, {
      durable: true,
      deadLetterExchange: BUS.dlx,
      deadLetterRoutingKey: `${queue}.dead`,
    });
    for (const p of patterns) await ch.bindQueue(queue, BUS.exchange, p);
  }

  async publish(eventId: string, routingKey: string, payload: unknown): Promise<void> {
    const ch = await this.channel();
    ch.publish(BUS.exchange, routingKey, Buffer.from(JSON.stringify(payload)), {
      // persistent + queue durable: RabbitMQ restart không làm mất sự kiện đã nhận.
      persistent: true,
      messageId: eventId,
      contentType: 'application/json',
    });
    await ch.waitForConfirms();
  }

  async consume(queue: string, handler: (e: BusEvent) => Promise<void>): Promise<string> {
    const ch = await this.channel();
    // Một thư một lúc. Thứ tự các bước duyệt của cùng một hồ sơ phải giữ nguyên,
    // và prefetch lớn thì hai thư của cùng hồ sơ chạy song song, thư báo "đã ký"
    // có thể tới sau thư báo "chờ kế toán".
    await ch.prefetch(1);
    const r = await ch.consume(queue, (msg: ConsumeMessage | null) => {
      if (!msg) return;
      void (async () => {
        let ok = true;
        try {
          await handler({
            eventId: msg.properties.messageId as string,
            routingKey: msg.fields.routingKey,
            payload: JSON.parse(msg.content.toString('utf8')) as Record<string, unknown>,
            redelivered: msg.fields.redelivered,
          });
        } catch {
          ok = false;
        }
        try {
          // Không requeue: bên nhận đã tự thử lại và tự ghi DLQ trong CSDL. Ném
          // lại vào queue ở đây là vòng lặp vô tận với sự kiện hỏng vĩnh viễn.
          if (ok) ch.ack(msg);
          else ch.nack(msg, false, false);
        } catch {
          // Kênh đã đóng vì service đang tắt. Thư chưa ack nên RabbitMQ giao lại
          // cho bản sau — đúng hành vi mong muốn, không phải lỗi cần ném ra và
          // càng không được để thành unhandled rejection giết tiến trình.
        }
      })();
    });
    return r.consumerTag;
  }

  async cancel(tag: string): Promise<void> {
    await this.ch?.cancel(tag).catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.ch?.close().catch(() => undefined);
    await this.conn?.close().catch(() => undefined);
    this.ch = undefined;
    this.conn = undefined;
  }
}
