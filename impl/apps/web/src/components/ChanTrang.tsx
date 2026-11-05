import { TEN_CONG_TY, TEN_PHAN_MEM } from '../lib/cong-ty.js';
import { PHIEN_BAN } from '../lib/phien-ban.js';

/**
 * Chân trang (`0244`, khách hàng duyệt câu chữ 05/11): bản quyền · quyền sở hữu ·
 * phiên bản.
 *
 * Số phiên bản DỜI về đây từ đáy thanh bên (`0118`): thanh bên thu thành ngăn kéo
 * trên điện thoại nên con số ấy khuất đúng lúc người dùng cần đọc nó cho Quản trị.
 * Một chỗ duy nhất — hai chỗ là hai chỗ phải giữ khớp.
 *
 * `rutGon`: màn hình đăng nhập — dòng bản quyền, THÊM số phiên bản (`0245`, chốt
 * 05/11: *"giữ nội dung hiện tại và thêm phiên bản"*). Bản `0244` để số phiên bản
 * ngoài màn hình này, mà người không đăng nhập được chính là người cần đọc nó
 * cho Quản trị.
 *
 * Năm lấy theo đồng hồ trình duyệt. `getFullYear()` chứ không `toISOString()`: đêm
 * giao thừa theo giờ Việt Nam, UTC vẫn còn ở năm cũ bảy tiếng (bẫy `0208`).
 */
export function ChanTrang({ rutGon = false }: { rutGon?: boolean }) {
  const nam = new Date().getFullYear();
  return (
    <footer className="chan-trang">
      <span>
        © {nam} {TEN_CONG_TY}. Bảo lưu mọi quyền.
      </span>
      {!rutGon && (
        <span>
          {TEN_PHAN_MEM} — tài sản của {TEN_CONG_TY}, chỉ dành cho người được cấp tài khoản.
        </span>
      )}
      <span className="chan-trang-phien-ban">Phiên bản {PHIEN_BAN}</span>
    </footer>
  );
}
