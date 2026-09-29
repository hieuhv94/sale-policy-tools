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
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  them,
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
  /**
   * Nút phụ chèn vào ĐẦU hàng nút, cạnh *Đóng* và *Tải xuống* (`0167`).
   *
   * Một chỗ duy nhất dùng: nút *Lưu bản mềm* của hộp tạo bản mềm. Đặt ở hàng nút
   * chứ không ở `truoc` vì nó là một HÀNH ĐỘNG trên thứ đang xem — người dùng
   * tìm hành động ở hàng nút, còn `truoc` là chỗ của những lựa chọn ĐỔI nội dung
   * đang xem.
   */
  them?: ReactNode;
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

  /*
   * PHÓNG TO ẢNH (`0172`, chốt 01/09) — *"cho phép zoom bằng chuột hoặc biểu
   * tượng khi xem preview ảnh hoặc pdf nếu chưa có"*.
   *
   * CHỈ ẢNH. PDF nhúng bằng `<iframe>` đi thẳng vào TRÌNH XEM PDF của trình
   * duyệt, và trình xem ấy đã có sẵn cả hai đường: thanh công cụ có nút phóng
   * to/thu nhỏ, và `Ctrl` + lăn chuột. Dựng thêm một bộ nút của riêng mình cho
   * PDF là dựng một bộ điều khiển thứ hai bên cạnh một bộ đang chạy tốt — mà
   * điều khiển được nó thì phải đi qua tham số `#zoom=` trong địa chỉ, tức là
   * NẠP LẠI cả tài liệu và nhảy mất chỗ người ta đang đọc.
   *
   * Ảnh thì trước lượt này không có đường nào: `object-fit: contain` khớp ảnh
   * vào khung rồi thôi, nên một bản scan chữ nhỏ chỉ đọc được bằng cách tải về.
   */
  const [phong, datPhong] = useState(1);
  /** Độ lệch khi kéo ảnh đã phóng to, tính bằng pixel trên màn hình. */
  const [lech, datLech] = useState({ x: 0, y: 0 });
  const keo = useRef<{ x: number; y: number } | null>(null);
  const khungAnh = useRef<HTMLDivElement | null>(null);

  const PHONG_MIN = 1;
  const PHONG_MAX = 6;
  const dungPhong = (z: number) => {
    const m = Math.min(PHONG_MAX, Math.max(PHONG_MIN, z));
    datPhong(m);
    // Về đúng cỡ vừa khung thì ảnh phải về giữa: giữ độ lệch cũ là để lại một
    // ảnh vừa khung mà nằm lệch hẳn sang một bên, không cách nào chỉnh lại.
    if (m === 1) datLech({ x: 0, y: 0 });
  };

  /*
   * LĂN CHUỘT phải gắn bằng listener THẬT với `passive: false`.
   *
   * React gắn `onWheel` ở gốc cây dưới dạng listener THỤ ĐỘNG, nên
   * `preventDefault()` trong đó không có tác dụng — trang vẫn cuộn phía sau
   * trong lúc ảnh phóng to, và trình duyệt còn ghi một cảnh báo ra console.
   * Đây là chỗ duy nhất trong phần mềm phải đi đường này.
   */
  useEffect(() => {
    const el = khungAnh.current;
    if (el === null) return;
    const lan = (e: WheelEvent) => {
      e.preventDefault();
      // Nhân chứ không cộng: mỗi nấc đổi cùng một TỶ LỆ, nên phóng từ 1 lên 2
      // mất đúng số nấc như từ 2 lên 4.
      dungPhong(phong * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener('wheel', lan, { passive: false });
    return () => el.removeEventListener('wheel', lan);
    /*
     * `tep` PHẢI có trong danh sách, và đây là chỗ đã dính một lần.
     *
     * Bản đầu để `khungAnh.current` làm phụ thuộc, nghe hợp lý mà SAI: React so
     * phụ thuộc bằng giá trị đọc được LÚC RENDER, còn ref thì gán lúc commit —
     * nên ở đúng lượt render dựng ra khung, giá trị ấy vẫn là `null`, hiệu ứng
     * thoát sớm, và nếu không có lượt render nào nữa thì listener KHÔNG BAO GIỜ
     * được gắn. `tep` đổi từ `null` sang nội dung đúng ở lượt dựng ra khung, và
     * hiệu ứng chạy SAU commit nên lúc đó ref đã có.
     */
  }, [phong, tep]);

  useEffect(() => {
    let song = true;
    let url: string | null = null;
    datLoi(null);
    // Đổi tệp là quên số đo cũ: giữ lại thì khung mang tỷ lệ của tệp TRƯỚC
    // trong khoảnh khắc tệp mới chưa giải mã xong.
    datAnh(null);
    // …và quên cả mức phóng: tệp mới mở ra ở cỡ vừa khung, không mang theo mức
    // phóng của tệp trước (`0172`).
    datPhong(1);
    datLech({ x: 0, y: 0 });
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
      /*
        TOÀN MÀN HÌNH cho tài liệu NHÚNG ĐƯỢC, và chỉ cho chúng (`0210`).

        Tệp Word hay Excel rơi vào `'khong'`: ở đó không có tài liệu nào để bày,
        chỉ một câu nhắn tải về cộng hai cái nút. Phủ kín màn hình cho ba dòng
        chữ là bắt người dùng thoát khỏi một trang trống để quay lại chỗ họ đang
        đứng — nên ca ấy giữ nguyên hộp thoại thường, cùng ranh giới `tyLeKhung`
        đã vạch ngay trên.
      */
      toanManHinh={cach !== 'khong'}
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
        /*
          THANH PHÓNG TO, chỉ có ở ảnh (`0172`).

          Đặt TRÊN khung chứ không dưới, cùng lý do với `truoc`: khung xem chiếm
          gần hết chiều cao hộp, và một điều khiển nằm dưới nó thì phải cuộn mới
          thấy. Con số phần trăm là một NÚT — bấm vào là về đúng cỡ vừa khung,
          đường thoát cho người vừa lăn chuột quá tay.
        */
        <div className="thanh-phong">
          {/*
            CHỈ CÒN CÂU HƯỚNG DẪN (`0212`, khách hàng chốt 20/09) — *"không cần
            cả ô phần trăm và nút về cỡ vừa khung, người dùng chỉ cần lăn
            chuột"*.

            `0172` dựng ba nút cạnh câu này; `0211` gỡ hai cái dấu cộng trừ vì ở
            cỡ vừa khung — trạng thái MỌI tấm ảnh mở ra — hai trong ba đang xám.
            Lượt này gỡ nốt cái thứ ba.

            ĐƯỜNG VỀ KHÔNG MẤT, và đó là dữ kiện phải kiểm trước khi gỡ chứ
            không phải một hy vọng: lượt lăn chuột đi qua `dungPhong`, mà hàm ấy
            kẹp mức phóng ở `PHONG_MIN = 1` **và đưa ảnh về giữa khi chạm mức
            ấy**. Nên lăn ngược hết cỡ cho ra đúng trạng thái mà cái nút vừa gỡ
            từng dựng lại — cùng mức phóng, cùng độ lệch. Cái nút là một đường
            THỨ HAI tới đó, không phải đường duy nhất.

            Cái mất, đã nêu: màn hình thôi cho biết đang phóng bao nhiêu phần
            trăm, và người lăn quá tay phải lăn ngược thay vì bấm một lần.
          */}
          <span className="ghi-chu">
            Lăn chuột để phóng to hoặc thu nhỏ, kéo để di chuyển ảnh.
          </span>
        </div>
      )}

      {tep !== null && cach === 'anh' && (
        <div
          className="khung-xem khung-anh"
          ref={khungAnh}
          /*
            KÉO ẢNH bằng con trỏ — chuột, bút và ngón tay đi chung một đường
            (`pointer*`). `setPointerCapture` là thứ giữ cho lượt kéo không đứt
            khi con trỏ ra khỏi khung giữa chừng.
          */
          onPointerDown={(e) => {
            if (phong <= 1) return;
            keo.current = { x: e.clientX - lech.x, y: e.clientY - lech.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (keo.current === null) return;
            datLech({ x: e.clientX - keo.current.x, y: e.clientY - keo.current.y });
          }}
          onPointerUp={() => {
            keo.current = null;
          }}
          onPointerCancel={() => {
            keo.current = null;
          }}
          data-keo={phong > 1 ? '1' : undefined}
        >
          <img
            src={tep.url}
            alt={tieuDe}
            style={{ transform: `translate(${lech.x}px, ${lech.y}px) scale(${phong})` }}
            /* Kéo ảnh là KÉO KHUNG, không phải kéo-thả tệp của trình duyệt. */
            draggable={false}
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

        Muc 11.1 đòi *"nút Đóng luôn hiển thị ở màn hình xem"* — ngoài nút,
        `HopThoai` chỉ đóng bằng phím Escape (bấm ra ngoài thôi đóng từ `0237`),
        một đường không ai nhìn thấy. Một
        hộp thoại chiếm gần hết màn hình mà không có nút thoát nhìn thấy được là
        hộp thoại người dùng tưởng mình bị kẹt.
      */}
      <div className="nhom-nut">
        {them}
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
