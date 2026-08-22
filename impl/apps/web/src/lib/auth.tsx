/**
 * Phiên đăng nhập.
 *
 * Điểm khó nhất không phải đăng nhập mà là HẾT HẠN GIỮA CHỪNG (`FE-33`): người
 * dùng đang nhập hồ sơ 20 dòng thì token chết. Đá họ về màn hình đăng nhập và
 * xoá sạch biểu mẫu là cách nhanh nhất để mất lòng tin vào phần mềm.
 *
 * Nên phiên hết hạn KHÔNG dỡ màn hình đang mở. Nó bật một lớp phủ đăng nhập lại
 * ĐÈ LÊN màn hình cũ; đăng nhập xong thì lớp phủ biến mất và mọi thứ bên dưới
 * còn nguyên — kể cả state React đang giữ dở, nên không cần khôi phục gì cả.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { dang, dangKyHetPhien, dangKyLuuPhien, datPhien, goi, layPhien, LoiApi } from './api.js';
import { xoaHetNhap } from './nhap-tam.js';

export type NguoiDung = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
};

/**
 * Máy chủ trả `mustChangePassword` ở NGOÀI khối `user` (xem auth.service.ts).
 * Gộp lại ngay tại đây, một chỗ, thay vì để mọi màn hình phải nhớ đọc hai nơi.
 */
type PhanHoiDangNhap = {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  user: Omit<NguoiDung, 'mustChangePassword'>;
};

type KetQuaDangNhap = {
  accessToken: string;
  refreshToken: string;
  user: NguoiDung;
};

type Phien = {
  nguoiDung: NguoiDung | null;
  hetHan: boolean;
  dangTai: boolean;
  dangNhap: (login: string, matKhau: string) => Promise<void>;
  dangXuat: () => void;
  capNhatNguoiDung: (n: Partial<NguoiDung>) => void;
};

const Ctx = createContext<Phien | null>(null);

const KHOA = 'csbh:phien';

/**
 * Nơi giữ phiên: `localStorage`, đổi từ `sessionStorage` ở `0042`.
 *
 * `sessionStorage` chết theo TAB. Nghĩa là dù refresh token còn hạn cả tuần,
 * đóng trình duyệt là phải đăng nhập lại — và đó mới là thứ người dùng gặp hàng
 * ngày, không phải cái hạn kia. Kéo dài hạn token mà vẫn để ở đây thì không đổi
 * được gì.
 *
 * KHÁC với `nhap-tam.ts`, và khác có chủ ý: bản nháp biểu mẫu vẫn ở
 * `sessionStorage`. Hai thứ chịu hai rủi ro khác nhau trên một máy dùng chung —
 * phiên thì thu hồi được từ xa (đổi mật khẩu, vô hiệu hoá tài khoản) và người
 * dùng thấy rõ mình đang đăng nhập; còn nội dung hồ sơ khách hàng nằm lại trong
 * `localStorage` sau khi người ta rời đi thì không ai thu hồi được, và không ai
 * biết nó ở đó.
 *
 * `dangXuat` xoá khoá này, nên nút Đăng xuất vẫn cắt sạch như cũ.
 */
const KHO = () => localStorage;

