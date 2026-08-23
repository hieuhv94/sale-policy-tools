/**
 * Phép toán của bộ vẽ biểu đồ — thuần, không JSX, không DOM (`0094`).
 *
 * TÁCH RA KHỎI COMPONENT vì đây là chỗ duy nhất trong bộ vẽ có thể sai một cách
 * IM LẶNG: một cột cao sai 8% thì không ai nhìn ra, trong khi một cột không hiện
 * ra thì ai cũng thấy. Kiểm bằng bảng số ở `tests/web/bieu-do.test.ts`.
 *
 * VẼ BẰNG SVG TỰ VIẾT, không thư viện. Ràng buộc của dự án là web không dùng thư
 * viện component, và một thư viện biểu đồ còn nặng hơn thế: bộ nhỏ nhất cũng
 * ~40KB nén, trong khi cả gói hiện tại phải dưới 250KB (`FE-38`). Sáu dạng hình
 * đã chốt thì vẽ tay hết chưa tới 300 dòng.
 */

/** Khung vẽ: toạ độ trong `viewBox`, không phải pixel trên màn hình. */
export const KHUNG = { rong: 640, leTrai: 36, lePhai: 8, leTren: 12, leDuoi: 24 };

/**
 * Cỡ chữ trong hình — ĐƠN VỊ NGƯỜI DÙNG của `viewBox`, không phải pixel.
 *
 * Khai bằng thuộc tính SVG chứ không bằng CSS, và đó không phải chuyện phong
 * cách: `FE-11` cấm `font-size` theo `px` vì cỡ chữ hệ thống 200% phải phóng
 * được. Chữ trong `viewBox` thì phóng theo chính khung hình — nó là toạ độ, cùng
 * loại với `leTrai` ngay trên. Để nó ở CSS là khai một con số toạ độ dưới dạng
 * một thuộc tính chữ, và phép quét của `FE-11` bắt đúng.
 */
export const CHU = { tri: 10.5, ten: 12, nho: 10.5, trongO: 11.5, nhan: 11 };

/**
 * BƯỚC chia của trục tung — 1, 2, 5 hoặc 10 nhân một luỹ thừa của mười.
 *
 * Nhắm khoảng năm vạch, rồi làm tròn bước LÊN tới một con số người ta đọc ra
 * được. Không lấy `max/5` thô: trục sẽ mang những nhãn kiểu 4,96 · 9,92 · 14,88,
 * và một trục như thế thì mắt phải đọc từng chữ số thay vì liếc qua.
 *
 * KHÔNG có 2,5 trong danh sách, dù đó là một bước "đẹp" theo thông lệ: mọi con
 * số trên trang này là **số hồ sơ**, và một vạch ghi 2,5 hồ sơ thì vô nghĩa.
 */
export function buocTruc(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const tho = max / 5;
  const bac = Math.pow(10, Math.floor(Math.log10(tho)));
  for (const m of [1, 2, 5, 10]) {
    if (bac * m >= tho) return bac * m;
  }
  return bac * 10;
}

/**
 * Trần trục tung: bội số nhỏ nhất của bước mà vẫn phủ hết dữ liệu.
 *
 * Không lấy thẳng giá trị lớn nhất — đường sẽ chạm sát mép trên và mắt không
 * còn chỗ để thấy nó đang đi lên hay đã kịch trần.
 */
export function tran(max: number): number {
  const b = buocTruc(max);
  if (!Number.isFinite(max) || max <= 0) return b;
  return Math.max(b, Math.ceil(max / b) * b);
}

/** Đổi một giá trị thành toạ độ y trong khung. */
export const toaDoY = (v: number, max: number, cao: number): number => {
  const y0 = KHUNG.leTren;
  const y1 = cao - KHUNG.leDuoi;
  if (max <= 0) return y1;
  return y1 - (Math.max(v, 0) / max) * (y1 - y0);
};

/** Toạ độ x của điểm thứ `i` trong `n` điểm, chia đều hai đầu. */
export const toaDoX = (i: number, n: number): number => {
  const x0 = KHUNG.leTrai;
  const x1 = KHUNG.rong - KHUNG.lePhai;
  if (n <= 1) return x0;
  return x0 + ((x1 - x0) / (n - 1)) * i;
};

/** Bề rộng một ô cột khi có `n` cột. */
export const oCot = (n: number): number =>
  n <= 0 ? 0 : (KHUNG.rong - KHUNG.leTrai - KHUNG.lePhai) / n;

/** Chuỗi `points` cho `<polyline>`. */
export const duongGap = (diem: number[], max: number, cao: number): string =>
  diem.map((v, i) => `${toaDoX(i, diem.length).toFixed(1)},${toaDoY(v, max, cao).toFixed(1)}`).join(' ');

