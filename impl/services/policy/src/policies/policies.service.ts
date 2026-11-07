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
  BAN_SALE_ADMIN,
  batTinhNang,
  computeLine,
  InvalidLineError,
  rate2ToNumeric,
  STEP_OF_STATUS,
  SUA_DUOC,
  type Status,
} from '@csbh/domain-policy';
import { PG, ngayVN, paged, pgCode, type AuthUser, type Page } from '@csbh/http-kit';
import { soSanhLech, type MucLech } from './lech.js';
import { ngayTraDanhMuc } from './ngay-tra-danh-muc.js';
import { chuanHoaMa, CAU_LOI_MA } from './ma-ho-so.js';
import { lyDoConCanBay } from './ly-do.js';
import type { ProductSnapshot } from '../infra/clients.js';

/**
 * Một dòng còn sống của hồ sơ, đủ cột cho CẢ phép so lẫn phép ghi (`0194`).
 *
 * Bốn cột đầu để tra danh mục và để so; hai cột cuối là con số NGƯỜI DÙNG nhập —
 * `lamMoiDong` đọc chúng để tính lại tỷ lệ, và không bao giờ được ghi đè.
 */
type DongLamMoi = {
  product_id: string;
  product_code_snap: string;
  ngay_ap_dung: Date;
  company_price_snap: string;
  threshold_snap: string | null;
  rule_code_snap: string | null;
  wholesale_price: string;
  cpbh: string[];
};

/**
 * Một dòng lệch những gì, theo đúng bộ số `docDongVaAnh` vừa đọc được (`0199`).
 *
 * Hàm THUẦN, và tách ra vì nó có HAI chỗ gọi phải cho cùng kết quả: đường đọc
 * (`soSanhDong`) và lượt tính phần CÒN LẠI ngay sau khi ghi (`lamMoiDong`). Tới
 * `0198` chỗ thứ hai không tồn tại — `apDungThayDoi` mở một transaction THỨ HAI
 * rồi gọi `soSanhDong` để đếm lại, tức hỏi danh mục thêm một lượt nữa sau khi đã
 * ghi xong. Lượt hỏi ấy hỏng thì cả request hỏng **trong khi phép ghi đã
 * commit**: người dùng nhận lỗi, giao diện không tải lại, và màn hình bày số cũ
 * cho một dòng đã đổi dưới CSDL.
 */
const soSanhMotDong = (
  d: DongLamMoi,
  dat: { anh: Map<string, ProductSnapshot>; loi: Map<string, string> },
): MucLech[] =>
  soSanhLech(
    {
      productCode: d.product_code_snap,
      companyPrice: String(d.company_price_snap),
      threshold: d.threshold_snap === null ? null : String(d.threshold_snap),
      ruleCode: d.rule_code_snap,
    },
    dat.anh.get(d.product_id),
    dat.loi.get(d.product_id),
  );
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
  /**
   * MÃ HỒ SƠ do TDV đặt (`0198`). Vắng mặt thì máy chủ tự sinh.
   *
   * TUỲ CHỌN chứ không bắt buộc, dù màn hình *Lập hồ sơ* luôn gửi: đường
   * `POST /policies` còn bốn chỗ gọi khác trong bộ nạp demo và bộ kiểm, và ép
   * mọi chỗ ấy tự nghĩ ra một mã là ép chúng dựng lại đúng cái sequence đang có.
   * Vắng mặt = *"đặt hộ tôi"*, và đó vẫn là câu trả lời đúng cho phần lớn lượt
   * gọi máy-với-máy.
   */
  code?: string | undefined;
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
 * "Khách này đã có một bản Nháp" (`0197`) — dựng ở MỘT chỗ vì có HAI đường tới.
 *
 * Đường thứ nhất là phép kiểm ở `create`; đường thứ hai là `23505` từ chỉ mục
 * `uq_policy_dang_do_moi_khach` (`0220`, trước là chỉ mục Nháp của `0197`) khi hai request song song cùng lọt qua phép kiểm
 * ấy. Hai đường phải trả về **cùng một câu và cùng một `draftPolicyId`**, nếu
 * không thì người bấm đúp nhận một câu lỗi khác hẳn người bấm một lần — cùng
 * một tình huống, hai màn hình.
 */
/**
 * Chuẩn hoá mã hồ sơ, hỏng thì `400` (`0198`).
 *
 * Bọc `chuanHoaMa` — hàm thuần trả `{loi}` chứ không ném, để ca kiểm với tới
 * từng nhánh mà không dựng một hồ sơ thật. Chỗ nối hai thế giới nằm ở đây, đúng
 * một chỗ, vì cả `create` lẫn `doiMa` đều đi qua nó.
 */
function dungMa(raw: string): string {
  const r = chuanHoaMa(raw);
  if ('loi' in r) {
    throw new BadRequestException({
      code: 'POLICY_CODE_INVALID',
      message: CAU_LOI_MA[r.loi],
      field: 'code',
    });
  }
  return r.ma;
}

/**
 * Tên ràng buộc duy nhất trên `pol.policy.code`.
 *
 * `policy_code_key` — tên Postgres TỰ ĐẶT cho `code text UNIQUE` khai inline ở
 * `0001_init.sql`. Viết ra thành hằng vì cái tên ấy KHÔNG tra được từ mã nguồn
 * migration: nó không xuất hiện ở đâu cả, chỉ sinh ra lúc `CREATE TABLE` chạy.
 *
 * `0198` SUÝT thêm một chỉ mục `uq_policy_code` thứ hai vì đọc `0007_policy.sql`
 * không thấy ràng buộc nào — cột `code` khai ở `0001`, không phải `0007`. Đo
 * bằng `pg_constraint` mới thấy: ràng buộc đã có từ ngày đầu, và tính duy nhất
 * của mã hồ sơ chưa bao giờ chỉ dựa vào sequence. Có một ca kiểm ghim tên này.
 */
const UQ_MA = 'policy_code_key';

/** Mã hồ sơ đã có người giữ (`0198`). Xem `dungMa` về việc KHÔNG nói ra hồ sơ nào. */
const maDaCo = (): ConflictException =>
  new ConflictException({
    code: 'POLICY_CODE_TAKEN',
    message: 'Mã hồ sơ này đã có hồ sơ khác dùng. Chọn một mã khác.',
    field: 'code',
  });

export const daCoNhap = (draftPolicyId: string): ConflictException =>
  new ConflictException({
    code: 'DRAFT_EXISTS',
    message:
      'Khách hàng này đã có một bản Nháp đang soạn dở. ' +
      'Mỗi khách hàng chỉ giữ được một bản Nháp — mở bản đang có để soạn tiếp.',
    draftPolicyId,
  });

/**
 * "Khách này đang có một hồ sơ trong luồng duyệt" (`0220`) — nửa thứ hai của cùng
 * luật với `daCoNhap`.
 *
 * HAI MÃ chứ không một, vì hai tình huống đưa ra hai việc khác nhau: bản Nháp là
 * thứ TDV *soạn tiếp* ngay, còn hồ sơ đã gửi đi thì đang nằm trên bàn người
 * khác — việc của TDV là chờ, hoặc xoá nó nếu nó đang bị trả về. Gộp làm một mã
 * là giao diện phải đọc lại trạng thái để biết nên nói câu nào, tức suy lại một
 * thứ máy chủ vừa biết.
 *
 * Câu chữ nói MÃ hồ sơ: khác `maDaCo` (`0198`), ở đây không có gì để giấu — hồ
 * sơ ấy là của chính khách hàng người gọi đang phụ trách (`assertInScope` đã gác
 * ngay trước), và hồ sơ luôn sang tay theo khách (`0085`).
 */
export const dangCoHoSo = (p: { id: string; code: string; status: string }): ConflictException =>
  new ConflictException({
    code: 'POLICY_IN_PROGRESS',
    message:
      `Khách hàng này đang có hồ sơ ${p.code} chưa duyệt xong. ` +
      'Mỗi khách hàng chỉ có một hồ sơ CSBH đang xử lý tại một thời điểm — ' +
      'hồ sơ ấy phải có hiệu lực hoặc bị xoá thì mới lập được hồ sơ mới.',
    policyId: p.id,
    policyCode: p.code,
    status: p.status,
  });

/** Bản Nháp → `DRAFT_EXISTS`, còn lại → `POLICY_IN_PROGRESS`. Một chỗ cho cả hai đường. */
const loiDangDo = (p: { id: string; code: string; status: string }): ConflictException =>
  p.status === 'NHAP' ? daCoNhap(p.id) : dangCoHoSo(p);

/**
 * Tên chỉ mục "một hồ sơ đang xử lý mỗi khách" (`0220`, thay
 * `uq_policy_nhap_moi_khach` của `0197`). Hằng vì hai chỗ đọc: `doiTrungNhap`
 * và ca kiểm đối chiếu vị từ của chỉ mục với `CHUA_DUYET_XONG`.
 */
export const UQ_DANG_DO = 'uq_policy_dang_do_moi_khach';

