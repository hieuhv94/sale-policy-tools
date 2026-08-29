/**
 * Chuyển giao hồ sơ khi một tài khoản bị vô hiệu hoá (`0032`).
 *
 * Đây là món nợ ghi ở cuối P40 và là hệ quả trực tiếp của việc bỏ cây tổ chức:
 * id người xử lý nằm CỨNG trên từng hồ sơ, nên người được giao nghỉ việc là hồ
 * sơ kẹt — không ai khác nhìn thấy, không ai khác thao tác được, và không có
 * đường nào chữa ngoài sửa SQL.
 *
 * `identity` gọi vào đây trong luồng vô hiệu hoá tài khoản. Vì sao ở policy chứ
 * không ở identity: chỉ `policy` đọc được schema `pol` (AD-02).
 *
 * HAI ĐIỀU QUAN TRỌNG:
 *
 *   1. **Ghi vào nhật ký của CHÍNH hồ sơ**, không chỉ nhật ký hệ thống. Người mở
 *      hồ sơ ra ba tháng sau phải thấy được vì sao nó đổi tay — nếu vết chỉ nằm
 *      ở nhật ký kiểm toán chung thì họ phải biết trước là có chuyện gì để mà
 *      đi tìm.
 *   2. **Trạng thái KHÔNG đổi.** Chuyển giao là đổi người, không phải một bước
 *      của luồng duyệt. Hồ sơ đang ở "Chờ TBP duyệt" thì vẫn ở đó, chỉ là chờ
 *      một Trưởng bộ phận khác.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { danhSach, ServiceOnly, str, uuid, validate } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { Clients } from './infra/clients.js';
import { emit } from './infra/emit.js';
import { COT_CUA_VAI_TRO } from './policies/policies.service.js';

/**
 * Trạng thái KẾT THÚC — hồ sơ ở đây không chờ ai và không đổi được nữa.
 *
 * Cùng danh sách với `dang-do.controller` cũ, trừ `DANG_CO_HIEU_LUC`: hồ sơ đang
 * hiệu lực KHÔNG phải việc đang chờ, nhưng nó vẫn phải đổi tay. Người phụ trách
 * nó là người nhận thư khi giá hay quy định chiết khấu đổi (muc 7.2), và gửi thư
 * cho một tài khoản đã vô hiệu hoá là gửi vào chỗ không ai đọc.
 *
 * `DA_XOA` vào danh sách này từ `0035` — hồ sơ người lập đã tự bỏ thì không có
 * gì để người kế nhiệm làm với nó, và bàn giao nó chỉ làm dài thêm bảng xem
 * trước mà Quản trị phải đọc trước khi vô hiệu hoá một tài khoản.
 */
const KET_THUC = ['HET_HIEU_LUC', 'DA_XOA'];

type Hang = { id: string; code: string; status: string; customer_id: string };

