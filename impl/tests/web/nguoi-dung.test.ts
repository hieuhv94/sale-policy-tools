/**
 * Biểu mẫu tạo người dùng — quét BẢNG TRA, không mở màn hình.
 *
 * Cái sai cần bắt ở đây là một ô vắng mặt: một vai trò thiếu trường cây thì tài
 * khoản tạo ra vẫn hợp lệ, vẫn đăng nhập được, mà nằm ngoài cây phân quyền —
 * không nhận được hồ sơ nào và không nhìn thấy hồ sơ nào. Không có lỗi nào đỏ
 * lên; chỉ có một người dùng ngồi trước màn hình trống.
 */
import { describe, expect, it } from 'vitest';
import { VAI_TRO, type VaiTro } from '@csbh/web/can';
import {
  NHAN_VAI_TRO,
  TRUONG_THEM,
  TRUONG_BAT_BUOC,
  VAI_TRO_CAP_TREN,
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
  approverUsername: null,
  approverName: null,
  parentUsername: null,
  ...p,
});

describe('ba bảng tra phủ đủ sáu vai trò', () => {
  it('không vai trò nào thiếu khoá', () => {
    for (const bang of [TRUONG_THEM, TRUONG_BAT_BUOC, VAI_TRO_CAP_TREN, NHAN_VAI_TRO]) {
      expect(Object.keys(bang).sort()).toEqual([...VAI_TRO].sort());
    }
  });

  it('mỗi vai trò có nhãn tiếng Việt riêng, không trùng nhau', () => {
    const nhan = VAI_TRO.map((v) => NHAN_VAI_TRO[v]);
    expect(new Set(nhan).size).toBe(VAI_TRO.length);
  });
});

describe('trường thêm đúng theo vai trò', () => {
  it('TDV có ô chọn Trưởng bộ phận quản lý', () => {
    expect(TRUONG_THEM.TDV).toContain('tbp-quan-ly');
  });

  it('CHỈ TDV có ô chọn Trưởng bộ phận quản lý', () => {
    // Máy chủ chặn vai trò khác ở `users.service.ts:resolveApprover`; giao diện
    // không được bày ra một ô mà bấm xong chắc chắn nhận 400.
    const co = VAI_TRO.filter((v) => TRUONG_THEM[v].includes('tbp-quan-ly'));
    expect(co).toEqual(['TDV']);
  });

  it('bốn vai trò ngoài cây dữ liệu không có trường cây nào', () => {
    // Trưởng bộ phận nằm ở đây từ 0017: TDV trỏ ngược lên họ, họ không trỏ đi đâu.
    for (const v of ['TBP', 'SALE_ADMIN', 'BAN_LANH_DAO', 'QUAN_TRI'] as VaiTro[]) {
      expect(TRUONG_THEM[v], v).toEqual([]);
    }
  });

  it('vai trò nào có ô "cấp trên" thì phải khai được cấp trên là ai', () => {
    // Bày ô chọn cấp trên mà không biết lọc theo vai trò nào thì danh sách đổ ra
    // cả sáu vai trò, và gán một TDV làm cấp trên của TDV khác là dựng sai cây.
    for (const v of VAI_TRO) {
      if (TRUONG_THEM[v].includes('cap-tren')) {
        expect(VAI_TRO_CAP_TREN[v], `${v} có ô cấp trên nhưng không khai cấp trên là vai trò nào`)
          .not.toBeNull();
      }
    }
  });

  it('chuỗi cấp trên đúng theo cây Sale Admin → kế toán → TDV', () => {
    expect(VAI_TRO_CAP_TREN.TDV).toBe('KE_TOAN');
    expect(VAI_TRO_CAP_TREN.KE_TOAN).toBe('SALE_ADMIN');
    // Trưởng bộ phận là nhánh riêng, độc lập với cây dữ liệu (muc 2.1).
    expect(VAI_TRO_CAP_TREN.TBP).toBeNull();
    expect(VAI_TRO_CAP_TREN.SALE_ADMIN).toBeNull();
  });
});

describe('trường bắt buộc', () => {
  it('TDV BẮT BUỘC có Trưởng bộ phận quản lý', () => {
    // Một TDV không có người duyệt là tài khoản chết: hồ sơ họ gửi không tới ai,
    // đứng im tới khi quá hạn. `users.service.ts` chặn ở máy chủ; bảng này là
    // bản sao ở giao diện để chặn TRƯỚC khi gửi đi.
    expect(TRUONG_BAT_BUOC.TDV).toContain('tbp-quan-ly');
  });

  it('trường bắt buộc luôn là tập con của trường có mặt', () => {
    // Đánh dấu bắt buộc một ô KHÔNG được vẽ ra là biểu mẫu không bao giờ gửi
    // được, mà không có gì trên màn hình chỉ ra thiếu cái gì.
    for (const v of VAI_TRO) {
      for (const t of TRUONG_BAT_BUOC[v]) {
        expect(TRUONG_THEM[v], `${v}: ${t} bắt buộc nhưng không có ô nào`).toContain(t);
      }
    }
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
