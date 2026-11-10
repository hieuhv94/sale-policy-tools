/**
 * Lập và sửa khách hàng, và đổi TDV phụ trách.
 *
 * Hai ràng buộc nghiệp vụ được nói thẳng trên biểu mẫu, không giấu trong thông
 * báo lỗi sau khi bấm:
 *
 *   - **Mã khách hàng CHỈ TDV phụ trách sửa được** (`0226`, chốt 28/09). Tới
 *     `0225` mã không sửa được với lý do *"hồ sơ CSBH cũ lặng lẽ trỏ sang khách
 *     khác"* — tiền đề ấy sai: hồ sơ nối với khách bằng `id`, và tờ giấy đã ký
 *     giữ ảnh chụp mã lúc gửi. Người khác thấy ô mã nhưng không gõ được, kèm
 *     một câu nói vì sao — chứ không để họ gõ rồi nhận 403.
 *   - **Trùng mã số thuế thì KHÔNG lập được** (`0175`, chốt 05/09) — đảo hẳn
 *     `CUST-07`. Hỏi máy chủ NGAY LÚC GÕ và báo ngay dưới ô, chứ không đợi lượt
 *     bấm Lưu: người ta gõ xong mã số thuế rồi mới điền nốt mười ô còn lại, và
 *     báo ở cuối là bắt họ làm lại cả biểu mẫu.
 */
import { useEffect, useMemo, useState } from 'react';
import { dang, layJson, va, xoa } from '../lib/api.js';
import {
  CHUC_DANH_DAI_DIEN,
  CHUC_DANH_KHAC,
  DIEU_KHOAN_NO,
  LOAI_KHACH_HANG,
  NHAN_DIEU_KHOAN_NO,
  TINH_THANH,
  gopChucDanh,
  laSoDienThoai,
  nhanLoaiKhach,
  tachChucDanh,
} from '../lib/danh-muc.js';
import { BaoLoi, ChuThichBatBuoc, DangTai, HopThoai, Truong } from './Chung.js';
import { ChonCoGo } from './ChonCoGo.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { usePhien } from '../lib/auth.js';
import { la404 } from '../lib/loi.js';
import { batTinhNang } from '@csbh/domain-policy';

export type KhachHangDayDu = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  /** Bản GỘP — chỉ để hiện. Sửa thì dùng hai ô dưới (`0154`, `0175`). */
  registeredAddress: string;
  deliveryAddress: string | null;
  /** Địa chỉ đăng ký, HAI Ô và chỉ một địa chỉ (`0175`). */
  province: string;
  streetWard: string;
  registeredAddresses: string[];
  deliveryAddresses: string[];
  ownerName: string;
  ownerTitle: string | null;
  phone: string | null;
  idNumber: string | null;
  /** Câu chữ đã dựng xong — chỉ để hiện, không sửa qua ô này (`0138`). */
  debt: string;
  debtTerm: string;
  debtNote: string | null;
  tdvUserId: string | null;
  /** `DANG_HOP_TAC` | `NGUNG_HOP_TAC` (`0034`). */
  status: string;
};

type Gia = {
  code: string;
  name: string;
  customerType: string;
  province: string;
  streetWard: string;
  /*
   * MẢNG, và ô rỗng ĐƯỢC PHÉP tồn tại trong lúc gõ (`0154`).
   *
   * Người dùng bấm *Thêm địa chỉ* là có ngay một ô trống — lọc nó đi ở tầng
   * trạng thái thì ô vừa thêm biến mất ngay khi vừa hiện ra. Phép lọc nằm ở
   * lượt GỬI, không ở lượt gõ. Chỉ còn địa chỉ GIAO HÀNG là danh sách (`0175`).
   */
  deliveryAddresses: string[];
  ownerName: string;
  /** Mục đang chọn của ô chức danh: một mục của danh sách, `CHUC_DANH_KHAC`, hoặc rỗng (`0223`). */
  ownerTitleChon: string;
  /** Chữ tự gõ khi chọn *Khác*. */
  ownerTitleKhac: string;
  phone: string;
  idNumber: string;
  debtTerm: string;
  debtNote: string;
};

const rong: Gia = {
  code: '',
  name: '',
  customerType: '1',
  province: '',
  streetWard: '',
  deliveryAddresses: [],
  ownerName: '',
  ownerTitleChon: '',
  ownerTitleKhac: '',
  phone: '',
  idNumber: '',
  debtTerm: 'SAU_NHAN_HANG',
  debtNote: '',
};

