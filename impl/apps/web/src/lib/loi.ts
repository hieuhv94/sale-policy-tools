/**
 * **BẢNG TRA LỖI — nguồn duy nhất của câu báo lỗi và dạng hiển thị** (`0088`).
 *
 * Tới `0088` giao diện không ánh xạ một mã lỗi nào: câu hiện ra là `message` của
 * máy chủ, hoặc — khi máy chủ không gửi — một trong bảy câu mặc định suy từ mã
 * HTTP. Đo được ở P114: **35 trên 96 mã** không bao giờ kèm câu, nên chúng rơi
 * hết vào bảy câu ấy. Hệ quả đọc thấy trên màn hình:
 *
 *   - Gõ sai mật khẩu → *"Yêu cầu không hợp lệ."*
 *   - Mã khách hàng trùng → *"Dữ liệu vừa được người khác thay đổi."*
 *   - File Excel đang dựng → *"Không tìm thấy dữ liệu. Có thể nó vừa bị xoá."*
 *   - Mười bốn mã 404 khác nhau → **cùng một câu**.
 *
 * Bảng này chữa cả lớp ấy, và `loi.test.ts` **quét mã nguồn máy chủ**: mọi
 * `code:` ném ra từ `services/` hay `packages/` mà thiếu ở đây là ca kiểm đỏ.
 * Đó là chốt để mã lỗi thêm về sau không lặng lẽ rơi lại về câu mặc định — thêm
 * một mã ở máy chủ thì bảng này phải cập nhật trong cùng lượt.
 *
 * ---------------------------------------------------------------------------
 * NĂM DẠNG, và thứ quyết định dạng là NGƯỜI DÙNG PHẢI LÀM GÌ TIẾP
 * ---------------------------------------------------------------------------
 *
 *   `hop-thoai`  Thao tác vừa bấm không thành, phải biết trước khi làm tiếp.
 *   `thanh-noi`  Việc phụ hỏng, không mất dữ liệu, không phải quyết định gì.
 *   `o-nhap`     Lỗi thuộc đúng MỘT trường — người dùng sửa ngay tại ô đó.
 *   `trang`      Không tải được thứ để dựng màn hình. KHÔNG dùng hộp thoại:
 *                đóng nó xong thì phía sau là trang trắng.
 *   `im`         Lỗi giữa các service, hoặc lớp phủ phiên đã lo. Không hiện.
 *
 * `dang` khai ở đây là dạng khi lỗi đến từ MỘT THAO TÁC. Đường tải màn hình có
 * dạng riêng theo cấu trúc — nó dựng `TrangLoi` tại chỗ — nên không tra bảng.
 */
import { LoiApi } from './api.js';
import { nhanHanhDong, nhanTrangThai, NHAN_VAI_TRO } from './format.js';
import { NHAN_KHOA } from './mau-hop-dong.js';

export type Dang = 'hop-thoai' | 'thanh-noi' | 'o-nhap' | 'trang' | 'im';

type Muc = {
  dang: Dang;
  /** Câu cố định của giao diện. Thắng `message` máy chủ khi cả hai cùng có. */
  cau?: string;
  /**
   * Lấy câu từ `message` của máy chủ.
   *
   * Dùng cho những mã mà câu chỉ dựng được ở máy chủ vì nó mang số liệu của
   * chính lần gọi ấy: *"Dòng 12: thiếu cột Giá bán"*, *"Sản phẩm SP-014 đã có
   * trong hồ sơ"*. Chép một câu tĩnh vào đây là mất đúng phần nói lên sự việc.
   */
  tuMayChu?: true;
  /** Câu dựng tại giao diện từ thân lỗi — xem `DUNG_CAU`. */
  tuThan?: true;
  /** Ô nhập mà lỗi này thuộc về, khi máy chủ không nói qua `field`. */
  truong?: string;
};

/**
 * Nhãn tiếng Việt của các cột trong file Excel danh mục (`0121`).
 *
 * Khai ở đây chứ không ở máy chủ. Khoá là tên cột THẬT trong file — người dùng
 * đang mở đúng file ấy, nên nêu kèm tên cột giúp họ tìm đúng chỗ, còn `0088`
 * cấm tên trường TRONG MÃ chứ không cấm tên cột trong tài liệu của họ.
 */
const NHAN_COT_EXCEL: Record<string, string> = {
  ma_vat_tu: 'Mã vật tư',
  ten_vat_tu: 'Tên sản phẩm',
  nhom_sp: 'Mã nhóm',
  gia_ban_cong_ty: 'Giá bán Công ty',
  dang_co_hieu_luc: 'Đang có hiệu lực',
};

/** `[3, 7, 12]` → `"3, 7, 12"`; quá dài thì cắt và nói còn bao nhiêu. */
function vaiSo(ds: unknown, toiDa = 8): string {
  const m = (Array.isArray(ds) ? ds : []).map(String);
  if (m.length <= toiDa) return m.join(', ');
  return `${m.slice(0, toiDa).join(', ')} và ${m.length - toiDa} chỗ nữa`;
}

/**
 * Ba lớp lỗi của `domain-policy` viết câu bằng **tiếng Việt KHÔNG DẤU** vì cùng
 * một câu ấy đi vào log và nhật ký hệ thống. Giao diện tới `0088` lấy nguyên
 * câu đó ra màn hình, nên Trưởng bộ phận bấm *Ký số* trên hồ sơ đã sang bước
 * khác đọc được:
 *
 *   Khong the thuc hien "TBP_SIGN" khi ho so dang o "CHO_KT_L1".
 *   Hanh dong duoc phep: KT_RECEIVE_L1, KT_RETURN_L1
 *
 * Không sửa câu ở `domain-policy` — nó đúng cho chỗ nó phục vụ. Máy chủ đã kèm
 * `status` và `allowed` trong thân lỗi, nên giao diện dựng câu riêng bằng đúng
 * tên tiếng Việt đang hiện trên màn hình.
 */
