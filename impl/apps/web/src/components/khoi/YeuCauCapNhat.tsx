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
import { Lien } from '../../lib/router.js';
import { Nhan } from '../Chung.js';
import { DanhSachLech, TomTatLech, type LechMuc } from '../Lech.js';
import { PhanTrang } from '../PhanTrang.js';
import { useTrangMay } from '../../lib/phan-trang.js';
import { MOI_TRANG_TONG_QUAN } from '../../lib/tong-quan.js';
import { Khoi } from './Khung.js';

/** Vẫn xuất lại từ đây: bộ kiểm và các màn hình cũ nhập kiểu qua đường này. */
export type { LechMuc };

export type HoSoLech = {
  id: string;
  code: string;
  status: string;
  versionNo: number;
  lech: LechMuc[];
  detectedAt: string;
};

/** Một hồ sơ trong danh sách: gấp lại thì một dòng, mở ra thì kèm chi tiết. */
function DongLech({ h }: { h: HoSoLech }) {
  const [mo, datMo] = useState(false);

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
        <TomTatLech lech={h.lech} />
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
          <DanhSachLech lech={h.lech} />
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
  const { muc, tong, loi, trang, soTrang, doiTrang } = useTrangMay<HoSoLech>(
    '/policies/impacted',
    MOI_TRANG_TONG_QUAN,
  );

  // Chưa tải xong hoặc gọi hỏng thì KHÔNG hiện gì. Một khối cảnh báo chớp lên
  // rồi biến mất còn tệ hơn là không có khối nào.
  if (loi !== null && loi !== undefined) return null;
  if (muc === null || muc.length === 0) return null;

  return (
    <Khoi tieuDe="Yêu cầu cập nhật">
      {/*
        CÂU NÀY ĐÃ ĐỔI HAI LẦN, và cả hai lần đều vì tập hồ sơ đổi chứ không vì
        chữ nghĩa.

        `0194` thêm nút *Tự động cập nhật*, nên câu cũ (*"số trên hồ sơ không tự
        cập nhật"*) hết đúng; bản thay nó nói về hồ sơ ĐÃ ĐÓNG BĂNG — chúng không
        tự sửa vì **không được phép** sửa. `0200` cho box liệt kê cả hồ sơ CÒN
        SỬA ĐƯỢC, nên một câu chỉ nói về hồ sơ đóng băng lại thành sai một nửa.

        Nói ra CẢ HAI, và nói ra VIỆC PHẢI LÀM của từng loại: chúng ngược nhau,
        và đó chính là thứ người đọc cần phân biệt khi lướt một danh sách trộn.
      */}
      <p className="ghi-chu">
        Danh mục đã đổi sau khi những hồ sơ này chụp giá và ngưỡng. Hồ sơ{' '}
        <strong>đang trong luồng duyệt</strong> giữ nguyên số đã đóng băng — không ai sửa một văn
        bản đang chờ chữ ký. Hồ sơ <strong>còn sửa được</strong> thì mở ra bấm{' '}
        <strong>Tự động cập nhật</strong> là lấy được số mới. Bấm vào một hồ sơ để xem nó lệch
        những gì.
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
