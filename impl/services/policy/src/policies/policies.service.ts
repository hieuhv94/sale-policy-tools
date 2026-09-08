/**
 * Hồ sơ CSBH — lập, bổ sung, chỉnh sửa, phiên bản, hiệu lực (YCNV muc 3, 5, 7).
 *
 * Ba luật khó nhất nằm ở đây và đều dễ làm sai:
 *   1. Mỗi khách hàng đúng MỘT CSBH hiệu lực, và hiệu lực chỉ chuyển ngay lúc
 *      tiếp nhận L2 — trong CÙNG một transaction với việc vô hiệu bản cũ.
 *   2. Rút một mặt hàng khỏi phiên bản mới là XOÁ MỀM: dòng nằm lại dưới nhãn
 *      *Đã xoá* cho người duyệt thấy, chỉ xoá hẳn lúc hồ sơ có hiệu lực (`0186`,
 *      đảo POL-08 vốn cấm hẳn).
 *   3. Giá và ngưỡng ĐÓNG BĂNG vào dòng hồ sơ lúc lập, không tra lại về sau.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  computeLine,
  InvalidLineError,
  STEP_OF_STATUS,
  SUA_DUOC,
  type Status,
} from '@csbh/domain-policy';
import { PG, ngayVN, paged, pgCode, type AuthUser, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { emit } from '../infra/emit.js';
import { Clients } from '../infra/clients.js';
import { ScopeClient } from '../infra/scope.client.js';

export type LineInput = {
  productId: string;
  wholesalePrice: bigint;
  /** Các khoản chi phí bán hàng, số lượng tuỳ dòng. Thiếu = không có khoản nào. */
  cpbh?: readonly bigint[] | undefined;
  /** Ghi chú tự do cho riêng dòng này (`0027`). Thiếu = xoá ghi chú đang có. */
  note?: string | undefined;
  /**
   * NGÀY ÁP DỤNG của riêng dòng này (`0180`).
   *
   * Thiếu là **hôm nay theo giờ Việt Nam**, quyết định ở MÁY CHỦ — cùng luật mà
   * `0104` đã đặt cho ngày áp dụng của hồ sơ, và vì cùng một lý do: chỗ duy nhất
   * biết "hôm nay" là hôm nay của người dùng chứ không của tiến trình nào.
   *
   * Ngày này QUYẾT ĐỊNH bảng giá và ngưỡng chiết khấu được chụp cho chính dòng
   * ấy, nên hai dòng cùng hồ sơ mà khác ngày thì có thể chụp hai bảng giá khác
   * nhau — đúng điều khách hàng chốt 07/09.
   */
  ngayApDung?: string | undefined;
};

export type CreateInput = {
  customerId: string;
  lines: LineInput[];
  /**
   * Xác nhận LẬP PHIÊN BẢN MỚI cho khách đã có CSBH đang hiệu lực.
   *
   * `0180` gộp `SUPPLEMENT`/`AMEND` làm một: hai giá trị ấy **chưa bao giờ dẫn
   * tới hai hành vi khác nhau** ở máy chủ — cả hai đều chép lại toàn bộ dòng cũ
   * rồi áp dòng mới lên. Chúng chỉ chọn CÂU HỎI hiện ra trên màn hình, và khách
   * hàng chốt 07/09 rằng một câu là đủ.
   *
   * Bỏ trống thì hệ thống KHÔNG đoán mà hỏi lại (POL-04, POL-06) — chốt ấy giữ
   * nguyên, chỉ còn một câu hỏi thay vì hai.
   */
  mode?: 'NEW_VERSION' | undefined;
};

type PolicyRow = {
  id: string;
  code: string;
  customer_id: string;
  version_no: number;
  status: string;
  /** `0142` — đã từng qua TBP. KHÔNG BAO GIỜ về `false`; xem migration `0107`. */
  da_qua_tbp: boolean;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  effective_from: Date | null;
  tdv_user_id: string | null;
  /** Ba người được phân công theo luồng (`0031`). NULL tới lúc tới lượt họ. */
  tbp_user_id: string | null;
  ke_toan_user_id: string | null;
  sale_admin_user_id: string | null;
  row_version: number;
  last_reason: string | null;
  /** Lúc bị đánh dấu quá hạn — mốc đếm 3 ngày trước khi tự xoá (`0047`). */
  overdue_at: Date | null;
  pending_step: string | null;
  kt_l1_received_at: Date | null;
  kt_l2_received_at: Date | null;
  tbp_signed_at: Date | null;
  /** Người THẬT SỰ ký — khác `tbp_user_id` khi có người duyệt thay. */
  tbp_signed_by: string | null;
  sa_handover_at: Date | null;
  /** Lúc TDV lập bản nháp — "ngày soạn thảo" trên màn hình hồ sơ (`0061`). */
  created_at: Date;
};

/**
 * MỘT câu hỏi cho cả hai tình huống (`0180`, gộp `SUPPLEMENT`/`AMEND`).
 *
 * Hai câu cũ hỏi *"bổ sung không?"* và *"chỉnh sửa không?"* theo việc lô sản
 * phẩm gửi lên có mặt hàng mới hay không — một phép đoán về ý định, dựa trên
 * `lines` mà giao diện luôn gửi RỖNG (dòng sản phẩm thêm ở màn hình sau). Nên
 * trên thực tế câu hỏi ấy luôn là *"chỉnh sửa"*, kể cả với người đang định thêm
 * mặt hàng mới.
 *
 * Câu duy nhất còn lại nói đúng thứ sắp xảy ra, và nó đúng cho cả hai đường:
 * một phiên bản mới, chứa lại toàn bộ sản phẩm cũ.
 */
export const NEW_VERSION_MESSAGE =
  'Khách hàng đã có CSBH đang hiệu lực. Bạn có muốn lập phiên bản mới không?';

/**
 * Chỉ hồ sơ đang ở hai trạng thái này mới sửa được nội dung (POL-11).
 *
 * Lấy từ `domain-policy` từ `0098`, không khai lại: `document` cũng cần đúng
 * danh sách này để biết khi nào ô chọn văn bản mẫu còn mở.
 */
const EDITABLE: readonly string[] = SUA_DUOC;

/**
 * Trạng thái TDV phụ trách xoá được (`0039`, thu lại ở `0155`).
 *
 * Tới `0035` danh sách này ĐÚNG BẰNG `EDITABLE` — "xoá được đúng những hồ sơ sửa
 * được". `0039` thêm `TU_CHOI` vào, nên nó tách thành một hằng số riêng.
 *
 * `0155` BỎ HẲN `TU_CHOI`, nên danh sách quay về đúng bằng `EDITABLE`. Nhưng
 * hằng số RIÊNG thì giữ, không gộp lại: hai câu hỏi *"sửa được không"* và *"xoá
 * được không"* là hai câu khác nhau, và chúng đã từng trả lời khác nhau một lần
 * rồi. Gộp lại là mời lần thứ hai xảy ra âm thầm — ai đó nới `EDITABLE` cho một
 * lý do chẳng liên quan gì tới việc xoá, và quyền xoá nới theo.
 *
 * Chốt ở CSDL vẫn nguyên: `trg_forbid_delete_rejected` chặn XOÁ DÒNG ở `DA_XOA`.
 * Đường duy nhất là đổi trạng thái, và nó có vết.
 */
const XOA_DUOC = [...EDITABLE];

/**
 * Hồ sơ này người đang xem có xoá được không — giao diện đọc để ẩn nút (`0039`).
 *
 * Gộp CẢ HAI điều kiện: trạng thái, và "đúng TDV đang phụ trách". Giao diện
 * không biết vế thứ hai — nó chỉ có `tdvUserId` chứ không có luật — nên trả về
 * một cờ boolean là cách duy nhất để nút hiện ra đúng bằng những lần bấm được.
 */
export const xoaDuoc = (status: string, tdvUserId: string | null, me: AuthUser): boolean =>
  XOA_DUOC.includes(status) && tdvUserId !== null && tdvUserId === me.id;

/**
 * Một hồ sơ thuộc phạm vi của tôi khi id của tôi nằm ở MỘT TRONG BỐN cột người
 * (`0031`).
 *
 * Trước `0031` câu lọc là `tdv_user_id = ANY(scope)`, và `scope` là cả một nhánh
 * cây tổ chức. Giờ `scope` gần như luôn là đúng một id — chính mình — còn phần
 * "tôi liên quan tới hồ sơ này" chuyển sang bốn cột phân công.
 *
 * Vẫn dùng `= ANY($n)` chứ không `= $n` vì Ban lãnh đạo có phạm vi là MỌI người
 * dùng; giữ một dạng câu cho cả sáu vai trò thì không có nhánh nào để quên.
 *
 * `n` là số thứ tự tham số chứa mảng id. Trả về chuỗi SQL chứ không phải một câu
 * hoàn chỉnh: bốn chỗ gọi có bốn hình dạng truy vấn khác nhau, và nhét chúng vào
 * một hàm chung là dựng ra một hàm mà mỗi lời gọi dùng một nhánh riêng.
 */
/**
 * Loại tệp đính kèm ĐANG tải lên được, theo trạng thái hồ sơ (`0048`).
 *
 * Cùng luật với `WorkflowService.attach`, và trả về từ MÁY CHỦ vì đúng lý do đã
 * viết cho `xoaDuoc`: chép danh sách trạng thái sang giao diện là dựng một bản
 * sao thứ hai phải giữ đồng bộ.
 *
 * Rỗng nghĩa là không hiện nút *Tải tệp lên* — thẳng thắn hơn hẳn việc hiện nút
 * rồi trả 409 khi người ta đã chọn xong file.
 */
export const loaiTepGhiDuoc = (status: string, role?: string): string[] => {
  /*
   * VAI TRÒ, không chỉ trạng thái (`0069`).
   *
   * Tới `0068` hàm này chỉ xét trạng thái, nên ở bước *Sale Admin xử lý* thì
   * MỌI vai trò trong luồng đều thấy nút tải bản scan lên — kể cả kế toán, và
   * máy chủ nhận thật. Bản scan là bản giấy có chữ ký khách hàng, do chính Sale
   * Admin in ra, trình ký, rồi scan lại; không ai khác cầm nó trong tay.
   *
   * Cặp khoá ở đây phải khớp từng dòng với phép kiểm trong `WorkflowService`:
   * đây là thứ QUYẾT ĐỊNH nút có hiện hay không, còn kia là thứ chặn thật.
   */
  if (EDITABLE.includes(status)) return NGUOI_GHI_TEP.HO_SO === role ? ['HO_SO'] : [];
  /*
   * HAI loại ở bước `SA_DANG_XU_LY` từ `0167`: bản scan và **bản mềm**.
   *
   * Cả hai của Sale Admin, cả hai chỉ ở bước ấy — nên chúng ra cùng một lúc.
   * Đây là lần đầu hàm này trả về NHIỀU HƠN MỘT loại, và đó là một thay đổi có
   * hệ quả: giao diện từng đọc `loaiGhiDuoc[0]` để biết đang tải loại gì, và với
   * hai phần tử thì nó tải bản mềm lên dưới nhãn bản scan. Xem `TepDinhKem`.
   */
  if (status === 'SA_DANG_XU_LY') {
    return NGUOI_GHI_TEP.SCAN === role ? ['SCAN', 'BAN_MEM'] : [];
  }
  return [];
};

/**
 * Ai được tải lên và gỡ TỪNG LOẠI tệp của hồ sơ (`0069`).
 *
 * `HO_SO` — giấy tờ kèm theo hồ sơ, đính lúc lập: việc của Trình dược viên.
 * `SCAN`  — bản cứng đã ký, scan lại: việc của Sale Admin.
 *
 * Bảng tra chứ không phải hai câu `if` rải trong ba tệp: cùng một luật đang được
 * đọc ở ba chỗ (nút trên màn hình, phép chặn lúc tải lên, phép chặn lúc gỡ), và
 * ba bản chép sẽ lệch nhau vào ngày ai đó đổi một chỗ.
 */
export const NGUOI_GHI_TEP: Record<'HO_SO' | 'SCAN' | 'BAN_MEM', string> = {
  HO_SO: 'TDV',
  SCAN: 'SALE_ADMIN',
  // `0167` — bản mềm đã lưu. Cùng chủ với bản scan, và cùng lý do: nó là thứ
  // Sale Admin dựng ra ở bước B8 để in và trình ký.
  BAN_MEM: 'SALE_ADMIN',
};

/** Ba loại tệp của một hồ sơ — dùng ở chỗ nào cần kể đủ chúng ra (`0167`). */
export type LoaiTep = keyof typeof NGUOI_GHI_TEP;

/*
 * `tepXoaDuoc()` ĐÃ GỠ Ở `0097`, cùng với trường cùng tên trong phản hồi.
 *
 * Nó là `loaiTepGhiDuoc(...).length > 0` — đúng luật, nhưng ép một câu trả lời
 * THEO LOẠI xuống thành một `boolean` cho cả hai loại. Giao diện chỉ có mỗi cờ
 * ấy nên nó bật dấu ✕ trên MỌI thẻ tệp: ở bước *Sale Admin xử lý*, Sale Admin
 * thấy nút gỡ trên cả giấy tờ TDV đính từ lúc lập, bấm vào thì `detach` trả 403.
 *
 * Chú thích cũ ở đây viết "hai luật tách rời là hai luật sẽ lệch" — đúng, và
 * chính nó đã lệch: `detach` gỡ theo loại của từng tệp, cờ này thì không có khái
 * niệm loại. Đường sửa không phải thêm luật thứ ba mà là **bớt đi một**: giao
 * diện đọc thẳng `loaiTepGhiDuoc` cho cả nút tải lên lẫn nút gỡ.
 */

/**
 * Xuất hợp đồng được chưa (muc 8.3).
 *
 * Cổng là MỐC THỜI GIAN chứ không phải trạng thái: kế toán đã tiếp nhận lần 1
 * thì hồ sơ có hợp đồng để xuất, và mốc ấy không mất đi khi hồ sơ đi tiếp.
 */
export const xuatHopDongDuoc = (ktL1ReceivedAt: Date | null): boolean => ktL1ReceivedAt !== null;

/**
 * HỒ SƠ ĐÃ CÓ BẢN SCAN CHƯA — một câu hỏi, một câu lệnh (`0160`).
 *
 * Chốt chặn `SCAN_REQUIRED` (WF-14) có từ lâu và chặn đúng: bàn giao bản cứng mà
 * chưa tải bản scan thì `SA_HANDOVER` trả `409`. Cái thiếu là NỬA KIA — nút
 * *Bàn giao* vẫn sáng, Sale Admin bấm, rồi mới biết mình còn thiếu việc.
 *
 * Khách hàng chốt 29/08: nút chỉ khả dụng khi đã có bản scan. Nên màn hình cần
 * chính câu hỏi mà chốt chặn đang hỏi — và đó là lúc dễ sinh ra **hai bản của
 * cùng một luật**: một ở `workflow` để chặn, một ở đây để vẽ nút. Hai bản sẽ
 * lệch nhau đúng vào ngày ai đó thêm một loại tệp hoặc đổi nghĩa `kind`, và
 * triệu chứng là một nút sáng bấm vào ra 409 — hoặc tệ hơn, một nút xám trong
 * khi máy chủ sẵn sàng nhận.
 *
 * Nên nó là MỘT hằng, và cả hai chỗ dùng chung. `$1` là `policyId` ở cả hai.
 */
export const SQL_CO_BAN_SCAN =
  `EXISTS (SELECT 1 FROM pol.policy_attachment a
            WHERE a.policy_id = $1 AND a.kind = 'SCAN')`;

