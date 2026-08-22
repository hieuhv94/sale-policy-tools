/**
 * Bảng xếp hạng người — **HTML, không phải SVG** (`0094`).
 *
 * Năm dạng hình kia vẽ bằng SVG; dạng này thì không, và lý do là tương tác: mỗi
 * dòng BẤM ĐƯỢC để lọc cả màn hình theo người ấy. Một `<button>` thật cho mỗi
 * dòng thì có sẵn tiêu điểm bàn phím, có sẵn `aria-pressed`, và trình đọc màn
 * hình đọc ra được cả tên lẫn con số — trong khi cùng thứ ấy vẽ bằng SVG là tự
 * dựng lại từ đầu một cái nút.
 */
import type { MaXuHuong } from '../../lib/thong-ke.js';
import { DuongNho } from './BieuDo.js';

/**
 * Nhãn tiếng Việt của xu hướng. Máy chủ trả về MÃ, giao diện đặt tên.
 *
 * Cùng nếp với `nhanTrangThai`: luật tính nằm ở máy chủ (một chỗ, hai màn hình
 * dùng chung), còn câu chữ nằm ở giao diện. Mũi tên đi kèm chữ chứ không thay
 * chữ — màu và hình không phải là thông tin cho người không phân biệt được màu.
 */
export const NHAN_XU_HUONG: Record<MaXuHuong, { chu: string; mui: string }> = {
  len: { chu: 'đang lên', mui: '↗' },
  ngang: { chu: 'đi ngang', mui: '→' },
  chung: { chu: 'chững lại', mui: '↘' },
  xuong: { chu: 'sụt mạnh', mui: '↘' },
};

export type DongXepHang = {
  ma: string;
  ten: string;
  so: number;
  chuoi: number[];
  xuHuong: MaXuHuong;
};

export function XepHang({
  dong,
  nhanCot,
  dangChon,
  chon,
  inSo = (v) => String(v),
}: {
  dong: DongXepHang[];
  nhanCot: string;
  dangChon?: string | null;
  chon?: (ma: string) => void;
  inSo?: (v: number) => string;
}) {
  if (dong.length === 0) {
    return <p className="trong-mo-ta">Chưa có trình dược viên nào trong phạm vi của bạn.</p>;
  }
  // Mốc so là người CAO NHẤT, không phải trần làm tròn: đây là bảng so người với
  // người, nên thanh dài nhất nên chạm mép.
  const donhat = Math.max(1, ...dong.map((d) => d.so));

  return (
    <div className="xep-hang">
      <div className="xep-hang-dau" aria-hidden="true">
        <span>Trình dược viên</span>
        <span>{nhanCot}</span>
        <span />
        <span>Xu hướng</span>
        <span>6 kỳ</span>
      </div>
      <ul className="xep-hang-than">
        {dong.map((d) => {
          const xh = NHAN_XU_HUONG[d.xuHuong] ?? NHAN_XU_HUONG.ngang;
          const noiDung = (
            <>
              <span className="xep-hang-ten">{d.ten}</span>
              <span className="xep-hang-thanh" aria-hidden="true">
                <b style={{ width: `${((d.so / donhat) * 100).toFixed(1)}%` }} />
              </span>
              <span className="xep-hang-so">{inSo(d.so)}</span>
              <span className={`xu-huong xu-huong-${d.xuHuong}`}>
                <span aria-hidden="true">{xh.mui} </span>
                {xh.chu}
              </span>
              <DuongNho diem={d.chuoi} moTa={`Sáu kỳ gần nhất của ${d.ten}: ${xh.chu}`} />
            </>
          );

          return (
            <li key={d.ma}>
              {chon === undefined ? (
                <div className="xep-hang-dong">{noiDung}</div>
              ) : (
                <button
                  type="button"
                  className="xep-hang-dong"
                  aria-pressed={dangChon === d.ma}
                  onClick={() => chon(d.ma)}
                >
                  {noiDung}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
