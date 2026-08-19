/**
 * Trang tổng quan gồm những gì, cho vai trò nào.
 *
 * HAI BẢNG TRA, và chúng là nguồn duy nhất. Rải `if (vaiTro === …)` trong JSX là
 * cách chắc chắn để có ngày một vai trò sót một thẻ — mà thẻ sót thì không báo
 * lỗi, nó chỉ vắng mặt. `tong-quan.test.ts` quét đúng hai bảng này.
 *
 * Không đặt trong `can.ts`: đó là bảng PHÂN QUYỀN và `FE-23` quét chính nó. Trộn
 * chuyện bố cục vào là mời người sau sửa quyền lúc đang định sửa giao diện.
 */
import type { VaiTro } from './can.js';
import { nhanTrangThai, nhomTrangThai } from './format.js';

/**
 * 11 trạng thái SỐNG của muc 4, `0035` và `0064`.
 *
 * KHÔNG còn `TBP_DA_KY_SO` (`0064`) — nó đã bị gỡ khỏi máy trạng thái. Đây là
 * tập trạng thái một hồ sơ CÓ THỂ ĐANG Ở, nên nó hẹp hơn `NHAN_TRANG_THAI` bên
 * `format.ts`: bảng nhãn kia còn phải đọc được những dòng lịch sử cũ.
 */
export type TrangThai =
  | 'NHAP'
  | 'CHO_TBP_DUYET'
  | 'CHO_KT_L1'
  | 'SA_DANG_XU_LY'
  | 'CHO_KT_L2'
  | 'DANG_CO_HIEU_LUC'
  | 'HET_HIEU_LUC'
  | 'YEU_CAU_CHINH_SUA'
  | 'TU_CHOI'
  | 'QUA_HAN_DUYET'
  | 'DA_XOA';

export const MOI_TRANG_THAI: TrangThai[] = [
  'NHAP',
  'CHO_TBP_DUYET',
  'CHO_KT_L1',
  'SA_DANG_XU_LY',
  'CHO_KT_L2',
  'DANG_CO_HIEU_LUC',
  'HET_HIEU_LUC',
  'YEU_CAU_CHINH_SUA',
  'TU_CHOI',
  'QUA_HAN_DUYET',
  'DA_XOA',
];

/**
 * Trạng thái này là VIỆC CỦA AI — hồ sơ đang nằm trên bàn của vai trò nào.
 *
 * `null` nghĩa là trạng thái kết thúc hoặc trạng thái cắt ngang, không thuộc bàn
 * của riêng ai: hồ sơ đã có hiệu lực, đã hết hiệu lực, đã bị từ chối, đã bị
 * người lập xoá, hoặc đang quá hạn ở một bước bất kỳ. Năm cái đó ai xem cũng có
 * nghĩa.
 *
 * Bảng này KHÔNG dùng để dựng màn hình. Nó tồn tại để test đối chiếu được rằng
 * dải thẻ của một vai trò không chứa bước của vai trò khác — nếu suy ngược từ
 * chính bảng thẻ thì test chỉ đang lặp lại dữ liệu nó cần kiểm.
 */
export const BAN_CUA: Record<TrangThai, VaiTro | null> = {
  NHAP: 'TDV',
  YEU_CAU_CHINH_SUA: 'TDV',
  CHO_TBP_DUYET: 'TBP',
  CHO_KT_L1: 'KE_TOAN',
  CHO_KT_L2: 'KE_TOAN',
  SA_DANG_XU_LY: 'SALE_ADMIN',
  DANG_CO_HIEU_LUC: null,
  HET_HIEU_LUC: null,
  TU_CHOI: null,
  QUA_HAN_DUYET: null,
  DA_XOA: null,
};

