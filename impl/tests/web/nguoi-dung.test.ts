/**
 * Màn hình Người dùng — quét BẢNG TRA, không mở màn hình.
 *
 * TỆP NÀY TỪNG DÀI HƠN NHIỀU. Nó quét bốn bảng tra dựng ô "Trưởng bộ phận quản
 * lý" và "Cấp trên" theo vai trò đang tạo, và cái sai nó canh là một ô VẮNG MẶT:
 * một vai trò thiếu trường cây thì tài khoản tạo ra vẫn hợp lệ, vẫn đăng nhập
 * được, mà nằm ngoài cây phân quyền — không nhận hồ sơ nào và không thấy hồ sơ
 * nào, không có lỗi nào đỏ lên.
 *
 * `0031` bỏ hẳn quan hệ quản lý giữa người dùng, nên cả bốn bảng biến mất và cái
 * sai kia không còn tồn tại được: biểu mẫu tạo tài khoản chỉ còn bốn ô, giống
 * nhau cho cả sáu vai trò, và không có nhánh nào để quên.
 *
 * Việc chọn người xử lý chuyển sang từng hồ sơ — quét ở `nguoi-xu-ly.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { VAI_TRO } from '@csbh/web/can';
import {
  NHAN_VAI_TRO,
  trangThaiTaiKhoan,
  type NguoiDungDto,
} from '@csbh/web/nguoi-dung';

const nguoi = (p: Partial<NguoiDungDto>): NguoiDungDto => ({
  id: 'u1',
  username: 'x',
  email: 'x@csbh.test',
  fullName: 'X',
  role: 'TDV',
  isActive: true,
  activatedAt: '2026-08-01T00:00:00Z',
  ...p,
});

describe('nhãn vai trò', () => {
  it('mỗi vai trò có nhãn tiếng Việt riêng, không trùng nhau', () => {
    const nhan = VAI_TRO.map((v) => NHAN_VAI_TRO[v]);
    expect(new Set(nhan).size).toBe(VAI_TRO.length);
    for (const n of nhan) expect(n.length).toBeGreaterThan(3);
  });

  it('phủ đủ sáu vai trò, không thiếu khoá nào', () => {
    for (const v of VAI_TRO) expect(NHAN_VAI_TRO[v], v).toBeTruthy();
  });
});

describe('trạng thái tài khoản', () => {
  it('ba trạng thái phân biệt được nhau', () => {
    expect(trangThaiTaiKhoan(nguoi({ isActive: false }))).toBe('Đã vô hiệu hoá');
    expect(trangThaiTaiKhoan(nguoi({ activatedAt: null }))).toBe('Chờ kích hoạt');
    expect(trangThaiTaiKhoan(nguoi({}))).toBe('Đang hoạt động');
  });

  it('vô hiệu hoá thắng chờ kích hoạt', () => {
    // Một tài khoản vừa chưa kích hoạt vừa bị vô hiệu hoá thì việc cần làm là
    // bật lại, không phải gửi lại thư mời.
    expect(trangThaiTaiKhoan(nguoi({ isActive: false, activatedAt: null }))).toBe('Đã vô hiệu hoá');
  });
});
