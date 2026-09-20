/**
 * Ô NHẬP NGÀY dạng `dd/mm/yyyy` (`0208`, khách hàng chốt 20/09).
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO PHẢI TỰ DỰNG, ĐO ĐƯỢC CHỨ KHÔNG SUY
 * ---------------------------------------------------------------------------
 *
 * Tới `0207` sáu ô ngày của phần mềm đều là `<input type="date">`, và **trình
 * duyệt quyết định lối viết, không phải mã nguồn**. Đo trên Chromium thật (dựng
 * qua Gotenberg, cùng lối `0179`) với bốn ô: một không khai `lang`, ba khai
 * `lang="vi"` · `lang="vi-VN"` · `lang="en-GB"`. **Cả bốn ra `09/20/2026`** —
 * thuộc tính `lang` không có tác dụng nào, vì Chromium đọc ngôn ngữ GIAO DIỆN
 * của trình duyệt chứ không đọc tài liệu.
 *
 * Nên không có bản sửa kiểu *"thêm một thuộc tính vào sáu ô"*. Muốn chắc chắn
 * `dd/mm/yyyy` trên mọi máy thì ô phải là ô CHỮ do phần mềm tự định dạng; bộ
 * chọn lịch lấy lại bằng một ô `type="date"` ẩn cộng `showPicker()`.
 *
 * ---------------------------------------------------------------------------
 * BA HÀM, HAI LỐI VIẾT, VÀ RANH GIỚI GIỮA CHÚNG
 * ---------------------------------------------------------------------------
 *
 * Máy chủ nhận và trả `yyyy-mm-dd` (`ngayIso` của `@csbh/http-kit`), màn hình
 * bày `dd/mm/yyyy`. Ba hàm dưới đây là chỗ DUY NHẤT dịch giữa hai lối ấy; mọi
 * nơi dùng chỉ thấy chuỗi ISO, đúng như khi còn dùng `<input type="date">`.
 *
 * **KHÔNG dùng `ngay()` của `format.ts`** để in ra, dù nó cũng cho `dd/mm/yyyy`:
 * hàm ấy trả lời một câu KHÁC — *"in cái MỐC THỜI GIAN này theo giờ Việt Nam"* —
 * nên nó đi qua `Date` và một phép đổi múi giờ. Ở đây đầu vào là một NGÀY TRÊN
 * LỊCH, không có giờ, không có múi giờ; đẩy nó qua `Date` là mở đúng cái cửa
 * làm lệch một ngày mà `0128` đã ghi (`current_date` của Postgres theo giờ Việt
 * Nam, `toISOString()` theo UTC, và hai bên lệch nhau từ 00:00 tới 07:00). Phép
 * đổi ở đây là cắt chuỗi, không tính toán gì. Có ca kiểm đòi hai hàm cho cùng
 * một kết quả trên mọi ngày hợp lệ, để chúng không âm thầm trôi khỏi nhau.
 */

/** Đúng một ngày có thật trên lịch — cùng phép kiểm `ngayIso()` của máy chủ. */
const coThat = (nam: number, thang: number, ngay: number): boolean => {
  /*
   * `Date.UTC` rồi ĐỌC NGƯỢC RA để so, chứ không tin vào lượt dựng.
   *
   * `new Date('2026-02-31')` KHÔNG ném lỗi — nó trôi sang 03/03. Đây là bẫy
   * `0136` đã ghi, và nó là lý do phép kiểm phải có ba vế đọc ngược.
   *
   * `Date.UTC` chứ không `new Date(nam, thang, ngay)`: bản sau dựng theo múi giờ
   * của MÁY, nên cùng một chuỗi cho hai kết quả ở hai máy.
   */
  const d = new Date(Date.UTC(nam, thang - 1, ngay));
  return (
    d.getUTCFullYear() === nam && d.getUTCMonth() === thang - 1 && d.getUTCDate() === ngay
  );
};

/**
 * Chuỗi người dùng vừa gõ → `dd/mm/yyyy` đang dở.
 *
 * Giữ lại CHỮ SỐ, bỏ mọi thứ khác, rồi chèn dấu gạch vào đúng hai chỗ. Tối đa
 * tám chữ số: gõ tiếp cũng không nhận, vì một ô ngày không có gì để nhận thêm.
 *
 * **CHỈ CHÈN, KHÔNG BAO GIỜ VIẾT LẠI PHẦN ĐÃ GÕ** — và nơi dùng chỉ gọi hàm này
 * khi con trỏ đang ở CUỐI ô. Đây là bài học `0087`: ô tiền từng chèn dấu phân
 * nhóm ngay giữa lúc gõ, và bộ gõ tiếng Việt giữ bộ đệm riêng nên mỗi ký tự lạ
 * mọc ra giữa chuỗi làm lượt xoá lùi kế tiếp ăn nhầm chữ số. Dấu gạch của ngày
 * an toàn hơn vì nó chỉ mọc ở cuối và không bao giờ dịch chỗ — nhưng chỉ đúng
 * chừng nào phép chèn không chạm tới phần nằm TRƯỚC con trỏ.
 */
export const matNaNgay = (raw: string): string => {
  const so = raw.replace(/\D/g, '').slice(0, 8);
  if (so.length <= 2) return so;
  if (so.length <= 4) return `${so.slice(0, 2)}/${so.slice(2)}`;
  return `${so.slice(0, 2)}/${so.slice(2, 4)}/${so.slice(4)}`;
};

/**
 * `dd/mm/yyyy` → `yyyy-mm-dd`, hoặc chuỗi RỖNG nếu chưa đủ hoặc không có thật.
 *
 * Rỗng chứ không `null`: nơi dùng đem thẳng giá trị này đặt vào state vốn đang
 * giữ chuỗi ISO của `<input type="date">`, và ô ngày trống cũng là `''` ở đó.
 * Thêm một dạng thứ ba là bắt sáu chỗ dùng phân biệt *"chưa gõ"* với *"gõ sai"*,
 * trong khi cả hai đều có nghĩa là **chưa có ngày nào để gửi đi**.
 */
export const isoTuNgay = (s: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return '';
  const [ngay, thang, nam] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!coThat(nam, thang, ngay)) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
};

/**
 * `yyyy-mm-dd` → `dd/mm/yyyy`, hoặc chuỗi RỖNG.
 *
 * Nhận cả chuỗi ISO có phần giờ (`2026-09-20T00:00:00.000Z`): `pg` dựng cột
 * `date` của Postgres thành chuỗi ấy, và `ChietKhau` đã phải tự cắt mười ký tự
 * đầu từ `0043`. Cắt ở đây một lần thì nơi dùng thôi phải nhớ.
 */
export const ngayTuIso = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '').trim());
  if (!m) return '';
  if (!coThat(Number(m[1]), Number(m[2]), Number(m[3]))) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
};
