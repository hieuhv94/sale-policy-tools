/**
 * Những mảnh dùng lại khắp nơi.
 *
 * Không dùng thư viện component. Xem lý do ở `router.tsx` và ở nhật ký P7d:
 * trần 250KB nén của `FE-38`, cộng với việc `FE-19` cấm màu nằm ngoài bảng token
 * — mà mọi thư viện component đều mang bảng màu riêng của nó.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LoiApi } from '../lib/api.js';
import { nhanTrangThai, nhomTrangThai, tien } from '../lib/format.js';
import { Lien } from '../lib/router.js';

/**
 * Dải thẻ chuyển nhóm nội dung trong một màn hình.
 *
 * KHÔNG phải điều hướng: hai thẻ của cùng một trang là cùng một địa chỉ, nên
 * dùng `role="tab"` chứ không dùng `Lien`. Ngược lại thì nút Quay lại của trình
 * duyệt phải đi qua từng thẻ, mà người dùng chỉ muốn ra khỏi màn hình.
 */
export function DaiThe<T extends string>({
  muc,
  dangChon,
  chon,
  nhanVung,
}: {
  muc: { khoa: T; nhan: string; dem?: number }[];
  dangChon: T;
  chon: (k: T) => void;
  nhanVung: string;
}) {
  return (
    <div className="dai-the" role="tablist" aria-label={nhanVung}>
      {muc.map((m) => (
        <button
          key={m.khoa}
          type="button"
          role="tab"
          aria-selected={m.khoa === dangChon}
          className={m.khoa === dangChon ? 'the-chon dang-chon' : 'the-chon'}
          onClick={() => chon(m.khoa)}
        >
          {m.nhan}
          {m.dem !== undefined && <span className="the-dem"> ({m.dem})</span>}
        </button>
      ))}
    </div>
  );
}

export function Nhan({ trangThai }: { trangThai: string }) {
  return (
    <span className={`nhan nhan-${nhomTrangThai(trangThai)}`}>{nhanTrangThai(trangThai)}</span>
  );
}

/**
 * Một ô số liệu. `kieu` chỉ đổi màu vạch bên trái và màu con số.
 *
 * Có `den` thì cả ô thành một liên kết — không phải chỉ con số, không phải một
 * nút "xem chi tiết" nhỏ ở góc. Vùng bấm là cả thẻ vì trên điện thoại một con số
 * cao 1.75rem là mục tiêu quá nhỏ (`FE-08`), và vì người ta chỉ vào con số chứ
 * không chỉ vào chữ bên cạnh nó.
 */
export function ChiSo({
  nhan,
  giaTri,
  phu,
  canhBao,
  kieu = 'thuong',
  den,
}: {
  nhan: string;
  giaTri: number | string;
  phu?: string;
  /**
   * Dòng cảnh báo đỏ dưới cùng, ví dụ "3 hồ sơ quá hạn".
   *
   * Tách khỏi `phu` chứ không nối chuỗi vào nó: hai câu này khác hẳn nhau về
   * mức khẩn, và gộp vào một dòng xám thì cái cần chú ý mang đúng sắc độ với
   * cái không cần.
   */
  canhBao?: string;
  kieu?: 'thuong' | 'tot' | 'cho' | 'canh-bao' | 'loi';
  den?: string;
}) {
  const trong = (
    <>
      <span className="chi-so-nhan">{nhan}</span>
      <strong className="chi-so-gia-tri so">{giaTri}</strong>
      {phu !== undefined && <span className="chi-so-phu">{phu}</span>}
      {canhBao !== undefined && <span className="chi-so-tre">{canhBao}</span>}
    </>
  );
  const lop = `chi-so chi-so-${kieu}`;

  if (den === undefined) return <article className={lop}>{trong}</article>;
  return (
    <Lien den={den} className={`${lop} chi-so-lien`}>
      {trong}
    </Lien>
  );
}

