/**
 * **Thẻ tệp** — ảnh thu nhỏ, thao tác hiện khi rê chuột (`0069`).
 *
 * Một thành phần cho MỌI chỗ có tệp đính kèm: bản cứng của hồ sơ và hồ sơ pháp
 * lý của khách hàng. Hai chỗ ấy vốn là hai danh sách gạch đầu dòng với ba nút
 * chữ mỗi dòng — cùng một việc, hai lần dựng, và hai lần sẽ trôi khỏi nhau.
 *
 * VÌ SAO LÀ ẢNH THU NHỎ. Tệp đính kèm ở đây gần như luôn là **bản scan giấy tờ**,
 * và người dùng nhận ra chúng bằng cách nhìn chứ không bằng cách đọc tên: ba file
 * tên `scan_001.pdf`, `scan_002.pdf`, `IMG_4821.jpg` thì tên không nói gì cả.
 *
 * BA THAO TÁC, ĐẶT THEO MỨC NGUY HIỂM:
 *
 *   - *Xem* và *Tải xuống* nằm GIỮA thẻ — hai việc lành, làm hằng ngày.
 *   - *Gỡ* nằm ở GÓC TRÊN BÊN PHẢI, tách hẳn khỏi hai cái kia. Không lùi lại
 *     được, nên nó không được nằm cạnh chỗ tay đang bấm.
 *
 * Thao tác hiện khi rê chuột, nhưng KHÔNG CHỈ khi rê chuột: `:focus-within`
 * trong CSS giữ chúng hiện ra khi đi bằng bàn phím, và trên màn hình cảm ứng thì
 * không có "rê" nào cả nên chúng luôn hiện — xem `app.css`.
 */
import { useEffect, useState } from 'react';
import { xemTruoc } from '../lib/api.js';

/** Kiểu tệp có xem trước được bằng ảnh thật hay không. */
const laAnh = (ten: string): boolean => /\.(png|jpe?g|gif|webp|bmp)$/i.test(ten);

/**
 * Biểu tượng theo đuôi file, cho những tệp không dựng được ảnh thật.
 *
 * Chữ chứ không phải hình vẽ: `PDF`, `DOCX`, `XLSX` nói đúng thứ người dùng cần
 * biết để đoán mở bằng gì, và nó đọc được ở kích thước 40 pixel — một biểu tượng
 * tài liệu chung chung thì không phân biệt được ba loại ấy.
 */
const duoiTep = (ten: string): string => {
  const m = /\.([a-z0-9]+)$/i.exec(ten);
  return (m?.[1] ?? 'TỆP').toUpperCase().slice(0, 4);
};

function AnhThuNho({ tenTep, duong }: { tenTep: string; duong: string | null }) {
  const [url, datUrl] = useState<string | null>(null);

  /*
   * Ảnh tải qua `xemTruoc` rồi nhúng bằng `blob:`, không đặt thẳng `src` vào
   * đường API: đường ấy đòi header `Authorization`, mà thẻ `<img>` không gửi
   * header nào — đặt thẳng là nhận về một ô ảnh vỡ.
   *
   * Chỉ tải khi ĐÃ CÓ đường: `duong` là `null` cho tới lúc thẻ cha xin xong liên
   * kết, và với tệp không phải ảnh thì mãi mãi `null` — không tải gì cả.
   */
  useEffect(() => {
    if (duong === null || !laAnh(tenTep)) return;
    let song = true;
    let cu: string | null = null;
    xemTruoc(duong)
      .then((x) => {
        cu = x.url;
        if (song) datUrl(x.url);
        else URL.revokeObjectURL(x.url);
      })
      .catch(() => undefined);
    return () => {
      song = false;
      if (cu) URL.revokeObjectURL(cu);
    };
  }, [duong, tenTep]);

  if (url !== null) return <img className="the-tep-anh" src={url} alt="" />;
  return (
    <span className="the-tep-duoi" aria-hidden="true">
      {duoiTep(tenTep)}
    </span>
  );
}

export function TheTep({
  tenTep,
  phu,
  duongXem,
  dangChay = false,
  choPhepGo = false,
  xem,
  tai,
  go,
}: {
  tenTep: string;
  /** Dòng phụ dưới tên: loại tệp, thời điểm tải lên… */
  phu?: string;
  /**
   * Đường xem nội dung — chỉ để DỰNG ẢNH THU NHỎ, và chỉ với tệp ảnh.
   *
   * `null` nghĩa là chưa xin liên kết: thẻ vẫn vẽ đủ, chỉ hiện đuôi file thay
   * cho ảnh. Xin liên kết cho mọi tệp ngay lúc mở màn hình là một lời gọi mạng
   * cho mỗi tệp, để phục vụ một thứ trang trí.
   */
  duongXem?: string | null;
  dangChay?: boolean;
  choPhepGo?: boolean;
  xem: () => void;
  tai: () => void;
  go?: () => void;
}) {
  return (
    <figure className="the-tep">
      <div className="the-tep-hinh">
        <AnhThuNho tenTep={tenTep} duong={duongXem ?? null} />

        <div className="the-tep-thao-tac">
          {/*
            Nhãn chữ nằm trong `aria-label` và `title`, không nằm trên mặt thẻ:
            biểu tượng đủ để nhận ra hai việc quá quen này, còn người đi bằng bàn
            phím hay trình đọc màn hình vẫn nghe đúng tên việc.
          */}
          <button
            type="button"
            className="the-tep-nut"
            aria-label={`Xem ${tenTep}`}
            title="Xem"
            disabled={dangChay}
            onClick={xem}
          >
            <MatIcon />
          </button>
          <button
            type="button"
            className="the-tep-nut"
            aria-label={`Tải xuống ${tenTep}`}
            title="Tải xuống"
            disabled={dangChay}
            onClick={tai}
          >
            <MuiTenXuong />
          </button>
        </div>

        {choPhepGo && go && (
          <button
            type="button"
            className="the-tep-go"
            aria-label={`Gỡ ${tenTep}`}
            title="Gỡ"
            disabled={dangChay}
            onClick={go}
          >
            <DauX />
          </button>
        )}
      </div>

      <figcaption className="the-tep-ten" title={tenTep}>
        {tenTep}
      </figcaption>
      {phu !== undefined && <p className="the-tep-phu">{phu}</p>}
    </figure>
  );
}

const Hinh = ({ children }: { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const MatIcon = () => (
  <Hinh>
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="2.6" />
  </Hinh>
);

const MuiTenXuong = () => (
  <Hinh>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
  </Hinh>
);

const DauX = () => (
  <Hinh>
    <path d="M6 6l12 12M18 6 6 18" />
  </Hinh>
);
