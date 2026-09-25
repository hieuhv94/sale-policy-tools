/**
 * Những mảnh dùng lại khắp nơi.
 *
 * Không dùng thư viện component. Xem lý do ở `router.tsx` và ở nhật ký P7d:
 * trần 250KB nén của `FE-38`, cộng với việc `FE-19` cấm màu nằm ngoài bảng token
 * — mà mọi thư viện component đều mang bảng màu riêng của nó.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { docLoi } from '../lib/loi.js';
import { nhanTrangThai, nhomTrangThai, tien } from '../lib/format.js';
import { isoTuNgay, matNaNgay, ngayTuIso } from '../lib/ngay-nhap.js';
import {
  MAU_TRANG_THAI_SAN_PHAM,
  NHAN_TRANG_THAI_SAN_PHAM,
  type TrangThaiSanPham,
} from '../lib/danh-muc.js';
import { Lien } from '../lib/router.js';
import { BieuTuongMat, BieuTuongMatGach } from './BieuTuong.js';

/**
 * Ô MẬT KHẨU có nút con mắt để hiện/ẩn chữ đang gõ (`0222`).
 *
 * MỘT component cho mọi ô mật khẩu của ứng dụng — sáu ô ở ba màn hình. Viết
 * tay nút ở từng chỗ là ô thứ bảy ai đó thêm sau này thiếu nút mà không gì đỏ;
 * có ca kiểm quét mã nguồn cấm `type="password"` nằm ngoài tệp này.
 *
 * Nút là `<button type="button">`: thiếu `type` thì trong `<form>` nó là nút
 * GỬI, và bấm con mắt ở màn hình đăng nhập là gửi luôn biểu mẫu. `aria-pressed`
 * cộng nhãn đổi theo trạng thái để trình đọc màn hình biết đang hiện hay ẩn —
 * hình con mắt là `aria-hidden` như mọi biểu tượng khác.
 *
 * Nút VẪN nhận `Tab`: người dùng bàn phím cũng cần kiểm lại chữ mình gõ. Mỗi ô
 * giữ trạng thái riêng — hiện ô *Mật khẩu mới* không kéo theo ô *Nhập lại*,
 * vì ô ấy tồn tại chính là để gõ lại mà không nhìn.
 */
