/**
 * Thống kê HOẠT ĐỘNG theo kỳ — nguồn của trang *Thống kê* (`0093`).
 *
 * Tách hẳn khỏi `ReportsService`, và tách vì một lý do nghiệp vụ chứ không vì độ
 * dài tệp: ba báo cáo bên kia đếm **tồn tại thời điểm** (đang chờ, quá hạn, đang
 * có hiệu lực), còn ở đây đếm **dòng chảy trong kỳ**. Hai loại con số ấy không
 * được trộn:
 *
 *   - Tồn tại thời điểm KHÔNG cộng theo kỳ được. Ba tháng mỗi tháng "40 hồ sơ
 *     đang chờ" không thành 120 — phần lớn vẫn là cùng những hồ sơ ấy.
 *   - Dòng chảy thì cộng được, so được, vẽ đường được. Chỉ nhóm này mới có mặt
 *     trong bảng `NEO` dưới đây.
 *
 * Trang *Tổng quan* giữ nguyên phần tồn tại thời điểm. Trang *Thống kê* không
 * lặp lại nó — đó là cả lý do trang này đổi tên từ *Báo cáo* (chốt 22/08).
 */
import { Injectable } from '@nestjs/common';
import {
  chuoiKy,
  DON_VI,
  kyKe,
  maKy,
  mocCungKhoang,
  MUI_GIO,
  nhanKy,
  nhanNganKy,
  type AuthUser,
  type Ky,
} from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ScopeClient } from '../infra/scope.client.js';
import { build, type PhamVi } from './filter.js';

/**
 * MỖI CHỈ SỐ NEO VÀO ĐÚNG MỘT MỐC, và bảng này là chỗ nói ra điều đó.
 *
 * "Tháng này có bao nhiêu CSBH" là câu chưa đủ nghĩa: lập trong tháng, gửi duyệt
 * trong tháng, hay có hiệu lực trong tháng? Ba con số khác nhau. Bảng tra buộc
 * mỗi chỉ số phải chọn một mốc, và nhãn trên màn hình nói lại đúng mốc ấy.
 *
 * Nguyên tắc "đếm theo mốc, không theo trạng thái" đã có tiền lệ trong chính mã
 * nguồn này: `0039` chuyển tỷ lệ trả lại sang đếm theo mốc sau khi phát hiện
 * người lập xoá hồ sơ bị từ chối là tỷ lệ của chính họ tự đẹp lên. **Trạng thái
 * đổi được, mốc thì không.**
 *
 * `quaHan` là ngoại lệ duy nhất phải kèm điều kiện trạng thái, và không có cách
 * nào khác: không có mốc `overdue_at` riêng — hạn trôi qua CHÍNH LÀ lúc hồ sơ
 * chết, nên mốc của nó là `sla_due_at`, còn việc nó đã chết thật hay được xử lý
 * kịp thì chỉ trạng thái nói được.
 */
const NEO: Record<string, { cot: string; them?: string }> = {
  lapMoi: { cot: 'created_at' },
  guiDuyet: { cot: 'submitted_at' },
  tbpKy: { cot: 'tbp_signed_at' },
  ktNhanL1: { cot: 'kt_l1_received_at' },
  banGiao: { cot: 'sa_handover_at' },
  hopDong: { cot: 'contract_issued_at' },
  coHieuLuc: { cot: 'approved_at' },
  traLai: { cot: 'returned_at' },
  tuChoi: { cot: 'rejected_at' },
  hetHieuLuc: { cot: 'deactivated_at' },
  quaHan: { cot: 'sla_due_at', them: `status = 'QUA_HAN_DUYET'` },
};

export type TenChiSo = keyof typeof NEO;

export type SoLieuKy = {
  ma: string;
  nhan: string;
  nhanNgan: string;
  tu: string;
  den: string;
  dangChay: boolean;
  /** Mười một chỉ số dòng chảy của bảng `NEO`. */
  dem: Record<string, number>;
  /** Tổng giá thu về của hồ sơ CÓ HIỆU LỰC trong kỳ, đơn vị đồng. */
  giaTri: number;
  /** Số ngày trung bình từ gửi duyệt tới có hiệu lực. `null` khi kỳ không có hồ sơ nào. */
  soNgayDuyetTb: number | null;
  chietKhauTb: number | null;
  soDong: number;
  dongVuotNguong: number;
  tyLeVuotNguong: number | null;
  /**
   * Tỷ lệ trả lại TRONG KỲ — hai vế neo vào hai mốc khác nhau, cố ý.
   *
   * Tử số là số lượt trả lại/từ chối XẢY RA trong kỳ; mẫu số là số lượt gửi
   * duyệt XẢY RA trong kỳ. Chúng không nói về cùng một tập hồ sơ (hồ sơ gửi cuối
   * tháng 7 bị trả đầu tháng 8), và đó là điều đúng cho một chỉ số dòng chảy:
   * nó đo NHỊP của kỳ, không đo số phận của một lô hồ sơ. Nhãn trên màn hình nói
   * lại đúng câu này.
   */
  tyLeTraLai: number | null;
};