/**
 * Ô ĐẾM theo bước đang chờ — khoá của `byStepDetail` bên reporting (`0045`).
 *
 * Bốn bước chờ của muc 3, riêng B8 tách làm hai vì Sale Admin có HAI việc khác
 * hẳn nhau dưới cùng một trạng thái `SA_DANG_XU_LY`:
 *
 *   - `B8_TRINH_KY` — kế toán vừa nhận bản mềm; in, trình BLĐ ký, scan.
 *   - `B8_LOI_BAN_CUNG` — kế toán nhận bản cứng rồi bắt in lại (B10C). Bản scan
 *     cũ đã bị xoá khỏi hệ thống, phải làm lại một việc tưởng đã xong.
 *
 * `TBP_DA_KY_SO` không có ô nào ở đây, và từ `0064` nó không còn tồn tại: hệ
 * thống vốn đã chuyển nó sang `CHO_KT_L1` ngay trong CÙNG transaction với lần
 * TBP ký, nên không hồ sơ nào từng nằm lại ở đó để mà đếm.
 */
export type OBuoc = 'B4_TBP_DUYET' | 'B6_KT_L1' | 'B8_TRINH_KY' | 'B8_LOI_BAN_CUNG' | 'B10_KT_L2';

export const MOI_O_BUOC: OBuoc[] = [
  'B4_TBP_DUYET',
  'B6_KT_L1',
  'B8_TRINH_KY',
  'B8_LOI_BAN_CUNG',
  'B10_KT_L2',
];

/** Ô đếm → bước thật trong CSDL. Hai nửa của B8 cùng trỏ về một bước. */
export const BUOC_THAT: Record<OBuoc, string> = {
  B4_TBP_DUYET: 'B4_TBP_DUYET',
  B6_KT_L1: 'B6_KT_L1',
  B8_TRINH_KY: 'B8_SA_XU_LY',
  B8_LOI_BAN_CUNG: 'B8_SA_XU_LY',
  B10_KT_L2: 'B10_KT_L2',
};

/** Ô đếm này là việc của vai trò nào — dùng để suy ra thẻ "Đang chờ". */
export const BUOC_CUA: Record<OBuoc, VaiTro> = {
  B4_TBP_DUYET: 'TBP',
  B6_KT_L1: 'KE_TOAN',
  B8_TRINH_KY: 'SALE_ADMIN',
  B8_LOI_BAN_CUNG: 'SALE_ADMIN',
  B10_KT_L2: 'KE_TOAN',
};

/**
 * Một thẻ trên trang tổng quan.
 *
 * `dem` khai CẢ phép đếm LẪN đường dẫn khi bấm vào — một chỗ, không hai. Tách
 * chúng ra là mở đường cho thẻ ghi 12 mà bấm vào ra danh sách 9 dòng: người
 * dùng đếm được, và không có phép kiểm nào tự bắt lỗi ấy.
 */
export type The = {
  /** Khoá React, và cũng là tên thẻ trong test. */
  ma: string;
  /**
   * Nhãn hiện trên thẻ. Thẻ đếm theo TRẠNG THÁI bỏ trống ô này — tên của nó lấy
   * từ `NHAN_TRANG_THAI` lúc dựng, để một trạng thái mang đúng một tên trên mọi
   * màn hình. Chép tên sang đây là tạo ra nguồn thứ hai để hai bên lệch nhau.
   */
  nhan?: string;
  /** Dòng chữ nhỏ dưới con số. Bỏ trống thì thẻ chỉ có nhãn và số. */
  phu?: string;
  /** Ghi đè đường dẫn mặc định suy từ `dem`. Xem `theQuaHan`. */
  den?: string;
  dem:
    | { tu: 'trangThai'; trangThai: TrangThai }
    | { tu: 'buoc'; o: OBuoc[] }
    /**
     * Sắp quá hạn: mọi hồ sơ trong phạm vi còn dưới 24 giờ là tới hạn (`0047`).
     *
     * KHÔNG giới hạn ở bước của chính vai trò — đó là cả điểm của nó. Hồ sơ sắp
     * chết ở bàn Kế toán vẫn phải hiện với TDV đã lập nó và với TBP đã ký nó:
     * họ không bấm được nút nào, nhưng họ gọi điện được cho người đang giữ.
     */
    | { tu: 'sapQuaHan' };
};

const theTrangThai = (t: TrangThai, phu?: string): The => ({
  ma: t,
  ...(phu === undefined ? {} : { phu }),
  dem: { tu: 'trangThai', trangThai: t },
});

const theBuoc = (ma: string, nhan: string, o: OBuoc[], phu?: string): The => ({
  ma,
  nhan,
  ...(phu === undefined ? {} : { phu }),
  dem: { tu: 'buoc', o },
});

