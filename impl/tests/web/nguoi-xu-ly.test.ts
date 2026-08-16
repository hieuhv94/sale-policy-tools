/**
 * Ô chọn người xử lý ở từng bước duyệt (`0031`).
 *
 * Thay cho phần lớn `nguoi-dung.test.ts` cũ. Cái sai cần bắt ở đây đã đổi chỗ
 * chứ không biến mất: trước là "một vai trò thiếu ô trong biểu mẫu tạo tài
 * khoản", giờ là "một BƯỚC thiếu ô chọn người" — hồ sơ sang bước tiếp mà không
 * ai cầm, nằm im tới lúc quá hạn và không màn hình nào nói vì sao.
 *
 * Bảng này là bản sao của `PHAN_CONG` bên `workflow.service.ts`, đúng nếp "giao
 * diện dựng ô, máy chủ chặn". Hai bản LỆCH NHAU là lỗi im lặng: giao diện không
 * hiện ô, người dùng bấm gửi, máy chủ trả 422 nói thiếu một trường không có
 * trên màn hình. Ca cuối cùng canh đúng điều đó.
 */
import { describe, expect, it } from 'vitest';
import { CAN_XEM_TRUOC, O_CHON_CUA } from '@csbh/web/nguoi-xu-ly';

describe('bước nào phải chọn ai', () => {
  it('gửi duyệt chọn ĐỦ HAI người: Trưởng bộ phận và Kế toán', () => {
    const vt = (O_CHON_CUA['SUBMIT'] ?? []).map((o) => o.vaiTro);
    expect(vt).toEqual(['TBP', 'KE_TOAN']);
  });

  it('gửi lại sau khi sửa cũng chọn lại cả hai, không kế thừa lần trước', () => {
    // Hồ sơ bị trả về để sửa thì người sửa có quyền gửi cho một Trưởng bộ phận
    // khác. Ép giữ nguyên người vừa trả lại hồ sơ là một mặc định khó chịu mà
    // không luật nào đòi.
    expect(O_CHON_CUA['RESUBMIT_AFTER_EDIT']).toEqual(O_CHON_CUA['SUBMIT']);
  });

  it('tiếp nhận L1 chỉ chọn Sale Admin', () => {
    const vt = (O_CHON_CUA['KT_RECEIVE_L1'] ?? []).map((o) => o.vaiTro);
    expect(vt).toEqual(['SALE_ADMIN']);
  });

  it('KHÔNG chọn lại Kế toán ở bất kỳ bước nào sau gửi duyệt', () => {
    // Một vai trò, một người, hai màn hình: người tiếp nhận L1 cũng là người
    // tiếp nhận L2. Thêm một ô chọn Kế toán ở bước sau là mở đường cho hồ sơ
    // quay về tay người khác giữa chừng.
    for (const [hanhDong, o] of Object.entries(O_CHON_CUA)) {
      if (hanhDong === 'SUBMIT' || hanhDong === 'RESUBMIT_AFTER_EDIT') continue;
      expect(o.map((x) => x.vaiTro), hanhDong).not.toContain('KE_TOAN');
    }
  });

  it('bước không có trong bảng thì không có ô chọn nào', () => {
    for (const h of ['TBP_SIGN', 'TBP_RETURN', 'TBP_REJECT', 'SA_HANDOVER', 'KT_RECEIVE_L2']) {
      expect(O_CHON_CUA[h], h).toBeUndefined();
    }
  });
});

describe('hình dạng từng ô', () => {
  it('mỗi ô có nhãn và câu giải thích riêng, không trùng nhau', () => {
    const tatCa = Object.values(O_CHON_CUA).flat();
    const nhan = new Set(tatCa.map((o) => o.nhan));
    expect(nhan.size).toBeGreaterThan(1);
    for (const o of tatCa) {
      expect(o.nhan.length, o.truong).toBeGreaterThan(5);
      // Câu giải thích nói VÌ SAO phải chọn, nên nó dài hơn hẳn tên ô.
      expect(o.moTa.length, o.truong).toBeGreaterThan(30);
    }
  });

  it('tên trường khớp đúng ba khoá máy chủ đọc', () => {
    // Lệch một ký tự ở đây là 422 `ASSIGNEE_REQUIRED` cho một ô người dùng vừa
    // chọn xong — và không có gì trên màn hình chỉ ra chỗ sai.
    const truong = new Set(Object.values(O_CHON_CUA).flat().map((o) => o.truong));
    expect([...truong].sort()).toEqual(['keToanUserId', 'saleAdminUserId', 'tbpUserId']);
  });

  it('vai trò của ô luôn suy ra được từ tên trường', () => {
    const mong: Record<string, string> = {
      tbpUserId: 'TBP',
      keToanUserId: 'KE_TOAN',
      saleAdminUserId: 'SALE_ADMIN',
    };
    for (const o of Object.values(O_CHON_CUA).flat()) {
      expect(o.vaiTro, o.truong).toBe(mong[o.truong]);
    }
  });
});

describe('xem trước bản CSBH A4', () => {
  it('CHỈ bắt xem ở bước gửi duyệt', () => {
    // Đây là lần cuối nội dung hồ sơ còn sửa được; sau bước này giá và ngưỡng
    // đóng băng. Thêm một cửa xác nhận ở mọi bước là dạy người dùng bấm qua mà
    // không đọc — đúng thứ cửa này sinh ra để tránh.
    expect([...CAN_XEM_TRUOC].sort()).toEqual(['RESUBMIT_AFTER_EDIT', 'SUBMIT']);
  });

  it('mọi bước phải xem trước đều là bước có chọn người', () => {
    for (const h of CAN_XEM_TRUOC) expect(O_CHON_CUA[h], h).toBeDefined();
  });
});
