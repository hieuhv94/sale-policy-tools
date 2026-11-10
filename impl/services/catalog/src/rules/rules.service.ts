/**
 * Chiết khấu quy định — NGUỒN DUY NHẤT kiểm vượt ngưỡng (YCNV muc 6.3).
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paged, PG, pgCode, xacNhanGoLai, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';
import { chuanLoaiKhach } from './loai-khach.js';

export type RuleInput = {
  /** Mã do Quản trị đặt, khoá chính từ `0024`. */
  code: string;
  /**
   * HAI chiều khớp, không hơn (`0026`). Bỏ trống một chiều nghĩa là "mọi giá
   * trị" — đó là cách khai một ngưỡng chung, không phải một ô còn thiếu.
   */
  productGroupCode?: string | undefined;
  /**
   * TẬP loại khách (`0280`). Rỗng hoặc đủ ba loại = mọi loại — `chuanLoaiKhach` quyết,
   * không để mỗi chỗ tự hiểu.
   */
  customerTypes?: number[] | undefined;
  effectiveFrom: string;
  thresholdRate2: number;
};

export type Resolved = {
  /** `null` đi kèm `KHONG_CO`: không có ngưỡng nào để đối chiếu. */
  thresholdRate2: number | null;
  /**
   * `RULE` — có dòng cấu hình khớp. `KHONG_CO` — không có dòng nào.
   *
   * Chỉ còn HAI giá trị từ `0025`. `PRODUCT_DEFAULT` biến mất cùng với ba cột
   * ngưỡng mặc định trên sản phẩm; nhãn ấy vẫn tồn tại trên những dòng hồ sơ đã
   * lập, nhưng không bao giờ được sinh ra nữa.
   */
  source: 'RULE' | 'KHONG_CO';
  ruleCode: string | null;
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
        .query<{ code: string; specificity: number }>(
          `INSERT INTO cat.discount_rule
             (code, product_group_id, customer_types, effective_from, threshold_rate2)
           VALUES ($1,$2,$3::smallint[],$4,$5) RETURNING code, specificity`,
          [
            input.code,
            groupId,
            chuanLoaiKhach(input.customerTypes),
            input.effectiveFrom,
            input.thresholdRate2,
          ],
        )
        .catch((e: unknown) => {
          if (pgCode(e) === PG.uniqueViolation) throw trungGiNao(e);
          throw e;
        });
      const row = r.rows[0]!;
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', row.code, actorId, {
          before: null,
          after: { ...input, customerTypes: chuanLoaiKhach(input.customerTypes) },
        }),
      );
      return {
        ...input,
        customerTypes: chuanLoaiKhach(input.customerTypes),
        code: row.code,
        specificity: row.specificity,
      };
    });
  }

  /**
   * Sửa quy định: NGƯỠNG, NGÀY HIỆU LỰC và — từ `0279` — cả HAI ô phạm vi.
   *
   * `0028` đóng hai ô phạm vi vì đổi chúng là đổi `specificity`, tức thứ tự ưu
   * tiên của cả bảng (`CAT-11`). Khách hàng đảo lại: khai nhầm nhóm hay loại thì
   * sửa tại chỗ chứ không xoá rồi khai lại — và trong khoảng giữa hai thao tác ấy
   * mọi hồ sơ lập ra mất ngưỡng. Hậu quả đúng như `0028` đã nêu, nên màn hình nói
   * ra: dòng đổi phạm vi thì đổi chỗ trong thứ tự ưu tiên.
   *
   * PHẠM VI VẮNG MẶT LÀ GIỮ NGUYÊN, rỗng/`null` là "mọi giá trị" — hai nghĩa khác
   * nhau mà `opt()` gộp làm một, nên controller đọc SỰ CÓ MẶT của khoá trong thân
   * thô (`pamVi`). Gửi thiếu hai khoá (client cũ, ca cũ) không bao giờ vô tình
   * đưa quy định về "mọi nhóm, mọi loại".
   *
   * Đụng dòng khác CÙNG phạm vi và CÙNG ngày thì `uq_rule_pham_vi` vỡ — đường mã
   * không đổi nên `trungGiNao` vẫn phân loại đúng. Sửa KHÔNG viết lại lịch sử:
   * `pol.policy_line.threshold_snap` đã đóng băng ngưỡng vào từng dòng hồ sơ.
   */
  async update(
    code: string,
    input: {
      thresholdRate2: number;
      effectiveFrom?: string | undefined;
      /** `undefined` = giữ nguyên; `null` = mọi nhóm. */
      productGroupCode?: string | null | undefined;
      /** `undefined` = giữ nguyên; rỗng/`null`/đủ ba loại = mọi loại. */
      customerTypes?: number[] | null | undefined;
    },
    actorId: string,
  ) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(
        `SELECT product_group_id, customer_types, effective_from, threshold_rate2
           FROM cat.discount_rule WHERE code = $1`,
        [code],
      );
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

      // Ba trạng thái cho mỗi ô phạm vi, nên phải đi kèm một CỜ riêng: truyền
      // thẳng `null` vào `coalesce` thì "mọi nhóm" không bao giờ ghi được.
      const doiNhom = input.productGroupCode !== undefined;
      let nhomId: string | null = null;
      if (doiNhom && input.productGroupCode) {
        const g = await c.query<{ id: string }>(
          `SELECT id FROM cat.product_group WHERE code = $1`,
          [input.productGroupCode],
        );
        if (g.rowCount === 0) throw new NotFoundException({ code: 'GROUP_NOT_FOUND' });
        nhomId = g.rows[0]!.id;
      }
      const doiLoai = input.customerTypes !== undefined;

      const r = await c
        .query<{
          threshold_rate2: number;
          effective_from: Date;
          product_group_id: string | null;
          customer_types: number[] | null;
        }>(
          `UPDATE cat.discount_rule
              SET threshold_rate2  = $2,
                  effective_from   = coalesce($3::date, effective_from),
                  product_group_id = CASE WHEN $4::boolean THEN $5::uuid ELSE product_group_id END,
                  customer_types   = CASE WHEN $6::boolean THEN $7::smallint[] ELSE customer_types END
            WHERE code = $1
          RETURNING threshold_rate2, effective_from, product_group_id, customer_types`,
          [
            code,
            input.thresholdRate2,
            input.effectiveFrom ?? null,
            doiNhom,
            nhomId,
            doiLoai,
            chuanLoaiKhach(input.customerTypes),
          ],
        )
        .catch((e: unknown) => {
          // Đổi ngày có thể đâm vào một dòng CÙNG phạm vi đã giữ đúng ngày đó.
          // Trên đường này mã không đổi, nên `uq_rule_pham_vi` là ràng buộc duy
          // nhất còn có thể vỡ — `trungGiNao` vẫn phân loại đúng, và dùng lại nó
          // giữ thông báo trùng phạm vi ở đúng một chỗ.
          if (pgCode(e) === PG.uniqueViolation) throw trungGiNao(e);
          throw e;
        });
      const sau = r.rows[0]!;
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', code, actorId, { before: truoc.rows[0], after: sau }),
      );
      return {
        code,
        thresholdRate2: sau.threshold_rate2,
        effectiveFrom: sau.effective_from,
        productGroupId: sau.product_group_id,
        customerTypes: sau.customer_types,
      };
    });
  }

  /**
   * Xoá hẳn một quy định.
   *
   * An toàn với lịch sử vì cùng lý do trên: hồ sơ đã lập giữ `threshold_snap`
   * của chính nó. Xoá chỉ đổi cách tính cho hồ sơ lập TỪ ĐÂY VỀ SAU.
   */
  async remove(code: string, confirm: string | undefined, actorId: string) {
    return this.db.tx(async (c) => {
      /*
       * Đọc TRƯỚC, xoá SAU — đảo thứ tự so với bản cũ (`0036`).
       *
       * Phép xác nhận phải chạy trên một quy định CÓ THẬT. Xoá trước rồi mới so
       * chuỗi thì gõ sai vẫn ném lỗi và transaction vẫn quay lui, nên kết quả
       * đúng — nhưng nó dựa vào việc người sửa sau này nhớ giữ cả hai câu trong
       * cùng một transaction. Đọc trước thì phép kiểm đứng độc lập.
       */
      const co = await c.query<{ code: string }>(
        `SELECT code FROM cat.discount_rule WHERE code = $1`,
        [code],
      );
      if (co.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });
      xacNhanGoLai(confirm, co.rows[0]!.code, { viec: 'xoá quy định chiết khấu này' });

      const truoc = await c.query(
        `DELETE FROM cat.discount_rule WHERE code = $1
         RETURNING product_group_id, customer_types, effective_from, threshold_rate2`,
        [code],
      );
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', code, actorId, { before: truoc.rows[0], after: null }),
      );
      return { ok: true };
    });
  }

  /**
   * Danh sách quy định, lọc theo nhóm sản phẩm và loại khách hàng (`0049`).
   *
   * HAI Ô TRỐNG CÓ NGHĨA KHÁC NHAU, và đây là chỗ dễ làm sai nhất ở đây:
   *
   *   - Ô chọn để trống = **không lọc**, trả về mọi quy định.
   *   - Dòng quy định có `product_group_id` rỗng = quy định áp cho **mọi nhóm**.
   *
   * Nên lọc theo nhóm SUA phải trả về cả quy định riêng của SUA lẫn quy định
   * chung cho mọi nhóm — quy định chung vẫn áp cho sản phẩm nhóm SUA, và giấu nó
   * đi là để người dùng nhìn một bức tranh thiếu đúng dòng đang có hiệu lực.
   * Cùng lý do với `customer_type`.
   */
  async list(
    page: Page,
    loc: { groupCode?: string | undefined; customerType?: number | undefined } = {},
  ) {
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT r.code, g.code AS "productGroupCode", r.customer_types AS "customerTypes",
              r.effective_from AS "effectiveFrom", r.threshold_rate2 AS "thresholdRate2",
              r.specificity, count(*) OVER() AS total_count
         FROM cat.discount_rule r LEFT JOIN cat.product_group g ON g.id = r.product_group_id
        WHERE ($3::text IS NULL OR g.code = $3 OR r.product_group_id IS NULL)
          AND ($4::int IS NULL OR r.customer_types IS NULL OR $4 = ANY(r.customer_types))
        -- Mã là khoá phá hoà: cột specificity chỉ có bốn giá trị và nhiều quy
        -- định trùng ngày hiệu lực, nên thiếu nó là hai lần gọi cho hai thứ tự
        -- khác nhau, và trang 2 lặp lại một dòng của trang 1.
        ORDER BY r.specificity DESC, r.effective_from DESC, r.code
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset, loc.groupCode ?? null, loc.customerType ?? null],
    );
    return paged(rows, page);
  }

  /**
   * Tra ngưỡng cho một tình huống cụ thể.
   *
   * Nhiều dòng cùng khớp là chuyện bình thường, không phải lỗi cấu hình: dòng
   * chung cho cả nhóm sản phẩm và dòng riêng cho một loại khách đều đúng. Phải
   * chọn được dòng CỤ THỂ NHẤT một cách tất định (CAT-11), nếu không thì cùng
   * một hồ sơ có thể lúc vượt ngưỡng lúc không tuỳ thứ tự Postgres trả về.
   *
   * Thứ tự: điểm cụ thể giảm dần → ngày hiệu lực muộn hơn → mã. Cột
   * `specificity` sinh sẵn trong CSDL nên trọng số chỉ định nghĩa một chỗ.
   *
   * TẦNG THỨ BA KHÔNG CÒN VỚI TỚI ĐƯỢC từ `0022`. Trọng số 2/1 vẫn nhị phân sau
   * khi chiều kênh biến mất (`0026`), nên hai phạm vi khác nhau không bao giờ
   * hoà điểm; hoà điểm ⇒ trùng phạm vi ⇒ chỉ mục `uq_rule_pham_vi` đã chặn từ
   * lúc khai. Giữ `code` trong `ORDER BY` là lưới an toàn phòng khi chỉ mục bị
   * gỡ, KHÔNG phải một luật nghiệp vụ. Bỏ hẳn đi thì mất tính tất định trong
   * đúng cái tình huống lẽ ra không xảy ra.
   */
  async resolve(args: {
    productId: string;
    customerType: number;
    on?: string | undefined;
  }): Promise<Resolved> {
    // Vẫn phải tra sản phẩm dù không còn ngưỡng mặc định nào để lấy: cần
    // `group_id` để khớp quy định, và cần biết sản phẩm CÓ THẬT — tra ngưỡng cho
    // một id không tồn tại mà trả "không có quy định nào" là nuốt mất một lỗi.
    const p = await this.db.one<{ group_id: string }>(
      `SELECT group_id FROM cat.product WHERE id = $1`,
      [args.productId],
    );
    if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });

    const rule = await this.db.one<{ code: string; threshold_rate2: number }>(
      `SELECT code, threshold_rate2 FROM cat.discount_rule
        WHERE (product_group_id IS NULL OR product_group_id = $1)
          AND (customer_types   IS NULL OR $2 = ANY(customer_types))
          AND effective_from <= coalesce($3::date, current_date)
        ORDER BY specificity DESC, effective_from DESC, code
        LIMIT 1`,
      [p.group_id, args.customerType, args.on ?? null],
    );

    if (rule) {
      return { thresholdRate2: rule.threshold_rate2, source: 'RULE', ruleCode: rule.code };
    }

    /*
     * Không quy định nào khớp — và đây KHÔNG phải lỗi.
     *
     * Trước `0025` còn một nhánh nữa: rơi về ba cột ngưỡng mặc định trên sản
     * phẩm. Ba cột ấy là một NGUỒN NGƯỠNG THỨ HAI song song với bảng quy định,
     * trong khi `0005` đã chốt bảng quy định là nguồn duy nhất. Chúng còn vô
     * hình — không có màn hình nhập, chỉ vào qua nhập Excel và script, rồi âm
     * thầm thắng ở những sản phẩm chưa khai quy định.
     *
     * Trước `0023` thì chỗ này còn ném `THRESHOLD_NOT_CONFIGURED` và chặn luôn
     * việc thêm dòng. Cũng sai: ngưỡng chỉ để CẢNH BÁO, vượt ngưỡng còn không
     * chặn gửi duyệt (muc 6.3). Không có ngưỡng chỉ có nghĩa là không đối chiếu
     * được — hồ sơ vẫn đủ mọi con số của nó.
     */
    return { thresholdRate2: null, source: 'KHONG_CO', ruleCode: null };
  }
}

