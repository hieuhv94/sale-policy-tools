/**
 * Khung chung sau khi đăng nhập: thanh bên, thanh tiêu đề, vùng nội dung.
 *
 * Điều hướng nằm ở THANH BÊN chứ không ở một hàng tab ngang. Tám mục với nhãn
 * tiếng Việt dài ("Mẫu hợp đồng", "Quy định chiết khấu") xếp ngang thì tràn
 * dòng ngay ở màn hình 1280px, và một hàng tab tràn thành hai dòng trông như lỗi
 * hiển thị. Cột dọc thì thêm mục thứ chín cũng không đổi bố cục.
 *
 * Dưới 1024px thanh bên thành NGĂN KÉO trượt ra, đúng một cây DOM cho cả hai —
 * dựng lại cây theo bề rộng là thứ `FE-06` cấm.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { usePhien, type NguoiDung } from '../lib/auth.js';
import { dieuHuongCho } from '../lib/can.js';
import { NHAN_VAI_TRO } from '../lib/format.js';
import { PHIEN_BAN } from '../lib/phien-ban.js';
import { Lien, useDuong } from '../lib/router.js';
import logo from '../logo.png';
import {
  BieuTuongDangXuat,
  BieuTuongDong,
  BieuTuongMenu,
  BieuTuongTaiKhoan,
  bieuTuongMuc,
} from './BieuTuong.js';
import { ChuongThongBao } from './ChuongThongBao.js';
import { NutGiaoDien } from './NutGiaoDien.js';

/**
 * Chữ cái đầu của tên, tối đa hai chữ.
 *
 * Lấy từ CUỐI tên: người Việt gọi nhau bằng tên, và "Nguyễn Văn Hùng" viết tắt
 * thành "NV" thì không ai nhận ra mình.
 */
function chuDau(ten: string | undefined): string {
  const phan = (ten ?? '').trim().split(/\s+/).filter(Boolean);
  if (phan.length === 0) return '?';
  const cuoi = phan[phan.length - 1]!;
  if (phan.length === 1) return cuoi.slice(0, 2).toUpperCase();
  return (phan[phan.length - 2]![0]! + cuoi[0]!).toUpperCase();
}

/**
 * Thẻ tên ở thanh trên cùng, bấm vào thì SỔ XUỐNG (`0062`).
 *
 * Trước đó thanh này có hai thứ đứng cạnh nhau: một thẻ tên dẫn thẳng sang
 * *Thông tin của tôi*, và một nút *Đăng xuất* bày sẵn ngay bên phải nó. Hai vấn
 * đề, và cái thứ hai nặng hơn:
 *
 *   1. Nút đăng xuất chiếm chỗ thường trực trên MỌI màn hình cho một việc người
 *      ta làm mỗi ngày một lần.
 *   2. Nó nằm sát ngay cạnh thẻ tên — chỗ người ta bấm để vào xem thông tin của
 *      mình — nên bấm trượt một lần là mất phiên và mất cả biểu mẫu đang dở.
 *
 * Gom cả hai vào một menu sổ xuống thì việc nguy hiểm cần HAI cú bấm có chủ ý,
 * và thanh trên cùng thưa ra một khối.
 *
 * KHÔNG dùng `role="menu"`: nội dung có một dòng chữ (email) không phải mục bấm
 * được, mà `role="menu"` thì mọi con của nó phải là `menuitem`. Đây là mẫu
 * *disclosure* — một nút `aria-expanded` mở ra một khối — và nó mô tả đúng thứ
 * đang xảy ra hơn.
 */
