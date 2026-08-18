/**
 * Kiểu dữ liệu và cách nạp ba báo cáo tổng hợp.
 *
 * Cả màn hình *Báo cáo* lẫn trang *Tổng quan* đều đọc đúng ba endpoint này. Khai
 * kiểu hai lần thì đến lúc máy chủ thêm một trường, một bên được cập nhật còn
 * bên kia thì không — và trình biên dịch không kêu, vì cả hai đều vẫn hợp lệ.
 *
 * Ba lời gọi đi CÙNG NHAU trong một `Promise.all`: chúng đọc cùng một
 * read-model tại cùng một thời điểm, nên tách ra thành ba lần chờ chỉ làm màn
 * hình nhảy ba nhịp mà không nhanh hơn.
 */
import { useEffect, useState } from 'react';
import { layJson } from './api.js';

export type TienDo = {
  total: number;
  byStatus: Record<string, number>;
  byPendingStep: Record<string, number>;
  /**
   * Đếm theo Ô của trang tổng quan (`0045`) — khoá là `OBuoc` bên `tong-quan.ts`.
   *
   * Khác `byPendingStep` ở hai điểm, và cả hai đều cần: B8 tách làm hai theo
   * việc Sale Admin đang làm bản cứng lần đầu hay làm lại, và mỗi ô kèm số hồ sơ
   * đã quá hạn để thẻ nói được "12, trong đó 3 quá hạn".
   */
  byStepDetail?: Record<string, { total: number; overdue: number } | undefined>;
  byHandler: { userId: string; name: string | null; count: number }[];
};

export type TyLeTraLai = {
  submitted: number;
  returned: number;
  rejected: number;
  returnedOrRejected: number;
  rate: number;
};

export type Sla = {
  waiting: number;
  overdue: number;
  dueUnflagged: number;
  dueToday: number;
  avgWaitingDays: number;
  excludedLegacy: number;
};

export type BoBaoCao = { tienDo: TienDo; traLai: TyLeTraLai; sla: Sla };

export type KetQuaBaoCao = {
  bo: BoBaoCao | null;
  loi: unknown;
  /** Mốc đọc số liệu — read-model trễ vài giây so với nguồn (RPT-14). */
  luc: Date | null;
};

/** `bat = false` thì không gọi gì — vai trò không có khối nào cần tới. */
export function useBaoCao(bat = true): KetQuaBaoCao {
  const [bo, datBo] = useState<BoBaoCao | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [luc, datLuc] = useState<Date | null>(null);

  useEffect(() => {
    if (!bat) return;
    const huy = new AbortController();
    datLoi(null);
    Promise.all([
      layJson<TienDo>('/reports/progress', huy.signal),
      layJson<TyLeTraLai>('/reports/return-rate', huy.signal),
      layJson<Sla>('/reports/sla', huy.signal),
    ])
      .then(([tienDo, traLai, sla]) => {
        datBo({ tienDo, traLai, sla });
        datLuc(new Date());
      })
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [bat]);

  return { bo, loi, luc };
}
