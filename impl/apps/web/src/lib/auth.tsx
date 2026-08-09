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
import { dang, dangKyHetPhien, datPhien, goi, layPhien } from './api.js';
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

/** Khoá lưu phiên. `sessionStorage` — xem lý do ở nhap-tam.ts. */
const KHOA = 'csbh:phien';

export function PhienProvider({ children }: { children: ReactNode }) {
  const [nguoiDung, datNguoiDung] = useState<NguoiDung | null>(null);
  const [hetHan, datHetHan] = useState(false);
  const [dangTai, datDangTai] = useState(true);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(KHOA);
      if (s) {
        const p = JSON.parse(s) as KetQuaDangNhap;
        datPhien({ accessToken: p.accessToken, refreshToken: p.refreshToken });
        datNguoiDung(p.user);
      }
    } catch {
      /* phiên hỏng thì coi như chưa đăng nhập */
    }
    datDangTai(false);
  }, []);

  useEffect(() => {
    dangKyHetPhien(() => datHetHan(true));
  }, []);

  const luu = useCallback((kq: KetQuaDangNhap) => {
    datPhien({ accessToken: kq.accessToken, refreshToken: kq.refreshToken });
    datNguoiDung(kq.user);
    datHetHan(false);
    try {
      sessionStorage.setItem(KHOA, JSON.stringify(kq));
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
    if (p) void dang('/auth/logout', { refreshToken: p.refreshToken }).catch(() => undefined);
    datPhien(null);
    datNguoiDung(null);
    datHetHan(false);
    xoaHetNhap();
    try {
      sessionStorage.removeItem(KHOA);
    } catch {
      /* không sao */
    }
  }, []);

  const capNhatNguoiDung = useCallback((n: Partial<NguoiDung>) => {
    datNguoiDung((cu) => {
      if (!cu) return cu;
      const moi = { ...cu, ...n };
      try {
        const s = sessionStorage.getItem(KHOA);
        if (s) {
          const p = JSON.parse(s) as KetQuaDangNhap;
          sessionStorage.setItem(KHOA, JSON.stringify({ ...p, user: moi }));
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