function MenuTaiKhoan({
  nguoiDung,
  dangXuat,
}: {
  nguoiDung: NguoiDung | null;
  dangXuat: () => void;
}) {
  const [mo, datMo] = useState(false);
  const khung = useRef<HTMLDivElement>(null);
  const nut = useRef<HTMLButtonElement>(null);
  const { duong } = useDuong();

  // Chuyển màn hình thì đóng. Bấm *Thông tin tài khoản* xong mà menu còn treo
  // trên màn hình mới là một khối lơ lửng không ai gọi ra.
  useEffect(() => datMo(false), [duong]);

  useEffect(() => {
    if (!mo) return;
    /*
     * `mousedown` chứ không `click`: bấm ra ngoài để đóng phải đóng ngay lúc
     * ngón tay chạm xuống. Nghe `click` thì trên phần tử vừa bị đóng đè lên,
     * thứ tự sự kiện đổi theo trình duyệt và có máy nuốt mất cú bấm đầu tiên.
     */
    const ngoai = (e: MouseEvent) => {
      if (!khung.current?.contains(e.target as Node)) datMo(false);
    };
    const phim = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      datMo(false);
      // Trả tiêu điểm về nút đã mở nó, nếu không người dùng bàn phím rơi về đầu
      // trang và phải Tab lại từ đó.
      nut.current?.focus();
    };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', phim);
    return () => {
      document.removeEventListener('mousedown', ngoai);
      document.removeEventListener('keydown', phim);
    };
  }, [mo]);

  return (
    <div className="menu-tai-khoan" ref={khung}>
      <button
        type="button"
        ref={nut}
        className="the-nguoi-dung"
        aria-expanded={mo}
        onClick={() => datMo((x) => !x)}
      >
        <span className="anh-dai-dien" aria-hidden="true">
          {chuDau(nguoiDung?.fullName)}
        </span>
        {/*
          TÊN ĐĂNG NHẬP, không phải họ tên (`0063`).

          Thẻ này trả lời "máy đang chạy bằng tài khoản nào" — câu hỏi của người
          dùng chung máy ở quầy, và của người vừa đổi tài khoản để thử một vai
          trò khác. Họ tên không trả lời được câu ấy: hai tài khoản của cùng một
          người mang y hệt một cái tên.

          Họ tên vẫn còn ở chữ viết tắt trên ảnh đại diện và ở màn hình *Thông
          tin tài khoản*.
        */}
        <span className="ten">{nguoiDung?.username}</span>
        <span className="mui-ten" aria-hidden="true" />
      </button>

      {mo && (
        <div className="menu-so">
          {/* Email ở dòng đầu, KHÔNG bấm được: nó trả lời "tôi đang đăng nhập
              bằng tài khoản nào" — câu hỏi hay gặp nhất ở người dùng chung máy
              — chứ không dẫn đi đâu. */}
          <p className="menu-so-email">{nguoiDung?.email ?? '—'}</p>
          <Lien den="/thong-tin" className="menu-so-muc">
            <BieuTuongTaiKhoan />
            Thông tin tài khoản
          </Lien>
          <button type="button" className="menu-so-muc menu-so-thoat" onClick={dangXuat}>
            <BieuTuongDangXuat />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export function BoCuc({ children }: { children: ReactNode }) {
  const { nguoiDung, dangXuat } = usePhien();
  const { duong } = useDuong();
  const [moMenu, datMoMenu] = useState(false);
  const muc = dieuHuongCho(nguoiDung?.role);

  // Chuyển màn hình thì đóng ngăn kéo lại. Thiếu chỗ này thì trên điện thoại,
  // bấm một mục xong màn hình mới nằm khuất sau ngăn kéo vẫn đang mở.
  useEffect(() => datMoMenu(false), [duong]);

  return (
    <div className={moMenu ? 'khung-app mo-menu' : 'khung-app'}>
      {/* Bỏ qua điều hướng — bắt buộc cho người dùng bàn phím (FE-35). */}
      <a className="bo-qua" href="#noi-dung-chinh">
        Bỏ qua, tới nội dung chính
      </a>

      <aside className="thanh-ben" id="dieu-huong">
        <div className="thanh-ben-dau">
          <Lien den="/" className="logo-lien">
            {/*
              `logo.png` KHÔNG có kênh trong suốt — chú thích cũ ở đây ghi ngược
              lại và chỉ lộ ra khi thanh bên chuyển sang nền navy. Nó được đặt
              lên một ô trắng có chủ ý; lý do đầy đủ ở `--mau-nen-logo` trong
              tokens.css (FE-14).
            */}
            <img src={logo} alt="Nutricare — về trang chủ" className="logo" />
            <span className="ten-thuong-hieu">
              <strong>NUTRICARE</strong>
              <small>Chính sách bán hàng</small>
            </span>
          </Lien>

          {/* Chỉ hiện khi thanh bên đang là ngăn kéo. */}
          <button type="button" className="nut-bieu-tuong nut-dong-menu" onClick={() => datMoMenu(false)}>
            <span className="chi-doc-man-hinh">Đóng điều hướng</span>
            <BieuTuongDong />
          </button>
        </div>

        <nav className="dieu-huong" aria-label="Chính">
          <ul>
            {muc.map((m) => (
              <li key={m.duong}>
                <Lien
                  den={m.duong}
                  className={duong === m.duong ? 'muc dang-o' : 'muc'}
                  {...(duong === m.duong ? { 'aria-current': 'page' as const } : {})}
                >
                  <span className="muc-hinh">{bieuTuongMuc(m.duong)}</span>
                  <span className="muc-chu">{m.nhan}</span>
                </Lien>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          SỐ PHIÊN BẢN THẬT, không phải một dòng chữ viết cứng (`0118`, VER-05).

          Tới `0117` chỗ này ghi "Phiên bản demo" — một chuỗi cố định, và nó hiện
          y hệt trên chồng production đang chạy thật. Người dùng báo lỗi thì không
          kèm được bản nào, dù `PHIEN_BAN` đã nằm sẵn trong gói từ P7d.
        */}
        <div className="thanh-ben-chan">
          <span className="cham-sang" aria-hidden="true" />
          <span>Phiên bản {PHIEN_BAN}</span>
        </div>
      </aside>

      {/*
        Nền mờ sau ngăn kéo. `aria-hidden` + không nhận tiêu điểm: người dùng bàn
        phím đóng ngăn kéo bằng nút X ở trên, không cần thêm một điểm dừng Tab
        không có nhãn.
      */}
      <div className="man-che" onClick={() => datMoMenu(false)} aria-hidden="true" />

      <div className="cot-chinh">
        <header className="thanh-tieu-de">
          <button
            type="button"
            className="nut-menu"
            aria-expanded={moMenu}
            aria-controls="dieu-huong"
            onClick={() => datMoMenu((x) => !x)}
          >
            <span className="chi-doc-man-hinh">Mở điều hướng</span>
            <BieuTuongMenu />
          </button>

          {/* Nhắc lại tên phần mềm ở đây vì trên điện thoại thanh bên đang khuất. */}
          <span className="tieu-de-gon">Chính sách bán hàng</span>

          <div className="nguoi-dung">
            <NutGiaoDien />

            {/*
              VAI TRÒ đứng RIÊNG, bên trái thẻ tài khoản (`0063`).

              Nó không phải thuộc tính của cái tên mà là thứ quyết định người
              dùng thấy gì trên mọi màn hình — nhét làm dòng phụ dưới tên thì nó
              đọc như một chú thích, mà đây là câu trả lời cho "vì sao menu của
              tôi không có mục kia".
            */}
            <span className="vai-tro-rieng">
              {NHAN_VAI_TRO[nguoiDung?.role ?? ''] ?? nguoiDung?.role}
            </span>

            {/*
              Chuông đứng SÁT TRÁI thẻ tài khoản (`0096`, chốt 23/08).

              Không đặt cạnh nút đổi giao diện ở đầu nhóm: hai thứ ấy khác hạng.
              Nút giao diện là một tuỳ chọn người ta bấm một lần rồi quên; chuông
              là chỗ có VIỆC MỚI, và nó thuộc về cụm "của tôi" — cùng cụm với tên
              tài khoản và vai trò.
            */}
            <ChuongThongBao />

            <MenuTaiKhoan nguoiDung={nguoiDung} dangXuat={dangXuat} />
          </div>
        </header>

        {/* `tabIndex={-1}` để chuyển màn hình đưa được tiêu điểm về đây. */}
        <main id="noi-dung-chinh" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
