/**
 * Bản CSBH khổ A4 — dựng HTML, và CHỈ dựng HTML.
 *
 * Yêu cầu muc 11.1 là "file tải về phải khớp đúng bản đang xem trên màn hình".
 * Cách duy nhất bảo đảm điều đó mà không phải so hai bản bằng mắt là **bản xem
 * và bản PDF dùng chung một HTML**, chỉ khác một lớp định kiểu khổ giấy. Nên
 * hàm này là nguồn duy nhất; `GET ...?format=html` trả thẳng nó ra, còn PDF là
 * chính nó đi qua Chromium.
 *
 * Hệ quả: PDF **không** chứa menu, thanh điều hướng hay nút thao tác — không
 * phải vì có bước lọc chúng đi, mà vì bố cục này chưa bao giờ có chúng (DOC-02).
 */
import type { CustomerFull, PolicyFull, PolicyLine } from '../infra/clients.js';

export type Signature = {
  signerName: string;
  signerRole: string;
  signedAt: string;
};

export type SheetInput = {
  policy: PolicyFull;
  customer: CustomerFull;
  /** Họ tên theo vai trò, lấy từ identity: TDV lập hồ sơ, TBP duyệt, kế toán phụ trách. */
  people: Record<string, string>;
  signature?: Signature | undefined;
  size: 'a4p' | 'a4l';
};

const STATUS_LABEL: Record<string, string> = {
  NHAP: 'Nháp',
  CHO_TBP_DUYET: 'Chờ Trưởng bộ phận duyệt',
  CHO_KT_L1: 'KT duyệt bản mềm',
  SA_DANG_XU_LY: 'Sale Admin đang xử lý',
  CHO_KT_L2: 'KT duyệt bản cứng',
  DANG_CO_HIEU_LUC: 'Đang có hiệu lực',
  HET_HIEU_LUC: 'Hết hiệu lực',
  YEU_CAU_CHINH_SUA: 'Yêu cầu chỉnh sửa',
  TU_CHOI: 'Từ chối',
  QUA_HAN_DUYET: 'Quá hạn duyệt',
  DA_XOA: 'Đã xoá',
};

export const COMPANY = {
  name: 'CÔNG TY TNHH DƯỢC PHẨM NUTRICARE',
  address: 'Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội',
  taxCode: '0102345678',
} as const;

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Tiền: dấu phân nhóm nghìn kiểu Việt Nam. Số nguyên đồng, không phần thập phân. */
export const money = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '—' : BigInt(v).toLocaleString('vi-VN');

export const dmy = (v: string | null | undefined): string => {
  if (!v) return '—';
  const p = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(v));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')}`;
};

export const dmyHm = (v: string | null | undefined): string => {
  if (!v) return '—';
  const p = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(v));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
};

/** Tỷ lệ: đúng HAI chữ số thập phân, khớp từng ký tự con số trên màn hình (CALC-09). */
export const pct = (v: string | null | undefined): string =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}%`;

/**
 * Số cột CPBH của cả bảng = dòng NHIỀU KHOẢN NHẤT.
 *
 * Mỗi dòng có số khoản chi phí riêng, nhưng một bảng in ra giấy phải có số cột
 * đều nhau — cột so le thì không đọc theo hàng dọc được, và người ký không đối
 * chiếu nổi. Dòng ít khoản hơn để ô TRỐNG, không điền số 0: số 0 là một con số
 * có nghĩa ("khoản này bằng không"), còn ô trống nói đúng điều cần nói là dòng
 * ấy không có khoản thứ mấy đó.
 *
 * Không dòng nào có khoản nào thì bảng không có cột CPBH — thay vì bốn cột số 0
 * như bản trước 0021.
 */
export const soCotCpbh = (lines: readonly PolicyLine[]): number =>
  lines.reduce((max, l) => Math.max(max, l.cpbh?.length ?? 0), 0);

const lineRow = (soCot: number) => (l: PolicyLine, i: number): string => `
  <tr class="${l.over_threshold ? 'over' : ''}">
    <td class="n">${i + 1}</td>
    <td>${esc(l.product_code_snap)}</td>
    <td>${esc(l.product_name_snap)}</td>
    <td class="r">${money(l.company_price)}</td>
    <td class="r">${money(l.wholesale_price)}</td>
    ${Array.from({ length: soCot }, (_, k) =>
      `<td class="r">${l.cpbh?.[k] === undefined ? '' : money(l.cpbh[k])}</td>`,
    ).join('')}
    <td class="r">${money(l.net_price)}</td>
    <td class="r">${pct(l.discount_rate)}</td>
    <td class="r">${pct(l.threshold_snap)}</td>
    <td class="gc">${esc(l.note ?? '')}</td>
  </tr>`;

export function sheetHtml(inp: SheetInput): string {
  const { policy: p, customer: c, people, signature: sig } = inp;
  const landscape = inp.size === 'a4l';

  const attachments =
    p.attachments.length === 0
      ? '<i>Không có file đính kèm</i>'
      : p.attachments.map((a) => `${esc(a.file_name)} <span class="k">(${a.kind})</span>`).join('<br>');

  return `<meta charset="utf-8">
