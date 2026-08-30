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
 * có trên màn hình.
 *
 * CA ĐỐI CHIẾU HAI BẢNG NẰM Ở `tests/http/pham-vi-ke-toan.test.ts` (`0143`) —
 * tệp này không import được mã của service. Docstring cũ ở đây nói *"ca cuối
 * cùng canh đúng điều đó"* suốt từ `0031`, và **ca ấy chưa bao giờ tồn tại**: ca
 * cuối so `CAN_XEM_TRUOC` với bảng ô chọn, không so hai bảng với nhau.
 *
 * `0141` đổi nó từ một BẢNG TRA thành một HÀM: bước nào hỏi ai phụ thuộc cả
 * trạng thái hồ sơ, không chỉ hành động.
 */
import { describe, expect, it } from 'vitest';
import { oChonCua } from '@csbh/web/nguoi-xu-ly';

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
    for (const h of ['TBP_SIGN', 'TBP_RETURN', 'SA_HANDOVER', 'KT_RECEIVE_L2']) {
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

describe('`0163` lượt gửi duyệt KHÔNG còn bản xem trước', () => {
  it('`RESUBMIT_AFTER_EDIT` vẫn không chọn lại ai — luật `0141` giữ nguyên', () => {
    /*
     * `CAN_XEM_TRUOC` đã gỡ cùng cơ chế đóng băng mẫu (`0163`): bản mềm là thao
     * tác in của Sale Admin ở bước B8, nên người gửi duyệt không chọn mẫu và
     * không có gì để xem trước.
     *
     * Hai ca cũ ở đây khẳng định đúng tập ấy. Chúng đi theo, nhưng luật `0141`
     * mà một trong hai ca đứng cạnh thì KHÔNG mất — nên nó ở lại, tách khỏi
     * chuyện xem trước.
     */
    expect(oChonCua('RESUBMIT_AFTER_EDIT')).toEqual([]);
  });
});