/**
 * HỒ SƠ ĐÃ CÓ BẢN MỀM CHƯA (`0167`) — cùng khuôn với `SQL_CO_BAN_SCAN`.
 *
 * Bàn giao cho Kế toán là bàn giao CẢ HAI bản: bản mềm để họ đọc, bản cứng đã ký
 * để lưu. Nên chốt chặn ở `SA_HANDOVER` hỏi cả hai câu, và mỗi câu có một mã lỗi
 * riêng — gộp làm một câu *"thiếu tệp"* thì người dùng không biết mình thiếu cái
 * nào trong hai.
 *
 * MỘT hằng cho cả chốt chặn lẫn cờ vẽ màn hình, đúng lý do đã viết cho bản scan
 * ở trên: hai bản của cùng một luật sẽ lệch, và triệu chứng là một nút bấm vào
 * ra 409.
 */
export const SQL_CO_BAN_MEM =
  `EXISTS (SELECT 1 FROM pol.policy_attachment a
            WHERE a.policy_id = $1 AND a.kind = 'BAN_MEM')`;

/**
 * KẾ TOÁN CHỈ THẤY HỒ SƠ ĐÃ TỪNG TỚI BÀN MÌNH (`0142`, mở rộng ở `0157`).
 *
 * Tới `0141` Kế toán được chọn ngay lúc gửi duyệt, nên id họ vào cột
 * `ke_toan_user_id` từ phút ấy và hồ sơ hiện trong danh sách của họ suốt cả
 * quãng chưa tới lượt.
 *
 * `0142` giấu nó, nhưng CHỈ ở trạng thái `CHO_TBP_DUYET`. Khách hàng chốt 29/08
 * chỉ ra chỗ hở: **Trưởng bộ phận trả hồ sơ về là nó sang `YEU_CAU_CHINH_SUA`
 * và lọt qua chốt** — Kế toán lại thấy một hồ sơ chưa bao giờ tới lượt mình.
 *
 * Nên điều kiện bỏ hẳn vế trạng thái, chỉ còn `da_qua_tbp`. Và cột ấy trả lời
 * đúng câu cần hỏi dù tên nó nói về Trưởng bộ phận: **`TBP_SIGN` là đường DUY
 * NHẤT vào `CHO_KT_L1`**, và nó cũng là chỗ duy nhất bật cờ này — nên
 * `da_qua_tbp = true` tương đương *"hồ sơ đã từng nằm trên bàn Kế toán"*.
 *
 * Đọc theo NGHĨA ĐEN câu khách hàng viết — *"chỉ thấy khi đã từng được kế toán
 * TÁC ĐỘNG"* — thì Kế toán không bao giờ thấy hồ sơ đang chờ chính mình ở
 * `CHO_KT_L1`, và không ai xử lý được bước nào. Câu ấy phải hiểu là *"đã tới
 * lượt Kế toán"*, và đó là điều cột này đang nói.
 *
 * Hồ sơ Kế toán TỰ trả lại ở L1 hay L2 thì họ VẪN thấy: nó đã qua bàn họ, cờ đã
 * bật, và không lượt trả về nào tắt cờ (`0107`).
 *
 * Xem `0107_ke_toan_chua_thay_luot_dau.sql` về việc vì sao phải là một cột riêng
 * chứ không suy được từ `tbp_signed_at` hay `kt_l1_received_at`.
 */
const KE_TOAN_CHUA_TOI_LUOT = (a: string): string => `(${a}da_qua_tbp = false)`;

/**
 * Mệnh đề PHẠM VI của một hồ sơ.
 *
 * `vaiTro` là tuỳ chọn và chỉ có một giá trị làm đổi kết quả — `KE_TOAN`. Truyền
 * vai trò chứ không truyền một cờ `boolean`: chỗ gọi đã có `me.role` trong tay,
 * và một cờ tên `boLuotDau` ở chỗ gọi thì người đọc phải nhớ nó nói về ai.
 */
export const thuocPhamVi = (n: number, alias = '', vaiTro?: string): string => {
  const a = alias ? `${alias}.` : '';
  const trongBonCot = `(${['tdv_user_id', 'tbp_user_id', 'ke_toan_user_id', 'sale_admin_user_id']
    .map((c) => `${a}${c} = ANY($${n}::uuid[])`)
    .join(' OR ')})`;
  return vaiTro === 'KE_TOAN'
    ? `(${trongBonCot} AND NOT ${KE_TOAN_CHUA_TOI_LUOT(a)})`
    : trongBonCot;
};

/**
 * Hồ sơ ĐÃ ĐÓNG BĂNG — số của nó không đổi nữa, dù danh mục có đổi (`0029`).
 *
 * Gồm cả `DANG_CO_HIEU_LUC`: nó cũng đóng băng, và cũng lệch được. Không gồm
 * `HET_HIEU_LUC` và `DA_XOA` — trạng thái kết thúc, lệch hay không cũng không ai
 * làm gì được nữa.
 */
/**
 * Vai trò nào đọc cột người nào trên hồ sơ (`0031`).
 *
 * Kế toán chỉ có MỘT cột cho cả hai lần tiếp nhận — đúng với quyết định "L1 và
 * L2 là một vai trò, một người, hai màn hình".
 */
export const COT_CUA_VAI_TRO: Record<string, string> = {
  TDV: 'tdv_user_id',
  TBP: 'tbp_user_id',
  KE_TOAN: 'ke_toan_user_id',
  SALE_ADMIN: 'sale_admin_user_id',
};

export const DA_DONG_BANG = [
  'CHO_TBP_DUYET',
  'CHO_KT_L1',
  'SA_DANG_XU_LY',
  'CHO_KT_L2',
  'QUA_HAN_DUYET',
  'DANG_CO_HIEU_LUC',
];

/**
 * HỒ SƠ CHƯA DUYỆT XONG — còn soạn được, hoặc đang đi trong luồng (`0184`).
 *
 * Điều kiện bày khối *bản mềm và bản cứng của phiên bản trước*.
 *
 * `0183` mở cho đúng bốn bàn làm việc, theo chốt *"khi TDV gửi vào luồng
 * duyệt"*, và tôi đã ghi ra hệ quả: khối tắt trong lúc TDV sửa. Khách hàng đọc
 * xong nói thẳng — *"TDV cũng có thể xem được để đối chiếu trong lúc sửa hoặc
 * nháp"* — nên `0184` gộp thêm `SUA_DUOC`.
 *
 * Câu chung của cả tập: **hồ sơ còn đang được làm**. Người đang soạn cần đối
 * chiếu đúng như người đang duyệt, và họ cần TRƯỚC — sửa xong rồi mới gửi thì
 * đỡ một vòng trả lại.
 *
 * BA trạng thái vẫn ở ngoài, và cả ba vì cùng một lẽ — chúng đã xong:
 * `DANG_CO_HIEU_LUC` (duyệt xong), `QUA_HAN_DUYET` (kết thúc, `18/08`),
 * `DA_XOA`/`HET_HIEU_LUC`. Khối này là công cụ của lượt LÀM, không phải một mục
 * của hồ sơ.
 *
 * Dựng TỪ hai hằng có sẵn chứ không chép sáu chuỗi: `SUA_DUOC` là nguồn sự thật
 * của *"còn sửa được"*, và một bản chép ở đây sẽ trôi khỏi nó ở đúng lượt ai đó
 * thêm một trạng thái sửa được.
 */
export const CHUA_DUYET_XONG = [
  ...SUA_DUOC,
  'CHO_TBP_DUYET',
  'CHO_KT_L1',
  'SA_DANG_XU_LY',
  'CHO_KT_L2',
];

/**
 * `date` của Postgres về tới đây thành `Date`; catalog nhận chuỗi `yyyy-mm-dd`.
 *
 * `toISOString()` đổi sang UTC trước khi cắt, và với một `Date` dựng từ cột
 * `date` (nửa đêm giờ máy chủ) thì ở múi giờ dương như Việt Nam nó lùi về NGÀY
 * HÔM TRƯỚC. Dùng các thành phần theo giờ địa phương thay vì cắt chuỗi UTC.
 */
export const ngayISO = (v: Date | string | null | undefined): string | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
};

/**
 * TRẠNG THÁI của một dòng sản phẩm và TỶ LỆ CK CŨ — **dẫn xuất, không lưu**.
 *
 * Khách hàng chốt 07/09: mỗi dòng mang một trong ba trạng thái — *Bổ sung* cho
 * mặt hàng mới so với CSBH đang có, *Chỉnh sửa* cho mặt hàng có sẵn mà TDV vừa
 * sửa, *Đang áp dụng* cho mặt hàng có sẵn và để nguyên — cộng một cột *Tỷ lệ CK
 * cũ* cho những dòng đã bị sửa.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHÔNG THÊM CỘT, DÙ CẢ REPO ĐI THEO LỐI ĐÓNG BĂNG
 * ---------------------------------------------------------------------------
 *
 * Câu hỏi *"dòng này khác gì bản trước"* đã có sẵn CẢ HAI VẾ trong CSDL: bản
 * trước là `pol.policy.supersedes_id`, và dòng của nó tìm bằng `product_id`
 * (`uq_policy_line_product` bảo đảm mỗi hồ sơ mỗi sản phẩm đúng một dòng).
 *
 * Vế bản trước là **bất biến**: một hồ sơ đã ra khỏi nhóm sửa được thì không
 * đường ghi nào chạm vào dòng của nó nữa, và `supersedes_id` đặt một lần lúc
 * lập rồi thôi. Nên phép so này cho **cùng một câu trả lời mãi mãi** — đúng thứ
 * mà đóng băng sinh ra để bảo đảm, chỉ là không phải trả giá bằng một bản sao.
 *
 * Thêm cột `trang_thai` + `ty_le_ck_truoc` là dựng ra bản sao thứ hai của một
 * dữ liệu đã có, và bản sao ấy phải được cập nhật ở BỐN đường ghi (chép dòng
 * thừa kế, thêm dòng, sửa dòng, làm mới giá) — bỏ sót một đường là một dòng
 * mang nhãn sai trên tờ giấy đem ký, và không có gì đỏ.
 *
 * ---------------------------------------------------------------------------
 * "BỊ SỬA" LÀ SỬA THỨ GÌ
 * ---------------------------------------------------------------------------
 *
 * Bốn trường TDV nhập: giá bán buôn · các khoản CPBH · ngày áp dụng · ghi chú.
 * Khách hàng chốt *"đổi bất kỳ dữ liệu nào"*, nên danh sách này là đủ bốn.
 *
 * KHÔNG so `company_price_snap`, `threshold_snap`, `discount_rate`: chúng đến từ
 * DANH MỤC, và `lamMoiDong` chụp lại chúng ở mỗi lượt đọc hồ sơ còn sửa được
 * (`0029`). Đưa chúng vào phép so là để danh mục đổi giá một mình cũng làm mọi
 * dòng của mọi bản nháp nhảy sang *Chỉnh sửa* — một câu sai, vì TDV chưa đụng
 * vào gì cả.
 *
 * `IS DISTINCT FROM` chứ không `<>`: `note` NULL được, và `NULL <> 'x'` trả NULL
 * chứ không trả `true` — dòng vừa được gõ thêm ghi chú sẽ lọt qua thành *Đang áp
 * dụng*.
 *
 * ---------------------------------------------------------------------------
 * TỶ LỆ CK CŨ CHỈ TRẢ VỀ CHO DÒNG *CHỈNH SỬA*
 * ---------------------------------------------------------------------------
 *
 * Yêu cầu nói rõ: cột ấy để đối chiếu *"cho các sản phẩm đã bị TDV chỉnh sửa"*.
 * Với dòng *Đang áp dụng* thì tỷ lệ cũ bằng đúng tỷ lệ mới — in nó ra là một cột
 * lặp lại cột bên cạnh; với dòng *Bổ sung* thì không có tỷ lệ cũ nào.
 *
 * Luật ấy đặt ở ĐÂY chứ không ở giao diện, vì bảng trên màn hình và bảng trên
 * tờ giấy là hai chỗ dựng khác nhau — để mỗi bên tự quyết định "khi nào thì
 * hiện" là dựng ra hai câu trả lời sẽ lệch nhau.
 */
export const SQL_DONG_KHAC_BAN_TRUOC = `
  truoc.id IS NOT NULL AND (
       l.wholesale_price IS DISTINCT FROM truoc.wholesale_price
    OR l.cpbh            IS DISTINCT FROM truoc.cpbh
    OR l.ngay_ap_dung    IS DISTINCT FROM truoc.ngay_ap_dung
    OR l.note            IS DISTINCT FROM truoc.note
  )`;

/**
 * *Đã xoá* THẮNG cả ba trạng thái kia (`0186`).
 *
 * Một dòng đã rút vẫn là dòng *Đang áp dụng* hay *Chỉnh sửa* xét theo phép so
 * với bản trước — cả hai câu đều đúng, nhưng chỉ một câu đáng nói với người
 * đang duyệt: mặt hàng này SẮP BIẾN MẤT khỏi chính sách của khách hàng. Nên
 * nhánh này đứng trước, và ba nhánh của `0180` chỉ trả lời cho dòng còn sống.
 *
 * Đây cũng là lý do nhánh ấy đọc `l.da_xoa` chứ không đọc một phép so nào: xem
 * `0117_dong_da_xoa.sql` về việc vì sao *Đã xoá* là một cột trong khi ba trạng
 * thái kia là dẫn xuất.
 */
export const SQL_TRANG_THAI_DONG = `
  CASE
    WHEN l.da_xoa THEN 'DA_XOA'
    WHEN truoc.id IS NULL THEN 'BO_SUNG'
    WHEN ${SQL_DONG_KHAC_BAN_TRUOC} THEN 'CHINH_SUA'
    ELSE 'DANG_AP_DUNG'
  END`;

/**
 * Dòng THỪA KẾ — có mặt ở bản bị thay thế, bất kể TDV đã sửa nó hay chưa.
 *
 * Đây là điều kiện quyết định xoá MỀM hay xoá HẲN, và nó KHÔNG phải
 * `trang_thai = 'DANG_AP_DUNG'` dù khách hàng viết đúng chữ ấy. Lý do ở mục
 * đích của luật: dòng nằm lại bảng là để người duyệt thấy khách hàng đang mất
 * mặt hàng nào. Một dòng *Chỉnh sửa* cũng đến từ bản trước, nên rút nó cũng lấy
 * đi một mặt hàng của khách — đọc theo nghĩa đen thì nó xoá sạch không dấu vết,
 * và tệ hơn: sửa một dòng rồi mới xoá trở thành đường vòng qua chính phép canh
 * này. Dòng *Bổ sung* thì ngược lại — nó chưa bao giờ thuộc về khách hàng, nên
 * xoá hẳn là đúng và để lại một dòng mờ *"đã rút thứ chưa từng có"* chỉ làm
 * bảng dài thêm.
 */
export const SQL_DONG_THUA_KE = `truoc.id IS NOT NULL`;

/**
 * Cột *Tỷ lệ CK cũ* — MỘT biểu thức cho cả hai bảng (`0186`).
 *
 * `0180` viết nó hai lần, một bản ở đường đọc của giao diện và một bản ở
 * `internal.controller`, ngay dưới hai chú thích cùng nói rằng hai bảng phải
 * nói cùng một câu. Lượt này thêm một vế vào luật ấy — dòng đã rút thì không
 * mang tỷ lệ cũ — nên hai bản chép sẽ phải sửa hai chỗ giống hệt nhau, đúng
 * hình dạng lỗi mà `SQL_TRANG_THAI_DONG` sinh ra để tránh. Gom lại.
 *
 * `NOT l.da_xoa`: luật đã ghi là *"chỉ dòng **Chỉnh sửa** mới có tỷ lệ cũ"*, mà
 * dòng đã rút mang trạng thái *Đã xoá* chứ không phải *Chỉnh sửa*. Bỏ vế này
 * thì một dòng vừa bị sửa vừa bị rút hiện ra với nhãn *Đã xoá* kèm một cột đối
 * chiếu chỉ có nghĩa cho dòng còn sống.
 */
export const SQL_TY_LE_CK_TRUOC = `
  CASE WHEN NOT l.da_xoa AND ${SQL_DONG_KHAC_BAN_TRUOC}
       THEN truoc.discount_rate::text END`;

