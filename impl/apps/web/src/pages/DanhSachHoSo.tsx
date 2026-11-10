/**
 * Danh sách hồ sơ, có bộ lọc 9 tiêu chí (muc 9.2, dựng lại ở `0077`).
 *
 * Ba tiêu chí tỉnh/thành · bệnh viện · kênh rời khỏi phần mềm ở `0026` cùng ba
 * cột nguồn của chúng bên khách hàng. `0077` bỏ tiếp *địa chỉ đăng ký* và *mã số
 * thuế*, gộp *người đề nghị* vào *TDV phụ trách*, và đưa *hạn xử lý* vào hẳn
 * muc 9.2.
 *
 * ĐỔI LỚN NHẤT CỦA `0077`: **năm tiêu chí nhận nhiều giá trị**, và bốn trong số
 * đó có ô CHỌN thay cho ô gõ. Trước đợt này mã khách hàng và nhóm sản phẩm phải
 * gõ tay đúng mã có thật trong danh mục — gõ sai một ký tự thì kết quả rỗng, và
 * không có gì phân biệt "không có hồ sơ nào" với "bạn gõ sai mã".
 *
 * Trên điện thoại bộ lọc nằm trong TẤM TRƯỢT LÊN, và đóng lại vẫn giữ điều kiện
 * đã chọn cùng số kết quả (`FE-10`). Điều kiện lưu ở máy chủ theo phiên, nên
 * chuyển màn hình rồi quay lại vẫn còn (`RPT-04`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dang, dat, layJson } from '../lib/api.js';
import { ngay, nhanTrangThai } from '../lib/format.js';
import { Lien, useDuong } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan, ONhapNgay, OTimKiem, Trong } from '../components/Chung.js';
import { ChonNhieu, type NguonChon, type TuyChon } from '../components/ChonNhieu.js';
import { NutXuatExcel } from '../components/NutXuatExcel.js';
import { OKhoangChietKhau } from '../components/OKhoangChietKhau.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { MOI_TRANG, soTrangCua } from '../lib/phan-trang.js';
import { MOI_TRANG_THAI } from '../lib/tong-quan.js';
import { usePhien } from '../lib/auth.js';
import { can } from '../lib/can.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { la404 } from '../lib/loi.js';
import { KanbanHoSo } from '../components/KanbanHoSo.js';
import { laVaiTroKanban } from '../lib/kanban.js';

/**
 * CÁCH XEM của trang (`0257`): kanban là mặc định — khách hàng chọn khi duyệt
 * mockup — còn dạng bảng giữ lại cho người quen dùng và cho đọc lướt nhiều dòng.
 * Nhớ trên máy người dùng (`localStorage`, bọc `try` như `thanh-ben.ts`).
 */
type CachXem = 'kanban' | 'bang';
const KHOA_CACH_XEM = 'csbh:ho-so-cach-xem';
function docCachXem(): CachXem {
  try {
    return localStorage.getItem(KHOA_CACH_XEM) === 'bang' ? 'bang' : 'kanban';
  } catch {
    return 'kanban';
  }
}

type Dong = {
  policyId: string;
  code: string;
  status: string;
  customerCode: string;
  customerName: string;
  /**
   * Ngày áp dụng SỚM NHẤT trong các dòng của hồ sơ (`0180`).
   *
   * Từ `0180` không còn "ngày áp dụng của hồ sơ": mỗi dòng sản phẩm có ngày
   * riêng. Read-model báo cáo giữ con số nhỏ nhất để lọc theo khoảng ngày, và
   * cột dưới đây gọi đúng tên nó — *Áp dụng từ* — chứ không giả vờ rằng cả hồ
   * sơ có một ngày.
   */
  appliedDate: string | null;
  approvedAt: string | null;
  tdvName: string | null;
  /**
   * Còn dưới 24 giờ là tới hạn, và chưa quá hạn (`0053`).
   *
   * Máy chủ tính, giao diện không suy lại từ `slaDueAt`: cùng một biểu thức với
   * thẻ *Sắp quá hạn* và tiêu chí `han=SAP_QUA_HAN`, nên ba chỗ không lệch nhau.
   */
  sapQuaHan: boolean;
};

