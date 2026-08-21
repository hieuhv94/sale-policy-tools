/**
 * Danh mục đổi → rà lại những hồ sơ ĐÃ ĐÓNG BĂNG xem chúng còn khớp không.
 *
 * Điều quan trọng nhất ở đây vẫn là thứ KHÔNG làm: hồ sơ đã gửi duyệt không bị
 * sửa một dòng nào. Giá và ngưỡng đã đóng băng lúc gửi (muc 7); tự động cập nhật
 * lại là sửa một văn bản đang chờ chữ ký. Consumer chỉ GHI DẤU VẾT và BÁO.
 *
 * MỘT việc duy nhất: ghi `pol.policy_impact` — bảng cho box *Yêu cầu cập nhật*
 * trên trang Tổng quan, gồm mọi hồ sơ đã đóng băng đang lệch (`0029`).
 *
 * TỪNG CÓ việc thứ hai: gửi email tới TDV phụ trách khi hồ sơ *Đang có hiệu lực*
 * bị lệch. **Bỏ ở `0055`** theo yêu cầu của khách hàng, cùng với tiêu chí NTF-13.
 * Ghi lại ở đây thay vì xoá lặng lẽ, vì cả một nhánh mã và bốn nhãn tiêu đề thư
 * biến mất theo, và người đọc sau sẽ tự hỏi vì sao consumer này phát hiện ra
 * chênh lệch mà không báo cho ai.
 *
 * Chỗ người dùng biết chênh lệch, sau `0055`: box *Yêu cầu cập nhật* trên trang
 * Tổng quan, và khối cảnh báo ngay trên màn hình hồ sơ (`0050`).
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

/**
 * Mã lỗi nghiệp vụ bên trong một `HttpException` của Nest (`0083`).
 *
 * `clients.ts` ném `NotFoundException({ code })`, và mã ấy nằm trong phần thân
 * phản hồi chứ không phải trên `Error.message`. Đọc bằng `instanceof
 * NotFoundException` thì KHÔNG đủ: `product-snapshot` trả 404 cho cả sản phẩm
 * đã xoá lẫn sản phẩm chưa khai giá, và hai chuyện ấy phải xử khác nhau.
 *
 * Đọc mềm, không ép kiểu: một lỗi mạng (`TypeError`) rơi vào đây thì trả về
 * `undefined`, và người gọi hiểu là "không kết luận được".
 */
const maLoi = (e: unknown): string | undefined => {
  const than = (e as { response?: unknown })?.response;
  const ma = (than as { code?: unknown })?.code;
  return typeof ma === 'string' ? ma : undefined;
};

