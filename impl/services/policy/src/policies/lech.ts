/**
 * "Dòng hồ sơ này đã lệch so với danh mục ở chỗ nào" — phép so, một bản duy nhất.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO TÁCH RA (`0194`)
 * ---------------------------------------------------------------------------
 *
 * Tới `0193` phép so này nằm gọn trong `catalog-impact.consumer.ts`, và đúng chỗ:
 * chỉ consumer cần nó, vì chỉ hồ sơ ĐÃ ĐÓNG BĂNG mới có dấu vết lệch.
 *
 * `0194` mở khối *Yêu cầu cập nhật* cho cả hồ sơ CÒN SỬA ĐƯỢC, và ở đó không có
 * dấu vết nào để đọc — `pol.policy_impact` chỉ ghi cho hồ sơ đóng băng. Chênh
 * lệch của một bản nháp phải TÍNH tại chỗ, vì nó đổi mỗi lần TDV sửa một dòng,
 * trong khi consumer chỉ chạy lúc danh mục đổi.
 *
 * Hai đường tính, một câu hỏi. Chép phép so sang chỗ thứ hai là dựng ra hai câu
 * trả lời cho *"dòng này có lệch không"* — và chúng sẽ lệch nhau ở đúng chỗ khó
 * thấy nhất: một bên bảo hồ sơ sạch, bên kia vẫn bày khối cảnh báo.
 *
 * Hàm THUẦN, không chạm CSDL và không chạm mạng: nhận ảnh chụp đã đóng băng cùng
 * ảnh chụp tươi, trả về danh sách chênh lệch. Nhờ vậy ca kiểm với tới được từng
 * nhánh mà không phải dựng một hồ sơ thật.
 */
import type { ProductSnapshot } from '../infra/clients.js';
import { rate2ToNumeric } from '@csbh/domain-policy';

export type LoaiLech = 'PRICE' | 'RULE' | 'PRODUCT';

export type MucLech = {
  kind: LoaiLech;
  productCode: string;
  /** Giá trị ĐANG có trên hồ sơ. Dạng chữ — xem `pol.policy_impact.snap_value`. */
  snap: string;
  /** Giá trị hiện hành trong danh mục. `null` = không còn gì (xem từng nhánh). */
  moi: string | null;
};

/** Ba trường đã đóng băng trên một dòng hồ sơ — đủ để so, không hơn. */
export type DongDaChup = {
  productCode: string;
  companyPrice: string;
  threshold: string | null;
};

/** Nhãn trạng thái sản phẩm cho câu chữ trong thư và trong box Yêu cầu cập nhật. */
export const NHAN_TRANG_THAI_SP: Record<string, string> = {
  DANG_AP_DUNG: 'Đang áp dụng',
  DA_VO_HIEU_HOA: 'Đã vô hiệu hoá',
};

/**
 * Một dòng lệch những gì. Mảng rỗng nghĩa là dòng ấy khớp danh mục.
 *
 * THỨ TỰ trong mảng là thứ tự NẶNG DẦN NGƯỢC — `PRODUCT` trước, rồi `PRICE`, rồi
 * `RULE`. Cùng thứ tự với `THU_TU` bên giao diện và với thư báo: một dòng vừa mất
 * sản phẩm vừa lệch giá thì thứ đáng nói trước là mất sản phẩm, ở mọi chỗ.
 */
export function soSanhLech(d: DongDaChup, s: ProductSnapshot | undefined): MucLech[] {
  const ra: MucLech[] = [];

  /*
   * KHÔNG có ảnh chụp = sản phẩm đã bị XOÁ khỏi danh mục (`0036`).
   *
   * Trước `0036` nhánh này là `continue` — im lặng bỏ qua dòng. Đó là ca nặng
   * nhất mà lại bị nuốt gọn nhất: hồ sơ đang có hiệu lực cho một mặt hàng không
   * còn tồn tại, và không có gì trên màn hình nói ra.
   *
   * So sánh giá và ngưỡng thì không làm được nữa — không còn gì để so — nên dừng
   * ở đây với đúng một dòng lệch. Nói "giá đã đổi" về một sản phẩm không còn nữa
   * là một câu vô nghĩa.
   */
  if (!s) {
    return [
      {
        kind: 'PRODUCT',
        productCode: d.productCode,
        snap: NHAN_TRANG_THAI_SP['DANG_AP_DUNG']!,
        moi: null,
      },
    ];
  }

  // Vô hiệu hoá: sản phẩm còn trong danh mục nhưng không đưa vào hồ sơ mới được
  // nữa (CAT-07). Vẫn so tiếp giá và ngưỡng ở dưới — chúng vẫn có nghĩa, và
  // người đọc cần thấy đủ mọi thứ đã lệch trên dòng ấy.
  if (s.status !== 'DANG_AP_DUNG') {
    ra.push({
      kind: 'PRODUCT',
      productCode: d.productCode,
      snap: NHAN_TRANG_THAI_SP['DANG_AP_DUNG']!,
      moi: NHAN_TRANG_THAI_SP[s.status] ?? s.status,
    });
  }

  if (String(s.companyPrice) !== String(d.companyPrice)) {
    ra.push({
      kind: 'PRICE',
      productCode: d.productCode,
      snap: String(d.companyPrice),
      moi: String(s.companyPrice),
    });
  }

  /*
   * NGƯỠNG so trên dạng CHUẨN HOÁ, không so số thô.
   *
   * `threshold_snap` là `numeric(5,2)` đọc ra chuỗi, còn `thresholdRate2` là số
   * nguyên `Rate2` — đưa cả hai qua `rate2ToNumeric` là cách duy nhất để
   * `15.00` và `1500` được coi là một. So `null` với `null` cũng phải đúng:
   * `null` ở đây nghĩa là *không quy định nào phủ*, và hai bên cùng rỗng thì
   * không có gì đã đổi.
   */
  const nguongMoi = s.thresholdRate2 === null ? null : rate2ToNumeric(s.thresholdRate2);
  const nguongCu = d.threshold === null ? null : String(d.threshold);
  if (nguongMoi !== nguongCu) {
    ra.push({
      kind: 'RULE',
      productCode: d.productCode,
      // `—` chứ không `null` ở vế CŨ: `null` của `snap_value` không lưu được
      // (cột `NOT NULL`), và câu *"không còn quy định nào"* là câu của vế MỚI.
      snap: nguongCu ?? '—',
      moi: nguongMoi,
    });
  }

  return ra;
}
