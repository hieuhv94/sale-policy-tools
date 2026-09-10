/**
 * "Mã hồ sơ này gõ được không" — hàm THUẦN, một bản duy nhất (`0198`).
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CÓ PHÉP KIỂM NÀY, VÀ VÌ SAO NÓ KHÔNG PHẢI CHUYỆN THẨM MỸ
 * ---------------------------------------------------------------------------
 *
 * Tới `0197` mã hồ sơ do `pol.next_policy_code()` sinh ra, nên mọi chỗ dùng nó
 * đều đứng trên một tiền đề không ai viết ra: *chuỗi này là máy sinh, hình dạng
 * biết trước*. `0198` cho TDV gõ, và tiền đề ấy mất.
 *
 * Chỗ nguy hiểm nhất đo được trước khi gõ, và nó là một LỖI CÓ SẴN chỉ chờ
 * đúng lượt này để thành khai thác được: `render.controller.ts` đặt
 *
 *     Content-Disposition: attachment; filename="${code}.pdf"
 *
 * — mã nhét THẲNG vào một chuỗi trong ngoặc kép, không thoát ký tự nào. Một dấu
 * `"` trong mã là thoát ra khỏi chuỗi ấy; một `\r\n` là chèn được cả một header
 * mới. Mã còn đi vào TÊN TỆP thật của bản mềm đã lưu (`${code} (giờ).pdf`), nơi
 * `/` và `\` cắt thành đường dẫn.
 *
 * Nên phép kiểm này là NỬA THỨ NHẤT của bản sửa; nửa thứ hai là thoát ký tự ở
 * chính chỗ đặt header (RFC 5987, đúng lối `files.controller` đã dùng). Hai nửa
 * đều cần: header phải đúng dù mã tới từ đâu, và mã phải sạch dù ai in nó.
 *
 * ---------------------------------------------------------------------------
 * DANH SÁCH CẤM, KHÔNG PHẢI DANH SÁCH CHO PHÉP
 * ---------------------------------------------------------------------------
 *
 * Khách hàng chốt 10/09: mã **tự do**, không ép khuôn `CSBH-YYYY-NNNNNN`. Ép
 * khuôn thì *"TDV có thể sửa"* thu lại còn đổi mỗi số thứ tự, và đó là một yêu
 * cầu khác. Nên ở đây chỉ cấm đúng những ký tự phá tên tệp và phá header —
 * không cấm chữ tiếng Việt, không cấm khoảng trắng giữa chuỗi.
 */

/**
 * Ký tự điều khiển (kể cả xuống dòng và tab) — chỗ chèn được một header mới.
 *
 * Viết bằng DÃY THOÁT, không dán ký tự thật vào mã nguồn: bản đầu của tệp này
 * có đúng ba ký tự điều khiển nằm trong dấu ngoặc vuông, và chúng VÔ HÌNH trong
 * trình soạn thảo — một lượt sửa vô ý nuốt mất một cái thì phép kiểm hụt đi một
 * lớp mà không ai đọc ra được từ mã nguồn.
 */
const DIEU_KHIEN = /[\u0000-\u001f\u007f]/;

/**
 * Ký tự phá tên tệp và phá `Content-Disposition`.
 *
 * `"` và `\` là hai ký tự có nghĩa trong một chuỗi trong ngoặc kép; sáu ký tự
 * còn lại (`/ : * ? < > |`) là tập Windows cấm trong tên tệp — bản mềm đã lưu
 * mang chính mã này làm tên, và người dùng tải nó về máy Windows.
 */
const CAM = /["\\/:*?<>|]/;

/** Dài nhất một mã được phép. Cột `text` nên trần là quyết định của phần mềm. */
export const DAI_TOI_DA_MA = 50;

export type LoiMa = 'RONG' | 'DAI' | 'KY_TU';

export const CAU_LOI_MA: Record<LoiMa, string> = {
  RONG: 'Mã hồ sơ không được để trống.',
  DAI: `Mã hồ sơ dài quá ${DAI_TOI_DA_MA} ký tự.`,
  // Nói ra ĐÚNG TẬP ký tự bị cấm, không nói "mã không hợp lệ": người dùng đang
  // nhìn một chuỗi mình vừa gõ và cần biết bỏ ký tự nào.
  KY_TU: 'Mã hồ sơ không được chứa xuống dòng hay các ký tự " \\ / : * ? < > |',
};

/**
 * Chuẩn hoá rồi kiểm. Trả `{ ma }` hoặc `{ loi }` — KHÔNG ném, để chỗ gọi quyết
 * định thành `400` hay thành một câu trên màn hình.
 *
 * CẮT KHOẢNG TRẮNG HAI ĐẦU và không làm gì thêm: viết hoa hộ hay bỏ dấu hộ là
 * đổi thứ người dùng vừa gõ mà không nói, và mã là thứ họ sẽ đối chiếu bằng mắt
 * với một tờ giấy.
 */
export function chuanHoaMa(raw: string): { ma: string } | { loi: LoiMa } {
  const ma = raw.trim();
  if (ma === '') return { loi: 'RONG' };
  if (ma.length > DAI_TOI_DA_MA) return { loi: 'DAI' };
  if (DIEU_KHIEN.test(ma) || CAM.test(ma)) return { loi: 'KY_TU' };
  return { ma };
}
