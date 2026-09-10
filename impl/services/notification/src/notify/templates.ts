/**
 * Nội dung thư. Mỗi bước một tiêu đề, thân thư dùng chung một khung.
 *
 * Sáu trường bắt buộc có mặt trong MỌI thư nghiệp vụ (NTF-02): mã khách hàng,
 * tên khách hàng, trạng thái, tên bước đang duyệt, thời điểm, và liên kết mở hồ
 * sơ — cộng lý do khi bước đó là trả lại hay từ chối. Dựng khung chung thay vì
 * viết tay từng mẫu là để không có mẫu nào lỡ thiếu một trường.
 */
import type { Status } from '@csbh/domain-policy';

/** Nhãn trạng thái đúng như YCNV muc 4 — người nhận thư đọc thấy chữ giống trên màn hình. */
export const STATUS_LABEL: Record<string, string> = {
  NHAP: 'Nháp',
  CHO_TBP_DUYET: 'Chờ Trưởng bộ phận duyệt',
  CHO_KT_L1: 'Chờ KT duyệt L1',
  SA_DANG_XU_LY: 'Sale Admin đang xử lý',
  CHO_KT_L2: 'KT duyệt bản cứng',
  DANG_CO_HIEU_LUC: 'Đang có hiệu lực',
  HET_HIEU_LUC: 'Hết hiệu lực',
  YEU_CAU_CHINH_SUA: 'Yêu cầu chỉnh sửa',
  QUA_HAN_DUYET: 'Quá hạn duyệt',
  DA_XOA: 'Đã xoá',
};

/**
 * Việc đang chờ ai làm gì.
 *
 * KHÔNG CÒN SỐ THỨ TỰ BƯỚC (`0066`). Trước đó mỗi nhãn mở đầu bằng "Bước 4 —",
 * "Bước 6 —"… theo đúng bảng mười bước ở muc 3, và chúng gây hại nhiều hơn lợi:
 *
 *   - Người nhận thư không thuộc bảng mười bước. Với họ "Bước 6" không thêm
 *     thông tin nào mà phần chữ phía sau chưa nói.
 *   - Bốn con số ấy nhảy cóc 4 · 6 · 8 · 10 (các bước lẻ là việc của người khác,
 *     không sinh thư), nên người đọc thấy hồ sơ "nhảy từ bước 4 sang bước 6" và
 *     tưởng mình bỏ lỡ mất một bước.
 *   - Thêm hoặc bớt một bước trong quy trình là phải sửa lại toàn bộ các số ở
 *     đây, và không có gì bắt lỗi nếu quên.
 *
 * `HET_HIEU_LUC` thêm ở `0066` cùng với hai lá thư hết hiệu lực. Thiếu nó thì
 * hai lá thư ấy in dòng chung chung "Không còn bước nào phải xử lý" — đúng
 * nhưng vô nghĩa, vì đó là câu dành cho hồ sơ vừa hoàn tất.
 */
export const STEP_LABEL: Record<string, string> = {
  CHO_TBP_DUYET: 'Trưởng bộ phận duyệt và ký số',
  CHO_KT_L1: 'Kế toán duyệt bản mềm',
  SA_DANG_XU_LY: 'Sale Admin xử lý và bàn giao bản cứng',
  CHO_KT_L2: 'Kế toán duyệt bản cứng',
  YEU_CAU_CHINH_SUA: 'Trình dược viên chỉnh sửa và gửi lại',
  DANG_CO_HIEU_LUC: 'Đã hoàn tất — không còn bước nào phải xử lý',
  HET_HIEU_LUC: 'Đã kết thúc — CSBH này không còn hiệu lực',
  QUA_HAN_DUYET: 'Quá hạn — vẫn chờ đúng bước cũ',
  DA_XOA: 'Đã kết thúc — người lập đã xoá hồ sơ',
};

/**
 * BẬC của một thông báo — với MỘT người đọc cụ thể (`0192`).
 *
 * Đây là trục mà cả bộ tiêu đề đứng lên, và nó là câu hỏi của NGƯỜI ĐỌC (*"tôi
 * có phải làm gì không"*), không phải câu hỏi của người phát (*"ai vừa làm
 * gì"*). Cùng một sự kiện cho ra hai tiêu đề khác nhau ở hai người, vì với họ nó
 * là hai chuyện khác nhau.
 *
 * Tới `0191` tiêu đề chỉ có một bảng tra theo hành động, nên `KT_RECEIVE_L1` gửi
 * cho Sale Admin (*phải bàn giao bản cứng ngay bây giờ*) và cho TBP với TDV
 * (*không phải việc của tôi*) đúng một câu chữ. Người có việc phải đọc hết tiêu
 * đề rồi tự dịch sang vai trò mình mới biết có phải làm gì không — với một hồ sơ
 * thì không sao, với hai mươi thì đó chính là cái "rối" khách hàng nói tới.
 */