export function PhienProvider({ children }: { children: ReactNode }) {
  const [nguoiDung, datNguoiDung] = useState<NguoiDung | null>(null);
  const [hetHan, datHetHan] = useState(false);
  const [dangTai, datDangTai] = useState(true);

  /*
   * KHÔI PHỤC phiên, rồi HỎI MÁY CHỦ xem nó còn sống không (`0076`).
   *
   * Trước đợt này bước thứ hai không có: đọc `localStorage` ra là tin luôn. Với
   * một phiên đã chết thì màn hình dựng đủ *Tổng quan*, gọi báo cáo, ăn 401, làm
   * mới hỏng — và người dùng nhận một lớp phủ "phiên hết hạn" ĐÈ LÊN một trang
   * tổng quan trống rỗng mà họ chưa hề đăng nhập để vào. Mở phần mềm sau vài
   * ngày nghỉ là gặp đúng cảnh ấy.
   *
   * Thứ chặn màn hình là `dangTai`, KHÔNG phải việc để `nguoiDung` rỗng. Phiên
   * cũ vẫn nạp vào ngay và đồng bộ như trước — `App` không dựng gì chừng nào
   * `dangTai` còn bật, nên không ai nhìn thấy trạng thái chưa xác thực ấy. Để
   * `nguoiDung` rỗng cho tới lúc máy chủ trả lời thì mọi thành phần đọc phiên
   * đều phải chịu thêm một khoảnh khắc "chưa có ai đăng nhập" — một trạng thái
   * mới, ở khắp nơi, chỉ để giải quyết một chuyện của riêng màn hình đầu tiên.
   *
   * Ba nhánh, và nhánh thứ ba mới là chỗ dễ làm sai:
   *
   *   1. `/auth/me` trả về → phiên sống. Lấy luôn hồ sơ MỚI của máy chủ thay cho
   *      bản đã lưu: vai trò đổi hay bị buộc đổi mật khẩu thì có hiệu lực ngay
   *      lần mở tiếp theo, không phải đợi tới lần đăng nhập lại.
   *   2. 401 → phiên chết thật. Xoá sạch, hiện bảng đăng nhập.
   *   3. **Lỗi mạng** → chưa biết gì cả. KHÔNG xoá phiên: máy chủ đang khởi động
   *      lại hay mạng chập là chuyện của máy chủ, mà đá người dùng ra và xoá
   *      token của họ là biến một sự cố vài giây thành một lần đăng nhập lại.
   *      Vào bằng hồ sơ đã lưu; lời gọi sau sẽ tự phát hiện nếu phiên hỏng thật.
   */
  useEffect(() => {
    let song = true;
    let luuTru: KetQuaDangNhap | null = null;
    try {
      const s = KHO().getItem(KHOA);
      if (s) luuTru = JSON.parse(s) as KetQuaDangNhap;
    } catch {
      /* phiên hỏng thì coi như chưa đăng nhập */
    }

    if (!luuTru) {
      datDangTai(false);
      return;
    }

    const cu = luuTru;
    datPhien({ accessToken: cu.accessToken, refreshToken: cu.refreshToken });
    datNguoiDung(cu.user);

    void goi<NguoiDung>('/auth/me')
      .then((me) => {
        if (!song) return;
        datNguoiDung(me);
        // Ghi đè bản đã lưu bằng hồ sơ vừa lấy: lần mở sau nếu gặp lỗi mạng thì
        // nhánh 3 vào bằng bản MỚI NHẤT chứ không bằng bản của lần đăng nhập.
        try {
          KHO().setItem(KHOA, JSON.stringify({ ...cu, ...layPhien(), user: me }));
        } catch {
          /* không sao */
        }
      })
      .catch((e: unknown) => {
        if (!song) return;
        // Lỗi mạng: giữ nguyên hồ sơ đã nạp ở trên, không đụng gì.
        if (e instanceof LoiApi && e.laLoiMang) return;
        datPhien(null);
        datNguoiDung(null);
        // `goi()` đã bắn `khiHetPhien` trên đường ra. Đặt lại, nếu không thì màn
        // hình đăng nhập mọc thêm một lớp phủ đăng nhập chồng lên chính nó.
        datHetHan(false);
        try {
          KHO().removeItem(KHOA);
        } catch {
          /* không sao */
        }
      })
      .finally(() => {
        if (song) datDangTai(false);
      });

    return () => {
      song = false;
    };
  }, []);

  useEffect(() => {
    dangKyHetPhien(() => datHetHan(true));

    /*
     * Ghi lại phiên sau MỖI lần xoay vòng token (`0043`).
     *
     * Refresh token chỉ dùng được một lần. Không ghi lại thì bản lưu mang mãi
     * token của lần đăng nhập, và lần mở trình duyệt kế tiếp gửi lên một token
     * đã dùng — máy chủ đọc ra là bị đánh cắp và thu hồi cả họ.
     *
     * Giữ nguyên phần `user` đang lưu: lời gọi làm mới chỉ trả về hai token,
     * không trả về hồ sơ người dùng.
     */
    dangKyLuuPhien((p) => {
      try {
        const s = KHO().getItem(KHOA);
        if (!s) return;
        const cu = JSON.parse(s) as KetQuaDangNhap;
        KHO().setItem(KHOA, JSON.stringify({ ...cu, ...p }));
      } catch {
        /* không lưu được thì phiên chỉ sống tới lúc đóng trình duyệt */
      }
    });
  }, []);

  const luu = useCallback((kq: KetQuaDangNhap) => {
    datPhien({ accessToken: kq.accessToken, refreshToken: kq.refreshToken });
    datNguoiDung(kq.user);
    datHetHan(false);
    try {
      KHO().setItem(KHOA, JSON.stringify(kq));
    } catch {
      /* không lưu được thì phiên chỉ sống trong tab này */
    }
  }, []);

  const dangNhap = useCallback(
    async (login: string, matKhau: string) => {
      const r = await goi<PhanHoiDangNhap>('/auth/login', {
        method: 'POST',
        body: { login, password: matKhau },
        congKhai: true,
      });
      luu({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        user: { ...r.user, mustChangePassword: r.mustChangePassword },
      });
    },
    [luu],
  );

  const dangXuat = useCallback(() => {
    // Đăng xuất CÓ CHỦ Ý thì xoá cả bản nháp — khác hẳn với phiên hết hạn.
    const p = layPhien();
    /*
     * Lời gọi này hỏng thì IM LẶNG, cố ý (`0089`).
     *
     * Phía trình duyệt đã đăng xuất xong ngay dưới đây dù máy chủ trả gì; báo
     * lỗi là bắt người vừa bấm Đăng xuất đọc một hộp thoại về việc họ đang rời
     * đi. Token còn sống ở máy chủ thì tự hết hạn theo cửa sổ phiên.
     */
    if (p) void dang('/auth/logout', { refreshToken: p.refreshToken }).catch(() => undefined);
    datPhien(null);
    datNguoiDung(null);
    datHetHan(false);
    xoaHetNhap();
    try {
      KHO().removeItem(KHOA);
    } catch {
      /* không sao */
    }
  }, []);

  const capNhatNguoiDung = useCallback((n: Partial<NguoiDung>) => {
    datNguoiDung((cu) => {
      if (!cu) return cu;
      const moi = { ...cu, ...n };
      try {
        const s = KHO().getItem(KHOA);
        if (s) {
          const p = JSON.parse(s) as KetQuaDangNhap;
          KHO().setItem(KHOA, JSON.stringify({ ...p, user: moi }));
        }
      } catch {
        /* không sao */
      }
      return moi;
    });
  }, []);

  const v = useMemo(
    () => ({ nguoiDung, hetHan, dangTai, dangNhap, dangXuat, capNhatNguoiDung }),
    [nguoiDung, hetHan, dangTai, dangNhap, dangXuat, capNhatNguoiDung],
  );
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function usePhien(): Phien {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePhien phải nằm trong PhienProvider');
  return v;
}