/**
 * Thẻ *Sắp quá hạn* — có ở MỌI vai trò nhìn thấy hồ sơ (`0047`).
 *
 * Từ `0047` quá hạn là chết: không ai thao tác được, và 3 ngày sau hệ thống tự
 * xoá. Nên 24 giờ cuối là cơ hội cuối, và nó phải hiện với tất cả những người
 * liên quan chứ không riêng người đang giữ hồ sơ — người đang giữ chính là người
 * đã không xử lý suốt 13 ngày qua.
 */
const theSapQuaHan = (): The => ({
  ma: 'SAP_QUA_HAN',
  nhan: 'Sắp quá hạn',
  phu: 'còn dưới 24 giờ',
  dem: { tu: 'sapQuaHan' },
});

/**
 * Thẻ *Quá hạn* — hồ sơ đã chết, còn 3 ngày trước khi hệ thống xoá (`0048`).
 *
 * Ở `0047` tôi CỐ Ý không làm thẻ này: khách hàng đã hai lần nói quá hạn là chết,
 * và đếm một thứ không bấm được vào ô đếm việc là nói dối về lượng việc. Khách
 * hàng yêu cầu lại — và lý do của họ đúng hơn lý do của tôi: ba ngày ấy là cửa
 * sổ duy nhất để người ta biết mình vừa mất cái gì và lập lại bản mới trước khi
 * nó biến mất hẳn khỏi mọi màn hình.
 *
 * Nên nó đứng RIÊNG, không gộp vào thẻ của bước như `0045` từng làm. Thẻ của
 * bước đếm việc phải làm; thẻ này đếm việc phải làm LẠI.
 */
const theQuaHan = (): The => ({
  ma: 'QUA_HAN_DUYET',
  nhan: 'Quá hạn',
  phu: 'đã chết, hệ thống xoá sau 3 ngày',
  dem: { tu: 'trangThai', trangThai: 'QUA_HAN_DUYET' },
  /*
   * Bấm vào lọc theo *Hạn xử lý*, không theo trạng thái (`0060`).
   *
   * Hai đường cho ra cùng một tập, nhưng đường này để lại đúng cái ô chọn mà
   * người dùng thấy trong biểu mẫu — bấm thẻ rồi mở Bộ lọc ra là hiểu ngay mình
   * đang lọc theo gì, và đổi sang *Sắp quá hạn* bằng một cú chọn.
   */
  den: '/ho-so?han=QUA_HAN',
});

/**
 * Thẻ "Đang chờ" của một vai trò: mọi bước chờ TRỪ bước của chính họ.
 *
 * Trả lời đúng một câu — "hồ sơ trong phạm vi của tôi vẫn đang chạy chứ, có cái
 * nào cần tôi không?" — bằng một con số thay vì bốn ô của bốn người khác. Suy ra
 * từ `BUOC_CUA` chứ không khai tay bốn danh sách: khai tay thì thêm một bước vào
 * luồng là bốn chỗ phải nhớ sửa, và quên một chỗ thì một vai trò đếm thiếu mà
 * không ai biết.
 */
const theDangCho = (vaiTro: VaiTro): The =>
  theBuoc(
    'DANG_CHO',
    'Đang chờ',
    MOI_O_BUOC.filter((o) => BUOC_CUA[o] !== vaiTro),
    'đang ở bước của người khác',
  );