export type Bac = 'VIEC' | 'TIN';

/*
 * `NHAN_BAC` ĐÃ GỠ ở `0195` — hai chuỗi *Cần bạn xử lý* và *Để bạn biết* mở đầu
 * mọi tiêu đề từ `0192`, khách hàng chốt bỏ ngày 10/09. Bậc còn nguyên, chỉ thôi
 * được VIẾT RA THÀNH CHỮ; trên màn hình nó đọc bằng MÀU (dải bên trái mỗi dòng).
 *
 * VÌ SAO BỎ ĐƯỢC MÀ KHÔNG MẤT GÌ — và đây là lý do mạnh hơn *"cho gọn"*: hai bậc
 * đã nói ra bằng NGỮ PHÁP, ở ngay câu chữ mà `0192` dựng. Bậc VIỆC là một mệnh
 * lệnh gọi tên việc của người đọc (*"Duyệt bản mềm — Trưởng bộ phận đã ký"*), bậc
 * TIN là một câu kể chuyện đã xảy ra (*"Trưởng bộ phận đã ký, hồ sơ sang Kế toán
 * duyệt bản mềm"*). Nhãn chỉ dán tên cho một khác biệt đã có sẵn trong câu — nó
 * lặp lại, và nó ăn mất chừng 14 ký tự đầu, đúng phần chủ đề thư mà điện thoại
 * còn hiện được.
 *
 * Bất biến thay cho nhãn: `titleFor(e,'VIEC') !== titleFor(e,'TIN')` với MỌI
 * hành động — có ca kiểm duyệt hết bảng. Mất nhãn mà hai câu trùng nhau thì
 * `0192` mất trắng, và đó là cách duy nhất chặng này hỏng.
 */

/**
 * Hai chỗ tiêu đề mở đầu bằng một câu riêng — chúng KHÔNG phải nhãn bậc.
 *
 * `SLA_REMINDER` vẫn là VIỆC, nhưng là việc còn **một ngày** — và đó là lá thư
 * cuối cùng còn cứu được hồ sơ, vì lượt sau nó đã sang `QUA_HAN_DUYET`, một
 * trạng thái KẾT THÚC (`0047`). Không có câu này thì nó trông ngang hàng với mọi
 * việc khác trong hộp.
 *
 * `TBP_RECALL` ở bậc TIN cần một câu MẠNH HƠN một lời kể: Kế toán hoặc Sale Admin
 * đang CẦM hồ sơ và vừa bị rút mất. Câu đúng là bảo họ dừng lại — không có nó thì
 * người ta đọc lướt rồi làm tiếp một hồ sơ không còn trên bàn mình.
 *
 * `0195` cắt đuôi *"— cần bạn xử lý"* khỏi câu SLA: nó là chính cụm chữ khách
 * hàng vừa bỏ, và *"Sắp quá hạn"* một mình đã mang đủ mức khẩn.
 */
const NHAN_VIEC_RIENG: Record<string, string> = {
  SLA_REMINDER: 'Sắp quá hạn',
};
const NHAN_TIN_RIENG: Record<string, string> = {
  TBP_RECALL: 'Dừng xử lý',
};

/**
 * VIỆC phải làm khi hồ sơ dừng lại ở trạng thái này — viết ở ngôi thứ hai.
 *
 * Khoá là TRẠNG THÁI ĐÍCH chứ không phải hành động, và đó là cả điểm: việc của
 * Kế toán ở `CHO_KT_L1` là một, dù hồ sơ tới đó bằng `TBP_SIGN` hay bằng đường
 * nào khác về sau. Năm mục cho năm trạng thái có chủ — đúng tập khoá của
 * `CHU_BUOC`, và có ca kiểm đối chiếu hai bảng.
 */
export const VIEC_CUA_BUOC: Partial<Record<Status, string>> = {
  CHO_TBP_DUYET: 'Duyệt và ký số',
  CHO_KT_L1: 'Duyệt bản mềm',
  SA_DANG_XU_LY: 'Bàn giao bản cứng',
  CHO_KT_L2: 'Duyệt bản cứng',
  YEU_CAU_CHINH_SUA: 'Chỉnh sửa và gửi lại',
};

