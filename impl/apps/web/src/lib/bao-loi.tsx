/**
 * **Một cửa duy nhất để báo lỗi ra màn hình** (`0088`).
 *
 * Tới `0088` mỗi màn hình tự giữ `useState` cho lỗi rồi tự vẽ một khối đỏ ở chỗ
 * nó thấy tiện — đo được 60 chỗ, 15 trong số đó thay hẳn cả trang. Hệ quả không
 * phải xấu xí mà là **KHÔNG ĐỌC ĐƯỢC**: khối đỏ nằm cuối một biểu mẫu dài thì
 * người dùng bấm Lưu, không thấy gì đổi, và tưởng phần mềm treo.
 *
 * Ở đây chỉ có hai thứ hiện lên, và bảng tra quyết định dùng thứ nào:
 *
 *   - **Hộp thoại** — chặn màn hình. Thao tác vừa bấm không thành.
 *   - **Thanh nổi** — góc dưới bên phải, tự tắt. Việc phụ hỏng, không mất gì.
 *
 * Ba dạng còn lại KHÔNG hiện gì ở đây, và đó là chủ ý:
 *
 *   - `o-nhap` — trả về cho nơi gọi để nó gắn câu vào đúng ô. Nơi gọi không
 *     nhận thì lùi về hộp thoại, vì mất hẳn một câu lỗi tệ hơn là đặt sai chỗ.
 *   - `trang` — nơi gọi dựng `TrangLoi` tại chỗ; hộp thoại sai ở đây vì đóng nó
 *     xong thì phía sau là trang trắng.
 *   - `im` — lỗi giữa các service, hoặc lớp phủ phiên đã lo.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { docLoi, type Dang, type LoiDaDoc } from './loi.js';

/** Thanh nổi sống bao lâu. Đủ đọc một câu hai dòng, không đủ để thành vật cản. */
const GIAY_NOI = 6000;

type NhanTruong = (loi: LoiDaDoc) => void;

type Cua = {
  /**
   * Báo một lỗi. Trả về bản đã đọc để nơi gọi biết chuyện gì vừa xảy ra —
   * nhất là `dang: 'o-nhap'` khi nó cần tự gắn câu vào ô.
   */
  bao: (loi: unknown, tuyChon?: { vaoO?: NhanTruong }) => LoiDaDoc;
};

const Ctx = createContext<Cua | null>(null);

type Dang2 = Extract<Dang, 'hop-thoai' | 'thanh-noi'>;
type DangHien = LoiDaDoc & { khoa: number; kieu: Dang2 };

export function BaoLoiProvider({ children }: { children: ReactNode }) {
  const [hop, datHop] = useState<DangHien | null>(null);
  const [noi, datNoi] = useState<DangHien[]>([]);

  const bao = useCallback((loi: unknown, tuyChon?: { vaoO?: NhanTruong }): LoiDaDoc => {
    const d = docLoi(loi);
    const khoa = Date.now() + Math.random();

    if (d.dang === 'im' || d.dang === 'trang') return d;

    if (d.dang === 'o-nhap') {
      // Nơi gọi nhận được thì nó hiện ngay dưới ô. Không nhận thì vẫn phải báo:
      // một lỗi rơi vào khoảng không là người dùng bấm Lưu mà không có gì xảy ra.
      if (tuyChon?.vaoO) {
        tuyChon.vaoO(d);
        return d;
      }
      datHop({ ...d, khoa, kieu: 'hop-thoai' });
      return d;
    }

    if (d.dang === 'thanh-noi') {
      datNoi((ds) => [...ds, { ...d, khoa, kieu: 'thanh-noi' }]);
      return d;
    }

    datHop({ ...d, khoa, kieu: 'hop-thoai' });
    return d;
  }, []);

  const v = useMemo(() => ({ bao }), [bao]);

  return (
    <Ctx.Provider value={v}>
      {children}
      {hop && <HopThoaiLoi loi={hop} dong={() => datHop(null)} />}
      {noi.length > 0 && (
        <div className="vung-noi" aria-live="polite">
          {noi.map((n) => (
            <ThanhNoi key={n.khoa} loi={n} dong={() => datNoi((ds) => ds.filter((x) => x !== n))} />
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useBaoLoi(): Cua {
  const v = useContext(Ctx);
  // Không ném: một màn hình dựng ngoài provider trong test vẫn phải chạy được,
  // và nuốt lỗi ở đây thì chính test ấy sẽ nói ra bằng cách khác.
  return v ?? { bao: (loi) => docLoi(loi) };
}

/**
 * Hộp thoại lỗi.
 *
 * KHÔNG dùng `HopThoai` chung: hộp ấy đóng được bằng cách bấm ra ngoài, mà một
 * câu lỗi đóng bằng cú bấm vô ý là một câu chưa ai đọc. Ở đây chỉ Escape và nút
 * *Đã hiểu* đóng được.
 */
function HopThoaiLoi({ loi, dong }: { loi: DangHien; dong: () => void }) {
  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dong();
    };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [dong]);

  return (
    <div className="lop-phu lop-phu-loi">
      <div className="hop-loi" role="alertdialog" aria-modal="true" aria-labelledby="hop-loi-cau">
        <p className="hop-loi-cau" id="hop-loi-cau">
          {loi.cau}
        </p>
        {loi.laLoiMang && (
          <p className="hop-loi-phu">Dữ liệu bạn đã nhập vẫn được giữ nguyên.</p>
        )}
        {loi.chiTiet && <p className="hop-loi-phu">{loi.chiTiet}</p>}
        <div className="hop-loi-day">
          {/*
            Mã tra cứu ở dòng cuối, cỡ nhỏ (`0088`). Người dùng đọc nó qua điện
            thoại cho Quản trị, nên nó phải có mặt — nhưng nó không phải thứ đọc
            trước, và tới `0088` nó đứng ngang hàng với câu lỗi.
          */}
          {loi.traceId && <span className="hop-loi-ma">Mã tra cứu: {loi.traceId}</span>}
          <button type="button" className="nut nut-chinh" onClick={dong}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}

function ThanhNoi({ loi, dong }: { loi: DangHien; dong: () => void }) {
  useEffect(() => {
    const h = setTimeout(dong, GIAY_NOI);
    return () => clearTimeout(h);
  }, [dong]);

  return (
    <div className="thanh-noi" role="status">
      <span className="thanh-noi-cau">{loi.cau}</span>
      <button type="button" className="thanh-noi-dong" onClick={dong} aria-label="Đóng thông báo">
        ×
      </button>
    </div>
  );
}
