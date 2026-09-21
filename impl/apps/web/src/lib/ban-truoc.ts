/**
 * Ô "bản trước" của một dòng sản phẩm — phần THUẦN, không JSX (`0215`).
 *
 * Tách khỏi `BangSanPham.tsx` vì đúng một lý do, và nó là một chốt chặn chứ
 * không phải một lượt dọn: `O_BAN_TRUOC` phải khớp TỪNG KHOÁ với
 * `TRUONG_BAY_BAN_TRUOC` bên `policy`, mà `tests/http/` KHÔNG bật `jsx` nên nó
 * không import nổi một tệp `.tsx` để đối chiếu. Cùng đường `0172` đã đi với
 * `lib/bang-cot.ts`, và vì cùng một hình dạng lỗi: hai danh sách ở hai thế giới,
 * mỗi lượt sửa chạm một bên, và `tsc` không canh được gì vì cả hai là chuỗi.
 *
 * LƯỢT PHÁ LẠI CHỈ RA CHỖ NÀY. Thêm `'note'` trở lại `O_BAN_TRUOC` mà **cả 62 ca
 * giao diện vẫn xanh** — đúng thế, vì không ô nào của bảng gọi `<Dau o="note">`,
 * nên một khoá thừa ở đây là mã chết cho tới ngày ai đó đọc danh sách rồi tin
 * rằng ghi chú có mang dấu. Thứ bắt được nó phải là một phép ĐỐI CHIẾU với máy
 * chủ, không phải một lượt dựng DOM.
 */
import { ngay, ngayISO, tien, tyLe } from './format.js';
import { COT_TRUOC, COT_SAU } from './bang-cot.js';

/**
 * Khoá của những ô mang được dấu đã-đổi, đúng thứ tự cột (`0213`, `0215`).
 *
 * KHÔNG CÓ `note` từ `0215`, và đó là một luật nghiệp vụ chứ không phải một lượt
 * dọn giao diện: khách hàng chốt 21/09 rằng ghi chú **không phải trường để đánh
 * giá sản phẩm có bị chỉnh sửa không**. Máy chủ vì thế thôi gửi khoá ấy — xem
 * `TRUONG_BAY_BAN_TRUOC` bên `policy`.
 */
export const O_BAN_TRUOC = [
  'ngayApDung',
  'companyPrice',
  'wholesalePrice',
  'cpbh',
  'cpbhTotal',
  'netPrice',
  'discountRate',
  'threshold',
] as const;

export type OBanTruoc = (typeof O_BAN_TRUOC)[number];

/**
 * Ô mang MỘT con số — tức mọi ô trừ `cpbh`, thứ mang cả mảng khoản.
 *
 * Tách ra thành kiểu riêng vì nó là thứ cho phép `<Dau>` tự đọc giá trị mới từ
 * chính dòng (`d[o]`) thay vì nhận nó qua một prop: mọi khoá ở đây trùng tên với
 * một trường của `DongSanPham`. Truyền tay thì `<Dau o="netPrice" moi={d.discountRate}>`
 * dịch được, chạy được, và bày ra một con số cũ của ô bên cạnh.
 */
export type OSo = Exclude<OBanTruoc, 'cpbh'>;

/**
 * Dòng ở bản trước, kèm danh sách ô đã đổi (`0213`).
 *
 * `doi` đến TỪ MÁY CHỦ chứ không do giao diện so hai bên: phép so chạy trên kiểu
 * dữ liệu thật của Postgres (`IS DISTINCT FROM` trên `numeric`, `date`, `text[]`),
 * nên `615000` và `615000.00` là MỘT. So bằng chuỗi ở trình duyệt thì hai giá
 * trị ấy khác nhau, và ô bôi vàng nói dối ở đúng chỗ không ai kiểm lại được.
 */
export type BanTruocDong = {
  [K in OBanTruoc]?: string | string[] | null;
} & { doi?: string[] | null };

/**
 * Bản trước của một dòng, đọc AN TOÀN từ thân phản hồi (`0213`).
 *
 * Kiểm HÌNH DẠNG chứ không tin khai báo kiểu: `banTruoc` đến từ thân phản hồi,
 * và một khai báo TypeScript là LỜI HỨA chứ không phải phép kiểm (bẫy `0198`).
 * Máy chủ cũ hơn giao diện thì trường vắng mặt, và lúc ấy một lượt đọc `.doi`
 * ném ngay trong lượt dựng bảng — React tháo cả cây và trang hồ sơ trắng, vì
 * một thứ chỉ là phần trang trí của một ô.
 */
export const banTruocCua = (d: { banTruoc?: unknown }): BanTruocDong | null =>
  d.banTruoc !== null && typeof d.banTruoc === 'object' && !Array.isArray(d.banTruoc)
    ? (d.banTruoc as BanTruocDong)
    : null;

/** Những ô máy chủ báo là ĐÃ ĐỔI — rỗng nếu thân phản hồi không mang danh sách. */
export const oDaDoi = (b: BanTruocDong): string[] => (Array.isArray(b.doi) ? b.doi : []);

