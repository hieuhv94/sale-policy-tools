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
import { ServiceOnly, str, validate } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { emit } from './infra/emit.js';

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
const KET_THUC = ['HET_HIEU_LUC', 'TU_CHOI', 'DA_XOA'];

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
    const b = validate(body, { customerId: str(36, 36), actorId: str(36, 36) });

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
        await c.query(
          `UPDATE pol.policy
              SET status = 'HET_HIEU_LUC', deactivated_at = now(),
                  row_version = row_version + 1
            WHERE id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
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
      }

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
