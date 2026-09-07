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
 *   STT · Mã sản phẩm · Tên sản phẩm · Giá bán Công ty · Giá bán buôn ·
 *   **CPBH** · CPBH 1…CPBH n · Giá thu về · Tỷ lệ CK · Ghi chú
 *
 * NHÃN cột đồng bộ với bảng trên MÀN HÌNH ở `0172` — xem `COT_BANG`.
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
import { dmy, money, pct, soCotCpbh } from './dinh-dang.js';

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
 *   3. BỀ RỘNG CỘT **đo từ nội dung thật** (`0172`) — xem `trongSoCot` ở cuối
 *      tệp. Không còn bộ trọng số viết cứng nào.
 *
 * ---------------------------------------------------------------------------
 * `trongSo` ĐÃ BỎ (`0172`, chốt 01/09) — và nó từng là cả một chặng
 * ---------------------------------------------------------------------------
 *
 * Khách hàng: *"độ rộng cột trong bản mềm tự động được điều chỉnh để cố gắng
 * không phải xuống dòng"*. Một bộ trọng số cố định không trả lời được câu ấy:
 * nó không biết dòng sản phẩm của hồ sơ NÀY dài bao nhiêu, nên nó chỉ đúng cho
 * những hồ sơ tình cờ giống hồ sơ mà người chỉnh số đang nhìn.
 *
 * `0135` chỉnh bộ số ấy một lượt (tên sản phẩm 14 → 22, tức 18% → 29%) sau khi
 * đo trên PDF thật, và lượt chỉnh đó ĐÚNG với dữ liệu lúc ấy. Nó vẫn sai với
 * một danh mục toàn tên ngắn — 29% bề ngang cho `Sữa A` trong khi cột tiền bên
 * cạnh vỡ chữ.
 *
 * Cái GIỮ LẠI của `0135`: *tên sản phẩm và ghi chú là hai cột CHỮ, chúng được
 * phép xuống dòng, cột số thì không*. Luật ấy giờ nằm ở trường `tran` dưới đây
 * thay vì ở một con số bề rộng.
 */
