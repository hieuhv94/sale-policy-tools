/**
 * Máy trạng thái hồ sơ CSBH — YCNV §3 và §4.
 *
 * Toàn bộ luật chuyển bước nằm ở MỘT bảng dưới đây, không rải if/else khắp
 * controller. Mọi hành động không có trong bảng đều bị từ chối kèm danh sách
 * hành động được phép, đúng yêu cầu của WF-23.
 */

/*
 * `TBP_DA_KY_SO` ĐÃ BỊ GỠ ở `0064`, cùng với hành động `PUBLISH_SIGNED`.
 *
 * Nó chưa bao giờ là một trạng thái người dùng nhìn thấy: `TBP_SIGN` đặt nó rồi
 * `PUBLISH_SIGNED` chuyển tiếp sang `CHO_KT_L1` ngay trong CÙNG transaction, nên
 * không lời đọc nào ngoài transaction ấy từng thấy một hồ sơ đang ở đó.
 *
 * Cái giá của nó thì có thật: hai lần chuyển bước là hai sự kiện, và cả hai đều
 * gửi thư cho Kế toán. Mỗi lần Trưởng bộ phận ký, kế toán nhận HAI lá thư trong
 * cùng một giây — "Trưởng bộ phận đã ký số" và "Hồ sơ đã ký số, chuyển sang Kế
 * toán tiếp nhận". Khách hàng chỉ ra chỗ này ngày 19/08.
 *
 * Giờ `CHO_TBP_DUYET --TBP_SIGN--> CHO_KT_L1` là MỘT nước. Mốc `tbp_signed_at`
 * và `tbp_signed_by` vẫn được ghi y như cũ, nên dải "ai đã duyệt" không đổi.
 *
 * GIÁ TRỊ ENUM TRONG CSDL CŨNG ĐÃ GỠ, ở migration `0048`.
 *
 * `0064` để nó lại vì Postgres không có `ALTER TYPE ... DROP VALUE`, và
 * `pol.policy_event` có thể còn dòng lịch sử ghi nó. Khách hàng chốt ngày 19/08
 * là xoá luôn: phần mềm chưa chạy thật, dữ liệu duy nhất đang có là của
 * `make demo-mau`, nên cái giá của việc dựng lại dữ liệu mẫu rẻ hơn cái giá của
 * việc mang mãi một giá trị không ai dùng nữa.
 *
 * `0048` đổi tên kiểu cũ, dựng kiểu mới 11 giá trị, chuyển ba cột sang bằng mệnh
 * đề `USING` ánh xạ `TBP_DA_KY_SO -> CHO_KT_L1`, rồi bỏ kiểu cũ. Nhãn tiếng Việt
 * bên `format.ts` và `templates.ts` cũng đã gỡ theo — không còn dòng dữ liệu nào
 * mang giá trị ấy để mà cần đọc.
 */
export const STATUSES = [
  'NHAP', 'CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY',
  'CHO_KT_L2', 'DANG_CO_HIEU_LUC', 'HET_HIEU_LUC', 'YEU_CAU_CHINH_SUA',
  'TU_CHOI', 'QUA_HAN_DUYET', 'DA_XOA',
] as const;
export type Status = (typeof STATUSES)[number];

export const ACTIONS = [
  'SUBMIT', 'TBP_SIGN', 'TBP_RETURN', 'TBP_REJECT',
  'KT_RECEIVE_L1', 'KT_RETURN_L1', 'SA_HANDOVER', 'KT_RECEIVE_L2',
  'KT_RETURN_L2', 'KT_REQUEST_REPRINT', 'RESUBMIT_AFTER_EDIT', 'SUPERSEDE',
] as const;
export type Action = (typeof ACTIONS)[number];

export type Role = 'TDV' | 'TBP' | 'KE_TOAN' | 'SALE_ADMIN' | 'BAN_LANH_DAO' | 'QUAN_TRI' | 'SYSTEM';

export interface Rule {
  from: Status;
  to: Status;
  /** Ai được phép. Ban lãnh đạo và Quản trị không xuất hiện ở bất kỳ luật nào. */
  by: Role;
  /** Cột mốc thời gian phải ghi trên hồ sơ (§10 — mốc là cột riêng). */
  stamp?: string;
  /** Trả lại thì bắt buộc nhập lý do (§3). */
  requiresReason?: boolean;
  /** Mọi lần trả lại đều tạo phiên bản mới và đi lại toàn bộ vòng duyệt (§3). */
  createsNewVersion?: boolean;
}

