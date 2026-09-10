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
  soViecChuaDoc: number;
  soTinChuaDoc: number;
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

/** Số chưa đọc, tách theo BẬC (`0192`). */
export type DemChuaDoc = { viec: number; tin: number };

/** Rác từ mạng về 0 ngay tại cửa: `NaN`, số âm, số lẻ đều thành một số đếm được. */
const nguyenDuong = (n: number): number =>
  Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

/**
 * Chuông vẽ gì: một CON SỐ, một DẤU CHẤM, hay không gì (`0192`).
 *
 * MỘT hàm trả kiểu phân biệt, không phải hai điều kiện rời nhau trong JSX. Cả
 * tệp này sinh ra vì phần "có thể sai im lặng" (xem đầu tệp), và hai điều kiện
 * rời sẽ có ngày cùng đúng một lúc — số và chấm chồng lên nhau ở một góc 18px,
 * mà không có gì đỏ. Kiểu dữ liệu thì không cho hai nhánh cùng đúng.
 *
 * LUẬT LOẠI TRỪ: chấm chỉ hiện khi KHÔNG có số. Con số đã là lý do đủ mạnh để
 * mở chuông ra, và mở ra thì thấy hết — bày cả hai là hai thứ tranh nhau một
 * chỗ để rồi dẫn tới cùng một hành động.
 *
 * VÌ SAO SỐ CHỈ ĐẾM VIỆC: khách hàng chốt 23/08 rằng huy hiệu phải là *con số
 * thật, không phải một dấu chấm* — vì *"con số nói còn 12 VIỆC chưa xem"*. Tới
 * `0191` con số ấy trộn cả tin lẫn việc nên nó chưa bao giờ nói đúng câu ấy: với
 * một TDV nó leo lên vài chục rồi đứng đó, và một con số không bao giờ về 0 thì
 * thôi được ai phản ứng. Lọc về bậc VIỆC là trả nó về đúng nghĩa đã đặt cho nó.
 *
 * Dấu chấm KHÔNG đảo lại quyết định ấy: 23/08 chốt *chấm THAY CHO số*, còn đây
 * là *chấm khi KHÔNG CÓ số* — cho đúng loại thông báo mà không có gì để đếm.
 */
export type DauChuong = { dang: 'so'; nhan: string } | { dang: 'cham' } | { dang: 'khong' };

export function dauChuong(d: DemChuaDoc): DauChuong {
  const viec = nguyenDuong(d.viec);
  // `nhanHuyHieu` không bao giờ trả rỗng ở đây vì `viec` đã chuẩn hoá và > 0 —
  // đó là lý do phép chuẩn hoá đứng TRƯỚC, chứ không phải một bước thừa.
  if (viec > 0) return { dang: 'so', nhan: nhanHuyHieu(viec) };
  return nguyenDuong(d.tin) > 0 ? { dang: 'cham' } : { dang: 'khong' };
}

/**
 * Nhãn cho trình đọc màn hình. Nói CON SỐ THẬT, không nói `99+`.
 *
 * Trần kia sinh ra vì chỗ hẹp trên màn hình; một câu đọc lên thì không hẹp, và
 * "hơn 99" nghe ra mơ hồ hơn hẳn "250" với người không nhìn thấy gì khác.
 *
 * NÓI CẢ HAI VẾ (`0192`). Dấu chấm hoàn toàn vô hình với người dùng trình đọc
 * màn hình — không có kích thước, không có chữ — nên câu này là đường DUY NHẤT
 * họ biết còn tin chưa đọc. Cùng lý do khiến `demChuaDocCua` bên máy chủ trả về
 * một CON SỐ tin chứ không phải một cờ.
 */
/**
 * Trừ một, khỏi ĐÚNG VẾ của dòng vừa được đọc (`0192`).
 *
 * Tô lại ngay tại chỗ chứ không chờ máy chủ: màn hình đang chuyển đi nơi khác.
 * Nhưng "trừ vế nào" là một quyết định có thể sai im lặng — trừ nhầm thì huy
 * hiệu tụt đi một trong khi việc vẫn còn, và lượt hỏi định kỳ sau đó lại đẩy nó
 * lên, thành một con số nhấp nháy mà không ai truy ra được nguyên nhân.
 */
export const truMot = (d: DemChuaDoc, tb: ThongBao): DemChuaDoc =>
  tb.kind === 'CHINH'
    ? { viec: Math.max(0, d.viec - 1), tin: d.tin }
    : { viec: d.viec, tin: Math.max(0, d.tin - 1) };

export function nhanChuong(d: DemChuaDoc): string {
  const viec = nguyenDuong(d.viec);
  const tin = nguyenDuong(d.tin);
  if (viec === 0 && tin === 0) return 'Thông báo — đã đọc hết';
  const ve: string[] = [];
  if (viec > 0) ve.push(`${viec} việc chưa xem`);
  if (tin > 0) ve.push(`${tin} tin mới`);
  return `Thông báo — ${ve.join(', ')}`;
}

