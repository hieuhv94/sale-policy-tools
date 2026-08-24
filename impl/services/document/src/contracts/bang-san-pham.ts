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
import { money, pct, soCotCpbh } from './dinh-dang.js';

/**
 * Danh mục CỘT của bảng sản phẩm — mẫu nào chọn cột nấy (`0067`).
 *
 * Tới `0066` tập cột cố định trong mã: mười cột, mọi mẫu như nhau. Khách hàng
 * chốt ngày 20/08 cho khai theo từng mẫu, và đây là chỗ đúng để đặt nó — từ
 * `0058` người xem CHỌN MẪU, tức là chọn bản trình bày, mà tập cột là một thuộc
 * tính của bản trình bày.
 *
 * BA ĐIỀU CỦA BẢNG NÀY ĐÁNG ĐỌC KỸ:
 *
 *   1. `cpbh` là MỘT lựa chọn nở ra thành N CỘT — CPBH1…CPBHn, số cột bằng dòng
 *      nhiều khoản nhất (muc 7.1). Không tách được thành từng cột để chọn lẻ vì
 *      số ấy chỉ biết lúc dựng bảng cho một hồ sơ cụ thể, còn tập cột thì khai
 *      lúc soạn mẫu — trước khi biết hồ sơ nào sẽ dùng nó.
 *   2. `ten_san_pham` KHÔNG TẮT ĐƯỢC — và từ `0084` nó là cột duy nhất như vậy.
 *      Một bảng giá không nói mình đang nói về mặt hàng nào thì không còn là
 *      bảng giá, nên cột ấy ở lại cùng muc 11.1.
 *
 *      **`cpbh_tong` MỞ RA CHO TẮT** `sửa 21/08`. CPBH là chi phí bán hàng —
 *      con số NỘI BỘ, và mẫu *"bản gọn đưa khách hàng"* mà `0067` sinh ra chính
 *      là chỗ người ta không muốn đưa nó ra ngoài. Khoá cột ấy lại là dùng muc
 *      11.1 để chặn đúng cái việc mà tập cột theo mẫu vốn được đẻ ra để làm.
 *
 *      Hệ quả nói thẳng: mục *CPBH* của muc 11.1 giờ do người soạn mẫu tự chịu
 *      trách nhiệm, y như mục *thông tin công ty* đã tự chịu từ `0067`. Phép
 *      kiểm tự động còn 11 trên 13 mục. Cả hai khoản CPBH — cột tổng và các cột
 *      lẻ — đều tắt được, nên một mẫu ra bản A4 không có chữ CPBH nào là hợp lệ
 *      và lưu được; đó là điều khách hàng đã chốt, không phải một lỗ hổng.
 *   3. `trongSo` là TỶ LỆ bề rộng, không phải số đo. Hai cột CHỮ — tên sản phẩm
 *      và ghi chú — rộng gấp đôi cột số, nếu không thì tên xuống bốn dòng còn
 *      cột STT thừa chỗ.
 */
export const COT_BANG = [
  { khoa: 'stt', nhan: 'STT', trongSo: 3 },
  { khoa: 'ma_san_pham', nhan: 'Mã sản phẩm', trongSo: 6 },
  { khoa: 'ten_san_pham', nhan: 'Tên sản phẩm', trongSo: 14, batBuoc: true },
  { khoa: 'gia_cong_ty', nhan: 'Giá công ty', trongSo: 7 },
  { khoa: 'gia_ban_buon', nhan: 'Giá bán buôn', trongSo: 7 },
  { khoa: 'cpbh_tong', nhan: 'CPBH tổng', trongSo: 7 },
  { khoa: 'cpbh', nhan: 'Từng khoản CPBH (CPBH1…CPBHn)', trongSo: 6 },
  { khoa: 'gia_thu_ve', nhan: 'Giá thu về', trongSo: 7 },
  { khoa: 'ty_le_ck', nhan: 'Tỷ lệ CK', trongSo: 6 },
  { khoa: 'ghi_chu', nhan: 'Ghi chú', trongSo: 14 },
] as const;

export type KhoaCot = (typeof COT_BANG)[number]['khoa'];

/** Tập cột mặc định: đủ cả mười — đúng hành vi trước `0067`. */
export const COT_MAC_DINH: KhoaCot[] = COT_BANG.map((c) => c.khoa);

export const COT_BAT_BUOC: KhoaCot[] = COT_BANG.filter((c) => 'batBuoc' in c).map((c) => c.khoa);

/**
 * Chuẩn hoá tập cột người dùng khai: bỏ khoá lạ, thêm lại cột bắt buộc, và giữ
 * ĐÚNG THỨ TỰ của `COT_BANG`.
 *
 * Thứ tự do danh mục quyết định chứ không do người dùng gõ vào: thứ tự cột trên
 * bản A4 là chuyện bố cục đã chốt (CPBH tổng đứng trước các khoản lẻ — `0056`),
 * không phải một lựa chọn. Cho khai thứ tự là mở ra một tập vô hạn bố cục mà
 * không ai kiểm được cái nào đọc được.
 */
