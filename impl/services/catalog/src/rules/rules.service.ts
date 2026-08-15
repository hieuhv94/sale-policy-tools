/**
 * Chiết khấu quy định — NGUỒN DUY NHẤT kiểm vượt ngưỡng (YCNV muc 6.3).
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paged, PG, pgCode, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';

export type RuleInput = {
  /** Mã do Quản trị đặt, khoá chính từ `0024`. */
  code: string;
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
             (code, product_group_id, customer_type, channel_code, effective_from, threshold_rate2)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING code, specificity`,
          [
            input.code,
            groupId,
            input.customerType ?? null,
            input.channelCode ?? null,
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
  async update(code: string, input: { thresholdRate2: number }, actorId: string) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(
        `SELECT product_group_id, customer_type, channel_code, effective_from, threshold_rate2
           FROM cat.discount_rule WHERE code = $1`,
        [code],
      );
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

      const r = await c.query<{ threshold_rate2: number }>(
        `UPDATE cat.discount_rule SET threshold_rate2 = $2
          WHERE code = $1 RETURNING threshold_rate2`,
        [code, input.thresholdRate2],
      );
      const sau = r.rows[0]!;
      await emit(
        c,
        'catalog.changed',
        changeEvent('discount_rule', code, actorId, { before: truoc.rows[0], after: sau }),
      );
      return { code, thresholdRate2: sau.threshold_rate2 };
    });
  }

  /**
   * Xoá hẳn một quy định.
   *
   * An toàn với lịch sử vì cùng lý do trên: hồ sơ đã lập giữ `threshold_snap`
   * của chính nó. Xoá chỉ đổi cách tính cho hồ sơ lập TỪ ĐÂY VỀ SAU.
   */
  async remove(code: string, actorId: string) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(
        `DELETE FROM cat.discount_rule WHERE code = $1
         RETURNING product_group_id, customer_type, channel_code, effective_from,
                   threshold_rate2`,
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
   * Thứ tự: điểm cụ thể giảm dần → ngày hiệu lực muộn hơn → mã. Cột
   * `specificity` sinh sẵn trong CSDL nên trọng số chỉ định nghĩa một chỗ.
   *
   * TẦNG THỨ BA KHÔNG CÒN VỚI TỚI ĐƯỢC từ `0022`. Trọng số 4/2/1 là nhị phân nên
   * hai phạm vi khác nhau không bao giờ hoà điểm; hoà điểm ⇒ trùng phạm vi ⇒ chỉ
   * mục `uq_rule_pham_vi` đã chặn từ lúc khai. Giữ `code` trong `ORDER BY` là
   * lưới an toàn phòng khi chỉ mục bị gỡ, KHÔNG phải một luật nghiệp vụ. Bỏ hẳn
   * đi thì mất tính tất định trong đúng cái tình huống lẽ ra không xảy ra.
   */
  async resolve(args: {
    productId: string;
    customerType: number;
    channelCode?: string | undefined;
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
          AND (channel_code     IS NULL OR channel_code     = $3)
          AND effective_from <= coalesce($4::date, current_date)
        ORDER BY specificity DESC, effective_from DESC, code
        LIMIT 1`,
      [p.group_id, args.customerType, args.channelCode ?? null, args.on ?? null],
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
