/**
 * Kế toán yêu cầu in lại → xoá bản scan THẬT khỏi MinIO.
 *
 * `policy` đã xoá con trỏ file trong schema của nó và phát `policy.scan_discarded`.
 * Việc xoá object thật phải nằm ở đây vì chỉ `document` cầm kho lưu trữ — đúng
 * ranh giới sở hữu dữ liệu ở AD-02.
 *
 * Vì sao không xoá đồng bộ ngay trong lời gọi của kế toán: bước chuyển trạng
 * thái đã COMMIT rồi mới xoá được file (xoá trước mà transaction rollback là mất
 * file của một hồ sơ vẫn còn nguyên bản scan). Sự kiện qua outbox cho đúng thứ
 * tự đó, và MinIO chết vài phút thì thư nằm chờ trong queue chứ không mất việc.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bus, BUS } from '@csbh/bus';
import { FilesService } from '../files/files.service.js';

@Injectable()
export class ScanDiscardConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ScanDiscardConsumer.name);
  readonly bus = new Bus();
  private tag: string | undefined;

  constructor(private readonly files: FilesService) {}

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(
      BUS.queues.document,
      BUS.queues.documentDlq,
      BUS.bindings.document,
    );
    if (process.env.DOC_CONSUME === '0') return;
    this.tag = await this.bus.consume(BUS.queues.document, async (e) => {
      if (e.routingKey !== 'policy.scan_discarded') return;
      const n = await this.handle(e.payload);
      this.log.log(`huỷ bản scan của hồ sơ ${String(e.payload['policyCode'])}: ${n} object`);
    });
  }

  /** Tách khỏi consumer để test gọi thẳng được, không phải chờ hàng đợi. */
  async handle(payload: Record<string, unknown>): Promise<number> {
    const objectKey = String(payload['objectKey'] ?? '');
    if (!objectKey) return 0;
    const reason = String(payload['reason'] ?? 'kế toán yêu cầu in lại bản cứng');
    return this.files.discardByObjectKey(objectKey, reason);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tag) await this.bus.cancel(this.tag);
    await this.bus.close();
  }
}