/** Hồ sơ đang xử lý của một khách — câu hỏi DUY NHẤT của cả hai đường. */
const SQL_HO_SO_DANG_DO = `SELECT id, code, status::text AS status
     FROM pol.policy
    WHERE customer_id = $1 AND status::text = ANY($2::text[])
    ORDER BY created_at DESC LIMIT 1`;

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
  // `0225` — cả hai trạng thái của bàn Sale Admin: sửa bản cứng là đúng lúc họ
  // phải gỡ bản scan bị chê và tải bản mới lên.
  if (BAN_SALE_ADMIN.includes(status as Status)) {
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
  ...BAN_SALE_ADMIN,
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
 *
 * NGƯỜI ĐỌC THỨ HAI từ `0220`: đây cũng là tập *"hồ sơ đang xử lý"* — mỗi khách
 * chỉ một hồ sơ ở một trong sáu trạng thái này (`create`, `SQL_HO_SO_DANG_DO`).
 * Hai câu hỏi trùng tập là tình cờ có lý: *"chưa duyệt xong"* chính là *"đang
 * xử lý"*. Vị từ của `uq_policy_dang_do_moi_khach` gõ lại sáu chuỗi này trong
 * migration, và có ca kiểm đối chiếu hai bên qua `pg_indexes` — thêm một trạng
 * thái vào đây mà quên migration là đỏ.
 */
export const CHUA_DUYET_XONG = [
  ...SUA_DUOC,
  'CHO_TBP_DUYET',
  'CHO_KT_L1',
  // `0225` — hai trạng thái của bàn Sale Admin; `0122` dựng lại chỉ mục theo.
  ...BAN_SALE_ADMIN,
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
 * NĂM trường: giá bán buôn · các khoản CPBH · ngày áp dụng · ghi chú — bốn thứ
 * TDV nhập — **cộng `company_price_snap`** (`0202`). Khách hàng chốt *"đổi bất
 * kỳ dữ liệu nào"* cho bốn trường đầu, và chốt riêng cho Giá bán Công ty ở
 * `12/09`.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO `0180` LOẠI GIÁ BÁN CÔNG TY RA, VÀ VÌ SAO LÝ DO ẤY ĐÃ CHẾT (`0202`)
 * ---------------------------------------------------------------------------
 *
 * Lập luận của `0180` — giữ nguyên văn ở đây vì nó **không sai**, chỉ hết đúng:
 *
 * > *chúng đến từ DANH MỤC, và `lamMoiDong` chụp lại chúng ở mỗi lượt đọc hồ sơ
 * > còn sửa được (`0029`). Đưa chúng vào phép so là để danh mục đổi giá một mình
 * > cũng làm mọi dòng của mọi bản nháp nhảy sang *Chỉnh sửa* — một câu sai, vì
 * > TDV chưa đụng vào gì cả.*
 *
 * Mệnh đề mà cả lập luận ấy đứng lên là **"chụp lại ở MỖI LƯỢT ĐỌC"**, và
 * `0194` đã gỡ đúng nó: từ đó đường đọc không ghi đè gì nữa, `lamMoiDong` chỉ
 * chạy khi TDV **bấm *Tự động cập nhật*** hoặc khi **gửi duyệt**. Nên danh mục
 * đổi giá một mình KHÔNG còn chạm tới `company_price_snap` của bất kỳ dòng nào —
 * cái hậu quả mà `0180` sợ đã hết đường xảy ra từ sáu chặng trước, và không ai
 * quay lại gỡ mệnh đề đã chết.
 *
 * Cái vào phép so vì thế mang đúng nghĩa của cả bảng: **dòng này đã khác bản CSBH
 * trước ở một con số sẽ đi vào văn bản ký hay chưa**. Giá bán Công ty đổi thì tỷ
 * lệ chiết khấu đổi theo, và cột *Tỷ lệ CK cũ* — vốn chỉ hiện cho dòng *Chỉnh
 * sửa* — là chỗ người duyệt đối chiếu con số ấy; trước `0202` nó tắt đúng ở
 * những dòng cần nó nhất.
 *
 * `discount_rate` KHÔNG cần thêm và thêm là thừa: nó là hàm thuần của
 * `company_price_snap` + `wholesale_price` + `cpbh` (`computeLine`), mà cả ba
 * giờ đều nằm trong phép so — một dòng đổi tỷ lệ CK mà không đổi cái nào trong
 * ba thứ ấy là chuyện không viết ra được.
 *
 * `threshold_snap` VẪN đứng ngoài, và đó là chỗ duy nhất còn lệch — đã nêu để hỏi
 * lại. Nó đến từ quy định chiết khấu chứ không suy ra được từ ba trường trên, nên
 * một dòng chỉ đổi ngưỡng (đổi `over_threshold`, không đổi tỷ lệ CK) vẫn mang
 * nhãn *Đang áp dụng*. Khách hàng chốt đúng một trường.
 *
 * ---------------------------------------------------------------------------
 *
 * HỆ QUẢ ĐÃ NÊU: nhãn *Chỉnh sửa* giờ **mọc ra được mà không ai gõ gì** — bấm
 * *Tự động cập nhật*, và cả lượt **gửi duyệt** (ở đó `lamMoiDong` tự chạy). Đó
 * đúng là câu khách hàng đặt: câu hỏi là *"dòng này có khác bản trước không"*,
 * không phải *"TDV có gõ gì không"*.
 *
 * `IS DISTINCT FROM` chứ không `<>`: `NULL <> 'x'` trả NULL chứ không trả `true`,
 * nên một ô vừa được điền vào chỗ trống sẽ lọt qua thành *Đang áp dụng*. Ví dụ
 * gốc là `note` — trường ấy rời khỏi phép so ở `0215`, nhưng luật thì không đổi:
 * `company_price_snap` rỗng ở dòng lập trước `0022`, và cùng biểu thức này còn
 * sinh ra `doi` của `TRUONG_BAY_BAN_TRUOC`, nơi `threshold_snap` NULL là chuyện
 * bình thường (dòng không có quy định nào phủ).
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
/**
 * BỐN TRƯỜNG ĐƯỢC SO, khai MỘT LẦN (`0204`; năm trường tới `0214`).
 *
 * Tới `0203` danh sách này nằm thẳng trong `SQL_DONG_KHAC_BAN_TRUOC` dưới dạng
 * một chuỗi `OR`. `0204` cần thêm một câu trả lời thứ hai từ đúng năm trường ấy
 * — *"đổi những gì, từ đâu sang đâu"* — và hai biểu thức SQL gõ tay cho cùng một
 * danh sách là hai thứ sẽ trôi khỏi nhau: thêm một trường vào phép so mà quên
 * bảng chi tiết thì dòng mang nhãn *Chỉnh sửa* trong khi bảng mở ra nói *không
 * có gì đổi*, và không có gì đỏ.
 *
 * Nên danh sách là DỮ LIỆU, và cả hai biểu thức SINH RA từ nó. Không phải một
 * lượt dọn cho gọn: nó là chốt chặn duy nhất giữ hai câu trả lời khỏi cãi nhau.
 *
 * `dang` quyết định cách đọc giá trị ra chuỗi, KHÔNG quyết định cách bày:
 *
 *   * `so`   — `numeric`/`bigint` đọc ra text, giữ nguyên văn con số CSDL giữ;
 *   * `mang` — `bigint[]` (CPBH) ra một MẢNG chuỗi. Không gộp thành tổng: hai
 *              mảng khác nhau vẫn có thể cùng tổng (`[5000]` → `[3000,2000]`),
 *              và khi ấy một dòng *"CPBH 5.000 → 5.000"* là một thay đổi tự nói
 *              rằng nó không có thay đổi nào;
 *   * `ngay` — `date` ra `YYYY-MM-DD`, để giao diện tự định dạng theo quy ước
 *              tiếng Việt như mọi chỗ khác.
 *
 * `chu` (text, `null` được) đã có một thời: nó là dạng của `note`, trường duy
 * nhất không phải số, và `0215` gỡ trường ấy khỏi cả hai danh sách. `docCot` vẫn
 * đọc được nó — nhánh cuối cùng là nhánh chung cho mọi thứ không phải mảng hay
 * ngày — nên không có mã chết nào, chỉ không còn ai khai dạng ấy.
 *
 * Cách ĐỌC là việc của màn hình, đúng lối `Lech.doc()` đã chọn: máy chủ giữ
 * nguyên văn con số nó vừa so.
 */
export const TRUONG_SO_VOI_BAN_TRUOC = [
  // Thứ tự này là thứ tự ĐỌC trong bảng chi tiết, xếp theo mức đáng chú ý: hai
  // con số quyết định tỷ lệ chiết khấu trước, rồi tới thứ chỉ đổi cách ghi.
  { khoa: 'companyPrice', cot: 'company_price_snap', dang: 'so' },
  { khoa: 'wholesalePrice', cot: 'wholesale_price', dang: 'so' },
  { khoa: 'cpbh', cot: 'cpbh', dang: 'mang' },
  { khoa: 'ngayApDung', cot: 'ngay_ap_dung', dang: 'ngay' },
  /*
   * GHI CHÚ ĐÃ RỜI KHỎI ĐÂY (`0215`, khách hàng chốt 21/09).
   *
   * *"Ghi chú không phải là trường để đánh giá sản phẩm có bị chỉnh sửa không,
   * nếu chỉ có ghi chú thay đổi, sản phẩm sẽ vẫn giữ nguyên trạng thái"*.
   *
   * Nó đảo một nửa chốt `07/09` (*"bị sửa là đổi BẤT KỲ dữ liệu nào người lập
   * nhập"*), và lý do đọc ra được từ chính cột ấy: bốn trường còn lại đều đi vào
   * TỜ GIẤY khách hàng ký, còn ghi chú là lời nhắn của người lập cho người
   * duyệt. Sửa một câu chữ không làm chính sách bán hàng khác đi.
   *
   * Nó cũng rời khỏi `TRUONG_BAY_BAN_TRUOC` — xem lý do ở đó: `0215` bỏ bảng
   * bản trước, và dấu tam giác thay thế nó không nói được *"lớn hơn"* hay *"bé
   * hơn"* của một câu chữ.
   */
] as const;

/** Đọc một cột ra dạng chuỗi/mảng mà bảng chi tiết mang đi. */
const docCot = (bang: 'l' | 'truoc', t: { readonly cot: string; readonly dang: string }): string =>
  t.dang === 'mang'
    ? `to_jsonb(${bang}.${t.cot}::text[])`
    : t.dang === 'ngay'
      ? `to_jsonb(to_char(${bang}.${t.cot}, 'YYYY-MM-DD'))`
      : `to_jsonb(${bang}.${t.cot}::text)`;

/**
 * `0202` — Giá bán Công ty: so trên NUMERIC chứ không trên chuỗi, nên `100000`
 * và `100000.00` là một. Xem docstring trên về vì sao lý lẽ loại nó ra của
 * `0180` đã hết đúng từ `0194`.
 */
export const SQL_DONG_KHAC_BAN_TRUOC = `
  truoc.id IS NOT NULL AND (
    ${TRUONG_SO_VOI_BAN_TRUOC.map((t) => `l.${t.cot} IS DISTINCT FROM truoc.${t.cot}`).join(
      '\n    OR ',
    )}
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
/**
 * HỒ SƠ ĐÃ ĐI TỚI ĐÍCH — ba nhãn kia thôi có nghĩa (`0200`).
 *
 * Khách hàng chốt 11/09: *"khi một CSBH đang ở trạng thái đang có hiệu lực thì
 * tất cả sản phẩm trong đó phải có trạng thái Đang áp dụng"*.
 *
 * Lý do rộng hơn câu chữ, và nó là thứ giữ cho luật này khỏi bị đọc thành một
 * lượt sửa nhãn: *Bổ sung* và *Chỉnh sửa* trả lời câu hỏi **của người đang
 * soạn** — *"so với bản đang chạy, tôi vừa đổi gì?"*. Câu ấy có nghĩa suốt lúc
 * hồ sơ còn đi trong luồng, vì người duyệt cần biết đúng phần khác đi. Hồ sơ
 * duyệt xong thì bản trước đã **vô hiệu toàn bộ** (`muc 5`) và không còn gì để
 * so nữa: mọi mặt hàng trên tờ giấy đang có hiệu lực đều đang áp dụng như nhau.
 * Giữ nhãn cũ là bày ra một phép so với một văn bản đã chết.
 *
 * `cha` đến từ `SQL_NOI_BAN_TRUOC` — nó đã LEFT JOIN chính hồ sơ này để tìm bản
 * bị thay thế, nên trạng thái có sẵn, không thêm một lượt đọc bảng nào.
 *
 * ĐỨNG SAU `l.da_xoa`, có chủ ý: `0186` xoá hẳn dòng đã rút ở đúng bước có hiệu
 * lực, nên ở đây hai nhánh không bao giờ gặp nhau. Nếu có gặp thì đó là dữ liệu
 * hỏng, và lúc ấy *Đã xoá* là câu đáng nói — che nó bằng *Đang áp dụng* là giấu
 * mất đúng thứ bất thường.
 */
const SQL_HO_SO_DA_HIEU_LUC = `cha.status = 'DANG_CO_HIEU_LUC'`;

export const SQL_TRANG_THAI_DONG = `
  CASE
    WHEN l.da_xoa THEN 'DA_XOA'
    WHEN ${SQL_HO_SO_DA_HIEU_LUC} THEN 'DANG_AP_DUNG'
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
 *
 * `NOT ${SQL_HO_SO_DA_HIEU_LUC}` (`0200`) là **cùng một vế ấy, lần thứ hai** —
 * và nó phải đi kèm chứ không phải một lượt dọn cho gọn. Hồ sơ có hiệu lực thì
 * mọi dòng mang nhãn *Đang áp dụng*; để cột *Tỷ lệ CK cũ* còn số thì nó đánh dấu
 * ĐÚNG những dòng vốn là *Chỉnh sửa* — tức dựng lại bằng một cột số cái phân
 * biệt vừa được yêu cầu bỏ đi, và bảng tự nói hai câu ngược nhau trên cùng hàng.
 */
export const SQL_TY_LE_CK_TRUOC = `
  CASE WHEN NOT l.da_xoa AND NOT ${SQL_HO_SO_DA_HIEU_LUC} AND ${SQL_DONG_KHAC_BAN_TRUOC}
       THEN truoc.discount_rate::text END`;

/**
 * BẢN TRƯỚC CỦA DÒNG NÀY, VÀ NHỮNG Ô ĐÃ ĐỔI (`0213`, khách hàng chốt 20/09).
 *
 * *"Khi kích vào sản phẩm có trạng thái chỉnh sửa, hãy hiện thông tin của sản
 * phẩm đó ở phiên bản trước khi bị chỉnh sửa, thông tin nào bị đổi hãy đánh dấu
 * bằng cách bôi vàng"*.
 *
 * `0215` (chốt 21/09) đổi CHỖ BÀY mà không đổi một chữ nào của hợp đồng này:
 * giá trị cũ thôi nằm trong một hàng mở ra, nó nằm trong câu hiện khi rê chuột
 * vào dấu tam giác cạnh giá trị mới. Máy chủ vẫn trả đúng hai thứ — **cả dòng ở
 * bản trước** và **danh sách khoá đã đổi** — vì cả hai vẫn cần: khoá đã đổi nói
 * ô nào có dấu, giá trị cũ là thứ dấu ấy bày ra. Thứ giao diện tự làm lấy là
 * CHIỀU của dấu, và đó là một phép so trên hai con số nó đã cầm sẵn.
 *
 * ---------------------------------------------------------------------------
 * CẢ DÒNG, KHÔNG PHẢI DANH SÁCH TRƯỜNG ĐÃ ĐỔI
 * ---------------------------------------------------------------------------
 *
 * `0204` trả về mảng `{truong, truoc, sau}` chỉ chứa trường THẬT SỰ đổi. Lượt
 * này trả về **giá trị của cả dòng ở bản trước**, cộng danh sách khoá đã đổi để
 * màn hình biết ô nào đánh dấu. Khác nhau ở chỗ người đọc: `0204` trả lời *"đổi
 * những gì"*, còn đây trả lời *"trước đó dòng này trông thế nào"*.
 *
 * `0215` KHÔNG thu danh sách này về đúng những ô đã đổi, dù bảng đã biến mất:
 * giao diện cần giá trị cũ của một ô để dựng câu cho dấu tam giác, và một danh
 * sách co giãn theo từng dòng là một hình dạng thứ hai để mà đọc sai. Cái giá
 * là vài ô thừa trong thân phản hồi, đo được: tám khoá cho mỗi dòng *Chỉnh sửa*,
 * và chỉ dòng *Chỉnh sửa* mới có đối tượng này.
 *
 * **GIAO DIỆN KHÔNG TÍNH GÌ**, kể cả những con số dẫn xuất. `cpbh_total`,
 * `net_price`, `over_threshold` là **cột sinh** của `pol.policy_line`, còn
 * `discount_rate` và `threshold_snap` là cột lưu — nên bản trước đã có đủ mọi
 * con số ngay trong CSDL. Tính lại chúng ở trình duyệt là dựng một bản thứ hai
 * của `computeLine` cho đúng những con số đã được ĐÓNG BĂNG, tức đi ngược
 * `0022`.
 *
 * **MỘT DANH SÁCH, HAI BIỂU THỨC SINH RA TỪ NÓ** — giữ nguyên chốt chặn của
 * `0204`: giá trị và phép đánh dấu phải nói cùng một điều, và gõ tay hai lần là
 * lượt thêm trường thứ chín sửa một chỗ rồi quên chỗ kia (ô mang dấu mà giá trị
 * không hiện, hoặc ngược lại). `tsc` không canh được gì ở đây vì cả hai là chuỗi.
 *
 * **TẬP NÀY RỘNG HƠN `TRUONG_SO_VOI_BAN_TRUOC`, và phải thế**: bốn trường kia
 * quyết định NHÃN *Chỉnh sửa* (`0180`, `0202`, `0215`) — chúng là thứ TDV gõ.
 * Tập này còn bày ba con số dẫn xuất, vì đó là thứ người duyệt đọc: đổi giá bán
 * buôn thì tỷ lệ chiết khấu đổi theo, và **tỷ lệ mới là con số cả tờ giấy nói
 * về**. Có ca kiểm đòi bốn trường kia là TẬP CON của tập này — thiếu một cái là
 * có dòng mang nhãn *Chỉnh sửa* mà trên hàng không ô nào mang dấu.
 */
export const TRUONG_BAY_BAN_TRUOC = [
  // Thứ tự này là thứ tự CỘT của chính bảng sản phẩm. Từ `0215` nó thôi là thứ
  // tự đọc của một bảng riêng, nhưng vẫn giữ — nó là thứ tự người ta rà mắt
  // ngang qua hàng, và là thứ tự `doi` trả về.
  { khoa: 'ngayApDung', cot: 'ngay_ap_dung', dang: 'ngay' },
  { khoa: 'companyPrice', cot: 'company_price_snap', dang: 'so' },
  { khoa: 'wholesalePrice', cot: 'wholesale_price', dang: 'so' },
  { khoa: 'cpbh', cot: 'cpbh', dang: 'mang' },
  /*
   * TỔNG CPBH đi CÙNG mảng, và CHỈ ở danh sách này (`0214`).
   *
   * Bảng sản phẩm có cột *CPBH* mang tổng, rồi mới tới dải cột từng khoản — mà
   * hàng *bản trước* phải khớp từng cột với hàng ngay trên nó. Cộng mảng lại ở
   * trình duyệt là dựng một phép tính thứ hai cho một con số CSDL đã có sẵn
   * (`cpbh_total` là cột SINH).
   *
   * `0215` bỏ hàng ấy và khoá này VẪN CẦN, chỉ đổi lý do: cột *CPBH* là một cột
   * thật trên hàng chính, nên nó mang dấu tam giác của riêng nó — và giá trị cũ
   * mà dấu ấy bày ra phải là TỔNG cũ, không phải mảng cũ nối lại.
   *
   * KHÔNG ĐƯA VÀO `TRUONG_SO_VOI_BAN_TRUOC` — lượt sửa đầu của `0214` chèn nhầm
   * vào đó, vì hai danh sách có chung một dòng `{ khoa: 'cpbh', … }` và phép
   * thay chuỗi trúng danh sách đứng trước. Nó không đổi nhãn nào (tổng đổi thì
   * mảng cũng đổi) nên không ca kiểm nhãn nào đỏ; thứ bắt được là ca ghim TẬP
   * KHOÁ của `banTruoc`, ở tận lượt chạy cả bộ.
   *
   * Hai khoá cùng nói về CPBH nhưng KHÔNG thừa nhau: `[5000]` → `[3000, 2000]`
   * đổi mảng mà giữ nguyên tổng, nên đúng một trong hai ô được bôi vàng — và đó
   * là thứ `0204` đã đo và ghi lại.
   */
  { khoa: 'cpbhTotal', cot: 'cpbh_total', dang: 'so' },
  { khoa: 'netPrice', cot: 'net_price', dang: 'so' },
  { khoa: 'discountRate', cot: 'discount_rate', dang: 'so' },
  { khoa: 'threshold', cot: 'threshold_snap', dang: 'so' },
  /*
   * GHI CHÚ CŨNG RỜI KHỎI ĐÂY (`0215`, chốt 21/09), và vì một lý do RIÊNG —
   * không phải hệ quả kéo theo của lượt gỡ nó khỏi phép so nhãn.
   *
   * `0213` bày bản trước thành một BẢNG, nơi mọi ô đều đọc được như nhau: một
   * câu chữ cũ nằm cạnh một con số cũ không có gì khó. `0215` thay bảng ấy bằng
   * DẤU TAM GIÁC đặt cạnh giá trị mới, và dấu ấy mang đúng một tin — **lớn hơn
   * hay bé hơn**. Câu hỏi ấy không có nghĩa với một câu chữ.
   *
   * Nên giữ `note` ở đây là bắt giao diện dựng một dấu hiệu THỨ HAI cho đúng
   * một trường, trong khi trường ấy vừa thôi tính vào nhãn *Chỉnh sửa* — tức
   * không còn dòng nào mở ra được chỉ vì ghi chú. Cái mất, đã nêu với khách
   * hàng: ghi chú đổi thì trên hàng KHÔNG còn dấu vết nào.
   */
] as const;

/**
 * Dòng ở bản trước, hoặc `NULL` khi không có gì để bày.
 *
 * BA VẾ GÁC chép từng chữ của `SQL_TY_LE_CK_TRUOC`, y như `0204` đã làm: lệch
 * một vế là cùng một hàng vừa mang nhãn *Chỉnh sửa* vừa mở ra một bảng rỗng.
 * Và nó là thứ giữ cho bảng này CHỈ mở ở dòng *Chỉnh sửa* — một dòng chỉ đổi
 * NGƯỠNG (thứ đứng ngoài phép so nhãn, `0202`) mà mở ra được bảng có ô vàng thì
 * bảng ấy nói ngược cái nhãn ngay cạnh nó.
 */
export const SQL_BAN_TRUOC_TRA_VE = `
  CASE WHEN NOT l.da_xoa AND NOT ${SQL_HO_SO_DA_HIEU_LUC} AND ${SQL_DONG_KHAC_BAN_TRUOC}
       THEN jsonb_build_object(
         ${TRUONG_BAY_BAN_TRUOC.map((t) => `'${t.khoa}', ${docCot('truoc', t)}`).join(',\n         ')},
         'doi', (
           SELECT coalesce(jsonb_agg(k ORDER BY i), '[]'::jsonb)
             FROM jsonb_array_elements_text(jsonb_build_array(
               ${TRUONG_BAY_BAN_TRUOC.map(
                 (t) => `CASE WHEN l.${t.cot} IS DISTINCT FROM truoc.${t.cot}
                       THEN '${t.khoa}' END`,
               ).join(',\n               ')}
             )) WITH ORDINALITY AS t(k, i)
            WHERE k IS NOT NULL))
       ELSE NULL END`;

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

    /*
     * MỘT BẢN NHÁP MỖI KHÁCH HÀNG (`0197`).
     *
     * Đứng TRƯỚC phép tra bản đang hiệu lực, và thứ tự ấy là một quyết định:
     * hai chốt cùng nói *"đừng lập cái mới"* nhưng chỉ chốt này đưa ra được một
     * việc để làm ngay — *mở bản nháp đang có*. `NEW_VERSION_REQUIRED` thì bảo
     * người dùng bấm lại bằng một cái nút khác. Hỏi câu có câu trả lời trước.
     *
     * Áp cho CẢ HAI đường (bản đầu và `NEW_VERSION`): một bản nháp đang dở là
     * một bản nháp đang dở, không phụ thuộc nó sẽ thành phiên bản thứ mấy.
     *
     * KHÔNG lọc theo người lập. Luật là *"một khách một bản Nháp"*, và một khách
     * chỉ có một TDV phụ trách (`assertInScope` ngay trên đã gác), nên lọc thêm
     * theo `created_by` chỉ mở lại đúng khe vừa bịt ở lượt đổi TDV phụ trách.
     *
     * ---------------------------------------------------------------------------
     * `0220` — MỘT HỒ SƠ ĐANG XỬ LÝ MỖI KHÁCH, không riêng bản Nháp.
     * ---------------------------------------------------------------------------
     *
     * Khách hàng chốt 25/09: *"mỗi khách hàng chỉ được có một CSBH tại một thời
     * điểm, không tính các CSBH đang có hiệu lực, đã xoá, hết hiệu lực"* — và
     * `QUA_HAN_DUYET` cũng không tính (chốt khi được hỏi: nó là trạng thái kết
     * thúc, không ai thao tác được, đếm nó là khoá khách ấy tối đa 3 ngày chờ
     * `sla-worker` chuyển sang `DA_XOA`). Tập còn lại đúng bằng `CHUA_DUYET_XONG`
     * — sáu trạng thái, dựng từ `SUA_DUOC` — nên dùng lại hằng ấy chứ không chép.
     *
     * Đây là phần mở rộng của `0197`, và nó ĐẢO lập luận ở đó (*"CHỈ `NHAP`,
     * không tính `YEU_CAU_CHINH_SUA` — cấm ở đó là một luật khác hẳn, không ai
     * yêu cầu"*): giờ có người yêu cầu đúng luật ấy. Khách có hồ sơ bị trả về thì
     * TDV sửa rồi gửi lại chính hồ sơ ấy, hoặc xoá nó — không lập thêm bản thứ hai.
     *
     * Thứ tự với `NEW_VERSION_REQUIRED` giữ nguyên lý do cũ: câu này đưa ra được
     * một việc làm ngay (*mở hồ sơ đang có*).
     */
    const dangDo = await this.db.one<{ id: string; code: string; status: string }>(
      SQL_HO_SO_DANG_DO,
      [input.customerId, CHUA_DUYET_XONG],
    );
    if (dangDo) throw loiDangDo(dangDo);

    /*
     * MÃ HỒ SƠ (`0198`) — kiểm hình dạng ở đây, kiểm trùng ở CSDL.
     *
     * Hai phép kiểm khác nhau và cả hai đều ở đúng chỗ: hình dạng là một hàm
     * thuần (`chuanHoaMa`) nên nó trả lời được ngay, còn *"mã này có ai giữ
     * chưa"* thì chỉ chỉ mục `uq_policy_code` trả lời đúng ở mọi lượt song song.
     *
     * Không tra trước bằng một câu `SELECT`: khác `assertMstChuaDung` của
     * `0175`, ở đây câu lỗi KHÔNG cần nói ra hồ sơ nào đang giữ mã — hồ sơ ấy có
     * thể nằm ngoài phạm vi người gõ, và nói ra là rò rỉ sự tồn tại của nó.
     */
    const maMoi = input.code === undefined ? null : dungMa(input.code);

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
        // `coalesce($8, pol.next_policy_code())` — TDV gõ mã thì dùng mã ấy,
        // không thì sinh. Để phép chọn ở SQL chứ không ở Node là để lượt sinh
        // KHÔNG chạy khi không cần: `nextval` đốt một số ở mỗi lượt gọi, kể cả
        // lượt mà kết quả bị vứt đi (`0198`).
        `INSERT INTO pol.policy
           (id, code, customer_id, version_no, status, supersedes_id,
            created_by, tdv_user_id, app_version)
         VALUES ($7, coalesce($8, pol.next_policy_code()), $1, $2, 'NHAP', $3, $4, $5, $6)
         RETURNING *`,
        [
          input.customerId,
          active ? active.version_no + 1 : 1,
          active?.id ?? null,
          me.id,
          customer.tdvUserId,
          process.env.APP_VERSION ?? '0.0.0-dev',
          policyId,
          maMoi,
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
    }).catch((e: unknown) => this.doiTrungNhap(e, input.customerId));
  }

  /**
   * `23505` từ `UQ_DANG_DO` (`0220`) → cùng câu lỗi mà phép kiểm ở trên trả
   * về (`0197`).
   *
   * Đường này chỉ chạy khi HAI lượt lập song song cùng lọt qua phép kiểm — bấm
   * đúp nút *Lập hồ sơ*. Nó hiếm, và chính vì hiếm mà nó phải trả đúng câu kia:
   * một câu lỗi chỉ xuất hiện ở lượt bấm đúp là một câu không ai từng đọc thử.
   *
   * Tra LẠI id bản nháp thay vì đọc từ lỗi: `23505` không mang theo khoá của
   * dòng đang giữ chỗ, và lượt tra này chạy sau khi transaction đã lăn ngược nên
   * nó thấy đúng dòng thắng cuộc.
   *
   * Đối chiếu TÊN CHỈ MỤC chứ không chỉ mã lỗi: `pol.policy` sẽ có chỉ mục duy
   * nhất thứ hai ở `0198` (mã hồ sơ), và trả *"đã có bản Nháp"* cho một lượt
   * trùng MÃ là nói sai ở đúng chỗ khó truy nhất.
   */
  private async doiTrungNhap(e: unknown, customerId: string): Promise<never> {
    const loi = e as { code?: string; constraint?: string };
    // `0220` — chỉ mục đổi tên và nới phạm vi; câu trả lời vẫn đi đúng hàm mà
    // phép kiểm ở `create` dùng, nên bấm đúp và bấm một lần nhận cùng một câu.
    if (loi?.code === '23505' && loi.constraint === UQ_DANG_DO) {
      const dangDo = await this.db.one<{ id: string; code: string; status: string }>(
        SQL_HO_SO_DANG_DO,
        [customerId, CHUA_DUYET_XONG],
      );
      if (dangDo) throw loiDangDo(dangDo);
    }
    // `0198` — ràng buộc duy nhất THỨ HAI trên cùng bảng. Đây chính là lý do
    // nhánh trên đối chiếu TÊN ràng buộc chứ không chỉ mã lỗi `23505`.
    if (loi?.code === '23505' && loi.constraint === UQ_MA) throw maDaCo();
    throw e;
  }

  /**
   * MÃ ĐỀ XUẤT cho một hồ sơ sắp lập (`0198`).
   *
   * ĐỐT MỘT SỐ CỦA SEQUENCE ở mỗi lượt gọi, và đó là lựa chọn có chủ ý. Cách kia
   * — đọc `last_value + 1` mà không lấy — cho hai TDV mở màn hình cùng lúc đúng
   * MỘT mã đề xuất, tức đẩy một người vào lỗi trùng ở ngay lượt đầu tiên họ bấm,
   * với một con số họ không tự gõ ra. Lấy hẳn thì mỗi người một mã.
   *
   * Cái giá là những khoảng trống trong dãy số khi ai đó mở màn hình rồi bỏ đi.
   * Dãy này VỐN ĐÃ có trống — sequence không nằm trong transaction nên mọi lượt
   * lập hỏng giữa chừng đều để lại một lỗ — nên đây không phải tính chất mới bị
   * mất, và mã hồ sơ chưa bao giờ hứa là một dãy liên tục.
   */
  async maDeXuat(): Promise<{ code: string }> {
    const r = await this.db.one<{ code: string }>(`SELECT pol.next_policy_code() AS code`);
    return { code: r!.code };
  }

  /**
   * ĐỔI MÃ hồ sơ đang ở *Nháp* (`0198`).
   *
   * CHỈ `NHAP`, không phải cả `EDITABLE`. `mustEdit` cho cả `YEU_CAU_CHINH_SUA`
   * và ở đây phải hẹp hơn nó — hồ sơ bị trả về là hồ sơ ĐÃ gửi duyệt một lần,
   * nên mã của nó đã đi vào thư đã gửi, vào dòng thông báo trên chuông, vào nhật
   * ký người duyệt đọc, và có thể vào một bản mềm đã lưu mang chính mã ấy làm
   * tên tệp. Đổi mã lúc ấy là làm mọi tham chiếu kia trỏ vào hư không, lặng lẽ.
   *
   * Bản Nháp thì chưa có gì trong số đó: `CREATE` không nằm trong `RECIPIENTS`
   * nên không lá thư nào mang mã của nó đi.
   */
  async doiMa(policyId: string, raw: string, me: AuthUser): Promise<{ code: string }> {
    const ma = dungMa(raw);
    const p = await this.mustEdit(policyId, me);
    if (p.status !== 'NHAP') {
      throw new ConflictException({
        code: 'POLICY_CODE_LOCKED',
        message: 'Chỉ đổi được mã khi hồ sơ còn ở Nháp.',
        status: p.status,
      });
    }
    // Không đổi gì thì thôi — tránh một lượt ghi và một sự kiện cho lượt bấm
    // dấu tick mà người dùng chưa sửa chữ nào.
    if (p.code === ma) return { code: ma };

    return this.db
      .tx(async (c) => {
        await c.query(`UPDATE pol.policy SET code = $2 WHERE id = $1`, [policyId, ma]);
        /*
         * PHÁT SỰ KIỆN, vì `rpt.policy_row` giữ một bản sao của `code`.
         *
         * Read-model đồng bộ theo `policy.#` và đọc lại cả dòng từ nguồn, nên
         * một sự kiện bất kỳ của hồ sơ này là đủ. Thiếu nó thì màn hình *Hồ sơ
         * CSBH* và mọi báo cáo vẫn bày mã CŨ cho tới lượt hồ sơ đổi trạng thái —
         * hai chỗ nói hai mã, và không gì đỏ.
         */
        await emit(c, 'policy.updated', {
          policyId,
          customerId: p.customer_id,
          code: ma,
          actorId: me.id,
          at: new Date().toISOString(),
        });
        return { code: ma };
      })
      .catch((e: unknown) => {
        const loi = e as { code?: string; constraint?: string };
        if (loi?.code === '23505' && loi.constraint === UQ_MA) throw maDaCo();
        throw e;
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
    const rate = rate2ToNumeric(calc.discountRate);
    const threshold = snap.thresholdRate2 === null ? null : rate2ToNumeric(snap.thresholdRate2);

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
          /*
           * `0180` — ngày áp dụng của dòng, tức con số ĐI RA MÀN HÌNH và ra tờ
           * giấy. Rơi về hôm nay chỉ xảy ra ở đường gọi không khai ngày, và
           * `create` đã điền sẵn trước khi tới đây.
           *
           * `0203` — NÓ THÔI LÀ CÙNG MỘT CON SỐ VỚI NGÀY TRA BẢNG GIÁ. Tới `0202`
           * chỗ này còn ghi *"`customer.on` vừa được dùng để tra bảng giá vài
           * dòng trên, nên hai con số không thể lệch nhau"* — câu ấy hết đúng:
           * `addLine` và `updateLine` giờ tra ở `ngayTraDanhMuc(on, hôm nay)` rồi
           * đưa ảnh chụp vào đây qua `preloaded`, đúng để hai con số ĐƯỢC PHÉP
           * lệch. Dòng đề ngày quá khứ mang giá hiện hành mà vẫn giữ ngày của
           * nó; gộp lại là dời ngày áp dụng và lật nhãn trạng thái (`0201`).
           */
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
      /*
       * `0180` — ngày của CHÍNH DÒNG NÀY quyết định bảng giá được chụp, không
       * phải một ngày của hồ sơ. Thiếu thì hôm nay (`ngayVN`).
       *
       * `0203` — nhưng KHÔNG cũ hơn hôm nay, xem `ngayTraDanhMuc`. Ảnh chụp tra
       * sẵn ở đây rồi đưa vào `upsertLine` qua `preloaded`, vì hàm ấy dùng
       * `customer.on` cho CẢ HAI việc — tra danh mục và ghi `ngay_ap_dung` — mà
       * từ nay hai con số ấy tách nhau: ngày GHI là ngày TDV khai, ngày TRA là
       * ngày đã quy đổi.
       */
      const ngayDong = line.ngayApDung ?? ngayVN();
      const snap = await this.clients.productSnapshot(
        line.productId,
        customer.customerType,
        ngayTraDanhMuc(ngayDong, ngayVN()),
      );
      await this.upsertLine(c, policyId, line, { ...customer, on: ngayDong }, snap);
      await this.quenDauVetDong(c, policyId, line.productId);
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
      /*
       * `0203` — GIÁ BÁN CÔNG TY LẤY BẢNG GIÁ HIỆN HÀNH, không phải bảng giá của
       * một ngày đã qua.
       *
       * Khách hàng chốt 12/09: mở *Sửa* một dòng thì Giá bán Công ty phải là giá
       * hiện tại. Trước lượt này nó tra theo `on` — với dòng thừa kế thì `on` là
       * ngày của bản CSBH trước, tức một ngày quá khứ, tức đúng con số đang nằm
       * sẵn trên dòng. Hộp thoại vì thế bày lại chính nó.
       *
       * Đo được, và nặng hơn hộp thoại: sau khi bấm *Tự động cập nhật* (dòng lên
       * 130.000), sửa MỘT GHI CHÚ là dòng tụt về 100.000 — lượt cập nhật biến
       * mất, khối *Yêu cầu cập nhật* mọc lại, không ai đụng vào giá.
       *
       * `on` vẫn là ngày GHI vào `ngay_ap_dung` (đổi nó là dời ngày áp dụng và
       * lật nhãn trạng thái của mọi dòng — `0201`); chỉ ngày TRA đổi.
       */
      const snap = await this.clients.productSnapshot(
        cu.rows[0]!.product_id,
        customer.customerType,
        ngayTraDanhMuc(on, ngayVN()),
      );
      await this.upsertLine(
        c,
        policyId,
        { productId: cu.rows[0]!.product_id, ...input, ngayApDung: on },
        { ...customer, on },
        snap,
      );
      await this.quenDauVetDong(c, policyId, cu.rows[0]!.product_id);
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

      const bo = await c.query<{ product_id: string }>(
        dong.rows[0]!.thua_ke
          ? `UPDATE pol.policy_line SET da_xoa = true WHERE id = $1 AND policy_id = $2
             RETURNING product_id`
          : `DELETE FROM pol.policy_line WHERE id = $1 AND policy_id = $2
             RETURNING product_id`,
        [lineId, policyId],
      );
      // `0186` — dòng đã rút không sinh *Yêu cầu cập nhật*; từ `0200` luật ấy
      // phải nói cả với dấu vết ĐÃ GHI, không riêng lượt rà kế tiếp.
      if (bo.rows[0]) await this.quenDauVetDong(c, policyId, bo.rows[0].product_id);
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
  /**
   * *Tự động cập nhật* — áp chênh lệch danh mục vào bảng sản phẩm (`0194`).
   *
   * Khách hàng chốt 10/09: *"khi nhấn vào thao tác này bảng sản phẩm sẽ tự động
   * được cập nhật thông tin theo những thay đổi mới đó, sau khi cập nhật xong
   * phần thông tin yêu cầu thay đổi sẽ biến mất"*.
   *
   * KHÔNG có phép tính nào ở đây — nó gọi thẳng `lamMoiDong`, đúng hàm mà lượt
   * gửi duyệt gọi. Đó là cả điểm: nút này chỉ dời THỜI ĐIỂM của một việc vẫn
   * luôn xảy ra, chứ không thêm một đường ghi thứ hai vào dòng hồ sơ. Khối lệch
   * tự biến mất sau đó vì `soSanhDong` tính lại và không còn gì để bày.
   *
   * `mustEdit` gác BA vế cùng lúc, và cả ba đều cần:
   *   * hồ sơ có thật và trong phạm vi người gọi;
   *   * người gọi là **TDV đang phụ trách** — không phải người lập cũ;
   *   * hồ sơ **còn sửa được**. Đây là vế nặng nhất: một hồ sơ đang chờ chữ ký
   *     mà bấm được nút này thì cả luật đóng băng của `0022` sụp — người duyệt
   *     đọc một con số rồi ký vào một con số khác.
   *
   * `hong` KHÔNG ném lỗi, khác hẳn lượt gửi duyệt. Ở đó dòng không làm mới được
   * là lý do chặn, vì một con số không kiểm được sắp đi vào văn bản ký. Ở đây
   * người dùng mới chỉ đang sửa: áp được dòng nào thì áp, dòng còn lại vẫn nằm
   * trong khối lệch với đúng lý do của nó. Chặn cả lượt vì một dòng hỏng là bắt
   * họ sửa tay cả những dòng máy làm được.
   *
   * ---------------------------------------------------------------------------
   * `0199` — MỘT transaction, và một dòng nhật ký.
   * ---------------------------------------------------------------------------
   *
   * Bản `0194` mở HAI transaction: một để ghi, một để gọi `soSanhDong` đếm lại
   * phần còn lệch. Lượt thứ hai hỏi danh mục thêm một vòng nữa **sau khi phép
   * ghi đã commit**, và nó không có `catch` (khác `byId`) — nên một cú chớp mạng
   * ở đúng khoảng ấy trả lỗi cho người dùng về một việc ĐÃ LÀM XONG, giao diện
   * không tải lại, và màn hình bày số cũ cho dòng vừa đổi dưới CSDL. `lamMoiDong`
   * giờ trả luôn `conLai` tính từ chính bộ số nó vừa đọc, nên khe ấy không còn.
   *
   * PHÁT `policy.updated`, chỉ khi có dòng thật sự ghi lại được. `lamMoiDong`
   * cố ý không phát sự kiện nào — đúng khi nó còn chạy ở đường ĐỌC (`0029`:
   * *"không có người nào vừa sửa gì"*). Tiền đề ấy mất từ `0194`: đây là một
   * lượt GHI do người dùng bấm, đổi giá bán Công ty · ngưỡng · tỷ lệ CK của
   * nhiều dòng cùng lúc. `audit` nghe `#`, nên không sự kiện = **không một dòng
   * dấu vết nào** cho một thao tác đổi số trên văn bản sắp ký. `bumpVersion` đi
   * kèm vì dữ liệu đã đổi thật, đúng nếp `suaDong`/`xoaDong`/`khoiPhucDong`.
   */
  async apDungThayDoi(policyId: string, me: AuthUser) {
    // `0239` — đường GHI duy nhất của tính năng, nên chặn trước mọi phép kiểm
    // khác: một lượt gọi thẳng API không được đổi số trên hồ sơ khi tính năng
    // còn tắt. Lượt gửi duyệt vẫn gọi `lamMoiDong` như cũ — đó là luật đóng
    // băng (`0029`), không thuộc tính năng này.
    if (!batTinhNang('yeuCauCapNhat')) {
      throw new NotFoundException({ code: 'FEATURE_NOT_ENABLED' });
    }
    const p = await this.mustEdit(policyId, me);
    return this.db.tx(async (c) => {
      const { hong, daDoi, daRut, conLai } = await this.lamMoiDong(c, policyId, {
        rutHangVoHieu: true,
      });
      if (daDoi.length > 0 || daRut.length > 0) {
        await this.bumpVersion(c, policyId);
        await emit(c, 'policy.updated', {
          ...evtCtx(p),
          change: 'LINES_REFRESHED',
          soDong: daDoi.length,
          soDongRut: daRut.length,
          actorId: me.id,
          at: new Date().toISOString(),
        });
      }
      return { hong, daRut, conLai: conLai.length };
    });
  }

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
   * ---------------------------------------------------------------------------
   * `0194` — THÔI CHẠY Ở ĐƯỜNG ĐỌC. Giờ chỉ hai chỗ gọi: nút *Tự động cập nhật*
   * và lượt gửi duyệt.
   * ---------------------------------------------------------------------------
   *
   * Tới `0193` hàm này chạy ở MỌI lượt mở hồ sơ sửa được, và nó ghi đè trong im
   * lặng: TDV mở hồ sơ vừa bị trả về ra sửa thì giá với ngưỡng đã đổi dưới tay
   * họ, không có gì nói đã đổi cái gì. Khách hàng chốt 10/09 rằng cái đã đổi phải
   * **bày ra**, và việc áp dụng phải là **một cú bấm**.
   *
   * Lập luận trên vẫn đúng nguyên — con số trên bản nháp phải là con số sẽ đóng
   * băng — chỉ là nó được bảo đảm ở CHỖ KHÁC: `workflow` gọi hàm này ngay trước
   * khi hồ sơ rời `Nháp`, và chặn bằng `STALE_LINE` nếu có dòng không làm mới
   * được. Nên một bản nháp chưa ai bấm nút vẫn không bao giờ đi vào luồng với số
   * cũ. Cái mất là *"mở ra là thấy số hôm nay"*; cái được là *"số không tự đổi
   * sau lưng người đang soạn"*.
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
  /**
   * Chênh lệch của một hồ sơ CÒN SỬA ĐƯỢC, tính tại chỗ — KHÔNG ghi gì (`0194`).
   *
   * Vì sao tính chứ không đọc `pol.policy_impact`: bảng ấy chỉ ghi cho hồ sơ đã
   * đóng băng (consumer lọc theo `DA_DONG_BANG`), và nó chỉ được ghi lại lúc
   * danh mục đổi. Chênh lệch của một bản nháp thì đổi mỗi lần TDV sửa một dòng —
   * thêm một mặt hàng, đổi ngày áp dụng — nên một bảng dấu vết ở đây sẽ nói sai
   * ngay lượt sửa đầu tiên.
   *
   * Dùng CHUNG `soSanhLech` với consumer: hai đường tính, một câu hỏi.
   */
  /**
   * QUÊN DẤU VẾT LỆCH của một mặt hàng vừa được TDV ghi lại tay (`0200`).
   *
   * Từ `0200` `pol.policy_impact` mang cả hồ sơ CÒN SỬA ĐƯỢC, để box *Yêu cầu
   * cập nhật* chỉ đường cho TDV. Nhưng dấu vết ấy do consumer ghi lúc DANH MỤC
   * đổi, còn dòng hồ sơ thì TDV sửa bất cứ lúc nào — nên thiếu bước quên này,
   * box nói về một chênh lệch đã tự tay người dùng xử xong.
   *
   * XOÁ chứ không ghi lại: sau `upsertLine` dòng ấy vừa chụp lại giá và ngưỡng ở
   * đúng ngày áp dụng của nó, tức nó khớp danh mục **theo cấu trúc** — không có
   * gì để ghi. Sau lượt rút dòng thì `0186` đã nói: dòng sắp biến mất không sinh
   * yêu cầu cập nhật.
   *
   * CHỖ CÒN HỞ, nói ra thay vì để người sau tự phát hiện: nút *Thêm lại* dựng
   * lại một dòng mang số CŨ (`0186` — khôi phục là hoàn tác lượt xoá, không hoàn
   * tác những lượt sửa trước đó), nên nó có thể lệch mà không có dấu vết nào tới
   * lần đổi danh mục kế tiếp. Sai theo hướng BÁO THIẾU, và màn hình hồ sơ vẫn
   * tính tại chỗ nên con số ở đó vẫn đúng.
   */
  /**
   * RÚT một mặt hàng khỏi hồ sơ theo `product_id` (`0200`).
   *
   * Cùng luật với `removeLine` và cố ý gọi lại đúng hai câu lệnh ấy: dòng THỪA
   * KẾ thì xoá mềm — nó nằm lại, mờ đi, mang nhãn *Đã xoá*, đi hết luồng duyệt
   * để người duyệt THẤY được mặt hàng vừa bị rút (`0186`); dòng mới thêm trong
   * chính phiên bản này thì xoá hẳn, vì không có bản trước nào để đối chiếu và
   * một dòng mờ không đến từ đâu cả chỉ làm bảng dài thêm.
   *
   * Khác `removeLine` đúng một chỗ: tra theo `product_id` chứ không theo
   * `lineId`, vì người gọi là `lamMoiDong` — nó làm việc theo mặt hàng.
   * `uq_policy_line_product` bảo đảm hai khoá ấy chỉ ra cùng một dòng.
   */
  private async rutDongTheoSanPham(
    c: PoolClient,
    policyId: string,
    productId: string,
  ): Promise<void> {
    const dong = await c.query<{ thua_ke: boolean }>(
      `SELECT ${SQL_DONG_THUA_KE} AS thua_ke
         FROM pol.policy_line l
         ${SQL_NOI_BAN_TRUOC}
        WHERE l.product_id = $2 AND l.policy_id = $1 AND NOT l.da_xoa`,
      [policyId, productId],
    );
    if (dong.rowCount === 0) return;
    await c.query(
      dong.rows[0]!.thua_ke
        ? `UPDATE pol.policy_line SET da_xoa = true WHERE policy_id = $1 AND product_id = $2`
        : `DELETE FROM pol.policy_line WHERE policy_id = $1 AND product_id = $2`,
      [policyId, productId],
    );
    await this.quenDauVetDong(c, policyId, productId);
  }

  private async quenDauVetDong(
    c: PoolClient,
    policyId: string,
    productId: string,
  ): Promise<void> {
    await c.query(`DELETE FROM pol.policy_impact WHERE policy_id = $1 AND product_id = $2`, [
      policyId,
      productId,
    ]);
  }

  async soSanhDong(c: PoolClient, policyId: string): Promise<MucLech[]> {
    const dat = await this.docDongVaAnh(c, policyId);
    if (!dat) return [];
    return dat.dong.flatMap((d) => soSanhMotDong(d, dat));
  }

  /**
   * Đọc mọi dòng còn sống của một hồ sơ SỬA ĐƯỢC, kèm ảnh chụp danh mục TƯƠI.
   *
   * Đầu vào chung của `soSanhDong` (chỉ đọc) và `lamMoiDong` (ghi). Gom một chỗ
   * vì hai hàm ấy phải nhìn thấy **đúng cùng một bộ số**: bày ra một chênh lệch
   * rồi áp dụng một chênh lệch khác là cách hỏng khó truy nhất của cả chặng.
   *
   * `null` khi hồ sơ không tồn tại, không sửa được, hoặc không còn dòng nào.
   *
   * ---------------------------------------------------------------------------
   * `0199` — CHỊU ĐƯỢC SẢN PHẨM VẮNG MẶT, nhưng KHÔNG chịu được tra hụt.
   * ---------------------------------------------------------------------------
   *
   * Tới `0198` chỗ này gọi `productSnapshots` trần, tức lời gọi CẢ LÔ vốn trả
   * 404 cho toàn bộ khi chỉ một id không còn. Hậu quả đo được: hồ sơ Nháp có một
   * mặt hàng đã biến mất khỏi danh mục thì `byId` nuốt lỗi và trả `lech: []` —
   * khối cảnh báo tắt HẲN, kể cả chênh lệch của những dòng chẳng liên quan; nút
   * *Tự động cập nhật* và cả lượt GỬI DUYỆT thì nhận `404 PRODUCT_NOT_FOUND`,
   * một câu không nêu tên dòng nào. Cùng lúc ấy hồ sơ ĐÃ ĐÓNG BĂNG của cùng
   * khách, cùng hai dòng, trả về đủ hai chênh lệch — vì consumer có nhánh lùi.
   *
   * HAI NHÓM, xử KHÁC NHAU, và ranh giới ấy là cả điểm của lượt sửa:
   *
   *   * **kết luận được** (`PRODUCT_NOT_FOUND`, `PRICE_NOT_SET`) → đi tiếp, id ấy
   *     vắng mặt trong `anh` và `loi` nói vì sao. Đây là THÔNG TIN CẦN BÁO.
   *   * **không kết luận được** (mạng chớp, catalog 500) → NÉM, đúng như trước.
   *     Nuốt nó là mời `lamMoiDong` xếp mọi mặt hàng vào `hong`, rồi `STALE_LINE`
   *     bảo người dùng *"rút mặt hàng đó khỏi hồ sơ"* trong khi danh mục chỉ
   *     đang khởi động lại — một lời khuyên phá dữ liệu. `byId` vẫn nuốt ở lớp
   *     ngoài nên người dùng vẫn mở được hồ sơ, đúng lập luận `0089`.
   */
  private async docDongVaAnh(
    c: PoolClient,
    policyId: string,
  ): Promise<{
    dong: DongLamMoi[];
    anh: Map<string, ProductSnapshot>;
    /** id → vì sao không có ảnh chụp. Chỉ chứa mã KẾT LUẬN ĐƯỢC — xem trên. */
    loi: Map<string, string>;
  } | null> {
    const p = await c.query<{ customer_id: string; status: string }>(
      `SELECT customer_id, status::text AS status FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    const ho = p.rows[0];
    if (!ho || !EDITABLE.includes(ho.status)) return null;

    const dong = await c.query<DongLamMoi>(
      /*
       * MỌI CỘT CẦN, TRONG MỘT LƯỢT (`0194`).
       *
       * Tới `0193` câu này lấy ba cột rồi hỏi lại `wholesale_price`/`cpbh` bằng
       * một `SELECT` RIÊNG CHO TỪNG DÒNG ở giữa vòng lặp — một N+1 nằm sẵn ở
       * đường đọc. Từ `0194` cả `soSanhDong` lẫn `lamMoiDong` đều đọc qua đây,
       * và hai ảnh chụp đã đóng băng (`company_price_snap`, `threshold_snap`)
       * là thứ phép so cần, nên gom hết vào một lượt.
       *
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
      `SELECT product_id, product_code_snap, ngay_ap_dung,
              company_price_snap::text AS company_price_snap,
              threshold_snap::text     AS threshold_snap,
              rule_code_snap,
              wholesale_price::text    AS wholesale_price,
              cpbh::text[]             AS cpbh
         FROM pol.policy_line WHERE policy_id = $1 AND NOT da_xoa`,
      [policyId],
    );
    if (dong.rowCount === 0) return null;

    const customer = await this.clients.customer(ho.customer_id);
    /*
     * MỘT VÒNG MẠNG CHO MỖI NGÀY, không phải cho mỗi dòng (`0180`).
     *
     * Hàm này chạy ở đường ĐỌC nên chi phí của nó là thứ người dùng ngồi chờ.
     * Trước `0180` cả hồ sơ dùng chung một ngày nên một vòng là đủ; giờ mỗi dòng
     * có ngày riêng, và gom theo ngày giữ được đúng tính chất ấy ở trường hợp
     * thường gặp — mọi dòng cùng ngày thì vẫn đúng một vòng.
     */
    const snaps = new Map<string, ProductSnapshot>();
    const theoNgay = new Map<string, string[]>();
    // `0201` — KHÔNG tra bằng chính `ngay_ap_dung`: dòng đề ngày quá khứ thì đó
    // là một câu hỏi rỗng, và mọi dòng thừa kế của một phiên bản mới đều đề ngày
    // quá khứ. Xem `ngayTraDanhMuc`. Gom theo ngày ĐÃ quy đổi nên mọi dòng quá
    // khứ dồn về một lô, tức số vòng mạng chỉ giảm đi.
    const homNay = ngayVN();
    for (const d of dong.rows) {
      const on = ngayTraDanhMuc(ngayISO(d.ngay_ap_dung)!, homNay);
      (theoNgay.get(on) ?? theoNgay.set(on, []).get(on)!).push(d.product_id);
    }
    const loi = new Map<string, string>();
    const khongKetLuanDuoc: string[] = [];
    for (const [on, ids] of theoNgay) {
      const lo = await this.clients.productSnapshotsChiuLoi(ids, customer.customerType, on);
      for (const [id, s] of lo.anh) snaps.set(id, s);
      for (const [id, ma] of lo.loi) {
        if (ma === undefined) khongKetLuanDuoc.push(id);
        else loi.set(id, ma);
      }
    }
    if (khongKetLuanDuoc.length > 0) {
      throw new Error(
        `catalog không tra được ${khongKetLuanDuoc.length} sản phẩm của hồ sơ ${policyId}`,
      );
    }

    return { dong: dong.rows, anh: snaps, loi };
  }

  /**
   * TRẢ VỀ BA THỨ từ `0199`, không phải một mảng `hong` (`0194`).
   *
   *   * `hong` — mã những dòng KHÔNG làm mới được. Không đổi nghĩa.
   *   * `daDoi` — dòng mà lượt ghi thật sự ĐỔI SỐ. **Không phải** dòng đã ghi:
   *     hàm này `UPDATE` lại mọi dòng lành, kể cả dòng đang khớp danh mục từng
   *     con số, nên "đã ghi" luôn khác rỗng ở mọi hồ sơ còn sống. `apDungThayDoi`
   *     đọc `daDoi` để quyết định có ghi một dòng nhật ký hay không — bấm một nút
   *     không còn việc gì để làm là chuyện thường (hai tab, bấm hai lần), và ghi
   *     nhật ký cho nó là dựng ra tiếng ồn đúng ở chỗ người ta vào tìm dấu vết.
   *     (Ca kiểm bắt được đúng chỗ này lúc `0199` còn đọc "đã ghi".)
   *   * `conLai` — phần CÒN LỆCH sau lượt ghi, tính ngay tại đây từ chính bộ số
   *     vừa đọc. Nó đúng bằng chênh lệch của những dòng KHÔNG áp được: dòng đã
   *     ghi lại thì `company_price_snap` và `threshold_snap` vừa được đặt bằng
   *     đúng ảnh chụp, nên phép so cho mảng rỗng **theo cấu trúc**, không phải
   *     theo may mắn. Nhờ thế `apDungThayDoi` thôi phải mở transaction thứ hai
   *     và hỏi danh mục thêm một lượt sau khi đã ghi.
   */
  async lamMoiDong(
    c: PoolClient,
    policyId: string,
    tuyChon: { rutHangVoHieu?: boolean } = {},
  ): Promise<{ hong: string[]; daDoi: string[]; daRut: string[]; conLai: MucLech[] }> {
    const dat = await this.docDongVaAnh(c, policyId);
    if (!dat) return { hong: [], daDoi: [], daRut: [], conLai: [] };
    const { dong, anh: snaps } = dat;

    const hong: string[] = [];
    /** Dòng đã ghi lại được — dấu vết lệch của chúng thôi còn đúng. */
    const daApDung: string[] = [];
    const daDoi: string[] = [];
    const daRut: string[] = [];
    const conLai: MucLech[] = [];
    for (const d of dong) {
      const lechDong = soSanhMotDong(d, dat);
      const snap = snaps.get(d.product_id);
      /*
       * MẶT HÀNG ĐÃ VÔ HIỆU HOÁ: RÚT khỏi hồ sơ (`0200`), chỉ khi được bảo.
       *
       * Khách hàng chốt 11/09. Trước đó dòng ấy nằm lại trong `hong` mãi mãi —
       * nút không áp được nó, và người dùng phải tự đi tìm nút *Xoá* trên đúng
       * hàng ấy sau khi đọc một câu giải thích. Một mặt hàng không còn bán thì
       * việc phải làm chỉ có MỘT, nên bắt họ làm tay là bắt gõ lại một quyết
       * định đã rõ.
       *
       * CỜ, không phải hành vi mặc định — và đây là chỗ nguy hiểm nhất của cả
       * lượt sửa. Lượt GỬI DUYỆT cũng gọi hàm này (`workflow.service`); bật
       * mặc định là hồ sơ **âm thầm mất một mặt hàng** ngay lúc rời tay người
       * lập, không ai bấm gì, không ai đọc gì. Ở đó `STALE_LINE` vẫn phải chặn
       * và nói ra, để chính người lập quyết định.
       *
       * CHỈ mặt hàng vô hiệu hoá, KHÔNG gồm mọi thứ rơi vào `hong`. Sản phẩm
       * biến mất khỏi danh mục và sản phẩm chưa khai giá tại ngày áp dụng cũng
       * không làm mới được, nhưng việc phải làm của chúng khác hẳn: cái sau sửa
       * được bằng cách đổi *Ngày áp dụng*, và rút dòng là phá dữ liệu để chữa
       * một thứ không hỏng.
       */
      if (tuyChon.rutHangVoHieu === true && snap && snap.status !== 'DANG_AP_DUNG') {
        await this.rutDongTheoSanPham(c, policyId, d.product_id);
        daRut.push(d.product_code_snap);
        continue;
      }
      if (!snap || snap.status !== 'DANG_AP_DUNG') {
        hong.push(d.product_code_snap);
        conLai.push(...lechDong);
        continue;
      }
      // Giá bán buôn và CPBH lấy từ CHÍNH DÒNG đang có: chúng là con số NGƯỜI
      // DÙNG nhập, không phải ảnh chụp danh mục, nên làm mới không được đụng
      // tới. Chỉ ba thứ đến từ danh mục mới được tính lại.
      let calc;
      try {
        calc = computeLine({
          companyPrice: BigInt(snap.companyPrice),
          wholesalePrice: BigInt(d.wholesale_price),
          cpbh: (d.cpbh ?? []).map((v) => BigInt(v)),
          ...(snap.thresholdRate2 === null ? {} : { threshold: snap.thresholdRate2 }),
        });
      } catch {
        // Giá bán Công ty mới có thể làm dòng cũ thành vô lý (giá thu về âm chẳng
        // hạn). Không ghi đè bằng một con số sai — để nguyên và báo ở lúc gửi.
        hong.push(d.product_code_snap);
        conLai.push(...lechDong);
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
          rate2ToNumeric(calc.discountRate),
          snap.thresholdRate2 === null ? null : rate2ToNumeric(snap.thresholdRate2),
          snap.ruleCode ?? null,
          snap.thresholdSource,
        ],
      );
      daApDung.push(d.product_id);
      if (lechDong.length > 0) daDoi.push(d.product_id);
    }

    /*
     * DỌN DẤU VẾT của những dòng vừa ghi lại (`0194`) — sửa một lỗi CÓ SẴN.
     *
     * `pol.policy_impact` chỉ được dọn bởi consumer, và chỉ cho những `product_id`
     * nó vừa quét lại ở lượt ấy (`0036`). Không có gì dọn nó khi chính DÒNG được
     * làm mới. Hệ quả, đo được bằng chuỗi bốn bước:
     *
     *   1. Hồ sơ ở `CHO_TBP_DUYET`, danh mục đổi giá → consumer ghi dấu vết.
     *   2. TBP trả lại → `YEU_CAU_CHINH_SUA`. Dấu vết nằm nguyên.
     *   3. Dòng được làm mới (tới `0193` là tự động lúc mở, từ `0194` là lúc bấm
     *      *Tự động cập nhật* hoặc lúc gửi duyệt) → hồ sơ hết lệch.
     *   4. TDV gửi lại → hồ sơ đóng băng trở lại, và `byId` đọc `policy_impact`
     *      cho hồ sơ đóng băng → **bày ra một chênh lệch đã được sửa xong**.
     *
     * Nó nằm đó tới lần đổi danh mục kế tiếp chạm đúng sản phẩm ấy. Không mã lỗi
     * nào, không màn hình nào báo — chỉ là một khối cảnh báo nói dối, ở đúng chỗ
     * người ta đọc trước khi đặt bút ký.
     *
     * Xoá theo `product_id` ĐÃ ÁP DỤNG chứ không xoá cả hồ sơ: dòng `hong` (sản
     * phẩm đã vô hiệu hoá) không được ghi lại, nên dấu vết của nó vẫn đúng và
     * vẫn phải ở lại.
     */
    if (daApDung.length > 0) {
      await c.query(
        `DELETE FROM pol.policy_impact
          WHERE policy_id = $1 AND product_id = ANY($2::uuid[])`,
        [policyId, daApDung],
      );
    }
    return { hong, daDoi, daRut, conLai };
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

    /*
     * ĐƯỜNG ĐỌC THÔI GHI ĐÈ (`0194`).
     *
     * Tới `0193` chỗ này gọi `lamMoiDong` — mở hồ sơ ra là giá và ngưỡng bị chụp
     * lại trong im lặng. Khách hàng chốt 10/09: cái đã đổi phải BÀY RA, và việc
     * áp dụng phải là một cú bấm. Giờ nó chỉ SO, và kết quả đi xuống `lech`.
     *
     * `catch` vẫn nuốt: chênh lệch là thông tin THÊM. Danh mục chết thì người
     * dùng vẫn phải mở được hồ sơ của chính họ — cùng lập luận `0089`, và giờ nó
     * còn đúng hơn vì lượt gọi này không còn ghi gì để mà hỏng dở dang.
     */
    /*
     * `0239` — tính năng *Yêu cầu cập nhật* chưa mở: không so, không trả. Tắt ở
     * đây chứ không chỉ giấu ở giao diện, để máy chủ không vừa nói "lệch" vừa
     * không cho ai làm gì với nó — và đỡ một lượt gọi danh mục mỗi lần mở hồ sơ.
     */
    const moLech = batTinhNang('yeuCauCapNhat');
    const lechSuaDuoc = moLech && EDITABLE.includes(so.status)
      ? await this.db
          .tx((c) => this.soSanhDong(c, policyId))
          .catch((): MucLech[] => [])
      : [];
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
     * HAI NGUỒN, theo trạng thái (`0194`):
     *
     *   * **đã đóng băng** → đọc `pol.policy_impact`. Consumer ghi bảng ấy lúc
     *     danh mục đổi, và số trên hồ sơ thì không đổi nữa, nên dấu vết còn đúng
     *     cho tới khi có người sửa được nó.
     *   * **còn sửa được** → TÍNH tại chỗ (`soSanhDong`). Bảng dấu vết không có
     *     dòng nào cho hồ sơ ở đây, và cũng không nên có: chênh lệch của một bản
     *     nháp đổi theo từng lượt TDV sửa dòng, còn consumer chỉ chạy lúc danh
     *     mục đổi.
     *
     * Tới `0193` vế thứ hai là mảng RỖNG, với lý do *"byId vừa làm mới giá ngay
     * phía trên nên không thể lệch"* — đúng khi ấy, và chính phép làm mới im lặng
     * đó là thứ `0194` gỡ đi.
     *
     * Trạng thái KẾT THÚC (`HET_HIEU_LUC`, `DA_XOA`) không rơi vào nhánh nào có
     * dữ liệu: chúng không đóng băng theo nghĩa `DA_DONG_BANG`, cũng không sửa
     * được — nên `soSanhDong` trả rỗng. Lệch hay không cũng không ai làm gì được.
     */
    const lech = !moLech
      ? []
      : DA_DONG_BANG.includes(p.status)
      ? await this.db.q<Record<string, unknown>>(
          `SELECT kind, product_code AS "productCode",
                  snap_value AS "snapValue", new_value AS "newValue"
             FROM pol.policy_impact WHERE policy_id = $1
            ORDER BY product_code, kind`,
          [policyId],
        )
      : lechSuaDuoc.map((l) => ({
          kind: l.kind,
          productCode: l.productCode,
          snapValue: l.snap,
          newValue: l.moi,
        }));

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
    /*
     * LÝ DO GẦN NHẤT, kèm AI và TỪ BƯỚC NÀO (`0189`).
     *
     * Khách hàng chốt 08/09: *"phần lý do CSBH bị trả về yêu cầu cần rõ ràng
     * hơn, như ai đã trả về và trả về từ bước nào"*.
     *
     * DẪN XUẤT, KHÔNG THÊM CỘT — cùng lối `0180` đã chọn cho trạng thái dòng.
     * `pol.policy.last_reason` chỉ giữ CHUỖI, và ba thứ còn thiếu đều đã nằm sẵn
     * trên chính dòng nhật ký đã ghi ra chuỗi ấy: `actor_id` · `actor_role` ·
     * `from_status` · `at`. Thêm ba cột `last_reason_by`/`_role`/`_from` là dựng
     * bản sao thứ hai của dữ liệu đã có, và bản sao ấy phải giữ đồng bộ ở mọi
     * đường ghi có lý do — mà `coalesce($n, last_reason)` bên `workflow` đã cho
     * thấy đường ghi ấy dễ quên đến mức nào.
     *
     * `reason IS NOT NULL` chứ không lấy dòng nhật ký cuối cùng: hồ sơ bị trả về
     * rồi TDV sửa và gửi lại thì dòng cuối là `RESUBMIT_AFTER_EDIT` không có lý
     * do — lấy nó là bày ra một khối lý do rỗng đúng lúc người đọc cần nhớ mình
     * bị trả về vì cái gì. Cùng quy ước với `last_reason`, vốn giữ lý do gần
     * nhất qua mọi bước sau đó.
     *
     * `ORDER BY seq` chứ không `at`: hai dòng ghi trong cùng một transaction có
     * `at` giống hệt nhau (`now()` là thời điểm MỞ transaction), nên thứ tự theo
     * thời gian là tuỳ ý — đúng bẫy đã ghi ở `outboxFor` bên bộ kiểm.
     */
    const lyDoSu = await this.db.one<{
      from_status: string | null;
      action: string;
      actor_id: string | null;
      reason: string;
      at: Date;
    }>(
      // `actor_role` KHÔNG lấy, dù cột có sẵn: từ `0185` mỗi hành động thuộc về
      // đúng MỘT vai trò (`Rule.by`), và nhãn của hành động đã nói ra vai trò ấy
      // — *"Kế toán không tiếp nhận lần 1"*. Trả kèm vai trò là để giao diện in
      // ra *"Kế toán không tiếp nhận lần 1 — Kế toán Nguyễn Văn A"*.
      `SELECT from_status::text AS from_status, action, actor_id, reason, at
         FROM pol.policy_event
        WHERE policy_id = $1 AND reason IS NOT NULL
        ORDER BY seq DESC LIMIT 1`,
      [policyId],
    );

    /*
     * PHIÊN BẢN SAU ĐANG DỞ DANG (`0191`).
     *
     * `0191` thêm nút *Lập phiên bản mới* ngay trên trang một CSBH đang hiệu
     * lực, để TDV khỏi phải vòng qua trang khách hàng. Lối tắt ấy làm một cạnh
     * sắc CÓ SẴN dễ vấp hơn hẳn: `create` KHÔNG chặn việc lập bản thứ hai khi
     * một bản mới đã đang soạn hoặc đang duyệt. Đi từ trang khách hàng thì bản
     * dở nằm ngay trong danh sách hồ sơ của khách; đi từ đây thì không thấy gì.
     *
     * KHÔNG chặn — đó sẽ là một luật nghiệp vụ mới, và khách hàng chưa chốt.
     * Chỉ NÓI RA, để hộp xác nhận hỏi đúng câu người dùng cần trả lời.
     *
     * `0220` — KHÁCH HÀNG ĐÃ CHỐT luật ấy (25/09), nên câu trên hết đúng: giờ
     * `create` CHẶN, và trường này thôi là một cảnh báo — nó là thứ cho hộp
     * thoại BIẾT TRƯỚC rằng nút sẽ bị từ chối (lối `0200` làm cho bản Nháp, giờ
     * áp cho cả sáu trạng thái). Giữ nguyên văn lập luận cũ ở trên vì lý do nó
     * đứng lên là thật cho tới hôm ấy.
     *
     * Hỏi theo KHÁCH HÀNG, không còn theo `supersedes_id`, và dùng CHÍNH câu SQL
     * của chốt chặn (`SQL_HO_SO_DANG_DO`). `0200` đã ghi rằng hai câu hỏi *"trùng
     * nhau ở mọi dữ liệu hôm nay, nhưng trùng nhau không phải là một"*; khi thứ
     * này là lời báo trước cho một lượt chặn thì nó phải hỏi đúng câu lượt chặn
     * hỏi, nếu không hộp thoại mời bấm một nút mà máy chủ sẽ từ chối.
     *
     * Chỉ hỏi khi hồ sơ ĐANG HIỆU LỰC: đó là trạng thái duy nhất bày nút ấy, và
     * một câu `SELECT` cho mọi lượt mở mọi hồ sơ là cái giá không mua gì.
     */
    const phienBanSau =
      p.status === 'DANG_CO_HIEU_LUC'
        ? await this.db.one<{ id: string; code: string; status: string }>(
            SQL_HO_SO_DANG_DO,
            [p.customerId, CHUA_DUYET_XONG],
          )
        : null;
    /*
     * `?? null` — `db.one` trả `undefined` khi không có dòng nào, và
     * `JSON.stringify` XOÁ HẲN khoá mang `undefined`. Trường sẽ vắng mặt thay vì
     * bằng rỗng, nên giao diện không phân biệt được *"chưa có bản dở nào"* với
     * *"máy chủ cũ hơn, không biết trường này"* — hai thứ trông giống hệt nhau ở
     * phía đọc, và chỉ một trong hai đáng để giấu cảnh báo đi.
     */
    const phienBanSauHoacRong = phienBanSau ?? null;

    const [tenDuyet, khach] = await Promise.all([
      this.clients.userNames(
        // `createdBy` vào cùng lượt hỏi: người đề nghị là một cái tên nữa trên
        // cùng màn hình, và hỏi riêng là thêm một vòng mạng cho một chuỗi.
        // `0189` — người trả lại cũng vào cùng lượt, cùng lý do.
        [
          p.createdBy,
          so.tbp_signed_by,
          so.ke_toan_user_id,
          so.sale_admin_user_id,
          lyDoSu?.actor_id ?? null,
        ].filter((x): x is string => !!x),
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
       * `0189` — khối lý do, đủ bốn vế: NÓI GÌ · AI · TỪ BƯỚC NÀO · LÚC NÀO.
       *
       * Trả về MÃ chứ không câu tiếng Việt cho `hanhDong` và `tuTrangThai`: hai
       * bảng nhãn ấy đã nằm ở `apps/web/src/lib/format.ts` và cả
       * ứng dụng đọc chúng. Dựng câu ở đây là bản dịch thứ hai, và nó sẽ lệch
       * đúng vào ngày một trạng thái được đổi tên (`0158` đổi *KT duyệt bản mềm*
       * → *Chờ KT duyệt L1*, và chỉ phải sửa MỘT bảng vì luật này).
       *
       * `ten` là `null` khi `identity` không tra được — `userNames` nuốt lỗi có
       * chủ ý, nên mất tên chứ không mất cả màn hình. Giao diện vẫn còn ba vế
       * kia để nói ra một câu có nghĩa.
       */
      /*
       * `0191` — bản kế nhiệm đang dở, để hộp xác nhận nói ra. `null` là không
       * có, và cũng là giá trị cho mọi hồ sơ không ở trạng thái đang hiệu lực.
       */
      phienBanSau: phienBanSauHoacRong,
      // `0221` — chỉ khi lý do còn là việc phải làm (`lyDoConCanBay`).
      lyDoTraLai: lyDoSu && lyDoConCanBay(p.status)
        ? {
            lyDo: lyDoSu.reason,
            hanhDong: lyDoSu.action,
            tuTrangThai: lyDoSu.from_status,
            ten: (lyDoSu.actor_id && tenDuyet[lyDoSu.actor_id]) ?? null,
            luc: lyDoSu.at,
          }
        : null,
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
          khChucDanhDaiDienSnap: string | null;
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
          /*
           * `0228` — chức danh người đại diện lên màn hình (khách hàng 29/09).
           * `0177` để nó lại bên `document` vì *"màn hình này không bày"*; giờ bày.
           * Cùng luật ba nhánh với người đại diện ngay trên: đã đóng băng thì đọc
           * ảnh chụp (cột có từ `0101`), chưa thì đọc sống — không trộn hai thời
           * điểm trong một khối.
           */
          chucDanh:
            anh.khChucDanhDaiDienSnap ?? (daDongBang ? null : (khach?.ownerTitle ?? null)),
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
   * tức khi hồ sơ đang ở bàn Sale Admin (`BAN_SALE_ADMIN`) — máy trạng thái đã trả lời câu ấy rồi,
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
    // `0225` — chỉ khi đang SỬA bản cứng: bản scan "cũ" là bản Kế toán vừa chê,
    // và câu ấy chỉ có nghĩa trong đúng trạng thái sinh ra từ lượt chê ấy. Tới
    // `0224` điều kiện là `SA_DANG_XU_LY`, nên sau một vòng *Hoàn duyệt → gửi
    // lại → tiếp nhận L1* bản scan từ vòng trước vẫn bị gọi là "cũ" ở lượt làm
    // bản cứng lần đầu mới.
    if (status !== 'SA_SUA_BAN_CUNG') return false;
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
   *
   * ---------------------------------------------------------------------------
   * `0200` — KỂ CẢ HỒ SƠ CÒN SỬA ĐƯỢC (*Nháp*, *Yêu cầu chỉnh sửa*).
   * ---------------------------------------------------------------------------
   *
   * Tới `0199` box chỉ liệt kê hồ sơ đã đóng băng, nên TDV **không có đường nào
   * để BIẾT** bản nháp của mình đã lệch — họ phải mở từng hồ sơ ra xem. Đúng lúc
   * `0194` vừa cho họ một cái nút để sửa chuyện ấy.
   *
   * Bảng dấu vết giờ có dòng cho cả hai loại (consumer ghi), nên chỗ này chỉ
   * phải nới danh sách trạng thái. **Hai vai trò của bảng, đừng lẫn**: ở đây nó
   * là một CHỈ MỤC — *"những hồ sơ đáng mở ra xem"*; còn màn hình hồ sơ vẫn TÍNH
   * TẠI CHỖ (`soSanhDong`, `0194`) và đó mới là câu trả lời có thẩm quyền.
   * Chỉ mục đi sau một nhịp là chấp nhận được; một con số sai trên tờ giấy sắp
   * ký thì không.
   */
  async impacted(me: AuthUser, page: Page) {
    // `0239` — chưa mở: trang RỖNG chứ không 404, để một giao diện cũ còn mở
    // trong tab vẫn tự giấu box như ngày không có gì lệch. Dấu vết vẫn được
    // consumer ghi tiếp, xem `tinh-nang.ts`.
    if (!batTinhNang('yeuCauCapNhat')) return paged([], page);
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
      [ids, [...DA_DONG_BANG, ...EDITABLE], page.limit, page.offset],
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
    // `0203` — CÙNG ngày tra với `addLine`/`updateLine`, và đó là điều kiện chứ
    // không phải sự trùng hợp: hộp thoại này bày ra con số rồi lượt lưu ngay sau
    // đó ghi con số. Hai ngày khác nhau là bày một đằng ghi một nẻo (`0193`).
    const snap = await this.clients.productSnapshot(
      productId,
      customer.customerType,
      ngayTraDanhMuc(ngayApDung ?? ngayVN(), ngayVN()),
    );
    return {
      productId: snap.productId,
      productCode: snap.productCode,
      productName: snap.productName,
      companyPrice: snap.companyPrice,
      threshold:
        snap.thresholdRate2 === null ? null : rate2ToNumeric(snap.thresholdRate2),
      /**
       * NGƯỠNG DẠNG THÔ, đi thẳng vào `computeLine` ở giao diện (`0193`).
       *
       * Trùng nội dung với `threshold` ngay trên, và chủ ý: `threshold` là chuỗi
       * để BÀY RA, `thresholdRate2` là số nguyên để TÍNH. Gửi mỗi chuỗi thì
       * trình duyệt phải đổi ngược `Number('12.35') * 100` — một phép suy lại,
       * đúng loại việc mà `Rate2` sinh ra để khỏi phải làm. Hộp thoại phải đưa
       * cho `computeLine` **đúng cái mà máy chủ sẽ đưa cho nó**, không phải một
       * giá trị dựng lại từ dạng hiển thị.
       */
      thresholdRate2: snap.thresholdRate2,
      thresholdSource: snap.thresholdSource,
      /**
       * MÃ quy định đã thắng (`0193`).
       *
       * Cột *QĐCK* của bảng bày NGƯỠNG phần trăm và giấu mã vào dấu `?` (`0180`);
       * khối xem trước trong hộp thoại làm y hệt, nên nó cần cả hai. Trường này
       * đã có sẵn trong ảnh chụp và đi thẳng vào `rule_code_snap` lúc ghi dòng —
       * không thêm lượt tra nào.
       */
      ruleCode: snap.ruleCode,
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
      SALE_ADMIN: [...BAN_SALE_ADMIN],
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
              ${SQL_TY_LE_CK_TRUOC} AS "discountRateTruoc",
              -- 0213 — dòng này TRƯỚC KHI bị sửa trông thế nào, kèm danh sách ô
              -- đã đổi để màn hình bôi vàng. Thay cho mảng "đổi những gì" của
              -- 0204: câu hỏi đổi từ *"đổi gì"* sang *"trước đó thế nào"*, và
              -- câu sau cần cả những ô KHÔNG đổi để đọc được.
              --
              -- CHỈ đường đọc của màn hình; internal.controller (bản mềm, hợp
              -- đồng, read-model) KHÔNG lấy trường này — khách hàng chốt bản in
              -- không đổi gì (0204, còn nguyên).
              ${SQL_BAN_TRUOC_TRA_VE} AS "banTruoc"
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
       *
       * `0228` đổi ranh giới ấy cho CHỨC DANH (khách hàng 29/09: *"thiếu hiển
       * thị chức danh người đại diện"*); mã số thuế vẫn ở lại.
       */
      khMaSnap: (p as unknown as { kh_ma_snap: string | null }).kh_ma_snap,
      khTenSnap: (p as unknown as { kh_ten_snap: string | null }).kh_ten_snap,
      khNguoiDaiDienSnap: (p as unknown as { kh_nguoi_dai_dien_snap: string | null })
        .kh_nguoi_dai_dien_snap,
      // `0228` — màn hình bày chức danh người đại diện.
      khChucDanhDaiDienSnap: (p as unknown as { kh_chuc_danh_dai_dien_snap: string | null })
        .kh_chuc_danh_dai_dien_snap,
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
    if (!coTrongPhamVi(p, ids, me.role)) {
      throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
    }
  }

  /**
   * Trong `policyIds`, những hồ sơ nào `user` CÒN mở được (`0262`).
   *
   * Cho thông báo bình luận kiểm quyền LÚC ĐỌC (yêu cầu 6.3): người đã mất phạm
   * vi thì dòng thông báo chỉ còn tiêu đề. Cùng hàm `coTrongPhamVi` với
   * `assertPolicyInScope` — một luật, hai cách hỏi.
   */
  async trongPhamVi(user: AuthUser, policyIds: string[]): Promise<string[]> {
    if (policyIds.length === 0) return [];
    const ids = await this.scope.userIdsFor(user);
    const rows = await this.db.q<{
      id: string;
      tdv_user_id: string | null;
      tbp_user_id: string | null;
      ke_toan_user_id: string | null;
      sale_admin_user_id: string | null;
      da_qua_tbp: boolean;
    }>(
      `SELECT id, tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id, da_qua_tbp
         FROM pol.policy WHERE id = ANY($1::uuid[])`,
      [policyIds],
    );
    return rows.filter((p) => coTrongPhamVi(p, ids, user.role)).map((p) => p.id);
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

/**
 * MỘT luật phạm vi hồ sơ, dùng chung cho `assertPolicyInScope` (mở một hồ sơ) và
 * `trongPhamVi` (lọc một lô — thông báo bình luận, `0262`).
 *
 * Vế bốn cột người: người gọi (qua tập phạm vi `ids`) đứng tên ở ít nhất một ô.
 *
 * Vế Kế toán — cùng luật với `thuocPhamVi(..., 'KE_TOAN')`, ở đường MỞ MỘT HỒ SƠ
 * (`0142`). Thiếu chốt này thì danh sách giấu hồ sơ đi nhưng gõ thẳng địa chỉ vẫn
 * mở được — đúng lỗ hổng mà `0133` vừa bịt ở tầng định tuyến, chỉ khác chỗ.
 *
 * `da_qua_tbp` khai BẮT BUỘC (`0143`): khai tuỳ chọn thì hai đường `attach`/`detach`
 * — vốn liệt kê từng cột trong `SELECT` — im lặng bỏ qua chốt, và không ca kiểm
 * nào đỏ. Kiểu bắt buộc thì trình biên dịch chỉ chỗ.
 *
 * `0157` GỠ VẾ TRẠNG THÁI. Điều kiện cũ chỉ chặn ở `CHO_TBP_DUYET`, nên hồ sơ bị
 * Trưởng bộ phận trả về (`YEU_CAU_CHINH_SUA`) lọt qua.
 *
 * `0262` tách khối này ra khỏi `assertPolicyInScope`: hai đường hỏi phạm vi mà mỗi
 * đường tự viết luật là hai luật sẽ lệch — đúng thứ mà thông báo bình luận cần
 * tránh khi nó quyết định ai còn được đọc trích đoạn.
 */
export function coTrongPhamVi(
  p: {
    tdv_user_id: string | null;
    tbp_user_id: string | null;
    ke_toan_user_id: string | null;
    sale_admin_user_id: string | null;
    da_qua_tbp: boolean;
  },
  ids: string[],
  role: string,
): boolean {
  const nguoi = [p.tdv_user_id, p.tbp_user_id, p.ke_toan_user_id, p.sale_admin_user_id];
  if (!nguoi.some((x) => x !== null && ids.includes(x))) return false;
  if (role === 'KE_TOAN' && !p.da_qua_tbp) return false;
  return true;
}
