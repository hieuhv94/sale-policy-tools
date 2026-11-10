/**
 * `0205` — SÁU MƯƠI BA TỈNH, THÀNH PHỐ (khách hàng chốt 19/09).
 *
 * Tệp thuần: gọi `chuanTinhThanh()` và đối chiếu hai bảng, không dựng ứng dụng,
 * không chạm CSDL. Vế HTTP nằm ở `customer.test.ts`, cạnh hai ca `0175` về chính
 * hai ô địa chỉ đăng ký.
 *
 * Ba quyết định của khách hàng, mỗi cái có một ca canh ở đây:
 *
 *   1. danh sách **CŨ** — 63 đơn vị, vì phần mềm ghi địa chỉ theo giấy đăng ký
 *      kinh doanh, và tờ giấy trong tay khách hàng vẫn mang tên cũ;
 *   2. **TÊN NGẮN**, không mang tiền tố *Tỉnh* hay *Thành phố* — chuỗi này đi
 *      thẳng ra dòng địa chỉ trên bản CSBH đem ký;
 *      (Không gõ hai chữ in nghiêng ấy cạnh một dấu gạch chéo: dấu sao đứng
 *       trước dấu gạch chéo đóng luôn khối chú thích — bẫy `0177` đã ghi, và
 *       lượt viết đầu của chính tệp này đã dính.)
 *   3. **MÁY CHỦ CHỐT**, không chỉ ô chọn.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TINH_THANH,
  chuanTinhThanh,
} from '../../services/customer/src/customers/tinh-thanh.js';
import { TINH_THANH as TINH_THANH_WEB } from '../../apps/web/src/lib/danh-muc.js';

describe('`0205` bảng 63 tên', () => {
  it('đúng 63 mục, không trùng, không thừa khoảng trắng', () => {
    expect(TINH_THANH).toHaveLength(63);
    expect(new Set(TINH_THANH).size).toBe(63);
    for (const t of TINH_THANH) {
      expect(t, t).toBe(t.trim());
      expect(t, t).not.toBe('');
    }
  });

  it('KHÔNG mục nào mang tiền tố *Tỉnh*, *Thành phố* hay *TP*', () => {
    /*
     * Lối viết NGẮN là quyết định của khách hàng, và nó không tự canh được: thêm
     * `Thành phố Cần Thơ` vào bảng thì `tsc` im, ô chọn vẫn vẽ ra, và tờ CSBH
     * của riêng khách hàng ấy in ra một dòng địa chỉ khác kiểu mọi tờ còn lại.
     */
    /*
     * `[\s.]` chứ KHÔNG `\b` — bản đầu viết `\b` và lượt phá lại đi qua nó:
     * `\b` của JavaScript định nghĩa theo `\w`, tức `[A-Za-z0-9_]`, **kể cả
     * dưới cờ `u`**. Chữ `ố` không nằm trong tập ấy, nên giữa `ố` và dấu cách
     * không có ranh giới từ nào và `Thành phố Cần Thơ` lọt qua. Một phép kiểm
     * tiếng Việt viết bằng `\b` là một phép kiểm luôn xanh.
     */
    for (const t of TINH_THANH) {
      expect(t, t).not.toMatch(/^(Tỉnh|Thành phố|TP)[\s.]/u);
    }
  });

  it('có đủ năm thành phố trực thuộc trung ương', () => {
    // Nhóm dễ sót nhất khi gõ một danh sách 63 dòng: chúng không nằm liền nhau
    // mà rải khắp thứ tự A–Z, và mất một cái thì 62 mục còn lại vẫn trông đủ.
    for (const tp of ['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'Hồ Chí Minh', 'Cần Thơ']) {
      expect(TINH_THANH, tp).toContain(tp);
    }
  });

  it('mọi tên đã ở dạng NFC — ở CẢ HAI bản', () => {
    /*
     * ĐIỀU KIỆN để `chuanTinhThanh` làm đúng việc của nó, không phải một nhận
     * xét bên lề: hàm ấy tra bằng khoá NFC rồi trả về **bản của bảng**. Bảng mà
     * lưu dạng tổ hợp (NFD) thì nó trả về NFD, CSDL nhận NFD, còn ô chọn của
     * giao diện gửi lên bản NFC của chính nó — hai chuỗi hiện ra giống hệt nhau
     * trên màn hình và không bao giờ khớp nhau.
     *
     * Không ai gõ NFD có chủ ý; nó lọt vào qua một lượt chép dán hoặc một trình
     * soạn thảo trên macOS, và không công cụ nào trong repo đọc ra được.
     */
    for (const t of TINH_THANH) expect(t.normalize('NFC'), t).toBe(t);
    for (const t of TINH_THANH_WEB) expect(t.normalize('NFC'), t).toBe(t);
  });

  it('BẢNG CỦA GIAO DIỆN khớp bảng của máy chủ', () => {
    /*
     * Hai bản sao có chủ ý, cùng lối `DIEU_KHOAN_NO` của `0138`: giao diện phải
     * biết 63 tên trước khi người dùng chọn cái nào, vì nó VẼ ô chọn. Lệch một
     * mục là một tỉnh bày ra được mà máy chủ từ chối — hoặc ngược lại, một tỉnh
     * hợp lệ mà không ai chọn được.
     *
     * So cả THỨ TỰ (`toEqual` trên mảng), không chỉ tập hợp: thứ tự A–Z là thứ
     * mà phím tắt gõ-để-nhảy của `<select>` đi theo.
     */
    expect([...TINH_THANH_WEB]).toEqual([...TINH_THANH]);
  });
});

