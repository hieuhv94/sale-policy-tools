/**
 * Chiết khấu quy định — NGUỒN DUY NHẤT kiểm vượt ngưỡng (YCNV muc 6.3).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { paged, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';

export type RuleInput = {
  productGroupCode?: string | undefined;
  customerType?: number | undefined;
  channelCode?: string | undefined;
  effectiveFrom: string;
  effectiveTo?: string | undefined;
  thresholdRate2: number;
};

export type Resolved = {
  thresholdRate2: number;
  /** `RULE` là có dòng cấu hình khớp; `PRODUCT_DEFAULT` là rơi về mặc định của sản phẩm. */
  source: 'RULE' | 'PRODUCT_DEFAULT';
  ruleId: string | null;
};

@Injectable()
export class RulesService {
  constructor(private readonly db: Db) {}

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
      const r = await c.query<{ id: string; specificity: number }>(
        `INSERT INTO cat.discount_rule
           (product_group_id, customer_type, channel_code, effective_from, effective_to, threshold_rate2)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, specificity`,
        [
          groupId,
          input.customerType ?? null,
          input.channelCode ?? null,
          input.effectiveFrom,
          input.effectiveTo ?? null,
          input.thresholdRate2,
        ],
      );
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
  async update(
    id: string,
    input: { thresholdRate2?: number | undefined; effectiveTo?: string | null | undefined },
    actorId: string,
  ) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(
        `SELECT product_group_id, customer_type, channel_code, effective_from,
                effective_to, threshold_rate2
           FROM cat.discount_rule WHERE id = $1`,
        [id],
      );
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

      const r = await c.query<{ threshold_rate2: number; effective_to: Date | null }>(
        `UPDATE cat.discount_rule
            SET threshold_rate2 = coalesce($2, threshold_rate2),
                effective_to    = CASE WHEN $4 THEN $3::date ELSE effective_to END
          WHERE id = $1
        RETURNING threshold_rate2, effective_to`,
        [
          id,
          input.thresholdRate2 ?? null,
          input.effectiveTo ?? null,
          input.effectiveTo !== undefined,
        ],
      );
      const sau = r.rows[0]!;
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', id, actorId, { before: truoc.rows[0], after: sau }),
      );
      return { id, thresholdRate2: sau.threshold_rate2, effectiveTo: sau.effective_to };
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
                   effective_to, threshold_rate2`,
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
              r.effective_to AS "effectiveTo", r.threshold_rate2 AS "thresholdRate2",
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
   * Thứ tự: điểm cụ thể giảm dần → ngày hiệu lực muộn hơn → id, để không bao giờ
   * có hoà. Cột `specificity` sinh sẵn trong CSDL nên trọng số chỉ định nghĩa một chỗ.
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
          AND (effective_to IS NULL OR effective_to >= coalesce($4::date, current_date))
        ORDER BY specificity DESC, effective_from DESC, id
        LIMIT 1`,
      [p.group_id, args.customerType, args.channelCode ?? null, args.on ?? null],
    );

    if (rule) {
      return { thresholdRate2: rule.threshold_rate2, source: 'RULE', ruleId: rule.id };
    }

    // Không dòng nào khớp thì rơi về cột "CSBH loại 1/2/3" của sản phẩm (CAT-12).
    const fallback = { 1: p.d1, 2: p.d2, 3: p.d3 }[args.customerType as 1 | 2 | 3] ?? null;
    if (fallback === null) throw new NotFoundException({ code: 'THRESHOLD_NOT_CONFIGURED' });
    return { thresholdRate2: fallback, source: 'PRODUCT_DEFAULT', ruleId: null };
  }
}