export type BoThongKe = {
  ky: Ky;
  soKy: number;
  muiGio: string;
  chuoi: SoLieuKy[];
  soSanh: {
    kyNay: SoLieuKy | null;
    kyTruoc: SoLieuKy | null;
    /** Kỳ đang chạy mới đi được bao nhiêu mili-giây — kỳ trước cắt đúng chỗ này. */
    daQua: number;
    denKyTruoc: string;
  };
  /**
   * Hồ sơ nằm ở bàn ai bao lâu — trung bình số ngày của TỪNG BƯỚC, theo kỳ.
   *
   * Một truy vấn nuôi BA khối trên màn hình, và đó là lý do nó tính theo kỳ chứ
   * không chỉ cho kỳ đang xem: Ban lãnh đạo đọc thanh ngưỡng của kỳ này, Sale
   * Admin đọc đường "số ngày làm bản cứng" qua các kỳ, Trưởng bộ phận đọc riêng
   * quãng nằm trên bàn mình.
   *
   * Neo vào `approved_at`: chỉ hồ sơ ĐÃ ĐI HẾT mới có đủ bốn quãng. Neo vào lúc
   * gửi thì hồ sơ đang dở dang kéo trung bình xuống, và kỳ nào cũng "nhanh hơn"
   * chỉ vì phần chậm chưa xong.
   */
  buoc: Record<string, ThoiGianBuoc>;
  /** Số hồ sơ `LEGACY` bị loại khỏi mọi con số ở trên. */
  loaiTruLegacy: number;
  /**
   * TRUNG VỊ số CSBH có hiệu lực của MỘT trình dược viên, từng kỳ.
   *
   * Để một TDV biết mình đứng ở đâu mà **không phải bày tên ai khác ra**. Đây là
   * ngoại lệ có chủ ý của luật phạm vi: nó tính trên toàn công ty, không theo
   * phạm vi người gọi — nhưng nó là một con số gộp, không kèm tên, không kèm mã
   * hồ sơ, nên nó không lộ dữ liệu của ai.
   *
   * TRUNG VỊ chứ không phải trung bình: một người làm gấp năm lần kéo trung bình
   * lên và mọi người còn lại đều thành "dưới mức", một kết luận sai về chín
   * người để mô tả đúng một người.
   */
  trungVi: Record<string, number>;
};

export type DongTdv = {
  guiDuyet?: number;
  coHieuLuc?: number;
  traLai?: number;
  tuChoi?: number;
  giaTri?: number;
};

/** Cơ cấu kết cục của hồ sơ một người GỬI TRONG KỲ — năm ô, cộng lại là 100%. */
export type ChatLuong = {
  kyThang: number;
  traLai1: number;
  traLaiNhieu: number;
  tuChoi: number;
  dangXuLy: number;
};

export type MaXuHuong = 'len' | 'ngang' | 'chung' | 'xuong';

/** Bốn quãng chờ của một hồ sơ, tính bằng ngày. `null` khi kỳ không có hồ sơ nào. */
export type ThoiGianBuoc = {
  choTbp: number | null;
  choKtL1: number | null;
  saLamBanCung: number | null;
  choKtL2: number | null;
};

/** Kỳ không có hồ sơ nào — năm ô đều 0, và tỷ lệ suy ra là không xác định. */
const RONG: ChatLuong = { kyThang: 0, traLai1: 0, traLaiNhieu: 0, tuChoi: 0, dangXuLy: 0 };

export type NguoiThongKe = {
  userId: string;
  ten: string;
  kyNay: { guiDuyet: number; coHieuLuc: number; traLai: number; tuChoi: number; giaTri: number };
  /** Chuỗi theo kỳ để vẽ đường nhỏ — cùng trục thời gian với `chuoi`. */
  chuoiHieuLuc: number[];
  chuoiGui: number[];
  xuHuong: MaXuHuong;
  xuHuongGui: MaXuHuong;
  tyLeTraLai: number | null;
  chatLuong: ChatLuong;
  chatLuongTheoKy: ChatLuong[];
  suaLaiNgay: number | null;
};

export type BoTheoTdv = {
  ky: Ky;
  soKy: number;
  chuoi: { ma: string; nhan: string; nhanNgan: string; tu: string; den: string; dangChay: boolean }[];
  nguoi: NguoiThongKe[];
};

/**
 * Ngưỡng đổi nhãn xu hướng.
 *
 * Không đối xứng, và cố ý: đi xuống 15% đáng chú ý hơn đi lên 15%, còn sụt quá
 * một phần ba thì là chuyện khác hẳn — nên nó có nhãn riêng.
 */
export const NGUONG_LEN = 0.15;
export const NGUONG_CHUNG = -0.15;
export const NGUONG_SUT = -0.3;

/**
 * Xu hướng của một chuỗi: trung bình 3 kỳ ĐÃ ĐÓNG gần nhất so với 3 kỳ trước đó.
 *
 * KỲ ĐANG CHẠY BỊ LOẠI khỏi phép so — nó chưa đủ ngày, và tính nó vào thì đầu
 * mỗi kỳ ai cũng "đang xuống". Đây là hệ quả trực tiếp của quy tắc "kỳ đang chạy
 * so cùng số ngày" ở `0093`: chỗ nào so hai kỳ với nhau thì chỗ ấy phải cùng độ
 * dài, mà cách rẻ nhất để bảo đảm điều đó là chỉ dùng kỳ đã đóng.
 *
 * Tính ở MÁY CHỦ, không ở giao diện — cùng nguyên tắc "giao diện không tính
 * toán" (`FE-27`). Hai màn hình dùng chung một luật, không phải hai bản cài đặt.
 */
