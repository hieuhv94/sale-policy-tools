import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/**
 * reporting chạy dưới role `csbh_rpt`, và role đó CHỈ có quyền trên schema rpt.
 *
 * Đó là điều làm read-model trở thành lựa chọn bắt buộc chứ không phải một kiểu
 * kiến trúc cho đẹp: ngay cả khi ai đó viết một câu JOIN sang pol hay cus thì
 * Postgres từ chối bằng 42501, chứ không âm thầm chạy được rồi ràng buộc ở
 * AD-02 mất hiệu lực từ lúc nào không ai biết.
 */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.RPT_DB_USER ?? 'csbh_rpt');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