const RULES: readonly Rule[] = [
  { from: 'NHAP',             to: 'CHO_TBP_DUYET',    by: 'TDV',        stamp: 'submitted' },
  { from: 'YEU_CAU_CHINH_SUA', to: 'CHO_TBP_DUYET',   by: 'TDV',        stamp: 'submitted' },
  // MỘT nước, không hai (`0064`) — xem khối ghi chú ở đầu tệp.
  { from: 'CHO_TBP_DUYET',    to: 'CHO_KT_L1',        by: 'TBP',        stamp: 'tbp_signed' },
  { from: 'CHO_TBP_DUYET',    to: 'YEU_CAU_CHINH_SUA', by: 'TBP',       stamp: 'returned',
    requiresReason: true, createsNewVersion: true },
  { from: 'CHO_TBP_DUYET',    to: 'TU_CHOI',          by: 'TBP',        requiresReason: true },
  { from: 'CHO_KT_L1',        to: 'SA_DANG_XU_LY',    by: 'KE_TOAN',    stamp: 'kt_l1_received' },
  { from: 'CHO_KT_L1',        to: 'YEU_CAU_CHINH_SUA', by: 'KE_TOAN',   stamp: 'returned',
    requiresReason: true, createsNewVersion: true },
  { from: 'SA_DANG_XU_LY',    to: 'CHO_KT_L2',        by: 'SALE_ADMIN', stamp: 'sa_handover' },
  { from: 'CHO_KT_L2',        to: 'DANG_CO_HIEU_LUC', by: 'KE_TOAN',    stamp: 'kt_l2_received' },
  { from: 'CHO_KT_L2',        to: 'YEU_CAU_CHINH_SUA', by: 'KE_TOAN',   stamp: 'returned',
    requiresReason: true, createsNewVersion: true },
  // Ngoại lệ duy nhất: quay về Sale Admin mà KHÔNG phải ký lại (§3 B10C).
  { from: 'CHO_KT_L2',        to: 'SA_DANG_XU_LY',    by: 'KE_TOAN',    requiresReason: true },
  { from: 'DANG_CO_HIEU_LUC', to: 'HET_HIEU_LUC',     by: 'SYSTEM' },
];

const ACTION_OF: Record<Action, { from: Status[]; to: Status }> = {
  SUBMIT:              { from: ['NHAP'],              to: 'CHO_TBP_DUYET' },
  RESUBMIT_AFTER_EDIT: { from: ['YEU_CAU_CHINH_SUA'], to: 'CHO_TBP_DUYET' },
  TBP_SIGN:            { from: ['CHO_TBP_DUYET'],     to: 'CHO_KT_L1' },
  TBP_RETURN:          { from: ['CHO_TBP_DUYET'],     to: 'YEU_CAU_CHINH_SUA' },
  TBP_REJECT:          { from: ['CHO_TBP_DUYET'],     to: 'TU_CHOI' },
  KT_RECEIVE_L1:       { from: ['CHO_KT_L1'],         to: 'SA_DANG_XU_LY' },
  KT_RETURN_L1:        { from: ['CHO_KT_L1'],         to: 'YEU_CAU_CHINH_SUA' },
  SA_HANDOVER:         { from: ['SA_DANG_XU_LY'],     to: 'CHO_KT_L2' },
  KT_RECEIVE_L2:       { from: ['CHO_KT_L2'],         to: 'DANG_CO_HIEU_LUC' },
  KT_RETURN_L2:        { from: ['CHO_KT_L2'],         to: 'YEU_CAU_CHINH_SUA' },
  KT_REQUEST_REPRINT:  { from: ['CHO_KT_L2'],         to: 'SA_DANG_XU_LY' },
  SUPERSEDE:           { from: ['DANG_CO_HIEU_LUC'],  to: 'HET_HIEU_LUC' },
};

/**
 * Trạng thái kết thúc: không có hành động nào đi ra được.
 *
 * `DA_XOA` vào đây từ `0035` — người lập tự bỏ hồ sơ đã từng vào luồng. Nó
 * KHÔNG có luật nào trong `RULES`, và đó là chủ ý: đường tới nó là
 * `DELETE /policies/:id`, không phải một hành động trong dải nút *Thao tác*.
 * Thêm luật ở đây sẽ làm `allowedActions('YEU_CAU_CHINH_SUA')` mọc thêm một
 * nút xoá đứng ngay cạnh "Gửi lại duyệt".
 *
 * `QUA_HAN_DUYET` vào đây từ `0047`, và đó là một ĐẢO CHIỀU: trước đó nó là lớp
 * phủ tạm thời, người phụ trách xử lý muộn thì hồ sơ đi tiếp đúng nhánh cũ
 * (YCNV mục 4, NTF-11). Khách hàng đổi ý ngày 18/08 — quá hạn là chết, và sau 3
 * ngày sla-worker tự chuyển sang `DA_XOA`.
 *
 * "Kết thúc" ở đây nghĩa là **không người nào thao tác được nữa**. Hệ thống vẫn
 * đi tiếp một nước cuối, y như `DANG_CO_HIEU_LUC` vẫn tự sang `HET_HIEU_LUC`.
 */
