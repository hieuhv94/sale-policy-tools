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
import { nhanTrangThai, nhomTrangThai } from '../lib/format.js';
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
  kieu = 'thuong',
  den,
}: {
  nhan: string;
  giaTri: number | string;
  phu?: string;
  kieu?: 'thuong' | 'tot' | 'cho' | 'canh-bao' | 'loi';
  den?: string;
}) {
  const trong = (
    <>
      <span className="chi-so-nhan">{nhan}</span>
      <strong className="chi-so-gia-tri so">{giaTri}</strong>
      {phu !== undefined && <span className="chi-so-phu">{phu}</span>}
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
  loi,
  children,
  id,
}: {
  nhan: string;
  bắtBuộc?: boolean;
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
      value={giaTri}
      onChange={(e) => doi(e.target.value.replace(/[^\d]/g, ''))}
    />
  );
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
