/**
 * Kiểm dữ liệu vào, đủ dùng và không kéo thêm phụ thuộc.
 *
 * class-validator là lựa chọn quen thuộc trong NestJS nhưng nó dựa vào metadata
 * của decorator, tức là buộc mọi service phải bật emitDecoratorMetadata cho DTO
 * và giữ đồng bộ giữa trình biên dịch của runtime và của test. Ở kích thước dữ
 * liệu vào của identity thì cái giá đó không đáng.
 */
import { BadRequestException } from '@nestjs/common';

export type Check<T> = { parse: (v: unknown, field: string) => T; optional?: true };

export const str = (min = 0, max = 4000): Check<string> => ({
  parse: (v, field) => {
    if (typeof v !== 'string') throw bad(field, 'phải là chuỗi');
    const t = v.trim();
    if (t.length < min) throw bad(field, `phải có tối thiểu ${min} ký tự`);
    if (t.length > max) throw bad(field, `dài quá ${max} ký tự`);
    return t;
  },
});

/** Mật khẩu KHÔNG cắt khoảng trắng — khoảng trắng đầu cuối là ký tự hợp lệ. */
export const secret = (min = 1, max = 200): Check<string> => ({
  parse: (v, field) => {
    if (typeof v !== 'string') throw bad(field, 'phải là chuỗi');
    if (v.length < min) throw bad(field, `phải có tối thiểu ${min} ký tự`);
    if (v.length > max) throw bad(field, `dài quá ${max} ký tự`);
    return v;
  },
});

export const email = (): Check<string> => ({
  parse: (v, field) => {
    const s = str(3, 254).parse(v, field);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad(field, 'không đúng định dạng email');
    return s.toLowerCase();
  },
});

export const int = (min: number, max: number): Check<number> => ({
  parse: (v, field) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
    if (!Number.isInteger(n)) throw bad(field, 'phải là số nguyên');
    if (n < min || n > max) throw bad(field, `phải nằm trong khoảng ${min}..${max}`);
    return n;
  },
});

/**
 * Tiền: số nguyên Việt Nam đồng, trả về `bigint`.
 *
 * Không dùng `number`: quá 2^53 là mất chữ số trong im lặng, và tiền là chỗ
 * không được phép sai một đồng nào (muc 7 YCNV).
 */
export const money = (): Check<bigint> => ({
  parse: (v, field) => {
    const t = typeof v === 'bigint' ? v.toString() : String(v ?? '').trim();
    if (!/^-?\d+$/.test(t)) throw bad(field, 'phải là số nguyên đồng, không có phần thập phân');
    const n = BigInt(t);
    if (n <= 0n) throw bad(field, 'phải lớn hơn 0');
    return n;
  },
});

/**
 * Tiền KHÔNG ÂM — cho phép số 0.
 *
 * Khác `money()` một chữ, và khác biệt đó là nghiệp vụ: giá bán phải lớn hơn 0
 * (bán không đồng là nhập sai), còn **công nợ bằng 0 là chuyện bình thường** —
 * khách hàng vừa thanh toán xong. Dùng `money()` cho công nợ thì không lập nổi
 * một khách hàng không nợ gì, và thông báo lỗi lại nói "phải lớn hơn 0" khiến
 * người nhập tưởng mình gõ thiếu.
 */
export const moneyKhongAm = (): Check<bigint> => ({
  parse: (v, field) => {
    const t = typeof v === 'bigint' ? v.toString() : String(v ?? '').trim();
    if (!/^\d+$/.test(t)) throw bad(field, 'phải là số nguyên đồng không âm');
    return BigInt(t);
  },
});

export const oneOf = <T extends string>(...vals: readonly T[]): Check<T> => ({
  parse: (v, field) => {
    if (typeof v !== 'string' || !vals.includes(v as T)) {
      throw bad(field, `phải là một trong: ${vals.join(', ')}`);
    }
    return v as T;
  },
});

export const opt = <T>(c: Check<T>): Check<T | undefined> => ({
  parse: (v, field) => (v === undefined || v === null || v === '' ? undefined : c.parse(v, field)),
});

type Shape = Record<string, Check<unknown>>;
type Out<S extends Shape> = { [K in keyof S]: S[K] extends Check<infer T> ? T : never };

export function validate<S extends Shape>(body: unknown, shape: S): Out<S> {
  if (typeof body !== 'object' || body === null) throw bad('body', 'phải là đối tượng JSON');
  const src = body as Record<string, unknown>;
  const out = {} as Record<string, unknown>;
  for (const [field, check] of Object.entries(shape)) out[field] = check.parse(src[field], field);
  return out as Out<S>;
}

const bad = (field: string, why: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', field, message: `${field}: ${why}` });