export const chuanHoaCot = (khai: unknown): KhoaCot[] => {
  const co = new Set(Array.isArray(khai) ? khai.map(String) : COT_MAC_DINH);
  for (const k of COT_BAT_BUOC) co.add(k);
  return COT_BANG.map((c) => c.khoa).filter((k) => co.has(k));
};

/**
 * Tiêu đề bảng. Số cột CPBH suy từ dữ liệu, nên tiêu đề cũng vậy.
 *
 * Không dòng nào có khoản nào thì bảng KHÔNG có cột CPBH — bốn cột số 0 nói sai
 * về một hồ sơ chẳng có khoản chi phí nào.
 */
const tieuDe = (soCot: number, cot: KhoaCot[]): string[] =>
  cot.flatMap((k) =>
    // CPBH TỔNG đứng TRƯỚC các khoản lẻ (`0056`): người đọc bản giấy cần con số
    // cộng lại trước, rồi mới soi từng khoản nếu thấy lạ. Đặt sau thì mắt phải
    // lướt qua cả dải CPBH1…CPBHn rồi mới tới thứ mình đi tìm.
    k === 'cpbh'
      ? Array.from({ length: soCot }, (_, i) => `CPBH${i + 1}`)
      : [COT_BANG.find((c) => c.khoa === k)!.nhan],
  );

const O: Record<Exclude<KhoaCot, 'cpbh'>, (l: PolicyLine, i: number) => string> = {
  stt: (_l, i) => String(i + 1),
  ma_san_pham: (l) => l.product_code_snap,
  ten_san_pham: (l) => l.product_name_snap,
  gia_cong_ty: (l) => money(l.company_price),
  gia_ban_buon: (l) => money(l.wholesale_price),
  cpbh_tong: (l) => money(l.cpbh_total),
  gia_thu_ve: (l) => money(l.net_price),
  ty_le_ck: (l) => pct(l.discount_rate),
  ghi_chu: (l) => l.note ?? '',
};

const dong = (l: PolicyLine, i: number, soCot: number, cot: KhoaCot[]): string[] =>
  cot.flatMap((k) =>
    k === 'cpbh'
      ? // Ô TRỐNG, không phải số 0: số 0 là một con số có nghĩa ("khoản này bằng
        // không"), còn ô trống nói đúng điều cần nói là dòng ấy không có khoản
        // thứ mấy đó.
        Array.from({ length: soCot }, (_, j) => (l.cpbh?.[j] === undefined ? '' : money(l.cpbh[j])))
      : [O[k](l, i)],
  );

/**
 * Trọng số bề rộng từng cột. Tổng bao nhiêu không quan trọng — chỉ TỶ LỆ.
 *
 * *Tên sản phẩm* và *Ghi chú* rộng gấp ba bốn lần cột số vì chúng là hai cột
 * CHỮ; chia đều thì tên sản phẩm xuống bốn dòng còn cột STT thừa chỗ.
 */
const trongSoCot = (soCot: number, cot: KhoaCot[]): number[] =>
  cot.flatMap((k) => {
    const ts = COT_BANG.find((c) => c.khoa === k)!.trongSo;
    return k === 'cpbh' ? Array.from({ length: soCot }, () => ts) : [ts];
  });

export function bangSanPhamXml(p: PolicyFull, cotKhai?: unknown): string {
  const cot = chuanHoaCot(cotKhai);
  // Không chọn cột CPBH lẻ thì KHÔNG tính số cột: `soCotCpbh` quét mọi dòng, và
  // quét để rồi vứt đi là việc thừa trên đường nóng của mọi lượt xem bản mềm.
  const soCot = cot.includes('cpbh') ? soCotCpbh(p.lines) : 0;
  const ts = trongSoCot(soCot, cot);
  /*
   * Hồ sơ CHƯA CÓ DÒNG NÀO vẫn phải ra một cái bảng, không phải một khoảng
   * trống. Bảng chỉ có hàng tiêu đề nói rõ "chưa có dòng sản phẩm"; một khoảng
   * trống ở giữa văn bản đọc ra như tài liệu bị lỗi khi in.
   */
  if (p.lines.length === 0) {
    return table(
      [
        tableRow(tieuDe(0, cot), true, ts),
        // Ô đầu là dấu gạch, ô thứ hai là câu giải thích, còn lại để trống —
        // dựng theo SỐ CỘT THẬT chứ không đếm tay, vì số cột giờ đổi theo mẫu.
        tableRow(
          ts.map((_, i) => (i === 0 ? '—' : i === 1 ? 'Chưa có sản phẩm nào' : '')),
          false,
          ts,
        ),
      ],
      true,
    );
  }
  return table(
    [
      // Hàng tiêu đề LẶP LẠI ở mỗi trang — hồ sơ 60 dòng tràn sang sáu trang, và
      // từ trang 2 mà không có tên cột thì bảng số đọc không ra gì (DOC-19).
      tableRow(tieuDe(soCot, cot), true, ts),
      ...p.lines.map((l, i) => tableRow(dong(l, i, soCot, cot), false, ts)),
    ],
    // Bố cục CỐ ĐỊNH: ghi chú dài thì xuống dòng, ô cao lên — chứ không nong
    // cột ra và đẩy cột cuối khỏi mép giấy.
    true,
  );
}
