/**
 * `0172` — BẢNG TRÊN MÀN HÌNH VÀ BẢNG TRÊN TỜ GIẤY GỌI CỘT CÙNG MỘT TÊN.
 *
 * Tệp thuần: đọc hai bảng hằng, không dựng ứng dụng, không chạm CSDL.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CẦN MỘT CA KIỂM, VÀ VÌ SAO KHÔNG GỘP HAI BẢNG LÀM MỘT
 * ---------------------------------------------------------------------------
 *
 * Khách hàng chốt 01/09: *"đồng bộ tiêu đề cột trong trang hồ sơ CSBH và trong
 * bản mềm"*, rồi kể ra ba cặp lệch mà họ tự tìm thấy:
 *
 *     *Giá bán Công ty* / *Giá công ty*   → *Giá bán Công ty*
 *     *CPBH tổng*       / *CPBH*          → *CPBH*
 *     *CPBH1*           / *CPBH 1*        → *CPBH 1*
 *
 * Họ tìm ra ba, còn một cặp thứ tư — *Mã SP* / *Mã sản phẩm* — nằm ngay cạnh và
 * không ai nêu. Đó là hình dạng của lỗi này: nó sinh ra từng cặp một, mỗi cặp
 * một lượt sửa ở MỘT bên, và người đối chiếu màn hình với bản in phải tự dịch.
 *
 * HAI BẢNG KHÔNG GỘP ĐƯỢC. `COT_TRUOC`/`COT_SAU` thuộc gói giao diện — `FE-38`
 * chặn 250KB, và kéo mã của một service vào đó là một cái giá không ai muốn
 * trả; `COT_BANG` thuộc `document`, nơi bảng Word được dựng. Nên chốt chặn phải
 * là một phép ĐỐI CHIẾU, và nó đọc CẢ HAI hằng chứ không chép lại tên nào —
 * chép là dựng ra bản sao thứ ba.
 *
 * Ba cột chỉ có ở một bên thì khai đích danh ở `CHI_MOT_BEN` kèm lý do.
 */
import { describe, expect, it } from 'vitest';
import { COT_BANG, NHAN_TRANG_THAI_DONG, bangSanPhamXml } from '@csbh/document/testing';
import { COT_TRUOC, COT_SAU, NHAN_TRANG_THAI, nhanCpbh } from '@csbh/web/bang-cot';


/** Khoá bên màn hình → khoá bên bản mềm. Cùng một cột, hai cách đặt tên khoá. */
const KHOP: Record<string, string> = {
  // `0180` — ba cột mới, và cả ba có mặt Ở HAI BÊN. *Trạng thái* với *Tỷ lệ CK
  // cũ* mặc định TẮT trên ba mẫu phần mềm tự nạp (`COT_MAU_MAC_DINH`), nhưng
  // chúng vẫn là cột của bản mềm — mẫu nào tích thì in ra, và khi ấy tên phải
  // khớp với màn hình đúng như mọi cột khác.
  ngayApDung: 'ngay_ap_dung',
  discountRateTruoc: 'ty_le_ck_cu',
  trangThai: 'trang_thai',
  productCode: 'ma_san_pham',
  productName: 'ten_san_pham',
  companyPrice: 'gia_cong_ty',
  wholesalePrice: 'gia_ban_buon',
  cpbhTotal: 'cpbh_tong',
  netPrice: 'gia_thu_ve',
  discountRate: 'ty_le_ck',
  note: 'ghi_chu',
};

/**
 * Cột CHỈ CÓ ở một bên — mỗi mục kèm lý do, vì một danh sách miễn trừ không lý
 * do là chỗ để lặng lẽ nhét thêm cột lệch vào.
 */
const CHI_MOT_BEN: Record<string, string> = {
  stt: 'chỉ bản in: trên màn hình dòng đã có thứ tự nhìn thấy được',
  cpbh: 'nhãn gộp của N cột lẻ, không phải một cột — kiểm riêng ở ca dưới',
  ruleCode: 'chỉ màn hình: mã quy định chiết khấu để tra ngược, không in ra giấy',
};