/**
 * Vì sao hồ sơ tới bàn bạn — mệnh đề đuôi của tiêu đề bậc VIỆC.
 *
 * VẮNG MẶT LÀ MỘT CÂU TRẢ LỜI, không phải một chỗ thiếu: `SUBMIT` là lượt gửi
 * đầu, ca thường, không có gì để giải thích. Chỉ đánh dấu lượt QUAY LẠI và lượt
 * chuyển tay — thứ nói cho người duyệt biết họ đang cầm cái gì.
 *
 * `SUBMIT` TỪNG mang chữ *"hồ sơ mới"* trong bản nháp của `0192`, và chữ ấy phải
 * đi: nó nói về LƯỢT GỬI (chưa từng bị trả về), trong khi `loaiThayDoi` ngay
 * cạnh đó cũng dùng chữ *mới* để nói về CSBH (khách chưa có CSBH nào). Hai nghĩa,
 * một chữ, cùng một dòng — đúng cái nhập nhằng chặng này sinh ra để gỡ.
 */
const NGUYEN_NHAN: Record<string, string> = {
  RESUBMIT_AFTER_EDIT: 'hồ sơ đã sửa, gửi lại',
  TBP_SIGN: 'Trưởng bộ phận đã ký',
  KT_RECEIVE_L1: 'Kế toán đã tiếp nhận L1',
  KT_REQUEST_REPRINT: 'Kế toán yêu cầu in lại',
  SA_HANDOVER: 'Sale Admin đã bàn giao',
  TBP_RETURN: 'Trưởng bộ phận trả lại',
  TBP_RECALL: 'Trưởng bộ phận hoàn duyệt',
  KT_RETURN_L1: 'Kế toán không tiếp nhận L1',
  KT_RETURN_L2: 'Kế toán không tiếp nhận L2',
};

/**
 * Câu của bậc TIN — kể chuyện đã xảy ra, và nói hồ sơ đi đâu tiếp.
 *
 * Xuất ra để ca kiểm DUYỆT HẾT (`0096`): mọi hành động sinh thư phải có một
 * thông báo trỏ đúng chỗ. Ca kiểm lặp trên chính bảng này chứ không chép lại
 * danh sách — chép lại là dựng một bảng thứ hai để hai bên trôi khỏi nhau, đúng
 * bệnh mà cả `0096` sinh ra để tránh.
 *
 * Đây cũng là bảng liệt kê ĐỦ mọi hành động sinh thư, kể cả những hành động
 * không bao giờ có người đọc ở bậc TIN (`SLA_REMINDER` chỉ gửi chủ bước). Giữ
 * đủ vì phép tra rơi về đây khi bậc VIỆC không dựng được câu, và một lá thư
 * không tra được tiêu đề thì in ra câu chung chung ở cuối hàm.
 */
