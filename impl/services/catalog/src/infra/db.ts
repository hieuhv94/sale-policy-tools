import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/** catalog chạy dưới role csbh_cat — chỉ thấy schema cat. */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.CAT_DB_USER ?? 'csbh_cat');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
