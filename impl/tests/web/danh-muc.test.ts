/**
 * Danh mục — phép quy đổi ngưỡng và các bảng tra.
 *
 * Ngưỡng chiết khấu lưu dưới dạng PHẦN VẠN (`int(0, 10_000)`, 10 000 = 100%) mà
 * người dùng nhập và đọc bằng phần trăm. Đây là loại lỗi tệ nhất trong cả hệ
 * thống: sai 100 lần thì không ai đọc ra ngay, và hậu quả là mọi dòng sản phẩm
 * đều bị đánh dấu vượt ngưỡng — hoặc không dòng nào bị đánh dấu cả.
 */
import { describe, expect, it } from 'vitest';
import { DIEU_HUONG, VAI_TRO, xem } from '@csbh/web/can';
import {
  LOAI_GIA,
  THE_SAN_PHAM,
  NHAN_LOAI_GIA,
  NHAN_TRANG_THAI_SAN_PHAM,
  TRANG_THAI_SAN_PHAM,
  nguongTuPhanTram,
  phamViChietKhau,
  phanTramTuNguong,
  tomTatLoaiKhach,
  type QuyDinhChietKhau,
} from '@csbh/web/danh-muc';

const qd = (p: Partial<QuyDinhChietKhau>): QuyDinhChietKhau => ({
  code: 'QD-1',
  productGroupCode: null,
  customerTypes: null,
  effectiveFrom: '2026-01-01',
  thresholdRate2: 2500,
  specificity: 0,
  ...p,
});

describe('quy đổi ngưỡng chiết khấu', () => {
  it('phần vạn ra phần trăm, hai chữ số thập phân', () => {
    // Dấu PHẨY thập phân theo quy ước tiếng Việt (FE-27) — ô nhập hiện đúng
    // thứ người dùng sẽ đọc trên giấy tờ.
    expect(phanTramTuNguong(2500)).toBe('25,00');
    expect(phanTramTuNguong(10_000)).toBe('100,00');
    expect(phanTramTuNguong(0)).toBe('0,00');
  });

  it('giữ được phần lẻ mà máy chủ lưu được', () => {
    // 2 rưỡi phần vạn = 0.25%. Làm tròn về số nguyên phần trăm ở đây là vứt đi
    // độ chính xác mà CSDL vẫn giữ.
    expect(phanTramTuNguong(25)).toBe('0,25');
    expect(phanTramTuNguong(1)).toBe('0,01');
  });

  it('phần trăm về phần vạn là số NGUYÊN', () => {
    // Máy chủ khai `int(0, 10_000)` — gửi số thập phân là 400 ngay.
    expect(nguongTuPhanTram('25')).toBe(2500);
    expect(nguongTuPhanTram('25.5')).toBe(2550);
    expect(Number.isInteger(nguongTuPhanTram('33.333'))).toBe(true);
  });

  it('đi một vòng rồi về vẫn ra đúng con số', () => {
    for (const n of [0, 1, 25, 2500, 9999, 10_000]) {
      expect(nguongTuPhanTram(phanTramTuNguong(n))).toBe(n);
    }
  });

  it('không sinh ra giá trị ngoài khoảng máy chủ nhận', () => {
    expect(nguongTuPhanTram('100')).toBeLessThanOrEqual(10_000);
    expect(nguongTuPhanTram('0')).toBeGreaterThanOrEqual(0);
  });
});

describe('câu mô tả phạm vi áp dụng', () => {
  it('bỏ trống đọc ra "mọi", không đọc ra ô rỗng', () => {
    expect(phamViChietKhau(qd({}))).toBe('mọi nhóm sản phẩm · mọi loại khách');
  });

  it('điền đủ thì nêu đủ HAI phần — và chỉ hai (0026)', () => {
    const s = phamViChietKhau(qd({ productGroupCode: 'SUA', customerTypes: [2] }));
    expect(s).toBe('nhóm SUA · khách loại 2');
  });

  it('nhiều loại đọc ra MỘT câu (`0280`): "khách loại 1 và 3"', () => {
    expect(phamViChietKhau(qd({ customerTypes: [1, 3] }))).toBe('mọi nhóm sản phẩm · khách loại 1 và 3');
    // Thứ tự lưu không quyết định thứ tự đọc.
    expect(tomTatLoaiKhach([3, 1])).toBe('khách loại 1 và 3');
  });

  it('rỗng và ĐỦ BA loại đều đọc là "mọi loại khách" — hai cách viết của cùng một câu', () => {
    expect(tomTatLoaiKhach([])).toBe('mọi loại khách');
    expect(tomTatLoaiKhach([1, 2, 3])).toBe('mọi loại khách');
    expect(tomTatLoaiKhach([3, 2, 1, 1])).toBe('mọi loại khách');
    expect(phamViChietKhau(qd({ customerTypes: [] }))).toContain('mọi loại khách');
  });

  it('một loại 0 KHÔNG bị nhầm thành "mọi loại"', () => {
    // Bẫy kinh điển của phép kiểm falsy. Máy chủ chỉ nhận 1–3, nhưng câu chữ phải
    // nói đúng thứ nó được đưa, không đoán hộ.
    expect(phamViChietKhau(qd({ customerTypes: [0] }))).toContain('khách loại 0');
  });
});

