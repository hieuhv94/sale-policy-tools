/**
 * Tập trường nguồn mà người soạn mẫu được phép ánh xạ tới, và định dạng của chúng.
 *
 * Danh sách ĐÓNG, khai ở một chỗ, và dùng cho cả hai việc: kiểm lúc lưu ánh xạ
 * (DOC-29) và trộn lúc xuất. Một danh sách dùng cho cả hai là cách duy nhất bảo
 * đảm "lưu được thì xuất được" — hai danh sách sẽ lệch nhau vào ngày thêm trường
 * mới, và lệch theo hướng tệ nhất: ánh xạ lưu thành công rồi xuất mới báo lỗi.
 *
 * Định dạng tiền, ngày và phần trăm áp TẠI ĐÂY, không ở tầng nào khác (Hình 4).
 * Riêng phần trăm phải khớp từng ký tự với con số trên hồ sơ CSBH — cùng phép
 * làm tròn hai chữ số đã chốt ở muc 7 (DOC-31).
 */
import type { CustomerFull, PolicyFull } from '../infra/clients.js';
import { dmy, money, pct, STATUS_LABEL } from './dinh-dang.js';

export type Format = 'text' | 'money_vnd' | 'date_dmy' | 'percent_2';

type Ctx = {
  policy: PolicyFull;
  customer: CustomerFull;
  people: Record<string, string>;
};

/**
 * Trường đơn: một hồ sơ ra một giá trị.
 *
 * KHOÁ VIẾT BẰNG TIẾNG VIỆT từ `0056`. Trước đó là `customer.name`,
 * `policy.applied_date`, `person.tdv` — tên bảng dữ liệu, không phải tên thứ mà
 * người soạn mẫu đang tìm.
 *
 * MỘT NHÓM `ho_so.` cho tất cả, kể cả thông tin khách hàng và người xử lý.
 * Người soạn mẫu nghĩ theo câu hỏi "trong hồ sơ này có gì", không nghĩ theo
 * lược đồ CSDL; tách `khach_hang.` ra riêng là bắt họ học một cách chia mà chỉ
 * hệ thống mới cần.
 *
 * `cong_ty.` đứng riêng vì nó KHÔNG thuộc hồ sơ — nó giống nhau ở mọi hồ sơ.
 */
