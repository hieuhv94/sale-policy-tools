/**
 * Chiết khấu quy định — NGUỒN DUY NHẤT kiểm vượt ngưỡng (YCNV muc 6.3).
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paged, PG, pgCode, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';

export type RuleInput = {
  productGroupCode?: string | undefined;
  customerType?: number | undefined;
  channelCode?: string | undefined;
  effectiveFrom: string;
  thresholdRate2: number;
};

export type Resolved = {
  /** `null` đi kèm `KHONG_CO`: không có ngưỡng nào để đối chiếu. */
  thresholdRate2: number | null;
  /**
   * `RULE` — có dòng cấu hình khớp.
   * `PRODUCT_DEFAULT` — rơi về mặc định khai trong danh mục sản phẩm.
   * `KHONG_CO` — không có cả hai.
   */
  source: 'RULE' | 'PRODUCT_DEFAULT' | 'KHONG_CO';
  ruleId: string | null;
};

@Injectable()
export class RulesService {
  constructor(private readonly db: Db) {}

  /**
   * Khai một quy định.
   *
   * TRÙNG PHẠM VI thì từ chối (`0022`). "Trùng" tính cả các ô để trống: hai dòng
   * cùng bỏ trống nhóm sản phẩm là cùng nói "mọi nhóm", nên chúng trùng nhau —
   * chỉ mục dùng `NULLS NOT DISTINCT` đúng vì lẽ đó.
   *
   * Từ chối chứ không âm thầm ghi đè: người khai có thể đang định sửa ngưỡng của
   * dòng cũ, mà cũng có thể đang khai nhầm một dòng thứ hai. Ghi đè thì đoán hộ
   * họ ý thứ nhất và xoá mất dữ liệu nếu đoán sai. Báo 409 kèm mã rõ ràng thì họ
   * chọn: sửa ngưỡng dòng cũ, hay khai ngày hiệu lực muộn hơn để đè lên.
   */
  async create(input: RuleInput, actorId: string) {
    return this.db.tx(async (c) => {
      let groupId: string | null = null;
      if (input.productGroupCode) {
        const g = await c.query<{ id: string }>(
          `SELECT id FROM cat.product_group WHERE code = $1`,
          [input.productGroupCode],
        );
        if (g.rowCount === 0) throw new NotFoundException({ code: 'GROUP_NOT_FOUND' });
        groupId = g.rows[0]!.id;
      }
      const r = await c
        .query<{ id: string; specificity: number }>(
          `INSERT INTO cat.discount_rule
             (product_group_id, customer_type, channel_code, effective_from, threshold_rate2)
           VALUES ($1,$2,$3,$4,$5) RETURNING id, specificity`,
          [
            groupId,
            input.customerType ?? null,
            input.channelCode ?? null,
            input.effectiveFrom,
            input.thresholdRate2,
          ],
        )
        .catch((e: unknown) => {
          if (pgCode(e) === PG.uniqueViolation) {
            throw new ConflictException({
              code: 'RULE_SCOPE_DUPLICATE',
              message:
                'Đã có quy định cho đúng phạm vi này và đúng ngày hiệu lực này. ' +
                'Sửa ngưỡng của dòng đang có, hoặc khai ngày hiệu lực muộn hơn để đè lên.',
            });
          }
          throw e;
        });
      const row = r.rows[0]!;
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', row.id, actorId, { before: null, after: input }),
      );
      return { id: row.id, specificity: row.specificity, ...input };
    });
  }

  /**
   * Sửa NGƯỠNG và NGÀY KẾT THÚC — không sửa được ba khoá khớp.
   *
   * Đổi nhóm sản phẩm, loại khách hay kênh là đổi `specificity`, tức là đổi thứ
   * tự ưu tiên khi nhiều dòng cùng khớp (`CAT-11`). Cho sửa ba ô đó thì một lần
   * bấm có thể lặng lẽ đảo ngược thứ tự ưu tiên của cả bảng, và không có gì trên
   * màn hình nói ra điều đó. Khai nhầm phạm vi thì xoá dòng rồi khai lại — hai
   * việc rõ ràng thay vì một việc mập mờ.
   *
   * Sửa KHÔNG viết lại lịch sử: `pol.policy_line.threshold_snap` đã đóng băng
   * ngưỡng vào từng dòng hồ sơ lúc lập (`0001_init.sql:92`).
   */
  /**
   * Sửa quy định. Từ 0020 chỉ còn đổi được NGƯỠNG.
   *
   * Ba ô phạm vi không sửa được vì đổi chúng là đổi thứ tự ưu tiên của cả bảng
   * (`specificity`), và ngày hết hiệu lực thì không còn tồn tại — quy định vô
   * thời hạn, muốn dừng thì xoá dòng.
   */
  async update(id: string, input: { thresholdRate2: number }, actorId: string) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(
        `SELECT product_group_id, customer_type, channel_code, effective_from, threshold_rate2
           FROM cat.discount_rule WHERE id = $1`,
        [id],
      );
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

      const r = await c.query<{ threshold_rate2: number }>(
        `UPDATE cat.discount_rule SET threshold_rate2 = $2
          WHERE id = $1 RETURNING threshold_rate2`,
        [id, input.thresholdRate2],
      );
      const sau = r.rows[0]!;
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', id, actorId, { before: truoc.rows[0], after: sau }),
      );
      return { id, thresholdRate2: sau.threshold_rate2 };
    });
  }

  /**
   * Xoá hẳn một quy định.
   *
   * An toàn với lịch sử vì cùng lý do trên: hồ sơ đã lập giữ `threshold_snap`
   * của chính nó. Xoá chỉ đổi cách tính cho hồ sơ lập TỪ ĐÂY VỀ SAU.
   */
  async remove(id: string, actorId: string) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(
        `DELETE FROM cat.discount_rule WHERE id = $1
         RETURNING product_group_id, customer_type, channel_code, effective_from,
                   threshold_rate2`,
        [id],
      );
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', id, actorId, { before: truoc.rows[0], after: null }),
      );
      return { ok: true };
    });
  }

  async list(page: Page) {
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT r.id, g.code AS "productGroupCode", r.customer_type AS "customerType",
              r.channel_code AS "channelCode", r.effective_from AS "effectiveFrom",
              r.threshold_rate2 AS "thresholdRate2",
              r.specificity, count(*) OVER() AS total_count
         FROM cat.discount_rule r LEFT JOIN cat.product_group g ON g.id = r.product_group_id
        ORDER BY r.specificity DESC, r.effective_from DESC
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /**
   * Tra ngưỡng cho một tình huống cụ thể.
   *
   * Nhiều dòng cùng khớp là chuyện bình thường, không phải lỗi cấu hình: dòng
   * chung cho cả nhóm sản phẩm và dòng riêng cho một kênh đều đúng. Phải chọn
   * được dòng CỤ THỂ NHẤT một cách tất định (CAT-11), nếu không thì cùng một hồ
   * sơ có thể lúc vượt ngưỡng lúc không tuỳ thứ tự Postgres trả về.
   *
   * Thứ tự: điểm cụ thể giảm dần → ngày hiệu lực muộn hơn → id. Cột
   * `specificity` sinh sẵn trong CSDL nên trọng số chỉ định nghĩa một chỗ.
   *
   * TẦNG `id` KHÔNG CÒN VỚI TỚI ĐƯỢC từ `0022`. Trọng số 4/2/1 là nhị phân nên
   * hai phạm vi khác nhau không bao giờ hoà điểm; hoà điểm ⇒ trùng phạm vi ⇒ chỉ
   * mục `uq_rule_pham_vi` đã chặn từ lúc khai. Giữ `id` trong `ORDER BY` là lưới
   * an toàn phòng khi chỉ mục bị gỡ, KHÔNG phải một luật nghiệp vụ — thứ tự uuid
   * ngẫu nhiên không nói lên điều gì. Bỏ hẳn đi thì mất tính tất định trong đúng
   * cái tình huống lẽ ra không xảy ra.
   */
  async resolve(args: {
    productId: string;
    customerType: number;
    channelCode?: string | undefined;
    on?: string | undefined;
  }): Promise<Resolved> {
    const p = await this.db.one<{
      group_id: string;
      d1: number | null;
      d2: number | null;
      d3: number | null;
    }>(
      `SELECT group_id,
              default_rate2_type1 AS d1, default_rate2_type2 AS d2, default_rate2_type3 AS d3
         FROM cat.product WHERE id = $1`,
      [args.productId],
    );
    if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });

    const rule = await this.db.one<{ id: string; threshold_rate2: number }>(
      `SELECT id, threshold_rate2 FROM cat.discount_rule
        WHERE (product_group_id IS NULL OR product_group_id = $1)
          AND (customer_type    IS NULL OR customer_type    = $2)
          AND (channel_code     IS NULL OR channel_code     = $3)
          AND effective_from <= coalesce($4::date, current_date)
        ORDER BY specificity DESC, effective_from DESC, id
        LIMIT 1`,
      [p.group_id, args.customerType, args.channelCode ?? null, args.on ?? null],
    );

    if (rule) {
      return { thresholdRate2: rule.threshold_rate2, source: 'RULE', ruleId: rule.id };
    }

    // Không dòng nào khớp thì rơi về cột "CSBH loại 1/2/3" của sản phẩm (CAT-12).
    const fallback = { 1: p.d1, 2: p.d2, 3: p.d3 }[args.customerType as 1 | 2 | 3] ?? null;
    if (fallback !== null) {
      return { thresholdRate2: fallback, source: 'PRODUCT_DEFAULT', ruleId: null };
    }

    /*
     * KHÔNG có ngưỡng nào — và đây KHÔNG phải lỗi.
     *
     * Bản trước ném `THRESHOLD_NOT_CONFIGURED`, tức là chặn luôn việc thêm dòng
     * sản phẩm vào hồ sơ. Nhìn lại thì cái chặn ấy sai về nghiệp vụ: ngưỡng chỉ
     * để CẢNH BÁO, vượt ngưỡng còn không chặn gửi duyệt (muc 6.3). Không có
     * ngưỡng thì chỉ có nghĩa là không đối chiếu được — hồ sơ vẫn đủ mọi con số
     * của nó, và người duyệt vẫn duyệt được bằng mắt.
     *
     * Chặn ở đây còn đẩy người lập vào ngõ cụt: họ không có quyền khai quy định
     * chiết khấu lẫn ngưỡng mặc định của sản phẩm, nên việc duy nhất làm được là
     * dừng lại chờ Quản trị.
     */
    return { thresholdRate2: null, source: 'KHONG_CO', ruleId: null };
  }
}
