/**
 * Đăng nhập Google trong CỬA SỔ BẬT LÊN — đường của lớp phủ hết phiên (`0242`).
 *
 * Màn hình đăng nhập thường điều hướng CẢ TRANG sang Google (`0241`). Lớp phủ hết
 * phiên thì không được: rời trang là mất bản nhập dở (FE-33). Nên nó mở Google
 * trong một cửa sổ con; cửa sổ con quay về `/dang-nhap/google#ma=…&cua_so=<id>`
 * rồi trao mã một lần cho trang mẹ qua `BroadcastChannel`, và tự đóng.
 *
 * `BroadcastChannel` chứ không `window.opener.postMessage`: đi qua trang của
 * Google là đi qua một nguồn khác, và trình duyệt được phép cắt `opener` ở lượt
 * ấy (COOP của chính Google) — quay về thì cửa sổ con không còn biết mẹ là ai.
 * Kênh này cùng nguồn nên MỌI tab của phần mềm đều nghe được; vì thế mỗi lượt
 * mang một `cuaSo` ngẫu nhiên do trang mẹ sinh, và trang mẹ chỉ nhận tin mang
 * đúng mã của mình. Mã một lần dùng được đúng một lần, nên tab nào lỡ nhặt
 * nhầm cũng chỉ làm hỏng lượt đăng nhập, không chiếm được phiên.
 */
export const KENH_GOOGLE = 'csbh:dang-nhap-google';
export const TEN_CUA_SO_GOOGLE = 'csbh-dang-nhap-google';

export type TinGoogle = { cuaSo: string; ma?: string; loi?: string };

/** Mã nhận diện một lượt — đúng hình dạng máy chủ nhận (`maCuaSo`). */
export function sinhMaCuaSo(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export const laTinGoogle = (v: unknown): v is TinGoogle =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as TinGoogle).cuaSo === 'string' &&
  (typeof (v as TinGoogle).ma === 'string' || typeof (v as TinGoogle).loi === 'string');
