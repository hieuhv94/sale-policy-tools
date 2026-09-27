/**
 * SỐ ĐIỆN THOẠI khách hàng: ĐÚNG 10 CHỮ SỐ (`0223`, khách hàng chốt 27/09).
 *
 * Hàm TRẢ VỀ bản chuẩn — mười chữ số liền, bỏ dấu cách, dấu chấm, gạch ngang —
 * chứ không gật đầu (cùng lối `chuanTinhThanh`, `0205`). Người ta gõ
 * `0912 345 678` hay `0912.345.678` là chuyện thường, và cả hai là cùng một số;
 * kiểm rồi ghi nguyên chuỗi gửi lên thì CSDL giữ ba lối viết cho một số, và số
 * ấy đi thẳng ra bản CSBH đem ký. `null` là không hợp lệ.
 *
 * Chỉ ĐẾM chữ số, không đòi đầu `0`: khách hàng nói *"đúng 10 số"*, và luật đầu
 * số là một luật khác chưa ai yêu cầu.
 *
 * BẢN CHÉP ở giao diện: `laSoDienThoai` trong `apps/web/src/lib/danh-muc.ts` —
 * giao diện là gói riêng nên không import được tệp này. `tests/http/so-dien-thoai.test.ts`
 * chạy cùng một bảng ca qua CẢ HAI hàm và đòi chúng trả lời như nhau.
 */
import { BadRequestException } from '@nestjs/common';
import type { Check } from '@csbh/http-kit';

/** Ký tự ngăn cách được bỏ qua lúc đếm: dấu cách, dấu chấm, gạch ngang. */
const NGAN_CACH = /[\s.-]/g;

export const chuanSoDienThoai = (s: string): string | null => {
  const so = s.replace(NGAN_CACH, '');
  return /^\d{10}$/.test(so) ? so : null;
};

export const CAU_LOI_SDT = 'Số điện thoại phải gồm đúng 10 chữ số.';

/**
 * Kiểm ở CONTROLLER, cho cả lượt lập lẫn lượt sửa. Mã lỗi riêng chứ không
 * `VALIDATION_FAILED`: câu *"trường không hợp lệ"* không nói người dùng phải gõ
 * lại thế nào, còn câu này nói đúng con số.
 */
export const soDienThoai = (): Check<string> => ({
  parse: (v, field) => {
    const chuan = chuanSoDienThoai(String(v ?? ''));
    if (chuan === null) {
      throw new BadRequestException({ code: 'CUSTOMER_PHONE_INVALID', field, message: CAU_LOI_SDT });
    }
    return chuan;
  },
});