const tuDto = (k: KhachHangDayDu): Gia => ({
  code: k.code,
  name: k.name,
  customerType: String(k.customerType),
  /*
   * Khách hàng lập TRƯỚC `0175` có thể còn ô tỉnh/thành RỖNG: migration chỉ tách
   * được địa chỉ cũ khi đoạn cuối mở đầu bằng "Thành phố", "Tỉnh" hay "TP". Ô
   * rỗng ấy hiện ra ở đây, và biểu mẫu khai nó bắt buộc — nên lượt sửa tiếp theo
   * của khách hàng ấy là lượt lấp chỗ trống.
   *
   * (Không viết `*Thành phố*` kiểu in nghiêng ở đây: dấu sao đứng cạnh dấu gạch
   *  chéo đóng luôn khối chú thích, và `tsc` báo lỗi ở ba dòng phía dưới.)
   */
  province: k.province,
  streetWard: k.streetWard,
  deliveryAddresses: k.deliveryAddresses,
  ownerName: k.ownerName,
  ...(() => {
    const { chon, khac } = tachChucDanh(k.ownerTitle ?? '');
    return { ownerTitleChon: chon, ownerTitleKhac: khac };
  })(),
  phone: k.phone ?? '',
  idNumber: k.idNumber ?? '',
  debtTerm: k.debtTerm,
  debtNote: k.debtNote ?? '',
});

/**
 * Một nhóm ô địa chỉ, thêm và bớt được (`0154`).
 *
 * MỖI Ô MỘT NHÃN RIÊNG — *Địa chỉ đăng ký 1*, *2*, *3* — chứ không một nhãn
 * chung cho cả nhóm. `Truong` nối `<label>` với `<input>` bằng `id`, và ba ô
 * dùng chung một `id` là ba ô mà trình đọc màn hình đọc thành cùng một tên;
 * người dùng bàn phím nghe "Địa chỉ đăng ký" ba lần mà không biết mình đang ở ô
 * nào. Con số trong nhãn cũng chính là thứ tự in ra giấy.
 *
 * NÚT XOÁ chỉ hiện khi còn nhiều hơn một ô ở nhóm BẮT BUỘC: xoá tới ô cuối cùng
 * là dựng ra một biểu mẫu không lưu được, và nút gây ra chuyện đó không nên có.
 * Nhóm không bắt buộc thì xoá hết được — mảng rỗng là *"không khai nơi nhận
 * riêng"*, một câu trả lời hợp lệ.
 */
function NhomDiaChi({
  id,
  nhan,
  ds,
  doi,
  themNhan,
  goiY,
  bắtBuộc = false,
}: {
  id: string;
  nhan: string;
  ds: string[];
  doi: (ds: string[]) => void;
  themNhan: string;
  goiY?: string;
  bắtBuộc?: boolean;
}) {
  const dat = (i: number, v: string) => doi(ds.map((x, k) => (k === i ? v : x)));
  const xoa = (i: number) => doi(ds.filter((_, k) => k !== i));
  const xoaDuoc = bắtBuộc ? ds.length > 1 : ds.length > 0;

  return (
    <div className="nhom-dia-chi">
      {ds.map((v, i) => (
        <div className="hang-dia-chi" key={i}>
          <Truong
            id={`${id}-${i}`}
            nhan={ds.length > 1 ? `${nhan} ${i + 1}` : nhan}
            {...(bắtBuộc && i === 0 ? { bắtBuộc: true } : {})}
          >
            {(p) => (
              <input
                {...p}
                className="o-nhap"
                value={v}
                {...(goiY !== undefined && i === 0 ? { placeholder: goiY } : {})}
                onChange={(e) => dat(i, e.target.value)}
              />
            )}
          </Truong>
          {xoaDuoc && (
            <button
              type="button"
              className="nut nut-nhe nut-xoa-dia-chi"
              onClick={() => xoa(i)}
              /* Nhãn mang SỐ THỨ TỰ: ba nút cùng tên "Xoá" là ba nút mà người
                 dùng bàn phím không phân biệt được cái nào xoá dòng nào. */
              aria-label={`Xoá ${nhan.toLowerCase()} ${i + 1}`}
            >
              Xoá
            </button>
          )}
        </div>
      ))}
      {/* `nut-them-dia-chi` — ôm lấy chữ và thẳng mép trái với ô nhập (`0175`).
          Thiếu nó thì nút kéo giãn hết bề ngang cột flex và trông như một khối. */}
      <button
        type="button"
        className="nut nut-nhe nut-them-dia-chi"
        onClick={() => doi([...ds, ''])}
      >
        {themNhan}
      </button>
    </div>
  );
}

