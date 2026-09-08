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
 * Xuất ra để ca kiểm DUYỆT HẾT (`0096`): mọi hành động sinh thư phải có một
 * thông báo trỏ đúng chỗ. Ca kiểm lặp trên chính bảng này chứ không chép lại
 * danh sách — chép lại là dựng một bảng thứ hai để hai bên trôi khỏi nhau, đúng
 * bệnh mà cả `0096` sinh ra để tránh.
 */
export const TITLE: Record<string, string> = {
  SUBMIT: 'Hồ sơ CSBH mới chờ duyệt',
  RESUBMIT_AFTER_EDIT: 'Hồ sơ đã chỉnh sửa, chờ duyệt lại',
  TBP_SIGN: 'Trưởng bộ phận đã ký số, chuyển sang Kế toán tiếp nhận',
  TBP_RETURN: 'Hồ sơ bị trả lại để chỉnh sửa',
  // `0185` — nói rõ hồ sơ ĐÃ ĐI QUA chữ ký rồi bị rút: người nhận có thể đang
  // cầm nó trên bàn mình.
  TBP_RECALL: 'Trưởng bộ phận hoàn duyệt — hồ sơ quay lại để chỉnh sửa',
  KT_RECEIVE_L1: 'Kế toán đã tiếp nhận lần 1',
  KT_RETURN_L1: 'Kế toán không tiếp nhận lần 1',
  SA_HANDOVER: 'Sale Admin đã bàn giao bản cứng',
  KT_RECEIVE_L2: 'Kế toán đã tiếp nhận lần 2 — CSBH bắt đầu có hiệu lực',
  KT_RETURN_L2: 'Kế toán không tiếp nhận lần 2',
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
   * biết ngay có phải đi làm lại hồ sơ hay không. Có bản mới thay thế thì không;
   * khách ngừng hợp tác thì cũng không, nhưng vì lý do ngược hẳn.
   */
  SUPERSEDE: 'CSBH đã hết hiệu lực do có phiên bản mới thay thế',
  CUSTOMER_RETIRED: 'CSBH đã hết hiệu lực do khách hàng ngừng hợp tác',
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
  SLA_REMINDER: 'Nhắc: hồ sơ sắp quá hạn duyệt',
  SLA_OVERDUE: 'Hồ sơ đã quá hạn duyệt',
  SLA_DISCARDED: 'Hồ sơ quá hạn đã bị hệ thống xoá',
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
  /**
   * Thư "để biết" — người nhận KHÔNG phải xử lý gì ở bước này (`0036`).
   *
   * Đổi hai thứ trong thân thư: một dòng nói thẳng họ không phải làm gì, và
   * liên kết trỏ vào NHẬT KÝ thay vì vào hồ sơ. Người không có việc mà mở hồ sơ
   * ra sẽ thấy một màn hình không nút nào bấm được, còn thứ họ thật sự muốn
   * biết — hồ sơ đã đi qua những đâu từ lúc mình rời tay — thì nằm ở nhật ký.
   */
  chiDeBiet?: boolean | undefined;
};

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

export const titleFor = (e: MailEvent): string =>
  TITLE[e.action ?? ''] ?? 'Cập nhật hồ sơ Chính sách bán hàng';

/** Tiêu đề mang tên khách hàng để người nhận nhận ra hồ sơ ngay ở danh sách thư. */
export const subjectFor = (e: MailEvent): string =>
  `[CSBH] ${titleFor(e)} — ${e.customerName ?? 'Khách hàng'}`;

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
export function duongDan(e: MailEvent): string {
  if (!e.policyId) return '/';
  // Người chỉ cần BIẾT thì mở hồ sơ ra chẳng có nút nào bấm được; thứ họ muốn
  // là "từ lúc tôi rời tay, hồ sơ đã đi qua những đâu" — và đó là nhật ký (`0036`).
  return e.chiDeBiet ? `/ho-so/${e.policyId}/nhat-ky` : `/ho-so/${e.policyId}`;
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

/** Dạng NGẮN của cùng câu ấy, cho dòng thông báo trên chuông (`0190`). */
export const loaiThayDoiNgan = (e: MailEvent): string | null =>
  e.versionNo === undefined ? null : e.versionNo <= 1 ? 'CSBH mới' : `Phiên bản ${e.versionNo}`;

export function moTaNgan(e: MailEvent): string | null {
  const khach = [e.customerCode, e.customerName].filter(Boolean).join(' — ');
  // `0190` — loại thay đổi đứng CUỐI: hai vế đầu là thứ người dùng dò để tìm
  // đúng hồ sơ trong danh sách chuông, còn vế này là thứ họ đọc sau khi đã tìm
  // thấy. Đảo lên trước thì mọi dòng thông báo mở đầu giống hệt nhau.
  return [khach, e.policyCode, loaiThayDoiNgan(e)].filter(Boolean).join(' · ') || null;
}

export function bodyFor(e: MailEvent, webBaseUrl: string): string {
  const link = `${webBaseUrl}${duongDan(e)}`;
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
  const lines = [titleFor(e), '', ...truong.map(([k, v]) => `${`${k}:`.padEnd(cot)}${v}`)];

  if (e.chiDeBiet) {
    lines.push(
      '',
      'Thư này chỉ để bạn biết — bạn KHÔNG phải xử lý gì ở bước này. Bạn nhận nó',
      'vì đã từng thao tác trên hồ sơ.',
    );
  }

  lines.push(
    '',
    // "Lịch sử" chứ không "nhật ký" (`0061`): phần mềm còn một *Nhật ký* nữa —
    // nhật ký kiểm toán toàn hệ thống — và thư này gửi cho người không có việc,
    // đúng nhóm dễ hiểu nhầm là mình được mời đi xem sổ kiểm toán nhất.
    e.chiDeBiet ? `Xem lịch sử hồ sơ: ${link}` : `Mở hồ sơ: ${link}`,
    '',
    'Thư tự động từ phần mềm Chính sách bán hàng Nutricare.',
  );
  return lines.join('\n');
}
