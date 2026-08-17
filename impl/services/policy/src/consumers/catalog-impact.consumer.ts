/**
 * Danh mục đổi → rà lại những hồ sơ ĐÃ ĐÓNG BĂNG xem chúng còn khớp không.
 *
 * Điều quan trọng nhất ở đây vẫn là thứ KHÔNG làm: hồ sơ đã gửi duyệt không bị
 * sửa một dòng nào. Giá và ngưỡng đã đóng băng lúc gửi (muc 7); tự động cập nhật
 * lại là sửa một văn bản đang chờ chữ ký. Consumer chỉ GHI DẤU VẾT và BÁO.
 *
 * Hai việc, cùng một phép so:
 *
 *   1. `pol.policy_impact` — bảng cho box *Yêu cầu cập nhật* trên trang Tổng
 *      quan, gồm mọi hồ sơ đã đóng băng đang lệch (`0029`).
 *   2. Email tới TDV phụ trách, chỉ cho hồ sơ **đang có hiệu lực** — đó là hồ sơ
 *      duy nhất mà việc phải làm nằm ngoài luồng duyệt: lập một CSBH mới.
 *
 * SO VỚI DANH MỤC HÔM NAY, không phải với danh mục tại ngày áp dụng. Hai thứ
 * khác nhau, và ở đây phải là hôm nay: câu hỏi của người đọc box là "hồ sơ này
 * còn khớp với bảng giá đang bán không", chứ không phải "lúc lập nó có đúng
 * không" — lúc lập thì nó luôn đúng.
 *
 * KHÔNG lọc theo `rule_code_snap` khi quy định đổi. Một quy định MỚI, cụ thể
 * hơn, thắng quy định đã chụp — mà hồ sơ không hề nhắc tới mã của nó. Lọc theo
 * mã là bỏ sót đúng cái trường hợp khó thấy nhất, nên phải tra lại rồi so.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Bus, BUS } from '@csbh/bus';
import { Db } from '../infra/db.js';
import { Clients, type ProductSnapshot } from '../infra/clients.js';
import { DA_DONG_BANG } from '../policies/policies.service.js';

type DongCanRa = {
  policy_id: string;
  code: string;
  status: string;
  customer_id: string;
  tdv_user_id: string | null;
  product_id: string;
  product_code_snap: string;
  company_price_snap: string;
  threshold_snap: string | null;
};

/**
 * Một chênh lệch đã tìm ra trên một dòng.
 *
 * `PRODUCT` là loại thứ ba, thêm ở `0036`: sản phẩm bị vô hiệu hoá hoặc đã xoá
 * khỏi danh mục. Nặng hơn hai loại kia — không phải "lệch vài đồng" mà là một
 * điều khoản không thực hiện được — nên nó đứng ĐẦU danh sách trong thư.
 */
type Lech = {
  kind: 'PRICE' | 'RULE' | 'PRODUCT';
  productCode: string;
  snap: string;
  moi: string | null;
};

/** Nhãn trạng thái sản phẩm cho câu chữ trong thư và trong box Yêu cầu cập nhật. */
const NHAN_TRANG_THAI_SP: Record<string, string> = {
  DANG_AP_DUNG: 'Đang áp dụng',
  DA_VO_HIEU_HOA: 'Đã vô hiệu hoá',
};

const NHAN_LOAI: Record<Lech['kind'], string> = {
  PRICE: 'Giá',
  RULE: 'Ngưỡng',
  PRODUCT: 'Sản phẩm',
};

const nhanLech = (l: Lech): string => `${NHAN_LOAI[l.kind]} · ${l.productCode}`;

/**
 * `moi === null` mang hai nghĩa khác nhau theo loại, và thư phải nói đúng nghĩa.
 *
 * Ở `RULE` nghĩa là không quy định nào phủ nữa; ở `PRODUCT` nghĩa là sản phẩm đã
 * bị xoá khỏi danh mục. Dùng chung một câu "không còn quy định nào" cho cả hai
 * là nói với người đọc một chuyện không xảy ra.
 */
const giaTriLech = (l: Lech): string => {
  if (l.moi !== null) return `${l.snap} → ${l.moi}`;
  return l.kind === 'PRODUCT'
    ? `${l.snap} → đã xoá khỏi danh mục sản phẩm`
    : `${l.snap} → không còn quy định nào`;
};

