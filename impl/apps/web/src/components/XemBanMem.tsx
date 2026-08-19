/**
 * *Xem bản mềm* — bản CSBH A4, chọn khổ giấy rồi xem trước (`0054`).
 *
 * Trước `0054` đây là một mục *Tải văn bản* nằm giữa trang với ba nút rời: xem
 * khổ dọc, tải khổ dọc, tải khổ ngang. Ba nút cho một việc, và người dùng phải
 * quyết định khổ giấy **trước khi** nhìn thấy nội dung — trong khi chính nội
 * dung mới nói được khổ nào vừa: hồ sơ ít dòng thì khổ dọc đọc dễ hơn, hồ sơ
 * mười cột CPBH thì khổ ngang mới không bị ép chữ.
 *
 * Giờ là MỘT nút ở góc trên bên phải, và khổ giấy chọn ngay trong hộp — đổi
 * được bao nhiêu lần tuỳ ý, mỗi lần là một lượt xem chứ không phải một lượt tải.
 */
import { useState } from 'react';
import { HopThoai } from './Chung.js';
import { XemTep } from './XemTep.js';

type Kho = 'a4p' | 'a4l';

const NHAN: Record<Kho, string> = { a4p: 'A4 dọc', a4l: 'A4 ngang' };

/**
 * Khổ nào hợp với hồ sơ nào — nói ra chứ không để người dùng thử cả hai.
 *
 * Con số 4 không phải luật nghiệp vụ, chỉ là chỗ bảng bắt đầu chật trên khổ
 * dọc. Nó là GỢI Ý, không phải ràng buộc: hộp vẫn cho chọn khổ kia.
 */
const goiY = (soDong: number): Kho => (soDong > 4 ? 'a4l' : 'a4p');

export function XemBanMem({
  hoSoId,
  maHoSo,
  soDong,
  dong,
}: {
  hoSoId: string;
  maHoSo: string;
  /** Số dòng sản phẩm — chỉ dùng để gợi ý khổ giấy. */
  soDong: number;
  dong: () => void;
}) {
  const [kho, datKho] = useState<Kho | null>(null);

  if (kho === null) {
    const y = goiY(soDong);
    return (
      <HopThoai tieuDe={`Xem bản mềm ${maHoSo}`} dong={dong}>
        <p className="ghi-chu">
          Chọn khổ giấy để xem trước. Hồ sơ này có <strong>{soDong}</strong> dòng sản phẩm —{' '}
          <strong>{NHAN[y]}</strong> thường vừa hơn. Đổi lại được sau khi xem.
        </p>
        <div className="nhom-nut">
          {(['a4p', 'a4l'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={k === y ? 'nut nut-chinh' : 'nut nut-nhe'}
              onClick={() => datKho(k)}
            >
              {NHAN[k]}
            </button>
          ))}
        </div>
        <div className="nhom-nut">
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Đóng
          </button>
        </div>
      </HopThoai>
    );
  }

  return (
    <XemTep
      tieuDe={`Bản mềm ${maHoSo} — ${NHAN[kho]}`}
      // `xem=1`: mở ra đọc thì KHÔNG ghi một dòng tải xuống vào Lịch sử (`0052`).
      duong={`/policies/${hoSoId}/render?size=${kho}&xem=1`}
      duongTai={`/policies/${hoSoId}/render?size=${kho}`}
      tenTep={`CSBH-${maHoSo}-${kho}.pdf`}
      truoc={
        <div className="hang-kho-giay">
          <span className="ghi-chu">Khổ giấy</span>
          <div className="nhom-nut nhom-nut-gon">
            {(['a4p', 'a4l'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={k === kho ? 'nut nut-chinh' : 'nut nut-nhe'}
                // Bấm lại đúng khổ đang xem thì KHÔNG làm gì: `XemTep` tải lại
                // theo `duong`, và đổi `duong` về chính nó vẫn kích hoạt một
                // lượt tải nữa — một lượt gọi máy chủ cho một cú bấm vô nghĩa.
                onClick={() => k !== kho && datKho(k)}
                aria-pressed={k === kho}
              >
                {NHAN[k]}
              </button>
            ))}
          </div>
        </div>
      }
      dong={dong}
    />
  );
}
