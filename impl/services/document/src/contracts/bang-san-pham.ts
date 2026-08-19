/**
 * Bảng dòng sản phẩm của bản CSBH, dựng thẳng ra XML của Word (`0055`).
 *
 * VÌ SAO KHÔNG ĐỂ NGƯỜI SOẠN MẪU VẼ BẢNG NÀY. Muc 7.1 chốt: số cột CPBH của cả
 * bảng bằng dòng NHIỀU KHOẢN NHẤT, và dòng ít khoản hơn để ô trống chứ không
 * điền số 0. Mỗi dòng nhận tới 50 khoản, nên số cột đổi theo từng hồ sơ — một
 * bảng vẽ sẵn trong Word có số cột cố định, và nó chỉ đúng cho những hồ sơ tình
 * cờ có đúng số khoản ấy.
 *
 * Nên ranh giới đặt ở đây: người soạn mẫu đặt MỘT ô trống `{{policy.lines_table}}`
 * và nắm toàn bộ phần chữ, khối công ty, câu dẫn và chỗ ký; hệ thống trả về cả
 * cái bảng và giữ nguyên bảo đảm về bảng số — thứ mà người ký đặt bút xuống dưới.
 *
 * Cột và cách định dạng giữ ĐÚNG như bản HTML ở `render/sheet.ts`: hai bản phải
 * ra cùng một con số, nếu không thì bản người dùng xem trên màn hình khác bản
 * đem ký (muc 11.1).
 */
import type { PolicyFull, PolicyLine } from '../infra/clients.js';
import { table, tableRow } from './docx.js';
import { money, pct, soCotCpbh } from '../render/sheet.js';

/**
 * Tiêu đề bảng. Số cột CPBH suy từ dữ liệu, nên tiêu đề cũng vậy.
 *
 * Không dòng nào có khoản nào thì bảng KHÔNG có cột CPBH — bốn cột số 0 nói sai
 * về một hồ sơ chẳng có khoản chi phí nào.
 */
const tieuDe = (soCot: number): string[] => [
  '#',
  'Mã SP',
  'Tên sản phẩm',
  'Giá bán Công ty',
  'Giá bán buôn',
  ...Array.from({ length: soCot }, (_, k) => `CPBH${k + 1}`),
  'Giá thu về',
  'Tỷ lệ CK',
  'Ngưỡng',
  'Ghi chú',
];

const dong = (l: PolicyLine, i: number, soCot: number): string[] => [
  String(i + 1),
  l.product_code_snap,
  l.product_name_snap,
  money(l.company_price),
  money(l.wholesale_price),
  // Ô TRỐNG, không phải số 0: số 0 là một con số có nghĩa ("khoản này bằng
  // không"), còn ô trống nói đúng điều cần nói là dòng ấy không có khoản thứ
  // mấy đó.
  ...Array.from({ length: soCot }, (_, k) =>
    l.cpbh?.[k] === undefined ? '' : money(l.cpbh[k]),
  ),
  money(l.net_price),
  pct(l.discount_rate),
  pct(l.threshold_snap),
  l.note ?? '',
];

export function bangSanPhamXml(p: PolicyFull): string {
  const soCot = soCotCpbh(p.lines);
  /*
   * Hồ sơ CHƯA CÓ DÒNG NÀO vẫn phải ra một cái bảng, không phải một khoảng
   * trống. Bảng chỉ có hàng tiêu đề nói rõ "chưa có dòng sản phẩm"; một khoảng
   * trống ở giữa văn bản đọc ra như tài liệu bị lỗi khi in.
   */
  if (p.lines.length === 0) {
    return table([tableRow(tieuDe(0)), tableRow(['—', 'Chưa có dòng sản phẩm nào', '', '', '', '', '', '', ''])]);
  }
  return table([
    tableRow(tieuDe(soCot)),
    ...p.lines.map((l, i) => tableRow(dong(l, i, soCot))),
  ]);
}
