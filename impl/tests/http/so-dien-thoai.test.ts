/**
 * `0223` — HAI BẢN của luật *"số điện thoại đúng 10 chữ số"* trả lời như nhau.
 *
 * Tệp thuần, cùng lối `tinh-thanh.test.ts`. Bản gốc ở máy chủ
 * (`chuanSoDienThoai`) chốt lúc ghi; bản chép ở giao diện (`laSoDienThoai`) báo
 * đỏ dưới ô và làm xám nút Lưu. Hai bản lệch nhau là một trong hai chuyện: giao
 * diện cho gửi rồi máy chủ trả 400, hoặc giao diện chặn một số máy chủ nhận.
 */
import { describe, expect, it } from 'vitest';
import { chuanSoDienThoai } from '../../services/customer/src/customers/so-dien-thoai.js';
import { laSoDienThoai } from '../../apps/web/src/lib/danh-muc.js';

const CA: [string, string | null][] = [
  ['0912345678', '0912345678'],
  ['0912 345 678', '0912345678'],
  ['0912.345.678', '0912345678'],
  ['0912-345-678', '0912345678'],
  ['  0912345678 ', '0912345678'],
  ['091234567', null], // 9 chữ số
  ['09123456789', null], // 11 chữ số
  ['09123456a8', null],
  ['+84912345678', null], // dấu + không bỏ qua — mười một chữ số và một ký tự lạ
  ['', null],
  ['          ', null],
];

describe('`0223` luật số điện thoại', () => {
  it.each(CA)('%j → %j ở máy chủ', (vao, ra) => {
    expect(chuanSoDienThoai(vao)).toBe(ra);
  });

  it('giao diện trả lời CÙNG câu với máy chủ ở mọi ca', () => {
    for (const [vao, ra] of CA) {
      expect(laSoDienThoai(vao), JSON.stringify(vao)).toBe(ra !== null);
    }
  });
});
