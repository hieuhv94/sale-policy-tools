import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/** identity chạy dưới role csbh_idn — chỉ thấy schema idn. */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.IDN_DB_USER ?? 'csbh_idn');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
