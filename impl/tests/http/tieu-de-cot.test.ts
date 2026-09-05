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
import { COT_BANG, bangSanPhamXml } from '@csbh/document/testing';
import { COT_TRUOC, COT_SAU, nhanCpbh } from '@csbh/web/bang-cot';

/** Khoá bên màn hình → khoá bên bản mềm. Cùng một cột, hai cách đặt tên khoá. */
const KHOP: Record<string, string> = {
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
