/**
 * Kỳ thống kê: tuần · tháng · quý · năm (`0093`).
 *
 * ĐẶT Ở HTTP-KIT chứ không ở reporting, vì HAI service phải cắt kỳ giống hệt
 * nhau: `reporting` gom hồ sơ, `audit` gom sự kiện hệ thống, và cả hai cùng hiện
 * lên một màn hình *Thống kê*. Hai phép cắt kỳ viết riêng ở hai nơi thì đến ngày
 * chúng lệch nhau một giờ, người xem thấy "Tháng 8" của khối trên không khớp
 * "Tháng 8" của khối dưới mà không có gì nói vì sao.
 *
 * MỌI RANH GIỚI CẮT THEO GIỜ VIỆT NAM. Hồ sơ được duyệt lúc 23:30 ngày 31 rơi
 * sang tháng sau nếu cắt theo UTC — và con số cuối tháng lệch mà không ai giải
 * thích được. Đây là chỗ ĐẦU TIÊN trong cả hệ thống cần tới `AT TIME ZONE`;
 * trước `0093` chỉ có tên file Excel là theo giờ Việt Nam.
 *
 * Cộng trừ theo giờ thay vì gọi `Intl`: Việt Nam ở UTC+7 cố định, không có giờ
 * mùa hè, nên phép dịch 7 tiếng là ĐÚNG với mọi mốc trong quá khứ lẫn tương lai
 * — và nó cho ra một hàm thuần, kiểm được bằng bảng số.
 */
import { BadRequestException } from '@nestjs/common';

/**
 * HÔM NAY theo giờ Việt Nam, dạng `yyyy-mm-dd` (`0180`).
 *
 * Ở ĐÂY chứ không ở service nào, và cũng vì lý do đã viết cho phép cắt kỳ ngay
 * trên: câu hỏi *"hôm nay là ngày nào"* được hỏi ở nhiều chỗ, và hai bản chép
 * sẽ lệch nhau vào đúng cái khe mà `0128` đã đo được — `current_date` của
 * Postgres theo giờ Việt Nam, `new Date().toISOString()` theo UTC, và từ 00:00
 * tới 07:00 giờ Việt Nam hai bên nói hai ngày khác nhau. Ca kiểm viết bằng bản
 * sai sẽ XANH mười bảy giờ mỗi ngày và đỏ bảy giờ còn lại.
 *
 * `0180` đưa nó lên đây khi ngày áp dụng chuyển xuống từng dòng sản phẩm: từ đó
 * `policy` hỏi câu này ở ba đường ghi, và bộ kiểm hỏi lại để đối chiếu.
 */
export const ngayVN = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

export type Ky = 'tuan' | 'thang' | 'quy' | 'nam';

export const MOI_KY: Ky[] = ['tuan', 'thang', 'quy', 'nam'];

/**
 * Đơn vị `date_trunc` của Postgres cho từng kỳ.
 *
 * Bảng tra chứ không ghép chuỗi từ tham số người dùng: `date_trunc` nhận đơn vị
 * dưới dạng chuỗi, nên một tham số đi thẳng vào đó là một chỗ tiêm SQL. Đây cũng
 * là lý do `docKy()` bên dưới chỉ trả về một trong bốn giá trị đã khai.
 */
export const DON_VI: Record<Ky, string> = {
  tuan: 'week',
  thang: 'month',
  quy: 'quarter',
  nam: 'year',
};

/** Múi giờ cắt kỳ. Một hằng số, dùng ở cả SQL lẫn JS. */
export const MUI_GIO = 'Asia/Ho_Chi_Minh';

const GIO = 3600_000;
const LECH = 7 * GIO;

/** Số kỳ mặc định của từng nhịp — đủ dài để thấy xu hướng, đủ ngắn để đọc hết. */
export const SO_KY_MAC_DINH: Record<Ky, number> = {
  tuan: 12,
  thang: 12,
  quy: 8,
  nam: 5,
};

/**
 * Trần số kỳ.
 *
 * Không phải để chống tải — mỗi kỳ là một dòng trong một phép gom nhóm đã chạy
 * rồi. Nó là trần của thứ ĐỌC ĐƯỢC: một bảng 60 dòng thì không ai đọc, và người
 * muốn nhìn xa hơn nên đổi nhịp chứ không nên kéo dài bảng.
 */
export const SO_KY_MAX = 24;

/** Các trường lịch theo GIỜ VIỆT NAM của một mốc. */
const lich = (d: Date) => {
  const t = new Date(d.getTime() + LECH);
  return {
    nam: t.getUTCFullYear(),
    thang: t.getUTCMonth(),
    ngay: t.getUTCDate(),
    /** 0 = Chủ nhật, như `getUTCDay`. */
    thu: t.getUTCDay(),
  };
};

