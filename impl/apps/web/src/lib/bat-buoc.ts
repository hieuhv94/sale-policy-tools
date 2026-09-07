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
  | 'ho-so'
  | 'dong-san-pham';

export const BAT_BUOC: Record<TenBieuMau, readonly string[]> = {
  'nguoi-dung': ['email', 'username', 'fullName', 'role'],
  'khach-hang': [
    'code',
    'name',
    'customerType',
    // `0175` — địa chỉ đăng ký thành HAI ô, và mã số thuế thôi là ô tuỳ chọn.
    'province',
    'streetWard',
    'ownerName',
    'idNumber',
  ],
  'san-pham': ['code', 'name', 'groupCode', 'price'],
  gia: ['amount'],
  'nhom-san-pham': ['code', 'name'],
  'chiet-khau': ['code', 'effectiveFrom', 'thresholdRate2'],
  // `0180` — màn hình *Lập hồ sơ* thôi hỏi ngày áp dụng; nó chỉ còn chọn khách
  // hàng. Ngày chuyển xuống biểu mẫu dòng sản phẩm ngay dưới.
  'ho-so': ['customerId'],
  'dong-san-pham': ['productId', 'wholesalePrice', 'ngayApDung'],
};

/**
 * Ô mà GIAO DIỆN bắt buộc chặt hơn máy chủ. Mỗi mục phải có lý do ở đây.
 *
 * Mặc định thì chặt hơn máy chủ là một lỗi: nút Lưu chết mà không ai hiểu vì
 * sao, và cách duy nhất đi tiếp là điền bừa. Nên `bat-buoc.test.ts` bắt mọi
 * khác biệt, và chỉ những mục khai ở đây mới được đi qua.
 *
 * `dong-san-pham.ngayApDung` (`0180`) — `POST/PATCH .../lines` vẫn NHẬN dòng
 * không khai ngày: máy chủ điền HÔM NAY theo giờ Việt Nam, vì nó là chỗ duy
 * nhất biết "hôm nay" của người dùng (`0104`, `0128`). Biểu mẫu thì đòi, và nó
 * đúng ở chỗ của nó: người lập đang nhìn thẳng vào ô ấy, còn một ô ngày im lặng
 * tự điền là một ngày không ai đọc trước khi ký.
 *
 * Mục cũ `ho-so.appliedDate` biến mất cùng trường của nó.
 */
export const CHAT_HON: Partial<Record<TenBieuMau, readonly string[]>> = {
  'dong-san-pham': ['ngayApDung'],
};

/** Ô này có gắn dấu sao không. */
export const batBuoc = (bieuMau: TenBieuMau, truong: string): boolean =>
  BAT_BUOC[bieuMau].includes(truong);

/**
 * Một ô coi như CHƯA ĐIỀN.
 *
 * MẢNG tính riêng (`0154`). Từ lượt địa chỉ thành danh sách, một trường bắt
 * buộc có thể là `string[]`, và không có nhánh này thì `[]` lẫn `['']` đều lọt
 * qua — cả hai đều không phải chuỗi, không phải `null`, nên phép kiểm cũ trả về
 * *"đã điền"*. Hệ quả: nút *Lưu* sáng lên với một biểu mẫu chỉ có ô địa chỉ
 * trống, người dùng bấm, và máy chủ trả 400 về một ô họ tưởng đã điền.
 *
 * Lọc từng phần tử bằng chính phép kiểm này, nên `['', '  ']` cũng là trống.
 */
/*
 * `export` từ `0175`: sau khi địa chỉ đăng ký thành hai ô chuỗi, không bảng ô
 * bắt buộc nào còn đi qua nhánh MẢNG — nên nhánh ấy chỉ giữ được bằng một ca
 * kiểm gọi thẳng vào đây. Nó vẫn cần: `deliveryAddresses` là danh sách, và bỏ
 * nhánh đi thì `[]` với `['']` lọt thành "đã điền" (lỗ hổng `0154` từng mở).
 */
export const trong = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.every((x) => trong(x)));

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
