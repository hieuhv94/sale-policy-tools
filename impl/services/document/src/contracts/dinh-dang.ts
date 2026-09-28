/**
 * Chữ và số dùng chung cho mọi văn bản `document` sinh ra.
 *
 * Tệp này là phần CÒN LẠI của `render/sheet.ts` sau `0103`. Tệp cũ dựng bản CSBH
 * A4 bằng HTML rồi cho Chromium in ra — một đường dựng văn bản THỨ HAI, song song
 * với đường mẫu `.docx`. Nó chỉ còn phục vụ bản lưu ký số, mà `0103` bỏ hẳn bản
 * lưu ấy, nên phần dựng HTML đi theo. Còn lại đúng những thứ có người dùng thật:
 * nhãn trạng thái, thông tin Công ty, và ba phép định dạng.
 *
 * Đổi chỗ chứ không để nguyên tên cũ: một tệp tên `render/sheet.ts` mà không dựng
 * `sheet` nào nữa là một cái tên nói dối, và mọi người dùng nó đều nằm trong
 * `contracts/`.
 *
 * Định dạng tiền, ngày và phần trăm áp ở ĐÂY, không ở tầng nào khác (Hình 4).
 */
import type { PolicyLine } from '../infra/clients.js';

export const STATUS_LABEL: Record<string, string> = {
  NHAP: 'Nháp',
  CHO_TBP_DUYET: 'Chờ Trưởng bộ phận duyệt',
  CHO_KT_L1: 'Chờ KT duyệt L1',
  SA_DANG_XU_LY: 'Sale Admin đang xử lý',
  SA_SUA_BAN_CUNG: 'Sale Admin sửa bản cứng',
  CHO_KT_L2: 'KT duyệt bản cứng',
  DANG_CO_HIEU_LUC: 'Đang có hiệu lực',
  HET_HIEU_LUC: 'Hết hiệu lực',
  YEU_CAU_CHINH_SUA: 'Yêu cầu chỉnh sửa',
  QUA_HAN_DUYET: 'Quá hạn duyệt',
  DA_XOA: 'Đã xoá',
};

/**
 * Thông tin Công ty — NGUỒN SỰ THẬT DUY NHẤT của tên in trên giấy tờ (`0151`).
 *
 * Khách hàng đổi tên pháp nhân 29/08: *Cổ phần Dinh dưỡng* → *TNHH Dược phẩm*.
 * Lượt ấy tìm ra tên cũ nằm ở **sáu chỗ trong mã** cộng bốn tệp `.docx` nhị
 * phân, và hằng này là chỗ duy nhất trong sáu chỗ ấy **không ai đọc**: `0150`
 * gỡ `ensureDefault` — người dùng cuối cùng của nó — mà để lại dòng `import`,
 * nên `tsc` im và hằng thành mã chết mang một cái tên đã sai.
 *
 * Nên `0151` KHÔNG chỉ sửa chuỗi: `tao-mau-ho-so.ts` và `seed-demo.ts` giờ đọc
 * từ đây. Mỗi chỗ tự gõ lại tên là một chỗ nữa phải nhớ vào lượt đổi tên sau, và
 * lượt này đã chứng minh không ai nhớ nổi sáu chỗ.
 *
 * ĐỊA CHỈ VÀ MÃ SỐ THUẾ GIỮ NGUYÊN (chốt 29/08) — chỉ tên pháp nhân đổi.
 *
 * `name` viết HOA vì nó in ở đầu văn bản. Màn hình đăng nhập dùng dạng chữ
 * thường và **không** đọc được hằng này — giao diện là gói riêng, không import
 * được từ một service. Đó là chỗ hở duy nhất còn lại, và `ten-cong-ty.test.ts`
 * canh nó bằng cách quét cả repo tìm tên cũ.
 */
export const COMPANY = {
  name: 'CÔNG TY TNHH DƯỢC PHẨM NUTRICARE',
  address: 'Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội',
  taxCode: '0102345678',
} as const;

/** Dòng địa chỉ + MST đứng ngay dưới tên, ở cả ba mẫu (`0151`). */
export const COMPANY_ADDRESS_LINE = `${COMPANY.address} — MST ${COMPANY.taxCode}`;

/** Tiền: dấu phân nhóm nghìn kiểu Việt Nam. Số nguyên đồng, không phần thập phân. */
export const money = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '—' : BigInt(v).toLocaleString('vi-VN');

export const dmy = (v: string | null | undefined): string => {
  if (!v) return '—';
  const p = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(v));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')}`;
};

/**
 * MỐC THỜI GIAN cho TÊN TỆP — `dd-mm-yyyy HHhMM`, giờ Việt Nam (`0208`).
 *
 * Dấu ngăn ngày là `-` chứ không `/`: chuỗi này đi vào tên tệp và vào
 * `Content-Disposition`, mà `/` là ký tự ngăn thư mục — cùng lý do `chuanHoaMa`
 * của `0198` chặn nó ở mã hồ sơ. Ngày vẫn đứng trước tháng, đúng lối đọc của
 * mọi chỗ khác trong phần mềm.
 *
 * Nằm cạnh `dmy` chứ không ở `render.service`: hai hàm trả lời cùng một câu
 * (*"đọc mốc thời gian này theo lối Việt Nam"*), và tách chúng ra hai tệp là
 * dựng hai bản sẽ trôi khỏi nhau ở lượt sửa múi giờ kế tiếp.
 */
export const dmyHm = (d: Date): string => {
  const p = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}-${g('month')}-${g('year')} ${g('hour')}h${g('minute')}`;
};

/** Tỷ lệ: đúng HAI chữ số thập phân, khớp từng ký tự con số trên màn hình (CALC-09). */
export const pct = (v: string | null | undefined): string =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}%`;

/**
 * Số cột CPBH của cả bảng = dòng NHIỀU KHOẢN NHẤT.
 *
 * Mỗi dòng có số khoản chi phí riêng, nhưng một bảng in ra giấy phải có số cột
 * đều nhau — cột so le thì không đọc theo hàng dọc được, và người ký không đối
 * chiếu nổi. Dòng ít khoản hơn để ô TRỐNG, không điền số 0: số 0 là một con số
 * có nghĩa ("khoản này bằng không"), còn ô trống nói đúng điều cần nói là dòng
 * ấy không có khoản thứ mấy đó.
 *
 * Không dòng nào có khoản nào thì bảng không có cột CPBH — thay vì bốn cột số 0
 * như bản trước 0021.
 */
export const soCotCpbh = (lines: readonly PolicyLine[]): number =>
  lines.reduce((max, l) => Math.max(max, l.cpbh?.length ?? 0), 0);
