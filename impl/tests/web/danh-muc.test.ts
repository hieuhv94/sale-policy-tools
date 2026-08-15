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
  LOAI_TRA_CUU,
  locSanPham,
  NHAN_LOAI_GIA,
  NHAN_TRA_CUU,
  NHAN_TRANG_THAI_SAN_PHAM,
  TRANG_THAI_SAN_PHAM,
  locQuyDinh,
  nguongTuPhanTram,
  phamViChietKhau,
  phanTramTuNguong,
  type QuyDinhChietKhau,
} from '@csbh/web/danh-muc';

const qd = (p: Partial<QuyDinhChietKhau>): QuyDinhChietKhau => ({
  id: 'q1',
  productGroupCode: null,
  customerType: null,
  channelCode: null,
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

  it('điền đủ thì nêu đủ ba phần', () => {
    const s = phamViChietKhau(qd({ productGroupCode: 'SUA', customerType: 2, channelCode: 'BV' }));
    expect(s).toContain('nhóm SUA');
    expect(s).toContain('khách loại 2');
    expect(s).toContain('kênh BV');
  });

  it('loại khách 0 KHÔNG bị nhầm thành "mọi loại"', () => {
    // Bẫy kinh điển: `q.customerType ? ... : 'mọi loại'` cho ra "mọi loại" khi
    // giá trị là 0. Máy chủ chỉ nhận 1–3 nên 0 không hợp lệ, nhưng phép kiểm
    // phải là `=== null` chứ không phải kiểm giá trị falsy.
    expect(phamViChietKhau(qd({ customerType: 0 }))).toContain('khách loại 0');
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

  it('ba loại tra cứu khớp LOOKUP_KINDS của máy chủ', () => {
    expect([...LOAI_TRA_CUU]).toEqual(['province', 'hospital', 'channel']);
    expect(Object.keys(NHAN_TRA_CUU).sort()).toEqual([...LOAI_TRA_CUU].sort());
  });

  it('ba màn hình tách ra từ Danh mục, khai ở MỘT chỗ', () => {
    // `DIEU_HUONG` là nguồn duy nhất từ P22 — trước đó có thêm một bảng thẻ
    // riêng trong `lib/danh-muc.ts`, và hai bảng cùng khai một danh sách là hai
    // bảng sẽ lệch nhau.
    const duong = DIEU_HUONG.map((m) => m.duong);
    expect(duong).toContain('/san-pham');
    expect(duong).toContain('/chiet-khau');
    expect(duong).toContain('/giay-to-mau');
    expect(duong).not.toContain('/danh-muc');
  });

  it('Giấy tờ mẫu CHỈ Quản trị thấy, hai màn kia mọi vai trò', () => {
    // Bày một mục menu cho vai trò không làm được gì trong đó là bắt họ bấm vào
    // một màn hình trống mới hiểu ra.
    for (const v of VAI_TRO) {
      expect(xem(v, 'sanPham'), `${v} phải xem được Sản phẩm`).toBe(true);
      expect(xem(v, 'chietKhau'), `${v} phải xem được Chiết khấu`).toBe(true);
    }
    expect(VAI_TRO.filter((v) => xem(v, 'giayToMau'))).toEqual(['QUAN_TRI']);
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

describe('tìm sản phẩm', () => {
  const ds = [
    { code: 'SP-01', name: 'Nutricare Gold' },
    { code: 'SP-02', name: 'Sữa non ColosCare' },
    { code: 'MET-09', name: 'Metacare Đêm' },
  ];

  it('từ khoá rỗng trả về nguyên danh sách', () => {
    expect(locSanPham(ds, '')).toHaveLength(3);
    expect(locSanPham(ds, '   ')).toHaveLength(3);
  });

  it('gõ KHÔNG DẤU vẫn ra chữ có dấu', () => {
    // Đây là lý do có hàm này thay vì `includes` thẳng: gõ đủ dấu trên bàn phím
    // điện thoại giữa lúc ngồi với khách hàng là thứ không ai làm.
    expect(locSanPham(ds, 'sua').map((x) => x.code)).toEqual(['SP-02']);
    expect(locSanPham(ds, 'dem').map((x) => x.code)).toEqual(['MET-09']);
  });

  it('khớp cả MÃ, không riêng tên', () => {
    // Người dùng đọc mã từ hoá đơn giấy nhiều hơn là nhớ tên đầy đủ.
    expect(locSanPham(ds, 'met-09').map((x) => x.name)).toEqual(['Metacare Đêm']);
  });

  it('không phân biệt hoa thường', () => {
    expect(locSanPham(ds, 'NUTRICARE')).toHaveLength(1);
  });

  it('không khớp thì trả về rỗng, không trả về tất cả', () => {
    // Lỗi kinh điển của ô tìm kiếm: không khớp gì thì bỏ qua bộ lọc, và người
    // dùng tưởng mọi sản phẩm đều khớp từ khoá của mình.
    expect(locSanPham(ds, 'khong-co-gi')).toEqual([]);
  });
});

/**
 * 0023 — tìm quy định chiết khấu, đặc biệt là TÌM THEO MÃ.
 *
 * Đường đi thật của người dùng: mở một hồ sơ, thấy cột *QĐCK* của một dòng, chép
 * mã đó, dán vào ô tìm ở màn hình Chiết khấu để xem quy định nào đã cho ra ngưỡng
 * ấy. Cả chuỗi đó gãy nếu ô tìm không khớp mã.
 */
describe('0023 lọc quy định chiết khấu', () => {
  const ba = [
    qd({ id: 'aaaa1111-2222-3333-4444-555566667777', productGroupCode: 'SUA', thresholdRate2: 2500 }),
    qd({ id: 'bbbb1111-2222-3333-4444-555566667777', productGroupCode: 'BOT', thresholdRate2: 3000 }),
    qd({ id: 'cccc1111-2222-3333-4444-555566667777', customerType: 2, thresholdRate2: 1000 }),
  ];

  it('từ khoá rỗng trả nguyên danh sách', () => {
    expect(locQuyDinh(ba, '')).toHaveLength(3);
    expect(locQuyDinh(ba, '   ')).toHaveLength(3);
  });

  it('khớp NGUYÊN mã quy định', () => {
    const r = locQuyDinh(ba, 'bbbb1111-2222-3333-4444-555566667777');
    expect(r).toHaveLength(1);
    expect(r[0]!.productGroupCode).toBe('BOT');
  });

  it('khớp cả MỘT PHẦN mã — dán hụt vài ký tự vẫn ra', () => {
    // Cột QĐCK trên bảng hồ sơ hẹp, và người ta hay bôi đen thiếu đuôi.
    expect(locQuyDinh(ba, 'cccc1111')).toHaveLength(1);
  });

  it('khớp mã KHÔNG phân biệt hoa thường', () => {
    expect(locQuyDinh(ba, 'AAAA1111')).toHaveLength(1);
  });

  it('khớp theo phạm vi áp dụng, bỏ dấu', () => {
    expect(locQuyDinh(ba, 'SUA')).toHaveLength(1);
    // "khách loại 2" — gõ không dấu vẫn ra.
    expect(locQuyDinh(ba, 'khach loai 2')).toHaveLength(1);
  });

  it('khớp theo con số ĐANG HIỆN trên màn hình, không phải giá trị lưu', () => {
    // Màn hình hiện "25,00%", máy lưu 2500. Người dùng gõ cái họ nhìn thấy.
    expect(locQuyDinh(ba, '25,00')).toHaveLength(1);
    expect(locQuyDinh(ba, '2500')).toHaveLength(0);
  });

  it('không khớp gì thì trả danh sách rỗng, không trả nguyên danh sách', () => {
    // Trả nguyên danh sách khi không khớp là kiểu lỗi tệ nhất của một ô tìm
    // kiếm: người dùng tưởng mọi dòng đều khớp và đọc nhầm cả bảng.
    expect(locQuyDinh(ba, 'khong-co-gi-khop')).toHaveLength(0);
  });
});
