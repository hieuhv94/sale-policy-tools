import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/** policy chạy dưới role csbh_pol — chỉ thấy schema pol. */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.POL_DB_USER ?? 'csbh_pol');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