export function OMatKhau({
  giaTri,
  doi,
  autoComplete,
  ...rest
}: {
  giaTri: string;
  doi: (s: string) => void;
  autoComplete: 'current-password' | 'new-password';
  id: string;
} & Record<string, unknown>) {
  const [hien, datHien] = useState(false);
  return (
    <span className="hang-o-mat-khau">
      <input
        {...rest}
        className="o-nhap"
        type={hien ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={giaTri}
        onChange={(e) => doi(e.target.value)}
      />
      <button
        type="button"
        className="nut-mat-khau"
        aria-pressed={hien}
        aria-label={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        title={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        onClick={() => datHien((h) => !h)}
      >
        {hien ? <BieuTuongMatGach /> : <BieuTuongMat />}
      </button>
    </span>
  );
}

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
 * Nhãn trạng thái SẢN PHẨM — xanh đang áp dụng, đỏ đã vô hiệu hoá (`0123`).
 *
 * Thành phần riêng chứ không dùng lại `Nhan` ở trên: hai bảng tra khác nhau hoàn
 * toàn — `nhomTrangThai` chỉ biết mười một trạng thái HỒ SƠ, và ném một trạng
 * thái sản phẩm vào đó thì nó rơi vào nhánh dự phòng và ra màu xám. Trùng nhau ở
 * chỗ hai KHOÁ MÀU, và đó là chủ ý.
 */
export function NhanSanPham({ trangThai }: { trangThai: TrangThaiSanPham }) {
  return (
    <span className={`nhan nhan-${MAU_TRANG_THAI_SAN_PHAM[trangThai]}`}>
      {NHAN_TRANG_THAI_SAN_PHAM[trangThai]}
    </span>
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
  /**
   * Hậu tố lớp CSS của vạch màu — `chi-so-<kieu>` (`0064`).
   *
   * Kiểu `string` chứ không phải liên kết năm giá trị: từ `0064` mỗi trạng thái
   * hồ sơ có một màu riêng, và danh sách ấy sống ở `tokens.css` với
   * `nhomTrangThai()`. Chép nó thành một union thứ hai ở đây là dựng bản sao
   * phải giữ đồng bộ, mà lệch thì chỉ mất màu chứ không ai biết.
   * `nguon-giao-dien.test.ts` canh: mọi khoá `mauThe()` trả về đều có lớp thật.
   */
  kieu?: string;
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
 * Lỗi Ở LẠI TRÊN TRANG — dạng `trang` của `0088`.
 *
 * Dùng đúng một việc: **không tải được thứ để dựng màn hình**. Hộp thoại sai ở
 * đây vì đóng nó xong thì phía sau là trang trắng; khối này ở lại, và mang theo
 * nút *Thử lại*.
 *
 * Lỗi của một lần BẤM thì không đi qua đây nữa — nó gọi `useBaoLoi().bao()` và
 * bảng tra quyết định hộp thoại hay thanh nổi.
 *
 * Câu chữ lấy từ `docLoi()`, cùng bảng tra với hộp thoại và thanh nổi. Trước
 * `0088` chỗ này in thẳng `l.message`, nên nó là một trong những đường đưa
 * *"Yêu cầu không hợp lệ."* ra màn hình.
 *
 * Phân biệt lỗi MẠNG với lỗi nghiệp vụ vẫn giữ (`FE-32`): lỗi mạng thì dữ liệu
 * đang nhập vẫn đúng và chỉ cần bấm thử lại — không nói rõ thì người dùng tự
 * nhập lại từ đầu cho chắc.
 */
export function BaoLoi({ loi, thuLai }: { loi: unknown; thuLai?: () => void }) {
  const d = docLoi(loi);
  return (
    <div className={d.laLoiMang ? 'bao-loi mang' : 'bao-loi'} role="alert">
      <p className="bao-loi-chinh">{d.cau}</p>
      {d.laLoiMang && <p className="bao-loi-phu">Dữ liệu bạn đã nhập vẫn được giữ nguyên.</p>}
      {d.chiTiet && <p className="bao-loi-phu">{d.chiTiet}</p>}
      {d.traceId && <p className="bao-loi-ma">Mã tra cứu: {d.traceId}</p>}
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
 *
 * KHÔNG ĐỘNG VÀO CHỮ NGƯỜI DÙNG ĐANG GÕ (`0087`). Tới `0087` ô này chèn dấu
 * phân nhóm ngay giữa lúc gõ: gõ `1000` thì ô tự thành `1.000`, tức là mỗi vài
 * phím lại có một ký tự lạ mọc ra giữa chuỗi. Bộ gõ tiếng Việt giữ một bộ đệm
 * riêng cho từ đang gõ và sửa chữ bằng cách gửi phím xoá lùi; ô nhập tự chèn
 * thêm ký tự là bộ đệm ấy lệch khỏi thứ đang nằm trên màn hình, nên lượt xoá
 * lùi kế tiếp ăn nhầm **chữ số** thay vì dấu chấm — người dùng gõ đủ bảy phím
 * mà số tiền ra thiếu hoặc thừa chữ số, và không cách nào đoán ra vì sao.
 *
 * Nên chia đôi theo trạng thái:
 *
 *   - **Đang gõ** (ô có con trỏ): hiện đúng chuỗi số trần người dùng gõ, không
 *     chèn gì. Con số phân nhóm nằm ở dòng chú thích ngay dưới ô.
 *   - **Rời ô**: ô hiện số đã phân nhóm.
 *
 * Điều `0009` bảo vệ vẫn còn: người nhập 90000 vẫn đọc được ngay là chín mươi
 * nghìn chứ không phải chín trăm nghìn — đếm số 0 bằng mắt là chỗ sai tiền
 * nhiều nhất và nó sai theo bội số của mười. Chỉ khác chỗ ĐẶT con số ấy: một
 * dòng chú thích cạnh ô, thay vì viết đè lên thứ người dùng đang gõ.
 *
 * Bộ gõ còn được đối xử như ở `OTimKiem` (`FE-31`): trong lúc `compositionstart`
 * → `compositionend` thì không lọc, không định dạng, không báo ra ngoài. Lọc
 * giữa chừng là cắt mất ký tự trung gian mà bộ gõ cần để bỏ dấu.
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
  const [dangGo, datDangGo] = useState(false);
  /** Chuỗi thô trong lúc bộ gõ đang soạn — `null` là không soạn dở gì. */
  const [dangSoanChu, datDangSoanChu] = useState<string | null>(null);
  const dangSoan = useRef(false);

  const nhom = tien(giaTri) === '—' ? '' : tien(giaTri);
  const hienThi = dangSoanChu ?? (dangGo ? giaTri : nhom);

  const bao = (v: string) => doi(v.replace(/[^\d]/g, ''));

  /**
   * Gọi tiếp trình xử lý mà nơi dùng truyền vào, nếu có.
   *
   * Bốn chỗ đang dùng ô này đều không truyền `onFocus`/`onBlur`, nhưng chúng
   * nằm trong `{...rest}` nên nếu có thì bản này ghi đè và nuốt mất — đúng loại
   * hỏng không ai thấy cho tới khi một biểu mẫu cần `onBlur` để kiểm dữ liệu.
   */
  const goiThem = (ten: string, e: unknown) => {
    const f = rest[ten];
    if (typeof f === 'function') (f as (x: unknown) => void)(e);
  };

  return (
    <>
      <input
        {...rest}
        id={id}
        className="o-nhap so"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={hienThi}
        onFocus={(e) => {
          datDangGo(true);
          goiThem('onFocus', e);
        }}
        onBlur={(e) => {
          datDangGo(false);
          datDangSoanChu(null);
          goiThem('onBlur', e);
        }}
        onCompositionStart={() => {
          dangSoan.current = true;
        }}
        onCompositionEnd={(e) => {
          dangSoan.current = false;
          datDangSoanChu(null);
          bao(e.currentTarget.value);
        }}
        onChange={(e) => {
          if (dangSoan.current) {
            datDangSoanChu(e.target.value);
            return;
          }
          bao(e.target.value);
        }}
      />
      {/*
        Dòng đọc số, chỉ hiện lúc đang gõ — rời ô là chính ô đã phân nhóm rồi,
        để lại thì thành hai lần cùng một con số.

        `aria-hidden` vì nó phục vụ MẮT: trình đọc màn hình đọc `90000` trong ô
        ra thành "chín mươi nghìn" sẵn, thêm một dòng nữa là đọc lặp.
      */}
      {dangGo && giaTri !== '' && (
        // Không kèm chữ "đ": nhãn của `Truong` đã nói đơn vị, và lặp lại ở đây
        // là hai lần cùng một thông tin trên hai dòng liền nhau.
        <p className="doc-so" aria-hidden="true">
          {nhom}
        </p>
      )}
    </>
  );
}

/**
 * Ô NHẬP NGÀY — luôn `dd/mm/yyyy`, trên mọi máy (`0208`, khách hàng chốt 20/09).
 *
 * Thay cho `<input type="date">`. Đo trên Chromium thật: ô sẵn có của trình
 * duyệt in ra `09/20/2026` **kể cả khi khai `lang="vi"`**, vì nó đọc ngôn ngữ
 * GIAO DIỆN của trình duyệt chứ không đọc tài liệu. Lý lẽ đầy đủ ở `ngay-nhap.ts`.
 *
 * ---------------------------------------------------------------------------
 * VÀO RA VẪN LÀ CHUỖI ISO
 * ---------------------------------------------------------------------------
 *
 * `giaTri` và `doi()` nói `yyyy-mm-dd`, đúng như ô cũ. Sáu chỗ dùng không đổi
 * một dòng state nào, và máy chủ cũng vậy — thứ đổi chỉ là hình dạng trên màn
 * hình. Gõ dở hoặc gõ một ngày không có thật (31/02) thì `doi('')`: *"chưa gõ"*
 * và *"gõ sai"* cùng nghĩa **chưa có ngày nào để gửi đi**, và mọi phép kiểm bắt
 * buộc sẵn có đọc đúng chuỗi rỗng ấy.
 *
 * ---------------------------------------------------------------------------
 * HAI CHỖ DỄ HỎNG, VÀ CÁCH ĐÓNG
 * ---------------------------------------------------------------------------
 *
 * **Chèn dấu gạch chỉ khi con trỏ ở CUỐI ô.** Sửa một chữ số ở giữa mà vẫn dựng
 * lại cả chuỗi thì con trỏ nhảy về cuối sau mỗi phím — lỗi kinh điển của ô có
 * mặt nạ. Ở giữa thì để nguyên chữ người dùng gõ, rời ô mới nắn lại. Đây cũng
 * là hình dạng an toàn của bài học `0087` (ô tiền thôi chèn dấu giữa lúc gõ).
 *
 * **Ô `type="date"` ẩn KHÔNG được `display: none`.** `showPicker()` đòi phần tử
 * đang được dựng; ẩn hẳn thì trình duyệt ném lỗi và cái nút thành nút chết. Nó
 * ẩn bằng kích thước và `opacity` (`.o-ngay-lich`), đứng ngoài luồng `Tab`.
 *
 * Nút lịch chỉ hiện khi trình duyệt CÓ `showPicker` (Safari 16+, Firefox 101+).
 * Thiếu thì không bày ra một cái nút bấm vào không xảy ra gì — ô chữ vẫn gõ
 * được, và đó là đường chính chứ không phải đường lùi.
 */
export function ONhapNgay({
  id,
  giaTri,
  doi,
  min,
  max,
  ...rest
}: {
  id: string;
  /** `yyyy-mm-dd`, hoặc rỗng. */
  giaTri: string;
  doi: (iso: string) => void;
  min?: string | undefined;
  max?: string | undefined;
} & Record<string, unknown>) {
  const [chu, datChu] = useState(() => ngayTuIso(giaTri));
  /** Chuỗi ISO mà chính ô này vừa báo ra — để không tự nắn lại chữ đang gõ. */
  const vuaPhat = useRef(giaTri);
  const oLich = useRef<HTMLInputElement>(null);
  const [coLich] = useState(
    () => typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype,
  );

  /*
   * Đồng bộ TỪ NGOÀI VÀO, và chỉ khi giá trị ấy không phải thứ mình vừa báo ra.
   * Thiếu vế sau thì mỗi phím gõ dở (`20/0` → `doi('')`) làm nơi dùng đặt lại
   * `''`, và ô tự xoá sạch chữ ngay giữa lúc người ta đang gõ.
   */
  useEffect(() => {
    if (giaTri === vuaPhat.current) return;
    vuaPhat.current = giaTri;
    datChu(ngayTuIso(giaTri));
  }, [giaTri]);

  const bao = (s: string) => {
    datChu(s);
    const iso = isoTuNgay(s);
    vuaPhat.current = iso;
    doi(iso);
  };

  return (
    <span className="hang-o-ngay">
      <input
        {...rest}
        id={id}
        className="o-nhap"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={chu}
        onChange={(e) => {
          const o = e.target;
          const cuoi = o.selectionStart === o.value.length;
          bao(cuoi ? matNaNgay(o.value) : o.value);
        }}
        onBlur={() => bao(matNaNgay(chu))}
      />
      {/*
        Ô ẩn CHỈ để mượn bộ chọn lịch của trình duyệt. Nó không nhận `Tab` và
        không có nhãn: người dùng bàn phím đã có ô chữ ngay bên cạnh, còn trình
        đọc màn hình gặp hai ô cho một trường thì đọc thành hai trường.
      */}
      <input
        ref={oLich}
        className="o-ngay-lich"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={giaTri}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => {
          vuaPhat.current = e.target.value;
          datChu(ngayTuIso(e.target.value));
          doi(e.target.value);
        }}
      />
      {coLich && (
        <button
          type="button"
          className="nut-bieu-tuong nut-lich"
          onClick={() => oLich.current?.showPicker?.()}
        >
          <span aria-hidden="true">🗓</span>
          <span className="chi-doc-man-hinh">Chọn ngày trên lịch</span>
        </button>
      )}
    </span>
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
  co = 'thuong',
  tyLe = null,
  caoNoiDung = null,
  giay = false,
  toanManHinh = false,
  children,
}: {
  tieuDe: string;
  dong: () => void;
  /**
   * Bậc bề rộng của hộp — ba bậc, con số ở `tokens.css` (`0129`).
   *
   *   `thuong` biểu mẫu nhập liệu, và mặc định;
   *   `rong`   nội dung hai cột — bảng ánh xạ trường (`0068`);
   *   `to`     nội dung XEM TRƯỚC, gần hết màn hình.
   *
   * Một prop ba giá trị chứ không phải hai cờ `rong`/`to`: hai cờ thì `rong to`
   * cùng bật là một trạng thái viết ra được mà không có nghĩa, và câu trả lời
   * cho nó nằm ở thứ tự các nhánh trong JSX — chỗ không ai nghĩ tới việc đọc.
   *
   * Bậc này KHÔNG có tác dụng khi `tyLe` khác `null`: hộp xem tệp tự tính bề
   * rộng theo tỷ lệ nội dung, xem `.hop-thoai-xem`.
   */
  co?: 'thuong' | 'rong' | 'to';
  /**
   * Tỷ lệ **rộng / cao** của khung xem bên trong — hộp tự khớp theo (`0073`).
   *
   * Bề rộng của hộp phải suy ra TỪ ĐÂY chứ không đặt cứng: khung xem chiếm gần
   * hết hộp, nên một hộp rộng 520px cố định vẽ tờ A4 ngang thành một dải bẹp có
   * hai vệt xám trên dưới, còn tờ A4 dọc thì chữ nhỏ tới mức phải phóng to.
   *
   * Tính bằng CSS chứ không bằng JavaScript: `--ty-le` đi vào `calc()` ở
   * `.hop-thoai-xem`, nên hộp tự co giãn theo cửa sổ mà không cần ai nghe sự
   * kiện `resize` — một vòng đo-rồi-đặt trong JavaScript ở đây là chỗ sinh ra
   * nhấp nháy và vòng lặp bố cục.
   *
   * `null` là hộp thoại thường.
   */
  tyLe?: number | null;
  /**
   * Chiều cao THẬT của nội dung, tính bằng pixel — chỉ ẢNH mới có (`0164`).
   *
   * Khung xem không được cao hơn con số này: yêu cầu viết thẳng *"đối với
   * preview ảnh thì tự điều chỉnh kích thước để fit với kích thước ảnh"*, và
   * một tấm 400×300 kéo lên cao 900px là phóng to gấp ba — mờ theo kiểu người
   * dùng tưởng bản scan bị hỏng.
   *
   * `null` với PDF, và đó KHÔNG phải chỗ trống: PDF là ảnh vector, phóng bao
   * nhiêu cũng nét, nên chặn nó là bỏ phí màn hình. CSS đọc biến này qua
   * `var(--cao-anh, 99999px)` — không đặt là không chặn.
   */
  caoNoiDung?: number | null;
  /**
   * Nội dung là một TỜ GIẤY — PDF do phần mềm dựng ra (`0146`).
   *
   * Hộp giữ MỘT bề rộng cố định (`--rong-hop-thoai-xem`) thay vì suy từ `tyLe`,
   * và tờ giấy phóng to cho vừa. Chỉ đúng với PDF: trình xem PDF của trình duyệt
   * nhận được lệnh *"vừa bề rộng"*, còn một tấm ảnh thì không — nên ảnh vẫn đi
   * đường cũ, bề rộng hộp suy từ số đo của chính nó.
   *
   * `tyLe` VẪN phải truyền kèm: nó mang `--cao-khung` vào khối, thứ quyết định
   * chiều cao khung xem.
   */
  giay?: boolean;
  /**
   * TOÀN MÀN HÌNH — bỏ hẳn khung hộp quanh tài liệu (`0210`, chốt 20/09).
   *
   * Khách hàng xem bản `0164` rồi bảo *"vẫn hơi bé… không cần bọc tài liệu hoặc
   * ảnh trong hộp thoại"*. `0164` đã cắt khoảng hở mà `0130` cố ý chừa ra; thứ
   * còn lại sau đó là **chính cái khung** — viền, bo góc, lề lớp phủ, và cả phép
   * suy bề rộng từ `cao × tỷ lệ` (`0073`) vốn để tờ giấy nằm gọn giữa màn hình.
   * Lượt này bỏ nốt: hộp phủ kín khung nhìn, tài liệu lấy hết phần còn lại.
   *
   * `--ty-le` VẪN được đặt vào, dù nó thôi quyết định bề rộng: `.khung-xem` ở
   * chế độ thường vẫn đọc nó, và hai chế độ dùng chung một component. `--cao-anh`
   * thì đổi việc chứ không mất — xem `.hop-thoai-toan-man .khung-anh img`.
   */
  toanManHinh?: boolean;
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
    <div
      className={`lop-phu${toanManHinh ? ' lop-phu-toan-man' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && dong()}
    >
      <div
        className={
          tyLe !== null
            ? `hop-thoai hop-thoai-xem${giay ? ' hop-thoai-giay' : ''}${
                toanManHinh ? ' hop-thoai-toan-man' : ''
              }`
            : co === 'thuong'
              ? 'hop-thoai'
              : `hop-thoai hop-thoai-${co}`
        }
        role="dialog"
        aria-modal="true"
        aria-label={tieuDe}
        ref={khung}
        /*
          Hai biến, và chỉ đặt biến nào có nghĩa. `--cao-anh` vắng mặt là CSS rơi
          về giá trị lùi trong `var(--cao-anh, 99999px)`, tức không chặn gì —
          đúng ca PDF. Đặt nó bằng một chuỗi rỗng thì `var()` coi như CÓ giá trị
          và `min()` hỏng cả dòng.
        */
        style={
          tyLe !== null
            ? ({
                '--ty-le': String(tyLe),
                ...(caoNoiDung !== null ? { '--cao-anh': `${caoNoiDung}px` } : {}),
              } as CSSProperties)
            : undefined
        }
      >
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

