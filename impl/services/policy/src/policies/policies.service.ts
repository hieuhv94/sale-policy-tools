/**
 * Hồ sơ CSBH — lập, bổ sung, chỉnh sửa, phiên bản, hiệu lực (YCNV muc 3, 5, 7).
 *
 * Ba luật khó nhất nằm ở đây và đều dễ làm sai:
 *   1. Mỗi khách hàng đúng MỘT CSBH hiệu lực, và hiệu lực chỉ chuyển ngay lúc
 *      tiếp nhận L2 — trong CÙNG một transaction với việc vô hiệu bản cũ.
 *   2. Phiên bản mới phải chứa lại TOÀN BỘ sản phẩm của bản đang hiệu lực.
 *   3. Giá và ngưỡng ĐÓNG BĂNG vào dòng hồ sơ lúc lập, không tra lại về sau.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { computeLine, InvalidLineError, STEP_OF_STATUS, type Status } from '@csbh/domain-policy';
import { PG, paged, pgCode, type AuthUser, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { emit } from '../infra/emit.js';
import { Clients } from '../infra/clients.js';
import { ScopeClient } from '../infra/scope.client.js';

export type LineInput = {
  productId: string;
  wholesalePrice: bigint;
  cpbh1?: bigint | undefined;
  cpbh2?: bigint | undefined;
  cpbh3?: bigint | undefined;
  cpbh4?: bigint | undefined;
};

export type CreateInput = {
  customerId: string;
  appliedDate?: string | undefined;
  lines: LineInput[];
  /** Bỏ trống thì hệ thống tự phát hiện và HỎI LẠI thay vì đoán (POL-04, POL-06). */
  mode?: 'SUPPLEMENT' | 'AMEND' | undefined;
};

type PolicyRow = {
  id: string;
  code: string;
  customer_id: string;
  version_no: number;
  status: string;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  applied_date: Date | null;
  effective_from: Date | null;
  tdv_user_id: string | null;
  row_version: number;
  last_reason: string | null;
};

export const SUPPLEMENT_MESSAGE =
  'CSBH cho sản phẩm này chưa có. Bạn có muốn BỔ SUNG không?';
export const AMEND_MESSAGE = 'CSBH cho sản phẩm này đã có. Bạn có muốn CHỈNH SỬA không?';

/** Chỉ hồ sơ đang ở hai trạng thái này mới sửa được nội dung (POL-11). */
const EDITABLE = ['NHAP', 'YEU_CAU_CHINH_SUA'];

/**
 * Phần nhận dạng đi kèm MỌI sự kiện về hồ sơ.
 *
 * Bên nhận không đọc được schema pol lẫn cus, nên sự kiện chỉ mang `policyId`
 * thì họ phải gọi ngược lại hai service để biết đây là hồ sơ của ai — mà nhật ký
 * thì cần biết ngay cả khi cả hai service kia đang tắt.
 */
const evtCtx = (
  p: { id: string; code: string; customer_id: string; tdv_user_id: string | null },
  cus?: { code: string; name: string },
) => ({
  entity: 'policy',
  id: p.id,
  policyId: p.id,
  policyCode: p.code,
  customerId: p.customer_id,
  customerCode: cus?.code ?? null,
  customerName: cus?.name ?? null,
  tdvUserId: p.tdv_user_id,
});

