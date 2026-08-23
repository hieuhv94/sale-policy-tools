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
  ForbiddenRoleError,
  InvalidTransitionError,
  ReasonRequiredError,
  SUA_DUOC,
  transition,
  type Action,
  type Role,
  type Status,
  type Step,
} from '@csbh/domain-policy';
import { PG, pgCode, type AuthUser } from '@csbh/http-kit';
import { emit } from '../infra/emit.js';
import { vaiTroConLai, type BonNguoi } from '../infra/nguoi-nhan.js';
import { Db } from '../infra/db.js';
import { Clients } from '../infra/clients.js';
import { daTacDong, NGUOI_GHI_TEP, PoliciesService } from './policies.service.js';

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
      /** Mẫu bản mềm TDV chọn, đóng băng lúc gửi duyệt (`0098`). */
      mauHoSoId?: string | undefined;
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
      overdue_at: Date | null;
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

    /*
     * Hồ sơ QUÁ HẠN thì không ai thao tác được nữa (`0047`).
     *
     * Đảo ngược NTF-11: trước đây nhãn quá hạn được gỡ ra để hồ sơ đi tiếp đúng
     * nhánh cũ. Từ `0047` nó là trạng thái chết, và sla-worker tự chuyển sang
     * *Đã xoá* sau 3 ngày.
     *
     * Chặn bằng một lỗi RIÊNG chứ không để rơi vào `INVALID_TRANSITION` chung.
     * Câu chung sẽ là "hành động được phép: không có" — đúng nhưng không nói
     * được vì sao, mà đây lại đúng lúc người dùng cần biết vì sao nhất: hồ sơ
     * sắp biến mất và việc phải làm là lập bản mới, không phải thử lại.
     */
    if (before.status === 'QUA_HAN_DUYET') {
      throw new ConflictException({
        code: 'POLICY_OVERDUE',
        message:
          'Hồ sơ đã quá hạn xử lý nên không thao tác được nữa. Hệ thống tự xoá nó sau 3 ngày ' +
          'kể từ lúc quá hạn — hãy lập một hồ sơ mới cho khách hàng này.',
        overdueAt: before.overdue_at ?? null,
        pendingStep: before.pending_step ?? null,
      });
    }

    const current = before.status;

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
          message: 'Hồ sơ chưa có sản phẩm nào',
        });
      }
      await this.policies.assertNoMissingInheritedProduct(policyId);

      /*
       * VĂN BẢN MẪU ĐÓNG BĂNG VÀO HỒ SƠ, ngay tại đây (`0098`).
       *
       * Cùng một lằn ranh với giá và ngưỡng ở khối ngay dưới, và đó là chủ ý:
       * bản trình bày của một văn bản sắp đem đi ký là một phần của thứ được
       * duyệt, không phải sở thích của từng người mở nó ra xem. Sau lằn này TDV
       * không đổi được nữa, và không vai trò nào sau trong luồng chọn được.
       *
       * BẮT BUỘC, không rơi về mẫu đầu danh sách. Mỗi mẫu có tập cột riêng
       * (`0067`), nên mặc định ngầm nghĩa là người gửi ký một bản họ chưa từng
       * chọn — và với "bản gọn đưa khách hàng" thì khác biệt là có hay không có
       * cột CPBH, tức con số nội bộ của Công ty.
       *
       * Chặn ở ĐÂY chứ không ở lúc xem: hồ sơ vẫn đang là bản nháp nên chưa mất
       * gì, đúng lối đã dùng cho "TDV chưa gán Trưởng bộ phận thì không gửi
       * được" (muc 2.9).
       *
       * `RESUBMIT_AFTER_EDIT` cũng phải chọn lại chứ không kế thừa lần trước:
       * hồ sơ bị trả về rồi sửa thì bảng sản phẩm có thể đã khác, mà tập cột phù
       * hợp với bảng cũ chưa chắc còn hợp — đúng lối mà `PHAN_CONG` đã chọn cho
       * người xử lý.
       */
      if (!opts.mauHoSoId) {
        throw new UnprocessableEntityException({
          code: 'TEMPLATE_REQUIRED',
          message: 'Chọn văn bản mẫu cho bản mềm CSBH trước khi gửi duyệt.',
        });
      }

      /*
       * `policy` KHÔNG gọi sang `document` để hỏi mẫu này có thật không.
       *
       * Tôi đã viết lời gọi ấy rồi gỡ đi, nên ghi lại để người sau khỏi viết lại.
       *
       * Nó có vẻ đúng: `policy` vẫn xác minh tham chiếu logic bằng REST đồng bộ
       * (`customer()`, `productSnapshots()`), nên mẫu là cái thứ ba. Nhưng hai
       * cái kia là lời gọi mà `policy` DÙ SAO CŨNG PHẢI GỌI — nó cần dữ liệu
       * khách hàng cho sự kiện, cần giá cho dòng hồ sơ; phép xác minh là thứ đi
       * kèm miễn phí. Lời gọi này thì chỉ để xác minh, không lấy gì.
       *
       * Cái giá thì có thật, và đo được: `document` là service nặng nhất
       * (Chromium, Gotenberg), nên buộc nó vào đường gửi duyệt nghĩa là nó chết
       * thì không ai gửi được hồ sơ nào — trong khi trước đây nó chết chỉ chặn
       * việc xem và xuất file. Nó cũng là lời gọi ĐẦU TIÊN đi vào `document`,
       * đảo chiều phụ thuộc vốn chỉ có một hướng.
       *
       * Còn thứ nó bảo vệ thì gần như rỗng. Giao diện chỉ bày mẫu lấy từ
       * `/policy-templates/available`, nên một id sai chỉ đến từ lượt gọi tay.
       * Mẫu bị VÔ HIỆU giữa chừng lại càng không phải lỗi: hồ sơ đã gắn mẫu vẫn
       * dựng được bản mềm bình thường — đó chính là điều `0098` bảo đảm. Và một
       * id bịa ra thì `render` bắt được, bằng một câu nói rõ chuyện gì hỏng, ở
       * đúng chỗ biết câu trả lời.
       */

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
            'Xoá sản phẩm đó hoặc đổi ngày áp dụng rồi gửi lại.',
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
      // Đặt ở `ctx` chứ không ở riêng từng sự kiện: thiếu ba khoá này thì
      // `notify_targets` chỉ trả về người lập, `pick` không tìm thấy Kế toán
      // nào, và lá thư rơi vào bảng thư hỏng. Đã mất đúng một trong sáu thư vì
      // chuyện này — hồi ấy nạn nhân là `policy.publish_signed`, sự kiện đã
      // được gỡ ở `0064`.
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
        // `RETURNING` bốn người và mã của BẢN CŨ (`0066`): lá thư báo hết hiệu
        // lực gửi cho người của bản cũ, không phải người của bản mới, và hai tập
        // này khác nhau đúng ở ca đáng quan tâm — khách hàng vừa đổi TDV phụ
        // trách. Lấy ngay trong câu UPDATE nên chỉ có thư khi thật sự có dòng
        // đổi trạng thái.
        const cu = await c.query<{ code: string } & BonNguoi>(
          `UPDATE pol.policy
              SET status = 'HET_HIEU_LUC', deactivated_at = now(),
                  superseded_by_id = $2, row_version = row_version + 1
            WHERE id = $1 AND status = 'DANG_CO_HIEU_LUC'
          RETURNING code, tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id`,
          [before.supersedes_id, policyId],
        );
        const banCu = cu.rows[0];

        /*
         * Trừ đi bốn người của BẢN MỚI. Bước này (`KT_RECEIVE_L2`) đã gửi cho cả
         * bốn người ấy lá thư "CSBH bắt đầu có hiệu lực" — cùng một khách hàng,
         * cùng một giây. Không trừ thì phần lớn hồ sơ sinh ra hai lá thư nói hai
         * nửa của cùng một chuyện.
         *
         * Còn lại thường là RỖNG, và rỗng mới là trạng thái bình thường: cùng
         * một người giữ cả hai phiên bản thì họ đã biết rồi. Lá thư này sinh ra
         * cho đúng ca hiếm mà nó có ích.
         */
        const nhan = banCu
          ? vaiTroConLai(banCu, [
              ctx.tdvUserId,
              ctx.tbpUserId,
              ctx.keToanUserId,
              ctx.saleAdminUserId,
            ])
          : [];

        await emit(c, 'policy.superseded', {
          policyId: before.supersedes_id,
          replacedBy: policyId,
          actorId: me.id,
          at: new Date().toISOString(),
          // Từ đây xuống là phần dành cho thư. `notification` bỏ qua sự kiện
          // không có `recipients`, nên khi `nhan` rỗng thì mọi thứ dưới đây chỉ
          // nằm trong nhật ký — không lá thư nào được gửi.
          ...(nhan.length > 0 && banCu
            ? {
                recipients: nhan,
                action: 'SUPERSEDE',
                toStatus: 'HET_HIEU_LUC',
                policyCode: banCu.code,
                customerId: before.customer_id,
                customerCode: cus.code,
                customerName: cus.name,
                // Bốn id của BẢN CŨ — `notification` dịch vai trò sang người
                // bằng đúng bốn khoá này. Đưa nhầm id của bản mới vào đây là gửi
                // thư cho đúng những người vừa bị loại ra ở trên.
                tdvUserId: banCu.tdv_user_id,
                tbpUserId: banCu.tbp_user_id,
                keToanUserId: banCu.ke_toan_user_id,
                saleAdminUserId: banCu.sale_admin_user_id,
                extra: { 'Phiên bản thay thế': before.code },
              }
            : {}),
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

      /*
       * Mốc phân biệt "Trình ký" với "Lỗi bản cứng" (`0045`).
       *
       * Cả hai cùng là `SA_DANG_XU_LY`, nên trạng thái không nói được Sale Admin
       * đang làm bản cứng LẦN ĐẦU hay đang làm LẠI sau khi kế toán bắt in lại.
       *
       * Bất biến: mốc chỉ tồn tại trong lúc hồ sơ đang nằm ở Sale Admin. Đặt khi
       * vào bằng cửa B10C, xoá khi ra bằng B9. Đó là hai lối duy nhất — không có
       * hành động nào khác đi ra khỏi `SA_DANG_XU_LY`, nên không cần dọn ở đâu
       * nữa; thêm chỗ dọn thứ ba chỉ làm bất biến này khó đọc hơn.
       */
      const reprintSql =
        action === 'KT_REQUEST_REPRINT'
          ? 'reprint_requested_at = now(),'
          : action === 'SA_HANDOVER'
            ? 'reprint_requested_at = NULL,'
            : '';

      /*
       * ĐÓNG BĂNG MẪU, trong CÙNG câu lệnh đổi trạng thái (`0098`).
       *
       * Không phải một `UPDATE` thứ hai sau đó: hồ sơ đã sang *Chờ TBP duyệt*
       * mà cột mẫu chưa kịp ghi là một hồ sơ khoá sửa và không xem được bản mềm
       * — không ai chữa được, vì cả hai đường ghi cột đều chỉ mở lúc gửi duyệt.
       * Cùng một câu lệnh thì hai thứ ấy hoặc cùng đúng, hoặc cùng không xảy ra.
       *
       * Ghi ĐÈ ở mỗi lượt gửi, kể cả `RESUBMIT_AFTER_EDIT` — xem khối kiểm ở
       * trên về việc vì sao không kế thừa lần trước.
       *
       * Điều kiện là HÀNH ĐỘNG, không phải "có gửi `mauHoSoId` không". Hai câu
       * ấy khác nhau ở đúng chỗ nguy hiểm: Trưởng bộ phận bấm *Ký số* mà kèm
       * theo một `mauHoSoId` — dù do một màn hình viết sau này gửi thừa, hay do
       * một lượt gọi tay — sẽ ghi đè mẫu mà người gửi đã chọn, ở đúng bước mà
       * yêu cầu nói là không ai được chọn nữa.
       */
      let mauSql = '';
      if (action === 'SUBMIT' || action === 'RESUBMIT_AFTER_EDIT') {
        params.push(opts.mauHoSoId);
        mauSql = `mau_ho_so_id = $${params.length},`;
      }

      const upd = await c.query<{ id: string }>(
        `UPDATE pol.policy SET
            status = $2::pol.policy_status,
            ${stampSql}${reprintSql}${mauSql}
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

      /*
       * KHỐI "XOÁ BẢN SCAN KHI YÊU CẦU IN LẠI" ĐÃ GỠ Ở `0050`.
       *
       * Trước đó `KT_REQUEST_REPRINT` xoá con trỏ tệp trong `pol` rồi phát
       * `policy.scan_discarded` để `document` xoá luôn object trên kho — bản
       * scan biến mất khỏi hệ thống, không giữ bản sao ảnh.
       *
       * Khách hàng chốt ngày 19/08: **giữ nguyên bản scan**, để Sale Admin chủ
       * động gỡ và thay bản khác. Lý do của họ đứng vững hơn luật cũ: Kế toán
       * yêu cầu in lại vì bản GIẤY hỏng, mà cái hỏng ấy nhiều khi chỉ nhìn được
       * khi so với bản scan đang có. Xoá ngay là lấy mất vật đối chiếu của đúng
       * người sắp phải sửa.
       *
       * Đổi lại có một khe: hồ sơ quay về `SA_DANG_XU_LY` mà vẫn đủ điều kiện
       * bàn giao (WF-14 chỉ đòi CÓ bản scan), nên bấm bàn giao ngay là gửi lại
       * đúng bản Kế toán vừa chê. `banScanCu` bên dưới đóng khe ấy bằng một lời
       * cảnh báo trên màn hình — không chặn, vì "chủ động" là điều khách hàng
       * yêu cầu.
       */

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

      /*
       * KHỐI "TỰ CHUYỂN SAU KHI KÝ" ĐÃ BỊ GỠ Ở `0064`.
       *
       * Trước đó, `TBP_SIGN` đặt trạng thái `TBP_DA_KY_SO` rồi khối này lập tức
       * cập nhật lần thứ hai sang `CHO_KT_L1`, ghi thêm một dòng lịch sử
       * `PUBLISH_SIGNED` và phát thêm một sự kiện thư gửi Kế toán.
       *
       * Kế toán có tên trong CẢ HAI danh sách người nhận, nên mỗi lần Trưởng bộ
       * phận ký họ nhận hai lá thư trong cùng một giây. Ghi chú cũ ở đây có lo
       * đúng chuyện ấy, nhưng chỉ gỡ `observers` — người nhận CHÍNH vẫn trùng.
       *
       * Máy trạng thái giờ đi thẳng `CHO_TBP_DUYET -> CHO_KT_L1`, nên câu lệnh
       * UPDATE phía trên đã đặt đúng trạng thái, đã ghi `tbp_signed_at` /
       * `tbp_signed_by` theo `stamp`, và đã đặt lại `sla_due_at` vì `CHO_KT_L1`
       * nằm trong `WAITING`. Không còn gì phải làm bù ở đây.
       */

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
    if (input.kind === 'HO_SO' && !SUA_DUOC.includes(p.status as Status)) {
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
    this.assertNguoiGhiTep(input.kind, me);

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

    // Gỡ theo LOẠI của chính tệp ấy, không theo trạng thái hồ sơ: một hồ sơ ở
    // bước Sale Admin vẫn còn giấy tờ do TDV đính lúc lập, và Sale Admin không
    // có việc gì với chúng.
    const t = await this.db.one<{ kind: 'HO_SO' | 'SCAN' }>(
      `SELECT kind::text AS kind FROM pol.policy_attachment WHERE id = $1 AND policy_id = $2`,
      [attachmentId, policyId],
    );
    if (!t) throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND' });
    this.assertNguoiGhiTep(t.kind, me);

    await this.db.q(`DELETE FROM pol.policy_attachment WHERE id = $1 AND policy_id = $2`, [
      attachmentId,
      policyId,
    ]);
    return { ok: true };
  }

  /**
   * Chỉ đúng vai trò được đụng vào từng LOẠI tệp (`0069`).
   *
   * Tới `0068` cả hai đường chỉ xét trạng thái hồ sơ, nên ở bước *Sale Admin xử
   * lý* thì kế toán tải được bản scan lên và gỡ được bản scan đi. Bản scan là
   * bản giấy có chữ ký khách hàng do chính Sale Admin cầm trong tay — không ai
   * khác có nó để mà tải lên, và việc gỡ nó ra chặn cả bước bàn giao.
   *
   * Bảng tra dùng chung với `loaiTepGhiDuoc`, thứ quyết định nút có hiện hay
   * không. Một bản chép thứ hai ở đây là chỗ để hai bên lệch nhau — và lệch theo
   * chiều nào cũng tệ: nút hiện rồi trả 403, hoặc nút ẩn mà đường vẫn mở.
   */
  private assertNguoiGhiTep(kind: 'HO_SO' | 'SCAN', me: AuthUser): void {
    if (me.role !== NGUOI_GHI_TEP[kind]) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message:
          kind === 'SCAN'
            ? 'Chỉ Sale Admin tải lên và gỡ bản cứng đã scan'
            : 'Chỉ Trình dược viên đính và gỡ giấy tờ của hồ sơ',
      });
    }
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
