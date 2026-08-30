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
import { table, tableRow, type KieuO } from './docx.js';
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
 *      và ghi chú — rộng hơn hẳn cột số, nếu không thì tên xuống bốn dòng còn
 *      cột STT thừa chỗ.
 *
 * `0135` CHIA LẠI, khách hàng chốt 27/08: *"tên sản phẩm cần rộng hơn"*. Tên sản
 * phẩm 14 → **22**, tức từ 18% lên **29%** bề rộng bảng ở tập cột mặc định. Chỗ
 * bù lấy từ ba cột không cần rộng:
 *
 *   Ghi chú  14 → 11  — vẫn là cột chữ, nhưng thứ yếu so với tên mặt hàng
 *   Tỷ lệ CK  6 → 5   — `19,51%` là sáu ký tự, không hơn
 *   CPBH lẻ   6 → 5   — cột số, và phần lớn dòng để trống
 *
 * *Mã sản phẩm* đi NGƯỢC lại, 6 → 7: `NC-GOLD-900` là mười một ký tự không có
 * chỗ ngắt, nên nó là cột dễ vỡ chữ nhất trong nhóm cột hẹp.
 *
 * *STT* thử hạ 3 → 2 rồi TRẢ VỀ 3, và lý do đáng giữ: ở 2 nó rơi xuống 2,67% —
 * dưới `RONG_TOI_THIEU_PCT`, và ca kiểm bắt được ngay. Hai chữ số cộng lề trong
 * ô cần chừng 0,6cm; 2,67% của 17cm chỉ được 0,45cm, và `10` xuống hai dòng.
 */
export const COT_BANG = [
  { khoa: 'stt', nhan: 'STT', trongSo: 3 },
  { khoa: 'ma_san_pham', nhan: 'Mã sản phẩm', trongSo: 7 },
  { khoa: 'ten_san_pham', nhan: 'Tên sản phẩm', trongSo: 22, batBuoc: true },
  { khoa: 'gia_cong_ty', nhan: 'Giá công ty', trongSo: 7 },
  { khoa: 'gia_ban_buon', nhan: 'Giá bán buôn', trongSo: 7 },
  { khoa: 'cpbh_tong', nhan: 'CPBH tổng', trongSo: 7 },
  { khoa: 'cpbh', nhan: 'Từng khoản CPBH (CPBH1…CPBHn)', trongSo: 5 },
  { khoa: 'gia_thu_ve', nhan: 'Giá thu về', trongSo: 7 },
  { khoa: 'ty_le_ck', nhan: 'Tỷ lệ CK', trongSo: 5 },
  { khoa: 'ghi_chu', nhan: 'Ghi chú', trongSo: 11 },
] as const;

/**
 * MÀU NỀN hàng tiêu đề, theo NHÓM Ý NGHĨA của cột (`0165`).
 *
 * Bốn màu, và bốn con số này đọc thẳng từ `Mau_mac_dinh_full.docx` — tờ mẫu
 * khách hàng tự gõ. Không đoán lại một bảng màu khác: đây là chỗ họ đã quyết,
 * và họ quyết theo cách bảng ĐƯỢC ĐỌC chứ không theo thứ tự cột:
 *
 *   xám   `EFEFEF`  STT — cột đánh số, không mang dữ liệu nghiệp vụ nào
 *   vàng  `FFFF00`  Mã sản phẩm — khoá đối chiếu với danh mục, chỗ mắt tìm trước
 *   xanh  `CBD8F1`  tên và hai mức giá **của danh mục** — số Công ty công bố
 *   cam   `FFE6D0`  từ CPBH trở đi — số **của riêng hồ sơ này**, thứ đang duyệt
 *
 * Ranh giới xanh/cam là ranh giới đáng nhớ nhất: nó tách *"số lấy từ danh mục"*
 * khỏi *"số người lập đề nghị"*, tức tách phần không bàn cãi khỏi phần đang xin
 * phê duyệt.
 */
const NEN_TIEU_DE: Record<KhoaCot, string> = {
  stt: 'EFEFEF',
  ma_san_pham: 'FFFF00',
  ten_san_pham: 'CBD8F1',
  gia_cong_ty: 'CBD8F1',
  gia_ban_buon: 'CBD8F1',
  cpbh_tong: 'FFE6D0',
  cpbh: 'FFE6D0',
  gia_thu_ve: 'FFE6D0',
  ty_le_ck: 'FFE6D0',
  ghi_chu: 'FFE6D0',
};

/**
 * Cách trình bày Ô DỮ LIỆU của từng cột (`0165`).
 *
 * Cũng đọc từ tờ mẫu khách hàng, và hai luật của nó nhất quán:
 *
 *   - **số căn phải**, chữ căn trái, STT căn giữa — cột số căn phải thì hàng
 *     nghìn thẳng cột và mắt so được hai dòng kề nhau;
 *   - **in đậm bốn con số đáng nhìn**: mã sản phẩm, CPBH tổng, giá thu về, tỷ lệ
 *     CK. Ba con số sau là kết quả của phép tính mà cả tờ giấy sinh ra để trình.
 *
 * HAI CHỖ LỆCH với tờ mẫu, và cả hai đều cố ý:
 *
 *   `cpbh_tong` — bản đầy đủ căn PHẢI, bản rút gọn căn GIỮA. Hai file nói khác
 *   nhau về cùng một cột, nên đây là chỗ phải chọn: căn phải, vì nó là tiền.
 *
 *   `ghi_chu` — tờ mẫu căn GIỮA, ở đây căn TRÁI. Ô ghi chú trong cả hai file đều
 *   RỖNG nên không nhìn ra được ý định; mà ghi chú là cột chữ duy nhất tự xuống
 *   dòng (`0056`), và một đoạn nhiều dòng căn giữa thì mỗi dòng một mép — đọc
 *   mệt hẳn so với căn trái.
 */