export const TIN_CUA_HANH_DONG: Record<string, string> = {
  SUBMIT: 'Hồ sơ đã gửi duyệt, chờ Trưởng bộ phận ký',
  RESUBMIT_AFTER_EDIT: 'Hồ sơ đã sửa xong và gửi duyệt lại',
  TBP_SIGN: 'Trưởng bộ phận đã ký, hồ sơ sang Kế toán duyệt bản mềm',
  TBP_RETURN: 'Trưởng bộ phận trả lại, hồ sơ về Trình dược viên chỉnh sửa',
  // `0185` — nói rõ hồ sơ ĐÃ ĐI QUA chữ ký rồi bị rút: người nhận có thể đang
  // cầm nó trên bàn mình. Đi cùng nhãn riêng `Dừng xử lý`.
  TBP_RECALL: 'Trưởng bộ phận hoàn duyệt — hồ sơ đã rời bàn bạn',
  KT_RECEIVE_L1: 'Kế toán đã tiếp nhận L1, hồ sơ sang Sale Admin',
  KT_RETURN_L1: 'Kế toán không tiếp nhận L1, hồ sơ về Trình dược viên chỉnh sửa',
  SA_HANDOVER: 'Sale Admin đã bàn giao, chờ Kế toán duyệt bản cứng',
  KT_RECEIVE_L2: 'CSBH bắt đầu có hiệu lực',
  KT_RETURN_L2: 'Kế toán không tiếp nhận L2, hồ sơ về Trình dược viên chỉnh sửa',
  KT_REQUEST_REPRINT: 'Kế toán yêu cầu in lại bản cứng',
  // Người lập bỏ hẳn một hồ sơ đã vào luồng (`0035`, `0039`). Thư đi tới người
  // đã trả lại nó.
  //
  // Tiêu đề KHÔNG nói "bị trả lại": `0039` mở đường xoá cho cả hồ sơ *Từ chối*,
  // nên một tiêu đề đúng cho nửa số trường hợp là tiêu đề sai. `0155` bỏ trạng
  // thái ấy và hôm nay chỉ còn một đường vào — nhưng tiêu đề giữ nguyên, vì thân
  // thư vốn đã ghi rõ trạng thái và mã hồ sơ, và nói "bị trả lại" ở tiêu đề là
  // khẳng định một chuyện mà đường này không kiểm.
  DELETE: 'Trình dược viên đã xoá hồ sơ',
  /*
   * HAI đường làm một CSBH đang hiệu lực hết hiệu lực (`0066`). Cả hai trước đây
   * đều diễn ra trong im lặng — không ai được báo.
   *
   * Tiêu đề nói luôn NGUYÊN NHÂN, không chỉ "đã hết hiệu lực": người nhận cần
   * biết ngay có phải đi làm lại hồ sơ hay không. Có bản thay thế thì không;
   * khách ngừng hợp tác thì cũng không, nhưng vì lý do ngược hẳn.
   *
   * `SUPERSEDE` nói *"phiên bản SAU"* chứ không *"phiên bản MỚI"* (`0192`): chữ
   * *mới* trong hộp thư này đã thuộc về `loaiThayDoi` — *CSBH mới* nghĩa là khách
   * chưa từng có CSBH nào. Một chữ ba nghĩa là một chữ không còn nghĩa nào.
   */
  SUPERSEDE: 'CSBH hết hiệu lực — đã bị phiên bản sau thay thế',
  CUSTOMER_RETIRED: 'CSBH hết hiệu lực — khách hàng ngừng hợp tác',
  /*
   * BỐN nhãn `*_IMPACT` đã bị gỡ ở `0055` cùng với chính lá thư ấy.
   *
   * Chúng phục vụ sự kiện `policy.catalog_impact` — thư báo TDV rằng CSBH đang
   * hiệu lực của họ đã lệch so với danh mục. Khách hàng yêu cầu bỏ thư này; nơi
   * còn nói ra chênh lệch là box *Yêu cầu cập nhật* và khối cảnh báo trên màn
   * hình hồ sơ (`0050`).
   *
   * Ghi lại thay vì xoá lặng lẽ: bốn nhãn ấy là thứ duy nhất còn sót lại để tra
   * ngược ra rằng thư này từng tồn tại.
   */
  SLA_REMINDER: 'Hồ sơ sắp quá hạn duyệt',
  /*
   * `SLA_OVERDUE` là bậc TIN với MỌI người nhận, và câu chữ phải nói ra vì sao
   * (`0192`).
   *
   * `QUA_HAN_DUYET` là trạng thái KẾT THÚC từ `0047` — không ai thao tác được
   * nữa — nên nó không có chủ bước, nên không ai ở bậc VIỆC. Tiêu đề cũ (*"Hồ sơ
   * đã quá hạn duyệt"*) đọc như một lời giục, và nằm ngay cạnh thư nhắc nên
   * trông như cùng một thang độ gấp. Thật ra giữa hai lá là một lằn ranh cứng.
   */
  SLA_OVERDUE: 'Hồ sơ đã quá hạn duyệt — không thao tác được nữa',
  SLA_DISCARDED: 'Hệ thống đã xoá hồ sơ quá hạn',
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
  /**
   * `0190` — số phiên bản của hồ sơ, nguồn của dòng *Loại thay đổi*.
   *
   * Tuỳ chọn vì hai lá thư KHÔNG nói về một hồ sơ đang đi trong luồng cũng dùng
   * chung khung này: `policy.superseded` nói về bản CŨ vừa hết hiệu lực, và thư
   * bàn giao khách hàng thì không đi qua `bodyFor`. Thiếu nó thì dòng ấy vắng
   * mặt, không phải in ra một câu đoán bừa.
   */
  versionNo?: number | undefined;
  extra?: Record<string, string> | undefined;
};

/*
 * `MailEvent.chiDeBiet` ĐÃ GỠ ở `0192`, và chỗ trống này để lại có chủ ý.
 *
 * Nó mang đúng nghĩa mà `Bac` mang bây giờ — *người nhận KHÔNG phải xử lý gì ở
 * bước này* (`0036`) — nhưng nó là một TRƯỜNG TUỲ CHỌN trên thân sự kiện, nên
 * quên đặt là lặng lẽ rơi về `false`, tức lặng lẽ nói với người không có việc
 * rằng họ có việc. Đúng hướng nguy hiểm của hai hướng.
 *
 * Giờ bậc là THAM SỐ BẮT BUỘC của cả ba hàm dựng chữ (`titleFor`, `duongDan`,
 * `bodyFor`), nên `tsc` chỉ ra mọi nơi gọi. Bài học `0143`: một kiểu dữ liệu bắt
 * buộc mạnh hơn mọi ca kiểm quét mã nguồn.
 */

