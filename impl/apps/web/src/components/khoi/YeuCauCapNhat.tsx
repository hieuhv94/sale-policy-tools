/**
 * Box "Yêu cầu cập nhật" — hồ sơ ĐÃ ĐÓNG BĂNG đang lệch so với danh mục (`0029`).
 *
 * Vì sao box này cần tồn tại: giá và ngưỡng đóng băng vào dòng hồ sơ lúc gửi
 * duyệt, và đó là luật đúng — không ai được sửa một văn bản đang chờ chữ ký. Hệ
 * quả là một hồ sơ nằm trên bàn Trưởng bộ phận có thể mang con số đã lỗi thời,
 * và **người sắp ký vào nó không có cách nào biết**. Box này là cách duy nhất họ
 * biết trước khi ký.
 *
 * Nó KHÔNG có nút nào. Việc phải làm khác nhau theo vai trò và theo bước — trả
 * lại để sửa, hay cứ duyệt vì chênh lệch không đáng kể, hay lập một CSBH mới —
 * và đó là quyết định của người, không phải của một nút "cập nhật" đoán hộ.
 *
 * Ẩn HẲN khi không có gì lệch, không hiện "không có gì". Đây là màn hình mở mỗi
 * sáng; một khối rỗng lặp lại mỗi ngày là khối người dùng ngừng nhìn, và đúng
 * hôm nó có nội dung thì họ cũng không nhìn.
 *
 * GẤP LẠI THEO TỪNG HỒ SƠ (`0049`). Bản trước trải hết mọi dòng lệch của mọi hồ
 * sơ ra ngay trên trang tổng quan: mười hồ sơ, mỗi hồ sơ ba dòng, là ba mươi
 * dòng số đẩy hộp việc xuống dưới màn hình. Giờ mỗi hồ sơ một dòng, bấm mới mở
 * chi tiết.
 *
 * Nhưng dòng gấp lại VẪN mang nhãn LOẠI lệch, không chỉ mã hồ sơ. Đó là khác
 * biệt giữa một danh sách quét được và một danh sách phải mở từng cái: *Sản
 * phẩm* là điều khoản không thực hiện được, còn *Giá* lệch vài đồng thì duyệt
 * tiếp cũng chẳng sao — giấu cả hai sau cùng một cú bấm là bắt người ta mở hết
 * mười hồ sơ mới biết nên lo cái nào.
 */
import { useState } from 'react';
import { tien } from '../../lib/format.js';
import { Lien } from '../../lib/router.js';
import { Nhan } from '../Chung.js';
import { PhanTrang } from '../PhanTrang.js';
import { useTrangMay } from '../../lib/phan-trang.js';
import { Khoi } from './Khung.js';

export type LechMuc = {
  /** `PRODUCT` là loại thứ ba từ `0036`: sản phẩm vô hiệu hoá hoặc đã xoá. */
  kind: 'PRICE' | 'RULE' | 'PRODUCT';
  productCode: string;
  snapValue: string;
  newValue: string | null;
};

/**
 * Nhãn, lớp CSS và cách đọc giá trị — MỘT bảng cho cả ba loại.
 *
 * Trước `0036` ba thứ này là ba phép `l.kind === 'PRICE' ? … : …` nằm rải trong
 * JSX, và thêm loại thứ ba vào một biểu thức nhị phân là cách chắc chắn để có
 * một chỗ quên: `PRODUCT` sẽ lặng lẽ hiện ra dưới nhãn "Ngưỡng".
 */
const LOAI: Record<LechMuc['kind'], { nhan: string; lop: string }> = {
  PRICE: { nhan: 'Giá', lop: 'gia' },
  RULE: { nhan: 'Ngưỡng', lop: 'nguong' },
  PRODUCT: { nhan: 'Sản phẩm', lop: 'san-pham' },
};

export type HoSoLech = {
  id: string;
  code: string;
  status: string;
  versionNo: number;
  appliedDate: string | null;
  lech: LechMuc[];
  detectedAt: string;
};

/**
 * Giá là số nguyên đồng, ngưỡng là phần trăm — hai cách đọc khác nhau trên cùng
 * một cột `text` của CSDL. Ép kiểu ở đây chứ không ở máy chủ: máy chủ giữ nguyên
 * văn con số nó đã so, còn cách đọc là việc của màn hình.
 */
