/**
 * **Lịch sử CSBH của một khách hàng** (`0082`).
 *
 * Màn hình khách hàng tới giờ chỉ có *CSBH đang áp dụng* — đúng một hồ sơ, đúng
 * hiện tại. Câu hỏi *"khách này từng áp dụng những chính sách nào, và bản nào
 * thay bản nào lúc nào"* không trả lời được ở đâu cả: phải sang màn hình Hồ sơ,
 * lọc theo mã khách, rồi tự ghép các phiên bản lại bằng mắt.
 *
 * MỐC THAY THẾ LÀ CỘT ĐÁNG GIÁ NHẤT ở đây, và cũng là cột dễ bị hiểu nhầm nhất.
 * Một CSBH không "hết hạn" — nó chỉ hết hiệu lực đúng lúc bản kế tiếp được
 * duyệt xong (muc 5.2). Nên cột *Hết hiệu lực* và cột *Bị thay bởi* luôn đi
 * cùng nhau: có mốc thời gian thì phải có bản đã thay nó, và ngược lại.
 *
 * PHẠM VI. Danh sách này đi qua `thuocPhamVi` như mọi đường đọc hồ sơ khác, nên
 * nó chỉ gồm những hồ sơ NGƯỜI ĐANG XEM có liên quan.
 *
 * `0082` đã ghi ở đây một giới hạn: *"sau một lần bàn giao khách hàng, TDV mới
 * thấy khách nhưng KHÔNG thấy các hồ sơ cũ do TDV trước lập — lịch sử với họ sẽ
 * ngắn hơn sự thật"*. **`0085` đã chữa nó**: đổi tay khách hàng thì mọi hồ sơ
 * của khách đi theo, nên bảng này đầy đủ ngay cả sau bàn giao.
 *
 * Giữ lại đoạn ghi chú cũ chứ không xoá, vì nó là thứ duy nhất tra ngược ra
 * được rằng màn hình này từng đếm thiếu — và đếm thiếu trong im lặng.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { Lien } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan, Trong } from './Chung.js';

export type HoSoLichSu = {
  id: string;
  code: string;
  versionNo: number;
  status: string;
  effectiveFrom: string | null;
  deactivatedAt: string | null;
  supersedesId: string | null;
  supersededById: string | null;
};

/** Bao nhiêu phiên bản là đủ cho một màn hình tra cứu. */
const TOI_DA = 50;

export function LichSuCsbh({ khachHangId }: { khachHangId: string }) {
  const [ds, datDs] = useState<HoSoLichSu[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  useEffect(() => {
    const huy = new AbortController();
    layJson<{ items: HoSoLichSu[] }>(
      `/policies?customerId=${encodeURIComponent(khachHangId)}&limit=${TOI_DA}`,
      huy.signal,
    )
      .then((r) => datDs(r.items))
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [khachHangId]);

  /** Mã của bản đã thay hồ sơ này — tra trong chính danh sách, không gọi thêm. */
  const maCua = (id: string | null): string | null =>
    id === null ? null : (ds?.find((x) => x.id === id)?.code ?? null);

  if (loi !== null) return <BaoLoi loi={loi} />;
  if (ds === null) return <DangTai />;
  if (ds.length === 0) {
    return (
      <Trong
        tieuDe="Chưa có CSBH nào"
        moTa="Khách hàng này chưa từng có chính sách bán hàng nào trong phạm vi bạn xem được."
      />
    );
  }

  return (
    <>
      <div className="khung-cuon" role="region" aria-label="Lịch sử CSBH" tabIndex={0}>
        <table className="bang">
          <thead>
            <tr>
              <th>Mã hồ sơ</th>
              <th className="so">Phiên bản</th>
              <th>Trạng thái</th>
              <th>Có hiệu lực từ</th>
              <th>Hết hiệu lực lúc</th>
              <th>Bị thay bởi</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((h) => {
              const thay = maCua(h.supersededById);
              return (
                <tr key={h.id}>
                  <td>
                    <Lien den={`/ho-so/${h.id}`}>{h.code}</Lien>
                  </td>
                  <td className="so">{h.versionNo}</td>
                  <td>
                    <Nhan trangThai={h.status} />
                  </td>
                  {/*
                    GIỜ chứ không chỉ ngày ở hai cột mốc.

                    Hai phiên bản thay nhau trong cùng một ngày là chuyện thường
                    — bản mới có hiệu lực đúng lúc kế toán tiếp nhận lần 2, và
                    bản cũ chết cùng giây ấy. Chỉ hiện ngày thì hai dòng trông
                    như cùng lúc, và không ai đọc ra được cái nào trước.
                  */}
                  <td>{h.effectiveFrom === null ? '—' : ngayGio(h.effectiveFrom)}</td>
                  <td>{h.deactivatedAt === null ? '—' : ngayGio(h.deactivatedAt)}</td>
                  <td>
                    {/*
                      Bản thay thế nằm NGOÀI trang này thì hiện "—" chứ không
                      hiện một ô trống: trang chỉ lấy 50 phiên bản gần nhất, và
                      một ô trống đọc ra là "không có bản nào thay nó".
                    */}
                    {thay === null ? <span className="phu">—</span> : thay}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="ghi-chu">
        Một CSBH <strong>không có ngày hết hạn</strong> — nó chỉ hết hiệu lực đúng lúc phiên bản kế
        tiếp được duyệt xong. Ai thao tác ở từng mốc thì xem <em>Lịch sử hồ sơ</em> của chính phiên
        bản đó.
      </p>
    </>
  );
}
