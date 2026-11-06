/**
 * Sửa MÃ HỒ SƠ ngay tại tiêu đề, khi hồ sơ còn ở *Nháp* (`0198`).
 *
 * Khách hàng chốt 10/09: *"để một biểu tượng edit ngay tại tiêu đề Mã hồ sơ,
 * sửa xong có dấu tick để lưu"*.
 *
 * ---------------------------------------------------------------------------
 * SỬA TẠI CHỖ, KHÔNG PHẢI MỘT HỘP THOẠI
 * ---------------------------------------------------------------------------
 *
 * Một hộp thoại cho đúng một ô nhập là ba lượt bấm cho một lượt sửa, và nó che
 * mất chính cái mã người dùng đang đối chiếu. Đổi lại, sửa tại chỗ có một cái
 * giá phải trả bằng mã: **ô nhập thay chỗ của `<h1>`**, nên phải giữ cho khối
 * tiêu đề không nhảy cỡ khi đổi qua lại — ô nhập mượn cỡ chữ của `h1`.
 *
 * BÀN PHÍM ĐỦ ĐƯỜNG. `Enter` lưu, `Escape` huỷ — hai phím người ta bấm theo
 * phản xạ ở một ô nhập tại chỗ, và không có chúng thì người dùng bàn phím phải
 * đi tìm hai cái nút bằng `Tab`. Nút vẫn có, vì phản xạ ấy không phải ai cũng
 * có.
 *
 * CHỖ HỎNG DUY NHẤT KHÔNG NHÌN THẤY ĐƯỢC: lưu xong mà không báo cho trang cha
 * thì tiêu đề vẫn là mã cũ trong khi máy chủ đã ghi mã mới — nên `xong()` là
 * tham số BẮT BUỘC, không phải tuỳ chọn.
 */
import { useEffect, useRef, useState } from 'react';
import { va } from '../lib/api.js';
import { docLoi } from '../lib/loi.js';
import { BieuTuongBut, BieuTuongDauTich, BieuTuongDong } from './BieuTuong.js';

export function SuaMaHoSo({
  hoSoId,
  ma,
  suaDuoc,
  xong,
}: {
  hoSoId: string;
  ma: string;
  /** Chỉ hồ sơ ở *Nháp* — xem `PoliciesService.doiMa`. */
  suaDuoc: boolean;
  xong: (maMoi: string) => void;
}) {
  const [dangSua, datDangSua] = useState(false);
  const [nhap, datNhap] = useState(ma);
  const [loi, datLoi] = useState<string | null>(null);
  const [dangLuu, datDangLuu] = useState(false);
  const oRef = useRef<HTMLInputElement>(null);

  // Con trỏ vào thẳng ô, và chọn sẵn cả chuỗi: phần lớn lượt sửa là gõ đè một mã
  // khác hẳn, không phải sửa một ký tự.
  useEffect(() => {
    if (dangSua) oRef.current?.select();
  }, [dangSua]);

  if (!suaDuoc) return <h1>{ma}</h1>;

  const moRa = () => {
    datNhap(ma);
    datLoi(null);
    datDangSua(true);
  };

  const huy = () => {
    datDangSua(false);
    datLoi(null);
  };

  const luu = async () => {
    if (dangLuu) return;
    datDangLuu(true);
    datLoi(null);
    try {
      const r = await va<{ code: string }>(`/policies/${hoSoId}/ma`, { code: nhap });
      datDangSua(false);
      xong(r.code);
    } catch (e) {
      // Lỗi Ở LẠI CẠNH Ô NHẬP, không đẩy lên hộp thoại chung: cả hai câu
      // (`POLICY_CODE_TAKEN`, `POLICY_CODE_INVALID`) nói về chuỗi người dùng
      // đang nhìn, và việc phải làm là sửa chính chuỗi ấy (`0088`).
      datLoi(docLoi(e).cau);
    } finally {
      datDangLuu(false);
    }
  };

  if (!dangSua) {
    return (
      <div className="ma-ho-so">
        <div className="ma-ho-so-hang">
          <h1>{ma}</h1>
          <button type="button" className="nut-bieu-tuong" onClick={moRa} title="Sửa mã hồ sơ">
            {/* `aria-hidden` trên hình vẽ, tên thật ở `.chi-doc-man-hinh`: một
                nút chỉ có hình thì trình đọc màn hình đọc ra là "nút". */}
            <BieuTuongBut />
            <span className="chi-doc-man-hinh">Sửa mã hồ sơ</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ma-ho-so">
      <div className="ma-ho-so-hang">
        <input
          ref={oRef}
          className="o-ma-ho-so"
          value={nhap}
          aria-label="Mã hồ sơ"
          aria-invalid={loi !== null}
          disabled={dangLuu}
          onChange={(e) => datNhap(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void luu();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              huy();
            }
          }}
        />
        <button
          type="button"
          className="nut-bieu-tuong"
          onClick={() => void luu()}
          disabled={dangLuu}
          title="Lưu mã hồ sơ"
        >
          <BieuTuongDauTich />
          <span className="chi-doc-man-hinh">Lưu mã hồ sơ</span>
        </button>
        <button
          type="button"
          className="nut-bieu-tuong"
          onClick={huy}
          disabled={dangLuu}
          title="Huỷ"
        >
          <BieuTuongDong />
          <span className="chi-doc-man-hinh">Huỷ sửa mã hồ sơ</span>
        </button>
      </div>
      {loi !== null && (
        <p className="truong-loi" role="alert">
          {loi}
        </p>
      )}
    </div>
  );
}