const DUNG_CAU: Record<string, (b: Record<string, unknown>) => string | null> = {
  IMPORT_TOO_MANY_ROWS: (b) =>
    `File có ${b['soDong']} dòng, vượt mức ${b['toiDa']} dòng mỗi lượt nhập. ` +
    'Chia nhỏ file rồi nhập lại.',

  IMPORT_BAD_TYPE: (b) => {
    const o = (Array.isArray(b['o']) ? b['o'] : []) as { rowNumber: number; cot: string; lyDo: string }[];
    if (o.length === 0) return null;
    /*
     * Ba lý do, ba việc phải làm khác nhau — nên câu cuối chọn theo lý do NẶNG
     * nhất có mặt chứ không ghép cả ba. Một câu liệt kê ba cách sửa thì người
     * đọc phải tự tìm xem cách nào là của mình.
     */
    const co = (x: string) => o.some((y) => y.lyDo === x);
    const viec = co('KHONG_PHAI_HIEU_LUC')
      ? `Cột "${NHAN_COT_EXCEL['dang_co_hieu_luc']}" chỉ nhận "Đang bán" hoặc "Ngừng bán" — bấm vào ô để xổ danh sách.`
      : co('KHONG_PHAI_SO')
        ? 'Ô giá phải là số.'
        : 'Những ô này đang báo lỗi công thức trong Excel — sửa thành giá trị thật rồi tải lại.';
    return (
      `${o.length} ô trong file không đọc được: ${vaiSo(
        o.map((x) => `dòng ${x.rowNumber} · ${NHAN_COT_EXCEL[x.cot] ?? x.cot}`),
      )}. ` + viec
    );
  },

  IMPORT_MISSING_FIELD: (b) => {
    const o = (Array.isArray(b['o']) ? b['o'] : []) as { rowNumber: number; cot: string }[];
    if (o.length === 0) return null;
    return (
      `${o.length} ô bắt buộc còn trống: ${vaiSo(
        o.map((x) => `dòng ${x.rowNumber} · ${NHAN_COT_EXCEL[x.cot] ?? x.cot}`),
      )}. ` + 'Điền đủ rồi tải lại — từ nay ô giá cũng bắt buộc, sản phẩm phải có giá bán.'
    );
  },

  IMPORT_GROUP_MISSING: (b) => {
    const n = (Array.isArray(b['nhom']) ? b['nhom'] : []) as { ma: string; dong: number[] }[];
    if (n.length === 0) return null;
    return (
      `${n.length} mã nhóm trong file chưa có trong danh mục: ${vaiSo(n.map((x) => x.ma))}. ` +
      'Tạo các nhóm này ở thẻ Nhóm sản phẩm trước, rồi nhập lại.'
    );
  },

  IMPORT_DUPLICATE_IN_FILE: (b) => {
    const ma = (Array.isArray(b['trungMa']) ? b['trungMa'] : []) as { giaTri: string; dong: number[] }[];
    const ten = (Array.isArray(b['trungTen']) ? b['trungTen'] : []) as { giaTri: string; dong: number[] }[];
    const phan: string[] = [];
    if (ma.length > 0) {
      phan.push(`${ma.length} mã vật tư lặp lại: ${vaiSo(ma.map((x) => `${x.giaTri} (dòng ${x.dong.join(', ')})`))}`);
    }
    if (ten.length > 0) {
      phan.push(`${ten.length} tên sản phẩm lặp lại: ${vaiSo(ten.map((x) => `${x.giaTri} (dòng ${x.dong.join(', ')})`))}`);
    }
    if (phan.length === 0) return null;
    return `Trong file có dòng trùng nhau — ${phan.join('; ')}. Giữ lại một dòng cho mỗi sản phẩm.`;
  },


  INVALID_TRANSITION: (b) => {
    const tt = typeof b['status'] === 'string' ? nhanTrangThai(b['status']) : null;
    if (!tt) return null;
    const duoc = Array.isArray(b['allowed']) ? (b['allowed'] as string[]) : [];
    const con = duoc.length > 0 ? ` Việc còn làm được: ${duoc.map(nhanHanhDong).join(', ')}.` : '';
    return `Hồ sơ đã sang trạng thái ${tt} nên không thực hiện được thao tác vừa bấm.${con}`;
  },
  POLICY_LOCKED: (b) => {
    const tt = typeof b['status'] === 'string' ? nhanTrangThai(b['status']) : null;
    return tt === null ? null : `Hồ sơ đang ở ${tt} nên đã khoá sửa.`;
  },
  ROLE_FORBIDDEN: (b) => {
    const ds = Array.isArray(b['roles']) ? (b['roles'] as string[]) : [];
    const ten = ds.map((r) => NHAN_VAI_TRO[r] ?? r).filter(Boolean);
    return ten.length === 0
      ? null
      : `Việc này chỉ dành cho ${ten.join(' và ')}, vai trò của bạn không thao tác được.`;
  },
  VALIDATION_FAILED: (b) => {
    const t = typeof b['field'] === 'string' ? NHAN_TRUONG[b['field'] as string] : undefined;
    return t ? `Ô ${t} chưa hợp lệ.` : 'Có ô nhập chưa hợp lệ.';
  },
  /*
   * `0104` — NÓI RÕ THIẾU MỤC NÀO.
   *
   * Máy chủ gửi `thieuTruong: ['ho_so.ma_ho_so', …]` từ `0067`, và ca kiểm ở đó
   * ghi *"Nói RÕ thiếu gì, không chỉ nói 'thiếu': Quản trị phải sửa được ngay"*.
   * Nhưng giao diện chưa bao giờ đọc trường ấy — nó lấy `message` máy chủ, một
   * câu nói *"còn thiếu mục bắt buộc"* rồi trỏ sang muc 11.1, tức một mã hiệu
   * tài liệu mà người soạn mẫu không có trong tay.
   *
   * Dựng câu ở ĐÂY chứ không ở máy chủ: `thieuTruong` mang TÊN TRƯỜNG TRONG MÃ,
   * mà `0088` cấm những cái tên ấy ra màn hình. Bảng nhãn nằm ở giao diện.
   */
  TEMPLATE_MISSING_REQUIRED: (b) => {
    const ds = Array.isArray(b['thieuTruong']) ? (b['thieuTruong'] as string[]) : [];
    const nhan = ds.map((k) => NHAN_KHOA[k]).filter((n): n is string => Boolean(n));
    const bang = b['thieuBangSanPham'] === undefined ? [] : ['Bảng sản phẩm'];
    const het = [...nhan, ...bang];
    if (het.length === 0) return null;
    return (
      `Mẫu hồ sơ CSBH còn thiếu ${het.length} mục bắt buộc: ${het.join(', ')}. ` +
      'Thêm ô trống cho các mục ấy vào file Word rồi tải lên lại.'
    );
  },
};

