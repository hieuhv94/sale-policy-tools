/**
 * Luồng duyệt 10 bước (YCNV muc 3) — chuyển trạng thái, khoá lạc quan, hiệu lực.
 *
 * Toàn bộ LUẬT chuyển bước nằm ở `@csbh/domain-policy/state-machine`, không rải
 * if/else ở đây. Service này chỉ lo bốn việc mà máy trạng thái thuần không làm
 * được: kiểm phạm vi, ghi mốc thời gian, khoá lạc quan, và transaction.
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
import {
  allowedActions,
  effectiveStatus,
  ForbiddenRoleError,
  InvalidTransitionError,
  ReasonRequiredError,
  transition,
  type Action,
  type Role,
  type Status,
  type Step,
} from '@csbh/domain-policy';
import { PG, pgCode, type AuthUser } from '@csbh/http-kit';
import { emit } from '../infra/emit.js';
import { Db } from '../infra/db.js';
import { Clients } from '../infra/clients.js';
import { PoliciesService } from './policies.service.js';

/** Ai nhận email sau mỗi bước (muc 3). */
const RECIPIENTS: Partial<Record<Action, string[]>> = {
  SUBMIT: ['TBP'],
  TBP_SIGN: ['KE_TOAN', 'TDV'],
  TBP_RETURN: ['TDV'],
  TBP_REJECT: ['TDV'],
  KT_RECEIVE_L1: ['SALE_ADMIN', 'TBP', 'TDV'],
  KT_RETURN_L1: ['TBP', 'TDV'],
  SA_HANDOVER: ['KE_TOAN', 'TBP', 'TDV'],
  KT_RECEIVE_L2: ['KE_TOAN', 'TBP', 'SALE_ADMIN', 'TDV'],
  KT_RETURN_L2: ['TBP', 'TDV'],
  KT_REQUEST_REPRINT: ['SALE_ADMIN', 'TDV'],
  RESUBMIT_AFTER_EDIT: ['TBP'],
};

/**
 * SLA đọc từ `pol.sla_config` ngay trong câu lệnh SQL, không phải hằng số trong
 * mã: Quản trị đổi được số ngày và hồ sơ chuyển bước sau đó phải dùng số mới
 * ngay, không chờ triển khai lại (muc 2.7, NTF-12).
 */

@Injectable()
export class WorkflowService {
  constructor(
    private readonly db: Db,
    private readonly policies: PoliciesService,
    private readonly clients: Clients,
  ) {}

  async act(
    policyId: string,
    action: Action,
    me: AuthUser,
    opts: { reason?: string | undefined; rowVersion?: number | undefined },
  ) {
    const before = await this.db.one<{
      id: string;
      code: string;
      status: Status;
      row_version: number;
      tdv_user_id: string | null;
      customer_id: string;
      supersedes_id: string | null;
      tbp_signed_at: Date | null;
      pending_step: Step | null;
    }>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!before) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertInScope(before.tdv_user_id ?? '', me);

    // Ký số lần thứ hai trên cùng hồ sơ. Không để rơi vào nhánh INVALID_TRANSITION
    // chung, vì nguyên nhân khác hẳn: không phải sai bước mà là bấm lặp, và người
    // dùng cần biết chữ ký trước đó vẫn còn nguyên (WF-05).
    if (action === 'TBP_SIGN' && before.tbp_signed_at !== null) {
      throw new ConflictException({
        code: 'ALREADY_SIGNED',
        message: 'Hồ sơ này đã được ký số rồi',
        signedAt: before.tbp_signed_at,
      });
    }

    // Hồ sơ QUÁ HẠN vẫn đi tiếp đúng nhánh cũ: gỡ nhãn quá hạn ra, xét trạng
    // thái thật nằm dưới nó theo `pending_step` (NTF-11).
    const current = effectiveStatus(before.status, before.pending_step);

    let step;
    try {
      step = transition({
        current,
        action,
        role: me.role as Role,
        reason: opts.reason,
      });
    } catch (e) {
      throw mapDomainError(e, current);
    }

