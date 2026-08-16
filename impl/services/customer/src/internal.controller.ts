/**
 * API nội bộ của customer. `policy` cần loại khách hàng và kênh để tra ngưỡng
 * chiết khấu, và cần TDV phụ trách để kiểm phạm vi — không đọc thẳng schema cus.
 */
import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ServiceOnly } from '@csbh/http-kit';
import { Db } from './infra/db.js';

@ServiceOnly()
@Controller('internal/customers')
export class CustomerInternalController {
  constructor(private readonly db: Db) {}

  /**
   * Cấp quyền xem một khách hàng cho những người vừa được giao hồ sơ (`0031`).
   *
   * `policy` gọi ĐỒNG BỘ ngay sau khi ghi phân công. Không đi qua hàng đợi, và
   * đó là một quyết định:
   *
   *   - Quyền tới MUỘN là loại lỗi tệ nhất trong một phép kiểm quyền. Người vừa
   *     được giao hồ sơ mở màn hình khách hàng ra và nhận 403, rồi vài giây sau
   *     thì lại được — không ai tin một hệ thống hành xử như vậy, và không ai
   *     tra ra nguyên nhân.
   *   - Chiều gọi này ĐÃ TỒN TẠI: `policy.act()` vốn phải hỏi `customer` để lấy
   *     mã và tên khách nhét vào sự kiện. Nếu `customer` chết thì hành động ấy
   *     đã hỏng từ trước, nên đây không thêm một điểm hỏng mới nào.
   *
   * Ghi THÊM, không bao giờ xoá: Kế toán đã tiếp nhận một hồ sơ rồi hồ sơ đi
   * tiếp sang Sale Admin thì họ vẫn phải tra lại được khách hàng ấy.
   */
  @Post(':id/access')
  @HttpCode(200)
  async grant(@Param('id') id: string, @Body() body: { userIds?: unknown }) {
    const ids = Array.isArray(body?.userIds)
      ? body.userIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    if (ids.length === 0) return { granted: 0 };
    await this.db.q(
      `INSERT INTO cus.customer_access (customer_id, user_id)
       SELECT $1::uuid, x FROM unnest($2::uuid[]) AS x
       ON CONFLICT DO NOTHING`,
      [id, ids],
    );
    return { granted: ids.length };
  }

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