/**
 * Tên trường trong mã → nhãn người dùng đọc trên màn hình.
 *
 * `VALIDATION_FAILED` dựng câu theo `${field}: ${why}`, nên tới `0088` người
 * dùng đọc nguyên văn *"wholesalePrice: phải là số nguyên không âm"*. Máy chủ có
 * gửi kèm `field`, và bảng này đổi nó sang chữ trên nhãn ô nhập.
 *
 * Trường lạ thì KHÔNG đoán: câu lùi về "Có ô nhập chưa hợp lệ" và câu gốc của
 * máy chủ đi kèm ở dòng phụ. Đoán một cái tên tiếng Việt cho trường mình không
 * biết là tự tin sai chỗ người dùng đang cần chính xác.
 */
export const NHAN_TRUONG: Record<string, string> = {
  amount: 'Số tiền',
  appliedDate: 'Ngày áp dụng',
  code: 'Mã',
  confirm: 'Ô xác nhận',
  cpbh: 'CPBH',
  customerCode: 'Mã khách hàng',
  customerName: 'Tên khách hàng',
  customerType: 'Loại khách hàng',
  days: 'Số ngày',
  debtNote: 'Ghi rõ điều khoản',
  debtTerm: 'Công nợ',
  deliveryAddress: 'Địa chỉ giao hàng',
  effectiveFrom: 'Ngày hiệu lực',
  email: 'Email',
  fileName: 'Tên tệp',
  fullName: 'Họ và tên',
  groupCode: 'Mã nhóm sản phẩm',
  login: 'Tên đăng nhập',
  name: 'Tên',
  note: 'Ghi chú',
  // `on` là tham số ngày của đường tra giá và tra ngưỡng — người dùng gặp nó
  // qua bộ lọc *tính theo ngày*, nên nó cần một cái tên đọc được (`0136`).
  on: 'Ngày tính',
  ownerIdNumber: 'CCCD/MST',
  ownerName: 'Người đại diện',
  ownerTitle: 'Chức vụ người đại diện',
  phone: 'Số điện thoại',
  placeholder: 'Ô trống trong mẫu',
  priceType: 'Loại giá',
  productGroupCode: 'Nhóm sản phẩm',
  registeredAddress: 'Địa chỉ đăng ký',
  // `0154` — máy chủ báo lỗi theo tên trường MỚI (mảng); giữ cả tên cũ vì nhật
  // ký kiểm toán của những lượt sửa trước vẫn mang nó.
  registeredAddresses: 'Địa chỉ đăng ký',
  deliveryAddresses: 'Địa chỉ giao hàng',
  role: 'Vai trò',
  status: 'Trạng thái',
  thresholdRate2: 'Ngưỡng chiết khấu',
  username: 'Tên đăng nhập',
  wholesalePrice: 'Giá bán buôn',
};

/**
 * **101 mã lỗi của máy chủ.** Nhóm theo luồng nghiệp vụ, không theo service —
 * người duyệt bảng câu chữ đọc theo màn hình họ dùng, không theo sơ đồ kiến trúc.
 */