const KIEU_O: Record<KhoaCot, KieuO> = {
  stt: { canh: 'center' },
  ma_san_pham: { dam: true },
  ten_san_pham: {},
  gia_cong_ty: { canh: 'right' },
  gia_ban_buon: { canh: 'right' },
  cpbh_tong: { canh: 'right', dam: true },
  cpbh: { canh: 'right' },
  gia_thu_ve: { canh: 'right', dam: true },
  ty_le_ck: { canh: 'right', dam: true },
  ghi_chu: {},
};

/**
 * Cột hẹp nhất được phép — tính bằng phần trăm bề rộng bảng (`0135`).
 *
 * Không phải một con số thẩm mỹ. Bảng ở chế độ `fixed`, nên chữ dài hơn cột thì
 * XUỐNG DÒNG chứ không nong cột ra: một cột 3% của khổ A4 dọc rộng chừng 0,5cm,
 * và `1.234.567` xuống bảy dòng, mỗi dòng một chữ số.
 *
 * Ca kiểm canh con số này ở tổ hợp XẤU NHẤT — đủ mười cột cộng số cột CPBH tối
 * đa — chứ không ở tập cột mặc định, vì đó mới là chỗ cột bị bóp nhỏ nhất.
 */
export const RONG_TOI_THIEU_PCT = 3;

export type KhoaCot = (typeof COT_BANG)[number]['khoa'];

/** Tập cột mặc định: đủ cả mười — đúng hành vi trước `0067`. */
export const COT_MAC_DINH: KhoaCot[] = COT_BANG.map((c) => c.khoa);

export const COT_BAT_BUOC: KhoaCot[] = COT_BANG.filter((c) => 'batBuoc' in c).map((c) => c.khoa);

/**
 * Tập cột RÚT GỌN — sáu cột, đọc từ `Mau_mac_dinh_rut_gon.docx` (`0165`).
 *
 * Đây là *"bản gọn đưa khách hàng"* mà `0067` sinh ra khái niệm tập-cột-theo-mẫu
 * để phục vụ, và giờ khách hàng đã nói ra sáu cột ấy là những cột nào.
 *
 * BỐN CỘT BỊ CẮT, và chúng cùng một nhóm: từng khoản CPBH · giá thu về · tỷ lệ
 * CK · ghi chú. Ba cột đầu là phép TÍNH NGƯỢC ra mức chiết khấu — thứ nội bộ
 * Công ty dùng để duyệt, không phải thứ đưa cho bên mua.
 *
 * `cpbh_tong` thì **Ở LẠI**, và đó là chỗ dễ đọc lướt qua: bản rút gọn vẫn in
 * tổng chi phí bán hàng. `0084` mở cột ấy ra cho tắt chính vì lý do "con số nội
 * bộ", nhưng tờ mẫu khách hàng vừa gõ có nó — nên ở đây họ đã trả lời khác, và
 * câu trả lời của họ thắng.
 */
export const COT_RUT_GON: KhoaCot[] = [
  'stt',
  'ma_san_pham',
  'ten_san_pham',
  'gia_cong_ty',
  'gia_ban_buon',
  'cpbh_tong',
];

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

/** Kiểu của từng ô trên một hàng — nở `cpbh` ra đúng số cột như `tieuDe`. */
const kieuHang = (soCot: number, cot: KhoaCot[], bang: Record<KhoaCot, KieuO>): KieuO[] =>
  cot.flatMap((k) =>
    k === 'cpbh' ? Array.from({ length: soCot }, () => bang[k]) : [bang[k]],
  );

/** Ô tiêu đề: nền theo nhóm cột, chữ đậm, căn giữa — cả ba đọc từ tờ mẫu. */
const kieuTieuDe = (soCot: number, cot: KhoaCot[]): KieuO[] =>
  kieuHang(
    soCot,
    cot,
    Object.fromEntries(
      (Object.keys(NEN_TIEU_DE) as KhoaCot[]).map((k) => [
        k,
        { nen: NEN_TIEU_DE[k], canh: 'center' as const, dam: true },
      ]),
    ) as Record<KhoaCot, KieuO>,
  );

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
        tableRow(tieuDe(0, cot), true, ts, kieuTieuDe(0, cot)),
        // Ô đầu là dấu gạch, ô thứ hai là câu giải thích, còn lại để trống —
        // dựng theo SỐ CỘT THẬT chứ không đếm tay, vì số cột giờ đổi theo mẫu.
        tableRow(
          ts.map((_, i) => (i === 0 ? '—' : i === 1 ? 'Chưa có sản phẩm nào' : '')),
          false,
          ts,
        ),
      ],
      true,
      ts,
    );
  }
  const kieuDong = kieuHang(soCot, cot, KIEU_O);
  return table(
    [
      // Hàng tiêu đề LẶP LẠI ở mỗi trang — hồ sơ 60 dòng tràn sang sáu trang, và
      // từ trang 2 mà không có tên cột thì bảng số đọc không ra gì (DOC-19).
      tableRow(tieuDe(soCot, cot), true, ts, kieuTieuDe(soCot, cot)),
      ...p.lines.map((l, i) => tableRow(dong(l, i, soCot, cot), false, ts, kieuDong)),
    ],
    // Bố cục CỐ ĐỊNH: ghi chú dài thì xuống dòng, ô cao lên — chứ không nong
    // cột ra và đẩy cột cuối khỏi mép giấy.
    true,
    // Cùng dãy trọng số mà từng ô đang dùng — lưới cột và ô phải nói một điều
    // (`0135`). Xem chú thích ở `table()`.
    ts,
  );
}