/** Đa giác phủ dưới đường — cùng các điểm, đóng lại ở đáy. */
export function vungDuoi(diem: number[], max: number, cao: number): string {
  if (diem.length === 0) return '';
  const day = (cao - KHUNG.leDuoi).toFixed(1);
  return `${KHUNG.leTrai},${day} ${duongGap(diem, max, cao)} ${(KHUNG.rong - KHUNG.lePhai).toFixed(1)},${day}`;
}

/**
 * Các vạch trục tung: 0 rồi cộng dần một bước cho tới trần.
 *
 * Suy từ CHÍNH `buocTruc` chứ không chia trần làm ba phần: chia ba thì trần 10
 * cho ra 0 · 3,33 · 6,67 · 10, và làm tròn chúng lại thành 0 · 3 · 7 · 10 —
 * những vạch không cách đều nhau nhưng trông như cách đều.
 */
export function mocTruc(max: number): number[] {
  const b = buocTruc(max);
  const ra: number[] = [];
  for (let v = 0; v <= max + b / 1000; v += b) ra.push(Number(v.toFixed(6)));
  return ra;
}

/**
 * Bao nhiêu nhãn thì in một cái, để chúng KHÔNG BAO GIỜ đè lên nhau (`0095`).
 *
 * Tính từ chỗ trống thật có, không phải một con số chọn tay: bề rộng vẽ chia cho
 * bề rộng một nhãn. Bề rộng nhãn ước lượng bằng `số ký tự × 0,58 × cỡ chữ` —
 * đúng cho phông chữ không đều bề ngang ở mức cần thiết, vì kết quả chỉ dùng để
 * chọn bước nhảy, và chọn dư một nấc thì thưa hơn một chút chứ không hỏng.
 *
 * Bản trước để `moiN` cho từng chỗ gọi tự truyền. Sai ở chỗ: con số ấy đúng cho
 * một bề rộng và một độ dài nhãn CỤ THỂ, nên đổi nhãn `Tháng 8/2026` thành
 * `8/26`, hay xếp hình vào lưới hai cột, là nó sai ngay — mà sai thì không có
 * gì báo, chỉ có chữ chồng lên chữ.
 */
export function buocNhan(soNhan: number, daiNhat: number): number {
  const rongVe = KHUNG.rong - KHUNG.leTrai - KHUNG.lePhai;
  const chuaVua = Math.floor(rongVe / (daiNhat * 0.58 * CHU.nhan + 8));
  // Không đủ chỗ cho hai nhãn thì in đúng MỘT — và nhãn ấy là nhãn cuối, xem
  // `inNhan`. Trả về `soNhan` khiến mọi chỉ số khác đều rớt.
  if (chuaVua <= 1) return Math.max(soNhan, 1);
  /*
   * Với bước `k`, số nhãn in ra là `floor((n-1)/k) + 1` — KHÔNG phải `n/k`.
   *
   * Bản đầu dùng `n/k` và ca kiểm bắt được ngay: 5 kỳ với nhãn 21 ký tự cho ra
   * bước 1, tức in cả 5 nhãn trên chỗ chỉ chứa nổi 4. Sai một đơn vị ở đây
   * không hỏng to, nó chỉ làm hai nhãn chồng lên nhau — thứ mà đọc mã không
   * thấy, nhìn màn hình mới thấy.
   */
  return Math.max(1, Math.ceil((soNhan - 1) / (chuaVua - 1)));
}

/**
 * Nhãn nào được in trên trục hoành.
 *
 * Luôn in nhãn CUỐI (kỳ đang chạy — thứ người ta tìm trước), rồi lùi đều về
 * trước, để nhãn quan trọng nhất không bao giờ là cái bị bỏ.
 */
export const inNhan = (i: number, n: number, moiN: number): boolean =>
  i === n - 1 || (n - 1 - i) % moiN === 0;

/** Cộng chồng: trả về mốc đáy của từng lớp tại một vị trí. */
export function chong(lop: number[][], i: number): number[] {
  const day: number[] = [];
  let cong = 0;
  for (const l of lop) {
    day.push(cong);
    cong += l[i] ?? 0;
  }
  return day;
}

/** Tổng của từng cột khi các lớp chồng lên nhau. */
export const tongChong = (lop: number[][], n: number): number[] =>
  Array.from({ length: n }, (_, i) => lop.reduce((a, l) => a + (l[i] ?? 0), 0));

/**
 * Phần trăm của từng đoạn trong thanh 100%.
 *
 * Tổng bằng 0 thì trả về mảng 0 chứ KHÔNG chia — một người chưa gửi hồ sơ nào
 * không có "cơ cấu", và vẽ một thanh chia đều là bịa ra dữ liệu.
 */
export function tyLeDoan(so: number[]): number[] {
  const tong = so.reduce((a, b) => a + b, 0);
  if (tong <= 0) return so.map(() => 0);
  return so.map((v) => (v / tong) * 100);
}
