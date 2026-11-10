/**
 * `0280` — phép chuẩn hoá tập loại khách của một quy định. Hàm thuần, không cần CSDL.
 */
import { describe, expect, it } from 'vitest';
import { CAC_LOAI_KHACH, chuanLoaiKhach, giaoNhau } from '../../services/catalog/src/rules/loai-khach.js';

describe('chuanLoaiKhach', () => {
  it('vắng, null, rỗng → null (mọi loại)', () => {
    expect(chuanLoaiKhach(undefined)).toBeNull();
    expect(chuanLoaiKhach(null)).toBeNull();
    expect(chuanLoaiKhach([])).toBeNull();
  });
  it('xếp tăng dần và bỏ lặp', () => {
    expect(chuanLoaiKhach([3, 1])).toEqual([1, 3]);
    expect(chuanLoaiKhach([2, 2, 2])).toEqual([2]);
    expect(chuanLoaiKhach([3, 1, 3, 1])).toEqual([1, 3]);
  });
  it('ĐỦ ba loại là "mọi loại", dù viết thứ tự nào hay lặp bao nhiêu lần', () => {
    expect(chuanLoaiKhach([1, 2, 3])).toBeNull();
    expect(chuanLoaiKhach([3, 2, 1, 1])).toBeNull();
  });
  it('không sửa mảng đầu vào', () => {
    const v = [3, 1];
    chuanLoaiKhach(v);
    expect(v).toEqual([3, 1]);
  });
  it('số loại của hệ thống là ba — thêm loại thứ tư phải đổi hằng, CHECK và chỉ mục cùng lúc', () => {
    expect(CAC_LOAI_KHACH).toEqual([1, 2, 3]);
  });
});

describe('giaoNhau', () => {
  it('null (mọi loại) giao với mọi tập', () => {
    expect(giaoNhau(null, [1])).toBe(true);
    expect(giaoNhau([2], null)).toBe(true);
    expect(giaoNhau(null, null)).toBe(true);
  });
  it('hai tập giao khi chung ít nhất một loại', () => {
    expect(giaoNhau([1, 3], [3])).toBe(true);
    expect(giaoNhau([1, 3], [2])).toBe(false);
    expect(giaoNhau([1], [2, 3])).toBe(false);
  });
});
