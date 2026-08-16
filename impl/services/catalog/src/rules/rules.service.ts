/**
 * Chiết khấu quy định — NGUỒN DUY NHẤT kiểm vượt ngưỡng (YCNV muc 6.3).
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paged, PG, pgCode, xacNhanGoLai, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';

export type RuleInput = {
  /** Mã do Quản trị đặt, khoá chính từ `0024`. */
  code: string;
  /**
   * HAI chiều khớp, không hơn (`0026`). Bỏ trống một chiều nghĩa là "mọi giá
   * trị" — đó là cách khai một ngưỡng chung, không phải một ô còn thiếu.
   */
  productGroupCode?: string | undefined;
  customerType?: number | undefined;
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
             (code, product_group_id, customer_type, effective_from, threshold_rate2)
           VALUES ($1,$2,$3,$4,$5) RETURNING code, specificity`,
          [
            input.code,
            groupId,
            input.customerType ?? null,
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
        changeEvent('discount_rule', row.code, actorId, { before: null, after: input }),
      );
      return { ...input, code: row.code, specificity: row.specificity };
    });
  }

  /**
   * Sửa quy định: NGƯỠNG và NGÀY HIỆU LỰC.
   *
   * Hai ô phạm vi vẫn không sửa được — đổi chúng là đổi `specificity`, tức đổi
   * thứ tự ưu tiên của cả bảng (`CAT-11`), và không có gì trên màn hình nói ra
   * điều đó. Khai nhầm phạm vi thì xoá dòng rồi khai lại.
   *
   * Ngày hiệu lực thì KHÁC, và mở ra sửa được từ `0028`. Nó không đổi phạm vi
   * của dòng nào, chỉ đổi thứ tự giữa các dòng CÙNG phạm vi — mà đó chính là
   * cách đổi ngưỡng đã chốt ở `0020`. Trước đó, gõ nhầm một ngày nghĩa là phải
   * xoá dòng rồi khai lại, và trong khoảng giữa hai thao tác thì mọi hồ sơ lập
   * ra mất ngưỡng.
   *
   * `effectiveFrom` vắng mặt là GIỮ NGUYÊN, không phải "xoá" — ngược với `note`
   * của dòng hồ sơ (`0027`). Lý do đơn giản: cột này `NOT NULL`, không có trạng
   * thái "không có giá trị" nào để diễn đạt, nên "vắng mặt = xoá" thậm chí không
   * biểu diễn được.
   *
   * Sửa KHÔNG viết lại lịch sử: `pol.policy_line.threshold_snap` đã đóng băng
   * ngưỡng vào từng dòng hồ sơ lúc lập (`0001_init.sql:92`).
   */
  async update(
    code: string,
    input: { thresholdRate2: number; effectiveFrom?: string | undefined },
    actorId: string,
  ) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(
        `SELECT product_group_id, customer_type, effective_from, threshold_rate2
           FROM cat.discount_rule WHERE code = $1`,
        [code],
      );
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

      const r = await c
        .query<{ threshold_rate2: number; effective_from: Date }>(
          `UPDATE cat.discount_rule
              SET threshold_rate2 = $2,
                  effective_from  = coalesce($3::date, effective_from)
            WHERE code = $1
          RETURNING threshold_rate2, effective_from`,
          [code, input.thresholdRate2, input.effectiveFrom ?? null],
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
         RETURNING product_group_id, customer_type, effective_from, threshold_rate2`,
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

  async list(page: Page) {
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT r.code, g.code AS "productGroupCode", r.customer_type AS "customerType",
              r.effective_from AS "effectiveFrom", r.threshold_rate2 AS "thresholdRate2",
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
          AND (customer_type    IS NULL OR customer_type    = $2)
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
  if (rang !== 'uq_rule_pham_vi') {
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