/**
 * Nối sang dòng CÙNG SẢN PHẨM của bản bị thay thế.
 *
 * `LEFT JOIN` hai tầng: hồ sơ đầu tiên của một khách không có `supersedes_id`
 * nên `truoc` rỗng ở mọi dòng, và mọi dòng thành *Bổ sung* — đúng điều khách
 * hàng chốt cho phiên bản đầu.
 */
export const SQL_NOI_BAN_TRUOC = `
  LEFT JOIN pol.policy cha ON cha.id = $1
  LEFT JOIN pol.policy_line truoc
         ON truoc.policy_id = cha.supersedes_id
        AND truoc.product_id = l.product_id`;

/**
 * Cột gộp địa chỉ giao hàng → DANH SÁCH (`0177`).
 *
 * `cus.customer.delivery_address` là cột dẫn xuất do trigger `tr_gop_dia_chi`
 * dựng từ `cus.customer_address`, ngăn bằng `\n` (`0154`). Tách ngược ở đây an
 * toàn vì `0154` kèm theo một ràng buộc CẤM ký tự xuống dòng bên trong một địa
 * chỉ — không có nó thì phép tách này là một phỏng đoán.
 *
 * `null` và chuỗi rỗng đều ra MẢNG RỖNG, và mảng rỗng có nghĩa riêng: *"giao tới
 * địa chỉ đăng ký"* (`0006`). Lọc bỏ dòng trắng để một dấu `\n` thừa ở cuối
 * không đẻ ra một địa chỉ rỗng mà màn hình sẽ bày thành một dòng trống.
 */
const tachDiaChi = (v: string | null | undefined): string[] =>
  (v ?? '')
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x !== '');

/**
 * Phần nhận dạng đi kèm MỌI sự kiện về hồ sơ.
 *
 * Bên nhận không đọc được schema pol lẫn cus, nên sự kiện chỉ mang `policyId`
 * thì họ phải gọi ngược lại hai service để biết đây là hồ sơ của ai — mà nhật ký
 * thì cần biết ngay cả khi cả hai service kia đang tắt.
 */
const evtCtx = (
  p: { id: string; code: string; customer_id: string; tdv_user_id: string | null },
  cus?: { code: string; name: string },
) => ({
  entity: 'policy',
  id: p.id,
  policyId: p.id,
  policyCode: p.code,
  customerId: p.customer_id,
  customerCode: cus?.code ?? null,
  customerName: cus?.name ?? null,
  tdvUserId: p.tdv_user_id,
});

/**
 * Mọi người đã từng thao tác lên hồ sơ này — nguồn của thư "để biết" (`0036`).
 *
 * VÌ SAO ĐỌC TỪ NHẬT KÝ chứ không từ bốn cột phân công: bốn cột nói ai ĐANG giữ
 * hồ sơ, còn câu hỏi ở đây là ai ĐÃ ĐỘNG VÀO nó. Hai tập khác nhau ở đúng những
 * ca đáng quan tâm — một Trưởng bộ phận đã trả hồ sơ về rồi lần sau người lập
 * chọn Trưởng bộ phận khác thì người thứ nhất biến mất khỏi cột `tbp_user_id`,
 * nhưng họ vẫn là người đã đọc và đã viết lý do, và họ có lý do để muốn biết hồ
 * sơ ấy về sau ra sao.
 *
 * Gọi TRONG transaction và SAU `recordEvent`, nên hành động vừa xảy ra đã nằm
 * trong danh sách. Người vừa bấm bị notification loại ra sau — ở đây không loại,
 * vì "ai đã tác động" là một sự thật của hồ sơ, còn "ai cần nhận thư" là quyết
 * định của tầng gửi thư.
 */
export async function daTacDong(c: PoolClient, policyId: string): Promise<string[]> {
  const r = await c.query<{ actor_id: string }>(
    `SELECT DISTINCT actor_id FROM pol.policy_event
      WHERE policy_id = $1 AND actor_id IS NOT NULL`,
    [policyId],
  );
  return r.rows.map((x) => x.actor_id);
}