/**
 * Thư BÀN GIAO KHÁCH HÀNG (`0085`) — lá thư duy nhất không nói về một hồ sơ.
 *
 * Nên nó cũng là lá thư duy nhất KHÔNG đi qua `bodyFor`. Khung sáu trường của
 * NTF-02 là khung của một hồ sơ; ép lá thư này vào đó thì người nhận đọc được
 * "Mã hồ sơ CSBH: —", "Trạng thái: —", "Bước đang duyệt: Không còn bước nào phải
 * xử lý" — ba dòng vô nghĩa đứng trên đúng thứ họ cần biết.
 */
export type BanGiaoMail = {
  fromName?: string | null | undefined;
  count: number;
  customers: { code: string; name: string }[];
  at?: string | undefined;
};

/**
 * Đường dẫn của thư bàn giao. Danh sách khách, không phải một khách cụ thể — lá
 * thư này nói về cả một TẬP khách hàng, và tên từng người đã nằm trong thân thư.
 */
export const DUONG_BAN_GIAO = '/khach-hang';

/** Tiêu đề trần, không có tiền tố `[CSBH]`. Cái chuông dùng lại đúng câu này. */
export const titleBanGiao = (e: BanGiaoMail): string =>
  `Bạn được bàn giao ${e.count} khách hàng`;

export const subjectBanGiao = (e: BanGiaoMail): string => `[CSBH] ${titleBanGiao(e)}`;

/** Dòng phụ của thông báo bàn giao. `null` khi không biết người bàn giao là ai. */
export const moTaBanGiao = (e: BanGiaoMail): string | null =>
  e.fromName ? `từ ${e.fromName}` : null;

export function bodyBanGiao(e: BanGiaoMail, webBaseUrl: string): string {
  const tu = e.fromName ? ` từ ${e.fromName}` : '';
  const lines = [
    `Bạn vừa được bàn giao ${e.count} khách hàng${tu}.`,
    '',
    `Thời điểm: ${formatIct(e.at)}`,
    '',
    'Danh sách khách hàng:',
  ];
  for (const k of e.customers) lines.push(`  · ${k.code} — ${k.name}`);
  // Nói ra phần bị cắt. Một danh sách dừng ở dòng thứ 100 mà không giải thích
  // đọc ra là "đúng 100 khách", và người nhận đi đối chiếu thiếu mất phần đuôi.
  if (e.count > e.customers.length) {
    lines.push(`  … và ${e.count - e.customers.length} khách nữa`);
  }
  lines.push(
    '',
    `Xem danh sách khách hàng: ${webBaseUrl}${DUONG_BAN_GIAO}`,
    '',
    'Thư tự động từ phần mềm Chính sách bán hàng Nutricare.',
  );
  return lines.join('\n');
}

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

/**
 * Tiêu đề của MỘT người đọc ở MỘT bậc (`0192`, câu chữ rút gọn ở `0195`).
 *
 * Hình dạng bậc VIỆC: `Phiên bản 4: Duyệt và ký số — Trưởng bộ phận đã ký`. Hai
 * mảnh, và thứ tự của chúng là một phép đo chứ không phải một sở thích:
 *
 *   1. **loại thay đổi** — phần BIẾN THIÊN giữa các hồ sơ của cùng một người;
 *   2. **việc phải làm** — phần KHÔNG ĐỔI trong hàng đợi của một vai trò.
 *
 * Trong hàng đợi của Trưởng bộ phận, mọi hồ sơ đều là *"Duyệt và ký số"*, nên
 * mảnh 2 gần như không mang thông tin phân biệt nào; mảnh 1 thì mang. Chủ đề thư
 * bị điện thoại cắt ở chừng 35 ký tự, và cách xếp này giữ được mảnh 1 trong phần
 * còn lại. `0195` gỡ nhãn bậc khỏi đầu chuỗi nên lập luận ấy MẠNH LÊN: mảnh biến
 * thiên giờ đứng ngay ký tự đầu tiên.
 *
 * LOẠI THAY ĐỔI CHỈ Ở BẬC VIỆC. Dòng `Loại thay đổi` trong thân thư vẫn có ở mọi
 * bậc (xem `bodyFor`) — chỗ đứng nổi bật thì dành cho người đang phải quyết định
 * dựa vào nó.
 *
 * Tra không ra VIỆC thì mượn câu của bậc TIN. Nhánh ấy KHÔNG ĐẾN ĐƯỢC trong thực
 * tế — `VIEC_CUA_BUOC` khớp đúng tập khoá của `CHU_BUOC`, mà `bac === 'VIEC'`
 * nghĩa là người đọc là chủ bước của `toStatus` — nên nó là lưới đỡ cho sự kiện
 * cũ trong DLQ, không phải một ca thường. Tới `0192` nhãn bậc còn che được nó;
 * từ `0195` thì không, nên có ca kiểm đối chiếu hai bảng đứng canh đúng chỗ ấy.
 */
