/**
 * Bỏ dấu và hạ chữ thường tiếng Việt, để lọc "có chứa" không phân biệt hoa
 * thường lẫn có dấu / không dấu (RPT-05).
 *
 * VÌ SAO KHÔNG DÙNG EXTENSION `unaccent` CỦA POSTGRES. Hai lý do, lý do thứ hai
 * mới là lý do quyết định:
 *
 *   1. Nó là extension phải cài thêm, và bảng quy tắc mặc định của nó không phủ
 *      hết tiếng Việt.
 *   2. `unaccent` KHÔNG bỏ được dấu của chữ **đ**. "đ" không phải "d" cộng một
 *      dấu phụ — nó là một ký tự Unicode độc lập (U+0111), không phân rã được
 *      bằng NFD. Người gõ "Da Nang" sẽ không tìm ra "Đà Nẵng", và lỗi này im
 *      lặng: mọi tỉnh thành khác vẫn tìm được nên không ai nghi ngờ gì.
 *
 * Nên phép chuẩn hoá làm bằng tay ở đây, và làm ở ĐÚNG MỘT CHỖ: cột `*_norm`
 * lúc đồng bộ read-model và từ khoá lúc truy vấn đều đi qua hàm này. Hai bên
 * chuẩn hoá theo hai kiểu khác nhau là kiểu hỏng tệ nhất — tìm được vài chuỗi,
 * không tìm được vài chuỗi khác, không có thông báo lỗi nào.
 *
 * TỪ `0049` TỆP NÀY NẰM Ở `packages/`, không còn là mảnh riêng của reporting.
 * Ô tìm sản phẩm và ô tìm người dùng cũng cần đúng phép chuẩn hoá ấy, và chép
 * sang catalog với identity là dựng thêm hai bản sao chắc chắn sẽ trôi.
 *
 * BẢN SAO THỨ HAI vẫn tồn tại và không tránh được: `sys.khong_dau()` trong CSDL
 * (`0049`), vì cột sinh phải tính được bằng SQL. Hai bản buộc phải cho ra cùng
 * kết quả, và có một ca kiểm thử so chúng trên cùng một bộ chuỗi tiếng Việt —
 * xem `tests/db/constraints.test.ts`.
 */

/** Ký tự Unicode độc lập, không phân rã được bằng NFD. */
const STANDALONE: Record<string, string> = { đ: 'd', Đ: 'd' };

export function norm(s: string | null | undefined): string {
  if (!s) return '';
  let out = '';
  for (const ch of s) out += STANDALONE[ch] ?? ch;
  return out
    .normalize('NFD')
    // Dải U+0300–U+036F là toàn bộ dấu phụ tổ hợp — huyền, sắc, hỏi, ngã, nặng,
    // mũ, móc, trăng. Bỏ hết rồi mới hạ chữ thường.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chuẩn hoá cả một mảng, bỏ chuỗi rỗng. */
export const normAll = (xs: (string | null | undefined)[]): string[] =>
  xs.map(norm).filter((x) => x.length > 0);

/**
 * Bọc từ khoá thành mẫu `LIKE` cho phép lọc "có chứa".
 *
 * `%` và `_` trong từ khoá do người dùng gõ phải được thoát, nếu không gõ đúng
 * một dấu `%` là khớp toàn bộ bảng — không phải lỗ hổng, nhưng là kết quả sai
 * mà người dùng không hiểu vì sao.
 */
export const contains = (term: string): string =>
  `%${norm(term).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
