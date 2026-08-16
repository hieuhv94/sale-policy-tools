import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG, paged, pgCode, type AuthUser, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ScopeClient } from '../infra/scope.client.js';
import { PolicyClient } from '../infra/policy.client.js';

export type CustomerInput = {
  code: string;
  name: string;
  customerType: number;
  registeredAddress: string;
  ownerName: string;
  idNumber?: string | undefined;
  deliveryAddress?: string | undefined;
  ownerTitle?: string | undefined;
  ownerIdNumber?: string | undefined;
  debt?: bigint | undefined;
};

type Row = {
  id: string;
  code: string;
  name: string;
  id_number: string | null;
  customer_type: number;
  registered_address: string;
  delivery_address: string | null;
  owner_name: string;
  owner_title: string | null;
  owner_id_number: string | null;
  debt: string;
  tdv_user_id: string;
  /** `0034` — ngừng hợp tác thì khách biến khỏi ô chọn lúc lập hồ sơ. */
  status: string;
  retired_at: Date | null;
};

/**
 * Vai trò được đổi TDV phụ trách. TDV không tự chuyển khách của mình (CUST-10).
 *
 * CHỈ CÒN Quản trị hệ thống từ `0031`. Sale Admin có quyền này suốt từ P11d, và
 * hôm nay rà lại thì KHÔNG có yêu cầu nghiệp vụ nào cấp nó: YCNV §6.1 chỉ nói
 * "khách hàng do TDV tạo", §2.5 liệt kê bảy đầu việc của Sale Admin mà không có
 * việc giao khách. Lý do thật của lựa chọn cũ là Sale Admin đứng ở gốc nhánh cây
 * chứa TDV đó — và cây ấy vừa bị bỏ.
 *
 * Quản trị hệ thống thay vào, vì đây là việc hành chính đi kèm việc vô hiệu hoá
 * tài khoản một TDV nghỉ việc, và họ đã là người làm vế kia.
 */
const CAN_REASSIGN = ['QUAN_TRI'];

@Injectable()
export class CustomersService {
  constructor(
    private readonly db: Db,
    private readonly scope: ScopeClient,
    private readonly policies: PolicyClient,
  ) {}