export function titleFor(e: MailEvent, bac: Bac): string {
  const act = e.action ?? '';
  const tin = TIN_CUA_HANH_DONG[act] ?? 'Cập nhật hồ sơ Chính sách bán hàng';

  if (bac === 'TIN') {
    const rieng = NHAN_TIN_RIENG[act];
    return rieng ? `${rieng}: ${tin}` : tin;
  }

  const loai = loaiThayDoiNgan(e);
  const rieng = NHAN_VIEC_RIENG[act];
  // Cả hai cùng có thì loại thay đổi vào ngoặc, giữ đúng hình dạng `0192` đã đo.
  // Không có mảnh nào thì tiêu đề bắt đầu thẳng bằng việc phải làm — không có
  // dấu hai chấm mồ côi ở đầu chuỗi.
  const dau = rieng && loai ? `${rieng} (${loai})` : (rieng ?? loai);

  const viec = VIEC_CUA_BUOC[(e.toStatus ?? '') as Status];
  const viSao = viec ? NGUYEN_NHAN[act] : undefined;
  const than = viec ? (viSao ? `${viec} — ${viSao}` : viec) : tin;

  return dau ? `${dau}: ${than}` : than;
}

/**
 * Tiêu đề mang tên khách hàng để người nhận nhận ra hồ sơ ngay ở danh sách thư.
 *
 * Tiền tố `[CSBH]` GIỮ LẠI ở `0192` dù nó không mang thông tin nào — mọi thư của
 * phần mềm đều là CSBH. Nó là thứ người dùng có thể đã đặt luật lọc hộp thư
 * theo, và bỏ nó là làm chết những luật ấy ở đúng lượt nâng cấp. Bỏ hay giữ là
 * quyết định của khách hàng, không phải một khoản dọn dẹp kèm theo.
 */
export const subjectFor = (e: MailEvent, bac: Bac): string =>
  `[CSBH] ${titleFor(e, bac)} — ${e.customerName ?? 'Khách hàng'}`;

/**
 * Một chuỗi có phải MỐC THỜI GIAN dạng ISO-8601 không (`0066`, M-01).
 *
 * Dùng để nhận ra những giá trị trong `extra` cần đổi sang giờ Việt Nam. Đây
 * không phải phép đoán mò: `extra` chỉ mang chuỗi, và một chuỗi khớp đúng khuôn
 * này thì đích thị là dấu thời gian máy sinh ra — người dùng không gõ tay
 * `2026-09-03T07:00:00.000Z` vào bất kỳ ô nào của phần mềm.
 *
 * VÌ SAO ĐỔI Ở ĐÂY chứ không ở nơi phát sự kiện: thân sự kiện là dữ liệu MÁY
 * ĐỌC — nó nằm lại trong `pol.outbox`, trong hàng thư hỏng, và được đọc lại khi
 * gửi bù. Giờ địa phương thuộc về CÁCH TRÌNH BÀY, và lá thư là nơi duy nhất có
 * người đọc. Đúng luật đang áp cho trường `at`.
 */
const LA_MOC_THOI_GIAN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Lá thư này dẫn đi ĐÂU — đường dẫn tương đối, không kèm gốc.
 *
 * `/ho-so/:id`, KHÔNG phải `/policies/:id`. Đường cũ là đường của API, không
 * phải của giao diện — `App.tsx` không bắt nó, nên mọi liên kết trong mọi lá thư
 * từ trước tới nay đều dẫn tới màn hình "Không có màn hình nào ở địa chỉ này".
 * Sửa ở `0036`.
 *
 * TÁCH RA KHỎI `bodyFor` ở `0096`, và đó là cả điểm của hàm này. Khách hàng
 * chốt rằng bấm vào một thông báo trên web phải tới ĐÚNG chỗ mà liên kết trong
 * thư dẫn tới. Nếu thư tự dựng đường của nó còn cái chuông tự dựng đường của
 * cái chuông thì hai bên khớp nhau bằng lời hứa, và lời hứa ấy hỏng ở lượt sửa
 * thứ hai — im lặng, vì không màn hình nào báo rằng mình vừa mở nhầm hồ sơ.
 * Một hàm, hai nơi gọi, một ca kiểm so hai bên với nhau.
 *
 * Trả `/` khi thiếu `policyId` — sự kiện cũ trong DLQ có thể thiếu, và một liên
 * kết về trang chủ vẫn dùng được, khác hẳn một liên kết `/ho-so/undefined`.
 */
