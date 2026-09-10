/**
 * Giá trị header `Content-Disposition` cho một lượt tải tệp về (`0198`).
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO GOM RA ĐÂY
 * ---------------------------------------------------------------------------
 *
 * Ba đường tải trong `document` dựng header này, và tới `0197` chúng dựng theo
 * HAI cách khác nhau:
 *
 *   - `files.controller` — `filename*=UTF-8''${encodeURIComponent(...)}`, đúng
 *     RFC 5987, viết ra để tên tiếng Việt không hỏng.
 *   - `render.controller` và `contracts.controller` — `filename="${...}"`, nhét
 *     thẳng vào một chuỗi trong ngoặc kép.
 *
 * Hai cách ấy vô hại chừng nào tên tệp là máy sinh. `0198` cho TDV gõ MÃ HỒ SƠ,
 * mà cả hai chỗ kia đều dựng tên từ chính mã ấy — nên một dấu `"` thoát ra khỏi
 * chuỗi, và `\r\n` chèn được một header mới. Mã đã bị chặn ở `chuanHoaMa`, và
 * đây là lớp thứ hai: **header phải đúng dù tên tệp tới từ đâu**, kể cả từ dữ
 * liệu cũ lập trước `0198`, kể cả từ một trường khác về sau đi vào chỗ này.
 *
 * Một hàm, ba nơi gọi. Ba bản chép tay là ba chỗ sẽ lệch nhau, và lượt lệch đầu
 * tiên đã xảy ra rồi.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CÓ CẢ HAI DẠNG TÊN
 * ---------------------------------------------------------------------------
 *
 * `filename*` là dạng đúng nhưng trình duyệt rất cũ không đọc; `filename` là
 * dạng cũ, chỉ an toàn với ASCII. Phát cả hai là khuôn RFC 6266 khuyến nghị:
 * trình duyệt hiểu `filename*` thì dùng nó và bỏ qua cái kia.
 *
 * Bản ASCII **lọc chứ không thoát** — mọi ký tự ngoài tập an toàn thành `_`.
 * Thoát bằng `\"` thì vẫn phải tin người đọc header cài đặt đúng; lọc thì không
 * còn gì để hiểu sai.
 */

/** Ký tự giữ lại trong bản ASCII: chữ, số, và bốn dấu quen thuộc của tên tệp. */
const AN_TOAN = /[^A-Za-z0-9._-]+/g;

/** Tên rỗng sau khi lọc thì vẫn phải tải về được. */
const DU_PHONG = 'tai-ve';

export function tenTepTaiVe(ten: string): string {
  const asciiTho = ten.normalize('NFKD').replace(AN_TOAN, '_').replace(/^_+|_+$/g, '');
  const ascii = asciiTho === '' ? DU_PHONG : asciiTho;
  // `encodeURIComponent` không mã hoá `'`, `(`, `)`, `*` — bốn ký tự hợp lệ trong
  // `filename*` nên để nguyên được. Nó CÓ mã hoá `"`, khoảng trắng và mọi ký tự
  // điều khiển, tức đúng tập gây hại ở đây.
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(ten)}`;
}