    // Điều kiện riêng của từng hành động, không thuộc máy trạng thái thuần.
    if (action === 'SUBMIT' || action === 'RESUBMIT_AFTER_EDIT') {
      const lines = await this.db.q(`SELECT 1 FROM pol.policy_line WHERE policy_id = $1`, [
        policyId,
      ]);
      if (lines.length === 0) {
        throw new UnprocessableEntityException({
          code: 'NO_LINES',
          message: 'Hồ sơ chưa có dòng sản phẩm nào',
        });
      }
      await this.policies.assertNoMissingInheritedProduct(policyId);
    }

    if (action === 'SA_HANDOVER') {
      const scan = await this.db.q(
        `SELECT 1 FROM pol.policy_attachment WHERE policy_id = $1 AND kind = 'SCAN'`,
        [policyId],
      );
      // Bàn giao bản cứng mà chưa có bản scan là bàn giao thứ không tồn tại (WF-14).
      if (scan.length === 0) {
        throw new ConflictException({
          code: 'SCAN_REQUIRED',
          message: 'Chưa tải bản scan nên chưa bàn giao được',
        });
      }
    }

    // Mã và tên khách hàng lấy TRƯỚC transaction và nhét thẳng vào sự kiện.
    //
    // notification không đọc được schema cus, và bắt nó gọi ngược lại customer
    // lúc gửi thư thì một sự kiện chỉ gửi được khi customer đang sống — đúng thứ
    // mẫu outbox sinh ra để tránh. Sự kiện phải TỰ NÓ đủ nghĩa: đọc nó ba tháng
    // sau, khi khách hàng đã đổi tên, vẫn thấy đúng tên tại thời điểm gửi thư.
    const cus = await this.clients.customer(before.customer_id);
    const ctx = {
      policyId,
      policyCode: before.code,
      customerId: before.customer_id,
      customerCode: cus.code,
      customerName: cus.name,
      tdvUserId: before.tdv_user_id,
    };

