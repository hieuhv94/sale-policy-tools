/**
 * Hộp thông báo: kiểu dữ liệu, con số trên huy hiệu, và cái đồng hồ đếm.
 *
 * Phép toán ở đây tách khỏi `ChuongThongBao.tsx` vì cùng một lý do đã tách
 * `bieu-do/ve.ts` khỏi các thẻ SVG: đây là phần có thể **sai im lặng**. Một huy
 * hiệu ghi `9+` trong khi hộp có 250 dòng vẫn là một huy hiệu trông bình thường;
 * một câu "3 giờ trước" tính nhầm múi giờ cũng vậy. Phần JSX thì sai là thấy.
 */
import { useEffect, useState } from 'react';
import { dang, layJson } from './api.js';
import { ngayGio } from './format.js';

export type ThongBao = {
  id: string;
  kind: 'CHINH' | 'THEO_DOI';
  action: string | null;
  tieuDe: string;
  moTa: string | null;
  duongDan: string;
  policyId: string | null;
  customerId: string | null;
  xayRaLuc: string;
  daDocLuc: string | null;
};

export type HopThongBao = {
  items: ThongBao[];
  total: number;
  limit: number;
  offset: number;
  soChuaDoc: number;
};

/**
 * Bao nhiêu dòng trong bảng sổ xuống.
 *
 * Mười, không phải hai mươi: khối này neo vào thanh trên cùng và phải nằm gọn
 * trong màn hình mà không tự cuộn thành một trang thứ hai. Ai cần đọc hết thì có
 * *Xem tất cả* ở chân bảng.
 */
export const MOI_TRANG_CHUONG = 10;

/** Trang đầy đủ ở `/thong-bao`. */
export const MOI_TRANG_THONG_BAO = 20;

/**
 * Trần của huy hiệu (chốt 23/08).
 *
 * Khách hàng chốt **con số thật, không phải một dấu chấm** — dấu chấm nói "có
 * cái gì đó", con số nói "còn 12 việc chưa xem", và hai câu ấy dẫn tới hai hành
 * vi khác nhau. Trần 99 vì `100` là chữ số thứ ba và nó đội cái huy hiệu tròn
 * thành một viên thuốc dài, đẩy lệch cả thanh trên cùng.
 */
export const TRAN_HUY_HIEU = 99;

/** `0` → rỗng (không vẽ huy hiệu), `100` → `99+`. */
export const nhanHuyHieu = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > TRAN_HUY_HIEU ? `${TRAN_HUY_HIEU}+` : String(Math.floor(n));
};

/**
 * Nhãn cho trình đọc màn hình. Nói CON SỐ THẬT, không nói `99+`.
 *
 * Trần kia sinh ra vì chỗ hẹp trên màn hình; một câu đọc lên thì không hẹp, và
 * "hơn 99" nghe ra mơ hồ hơn hẳn "250" với người không nhìn thấy gì khác.
 */
export const nhanChuong = (n: number): string =>
  n > 0 ? `Thông báo — ${n} chưa đọc` : 'Thông báo — đã đọc hết';

const PHUT = 60_000;
const GIO = 60 * PHUT;
const NGAY = 24 * GIO;

/**
 * "3 giờ trước". Quá bảy ngày thì trả về ngày giờ tuyệt đối.
 *
 * Bậc thang dừng ở tuần vì sau đó câu tương đối mất hết ích lợi: "43 ngày trước"
 * bắt người đọc tự trừ ra, còn `09/07/2026 14:32` thì đọc thẳng.
 *
 * `bayGio` truyền vào được để ca kiểm không phải chờ đồng hồ thật.
 */
export function thoiGianTuongDoi(iso: string | null | undefined, bayGio = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';

  // Mốc ở TƯƠNG LAI thì đọc là "vừa xong", không phải "-2 phút trước". Xảy ra
  // thật khi đồng hồ máy trạm lệch vài giây so với máy chủ.
  const cach = bayGio - t;
  if (cach < PHUT) return 'vừa xong';
  if (cach < GIO) return `${Math.floor(cach / PHUT)} phút trước`;
  if (cach < NGAY) return `${Math.floor(cach / GIO)} giờ trước`;
  if (cach < 7 * NGAY) return `${Math.floor(cach / NGAY)} ngày trước`;
  return ngayGio(iso);
}

