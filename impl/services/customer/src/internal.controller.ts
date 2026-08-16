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
    // Sáu trường cuối thêm ở P6b cho bản CSBH A4 và cho việc trộn hợp đồng:
    // `document` không đọc được schema cus, mà bản A4 phải có địa chỉ, người đại
    // diện và công nợ (DOC-03).
    const row = await this.db.one<{
      id: string;
      code: string;
      name: string;
      customer_type: number;
      tdv_user_id: string;
      id_number: string | null;
      registered_address: string;
      delivery_address: string | null;
      owner_name: string;
      owner_title: string | null;
      debt: string;
    }>(
      `SELECT id, code, name, customer_type,
              tdv_user_id, id_number, registered_address, delivery_address,
              owner_name, owner_title, debt::text
         FROM cus.customer WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      customerType: row.customer_type,
      tdvUserId: row.tdv_user_id,
      idNumber: row.id_number,
      registeredAddress: row.registered_address,
      deliveryAddress: row.delivery_address,
      ownerName: row.owner_name,
      ownerTitle: row.owner_title,
      debt: row.debt,
    };
  }
}