/**
 * Dải thẻ đếm hồ sơ, cho từng vai trò `0045`.
 *
 * Quy tắc: **việc của chính vai trò đó, gộp một thẻ cho phần còn lại đang chạy,
 * rồi tới các trạng thái kết thúc**. Một TDV nhìn ô "KT duyệt bản cứng: 7" thì
 * không làm được gì với con số ấy, mà nó vẫn chiếm chỗ và vẫn bắt phải đọc.
 *
 * HAI THẺ CẢNH BÁO đứng cạnh nhau ở giữa dải, và chúng nói hai chuyện khác hẳn:
 *
 *   - *Sắp quá hạn* — còn dưới 24 giờ, CÒN CỨU ĐƯỢC. Đây là lúc gọi điện.
 *   - *Quá hạn* — đã chết, không ai thao tác được, hệ thống xoá sau 3 ngày. Việc
 *     duy nhất còn làm được là lập một hồ sơ mới.
 *
 * Cả hai đếm hồ sơ ở MỌI bước trong phạm vi, không riêng bước của vai trò đang
 * xem — hồ sơ chết ở bàn Kế toán thì TDV đã lập nó cũng mất công như nhau.
 *
 * Hồ sơ quá hạn KHÔNG được gộp vào thẻ của bước như `0045` từng làm: thẻ của
 * bước đếm việc phải làm, còn thẻ này đếm việc phải làm LẠI. Trộn chúng là bảo
 * người ta còn 12 việc trong khi 3 trong số đó không bấm được gì.
 *
 * Ngoại lệ duy nhất là `BAN_LANH_DAO`: vai trò giám sát toàn luồng nên bày đủ
 * mười hai trạng thái, không gộp, không cắt.
 *
 * `QUAN_TRI` KHÔNG có thẻ nào, và đây là chỗ dễ làm sai nhất của cả màn hình:
 * `idn.scope_user_ids` trả về RỖNG cho họ (0003_identity.sql), nên mọi lời gọi
 * `/reports/*` đều ra 0. Bày một ô "Tổng hồ sơ: 0" là một con số đúng nhưng đọc
 * ra nghĩa hoàn toàn sai — người xem sẽ tưởng hệ thống trống.
 */
export const THE_THEO_VAI_TRO: Record<VaiTro, The[]> = {
  TDV: [
    theTrangThai('YEU_CAU_CHINH_SUA', 'bị trả lại, chờ bạn sửa'),
    theSapQuaHan(),
    theQuaHan(),
    theDangCho('TDV'),
    theTrangThai('DANG_CO_HIEU_LUC'),
    theTrangThai('TU_CHOI'),
  ],
  TBP: [
    theBuoc('B4_TBP_DUYET', 'Chờ TBP duyệt', ['B4_TBP_DUYET'], 'đang chờ bạn ký số'),
    theSapQuaHan(),
    theQuaHan(),
    theDangCho('TBP'),
    theTrangThai('DANG_CO_HIEU_LUC'),
    theTrangThai('TU_CHOI'),
  ],
  KE_TOAN: [
    theBuoc('B6_KT_L1', 'KT duyệt bản mềm', ['B6_KT_L1'], 'tiếp nhận lần 1'),
    theBuoc('B10_KT_L2', 'KT duyệt bản cứng', ['B10_KT_L2'], 'tiếp nhận lần 2'),
    theSapQuaHan(),
    theQuaHan(),
    theDangCho('KE_TOAN'),
    theTrangThai('DANG_CO_HIEU_LUC'),
  ],
  SALE_ADMIN: [
    theBuoc('B8_TRINH_KY', 'Trình ký', ['B8_TRINH_KY'], 'in, trình ký, scan'),
    theBuoc('B8_LOI_BAN_CUNG', 'Lỗi bản cứng', ['B8_LOI_BAN_CUNG'], 'kế toán bắt in lại'),
    theSapQuaHan(),
    theQuaHan(),
    theDangCho('SALE_ADMIN'),
    theTrangThai('DANG_CO_HIEU_LUC'),
  ],
  BAN_LANH_DAO: [theSapQuaHan(), ...MOI_TRANG_THAI.map((t) => theTrangThai(t))],
  QUAN_TRI: [],
};

/** Nhãn hiện trên thẻ — thẻ trạng thái mượn tên chung ở `format.ts`. */
export const nhanThe = (the: The): string =>
  the.nhan ?? (the.dem.tu === 'trangThai' ? nhanTrangThai(the.dem.trangThai) : the.ma);

/**
 * Ô đếm theo BƯỚC lấy màu của đúng trạng thái nó đại diện (`0064`).
 *
 * Thẻ *Chờ TBP duyệt* và nhãn *Chờ TBP duyệt* trong bảng hồ sơ phải là một màu —
 * người dùng bấm thẻ rồi rơi vào một danh sách toàn nhãn màu khác thì phải học
 * lại bảng màu lần thứ hai.
 *
 * `B8_LOI_BAN_CUNG` là ngoại lệ duy nhất, và nó KHÔNG có trạng thái riêng để
 * mượn màu: cả nó lẫn `B8_TRINH_KY` đều là `SA_DANG_XU_LY`. Nó mượn màu của
 * *Yêu cầu chỉnh sửa* vì hai thứ nói cùng một chuyện — có người trả việc về cho
 * bạn — và chúng không bao giờ đứng chung một dải thẻ.
 */