export function xuHuong(chuoi: number[]): MaXuHuong {
  const d = chuoi.slice(0, -1);
  if (d.length < 4) return 'ngang';
  const n = Math.min(3, Math.floor(d.length / 2));
  const tb = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const truoc = tb(d.slice(-2 * n, -n));
  const sau = tb(d.slice(-n));
  if (truoc === 0) return sau > 0 ? 'len' : 'ngang';
  const lech = (sau - truoc) / truoc;
  if (lech >= NGUONG_LEN) return 'len';
  if (lech <= NGUONG_SUT) return 'xuong';
  if (lech <= NGUONG_CHUNG) return 'chung';
  return 'ngang';
}

/** Cộng một chỉ số qua mọi kỳ của một người. */
const chuoiTong = (maKyDs: string[], theoKy: Record<string, DongTdv>, khoa: keyof DongTdv): number =>
  maKyDs.reduce((a, m) => a + (theoKy[m]?.[khoa] ?? 0), 0);

/** Làm tròn hai chữ số như mọi tỷ lệ khác trong hệ (muc 7). */
const phanTram = (tu: number, mau: number): number | null =>
  mau === 0 ? null : Number(((tu / mau) * 100).toFixed(2));

@Injectable()
export class ThongKeService {
  constructor(
    private readonly db: Db,
    private readonly scope: ScopeClient,
  ) {}

  async chuoi(me: AuthUser, ky: Ky, soKy: number, bayGio = new Date()): Promise<BoThongKe> {
    const pv = await this.scope.phamViCua(me);
    const cacKy = chuoiKy(ky, soKy, bayGio);
    const tu = cacKy[0]!.tu;
    const den = cacKy[cacKy.length - 1]!.den;

    const [dem, tien, dong, legacy, trungVi, buoc] = await Promise.all([
      this.dem(pv, ky, tu, den),
      this.tien(pv, ky, tu, den),
      this.dong(pv, ky, tu, den),
      this.legacy(pv, tu),
      this.trungVi(ky, tu, den),
      this.theoBuoc(pv, ky, tu, den),
    ]);

    const chuoi = cacKy.map((k) => gop(k, dem, tien, dong));

    /*
     * KỲ TRƯỚC CẮT CÙNG SỐ NGÀY.
     *
     * Hôm nay ngày 22 mà đặt tháng này cạnh cả tháng trước là so 22 ngày với 31
     * ngày: mọi chỉ số đều "giảm", và cái giảm ấy không nói gì về công việc.
     *
     * Chạy lại đúng bộ truy vấn trên một khoảng hẹp hơn thay vì trừ số: các chỉ
     * số trung bình (`soNgayDuyetTb`, `chietKhauTb`) không trừ được, và một bộ
     * số nửa tính lại nửa trừ ra là bộ số không ai kiểm được.
     */
    const { daQua, denKyTruoc } = mocCungKhoang(ky, bayGio);
    const dauTruoc = kyKe(ky, bayGio, -1);
    const [demT, tienT, dongT] = await Promise.all([
      this.dem(pv, ky, dauTruoc.toISOString(), denKyTruoc),
      this.tien(pv, ky, dauTruoc.toISOString(), denKyTruoc),
      this.dong(pv, ky, dauTruoc.toISOString(), denKyTruoc),
    ]);
    const kyTruoc = gop(
      {
        ma: maKy(ky, dauTruoc),
        nhan: nhanKy(ky, dauTruoc),
        nhanNgan: nhanNganKy(ky, dauTruoc),
        tu: dauTruoc.toISOString(),
        den: denKyTruoc,
        dangChay: false,
      },
      demT,
      tienT,
      dongT,
    );

    return {
      ky,
      soKy,
      muiGio: MUI_GIO,
      chuoi,
      soSanh: {
        kyNay: chuoi[chuoi.length - 1] ?? null,
        kyTruoc,
        daQua,
        denKyTruoc,
      },
      loaiTruLegacy: legacy,
      trungVi,
      buoc,
    };
  }

