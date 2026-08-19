/**
 * Lịch sử của MỘT hồ sơ, trên màn hình riêng (`0036`, đổi tên ở `0061`).
 *
 * Máy chủ đã trả `GET /policies/:id/events` từ chặng đầu, và tới `0036` thì
 * KHÔNG MÀN HÌNH NÀO gọi nó. Hệ quả: mọi câu hỏi kiểu "ai trả hồ sơ này về, lý
 * do gì" chỉ trả lời được bằng cách đọc thẳng cơ sở dữ liệu.
 *
 * VÌ SAO VẪN GIỮ MÀN HÌNH RIÊNG sau khi `0061` đưa lịch sử vào khối gập ở cuối
 * màn hình hồ sơ: thư báo đổi trạng thái gửi cho người CHỈ ĐỂ BIẾT dán thẳng
 * liên kết vào đây (`templates.ts`). Mở hồ sơ ra họ chỉ thấy một màn hình không
 * nút nào bấm được; thứ họ muốn biết là chuyện đã xảy ra từ lúc mình rời tay.
 * Gỡ địa chỉ này là làm chết liên kết trong mọi lá thư đã gửi.
 *
 * Bảng thì dùng CHUNG với khối gập — xem `components/LichSu.tsx`.
 */
import { useCallback, useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { Lien } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan } from '../components/Chung.js';
import { BangLichSu, type MucLichSu } from '../components/LichSu.js';

type HoSo = { id: string; code: string; status: string; versionNo: number };

export function NhatKyHoSo({ id }: { id: string }) {
  const [muc, datMuc] = useState<MucLichSu[] | null>(null);
  const [hoSo, datHoSo] = useState<HoSo | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  const tai = useCallback(
    (signal: AbortSignal) =>
      Promise.all([
        layJson<MucLichSu[]>(`/policies/${id}/events`, signal),
        layJson<HoSo>(`/policies/${id}`, signal),
      ]),
    [id],
  );

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    tai(huy.signal)
      .then(([ds, h]) => {
        datMuc(ds);
        datHoSo(h);
      })
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [tai, lan]);

  if (loi !== null) return <BaoLoi loi={loi} thuLai={() => datLan((x) => x + 1)} />;
  if (muc === null || hoSo === null) return <DangTai />;

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Lịch sử {hoSo.code}</h1>
          <p className="mo-ta-trang">
            Phiên bản {hoSo.versionNo} · <Lien den={`/ho-so/${id}`}>Mở hồ sơ</Lien>
          </p>
        </div>
        <Nhan trangThai={hoSo.status} />
      </div>

      <BangLichSu muc={muc} />
    </section>
  );
}