type BoLoc = Record<string, string>;

/**
 * Lựa chọn của ô *Hạn xử lý* (`0060`).
 *
 * Ô CHỌN chứ không phải ô gõ: hai giá trị ấy là mã viết hoa, và một ô nhập tự do
 * cho hai giá trị cố định là một ô người dùng gõ sai được.
 */
const HAN_XU_LY: { gia: string; nhan: string }[] = [
  { gia: '', nhan: '— tất cả —' },
  { gia: 'SAP_QUA_HAN', nhan: 'Sắp quá hạn (dưới 24 giờ)' },
  { gia: 'QUA_HAN', nhan: 'Đã quá hạn' },
];

/** Nguồn tuỳ chọn nạp ở máy chủ theo từ khoá — dùng cho hai danh mục lớn. */
type TimO = 'khach-hang' | 'san-pham';

type TieuChi = {
  khoa: string;
  nhan: string;
  kieu?: 'date' | 'chon' | 'nhieu' | 'khoang';
  /** Chỉ ô `nhieu`: lấy tuỳ chọn ở đâu. */
  tim?: TimO;
  goiY?: string;
};

/**
 * Mười tiêu chí của muc 9.2, đúng thứ tự hiện trên biểu mẫu (`0077`; ô thứ mười ở `0283`).
 *
 * Thứ tự không tuỳ tiện: hai khoảng thời gian trước (câu hỏi thu hẹp mạnh nhất),
 * rồi khách hàng, rồi sản phẩm, rồi người, rồi tình trạng. Đi từ "kỳ nào" tới
 * "của ai" tới "đang ở đâu" — cùng thứ tự người ta nói ra khi hỏi miệng.
 */
const TIEU_CHI: TieuChi[] = [
  { khoa: 'appliedFrom', nhan: 'Áp dụng từ', kieu: 'date' },
  { khoa: 'appliedTo', nhan: 'Áp dụng đến', kieu: 'date' },
  { khoa: 'approvedFrom', nhan: 'Duyệt từ', kieu: 'date' },
  { khoa: 'approvedTo', nhan: 'Duyệt đến', kieu: 'date' },
  {
    khoa: 'customerCode',
    nhan: 'Mã khách hàng',
    kieu: 'nhieu',
    tim: 'khach-hang',
    goiY: 'Gõ mã hoặc tên khách hàng…',
  },
  // Ô GÕ CHỮ, cố ý đứng cạnh ô chọn ở trên. Ô chọn trả lời "đúng những khách
  // hàng này"; ô này trả lời "mọi khách hàng có chữ Minh trong tên" — câu hỏi
  // của người chưa biết mình đang tìm ai.
  { khoa: 'customerName', nhan: 'Tên khách hàng' },
  {
    khoa: 'productName',
    nhan: 'Tên sản phẩm',
    kieu: 'nhieu',
    tim: 'san-pham',
    goiY: 'Gõ tên sản phẩm…',
  },
  { khoa: 'productGroupCode', nhan: 'Nhóm sản phẩm', kieu: 'nhieu' },
  { khoa: 'tdvUserId', nhan: 'TDV phụ trách', kieu: 'nhieu' },
  { khoa: 'status', nhan: 'Trạng thái', kieu: 'nhieu' },
  /*
   * Đứng NGAY SAU *Trạng thái* (`0060`), và đó là chỗ của nó: hai ô cùng trả lời
   * "hồ sơ đang ở tình trạng nào", chỉ khác một cái theo bước còn một cái theo
   * đồng hồ.
   */
  { khoa: 'han', nhan: 'Hạn xử lý', kieu: 'chon' },
  /*
   * Khoảng tỷ lệ chiết khấu (`0283`) — ô thứ mười, ở ô trống cuối lưới bốn cột. Một ô nhưng HAI khoá
   * (`discountFrom` + `discountTo`): khoá thứ hai không có ô riêng nên nằm ở `KHOA_DI_KEM`.
   */
  { khoa: 'discountFrom', nhan: 'Tỷ lệ chiết khấu', kieu: 'khoang' },
];

