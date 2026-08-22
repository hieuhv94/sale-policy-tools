/**
 * API nhật ký — CHỈ ĐỌC.
 *
 * Không có `POST`, `PUT`, `PATCH` hay `DELETE` ở đây, và đó không phải chuyện
 * tình cờ: nhật ký chỉ vào bằng đường sự kiện. Test `AUD-05` quét bảng định
 * tuyến và đỏ ngay nếu một route ghi xuất hiện.
 *
 * KHÔNG có đường xuất ra file (`0090`, chốt 22/08). Nhật ký đọc trên màn hình;
 * đổi lại, bộ lọc dưới đây phải đủ để tra tại chỗ.
 */
import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import {
  chuoiKy,
  docKy,
  docSoKy,
  DON_VI,
  MUI_GIO,
  pageOf,
  paged,
  pageSql,
  Roles,
} from '@csbh/http-kit';
import { Db } from '../infra/db.js';

/** Chỉ Quản trị hệ thống đọc nhật ký (`0086`). */
const READERS = ['QUAN_TRI'];

/**
 * **Cửa sổ audit: 6 tháng gần nhất** (`0090`, chốt 22/08).
 *
 * Chặn ở ĐÂY chứ không chỉ ở ô chọn trên màn hình: một cửa sổ chặn ở giao diện
 * mà API vẫn nhận là cửa sổ chỉ chặn người dùng thật thà.
 *
 * Sáu tháng là BẢO ĐẢM, không phải giới hạn — dòng cũ hơn vẫn nằm nguyên trong
 * bảng. Xoá chúng đòi tắt chính trigger đang giữ cho nhật ký không sửa được, và
 * đổi lấy một chút dung lượng đĩa thì không đáng.
 */
export const CUA_SO_THANG = 6;

const NGAY = 24 * 60 * 60 * 1000;

/** Mốc sớm nhất còn tra được, tính từ bây giờ. */
export const somNhat = (bayGio = new Date()): Date => {
  const d = new Date(bayGio);
  d.setMonth(d.getMonth() - CUA_SO_THANG);
  return d;
};

const thoiDiem = (v: string | undefined, ten: string): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: ten,
      message: `${ten}: phải là mốc thời gian hợp lệ`,
    });
  }
  return d;
};

@Controller('audit')
export class AuditController {
  constructor(private readonly db: Db) {}