<title>Chính sách bán hàng ${esc(p.code)}</title>
<style>
  /* Khổ giấy khai bằng CSS và Chromium được yêu cầu TÔN TRỌNG nó
     (preferCssPageSize). Đặt kích thước ở phía Gotenberg là có hai nguồn sự thật
     về khổ giấy, và chúng sẽ lệch nhau vào ngày ai đó sửa một bên. */
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  body { font: 10pt/1.45 "DejaVu Sans", "Liberation Sans", Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 2mm; text-transform: uppercase; }
  .sub { text-align: center; margin-bottom: 5mm; font-size: 9pt; }
  .co { text-align: center; margin-bottom: 4mm; }
  .co b { font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; }
  .kv td { padding: 1mm 2mm; vertical-align: top; }
  .kv td.k { width: 32mm; color: #555; }
  .lines { margin-top: 4mm; font-size: 8.5pt; }
  .lines th, .lines td { border: 0.3mm solid #999; padding: 1mm 1.5mm; }
  .lines th { background: #eee; }
  .lines td.r { text-align: right; }
  .lines td.n { text-align: center; }
  /* Ghi chú là cột chữ DUY NHẤT ở nửa phải của bảng số. Cho nó xuống dòng —
     nowrap như các cột tiền sẽ đẩy vỡ bề ngang trang giấy ngay ở ghi chú đầu
     tiên dài hơn một cụm từ. */
  .lines td.gc { white-space: pre-wrap; word-break: break-word; max-width: 45mm; }
  /* Dòng tiêu đề LẶP LẠI ở mỗi trang, và không dòng nào bị cắt đôi qua trang.
     Với hồ sơ 200 dòng thì đây là khác biệt giữa đọc được và không (DOC-19). */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .over td { background: #ffecec; font-weight: 600; }
  .sign { margin-top: 8mm; display: flex; justify-content: flex-end; }
  .sign .box { border: 0.3mm dashed #667; padding: 3mm 6mm; text-align: center; }
  .sign .mark { font-size: 12pt; font-weight: 700; }
  .foot { margin-top: 6mm; font-size: 8pt; color: #666; }
</style>
<div class="co">
  <b>${COMPANY.name}</b><br>
  ${COMPANY.address} · MST ${COMPANY.taxCode}
</div>
<h1>Chính sách bán hàng</h1>
<div class="sub">Số ${esc(p.code)} · phiên bản ${p.version_no}</div>

<table class="kv">
  <tr>
    <td class="k">Mã khách hàng</td><td><b>${esc(c.code)}</b></td>
    <td class="k">Tên khách hàng</td><td><b>${esc(c.name)}</b></td>
  </tr>
  <tr>
    <td class="k">Địa chỉ</td><td colspan="3">${esc(c.registeredAddress)}</td>
  </tr>
  <tr>
    <td class="k">Người đại diện</td><td>${esc(c.ownerName)}${c.ownerTitle ? ` — ${esc(c.ownerTitle)}` : ''}</td>
    <td class="k">Công nợ</td><td>${money(c.debt)} đ</td>
  </tr>
  <tr>
    <td class="k">Người đề nghị</td><td>${esc(people['TDV'] ?? '—')}</td>
    <td class="k">Thời gian áp dụng</td><td>${dmy(p.applied_date ?? p.effective_from)}</td>
  </tr>
  <tr>
    <td class="k">Trạng thái</td><td>${esc(STATUS_LABEL[p.status] ?? p.status)}</td>
    <td class="k">Ngày lập</td><td>${dmy(p.submitted_at)}</td>
  </tr>
  <tr>
    <td class="k">Trưởng bộ phận</td><td>${esc(people['TBP'] ?? '—')} · ${dmyHm(p.tbp_signed_at)}</td>
    <td class="k">Kế toán</td><td>${esc(people['KE_TOAN'] ?? '—')} · ${dmyHm(p.kt_l2_received_at ?? p.kt_l1_received_at)}</td>
  </tr>
  <tr>
    <td class="k">Thời gian duyệt</td><td colspan="3">
      Gửi duyệt ${dmyHm(p.submitted_at)} · TBP ký ${dmyHm(p.tbp_signed_at)} ·
      KT lần 1 ${dmyHm(p.kt_l1_received_at)} · Bàn giao ${dmyHm(p.sa_handover_at)} ·
      KT lần 2 ${dmyHm(p.kt_l2_received_at)}
    </td>
  </tr>
  <tr><td class="k">File đính kèm</td><td colspan="3">${attachments}</td></tr>
</table>

<table class="lines">
  <thead>
    <tr>
      <th>#</th><th>Mã SP</th><th>Tên sản phẩm</th>
      <th>Giá bán Công ty</th><th>Giá bán buôn</th>
      ${Array.from({ length: soCotCpbh(p.lines) }, (_, k) => `<th>CPBH${k + 1}</th>`).join('')}
      <th>Giá thu về</th><th>Tỷ lệ CK</th><th>Ngưỡng</th><th>Ghi chú</th>
    </tr>
  </thead>
  <tbody>${p.lines.map(lineRow(soCotCpbh(p.lines))).join('')}</tbody>
</table>

${
  sig
    ? `<div class="sign"><div class="box">
    <div class="mark">ĐÃ KÝ SỐ</div>
    <div>${esc(sig.signerName)}</div>
    <div>${esc(sig.signerRole)}</div>
    <div>${dmyHm(sig.signedAt)}</div>
  </div></div>`
    : ''
}
<div class="foot">Bản in từ phần mềm Chính sách bán hàng Nutricare — ${dmyHm(new Date().toISOString())}</div>`;
}