export function DangTai({ nhan = 'Đang tải…' }: { nhan?: string }) {
  return (
    <p className="dang-tai" role="status" aria-live="polite">
      {nhan}
    </p>
  );
}

/**
 * Màn hình rỗng phải NÓI VIỆC CẦN LÀM TIẾP (`FE-36`).
 *
 * Một bảng rỗng không lời khiến người dùng tưởng hệ thống hỏng, và họ sẽ gọi
 * điện hỏi thay vì bấm nút vốn đang ở ngay trước mặt.
 */
export function Trong({ tieuDe, moTa, children }: { tieuDe: string; moTa?: string; children?: ReactNode }) {
  return (
    <div className="trong-khung">
      <p className="trong-tieu-de">{tieuDe}</p>
      {moTa && <p className="trong-mo-ta">{moTa}</p>}
      {children}
    </div>
  );
}

/**
 * Hiển thị lỗi. Phân biệt lỗi MẠNG với lỗi nghiệp vụ (`FE-32`).
 *
 * Lỗi mạng thì dữ liệu đang nhập vẫn đúng và chỉ cần bấm thử lại — phải nói rõ
 * điều đó, nếu không người dùng sẽ tự nhập lại từ đầu cho chắc.
 */
export function BaoLoi({ loi, thuLai }: { loi: unknown; thuLai?: () => void }) {
  const l = loi instanceof LoiApi ? loi : null;
  const mang = l?.laLoiMang ?? false;
  return (
    <div className={mang ? 'bao-loi mang' : 'bao-loi'} role="alert">
      <p className="bao-loi-chinh">
        {l ? l.message : 'Có lỗi không xác định. Hãy thử lại.'}
      </p>
      {mang && <p className="bao-loi-phu">Dữ liệu bạn đã nhập vẫn được giữ nguyên.</p>}
      {l?.traceId && <p className="bao-loi-ma">Mã tra cứu: {l.traceId}</p>}
      {thuLai && (
        <button type="button" className="nut" onClick={thuLai}>
          Thử lại
        </button>
      )}
    </div>
  );
}

/**
 * Chú giải dấu sao, đặt đầu mỗi biểu mẫu có ô bắt buộc.
 *
 * Dấu `*` là quy ước, không phải nghĩa hiển nhiên — và nó là thứ DUY NHẤT phân
 * biệt ô phải điền với ô không, nên phải nói ra một lần ở nơi người dùng đọc
 * trước khi bắt đầu điền. Trình đọc màn hình đã có phần "(bắt buộc)" đọc kèm
 * từng nhãn ở `Truong`, nên khối này ẩn khỏi cây trợ năng để khỏi lặp.
 */
export function ChuThichBatBuoc() {
  return (
    <p className="ghi-chu" aria-hidden="true">
      Trường có dấu <span className="sao">*</span> là bắt buộc.
    </p>
  );
}

export function Truong({
  nhan,
  bắtBuộc,
  donVi,
  loi,
  children,
  id,
}: {
  nhan: string;
  bắtBuộc?: boolean;
  /**
   * Đơn vị của con số, hiện ngay TRÊN ô nhập.
   *
   * Đặt trên chứ không đặt trong ô: chữ nằm trong ô thì lẫn với con số đang gõ,
   * còn đặt sau ô thì trên điện thoại nó rơi xuống dòng dưới và người dùng đọc
   * xong con số rồi mới thấy đơn vị. "90.000" mà không biết đồng hay nghìn đồng
   * là chỗ sai tiền theo bội số của một nghìn.
   */
  donVi?: string | undefined;
  loi?: string | undefined;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  id: string;
}) {
  const idLoi = `${id}-loi`;
  return (
    <div className="truong">
      {/* Nhãn gắn ĐÚNG vào ô nhập bằng htmlFor — `FE-34` quét chính chỗ này. */}
      <label htmlFor={id}>
        {nhan}
        {bắtBuộc && <span className="sao" aria-hidden="true"> *</span>}
        {bắtBuộc && <span className="chi-doc-man-hinh"> (bắt buộc)</span>}
        {donVi && <span className="don-vi"> ({donVi})</span>}
      </label>
      {children({
        id,
        ...(loi ? { 'aria-describedby': idLoi, 'aria-invalid': true } : {}),
      })}
      {loi && (
        <p className="truong-loi" id={idLoi}>
          {loi}
        </p>
      )}
    </div>
  );
}