/** Khoá đi cùng một ô nhưng không có ô riêng — vẫn nhận được từ liên kết và vẫn lưu cùng bộ lọc. */
const KHOA_DI_KEM = ['discountTo'] as const;

/**
 * Tiêu chí đặt được TỪ LIÊN KẾT nhưng KHÔNG có ô nhập trong biểu mẫu.
 *
 * Cả hai đến từ một cú bấm ở trang Tổng quan (`0045`), không phải thứ gõ ra
 * được. Vì không có ô nào để bỏ chúng đi, màn hình hiện một dải "đang lọc thêm
 * theo…" có nút gỡ; thiếu dải đó thì người dùng thấy danh sách ngắn bất thường
 * mà không biết vì sao.
 *
 * `pendingStep` là cách DUY NHẤT để một thẻ mở ra đúng tập hồ sơ nó vừa đếm: thẻ
 * đếm cả hồ sơ quá hạn ở bước ấy, mà chúng mang `QUA_HAN_DUYET` nên `status` lọc
 * không ra.
 *
 * `tdvUserId` ĐÃ RỜI KHỎI ĐÂY ở `0077`. Nó có ô chọn thật rồi, nên bấm một dòng
 * ở khối *Theo trình dược viên* giờ hiện thành chip trong đúng cái ô người dùng
 * sửa được — thay vì một dải chữ chỉ bỏ đi được chứ không đổi được.
 */
const TIEU_CHI_AN: Record<string, string> = {
  pendingStep: 'Bước đang chờ',
  // `reprint` (`0045`) ĐÃ GỠ ở `0225`: hai nửa bước B8 là hai trạng thái, thẻ
  // Tổng quan lọc chúng bằng `status` — một ô chọn thật, không phải chip ẩn.
};

/**
 * Tham số màn hình này nhận TỪ LIÊN KẾT. Xuất ra để bộ kiểm đối chiếu được với
 * đường dẫn mà từng thẻ trên trang Tổng quan sinh ra (`0059`).
 */
export const KHOA_NHAN_TU_LIEN_KET = [
  ...TIEU_CHI.map((t) => t.khoa),
  ...KHOA_DI_KEM,
  ...Object.keys(TIEU_CHI_AN),
];

/** Khoá nhận nhiều giá trị — phải khớp `KHOA_NHIEU_GIA_TRI` của máy chủ (`0077`). */
export const KHOA_NHIEU = TIEU_CHI.filter((t) => t.kieu === 'nhieu').map((t) => t.khoa);

/**
 * Nạp hai danh mục nhỏ MỘT LẦN lúc mở màn hình: nhóm sản phẩm và TDV phụ trách.
 *
 * Cả hai chỉ vài chục dòng, và người dùng gần như chắc chắn sẽ mở bộ lọc ra —
 * nạp sẵn thì ô chọn xoè ra là có ngay danh sách, không có khoảnh khắc trống.
 * Hỏng thì trả về danh sách rỗng chứ không báo lỗi: một ô chọn không nạp được
 * vẫn để người dùng lọc bằng tám tiêu chí còn lại.
 */
function useDanhMucLoc() {
  const [nhom, datNhom] = useState<TuyChon[]>([]);
  const [tdv, datTdv] = useState<TuyChon[]>([]);

  const { bao } = useBaoLoi();

  /*
   * Hai danh mục của bộ lọc (`0089`).
   *
   * Nuốt lỗi ở đây cho ra hai ô chọn RỖNG, và một ô chọn rỗng đọc ra là "hệ
   * thống không có nhóm sản phẩm nào" — người dùng bỏ luôn ý định lọc theo nhóm
   * thay vì thử lại. Thanh nổi vì việc chính (xem danh sách hồ sơ) vẫn chạy
   * bình thường, chỉ hai ô lọc là thiếu lựa chọn.
   */
  useEffect(() => {
    const huy = new AbortController();
    const hong = (e: unknown) => {
      if (!huy.signal.aborted) bao(e);
    };
    void layJson<{ code: string; name: string }[]>('/catalog/product-groups', huy.signal)
      .then((ds) => datNhom(ds.map((g) => ({ gia: g.code, nhan: `${g.code} — ${g.name}` }))))
      .catch(hong);
    void layJson<{ userId: string; name: string | null }[]>('/reports/handlers', huy.signal)
      .then((ds) => datTdv(ds.map((n) => ({ gia: n.userId, nhan: n.name ?? 'Chưa rõ tên' }))))
      .catch(hong);
    return () => huy.abort();
  }, [bao]);

  return { nhom, tdv };
}