  /** Bốn quãng chờ, trung bình theo kỳ — xem chú thích của `buoc` ở `BoThongKe`. */
  private async theoBuoc(
    pv: PhamVi,
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Record<string, ThoiGianBuoc>> {
    const { where, params } = build({}, pv);
    params.push(tu, den);
    const i = params.length;
    const ngay = (a: string, b: string) =>
      `avg(EXTRACT(EPOCH FROM (${a} - ${b})) / 86400)
         FILTER (WHERE ${a} IS NOT NULL AND ${b} IS NOT NULL)::numeric(10,2)::text`;

    const rows = await this.db.q<Record<string, string | null>>(
      `SELECT ${maSql(ky, 'approved_at')} AS ky,
              ${ngay('tbp_signed_at', 'submitted_at')} AS cho_tbp,
              ${ngay('kt_l1_received_at', 'tbp_signed_at')} AS cho_kt1,
              ${ngay('sa_handover_at', 'kt_l1_received_at')} AS sa_lam,
              ${ngay('approved_at', 'sa_handover_at')} AS cho_kt2
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY'
          AND approved_at >= $${i - 1}::timestamptz AND approved_at < $${i}::timestamptz
        GROUP BY 1`,
      params,
    );

    const so = (v: string | null) => (v === null ? null : Number(v));
    return Object.fromEntries(
      rows.map((r) => [
        String(r['ky']),
        {
          choTbp: so(r['cho_tbp'] ?? null),
          choKtL1: so(r['cho_kt1'] ?? null),
          saLamBanCung: so(r['sa_lam'] ?? null),
          choKtL2: so(r['cho_kt2'] ?? null),
        },
      ]),
    );
  }

  /**
   * Trung vị số CSBH có hiệu lực trên MỘT trình dược viên, theo từng kỳ.
   *
   * KHÔNG lọc phạm vi — xem chú thích của `trungVi` ở kiểu `BoThongKe`. Chỉ đếm
   * người CÓ ít nhất một hồ sơ có hiệu lực trong kỳ ấy: gộp cả người không có gì
   * vào mẫu thì trung vị tụt về 0 ngay khi công ty tuyển thêm người, và con số
   * đọc ra thành "mặt bằng chung đang giảm".
   */
  private async trungVi(ky: Ky, tu: string, den: string): Promise<Record<string, number>> {
    const rows = await this.db.q<{ ky: string; giua: string }>(
      `WITH theo_nguoi AS (
         SELECT ${maSql(ky, 'approved_at')} AS ky, tdv_user_id, count(*) AS n
           FROM rpt.policy_row
          WHERE source <> 'LEGACY'
            AND approved_at >= $1::timestamptz AND approved_at < $2::timestamptz
          GROUP BY 1, 2
       )
       SELECT ky, percentile_cont(0.5) WITHIN GROUP (ORDER BY n)::numeric(10,2)::text AS giua
         FROM theo_nguoi GROUP BY ky`,
      [tu, den],
    );
    return Object.fromEntries(rows.map((r) => [r.ky, Number(r.giua)]));
  }

  /**
   * Tách chỉ số THEO TỪNG TRÌNH DƯỢC VIÊN (`0094`, chốt 23/08).
   *
   * MỘT endpoint cho HAI vai trò, và khác biệt nằm ở phạm vi chứ không ở mã:
   *
   *   - **Ban lãnh đạo** có phạm vi toàn hệ thống, nên nhận về mọi TDV.
   *   - **Trưởng bộ phận** có phạm vi là hồ sơ mang tên mình ở cột TBP, nên nhận
   *     về đúng những người đã gửi hồ sơ tới bàn họ — chính là *phương án A* đã
   *     chốt cho câu hỏi "TDV nào thuộc quản lý của tôi". Hệ thống KHÔNG có cây
   *     tổ chức (`16/08`), nên đây là câu trả lời duy nhất đọc được từ dữ liệu.
   *
   * `build({}, pv)` lo cả hai — cùng mệnh đề phạm vi mà mọi báo cáo khác dùng,
   * không phải một luật thứ hai chạy song song.
   *
   * DANH SÁCH NGƯỜI LẤY THEO CẢ CỬA SỔ, KHÔNG THEO KỲ ĐANG XEM. Lấy theo kỳ thì
   * người **ngừng gửi hẳn biến mất khỏi bảng** — mà đó đúng là ca "chững" nặng
   * nhất, ca cần thấy nhất. Ai không có hồ sơ nào trong kỳ này vẫn hiện, với số 0.
   */
  async theoTdv(me: AuthUser, ky: Ky, soKy: number, bayGio = new Date()): Promise<BoTheoTdv> {
    const pv = await this.scope.phamViCua(me);
    const cacKy = chuoiKy(ky, soKy, bayGio);
    const tu = cacKy[0]!.tu;
    const den = cacKy[cacKy.length - 1]!.den;
    const maKyDs = cacKy.map((k) => k.ma);

    const [dem, chatLuong, suaLai] = await Promise.all([
      this.demTheoTdv(pv, ky, tu, den),
      this.chatLuongTheoTdv(pv, ky, tu, den),
      this.suaLaiTheoTdv(pv, tu, den),
    ]);

    const nguoi = [...dem.values()]
      .map((n) => {
        const chuoiHieuLuc = maKyDs.map((m) => n.theoKy[m]?.coHieuLuc ?? 0);
        const chuoiGui = maKyDs.map((m) => n.theoKy[m]?.guiDuyet ?? 0);
        const cuoi = n.theoKy[maKyDs[maKyDs.length - 1]!] ?? {};
        const clTheoKy = chatLuong.get(n.userId) ?? {};
        const cl = clTheoKy[maKyDs[maKyDs.length - 1]!];
        return {
          userId: n.userId,
          ten: n.ten,
          kyNay: {
            guiDuyet: cuoi.guiDuyet ?? 0,
            coHieuLuc: cuoi.coHieuLuc ?? 0,
            traLai: cuoi.traLai ?? 0,
            tuChoi: cuoi.tuChoi ?? 0,
            giaTri: cuoi.giaTri ?? 0,
          },
          chuoiHieuLuc,
          chuoiGui,
          /* Hai nhãn xu hướng cho hai màn hình: Ban lãnh đạo đếm hồ sơ có hiệu
             lực, Trưởng bộ phận đếm hồ sơ gửi tới bàn mình. Tính cả hai ở đây
             thay vì để giao diện chọn — giao diện không tính toán. */
          xuHuong: xuHuong(chuoiHieuLuc),
          xuHuongGui: xuHuong(chuoiGui),
          tyLeTraLai: phanTram(
            chuoiTong(maKyDs, n.theoKy, 'traLai') + chuoiTong(maKyDs, n.theoKy, 'tuChoi'),
            chuoiTong(maKyDs, n.theoKy, 'guiDuyet'),
          ),
          chatLuong: cl ?? RONG,
          /* Cả chuỗi chất lượng, để vẽ đường "tỷ lệ ký thẳng" qua các kỳ. Không
             tính sẵn tỷ lệ ở đây: kỳ không có hồ sơ nào thì tỷ lệ là KHÔNG XÁC
             ĐỊNH, và một số 0 ở giữa đường đọc ra là "kỳ ấy hỏng hết". */
          chatLuongTheoKy: maKyDs.map((m) => clTheoKy[m] ?? RONG),
          suaLaiNgay: suaLai.get(n.userId) ?? null,
        };
      })
      // Sắp giảm dần theo việc của kỳ đang xem; màn hình nào cần thứ tự khác thì
      // tự sắp — nhưng thứ tự mặc định phải là thứ tự người ta đọc trước.
      .sort((a, b) => b.kyNay.coHieuLuc - a.kyNay.coHieuLuc || b.kyNay.guiDuyet - a.kyNay.guiDuyet);

    return { ky, soKy, chuoi: cacKy, nguoi };
  }

  /**
   * Chiết khấu bình quân và tỷ lệ vượt ngưỡng, TÁCH THEO NHÓM SẢN PHẨM.
   *
   * Khối riêng của Ban lãnh đạo, và là chỉ số quan trọng nhất của cả trang với
   * họ: một quý nhích nửa điểm phần trăm trên toàn danh mục là con số không ai
   * thấy được bằng cách mở từng hồ sơ.
   *
   * Neo vào `approved_at` — chính sách giá chỉ có nghĩa khi nó đã có hiệu lực.
   */
  async theoNhom(
    me: AuthUser,
    ky: Ky,
    soKy: number,
    bayGio = new Date(),
  ): Promise<{
    ky: Ky;
    chuoi: { ma: string; nhan: string; nhanNgan: string }[];
    dong: { nhom: string; maKy: string; chietKhauTb: number; soDong: number; vuotNguong: number }[];
  }> {
    const pv = await this.scope.phamViCua(me);
    const cacKy = chuoiKy(ky, soKy, bayGio);
    const { where, params } = build({}, pv);
    params.push(cacKy[0]!.tu, cacKy[cacKy.length - 1]!.den);
    const i = params.length;

    const rows = await this.db.q<{
      nhom: string | null;
      ky: string;
      ck: string | null;
      n: string;
      vuot: string;
    }>(
      `SELECT l.group_code AS nhom, ${maSql(ky, 'r.approved_at')} AS ky,
              avg(l.discount_rate)::numeric(6,2)::text AS ck,
              count(*)::text AS n,
              count(*) FILTER (WHERE l.over_threshold)::text AS vuot
         FROM rpt.policy_row r
         JOIN rpt.policy_line l ON l.policy_id = r.policy_id
        WHERE ${where} AND r.source <> 'LEGACY'
          AND r.approved_at >= $${i - 1}::timestamptz AND r.approved_at < $${i}::timestamptz
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      params,
    );

    return {
      ky,
      chuoi: cacKy.map((k) => ({ ma: k.ma, nhan: k.nhan, nhanNgan: k.nhanNgan })),
      dong: rows.map((r) => ({
        // Sản phẩm chưa gán nhóm vẫn phải hiện ra, và hiện dưới đúng cái tên
        // nó có: một dòng biến mất khỏi bảng chiết khấu là một dòng không ai đi
        // tìm. Nhãn tiếng Việt do màn hình đặt.
        nhom: r.nhom ?? '',
        maKy: r.ky,
        chietKhauTb: Number(r.ck ?? 0),
        soDong: Number(r.n),
        vuotNguong: Number(r.vuot),
      })),
    };
  }

  /**
   * Bốn phép đếm và một phép cộng tiền, gom theo (người × kỳ).
   *
   * Bốn chỉ số chứ không phải mười một của `NEO`: đây là bảng người, và một
   * bảng mười một cột theo người thì quay về đúng cái bảng số mà `0094` vừa bỏ.
   * Bốn cái này là bốn cái vẽ được thành hình — gửi lên, xong, bị trả, bị từ chối.
   */
  private async demTheoTdv(
    pv: PhamVi,
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, { userId: string; ten: string; theoKy: Record<string, DongTdv> }>> {
    const NEO_TDV: Record<string, string> = {
      guiDuyet: 'submitted_at',
      coHieuLuc: 'approved_at',
      traLai: 'returned_at',
      tuChoi: 'rejected_at',
    };
    const { where, params } = build({}, pv);
    params.push(tu, den);
    const i = params.length;

    const nhanh = Object.entries(NEO_TDV).map(
      ([ten, cot]) => `SELECT '${ten}' AS chi_so, tdv_user_id::text AS nguoi,
              max(tdv_name) AS ten, ${maSql(ky, cot)} AS ky,
              count(*)::text AS n, '0' AS tien
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY'
          AND ${cot} >= $${i - 1}::timestamptz AND ${cot} < $${i}::timestamptz
        GROUP BY 2, 4`,
    );
    // Tiền đi cùng một câu lệnh, cùng neo `approved_at` — để nó không bao giờ
    // đọc một ảnh chụp dữ liệu khác với phép đếm nằm ngay cạnh trên màn hình.
    nhanh.push(`SELECT 'giaTri' AS chi_so, tdv_user_id::text AS nguoi,
              max(tdv_name) AS ten, ${maSql(ky, 'approved_at')} AS ky,
              '0' AS n, sum(total_net)::text AS tien
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY'
          AND approved_at >= $${i - 1}::timestamptz AND approved_at < $${i}::timestamptz
        GROUP BY 2, 4`);

    const rows = await this.db.q<{
      chi_so: string;
      nguoi: string;
      ten: string | null;
      ky: string;
      n: string;
      tien: string;
    }>(nhanh.join('\nUNION ALL\n'), params);

    const ra = new Map<string, { userId: string; ten: string; theoKy: Record<string, DongTdv> }>();
    for (const r of rows) {
      const nguoi = ra.get(r.nguoi) ?? {
        userId: r.nguoi,
        // Tên trống thì hiện mã rút gọn chứ không để trống hẳn: một dòng không
        // tên trong bảng xếp hạng là một dòng không ai tra lại được.
        ten: r.ten ?? `#${r.nguoi.slice(0, 8)}`,
        theoKy: {},
      };
      if (r.ten) nguoi.ten = r.ten;
      const o = (nguoi.theoKy[r.ky] ?? {}) as DongTdv;
      if (r.chi_so === 'giaTri') o.giaTri = Number(r.tien);
      else (o as Record<string, number>)[r.chi_so] = Number(r.n);
      nguoi.theoKy[r.ky] = o;
      ra.set(r.nguoi, nguoi);
    }
    return ra;
  }

