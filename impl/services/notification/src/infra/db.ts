import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DbPool } from '@csbh/http-kit';

/** notification chạy dưới role csbh_ntf — chỉ thấy schema ntf. */
@Injectable()
export class Db extends DbPool implements OnModuleDestroy {
  constructor() {
    super(process.env.NTF_DB_USER ?? 'csbh_ntf');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
