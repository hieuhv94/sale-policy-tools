/**
 * Trường nào BẮT BUỘC, cho từng biểu mẫu ghi.
 *
 * Khoá là tên trường của MÁY CHỦ, không phải tên nhãn tiếng Việt. Lý do: bảng
 * này là bản sao có kiểm chứng của các DTO trong `*.controller.ts`, và
 * `bat-buoc.test.ts` đọc thẳng mã nguồn máy chủ rồi so từng tập một. Trường nào
 * ở máy chủ không bọc `opt()` thì phải có mặt ở đây; thêm một trường bắt buộc
 * bên máy chủ mà quên giao diện là test đỏ, không phải người dùng bấm Lưu rồi
 * mới biết.
 *
 * Bảng này KHÔNG chép được từ máy chủ lúc chạy: không có endpoint nào mô tả lược
 * đồ dữ liệu vào, và thêm một endpoint như vậy chỉ để vẽ dấu sao là đắt hơn
 * nhiều so với một test đọc mã nguồn.
 *
 * Ba trường bắt buộc KHÔNG nằm ở đây vì chúng có điều kiện:
 *   - `approverUsername` chỉ bắt buộc khi vai trò là TDV — xem `TRUONG_BAT_BUOC`
 *     ở `nguoi-dung.ts`; máy chủ chặn ở tầng service chứ không ở DTO.
 *   - `kind` của danh mục tra cứu đi qua đường dẫn, không qua thân request.
 *   - `file` của mẫu hợp đồng và nhập Excel là phần multipart.
 */

export type TenBieuMau =
  | 'nguoi-dung'
  | 'khach-hang'
  | 'san-pham'
  | 'gia'
  | 'nhom-san-pham'
  | 'chiet-khau'
  | 'tra-cuu'
  | 'nguoi-ky'
  | 'ho-so'
  | 'dong-san-pham'
  | 'ngay-ap-dung';

export const BAT_BUOC: Record<TenBieuMau, readonly string[]> = {
  'nguoi-dung': ['email', 'username', 'fullName', 'role', 'defaultPassword'],
  'khach-hang': ['code', 'name', 'customerType', 'registeredAddress', 'ownerName'],
  'san-pham': ['code', 'name', 'groupCode'],
  gia: ['priceType', 'amount', 'effectiveFrom'],
  'nhom-san-pham': ['code', 'name'],
  'chiet-khau': ['effectiveFrom', 'thresholdRate2'],
  'tra-cuu': ['code', 'name'],
  'nguoi-ky': ['fullName', 'title', 'unit', 'signScope', 'validFrom'],
  'ho-so': ['customerId', 'appliedDate'],
  'dong-san-pham': ['productId', 'wholesalePrice'],
  'ngay-ap-dung': ['appliedDate'],
};

/**
 * Ô mà GIAO DIỆN bắt buộc chặt hơn máy chủ. Mỗi mục phải có lý do ở đây.
 *
 * Mặc định thì chặt hơn máy chủ là một lỗi: nút Lưu chết mà không ai hiểu vì
 * sao, và cách duy nhất đi tiếp là điền bừa. Nên `bat-buoc.test.ts` bắt mọi
 * khác biệt, và chỉ những mục khai ở đây mới được đi qua.
 *
 * `ho-so.appliedDate` — `POST /policies` nhận hồ sơ không có ngày áp dụng
 * (`0001_init.sql:53` cho phép NULL), vì nó dựng để tạo bản nháp rồi điền dần.
 * Nhưng màn hình Lập hồ sơ điền sẵn ngày hôm nay và tạo hồ sơ ngay tại chỗ, nên
 * ô trống ở đây chỉ xảy ra khi người dùng xoá nó đi — và kết quả là một hồ sơ
 * chạy qua cả bốn bước duyệt với ô ngày áp dụng để trống trên bản CSBH A4.
 */
export const CHAT_HON: Partial<Record<TenBieuMau, readonly string[]>> = {
  'ho-so': ['appliedDate'],
};

/** Ô này có gắn dấu sao không. */
export const batBuoc = (bieuMau: TenBieuMau, truong: string): boolean =>
  BAT_BUOC[bieuMau].includes(truong);

const trong = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Những trường bắt buộc còn để trống. Rỗng nghĩa là gửi được.
 *
 * Trả về DANH SÁCH chứ không phải boolean để chỗ gọi còn nói được thiếu cái gì
 * nếu cần. Ô ngày là chỗ hay hỏng nhất: nó có sẵn giá trị mặc định nên nhìn thì
 * như đã điền, mà xoá trắng đi thì `<input type="date">` trả về chuỗi rỗng và
 * không có gì trên màn hình đổi khác.
 */
export const thieuTruong = (
  bieuMau: TenBieuMau,
  giaTri: Record<string, unknown>,
): string[] => BAT_BUOC[bieuMau].filter((k) => trong(giaTri[k]));
