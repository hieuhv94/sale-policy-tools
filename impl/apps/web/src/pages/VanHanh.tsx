/**
 * Trang **Vận hành** (`0255`) — chỉ Quản trị hệ thống. Đưa các thao tác vận hành từ dòng
 * lệnh lên web cho một người KHÔNG có chuyên môn IT (chốt 05/11): không thuật ngữ máy,
 * không câu lệnh máy chủ, không phục hồi.
 *
 * Sáu thẻ. Thẻ đang mở nằm trên `#…` của địa chỉ, nên thư cảnh báo ổ đĩa dẫn thẳng tới
 * `/van-hanh#o-dia` và tải lại trang không rơi về thẻ đầu. Đổi thẻ dùng `replaceState` —
 * mỗi lần bấm thẻ không phải một bước *Quay lại* của trình duyệt.
 *
 * Dữ liệu thẻ Sức khoẻ tải ở ĐÂY và tự làm mới mỗi 15 giây: hai thẻ cùng đọc nó (Sức khoẻ,
 * Thư & hàng đợi), và nhãn thẻ đếm số việc cần chú ý.
 */
import { useEffect, useState } from 'react';
import { BaoLoi, DaiThe, DangTai } from '../components/Chung.js';
import { useTaiVH } from '../components/van-hanh/DungChung.js';
import { TheLichTuDong } from '../components/van-hanh/LichTuDong.js';
import { TheODia } from '../components/van-hanh/ODia.js';
import { TheSaoLuu } from '../components/van-hanh/SaoLuu.js';
import { TheSucKhoe } from '../components/van-hanh/SucKhoe.js';
import { TheTepLog } from '../components/van-hanh/TepLog.js';
import { TheThuHangDoi } from '../components/van-hanh/ThuHangDoi.js';
import { THE, canhBao, theTuHash, type SucKhoe, type The } from '../lib/van-hanh.js';

export function VanHanh() {
  const [the, datThe] = useState<The>(() => theTuHash(typeof window === 'undefined' ? '' : window.location.hash));
  const sk = useTaiVH<SucKhoe>('/van-hanh/suc-khoe', 15_000);

  useEffect(() => {
    const doi = () => datThe(theTuHash(window.location.hash));
    window.addEventListener('hashchange', doi);
    return () => window.removeEventListener('hashchange', doi);
  }, []);

  const moThe = (t: The) => {
    datThe(t);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${t}`);
  };

  const soCanhBao = sk.du ? canhBao(sk.du).length : 0;

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Vận hành</h1>
      </div>

      <DaiThe
        nhanVung="Nhóm vận hành"
        dangChon={the}
        chon={moThe}
        muc={THE.map((t) => ({ ...t, ...(t.khoa === 'suc-khoe' && soCanhBao > 0 ? { dem: soCanhBao } : {}) }))}
      />

      {the === 'suc-khoe' &&
        (sk.loi !== null && sk.du === null ? (
          <BaoLoi loi={sk.loi} thuLai={sk.taiLai} />
        ) : !sk.du ? (
          <DangTai />
        ) : (
          <TheSucKhoe sk={sk.du} moThe={moThe} />
        ))}
      {the === 'o-dia' && <TheODia />}
      {the === 'sao-luu' && <TheSaoLuu />}
      {the === 'tep-log' && <TheTepLog />}
      {the === 'thu-hang-doi' && <TheThuHangDoi sk={sk.du} />}
      {the === 'lich-tu-dong' && <TheLichTuDong />}
    </section>
  );
}
