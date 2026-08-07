/**
 * Đồng hồ TIÊM ĐƯỢC.
 *
 * SLA là 14 ngày và nhắc trước một ngày. Không có cách nào kiểm hai con số đó
 * bằng cách chờ — nên đồng hồ phải là một đầu vào của hệ thống, không phải một
 * lời gọi `Date.now()` rải khắp nơi (§14, NTF-08 và NTF-09).
 *
 * CHÚ Ý: đồng hồ này chỉ điều khiển phía ỨNG DỤNG. Postgres vẫn dùng `now()`
 * của chính nó, nên mọi phép so hạn phải làm trong JavaScript hoặc truyền mốc
 * thời gian vào câu lệnh làm THAM SỐ — không được viết `WHERE sla_due_at < now()`
 * trong SQL, vì câu đó bỏ qua đồng hồ và test đẩy giờ sẽ không có tác dụng.
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  /** Đẩy đồng hồ tới trước. Chỉ dùng trong test. */
  advanceDays(days: number): void {
    this.offsetMs += days * 24 * 60 * 60 * 1000;
  }

  reset(): void {
    this.offsetMs = 0;
  }
}