describe('các bảng tra cố định', () => {
  it('danh mục chỉ ĐẶT được một loại giá: Giá bán Công ty (CAT-03)', () => {
    // Giá bán lẻ niêm yết chính là Giá bán Công ty, nên chỉ còn đúng một. Giá
    // bán buôn không phải thuộc tính của sản phẩm — người đề nghị nhập nó trên
    // từng dòng của từng hồ sơ, khác nhau theo khách hàng (muc 6.1).
    expect([...LOAI_GIA]).toEqual(['GIA_BAN_CONG_TY']);

    // Bảng nhãn RỘNG HƠN danh sách đặt được, và đó là chủ ý: lịch sử giá có thể
    // còn dòng ghi trước lúc `GIA_BAN_BUON` rút khỏi danh mục, và bảng lịch sử
    // phải đọc ra chữ chứ không phải mã enum trần.
    for (const g of LOAI_GIA) expect(NHAN_LOAI_GIA[g]).toBeTruthy();
    expect(NHAN_LOAI_GIA['GIA_BAN_BUON']).toBeTruthy();
  });

  it('đúng hai trạng thái sản phẩm, đều có nhãn', () => {
    expect(Object.keys(NHAN_TRANG_THAI_SAN_PHAM).sort()).toEqual([...TRANG_THAI_SAN_PHAM].sort());
  });

  it('ba màn hình tách ra từ Danh mục, khai ở MỘT chỗ', () => {
    // `DIEU_HUONG` là nguồn duy nhất từ P22 — trước đó có thêm một bảng thẻ
    // riêng trong `lib/danh-muc.ts`, và hai bảng cùng khai một danh sách là hai
    // bảng sẽ lệch nhau.
    const duong = DIEU_HUONG.map((m) => m.duong);
    expect(duong).toContain('/san-pham');
    expect(duong).toContain('/chiet-khau');
    expect(duong).toContain('/van-ban-mau');
    expect(duong).not.toContain('/danh-muc');
  });

  it('`0060` Văn bản mẫu CHỈ Quản trị thấy, hai màn kia mọi vai trò', () => {
    // Bày một mục menu cho vai trò không làm được gì trong đó là bắt họ bấm vào
    // một màn hình trống mới hiểu ra.
    for (const v of VAI_TRO) {
      expect(xem(v, 'sanPham'), `${v} phải xem được Sản phẩm`).toBe(true);
      expect(xem(v, 'chietKhau'), `${v} phải xem được Chiết khấu`).toBe(true);
    }
    expect(VAI_TRO.filter((v) => xem(v, 'vanBanMau'))).toEqual(['QUAN_TRI']);
  });

  it('màn hình Sản phẩm có hai thẻ, Sản phẩm đứng trước', () => {
    // Thẻ Sản phẩm trước vì đó là việc hàng ngày; thêm nhóm là việc vài lần một
    // năm. Đây là dải thẻ TRONG một màn hình, không phải một tầng điều hướng —
    // nên nó không trùng `DIEU_HUONG` chỗ nào.
    expect(THE_SAN_PHAM.map((t) => t.khoa)).toEqual(['san-pham', 'nhom']);
  });

  it('nhóm sản phẩm KHÔNG có mục menu riêng', () => {
    // Nó là thẻ bên trong màn hình Sản phẩm. Có cả hai chỗ là hai đường tới cùng
    // một bảng, và người dùng không đoán được đường nào là đường đúng.
    expect(DIEU_HUONG.some((m) => m.duong.includes('nhom'))).toBe(false);
  });

  it('KHÔNG còn mục Người ký', () => {
    // Gỡ ở P20 vì yêu cầu nghiệp vụ chưa rõ. API bên máy chủ vẫn còn — test này
    // chỉ ghim rằng giao diện không bày nó ra nữa.
    expect(DIEU_HUONG.some((m) => m.nhan.includes('Người ký'))).toBe(false);
  });
});

/*
 * `locSanPham` và `locQuyDinh` ĐÃ BỊ GỠ ở `0049`, cùng với hai khối kiểm thử của
 * chúng.
 *
 * Cả hai lọc trên mảng ĐÃ TẢI VỀ, và màn hình chỉ tải 200 dòng đầu — nên vượt
 * 200 sản phẩm thì gõ tên một mặt hàng có thật vẫn ra "không tìm thấy", trái
 * muc 11.3 ("ô tìm kiếm tìm trên toàn bộ dữ liệu"). Việc lọc chuyển hẳn sang máy
 * chủ: `?q=` cho sản phẩm và người dùng, hai ô chọn cho chiết khấu.
 *
 * Chỗ kiểm thử mới:
 *   - `tests/http/catalog.test.ts` — tìm sản phẩm, lọc quy định chiết khấu.
 *   - `tests/http/onboarding.test.ts` — tìm người dùng theo họ tên.
 *   - `tests/db/constraints.test.ts` — phép bỏ dấu ở TypeScript và ở SQL cho
 *     cùng một kết quả. Đây là ca thay thế cho các ca "gõ không dấu vẫn ra chữ
 *     có dấu" ở đây: cùng một khẳng định, chỉ khác là giờ nó bảo vệ CẢ HAI bản
 *     cài đặt thay vì một.
 *
 * `khongDau` cũng gỡ theo: sau khi hai hàm lọc biến mất thì không chỗ nào ở giao
 * diện gọi nó nữa, và giữ lại một phép chuẩn hoá thứ ba — chạy ở trình duyệt,
 * không ai kiểm nó có khớp máy chủ hay không — chỉ tạo ra hai kết quả khác nhau
 * cho cùng một từ khoá.
 */

