import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/** document chạy dưới role csbh_doc — chỉ thấy schema doc. */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.DOC_DB_USER ?? 'csbh_doc');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