  async create(input: CustomerInput, me: AuthUser) {
    // Trùng CCCD/MST thì VẪN LƯU, chỉ kèm cảnh báo: một chủ hộ mở nhiều điểm
    // bán là nghiệp vụ có thật (CUST-05).
    const duplicates = await this.findByIdNumber(input.idNumber);

    // Ghi khách hàng và ghi sự kiện trong CÙNG transaction. Trước P7b bước này
    // không phát sự kiện nào, và hậu quả rộng hơn báo cáo: nhật ký cũng không có
    // dòng nào cho việc lập khách hàng, tức là mục 10 hở đúng ở thao tác mở đầu
    // mọi hồ sơ.
    const row = await this.db.tx(async (c) => {
      const r = await c
        .query<Row>(
          `INSERT INTO cus.customer
             (code, name, id_number, customer_type, registered_address, delivery_address,
              owner_name, owner_title, owner_id_number, debt, tdv_user_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
           RETURNING *`,
          [
            input.code,
            input.name,
            input.idNumber ?? null,
            input.customerType,
            input.registeredAddress,
            input.deliveryAddress ?? null,
            input.ownerName,
            input.ownerTitle ?? null,
            input.ownerIdNumber ?? null,
            (input.debt ?? 0n).toString(),
            // TDV phụ trách mặc định là người tạo (CUST-01).
            me.id,
          ],
        )
        .catch((e: unknown) => {
          if (pgCode(e) === PG.uniqueViolation) {
            throw new ConflictException({ code: 'CUSTOMER_CODE_DUPLICATE' });
          }
          throw e;
        });
      const created = r.rows[0]!;
      await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
        'customer.created',
        JSON.stringify({
          entity: 'customer',
          id: created.id,
          customerId: created.id,
          actorId: me.id,
          after: toDto(created),
          at: new Date().toISOString(),
        }),
      ]);
      return created;
    });

    return { ...toDto(row), duplicateIdNumberWith: duplicates };
  }

  async byId(id: string, me: AuthUser) {
    const row = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    await this.assertInScope(row.tdv_user_id, me, id);
    return toDto(row);
  }

  /**
   * Tìm theo tên, địa chỉ đăng ký hoặc mã số thuế (CUST-17).
   *
   * KHÔNG có trường "Tên mã khách" — khái niệm đó đã bỏ khỏi yêu cầu; ai muốn
   * tra thì dùng đúng ba tiêu chí trên.
   */
  async search(
    q: string | undefined,
    me: AuthUser,
    page: Page,
    opts: { forNewPolicy?: boolean | undefined } = {},
  ) {
    const ids = await this.scope.userIdsFor(me);
    const like = q ? `%${q}%` : null;
    // Chuỗi ghép giống hệt biểu thức của index GIN trigram ix_customer_search —
    // lệch một ký tự là Postgres không dùng index và quay về quét toàn bảng.
    const rows = await this.db.q<Row & { total_count: string }>(
      // Hai nguồn quyền xem, gộp bằng `OR` (`0031`): khách mình phụ trách, và
      // khách của những CSBH mình đã xử lý. `$3` là cờ "Quản trị thấy tất cả" —
      // đưa vào câu lệnh thay vì dựng hai câu, để chỉ có một hình dạng truy vấn
      // phải đọc và phải tối ưu.
      `SELECT *, count(*) OVER() AS total_count FROM cus.customer c
        WHERE ($5::boolean
               OR c.tdv_user_id = ANY($1::uuid[])
               OR EXISTS (SELECT 1 FROM cus.customer_access a
                           WHERE a.customer_id = c.id AND a.user_id = ANY($1::uuid[])))
          AND ($2::text IS NULL
               OR (name || ' ' || registered_address || ' ' || coalesce(id_number, ''))
                  ILIKE $2)
          -- forNewPolicy giấu khách đã ngừng hợp tác khỏi ô chọn lúc lập hồ sơ.
          -- Danh sách khách hàng bình thường VẪN hiện họ: hồ sơ cũ của họ phải
          -- tra lại được, và một khách biến mất hẳn khỏi mọi màn hình là một
          -- khách không ai đối chiếu được nữa (0034).
          AND (NOT $6::boolean OR c.status = 'DANG_HOP_TAC')
        -- Cột id là KHOÁ PHÁ HOÀ, không phải trang trí. Hai khách hàng trùng tên
        -- là chuyện thường (chuỗi nhà thuốc cùng thương hiệu), và khi khoá sắp
        -- xếp bị hoà thì Postgres được phép trả về theo thứ tự bất kỳ — hai lời
        -- gọi LIMIT/OFFSET liên tiếp cho ra hai thứ tự khác nhau, nên trang 2
        -- lặp lại một dòng của trang 1 và bỏ mất một dòng khác. Không có thông
        -- báo lỗi nào; người dùng chỉ thấy một khách hàng hiện hai lần.
        ORDER BY name, id
        LIMIT $3 OFFSET $4`,
      [ids, like, page.limit, page.offset, me.role === 'QUAN_TRI', opts.forNewPolicy === true],
    );
    const out = paged(rows, page);
    return { ...out, items: out.items.map((r) => toDto(r as unknown as Row)) };
  }

  async update(
    id: string,
    // Mọi trường đều `| undefined` tường minh: với exactOptionalPropertyTypes,
    // "vắng mặt" và "có mặt nhưng undefined" là hai kiểu khác nhau, mà bộ kiểm
    // dữ liệu vào luôn trả về dạng thứ hai.
    patch: { [K in keyof CustomerInput]?: CustomerInput[K] | undefined } & {
      tdvUserId?: string | undefined;
    },
    me: AuthUser,
  ) {
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    await this.assertInScope(cur.tdv_user_id, me, id);

    if (patch.tdvUserId !== undefined && !CAN_REASSIGN.includes(me.role)) {
      throw new ForbiddenException({
        code: 'REASSIGN_FORBIDDEN',
        message: 'Chỉ Quản trị hệ thống đổi được TDV phụ trách',
      });
    }

    return this.db.tx(async (c) => {
      const r = await c.query<Row>(
        `UPDATE cus.customer SET
            customer_type      = coalesce($11, customer_type),
            name               = coalesce($2, name),
            id_number          = coalesce($3, id_number),
            registered_address = coalesce($4, registered_address),
            delivery_address   = coalesce($5, delivery_address),
            owner_name         = coalesce($6, owner_name),
            owner_title        = coalesce($7, owner_title),
            owner_id_number    = coalesce($8, owner_id_number),
            debt               = coalesce($9, debt),
            tdv_user_id        = coalesce($10, tdv_user_id),
            updated_at         = now()
          WHERE id = $1 RETURNING *`,
        [
          id,
          patch.name ?? null,
          patch.idNumber ?? null,
          patch.registeredAddress ?? null,
          patch.deliveryAddress ?? null,
          patch.ownerName ?? null,
          patch.ownerTitle ?? null,
          patch.ownerIdNumber ?? null,
          patch.debt?.toString() ?? null,
          patch.tdvUserId ?? null,
          patch.customerType ?? null,
        ],
      );
      const after = r.rows[0]!;
      // Nhật ký ghi giá trị trước và sau (CUST-15). Đi qua outbox vì role
      // csbh_cus không có quyền ghi vào schema aud.
      await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
        'customer.changed',
        JSON.stringify({
          entity: 'customer',
          id,
          actorId: me.id,
          before: toDto(cur),
          after: toDto(after),
          at: new Date().toISOString(),
        }),
      ]);
      return toDto(after);
    });
  }

  /**
   * Xem trước: bấm *Ngừng hợp tác* bây giờ thì chuyện gì xảy ra (`0034`).
   *
   * Màn hình phải nói được ba con số TRƯỚC khi người dùng bấm, vì ba kết cục
   * khác hẳn nhau: chặn lại, xoá hẳn, hay giữ lại và cho hết hiệu lực.
   */
  async xemTruocNgung(id: string, me: AuthUser) {
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    this.assertChinhTdv(cur, me);
    const hs = await this.policies.hoSoCua(id);
    return {
      id,
      code: cur.code,
      name: cur.name,
      status: cur.status,
      dangCho: hs.dangCho,
      dangHieuLuc: hs.dangHieuLuc,
      // Chưa hồ sơ nào thì dòng bị XOÁ HẲN, không phải chuyển trạng thái. Người
      // dùng cần biết điều đó trước khi bấm — hai kết cục không lùi được như nhau.
      seXoaHan: hs.tong === 0,
    };
  }

  /**
   * Ngừng hợp tác với một khách hàng (`0034`).
   *
   * MỘT thao tác thay cho hai nút cũ (*Xoá* và một *Ngừng hợp tác* chưa bao giờ
   * tồn tại). Điều kiện cũng chỉ một: **không CSBH nào đang chờ**. Kết cục thì
   * hệ thống tự chọn theo việc khách ấy đã có lịch sử hay chưa — đó là chi tiết
   * của hệ thống, không phải quyết định của người dùng:
   *
   *   * **Chưa có hồ sơ nào** → xoá hẳn dòng. Đây là ca lập nhầm: gõ sai mã KH,
   *     tạo trùng, chọn nhầm loại khách. Một bản ghi như thế bị "ngừng hợp tác"
   *     sẽ nằm lại trong mọi danh sách và mọi ô chọn mãi mãi.
   *   * **Đã có hồ sơ** → `NGUNG_HOP_TAC`, và mọi CSBH đang hiệu lực chuyển
   *     `HET_HIEU_LUC`. KHÔNG xoá dòng: hồ sơ trỏ vào khách bằng khoá ngoại, xoá
   *     là mất tên khách trên mọi hồ sơ cũ.
   *
   * THỨ TỰ: cho hồ sơ hết hiệu lực TRƯỚC, đổi trạng thái khách SAU. Ngược lại
   * thì một lượt hỏng giữa chừng để lại khách đã ngừng mà CSBH vẫn đang hiệu
   * lực — tức một chính sách còn hiệu lực cho một khách không còn giao dịch, và
   * không màn hình nào cho thấy sự mâu thuẫn ấy.
   */
  async ngungHopTac(id: string, me: AuthUser) {
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    this.assertChinhTdv(cur, me);

    if (cur.status === 'NGUNG_HOP_TAC') {
      throw new ConflictException({
        code: 'CUSTOMER_ALREADY_RETIRED',
        message: 'Khách hàng này đã ngừng hợp tác rồi.',
      });
    }

    const kq = await this.policies.ngung(id, me.id);
    if (kq.blocked) {
      throw new ConflictException({
        code: 'CUSTOMER_HAS_PENDING_POLICY',
        message:
          `Khách hàng còn ${kq.dangCho.length} hồ sơ CSBH chưa đi hết luồng duyệt. ` +
          'Xử lý xong hoặc xoá hồ sơ đó trước, rồi ngừng hợp tác.',
        policies: kq.dangCho.map((x) => ({ code: x.code, status: x.status })),
      });
    }

    // Không hồ sơ nào — kể cả hồ sơ đã kết thúc — thì không có gì để giữ lại.
    const conVet = await this.policies.hoSoCua(id);
    if (conVet.tong === 0) {
      await this.db.tx(async (c) => {
        await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
          'customer.deleted',
          JSON.stringify({
            entity: 'customer',
            id,
            actorId: me.id,
            before: toDto(cur),
            at: new Date().toISOString(),
          }),
        ]);
        // Khoá ngoại vẫn là chốt chặn cuối: một hồ sơ lập xen vào giữa hai câu
        // lệnh thì CSDL từ chối, và người dùng nhận đúng câu "khách đã có hồ sơ".
        await c
          .query(`DELETE FROM cus.customer WHERE id = $1`, [id])
          .catch((e: unknown) => {
            if (pgCode(e) === PG.foreignKeyViolation) {
              throw new ConflictException({
                code: 'CUSTOMER_HAS_POLICY',
                message: 'Khách hàng vừa có hồ sơ CSBH mới, không xoá được. Tải lại rồi thử lại.',
              });
            }
            throw e;
          });
      });
      return { ok: true, deleted: true, expired: kq.expired.length };
    }

    await this.db.tx(async (c) => {
      const r = await c.query<Row>(
        `UPDATE cus.customer
            SET status = 'NGUNG_HOP_TAC', retired_at = now(), updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id],
      );
      await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
        'customer.changed',
        JSON.stringify({
          entity: 'customer',
          id,
          actorId: me.id,
          action: 'RETIRED',
          before: toDto(cur),
          after: toDto(r.rows[0]!),
          at: new Date().toISOString(),
        }),
      ]);
    });
    return { ok: true, deleted: false, expired: kq.expired.length };
  }

  /**
   * CHỈ TDV phụ trách khách hàng này (`0034`).
   *
   * Chặt hơn `assertInScope`: một Trưởng bộ phận hay Kế toán được giao một CSBH
   * của khách này cũng ĐỌC được khách (`0031`) — nhưng ngừng hợp tác là quyết
   * định về quan hệ với khách hàng, không phải một bước xử lý hồ sơ. Người duy
   * nhất biết khách còn giao dịch hay không là người phụ trách họ.
   *
   * Quản trị hệ thống cũng KHÔNG, dù họ thấy mọi khách hàng: họ đổi được TDV
   * phụ trách, và đó là đúng vai trò hành chính của họ — còn quyết định nghiệp
   * vụ thì thuộc người làm nghiệp vụ.
   */
  private assertChinhTdv(cur: Row, me: AuthUser): void {
    if (cur.tdv_user_id !== me.id) {
      throw new ForbiddenException({
        code: 'NOT_OWNING_TDV',
        message: 'Chỉ Trình dược viên phụ trách khách hàng này mới ngừng hợp tác được.',
      });
    }
  }

  // --- Hồ sơ đính kèm -------------------------------------------------------

  async listDocuments(customerId: string, me: AuthUser) {
    await this.byId(customerId, me);
    return this.db.q(
      `SELECT id, kind, file_name AS "fileName", size_bytes::text AS "sizeBytes",
              uploaded_at AS "uploadedAt"
         FROM cus.customer_document WHERE customer_id = $1 ORDER BY uploaded_at DESC`,
      [customerId],
    );
  }

  /**
   * Ghi con trỏ tới một hồ sơ pháp lý đã nằm trên kho lưu trữ.
   *
   * File thật do `document` giữ; ở đây chỉ lưu siêu dữ liệu. Hai bước chứ không
   * một: `customer` không đụng tới MinIO, và `document` không biết luật nghiệp
   * vụ nào về khách hàng. Không có giấy tờ nào là BẮT BUỘC và hệ thống không
   * cảnh báo hết hạn — việc đó nằm ngoài phần mềm (CUST-13).
   */
  async attachDocument(
    customerId: string,
    input: { kind: string; fileName: string; objectKey: string; sizeBytes: bigint },
    me: AuthUser,
  ) {
    await this.byId(customerId, me);
    const r = await this.db.one<{ id: string }>(
      `INSERT INTO cus.customer_document (customer_id, kind, file_name, object_key, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [customerId, input.kind, input.fileName, input.objectKey, input.sizeBytes.toString(), me.id],
    );
    return { id: r!.id, ...input, sizeBytes: input.sizeBytes.toString() };
  }

  // --- Trợ giúp -------------------------------------------------------------

  private async findByIdNumber(idNumber: string | undefined) {
    if (!idNumber) return [];
    const rows = await this.db.q<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM cus.customer WHERE id_number = $1`,
      [idNumber],
    );
    return rows;
  }

  /**
   * Ai xem được một khách hàng (`0031`, CUST-14).
   *
   * HAI đường, và cả hai đều cần:
   *
   *   1. **TDV phụ trách** — `cus.customer.tdv_user_id`. Đúng cả với khách chưa
   *      có hồ sơ nào, tức đúng ngay từ giây người ta vừa lập xong khách hàng.
   *   2. **Đã xử lý một CSBH của khách này** — `cus.customer_access`, do
   *      `policy` bắn sự kiện sang. Đây là đường của TBP, Kế toán và Sale Admin.
   *
   * Quản trị hệ thống là ngoại lệ, và là ngoại lệ CÓ CHỦ Ý: phạm vi hồ sơ của
   * họ rỗng theo thiết kế, nhưng họ là người đổi TDV phụ trách khi một TDV nghỉ
   * việc — mà khách cần chuyển thường là khách chưa có hồ sơ nào, tức không
   * đường nào ở trên với tới. Không mở đường này thì chức năng ấy không dùng
   * được, và những khách hàng đó không còn ai nhìn thấy.
   */
  private async assertInScope(ownerUserId: string, me: AuthUser, customerId?: string): Promise<void> {
    if (me.role === 'QUAN_TRI') return;
    const ids = await this.scope.userIdsFor(me);
    if (ids.includes(ownerUserId)) return;
    if (customerId) {
      const r = await this.db.q(
        `SELECT 1 FROM cus.customer_access WHERE customer_id = $1 AND user_id = ANY($2::uuid[])`,
        [customerId, ids],
      );
      if (r.length > 0) return;
    }
    throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
  }
}

const toDto = (r: Row) => ({
  id: r.id,
  status: r.status,
  code: r.code,
  name: r.name,
  idNumber: r.id_number,
  customerType: r.customer_type,
  registeredAddress: r.registered_address,
  deliveryAddress: r.delivery_address,
  ownerName: r.owner_name,
  ownerTitle: r.owner_title,
  ownerIdNumber: r.owner_id_number,
  debt: r.debt,
  tdvUserId: r.tdv_user_id,
});
