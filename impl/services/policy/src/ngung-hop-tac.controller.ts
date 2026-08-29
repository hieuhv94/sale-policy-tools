/**
 * Hồ sơ của một khách hàng sắp ngừng hợp tác (`0034`).
 *
 * `customer` gọi vào đây khi TDV bấm *Ngừng hợp tác*. Vì sao câu hỏi nằm ở
 * policy: chỉ nó đọc được schema `pol` (AD-02).
 *
 * CHIỀU GỌI customer → policy là chiều MỚI, và nó chỉ hợp lệ ở đây. Ở đường đọc
 * danh sách khách hàng tôi đã từ chối đúng chiều này (`0031`): đó là hot path,
 * mở mỗi lần vào màn hình, và `policy` chậm là màn hình khách hàng chết theo dù
 * chẳng cần gì ở đó. Còn đây là một thao tác GHI hiếm, do người dùng bấm, và nó
 * vốn đã phải hỏng nếu policy không trả lời được — không có câu trả lời thì
 * không biết khách này còn hồ sơ nào đang chờ.
 */
import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { opt, ServiceOnly, str, validate } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { emit } from './infra/emit.js';
import { vaiTroConLai, type BonNguoi } from './infra/nguoi-nhan.js';

/**
 * Trạng thái KẾT THÚC — hồ sơ ở đây không chờ ai và không đi tiếp được nữa.
 *
 * Mọi trạng thái khác đều là "đang chờ", kể cả `NHAP`. Bản nháp chưa chờ ai
 * duyệt, nhưng nó vẫn là việc đang dở của chính người lập: ngừng hợp tác trong
 * khi còn một bản nháp là để lại một hồ sơ trỏ vào khách hàng không còn giao
 * dịch. Chặn và bắt xoá nháp trước thì người dùng biết mình đang bỏ cái gì.
 *
 * `DA_XOA` vào danh sách này từ `0035`. Bỏ sót nó là dựng một ngõ cụt kín: hồ sơ
 * người lập đã tự bỏ vẫn bị đếm là "đang chờ", nên khách hàng ấy không xoá được
 * nữa, mà cũng không có thao tác nào đưa hồ sơ đó đi đâu tiếp.
 */
const KET_THUC = ['HET_HIEU_LUC', 'DA_XOA'];

type Hang = { id: string; code: string; status: string };

@ServiceOnly()
@Controller('internal/khach-hang')
export class NgungHopTacController {
  constructor(private readonly db: Db) {}

  /** Khách này đang có hồ sơ nào — chia làm hai nhóm, vì hai nhóm xử lý khác nhau. */
  @Post(':customerId/ho-so')
  @HttpCode(200)
  async hoSo(@Param('customerId') customerId: string) {
    const rows = await this.db.q<Hang>(
      `SELECT id, code, status::text AS status FROM pol.policy
        WHERE customer_id = $1 ORDER BY created_at DESC`,
      [customerId],
    );
    return this.chia(rows);
  }