/** Dựng lại một mốc từ ngày tháng GIỜ VIỆT NAM (0 giờ 0 phút). */
const tuLich = (nam: number, thang: number, ngay: number): Date =>
  new Date(Date.UTC(nam, thang, ngay) - LECH);

/** Đầu kỳ chứa mốc `d`, tính theo giờ Việt Nam. */
export function dauKy(ky: Ky, d: Date): Date {
  const l = lich(d);
  switch (ky) {
    case 'tuan': {
      // Tuần bắt đầu THỨ HAI (quy ước ISO, cũng là mặc định của `date_trunc`).
      // Chủ nhật (`thu = 0`) là ngày cuối tuần trước, nên lùi 6 ngày chứ không
      // phải 0 — chỗ sai kinh điển của mọi phép tính tuần.
      const lui = (l.thu + 6) % 7;
      return tuLich(l.nam, l.thang, l.ngay - lui);
    }
    case 'thang':
      return tuLich(l.nam, l.thang, 1);
    case 'quy':
      return tuLich(l.nam, Math.floor(l.thang / 3) * 3, 1);
    case 'nam':
      return tuLich(l.nam, 0, 1);
  }
}

/** Đầu kỳ liền sau kỳ chứa `d` — cũng chính là mốc kết thúc (nửa mở) của kỳ ấy. */
export function kyKe(ky: Ky, d: Date, buoc = 1): Date {
  const l = lich(dauKy(ky, d));
  switch (ky) {
    case 'tuan':
      return tuLich(l.nam, l.thang, l.ngay + 7 * buoc);
    case 'thang':
      return tuLich(l.nam, l.thang + buoc, 1);
    case 'quy':
      return tuLich(l.nam, l.thang + 3 * buoc, 1);
    case 'nam':
      return tuLich(l.nam + buoc, 0, 1);
  }
}

/**
 * Số tuần ISO — con số người ta nói với nhau ("tuần 34").
 *
 * Quy ước ISO: tuần chứa thứ Năm thuộc về năm của thứ Năm ấy. Không có luật đó
 * thì tuần bắc cầu giữa hai năm mang hai số khác nhau tuỳ ai đếm.
 */
export function soTuanIso(d: Date): { tuan: number; nam: number } {
  const dau = dauKy('tuan', d);
  const l = lich(dau);
  // Thứ Năm của chính tuần này quyết định năm.
  const thuNam = tuLich(l.nam, l.thang, l.ngay + 3);
  const ln = lich(thuNam);
  /*
   * Đếm từ MÙNG MỘT của năm ấy, không phải từ đầu tuần chứa mùng một.
   *
   * Nghe thì trái tai, nhưng đúng: tuần 1 là tuần chứa thứ Năm đầu tiên, nên
   * khoảng cách từ mùng một tới thứ Năm của tuần 1 luôn dưới 7 ngày — dù mùng
   * một rơi vào thứ mấy. Lấy đầu tuần chứa mùng một làm gốc thì năm nào bắt đầu
   * từ thứ Sáu trở đi sẽ ra số tuần lớn hơn thật một đơn vị.
   */
  const soNgay = Math.round((thuNam.getTime() - tuLich(ln.nam, 0, 1).getTime()) / (24 * GIO));
  return { tuan: Math.floor(soNgay / 7) + 1, nam: ln.nam };
}

const hai = (n: number): string => String(n).padStart(2, '0');

/**
 * Nhãn hiện trên màn hình.
 *
 * Tuần KÈM KHOẢNG NGÀY: "Tuần 34" đứng một mình thì không ai nhẩm ra là tuần
 * nào, và người đọc báo cáo luôn phải đối chiếu với một sự việc có ngày tháng.
 */
export function nhanKy(ky: Ky, d: Date): string {
  const dau = dauKy(ky, d);
  const l = lich(dau);
  switch (ky) {
    case 'tuan': {
      const { tuan } = soTuanIso(dau);
      const cuoi = lich(new Date(kyKe('tuan', dau).getTime() - 1));
      return `Tuần ${tuan} · ${hai(l.ngay)}/${hai(l.thang + 1)}–${hai(cuoi.ngay)}/${hai(cuoi.thang + 1)}`;
    }
    case 'thang':
      return `Tháng ${l.thang + 1}/${l.nam}`;
    case 'quy':
      return `Quý ${Math.floor(l.thang / 3) + 1}/${l.nam}`;
    case 'nam':
      return `Năm ${l.nam}`;
  }
}

/** Nhãn ngắn cho trục biểu đồ. Xem `nhanNgan` ở `MotKy`. */
export function nhanNganKy(ky: Ky, d: Date): string {
  const dau = dauKy(ky, d);
  const l = lich(dau);
  const namNgan = String(l.nam).slice(2);
  switch (ky) {
    case 'tuan':
      return `T${soTuanIso(dau).tuan}`;
    case 'thang':
      return `${l.thang + 1}/${namNgan}`;
    case 'quy':
      return `Q${Math.floor(l.thang / 3) + 1}/${namNgan}`;
    case 'nam':
      return String(l.nam);
  }
}