@Injectable()
export class PoliciesService {
  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
    private readonly scope: ScopeClient,
  ) {}

  // --- Lập hồ sơ ------------------------------------------------------------

  async create(input: CreateInput, me: AuthUser) {
    const customer = await this.clients.customer(input.customerId);
    // Không lập hộ khách hàng ngoài phạm vi của mình (POL-15).
    await this.assertInScope(customer.tdvUserId, me);

    // Khách đã ngừng hợp tác thì không lập CSBH mới (`0034`). Chặn ở đây chứ
    // không chỉ giấu khỏi ô chọn: ô chọn là thứ người dùng đi vòng được, và một
    // hồ sơ lập cho khách đã ngừng sẽ chặn luôn chính việc ngừng hợp tác ấy —
    // nó là "hồ sơ đang chờ" theo đúng nghĩa của điều kiện kia.
    if (customer.status === 'NGUNG_HOP_TAC') {
      throw new ConflictException({
        code: 'CUSTOMER_RETIRED',
        message: 'Khách hàng này đã xoá, không lập CSBH mới được.',
      });
    }

    const active = await this.db.one<PolicyRow>(
      `SELECT * FROM pol.policy WHERE customer_id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
      [input.customerId],
    );

    if (active && !input.mode) {
      // Khách đã có CSBH thì KHÔNG tự quyết định thay người dùng (POL-04, POL-06).
      // `0180`: MỘT câu hỏi, không còn dò `lines` để chọn giữa hai câu — xem
      // `NEW_VERSION_MESSAGE`.
      throw new ConflictException({
        code: 'NEW_VERSION_REQUIRED',
        message: NEW_VERSION_MESSAGE,
        activePolicyId: active.id,
      });
    }

    if (!active && input.mode) {
      throw new BadRequestException({
        code: 'NO_ACTIVE_POLICY',
        message: 'Khách hàng chưa có CSBH nào để lập phiên bản mới',
      });
    }

    /*
     * NGÀY ÁP DỤNG mặc định HÔM NAY, đặt ở MÁY CHỦ (`0104`, chuyển xuống DÒNG ở
     * `0180`).
     *
     * Luật không đổi, chỉ đổi chỗ nó áp vào: người gọi không khai ngày cho một
     * dòng thì máy chủ điền hôm nay. Hai chỗ trả lời khác nhau cho cùng một câu
     * hỏi *"không khai thì áp dụng từ bao giờ?"* là thứ `0104` đã dọn — chỗ trả
     * lời "không biết" là chỗ có thẩm quyền.
     *
     * Ngày hôm nay theo GIỜ VIỆT NAM, không theo giờ máy chủ: đây là một cột
     * `date`, và một dòng thêm lúc 8 giờ sáng thứ Hai ở Hà Nội mà mang ngày Chủ
     * nhật là sai theo cách không ai đi tìm.
     */
    const homNay = ngayVN();

    /*
     * ID SINH Ở NODE, không để Postgres tự đặt — và đó là điều kiện để nhân bản
     * giấy tờ được (`0148`).
     *
     * Lượt nhân bản là một lời gọi HTTP sang `document`, mà luật ở đây là **lời
     * gọi ra service khác không bao giờ nằm trong transaction** (xem
     * `grantCustomerAccess`): nó giữ khoá dòng suốt thời gian mạng.
     *
     * Gọi SAU transaction thì hỏng ở chiều tệ nhất — hồ sơ đã tạo xong, người
     * dùng nhận lỗi, và bản mới nằm đó thiếu giấy tờ. Gọi TRƯỚC thì hỏng ở chiều
     * lành: chưa có gì được tạo, người dùng bấm lại. Muốn gọi trước thì phải
     * biết id của hồ sơ mới trước khi ghi nó — nên id sinh ở đây.
     *
     * Cái sót lại khi transaction hỏng sau lượt chép: vài dòng `doc.stored_file`
     * trỏ vào một hồ sơ không tồn tại. Chúng vô hình (mọi đường đọc đều đi qua
     * `owner_id`) và không tốn gì ngoài chỗ chứa.
     */
    const policyId = randomUUID();

    /*
     * HỎI BẢNG CỦA MÌNH TRƯỚC, rồi mới gọi ra ngoài.
     *
     * Một câu `SELECT` cục bộ thay cho một lời gọi HTTP ở mọi lượt lập phiên bản
     * mới. Cái nó mua được không phải tốc độ mà là **phạm vi phụ thuộc**: chỉ
     * những khách hàng thật sự có giấy tờ đính kèm mới cần `document` sống lúc
     * lập bản mới. Bản đầu tiên của mọi khách, và mọi bản mới của khách chưa
     * đính tờ nào, không gọi lời nào cả.
     *
     * `0149` — câu này còn LÀM MỘT VIỆC THỨ HAI, và là việc quan trọng hơn: nó
     * quyết định **chép tệp nào**. Bản `0148` chỉ hỏi *"có tệp không"* rồi để
     * `document` tự chọn từ bảng của nó — tức lấy nhầm bảng. `pol.policy_attachment`
     * là bảng duy nhất trả lời được *"hồ sơ cũ có tệp gì"*; bảng bên kia trả lời
     * *"tệp nào tồn tại"*, và hai câu ấy lệch nhau đúng ở tệp đã GỠ và tệp MỒ
     * CÔI. Kết quả của bản cũ: giấy tờ TDV đã gỡ quay lại ở bản mới.
     */
    const khoaGiayTo = active
      ? (
          await this.db.q<{ object_key: string }>(
            `SELECT object_key FROM pol.policy_attachment
              WHERE policy_id = $1 AND kind = 'HO_SO' ORDER BY uploaded_at`,
            [active.id],
          )
        ).map((x) => x.object_key)
      : [];

    const tepThuaKe =
      khoaGiayTo.length > 0
        ? await this.clients.saoChepGiayTo(active!.id, policyId, khoaGiayTo)
        : [];

    return this.db.tx(async (c) => {
      const created = await c.query<PolicyRow>(
        `INSERT INTO pol.policy
           (id, code, customer_id, version_no, status, supersedes_id,
            created_by, tdv_user_id, app_version)
         VALUES ($7, pol.next_policy_code(), $1, $2, 'NHAP', $3, $4, $5, $6)
         RETURNING *`,
        [
          input.customerId,
          active ? active.version_no + 1 : 1,
          active?.id ?? null,
          me.id,
          customer.tdvUserId,
          process.env.APP_VERSION ?? '0.0.0-dev',
          policyId,
        ],
      );
      const policy = created.rows[0]!;

      /*
       * GIẤY TỜ HỒ SƠ THỪA KẾ (`0148`).
       *
       * Đứng cạnh lượt chép dòng sản phẩm ngay dưới, và cùng một lý do: bản mới
       * *trông như* đã thừa kế mọi thứ người lập nhớ đã nhập. Trước lượt này nó
       * thừa kế đủ mọi dòng sản phẩm mà không mang theo một tờ giấy nào — nên
       * người lập đọc màn hình ra "đã đầy đủ", gửi duyệt, và Trưởng bộ phận mở
       * ra không thấy giấy tờ nào. Không cảnh báo, không ai sai.
       *
       * Chép theo DANH SÁCH `document` trả về, không tự đọc bảng của mình: hai
       * bảng có thể đã lệch nhau (tệp mồ côi từ lượt tải lên hỏng nửa chừng), và
       * lượt chép không phải chỗ để cái lệch ấy nhân đôi.
       */
      if (tepThuaKe.length > 0) {
        await c.query(
          // `uploaded_by` GIỮ NGUYÊN người của bản gốc, không đổi thành người
          // vừa lập bản mới: câu mà cột này trả lời là *"ai đưa tờ giấy này vào
          // hệ thống"*, và lượt chép không đổi câu trả lời ấy. `document` giữ
          // cùng một quy ước cho dòng của nó, nên hai bên nói giống nhau.
          `INSERT INTO pol.policy_attachment
             (policy_id, kind, file_name, object_key, size_bytes, uploaded_by)
           SELECT $1, 'HO_SO', t.file_name, t.object_key, t.size_bytes::bigint, t.uploaded_by
             FROM unnest($2::text[], $3::text[], $4::text[], $5::uuid[])
               AS t(file_name, object_key, size_bytes, uploaded_by)`,
          [
            policy.id,
            tepThuaKe.map((t) => t.fileName),
            tepThuaKe.map((t) => t.objectKey),
            tepThuaKe.map((t) => t.sizeBytes),
            tepThuaKe.map((t) => t.uploadedBy),
          ],
        );
      }

      // Phiên bản mới CHỨA LẠI toàn bộ sản phẩm cũ: chép nguyên dòng cũ trước,
      // rồi mới áp các dòng người dùng gửi lên đè lên (POL-05, POL-07, muc 5.4).
      if (active) {
        await c.query(
          // Chép cả `rule_code_snap` và `threshold_source`: dòng thừa kế giữ
          // NGUYÊN ngưỡng của bản cũ, nên nó cũng phải giữ nguyên câu trả lời
          // "ngưỡng ấy từ đâu ra". Bỏ hai cột này lại thì dòng thừa kế mang
          // ngưỡng cũ mà nguồn rỗng, và giao diện đọc ra là "không rõ".
          // `ngay_ap_dung` chép theo (`0180`): ngày áp dụng thuộc về DÒNG, và
          // dòng thừa kế là chính dòng cũ — nó giữ nguyên ngày của nó cho tới
          // khi TDV sửa. Đặt lại thành hôm nay ở đây là âm thầm dời ngày áp dụng
          // của mọi mặt hàng cũ mỗi lần lập một phiên bản mới.
          `INSERT INTO pol.policy_line
             (policy_id, product_id, product_code_snap, product_name_snap,
              company_price_snap, wholesale_price, cpbh,
              discount_rate, threshold_snap, rule_code_snap, threshold_source, note,
              ngay_ap_dung)
           SELECT $1, product_id, product_code_snap, product_name_snap,
                  company_price_snap, wholesale_price, cpbh,
                  discount_rate, threshold_snap, rule_code_snap, threshold_source, note,
                  ngay_ap_dung
             FROM pol.policy_line WHERE policy_id = $2`,
          [policy.id, active.id],
        );
      }

      /*
       * Tra ảnh chụp CẢ LÔ trước vòng lặp: gọi từng dòng thì hồ sơ 30 sản phẩm
       * là 30 vòng mạng nối tiếp sang catalog.
       *
       * `0180` — NGÀY ÁP DỤNG là của TỪNG DÒNG, nên một lô không đủ: hai dòng
       * khác ngày phải tra hai bảng giá. Gom theo NGÀY, một vòng mạng cho mỗi
       * ngày khác nhau — thường là một, và tệ nhất cũng chỉ bằng số ngày người
       * lập thật sự khai chứ không bằng số dòng.
       */
      const theoNgay = new Map<string, LineInput[]>();
      for (const line of input.lines) {
        const on = line.ngayApDung ?? homNay;
        (theoNgay.get(on) ?? theoNgay.set(on, []).get(on)!).push(line);
      }
      for (const [on, nhom] of theoNgay) {
        const snaps = await this.clients.productSnapshots(
          nhom.map((l) => l.productId),
          customer.customerType,
          on,
        );
        for (const line of nhom) {
          await this.upsertLine(
            c,
            policy.id,
            { ...line, ngayApDung: on },
            { ...customer, on },
            snaps.get(line.productId),
          );
        }
      }

      await this.recordEvent(c, policy.id, null, 'NHAP', 'CREATE', me, undefined);
      await emit(c, 'policy.created', {
        ...evtCtx(policy, customer),
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policy.id, c);
    });
  }

  /** Thêm hoặc sửa một dòng sản phẩm, đóng băng giá và ngưỡng tại thời điểm này. */
  private async upsertLine(
    c: PoolClient,
    policyId: string,
    line: LineInput,
    customer: { customerType: number; on?: string | undefined },
    preloaded?: import('../infra/clients.js').ProductSnapshot | undefined,
  ): Promise<void> {
    const snap =
      preloaded ??
      (await this.clients.productSnapshot(line.productId, customer.customerType, customer.on));
    if (snap.status !== 'DANG_AP_DUNG') {
      throw new BadRequestException({
        code: 'PRODUCT_DISABLED',
        message: `Sản phẩm ${snap.productCode} đã vô hiệu hoá, không đưa vào hồ sơ mới được`,
      });
    }

    let calc;
    try {
      calc = computeLine({
        companyPrice: BigInt(snap.companyPrice),
        wholesalePrice: line.wholesalePrice,
        cpbh: line.cpbh ?? [],
        // Không có ngưỡng thì bỏ trường đi, chứ không gửi 0: `computeLine` coi
        // `undefined` là "không đối chiếu được", còn 0 là "ngưỡng bằng không" và
        // mọi dòng sẽ bị đánh dấu vượt ngưỡng.
        ...(snap.thresholdRate2 === null ? {} : { threshold: snap.thresholdRate2 }),
      });
    } catch (e) {
      if (e instanceof InvalidLineError) {
        throw new BadRequestException({ code: e.code, message: e.message });
      }
      throw e;
    }

    // Rate2 (1235) sang numeric(5,2) (12.35). Chia ở ĐÚNG một chỗ này; con số
    // đem so ngưỡng đã được làm tròn từ trước trong computeLine.
    const rate = (calc.discountRate / 100).toFixed(2);
    const threshold = snap.thresholdRate2 === null ? null : (snap.thresholdRate2 / 100).toFixed(2);

    await c
      .query(
        `INSERT INTO pol.policy_line
           (policy_id, product_id, product_code_snap, product_name_snap,
            company_price_snap, wholesale_price, cpbh,
            discount_rate, threshold_snap, rule_code_snap, threshold_source, note,
            ngay_ap_dung)
         VALUES ($1,$2,$3,$4,$5,$6,$7::bigint[],$8,$9,$10,$11,$12,$13)
         ON CONFLICT (policy_id, product_id) DO UPDATE SET
            wholesale_price = EXCLUDED.wholesale_price,
            cpbh = EXCLUDED.cpbh,
            company_price_snap = EXCLUDED.company_price_snap,
            discount_rate = EXCLUDED.discount_rate,
            threshold_snap = EXCLUDED.threshold_snap,
            rule_code_snap = EXCLUDED.rule_code_snap,
            threshold_source = EXCLUDED.threshold_source,
            ngay_ap_dung = EXCLUDED.ngay_ap_dung,
            -- Thiếu note trong thân request là XOÁ ghi chú, không phải "giữ
            -- nguyên". Biểu mẫu sửa dòng gửi lên toàn bộ nội dung dòng, nên
            -- không có ô ghi chú nghĩa là người dùng vừa xoá nó đi.
            note = EXCLUDED.note`,
        [
          policyId,
          line.productId,
          snap.productCode,
          snap.productName,
          snap.companyPrice,
          line.wholesalePrice.toString(),
          (line.cpbh ?? []).map((v) => v.toString()),
          rate,
          threshold,
          // Đóng băng CÙNG LÚC với `threshold_snap`, từ cùng một lời gọi
          // `resolve`. Tra lại ở chỗ khác là chấp nhận hai con số lệch nhau khi
          // danh mục đổi giữa hai lời gọi.
          snap.ruleCode ?? null,
          snap.thresholdSource,
          line.note?.trim() || null,
          // `0180` — ngày áp dụng của dòng. `customer.on` là CHÍNH ngày ấy: nó
          // vừa được dùng để tra bảng giá vài dòng trên, nên hai con số không
          // thể lệch nhau. Rơi về hôm nay chỉ xảy ra ở đường gọi không khai
          // ngày, và `create` đã điền sẵn trước khi tới đây.
          customer.on ?? ngayVN(),
        ],
      )
      .catch((e: unknown) => {
        if (pgCode(e) === PG.uniqueViolation) {
          throw new ConflictException({
            code: 'DUPLICATE_PRODUCT',
            message: `Sản phẩm ${snap.productCode} đã có trong hồ sơ này`,
          });
        }
        throw e;
      });
  }

  /** Thêm một dòng vào hồ sơ đang sửa được (POL-02). */
  async addLine(policyId: string, line: LineInput, me: AuthUser) {
    const p = await this.mustEdit(policyId, me);
    const customer = await this.clients.customer(p.customer_id);
    return this.db.tx(async (c) => {
      const dup = await c.query<{ da_xoa: boolean }>(
        `SELECT da_xoa FROM pol.policy_line WHERE policy_id = $1 AND product_id = $2`,
        [policyId, line.productId],
      );
      /*
       * HAI MÃ LỖI, vì hai tình huống và hai việc phải làm (`0186`).
       *
       * Dòng đã rút vẫn CHIẾM chỗ sản phẩm của nó (`uq_policy_line_product` giữ
       * nguyên), nên thêm lại bằng đường này va vào đúng phép canh trùng — và
       * câu *"sản phẩm này đã có trong hồ sơ"* lúc ấy đọc như một lời nói dối:
       * người dùng vừa nhìn thấy nó nằm đó, mờ đi, dưới nhãn *Đã xoá*.
       *
       * Không biến lượt này thành khôi phục ngầm: `addLine` mang theo giá bán
       * buôn và CPBH mới gõ, nên "ghi đè cho tiện" sẽ âm thầm bỏ đúng những con
       * số của dòng cũ mà nút *Thêm lại* sinh ra để giữ. Chỉ đường sang nút ấy —
       * cùng lý do `0027` tách `updateLine` khỏi `addLine`.
       */
      if (dup.rows[0]?.da_xoa === true) {
        throw new ConflictException({
          code: 'PRODUCT_LINE_DELETED',
          message:
            'Sản phẩm này đang nằm trong hồ sơ ở trạng thái Đã xoá. ' +
            'Bấm Thêm lại ngay trên dòng đó để đưa nó trở lại.',
        });
      }
      if ((dup.rowCount ?? 0) > 0) {
        throw new ConflictException({
          code: 'DUPLICATE_PRODUCT',
          message: 'Sản phẩm này đã có trong hồ sơ',
        });
      }
      // `0180` — ngày của CHÍNH DÒNG NÀY quyết định bảng giá được chụp, không
      // phải một ngày của hồ sơ. Thiếu thì hôm nay (`ngayVN`).
      await this.upsertLine(c, policyId, line, { ...customer, on: line.ngayApDung ?? ngayVN() });
      await this.bumpVersion(c, policyId);
      await emit(c, 'policy.updated', {
        ...evtCtx(p, customer),
        change: 'LINE_ADDED',
        productId: line.productId,
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policyId, c);
    });
  }

  /**
   * Sửa một dòng đã có: giá bán buôn và các khoản chi phí.
   *
   * Đường RIÊNG chứ không cho `addLine` ghi đè khi trùng sản phẩm. Trùng sản
   * phẩm lúc THÊM là một nhầm lẫn — người dùng tưởng mình đang thêm mặt hàng
   * mới — và `POL-02` chặn nó có chủ ý. Biến nó thành ghi đè im lặng là đánh
   * mất một cái chặn đúng để đổi lấy một chức năng khác hẳn.
   *
   * SẢN PHẨM KHÔNG ĐỔI ĐƯỢC. Đổi sản phẩm của một dòng là xoá dòng này và thêm
   * dòng khác; hai việc ấy có ý nghĩa nghiệp vụ khác nhau và để lại vết khác
   * nhau trong nhật ký.
   *
   * Giá bán Công ty và ngưỡng chiết khấu CHỤP LẠI theo danh mục tại thời điểm
   * sửa, đúng như lúc thêm dòng — hồ sơ chưa gửi duyệt thì con số của nó phải
   * là con số hiện hành, nếu không thì sửa một khoản chi phí lại vô tình giữ
   * nguyên một mức giá đã cũ.
   */
  async updateLine(
    policyId: string,
    lineId: string,
    input: {
      wholesalePrice: bigint;
      cpbh?: readonly bigint[] | undefined;
      note?: string | undefined;
      ngayApDung?: string | undefined;
    },
    me: AuthUser,
  ) {
    const p = await this.mustEdit(policyId, me);
    const customer = await this.clients.customer(p.customer_id);
    return this.db.tx(async (c) => {
      const cu = await c.query<{ product_id: string; ngay_ap_dung: Date }>(
        `SELECT product_id, ngay_ap_dung FROM pol.policy_line WHERE id = $1 AND policy_id = $2`,
        [lineId, policyId],
      );
      if (cu.rowCount === 0) throw new NotFoundException({ code: 'LINE_NOT_FOUND' });

      /*
       * THIẾU NGÀY LÀ GIỮ NGUYÊN, không phải xoá (`0180`).
       *
       * Ngược với `note` ngay bên cạnh, và có lý do: `note` rỗng là một trạng
       * thái hợp lệ nên "vắng mặt = xoá" nói được điều gì đó, còn `ngay_ap_dung`
       * là `NOT NULL` — không có "dòng không có ngày áp dụng" để mà xoá về. Rơi
       * về hôm nay thì tệ hơn nữa: sửa một khoản chi phí của dòng áp dụng từ
       * tháng sau sẽ âm thầm kéo nó về hôm nay.
       */
      const on = input.ngayApDung ?? ngayISO(cu.rows[0]!.ngay_ap_dung)!;
      await this.upsertLine(
        c,
        policyId,
        { productId: cu.rows[0]!.product_id, ...input, ngayApDung: on },
        { ...customer, on },
      );
      await this.bumpVersion(c, policyId);
      await emit(c, 'policy.updated', {
        ...evtCtx(p, customer),
        change: 'LINE_UPDATED',
        lineId,
        productId: cu.rows[0]!.product_id,
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policyId, c);
    });
  }

  /**
   * Rút một mặt hàng khỏi phiên bản đang soạn (`0186`).
   *
   * HAI KẾT CỤC, hệ thống chọn theo dòng chứ không hỏi người dùng — cùng lối
   * với `remove()` ở ngay dưới:
   *
   *   * **Dòng thừa kế** (có ở bản bị thay thế) → `da_xoa = true`. Dòng nằm lại
   *     bảng, làm mờ, mang nhãn *Đã xoá*, và đi cùng hồ sơ suốt luồng duyệt để
   *     người duyệt thấy khách hàng đang mất mặt hàng nào. Xoá hẳn ở bước cuối,
   *     khi hồ sơ sang *Đang có hiệu lực* — xem `workflow.service.ts`.
   *   * **Dòng *Bổ sung*** → `DELETE`. Mặt hàng chưa bao giờ thuộc về khách
   *     hàng này, nên không có gì để cho ai xem; để lại một dòng mờ chỉ làm
   *     bảng dài thêm bằng một thông tin không ai dùng.
   *
   * Điều kiện là `SQL_DONG_THUA_KE`, KHÔNG phải *"trạng thái đang áp dụng"* —
   * xem chú thích của hằng ấy về việc vì sao chỗ này đọc khác chữ khách hàng
   * viết.
   *
   * Xoá một dòng đã xoá là `LINE_NOT_FOUND`: nút Xoá không hiện trên dòng mờ,
   * nên lượt gọi ấy chỉ đến từ một màn hình cũ hoặc một lượt gọi tay, và trả
   * `200` cho nó là nói rằng vừa có việc gì đó xảy ra.
   */
  async removeLine(policyId: string, lineId: string, me: AuthUser) {
    const p = await this.mustEdit(policyId, me);
    return this.db.tx(async (c) => {
      const dong = await c.query<{ thua_ke: boolean }>(
        `SELECT ${SQL_DONG_THUA_KE} AS thua_ke
           FROM pol.policy_line l
           ${SQL_NOI_BAN_TRUOC}
          WHERE l.id = $2 AND l.policy_id = $1 AND NOT l.da_xoa`,
        [policyId, lineId],
      );
      if (dong.rowCount === 0) throw new NotFoundException({ code: 'LINE_NOT_FOUND' });

      await c.query(
        dong.rows[0]!.thua_ke
          ? `UPDATE pol.policy_line SET da_xoa = true WHERE id = $1 AND policy_id = $2`
          : `DELETE FROM pol.policy_line WHERE id = $1 AND policy_id = $2`,
        [lineId, policyId],
      );
      await this.bumpVersion(c, policyId);
      await emit(c, 'policy.updated', {
        ...evtCtx(p),
        change: 'LINE_REMOVED',
        lineId,
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policyId, c);
    });
  }

  /**
   * THÊM LẠI một dòng đã rút (`0186`).
   *
   * Khách hàng chốt: *"ở trạng thái Nháp hoặc Yêu cầu chỉnh sửa cho phép thêm
   * lại dòng sản phẩm đã xoá"*. Hai trạng thái ấy đúng bằng `SUA_DUOC`, nên
   * `mustEdit` đã là phép canh — không khai lại một danh sách trạng thái thứ
   * hai ở đây, vì hai danh sách là hai danh sách sẽ lệch.
   *
   * KHÔNG hỏi lại danh mục, và đó là cả điểm của việc khôi phục đúng DÒNG CŨ
   * thay vì thêm một dòng mới: mặt hàng có thể đã vô hiệu hoá trong danh mục —
   * thường thì đó chính là lý do TDV vừa rút nó — và đường thêm mới chặn ở
   * `PRODUCT_DISABLED`. Không có đường này thì một lượt bấm nhầm Xoá là không
   * lùi lại được, kể cả khi hồ sơ còn nguyên trong tay người lập.
   *
   * Dòng quay lại NGUYÊN SỐ CŨ. Khôi phục là hoàn tác lượt XOÁ, không phải hoàn
   * tác những lượt sửa trước đó: một dòng đã sửa rồi bị rút thì thêm lại phải
   * mang đúng con số TDV đã gõ, nếu không thì nút này âm thầm làm hai việc.
   * `lamMoiDong` chụp lại giá và ngưỡng ở lượt đọc kế tiếp như mọi dòng khác —
   * hoặc báo `STALE_LINE` lúc gửi duyệt nếu mặt hàng đã vô hiệu hoá, đúng câu
   * trả lời cho *"tôi vừa thêm lại một thứ không còn bán"*.
   */
  async khoiPhucDong(policyId: string, lineId: string, me: AuthUser) {
    const p = await this.mustEdit(policyId, me);
    return this.db.tx(async (c) => {
      const r = await c.query(
        `UPDATE pol.policy_line SET da_xoa = false
          WHERE id = $1 AND policy_id = $2 AND da_xoa`,
        [lineId, policyId],
      );
      if (r.rowCount === 0) throw new NotFoundException({ code: 'LINE_NOT_FOUND' });

      await this.bumpVersion(c, policyId);
      await emit(c, 'policy.updated', {
        ...evtCtx(p),
        change: 'LINE_RESTORED',
        lineId,
        actorId: me.id,
        at: new Date().toISOString(),
      });
      return this.load(policyId, c);
    });
  }

  /*
   * `updateAppliedDate` GỠ HẲN ở `0180`, cùng với `PATCH /policies/:id`.
   *
   * Đó là đường duy nhất của cả API để đổi một trường của hồ sơ, và trường duy
   * nhất nó đổi được là ngày áp dụng — thứ vừa chuyển xuống dòng sản phẩm. Đổi
   * ngày giờ là `PATCH /policies/:id/lines/:lineId`, đi chung đường với giá bán
   * buôn và các khoản CPBH của chính dòng ấy.
   *
   * Nhánh `change: 'APPLIED_DATE'` của `policy.updated` mất theo. Nhật ký cũ
   * GIỮ NGUYÊN — nó kể chuyện đã xảy ra (`0155`).
   */

  /**
   * Chụp lại giá và ngưỡng cho MỌI dòng của một hồ sơ CÒN SỬA ĐƯỢC (`0029`).
   *
   * Hồ sơ Nháp không đóng băng. Nó là một bản đang soạn, và con số trên nó phải
   * là con số sẽ được đóng băng nếu bấm Gửi duyệt ngay lúc ấy — nếu không thì
   * người lập ký gửi một thứ khác với thứ họ vừa đọc.
   *
   * KHÔNG chạm tới `row_version`: đó là khoá lạc quan của luồng duyệt, và một
   * lượt ĐỌC làm hỏng thẻ khoá mà người dùng đang cầm là một lỗi 409 không giải
   * thích được. Cũng KHÔNG phát `policy.updated`: không có người nào vừa sửa gì.
   *
   * Trả về danh sách dòng KHÔNG làm mới được — sản phẩm đã vô hiệu hoá, hoặc
   * chưa có giá tại ngày áp dụng. Những dòng ấy GIỮ NGUYÊN số cũ: chặn ở đây là
   * chặn người dùng mở chính hồ sơ của họ ra để sửa cái dòng hỏng. Chỗ chặn đúng
   * là lúc GỬI DUYỆT, xem `workflow.service.ts`.
   */
  async lamMoiDong(c: PoolClient, policyId: string): Promise<string[]> {
    const p = await c.query<{ customer_id: string; status: string }>(
      `SELECT customer_id, status::text AS status FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    const ho = p.rows[0];
    if (!ho || !EDITABLE.includes(ho.status)) return [];

    const dong = await c.query<{
      product_id: string;
      product_code_snap: string;
      ngay_ap_dung: Date;
    }>(
      /*
       * DÒNG ĐÃ RÚT KHÔNG LÀM MỚI VÀ KHÔNG CHẶN GỬI DUYỆT (`0186`).
       *
       * Đây là chỗ bế tắc của khách hàng tan ra. Mặt hàng bị vô hiệu hoá trong
       * danh mục làm dòng thừa kế của nó thành `hong`, `hong` thành `STALE_LINE`
       * lúc gửi duyệt, và câu lỗi bảo *"xoá sản phẩm đó rồi gửi lại"* — trong
       * khi `POL-08` lại chặn đúng lượt xoá ấy. Hai chốt chặn cấm nhau, hồ sơ
       * chết hẳn ở Nháp.
       *
       * `0186` gỡ `POL-08`, nên xoá là làm được. Nhưng chỉ thế thì vẫn kẹt: dòng
       * đã rút VẪN NẰM LẠI bảng, nên nó vẫn đi qua đây và vẫn thành `hong`. Một
       * dòng sắp biến mất khỏi hồ sơ thì không có con số nào của nó cần đúng —
       * hỏi danh mục về nó là hỏi một câu không dùng để làm gì, rồi chặn người
       * lập bằng chính câu trả lời.
       */
      `SELECT product_id, product_code_snap, ngay_ap_dung
         FROM pol.policy_line WHERE policy_id = $1 AND NOT da_xoa`,
      [policyId],
    );
    if (dong.rowCount === 0) return [];

    const customer = await this.clients.customer(ho.customer_id);
    /*
     * MỘT VÒNG MẠNG CHO MỖI NGÀY, không phải cho mỗi dòng (`0180`).
     *
     * Hàm này chạy ở đường ĐỌC nên chi phí của nó là thứ người dùng ngồi chờ.
     * Trước `0180` cả hồ sơ dùng chung một ngày nên một vòng là đủ; giờ mỗi dòng
     * có ngày riêng, và gom theo ngày giữ được đúng tính chất ấy ở trường hợp
     * thường gặp — mọi dòng cùng ngày thì vẫn đúng một vòng.
     */
    const snaps = new Map<string, import('../infra/clients.js').ProductSnapshot>();
    const theoNgay = new Map<string, string[]>();
    for (const d of dong.rows) {
      const on = ngayISO(d.ngay_ap_dung)!;
      (theoNgay.get(on) ?? theoNgay.set(on, []).get(on)!).push(d.product_id);
    }
    for (const [on, ids] of theoNgay) {
      const lo = await this.clients.productSnapshots(ids, customer.customerType, on);
      for (const id of ids) {
        const s = lo.get(id);
        if (s) snaps.set(id, s);
      }
    }

    const hong: string[] = [];
    for (const d of dong.rows) {
      const snap = snaps.get(d.product_id);
      if (!snap || snap.status !== 'DANG_AP_DUNG') {
        hong.push(d.product_code_snap);
        continue;
      }
      // Đọc lại giá bán buôn và CPBH từ chính dòng đang có: chúng là con số
      // NGƯỜI DÙNG nhập, không phải ảnh chụp danh mục, nên làm mới không được
      // đụng tới. Chỉ ba thứ đến từ danh mục mới được tính lại.
      const cu = await c.query<{ wholesale_price: string; cpbh: string[] }>(
        `SELECT wholesale_price::text, cpbh::text[] AS cpbh
           FROM pol.policy_line WHERE policy_id = $1 AND product_id = $2`,
        [policyId, d.product_id],
      );
      const g = cu.rows[0]!;
      let calc;
      try {
        calc = computeLine({
          companyPrice: BigInt(snap.companyPrice),
          wholesalePrice: BigInt(g.wholesale_price),
          cpbh: (g.cpbh ?? []).map((v) => BigInt(v)),
          ...(snap.thresholdRate2 === null ? {} : { threshold: snap.thresholdRate2 }),
        });
      } catch {
        // Giá bán Công ty mới có thể làm dòng cũ thành vô lý (giá thu về âm chẳng
        // hạn). Không ghi đè bằng một con số sai — để nguyên và báo ở lúc gửi.
        hong.push(d.product_code_snap);
        continue;
      }

      await c.query(
        `UPDATE pol.policy_line
            SET product_code_snap  = $3,
                product_name_snap  = $4,
                company_price_snap = $5,
                discount_rate      = $6,
                threshold_snap     = $7,
                rule_code_snap     = $8,
                threshold_source   = $9
          WHERE policy_id = $1 AND product_id = $2`,
        [
          policyId,
          d.product_id,
          snap.productCode,
          snap.productName,
          snap.companyPrice,
          (calc.discountRate / 100).toFixed(2),
          snap.thresholdRate2 === null ? null : (snap.thresholdRate2 / 100).toFixed(2),
          snap.ruleCode ?? null,
          snap.thresholdSource,
        ],
      );
    }
    return hong;
  }

  /**
   * TDV bỏ một hồ sơ (`0035`, mở rộng ở `0039`).
   *
   * BA trạng thái xoá được — xem `XOA_DUOC`:
   *
   *   * `NHAP` — chưa gửi duyệt.
   *   * `YEU_CAU_CHINH_SUA` — gom cả ba đường trả về: Trưởng bộ phận yêu cầu
   *     chỉnh sửa, Kế toán không tiếp nhận L1, Kế toán không tiếp nhận L2.
   *
   * (`TU_CHOI` từng nằm trong danh sách này từ `0039`; `0155` bỏ hẳn trạng thái
   * ấy nên nó biến mất khỏi đây theo.)
   *
   * HAI KẾT CỤC, hệ thống chọn theo trạng thái chứ không hỏi người dùng:
   *
   *   * `NHAP` → xoá hẳn dòng, không ghi nhật ký. Hồ sơ chưa gửi duyệt thì chưa
   *     ai ngoài người lập thấy nó; ghi một dòng "đã xoá" cho mỗi lần lập nhầm
   *     là chống spam ngược — người lập sẽ ngại mở bản nháp.
   *   * `YEU_CAU_CHINH_SUA` → `DA_XOA` và ghi nhật ký. Hồ sơ đã qua tay người
   *     khác và đã bị trả lại kèm lý do; xoá sạch là làm biến mất luôn phần việc
   *     của họ.
   */
  async remove(policyId: string, me: AuthUser) {
    // Đọc thẳng dòng nguồn, KHÔNG qua `byId`: đường kia làm mới giá và ngưỡng
    // trước khi trả về (`0029`), tức là một lượt GHI vào hồ sơ ngay trước khi
    // xoá nó. Ở đây chỉ cần bốn cột người, trạng thái và mã.
    const p = await this.db.one<PolicyRow>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.assertPolicyInScope(p, me);

    if (!XOA_DUOC.includes(p.status)) {
      throw new ForbiddenException({
        code: 'ONLY_EDITABLE_DELETABLE',
        message:
          'Chỉ xoá được hồ sơ ở Nháp, Yêu cầu chỉnh sửa hoặc Từ chối; ' +
          `hồ sơ đang ở ${p.status}`,
      });
    }
    /*
     * NGƯỜI PHỤ TRÁCH HIỆN TẠI, không phải người đã lập.
     *
     * Trước `0035` chỗ này so với `createdBy`, và nó sai từ lúc có bàn giao
     * (`0032`): TDV nghỉ việc thì hồ sơ sang tay người kế nhiệm qua
     * `tdv_user_id`, còn `created_by` vẫn trỏ vào tài khoản đã vô hiệu hoá. So
     * với `created_by` là để lại đúng loại hồ sơ treo mà đợt bàn giao sinh ra
     * để dọn — không ai xoá được nữa, kể cả người đang phải xử lý nó.
     */
    if (p.tdv_user_id !== me.id) {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message: 'Chỉ TDV đang phụ trách hồ sơ này mới xoá được.',
      });
    }

    // Mã và tên khách hàng cho lá thư báo, lấy TRƯỚC transaction. Nuốt lỗi có
    // chủ ý: đây là thứ trang trí cho thông báo, còn xoá một hồ sơ của chính
    // mình thì không có lý do gì phải hỏng chỉ vì `customer` đang tắt.
    const cus = await this.clients.customer(p.customer_id).catch(() => undefined);

    // Xoá và báo xoá trong CÙNG transaction. Tách ra thì hồ sơ biến mất khỏi
    // nguồn mà vẫn nằm lại trong read-model báo cáo — và không có sự kiện nào
    // sau đó để sửa, vì hồ sơ không còn tồn tại để phát sự kiện nữa.
    await this.db.tx(async (c) => {
      const chung = {
        ...evtCtx(p, cus),
        actorId: me.id,
        at: new Date().toISOString(),
      };

      if (p.status === 'NHAP') {
        await c.query(`DELETE FROM pol.policy WHERE id = $1`, [policyId]);
        await emit(c, 'policy.deleted', chung);
        return;
      }

      await c.query(
        `UPDATE pol.policy SET status = 'DA_XOA', row_version = row_version + 1,
                sla_due_at = NULL, sla_started_at = NULL, pending_step = NULL
          WHERE id = $1`,
        [policyId],
      );
      await this.recordEvent(c, policyId, p.status, 'DA_XOA', 'DELETE', me, undefined);
      /*
       * `policy.discarded`, KHÔNG phải `policy.deleted`.
       *
       * Hai khoá cho hai chuyện khác hẳn nhau ở phía reporting: `policy.deleted`
       * nghĩa là dòng nguồn không còn, và `sync.service.ts` xoá dòng read-model
       * theo nó. Dùng lại khoá ấy ở đây thì hồ sơ `DA_XOA` biến mất khỏi mọi báo
       * cáo — đúng thứ mà việc giữ lại lịch sử sinh ra để tránh.
       *
       * (Khác `policy.scan_discarded`: bản kia nói về một tệp scan bị huỷ, hồ sơ
       * vẫn đi tiếp.)
       */
      await emit(c, 'policy.discarded', {
        ...chung,
        fromStatus: p.status,
        toStatus: 'DA_XOA',
        action: 'DELETE',
        // Người đã trả hồ sơ lại đang chờ nó quay về. Không báo thì họ chờ một
        // thứ sẽ không bao giờ tới, và hồ sơ chỉ lặng lẽ rời khỏi danh sách.
        recipients: ['TBP', 'KE_TOAN'],
        // Và cả những người đã tác động ở các bước trước (`0036`).
        observers: await daTacDong(c, policyId),
        tbpUserId: p.tbp_user_id,
        keToanUserId: p.ke_toan_user_id,
        saleAdminUserId: p.sale_admin_user_id,
      });
    });
  }

  // --- Đọc ------------------------------------------------------------------

  /**
   * Mở một hồ sơ. Hồ sơ CÒN SỬA ĐƯỢC thì làm mới giá và ngưỡng trước (`0029`).
   *
   * Kiểm phạm vi TRƯỚC khi làm mới: làm mới là một lượt ghi, và ghi vào một hồ
   * sơ ngoài phạm vi của người gọi — dù chỉ ghi lại đúng con số danh mục — là
   * một tác dụng phụ do người ngoài kích hoạt.
   *
   * Lỗi của bước làm mới bị NUỐT có chủ ý. Nó là một tiện ích, không phải điều
   * kiện để đọc hồ sơ: catalog chết thì người dùng vẫn phải xem được hồ sơ của
   * mình, với con số của lần chụp gần nhất.
   */
  async byId(policyId: string, me: AuthUser) {
    const so = await this.db.one<PolicyRow & { status: string }>(
      // `da_qua_tbp` đi kèm vì `assertPolicyInScope` cần nó cho luật riêng của
      // Kế toán (`0142`) — thiếu ở đây thì chốt chặn im lặng không chặn gì.
      `SELECT tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id,
              status::text AS status, kt_l1_received_at, kt_l2_received_at,
              tbp_signed_at, tbp_signed_by, sa_handover_at, da_qua_tbp
         FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    if (!so) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.assertPolicyInScope(so, me);

    if (EDITABLE.includes(so.status)) {
      await this.db.tx((c) => this.lamMoiDong(c, policyId)).catch(() => undefined);
    }
    const p = await this.load(policyId);
    /*
     * `xoaDuoc` tính Ở ĐÂY rồi gửi kèm hồ sơ (`0039`).
     *
     * Trước đó giao diện suy điều kiện xoá từ `allowed-actions`: hồ sơ nào còn
     * `SUBMIT` hoặc `RESUBMIT_AFTER_EDIT` thì sửa được, mà sửa được thì xoá
     * được. `0039` cắt đứt phép suy ấy bằng `TU_CHOI` — một trạng thái xoá được
     * mà không có hành động nào đi ra. `0155` bỏ trạng thái ấy, nên hôm nay hai
     * danh sách lại trùng nhau; cờ này vẫn giữ, vì nó còn mang cả phần "đúng
     * người phụ trách" mà giao diện không tự biết được.
     *
     * Chép danh sách trạng thái sang giao diện là dựng bản sao thứ hai phải giữ
     * đồng bộ; trả về một cờ BOOLEAN thì máy chủ vẫn là nơi duy nhất biết luật,
     * và nó đã tính sẵn cả phần "đúng người phụ trách" mà giao diện không biết.
     */
    /*
     * Ba cờ nữa cùng một lẽ (`0048`).
     *
     * Yêu cầu của khách hàng: thao tác nào không làm được thì ĐỪNG HIỆN, chứ
     * không phải hiện rồi bấm vào mới báo lỗi. Giao diện trước đó chỉ chặn theo
     * VAI TRÒ — Kế toán luôn thấy nút *Xuất hợp đồng*, ai có quyền đính kèm thì
     * luôn thấy nút *Tải tệp lên* — nên ở hồ sơ sai trạng thái, bấm vào là 409.
     *
     * Luật trạng thái vẫn nằm nguyên một chỗ ở máy chủ; giao diện nhận cờ đã
     * tính rồi và chỉ việc AND với bảng quyền của nó.
     */
    /*
     * Chênh lệch so với danh mục, gửi KÈM hồ sơ (`0050`).
     *
     * Trước đó nó chỉ có ở box *Yêu cầu cập nhật* trên trang tổng quan. Nhưng
     * người sắp ký mở thẳng hồ sơ ra — từ thư báo, từ hộp việc, từ danh sách —
     * và ở đó **không có gì nói rằng con số họ đang nhìn đã lỗi thời**. Box kia
     * chỉ cứu được người tình cờ ghé qua trang tổng quan trước.
     *
     * Đọc theo `DA_DONG_BANG` y như `impacted()`: dấu vết chỉ có nghĩa với hồ sơ
     * đã đóng băng số. Hồ sơ còn ở Nháp thì `byId` vừa làm mới giá ngay phía
     * trên, nên không thể lệch; hồ sơ đã từ chối hay đã xoá thì dấu vết cũ còn
     * sót lại cũng không còn ai cần.
     */
    const lech = DA_DONG_BANG.includes(p.status)
      ? await this.db.q<Record<string, unknown>>(
          `SELECT kind, product_code AS "productCode",
                  snap_value AS "snapValue", new_value AS "newValue"
             FROM pol.policy_impact WHERE policy_id = $1
            ORDER BY product_code, kind`,
          [policyId],
        )
      : [];

    /*
     * AI ĐÃ DUYỆT, và duyệt lúc nào (`0056`).
     *
     * Đầu màn hình hồ sơ chỉ có mã, phiên bản, ngày áp dụng và trạng thái — nên
     * câu hỏi thường gặp nhất khi mở một hồ sơ đã đi được vài bước ("ai ký cái
     * này?") phải trả lời bằng cách sang màn hình *Nhật ký*. Một chuyến đi cho
     * một dòng thông tin.
     *
     * MỐC THỜI GIAN đi kèm TÊN, không tách. "Trưởng bộ phận Nguyễn Văn A ký"
     * thiếu ngày thì vẫn phải mở nhật ký ra mới biết hồ sơ nằm đó bao lâu — và
     * đó chính là câu hỏi tiếp theo của người vừa đọc cái tên.
     *
     * Người ký lấy từ `tbp_signed_by` chứ không từ `tbp_user_id`: cột sau là
     * người ĐƯỢC PHÂN CÔNG, và hai cột ấy khác nhau khi có người duyệt thay.
     *
     * `userNames` nuốt lỗi và trả rỗng, nên identity chết thì mất tên chứ không
     * mất cả màn hình hồ sơ — cùng cách `events()` đã làm.
     */
    /*
     * KHÁCH HÀNG gửi kèm hồ sơ (`0061`).
     *
     * Màn hình hồ sơ tới `0060` không hiện khách hàng nào cả — chỉ có `customerId`
     * trong dữ liệu, không vẽ ra đâu hết. Nghĩa là người sắp ký một chính sách
     * bán hàng không đọc được nó dành cho ai, trừ khi tải bản A4 về.
     *
     * Gọi sang `customer` chứ không đọc bảng: policy không được đọc schema `cus`
     * (AD-02). Đây là màn hình CHI TIẾT một hồ sơ, mỗi lượt mở một khách hàng —
     * không phải hot path như danh sách, nơi tôi đã từ chối đúng chiều gọi này
     * ở `0031`.
     *
     * HỎNG THÌ TRẢ `null`, không ném: mất khối thông tin khách hàng thì khó chịu,
     * còn mất cả màn hình hồ sơ vì `customer` đang khởi động lại thì người đang
     * chờ ký không làm được gì. Cùng lẽ với `userNames` ngay dưới.
     */
    const [tenDuyet, khach] = await Promise.all([
      this.clients.userNames(
        // `createdBy` vào cùng lượt hỏi: người đề nghị là một cái tên nữa trên
        // cùng màn hình, và hỏi riêng là thêm một vòng mạng cho một chuỗi.
        [p.createdBy, so.tbp_signed_by, so.ke_toan_user_id, so.sale_admin_user_id].filter(
          (x): x is string => !!x,
        ),
      ),
      this.clients.customer(p.customerId).catch(() => null),
    ]);
    const nguoiDuyet = {
      tbp:
        so.tbp_signed_at === null
          ? null
          : {
              ten: (so.tbp_signed_by && tenDuyet[so.tbp_signed_by]) ?? null,
              luc: so.tbp_signed_at,
            },
      keToanL1:
        so.kt_l1_received_at === null
          ? null
          : {
              ten: (so.ke_toan_user_id && tenDuyet[so.ke_toan_user_id]) ?? null,
              luc: so.kt_l1_received_at,
            },
      keToanL2:
        so.kt_l2_received_at === null
          ? null
          : {
              ten: (so.ke_toan_user_id && tenDuyet[so.ke_toan_user_id]) ?? null,
              luc: so.kt_l2_received_at,
            },
      saleAdmin:
        so.sa_handover_at === null
          ? null
          : {
              ten: (so.sale_admin_user_id && tenDuyet[so.sale_admin_user_id]) ?? null,
              luc: so.sa_handover_at,
            },
    };

    return {
      ...p,
      lech,
      nguoiDuyet,
      /*
       * NGƯỜI ĐỀ NGHỊ (`0061`) — người LẬP hồ sơ, đọc từ `created_by`.
       *
       * Không phải `tdv_user_id`: cột kia là TDV đang phụ trách KHÁCH HÀNG, và
       * Sale Admin đổi được nó (`doiTdvPhuTrach`). Đổi người phụ trách xong mà
       * hồ sơ cũ đổi luôn tên người đề nghị là viết lại lịch sử — chữ ký đề nghị
       * trên một văn bản đã gửi đi thuộc về người đã gửi nó.
       */
      /*
       * `0101`: ảnh chụp trước, `created_by` sau.
       *
       * Hai nguồn gần như luôn cho cùng một tên, và lệch nhau ở đúng một chỗ:
       * hồ sơ còn Nháp mà sang tay, thì người GỬI không phải người LẬP. Chú
       * thích trên đã nói ý đúng — *"chữ ký đề nghị thuộc về người đã GỬI nó"* —
       * còn `created_by` trả lời "ai đã lập". Ảnh chụp mới đúng câu ấy.
       *
       * Và nó làm màn hình khớp với tờ giấy: `document` cũng đọc chính cột này.
       */
      nguoiDeNghi: {
        ten:
          (p as unknown as { nguoiDeNghiSnap: string | null }).nguoiDeNghiSnap ??
          tenDuyet[p.createdBy] ??
          null,
      },
      /*
       * KHỐI KHÁCH HÀNG ĐỌC CÙNG NGUỒN VỚI BẢN MỀM (`0101`).
       *
       * Ảnh chụp có mặt thì lấy ảnh chụp. Nếu không thì màn hình và tờ giấy nói
       * hai con số công nợ khác nhau cho cùng một hồ sơ, và người đọc không có
       * cách nào biết cái nào đúng — đúng thứ mà nếp "một câu hỏi, một chỗ trả
       * lời" cấm.
       *
       * Cùng lối với DÒNG SẢN PHẨM, vốn đã thế từ `0022`: màn hình hiện giá đã
       * đóng băng chứ không phải giá danh mục hôm nay, còn chuyện danh mục đã
       * trôi đi thì khối *Yêu cầu cập nhật* nói riêng. Muốn xem công nợ hiện tại
       * thì bấm sang trang khách hàng — liên kết nằm ngay ở ô Mã.
       *
       * `loai` và `trangThai` KHÔNG đóng băng: loại khách quyết định ngưỡng và
       * ngưỡng đã chụp vào từng dòng rồi; còn "đã ngừng hợp tác" là tin tức của
       * HÔM NAY, và đó chính là điều người mở hồ sơ cũ cần thấy.
       */
      khachHang: (() => {
        const s = p as unknown as { khTenSnap?: string | null };
        if (khach === null && !s.khTenSnap) return null;
        const anh = p as unknown as {
          khMaSnap: string | null;
          khTenSnap: string | null;
          khNguoiDaiDienSnap: string | null;
          khDiaChiDangKySnap: string | null;
          khSoNhaSnap: string | null;
          khTinhThanhSnap: string | null;
          khNoiNhanHangSnap: string | null;
          khCongNoSnap: string | null;
        };
        /*
         * ĐỊA CHỈ ĐĂNG KÝ, ba nhánh và chúng nói ba chuyện khác nhau (`0177`).
         *
         *   1. Hồ sơ chưa gửi duyệt  → chưa có ảnh chụp nào, đọc SỐNG hai ô.
         *   2. Gửi từ `0177` trở đi   → hai ô đã đóng băng, dùng chúng.
         *   3. Gửi TRƯỚC `0177`       → chỉ có chuỗi gộp; hai ô về `null` và màn
         *      hình bày MỘT ô *Địa chỉ đăng ký*.
         *
         * Nhánh 3 KHÔNG rơi về đọc sống hai ô của khách hàng hôm nay. Địa chỉ ấy
         * có thể đã đổi sau lượt gửi, và bày nó cạnh những ô đã đóng băng là
         * dựng ra một khối trộn hai thời điểm — đúng thứ `0101` sinh ra để
         * chống. Chuỗi gộp là thứ thật sự đã được đóng băng, không hơn.
         *
         * Điều kiện là `khTenSnap`, không phải `khSoNhaSnap`: câu hỏi ở đây là
         * *"hồ sơ này đã đóng băng chưa"*, và cột tên là cột trả lời nó ở khắp
         * `0101` (`khachHangCua` bên `document` cũng đọc đúng cột ấy).
         */
        const daDongBang = anh.khTenSnap !== null;
        return {
          ma: anh.khMaSnap ?? khach?.code ?? '',
          ten: anh.khTenSnap ?? khach?.name ?? '',
          nguoiDaiDien: anh.khNguoiDaiDienSnap ?? (daDongBang ? null : (khach?.ownerName ?? null)),
          soNha: anh.khSoNhaSnap ?? (daDongBang ? null : (khach?.streetWard ?? null)),
          tinhThanh: anh.khTinhThanhSnap ?? (daDongBang ? null : (khach?.province ?? null)),
          /*
           * Chuỗi gộp đi kèm, và nó CHỈ là giá trị lùi của nhánh 3 — màn hình
           * đọc nó khi và chỉ khi hai ô trên đều rỗng. Gửi cả ba xuống chứ không
           * để máy chủ tự chọn: hai ô rỗng vì "chưa khai" và hai ô rỗng vì "lượt
           * gửi ấy chưa chụp" là hai chuyện, và chỉ nơi có cả ba giá trị mới
           * phân biệt được.
           */
          diaChiDangKy: anh.khDiaChiDangKySnap ?? (daDongBang ? null : (khach?.registeredAddress ?? null)),
          /*
           * ĐỊA CHỈ GIAO HÀNG là một DANH SÁCH, tách từ cột gộp.
           *
           * `0154` cấm ký tự xuống dòng bên trong một địa chỉ, và chính ràng
           * buộc ấy làm cho cột gộp tách ngược ra được — khác hẳn địa chỉ đăng
           * ký ở ngay trên, nơi dấu ngăn `', '` cũng là một ký tự hợp lệ giữa
           * lòng một địa chỉ.
           *
           * Mảng RỖNG nghĩa là *"giao tới địa chỉ đăng ký"* (`0006`), không phải
           * thiếu dữ liệu — màn hình bỏ hẳn ô, không ghi dấu gạch.
           */
          noiNhanHang: tachDiaChi(
            anh.khNoiNhanHangSnap ?? (daDongBang ? null : (khach?.deliveryAddress ?? null)),
          ),
          loai: khach?.customerType ?? 0,
          congNo: anh.khCongNoSnap ?? khach?.debt ?? null,
          trangThai: khach?.status ?? null,
        };
      })(),
      xoaDuoc: xoaDuoc(p.status, so.tdv_user_id, me),
      // Một trường cho CẢ nút tải lên lẫn nút gỡ, theo loại tệp (`0097`).
      loaiTepGhiDuoc: loaiTepGhiDuoc(p.status, me.role),
      xuatHopDongDuoc: xuatHopDongDuoc(so.kt_l1_received_at ?? null),
      banScanCu: await this.banScanCu(policyId, p.status),
      banGiaoDuoc: await this.banGiaoDuoc(policyId),
      coBanMem: await this.coBanMem(policyId),
    };
  }

  /**
   * Bản scan đang đính kèm có phải BẢN KẾ TOÁN ĐÃ CHÊ không (`0050`).
   *
   * Từ `0050`, yêu cầu in lại KHÔNG còn xoá bản scan cũ — Sale Admin chủ động
   * gỡ và thay. Điều đó mở ra một khe: hồ sơ quay về `SA_DANG_XU_LY` mà vẫn đủ
   * điều kiện bàn giao, nên bấm bàn giao ngay là gửi lại đúng bản vừa bị chê, và
   * Kế toán nhận lại y nguyên thứ họ vừa từ chối.
   *
   * Cờ này KHÔNG chặn gì — nó chỉ để màn hình nói ra. Chặn là đi ngược yêu cầu
   * "Sale Admin CHỦ ĐỘNG": có những lần in lại mà bản scan cũ vẫn dùng được, ví
   * dụ bản giấy hỏng lúc chuyển phát chứ không phải bản in sai.
   *
   * So MỐC TẢI LÊN với lần yêu cầu in lại GẦN NHẤT, không so với một cờ đánh dấu
   * trên hồ sơ: một cờ phải nhớ xoá đúng lúc Sale Admin tải bản mới, và quên xoá
   * là cảnh báo dính vĩnh viễn. Mốc thời gian thì tự đúng.
   */
  /**
   * Bàn giao được chưa — nút *Bàn giao* sáng hay xám (`0160`, chốt 29/08).
   *
   * Cờ này KHÔNG phải chốt chặn. Chốt thật là `SCAN_REQUIRED` bên `workflow`, và
   * nó phải ở đó: giao diện giấu một nút không ngăn được ai gọi thẳng API. Đây
   * chỉ để **đừng bày ra một nút bấm vào chỉ nhận 409** — cùng nguyên tắc mà
   * `can.ts` đã viết cho 403.
   *
   * Dùng chung `SQL_CO_BAN_SCAN` với chốt chặn ấy, nên hai bên không lệch được.
   *
   * KHÔNG xét trạng thái. Nút chỉ hiện khi `allowed-actions` có `SA_HANDOVER`,
   * tức khi hồ sơ đang ở `SA_DANG_XU_LY` — máy trạng thái đã trả lời câu ấy rồi,
   * và hỏi lại ở đây là dựng bản sao thứ hai của máy trạng thái trong một hàm
   * chẳng liên quan gì tới nó.
   */
  private async banGiaoDuoc(policyId: string): Promise<boolean> {
    const r = await this.db.one<{ co: boolean }>(`SELECT ${SQL_CO_BAN_SCAN} AS co`, [policyId]);
    return r?.co === true;
  }

  /**
   * Hồ sơ đã có bản mềm đã lưu chưa (`0167`).
   *
   * Cờ RIÊNG chứ không gộp vào `banGiaoDuoc`, vì màn hình làm hai việc khác nhau
   * với hai câu trả lời:
   *
   *   thiếu BẢN SCAN  → nút *Bàn giao* XÁM. Sale Admin phải đi in, trình ký, scan
   *                     — một việc ngoài phần mềm, không nút nào làm hộ được.
   *   thiếu BẢN MỀM   → nút VẪN SÁNG, và bấm vào thì hộp tạo bản mềm mở ra trước.
   *                     Đây là việc phần mềm làm được ngay, nên chặn lại là bắt
   *                     người dùng tự đi tìm một nút mà hệ thống thừa biết.
   *
   * Gộp hai câu thành một cờ thì mất đúng sự phân biệt ấy: hoặc nút xám ở cả hai
   * ca (bắt người ta đi tìm), hoặc sáng ở cả hai (bấm vào ra 409).
   */
  private async coBanMem(policyId: string): Promise<boolean> {
    const r = await this.db.one<{ co: boolean }>(`SELECT ${SQL_CO_BAN_MEM} AS co`, [policyId]);
    return r?.co === true;
  }

  private async banScanCu(policyId: string, status: string): Promise<boolean> {
    if (status !== 'SA_DANG_XU_LY') return false;
    const r = await this.db.one<{ cu: boolean }>(
      `SELECT EXISTS (
                SELECT 1 FROM pol.policy_attachment a
                 WHERE a.policy_id = $1 AND a.kind = 'SCAN'
                   AND a.uploaded_at < (SELECT max(e.at) FROM pol.policy_event e
                                         WHERE e.policy_id = $1
                                           AND e.action = 'KT_REQUEST_REPRINT')
              ) AS cu`,
      [policyId],
    );
    return r?.cu === true;
  }

  /**
   * Hồ sơ ĐÃ ĐÓNG BĂNG đang lệch so với danh mục — box "Yêu cầu cập nhật" (`0029`).
   *
   * Cùng phép lọc phạm vi với hộp việc: `tdv_user_id` của hồ sơ phải nằm trong
   * cây của người gọi. TBP thấy hồ sơ của các TDV mình duyệt, Kế toán và Sale
   * Admin thấy nhánh của mình, TDV thấy của chính mình.
   *
   * Lọc trạng thái ở ĐÂY chứ không dọn bảng `policy_impact` theo từng bước
   * chuyển: một hồ sơ bị từ chối hay hết hiệu lực vẫn còn dòng dấu vết, nhưng nó
   * không lọt qua mệnh đề này. Dọn theo trạng thái là thêm một chỗ nữa phải nhớ
   * cập nhật mỗi lần luồng đổi, mà quên thì lỗi im lặng.
   */
  async impacted(me: AuthUser, page: Page) {
    const ids = await this.scope.userIdsFor(me);
    if (ids.length === 0) return paged([], page);

    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT p.id, p.code, p.status::text AS status, p.version_no AS "versionNo",
              jsonb_agg(jsonb_build_object(
                'kind', i.kind, 'productCode', i.product_code,
                'snapValue', i.snap_value, 'newValue', i.new_value
              ) ORDER BY i.product_code, i.kind) AS lech,
              max(i.detected_at) AS "detectedAt",
              count(*) OVER() AS total_count
         FROM pol.policy p
         JOIN pol.policy_impact i ON i.policy_id = p.id
        WHERE ${thuocPhamVi(1, 'p', me.role)}
          AND p.status::text = ANY($2::text[])
        GROUP BY p.id
        ORDER BY max(i.detected_at) DESC, p.code
        LIMIT $3 OFFSET $4`,
      [ids, DA_DONG_BANG, page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /**
   * Ngưỡng SẼ áp cho một sản phẩm nếu đưa vào hồ sơ này — xem trước, chưa ghi gì.
   *
   * Sinh ra để trả lời một câu hỏi người lập hồ sơ không tự trả lời được: sản
   * phẩm này có quy định chiết khấu nào phủ không, hay sẽ rơi về ngưỡng mặc định
   * của chính sản phẩm. Biết SAU KHI lưu thì đã muộn — con số đã đóng băng vào
   * hồ sơ và sửa lại là một lượt thao tác nữa.
   *
   * Đặt ở `policy` chứ không để giao diện gọi thẳng `/catalog/thresholds/resolve`:
   * ngưỡng phụ thuộc LOẠI KHÁCH và KÊNH của khách hàng, mà màn hình sửa dòng chỉ
   * cầm mã hồ sơ. Bắt nó tự đi lấy khách hàng rồi tự ghép tham số là chép luật
   * tra ngưỡng sang giao diện — đúng thứ mà việc đóng băng ở máy chủ tránh.
   */
  async thresholdPreview(
    policyId: string,
    productId: string,
    me: AuthUser,
    ngayApDung?: string | undefined,
  ) {
    const p = await this.db.one<PolicyRow>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.assertPolicyInScope(p, me);

    const customer = await this.clients.customer(p.customer_id);
    const snap = await this.clients.productSnapshot(
      productId,
      customer.customerType,
      ngayApDung ?? ngayVN(),
    );
    return {
      productId: snap.productId,
      productCode: snap.productCode,
      productName: snap.productName,
      companyPrice: snap.companyPrice,
      threshold:
        snap.thresholdRate2 === null ? null : (snap.thresholdRate2 / 100).toFixed(2),
      thresholdSource: snap.thresholdSource,
    };
  }

  async list(
    me: AuthUser,
    filter: { customerId?: string | undefined; status?: string | undefined },
    page: Page,
  ) {
    const ids = await this.scope.userIdsFor(me);
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      /*
       * Ba cột `0082` thêm vào: `deactivatedAt`, `supersedesId`, `supersededById`.
       *
       * Chúng dựng nên phần LỊCH SỬ CSBH ở màn hình khách hàng — câu hỏi "khách
       * này từng áp dụng những chính sách nào, và bản nào thay bản nào lúc mấy
       * giờ". Ba cột ấy đã nằm sẵn trong bảng từ `0001`; thiếu ở đây nên màn
       * hình không có gì để vẽ ngoài mã hồ sơ và trạng thái.
       *
       * Thêm vào `list()` chứ không dựng một đường riêng: đây đúng là "danh sách
       * hồ sơ của một khách hàng", và `list()` đã lọc theo `customerId` sẵn. Một
       * endpoint thứ hai trả gần hệt endpoint này là hai chỗ phải giữ đồng bộ.
       */
      `SELECT id, code, customer_id AS "customerId", version_no AS "versionNo",
              status::text AS status,
              effective_from AS "effectiveFrom", row_version AS "rowVersion",
              deactivated_at AS "deactivatedAt",
              supersedes_id AS "supersedesId", superseded_by_id AS "supersededById",
              count(*) OVER() AS total_count
         FROM pol.policy
        WHERE ${thuocPhamVi(1, '', me.role)}
          AND ($2::uuid IS NULL OR customer_id = $2::uuid)
          AND ($3::text IS NULL OR status::text = $3)
        -- Cột id phá hoà để phân trang ổn định: khoá sắp xếp bị hoà thì thứ tự
        -- giữa hai lời gọi LIMIT/OFFSET không được bảo đảm giống nhau.
        ORDER BY created_at DESC, id DESC
        LIMIT $4 OFFSET $5`,
      [ids, filter.customerId ?? null, filter.status ?? null, page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /**
   * Việc đang chờ CHÍNH NGƯỜI ĐĂNG NHẬP xử lý — nội dung trang chủ (NTF-07).
   *
   * Hai điều kiện phải cùng đúng, và thiếu một trong hai là sai theo hai kiểu
   * khác nhau:
   *   - **Đúng bước:** trạng thái chờ của hồ sơ ứng với vai trò người đang xem.
   *     Kế toán không thấy hồ sơ đang chờ Trưởng bộ phận duyệt.
   *   - **Đúng phạm vi:** hồ sơ nằm trong cây tổ chức của người đó. Kế toán này
   *     không thấy hồ sơ của TDV thuộc kế toán khác.
   *
   * Hồ sơ QUÁ HẠN KHÔNG còn hiện ở đây (`0047`).
   *
   * Trước đó nó hiện ở đúng ô của người đang chờ xử lý, vì họ vẫn xử lý được.
   * Từ `0047` không ai thao tác được nữa, nên để nó nằm trong hộp việc là bày ra
   * một dòng không bấm được gì — và hộp việc chỉ có nghĩa khi mọi dòng trong đó
   * đều là việc làm được hôm nay.
   *
   * Nó vẫn tra ra được ở màn hình Hồ sơ bằng bộ lọc trạng thái, và thư báo quá
   * hạn đã tới tay đủ người. Đây là chỗ nó rời khỏi luồng việc, không phải chỗ
   * nó biến mất.
   */
  async inbox(me: AuthUser, page: Page) {
    const ids = await this.scope.userIdsFor(me);

    // Ban lãnh đạo và Quản trị không có việc trong luồng duyệt: một bên chỉ đọc,
    // một bên nằm ngoài luồng. Trả rỗng chứ không trả "tất cả".
    const waitingFor: Record<string, string[]> = {
      /*
       * `NHAP` vào đây ở `0052`, cùng lúc thẻ *Nháp* rời khỏi dải thẻ của TDV.
       *
       * Hai thứ ấy nói cùng một chuyện — "hồ sơ bạn chưa gửi đi" — nên bày cả
       * hai là bắt người dùng đọc một con số ở trên rồi lại đọc chính danh sách
       * ấy ở dưới. Hộp việc thắng vì nó bấm thẳng vào từng hồ sơ mà sửa tiếp
       * được; con số trên thẻ thì phải bấm thêm một lần nữa mới tới nơi.
       *
       * Với ba vai trò còn lại thì `NHAP` KHÔNG phải việc của họ: hồ sơ chưa gửi
       * duyệt chưa từng rời khỏi bàn người lập.
       */
      TDV: ['NHAP', 'YEU_CAU_CHINH_SUA'],
      TBP: ['CHO_TBP_DUYET'],
      KE_TOAN: ['CHO_KT_L1', 'CHO_KT_L2'],
      SALE_ADMIN: ['SA_DANG_XU_LY'],
    };
    const mine = waitingFor[me.role] ?? [];
    if (mine.length === 0) return paged([], page);

    // Hộp việc lọc theo ĐÚNG cột của vai trò mình, không phải theo bốn cột
    // (`0031`). Một Kế toán đã tiếp nhận L1 vẫn ĐỌC được hồ sơ ấy ở bước Sale
    // Admin, nhưng nó không phải việc của họ nữa — để nó nằm lại trong hộp việc
    // là biến hộp việc thành một danh sách hồ sơ, và hộp việc chỉ có nghĩa khi
    // mọi dòng trong đó đều là việc phải làm hôm nay.
    const cot = COT_CUA_VAI_TRO[me.role] ?? 'tdv_user_id';

    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT id, code, customer_id AS "customerId", version_no AS "versionNo",
              status::text AS status, pending_step::text AS "pendingStep",
              sla_due_at AS "slaDueAt",
              -- Còn ở đây thì chưa quá hạn (xem trên); cột này giờ nói "SẮP quá
              -- hạn" — dưới 24 giờ — để hộp việc tô được dòng gấp (0047).
              (sla_due_at IS NOT NULL AND sla_due_at <= now() + interval '1 day') AS "sapQuaHan",
              count(*) OVER() AS total_count
         FROM pol.policy
        WHERE ${cot} = ANY($1::uuid[])
          AND status::text = ANY($2::text[])
        ORDER BY sla_due_at NULLS LAST, created_at, id
        LIMIT $3 OFFSET $4`,
      [ids, mine, page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /** CSBH hiện hành của một khách hàng — đúng một bản ghi (EFF-08). */
  async current(customerId: string, me: AuthUser) {
    const row = await this.db.one<PolicyRow>(
      `SELECT * FROM pol.policy WHERE customer_id = $1 AND status = 'DANG_CO_HIEU_LUC'`,
      [customerId],
    );
    if (!row) throw new NotFoundException({ code: 'NO_ACTIVE_POLICY' });
    return this.byId(row.id, me);
  }

  /** Toàn bộ chuỗi phiên bản của một hồ sơ, tra ngược được từ bất kỳ mắt xích nào (EFF-09). */
  async chain(policyId: string, me: AuthUser) {
    await this.byId(policyId, me);
    return this.db.q(
      `WITH RECURSIVE back AS (
         SELECT * FROM pol.policy WHERE id = $1
         UNION ALL
         SELECT p.* FROM pol.policy p JOIN back b ON p.id = b.supersedes_id
       ), fwd AS (
         SELECT * FROM pol.policy WHERE id = $1
         UNION ALL
         SELECT p.* FROM pol.policy p JOIN fwd f ON p.id = f.superseded_by_id
       )
       SELECT DISTINCT id, code, version_no AS "versionNo", status::text AS status,
              supersedes_id AS "supersedesId", superseded_by_id AS "supersededById",
              effective_from AS "effectiveFrom", deactivated_at AS "deactivatedAt"
         FROM (SELECT * FROM back UNION SELECT * FROM fwd) x
        ORDER BY "versionNo"`,
      [policyId],
    );
  }

  /**
   * Nhật ký của một hồ sơ, KÈM TÊN người thao tác (`0036`).
   *
   * Trước `0036` đường này chỉ trả `actorId` — một uuid — và không màn hình nào
   * gọi nó. Giờ nó là nội dung của màn hình *Nhật ký hồ sơ*, và của liên kết
   * trong thư gửi những người chỉ cần biết, nên tên phải đi kèm: đọc một dòng
   * "e207b271-… đã ký số" thì không trả lời được câu hỏi người ta vào đây để hỏi.
   *
   * Tên tra một lượt cho cả danh sách, và tra được tới đâu thì dùng tới đó —
   * `userNames` nuốt lỗi và trả rỗng, nên identity chết cũng không làm màn hình
   * nhật ký chết theo.
   */
  async events(policyId: string, me: AuthUser) {
    await this.byId(policyId, me);
    const rows = await this.db.q<{ actorId: string | null } & Record<string, unknown>>(
      `SELECT seq, from_status::text AS "fromStatus", to_status::text AS "toStatus",
              action, actor_id AS "actorId", actor_role AS "actorRole", reason, at
         FROM pol.policy_event WHERE policy_id = $1 ORDER BY seq`,
      [policyId],
    );
    const ten = await this.clients.userNames(
      rows.map((r) => r.actorId).filter((x): x is string => x !== null),
    );
    return rows.map((r) => ({
      ...r,
      actorName: r.actorId === null ? null : (ten[r.actorId] ?? null),
    }));
  }

  // --- Trợ giúp dùng chung với workflow -------------------------------------

  async load(policyId: string, c?: PoolClient) {
    const q = c
      ? async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows
      : (sql: string, p: unknown[]) => this.db.q(sql, p);

    const rows = (await q(`SELECT * FROM pol.policy WHERE id = $1`, [policyId])) as PolicyRow[] &
      { created_by: string }[];
    const p = rows[0];
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });

    const lines = (await q(
      `SELECT l.id, l.product_id AS "productId", l.product_code_snap AS "productCode",
              l.product_name_snap AS "productName",
              l.company_price_snap::text AS "companyPrice",
              l.wholesale_price::text AS "wholesalePrice",
              l.cpbh::text[] AS cpbh,
              l.cpbh_total::text AS "cpbhTotal", l.net_price::text AS "netPrice",
              l.discount_rate::text AS "discountRate", l.threshold_snap::text AS "threshold",
              l.over_threshold AS "overThreshold",
              -- Giao diện tô vàng dòng nào KHÔNG có quy định nào phủ (0022).
              l.threshold_source AS "thresholdSource",
              -- Cột "QĐCK" trên bảng dòng sản phẩm: mã của chính quy định đã
              -- cho ra ngưỡng. Từ 0180 cột ấy BÀY RA NGƯỠNG (threshold), còn mã
              -- này lui vào câu giải thích của dấu "?" (0023, 0024).
              l.rule_code_snap AS "ruleCode",
              -- Ghi chú tự do của người lập cho riêng dòng này (0027).
              l.note,
              -- 0180 — ngày áp dụng của RIÊNG dòng này.
              l.ngay_ap_dung AS "ngayApDung",
              ${SQL_TRANG_THAI_DONG} AS "trangThai",
              -- Tỷ lệ CK ở bản trước, CHỈ cho dòng đã bị sửa — xem
              -- SQL_TRANG_THAI_DONG về việc vì sao luật này nằm ở máy chủ.
              ${SQL_TY_LE_CK_TRUOC} AS "discountRateTruoc"
         FROM pol.policy_line l
         ${SQL_NOI_BAN_TRUOC}
        -- 0186 — dòng ĐÃ XOÁ VẪN TRẢ VỀ ở đường này, và chỉ ở đường này.
        -- Màn hình hồ sơ là chỗ duy nhất phải bày chúng ra (làm mờ, nhãn *Đã
        -- xoá*), vì nó là chỗ người duyệt nhìn thấy mặt hàng đang bị rút. Mọi
        -- đường đọc khác lọc chúng đi — xem internal.controller.
        WHERE l.policy_id = $1 ORDER BY l.product_code_snap`,
      [policyId],
    )) as Record<string, unknown>[];

    const attachments = (await q(
      // `objectKey` để giao diện nối được dòng này sang file bên `document` và
      // lấy đường tải. Không có nó thì danh sách tệp hiện được tên mà không mở
      // được — đúng tình trạng từ P7d tới P11b. Khoá kho KHÔNG phải bí mật: mọi
      // lượt tải vẫn đi qua `/files/:id/content` với token cấp riêng cho người
      // gọi (DOC-09), và `files.controller.ts` cũng đã trả trường này.
      `SELECT id, kind::text AS kind, file_name AS "fileName", object_key AS "objectKey",
              uploaded_at AS "uploadedAt"
         FROM pol.policy_attachment WHERE policy_id = $1 ORDER BY uploaded_at`,
      [policyId],
    )) as Record<string, unknown>[];

    /*
     * TỆP CỦA PHIÊN BẢN LIỀN TRƯỚC (`0183`, chốt 07/09).
     *
     * Khách hàng: *"khi một CSBH sửa đổi/bổ sung được gửi vào luồng duyệt thì
     * vẫn cần hiển thị bản mềm và bản cứng đã lưu ở phiên bản ngay trước đó cho
     * TBP và Kế toán xem và so sánh"*.
     *
     * HAI ĐIỀU KIỆN, và cả hai đều ở đây chứ không ở giao diện:
     *
     *   - hồ sơ ĐANG ĐI TRONG LUỒNG (`DANG_TRONG_LUONG`) — khách hàng chốt thế,
     *     nên khối tắt lúc còn *Nháp*, lúc bị trả lại, và sau khi duyệt xong;
     *   - có `supersedes_id` — hồ sơ đầu tiên của một khách không có gì để so.
     *
     * CHỈ HAI LOẠI: `BAN_MEM` và `SCAN`. Giấy tờ `HO_SO` của bản cũ đã được CHÉP
     * sang bản mới lúc lập (`0148`), nên bày lại là bày hai lần cùng một tệp.
     *
     * Trả `null` chứ không mảng rỗng khi không có bản trước: giao diện phân biệt
     * được *"không có phiên bản trước"* với *"có, nhưng bản ấy chưa lưu tệp
     * nào"* — hai câu khác nhau, và câu thứ hai đáng nói ra.
     */
    const banTruoc =
      p.supersedes_id !== null && CHUA_DUYET_XONG.includes(p.status)
        ? (
            (await q(
              `SELECT c.id, c.code, c.version_no AS "versionNo",
                      coalesce(
                        (SELECT jsonb_agg(jsonb_build_object(
                                  'id', a.id, 'kind', a.kind::text,
                                  'fileName', a.file_name, 'objectKey', a.object_key,
                                  'uploadedAt', a.uploaded_at
                                ) ORDER BY a.uploaded_at)
                           FROM pol.policy_attachment a
                          WHERE a.policy_id = c.id AND a.kind IN ('BAN_MEM','SCAN')),
                        '[]'::jsonb
                      ) AS attachments
                 FROM pol.policy c WHERE c.id = $1`,
              [p.supersedes_id],
            )) as Record<string, unknown>[]
          )[0] ?? null
        : null;

    return {
      id: p.id,
      code: p.code,
      customerId: p.customer_id,
      versionNo: p.version_no,
      status: p.status,
      supersedesId: p.supersedes_id,
      supersededById: p.superseded_by_id,
      effectiveFrom: p.effective_from,
      // NGÀY SOẠN THẢO (`0061`) — lúc bản nháp ra đời, không phải lúc gửi duyệt.
      // Hai mốc ấy cách nhau hàng tuần ở những hồ sơ soạn dần, và câu hỏi "hồ sơ
      // này có từ bao giờ" hỏi về mốc đầu.
      createdAt: p.created_at,
      tdvUserId: p.tdv_user_id ?? '',
      /**
       * ĐÃ CÓ Sale Admin chưa (`0141`) — một CỜ, không phải id.
       *
       * Màn hình chỉ cần biết có phải hỏi ô ấy nữa không. Trả id ra thì nó thành
       * một thứ giao diện có thể đọc, so sánh, hiển thị — và mở đường cho một
       * bản sao thứ hai của luật *"chọn một lần"* mọc lên ở phía giao diện.
       * Máy chủ vẫn là chỗ duy nhất quyết định, cờ này chỉ để đừng bày ra một ô
       * mà bấm vào chắc chắn bị từ chối.
       */
      daChonSaleAdmin: p.sale_admin_user_id !== null,
      createdBy: (p as unknown as { created_by: string }).created_by,
      rowVersion: p.row_version,
      lastReason: p.last_reason,
      /*
       * Mẫu bản mềm đã đóng băng (`0098`). `null` có HAI nghĩa, và giao diện
       * phân biệt được bằng chính trạng thái hồ sơ: hồ sơ còn sửa được thì đây
       * là "TDV chưa chọn, và còn chọn được"; hồ sơ đã gửi duyệt thì là "lập
       * trước `0098`, không có bản mềm".
       *
       * Trả về ID chứ không kèm TÊN: tên nằm bên `document`, và gọi sang đó ở
       * mỗi lượt mở hồ sơ là một vòng mạng cho một chuỗi mà phần lớn màn hình
       * không dùng tới. Màn hình nào cần tên thì hỏi `/policy-templates/:id`.
       */
      /*
       * Ảnh chụp khách hàng và người đề nghị (`0101`), những trường mà MÀN HÌNH
       * dùng tới. Phần còn lại chỉ có nghĩa với bản mềm, và `document` đọc thẳng
       * chúng qua `internal/policies/:id` — không đẩy lên đây để một màn hình
       * không cần chúng phải chở chúng đi.
       *
       * `0177` nâng danh sách từ ba lên tám: khối *Khách hàng* trên trang hồ sơ
       * bày thêm người đại diện, địa chỉ đăng ký (hai ô, cộng cột gộp làm giá
       * trị lùi cho hồ sơ gửi trước `0177`) và địa chỉ giao hàng. Ranh giới thì
       * KHÔNG đổi — chức danh người đại diện và mã số thuế vẫn ở lại bên
       * `document`, vì màn hình này không bày chúng.
       */
      khMaSnap: (p as unknown as { kh_ma_snap: string | null }).kh_ma_snap,
      khTenSnap: (p as unknown as { kh_ten_snap: string | null }).kh_ten_snap,
      khNguoiDaiDienSnap: (p as unknown as { kh_nguoi_dai_dien_snap: string | null })
        .kh_nguoi_dai_dien_snap,
      khDiaChiDangKySnap: (p as unknown as { kh_dia_chi_dang_ky_snap: string | null })
        .kh_dia_chi_dang_ky_snap,
      khSoNhaSnap: (p as unknown as { kh_so_nha_snap: string | null }).kh_so_nha_snap,
      khTinhThanhSnap: (p as unknown as { kh_tinh_thanh_snap: string | null }).kh_tinh_thanh_snap,
      khNoiNhanHangSnap: (p as unknown as { kh_noi_nhan_hang_snap: string | null })
        .kh_noi_nhan_hang_snap,
      khCongNoSnap: (p as unknown as { kh_cong_no_snap: string | null }).kh_cong_no_snap,
      nguoiDeNghiSnap: (p as unknown as { nguoi_de_nghi_snap: string | null }).nguoi_de_nghi_snap,
      lines,
      attachments,
      /** `0183` — bản mềm và file scan của phiên bản liền trước, để đối chiếu. */
      banTruoc,
    };
  }

  /**
   * Hồ sơ đã gửi duyệt thì khoá sửa (POL-11), và **chỉ TDV đang phụ trách sửa**.
   *
   * VẾ THỨ HAI THÊM Ở `0099`, sau khi dựng lại được trên chồng demo thật: Kế
   * toán xoá được một dòng sản phẩm khỏi hồ sơ *Yêu cầu chỉnh sửa* mà TDV đang
   * sửa dở, và Ban lãnh đạo — vai trò CHỈ ĐỌC — xoá được dòng khỏi hồ sơ *Nháp*
   * của người khác. Nguyên nhân ở `policies.controller.ts`: một `@Roles('TDV')`
   * mồ côi sau khi P26 chèn phương thức mới ngay dưới nó, để lại đường xoá dòng
   * không khai vai trò nào.
   *
   * Vì sao chữa Ở ĐÂY chứ không chỉ dán lại cái `@Roles` đã rơi: `assertPolicyInScope`
   * trả lời câu *"tôi có liên quan tới hồ sơ này không"* — đúng cho quyền ĐỌC,
   * và bốn cột người đều tính, kể cả những bước đã qua. Nó chưa bao giờ trả lời
   * câu *"tôi có được SỬA hồ sơ này không"*, mà cả bốn đường ghi ở đây đều hỏi
   * câu thứ hai. Đặt luật ở nguồn thì một đường ghi viết sau này quên khai vai
   * trò vẫn an toàn; dán `@Roles` là để câu trả lời nằm ở chỗ dễ rơi nhất.
   *
   * Cùng một luật, cùng một mã lỗi với `remove()` — xoá hồ sơ vốn đã so
   * `tdv_user_id` từ `0035`. Hai đường ghi cùng một hồ sơ mà trả lời khác nhau
   * về cùng một câu hỏi là chỗ lỗi này sinh ra.
   */
  private async mustEdit(policyId: string, me: AuthUser): Promise<PolicyRow> {
    const p = await this.db.one<PolicyRow>(`SELECT * FROM pol.policy WHERE id = $1`, [policyId]);
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.assertPolicyInScope(p, me);
    // NGƯỜI PHỤ TRÁCH HIỆN TẠI, không phải người đã lập — hồ sơ sang tay qua bàn
    // giao thì người kế nhiệm sửa được, còn `created_by` trỏ vào tài khoản đã vô
    // hiệu hoá (cùng lý do đã ghi ở `remove()`).
    if (p.tdv_user_id !== me.id) {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message: 'Chỉ TDV đang phụ trách hồ sơ này mới sửa được.',
      });
    }
    if (!EDITABLE.includes(p.status)) {
      throw new ConflictException({
        code: 'POLICY_LOCKED',
        message: `Hồ sơ đang ở ${p.status}, không sửa được`,
        status: p.status,
      });
    }
    return p;
  }

  async bumpVersion(c: PoolClient, policyId: string): Promise<void> {
    await c.query(`UPDATE pol.policy SET row_version = row_version + 1 WHERE id = $1`, [policyId]);
  }

  async recordEvent(
    c: PoolClient,
    policyId: string,
    from: string | null,
    to: string,
    action: string,
    me: AuthUser,
    reason: string | undefined,
  ): Promise<void> {
    await c.query(
      `INSERT INTO pol.policy_event
         (policy_id, seq, from_status, to_status, action, actor_id, actor_role, reason)
       VALUES ($1,
               coalesce((SELECT max(seq) FROM pol.policy_event WHERE policy_id = $1), 0) + 1,
               $2::pol.policy_status, $3::pol.policy_status, $4, $5, $6, $7)`,
      [policyId, from, to, action, me.id, me.role, reason ?? null],
    );
  }

  async assertInScope(ownerUserId: string, me: AuthUser): Promise<void> {
    const ids = await this.scope.userIdsFor(me);
    if (!ids.includes(ownerUserId)) throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
  }

  /**
   * Người này có liên quan tới HỒ SƠ này không (`0031`).
   *
   * Khác `assertInScope` ở chỗ nó hỏi về một hồ sơ cụ thể chứ không về người sở
   * hữu. Từ khi bỏ cây tổ chức, "tôi thấy hồ sơ của TDV này" không còn nghĩa gì
   * — cùng một TDV có hồ sơ gửi cho tôi và hồ sơ gửi cho Trưởng bộ phận khác.
   *
   * Cả bốn cột đều tính, kể cả những bước đã qua: Kế toán đã tiếp nhận L1 vẫn
   * phải mở lại được hồ sơ mình đã xử lý sau khi nó đi tiếp. Mất quyền đọc ngay
   * khi hồ sơ rời khỏi bàn mình là mất khả năng tra cứu lại việc mình đã làm.
   */
  async assertPolicyInScope(
    p: {
      tdv_user_id: string | null;
      tbp_user_id: string | null;
      ke_toan_user_id: string | null;
      sale_admin_user_id: string | null;
      /**
       * Hai trường của luật riêng Kế toán (`0142`), khai BẮT BUỘC (`0143`).
       *
       * Bản `0142` khai chúng tuỳ chọn với lý do "chọn phía nới". Nghe an toàn,
       * và nó im lặng bỏ chốt ở hai đường: `attach` và `detach` liệt kê đúng năm
       * cột trong câu `SELECT`, nên hai trường này về `undefined`, phép so
       * `=== false` sai, và luật không bao giờ nổ ở đó.
       *
       * Đúng bẫy `0128` đã ghi vào `CLAUDE.md` — *"thêm một trường thì phải rà
       * cả những câu SELECT liệt kê từng cột"* — và nó vừa lặp lại.
       *
       * Khai BẮT BUỘC thì **trình biên dịch** rà giúp: mỗi chỗ gọi hoặc đọc đủ
       * hai cột, hoặc không dịch được. Mạnh hơn một ca kiểm quét mã nguồn, vì nó
       * không thể bị một cách viết mới lách qua.
       */
      da_qua_tbp: boolean;
    },
    me: AuthUser,
  ): Promise<void> {
    const ids = await this.scope.userIdsFor(me);
    const nguoi = [p.tdv_user_id, p.tbp_user_id, p.ke_toan_user_id, p.sale_admin_user_id];
    if (!nguoi.some((x) => x !== null && ids.includes(x))) {
      throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
    }

    /*
     * Cùng luật với `thuocPhamVi(..., 'KE_TOAN')`, ở đường MỞ MỘT HỒ SƠ (`0142`).
     *
     * Thiếu chốt này thì danh sách giấu hồ sơ đi nhưng gõ thẳng địa chỉ vẫn mở
     * được — đúng lỗ hổng mà `0133` vừa bịt ở tầng định tuyến, chỉ khác chỗ.
     *
     * `da_qua_tbp` khai BẮT BUỘC (`0143`): khai tuỳ chọn thì hai đường
     * `attach`/`detach` — vốn liệt kê từng cột trong `SELECT` — im lặng bỏ qua
     * chốt, và không ca kiểm nào đỏ. Kiểu bắt buộc thì trình biên dịch chỉ chỗ.
     *
     * `0157` GỠ VẾ TRẠNG THÁI. Điều kiện cũ chỉ chặn ở `CHO_TBP_DUYET`, nên hồ
     * sơ bị Trưởng bộ phận trả về (`YEU_CAU_CHINH_SUA`) lọt qua. Cột `status`
     * theo đó rời khỏi cả kiểu tham số — giữ một trường bắt buộc mà không dòng
     * nào đọc là bắt mọi chỗ gọi mang theo dữ liệu cho một luật đã bỏ.
     */
    if (me.role === 'KE_TOAN' && !p.da_qua_tbp) {
      throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
    }
  }

  /*
   * `assertNoMissingInheritedProduct` GỠ HẲN ở `0186` (POL-08 đảo, chốt 08/09).
   *
   * Nó đòi tập sản phẩm của phiên bản mới CHỨA tập của bản đang hiệu lực, và
   * chặn lúc gửi duyệt. Khách hàng bỏ luật ấy: rút một mặt hàng khỏi CSBH của
   * một khách là một nghiệp vụ có thật, và tới `0186` nó mới có đường đi.
   *
   * Không xoá lặng lẽ mà ghi lại, vì luật này KHÔNG tuỳ tiện — nó là hệ quả của
   * ba câu ở `muc 5`: mỗi khách một CSBH hiệu lực, bản mới duyệt xong thì bản cũ
   * vô hiệu TOÀN BỘ, hiệu lực quản lý ở cấp hồ sơ chứ không cấp dòng. Cộng lại:
   * một mặt hàng vắng mặt ở bản mới không rơi về bản cũ, nó rơi ra khỏi mọi
   * CSBH. Nên phép chặn tồn tại để chuyện ấy không xảy ra do SƠ Ý.
   *
   * Thứ thay thế nó không phải "bỏ chặn" mà là **làm cho việc rút nhìn thấy
   * được**: dòng bị rút nằm lại bảng dưới nhãn *Đã xoá* suốt luồng duyệt, nên
   * bốn bàn duyệt ký vào một tờ có nói ra mặt hàng nào đang mất. Bỏ chốt mà
   * không có dòng mờ ấy thì đúng là dựng lại cái hỏng mà `POL-08` sinh ra để
   * chống — xem `0117_dong_da_xoa.sql`.
   */
}
