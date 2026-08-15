import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG, paged, pgCode, type AuthUser, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { CatalogClient } from '../infra/catalog.client.js';
import { ScopeClient } from '../infra/scope.client.js';

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
  provinceCode?: string | undefined;
  hospitalCode?: string | undefined;
  channelCode?: string | undefined;
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
  province_code: string | null;
  hospital_code: string | null;
  channel_code: string | null;
  tdv_user_id: string;
};

/** Vai trò được đổi TDV phụ trách. TDV không tự chuyển khách của mình (CUST-10). */
const CAN_REASSIGN = ['SALE_ADMIN', 'QUAN_TRI'];

@Injectable()
export class CustomersService {
  constructor(
    private readonly db: Db,
    private readonly catalog: CatalogClient,
    private readonly scope: ScopeClient,
  ) {}

  async create(input: CustomerInput, me: AuthUser) {
    // Bốn trường phân loại đều là danh mục có mã. customer không đọc được
    // schema cat nên hỏi catalog qua API nội bộ (CUST-08).
    await this.assertCodesKnown(input);

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
              owner_name, owner_title, owner_id_number, debt,
              province_code, hospital_code, channel_code, tdv_user_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
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
            input.provinceCode ?? null,
            input.hospitalCode ?? null,
            input.channelCode ?? null,
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
    await this.assertInScope(row.tdv_user_id, me);
    return toDto(row);
  }

  /**
   * Tìm theo tên, địa chỉ đăng ký hoặc mã số thuế (CUST-17).
   *
   * KHÔNG có trường "Tên mã khách" — khái niệm đó đã bỏ khỏi yêu cầu; ai muốn
   * tra thì dùng đúng ba tiêu chí trên.
   */
  async search(q: string | undefined, me: AuthUser, page: Page) {
    const ids = await this.scope.userIdsFor(me);
    const like = q ? `%${q}%` : null;
    // Chuỗi ghép giống hệt biểu thức của index GIN trigram ix_customer_search —
    // lệch một ký tự là Postgres không dùng index và quay về quét toàn bảng.
    const rows = await this.db.q<Row & { total_count: string }>(
      `SELECT *, count(*) OVER() AS total_count FROM cus.customer
        WHERE tdv_user_id = ANY($1::uuid[])
          AND ($2::text IS NULL
               OR (name || ' ' || registered_address || ' ' || coalesce(id_number, ''))
                  ILIKE $2)
        -- Cột id là KHOÁ PHÁ HOÀ, không phải trang trí. Hai khách hàng trùng tên
        -- là chuyện thường (chuỗi nhà thuốc cùng thương hiệu), và khi khoá sắp
        -- xếp bị hoà thì Postgres được phép trả về theo thứ tự bất kỳ — hai lời
        -- gọi LIMIT/OFFSET liên tiếp cho ra hai thứ tự khác nhau, nên trang 2
        -- lặp lại một dòng của trang 1 và bỏ mất một dòng khác. Không có thông
        -- báo lỗi nào; người dùng chỉ thấy một khách hàng hiện hai lần.
        ORDER BY name, id
        LIMIT $3 OFFSET $4`,
      [ids, like, page.limit, page.offset],
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
    await this.assertInScope(cur.tdv_user_id, me);

    if (patch.tdvUserId !== undefined && !CAN_REASSIGN.includes(me.role)) {
      throw new ForbiddenException({
        code: 'REASSIGN_FORBIDDEN',
        message: 'Chỉ Sale Admin hoặc Quản trị hệ thống đổi được TDV phụ trách',
      });
    }
    await this.assertCodesKnown(patch);

    return this.db.tx(async (c) => {
      const r = await c.query<Row>(
        `UPDATE cus.customer SET
            customer_type      = coalesce($14, customer_type),
            name               = coalesce($2, name),
            id_number          = coalesce($3, id_number),
            registered_address = coalesce($4, registered_address),
            delivery_address   = coalesce($5, delivery_address),
            owner_name         = coalesce($6, owner_name),
            owner_title        = coalesce($7, owner_title),
            owner_id_number    = coalesce($8, owner_id_number),
            debt               = coalesce($9, debt),
            province_code      = coalesce($10, province_code),
            hospital_code      = coalesce($11, hospital_code),
            channel_code       = coalesce($12, channel_code),
            tdv_user_id        = coalesce($13, tdv_user_id),
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
          patch.provinceCode ?? null,
          patch.hospitalCode ?? null,
          patch.channelCode ?? null,
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

  async remove(id: string, me: AuthUser) {
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    await this.assertInScope(cur.tdv_user_id, me);

    // Khoá ngoại từ pol.policy chặn ở tầng CSDL. Hỏi trước rồi xoá sau sẽ hở
    // một khe cho hồ sơ lập xen vào giữa hai câu lệnh (CUST-16).
    await this.db.q(`DELETE FROM cus.customer WHERE id = $1`, [id]).catch((e: unknown) => {
      if (pgCode(e) === PG.foreignKeyViolation) {
        throw new ConflictException({
          code: 'CUSTOMER_HAS_POLICY',
          message: 'Khách hàng đã có hồ sơ CSBH, không xoá được',
        });
      }
      throw e;
    });
    return { ok: true };
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

  private async assertCodesKnown(input: {
    provinceCode?: string | undefined;
    hospitalCode?: string | undefined;
    channelCode?: string | undefined;
  }): Promise<void> {
    const res = await this.catalog.validateCodes({
      provinceCode: input.provinceCode,
      hospitalCode: input.hospitalCode,
      channelCode: input.channelCode,
    });
    if (!res.ok) {
      throw new NotFoundException({
        code: 'LOOKUP_CODE_UNKNOWN',
        unknown: res.unknown,
        message: `Mã không có trong danh mục: ${res.unknown.join(', ')}`,
      });
    }
  }

  /** Phạm vi dữ liệu suy ra từ cây tổ chức, do identity giữ (CUST-14). */
  private async assertInScope(ownerUserId: string, me: AuthUser): Promise<void> {
    const ids = await this.scope.userIdsFor(me);
    if (!ids.includes(ownerUserId)) throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
  }
}

const toDto = (r: Row) => ({
  id: r.id,
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
  provinceCode: r.province_code,
  hospitalCode: r.hospital_code,
  channelCode: r.channel_code,
  tdvUserId: r.tdv_user_id,
});
