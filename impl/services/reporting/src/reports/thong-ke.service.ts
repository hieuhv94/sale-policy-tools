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
  type AuthUser,
  type Ky,
} from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ScopeClient } from '../infra/scope.client.js';
import { build } from './filter.js';

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
  /** Số hồ sơ `LEGACY` bị loại khỏi mọi con số ở trên. */
  loaiTruLegacy: number;
};

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
    const ids = await this.scope.userIdsFor(me);
    const cacKy = chuoiKy(ky, soKy, bayGio);
    const tu = cacKy[0]!.tu;
    const den = cacKy[cacKy.length - 1]!.den;

    const [dem, tien, dong, legacy] = await Promise.all([
      this.dem(ids, ky, tu, den),
      this.tien(ids, ky, tu, den),
      this.dong(ids, ky, tu, den),
      this.legacy(ids, tu),
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
      this.dem(ids, ky, dauTruoc.toISOString(), denKyTruoc),
      this.tien(ids, ky, dauTruoc.toISOString(), denKyTruoc),
      this.dong(ids, ky, dauTruoc.toISOString(), denKyTruoc),
    ]);
    const kyTruoc = gop(
      {
        ma: maKy(ky, dauTruoc),
        nhan: nhanKy(ky, dauTruoc),
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
    };
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
    chuoi: { ma: string; nhan: string }[];
    dong: { nhom: string; maKy: string; chietKhauTb: number; soDong: number; vuotNguong: number }[];
  }> {
    const ids = await this.scope.userIdsFor(me);
    const cacKy = chuoiKy(ky, soKy, bayGio);
    const { where, params } = build({}, ids);
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
      chuoi: cacKy.map((k) => ({ ma: k.ma, nhan: k.nhan })),
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

  /** Mười một phép đếm dòng chảy trong MỘT câu lệnh — xem `NEO`. */
  private async dem(
    ids: string[],
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, Record<string, number>>> {
    const { where, params } = build({}, ids);
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
    ids: string[],
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, { giaTri: number; ngay: number | null }>> {
    const { where, params } = build({}, ids);
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
    ids: string[],
    ky: Ky,
    tu: string,
    den: string,
  ): Promise<Map<string, { soDong: number; ck: number | null; vuot: number }>> {
    const { where, params } = build({}, ids);
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
  private async legacy(ids: string[], tu: string): Promise<number> {
    const { where, params } = build({}, ids);
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
  k: { ma: string; nhan: string; tu: string; den: string; dangChay: boolean },
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