export const COT_BANG = [
  { khoa: 'stt', nhan: 'STT' },
  /*
   * NGÀY ÁP DỤNG — cột đầu của phần dữ liệu, BÊN TRÁI *Mã sản phẩm* (`0180`).
   *
   * Vị trí do khách hàng chốt từng chữ (*"cột ngày áp dụng để bên trái mã sản
   * phẩm"*), và nó hợp lý theo cách bảng được đọc: từ `0180` ngày áp dụng là
   * thuộc tính của DÒNG chứ không của hồ sơ, nên nó phải đứng ở chỗ mắt đọc
   * trước khi đọc tới mặt hàng, không phải lẫn vào giữa dải số tiền.
   *
   * Đây cũng là chỗ ô *Thời gian áp dụng* của tờ giấy chuyển tới: nó rời khỏi
   * khối thông tin đầu trang cùng lúc (`sources.ts`).
   */
  { khoa: 'ngay_ap_dung', nhan: 'Ngày áp dụng' },
  { khoa: 'ma_san_pham', nhan: 'Mã sản phẩm' },
  /*
   * `tran` — TRẦN bề rộng, tính bằng `em` của cỡ chữ thân bảng (11pt).
   *
   * Chỉ hai cột CHỮ có nó, và đó chính là ranh giới `0135` đã vạch: cột số phải
   * được đủ chỗ để KHÔNG xuống dòng, cột chữ thì xuống dòng là bình thường
   * (`0056` viết ra điều đó cho *Ghi chú*). Không có trần thì một tên sản phẩm
   * bốn mươi ký tự ăn hết bề ngang và đẩy mọi cột tiền vào chỗ vỡ chữ.
   *
   * 13em ≈ 5cm cho tên sản phẩm, 9em ≈ 3,5cm cho ghi chú — đủ cho phần lớn tên
   * mặt hàng trên MỘT dòng, và tên dài hơn thì xuống hai dòng thay vì kéo cả
   * bảng theo.
   */
  { khoa: 'ten_san_pham', nhan: 'Tên sản phẩm', batBuoc: true, tran: 13 },
  { khoa: 'gia_cong_ty', nhan: 'Giá bán Công ty' },
  { khoa: 'gia_ban_buon', nhan: 'Giá bán buôn' },
  { khoa: 'cpbh_tong', nhan: 'CPBH' },
  { khoa: 'cpbh', nhan: 'Từng khoản CPBH (CPBH 1…CPBH n)' },
  { khoa: 'gia_thu_ve', nhan: 'Giá thu về' },
  { khoa: 'ty_le_ck', nhan: 'Tỷ lệ CK' },
  /*
   * HAI CỘT CỦA NGƯỜI DUYỆT (`0180`) — có trong danh mục, **không** nằm trong
   * tập cột của hai mẫu mặc định.
   *
   * Khách hàng chốt 07/09: *"vẫn để Trạng thái và Tỷ lệ CK cũ trong list các
   * cột của bảng sản phẩm nhưng không tích chọn cho 2 văn bản mẫu"*. Nên chúng
   * đi đúng con đường mà `0067` mở ra cho tập-cột-theo-mẫu: có mặt để ai cần
   * thì bật, tắt sẵn ở tờ giấy đem ký.
   *
   * *Tỷ lệ CK cũ* đứng NGAY SAU *Tỷ lệ CK* vì nó chỉ có nghĩa khi đọc cạnh con
   * số mới — hai ô cách nhau một cột là mắt phải nhớ số để so.
   */
  { khoa: 'ty_le_ck_cu', nhan: 'Tỷ lệ CK cũ' },
  { khoa: 'trang_thai', nhan: 'Trạng thái' },
  { khoa: 'ghi_chu', nhan: 'Ghi chú', tran: 9 },
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
  // Ngày áp dụng là số CỦA RIÊNG HỒ SƠ NÀY — người lập gõ nó, không đọc từ danh
  // mục — nên nó lấy màu cam của nhóm ấy chứ không màu xanh của nhóm danh mục.
  ngay_ap_dung: 'FFE6D0',
  ma_san_pham: 'FFFF00',
  ten_san_pham: 'CBD8F1',
  gia_cong_ty: 'CBD8F1',
  gia_ban_buon: 'CBD8F1',
  cpbh_tong: 'FFE6D0',
  cpbh: 'FFE6D0',
  gia_thu_ve: 'FFE6D0',
  ty_le_ck: 'FFE6D0',
  ty_le_ck_cu: 'FFE6D0',
  trang_thai: 'FFE6D0',
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
  ngay_ap_dung: { canh: 'center' },
  ma_san_pham: { dam: true },
  ten_san_pham: {},
  gia_cong_ty: { canh: 'right' },
  gia_ban_buon: { canh: 'right' },
  cpbh_tong: { canh: 'right', dam: true },
  cpbh: { canh: 'right' },
  gia_thu_ve: { canh: 'right', dam: true },
  ty_le_ck: { canh: 'right', dam: true },
  // KHÔNG in đậm: nó là con số để đối chiếu với ô bên trái, không phải kết quả
  // của tờ giấy. Hai ô đậm cạnh nhau thì mắt không biết ô nào là số đang đề nghị.
  ty_le_ck_cu: { canh: 'right' },
  trang_thai: { canh: 'center' },
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

/** Tập cột mặc định: ĐỦ MỌI CỘT — đúng hành vi trước `0067`. */
export const COT_MAC_DINH: KhoaCot[] = COT_BANG.map((c) => c.khoa);

/**
 * Hai cột của NGƯỜI DUYỆT, không tự đi vào tờ giấy nào (`0180`).
 *
 * *Trạng thái* và *Tỷ lệ CK cũ* trả lời câu hỏi *"bản này khác bản trước ở
 * đâu"* — việc của người đang duyệt, không phải nội dung của một chính sách đem
 * ký. Khách hàng chốt 07/09 để chúng trong danh mục cột nhưng KHÔNG tích cho
 * hai mẫu mặc định.
 *
 * Danh sách này KHÔNG phải một phép cấm: mẫu nào khai chúng thì vẫn in ra. Nó
 * chỉ nói *"không tự động có"*.
 */
export const COT_NGUOI_DUYET: KhoaCot[] = ['ty_le_ck_cu', 'trang_thai'];

/**
 * Tập cột của BA MẪU MẶC ĐỊNH — mọi cột trừ hai cột của người duyệt.
 *
 * Tách khỏi `COT_MAC_DINH` chứ không sửa hằng ấy: `COT_MAC_DINH` trả lời câu
 * *"mẫu không khai gì thì in cột nào"* và câu trả lời đúng cho nó vẫn là *"đủ
 * mọi cột"* — người soạn mẫu chưa khai gì thì chưa ai bỏ cột nào đi cả. Câu này
 * là câu khác: *"ba tệp phần mềm tự nạp thì tích sẵn cột nào"*.
 */
export const COT_MAU_MAC_DINH: KhoaCot[] = COT_MAC_DINH.filter(
  (k) => !COT_NGUOI_DUYET.includes(k),
);

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
  // `0180` — khách hàng chốt đưa *Ngày áp dụng* vào CẢ HAI mẫu mặc định. Bản
  // rút gọn là tờ đưa cho bên mua, và ngày mỗi mặt hàng bắt đầu áp dụng đúng là
  // thứ bên mua cần biết nhất.
  'ngay_ap_dung',
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
      ? Array.from({ length: soCot }, (_, i) => `CPBH ${i + 1}`)
      : [COT_BANG.find((c) => c.khoa === k)!.nhan],
  );