/**
 * Ô nhập tiền.
 *
 * `inputMode="numeric"` gọi bàn phím SỐ trên điện thoại (`FE-09`). Không đặt
 * `type="number"`: trên di động nó cho gõ `e`, dấu trừ và dấu chấm thập phân,
 * còn trên máy tính thì con lăn chuột vô tình đổi số tiền — cả hai đều là lỗi
 * âm thầm ở đúng chỗ không được sai một đồng.
 */
export function ONhapTien({
  id,
  giaTri,
  doi,
  ...rest
}: {
  id: string;
  giaTri: string;
  doi: (v: string) => void;
} & Record<string, unknown>) {
  return (
    <input
      {...rest}
      id={id}
      className="o-nhap so"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      // HIỂN THỊ có dấu chấm phân nhóm, GIÁ TRỊ gửi đi vẫn là chuỗi số trần.
      // Người nhập 90000 phải đọc được ngay là chín mươi nghìn chứ không phải
      // chín trăm nghìn — đếm số 0 bằng mắt là chỗ sai tiền nhiều nhất, và nó
      // sai theo bội số của mười.
      value={tien(giaTri) === '—' ? '' : tien(giaTri)}
      onChange={(e) => doi(e.target.value.replace(/[^\d]/g, ''))}
    />
  );
}

/**
 * Ô nhập PHẦN TRĂM, hai chữ số thập phân.
 *
 * Dấu thập phân là **dấu phẩy** theo quy ước tiếng Việt (`FE-27`), nhưng nhận cả
 * dấu chấm: bàn phím số trên laptop chỉ có dấu chấm, và bắt người ta đổi bàn
 * phím giữa lúc gõ một con số là thứ không ai chịu.
 *
 * Cắt ở hai chữ số ngay khi đang gõ chứ không đợi lúc lưu. Gõ được `12,345` rồi
 * lưu xong thấy `12,35` là người dùng phải tự đoán ra hệ thống đã làm gì với con
 * số của mình.
 */
export function ONhapPhanTram({
  id,
  giaTri,
  doi,
  ...rest
}: {
  id: string;
  giaTri: string;
  doi: (v: string) => void;
} & Record<string, unknown>) {
  return (
    <input
      {...rest}
      id={id}
      className="o-nhap o-nhap-hep so"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={giaTri}
      onChange={(e) => doi(catHaiChuSo(e.target.value))}
    />
  );
}

/**
 * Giữ lại đúng những gì hợp lệ trong một số thập phân đang gõ dở.
 *
 * Phải chịu được TRẠNG THÁI DỞ DANG: `12,` là chuỗi người dùng bắt buộc phải đi
 * qua để gõ `12,5`. Chuẩn hoá quá tay ở đây — cắt dấu phẩy cuối — là ô nhập tự
 * xoá ký tự người ta vừa gõ, và không cách nào nhập được phần thập phân.
 */
export function catHaiChuSo(v: string): string {
  const s = v.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const [nguyen = '', ...le] = s.split(',');
  if (le.length === 0) return nguyen;
  return `${nguyen},${le.join('').slice(0, 2)}`;
}

/**
 * Ô tìm kiếm AN TOÀN VỚI BỘ GÕ TIẾNG VIỆT (`FE-31`).
 *
 * Telex gõ "Đà Nẵng" đi qua các trạng thái trung gian "Dda Nawng". Nếu gọi tìm
 * kiếm ở mỗi lần `change` thì vừa tốn lời gọi vô nghĩa, vừa có thể khiến React
 * ghi đè ô nhập giữa lúc bộ gõ đang bỏ dấu — mất dấu hoặc mất ký tự.
 *
 * `compositionstart`/`compositionend` là sự kiện chuẩn cho việc này: trong lúc
 * đang soạn thì KHÔNG báo ra ngoài; soạn xong mới báo.
 */