const SCALAR: Record<string, (c: Ctx) => string | null> = {
  // --- Thông tin chung của hồ sơ ---
  'ho_so.ma_ho_so': (c) => c.policy.code,
  'ho_so.phien_ban': (c) => String(c.policy.version_no),
  'ho_so.trang_thai': (c) => STATUS_LABEL[c.policy.status] ?? c.policy.status,
  'ho_so.ngay_ap_dung': (c) => c.policy.applied_date ?? c.policy.effective_from,
  'ho_so.ngay_hieu_luc': (c) => c.policy.effective_from,
  'ho_so.tep_dinh_kem': (c) =>
    c.policy.attachments.length === 0
      ? 'Không có file đính kèm'
      : c.policy.attachments.map((a) => `${a.file_name} (${a.kind})`).join('; '),

  // --- Khách hàng TRONG hồ sơ ---
  'ho_so.ma_khach_hang': (c) => c.customer.code,
  'ho_so.ten_khach_hang': (c) => c.customer.name,
  'ho_so.ma_so_thue': (c) => c.customer.idNumber,
  'ho_so.dia_chi_dang_ky': (c) => c.customer.registeredAddress,
  'ho_so.noi_nhan_hang': (c) => c.customer.deliveryAddress ?? c.customer.registeredAddress,
  'ho_so.nguoi_dai_dien': (c) => c.customer.ownerName,
  // `0128` — số điện thoại khách hàng. Đóng băng vào hồ sơ lúc gửi duyệt, nên
  // `c.customer` ở đây có thể là ảnh chụp; xem `khachHangCua`.
  'ho_so.dien_thoai': (c) => c.customer.phone ?? null,
  'ho_so.chuc_danh_dai_dien': (c) => c.customer.ownerTitle,
  'ho_so.cong_no': (c) => c.customer.debt,

  // --- Người xử lý hồ sơ ---
  'ho_so.nguoi_de_nghi': (c) => c.people['TDV'] ?? null,
  'ho_so.truong_bo_phan': (c) => c.people['TBP'] ?? null,
  'ho_so.ke_toan': (c) => c.people['KE_TOAN'] ?? null,
  'ho_so.sale_admin': (c) => c.people['SALE_ADMIN'] ?? null,
  'ho_so.ngay_tbp_ky': (c) => c.policy.tbp_signed_at,
  'ho_so.ngay_kt_nhan_l1': (c) => c.policy.kt_l1_received_at,
  'ho_so.ngay_kt_nhan_l2': (c) => c.policy.kt_l2_received_at,

  /**
   * KHỐI CHỮ KÝ SỐ của Trưởng bộ phận (`0056`) — HAI DÒNG.
   *
   * Trả về chuỗi có `\n`, và `setParagraphText` đã đổi nó thành `<w:br/>` từ
   * trước, nên hai dòng ra đúng hai dòng trên giấy.
   *
   * CHƯA KÝ thì trả về RỖNG, không phải "chưa ký". Một khối chữ ký trên văn bản
   * chưa ký là một tuyên bố sai — và bản CSBH ở trạng thái Nháp vẫn xem được,
   * nên tình huống này xảy ra hằng ngày.
   */
  'ho_so.chu_ky_so_TBP': (c) =>
    c.policy.tbp_signed_at === null ? '' : `TBP đã ký số\n${dmy(c.policy.tbp_signed_at)}`,

  /*
   * NHÓM `cong_ty.` ĐÃ BỎ (`0067`).
   *
   * Tên, địa chỉ và mã số thuế của Công ty là CỐ ĐỊNH — giống nhau ở mọi hồ sơ,
   * mọi mẫu, mọi thời điểm. Người soạn mẫu gõ thẳng vào file Word là xong.
   *
   * Một ô trống cho một giá trị không bao giờ đổi chỉ thêm đúng một bước có thể
   * sai: quên ánh xạ nó thì bản in ra mang chuỗi `{{cong_ty.ten}}` ở ngay dòng
   * đầu tiên — chỗ dễ thấy nhất của một văn bản đem đi ký.
   *
   * Hệ quả đã chấp nhận: mục *thông tin công ty* do người soạn tự chịu trách
   * nhiệm — mục đầu tiên của muc 11.1 rơi ra khỏi phép kiểm tự động, `0084` thêm
   * mục thứ hai, `0102` thêm hai mục nữa. Con số hiện thời ghi ở
   * `NGUON_BAT_BUOC_HO_SO` bên dưới.
   */
  ngay_in: () => new Date().toISOString(),
};

/*
 * NHÓM `san_pham.` ĐÃ BỎ (`0067`).
 *
 * Nó là nhóm trường THEO DÒNG, phục vụ bảng do người soạn VẼ TAY trong mẫu hợp
 * đồng: dòng bảng nào mang khoá thuộc nhóm này thì `mergeDocx` nhân bản nó ra
 * cho từng sản phẩm.
 *
 * Từ `0067` mẫu hợp đồng cũng đặt `{{bang_san_pham}}` như mẫu hồ sơ, và hệ
 * thống dựng cả bảng — kèm quyền chọn cột cho riêng từng mẫu. Nên cơ chế nhân
 * bản dòng không còn ai dùng, và nó đi cùng nhóm khoá này.
 *
 * Bỏ chứ không để lại: một cơ chế không ai dùng mà vẫn chạy là một cơ chế sẽ
 * hỏng lặng lẽ — không ca kiểm thử nào của người dùng thật đi qua nó nữa.
 */

export const KNOWN_SOURCES: string[] = Object.keys(SCALAR);

