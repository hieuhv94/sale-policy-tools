/**
 * API nội bộ của customer. `policy` cần loại khách hàng và kênh để tra ngưỡng
 * chiết khấu, và cần TDV phụ trách để kiểm phạm vi — không đọc thẳng schema cus.
 */
import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ServiceOnly, kemNguCanh } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { PolicyClient } from './infra/policy.client.js';

@ServiceOnly()
@Controller('internal/customers')
export class CustomerInternalController {
  constructor(
    private readonly db: Db,
    private readonly policies: PolicyClient,
  ) {}

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

  /**
   * Khách hàng do TDV này phụ trách — đếm trước khi vô hiệu hoá tài khoản (`0032`).
   *
   * Tách khỏi lệnh chuyển thật để màn hình quản trị nói được con số TRƯỚC khi
   * bấm, cùng lý do với `xem-truoc` bên policy.
   */
  @Post('cua-tdv/:userId')
  @HttpCode(200)
  async cuaTdv(@Param('userId') userId: string) {
    const rows = await this.db.q<{ code: string; name: string }>(
      `SELECT code, name FROM cus.customer WHERE tdv_user_id = $1 ORDER BY code`,
      [userId],
    );
    return { count: rows.length, customers: rows.slice(0, 20) };
  }

  /**
   * Chuyển toàn bộ khách hàng của một TDV sang TDV khác (`0032`).
   *
   * Đi kèm việc chuyển giao hồ sơ lúc vô hiệu hoá tài khoản, và phải đi kèm chứ
   * không phải tuỳ chọn: `cus.customer.tdv_user_id` là thứ quyết định ai xem
   * được khách hàng, và **read-model báo cáo lấy phạm vi từ chính cột ấy**
   * (`sync.service.ts`). Chuyển hồ sơ mà bỏ lại khách hàng là để hai bên nói hai
   * chuyện khác nhau: hồ sơ đã sang người mới, còn dòng báo cáo của nó vẫn tính
   * cho người cũ.
   *
   * Chuyển **MỌI** khách hàng, kể cả khách chưa có hồ sơ nào. Đó chính là loại
   * khách dễ mồ côi nhất — không hồ sơ nào trỏ tới nên không đường nào khác với
   * tới chúng, và người duy nhất còn nhìn thấy thì vừa bị khoá tài khoản.
   */
  @Post('chuyen-tdv')
  @HttpCode(200)
  async chuyenTdv(@Body() body: {
    fromUserId?: unknown;
    toUserId?: unknown;
    actorId?: unknown;
    fromName?: unknown;
  }) {
    const from = String(body?.fromUserId ?? '');
    const to = String(body?.toUserId ?? '');
    const actor = String(body?.actorId ?? '') || null;
    const fromName = String(body?.fromName ?? '') || null;
    if (!from || !to || from === to) return { count: 0, customers: [] };

    /*
     * ĐỌC TRƯỚC, GỌI policy, RỒI MỚI GHI (`0085`) — và thứ tự này có lý do.
     *
     * Hồ sơ phải đi theo khách hàng, mà hai bên nằm ở hai service nên không có
     * transaction nào bọc được cả hai. Ghi `cus` trước rồi gọi `policy` thì một
     * lượt hỏng ở giữa để lại đúng cái lệch đang đi chữa: khách đã sang tay, hồ
     * sơ thì chưa. Gọi `policy` trước thì lượt bấm lại đọc lại đúng tập khách
     * ấy (vì `cus` chưa đổi), lời gọi thứ hai không khớp dòng nào — nó guard
     * bằng `tdv_user_id <> $to` — và câu ghi `cus` chạy nốt.
     */
    const dsKhach = await this.db.q<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM cus.customer WHERE tdv_user_id = $1 ORDER BY code`,
      [from],
    );
    if (dsKhach.length === 0) return { count: 0, customers: [] };
    await this.policies.theoKhachHang(dsKhach.map((x) => x.id), to, actor ?? to);

    return this.db.tx(async (c) => {
      const r = await c.query<{ id: string; code: string; name: string }>(
        `UPDATE cus.customer SET tdv_user_id = $2, updated_at = now()
          WHERE tdv_user_id = $1
        RETURNING id, code, name`,
        [from, to],
      );
      // Một dòng nhật ký cho MỖI khách hàng, không phải một dòng gộp: người đi
      // tra sau này tra theo khách hàng, không tra theo lượt bàn giao.
      for (const x of r.rows) {
        await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
          'customer.changed',
          JSON.stringify(kemNguCanh({
            entity: 'customer',
            id: x.id,
            actorId: actor,
            action: 'HANDOVER',
            before: { tdvUserId: from },
            after: { tdvUserId: to },
            at: new Date().toISOString(),
          })),
        ]);
      }

      /*
       * MỘT sự kiện nữa, chỉ để GỬI THƯ cho người nhận bàn giao (`0085`).
       *
       * Không dùng lại N dòng `customer.changed` ở trên: chúng là vết kiểm toán
       * cho từng khách, và biến chúng thành thư là gửi cho người ta 23 lá cho
       * một lần bàn giao. Thứ người nhận cần là MỘT câu — "bạn vừa được giao
       * chừng này khách, từ ai" — kèm danh sách để đối chiếu.
       *
       * `fromName` là ẢNH CHỤP tên người cũ, do `identity` đưa sang. Không tra
       * lại lúc gửi thư được: tài khoản kia bị vô hiệu hoá ngay sau lời gọi
       * này, mà `users/mail-targets` lọc bỏ tài khoản đã khoá — nên lúc thư
       * được dựng thì không còn đường nào hỏi ra tên nữa.
       */
      if (r.rows.length > 0) {
        await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
          'customer.handover',
          JSON.stringify({
            entity: 'customer',
            action: 'HANDOVER',
            // Hai khoá này là thứ `notification` đòi có mới gửi thư: vai trò
            // người nhận, và id để tra địa chỉ.
            recipients: ['TDV'],
            tdvUserId: to,
            fromUserId: from,
            fromName,
            actorId: actor,
            count: r.rows.length,
            // Cắt bớt để một lần bàn giao 400 khách không đẻ ra một dòng outbox
            // khổng lồ; `count` vẫn nói đúng con số thật, và thân thư nói ra
            // phần bị cắt thay vì im lặng.
            customers: r.rows.slice(0, 100).map((x) => ({ code: x.code, name: x.name })),
            at: new Date().toISOString(),
          }),
        ]);
      }

      return { count: r.rows.length, customers: r.rows.map((x) => ({ code: x.code, name: x.name })) };
    });
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
      status: string;
      tdv_user_id: string;
      id_number: string | null;
      registered_address: string;
      delivery_address: string | null;
      owner_name: string;
      owner_title: string | null;
      debt: string;
    }>(
      `SELECT id, code, name, customer_type, status::text AS status,
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
      status: row.status,
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