describe('`0172` nhãn cột khớp giữa màn hình và bản mềm', () => {
  const nhanBang = new Map(COT_BANG.map((c) => [c.khoa as string, c.nhan as string]));
  const nhanWeb = new Map(
    [...COT_TRUOC, ...COT_SAU].map((c) => [c.khoa as string, c.nhan as string]),
  );

  it('mọi cột có ở CẢ HAI bên đều mang đúng một tên', () => {
    const lech: string[] = [];
    for (const [web, doc] of Object.entries(KHOP)) {
      const a = nhanWeb.get(web);
      const b = nhanBang.get(doc);
      if (a !== b) lech.push(`${web}: màn hình "${a}" ≠ bản mềm "${b}"`);
    }
    expect(lech, lech.join(' · ')).toEqual([]);
  });

  it('bảng ánh xạ phủ hết cột của cả hai bên — không cột nào lọt ngoài phép kiểm', () => {
    /*
     * Chiều đối chiếu, và nó là chiều quan trọng hơn: cách "sửa" rẻ nhất cho ca
     * trên là gỡ một dòng khỏi `KHOP`. Thêm một cột mới ở một bên mà quên bên
     * kia cũng đỏ ở đây — đúng lúc nó vừa sinh ra, chứ không phải lúc khách hàng
     * cầm bản in lên đối chiếu.
     */
    for (const k of nhanWeb.keys()) {
      expect(k in KHOP || k in CHI_MOT_BEN, `cột màn hình "${k}" chưa khai ở KHOP`).toBe(true);
    }
    const nguoc = new Set(Object.values(KHOP));
    for (const k of nhanBang.keys()) {
      expect(nguoc.has(k) || k in CHI_MOT_BEN, `cột bản mềm "${k}" chưa khai ở KHOP`).toBe(true);
    }
  });

  it('cột CPBH lẻ đánh số giống nhau — có dấu cách, ở cả hai bên', () => {
    /*
     * `CPBH1` với `CPBH 1` là cặp lệch khách hàng nêu đích danh. Bên bản mềm
     * nhãn được SINH RA trong `tieuDe()` chứ không nằm ở `COT_BANG`, nên chỉ
     * đọc hằng thì không thấy — phải dựng bảng thật rồi đọc chữ ra.
     */
    expect(nhanCpbh(0)).toBe('CPBH 1');
    expect(nhanCpbh(1)).toBe('CPBH 2');

    const xml = bangSanPhamXml({
      lines: [
        {
          id: 'l1',
          product_code_snap: 'SP-01',
          product_name_snap: 'Sữa A',
          company_price: '100000',
          wholesale_price: '90000',
          cpbh_total: '10000',
          cpbh: ['6000', '4000'],
          net_price: '80000',
          discount_rate: '2000',
          note: null,
        },
      ],
    } as never);
    const hangDau = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/)?.[0] ?? '';
    const chu = [...hangDau.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]!);
    expect(chu).toContain('CPBH 1');
    expect(chu).toContain('CPBH 2');
    expect(chu.some((n) => /^CPBH\d/.test(n)), 'bản mềm còn nhãn dính liền').toBe(false);
  });
});

/**
 * `0180` — THỨ TỰ CỘT, không chỉ tên cột.
 *
 * `0172` canh việc hai bảng gọi cùng một cột bằng cùng một tên. Lượt này thêm
 * vế thứ hai, vì khách hàng chốt một VỊ TRÍ chứ không chỉ một cái tên: *"cột
 * ngày áp dụng để bên trái mã sản phẩm"*.
 *
 * Vế ấy không suy ra được từ phép đối chiếu tên: hai bảng có thể mang đủ cùng
 * mười ba cái tên mà xếp theo hai thứ tự khác nhau, và khi ấy người đối chiếu
 * màn hình với bản in phải dò lại từ đầu — đúng cái `0172` sinh ra để tránh.
 */
describe('`0180` thứ tự cột khớp giữa hai bảng, và ngày áp dụng đứng trước mã', () => {
  const khoaWeb = [...COT_TRUOC, ...COT_SAU].map((c) => c.khoa as string);
  const khoaBang = COT_BANG.map((c) => c.khoa as string);

  it('*Ngày áp dụng* đứng NGAY TRƯỚC *Mã sản phẩm* ở CẢ HAI bảng', () => {
    expect(khoaWeb.indexOf('ngayApDung')).toBe(khoaWeb.indexOf('productCode') - 1);
    expect(khoaBang.indexOf('ngay_ap_dung')).toBe(khoaBang.indexOf('ma_san_pham') - 1);
  });

  it('*Tỷ lệ CK cũ* đứng NGAY SAU *Tỷ lệ CK* ở cả hai bảng', () => {
    // Nó chỉ có nghĩa khi đọc cạnh con số mới; cách một cột là mắt phải nhớ số.
    expect(khoaWeb.indexOf('discountRateTruoc')).toBe(khoaWeb.indexOf('discountRate') + 1);
    expect(khoaBang.indexOf('ty_le_ck_cu')).toBe(khoaBang.indexOf('ty_le_ck') + 1);
  });

  it('thứ tự các cột CHUNG giống hệt nhau ở hai bảng', () => {
    /*
     * Phép so mạnh nhất mà hai danh sách khác độ dài cho phép: lọc mỗi bên về
     * đúng những cột có mặt ở cả hai, rồi đòi hai dãy khớp từng vị trí.
     *
     * Chỉ so từng cặp lân cận thì chèn một cột vào giữa vẫn lọt (bài học
     * `0152`).
     */
    const chung = khoaWeb.filter((k) => KHOP[k] !== undefined);
    expect(chung.map((k) => KHOP[k])).toEqual(khoaBang.filter((k) => chung.some((w) => KHOP[w] === k)));
  });
});

