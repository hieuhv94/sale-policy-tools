/**
 * Sáu dạng biểu đồ của màn hình *Thống kê* (`0094`).
 *
 * Mỗi dạng gắn với MỘT câu hỏi, và dạng nào không trả lời câu nào thì không có
 * mặt ở đây:
 *
 *   | Dạng            | Câu hỏi                       |
 *   |-----------------|-------------------------------|
 *   | `Duong`         | đang lên hay đang xuống?      |
 *   | `Cot`           | cơ cấu đổi thế nào?           |
 *   | `Pheu`          | rơi rụng ở bước nào?          |
 *   | `XepHang`       | ai nhiều nhất, ai ít nhất?    |
 *   | `PhanTan`       | ai lệch khỏi đám đông?        |
 *   | `ThanhNguong`   | còn cách hạn bao xa?          |
 *
 * KHÔNG có biểu đồ tròn: nó chỉ đọc được với 2–3 phần và không so được giữa hai
 * kỳ — mà cả màn hình này là để so giữa các kỳ.
 *
 * MÀU ĐI QUA LỚP CSS, không qua thuộc tính `fill`. Trang có hai giao diện sáng
 * và tối, và một mã màu ghi thẳng vào SVG thì không đổi theo được. Xem
 * `.bd-1 … .bd-mo` ở `app.css`.
 *
 * TRÌNH ĐỌC MÀN HÌNH đọc `aria-label` của cả hình — một câu tóm tắt do chỗ gọi
 * truyền vào — chứ không đọc từng điểm. Một biểu đồ 12 điểm × 4 đường mà đọc hết
 * là 48 con số không ai nghe được; câu tóm tắt nói đúng điều cần biết.
 */
import type { ReactNode } from 'react';
import {
  buocNhan,
  CHU,
  chong,
  duongGap,
  inNhan,
  KHUNG,
  mocTruc,
  oCot,
  toaDoX,
  toaDoY,
  tongChong,
  tran,
  tyLeDoan,
  vungDuoi,
} from './ve.js';

export type Chuoi = {
  nhan: string;
  diem: number[];
  /** Hậu tố lớp CSS: `bd-1`…`bd-4`, `bd-tot`, `bd-xau`, `bd-canh`, `bd-mo`. */
  mau: string;
  /** Đường đứt nét — dùng cho mặt bằng chung, thứ để so chứ không phải để đọc. */
  mo?: boolean;
  vung?: boolean;
};

type KhungProps = {
  cao: number;
  moTa: string;
  children: ReactNode;
};