// --- Con số chưa đọc, dùng chung cho cả ứng dụng -----------------------------
//
// Cái chuông ở thanh trên cùng và trang `/thong-bao` nằm ở HAI nhánh khác nhau
// của cây React, nên không có tổ tiên chung nào tự nhiên để giữ state này —
// tổ tiên chung duy nhất là `BoCuc`, và nhét vào đó thì mọi màn hình vẽ lại mỗi
// lần con số đổi.
//
// Một kho nhỏ ngoài React thay vì một Context: nó cũng là thứ cho phép mọi lời
// gọi API trả về `soChuaDoc` đi thẳng vào huy hiệu. Đánh dấu đã đọc hết ở trang
// đầy đủ thì cái chuông tắt số NGAY, không chờ lượt hỏi định kỳ kế tiếp.

let soChuaDoc = 0;
const nguoiNghe = new Set<(n: number) => void>();

export function datSoChuaDoc(n: number): void {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (v === soChuaDoc) return;
  soChuaDoc = v;
  for (const f of [...nguoiNghe]) f(v);
}

/** Chỉ để ca kiểm bắt đầu từ một trạng thái sạch. */
export const datLaiSoChuaDoc = (): void => datSoChuaDoc(0);

/** Đọc con số. KHÔNG tự hỏi máy chủ — xem `useDemThongBao`. */
export function useSoChuaDoc(): number {
  const [n, datN] = useState(soChuaDoc);
  useEffect(() => {
    nguoiNghe.add(datN);
    // Đọc lại ngay lúc đăng ký: giữa lần dựng state ban đầu và lúc effect chạy,
    // một component khác có thể đã cập nhật con số.
    datN(soChuaDoc);
    return () => {
      nguoiNghe.delete(datN);
    };
  }, []);
  return n;
}

/** Nhịp hỏi lại máy chủ. Một phút — xem `useDemThongBao`. */
export const NHIP_HOI_MS = 60_000;

/**
 * Hỏi máy chủ số chưa đọc, định kỳ. Gọi ở ĐÚNG MỘT chỗ: cái chuông.
 *
 * Hỏi định kỳ chứ không đẩy từ máy chủ. WebSocket hay SSE đều phải đi qua
 * gateway — hiện là proxy HTTP thường — nên mở luồng dài là một hạng mục hạ
 * tầng riêng, đổi lấy vài chục giây độ trễ trên một thông báo mà email cũng
 * đang gửi song song.
 *
 * DỪNG KHI TAB BỊ ẨN, và hỏi lại ngay lúc quay lại. Không có nhánh này thì mỗi
 * tab bỏ quên trong trình duyệt vẫn nã một request mỗi phút suốt cả ngày, và
 * người dùng hay mở phần mềm ở tab riêng rồi để đó.
 */
export function useDemThongBao(bat: boolean): void {
  useEffect(() => {
    if (!bat) return;
    let song = true;

    const hoi = () => {
      if (!song || document.visibilityState !== 'visible') return;
      layJson<{ soChuaDoc: number }>('/notifications/cua-toi/dem')
        .then((r) => {
          if (song) datSoChuaDoc(r.soChuaDoc);
        })
        // NUỐT CÓ LÝ DO (`0089`): đây là con số phụ và nó tự hỏi lại sau 60
        // giây. Một lượt hỏi hụt mà dựng dải đỏ là đè lỗi của thứ người dùng
        // KHÔNG yêu cầu lên trên việc họ đang làm. Khai ở `NUOT_CO_LY_DO`.
        .catch(() => undefined);
    };

    hoi();
    const dongHo = setInterval(hoi, NHIP_HOI_MS);
    const doiTam = () => {
      if (document.visibilityState === 'visible') hoi();
    };
    document.addEventListener('visibilitychange', doiTam);
    return () => {
      song = false;
      clearInterval(dongHo);
      document.removeEventListener('visibilitychange', doiTam);
    };
  }, [bat]);
}

export const duongHop = (limit: number, offset = 0): string =>
  `/notifications/cua-toi?limit=${limit}&offset=${offset}`;

/** Đánh dấu một dòng đã đọc, rồi đồng bộ huy hiệu bằng con số máy chủ trả về. */
export async function danhDauDaDoc(id: string): Promise<void> {
  const r = await dang<{ soChuaDoc: number }>(`/notifications/${id}/da-doc`);
  datSoChuaDoc(r.soChuaDoc);
}

export async function danhDauDaDocHet(): Promise<number> {
  const r = await dang<{ soDaDanhDau: number; soChuaDoc: number }>('/notifications/da-doc-het');
  datSoChuaDoc(r.soChuaDoc);
  return r.soDaDanhDau;
}
