import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/**
 * audit chạy dưới role `csbh_aud` — role DUY NHẤT chỉ có SELECT và INSERT.
 *
 * Không phải quy ước trong mã: `UPDATE` và `DELETE` đã bị thu hồi ở migration
 * 0002, và trigger `trg_audit_immutable` chặn thêm một lớp nữa. Ngay cả khi
 * service này có lỗ hổng thì nó cũng không sửa được một dòng nhật ký nào (AUD-03).
 */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.AUD_DB_USER ?? 'csbh_aud');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