export const TERMINAL: readonly Status[] = ['TU_CHOI', 'DA_XOA', 'QUA_HAN_DUYET'];

/** Bốn trạng thái chờ có SLA 14 ngày (§9.1). */
export const WAITING: readonly Status[] = [
  'CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY', 'CHO_KT_L2',
];

/**
 * Hồ sơ còn SỬA ĐƯỢC — hai trạng thái, và đó là cùng một quãng thời gian mà
 * TDV còn chọn được văn bản mẫu (`0098`).
 *
 * Kéo lên đây vì tới `0097` danh sách này được gõ lại ở bốn chỗ trong `policy`,
 * và từ `0098` thì `document` cũng cần đúng nó để biết khi nào ô chọn mẫu còn
 * mở. Năm bản chép của một luật là năm chỗ để chúng lệch nhau, mà lệch ở đây
 * nghĩa là một hồ sơ sửa được nhưng không chọn được mẫu, hoặc ngược lại.
 */
export const SUA_DUOC: readonly Status[] = ['NHAP', 'YEU_CAU_CHINH_SUA'];

export const STEPS = [
  'B3_GUI_DUYET', 'B4_TBP_DUYET', 'B6_KT_L1', 'B8_SA_XU_LY', 'B10_KT_L2',
] as const;
export type Step = (typeof STEPS)[number];

/** Trạng thái chờ ↔ tên bước trong bảng mười bước (§3). */
export const STEP_OF_STATUS: Partial<Record<Status, Step>> = {
  CHO_TBP_DUYET: 'B4_TBP_DUYET',
  CHO_KT_L1:     'B6_KT_L1',
  SA_DANG_XU_LY: 'B8_SA_XU_LY',
  CHO_KT_L2:     'B10_KT_L2',
};

export const STATUS_OF_STEP: Record<Step, Status> = {
  B3_GUI_DUYET:  'YEU_CAU_CHINH_SUA',
  B4_TBP_DUYET:  'CHO_TBP_DUYET',
  B6_KT_L1:      'CHO_KT_L1',
  B8_SA_XU_LY:   'SA_DANG_XU_LY',
  B10_KT_L2:     'CHO_KT_L2',
};

/*
 * `effectiveStatus()` ĐÃ BỊ XOÁ ở `0047`, và chỗ trống này để lại có chủ ý.
 *
 * Hàm ấy gỡ nhãn `QUA_HAN_DUYET` ra để lấy trạng thái chờ nằm dưới, cho phép
 * người phụ trách xử lý muộn và hồ sơ đi tiếp đúng nhánh cũ. Từ `0047` quá hạn
 * là trạng thái chết: không gỡ nhãn nữa, không ai thao tác nữa.
 *
 * Ghi lại đây thay vì xoá im lặng, vì hàm cũ trông rất hợp lý và người đọc mã
 * sau này rất dễ viết lại nó. Viết lại là mở lại đúng cái đường mà `0047` đóng.
 * `resumeFromOverdue()` bị xoá cùng lý do.
 *
 * `STATUS_OF_STEP` thì GIỮ: `pending_step` vẫn phải đọc ra được tên bước để nói
 * "hồ sơ chết ở đâu" trong thư báo và trong nhật ký.
 */

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION';
  constructor(readonly current: Status, readonly action: Action, readonly allowed: Action[]) {
    super(
      `Khong the thuc hien "${action}" khi ho so dang o "${current}". ` +
        `Hanh dong duoc phep: ${allowed.length ? allowed.join(', ') : 'khong co'}`,
    );
    this.name = 'InvalidTransitionError';
  }
}

export class ReasonRequiredError extends Error {
  readonly code = 'REASON_REQUIRED';
  constructor(action: Action) {
    super(`Hanh dong "${action}" bat buoc phai nhap ly do`);
    this.name = 'ReasonRequiredError';
  }
}

