/**
 * Các khối dựng từ ba báo cáo tổng hợp. Nhận dữ liệu qua props — trang tổng quan
 * gọi `/reports/*` MỘT lần rồi chia cho các khối.
 *
 * Không cho mỗi khối tự gọi: Ban lãnh đạo có bốn khối cùng đọc `progress`, và
 * bốn lời gọi giống hệt nhau tới cùng một read-model chỉ tổ làm màn hình nhảy
 * bốn nhịp.
 */
import type { BoBaoCao } from '../../lib/bao-cao.js';
import { nhanTrangThai, nhomTrangThai } from '../../lib/format.js';
import { Lien } from '../../lib/router.js';
import { ChiSo, Trong } from '../Chung.js';
import { DANG_CHO, type TrangThai } from '../../lib/tong-quan.js';

/** Bước đang chờ → trạng thái tương ứng. Bảng NGHỊCH của `STEP_FROM_STATUS` bên reporting. */
const TRANG_THAI_CUA_BUOC: Record<string, TrangThai> = {
  B4_TBP_DUYET: 'CHO_TBP_DUYET',
  B6_KT_L1: 'CHO_KT_L1',
  B8_SA_XU_LY: 'SA_DANG_XU_LY',
  B10_KT_L2: 'CHO_KT_L2',
};

const NHAN_BUOC: Record<string, string> = {
  B4_TBP_DUYET: 'Chờ Trưởng bộ phận duyệt',
  B6_KT_L1: 'Chờ Kế toán tiếp nhận lần 1',
  B8_SA_XU_LY: 'Chờ Sale Admin bàn giao',
  B10_KT_L2: 'Chờ Kế toán tiếp nhận lần 2',
};

const so = (v: number | undefined): number => v ?? 0;

/**
 * Dải thẻ đếm hồ sơ theo trạng thái — phần chính của trang.
 *
 * Trạng thái có 0 hồ sơ VẪN HIỆN. Ẩn đi thì dải thẻ đổi số lượng ô theo dữ liệu,
 * và người dùng quen vị trí sẽ bấm nhầm ô; tệ hơn, "không có ô Từ chối" và
 * "không có hồ sơ nào bị từ chối" trông giống hệt nhau.
 */
export function DaiTheTrangThai({
  danhSach,
  bo,
  themTheDangCho = false,
}: {
  danhSach: TrangThai[];
  bo: BoBaoCao;
  themTheDangCho?: boolean;
}) {
  if (danhSach.length === 0) return null;

  return (
    <div className="luoi-chi-so">
      {themTheDangCho && (
        <ChiSo
          nhan="Đang chờ duyệt"
          giaTri={DANG_CHO.reduce((a, t) => a + so(bo.tienDo.byStatus[t]), 0)}
          phu="hồ sơ bạn gửi đang đi trong luồng"
          kieu="cho"
        />
      )}
      {danhSach.map((t) => (
        <ChiSo
          key={t}
          nhan={nhanTrangThai(t)}
          giaTri={so(bo.tienDo.byStatus[t])}
          kieu={nhomTrangThai(t)}
          den={`/ho-so?status=${t}`}
        />
      ))}
    </div>
  );
}

/** Ba con số nói luồng duyệt có khoẻ không. */
export function SucKhoeLuong({ bo }: { bo: BoBaoCao }) {
  return (
    <div className="luoi-chi-so">
      <ChiSo
        nhan="Tỷ lệ trả lại"
        giaTri={`${String(bo.traLai.rate).replace('.', ',')}%`}
        phu={`${bo.traLai.returnedOrRejected} trên ${bo.traLai.submitted} hồ sơ đã gửi duyệt`}
        kieu={bo.traLai.rate > 0 ? 'canh-bao' : 'tot'}
      />
      <ChiSo
        nhan="Số ngày chờ trung bình"
        giaTri={String(bo.sla.avgWaitingDays).replace('.', ',')}
        phu="tính cả thứ bảy và chủ nhật"
        kieu={bo.sla.avgWaitingDays >= 7 ? 'canh-bao' : 'thuong'}
      />
      <ChiSo
        nhan="Đến hạn hôm nay"
        giaTri={bo.sla.dueToday}
        phu="còn dưới 24 giờ"
        kieu={bo.sla.dueToday > 0 ? 'cho' : 'thuong'}
      />
    </div>
  );
}

/** Hồ sơ đang tắc ở bước nào — bốn bước chờ, có thanh so sánh. */
export function TheoBuoc({ bo }: { bo: BoBaoCao }) {
  const dong = Object.entries(bo.tienDo.byPendingStep)
    .filter(([b]) => b in NHAN_BUOC)
    .sort((a, b) => b[1] - a[1]);
  if (dong.length === 0) {
    return <Trong tieuDe="Không có hồ sơ nào đang chờ ở bước nào" />;
  }
  const donhat = Math.max(1, ...dong.map(([, v]) => v));

  return (
    <div className="the">
      <ul className="danh-sach-thanh">
        {dong.map(([buoc, n]) => (
          <li key={buoc}>
            <Lien den={`/ho-so?status=${TRANG_THAI_CUA_BUOC[buoc]}`} className="thanh-nhan">
              {NHAN_BUOC[buoc]}
            </Lien>
            {/* Thanh dài ngắn là TRANG TRÍ cho con số bên cạnh — trình đọc màn
                hình nghe "Chờ TBP duyệt, 12" là đủ nghĩa. */}
            <span className="thanh" aria-hidden="true">
              <span className="thanh-day" style={{ width: `${(n / donhat) * 100}%` }} />
            </span>
            <strong className="so">{n}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hồ sơ theo trình dược viên. Bấm vào mở danh sách đã lọc theo đúng người đó. */
export function TheoTdv({ bo, toiDa = 5 }: { bo: BoBaoCao; toiDa?: number }) {
  const dong = bo.tienDo.byHandler.slice(0, toiDa);
  if (dong.length === 0) {
    return <Trong tieuDe="Chưa có hồ sơ nào trong phạm vi của bạn" />;
  }
  const donhat = Math.max(1, ...dong.map((d) => d.count));

  return (
    <div className="the">
      <ul className="danh-sach-thanh">
        {dong.map((d) => (
          <li key={d.userId}>
            <Lien den={`/ho-so?tdvUserId=${encodeURIComponent(d.userId)}`} className="thanh-nhan">
              {/* Read-model chưa kịp điền tên thì vẫn phải hiện dòng — giấu đi là
                  giấu luôn số hồ sơ của người đó khỏi tổng. */}
              {d.name ?? 'Chưa rõ tên'}
            </Lien>
            <span className="thanh" aria-hidden="true">
              <span className="thanh-day" style={{ width: `${(d.count / donhat) * 100}%` }} />
            </span>
            <strong className="so">{d.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