/**
 * Nhãn ba trạng thái dòng — CÙNG CHỮ với bảng trên màn hình (`0180`).
 *
 * `tests/http/tieu-de-cot.test.ts` canh tên CỘT giữa hai bảng; ba nhãn này là
 * NỘI DUNG ô, nên chúng có một ca đối chiếu riêng. Cùng một lý do: người đọc tờ
 * giấy vừa in phải thấy đúng chữ họ vừa đọc trên màn hình.
 */
export const NHAN_TRANG_THAI_DONG: Record<string, string> = {
  BO_SUNG: 'Bổ sung',
  CHINH_SUA: 'Chỉnh sửa',
  DANG_AP_DUNG: 'Đang áp dụng',
};

const O: Record<Exclude<KhoaCot, 'cpbh'>, (l: PolicyLine, i: number) => string> = {
  stt: (_l, i) => String(i + 1),
  // Ô TRỐNG chứ không phải hôm nay khi thiếu: cột `NOT NULL` nên chuyện này chỉ
  // xảy ra với dữ liệu hỏng, và bịa một ngày vào tờ giấy đem ký là tệ hơn hẳn
  // một ô trống nhìn thấy được.
  ngay_ap_dung: (l) => (l.ngay_ap_dung ? dmy(l.ngay_ap_dung) : ''),
  ma_san_pham: (l) => l.product_code_snap,
  ten_san_pham: (l) => l.product_name_snap,
  gia_cong_ty: (l) => money(l.company_price),
  gia_ban_buon: (l) => money(l.wholesale_price),
  cpbh_tong: (l) => money(l.cpbh_total),
  gia_thu_ve: (l) => money(l.net_price),
  ty_le_ck: (l) => pct(l.discount_rate),
  // `policy` đã quyết định dòng nào CÓ tỷ lệ cũ (chỉ dòng *Chỉnh sửa*), nên ở
  // đây không suy lại theo `trang_thai` — xem `SQL_TRANG_THAI_DONG`.
  ty_le_ck_cu: (l) => (l.ty_le_ck_truoc ? pct(l.ty_le_ck_truoc) : ''),
  trang_thai: (l) => (l.trang_thai ? (NHAN_TRANG_THAI_DONG[l.trang_thai] ?? l.trang_thai) : ''),
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
 * Bề rộng ước lượng của một chuỗi, tính bằng **em** của phông thân bảng.
 *
 * Không đo được chính xác ở đây — bề rộng thật do LibreOffice (hoặc Word) tính
 * lúc dựng trang, với chính bảng advance width của phông đang cài. Nhưng bảng
 * này chỉ cần TỶ LỆ giữa các cột, và một xấp xỉ theo nhóm ký tự đủ để trả lời
 * *"cột nào cần rộng hơn cột nào, và hơn bao nhiêu"*.
 *
 * Các con số lấy từ bảng advance width của Times New Roman: chữ số đúng 0,5em
 * (nên `1.234.567` là 4,25em), dấu chấm 0,25em, chữ hoa rộng gần gấp rưỡi chữ
 * thường. Dấu tiếng Việt không đổi bề rộng của chữ cái mang nó.
 */
const rongChu = (s: string): number => {
  let em = 0;
  for (const c of s) {
    if (c >= '0' && c <= '9') em += 0.5;
    else if (c === ' ') em += 0.25;
    else if ('.,:;\''.includes(c)) em += 0.25;
    else if ('-/()'.includes(c)) em += 0.31;
    else if (c === '%') em += 0.83;
    // Chữ HOA (kể cả chữ hoa có dấu) rộng hơn hẳn chữ thường — `MST` với `mst`
    // lệch nhau gần một nửa.
    else if (c === c.toUpperCase() && c !== c.toLowerCase()) em += 0.72;
    else em += 0.5;
  }
  return em;
};

/**
 * Bề rộng của TỪ DÀI NHẤT — dùng cho hàng tiêu đề.
 *
 * Tiêu đề được phép xuống dòng GIỮA HAI TỪ, và tờ mẫu khách hàng tự gõ cũng có
 * *Giá bán buôn* nằm hai dòng. Cái không được phép là cắt giữa một từ, nên đây
 * mới là con số ràng buộc — lấy cả chuỗi thì *Giá bán Công ty* đòi một cột rộng
 * gấp đôi con số nó đựng.
 */
const rongTuDaiNhat = (s: string): number =>
  Math.max(0, ...s.split(/\s+/).filter(Boolean).map(rongChu));

/** Lề trong ô, hai bên: 57 twip mỗi bên (`table()`), quy ra em ở cỡ 11pt. */
const LE_O_EM = 114 / 220;

/**
 * TRỌNG SỐ BỀ RỘNG, đo từ chính nội dung sắp in (`0172`).
 *
 * Ba bước, và bước thứ ba là chỗ luật nghiệp vụ nằm:
 *
 *   1. Mỗi cột cần bề rộng bằng ô DÀI NHẤT của nó (kể cả hàng tiêu đề, tính
 *      theo từ dài nhất), cộng lề trong ô.
 *   2. Hai cột CHỮ bị chặn ở `tran`: chúng được phép xuống dòng, nên nhu cầu của
 *      chúng không được kéo mọi cột số vào chỗ vỡ chữ.
 *   3. Cột nào cũng phải trên `RONG_TOI_THIEU_PCT`.
 *
 * `table()` chia lại theo TỔNG, nên đơn vị tuyệt đối không quan trọng: nếu tổng
 * nhu cầu nhỏ hơn bề ngang trang thì mọi cột được nới ra theo tỷ lệ và không
 * cột nào xuống dòng; nếu lớn hơn thì mọi cột co lại theo tỷ lệ — cùng lắm là
 * xuống dòng đều nhau, thay vì một cột vỡ vụn trong khi cột bên cạnh thừa chỗ.
 *
 * ĐÂY LÀ CHỖ CÙNG MỘT BẢNG IN RA HAI HỒ SƠ CÓ THỂ RA HAI BỀ RỘNG CỘT KHÁC NHAU,
 * và đó chính là điều khách hàng yêu cầu. Hệ quả phải biết: hai bản CSBH của hai
 * khách hàng đặt cạnh nhau không còn khớp lưới cột.
 */
const trongSoCot = (
  tieuDeHang: string[],
  duLieu: string[][],
  soCot: number,
  cot: KhoaCot[],
): number[] => {
  const tran = cot.flatMap((k) => {
    const c = COT_BANG.find((x) => x.khoa === k)!;
    const t = 'tran' in c ? c.tran : Infinity;
    return k === 'cpbh' ? Array.from({ length: soCot }, () => t) : [t];
  });
  const can = tieuDeHang.map((td, i) =>
    Math.min(
      tran[i]!,
      Math.max(rongTuDaiNhat(td), ...duLieu.map((h) => rongChu(h[i] ?? ''))),
    ) + LE_O_EM,
  );
  return apDungSan(can);
};

/**
 * Nong những cột dưới sàn lên đúng sàn, rồi kiểm lại — nong một cột làm tổng
 * tăng, nên cột vừa đạt sàn có thể tụt xuống lại.
 *
 * Có lúc KHÔNG làm được: đủ mười cột cộng nhiều khoản CPBH thì số cột × sàn vượt
 * quá 100%, và lúc ấy không cách chia nào cứu được — bảng chật vì SỐ CỘT chứ
 * không vì cách chia. Trả về nguyên trạng thay vì lặp mãi.
 */
const apDungSan = (can: number[]): number[] => {
  const san = RONG_TOI_THIEU_PCT / 100;
  if (can.length * san >= 1) return can;
  const ra = [...can];
  for (let lan = 0; lan < ra.length * 2; lan++) {
    const tong = ra.reduce((a, b) => a + b, 0);
    const i = ra.findIndex((x) => x / tong < san - 1e-9);
    if (i < 0) break;
    // x' / (T − x + x') = san  ⇔  x' = san·(T − x) / (1 − san)
    ra[i] = (san * (tong - ra[i]!)) / (1 - san);
  }
  return ra;
};

export function bangSanPhamXml(p: PolicyFull, cotKhai?: unknown): string {
  const cot = chuanHoaCot(cotKhai);
  // Không chọn cột CPBH lẻ thì KHÔNG tính số cột: `soCotCpbh` quét mọi dòng, và
  // quét để rồi vứt đi là việc thừa trên đường nóng của mọi lượt xem bản mềm.
  const soCot = cot.includes('cpbh') ? soCotCpbh(p.lines) : 0;
  /*
   * Hồ sơ CHƯA CÓ DÒNG NÀO vẫn phải ra một cái bảng, không phải một khoảng
   * trống. Bảng chỉ có hàng tiêu đề nói rõ "chưa có dòng sản phẩm"; một khoảng
   * trống ở giữa văn bản đọc ra như tài liệu bị lỗi khi in.
   */
  if (p.lines.length === 0) {
    // Trọng số đo từ HÀNG TIÊU ĐỀ, không tính hàng "Chưa có sản phẩm nào": câu
    // ấy nằm trong một ô, và để nó dự phần thì cột *Mã sản phẩm* của một hồ sơ
    // rỗng rộng gấp ba lần bình thường.
    const ts = trongSoCot(tieuDe(0, cot), [], 0, cot);
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
  const hangTieuDe = tieuDe(soCot, cot);
  const hangDuLieu = p.lines.map((l, i) => dong(l, i, soCot, cot));
  // Dựng NỘI DUNG trước rồi mới đo bề rộng: từ `0172` bề rộng cột là hàm của
  // chính những chuỗi này, nên không tính trước chúng được.
  const ts = trongSoCot(hangTieuDe, hangDuLieu, soCot, cot);
  return table(
    [
      // Hàng tiêu đề LẶP LẠI ở mỗi trang — hồ sơ 60 dòng tràn sang sáu trang, và
      // từ trang 2 mà không có tên cột thì bảng số đọc không ra gì (DOC-19).
      tableRow(hangTieuDe, true, ts, kieuTieuDe(soCot, cot)),
      ...hangDuLieu.map((h) => tableRow(h, false, ts, kieuDong)),
    ],
    // Bố cục CỐ ĐỊNH: ghi chú dài thì xuống dòng, ô cao lên — chứ không nong
    // cột ra và đẩy cột cuối khỏi mép giấy.
    true,
    // Cùng dãy trọng số mà từng ô đang dùng — lưới cột và ô phải nói một điều
    // (`0135`). Xem chú thích ở `table()`.
    ts,
  );
}
