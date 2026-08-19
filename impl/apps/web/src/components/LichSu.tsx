/**
 * Lịch sử của MỘT hồ sơ — nó đã đi qua những đâu, do ai, vì sao.
 *
 * Tách khỏi `NhatKyHoSo` ở `0061`, khi cùng nội dung ấy phải có mặt ở HAI chỗ:
 * màn hình riêng (thư báo dán liên kết vào đó) và khối gập ở cuối màn hình hồ
 * sơ. Dựng hai bản là hai bảng sẽ lệch nhau sau lần sửa câu chữ đầu tiên.
 *
 * ĐỔI TÊN "Nhật ký" → "Lịch sử" cũng ở `0061`. Phần mềm có hai thứ tên "Nhật
 * ký": nhật ký kiểm toán toàn hệ thống (một mục menu của Quản trị) và cái này.
 * Trùng tên ở hai thứ có phạm vi khác hẳn nhau là một câu hỏi lặp lại mãi trong
 * mọi buổi hướng dẫn sử dụng.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngayGio, nhanHanhDong, nhanTrangThai, NHAN_VAI_TRO } from '../lib/format.js';
import { BaoLoi, DangTai, Nhan } from './Chung.js';

export type MucLichSu = {
  seq: number;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  actorId: string | null;
  actorRole: string | null;
  /** `null` khi identity không tra được tên, hoặc khi việc do hệ thống làm. */
  actorName: string | null;
  reason: string | null;
  at: string;
};

/**
 * Ai đã làm việc này, viết thành một câu đọc được.
 *
 * `SYSTEM` là vai trò thật trong lịch sử, không phải dữ liệu thiếu: hệ thống tự
 * chuyển bước sau khi Trưởng bộ phận ký, và tự đánh dấu quá hạn. Hiện tên người
 * cho những dòng ấy là gán một việc tự động cho một người không bấm gì.
 */
export function nguoiLam(m: MucLichSu): string {
  if (m.actorRole === 'SYSTEM' || m.actorRole === null) return 'Hệ thống';
  const vaiTro = NHAN_VAI_TRO[m.actorRole] ?? m.actorRole;
  // Tên tra không ra thì nói thẳng là không tra được, đừng bày uuid ra màn hình:
  // một chuỗi 36 ký tự ở cột "Người thực hiện" trông như dữ liệu hỏng.
  const ten = m.actorName ?? (m.actorId === null ? null : 'không tra được tên');
  return ten === null ? vaiTro : `${ten} · ${vaiTro}`;
}

/**
 * Bảng lịch sử.
 *
 * KHÔNG PHÂN TRANG: đây là toàn bộ đời của một hồ sơ, mười bước là nhiều rồi.
 * Cắt trang một dòng thời gian là bắt người đọc lật để hiểu một câu chuyện.
 *
 * KHÔNG có dòng chú thích nào trên bảng (`0065`). Trước đó ở đây có một câu chữ
 * nhỏ màu xám — "cũ nhất trước, lịch sử chỉ ghi thêm" — và nó nói hai thứ bảng
 * đã tự nói: thứ tự đọc ra được từ cột `#`, còn tính bất biến thì không ai kiểm
 * được bằng mắt, nên câu ấy chỉ là một lời hứa. Chỗ hứa đúng là tài liệu hướng
 * dẫn, và nó đã có ở đó.
 */
export function BangLichSu({ muc }: { muc: MucLichSu[] }) {
  if (muc.length === 0) return <p className="ghi-chu">Chưa có bước nào được ghi.</p>;

  return (
    <div className="khung-cuon" role="region" aria-label="Lịch sử hồ sơ" tabIndex={0}>
      <table className="bang">
        <thead>
          <tr>
            <th>#</th>
            <th>Thời điểm</th>
            <th>Việc</th>
            <th>Chuyển sang</th>
            <th>Người thực hiện</th>
            <th>Lý do</th>
          </tr>
        </thead>
        <tbody>
          {muc.map((m) => (
            <tr key={m.seq}>
              <td>{m.seq}</td>
              <td>{ngayGio(m.at)}</td>
              <td>{nhanHanhDong(m.action)}</td>
              {/* Cả hai đầu, không chỉ đầu đến: "Chờ TBP duyệt" một mình
                  không nói được hồ sơ vừa đi tới hay vừa quay lại. */}
              <td>
                {m.fromStatus !== null && (
                  <span className="ma-phu">{nhanTrangThai(m.fromStatus)} → </span>
                )}
                <Nhan trangThai={m.toStatus} />
              </td>
              <td>{nguoiLam(m)}</td>
              <td>{m.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Khối gập ở CUỐI màn hình hồ sơ (`0061`).
 *
 * `<details>` của trình duyệt chứ không phải một nút tự dựng: nó đã có sẵn phím
 * tắt bàn phím, trạng thái `aria-expanded`, và tìm-trong-trang của trình duyệt
 * mở được nó ra. Tự dựng lại bằng `useState` + `<button>` là viết lại cả ba thứ
 * ấy, và bản viết lại thường thiếu thứ ba.
 *
 * TẢI KHI MỞ, không tải sẵn: hầu hết người mở hồ sơ ra là để xem số và bấm một
 * nút, không phải để đọc lịch sử. Gọi sẵn `/events` cho mọi lượt mở là một vòng
 * mạng thừa trên màn hình được mở nhiều nhất của phần mềm.
 */
export function LichSuGap({ hoSoId }: { hoSoId: string }) {
  const [mo, datMo] = useState(false);
  const [muc, datMuc] = useState<MucLichSu[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  useEffect(() => {
    if (!mo) return;
    const huy = new AbortController();
    datLoi(null);
    layJson<MucLichSu[]>(`/policies/${hoSoId}/events`, huy.signal)
      .then(datMuc)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [mo, hoSoId, lan]);

  return (
    <details className="khoi-gap" onToggle={(e) => datMo(e.currentTarget.open)}>
      {/*
        Thanh gập chỉ có TÊN MỤC và mũi tên (`0065`).

        Trước đó nó còn một dòng chữ nhỏ màu xám giải thích "Lịch sử" nghĩa là
        gì. Một mục tên *Lịch sử* trên màn hình hồ sơ thì không cần ai giải thích,
        và dòng ấy đẩy mũi tên tụt xuống giữa thanh — chỗ mắt không tìm.
      */}
      <summary>
        <h2>Lịch sử</h2>
      </summary>
      <div className="khoi-gap-than">
        {loi !== null ? (
          <BaoLoi loi={loi} thuLai={() => datLan((x) => x + 1)} />
        ) : muc === null ? (
          <DangTai />
        ) : (
          <BangLichSu muc={muc} />
        )}
      </div>
    </details>
  );
}