@Injectable()
export class CatalogImpactConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CatalogImpactConsumer.name);
  readonly bus = new Bus();
  private tag?: string;

  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.declareConsumer(BUS.queues.policy, BUS.queues.policyDlq, BUS.bindings.policy);
    if (process.env.POL_CONSUME === '0') return;
    this.tag = await this.bus.consume(BUS.queues.policy, async (e) => {
      if (e.routingKey === 'catalog.price_changed') {
        const n = await this.handle({ productId: String(e.payload['productId'] ?? '') });
        this.log.log(`đổi giá ${String(e.payload['productCode'])}: ${n} hồ sơ lệch`);
        return;
      }
      // `catalog.changed` mang mọi thay đổi danh mục — sản phẩm, nhóm, quy định.
      //
      // `discount_rule` đổi được NGƯỠNG của hồ sơ (kể cả khi bị xoá: không quy
      // định nào phủ nữa thì ngưỡng về rỗng). `product` đổi được TRẠNG THÁI của
      // dòng sản phẩm — vô hiệu hoá hay xoá khỏi danh mục (`0036`).
      //
      // Trước `0036` nhánh `product` không có, nên vô hiệu hoá một sản phẩm lọt
      // qua sạch: nó không đổi giá, mà consumer chỉ so giá và ngưỡng.
      if (e.routingKey !== 'catalog.changed') return;
      const entity = e.payload['entity'];
      if (entity === 'discount_rule') {
        const n = await this.handle({});
        this.log.log(`đổi quy định ${String(e.payload['id'])}: ${n} hồ sơ lệch`);
        return;
      }
      if (entity === 'product') {
        // Rà đúng sản phẩm ấy: khác với quy định, ở đây biết chắc dòng nào bị
        // ảnh hưởng, nên không cần quét cả bảng.
        const n = await this.handle({ productId: String(e.payload['id'] ?? '') });
        this.log.log(`đổi sản phẩm ${String(e.payload['id'])}: ${n} hồ sơ lệch`);
      }
    });
  }

  /**
   * Rà và đồng bộ dấu vết. Trả về số hồ sơ đang lệch sau khi rà.
   *
   * `productId` bỏ trống nghĩa là rà MỌI hồ sơ đã đóng băng — đúng cho việc đổi
   * quy định, vì không suy ra được dòng nào bị ảnh hưởng mà không tra lại.
   *
   * Tách khỏi consumer để test gọi thẳng, không cần dựng RabbitMQ.
   */
  async handle(loc: { productId?: string | undefined }): Promise<number> {
    const dong = await this.db.q<DongCanRa>(
      `SELECT p.id AS policy_id, p.code, p.status::text AS status, p.customer_id,
              p.tdv_user_id, l.product_id, l.product_code_snap,
              l.company_price_snap::text AS company_price_snap,
              l.threshold_snap::text AS threshold_snap
         FROM pol.policy p
         JOIN pol.policy_line l ON l.policy_id = p.id
        WHERE p.status::text = ANY($1::text[])
          AND ($2::uuid IS NULL OR l.product_id = $2::uuid)`,
      [DA_DONG_BANG, loc.productId || null],
    );
    if (dong.length === 0) return 0;

    // Gom theo HỒ SƠ: loại khách hàng là thuộc tính của khách, nên mỗi hồ sơ tra
    // một lượt cho mọi dòng của nó thay vì một lượt cho mỗi dòng.
    const theoHoSo = new Map<string, DongCanRa[]>();
    for (const d of dong) {
      const c = theoHoSo.get(d.policy_id) ?? [];
      c.push(d);
      theoHoSo.set(d.policy_id, c);
    }

    let soLech = 0;
    for (const [policyId, cac] of theoHoSo) {
      const dau = cac[0]!;
      const customer = await this.clients.customer(dau.customer_id).catch(() => undefined);
      if (!customer) continue;

      const snaps = await this.traAnhChup(
        cac.map((x) => x.product_id),
        customer.customerType,
      );

      const lech: Lech[] = [];
      for (const d of cac) {
        const s = snaps.get(d.product_id);
        /*
         * KHÔNG có ảnh chụp = sản phẩm đã bị XOÁ khỏi danh mục (`0036`).
         *
         * Trước `0036` nhánh này là `continue` — im lặng bỏ qua dòng. Đó là ca
         * nặng nhất mà lại bị nuốt gọn nhất: hồ sơ đang có hiệu lực cho một mặt
         * hàng không còn tồn tại, và không có gì trên màn hình nói ra.
         *
         * So sánh giá và ngưỡng thì không làm được nữa — không còn gì để so —
         * nên dừng ở đây với đúng một dòng lệch. Nói "giá đã đổi" về một sản
         * phẩm không còn nữa là một câu vô nghĩa.
         */
        if (!s) {
          lech.push({
            kind: 'PRODUCT',
            productCode: d.product_code_snap,
            snap: NHAN_TRANG_THAI_SP['DANG_AP_DUNG']!,
            moi: null,
          });
          continue;
        }
        // Vô hiệu hoá: sản phẩm còn trong danh mục nhưng không đưa vào hồ sơ mới
        // được nữa (CAT-07). Vẫn so tiếp giá và ngưỡng ở dưới — chúng vẫn có
        // nghĩa, và người đọc cần thấy đủ mọi thứ đã lệch trên dòng ấy.
        if (s.status !== 'DANG_AP_DUNG') {
          lech.push({
            kind: 'PRODUCT',
            productCode: d.product_code_snap,
            snap: NHAN_TRANG_THAI_SP['DANG_AP_DUNG']!,
            moi: NHAN_TRANG_THAI_SP[s.status] ?? s.status,
          });
        }
        if (String(s.companyPrice) !== String(d.company_price_snap)) {
          lech.push({
            kind: 'PRICE',
            productCode: d.product_code_snap,
            snap: String(d.company_price_snap),
            moi: String(s.companyPrice),
          });
        }
        const nguongMoi = s.thresholdRate2 === null ? null : (s.thresholdRate2 / 100).toFixed(2);
        if (nguongMoi !== (d.threshold_snap === null ? null : String(d.threshold_snap))) {
          lech.push({
            kind: 'RULE',
            productCode: d.product_code_snap,
            snap: d.threshold_snap === null ? '—' : String(d.threshold_snap),
            moi: nguongMoi,
          });
        }
      }

      const moiXuatHien = await this.db.tx((c) => this.dongBoDauVet(c, policyId, cac, lech));
      if (lech.length > 0) soLech += 1;

      // Thư CHỈ khi có chênh lệch MỚI, và chỉ cho hồ sơ đang hiệu lực. Đổi giá
      // hai lần trong một buổi sáng không được thành hai lá thư nói cùng một
      // chuyện — lá thứ hai làm người nhận ngừng đọc cả hai.
      if (moiXuatHien.length > 0 && dau.status === 'DANG_CO_HIEU_LUC') {
        await this.baoTdv(dau, customer, moiXuatHien);
      }
    }
    return soLech;
  }

  /**
   * Ảnh chụp danh mục HÔM NAY cho một loạt sản phẩm, chịu được sản phẩm đã xoá.
   *
   * Lời gọi cả lô trả 404 cho TOÀN BỘ khi chỉ một id không còn — đó là hợp đồng
   * của `/internal/catalog/product-snapshots`, và nó đúng cho đường lập hồ sơ
   * (thiếu một sản phẩm thì cả hồ sơ sai). Ở đây thì ngược lại: một sản phẩm
   * biến mất là THÔNG TIN CẦN BÁO, không phải lý do bỏ qua cả hồ sơ.
   *
   * Nên: đường nhanh vẫn là một lời gọi cả lô, và chỉ khi nó hỏng mới lùi về
   * hỏi từng cái. Đường chậm chỉ chạy đúng lúc có sản phẩm bị xoá — chuyện hiếm.
   * Id nào không tra được thì VẮNG MẶT trong map, và người gọi hiểu đó là "đã
   * xoá khỏi danh mục".
   */
  private async traAnhChup(
    productIds: string[],
    customerType: number,
  ): Promise<Map<string, ProductSnapshot>> {
    try {
      // KHÔNG truyền `on`: so với danh mục HÔM NAY — xem chú thích đầu tệp.
      return await this.clients.productSnapshots(productIds, customerType);
    } catch {
      const ra = new Map<string, ProductSnapshot>();
      for (const id of productIds) {
        const s = await this.clients.productSnapshot(id, customerType).catch(() => undefined);
        if (s) ra.set(id, s);
      }
      return ra;
    }
  }

  /**
   * Ghi chênh lệch còn đúng, xoá chênh lệch đã hết. Trả về những dòng MỚI.
   *
   * Xoá cũng quan trọng ngang ghi: Quản trị đổi giá rồi đổi trả lại thì hồ sơ
   * hết lệch, và một box còn treo cảnh báo đã hết hiệu lực là một box người dùng
   * sẽ học cách bỏ qua.
   *
   * NHƯNG CHỈ ĐỐI SOÁT NHỮNG SẢN PHẨM VỪA RÀ. Đây là chỗ đã hỏng thật, và hỏng
   * lặng lẽ: lượt rà theo một sản phẩm cụ thể (`catalog.price_changed` và
   * `catalog.changed` của sản phẩm đều mang `productId`) chỉ tính ra chênh lệch
   * cho ĐÚNG sản phẩm ấy — rồi vòng dọn bên dưới coi mọi dấu vết còn lại của
   * cùng hồ sơ là "đã hết" và xoá sạch. Hệ quả: Quản trị đổi giá sản phẩm A, và
   * cảnh báo lệch của sản phẩm B trên cùng hồ sơ biến mất khỏi box, dù B vẫn
   * đang lệch. Không có gì báo, con số chỉ tụt xuống.
   *
   * Trước `0036` lỗi này bị che vì lượt rà cuối cùng của bộ dữ liệu mẫu là một
   * lượt QUÉT TOÀN BỘ (đổi quy định chiết khấu) — nó dựng lại mọi thứ vừa bị
   * xoá. Thêm một lượt rà theo sản phẩm vào cuối là con số rơi thẳng về 0.
   */
  private async dongBoDauVet(
    c: PoolClient,
    policyId: string,
    cac: DongCanRa[],
    lech: Lech[],
  ): Promise<Lech[]> {
    const maTheoSanPham = new Map(cac.map((d) => [d.product_code_snap, d.product_id]));
    // Phạm vi đối soát = đúng những dòng vừa được so ở lượt này.
    const daRa = new Set(cac.map((d) => d.product_id));
    const dangCo = await c.query<{ product_id: string; kind: string }>(
      `SELECT product_id, kind FROM pol.policy_impact
        WHERE policy_id = $1 AND product_id = ANY($2::uuid[])`,
      [policyId, [...daRa]],
    );
    const cu = new Set(dangCo.rows.map((r) => `${r.product_id}|${r.kind}`));

    const giu = new Set<string>();
    const moi: Lech[] = [];
    for (const l of lech) {
      const productId = maTheoSanPham.get(l.productCode);
      if (!productId) continue;
      const khoa = `${productId}|${l.kind}`;
      giu.add(khoa);
      if (!cu.has(khoa)) moi.push(l);
      await c.query(
        `INSERT INTO pol.policy_impact
           (policy_id, product_id, kind, product_code, snap_value, new_value)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (policy_id, product_id, kind) DO UPDATE SET
            snap_value = EXCLUDED.snap_value,
            new_value  = EXCLUDED.new_value,
            detected_at = now()`,
        [policyId, productId, l.kind, l.productCode, l.snap, l.moi],
      );
    }

    for (const r of dangCo.rows) {
      if (giu.has(`${r.product_id}|${r.kind}`)) continue;
      await c.query(
        `DELETE FROM pol.policy_impact
          WHERE policy_id = $1 AND product_id = $2 AND kind = $3`,
        [policyId, r.product_id, r.kind],
      );
    }
    return moi;
  }

  /** Một sự kiện cho MỖI hồ sơ: mỗi hồ sơ có TDV riêng, thư phải tới đúng người. */
  private async baoTdv(
    d: DongCanRa,
    cus: { code: string; name: string },
    lech: Lech[],
  ): Promise<void> {
    /*
     * Đủ MỘT loại thì dùng đúng tên loại ấy; nhiều loại thì nói chung. Người
     * nhận đọc dòng tiêu đề trước khi mở thư, nên nó phải nói đúng chuyện gì.
     *
     * NGOẠI LỆ: có `PRODUCT` thì tiêu đề LUÔN nói về sản phẩm, kể cả khi lệch
     * thêm giá hay ngưỡng (`0036`). Sản phẩm không còn bán được là một điều
     * khoản không thực hiện được, không cùng hạng với chênh lệch vài đồng — gộp
     * nó vào "giá và quy định đã thay đổi" là hạ nó xuống ngang hàng và người
     * nhận sẽ đọc lướt qua.
     */
    const loai = new Set(lech.map((l) => l.kind));
    const action = loai.has('PRODUCT')
      ? 'PRODUCT_IMPACT'
      : loai.size > 1
        ? 'CATALOG_IMPACT'
        : loai.has('PRICE')
          ? 'PRICE_IMPACT'
          : 'RULE_IMPACT';

    await this.db.tx(async (c) => {
      await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
        'policy.catalog_impact',
        JSON.stringify({
          policyId: d.policy_id,
          policyCode: d.code,
          customerId: d.customer_id,
          customerCode: cus.code,
          customerName: cus.name,
          tdvUserId: d.tdv_user_id,
          action,
          toStatus: 'DANG_CO_HIEU_LUC',
          recipients: ['TDV'],
          at: new Date().toISOString(),
          extra: Object.fromEntries(lech.map((l) => [nhanLech(l), giaTriLech(l)])),
        }),
      ]);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tag) await this.bus.cancel(this.tag);
    await this.bus.close();
  }
}
