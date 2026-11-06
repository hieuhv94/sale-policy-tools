/**
 * Bộ hẹn giờ của `van-hanh` (`0252`): mỗi 5 phút hỏi việc NÉN LOG đã tới giờ đã cấu hình
 * chưa (`ops.den_han('NEN_LOG')`) — cùng khuôn `sla-worker` hỏi việc dọn dữ liệu.
 *
 * Tách khỏi `LogService` để bộ kiểm gọi thẳng `nenTheoLich(luc)` tại một thời điểm xác
 * định, không phụ thuộc bộ đếm có kịp nổ hay chưa.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { LogService } from '../logs/log.service.js';

const NHIP_MS = 5 * 60 * 1000;

@Injectable()
export class HenGio implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(HenGio.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly logs: LogService) {}

  onModuleInit(): void {
    if (process.env.VAN_HANH_TU_CHAY === '0') return;
    this.timer = setInterval(() => void this.nhip(), NHIP_MS);
    this.timer.unref?.();
  }

  async nhip(): Promise<void> {
    try {
      const r = await this.logs.nenTheoLich(new Date());
      if (r) this.log.log(`nén log: ${JSON.stringify(r)}`);
    } catch (e) {
      this.log.error(`nén log hỏng: ${String(e)}`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