  /**
   * Cơ cấu chất lượng hồ sơ của KỲ ĐANG XEM, theo từng người (`0094`).
   *
   * Neo vào `submitted_at`: câu hỏi là *"hồ sơ gửi tới bàn tôi trong kỳ này đi về
   * đâu"*, nên tập hồ sơ phải cố định theo lúc GỬI, không theo lúc kết thúc. Neo
   * vào lúc kết thúc thì hồ sơ gửi cuối kỳ trước mà ký đầu kỳ này lại đếm vào kỳ
   * này, và tổng của một người không còn khớp với số họ đã gửi.
   *
   * NĂM ô chứ không bốn: `dangXuLy` là hồ sơ chưa ngã ngũ. Bỏ nó đi thì thanh
   * 100% của kỳ đang chạy nói dối — nó sẽ chia hết phần trăm cho những hồ sơ đã
   * xong, trong khi nửa số hồ sơ còn đang nằm đâu đó trong luồng.
   *
   * Thứ tự phân loại có ý: **từ chối thắng**. Một hồ sơ bị trả lại hai lần rồi
   * bị từ chối thì kết cục của nó là từ chối; đếm nó vào ô "trả lại từ 2 lần" là
   * giấu mất cái kết cục nặng hơn.
   */
  private async chatLuongTheoTdv(
    pv: PhamVi,
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, Record<string, ChatLuong>>> {
    const { where, params } = build({}, pv);
    params.push(tu, den);
    const i = params.length;

    const rows = await this.db.q<Record<string, string | null>>(
      `SELECT tdv_user_id::text AS nguoi, ${maSql(ky, 'submitted_at')} AS ky,
              count(*) FILTER (WHERE rejected_at IS NOT NULL)::text AS tu_choi,
              count(*) FILTER (WHERE rejected_at IS NULL AND so_lan_tbp_tra_lai >= 2)::text AS tra_nhieu,
              count(*) FILTER (WHERE rejected_at IS NULL AND so_lan_tbp_tra_lai = 1)::text AS tra_1,
              count(*) FILTER (WHERE rejected_at IS NULL AND so_lan_tbp_tra_lai = 0
                                 AND tbp_signed_at IS NOT NULL)::text AS ky_thang,
              count(*) FILTER (WHERE rejected_at IS NULL AND so_lan_tbp_tra_lai = 0
                                 AND tbp_signed_at IS NULL)::text AS dang_xu_ly
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY'
          AND submitted_at >= $${i - 1}::timestamptz AND submitted_at < $${i}::timestamptz
        GROUP BY 1, 2`,
      params,
    );

    const ra = new Map<string, Record<string, ChatLuong>>();
    for (const r of rows) {
      const nguoi = String(r['nguoi']);
      const o = ra.get(nguoi) ?? {};
      o[String(r['ky'])] = {
        kyThang: Number(r['ky_thang'] ?? 0),
        traLai1: Number(r['tra_1'] ?? 0),
        traLaiNhieu: Number(r['tra_nhieu'] ?? 0),
        tuChoi: Number(r['tu_choi'] ?? 0),
        dangXuLy: Number(r['dang_xu_ly'] ?? 0),
      };
      ra.set(nguoi, o);
    }
    return ra;
  }

  /**
   * Trả lại rồi bao lâu TDV mới gửi lại — trung bình trên CẢ CỬA SỔ.
   *
   * Truy vấn RIÊNG chứ không phải một cột trong câu trên, và đó là một lần sửa
   * lỗi chứ không phải chuyện gọn gàng: bản đầu viết nó thành truy vấn con
   * `SELECT … FROM rpt.policy_row s WHERE s.tdv_user_id = r.tdv_user_id` — mà
   * truy vấn con ấy **không mang mệnh đề phạm vi**. Một Trưởng bộ phận sẽ đọc
   * được số ngày sửa của TDV tính trên MỌI hồ sơ của người đó, kể cả hồ sơ chưa
   * bao giờ đi qua bàn mình.
   *
   * Cửa sổ rộng hơn kỳ đang xem vì mẫu số ở đây mỏng: một người bị trả lại vài
   * lần một quý là bình thường, và trung bình của hai con số thì nói được rất ít.
   */
  private async suaLaiTheoTdv(
    pv: PhamVi,
    tu: string,
    den: string,
  ): Promise<Map<string, number>> {
    const { where, params } = build({}, pv);
    params.push(tu, den);
    const i = params.length;
    const rows = await this.db.q<{ nguoi: string; ngay: string | null }>(
      `SELECT tdv_user_id::text AS nguoi, avg(sua_lai_ngay)::numeric(6,2)::text AS ngay
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY' AND sua_lai_ngay IS NOT NULL
          AND submitted_at >= $${i - 1}::timestamptz AND submitted_at < $${i}::timestamptz
        GROUP BY tdv_user_id`,
      params,
    );
    return new Map(
      rows.filter((r) => r.ngay !== null).map((r) => [r.nguoi, Number(r.ngay)]),
    );
  }

  /** Mười một phép đếm dòng chảy trong MỘT câu lệnh — xem `NEO`. */
  private async dem(
    pv: PhamVi,
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, Record<string, number>>> {
    const { where, params } = build({}, pv);
    params.push(tu, den);
    const i = params.length;

    /*
     * `UNION ALL` mười một nhánh thay vì mười một lượt gọi.
     *
     * Mỗi nhánh là một phép gom nhóm trên cùng một tập đã lọc phạm vi, nên chi
     * phí thật nằm ở phép lọc ấy — gộp vào một câu thì Postgres chỉ phải dựng
     * kế hoạch một lần và mọi con số trả về từ CÙNG MỘT ảnh chụp dữ liệu. Mười
     * một lượt gọi rời thì hai chỉ số cạnh nhau trên màn hình có thể đọc hai
     * thời điểm khác nhau.
     */
    const nhanh = Object.entries(NEO).map(
      ([ten, n]) => `SELECT '${ten}' AS chi_so, ${maSql(ky, n.cot)} AS ky, count(*)::text AS n
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY'
          AND ${n.cot} >= $${i - 1}::timestamptz AND ${n.cot} < $${i}::timestamptz
          ${n.them ? `AND ${n.them}` : ''}
        GROUP BY 2`,
    );

    const rows = await this.db.q<{ chi_so: string; ky: string; n: string }>(
      nhanh.join('\nUNION ALL\n'),
      params,
    );
    const ra = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const o = ra.get(r.ky) ?? {};
      o[r.chi_so] = Number(r.n);
      ra.set(r.ky, o);
    }
    return ra;
  }

  /** Giá trị và thời gian duyệt — cùng neo `approved_at`. */
  private async tien(
    pv: PhamVi,
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, { giaTri: number; ngay: number | null }>> {
    const { where, params } = build({}, pv);
    params.push(tu, den);
    const i = params.length;
    const rows = await this.db.q<{ ky: string; tong: string | null; ngay: string | null }>(
      `SELECT ${maSql(ky, 'approved_at')} AS ky,
              sum(total_net)::text AS tong,
              avg(EXTRACT(EPOCH FROM (approved_at - submitted_at)) / 86400)
                FILTER (WHERE submitted_at IS NOT NULL)::numeric(10,2)::text AS ngay
         FROM rpt.policy_row
        WHERE ${where} AND source <> 'LEGACY'
          AND approved_at >= $${i - 1}::timestamptz AND approved_at < $${i}::timestamptz
        GROUP BY 1`,
      params,
    );
    return new Map(
      rows.map((r) => [
        r.ky,
        { giaTri: Number(r.tong ?? 0), ngay: r.ngay === null ? null : Number(r.ngay) },
      ]),
    );
  }

  /** Dòng sản phẩm của hồ sơ có hiệu lực trong kỳ — chiết khấu và ngưỡng. */
  private async dong(
    pv: PhamVi,
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, { soDong: number; ck: number | null; vuot: number }>> {
    const { where, params } = build({}, pv);
    params.push(tu, den);
    const i = params.length;
    const rows = await this.db.q<{ ky: string; n: string; ck: string | null; vuot: string }>(
      `SELECT ${maSql(ky, 'r.approved_at')} AS ky, count(*)::text AS n,
              avg(l.discount_rate)::numeric(6,2)::text AS ck,
              count(*) FILTER (WHERE l.over_threshold)::text AS vuot
         FROM rpt.policy_row r
         JOIN rpt.policy_line l ON l.policy_id = r.policy_id
        WHERE ${where} AND r.source <> 'LEGACY'
          AND r.approved_at >= $${i - 1}::timestamptz AND r.approved_at < $${i}::timestamptz
        GROUP BY 1`,
      params,
    );
    return new Map(
      rows.map((r) => [
        r.ky,
        { soDong: Number(r.n), ck: r.ck === null ? null : Number(r.ck), vuot: Number(r.vuot) },
      ]),
    );
  }

  /**
   * Hồ sơ `LEGACY` bị loại — và ĐẾM RA để người đọc biết mình không thấy gì.
   *
   * Dữ liệu CSBH cũ nhập từ Excel không đi qua luồng duyệt nào, nên nó không có
   * mốc gửi duyệt, không có mốc ký, không có mốc tiếp nhận. Để lẫn vào thì cột
   * "lập mới" và "có hiệu lực" nhảy vọt ở đúng kỳ nhập dữ liệu, còn mọi cột giữa
   * luồng vẫn bằng 0 — một hình ảnh sai mà không có gì giải thích.
   *
   * Đúng cách khối SLA đang làm với `excludedLegacy`.
   */
  private async legacy(pv: PhamVi, tu: string): Promise<number> {
    const { where, params } = build({}, pv);
    params.push(tu);
    const r = await this.db.one<{ n: string }>(
      `SELECT count(*)::text AS n FROM rpt.policy_row
        WHERE ${where} AND source = 'LEGACY'
          AND (created_at >= $${params.length}::timestamptz
            OR approved_at >= $${params.length}::timestamptz)`,
      params,
    );
    return Number(r?.n ?? 0);
  }
}

/**
 * Khoá kỳ trong SQL — cắt theo GIỜ VIỆT NAM rồi in ra `YYYY-MM-DD`.
 *
 * `AT TIME ZONE` ở đây TRÔNG NHƯ THỪA: `postgresql.conf` đã đặt `timezone =
 * 'Asia/Ho_Chi_Minh'`, nên `date_trunc` trên một `timestamptz` vốn đã cắt theo
 * giờ Việt Nam. Nó không thừa, và lý do là chỗ dựa: bỏ nó đi thì phép cắt kỳ
 * phụ thuộc vào MỘT DÒNG CẤU HÌNH ở tệp khác — một máy chủ dựng lại bằng ảnh
 * Postgres mặc định (UTC) sẽ cho ra những con số lệch bảy tiếng ở mọi ranh giới
 * kỳ, và không có gì trên màn hình nói ra điều đó.
 *
 * Vì cấu hình đang đúng nên một ca kiểm HTTP thường KHÔNG phân biệt được hai
 * bản. Ca phân biệt được nằm ở `thong-ke.test.ts`: nó đặt phiên về UTC rồi gọi
 * chính hàm này.
 *
 * `DON_VI[ky]` là bảng tra trong `http-kit`, không phải chuỗi người dùng gửi
 * lên: `date_trunc` nhận đơn vị dạng chuỗi, nên ghép thẳng tham số vào đây là mở
 * một chỗ tiêm SQL. `docKy()` chặn ở cửa, bảng tra chặn lần thứ hai.
 *
 * Chuỗi in ra khớp đúng `maKy()` bên JS, nên hai bên ghép được với nhau mà không
 * cần bảng đối chiếu nào.
 */
export const maSql = (ky: Ky, cot: string): string =>
  `to_char(date_trunc('${DON_VI[ky]}', ${cot} AT TIME ZONE '${MUI_GIO}'), 'YYYY-MM-DD')`;

/** Ghép ba nguồn số liệu vào một dòng kỳ. Kỳ không có gì thì mọi ô là 0, không phải trống. */
function gop(
  k: { ma: string; nhan: string; nhanNgan: string; tu: string; den: string; dangChay: boolean },
  dem: Map<string, Record<string, number>>,
  tien: Map<string, { giaTri: number; ngay: number | null }>,
  dong: Map<string, { soDong: number; ck: number | null; vuot: number }>,
): SoLieuKy {
  const d = dem.get(k.ma) ?? {};
  const t = tien.get(k.ma);
  const l = dong.get(k.ma);
  const demDu = Object.fromEntries(Object.keys(NEO).map((ten) => [ten, d[ten] ?? 0]));
  const guiDuyet = demDu['guiDuyet'] ?? 0;
  const traVe = (demDu['traLai'] ?? 0) + (demDu['tuChoi'] ?? 0);
  return {
    ...k,
    dem: demDu,
    giaTri: t?.giaTri ?? 0,
    soNgayDuyetTb: t?.ngay ?? null,
    chietKhauTb: l?.ck ?? null,
    soDong: l?.soDong ?? 0,
    dongVuotNguong: l?.vuot ?? 0,
    tyLeVuotNguong: l === undefined ? null : phanTram(l.vuot, l.soDong),
    tyLeTraLai: phanTram(traVe, guiDuyet),
  };
}