export function duongDan(e: MailEvent, bac: Bac): string {
  if (!e.policyId) return '/';
  // Người chỉ cần BIẾT thì mở hồ sơ ra chẳng có nút nào bấm được; thứ họ muốn
  // là "từ lúc tôi rời tay, hồ sơ đã đi qua những đâu" — và đó là nhật ký (`0036`).
  //
  // `0192` đổi ĐIỀU KIỆN chứ không đổi luật: trước đây câu hỏi là *"đây có phải
  // lá thư thứ hai không"*, giờ là *"người đọc có việc không"*. Lập luận trên
  // vốn viết cho vế sau — nó chỉ tình cờ đúng với vế trước, và thôi đúng ở đúng
  // những người có tên trên hồ sơ mà không phải chủ bước.
  return bac === 'TIN' ? `/ho-so/${e.policyId}/nhat-ky` : `/ho-so/${e.policyId}`;
}

/**
 * Dòng phụ của một thông báo: khách hàng, rồi mã hồ sơ.
 *
 * Khách hàng đứng TRƯỚC vì đó là thứ người nhận nhận ra — cùng lý do khiến tên
 * khách hàng nằm trong tiêu đề thư. Mã hồ sơ đứng sau, cho người cần đối chiếu.
 */
/**
 * LOẠI THAY ĐỔI — CSBH mới, hay bản thay thế một CSBH đang hiệu lực (`0190`).
 *
 * Khách hàng chốt 08/09. Phân biệt bằng `version_no`: `create` đặt nó bằng 1 khi
 * khách hàng chưa có CSBH nào, và bằng `bản đang hiệu lực + 1` khi có — cùng câu
 * lệnh đặt luôn `supersedes_id`, nên hỏi một trong hai là đủ.
 *
 * NÓI RA CẢ HỆ QUẢ, không chỉ gọi tên: người duyệt đọc thư để biết mình sắp phải
 * làm gì, và hai loại này đòi hai việc khác nhau — bản đầu không có gì để đối
 * chiếu, bản thay thế thì phải soi xem nó đổi gì so với thứ khách hàng đang
 * được hưởng.
 *
 * `undefined` trả `null` chứ không đoán: xem `MailEvent.versionNo`.
 */
export function loaiThayDoi(e: MailEvent): string | null {
  if (e.versionNo === undefined) return null;
  return e.versionNo <= 1
    ? 'CSBH mới — khách hàng chưa có CSBH nào trước đó'
    : `Phiên bản ${e.versionNo} — chỉnh sửa/bổ sung, thay thế CSBH đang hiệu lực`;
}

/**
 * Dạng NGẮN của cùng câu ấy (`0190`) — từ `0192` là mảnh thứ hai của TIÊU ĐỀ
 * bậc VIỆC, không còn là vế đuôi của dòng phụ.
 */
export const loaiThayDoiNgan = (e: MailEvent): string | null =>
  e.versionNo === undefined ? null : e.versionNo <= 1 ? 'CSBH mới' : `Phiên bản ${e.versionNo}`;

export function moTaNgan(e: MailEvent): string | null {
  const khach = [e.customerCode, e.customerName].filter(Boolean).join(' — ');
  /*
   * HAI VẾ, không ba (`0192` — `0190` để loại thay đổi ở cuối dòng này).
   *
   * Lập luận của `0190` — *"hai vế đầu là thứ người dùng dò để tìm đúng hồ sơ,
   * còn vế này là thứ họ đọc sau khi đã tìm thấy"* — không sai, và nó vẫn đứng
   * sau `0195`: dòng phụ là chỗ phân biệt HỒ SƠ (khách nào, mã nào), còn loại
   * thay đổi phân biệt PHIÊN BẢN. Vế thứ ba đứng ở chỗ ấy mà không giúp phân biệt
   * gì, và nó không mất đi — nó lên tiêu đề, giờ ở ngay ký tự đầu.
   *
   * Nó không mất đi — nó lên tiêu đề, nơi chủ đề thư nhìn thấy được.
   */
  return [khach, e.policyCode].filter(Boolean).join(' · ') || null;
}

