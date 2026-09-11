/**
 * `0194` — PHÉP SO "dòng hồ sơ này lệch danh mục ở đâu", đủ mọi nhánh.
 *
 * Khách hàng chốt 10/09: *"tạo test case cho tất cả các trường hợp có thể xảy ra
 * trong yêu cầu cập nhật"*.
 *
 * Tệp này phủ tầng THUẦN. `soSanhLech` không chạm CSDL và không chạm mạng, nên
 * mọi tổ hợp — kể cả những tổ hợp phải vặn danh mục ba lượt mới dựng được trên
 * hạ tầng thật — đều dựng được ở đây trong vài dòng. Vế đi hết đường (nút *Tự
 * động cập nhật*, dấu vết được dọn, chốt phân quyền) nằm ở `policy.test.ts`.
 *
 * VÌ SAO ĐÁNG CÓ MỘT TỆP RIÊNG: từ `0194` phép so này có HAI nơi gọi —
 * `catalog-impact.consumer` ghi dấu vết cho hồ sơ đã đóng băng, và `soSanhDong`
 * tính tại chỗ cho hồ sơ còn sửa được. Một nhánh sai ở đây thì hai màn hình cùng
 * nói sai, mà chúng lại là hai màn hình người ta đọc TRƯỚC KHI ĐẶT BÚT KÝ.
 */
import { describe, expect, it } from 'vitest';
import { soSanhLech, NHAN_TRANG_THAI_SP, type DongDaChup } from '@csbh/policy/testing';

/** Dòng đã đóng băng: 100.000 đ, ngưỡng 15,00%. */
const DONG: DongDaChup = {
  productCode: 'NC-GOLD-900',
  companyPrice: '100000',
  threshold: '15.00',
};

/**
 * Ảnh chụp danh mục. Mặc định KHỚP HỆT dòng trên — mỗi ca chỉ vặn đúng thứ nó
 * đang nói tới, nên một ca đỏ chỉ ra được chính xác cái gì gây ra nó.
 */
const anh = (o: Partial<Parameters<typeof soSanhLech>[1] & object> = {}) =>
  ({
    productId: 'sp-1',
    productCode: 'NC-GOLD-900',
    productName: 'Nutricare Gold 900g',
    status: 'DANG_AP_DUNG',
    companyPrice: '100000',
    thresholdRate2: 1500,
    thresholdSource: 'RULE',
    ruleCode: 'QD-01',
    ...o,
  }) as NonNullable<Parameters<typeof soSanhLech>[1]>;

const loai = (d: DongDaChup, s: Parameters<typeof soSanhLech>[1]) =>
  soSanhLech(d, s).map((l) => l.kind);

describe('`0194` không có gì đổi thì KHÔNG có mục lệch nào', () => {
  it('mọi thứ khớp → mảng rỗng', () => {
    expect(soSanhLech(DONG, anh())).toEqual([]);
  });

  it('ngưỡng `15.00` và `Rate2` 1500 là MỘT — không phải một chênh lệch', () => {
    /*
     * Hai vế ở hai dạng: `threshold_snap` là `numeric(5,2)` đọc ra chuỗi, còn
     * `thresholdRate2` là số nguyên. So thô thì `"15.00" !== 1500` và MỌI dòng
     * của MỌI hồ sơ sẽ bày ra một chênh lệch ngưỡng không có thật.
     */
    expect(soSanhLech(DONG, anh({ thresholdRate2: 1500 }))).toEqual([]);
  });

  it('không quy định nào phủ ở CẢ HAI vế → không có gì đổi', () => {
    // `null` so `null`. Dễ viết thành một chênh lệch nếu dùng `!=` trên chuỗi.
    expect(soSanhLech({ ...DONG, threshold: null }, anh({ thresholdRate2: null }))).toEqual([]);
  });
});

describe('`0194` lệch GIÁ', () => {
  it('giá bán Công ty đổi → đúng một mục PRICE, mang cả hai con số', () => {
    const ra = soSanhLech(DONG, anh({ companyPrice: '120000' }));
    expect(ra).toEqual([
      { kind: 'PRICE', productCode: 'NC-GOLD-900', snap: '100000', moi: '120000' },
    ]);
  });

  it('giá GIẢM cũng là lệch — không chỉ tăng mới đáng báo', () => {
    expect(loai(DONG, anh({ companyPrice: '90000' }))).toEqual(['PRICE']);
  });
});

describe('`0194` lệch QUY ĐỊNH CHIẾT KHẤU', () => {
  it('ngưỡng đổi → một mục RULE', () => {
    expect(soSanhLech(DONG, anh({ thresholdRate2: 1750 }))).toEqual([
      { kind: 'RULE', productCode: 'NC-GOLD-900', snap: '15.00', moi: '17.50' },
    ]);
  });

  it('quy định BIẾN MẤT → `moi` là `null`, không phải số 0', () => {
    // `null` ở đây nghĩa là *không còn quy định nào phủ*. Đổi thành `0` là nói
    // "ngưỡng bằng không", và mọi dòng sẽ bị đánh dấu vượt ngưỡng.
    expect(soSanhLech(DONG, anh({ thresholdRate2: null }))).toEqual([
      { kind: 'RULE', productCode: 'NC-GOLD-900', snap: '15.00', moi: null },
    ]);
  });

  it('quy định MỚI phủ một dòng vốn không có ngưỡng → vẫn là lệch', () => {
    // Chiều ngược của ca trên, và là chiều dễ quên: dòng đang không có ngưỡng
    // nào thì `snap` phải in ra được — cột `snap_value` là `NOT NULL`.
    expect(soSanhLech({ ...DONG, threshold: null }, anh({ thresholdRate2: 1500 }))).toEqual([
      { kind: 'RULE', productCode: 'NC-GOLD-900', snap: '—', moi: '15.00' },
    ]);
  });
});

