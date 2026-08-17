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
  allowedActionsFor,
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
import { daTacDong, PoliciesService } from './policies.service.js';

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


/**
 * Bước nào bắt buộc chọn ai (`0031`).
 *
 * Ba dòng này thay cho toàn bộ cây tổ chức. Trước đây hồ sơ tự tìm đường qua
 * `approver_user_id` và qua chuỗi cấp trên; giờ mỗi lần chuyển tay là một lần
 * người đang cầm hồ sơ nói rõ mình giao cho ai.
 *
 * `RESUBMIT_AFTER_EDIT` cũng chọn lại, không kế thừa lần trước: hồ sơ bị trả về
 * để sửa thì người sửa có quyền gửi cho một Trưởng bộ phận khác, và ép họ giữ
 * nguyên người vừa trả lại hồ sơ là một mặc định khó chịu mà không luật nào đòi.
 *
 * Kế toán KHÔNG xuất hiện ở `KT_RECEIVE_L1`: người ấy đã được chọn từ lúc gửi
 * duyệt và nhận cả hai lần tiếp nhận.
 */
const PHAN_CONG: Record<string, { truong: 'tbpUserId' | 'keToanUserId' | 'saleAdminUserId'; cot: string; vaiTro: string; nhan: string }[]> = {
  SUBMIT: [
    { truong: 'tbpUserId', cot: 'tbp_user_id', vaiTro: 'TBP', nhan: 'Trưởng bộ phận duyệt' },
    { truong: 'keToanUserId', cot: 'ke_toan_user_id', vaiTro: 'KE_TOAN', nhan: 'Kế toán tiếp nhận' },
  ],
  RESUBMIT_AFTER_EDIT: [
    { truong: 'tbpUserId', cot: 'tbp_user_id', vaiTro: 'TBP', nhan: 'Trưởng bộ phận duyệt' },
    { truong: 'keToanUserId', cot: 'ke_toan_user_id', vaiTro: 'KE_TOAN', nhan: 'Kế toán tiếp nhận' },
  ],
  KT_RECEIVE_L1: [
    { truong: 'saleAdminUserId', cot: 'sale_admin_user_id', vaiTro: 'SALE_ADMIN', nhan: 'Sale Admin xử lý' },
  ],
};

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
    opts: {
      reason?: string | undefined;
      rowVersion?: number | undefined;
      /** Người được chọn ở bước này (`0031`). Xem `PHAN_CONG`. */
      tbpUserId?: string | undefined;
      keToanUserId?: string | undefined;
      saleAdminUserId?: string | undefined;
    },
  ) {
    const before = await this.db.one<{
      id: string;
      code: string;
      status: Status;
      row_version: number;
      tdv_user_id: string | null;
      tbp_user_id: string | null;
      ke_toan_user_id: string | null;
      sale_admin_user_id: string | null;
      customer_id: string;
      supersedes_id: string | null;
      tbp_signed_at: Date | null;
      pending_step: Step | null;
    }>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!before) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertPolicyInScope(before, me);

    // Người được chọn ở bước này — kiểm TRƯỚC khi đụng tới trạng thái, vì chọn
    // sai là lỗi của biểu mẫu chứ không phải của luồng, và người dùng phải nhận
    // về một lỗi nói đúng ô nào sai.
    const phanCong = await this.doiPhanCong(action, opts);

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

      /*
       * LÀM MỚI LẦN CUỐI, rồi mới đóng băng (`0029`).
       *
       * Đây là ranh giới: trước lằn này hồ sơ sống theo danh mục, sau nó thì
       * không bao giờ nữa. Làm mới ở đây chứ không tin vào lần mở gần nhất, vì
       * giữa lúc người lập mở màn hình và lúc họ bấm Gửi có thể là nửa tiếng, và
       * trong nửa tiếng ấy Quản trị có thể đã đổi bảng giá.
       *
       * Dòng KHÔNG làm mới được thì CHẶN — ngược hẳn với đường mở hồ sơ, nơi
       * chúng chỉ giữ số cũ. Ở đó chặn là nhốt người dùng ngoài hồ sơ của chính
       * họ; ở đây cho qua là để một con số không kiểm được đi vào văn bản sắp ký.
       */
      const hong = await this.db.tx((c) => this.policies.lamMoiDong(c, policyId));
      if (hong.length > 0) {
        throw new UnprocessableEntityException({
          code: 'STALE_LINE',
          products: hong,
          message:
            `Không lấy được giá hoặc ngưỡng hiện hành cho: ${hong.join(', ')}. ` +
            'Sản phẩm có thể đã vô hiệu hoá, hoặc chưa khai giá tại ngày áp dụng. ' +
            'Xoá dòng đó hoặc đổi ngày áp dụng rồi gửi lại.',
        });
      }
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
      // Bốn người của hồ sơ SAU bước này, trong MỌI sự kiện (`0031`).
      //
      // Đặt ở `ctx` chứ không ở riêng sự kiện hành động: `policy.publish_signed`
      // gửi cho Kế toán, và nó là một sự kiện TỰ ĐỘNG phát sau khi TBP ký — nếu
      // nó thiếu ba khoá này thì `notify_targets` chỉ trả về người lập, `pick`
      // không tìm thấy Kế toán nào, và lá thư ấy rơi vào bảng thư hỏng. Đã mất
      // đúng một trong sáu thư vì chuyện này.
      tbpUserId: phanCong.tbp_user_id ?? before.tbp_user_id,
      keToanUserId: phanCong.ke_toan_user_id ?? before.ke_toan_user_id,
      saleAdminUserId: phanCong.sale_admin_user_id ?? before.sale_admin_user_id,
    };

    const ketQua = await this.db.tx(async (c) => {
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

      // Ghi người được chọn trong CÙNG transaction với bước chuyển. Tách ra là
      // mở một khe: hồ sơ sang "Chờ TBP duyệt" mà chưa có `tbp_user_id` thì nó
      // không nằm trong hộp việc của ai, và không có gì trên màn hình nói vì sao.
      if (Object.keys(phanCong).length > 0) {
        await c.query(
          `UPDATE pol.policy
              SET tbp_user_id = coalesce($2, tbp_user_id),
                  ke_toan_user_id = coalesce($3, ke_toan_user_id),
                  sale_admin_user_id = coalesce($4, sale_admin_user_id)
            WHERE id = $1`,
          [
            policyId,
            phanCong.tbp_user_id ?? null,
            phanCong.ke_toan_user_id ?? null,
            phanCong.sale_admin_user_id ?? null,
          ],
        );
      }

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
          // Mọi người đã từng chạm vào hồ sơ này (`0036`) — xem `daTacDong`.
          observers: await daTacDong(c, policyId),
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
          /*
           * KHÔNG có `observers` ở đây, khác mọi bước còn lại (`0036`).
           *
           * Đây không phải một lần đổi trạng thái do người làm — nó là bước hệ
           * thống tự chạy ngay sau `TBP_SIGN`, trong cùng transaction. Lá thư
           * của `TBP_SIGN` vừa bay đi một khoảnh khắc trước và đã nói đúng
           * chuyện ấy; thêm một lá "để biết" nữa là hai thư về cùng một giây,
           * và đó là cách nhanh nhất khiến người ta ngừng đọc cả hai.
           */
          actorId: null,
          at: new Date().toISOString(),
        });
      }

      return this.policies.load(policyId, c);
    });

    // Cấp quyền xem khách hàng cho người vừa được giao (`0031`).
    //
    // SAU transaction, không trong: `cus` là schema của service khác, và một
    // lời gọi HTTP nằm trong transaction giữ khoá dòng hồ sơ suốt thời gian
    // mạng — đúng thứ biến một service chậm thành một CSDL đứng.
    if (Object.keys(phanCong).length > 0) {
      await this.clients.grantCustomerAccess(before.customer_id, Object.values(phanCong));
    }

    return ketQua;
  }


  /**
   * Đọc và KIỂM những người được chọn ở bước này.
   *
   * Ba phép kiểm, và cả ba đều đã có lần hỏng thật ở mô hình cũ:
   *
   *   1. **Thiếu** — hồ sơ sang bước tiếp mà không có ai cầm. Ở mô hình cây, đây
   *      là ca "TDV chưa được gán Trưởng bộ phận": hồ sơ nằm ở Chờ TBP duyệt
   *      không vào hộp việc của ai và đứng im tới lúc quá hạn.
   *   2. **Sai vai trò** — chọn một Kế toán vào ô Trưởng bộ phận. Người đó không
   *      có hành động `TBP_SIGN` nào, nên hồ sơ vào ngõ cụt y hệt.
   *   3. **Đã vô hiệu hoá** — tài khoản còn trong CSDL nhưng không đăng nhập
   *      được. Ô chọn của giao diện đã lọc, nhưng ô chọn là thứ người dùng sửa
   *      được; chốt chặn phải nằm ở đây.
   */
  private async doiPhanCong(
    action: Action,
    opts: {
      tbpUserId?: string | undefined;
      keToanUserId?: string | undefined;
      saleAdminUserId?: string | undefined;
    },
  ): Promise<Record<string, string>> {
    const can = PHAN_CONG[action];
    if (!can) return {};

    const thieu = can.filter((x) => !opts[x.truong]);
    if (thieu.length > 0) {
      throw new UnprocessableEntityException({
        code: 'ASSIGNEE_REQUIRED',
        fields: thieu.map((x) => x.truong),
        message: `Chưa chọn ${thieu.map((x) => x.nhan).join(' và ')}.`,
      });
    }

    const ids = can.map((x) => opts[x.truong]!);
    const users = await this.clients.checkUsers(ids);
    const ra: Record<string, string> = {};
    for (const x of can) {
      const id = opts[x.truong]!;
      const u = users[id];
      if (!u || !u.isActive) {
        throw new UnprocessableEntityException({
          code: 'ASSIGNEE_INACTIVE',
          field: x.truong,
          message: `Tài khoản chọn cho ô "${x.nhan}" không còn hoạt động. Chọn người khác.`,
        });
      }
      if (u.role !== x.vaiTro) {
        throw new UnprocessableEntityException({
          code: 'ASSIGNEE_WRONG_ROLE',
          field: x.truong,
          message: `Ô "${x.nhan}" phải chọn tài khoản ${x.vaiTro}, người vừa chọn là ${u.role}.`,
        });
      }
      ra[x.cot] = id;
    }
    return ra;
  }

  /**
   * Hành động NGƯỜI GỌI làm được tại trạng thái hiện tại — danh sách dựng nút.
   *
   * Lọc theo vai trò từ `0038`. Trước đó đường này trả về mọi hành động của
   * trạng thái, bất kể ai hỏi, và giao diện đem thẳng ra vẽ nút — nên Trình dược
   * viên mở hồ sơ đang *Chờ TBP duyệt* thấy cả "Ký số duyệt" lẫn "Từ chối hồ
   * sơ", bấm vào thì nhận 403.
   *
   * Lọc Ở ĐÂY chứ không ở giao diện: máy trạng thái nằm phía máy chủ, và mọi
   * client — màn hình hôm nay, màn hình viết sau này, một lệnh `curl` của người
   * vận hành — đều phải nhận cùng một câu trả lời. Bảng quyền phía giao diện chỉ
   * là lớp ẩn bớt thứ hai.
   */
  async allowed(policyId: string, me: AuthUser) {
    const p = await this.policies.byId(policyId, me);
    return {
      status: p.status,
      allowed: allowedActionsFor(p.status as Status, me.role as Role),
    };
  }

  // --- File đính kèm --------------------------------------------------------

  async attach(
    policyId: string,
    input: { kind: 'HO_SO' | 'SCAN'; fileName: string; objectKey: string; sizeBytes: bigint },
    me: AuthUser,
  ) {
    const p = await this.db.one<{
      status: Status;
      tdv_user_id: string | null;
      tbp_user_id: string | null;
      ke_toan_user_id: string | null;
      sale_admin_user_id: string | null;
    }>(
      `SELECT status, tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id
         FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertPolicyInScope(p, me);

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
    const p = await this.db.one<{
      status: Status;
      tdv_user_id: string | null;
      tbp_user_id: string | null;
      ke_toan_user_id: string | null;
      sale_admin_user_id: string | null;
    }>(
      `SELECT status, tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id
         FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertPolicyInScope(p, me);
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
