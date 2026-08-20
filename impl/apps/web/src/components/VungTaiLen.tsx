/**
 * **Vùng tải lên** — kéo thả vào, hoặc bấm vào giữa để chọn file (`0069`).
 *
 * Đứng CẠNH các thẻ tệp đã có, cùng một hàng, cùng kích thước. Đó là cả điểm của
 * nó: chỗ để thêm tệp nằm ngay cuối những tệp đang có, nên người dùng không phải
 * đi tìm một cái nút ở đâu khác rồi quay lại.
 *
 * BA ĐƯỜNG VÀO CÙNG MỘT VIỆC, và cả ba đều phải chạy:
 *
 *   1. **Kéo thả** — nhanh nhất khi file đang mở sẵn trong thư mục.
 *   2. **Bấm** vào giữa vùng — đường mà ai cũng đoán ra.
 *   3. **Bàn phím** — vùng là một `<button>` thật, nên Tab tới rồi Enter là mở
 *      hộp chọn file. Dựng bằng `<div onClick>` thì bàn phím không tới được, và
 *      đó là kiểu hỏng không ai thấy cho tới khi có người không dùng chuột.
 *
 * `<input type="file">` nằm ẩn phía sau và là thứ THẬT SỰ mở hộp chọn file: mọi
 * cách dựng khác đều phải mô phỏng lại một hộp thoại của hệ điều hành.
 */
import { useRef, useState } from 'react';

export function VungTaiLen({
  nhan = 'Kéo thả tệp vào đây',
  accept,
  dangTai = false,
  chon,
}: {
  nhan?: string;
  /** Lọc phần mở rộng ở hộp chọn file, ví dụ `.docx`. Bỏ trống là nhận mọi loại. */
  accept?: string;
  dangTai?: boolean;
  chon: (f: File) => void;
}) {
  const o = useRef<HTMLInputElement>(null);
  const [dangKeo, datDangKeo] = useState(false);

  const nhan_ = (ds: FileList | null) => {
    const f = ds?.[0];
    // MỘT tệp mỗi lượt, kể cả khi người dùng thả cả nắm vào: mỗi lượt tải lên là
    // hai lời gọi ở hai service, và một vòng lặp lỗi giữa chừng để lại đúng thứ
    // khó giải thích nhất — vài tệp đã vào, vài tệp chưa, không rõ tệp nào.
    if (f) chon(f);
  };

  return (
    <button
      type="button"
      className={dangKeo ? 'vung-tai-len dang-keo' : 'vung-tai-len'}
      disabled={dangTai}
      onClick={() => o.current?.click()}
      onDragOver={(e) => {
        // `preventDefault` ở CẢ `dragover` lẫn `drop`: thiếu cái đầu thì trình
        // duyệt không coi đây là đích thả, và `drop` không bao giờ chạy — nó mở
        // file trong tab mới thay vì đưa cho ta.
        e.preventDefault();
        datDangKeo(true);
      }}
      onDragLeave={() => datDangKeo(false)}
      onDrop={(e) => {
        e.preventDefault();
        datDangKeo(false);
        nhan_(e.dataTransfer.files);
      }}
    >
      <span className="vung-tai-len-dau" aria-hidden="true">
        +
      </span>
      <span className="vung-tai-len-nhan">{dangTai ? 'Đang tải…' : nhan}</span>
      <span className="vung-tai-len-phu">hoặc bấm để chọn</span>

      <input
        ref={o}
        type="file"
        className="an-di"
        accept={accept}
        tabIndex={-1}
        onChange={(e) => {
          nhan_(e.target.files);
          // Xoá giá trị để chọn LẠI ĐÚNG tệp vừa rồi vẫn kích hoạt `change`:
          // không có dòng này thì tải hỏng một lần rồi chọn lại chính tệp ấy sẽ
          // không có gì xảy ra, và người dùng bấm mãi không hiểu vì sao.
          e.target.value = '';
        }}
      />
    </button>
  );
}