    return this.db.tx(async (c) => {
      // THỨ TỰ Ở ĐÂY LÀ BẮT BUỘC: vô hiệu bản cũ TRƯỚC, kích hoạt bản mới SAU.
      //
      // Partial unique index uq_policy_active_per_customer kiểm ngay sau từng
      // câu lệnh chứ không hoãn tới lúc COMMIT, nên làm ngược lại là có một
      // khoảnh khắc hai bản cùng DANG_CO_HIEU_LUC và CSDL từ chối luôn. Cả hai
      // câu lệnh vẫn nằm trong MỘT transaction nên không có khoảnh khắc nào
      // khách hàng không có chính sách nào (EFF-01, EFF-13).
      if (step.setsEffectiveFrom && before.supersedes_id) {
        await c.query(
          `UPDATE pol.policy
              SET status = 'HET_HIEU_LUC', deactivated_at = now(),
                  superseded_by_id = $2, row_version = row_version + 1
            WHERE id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
          [before.supersedes_id, policyId],
        );
        await emit(c, 'policy.superseded', {
          policyId: before.supersedes_id,
          replacedBy: policyId,
          actorId: me.id,
          at: new Date().toISOString(),
        });
      }

      // KHOÁ LẠC QUAN. Hai người bấm duyệt cùng lúc thì một thành công, một nhận
      // 409 — không phải "người sau ghi đè người trước" (WF-25, POL-17).
      //
      // Tham số dựng ĐỘNG chứ không đánh số cứng: hành động không có mốc thời
      // gian (từ chối, yêu cầu in lại) thì $4 không xuất hiện trong câu lệnh, và
      // Postgres báo "could not determine data type of parameter $4" — lỗi chỉ
      // lộ ra ở đúng ba hành động đó, rất dễ lọt qua nếu chỉ thử luồng thuận.
      const params: unknown[] = [policyId, step.next, opts.rowVersion ?? before.row_version];
      let stampSql = '';
      if (step.stamp) {
        params.push(me.id);
        stampSql = `${step.stamp}_at = now(), ${step.stamp}_by = $${params.length},`;
      }
      params.push(opts.reason ?? null);
      const reasonIdx = params.length;
      params.push(step.setsEffectiveFrom);
      const effIdx = params.length;
      params.push(isWaiting(step.next));
      const slaIdx = params.length;

      const upd = await c.query<{ id: string }>(
        `UPDATE pol.policy SET
            status = $2::pol.policy_status,
            ${stampSql}
            last_reason = coalesce($${reasonIdx}, last_reason),
            effective_from = CASE WHEN $${effIdx} THEN now() ELSE effective_from END,
            sla_due_at = CASE WHEN $${slaIdx}
                              THEN now() + ((SELECT days FROM pol.sla_config) || ' days')::interval
                              ELSE NULL END,
            sla_started_at = CASE WHEN $${slaIdx} THEN now() ELSE NULL END,
            pending_step = NULL,
            row_version = row_version + 1
          WHERE id = $1 AND row_version = $3
          RETURNING id`,
        params,
      ).catch((e: unknown) => {
        if (pgCode(e) === PG.uniqueViolation) {
          // Khách hàng này đã có CSBH hiệu lực khác rồi — hồ sơ hiện tại không
          // khai báo thay thế bản nào, nên bất biến ở CSDL chặn (POL-17).
          throw new ConflictException({
            code: 'ALREADY_ACTIVE_POLICY',
            message:
              'Khách hàng đã có CSBH đang hiệu lực. Hồ sơ này phải là bản BỔ SUNG ' +
              'hoặc CHỈNH SỬA của bản đó thì mới kích hoạt được.',
          });
        }
        throw e;
      });
      if (upd.rowCount === 0) {
        throw new ConflictException({
          code: 'CONCURRENT_UPDATE',
          message: 'Hồ sơ vừa được người khác cập nhật, hãy tải lại rồi thao tác tiếp',
        });
      }

      if (action === 'TBP_REJECT') {
        await c.query(`UPDATE pol.policy SET rejected_at = now(), rejected_by = $2 WHERE id = $1`, [
          policyId,
          me.id,
        ]);
      }

      // Yêu cầu in lại: bản scan cũ BỊ XOÁ khỏi hệ thống, không giữ bản sao ảnh.
      // Nhật ký vẫn ghi đã có một bản scan bị huỷ, ai huỷ và vì sao (WF-18, muc 10).
      if (action === 'KT_REQUEST_REPRINT') {
        const removed = await c.query<{ id: string; file_name: string; object_key: string }>(
          `DELETE FROM pol.policy_attachment WHERE policy_id = $1 AND kind = 'SCAN'
           RETURNING id, file_name, object_key`,
          [policyId],
        );
        for (const r of removed.rows) {
          await emit(c, 'policy.scan_discarded', {
            ...ctx,
            attachmentId: r.id,
            fileName: r.file_name,
            objectKey: r.object_key,
            actorId: me.id,
            reason: opts.reason,
            at: new Date().toISOString(),
          });
        }
      }

      await this.policies.recordEvent(
        c,
        policyId,
        before.status,
        step.next,
        action,
        me,
        opts.reason,
      );

      // Email đi qua outbox trong cùng transaction: bước chuyển thành công mà
      // email mất, hoặc email bay đi mà bước chuyển bị rollback, đều không xảy ra.
      const to = RECIPIENTS[action];
      if (to) {
        await emit(c, `policy.${action.toLowerCase()}`, {
          ...ctx,
          fromStatus: before.status,
          toStatus: step.next,
          action,
          recipients: to,
          reason: opts.reason ?? null,
          actorId: me.id,
          at: new Date().toISOString(),
        });
      }

      // Sau khi TBP ký số, hệ thống TỰ chuyển sang Chờ Kế toán L1 và phát hành
      // liên kết tại bàn kế toán — không có ai bấm nút ở bước này (WF-09, B5).
      if (action === 'TBP_SIGN') {
        await c.query(
          `UPDATE pol.policy
              SET status = 'CHO_KT_L1',
                  sla_due_at = now() + ((SELECT days FROM pol.sla_config) || ' days')::interval,
                  sla_started_at = now(),
                  row_version = row_version + 1
            WHERE id = $1`,
          [policyId],
        );
        await this.policies.recordEvent(
          c,
          policyId,
          'TBP_DA_KY_SO',
          'CHO_KT_L1',
          'PUBLISH_SIGNED',
          { id: me.id, role: 'SYSTEM', mustChangePassword: false },
          undefined,
        );
        await emit(c, 'policy.publish_signed', {
          ...ctx,
          toStatus: 'CHO_KT_L1',
          action: 'PUBLISH_SIGNED',
          recipients: ['KE_TOAN'],
          actorId: null,
          at: new Date().toISOString(),
        });
      }

      return this.policies.load(policyId, c);
    });
  }

  /** Danh sách hành động hợp lệ tại trạng thái hiện tại — dùng cho UI và cho lỗi 409. */
  async allowed(policyId: string, me: AuthUser) {
    const p = await this.policies.byId(policyId, me);
    return { status: p.status, allowed: allowedActions(p.status as Status) };
  }

  // --- File đính kèm --------------------------------------------------------

  async attach(
    policyId: string,
    input: { kind: 'HO_SO' | 'SCAN'; fileName: string; objectKey: string; sizeBytes: bigint },
    me: AuthUser,
  ) {
    const p = await this.db.one<{ status: Status; tdv_user_id: string | null }>(
      `SELECT status, tdv_user_id FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertInScope(p.tdv_user_id ?? '', me);

    // Hồ sơ đính kèm chỉ sửa được khi còn Nháp; bản scan thì ngược lại, chỉ tải
    // lên ở bước Sale Admin xử lý (POL-18, WF-13).
    if (input.kind === 'HO_SO' && !['NHAP', 'YEU_CAU_CHINH_SUA'].includes(p.status)) {
      throw new ConflictException({
        code: 'POLICY_LOCKED',
        message: 'Hồ sơ đã gửi duyệt, file đính kèm chỉ đọc',
      });
    }
    if (input.kind === 'SCAN' && p.status !== 'SA_DANG_XU_LY') {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'Chỉ tải bản scan khi hồ sơ đang ở bước Sale Admin xử lý',
        status: p.status,
      });
    }

    const r = await this.db.one<{ id: string }>(
      `INSERT INTO pol.policy_attachment (policy_id, kind, file_name, object_key, size_bytes, uploaded_by)
       VALUES ($1,$2::pol.attachment_kind,$3,$4,$5,$6) RETURNING id`,
      [policyId, input.kind, input.fileName, input.objectKey, input.sizeBytes.toString(), me.id],
    );
    return { id: r!.id, ...input, sizeBytes: input.sizeBytes.toString() };
  }

  async detach(policyId: string, attachmentId: string, me: AuthUser) {
    const p = await this.db.one<{ status: Status; tdv_user_id: string | null }>(
      `SELECT status, tdv_user_id FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertInScope(p.tdv_user_id ?? '', me);
    if (!['NHAP', 'YEU_CAU_CHINH_SUA', 'SA_DANG_XU_LY'].includes(p.status)) {
      throw new ConflictException({ code: 'POLICY_LOCKED' });
    }
    await this.db.q(`DELETE FROM pol.policy_attachment WHERE id = $1 AND policy_id = $2`, [
      attachmentId,
      policyId,
    ]);
    return { ok: true };
  }
}

const WAITING_STATES = ['CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2'];
const isWaiting = (s: string) => WAITING_STATES.includes(s);

/** Lỗi của máy trạng thái sang mã HTTP. Giữ nguyên thông điệp và danh sách gợi ý. */
function mapDomainError(e: unknown, current: Status): Error {
  if (e instanceof InvalidTransitionError) {
    return new ConflictException({
      code: 'INVALID_TRANSITION',
      message: e.message,
      status: current,
      allowed: allowedActions(current),
    });
  }
  if (e instanceof ReasonRequiredError) {
    return new BadRequestException({ code: 'REASON_REQUIRED', message: e.message });
  }
  if (e instanceof ForbiddenRoleError) {
    return new ForbiddenException({ code: 'FORBIDDEN_ROLE', message: e.message });
  }
  return e as Error;
}
