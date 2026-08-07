import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/** customer chạy dưới role csbh_cus — chỉ thấy schema cus. */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.CUS_DB_USER ?? 'csbh_cus');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
