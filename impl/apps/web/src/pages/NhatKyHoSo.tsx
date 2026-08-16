/**
 * Nhật ký của MỘT hồ sơ — hồ sơ này đã đi qua những đâu, do ai, vì sao (`0036`).
 *
 * Máy chủ đã trả `GET /policies/:id/events` từ chặng đầu, và tới `0036` thì
 * KHÔNG MÀN HÌNH NÀO gọi nó. Hệ quả: mọi câu hỏi kiểu "ai trả hồ sơ này về, lý
 * do gì" chỉ trả lời được bằng cách đọc thẳng cơ sở dữ liệu.
 *
 * Đợt này nó thành màn hình vì có một người dùng cụ thể cần nó: thư báo đổi
 * trạng thái giờ gửi cho MỌI người đã từng thao tác lên hồ sơ, và với người
 * không phải xử lý gì thì liên kết trong thư trỏ thẳng vào đây. Mở hồ sơ ra họ
 * chỉ thấy một màn hình không nút nào bấm được; thứ họ muốn biết là chuyện đã
 * xảy ra từ lúc mình rời tay.
 *
 * MÀN HÌNH RIÊNG, không phải một khối gập trong trang chi tiết — vì nó phải có
 * một địa chỉ để dán vào thư. Trang chi tiết có một liên kết dẫn sang.
 *
 * KHÔNG PHÂN TRANG: đây là toàn bộ đời của một hồ sơ, mười bước là nhiều rồi.
 * Cắt trang một dòng thời gian là bắt người đọc lật để hiểu một câu chuyện.
 */
import { useCallback, useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngayGio, nhanHanhDong, nhanTrangThai } from '../lib/format.js';
import { NHAN_VAI_TRO } from '../lib/format.js';
import { Lien } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan } from '../components/Chung.js';

type Muc = {
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

type HoSo = { id: string; code: string; status: string; versionNo: number };

/**
 * Ai đã làm việc này, viết thành một câu đọc được.
 *
 * `SYSTEM` là vai trò thật trong nhật ký, không phải dữ liệu thiếu: hệ thống tự
 * chuyển bước sau khi Trưởng bộ phận ký, và tự đánh dấu quá hạn. Hiện tên người
 * cho những dòng ấy là gán một việc tự động cho một người không bấm gì.
 */
function nguoiLam(m: Muc): string {
  if (m.actorRole === 'SYSTEM' || m.actorRole === null) return 'Hệ thống';
  const vaiTro = NHAN_VAI_TRO[m.actorRole] ?? m.actorRole;
  // Tên tra không ra thì nói thẳng là không tra được, đừng bày uuid ra màn hình:
  // một chuỗi 36 ký tự ở cột "Người thực hiện" trông như dữ liệu hỏng.
  const ten = m.actorName ?? (m.actorId === null ? null : 'không tra được tên');
  return ten === null ? vaiTro : `${ten} · ${vaiTro}`;
}

export function NhatKyHoSo({ id }: { id: string }) {
  const [muc, datMuc] = useState<Muc[] | null>(null);
  const [hoSo, datHoSo] = useState<HoSo | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  const tai = useCallback(
    (signal: AbortSignal) =>
      Promise.all([
        layJson<Muc[]>(`/policies/${id}/events`, signal),
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
          <h1>Nhật ký {hoSo.code}</h1>
          <p className="mo-ta-trang">
            Phiên bản {hoSo.versionNo} · <Lien den={`/ho-so/${id}`}>Mở hồ sơ</Lien>
          </p>
        </div>
        <Nhan trangThai={hoSo.status} />
      </div>

      <p className="ghi-chu">
        Toàn bộ các bước hồ sơ đã đi qua, cũ nhất trước. Nhật ký <strong>chỉ ghi thêm</strong> —
        không dòng nào sửa hay xoá được, kể cả bởi Quản trị hệ thống.
      </p>

      {muc.length === 0 ? (
        <p className="ghi-chu">Chưa có bước nào được ghi.</p>
      ) : (
        <div className="khung-cuon" role="region" aria-label="Nhật ký hồ sơ" tabIndex={0}>
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
      )}
    </section>
  );
}