export function BieuMauKhachHang({
  khach,
  dong,
  xong,
}: {
  /** Có thì là SỬA, không có thì là LẬP MỚI. */
  khach?: KhachHangDayDu | undefined;
  dong: () => void;
  xong: (id: string) => void;
}) {
  const { bao } = useBaoLoi();
  const { nguoiDung } = usePhien();
  const [g, datG] = useState<Gia>(khach ? tuDto(khach) : rong);
  /**
   * Người đang mở biểu mẫu có sửa được MÃ không (`0226`) — lập mới thì luôn có;
   * sửa thì chỉ TDV phụ trách. Máy chủ chốt cùng luật (`assertChinhTdv`).
   */
  const laTdvPhuTrach = khach !== undefined && nguoiDung?.id === khach.tdvUserId;

  /**
   * CSBH đang hiệu lực của khách (`0226`, bổ sung 28/09) — có thì mã KHOÁ.
   *
   *   `'dang-hoi'` — chưa biết; ô mã xám trong lúc hỏi, không mở rồi đóng lại.
   *   `null`       — hỏi rồi, không có (404): mở ô mã.
   *   `{ code }`   — có: khoá, và nói ra mã hồ sơ.
   *   `'khong-ro'` — hỏi hỏng: khoá. Máy chủ cũng từ chối khi không hỏi được
   *                  `policy` (fail closed), nên mở ô ở đây là hứa một lượt Lưu
   *                  chắc chắn hỏng.
   *
   * Chỉ hỏi khi người mở LÀ TDV phụ trách — người khác không sửa được mã bất kể
   * câu trả lời, nên hỏi là một vòng mạng thừa.
   */
  const [hieuLuc, datHieuLuc] = useState<'dang-hoi' | null | { code: string } | 'khong-ro'>(
    'dang-hoi',
  );
  useEffect(() => {
    if (!khach || !laTdvPhuTrach) return;
    const huy = new AbortController();
    layJson<{ code: string }>(
      `/policies/current?customerId=${encodeURIComponent(khach.id)}`,
      huy.signal,
    )
      .then((h) => datHieuLuc({ code: h.code }))
      .catch((e: unknown) => {
        if (huy.signal.aborted) return;
        // 404 là câu trả lời "chưa có CSBH nào đang hiệu lực" (`0089`).
        datHieuLuc(la404(e) ? null : 'khong-ro');
      });
    return () => huy.abort();
  }, [khach, laTdvPhuTrach]);

  const suaDuocMa = khach === undefined || (laTdvPhuTrach && hieuLuc === null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const sua = (p: Partial<Gia>) => datG((cu) => ({ ...cu, ...p }));

  /**
   * Khách hàng đang giữ mã số thuế vừa gõ, hoặc `null` (`0175`).
   *
   * HỎI MÁY CHỦ, không tra trong danh sách đang có trên màn hình: danh sách ấy
   * đã lọc theo phạm vi của người đang xem, nên một khách của TDV khác sẽ không
   * có trong đó — và câu trả lời *"chưa ai dùng"* sẽ sai đúng ở chỗ nó phải
   * đúng nhất.
   */
  const [trungMst, datTrungMst] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => {
    const mst = g.idNumber.trim();
    // Ô rỗng thì không hỏi: đó là trạng thái đầu của mọi biểu mẫu lập mới, và
    // một lượt gọi mạng cho một ô chưa ai gõ là một lượt gọi thừa ở mọi lần mở.
    if (mst === '') {
      datTrungMst(null);
      return;
    }
    /*
     * ĐỢI 400ms sau phím cuối. Không có nó thì mã số thuế mười chữ số là mười
     * lượt gọi, chín trong đó hỏi về một chuỗi chưa gõ xong.
     *
     * `huy` chặn lượt trả về ĐẾN MUỘN ghi đè lượt mới: gõ thêm một chữ số rồi
     * xoá đi thì hai lượt gọi chạy song song, và lượt cũ về sau sẽ dán câu trả
     * lời của chuỗi cũ lên ô đang mang chuỗi mới.
     */
    let huy = false;
    const h = setTimeout(() => {
      void layJson<{ trung: boolean; khachHang?: { code: string; name: string } }>(
        `/customers/kiem-tra-mst?mst=${encodeURIComponent(mst)}` +
          (khach ? `&tru=${khach.id}` : ''),
      )
        .then((r) => {
          if (!huy) datTrungMst(r.trung && r.khachHang ? r.khachHang : null);
        })
        .catch(() => {
          // Hỏng thì IM LẶNG và coi như chưa trùng: đây là một phép hỏi trước
          // cho tiện, còn chốt chặn thật nằm ở máy chủ lúc ghi. Dựng một khối
          // lỗi đỏ ở đây là báo hỏng mạng cho một việc người dùng không yêu cầu.
          if (!huy) datTrungMst(null);
        });
    }, 400);
    return () => {
      huy = true;
      clearTimeout(h);
    };
  }, [g.idNumber, khach?.id]);

  /** Đang sửa một khách đã có, VÀ ô loại khách hàng thật sự đổi giá trị. */
  const doiLoai = khach !== undefined && Number(g.customerType) !== khach.customerType;
  // `0226` — gửi `code` chỉ khi ĐỔI, cùng lý do với `customerType` ngay trên.
  const doiMa = khach !== undefined && g.code.trim() !== khach.code;

  /**
   * GIÁ TRỊ CŨ NGOÀI DANH SÁCH VẪN PHẢI HIỆN RA (`0205`).
   *
   * Khách hàng lập trước `0205` mang tỉnh/thành gõ tay, và chuỗi ấy có thể không
   * trùng tên nào trong 63. Không bày nó ra thì ô chọn hiện một dòng trống, và
   * lượt Lưu tiếp theo — dù người dùng chỉ sửa số điện thoại — **âm thầm ghi đè
   * địa chỉ pháp nhân** bằng cái tên đầu danh sách hoặc bằng rỗng. Cùng lối
   * `nhanLoaiKhach` đã chọn cho một loại khách hàng lạ: dữ liệu cũ không bao giờ
   * nên hiện thành ô trống.
   *
   * `disabled` chứ không phải một mục chọn được: nó là thứ ĐANG LƯU, không phải
   * một câu trả lời hợp lệ — máy chủ sẽ trả `CUSTOMER_PROVINCE_UNKNOWN` nếu nó
   * được gửi lên. Bày ra để người dùng đọc được mình đang đổi cái gì, rồi chọn
   * lại; chọn lại xong thì không quay về nó được nữa.
   */
  const dsTinhThanh = useMemo(() => {
    const ds = [...TINH_THANH] as readonly string[];
    const cu = (khach?.province ?? '').trim();
    return cu !== '' && !ds.includes(cu) ? { ds, cu } : { ds, cu: null };
  }, [khach?.province]);

  // Trường tuỳ chọn để trống thì BỎ HẲN khỏi thân request, không gửi chuỗi rỗng:
  // `str(1, …)` của máy chủ từ chối chuỗi rỗng, nên gửi đi là 400 ở một trường
  // mà người dùng cố ý bỏ trống.
  const coGiaTri = (v: string) => (v.trim() === '' ? undefined : v.trim());

  /** Bỏ ô trống, cắt khoảng trắng. Dùng ở CẢ lượt gửi lẫn phép kiểm nút Lưu. */
  const sach = (ds: string[]): string[] => ds.map((d) => d.trim()).filter((d) => d !== '');

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      const than = {
        name: g.name.trim(),
        province: g.province.trim(),
        streetWard: g.streetWard.trim(),
        // `sach()` bỏ ô trống và cắt khoảng trắng — đúng một chỗ, ở lượt gửi.
        deliveryAddresses: sach(g.deliveryAddresses),
        ownerName: g.ownerName.trim(),
        ...opt('ownerTitle', coGiaTri(gopChucDanh(g.ownerTitleChon, g.ownerTitleKhac))),
        ...opt('phone', coGiaTri(g.phone)),
        // MÃ SỐ THUẾ gửi ở MỌI lượt từ `0175` — nó thôi là ô tuỳ chọn.
        idNumber: g.idNumber.trim(),
        /*
         * `debtTerm` gửi ở MỌI lượt, `debtNote` chỉ khi chọn *Khác* (`0138`).
         *
         * Máy chủ từ chối `debtNote` kèm phương án 1 hay 2 (`DEBT_NOTE_NOT_ALLOWED`),
         * và đó là chốt đúng — nhưng nếu giao diện cứ gửi kèm chuỗi cũ thì người
         * dùng đổi từ *Khác* sang phương án 1 sẽ nhận một lỗi mà họ không hiểu
         * mình vừa làm gì sai.
         */
        debtTerm: g.debtTerm,
        ...(g.debtTerm === 'KHAC' ? { debtNote: g.debtNote.trim() } : {}),
      };
      if (khach) {
        // Chỉ gửi khi ĐÃ ĐỔI. Gửi kèm ở mọi lượt sửa thì một lần sửa địa chỉ
        // cũng ghi một dòng "đổi loại khách hàng" vào nhật ký kiểm toán, và
        // nhật ký đầy những thay đổi không có thật thì không ai đọc nữa.
        await va(`/customers/${khach.id}`, {
          ...than,
          ...(doiLoai ? { customerType: Number(g.customerType) } : {}),
          ...(doiMa ? { code: g.code.trim() } : {}),
        });
        xong(khach.id);
      } else {
        const moi = await dang<{ id: string }>('/customers', {
          code: g.code.trim(),
          customerType: Number(g.customerType),
          ...than,
        });
        xong(moi.id);
      }
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  /*
   * SỐ ĐIỆN THOẠI SAI thì báo đỏ dưới ô và nút Lưu xám (`0223`). Ô vẫn TUỲ CHỌN
   * — để trống là hợp lệ (xem chú thích ở ô); chỉ một số ĐÃ GÕ mà không đủ
   * mười chữ số mới bị chặn. Máy chủ chốt cùng luật (`CUSTOMER_PHONE_INVALID`).
   */
  const sdtSai = g.phone.trim() !== '' && !laSoDienThoai(g.phone);
  /** Chọn *Khác* mà chưa gõ chức danh — cùng lối ô công nợ *Khác* (`0138`). */
  const thieuChucDanhKhac =
    g.ownerTitleChon === CHUC_DANH_KHAC && g.ownerTitleKhac.trim() === '';

  const duGiaTri =
    !sdtSai &&
    !thieuChucDanhKhac &&
    g.name.trim() !== '' &&
    g.province.trim() !== '' &&
    g.streetWard.trim() !== '' &&
    g.idNumber.trim() !== '' &&
    // Đã biết trùng thì nút xám: máy chủ cũng chặn, nhưng bắt bấm Lưu mới biết
    // là bắt người dùng đi một vòng thừa cho một câu trả lời đã có sẵn.
    trungMst === null &&
    g.ownerName.trim() !== '' &&
    // Chọn *Khác* mà chưa gõ gì thì nút Lưu xám (`0138`) — máy chủ cũng chặn,
    // nhưng bắt người dùng bấm Lưu mới biết là bắt họ đi một vòng thừa.
    (g.debtTerm !== 'KHAC' || g.debtNote.trim() !== '') &&
    g.code.trim() !== '';

  return (
    <HopThoai tieuDe={khach ? `Sửa ${khach.code}` : 'Lập khách hàng'} dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="kh-ma" nhan="Mã khách hàng" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.code}
              disabled={!suaDuocMa}
              onChange={(e) => sua({ code: e.target.value })}
            />
          )}
        </Truong>
        {/* `0226` — hai câu cho hai người. Câu của TDV phụ trách nói ra HỆ QUẢ
            (hồ sơ đã gửi giữ mã cũ); câu của người khác nói VÌ SAO ô bị khoá —
            ô xám không kèm lời là bắt người dùng đoán. */}
        {khach && !laTdvPhuTrach && (
          <p className="ghi-chu">Chỉ Trình dược viên phụ trách khách hàng này sửa được mã.</p>
        )}
        {khach && laTdvPhuTrach && hieuLuc !== null && typeof hieuLuc === 'object' && (
          <p className="ghi-chu">
            Khách hàng đang có CSBH hiệu lực (<strong>{hieuLuc.code}</strong>) nên không sửa được mã.
          </p>
        )}
        {khach && laTdvPhuTrach && hieuLuc === 'khong-ro' && (
          <p className="ghi-chu">
            Chưa kiểm được khách hàng có CSBH đang hiệu lực không, nên tạm chưa sửa được mã. Mở lại
            biểu mẫu để thử lại.
          </p>
        )}
        {khach && suaDuocMa && (
          <p className="ghi-chu">
            Đổi mã thì hồ sơ CSBH <strong>đã gửi duyệt</strong> vẫn giữ mã cũ — đó là mã in trên tờ
            giấy đã ký. Mã cũ được giải phóng, khách hàng khác dùng lại được.
          </p>
        )}

        {/* LOẠI KHÁCH HÀNG sửa được, cả khi lập lẫn khi sửa. Trước đây khoá lại
            vì nó quyết định ngưỡng chiết khấu — nhưng khách hàng có đổi hạng
            thật, và cách duy nhất còn lại là lập một khách hàng mới với mã mới,
            tức là cắt đôi lịch sử CSBH của cùng một khách. */}
        <Truong id="kh-loai" nhan="Loại khách hàng" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={g.customerType}
              onChange={(e) => sua({ customerType: e.target.value })}
            >
              {LOAI_KHACH_HANG.map((l) => (
                <option key={l} value={l}>
                  {nhanLoaiKhach(l)}
                </option>
              ))}
            </select>
          )}
        </Truong>

        {/*
          Cảnh báo CHỈ hiện khi ô thật sự đổi giá trị. Bày sẵn một khối vàng ở
          mọi lượt sửa tên hay địa chỉ là dạy người dùng bỏ qua nó, và lúc họ đổi
          loại thật thì nó đã thành nền.
        */}
        {doiLoai && (
          <div className="hop-canh-bao" role="note">
            <strong>
              Đổi từ {nhanLoaiKhach(khach!.customerType)} sang {nhanLoaiKhach(Number(g.customerType))}.
            </strong>{' '}
            Loại khách hàng quyết định ngưỡng chiết khấu.{' '}
            {batTinhNang('yeuCauCapNhat') ? (
              <>
                Hồ sơ <strong>Nháp</strong> và hồ sơ bị trả lại sẽ{' '}
                <strong>tự nhận ngưỡng mới</strong> ngay lần mở tiếp theo. Hồ sơ{' '}
                <strong>đã gửi duyệt</strong> thì giữ nguyên ngưỡng đã đóng băng — chúng sẽ hiện
                trong box <em>Yêu cầu cập nhật</em> ở trang Tổng quan để người phụ trách tự quyết
                định.
              </>
            ) : (
              /* `0239` — tính năng chưa mở: không có box nào để trỏ tới. Hồ sơ còn
                 sửa được nhận ngưỡng mới ở lượt GỬI DUYỆT (`lamMoiDong`, `0194`),
                 không phải lúc mở ra. */
              <>
                Hồ sơ <strong>Nháp</strong> và hồ sơ bị trả lại nhận ngưỡng mới{' '}
                <strong>khi gửi duyệt</strong>. Hồ sơ <strong>đã gửi duyệt</strong> giữ nguyên
                ngưỡng đã đóng băng.
              </>
            )}
          </div>
        )}

        {/* `0175` — *Tên khách hàng* → *Tên Hộ kinh doanh/Tên Công ty*: khách của
            Công ty là hộ kinh doanh hoặc doanh nghiệp, và cái tên phải điền là
            tên trên giấy đăng ký kinh doanh chứ không phải tên chủ hộ. */}
        <Truong id="kh-ten" nhan="Tên Hộ kinh doanh/Tên Công ty" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" value={g.name} onChange={(e) => sua({ name: e.target.value })} />
          )}
        </Truong>
        {/*
          ĐỊA CHỈ ĐĂNG KÝ: HAI Ô, CHỈ MỘT (`0175`, chốt 05/09).

          `0154` cho nó là một danh sách thêm bớt được, để một chủ hộ nhiều điểm
          bán khai đủ. Khách hàng thu lại: địa chỉ đăng ký theo giấy đăng ký kinh
          doanh, mà một pháp nhân chỉ có một tờ giấy ấy. Nhiều điểm bán vẫn khai
          được ở khối *Địa chỉ giao hàng* ngay dưới.

          TỈNH/THÀNH ĐỨNG TRƯỚC dù trên tờ giấy nó in sau: đây là thứ người nhập
          biết chắc và gõ xong trong hai giây, còn số nhà thì phải nhìn vào giấy
          tờ. Biểu mẫu xếp theo thứ tự người ta điền được, không theo thứ tự in.
        */}
        {/*
          Ô CHỌN, không phải ô gõ (`0205`, khách hàng chốt 19/09) — 63 tỉnh,
          thành phố theo danh sách CŨ, vì phần mềm ghi địa chỉ theo giấy đăng ký
          kinh doanh và tờ giấy trong tay khách hàng vẫn mang tên cũ.

          Mục trống đứng đầu là BẮT BUỘC chứ không phải cho đẹp: `rong.province`
          là `''`, và một `<select>` không có mục nào mang `value=""` thì trình
          duyệt tự chọn mục đầu tiên — biểu mẫu lập mới sẽ mở ra với *An Giang*
          đã điền sẵn, và người dùng không đọc kỹ sẽ lưu đúng cái tên ấy.
        */}
        <Truong id="kh-tinh" nhan="Tỉnh/Thành phố (theo phân cách hành chính cũ)" bắtBuộc>
          {(p) => (
            <ChonCoGo
              {...p}
              giaTri={g.province}
              doi={(v) => sua({ province: v })}
              goiY="Gõ hoặc chọn tỉnh/thành phố"
              khongCoKetQua={(q) => `Không có tỉnh/thành phố nào khớp “${q}”. Kiểm tra chính tả hoặc chọn từ danh sách.`}
              ds={[
                ...(dsTinhThanh.cu !== null
                  ? [{ gia: dsTinhThanh.cu, nhan: `${dsTinhThanh.cu} — giá trị cũ, phải chọn lại`, tat: true }]
                  : []),
                ...dsTinhThanh.ds.map((t) => ({ gia: t, nhan: t })),
              ]}
            />
          )}
        </Truong>
        <Truong id="kh-so-nha" nhan="Số nhà, Phường xã (theo đăng ký kinh doanh)" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.streetWard}
              onChange={(e) => sua({ streetWard: e.target.value })}
            />
          )}
        </Truong>
        <NhomDiaChi
          id="kh-dc-gh"
          nhan="Địa chỉ giao hàng"
          ds={g.deliveryAddresses}
          doi={(ds) => sua({ deliveryAddresses: ds })}
          themNhan="Thêm địa chỉ giao hàng"
          goiY="Để trống thì dùng địa chỉ đăng ký"
        />
        <Truong id="kh-nguoi" nhan="Người đại diện" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.ownerName}
              onChange={(e) => sua({ ownerName: e.target.value })}
            />
          )}
        </Truong>
        {/*
          CHỨC DANH là ô chọn cộng *Khác* tự gõ (`0223`, chốt 27/09). Thứ lưu là
          câu chữ, không phải mã — xem `CHUC_DANH_DAI_DIEN`. Mục trống đứng đầu
          vì ô này KHÔNG bắt buộc, và `<select>` thiếu mục `value=""` thì tự chọn
          mục đầu tiên (bài học `0205`).
        */}
        <Truong id="kh-chuc" nhan="Chức danh người đại diện">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={g.ownerTitleChon}
              onChange={(e) => sua({ ownerTitleChon: e.target.value })}
            >
              <option value="">— Chọn chức danh —</option>
              {CHUC_DANH_DAI_DIEN.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={CHUC_DANH_KHAC}>Khác (tự nhập)</option>
            </select>
          )}
        </Truong>
        {g.ownerTitleChon === CHUC_DANH_KHAC && (
          <Truong id="kh-chuc-khac" nhan="Ghi rõ chức danh" bắtBuộc>
            {(p) => (
              <input
                {...p}
                className="o-nhap"
                maxLength={120}
                value={g.ownerTitleKhac}
                onChange={(e) => sua({ ownerTitleKhac: e.target.value })}
              />
            )}
          </Truong>
        )}
        {/*
          SỐ ĐIỆN THOẠI (`0128`) — đứng cạnh người đại diện, vì nó là cách liên
          hệ CHÍNH của khách hàng và người nhập điền hai ô ấy cùng một lúc.

          Không phải ô bắt buộc của biểu mẫu này: khách hàng lập trước `0128`
          chưa ai khai, và bắt điền ngay là chặn cả những lượt sửa chẳng liên
          quan. Chốt nằm ở lượt GỬI DUYỆT — số này in ra bản CSBH, nên hồ sơ
          không rời trạng thái Nháp khi nó còn trống.
        */}
        <Truong
          id="kh-dien-thoai"
          nhan="Số điện thoại"
          {...(sdtSai ? { loi: 'Số điện thoại phải gồm đúng 10 chữ số.' } : {})}
        >
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="tel"
              inputMode="tel"
              value={g.phone}
              onChange={(e) => sua({ phone: e.target.value })}
            />
          )}
        </Truong>
        {/*
          MÃ SỐ THUẾ: BẮT BUỘC và DUY NHẤT (`0175`, chốt 05/09) — đảo hẳn
          `CUST-07`, thứ vốn cho trùng và chỉ cảnh báo.

          Câu báo trùng đi qua `loi` của `Truong`, tức nằm NGAY DƯỚI ô và gắn với
          nó bằng `aria-describedby`. Một dòng chữ đặt cạnh mà không gắn thì trình
          đọc màn hình đọc nhãn ô rồi im — người dùng bàn phím không bao giờ biết
          vì sao nút Lưu xám.
        */}
        <Truong
          id="kh-mst"
          nhan="Mã số thuế"
          bắtBuộc
          {...(trungMst
            ? {
                loi: `Mã số thuế này đã thuộc về khách hàng ${trungMst.code} — ${trungMst.name}.`,
              }
            : {})}
        >
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.idNumber}
              onChange={(e) => sua({ idNumber: e.target.value })}
            />
          )}
        </Truong>
        {/*
          CÔNG NỢ là một ĐIỀU KHOẢN, không phải số tiền (`0138`, chốt 27/08).

          Ô gõ nội dung chỉ hiện khi chọn *Khác*, và nó BẮT BUỘC khi hiện — máy
          chủ chặn cả hai chiều, ô này chỉ nói trước để không ai phải bấm Lưu
          mới biết.
        */}
        <Truong id="kh-no" nhan="Công nợ" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={g.debtTerm}
              onChange={(e) => sua({ debtTerm: e.target.value })}
            >
              {DIEU_KHOAN_NO.map((d) => (
                <option key={d} value={d}>
                  {NHAN_DIEU_KHOAN_NO[d]}
                </option>
              ))}
            </select>
          )}
        </Truong>
        {g.debtTerm === 'KHAC' && (
          <Truong id="kh-no-khac" nhan="Ghi rõ điều khoản" bắtBuộc>
            {(p) => (
              <textarea
                {...p}
                className="o-nhap"
                rows={2}
                maxLength={500}
                value={g.debtNote}
                onChange={(e) => sua({ debtNote: e.target.value })}
              />
            )}
          </Truong>
        )}

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !duGiaTri}>
            {dangGui ? 'Đang lưu…' : khach ? 'Lưu' : 'Lập khách hàng'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

const opt = (k: string, v: string | undefined) => (v === undefined ? {} : { [k]: v });

// --- Đổi TDV phụ trách -------------------------------------------------------

type Tdv = { id: string; username: string; fullName: string };

/**
 * Đổi TDV phụ trách một khách hàng — Sale Admin và Quản trị (`doiTdvPhuTrach`).
 *
 * Đây KHÔNG phải đổi một cái tên trên màn hình: phạm vi dữ liệu suy từ người
 * phụ trách, nên đổi xong thì TDV cũ thôi nhìn thấy khách hàng này và mọi hồ sơ
 * của họ, còn TDV mới thấy ngay. Câu đó nằm trên hộp thoại.
 */
export function DoiTdvPhuTrach({
  khachHangId,
  tdvHienTai,
  dong,
  xong,
}: {
  khachHangId: string;
  tdvHienTai: string | null;
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [ds, datDs] = useState<Tdv[] | null>(null);
  const [chon, datChon] = useState(tdvHienTai ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<Tdv[]>('/auth/nguoi-theo-vai-tro/TDV', huy.signal)
      .then(datDs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await va(`/customers/${khachHangId}`, { tdvUserId: chon });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Đổi trình dược viên phụ trách" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <p className="giai-thich">
          Đổi người phụ trách <strong>đổi luôn phạm vi nhìn thấy</strong>: trình dược viên cũ thôi
          thấy khách hàng này và mọi hồ sơ của họ; người mới thấy ngay.
        </p>
        <Truong id="tdv-chon" nhan="Trình dược viên" bắtBuộc>
          {(p) => (
            <ChonCoGo
              {...p}
              giaTri={chon}
              doi={datChon}
              goiY="Gõ tên hoặc tên đăng nhập"
              ds={(ds ?? []).map((t) => ({ gia: t.id, nhan: `${t.fullName} (${t.username})` }))}
            />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={dangGui || chon === '' || chon === tdvHienTai}
          >
            {dangGui ? 'Đang lưu…' : 'Đổi'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}


/**
 * Xoá một khách hàng (`0034`) — MỘT nút, hai kết cục.
 *
 * NHÃN là "Xoá" ở mọi chỗ người dùng nhìn thấy, dù bên trong có khi là xoá dòng
 * và có khi là chuyển trạng thái `NGUNG_HOP_TAC`. Trộn hai từ vựng trên cùng một
 * màn hình — bấm nút "Xoá" rồi thấy nhãn "Đã ngừng hợp tác" — là bắt người dùng
 * tự dịch giữa hai cách gọi cho một việc họ vừa làm.
 *
 * Hộp thoại nói ra HẬU QUẢ trước, vì hậu quả khác nhau theo lịch sử của khách và
 * người dùng không đoán được từ cái nút:
 *
 *   * Chưa hồ sơ nào → **xoá hẳn**, không lùi được.
 *   * Đã có hồ sơ → giữ lại để tra cứu, và mọi CSBH đang hiệu lực **hết hiệu lực**.
 *   * Còn hồ sơ đang chờ → **chặn**, kèm mã từng hồ sơ.
 */
export function HopThoaiNgungHopTac({
  kh,
  dong,
  xong,
}: {
  kh: KhachHangDayDu;
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [xem, datXem] = useState<XemTruocNgung | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<XemTruocNgung>(`/customers/${kh.id}/ngung-hop-tac`, huy.signal)
      .then(datXem)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [kh.id]);

  const gui = async () => {
    datLoi(null);
    datDangGui(true);
    try {
      await xoa(`/customers/${kh.id}`);
      xong();
    } catch (e) {
      bao(e);
    } finally {
      datDangGui(false);
    }
  };

  const chan = (xem?.dangCho.length ?? 0) > 0;

  return (
    <HopThoai tieuDe={`Xoá khách hàng ${kh.name}`} dong={dong}>
      {xem === null && loi === null ? (
        <DangTai />
      ) : chan ? (
        <>
          <p>
            Khách hàng còn <strong>{xem!.dangCho.length} hồ sơ CSBH chưa đi hết luồng duyệt</strong>.
            Xử lý xong hoặc xoá những hồ sơ đó trước, rồi quay lại đây.
          </p>
          <p className="ghi-chu">
            {xem!.dangCho.map((x) => `${x.code} (${x.status})`).join(' · ')}
          </p>
        </>
      ) : (
        <>
          {xem?.seXoaHan ? (
            <p>
              Khách hàng này <strong>chưa có hồ sơ CSBH nào</strong>, nên bản ghi sẽ bị{' '}
              <strong>xoá hẳn</strong> — không lấy lại được.
            </p>
          ) : (
            <p>
              Khách hàng đã có hồ sơ CSBH nên bản ghi <strong>được giữ lại để tra cứu</strong> hồ sơ
              cũ — nhưng đánh dấu <strong>Đã xoá</strong>, biến khỏi ô chọn lúc lập hồ sơ và{' '}
              <strong>không lập CSBH mới được nữa</strong>.
            </p>
          )}
          {(xem?.dangHieuLuc.length ?? 0) > 0 && (
            <p>
              <strong>{xem!.dangHieuLuc.length} CSBH đang có hiệu lực</strong> sẽ chuyển sang{' '}
              <strong>Hết hiệu lực</strong>: {xem!.dangHieuLuc.map((x) => x.code).join(' · ')}.
            </p>
          )}
        </>
      )}

      {loi !== null && <BaoLoi loi={loi} />}
      <div className="nhom-nut">
        {!chan && (
          <button
            type="button"
            className="nut nut-canh-bao"
            disabled={dangGui || xem === null}
            onClick={gui}
          >
            {dangGui ? 'Đang xử lý…' : 'Xoá'}
          </button>
        )}
        <button type="button" className="nut nut-nhe" onClick={dong}>
          {chan ? 'Đóng' : 'Huỷ'}
        </button>
      </div>
    </HopThoai>
  );
}

export type XemTruocNgung = {
  id: string;
  code: string;
  name: string;
  status: string;
  dangCho: { code: string; status: string }[];
  dangHieuLuc: { code: string }[];
  seXoaHan: boolean;
};