export const BANG_LOI: Record<string, Muc> = {
  // --- Đăng nhập và phiên làm việc ----------------------------------------
  INVALID_CREDENTIALS: {
    dang: 'o-nhap',
    truong: 'login',
    cau: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  },
  ACCOUNT_DISABLED: {
    dang: 'o-nhap',
    truong: 'login',
    cau: 'Tài khoản này đã bị vô hiệu hoá. Liên hệ Quản trị hệ thống.',
  },
  PASSWORD_CHANGE_REQUIRED: { dang: 'hop-thoai', tuMayChu: true },
  PASSWORD_WEAK: { dang: 'o-nhap', truong: 'matKhauMoi', tuMayChu: true },
  // Ba mã dưới đây do lớp phủ đăng nhập lại lo — nó đã hiện trước khi ai kịp
  // đọc một câu lỗi, và hiện thêm một hộp thoại nữa là báo hai lần một việc.
  TOKEN_MISSING: { dang: 'im' },
  REFRESH_INVALID: { dang: 'im' },
  REFRESH_EXPIRED: { dang: 'im' },
  PHIEN_HET_HAN: { dang: 'im' },
  TOKEN_STALE: {
    dang: 'hop-thoai',
    cau: 'Mật khẩu vừa đổi nên phiên này đã kết thúc. Đăng nhập lại.',
  },
  REFRESH_REUSED: {
    dang: 'hop-thoai',
    cau:
      'Phiên của bạn đã bị thu hồi vì lý do an toàn. Đăng nhập lại; ' +
      'nếu bạn không tự đăng xuất, hãy báo Quản trị hệ thống.',
  },
  // Bốn mã của ĐƯỜNG LIÊN KẾT đặt mật khẩu. Chúng là ngõ cụt của cả một trang,
  // không phải lỗi của một lần bấm — nên `trang`, và câu phải nói lối ra.
  TOKEN_INVALID: {
    dang: 'trang',
    cau: 'Đường liên kết không đúng. Hãy mở lại thư mời, hoặc yêu cầu Quản trị gửi thư mới.',
  },
  TOKEN_EXPIRED: {
    dang: 'trang',
    cau: 'Đường liên kết đã hết hạn. Bấm Quên mật khẩu để nhận thư mới.',
  },
  TOKEN_USED: {
    dang: 'trang',
    cau:
      'Đường liên kết này đã dùng rồi. Đăng nhập bằng mật khẩu vừa đặt, ' +
      'hoặc bấm Quên mật khẩu.',
  },
  TOKEN_REVOKED: {
    dang: 'trang',
    cau: 'Đường liên kết này đã bị thay bằng thư mới hơn. Dùng thư mới nhất trong hộp thư của bạn.',
  },

  // --- Tài khoản người dùng ------------------------------------------------
  USER_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Không tìm thấy tài khoản này. Tải lại danh sách người dùng.',
  },
  ALREADY_ACTIVATED: {
    dang: 'thanh-noi',
    cau: 'Tài khoản này đã kích hoạt rồi, không cần gửi lại thư mời.',
  },
  /*
   * Câu lấy TỪ MÁY CHỦ vì nó phải kể ra các tên miền đang được khai (`0117`) —
   * danh sách ấy khác nhau ở từng nơi cài đặt, chép một câu tĩnh vào đây là mất
   * đúng phần nói lên phải gõ địa chỉ như thế nào.
   */
  EMAIL_DOMAIN_NOT_ALLOWED: { dang: 'o-nhap', truong: 'email', tuMayChu: true },
  SUCCESSOR_NOT_FOUND: {
    dang: 'o-nhap',
    truong: 'successorId',
    cau: 'Không tìm thấy tài khoản nhận bàn giao. Chọn người khác.',
  },
  SUCCESSOR_REQUIRED: { dang: 'o-nhap', truong: 'successorId', tuMayChu: true },
  SUCCESSOR_INACTIVE: { dang: 'o-nhap', truong: 'successorId', tuMayChu: true },
  SUCCESSOR_INVALID: { dang: 'o-nhap', truong: 'successorId', tuMayChu: true },
  SUCCESSOR_WRONG_ROLE: { dang: 'o-nhap', truong: 'successorId', tuMayChu: true },
  ROLE_FORBIDDEN: {
    dang: 'hop-thoai',
    tuThan: true,
    cau: 'Việc này không thuộc vai trò của bạn.',
  },

  // --- Hồ sơ CSBH ----------------------------------------------------------
  POLICY_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Không tìm thấy hồ sơ này. Có thể nó vừa bị xoá, hoặc bạn không còn phụ trách.',
  },
  LINE_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Sản phẩm này không còn trong hồ sơ. Tải lại hồ sơ rồi thử lại.',
  },
  ATTACHMENT_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Tệp này không còn trong hồ sơ. Tải lại hồ sơ rồi thử lại.',
  },
  OUT_OF_SCOPE: {
    dang: 'trang',
    cau: 'Hồ sơ này nằm ngoài phạm vi dữ liệu của bạn.',
  },
  NOT_OWNER: {
    dang: 'hop-thoai',
    // Từ `0099` mã này trả lời cho CẢ hai đường — sửa và xoá. Trước đó chỉ có
    // đường xoá dùng nó, và câu cũ nói "mới xoá được"; để nguyên thì người bị
    // chặn lúc sửa đọc được một câu nói về việc họ không làm.
    cau: 'Chỉ trình dược viên đang phụ trách hồ sơ này mới sửa hoặc xoá được.',
  },
  NOT_OWNING_TDV: { dang: 'hop-thoai', tuMayChu: true },
  ONLY_EDITABLE_DELETABLE: { dang: 'hop-thoai', tuMayChu: true },
  POLICY_LOCKED: {
    dang: 'hop-thoai',
    tuThan: true,
    cau: 'Hồ sơ đã gửi duyệt nên không sửa được nữa.',
  },
  INVALID_TRANSITION: {
    dang: 'hop-thoai',
    tuThan: true,
    cau: 'Hồ sơ đã sang bước khác nên không thực hiện được thao tác vừa bấm. Tải lại hồ sơ.',
  },
  CONCURRENT_UPDATE: { dang: 'hop-thoai', tuMayChu: true },
  ALREADY_SIGNED: { dang: 'hop-thoai', tuMayChu: true },
  ALREADY_ACTIVE_POLICY: { dang: 'hop-thoai', tuMayChu: true },
  POLICY_OVERDUE: { dang: 'hop-thoai', tuMayChu: true },
  NO_LINES: { dang: 'hop-thoai', tuMayChu: true },
  POLICY_FIELDS_MISSING: { dang: 'hop-thoai', tuMayChu: true },
  NO_ACTIVE_POLICY: {
    dang: 'hop-thoai',
    cau: 'Khách hàng chưa có CSBH nào để lập phiên bản mới. Lập hồ sơ đầu tiên cho khách này.',
  },
  /*
   * `0180` — MỘT câu hỏi thay cho `SUPPLEMENT_REQUIRED`/`AMEND_REQUIRED`.
   *
   * Hai mã cũ CHƯA BAO GIỜ có mặt trong bảng này, và không phải vì ai đó quên:
   * chúng viết bằng `code: hasNew ? 'A' : 'B'`, mà phép quét mã nguồn của ca
   * kiểm dưới đây khớp `code: '…'` — một biểu thức điều kiện lọt qua. Nên đây
   * cũng là một khoảng hở vừa được bịt: mã mới viết thẳng nên nó bị soi.
   *
   * `tuMayChu` — câu hỏi do máy chủ đặt (`NEW_VERSION_MESSAGE`), và nó phải khớp
   * từng chữ với việc sắp xảy ra; chép lại ở đây là hai câu sẽ lệch.
   */
  NEW_VERSION_REQUIRED: { dang: 'hop-thoai', tuMayChu: true },
  /*
   * `0197` — khách đã có một bản Nháp.
   *
   * `im` chứ không `hop-thoai`: màn hình *Lập hồ sơ* KHÔNG bày lỗi này ra dải
   * đỏ, nó đổi hẳn cách hỏi — *"đã có bản nháp, mở ra soạn tiếp?"* kèm một nút
   * đưa thẳng vào đó. Một hộp lỗi đứng cạnh câu ấy là nói hai lần, và lần đầu
   * đọc như một sự cố trong khi đây là chuyện bình thường.
   *
   * Khai vào bảng chứ không bỏ trống: `loi.test.tsx` quét mã nguồn máy chủ nên
   * bỏ sót là đỏ, và `im` là cách nói *"đã có người xử lý mã này"* (`0088`).
   */
  DRAFT_EXISTS: { dang: 'im' },
  /*
   * `0198` — hai câu về MÃ HỒ SƠ, cả hai gắn vào ô nhập mã.
   *
   * `tuMayChu` vì máy chủ là chỗ biết luật: `POLICY_CODE_INVALID` nói ra ĐÚNG
   * TẬP ký tự bị cấm, và chép lại tập ấy ở đây là hai danh sách sẽ lệch ngay lượt
   * ai đó nới một ký tự.
   *
   * `truong: 'code'` để biểu mẫu *Lập hồ sơ* dán câu xuống dưới đúng ô; khối sửa
   * tại chỗ ở tiêu đề thì tự đọc `docLoi().cau` và không dùng tới trường này.
   */
  POLICY_CODE_INVALID: { dang: 'o-nhap', truong: 'code', tuMayChu: true },
  POLICY_CODE_TAKEN: { dang: 'o-nhap', truong: 'code', tuMayChu: true },
  // Đổi mã khi hồ sơ đã rời Nháp. Người dùng bình thường KHÔNG tới được đây —
  // giao diện giấu bút chì — nên nó là chốt cho lượt gọi thẳng API.
  POLICY_CODE_LOCKED: { dang: 'hop-thoai', tuMayChu: true },
  STALE_LINE: { dang: 'hop-thoai', tuMayChu: true },
  SCAN_REQUIRED: { dang: 'hop-thoai', tuMayChu: true },
  /*
   * `0167` — chưa tạo bản mềm thì chưa bàn giao được.
   *
   * `tuMayChu` như bản scan: câu của máy chủ đã nói đúng việc phải làm. Người
   * gặp mã này gần như luôn là người gọi thẳng API — màn hình mở hộp tạo bản mềm
   * TRƯỚC khi gửi `SA_HANDOVER`, nên đường bấm nút không đi qua đây.
   */
  BAN_MEM_REQUIRED: { dang: 'hop-thoai', tuMayChu: true },
  DUPLICATE_PRODUCT: { dang: 'hop-thoai', tuMayChu: true },
  PRODUCT_DISABLED: { dang: 'hop-thoai', tuMayChu: true },
  /*
   * `0186` — sản phẩm đang nằm trong hồ sơ ở trạng thái *Đã xoá*.
   *
   * `tuMayChu`: câu của máy chủ chỉ ra đúng cái nút phải bấm (*Thêm lại*, ngay
   * trên chính dòng ấy), và một câu viết lại ở đây sẽ là câu thứ hai phải nhớ
   * sửa ngày nút đổi tên. Người dùng gần như không tới được đây — dòng mờ nằm
   * ngay trên màn hình — nên đây là chốt cho lượt gọi tay và cho màn hình cũ.
   */
  PRODUCT_LINE_DELETED: { dang: 'hop-thoai', tuMayChu: true },
  REASON_REQUIRED: {
    dang: 'o-nhap',
    truong: 'lyDo',
    cau: 'Phải nhập lý do thì mới thực hiện được thao tác này.',
  },
  FORBIDDEN_ROLE: { dang: 'hop-thoai', tuMayChu: true },
  FIELD_NOT_ALLOWED: { dang: 'thanh-noi', tuMayChu: true },
  ASSIGNEE_REQUIRED: { dang: 'o-nhap', truong: 'nguoiXuLy', tuMayChu: true },
  ASSIGNEE_INACTIVE: { dang: 'o-nhap', truong: 'nguoiXuLy', tuMayChu: true },
  ASSIGNEE_WRONG_ROLE: { dang: 'o-nhap', truong: 'nguoiXuLy', tuMayChu: true },

  // --- Khách hàng ----------------------------------------------------------
  CUSTOMER_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Không tìm thấy khách hàng này. Có thể khách vừa bị xoá.',
  },
  CUSTOMER_CODE_DUPLICATE: {
    dang: 'o-nhap',
    truong: 'customerCode',
    cau: 'Mã khách hàng này đã có trong hệ thống. Dùng mã khác.',
  },
  DOCUMENT_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Giấy tờ này không còn trong hồ sơ khách hàng. Tải lại rồi thử lại.',
  },
  /*
   * `0138` — điều khoản thanh toán, luật HAI CHIỀU.
   *
   * Câu của máy chủ đã đúng và đã chỉ vào ô (`field: 'debtNote'`), nên lấy
   * nguyên; dạng `o-nhap` đưa nó xuống ngay dưới ô gõ thay vì bày một hộp thoại
   * chặn màn hình cho một ô còn trống.
   */
  DEBT_NOTE_REQUIRED: { dang: 'o-nhap', tuMayChu: true },
  DEBT_NOTE_NOT_ALLOWED: { dang: 'o-nhap', tuMayChu: true },
  /*
   * `0154` — dưới Ô, không phải hộp thoại: người dùng vừa xoá dòng địa chỉ cuối
   * cùng, và việc phải làm tiếp là gõ vào đúng ô ấy. Máy chủ dựng sẵn câu, và nó
   * kèm `field` nên câu lỗi rơi đúng vào nhóm ô địa chỉ đăng ký.
   */
  /*
   * `CUSTOMER_ADDRESS_REQUIRED` ĐÃ BỎ ở `0175`: địa chỉ đăng ký thôi là một danh
   * sách, nên không còn trạng thái *"xoá tới dòng cuối cùng"* nào để mà báo. Hai
   * mã dưới thay chỗ nó, mỗi ô một mã — câu lỗi chỉ đúng vào ô phải điền.
   */
  CUSTOMER_PROVINCE_REQUIRED: { dang: 'o-nhap', truong: 'province', tuMayChu: true },
  CUSTOMER_STREET_REQUIRED: { dang: 'o-nhap', truong: 'streetWard', tuMayChu: true },
  /*
   * `0175` — dưới Ô mã số thuế, không phải hộp thoại.
   *
   * Người dùng gần như không bao giờ tới được đây: biểu mẫu hỏi máy chủ ngay lúc
   * gõ và làm xám nút Lưu. Mã này là chốt cho hai lượt lập CHẠY SONG SONG cùng
   * một mã số thuế — chỗ mà phép hỏi trước không thể đúng — nên câu của nó vẫn
   * phải rơi đúng vào ô ấy.
   */
  CUSTOMER_ID_NUMBER_DUPLICATE: { dang: 'o-nhap', truong: 'idNumber', tuMayChu: true },
  CUSTOMER_RETIRED: { dang: 'hop-thoai', tuMayChu: true },
  CUSTOMER_ALREADY_RETIRED: { dang: 'hop-thoai', tuMayChu: true },
  CUSTOMER_HAS_POLICY: { dang: 'hop-thoai', tuMayChu: true },
  CUSTOMER_HAS_PENDING_POLICY: { dang: 'hop-thoai', tuMayChu: true },
  REASSIGN_FORBIDDEN: { dang: 'hop-thoai', tuMayChu: true },

  // --- Danh mục sản phẩm và chiết khấu -------------------------------------
  PRICE_NOT_SET: {
    dang: 'hop-thoai',
    cau:
      'Sản phẩm này chưa có giá bán Công ty nên chưa đưa vào hồ sơ được. ' +
      'Báo Quản trị hệ thống nhập giá.',
  },
  PRODUCT_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Không tìm thấy sản phẩm này trong danh mục. Tải lại rồi chọn lại.',
  },
  GROUP_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Không tìm thấy nhóm sản phẩm này. Tải lại danh sách nhóm.',
  },
  RULE_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Không tìm thấy quy định chiết khấu này. Tải lại danh sách.',
  },
  EMPTY_SHEET: {
    dang: 'hop-thoai',
    cau: 'File Excel không có trang tính nào. Kiểm tra lại file rồi tải lên.',
  },
  RULE_CODE_DUPLICATE: { dang: 'o-nhap', truong: 'code', tuMayChu: true },
  RULE_SCOPE_DUPLICATE: { dang: 'hop-thoai', tuMayChu: true },
  BAD_HEADER: { dang: 'hop-thoai', tuMayChu: true },

  /*
   * Sáu mã của lượt nhập danh mục (`0121`).
   *
   * Câu dựng TẠI GIAO DIỆN (`tuThan`) chứ không lấy từ máy chủ: thân lỗi mang số
   * dòng, mã nhóm, tên cột trong file — dựng câu ở máy chủ nghĩa là ghép chuỗi
   * tiếng Việt trong một service, và `0088` cấm đúng chuyện đó.
   *
   * Hộp thoại nhập còn vẽ CHI TIẾT từ cùng thân lỗi ấy — danh sách dòng hỏng để
   * người dùng mở file ra sửa. Câu ở đây là câu tóm tắt, và là thứ duy nhất hiện
   * ra nếu lỗi nổi lên ở một màn hình khác.
   */
  IMPORT_TOO_MANY_ROWS: { dang: 'hop-thoai', tuThan: true },
  IMPORT_BAD_TYPE: { dang: 'hop-thoai', tuThan: true },
  IMPORT_MISSING_FIELD: { dang: 'hop-thoai', tuThan: true },
  IMPORT_GROUP_MISSING: { dang: 'hop-thoai', tuThan: true },
  IMPORT_DUPLICATE_IN_FILE: { dang: 'hop-thoai', tuThan: true },

  // --- Tệp, văn bản mẫu và hợp đồng ----------------------------------------
  FILE_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Tệp này không còn trên hệ thống. Nếu bạn vừa tải lên, thử tải lại trang.',
  },
  TEMPLATE_NOT_FOUND: {
    dang: 'hop-thoai',
    cau: 'Không tìm thấy văn bản mẫu này. Tải lại danh sách mẫu rồi chọn lại.',
  },
  /*
   * `0150` — trùng tên mẫu. Lỗi của Ô TÊN, không phải của cả thao tác: người
   * dùng đang đứng trong hộp thêm mẫu, đã chọn file và ánh xạ xong, và thứ họ
   * phải sửa là đúng một ô. Đẩy ra hộp thoại là bắt họ đọc rồi tự đi tìm ô ấy.
   *
   * `tuMayChu` vì câu của máy chủ nói được cả cái tên đang trùng, mà bảng này
   * thì không — nó không biết người dùng vừa gõ gì.
   */
  TEMPLATE_NAME_TAKEN: { dang: 'o-nhap', truong: 'name', tuMayChu: true },
  LINK_TOKEN_MISSING: {
    dang: 'thanh-noi',
    cau: 'Không mở được tệp. Đóng khung xem rồi mở lại từ hồ sơ.',
  },
  FILE_MISSING: { dang: 'o-nhap', truong: 'tep', tuMayChu: true },
  FILE_EMPTY: { dang: 'o-nhap', truong: 'tep', tuMayChu: true },
  FILE_TOO_LARGE: { dang: 'o-nhap', truong: 'tep', tuMayChu: true },
  FILE_TYPE_NOT_ALLOWED: { dang: 'o-nhap', truong: 'tep', tuMayChu: true },
  FILE_DISCARDED: { dang: 'hop-thoai', tuMayChu: true },
  FILE_INTEGRITY_FAILED: { dang: 'hop-thoai', tuMayChu: true },
  TEMPLATE_NOT_DOCX: {
    dang: 'o-nhap',
    truong: 'tep',
    cau: 'Tệp này không phải file Word (.docx). Chọn lại tệp mẫu.',
  },
  TEMPLATE_NOT_USABLE: { dang: 'hop-thoai', tuMayChu: true },
  TEMPLATE_INCOMPLETE: { dang: 'hop-thoai', tuMayChu: true },
  TEMPLATE_MISSING_REQUIRED: { dang: 'hop-thoai', tuThan: true, tuMayChu: true },
  TEMPLATE_FILE_MISSING: { dang: 'hop-thoai', tuMayChu: true },
  /*
   * `NO_ACTIVE_TEMPLATE` ĐÃ GỠ (`0098`) — máy chủ không còn ném nó.
   *
   * Nó trả lời cho "không truyền mẫu, mà danh sách cũng rỗng", một nhánh biến
   * mất khi `mauId` thành bắt buộc ở đường xuất hợp đồng. Danh sách rỗng thì
   * người xuất không có gì để bấm, và hộp chọn nói câu ấy trước khi có lượt gọi
   * nào.
   */
  /*
   * Ba mã của `0098`, và dạng của chúng khác nhau vì việc người dùng phải làm
   * tiếp khác nhau.
   *
   * `TEMPLATE_REQUIRED` là lỗi của MỘT Ô trong hộp gửi duyệt — chưa chọn mẫu —
   * nên nó nằm ngay dưới ô ấy. Hiện hộp thoại thì đóng xong người dùng vẫn phải
   * tự đi tìm ô nào còn trống.
   *
   * Hai mã kia là lỗi của THAO TÁC vừa bấm, và cả hai đều lấy câu từ máy chủ:
   * câu của chúng nói về đúng hồ sơ này (đã gắn mẫu nào, lập trước hay sau
   * `0098`), không phải một câu chung.
   */
  /*
   * NĂM MÃ LỖI VỀ MẪU ĐÃ GỠ (`0163`): `POLICY_TEMPLATE_MISSING`,
   * `TEMPLATE_REQUIRED`, `TEMPLATE_LOCKED`, `POLICY_TEMPLATE_NOT_SET`,
   * `POLICY_TEMPLATE_PENDING`.
   *
   * Cả năm sinh ra từ cơ chế ĐÓNG BĂNG mẫu vào hồ sơ (`0098`, `0100`), và cơ
   * chế ấy đã bỏ. Máy chủ không phát mã nào trong số đó nữa —
   * `tests/web/loi.test.tsx` quét mã nguồn máy chủ nên giữ lại chúng ở đây là
   * giữ năm dòng không ai đọc tới.
   */
  PLACEHOLDER_NOT_IN_TEMPLATE: { dang: 'o-nhap', truong: 'placeholder', tuMayChu: true },
  SOURCE_UNKNOWN: { dang: 'o-nhap', truong: 'source', tuMayChu: true },
  CONTRACT_NOT_READY: { dang: 'hop-thoai', tuMayChu: true },
  PDF_ENGINE_UNAVAILABLE: { dang: 'hop-thoai', tuMayChu: true },
  PDF_RENDER_FAILED: { dang: 'hop-thoai', tuMayChu: true },

  // --- Báo cáo và kết xuất Excel -------------------------------------------
  EXPORT_NOT_READY: {
    dang: 'thanh-noi',
    cau: 'File Excel đang được dựng. Chờ vài giây rồi bấm tải lại.',
  },
  EXPORT_NOT_FOUND: {
    dang: 'thanh-noi',
    cau: 'Không tìm thấy file kết xuất này. Hãy xuất lại.',
  },
  EXPORT_EXPIRED: { dang: 'thanh-noi', tuMayChu: true },

  // --- Hạ tầng và màn hình quản trị ----------------------------------------
  RATE_LIMITED: { dang: 'thanh-noi', tuMayChu: true },
  UPSTREAM_UNAVAILABLE: {
    dang: 'hop-thoai',
    cau:
      'Một phần của hệ thống đang không phản hồi. ' +
      'Dữ liệu bạn nhập vẫn được giữ nguyên — thử lại sau ít phút.',
  },
  BODY_TOO_LARGE: {
    dang: 'hop-thoai',
    cau: 'Nội dung gửi lên quá lớn. Bớt số dòng hoặc tách làm nhiều lần.',
  },
  AUDIT_WINDOW_EXCEEDED: {
    dang: 'o-nhap',
    truong: 'from',
    cau: 'Nhật ký chỉ tra được 6 tháng gần nhất. Chọn lại mốc bắt đầu.',
  },
  DEAD_LETTER_NOT_FOUND: {
    dang: 'thanh-noi',
    cau: 'Thư hỏng này không còn trong hàng đợi. Tải lại danh sách.',
  },
  /*
   * `0096` — đánh dấu đã đọc một thông báo không còn (hoặc không phải của mình).
   *
   * `thanh-noi` chứ không `hop-thoai`: người dùng vừa bấm vào một dòng để ĐI
   * SANG hồ sơ, và màn hình đang chuyển. Một hộp thoại lúc ấy chặn ngang đúng
   * việc họ định làm, cho một lỗi không mất gì — thông báo là bản sao của lá thư
   * đã nằm trong hộp thư của họ.
   */
  THONG_BAO_NOT_FOUND: {
    dang: 'thanh-noi',
    cau: 'Thông báo này không còn nữa. Tải lại danh sách.',
  },
  SERVICE_TOKEN_MISSING: { dang: 'im' },
  VALIDATION_FAILED: { dang: 'o-nhap', tuThan: true },
  CONFIRM_MISMATCH: { dang: 'o-nhap', truong: 'confirm', tuMayChu: true },
  MAT_KET_NOI: {
    dang: 'hop-thoai',
    cau: 'Không kết nối được máy chủ. Dữ liệu bạn nhập vẫn được giữ nguyên.',
  },
  KHONG_CO_TRINH_DUYET: { dang: 'thanh-noi', cau: 'Chỉ tải được tệp từ trình duyệt.' },
};

