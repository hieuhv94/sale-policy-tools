import { useEffect, useRef, useState } from 'react';
import { usePhien } from '../lib/auth.js';
import { goi, GOC_API } from '../lib/api.js';
import { BANG_LOI, docLoi } from '../lib/loi.js';
import { KENH_GOOGLE, laTinGoogle, sinhMaCuaSo, TEN_CUA_SO_GOOGLE } from '../lib/google-cua-so.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { useDuong } from '../lib/router.js';
import { duongSauDangNhap } from '../lib/sau-dang-nhap.js';
import { OMatKhau, Truong } from '../components/Chung.js';
import { NutGiaoDien } from '../components/NutGiaoDien.js';
import logo from '../logo.png';

export function DangNhap({ lopPhu = false }: { lopPhu?: boolean }) {
  const { dangNhap, dangNhapGoogle } = usePhien();
  const { di } = useDuong();
  const { bao } = useBaoLoi();
  const [login, datLogin] = useState('');
  const [matKhau, datMatKhau] = useState('');
  /*
   * Lỗi đăng nhập hiện NGAY DƯỚI Ô, không phải hộp thoại (`0088`).
   *
   * Sai mật khẩu là lỗi của một ô người dùng đang gõ, và việc phải làm tiếp là
   * gõ lại chính ô ấy. Một hộp thoại chen vào giữa hai lần gõ bắt họ bấm thêm
   * một nút để quay lại đúng chỗ vừa đứng.
   */
  const [loiO, datLoiO] = useState<string | null>(null);
  const [dangGui, datDangGui] = useState(false);
  const [coGoogle, datCoGoogle] = useState(false);
  const [choGoogle, datChoGoogle] = useState(false);
  /** Dọn kênh và đồng hồ của lượt cửa sổ bật lên đang chờ. */
  const donGoogle = useRef<(() => void) | null>(null);
  useEffect(() => () => donGoogle.current?.(), []);

  /*
   * Nút Google chỉ hiện khi máy chủ nói tính năng đang bật (`0241`): bày nút khi
   * chưa khai client id là một nút bấm vào lần nào cũng hỏng.
   *
   * Lượt hỏi hỏng thì IM LẶNG, cố ý (`0089`): nút Google là một lối PHỤ — mất nó
   * thì đường mật khẩu ngay bên trên vẫn nguyên vẹn, còn một hộp thoại lỗi chen
   * lên màn hình đăng nhập là báo hỏng cả phần mềm vì một nút bấm.
   */
  useEffect(() => {
    let conSong = true;
    void goi<{ google?: unknown }>('/auth/phuong-thuc', { congKhai: true })
      .then((r) => conSong && datCoGoogle(r?.google === true))
      .catch(() => undefined);
    return () => {
      conSong = false;
    };
  }, []);

  /*
   * Lượt đăng nhập Google hỏng thì máy chủ chuyển hướng về đây kèm `?loi=<mã>`.
   * Chỉ nhận mã `GOOGLE_*` CÓ TRONG BẢNG TRA — chữ trên thanh địa chỉ là thứ ai
   * cũng gõ được, nên nó chỉ được CHỌN một câu đã viết sẵn, không bao giờ tự
   * thành câu. Đọc xong thì gỡ khỏi địa chỉ, để tải lại trang không báo lại.
   */
  useEffect(() => {
    if (lopPhu) return;
    const ma = new URLSearchParams(window.location.search).get('loi');
    if (!ma) return;
    const muc = ma.startsWith('GOOGLE_') ? BANG_LOI[ma] : undefined;
    if (muc?.cau) datLoiO(muc.cau);
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [lopPhu]);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoiO(null);
    datDangGui(true);
    try {
      await dangNhap(login.trim(), matKhau);
      /*
       * Đăng nhập xong thì VÀO TRANG TỔNG QUAN (`0040`), TRỪ liên kết sâu (`0041`).
       *
       * Trước `0040` không có bước này: màn hình sau khi đăng nhập là bất cứ
       * đường dẫn nào đang nằm trên thanh địa chỉ. Mở app ở `/` thì tình cờ
       * đúng, còn mở lại một tab cũ đang ở `/bao-cao` hay `/nguoi-dung` thì
       * người dùng rơi thẳng vào giữa một màn hình con — và với vai trò không
       * xem được màn hình ấy thì rơi vào "Bạn không có quyền", ngay sau khi đăng
       * nhập thành công.
       *
       * `0041` chừa lại đường trỏ vào một BẢN GHI CỤ THỂ: đó là liên kết trong
       * thư báo, người dùng vừa bấm vì họ cần đúng hồ sơ đó. Xem
       * `duongSauDangNhap`.
       *
       * KHÔNG áp dụng cho lớp phủ phiên hết hạn (`lopPhu`). Ở đó màn hình bên
       * dưới vẫn còn nguyên cùng mọi thứ đang gõ dở (`FE-33`), và điều đúng là
       * trả người dùng về đúng chỗ họ đang làm — đá họ về trang tổng quan là làm
       * mất chính thứ lớp phủ ấy sinh ra để giữ.
       */
      if (!lopPhu) di(duongSauDangNhap(window.location.pathname));
    } catch (err) {
      // `vaoO` nhận hai mã của màn hình này — sai mật khẩu và tài khoản bị khoá.
      // Mọi lỗi khác (mất mạng, máy chủ hỏng) không có ô nào để gắn vào, nên
      // bảng tra đưa chúng ra hộp thoại và nhánh này không chạm tới.
      /*
       * Ở lớp phủ hết phiên, MỌI lỗi hiện dưới ô (`0242`): hộp thoại lỗi của
       * `BaoLoiProvider` giờ nằm DƯỚI lớp phủ và bị khoá cùng phần còn lại của
       * trang, nên đưa lỗi mất mạng ra đó là người dùng bấm Đăng nhập mà không
       * thấy gì xảy ra.
       */
      if (lopPhu) datLoiO(docLoi(err).cau);
      else bao(err, { vaoO: (d) => datLoiO(d.cau) });
    } finally {
      datDangGui(false);
    }
  };

  /*
   * Lớp phủ hết phiên: Google trong CỬA SỔ BẬT LÊN (`0242`) — trang này đứng yên
   * nên bản nhập dở còn nguyên. Xem `lib/google-cua-so.ts`.
   */
  const moGoogle = () => {
    donGoogle.current?.();
    datLoiO(null);
    const cuaSo = sinhMaCuaSo();
    const w = window.open(
      `${GOC_API}/auth/google/start?cua_so=${cuaSo}`,
      TEN_CUA_SO_GOOGLE,
      'popup,width=520,height=680',
    );
    if (!w) {
      datLoiO(
        'Trình duyệt đã chặn cửa sổ đăng nhập Google. Cho phép cửa sổ bật lên cho trang này, ' +
          'hoặc đăng nhập bằng mật khẩu.',
      );
      return;
    }
    datChoGoogle(true);
    const kenh = new BroadcastChannel(KENH_GOOGLE);
    // Người dùng tự đóng cửa sổ con giữa chừng thì thôi chờ — không thì nút kẹt mãi.
    const dongHo = window.setInterval(() => {
      if (w.closed) don();
    }, 500);
    const don = () => {
      kenh.close();
      window.clearInterval(dongHo);
      donGoogle.current = null;
      datChoGoogle(false);
    };
    donGoogle.current = don;
    kenh.onmessage = (e: MessageEvent) => {
      const tin: unknown = e.data;
      // Chỉ tin mang ĐÚNG mã của lượt này — kênh mọi tab cùng nghe.
      if (!laTinGoogle(tin) || tin.cuaSo !== cuaSo) return;
      don();
      if (tin.loi) {
        const muc = tin.loi.startsWith('GOOGLE_') ? BANG_LOI[tin.loi] : undefined;
        datLoiO(muc?.cau ?? BANG_LOI['GOOGLE_LOGIN_FAILED']!.cau!);
        return;
      }
      dangNhapGoogle(tin.ma!).catch((err: unknown) => datLoiO(docLoi(err).cau));
    };
  };

  return (
    <div className={lopPhu ? 'dang-nhap trong-lop-phu' : 'dang-nhap'}>
      {/*
        Nút đổi giao diện có mặt NGAY Ở MÀN HÌNH ĐĂNG NHẬP, không đợi vào trong.
        Người dùng đặt máy ở chế độ tối mà mở ra gặp một tấm trắng chói thì ấn
        tượng đầu tiên đã hỏng, và họ chưa có cách nào sửa.

        Bỏ đi khi đang là lớp phủ hết phiên: lớp phủ chỉ làm đúng một việc là
        đăng nhập lại, và giao diện đang dùng vẫn giữ nguyên phía sau.
      */}
      {!lopPhu && (
        <div className="goc-tren-phai">
          <NutGiaoDien />
        </div>
      )}

      <form className="the-dang-nhap" onSubmit={gui}>
        <div className="dang-nhap-dau">
          <img src={logo} alt="Nutricare" className="logo-lon" />
          <h1>{lopPhu ? 'Phiên đã hết hạn' : 'Chính sách bán hàng'}</h1>
          {/*
            Tên pháp nhân, dạng chữ thường (`0151`, chốt 29/08).

            KHÔNG đọc từ hằng `COMPANY` bên `document`: giao diện là gói riêng,
            import từ một service vào đây sẽ kéo cả cây phụ thuộc máy chủ vào gói
            trình duyệt. Nên đây là bản chép tay DUY NHẤT còn lại của cái tên, và
            `ten-cong-ty.test.ts` canh đúng chỗ hở ấy bằng cách quét cả repo.
          */}
          {!lopPhu && <p className="dang-nhap-phu">Công ty TNHH Dược phẩm Nutricare</p>}
        </div>
        {lopPhu && (
          <p className="ghi-chu">
            Đăng nhập lại để tiếp tục. <strong>Nội dung bạn đang nhập vẫn còn nguyên.</strong>
          </p>
        )}

        <Truong id="login" nhan="Tên đăng nhập hoặc email" bắtBuộc {...(loiO ? { loi: loiO } : {})}>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="username"
              value={login}
              onChange={(e) => datLogin(e.target.value)}
            />
          )}
        </Truong>

        <Truong id="mat-khau" nhan="Mật khẩu" bắtBuộc>
          {(p) => (
            <OMatKhau
              {...p}
              autoComplete="current-password"
              giaTri={matKhau}
              doi={datMatKhau}
            />
          )}
        </Truong>

        <button type="submit" className="nut nut-chinh nut-rong" disabled={dangGui}>
          {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>

        {/*
          Đăng nhập bằng Google (`0241`). Màn hình thường: một LIÊN KẾT điều hướng
          cả trang (CSP `form-action 'self'` chặn gửi biểu mẫu ra ngoài, và
          `fetch` không mở được trang của Google). Lớp phủ hết phiên: một NÚT mở
          cửa sổ bật lên (`0242`) — rời trang là mất bản nhập dở (`FE-33`).
        */}
        {coGoogle && (
          <>
            <div className="dang-nhap-hoac" aria-hidden="true">
              <span>hoặc</span>
            </div>
            {lopPhu ? (
              <button
                type="button"
                className="nut nut-google nut-rong"
                onClick={moGoogle}
                disabled={choGoogle}
              >
                <BieuTuongGoogle />
                {choGoogle ? 'Đang chờ cửa sổ Google…' : 'Đăng nhập bằng Google'}
              </button>
            ) : (
              <a
                className="nut nut-google nut-rong"
                href={`${GOC_API}/auth/google/start?next=${encodeURIComponent(window.location.pathname)}`}
              >
                <BieuTuongGoogle />
                Đăng nhập bằng Google
              </a>
            )}
          </>
        )}

        {/*
          Ẩn khi đang là lớp phủ hết phiên: lúc đó người dùng ĐÃ có phiên và chỉ
          cần gõ lại mật khẩu. Đưa họ sang màn hình quên mật khẩu là dỡ mất cái
          màn hình đang giữ nguyên biểu mẫu họ nhập dở (`FE-33`).
        */}
        {!lopPhu && (
          <button type="button" className="lien-phu" onClick={() => di('/quen-mat-khau')}>
            Quên mật khẩu?
          </button>
        )}
      </form>
    </div>
  );
}

/** Chữ "G" bốn màu theo hướng dẫn thương hiệu của Google — vẽ tại chỗ, không tải ảnh ngoài (CSP); màu ở `tokens.css` (FE-19). */
function BieuTuongGoogle() {
  return (
    <svg className="bieu-tuong-google" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path className="g-do" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path className="g-lam" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path className="g-vang" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path className="g-luc" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