export function bodyFor(e: MailEvent, bac: Bac, webBaseUrl: string): string {
  const link = `${webBaseUrl}${duongDan(e, bac)}`;
  const status = STATUS_LABEL[e.toStatus ?? ''] ?? e.toStatus ?? '—';
  const step = STEP_LABEL[e.pendingStep ?? e.toStatus ?? ''] ?? 'Không còn bước nào phải xử lý';

  /*
   * Dựng danh sách CẶP nhãn–giá trị rồi mới căn cột, thay vì viết sẵn khoảng
   * trắng vào từng chuỗi (`0066`, M-03).
   *
   * Bản cũ đệm tay đúng bảy dòng cố định, còn các dòng của `extra` thì in
   * `${k}: ${v}` — nên "Hạn xử lý" và "Số ngày quá hạn" nằm lệch hẳn khỏi cột
   * của bảy dòng trên, và thân thư trông như bị vá thêm ở cuối.
   *
   * Căn theo nhãn DÀI NHẤT THỰC TẾ CÓ trong lá thư này: thêm một khoá `extra`
   * dài hơn "Bước đang duyệt" thì cả khối tự giãn ra, không ai phải nhớ đi sửa
   * lại bảy chuỗi đệm tay.
   */
  const truong: [string, string][] = [
    ['Mã khách hàng', e.customerCode ?? '—'],
    ['Tên khách hàng', e.customerName ?? '—'],
    ['Mã hồ sơ CSBH', e.policyCode ?? '—'],
    ['Trạng thái', status],
    ['Bước đang duyệt', step],
    ['Thời điểm', formatIct(e.at)],
  ];

  /*
   * `0190` — LOẠI THAY ĐỔI, chèn ngay SAU mã hồ sơ.
   *
   * Chỗ đứng là một phần của yêu cầu: nó trả lời câu *"hồ sơ này là gì"*, nên nó
   * thuộc cụm định danh ở đầu thư, không phải cụm trạng thái. Đẩy xuống cuối thì
   * người đọc đã quyết định xong mình phải làm gì trước khi đọc tới nó.
   *
   * `splice` thay vì viết thẳng vào mảng khai ở trên: dòng này CÓ THỂ VẮNG MẶT
   * (xem `MailEvent.versionNo`), và một phần tử `null` lọt vào mảng cặp sẽ in ra
   * `Loại thay đổi: —` ở đúng những lá thư không nói về một hồ sơ nào.
   */
  const loai = loaiThayDoi(e);
  if (loai) truong.splice(3, 0, ['Loại thay đổi', loai]);

  // Lý do chỉ có mặt khi thật sự có — dòng "Lý do: —" trong thư báo ký số thành
  // công làm người đọc tưởng có chuyện.
  if (e.reason) truong.push(['Lý do', e.reason]);
  for (const [k, v] of Object.entries(e.extra ?? {})) {
    truong.push([k, LA_MOC_THOI_GIAN.test(v) ? formatIct(v) : v]);
  }

  const cot = Math.max(...truong.map(([k]) => k.length)) + 2;
  const lines = [titleFor(e, bac), '', ...truong.map(([k, v]) => `${`${k}:`.padEnd(cot)}${v}`)];

  if (bac === 'TIN') {
    lines.push(
      '',
      /*
       * `0195` — đoạn này thành CHỖ DUY NHẤT lá thư nói thẳng ra bậc.
       *
       * Trên màn hình bậc đọc bằng màu, nhưng hộp thư không có dải màu nào; sau
       * khi nhãn tiêu đề đi, cái còn phân biệt hai bậc trong hộp thư là ngữ pháp
       * của tiêu đề (mệnh lệnh / lời kể) cộng đúng hai dòng này. Đừng gỡ chúng
       * kèm một lượt dọn câu chữ: chúng không còn là phần thừa nữa.
       */
      // `0192` bỏ vế *"vì đã từng thao tác trên hồ sơ"*: câu ấy đúng khi bậc TIN
      // chỉ gồm người đọc ra từ nhật ký, và thành SAI ngay khi nhóm này nhận
      // thêm những người CÓ TÊN trên hồ sơ mà không phải chủ bước — TBP và TDV ở
      // `KT_RECEIVE_L1` chưa từng phải thao tác gì để có mặt ở đây.
      'Thư này chỉ để bạn biết — bạn KHÔNG phải xử lý gì ở bước này. Bạn nhận nó',
      'vì có liên quan tới hồ sơ.',
    );
  }

  lines.push(
    '',
    // "Lịch sử" chứ không "nhật ký" (`0061`): phần mềm còn một *Nhật ký* nữa —
    // nhật ký kiểm toán toàn hệ thống — và thư này gửi cho người không có việc,
    // đúng nhóm dễ hiểu nhầm là mình được mời đi xem sổ kiểm toán nhất.
    bac === 'TIN' ? `Xem lịch sử hồ sơ: ${link}` : `Mở hồ sơ: ${link}`,
    '',
    'Thư tự động từ phần mềm Chính sách bán hàng Nutricare.',
  );
  return lines.join('\n');
}