/**
 * `0180` — BA NHÃN TRẠNG THÁI cũng phải khớp giữa hai bảng.
 *
 * Cùng lý do với tên cột, chỉ khác chỗ đứng: đây là NỘI DUNG ô. Người duyệt đọc
 * *Chỉnh sửa* trên màn hình rồi cầm tờ giấy vừa in — hai chữ khác nhau cho cùng
 * một trạng thái bắt họ phải dịch, và lần này còn tệ hơn tên cột vì nó nói về
 * một dòng cụ thể chứ không về cả bảng.
 */
describe('`0180` nhãn trạng thái dòng khớp giữa màn hình và bản mềm', () => {
  it('cùng tập khoá, cùng từng chữ', () => {
    expect(Object.keys(NHAN_TRANG_THAI).sort()).toEqual(
      Object.keys(NHAN_TRANG_THAI_DONG).sort(),
    );
    for (const k of Object.keys(NHAN_TRANG_THAI_DONG)) {
      expect(NHAN_TRANG_THAI[k], `nhãn của ${k} lệch nhau`).toBe(NHAN_TRANG_THAI_DONG[k]);
    }
  });

  it('ba trạng thái, đúng ba — không nhiều hơn, không ít hơn', () => {
    // Khách hàng chốt BA: *Bổ sung* · *Chỉnh sửa* · *Đang áp dụng*. Thêm một
    // trạng thái thứ tư là một quyết định nghiệp vụ, không phải một lượt sửa mã.
    expect(Object.keys(NHAN_TRANG_THAI_DONG).sort()).toEqual([
      'BO_SUNG',
      'CHINH_SUA',
      'DANG_AP_DUNG',
    ]);
  });

  it('bảng Word IN RA nhãn tiếng Việt, không in mã trần', () => {
    /*
     * Đi qua chính bộ dựng bảng: `bangSanPhamXml` là đường duy nhất bảng sản
     * phẩm được sinh ra, và một dòng in `CHINH_SUA` ra tờ giấy đem ký là thứ
     * chỉ lộ ra khi có người mở PDF.
     *
     * Cũng canh vế *Tỷ lệ CK cũ*: nó chỉ có chữ ở dòng máy chủ đã đánh dấu, và
     * `document` KHÔNG được tự suy lại theo trạng thái.
     */
    const xml = bangSanPhamXml(
      {
        lines: [
        {
          product_code_snap: 'SP-01',
          product_name_snap: 'San pham',
          company_price: '100000',
          wholesale_price: '90000',
          cpbh: [],
          cpbh_total: '0',
          net_price: '90000',
          discount_rate: '10.00',
          threshold_snap: null,
          over_threshold: false,
          note: null,
          ngay_ap_dung: '2026-09-07',
          trang_thai: 'CHINH_SUA',
          ty_le_ck_truoc: '12.00',
          },
        ],
      } as never,
      // Tập cột khai TƯỜNG MINH: hai cột này không nằm trong tập của ba mẫu mặc
      // định (`COT_MAU_MAC_DINH`), nên một mẫu muốn in chúng phải tự tích.
      ['ma_san_pham', 'ten_san_pham', 'ty_le_ck', 'ty_le_ck_cu', 'trang_thai'],
    );
    expect(xml).toContain('Chỉnh sửa');
    expect(xml, 'mã trần lọt ra tờ giấy').not.toContain('CHINH_SUA');
    /*
     * DẤU CHẤM, không phải dấu phẩy — và đó là chuyện có sẵn, không phải của
     * `0180`: `pct()` bên `document` in `12.00%` còn `tyLe()` bên giao diện in
     * `12,00%`. Cột *Tỷ lệ CK* đã lệch như thế từ đầu. Ghi ra ở đây vì ca này là
     * chỗ đầu tiên một người đọc sẽ gặp nó và tưởng mình vừa gõ sai.
     */
    expect(xml).toContain('12.00%');
  });
});