/** Trạng thái: danh sách cố định, nhãn lấy từ `format.ts` để một trạng thái một tên. */
const TUY_CHON_TRANG_THAI: TuyChon[] = MOI_TRANG_THAI.map((t) => ({
  gia: t,
  nhan: nhanTrangThai(t),
}));

/**
 * Tìm khách hàng và sản phẩm Ở MÁY CHỦ.
 *
 * Không kéo cả danh mục về rồi lọc trên trình duyệt — đó đúng là lỗi `0049` đã
 * sửa một lần ở màn hình danh mục: vượt 200 dòng thì gõ tên một thứ CÓ THẬT vẫn
 * ra "không tìm thấy", và không gì báo cho người dùng biết họ chỉ tìm trong một
 * phần.
 *
 * Khách hàng gửi lên MÃ, sản phẩm gửi lên TÊN — đúng thứ máy chủ lọc theo, và
 * cũng đúng thứ đọc được trên chip mà không phải tra lại ở đâu.
 *
 * HAI ĐƯỜNG KHÁC NHAU, và khác có lý do đo được:
 *
 *   - Sản phẩm hỏi `catalog`, vì ô tìm ở đó đã bỏ dấu — gõ `sua` ra `sữa`.
 *   - Khách hàng hỏi `reports`, KHÔNG hỏi `GET /customers?q=`. Đường kia khớp
 *     tên, địa chỉ và mã số thuế nhưng **không khớp MÃ** — đúng thứ ô này mang
 *     tên — và nó dùng `ILIKE` nên phân biệt dấu: gõ `duoc` ra rỗng. Thử trên
 *     chồng demo mới lộ; đọc tên endpoint thì không thấy gì sai.
 */
const TIM: Record<TimO, (q: string) => Promise<TuyChon[]>> = {
  'khach-hang': async (q) => {
    const ds = await layJson<{ code: string; name: string }[]>(
      `/reports/customers?q=${encodeURIComponent(q)}`,
    );
    return ds.map((k) => ({ gia: k.code, nhan: `${k.code} — ${k.name}` }));
  },
  'san-pham': async (q) => {
    const r = await layJson<{ items: { name: string }[] }>(
      `/catalog/products?limit=20&q=${encodeURIComponent(q)}`,
    );
    // Khử trùng theo TÊN: hai mã sản phẩm khác nhau có thể mang cùng một tên, và
    // bộ lọc khớp theo tên nên hai dòng giống hệt nhau trong ô chọn là hai dòng
    // làm cùng một việc.
    const thay = new Map(r.items.map((s) => [s.name, s.name]));
    return [...thay.keys()].map((n) => ({ gia: n, nhan: n }));
  },
};

