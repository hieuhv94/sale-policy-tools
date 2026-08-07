/**
 * API nội bộ của customer. `policy` cần loại khách hàng và kênh để tra ngưỡng
 * chiết khấu, và cần TDV phụ trách để kiểm phạm vi — không đọc thẳng schema cus.
 */
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ServiceOnly } from '@csbh/http-kit';
import { Db } from './infra/db.js';

@ServiceOnly()
@Controller('internal/customers')
export class CustomerInternalController {
  constructor(private readonly db: Db) {}

  @Get(':id')
  async byId(@Param('id') id: string) {
    const row = await this.db.one<{
      id: string;
      code: string;
      name: string;
      customer_type: number;
      channel_code: string | null;
      tdv_user_id: string;
    }>(
      `SELECT id, code, name, customer_type, channel_code, tdv_user_id
         FROM cus.customer WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      customerType: row.customer_type,
      channelCode: row.channel_code,
      tdvUserId: row.tdv_user_id,
    };
  }
}