/**
 * TRƯỜNG NÀO PHẢI CÓ DỮ LIỆU LÚC GỬI DUYỆT (`0104`, chốt 24/08).
 *
 * Khách hàng đặt yêu cầu bằng một câu: *"lúc duyệt hồ sơ kiểm tra đủ tất cả các
 * trường trong bảng hướng dẫn ánh xạ, chưa đủ thì chưa cho gửi duyệt"*. Đọc theo
 * nghĩa đen thì nó CHẶN MỌI LƯỢT GỬI, vì bảy trường dưới đây chưa tồn tại lúc
 * gửi — chúng do các bước B3…B10 sinh ra. Bảng này là chỗ phân biệt.
 *
 * Bốn nhóm, và mỗi khoá của `SCALAR` phải nằm trong đúng một nhóm:
 *
 *   `luon-co`     Không thể rỗng — cột `NOT NULL` ở nguồn, hoặc có câu thay thế
 *                 (`tep_dinh_kem` in *"Không có file đính kèm"*; `noi_nhan_hang`
 *                 rơi về địa chỉ đăng ký). Không cần chặn, và chặn cũng vô nghĩa.
 *   `chan-moi`    Có thể rỗng, TDV sửa được, và rỗng thì bản CSBH in ra một ô
 *                 trắng. Đây là thứ `0104` thêm chốt chặn — xem `workflow.service`.
 *   `chan-san`    Đã có chốt chặn từ trước `0104`, ở chỗ khác. Chỉ `truong_bo_phan`
 *                 (muc 2.9: chưa gán TBP thì không gửi được).
 *   `dien-sau`    Rỗng lúc gửi là ĐÚNG. Bước nào sinh ra thì ghi trong bảng dưới.
 *
 * BẢY TRƯỜNG `dien-sau` VẪN Ở LẠI TRONG `SCALAR` (chốt 24/08). Đã cân nhắc gỡ
 * chúng khỏi danh mục ánh xạ cho gọn, rồi bỏ ý ấy: chúng chính là KHỐI PHÊ DUYỆT
 * của tờ CSBH — tên kế toán, ngày duyệt, khối chữ ký số. Gỡ đi thì bản đã duyệt
 * in ra không còn chỗ nào nói ai duyệt và duyệt lúc nào, ba mẫu bàn giao thành
 * mẫu không lưu lại được (`400 SOURCE_UNKNOWN`), và `0103` mất luôn chỗ dựa của
 * nó — nó bỏ bản lưu ký số VÌ chữ ký vẫn hiện trên bản mềm.
 *
 * Nói cách khác: *"chưa biết lúc gửi"* và *"không được phép in"* là hai câu hỏi
 * khác nhau, và bảng này chỉ trả lời câu thứ nhất.
 *
 * `tests/http/policy.test.ts` đối chiếu bảng này với `KNOWN_SOURCES` cả hai
 * chiều, và đối chiếu nhóm `chan-moi` với danh sách mà `policy` thật sự chặn.
 * Thêm một khoá vào `SCALAR` mà quên xếp nhóm là ĐỎ — tức là bị buộc phải trả
 * lời "trường này bắt buộc lúc gửi, hay điền sau?".
 */
export type NhomTruong = 'luon-co' | 'chan-moi' | 'chan-san' | 'dien-sau';