/**
 * Lớp CSS của một dòng trong hộp thông báo (`0192`).
 *
 * HAI TRỤC ĐỘC LẬP, và cả bốn tổ hợp phải phân biệt được: *đã đọc / chưa đọc*
 * (chấm xanh + chữ đậm) và *việc / tin* (dải hổ phách + nền nhạt). Một dòng bậc
 * VIỆC đã đọc vẫn là việc chưa làm xong — đọc không phải làm — nên hai trục
 * không được gộp.
 *
 * `tb-de-biet` ĐÃ GỠ. Chip ấy (`0036`) đánh dấu cái KHÔNG quan trọng: trong mười
 * dòng mà tám là tin, mắt phải đi tìm hai dòng KHÔNG có chip, và tìm một thứ
 * vắng mặt thì phải quét từng dòng.
 *
 * `0195` — TỪ ĐÂY BẬC ĐỌC BẰNG MÀU, không còn chữ nào nói ra nó. Khách hàng chốt
 * 10/09 bỏ hai nhãn *Cần bạn xử lý* / *Để bạn biết* khỏi tiêu đề, nên `tb-viec`
 * là thứ duy nhất còn phân biệt hai bậc trên màn hình. Trước `0195` gỡ nhầm lớp
 * ấy chỉ làm màn hình nghèo đi; từ `0195` nó XOÁ HẲN một trục thông tin — có ca
 * kiểm đứng canh cả hai chiều.
 *
 * Ở ĐÂY chứ không viết thẳng trong JSX, vì hai màn hình dựng cùng danh sách này
 * (cái chuông và `/thong-bao`) và một bản chép tay sẽ trôi.
 */
export const lopDong = (tb: ThongBao): string =>
  ['tb-dong', tb.daDocLuc ? '' : 'tb-chua-doc', tb.kind === 'CHINH' ? 'tb-viec' : '']
    .filter(Boolean)
    .join(' ');

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
// gọi API trả về hai con số ấy đi thẳng vào huy hiệu. Đánh dấu đã đọc hết ở
// trang đầy đủ thì cái chuông tắt NGAY, không chờ lượt hỏi định kỳ kế tiếp.

let chuaDoc: DemChuaDoc = { viec: 0, tin: 0 };
const nguoiNghe = new Set<(d: DemChuaDoc) => void>();

export function datChuaDoc(d: DemChuaDoc): void {
  const v: DemChuaDoc = { viec: nguyenDuong(d.viec), tin: nguyenDuong(d.tin) };
  if (v.viec === chuaDoc.viec && v.tin === chuaDoc.tin) return;
  chuaDoc = v;
  for (const f of [...nguoiNghe]) f(v);
}

/** Chỉ để ca kiểm bắt đầu từ một trạng thái sạch. */
export const datLaiChuaDoc = (): void => datChuaDoc({ viec: 0, tin: 0 });

/** Đọc hai con số. KHÔNG tự hỏi máy chủ — xem `useDemThongBao`. */
export function useChuaDoc(): DemChuaDoc {
  const [d, datD] = useState(chuaDoc);
  useEffect(() => {
    nguoiNghe.add(datD);
    // Đọc lại ngay lúc đăng ký: giữa lần dựng state ban đầu và lúc effect chạy,
    // một component khác có thể đã cập nhật con số.
    datD(chuaDoc);
    return () => {
      nguoiNghe.delete(datD);
    };
  }, []);
  return d;
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
      layJson<{ soViecChuaDoc: number; soTinChuaDoc: number }>('/notifications/cua-toi/dem')
        .then((r) => {
          if (song) datChuaDoc({ viec: r.soViecChuaDoc, tin: r.soTinChuaDoc });
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

type DemVe = { soViecChuaDoc: number; soTinChuaDoc: number };
const doiVe = (r: DemVe): DemChuaDoc => ({ viec: r.soViecChuaDoc, tin: r.soTinChuaDoc });

/** Đánh dấu một dòng đã đọc, rồi đồng bộ huy hiệu bằng con số máy chủ trả về. */
export async function danhDauDaDoc(id: string): Promise<void> {
  datChuaDoc(doiVe(await dang<DemVe>(`/notifications/${id}/da-doc`)));
}

export async function danhDauDaDocHet(): Promise<number> {
  const r = await dang<DemVe & { soDaDanhDau: number }>('/notifications/da-doc-het');
  // Xoá CẢ HAI vế. Đường này đánh dấu cả hộp, nên bỏ sót một vế là cái chuông
  // giữ nguyên dấu chấm sau khi người dùng vừa bấm "đã đọc hết" (`0192`).
  datChuaDoc(doiVe(r));
  return r.soDaDanhDau;
}
