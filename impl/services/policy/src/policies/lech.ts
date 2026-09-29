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

/** Bốn trường đã đóng băng trên một dòng hồ sơ — đủ để so, không hơn. */
export type DongDaChup = {
  productCode: string;
  companyPrice: string;
  threshold: string | null;
  /**
   * `0238` — MÃ quy định đã chụp (`rule_code_snap`). BẮT BUỘC chứ không tuỳ chọn:
   * một người gọi quên truyền là mọi dòng lệch mã, hoặc không dòng nào — lối
   * `0143`, để `tsc` chỉ ra đủ mọi chỗ dựng kiểu này.
   */
  ruleCode: string | null;
};

/**
 * Giá trị RULE khi MÃ quy định đã đổi (`0238`): `<ngưỡng>|<mã>` ở CẢ HAI vế.
 *
 * Chỉ khi mã đổi — lệch chỉ ở ngưỡng giữ nguyên dạng số trần như từ `0029`, nên
 * dấu vết cũ trong `pol.policy_impact` và mọi chỗ đọc chúng không đổi gì. `|` vì
 * nó không thể nằm trong một con số, và mã quy định do người dùng gõ nhưng ký tự
 * này không có lý do gì xuất hiện ở đó; màn hình tách ở dấu `|` ĐẦU TIÊN
 * (`Lech.tsx`, `doc`).
 */
export const giaTriQuyDinh = (nguong: string | null, ma: string | null): string =>
  `${nguong ?? '—'}|${ma ?? '—'}`;

/** Nhãn trạng thái sản phẩm cho câu chữ trong thư và trong box Yêu cầu cập nhật. */
export const NHAN_TRANG_THAI_SP: Record<string, string> = {
  DANG_AP_DUNG: 'Đang áp dụng',
  DA_VO_HIEU_HOA: 'Đã vô hiệu hoá',
};

/**
 * VÌ SAO không có ảnh chụp, khi biết được (`0199`).
 *
 * Vắng mặt có HAI nghĩa, và catalog phân biệt được chúng: sản phẩm không còn
 * trong danh mục, hay sản phẩm còn nguyên đó mà chưa khai giá tại ngày áp dụng
 * của dòng. Trả lời chuyện thứ hai bằng câu *"đã xoá khỏi danh mục"* là nói một
 * chuyện không xảy ra, ngay chỗ người ta đọc để quyết định rút mặt hàng.
 *
 * Bỏ trống = không nói được vì sao, và khi ấy câu mặc định là *"đã xoá"* — đúng
 * cho người gọi duy nhất chỉ nhận vắng mặt loại ấy (consumer, xem `traAnhChup`).
 */
export const NHAN_VANG_MAT: Record<string, string> = {
  PRICE_NOT_SET: 'Chưa khai giá tại ngày áp dụng',
};

/**
 * Một dòng lệch những gì. Mảng rỗng nghĩa là dòng ấy khớp danh mục.
 *
 * THỨ TỰ trong mảng là thứ tự NẶNG DẦN NGƯỢC — `PRODUCT` trước, rồi `PRICE`, rồi
 * `RULE`. Cùng thứ tự với `THU_TU` bên giao diện và với thư báo: một dòng vừa mất
 * sản phẩm vừa lệch giá thì thứ đáng nói trước là mất sản phẩm, ở mọi chỗ.
 */
export function soSanhLech(
  d: DongDaChup,
  s: ProductSnapshot | undefined,
  lyDoVangMat?: string | undefined,
): MucLech[] {
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
   *
   * `lyDoVangMat` thêm ở `0199` — xem `NHAN_VANG_MAT`.
   */
  if (!s) {
    return [
      {
        kind: 'PRODUCT',
        productCode: d.productCode,
        snap: NHAN_TRANG_THAI_SP['DANG_AP_DUNG']!,
        moi: (lyDoVangMat === undefined ? undefined : NHAN_VANG_MAT[lyDoVangMat]) ?? null,
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
  /*
   * `0238` — MÃ quy định đổi cũng là lệch, kể cả khi ngưỡng bằng nhau (khách hàng
   * chốt 29/09). Đường sinh ra nó: ĐỔI NHÓM một sản phẩm, rơi sang quy định của
   * nhóm mới có cùng ngưỡng — trước lượt này cột QĐCK của hồ sơ lặng lẽ mang mã
   * của một quy định không còn phủ dòng ấy.
   *
   * `0029` viết *"KHÔNG KHỚP THEO MÃ QUY ĐỊNH"* — câu ấy nói về việc LỌC dòng cần
   * rà (một quy định mới, cụ thể hơn, thắng quy định đã chụp mà hồ sơ không nhắc
   * tới mã của nó), không phải về phép SO. Vẫn tra lại toàn bộ; chỉ so thêm mã.
   *
   * Cả hai vế rỗng (không quy định nào phủ) là khớp. Đổi tên một quy định cũng
   * sinh lệch — đã nêu lúc chốt, và đúng: mã in trên dấu `?` của cột QĐCK.
   */
  const maMoi = s.ruleCode ?? null;
  const maCu = d.ruleCode ?? null;
  if (maMoi !== maCu && nguongMoi !== null) {
    ra.push({
      kind: 'RULE',
      productCode: d.productCode,
      snap: giaTriQuyDinh(nguongCu, maCu),
      moi: giaTriQuyDinh(nguongMoi, maMoi),
    });
  } else if (nguongMoi !== nguongCu) {
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
