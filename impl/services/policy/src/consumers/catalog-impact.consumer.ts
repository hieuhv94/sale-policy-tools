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

/** Một chênh lệch đã tìm ra trên một dòng. */
type Lech = { kind: 'PRICE' | 'RULE'; productCode: string; snap: string; moi: string | null };

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
      // `catalog.changed` mang mọi thay đổi danh mục — sản phẩm, nhóm, người ký.
      // Chỉ quy định chiết khấu mới đổi được ngưỡng của một hồ sơ.
      if (e.routingKey === 'catalog.changed' && e.payload['entity'] === 'discount_rule') {
        const n = await this.handle({});
        this.log.log(`đổi quy định ${String(e.payload['id'])}: ${n} hồ sơ lệch`);
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

      let snaps: Map<string, ProductSnapshot>;
      try {
        // KHÔNG truyền `on`: so với danh mục HÔM NAY — xem chú thích đầu tệp.
        snaps = await this.clients.productSnapshots(
          cac.map((x) => x.product_id),
          customer.customerType,
        );
      } catch {
        // Sản phẩm bị xoá khỏi danh mục chẳng hạn. Bỏ qua hồ sơ này chứ không
        // hỏng cả lượt rà — một hồ sơ không tra được không được che mất mọi hồ
        // sơ còn lại.
        continue;
      }

      const lech: Lech[] = [];
      for (const d of cac) {
        const s = snaps.get(d.product_id);
        if (!s) continue;
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
   * Ghi chênh lệch còn đúng, xoá chênh lệch đã hết. Trả về những dòng MỚI.
   *
   * Xoá cũng quan trọng ngang ghi: Quản trị đổi giá rồi đổi trả lại thì hồ sơ
   * hết lệch, và một box còn treo cảnh báo đã hết hiệu lực là một box người dùng
   * sẽ học cách bỏ qua.
   */
  private async dongBoDauVet(
    c: PoolClient,
    policyId: string,
    cac: DongCanRa[],
    lech: Lech[],
  ): Promise<Lech[]> {
    const maTheoSanPham = new Map(cac.map((d) => [d.product_code_snap, d.product_id]));
    const dangCo = await c.query<{ product_id: string; kind: string }>(
      `SELECT product_id, kind FROM pol.policy_impact WHERE policy_id = $1`,
      [policyId],
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
    // Đủ MỘT loại thì dùng đúng tên loại ấy; lệch cả hai thì nói cả hai. Người
    // nhận đọc dòng tiêu đề trước khi mở thư, nên nó phải nói đúng chuyện gì.
    const coGia = lech.some((l) => l.kind === 'PRICE');
    const coQd = lech.some((l) => l.kind === 'RULE');
    const action = coGia && coQd ? 'CATALOG_IMPACT' : coGia ? 'PRICE_IMPACT' : 'RULE_IMPACT';

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
          extra: Object.fromEntries(
            lech.map((l) => [
              `${l.kind === 'PRICE' ? 'Giá' : 'Ngưỡng'} · ${l.productCode}`,
              `${l.snap} → ${l.moi ?? 'không còn quy định nào'}`,
            ]),
          ),
        }),
      ]);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tag) await this.bus.cancel(this.tag);
    await this.bus.close();
  }
}
