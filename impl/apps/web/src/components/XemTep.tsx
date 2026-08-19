/**
 * Xem một tệp NGAY TRONG PHẦN MỀM, không phải tải về rồi mở bằng thứ khác
 * (`0051`, muc 11.1: *"Bấm trực tiếp tên file để mở xem"*).
 *
 * VÌ SAO PHẢI TẢI VỀ BỘ NHỚ RỒI MỚI NHÚNG. Thẻ `<iframe src="/api/...">` không
 * gửi header `Authorization`, và không nơi nào trong gateway đọc token từ
 * cookie — nhúng thẳng là nhận về một trang 401. Đây đúng là lỗi mà nút *Xuất
 * hợp đồng* từng mắc với thẻ `<a href>`. Nên `xemTruoc()` gọi qua `goi()` như
 * mọi lời gọi khác, rồi dựng một `blob:` URL để nhúng.
 *
 * Hệ quả phải nhớ: `blob:` URL giữ nguyên nội dung trong bộ nhớ tab cho tới khi
 * bị thu hồi. Hộp này thu hồi ở nhánh dọn của `useEffect` — mở rồi đóng vài chục
 * tệp scan trong một phiên mà không thu hồi là vài trăm MB không ai đòi lại.
 */
import { useEffect, useState } from 'react';
import { taiVe, xemTruoc, type XemDuoc } from '../lib/api.js';
import { BaoLoi, DangTai, HopThoai } from './Chung.js';

/**
 * Nhúng được hay không, và nhúng bằng thẻ nào.
 *
 * PDF và ảnh là hai kiểu duy nhất mọi trình duyệt tự vẽ được. Word, Excel và
 * mọi thứ khác thì `<iframe>` hoặc hiện một trang trắng, hoặc âm thầm kích hoạt
 * tải xuống — cả hai đều tệ hơn việc nói thẳng rằng phải tải về mới xem được.
 */
function cachHien(kieu: string): 'pdf' | 'anh' | 'khong' {
  if (kieu.startsWith('image/')) return 'anh';
  if (kieu === 'application/pdf') return 'pdf';
  return 'khong';
}

export function XemTep({
  tieuDe,
  duong,
  duongTai,
  tenTep,
  dong,
}: {
  tieuDe: string;
  /** Đường API trả về nội dung tệp để XEM. */
  duong: string;
  /**
   * Đường dùng khi bấm *Tải xuống*, nếu khác đường xem (`0052`).
   *
   * Bản CSBH và hợp đồng mở ra xem bằng `?xem=1` — cờ ấy bảo máy chủ ĐỪNG ghi
   * một dòng tải xuống vào Lịch sử. Dùng lại đúng đường ấy cho nút tải là mở
   * một lối tải không để lại vết nào, đúng cái lỗ mà N-01 sinh ra để bịt.
   *
   * Tệp đính kèm không có phân biệt này nên bỏ trống, và nó rơi về `duong`.
   */
  duongTai?: string;
  /** Tên dùng khi bấm Tải xuống, nếu máy chủ không đặt tên nào. */
  tenTep: string;
  dong: () => void;
}) {
  const [tep, datTep] = useState<XemDuoc | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangTai, datDangTai] = useState(false);

  useEffect(() => {
    let song = true;
    let url: string | null = null;
    datLoi(null);
    xemTruoc(duong)
      .then((x) => {
        url = x.url;
        if (song) datTep(x);
        else URL.revokeObjectURL(x.url);
      })
      .catch((e: unknown) => {
        if (song) datLoi(e);
      });
    return () => {
      song = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [duong]);

  const tai = () => {
    datLoi(null);
    datDangTai(true);
    // Tải lại TỪ MÁY CHỦ chứ không lưu `blob:` đang cầm: từ `0052` đường tải
    // ghi một dòng lịch sử, còn đường xem thì không. Lưu blob ra file là một
    // lượt tải không để lại vết nào.
    taiVe(duongTai ?? duong, tenTep)
      .catch(datLoi)
      .finally(() => datDangTai(false));
  };

  const cach = tep === null ? null : cachHien(tep.kieu);

  return (
    <HopThoai tieuDe={tieuDe} dong={dong}>
      {loi !== null && <BaoLoi loi={loi} />}

      {tep === null && loi === null && <DangTai />}

      {tep !== null && cach === 'pdf' && (
        <iframe className="khung-pdf khung-xem" src={tep.url} title={tieuDe} />
      )}

      {tep !== null && cach === 'anh' && (
        <div className="khung-xem khung-anh">
          <img src={tep.url} alt={tieuDe} />
        </div>
      )}

      {tep !== null && cach === 'khong' && (
        <p className="ghi-chu">
          Tệp này <strong>không xem trực tiếp được</strong> trong phần mềm — trình duyệt chỉ mở sẵn
          được PDF và ảnh. Bấm <strong>Tải xuống</strong> rồi mở bằng ứng dụng trên máy bạn.
        </p>
      )}

      {/*
        Hai nút LUÔN hiện, kể cả lúc đang tải và lúc lỗi.

        Muc 11.1 đòi *"nút Đóng luôn hiển thị ở màn hình xem"* — `HopThoai` chỉ
        đóng bằng phím Escape và bấm ra ngoài, hai đường không ai nhìn thấy. Một
        hộp thoại chiếm gần hết màn hình mà không có nút thoát nhìn thấy được là
        hộp thoại người dùng tưởng mình bị kẹt.
      */}
      <div className="nhom-nut">
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Đóng
        </button>
        <button type="button" className="nut" disabled={dangTai} onClick={tai}>
          {dangTai ? 'Đang tải…' : 'Tải xuống'}
        </button>
      </div>
    </HopThoai>
  );
}
