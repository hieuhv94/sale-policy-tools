/**
 * Các khối dựng từ ba báo cáo tổng hợp. Nhận dữ liệu qua props — trang tổng quan
 * gọi `/reports/*` MỘT lần rồi chia cho các khối.
 *
 * Không cho mỗi khối tự gọi: Ban lãnh đạo có bốn khối cùng đọc `progress`, và
 * bốn lời gọi giống hệt nhau tới cùng một read-model chỉ tổ làm màn hình nhảy
 * bốn nhịp.
 */
import type { BoBaoCao } from '../../lib/bao-cao.js';
import { Lien } from '../../lib/router.js';
import { ChiSo, Trong } from '../Chung.js';
import { duongThe, mauThe, nhanThe, type The } from '../../lib/tong-quan.js';

const NHAN_BUOC: Record<string, string> = {
  B4_TBP_DUYET: 'Chờ Trưởng bộ phận duyệt',
  B6_KT_L1: 'KT duyệt bản mềm',
  B8_SA_XU_LY: 'Chờ Sale Admin bàn giao',
  B10_KT_L2: 'KT duyệt bản cứng',
};

const so = (v: number | undefined): number => v ?? 0;

/**
 * Dải thẻ đếm hồ sơ — phần chính của trang.
 *
 * Ô có 0 hồ sơ VẪN HIỆN. Ẩn đi thì dải thẻ đổi số lượng ô theo dữ liệu, và người
 * dùng quen vị trí sẽ bấm nhầm ô; tệ hơn, "không có ô Từ chối" và "không có hồ
 * sơ nào bị từ chối" trông giống hệt nhau.
 *
 * MỌI thẻ đều bấm được, không trừ cái nào (`0045`) — kể cả thẻ gộp "Đang chờ".
 * Một con số không mở ra được danh sách đằng sau nó là một con số người dùng
 * phải tin mà không kiểm được.
 */
export function DaiTheTrangThai({ danhSach, bo }: { danhSach: The[]; bo: BoBaoCao }) {
  if (danhSach.length === 0) return null;

  return (
    <div className="luoi-chi-so">
      {danhSach.map((the) => {
        const { tong, sapHet } = demThe(the, bo);
        return (
          <ChiSo
            key={the.ma}
            nhan={nhanThe(the)}
            giaTri={tong}
            {...(the.phu === undefined ? {} : { phu: the.phu })}
            {...(sapHet > 0 ? { canhBao: `trong đó ${sapHet} sắp quá hạn` } : {})}
            kieu={mauThe(the)}
            den={duongThe(the)}
          />
        );
      })}
    </div>
  );
}

/**
 * Con số trên một thẻ, và trong đó bao nhiêu hồ sơ SẮP quá hạn.
 *
 * Thẻ đếm theo BƯỚC đọc `byStepDetail` chứ không `byStatus`, vì `byStepDetail`
 * tách đôi bước B8 theo việc Sale Admin đang làm.
 *
 * Hồ sơ ĐÃ quá hạn không nằm trong con số nào ở đây (`0047`): nó là trạng thái
 * chết, không ai thao tác được, nên đếm nó vào một ô đếm việc là nói dối về
 * lượng việc. Thứ đi kèm ô bây giờ là `soon` — hồ sơ còn kịp cứu.
 */
function demThe(the: The, bo: BoBaoCao): { tong: number; sapHet: number } {
  if (the.dem.tu === 'trangThai') {
    return { tong: so(bo.tienDo.byStatus[the.dem.trangThai]), sapHet: 0 };
  }

  // `?.` trên chính bảng, không chỉ trên phần tử: máy chủ chưa trả khoá này thì
  // cả trang tổng quan trắng bóc, mà đáng lẽ chỉ nên là vài ô ghi 0. Một thiếu
  // sót nhỏ ở API không đáng đổi lấy một màn hình rỗng không lời giải thích.
  const bang = bo.tienDo.byStepDetail;

  /*
   * Thẻ *Sắp quá hạn* cộng dồn `soon` của MỌI bước, không riêng bước của vai trò
   * này — xem `theSapQuaHan`. Cộng ở đây chứ không thêm một khoá riêng trong báo
   * cáo: hai con số suy từ cùng một phép đếm thì không có đường nào lệch nhau,
   * mà thẻ và các ô bước lại nằm ngay cạnh nhau trên màn hình.
   */
  const o = the.dem.tu === 'sapQuaHan' ? Object.keys(bang ?? {}) : the.dem.o;
  const tong = o.reduce((a, k) => a + so(bang?.[k]?.total), 0);
  const sapHet = o.reduce((a, k) => a + so(bang?.[k]?.soon), 0);

  if (the.dem.tu === 'sapQuaHan') return { tong: sapHet, sapHet: 0 };

  /*
   * Thẻ *Đang chờ* KHÔNG mang dòng "trong đó N sắp quá hạn" (`0053`).
   *
   * Nó đếm hồ sơ ở bàn NGƯỜI KHÁC — theo đúng định nghĩa, phần không cần mình
   * làm gì. Treo một con số gấp lên đó là mời người đọc lo một việc họ không
   * bấm được, và thẻ *Sắp quá hạn* ngay bên cạnh đã đếm sẵn toàn phạm vi rồi.
   *
   * Bấm vào thì VẪN thấy: danh sách mở ra có cột *Hạn xử lý* đánh dấu từng hồ sơ.
   */
  return the.ma === 'DANG_CHO' ? { tong, sapHet: 0 } : { tong, sapHet };
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
            {/* Lọc theo BƯỚC, không theo trạng thái (`0045`): con số bên phải đã
                gồm cả hồ sơ quá hạn ở bước này, mà chúng mang `QUA_HAN_DUYET`
                nên `?status=` sẽ mở ra một danh sách ngắn hơn chính nó. */}
            <Lien den={`/ho-so?pendingStep=${buoc}`} className="thanh-nhan">
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
