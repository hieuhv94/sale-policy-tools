/**
 * Trộn dữ liệu hồ sơ vào bảng ánh xạ của một mẫu (`0055`).
 *
 * Tách khỏi `contracts.service` vì từ `0055` có HAI thứ dùng chung phép trộn
 * này: hợp đồng và bản mềm CSBH — từ `0060` cả hai mẫu đều của Quản trị. Chép
 * vòng lặp sang chỗ thứ hai là chép luôn cả luật "thiếu trường bắt buộc thì
 * chặn" — và bản chép sẽ trôi khỏi bản gốc ở đúng lúc không ai để ý.
 */
import type { FieldRow } from './templates.service.js';
import type { CustomerFull, PolicyFull } from '../infra/clients.js';
import { applyFormat, dinhDangCua, scalarValue } from './sources.js';

export type NguCanh = {
  policy: PolicyFull;
  customer: CustomerFull;
  people: Record<string, string>;
};

export type KetQuaTron = {
  values: Record<string, string>;
};

/**
 * `0067` gỡ hai thứ khỏi hàm này, và cả hai đều là gỡ một câu hỏi sai.
 *
 * **Nhóm trường theo dòng** — dùng cho bảng vẽ tay trong mẫu hợp đồng. Từ `0067`
 * mẫu hợp đồng cũng đặt `{{bang_san_pham}}`, nên không còn dòng bảng nào để
 * nhân bản.
 *
 * **Cờ `required` theo từng ô trống** — nó chỉ đổi thời điểm báo lỗi: xuất được
 * hay không xuất được. Mà mục bắt buộc của muc 11.1 đã kiểm ở lúc LƯU MẪU rồi,
 * nên cờ này chỉ cho người soạn một cách tự chặn chính mình về sau, ở màn hình
 * của người khác.
 *
 * Định dạng cũng không đọc từ dòng ánh xạ nữa mà tra từ chính TRƯỜNG NGUỒN —
 * xem `dinhDangCua`.
 */
export function tron(fields: FieldRow[], ctx: NguCanh): KetQuaTron {
  const values: Record<string, string> = {};
  for (const f of fields) {
    values[f.placeholder] = applyFormat(scalarValue(f.source, ctx), dinhDangCua(f.source));
  }
  return { values };
}
