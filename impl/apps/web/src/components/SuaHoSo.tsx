/**
 * Xoá hồ sơ, và phép kiểm "hồ sơ này còn sửa được không".
 *
 * `ThemDongSanPham` GỠ HẲN ở `0187`. Nó là hộp thoại thêm/sửa MỘT dòng sản
 * phẩm, và khách hàng chốt 08/09 rằng bảng phải soạn thẳng được *"mà không cần
 * mở một hộp thoại"* — nên năm ô của nó chuyển vào chính bảng
 * (`BangSanPham`, prop `soan`).
 *
 * `useXemTruocNguong` đi cùng, và đó là chỗ đáng ghi lại. Nó phục vụ luật `0022`
 * — *cảnh báo "chưa có quy định chiết khấu" LÚC ĐANG LẬP, không phải sau khi
 * lưu* — bằng cách gọi `threshold-preview` ngay khi người dùng chọn sản phẩm
 * trong hộp thoại. Luật ấy KHÔNG mất: bảng soạn thẳng ghi ngay lúc chọn sản
 * phẩm, nên dòng hiện ra kèm ngưỡng thật và kèm dấu cảnh báo của chính nó, sớm
 * hơn hộp thoại cũ một bước. Cái mất là đường `GET .../threshold-preview` thôi
 * có người gọi từ giao diện; đường máy chủ GIỮ NGUYÊN.
 *
 * Chỉ hiện khi hồ sơ ở trạng thái SỬA ĐƯỢC. Danh sách trạng thái đó do máy chủ
 * giữ (`EDITABLE` ở `policies.service.ts`), nên ở đây suy từ chính câu trả lời
 * của máy chủ thay vì chép lại: hồ sơ nào sửa được thì `allowed-actions` có
 * `SUBMIT` hoặc `RESUBMIT_AFTER_EDIT`. Chép danh sách trạng thái sang giao diện
 * là thêm một bản sao phải giữ đồng bộ với máy trạng thái.
 */
import { useState } from 'react';
import { xoa } from '../lib/api.js';
import { HopThoai, Truong } from './Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';

export { suaDuoc } from '../lib/sua-ho-so.js';
/*
 * `SuaNgayApDung` GỠ HẲN ở `0180`.
 *
 * Hộp thoại này sửa ngày áp dụng CỦA HỒ SƠ, và trường ấy không còn tồn tại —
 * ngày là của từng dòng sản phẩm, sửa ngay trong `ThemDongSanPham` cùng với giá
 * bán buôn và các khoản CPBH của chính dòng đó. Đường máy chủ nó gọi
 * (`PATCH /policies/:id`) cũng đã gỡ.
 */

/**
 * Xoá hồ sơ. Hỏi lại BẰNG CÁCH BẮT GÕ MÃ HỒ SƠ, không phải một nút "Chắc chưa?".
 *
 * Xoá là thao tác không lùi được và nút của nó nằm ngay cạnh những nút dùng hàng
 * ngày. Một hộp thoại xác nhận thường bị bấm qua theo phản xạ; gõ lại mã thì
 * không thể bấm nhầm.
 *
 * HAI HẬU QUẢ KHÁC NHAU, và hộp thoại phải nói đúng cái sắp xảy ra (`0035`).
 * Hồ sơ chưa gửi duyệt thì biến mất hẳn; hồ sơ đã bị trả lại thì ở lại với nhãn
 * *Đã xoá* và giữ nguyên lịch sử. Nói chung chung "xoá là không lùi được" cho cả
 * hai là đúng một nửa ở mỗi vế — người dùng hoặc tưởng mình xoá sạch được một
 * hồ sơ người khác đã đọc, hoặc ngại xoá một bản nháp vì sợ nó nằm lại.
 */
export function XoaHoSo({
  hoSoId,
  ma,
  trangThai,
  dong,
  xong,
}: {
  hoSoId: string;
  ma: string;
  trangThai: string;
  dong: () => void;
  xong: () => void;
}) {
  /** Chưa gửi duyệt thì chưa ai ngoài người lập thấy hồ sơ này — xoá hẳn. */
  const xoaHan = trangThai === 'NHAP';
  const { bao } = useBaoLoi();
  const [go, datGo] = useState('');
  const [dangGui, datDangGui] = useState(false);

  const gui = async () => {
    datDangGui(true);
    try {
      await xoa(`/policies/${hoSoId}`);
      xong();
    } catch (e) {
      bao(e);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Xoá hồ sơ ${ma}`} dong={dong}>
      {xoaHan ? (
        <p className="giai-thich">
          Hồ sơ này <strong>chưa gửi duyệt</strong> nên nó biến mất hẳn cùng mọi sản phẩm, và{' '}
          <strong>không lùi được</strong>. Lịch sử của riêng hồ sơ cũng mất theo — chưa ai ngoài bạn
          nhìn thấy nó.
        </p>
      ) : (
        <p className="giai-thich">
          Hồ sơ này <strong>đã từng vào luồng duyệt</strong> nên nó ở lại với nhãn{' '}
          <strong>Đã xoá</strong>: lịch sử và lý do{' '}
          trả lại giữ nguyên, tra cứu được, nhưng hồ sơ không đi tiếp được nữa và{' '}
          <strong>không lùi được</strong>. Người đã xử lý hồ sơ trước đó sẽ nhận thư báo.{' '}
          {/*
            `0155` — bỏ nhánh `TU_CHOI`. Trạng thái ấy không còn, nên đây chỉ còn
            đúng MỘT đường vào: hồ sơ bị trả lại rồi người lập tự bỏ.
          */}
          Hồ sơ vẫn được tính trong <strong>báo cáo tỷ lệ trả lại</strong> — xoá ở đây chỉ dọn thẻ
          đếm trên trang tổng quan của bạn.
        </p>
      )}
      <Truong id="xhs-ma" nhan={`Gõ lại mã hồ sơ để xác nhận: ${ma}`} bắtBuộc>
        {(p) => (
          <input
            {...p}
            className="o-nhap"
            autoComplete="off"
            value={go}
            onChange={(e) => datGo(e.target.value)}
          />
        )}
      </Truong>
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-canh-bao"
          disabled={dangGui || go.trim() !== ma}
          onClick={gui}
        >
          {dangGui ? 'Đang xoá…' : 'Xoá hồ sơ'}
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Huỷ
        </button>
      </div>
    </HopThoai>
  );
}
