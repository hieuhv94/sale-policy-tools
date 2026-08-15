/**
 * Thẻ Giấy tờ mẫu — nơi Quản trị hệ thống nhập mẫu văn bản để xuất PDF.
 *
 * Thẻ này hiện CHƯA CÓ GÌ, và đó là trạng thái đúng chứ không phải một mảnh
 * việc bỏ dở. Hai loại giấy tờ mẫu của hệ thống đứng ở hai chỗ khác nhau:
 *
 *   * **Mẫu hợp đồng** thuộc Sale Admin, không thuộc Quản trị. Quyết định chốt
 *     với khách hàng ngày 06/08 (bản hợp nhất muc 8.3), và có `DOC-26` bắt
 *     Quản trị gọi API quản lý mẫu phải nhận 403. Nó nằm ở màn hình riêng
 *     "Mẫu hợp đồng" trong menu của Sale Admin.
 *   * **Mẫu hồ sơ CSBH** chưa tồn tại dưới dạng mẫu tải lên. Bản A4 hiện do hệ
 *     thống tự dựng bố cục trong mã, vì muc 8.2 chốt 13 mục bắt buộc và bố cục
 *     ấy do hệ thống định nghĩa. Cho tải mẫu lên là một lượt việc riêng: thêm
 *     loại mẫu, tập ô trống cho hồ sơ · khách hàng · dòng sản phẩm, màn hình
 *     ánh xạ, và đổi đường sinh PDF.
 *
 * Bày ra một thẻ trống kèm lời giải thích, thay vì giấu thẻ đi: người quản trị
 * được nghe rằng thẻ này sắp có gì, và biết ngay mẫu hợp đồng đang ở đâu — chứ
 * không đi tìm nó ở đây rồi kết luận là hệ thống thiếu chức năng.
 */
import { Lien } from '../../lib/router.js';
import { Trong } from '../Chung.js';

export function TheGiayToMau() {
  return (
    <>
      <Trong
        tieuDe="Chưa nhập được giấy tờ mẫu nào"
        moTa="Mẫu hồ sơ CSBH sẽ nhập ở đây. Bản A4 hiện do hệ thống tự dựng bố cục theo 13 mục bắt buộc, chưa nhận mẫu tải lên."
      />
      <p className="ghi-chu">
        Tìm <strong>mẫu hợp đồng</strong>? Nó không nằm ở đây. Mẫu hợp đồng do{' '}
        <strong>Sale Admin</strong> soạn và tự ánh xạ trường dữ liệu, ở màn hình{' '}
        <Lien den="/mau-hop-dong">Mẫu hợp đồng</Lien> — Quản trị hệ thống không sửa được nó.
      </p>
    </>
  );
}
