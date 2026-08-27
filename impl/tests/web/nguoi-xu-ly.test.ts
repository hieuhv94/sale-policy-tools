/**
 * Ô chọn người xử lý ở từng bước duyệt (`0031`, `0141`).
 *
 * Thay cho phần lớn `nguoi-dung.test.ts` cũ. Cái sai cần bắt ở đây đã đổi chỗ
 * chứ không biến mất: trước là "một vai trò thiếu ô trong biểu mẫu tạo tài
 * khoản", giờ là "một BƯỚC thiếu ô chọn người" — hồ sơ sang bước tiếp mà không
 * ai cầm, nằm im tới lúc quá hạn và không màn hình nào nói vì sao.
 *
 * `oChonCua` là bản sao của `phanCongCua` bên `workflow.service.ts`, đúng nếp
 * "giao diện dựng ô, máy chủ chặn". Hai bản LỆCH NHAU là lỗi im lặng: giao diện
 * không hiện ô, người dùng bấm gửi, máy chủ trả 422 nói thiếu một trường không
 * có trên màn hình. Ca cuối cùng canh đúng điều đó.
 *
 * `0141` đổi nó từ một BẢNG TRA thành một HÀM: bước nào hỏi ai phụ thuộc cả
 * trạng thái hồ sơ, không chỉ hành động.
 */
import { describe, expect, it } from 'vitest';
import { CAN_XEM_TRUOC, oChonCua } from '@csbh/web/nguoi-xu-ly';

/** Mọi tổ hợp (hành động × trạng thái hồ sơ) mà hàm trả về ô nào đó. */
const MOI_O = [
  ...oChonCua('SUBMIT'),
  ...oChonCua('KT_RECEIVE_L1', { daChonSaleAdmin: false }),
];

describe('bước nào phải chọn ai', () => {
  it('gửi duyệt chọn ĐỦ HAI người: Trưởng bộ phận và Kế toán', () => {
    expect(oChonCua('SUBMIT').map((o) => o.vaiTro)).toEqual(['TBP', 'KE_TOAN']);
  });

  it('`0141` GỬI LẠI sau khi sửa KHÔNG chọn lại ai', () => {
    /*
     * Đảo lại quyết định của `0031`. Chú thích cũ bênh việc chọn lại — *"người
     * sửa có quyền gửi cho một Trưởng bộ phận khác"* — nhưng cái giá lớn hơn cái
     * tiện: id người vừa trả hồ sơ về bị GHI ĐÈ khỏi cột `tbp_user_id`, mà phạm
     * vi đọc tính theo đúng bốn cột ấy. Họ mất quyền mở chính hồ sơ mình vừa trả
     * lại — trong khi vẫn nhận thư báo, vì thư đọc từ nhật ký chứ không từ bốn
     * cột. Bấm vào liên kết trong thư thì nhận 403.
     */
    expect(oChonCua('RESUBMIT_AFTER_EDIT')).toEqual([]);
    expect(oChonCua('RESUBMIT_AFTER_EDIT', { daChonSaleAdmin: true })).toEqual([]);
  });

  it('`0141` tiếp nhận L1 chỉ hỏi Sale Admin ở lượt ĐẦU', () => {
    /*
     * Hồ sơ đi vòng thứ hai — bị trả về, sửa, gửi lại, ký lại, tiếp nhận lại —
     * thì Sale Admin đã có. Hỏi lại là mời chọn khác đi, tức đẩy hồ sơ sang một
     * người chưa từng thấy nó.
     */
    expect(oChonCua('KT_RECEIVE_L1', { daChonSaleAdmin: false }).map((o) => o.vaiTro)).toEqual([
      'SALE_ADMIN',
    ]);
    expect(oChonCua('KT_RECEIVE_L1', { daChonSaleAdmin: true })).toEqual([]);
  });

  it('KHÔNG hỏi được KHÔNG BIẾT: thiếu cờ thì hỏi thừa, không bỏ sót', () => {
    /*
     * Giá trị lùi chọn phía AN TOÀN. Máy chủ cũ hơn giao diện không gửi cờ, và
     * bỏ qua một ô bắt buộc thì người dùng bấm xong mới nhận `ASSIGNEE_REQUIRED`
     * cho một trường không có trên màn hình; hỏi thừa một ô thì máy chủ chỉ việc
     * bỏ qua giá trị ấy.
     */
    expect(oChonCua('KT_RECEIVE_L1').map((o) => o.vaiTro)).toEqual(['SALE_ADMIN']);
  });

  it('KHÔNG chọn lại Kế toán ở bất kỳ bước nào sau gửi duyệt', () => {
    // Một vai trò, một người, hai màn hình: người tiếp nhận L1 cũng là người
    // tiếp nhận L2. Thêm một ô chọn Kế toán ở bước sau là mở đường cho hồ sơ
    // quay về tay người khác giữa chừng.
    for (const h of ['KT_RECEIVE_L1', 'KT_RECEIVE_L2', 'SA_HANDOVER', 'TBP_SIGN']) {
      for (const daChon of [true, false]) {
        expect(
          oChonCua(h, { daChonSaleAdmin: daChon }).map((x) => x.vaiTro),
          `${h} · ${daChon}`,
        ).not.toContain('KE_TOAN');
      }
    }
  });

  it('bước không sinh ra việc cho ai thì không có ô chọn nào', () => {
    for (const h of ['TBP_SIGN', 'TBP_RETURN', 'TBP_REJECT', 'SA_HANDOVER', 'KT_RECEIVE_L2']) {
      expect(oChonCua(h, { daChonSaleAdmin: false }), h).toEqual([]);
    }
  });
});