@ServiceOnly()
@Controller('internal/ban-giao')
export class BanGiaoController {
  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
  ) {}

  /**
   * Xem trước: người này đang giữ những hồ sơ nào.
   *
   * Tách khỏi lệnh chuyển thật để màn hình quản trị nói được con số TRƯỚC khi
   * người dùng bấm — "vô hiệu hoá tài khoản này sẽ chuyển 14 hồ sơ" là một câu
   * khác hẳn với "vô hiệu hoá tài khoản này".
   */
  @Post('xem-truoc')
  @HttpCode(200)
  async xemTruoc(@Body() body: unknown) {
    const b = validate(body, { userId: str(36, 36), role: str(1, 30) });
    const rows = await this.dangGiu(b.userId, b.role);
    return {
      count: rows.length,
      // 20 mã mới nhất là đủ để người quản trị nhận ra mình đang đụng vào cái
      // gì; đổ hết vài trăm mã vào một hộp thoại thì không ai đọc.
      policies: rows.slice(0, 20).map((r) => ({ code: r.code, status: r.status })),
    };
  }

  @Post()
  @HttpCode(200)
  async chuyen(@Body() body: unknown) {
    const b = validate(body, {
      fromUserId: str(36, 36),
      toUserId: str(36, 36),
      role: str(1, 30),
      actorId: str(36, 36),
    });

    const cot = COT_CUA_VAI_TRO[b.role];
    // Ban lãnh đạo và Quản trị không cầm hồ sơ nào — không có cột nào để đổi, và
    // đó là câu trả lời đúng chứ không phải một lỗi.
    if (!cot) return { count: 0, policies: [] };

    const rows = await this.dangGiu(b.fromUserId, b.role);
    if (rows.length === 0) return { count: 0, policies: [] };

    await this.db.tx(async (c) => {
      /*
       * Guard `${cot} = $3` thêm ở `0085`, và nó không thừa: từ `0085` đường
       * "hồ sơ theo khách hàng" cũng đổi `tdv_user_id`, nên giữa câu SELECT ở
       * trên và câu UPDATE ở đây một hồ sơ có thể đã sang tay rồi. Không guard
       * thì nó bị ghi tay lần thứ hai và nhận thêm một dòng nhật ký trùng —
       * hai dòng "đã chuyển giao" cho một lần đổi tay.
       */
      const daDoi = await c.query<{ id: string }>(
        `UPDATE pol.policy SET ${cot} = $2, row_version = row_version + 1
          WHERE id = ANY($1::uuid[]) AND ${cot} = $3
        RETURNING id`,
        [rows.map((r) => r.id), b.toUserId, b.fromUserId],
      );
      const conLai = new Set(daDoi.rows.map((x) => x.id));

      for (const r of rows.filter((x) => conLai.has(x.id))) {
        // `seq` tính tại chỗ cho từng hồ sơ: nhật ký hồ sơ là một chuỗi liên tục
        // và không được có lỗ.
        //
        // `from_status` = `to_status` = trạng thái hiện tại, vì chuyển giao KHÔNG
        // đổi trạng thái. Để `from_status` NULL thì màn hình lịch sử đọc ra là
        // "khởi tạo", còn đặt lệch nhau là bịa ra một bước chuyển không có thật.
        await c.query(
          `INSERT INTO pol.policy_event
             (policy_id, seq, from_status, to_status, action, actor_id, actor_role, reason)
           VALUES ($1,
                   (SELECT coalesce(max(seq), 0) + 1 FROM pol.policy_event WHERE policy_id = $1),
                   $2::pol.policy_status, $2::pol.policy_status, 'HANDOVER', $3, 'QUAN_TRI', $4)`,
          [
            r.id,
            r.status,
            b.actorId,
            `Chuyển giao do tài khoản ${b.role} phụ trách bị vô hiệu hoá`,
          ],
        );
      }

      await emit(c, 'policy.handover', {
        entity: 'policy',
        fromUserId: b.fromUserId,
        toUserId: b.toUserId,
        role: b.role,
        actorId: b.actorId,
        count: rows.length,
        policyCodes: rows.map((r) => r.code),
        at: new Date().toISOString(),
      });
    });

    // Người mới phải XEM ĐƯỢC khách hàng của những hồ sơ vừa nhận, nếu không họ
    // mở hồ sơ ra mà không mở nổi khách hàng trong đó (`0031`).
    //
    // Nuốt lỗi ở đây chứ không để cả lượt hỏng: hồ sơ đã đổi tay xong và đó là
    // phần không lùi được. Quyền xem khách thì cấp lại được bằng cách mở lại một
    // hồ sơ bất kỳ của khách đó.
    const khach = [...new Set(rows.map((r) => r.customer_id))];
    for (const id of khach) {
      await this.clients.grantCustomerAccess(id, [b.toUserId]).catch(() => undefined);
    }

    return {
      count: rows.length,
      policies: rows.map((r) => ({ code: r.code, status: r.status })),
    };
  }

  /**
   * **Hồ sơ đi theo KHÁCH HÀNG** (`0085`).
   *
   * `customer` gọi vào đây mỗi khi `cus.customer.tdv_user_id` đổi — cả lúc bàn
   * giao hàng loạt một TDV nghỉ việc, lẫn lúc Quản trị đổi TDV phụ trách đúng
   * một khách.
   *
   * VÌ SAO PHẢI CÓ. Phạm vi đọc hồ sơ có HAI bản cài đặt phải trả lời giống hệt
   * nhau — `thuocPhamVi` bên này và mệnh đề cùng hình dạng trong `filter.ts` bên
   * reporting, và chú thích ở đó đã ghi thẳng: *"hai chỗ phải trả lời giống hệt
   * nhau, nếu không thì một hồ sơ mở được ở màn hình Hồ sơ mà biến mất khỏi Báo
   * cáo"*. Mệnh đề thì giống hệt thật; thứ lệch là MỘT GIÁ TRỊ — read-model ghi
   * `tdv_user_id` lấy từ TDV của KHÁCH HÀNG, còn `pol.policy` giữ TDV chép trên
   * chính hồ sơ. Đổi tay khách hàng mà hồ sơ đứng yên là hai con số ấy tách đôi,
   * và lệch theo hướng tệ nhất: danh sách BÀY RA hồ sơ mà chi tiết TỪ CHỐI mở.
   *
   * Đo trên chồng demo trước khi sửa: Quản trị đổi TDV phụ trách của KH-0006,
   * người nhận thấy đủ 7 hồ sơ trong danh sách — gồm cả một bản *Đang có hiệu
   * lực* và một bản *Sale Admin đang xử lý* — và cả 7 đều trả `403 OUT_OF_SCOPE`
   * khi bấm vào. *Lịch sử CSBH* của khách thì rỗng trơn.
   *
   * KHÔNG guard theo TDV cũ. Luật là "hồ sơ theo khách hàng", nên hồ sơ nào của
   * khách này cũng phải sang tay, kể cả hồ sơ mang một `tdv_user_id` thứ ba do
   * một lượt đổi tay cũ để lại. Guard bằng `<> $2` thay vì bằng người cũ: chạy
   * lại lần thứ hai thì không dòng nào khớp, nên không ghi thêm nhật ký trùng.
   *
   * `DA_XOA` đứng ngoài, giữ nguyên quyết định `0035`: hồ sơ người lập đã tự bỏ
   * thì không có gì để người kế nhiệm làm với nó, và read-model cũng đã xoá hẳn
   * dòng của nó nên không có gì để lệch.
   */
  @Post('theo-khach-hang')
  @HttpCode(200)
  async theoKhachHang(@Body() body: unknown) {
    const b = validate(body, {
      customerIds: danhSach(uuid(), 500),
      toUserId: str(36, 36),
      actorId: str(36, 36),
    });
    if (b.customerIds.length === 0) return { count: 0, policies: [] };

    return this.db.tx(async (c) => {
      const r = await c.query<Hang>(
        `UPDATE pol.policy SET tdv_user_id = $2, row_version = row_version + 1
          WHERE customer_id = ANY($1::uuid[])
            AND tdv_user_id <> $2
            AND status <> 'DA_XOA'
        RETURNING id, code, status::text AS status, customer_id`,
        [b.customerIds, b.toUserId],
      );
      if (r.rows.length === 0) return { count: 0, policies: [] };

      for (const p of r.rows) {
        // Cùng hình dạng với `chuyen`: ghi vào nhật ký của CHÍNH hồ sơ, và
        // `from_status` = `to_status` vì đổi tay không phải một bước duyệt.
        await c.query(
          `INSERT INTO pol.policy_event
             (policy_id, seq, from_status, to_status, action, actor_id, actor_role, reason)
           VALUES ($1,
                   (SELECT coalesce(max(seq), 0) + 1 FROM pol.policy_event WHERE policy_id = $1),
                   $2::pol.policy_status, $2::pol.policy_status, 'HANDOVER', $3, 'QUAN_TRI', $4)`,
          [p.id, p.status, b.actorId, 'Chuyển giao theo TDV phụ trách khách hàng'],
        );
      }

      await emit(c, 'policy.handover', {
        entity: 'policy',
        toUserId: b.toUserId,
        actorId: b.actorId,
        count: r.rows.length,
        policyCodes: r.rows.map((x) => x.code),
        at: new Date().toISOString(),
      });

      return { count: r.rows.length, policies: r.rows.map((x) => ({ code: x.code, status: x.status })) };
    });
  }

  /**
   * Hồ sơ người này đang giữ ở vai trò ấy, TRỪ những hồ sơ đã kết thúc.
   *
   * Gồm cả `NHAP`: bản nháp của một TDV bị vô hiệu hoá cũng không ai mở được
   * nữa. Bỏ qua nó là để lại đúng loại hồ sơ kẹt mà cả việc này sinh ra để chữa.
   */
  private dangGiu(userId: string, role: string): Promise<Hang[]> {
    const cot = COT_CUA_VAI_TRO[role];
    if (!cot) return Promise.resolve([]);
    return this.db.q<Hang>(
      `SELECT id, code, status::text AS status, customer_id
         FROM pol.policy
        WHERE ${cot} = $1 AND status::text <> ALL($2::text[])
        ORDER BY created_at DESC`,
      [userId, KET_THUC],
    );
  }
}