export function OTimKiem({
  id,
  nhan,
  giaTri,
  doi,
  cho = 350,
}: {
  id: string;
  nhan: string;
  giaTri: string;
  doi: (v: string) => void;
  cho?: number;
}) {
  const [tho, datTho] = useState(giaTri);
  const dangSoan = useRef(false);
  const hen = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => datTho(giaTri), [giaTri]);

  const bao = (v: string) => {
    if (hen.current) clearTimeout(hen.current);
    hen.current = setTimeout(() => doi(v), cho);
  };

  return (
    <div className="truong">
      <label htmlFor={id}>{nhan}</label>
      <input
        id={id}
        className="o-nhap"
        type="search"
        autoComplete="off"
        value={tho}
        onCompositionStart={() => (dangSoan.current = true)}
        onCompositionEnd={(e) => {
          dangSoan.current = false;
          const v = (e.target as HTMLInputElement).value;
          datTho(v);
          bao(v);
        }}
        onChange={(e) => {
          const v = e.target.value;
          datTho(v);
          if (!dangSoan.current) bao(v);
        }}
      />
    </div>
  );
}

/**
 * Hộp thoại. Bẫy tiêu điểm bên trong khi mở, trả lại chỗ cũ khi đóng (`FE-35`).
 */
export function HopThoai({
  tieuDe,
  dong,
  children,
}: {
  tieuDe: string;
  dong: () => void;
  children: ReactNode;
}) {
  const khung = useRef<HTMLDivElement>(null);
  const truoc = useRef<HTMLElement | null>(null);

  useEffect(() => {
    truoc.current = document.activeElement as HTMLElement | null;
    khung.current?.querySelector<HTMLElement>(
      'input,select,textarea,button,[href],[tabindex]:not([tabindex="-1"])',
    )?.focus();
    return () => truoc.current?.focus();
  }, []);

  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dong();
        return;
      }
      if (e.key !== 'Tab' || !khung.current) return;
      const co = khung.current.querySelectorAll<HTMLElement>(
        'input,select,textarea,button,[href],[tabindex]:not([tabindex="-1"])',
      );
      if (co.length === 0) return;
      const dau = co[0]!;
      const cuoi = co[co.length - 1]!;
      // Không có hai nhánh này thì Tab đi ra ngoài hộp thoại và người dùng bàn
      // phím lạc vào phần đang bị lớp phủ che.
      if (e.shiftKey && document.activeElement === dau) {
        e.preventDefault();
        cuoi.focus();
      } else if (!e.shiftKey && document.activeElement === cuoi) {
        e.preventDefault();
        dau.focus();
      }
    };
    document.addEventListener('keydown', phim);
    return () => document.removeEventListener('keydown', phim);
  }, [dong]);

  return (
    <div className="lop-phu" onMouseDown={(e) => e.target === e.currentTarget && dong()}>
      <div className="hop-thoai" role="dialog" aria-modal="true" aria-label={tieuDe} ref={khung}>
        {/*
          Tiêu đề nằm NGOÀI vùng cuộn, nội dung nằm trong. Biểu mẫu tạo Trình
          dược viên có bảy ô nên nó cao hơn màn hình laptop; để cả hộp thoại
          cùng cuộn thì tiêu đề trôi mất và không có cách nào kéo lại — người
          dùng không còn biết mình đang mở hộp thoại nào.
        */}
        <h2>{tieuDe}</h2>
        <div className="hop-thoai-than">{children}</div>
      </div>
    </div>
  );
}

