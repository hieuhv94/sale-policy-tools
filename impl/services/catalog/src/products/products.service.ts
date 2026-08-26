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
/**
 * THỨ TỰ "GIÁ MỚI NHẤT" — khai một lần, dùng ở mọi chỗ chọn giá (`0126`).
 *
 * Bốn chỗ trả lời cùng câu hỏi *"giá hiện hành là bao nhiêu"*: `currentPrice`,
 * `list()`, `anhChupDanhMuc()`, và phép so lúc sửa giá. Từ `0126` một sản phẩm
 * có thể có NHIỀU dòng cùng ngày, nên `effective_from DESC` không còn đủ để
 * quyết định dòng nào thắng — thiếu `stt` thì bốn chỗ ấy có thể trả về bốn con
 * số khác nhau trên cùng một dữ liệu.
 *
 * Chép chuỗi này ra chỗ thứ năm là dựng chỗ thứ năm để lệch.
 */
export const THU_TU_GIA_MOI_NHAT = 'ORDER BY effective_from DESC, stt DESC';

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

  /**
   * Tạo sản phẩm — GIÁ BÁN CÔNG TY BẮT BUỘC (`0123`).
   *
   * Trước đó giá là một bước riêng, và hệ quả đo được trên chính bộ nạp: sản
   * phẩm sinh ra ở trạng thái *không dùng được*. Nó hiện trong danh mục, hiện
   * trong ô chọn lúc lập hồ sơ, rồi chặn ở `PRICE_NOT_SET` đúng lúc Trình dược
   * viên đã gõ xong dòng — một trạng thái nửa vời mà chỉ Quản trị chữa được.
   *
   * Cả hai nằm trong MỘT transaction: sản phẩm không có giá không được phép tồn
   * tại dù chỉ một khoảnh khắc, kể cả khi lượt ghi giá hỏng.
   */
  async create(input: ProductInput & { price: bigint }, actorId: string) {
    return this.db.tx(async (c) => {
      const sp = await this.insertOne(c, input, actorId);
      await this.datGiaTrongTx(c, sp.id, sp.code, input.price, null, actorId);
      return sp;
    });
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
      price?: bigint | undefined;
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
      /*
       * GÕ LẠI MÃ CHO MỌI LƯỢT SỬA (`0123`), không riêng lượt vô hiệu hoá.
       *
       * `0036` chỉ đòi ở lượt vô hiệu hoá, và lập luận lúc ấy là: bắt gõ cho một
       * thao tác hằng ngày thì làm mòn chính chốt chặn ấy. Lập luận đó đúng khi
       * màn hình sửa chỉ đổi được TÊN.
       *
       * Từ `0123` nó đổi được cả GIÁ, và giá là con số đóng băng vào mọi hồ sơ
       * gửi duyệt từ lúc ấy trở đi, cộng một dòng trong khối *Yêu cầu cập nhật*
       * của mọi TDV đang giữ CSBH chứa sản phẩm này. Không còn thao tác nhẹ nào
       * trên màn hình này để mà làm mòn.
       */
      xacNhanGoLai(patch.confirm, before.code, { viec: 'sửa sản phẩm này' });

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

      /*
       * Giá đi SAU và chỉ khi thật sự đổi.
       *
       * Ghi một dòng giá bằng đúng giá đang có là thêm một sự kiện
       * `catalog.price_changed`, tức một lượt rà mọi hồ sơ đã đóng băng (nợ
       * N-09), để đổi lấy đúng con số không.
       */
      if (patch.price !== undefined) {
        const gia = await c.query<{ amount: string }>(
          `SELECT amount::text FROM cat.product_price
            WHERE product_id = $1 AND price_type = 'GIA_BAN_CONG_TY'
              AND effective_from <= current_date
            ${THU_TU_GIA_MOI_NHAT} LIMIT 1`,
          [id],
        );
        const cu = gia.rows[0]?.amount ?? null;
        if (cu === null || BigInt(cu) !== patch.price) {
          await this.datGiaTrongTx(c, id, after.code, patch.price, cu, actorId);
        }
      }
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
    /*
     * GIÁ HIỆN HÀNH đi kèm mỗi dòng (`0123`).
     *
     * Bảng sản phẩm là màn hình của CẢ SÁU vai trò, và tới `0122` nó không hiện
     * giá ở đâu cả — Trình dược viên muốn biết giá một mặt hàng phải mở màn hình
     * lập hồ sơ ra rồi thêm dòng, tức là đi vào một luồng GHI để đọc một con số.
     *
     * `LEFT JOIN LATERAL` chứ không phải một truy vấn thứ hai cho từng dòng:
     * bảng này phân trang 20 dòng, nhưng nó cũng là nguồn của ô chọn sản phẩm ở
     * `SuaHoSo` với `limit=200`.
     *
     * Phép chọn giá PHẢI khớp từng chữ với `currentPrice` — dòng mới nhất có
     * ngày không ở tương lai. Hai chỗ trả lời "giá hiện hành là bao nhiêu" mà
     * lệch nhau thì bảng nói một con số còn hồ sơ đóng băng một con số khác.
     */
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT p.id, p.code, p.name, g.code AS "groupCode", p.status::text AS status,
              gi.amount::text AS price,
              count(*) OVER() AS total_count
         FROM cat.product p
         JOIN cat.product_group g ON g.id = p.group_id
         LEFT JOIN LATERAL (
           SELECT amount FROM cat.product_price
            WHERE product_id = p.id AND price_type = 'GIA_BAN_CONG_TY'
              AND effective_from <= current_date
            ${THU_TU_GIA_MOI_NHAT} LIMIT 1
         ) gi ON true
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

  /**
   * `effectiveFrom` TUỲ CHỌN, mặc định hôm nay (`0123`).
   *
   * Màn hình không còn ô chọn ngày: khách hàng chốt giá đổi là đổi ngay. Tham số
   * vẫn ở lại vì `seed-demo` dựng ba năm lịch sử giá qua chính đường này — bỏ
   * nó đi thì bộ nạp không dựng nổi một chuỗi giá nào có quá khứ.
   *
   * Hệ quả phải nhớ: đặt giá cho một ngày TƯƠNG LAI vẫn làm được qua API, và
   * lượt rà *Yêu cầu cập nhật* chạy NGAY lúc ấy — lúc giá mới chưa hiệu lực, nên
   * nó không thấy chênh lệch nào, và **không có gì chạy lại vào ngày hiệu lực**.
   * Lỗ ấy có từ trước và giờ không với tới được từ giao diện.
   */
  async setPrice(
    productId: string,
    priceType: PriceType,
    amount: bigint,
    effectiveFrom: string | undefined,
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
          ${THU_TU_GIA_MOI_NHAT} LIMIT 1`,
        [productId, priceType],
      );

      /*
       * THÊM một dòng lịch sử, không sửa dòng cũ: hồ sơ đã đóng băng giá theo
       * phiên bản vẫn phải tra lại đúng giá tại thời điểm đó (CAT-04).
       *
       * ĐẶT LẠI GIÁ TRONG CÙNG MỘT NGÀY THÌ THÊM MỘT DÒNG NỮA (`0126`).
       *
       * Ba luật nối nhau ở chỗ này, ghi cả ba ra vì hai luật đầu đã bị thay:
       *
       *   tới `0120`  lượt thứ hai chết với `PRICE_ALREADY_SET_FOR_DATE` — đúng
       *               về dữ liệu, sai về người dùng: gõ nhầm một số 0 lúc sáng
       *               thì cả ngày hôm đó không sửa lại được.
       *   `0121`      upsert, ĐÈ lên dòng của ngày ấy. Sửa được chuyện trên,
       *               nhưng con số cũ biến mất — không ai biết trong ngày đã có
       *               mấy lần đổi.
       *   `0126`      chèn thêm dòng, giữ đủ mọi lần sửa (khách hàng chốt 26/08).
       *
       * Điều kiện để `0126` an toàn nằm ở lược đồ chứ không ở đây: cột `stt`
       * tăng dần làm khoá phân xử, và MỌI chỗ chọn giá phải sắp bằng
       * `THU_TU_GIA_MOI_NHAT`. Thiếu nó thì hai dòng cùng ngày bằng nhau ở khoá
       * sắp xếp, và giá hiện hành đổi theo thứ tự đọc đĩa.
       */
      /*
       * `RETURNING` NGÀY VỪA GHI, không dựng lại nó ở tầng Node (`0128`).
       *
       * `current_date` chạy theo múi giờ của Postgres — Asia/Ho_Chi_Minh — còn
       * `new Date().toISOString()` cho ra ngày theo UTC. Từ 00:00 tới 07:00 giờ
       * Việt Nam hai bên lệch nhau ĐÚNG MỘT NGÀY, nên dòng giá nằm ở một ngày
       * còn sự kiện phát đi nói một ngày khác — và consumer bên `policy` đọc sự
       * kiện ấy để rà chênh lệch.
       */
      const ghi = await c.query<{ effective_from: string }>(
        `INSERT INTO cat.product_price (product_id, price_type, amount, effective_from, created_by)
         VALUES ($1,$2,$3, coalesce($4::date, current_date), $5)
         RETURNING to_char(effective_from, 'YYYY-MM-DD') AS effective_from`,
        [productId, priceType, amount.toString(), effectiveFrom ?? null, actorId],
      );
      const ngayHieuLuc = ghi.rows[0]!.effective_from;

      const oldAmount = prev.rows[0]?.amount ?? null;
      // ĐÚNG MỘT sự kiện cho mỗi lần đổi giá, kèm giá cũ và giá mới. Nằm cùng
      // transaction nên không có chuyện giá đổi mà sự kiện mất, hay ngược lại (CAT-18).
      await emit(c, 'catalog.price_changed', {
        productId,
        productCode: p.rows[0]!.code,
        priceType,
        oldAmount,
        newAmount: amount.toString(),
        effectiveFrom: ngayHieuLuc,
        actorId,
        at: new Date().toISOString(),
      });
      return {
        productId,
        priceType,
        oldAmount,
        newAmount: amount.toString(),
        effectiveFrom: ngayHieuLuc,
      };
    });
  }

  /** Giá hiện hành: dòng mới nhất có ngày hiệu lực KHÔNG ở tương lai (CAT-05). */
  async currentPrice(productId: string, priceType: PriceType, on?: string) {
    const row = await this.db.one<{ amount: string; effective_from: Date }>(
      `SELECT amount::text, effective_from FROM cat.product_price
        WHERE product_id = $1 AND price_type = $2 AND effective_from <= coalesce($3::date, current_date)
        ${THU_TU_GIA_MOI_NHAT} LIMIT 1`,
      [productId, priceType, on ?? null],
    );
    if (!row) throw new NotFoundException({ code: 'PRICE_NOT_SET' });
    return { productId, priceType, amount: row.amount, effectiveFrom: row.effective_from };
  }

  /**
   * Lịch sử giá, MỚI NHẤT TRƯỚC (`0126`).
   *
   * Thứ tự cũ là `price_type, effective_from DESC` — sắp theo LOẠI GIÁ trước.
   * Danh mục chỉ còn một loại nên nó không lộ ra, nhưng dữ liệu cũ còn dòng
   * `GIA_BAN_BUON` đã rút khỏi danh mục; ở những sản phẩm ấy bảng gom theo loại
   * chứ không theo thời gian, và mốc mới nhất không nằm ở dòng đầu.
   *
   * Trả kèm `createdAt` vì từ `0126` nhiều dòng dùng chung một ngày hiệu lực —
   * chỉ hiện ngày thì mấy lần sửa trong ngày trông y hệt nhau và không xếp được
   * thứ tự bằng mắt.
   */
  priceHistory(productId: string) {
    return this.db.q(
      `SELECT price_type::text AS "priceType", amount::text AS amount,
              effective_from AS "effectiveFrom", created_at AS "createdAt"
         FROM cat.product_price WHERE product_id = $1
        ${THU_TU_GIA_MOI_NHAT}`,
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
            ${THU_TU_GIA_MOI_NHAT} LIMIT 1
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
    // `RETURNING` ngày vừa ghi — xem chú thích cùng chuyện ở `setPrice`.
    const ghi = await c.query<{ effective_from: string }>(
      `INSERT INTO cat.product_price (product_id, price_type, amount, effective_from, created_by)
       VALUES ($1,'GIA_BAN_CONG_TY',$2, current_date, $3)
       RETURNING to_char(effective_from, 'YYYY-MM-DD') AS effective_from`,
      [productId, amount.toString(), actorId],
    );
    await emit(c, 'catalog.price_changed', {
      productId,
      productCode,
      priceType: 'GIA_BAN_CONG_TY',
      oldAmount,
      newAmount: amount.toString(),
      effectiveFrom: ghi.rows[0]!.effective_from,
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
