/**
 * ĐIỀU KHOẢN THANH TOÁN của một khách hàng (`0138`).
 *
 * Tới `0137` đây là cột `debt bigint` — một số tiền. Khách hàng chốt 27/08: nó
 * không phải số tiền mà là một điều khoản, chọn trong ba, và phương án cuối cho
 * gõ tự do.
 *
 * ---------------------------------------------------------------------------
 * CÂU CHỮ KHAI Ở ĐÂY, VÀ CHỈ Ở ĐÂY
 * ---------------------------------------------------------------------------
 *
 * Ba câu này đi ra tới ba chỗ: màn hình khách hàng, màn hình hồ sơ, và **tờ CSBH
 * in ra**. Chép chúng sang từng chỗ là dựng ba bản sao sẽ trôi khỏi nhau, và chỗ
 * trôi đầu tiên bao giờ cũng là bản in — thứ không ai mở ra đọc hằng ngày.
 *
 * Nên `customer` dựng sẵn câu và trả về qua trường `debt`; `policy` và `document`
 * nhận một CHUỖI và không cần biết ba phương án là gì. Đó cũng là lý do đổi lượt
 * này không phải sửa một dòng nào ở hai service ấy ngoài kiểu dữ liệu.
 *
 * Giao diện có bản sao riêng (`apps/web/src/lib/danh-muc.ts`) vì nó phải vẽ ô
 * chọn — và có một ca kiểm đối chiếu hai bảng, cùng lối với `quyen.test.ts`.
 */

export const DIEU_KHOAN_NO = ['SAU_NHAN_HANG', 'GOI_DON_90', 'KHAC'] as const;

export type DieuKhoanNo = (typeof DIEU_KHOAN_NO)[number];

/**
 * Câu chữ của từng điều khoản — đúng nguyên văn khách hàng chốt 27/08.
 *
 * `KHAC` không có câu sẵn: nội dung của nó là thứ người dùng gõ vào `debt_note`.
 */
export const CAU_DIEU_KHOAN: Record<Exclude<DieuKhoanNo, 'KHAC'>, string> = {
  SAU_NHAN_HANG: 'Thanh toán sau khi nhận hàng',
  GOI_DON_90: 'Thanh toán gối đơn, công nợ không quá 90 ngày',
};

/**
 * Câu chữ cuối cùng — thứ hiện trên màn hình và in ra tờ CSBH.
 *
 * `KHAC` mà `note` rỗng thì trả về chuỗi rỗng chứ KHÔNG trả về chữ "Khác": ô
 * *Khác* không phải một điều khoản, nó là một chỗ để gõ điều khoản. In ra chữ
 * "Khác" trên tờ giấy hai bên ký là in ra một câu không nói gì.
 *
 * Mã lạ — dữ liệu cũ, hoặc một mã ai đó thêm mà quên khai câu — trả về chính mã
 * ấy chứ không trả rỗng: một ô trống trên bản in đọc như lỗi hiển thị, còn thấy
 * `GOI_DON_120` thì người đọc biết ngay phải đi hỏi ai.
 */
export const cauNo = (term: string | null, note: string | null): string => {
  if (term === 'KHAC') return (note ?? '').trim();
  const c = CAU_DIEU_KHOAN[term as Exclude<DieuKhoanNo, 'KHAC'>];
  return c ?? (term ?? '');
};

/**
 * *Khác* thì PHẢI gõ nội dung, và hai phương án kia thì KHÔNG (`0138`).
 *
 * Luật HAI CHIỀU, nên nó không phát biểu được bằng bộ kiểm theo từng trường:
 * `debtNote` bắt buộc hay không phụ thuộc giá trị của một trường khác.
 *
 * Chiều thứ hai đáng giữ ngang chiều thứ nhất: chọn phương án 1 rồi gõ thêm một
 * dòng ghi chú thì dòng ấy **không đi đâu cả** — không lên màn hình, không ra
 * bản in — và người gõ tin rằng nó có. Chặn thẳng còn hơn nuốt im lặng.
 *
 * Trả về mô tả lỗi thay vì ném: hàm này nằm cạnh chính bảng từ vựng nó kiểm, và
 * một hàm thuần thì ca kiểm gọi thẳng được, không phải dựng cả một service.
 * Service bọc nó lại thành `BadRequestException`.
 */
export type LoiDieuKhoan = { code: string; field: string; message: string };

export const loiDieuKhoan = (
  term: string | undefined,
  note: string | undefined,
): LoiDieuKhoan | null => {
  if (term === undefined) return null;
  const co = (note ?? '').trim() !== '';
  if (term === 'KHAC' && !co) {
    return {
      code: 'DEBT_NOTE_REQUIRED',
      field: 'debtNote',
      message: 'Chọn "Khác" thì phải ghi rõ điều khoản thanh toán.',
    };
  }
  if (term !== 'KHAC' && co) {
    return {
      code: 'DEBT_NOTE_NOT_ALLOWED',
      field: 'debtNote',
      message: 'Chỉ điều khoản "Khác" mới có phần ghi rõ nội dung.',
    };
  }
  return null;
};
