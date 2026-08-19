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
 * CỘT — chốt ngày 19/08:
 *
 *   STT · Mã sản phẩm · Tên sản phẩm · Giá công ty · Giá bán buôn ·
 *   **CPBH tổng** · CPBH1…CPBHn · Giá thu về · Tỷ lệ CK · Ghi chú
 *
 * *Ngưỡng* ĐÃ BỎ. Đổi lại, bản giấy không còn nói mức chiết khấu tối đa cho
 * phép của từng dòng — hồ sơ vượt ngưỡng và hồ sơ đúng ngưỡng trông giống hệt
 * nhau trên giấy. Khách hàng biết và chấp nhận điều đó.
 *
 * *Ghi chú* là cột chữ duy nhất giữa bảng số, và nó TỰ XUỐNG DÒNG: ô cao lên
 * còn hơn để cột bị đẩy ra ngoài mép giấy — cột cuối cùng bị đẩy ra là cột biến
 * mất khỏi bản in mà không báo gì.
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
  'STT',
  'Mã sản phẩm',
  'Tên sản phẩm',
  'Giá công ty',
  'Giá bán buôn',
  // CPBH TỔNG đứng TRƯỚC các khoản lẻ (`0056`): người đọc bản giấy cần con số
  // cộng lại trước, rồi mới soi từng khoản nếu thấy lạ. Đặt sau thì mắt phải
  // lướt qua cả dải CPBH1…CPBHn rồi mới tới thứ mình đi tìm.
  'CPBH tổng',
  ...Array.from({ length: soCot }, (_, k) => `CPBH${k + 1}`),
  'Giá thu về',
  'Tỷ lệ CK',
  'Ghi chú',
];

const dong = (l: PolicyLine, i: number, soCot: number): string[] => [
  String(i + 1),
  l.product_code_snap,
  l.product_name_snap,
  money(l.company_price),
  money(l.wholesale_price),
  money(l.cpbh_total),
  // Ô TRỐNG, không phải số 0: số 0 là một con số có nghĩa ("khoản này bằng
  // không"), còn ô trống nói đúng điều cần nói là dòng ấy không có khoản thứ
  // mấy đó.
  ...Array.from({ length: soCot }, (_, k) =>
    l.cpbh?.[k] === undefined ? '' : money(l.cpbh[k]),
  ),
  money(l.net_price),
  pct(l.discount_rate),
  l.note ?? '',
];

/**
 * Trọng số bề rộng từng cột. Tổng bao nhiêu không quan trọng — chỉ TỶ LỆ.
 *
 * *Tên sản phẩm* và *Ghi chú* rộng gấp ba bốn lần cột số vì chúng là hai cột
 * CHỮ; chia đều thì tên sản phẩm xuống bốn dòng còn cột STT thừa chỗ.
 */
const trongSoCot = (soCot: number): number[] => [
  3, // STT
  6, // Mã sản phẩm
  14, // Tên sản phẩm
  7, // Giá công ty
  7, // Giá bán buôn
  7, // CPBH tổng
  ...Array.from({ length: soCot }, () => 6),
  7, // Giá thu về
  6, // Tỷ lệ CK
  14, // Ghi chú — cột chữ, phải đủ rộng để xuống dòng chứ không nong bảng ra
];

export function bangSanPhamXml(p: PolicyFull): string {
  const soCot = soCotCpbh(p.lines);
  const ts = trongSoCot(soCot);
  /*
   * Hồ sơ CHƯA CÓ DÒNG NÀO vẫn phải ra một cái bảng, không phải một khoảng
   * trống. Bảng chỉ có hàng tiêu đề nói rõ "chưa có dòng sản phẩm"; một khoảng
   * trống ở giữa văn bản đọc ra như tài liệu bị lỗi khi in.
   */
  if (p.lines.length === 0) {
    return table(
      [
        tableRow(tieuDe(0), true, ts),
        tableRow(['—', 'Chưa có dòng sản phẩm nào', '', '', '', '', '', ''], false, ts),
      ],
      true,
    );
  }
  return table(
    [
      // Hàng tiêu đề LẶP LẠI ở mỗi trang — hồ sơ 60 dòng tràn sang sáu trang, và
      // từ trang 2 mà không có tên cột thì bảng số đọc không ra gì (DOC-19).
      tableRow(tieuDe(soCot), true, ts),
      ...p.lines.map((l, i) => tableRow(dong(l, i, soCot), false, ts)),
    ],
    // Bố cục CỐ ĐỊNH: ghi chú dài thì xuống dòng, ô cao lên — chứ không nong
    // cột ra và đẩy cột cuối khỏi mép giấy.
    true,
  );
}
