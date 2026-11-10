/**
 * **Ô chọn có gõ** — thay cho `<select>` ở những danh sách DÀI hoặc tăng theo dữ liệu (`0280`).
 *
 * Bấm vào ô là sổ ra danh sách đầy đủ; gõ thì danh sách thu hẹp ngay, và gõ không
 * dấu vẫn ra tên có dấu (`ha noi` → *Hà Nội*). Khác `ChonNhieu` (`0077`) ở chỗ ô này
 * chọn MỘT giá trị và có chỗ đứng trong biểu mẫu: nhận đúng bộ thuộc tính mà
 * `Truong` đưa cho ô nhập (`id`, `aria-describedby`, `aria-invalid`).
 *
 * Vẫn là danh sách ĐÓNG: chữ gõ vào chỉ để TÌM, không bao giờ thành giá trị. Rời
 * ô mà chưa chọn thì ô trả về mục đang chọn — không có trạng thái "gõ dở" nào lọt
 * vào dữ liệu.
 *
 * DỰNG BẰNG `role="combobox"` + `listbox`, danh sách đặt `position: fixed` theo toạ
 * độ của ô: hộp thoại có vùng cuộn riêng (`.hop-thoai-than`) và bảng có khung cuộn,
 * một danh sách `absolute` bên trong chúng bị cắt hoặc nới vùng cuộn ra.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type MucChon = {
  /** Giá trị trả về. Rỗng được dành cho mục "mọi …" — xem `mucRong`. */
  gia: string;
  /** Chữ hiện trong ô và trong danh sách. */
  nhan: string;
  /** Dòng phụ nhỏ bên dưới (nhóm, giá…). Cũng được đem đi so khi gõ. */
  phu?: string;
  /** Hiện mờ và không chọn được — giá trị cũ còn trong dữ liệu mà danh sách mới đã bỏ. */
  tat?: boolean;
};

/** Bỏ dấu và hạ chữ thường để so — `đ` không tách ra bằng NFD nên phải thay tay. */
export const boDau = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();

/** Lọc theo chữ gõ — một hàm thuần để ca kiểm gọi thẳng. */
export function locMuc(ds: MucChon[], q: string): MucChon[] {
  const k = boDau(q.trim());
  if (!k) return ds;
  return ds.filter((m) => boDau(`${m.nhan} ${m.phu ?? ''}`).includes(k));
}

/** Tách `nhan` thành ba đoạn quanh chỗ khớp, để tô đậm đúng chữ người dùng đã gõ. */
function danhDau(nhan: string, q: string): [string, string, string] {
  const k = boDau(q.trim());
  if (!k) return [nhan, '', ''];
  // `boDau` có thể đổi độ dài chuỗi (NFD tách dấu) — so từng ký tự gốc để vị trí khớp đúng.
  const goc = [...nhan];
  let dem = '';
  const vitri: number[] = [];
  goc.forEach((c, i) => {
    const b = boDau(c);
    for (let j = 0; j < b.length; j += 1) vitri.push(i);
    dem += b;
  });
  const at = dem.indexOf(k);
  if (at < 0) return [nhan, '', ''];
  const dau = vitri[at]!;
  const cuoi = vitri[at + k.length - 1]! + 1;
  return [goc.slice(0, dau).join(''), goc.slice(dau, cuoi).join(''), goc.slice(cuoi).join('')];
}