@Injectable()
export class PoliciesService {
  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
    private readonly scope: ScopeClient,
  ) {}

  // --- Lập hồ sơ ------------------------------------------------------------

  async create(input: CreateInput, me: AuthUser) {
    const customer = await this.clients.customer(input.customerId);
    // Không lập hộ khách hàng ngoài phạm vi của mình (POL-15).
    await this.assertInScope(customer.tdvUserId, me);

    const active = await this.db.one<PolicyRow>(
      `SELECT * FROM pol.policy WHERE customer_id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
      [input.customerId],
    );

    if (active && !input.mode) {
      // Khách đã có CSBH thì KHÔNG tự quyết định thay người dùng. Hai tình huống
      // dẫn tới hai câu hỏi khác nhau, và câu hỏi phải đúng từng chữ (POL-04, POL-06).
      const existing = await this.db.q<{ product_id: string }>(
        `SELECT product_id FROM pol.policy_line WHERE policy_id = $1`,
        [active.id],
      );
      const known = new Set(existing.map((r) => r.product_id));
      const hasNew = input.lines.some((l) => !known.has(l.productId));
      throw new ConflictException({
        code: hasNew ? 'SUPPLEMENT_REQUIRED' : 'AMEND_REQUIRED',
        message: hasNew ? SUPPLEMENT_MESSAGE : AMEND_MESSAGE,
        activePolicyId: active.id,
      });
    }

    if (!active && input.mode) {
      throw new BadRequestException({
        code: 'NO_ACTIVE_POLICY',
        message: 'Khách hàng chưa có CSBH nào để bổ sung hoặc chỉnh sửa',
      });
    }

    return this.db.tx(async (c) => {
      const created = await c.query<PolicyRow>(
        `INSERT INTO pol.policy
           (code, customer_id, version_no, status, applied_date, supersedes_id,
            created_by, tdv_user_id, app_version)
         VALUES (pol.next_policy_code(), $1, $2, 'NHAP', $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.customerId,
          active ? active.version_no + 1 : 1,
          input.appliedDate ?? null,
          active?.id ?? null,
          me.id,
          customer.tdvUserId,
          process.env.APP_VERSION ?? '0.0.0-dev',
        ],
      );
      const policy = created.rows[0]!;

      // Phiên bản mới CHỨA LẠI toàn bộ sản phẩm cũ: chép nguyên dòng cũ trước,
      // rồi mới áp các dòng người dùng gửi lên đè lên (POL-05, POL-07, muc 5.4).
      if (active) {
        await c.query(
          `INSERT INTO pol.policy_line
             (policy_id, product_id, product_code_snap, product_name_snap,
              company_price_snap, wholesale_price, cpbh1, cpbh2, cpbh3, cpbh4,
              discount_rate, threshold_snap)
           SELECT $1, product_id, product_code_snap, product_name_snap,
                  company_price_snap, wholesale_price, cpbh1, cpbh2, cpbh3, cpbh4,
                  discount_rate, threshold_snap
             FROM pol.policy_line WHERE policy_id = $2`,
          [policy.id, active.id],
        );
      }

      // Tra ảnh chụp cả lô TRƯỚC vòng lặp: gọi từng dòng thì hồ sơ 30 sản phẩm
      // là 30 vòng mạng nối tiếp sang catalog.
      const snaps = await this.clients.productSnapshots(
        input.lines.map((l) => l.productId),
        customer.customerType,
        customer.channelCode,
      );
      for (const line of input.lines) {
        await this.upsertLine(c, policy.id, line, customer, snaps.get(line.productId));
      }

      await this.recordEvent(c, policy.id, null, 'NHAP', 'CREATE', me, undefined);
      await emit(c, 'policy.created', {
        ...evtCtx(policy, customer),
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policy.id, c);
    });
  }

  /** Thêm hoặc sửa một dòng sản phẩm, đóng băng giá và ngưỡng tại thời điểm này. */
  private async upsertLine(
    c: PoolClient,
    policyId: string,
    line: LineInput,
    customer: { customerType: number; channelCode: string | null },
    preloaded?: import('../infra/clients.js').ProductSnapshot | undefined,
  ): Promise<void> {
    const snap =
      preloaded ??
      (await this.clients.productSnapshot(
        line.productId,
        customer.customerType,
        customer.channelCode,
      ));
    if (snap.status !== 'DANG_AP_DUNG') {
      throw new BadRequestException({
        code: 'PRODUCT_DISABLED',
        message: `Sản phẩm ${snap.productCode} đã vô hiệu hoá, không đưa vào hồ sơ mới được`,
      });
    }

    let calc;
    try {
      calc = computeLine({
        companyPrice: BigInt(snap.companyPrice),
        wholesalePrice: line.wholesalePrice,
        cpbh1: line.cpbh1 ?? 0n,
        cpbh2: line.cpbh2 ?? 0n,
        cpbh3: line.cpbh3 ?? 0n,
        cpbh4: line.cpbh4 ?? 0n,
        threshold: snap.thresholdRate2,
      });
    } catch (e) {
      if (e instanceof InvalidLineError) {
        throw new BadRequestException({ code: e.code, message: e.message });
      }
      throw e;
    }

    // Rate2 (1235) sang numeric(5,2) (12.35). Chia ở ĐÚNG một chỗ này; con số
    // đem so ngưỡng đã được làm tròn từ trước trong computeLine.
    const rate = (calc.discountRate / 100).toFixed(2);
    const threshold = (snap.thresholdRate2 / 100).toFixed(2);

    await c
      .query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, cpbh1, cpbh2, cpbh3, cpbh4,
            discount_rate, threshold_snap)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (policy_id, product_id) DO UPDATE SET
            wholesale_price = EXCLUDED.wholesale_price,
            cpbh1 = EXCLUDED.cpbh1, cpbh2 = EXCLUDED.cpbh2,
            cpbh3 = EXCLUDED.cpbh3, cpbh4 = EXCLUDED.cpbh4,
            company_price_snap = EXCLUDED.company_price_snap,
            discount_rate = EXCLUDED.discount_rate,
            threshold_snap = EXCLUDED.threshold_snap`,
        [
          policyId,
          line.productId,
          snap.productCode,
          snap.productName,
          snap.companyPrice,
          line.wholesalePrice.toString(),
          (line.cpbh1 ?? 0n).toString(),
          (line.cpbh2 ?? 0n).toString(),
          (line.cpbh3 ?? 0n).toString(),
          (line.cpbh4 ?? 0n).toString(),
          rate,
          threshold,
        ],
      )
      .catch((e: unknown) => {
        if (pgCode(e) === PG.uniqueViolation) {
          throw new ConflictException({
            code: 'DUPLICATE_PRODUCT',
            message: `Sản phẩm ${snap.productCode} đã có trong hồ sơ này`,
          });
        }
        throw e;
      });
  }

  /** Thêm một dòng vào hồ sơ đang sửa được (POL-02). */
  async addLine(policyId: string, line: LineInput, me: AuthUser) {
    const p = await this.mustEdit(policyId, me);
    const customer = await this.clients.customer(p.customer_id);
    return this.db.tx(async (c) => {
      const dup = await c.query(
        `SELECT 1 FROM pol.policy_line WHERE policy_id = $1 AND product_id = $2`,
        [policyId, line.productId],
      );
      if ((dup.rowCount ?? 0) > 0) {
        throw new ConflictException({
          code: 'DUPLICATE_PRODUCT',
          message: 'Sản phẩm này đã có trong hồ sơ',
        });
      }
      await this.upsertLine(c, policyId, line, customer);
      await this.bumpVersion(c, policyId);
      await emit(c, 'policy.updated', {
        ...evtCtx(p, customer),
        change: 'LINE_ADDED',
        productId: line.productId,
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policyId, c);
    });
  }

  async removeLine(policyId: string, lineId: string, me: AuthUser) {
    const p = await this.mustEdit(policyId, me);
    return this.db.tx(async (c) => {
      await c.query(`DELETE FROM pol.policy_line WHERE id = $1 AND policy_id = $2`, [
        lineId,
        policyId,
      ]);
      await this.bumpVersion(c, policyId);
      await emit(c, 'policy.updated', {
        ...evtCtx(p),
        change: 'LINE_REMOVED',
        lineId,
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policyId, c);
    });
  }

  async updateAppliedDate(policyId: string, appliedDate: string, me: AuthUser) {
    const p = await this.mustEdit(policyId, me);
    // Ngày áp dụng trong quá khứ vẫn chấp nhận: đây chỉ là thông tin hiển thị,
    // không chi phối trạng thái. Hiệu lực tính từ lúc tiếp nhận L2 (POL-09, EFF-07).
    return this.db.tx(async (c) => {
      await c.query(`UPDATE pol.policy SET applied_date = $2 WHERE id = $1`, [
        policyId,
        appliedDate,
      ]);
      await this.bumpVersion(c, policyId);
      await emit(c, 'policy.updated', {
        ...evtCtx(p),
        change: 'APPLIED_DATE',
        appliedDate,
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policyId, c);
    });
  }

  async remove(policyId: string, me: AuthUser) {
    const p = await this.byId(policyId, me);
    if (p.status !== 'NHAP') {
      throw new ForbiddenException({
        code: 'ONLY_DRAFT_DELETABLE',
        message: `Chỉ xoá được hồ sơ ở trạng thái Nháp; hồ sơ đang ở ${p.status}`,
      });
    }
    if (p.createdBy !== me.id) {
      throw new ForbiddenException({ code: 'NOT_OWNER' });
    }
    // Xoá và báo xoá trong CÙNG transaction. Tách ra thì hồ sơ biến mất khỏi
    // nguồn mà vẫn nằm lại trong read-model báo cáo — và không có sự kiện nào
    // sau đó để sửa, vì hồ sơ không còn tồn tại để phát sự kiện nữa.
    await this.db.tx(async (c) => {
      await c.query(`DELETE FROM pol.policy WHERE id = $1`, [policyId]);
      await emit(c, 'policy.deleted', {
        entity: 'policy',
        id: policyId,
        policyId,
        policyCode: p.code,
        customerId: p.customerId,
        tdvUserId: p.tdvUserId,
        actorId: me.id,
        at: new Date().toISOString(),
      });
    });
  }

  // --- Đọc ------------------------------------------------------------------

  async byId(policyId: string, me: AuthUser) {
    const p = await this.load(policyId);
    await this.assertInScope(p.tdvUserId, me);
    return p;
  }

  async list(
    me: AuthUser,
    filter: { customerId?: string | undefined; status?: string | undefined },
    page: Page,
  ) {
    const ids = await this.scope.userIdsFor(me);
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT id, code, customer_id AS "customerId", version_no AS "versionNo",
              status::text AS status, applied_date AS "appliedDate",
              effective_from AS "effectiveFrom", row_version AS "rowVersion",
              count(*) OVER() AS total_count
         FROM pol.policy
        WHERE tdv_user_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR customer_id = $2::uuid)
          AND ($3::text IS NULL OR status::text = $3)
        -- Cột id phá hoà để phân trang ổn định: khoá sắp xếp bị hoà thì thứ tự
        -- giữa hai lời gọi LIMIT/OFFSET không được bảo đảm giống nhau.
        ORDER BY created_at DESC, id DESC
        LIMIT $4 OFFSET $5`,
      [ids, filter.customerId ?? null, filter.status ?? null, page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /**
   * Việc đang chờ CHÍNH NGƯỜI ĐĂNG NHẬP xử lý — nội dung trang chủ (NTF-07).
   *
   * Hai điều kiện phải cùng đúng, và thiếu một trong hai là sai theo hai kiểu
   * khác nhau:
   *   - **Đúng bước:** trạng thái chờ của hồ sơ ứng với vai trò người đang xem.
   *     Kế toán không thấy hồ sơ đang chờ Trưởng bộ phận duyệt.
   *   - **Đúng phạm vi:** hồ sơ nằm trong cây tổ chức của người đó. Kế toán này
   *     không thấy hồ sơ của TDV thuộc kế toán khác.
   *
   * Hồ sơ QUÁ HẠN vẫn hiện, và hiện ở đúng ô của người đang chờ xử lý — đó là
   * lý do `pending_step` phải lưu lại chứ không chỉ đổi trạng thái (§4).
   */
  async inbox(me: AuthUser, page: Page) {
    const ids = await this.scope.userIdsFor(me);

    // Ban lãnh đạo và Quản trị không có việc trong luồng duyệt: một bên chỉ đọc,
    // một bên nằm ngoài luồng. Trả rỗng chứ không trả "tất cả".
    const waitingFor: Record<string, string[]> = {
      TDV: ['YEU_CAU_CHINH_SUA'],
      TBP: ['CHO_TBP_DUYET'],
      KE_TOAN: ['CHO_KT_L1', 'CHO_KT_L2'],
      SALE_ADMIN: ['SA_DANG_XU_LY'],
    };
    const mine = waitingFor[me.role] ?? [];
    if (mine.length === 0) return paged([], page);

    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT id, code, customer_id AS "customerId", version_no AS "versionNo",
              status::text AS status, pending_step::text AS "pendingStep",
              sla_due_at AS "slaDueAt",
              (status = 'QUA_HAN_DUYET') AS overdue,
              count(*) OVER() AS total_count
         FROM pol.policy
        WHERE tdv_user_id = ANY($1::uuid[])
          AND (status::text = ANY($2::text[])
               OR (status = 'QUA_HAN_DUYET' AND pending_step::text = ANY($3::text[])))
        ORDER BY sla_due_at NULLS LAST, created_at, id
        LIMIT $4 OFFSET $5`,
      [ids, mine, mine.map((st) => STEP_OF_STATUS[st as Status] ?? ''), page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /** CSBH hiện hành của một khách hàng — đúng một bản ghi (EFF-08). */
  async current(customerId: string, me: AuthUser) {
    const row = await this.db.one<PolicyRow>(
      `SELECT * FROM pol.policy WHERE customer_id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
      [customerId],
    );
    if (!row) throw new NotFoundException({ code: 'NO_ACTIVE_POLICY' });
    return this.byId(row.id, me);
  }

  /** Toàn bộ chuỗi phiên bản của một hồ sơ, tra ngược được từ bất kỳ mắt xích nào (EFF-09). */
  async chain(policyId: string, me: AuthUser) {
    await this.byId(policyId, me);
    return this.db.q(
      `WITH RECURSIVE back AS (
         SELECT * FROM pol.policy WHERE id = $1
         UNION ALL
         SELECT p.* FROM pol.policy p JOIN back b ON p.id = b.supersedes_id
       ), fwd AS (
         SELECT * FROM pol.policy WHERE id = $1
         UNION ALL
         SELECT p.* FROM pol.policy p JOIN fwd f ON p.id = f.superseded_by_id
       )
       SELECT DISTINCT id, code, version_no AS "versionNo", status::text AS status,
              supersedes_id AS "supersedesId", superseded_by_id AS "supersededById",
              effective_from AS "effectiveFrom", deactivated_at AS "deactivatedAt"
         FROM (SELECT * FROM back UNION SELECT * FROM fwd) x
        ORDER BY "versionNo"`,
      [policyId],
    );
  }

  async events(policyId: string, me: AuthUser) {
    await this.byId(policyId, me);
    return this.db.q(
      `SELECT seq, from_status::text AS "fromStatus", to_status::text AS "toStatus",
              action, actor_id AS "actorId", actor_role AS "actorRole", reason, at
         FROM pol.policy_event WHERE policy_id = $1 ORDER BY seq`,
      [policyId],
    );
  }

  // --- Trợ giúp dùng chung với workflow -------------------------------------

  async load(policyId: string, c?: PoolClient) {
    const q = c
      ? async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows
      : (sql: string, p: unknown[]) => this.db.q(sql, p);

    const rows = (await q(`SELECT * FROM pol.policy WHERE id = $1`, [policyId])) as PolicyRow[] &
      { created_by: string }[];
    const p = rows[0];
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });

    const lines = (await q(
      `SELECT id, product_id AS "productId", product_code_snap AS "productCode",
              product_name_snap AS "productName",
              company_price_snap::text AS "companyPrice",
              wholesale_price::text AS "wholesalePrice",
              cpbh1::text AS cpbh1, cpbh2::text AS cpbh2,
              cpbh3::text AS cpbh3, cpbh4::text AS cpbh4,
              cpbh_total::text AS "cpbhTotal", net_price::text AS "netPrice",
              discount_rate::text AS "discountRate", threshold_snap::text AS "threshold",
              over_threshold AS "overThreshold"
         FROM pol.policy_line WHERE policy_id = $1 ORDER BY product_code_snap`,
      [policyId],
    )) as Record<string, unknown>[];

    const attachments = (await q(
      `SELECT id, kind::text AS kind, file_name AS "fileName", uploaded_at AS "uploadedAt"
         FROM pol.policy_attachment WHERE policy_id = $1 ORDER BY uploaded_at`,
      [policyId],
    )) as Record<string, unknown>[];

    return {
      id: p.id,
      code: p.code,
      customerId: p.customer_id,
      versionNo: p.version_no,
      status: p.status,
      supersedesId: p.supersedes_id,
      supersededById: p.superseded_by_id,
      appliedDate: p.applied_date,
      effectiveFrom: p.effective_from,
      tdvUserId: p.tdv_user_id ?? '',
      createdBy: (p as unknown as { created_by: string }).created_by,
      rowVersion: p.row_version,
      lastReason: p.last_reason,
      lines,
      attachments,
    };
  }

  /** Hồ sơ đã gửi duyệt thì khoá sửa (POL-11). */
  private async mustEdit(policyId: string, me: AuthUser): Promise<PolicyRow> {
    const p = await this.db.one<PolicyRow>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.assertInScope(p.tdv_user_id ?? '', me);
    if (!EDITABLE.includes(p.status)) {
      throw new ConflictException({
        code: 'POLICY_LOCKED',
        message: `Hồ sơ đang ở ${p.status}, không sửa được`,
        status: p.status,
      });
    }
    return p;
  }

  async bumpVersion(c: PoolClient, policyId: string): Promise<void> {
    await c.query(`UPDATE pol.policy SET row_version = row_version + 1 WHERE id = $1`, [policyId]);
  }

  async recordEvent(
    c: PoolClient,
    policyId: string,
    from: string | null,
    to: string,
    action: string,
    me: AuthUser,
    reason: string | undefined,
  ): Promise<void> {
    await c.query(
      `INSERT INTO pol.policy_event
         (policy_id, seq, from_status, to_status, action, actor_id, actor_role, reason)
       VALUES ($1,
               coalesce((SELECT max(seq) FROM pol.policy_event WHERE policy_id = $1), 0) + 1,
               $2::pol.policy_status, $3::pol.policy_status, $4, $5, $6, $7)`,
      [policyId, from, to, action, me.id, me.role, reason ?? null],
    );
  }

  async assertInScope(ownerUserId: string, me: AuthUser): Promise<void> {
    const ids = await this.scope.userIdsFor(me);
    if (!ids.includes(ownerUserId)) throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
  }

  /**
   * Phiên bản mới phải chứa lại TOÀN BỘ sản phẩm của bản đang hiệu lực (POL-08).
   *
   * Kiểm lúc GỬI DUYỆT chứ không lúc lập: người dùng cần được phép xoá nhầm rồi
   * thêm lại trong lúc còn nháp.
   */
  async assertNoMissingInheritedProduct(policyId: string): Promise<void> {
    const p = await this.db.one<PolicyRow>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!p?.supersedes_id) return;

    const missing = await this.db.q<{ product_code_snap: string }>(
      `SELECT old.product_code_snap
         FROM pol.policy_line old
        WHERE old.policy_id = $1
          AND NOT EXISTS (SELECT 1 FROM pol.policy_line cur
                           WHERE cur.policy_id = $2 AND cur.product_id = old.product_id)`,
      [p.supersedes_id, policyId],
    );
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'MISSING_INHERITED_PRODUCT',
        missing: missing.map((m) => m.product_code_snap),
        message:
          'Phiên bản mới phải chứa lại toàn bộ sản phẩm của CSBH đang hiệu lực. ' +
          `Còn thiếu: ${missing.map((m) => m.product_code_snap).join(', ')}`,
      });
    }
  }
}
