import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { contains, paged, PG, pgCode, xacNhanGoLai, type Page } from '@csbh/http-kit';
import type { PoolClient } from 'pg';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';
import type { KetQuaDoc } from './excel.js';
import {
  dungKeHoach,
  type DanhMucHienTai,
  type KeHoach,
  type SanPhamHienTai,
} from './nhap.js';

/**
 * Chuỗi người dùng phải gõ lại để ghi đè danh mục (`0121`).
 *
 * Không dùng mã của một bản ghi như mọi chỗ khác dùng `xacNhanGoLai`: lượt này
 * không nhắm vào một bản ghi nào, nó đè lên cả bảng. Một từ cố định là thứ duy
 * nhất nói đúng phạm vi — và nó vẫn phải gõ, tức vẫn chặn được cú bấm theo phản
 * xạ, thứ mà chốt này sinh ra để chặn.
 */
export const CHUOI_XAC_NHAN_NHAP = 'GHI DE';

export const PRODUCT_STATUSES = ['DANG_AP_DUNG', 'DA_VO_HIEU_HOA'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * Danh mục sản phẩm chỉ giữ MỘT loại giá: Giá bán Công ty (giá bán lẻ niêm yết
 * chính là nó — CAT-03).
 *
 * `GIA_BAN_BUON` đã rút khỏi danh mục. Nó không bị xoá vì nhầm lẫn mà vì nó
 * thuộc về chỗ khác: giá bán buôn do NGƯỜI ĐỀ NGHỊ nhập trên từng dòng sản phẩm
 * của từng hồ sơ (muc 6.1), khác nhau theo khách hàng và theo lần lập. Một con
 * số cấp danh mục không tả được thứ đó, và không nơi nào trong hệ thống đọc nó —
 * `internal.controller` chỉ tra `GIA_BAN_CONG_TY`. Để lại là bày ra một ô mà
 * điền vào cũng không ảnh hưởng tới bất cứ phép tính nào.
 *
 * Giá trị enum trong CSDL vẫn còn, để lịch sử giá đã lỡ ghi vẫn đọc được. Chốt
 * chặn dòng mới nằm ở `0019_mot_loai_gia.sql`.
 */
export const PRICE_TYPES = ['GIA_BAN_CONG_TY'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export type ProductRow = {
  id: string;
  code: string;
  name: string;
  group_id: string;
  status: ProductStatus;
};

export type ProductInput = {
  code: string;
  name: string;
  groupCode: string;
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

  async deleteGroup(id: string, confirm: string | undefined, actorId: string) {
    return this.db.tx(async (c) => {
      const before = await c.query<{ code: string; name: string }>(
        `SELECT code, name FROM cat.product_group WHERE id = $1`,
        [id],
      );
      if (before.rowCount === 0) throw new NotFoundException({ code: 'GROUP_NOT_FOUND' });
      // Gõ lại MÃ nhóm, không phải tên: hai nhóm trùng tên là chuyện có thật,
      // còn mã thì duy nhất — xác nhận bằng một chuỗi không định danh thì nó
      // không phân biệt được cái đang xoá với cái đứng cạnh (`0036`).
      xacNhanGoLai(confirm, before.rows[0]!.code, { viec: 'xoá nhóm sản phẩm này' });

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

  /**
   * `trangThai` chỉ đường nhập truyền (`0122`).
   *
   * Chèn thẳng ở trạng thái đúng thay vì chèn rồi `UPDATE`: sự kiện
   * `catalog.changed` mang `after` đọc từ hàng vừa ghi, nên chèn-rồi-sửa phát ra
   * một sự kiện nói sản phẩm đang bán, ngay trước một sự kiện thứ hai nói nó đã
   * ngừng. Người đọc nhật ký sẽ thấy một mặt hàng sống được đúng một phần nghìn
   * giây.
   */
  private async insertOne(
    c: PoolClient,
    input: ProductInput,
    actorId: string,
    trangThai: ProductStatus = 'DANG_AP_DUNG',
  ) {
    const g = await c.query<{ id: string }>(`SELECT id FROM cat.product_group WHERE code = $1`, [
      input.groupCode,
    ]);
    // Nhóm sản phẩm bắt buộc: thiếu nó thì không tra được ngưỡng chiết khấu (CAT-09).
    if (g.rowCount === 0) throw new NotFoundException({ code: 'GROUP_NOT_FOUND' });

    const r = await c
      .query<ProductRow>(
        `INSERT INTO cat.product (code, name, group_id, status)
         VALUES ($1,$2,$3,$4::cat.product_status) RETURNING *`,
        [input.code, input.name, g.rows[0]!.id, trangThai],
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
    patch: {
      name?: string | undefined;
      status?: ProductStatus | undefined;
      confirm?: string | undefined;
    },
    actorId: string,
  ) {
    return this.db.tx(async (c) => {
      const cur = await c.query<ProductRow>(`SELECT * FROM cat.product WHERE id = $1`, [id]);
      if (cur.rowCount === 0) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const before = cur.rows[0]!;

      /*
       * VÔ HIỆU HOÁ mới phải gõ lại mã, ba chiều đổi còn lại thì không (`0036`).
       *
       * Đây là thao tác phá huỷ thật sự của sản phẩm — không có đường xoá hẳn —
       * và hệ quả của nó vượt ra ngoài danh mục: sản phẩm biến khỏi ô chọn lúc
       * lập hồ sơ, và MỌI CSBH đang hiệu lực chứa nó lập tức hiện trong box
       * *Yêu cầu cập nhật* kèm một lá thư tới từng TDV phụ trách.
       *
       * Bật lại thì KHÔNG đòi gì: nó không làm hỏng gì cả.
       */
      if (patch.status === 'DA_VO_HIEU_HOA' && before.status !== 'DA_VO_HIEU_HOA') {
        xacNhanGoLai(patch.confirm, before.code, { viec: 'vô hiệu hoá sản phẩm này' });
      }

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
  async list(
    opts: {
      forNewPolicy?: boolean | undefined;
      /** Tìm theo TÊN sản phẩm, bỏ dấu, khớp chuỗi con (`0049`). */
      q?: string | undefined;
      /** Lọc theo mã nhóm sản phẩm — ô chọn đứng cạnh ô tìm. */
      groupCode?: string | undefined;
    },
    page: Page,
  ) {
    /*
     * Ba điều kiện, MỘT hình dạng truy vấn (`0049`).
     *
     * Điều kiện vắng mặt đi vào câu lệnh dưới dạng `NULL` và tự vô hiệu, thay vì
     * dựng câu lệnh động theo tổ hợp. Tám tổ hợp của ba điều kiện là tám câu
     * lệnh phải đọc và phải tối ưu riêng — cùng lý do đã ghi ở `customers.search`.
     *
     * `forNewPolicy` vẫn ghép chuỗi vì nó là hằng, không phải dữ liệu người dùng.
     */
    const where = opts.forNewPolicy ? `AND p.status = 'DANG_AP_DUNG'` : '';
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT p.id, p.code, p.name, g.code AS "groupCode", p.status::text AS status,
              count(*) OVER() AS total_count
         FROM cat.product p JOIN cat.product_group g ON g.id = p.group_id
        WHERE ($3::text IS NULL OR p.name_norm LIKE $3)
          AND ($4::text IS NULL OR g.code = $4)
          ${where}
        -- Thứ tự GIỮ NGUYÊN theo mã. Đổi sang sắp theo tên thì hợp với ô tìm
        -- theo tên hơn, nhưng đó là một thay đổi không ai yêu cầu — và mã là duy
        -- nhất nên nó cũng là khoá sắp xếp không bao giờ hoà, thứ mà phân trang
        -- LIMIT/OFFSET cần để trang 2 không lặp lại một dòng của trang 1.
        ORDER BY p.code
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset, opts.q ? contains(opts.q) : null, opts.groupCode ?? null],
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

      /*
       * THÊM một dòng lịch sử, không sửa dòng cũ: hồ sơ đã đóng băng giá theo
       * phiên bản vẫn phải tra lại đúng giá tại thời điểm đó (CAT-04).
       *
       * ĐẶT LẠI GIÁ TRONG CÙNG MỘT NGÀY THÌ ĐÈ (`0121`). Trước đó ràng buộc
       * `UNIQUE (product_id, price_type, effective_from)` làm lượt thứ hai chết
       * với `PRICE_ALREADY_SET_FOR_DATE` — đúng về mặt dữ liệu và sai về mặt
       * người dùng: gõ nhầm một số 0 lúc sáng thì cả ngày hôm đó không sửa lại
       * được, phải đợi sang hôm sau hoặc khai một ngày hiệu lực giả.
       *
       * Ràng buộc GIỮ NGUYÊN, và đó là điểm mấu chốt: bỏ nó đi thì hai dòng
       * cùng ngày cùng tồn tại được, mà `currentPrice` chọn dòng bằng
       * `ORDER BY effective_from DESC LIMIT 1` — không có gì phân xử, nên giá
       * hiện hành đổi theo tâm trạng của Postgres. Upsert đạt đúng mục tiêu
       * "ghi đè" mà vẫn giữ đúng một dòng cho mỗi ngày.
       */
      await c.query(
        `INSERT INTO cat.product_price (product_id, price_type, amount, effective_from, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (product_id, price_type, effective_from)
         DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by`,
        [productId, priceType, amount.toString(), effectiveFrom, actorId],
      );

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
   * Ảnh chụp danh mục để đối chiếu với file (`0121`).
   *
   * Nhận `PoolClient` tuỳ chọn: lượt XEM TRƯỚC đọc ngoài transaction, còn lượt
   * GHI phải đọc BÊN TRONG chính transaction sắp ghi. Không có tham số ấy thì
   * lượt ghi đối chiếu với một ảnh chụp cũ hơn dữ liệu nó sắp đè lên.
   *
   * Giá lấy bằng `DISTINCT ON` — dòng mới nhất có ngày không ở tương lai, đúng
   * luật của `currentPrice`. Viết lại phép chọn ấy ở đây là dựng chỗ thứ hai để
   * trả lời "giá hiện hành là bao nhiêu", nên nó phải khớp từng chữ.
   */
  async anhChupDanhMuc(c?: PoolClient): Promise<DanhMucHienTai> {
    const chay = async <T extends Record<string, unknown>>(sql: string): Promise<T[]> =>
      c ? (await c.query<T>(sql)).rows : this.db.q<T>(sql);

    const sanPham = await chay<SanPhamHienTai>(
      `SELECT p.id, p.code, p.name, g.code AS "groupCode", p.status::text AS status,
              gi.amount::text AS price
         FROM cat.product p
         JOIN cat.product_group g ON g.id = p.group_id
         LEFT JOIN LATERAL (
           SELECT amount FROM cat.product_price
            WHERE product_id = p.id AND price_type = 'GIA_BAN_CONG_TY'
              AND effective_from <= current_date
            ORDER BY effective_from DESC LIMIT 1
         ) gi ON true
        ORDER BY p.code`,
    );
    const nhom = await chay<{ code: string }>(`SELECT code FROM cat.product_group ORDER BY code`);
    return { sanPham, maNhom: nhom.map((n) => n.code) };
  }

  /** Bước 1–5 rồi dựng kế hoạch. Không ghi gì — đây là thứ bảng xem trước vẽ. */
  async xemTruocNhap(doc: KetQuaDoc): Promise<KeHoach> {
    return dungKeHoach(doc, await this.anhChupDanhMuc());
  }

  /**
   * Ghi đè danh mục theo file, trong MỘT transaction (`0121`).
   *
   * Ba điều kiện, và cả ba đều ở đây chứ không ở giao diện:
   *
   * 1. **Kiểm LẠI từ đầu bên trong transaction.** Kế hoạch mà người dùng vừa
   *    duyệt được dựng từ một ảnh chụp cũ hơn; giữa hai lượt, ai đó có thể vừa
   *    thêm một sản phẩm, đổi một cái giá, xoá một nhóm.
   * 2. **Gõ lại chuỗi xác nhận.** Đây là lượt ghi có bán kính lớn nhất của phần
   *    mềm — một file dán nhầm cột đổi tên và giá của cả danh mục. Chốt nằm ở
   *    máy chủ, không phải ở hộp thoại: ai gọi thẳng API cũng phải nói ra.
   * 3. **Chỉ phát sự kiện cho dòng THẬT SỰ ĐỔI.** `catalog.changed` và
   *    `catalog.price_changed` kéo theo một lượt rà mọi hồ sơ đã đóng băng ×
   *    mọi dòng ở `policy` (nợ N-09). Phát cho cả những dòng khớp y nguyên là
   *    biến một lượt nhập 500 dòng thành 500 lượt rà vô ích, và làm box *Yêu cầu
   *    cập nhật* của mọi TDV đầy những hồ sơ chẳng lệch gì.
   */
  async ghiNhap(doc: KetQuaDoc, confirm: string | undefined, actorId: string) {
    return this.db.tx(async (c) => {
      const ke = dungKeHoach(doc, await this.anhChupDanhMuc(c));
      xacNhanGoLai(confirm, CHUOI_XAC_NHAN_NHAP, {
        viec:
          `ghi đè danh mục: ${ke.themMoi.length} thêm mới, ${ke.sua.length} sửa, ` +
          `${ke.ngungBan.length} ngừng bán`,
      });

      for (const d of ke.themMoi) {
        const sp = await this.insertOne(
          c,
          d,
          actorId,
          d.conBan ? 'DANG_AP_DUNG' : 'DA_VO_HIEU_HOA',
        );
        if (d.price !== null) await this.datGiaTrongTx(c, sp.id, d.code, BigInt(d.price), null, actorId);
      }

      for (const d of ke.sua) {
        if (d.ten || d.nhom) {
          const truoc = await c.query<ProductRow>(`SELECT * FROM cat.product WHERE id = $1`, [d.id]);
          const g = d.nhom
            ? await c.query<{ id: string }>(`SELECT id FROM cat.product_group WHERE code = $1`, [
                d.nhom.sau,
              ])
            : null;
          const r = await c.query<ProductRow>(
            `UPDATE cat.product
                SET name = coalesce($2, name),
                    group_id = coalesce($3, group_id),
                    updated_at = now()
              WHERE id = $1 RETURNING *`,
            [d.id, d.ten?.sau ?? null, g?.rows[0]?.id ?? null],
          );
          await emit(
            c,
            'catalog.changed',
            changeEvent('product', d.id, actorId, {
              before: toDto(truoc.rows[0]!),
              after: toDto(r.rows[0]!),
            }),
          );
        }
        if (d.gia) {
          await this.datGiaTrongTx(c, d.id, d.code, BigInt(d.gia.sau), d.gia.truoc, actorId);
        }
      }

      /*
       * Đổi trạng thái đi SAU cùng, và đi qua đúng một đường cho cả hai chiều.
       *
       * KHÔNG gọi `update()`: hàm ấy tự mở transaction, và nó gọi
       * `xacNhanGoLai(confirm, code)` — chốt gõ lại mã vật tư của màn hình, vốn
       * canh từng sản phẩm một. Ở đây chốt là chuỗi xác nhận của cả lô, đã kiểm
       * ở trên; gọi lại chốt kia nghĩa là đòi gõ 200 mã vật tư.
       */
      for (const d of [...ke.ngungBan, ...ke.banLai]) {
        const moi = ke.ngungBan.includes(d) ? 'DA_VO_HIEU_HOA' : 'DANG_AP_DUNG';
        const truoc = await c.query<ProductRow>(`SELECT * FROM cat.product WHERE id = $1`, [d.id]);
        const r = await c.query<ProductRow>(
          `UPDATE cat.product SET status = $2::cat.product_status, updated_at = now()
            WHERE id = $1 RETURNING *`,
          [d.id, moi],
        );
        await emit(
          c,
          'catalog.changed',
          changeEvent('product', d.id, actorId, {
            before: toDto(truoc.rows[0]!),
            after: toDto(r.rows[0]!),
          }),
        );
      }

      return {
        themMoi: ke.themMoi.length,
        sua: ke.sua.length,
        ngungBan: ke.ngungBan.length,
        banLai: ke.banLai.length,
        khongDoi: ke.khongDoi,
      };
    });
  }

  /**
   * Ghi một dòng giá bên trong transaction đang mở.
   *
   * Không gọi lại `setPrice` được — hàm ấy tự mở transaction riêng, và một lượt
   * nhập 500 dòng sẽ thành 500 transaction rời, tức là mất đúng thứ bảo đảm
   * "một dòng lỗi thì không dòng nào được ghi".
   *
   * Ngày áp dụng là NGÀY NHẬP, đặt ở máy chủ. File không có cột ngày: một cột
   * như vậy cho phép khai một ngày trong quá khứ, và giá quá khứ thì hồ sơ đã
   * đóng băng tra ngược lại được — sửa nó là sửa lịch sử.
   */
  private async datGiaTrongTx(
    c: PoolClient,
    productId: string,
    productCode: string,
    amount: bigint,
    oldAmount: string | null,
    actorId: string,
  ) {
    await c.query(
      `INSERT INTO cat.product_price (product_id, price_type, amount, effective_from, created_by)
       VALUES ($1,'GIA_BAN_CONG_TY',$2, current_date, $3)
       ON CONFLICT (product_id, price_type, effective_from)
       DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by`,
      [productId, amount.toString(), actorId],
    );
    await emit(c, 'catalog.price_changed', {
      productId,
      productCode,
      priceType: 'GIA_BAN_CONG_TY',
      oldAmount,
      newAmount: amount.toString(),
      effectiveFrom: new Date().toISOString().slice(0, 10),
      actorId,
      at: new Date().toISOString(),
    });
  }
}

const toDto = (r: ProductRow) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  status: r.status,
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
