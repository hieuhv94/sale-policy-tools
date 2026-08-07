/**
 * Nội dung thư. Mỗi bước một tiêu đề, thân thư dùng chung một khung.
 *
 * Sáu trường bắt buộc có mặt trong MỌI thư nghiệp vụ (NTF-02): mã khách hàng,
 * tên khách hàng, trạng thái, tên bước đang duyệt, thời điểm, và liên kết mở hồ
 * sơ — cộng lý do khi bước đó là trả lại hay từ chối. Dựng khung chung thay vì
 * viết tay từng mẫu là để không có mẫu nào lỡ thiếu một trường.
 */

/** Nhãn trạng thái đúng như YCNV muc 4 — người nhận thư đọc thấy chữ giống trên màn hình. */
export const STATUS_LABEL: Record<string, string> = {
  NHAP: 'Nháp',
  CHO_TBP_DUYET: 'Chờ Trưởng bộ phận duyệt',
  TBP_DA_KY_SO: 'Trưởng bộ phận đã ký số',
  CHO_KT_L1: 'Chờ Kế toán tiếp nhận lần 1',
  SA_DANG_XU_LY: 'Sale Admin đang xử lý',
  CHO_KT_L2: 'Chờ Kế toán tiếp nhận lần 2',
  DANG_CO_HIEU_LUC: 'Đang có hiệu lực',
  HET_HIEU_LUC: 'Hết hiệu lực',
  YEU_CAU_CHINH_SUA: 'Yêu cầu chỉnh sửa',
  TU_CHOI: 'Từ chối',
  QUA_HAN_DUYET: 'Quá hạn duyệt',
};

/** Tên bước đang chờ xử lý, theo đúng mười bước ở muc 3. */
export const STEP_LABEL: Record<string, string> = {
  CHO_TBP_DUYET: 'Bước 4 — Trưởng bộ phận duyệt và ký số',
  CHO_KT_L1: 'Bước 6 — Kế toán tiếp nhận lần 1',
  SA_DANG_XU_LY: 'Bước 8 — Sale Admin xử lý và bàn giao bản cứng',
  CHO_KT_L2: 'Bước 10 — Kế toán tiếp nhận lần 2',
  YEU_CAU_CHINH_SUA: 'Bước 3 — Trình dược viên chỉnh sửa và gửi lại',
  DANG_CO_HIEU_LUC: 'Đã hoàn tất — không còn bước nào phải xử lý',
  TU_CHOI: 'Đã kết thúc — hồ sơ bị từ chối',
  QUA_HAN_DUYET: 'Quá hạn — vẫn chờ đúng bước cũ',
};

const TITLE: Record<string, string> = {
  SUBMIT: 'Hồ sơ CSBH mới chờ duyệt',
  RESUBMIT_AFTER_EDIT: 'Hồ sơ đã chỉnh sửa, chờ duyệt lại',
  TBP_SIGN: 'Trưởng bộ phận đã ký số',
  PUBLISH_SIGNED: 'Hồ sơ đã ký số, chuyển sang Kế toán tiếp nhận',
  TBP_RETURN: 'Hồ sơ bị trả lại để chỉnh sửa',
  TBP_REJECT: 'Hồ sơ bị từ chối',
  KT_RECEIVE_L1: 'Kế toán đã tiếp nhận lần 1',
  KT_RETURN_L1: 'Kế toán không tiếp nhận lần 1',
  SA_HANDOVER: 'Sale Admin đã bàn giao bản cứng',
  KT_RECEIVE_L2: 'Kế toán đã tiếp nhận lần 2 — CSBH bắt đầu có hiệu lực',
  KT_RETURN_L2: 'Kế toán không tiếp nhận lần 2',
  KT_REQUEST_REPRINT: 'Kế toán yêu cầu in lại bản cứng',
  PRICE_IMPACT: 'Giá sản phẩm trong CSBH đang hiệu lực đã thay đổi',
  SLA_REMINDER: 'Nhắc: hồ sơ sắp quá hạn duyệt',
  SLA_OVERDUE: 'Hồ sơ đã quá hạn duyệt',
};

// `| undefined` viết ra tường minh: tsconfig bật exactOptionalPropertyTypes nên
// "vắng mặt" và "có mặt với giá trị undefined" là hai chuyện khác nhau, và dữ
// liệu ở đây đến từ JSON nên luôn rơi vào vế thứ hai.
export type MailEvent = {
  eventId: string;
  routingKey: string;
  action?: string | undefined;
  policyId?: string | undefined;
  policyCode?: string | undefined;
  customerId?: string | undefined;
  customerCode?: string | undefined;
  customerName?: string | undefined;
  toStatus?: string | undefined;
  pendingStep?: string | undefined;
  reason?: string | null | undefined;
  at?: string | undefined;
  extra?: Record<string, string> | undefined;
};

/**
 * Giờ Việt Nam trong thân thư. Dấu thời gian trong CSDL vẫn là UTC — chỉ CÁCH
 * ĐỌC là đổi. Người nhận thư lúc 6 giờ sáng mà thấy ghi 23 giờ hôm trước thì
 * không tin được thông báo nào nữa (OPS-09).
 */
export function formatIct(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const p = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

export const titleFor = (e: MailEvent): string =>
  TITLE[e.action ?? ''] ?? 'Cập nhật hồ sơ Chính sách bán hàng';

/** Tiêu đề mang tên khách hàng để người nhận nhận ra hồ sơ ngay ở danh sách thư. */
export const subjectFor = (e: MailEvent): string =>
  `[CSBH] ${titleFor(e)} — ${e.customerName ?? 'Khách hàng'}`;

export function bodyFor(e: MailEvent, webBaseUrl: string): string {
  const link = e.policyId ? `${webBaseUrl}/policies/${e.policyId}` : webBaseUrl;
  const status = STATUS_LABEL[e.toStatus ?? ''] ?? e.toStatus ?? '—';
  const step = STEP_LABEL[e.pendingStep ?? e.toStatus ?? ''] ?? 'Không còn bước nào phải xử lý';

  const lines = [
    titleFor(e),
    '',
    `Mã khách hàng:   ${e.customerCode ?? '—'}`,
    `Tên khách hàng:  ${e.customerName ?? '—'}`,
    `Mã hồ sơ CSBH:   ${e.policyCode ?? '—'}`,
    `Trạng thái:      ${status}`,
    `Bước đang duyệt: ${step}`,
    `Thời điểm:       ${formatIct(e.at)}`,
  ];

  // Lý do chỉ có mặt khi thật sự có — dòng "Lý do: —" trong thư báo ký số thành
  // công làm người đọc tưởng có chuyện.
  if (e.reason) lines.push(`Lý do:           ${e.reason}`);
  for (const [k, v] of Object.entries(e.extra ?? {})) lines.push(`${k}: ${v}`);

  lines.push('', `Mở hồ sơ: ${link}`, '', 'Thư tự động từ phần mềm Chính sách bán hàng Nutricare.');
  return lines.join('\n');
}