describe('`0194` lệch SẢN PHẨM', () => {
  it('sản phẩm ĐÃ XOÁ khỏi danh mục → đúng MỘT mục, không so tiếp giá', () => {
    /*
     * Không còn gì để so. Nói *"giá đã đổi"* về một sản phẩm không còn tồn tại
     * là một câu vô nghĩa, và nó còn đẩy hai mục thừa vào bảng người đọc đang
     * dò (`0036`).
     */
    expect(soSanhLech(DONG, undefined)).toEqual([
      { kind: 'PRODUCT', productCode: 'NC-GOLD-900', snap: 'Đang áp dụng', moi: null },
    ]);
  });

  it('sản phẩm VÔ HIỆU HOÁ → vẫn so tiếp giá và ngưỡng', () => {
    // Khác hẳn ca trên: sản phẩm còn trong danh mục, chỉ là không đưa vào hồ sơ
    // MỚI được nữa (CAT-07). Giá và ngưỡng của nó vẫn có nghĩa, và người đọc cần
    // thấy đủ mọi thứ đã lệch trên dòng ấy.
    const ra = soSanhLech(
      DONG,
      anh({ status: 'DA_VO_HIEU_HOA', companyPrice: '120000', thresholdRate2: 1750 }),
    );
    expect(ra.map((l) => l.kind)).toEqual(['PRODUCT', 'PRICE', 'RULE']);
    expect(ra[0]).toEqual({
      kind: 'PRODUCT',
      productCode: 'NC-GOLD-900',
      snap: NHAN_TRANG_THAI_SP['DANG_AP_DUNG'],
      moi: NHAN_TRANG_THAI_SP['DA_VO_HIEU_HOA'],
    });
  });

  it('trạng thái LẠ vẫn đọc ra được, không rơi thành ô trống', () => {
    // Dữ liệu cũ hoặc một trạng thái thêm về sau. Mã trần đọc được hơn hẳn rỗng.
    const ra = soSanhLech(DONG, anh({ status: 'MOT_TRANG_THAI_MOI' }));
    expect(ra[0]!.moi).toBe('MOT_TRANG_THAI_MOI');
  });

  it('`0199` CHƯA KHAI GIÁ tại ngày áp dụng KHÔNG được đọc thành "đã xoá"', () => {
    /*
     * Vắng mặt có HAI nghĩa và catalog phân biệt được chúng. Sản phẩm còn nguyên
     * trong danh mục mà chưa khai giá tại ngày của dòng thì câu *"đã xoá khỏi
     * danh mục"* là một chuyện không xảy ra — nói ra ngay chỗ người ta đọc để
     * quyết định có rút mặt hàng hay không.
     */
    const ra = soSanhLech(DONG, undefined, 'PRICE_NOT_SET');
    expect(ra).toHaveLength(1);
    expect(ra[0]!.moi).toBe('Chưa khai giá tại ngày áp dụng');
  });

  it('`0199` lý do KHÔNG biết thì vẫn là "đã xoá" — hành vi cũ giữ nguyên', () => {
    // Consumer chỉ đưa vào đây loại vắng mặt `PRODUCT_NOT_FOUND` và không truyền
    // lý do, nên nhánh mặc định phải đúng y như trước `0199`.
    expect(soSanhLech(DONG, undefined, undefined)[0]!.moi).toBeNull();
    expect(soSanhLech(DONG, undefined, 'MOT_MA_LOI_LA')[0]!.moi).toBeNull();
  });
});

describe('`0194` nhiều thứ lệch cùng lúc', () => {
  it('giá VÀ ngưỡng cùng đổi → HAI mục, không phải một', () => {
    // Hai bản ghi chứ không phải một bản ghi hai cột: đó là hai việc khác nhau
    // với người đọc, và `pol.policy_impact` cũng khoá theo `kind` (`0029`).
    expect(loai(DONG, anh({ companyPrice: '120000', thresholdRate2: 1750 }))).toEqual([
      'PRICE',
      'RULE',
    ]);
  });

  it('THỨ TỰ nặng nhất trước: PRODUCT · PRICE · RULE', () => {
    /*
     * Cùng thứ tự với `THU_TU` bên giao diện và với thư báo. Một dòng vừa mất
     * sản phẩm vừa lệch giá thì thứ đáng nói trước là mất sản phẩm — ở MỌI chỗ,
     * nếu không thì người đọc ba màn hình phải học ba thứ tự.
     */
    const ra = soSanhLech(
      DONG,
      anh({ status: 'DA_VO_HIEU_HOA', companyPrice: '1', thresholdRate2: 1 }),
    );
    expect(ra.map((l) => l.kind)).toEqual(['PRODUCT', 'PRICE', 'RULE']);
  });

  it('mã sản phẩm đi kèm MỌI mục — bảng lệch dò theo cột ấy', () => {
    const ra = soSanhLech(DONG, anh({ status: 'DA_VO_HIEU_HOA', companyPrice: '2' }));
    expect(ra.every((l) => l.productCode === 'NC-GOLD-900')).toBe(true);
  });
});
