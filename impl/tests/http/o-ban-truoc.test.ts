/**
 * `0214`/`0215` — HAI DANH SÁCH Ô CỦA DÒNG SẢN PHẨM, và ba thứ giữ chúng thẳng.
 *
 * TỆP THUẦN: đọc mấy bảng hằng, không dựng ứng dụng, không chạm CSDL — cùng lối
 * `tieu-de-cot.test.ts` (`0172`). Bốn ca này sống trong `policy.test.ts` tới
 * `0215`, và dời ra vì chúng KHÔNG cần Postgres: ở đó chúng chỉ chạy được cùng
 * cả bộ, trong khi thứ chúng canh là một phép so hằng số mà ai cũng nên chạy
 * được trong ba giây.
 *
 * Ba danh sách, ba câu hỏi khác nhau:
 *
 *   * `TRUONG_SO_VOI_BAN_TRUOC` — dòng này có mang nhãn *Chỉnh sửa* không;
 *   * `TRUONG_BAY_BAN_TRUOC`    — ô nào mang được dấu tam giác, và giá trị cũ
 *                                 của nó là gì;
 *   * `O_BAN_TRUOC` (giao diện) — cùng câu hỏi thứ hai, ở phía bên kia dây.
 */
import { describe, expect, it } from 'vitest';
import { TRUONG_SO_VOI_BAN_TRUOC, TRUONG_BAY_BAN_TRUOC } from '@csbh/policy/testing';
// `0215` — danh sách ô bên GIAO DIỆN. Import được vì `lib/ban-truoc.ts` là tệp
// thuần, không `jsx` (cùng lý do `0172` dời `bang-cot.ts` ra khỏi component).
import { O_BAN_TRUOC } from '@csbh/web/ban-truoc';


/**
 * `0214` — HAI DANH SÁCH TRƯỜNG, và chúng KHÔNG được lẫn vào nhau.
 *
 * `TRUONG_SO_VOI_BAN_TRUOC` quyết định NHÃN *Chỉnh sửa* — đúng những trường TDV
 * gõ mà rồi sẽ đi ra tờ giấy. `TRUONG_BAY_BAN_TRUOC` là thứ mang được DẤU TAM
 * GIÁC trên hàng (`0215`; tới `0214` là hàng *bản trước*), rộng hơn vì nó thêm
 * bốn con số dẫn xuất.
 *
 * CHỐT CHẶN NÀY CÓ VÌ TÔI ĐÃ CHÈN NHẦM. Lượt thêm `cpbhTotal` của `0214` trúng
 * danh sách ĐẦU TIÊN, vì hai danh sách có chung một dòng `{ khoa: 'cpbh', … }`
 * và phép thay chuỗi dừng ở lần khớp đầu. Nó **không làm ca kiểm nhãn nào đỏ** —
 * tổng đổi thì mảng cũng đổi, nên tập dòng mang nhãn *Chỉnh sửa* không đổi một
 * dòng nào. Thứ bắt được là ca ghim tập khoá của `banTruoc`, ở tận lượt chạy cả
 * bộ, sau khi mọi ca giao diện đã xanh.
 *
 * Ghim CẢ HAI tập bằng `toEqual` nên lượt thêm trường sau này buộc phải nói rõ
 * nó thuộc danh sách nào.
 */
describe('`0214` hai danh sách trường của dòng sản phẩm', () => {
  it('tập quyết định NHÃN là đúng bốn trường khách hàng đã chốt', () => {
    /*
     * Con số này CHỈ ĐỔI khi khách hàng chốt: `0180` dựng bốn trường, `0202`
     * thêm *Giá bán Công ty* và ghi rõ **ngưỡng vẫn đứng ngoài**, `0215` gỡ
     * *ghi chú* ra. Thêm một trường dẫn xuất vào đây là đổi ý nghĩa của nhãn
     * *Chỉnh sửa* mà không ai yêu cầu.
     *
     * Bốn trường còn lại đều đi vào TỜ GIẤY khách hàng ký — đó là cái phân biệt
     * chúng với ghi chú, thứ chỉ là lời nhắn của người lập cho người duyệt.
     */
    expect(TRUONG_SO_VOI_BAN_TRUOC.map((t) => t.khoa)).toEqual([
      'companyPrice',
      'wholesalePrice',
      'cpbh',
      'ngayApDung',
    ]);
  });

  it('tập BÀY RA rộng hơn, và CHỨA TRỌN tập kia', () => {
    /*
     * Vế thứ hai là bất biến thật: thiếu một trường của tập nhãn thì có dòng
     * mang nhãn *Chỉnh sửa* mà mở ra không ô nào vàng — người dùng bấm vào và
     * không hiểu vì sao hệ thống bảo dòng ấy đã đổi.
     */
    const bay = TRUONG_BAY_BAN_TRUOC.map((t) => t.khoa);
    expect(bay).toEqual([
      'ngayApDung',
      'companyPrice',
      'wholesalePrice',
      'cpbh',
      'cpbhTotal',
      'netPrice',
      'discountRate',
      'threshold',
    ]);
    for (const t of TRUONG_SO_VOI_BAN_TRUOC) {
      expect(bay, `${t.khoa} quyết định nhãn mà không bày ra`).toContain(t.khoa);
    }
  });

  it('`0215` GIAO DIỆN và MÁY CHỦ kể ĐÚNG MỘT danh sách ô', () => {
    /*
     * CA NÀY CÓ VÌ MỘT LƯỢT PHÁ LẠI XANH. Thêm `'note'` trở lại `O_BAN_TRUOC`
     * bên giao diện mà **cả 62 ca giao diện vẫn xanh** — đúng thế, vì không ô
     * nào của bảng gọi `<Dau o="note">`, nên khoá thừa ấy là mã chết cho tới
     * ngày ai đó đọc danh sách rồi tin rằng ghi chú có mang dấu.
     *
     * HAI DANH SÁCH Ở HAI THẾ GIỚI, đúng hình dạng lỗi mà `0172` đã phải dựng
     * một ca đối chiếu để chặn: mỗi lượt sửa chạm một bên, `tsc` không canh được
     * gì vì cả hai là mảng chuỗi, và chỗ hỏng chỉ lộ ra trên màn hình người
     * dùng. Đối chiếu chứ KHÔNG gộp — gói giao diện có trần 250KB (`FE-38`), kéo
     * mã service vào đó là cái giá `0172` đã từ chối trả.
     *
     * `toEqual` chứ không `toContain`: THỨ TỰ cũng phải khớp, vì cả hai danh
     * sách đều khai mình xếp theo thứ tự cột của bảng sản phẩm.
     */
    expect([...O_BAN_TRUOC]).toEqual(TRUONG_BAY_BAN_TRUOC.map((t) => t.khoa));
  });

  it('mỗi khoá trỏ tới ĐÚNG MỘT cột, và không cột nào bị trỏ hai lần', () => {
    // Hai khoá cùng trỏ một cột thì hàng *bản trước* bày một con số hai lần và
    // hai ô ấy luôn cùng vàng hoặc cùng không — một ô thừa, không ai phát hiện.
    const cot = TRUONG_BAY_BAN_TRUOC.map((t) => t.cot);
    expect(new Set(cot).size, `cột trùng: ${cot.join(', ')}`).toBe(cot.length);
  });
});