/**
 * Lỗi này có phải "không tìm thấy" không (`0089`).
 *
 * Vài đường đọc coi 404 là một CÂU TRẢ LỜI hợp lệ chứ không phải lỗi — hỏi
 * "khách này đang áp dụng CSBH nào" mà nhận 404 nghĩa là *chưa có bản nào*.
 * Nhưng `catch` bắt tất: mất mạng, 500, hay token hỏng cũng rơi vào cùng nhánh
 * ấy và màn hình khẳng định "khách hàng chưa có CSBH nào" — một câu SAI, và sai
 * ở chỗ người dùng không có cách nào nghi ngờ.
 */
export const la404 = (e: unknown): boolean => e instanceof LoiApi && e.status === 404;

export type LoiDaDoc = {
  cau: string;
  dang: Dang;
  /** Ô nhập mà lỗi thuộc về, nếu có. */
  truong?: string;
  /** Câu gốc của máy chủ, chỉ đặt khi nó KHÁC câu chính — hiện ở dòng phụ. */
  chiTiet?: string;
  traceId?: string | null;
  /** Lỗi mạng thì dữ liệu đang nhập vẫn đúng, chỉ cần bấm lại (`FE-32`). */
  laLoiMang: boolean;
  ma: string;
};

const CAU_LUI = 'Có lỗi không xác định. Hãy thử lại.';