/**
 * TÊN Ô trong bảng chi tiết = TIÊU ĐỀ CỘT của chính bảng sản phẩm (`0204`).
 *
 * Không phải một danh sách nhãn thứ hai gõ tay: người dùng bấm vào nhãn *Chỉnh
 * sửa* rồi đọc một dòng tên trường, và mắt họ đang ở ngay cạnh hàng tiêu đề của
 * bảng. Hai chữ khác nhau cho cùng một ô — *"Giá bán Công ty"* ở trên và *"Giá
 * CT"* ở dưới — bắt người đọc tự ghép, đúng thứ `0172` đã đi sửa một lượt cho
 * hai bảng.
 *
 * Hai khoá lệch tên và cả hai đều có lý do: ô `cpbh` bày CẢ MẢNG còn cột bày
 * tổng của nó tên `cpbhTotal`; ô `threshold` là con số cột `ruleCode` bày ra từ
 * `0180` (mã quy định lui vào `title`).
 */
const COT_CUA_O: Record<OBanTruoc, string> = {
  ngayApDung: 'ngayApDung',
  companyPrice: 'companyPrice',
  wholesalePrice: 'wholesalePrice',
  cpbh: 'cpbhTotal',
  cpbhTotal: 'cpbhTotal',
  netPrice: 'netPrice',
  discountRate: 'discountRate',
  threshold: 'ruleCode',
};

export const nhanOBanTruoc = (o: OBanTruoc): string =>
  [...COT_TRUOC, ...COT_SAU].find((c) => c.khoa === COT_CUA_O[o])?.nhan ?? o;

/**
 * Đọc một giá trị của bảng chi tiết ra chữ.
 *
 * Máy chủ giữ nguyên văn con số nó đã đem so; cách đọc là việc của màn hình —
 * cùng phân công với `Lech.doc()` (`0050`).
 *
 * CPBH nối bằng dấu cộng chứ không cộng lại thành một số: hai mảng khác nhau vẫn
 * có thể cùng tổng (`[5000]` → `[3000, 2000]`), và khi ấy một ô *"CPBH 5.000"*
 * giấu mất đúng thứ vừa đổi.
 *
 * `—` cho giá trị trống, KHÔNG bỏ trống ô: một ô rỗng thì người đọc không phân
 * biệt được *"ghi chú vừa bị xoá"* với *"chỗ này chưa dựng xong"*.
 */
export const docOBanTruoc = (o: OBanTruoc, v: string | string[] | null | undefined): string => {
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.map((x) => tien(x)).join(' + ');
  if (v === null || v === undefined || v === '') return '—';
  if (o === 'ngayApDung') return ngay(v);
  if (o === 'discountRate' || o === 'threshold') return tyLe(v);
  return tien(v);
};

/**
 * CHIỀU của một thay đổi — `tang` khi giá trị MỚI lớn hơn (`0215`, chốt 21/09).
 *
 * *"Dấu tam giác màu xanh hướng lên nếu giá trị đó mới lớn hơn giá trị cũ, màu
 * đỏ hướng xuống nếu giá trị mới bé hơn"*.
 *
 * PHÉP SO NÀY KHÔNG TRẢ LỜI CÂU *"ô này có đổi không"* — câu ấy vẫn của MÁY CHỦ
 * (`oDaDoi`), và phải thế: máy chủ so trên kiểu dữ liệu thật của Postgres, nên
 * `615000` với `615000.00` là MỘT, còn hai chuỗi ấy ở trình duyệt thì khác nhau
 * (`0213`). Ở đây hai giá trị đã được máy chủ khẳng định là khác nhau, và việc
 * còn lại đúng là **xếp thứ tự hai con số** — một phép so trên `number`, không
 * trên chuỗi, nên nó không thể lỏng hơn phép so kia.
 *
 * `khac` là câu trả lời THẬT, không phải nhánh lỗi: một ô vừa có giá trị từ chỗ
 * trống (khoản CPBH mới, hoặc ngưỡng của dòng trước không có quy định nào phủ)
 * đã đổi mà không lớn hơn hay bé hơn cái gì cả. Bịa cho nó một chiều là nói một
 * câu sai ở đúng chỗ người duyệt đang đọc để quyết định.
 */
export type Chieu = 'tang' | 'giam' | 'khac';

const soDoc = (v: string | string[] | null | undefined): number | null => {
  if (v === null || v === undefined || v === '' || Array.isArray(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ngayDoc = (v: string | string[] | null | undefined): string | null =>
  Array.isArray(v) ? null : ngayISO(v);

const xep = <T extends string | number>(a: T | null, b: T | null): Chieu =>
  a === null || b === null || a === b ? 'khac' : a > b ? 'tang' : 'giam';

export const chieuDoi = (
  o: OBanTruoc,
  moi: string | string[] | null | undefined,
  cu: string | string[] | null | undefined,
): Chieu =>
  // NGÀY quy về `YYYY-MM-DD` giờ Việt Nam rồi mới so: hai vế tới đây dưới hai
  // hình khác nhau — xem `ngayISO`.
  o === 'ngayApDung' ? xep(ngayDoc(moi), ngayDoc(cu)) : xep(soDoc(moi), soDoc(cu));