export const NHOM_TRUONG: Record<string, NhomTruong> = {
  // --- Luôn có -------------------------------------------------------------
  'ho_so.ma_ho_so': 'luon-co', //           pol.policy.code NOT NULL
  'ho_so.phien_ban': 'luon-co', //          version_no NOT NULL
  'ho_so.trang_thai': 'luon-co', //         luôn là một trạng thái
  'ho_so.tep_dinh_kem': 'luon-co', //       rỗng thì in "Không có file đính kèm"
  'ho_so.ma_khach_hang': 'luon-co', //      cus.customer.code NOT NULL
  'ho_so.ten_khach_hang': 'luon-co', //     name NOT NULL
  'ho_so.dia_chi_dang_ky': 'luon-co', //    registered_address NOT NULL
  'ho_so.noi_nhan_hang': 'luon-co', //      rỗng thì rơi về địa chỉ đăng ký
  'ho_so.nguoi_dai_dien': 'luon-co', //     owner_name NOT NULL
  'ho_so.cong_no': 'luon-co', //            debt NOT NULL DEFAULT 0
  'ho_so.nguoi_de_nghi': 'luon-co', //      hồ sơ luôn có TDV phụ trách
  ngay_in: 'luon-co', //                    now()

  // --- Chặn lúc gửi duyệt --------------------------------------------------
  'ho_so.ma_so_thue': 'chan-moi', //        cus.customer.id_number NULL được
  'ho_so.chuc_danh_dai_dien': 'chan-moi', //owner_title NULL được
  'ho_so.dien_thoai': 'chan-moi', //        cus.customer.phone NULL được (`0128`)
  'ho_so.ngay_ap_dung': 'chan-moi', //      applied_date NULL được ở máy chủ

  // --- Đã chặn sẵn ---------------------------------------------------------
  'ho_so.truong_bo_phan': 'chan-san', //    muc 2.9, chặn từ P5

  // --- Điền sau ------------------------------------------------------------
  'ho_so.ngay_tbp_ky': 'dien-sau', //       B3 — TBP ký
  'ho_so.chu_ky_so_TBP': 'dien-sau', //     B3 — khối chữ ký số
  'ho_so.ke_toan': 'dien-sau', //           B4 — kế toán nhận bản mềm
  'ho_so.ngay_kt_nhan_l1': 'dien-sau', //   B4
  'ho_so.sale_admin': 'dien-sau', //        B6 — Sale Admin nhận việc
  'ho_so.ngay_kt_nhan_l2': 'dien-sau', //   B10 — cũng là NGÀY DUYỆT
  'ho_so.ngay_hieu_luc': 'dien-sau', //     B10 — đặt lúc duyệt xong
};

/**
 * Định dạng CỐ ĐỊNH của từng trường — người soạn mẫu không chọn (`0067`).
 *
 * Trước `0067` mỗi dòng ánh xạ mang một ô chọn định dạng. Đó là một câu hỏi sai:
 * *"công nợ hiển thị kiểu tiền hay kiểu chữ?"* chỉ có một câu trả lời đúng, và
 * câu trả lời ấy đi theo TRƯỜNG chứ không theo mẫu. Hỏi hai mươi lần cho hai
 * mươi ô là mời người dùng trả lời sai ở đúng một trong số đó — và cái sai ấy
 * chỉ lộ ra trên bản in.
 *
 * Trường nào không có tên ở đây thì giữ nguyên chữ (`text`).
 */
export const DINH_DANG_NGUON: Record<string, Format> = {
  'ho_so.cong_no': 'money_vnd',
  'ho_so.ngay_ap_dung': 'date_dmy',
  'ho_so.ngay_hieu_luc': 'date_dmy',
  'ho_so.ngay_tbp_ky': 'date_dmy',
  'ho_so.ngay_kt_nhan_l1': 'date_dmy',
  'ho_so.ngay_kt_nhan_l2': 'date_dmy',
  ngay_in: 'date_dmy',
};

export const dinhDangCua = (source: string): Format => DINH_DANG_NGUON[source] ?? 'text';

