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
  VAI_TRO_CAP_TREN,
  boPhanCuaTbp,
  matKhauNgauNhien,
  trangThaiTaiKhoan,
  type BoPhanDto,
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
  departmentCode: null,
  departmentName: null,
  parentUsername: null,
  ...p,
});

describe('ba bảng tra phủ đủ sáu vai trò', () => {
  it('không vai trò nào thiếu khoá', () => {
    for (const bang of [TRUONG_THEM, VAI_TRO_CAP_TREN, NHAN_VAI_TRO]) {
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

  it('CHỈ Trưởng bộ phận có ô chọn bộ phận phụ trách', () => {
    const co = VAI_TRO.filter((v) => TRUONG_THEM[v].includes('bo-phan-phu-trach'));
    expect(co).toEqual(['TBP']);
  });

  it('chỉ TBP mới nhận ô bộ phận phụ trách vì chỉ TBP làm người duyệt được', () => {
    // Máy chủ chặn vai trò khác ở `departments.service.ts`; giao diện không được
    // bày ra một ô mà bấm xong chắc chắn nhận 400.
    expect(TRUONG_THEM.TDV).not.toContain('bo-phan-phu-trach');
    expect(TRUONG_THEM.KE_TOAN).not.toContain('bo-phan-phu-trach');
  });

  it('ba vai trò ngoài cây dữ liệu không có trường cây nào', () => {
    for (const v of ['SALE_ADMIN', 'BAN_LANH_DAO', 'QUAN_TRI'] as VaiTro[]) {
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

describe('suy bộ phận từ Trưởng bộ phận đã chọn', () => {
  const bp: BoPhanDto[] = [
    {
      id: 'b1',
      code: 'KDMB',
      name: 'Kinh doanh miền Bắc',
      approvers: [{ userId: 'tbp1', username: 'tbp01', fullName: 'A', isPrimary: true }],
    },
    { id: 'b2', code: 'KDMN', name: 'Kinh doanh miền Nam', approvers: [] },
  ];

  it('chọn một TBP thì ra đúng bộ phận người đó duyệt', () => {
    expect(boPhanCuaTbp(bp, 'tbp1')?.code).toBe('KDMB');
  });

  it('TBP chưa duyệt bộ phận nào thì KHÔNG suy ra bộ phận', () => {
    // Phải trả `undefined` chứ không rơi về bộ phận đầu danh sách: gán im lặng
    // một TDV vào bộ phận sai là hồ sơ chạy tới nhầm người duyệt.
    expect(boPhanCuaTbp(bp, 'tbp-chua-gan')).toBeUndefined();
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

describe('mật khẩu mặc định', () => {
  it('đủ dài theo yêu cầu của máy chủ', () => {
    // `users.service.ts` từ chối dưới 8 ký tự. Sinh ngắn hơn là biểu mẫu luôn
    // hỏng ở lần bấm đầu tiên.
    expect(matKhauNgauNhien().length).toBeGreaterThanOrEqual(8);
  });

  it('hai lần sinh không ra cùng một chuỗi', () => {
    expect(matKhauNgauNhien()).not.toBe(matKhauNgauNhien());
  });

  it('không chứa ký tự dễ đọc nhầm khi đọc qua điện thoại', () => {
    // Mật khẩu này được đọc miệng hoặc chép tay từ thư — `0/O` và `1/l/I` là chỗ
    // hỏng thường xuyên nhất.
    const ds = Array.from({ length: 40 }, () => matKhauNgauNhien()).join('');
    expect(ds).not.toMatch(/[0O1lI]/);
  });
});