const MAU_O_BUOC: Record<OBuoc, string> = {
  B4_TBP_DUYET: 'tbp',
  B6_KT_L1: 'kt1',
  B8_TRINH_KY: 'sa',
  B8_LOI_BAN_CUNG: 'sua',
  B10_KT_L2: 'kt2',
};

/**
 * Màu của thẻ.
 *
 * Thẻ *Đang chờ* không tô: theo định nghĩa nó là phần KHÔNG cần ai làm gì, và
 * một dải thẻ mà ô nào cũng có màu là một dải không có chỗ cho mắt nghỉ.
 */
export function mauThe(the: The): string {
  if (the.dem.tu === 'trangThai') return nhomTrangThai(the.dem.trangThai);
  // Cam riêng, không mượn đỏ của *Quá hạn*: hai ô này đứng cạnh nhau trên MỌI
  // dải thẻ, và chúng là hai chuyện khác hẳn nhau — một cái còn kịp cứu.
  if (the.dem.tu === 'sapQuaHan') return 'gap';
  if (the.ma === 'DANG_CHO') return 'thuong';
  // Thẻ gộp nhiều ô bước (chưa có ai dùng) thì lấy màu của ô đầu.
  return MAU_O_BUOC[the.dem.o[0]!] ?? 'thuong';
}

/**
 * Bấm vào thẻ thì mở danh sách nào.
 *
 * Thẻ đếm theo BƯỚC phải lọc theo bước, không theo trạng thái: hồ sơ quá hạn
 * mang `status = 'QUA_HAN_DUYET'` nên `?status=CHO_TBP_DUYET` cho ra danh sách
 * ngắn hơn chính con số vừa bấm vào. Tiêu chí `pendingStep` bên reporting đọc
 * `coalesce(pending_step, …)`, khớp đúng phép đếm.
 */
export function duongThe(the: The): string {
  if (the.den !== undefined) return the.den;
  if (the.dem.tu === 'trangThai') return `/ho-so?status=${the.dem.trangThai}`;
  if (the.dem.tu === 'sapQuaHan') return '/ho-so?han=SAP_QUA_HAN';

  const buoc = [...new Set(the.dem.o.map((o) => BUOC_THAT[o]))];
  const q = `pendingStep=${buoc.join(',')}`;

  // Hai nửa của B8 chỉ tách được bằng mốc `reprint_requested_at`. Thẻ nào lấy
  // trọn cả hai nửa thì KHÔNG kèm tiêu chí này — kèm vào là lọc mất một nửa.
  const nuaB8 = the.dem.o.filter((o) => BUOC_THAT[o] === 'B8_SA_XU_LY');
  if (nuaB8.length === 1) {
    return `/ho-so?${q}&reprint=${nuaB8[0] === 'B8_LOI_BAN_CUNG' ? '1' : '0'}`;
  }
  return `/ho-so?${q}`;
}

/** Các khối ngoài dải thẻ. Thứ tự trong mảng là thứ tự hiện trên màn hình. */
export type TenKhoi =
  | 'vi-sao-khong-co-viec'
  | 'canh-bao-mau-hop-dong'
  | 'canh-bao-thu-hong'
  | 'yeu-cau-cap-nhat'
  | 'hop-viec'
  | 'hop-viec-ke-toan'
  | 'suc-khoe-luong'
  | 'theo-buoc'
  | 'theo-tdv'
  | 'o-he-thong'
  | 'hoat-dong-hom-nay'
  | 'nhat-ky-gon';

/**
 * Cảnh báo đứng TRƯỚC hộp việc ở hai vai trò có nó.
 *
 * Mẫu hợp đồng chết và thư hỏng đều là thứ làm hỏng việc của NGƯỜI KHÁC, và chỉ
 * người này chữa được. Đặt nó dưới một danh sách dài là gần như chắc chắn không
 * ai cuộn tới.
 */
