/**
 * Nút đổi giao diện sáng / tối.
 *
 * Nhãn nói VIỆC SẮP XẢY RA ("Chuyển sang giao diện tối") chứ không nói trạng
 * thái hiện tại. Một nút mang nhãn "Giao diện sáng" thì người dùng không đoán
 * được bấm vào sẽ được gì — bật lên hay tắt đi.
 *
 * Không dùng `aria-pressed`: đây không phải công tắc hai trạng thái của một
 * tính năng, mà là một nút đổi qua đổi lại giữa hai giá trị ngang hàng nhau.
 */
import { useGiaoDien } from '../lib/giao-dien.js';
import { BieuTuongMatTrang, BieuTuongMatTroi } from './BieuTuong.js';

export function NutGiaoDien() {
  const { dangToi, doi } = useGiaoDien();
  const nhan = dangToi ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';

  return (
    <button type="button" className="nut-bieu-tuong" onClick={doi} title={nhan}>
      <span className="chi-doc-man-hinh">{nhan}</span>
      {dangToi ? <BieuTuongMatTroi /> : <BieuTuongMatTrang />}
    </button>
  );
}
