/**
 * CCCD / Mã số thuế. Đúng 10 hoặc 13 chữ số — 13 là mã đơn vị phụ thuộc, và
 * CCCD Việt Nam cũng 12 chữ số nên tập hợp lệ là {10, 12, 13} (CUST-04).
 */
import { BadRequestException } from '@nestjs/common';
import type { Check } from '@csbh/http-kit';

const ALLOWED = [10, 12, 13];

export const taxId = (): Check<string> => ({
  parse: (v, field) => {
    const s = String(v ?? '').trim();
    if (!/^\d+$/.test(s) || !ALLOWED.includes(s.length)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field,
        message: `${field}: CCCD/MST phải gồm ${ALLOWED.join(', ')} chữ số, đang có ${s.length}`,
      });
    }
    return s;
  },
});