  /**
   * Cho toàn bộ CSBH đang hiệu lực của khách này HẾT HIỆU LỰC.
   *
   * Chặn lần thứ hai nếu còn hồ sơ đang chờ — `customer` đã hỏi trước rồi, nhưng
   * giữa hai lời gọi có một khe thời gian và một hồ sơ mới có thể gửi vào đó.
   * Phép kiểm đứng cùng transaction với phép ghi mới là phép kiểm thật.
   */
  @Post('ngung-hop-tac')
  @HttpCode(200)
  async ngung(@Body() body: unknown) {
    /*
     * Mã và tên khách hàng do NGƯỜI GỌI đưa sang (`0066`) — chúng chỉ dùng để
     * dựng thân thư báo hết hiệu lực.
     *
     * `policy` không đọc được schema `cus` (AD-02), mà gọi ngược lại `customer`
     * để hỏi thì tệ hơn hẳn: `customer` đang chờ lời gọi này trả lời, nên đó là
     * một vòng gọi lồng nhau — với một pool kết nối nhỏ nó khoá chết cả hai. Bên
     * kia vốn đã đọc sẵn dòng khách hàng trước khi gọi sang đây.
     *
     * `opt` chứ không bắt buộc: sự kiện cũ nằm trong hàng đợi và bản `customer`
     * chưa kịp triển khai lại vẫn gọi được đường này, chỉ là lá thư in "—" ở hai
     * dòng ấy thay vì làm hỏng cả thao tác ngừng hợp tác.
     */
    const b = validate(body, {
      customerId: str(36, 36),
      actorId: str(36, 36),
      customerCode: opt(str(1, 60)),
      customerName: opt(str(1, 300)),
    });

    return this.db.tx(async (c) => {
      const cur = await c.query<Hang>(
        `SELECT id, code, status::text AS status FROM pol.policy
          WHERE customer_id = $1 FOR UPDATE`,
        [b.customerId],
      );
      const { dangCho, dangHieuLuc } = this.chia(cur.rows);
      if (dangCho.length > 0) {
        return { blocked: true, dangCho, expired: [] as Hang[] };
      }

      for (const p of dangHieuLuc) {
        const upd = await c.query<BonNguoi>(
          `UPDATE pol.policy
              SET status = 'HET_HIEU_LUC', deactivated_at = now(),
                  row_version = row_version + 1
            WHERE id = $1 AND status = 'DANG_CO_HIEU_LUC'
          RETURNING tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id`,
          [p.id],
        );
        // Vết nằm ở nhật ký CỦA CHÍNH HỒ SƠ, cùng chỗ với các bước duyệt.
        //
        // KHÁC với `policy.superseded`: bản kia hết hiệu lực vì có bản mới thay
        // thế, còn ở đây khách hàng ngừng giao dịch và **không có bản nào thay
        // thế**. Gộp hai chuyện vào một hành động là làm người đọc lịch sử đi
        // tìm một phiên bản kế tiếp không tồn tại.
        await c.query(
          `INSERT INTO pol.policy_event
             (policy_id, seq, from_status, to_status, action, actor_id, actor_role, reason)
           VALUES ($1,
                   (SELECT coalesce(max(seq), 0) + 1 FROM pol.policy_event WHERE policy_id = $1),
                   'DANG_CO_HIEU_LUC', 'HET_HIEU_LUC', 'CUSTOMER_RETIRED', $2, 'TDV', $3)`,
          [p.id, b.actorId, 'Khách hàng ngừng hợp tác'],
        );

        /*
         * MỘT sự kiện thư cho MỖI hồ sơ (`0066`).
         *
         * Sự kiện tổng kết bên dưới không dùng gửi thư được: nó nói về khách
         * hàng, còn lá thư phải nói về một hồ sơ cụ thể — mã hồ sơ, liên kết mở
         * nó, và bốn người của riêng nó. Một khách hàng có nhiều CSBH hết hiệu
         * lực cùng lúc thì mỗi hồ sơ là một lá thư, đúng như mọi bước khác.
         *
         * Trừ người vừa bấm nút: chỉ TDV phụ trách bấm được *Ngừng hợp tác*, và
         * họ vừa nhìn thấy kết quả trên màn hình.
         */
        const nguoi = upd.rows[0];
        const nhan = nguoi ? vaiTroConLai(nguoi, [b.actorId]) : [];
        if (nguoi && nhan.length > 0) {
          await emit(c, 'policy.het_hieu_luc', {
            entity: 'policy',
            policyId: p.id,
            policyCode: p.code,
            customerId: b.customerId,
            customerCode: b.customerCode ?? null,
            customerName: b.customerName ?? null,
            action: 'CUSTOMER_RETIRED',
            fromStatus: 'DANG_CO_HIEU_LUC',
            toStatus: 'HET_HIEU_LUC',
            recipients: nhan,
            tdvUserId: nguoi.tdv_user_id,
            tbpUserId: nguoi.tbp_user_id,
            keToanUserId: nguoi.ke_toan_user_id,
            saleAdminUserId: nguoi.sale_admin_user_id,
            reason: 'Khách hàng ngừng hợp tác',
            actorId: b.actorId,
            at: new Date().toISOString(),
          });
        }
      }

      // Sự kiện TỔNG KẾT, giữ nguyên: nó là vết của một thao tác trên KHÁCH
      // HÀNG — "khách này ngừng hợp tác, kéo theo N hồ sơ" — và nhật ký kiểm
      // toán cần đúng câu đó. Các sự kiện thư ở trên nói về từng hồ sơ, không
      // thay thế được nó.
      if (dangHieuLuc.length > 0) {
        await emit(c, 'policy.customer_retired', {
          entity: 'policy',
          customerId: b.customerId,
          actorId: b.actorId,
          count: dangHieuLuc.length,
          policyCodes: dangHieuLuc.map((x) => x.code),
          at: new Date().toISOString(),
        });
      }

      return { blocked: false, dangCho: [] as Hang[], expired: dangHieuLuc };
    });
  }

  private chia(rows: Hang[]) {
    return {
      tong: rows.length,
      dangCho: rows.filter(
        (r) => r.status !== 'DANG_CO_HIEU_LUC' && !KET_THUC.includes(r.status),
      ),
      dangHieuLuc: rows.filter((r) => r.status === 'DANG_CO_HIEU_LUC'),
    };
  }
}