/*
 * `hop-viec` đứng TRƯỚC `yeu-cau-cap-nhat` ở cả bốn vai trò trong luồng (`0052`).
 *
 * ĐẢO NGƯỢC `0029`. Hồi ấy *Yêu cầu cập nhật* phải đứng trước vì nó là chỗ DUY
 * NHẤT nói cho người sắp ký biết con số trên hồ sơ đã lỗi thời — đặt dưới một
 * danh sách việc dài thì không ai cuộn tới, mà cuộn tới thì cũng đã ký xong rồi.
 *
 * `0050` gỡ bỏ đúng cái ràng buộc ấy: cảnh báo lệch giờ hiện NGAY TRÊN màn hình
 * hồ sơ, phía trên bảng số. Không còn đường nào mở hồ sơ ra mà không thấy nó,
 * nên khối trên trang tổng quan không phải chặn cửa nữa — và việc phải làm hôm
 * nay mới là thứ người ta mở phần mềm ra để xem.
 *
 * Ban lãnh đạo và Quản trị KHÔNG có: cả hai nằm ngoài luồng duyệt, phạm vi dữ
 * liệu của họ không chứa hồ sơ nào (Quản trị) hoặc chỉ để xem (Ban lãnh đạo) —
 * bày một danh sách việc-phải-làm cho người không làm được việc ấy là nhiễu.
 */
export const KHOI_THEO_VAI_TRO: Record<VaiTro, TenKhoi[]> = {
  TDV: ['hop-viec', 'yeu-cau-cap-nhat'],
  TBP: ['hop-viec', 'yeu-cau-cap-nhat', 'suc-khoe-luong'],
  KE_TOAN: ['hop-viec-ke-toan', 'yeu-cau-cap-nhat', 'suc-khoe-luong'],
  SALE_ADMIN: ['canh-bao-mau-hop-dong', 'hop-viec', 'yeu-cau-cap-nhat', 'theo-tdv'],
  BAN_LANH_DAO: [
    'vi-sao-khong-co-viec',
    'suc-khoe-luong',
    'theo-buoc',
    'theo-tdv',
    'nhat-ky-gon',
  ],
  QUAN_TRI: [
    'vi-sao-khong-co-viec',
    'canh-bao-thu-hong',
    'o-he-thong',
    'hoat-dong-hom-nay',
    'nhat-ky-gon',
  ],
};

/**
 * Mỗi trang bao nhiêu hồ sơ ở *Việc của tôi* và *Yêu cầu cập nhật* (`0052`).
 *
 * Nhỏ hơn hẳn `MOI_TRANG` của các màn hình danh sách, và có lý do: ở đây chúng
 * chỉ là hai trong nhiều khối chứ không phải cả màn hình. Hai mươi dòng mỗi khối
 * đẩy sức khoẻ luồng duyệt, bảng theo TDV và mọi thứ còn lại xuống dưới tầm mắt
 * — trang tổng quan thành một danh sách dài, đúng thứ nó sinh ra để thay thế.
 */
export const MOI_TRANG_TONG_QUAN = 5;

/** Khối nào có nút ghi — `FE-23` cấm `BAN_LANH_DAO` chạm vào bất kỳ cái nào. */
export const KHOI_CO_NUT_GHI: TenKhoi[] = ['canh-bao-mau-hop-dong', 'canh-bao-thu-hong'];

/** Câu giải thích vì sao vai trò này không có hộp việc. Nói thẳng, không vòng vo. */
export const LY_DO_KHONG_CO_VIEC: Partial<Record<VaiTro, string>> = {
  BAN_LANH_DAO:
    'Ban lãnh đạo không nằm trong luồng duyệt nên không có hồ sơ nào chờ bạn xử lý. ' +
    'Màn hình này là bản tổng hợp toàn hệ thống, chỉ để xem.',
  QUAN_TRI:
    'Quản trị hệ thống không nằm trong luồng duyệt nên không có hồ sơ nào ở đây, ' +
    'và các con số hồ sơ cũng không thuộc phạm vi dữ liệu của bạn. ' +
    'Màn hình này theo dõi sức khoẻ hệ thống.',
};
