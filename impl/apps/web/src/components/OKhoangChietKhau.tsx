/**
 * Ô lọc **Tỷ lệ chiết khấu** — hai số *Từ* và *Đến* (`0283`).
 *
 * Hồ sơ hiện ra khi có ÍT NHẤT MỘT sản phẩm với tỷ lệ nằm trong khoảng, hai đầu đều tính. Chỉ nhập một đầu
 * cũng được. Khoảng gõ dở hoặc sai thứ tự thì KHÔNG đi lên bộ lọc — xem `khoangChietKhau`.
 *
 * Hai khoá (`discountFrom`, `discountTo`) đổi CÙNG MỘT lúc qua một lời gọi `doi(patch)`: hai lời gọi riêng thì
 * lời gọi sau ghi đè lời gọi trước, vì mỗi lời gọi đọc bộ lọc cũ.
 */
import { useEffect, useState } from 'react';
import { ONhapPhanTram } from './Chung.js';
import { hienPhanTram, khoangChietKhau } from '../lib/loc-chiet-khau.js';

export function OKhoangChietKhau({
  id,
  tu,
  den,
  doi,
}: {
  id: string;
  /** Giá trị ĐANG ÁP trong bộ lọc (dạng gửi máy chủ). */
  tu: string;
  den: string;
  doi: (patch: { discountFrom: string; discountTo: string }) => void;
}) {
  const [oTu, datOTu] = useState(hienPhanTram(tu));
  const [oDen, datODen] = useState(hienPhanTram(den));

  // Bộ lọc đổi từ NGOÀI (Xoá bộ lọc, đường liên kết, bộ lọc đã lưu): ô phải theo, nhưng chỉ khi thứ đang
  // gõ KHÁC thứ đang áp — nếu không, mỗi lần gõ dở (`2,`) lại bị ghi đè bằng giá trị cũ.
  useEffect(() => {
    const k = khoangChietKhau(oTu, oDen);
    if (k.loi === null && (k.tu !== tu || k.den !== den)) {
      datOTu(hienPhanTram(tu));
      datODen(hienPhanTram(den));
    }
    // Chỉ phản ứng với giá trị ngoài: `oTu`/`oDen` đổi do chính người gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tu, den]);

  const k = khoangChietKhau(oTu, oDen);
  const thayDoi = (a: string, b: string) => {
    datOTu(a);
    datODen(b);
    const m = khoangChietKhau(a, b);
    if (m.loi === null) doi({ discountFrom: m.tu, discountTo: m.den });
  };

  return (
    <fieldset className="truong khoang-chiet-khau" aria-describedby={k.loi ? `${id}-loi` : `${id}-ghi`}>
      <legend>Tỷ lệ chiết khấu</legend>
      <div className="khoang-hang">
        <label htmlFor={`${id}-tu`}>Từ</label>
        <span className="o-phan-tram">
          <ONhapPhanTram id={`${id}-tu`} giaTri={oTu} doi={(v) => thayDoi(v, oDen)} aria-invalid={k.loi !== null} />
          <span aria-hidden="true">%</span>
        </span>
        <label htmlFor={`${id}-den`}>Đến</label>
        <span className="o-phan-tram">
          <ONhapPhanTram id={`${id}-den`} giaTri={oDen} doi={(v) => thayDoi(oTu, v)} aria-invalid={k.loi !== null} />
          <span aria-hidden="true">%</span>
        </span>
      </div>
      {k.loi ? (
        <p className="truong-loi" id={`${id}-loi`} role="alert">
          {k.loi}
        </p>
      ) : (
        <p className="ghi-chu" id={`${id}-ghi`}>
          Có ít nhất một sản phẩm trong khoảng này.
        </p>
      )}
    </fieldset>
  );
}