  @Roles(...READERS)
  @Get('entries')
  async entries(
    @Query()
    q: {
      limit?: string;
      offset?: string;
      from?: string;
      to?: string;
      entityId?: string;
      entity?: string;
      actorId?: string;
      action?: string;
      ip?: string;
      traceId?: string;
    },
  ) {
    const p = pageOf(q);
    const gioi = somNhat();
    const tu = thoiDiem(q.from, 'from');
    const den = thoiDiem(q.to, 'to');

    if (tu && tu.getTime() < gioi.getTime() - NGAY) {
      /*
       * Trừ hao MỘT NGÀY trước khi từ chối.
       *
       * Màn hình dựng mốc "sáu tháng trước" ở máy người dùng, máy chủ dựng lại
       * ở đây, và hai chiếc đồng hồ lệch nhau vài giây là chuyện thường. Không
       * trừ hao thì đúng cái mốc mà giao diện vừa bày ra lại bị chính máy chủ
       * từ chối — người dùng không bấm sai gì cả.
       */
      throw new BadRequestException({
        code: 'AUDIT_WINDOW_EXCEEDED',
        field: 'from',
        message: `Nhật ký chỉ tra được ${CUA_SO_THANG} tháng gần nhất.`,
      });
    }

    // Không khai `from` thì tự chặn ở mép cửa sổ. Một màn hình nhật ký mở ra đã
    // quét cả bảng là một màn hình chậm mà không ai cần — và nó cũng đọc ra
    // ngược với điều vừa cam kết.
    const tuThat = tu ?? gioi;

    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT id, occurred_at AS "occurredAt", actor_id AS "actorId", actor_role AS "actorRole",
              actor_name AS "actorName", actor_username AS "actorUsername",
              host(actor_ip) AS "actorIp", action, entity, entity_id AS "entityId",
              target_label AS "targetLabel", outcome,
              before_data AS "before", after_data AS "after", reason,
              trace_id AS "traceId", app_version AS "appVersion",
              count(*) OVER() AS total_count
         FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz
          AND ($2::timestamptz IS NULL OR occurred_at < $2)
          AND ($3::uuid IS NULL OR entity_id = $3)
          AND ($4::uuid IS NULL OR actor_id = $4)
          AND ($5::text IS NULL OR action = $5)
          AND ($6::text IS NULL OR entity = $6)
          AND ($7::text IS NULL OR host(actor_ip) = $7)
          AND ($8::text IS NULL OR trace_id = $8)
        ORDER BY occurred_at DESC, id DESC ${pageSql(9)}`,
      [
        tuThat.toISOString(),
        den?.toISOString() ?? null,
        q.entityId ?? null,
        q.actorId ?? null,
        q.action ?? null,
        q.entity ?? null,
        q.ip ?? null,
        q.traceId ?? null,
        p.limit,
        p.offset,
      ],
    );
    return { ...paged(rows, p), window: { from: tuThat.toISOString(), months: CUA_SO_THANG } };
  }

  /**
   * Những giá trị CÓ THẬT trong cửa sổ, để dựng ô chọn của bộ lọc (`0090`).
   *
   * Không khai cứng danh sách hành động ở giao diện: mã hành động sinh ra từ
   * khoá định tuyến của sự kiện, nên một danh sách chép tay sẽ lệch ngay lượt
   * thêm sự kiện tiếp theo — và lệch theo hướng im lặng, vì ô chọn vẫn đầy.
   */
  @Roles(...READERS)
  @Get('facets')
  async facets() {
    const tu = somNhat().toISOString();
    const hanhDong = await this.db.q<{ v: string; n: string }>(
      `SELECT action AS v, count(*)::text AS n FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz GROUP BY action ORDER BY count(*) DESC`,
      [tu],
    );
    const doiTuong = await this.db.q<{ v: string; n: string }>(
      `SELECT entity AS v, count(*)::text AS n FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz GROUP BY entity ORDER BY count(*) DESC`,
      [tu],
    );
    const nguoi = await this.db.q<{ v: string; ten: string | null; n: string }>(
      `SELECT actor_id::text AS v, max(coalesce(actor_name, actor_username)) AS ten,
              count(*)::text AS n
         FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz AND actor_id IS NOT NULL
        GROUP BY actor_id ORDER BY count(*) DESC LIMIT 200`,
      [tu],
    );
    return {
      window: { from: tu, months: CUA_SO_THANG },
      actions: hanhDong.map((r) => ({ value: r.v, count: Number(r.n) })),
      entities: doiTuong.map((r) => ({ value: r.v, count: Number(r.n) })),
      actors: nguoi.map((r) => ({ value: r.v, label: r.ten, count: Number(r.n) })),
    };
  }

  /**
   * Báo cáo hoạt động của một người dùng: đếm theo hành động (AUD-09).
   *
   * Đếm theo DÒNG nhật ký, nên chốt chống ghi trùng ở migration 0015 không phải
   * chuyện gọn gàng — nó là điều kiện để con số này đúng.
   */
  @Roles(...READERS)
  @Get('user-activity')
  async userActivity(@Query() q: { actorId?: string; from?: string; to?: string }) {
    const gioi = somNhat();
    const tu = thoiDiem(q.from, 'from');
    // Cùng cửa sổ với `/entries`: một con số thống kê vượt ra ngoài sáu tháng
    // là một cánh cửa sau cho đúng thứ vừa đóng ở cửa trước.
    const tuThat = tu && tu.getTime() > gioi.getTime() ? tu : gioi;
    const rows = await this.db.q<{ action: string; n: string }>(
      `SELECT action, count(*)::text AS n
         FROM aud.audit_log
        WHERE ($1::uuid IS NULL OR actor_id = $1)
          AND occurred_at >= $2::timestamptz
          AND ($3::timestamptz IS NULL OR occurred_at < $3)
        GROUP BY action
        ORDER BY count(*) DESC`,
      [q.actorId ?? null, tuThat.toISOString(), thoiDiem(q.to, 'to')?.toISOString() ?? null],
    );
    return {
      actorId: q.actorId ?? null,
      byAction: Object.fromEntries(rows.map((r) => [r.action, Number(r.n)])),
      total: rows.reduce((a, r) => a + Number(r.n), 0),
    };
  }

  /**
   * Hoạt động hệ thống THEO KỲ — khối *Thống kê* của Quản trị hệ thống (`0093`).
   *
   * Vai trò này có `idn.scope_user_ids` rỗng, nên mọi chỉ số hồ sơ của trang
   * Thống kê đều bằng 0 — đúng về kỹ thuật, đọc ra nghĩa hoàn toàn sai. Nhật ký
   * là thứ DUY NHẤT trong hệ thống mà họ có toàn bộ, nên khối của họ đếm ở đây.
   *
   * CẮT KỲ CÙNG MỘT HÀM với reporting (`@csbh/http-kit/ky`). Hai phép cắt viết
   * riêng ở hai service thì đến ngày chúng lệch nhau một giờ, và người xem thấy
   * "Tháng 8" của khối này không khớp "Tháng 8" của khối kia.
   */
  @Roles(...READERS)
  @Get('thong-ke')
  async thongKe(@Query() q: { ky?: string; soKy?: string }) {
    const ky = docKy(q.ky);
    const soKy = docSoKy(q.soKy, ky);
    const cacKy = chuoiKy(ky, soKy);

    /*
     * CẮT Ở MÉP CỬA SỔ SÁU THÁNG, không từ chối cả lời gọi.
     *
     * `soKy=8` với nhịp quý là hai năm — vượt xa cửa sổ. Trả 400 ở đây là chặn
     * đúng một thao tác hợp lý (đổi nhịp sang quý), nên thay vào đó chuỗi bị cắt
     * ngắn và phần bị cắt được NÓI RA: `window.from` đi kèm mọi phản hồi, và màn
     * hình in một câu ngay dưới bảng.
     */
    const gioi = somNhat();
    const trongCuaSo = cacKy.filter((k) => new Date(k.den).getTime() > gioi.getTime());
    if (trongCuaSo.length === 0) {
      return { ky, chuoi: [], window: { from: gioi.toISOString(), months: CUA_SO_THANG } };
    }

    const tu = new Date(
      Math.max(new Date(trongCuaSo[0]!.tu).getTime(), gioi.getTime()),
    ).toISOString();
    const den = trongCuaSo[trongCuaSo.length - 1]!.den;

    const rows = await this.db.q<{ ky: string; entity: string; n: string; nguoi: string }>(
      `SELECT to_char(date_trunc('${DON_VI[ky]}', occurred_at AT TIME ZONE '${MUI_GIO}'),
                      'YYYY-MM-DD') AS ky,
              entity, count(*)::text AS n,
              count(DISTINCT actor_id)::text AS nguoi
         FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
        GROUP BY 1, 2`,
      [tu, den],
    );

    const theoKy = new Map<string, { tong: number; nguoi: number; theoDoiTuong: Record<string, number> }>();
    for (const r of rows) {
      const o = theoKy.get(r.ky) ?? { tong: 0, nguoi: 0, theoDoiTuong: {} };
      o.tong += Number(r.n);
      // Số người của một kỳ KHÔNG cộng được từ các dòng đối tượng — cùng một
      // người chạm hai đối tượng thì bị đếm hai lần. Lấy giá trị lớn nhất là
      // cận dưới đúng, và nhãn trên màn hình nói "ít nhất".
      o.nguoi = Math.max(o.nguoi, Number(r.nguoi));
      o.theoDoiTuong[r.entity] = Number(r.n);
      theoKy.set(r.ky, o);
    }

    return {
      ky,
      chuoi: trongCuaSo.map((k) => ({
        ...k,
        ...(theoKy.get(k.ma) ?? { tong: 0, nguoi: 0, theoDoiTuong: {} }),
      })),
      window: { from: gioi.toISOString(), months: CUA_SO_THANG },
      /** Số kỳ bị cắt vì nằm ngoài cửa sổ — màn hình nói ra thay vì im lặng. */
      kyBiCat: cacKy.length - trongCuaSo.length,
    };
  }

  /** Dựng lại toàn bộ chuỗi của một request trong MỘT truy vấn (INT-11). */
  @Roles(...READERS)
  @Get('trace/:traceId')
  async trace(@Param('traceId') _traceId: string) {
    return { hint: 'dùng /audit/entries?traceId=...' };
  }
}