/**
 * Một lệnh chèn quy định có HAI cách trùng, và người dùng phải sửa hai kiểu khác
 * nhau — nên không được gộp thành một thông báo.
 *
 * Mã lỗi Postgres của cả hai đều là `23505`; chỉ có tên ràng buộc phân biệt
 * được. Đọc `constraint` chứ không dò chuỗi trong `message`: thông báo của
 * Postgres đổi theo phiên bản và theo `lc_messages`, còn tên ràng buộc thì do
 * chính migration của mình đặt.
 *
 * Nhận diện theo ĐÚNG MỘT tên — chỉ mục phạm vi — rồi coi mọi tên còn lại là
 * trùng mã. Trùng mã đến từ HAI ràng buộc (`discount_rule_pkey` khi trùng y
 * nguyên, `uq_rule_code_norm` khi chỉ khác hoa thường), và bản đầu dò chuỗi
 * `'code'` nên bỏ sót cái thứ nhất: trùng mã y nguyên lại báo là trùng phạm vi.
 */
const trungGiNao = (e: unknown): ConflictException => {
  const rang = (e as { constraint?: string } | null)?.constraint ?? '';
  if (!rang.startsWith('uq_rule_pham_vi')) {
    return new ConflictException({
      code: 'RULE_CODE_DUPLICATE',
      message:
        'Mã quy định này đã có. Mã phân biệt hoa thường và khoảng trắng thừa — ' +
        "'CK-01' và 'ck-01 ' là cùng một mã.",
    });
  }
  return new ConflictException({
    code: 'RULE_SCOPE_DUPLICATE',
    message:
      'Đã có quy định cho đúng phạm vi này và đúng ngày hiệu lực này. ' +
      'Sửa ngưỡng của dòng đang có, hoặc khai ngày hiệu lực muộn hơn để đè lên.',
  });
};
