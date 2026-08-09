/**
 * Giữ nội dung biểu mẫu đang nhập dở, để không mất khi phiên hết hạn hoặc khi
 * người dùng buộc phải tải lại (`FE-33`, và cả nhánh MAJOR ở muc 11).
 *
 * Dùng `sessionStorage` chứ không `localStorage`: bản nháp chỉ có nghĩa trong
 * phiên làm việc này. Để ở `localStorage` là để lại nội dung hồ sơ khách hàng
 * trên một máy dùng chung sau khi người ta đã đăng xuất và rời đi.
 */
const TIEN_TO = 'csbh:nhap:';

export function luuNhap(khoa: string, gia_tri: unknown): void {
  try {
    sessionStorage.setItem(TIEN_TO + khoa, JSON.stringify(gia_tri));
  } catch {
    // Hết dung lượng hoặc trình duyệt chặn. Mất bản nháp thì tiếc, nhưng làm
    // đứng cả màn hình vì không lưu được bản nháp thì tệ hơn hẳn.
  }
}

export function docNhap<T>(khoa: string): T | undefined {
  try {
    const s = sessionStorage.getItem(TIEN_TO + khoa);
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function xoaNhap(khoa: string): void {
  try {
    sessionStorage.removeItem(TIEN_TO + khoa);
  } catch {
    /* không sao */
  }
}

/** Xoá sạch bản nháp — gọi khi đăng xuất có chủ ý, không gọi khi token hết hạn. */
export function xoaHetNhap(): void {
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(TIEN_TO)) sessionStorage.removeItem(k);
    }
  } catch {
    /* không sao */
  }
}