/** Nhãn trạng thái sản phẩm cho câu chữ trong thư và trong box Yêu cầu cập nhật. */
const NHAN_TRANG_THAI_SP: Record<string, string> = {
  DANG_AP_DUNG: 'Đang áp dụng',
  DA_VO_HIEU_HOA: 'Đã vô hiệu hoá',
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

    /*
     * NHỚ TẠM TRONG MỘT LƯỢT RÀ (`0045`).
     *
     * Đổi một quy định chiết khấu buộc phải rà MỌI hồ sơ đã đóng băng — không
     * suy ra được hồ sơ nào bị ảnh hưởng mà không tra lại. Nhưng vòng lặp cũ gọi
     * mạng hai lần cho MỖI hồ sơ, mà cả nghìn hồ sơ thì chỉ có vài chục khách
     * hàng và vài chục sản phẩm: gần như mọi lời gọi là hỏi lại đúng câu vừa hỏi.
     * Với 1100 hồ sơ đó là hơn 2000 vòng mạng nối đuôi nhau, và một lượt rà mất
     * hàng chục giây — đủ để một ca kiểm thử chờ 15 giây rồi đỏ.
     *
     * Nhớ tạm còn ĐÚNG HƠN bản cũ: một lượt rà là một phép so tại MỘT thời điểm.
     * Gọi lại danh mục giữa chừng nghĩa là hồ sơ đầu danh sách so với bảng giá
     * lúc 9:00 còn hồ sơ cuối so với bảng giá lúc 9:01, và không ai đọc dấu vết
     * ra được là hai con số ấy đến từ hai thời điểm.
     *
     * Phạm vi là MỘT lượt gọi `handle` — không phải bộ nhớ đệm sống lâu. Lượt rà
     * sau đọc lại danh mục từ đầu.
     */
    const nhoKhach = new Map<string, Awaited<ReturnType<Clients['customer']>> | undefined>();
    const nhoAnh = new Map<string, ProductSnapshot | undefined>();

    /*
     * HỒ SƠ NÀO ĐANG CÓ DẤU VẾT — đọc một lượt cho cả đợt rà (`0045`).
     *
     * Dùng DUY NHẤT làm đường tắt: hồ sơ không lệch gì ở lượt này VÀ không mang
     * sẵn dấu vết nào thì `dongBoDauVet` chắc chắn không ghi và không xoá gì cả —
     * nhưng vẫn tốn một transaction. Với vài nghìn hồ sơ đã đóng băng, đó là vài
     * nghìn lượt BEGIN/COMMIT rỗng, và một lượt rà mất hàng chục giây.
     *
     * Đường tắt này an toàn kể cả khi ảnh chụp lỗi thời: sai theo hướng "tưởng
     * có dấu vết" chỉ tốn thêm một transaction rồi phát hiện không có gì để làm.
     * Sai theo hướng ngược lại nghĩa là một lượt rà khác vừa ghi dấu vết xen vào
     * — mà nó vừa xác nhận dấu vết ấy đúng, nên bỏ qua mới là hành vi đúng.
     *
     * Phép so `moi` (dòng lệch MỚI XUẤT HIỆN, thứ quyết định có gửi thư hay
     * không) vẫn đọc lại TRONG transaction như cũ. Không hạ nó xuống đọc ở đây:
     * hai lượt rà chồng nhau sẽ cùng thấy một ảnh chụp cũ và cùng gửi thư.
     */
    const coDauVet = new Set(
      (
        await this.db.q<{ policy_id: string }>(
          `SELECT DISTINCT policy_id FROM pol.policy_impact WHERE policy_id = ANY($1::uuid[])`,
          [[...theoHoSo.keys()]],
        )
      ).map((r) => r.policy_id),
    );

    /*
     * CHẠY SONG SONG THEO LÔ (`0047`).
     *
     * Nút thắt còn lại sau khi đã nhớ tạm: mỗi hồ sơ vẫn tốn một lượt hỏi khách
     * hàng và một lượt hỏi danh mục, và nhớ tạm không cứu được khi mỗi hồ sơ một
     * khách hàng riêng — đúng tình hình ở bộ test, và cũng đúng ở một công ty có
     * hàng nghìn khách. Nối đuôi nhau thì 1400 hồ sơ là 2800 vòng mạng, và một
     * lượt rà mất hàng chục giây tới hàng phút.
     *
     * Mỗi hồ sơ là một đơn vị ĐỘC LẬP — khác hàng, khác transaction, khác sự
     * kiện — nên chạy chồng lên nhau được. Giới hạn 8: đủ để lấp thời gian chờ
     * mạng, mà không mở 1400 kết nối cùng lúc rồi làm cạn pool của chính mình.
     *
     * Nhớ tạm vẫn có tác dụng trong lô: hồ sơ cùng khách hàng rơi vào các lô
     * khác nhau thì lô sau đọc lại từ `nhoKhach`.
     */
    const SONG_SONG = 8;
    const muc = [...theoHoSo.entries()];
    let soLech = 0;

    // Hàm mũi tên, không phải `function`: thân hàm gọi `this.db` và `this.clients`.
    const raMotHoSo = async (policyId: string, cac: DongCanRa[]): Promise<void> => {
      const dau = cac[0]!;
      if (!nhoKhach.has(dau.customer_id)) {
        nhoKhach.set(
          dau.customer_id,
          await this.clients.customer(dau.customer_id).catch(() => undefined),
        );
      }
      const customer = nhoKhach.get(dau.customer_id);
      if (!customer) return;

      const loai = customer.customerType;
      const chuaCo = cac.map((x) => x.product_id).filter((id) => !nhoAnh.has(`${loai}:${id}`));
      if (chuaCo.length > 0) {
        const { anh, hong } = await this.traAnhChup(chuaCo, loai);
        /*
         * TRA HỤT thì BỎ QUA CẢ HỒ SƠ lượt này (`0083`).
         *
         * Không ghi, không xoá, không nhớ tạm — để lượt rà sau làm lại. Dấu vết
         * đang có ở box *Yêu cầu cập nhật* giữ nguyên, và đó là câu trả lời đúng:
         * thứ đã biết hôm qua vẫn đúng hơn một phỏng đoán rút ra từ một lời gọi
         * vừa hỏng.
         *
         * Ghi tạm `undefined` vào `nhoAnh` là chỗ đặc biệt phải tránh: `Map.has`
         * trả `true` cho một khoá đã đặt bằng `undefined`, nên id ấy sẽ KHÔNG
         * được hỏi lại trong suốt lượt rà — một lần hụt thành hụt cho tới hết.
         */
        if (hong.size > 0) {
          this.log.warn(
            `bỏ qua hồ sơ ${dau.code}: không tra được danh mục cho ${[...hong].length} sản phẩm`,
          );
          return;
        }
        for (const id of chuaCo) nhoAnh.set(`${loai}:${id}`, anh.get(id));
      }
      const snaps = new Map<string, ProductSnapshot>();
      for (const x of cac) {
        const s = nhoAnh.get(`${loai}:${x.product_id}`);
        if (s) snaps.set(x.product_id, s);
      }

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

      if (lech.length === 0 && !coDauVet.has(policyId)) return;

      await this.db.tx((c) => this.dongBoDauVet(c, policyId, cac, lech));
      if (lech.length > 0) soLech += 1;
    };

    for (let i = 0; i < muc.length; i += SONG_SONG) {
      await Promise.all(muc.slice(i, i + SONG_SONG).map(([id, cac]) => raMotHoSo(id, cac)));
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
   *
   * TRẢ VỀ HAI THỨ, không phải một (`0083`). Bản trước chỉ trả map, và mọi id
   * vắng mặt đều bị hiểu là "đã xoá khỏi danh mục" — kể cả id mà lời gọi vừa
   * hỏng vì lý do chớp nhoáng. Một lần catalog khởi động lại là mọi hồ sơ đã
   * đóng băng bị ghi đè dấu vết thành *"sản phẩm đã bị xoá"*, và dấu vết lệch
   * giá thật bị xoá theo — vì nhánh "đã xoá" `continue`, không so giá nữa.
   *
   * `hong` là những id KHÔNG kết luận được. Người gọi phải bỏ qua cả hồ sơ ấy
   * lượt này chứ không được ghi gì: không biết thì im lặng, đừng đoán.
   */
  private async traAnhChup(
    productIds: string[],
    customerType: number,
  ): Promise<{ anh: Map<string, ProductSnapshot>; hong: Set<string> }> {
    try {
      // KHÔNG truyền `on`: so với danh mục HÔM NAY — xem chú thích đầu tệp.
      return { anh: await this.clients.productSnapshots(productIds, customerType), hong: new Set() };
    } catch {
      const anh = new Map<string, ProductSnapshot>();
      const hong = new Set<string>();
      for (const id of productIds) {
        try {
          anh.set(id, await this.clients.productSnapshot(id, customerType));
        } catch (e) {
          /*
           * PHÂN BIỆT "đã xoá" với "tra hụt" (`0083`).
           *
           * Chỉ `PRODUCT_NOT_FOUND` mới là sản phẩm không còn trong danh mục.
           * Mọi lỗi khác — catalog đang khởi động lại, mạng chớp, 500, hay sản
           * phẩm còn đó mà chưa khai giá — đều là "lúc này không tra được", một
           * chuyện hoàn toàn khác.
           */
          if (maLoi(e) === 'PRODUCT_NOT_FOUND') continue;
          hong.add(id);
        }
      }
      return { anh, hong };
    }
  }

  /**
   * Ghi chênh lệch còn đúng, xoá chênh lệch đã hết.
   *
   * Tới `0055` nó còn trả về những dòng MỚI XUẤT HIỆN, để lớp trên quyết định có
   * gửi thư hay không. Thư đã bỏ, nên phép so ấy đi theo — giữ lại một giá trị
   * trả về không ai đọc là mời người sau tưởng nó còn dùng.
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
  ): Promise<void> {
    const maTheoSanPham = new Map(cac.map((d) => [d.product_code_snap, d.product_id]));
    // Phạm vi đối soát = đúng những dòng vừa được so ở lượt này.
    const daRa = new Set(cac.map((d) => d.product_id));
    const dangCo = await c.query<{ product_id: string; kind: string }>(
      `SELECT product_id, kind FROM pol.policy_impact
        WHERE policy_id = $1 AND product_id = ANY($2::uuid[])`,
      [policyId, [...daRa]],
    );
    const giu = new Set<string>();
    for (const l of lech) {
      const productId = maTheoSanPham.get(l.productCode);
      if (!productId) continue;
      giu.add(`${productId}|${l.kind}`);
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
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tag) await this.bus.cancel(this.tag);
    await this.bus.close();
  }
}