describe('hình dạng từng ô', () => {
  it('mỗi ô có nhãn và câu giải thích riêng, không trùng nhau', () => {
    const nhan = new Set(MOI_O.map((o) => o.nhan));
    expect(nhan.size).toBe(MOI_O.length);
    for (const o of MOI_O) {
      expect(o.nhan.length, o.truong).toBeGreaterThan(5);
      // Câu giải thích nói VÌ SAO phải chọn, nên nó dài hơn hẳn tên ô.
      expect(o.moTa.length, o.truong).toBeGreaterThan(30);
    }
  });

  it('tên trường khớp đúng ba khoá máy chủ đọc', () => {
    // Lệch một ký tự ở đây là 422 `ASSIGNEE_REQUIRED` cho một ô người dùng vừa
    // chọn xong — và không có gì trên màn hình chỉ ra chỗ sai.
    const truong = new Set(MOI_O.map((o) => o.truong));
    expect([...truong].sort()).toEqual(['keToanUserId', 'saleAdminUserId', 'tbpUserId']);
  });

  it('vai trò của ô luôn suy ra được từ tên trường', () => {
    const mong: Record<string, string> = {
      tbpUserId: 'TBP',
      keToanUserId: 'KE_TOAN',
      saleAdminUserId: 'SALE_ADMIN',
    };
    for (const o of MOI_O) expect(o.vaiTro, o.truong).toBe(mong[o.truong]);
  });
});

describe('xem trước bản CSBH A4', () => {
  it('CHỈ bắt xem ở bước gửi duyệt', () => {
    // Đây là lần cuối nội dung hồ sơ còn sửa được; sau bước này giá và ngưỡng
    // đóng băng. Thêm một cửa xác nhận ở mọi bước là dạy người dùng bấm qua mà
    // không đọc — đúng thứ cửa này sinh ra để tránh.
    expect([...CAN_XEM_TRUOC].sort()).toEqual(['RESUBMIT_AFTER_EDIT', 'SUBMIT']);
  });

  it('`0141` GỬI LẠI vẫn phải xem trước, dù thôi chọn người', () => {
    /*
     * Hai luật độc lập, và lượt này tách chúng ra: *chọn người* chỉ ở lượt gửi
     * ĐẦU, còn *đọc lại bản mềm* ở CẢ HAI lượt gửi — vì lượt gửi lại cũng là một
     * lượt đóng băng giá và ngưỡng, và nội dung vừa bị sửa.
     *
     * Gộp hai luật lại thì hộp gửi lại thành một cái nút trống không: không ô
     * nào để điền, và bản mềm cũng biến mất.
     */
    expect(CAN_XEM_TRUOC.has('RESUBMIT_AFTER_EDIT')).toBe(true);
    expect(oChonCua('RESUBMIT_AFTER_EDIT')).toEqual([]);
  });
});