export function DanhSachHoSo() {
  const { nguoiDung } = usePhien();
  const { truyVan } = useDuong();
  const { bao } = useBaoLoi();
  const tuLienKet = truyVan.toString();

  /*
   * Lưu bộ lọc hỏng thì BÁO MỘT LẦN cho cả màn hình (`0089`).
   *
   * Trước `0089` việc này nuốt lỗi hoàn toàn: người dùng dựng một bộ lọc sáu
   * điều kiện, mai mở lại thấy trống trơn, và không hiểu vì sao. Nhưng mỗi lần
   * đổi MỘT ô lọc là một lời gọi lưu, nên báo mỗi lượt là mưa thanh nổi —
   * `daBao` chặn đúng chỗ đó.
   */
  const daBao = useRef(false);
  const baoLuuHong = useCallback(
    (e: unknown) => {
      if (daBao.current) return;
      daBao.current = true;
      bao(e);
    },
    [bao],
  );

  const [boLoc, datBoLoc] = useState<BoLoc>({});
  const [dong, datDong] = useState<Dong[] | null>(null);
  const [tong, datTong] = useState<number | null>(null);
  /*
   * NGĂN XẾP CON TRỎ, không phải `offset` (`0030`).
   *
   * Danh sách này phân trang bằng con trỏ neo vào `(createdAt, policyId)` — với
   * `offset`, một hồ sơ mới lập giữa lúc người dùng bấm Sau sẽ đẩy mọi dòng
   * xuống một bậc, và họ nhận lại một dòng đã đọc trong khi một dòng khác biến
   * mất. Con trỏ không có chuyện đó, nhưng nó chỉ đi TỚI được.
   *
   * Nên giữ lại con trỏ mở đầu MỖI trang đã qua: `moTrang[i]` là con trỏ để lấy
   * trang thứ `i+1`. Lùi là đọc lại phần tử trước trong ngăn xếp. Đây là cái giá
   * của con trỏ, và nó rẻ hơn nhiều so với một danh sách trượt dưới tay người
   * đang đọc.
   */
  const [moTrang, datMoTrang] = useState<(string | null)[]>([null]);
  const [trang, datTrang] = useState(1);
  const [conTrỏ, datConTrỏ] = useState<string | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [moLoc, datMoLoc] = useState(false);
  const [lan, datLan] = useState(0);
  const [cachXem, datCachXem] = useState<CachXem>(docCachXem);
  const vaiTro = nguoiDung?.role;
  const kanban = cachXem === 'kanban' && laVaiTroKanban(vaiTro);
  const doiCachXem = (c: CachXem) => {
    datCachXem(c);
    try {
      localStorage.setItem(KHOA_CACH_XEM, c);
    } catch {
      /* Không ghi được: cách xem chỉ sống trong phiên này. */
    }
  };

  /**
   * Điều kiện lọc lúc mở màn hình. Hai nguồn, và LIÊN KẾT THẮNG.
   *
   * Bấm ô "Chờ TBP duyệt: 12" trên trang tổng quan mà lại ra danh sách theo bộ
   * lọc của phiên trước thì con số vừa bấm và danh sách vừa hiện không khớp
   * nhau — người dùng sẽ tin vào cái sai trong hai cái. Nên liên kết ghi đè, và
   * ghi luôn vào bộ lọc của phiên (RPT-04) để nó vẫn còn khi quay lại.
   */
  useEffect(() => {
    const q = new URLSearchParams(tuLienKet);
    const tuDuong: BoLoc = {};
    for (const khoa of KHOA_NHAN_TU_LIEN_KET) {
      const v = q.get(khoa);
      if (v !== null && v.trim() !== '') tuDuong[khoa] = v.trim();
    }

    if (Object.keys(tuDuong).length > 0) {
      datBoLoc(tuDuong);
      void dat('/reports/filters/ho-so', tuDuong).catch(baoLuuHong);
      return;
    }

    layJson<{ filter: BoLoc }>('/reports/filters/ho-so')
      .then((r) => datBoLoc(r.filter ?? {}))
      // 404 nghĩa là CHƯA từng lưu bộ lọc nào — câu trả lời bình thường của
      // lần mở màn hình đầu tiên, không phải lỗi (`0089`).
      .catch((e: unknown) => {
        if (!la404(e)) baoLuuHong(e);
      });
  }, [tuLienKet]);

  const chuoiTruyVan = useCallback(
    (them: Record<string, string> = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...boLoc, ...them })) if (v) q.set(k, v);
      return q.toString();
    },
    [boLoc],
  );

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    const mo = moTrang[trang - 1] ?? null;
    const qs = chuoiTruyVan({
      limit: String(MOI_TRANG),
      ...(mo === null ? {} : { cursor: mo }),
    });
    // Ở dạng kanban mỗi cột tự tải thẻ của nó; trang chỉ cần TỔNG cho dòng
    // "N hồ sơ khớp điều kiện".
    Promise.all([
      kanban
        ? Promise.resolve({ items: [] as Dong[], nextCursor: null })
        : layJson<{ items: Dong[]; nextCursor: string | null }>(`/reports/policies?${qs}`, huy.signal),
      layJson<{ total: number }>(`/reports/policies/count?${chuoiTruyVan()}`, huy.signal),
    ])
      .then(([ds, dem]) => {
        datDong(ds.items);
        datConTrỏ(ds.nextCursor);
        datTong(dem.total);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [chuoiTruyVan, lan, trang, moTrang, kanban]);

  // Đổi bộ lọc là đổi hẳn tập kết quả: mọi con trỏ đã ghi lại đều trỏ vào tập
  // cũ, nên phải vứt cả ngăn xếp chứ không chỉ về trang 1.
  useEffect(() => {
    datMoTrang([null]);
    datTrang(1);
  }, [chuoiTruyVan]);

  const doiTrang = (n: number) => {
    if (n === trang) return;
    if (n < trang) {
      datTrang(Math.max(1, n));
      return;
    }
    // Chỉ đi tới ĐÚNG MỘT trang: thanh phân trang không có nút nhảy, nên `n`
    // luôn là `trang + 1`. Ghi con trỏ mở đầu trang mới nếu chưa có.
    if (conTrỏ === null) return;
    datMoTrang((cu) => (cu.length > n - 1 ? cu : [...cu, conTrỏ]));
    datTrang(n);
  };

  const datMot = (k: string, v: string) => {
    const moi = { ...boLoc, [k]: v };
    if (!v) delete moi[k];
    datBoLoc(moi);
    void dat('/reports/filters/ho-so', moi).catch(baoLuuHong);
  };

  // Đổi NHIỀU khoá một lượt (khoảng chiết khấu: hai khoá). Gọi `datMot` hai lần thì lượt sau ghi đè lượt
  // trước, vì mỗi lượt đọc `boLoc` cũ.
  const datNhieu = (patch: Record<string, string>) => {
    const moi: BoLoc = { ...boLoc, ...patch };
    for (const k of Object.keys(patch)) if (!patch[k]) delete moi[k];
    datBoLoc(moi);
    void dat('/reports/filters/ho-so', moi).catch(baoLuuHong);
  };

  const xoaLoc = async () => {
    datBoLoc({});
    await dang('/reports/filters/ho-so/clear', {}).catch(baoLuuHong);
  };

  const soDieuKien = Object.values(boLoc).filter(Boolean).length;
  const locAn = Object.keys(TIEU_CHI_AN).filter((k) => boLoc[k]);

  const { nhom, tdv } = useDanhMucLoc();
  /*
   * Nguồn của từng ô chọn. `useMemo` là bắt buộc, không phải tối ưu: `ChonNhieu`
   * có `nguon` trong danh sách phụ thuộc của `useEffect`, nên một hàm dựng lại
   * ở mỗi lượt vẽ sẽ kích hoạt lại phép tìm vô tận.
   */
  const nguonCua = useMemo(() => {
    const bang: Record<string, NguonChon> = {
      productGroupCode: nhom,
      tdvUserId: tdv,
      status: TUY_CHON_TRANG_THAI,
    };
    return (t: TieuChi): NguonChon => (t.tim ? TIM[t.tim] : (bang[t.khoa] ?? []));
  }, [nhom, tdv]);

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Hồ sơ CSBH</h1>
        {/*
          Ba nút BỌC TRONG MỘT nhóm, không nằm rời trong `.dau-trang` (`0082`).

          `.dau-trang` là flex `space-between`, và `space-between` dàn ĐỀU các
          con trực tiếp ra cả hàng. Với hai con — tiêu đề và một nhóm nút — đó
          đúng là "tiêu đề trái, nút phải". Với bốn con thì nó rải chúng ra giữa
          trang, và không nút nào còn sát mép phải.

          Màn hình này có ba nút nên nó lộ ra rõ nhất, nhưng luật thì chung: mọi
          `.dau-trang` phải có ĐÚNG hai con. `ChiTietHoSo` vốn đã làm thế từ
          `0071` — chỗ này là chỗ bị bỏ sót.
        */}
        <div className="nhom-nut nhom-nut-dau">
          {laVaiTroKanban(vaiTro) && (
            <div className="cong-tac" role="group" aria-label="Cách xem">
              <button type="button" aria-pressed={kanban} onClick={() => doiCachXem('kanban')}>
                Kanban
              </button>
              <button type="button" aria-pressed={!kanban} onClick={() => doiCachXem('bang')}>
                Bảng
              </button>
            </div>
          )}
          {can(nguoiDung?.role, 'lapHoSo') && (
            <Lien den="/ho-so/moi" className="nut nut-chinh">
              Lập hồ sơ
            </Lien>
          )}
          <button
            type="button"
            className="nut nut-loc"
            aria-expanded={moLoc}
            onClick={() => datMoLoc((x) => !x)}
          >
            Bộ lọc{soDieuKien > 0 && <span className="dem-loc">{soDieuKien}</span>}
          </button>
          {/*
            Xuất Excel đứng ở ĐÂY chứ không ở trang Báo cáo (`0077`).

            Đây là màn hình duy nhất có bộ lọc, nên cũng là màn hình duy nhất
            xuất được *kết quả tìm kiếm*. Nút cũ ở trang Báo cáo gửi lên một bộ
            lọc rỗng và xuất cả phạm vi — một việc khác hẳn, đứng ở một chỗ
            không có gì để xuất theo.
          */}
          <NutXuatExcel boLoc={boLoc} />
        </div>
      </div>

      <p className="mo-ta-trang" aria-live="polite">
        {tong === null ? 'Đang đếm…' : `${tong} hồ sơ khớp điều kiện`}
      </p>

      {/* Tiêu chí đến từ liên kết mà biểu mẫu không có ô nào để gỡ — xem TIEU_CHI_AN. */}
      {locAn.length > 0 && (
        <div className="loc-them">
          {locAn.map((k) => (
            /*
              CẢ dải là nút, không phải chỉ dấu × bên trong nó. Một dấu × rộng
              24px là mục tiêu chạm quá nhỏ (`FE-08`), mà bọc riêng nó trong một
              vùng 44px thì dải chip cao gấp đôi cần thiết.
            */
            <button
              key={k}
              type="button"
              className="the-loc"
              onClick={() => datMot(k, '')}
              aria-label={`Bỏ lọc theo ${TIEU_CHI_AN[k]}`}
            >
              <span>
                Đang lọc theo <strong>{TIEU_CHI_AN[k]}</strong>
              </span>
              <span className="dau-go-loc" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      <div className={moLoc ? 'tam-loc mo' : 'tam-loc'}>
        <div className="tam-loc-trong">
          <h2>Bộ lọc</h2>
          <div className="luoi-loc">
            {TIEU_CHI.map((t) => {
              if (t.kieu === 'nhieu') {
                return (
                  <ChonNhieu
                    key={t.khoa}
                    id={`loc-${t.khoa}`}
                    nhan={t.nhan}
                    giaTri={boLoc[t.khoa] ? boLoc[t.khoa]!.split(',') : []}
                    nguon={nguonCua(t)}
                    {...(t.goiY === undefined ? {} : { goiY: t.goiY })}
                    // Nối bằng dấu phẩy: `datMot` và cả đường ống bên dưới nó
                    // vẫn làm việc với chuỗi, đúng như máy chủ nhận.
                    doi={(v) => datMot(t.khoa, v.join(','))}
                  />
                );
              }
              if (t.kieu === 'khoang') {
                return (
                  <OKhoangChietKhau
                    key={t.khoa}
                    id="loc-chiet-khau"
                    tu={boLoc['discountFrom'] ?? ''}
                    den={boLoc['discountTo'] ?? ''}
                    doi={datNhieu}
                  />
                );
              }
              if (t.kieu === 'date' || t.kieu === 'chon') {
                return (
                  <div className="truong" key={t.khoa}>
                    <label htmlFor={`loc-${t.khoa}`}>{t.nhan}</label>
                    {t.kieu === 'date' ? (
                      <ONhapNgay
                        id={`loc-${t.khoa}`}
                        giaTri={boLoc[t.khoa] ?? ''}
                        doi={(v) => datMot(t.khoa, v)}
                      />
                    ) : (
                      <select
                        id={`loc-${t.khoa}`}
                        className="o-nhap"
                        value={boLoc[t.khoa] ?? ''}
                        onChange={(e) => datMot(t.khoa, e.target.value)}
                      >
                        {HAN_XU_LY.map((o) => (
                          <option key={o.gia} value={o.gia}>
                            {o.nhan}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              }
              return (
                <OTimKiem
                  key={t.khoa}
                  id={`loc-${t.khoa}`}
                  nhan={t.nhan}
                  giaTri={boLoc[t.khoa] ?? ''}
                  doi={(v) => datMot(t.khoa, v)}
                />
              );
            })}
          </div>
          <div className="nhom-nut">
            <button type="button" className="nut nut-nhe" onClick={xoaLoc}>
              Xoá bộ lọc
            </button>
            <button type="button" className="nut nut-chinh" onClick={() => datMoLoc(false)}>
              Xong
            </button>
          </div>
        </div>
      </div>

      {loi !== null && <BaoLoi loi={loi} thuLai={() => datLan((x) => x + 1)} />}
      {kanban && laVaiTroKanban(vaiTro) && loi === null && (
        <KanbanHoSo
          vaiTro={vaiTro}
          truyVan={chuoiTruyVan}
          locTrangThai={boLoc.status ? boLoc.status.split(',') : []}
          lan={lan}
        />
      )}
      {!kanban && dong === null && loi === null && <DangTai />}

      {!kanban && dong?.length === 0 && (
        <Trong
          tieuDe="Không có hồ sơ nào khớp"
          moTa="Thử bỏ bớt điều kiện lọc, hoặc bấm Xoá bộ lọc để xem lại toàn bộ."
        />
      )}

      {!kanban && dong && dong.length > 0 && (
        <>
          <div className="khung-cuon" role="region" aria-label="Danh sách hồ sơ" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Mã hồ sơ</th>
                  <th>Khách hàng</th>
                  <th>Trạng thái</th>
                  <th>Áp dụng từ</th>
                  <th>TDV phụ trách</th>
                  {/*
                    Thay cho cột *Số dòng* (`0053`).

                    Số dòng sản phẩm là một con số không ai làm gì với nó ở màn
                    hình danh sách — muốn biết hồ sơ có gì thì phải mở ra xem,
                    mà mở ra thì đã có cả bảng. Chỗ ấy để cho thứ quyết định
                    được thứ tự xử lý: hồ sơ nào sắp hết giờ.
                  */}
                  <th>Hạn xử lý</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((d) => (
                  <tr key={d.policyId}>
                    <td>
                      <Lien den={`/ho-so/${d.policyId}`}>{d.code}</Lien>
                    </td>
                    <td>
                      <span className="ma-phu">{d.customerCode}</span> {d.customerName}
                    </td>
                    <td>
                      <Nhan trangThai={d.status} />
                    </td>
                    <td>{ngay(d.appliedDate)}</td>
                    <td>{d.tdvName ?? '—'}</td>
                    <td>
                      {d.sapQuaHan ? (
                        <span className="nhan nhan-loi">Sắp quá hạn</span>
                      ) : (
                        <span className="phu">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PhanTrang
            trang={trang}
            soTrang={tong === null ? trang : soTrangCua(tong)}
            {...(tong === null ? {} : { tong })}
            doiTrang={doiTrang}
            nhan="hồ sơ"
          />
        </>
      )}
    </section>
  );
}