/**
 * Mục BẮT BUỘC của bản CSBH A4 (muc 11.1), dịch sang trường nguồn.
 *
 * Muc 6.4 từng để ngỏ đúng câu hỏi này: *"nếu mẫu do người dùng soạn, hệ thống
 * không còn bảo đảm được 13 mục kia có mặt"*. Đây là câu trả lời — kiểm ở LÚC
 * LƯU, không ở lúc xem.
 *
 * Kiểm lúc lưu chứ không lúc xem vì hai lý do:
 *   - Người sửa được là Quản trị, và họ đang đứng ở màn hình mẫu. Báo lúc kế
 *     toán mở bản A4 là báo cho người không sửa được gì.
 *   - Một mẫu thiếu mục chỉ hỏng khi có người xem, mà lúc đó thì đã muộn: bản
 *     thiếu công nợ đã in ra và đã đưa đi ký.
 *
 * CHÍN TRÊN MƯỜI BA, và bốn mục đứng ngoài đều là chuyện đã chốt:
 *
 *   - *thông tin công ty* rời danh sách ở `0067` cùng nhóm khoá `cong_ty.` — giá
 *     trị cố định, người soạn gõ thẳng vào file Word, nên phần mềm không có ô
 *     trống nào để mà kiểm.
 *   - *CPBH* rời ở `0084`: nó nằm trong bảng do hệ thống dựng, và cột `cpbh_tong`
 *     giờ TẮT ĐƯỢC vì CPBH là con số nội bộ (xem `bang-san-pham.ts`).
 *   - *trạng thái* và *thời gian duyệt* rời ở `0102` (chốt 24/08). Hai mục này
 *     KHÁC hẳn mười một mục kia: chúng còn ĐANG ĐỔI. Bản mềm dựng lúc TBP ký in
 *     ra `Chờ kế toán duyệt lần 1` và một ô *thời gian duyệt* RỖNG — bắt buộc
 *     phải có mặt tức là bắt buộc phải in ra một câu sai ở mọi hồ sơ chưa tới
 *     B10. Một ô bảo đảm có mặt mà bảo đảm sai thì tệ hơn một ô không có.
 *
 * Câu của muc 11.1 nói *"bảng CSBH XEM tối thiểu có…"*, tức MÀN HÌNH chi tiết hồ
 * sơ (`ChiTietHoSo.tsx`) — nó bày đủ cả mười ba mục và không mẫu nào chi phối nó.
 * Danh sách dưới đây áp lên MẪU do Quản trị soạn, một thứ khác: đem nguyên yêu
 * cầu của màn hình sang bản người dùng vẽ là chỗ `0067` đọc quá lời.
 *
 * `0102` bản đầu viết rằng bảng xem ấy là `render/sheet.ts`. SAI, theo hai đường:
 * tệp ấy chỉ phục vụ bản lưu ký số — thứ chưa ai gọi bao giờ và `0103` đã gỡ —
 * còn DOC-03 thì đọc mười ba mục ra từ PDF dựng bằng MẪU `mau-ho-so-a4-doc.docx`.
 * Nên bảo đảm mười ba mục nằm ở màn hình cộng một mẫu bàn giao có ca kiểm, không
 * ở một đường dựng văn bản thứ hai nào.
 *
 * Hai trường KHÔNG bị gỡ khỏi `SCALAR` — mẫu nào muốn in vẫn đặt ô được. Gỡ khỏi
 * đây chỉ có nghĩa: hệ thống thôi ÉP.
 *
 * Nói ra ở đây vì một bảo đảm 9/13 mà tưởng là 13/13 thì tệ hơn hẳn một bảo
 * đảm 9/13 đã biết — và cái tưởng ấy chỉ vỡ ra trên một bản đã đem đi ký.
 *
 * `{{bang_san_pham}}` vẫn gánh mục *tên sản phẩm*, kiểm qua tập cột bắt buộc của
 * bảng chứ không qua danh sách này.
 */
export const NGUON_BAT_BUOC_HO_SO: string[] = [
  'ho_so.ma_khach_hang',
  'ho_so.ten_khach_hang',
  'ho_so.cong_no',
  'ho_so.ma_ho_so',
  'ho_so.ngay_ap_dung',
  'ho_so.tep_dinh_kem',
  'ho_so.nguoi_de_nghi',
  'ho_so.truong_bo_phan',
  'ho_so.ke_toan',
  'ho_so.ngay_tbp_ky',
];

export const isKnownSource = (s: string): boolean => KNOWN_SOURCES.includes(s);

export function applyFormat(raw: string | null, format: string | null): string {
  if (raw === null || raw === '') return '';
  switch (format) {
    case 'money_vnd':
      return money(raw);
    case 'date_dmy':
      return dmy(raw);
    case 'percent_2':
      return pct(raw);
    default:
      return raw;
  }
}

export const scalarValue = (source: string, ctx: Ctx): string | null =>
  SCALAR[source] ? (SCALAR[source] as (c: Ctx) => string | null)(ctx) : null;