describe('`0205` `chuanTinhThanh` — chuẩn hoá ở đường VÀO', () => {
  it('tên đúng trả về chính nó', () => {
    expect(chuanTinhThanh('Hà Nội')).toBe('Hà Nội');
    expect(chuanTinhThanh('Bà Rịa - Vũng Tàu')).toBe('Bà Rịa - Vũng Tàu');
  });

  it('dạng TỔ HỢP (NFD) trả về bản của BẢNG, không trả lại chuỗi gửi lên', () => {
    /*
     * Ca đáng giá nhất của tệp: hai chuỗi dưới đây hiện ra **giống hệt nhau**
     * trên mọi màn hình, và `===` nói chúng khác.
     *
     * Một phép kiểm boolean (`laTinhThanh`) sẽ xanh ở đây rồi để service ghi
     * nguyên chuỗi NFD xuống CSDL — tức bảng khách hàng có hai dòng `Hà Nội`
     * khác byte, đúng cái lộn xộn mà cả chặng này dựng ra để dẹp. Nên hàm phải
     * TRẢ VỀ một giá trị, và ca kiểm phải hỏi nó trả về bản nào.
     */
    const nfd = 'Hà Nội'.normalize('NFD');
    expect(nfd).not.toBe('Hà Nội');
    const chuan = chuanTinhThanh(nfd);
    expect(chuan).toBe('Hà Nội');
    expect(TINH_THANH).toContain(chuan);
  });

  it('cắt khoảng trắng hai đầu', () => {
    expect(chuanTinhThanh('  Đà Nẵng  ')).toBe('Đà Nẵng');
  });

  it('lối viết CŨ và tên lạ đều trả `null`, không đoán gần đúng', () => {
    /*
     * `TP Hồ Chí Minh` là chuỗi mà bộ nạp demo dùng tới `0204`, và nó phải bị
     * từ chối chứ không được tự sửa thành `Hồ Chí Minh`: đoán hộ ở đây là ghi
     * vào CSDL một cái tên không ai gõ, và lượt đoán tiếp theo — với một chuỗi
     * mập mờ hơn — sẽ đoán sai mà không ai biết.
     */
    expect(chuanTinhThanh('TP Hồ Chí Minh')).toBeNull();
    expect(chuanTinhThanh('Thành phố Hà Nội')).toBeNull();
    expect(chuanTinhThanh('Ha Noi')).toBeNull();
    expect(chuanTinhThanh('hà nội')).toBeNull();
    expect(chuanTinhThanh('')).toBeNull();
    expect(chuanTinhThanh('   ')).toBeNull();
  });

  it('mã lỗi đã khai câu ở giao diện (`0088`)', () => {
    const loi = readFileSync('apps/web/src/lib/loi.ts', 'utf8');
    expect(loi).toContain('CUSTOMER_PROVINCE_UNKNOWN');
  });
});

describe('`0205` biểu mẫu khách hàng dùng Ô CHỌN, không phải ô gõ', () => {
  const nguon = () => readFileSync('apps/web/src/components/SuaKhachHang.tsx', 'utf8');

  it('ô Tỉnh/Thành phố là ô chọn có gõ (`ChonCoGo`) dựng TỪ bảng, không phải `<input>` tự do', () => {
    /*
     * Quét mã nguồn vì hai vế nằm ở hai thế giới: một ca dựng DOM đọc được rằng
     * màn hình có một `<select>`, nhưng nó không nói được rằng danh sách ấy đến
     * TỪ `TINH_THANH` — 63 mục gõ tay vào JSX cũng cho đúng một DOM như vậy, rồi
     * trôi khỏi bảng của máy chủ ở lượt sửa danh sách đầu tiên.
     */
    const s = nguon();
    const khoi = s.slice(s.indexOf('id="kh-tinh"'), s.indexOf('id="kh-so-nha"'));
    expect(khoi).not.toBe('');
    // `0280` — `<select>` thành `ChonCoGo`: gõ để tìm, nhưng vẫn là danh sách ĐÓNG.
    expect(khoi).toContain('<ChonCoGo');
    expect(khoi).not.toContain('<select');
    expect(khoi).not.toContain('<input');
    expect(khoi).toContain('dsTinhThanh');
    expect(s).toContain("TINH_THANH,");
  });

  it('KHÔNG có mục rỗng trong danh sách: ô trống là "chưa chọn", không phải một đáp án', () => {
    /*
     * `0205` đòi một `<option value="">` vì `<select>` không có nó thì tự chọn mục đầu — biểu mẫu
     * mới mở ra với *An Giang* điền sẵn. `ChonCoGo` không có hành vi ấy: giá trị rỗng hiện chữ
     * gợi ý và KHÔNG có `mucRong`, nên người dùng không bao giờ thấy "— Chọn —" như một dòng để
     * chọn. Phép canh đổi từ "có mục rỗng" sang "không tự điền".
     */
    const s = nguon();
    const khoi = s.slice(s.indexOf('id="kh-tinh"'), s.indexOf('id="kh-so-nha"'));
    expect(khoi).toContain('goiY=');
    expect(khoi).not.toContain('mucRong');
    expect(khoi).toContain('giaTri={g.province}');
  });
});