/** Vỏ `<svg>` chung: cùng khung toạ độ, cùng cách khai báo cho trình đọc. */
function KhungVe({ cao, moTa, children }: KhungProps) {
  return (
    <svg
      className="bd"
      viewBox={`0 0 ${KHUNG.rong} ${cao}`}
      role="img"
      aria-label={moTa}
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Lưới ngang và nhãn trục tung. */
function Luoi({ max, cao, dinhDang }: { max: number; cao: number; dinhDang?: (v: number) => string }) {
  return (
    <g aria-hidden="true">
      {mocTruc(max).map((v) => {
        const y = toaDoY(v, max, cao);
        return (
          <g key={v}>
            <line className="bd-luoi" x1={KHUNG.leTrai} y1={y} x2={KHUNG.rong - KHUNG.lePhai} y2={y} />
            <text className="bd-tri" fontSize={CHU.tri} x={KHUNG.leTrai - 6} y={y + 3.5} textAnchor="end">
              {dinhDang ? dinhDang(v) : Math.round(v)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Nhãn trục hoành — bước nhảy TỰ TÍNH, không nhận từ chỗ gọi.
 *
 * Xem `buocNhan`: chỗ gọi không biết nhãn dài bao nhiêu ký tự, mà đó lại là thứ
 * quyết định có đè nhau hay không.
 */
function NhanTruc({ moc, cao, giua }: { moc: string[]; cao: number; giua?: boolean }) {
  const o = oCot(moc.length);
  /*
   * `m ?? ''` chứ không tin thẳng vào mảng nhãn.
   *
   * Máy chủ luôn gửi nhãn (kiểu bắt buộc), nên thiếu một cái là vi phạm hợp
   * đồng — nhưng cái giá của việc tin tuyệt đối là **cả trang trắng**: một
   * `undefined.length` ném ra giữa lượt vẽ và React gỡ bỏ toàn bộ cây. Một trục
   * thiếu chữ vẫn đọc được hình; một trang trắng thì không.
   */
  const nhan = moc.map((m) => m ?? '');
  const daiNhat = Math.max(1, ...nhan.map((m) => m.length));
  const moiN = buocNhan(nhan.length, daiNhat);
  return (
    <g aria-hidden="true">
      {nhan.map((m, i) =>
        inNhan(i, nhan.length, moiN) ? (
          <text
            key={`${i}-${m}`}
            fontSize={CHU.nhan}
            x={giua ? KHUNG.leTrai + o * i + o / 2 : toaDoX(i, moc.length)}
            y={cao - 7}
            textAnchor="middle"
          >
            {m}
          </text>
        ) : null,
      )}
    </g>
  );
}

/**
 * Dải mờ phủ kỳ ĐANG CHẠY.
 *
 * Bắt buộc, không phải trang trí: kỳ đang chạy chưa đủ ngày nên điểm cuối luôn
 * thấp hơn thực tế, và không đánh dấu thì mọi đường đều trông như đang rơi ở
 * đoạn cuối — mỗi kỳ một lần, đều đặn.
 */
const DaiDangChay = ({ n, cao }: { n: number; cao: number }) => {
  const o = oCot(n);
  return (
    <rect
      className="bd-dang-chay"
      x={KHUNG.rong - KHUNG.lePhai - o}
      y={KHUNG.leTren}
      width={o}
      height={cao - KHUNG.leDuoi - KHUNG.leTren}
      aria-hidden="true"
    />
  );
};

export function Duong({
  moc,
  chuoi,
  cao = 180,
  moTa,
  dinhDang,
  dangChay = true,
}: {
  moc: string[];
  chuoi: Chuoi[];
  cao?: number;
  moTa: string;
  dinhDang?: (v: number) => string;
  dangChay?: boolean;
}) {
  const max = tran(Math.max(0, ...chuoi.flatMap((c) => c.diem)) * 1.08);
  return (
    <KhungVe cao={cao} moTa={moTa}>
      <Luoi max={max} cao={cao} {...(dinhDang ? { dinhDang } : {})} />
      {chuoi.map((c) => (
        <g key={c.nhan} className={c.mau}>
          {c.vung && <polygon className="bd-vung" points={vungDuoi(c.diem, max, cao)} />}
          <polyline className={c.mo ? 'bd-net-mo' : 'bd-net'} points={duongGap(c.diem, max, cao)} />
          {!c.mo && c.diem.length > 0 && (
            <circle
              className="bd-cham"
              cx={toaDoX(c.diem.length - 1, c.diem.length)}
              cy={toaDoY(c.diem[c.diem.length - 1] ?? 0, max, cao)}
              r={3.5}
            />
          )}
        </g>
      ))}
      {dangChay && <DaiDangChay n={moc.length} cao={cao} />}
      <line
        className="bd-truc"
        x1={KHUNG.leTrai}
        y1={cao - KHUNG.leDuoi}
        x2={KHUNG.rong - KHUNG.lePhai}
        y2={cao - KHUNG.leDuoi}
      />
      <NhanTruc moc={moc} cao={cao} />
    </KhungVe>
  );
}

export function Cot({
  moc,
  lop,
  cao = 180,
  nhom = false,
  moTa,
  dinhDang,
  dangChay = true,
}: {
  moc: string[];
  lop: Chuoi[];
  cao?: number;
  /** Cột đứng cạnh nhau thay vì chồng lên nhau. */
  nhom?: boolean;
  moTa: string;
  dinhDang?: (v: number) => string;
  dangChay?: boolean;
}) {
  const n = moc.length;
  const diem = lop.map((l) => l.diem);
  const max = tran(
    (nhom ? Math.max(0, ...diem.flat()) : Math.max(0, ...tongChong(diem, n))) * 1.12,
  );
  const o = oCot(n);
  const rong = o * 0.62;
  const day = cao - KHUNG.leDuoi;

  return (
    <KhungVe cao={cao} moTa={moTa}>
      <Luoi max={max} cao={cao} {...(dinhDang ? { dinhDang } : {})} />
      {moc.map((m, i) => {
        const x = KHUNG.leTrai + o * i + (o - rong) / 2;
        const cuoi = i === n - 1 && dangChay;
        const mocDay = chong(diem, i);
        return (
          <g key={m} className={cuoi ? 'bd-cot-dang-chay' : undefined} aria-hidden="true">
            {lop.map((l, j) => {
              const v = l.diem[i] ?? 0;
              if (v <= 0) return null;
              // Cột chồng: đoạn này chạy từ mốc đáy của nó tới mốc đáy cộng giá
              // trị. Tính bằng HAI lần đổi toạ độ chứ không bằng một phép trừ
              // trên chiều cao — trục có thể không tuyến tính về sau, và một
              // phép trừ chiều cao thì im lặng sai ở đúng lúc ấy.
              const day0 = nhom ? 0 : (mocDay[j] ?? 0);
              const yTren = toaDoY(day0 + v, max, cao);
              const h = toaDoY(day0, max, cao) - yTren;
              const rongCon = nhom ? rong / lop.length : rong;
              return (
                <rect
                  key={l.nhan}
                  className={`bd-o ${l.mau}`}
                  x={nhom ? x + rongCon * j : x}
                  y={yTren}
                  width={Math.max(nhom ? rongCon - 1.5 : rongCon, 0.5)}
                  height={Math.max(h, 0)}
                  rx={1.5}
                />
              );
            })}
          </g>
        );
      })}
      <line className="bd-truc" x1={KHUNG.leTrai} y1={day} x2={KHUNG.rong - KHUNG.lePhai} y2={day} />
      <NhanTruc moc={moc} cao={cao} giua />
    </KhungVe>
  );
}

export function Pheu({
  buoc,
  moTa,
}: {
  buoc: { ten: string; so: number; mau: string }[];
  moTa: string;
}) {
  const cao = buoc.length * 46 + 14;
  const max = Math.max(1, buoc[0]?.so ?? 1);
  const xTen = 118;
  return (
    <KhungVe cao={cao} moTa={moTa}>
      {buoc.map((b, i) => {
        const y = i * 46 + 6;
        const rong = (b.so / max) * (KHUNG.rong - 150);
        const hut = i > 0 ? (buoc[i - 1]?.so ?? 0) - b.so : 0;
        return (
          <g key={b.ten}>
            <text className="bd-ten" fontSize={CHU.ten} x={xTen - 8} y={y + 19} textAnchor="end">
              {b.ten}
            </text>
            <rect className={`bd-o ${b.mau}`} x={xTen} y={y} width={Math.max(rong, 1)} height={26} rx={4} />
            <text className="bd-ten" fontSize={CHU.ten} x={xTen + rong + 8} y={y + 18}>
              {b.so}
            </text>
            {hut > 0 && (
              <text className="bd-hut" fontSize={CHU.nhan} x={KHUNG.rong - 4} y={y + 18} textAnchor="end">
                −{hut}
              </text>
            )}
          </g>
        );
      })}
    </KhungVe>
  );
}

export function ThanhNguong({
  phan,
  nguong,
  nhanNguong,
  tong,
  donVi = 'ngày',
  moTa,
}: {
  phan: { so: number; mau: string; nhan: string }[];
  nguong: number;
  nhanNguong: string;
  tong: number;
  donVi?: string;
  moTa: string;
}) {
  const cao = 96;
  const x0 = 8;
  const x1 = KHUNG.rong - 8;
  const y = 30;
  const daiThanh = 30;
  // Trần luôn RỘNG HƠN ngưỡng: vạch ngưỡng phải nằm trong khung, nếu không thì
  // một tổng đang an toàn lại trông như đã chạm hạn.
  const max = Math.max(nguong * 1.15, tong * 1.1, 1);
  let day = 0;

  return (
    <KhungVe cao={cao} moTa={moTa}>
      <rect className="bd-nen" x={x0} y={y} width={x1 - x0} height={daiThanh} rx={5} />
      {phan.map((p) => {
        const w = (p.so / max) * (x1 - x0);
        const x = x0 + day;
        day += w;
        return (
          <g key={p.nhan}>
            <rect className={`bd-o ${p.mau}`} x={x} y={y} width={Math.max(w, 0)} height={daiThanh} rx={3} />
            {w > 34 && (
              <text className="bd-trong-o" fontSize={CHU.trongO} x={x + w / 2} y={y + 19} textAnchor="middle">
                {String(p.so).replace('.', ',')}
              </text>
            )}
          </g>
        );
      })}
      <line
        className="bd-vach-nguong"
        x1={x0 + (nguong / max) * (x1 - x0)}
        y1={y - 10}
        x2={x0 + (nguong / max) * (x1 - x0)}
        y2={y + daiThanh + 8}
      />
      <text
        className="bd-nhan-nguong"
        fontSize={CHU.trongO}
        x={x0 + (nguong / max) * (x1 - x0)}
        y={y - 15}
        textAnchor="middle"
      >
        {nhanNguong}
      </text>
      <text className="bd-ten" fontSize={CHU.ten} x={x0} y={y + daiThanh + 22}>
        {`Tổng ${String(tong).replace('.', ',')} ${donVi}`}
      </text>
    </KhungVe>
  );
}

export function PhanTan({
  diem,
  nhanX,
  nhanY,
  moTa,
  vungTot = true,
}: {
  diem: { ten: string; x: number; y: number; r: number }[];
  nhanX: string;
  nhanY: (v: number) => string;
  moTa: string;
  vungTot?: boolean;
}) {
  const cao = 300;
  const mx = tran(Math.max(1, ...diem.map((d) => d.x)) * 1.15);
  const my = tran(Math.max(1, ...diem.map((d) => d.y)) * 1.2);
  const x0 = KHUNG.leTrai + 4;
  const x1 = KHUNG.rong - 12;
  const y1 = cao - 30;
  const rMax = Math.max(1, ...diem.map((d) => d.r));

  return (
    <KhungVe cao={cao} moTa={moTa}>
      {/* Vùng "nên nằm": làm nhiều, ít bị trả lại. Một mảng nhạt thay cho một
          câu giải thích — nhìn là biết mình đang ở đâu so với chỗ nên ở. */}
      {vungTot && (
        <rect
          className="bd-vung-tot"
          x={x0 + (x1 - x0) * 0.42}
          y={KHUNG.leTren}
          width={(x1 - x0) * 0.58}
          height={(y1 - KHUNG.leTren) * 0.58}
          rx={6}
          aria-hidden="true"
        />
      )}
      <Luoi max={my} cao={cao} dinhDang={nhanY} />
      <line className="bd-truc" x1={KHUNG.leTrai} y1={y1} x2={x1} y2={y1} />
      {diem.map((d) => {
        const cx = x0 + (d.x / mx) * (x1 - x0);
        const cy = toaDoY(d.y, my, cao);
        const r = 5 + (d.r / rMax) * 9;
        return (
          <g key={d.ten} className={d.y > my * 0.5 ? 'bd-xau' : 'bd-1'}>
            <circle className="bd-quang" cx={cx} cy={cy} r={r} />
            <circle className="bd-cham" cx={cx} cy={cy} r={3.2} />
            <text className="bd-ten-nho" fontSize={CHU.nho} x={cx + r + 4} y={cy + 4}>
              {d.ten}
            </text>
          </g>
        );
      })}
      <text className="bd-tri" fontSize={CHU.nho} x={x1} y={cao - 10} textAnchor="end">
        {nhanX}
      </text>
    </KhungVe>
  );
}

/** Đường nhỏ trong một dòng bảng — không trục, không nhãn, chỉ hình dạng. */
export function DuongNho({ diem, moTa }: { diem: number[]; moTa: string }) {
  const rong = 62;
  const cao = 20;
  const max = Math.max(...diem);
  const min = Math.min(...diem);
  const dai = max - min || 1;
  const diemVe = diem
    .map((v, i) => `${((i * rong) / Math.max(diem.length - 1, 1)).toFixed(1)},${(cao - 2 - ((v - min) / dai) * (cao - 5)).toFixed(1)}`)
    .join(' ');
  const cuoi = diem[diem.length - 1] ?? 0;
  const truoc = diem[diem.length - 2] ?? cuoi;

  return (
    <svg className="bd bd-nho" viewBox={`0 0 ${rong} ${cao}`} role="img" aria-label={moTa} focusable="false">
      <polyline className="bd-net-nho" points={diemVe} />
      <circle
        className={cuoi >= truoc ? 'bd-cham bd-tot' : 'bd-cham bd-xau'}
        cx={rong}
        cy={cao - 2 - ((cuoi - min) / dai) * (cao - 5)}
        r={2.4}
      />
    </svg>
  );
}

/**
 * Thanh ngang một giá trị mỗi dòng — so người với người theo đúng một con số.
 *
 * Dùng khi con số ấy CÓ NGƯỠNG (số ngày sửa lại, so với mốc "quá 5 ngày là
 * chậm"): vạch ngưỡng biến một danh sách số thành một câu trả lời có/không, và
 * dòng nào vượt thì tự đổi màu.
 */
export function ThanhNgang({
  dong,
  nguong,
  nhanNguong,
  moTa,
}: {
  dong: { ten: string; so: number }[];
  nguong?: number;
  nhanNguong?: string;
  moTa: string;
}) {
  const cao = dong.length * 30 + 24;
  const max = tran(Math.max(1, ...dong.map((d) => d.so), nguong ?? 0) * 1.1);
  const x0 = 104;
  const x1 = KHUNG.rong - 46;
  const xNguong = nguong === undefined ? 0 : x0 + (nguong / max) * (x1 - x0);

  return (
    <KhungVe cao={cao} moTa={moTa}>
      {nguong !== undefined && (
        <g aria-hidden="true">
          <line className="bd-vach-nguong" x1={xNguong} y1={4} x2={xNguong} y2={cao - 20} />
          <text className="bd-nhan-nguong" fontSize={CHU.nhan} x={xNguong} y={cao - 6} textAnchor="middle">
            {nhanNguong}
          </text>
        </g>
      )}
      {dong.map((d, i) => {
        const y = 8 + i * 30;
        const w = (d.so / max) * (x1 - x0);
        return (
          <g key={d.ten} className={nguong !== undefined && d.so > nguong ? 'bd-xau' : 'bd-1'}>
            <text className="bd-ten" fontSize={CHU.ten} x={x0 - 10} y={y + 13} textAnchor="end">
              {d.ten}
            </text>
            <rect className="bd-o-mo" x={x0} y={y} width={Math.max(w, 1)} height={17} rx={3} />
            <text className="bd-ten" fontSize={CHU.ten} x={x0 + w + 7} y={y + 13}>
              {String(d.so).replace('.', ',')}
            </text>
          </g>
        );
      })}
    </KhungVe>
  );
}

/** Thanh 100% chia đoạn — cơ cấu, KHÔNG phải số tuyệt đối. */
export function ThanhTyLe({
  phan,
  moTa,
}: {
  phan: { so: number; mau: string; nhan: string }[];
  moTa: string;
}) {
  const tyLe = tyLeDoan(phan.map((p) => p.so));
  const tong = phan.reduce((a, p) => a + p.so, 0);
  if (tong === 0) return <span className="bd-thanh-trong">chưa gửi hồ sơ nào</span>;
  return (
    <span className="bd-thanh-chia" role="img" aria-label={moTa}>
      {phan.map((p, i) => (
        <i
          key={p.nhan}
          className={p.mau}
          style={{ width: `${(tyLe[i] ?? 0).toFixed(1)}%` }}
          title={`${p.nhan}: ${p.so}`}
        />
      ))}
    </span>
  );
}
