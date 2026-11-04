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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  dang,
  dangKyDocPhienLuu,
  dangKyHetPhien,
  dangKyLuuPhien,
  datPhien,
  goi,
  layPhien,
  LoiApi,
} from './api.js';
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
  /** Nộp mã một lần của lượt đăng nhập Google (`0241`). */
  dangNhapGoogle: (ma: string) => Promise<void>;
  dangXuat: () => void;
  capNhatNguoiDung: (n: Partial<NguoiDung>) => void;
};

const Ctx = createContext<Phien | null>(null);

const KHOA = 'csbh:phien';
/**
 * Dấu ĐĂNG XUẤT CÓ CHỦ Ý (`0242`). Phiên đã lưu bị xoá vì hai lý do khác hẳn
 * nhau, và các tab khác phải phân biệt được: người dùng bấm *Đăng xuất* (về màn
 * hình đăng nhập, bỏ bản nháp), hay một tab vừa phát hiện phiên ĐÃ CHẾT rồi dọn
 * đi (bật lớp phủ, GIỮ bản nháp — FE-33). Thiếu dấu này thì việc mở một tab mới
 * khi phiên đã chết xoá sạch bản nhập dở ở tab đang làm.
 */
const KHOA_DANG_XUAT = 'csbh:dang-xuat';

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

    /*
     * Trang nhận kết quả Google KHÔNG khôi phục phiên cũ (`0242`). Nó là một lượt
     * ĐĂNG NHẬP: phiên đã lưu ở đó nếu có thì thường đã chết, và hỏi `/auth/me`
     * bằng nó là ăn 401 rồi XOÁ phiên đã lưu — có khi xoá đúng phiên mới mà lượt
     * đổi mã vừa ghi (cuộc đua có thật), hoặc trong cửa sổ bật lên thì xoá luôn
     * dưới chân trang mẹ.
     */
    if (!luuTru || window.location.pathname === '/dang-nhap/google') {
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

  /*
   * Ba đường cho các tab KHÁC của cùng trình duyệt (`0242`). Sự kiện `storage`
   * chỉ bắn ở những tab KHÔNG ghi, nên mỗi nhánh dưới đây là chuyện tab khác vừa
   * làm:
   *
   *   - XOÁ phiên → tab kia vừa Đăng xuất. Tab này cũng về màn hình đăng nhập
   *     NGAY: bấm Đăng xuất ở một tab mà tab bên cạnh vẫn bày hồ sơ khách hàng
   *     là đăng xuất nửa vời.
   *   - GHI phiên mới khi tab này đang ở lớp phủ hết phiên → tab kia vừa đăng
   *     nhập lại. Nhận luôn phiên ấy và đóng lớp phủ; người dùng không phải gõ lại
   *     mật khẩu ở mỗi tab.
   *   - GHI phiên của NGƯỜI KHÁC → nhận người mới; `App` dỡ màn hình theo `key`.
   */
  const nguoiDungRef = useRef<NguoiDung | null>(null);
  nguoiDungRef.current = nguoiDung;
  const hetHanRef = useRef(false);
  hetHanRef.current = hetHan;

  useEffect(() => {
    dangKyDocPhienLuu(() => {
      try {
        const s = KHO().getItem(KHOA);
        return s ? (JSON.parse(s) as KetQuaDangNhap) : null;
      } catch {
        return null;
      }
    });
    const nghe = (e: StorageEvent) => {
      if (e.key !== KHOA) return;
      if (!nguoiDungRef.current) return;
      if (e.newValue === null) {
        let luc = 0;
        try {
          luc = Number(KHO().getItem(KHOA_DANG_XUAT) ?? 0);
        } catch {
          /* không đọc được thì coi như không phải đăng xuất */
        }
        if (Date.now() - luc < 10_000) {
          // Đăng xuất CÓ CHỦ Ý ở tab kia: về màn hình đăng nhập, bỏ bản nháp.
          datPhien(null);
          datNguoiDung(null);
          datHetHan(false);
          xoaHetNhap();
        } else {
          // Tab kia vừa dọn một phiên ĐÃ CHẾT: che màn hình ngay, GIỮ bản nháp.
          datHetHan(true);
        }
        return;
      }
      let moi: KetQuaDangNhap;
      try {
        moi = JSON.parse(e.newValue) as KetQuaDangNhap;
      } catch {
        return;
      }
      datPhien({ accessToken: moi.accessToken, refreshToken: moi.refreshToken });
      const khacNguoi = moi.user?.id !== nguoiDungRef.current.id;
      if (khacNguoi) xoaHetNhap();
      if (khacNguoi || hetHanRef.current) {
        datNguoiDung(moi.user);
        datHetHan(false);
      }
    };
    window.addEventListener('storage', nghe);
    return () => window.removeEventListener('storage', nghe);
  }, []);

  /*
   * Tab để KHÔNG lâu thì không gọi gì, nên không bao giờ biết phiên đã bị thu
   * hồi ở nơi khác (đổi mật khẩu, vô hiệu hoá, đăng xuất ở máy khác) — và cứ bày
   * nguyên màn hình cũ (`0242`). Hỏi lại máy chủ lúc người dùng QUAY LẠI tab, và
   * mỗi 5 phút khi tab đang hiện. `/auth/me` đi qua `goi`, nên phiên chết thật
   * thì chính đường 401 → làm mới hỏng → `khiHetPhien` bật lớp phủ.
   *
   * Lời gọi hỏng thì IM LẶNG, cố ý (`0089`): lỗi mạng ở một lượt hỏi nền không có
   * việc gì để người dùng làm; còn hết phiên thì đã được báo bằng lớp phủ.
   */
  useEffect(() => {
    if (!nguoiDung || hetHan) return;
    let lanCuoi = Date.now();
    const hoi = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lanCuoi < 30_000) return;
      lanCuoi = Date.now();
      void goi('/auth/me').catch(() => undefined);
    };
    document.addEventListener('visibilitychange', hoi);
    window.addEventListener('focus', hoi);
    const dinhKy = window.setInterval(() => {
      lanCuoi = 0;
      hoi();
    }, 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', hoi);
      window.removeEventListener('focus', hoi);
      window.clearInterval(dinhKy);
    };
  }, [nguoiDung, hetHan]);

  const luu = useCallback((kq: KetQuaDangNhap) => {
    /*
     * NGƯỜI KHÁC đăng nhập vào lớp phủ hết phiên (`0242`): bản nháp của người
     * trước KHÔNG được để lại cho người sau. `App` dỡ màn hình theo `key` là
     * id người dùng; ở đây xoá phần nháp nằm trong `sessionStorage`.
     */
    const truoc = nguoiDungRef.current;
    if (truoc && truoc.id !== kq.user.id) xoaHetNhap();
    datPhien({ accessToken: kq.accessToken, refreshToken: kq.refreshToken });
    datNguoiDung(kq.user);
    datHetHan(false);
    try {
      KHO().setItem(KHOA, JSON.stringify(kq));
    } catch {
      /* không lưu được thì phiên chỉ sống trong tab này */
    }
  }, []);

  /*
   * Hai đường đăng nhập, MỘT chỗ lưu phiên: máy chủ trả cùng một hình dạng
   * (`hoanTatDangNhap`, `0241`), nên ở đây cũng chỉ có một phép gộp.
   */
  const luuPhanHoi = useCallback(
    (r: PhanHoiDangNhap) =>
      luu({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        user: { ...r.user, mustChangePassword: r.mustChangePassword },
      }),
    [luu],
  );

  const dangNhap = useCallback(
    async (login: string, matKhau: string) => {
      const r = await goi<PhanHoiDangNhap>('/auth/login', {
        method: 'POST',
        body: { login, password: matKhau },
        congKhai: true,
      });
      luuPhanHoi(r);
    },
    [luuPhanHoi],
  );

  const dangNhapGoogle = useCallback(
    async (ma: string) => {
      const r = await goi<PhanHoiDangNhap>('/auth/google/exchange', {
        method: 'POST',
        body: { ma },
        congKhai: true,
      });
      luuPhanHoi(r);
    },
    [luuPhanHoi],
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
      // Ghi dấu TRƯỚC khi xoá: tab kia đọc nó ngay trong sự kiện `storage`.
      KHO().setItem(KHOA_DANG_XUAT, String(Date.now()));
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
    () => ({ nguoiDung, hetHan, dangTai, dangNhap, dangNhapGoogle, dangXuat, capNhatNguoiDung }),
    [nguoiDung, hetHan, dangTai, dangNhap, dangNhapGoogle, dangXuat, capNhatNguoiDung],
  );
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function usePhien(): Phien {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePhien phải nằm trong PhienProvider');
  return v;
}
