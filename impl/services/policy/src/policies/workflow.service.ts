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
import {
  daTacDong,
  NGUOI_GHI_TEP,
  PoliciesService,
  SQL_CO_BAN_MEM,
  SQL_CO_BAN_SCAN,
  type LoaiTep,
} from './policies.service.js';

/** Ai nhận email sau mỗi bước (muc 3). */
/**
 * XUẤT RA từ `0192` — để một ca kiểm đối chiếu được nó với `CHU_BUOC`.
 *
 * Cùng lý do `0185` xuất `RULES`: bảng này và bảng chủ bước cùng nói về một máy
 * trạng thái, và ca kiểm phải LẶP trên chính nó chứ không chép lại danh sách —
 * bản chép sẽ trôi, và lượt trôi đầu tiên là một người mất thông báo.
 *
 * Không đường chạy nào ngoài tệp này đọc nó.
 */
export const RECIPIENTS: Partial<Record<Action, string[]>> = {
  SUBMIT: ['TBP'],
  TBP_SIGN: ['KE_TOAN', 'TDV'],
  TBP_RETURN: ['TDV'],
  /*
   * HOÀN DUYỆT (`0185`) — báo cho CẢ BA, không riêng TDV.
   *
   * Khác `TBP_RETURN` ngay trên đúng ở chỗ này, và khác vì hoàn cảnh khác: lúc
   * trả lại ở bước duyệt, hồ sơ chưa rời bàn TBP nên chỉ TDV cần biết. Hoàn
   * duyệt thì hồ sơ ĐANG nằm trên bàn Kế toán hoặc Sale Admin — họ đang có việc
   * với nó, và việc ấy vừa bị rút đi. Không báo là để họ làm tiếp một hồ sơ
   * không còn ở đó.
   *
   * Ai không dính tới hồ sơ thì `targets` tự lọc: `0031` chỉ gửi cho người có
   * tên trong bốn cột, nên hồ sơ chưa tới Sale Admin không sinh thư cho họ.
   */
  TBP_RECALL: ['TDV', 'KE_TOAN', 'SALE_ADMIN'],
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
type OPhanCong = {
  truong: 'tbpUserId' | 'keToanUserId' | 'saleAdminUserId';
  cot: string;
  vaiTro: string;
  nhan: string;
};

const O_TBP: OPhanCong = {
  truong: 'tbpUserId',
  cot: 'tbp_user_id',
  vaiTro: 'TBP',
  nhan: 'Trưởng bộ phận duyệt',
};
const O_KE_TOAN: OPhanCong = {
  truong: 'keToanUserId',
  cot: 'ke_toan_user_id',
  vaiTro: 'KE_TOAN',
  nhan: 'Kế toán tiếp nhận',
};
const O_SALE_ADMIN: OPhanCong = {
  truong: 'saleAdminUserId',
  cot: 'sale_admin_user_id',
  vaiTro: 'SALE_ADMIN',
  nhan: 'Sale Admin xử lý',
};

/**
 * Bước này đòi chọn NHỮNG AI — phụ thuộc cả HÀNH ĐỘNG lẫn TRẠNG THÁI hồ sơ
 * (`0141`, khách hàng chốt 27/08).
 *
 * Tới `0140` đây là một bảng tra tĩnh, và nó nói sai ở hai chỗ:
 *
 *   `RESUBMIT_AFTER_EDIT` bắt CHỌN LẠI Trưởng bộ phận và Kế toán. Chú thích cũ
 *   bênh cách ấy — *"người sửa có quyền gửi cho một Trưởng bộ phận khác"* —
 *   nhưng nó trả giá đắt hơn nhiều so với cái tiện nó mua: người vừa trả hồ sơ
 *   về **mất quyền đọc chính hồ sơ họ vừa trả**, vì id họ bị ghi đè khỏi cột
 *   `tbp_user_id` mà phạm vi đọc lại tính theo bốn cột ấy. Họ vẫn nhận thư báo
 *   (`daTacDong` đọc từ nhật ký, không từ bốn cột), bấm vào thì nhận 403.
 *
 *   `KT_RECEIVE_L1` bắt chọn Sale Admin ở MỌI lượt tiếp nhận. Hồ sơ đi vòng thứ
 *   hai — bị trả về, sửa, gửi lại, ký lại, tiếp nhận lại — thì Kế toán phải chọn
 *   lại một người đã chọn rồi, và chọn khác đi là đẩy hồ sơ sang một Sale Admin
 *   chưa từng thấy nó.
 *
 * Nên luật mới: **chọn MỘT LẦN, ở đúng bước sinh ra việc ấy.** Muốn đổi người
 * thì đó là một nghiệp vụ khác (bàn giao), không phải một hệ quả phụ của lượt
 * gửi lại.
 */
export const phanCongCua = (
  action: Action,
  before: { sale_admin_user_id: string | null },
): OPhanCong[] => {
  if (action === 'SUBMIT') return [O_TBP, O_KE_TOAN];
  // Gửi lại sau khi sửa: KHÔNG chọn ai — hai người đã được chọn từ lượt gửi đầu
  // và vẫn nằm nguyên trong bốn cột (đường trả về không xoá chúng).
  if (action === 'RESUBMIT_AFTER_EDIT') return [];
  // Chỉ hỏi Sale Admin ở lượt tiếp nhận ĐẦU TIÊN.
  if (action === 'KT_RECEIVE_L1') return before.sale_admin_user_id ? [] : [O_SALE_ADMIN];
  return [];
};

/**
 * ĐỦ TRƯỜNG MỚI GỬI DUYỆT ĐƯỢC (`0104`, chốt 24/08).
 *
 * Khách hàng: *"lúc duyệt hồ sơ kiểm tra đủ tất cả các trường trong bảng hướng
 * dẫn ánh xạ, chưa đủ thì chưa cho gửi duyệt"*. Bảng hướng dẫn có hai mươi ba
 * trường; bảy trong số đó do các bước B3…B10 sinh ra nên rỗng lúc gửi là đúng.
 * Phân loại đầy đủ nằm ở `NHOM_TRUONG` trong `document/contracts/sources.ts` —
 * MỘT bảng, và `tests/http/policy.test.ts` đối chiếu danh sách dưới đây với
 * chính nó, nên hai bên không trôi khỏi nhau được.
 *
 * KHÔNG hỏi `document` xem mẫu nào in trường nào. Luật là *"đủ trường"*, không
 * phải *"đủ trường mà mẫu vừa chọn có in"* — nên nó không phụ thuộc mẫu, và
 * `policy` tự kiểm bằng dữ liệu nó đã cầm trong tay. Đó cũng là cách giữ nguyên
 * quyết định của `0098`: `policy` không gọi sang `document` trên đường gửi duyệt,
 * vì buộc service nặng nhất vào đường ấy nghĩa là nó chết thì không ai gửi được
 * hồ sơ nào.
 *
 * Kiểm ở LÚC GỬI chứ không lúc xem: hồ sơ còn là bản nháp, người sửa được đang
 * đứng ngay đó, và bản CSBH chưa đi đâu cả. Đúng lối `0067` đã chọn cho mẫu và
 * muc 2.9 đã chọn cho Trưởng bộ phận.
 */
export const TRUONG_CHAN_LUC_GUI = [
  'ho_so.ma_so_thue',
  /*
   * `chuc_danh_dai_dien` và `dien_thoai` ĐÃ RA KHỎI DANH SÁCH (`0171`, chốt
   * 31/08), và lý do là một luật chứ không phải một ý thích.
   *
   * Khách hàng bỏ hai trường ấy khỏi cả hai mẫu hồ sơ mặc định. Luật `0134` nói:
   * **trường nào chặn gửi duyệt thì phải in ra ở đâu đó** — sinh ra sau khi
   * `0128` thêm số điện thoại vào đây mà không mẫu nào in nó, khiến TDV bị bắt
   * điền một ô không xuất hiện trên bất kỳ tờ giấy nào.
   *
   * Giữ phép chặn mà bỏ khỏi tờ giấy là dựng lại đúng cái hỏng ấy. Nên bỏ khỏi
   * tờ giấy thì bỏ luôn khỏi đây — hai vế đi cùng nhau, và `0134` không phải nới
   * một dòng nào.
   *
   * Hai trường VẪN CÒN trong hồ sơ khách hàng và vẫn khai được; chúng chỉ thôi
   * CHẶN lượt gửi duyệt.
   *
   * `ngay_ap_dung` RA KHỎI DANH SÁCH ở `0180`, và lần này vì trường ấy **không
   * còn tồn tại ở cấp hồ sơ**: ngày áp dụng chuyển xuống từng dòng sản phẩm, nơi
   * nó `NOT NULL` và có mặc định ở máy chủ — tức không có trạng thái "thiếu" để
   * mà chặn. Ô *Thời gian áp dụng* cũng rời khỏi hai mẫu hồ sơ mặc định, nên
   * luật `0134` vẫn được giữ ở cả hai vế.
   *
   * Còn ĐÚNG MỘT trường chặn. Danh sách một phần tử trông như thừa, nhưng nó là
   * chỗ `NHOM_TRUONG` của `document` đối chiếu sang — và ca kiểm hai chiều ở
   * `policy.test.ts` đọc chính nó.
   */
] as const;

/** Nhãn người dùng đọc. Câu báo lỗi KHÔNG được lộ tên trường trong mã (`0088`). */
const NHAN_CHAN: Record<(typeof TRUONG_CHAN_LUC_GUI)[number], string> = {
  'ho_so.ma_so_thue': 'Mã số thuế',
};

const rong = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export function thieuTruongLucGui(
  kh: { idNumber?: string | null; ownerTitle?: string | null; phone?: string | null },
): void {
  const thieu: string[] = [];
  if (rong(kh.idNumber)) thieu.push('ho_so.ma_so_thue');
  /*
   * `ownerTitle` và `phone` THÔI BỊ CHẶN (`0171`) — xem `TRUONG_CHAN_LUC_GUI`.
   * Tham số `kh` giữ nguyên hình dạng: `attach`/`detach` và hai chỗ khác đọc
   * cùng kiểu ấy, và thu hẹp nó đi chỉ để bớt hai trường không ai đọc là một
   * lượt sửa lan ra bốn tệp cho không thêm gì.
   *
   * Tham số `ho` thì NGƯỢC LẠI — nó biến mất ở `0180`, vì trường duy nhất nó
   * mang tới đây (`applied_date`) không còn tồn tại. Giữ một tham số rỗng là
   * mời người sau tưởng rằng hàm này còn kiểm gì đó của hồ sơ.
   */
  if (thieu.length === 0) return;

  const nhan = thieu.map((t) => NHAN_CHAN[t as (typeof TRUONG_CHAN_LUC_GUI)[number]]);
  // Nói RÕ phải đi đâu mà sửa: người đọc đang đứng ở màn hình hồ sơ chứ không
  // phải màn hình khách hàng.
  throw new UnprocessableEntityException({
    code: 'POLICY_FIELDS_MISSING',
    thieu: nhan,
    message:
      `Chưa gửi duyệt được: bản CSBH sẽ in ra ô trống ở ${nhan.join(', ')}. ` +
      'Bổ sung ở hồ sơ khách hàng rồi gửi lại.',
  });
}

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
      /** Người được chọn ở bước này (`0031`). Xem `phanCongCua`. */
      tbpUserId?: string | undefined;
      keToanUserId?: string | undefined;
      saleAdminUserId?: string | undefined;
      /** Mẫu bản mềm TDV chọn, đóng băng lúc gửi duyệt (`0098`). */
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
      /**
       * `0190` — số phiên bản, để lá thư nói ra ĐÂY LÀ LOẠI THAY ĐỔI GÌ.
       *
       * `SELECT *` vốn đã lấy cột này; khai ra đây là để `tsc` biết nó có. Bằng
       * 1 nghĩa là CSBH đầu tiên của khách hàng, lớn hơn 1 là bản thay thế —
       * `create` đặt `version_no` và `supersedes_id` trong cùng một câu lệnh nên
       * hai vế ấy không thể lệch nhau.
       */
      version_no: number;
      /** `0142` — luật riêng của Kế toán ở `assertPolicyInScope`. `SELECT *` vốn đã lấy. */
      da_qua_tbp: boolean;
      tbp_signed_at: Date | null;
      pending_step: Step | null;
      overdue_at: Date | null;
    }>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!before) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertPolicyInScope(before, me);

    // Người được chọn ở bước này — kiểm TRƯỚC khi đụng tới trạng thái, vì chọn
    // sai là lỗi của biểu mẫu chứ không phải của luồng, và người dùng phải nhận
    // về một lỗi nói đúng ô nào sai.
    const phanCong = await this.doiPhanCong(action, before, opts);

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

    /*
     * Khách hàng lấy Ở ĐÂY, trước mọi điều kiện riêng của từng hành động.
     *
     * `0104` cần nó cho chốt chặn "đủ trường lúc gửi duyệt", và `0101` cần nó
     * cho ảnh chụp — cùng một lượt đọc, dùng cho cả ba việc kể cả dựng sự kiện.
     * Lấy hai lần thì hai lần ấy đọc hai thời điểm khác nhau, và ảnh chụp có thể
     * khác đúng cái vừa được kiểm.
     */
    const cus = await this.clients.customer(before.customer_id);

    // Điều kiện riêng của từng hành động, không thuộc máy trạng thái thuần.
    if (action === 'SUBMIT' || action === 'RESUBMIT_AFTER_EDIT') {
      // `NOT da_xoa` (`0186`): dòng đã rút không tính là "hồ sơ có sản phẩm".
      // Thiếu vế này thì một hồ sơ mà TDV vừa rút hết mặt hàng vẫn gửi duyệt
      // được, và đi tới bàn duyệt dưới dạng một bảng sản phẩm rỗng.
      const lines = await this.db.q(
        `SELECT 1 FROM pol.policy_line WHERE policy_id = $1 AND NOT da_xoa`,
        [policyId],
      );
      if (lines.length === 0) {
        throw new UnprocessableEntityException({
          code: 'NO_LINES',
          message: 'Hồ sơ chưa có sản phẩm nào',
        });
      }

      /*
       * `assertNoMissingInheritedProduct` GỠ Ở ĐÂY (`0186`).
       *
       * `POL-08` đứng đúng chỗ này và cấm gửi duyệt một phiên bản thiếu mặt hàng
       * của bản đang hiệu lực. Khách hàng đảo luật ấy 08/09; lý do và thứ thay
       * thế nó ghi ở `policies.service.ts`, chỗ hàm cũ từng nằm.
       */

      /*
       * PHÉP KIỂM "PHẢI CHỌN VĂN BẢN MẪU" ĐÃ GỠ (`0163`).
       *
       * `0098` bắt mọi lượt `SUBMIT` và `RESUBMIT_AFTER_EDIT` kèm `mauHoSoId`,
       * vì bản mềm khi ấy là văn bản đi qua luồng duyệt và phải bất biến. Khách
       * hàng chốt 29/08 rằng nó không phải thế: bản mềm là thao tác IN của Sale
       * Admin ở bước B8, nên người gửi duyệt không có việc gì với văn bản mẫu.
       *
       * Kéo theo: hệ thống KHÔNG CÓ MẪU NÀO vẫn gửi duyệt được — `0150` ghi
       * ngược lại, và câu ấy đúng cho tới hôm nay. Thiếu mẫu giờ chỉ chặn đúng
       * thao tác in của Sale Admin.
       */
      thieuTruongLucGui(cus);

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
      /*
       * `0199` — CÂU NÀY GIỜ MỚI TỚI ĐƯỢC ba nguyên nhân nó kể ra.
       *
       * Tới `0198` `lamMoiDong` gọi lời gọi CẢ LÔ vốn 404 toàn bộ khi một id
       * vắng mặt, nên hai trong ba nguyên nhân — mặt hàng đã bị xoá khỏi danh
       * mục, và mặt hàng chưa khai giá tại ngày áp dụng — ném `404
       * PRODUCT_NOT_FOUND` TRƯỚC khi `hong` kịp có phần tử nào. Chốt chặn viết
       * đúng, nêu đích danh mã sản phẩm, và không bao giờ chạy tới; người lập
       * nhận một câu không nói dòng nào hỏng. Nay cả ba đều rơi vào `hong`.
       */
      /*
       * KHÔNG truyền `rutHangVoHieu` (`0200`), và đó là một quyết định.
       *
       * Nút *Tự động cập nhật* rút mặt hàng đã vô hiệu hoá ra khỏi hồ sơ; ở đây
       * thì không. Lượt gửi duyệt là lúc hồ sơ RỜI TAY người lập, và một mặt
       * hàng biến mất khỏi văn bản ở đúng khoảnh khắc ấy — không ai bấm gì,
       * không màn hình nào nói gì — là thứ chỉ phát hiện ra khi người duyệt đọc
       * một bảng thiếu dòng. `STALE_LINE` nêu tên mặt hàng và để chính người lập
       * quyết định, đúng như trước.
       */
      const { hong } = await this.db.tx((c) => this.policies.lamMoiDong(c, policyId));
      if (hong.length > 0) {
        throw new UnprocessableEntityException({
          code: 'STALE_LINE',
          products: hong,
          message:
            `Không lấy được giá hoặc ngưỡng hiện hành cho: ${hong.join(', ')}. ` +
            'Mặt hàng có thể đã vô hiệu hoá, đã bị xoá khỏi danh mục, ' +
            'hoặc chưa khai giá tại ngày áp dụng của dòng. ' +
            'Rút mặt hàng đó khỏi hồ sơ hoặc đổi ngày áp dụng rồi gửi lại.',
        });
      }
    }

    if (action === 'SA_HANDOVER') {
      // Cùng một hằng với cờ `banGiaoDuoc` mà màn hình đọc để bật/tắt nút
      // (`0160`) — một câu hỏi thì một câu lệnh, nếu không thì nút và chốt chặn
      // sẽ lệch nhau vào ngày ai đó đổi nghĩa `kind`.
      const scan = await this.db.q<{ co: boolean }>(`SELECT ${SQL_CO_BAN_SCAN} AS co`, [policyId]);
      // Bàn giao bản cứng mà chưa có bản scan là bàn giao thứ không tồn tại (WF-14).
      if (scan[0]?.co !== true) {
        throw new ConflictException({
          code: 'SCAN_REQUIRED',
          message: 'Chưa tải bản scan nên chưa bàn giao được',
        });
      }

      /*
       * VÀ PHẢI CÓ BẢN MỀM ĐÃ LƯU (`0167`).
       *
       * Bàn giao cho Kế toán là bàn giao CẢ HAI bản: bản mềm để họ đọc và đối
       * chiếu, bản cứng đã ký để lưu. Trước `0167` bản mềm dựng lại mỗi lần xem
       * (`0163`), nên hồ sơ bàn giao xong không mang theo tờ giấy nào — Kế toán
       * mở ra thì thấy bản dựng bằng danh mục mẫu HÔM NAY, không phải bản Sale
       * Admin đã in và trình ký.
       *
       * MÃ LỖI RIÊNG, không gộp với `SCAN_REQUIRED`: giao diện phản ứng khác hẳn
       * với hai ca này — thiếu scan thì nút xám (việc ngoài phần mềm), thiếu bản
       * mềm thì mở hộp tạo bản mềm ngay (việc phần mềm làm được). Một mã lỗi
       * chung thì màn hình không biết phải làm gì.
       */
      const mem = await this.db.q<{ co: boolean }>(`SELECT ${SQL_CO_BAN_MEM} AS co`, [policyId]);
      if (mem[0]?.co !== true) {
        throw new ConflictException({
          code: 'BAN_MEM_REQUIRED',
          message: 'Chưa tạo bản mềm nên chưa bàn giao được',
        });
      }
    }

    // Mã và tên khách hàng nhét THẲNG vào sự kiện (`cus` lấy ở đầu hàm).
    //
    // notification không đọc được schema cus, và bắt nó gọi ngược lại customer
    // lúc gửi thư thì một sự kiện chỉ gửi được khi customer đang sống — đúng thứ
    // mẫu outbox sinh ra để tránh. Sự kiện phải TỰ NÓ đủ nghĩa: đọc nó ba tháng
    // sau, khi khách hàng đã đổi tên, vẫn thấy đúng tên tại thời điểm gửi thư.
    const ctx = {
      policyId,
      policyCode: before.code,
      customerId: before.customer_id,
      customerCode: cus.code,
      customerName: cus.name,
      tdvUserId: before.tdv_user_id,
      /*
       * `0190` — LOẠI THAY ĐỔI, trong MỌI sự kiện của luồng duyệt.
       *
       * Khách hàng chốt 08/09: thông báo phải cho biết đây là *lập CSBH mới cho
       * khách chưa có CSBH nào* hay *chỉnh sửa/bổ sung trên CSBH đang hiệu lực*.
       * Hai việc ấy khác nhau ở thứ người duyệt phải làm: bản đầu thì không có
       * gì để đối chiếu, bản thay thế thì phải soi xem nó đổi gì so với bản
       * khách hàng đang được hưởng.
       *
       * Gửi CON SỐ chứ không gửi câu chữ hay một cờ boolean. Câu chữ dựng ở
       * `notification`, nơi đã giữ mọi bảng nhãn của thư; còn con số nói được
       * nhiều hơn một cờ — *"Phiên bản 4"* cho người đọc biết hồ sơ này đã qua
       * ba lần thay thế, thứ một `laBanDau: false` không nói được.
       *
       * Đặt ở `ctx` chứ không ở riêng từng sự kiện: mọi lá thư của luồng duyệt
       * đều cần nó, và thiếu ở một sự kiện là một lá thư im lặng thiếu một dòng
       * — đúng cái bẫy `0031` đã ghi ngay trên cho bốn khoá người.
       */
      versionNo: before.version_no,
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

      /*
       * DÒNG ĐÃ RÚT XOÁ HẲN Ở ĐÂY, và chỉ ở đây (`0186`).
       *
       * Khách hàng chốt *"chỉ xoá hẳn khi hồ sơ sang trạng thái Đang có hiệu
       * lực"*. Lằn ranh ấy đúng chỗ: tới giây này tờ giấy đã ký xong và bản cũ
       * vừa hết hiệu lực ở mấy dòng trên, nên dòng mờ đã làm xong đúng việc của
       * nó — nói cho bốn bàn duyệt biết mặt hàng nào đang bị rút. Giữ nó lại
       * thêm là để một CSBH ĐANG hiệu lực mang những dòng không thuộc về nó, và
       * mọi đường đọc về sau sẽ phải nhớ lọc.
       *
       * Quan trọng hơn: `create` chép nguyên dòng của bản đang hiệu lực sang
       * phiên bản kế tiếp. Không xoá ở đây thì mặt hàng vừa rút **mọc lại** ở
       * bản sau dưới dạng một dòng thừa kế bình thường, và người lập phải rút
       * lại nó mỗi phiên bản, mãi mãi.
       *
       * Cùng transaction với bước chuyển trạng thái: tách ra là có một khoảnh
       * khắc hồ sơ đã hiệu lực mà vẫn còn dòng đã rút, và một lượt đọc rơi vào
       * đó sẽ dựng bản mềm sai.
       *
       * Gác bằng `setsEffectiveFrom` MỘT MÌNH, không kèm `before.supersedes_id`
       * như khối trên: hồ sơ đầu tiên của một khách không có dòng thừa kế nào
       * nên không thể có dòng đã rút, và câu lệnh này chỉ là một lượt xoá rỗng.
       * Buộc thêm điều kiện ấy là gắn phép dọn vào một bất biến ở chỗ khác —
       * đúng loại phụ thuộc ngầm sẽ hỏng lặng lẽ ngày ai đó cho rút một dòng
       * *Bổ sung*.
       */
      if (step.setsEffectiveFrom) {
        await c.query(`DELETE FROM pol.policy_line WHERE policy_id = $1 AND da_xoa`, [policyId]);
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
       * KHỐI GHI `mau_ho_so_id` ĐÃ GỠ (`0163`) — cột ấy không còn trong lược đồ.
       *
       * Chú thích cũ ở đây cảnh báo một chuyện thật: điều kiện phải là HÀNH
       * ĐỘNG chứ không phải *"có gửi `mauHoSoId` không"*, nếu không thì Trưởng
       * bộ phận bấm *Ký số* mà kèm thừa một `mauHoSoId` sẽ ghi đè mẫu người gửi
       * đã chọn. Lo ấy hết nghĩa cùng cái cột.
       */

      /*
       * ĐÓNG BĂNG KHÁCH HÀNG VÀ NGƯỜI ĐỀ NGHỊ (`0101`) — cùng vạch với mẫu.
       *
       * `cus` đã nằm sẵn trong tay từ trước transaction (nó dựng `ctx` cho các
       * sự kiện), nên chỗ này KHÔNG thêm một vòng mạng nào. Tên người lấy từ
       * `me.name` — ảnh chụp danh tính của `0090`: `SUBMIT` do chính TDV bấm nên
       * đó là tên người đề nghị, không cần hỏi identity.
       *
       * `me.name` vắng mặt được (ảnh chụp trong Redis hết hạn giữa chừng). Khi
       * ấy ghi NULL, và bản mềm rơi về đọc sống — cùng nhánh với hồ sơ lập trước
       * `0101`. Thà một trường đọc sống còn hơn một cái tên bịa.
       */
      let khSql = '';
      if (action === 'SUBMIT' || action === 'RESUBMIT_AFTER_EDIT') {
        /*
         * HAI Ô ĐỊA CHỈ ĐĂNG KÝ đi cùng cột gộp (`0177`).
         *
         * Cột gộp `kh_dia_chi_dang_ky_snap` GIỮ: `document` in thẳng chuỗi ấy ra
         * giấy. Hai ô rời thêm vào vì màn hình hồ sơ bày hai ô, và tách ngược
         * chuỗi gộp là suy ngược lên hình dạng của một cột DẪN XUẤT (`0175`) —
         * chạy được hôm nay, hỏng ngầm ngày trigger đổi dấu ngăn.
         *
         * Cả ba chụp trong CÙNG một lượt, từ CÙNG một `cus`: hai ô và chuỗi gộp
         * nói cùng một địa chỉ, nên chụp lệch nhịp là dựng ra một hồ sơ mà màn
         * hình và tờ giấy nói hai địa chỉ khác nhau.
         */
        params.push(
          cus.code,
          cus.name,
          cus.idNumber ?? null,
          cus.registeredAddress ?? null,
          cus.streetWard ?? null,
          cus.province ?? null,
          cus.deliveryAddress ?? null,
          cus.ownerName ?? null,
          cus.ownerTitle ?? null,
          cus.phone ?? null,
          cus.debt ?? null,
          me.name ?? null,
        );
        /*
         * ĐÁNH SỐ LẠI ĐỦ, không bỏ trống chỗ nào để khỏi sửa các số sau.
         *
         * `0154` đã trả giá cho lối tắt ấy: Postgres đếm tham số theo SỐ CAO
         * NHẤT xuất hiện trong câu lệnh, nên một khoảng trống ở giữa làm lệch cả
         * dãy và mọi lượt ghi trả 500.
         */
        const i = params.length - 11;
        khSql =
          `kh_ma_snap = $${i}, kh_ten_snap = $${i + 1}, kh_ma_so_thue_snap = $${i + 2}, ` +
          `kh_dia_chi_dang_ky_snap = $${i + 3}, ` +
          `kh_so_nha_snap = $${i + 4}, kh_tinh_thanh_snap = $${i + 5}, ` +
          `kh_noi_nhan_hang_snap = $${i + 6}, ` +
          `kh_nguoi_dai_dien_snap = $${i + 7}, kh_chuc_danh_dai_dien_snap = $${i + 8}, ` +
          `kh_dien_thoai_snap = $${i + 9}, ` +
          `kh_cong_no_snap = $${i + 10}, nguoi_de_nghi_snap = $${i + 11},`;
      }

      /*
       * CHỮ KÝ: ghi lúc ký, XOÁ khi hồ sơ quay về *Yêu cầu chỉnh sửa* (`0101`).
       *
       * Ba cột `tbp_signed_at` / `tbp_signed_by` / `tbp_ky_ten_snap` nói CÙNG
       * MỘT sự thật — *"có chữ ký nào đang có hiệu lực trên hồ sơ này không"* —
       * nên chúng phải đi cùng nhau. Để `tbp_signed_at` ở lại mà xoá cái tên là
       * dựng ra một hồ sơ "đã ký bởi không ai".
       *
       * Xoá theo TRẠNG THÁI ĐÍCH chứ không liệt kê ba hành động trả về: thêm một
       * nhánh trả về thứ tư về sau mà quên sửa danh sách thì chữ ký cũ sống sót
       * lặng lẽ, và không có gì trên màn hình nói ra.
       *
       * Đây cũng là bản vá cho một lỗ hổng `P0` mở từ P5 — xem đầu tệp
       * `0101_dong_bang_khach_hang_va_nguoi.sql`: `tbp_signed_at` không bao giờ
       * được xoá, nên hồ sơ bị Kế toán trả về sau khi đã ký thì gửi lại xong
       * KHÔNG ký lại được (`ALREADY_SIGNED`), và nằm chết ở *Chờ TBP duyệt*.
       */
      let kySql = '';
      if (action === 'TBP_SIGN') {
        params.push(me.name ?? null);
        /*
         * `da_qua_tbp` bật ở đây và KHÔNG BAO GIỜ tắt (`0142`).
         *
         * Nó đứng cạnh ba cột chữ ký nhưng trả lời một câu NGƯỢC LẠI về thời
         * gian: ba cột kia hỏi *"bây giờ có chữ ký không"* nên phải xoá lúc trả
         * về; cột này hỏi *"đã từng ký chưa"* nên xoá là nói dối.
         *
         * Đừng gom nó vào nhánh `YEU_CAU_CHINH_SUA` bên dưới cho gọn: làm thế là
         * lấy lại quyền đọc của Kế toán với chính những hồ sơ họ đã trả về, và
         * không ca kiểm nào của lượt trả về đỏ lên.
         */
        kySql = `tbp_ky_ten_snap = $${params.length}, da_qua_tbp = true,`;
      } else if (step.next === 'YEU_CAU_CHINH_SUA') {
        kySql = 'tbp_signed_at = NULL, tbp_signed_by = NULL, tbp_ky_ten_snap = NULL,';
      }

      const upd = await c.query<{ id: string }>(
        `UPDATE pol.policy SET
            status = $2::pol.policy_status,
            ${stampSql}${reprintSql}${khSql}${kySql}
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

      /*
       * KHỐI ĐẶT `rejected_at` ĐÃ GỠ (`0155`).
       *
       * `TBP_REJECT` là hành động duy nhất từng ghi hai cột `rejected_at` /
       * `rejected_by`, và hành động ấy không còn. Hai cột thì Ở LẠI trong lược
       * đồ: chúng giữ mốc của những hồ sơ bị từ chối TRƯỚC ngày 29/08, nay mang
       * trạng thái `DA_XOA` — gỡ cột là xoá mất câu trả lời *"hồ sơ này kết thúc
       * lúc nào"* của chính chúng.
       */
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
    before: { sale_admin_user_id: string | null },
    opts: {
      tbpUserId?: string | undefined;
      keToanUserId?: string | undefined;
      saleAdminUserId?: string | undefined;
    },
  ): Promise<Record<string, string>> {
    const can = phanCongCua(action, before);
    if (can.length === 0) return {};

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

  /**
   * Ghi con trỏ tệp vào hồ sơ — và DỌN tệp lại nếu lượt ghi bị từ chối (`0149`).
   *
   * Tải lên là HAI lời gọi từ trình duyệt: `document` nhận file thật, rồi `policy`
   * ghi con trỏ. Không có phép bù trừ nào giữa hai lời gọi ấy, nên mỗi lượt gọi
   * thứ hai bị từ chối để lại một tệp nằm trên kho mà không hồ sơ nào trỏ tới —
   * và những lượt từ chối ấy là chuyện thường: `POLICY_LOCKED` khi hồ sơ đổi
   * trạng thái giữa lúc mở màn hình và lúc chọn xong file, `403` khi sai vai trò.
   *
   * Bù trừ ở MÁY CHỦ chứ không ở giao diện, dù giao diện cũng gọi được
   * `DELETE /files/:id`: máy chủ biết chắc mình vừa từ chối, còn trình duyệt thì
   * có thể đã đóng. Đường này phủ nhiều hơn hẳn, và KHÔNG phủ hết — mất mạng
   * đúng giữa hai lời gọi thì vẫn còn một tệp mồ côi, và không có chỗ nào biết
   * để mà dọn.
   */
  async attach(
    policyId: string,
    input: { kind: LoaiTep; fileName: string; objectKey: string; sizeBytes: bigint },
    me: AuthUser,
  ) {
    try {
      return await this.attachNoiBo(policyId, input, me);
    } catch (e) {
      // Tệp vừa tải lên giờ không thuộc về hồ sơ nào — gỡ nó rồi mới ném lỗi
      // thật ra ngoài. `goBoTep` tự nuốt lỗi của chính nó, nên lỗi người dùng
      // nhận vẫn là lỗi gốc chứ không bị một lỗi dọn dẹp che mất.
      await this.clients.goBoTep(input.objectKey, 'hồ sơ từ chối đính kèm');
      throw e;
    }
  }

  private async attachNoiBo(
    policyId: string,
    input: { kind: LoaiTep; fileName: string; objectKey: string; sizeBytes: bigint },
    me: AuthUser,
  ) {
    const p = await this.db.one<{
      status: Status;
      tdv_user_id: string | null;
      tbp_user_id: string | null;
      ke_toan_user_id: string | null;
      sale_admin_user_id: string | null;
      da_qua_tbp: boolean;
    }>(
      // `da_qua_tbp` đi kèm vì `assertPolicyInScope` đọc nó (`0142`). Câu này
      // LIỆT KÊ TỪNG CỘT, nên thêm một trường vào luật phạm vi là phải rà cả nó
      // — đúng bẫy `0128`, và `0143` đã bắt nó bằng cách khai trường ấy BẮT BUỘC.
      `SELECT status, tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id,
              da_qua_tbp
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
      da_qua_tbp: boolean;
    }>(
      // `da_qua_tbp` đi kèm vì `assertPolicyInScope` đọc nó (`0142`). Câu này
      // LIỆT KÊ TỪNG CỘT, nên thêm một trường vào luật phạm vi là phải rà cả nó
      // — đúng bẫy `0128`, và `0143` đã bắt nó bằng cách khai trường ấy BẮT BUỘC.
      `SELECT status, tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id,
              da_qua_tbp
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
    const t = await this.db.one<{ kind: LoaiTep; object_key: string }>(
      // `object_key` đi kèm từ `0149`: lượt gỡ giờ xoá cả tệp trên kho, và khoá
      // kho là thứ duy nhất `document` nhận diện tệp theo.
      `SELECT kind::text AS kind, object_key
         FROM pol.policy_attachment WHERE id = $1 AND policy_id = $2`,
      [attachmentId, policyId],
    );
    if (!t) throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND' });
    this.assertNguoiGhiTep(t.kind, me);

    await this.db.q(`DELETE FROM pol.policy_attachment WHERE id = $1 AND policy_id = $2`, [
      attachmentId,
      policyId,
    ]);

    /*
     * GỠ HẲN TỆP KHỎI KHO (`0149`).
     *
     * Bản trước chỉ xoá con trỏ, và chú thích tại chỗ nêu lý do: `DELETE /files/:id`
     * chỉ mở cho TDV và Sale Admin, nên gọi nó ở đây sẽ chặn Kế toán gỡ tệp.
     *
     * Lý do ấy ĐÃ CŨ. Từ `0069`, `assertNguoiGhiTep` ngay trên đây chặn Kế toán
     * gỡ bất kỳ loại tệp nào: `HO_SO` chỉ TDV, `SCAN` chỉ Sale Admin — đúng hai
     * vai trò trong danh sách được xoá tệp. Câu chú thích kia tả thế giới TRƯỚC
     * `0069` và thành sai ngay chặng sau đó; không ai đọc lại nó.
     *
     * Hệ quả của việc không đọc lại: kho chỉ lớn lên, và không một thao tác nào
     * của người dùng xoá được một byte. Từ `0148` còn nặng hơn — giấy tờ đã gỡ
     * QUAY LẠI ở phiên bản CSBH mới, vì lượt chép đọc bảng của `document` chứ
     * không đọc bảng con trỏ. `0149` sửa cả hai đầu.
     *
     * SAU transaction và NUỐT lỗi — xem `goBoTep`: việc người dùng yêu cầu đã
     * xong, và đường lùi khi hỏng đúng bằng hành vi cũ.
     */
    await this.clients.goBoTep(t.object_key, `gỡ khỏi hồ sơ bởi ${me.role}`);
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
  private assertNguoiGhiTep(kind: LoaiTep, me: AuthUser): void {
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
