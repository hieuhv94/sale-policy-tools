import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/**
 * `van-hanh` chạy dưới role `csbh_ops` (`0252`) — chỉ thấy schema `ops`: sửa được lịch,
 * ghi được lượt chạy và outbox. Không chạm dữ liệu nghiệp vụ nào.
 */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.OPS_DB_USER ?? 'csbh_ops');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