/**
 * Mã kỳ — khoá để ghép dòng SQL với dòng trên màn hình.
 *
 * Cùng dạng với thứ `date_trunc(... AT TIME ZONE 'Asia/Ho_Chi_Minh')` trả về sau
 * khi cắt lấy phần ngày, nên hai bên khớp nhau mà không cần bảng đối chiếu.
 */
export const maKy = (ky: Ky, d: Date): string => {
  const l = lich(dauKy(ky, d));
  return `${l.nam}-${hai(l.thang + 1)}-${hai(l.ngay)}`;
};

export type MotKy = {
  ma: string;
  nhan: string;
  /**
   * Nhãn NGẮN cho trục biểu đồ — `T34` · `8/26` · `Q3/26` · `2026` (`0095`).
   *
   * Nhãn đầy đủ của tuần là *"Tuần 34 · 17/08–23/08"*: đọc rất rõ trong một
   * dòng chữ, và chồng lên nhau ngay từ nhãn thứ hai khi nằm trên trục hoành.
   * Hai nhãn cho hai chỗ, không phải một nhãn cắt bớt — chỗ nào cũng cần bản
   * đúng của nó, và `nhan` vẫn là thứ trình đọc màn hình nghe.
   */
  nhanNgan: string;
  /** Nửa mở `[tu, den)`, dạng ISO — đúng cách mọi truy vấn ở đây so sánh. */
  tu: string;
  den: string;
  /** Kỳ ĐANG CHẠY, chưa đủ ngày. Mọi so sánh với nó phải nói ra điều đó. */
  dangChay: boolean;
};

/**
 * `soKy` kỳ gần nhất, CŨ TRƯỚC MỚI SAU, kỳ cuối là kỳ đang chạy.
 *
 * Thứ tự tăng dần vì đây là dữ liệu để vẽ đường; màn hình muốn mới-trước thì tự
 * đảo. Trả ngược lại ở đây là bắt mọi người vẽ biểu đồ phải đảo lại một lần nữa.
 */
export function chuoiKy(ky: Ky, soKy: number, bayGio = new Date()): MotKy[] {
  const ra: MotKy[] = [];
  for (let i = soKy - 1; i >= 0; i--) {
    const dau = kyKe(ky, bayGio, -i);
    ra.push({
      ma: maKy(ky, dau),
      nhan: nhanKy(ky, dau),
      nhanNgan: nhanNganKy(ky, dau),
      tu: dau.toISOString(),
      den: kyKe(ky, dau).toISOString(),
      dangChay: i === 0,
    });
  }
  return ra;
}

/**
 * Kỳ đang chạy mới đi được bao nhiêu — và mốc tương ứng ở kỳ trước.
 *
 * QUY TẮC "CÙNG SỐ NGÀY". Hôm nay ngày 22 mà đặt tháng này cạnh tháng trước là
 * so 22 ngày với 31 ngày: mọi chỉ số đều "giảm", và cái giảm ấy không nói gì về
 * công việc. Nên kỳ trước chỉ được tính tới ĐÚNG mốc mà kỳ này đang đứng.
 *
 * Cắt bằng cách cộng đúng khoảng thời gian đã trôi vào đầu kỳ trước, không phải
 * bằng cách đếm ngày: tuần thì "cùng số ngày" đọc ra là "cùng số giờ", và một
 * phép cộng khoảng thời gian đúng cho cả bốn nhịp.
 */
export function mocCungKhoang(ky: Ky, bayGio = new Date()): { daQua: number; denKyTruoc: string } {
  const dau = dauKy(ky, bayGio);
  const daQua = bayGio.getTime() - dau.getTime();
  return {
    daQua,
    denKyTruoc: new Date(kyKe(ky, bayGio, -1).getTime() + daQua).toISOString(),
  };
}

/** Đọc tham số `ky`. Bỏ trống thì lấy `macDinh` — mỗi vai trò có nhịp riêng. */
export function docKy(v: string | undefined, macDinh: Ky = 'thang'): Ky {
  if (v === undefined || v === '') return macDinh;
  if ((MOI_KY as string[]).includes(v)) return v as Ky;
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    field: 'ky',
    message: `ky phải là một trong: ${MOI_KY.join(', ')}`,
  });
}

/** Đọc tham số `soKy`. */
export function docSoKy(v: string | undefined, ky: Ky): number {
  if (v === undefined || v === '') return SO_KY_MAC_DINH[ky];
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > SO_KY_MAX) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'soKy',
      message: `soKy phải là số nguyên trong khoảng 1..${SO_KY_MAX}`,
    });
  }
  return n;
}