/**
 * Đọc một lỗi bất kỳ ra câu chữ và dạng hiển thị.
 *
 * Thứ tự tra, và thứ tự này có lý do: câu của BẢNG TRA thắng câu của máy chủ ở
 * những mã ta đã viết câu (`cau`), vì đó chính là việc đang làm — thống nhất
 * câu chữ ở một chỗ. Ngược lại `tuMayChu` nhường hẳn cho máy chủ, dành cho câu
 * mang số liệu của chính lần gọi ấy mà giao diện không dựng lại được.
 */
export function docLoi(loi: unknown): LoiDaDoc {
  if (!(loi instanceof LoiApi)) {
    return { cau: CAU_LUI, dang: 'hop-thoai', laLoiMang: false, ma: 'KHONG_RO' };
  }

  const muc = BANG_LOI[loi.code];
  const cauMayChu = loi.message.trim();

  // Trường: máy chủ nói qua `field` thì tin nó — nó biết chính xác ô nào hỏng.
  const truong =
    typeof loi.body['field'] === 'string' ? (loi.body['field'] as string) : muc?.truong;

  let cau: string | null = null;
  let chiTiet: string | undefined;

  if (muc?.tuThan) cau = DUNG_CAU[loi.code]?.(loi.body) ?? null;
  if (cau === null && muc?.tuMayChu && cauMayChu) cau = cauMayChu;
  if (cau === null && muc?.cau) cau = muc.cau;

  // Câu gốc của `VALIDATION_FAILED` mang tên trường trong mã — không đưa lên
  // làm câu chính, nhưng cũng không vứt: Quản trị đọc nó lúc gỡ lỗi qua điện
  // thoại, và nó là thứ duy nhất nói ra trường ấy sai KIỂU GÌ.
  if (loi.code === 'VALIDATION_FAILED' && cauMayChu) chiTiet = cauMayChu;

  if (cau === null) cau = cauMayChu || CAU_LUI;

  return {
    cau,
    dang: muc?.dang ?? 'hop-thoai',
    ...(truong ? { truong } : {}),
    ...(chiTiet ? { chiTiet } : {}),
    traceId: loi.traceId,
    laLoiMang: loi.laLoiMang,
    ma: loi.code,
  };
}