export class ForbiddenRoleError extends Error {
  readonly code = 'FORBIDDEN_ROLE';
  constructor(role: Role, action: Action) {
    super(`Vai tro "${role}" khong duoc phep thuc hien "${action}"`);
    this.name = 'ForbiddenRoleError';
  }
}

/**
 * Hành động hợp lệ tại một trạng thái, KHÔNG xét vai trò.
 *
 * Dùng cho THÔNG BÁO LỖI `INVALID_TRANSITION`: câu đó nói về trạng thái — "ở
 * đây chỉ đi tiếp được bằng X hoặc Y" — nên nó phải liệt kê đủ, kể cả hành động
 * của vai trò khác. Người đọc cần biết hồ sơ đang chờ ai.
 *
 * ĐỪNG dùng để dựng nút bấm: xem `allowedActionsFor`.
 */
export function allowedActions(current: Status): Action[] {
  return (Object.keys(ACTION_OF) as Action[]).filter((a) =>
    ACTION_OF[a].from.includes(current),
  );
}

/**
 * Hành động một VAI TRÒ CỤ THỂ làm được tại một trạng thái — danh sách dựng nút.
 *
 * Vì sao phải có hàm này: `allowedActions` chỉ lọc theo trạng thái, và giao diện
 * đem thẳng kết quả ấy ra vẽ nút. Hệ quả là ba nhóm nút chắc chắn hỏng khi bấm:
 *
 *   1. **Nút của vai trò khác.** Trình dược viên mở hồ sơ của chính mình đang ở
 *      *Chờ TBP duyệt* thì thấy đủ "Ký số duyệt", "Trả lại chỉnh sửa", "Từ chối
 *      hồ sơ" — cả ba đều trả 403 `FORBIDDEN_ROLE`.
 *   2. **Nút của HỆ THỐNG.** `SUPERSEDE` do máy chạy, không ai bấm; nó vẫn hiện
 *      ra, và vì không có nhãn tiếng Việt nên hiện nguyên mã viết hoa.
 *      (`PUBLISH_SIGNED` từng đứng cùng nhóm này, đã gỡ ở `0064`.)
 *   3. **Nút cho vai trò ngoài luồng.** Ban lãnh đạo chỉ đọc (muc 2.6) mà vẫn
 *      thấy nguyên dải nút của bước hiện tại.
 *
 * Suy thẳng từ `RULES` chứ không khai thêm một bảng vai trò thứ hai — bảng ấy sẽ
 * có ngày lệch với chính máy trạng thái, và lệch về phía "thừa" thì lại đúng
 * kiểu lỗi này.
 */
export function allowedActionsFor(current: Status, role: Role): Action[] {
  return allowedActions(current).filter((a) =>
    RULES.some((r) => r.from === current && r.to === ACTION_OF[a].to && r.by === role),
  );
}

export interface TransitionInput {
  current: Status;
  action: Action;
  role: Role;
  reason?: string | undefined;
}

export interface TransitionResult {
  next: Status;
  stamp: string | undefined;
  createsNewVersion: boolean;
  /** Hiệu lực tính NGAY tại thời điểm tiếp nhận L2 (§5.3). */
  setsEffectiveFrom: boolean;
}

export function transition(input: TransitionInput): TransitionResult {
  const { current, action, role, reason } = input;

  const spec = ACTION_OF[action];
  if (!spec || !spec.from.includes(current)) {
    throw new InvalidTransitionError(current, action, allowedActions(current));
  }

  const rule = RULES.find((r) => r.from === current && r.to === spec.to && r.by === role);
  if (!rule) {
    // Chuyển bước đúng nhưng sai vai trò.
    const anyRule = RULES.find((r) => r.from === current && r.to === spec.to);
    if (anyRule) throw new ForbiddenRoleError(role, action);
    throw new InvalidTransitionError(current, action, allowedActions(current));
  }

  if (rule.requiresReason && !reason?.trim()) throw new ReasonRequiredError(action);

  return {
    next: rule.to,
    stamp: rule.stamp,
    createsNewVersion: rule.createsNewVersion === true,
    setsEffectiveFrom: rule.to === 'DANG_CO_HIEU_LUC',
  };
}

/** Quá hạn là LỚP PHỦ lên trạng thái chờ, phải nhớ bước đang chờ để đi tiếp đúng nhánh (§4). */
export function markOverdue(current: Status): { next: Status; pendingStep: Status } {
  if (!WAITING.includes(current)) {
    throw new InvalidTransitionError(current, 'SUBMIT', allowedActions(current));
  }
  return { next: 'QUA_HAN_DUYET', pendingStep: current };
}