export function ChonCoGo({
  id,
  giaTri,
  doi,
  ds,
  mucRong,
  goiY = 'Gõ để tìm…',
  khongCoKetQua,
  disabled = false,
  ...aria
}: {
  id: string;
  giaTri: string;
  doi: (gia: string) => void;
  ds: MucChon[];
  /**
   * Nhãn của mục ứng với giá trị RỖNG — *"— Mọi nhóm —"*, *"Bất kỳ"*. Có nó thì ô
   * có đường trở về "không lọc" và danh sách mở ra với mục ấy đứng đầu; không có
   * thì giá trị rỗng nghĩa là *chưa chọn* và ô hiện chữ gợi ý.
   */
  mucRong?: string;
  goiY?: string;
  khongCoKetQua?: (q: string) => string;
  disabled?: boolean;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  'aria-label'?: string | undefined;
}) {
  const [q, datQ] = useState('');
  const [mo, datMo] = useState(false);
  const [cs, datCs] = useState(0);
  const [toaDo, datToaDo] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null);
  const o = useRef<HTMLInputElement>(null);
  const dsRef = useRef<HTMLDivElement>(null);
  const maDs = useId();

  // Mục rỗng đứng đầu khi CHƯA gõ; gõ rồi thì chỉ còn mục khớp — "Mọi nhóm" không khớp chữ "sua".
  const muc = useMemo<MucChon[]>(() => {
    const khop = locMuc(ds, q);
    return mucRong !== undefined && q.trim() === '' ? [{ gia: '', nhan: mucRong }, ...khop] : khop;
  }, [ds, q, mucRong]);

  const dangChon = ds.find((m) => m.gia === giaTri);
  const chu =
    giaTri === ''
      ? mucRong ?? ''
      : dangChon?.nhan ?? giaTri; // giá trị lạ: hiện chính nó, không hiện ô trống — ô trống nói dối rằng chưa chọn gì

  useEffect(() => {
    if (!mo) datQ('');
  }, [mo]);

  // Đặt danh sách theo toạ độ của ô, lật lên trên khi bên dưới chật.
  const dat = () => {
    const e = o.current;
    if (!e) return;
    const r = e.getBoundingClientRect();
    const duoi = window.innerHeight - r.bottom - 8;
    const tren = r.top - 8;
    const lat = duoi < 200 && tren > duoi;
    datToaDo(
      lat
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, max: Math.min(tren - 4, 320) }
        : { left: r.left, width: r.width, top: r.bottom + 4, max: Math.min(duoi - 4, 320) },
    );
  };
  useLayoutEffect(() => {
    if (!mo) return;
    dat();
    window.addEventListener('resize', dat);
    window.addEventListener('scroll', dat, true);
    return () => {
      window.removeEventListener('resize', dat);
      window.removeEventListener('scroll', dat, true);
    };
  }, [mo, muc.length]);

  useEffect(() => {
    if (!mo) return;
    dsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [cs, mo, toaDo]);

  const chon = (m: MucChon | undefined) => {
    if (!m || m.tat) return;
    datMo(false);
    if (m.gia !== giaTri) doi(m.gia);
  };

  const phim = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!mo) datMo(true);
      else datCs(Math.min(cs + 1, muc.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      datCs(Math.max(cs - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter trong một biểu mẫu là GỬI biểu mẫu — chỉ nuốt nó khi nó đang chọn một mục.
      if (mo && muc[cs]) {
        e.preventDefault();
        chon(muc[cs]);
      }
    } else if (e.key === 'Escape') {
      if (mo) {
        // Hộp thoại cũng nghe Escape ở cấp tài liệu — đóng danh sách thôi, đừng đóng cả hộp.
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        datMo(false);
      }
    } else if (e.key === 'Tab') {
      datMo(false);
    }
  };

  return (
    <div className="chon-go">
      <input
        {...aria}
        ref={o}
        id={id}
        type="text"
        role="combobox"
        className="o-nhap"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={mo}
        aria-controls={maDs}
        aria-autocomplete="list"
        // Giá trị THẬT đang chọn — chữ trong ô là nhãn, không phải giá trị. Ca kiểm và QA đọc từ đây.
        data-gia={giaTri}
        aria-activedescendant={mo && muc[cs] ? `${maDs}-${cs}` : undefined}
        disabled={disabled}
        placeholder={mo ? chu || goiY : giaTri === '' && mucRong === undefined ? goiY : undefined}
        value={mo ? q : chu}
        onFocus={(e) => {
          datQ('');
          datCs(Math.max(0, (mucRong !== undefined ? [{ gia: '' }, ...ds] : ds).findIndex((m) => m.gia === giaTri)));
          datMo(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          datQ(e.target.value);
          datCs(0);
          datMo(true);
        }}
        // Đã có tiêu điểm mà danh sách đang đóng (vừa chọn xong): bấm lại phải mở lại — `onFocus` không bắn lần hai.
        onClick={() => !mo && !disabled && datMo(true)}
        onKeyDown={phim}
        onBlur={() => datMo(false)}
      />
      <span className="chon-go-mui" aria-hidden="true">
        ▾
      </span>
      {mo && toaDo && (
        <div
          ref={dsRef}
          id={maDs}
          role="listbox"
          className="chon-go-ds"
          style={{
            left: toaDo.left,
            width: toaDo.width,
            maxHeight: toaDo.max,
            ...(toaDo.top !== undefined ? { top: toaDo.top } : { bottom: toaDo.bottom }),
          }}
          // `mousedown` chứ không `click`: `click` đến SAU `blur` của ô, mà `blur` đã đóng danh sách.
          onMouseDown={(e) => e.preventDefault()}
        >
          {muc.length === 0 ? (
            <div className="chon-go-trong">
              {khongCoKetQua ? khongCoKetQua(q) : `Không có mục nào khớp “${q}”.`}
            </div>
          ) : (
            muc.map((m, i) => {
              const [a, b, c] = danhDau(m.nhan, q);
              return (
                <div
                  key={`${m.gia}|${i}`}
                  id={`${maDs}-${i}`}
                  role="option"
                  data-gia={m.gia}
                  aria-selected={i === cs}
                  aria-disabled={m.tat || undefined}
                  className={`chon-go-muc${m.gia === giaTri ? ' da-chon' : ''}${m.tat ? ' tat' : ''}`}
                  onMouseMove={() => i !== cs && datCs(i)}
                  onClick={() => chon(m)}
                >
                  <span className="chon-go-nhan">
                    {a}
                    {b && <mark>{b}</mark>}
                    {c}
                  </span>
                  {m.phu && <span className="chon-go-phu">{m.phu}</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
