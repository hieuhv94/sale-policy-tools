import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { paged, PG, pgCode, type Page } from '@csbh/http-kit';
import type { PoolClient } from 'pg';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';

export const PRODUCT_STATUSES = ['DANG_AP_DUNG', 'DA_VO_HIEU_HOA'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Đúng hai loại giá. Giá bán lẻ niêm yết CHÍNH LÀ Giá bán Công ty (CAT-03). */
export const PRICE_TYPES = ['GIA_BAN_CONG_TY', 'GIA_BAN_BUON'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export type ProductRow = {
  id: string;
  code: string;
  name: string;
  group_id: string;
  status: ProductStatus;
  default_rate2_type1: number | null;
  default_rate2_type2: number | null;
  default_rate2_type3: number | null;
};

export type ProductInput = {
  code: string;
  name: string;
  groupCode: string;
  defaultRate2Type1?: number | undefined;
  defaultRate2Type2?: number | undefined;
  defaultRate2Type3?: number | undefined;
};

@Injectable()
export class ProductsService {
  constructor(private readonly db: Db) {}

  // --- Nhóm sản phẩm --------------------------------------------------------

  async createGroup(code: string, name: string, actorId: string) {
    return this.db.tx(async (c) => {
      const r = await c
        .query<{ id: string }>(
          `INSERT INTO cat.product_group (code, name) VALUES ($1,$2) RETURNING id`,
          [code, name],
        )
        .catch(rethrow({ [PG.uniqueViolation]: 'GROUP_CODE_DUPLICATE' }));
      const id = r.rows[0]!.id;
      await emit(
        c,
        'catalog.changed',
        changeEvent('product_group', id, actorId, { before: null, after: { code, name } }),
      );
      return { id, code, name };
    });
  }

  async deleteGroup(id: string, actorId: string) {
    return this.db.tx(async (c) => {
      const before = await c.query(`SELECT code, name FROM cat.product_group WHERE id = $1`, [id]);
      if (before.rowCount === 0) throw new NotFoundException({ code: 'GROUP_NOT_FOUND' });

      // Khoá ngoại từ cat.product chặn ở tầng CSDL; ở đây chỉ dịch mã lỗi
      // Postgres sang mã HTTP. Kiểm trước bằng SELECT rồi mới xoá là để hở một
      // khe: sản phẩm mới có thể chèn vào giữa hai câu lệnh (CAT-14).
      await c
        .query(`DELETE FROM cat.product_group WHERE id = $1`, [id])
        .catch(rethrow({ [PG.foreignKeyViolation]: 'GROUP_IN_USE' }));

      await emit(
        c,
        'catalog.changed',
        changeEvent('product_group', id, actorId, { before: before.rows[0], after: null }),
      );
      return { ok: true };
    });
  }

  listGroups() {
    return this.db.q(`SELECT id, code, name FROM cat.product_group ORDER BY code`);
  }

  // --- Sản phẩm -------------------------------------------------------------

  async create(input: ProductInput, actorId: string) {
    return this.db.tx((c) => this.insertOne(c, input, actorId));
  }

  private async insertOne(c: PoolClient, input: ProductInput, actorId: string) {
    const g = await c.query<{ id: string }>(`SELECT id FROM cat.product_group WHERE code = $1`, [
      input.groupCode,
    ]);
    // Nhóm sản phẩm bắt buộc: thiếu nó thì không tra được ngưỡng chiết khấu (CAT-09).
    if (g.rowCount === 0) throw new NotFoundException({ code: 'GROUP_NOT_FOUND' });

    const r = await c
      .query<ProductRow>(
        `INSERT INTO cat.product (code, name, group_id,
            default_rate2_type1, default_rate2_type2, default_rate2_type3)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          input.code,
          input.name,
          g.rows[0]!.id,
          input.defaultRate2Type1 ?? null,
          input.defaultRate2Type2 ?? null,
          input.defaultRate2Type3 ?? null,
        ],
      )
      .catch(rethrow({ [PG.uniqueViolation]: 'PRODUCT_CODE_DUPLICATE' }));

    const row = r.rows[0]!;
    await emit(
      c,
      'catalog.changed',
      changeEvent('product', row.id, actorId, { before: null, after: toDto(row) }),
    );
    return toDto(row);
  }

  async update(
    id: string,
    patch: { name?: string | undefined; status?: ProductStatus | undefined },
    actorId: string,
  ) {
    return this.db.tx(async (c) => {
      const cur = await c.query<ProductRow>(`SELECT * FROM cat.product WHERE id = $1`, [id]);
      if (cur.rowCount === 0) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const before = cur.rows[0]!;

      const r = await c.query<ProductRow>(
        `UPDATE cat.product
            SET name = coalesce($2, name),
                status = coalesce($3, status),
                updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id, patch.name ?? null, patch.status ?? null],
      );
      const after = r.rows[0]!;
      // Nhật ký phải có giá trị TRƯỚC và SAU, không chỉ giá trị mới (CAT-13).
      await emit(
        c,
        'catalog.changed',
        changeEvent('product', id, actorId, { before: toDto(before), after: toDto(after) }),
      );
      return toDto(after);
    });
  }

  /**
   * Danh sách sản phẩm. `forNewPolicy` lọc bỏ sản phẩm đã vô hiệu hoá (CAT-07);
   * tra theo id thì vẫn trả về sản phẩm vô hiệu hoá, vì hồ sơ cũ còn tham chiếu
   * tới nó và phải mở xem được (CAT-08).
   */
  async list(opts: { forNewPolicy?: boolean | undefined }, page: Page) {
    const where = opts.forNewPolicy ? `WHERE p.status = 'DANG_AP_DUNG'` : '';
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT p.id, p.code, p.name, g.code AS "groupCode", p.status::text AS status,
              p.default_rate2_type1 AS "defaultRate2Type1",
              p.default_rate2_type2 AS "defaultRate2Type2",
              p.default_rate2_type3 AS "defaultRate2Type3",
              count(*) OVER() AS total_count
         FROM cat.product p JOIN cat.product_group g ON g.id = p.group_id
         ${where}
        ORDER BY p.code
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /**
   * Mã nhóm của nhiều sản phẩm trong MỘT vòng mạng.
   *
   * `reporting` cần nó cho tiêu chí lọc "nhóm sản phẩm": dòng hồ sơ đóng băng
   * mã và tên sản phẩm nhưng KHÔNG đóng băng nhóm, vì nhóm là thuộc tính của
   * danh mục chứ không của giao dịch. Hỏi lại catalog mỗi lần đồng bộ là đúng
   * ngữ nghĩa: chuyển một sản phẩm sang nhóm khác thì báo cáo phải đi theo.
   */
  async groupCodesOf(productIds: string[]): Promise<Record<string, string>> {
    if (productIds.length === 0) return {};
    const rows = await this.db.q<{ id: string; group_code: string }>(
      `SELECT p.id, g.code AS group_code
         FROM cat.product p JOIN cat.product_group g ON g.id = p.group_id
        WHERE p.id = ANY($1::uuid[])`,
      [productIds],
    );
    return Object.fromEntries(rows.map((r) => [r.id, r.group_code]));
  }

  async byId(id: string) {
    const row = await this.db.one(
      `SELECT p.id, p.code, p.name, g.code AS "groupCode", p.status::text AS status
         FROM cat.product p JOIN cat.product_group g ON g.id = p.group_id
        WHERE p.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    return row;
  }

  // --- Giá ------------------------------------------------------------------

  async setPrice(
    productId: string,
    priceType: PriceType,
    amount: bigint,
    effectiveFrom: string,
    actorId: string,
  ) {
    return this.db.tx(async (c) => {
      const p = await c.query<{ code: string }>(`SELECT code FROM cat.product WHERE id = $1`, [
        productId,
      ]);
      if (p.rowCount === 0) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });

      const prev = await c.query<{ amount: string }>(
        `SELECT amount::text FROM cat.product_price
          WHERE product_id = $1 AND price_type = $2 AND effective_from <= current_date
          ORDER BY effective_from DESC LIMIT 1`,
        [productId, priceType],
      );

      // THÊM một dòng lịch sử, không sửa dòng cũ: hồ sơ đã đóng băng giá theo
      // phiên bản vẫn phải tra lại đúng giá tại thời điểm đó (CAT-04).
      await c
        .query(
          `INSERT INTO cat.product_price (product_id, price_type, amount, effective_from, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [productId, priceType, amount.toString(), effectiveFrom, actorId],
        )
        .catch(rethrow({ [PG.uniqueViolation]: 'PRICE_ALREADY_SET_FOR_DATE' }));

      const oldAmount = prev.rows[0]?.amount ?? null;
      // ĐÚNG MỘT sự kiện cho mỗi lần đổi giá, kèm giá cũ và giá mới. Nằm cùng
      // transaction nên không có chuyện giá đổi mà sự kiện mất, hay ngược lại (CAT-18).
      await emit(c, 'catalog.price_changed', {
        productId,
        productCode: p.rows[0]!.code,
        priceType,
        oldAmount,
        newAmount: amount.toString(),
        effectiveFrom,
        actorId,
        at: new Date().toISOString(),
      });
      return { productId, priceType, oldAmount, newAmount: amount.toString(), effectiveFrom };
    });
  }

  /** Giá hiện hành: dòng mới nhất có ngày hiệu lực KHÔNG ở tương lai (CAT-05). */
  async currentPrice(productId: string, priceType: PriceType, on?: string) {
    const row = await this.db.one<{ amount: string; effective_from: Date }>(
      `SELECT amount::text, effective_from FROM cat.product_price
        WHERE product_id = $1 AND price_type = $2 AND effective_from <= coalesce($3::date, current_date)
        ORDER BY effective_from DESC LIMIT 1`,
      [productId, priceType, on ?? null],
    );
    if (!row) throw new NotFoundException({ code: 'PRICE_NOT_SET' });
    return { productId, priceType, amount: row.amount, effectiveFrom: row.effective_from };
  }

  priceHistory(productId: string) {
    return this.db.q(
      `SELECT price_type::text AS "priceType", amount::text AS amount,
              effective_from AS "effectiveFrom"
         FROM cat.product_price WHERE product_id = $1
        ORDER BY price_type, effective_from DESC`,
      [productId],
    );
  }

  // --- Nhập từ Excel --------------------------------------------------------

  /**
   * Cả lô nằm trong MỘT transaction: một dòng lỗi thì không dòng nào được ghi.
   * Ghi một phần rồi báo lỗi là trạng thái tệ nhất — người dùng không biết phải
   * sửa file rồi nhập lại từ đâu (CAT-15).
   */
  async importProducts(rows: (ProductInput & { rowNumber: number })[], actorId: string) {
    if (rows.length === 0) throw new BadRequestException({ code: 'EMPTY_SHEET' });
    return this.db.tx(async (c) => {
      const created: unknown[] = [];
      for (const r of rows) {
        try {
          created.push(await this.insertOne(c, r, actorId));
        } catch (e) {
          const code = (e as { response?: { code?: string } }).response?.code ?? 'ROW_INVALID';
          throw new BadRequestException({
            code: 'IMPORT_FAILED',
            rowNumber: r.rowNumber,
            reason: code,
            message: `Dòng ${r.rowNumber}: ${code}. Không dòng nào được ghi.`,
          });
        }
      }
      return { imported: created.length };
    });
  }
}

const toDto = (r: ProductRow) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  status: r.status,
  defaultRate2Type1: r.default_rate2_type1,
  defaultRate2Type2: r.default_rate2_type2,
  defaultRate2Type3: r.default_rate2_type3,
});

/** Dịch mã lỗi Postgres sang mã nghiệp vụ, giữ nguyên mọi lỗi khác. */
const rethrow =
  (map: Record<string, string>) =>
  (e: unknown): never => {
    const code = pgCode(e);
    const mapped = code ? map[code] : undefined;
    if (mapped) throw new ConflictException({ code: mapped });
    throw e;
  };
