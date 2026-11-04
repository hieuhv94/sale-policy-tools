import { useEffect, useRef, useState } from 'react';
import { usePhien } from '../lib/auth.js';
import { docLoi } from '../lib/loi.js';
import { useDuong } from '../lib/router.js';
import { duongSauDangNhap } from '../lib/sau-dang-nhap.js';
import { DangTai } from '../components/Chung.js';

/**
 * Trang nhận kết quả đăng nhập Google (`0241`).
 *
 * Máy chủ chuyển hướng về `/dang-nhap/google#ma=<mã một lần>&next=<đường>`. Mã
 * nằm ở FRAGMENT nên không bao giờ tới máy chủ qua thanh địa chỉ; trang này nộp
 * nó bằng `POST /auth/google/exchange` và nhận phiên như một lượt đăng nhập mật
 * khẩu.
 *
 * Fragment bị GỠ khỏi thanh địa chỉ NGAY khi đọc, trước cả lượt gọi mạng: mã chỉ
 * dùng được một lần, nhưng một địa chỉ còn mang nó thì nằm lại trong lịch sử
 * trình duyệt, và bấm Quay lại sẽ nộp lại một mã đã chết.
 */
export function DangNhapGoogle() {
  const { dangNhapGoogle } = usePhien();
  const { di } = useDuong();
  const [loi, datLoi] = useState<string | null>(null);
  /*
   * Nộp đúng MỘT lần. `StrictMode` chạy effect hai lần lúc phát triển, mà mã một
   * lần thì lượt thứ hai chắc chắn hỏng — và nó hỏng SAU lượt đầu, nên câu lỗi
   * đè lên màn hình đã đăng nhập xong.
   */
  const daNop = useRef(false);

  useEffect(() => {
    if (daNop.current) return;
    daNop.current = true;
    const f = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const ma = f.get('ma');
    const next = f.get('next') ?? '/';
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!ma) {
      datLoi('Đường dẫn đăng nhập bằng Google không đúng. Quay lại màn hình đăng nhập và bấm lại.');
      return;
    }
    dangNhapGoogle(ma)
      .then(() => di(duongSauDangNhap(next)))
      .catch((e: unknown) => datLoi(docLoi(e).cau));
  }, [dangNhapGoogle, di]);

  if (!loi) {
    return (
      <div className="trang-dang-tai">
        <DangTai nhan="Đang đăng nhập bằng Google…" />
      </div>
    );
  }
  return (
    <div className="dang-nhap">
      <div className="the-dang-nhap">
        <h1>Chưa đăng nhập được</h1>
        <p className="ghi-chu" role="alert">
          {loi}
        </p>
        <button type="button" className="nut nut-chinh nut-rong" onClick={() => di('/')}>
          Tới màn hình đăng nhập
        </button>
      </div>
    </div>
  );
}
