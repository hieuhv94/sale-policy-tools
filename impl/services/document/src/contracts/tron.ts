/**
 * Trộn dữ liệu hồ sơ vào bảng ánh xạ của một mẫu (`0055`).
 *
 * Tách khỏi `contracts.service` vì từ `0055` có HAI thứ dùng chung phép trộn
 * này: hợp đồng (mẫu của Sale Admin) và bản mềm CSBH (mẫu của Quản trị). Chép
 * vòng lặp sang chỗ thứ hai là chép luôn cả luật "thiếu trường bắt buộc thì
 * chặn" — và bản chép sẽ trôi khỏi bản gốc ở đúng lúc không ai để ý.
 */
import type { FieldRow } from './templates.service.js';
import type { CustomerFull, PolicyFull } from '../infra/clients.js';
import { applyFormat, isLineSource, lineValue, scalarValue } from './sources.js';

export type NguCanh = {
  policy: PolicyFull;
  customer: CustomerFull;
  people: Record<string, string>;
};

export type KetQuaTron = {
  values: Record<string, string>;
  lines: Record<string, string>[];
  linePlaceholders: Set<string>;
  /** Ô trống BẮT BUỘC mà dữ liệu nguồn đang rỗng. */
  missingRequired: { placeholder: string; source: string }[];
};

export function tron(fields: FieldRow[], ctx: NguCanh): KetQuaTron {
  const values: Record<string, string> = {};
  const missingRequired: { placeholder: string; source: string }[] = [];
  const lineFields: FieldRow[] = [];

  for (const f of fields) {
    if (isLineSource(f.source)) {
      lineFields.push(f);
      continue;
    }
    const raw = scalarValue(f.source, ctx);
    // Thiếu trường BẮT BUỘC thì người gọi chặn hẳn, không sinh file có ô trống
    // rỗng đưa cho khách hàng ký (DOC-13).
    if (f.required && (raw === null || raw === '')) {
      missingRequired.push({ placeholder: f.placeholder, source: f.source });
    }
    values[f.placeholder] = applyFormat(raw, f.format);
  }

  const lines = ctx.policy.lines.map((l, i) => {
    const row: Record<string, string> = {};
    for (const f of lineFields) row[f.placeholder] = applyFormat(lineValue(f.source, l, i), f.format);
    return row;
  });

  return {
    values,
    lines,
    linePlaceholders: new Set(lineFields.map((f) => f.placeholder)),
    missingRequired,
  };
}