/**
 * Hỏi lại trước một thao tác không lùi được — HAI mức, chọn bằng `goLai`.
 *
 * Mức thường: nêu HẬU QUẢ rồi cho bấm. Mức nặng: bắt **gõ lại đúng một chuỗi**
 * (mã hồ sơ, tên mẫu…) mới mở được nút. Cùng cách làm với hộp thoại xoá hồ sơ,
 * vốn có trước và đã chứng minh là đúng chỗ: một nút "Chắc chưa?" thì người
 * dùng bấm phản xạ, còn gõ lại tên thì buộc phải đọc xem mình đang đứng ở dòng
 * nào.
 *
 * `hauQua` KHÔNG được viết kiểu "Bạn có chắc không?". Câu đó không thêm thông
 * tin gì. Phải nói ra thứ sẽ hỏng: liên kết cũ chết, kế toán không xuất được
 * hợp đồng, người đang đăng nhập bị đá ra.
 */
export function HopThoaiXacNhan({
  tieuDe,
  hauQua,
  nhanNut,
  goLai,
  nguyHiem = true,
  dangChay = false,
  loi = null,
  dong,
  xacNhan,
}: {
  tieuDe: string;
  hauQua: ReactNode;
  nhanNut: string;
  /** Chuỗi người dùng phải gõ lại. Bỏ trống là mức thường. */
  goLai?: string | undefined;
  nguyHiem?: boolean;
  dangChay?: boolean;
  loi?: unknown;
  dong: () => void;
  xacNhan: () => void;
}) {
  const [go, datGo] = useState('');
  // So sau khi cắt khoảng trắng hai đầu: dán từ chỗ khác thường kéo theo một
  // dấu cách, và chặn vì một dấu cách vô hình là kiểu bực mình vô nghĩa.
  const dukien = goLai === undefined || go.trim() === goLai;

  return (
    <HopThoai tieuDe={tieuDe} dong={dong}>
      <div className="giai-thich">{hauQua}</div>

      {goLai !== undefined && (
        <Truong id="xn-go" nhan={`Gõ lại để xác nhận: ${goLai}`} bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="off"
              value={go}
              onChange={(e) => datGo(e.target.value)}
            />
          )}
        </Truong>
      )}

      {loi !== null && loi !== undefined && <BaoLoi loi={loi} />}

      <div className="nhom-nut">
        <button
          type="button"
          className={nguyHiem ? 'nut nut-canh-bao' : 'nut nut-chinh'}
          disabled={dangChay || !dukien}
          onClick={xacNhan}
        >
          {dangChay ? 'Đang chạy…' : nhanNut}
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Huỷ
        </button>
      </div>
    </HopThoai>
  );
}

/** Bao nhiêu lâu thì thanh hoàn tác tự tắt. */
export const HOAN_TAC_MS = 8000;

/**
 * Thanh "đã làm xong — hoàn tác" cho thao tác LÙI ĐƯỢC.
 *
 * Dùng thay hộp thoại hỏi trước ở những chỗ bấm nhầm sửa được bằng một cú bấm
 * nữa (bật/tắt hiệu lực, kích hoạt lại tài khoản). Hỏi trước ở đó chỉ tổ thêm
 * một cú bấm cho một trăm lần đúng, để đỡ một lần sai vốn tự sửa được.
 *
 * Tự tắt sau `HOAN_TAC_MS`. `role="status"` chứ không phải `alert`: đây là tin
 * báo việc đã xong, không phải lỗi cần cắt ngang người dùng.
 */
export function ThanhHoanTac({
  loi: baoLoi,
  hoanTac,
  dong,
}: {
  loi: string;
  hoanTac: () => void;
  dong: () => void;
}) {
  useEffect(() => {
    const h = setTimeout(dong, HOAN_TAC_MS);
    return () => clearTimeout(h);
  }, [dong]);

  return (
    <div className="thanh-hoan-tac" role="status">
      <span>{baoLoi}</span>
      <button type="button" className="nut nut-nhe" onClick={hoanTac}>
        Hoàn tác
      </button>
      <button
        type="button"
        className="nut nut-nhe nut-dong-thanh"
        aria-label="Đóng thông báo"
        onClick={dong}
      >
        ×
      </button>
    </div>
  );
}

