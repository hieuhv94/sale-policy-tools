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
import { useEffect, useState, type ReactNode } from 'react';
import { taiVe, xemTruoc, type XemDuoc } from '../lib/api.js';
import { TY_LE_MAC_DINH } from '../lib/mau-hop-dong.js';
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
  truoc,
  tyLe,
  dong,
}: {
  tieuDe: string;
  /** Đường API trả về nội dung tệp để XEM. */
  duong: string;
  /**
   * Đường dùng khi bấm *Tải xuống*, nếu khác đường xem (`0052`, thu hẹp `0059`).
   *
   * Bản SCAN và tệp đính kèm mở ra xem bằng `?xem=1` — cờ ấy bảo máy chủ ĐỪNG
   * ghi một dòng tải xuống vào Lịch sử. Dùng lại đúng đường ấy cho nút tải là
   * mở một lối tải không để lại vết nào, đúng cái lỗ mà N-01 sinh ra để bịt.
   *
   * Bản mềm CSBH và hợp đồng KHÔNG còn phân biệt này (`0059`): chúng không ghi
   * lịch sử nữa, nên chỉ truyền `duong` và bỏ trống chỗ này — nó rơi về `duong`.
   */
  duongTai?: string;
  /** Tên dùng khi bấm Tải xuống, nếu máy chủ không đặt tên nào. */
  tenTep: string;
  /**
   * Khối đứng NGAY TRÊN vùng xem — chỗ cho những lựa chọn đổi được nội dung
   * đang xem (`0054`), ví dụ khổ giấy của bản CSBH.
   *
   * Đặt trên chứ không dưới: đổi lựa chọn là tải lại nội dung, và một điều
   * khiển nằm dưới khung xem — thứ chiếm gần hết chiều cao hộp — thì người dùng
   * phải cuộn xuống mới thấy cái điều khiển chính thứ họ đang nhìn.
   */
  truoc?: ReactNode;
  /**
   * Tỷ lệ **rộng / cao** biết trước của nội dung — khung xem khớp theo (`0073`).
   *
   * Chỉ có ý nghĩa với PDF, và chỉ với PDF do CHÍNH phần mềm sinh ra: bản mềm
   * CSBH và hợp đồng, nơi khổ giấy nằm sẵn ở mẫu đang chọn. Ảnh thì không cần
   * truyền — hộp tự đo lấy, chính xác hơn mọi con số khai trước.
   *
   * Bỏ trống là A4 dọc (`TY_LE_MAC_DINH`) — xem lý do ở đó.
   */
  tyLe?: number | undefined;
  dong: () => void;
}) {
  const [tep, datTep] = useState<XemDuoc | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangTai, datDangTai] = useState(false);
  /*
   * Số đo THẬT của ảnh. Chỉ ảnh mới có: `naturalWidth`/`naturalHeight` là kích
   * thước của chính tệp, và trình duyệt biết nó ngay khi giải mã xong.
   *
   * Đây là chỗ khác nhau căn bản giữa ảnh và PDF trong hộp này. Ảnh nằm trong
   * DOM của chính trang nên đo được tới từng pixel; PDF nằm trong một tài liệu
   * riêng của trình xem PDF, và không có cách nào hỏi nó.
   *
   * `0164` giữ CẢ HAI SỐ chứ không riêng tỷ lệ. Tỷ lệ trả lời *"khung mang hình
   * gì"*; chiều cao trả lời *"phóng to tới đâu thì thôi"* — và câu thứ hai chỉ
   * trả lời được bằng một số đo tuyệt đối. Tới `0146` không ai hỏi câu ấy vì
   * trần `--cao-khung` là 1400px, đủ thấp để phần lớn ảnh không chạm; `0164` bỏ
   * trần nên nó thành câu hỏi thật.
   */
  const [anh, datAnh] = useState<{ rong: number; cao: number } | null>(null);

  useEffect(() => {
    let song = true;
    let url: string | null = null;
    datLoi(null);
    // Đổi tệp là quên số đo cũ: giữ lại thì khung mang tỷ lệ của tệp TRƯỚC
    // trong khoảnh khắc tệp mới chưa giải mã xong.
    datAnh(null);
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

  /*
   * Tỷ lệ của khung, theo thứ tự tin cậy giảm dần: số ĐO ĐƯỢC từ ảnh → số khai
   * trước từ khổ giấy của mẫu → A4 dọc.
   *
   * `cach === null` là lúc đang tải, và nó vẫn nhận tỷ lệ: hộp mở ra đúng cỡ
   * ngay từ đầu rồi đứng yên, thay vì mở nhỏ rồi giật ra to khi nội dung tới.
   *
   * Riêng `'khong'` — tệp Word, Excel — trả `null` để hộp về đúng cỡ hộp thoại
   * thường: ở đó không có khung xem nào, chỉ có một câu nhắn tải về.
   */
  const tyLeKhung =
    cach === 'khong' ? null : (anh === null ? (tyLe ?? TY_LE_MAC_DINH) : anh.rong / anh.cao);

  return (
    <HopThoai
      tieuDe={tieuDe}
      dong={dong}
      tyLe={tyLeKhung}
      /*
        CHỈ ảnh mới chặn chiều cao (`0164`). PDF để `null` — nó phóng bao nhiêu
        cũng nét, nên chặn là bỏ phí màn hình.
      */
      caoNoiDung={anh?.cao ?? null}
      giay={cach === 'pdf'}
    >
      {truoc}

      {loi !== null && <BaoLoi loi={loi} />}

      {tep === null && loi === null && <DangTai />}

      {tep !== null && cach === 'pdf' && (
        /*
         * `#view=FitH` — *"vừa bề rộng"* (`0146`).
         *
         * Đây là nửa còn lại của lượt sửa, và nửa quan trọng hơn: `.khung-giay`
         * cho khung lấp đầy hộp, còn dòng này là thứ bảo trình xem PDF phóng tờ
         * giấy lên cho hết bề rộng ấy. Thiếu nó thì trình xem khớp trang theo
         * chiều CAO như mặc định, và dải xám hai bên quay lại y nguyên — chỉ
         * khác là xám thay vì trắng.
         *
         * `FitH` là tham số mở tệp chuẩn, PDFium (Chrome, Edge) và pdf.js
         * (Firefox) đều hiểu. Trình duyệt nào bỏ qua thì rơi về đúng hành vi
         * hôm nay, không vỡ gì — nên nó an toàn để dựa vào.
         *
         * Nối vào `blob:` URL, tức là một mảnh neo thuần phía trình duyệt: máy
         * chủ không bao giờ nhìn thấy nó, và nút *Tải xuống* đi đường khác
         * (`duongTai ?? duong`) nên không dính.
         */
        <iframe className="khung-xem khung-giay" src={`${tep.url}#view=FitH`} title={tieuDe} />
      )}

      {tep !== null && cach === 'anh' && (
        <div className="khung-xem khung-anh">
          <img
            src={tep.url}
            alt={tieuDe}
            onLoad={(e) => {
              const a = e.currentTarget;
              // Chặn phép chia cho 0: ảnh hỏng vẫn kích hoạt `load` ở vài trình
              // duyệt, với hai số đo bằng 0 — và `0/0` là `NaN`, thứ lọt thẳng
              // vào `calc()` rồi làm sập cả bề rộng của hộp thoại.
              if (a.naturalWidth > 0 && a.naturalHeight > 0) {
                datAnh({ rong: a.naturalWidth, cao: a.naturalHeight });
              }
            }}
          />
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