const doc = (l: LechMuc, v: string | null): string => {
  // `null` mang HAI nghĩa khác nhau tuỳ loại, và câu chữ phải nói đúng nghĩa:
  // ở `RULE` là không quy định nào phủ nữa, ở `PRODUCT` là sản phẩm đã bị xoá
  // khỏi danh mục. Dùng chung một câu cho cả hai là nói một chuyện không xảy ra.
  if (v === null) {
    return l.kind === 'PRODUCT' ? 'đã xoá khỏi danh mục' : 'không còn quy định nào';
  }
  if (v === '—') return '—';
  // Trạng thái sản phẩm về tới đây đã là chữ ("Đang áp dụng" / "Đã vô hiệu
  // hoá"), không phải số — không ép kiểu tiền hay phần trăm lên nó.
  if (l.kind === 'PRODUCT') return v;
  return l.kind === 'PRICE' ? `${tien(v)} đ` : `${v.replace('.', ',')}%`;
};

/**
 * Thứ tự đọc của nhãn loại trên dòng gấp lại: nặng nhất trước.
 *
 * Cùng thứ tự với thư báo (`catalog-impact.consumer.ts`) — một hồ sơ vừa mất
 * sản phẩm vừa lệch giá thì thứ đáng nói trước là mất sản phẩm, ở cả hai chỗ.
 */
const THU_TU: LechMuc['kind'][] = ['PRODUCT', 'PRICE', 'RULE'];

/** Một hồ sơ trong danh sách: gấp lại thì một dòng, mở ra thì kèm chi tiết. */
function DongLech({ h }: { h: HoSoLech }) {
  const [mo, datMo] = useState(false);
  const loai = THU_TU.filter((k) => h.lech.some((l) => l.kind === k));

  return (
    <li className="viec">
      <button
        type="button"
        className="viec-lien"
        aria-expanded={mo}
        onClick={() => datMo((x) => !x)}
      >
        <span className="viec-ma">{h.code}</span>
        <Nhan trangThai={h.status} />
        <span className="lech-tom-tat">
          {loai.map((k) => (
            <span key={k} className={`nhan-lech ${LOAI[k].lop}`}>
              {LOAI[k].nhan}
            </span>
          ))}
        </span>
        <span className="viec-han">
          {h.lech.length} điểm lệch
        </span>
        <span className="mui-ten" aria-hidden="true">
          {mo ? '▲' : '▼'}
        </span>
      </button>

      {mo && (
        <div className="lech-chi-tiet">
          {/* Nói RÕ lệch cái gì, từ đâu sang đâu. "Hồ sơ này bị ảnh hưởng" mà
              không kèm con số thì người đọc phải mở hồ sơ ra, mở danh mục ra,
              rồi tự so — đúng cái việc box này sinh ra để khỏi phải làm. */}
          <ul className="lech-muc">
            {h.lech.map((l, i) => (
              <li key={i}>
                <span className={`nhan-lech ${LOAI[l.kind].lop}`}>{LOAI[l.kind].nhan}</span>{' '}
                <span className="ma-phu">{l.productCode}</span>{' '}
                <span className="so">{doc(l, l.snapValue)}</span>
                {' → '}
                <span className="so">{doc(l, l.newValue)}</span>
              </li>
            ))}
          </ul>
          {/* Liên kết nằm TRONG phần mở ra, vì dòng ngoài đã là nút gấp/mở. Một
              hàng vừa đi tới địa chỉ khác vừa gấp mở theo chỗ bấm là hàng người
              dùng bấm sai ít nhất một lần trước khi hiểu. */}
          <Lien den={`/ho-so/${h.id}`} className="lien-mo-ho-so">
            Mở hồ sơ →
          </Lien>
        </div>
      )}
    </li>
  );
}

export function YeuCauCapNhat() {
  const { muc, tong, loi, trang, soTrang, doiTrang } = useTrangMay<HoSoLech>('/policies/impacted');

  // Chưa tải xong hoặc gọi hỏng thì KHÔNG hiện gì. Một khối cảnh báo chớp lên
  // rồi biến mất còn tệ hơn là không có khối nào.
  if (loi !== null && loi !== undefined) return null;
  if (muc === null || muc.length === 0) return null;

  return (
    <Khoi tieuDe="Yêu cầu cập nhật">
      <p className="ghi-chu">
        Danh mục đã đổi sau khi những hồ sơ này đóng băng giá và ngưỡng. Số trên hồ sơ{' '}
        <strong>không tự cập nhật</strong> — bấm vào một hồ sơ để xem nó lệch những gì.
      </p>
      <ul className="danh-sach-viec">
        {muc.map((h) => (
          <DongLech key={h.id} h={h} />
        ))}
      </ul>
      <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="hồ sơ" />
    </Khoi>
  );
}
