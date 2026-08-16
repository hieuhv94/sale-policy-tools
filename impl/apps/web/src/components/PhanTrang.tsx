/**
 * Thanh phân trang — một mẫu duy nhất cho mọi danh sách (`0030`).
 *
 * CHỈ LÙI và TIẾN, không có dãy số trang. Hai lý do, và lý do thứ hai mới là
 * lý do thật:
 *
 *   1. Dãy số trang cho 40 trang thì phải rút gọn kiểu `1 … 7 8 9 … 40`, và
 *      luật rút gọn ấy là chỗ đẻ lỗi mà không màn hình nào cần tới.
 *   2. Danh sách hồ sơ phân trang bằng CON TRỎ, không phải bằng `offset` — nó
 *      không nhảy thẳng tới trang 9 được. Một thanh có số trang bấm được ở chỗ
 *      này và không bấm được ở chỗ kia là hai thanh khác nhau đội lốt một.
 *
 * Ẩn hẳn khi chỉ có một trang: danh sách 6 dòng không cần ai nói cho biết nó
 * chỉ có một trang.
 */
export function PhanTrang({
  trang,
  soTrang,
  tong,
  doiTrang,
  nhan = 'mục',
}: {
  trang: number;
  soTrang: number;
  /** Tổng số mục. Bỏ trống khi chưa đếm được — thanh vẫn chạy, chỉ không nói số. */
  tong?: number | undefined;
  doiTrang: (n: number) => void;
  /** Danh từ đếm được, để câu tổng đọc ra tiếng Việt: "47 hồ sơ", "12 sản phẩm". */
  nhan?: string;
}) {
  if (soTrang <= 1) return null;

  return (
    <nav className="phan-trang" aria-label="Phân trang">
      <button
        type="button"
        className="nut nut-nhe"
        disabled={trang <= 1}
        onClick={() => doiTrang(trang - 1)}
      >
        ← Trước
      </button>

      {/*
        `aria-live` để trình đọc màn hình đọc trang mới sau khi bấm. Không có nó
        thì người dùng bấm Sau và không có gì báo là đã sang trang — nội dung
        đổi ở nơi khác trên màn hình, ngoài tiêu điểm bàn phím.
      */}
      <span className="phan-trang-so" aria-live="polite">
        Trang <strong>{trang}</strong> / {soTrang}
        {tong === undefined ? '' : ` · ${tong} ${nhan}`}
      </span>

      <button
        type="button"
        className="nut nut-nhe"
        disabled={trang >= soTrang}
        onClick={() => doiTrang(trang + 1)}
      >
        Sau →
      </button>
    </nav>
  );
}
